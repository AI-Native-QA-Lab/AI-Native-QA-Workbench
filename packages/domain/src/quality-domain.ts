import { isValidKebabCaseId } from "./identifiers.js";
import type { Diagnostic, DiagnosticCode, ValidationResult } from "./project.js";

export interface Requirement {
  id: string;
  title: string;
  description: string;
}

export interface AcceptanceCriterion {
  id: string;
  requirementId: string;
  statement: string;
}

export interface QualityRisk {
  id: string;
  requirementId: string;
  statement: string;
}

export interface TestObligation {
  id: string;
  riskId: string;
  statement: string;
}

function diagnostic(code: DiagnosticCode, path: string, message: string): Diagnostic {
  return {
    code,
    message,
    path,
    severity: "error",
  };
}

export function validateRequirement(requirement: Requirement): ValidationResult {
  const candidate = (requirement ?? {}) as Partial<Requirement>;
  const diagnostics: Diagnostic[] = [];

  if (!isValidKebabCaseId(candidate.id)) {
    diagnostics.push(diagnostic("REQUIREMENT_ID_INVALID", "id", "Requirement id is invalid."));
  }

  if (typeof candidate.title !== "string" || candidate.title.trim().length === 0) {
    diagnostics.push(
      diagnostic("REQUIREMENT_TITLE_EMPTY", "title", "Requirement title must not be empty."),
    );
  }

  if (typeof candidate.description !== "string") {
    diagnostics.push(
      diagnostic(
        "REQUIREMENT_DESCRIPTION_INVALID",
        "description",
        "Requirement description must be a string.",
      ),
    );
  }

  return {
    valid: diagnostics.length === 0,
    diagnostics,
  };
}

export function validateAcceptanceCriterion(criterion: AcceptanceCriterion): ValidationResult {
  const candidate = (criterion ?? {}) as Partial<AcceptanceCriterion>;
  const diagnostics: Diagnostic[] = [];

  if (!isValidKebabCaseId(candidate.id)) {
    diagnostics.push(
      diagnostic("ACCEPTANCE_CRITERION_ID_INVALID", "id", "Acceptance criterion id is invalid."),
    );
  }

  if (!isValidKebabCaseId(candidate.requirementId)) {
    diagnostics.push(
      diagnostic(
        "ACCEPTANCE_CRITERION_REQUIREMENT_ID_INVALID",
        "requirementId",
        "Acceptance criterion requirementId is invalid.",
      ),
    );
  }

  if (typeof candidate.statement !== "string" || candidate.statement.trim().length === 0) {
    diagnostics.push(
      diagnostic(
        "ACCEPTANCE_CRITERION_STATEMENT_EMPTY",
        "statement",
        "Acceptance criterion statement must not be empty.",
      ),
    );
  }

  return {
    valid: diagnostics.length === 0,
    diagnostics,
  };
}

export function validateQualityRisk(risk: QualityRisk): ValidationResult {
  const candidate = (risk ?? {}) as Partial<QualityRisk>;
  const diagnostics: Diagnostic[] = [];

  if (!isValidKebabCaseId(candidate.id)) {
    diagnostics.push(diagnostic("QUALITY_RISK_ID_INVALID", "id", "Quality risk id is invalid."));
  }

  if (!isValidKebabCaseId(candidate.requirementId)) {
    diagnostics.push(
      diagnostic(
        "QUALITY_RISK_REQUIREMENT_ID_INVALID",
        "requirementId",
        "Quality risk requirementId is invalid.",
      ),
    );
  }

  if (typeof candidate.statement !== "string" || candidate.statement.trim().length === 0) {
    diagnostics.push(
      diagnostic(
        "QUALITY_RISK_STATEMENT_EMPTY",
        "statement",
        "Quality risk statement must not be empty.",
      ),
    );
  }

  return {
    valid: diagnostics.length === 0,
    diagnostics,
  };
}

export function validateTestObligation(obligation: TestObligation): ValidationResult {
  const candidate = (obligation ?? {}) as Partial<TestObligation>;
  const diagnostics: Diagnostic[] = [];

  if (!isValidKebabCaseId(candidate.id)) {
    diagnostics.push(
      diagnostic("TEST_OBLIGATION_ID_INVALID", "id", "Test obligation id is invalid."),
    );
  }

  if (!isValidKebabCaseId(candidate.riskId)) {
    diagnostics.push(
      diagnostic(
        "TEST_OBLIGATION_RISK_ID_INVALID",
        "riskId",
        "Test obligation riskId is invalid.",
      ),
    );
  }

  if (typeof candidate.statement !== "string" || candidate.statement.trim().length === 0) {
    diagnostics.push(
      diagnostic(
        "TEST_OBLIGATION_STATEMENT_EMPTY",
        "statement",
        "Test obligation statement must not be empty.",
      ),
    );
  }

  return {
    valid: diagnostics.length === 0,
    diagnostics,
  };
}
