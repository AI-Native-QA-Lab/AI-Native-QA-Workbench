import { randomUUID } from "node:crypto";

import {
  resolveQualityGateStatus,
  type HumanDecision,
  type HumanDecisionType,
  type QualityEngineeringSnapshot,
  type ResolvedGateStatus,
} from "@ai-native-qa-workbench/domain";
import type {
  EvidenceStore,
  ProjectStore,
  QualityEngineeringStore,
  StoreDiagnostic,
} from "@ai-native-qa-workbench/project-store";

import type { DomainEventPublisher } from "./domain-event-publisher.js";

export interface HumanDecisionInput {
  rootDirectory: string;
  gateId: string;
  decision: HumanDecisionType;
  reviewer: string;
  rationale: string;
  expectedRevision: string | null;
}

export interface HumanDecisionResult {
  written: boolean;
  decision?: HumanDecision;
  qualityEngineering?: QualityEngineeringSnapshot;
  resolvedGateStatus?: ResolvedGateStatus;
  revision?: string;
  diagnostics: readonly StoreDiagnostic[];
}

export interface HumanDecisionService {
  record(input: HumanDecisionInput): Promise<HumanDecisionResult>;
}

export interface HumanDecisionServiceDependencies {
  projectStore: ProjectStore;
  evidenceStore: EvidenceStore;
  qualityEngineeringStore: QualityEngineeringStore;
  publisher: DomainEventPublisher;
  clock?: () => string;
  idFactory?: () => string;
}

const decisionTypes: readonly HumanDecisionType[] = ["approve", "reject", "waive"];

function diagnostic(code: StoreDiagnostic["code"], path: string, message: string): StoreDiagnostic {
  return { code, path, message, severity: "error" };
}

function inputDiagnostics(input: HumanDecisionInput): readonly StoreDiagnostic[] {
  const diagnostics: StoreDiagnostic[] = [];
  if (typeof input.reviewer !== "string" || input.reviewer.trim().length === 0) {
    diagnostics.push(
      diagnostic("QUALITY_ENGINEERING_REVIEWER_EMPTY", "reviewer", "Reviewer must not be empty."),
    );
  }
  if (typeof input.rationale !== "string" || input.rationale.trim().length === 0) {
    diagnostics.push(
      diagnostic(
        "QUALITY_ENGINEERING_RATIONALE_EMPTY",
        "rationale",
        "Rationale must not be empty.",
      ),
    );
  }
  if (!decisionTypes.includes(input.decision)) {
    diagnostics.push(
      diagnostic("QUALITY_ENGINEERING_DECISION_INVALID", "decision", "Decision type is invalid."),
    );
  }
  return diagnostics;
}

function deduplicateDiagnostics(
  diagnostics: readonly StoreDiagnostic[],
): readonly StoreDiagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((item) => {
    const key = `${item.code}\u0000${item.path}\u0000${item.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export class FileHumanDecisionService implements HumanDecisionService {
  private readonly projectStore: ProjectStore;
  private readonly evidenceStore: EvidenceStore;
  private readonly qualityEngineeringStore: QualityEngineeringStore;
  private readonly publisher: DomainEventPublisher;
  private readonly clock: () => string;
  private readonly idFactory: () => string;

  constructor(dependencies: HumanDecisionServiceDependencies) {
    this.projectStore = dependencies.projectStore;
    this.evidenceStore = dependencies.evidenceStore;
    this.qualityEngineeringStore = dependencies.qualityEngineeringStore;
    this.publisher = dependencies.publisher;
    this.clock = dependencies.clock ?? (() => new Date().toISOString());
    this.idFactory = dependencies.idFactory ?? randomUUID;
  }

  async record(input: HumanDecisionInput): Promise<HumanDecisionResult> {
    const initialDiagnostics = inputDiagnostics(input);
    if (initialDiagnostics.length > 0) {
      return { written: false, diagnostics: initialDiagnostics };
    }

    const [quality, evidence, qualityEngineering] = await Promise.all([
      this.projectStore.validateQuality(input.rootDirectory),
      this.evidenceStore.validateEvidence(input.rootDirectory),
      this.qualityEngineeringStore.validateQualityEngineering(input.rootDirectory),
    ]);
    const validationDiagnostics = deduplicateDiagnostics([
      ...quality.diagnostics,
      ...evidence.diagnostics,
      ...qualityEngineering.diagnostics,
    ]);
    if (
      !quality.valid ||
      !quality.projectQuality ||
      !evidence.valid ||
      !evidence.evidence ||
      !qualityEngineering.valid ||
      !qualityEngineering.qualityEngineering
    ) {
      return {
        written: false,
        diagnostics:
          validationDiagnostics.length > 0
            ? validationDiagnostics
            : [
                diagnostic(
                  "QUALITY_ENGINEERING_SNAPSHOT_INVALID",
                  ".ai-qa/quality-engineering.yaml",
                  "Current quality engineering snapshot is invalid.",
                ),
              ],
      };
    }

    if (input.expectedRevision !== qualityEngineering.revision) {
      return {
        written: false,
        diagnostics: [
          diagnostic(
            "QUALITY_ENGINEERING_REVISION_CONFLICT",
            ".ai-qa/quality-engineering.yaml",
            "Quality engineering file revision does not match the expected revision.",
          ),
        ],
      };
    }

    const current = qualityEngineering.qualityEngineering;
    const gate = current.gates.find((item) => item.id === input.gateId);
    if (!gate) {
      return {
        written: false,
        diagnostics: [
          diagnostic(
            "QUALITY_ENGINEERING_GATE_NOT_FOUND",
            "gateId",
            `Referenced QualityGate does not exist: ${input.gateId}`,
          ),
        ],
      };
    }

    const existing = current.humanDecisions.find(
      (item) =>
        item.gateId === gate.id &&
        item.decision === input.decision &&
        item.reviewer === input.reviewer &&
        item.rationale === input.rationale,
    );
    if (existing) {
      const result: HumanDecisionResult = {
        written: true,
        decision: existing,
        qualityEngineering: current,
        resolvedGateStatus: resolveQualityGateStatus(gate, current.humanDecisions),
        ...(qualityEngineering.revision ? { revision: qualityEngineering.revision } : {}),
        diagnostics: [],
      };
      return {
        ...result,
        diagnostics: await this.publishDecisionEvent(input.rootDirectory, gate.id, existing),
      };
    }

    const decision: HumanDecision = {
      id: this.idFactory(),
      gateId: gate.id,
      decision: input.decision,
      reviewer: input.reviewer,
      rationale: input.rationale,
      decidedAt: this.clock(),
    };
    const next: QualityEngineeringSnapshot = {
      ...current,
      humanDecisions: [...current.humanDecisions, decision],
    };
    const write = await this.qualityEngineeringStore.writeQualityEngineering(
      input.rootDirectory,
      next,
      input.expectedRevision,
    );
    if (!write.written) return { written: false, diagnostics: write.diagnostics };

    const resolvedGateStatus = resolveQualityGateStatus(gate, next.humanDecisions);
    const result: HumanDecisionResult = {
      written: true,
      decision,
      qualityEngineering: next,
      resolvedGateStatus,
      ...(write.revision ? { revision: write.revision } : {}),
      diagnostics: [],
    };
    return {
      ...result,
      diagnostics: await this.publishDecisionEvent(input.rootDirectory, gate.id, decision),
    };
  }

  private async publishDecisionEvent(
    rootDirectory: string,
    gateId: string,
    decision: HumanDecision,
  ): Promise<readonly StoreDiagnostic[]> {
    try {
      await this.publisher.publish({
        id: `event-quality-human-decision-recorded-${decision.id}`,
        schemaVersion: "0.3",
        type: "quality.human-decision.recorded",
        aggregateType: "gate",
        aggregateId: gateId,
        occurredAt: decision.decidedAt,
        source: "human",
        payload: {
          projectRoot: rootDirectory,
          gateId,
          decisionId: decision.id,
          decision: decision.decision,
          reviewer: decision.reviewer,
        },
      });
      return [];
    } catch (error) {
      return [
        diagnostic(
          "QUALITY_ENGINEERING_WORKFLOW_FAILED",
          "event",
          error instanceof Error ? error.message : String(error),
        ),
      ];
    }
  }
}

export function createHumanDecisionService(
  dependencies: HumanDecisionServiceDependencies,
): HumanDecisionService {
  return new FileHumanDecisionService(dependencies);
}
