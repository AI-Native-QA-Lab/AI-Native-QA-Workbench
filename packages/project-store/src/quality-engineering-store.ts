import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  QUALITY_ENGINEERING_SCHEMA_VERSION,
  validateQualityEngineeringSnapshot,
  type EvidenceSnapshot,
  type QualityEngineeringSnapshot,
  type QualityTarget,
} from "@ai-native-qa-workbench/domain";

import { FileEvidenceStore } from "./evidence-store.js";
import { FileProjectStore } from "./file-project-store.js";
import { currentRevision, revisionFor, writeRevisionedFile } from "./revisioned-file.js";
import {
  parseQualityEngineeringFile,
  serializeQualityEngineeringSnapshot,
  validateQualityEngineeringSnapshotKeys,
} from "./quality-engineering-file.js";
import {
  QUALITY_ENGINEERING_FILE_RELATIVE_PATH,
  type EvidenceStore,
  type ProjectStore,
  type QualityEngineeringReadResult,
  type QualityEngineeringStore,
  type QualityEngineeringValidationResult,
  type QualityEngineeringWriteResult,
  type StoreDiagnostic,
  type StoreValidationResult,
} from "./types.js";

function qualityEngineeringPathFor(rootDirectory: string): string {
  return join(resolve(rootDirectory), QUALITY_ENGINEERING_FILE_RELATIVE_PATH);
}

function diagnostic(code: StoreDiagnostic["code"], path: string, message: string): StoreDiagnostic {
  return { code, message, path, severity: "error" };
}

function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function emptySnapshot(): QualityEngineeringSnapshot {
  return {
    schemaVersion: QUALITY_ENGINEERING_SCHEMA_VERSION,
    assessments: [],
    gates: [],
    humanDecisions: [],
  };
}

function emptyReadResult(): QualityEngineeringReadResult {
  return { valid: true, qualityEngineering: emptySnapshot(), revision: null, diagnostics: [] };
}

function withDiagnostics(
  current: QualityEngineeringReadResult,
  diagnostics: readonly StoreDiagnostic[],
): QualityEngineeringValidationResult {
  return {
    valid: diagnostics.length === 0,
    ...(current.qualityEngineering ? { qualityEngineering: current.qualityEngineering } : {}),
    revision: current.revision,
    diagnostics,
  };
}

async function validateCrossFileReferences(
  rootDirectory: string,
  snapshot: QualityEngineeringSnapshot,
  projectStore: ProjectStore,
  evidenceStore: EvidenceStore,
): Promise<readonly StoreDiagnostic[]> {
  const [quality, evidence] = await Promise.all([
    projectStore.validateQuality(rootDirectory),
    evidenceStore.validateEvidence(rootDirectory),
  ]);
  const diagnostics: StoreDiagnostic[] = [];
  if (!quality.valid || !quality.projectQuality) diagnostics.push(...quality.diagnostics);
  if (!evidence.valid || !evidence.evidence) diagnostics.push(...evidence.diagnostics);
  if (diagnostics.length > 0) return diagnostics;

  snapshot.assessments.forEach((assessment, index) => {
    for (const evidenceId of assessment.evidenceIds) {
      if (!evidence.evidence!.evidenceRecords.some((record) => record.id === evidenceId)) {
        diagnostics.push(
          diagnostic(
            "QUALITY_ENGINEERING_EVIDENCE_NOT_FOUND",
            `qualityEngineering.assessments[${index}].evidenceIds`,
            `Referenced Evidence does not exist: ${evidenceId}`,
          ),
        );
      }
    }
    const targetDiagnostic = targetReferenceDiagnostic(
      assessment.target,
      index,
      quality,
      evidence.evidence,
    );
    if (targetDiagnostic) diagnostics.push(targetDiagnostic);
  });

  return diagnostics;
}

function targetReferenceDiagnostic(
  target: QualityTarget,
  index: number,
  quality: StoreValidationResult,
  evidence: EvidenceSnapshot | undefined,
): StoreDiagnostic | undefined {
  if (target.type === "requirement") {
    const requirementIds = new Set(
      quality.projectQuality?.requirements.map((requirement) => requirement.id) ?? [],
    );
    if (!requirementIds.has(target.id)) {
      return diagnostic(
        "QUALITY_ENGINEERING_REQUIREMENT_NOT_FOUND",
        `qualityEngineering.assessments[${index}].target.id`,
        `Referenced Requirement does not exist: ${target.id}`,
      );
    }
  }
  if (target.type === "test-run") {
    const testRunIds = new Set(evidence?.testRuns.map((testRun) => testRun.id) ?? []);
    if (!testRunIds.has(target.id)) {
      return diagnostic(
        "QUALITY_ENGINEERING_TEST_RUN_NOT_FOUND",
        `qualityEngineering.assessments[${index}].target.id`,
        `Referenced TestRun does not exist: ${target.id}`,
      );
    }
  }
  return undefined;
}

export class FileQualityEngineeringStore implements QualityEngineeringStore {
  constructor(
    private readonly projectStore: ProjectStore = new FileProjectStore(),
    private readonly evidenceStore: EvidenceStore = new FileEvidenceStore(),
  ) {}

  async readQualityEngineering(rootDirectory: string): Promise<QualityEngineeringReadResult> {
    const path = qualityEngineeringPathFor(rootDirectory);
    try {
      const contents = await readFile(path);
      const parsed = parseQualityEngineeringFile(contents.toString("utf8"));
      return { ...parsed, revision: revisionFor(contents) };
    } catch (error) {
      if (isCode(error, "ENOENT")) return emptyReadResult();
      throw error;
    }
  }

  async validateQualityEngineering(
    rootDirectory: string,
  ): Promise<QualityEngineeringValidationResult> {
    const current = await this.readQualityEngineering(rootDirectory);
    if (!current.valid || !current.qualityEngineering) return current;

    const diagnostics = await validateCrossFileReferences(
      rootDirectory,
      current.qualityEngineering,
      this.projectStore,
      this.evidenceStore,
    );
    return withDiagnostics(current, diagnostics);
  }

  async writeQualityEngineering(
    rootDirectory: string,
    snapshot: QualityEngineeringSnapshot,
    expectedRevision: string | null,
  ): Promise<QualityEngineeringWriteResult> {
    const path = qualityEngineeringPathFor(rootDirectory);
    const keyDiagnostics = validateQualityEngineeringSnapshotKeys(snapshot);
    if (keyDiagnostics.length > 0) {
      return { written: false, qualityEngineeringPath: path, diagnostics: keyDiagnostics };
    }

    const validation = validateQualityEngineeringSnapshot(snapshot);
    if (!validation.valid) {
      return { written: false, qualityEngineeringPath: path, diagnostics: validation.diagnostics };
    }

    const current = await currentRevision(path);
    if (current !== expectedRevision) {
      return {
        written: false,
        qualityEngineeringPath: path,
        diagnostics: [
          diagnostic(
            "QUALITY_ENGINEERING_REVISION_CONFLICT",
            QUALITY_ENGINEERING_FILE_RELATIVE_PATH,
            "Quality engineering file revision does not match the expected revision.",
          ),
        ],
      };
    }

    const crossFileDiagnostics = await validateCrossFileReferences(
      rootDirectory,
      snapshot,
      this.projectStore,
      this.evidenceStore,
    );
    if (crossFileDiagnostics.length > 0) {
      return {
        written: false,
        qualityEngineeringPath: path,
        diagnostics: crossFileDiagnostics,
      };
    }

    const contents = serializeQualityEngineeringSnapshot(snapshot);
    const directory = join(resolve(rootDirectory), ".ai-qa");
    await mkdir(directory, { recursive: true });

    const written = await writeRevisionedFile(path, contents, expectedRevision);
    if (!written.written) {
      return {
        written: false,
        qualityEngineeringPath: path,
        diagnostics: [
          diagnostic(
            "QUALITY_ENGINEERING_REVISION_CONFLICT",
            QUALITY_ENGINEERING_FILE_RELATIVE_PATH,
            "Quality engineering file revision does not match the expected revision.",
          ),
        ],
      };
    }

    return {
      written: true,
      qualityEngineeringPath: path,
      revision: written.revision,
      diagnostics: [],
    };
  }
}
