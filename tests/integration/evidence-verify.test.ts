import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { EvidenceImportService, EvidenceVerifyService } from "@ai-native-qa-workbench/application";
import {
  EVIDENCE_ARTIFACT_DIRECTORY_RELATIVE_PATH,
  EVIDENCE_FILE_RELATIVE_PATH,
  FileEvidenceStore,
  FileProjectStore,
  serializeEvidenceSnapshot,
} from "@ai-native-qa-workbench/project-store";
import { createEvidenceAdapterRegistry } from "@ai-native-qa-workbench/evidence";

const temporaryDirectories: string[] = [];
const fixturePath = new URL("../fixtures/evidence/junit-minimal.xml", import.meta.url);

async function createProject(): Promise<{ directory: string; reportPath: string }> {
  const directory = await mkdtemp(join(tmpdir(), "qaw-evidence-verify-"));
  temporaryDirectories.push(directory);
  await new FileProjectStore().initProject({ rootDirectory: directory });
  const reportPath = join(directory, "report.xml");
  await writeFile(reportPath, await readFile(fixturePath));
  return { directory, reportPath };
}

async function importReport(directory: string, reportPath: string): Promise<void> {
  const projectStore = new FileProjectStore();
  const evidenceStore = new FileEvidenceStore();
  const importer = new EvidenceImportService({
    projectStore,
    evidenceStore,
    adapters: createEvidenceAdapterRegistry(),
    now: () => "2026-09-22T01:00:00Z",
  });
  const result = await importer.import({
    rootDirectory: directory,
    reportPath,
    format: "junit",
    runId: "run-verify",
  });
  expect(result.imported).toBe(true);
}

function artifactPath(directory: string, relativePath: string): string {
  return join(directory, EVIDENCE_ARTIFACT_DIRECTORY_RELATIVE_PATH, relativePath);
}

function expectCode(
  result: { valid: boolean; diagnostics: readonly { code: string }[] },
  code: string,
): void {
  expect(result.valid).toBe(false);
  expect(result.diagnostics).toContainEqual(expect.objectContaining({ code }));
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("EvidenceVerifyService and FileEvidenceStore integrity boundary", () => {
  it("accepts a valid empty Evidence project without mutating trust or metadata", async () => {
    const { directory } = await createProject();
    const store = new FileEvidenceStore();
    const before = await store.readEvidence(directory);
    const result = await new EvidenceVerifyService({ evidenceStore: store }).verify(directory);
    const after = await store.readEvidence(directory);

    expect(result).toEqual({ valid: true, revision: null, diagnostics: [] });
    expect(after).toEqual(before);
  });

  it("stages and commits content-addressed artifacts idempotently", async () => {
    const { directory } = await createProject();
    const store = new FileEvidenceStore();
    const bytes = new TextEncoder().encode("artifact");
    const expectedSha = createHash("sha256").update(bytes).digest("hex");

    const first = await store.stageArtifact(directory, bytes);
    await store.commitArtifact(first);
    const second = await store.stageArtifact(directory, bytes);
    await store.commitArtifact(second);

    expect(first.reference).toEqual({
      id: "artifact-" + expectedSha,
      relativePath: "artifact-" + expectedSha + ".bin",
      mediaType: "application/octet-stream",
      sizeBytes: bytes.byteLength,
      sha256: expectedSha,
    });
    await expect(readFile(first.finalPath)).resolves.toEqual(Buffer.from(bytes));
  });

  it("reports missing, size, and checksum failures without changing the manifest", async () => {
    const { directory, reportPath } = await createProject();
    await importReport(directory, reportPath);
    const store = new FileEvidenceStore();
    const before = await store.readEvidence(directory);
    const record = before.evidence!.evidenceRecords[0]!;
    const path = artifactPath(directory, record.artifact.relativePath);
    const verifier = new EvidenceVerifyService({ evidenceStore: store });

    await rm(path);
    expectCode(await verifier.verify(directory), "EVIDENCE_ARTIFACT_MISSING");

    await writeFile(path, Buffer.alloc(record.artifact.sizeBytes + 1, 0x78));
    expectCode(await verifier.verify(directory), "EVIDENCE_ARTIFACT_SIZE_MISMATCH");

    await writeFile(path, Buffer.alloc(record.artifact.sizeBytes, 0x79));
    const checksumResult = await verifier.verify(directory);
    expectCode(checksumResult, "EVIDENCE_ARTIFACT_CHECKSUM_MISMATCH");
    expect(await store.readEvidence(directory)).toEqual(before);
  });

  it("reports unreferenced artifacts and ignores the temporary staging directory", async () => {
    const { directory, reportPath } = await createProject();
    await importReport(directory, reportPath);
    const evidenceRoot = join(directory, EVIDENCE_ARTIFACT_DIRECTORY_RELATIVE_PATH);
    await writeFile(join(evidenceRoot, "orphan.bin"), "orphan", "utf8");
    await mkdir(join(evidenceRoot, ".tmp"), { recursive: true });
    await writeFile(join(evidenceRoot, ".tmp", "in-flight.tmp"), "temporary", "utf8");

    const result = await new FileEvidenceStore().verifyEvidence(directory);

    expectCode(result, "EVIDENCE_ARTIFACT_ORPHAN");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        path: EVIDENCE_ARTIFACT_DIRECTORY_RELATIVE_PATH + "/orphan.bin",
      }),
    );
    expect(result.diagnostics).not.toContainEqual(
      expect.objectContaining({ path: "evidence/.tmp/in-flight.tmp" }),
    );
  });

  it("rejects a manifest artifact symlink without following it", async () => {
    const { directory, reportPath } = await createProject();
    await importReport(directory, reportPath);
    const store = new FileEvidenceStore();
    const snapshot = (await store.readEvidence(directory)).evidence!;
    const record = snapshot.evidenceRecords[0]!;
    const outsidePath = join(directory, "outside.xml");
    const linkedRelativePath = "linked.xml";
    const linkedPath = artifactPath(directory, linkedRelativePath);
    await writeFile(
      outsidePath,
      await readFile(artifactPath(directory, record.artifact.relativePath)),
    );
    await rm(artifactPath(directory, record.artifact.relativePath));
    await symlink(outsidePath, linkedPath);
    record.artifact.relativePath = linkedRelativePath;
    await writeFile(
      join(directory, EVIDENCE_FILE_RELATIVE_PATH),
      serializeEvidenceSnapshot(snapshot),
      "utf8",
    );

    const result = await store.verifyEvidence(directory);

    expectCode(result, "EVIDENCE_ARTIFACT_PATH_UNSAFE");
    expect(
      (await store.readEvidence(directory)).evidence?.evidenceRecords[0]?.provenance.trust,
    ).toBe("unverified");
  });

  it("fails closed for a manifest path escape", async () => {
    const { directory, reportPath } = await createProject();
    await importReport(directory, reportPath);
    const manifestPath = join(directory, EVIDENCE_FILE_RELATIVE_PATH);
    const raw = await readFile(manifestPath, "utf8");
    const result = await new FileEvidenceStore().verifyEvidence(directory);
    await writeFile(
      manifestPath,
      raw.replace(/relativePath: [^\n]+/, "relativePath: ../outside.bin"),
      "utf8",
    );

    const invalid = await new FileEvidenceStore().verifyEvidence(directory);

    expect(result.valid).toBe(true);
    expectCode(invalid, "EVIDENCE_ARTIFACT_PATH_INVALID");
  });

  it("rejects a pre-existing final-path symlink during artifact commit", async () => {
    const { directory } = await createProject();
    const store = new FileEvidenceStore();
    const stage = await store.stageArtifact(directory, new TextEncoder().encode("safe"));
    const outsidePath = join(directory, "outside.bin");
    await writeFile(outsidePath, "outside", "utf8");
    await symlink(outsidePath, stage.finalPath);

    await expect(store.commitArtifact(stage)).rejects.toMatchObject({
      code: "EVIDENCE_ARTIFACT_PATH_UNSAFE",
    });
    await store.discardArtifact(stage);
  });
});
