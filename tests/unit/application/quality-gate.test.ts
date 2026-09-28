import { describe, expect, it } from "vitest";

import {
  assessmentToGateOutcome,
  createQualityAssessment,
  createQualityGate,
} from "@ai-native-qa-workbench/application";
import { type QualityAssessment, type QualityTarget } from "@ai-native-qa-workbench/domain";

const target: QualityTarget = { type: "requirement", id: "checkout" };

function assessment(verdict: QualityAssessment["verdict"]): QualityAssessment {
  return createQualityAssessment({
    id: "assessment-checkout",
    target,
    draft: {
      verdict,
      summary: "Evidence was evaluated.",
      reasonCodes: ["EVIDENCE_VERIFIED"],
      evidenceIds: ["evidence-checkout"],
      source: "deterministic",
    },
    basedOnRevision: null,
    createdAt: "2026-09-27T08:00:00Z",
  });
}

describe("quality gate evaluation", () => {
  it.each([
    ["pass", "pass"],
    ["warn", "warn"],
    ["fail", "block"],
    ["insufficient-evidence", "insufficient-evidence"],
  ] as const)("maps %s to %s", (verdict, outcome) => {
    expect(assessmentToGateOutcome(verdict)).toBe(outcome);
  });

  it("creates an assessment and gate without creating a human decision", () => {
    const createdAssessment = assessment("warn");
    const gate = createQualityGate({
      id: "gate-checkout",
      kind: "requirement-readiness",
      target,
      assessment: createdAssessment,
      evaluatedAt: "2026-09-27T08:01:00Z",
    });

    expect(createdAssessment).toEqual({
      id: "assessment-checkout",
      target,
      verdict: "warn",
      summary: "Evidence was evaluated.",
      reasonCodes: ["EVIDENCE_VERIFIED"],
      evidenceIds: ["evidence-checkout"],
      source: "deterministic",
      basedOnRevision: null,
      createdAt: "2026-09-27T08:00:00Z",
    });
    expect(gate).toEqual({
      id: "gate-checkout",
      kind: "requirement-readiness",
      target,
      assessmentId: "assessment-checkout",
      outcome: "warn",
      requiredHumanDecision: true,
      evaluatedAt: "2026-09-27T08:01:00Z",
    });
    expect(gate).not.toHaveProperty("decision");
  });
});
