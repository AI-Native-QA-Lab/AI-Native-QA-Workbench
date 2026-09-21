import { describe, expect, it } from "vitest";

import {
  QUALITY_FILE_RELATIVE_PATH,
  parseQualityFile,
  serializeQualitySnapshot,
} from "@ai-native-qa-workbench/project-store";
import { QUALITY_SCHEMA_VERSION, type QualitySnapshot } from "@ai-native-qa-workbench/domain";

function emptySnapshot(): QualitySnapshot {
  return {
    schemaVersion: QUALITY_SCHEMA_VERSION,
    requirements: [],
    acceptanceCriteria: [],
    qualityRisks: [],
    testObligations: [],
    testCases: [],
    traceLinks: [],
  };
}

describe("quality file contract", () => {
  it("parses the canonical empty quality file", () => {
    const result = parseQualityFile(`
schemaVersion: "0.1"
quality:
  requirements: []
  acceptanceCriteria: []
  qualityRisks: []
  testObligations: []
  testCases: []
  traceLinks: []
`);

    expect(result).toEqual({ valid: true, projectQuality: emptySnapshot(), diagnostics: [] });
  });

  it("serializes stable field order and round-trips a quality snapshot", () => {
    const snapshot = emptySnapshot();

    expect(serializeQualitySnapshot(snapshot)).toBe(
      'schemaVersion: "0.1"\nquality:\n  requirements: []\n  acceptanceCriteria: []\n  qualityRisks: []\n  testObligations: []\n  testCases: []\n  traceLinks: []\n',
    );
    expect(parseQualityFile(serializeQualitySnapshot(snapshot))).toEqual({
      valid: true,
      projectQuality: snapshot,
      diagnostics: [],
    });
    expect(QUALITY_FILE_RELATIVE_PATH).toBe(".ai-qa/quality.yaml");
  });

  it("rejects malformed YAML and unknown contract keys", () => {
    expect(parseQualityFile("schemaVersion: [")).toMatchObject({
      valid: false,
      diagnostics: [
        {
          code: "QUALITY_FILE_MALFORMED",
          path: QUALITY_FILE_RELATIVE_PATH,
          severity: "error",
        },
      ],
    });

    expect(
      parseQualityFile(`
schemaVersion: "0.1"
unexpected: true
quality:
  requirements: []
  acceptanceCriteria: []
  qualityRisks: []
  testObligations: []
  testCases: []
  traceLinks: []
`),
    ).toMatchObject({
      valid: false,
      diagnostics: [
        {
          code: "QUALITY_UNKNOWN_KEY",
          path: "unexpected",
          severity: "error",
        },
      ],
    });
  });

  it("rejects quality data whose collection is not an array", () => {
    const result = parseQualityFile(`
schemaVersion: "0.1"
quality:
  requirements: {}
  acceptanceCriteria: []
  qualityRisks: []
  testObligations: []
  testCases: []
  traceLinks: []
`);

    expect(result).toMatchObject({
      valid: false,
      diagnostics: [
        {
          code: "QUALITY_REQUIREMENTS_NOT_ARRAY",
          path: "quality.requirements",
          severity: "error",
        },
      ],
    });
  });
});
