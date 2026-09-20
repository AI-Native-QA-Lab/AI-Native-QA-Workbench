import { parse, stringify } from "yaml";
import { z } from "zod";

import {
  validateProject,
  type Project,
  type ValidationResult,
} from "@ai-native-qa-workbench/domain";

import {
  PROJECT_FILE_RELATIVE_PATH,
  type StoreDiagnostic,
  type StoreValidationResult,
} from "./types.js";

const projectFileSchema = z
  .object({
    schemaVersion: z.unknown(),
    project: z
      .object({
        id: z.unknown().optional(),
        name: z.unknown().optional(),
        description: z.unknown().optional(),
        defaultLocale: z.unknown().optional(),
      })
      .strict(),
  })
  .strict();

function diagnostic(code: StoreDiagnostic["code"], path: string, message: string): StoreDiagnostic {
  return {
    code,
    message,
    path,
    severity: "error",
  };
}

function malformed(message: string): StoreValidationResult {
  return {
    valid: false,
    diagnostics: [diagnostic("PROJECT_FILE_MALFORMED", PROJECT_FILE_RELATIVE_PATH, message)],
  };
}

function mapDomainValidation(result: ValidationResult): StoreValidationResult {
  if (result.valid) {
    throw new Error("Domain validation mapping requires a Project value.");
  }

  return {
    valid: false,
    diagnostics: result.diagnostics.map((item) => ({
      ...item,
      path: item.path === "schemaVersion" ? item.path : `project.${item.path}`,
    })),
  };
}

function mapSchemaIssues(error: z.ZodError): StoreValidationResult {
  const diagnostics = error.issues.flatMap<StoreDiagnostic>((issue) => {
    if (issue.code === "unrecognized_keys") {
      return issue.keys.map((key) =>
        diagnostic(
          "PROJECT_UNKNOWN_KEY",
          [...issue.path, key].join("."),
          `Unknown project file key: ${[...issue.path, key].join(".")}`,
        ),
      );
    }

    const path = issue.path.join(".");
    if (
      path === "project.name" &&
      issue.code === "invalid_type" &&
      issue.received === "undefined"
    ) {
      return diagnostic("PROJECT_NAME_EMPTY", path, "Project name must not be empty.");
    }

    return diagnostic("PROJECT_FILE_MALFORMED", path || PROJECT_FILE_RELATIVE_PATH, issue.message);
  });

  return {
    valid: false,
    diagnostics,
  };
}

export function parseProjectFile(contents: string): StoreValidationResult {
  let parsed: unknown;

  try {
    parsed = parse(contents);
  } catch (error) {
    return malformed(error instanceof Error ? error.message : "Unable to parse YAML.");
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return malformed("Project file must contain a YAML mapping.");
  }

  const checked = projectFileSchema.safeParse(parsed);
  if (!checked.success) {
    return mapSchemaIssues(checked.error);
  }

  const project = {
    schemaVersion: checked.data.schemaVersion,
    id: checked.data.project.id,
    name: checked.data.project.name,
    description: checked.data.project.description,
    defaultLocale: checked.data.project.defaultLocale,
  } as Project;
  const validation = validateProject(project);

  if (!validation.valid) {
    return mapDomainValidation(validation);
  }

  return {
    valid: true,
    project,
    diagnostics: [],
  };
}

export function serializeProject(project: Project): string {
  const serialized = stringify({
    schemaVersion: project.schemaVersion,
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      defaultLocale: project.defaultLocale,
    },
  });

  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}
