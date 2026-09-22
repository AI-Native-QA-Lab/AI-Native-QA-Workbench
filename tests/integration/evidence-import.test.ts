import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  EvidenceImportService,
  type EvidenceImportResult,
} from "@ai-native-qa-workbench/application";
import {
  createEvidenceAdapterRegistry,
  MAX_EVIDENCE_IMPORT_BYTES,
  type EvidenceAdapterRegistry,
} from "@ai-native-qa-workbench/evidence";
import {
  QUALITY_SCHEMA_VERSION,
  type EvidenceSnapshot,
  type QualitySnapshot,
  type TestRun,
} from "@ai-native-qa-workbench/domain";
import {
  EVIDENCE_ARTIFACT_DIRECTORY_RELATIVE_PATH,
  EVIDENCE_FILE_RELATIVE_PATH,
  FileEvidenceStore,
  FileProjectStore,
  type EvidenceArtifactStore,
  type EvidenceValidationResult,
  type EvidenceStore,
  type StoreDiagnostic,
} from "@ai-native-qa-workbench/project-store";

const temporaryDirectories: string[] = [];
const fixturePath = new URL("../fixtures/evidence/junit-minimal.xml", import.meta.url);

function checksum(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function emptyQualitySnapshot(): QualitySnapshot {
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

function qualitySnapshotWithTestCase(): QualitySnapshot {
  return {
    ...emptyQualitySnapshot(),
    requirements: [{ id: "checkout", title: "Checkout", description: "Checkout flow" }],
    qualityRisks: [{ id: "checkout-risk", requirementId: "checkout", statement: "Rounding risk" }],
    testObligations: [
      { id: "checkout-obligation", riskId: "checkout-risk", statement: "Verify checkout" },
    ],
    testCases: [
      {
        id: "test-login-success",
        obligationId: "checkout-obligation",
        title: "Login succeeds",
        steps: "Submit valid credentials",
        expectedResult: "The user is logged in",
      },
    ],
  };
}

async function createProject(): Promise<{
  directory: string;
  reportPath: string;
  projectStore: FileProjectStore;
  evidenceStore: FileEvidenceStore;
}> {
  const directory = await mkdtemp(join(tmpdir(), "qaw-evidence-import-"));
  temporaryDirectories.push(directory);
  const projectStore = new FileProjectStore();
  const evidenceStore = new FileEvidenceStore();
  const initialized = await projectStore.initProject({ rootDirectory: directory });
  expect(initialized.created).toBe(true);
  const reportPath = join(directory, "报告-结果.xml");
  await writeFile(reportPath, await readFile(fixturePath));
  return { directory, reportPath, projectStore, evidenceStore };
}

function createImporter(
  projectStore: FileProjectStore,
  evidenceStore: EvidenceStore & EvidenceArtifactStore,
  adapters: EvidenceAdapterRegistry = createEvidenceAdapterRegistry(),
): EvidenceImportService {
  return new EvidenceImportService({
    projectStore,
    evidenceStore,
    adapters,
    now: () => "2026-09-22T01:00:00Z",
  });
}

function resultWithCode(result: EvidenceImportResult, code: string): void {
  expect(result.imported).toBe(false);
  expect(result.diagnostics).toContainEqual(expect.objectContaining({ code }));
}

function reverseObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .reverse()
        .map(([key, nested]) => [key, reverseObjectKeys(nested)]),
    );
  }
  return value;
}

function reorderedEvidenceResult(result: EvidenceValidationResult): EvidenceValidationResult {
  if (!result.evidence) return result;
  return {
    ...result,
    evidence: reverseObjectKeys(result.evidence) as EvidenceSnapshot,
  };
}

function storeWithReorderedReads(base: FileEvidenceStore): EvidenceStore & EvidenceArtifactStore {
  return {
    async readEvidence(rootDirectory) {
      return reorderedEvidenceResult(await base.readEvidence(rootDirectory));
    },
    async validateEvidence(rootDirectory) {
      return reorderedEvidenceResult(await base.validateEvidence(rootDirectory));
    },
    writeEvidence: base.writeEvidence.bind(base),
    stageArtifact: base.stageArtifact.bind(base),
    commitArtifact: base.commitArtifact.bind(base),
    discardArtifact: base.discardArtifact.bind(base),
    verifyEvidence: base.verifyEvidence.bind(base),
  };
}

function testCaseAdapterRegistry(testCaseId: string): EvidenceAdapterRegistry {
  return {
    get() {
      return {
        format: "junit",
        parse(input, context) {
          const testRun: TestRun = {
            id: context.runId,
            format: "junit",
            status: "passed",
            results: [{ name: "custom result", status: "passed", testCaseId }],
          };
          return {
            testRun,
            artifact: {
              bytes: input,
              sourceFileName: context.sourceFileName,
              mediaType: "application/xml",
            },
          };
        },
      };
    },
  };
}

function storeThatRejectsManifestWrite(
  base: FileEvidenceStore,
  code: StoreDiagnostic["code"],
): EvidenceStore & EvidenceArtifactStore {
  return {
    readEvidence: base.readEvidence.bind(base),
    validateEvidence: base.validateEvidence.bind(base),
    stageArtifact: base.stageArtifact.bind(base),
    commitArtifact: base.commitArtifact.bind(base),
    discardArtifact: base.discardArtifact.bind(base),
    verifyEvidence: base.verifyEvidence.bind(base),
    async writeEvidence(rootDirectory) {
      return {
        written: false,
        evidencePath: join(rootDirectory, EVIDENCE_FILE_RELATIVE_PATH),
        diagnostics: [
          {
            code,
            path: EVIDENCE_FILE_RELATIVE_PATH,
            message: "Injected manifest write failure.",
            severity: "error",
          },
        ],
      };
    },
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("EvidenceImportService", () => {
  it("imports a report with a deterministic default run ID and artifact metadata", async () => {
    const { directory, reportPath, projectStore, evidenceStore } = await createProject();
    const bytes = await readFile(reportPath);
    const importer = createImporter(projectStore, evidenceStore);

    const result = await importer.import({ rootDirectory: directory, reportPath, format: "junit" });
    const snapshot = await evidenceStore.readEvidence(directory);
    const artifactSha = checksum(bytes);

    expect(result).toMatchObject({
      imported: true,
      idempotent: false,
      testRunId: "run-junit-" + artifactSha,
      evidenceId: "evidence-run-junit-" + artifactSha + "-" + artifactSha.slice(0, 16),
    });
    expect(snapshot.valid).toBe(true);
    expect(snapshot.evidence?.evidenceRecords[0]).toMatchObject({
      id: result.evidenceId,
      testRunId: result.testRunId,
      artifact: {
        id: "artifact-" + artifactSha,
        relativePath: "artifact-" + artifactSha + ".bin",
        mediaType: "application/xml",
        sizeBytes: bytes.byteLength,
        sha256: artifactSha,
      },
      provenance: {
        sourceFormat: "junit",
        sourceFileName: basename(reportPath),
        importedAt: "2026-09-22T01:00:00.000Z",
        trust: "unverified",
      },
    });
    expect((await evidenceStore.validateEvidence(directory)).valid).toBe(true);
  });

  it("honors an explicit run ID, preserves Unicode source names, and normalizes time to UTC", async () => {
    const { directory, reportPath, projectStore, evidenceStore } = await createProject();
    const importer = createImporter(projectStore, evidenceStore);

    const result = await importer.import({
      rootDirectory: directory,
      reportPath,
      format: "junit",
      runId: "run-explicit-unicode",
      now: "2026-09-22T09:00:00+08:00",
    });
    const snapshot = await evidenceStore.readEvidence(directory);

    expect(result.imported).toBe(true);
    expect(snapshot.evidence?.testRuns[0]?.id).toBe("run-explicit-unicode");
    expect(snapshot.evidence?.evidenceRecords[0]?.provenance).toMatchObject({
      sourceFileName: "报告-结果.xml",
      importedAt: "2026-09-22T01:00:00.000Z",
      trust: "unverified",
    });
  });

  it("returns idempotent success without changing importedAt or the manifest revision", async () => {
    const { directory, reportPath, projectStore, evidenceStore } = await createProject();
    const importer = createImporter(projectStore, evidenceStore);
    const first = await importer.import({
      rootDirectory: directory,
      reportPath,
      format: "junit",
      runId: "run-idempotent",
      now: "2026-09-22T01:00:00Z",
    });
    const before = await evidenceStore.readEvidence(directory);
    const second = await importer.import({
      rootDirectory: directory,
      reportPath,
      format: "junit",
      runId: "run-idempotent",
      now: "2026-09-22T02:00:00Z",
    });
    const after = await evidenceStore.readEvidence(directory);

    expect(first.imported).toBe(true);
    expect(second).toMatchObject({
      imported: true,
      idempotent: true,
      testRunId: first.testRunId,
      evidenceId: first.evidenceId,
    });
    expect(after.revision).toBe(before.revision);
    expect(after.evidence).toEqual(before.evidence);
  });

  it("treats semantically identical evidence as idempotent after YAML key reordering", async () => {
    const { directory, reportPath, projectStore, evidenceStore } = await createProject();
    const importer = createImporter(projectStore, evidenceStore);
    const first = await importer.import({
      rootDirectory: directory,
      reportPath,
      format: "junit",
      runId: "run-reordered-yaml",
      now: "2026-09-22T01:00:00Z",
    });
    const second = await createImporter(
      projectStore,
      storeWithReorderedReads(evidenceStore),
    ).import({
      rootDirectory: directory,
      reportPath,
      format: "junit",
      runId: "run-reordered-yaml",
      now: "2026-09-22T02:00:00Z",
    });

    expect(first.imported).toBe(true);
    expect(second).toMatchObject({ imported: true, idempotent: true });
  });

  it("rejects a same-run import whose checksum or normalized result differs", async () => {
    const { directory, reportPath, projectStore, evidenceStore } = await createProject();
    const importer = createImporter(projectStore, evidenceStore);
    await importer.import({
      rootDirectory: directory,
      reportPath,
      format: "junit",
      runId: "run-conflict",
      now: "2026-09-22T01:00:00Z",
    });
    const before = await evidenceStore.readEvidence(directory);
    const differentReportPath = join(directory, "different.xml");
    const differentReport = (await readFile(reportPath, "utf8")).replace("通过-登录", "新的测试");
    await writeFile(differentReportPath, differentReport, "utf8");

    const result = await importer.import({
      rootDirectory: directory,
      reportPath: differentReportPath,
      format: "junit",
      runId: "run-conflict",
      now: "2026-09-22T02:00:00Z",
    });
    const after = await evidenceStore.readEvidence(directory);

    resultWithCode(result, "EVIDENCE_IMPORT_CONFLICT");
    expect(after.revision).toBe(before.revision);
    expect(after.evidence).toEqual(before.evidence);
  });

  it("does not write a manifest or artifact for malformed or oversized reports", async () => {
    const { directory, reportPath, projectStore, evidenceStore } = await createProject();
    const importer = createImporter(projectStore, evidenceStore);
    await writeFile(reportPath, "<testsuite>", "utf8");

    const malformed = await importer.import({
      rootDirectory: directory,
      reportPath,
      format: "junit",
    });
    resultWithCode(malformed, "EVIDENCE_REPORT_MALFORMED");
    await expect(readFile(join(directory, EVIDENCE_FILE_RELATIVE_PATH))).rejects.toMatchObject({
      code: "ENOENT",
    });

    await writeFile(reportPath, new Uint8Array(MAX_EVIDENCE_IMPORT_BYTES + 1));
    const oversized = await importer.import({
      rootDirectory: directory,
      reportPath,
      format: "junit",
    });
    resultWithCode(oversized, "EVIDENCE_INPUT_TOO_LARGE");
    expect((await evidenceStore.readEvidence(directory)).revision).toBeNull();
  });

  it("validates new TestCase references before committing the artifact", async () => {
    const { directory, reportPath, projectStore, evidenceStore } = await createProject();
    await projectStore.writeQuality(directory, qualitySnapshotWithTestCase());
    const importer = createImporter(
      projectStore,
      evidenceStore,
      testCaseAdapterRegistry("test-login-success"),
    );

    const success = await importer.import({
      rootDirectory: directory,
      reportPath,
      format: "junit",
      runId: "run-reference-success",
    });
    expect(success.imported).toBe(true);

    const secondDirectory = await createProject();
    await secondDirectory.projectStore.writeQuality(
      secondDirectory.directory,
      qualitySnapshotWithTestCase(),
    );
    const failingImporter = createImporter(
      secondDirectory.projectStore,
      secondDirectory.evidenceStore,
      testCaseAdapterRegistry("test-missing"),
    );
    const failure = await failingImporter.import({
      rootDirectory: secondDirectory.directory,
      reportPath: secondDirectory.reportPath,
      format: "junit",
      runId: "run-reference-failure",
    });

    resultWithCode(failure, "EVIDENCE_REFERENCE_NOT_FOUND");
    expect(
      (await secondDirectory.evidenceStore.readEvidence(secondDirectory.directory)).revision,
    ).toBeNull();
  });

  it("reports a new TestCase reference at the appended TestRun index", async () => {
    const { directory, reportPath, projectStore, evidenceStore } = await createProject();
    await projectStore.writeQuality(directory, qualitySnapshotWithTestCase());

    const success = await createImporter(
      projectStore,
      evidenceStore,
      testCaseAdapterRegistry("test-login-success"),
    ).import({
      rootDirectory: directory,
      reportPath,
      format: "junit",
      runId: "run-reference-first",
    });
    expect(success.imported).toBe(true);

    const failure = await createImporter(
      projectStore,
      evidenceStore,
      testCaseAdapterRegistry("test-missing"),
    ).import({
      rootDirectory: directory,
      reportPath,
      format: "junit",
      runId: "run-reference-second",
    });

    expect(failure.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "EVIDENCE_REFERENCE_NOT_FOUND",
        path: "evidence.testRuns[1].results[0].testCaseId",
      }),
    );
  });

  it("preserves the old manifest on a stale revision conflict and cleans staged temporary files", async () => {
    const { directory, reportPath, projectStore, evidenceStore } = await createProject();
    const importer = createImporter(projectStore, evidenceStore);
    await importer.import({
      rootDirectory: directory,
      reportPath,
      format: "junit",
      runId: "run-before-conflict",
    });
    const before = await evidenceStore.readEvidence(directory);
    const differentReportPath = join(directory, "stale.xml");
    await writeFile(
      differentReportPath,
      (await readFile(reportPath, "utf8")).replace("通过-登录", "stale"),
      "utf8",
    );
    const staleImporter = createImporter(
      projectStore,
      storeThatRejectsManifestWrite(evidenceStore, "EVIDENCE_REVISION_CONFLICT"),
    );

    const result = await staleImporter.import({
      rootDirectory: directory,
      reportPath: differentReportPath,
      format: "junit",
      runId: "run-after-conflict",
    });
    const after = await evidenceStore.readEvidence(directory);
    const temporaryFiles = await readdir(
      join(directory, EVIDENCE_ARTIFACT_DIRECTORY_RELATIVE_PATH, ".tmp"),
    );

    resultWithCode(result, "EVIDENCE_REVISION_CONFLICT");
    expect(after.revision).toBe(before.revision);
    expect(temporaryFiles).toEqual([]);
  });

  it("leaves a committed artifact orphaned when manifest persistence fails", async () => {
    const { directory, reportPath, projectStore, evidenceStore } = await createProject();
    const importer = createImporter(projectStore, evidenceStore);
    await importer.import({
      rootDirectory: directory,
      reportPath,
      format: "junit",
      runId: "run-existing",
    });
    const before = await evidenceStore.readEvidence(directory);
    const differentReportPath = join(directory, "manifest-failure.xml");
    await writeFile(
      differentReportPath,
      (await readFile(reportPath, "utf8")).replace("通过-登录", "manifest failure"),
      "utf8",
    );
    const failingImporter = createImporter(
      projectStore,
      storeThatRejectsManifestWrite(evidenceStore, "EVIDENCE_FILE_MALFORMED"),
    );

    const result = await failingImporter.import({
      rootDirectory: directory,
      reportPath: differentReportPath,
      format: "junit",
      runId: "run-manifest-failure",
    });
    const after = await evidenceStore.readEvidence(directory);

    resultWithCode(result, "EVIDENCE_FILE_MALFORMED");
    expect(after.revision).toBe(before.revision);
    const verification = await evidenceStore.verifyEvidence(directory);
    expect(verification.diagnostics).toContainEqual(
      expect.objectContaining({ code: "EVIDENCE_ARTIFACT_ORPHAN" }),
    );
  });
});
