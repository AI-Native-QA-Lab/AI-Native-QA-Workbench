import { isValidKebabCaseId } from "./identifiers.js";
import type { Diagnostic, DiagnosticCode, ValidationResult } from "./project.js";

export const QUALITY_SCHEMA_VERSION = "0.1" as const;

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

export interface TestCase {
  id: string;
  obligationId: string;
  title: string;
  steps: string;
  expectedResult: string;
}

export type QualityEntityType =
  "requirement" | "acceptance-criterion" | "quality-risk" | "test-obligation" | "test-case";

export type TraceLinkRelation = "satisfies" | "mitigates" | "verifies";

export interface TraceLink {
  id: string;
  fromType: QualityEntityType;
  fromId: string;
  toType: QualityEntityType;
  toId: string;
  relation: TraceLinkRelation;
}

export interface QualitySnapshot {
  schemaVersion: typeof QUALITY_SCHEMA_VERSION;
  requirements: Requirement[];
  acceptanceCriteria: AcceptanceCriterion[];
  qualityRisks: QualityRisk[];
  testObligations: TestObligation[];
  testCases: TestCase[];
  traceLinks: TraceLink[];
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
      diagnostic("TEST_OBLIGATION_RISK_ID_INVALID", "riskId", "Test obligation riskId is invalid."),
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

export function validateTestCase(testCase: TestCase): ValidationResult {
  const candidate = (testCase ?? {}) as Partial<TestCase>;
  const diagnostics: Diagnostic[] = [];

  if (!isValidKebabCaseId(candidate.id)) {
    diagnostics.push(diagnostic("TEST_CASE_ID_INVALID", "id", "Test case id is invalid."));
  }

  if (!isValidKebabCaseId(candidate.obligationId)) {
    diagnostics.push(
      diagnostic(
        "TEST_CASE_OBLIGATION_ID_INVALID",
        "obligationId",
        "Test case obligationId is invalid.",
      ),
    );
  }

  if (typeof candidate.title !== "string" || candidate.title.trim().length === 0) {
    diagnostics.push(
      diagnostic("TEST_CASE_TITLE_EMPTY", "title", "Test case title must not be empty."),
    );
  }

  if (typeof candidate.steps !== "string" || candidate.steps.trim().length === 0) {
    diagnostics.push(
      diagnostic("TEST_CASE_STEPS_EMPTY", "steps", "Test case steps must not be empty."),
    );
  }

  if (
    typeof candidate.expectedResult !== "string" ||
    candidate.expectedResult.trim().length === 0
  ) {
    diagnostics.push(
      diagnostic(
        "TEST_CASE_EXPECTED_RESULT_EMPTY",
        "expectedResult",
        "Test case expectedResult must not be empty.",
      ),
    );
  }

  return {
    valid: diagnostics.length === 0,
    diagnostics,
  };
}

type QualityCollectionKey =
  | "requirements"
  | "acceptanceCriteria"
  | "qualityRisks"
  | "testObligations"
  | "testCases"
  | "traceLinks";

const qualityCollectionCodes: Record<QualityCollectionKey, DiagnosticCode> = {
  requirements: "QUALITY_REQUIREMENTS_NOT_ARRAY",
  acceptanceCriteria: "QUALITY_ACCEPTANCE_CRITERIA_NOT_ARRAY",
  qualityRisks: "QUALITY_RISKS_NOT_ARRAY",
  testObligations: "QUALITY_TEST_OBLIGATIONS_NOT_ARRAY",
  testCases: "QUALITY_TEST_CASES_NOT_ARRAY",
  traceLinks: "QUALITY_TRACE_LINKS_NOT_ARRAY",
};

const qualityEntityCollections: Record<
  Exclude<QualityCollectionKey, "traceLinks">,
  QualityEntityType
> = {
  requirements: "requirement",
  acceptanceCriteria: "acceptance-criterion",
  qualityRisks: "quality-risk",
  testObligations: "test-obligation",
  testCases: "test-case",
};

const traceLinkRelations: Record<
  TraceLinkRelation,
  ReadonlyArray<[QualityEntityType, QualityEntityType]>
> = {
  satisfies: [
    ["acceptance-criterion", "requirement"],
    ["requirement", "requirement"],
  ],
  mitigates: [["quality-risk", "requirement"]],
  verifies: [
    ["test-obligation", "quality-risk"],
    ["test-case", "test-obligation"],
  ],
};

function collectionDiagnostic(code: DiagnosticCode, path: string, message: string): Diagnostic {
  return diagnostic(code, path, message);
}

function appendEntityDiagnostics(
  diagnostics: Diagnostic[],
  collection: Exclude<QualityCollectionKey, "traceLinks">,
  values: unknown[],
  validator: (value: never) => ValidationResult,
): void {
  const seenIds = new Set<string>();

  values.forEach((value, index) => {
    const result = validator(value as never);
    diagnostics.push(
      ...result.diagnostics.map((item) => ({
        ...item,
        path: `${collection}[${index}].${item.path}`,
      })),
    );

    const id =
      value !== null && typeof value === "object" && "id" in value
        ? (value as { id?: unknown }).id
        : undefined;
    if (typeof id === "string") {
      if (seenIds.has(id)) {
        diagnostics.push(
          collectionDiagnostic(
            "QUALITY_DUPLICATE_ID",
            `${collection}[${index}].id`,
            `Duplicate ${collection} id: ${id}`,
          ),
        );
      } else {
        seenIds.add(id);
      }
    }
  });
}

function entityIdSets(snapshot: Partial<QualitySnapshot>): Map<QualityEntityType, Set<string>> {
  const sets = new Map<QualityEntityType, Set<string>>();
  for (const collection of Object.keys(qualityEntityCollections) as Array<
    Exclude<QualityCollectionKey, "traceLinks">
  >) {
    const values = snapshot[collection];
    const ids = new Set<string>();
    if (Array.isArray(values)) {
      for (const value of values) {
        if (value !== null && typeof value === "object" && "id" in value) {
          const id = (value as { id?: unknown }).id;
          if (typeof id === "string") ids.add(id);
        }
      }
    }
    sets.set(qualityEntityCollections[collection], ids);
  }
  return sets;
}

function hasAllowedTraceCombination(link: TraceLink): boolean {
  const relations = traceLinkRelations[link.relation];
  return relations.some(
    ([fromType, toType]) => fromType === link.fromType && toType === link.toType,
  );
}

export function validateQualitySnapshot(snapshot: QualitySnapshot): ValidationResult {
  const candidate = (snapshot ?? {}) as Partial<QualitySnapshot>;
  const diagnostics: Diagnostic[] = [];

  if (candidate.schemaVersion !== QUALITY_SCHEMA_VERSION) {
    diagnostics.push(
      collectionDiagnostic(
        "QUALITY_SCHEMA_UNSUPPORTED",
        "schemaVersion",
        `Unsupported quality schema version: ${String(candidate.schemaVersion)}`,
      ),
    );
  }

  const collectionKeys: QualityCollectionKey[] = [
    "requirements",
    "acceptanceCriteria",
    "qualityRisks",
    "testObligations",
    "testCases",
    "traceLinks",
  ];
  for (const collection of collectionKeys) {
    if (!Array.isArray(candidate[collection])) {
      diagnostics.push(
        collectionDiagnostic(
          qualityCollectionCodes[collection],
          collection,
          `${collection} must be an array.`,
        ),
      );
    }
  }

  const requirements = Array.isArray(candidate.requirements) ? candidate.requirements : [];
  const acceptanceCriteria = Array.isArray(candidate.acceptanceCriteria)
    ? candidate.acceptanceCriteria
    : [];
  const qualityRisks = Array.isArray(candidate.qualityRisks) ? candidate.qualityRisks : [];
  const testObligations = Array.isArray(candidate.testObligations) ? candidate.testObligations : [];
  const testCases = Array.isArray(candidate.testCases) ? candidate.testCases : [];
  const traceLinks = Array.isArray(candidate.traceLinks) ? candidate.traceLinks : [];

  appendEntityDiagnostics(diagnostics, "requirements", requirements, validateRequirement);
  appendEntityDiagnostics(
    diagnostics,
    "acceptanceCriteria",
    acceptanceCriteria,
    validateAcceptanceCriterion,
  );
  appendEntityDiagnostics(diagnostics, "qualityRisks", qualityRisks, validateQualityRisk);
  appendEntityDiagnostics(diagnostics, "testObligations", testObligations, validateTestObligation);
  appendEntityDiagnostics(diagnostics, "testCases", testCases, validateTestCase);

  const ids = entityIdSets(candidate);
  const references: Array<{
    collection: Exclude<QualityCollectionKey, "traceLinks">;
    referenceField: string;
    targetType: QualityEntityType;
    values: unknown[];
  }> = [
    {
      collection: "acceptanceCriteria",
      referenceField: "requirementId",
      targetType: "requirement",
      values: acceptanceCriteria,
    },
    {
      collection: "qualityRisks",
      referenceField: "requirementId",
      targetType: "requirement",
      values: qualityRisks,
    },
    {
      collection: "testObligations",
      referenceField: "riskId",
      targetType: "quality-risk",
      values: testObligations,
    },
    {
      collection: "testCases",
      referenceField: "obligationId",
      targetType: "test-obligation",
      values: testCases,
    },
  ];

  for (const reference of references) {
    reference.values.forEach((value, index) => {
      if (value === null || typeof value !== "object") return;
      const targetId = (value as Record<string, unknown>)[reference.referenceField];
      if (typeof targetId === "string" && !ids.get(reference.targetType)?.has(targetId)) {
        diagnostics.push(
          collectionDiagnostic(
            "QUALITY_REFERENCE_NOT_FOUND",
            `${reference.collection}[${index}].${reference.referenceField}`,
            `Referenced ${reference.targetType} does not exist: ${targetId}`,
          ),
        );
      }
    });
  }

  const seenTraceLinks = new Set<string>();
  traceLinks.forEach((value, index) => {
    const path = `traceLinks[${index}]`;
    if (value === null || typeof value !== "object") {
      diagnostics.push(
        collectionDiagnostic("QUALITY_TRACE_LINK_INVALID", path, "Trace link must be an object."),
      );
      return;
    }
    const link = value as Partial<TraceLink>;
    if (
      typeof link.id !== "string" ||
      typeof link.fromType !== "string" ||
      typeof link.fromId !== "string" ||
      typeof link.toType !== "string" ||
      typeof link.toId !== "string" ||
      typeof link.relation !== "string" ||
      !isValidKebabCaseId(link.id) ||
      !isValidKebabCaseId(link.fromId) ||
      !isValidKebabCaseId(link.toId) ||
      !Object.hasOwn(traceLinkRelations, link.relation)
    ) {
      diagnostics.push(
        collectionDiagnostic("QUALITY_TRACE_LINK_INVALID", path, "Trace link shape is invalid."),
      );
      return;
    }

    const completeLink = link as TraceLink;
    if (!hasAllowedTraceCombination(completeLink)) {
      diagnostics.push(
        collectionDiagnostic(
          "QUALITY_TRACE_LINK_INVALID",
          path,
          "Trace link type combination is not allowed.",
        ),
      );
      return;
    }

    if (
      completeLink.fromType === completeLink.toType &&
      completeLink.fromId === completeLink.toId
    ) {
      diagnostics.push(
        collectionDiagnostic(
          "QUALITY_TRACE_LINK_SELF_REFERENCE",
          path,
          "Trace link must not reference itself.",
        ),
      );
    }

    const key = [
      completeLink.fromType,
      completeLink.fromId,
      completeLink.toType,
      completeLink.toId,
      completeLink.relation,
    ].join("|");
    if (seenTraceLinks.has(key)) {
      diagnostics.push(
        collectionDiagnostic("QUALITY_TRACE_LINK_DUPLICATE", path, "Duplicate trace link."),
      );
    } else {
      seenTraceLinks.add(key);
    }
  });

  return {
    valid: diagnostics.length === 0,
    diagnostics,
  };
}
