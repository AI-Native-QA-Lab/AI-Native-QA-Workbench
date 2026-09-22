import {
  createParsedImport,
  createValidatedTestRun,
  decodeEvidenceInput,
  type EvidenceAdapter,
  type EvidenceParseContext,
  type ParsedEvidenceImport,
} from "./contracts.js";
import { EvidenceParseError } from "./errors.js";
import type { TestResult, TestResultStatus } from "@ai-native-qa-workbench/domain";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fieldError(path: string, message: string): never {
  throw new EvidenceParseError("EVIDENCE_REPORT_FIELD_INVALID", path, message);
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") fieldError(path, "Field must be a string.");
  return value;
}

function nonEmptyTitle(values: Array<string | undefined>, path: string): string {
  const title = values.find((value) => value !== undefined && value.trim().length > 0);
  if (title === undefined) fieldError(path, "Test title must not be empty.");
  return title;
}

function durationMs(value: unknown, path: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fieldError(path, "Duration must be a non-negative number.");
  }
  return Math.round(value);
}

function resultStatus(value: unknown, path: string): TestResultStatus {
  if (value === undefined || value === "") return "unknown";
  if (typeof value !== "string") fieldError(path, "Result status must be a string.");

  switch (value) {
    case "passed":
    case "expected":
      return "passed";
    case "failed":
    case "unexpected":
      return "failed";
    case "skipped":
      return "skipped";
    case "timedOut":
    case "interrupted":
      return "error";
    default:
      fieldError(path, "Unsupported Playwright result status: " + value);
  }
}

function parseJson(input: Uint8Array): unknown {
  const text = decodeEvidenceInput(input);
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new EvidenceParseError(
      "EVIDENCE_REPORT_MALFORMED",
      "json",
      error instanceof Error ? error.message : "Playwright JSON is malformed.",
    );
  }
}

function parsePlaywright(input: Uint8Array, context: EvidenceParseContext): ParsedEvidenceImport {
  const parsed = parseJson(input);
  if (!isRecord(parsed) || !Array.isArray(parsed.suites)) {
    fieldError("suites", "Playwright report must contain a suites array.");
  }

  const results: TestResult[] = [];

  const visitSuite = (suiteValue: unknown, suitePath: string, parentTitle?: string): void => {
    if (!isRecord(suiteValue)) fieldError(suitePath, "Suite must be an object.");
    const suiteTitle = optionalString(suiteValue.title, suitePath + ".title");
    const currentSuiteTitle =
      suiteTitle !== undefined && suiteTitle.trim().length > 0 ? suiteTitle : parentTitle;
    const specs = suiteValue.specs;
    if (specs === undefined && suiteValue.suites === undefined) {
      fieldError(suitePath + ".specs", "Suite must contain specs or nested suites.");
    }
    if (specs !== undefined && !Array.isArray(specs)) {
      fieldError(suitePath + ".specs", "Suite specs must be an array.");
    }
    if (Array.isArray(specs)) {
      specs.forEach((specValue, specIndex) => {
        const specPath = suitePath + ".specs[" + specIndex + "]";
        if (!isRecord(specValue)) fieldError(specPath, "Spec must be an object.");
        const specTitle = optionalString(specValue.title, specPath + ".title");
        const tests = specValue.tests;
        if (!Array.isArray(tests)) fieldError(specPath + ".tests", "Spec tests must be an array.");

        tests.forEach((testValue, testIndex) => {
          const testPath = specPath + ".tests[" + testIndex + "]";
          if (!isRecord(testValue)) fieldError(testPath, "Test must be an object.");
          const testTitle = optionalString(testValue.title, testPath + ".title");
          if (!Array.isArray(testValue.results)) {
            fieldError(testPath + ".results", "Test results must be an array.");
          }

          let totalDuration = 0;
          let hasDuration = false;
          let status: TestResultStatus = "unknown";
          testValue.results.forEach((resultValue, resultIndex) => {
            const resultPath = testPath + ".results[" + resultIndex + "]";
            if (!isRecord(resultValue)) fieldError(resultPath, "Result must be an object.");
            status = resultStatus(resultValue.status, resultPath + ".status");
            const resultDuration = durationMs(resultValue.duration, resultPath + ".duration");
            if (resultDuration !== undefined) {
              totalDuration += resultDuration;
              hasDuration = true;
            }
          });

          const result: TestResult = {
            name: nonEmptyTitle([testTitle, specTitle, currentSuiteTitle], testPath + ".title"),
            status,
          };
          if (hasDuration) result.durationMs = totalDuration;
          results.push(result);
        });
      });
    }

    const nestedSuites = suiteValue.suites;
    if (nestedSuites !== undefined && !Array.isArray(nestedSuites)) {
      fieldError(suitePath + ".suites", "Nested suites must be an array.");
    }
    if (Array.isArray(nestedSuites)) {
      nestedSuites.forEach((nestedSuite, suiteIndex) => {
        visitSuite(nestedSuite, suitePath + ".suites[" + suiteIndex + "]", currentSuiteTitle);
      });
    }
  };

  parsed.suites.forEach((suite, suiteIndex) => {
    visitSuite(suite, "suites[" + suiteIndex + "]");
  });

  const testRun = createValidatedTestRun("playwright-json", results, context);
  return createParsedImport(input, context, testRun, "application/json");
}

export function createPlaywrightEvidenceAdapter(): EvidenceAdapter {
  return {
    format: "playwright-json",
    parse(input, context) {
      return parsePlaywright(input, context);
    },
  };
}
