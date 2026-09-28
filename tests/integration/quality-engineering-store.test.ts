import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  QUALITY_ENGINEERING_SCHEMA_VERSION,
  type EvidenceSnapshot,
  type QualityEngineeringSnapshot,
} from "@ai-native-qa-workbench/domain";
import {
  EVIDENCE_ARTIFACT_DIRECTORY_RELATIVE_PATH,
  EVIDENCE_FILE_RELATIVE_PATH,
  FileEvidenceStore,
  FileProjectStore,
  FileQualityEngineeringStore,
  QUALITY_ENGINEERING_FILE_RELATIVE_PATH,
  QUALITY_FILE_RELATIVE_PATH,
} from "@ai-native-qa-workbench/project-store";

const temporaryDirectories: string[] = [];
const artifactContents = "quality engineering evidence";

function emptySnapshot(): QualityEngineeringSnapshot {
  return {
    schemaVersion: QUALITY_ENGINEERING_SCHEMA_VERSION,
    assessments: [],
    gates: [],
    humanDecisions: [],
  };
}

function evidenceSnapshot(): EvidenceSnapshot {
  const sha256 = createHash("sha256").update(artifactContents, "utf8").digest("hex");
  return {
    schemaVersion: "0.2",
    testRuns: [
      {
        id: "run-checkout",
        format: "junit",
        status: "passed",
        startedAt: "2026-09-27T08:00:00Z",
        completedAt: "2026-09-27T08:01:00Z",
        results: [{ name: "checkout passes", status: "passed" }],
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
          sizeBytes: Buffer.byteLength(artifactContents, "utf8"),
          sha256,
        },
        provenance: {
          sourceFormat: "junit",
          sourceFileName: "checkout.xml",
          importedAt: "2026-09-27T08:02:00Z",
          trust: "trusted",
        },
      },
    ],
  };
}

function qualityEngineeringSnapshotWithReferences(): QualityEngineeringSnapshot {
  return {
    ...emptySnapshot(),
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
        createdAt: "2026-09-27T08:03:00Z",
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
        evaluatedAt: "2026-09-27T08:04:00Z",
      },
    ],
    humanDecisions: [
      {
        id: "decision-checkout",
        gateId: "gate-checkout",
        decision: "approve",
        reviewer: "alice",
        rationale: "Reviewed the evidence.",
        decidedAt: "2026-09-27T08:05:00Z",
      },
    ],
  };
}

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "qaw-quality-engineering-store-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function initializeProject(directory: string): Promise<void> {
  const result = await new FileProjectStore().initProject({ rootDirectory: directory });
  expect(result.created).toBe(true);
  await new FileProjectStore().writeQuality(directory, {
    schemaVersion: "0.1",
    requirements: [{ id: "checkout", title: "Checkout", description: "Checkout flow" }],
    acceptanceCriteria: [],
    qualityRisks: [],
    testObligations: [],
    testCases: [],
    traceLinks: [],
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("FileQualityEngineeringStore", () => {
  it("treats a missing file as an empty valid snapshot", async () => {
    const directory = await createTemporaryDirectory();
    await initializeProject(directory);

    const result = await new FileQualityEngineeringStore().readQualityEngineering(directory);

    expect(result).toEqual({
      valid: true,
      qualityEngineering: emptySnapshot(),
      revision: null,
      diagnostics: [],
    });
  });

  it("writes with a SHA-256 revision and rejects a stale update atomically", async () => {
    const directory = await createTemporaryDirectory();
    await initializeProject(directory);
    const store = new FileQualityEngineeringStore();
    const projectBefore = await readFile(join(directory, ".ai-qa", "project.yaml"), "utf8");
    const qualityBefore = await readFile(join(directory, QUALITY_FILE_RELATIVE_PATH), "utf8");

    const first = await store.writeQualityEngineering(directory, emptySnapshot(), null);
    const current = await store.readQualityEngineering(directory);
    const stale = await store.writeQualityEngineering(
      directory,
      qualityEngineeringSnapshotWithReferences(),
      "0".repeat(64),
    );

    expect(first).toMatchObject({
      written: true,
      qualityEngineeringPath: join(directory, QUALITY_ENGINEERING_FILE_RELATIVE_PATH),
    });
    expect(first.revision).toMatch(/^[a-f0-9]{64}$/);
    expect(current.revision).toBe(first.revision);
    expect(stale).toMatchObject({
      written: false,
      diagnostics: [expect.objectContaining({ code: "QUALITY_ENGINEERING_REVISION_CONFLICT" })],
    });
    expect((await store.readQualityEngineering(directory)).revision).toBe(first.revision);
    await expect(readFile(join(directory, ".ai-qa", "project.yaml"), "utf8")).resolves.toBe(
      projectBefore,
    );
    await expect(readFile(join(directory, QUALITY_FILE_RELATIVE_PATH), "utf8")).resolves.toBe(
      qualityBefore,
    );
  });

  it("validates assessment evidence, requirement, test-run, and gate references across files", async () => {
    const directory = await createTemporaryDirectory();
    await initializeProject(directory);
    await mkdir(join(directory, EVIDENCE_ARTIFACT_DIRECTORY_RELATIVE_PATH), { recursive: true });
    await writeFile(
      join(directory, EVIDENCE_ARTIFACT_DIRECTORY_RELATIVE_PATH, "checkout.xml"),
      artifactContents,
      "utf8",
    );
    await new FileEvidenceStore().writeEvidence(directory, evidenceSnapshot(), null);
    const store = new FileQualityEngineeringStore();

    const validWrite = await store.writeQualityEngineering(
      directory,
      qualityEngineeringSnapshotWithReferences(),
      null,
    );
    const valid = await store.validateQualityEngineering(directory);

    expect(validWrite.written).toBe(true);
    expect(valid).toMatchObject({
      valid: true,
      qualityEngineering: qualityEngineeringSnapshotWithReferences(),
    });

    const missingEvidence = qualityEngineeringSnapshotWithReferences();
    missingEvidence.assessments[0]!.evidenceIds = ["evidence-missing"];
    const missingEvidenceWrite = await store.writeQualityEngineering(
      directory,
      missingEvidence,
      valid.revision ?? null,
    );
    expect(missingEvidenceWrite).toMatchObject({
      written: false,
      diagnostics: [expect.objectContaining({ code: "QUALITY_ENGINEERING_EVIDENCE_NOT_FOUND" })],
    });
    expect((await store.validateQualityEngineering(directory)).valid).toBe(true);

    const missingRequirement = qualityEngineeringSnapshotWithReferences();
    missingRequirement.assessments[0]!.target = { type: "requirement", id: "requirement-missing" };
    missingRequirement.gates[0]!.target = { type: "requirement", id: "requirement-missing" };
    const missingRequirementWrite = await store.writeQualityEngineering(
      directory,
      missingRequirement,
      valid.revision ?? null,
    );
    expect(missingRequirementWrite).toMatchObject({
      written: false,
      diagnostics: [expect.objectContaining({ code: "QUALITY_ENGINEERING_REQUIREMENT_NOT_FOUND" })],
    });
    expect((await store.validateQualityEngineering(directory)).valid).toBe(true);

    const missingTestRun = qualityEngineeringSnapshotWithReferences();
    missingTestRun.assessments[0]!.target = { type: "test-run", id: "run-missing" };
    missingTestRun.gates[0]!.target = { type: "test-run", id: "run-missing" };
    const missingTestRunWrite = await store.writeQualityEngineering(
      directory,
      missingTestRun,
      valid.revision ?? null,
    );
    expect(missingTestRunWrite).toMatchObject({
      written: false,
      diagnostics: [expect.objectContaining({ code: "QUALITY_ENGINEERING_TEST_RUN_NOT_FOUND" })],
    });
    expect((await store.validateQualityEngineering(directory)).valid).toBe(true);
  });

  it("rejects one of two concurrent writes instead of overwriting it", async () => {
    const directory = await createTemporaryDirectory();
    await initializeProject(directory);
    const store = new FileQualityEngineeringStore();
    const first = await store.writeQualityEngineering(directory, emptySnapshot(), null);
    const snapshot: QualityEngineeringSnapshot = {
      ...emptySnapshot(),
      assessments: [
        {
          id: "assessment-project",
          target: { type: "project" },
          verdict: "pass",
          summary: "No execution evidence is required for this write-race test.",
          reasonCodes: ["EVIDENCE_MISSING"],
          evidenceIds: [],
          source: "deterministic",
          basedOnRevision: null,
          createdAt: "2026-09-27T08:03:00Z",
        },
      ],
      gates: [
        {
          id: "gate-project",
          kind: "release-readiness",
          target: { type: "project" },
          assessmentId: "assessment-project",
          outcome: "pass",
          requiredHumanDecision: true,
          evaluatedAt: "2026-09-27T08:04:00Z",
        },
      ],
    };

    const results = await Promise.all([
      store.writeQualityEngineering(directory, snapshot, first.revision ?? null),
      store.writeQualityEngineering(directory, emptySnapshot(), first.revision ?? null),
    ]);

    expect(results.filter((result) => result.written)).toHaveLength(1);
    expect(results.filter((result) => !result.written)).toHaveLength(1);
    expect(results.find((result) => !result.written)?.diagnostics).toContainEqual(
      expect.objectContaining({ code: "QUALITY_ENGINEERING_REVISION_CONFLICT" }),
    );
  });

  it("leaves project, quality, and evidence source files unchanged by quality-engineering writes", async () => {
    const directory = await createTemporaryDirectory();
    await initializeProject(directory);
    const projectPath = join(directory, ".ai-qa", "project.yaml");
    const qualityPath = join(directory, QUALITY_FILE_RELATIVE_PATH);
    const evidencePath = join(directory, EVIDENCE_FILE_RELATIVE_PATH);
    const before = await Promise.all([
      readFile(projectPath, "utf8"),
      readFile(qualityPath, "utf8"),
    ]);
    await new FileQualityEngineeringStore().writeQualityEngineering(
      directory,
      emptySnapshot(),
      null,
    );

    await expect(readFile(projectPath, "utf8")).resolves.toBe(before[0]);
    await expect(readFile(qualityPath, "utf8")).resolves.toBe(before[1]);
    await expect(readFile(evidencePath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});
