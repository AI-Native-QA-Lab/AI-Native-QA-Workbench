import { describe, expect, it } from "vitest";

import {
  QUALITY_ENGINEERING_SCHEMA_VERSION,
  mapAssessmentVerdictToGateOutcome,
  resolveQualityGateStatus,
  validateQualityEngineeringSnapshot,
  type HumanDecision,
  type QualityEngineeringSnapshot,
} from "@ai-native-qa-workbench/domain";

function validSnapshot(): QualityEngineeringSnapshot {
  return {
    schemaVersion: QUALITY_ENGINEERING_SCHEMA_VERSION,
    assessments: [
      {
        id: "assessment-checkout-service",
        target: { type: "project" },
        verdict: "warn",
        summary: "Evidence is valid but has not been trusted.",
        reasonCodes: ["EVIDENCE_UNVERIFIED"],
        evidenceIds: ["evidence-run-junit-login-aaaaaaaaaaaaaaaa"],
        source: "deterministic",
        basedOnRevision: "a".repeat(64),
        createdAt: "2026-09-27T08:00:00Z",
      },
    ],
    gates: [
      {
        id: "gate-release-checkout-service",
        kind: "release-readiness",
        target: { type: "project" },
        assessmentId: "assessment-checkout-service",
        outcome: "warn",
        requiredHumanDecision: true,
        evaluatedAt: "2026-09-27T08:01:00Z",
      },
    ],
    humanDecisions: [],
  };
}

function decision(overrides: Partial<HumanDecision> = {}): HumanDecision {
  return {
    id: "decision-gate-release-001",
    gateId: "gate-release-checkout-service",
    decision: "approve",
    reviewer: "alice",
    rationale: "Reviewed the warning and accepted the residual risk.",
    decidedAt: "2026-09-27T08:02:00Z",
    ...overrides,
  };
}

describe("quality engineering domain", () => {
  it("accepts a valid assessment, gate, and empty decision collection", () => {
    expect(validateQualityEngineeringSnapshot(validSnapshot())).toEqual({
      valid: true,
      diagnostics: [],
    });
  });

  it.each([
    ["pass", "pass"],
    ["warn", "warn"],
    ["fail", "block"],
    ["insufficient-evidence", "insufficient-evidence"],
  ] as const)("maps %s assessment verdict to %s gate outcome", (verdict, outcome) => {
    expect(mapAssessmentVerdictToGateOutcome(verdict)).toBe(outcome);
  });

  it("rejects duplicate IDs, invalid arrays, timestamps, and revisions", () => {
    const snapshot = validSnapshot();
    snapshot.assessments.push(structuredClone(snapshot.assessments[0]!));
    snapshot.assessments[1]!.id = snapshot.assessments[0]!.id;
    snapshot.assessments[0]!.reasonCodes = ["EVIDENCE_UNVERIFIED", "EVIDENCE_UNVERIFIED"];
    snapshot.assessments[0]!.evidenceIds = [" "];
    snapshot.assessments[0]!.basedOnRevision = "not-a-sha";
    snapshot.assessments[0]!.createdAt = "2026-02-31T01:00:00Z";

    const codes = validateQualityEngineeringSnapshot(snapshot).diagnostics.map(({ code }) => code);

    expect(codes).toEqual(
      expect.arrayContaining([
        "QUALITY_ENGINEERING_DUPLICATE_ID",
        "QUALITY_ENGINEERING_REASON_CODES_INVALID",
        "QUALITY_ENGINEERING_EVIDENCE_IDS_INVALID",
        "QUALITY_ENGINEERING_REVISION_INVALID",
        "QUALITY_ENGINEERING_TIME_INVALID",
      ]),
    );
  });

  it("rejects missing assessment references", () => {
    const snapshot = validSnapshot();
    snapshot.gates[0]!.assessmentId = "assessment-not-found";

    expect(validateQualityEngineeringSnapshot(snapshot).diagnostics).toContainEqual(
      expect.objectContaining({ code: "QUALITY_ENGINEERING_ASSESSMENT_NOT_FOUND" }),
    );
  });

  it("rejects a target mismatch and a gate that does not require a human decision", () => {
    const mismatch = validSnapshot();
    mismatch.gates[0]!.target = { type: "requirement", id: "checkout-flow" };
    expect(validateQualityEngineeringSnapshot(mismatch).diagnostics).toContainEqual(
      expect.objectContaining({ code: "QUALITY_ENGINEERING_TARGET_MISMATCH" }),
    );

    const nonHuman = validSnapshot();
    nonHuman.gates[0]!.requiredHumanDecision = false as never;
    expect(validateQualityEngineeringSnapshot(nonHuman).diagnostics).toContainEqual(
      expect.objectContaining({ code: "QUALITY_ENGINEERING_HUMAN_DECISION_REQUIRED" }),
    );
  });

  it("rejects invalid human decision references and empty reviewer/rationale", () => {
    const snapshot = validSnapshot();
    snapshot.humanDecisions.push(
      decision({ gateId: "gate-not-found", id: "decision-missing-gate" }),
    );
    snapshot.humanDecisions.push(
      decision({ id: "decision-empty-fields", reviewer: " ", rationale: "" }),
    );

    const codes = validateQualityEngineeringSnapshot(snapshot).diagnostics.map(({ code }) => code);

    expect(codes).toEqual(
      expect.arrayContaining([
        "QUALITY_ENGINEERING_GATE_NOT_FOUND",
        "QUALITY_ENGINEERING_REVIEWER_EMPTY",
        "QUALITY_ENGINEERING_RATIONALE_EMPTY",
      ]),
    );
  });

  it("resolves pending and uses the latest decision by time then id", () => {
    const gate = validSnapshot().gates[0]!;

    expect(resolveQualityGateStatus(gate, [])).toBe("pending");
    expect(
      resolveQualityGateStatus(gate, [
        decision({ id: "decision-a", decision: "approve", decidedAt: "2026-09-27T08:02:00Z" }),
        decision({ id: "decision-b", decision: "reject", decidedAt: "2026-09-27T08:03:00Z" }),
      ]),
    ).toBe("rejected");
    expect(
      resolveQualityGateStatus(gate, [
        decision({ id: "decision-a", decision: "reject", decidedAt: "2026-09-27T08:03:00Z" }),
        decision({ id: "decision-z", decision: "waive", decidedAt: "2026-09-27T08:03:00Z" }),
      ]),
    ).toBe("waived");
  });

  it("orders decisions by their instant rather than their timestamp spelling", () => {
    const gate = validSnapshot().gates[0]!;

    expect(
      resolveQualityGateStatus(gate, [
        decision({
          id: "decision-early",
          decision: "approve",
          decidedAt: "2026-09-27T00:30:00+01:00",
        }),
        decision({
          id: "decision-late",
          decision: "reject",
          decidedAt: "2026-09-26T23:45:00Z",
        }),
      ]),
    ).toBe("rejected");
  });
});
