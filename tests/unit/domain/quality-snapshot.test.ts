import { describe, expect, it } from "vitest";

import {
  QUALITY_SCHEMA_VERSION,
  validateQualitySnapshot,
  type QualitySnapshot,
} from "@ai-native-qa-workbench/domain";

function emptySnapshot(): QualitySnapshot {
  return {
    schemaVersion: QUALITY_SCHEMA_VERSION,
    requirements: [],
    acceptanceCriteria: [],
    qualityRisks: [],
    testObligations: [],
    testCases: [],
    traceLinks: [],
  };
}

describe("validateQualitySnapshot", () => {
  it("accepts an empty snapshot and preserves a populated snapshot", () => {
    const snapshot: QualitySnapshot = {
      schemaVersion: QUALITY_SCHEMA_VERSION,
      requirements: [{ id: "checkout", title: "Checkout", description: "Checkout flow" }],
      acceptanceCriteria: [
        {
          id: "checkout-total",
          requirementId: "checkout",
          statement: "Total is calculated",
        },
      ],
      qualityRisks: [
        {
          id: "checkout-rounding",
          requirementId: "checkout",
          statement: "Rounding can change the payable amount",
        },
      ],
      testObligations: [
        {
          id: "checkout-rounding-check",
          riskId: "checkout-rounding",
          statement: "Verify rounding boundaries",
        },
      ],
      testCases: [
        {
          id: "checkout-rounding-boundary",
          obligationId: "checkout-rounding-check",
          title: "Rounding boundary",
          steps: "Submit a value at the rounding boundary",
          expectedResult: "The payable amount follows the documented rule",
        },
      ],
      traceLinks: [
        {
          id: "checkout-total-satisfies",
          fromType: "acceptance-criterion",
          fromId: "checkout-total",
          toType: "requirement",
          toId: "checkout",
          relation: "satisfies",
        },
        {
          id: "checkout-rounding-mitigates",
          fromType: "quality-risk",
          fromId: "checkout-rounding",
          toType: "requirement",
          toId: "checkout",
          relation: "mitigates",
        },
        {
          id: "checkout-rounding-verifies",
          fromType: "test-obligation",
          fromId: "checkout-rounding-check",
          toType: "quality-risk",
          toId: "checkout-rounding",
          relation: "verifies",
        },
        {
          id: "checkout-rounding-case-verifies",
          fromType: "test-case",
          fromId: "checkout-rounding-boundary",
          toType: "test-obligation",
          toId: "checkout-rounding-check",
          relation: "verifies",
        },
      ],
    };
    const before = structuredClone(snapshot);

    expect(validateQualitySnapshot(emptySnapshot())).toEqual({ valid: true, diagnostics: [] });
    expect(validateQualitySnapshot(snapshot)).toEqual({ valid: true, diagnostics: [] });
    expect(snapshot).toEqual(before);
  });

  it("reports duplicate entity IDs and broken direct references", () => {
    const result = validateQualitySnapshot({
      ...emptySnapshot(),
      requirements: [
        { id: "checkout", title: "First", description: "First" },
        { id: "checkout", title: "Duplicate", description: "Duplicate" },
      ],
      acceptanceCriteria: [
        {
          id: "checkout-total",
          requirementId: "missing-requirement",
          statement: "Total is calculated",
        },
      ],
      qualityRisks: [
        {
          id: "checkout-risk",
          requirementId: "missing-requirement",
          statement: "Risk",
        },
      ],
      testObligations: [
        {
          id: "checkout-obligation",
          riskId: "missing-risk",
          statement: "Obligation",
        },
      ],
      testCases: [
        {
          id: "checkout-case",
          obligationId: "missing-obligation",
          title: "Case",
          steps: "Steps",
          expectedResult: "Expected",
        },
      ],
    });

    expect(result.diagnostics.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: "QUALITY_DUPLICATE_ID", path: "requirements[1].id" },
      {
        code: "QUALITY_REFERENCE_NOT_FOUND",
        path: "acceptanceCriteria[0].requirementId",
      },
      { code: "QUALITY_REFERENCE_NOT_FOUND", path: "qualityRisks[0].requirementId" },
      { code: "QUALITY_REFERENCE_NOT_FOUND", path: "testObligations[0].riskId" },
      { code: "QUALITY_REFERENCE_NOT_FOUND", path: "testCases[0].obligationId" },
    ]);
  });

  it("rejects invalid, self-referencing, and duplicate trace links", () => {
    const result = validateQualitySnapshot({
      ...emptySnapshot(),
      requirements: [{ id: "checkout", title: "Checkout", description: "Checkout" }],
      traceLinks: [
        {
          id: "invalid-link",
          fromType: "requirement",
          fromId: "checkout",
          toType: "requirement",
          toId: "checkout",
          relation: "verifies",
        },
        {
          id: "self-link",
          fromType: "requirement",
          fromId: "checkout",
          toType: "requirement",
          toId: "checkout",
          relation: "satisfies",
        },
        {
          id: "self-link",
          fromType: "requirement",
          fromId: "checkout",
          toType: "requirement",
          toId: "checkout",
          relation: "satisfies",
        },
      ],
    });

    expect(result.diagnostics.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: "QUALITY_TRACE_LINK_INVALID", path: "traceLinks[0]" },
      { code: "QUALITY_TRACE_LINK_SELF_REFERENCE", path: "traceLinks[1]" },
      { code: "QUALITY_TRACE_LINK_SELF_REFERENCE", path: "traceLinks[2]" },
      { code: "QUALITY_TRACE_LINK_DUPLICATE", path: "traceLinks[2]" },
    ]);
  });

  it("returns collection diagnostics for malformed runtime input without throwing", () => {
    const result = validateQualitySnapshot({
      schemaVersion: "0.2",
      requirements: "not-an-array",
      acceptanceCriteria: null,
      qualityRisks: 42,
      testObligations: {},
      testCases: undefined,
      traceLinks: "not-an-array",
    } as unknown as QualitySnapshot);

    expect(result.valid).toBe(false);
    expect(result.diagnostics.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: "QUALITY_SCHEMA_UNSUPPORTED", path: "schemaVersion" },
      { code: "QUALITY_REQUIREMENTS_NOT_ARRAY", path: "requirements" },
      { code: "QUALITY_ACCEPTANCE_CRITERIA_NOT_ARRAY", path: "acceptanceCriteria" },
      { code: "QUALITY_RISKS_NOT_ARRAY", path: "qualityRisks" },
      { code: "QUALITY_TEST_OBLIGATIONS_NOT_ARRAY", path: "testObligations" },
      { code: "QUALITY_TEST_CASES_NOT_ARRAY", path: "testCases" },
      { code: "QUALITY_TRACE_LINKS_NOT_ARRAY", path: "traceLinks" },
    ]);
  });
});
