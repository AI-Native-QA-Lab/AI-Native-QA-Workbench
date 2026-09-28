import type {
  AssessmentVerdict,
  DomainEventType,
  HumanDecision,
  HumanDecisionType,
  QualityEngineeringSnapshot,
  QualityGateOutcome,
  QualityTarget,
  ResolvedGateStatus,
} from "@ai-native-qa-workbench/domain";

export interface ProjectView {
  id: string;
  name: string;
  description: string;
}

export interface QualityView {
  requirements: Array<Record<string, unknown>>;
  acceptanceCriteria: Array<Record<string, unknown>>;
  qualityRisks: Array<Record<string, unknown>>;
  testObligations: Array<Record<string, unknown>>;
  testCases: Array<Record<string, unknown>>;
  traceLinks: Array<Record<string, unknown>>;
}

export interface ProposalView {
  id: string;
  status: string;
  operations: unknown[];
}

export interface DecisionView {
  applied: boolean;
  proposal: ProposalView;
  phase?: string;
}

export type QualityWorkflowStatus = "pending" | "running" | "completed" | "failed";

export interface QualityWorkflowStatusView {
  eventId: string;
  eventType: DomainEventType;
  status: QualityWorkflowStatus;
  workflowRunId?: string;
  error?: string;
  receivedAt: string;
}

export interface QualityEngineeringView {
  valid: boolean;
  qualityEngineering?: QualityEngineeringSnapshot;
  revision: string | null;
  resolvedGateStatuses: Record<string, ResolvedGateStatus>;
  workflowStatuses: QualityWorkflowStatusView[];
  diagnostics: Array<Record<string, unknown>>;
}

export interface QualityEvaluationView {
  eventId: string;
  status: "processed" | "failed";
  processed: boolean;
  workflowRunId?: string;
  assessmentId?: string;
  gateId?: string;
  diagnostics: Array<Record<string, unknown>>;
}

export interface HumanDecisionView {
  written: boolean;
  decision?: HumanDecision;
  qualityEngineering?: QualityEngineeringSnapshot;
  resolvedGateStatus?: ResolvedGateStatus;
  revision?: string;
  diagnostics: Array<Record<string, unknown>>;
}

export interface QualityAssessmentView {
  id: string;
  verdict: AssessmentVerdict;
  summary: string;
  reasonCodes: string[];
  evidenceIds: string[];
}

export interface QualityGateView {
  id: string;
  outcome: QualityGateOutcome;
  target: QualityTarget;
  assessmentId: string;
}

export interface WorkbenchApi {
  getProject(): Promise<{ project: ProjectView }>;
  getQuality(): Promise<{ quality: QualityView }>;
  getQualityEngineering(): Promise<QualityEngineeringView>;
  evaluateQuality(input: { target: QualityTarget }): Promise<QualityEvaluationView>;
  processQualityEvents(): Promise<QualityEvaluationView[]>;
  decideQualityGate(
    gateId: string,
    input: {
      decision: HumanDecisionType;
      reviewer: string;
      rationale: string;
      expectedRevision?: string | null;
    },
  ): Promise<HumanDecisionView>;
  analyze(input: { requirementId: string; outputLocale: "en" | "zh-CN" }): Promise<{
    proposal: ProposalView;
  }>;
  decide(
    id: string,
    input: { reviewer: string; decision: "approve" | "reject" },
  ): Promise<DecisionView>;
}

async function request<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed with HTTP ${response.status}`);
  return body;
}

export function createApiClient(baseUrl = ""): WorkbenchApi {
  return {
    getProject: () => request(`${baseUrl}`, "/api/project"),
    getQuality: () => request(`${baseUrl}`, "/api/quality"),
    getQualityEngineering: () => request(`${baseUrl}`, "/api/quality-engineering"),
    evaluateQuality: (input) =>
      request(`${baseUrl}`, "/api/quality/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      }),
    processQualityEvents: () =>
      request(`${baseUrl}`, "/api/quality/process", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    decideQualityGate: (gateId, input) =>
      request(`${baseUrl}`, `/api/quality/gates/${encodeURIComponent(gateId)}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      }),
    analyze: (input) =>
      request(`${baseUrl}`, "/api/analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      }),
    decide: (id, input) =>
      request(`${baseUrl}`, `/api/proposals/${encodeURIComponent(id)}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      }),
  };
}
