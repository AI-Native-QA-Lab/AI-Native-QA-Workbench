import type {
  ArtifactReference,
  DiagnosticCode,
  EvidenceSnapshot,
  Project,
  ProjectLocale,
  QualitySnapshot,
} from "@ai-native-qa-workbench/domain";

export const PROJECT_FILE_RELATIVE_PATH = ".ai-qa/project.yaml";
export const QUALITY_FILE_RELATIVE_PATH = ".ai-qa/quality.yaml";
export const EVIDENCE_FILE_RELATIVE_PATH = ".ai-qa/evidence.yaml";
export const EVIDENCE_ARTIFACT_DIRECTORY_RELATIVE_PATH = ".ai-qa/evidence";

export type StoreDiagnosticCode =
  | DiagnosticCode
  | "PROJECT_FILE_MISSING"
  | "PROJECT_FILE_MALFORMED"
  | "PROJECT_FILE_EXISTS"
  | "PROJECT_UNKNOWN_KEY"
  | "QUALITY_FILE_MISSING"
  | "QUALITY_FILE_EXISTS"
  | "QUALITY_FILE_MALFORMED"
  | "QUALITY_UNKNOWN_KEY"
  | "EVIDENCE_FILE_MALFORMED"
  | "EVIDENCE_UNKNOWN_KEY"
  | "EVIDENCE_ARTIFACT_MISSING"
  | "EVIDENCE_ARTIFACT_PATH_UNSAFE"
  | "EVIDENCE_ARTIFACT_SIZE_MISMATCH"
  | "EVIDENCE_ARTIFACT_CHECKSUM_MISMATCH"
  | "EVIDENCE_ARTIFACT_ORPHAN"
  | "EVIDENCE_INPUT_TOO_LARGE"
  | "EVIDENCE_FORMAT_UNSUPPORTED"
  | "EVIDENCE_IMPORT_CONFLICT"
  | "EVIDENCE_REVISION_CONFLICT"
  | "EVIDENCE_REPORT_MISSING"
  | "EVIDENCE_REPORT_READ_FAILED"
  | "EVIDENCE_REPORT_MALFORMED"
  | "EVIDENCE_REPORT_FIELD_INVALID"
  | "EVIDENCE_REPORT_SECURITY_REJECTED";

export interface StoreDiagnostic {
  code: StoreDiagnosticCode;
  message: string;
  path: string;
  severity: "error";
}

export interface StoreValidationResult {
  valid: boolean;
  project?: Project;
  projectQuality?: QualitySnapshot;
  revision?: string;
  diagnostics: readonly StoreDiagnostic[];
}

export interface QualityWriteResult {
  written: boolean;
  qualityPath: string;
  revision?: string;
  diagnostics: readonly StoreDiagnostic[];
}

export interface EvidenceFileParseResult {
  valid: boolean;
  evidence?: EvidenceSnapshot;
  diagnostics: readonly StoreDiagnostic[];
}

export interface EvidenceValidationResult {
  valid: boolean;
  evidence?: EvidenceSnapshot;
  revision: string | null;
  diagnostics: readonly StoreDiagnostic[];
}

export interface EvidenceWriteResult {
  written: boolean;
  evidencePath: string;
  revision?: string;
  diagnostics: readonly StoreDiagnostic[];
}

export interface EvidenceStore {
  readEvidence(rootDirectory: string): Promise<EvidenceValidationResult>;
  validateEvidence(rootDirectory: string): Promise<EvidenceValidationResult>;
  writeEvidence(
    rootDirectory: string,
    snapshot: EvidenceSnapshot,
    expectedRevision: string | null,
  ): Promise<EvidenceWriteResult>;
}

export interface StagedEvidenceArtifact {
  reference: ArtifactReference;
  temporaryPath: string;
  finalPath: string;
}

export interface EvidenceVerificationResult {
  valid: boolean;
  revision: string | null;
  diagnostics: readonly StoreDiagnostic[];
}

export interface EvidenceArtifactStore {
  stageArtifact(rootDirectory: string, bytes: Uint8Array): Promise<StagedEvidenceArtifact>;
  commitArtifact(stage: StagedEvidenceArtifact): Promise<void>;
  discardArtifact(stage: StagedEvidenceArtifact): Promise<void>;
  verifyEvidence(rootDirectory: string): Promise<EvidenceVerificationResult>;
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

  readQuality(rootDirectory: string): Promise<StoreValidationResult>;

  validateQuality(rootDirectory: string): Promise<StoreValidationResult>;

  writeQuality(rootDirectory: string, projectQuality: QualitySnapshot): Promise<QualityWriteResult>;
}
