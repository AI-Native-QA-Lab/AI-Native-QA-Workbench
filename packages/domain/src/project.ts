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
  | "QUALITY_TRACE_LINK_DUPLICATE";

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
