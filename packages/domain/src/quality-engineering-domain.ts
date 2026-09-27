import { isValidKebabCaseId } from "./identifiers.js";
import type { Diagnostic, ValidationResult } from "./project.js";

export const QUALITY_ENGINEERING_SCHEMA_VERSION = "0.3" as const;

export type QualityTarget =
  { type: "project" } | { type: "requirement"; id: string } | { type: "test-run"; id: string };

export type AssessmentVerdict = "pass" | "warn" | "fail" | "insufficient-evidence";
export type AssessmentSource = "deterministic" | "ai";

export interface QualityAssessment {
  id: string;
  target: QualityTarget;
  verdict: AssessmentVerdict;
  summary: string;
  reasonCodes: string[];
  evidenceIds: string[];
  source: AssessmentSource;
  basedOnRevision: string | null;
  createdAt: string;
}

export type QualityGateKind = "requirement-readiness" | "release-readiness";
export type QualityGateOutcome = "pass" | "warn" | "block" | "insufficient-evidence";

export interface QualityGate {
  id: string;
  kind: QualityGateKind;
  target: QualityTarget;
  assessmentId: string;
  outcome: QualityGateOutcome;
  requiredHumanDecision: true;
  evaluatedAt: string;
}

export type HumanDecisionType = "approve" | "reject" | "waive";

export interface HumanDecision {
  id: string;
  gateId: string;
  decision: HumanDecisionType;
  reviewer: string;
  rationale: string;
  decidedAt: string;
}

export interface QualityEngineeringSnapshot {
  schemaVersion: typeof QUALITY_ENGINEERING_SCHEMA_VERSION;
  assessments: QualityAssessment[];
  gates: QualityGate[];
  humanDecisions: HumanDecision[];
}

export type ResolvedGateStatus = "pending" | "approved" | "rejected" | "waived";

const assessmentVerdicts: readonly AssessmentVerdict[] = [
  "pass",
  "warn",
  "fail",
  "insufficient-evidence",
];
const assessmentSources: readonly AssessmentSource[] = ["deterministic", "ai"];
const gateKinds: readonly QualityGateKind[] = ["requirement-readiness", "release-readiness"];
const gateOutcomes: readonly QualityGateOutcome[] = [
  "pass",
  "warn",
  "block",
  "insufficient-evidence",
];
const decisionTypes: readonly HumanDecisionType[] = ["approve", "reject", "waive"];

function diagnostic(code: Diagnostic["code"], path: string, message: string): Diagnostic {
  return { code, path, message, severity: "error" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
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

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function sameTarget(left: QualityTarget, right: QualityTarget): boolean {
  if (left.type !== right.type) return false;
  if (left.type === "project" && right.type === "project") return true;
  return left.type !== "project" && right.type !== "project" && left.id === right.id;
}

function validateTarget(
  value: unknown,
  path: string,
  diagnostics: Diagnostic[],
): value is QualityTarget {
  if (!isRecord(value) || typeof value.type !== "string") {
    diagnostics.push(
      diagnostic("QUALITY_ENGINEERING_TARGET_INVALID", path, "Quality target is invalid."),
    );
    return false;
  }

  if (value.type === "project") {
    if (Object.keys(value).length !== 1) {
      diagnostics.push(
        diagnostic(
          "QUALITY_ENGINEERING_TARGET_INVALID",
          path,
          "Project target must not carry an id.",
        ),
      );
      return false;
    }
    return true;
  }

  if (value.type !== "requirement" && value.type !== "test-run") {
    diagnostics.push(
      diagnostic(
        "QUALITY_ENGINEERING_TARGET_INVALID",
        `${path}.type`,
        "Quality target type is invalid.",
      ),
    );
    return false;
  }
  if (Object.keys(value).some((key) => key !== "type" && key !== "id")) {
    diagnostics.push(
      diagnostic(
        "QUALITY_ENGINEERING_TARGET_INVALID",
        path,
        "Quality target has an unknown field.",
      ),
    );
  }
  if (!isValidKebabCaseId(value.id)) {
    diagnostics.push(
      diagnostic(
        "QUALITY_ENGINEERING_TARGET_ID_INVALID",
        `${path}.id`,
        "Quality target id must use kebab-case.",
      ),
    );
    return false;
  }
  return true;
}

function validateStringArray(
  value: unknown,
  path: string,
  code: Diagnostic["code"],
  diagnostics: Diagnostic[],
): value is string[] {
  if (!Array.isArray(value) || value.some((item) => !isNonEmptyString(item))) {
    diagnostics.push(diagnostic(code, path, "The collection must contain non-empty strings."));
    return false;
  }
  if (new Set(value).size !== value.length) {
    diagnostics.push(diagnostic(code, path, "The collection must not contain duplicates."));
    return false;
  }
  return true;
}

function validateAssessment(
  value: unknown,
  index: number,
  diagnostics: Diagnostic[],
): value is QualityAssessment {
  const path = `assessments[${index}]`;
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic("QUALITY_ENGINEERING_ASSESSMENT_INVALID", path, "Assessment must be a mapping."),
    );
    return false;
  }

  let valid = true;
  if (!isValidKebabCaseId(value.id)) {
    diagnostics.push(
      diagnostic(
        "QUALITY_ENGINEERING_ASSESSMENT_ID_INVALID",
        `${path}.id`,
        "Assessment id must use kebab-case.",
      ),
    );
    valid = false;
  }
  const targetValid = validateTarget(value.target, `${path}.target`, diagnostics);
  valid = targetValid && valid;
  if (!assessmentVerdicts.includes(value.verdict as AssessmentVerdict)) {
    diagnostics.push(
      diagnostic(
        "QUALITY_ENGINEERING_VERDICT_INVALID",
        `${path}.verdict`,
        "Assessment verdict is invalid.",
      ),
    );
    valid = false;
  }
  if (!isNonEmptyString(value.summary)) {
    diagnostics.push(
      diagnostic(
        "QUALITY_ENGINEERING_SUMMARY_EMPTY",
        `${path}.summary`,
        "Assessment summary must not be empty.",
      ),
    );
    valid = false;
  }
  valid =
    validateStringArray(
      value.reasonCodes,
      `${path}.reasonCodes`,
      "QUALITY_ENGINEERING_REASON_CODES_INVALID",
      diagnostics,
    ) && valid;
  valid =
    validateStringArray(
      value.evidenceIds,
      `${path}.evidenceIds`,
      "QUALITY_ENGINEERING_EVIDENCE_IDS_INVALID",
      diagnostics,
    ) && valid;
  if (!assessmentSources.includes(value.source as AssessmentSource)) {
    diagnostics.push(
      diagnostic(
        "QUALITY_ENGINEERING_SOURCE_INVALID",
        `${path}.source`,
        "Assessment source is invalid.",
      ),
    );
    valid = false;
  }
  if (value.basedOnRevision !== null && !isSha256(value.basedOnRevision)) {
    diagnostics.push(
      diagnostic(
        "QUALITY_ENGINEERING_REVISION_INVALID",
        `${path}.basedOnRevision`,
        "Revision must be null or a lowercase SHA-256.",
      ),
    );
    valid = false;
  }
  if (!isRfc3339WithTimezone(value.createdAt)) {
    diagnostics.push(
      diagnostic(
        "QUALITY_ENGINEERING_TIME_INVALID",
        `${path}.createdAt`,
        "Assessment time must be RFC 3339 with a timezone.",
      ),
    );
    valid = false;
  }
  return valid;
}

function validateGate(
  value: unknown,
  index: number,
  diagnostics: Diagnostic[],
): value is QualityGate {
  const path = `gates[${index}]`;
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic("QUALITY_ENGINEERING_GATE_INVALID", path, "Gate must be a mapping."),
    );
    return false;
  }

  let valid = true;
  if (!isValidKebabCaseId(value.id)) {
    diagnostics.push(
      diagnostic(
        "QUALITY_ENGINEERING_GATE_ID_INVALID",
        `${path}.id`,
        "Gate id must use kebab-case.",
      ),
    );
    valid = false;
  }
  if (!gateKinds.includes(value.kind as QualityGateKind)) {
    diagnostics.push(
      diagnostic("QUALITY_ENGINEERING_GATE_KIND_INVALID", `${path}.kind`, "Gate kind is invalid."),
    );
    valid = false;
  }
  valid = validateTarget(value.target, `${path}.target`, diagnostics) && valid;
  if (!isValidKebabCaseId(value.assessmentId)) {
    diagnostics.push(
      diagnostic(
        "QUALITY_ENGINEERING_ASSESSMENT_ID_INVALID",
        `${path}.assessmentId`,
        "Assessment id must use kebab-case.",
      ),
    );
    valid = false;
  }
  if (!gateOutcomes.includes(value.outcome as QualityGateOutcome)) {
    diagnostics.push(
      diagnostic(
        "QUALITY_ENGINEERING_OUTCOME_INVALID",
        `${path}.outcome`,
        "Gate outcome is invalid.",
      ),
    );
    valid = false;
  }
  if (value.requiredHumanDecision !== true) {
    diagnostics.push(
      diagnostic(
        "QUALITY_ENGINEERING_HUMAN_DECISION_REQUIRED",
        `${path}.requiredHumanDecision`,
        "Every gate requires a human decision.",
      ),
    );
    valid = false;
  }
  if (!isRfc3339WithTimezone(value.evaluatedAt)) {
    diagnostics.push(
      diagnostic(
        "QUALITY_ENGINEERING_TIME_INVALID",
        `${path}.evaluatedAt`,
        "Gate time must be RFC 3339 with a timezone.",
      ),
    );
    valid = false;
  }
  return valid;
}

function validateDecision(
  value: unknown,
  index: number,
  diagnostics: Diagnostic[],
): value is HumanDecision {
  const path = `humanDecisions[${index}]`;
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic(
        "QUALITY_ENGINEERING_HUMAN_DECISION_INVALID",
        path,
        "Human decision must be a mapping.",
      ),
    );
    return false;
  }

  let valid = true;
  if (!isValidKebabCaseId(value.id)) {
    diagnostics.push(
      diagnostic(
        "QUALITY_ENGINEERING_HUMAN_DECISION_ID_INVALID",
        `${path}.id`,
        "Decision id must use kebab-case.",
      ),
    );
    valid = false;
  }
  if (!isValidKebabCaseId(value.gateId)) {
    diagnostics.push(
      diagnostic(
        "QUALITY_ENGINEERING_GATE_ID_INVALID",
        `${path}.gateId`,
        "Gate id must use kebab-case.",
      ),
    );
    valid = false;
  }
  if (!decisionTypes.includes(value.decision as HumanDecisionType)) {
    diagnostics.push(
      diagnostic(
        "QUALITY_ENGINEERING_DECISION_INVALID",
        `${path}.decision`,
        "Human decision type is invalid.",
      ),
    );
    valid = false;
  }
  if (!isNonEmptyString(value.reviewer)) {
    diagnostics.push(
      diagnostic(
        "QUALITY_ENGINEERING_REVIEWER_EMPTY",
        `${path}.reviewer`,
        "Reviewer must not be empty.",
      ),
    );
    valid = false;
  }
  if (!isNonEmptyString(value.rationale)) {
    diagnostics.push(
      diagnostic(
        "QUALITY_ENGINEERING_RATIONALE_EMPTY",
        `${path}.rationale`,
        "Rationale must not be empty.",
      ),
    );
    valid = false;
  }
  if (!isRfc3339WithTimezone(value.decidedAt)) {
    diagnostics.push(
      diagnostic(
        "QUALITY_ENGINEERING_TIME_INVALID",
        `${path}.decidedAt`,
        "Decision time must be RFC 3339 with a timezone.",
      ),
    );
    valid = false;
  }
  return valid;
}

function addDuplicateIdDiagnostic(
  values: unknown[],
  collection: string,
  diagnostics: Diagnostic[],
): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (!isRecord(value) || !isValidKebabCaseId(value.id)) return;
    if (seen.has(value.id)) {
      diagnostics.push(
        diagnostic(
          "QUALITY_ENGINEERING_DUPLICATE_ID",
          `${collection}[${index}].id`,
          "Id is duplicated in the collection.",
        ),
      );
    }
    seen.add(value.id);
  });
}

export function validateQualityEngineeringSnapshot(input: unknown): ValidationResult {
  const diagnostics: Diagnostic[] = [];
  if (!isRecord(input)) {
    diagnostics.push(
      diagnostic(
        "QUALITY_ENGINEERING_SNAPSHOT_INVALID",
        "$",
        "Quality engineering snapshot must be a mapping.",
      ),
    );
    return { valid: false, diagnostics };
  }
  if (input.schemaVersion !== QUALITY_ENGINEERING_SCHEMA_VERSION) {
    diagnostics.push(
      diagnostic(
        "QUALITY_ENGINEERING_SCHEMA_UNSUPPORTED",
        "schemaVersion",
        "Unsupported quality engineering schema version.",
      ),
    );
  }

  const assessmentsValue = input.assessments;
  const gatesValue = input.gates;
  const decisionsValue = input.humanDecisions;
  if (!Array.isArray(assessmentsValue)) {
    diagnostics.push(
      diagnostic(
        "QUALITY_ENGINEERING_ASSESSMENTS_INVALID",
        "qualityEngineering.assessments",
        "Assessments must be an array.",
      ),
    );
  }
  if (!Array.isArray(gatesValue)) {
    diagnostics.push(
      diagnostic(
        "QUALITY_ENGINEERING_GATES_INVALID",
        "qualityEngineering.gates",
        "Gates must be an array.",
      ),
    );
  }
  if (!Array.isArray(decisionsValue)) {
    diagnostics.push(
      diagnostic(
        "QUALITY_ENGINEERING_HUMAN_DECISIONS_INVALID",
        "qualityEngineering.humanDecisions",
        "Human decisions must be an array.",
      ),
    );
  }
  if (
    !Array.isArray(assessmentsValue) ||
    !Array.isArray(gatesValue) ||
    !Array.isArray(decisionsValue)
  ) {
    return { valid: false, diagnostics };
  }

  const assessments = assessmentsValue.map((value, index) =>
    validateAssessment(value, index, diagnostics),
  );
  const gates = gatesValue.map((value, index) => validateGate(value, index, diagnostics));
  const decisions = decisionsValue.map((value, index) =>
    validateDecision(value, index, diagnostics),
  );
  addDuplicateIdDiagnostic(assessmentsValue, "assessments", diagnostics);
  addDuplicateIdDiagnostic(gatesValue, "gates", diagnostics);
  addDuplicateIdDiagnostic(decisionsValue, "humanDecisions", diagnostics);

  const assessmentsById = new Map<string, QualityAssessment>();
  assessmentsValue.forEach((value, index) => {
    if (assessments[index] && isRecord(value) && isValidKebabCaseId(value.id)) {
      assessmentsById.set(value.id, value as unknown as QualityAssessment);
    }
  });
  const gatesById = new Map<string, QualityGate>();
  gatesValue.forEach((value, index) => {
    if (gates[index] && isRecord(value) && isValidKebabCaseId(value.id)) {
      gatesById.set(value.id, value as unknown as QualityGate);
    }
  });

  gatesValue.forEach((value, index) => {
    if (!gates[index] || !isRecord(value)) return;
    const path = `gates[${index}]`;
    const assessment = assessmentsById.get(value.assessmentId as string);
    if (!assessment) {
      diagnostics.push(
        diagnostic(
          "QUALITY_ENGINEERING_ASSESSMENT_NOT_FOUND",
          `${path}.assessmentId`,
          "Gate assessment reference was not found.",
        ),
      );
      return;
    }
    if (!sameTarget(value.target as QualityTarget, assessment.target)) {
      diagnostics.push(
        diagnostic(
          "QUALITY_ENGINEERING_TARGET_MISMATCH",
          `${path}.target`,
          "Gate target must match its assessment target.",
        ),
      );
    }
    if (value.outcome !== mapAssessmentVerdictToGateOutcome(assessment.verdict)) {
      diagnostics.push(
        diagnostic(
          "QUALITY_ENGINEERING_OUTCOME_MISMATCH",
          `${path}.outcome`,
          "Gate outcome must match its assessment verdict.",
        ),
      );
    }
  });

  const decisionKeys = new Set<string>();
  decisionsValue.forEach((value, index) => {
    if (!decisions[index] || !isRecord(value)) return;
    const path = `humanDecisions[${index}]`;
    if (!gatesById.has(value.gateId as string)) {
      diagnostics.push(
        diagnostic(
          "QUALITY_ENGINEERING_GATE_NOT_FOUND",
          `${path}.gateId`,
          "Human decision gate reference was not found.",
        ),
      );
    }
    const key = `${String(value.gateId)}\u0000${String(value.decidedAt)}\u0000${String(value.id)}`;
    if (decisionKeys.has(key)) {
      diagnostics.push(
        diagnostic(
          "QUALITY_ENGINEERING_DUPLICATE_DECISION",
          path,
          "The same gate decision is duplicated.",
        ),
      );
    }
    decisionKeys.add(key);
  });

  return { valid: diagnostics.length === 0, diagnostics };
}

export function mapAssessmentVerdictToGateOutcome(verdict: AssessmentVerdict): QualityGateOutcome {
  switch (verdict) {
    case "pass":
      return "pass";
    case "warn":
      return "warn";
    case "fail":
      return "block";
    case "insufficient-evidence":
      return "insufficient-evidence";
  }
}

export function resolveQualityGateStatus(
  gate: QualityGate,
  decisions: readonly HumanDecision[],
): ResolvedGateStatus {
  const latest = decisions
    .filter((decision) => decision.gateId === gate.id)
    .slice()
    .sort((left, right) => {
      const timeOrder = left.decidedAt.localeCompare(right.decidedAt);
      return timeOrder === 0 ? left.id.localeCompare(right.id) : timeOrder;
    })
    .at(-1);

  if (latest === undefined) return "pending";
  return latest.decision === "approve"
    ? "approved"
    : latest.decision === "reject"
      ? "rejected"
      : "waived";
}
