import { describe, expect, it } from "vitest";
import { deriveProjectId, validateProject, type Project } from "@ai-native-qa-workbench/domain";

const validProject: Project = {
  schemaVersion: "0.1",
  id: "checkout-service",
  name: "Checkout Service",
  description: "",
  defaultLocale: "en",
};

describe("validateProject", () => {
  it("accepts a valid v0.1 project", () => {
    expect(validateProject(validProject)).toEqual({
      valid: true,
      diagnostics: [],
    });
  });

  it("reports an unsupported schema version", () => {
    const result = validateProject({ ...validProject, schemaVersion: "0.2" });

    expect(result.diagnostics).toContainEqual({
      code: "PROJECT_SCHEMA_UNSUPPORTED",
      message: expect.any(String),
      path: "schemaVersion",
      severity: "error",
    });
  });

  it("reports an invalid project id", () => {
    const result = validateProject({ ...validProject, id: "Bad_ID" });

    expect(result.diagnostics).toContainEqual({
      code: "PROJECT_ID_INVALID",
      message: expect.any(String),
      path: "id",
      severity: "error",
    });
  });

  it("reports an empty project name", () => {
    const result = validateProject({ ...validProject, name: "  " });

    expect(result.diagnostics).toContainEqual({
      code: "PROJECT_NAME_EMPTY",
      message: expect.any(String),
      path: "name",
      severity: "error",
    });
  });

  it("reports a non-string description", () => {
    const result = validateProject({
      ...validProject,
      description: 42 as unknown as string,
    });

    expect(result.diagnostics).toContainEqual({
      code: "PROJECT_DESCRIPTION_INVALID",
      message: expect.any(String),
      path: "description",
      severity: "error",
    });
  });

  it("reports an unsupported locale", () => {
    const result = validateProject({ ...validProject, defaultLocale: "fr" });

    expect(result.diagnostics).toContainEqual({
      code: "PROJECT_LOCALE_INVALID",
      message: expect.any(String),
      path: "defaultLocale",
      severity: "error",
    });
  });
});

describe("deriveProjectId", () => {
  it("normalizes words and separators to kebab case", () => {
    expect(deriveProjectId("My QA / 项目")).toBe("my-qa");
  });

  it("falls back when no ASCII identifier segment remains", () => {
    expect(deriveProjectId("中文项目!!!")).toBe("project");
  });
});
