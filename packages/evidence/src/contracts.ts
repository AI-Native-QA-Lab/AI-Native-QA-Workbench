import {
  deriveTestRunStatus,
  EVIDENCE_SCHEMA_VERSION,
  validateEvidenceSnapshot,
  type EvidenceFormat,
  type TestResult,
  type TestRun,
} from "@ai-native-qa-workbench/domain";

import { EvidenceParseError } from "./errors.js";

export const MAX_EVIDENCE_IMPORT_BYTES = 16 * 1024 * 1024;

export interface EvidenceParseContext {
  runId: string;
  sourceFileName: string;
  importedAt: string;
}

export interface ParsedEvidenceImport {
  testRun: TestRun;
  artifact: {
    bytes: Uint8Array;
    sourceFileName: string;
    mediaType: string;
  };
}

export interface EvidenceAdapter {
  readonly format: EvidenceFormat;
  parse(input: Uint8Array, context: EvidenceParseContext): ParsedEvidenceImport;
}

export interface EvidenceAdapterRegistry {
  get(format: EvidenceFormat): EvidenceAdapter;
}

export function normalizeEvidenceFormat(value: string): EvidenceFormat | undefined {
  switch (value) {
    case "junit":
      return "junit";
    case "playwright":
    case "playwright-json":
      return "playwright-json";
    case "pytest":
    case "pytest-json":
      return "pytest-json";
    default:
      return undefined;
  }
}

export function decodeEvidenceInput(input: Uint8Array): string {
  if (!(input instanceof Uint8Array)) {
    throw new EvidenceParseError(
      "EVIDENCE_REPORT_FIELD_INVALID",
      "input",
      "Evidence input must be a Uint8Array.",
    );
  }
  if (input.byteLength > MAX_EVIDENCE_IMPORT_BYTES) {
    throw new EvidenceParseError(
      "EVIDENCE_INPUT_TOO_LARGE",
      "input",
      "Evidence input exceeds the 16 MiB limit.",
    );
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(input);
  } catch (error) {
    throw new EvidenceParseError(
      "EVIDENCE_REPORT_MALFORMED",
      "input",
      error instanceof Error ? error.message : "Evidence input is not valid UTF-8.",
    );
  }
}

export function createValidatedTestRun(
  format: EvidenceFormat,
  results: TestResult[],
  context: EvidenceParseContext,
): TestRun {
  const testRun: TestRun = {
    id: context.runId,
    format,
    status: deriveTestRunStatus(results),
    results,
  };
  const validation = validateEvidenceSnapshot({
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    testRuns: [testRun],
    evidenceRecords: [],
  });

  if (!validation.valid) {
    const first = validation.diagnostics[0];
    throw new EvidenceParseError(
      "EVIDENCE_REPORT_FIELD_INVALID",
      first?.path ?? "testRun",
      first?.message ?? "Generated TestRun is invalid.",
    );
  }

  return testRun;
}

export function createParsedImport(
  input: Uint8Array,
  context: EvidenceParseContext,
  testRun: TestRun,
  mediaType: string,
): ParsedEvidenceImport {
  return {
    testRun,
    artifact: {
      bytes: input,
      sourceFileName: context.sourceFileName,
      mediaType,
    },
  };
}

export function parseEvidenceImport(
  format: EvidenceFormat,
  input: Uint8Array,
  context: EvidenceParseContext,
): ParsedEvidenceImport {
  const canonicalFormat = normalizeEvidenceFormat(String(format));
  if (!canonicalFormat) {
    throw new EvidenceParseError(
      "EVIDENCE_FORMAT_UNSUPPORTED",
      "format",
      "Unsupported evidence format: " + String(format),
    );
  }

  return createEvidenceAdapterRegistry().get(canonicalFormat).parse(input, context);
}

import { createJunitEvidenceAdapter } from "./junit-adapter.js";
import { createPlaywrightEvidenceAdapter } from "./playwright-adapter.js";
import { createPytestEvidenceAdapter } from "./pytest-adapter.js";

export function createEvidenceAdapterRegistry(): EvidenceAdapterRegistry {
  const adapters = new Map<EvidenceFormat, EvidenceAdapter>([
    ["junit", createJunitEvidenceAdapter()],
    ["playwright-json", createPlaywrightEvidenceAdapter()],
    ["pytest-json", createPytestEvidenceAdapter()],
  ]);

  return {
    get(format: EvidenceFormat): EvidenceAdapter {
      const adapter = adapters.get(format);
      if (!adapter) {
        throw new EvidenceParseError(
          "EVIDENCE_FORMAT_UNSUPPORTED",
          "format",
          "Unsupported evidence format: " + String(format),
        );
      }
      return adapter;
    },
  };
}
