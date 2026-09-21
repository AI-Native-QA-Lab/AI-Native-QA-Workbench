import { randomUUID } from "node:crypto";

import {
  validateQualitySnapshot,
  type Diagnostic,
  type QualitySnapshot,
  type ValidationResult,
} from "@ai-native-qa-workbench/domain";
import type { ProjectStore, StoreDiagnostic } from "@ai-native-qa-workbench/project-store";

export type ProposalEntityType =
  | "requirement"
  | "acceptanceCriterion"
  | "qualityRisk"
  | "testObligation"
  | "testCase"
  | "traceLink";

export type QualityOperation =
  | { kind: "create"; entityType: ProposalEntityType; entity: unknown }
  | { kind: "update"; entityType: ProposalEntityType; id: string; entity: unknown }
  | { kind: "delete"; entityType: ProposalEntityType; id: string };

export type ProposalStatus =
  "proposed" | "approved" | "rejected" | "partially-approved" | "applied";

export interface HumanReview {
  reviewer: string;
  decision: "approve" | "reject" | "partial";
  approvedOperationIndexes?: number[];
}

export interface ChangeProposal {
  id: string;
  baseRevision: string;
  operations: QualityOperation[];
  status: ProposalStatus;
  review?: HumanReview;
}

export interface ApplyProposalResult {
  applied: boolean;
  proposal: ChangeProposal;
  snapshot?: QualitySnapshot;
  revision?: string;
  diagnostics: readonly (Diagnostic | StoreDiagnostic)[];
}

const collectionFor: Record<ProposalEntityType, keyof QualitySnapshot> = {
  requirement: "requirements",
  acceptanceCriterion: "acceptanceCriteria",
  qualityRisk: "qualityRisks",
  testObligation: "testObligations",
  testCase: "testCases",
  traceLink: "traceLinks",
};

const proposalEntityTypes = new Set<ProposalEntityType>([
  "requirement",
  "acceptanceCriterion",
  "qualityRisk",
  "testObligation",
  "testCase",
  "traceLink",
]);

function diagnostic(code: Diagnostic["code"], path: string, message: string): Diagnostic {
  return { code, message, path, severity: "error" };
}

function operationId(operation: QualityOperation): string | undefined {
  if (operation.kind === "create") {
    if (operation.entity === null || typeof operation.entity !== "object") return undefined;
    const id = (operation.entity as { id?: unknown }).id;
    return typeof id === "string" ? id : undefined;
  }
  return operation.id;
}

function entityExists(
  snapshot: QualitySnapshot,
  entityType: ProposalEntityType,
  id: string,
): boolean {
  const collection = snapshot[collectionFor[entityType]];
  return Array.isArray(collection)
    ? collection.some(
        (entity) =>
          entity !== null && typeof entity === "object" && "id" in entity && entity.id === id,
      )
    : false;
}

export function createProposal(
  _snapshot: QualitySnapshot,
  operations: QualityOperation[],
  baseRevision: string,
  id = `proposal-${randomUUID()}`,
): ChangeProposal {
  return {
    id,
    baseRevision,
    operations: structuredClone(operations),
    status: "proposed",
  };
}

export function validateChangeProposal(
  proposal: ChangeProposal,
  snapshot?: QualitySnapshot,
): ValidationResult {
  const candidate = (proposal ?? {}) as Partial<ChangeProposal>;
  const diagnostics: Diagnostic[] = [];

  if (!Array.isArray(candidate.operations) || candidate.operations.length === 0) {
    diagnostics.push(
      diagnostic(
        "PROPOSAL_EMPTY_OPERATIONS",
        "operations",
        "Proposal must contain at least one operation.",
      ),
    );
  }
  if (typeof candidate.baseRevision !== "string" || candidate.baseRevision.length === 0) {
    diagnostics.push(
      diagnostic(
        "PROPOSAL_BASE_REVISION_STALE",
        "baseRevision",
        "Proposal base revision is required.",
      ),
    );
  }
  if (
    candidate.status !== "proposed" &&
    candidate.status !== "approved" &&
    candidate.status !== "rejected" &&
    candidate.status !== "partially-approved" &&
    candidate.status !== "applied"
  ) {
    diagnostics.push(
      diagnostic("PROPOSAL_INVALID_STATUS", "status", "Proposal status is invalid."),
    );
  }
  const review =
    candidate.review !== null && typeof candidate.review === "object"
      ? (candidate.review as Partial<HumanReview>)
      : undefined;
  if (
    (candidate.status === "approved" ||
      candidate.status === "partially-approved" ||
      candidate.status === "applied") &&
    (!review || typeof review.reviewer !== "string" || review.reviewer.trim().length === 0)
  ) {
    diagnostics.push(
      diagnostic(
        "PROPOSAL_REVIEW_REQUIRED",
        "review",
        "A human review is required before approval or apply.",
      ),
    );
  }
  if (review && typeof review.reviewer === "string" && review.reviewer.trim().length > 0) {
    if (candidate.status === "approved" && review.decision !== "approve") {
      diagnostics.push(
        diagnostic(
          "PROPOSAL_REVIEW_OPERATION_INVALID",
          "review.decision",
          "Approved proposals require an approve review decision.",
        ),
      );
    }
    if (candidate.status === "rejected" && review.decision !== "reject") {
      diagnostics.push(
        diagnostic(
          "PROPOSAL_REVIEW_OPERATION_INVALID",
          "review.decision",
          "Rejected proposals require a reject review decision.",
        ),
      );
    }
    if (candidate.status === "partially-approved") {
      const indexes = review.approvedOperationIndexes;
      if (review.decision !== "partial") {
        diagnostics.push(
          diagnostic(
            "PROPOSAL_REVIEW_OPERATION_INVALID",
            "review.decision",
            "Partially-approved proposals require a partial review decision.",
          ),
        );
      }
      if (!Array.isArray(indexes) || indexes.length === 0) {
        diagnostics.push(
          diagnostic(
            "PROPOSAL_REVIEW_OPERATION_INVALID",
            "review.approvedOperationIndexes",
            "Partial review must approve at least one operation.",
          ),
        );
      } else if (
        indexes.some(
          (index) =>
            !Number.isInteger(index) || index < 0 || index >= (candidate.operations?.length ?? 0),
        )
      ) {
        diagnostics.push(
          diagnostic(
            "PROPOSAL_REVIEW_OPERATION_INVALID",
            "review.approvedOperationIndexes",
            "Partial review contains an invalid operation index.",
          ),
        );
      } else if (new Set(indexes).size !== indexes.length) {
        diagnostics.push(
          diagnostic(
            "PROPOSAL_REVIEW_OPERATION_INVALID",
            "review.approvedOperationIndexes",
            "Partial review contains a duplicate operation index.",
          ),
        );
      }
    }
  }

  const seenCreates = new Set<string>();
  for (const [index, operation] of (Array.isArray(candidate.operations)
    ? candidate.operations
    : []
  ).entries()) {
    const path = `operations[${index}]`;
    if (operation === null || typeof operation !== "object") {
      diagnostics.push(diagnostic("PROPOSAL_ENTITY_INVALID", path, "Operation must be an object."));
      continue;
    }
    if (operation.kind !== "create" && operation.kind !== "update" && operation.kind !== "delete") {
      diagnostics.push(
        diagnostic("PROPOSAL_ENTITY_INVALID", `${path}.kind`, "Operation kind is invalid."),
      );
      continue;
    }
    if (!proposalEntityTypes.has(operation.entityType)) {
      diagnostics.push(
        diagnostic(
          "PROPOSAL_ENTITY_TYPE_INVALID",
          `${path}.entityType`,
          "Operation entity type is invalid.",
        ),
      );
      continue;
    }

    const id = operationId(operation);
    if (!id) {
      diagnostics.push(
        diagnostic(
          "PROPOSAL_OPERATION_ID_REQUIRED",
          `${path}.${operation.kind === "create" ? "entity.id" : "id"}`,
          "Operation entity id is required.",
        ),
      );
    }

    if (operation.kind === "create") {
      if (id) {
        const createKey = `${operation.entityType}:${id}`;
        if (seenCreates.has(createKey)) {
          diagnostics.push(
            diagnostic(
              "PROPOSAL_DUPLICATE_CREATE",
              path,
              "The same entity is created more than once.",
            ),
          );
        } else {
          seenCreates.add(createKey);
        }
        if (snapshot && entityExists(snapshot, operation.entityType, id)) {
          diagnostics.push(
            diagnostic(
              "PROPOSAL_DUPLICATE_CREATE",
              path,
              "The entity already exists in the current snapshot.",
            ),
          );
        }
      }
    } else if (id && snapshot && !entityExists(snapshot, operation.entityType, id)) {
      diagnostics.push(
        diagnostic(
          "PROPOSAL_TARGET_NOT_FOUND",
          `${path}.${operation.kind === "delete" ? "id" : "id"}`,
          "Update or delete target does not exist.",
        ),
      );
    }
  }

  if (snapshot && diagnostics.length === 0) {
    const preview = structuredClone(snapshot);
    for (const operation of candidate.operations ?? []) {
      if (operation.kind === "create") {
        const collection = preview[collectionFor[operation.entityType]] as unknown[];
        collection.push(structuredClone(operation.entity));
        continue;
      }
      const collection = preview[collectionFor[operation.entityType]] as Array<{ id?: string }>;
      const targetIndex = collection.findIndex((entity) => entity.id === operation.id);
      if (targetIndex < 0) continue;
      if (operation.kind === "update")
        collection[targetIndex] = structuredClone(operation.entity) as { id?: string };
      if (operation.kind === "delete") collection.splice(targetIndex, 1);
    }
    const previewValidation = validateQualitySnapshot(preview);
    diagnostics.push(
      ...previewValidation.diagnostics.map((item) =>
        diagnostic(
          "PROPOSAL_ENTITY_INVALID",
          "operations",
          `Resulting snapshot is invalid: ${item.path}`,
        ),
      ),
    );
  }

  return { valid: diagnostics.length === 0, diagnostics };
}

export function reviewProposal(proposal: ChangeProposal, review: HumanReview): ChangeProposal {
  if (typeof review.reviewer !== "string" || review.reviewer.trim().length === 0) {
    throw new Error("Reviewer is required.");
  }
  if (review.decision === "partial") {
    const indexes = review.approvedOperationIndexes ?? [];
    if (indexes.length === 0) {
      throw new Error("Partial review must approve at least one operation.");
    }
    if (indexes.some((index) => index < 0 || index >= proposal.operations.length)) {
      throw new Error("Partial review contains an invalid operation index.");
    }
    if (indexes.some((index) => !Number.isInteger(index))) {
      throw new Error("Partial review contains an invalid operation index.");
    }
    if (new Set(indexes).size !== indexes.length) {
      throw new Error("Partial review contains a duplicate operation index.");
    }
  }

  const status: ProposalStatus =
    review.decision === "approve"
      ? "approved"
      : review.decision === "reject"
        ? "rejected"
        : "partially-approved";
  return { ...proposal, status, review: structuredClone(review) };
}

function applyOperation(snapshot: QualitySnapshot, operation: QualityOperation): void {
  const collectionKey = collectionFor[operation.entityType];
  const collection = snapshot[collectionKey] as Array<{ id?: string }>;

  if (operation.kind === "create") {
    collection.push(structuredClone(operation.entity) as { id?: string });
    return;
  }
  const index = collection.findIndex((entity) => entity.id === operation.id);
  if (index < 0) throw new Error(`Proposal target not found: ${operation.id}`);
  if (operation.kind === "update")
    collection[index] = structuredClone(operation.entity) as { id?: string };
  if (operation.kind === "delete") collection.splice(index, 1);
}

export async function applyApprovedProposal(
  store: ProjectStore,
  rootDirectory: string,
  proposal: ChangeProposal,
): Promise<ApplyProposalResult> {
  const current = await store.readQuality(rootDirectory);
  if (!current.valid || !current.projectQuality || !current.revision) {
    return { applied: false, proposal, diagnostics: current.diagnostics };
  }
  if (current.revision !== proposal.baseRevision) {
    return {
      applied: false,
      proposal,
      diagnostics: [
        diagnostic(
          "PROPOSAL_BASE_REVISION_STALE",
          "baseRevision",
          "Proposal base revision is stale.",
        ),
      ],
    };
  }
  if (proposal.status === "rejected") {
    return {
      applied: false,
      proposal,
      diagnostics: [
        diagnostic("PROPOSAL_REJECTED", "status", "Rejected proposals cannot be applied."),
      ],
    };
  }
  if (
    (proposal.status !== "approved" && proposal.status !== "partially-approved") ||
    !proposal.review ||
    proposal.review.reviewer.trim().length === 0
  ) {
    return {
      applied: false,
      proposal,
      diagnostics: [
        diagnostic(
          "PROPOSAL_NOT_APPROVED",
          "status",
          "Proposal requires explicit human approval before apply.",
        ),
      ],
    };
  }

  const validation = validateChangeProposal(proposal, current.projectQuality);
  if (!validation.valid) return { applied: false, proposal, diagnostics: validation.diagnostics };

  const next = structuredClone(current.projectQuality);
  const approvedIndexes =
    proposal.status === "partially-approved"
      ? new Set(proposal.review.approvedOperationIndexes ?? [])
      : undefined;
  proposal.operations.forEach((operation, index) => {
    if (!approvedIndexes || approvedIndexes.has(index)) applyOperation(next, operation);
  });

  const nextValidation = validateQualitySnapshot(next);
  if (!nextValidation.valid)
    return { applied: false, proposal, diagnostics: nextValidation.diagnostics };

  const written = await store.writeQuality(rootDirectory, next);
  if (!written.written || !written.revision) {
    return { applied: false, proposal, diagnostics: written.diagnostics };
  }
  return {
    applied: true,
    proposal: { ...proposal, status: "applied" },
    snapshot: next,
    revision: written.revision,
    diagnostics: [],
  };
}
