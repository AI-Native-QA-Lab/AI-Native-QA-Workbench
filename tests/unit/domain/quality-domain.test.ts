import { describe, expect, it } from "vitest";
import {
  validateAcceptanceCriterion,
  validateRequirement,
  validateQualityRisk,
  type AcceptanceCriterion,
  type QualityRisk,
  type Requirement,
} from "@ai-native-qa-workbench/domain";

describe("validateRequirement", () => {
  it("accepts an empty description and preserves title whitespace", () => {
    const requirement: Requirement = {
      id: "login",
      title: "  登录  ",
      description: "",
    };
    const before = structuredClone(requirement);

    expect(validateRequirement(requirement)).toEqual({ valid: true, diagnostics: [] });
    expect(requirement).toEqual(before);
  });

  it("reports malformed fields in contract order", () => {
    const result = validateRequirement({
      id: "Bad_ID",
      title: " \t",
      description: 42,
    } as unknown as Requirement);

    expect(result.valid).toBe(false);
    expect(
      result.diagnostics.map(({ code, path, severity }) => ({ code, path, severity })),
    ).toEqual([
      { code: "REQUIREMENT_ID_INVALID", path: "id", severity: "error" },
      { code: "REQUIREMENT_TITLE_EMPTY", path: "title", severity: "error" },
      { code: "REQUIREMENT_DESCRIPTION_INVALID", path: "description", severity: "error" },
    ]);
    expect(result.diagnostics.every(({ message }) => typeof message === "string")).toBe(true);
  });

  it.each([undefined, null, 42])("returns diagnostics for malformed runtime input %j", (value) => {
    expect(() => validateRequirement(value as unknown as Requirement)).not.toThrow();
    expect(validateRequirement(value as unknown as Requirement).valid).toBe(false);
  });
});

describe("validateAcceptanceCriterion", () => {
  it("accepts Chinese multiline statements and preserves the input", () => {
    const criterion: AcceptanceCriterion = {
      id: "login-success",
      requirementId: "login",
      statement: "  Given 用户已登录\nWhen 提交表单\nThen 显示成功  ",
    };
    const before = structuredClone(criterion);

    expect(validateAcceptanceCriterion(criterion)).toEqual({ valid: true, diagnostics: [] });
    expect(criterion).toEqual(before);
  });

  it("accepts a syntactically valid but currently unresolved requirementId", () => {
    expect(
      validateAcceptanceCriterion({
        id: "criterion-1",
        requirementId: "requirement-not-loaded",
        statement: "A valid statement",
      }),
    ).toEqual({ valid: true, diagnostics: [] });
  });

  it("reports id, requirementId, and statement in contract order", () => {
    const result = validateAcceptanceCriterion({
      id: "a--b",
      requirementId: "Bad_ID",
      statement: " \n\t",
    });

    expect(result.diagnostics.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: "ACCEPTANCE_CRITERION_ID_INVALID", path: "id" },
      { code: "ACCEPTANCE_CRITERION_REQUIREMENT_ID_INVALID", path: "requirementId" },
      { code: "ACCEPTANCE_CRITERION_STATEMENT_EMPTY", path: "statement" },
    ]);
  });

  it.each([
    ["id", undefined],
    ["requirementId", null],
    ["statement", 42],
  ])("returns diagnostics for malformed %s runtime data", (field, value) => {
    const criterion = {
      id: "criterion-1",
      requirementId: "login",
      statement: "valid",
      [field]: value,
    } as unknown as AcceptanceCriterion;

    expect(() => validateAcceptanceCriterion(criterion)).not.toThrow();
    expect(validateAcceptanceCriterion(criterion).valid).toBe(false);
  });
});

describe("validateQualityRisk", () => {
  it("accepts Chinese multiline statements and preserves the input", () => {
    const risk: QualityRisk = {
      id: "login-risk",
      requirementId: "login",
      statement: "  用户可能在重复提交时看到不一致状态\n需要验证幂等行为  ",
    };
    const before = structuredClone(risk);

    expect(validateQualityRisk(risk)).toEqual({ valid: true, diagnostics: [] });
    expect(risk).toEqual(before);
  });

  it("accepts a syntactically valid but currently unresolved requirementId", () => {
    expect(
      validateQualityRisk({
        id: "risk-1",
        requirementId: "requirement-not-loaded",
        statement: "A valid risk statement",
      }),
    ).toEqual({ valid: true, diagnostics: [] });
  });

  it("reports id, requirementId, and statement in contract order", () => {
    const result = validateQualityRisk({
      id: "a--b",
      requirementId: "Bad_ID",
      statement: " \n\t",
    } as unknown as QualityRisk);

    expect(
      result.diagnostics.map(({ code, path, severity }) => ({ code, path, severity })),
    ).toEqual([
      { code: "QUALITY_RISK_ID_INVALID", path: "id", severity: "error" },
      {
        code: "QUALITY_RISK_REQUIREMENT_ID_INVALID",
        path: "requirementId",
        severity: "error",
      },
      { code: "QUALITY_RISK_STATEMENT_EMPTY", path: "statement", severity: "error" },
    ]);
  });

  it.each([undefined, null, 42, "not-an-object"])(
    "returns diagnostics for malformed whole input %j",
    (value) => {
      const validate = () => validateQualityRisk(value as unknown as QualityRisk);

      expect(validate).not.toThrow();
      expect(validate().valid).toBe(false);
    },
  );

  it.each([
    ["id", 42],
    ["requirementId", null],
    ["statement", 42],
  ])("returns a diagnostic for malformed %s", (field, value) => {
    const risk = {
      id: "risk-1",
      requirementId: "login",
      statement: "valid",
      [field]: value,
    } as unknown as QualityRisk;

    expect(() => validateQualityRisk(risk)).not.toThrow();
    expect(validateQualityRisk(risk).valid).toBe(false);
  });
});

const invalidQualityRiskIds = [
  "中文",
  "has space",
  "Bad_ID",
  "has.dot",
  "a--b",
  "-leading",
  "trailing-",
  "",
];

describe("QualityRisk identifier validation", () => {
  it.each(invalidQualityRiskIds)("rejects QualityRisk.id %j", (id) => {
    expect(
      validateQualityRisk({ id, requirementId: "login", statement: "valid" }).diagnostics,
    ).toContainEqual({
      code: "QUALITY_RISK_ID_INVALID",
      message: expect.any(String),
      path: "id",
      severity: "error",
    });
  });

  it.each(invalidQualityRiskIds)("rejects QualityRisk.requirementId %j", (requirementId) => {
    expect(
      validateQualityRisk({ id: "risk-1", requirementId, statement: "valid" }).diagnostics,
    ).toContainEqual({
      code: "QUALITY_RISK_REQUIREMENT_ID_INVALID",
      message: expect.any(String),
      path: "requirementId",
      severity: "error",
    });
  });
});

const invalidIds = ["中文", "has space", "Bad_ID", "has.dot", "a--b", ""];

describe("quality domain identifier validation", () => {
  it.each(invalidIds)("rejects invalid Requirement.id %j", (id) => {
    const result = validateRequirement({ id, title: "Title", description: "" });

    expect(result.diagnostics.map(({ code, path }) => ({ code, path }))).toContainEqual({
      code: "REQUIREMENT_ID_INVALID",
      path: "id",
    });
  });

  it.each(invalidIds)("rejects invalid AcceptanceCriterion.id %j", (id) => {
    const result = validateAcceptanceCriterion({
      id,
      requirementId: "login",
      statement: "valid",
    });

    expect(result.diagnostics.map(({ code, path }) => ({ code, path }))).toContainEqual({
      code: "ACCEPTANCE_CRITERION_ID_INVALID",
      path: "id",
    });
  });

  it.each(invalidIds)("rejects invalid AcceptanceCriterion.requirementId %j", (requirementId) => {
    const result = validateAcceptanceCriterion({
      id: "criterion-1",
      requirementId,
      statement: "valid",
    });

    expect(result.diagnostics.map(({ code, path }) => ({ code, path }))).toContainEqual({
      code: "ACCEPTANCE_CRITERION_REQUIREMENT_ID_INVALID",
      path: "requirementId",
    });
  });
});
