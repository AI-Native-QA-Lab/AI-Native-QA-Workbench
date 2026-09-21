import { resolve } from "node:path";

import {
  createMockRequirementAnalysisProvider,
  runRequirementAnalysis,
} from "@ai-native-qa-workbench/application";
import {
  FileProjectStore,
  PROJECT_FILE_RELATIVE_PATH,
  type ProjectStore,
  type StoreDiagnostic,
} from "@ai-native-qa-workbench/project-store";

const USAGE = `Usage:
  qaw init [--name <name>] [--description <description>] [--locale en|zh-CN] [directory]
  qaw validate [directory]
  qaw doctor [directory]
  qaw open [directory]
  qaw analyze <requirement-id> [directory]`;

interface Output {
  write(chunk: string): void;
}

export interface CliDependencies {
  cwd?: string;
  store?: ProjectStore;
  stdout?: Output;
  stderr?: Output;
}

interface InitOptions {
  command: "init";
  directory?: string;
  name?: string;
  description?: string;
  locale?: "en" | "zh-CN";
}

interface ValidateOptions {
  command: "validate";
  directory?: string;
}

interface DoctorOptions {
  command: "doctor";
  directory?: string;
}

interface OpenOptions {
  command: "open";
  directory?: string;
}

interface AnalyzeOptions {
  command: "analyze";
  requirementId: string;
  directory?: string;
  outputLocale?: "en" | "zh-CN";
}

type ParsedOptions = InitOptions | ValidateOptions | DoctorOptions | OpenOptions | AnalyzeOptions;

function parseError(message: string): Error {
  return new Error(`${message}\n\n${USAGE}`);
}

function requireOptionValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw parseError(`Missing value for ${option}.`);
  }
  return value;
}

function parseOptions(argv: string[]): ParsedOptions {
  const [command, ...tokens] = argv;

  if (
    command !== "init" &&
    command !== "validate" &&
    command !== "doctor" &&
    command !== "open" &&
    command !== "analyze"
  ) {
    throw parseError(`Unknown command: ${command ?? ""}`);
  }

  let directory: string | undefined;
  let name: string | undefined;
  let description: string | undefined;
  let locale: "en" | "zh-CN" | undefined;
  let outputLocale: "en" | "zh-CN" | undefined;
  let requirementId: string | undefined;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined) {
      break;
    }

    if (token === "--name") {
      if (command !== "init") {
        throw parseError("--name is only available for init.");
      }
      name = requireOptionValue(tokens, index, token);
      index += 1;
      continue;
    }

    if (token === "--description") {
      if (command !== "init") {
        throw parseError("--description is only available for init.");
      }
      description = requireOptionValue(tokens, index, token);
      index += 1;
      continue;
    }

    if (token === "--locale") {
      if (command !== "init") {
        throw parseError("--locale is only available for init.");
      }
      const value = requireOptionValue(tokens, index, token);
      if (value !== "en" && value !== "zh-CN") {
        throw parseError(`Unsupported locale: ${value}.`);
      }
      locale = value;
      index += 1;
      continue;
    }

    if (token === "--output-locale") {
      if (command !== "analyze") {
        throw parseError("--output-locale is only available for analyze.");
      }
      const value = requireOptionValue(tokens, index, token);
      if (value !== "en" && value !== "zh-CN") {
        throw parseError(`Unsupported output locale: ${value}.`);
      }
      outputLocale = value;
      index += 1;
      continue;
    }

    if (token.startsWith("--")) {
      throw parseError(`Unknown option: ${token}.`);
    }

    if (command === "analyze" && requirementId === undefined) {
      requirementId = token;
      continue;
    }

    if (directory !== undefined) {
      throw parseError("Only one directory may be provided.");
    }
    directory = token;
  }

  if (command === "validate" || command === "doctor" || command === "open") {
    const options = { command } as ValidateOptions | DoctorOptions | OpenOptions;
    if (directory !== undefined) {
      options.directory = directory;
    }
    return options;
  }

  if (command === "analyze") {
    if (!requirementId) throw parseError("Requirement id is required for analyze.");
    const options: AnalyzeOptions = { command, requirementId };
    if (directory !== undefined) options.directory = directory;
    if (outputLocale !== undefined) options.outputLocale = outputLocale;
    return options;
  }

  const options: InitOptions = { command };
  if (directory !== undefined) {
    options.directory = directory;
  }
  if (name !== undefined) {
    options.name = name;
  }
  if (description !== undefined) {
    options.description = description;
  }
  if (locale !== undefined) {
    options.locale = locale;
  }
  return options;
}

function writeDiagnostics(diagnostics: readonly StoreDiagnostic[], stderr: Output): void {
  for (const diagnostic of diagnostics) {
    stderr.write(`${diagnostic.code} ${diagnostic.path}: ${diagnostic.message}\n`);
  }
}

export async function runCli(argv: string[], dependencies: CliDependencies = {}): Promise<number> {
  const stdout = dependencies.stdout ?? process.stdout;
  const stderr = dependencies.stderr ?? process.stderr;

  let options: ParsedOptions;
  try {
    options = parseOptions(argv);
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  const rootDirectory = resolve(dependencies.cwd ?? process.cwd(), options.directory ?? ".");
  const store = dependencies.store ?? new FileProjectStore();

  if (options.command === "init") {
    const initInput: Parameters<ProjectStore["initProject"]>[0] = {
      rootDirectory,
    };
    if (options.name !== undefined) {
      initInput.name = options.name;
    }
    if (options.description !== undefined) {
      initInput.description = options.description;
    }
    if (options.locale !== undefined) {
      initInput.defaultLocale = options.locale;
    }
    const result = await store.initProject(initInput);

    if (!result.created) {
      writeDiagnostics(result.diagnostics, stderr);
      return 1;
    }

    stdout.write(`Initialized project at ${result.projectPath}\n`);
    return 0;
  }

  if (options.command === "doctor") {
    const project = await store.validateProject(rootDirectory);
    const quality = await store.validateQuality(rootDirectory);
    if (!project.valid) writeDiagnostics(project.diagnostics, stderr);
    if (!quality.valid) writeDiagnostics(quality.diagnostics, stderr);
    if (!project.valid || !quality.valid) return 1;
    stdout.write("Doctor passed: project and quality are valid.\n");
    return 0;
  }

  if (options.command === "open") {
    const project = await store.validateProject(rootDirectory);
    const quality = await store.readQuality(rootDirectory);
    if (!project.valid) writeDiagnostics(project.diagnostics, stderr);
    if (!quality.valid) writeDiagnostics(quality.diagnostics, stderr);
    if (!project.valid || !quality.valid || !project.project || !quality.projectQuality) return 1;
    stdout.write(
      `Project: ${project.project.name} (${project.project.id})\n` +
        `Quality: requirements=${quality.projectQuality.requirements.length} ` +
        `acceptanceCriteria=${quality.projectQuality.acceptanceCriteria.length} ` +
        `qualityRisks=${quality.projectQuality.qualityRisks.length} ` +
        `testObligations=${quality.projectQuality.testObligations.length} ` +
        `testCases=${quality.projectQuality.testCases.length} ` +
        `traceLinks=${quality.projectQuality.traceLinks.length}\n`,
    );
    return 0;
  }

  if (options.command === "analyze") {
    const quality = await store.readQuality(rootDirectory);
    if (!quality.valid || !quality.projectQuality || !quality.revision) {
      writeDiagnostics(quality.diagnostics, stderr);
      return 1;
    }
    try {
      const proposal = await runRequirementAnalysis(
        {
          snapshot: quality.projectQuality,
          requirementId: options.requirementId,
          baseRevision: quality.revision,
          outputLocale: options.outputLocale ?? "en",
        },
        createMockRequirementAnalysisProvider(),
      );
      stdout.write(`${JSON.stringify(proposal)}\n`);
      return 0;
    } catch (error) {
      stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }

  const result = await store.validateProject(rootDirectory);
  if (!result.valid) {
    writeDiagnostics(result.diagnostics, stderr);
    return 1;
  }

  const quality = await store.validateQuality(rootDirectory);
  if (!quality.valid) {
    writeDiagnostics(quality.diagnostics, stderr);
    return 1;
  }

  stdout.write(`Project is valid: ${resolve(rootDirectory, PROJECT_FILE_RELATIVE_PATH)}\n`);
  return 0;
}
