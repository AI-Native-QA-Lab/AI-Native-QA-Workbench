import { parse, stringify } from "yaml";
import { z } from "zod";

import {
  QUALITY_ENGINEERING_SCHEMA_VERSION,
  validateQualityEngineeringSnapshot,
  type QualityEngineeringSnapshot,
  type ValidationResult,
} from "@ai-native-qa-workbench/domain";

import {
  QUALITY_ENGINEERING_FILE_RELATIVE_PATH,
  type QualityEngineeringFileParseResult,
  type StoreDiagnostic,
} from "./types.js";

const qualityEngineeringFileSchema = z
  .object({
    schemaVersion: z.unknown(),
    qualityEngineering: z
      .object({
        assessments: z.unknown().optional(),
        gates: z.unknown().optional(),
        humanDecisions: z.unknown().optional(),
      })
      .strict(),
  })
  .strict();

function diagnostic(code: StoreDiagnostic["code"], path: string, message: string): StoreDiagnostic {
  return { code, message, path, severity: "error" };
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
    .map((key) =>
      diagnostic(
        "QUALITY_ENGINEERING_UNKNOWN_KEY",
        `${path}.${key}`,
        `Unknown quality engineering file key: ${path}.${key}`,
      ),
    );
}

export function validateQualityEngineeringSnapshotKeys(input: unknown): readonly StoreDiagnostic[] {
  const diagnostics = unknownKeyDiagnostics(input, "qualityEngineering", [
    "schemaVersion",
    "assessments",
    "gates",
    "humanDecisions",
  ]);
  if (!isMapping(input)) return diagnostics;

  if (Array.isArray(input.assessments)) {
    input.assessments.forEach((assessment, index) => {
      const path = `qualityEngineering.assessments[${index}]`;
      diagnostics.push(
        ...unknownKeyDiagnostics(assessment, path, [
          "id",
          "target",
          "verdict",
          "summary",
          "reasonCodes",
          "evidenceIds",
          "source",
          "basedOnRevision",
          "createdAt",
        ]),
      );
      if (!isMapping(assessment)) return;
      diagnostics.push(
        ...unknownKeyDiagnostics(assessment.target, `${path}.target`, ["type", "id"]),
      );
    });
  }

  if (Array.isArray(input.gates)) {
    input.gates.forEach((gate, index) => {
      const path = `qualityEngineering.gates[${index}]`;
      diagnostics.push(
        ...unknownKeyDiagnostics(gate, path, [
          "id",
          "kind",
          "target",
          "assessmentId",
          "outcome",
          "requiredHumanDecision",
          "evaluatedAt",
        ]),
      );
      if (!isMapping(gate)) return;
      diagnostics.push(...unknownKeyDiagnostics(gate.target, `${path}.target`, ["type", "id"]));
    });
  }

  if (Array.isArray(input.humanDecisions)) {
    input.humanDecisions.forEach((decision, index) => {
      diagnostics.push(
        ...unknownKeyDiagnostics(decision, `qualityEngineering.humanDecisions[${index}]`, [
          "id",
          "gateId",
          "decision",
          "reviewer",
          "rationale",
          "decidedAt",
        ]),
      );
    });
  }

  return diagnostics;
}

function malformed(message: string): QualityEngineeringFileParseResult {
  return {
    valid: false,
    diagnostics: [
      diagnostic(
        "QUALITY_ENGINEERING_FILE_MALFORMED",
        QUALITY_ENGINEERING_FILE_RELATIVE_PATH,
        message,
      ),
    ],
  };
}

function mapDomainValidation(result: ValidationResult): QualityEngineeringFileParseResult {
  return {
    valid: false,
    diagnostics: result.diagnostics.map((item) => ({
      ...item,
      path: item.path.startsWith("qualityEngineering.")
        ? item.path
        : `qualityEngineering.${item.path}`,
    })),
  };
}

function mapSchemaIssues(error: z.ZodError): QualityEngineeringFileParseResult {
  const diagnostics = error.issues.flatMap<StoreDiagnostic>((issue) => {
    if (issue.code === "unrecognized_keys") {
      return issue.keys.map((key) => {
        const path = [...issue.path, key].join(".");
        return diagnostic(
          "QUALITY_ENGINEERING_UNKNOWN_KEY",
          path,
          `Unknown quality engineering file key: ${path}`,
        );
      });
    }

    return diagnostic(
      "QUALITY_ENGINEERING_FILE_MALFORMED",
      issue.path.join(".") || QUALITY_ENGINEERING_FILE_RELATIVE_PATH,
      issue.message,
    );
  });

  return { valid: false, diagnostics };
}

export function parseQualityEngineeringFile(contents: string): QualityEngineeringFileParseResult {
  let parsed: unknown;
  try {
    parsed = parse(contents);
  } catch (error) {
    return malformed(error instanceof Error ? error.message : "Unable to parse YAML.");
  }

  if (!isMapping(parsed)) return malformed("Quality engineering file must contain a YAML mapping.");
  const checked = qualityEngineeringFileSchema.safeParse(parsed);
  if (!checked.success) return mapSchemaIssues(checked.error);

  const qualityEngineering = checked.data.qualityEngineering;
  const snapshot = {
    schemaVersion: checked.data.schemaVersion,
    assessments: qualityEngineering.assessments,
    gates: qualityEngineering.gates,
    humanDecisions: qualityEngineering.humanDecisions,
  } as QualityEngineeringSnapshot;
  const keyDiagnostics = validateQualityEngineeringSnapshotKeys(snapshot);
  if (keyDiagnostics.length > 0) return { valid: false, diagnostics: keyDiagnostics };

  const validation = validateQualityEngineeringSnapshot(snapshot);
  if (!validation.valid) return mapDomainValidation(validation);

  return { valid: true, qualityEngineering: snapshot, diagnostics: [] };
}

export function serializeQualityEngineeringSnapshot(snapshot: QualityEngineeringSnapshot): string {
  const keyDiagnostics = validateQualityEngineeringSnapshotKeys(snapshot);
  if (keyDiagnostics.length > 0) {
    throw new Error("Cannot serialize a quality engineering snapshot with unknown keys.");
  }
  const validation = validateQualityEngineeringSnapshot(snapshot);
  if (!validation.valid)
    throw new Error("Cannot serialize an invalid quality engineering snapshot.");

  const serialized = stringify({
    schemaVersion: QUALITY_ENGINEERING_SCHEMA_VERSION,
    qualityEngineering: {
      assessments: snapshot.assessments,
      gates: snapshot.gates,
      humanDecisions: snapshot.humanDecisions,
    },
  });
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}
