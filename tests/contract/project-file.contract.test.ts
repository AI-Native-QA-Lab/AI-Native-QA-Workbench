import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { FileProjectStore, parseProjectFile } from "@ai-native-qa-workbench/project-store";

const validYaml = [
  'schemaVersion: "0.1"',
  "project:",
  "  id: checkout-service",
  "  name: Checkout Service",
  '  description: ""',
  "  defaultLocale: en",
  "",
].join("\n");

describe("project file parsing contract", () => {
  it("parses a valid project file into a flat Project", () => {
    expect(parseProjectFile(validYaml)).toEqual({
      valid: true,
      project: {
        schemaVersion: "0.1",
        id: "checkout-service",
        name: "Checkout Service",
        description: "",
        defaultLocale: "en",
      },
      diagnostics: [],
    });
  });

  it.each([
    ["empty", ""],
    ["invalid YAML", "project: ["],
    ["scalar YAML", "just-a-scalar"],
  ])("reports malformed %s input", (_label, contents) => {
    const result = parseProjectFile(contents);

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual({
      code: "PROJECT_FILE_MALFORMED",
      message: expect.any(String),
      path: ".ai-qa/project.yaml",
      severity: "error",
    });
  });

  it("reports an unsupported schema version", () => {
    const result = parseProjectFile(validYaml.replace('"0.1"', '"0.2"'));

    expect(result.diagnostics).toContainEqual({
      code: "PROJECT_SCHEMA_UNSUPPORTED",
      message: expect.any(String),
      path: "schemaVersion",
      severity: "error",
    });
  });

  it("reports a missing project name", () => {
    const result = parseProjectFile(validYaml.replace("  name: Checkout Service\n", ""));

    expect(result.diagnostics).toContainEqual({
      code: "PROJECT_NAME_EMPTY",
      message: expect.any(String),
      path: "project.name",
      severity: "error",
    });
  });

  it("reports unknown top-level keys", () => {
    const result = parseProjectFile(`metadata: {}
${validYaml}`);

    expect(result.diagnostics).toContainEqual({
      code: "PROJECT_UNKNOWN_KEY",
      message: expect.any(String),
      path: "metadata",
      severity: "error",
    });
  });

  it("reports unknown project keys", () => {
    const result = parseProjectFile(
      validYaml.replace("  defaultLocale: en\n", "  defaultLocale: en\n  owner: team\n"),
    );

    expect(result.diagnostics).toContainEqual({
      code: "PROJECT_UNKNOWN_KEY",
      message: expect.any(String),
      path: "project.owner",
      severity: "error",
    });
  });

  it("reports an unsupported locale", () => {
    const result = parseProjectFile(validYaml.replace("defaultLocale: en", "defaultLocale: fr"));

    expect(result.diagnostics).toContainEqual({
      code: "PROJECT_LOCALE_INVALID",
      message: expect.any(String),
      path: "project.defaultLocale",
      severity: "error",
    });
  });
});

describe("FileProjectStore", () => {
  it("reports a missing project file without mutating the directory", async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), "qaw-project-"));

    try {
      const result = await new FileProjectStore().validateProject(rootDirectory);

      expect(result.valid).toBe(false);
      expect(result.diagnostics).toContainEqual({
        code: "PROJECT_FILE_MISSING",
        message: expect.any(String),
        path: ".ai-qa/project.yaml",
        severity: "error",
      });
    } finally {
      await rm(rootDirectory, { recursive: true, force: true });
    }
  });

  it("creates a project file that validates", async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), "qaw-project-"));

    try {
      const store = new FileProjectStore();
      const initialized = await store.initProject({ rootDirectory });
      const validated = await store.validateProject(rootDirectory);

      expect(initialized.created).toBe(true);
      expect(initialized.projectPath).toBe(join(rootDirectory, ".ai-qa", "project.yaml"));
      expect(validated.valid).toBe(true);
      expect(validated.diagnostics).toEqual([]);
    } finally {
      await rm(rootDirectory, { recursive: true, force: true });
    }
  });

  it("does not overwrite an existing project file", async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), "qaw-project-"));

    try {
      const store = new FileProjectStore();
      const first = await store.initProject({
        rootDirectory,
        name: "Original Project",
      });
      const before = await readFile(first.projectPath, "utf8");
      const second = await store.initProject({
        rootDirectory,
        name: "Replacement Project",
      });
      const after = await readFile(first.projectPath, "utf8");

      expect(second.created).toBe(false);
      expect(second.diagnostics).toContainEqual({
        code: "PROJECT_FILE_EXISTS",
        message: expect.any(String),
        path: ".ai-qa/project.yaml",
        severity: "error",
      });
      expect(after).toBe(before);
    } finally {
      await rm(rootDirectory, { recursive: true, force: true });
    }
  });
});
