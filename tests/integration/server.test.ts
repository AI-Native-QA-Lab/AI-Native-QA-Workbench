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
});
