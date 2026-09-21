import {
  validateQualitySnapshot,
  type Diagnostic,
  type ProjectLocale,
  type QualitySnapshot,
} from "@ai-native-qa-workbench/domain";
import type { ProjectStore, StoreDiagnostic } from "@ai-native-qa-workbench/project-store";

import {
  applyApprovedProposal,
  reviewProposal,
  validateChangeProposal,
  type ChangeProposal,
  type HumanReview,
} from "./proposals.js";
import {
  runRequirementAnalysis,
  type RequirementAnalysisProvider,
} from "./requirement-analysis.js";

export type QualityTaskPhase =
  | "context"
  | "analyze"
  | "propose"
  | "validate"
  | "review"
  | "apply"
  | "re-evaluate"
  | "complete"
  | "review-rejected"
  | "blocked";

export interface QualityTaskEvent {
  phase: QualityTaskPhase;
}

export interface CompletionResult {
  complete: boolean;
  requirementId: string;
  reason: string;
  counts: {
    acceptanceCriteria: number;
    qualityRisks: number;
    testObligations: number;
    testCases: number;
    traceLinks: number;
  };
}

export interface QualityTaskResult {
  phase: QualityTaskPhase;
  applied: boolean;
  proposal: ChangeProposal;
  completion: CompletionResult;
  events: QualityTaskEvent[];
  diagnostics: readonly (Diagnostic | StoreDiagnostic)[];
}

interface ProposeInput {
  rootDirectory: string;
  requirementId: string;
  outputLocale: ProjectLocale;
}

export class QualityTaskLoop {
  private readonly store: ProjectStore;
  private readonly provider: RequirementAnalysisProvider;

  constructor(input: { store: ProjectStore; provider: RequirementAnalysisProvider }) {
    this.store = input.store;
    this.provider = input.provider;
  }

  async propose(input: ProposeInput): Promise<QualityTaskResult> {
    const events: QualityTaskEvent[] = [{ phase: "context" }];
    const current = await this.store.readQuality(input.rootDirectory);
    if (!current.valid || !current.projectQuality || !current.revision) {
      throw new Error("Unable to load a valid project quality snapshot.");
    }
    events.push({ phase: "analyze" });
    const proposal = await runRequirementAnalysis(
      {
        snapshot: current.projectQuality,
        requirementId: input.requirementId,
        baseRevision: current.revision,
        outputLocale: input.outputLocale,
      },
      this.provider,
    );
    events.push({ phase: "propose" });
    events.push({ phase: "validate" });
    const validation = validateChangeProposal(proposal, current.projectQuality);
    if (!validation.valid) {
      const completion = completionFor(current.projectQuality, input.requirementId);
      return {
        phase: "blocked",
        applied: false,
        proposal,
        completion,
        events,
        diagnostics: validation.diagnostics,
      };
    }
    events.push({ phase: "review" });
    return {
      phase: "review",
      applied: false,
      proposal,
      completion: completionFor(current.projectQuality, input.requirementId),
      events,
      diagnostics: [],
    };
  }

  async decide(input: {
    rootDirectory: string;
    proposal: ChangeProposal;
    reviewer: string;
    decision: HumanReview["decision"];
    approvedOperationIndexes?: number[];
  }): Promise<QualityTaskResult> {
    const current = await this.store.readQuality(input.rootDirectory);
    if (!current.valid || !current.projectQuality) {
      throw new Error("Unable to load a valid project quality snapshot.");
    }
    const reviewed = reviewProposal(input.proposal, {
      reviewer: input.reviewer,
      decision: input.decision,
      ...(input.approvedOperationIndexes
        ? { approvedOperationIndexes: input.approvedOperationIndexes }
        : {}),
    });
    const events: QualityTaskEvent[] = [{ phase: "review" }];
    if (reviewed.status === "rejected") {
      return {
        phase: "review-rejected",
        applied: false,
        proposal: reviewed,
        completion: completionFor(current.projectQuality, requirementIdFor(reviewed)),
        events,
        diagnostics: [],
      };
    }
    events.push({ phase: "apply" });
    const applied = await applyApprovedProposal(this.store, input.rootDirectory, reviewed);
    if (!applied.applied || !applied.snapshot) {
      return {
        phase: "blocked",
        applied: false,
        proposal: reviewed,
        completion: completionFor(current.projectQuality, requirementIdFor(reviewed)),
        events,
        diagnostics: applied.diagnostics,
      };
    }
    events.push({ phase: "re-evaluate" });
    const reloaded = await this.store.readQuality(input.rootDirectory);
    const snapshot = reloaded.projectQuality ?? applied.snapshot;
    const completion = completionFor(snapshot, requirementIdFor(reviewed));
    events.push({ phase: completion.complete ? "complete" : "blocked" });
    return {
      phase: completion.complete ? "complete" : "blocked",
      applied: true,
      proposal: applied.proposal,
      completion,
      events,
      diagnostics: [],
    };
  }
}

function requirementIdFor(proposal: ChangeProposal): string {
  const operation = proposal.operations.find(
    (item) => item.kind === "create" && item.entityType === "acceptanceCriterion",
  );
  if (
    operation &&
    operation.kind === "create" &&
    operation.entity !== null &&
    typeof operation.entity === "object"
  ) {
    const requirementId = (operation.entity as { requirementId?: unknown }).requirementId;
    if (typeof requirementId === "string") return requirementId;
  }
  return "unknown";
}

export function completionFor(snapshot: QualitySnapshot, requirementId: string): CompletionResult {
  const valid = validateQualitySnapshot(snapshot).valid;
  const counts = {
    acceptanceCriteria: snapshot.acceptanceCriteria.filter(
      (item) => item.requirementId === requirementId,
    ).length,
    qualityRisks: snapshot.qualityRisks.filter((item) => item.requirementId === requirementId)
      .length,
    testObligations: snapshot.testObligations.filter((item) =>
      snapshot.qualityRisks.some(
        (risk) => risk.id === item.riskId && risk.requirementId === requirementId,
      ),
    ).length,
    testCases: snapshot.testCases.filter((item) =>
      snapshot.testObligations.some(
        (obligation) =>
          obligation.id === item.obligationId &&
          snapshot.qualityRisks.some(
            (risk) => risk.id === obligation.riskId && risk.requirementId === requirementId,
          ),
      ),
    ).length,
    traceLinks: snapshot.traceLinks.filter(
      (link) => link.toId === requirementId || link.fromId === requirementId,
    ).length,
  };
  const complete =
    valid &&
    counts.acceptanceCriteria > 0 &&
    counts.qualityRisks > 0 &&
    counts.testObligations > 0 &&
    counts.testCases > 0;
  return {
    complete,
    requirementId,
    reason: complete
      ? "All required quality collections are present."
      : "Required quality collections are incomplete.",
    counts,
  };
}
