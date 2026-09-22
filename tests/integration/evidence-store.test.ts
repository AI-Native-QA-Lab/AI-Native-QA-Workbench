import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  EVIDENCE_ARTIFACT_DIRECTORY_RELATIVE_PATH,
  EVIDENCE_FILE_RELATIVE_PATH,
  FileEvidenceStore,
  FileProjectStore,
} from "@ai-native-qa-workbench/project-store";
import {
  QUALITY_SCHEMA_VERSION,
  type EvidenceSnapshot,
  type QualitySnapshot,
} from "@ai-native-qa-workbench/domain";

const temporaryDirectories: string[] = [];
const artifactContents = "evidence artifact";

function checksum(contents: string): string {
  return createHash("sha256").update(contents, "utf8").digest("hex");
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

function evidenceSnapshot(
  options: {
    relativePath?: string;
    testCaseId?: string;
    contents?: string;
  } = {},
): EvidenceSnapshot {
  const contents = options.contents ?? artifactContents;
  const result = {
    name: "登录成功",
    status: "passed" as const,
    durationMs: 120,
    ...(options.testCaseId === undefined ? {} : { testCaseId: options.testCaseId }),
  };

  return {
    schemaVersion: "0.2",
    testRuns: [
      {
        id: "run-junit-login",
        format: "junit",
        status: "passed",
        startedAt: "2026-09-22T01:00:00Z",
        completedAt: "2026-09-22T01:01:00Z",
        results: [result],
      },
    ],
    evidenceRecords: [
      {
        id: "evidence-run-junit-login",
        testRunId: "run-junit-login",
        kind: "test-result",
        artifact: {
          id: "artifact-run-junit-login",
          relativePath: options.relativePath ?? "run.xml",
          mediaType: "application/xml",
          sizeBytes: Buffer.byteLength(contents, "utf8"),
          sha256: checksum(contents),
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

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "qaw-evidence-store-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function initializeProject(directory: string): Promise<void> {
  const result = await new FileProjectStore().initProject({ rootDirectory: directory });
  expect(result.created).toBe(true);
}

async function writeArtifact(directory: string, relativePath = "run.xml"): Promise<void> {
  const artifactPath = join(directory, EVIDENCE_ARTIFACT_DIRECTORY_RELATIVE_PATH, relativePath);
  await mkdir(join(artifactPath, ".."), { recursive: true });
  await writeFile(artifactPath, artifactContents, "utf8");
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("FileEvidenceStore manifest boundary", () => {
  it("treats an absent evidence manifest as a valid empty snapshot", async () => {
    const directory = await createTemporaryDirectory();
    await initializeProject(directory);

    const result = await new FileEvidenceStore().validateEvidence(directory);

    expect(result.valid).toBe(true);
    expect(result.revision).toBeNull();
    expect(result.evidence).toEqual({
      schemaVersion: "0.2",
      testRuns: [],
      evidenceRecords: [],
    });
  });

  it("writes, reads, and validates a manifest with a quality TestCase reference", async () => {
    const directory = await createTemporaryDirectory();
    await initializeProject(directory);
    await new FileProjectStore().writeQuality(directory, qualitySnapshotWithTestCase());
    await writeArtifact(directory);
    const snapshot = evidenceSnapshot({ testCaseId: "test-login-success" });
    const store = new FileEvidenceStore();

    const written = await store.writeEvidence(directory, snapshot, null);
    const read = await store.readEvidence(directory);
    const validated = await store.validateEvidence(directory);

    expect(written).toMatchObject({
      written: true,
      evidencePath: join(directory, EVIDENCE_FILE_RELATIVE_PATH),
    });
    expect(written.revision).toMatch(/^[a-f0-9]{64}$/);
    expect(read).toMatchObject({
      valid: true,
      evidence: snapshot,
      revision: written.revision,
      diagnostics: [],
    });
    expect(validated).toMatchObject({
      valid: true,
      evidence: snapshot,
      revision: written.revision,
      diagnostics: [],
    });
  });

  it("reports a missing quality TestCase reference during cross-file validation", async () => {
    const directory = await createTemporaryDirectory();
    await initializeProject(directory);
    await writeArtifact(directory);
    const store = new FileEvidenceStore();

    const written = await store.writeEvidence(
      directory,
      evidenceSnapshot({ testCaseId: "test-missing" }),
      null,
    );
    const validated = await store.validateEvidence(directory);

    expect(written.written).toBe(true);
    expect(validated.valid).toBe(false);
    expect(validated.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "EVIDENCE_REFERENCE_NOT_FOUND",
        path: "evidence.testRuns[0].results[0].testCaseId",
      }),
    );
  });

  it("reports a referenced artifact that is missing without hashing it", async () => {
    const directory = await createTemporaryDirectory();
    await initializeProject(directory);
    const store = new FileEvidenceStore();
    await expect(store.writeEvidence(directory, evidenceSnapshot(), null)).resolves.toMatchObject({
      written: true,
    });

    const validated = await store.validateEvidence(directory);

    expect(validated.valid).toBe(false);
    expect(validated.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "EVIDENCE_ARTIFACT_MISSING",
        path: "evidence.evidenceRecords[0].artifact.relativePath",
      }),
    );
  });

  it.each(["/absolute.bin", "../outside.bin", "nested/../outside.bin", "unsafe\u0000.bin"])(
    "rejects unsafe artifact path %s before writing the manifest",
    async (relativePath) => {
      const directory = await createTemporaryDirectory();
      await initializeProject(directory);

      const result = await new FileEvidenceStore().writeEvidence(
        directory,
        evidenceSnapshot({ relativePath }),
        null,
      );

      expect(result.written).toBe(false);
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({ code: "EVIDENCE_ARTIFACT_PATH_INVALID" }),
      );
      await expect(
        readFile(join(directory, EVIDENCE_FILE_RELATIVE_PATH), "utf8"),
      ).rejects.toMatchObject({
        code: "ENOENT",
      });
    },
  );

  it("rejects a symlinked artifact that escapes the evidence directory", async () => {
    const directory = await createTemporaryDirectory();
    await initializeProject(directory);
    const outsidePath = join(directory, "outside.xml");
    const linkedPath = join(directory, EVIDENCE_ARTIFACT_DIRECTORY_RELATIVE_PATH, "linked.xml");
    await writeFile(outsidePath, artifactContents, "utf8");
    await mkdir(join(directory, EVIDENCE_ARTIFACT_DIRECTORY_RELATIVE_PATH), { recursive: true });
    await symlink(outsidePath, linkedPath);
    const store = new FileEvidenceStore();
    await store.writeEvidence(directory, evidenceSnapshot({ relativePath: "linked.xml" }), null);

    const validated = await store.validateEvidence(directory);

    expect(validated.valid).toBe(false);
    expect(validated.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "EVIDENCE_ARTIFACT_PATH_UNSAFE",
        path: "evidence.evidenceRecords[0].artifact.relativePath",
      }),
    );
  });

  it("uses raw manifest bytes for revisions and rejects stale creation/update writes", async () => {
    const directory = await createTemporaryDirectory();
    await initializeProject(directory);
    const store = new FileEvidenceStore();
    const snapshot = evidenceSnapshot();

    const first = await store.writeEvidence(directory, snapshot, null);
    const staleCreate = await store.writeEvidence(directory, snapshot, null);
    const staleUpdate = await store.writeEvidence(directory, snapshot, "0".repeat(64));
    const updated = await store.writeEvidence(directory, snapshot, first.revision ?? null);
    const raw = await readFile(join(directory, EVIDENCE_FILE_RELATIVE_PATH));

    expect(first.written).toBe(true);
    expect(staleCreate).toMatchObject({
      written: false,
      diagnostics: [expect.objectContaining({ code: "EVIDENCE_REVISION_CONFLICT" })],
    });
    expect(staleUpdate).toMatchObject({
      written: false,
      diagnostics: [expect.objectContaining({ code: "EVIDENCE_REVISION_CONFLICT" })],
    });
    expect(updated.written).toBe(true);
    expect(updated.revision).toBe(checksum(raw.toString("utf8")));
  });

  it("preserves a raw revision even when the manifest cannot be parsed", async () => {
    const directory = await createTemporaryDirectory();
    await initializeProject(directory);
    const raw = "schemaVersion: [";
    await mkdir(join(directory, ".ai-qa"), { recursive: true });
    await writeFile(join(directory, EVIDENCE_FILE_RELATIVE_PATH), raw, "utf8");

    const result = await new FileEvidenceStore().readEvidence(directory);

    expect(result.valid).toBe(false);
    expect(result.revision).toBe(checksum(raw));
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "EVIDENCE_FILE_MALFORMED" }),
    );
  });

  it("does not leave a temporary manifest after an atomic write", async () => {
    const directory = await createTemporaryDirectory();
    await initializeProject(directory);

    await new FileEvidenceStore().writeEvidence(directory, evidenceSnapshot(), null);

    const files = await readdir(join(directory, ".ai-qa"));
    expect(files.some((file) => file.endsWith(".tmp"))).toBe(false);
  });
});
