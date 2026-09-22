import { describe, expect, it } from "vitest";

import { type EvidenceSnapshot } from "@ai-native-qa-workbench/domain";
import {
  EVIDENCE_FILE_RELATIVE_PATH,
  parseEvidenceFile,
  serializeEvidenceSnapshot,
} from "@ai-native-qa-workbench/project-store";

function emptySnapshot(): EvidenceSnapshot {
  return {
    schemaVersion: "0.2",
    testRuns: [],
    evidenceRecords: [],
  };
}

function populatedSnapshot(): EvidenceSnapshot {
  return {
    schemaVersion: "0.2",
    testRuns: [
      {
        id: "run-junit-login",
        format: "junit",
        status: "passed",
        results: [{ name: "登录成功", status: "passed", durationMs: 12 }],
      },
    ],
    evidenceRecords: [
      {
        id: "evidence-run-junit-login-aaaaaaaaaaaaaaaa",
        testRunId: "run-junit-login",
        kind: "test-result",
        artifact: {
          id: "artifact-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          relativePath: "artifact.bin",
          mediaType: "application/xml",
          sizeBytes: 12,
          sha256: "a".repeat(64),
        },
        provenance: {
          sourceFormat: "junit",
          sourceFileName: "results.xml",
          importedAt: "2026-09-22T01:00:00Z",
          trust: "unverified",
        },
      },
    ],
  };
}

describe("Evidence File Contract", () => {
  it("parses the canonical empty evidence file", () => {
    expect(
      parseEvidenceFile('schemaVersion: "0.2"\nevidence:\n  testRuns: []\n  evidenceRecords: []\n'),
    ).toEqual({ valid: true, evidence: emptySnapshot(), diagnostics: [] });
  });

  it("serializes stable field order with a final newline and round-trips", () => {
    const snapshot = emptySnapshot();
    const contents = serializeEvidenceSnapshot(snapshot);

    expect(contents).toBe(
      'schemaVersion: "0.2"\nevidence:\n  testRuns: []\n  evidenceRecords: []\n',
    );
    expect(contents.endsWith("\n")).toBe(true);
    expect(parseEvidenceFile(contents)).toEqual({
      valid: true,
      evidence: snapshot,
      diagnostics: [],
    });
    expect(EVIDENCE_FILE_RELATIVE_PATH).toBe(".ai-qa/evidence.yaml");
  });

  it("round-trips populated evidence without changing Unicode or collection order", () => {
    const snapshot = populatedSnapshot();

    expect(parseEvidenceFile(serializeEvidenceSnapshot(snapshot))).toEqual({
      valid: true,
      evidence: snapshot,
      diagnostics: [],
    });
  });

  it("rejects malformed YAML and unknown keys", () => {
    expect(parseEvidenceFile("schemaVersion: [")).toMatchObject({
      valid: false,
      diagnostics: [
        {
          code: "EVIDENCE_FILE_MALFORMED",
          path: EVIDENCE_FILE_RELATIVE_PATH,
          severity: "error",
        },
      ],
    });

    expect(
      parseEvidenceFile(
        'schemaVersion: "0.2"\nunexpected: true\nevidence:\n  testRuns: []\n  evidenceRecords: []\n',
      ),
    ).toMatchObject({
      valid: false,
      diagnostics: [
        {
          code: "EVIDENCE_UNKNOWN_KEY",
          path: "unexpected",
          severity: "error",
        },
      ],
    });

    expect(
      parseEvidenceFile(
        'schemaVersion: "0.2"\nevidence:\n  testRuns: []\n  evidenceRecords: []\n  unexpected: true\n',
      ),
    ).toMatchObject({
      valid: false,
      diagnostics: [
        {
          code: "EVIDENCE_UNKNOWN_KEY",
          path: "evidence.unexpected",
          severity: "error",
        },
      ],
    });
  });

  it("rejects unsupported schema versions and non-array collections", () => {
    expect(
      parseEvidenceFile('schemaVersion: "0.1"\nevidence:\n  testRuns: []\n  evidenceRecords: []\n'),
    ).toMatchObject({
      valid: false,
      diagnostics: [{ code: "EVIDENCE_SCHEMA_UNSUPPORTED", path: "evidence.schemaVersion" }],
    });

    const result = parseEvidenceFile(
      'schemaVersion: "0.2"\nevidence:\n  testRuns: {}\n  evidenceRecords: []\n',
    );
    expect(result).toMatchObject({
      valid: false,
      diagnostics: [{ code: "EVIDENCE_TEST_RUNS_INVALID", path: "evidence.testRuns" }],
    });
  });

  it("maps Domain reference diagnostics below evidence", () => {
    const raw = [
      'schemaVersion: "0.2"',
      "evidence:",
      "  testRuns:",
      "    - id: run-junit-login",
      "      format: junit",
      "      status: passed",
      "      results:",
      "        - name: 登录成功",
      "          status: passed",
      "  evidenceRecords:",
      "    - id: evidence-run-junit-login-aaaaaaaaaaaaaaaa",
      "      testRunId: run-not-found",
      "      kind: test-result",
      "      artifact:",
      "        id: artifact-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "        relativePath: artifact.bin",
      "        mediaType: application/xml",
      "        sizeBytes: 12",
      "        sha256: " + "a".repeat(64),
      "      provenance:",
      "        sourceFormat: junit",
      "        sourceFileName: results.xml",
      "        importedAt: 2026-09-22T01:00:00Z",
      "        trust: unverified",
    ].join("\n");

    const result = parseEvidenceFile(raw);

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "EVIDENCE_REFERENCE_NOT_FOUND",
        path: "evidence.evidenceRecords[0].testRunId",
      }),
    );
  });
});
