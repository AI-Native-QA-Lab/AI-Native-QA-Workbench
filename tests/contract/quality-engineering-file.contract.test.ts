import { describe, expect, it } from "vitest";

import {
  QUALITY_ENGINEERING_FILE_RELATIVE_PATH,
  parseQualityEngineeringFile,
  serializeQualityEngineeringSnapshot,
} from "@ai-native-qa-workbench/project-store";
import {
  QUALITY_ENGINEERING_SCHEMA_VERSION,
  type QualityEngineeringSnapshot,
} from "@ai-native-qa-workbench/domain";

function emptySnapshot(): QualityEngineeringSnapshot {
  return {
    schemaVersion: QUALITY_ENGINEERING_SCHEMA_VERSION,
    assessments: [],
    gates: [],
    humanDecisions: [],
  };
}

function populatedSnapshot(): QualityEngineeringSnapshot {
  return {
    schemaVersion: QUALITY_ENGINEERING_SCHEMA_VERSION,
    assessments: [
      {
        id: "assessment-checkout",
        target: { type: "requirement", id: "checkout" },
        verdict: "pass",
        summary: "Trusted evidence passed.",
        reasonCodes: ["EVIDENCE_VERIFIED"],
        evidenceIds: ["evidence-checkout"],
        source: "deterministic",
        basedOnRevision: null,
        createdAt: "2026-09-27T08:00:00Z",
      },
    ],
    gates: [
      {
        id: "gate-checkout",
        kind: "requirement-readiness",
        target: { type: "requirement", id: "checkout" },
        assessmentId: "assessment-checkout",
        outcome: "pass",
        requiredHumanDecision: true,
        evaluatedAt: "2026-09-27T08:01:00Z",
      },
    ],
    humanDecisions: [
      {
        id: "decision-checkout",
        gateId: "gate-checkout",
        decision: "approve",
        reviewer: "alice",
        rationale: "Reviewed the trusted evidence.",
        decidedAt: "2026-09-27T08:02:00Z",
      },
    ],
  };
}

describe("quality engineering file contract", () => {
  it("parses the canonical empty quality engineering file", () => {
    const result = parseQualityEngineeringFile(`
schemaVersion: "0.3"
qualityEngineering:
  assessments: []
  gates: []
  humanDecisions: []
`);

    expect(result).toEqual({
      valid: true,
      qualityEngineering: emptySnapshot(),
      diagnostics: [],
    });
  });

  it("serializes stable field order and trailing newline", () => {
    expect(serializeQualityEngineeringSnapshot(emptySnapshot())).toBe(
      'schemaVersion: "0.3"\nqualityEngineering:\n  assessments: []\n  gates: []\n  humanDecisions: []\n',
    );
    expect(QUALITY_ENGINEERING_FILE_RELATIVE_PATH).toBe(".ai-qa/quality-engineering.yaml");
  });

  it("round-trips literal assessment, gate, and decision arrays", () => {
    const snapshot = populatedSnapshot();
    const parsed = parseQualityEngineeringFile(serializeQualityEngineeringSnapshot(snapshot));

    expect(parsed).toEqual({ valid: true, qualityEngineering: snapshot, diagnostics: [] });
  });

  it("rejects malformed YAML and unknown top-level or nested keys", () => {
    expect(parseQualityEngineeringFile("schemaVersion: [")).toMatchObject({
      valid: false,
      diagnostics: [
        {
          code: "QUALITY_ENGINEERING_FILE_MALFORMED",
          path: QUALITY_ENGINEERING_FILE_RELATIVE_PATH,
          severity: "error",
        },
      ],
    });

    expect(
      parseQualityEngineeringFile(`
schemaVersion: "0.3"
unexpected: true
qualityEngineering:
  assessments: []
  gates: []
  humanDecisions: []
`),
    ).toMatchObject({
      valid: false,
      diagnostics: [
        expect.objectContaining({ code: "QUALITY_ENGINEERING_UNKNOWN_KEY", path: "unexpected" }),
      ],
    });

    expect(
      parseQualityEngineeringFile(`
schemaVersion: "0.3"
qualityEngineering:
  assessments:
    - id: assessment-checkout
      target:
        type: requirement
        id: checkout
      verdict: pass
      summary: Trusted evidence passed.
      reasonCodes: [EVIDENCE_VERIFIED]
      evidenceIds: []
      source: deterministic
      basedOnRevision: null
      createdAt: "2026-09-27T08:00:00Z"
      unexpected: true
  gates: []
  humanDecisions: []
`),
    ).toMatchObject({
      valid: false,
      diagnostics: [
        expect.objectContaining({
          code: "QUALITY_ENGINEERING_UNKNOWN_KEY",
          path: "qualityEngineering.assessments[0].unexpected",
        }),
      ],
    });
  });

  it("maps unsupported schema and invalid domain values to stable diagnostics", () => {
    const unsupported = parseQualityEngineeringFile(`
schemaVersion: "0.2"
qualityEngineering:
  assessments: []
  gates: []
  humanDecisions: []
`);
    expect(unsupported.diagnostics).toContainEqual(
      expect.objectContaining({ code: "QUALITY_ENGINEERING_SCHEMA_UNSUPPORTED" }),
    );

    const invalid = parseQualityEngineeringFile(`
schemaVersion: "0.3"
qualityEngineering:
  assessments:
    - id: assessment-checkout
      target: { type: requirement, id: checkout }
      verdict: pass
      summary: " "
      reasonCodes: [EVIDENCE_VERIFIED]
      evidenceIds: []
      source: deterministic
      basedOnRevision: null
      createdAt: "2026-09-27T08:00:00Z"
  gates: []
  humanDecisions: []
`);
    expect(invalid.diagnostics).toContainEqual(
      expect.objectContaining({ code: "QUALITY_ENGINEERING_SUMMARY_EMPTY" }),
    );
  });
});
