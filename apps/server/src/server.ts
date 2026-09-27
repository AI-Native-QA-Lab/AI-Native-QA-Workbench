import { join } from "node:path";

import Fastify, { type FastifyInstance } from "fastify";

import {
  FileHumanDecisionService,
  RuleBasedQualityAssessmentProvider,
  SqliteDomainEventPublisher,
  SqliteQualityEngineeringWorkflow,
  createMockRequirementAnalysisProvider,
  createModelRequirementAnalysisProvider,
  QualityTaskLoop,
  type ChangeProposal,
  type DomainEventPublisher,
  type HumanReview,
  type HumanDecisionService,
  type QualityEngineeringWorkflow,
  type RequirementAnalysisProvider,
} from "@ai-native-qa-workbench/application";
import {
  resolveQualityGateStatus,
  type DomainEvent,
  type HumanDecisionType,
  type QualityTarget,
} from "@ai-native-qa-workbench/domain";
import { OpenAICompatibleProvider } from "@ai-native-qa-workbench/model-providers";
import {
  FileEvidenceStore,
  FileProjectStore,
  FileQualityEngineeringStore,
  type EvidenceArtifactStore,
  type EvidenceStore,
  type ProjectStore,
  type QualityEngineeringStore,
  type StoreDiagnostic,
} from "@ai-native-qa-workbench/project-store";
import { SqliteRuntimeStore, type RuntimeStore } from "@ai-native-qa-workbench/runtime-store";

function isValidKebabCaseId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export interface ServerOptions {
  rootDirectory: string;
  store?: ProjectStore;
  evidenceStore?: EvidenceStore & EvidenceArtifactStore;
  qualityEngineeringStore?: QualityEngineeringStore;
  runtimeStore?: RuntimeStore;
  publisher?: DomainEventPublisher;
  workflow?: QualityEngineeringWorkflow;
  humanDecisionService?: HumanDecisionService;
  clock?: () => string;
  provider?: RequirementAnalysisProvider;
}

type AnalysisRequest = {
  requirementId: string;
  outputLocale?: "en" | "zh-CN";
};

type DecisionRequest = {
  reviewer: string;
  decision: HumanReview["decision"];
  approvedOperationIndexes?: number[];
};

type QualityEvaluateRequest = {
  target?: QualityTarget;
};

type QualityGateDecisionRequest = {
  reviewer: string;
  decision: HumanDecisionType;
  rationale: string;
  expectedRevision?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isAnalysisRequest(value: unknown): value is AnalysisRequest {
  if (!isRecord(value) || typeof value.requirementId !== "string") return false;
  if (value.requirementId.trim().length === 0) return false;
  return (
    value.outputLocale === undefined ||
    value.outputLocale === "en" ||
    value.outputLocale === "zh-CN"
  );
}

function isDecisionRequest(value: unknown): value is DecisionRequest {
  if (
    !isRecord(value) ||
    typeof value.reviewer !== "string" ||
    value.reviewer.trim().length === 0
  ) {
    return false;
  }
  if (value.decision !== "approve" && value.decision !== "reject" && value.decision !== "partial") {
    return false;
  }
  return (
    value.approvedOperationIndexes === undefined ||
    (Array.isArray(value.approvedOperationIndexes) &&
      value.approvedOperationIndexes.every((index) => Number.isInteger(index) && index >= 0))
  );
}

function isQualityTarget(value: unknown): value is QualityTarget {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  if (value.type === "project") return Object.keys(value).length === 1;
  return (
    (value.type === "requirement" || value.type === "test-run") &&
    Object.keys(value).every((key) => key === "type" || key === "id") &&
    typeof value.id === "string" &&
    isValidKebabCaseId(value.id)
  );
}

function isQualityEvaluateRequest(value: unknown): value is QualityEvaluateRequest {
  if (value === undefined || value === null) return true;
  if (!isRecord(value) || Object.keys(value).some((key) => key !== "target")) return false;
  return value.target === undefined || isQualityTarget(value.target);
}

function isQualityGateDecisionRequest(value: unknown): value is QualityGateDecisionRequest {
  if (!isRecord(value)) return false;
  const allowedKeys = new Set(["reviewer", "decision", "rationale", "expectedRevision"]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) return false;
  return (
    typeof value.reviewer === "string" &&
    value.reviewer.trim().length > 0 &&
    typeof value.rationale === "string" &&
    value.rationale.trim().length > 0 &&
    (value.decision === "approve" || value.decision === "reject" || value.decision === "waive") &&
    (value.expectedRevision === undefined ||
      value.expectedRevision === null ||
      (typeof value.expectedRevision === "string" && /^[a-f0-9]{64}$/.test(value.expectedRevision)))
  );
}

function diagnostic(code: StoreDiagnostic["code"], path: string, message: string): StoreDiagnostic {
  return { code, path, message, severity: "error" };
}

function qualityEngineeringResponse(
  result: Awaited<ReturnType<QualityEngineeringStore["validateQualityEngineering"]>>,
) {
  const snapshot = result.qualityEngineering;
  return {
    valid: result.valid,
    qualityEngineering: snapshot,
    revision: result.revision,
    resolvedGateStatuses: snapshot
      ? Object.fromEntries(
          snapshot.gates.map((gate) => [
            gate.id,
            resolveQualityGateStatus(gate, snapshot.humanDecisions),
          ]),
        )
      : {},
    diagnostics: result.diagnostics,
  };
}

function runtimeDatabasePath(rootDirectory: string): string {
  return join(rootDirectory, ".ai-qa", "runtime.db");
}

function targetReferenceDiagnostics(
  target: QualityTarget,
  quality: Awaited<ReturnType<ProjectStore["validateQuality"]>>,
  evidence: Awaited<ReturnType<EvidenceStore["validateEvidence"]>>,
): readonly StoreDiagnostic[] {
  if (!quality.valid || !quality.projectQuality) return quality.diagnostics;
  if (
    target.type === "requirement" &&
    !quality.projectQuality.requirements.some((item) => item.id === target.id)
  ) {
    return [
      diagnostic(
        "QUALITY_ENGINEERING_REQUIREMENT_NOT_FOUND",
        "target.id",
        `Referenced Requirement does not exist: ${target.id}`,
      ),
    ];
  }
  if (!evidence.valid || !evidence.evidence) return evidence.diagnostics;
  if (
    target.type === "test-run" &&
    !evidence.evidence.testRuns.some((item) => item.id === target.id)
  ) {
    return [
      diagnostic(
        "QUALITY_ENGINEERING_TEST_RUN_NOT_FOUND",
        "target.id",
        `Referenced TestRun does not exist: ${target.id}`,
      ),
    ];
  }
  return [];
}

export async function buildServer(options: ServerOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const store = options.store ?? new FileProjectStore();
  const evidenceStore = options.evidenceStore ?? new FileEvidenceStore();
  const qualityEngineeringStore =
    options.qualityEngineeringStore ?? new FileQualityEngineeringStore(store, evidenceStore);
  let runtimeStore = options.runtimeStore;
  let publisher = options.publisher;
  if (!options.workflow || !publisher) {
    runtimeStore ??= new SqliteRuntimeStore(runtimeDatabasePath(options.rootDirectory));
  }
  if (!publisher) {
    publisher = new SqliteDomainEventPublisher({ runtimeStore: runtimeStore! });
  }
  const loop = new QualityTaskLoop({
    store,
    provider: options.provider ?? providerFromEnvironment(),
    publisher,
  });
  const workflow =
    options.workflow ??
    new SqliteQualityEngineeringWorkflow({
      projectStore: store,
      evidenceStore,
      qualityEngineeringStore,
      runtimeStore: runtimeStore!,
      assessmentProvider: new RuleBasedQualityAssessmentProvider(),
      ...(options.clock ? { clock: options.clock } : {}),
    });
  const humanDecisionService =
    options.humanDecisionService ??
    new FileHumanDecisionService({
      projectStore: store,
      evidenceStore,
      qualityEngineeringStore,
      publisher,
      ...(options.clock ? { clock: options.clock } : {}),
    });
  const proposals = new Map<string, ChangeProposal>();

  app.addHook("onClose", async () => {
    runtimeStore?.close();
  });

  app.get("/health", async () => ({ status: "ok" }));

  app.get("/api/project", async (_request, reply) => {
    const result = await store.validateProject(options.rootDirectory);
    return reply.code(result.valid ? 200 : 422).send(result);
  });

  app.get("/api/quality", async (_request, reply) => {
    const result = await store.readQuality(options.rootDirectory);
    return reply.code(result.valid ? 200 : 422).send({
      valid: result.valid,
      quality: result.projectQuality,
      revision: result.revision,
      diagnostics: result.diagnostics,
    });
  });

  app.get("/api/quality-engineering", async (_request, reply) => {
    const result = await qualityEngineeringStore.validateQualityEngineering(options.rootDirectory);
    return reply.code(result.valid ? 200 : 422).send(qualityEngineeringResponse(result));
  });

  app.post<{ Body: unknown }>("/api/quality/evaluate", async (request, reply) => {
    if (!isQualityEvaluateRequest(request.body)) {
      return reply.code(400).send({ error: "Invalid quality evaluation request." });
    }
    const target = request.body?.target ?? { type: "project" };
    const [quality, evidence] = await Promise.all([
      store.validateQuality(options.rootDirectory),
      evidenceStore.validateEvidence(options.rootDirectory),
    ]);
    const targetDiagnostics = targetReferenceDiagnostics(target, quality, evidence);
    if (targetDiagnostics.length > 0) {
      return reply.code(422).send({ valid: false, diagnostics: targetDiagnostics });
    }
    const clock = options.clock ?? (() => new Date().toISOString());
    const event: DomainEvent = {
      id: `event-quality-assessment-requested-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      schemaVersion: "0.3",
      type: "quality.assessment.requested",
      aggregateType: "project",
      aggregateId: "project",
      occurredAt: clock(),
      source: "application",
      payload: {
        projectRoot: options.rootDirectory,
        target,
        gateKind: target.type === "project" ? "release-readiness" : "requirement-readiness",
      },
    };
    const result = await workflow.dispatch(event);
    return reply.code(result.processed ? 200 : 422).send(result);
  });

  app.post<{ Body: unknown }>("/api/quality/process", async (request, reply) => {
    if (
      request.body !== undefined &&
      (!isRecord(request.body) || Object.keys(request.body).length > 0)
    ) {
      return reply.code(400).send({ error: "Quality process does not accept request fields." });
    }
    const results = await workflow.processPending({ projectRoot: options.rootDirectory });
    return reply.code(results.every((result) => result.processed) ? 200 : 422).send(results);
  });

  app.post<{ Params: { id: string }; Body: unknown }>(
    "/api/quality/gates/:id/decision",
    async (request, reply) => {
      if (!isValidKebabCaseId(request.params.id) || !isQualityGateDecisionRequest(request.body)) {
        return reply.code(400).send({ error: "Invalid quality gate decision request." });
      }
      const current = await qualityEngineeringStore.readQualityEngineering(options.rootDirectory);
      const result = await humanDecisionService.record({
        rootDirectory: options.rootDirectory,
        gateId: request.params.id,
        decision: request.body.decision,
        reviewer: request.body.reviewer,
        rationale: request.body.rationale,
        expectedRevision:
          request.body.expectedRevision === undefined
            ? current.revision
            : request.body.expectedRevision,
      });
      return reply.code(result.written && result.diagnostics.length === 0 ? 200 : 422).send(result);
    },
  );

  app.post<{ Body: unknown }>("/api/analysis", async (request, reply) => {
    if (!isAnalysisRequest(request.body)) {
      return reply.code(400).send({ error: "Invalid analysis request." });
    }
    try {
      const result = await loop.propose({
        rootDirectory: options.rootDirectory,
        requirementId: request.body.requirementId,
        outputLocale: request.body.outputLocale ?? "en",
      });
      proposals.set(result.proposal.id, result.proposal);
      return reply.code(result.phase === "blocked" ? 422 : 200).send(result);
    } catch (error) {
      return reply
        .code(400)
        .send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post<{ Params: { id: string }; Body: unknown }>(
    "/api/proposals/:id/decision",
    async (request, reply) => {
      const proposal = proposals.get(request.params.id);
      if (!proposal) return reply.code(404).send({ error: "Proposal not found" });
      if (!isDecisionRequest(request.body)) {
        return reply.code(400).send({ error: "Invalid decision request." });
      }
      try {
        const result = await loop.decide({
          rootDirectory: options.rootDirectory,
          proposal,
          reviewer: request.body.reviewer,
          decision: request.body.decision,
          ...(request.body.approvedOperationIndexes
            ? { approvedOperationIndexes: request.body.approvedOperationIndexes }
            : {}),
        });
        proposals.set(result.proposal.id, result.proposal);
        return reply.code(result.phase === "blocked" ? 409 : 200).send(result);
      } catch (error) {
        return reply
          .code(400)
          .send({ error: error instanceof Error ? error.message : String(error) });
      }
    },
  );

  return app;
}

function providerFromEnvironment(): RequirementAnalysisProvider {
  const baseUrl = process.env.QAW_MODEL_BASE_URL;
  const model = process.env.QAW_MODEL;
  if (baseUrl && model) {
    return createModelRequirementAnalysisProvider(
      new OpenAICompatibleProvider({
        baseUrl,
        model,
        ...(process.env.QAW_MODEL_API_KEY ? { apiKey: process.env.QAW_MODEL_API_KEY } : {}),
      }),
    );
  }
  return createMockRequirementAnalysisProvider();
}
