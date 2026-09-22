import { parse, stringify } from "yaml";
import { z } from "zod";

import {
  EVIDENCE_SCHEMA_VERSION,
  validateEvidenceSnapshot,
  type EvidenceSnapshot,
  type ValidationResult,
} from "@ai-native-qa-workbench/domain";

import {
  EVIDENCE_FILE_RELATIVE_PATH,
  type EvidenceFileParseResult,
  type StoreDiagnostic,
} from "./types.js";

const evidenceFileSchema = z
  .object({
    schemaVersion: z.unknown(),
    evidence: z
      .object({
        testRuns: z.unknown().optional(),
        evidenceRecords: z.unknown().optional(),
      })
      .strict(),
  })
  .strict();

function diagnostic(code: StoreDiagnostic["code"], path: string, message: string): StoreDiagnostic {
  return {
    code,
    message,
    path,
    severity: "error",
  };
}

function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unknownKeyDiagnostics(
  value: unknown,
  path: string,
  allowedKeys: readonly string[],
): StoreDiagnostic[] {
  if (!isMapping(value)) return [];

  const allowed = new Set(allowedKeys);
  return Object.keys(value)
    .filter((key) => !allowed.has(key))
    .sort()
    .map((key) => {
      const keyPath = path + "." + key;
      return diagnostic("EVIDENCE_UNKNOWN_KEY", keyPath, "Unknown evidence file key: " + keyPath);
    });
}

export function validateEvidenceSnapshotKeys(input: unknown): readonly StoreDiagnostic[] {
  const diagnostics = unknownKeyDiagnostics(input, "evidence", [
    "schemaVersion",
    "testRuns",
    "evidenceRecords",
  ]);
  if (!isMapping(input)) return diagnostics;

  if (Array.isArray(input.testRuns)) {
    input.testRuns.forEach((testRun, testRunIndex) => {
      const testRunPath = "evidence.testRuns[" + testRunIndex + "]";
      diagnostics.push(
        ...unknownKeyDiagnostics(testRun, testRunPath, [
          "id",
          "format",
          "status",
          "startedAt",
          "completedAt",
          "results",
        ]),
      );
      if (!isMapping(testRun) || !Array.isArray(testRun.results)) return;

      testRun.results.forEach((result, resultIndex) => {
        diagnostics.push(
          ...unknownKeyDiagnostics(result, testRunPath + ".results[" + resultIndex + "]", [
            "name",
            "status",
            "durationMs",
            "testCaseId",
          ]),
        );
      });
    });
  }

  if (Array.isArray(input.evidenceRecords)) {
    input.evidenceRecords.forEach((record, recordIndex) => {
      const recordPath = "evidence.evidenceRecords[" + recordIndex + "]";
      diagnostics.push(
        ...unknownKeyDiagnostics(record, recordPath, [
          "id",
          "testRunId",
          "kind",
          "artifact",
          "provenance",
        ]),
      );
      if (!isMapping(record)) return;

      diagnostics.push(
        ...unknownKeyDiagnostics(record.artifact, recordPath + ".artifact", [
          "id",
          "relativePath",
          "mediaType",
          "sizeBytes",
          "sha256",
        ]),
      );
      diagnostics.push(
        ...unknownKeyDiagnostics(record.provenance, recordPath + ".provenance", [
          "sourceFormat",
          "sourceFileName",
          "importedAt",
          "trust",
          "runnerName",
          "runnerVersion",
        ]),
      );
    });
  }

  return diagnostics;
}

function malformed(message: string): EvidenceFileParseResult {
  return {
    valid: false,
    diagnostics: [diagnostic("EVIDENCE_FILE_MALFORMED", EVIDENCE_FILE_RELATIVE_PATH, message)],
  };
}

function mapDomainValidation(result: ValidationResult): EvidenceFileParseResult {
  if (result.valid) {
    throw new Error("Domain validation mapping requires an invalid Evidence snapshot.");
  }

  return {
    valid: false,
    diagnostics: result.diagnostics.map((item) => ({
      ...item,
      path: "evidence." + item.path,
    })),
  };
}

function mapSchemaIssues(error: z.ZodError): EvidenceFileParseResult {
  const diagnostics = error.issues.flatMap<StoreDiagnostic>((issue) => {
    if (issue.code === "unrecognized_keys") {
      return issue.keys.map((key) =>
        diagnostic(
          "EVIDENCE_UNKNOWN_KEY",
          [...issue.path, key].join("."),
          "Unknown evidence file key: " + [...issue.path, key].join("."),
        ),
      );
    }

    return diagnostic(
      "EVIDENCE_FILE_MALFORMED",
      issue.path.join(".") || EVIDENCE_FILE_RELATIVE_PATH,
      issue.message,
    );
  });

  return { valid: false, diagnostics };
}

export function parseEvidenceFile(contents: string): EvidenceFileParseResult {
  let parsed: unknown;

  try {
    parsed = parse(contents);
  } catch (error) {
    return malformed(error instanceof Error ? error.message : "Unable to parse YAML.");
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return malformed("Evidence file must contain a YAML mapping.");
  }

  const checked = evidenceFileSchema.safeParse(parsed);
  if (!checked.success) return mapSchemaIssues(checked.error);

  const evidence = checked.data.evidence;
  const snapshot = {
    schemaVersion: checked.data.schemaVersion,
    testRuns: evidence.testRuns,
    evidenceRecords: evidence.evidenceRecords,
  } as EvidenceSnapshot;
  const keyDiagnostics = validateEvidenceSnapshotKeys(snapshot);
  if (keyDiagnostics.length > 0) return { valid: false, diagnostics: keyDiagnostics };

  const validation = validateEvidenceSnapshot(snapshot);

  if (!validation.valid) return mapDomainValidation(validation);

  return { valid: true, evidence: snapshot, diagnostics: [] };
}

export function serializeEvidenceSnapshot(snapshot: EvidenceSnapshot): string {
  const keyDiagnostics = validateEvidenceSnapshotKeys(snapshot);
  if (keyDiagnostics.length > 0) {
    throw new Error("Cannot serialize an evidence snapshot with unknown keys.");
  }

  const validation = validateEvidenceSnapshot(snapshot);
  if (!validation.valid) {
    throw new Error("Cannot serialize an invalid evidence snapshot.");
  }

  const serialized = stringify({
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    evidence: {
      testRuns: snapshot.testRuns,
      evidenceRecords: snapshot.evidenceRecords,
    },
  });

  return serialized.endsWith("\n") ? serialized : serialized + "\n";
}
