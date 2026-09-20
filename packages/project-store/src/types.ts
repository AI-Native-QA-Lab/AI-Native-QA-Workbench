import type {
  DiagnosticCode,
  Project,
  ProjectLocale,
} from "@ai-native-qa-workbench/domain";

export const PROJECT_FILE_RELATIVE_PATH = ".ai-qa/project.yaml";

export type StoreDiagnosticCode =
  | DiagnosticCode
  | "PROJECT_FILE_MISSING"
  | "PROJECT_FILE_MALFORMED"
  | "PROJECT_FILE_EXISTS"
  | "PROJECT_UNKNOWN_KEY";

export interface StoreDiagnostic {
  code: StoreDiagnosticCode;
  message: string;
  path: string;
  severity: "error";
}

export interface StoreValidationResult {
  valid: boolean;
  project?: Project;
  diagnostics: readonly StoreDiagnostic[];
}

export interface InitProjectResult {
  created: boolean;
  projectPath: string;
  project?: Project;
  diagnostics: readonly StoreDiagnostic[];
}

export interface ProjectStore {
  initProject(input: {
    rootDirectory: string;
    name?: string;
    description?: string;
    defaultLocale?: ProjectLocale;
  }): Promise<InitProjectResult>;

  validateProject(rootDirectory: string): Promise<StoreValidationResult>;
}
