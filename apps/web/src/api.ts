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

export interface WorkbenchApi {
  getProject(): Promise<{ project: ProjectView }>;
  getQuality(): Promise<{ quality: QualityView }>;
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
