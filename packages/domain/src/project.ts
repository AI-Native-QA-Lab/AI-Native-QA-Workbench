import { isValidKebabCaseId } from "./identifiers.js";

export const PROJECT_SCHEMA_VERSION = "0.1" as const;

export type ProjectLocale = "en" | "zh-CN";

export interface Project {
  schemaVersion: string;
  id: string;
  name: string;
  description: string;
  defaultLocale: string;
}

export type DiagnosticCode =
  | "PROJECT_SCHEMA_UNSUPPORTED"
  | "PROJECT_ID_INVALID"
  | "PROJECT_NAME_EMPTY"
  | "PROJECT_DESCRIPTION_INVALID"
  | "PROJECT_LOCALE_INVALID"
  | "REQUIREMENT_ID_INVALID"
  | "REQUIREMENT_TITLE_EMPTY"
  | "REQUIREMENT_DESCRIPTION_INVALID"
  | "ACCEPTANCE_CRITERION_ID_INVALID"
  | "ACCEPTANCE_CRITERION_REQUIREMENT_ID_INVALID"
  | "ACCEPTANCE_CRITERION_STATEMENT_EMPTY"
  | "QUALITY_RISK_ID_INVALID"
  | "QUALITY_RISK_REQUIREMENT_ID_INVALID"
  | "QUALITY_RISK_STATEMENT_EMPTY"
  | "TEST_OBLIGATION_ID_INVALID"
  | "TEST_OBLIGATION_RISK_ID_INVALID"
  | "TEST_OBLIGATION_STATEMENT_EMPTY"
  | "TEST_CASE_ID_INVALID"
  | "TEST_CASE_OBLIGATION_ID_INVALID"
  | "TEST_CASE_TITLE_EMPTY"
  | "TEST_CASE_STEPS_EMPTY"
  | "TEST_CASE_EXPECTED_RESULT_EMPTY"
  | "QUALITY_SCHEMA_UNSUPPORTED"
  | "QUALITY_REQUIREMENTS_NOT_ARRAY"
  | "QUALITY_ACCEPTANCE_CRITERIA_NOT_ARRAY"
  | "QUALITY_RISKS_NOT_ARRAY"
  | "QUALITY_TEST_OBLIGATIONS_NOT_ARRAY"
  | "QUALITY_TEST_CASES_NOT_ARRAY"
  | "QUALITY_TRACE_LINKS_NOT_ARRAY"
  | "QUALITY_DUPLICATE_ID"
  | "QUALITY_REFERENCE_NOT_FOUND"
  | "QUALITY_TRACE_LINK_INVALID"
  | "QUALITY_TRACE_LINK_SELF_REFERENCE"
  | "QUALITY_TRACE_LINK_DUPLICATE"
  | "PROPOSAL_EMPTY_OPERATIONS"
  | "PROPOSAL_ENTITY_TYPE_INVALID"
  | "PROPOSAL_OPERATION_ID_REQUIRED"
  | "PROPOSAL_DUPLICATE_CREATE"
  | "PROPOSAL_TARGET_NOT_FOUND"
  | "PROPOSAL_REVIEW_REQUIRED"
  | "PROPOSAL_INVALID_STATUS"
  | "PROPOSAL_ENTITY_INVALID"
  | "PROPOSAL_REVIEW_OPERATION_INVALID"
  | "PROPOSAL_BASE_REVISION_STALE"
  | "PROPOSAL_NOT_APPROVED"
  | "PROPOSAL_REJECTED"
  | "EVIDENCE_SNAPSHOT_INVALID"
  | "EVIDENCE_SCHEMA_UNSUPPORTED"
  | "EVIDENCE_TEST_RUNS_INVALID"
  | "EVIDENCE_RECORDS_INVALID"
  | "EVIDENCE_TEST_RUN_ID_INVALID"
  | "EVIDENCE_RECORD_ID_INVALID"
  | "EVIDENCE_FORMAT_INVALID"
  | "EVIDENCE_TEST_RESULT_NAME_EMPTY"
  | "EVIDENCE_TEST_RESULT_STATUS_INVALID"
  | "EVIDENCE_TEST_RESULT_DURATION_INVALID"
  | "EVIDENCE_TEST_RESULT_TEST_CASE_ID_INVALID"
  | "EVIDENCE_TEST_RUN_STATUS_INVALID"
  | "EVIDENCE_TEST_RUN_RESULTS_INVALID"
  | "EVIDENCE_TEST_RUN_TIME_INVALID"
  | "EVIDENCE_TEST_RUN_TIME_ORDER_INVALID"
  | "EVIDENCE_DUPLICATE_TEST_RUN_ID"
  | "EVIDENCE_DUPLICATE_RECORD_ID"
  | "EVIDENCE_REFERENCE_NOT_FOUND"
  | "EVIDENCE_ARTIFACT_ID_INVALID"
  | "EVIDENCE_ARTIFACT_PATH_INVALID"
  | "EVIDENCE_ARTIFACT_MEDIA_TYPE_INVALID"
  | "EVIDENCE_ARTIFACT_SIZE_INVALID"
  | "EVIDENCE_ARTIFACT_CHECKSUM_INVALID"
  | "EVIDENCE_DUPLICATE_ARTIFACT_ID"
  | "EVIDENCE_DUPLICATE_ARTIFACT_PATH"
  | "EVIDENCE_PROVENANCE_FORMAT_MISMATCH"
  | "EVIDENCE_PROVENANCE_FILE_NAME_INVALID"
  | "EVIDENCE_PROVENANCE_TIME_INVALID"
  | "EVIDENCE_PROVENANCE_TRUST_INVALID"
  | "EVIDENCE_KIND_INVALID";

export interface Diagnostic {
  code: DiagnosticCode;
  message: string;
  path: string;
  severity: "error";
}

export interface ValidationResult {
  valid: boolean;
  diagnostics: readonly Diagnostic[];
}

function diagnostic(code: DiagnosticCode, path: string, message: string): Diagnostic {
  return {
    code,
    message,
    path,
    severity: "error",
  };
}

export function validateProject(project: Project): ValidationResult {
  const candidate = project as Partial<Project>;
  const diagnostics: Diagnostic[] = [];

  if (candidate.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    diagnostics.push(
      diagnostic(
        "PROJECT_SCHEMA_UNSUPPORTED",
        "schemaVersion",
        `Unsupported project schema version: ${String(candidate.schemaVersion)}`,
      ),
    );
  }

  if (!isValidKebabCaseId(candidate.id)) {
    diagnostics.push(
      diagnostic(
        "PROJECT_ID_INVALID",
        "id",
        "Project id must use lowercase kebab-case characters.",
      ),
    );
  }

  if (typeof candidate.name !== "string" || candidate.name.trim().length === 0) {
    diagnostics.push(diagnostic("PROJECT_NAME_EMPTY", "name", "Project name must not be empty."));
  }

  if (typeof candidate.description !== "string") {
    diagnostics.push(
      diagnostic(
        "PROJECT_DESCRIPTION_INVALID",
        "description",
        "Project description must be a string.",
      ),
    );
  }

  if (candidate.defaultLocale !== "en" && candidate.defaultLocale !== "zh-CN") {
    diagnostics.push(
      diagnostic("PROJECT_LOCALE_INVALID", "defaultLocale", "Project locale must be en or zh-CN."),
    );
  }

  return {
    valid: diagnostics.length === 0,
    diagnostics,
  };
}

export function deriveProjectId(directoryName: string): string {
  const normalized = (typeof directoryName === "string" ? directoryName : "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "project";
}
