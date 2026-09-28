import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createMockRequirementAnalysisProvider,
  QualityTaskLoop,
  type ChangeProposal,
} from "@ai-native-qa-workbench/application";
import {
  QUALITY_SCHEMA_VERSION,
  type DomainEvent,
  type QualitySnapshot,
} from "@ai-native-qa-workbench/domain";
import { FileProjectStore } from "@ai-native-qa-workbench/project-store";

const temporaryDirectories: string[] = [];

async function createProject(snapshot?: QualitySnapshot): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "qaw-task-loop-"));
  temporaryDirectories.push(directory);
  const store = new FileProjectStore();
  await store.initProject({ rootDirectory: directory });
  const projectQuality: QualitySnapshot = snapshot ?? {
    schemaVersion: QUALITY_SCHEMA_VERSION,
    requirements: [{ id: "checkout", title: "Checkout", description: "Checkout flow" }],
    acceptanceCriteria: [],
    qualityRisks: [],
    testObligations: [],
    testCases: [],
    traceLinks: [],
  };
  await store.writeQuality(directory, projectQuality);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("QualityTaskLoop", () => {
  it("does not complete at proposal time and completes only after review/apply/re-evaluate", async () => {
    const directory = await createProject();
    const loop = new QualityTaskLoop({
      store: new FileProjectStore(),
      provider: createMockRequirementAnalysisProvider(),
    });

    const proposed = await loop.propose({
      rootDirectory: directory,
      requirementId: "checkout",
      outputLocale: "zh-CN",
    });

    expect(proposed.phase).toBe("review");
    expect(proposed.completion.complete).toBe(false);
    expect(proposed.events.map(({ phase }) => phase)).toEqual([
      "context",
      "analyze",
      "propose",
      "validate",
      "review",
    ]);

    const completed = await loop.decide({
      rootDirectory: directory,
      proposal: proposed.proposal,
      reviewer: "nao",
      decision: "approve",
    });

    expect(completed.phase).toBe("complete");
    expect(completed.applied).toBe(true);
    expect(completed.completion).toMatchObject({ complete: true, requirementId: "checkout" });
    expect(completed.events.map(({ phase }) => phase)).toEqual([
      "review",
      "apply",
      "re-evaluate",
      "complete",
    ]);
  });

  it("keeps rejected review out of the completion state", async () => {
    const directory = await createProject();
    const loop = new QualityTaskLoop({
      store: new FileProjectStore(),
      provider: createMockRequirementAnalysisProvider(),
    });
    const proposed = await loop.propose({
      rootDirectory: directory,
      requirementId: "checkout",
      outputLocale: "en",
    });

    const rejected = await loop.decide({
      rootDirectory: directory,
      proposal: proposed.proposal,
      reviewer: "nao",
      decision: "reject",
    });

    expect(rejected.phase).toBe("review-rejected");
    expect(rejected.applied).toBe(false);
    expect(rejected.completion.complete).toBe(false);
  });

  it("returns an applied proposal and retries its event publication without applying twice", async () => {
    const directory = await createProject();
    let failOnce = true;
    const published: unknown[] = [];
    const loop = new QualityTaskLoop({
      store: new FileProjectStore(),
      provider: createMockRequirementAnalysisProvider(),
      publisher: {
        publish: async (event) => {
          if (failOnce) {
            failOnce = false;
            throw new Error("injected publication failure");
          }
          published.push(event);
        },
      },
    });
    const proposed = await loop.propose({
      rootDirectory: directory,
      requirementId: "checkout",
      outputLocale: "en",
    });

    const first = await loop.decide({
      rootDirectory: directory,
      proposal: proposed.proposal,
      reviewer: "nao",
      decision: "approve",
    });
    const second = await loop.decide({
      rootDirectory: directory,
      proposal: first.proposal,
      reviewer: "nao",
      decision: "approve",
    });

    expect(first).toMatchObject({ applied: true, proposal: { status: "applied" } });
    expect(first.diagnostics).toContainEqual(
      expect.objectContaining({ code: "QUALITY_ENGINEERING_WORKFLOW_FAILED" }),
    );
    expect(second).toMatchObject({ applied: true, phase: "complete", diagnostics: [] });
    expect(published).toHaveLength(1);
  });

  it("resolves indirect proposal targets and preserves every requirement for publication retry", async () => {
    const directory = await createProject({
      schemaVersion: QUALITY_SCHEMA_VERSION,
      requirements: [
        { id: "checkout", title: "Checkout", description: "Checkout flow" },
        { id: "login", title: "Login", description: "Login flow" },
      ],
      acceptanceCriteria: [],
      qualityRisks: [
        { id: "checkout-risk", requirementId: "checkout", statement: "Checkout risk" },
        { id: "login-risk", requirementId: "login", statement: "Login risk" },
      ],
      testObligations: [
        { id: "checkout-obligation", riskId: "checkout-risk", statement: "Checkout check" },
        { id: "login-obligation", riskId: "login-risk", statement: "Login check" },
      ],
      testCases: [
        {
          id: "checkout-case",
          obligationId: "checkout-obligation",
          title: "Checkout case",
          steps: "Complete checkout",
          expectedResult: "Checkout succeeds",
        },
        {
          id: "login-case",
          obligationId: "login-obligation",
          title: "Login case",
          steps: "Enter credentials",
          expectedResult: "Login succeeds",
        },
      ],
      traceLinks: [],
    });
    const store = new FileProjectStore();
    const current = await store.readQuality(directory);
    const proposal: ChangeProposal = {
      id: "proposal-update-test-cases",
      baseRevision: current.revision!,
      status: "proposed",
      operations: [
        {
          kind: "update",
          entityType: "testCase",
          id: "checkout-case",
          entity: {
            id: "checkout-case",
            obligationId: "checkout-obligation",
            title: "Checkout case revised",
            steps: "Complete checkout",
            expectedResult: "Checkout succeeds",
          },
        },
        {
          kind: "update",
          entityType: "testCase",
          id: "login-case",
          entity: {
            id: "login-case",
            obligationId: "login-obligation",
            title: "Login case revised",
            steps: "Enter credentials",
            expectedResult: "Login succeeds",
          },
        },
      ],
    };
    let failOnce = true;
    const published: DomainEvent[] = [];
    const loop = new QualityTaskLoop({
      store,
      provider: createMockRequirementAnalysisProvider(),
      publisher: {
        publish: async (event) => {
          if (failOnce) {
            failOnce = false;
            throw new Error("injected publication failure");
          }
          published.push(event);
        },
      },
    });

    const first = await loop.decide({
      rootDirectory: directory,
      proposal,
      reviewer: "nao",
      decision: "approve",
    });
    const second = await loop.decide({
      rootDirectory: directory,
      proposal: first.proposal,
      reviewer: "nao",
      decision: "approve",
    });

    expect(first.diagnostics).toContainEqual(
      expect.objectContaining({ code: "QUALITY_ENGINEERING_WORKFLOW_FAILED" }),
    );
    expect(second.diagnostics).toEqual([]);
    expect(published).toHaveLength(2);
    expect(published.map((event) => event.aggregateId)).toEqual(["checkout", "login"]);
    expect(
      published.map((event) => (event.payload as { requirementIds: string[] }).requirementIds),
    ).toEqual([["checkout"], ["login"]]);
  });

  it("resolves trace-link endpoints to the affected Requirement", async () => {
    const directory = await createProject({
      schemaVersion: QUALITY_SCHEMA_VERSION,
      requirements: [{ id: "checkout", title: "Checkout", description: "Checkout flow" }],
      acceptanceCriteria: [],
      qualityRisks: [
        { id: "checkout-risk", requirementId: "checkout", statement: "Checkout risk" },
      ],
      testObligations: [],
      testCases: [],
      traceLinks: [
        {
          id: "checkout-risk-link",
          fromType: "quality-risk",
          fromId: "checkout-risk",
          toType: "requirement",
          toId: "checkout",
          relation: "mitigates",
        },
      ],
    });
    const store = new FileProjectStore();
    const current = await store.readQuality(directory);
    const published: DomainEvent[] = [];
    const loop = new QualityTaskLoop({
      store,
      provider: createMockRequirementAnalysisProvider(),
      publisher: {
        publish: async (event) => {
          published.push(event);
        },
      },
    });

    await loop.decide({
      rootDirectory: directory,
      proposal: {
        id: "proposal-update-trace-link",
        baseRevision: current.revision!,
        status: "proposed",
        operations: [
          {
            kind: "update",
            entityType: "traceLink",
            id: "checkout-risk-link",
            entity: {
              id: "checkout-risk-link",
              fromType: "quality-risk",
              fromId: "checkout-risk",
              toType: "requirement",
              toId: "checkout",
              relation: "mitigates",
            },
          },
        ],
      },
      reviewer: "nao",
      decision: "approve",
    });

    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({
      aggregateId: "checkout",
      payload: { requirementIds: ["checkout"] },
    });
  });
});
