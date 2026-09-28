import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";

import {
  EvidenceImportService,
  EvidenceVerifyService,
  FileHumanDecisionService,
  RuleBasedQualityAssessmentProvider,
  SqliteDomainEventPublisher,
  SqliteQualityEngineeringWorkflow,
  createMockRequirementAnalysisProvider,
  runRequirementAnalysis,
  type EvidenceImporter,
  type EvidenceVerifier,
  type HumanDecisionService,
  type QualityEngineeringWorkflow,
} from "@ai-native-qa-workbench/application";
import {
  createEvidenceAdapterRegistry,
  normalizeEvidenceFormat,
} from "@ai-native-qa-workbench/evidence";
import type { DomainEvent, EvidenceFormat } from "@ai-native-qa-workbench/domain";
import {
  FileEvidenceStore,
  FileQualityEngineeringStore,
  PROJECT_FILE_RELATIVE_PATH,
  FileProjectStore,
  type EvidenceArtifactStore,
  type EvidenceStore,
  type ProjectStore,
  type QualityEngineeringStore,
  type StoreDiagnostic,
} from "@ai-native-qa-workbench/project-store";
import { SqliteRuntimeStore, type RuntimeStore } from "@ai-native-qa-workbench/runtime-store";

const USAGE = [
  "Usage:",
  "  qaw init [--name <name>] [--description <description>] [--locale en|zh-CN] [directory]",
  "  qaw validate [directory]",
  "  qaw doctor [directory]",
  "  qaw open [directory]",
  "  qaw analyze <requirement-id> [directory]",
  "  qaw evidence import <report-file> --format junit|playwright|pytest [--run-id <id>] [directory]",
  "  qaw evidence verify [directory]",
  "  qaw quality validate [directory]",
  "  qaw quality evaluate [directory] [--requirement-id <id>]",
  "  qaw quality process [directory]",
  "  qaw quality decide <gate-id> --decision approve|reject|waive --reviewer <id> --rationale <text> [directory]",
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
  qualityEngineeringStore?: QualityEngineeringStore;
  runtimeStore?: RuntimeStore;
  workflow?: QualityEngineeringWorkflow;
  humanDecisionService?: HumanDecisionService;
  clock?: () => string;
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

interface QualityValidateOptions {
  command: "quality-validate";
  directory?: string;
}

interface QualityEvaluateOptions {
  command: "quality-evaluate";
  directory?: string;
  requirementId?: string;
}

interface QualityProcessOptions {
  command: "quality-process";
  directory?: string;
}

interface QualityDecideOptions {
  command: "quality-decide";
  gateId: string;
  decision: "approve" | "reject" | "waive";
  reviewer: string;
  rationale: string;
  directory?: string;
}

type ParsedOptions =
  | InitOptions
  | ValidateOptions
  | DoctorOptions
  | OpenOptions
  | AnalyzeOptions
  | EvidenceImportOptions
  | EvidenceVerifyOptions
  | QualityValidateOptions
  | QualityEvaluateOptions
  | QualityProcessOptions
  | QualityDecideOptions;

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

function parseQualityOptions(
  tokens: string[],
): QualityValidateOptions | QualityEvaluateOptions | QualityProcessOptions | QualityDecideOptions {
  const [subcommand, ...argumentsList] = tokens;
  if (
    subcommand !== "validate" &&
    subcommand !== "evaluate" &&
    subcommand !== "process" &&
    subcommand !== "decide"
  ) {
    throw parseError(`Unknown quality subcommand: ${subcommand ?? ""}.`);
  }

  if (subcommand === "validate" || subcommand === "process") {
    let directory: string | undefined;
    for (const token of argumentsList) {
      if (token.startsWith("--")) throw parseError(`Unknown quality option: ${token}.`);
      if (directory !== undefined) throw parseError("Only one directory may be provided.");
      directory = token;
    }
    return subcommand === "validate"
      ? { command: "quality-validate", ...(directory !== undefined ? { directory } : {}) }
      : { command: "quality-process", ...(directory !== undefined ? { directory } : {}) };
  }

  if (subcommand === "evaluate") {
    let directory: string | undefined;
    let requirementId: string | undefined;
    for (let index = 0; index < argumentsList.length; index += 1) {
      const token = argumentsList[index];
      if (token === undefined) continue;
      if (token === "--requirement-id") {
        requirementId = requireOptionValue(argumentsList, index, token);
        index += 1;
        continue;
      }
      if (token === "--ai-approve" || token === "--trusted") {
        throw parseError(`${token} is not supported by quality commands.`);
      }
      if (token.startsWith("--")) throw parseError(`Unknown quality option: ${token}.`);
      if (directory !== undefined) throw parseError("Only one directory may be provided.");
      directory = token;
    }
    return {
      command: "quality-evaluate",
      ...(directory !== undefined ? { directory } : {}),
      ...(requirementId !== undefined ? { requirementId } : {}),
    };
  }

  let gateId: string | undefined;
  let decision: QualityDecideOptions["decision"] | undefined;
  let reviewer: string | undefined;
  let rationale: string | undefined;
  let directory: string | undefined;
  for (let index = 0; index < argumentsList.length; index += 1) {
    const token = argumentsList[index];
    if (token === undefined) continue;
    if (token === "--decision") {
      const value = requireOptionValue(argumentsList, index, token);
      if (value !== "approve" && value !== "reject" && value !== "waive") {
        throw parseError(`Unsupported quality decision: ${value}.`);
      }
      decision = value;
      index += 1;
      continue;
    }
    if (token === "--reviewer") {
      reviewer = requireOptionValue(argumentsList, index, token);
      index += 1;
      continue;
    }
    if (token === "--rationale") {
      rationale = requireOptionValue(argumentsList, index, token);
      index += 1;
      continue;
    }
    if (token === "--ai-approve" || token === "--trusted") {
      throw parseError(`${token} is not supported by quality commands.`);
    }
    if (token.startsWith("--")) throw parseError(`Unknown quality option: ${token}.`);
    if (gateId === undefined) {
      gateId = token;
      continue;
    }
    if (directory !== undefined) throw parseError("Only one directory may be provided.");
    directory = token;
  }
  if (!gateId) throw parseError("Gate id is required for quality decide.");
  if (!decision) throw parseError("Decision is required for quality decide.");
  if (!reviewer) throw parseError("Reviewer is required for quality decide.");
  if (!rationale) throw parseError("Rationale is required for quality decide.");
  return {
    command: "quality-decide",
    gateId,
    decision,
    reviewer,
    rationale,
    ...(directory !== undefined ? { directory } : {}),
  };
}

function parseOptions(argv: string[]): ParsedOptions {
  const [command, ...tokens] = argv;

  if (command === "evidence") return parseEvidenceOptions(tokens);
  if (command === "quality") return parseQualityOptions(tokens);

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

function writeJson(value: unknown, stdout: Output): void {
  stdout.write(`${JSON.stringify(value)}\n`);
}

function qualityEngineeringStoreFor(
  dependencies: CliDependencies,
  store: ProjectStore,
  evidenceStore: EvidenceStore & EvidenceArtifactStore,
): QualityEngineeringStore {
  return (
    dependencies.qualityEngineeringStore ?? new FileQualityEngineeringStore(store, evidenceStore)
  );
}

function runtimeDatabasePath(rootDirectory: string): string {
  return join(rootDirectory, ".ai-qa", "runtime.db");
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
    let runtimeStore = dependencies.runtimeStore;
    const importer =
      dependencies.evidenceImporter ??
      (() => {
        runtimeStore ??= new SqliteRuntimeStore(runtimeDatabasePath(rootDirectory));
        return new EvidenceImportService({
          projectStore: store,
          evidenceStore,
          adapters: createEvidenceAdapterRegistry(),
          publisher: new SqliteDomainEventPublisher({ runtimeStore }),
        });
      })();
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
    } finally {
      runtimeStore?.close();
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

  if (options.command === "quality-validate") {
    const evidenceStore = dependencies.evidenceStore ?? new FileEvidenceStore();
    const qualityEngineeringStore = qualityEngineeringStoreFor(dependencies, store, evidenceStore);
    const result = await qualityEngineeringStore.validateQualityEngineering(rootDirectory);
    if (!result.valid) {
      writeDiagnostics(result.diagnostics, stderr);
      return 1;
    }
    writeJson(result, stdout);
    return 0;
  }

  if (options.command === "quality-evaluate" || options.command === "quality-process") {
    const evidenceStore = dependencies.evidenceStore ?? new FileEvidenceStore();
    const qualityEngineeringStore = qualityEngineeringStoreFor(dependencies, store, evidenceStore);
    let runtimeStore = dependencies.runtimeStore;
    let workflow = dependencies.workflow;
    if (!workflow) {
      runtimeStore ??= new SqliteRuntimeStore(runtimeDatabasePath(rootDirectory));
      workflow = new SqliteQualityEngineeringWorkflow({
        projectStore: store,
        evidenceStore,
        qualityEngineeringStore,
        runtimeStore,
        assessmentProvider: new RuleBasedQualityAssessmentProvider(),
        ...(dependencies.clock ? { clock: dependencies.clock } : {}),
      });
    }
    try {
      if (options.command === "quality-evaluate") {
        const clock = dependencies.clock ?? (() => new Date().toISOString());
        const event: DomainEvent = {
          id: `event-quality-assessment-requested-${randomUUID()}`,
          schemaVersion: "0.3",
          type: "quality.assessment.requested",
          aggregateType: "project",
          aggregateId: "project",
          occurredAt: clock(),
          source: "application",
          payload: {
            projectRoot: rootDirectory,
            target: options.requirementId
              ? { type: "requirement", id: options.requirementId }
              : { type: "project" },
            gateKind: options.requirementId ? "requirement-readiness" : "release-readiness",
          },
        };
        const result = await workflow.dispatch(event);
        writeJson(result, stdout);
        return result.processed ? 0 : 1;
      }
      const results = await workflow.processPending({ projectRoot: rootDirectory });
      writeJson(results, stdout);
      return results.every((result) => result.processed) ? 0 : 1;
    } catch (error) {
      stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    } finally {
      runtimeStore?.close();
    }
  }

  if (options.command === "quality-decide") {
    const evidenceStore = dependencies.evidenceStore ?? new FileEvidenceStore();
    const qualityEngineeringStore = qualityEngineeringStoreFor(dependencies, store, evidenceStore);
    let runtimeStore = dependencies.runtimeStore;
    let humanDecisionService = dependencies.humanDecisionService;
    if (!humanDecisionService) {
      runtimeStore ??= new SqliteRuntimeStore(runtimeDatabasePath(rootDirectory));
      humanDecisionService = new FileHumanDecisionService({
        projectStore: store,
        evidenceStore,
        qualityEngineeringStore,
        publisher: new SqliteDomainEventPublisher({ runtimeStore }),
        ...(dependencies.clock ? { clock: dependencies.clock } : {}),
      });
    }
    try {
      const current = await qualityEngineeringStore.readQualityEngineering(rootDirectory);
      const result = await humanDecisionService.record({
        rootDirectory,
        gateId: options.gateId,
        decision: options.decision,
        reviewer: options.reviewer,
        rationale: options.rationale,
        expectedRevision: current.revision,
      });
      writeJson(result, stdout);
      return result.written && result.diagnostics.length === 0 ? 0 : 1;
    } catch (error) {
      stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    } finally {
      runtimeStore?.close();
    }
  }

  if (options.command === "doctor") {
    const evidenceStore = dependencies.evidenceStore ?? new FileEvidenceStore();
    const qualityEngineeringStore = qualityEngineeringStoreFor(dependencies, store, evidenceStore);
    const project = await store.validateProject(rootDirectory);
    const quality = await store.validateQuality(rootDirectory);
    const evidence = await evidenceStore.validateEvidence(rootDirectory);
    const qualityEngineering =
      await qualityEngineeringStore.validateQualityEngineering(rootDirectory);
    if (!project.valid) writeDiagnostics(project.diagnostics, stderr);
    if (!quality.valid) writeDiagnostics(quality.diagnostics, stderr);
    if (!evidence.valid) writeDiagnostics(evidence.diagnostics, stderr);
    if (!qualityEngineering.valid) writeDiagnostics(qualityEngineering.diagnostics, stderr);
    if (!project.valid || !quality.valid || !evidence.valid || !qualityEngineering.valid) return 1;

    const verifier = dependencies.evidenceVerifier ?? new EvidenceVerifyService({ evidenceStore });
    const result = await verifier.verify(rootDirectory);
    if (!result.valid) {
      writeDiagnostics(result.diagnostics, stderr);
      return 1;
    }
    stdout.write("Doctor passed: project, quality, evidence, and quality engineering are valid.\n");
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

  const qualityEngineeringStore = qualityEngineeringStoreFor(dependencies, store, evidenceStore);
  const qualityEngineering =
    await qualityEngineeringStore.validateQualityEngineering(rootDirectory);
  if (!qualityEngineering.valid) {
    writeDiagnostics(qualityEngineering.diagnostics, stderr);
    return 1;
  }

  stdout.write(`Project is valid: ${resolve(rootDirectory, PROJECT_FILE_RELATIVE_PATH)}\n`);
  return 0;
}
