import { resolve } from "node:path";

import {
  EvidenceImportService,
  EvidenceVerifyService,
  createMockRequirementAnalysisProvider,
  runRequirementAnalysis,
  type EvidenceImporter,
  type EvidenceVerifier,
} from "@ai-native-qa-workbench/application";
import {
  createEvidenceAdapterRegistry,
  normalizeEvidenceFormat,
} from "@ai-native-qa-workbench/evidence";
import type { EvidenceFormat } from "@ai-native-qa-workbench/domain";
import {
  FileEvidenceStore,
  PROJECT_FILE_RELATIVE_PATH,
  FileProjectStore,
  type EvidenceArtifactStore,
  type EvidenceStore,
  type ProjectStore,
  type StoreDiagnostic,
} from "@ai-native-qa-workbench/project-store";

const USAGE = [
  "Usage:",
  "  qaw init [--name <name>] [--description <description>] [--locale en|zh-CN] [directory]",
  "  qaw validate [directory]",
  "  qaw doctor [directory]",
  "  qaw open [directory]",
  "  qaw analyze <requirement-id> [directory]",
  "  qaw evidence import <report-file> --format junit|playwright|pytest [--run-id <id>] [directory]",
  "  qaw evidence verify [directory]",
].join("\n");

interface Output {
  write(chunk: string): void;
}

export interface CliDependencies {
  cwd?: string;
  store?: ProjectStore;
  evidenceStore?: EvidenceStore & EvidenceArtifactStore;
  evidenceImporter?: EvidenceImporter;
  evidenceVerifier?: EvidenceVerifier;
  stdout?: Output;
  stderr?: Output;
}

export class CliArgumentError extends Error {
  readonly name = "CliArgumentError";

  constructor(
    message: string,
    readonly exitCode: number = 1,
  ) {
    super(message + "\n\n" + USAGE);
    Object.setPrototypeOf(this, new.target.prototype);
  }
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

interface EvidenceImportOptions {
  command: "evidence-import";
  reportPath: string;
  format: EvidenceFormat;
  runId?: string;
  directory?: string;
}

interface EvidenceVerifyOptions {
  command: "evidence-verify";
  directory?: string;
}

type ParsedOptions =
  | InitOptions
  | ValidateOptions
  | DoctorOptions
  | OpenOptions
  | AnalyzeOptions
  | EvidenceImportOptions
  | EvidenceVerifyOptions;

function parseError(message: string): CliArgumentError {
  return new CliArgumentError(message);
}

function evidenceParseError(message: string): CliArgumentError {
  return new CliArgumentError(message, 2);
}

function requireOptionValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw parseError(`Missing value for ${option}.`);
  }
  return value;
}

function requireEvidenceOptionValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw evidenceParseError("Missing value for " + option + ".");
  }
  return value;
}

function parseEvidenceOptions(tokens: string[]): EvidenceImportOptions | EvidenceVerifyOptions {
  const [subcommand, ...argumentsList] = tokens;
  if (subcommand !== "import" && subcommand !== "verify") {
    throw evidenceParseError("Unknown evidence subcommand: " + (subcommand ?? "") + ".");
  }

  if (subcommand === "verify") {
    let directory: string | undefined;
    for (const token of argumentsList) {
      if (token.startsWith("--")) {
        throw evidenceParseError("Unknown evidence option: " + token + ".");
      }
      if (directory !== undefined) {
        throw evidenceParseError("Only one directory may be provided.");
      }
      directory = token;
    }
    const options: EvidenceVerifyOptions = { command: "evidence-verify" };
    if (directory !== undefined) options.directory = directory;
    return options;
  }

  let reportPath: string | undefined;
  let directory: string | undefined;
  let format: EvidenceFormat | undefined;
  let runId: string | undefined;

  for (let index = 0; index < argumentsList.length; index += 1) {
    const token = argumentsList[index];
    if (token === undefined) continue;

    if (token === "--format") {
      const value = requireEvidenceOptionValue(argumentsList, index, token);
      format = normalizeEvidenceFormat(value);
      if (!format) throw evidenceParseError("Unsupported evidence format: " + value + ".");
      index += 1;
      continue;
    }

    if (token === "--run-id") {
      runId = requireEvidenceOptionValue(argumentsList, index, token);
      index += 1;
      continue;
    }

    if (token === "--trusted") {
      throw evidenceParseError(
        "Evidence trust is assigned by the application and cannot be supplied.",
      );
    }

    if (token.startsWith("--")) {
      throw evidenceParseError("Unknown evidence option: " + token + ".");
    }

    if (reportPath === undefined) {
      reportPath = token;
      continue;
    }
    if (directory !== undefined) {
      throw evidenceParseError("Only one directory may be provided.");
    }
    directory = token;
  }

  if (!reportPath) throw evidenceParseError("Evidence report file is required.");
  if (!format) throw evidenceParseError("Evidence format is required.");

  const options: EvidenceImportOptions = {
    command: "evidence-import",
    reportPath,
    format,
  };
  if (runId !== undefined) options.runId = runId;
  if (directory !== undefined) options.directory = directory;
  return options;
}

function parseOptions(argv: string[]): ParsedOptions {
  const [command, ...tokens] = argv;

  if (command === "evidence") return parseEvidenceOptions(tokens);

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
    return error instanceof CliArgumentError ? error.exitCode : 1;
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

  if (options.command === "evidence-import") {
    const evidenceStore = dependencies.evidenceStore ?? new FileEvidenceStore();
    const importer =
      dependencies.evidenceImporter ??
      new EvidenceImportService({
        projectStore: store,
        evidenceStore,
        adapters: createEvidenceAdapterRegistry(),
      });
    try {
      const result = await importer.import({
        rootDirectory,
        reportPath: resolve(dependencies.cwd ?? process.cwd(), options.reportPath),
        format: options.format,
        ...(options.runId !== undefined ? { runId: options.runId } : {}),
      });
      if (!result.imported) {
        writeDiagnostics(result.diagnostics, stderr);
        return 1;
      }
      const prefix = result.idempotent
        ? "Evidence import reused existing record:"
        : "Evidence imported:";
      stdout.write(
        prefix +
          " run=" +
          (result.testRunId ?? "") +
          " evidence=" +
          (result.evidenceId ?? "") +
          "\n",
      );
      return 0;
    } catch (error) {
      stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }

  if (options.command === "evidence-verify") {
    const evidenceStore = dependencies.evidenceStore ?? new FileEvidenceStore();
    const project = await store.validateProject(rootDirectory);
    const quality = await store.validateQuality(rootDirectory);
    const evidence = await evidenceStore.validateEvidence(rootDirectory);
    if (!project.valid) writeDiagnostics(project.diagnostics, stderr);
    if (!quality.valid) writeDiagnostics(quality.diagnostics, stderr);
    if (!evidence.valid) writeDiagnostics(evidence.diagnostics, stderr);
    if (!project.valid || !quality.valid || !evidence.valid) return 1;

    const verifier = dependencies.evidenceVerifier ?? new EvidenceVerifyService({ evidenceStore });
    const result = await verifier.verify(rootDirectory);
    if (!result.valid) {
      writeDiagnostics(result.diagnostics, stderr);
      return 1;
    }
    stdout.write("Evidence verify passed.\n");
    return 0;
  }

  if (options.command === "doctor") {
    const evidenceStore = dependencies.evidenceStore ?? new FileEvidenceStore();
    const project = await store.validateProject(rootDirectory);
    const quality = await store.validateQuality(rootDirectory);
    const evidence = await evidenceStore.validateEvidence(rootDirectory);
    if (!project.valid) writeDiagnostics(project.diagnostics, stderr);
    if (!quality.valid) writeDiagnostics(quality.diagnostics, stderr);
    if (!evidence.valid) writeDiagnostics(evidence.diagnostics, stderr);
    if (!project.valid || !quality.valid || !evidence.valid) return 1;

    const verifier = dependencies.evidenceVerifier ?? new EvidenceVerifyService({ evidenceStore });
    const result = await verifier.verify(rootDirectory);
    if (!result.valid) {
      writeDiagnostics(result.diagnostics, stderr);
      return 1;
    }
    stdout.write("Doctor passed: project, quality, and evidence are valid.\n");
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

  const evidenceStore = dependencies.evidenceStore ?? new FileEvidenceStore();
  const evidence = await evidenceStore.validateEvidence(rootDirectory);
  if (!evidence.valid) {
    writeDiagnostics(evidence.diagnostics, stderr);
    return 1;
  }

  stdout.write(`Project is valid: ${resolve(rootDirectory, PROJECT_FILE_RELATIVE_PATH)}\n`);
  return 0;
}
