import { describe, expect, it } from "vitest";
import { isValidKebabCaseId } from "../../../packages/domain/src/identifiers.js";

describe("isValidKebabCaseId", () => {
  it.each(["checkout-service", "a", "a1-b2"])('accepts "%s"', (value) => {
    expect(isValidKebabCaseId(value)).toBe(true);
  });

  it.each([
    "",
    "中文",
    "Bad_ID",
    "has space",
    "has.dot",
    "a--b",
    "-leading",
    "trailing-",
    undefined,
    null,
    42,
  ])("rejects %j", (value) => {
    expect(isValidKebabCaseId(value)).toBe(false);
  });
});
