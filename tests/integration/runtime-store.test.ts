import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FileProjectStore } from "@ai-native-qa-workbench/project-store";
import { SqliteRuntimeStore } from "@ai-native-qa-workbench/runtime-store";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "qaw-runtime-store-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("SqliteRuntimeStore", () => {
  it("runs migration 1 and persists typed runtime records across close/reopen", async () => {
    const directory = await createTemporaryDirectory();
    const databasePath = join(directory, "runtime.db");
    const first = new SqliteRuntimeStore(databasePath);

    const sessionId = first.createSession({ projectRoot: directory, uiLocale: "zh-CN" });
    const runId = first.appendRun({ sessionId, kind: "requirement-analysis" });
    const stepId = first.appendStep({
      runId,
      kind: "analyze",
      status: "completed",
      payload: { requirementId: "checkout" },
    });
    const toolRunId = first.appendToolRun({
      runId,
      toolName: "quality.read",
      permission: "read",
      status: "completed",
    });
    const approvalId = first.appendApproval({
      runId,
      action: "apply-proposal",
      status: "pending",
    });
    const workflowId = first.appendWorkflowRun({
      runId,
      kind: "quality-task",
      status: "running",
    });

    expect(first.getMigrationVersion()).toBe(1);
    expect(first.getSession(sessionId)).toMatchObject({ id: sessionId, uiLocale: "zh-CN" });
    expect(first.listRuns(sessionId)).toHaveLength(1);
    expect(first.listSteps(runId)).toEqual([
      expect.objectContaining({
        id: stepId,
        kind: "analyze",
        payload: { requirementId: "checkout" },
      }),
    ]);
    expect(first.listToolRuns(runId)).toEqual([
      expect.objectContaining({ id: toolRunId, toolName: "quality.read", permission: "read" }),
    ]);
    expect(first.listApprovals(runId)).toEqual([
      expect.objectContaining({ id: approvalId, status: "pending" }),
    ]);
    expect(first.listWorkflowRuns(runId)).toEqual([
      expect.objectContaining({ id: workflowId, status: "running" }),
    ]);

    first.close();
    const reopened = new SqliteRuntimeStore(databasePath);
    expect(reopened.getMigrationVersion()).toBe(1);
    expect(reopened.listRuns(sessionId)).toHaveLength(1);
    reopened.close();
  });

  it("keeps quality YAML outside SQLite and safe to delete runtime DB", async () => {
    const directory = await createTemporaryDirectory();
    const projectStore = new FileProjectStore();
    await projectStore.initProject({ rootDirectory: directory });
    const qualityPath = join(directory, ".ai-qa", "quality.yaml");
    const before = await readFile(qualityPath, "utf8");
    const runtimePath = join(directory, ".ai-qa", "runtime.db");
    const runtime = new SqliteRuntimeStore(runtimePath);
    runtime.createSession({ projectRoot: directory, uiLocale: "en" });
    runtime.close();

    await rm(runtimePath);
    const quality = await projectStore.readQuality(directory);

    expect(quality.valid).toBe(true);
    expect(await readFile(qualityPath, "utf8")).toBe(before);
  });
});
