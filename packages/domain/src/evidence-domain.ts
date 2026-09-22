import { isValidKebabCaseId } from "./identifiers.js";
import type { Diagnostic, ValidationResult } from "./project.js";

export const EVIDENCE_SCHEMA_VERSION = "0.2" as const;

export type TestRunStatus = "passed" | "failed" | "skipped" | "error" | "incomplete";
export type TestResultStatus = "passed" | "failed" | "skipped" | "error" | "unknown";
export type EvidenceFormat = "junit" | "playwright-json" | "pytest-json";
export type EvidenceKind = "test-result";
export type EvidenceTrust = "unverified" | "trusted" | "human-recorded";

export interface TestResult {
  name: string;
  status: TestResultStatus;
  durationMs?: number;
  testCaseId?: string;
}

export interface TestRun {
  id: string;
  format: EvidenceFormat;
  status: TestRunStatus;
  startedAt?: string;
  completedAt?: string;
  results: TestResult[];
}

export interface ArtifactReference {
  id: string;
  relativePath: string;
  mediaType: string;
  sizeBytes: number;
  sha256: string;
}

export interface EvidenceProvenance {
  sourceFormat: EvidenceFormat;
  sourceFileName: string;
  importedAt: string;
  trust: EvidenceTrust;
  runnerName?: string;
  runnerVersion?: string;
}

export interface Evidence {
  id: string;
  testRunId: string;
  kind: EvidenceKind;
  artifact: ArtifactReference;
  provenance: EvidenceProvenance;
}

export interface EvidenceSnapshot {
  schemaVersion: typeof EVIDENCE_SCHEMA_VERSION;
  testRuns: TestRun[];
  evidenceRecords: Evidence[];
}

export function canonicalizeEvidenceValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeEvidenceValue);
  if (typeof value !== "object" || value === null) return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, nested]) => [key, canonicalizeEvidenceValue(nested)]),
  );
}

const evidenceFormats: readonly EvidenceFormat[] = ["junit", "playwright-json", "pytest-json"];
const testRunStatuses: readonly TestRunStatus[] = [
  "passed",
  "failed",
  "skipped",
  "error",
  "incomplete",
];
const testResultStatuses: readonly TestResultStatus[] = [
  "passed",
  "failed",
  "skipped",
  "error",
  "unknown",
];
const evidenceTrusts: readonly EvidenceTrust[] = ["unverified", "trusted", "human-recorded"];

function diagnostic(code: Diagnostic["code"], path: string, message: string): Diagnostic {
  return { code, path, message, severity: "error" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasValue(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isEvidenceFormat(value: unknown): value is EvidenceFormat {
  return typeof value === "string" && evidenceFormats.includes(value as EvidenceFormat);
}

function isTestRunStatus(value: unknown): value is TestRunStatus {
  return typeof value === "string" && testRunStatuses.includes(value as TestRunStatus);
}

function isTestResultStatus(value: unknown): value is TestResultStatus {
  return typeof value === "string" && testResultStatuses.includes(value as TestResultStatus);
}

function isEvidenceTrust(value: unknown): value is EvidenceTrust {
  return typeof value === "string" && evidenceTrusts.includes(value as EvidenceTrust);
}

function isRfc3339WithTimezone(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/.exec(
      value,
    );
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[8] === undefined ? 0 : Number(match[8]);
  const offsetMinute = match[9] === undefined ? 0 : Number(match[9]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth[month - 1]! &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59 &&
    second >= 0 &&
    second <= 60 &&
    offsetHour >= 0 &&
    offsetHour <= 23 &&
    offsetMinute >= 0 &&
    offsetMinute <= 59
  );
}

function isAbsoluteLikePath(value: string): boolean {
  return value.startsWith("/") || value.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(value);
}

function isSafeRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.includes("\u0000")) return false;
  if (isAbsoluteLikePath(value)) return false;
  const segments = value.split(/[\\/]/);
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function normalizedArtifactPath(value: string): string {
  return value.replaceAll("\\", "/");
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function deriveTestRunStatus(results: readonly TestResult[]): TestRunStatus {
  if (results.some((result) => result.status === "error")) return "error";
  if (results.some((result) => result.status === "failed")) return "failed";
  if (results.length === 0 || results.some((result) => result.status === "unknown")) {
    return "incomplete";
  }
  if (results.every((result) => result.status === "skipped")) return "skipped";
  return "passed";
}

function validateTestRun(
  value: unknown,
  index: number,
  diagnostics: Diagnostic[],
): value is TestRun {
  const path = "testRuns[" + index + "]";
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic("EVIDENCE_TEST_RUN_RESULTS_INVALID", path, "TestRun must be a mapping."),
    );
    return false;
  }

  const id = value.id;
  if (!isValidKebabCaseId(id)) {
    diagnostics.push(
      diagnostic("EVIDENCE_TEST_RUN_ID_INVALID", path + ".id", "TestRun id must use kebab-case."),
    );
  }

  const format = value.format;
  if (!isEvidenceFormat(format)) {
    diagnostics.push(
      diagnostic("EVIDENCE_FORMAT_INVALID", path + ".format", "TestRun format is invalid."),
    );
  }

  const status = value.status;
  const statusValid = isTestRunStatus(status);
  if (!statusValid) {
    diagnostics.push(
      diagnostic(
        "EVIDENCE_TEST_RUN_STATUS_INVALID",
        path + ".status",
        "TestRun status is invalid.",
      ),
    );
  }

  const resultsValue = value.results;
  let resultsValid = true;
  const results: TestResult[] = [];
  if (!Array.isArray(resultsValue)) {
    diagnostics.push(
      diagnostic(
        "EVIDENCE_TEST_RUN_RESULTS_INVALID",
        path + ".results",
        "TestRun results must be an array.",
      ),
    );
    resultsValid = false;
  } else {
    resultsValue.forEach((resultValue, resultIndex) => {
      const resultPath = path + ".results[" + resultIndex + "]";
      if (!isRecord(resultValue)) {
        diagnostics.push(
          diagnostic(
            "EVIDENCE_TEST_RUN_RESULTS_INVALID",
            resultPath,
            "TestResult must be a mapping.",
          ),
        );
        resultsValid = false;
        return;
      }

      const name = resultValue.name;
      if (!isNonEmptyString(name)) {
        diagnostics.push(
          diagnostic(
            "EVIDENCE_TEST_RESULT_NAME_EMPTY",
            resultPath + ".name",
            "TestResult name must not be empty.",
          ),
        );
        resultsValid = false;
      }

      const resultStatus = resultValue.status;
      if (!isTestResultStatus(resultStatus)) {
        diagnostics.push(
          diagnostic(
            "EVIDENCE_TEST_RESULT_STATUS_INVALID",
            resultPath + ".status",
            "TestResult status is invalid.",
          ),
        );
        resultsValid = false;
      }

      if (hasValue(resultValue, "durationMs") && !isNonNegativeInteger(resultValue.durationMs)) {
        diagnostics.push(
          diagnostic(
            "EVIDENCE_TEST_RESULT_DURATION_INVALID",
            resultPath + ".durationMs",
            "TestResult durationMs must be a non-negative integer.",
          ),
        );
        resultsValid = false;
      }

      if (hasValue(resultValue, "testCaseId") && !isValidKebabCaseId(resultValue.testCaseId)) {
        diagnostics.push(
          diagnostic(
            "EVIDENCE_TEST_RESULT_TEST_CASE_ID_INVALID",
            resultPath + ".testCaseId",
            "TestResult testCaseId must use kebab-case.",
          ),
        );
        resultsValid = false;
      }

      if (isNonEmptyString(name) && isTestResultStatus(resultStatus)) {
        const normalizedResult: TestResult = {
          name,
          status: resultStatus,
        };
        if (isNonNegativeInteger(resultValue.durationMs)) {
          normalizedResult.durationMs = resultValue.durationMs;
        }
        if (isValidKebabCaseId(resultValue.testCaseId)) {
          normalizedResult.testCaseId = resultValue.testCaseId;
        }
        results.push(normalizedResult);
      }
    });
  }

  let timestampsValid = true;
  const startedAt = value.startedAt;
  const completedAt = value.completedAt;
  if (hasValue(value, "startedAt") && !isRfc3339WithTimezone(startedAt)) {
    diagnostics.push(
      diagnostic(
        "EVIDENCE_TEST_RUN_TIME_INVALID",
        path + ".startedAt",
        "startedAt must be an RFC3339 timestamp with timezone.",
      ),
    );
    timestampsValid = false;
  }
  if (hasValue(value, "completedAt") && !isRfc3339WithTimezone(completedAt)) {
    diagnostics.push(
      diagnostic(
        "EVIDENCE_TEST_RUN_TIME_INVALID",
        path + ".completedAt",
        "completedAt must be an RFC3339 timestamp with timezone.",
      ),
    );
    timestampsValid = false;
  }
  if (
    timestampsValid &&
    typeof startedAt === "string" &&
    typeof completedAt === "string" &&
    Date.parse(completedAt) < Date.parse(startedAt)
  ) {
    diagnostics.push(
      diagnostic(
        "EVIDENCE_TEST_RUN_TIME_ORDER_INVALID",
        path + ".completedAt",
        "completedAt must not precede startedAt.",
      ),
    );
  }

  if (statusValid && resultsValid) {
    if (status !== deriveTestRunStatus(results)) {
      diagnostics.push(
        diagnostic(
          "EVIDENCE_TEST_RUN_STATUS_INVALID",
          path + ".status",
          "TestRun status must match the derived result status.",
        ),
      );
    }
  } else if (statusValid && !resultsValid) {
    diagnostics.push(
      diagnostic(
        "EVIDENCE_TEST_RUN_STATUS_INVALID",
        path + ".status",
        "TestRun status cannot be trusted when results are invalid.",
      ),
    );
  }

  return (
    isValidKebabCaseId(id) &&
    isEvidenceFormat(format) &&
    statusValid &&
    resultsValid &&
    timestampsValid
  );
}

function validateArtifact(
  value: unknown,
  path: string,
  diagnostics: Diagnostic[],
  artifactIds: Set<string>,
  artifactPaths: Set<string>,
): value is ArtifactReference {
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic("EVIDENCE_ARTIFACT_ID_INVALID", path, "Artifact must be a mapping."),
    );
    return false;
  }

  const id = value.id;
  if (!isValidKebabCaseId(id)) {
    diagnostics.push(
      diagnostic("EVIDENCE_ARTIFACT_ID_INVALID", path + ".id", "Artifact id must use kebab-case."),
    );
  } else if (artifactIds.has(id)) {
    diagnostics.push(
      diagnostic("EVIDENCE_DUPLICATE_ARTIFACT_ID", path + ".id", "Artifact id is duplicated."),
    );
  } else {
    artifactIds.add(id);
  }

  const relativePath = value.relativePath;
  if (!isSafeRelativePath(relativePath)) {
    diagnostics.push(
      diagnostic(
        "EVIDENCE_ARTIFACT_PATH_INVALID",
        path + ".relativePath",
        "Artifact relativePath is unsafe.",
      ),
    );
  } else if (artifactPaths.has(normalizedArtifactPath(relativePath))) {
    diagnostics.push(
      diagnostic(
        "EVIDENCE_DUPLICATE_ARTIFACT_PATH",
        path + ".relativePath",
        "Artifact relativePath is duplicated.",
      ),
    );
  } else {
    artifactPaths.add(normalizedArtifactPath(relativePath));
  }

  if (!isNonEmptyString(value.mediaType)) {
    diagnostics.push(
      diagnostic(
        "EVIDENCE_ARTIFACT_MEDIA_TYPE_INVALID",
        path + ".mediaType",
        "Artifact mediaType must not be empty.",
      ),
    );
  }
  if (!isNonNegativeInteger(value.sizeBytes)) {
    diagnostics.push(
      diagnostic(
        "EVIDENCE_ARTIFACT_SIZE_INVALID",
        path + ".sizeBytes",
        "Artifact sizeBytes must be a non-negative integer.",
      ),
    );
  }
  if (!isSha256(value.sha256)) {
    diagnostics.push(
      diagnostic(
        "EVIDENCE_ARTIFACT_CHECKSUM_INVALID",
        path + ".sha256",
        "Artifact sha256 must be lower-case hexadecimal.",
      ),
    );
  }

  return (
    isValidKebabCaseId(id) &&
    isSafeRelativePath(relativePath) &&
    isNonEmptyString(value.mediaType) &&
    isNonNegativeInteger(value.sizeBytes) &&
    isSha256(value.sha256)
  );
}

function validateEvidenceRecord(
  value: unknown,
  index: number,
  testRunIds: Set<string>,
  testRunsById: Map<string, TestRun>,
  diagnostics: Diagnostic[],
  artifactIds: Set<string>,
  artifactPaths: Set<string>,
): boolean {
  const path = "evidenceRecords[" + index + "]";
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic("EVIDENCE_RECORD_ID_INVALID", path, "Evidence record must be a mapping."),
    );
    return false;
  }

  const id = value.id;
  const idValid = isValidKebabCaseId(id);
  if (!idValid) {
    diagnostics.push(
      diagnostic("EVIDENCE_RECORD_ID_INVALID", path + ".id", "Evidence id must use kebab-case."),
    );
  }

  const testRunId = value.testRunId;
  if (!isValidKebabCaseId(testRunId) || !testRunIds.has(testRunId)) {
    diagnostics.push(
      diagnostic(
        "EVIDENCE_REFERENCE_NOT_FOUND",
        path + ".testRunId",
        "Evidence testRunId does not resolve to a TestRun.",
      ),
    );
  }

  if (value.kind !== "test-result") {
    diagnostics.push(
      diagnostic("EVIDENCE_KIND_INVALID", path + ".kind", "Evidence kind is invalid."),
    );
  }

  const artifactValid = validateArtifact(
    value.artifact,
    path + ".artifact",
    diagnostics,
    artifactIds,
    artifactPaths,
  );

  const provenancePath = path + ".provenance";
  const provenance = value.provenance;
  let provenanceValid = true;
  if (!isRecord(provenance)) {
    diagnostics.push(
      diagnostic(
        "EVIDENCE_PROVENANCE_FILE_NAME_INVALID",
        provenancePath,
        "Evidence provenance must be a mapping.",
      ),
    );
    provenanceValid = false;
  } else {
    const referencedRun = isValidKebabCaseId(testRunId) ? testRunsById.get(testRunId) : undefined;
    if (
      !isEvidenceFormat(provenance.sourceFormat) ||
      provenance.sourceFormat !== referencedRun?.format
    ) {
      diagnostics.push(
        diagnostic(
          "EVIDENCE_PROVENANCE_FORMAT_MISMATCH",
          provenancePath + ".sourceFormat",
          "Provenance sourceFormat must match the TestRun format.",
        ),
      );
      provenanceValid = false;
    }

    const sourceFileName = provenance.sourceFileName;
    if (
      !isNonEmptyString(sourceFileName) ||
      sourceFileName.includes("/") ||
      sourceFileName.includes("\\") ||
      sourceFileName.includes("\u0000") ||
      isAbsoluteLikePath(sourceFileName)
    ) {
      diagnostics.push(
        diagnostic(
          "EVIDENCE_PROVENANCE_FILE_NAME_INVALID",
          provenancePath + ".sourceFileName",
          "Provenance sourceFileName must be a safe basename.",
        ),
      );
      provenanceValid = false;
    }

    if (!isRfc3339WithTimezone(provenance.importedAt)) {
      diagnostics.push(
        diagnostic(
          "EVIDENCE_PROVENANCE_TIME_INVALID",
          provenancePath + ".importedAt",
          "Provenance importedAt must be an RFC3339 timestamp with timezone.",
        ),
      );
      provenanceValid = false;
    }

    if (!isEvidenceTrust(provenance.trust)) {
      diagnostics.push(
        diagnostic(
          "EVIDENCE_PROVENANCE_TRUST_INVALID",
          provenancePath + ".trust",
          "Provenance trust is invalid.",
        ),
      );
      provenanceValid = false;
    }

    if (hasValue(provenance, "runnerName") && typeof provenance.runnerName !== "string") {
      provenanceValid = false;
      diagnostics.push(
        diagnostic(
          "EVIDENCE_PROVENANCE_FILE_NAME_INVALID",
          provenancePath + ".runnerName",
          "Provenance runnerName must be a string.",
        ),
      );
    }
    if (hasValue(provenance, "runnerVersion") && typeof provenance.runnerVersion !== "string") {
      provenanceValid = false;
      diagnostics.push(
        diagnostic(
          "EVIDENCE_PROVENANCE_FILE_NAME_INVALID",
          provenancePath + ".runnerVersion",
          "Provenance runnerVersion must be a string.",
        ),
      );
    }
  }

  return (
    idValid &&
    isValidKebabCaseId(testRunId) &&
    testRunIds.has(testRunId) &&
    value.kind === "test-result" &&
    artifactValid &&
    provenanceValid
  );
}

export function validateEvidenceSnapshot(input: unknown): ValidationResult {
  const diagnostics: Diagnostic[] = [];
  if (!isRecord(input)) {
    diagnostics.push(
      diagnostic("EVIDENCE_SNAPSHOT_INVALID", "$", "Evidence snapshot must be a mapping."),
    );
    return { valid: false, diagnostics };
  }

  if (input.schemaVersion !== EVIDENCE_SCHEMA_VERSION) {
    const schemaVersion =
      typeof input.schemaVersion === "string" ? input.schemaVersion : "<invalid>";
    diagnostics.push(
      diagnostic(
        "EVIDENCE_SCHEMA_UNSUPPORTED",
        "schemaVersion",
        "Unsupported evidence schema version: " + schemaVersion,
      ),
    );
  }

  const testRunsValue = input.testRuns;
  const evidenceRecordsValue = input.evidenceRecords;
  if (!Array.isArray(testRunsValue)) {
    diagnostics.push(
      diagnostic("EVIDENCE_TEST_RUNS_INVALID", "testRuns", "testRuns must be an array."),
    );
  }
  if (!Array.isArray(evidenceRecordsValue)) {
    diagnostics.push(
      diagnostic(
        "EVIDENCE_RECORDS_INVALID",
        "evidenceRecords",
        "evidenceRecords must be an array.",
      ),
    );
  }
  if (!Array.isArray(testRunsValue) || !Array.isArray(evidenceRecordsValue)) {
    return { valid: false, diagnostics };
  }

  const testRunIds = new Set<string>();
  const testRunsById = new Map<string, TestRun>();
  testRunsValue.forEach((value, index) => {
    const valid = validateTestRun(value, index, diagnostics);
    if (isRecord(value) && isValidKebabCaseId(value.id)) {
      if (testRunIds.has(value.id)) {
        diagnostics.push(
          diagnostic(
            "EVIDENCE_DUPLICATE_TEST_RUN_ID",
            "testRuns[" + index + "].id",
            "TestRun id is duplicated.",
          ),
        );
      } else {
        testRunIds.add(value.id);
      }
      if (valid) testRunsById.set(value.id, value as unknown as TestRun);
    }
  });

  const recordIds = new Set<string>();
  const artifactIds = new Set<string>();
  const artifactPaths = new Set<string>();
  evidenceRecordsValue.forEach((value, index) => {
    validateEvidenceRecord(
      value,
      index,
      testRunIds,
      testRunsById,
      diagnostics,
      artifactIds,
      artifactPaths,
    );
    if (isRecord(value) && isValidKebabCaseId(value.id)) {
      if (recordIds.has(value.id)) {
        diagnostics.push(
          diagnostic(
            "EVIDENCE_DUPLICATE_RECORD_ID",
            "evidenceRecords[" + index + "].id",
            "Evidence id is duplicated.",
          ),
        );
      } else {
        recordIds.add(value.id);
      }
    }
  });

  return { valid: diagnostics.length === 0, diagnostics };
}
