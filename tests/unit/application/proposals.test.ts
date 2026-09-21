import { describe, expect, it } from "vitest";

import {
  createProposal,
  reviewProposal,
  validateChangeProposal,
  type ChangeProposal,
} from "@ai-native-qa-workbench/application";
import { QUALITY_SCHEMA_VERSION, type QualitySnapshot } from "@ai-native-qa-workbench/domain";

function emptySnapshot(): QualitySnapshot {
  return {
    schemaVersion: QUALITY_SCHEMA_VERSION,
    requirements: [{ id: "checkout", title: "Checkout", description: "Checkout flow" }],
    acceptanceCriteria: [],
    qualityRisks: [],
    testObligations: [],
    testCases: [],
    traceLinks: [],
  };
}

describe("ChangeProposal", () => {
  it("creates a proposed operation and requires explicit human review", () => {
    const proposal = createProposal(
      emptySnapshot(),
      [
        {
          kind: "create",
          entityType: "acceptanceCriterion",
          entity: {
            id: "checkout-total",
            requirementId: "checkout",
            statement: "Total is calculated",
          },
        },
      ],
      "revision-1",
    );

    expect(proposal.status).toBe("proposed");
    expect(validateChangeProposal(proposal, emptySnapshot())).toEqual({
      valid: true,
      diagnostics: [],
    });
    expect(
      validateChangeProposal({ ...proposal, status: "approved" } as ChangeProposal).valid,
    ).toBe(false);
  });

  it("rejects duplicate creates, unknown targets, and empty proposals", () => {
    const duplicate = createProposal(
      emptySnapshot(),
      [
        {
          kind: "create",
          entityType: "qualityRisk",
          entity: { id: "checkout-risk", requirementId: "checkout", statement: "Risk" },
        },
        {
          kind: "create",
          entityType: "qualityRisk",
          entity: { id: "checkout-risk", requirementId: "checkout", statement: "Risk again" },
        },
      ],
      "revision-1",
    );
    const result = validateChangeProposal(duplicate, emptySnapshot());

    expect(result.diagnostics.map(({ code, path }) => ({ code, path }))).toContainEqual({
      code: "PROPOSAL_DUPLICATE_CREATE",
      path: "operations[1]",
    });
    expect(
      validateChangeProposal(
        createProposal(
          emptySnapshot(),
          [{ kind: "delete", entityType: "testCase", id: "missing-case" }],
          "revision-1",
        ),
        emptySnapshot(),
      ).diagnostics,
    ).toContainEqual(expect.objectContaining({ code: "PROPOSAL_TARGET_NOT_FOUND" }));
    expect(validateChangeProposal({ ...duplicate, operations: [] }).diagnostics).toContainEqual(
      expect.objectContaining({ code: "PROPOSAL_EMPTY_OPERATIONS" }),
    );
  });

  it("records approve, reject, and partial human decisions", () => {
    const proposal = createProposal(emptySnapshot(), [], "revision-1");
    const approved = reviewProposal(proposal, { reviewer: "nao", decision: "approve" });
    const rejected = reviewProposal(proposal, { reviewer: "nao", decision: "reject" });
    const partial = reviewProposal(
      {
        ...proposal,
        operations: [
          {
            kind: "create",
            entityType: "acceptanceCriterion",
            entity: { id: "checkout-total", requirementId: "checkout", statement: "Total" },
          },
          {
            kind: "create",
            entityType: "qualityRisk",
            entity: { id: "checkout-risk", requirementId: "checkout", statement: "Risk" },
          },
        ],
      },
      { reviewer: "nao", decision: "partial", approvedOperationIndexes: [0] },
    );

    expect(approved).toMatchObject({ status: "approved", review: { reviewer: "nao" } });
    expect(rejected).toMatchObject({ status: "rejected", review: { decision: "reject" } });
    expect(partial).toMatchObject({
      status: "partially-approved",
      review: { decision: "partial", approvedOperationIndexes: [0] },
    });
  });
});
