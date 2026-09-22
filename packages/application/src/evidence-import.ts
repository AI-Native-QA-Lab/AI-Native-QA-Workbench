import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import {
  canonicalizeEvidenceValue,
  EVIDENCE_SCHEMA_VERSION,
  validateEvidenceSnapshot,
  type Evidence,
  type EvidenceFormat,
  type EvidenceSnapshot,
  type TestRun,
} from "@ai-native-qa-workbench/domain";
import {
  EvidenceParseError,
  MAX_EVIDENCE_IMPORT_BYTES,
  normalizeEvidenceFormat,
  type EvidenceAdapterRegistry,
} from "@ai-native-qa-workbench/evidence";
import type {
  EvidenceArtifactStore,
  EvidenceStore,
  ProjectStore,
  StagedEvidenceArtifact,
  StoreDiagnostic,
} from "@ai-native-qa-workbench/project-store";
import { EvidenceStoreError } from "@ai-native-qa-workbench/project-store";

export interface EvidenceImportInput {
  rootDirectory: string;
  reportPath: string;
  format: EvidenceFormat;
  runId?: string;
  now?: string;
}

export interface EvidenceImportResult {
  imported: boolean;
  idempotent: boolean;
  testRunId?: string;
  evidenceId?: string;
  diagnostics: readonly StoreDiagnostic[];
}

export interface EvidenceImporter {
  import(input: EvidenceImportInput): Promise<EvidenceImportResult>;
}

function diagnostic(code: StoreDiagnostic["code"], path: string, message: string): StoreDiagnostic {
  return { code, path, message, severity: "error" };
}

function failure(diagnostics: readonly StoreDiagnostic[]): EvidenceImportResult {
  return { imported: false, idempotent: false, diagnostics };
}

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function normalizeImportedAt(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new EvidenceStoreError(
      "EVIDENCE_PROVENANCE_TIME_INVALID",
      "now",
      "Import time must be a valid timestamp.",
    );
  }
  return date.toISOString();
}

function parseErrorDiagnostic(error: unknown): StoreDiagnostic {
  if (error instanceof EvidenceParseError) {
    return diagnostic(error.code, error.path, error.message);
  }
  if (error instanceof EvidenceStoreError) {
    return diagnostic(error.code, error.path, error.message);
  }
  return diagnostic(
    "EVIDENCE_REPORT_READ_FAILED",
    "report",
    error instanceof Error ? error.message : "Unable to import evidence report.",
  );
}

function mapDomainDiagnostics(
  diagnostics: readonly {
    code: StoreDiagnostic["code"];
    path: string;
    message: string;
    severity: "error";
  }[],
): StoreDiagnostic[] {
  return diagnostics.map((item) => ({
    ...item,
    path: "evidence." + item.path,
  }));
}

function normalizedImport(testRun: TestRun, evidence: Evidence): string {
  return JSON.stringify(
    canonicalizeEvidenceValue({
      testRun,
      evidence: {
        ...evidence,
        provenance: {
          ...evidence.provenance,
          importedAt: "",
        },
      },
    }),
  );
}

function referenceDiagnostics(
  testRun: TestRun,
  testRunIndex: number,
  testCaseIds: ReadonlySet<string>,
): StoreDiagnostic[] {
  const diagnostics: StoreDiagnostic[] = [];
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
  return diagnostics;
}

export class EvidenceImportService implements EvidenceImporter {
  private readonly projectStore: ProjectStore;
  private readonly evidenceStore: EvidenceStore & EvidenceArtifactStore;
  private readonly adapters: EvidenceAdapterRegistry;
  private readonly now: () => string;

  constructor(dependencies: {
    projectStore: ProjectStore;
    evidenceStore: EvidenceStore & EvidenceArtifactStore;
    adapters: EvidenceAdapterRegistry;
    now?: () => string;
  }) {
    this.projectStore = dependencies.projectStore;
    this.evidenceStore = dependencies.evidenceStore;
    this.adapters = dependencies.adapters;
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  async import(input: EvidenceImportInput): Promise<EvidenceImportResult> {
    const project = await this.projectStore.validateProject(input.rootDirectory);
    if (!project.valid) return failure(project.diagnostics);

    const quality = await this.projectStore.validateQuality(input.rootDirectory);
    if (!quality.valid || !quality.projectQuality) return failure(quality.diagnostics);

    const current = await this.evidenceStore.validateEvidence(input.rootDirectory);
    if (!current.valid || !current.evidence) return failure(current.diagnostics);

    const canonicalFormat = normalizeEvidenceFormat(String(input.format));
    if (!canonicalFormat) {
      return failure([
        diagnostic(
          "EVIDENCE_FORMAT_UNSUPPORTED",
          "format",
          "Unsupported evidence format: " + String(input.format),
        ),
      ]);
    }

    let bytes: Uint8Array;
    try {
      bytes = await readFile(input.reportPath);
    } catch (error) {
      const missing = error instanceof Error && "code" in error && error.code === "ENOENT";
      return failure([
        diagnostic(
          missing ? "EVIDENCE_REPORT_MISSING" : "EVIDENCE_REPORT_READ_FAILED",
          "report",
          error instanceof Error ? error.message : "Unable to read the evidence report.",
        ),
      ]);
    }
    if (bytes.byteLength > MAX_EVIDENCE_IMPORT_BYTES) {
      return failure([
        diagnostic("EVIDENCE_INPUT_TOO_LARGE", "input", "Evidence input exceeds the 16 MiB limit."),
      ]);
    }

    const rawChecksum = hashBytes(bytes);
    const runId = input.runId ?? "run-" + canonicalFormat + "-" + rawChecksum;
    const importedAtValue = input.now ?? this.now();
    let importedAt: string;
    try {
      importedAt = normalizeImportedAt(importedAtValue);
    } catch (error) {
      return failure([parseErrorDiagnostic(error)]);
    }

    let parsed;
    try {
      parsed = this.adapters.get(canonicalFormat).parse(bytes, {
        runId,
        sourceFileName: basename(input.reportPath),
        importedAt,
      });
    } catch (error) {
      return failure([parseErrorDiagnostic(error)]);
    }
    if (parsed.testRun.format !== canonicalFormat) {
      return failure([
        diagnostic(
          "EVIDENCE_REPORT_FIELD_INVALID",
          "testRun.format",
          "Adapter returned a TestRun with the wrong format.",
        ),
      ]);
    }

    let staged: StagedEvidenceArtifact;
    try {
      staged = await this.evidenceStore.stageArtifact(input.rootDirectory, bytes);
    } catch (error) {
      return failure([parseErrorDiagnostic(error)]);
    }

    const evidenceId = "evidence-" + runId + "-" + rawChecksum.slice(0, 16);
    const evidence: Evidence = {
      id: evidenceId,
      testRunId: runId,
      kind: "test-result",
      artifact: {
        ...staged.reference,
        mediaType: parsed.artifact.mediaType,
      },
      provenance: {
        sourceFormat: canonicalFormat,
        sourceFileName: basename(input.reportPath),
        importedAt,
        trust: "unverified",
      },
    };

    const existingRunIndex = current.evidence.testRuns.findIndex((testRun) => testRun.id === runId);
    if (existingRunIndex >= 0) {
      const existingRecord = current.evidence.evidenceRecords.find(
        (record) => record.testRunId === runId,
      );
      if (
        existingRecord &&
        normalizedImport(current.evidence.testRuns[existingRunIndex]!, existingRecord) ===
          normalizedImport(parsed.testRun, evidence)
      ) {
        await this.evidenceStore.discardArtifact(staged);
        return {
          imported: true,
          idempotent: true,
          testRunId: runId,
          evidenceId: existingRecord.id,
          diagnostics: [],
        };
      }
      await this.evidenceStore.discardArtifact(staged);
      return failure([
        diagnostic(
          "EVIDENCE_IMPORT_CONFLICT",
          "evidence.testRuns[" + existingRunIndex + "].id",
          "The run ID already refers to different evidence.",
        ),
      ]);
    }

    const testCaseIds = new Set(quality.projectQuality.testCases.map((testCase) => testCase.id));
    const referenceIssues = referenceDiagnostics(
      parsed.testRun,
      current.evidence.testRuns.length,
      testCaseIds,
    );
    if (referenceIssues.length > 0) {
      await this.evidenceStore.discardArtifact(staged);
      return failure(referenceIssues);
    }

    const merged: EvidenceSnapshot = {
      schemaVersion: EVIDENCE_SCHEMA_VERSION,
      testRuns: [...current.evidence.testRuns, parsed.testRun],
      evidenceRecords: [...current.evidence.evidenceRecords, evidence],
    };
    const validation = validateEvidenceSnapshot(merged);
    if (!validation.valid) {
      await this.evidenceStore.discardArtifact(staged);
      return failure(mapDomainDiagnostics(validation.diagnostics));
    }

    try {
      await this.evidenceStore.commitArtifact(staged);
    } catch (error) {
      await this.evidenceStore.discardArtifact(staged);
      return failure([parseErrorDiagnostic(error)]);
    }

    let written;
    try {
      written = await this.evidenceStore.writeEvidence(
        input.rootDirectory,
        merged,
        current.revision,
      );
    } catch (error) {
      return failure([parseErrorDiagnostic(error)]);
    }
    if (!written.written) return failure(written.diagnostics);

    const reloaded = await this.evidenceStore.validateEvidence(input.rootDirectory);
    if (!reloaded.valid) return failure(reloaded.diagnostics);

    return {
      imported: true,
      idempotent: false,
      testRunId: runId,
      evidenceId,
      diagnostics: [],
    };
  }
}
