import { resolve } from "node:path";

import {
  FileProjectStore,
  PROJECT_FILE_RELATIVE_PATH,
  type ProjectStore,
  type StoreDiagnostic,
} from "@ai-native-qa-workbench/project-store";

const USAGE = `Usage:
  qaw init [--name <name>] [--description <description>] [--locale en|zh-CN] [directory]
  qaw validate [directory]`;

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

type ParsedOptions = InitOptions | ValidateOptions;

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

  if (command !== "init" && command !== "validate") {
    throw parseError(`Unknown command: ${command ?? ""}`);
  }

  let directory: string | undefined;
  let name: string | undefined;
  let description: string | undefined;
  let locale: "en" | "zh-CN" | undefined;

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

    if (token.startsWith("--")) {
      throw parseError(`Unknown option: ${token}.`);
    }

    if (directory !== undefined) {
      throw parseError("Only one directory may be provided.");
    }
    directory = token;
  }

  if (command === "validate") {
    const options: ValidateOptions = { command };
    if (directory !== undefined) {
      options.directory = directory;
    }
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

  const result = await store.validateProject(rootDirectory);
  if (!result.valid) {
    writeDiagnostics(result.diagnostics, stderr);
    return 1;
  }

  stdout.write(`Project is valid: ${resolve(rootDirectory, PROJECT_FILE_RELATIVE_PATH)}\n`);
  return 0;
}
