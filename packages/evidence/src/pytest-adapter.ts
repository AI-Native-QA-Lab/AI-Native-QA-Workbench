import type { TestResult, TestResultStatus } from "@ai-native-qa-workbench/domain";

import {
  createParsedImport,
  createValidatedTestRun,
  decodeEvidenceInput,
  type EvidenceAdapter,
  type EvidenceParseContext,
  type ParsedEvidenceImport,
} from "./contracts.js";
import { EvidenceParseError } from "./errors.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fieldError(path: string, message: string): never {
  throw new EvidenceParseError("EVIDENCE_REPORT_FIELD_INVALID", path, message);
}

function parseJson(input: Uint8Array): unknown {
  const text = decodeEvidenceInput(input);
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new EvidenceParseError(
      "EVIDENCE_REPORT_MALFORMED",
      "json",
      error instanceof Error ? error.message : "Pytest JSON is malformed.",
    );
  }
}

function outcomeStatus(value: unknown, path: string): TestResultStatus {
  if (value === undefined || value === "") return "unknown";
  if (typeof value !== "string") fieldError(path, "Outcome must be a string.");

  switch (value) {
    case "passed":
      return "passed";
    case "failed":
      return "failed";
    case "skipped":
      return "skipped";
    case "error":
      return "error";
    default:
      fieldError(path, "Unsupported Pytest outcome: " + value);
  }
}

function durationMs(value: unknown, path: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fieldError(path, "Duration must be a non-negative number of seconds.");
  }
  return Math.round(value * 1000);
}

function parsePytest(input: Uint8Array, context: EvidenceParseContext): ParsedEvidenceImport {
  const parsed = parseJson(input);
  if (!isRecord(parsed) || !Array.isArray(parsed.tests)) {
    fieldError("tests", "Pytest report must contain a tests array.");
  }

  const results: TestResult[] = parsed.tests.map((testValue, index) => {
    const path = "tests[" + index + "]";
    if (!isRecord(testValue)) fieldError(path, "Test must be an object.");
    if (typeof testValue.nodeid !== "string" || testValue.nodeid.trim() === "") {
      fieldError(path + ".nodeid", "Test nodeid must not be empty.");
    }

    const result: TestResult = {
      name: testValue.nodeid,
      status: outcomeStatus(testValue.outcome, path + ".outcome"),
    };
    const testDuration = durationMs(testValue.duration, path + ".duration");
    if (testDuration !== undefined) result.durationMs = testDuration;
    return result;
  });

  const testRun = createValidatedTestRun("pytest-json", results, context);
  return createParsedImport(input, context, testRun, "application/json");
}

export function createPytestEvidenceAdapter(): EvidenceAdapter {
  return {
    format: "pytest-json",
    parse(input, context) {
      return parsePytest(input, context);
    },
  };
}
