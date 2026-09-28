import {
  mapAssessmentVerdictToGateOutcome,
  type QualityAssessment,
  type QualityGate,
  type QualityGateKind,
  type QualityGateOutcome,
  type QualityTarget,
} from "@ai-native-qa-workbench/domain";

import type { QualityAssessmentDraft } from "./quality-assessment.js";

export function assessmentToGateOutcome(verdict: QualityAssessment["verdict"]): QualityGateOutcome {
  return mapAssessmentVerdictToGateOutcome(verdict);
}

export function createQualityAssessment(input: {
  id: string;
  target: QualityTarget;
  draft: QualityAssessmentDraft;
  basedOnRevision: string | null;
  createdAt: string;
}): QualityAssessment {
  return {
    id: input.id,
    target: input.target,
    verdict: input.draft.verdict,
    summary: input.draft.summary,
    reasonCodes: [...input.draft.reasonCodes],
    evidenceIds: [...input.draft.evidenceIds],
    source: input.draft.source,
    basedOnRevision: input.basedOnRevision,
    createdAt: input.createdAt,
  };
}

export function createQualityGate(input: {
  id: string;
  kind: QualityGateKind;
  target: QualityTarget;
  assessment: QualityAssessment;
  evaluatedAt: string;
}): QualityGate {
  return {
    id: input.id,
    kind: input.kind,
    target: input.target,
    assessmentId: input.assessment.id,
    outcome: assessmentToGateOutcome(input.assessment.verdict),
    requiredHumanDecision: true,
    evaluatedAt: input.evaluatedAt,
  };
}
