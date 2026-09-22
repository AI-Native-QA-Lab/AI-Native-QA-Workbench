import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  EVIDENCE_SCHEMA_VERSION,
  validateEvidenceSnapshot,
  type EvidenceSnapshot,
  type QualitySnapshot,
} from "@ai-native-qa-workbench/domain";

import { parseQualityFile } from "./quality-file.js";
import { parseEvidenceFile, serializeEvidenceSnapshot } from "./evidence-file.js";
import {
  EVIDENCE_ARTIFACT_DIRECTORY_RELATIVE_PATH,
  EVIDENCE_FILE_RELATIVE_PATH,
  QUALITY_FILE_RELATIVE_PATH,
  type EvidenceStore,
  type EvidenceValidationResult,
  type EvidenceWriteResult,
  type StoreDiagnostic,
} from "./types.js";

function evidencePathFor(rootDirectory: string): string {
  return join(resolve(rootDirectory), EVIDENCE_FILE_RELATIVE_PATH);
}

function artifactRootFor(rootDirectory: string): string {
  return join(resolve(rootDirectory), EVIDENCE_ARTIFACT_DIRECTORY_RELATIVE_PATH);
}

function diagnostic(code: StoreDiagnostic["code"], path: string, message: string): StoreDiagnostic {
  return { code, message, path, severity: "error" };
}

function revisionFor(contents: Uint8Array): string {
  return createHash("sha256").update(contents).digest("hex");
}

function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function emptyEvidenceResult(): EvidenceValidationResult {
  return {
    valid: true,
    evidence: {
      schemaVersion: EVIDENCE_SCHEMA_VERSION,
      testRuns: [],
      evidenceRecords: [],
    },
    revision: null,
    diagnostics: [],
  };
}

function isSafeRelativePath(value: string): boolean {
  if (value.length === 0 || value.includes("\u0000")) return false;
  if (value.startsWith("/") || value.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(value)) {
    return false;
  }

  const segments = value.split(/[\\/]/);
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function artifactPathFor(rootDirectory: string, relativePath: string): string {
  return join(artifactRootFor(rootDirectory), ...relativePath.split(/[\\/]/));
}

function pathEscapes(rootPath: string, candidatePath: string): boolean {
  const path = relative(rootPath, candidatePath);
  return path === ".." || path.startsWith(".." + sep) || isAbsolute(path);
}

async function artifactDiagnostic(
  rootDirectory: string,
  relativePath: string,
  path: string,
): Promise<StoreDiagnostic | undefined> {
  if (!isSafeRelativePath(relativePath)) {
    return diagnostic(
      "EVIDENCE_ARTIFACT_PATH_UNSAFE",
      path,
      "Evidence artifact path is not a safe relative path.",
    );
  }

  const artifactRoot = artifactRootFor(rootDirectory);
  const artifactPath = artifactPathFor(rootDirectory, relativePath);
  let artifactRootStat;
  try {
    artifactRootStat = await lstat(artifactRoot);
  } catch (error) {
    if (isCode(error, "ENOENT")) {
      return diagnostic(
        "EVIDENCE_ARTIFACT_MISSING",
        path,
        "Referenced evidence artifact is missing.",
      );
    }
    throw error;
  }

  if (artifactRootStat.isSymbolicLink() || !artifactRootStat.isDirectory()) {
    return diagnostic(
      "EVIDENCE_ARTIFACT_PATH_UNSAFE",
      path,
      "Evidence artifact directory is not a regular directory.",
    );
  }

  let artifactStat;
  try {
    artifactStat = await lstat(artifactPath);
  } catch (error) {
    if (isCode(error, "ENOENT")) {
      return diagnostic(
        "EVIDENCE_ARTIFACT_MISSING",
        path,
        "Referenced evidence artifact is missing.",
      );
    }
    throw error;
  }

  if (artifactStat.isSymbolicLink() || !artifactStat.isFile()) {
    return diagnostic(
      "EVIDENCE_ARTIFACT_PATH_UNSAFE",
      path,
      "Referenced evidence artifact must be a regular file inside the evidence directory.",
    );
  }

  const [realArtifactRoot, realArtifactPath] = await Promise.all([
    realpath(artifactRoot),
    realpath(artifactPath),
  ]);
  if (pathEscapes(realArtifactRoot, realArtifactPath)) {
    return diagnostic(
      "EVIDENCE_ARTIFACT_PATH_UNSAFE",
      path,
      "Referenced evidence artifact resolves outside the evidence directory.",
    );
  }

  return undefined;
}

async function currentRevision(path: string): Promise<string | null> {
  try {
    const contents = await readFile(path);
    return revisionFor(contents);
  } catch (error) {
    if (isCode(error, "ENOENT")) return null;
    throw error;
  }
}

async function qualityFor(
  rootDirectory: string,
): Promise<
  | { valid: true; projectQuality: QualitySnapshot }
  | { valid: false; diagnostics: readonly StoreDiagnostic[] }
> {
  const qualityPath = join(resolve(rootDirectory), QUALITY_FILE_RELATIVE_PATH);

  try {
    const contents = await readFile(qualityPath, "utf8");
    const result = parseQualityFile(contents);
    if (result.valid && result.projectQuality) {
      return { valid: true, projectQuality: result.projectQuality };
    }
    return { valid: false, diagnostics: result.diagnostics };
  } catch (error) {
    if (isCode(error, "ENOENT")) {
      return {
        valid: false,
        diagnostics: [
          diagnostic(
            "QUALITY_FILE_MISSING",
            QUALITY_FILE_RELATIVE_PATH,
            "Quality file does not exist.",
          ),
        ],
      };
    }
    throw error;
  }
}

export class FileEvidenceStore implements EvidenceStore {
  async readEvidence(rootDirectory: string): Promise<EvidenceValidationResult> {
    const evidencePath = evidencePathFor(rootDirectory);

    try {
      const contents = await readFile(evidencePath);
      const parsed = parseEvidenceFile(contents.toString("utf8"));
      return {
        ...parsed,
        revision: revisionFor(contents),
      };
    } catch (error) {
      if (isCode(error, "ENOENT")) return emptyEvidenceResult();
      throw error;
    }
  }

  async validateEvidence(rootDirectory: string): Promise<EvidenceValidationResult> {
    const evidence = await this.readEvidence(rootDirectory);
    if (!evidence.valid || !evidence.evidence) return evidence;

    const quality = await qualityFor(rootDirectory);
    if (!quality.valid) {
      return {
        ...evidence,
        valid: false,
        diagnostics: quality.diagnostics,
      };
    }

    const diagnostics: StoreDiagnostic[] = [];
    const testCaseIds = new Set(quality.projectQuality.testCases.map((testCase) => testCase.id));

    evidence.evidence.testRuns.forEach((testRun, testRunIndex) => {
      testRun.results.forEach((result, resultIndex) => {
        if (result.testCaseId && !testCaseIds.has(result.testCaseId)) {
          diagnostics.push(
            diagnostic(
              "EVIDENCE_REFERENCE_NOT_FOUND",
              "evidence.testRuns[" + testRunIndex + "].results[" + resultIndex + "].testCaseId",
              "Referenced TestCase does not exist: " + result.testCaseId,
            ),
          );
        }
      });
    });

    for (const [recordIndex, record] of evidence.evidence.evidenceRecords.entries()) {
      const artifactIssue = await artifactDiagnostic(
        rootDirectory,
        record.artifact.relativePath,
        "evidence.evidenceRecords[" + recordIndex + "].artifact.relativePath",
      );
      if (artifactIssue) diagnostics.push(artifactIssue);
    }

    return {
      ...evidence,
      valid: diagnostics.length === 0,
      diagnostics,
    };
  }

  async writeEvidence(
    rootDirectory: string,
    snapshot: EvidenceSnapshot,
    expectedRevision: string | null,
  ): Promise<EvidenceWriteResult> {
    const evidencePath = evidencePathFor(rootDirectory);
    const validation = validateEvidenceSnapshot(snapshot);
    if (!validation.valid) {
      return {
        written: false,
        evidencePath,
        diagnostics: validation.diagnostics,
      };
    }

    const contents = serializeEvidenceSnapshot(snapshot);
    const evidenceDirectory = join(resolve(rootDirectory), ".ai-qa");
    await mkdir(evidenceDirectory, { recursive: true });

    const current = await currentRevision(evidencePath);
    if (current !== expectedRevision) {
      return {
        written: false,
        evidencePath,
        diagnostics: [
          diagnostic(
            "EVIDENCE_REVISION_CONFLICT",
            EVIDENCE_FILE_RELATIVE_PATH,
            "Evidence manifest revision does not match the expected revision.",
          ),
        ],
      };
    }

    const temporaryPath = evidencePath + "." + randomUUID() + ".tmp";
    let renamed = false;
    try {
      await writeFile(temporaryPath, contents, "utf8");
      const beforeRename = await currentRevision(evidencePath);
      if (beforeRename !== expectedRevision) {
        return {
          written: false,
          evidencePath,
          diagnostics: [
            diagnostic(
              "EVIDENCE_REVISION_CONFLICT",
              EVIDENCE_FILE_RELATIVE_PATH,
              "Evidence manifest changed before the atomic write.",
            ),
          ],
        };
      }

      await rename(temporaryPath, evidencePath);
      renamed = true;
    } finally {
      if (!renamed) await rm(temporaryPath, { force: true }).catch(() => undefined);
    }

    return {
      written: true,
      evidencePath,
      revision: revisionFor(Buffer.from(contents, "utf8")),
      diagnostics: [],
    };
  }
}
