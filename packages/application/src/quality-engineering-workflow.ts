import { randomUUID } from "node:crypto";

import { type QualityAssessmentProvider } from "./quality-assessment.js";
import { createQualityAssessment, createQualityGate } from "./quality-gate.js";
import {
  validateDomainEvent,
  type Diagnostic,
  type DomainEvent,
  type QualityGateKind,
  type QualityTarget,
} from "@ai-native-qa-workbench/domain";
import type {
  EvidenceArtifactStore,
  EvidenceStore,
  ProjectStore,
  QualityEngineeringStore,
  StoreDiagnostic,
} from "@ai-native-qa-workbench/project-store";
import type {
  RuntimeStore,
  RuntimeWorkflowRun,
  RuntimeWorkflowStep,
} from "@ai-native-qa-workbench/runtime-store";

export interface QualityEngineeringWorkflow {
  dispatch(event: DomainEvent): Promise<WorkflowDispatchResult>;
  processPending(input: { projectRoot: string }): Promise<readonly WorkflowDispatchResult[]>;
}

export interface QualityEngineeringWorkflowDependencies {
  projectStore: ProjectStore;
  evidenceStore: EvidenceStore & EvidenceArtifactStore;
  qualityEngineeringStore: QualityEngineeringStore;
  runtimeStore: RuntimeStore;
  assessmentProvider: QualityAssessmentProvider;
  clock?: () => string;
  idFactory?: () => string;
}

export interface WorkflowDispatchResult {
  eventId: string;
  status: "processed" | "failed";
  processed: boolean;
  workflowRunId?: string;
  assessmentId?: string;
  gateId?: string;
  diagnostics: readonly (Diagnostic | StoreDiagnostic)[];
}

const WORKFLOW_KIND = "quality-engineering";
const TRIGGER_EVENT_TYPES = new Set<DomainEvent["type"]>([
  "quality.assessment.requested",
  "quality.proposal.applied",
  "evidence.imported",
]);

interface TriggerContext {
  projectRoot: string;
  target: QualityTarget;
  gateKind: QualityGateKind;
}

class WorkflowFailure extends Error {
  constructor(readonly diagnostics: readonly StoreDiagnostic[]) {
    super(diagnostics.map((item) => item.message).join("; ") || "Quality workflow failed.");
    this.name = "WorkflowFailure";
  }
}

function diagnostic(code: StoreDiagnostic["code"], path: string, message: string): StoreDiagnostic {
  return { code, path, message, severity: "error" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSha256Revision(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isKebabCaseId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function projectRootFromEvent(event: DomainEvent): string | undefined {
  if (!isRecord(event.payload)) return undefined;
  const projectRoot = event.payload.projectRoot;
  return typeof projectRoot === "string" && projectRoot.length > 0 ? projectRoot : undefined;
}

function targetFromEvent(event: DomainEvent): TriggerContext {
  const projectRoot = projectRootFromEvent(event);
  if (!projectRoot) {
    throw new WorkflowFailure([
      diagnostic(
        "DOMAIN_EVENT_PAYLOAD_INVALID",
        "payload.projectRoot",
        "Workflow trigger payload must contain a projectRoot.",
      ),
    ]);
  }
  if (!isRecord(event.payload)) {
    throw new WorkflowFailure([
      diagnostic(
        "DOMAIN_EVENT_PAYLOAD_INVALID",
        "payload",
        "Workflow trigger payload must be a mapping.",
      ),
    ]);
  }

  if (event.type === "quality.assessment.requested") {
    const target = event.payload.target;
    const gateKind = event.payload.gateKind;
    if (!isQualityTarget(target)) {
      throw new WorkflowFailure([
        diagnostic(
          "DOMAIN_EVENT_PAYLOAD_INVALID",
          "payload.target",
          "Assessment target is invalid.",
        ),
      ]);
    }
    if (gateKind !== "requirement-readiness" && gateKind !== "release-readiness") {
      throw new WorkflowFailure([
        diagnostic("DOMAIN_EVENT_PAYLOAD_INVALID", "payload.gateKind", "Gate kind is invalid."),
      ]);
    }
    return { projectRoot, target, gateKind };
  }

  if (event.type === "quality.proposal.applied") {
    if (!isSha256Revision(event.payload.qualityRevision)) {
      throw new WorkflowFailure([
        diagnostic(
          "DOMAIN_EVENT_PAYLOAD_INVALID",
          "payload.qualityRevision",
          "Proposal event qualityRevision must be a lowercase SHA-256 revision.",
        ),
      ]);
    }
    const requirementIds = event.payload.requirementIds;
    if (
      !Array.isArray(requirementIds) ||
      requirementIds.length !== 1 ||
      requirementIds.some((id) => typeof id !== "string" || id.length === 0)
    ) {
      throw new WorkflowFailure([
        diagnostic(
          "DOMAIN_EVENT_PAYLOAD_INVALID",
          "payload.requirementIds",
          "Proposal event requirementIds must contain exactly one non-empty string.",
        ),
      ]);
    }
    return {
      projectRoot,
      target: { type: "requirement", id: requirementIds[0]! },
      gateKind: "requirement-readiness",
    };
  }

  const testRunId = event.payload.testRunId;
  if (!isKebabCaseId(testRunId)) {
    throw new WorkflowFailure([
      diagnostic(
        "DOMAIN_EVENT_PAYLOAD_INVALID",
        "payload.testRunId",
        "Evidence event testRunId is required.",
      ),
    ]);
  }
  if (!isSha256Revision(event.payload.evidenceRevision)) {
    throw new WorkflowFailure([
      diagnostic(
        "DOMAIN_EVENT_PAYLOAD_INVALID",
        "payload.evidenceRevision",
        "Evidence event evidenceRevision must be a lowercase SHA-256 revision.",
      ),
    ]);
  }
  if (!isKebabCaseId(event.payload.evidenceId)) {
    throw new WorkflowFailure([
      diagnostic(
        "DOMAIN_EVENT_PAYLOAD_INVALID",
        "payload.evidenceId",
        "Evidence event evidenceId must use kebab-case.",
      ),
    ]);
  }
  return {
    projectRoot,
    target: { type: "test-run", id: testRunId },
    gateKind: "requirement-readiness",
  };
}

function isQualityTarget(value: unknown): value is QualityTarget {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  if (value.type === "project") return Object.keys(value).length === 1;
  return (value.type === "requirement" || value.type === "test-run") && isKebabCaseId(value.id);
}

function stepPayload(step: RuntimeWorkflowStep | undefined): Record<string, unknown> | undefined {
  return isRecord(step?.payload) ? step.payload : undefined;
}

function valueFromStep(step: RuntimeWorkflowStep | undefined, key: string): string | undefined {
  const value = stepPayload(step)?.[key];
  return typeof value === "string" ? value : undefined;
}

function completedResult(
  eventId: string,
  workflowRun: RuntimeWorkflowRun,
  steps: readonly RuntimeWorkflowStep[],
): WorkflowDispatchResult {
  const assessmentId = valueFromStep(
    steps.find((step) => step.key === "assessment-created"),
    "assessmentId",
  );
  const gateId = valueFromStep(
    steps.find((step) => step.key === "gate-evaluated"),
    "gateId",
  );
  return {
    eventId,
    status: "processed",
    processed: true,
    workflowRunId: workflowRun.id,
    ...(assessmentId ? { assessmentId } : {}),
    ...(gateId ? { gateId } : {}),
    diagnostics: [],
  };
}

export class SqliteQualityEngineeringWorkflow implements QualityEngineeringWorkflow {
  private readonly projectStore: ProjectStore;
  private readonly evidenceStore: EvidenceStore & EvidenceArtifactStore;
  private readonly qualityEngineeringStore: QualityEngineeringStore;
  private readonly runtimeStore: RuntimeStore;
  private readonly assessmentProvider: QualityAssessmentProvider;
  private readonly clock: () => string;
  private readonly idFactory: () => string;

  constructor(dependencies: QualityEngineeringWorkflowDependencies) {
    this.projectStore = dependencies.projectStore;
    this.evidenceStore = dependencies.evidenceStore;
    this.qualityEngineeringStore = dependencies.qualityEngineeringStore;
    this.runtimeStore = dependencies.runtimeStore;
    this.assessmentProvider = dependencies.assessmentProvider;
    this.clock = dependencies.clock ?? (() => new Date().toISOString());
    this.idFactory = dependencies.idFactory ?? randomUUID;
  }

  async dispatch(event: DomainEvent): Promise<WorkflowDispatchResult> {
    const eventValidation = validateDomainEvent(event);
    if (!eventValidation.valid) {
      return {
        eventId: event.id,
        status: "failed",
        processed: false,
        diagnostics: eventValidation.diagnostics,
      };
    }

    if (!TRIGGER_EVENT_TYPES.has(event.type)) {
      const projectRoot = projectRootFromEvent(event);
      if (!projectRoot) {
        return {
          eventId: event.id,
          status: "failed",
          processed: false,
          diagnostics: [
            diagnostic(
              "DOMAIN_EVENT_PAYLOAD_INVALID",
              "payload.projectRoot",
              "Non-trigger event payload must contain a projectRoot for runtime persistence.",
            ),
          ],
        };
      }
      this.runtimeStore.appendDomainEvent(event, projectRoot);
      this.runtimeStore.markDomainEventProcessed(event.id, this.clock());
      return { eventId: event.id, status: "processed", processed: true, diagnostics: [] };
    }

    let context: TriggerContext;
    try {
      context = targetFromEvent(event);
    } catch (error) {
      const diagnostics =
        error instanceof WorkflowFailure
          ? error.diagnostics
          : [diagnostic("QUALITY_ENGINEERING_WORKFLOW_FAILED", "event", String(error))];
      return { eventId: event.id, status: "failed", processed: false, diagnostics };
    }

    this.runtimeStore.appendDomainEvent(event, context.projectRoot);

    let workflowRun = this.runtimeStore.findWorkflowRun({
      triggerEventId: event.id,
      kind: WORKFLOW_KIND,
    });
    if (workflowRun?.status === "completed") {
      return completedResult(
        event.id,
        workflowRun,
        this.runtimeStore.listWorkflowSteps(workflowRun.id),
      );
    }

    let runId = workflowRun?.runId;
    let workflowRunId = workflowRun?.id;
    try {
      if (!workflowRun || !runId || !workflowRunId) {
        const sessionId = this.runtimeStore.createSession({
          projectRoot: context.projectRoot,
          uiLocale: "en",
        });
        runId = this.runtimeStore.appendRun({ sessionId, kind: WORKFLOW_KIND, status: "running" });
        workflowRunId = this.runtimeStore.appendWorkflowRun({
          runId,
          kind: WORKFLOW_KIND,
          workflowKind: WORKFLOW_KIND,
          triggerEventId: event.id,
          status: "running",
        });
        workflowRun = this.runtimeStore.findWorkflowRun({
          triggerEventId: event.id,
          kind: WORKFLOW_KIND,
        });
        runId = workflowRun?.runId ?? runId;
      } else {
        this.runtimeStore.updateWorkflowRun(workflowRunId, { status: "running" });
      }

      const project = await this.projectStore.validateProject(context.projectRoot);
      const quality = await this.projectStore.validateQuality(context.projectRoot);
      const evidence = await this.evidenceStore.validateEvidence(context.projectRoot);
      const integrity = await this.evidenceStore.verifyEvidence(context.projectRoot);
      const qualityEngineering = await this.qualityEngineeringStore.validateQualityEngineering(
        context.projectRoot,
      );
      const diagnostics = [
        ...project.diagnostics,
        ...quality.diagnostics,
        ...evidence.diagnostics,
        ...integrity.diagnostics,
        ...qualityEngineering.diagnostics,
      ];
      if (
        !project.valid ||
        !quality.valid ||
        !quality.projectQuality ||
        !evidence.valid ||
        !evidence.evidence ||
        !integrity.valid ||
        !qualityEngineering.valid ||
        !qualityEngineering.qualityEngineering
      ) {
        throw new WorkflowFailure(
          diagnostics.length > 0
            ? diagnostics
            : [
                diagnostic(
                  "QUALITY_ENGINEERING_WORKFLOW_FAILED",
                  "project",
                  "Workflow input validation failed.",
                ),
              ],
        );
      }
      this.runtimeStore.appendWorkflowStep({
        workflowRunId: workflowRunId!,
        key: "load-and-validate",
        status: "completed",
        payload: {
          qualityRevision: quality.revision ?? null,
          evidenceRevision: evidence.revision,
          qualityEngineeringRevision: qualityEngineering.revision,
        },
      });

      const draft = await this.assessmentProvider.assess({
        target: context.target,
        quality: quality.projectQuality,
        evidence: evidence.evidence,
        evidenceDiagnostics: evidence.diagnostics,
        evidenceIntegrity: integrity.diagnostics,
      });
      const previousSteps = this.runtimeStore.listWorkflowSteps(workflowRunId!);
      const plannedStep = previousSteps.find((step) => step.key === "artifacts-planned");
      const assessmentId =
        valueFromStep(plannedStep, "assessmentId") ??
        valueFromStep(
          previousSteps.find((step) => step.key === "assessment-created"),
          "assessmentId",
        ) ??
        this.idFactory();
      const gateId =
        valueFromStep(plannedStep, "gateId") ??
        valueFromStep(
          previousSteps.find((step) => step.key === "gate-evaluated"),
          "gateId",
        ) ??
        this.idFactory();
      if (!plannedStep) {
        this.runtimeStore.appendWorkflowStep({
          workflowRunId: workflowRunId!,
          key: "artifacts-planned",
          status: "completed",
          payload: { assessmentId, gateId },
        });
      }
      const assessment = createQualityAssessment({
        id: assessmentId,
        target: context.target,
        draft,
        basedOnRevision: quality.revision ?? null,
        createdAt: this.clock(),
      });
      const gate = createQualityGate({
        id: gateId,
        kind: context.gateKind,
        target: context.target,
        assessment,
        evaluatedAt: this.clock(),
      });
      const next = qualityEngineering.qualityEngineering;
      const hasAssessment = next.assessments.some((item) => item.id === assessment.id);
      const hasGate = next.gates.some((item) => item.id === gate.id);
      if (!hasAssessment || !hasGate) {
        const write = await this.qualityEngineeringStore.writeQualityEngineering(
          context.projectRoot,
          {
            ...next,
            assessments: hasAssessment ? next.assessments : [...next.assessments, assessment],
            gates: hasGate ? next.gates : [...next.gates, gate],
          },
          qualityEngineering.revision,
        );
        if (!write.written) throw new WorkflowFailure(write.diagnostics);
      }
      this.runtimeStore.appendWorkflowStep({
        workflowRunId: workflowRunId!,
        key: "assessment-created",
        status: "completed",
        payload: { assessmentId: assessment.id, verdict: assessment.verdict },
      });
      this.runtimeStore.appendWorkflowStep({
        workflowRunId: workflowRunId!,
        key: "gate-evaluated",
        status: "completed",
        payload: { gateId: gate.id, assessmentId: assessment.id, outcome: gate.outcome },
      });
      this.appendAuditEvent(context.projectRoot, {
        id: `event-quality-assessment-created-${assessment.id}`,
        schemaVersion: "0.3",
        type: "quality.assessment.created",
        aggregateType: "assessment",
        aggregateId: assessment.id,
        occurredAt: assessment.createdAt,
        source: "workflow",
        payload: {
          projectRoot: context.projectRoot,
          assessmentId: assessment.id,
          target: assessment.target,
          verdict: assessment.verdict,
        },
      });
      this.appendAuditEvent(context.projectRoot, {
        id: `event-quality-gate-evaluated-${gate.id}`,
        schemaVersion: "0.3",
        type: "quality.gate.evaluated",
        aggregateType: "gate",
        aggregateId: gate.id,
        occurredAt: gate.evaluatedAt,
        source: "workflow",
        payload: {
          projectRoot: context.projectRoot,
          gateId: gate.id,
          assessmentId: gate.assessmentId,
          outcome: gate.outcome,
        },
      });
      this.runtimeStore.markDomainEventProcessed(event.id, this.clock());
      this.runtimeStore.updateWorkflowRun(workflowRunId!, {
        status: "completed",
        completedAt: this.clock(),
      });
      return {
        eventId: event.id,
        status: "processed",
        processed: true,
        workflowRunId,
        assessmentId: assessment.id,
        gateId: gate.id,
        diagnostics: [],
      };
    } catch (error) {
      const diagnostics =
        error instanceof WorkflowFailure
          ? error.diagnostics
          : [
              diagnostic(
                "QUALITY_ENGINEERING_WORKFLOW_FAILED",
                "workflow",
                error instanceof Error ? error.message : String(error),
              ),
            ];
      this.runtimeStore.markDomainEventFailed(
        event.id,
        diagnostics.map((item) => item.message).join("; "),
        this.clock(),
      );
      if (workflowRunId) {
        this.runtimeStore.appendWorkflowStep({
          workflowRunId,
          key: "failed",
          status: "failed",
          payload: { error: diagnostics.map((item) => item.message).join("; ") },
        });
        this.runtimeStore.updateWorkflowRun(workflowRunId, {
          status: "failed",
          error: diagnostics.map((item) => item.message).join("; "),
        });
      }
      return {
        eventId: event.id,
        status: "failed",
        processed: false,
        ...(workflowRunId ? { workflowRunId } : {}),
        diagnostics,
      };
    }
  }

  async processPending(input: { projectRoot: string }): Promise<readonly WorkflowDispatchResult[]> {
    const pending = this.runtimeStore.listPendingDomainEvents(input.projectRoot);
    const results: WorkflowDispatchResult[] = [];
    for (const record of pending) results.push(await this.dispatch(record.event));
    return results;
  }

  private appendAuditEvent(projectRoot: string, event: DomainEvent): void {
    if (this.runtimeStore.getDomainEvent(event.id)) return;
    this.runtimeStore.appendDomainEvent(event, projectRoot);
    this.runtimeStore.markDomainEventProcessed(event.id, this.clock());
  }
}
