import { describe, expect, it } from "vitest";

import {
  runRequirementAnalysis,
  type RequirementAnalysisProvider,
} from "@ai-native-qa-workbench/application";
import { QUALITY_SCHEMA_VERSION, type QualitySnapshot } from "@ai-native-qa-workbench/domain";

const snapshot: QualitySnapshot = {
  schemaVersion: QUALITY_SCHEMA_VERSION,
  requirements: [{ id: "checkout", title: "Checkout", description: "Checkout flow" }],
  acceptanceCriteria: [],
  qualityRisks: [],
  testObligations: [],
  testCases: [],
  traceLinks: [],
};

describe("runRequirementAnalysis", () => {
  it("creates a proposal from provider operations without mutating or writing the snapshot", async () => {
    const provider: RequirementAnalysisProvider = {
      propose: async () => [
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
    };
    const before = structuredClone(snapshot);

    const proposal = await runRequirementAnalysis(
      {
        snapshot,
        requirementId: "checkout",
        baseRevision: "revision-1",
        outputLocale: "zh-CN",
      },
      provider,
    );

    expect(proposal.status).toBe("proposed");
    expect(proposal.baseRevision).toBe("revision-1");
    expect(proposal.operations).toHaveLength(1);
    expect(snapshot).toEqual(before);
  });

  it("rejects analysis for an unknown requirement before calling the provider", async () => {
    let called = false;
    const provider: RequirementAnalysisProvider = {
      propose: async () => {
        called = true;
        return [];
      },
    };

    await expect(
      runRequirementAnalysis(
        { snapshot, requirementId: "missing", baseRevision: "revision-1", outputLocale: "en" },
        provider,
      ),
    ).rejects.toThrow("Requirement not found");
    expect(called).toBe(false);
  });
});
