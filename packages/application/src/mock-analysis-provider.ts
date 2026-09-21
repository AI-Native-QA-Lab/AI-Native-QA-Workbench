import type { Requirement } from "@ai-native-qa-workbench/domain";
import { MockProvider, type ModelProvider } from "@ai-native-qa-workbench/model-providers";

import type { RequirementAnalysisProvider } from "./requirement-analysis.js";
import type { QualityOperation } from "./proposals.js";

function operationsFor(requirement: Requirement): QualityOperation[] {
  const criterionId = `${requirement.id}-behavior`;
  const riskId = `${requirement.id}-risk`;
  const obligationId = `${requirement.id}-risk-check`;
  const testCaseId = `${requirement.id}-risk-case`;
  return [
    {
      kind: "create",
      entityType: "acceptanceCriterion",
      entity: {
        id: criterionId,
        requirementId: requirement.id,
        statement: `The ${requirement.title} behavior satisfies its requirement.`,
      },
    },
    {
      kind: "create",
      entityType: "qualityRisk",
      entity: {
        id: riskId,
        requirementId: requirement.id,
        statement: `The ${requirement.title} behavior may regress at a quality boundary.`,
      },
    },
    {
      kind: "create",
      entityType: "testObligation",
      entity: {
        id: obligationId,
        riskId,
        statement: `Verify the quality boundary for ${requirement.title}.`,
      },
    },
    {
      kind: "create",
      entityType: "testCase",
      entity: {
        id: testCaseId,
        obligationId,
        title: `${requirement.title} quality boundary`,
        steps: `Exercise the ${requirement.title} boundary with representative input.`,
        expectedResult: "The behavior remains within the documented quality boundary.",
      },
    },
    {
      kind: "create",
      entityType: "traceLink",
      entity: {
        id: `${criterionId}-satisfies`,
        fromType: "acceptance-criterion",
        fromId: criterionId,
        toType: "requirement",
        toId: requirement.id,
        relation: "satisfies",
      },
    },
    {
      kind: "create",
      entityType: "traceLink",
      entity: {
        id: `${riskId}-mitigates`,
        fromType: "quality-risk",
        fromId: riskId,
        toType: "requirement",
        toId: requirement.id,
        relation: "mitigates",
      },
    },
    {
      kind: "create",
      entityType: "traceLink",
      entity: {
        id: `${obligationId}-verifies`,
        fromType: "test-obligation",
        fromId: obligationId,
        toType: "quality-risk",
        toId: riskId,
        relation: "verifies",
      },
    },
    {
      kind: "create",
      entityType: "traceLink",
      entity: {
        id: `${testCaseId}-verifies`,
        fromType: "test-case",
        fromId: testCaseId,
        toType: "test-obligation",
        toId: obligationId,
        relation: "verifies",
      },
    },
  ];
}

export function createModelRequirementAnalysisProvider(
  provider: ModelProvider,
): RequirementAnalysisProvider {
  return {
    async propose({ requirement, outputLocale }) {
      const response = await provider.generate({
        system: `Return only a JSON array of valid quality operations. Use ${outputLocale} for user-facing text.`,
        prompt: `Analyze requirement ${requirement.id}.`,
        outputLocale,
      });
      const parsed = JSON.parse(response.text) as unknown;
      if (!Array.isArray(parsed)) throw new Error("Requirement analysis response is malformed.");
      return parsed as QualityOperation[];
    },
  };
}

export function createMockRequirementAnalysisProvider(): RequirementAnalysisProvider {
  return {
    async propose({ requirement, outputLocale }) {
      const provider = new MockProvider([
        { text: JSON.stringify(operationsFor(requirement)), done: true },
      ]);
      return createModelRequirementAnalysisProvider(provider).propose({
        requirement,
        outputLocale,
      });
    },
  };
}
