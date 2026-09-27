import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createMockRequirementAnalysisProvider } from "@ai-native-qa-workbench/application";
import { QUALITY_SCHEMA_VERSION, type QualitySnapshot } from "@ai-native-qa-workbench/domain";
import { FileProjectStore } from "@ai-native-qa-workbench/project-store";
import { buildServer } from "@ai-native-qa-workbench/server";

const temporaryDirectories: string[] = [];

async function createProject(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "qaw-server-"));
  temporaryDirectories.push(directory);
  const store = new FileProjectStore();
  await store.initProject({ rootDirectory: directory });
  const snapshot: QualitySnapshot = {
    schemaVersion: QUALITY_SCHEMA_VERSION,
    requirements: [{ id: "checkout", title: "Checkout", description: "Checkout flow" }],
    acceptanceCriteria: [],
    qualityRisks: [],
    testObligations: [],
    testCases: [],
    traceLinks: [],
  };
  await store.writeQuality(directory, snapshot);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("local Fastify server", () => {
  it("serves project/quality, creates a proposal, and applies a reviewed decision", async () => {
    const rootDirectory = await createProject();
    const server = await buildServer({
      rootDirectory,
      provider: createMockRequirementAnalysisProvider(),
    });

    const health = await server.inject({ method: "GET", url: "/health" });
    const project = await server.inject({ method: "GET", url: "/api/project" });
    const quality = await server.inject({ method: "GET", url: "/api/quality" });
    const analysis = await server.inject({
      method: "POST",
      url: "/api/analysis",
      payload: { requirementId: "checkout", outputLocale: "zh-CN" },
    });
    const proposal = analysis.json<{ proposal: { id: string } }>();
    const decision = await server.inject({
      method: "POST",
      url: `/api/proposals/${proposal.proposal.id}/decision`,
      payload: { reviewer: "nao", decision: "approve" },
    });

    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: "ok" });
    expect(project.statusCode).toBe(200);
    expect(project.json()).toMatchObject({ project: { id: expect.any(String) } });
    expect(quality.statusCode).toBe(200);
    expect(quality.json()).toMatchObject({ quality: { requirements: [{ id: "checkout" }] } });
    expect(analysis.statusCode).toBe(200);
    expect(analysis.json()).toMatchObject({ proposal: { status: "proposed" } });
    expect(decision.statusCode).toBe(200);
    expect(decision.json()).toMatchObject({
      applied: true,
      phase: "complete",
      completion: { complete: true },
    });

    await server.close();
  });

  it("rejects invalid locale and decision values at the HTTP boundary", async () => {
    const rootDirectory = await createProject();
    const server = await buildServer({
      rootDirectory,
      provider: createMockRequirementAnalysisProvider(),
    });

    const invalidLocale = await server.inject({
      method: "POST",
      url: "/api/analysis",
      payload: { requirementId: "checkout", outputLocale: "fr" },
    });
    expect(invalidLocale.statusCode).toBe(400);

    const analysis = await server.inject({
      method: "POST",
      url: "/api/analysis",
      payload: { requirementId: "checkout", outputLocale: "en" },
    });
    const proposal = analysis.json<{ proposal: { id: string } }>();
    const invalidDecision = await server.inject({
      method: "POST",
      url: `/api/proposals/${proposal.proposal.id}/decision`,
      payload: { reviewer: "nao", decision: "maybe", approvedOperationIndexes: [0] },
    });
    expect(invalidDecision.statusCode).toBe(400);

    await server.close();
  });

  it("serves v0.3 quality state, evaluates a target, and processes pending events", async () => {
    const rootDirectory = await createProject();
    const server = await buildServer({
      rootDirectory,
      provider: createMockRequirementAnalysisProvider(),
    });

    const empty = await server.inject({ method: "GET", url: "/api/quality-engineering" });
    const evaluated = await server.inject({
      method: "POST",
      url: "/api/quality/evaluate",
      payload: { target: { type: "project" } },
    });
    const current = await server.inject({ method: "GET", url: "/api/quality-engineering" });
    const processed = await server.inject({
      method: "POST",
      url: "/api/quality/process",
      payload: {},
    });

    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toMatchObject({
      valid: true,
      qualityEngineering: { assessments: [], gates: [], humanDecisions: [] },
    });
    expect(evaluated.statusCode).toBe(200);
    expect(evaluated.json()).toMatchObject({ status: "processed", processed: true });
    expect(current.statusCode).toBe(200);
    expect(current.json()).toMatchObject({
      qualityEngineering: {
        assessments: [expect.objectContaining({ verdict: "insufficient-evidence" })],
        gates: [expect.objectContaining({ outcome: "insufficient-evidence" })],
      },
      resolvedGateStatuses: expect.objectContaining({}),
    });
    expect(processed.statusCode).toBe(200);
    expect(processed.json()).toEqual([]);

    await server.close();
  });

  it("validates v0.3 evaluate and human decision request bodies", async () => {
    const rootDirectory = await createProject();
    const server = await buildServer({
      rootDirectory,
      provider: createMockRequirementAnalysisProvider(),
    });

    const invalidTarget = await server.inject({
      method: "POST",
      url: "/api/quality/evaluate",
      payload: { target: { type: "requirement", id: "missing" } },
    });
    const evaluated = await server.inject({
      method: "POST",
      url: "/api/quality/evaluate",
      payload: { target: { type: "project" } },
    });
    const state = await server.inject({ method: "GET", url: "/api/quality-engineering" });
    const gateId = state.json<{ qualityEngineering: { gates: Array<{ id: string }> } }>()
      .qualityEngineering.gates[0]?.id;
    expect(gateId).toBeTruthy();

    const missingRationale = await server.inject({
      method: "POST",
      url: `/api/quality/gates/${gateId}/decision`,
      payload: { reviewer: "alice", decision: "approve" },
    });
    const invalidDecision = await server.inject({
      method: "POST",
      url: `/api/quality/gates/${gateId}/decision`,
      payload: { reviewer: "alice", decision: "auto-approve", rationale: "reviewed" },
    });
    const decided = await server.inject({
      method: "POST",
      url: `/api/quality/gates/${gateId}/decision`,
      payload: {
        reviewer: "alice",
        decision: "approve",
        rationale: "I reviewed the current quality state.",
      },
    });
    const after = await server.inject({ method: "GET", url: "/api/quality-engineering" });

    expect(invalidTarget.statusCode).toBe(422);
    expect(invalidTarget.json()).toMatchObject({ diagnostics: expect.any(Array) });
    expect(evaluated.statusCode).toBe(200);
    expect(missingRationale.statusCode).toBe(400);
    expect(invalidDecision.statusCode).toBe(400);
    expect(decided.statusCode).toBe(200);
    expect(decided.json()).toMatchObject({ written: true, resolvedGateStatus: "approved" });
    expect(after.json()).toMatchObject({
      resolvedGateStatuses: { [gateId as string]: "approved" },
    });

    await server.close();
  });
});
