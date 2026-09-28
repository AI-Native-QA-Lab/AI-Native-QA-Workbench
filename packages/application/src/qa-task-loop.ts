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
  proposal: AppliedChangeProposal;
  completion: CompletionResult;
  events: QualityTaskEvent[];
  diagnostics: readonly (Diagnostic | StoreDiagnostic)[];
}

interface AppliedChangeProposal extends ChangeProposal {
  /** Derived before the applied snapshot can hide deleted entities. */
  affectedRequirementIds?: string[];
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
    const affectedRequirementIds = requirementIdsFor(
      reviewed,
      current.projectQuality,
      applied.snapshot,
    );
    const appliedProposal: AppliedChangeProposal = {
      ...applied.proposal,
      affectedRequirementIds,
    };
    const completion = completionFor(snapshot, requirementIdFor(appliedProposal));
    const publicationDiagnostics = await this.publishProposalApplied(
      input.rootDirectory,
      applied.revision ?? reloaded.revision ?? "",
      appliedProposal,
      snapshot,
    );
    events.push({ phase: completion.complete ? "complete" : "blocked" });
    return {
      phase: completion.complete ? "complete" : "blocked",
      applied: true,
      proposal: appliedProposal,
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
    if (!this.publisher) return [];
    const requirementIds = requirementIdsForAppliedProposal(proposal, snapshot);
    if (requirementIds.length === 0) {
      return [
        diagnostic(
          "QUALITY_ENGINEERING_WORKFLOW_FAILED",
          "event.payload.requirementIds",
          "An applied proposal must resolve to at least one affected Requirement.",
        ),
      ];
    }
    const occurredAt = new Date().toISOString();
    try {
      for (const requirementId of requirementIds) {
        await this.publisher.publish({
          id: `event-quality-proposal-applied-${qualityRevision || "unknown"}-${requirementId}`,
          schemaVersion: "0.3",
          type: "quality.proposal.applied",
          aggregateType: "quality",
          aggregateId: requirementId,
          occurredAt,
          source: "application",
          payload: {
            projectRoot: rootDirectory,
            qualityRevision,
            requirementIds: [requirementId],
          },
        });
      }
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

function requirementIdsForAppliedProposal(
  proposal: ChangeProposal,
  snapshot: QualitySnapshot,
): string[] {
  const stored = (proposal as AppliedChangeProposal).affectedRequirementIds;
  if (Array.isArray(stored)) {
    return [
      ...new Set(stored.filter((id): id is string => typeof id === "string" && id.length > 0)),
    ];
  }
  return requirementIdsFor(proposal, snapshot, snapshot);
}

type TraceEntityType =
  | "requirement"
  | "acceptance-criterion"
  | "quality-risk"
  | "test-obligation"
  | "test-case"
  | "trace-link";

function requirementIdsFor(
  proposal: ChangeProposal,
  before: QualitySnapshot,
  after: QualitySnapshot,
): string[] {
  const ids = new Set<string>();
  const approvedIndexes =
    proposal.status === "partially-approved"
      ? new Set(proposal.review?.approvedOperationIndexes ?? [])
      : undefined;

  for (const [index, operation] of proposal.operations.entries()) {
    if (approvedIndexes && !approvedIndexes.has(index)) continue;
    const operationType = traceEntityTypeFor(operation.entityType);
    if (!operationType) continue;

    if (operation.kind === "create" || operation.kind === "update") {
      collectEntityRequirements(operationType, operation.entity, before, ids);
      collectEntityRequirements(operationType, operation.entity, after, ids);
    }
    if (operation.kind === "update" || operation.kind === "delete") {
      collectEntityRequirements(
        operationType,
        entityFor(before, operation.entityType, operation.id),
        before,
        ids,
      );
      collectEntityRequirements(
        operationType,
        entityFor(after, operation.entityType, operation.id),
        after,
        ids,
      );
      if (operation.entityType === "requirement") ids.add(operation.id);
    }
  }
  return [...ids];
}

function traceEntityTypeFor(entityType: string): TraceEntityType | undefined {
  const types: Record<string, TraceEntityType> = {
    requirement: "requirement",
    acceptanceCriterion: "acceptance-criterion",
    "acceptance-criterion": "acceptance-criterion",
    qualityRisk: "quality-risk",
    "quality-risk": "quality-risk",
    testObligation: "test-obligation",
    "test-obligation": "test-obligation",
    testCase: "test-case",
    "test-case": "test-case",
    traceLink: "trace-link",
    "trace-link": "trace-link",
  };
  return types[entityType];
}

function entityFor(snapshot: QualitySnapshot, entityType: string, id: string): unknown {
  const collections: Record<string, readonly { id: string }[]> = {
    requirement: snapshot.requirements,
    acceptanceCriterion: snapshot.acceptanceCriteria,
    qualityRisk: snapshot.qualityRisks,
    testObligation: snapshot.testObligations,
    testCase: snapshot.testCases,
    traceLink: snapshot.traceLinks,
  };
  return collections[entityType]?.find((item) => item.id === id);
}

function collectEntityRequirements(
  entityType: TraceEntityType,
  entity: unknown,
  snapshot: QualitySnapshot,
  ids: Set<string>,
  visited = new Set<string>(),
): void {
  if (entity === null || typeof entity !== "object") return;
  const value = entity as Record<string, unknown>;
  const entityId = typeof value.id === "string" ? value.id : "unknown";
  const visitKey = `${entityType}:${entityId}`;
  if (visited.has(visitKey)) return;
  visited.add(visitKey);

  if (entityType === "requirement") {
    if (typeof value.id === "string") ids.add(value.id);
    return;
  }
  if (entityType === "acceptance-criterion" || entityType === "quality-risk") {
    if (typeof value.requirementId === "string") ids.add(value.requirementId);
    return;
  }
  if (entityType === "test-obligation") {
    if (typeof value.riskId === "string") {
      collectEntityRequirements(
        "quality-risk",
        entityFor(snapshot, "qualityRisk", value.riskId),
        snapshot,
        ids,
        visited,
      );
    }
    return;
  }
  if (entityType === "test-case") {
    if (typeof value.obligationId === "string") {
      collectEntityRequirements(
        "test-obligation",
        entityFor(snapshot, "testObligation", value.obligationId),
        snapshot,
        ids,
        visited,
      );
    }
    return;
  }
  for (const endpoint of ["from", "to"] as const) {
    const endpointType = traceEntityTypeFor(String(value[`${endpoint}Type`] ?? ""));
    const endpointId = value[`${endpoint}Id`];
    if (endpointType && typeof endpointId === "string") {
      collectEntityRequirements(
        endpointType,
        entityFor(snapshot, proposalEntityTypeFor(endpointType), endpointId),
        snapshot,
        ids,
        visited,
      );
      if (endpointType === "requirement") ids.add(endpointId);
    }
  }
}

function proposalEntityTypeFor(entityType: TraceEntityType): string {
  const types: Record<TraceEntityType, string> = {
    requirement: "requirement",
    "acceptance-criterion": "acceptanceCriterion",
    "quality-risk": "qualityRisk",
    "test-obligation": "testObligation",
    "test-case": "testCase",
    "trace-link": "traceLink",
  };
  return types[entityType];
}

function requirementIdFor(proposal: ChangeProposal): string {
  const stored = (proposal as AppliedChangeProposal).affectedRequirementIds;
  if (Array.isArray(stored) && typeof stored[0] === "string") return stored[0];
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
