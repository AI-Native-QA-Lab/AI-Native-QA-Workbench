import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createMockRequirementAnalysisProvider,
  QualityTaskLoop,
} from "@ai-native-qa-workbench/application";
import { QUALITY_SCHEMA_VERSION, type QualitySnapshot } from "@ai-native-qa-workbench/domain";
import { FileProjectStore } from "@ai-native-qa-workbench/project-store";

const temporaryDirectories: string[] = [];

async function createProject(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "qaw-task-loop-"));
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
});
