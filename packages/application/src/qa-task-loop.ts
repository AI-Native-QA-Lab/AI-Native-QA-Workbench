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
import type { DomainEventPublisher } from "./domain-event-publisher.js";

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

function diagnostic(code: StoreDiagnostic["code"], path: string, message: string): StoreDiagnostic {
  return { code, path, message, severity: "error" };
}

export class QualityTaskLoop {
  private readonly store: ProjectStore;
  private readonly provider: RequirementAnalysisProvider;
  private readonly publisher: DomainEventPublisher | undefined;

  constructor(input: {
    store: ProjectStore;
    provider: RequirementAnalysisProvider;
    publisher?: DomainEventPublisher;
  }) {
    this.store = input.store;
    this.provider = input.provider;
    this.publisher = input.publisher;
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
    const events: QualityTaskEvent[] = [{ phase: "review" }];
    if (input.proposal.status === "applied") {
      const completion = completionFor(current.projectQuality, requirementIdFor(input.proposal));
      const publicationDiagnostics = await this.publishProposalApplied(
        input.rootDirectory,
        current.revision ?? input.proposal.baseRevision,
        input.proposal,
        current.projectQuality,
      );
      events.push({ phase: "re-evaluate" });
      events.push({ phase: completion.complete ? "complete" : "blocked" });
      return {
        phase: completion.complete ? "complete" : "blocked",
        applied: true,
        proposal: input.proposal,
        completion,
        events,
        diagnostics: publicationDiagnostics,
      };
    }
    const reviewed = reviewProposal(input.proposal, {
      reviewer: input.reviewer,
      decision: input.decision,
      ...(input.approvedOperationIndexes
        ? { approvedOperationIndexes: input.approvedOperationIndexes }
        : {}),
    });
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
    const publicationDiagnostics = await this.publishProposalApplied(
      input.rootDirectory,
      applied.revision ?? reloaded.revision ?? "",
      applied.proposal,
      snapshot,
    );
    events.push({ phase: completion.complete ? "complete" : "blocked" });
    return {
      phase: completion.complete ? "complete" : "blocked",
      applied: true,
      proposal: applied.proposal,
      completion,
      events,
      diagnostics: publicationDiagnostics,
    };
  }

  private async publishProposalApplied(
    rootDirectory: string,
    qualityRevision: string,
    proposal: ChangeProposal,
    snapshot: QualitySnapshot,
  ): Promise<readonly StoreDiagnostic[]> {
    try {
      await this.publisher?.publish({
        id: `event-quality-proposal-applied-${qualityRevision || "unknown"}`,
        schemaVersion: "0.3",
        type: "quality.proposal.applied",
        aggregateType: "quality",
        aggregateId: requirementIdsFor(proposal, snapshot)[0] ?? "project",
        occurredAt: new Date().toISOString(),
        source: "application",
        payload: {
          projectRoot: rootDirectory,
          qualityRevision,
          requirementIds: requirementIdsFor(proposal, snapshot),
        },
      });
      return [];
    } catch (error) {
      return [
        diagnostic(
          "QUALITY_ENGINEERING_WORKFLOW_FAILED",
          "event",
          error instanceof Error ? error.message : String(error),
        ),
      ];
    }
  }
}

function requirementIdsFor(proposal: ChangeProposal, snapshot: QualitySnapshot): string[] {
  const ids = new Set<string>();
  for (const operation of proposal.operations) {
    if (operation.kind === "delete" || operation.kind === "update") {
      const collection =
        operation.entityType === "requirement"
          ? snapshot.requirements
          : operation.entityType === "acceptanceCriterion"
            ? snapshot.acceptanceCriteria
            : operation.entityType === "qualityRisk"
              ? snapshot.qualityRisks
              : [];
      const existing = collection.find((item) => item.id === operation.id);
      if (existing && "requirementId" in existing && typeof existing.requirementId === "string") {
        ids.add(existing.requirementId);
      } else if (operation.entityType === "requirement") {
        ids.add(operation.id);
      }
    }
    if (operation.kind === "create" || operation.kind === "update") {
      if (operation.entity !== null && typeof operation.entity === "object") {
        const requirementId = (operation.entity as { requirementId?: unknown }).requirementId;
        if (typeof requirementId === "string") ids.add(requirementId);
        if (operation.entityType === "requirement") {
          const id = (operation.entity as { id?: unknown }).id;
          if (typeof id === "string") ids.add(id);
        }
      }
    }
  }
  return [...ids];
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
