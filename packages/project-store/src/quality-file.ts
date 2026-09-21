import { parse, stringify } from "yaml";
import { z } from "zod";

import {
  QUALITY_SCHEMA_VERSION,
  validateQualitySnapshot,
  type QualitySnapshot,
  type ValidationResult,
} from "@ai-native-qa-workbench/domain";

import {
  QUALITY_FILE_RELATIVE_PATH,
  type StoreDiagnostic,
  type StoreValidationResult,
} from "./types.js";

const qualityFileSchema = z
  .object({
    schemaVersion: z.unknown(),
    quality: z
      .object({
        requirements: z.unknown().optional(),
        acceptanceCriteria: z.unknown().optional(),
        qualityRisks: z.unknown().optional(),
        testObligations: z.unknown().optional(),
        testCases: z.unknown().optional(),
        traceLinks: z.unknown().optional(),
      })
      .strict(),
  })
  .strict();

function diagnostic(code: StoreDiagnostic["code"], path: string, message: string): StoreDiagnostic {
  return { code, message, path, severity: "error" };
}

function malformed(message: string): StoreValidationResult {
  return {
    valid: false,
    diagnostics: [diagnostic("QUALITY_FILE_MALFORMED", QUALITY_FILE_RELATIVE_PATH, message)],
  };
}

function mapDomainValidation(result: ValidationResult): StoreValidationResult {
  return {
    valid: false,
    diagnostics: result.diagnostics.map((item) => ({
      ...item,
      path:
        item.path === "schemaVersion" || item.path.includes("[")
          ? `quality.${item.path}`
          : `quality.${item.path}`,
    })),
  };
}

function mapSchemaIssues(error: z.ZodError): StoreValidationResult {
  const diagnostics = error.issues.flatMap<StoreDiagnostic>((issue) => {
    if (issue.code === "unrecognized_keys") {
      return issue.keys.map((key) =>
        diagnostic(
          "QUALITY_UNKNOWN_KEY",
          [...issue.path, key].join("."),
          `Unknown quality file key: ${[...issue.path, key].join(".")}`,
        ),
      );
    }

    return diagnostic(
      "QUALITY_FILE_MALFORMED",
      issue.path.join(".") || QUALITY_FILE_RELATIVE_PATH,
      issue.message,
    );
  });

  return { valid: false, diagnostics };
}

export function parseQualityFile(contents: string): StoreValidationResult {
  let parsed: unknown;

  try {
    parsed = parse(contents);
  } catch (error) {
    return malformed(error instanceof Error ? error.message : "Unable to parse YAML.");
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return malformed("Quality file must contain a YAML mapping.");
  }

  const checked = qualityFileSchema.safeParse(parsed);
  if (!checked.success) return mapSchemaIssues(checked.error);

  const quality = checked.data.quality;
  const snapshot = {
    schemaVersion: checked.data.schemaVersion,
    requirements: quality.requirements,
    acceptanceCriteria: quality.acceptanceCriteria,
    qualityRisks: quality.qualityRisks,
    testObligations: quality.testObligations,
    testCases: quality.testCases,
    traceLinks: quality.traceLinks,
  } as QualitySnapshot;
  const validation = validateQualitySnapshot(snapshot);

  if (!validation.valid) return mapDomainValidation(validation);

  return { valid: true, projectQuality: snapshot, diagnostics: [] };
}

export function serializeQualitySnapshot(snapshot: QualitySnapshot): string {
  const validation = validateQualitySnapshot(snapshot);
  if (!validation.valid) {
    throw new Error("Cannot serialize an invalid quality snapshot.");
  }

  const serialized = stringify({
    schemaVersion: QUALITY_SCHEMA_VERSION,
    quality: {
      requirements: snapshot.requirements,
      acceptanceCriteria: snapshot.acceptanceCriteria,
      qualityRisks: snapshot.qualityRisks,
      testObligations: snapshot.testObligations,
      testCases: snapshot.testCases,
      traceLinks: snapshot.traceLinks,
    },
  });

  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}
