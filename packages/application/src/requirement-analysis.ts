import type { ProjectLocale, QualitySnapshot, Requirement } from "@ai-native-qa-workbench/domain";

import { createProposal, type ChangeProposal, type QualityOperation } from "./proposals.js";

export interface RequirementAnalysisInput {
  snapshot: QualitySnapshot;
  requirementId: string;
  baseRevision: string;
  outputLocale: ProjectLocale;
}

export interface RequirementAnalysisProvider {
  propose(input: {
    requirement: Requirement;
    outputLocale: ProjectLocale;
  }): Promise<readonly QualityOperation[]>;
}

export async function runRequirementAnalysis(
  input: RequirementAnalysisInput,
  provider: RequirementAnalysisProvider,
): Promise<ChangeProposal> {
  const requirement = input.snapshot.requirements.find((item) => item.id === input.requirementId);
  if (!requirement) throw new Error(`Requirement not found: ${input.requirementId}`);

  const operations = await provider.propose({ requirement, outputLocale: input.outputLocale });
  return createProposal(input.snapshot, [...operations], input.baseRevision);
}
