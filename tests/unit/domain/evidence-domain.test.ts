import { describe, expect, it } from "vitest";

import {
  deriveTestRunStatus,
  validateEvidenceSnapshot,
  type EvidenceSnapshot,
  type TestResult,
} from "@ai-native-qa-workbench/domain";

const checksum = "a".repeat(64);

function validSnapshot(): EvidenceSnapshot {
  return {
    schemaVersion: "0.2",
    testRuns: [
      {
        id: "run-junit-login",
        format: "junit",
        status: "passed",
        startedAt: "2026-09-22T01:00:00Z",
        completedAt: "2026-09-22T01:01:00Z",
        results: [
          {
            name: "登录成功",
            status: "passed",
            durationMs: 120,
            testCaseId: "test-login-success",
          },
        ],
      },
    ],
    evidenceRecords: [
      {
        id: "evidence-run-junit-login-aaaaaaaaaaaaaaaa",
        testRunId: "run-junit-login",
        kind: "test-result",
        artifact: {
          id: "artifact-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          relativePath:
            "artifact-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.bin",
          mediaType: "application/xml",
          sizeBytes: 120,
          sha256: checksum,
        },
        provenance: {
          sourceFormat: "junit",
          sourceFileName: "results.xml",
          importedAt: "2026-09-22T01:02:00Z",
          trust: "unverified",
        },
      },
    ],
  };
}

describe("deriveTestRunStatus", () => {
  const result = (status: TestResult["status"]): TestResult => ({
    name: "result",
    status,
  });

  it.each([
    ["error", [result("error"), result("failed"), result("passed")]],
    ["failed", [result("failed"), result("passed")]],
    ["skipped", [result("skipped"), result("skipped")]],
    ["incomplete", [result("unknown")]],
    ["passed", [result("passed"), result("skipped")]],
  ] as const)("derives %s with the fixed precedence", (expected, results) => {
    expect(deriveTestRunStatus(results)).toBe(expected);
  });

  it("derives incomplete instead of passed for an empty result set", () => {
    expect(deriveTestRunStatus([])).toBe("incomplete");
  });
});

describe("validateEvidenceSnapshot", () => {
  it("accepts the empty snapshot and preserves a valid Unicode snapshot", () => {
    const empty: EvidenceSnapshot = {
      schemaVersion: "0.2",
      testRuns: [],
      evidenceRecords: [],
    };
    const snapshot = validSnapshot();
    const before = structuredClone(snapshot);

    expect(validateEvidenceSnapshot(empty)).toEqual({ valid: true, diagnostics: [] });
    expect(validateEvidenceSnapshot(snapshot)).toEqual({ valid: true, diagnostics: [] });
    expect(snapshot).toEqual(before);
  });

  it("returns a collection diagnostic for a malformed runtime field", () => {
    const result = validateEvidenceSnapshot({
      schemaVersion: "0.2",
      testRuns: null,
      evidenceRecords: [],
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics.map(({ code }) => code)).toEqual(["EVIDENCE_TEST_RUNS_INVALID"]);
  });

  it("does not throw when an unsupported schema version has an uncoercible value", () => {
    const malformed = Object.create(null) as Record<string, unknown>;
    malformed.schemaVersion = Object.create(null);
    malformed.testRuns = [];
    malformed.evidenceRecords = [];

    expect(() => validateEvidenceSnapshot(malformed)).not.toThrow();
    expect(validateEvidenceSnapshot(malformed)).toMatchObject({
      valid: false,
      diagnostics: [expect.objectContaining({ code: "EVIDENCE_SCHEMA_UNSUPPORTED" })],
    });
  });

  it.each([undefined, null, 42, "not-an-object", []])(
    "does not throw for malformed whole input %j",
    (value) => {
      expect(() => validateEvidenceSnapshot(value)).not.toThrow();
      expect(validateEvidenceSnapshot(value).valid).toBe(false);
    },
  );

  it("reports TestRun result errors in stable field order", () => {
    const result = validateEvidenceSnapshot({
      schemaVersion: "0.2",
      testRuns: [
        {
          id: "Bad_ID",
          format: "unknown",
          status: "passed",
          results: [
            {
              name: " ",
              status: "not-a-status",
              durationMs: -1,
              testCaseId: "Bad_ID",
            },
          ],
        },
      ],
      evidenceRecords: [],
    });

    expect(result.diagnostics.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: "EVIDENCE_TEST_RUN_ID_INVALID", path: "testRuns[0].id" },
      { code: "EVIDENCE_FORMAT_INVALID", path: "testRuns[0].format" },
      { code: "EVIDENCE_TEST_RESULT_NAME_EMPTY", path: "testRuns[0].results[0].name" },
      {
        code: "EVIDENCE_TEST_RESULT_STATUS_INVALID",
        path: "testRuns[0].results[0].status",
      },
      {
        code: "EVIDENCE_TEST_RESULT_DURATION_INVALID",
        path: "testRuns[0].results[0].durationMs",
      },
      {
        code: "EVIDENCE_TEST_RESULT_TEST_CASE_ID_INVALID",
        path: "testRuns[0].results[0].testCaseId",
      },
      { code: "EVIDENCE_TEST_RUN_STATUS_INVALID", path: "testRuns[0].status" },
    ]);
  });

  it("rejects a status that does not match its result-derived status", () => {
    const snapshot = validSnapshot();
    snapshot.testRuns[0]!.status = "failed";

    expect(validateEvidenceSnapshot(snapshot).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "EVIDENCE_TEST_RUN_STATUS_INVALID",
        path: "testRuns[0].status",
      }),
    );
  });

  it("rejects invalid time order and malformed duration/checksum/path metadata", () => {
    const snapshot = validSnapshot();
    snapshot.testRuns[0]!.startedAt = "2026-09-22T02:00:00+08:00";
    snapshot.testRuns[0]!.completedAt = "2026-09-22T01:00:00+08:00";
    snapshot.testRuns[0]!.results[0]!.durationMs = 1.5;
    snapshot.evidenceRecords[0]!.artifact.sizeBytes = -1;
    snapshot.evidenceRecords[0]!.artifact.relativePath = "../outside.bin";
    snapshot.evidenceRecords[0]!.artifact.sha256 = "A".repeat(64);

    const codes = validateEvidenceSnapshot(snapshot).diagnostics.map(({ code }) => code);

    expect(codes).toEqual(
      expect.arrayContaining([
        "EVIDENCE_TEST_RUN_TIME_ORDER_INVALID",
        "EVIDENCE_TEST_RESULT_DURATION_INVALID",
        "EVIDENCE_ARTIFACT_SIZE_INVALID",
        "EVIDENCE_ARTIFACT_PATH_INVALID",
        "EVIDENCE_ARTIFACT_CHECKSUM_INVALID",
      ]),
    );
  });

  it.each(["2026-09-22T24:00:00Z", "2026-02-31T01:00:00Z"])(
    "rejects non-RFC3339 calendar time %s",
    (startedAt) => {
      const snapshot = validSnapshot();
      snapshot.testRuns[0]!.startedAt = startedAt;

      const result = validateEvidenceSnapshot(snapshot);

      expect(result.valid).toBe(false);
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          code: "EVIDENCE_TEST_RUN_TIME_INVALID",
          path: "testRuns[0].startedAt",
        }),
      );
    },
  );

  it("rejects duplicate IDs, broken references, and provenance format mismatch", () => {
    const snapshot = validSnapshot();
    snapshot.testRuns.push(structuredClone(snapshot.testRuns[0]!));
    snapshot.evidenceRecords.push(structuredClone(snapshot.evidenceRecords[0]!));
    snapshot.evidenceRecords[0]!.testRunId = "run-not-found";
    snapshot.evidenceRecords[0]!.provenance.sourceFormat = "pytest-json";
    snapshot.evidenceRecords[0]!.artifact.relativePath =
      snapshot.evidenceRecords[1]!.artifact.relativePath;

    const codes = validateEvidenceSnapshot(snapshot).diagnostics.map(({ code }) => code);

    expect(codes).toEqual(
      expect.arrayContaining([
        "EVIDENCE_DUPLICATE_TEST_RUN_ID",
        "EVIDENCE_DUPLICATE_RECORD_ID",
        "EVIDENCE_REFERENCE_NOT_FOUND",
        "EVIDENCE_PROVENANCE_FORMAT_MISMATCH",
        "EVIDENCE_DUPLICATE_ARTIFACT_PATH",
      ]),
    );
  });

  it("rejects artifact paths that alias across slash conventions", () => {
    const snapshot = validSnapshot();
    const second = structuredClone(snapshot.evidenceRecords[0]!);
    snapshot.evidenceRecords[0]!.artifact.relativePath = "nested/artifact.bin";
    second.id = "evidence-run-junit-login-bbbbbbbbbbbbbbbb";
    second.artifact.id = "artifact-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    second.artifact.relativePath = "nested\\artifact.bin";
    snapshot.evidenceRecords.push(second);

    expect(validateEvidenceSnapshot(snapshot).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "EVIDENCE_DUPLICATE_ARTIFACT_PATH",
        path: "evidenceRecords[1].artifact.relativePath",
      }),
    );
  });
});
