import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FileEvidenceStore,
  FileProjectStore,
  FileQualityEngineeringStore,
} from "@ai-native-qa-workbench/project-store";
import {
  type DomainEvent,
  QUALITY_ENGINEERING_SCHEMA_VERSION,
} from "@ai-native-qa-workbench/domain";
import { SqliteRuntimeStore } from "@ai-native-qa-workbench/runtime-store";
import { ToolRegistry } from "@ai-native-qa-workbench/tool-runtime";

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
  it("runs migration 2 and persists typed runtime records across close/reopen", async () => {
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

    expect(first.getMigrationVersion()).toBe(2);
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
    expect(reopened.getMigrationVersion()).toBe(2);
    expect(reopened.listRuns(sessionId)).toHaveLength(1);
    reopened.close();
  });

  it("persists, deduplicates, and transitions domain events", async () => {
    const directory = await createTemporaryDirectory();
    const databasePath = join(directory, "runtime.db");
    const event: DomainEvent = {
      id: "event-quality-assessment-requested-001",
      schemaVersion: "0.3",
      type: "quality.assessment.requested",
      aggregateType: "project",
      aggregateId: "checkout-service",
      occurredAt: "2026-09-27T08:00:00Z",
      source: "application",
      payload: {
        projectRoot: directory,
        target: { type: "project" },
        gateKind: "release-readiness",
      },
    };
    const failedEvent = {
      ...event,
      id: "event-evidence-imported-001",
      type: "evidence.imported",
    } as DomainEvent;
    const runtime = new SqliteRuntimeStore(databasePath);

    expect(runtime.appendDomainEvent(event, directory)).toBe(event.id);
    expect(runtime.appendDomainEvent(event, directory)).toBe(event.id);
    expect(runtime.getDomainEvent(event.id)).toMatchObject({
      id: event.id,
      projectRoot: directory,
      status: "pending",
      event,
    });
    expect(runtime.listPendingDomainEvents(directory)).toHaveLength(1);

    runtime.markDomainEventProcessed(event.id, "2026-09-27T08:01:00Z");
    expect(runtime.listPendingDomainEvents(directory)).toEqual([]);
    expect(runtime.getDomainEvent(event.id)).toMatchObject({
      status: "processed",
      processedAt: "2026-09-27T08:01:00Z",
    });

    runtime.appendDomainEvent(failedEvent, directory);
    runtime.markDomainEventFailed(failedEvent.id, "temporary failure", "2026-09-27T08:02:00Z");
    expect(runtime.getDomainEvent(failedEvent.id)).toMatchObject({
      status: "failed",
      error: "temporary failure",
      failedAt: "2026-09-27T08:02:00Z",
    });
    runtime.close();

    const reopened = new SqliteRuntimeStore(databasePath);
    expect(reopened.getDomainEvent(event.id)?.event).toEqual(event);
    expect(reopened.getDomainEvent(failedEvent.id)?.status).toBe("failed");
    reopened.close();
  });

  it("lists quality workflow statuses for the workbench", async () => {
    const directory = await createTemporaryDirectory();
    const runtime = new SqliteRuntimeStore(join(directory, "runtime.db"));
    const event: DomainEvent = {
      id: "event-quality-assessment-requested-status-001",
      schemaVersion: "0.3",
      type: "quality.assessment.requested",
      aggregateType: "project",
      aggregateId: "checkout-service",
      occurredAt: "2026-09-27T08:00:00Z",
      source: "application",
      payload: {
        projectRoot: directory,
        target: { type: "project" },
        gateKind: "release-readiness",
      },
    };

    runtime.appendDomainEvent(event, directory);
    expect(runtime.listWorkflowStatuses(directory)).toMatchObject([
      { eventId: event.id, eventType: event.type, status: "pending" },
    ]);

    const sessionId = runtime.createSession({ projectRoot: directory, uiLocale: "en" });
    const runId = runtime.appendRun({ sessionId, kind: "quality-engineering" });
    const workflowId = runtime.appendWorkflowRun({
      runId,
      kind: "quality-engineering",
      workflowKind: "quality-engineering",
      triggerEventId: event.id,
      status: "running",
    });
    expect(runtime.listWorkflowStatuses(directory)).toMatchObject([
      { eventId: event.id, status: "running", workflowRunId: workflowId },
    ]);

    runtime.updateWorkflowRun(workflowId, {
      status: "completed",
      completedAt: "2026-09-27T08:03:00Z",
    });
    runtime.markDomainEventProcessed(event.id, "2026-09-27T08:03:00Z");
    expect(runtime.listWorkflowStatuses(directory)).toMatchObject([
      { eventId: event.id, status: "completed" },
    ]);

    const failedEvent = { ...event, id: "event-quality-assessment-requested-status-002" };
    runtime.appendDomainEvent(failedEvent, directory);
    runtime.markDomainEventFailed(failedEvent.id, "temporary failure", "2026-09-27T08:04:00Z");
    expect(runtime.listWorkflowStatuses(directory)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventId: failedEvent.id,
          status: "failed",
          error: "temporary failure",
        }),
      ]),
    );
    runtime.close();
  });

  it("deduplicates workflow runs by trigger event and kind and preserves ordered steps", async () => {
    const directory = await createTemporaryDirectory();
    const runtime = new SqliteRuntimeStore(join(directory, "runtime.db"));
    const sessionId = runtime.createSession({ projectRoot: directory, uiLocale: "en" });
    const runId = runtime.appendRun({ sessionId, kind: "quality-engineering" });
    const triggerEventId = "event-quality-assessment-requested-001";

    const firstWorkflowId = runtime.appendWorkflowRun({
      runId,
      kind: "quality-engineering",
      workflowKind: "quality-engineering",
      triggerEventId,
      status: "running",
    });
    const duplicateWorkflowId = runtime.appendWorkflowRun({
      runId,
      kind: "quality-engineering",
      workflowKind: "quality-engineering",
      triggerEventId,
      status: "running",
    });

    expect(duplicateWorkflowId).toBe(firstWorkflowId);
    expect(runtime.findWorkflowRun({ triggerEventId, kind: "quality-engineering" })).toMatchObject({
      id: firstWorkflowId,
      triggerEventId,
      workflowKind: "quality-engineering",
    });

    const firstStepId = runtime.appendWorkflowStep({
      workflowRunId: firstWorkflowId,
      key: "load",
      status: "completed",
      payload: { revision: "a".repeat(64) },
    });
    expect(
      runtime.appendWorkflowStep({
        workflowRunId: firstWorkflowId,
        key: "load",
        status: "completed",
        payload: { revision: "b".repeat(64) },
      }),
    ).toBe(firstStepId);
    runtime.appendWorkflowStep({
      workflowRunId: firstWorkflowId,
      key: "write",
      status: "completed",
      payload: { written: true },
    });
    expect(runtime.listWorkflowSteps(firstWorkflowId)).toEqual([
      expect.objectContaining({
        id: firstStepId,
        key: "load",
        payload: { revision: "a".repeat(64) },
      }),
      expect.objectContaining({ key: "write", payload: { written: true } }),
    ]);

    runtime.updateWorkflowRun(firstWorkflowId, {
      status: "completed",
      completedAt: "2026-09-27T08:03:00Z",
    });
    expect(runtime.listWorkflowRuns(runId)).toContainEqual(
      expect.objectContaining({
        id: firstWorkflowId,
        status: "completed",
        completedAt: "2026-09-27T08:03:00Z",
      }),
    );
    runtime.close();
  });

  it("keeps all project-quality YAML outside SQLite and safe to delete runtime DB", async () => {
    const directory = await createTemporaryDirectory();
    const projectStore = new FileProjectStore();
    await projectStore.initProject({ rootDirectory: directory });
    const qualityPath = join(directory, ".ai-qa", "quality.yaml");
    const before = await readFile(qualityPath, "utf8");
    await new FileQualityEngineeringStore().writeQualityEngineering(
      directory,
      {
        schemaVersion: QUALITY_ENGINEERING_SCHEMA_VERSION,
        assessments: [],
        gates: [],
        humanDecisions: [],
      },
      null,
    );
    await new FileEvidenceStore().writeEvidence(
      directory,
      {
        schemaVersion: "0.2",
        testRuns: [],
        evidenceRecords: [],
      },
      null,
    );
    const qualityEngineeringPath = join(directory, ".ai-qa", "quality-engineering.yaml");
    const evidencePath = join(directory, ".ai-qa", "evidence.yaml");
    const beforeQualityEngineering = await readFile(qualityEngineeringPath, "utf8");
    const beforeEvidence = await readFile(evidencePath, "utf8");
    const runtimePath = join(directory, ".ai-qa", "runtime.db");
    const runtime = new SqliteRuntimeStore(runtimePath);
    runtime.createSession({ projectRoot: directory, uiLocale: "en" });
    runtime.close();

    await rm(runtimePath);
    const quality = await projectStore.readQuality(directory);

    expect(quality.valid).toBe(true);
    expect(await readFile(qualityPath, "utf8")).toBe(before);
    expect(await readFile(qualityEngineeringPath, "utf8")).toBe(beforeQualityEngineering);
    expect(await readFile(evidencePath, "utf8")).toBe(beforeEvidence);
  });

  it("persists ToolRegistry audit records through the runtime store context", async () => {
    const directory = await createTemporaryDirectory();
    const runtime = new SqliteRuntimeStore(join(directory, "runtime.db"));
    const sessionId = runtime.createSession({ projectRoot: directory, uiLocale: "en" });
    const runId = runtime.appendRun({ sessionId, kind: "tool-execution" });
    const registry = new ToolRegistry();
    registry.register({
      name: "quality.read",
      permission: "read",
      execute: async () => ({ ok: true }),
    });

    await registry.execute("quality.read", {}, { runtimeStore: runtime, runId });

    expect(runtime.listToolRuns(runId)).toEqual([
      expect.objectContaining({
        toolName: "quality.read",
        permission: "read",
        status: "completed",
      }),
    ]);
    runtime.close();
  });

  it("persists denied and failed ToolRegistry audits through the runtime store context", async () => {
    const directory = await createTemporaryDirectory();
    const runtime = new SqliteRuntimeStore(join(directory, "runtime.db"));
    const sessionId = runtime.createSession({ projectRoot: directory, uiLocale: "en" });
    const runId = runtime.appendRun({ sessionId, kind: "tool-execution" });
    const registry = new ToolRegistry();
    registry.register({
      name: "proposal.apply",
      permission: "write",
      execute: async () => ({ ok: true }),
    });
    registry.register({
      name: "quality.read",
      permission: "read",
      execute: async () => {
        throw new Error("read failed");
      },
    });

    await expect(
      registry.execute("proposal.apply", {}, { runtimeStore: runtime, runId }),
    ).rejects.toThrow("approval");
    await expect(
      registry.execute("quality.read", {}, { runtimeStore: runtime, runId }),
    ).rejects.toThrow("read failed");

    expect(runtime.listToolRuns(runId).map(({ status }) => status)).toEqual(["denied", "failed"]);
    runtime.close();
  });
});
