import type {
  EvidenceArtifactStore,
  EvidenceVerificationResult,
} from "@ai-native-qa-workbench/project-store";

export interface EvidenceVerifier {
  verify(rootDirectory: string): Promise<EvidenceVerificationResult>;
}

export class EvidenceVerifyService implements EvidenceVerifier {
  private readonly evidenceStore: EvidenceArtifactStore;

  constructor(dependencies: { evidenceStore: EvidenceArtifactStore }) {
    this.evidenceStore = dependencies.evidenceStore;
  }

  verify(rootDirectory: string): Promise<EvidenceVerificationResult> {
    return this.evidenceStore.verifyEvidence(rootDirectory);
  }
}
