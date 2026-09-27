import { describe, expect, it } from "vitest";

import {
  RuleBasedQualityAssessmentProvider,
  type QualityAssessmentInput,
} from "@ai-native-qa-workbench/application";
import {
  QUALITY_SCHEMA_VERSION,
  type EvidenceSnapshot,
  type QualitySnapshot,
} from "@ai-native-qa-workbench/domain";

const quality: QualitySnapshot = {
  schemaVersion: QUALITY_SCHEMA_VERSION,
  requirements: [{ id: "checkout", title: "Checkout", description: "Checkout flow" }],
  acceptanceCriteria: [],
  qualityRisks: [],
  testObligations: [],
  testCases: [],
  traceLinks: [],
};

function evidenceSnapshot(
  status: "passed" | "failed" | "error" | "incomplete" | "skipped" = "passed",
  trust: "unverified" | "trusted" | "human-recorded" = "trusted",
  results: Array<{
    name: string;
    status: "passed" | "failed" | "error" | "unknown" | "skipped";
  }> = [{ name: "checkout passes", status: "passed" }],
): EvidenceSnapshot {
  return {
    schemaVersion: "0.2",
    testRuns: [
      {
        id: "run-checkout",
        format: "junit",
        status,
        results,
      },
    ],
    evidenceRecords: [
      {
        id: "evidence-checkout",
        testRunId: "run-checkout",
        kind: "test-result",
        artifact: {
          id: "artifact-checkout",
          relativePath: "checkout.xml",
          mediaType: "application/xml",
          sizeBytes: 1,
          sha256: "a".repeat(64),
        },
        provenance: {
          sourceFormat: "junit",
          sourceFileName: "checkout.xml",
          importedAt: "2026-09-27T08:00:00Z",
          trust,
        },
      },
    ],
  };
}

function input(overrides: Partial<QualityAssessmentInput> = {}): QualityAssessmentInput {
  return {
    target: { type: "project" },
    quality,
    evidence: evidenceSnapshot(),
    evidenceDiagnostics: [],
    evidenceIntegrity: [],
    ...overrides,
  };
}

describe("RuleBasedQualityAssessmentProvider", () => {
  it("returns insufficient evidence for invalid quality data and integrity failures in stable order", async () => {
    const provider = new RuleBasedQualityAssessmentProvider();
    const result = await provider.assess(
      input({
        evidenceDiagnostics: [
          {
            code: "EVIDENCE_SCHEMA_UNSUPPORTED",
            path: "evidence.schemaVersion",
            message: "invalid",
            severity: "error",
          },
        ],
        evidenceIntegrity: [
          {
            code: "EVIDENCE_ARTIFACT_CHECKSUM_MISMATCH",
            path: "evidence.evidenceRecords[0].artifact.sha256",
            message: "mismatch",
            severity: "error",
          },
        ],
      }),
    );

    expect(result).toMatchObject({
      verdict: "insufficient-evidence",
      reasonCodes: ["QUALITY_DATA_INVALID", "EVIDENCE_INTEGRITY_FAILED"],
      source: "deterministic",
    });
  });

  it("returns insufficient evidence when there is no TestRun or Evidence", async () => {
    const provider = new RuleBasedQualityAssessmentProvider();
    const result = await provider.assess(
      input({ evidence: { schemaVersion: "0.2", testRuns: [], evidenceRecords: [] } }),
    );

    expect(result).toMatchObject({
      verdict: "insufficient-evidence",
      reasonCodes: ["EVIDENCE_MISSING"],
    });
  });

  it.each([
    ["empty", { status: "incomplete", results: [] }],
    ["unknown", { status: "incomplete", results: [{ name: "unknown", status: "unknown" }] }],
    ["incomplete", { status: "incomplete", results: [{ name: "unknown", status: "unknown" }] }],
    ["skipped", { status: "skipped", results: [{ name: "skipped", status: "skipped" }] }],
  ] as const)("returns insufficient evidence for %s results", async (_name, run) => {
    const provider = new RuleBasedQualityAssessmentProvider();
    const result = await provider.assess(
      input({ evidence: evidenceSnapshot(run.status, "trusted", run.results) }),
    );

    expect(result).toMatchObject({
      verdict: "insufficient-evidence",
      reasonCodes: ["TEST_RUN_INCOMPLETE"],
    });
  });

  it("prioritizes failed and error runs over trust", async () => {
    const provider = new RuleBasedQualityAssessmentProvider();
    await expect(
      provider.assess(
        input({
          evidence: evidenceSnapshot("failed", "trusted", [{ name: "failed", status: "failed" }]),
        }),
      ),
    ).resolves.toMatchObject({ verdict: "fail", reasonCodes: ["TEST_RUN_FAILED"] });
    await expect(
      provider.assess(
        input({
          evidence: evidenceSnapshot("error", "trusted", [{ name: "error", status: "error" }]),
        }),
      ),
    ).resolves.toMatchObject({ verdict: "fail", reasonCodes: ["TEST_RUN_ERROR"] });
  });

  it("warns for clean unverified evidence and passes trusted or human-recorded evidence", async () => {
    const provider = new RuleBasedQualityAssessmentProvider();
    await expect(
      provider.assess(input({ evidence: evidenceSnapshot("passed", "unverified") })),
    ).resolves.toMatchObject({ verdict: "warn", reasonCodes: ["EVIDENCE_UNVERIFIED"] });
    await expect(
      provider.assess(input({ evidence: evidenceSnapshot("passed", "trusted") })),
    ).resolves.toMatchObject({ verdict: "pass", reasonCodes: ["EVIDENCE_VERIFIED"] });
    await expect(
      provider.assess(input({ evidence: evidenceSnapshot("passed", "human-recorded") })),
    ).resolves.toMatchObject({ verdict: "pass", reasonCodes: ["EVIDENCE_VERIFIED"] });
  });

  it("returns stable evidence references without mutating the input", async () => {
    const provider = new RuleBasedQualityAssessmentProvider();
    const request = input({ target: { type: "test-run", id: "run-checkout" } });
    const before = structuredClone(request);
    const result = await provider.assess(request);

    expect(result.evidenceIds).toEqual(["evidence-checkout"]);
    expect(request).toEqual(before);
  });
});
