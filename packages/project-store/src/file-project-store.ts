import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import {
  deriveProjectId,
  PROJECT_SCHEMA_VERSION,
  QUALITY_SCHEMA_VERSION,
  validateProject,
  validateQualitySnapshot,
  type Project,
  type QualitySnapshot,
} from "@ai-native-qa-workbench/domain";

import { parseProjectFile, serializeProject } from "./project-file.js";
import { parseQualityFile, serializeQualitySnapshot } from "./quality-file.js";
import {
  PROJECT_FILE_RELATIVE_PATH,
  QUALITY_FILE_RELATIVE_PATH,
  type InitProjectResult,
  type ProjectStore,
  type QualityWriteResult,
  type StoreDiagnostic,
  type StoreValidationResult,
} from "./types.js";

function projectPathFor(rootDirectory: string): string {
  return join(resolve(rootDirectory), PROJECT_FILE_RELATIVE_PATH);
}

function qualityPathFor(rootDirectory: string): string {
  return join(resolve(rootDirectory), QUALITY_FILE_RELATIVE_PATH);
}

function projectFileExistsDiagnostic(): StoreDiagnostic {
  return {
    code: "PROJECT_FILE_EXISTS",
    message: "Project file already exists; refusing to overwrite it.",
    path: PROJECT_FILE_RELATIVE_PATH,
    severity: "error",
  };
}

function projectFileMissingDiagnostic(): StoreDiagnostic {
  return {
    code: "PROJECT_FILE_MISSING",
    message: "Project file does not exist.",
    path: PROJECT_FILE_RELATIVE_PATH,
    severity: "error",
  };
}

function qualityFileMissingDiagnostic(): StoreDiagnostic {
  return {
    code: "QUALITY_FILE_MISSING",
    message: "Quality file does not exist.",
    path: QUALITY_FILE_RELATIVE_PATH,
    severity: "error",
  };
}

function qualityFileExistsDiagnostic(): StoreDiagnostic {
  return {
    code: "QUALITY_FILE_EXISTS",
    message: "Quality file already exists; refusing to overwrite it.",
    path: QUALITY_FILE_RELATIVE_PATH,
    severity: "error",
  };
}

function revisionFor(contents: string): string {
  return createHash("sha256").update(contents, "utf8").digest("hex");
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function writeAtomically(path: string, contents: string): Promise<void> {
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  let renamed = false;

  try {
    await writeFile(temporaryPath, contents, "utf8");
    await rename(temporaryPath, path);
    renamed = true;
  } finally {
    if (!renamed) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }
}

export class FileProjectStore implements ProjectStore {
  async initProject(input: {
    rootDirectory: string;
    name?: string;
    description?: string;
    defaultLocale?: "en" | "zh-CN";
  }): Promise<InitProjectResult> {
    const rootDirectory = resolve(input.rootDirectory);
    const projectPath = projectPathFor(rootDirectory);
    const projectDirectory = join(rootDirectory, ".ai-qa");

    await mkdir(projectDirectory, { recursive: true });

    if (await exists(projectPath)) {
      return {
        created: false,
        projectPath,
        diagnostics: [projectFileExistsDiagnostic()],
      };
    }
    if (await exists(qualityPathFor(rootDirectory))) {
      return {
        created: false,
        projectPath,
        diagnostics: [qualityFileExistsDiagnostic()],
      };
    }

    const directoryName = basename(rootDirectory);
    const project: Project = {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      id: deriveProjectId(directoryName),
      name: (input.name ?? directoryName) || "Project",
      description: input.description ?? "",
      defaultLocale: input.defaultLocale ?? "en",
    };
    const validation = validateProject(project);

    if (!validation.valid) {
      return {
        created: false,
        projectPath,
        diagnostics: validation.diagnostics,
      };
    }

    let projectWritten = false;
    try {
      await writeAtomically(projectPath, serializeProject(project));
      projectWritten = true;
      await writeAtomically(
        qualityPathFor(rootDirectory),
        serializeQualitySnapshot({
          schemaVersion: QUALITY_SCHEMA_VERSION,
          requirements: [],
          acceptanceCriteria: [],
          qualityRisks: [],
          testObligations: [],
          testCases: [],
          traceLinks: [],
        }),
      );
    } catch (error) {
      if (projectWritten) await rm(projectPath, { force: true }).catch(() => undefined);
      throw error;
    }

    return {
      created: true,
      projectPath,
      project,
      diagnostics: [],
    };
  }

  async validateProject(rootDirectory: string): Promise<StoreValidationResult> {
    const projectPath = projectPathFor(rootDirectory);

    try {
      const contents = await readFile(projectPath, "utf8");
      return parseProjectFile(contents);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return {
          valid: false,
          diagnostics: [projectFileMissingDiagnostic()],
        };
      }
      throw error;
    }
  }

  async readQuality(rootDirectory: string): Promise<StoreValidationResult> {
    const qualityPath = qualityPathFor(rootDirectory);

    try {
      const contents = await readFile(qualityPath, "utf8");
      const result = parseQualityFile(contents);
      return result.valid ? { ...result, revision: revisionFor(contents) } : result;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return { valid: false, diagnostics: [qualityFileMissingDiagnostic()] };
      }
      throw error;
    }
  }

  async validateQuality(rootDirectory: string): Promise<StoreValidationResult> {
    return this.readQuality(rootDirectory);
  }

  async writeQuality(
    rootDirectory: string,
    projectQuality: QualitySnapshot,
  ): Promise<QualityWriteResult> {
    const root = resolve(rootDirectory);
    const qualityPath = qualityPathFor(root);
    const qualityDirectory = join(root, ".ai-qa");
    const validation = validateQualitySnapshot(projectQuality);

    if (!validation.valid) {
      return {
        written: false,
        qualityPath,
        diagnostics: validation.diagnostics,
      };
    }

    const contents = serializeQualitySnapshot(projectQuality);
    await mkdir(qualityDirectory, { recursive: true });
    await writeAtomically(qualityPath, contents);

    return {
      written: true,
      qualityPath,
      revision: revisionFor(contents),
      diagnostics: [],
    };
  }
}
