import {
  validateEvidenceSnapshot,
  validateQualitySnapshot,
  type AssessmentSource,
  type AssessmentVerdict,
  type EvidenceSnapshot,
  type QualitySnapshot,
  type QualityTarget,
} from "@ai-native-qa-workbench/domain";
import type { StoreDiagnostic } from "@ai-native-qa-workbench/project-store";

export type EvidenceIntegrityDiagnostic = StoreDiagnostic;

export interface QualityAssessmentInput {
  target: QualityTarget;
  quality: QualitySnapshot;
  evidence: EvidenceSnapshot;
  evidenceDiagnostics: readonly StoreDiagnostic[];
  evidenceIntegrity: readonly EvidenceIntegrityDiagnostic[];
}

export interface QualityAssessmentDraft {
  verdict: AssessmentVerdict;
  summary: string;
  reasonCodes: string[];
  evidenceIds: string[];
  source: AssessmentSource;
}

export interface QualityAssessmentProvider {
  assess(input: QualityAssessmentInput): Promise<QualityAssessmentDraft>;
}

const integrityFailureCodes = new Set([
  "EVIDENCE_ARTIFACT_MISSING",
  "EVIDENCE_ARTIFACT_SIZE_MISMATCH",
  "EVIDENCE_ARTIFACT_CHECKSUM_MISMATCH",
]);

function evidenceIdsForTarget(input: QualityAssessmentInput): string[] {
  return evidenceForTarget(input).evidenceRecords.map((record) => record.id);
}

function evidenceForTarget(input: QualityAssessmentInput): EvidenceSnapshot {
  const target = input.target;
  if (target.type !== "test-run") return input.evidence;
  return {
    ...input.evidence,
    testRuns: input.evidence.testRuns.filter((testRun) => testRun.id === target.id),
    evidenceRecords: input.evidence.evidenceRecords.filter(
      (record) => record.testRunId === target.id,
    ),
  };
}

function draft(
  input: QualityAssessmentInput,
  verdict: AssessmentVerdict,
  summary: string,
  reasonCodes: string[],
): QualityAssessmentDraft {
  return {
    verdict,
    summary,
    reasonCodes,
    evidenceIds: evidenceIdsForTarget(input),
    source: "deterministic",
  };
}

export class RuleBasedQualityAssessmentProvider implements QualityAssessmentProvider {
  async assess(input: QualityAssessmentInput): Promise<QualityAssessmentDraft> {
    const qualityInvalid =
      !validateQualitySnapshot(input.quality).valid || input.evidenceDiagnostics.length > 0;
    const integrityFailed =
      input.evidenceIntegrity.some((item) => integrityFailureCodes.has(item.code)) ||
      input.evidenceDiagnostics.some((item) => integrityFailureCodes.has(item.code));
    const evidenceValid = validateEvidenceSnapshot(input.evidence).valid;

    if (!evidenceValid || qualityInvalid || integrityFailed) {
      const reasonCodes: string[] = [];
      if (!evidenceValid || qualityInvalid) reasonCodes.push("QUALITY_DATA_INVALID");
      if (integrityFailed) reasonCodes.push("EVIDENCE_INTEGRITY_FAILED");
      return draft(
        input,
        "insufficient-evidence",
        "Quality data or evidence integrity is insufficient for a quality decision.",
        reasonCodes,
      );
    }

    const evidence = evidenceForTarget(input);
    if (evidence.testRuns.length === 0 || evidence.evidenceRecords.length === 0) {
      return draft(input, "insufficient-evidence", "No execution evidence is available.", [
        "EVIDENCE_MISSING",
      ]);
    }

    if (
      evidence.testRuns.some(
        (testRun) =>
          testRun.status === "error" || testRun.results.some((result) => result.status === "error"),
      )
    ) {
      return draft(input, "fail", "At least one test run reported an error.", ["TEST_RUN_ERROR"]);
    }

    if (
      evidence.testRuns.some(
        (testRun) =>
          testRun.status === "failed" ||
          testRun.results.some((result) => result.status === "failed"),
      )
    ) {
      return draft(input, "fail", "At least one test run failed.", ["TEST_RUN_FAILED"]);
    }

    if (
      evidence.testRuns.some(
        (testRun) =>
          testRun.status === "incomplete" ||
          testRun.results.length === 0 ||
          testRun.results.some(
            (result) => result.status === "unknown" || result.status === "skipped",
          ),
      )
    ) {
      return draft(input, "insufficient-evidence", "Execution evidence is incomplete.", [
        "TEST_RUN_INCOMPLETE",
      ]);
    }

    const allResultsPassed = evidence.testRuns.every(
      (testRun) =>
        testRun.status === "passed" &&
        testRun.results.every((result) => result.status === "passed"),
    );
    if (!allResultsPassed) {
      return draft(input, "insufficient-evidence", "Execution evidence is incomplete.", [
        "TEST_RUN_INCOMPLETE",
      ]);
    }

    if (evidence.evidenceRecords.some((record) => record.provenance.trust === "unverified")) {
      return draft(input, "warn", "Execution evidence passed but remains unverified.", [
        "EVIDENCE_UNVERIFIED",
      ]);
    }

    return draft(input, "pass", "Trusted execution evidence passed.", ["EVIDENCE_VERIFIED"]);
  }
}
