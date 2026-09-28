import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  RuleBasedQualityAssessmentProvider,
  SqliteQualityEngineeringWorkflow,
  type QualityEngineeringWorkflowDependencies,
} from "@ai-native-qa-workbench/application";
import {
  QUALITY_SCHEMA_VERSION,
  type DomainEvent,
  type EvidenceSnapshot,
  type QualitySnapshot,
} from "@ai-native-qa-workbench/domain";
import {
  EVIDENCE_ARTIFACT_DIRECTORY_RELATIVE_PATH,
  FileEvidenceStore,
  FileProjectStore,
  FileQualityEngineeringStore,
  type QualityEngineeringStore,
} from "@ai-native-qa-workbench/project-store";
import { SqliteRuntimeStore } from "@ai-native-qa-workbench/runtime-store";

const temporaryDirectories: string[] = [];
const artifactContents = "workflow evidence";

function qualitySnapshot(): QualitySnapshot {
  return {
    schemaVersion: QUALITY_SCHEMA_VERSION,
    requirements: [{ id: "checkout", title: "Checkout", description: "Checkout flow" }],
    acceptanceCriteria: [],
    qualityRisks: [],
    testObligations: [],
    testCases: [],
    traceLinks: [],
  };
}

function evidenceSnapshot(): EvidenceSnapshot {
  const sha256 = createHash("sha256").update(artifactContents, "utf8").digest("hex");
  return {
    schemaVersion: "0.2",
    testRuns: [
      {
        id: "run-checkout",
        format: "junit",
        status: "passed",
        results: [{ name: "checkout passes", status: "passed" }],
      },
    ],
    evidenceRecords: [
      {
        id: "evidence-checkout",
        testRunId: "run-checkout",
        kind: "test-result",
        artifact: {
          id: "artifact-checkout",
          relativePath: "checkout.xml",
          mediaType: "application/xml",
          sizeBytes: Buffer.byteLength(artifactContents, "utf8"),
          sha256,
        },
        provenance: {
          sourceFormat: "junit",
          sourceFileName: "checkout.xml",
          importedAt: "2026-09-27T08:00:00Z",
          trust: "trusted",
        },
      },
    ],
  };
}

async function createFixture(): Promise<{
  directory: string;
  projectStore: FileProjectStore;
  evidenceStore: FileEvidenceStore;
  qualityEngineeringStore: FileQualityEngineeringStore;
  runtimeStore: SqliteRuntimeStore;
}> {
  const directory = await mkdtemp(join(tmpdir(), "qaw-quality-engineering-workflow-"));
  temporaryDirectories.push(directory);
  const projectStore = new FileProjectStore();
  const evidenceStore = new FileEvidenceStore();
  const qualityEngineeringStore = new FileQualityEngineeringStore();
  const initialized = await projectStore.initProject({ rootDirectory: directory });
  expect(initialized.created).toBe(true);
  await projectStore.writeQuality(directory, qualitySnapshot());
  await mkdir(join(directory, EVIDENCE_ARTIFACT_DIRECTORY_RELATIVE_PATH), { recursive: true });
  await writeFile(
    join(directory, EVIDENCE_ARTIFACT_DIRECTORY_RELATIVE_PATH, "checkout.xml"),
    artifactContents,
    "utf8",
  );
  await evidenceStore.writeEvidence(directory, evidenceSnapshot(), null);
  return {
    directory,
    projectStore,
    evidenceStore,
    qualityEngineeringStore,
    runtimeStore: new SqliteRuntimeStore(join(directory, ".ai-qa", "runtime.db")),
  };
}

function requestedEvent(
  directory: string,
  id = "event-quality-assessment-requested-001",
): DomainEvent {
  return {
    id,
    schemaVersion: "0.3",
    type: "quality.assessment.requested",
    aggregateType: "project",
    aggregateId: "checkout-service",
    occurredAt: "2026-09-27T08:10:00Z",
    source: "application",
    payload: {
      projectRoot: directory,
      target: { type: "project" },
      gateKind: "release-readiness",
    },
  };
}

function workflow(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  overrides: Partial<QualityEngineeringWorkflowDependencies> = {},
): SqliteQualityEngineeringWorkflow {
  return new SqliteQualityEngineeringWorkflow({
    projectStore: fixture.projectStore,
    evidenceStore: fixture.evidenceStore,
    qualityEngineeringStore: fixture.qualityEngineeringStore,
    runtimeStore: fixture.runtimeStore,
    assessmentProvider: new RuleBasedQualityAssessmentProvider(),
    clock: () => "2026-09-27T08:20:00Z",
    idFactory: (() => {
      let index = 0;
      return () => `workflow-generated-${++index}`;
    })(),
    ...overrides,
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("SqliteQualityEngineeringWorkflow", () => {
  it("processes an assessment request into one Assessment, Gate, runtime run, steps, and audit events", async () => {
    const fixture = await createFixture();
    const event = requestedEvent(fixture.directory);
    const result = await workflow(fixture).dispatch(event);
    const snapshot = await fixture.qualityEngineeringStore.readQualityEngineering(
      fixture.directory,
    );
    const run = result.workflowRunId
      ? fixture.runtimeStore.getDomainEvent(event.id) &&
        fixture.runtimeStore.findWorkflowRun({
          triggerEventId: event.id,
          kind: "quality-engineering",
        })
      : undefined;

    expect(result).toMatchObject({ status: "processed", processed: true, eventId: event.id });
    expect(snapshot.qualityEngineering?.assessments).toHaveLength(1);
    expect(snapshot.qualityEngineering?.gates).toHaveLength(1);
    expect(snapshot.qualityEngineering?.assessments[0]).toMatchObject({
      target: { type: "project" },
      verdict: "pass",
      evidenceIds: ["evidence-checkout"],
    });
    expect(snapshot.qualityEngineering?.gates[0]).toMatchObject({
      kind: "release-readiness",
      outcome: "pass",
      requiredHumanDecision: true,
    });
    expect(fixture.runtimeStore.getDomainEvent(event.id)).toMatchObject({ status: "processed" });
    expect(run).toMatchObject({ status: "completed", workflowKind: "quality-engineering" });
    expect(result.workflowRunId).toBeTruthy();
    expect(fixture.runtimeStore.listWorkflowSteps(result.workflowRunId!)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "load-and-validate", status: "completed" }),
        expect.objectContaining({ key: "assessment-created", status: "completed" }),
        expect.objectContaining({ key: "gate-evaluated", status: "completed" }),
      ]),
    );
    expect(
      fixture.runtimeStore.getDomainEvent("event-quality-assessment-created-workflow-generated-1"),
    ).toMatchObject({ status: "processed", event: { source: "workflow" } });
    expect(
      fixture.runtimeStore.getDomainEvent("event-quality-gate-evaluated-workflow-generated-2"),
    ).toMatchObject({ status: "processed", event: { source: "workflow" } });
  });

  it("deduplicates repeated dispatch and processes pending events", async () => {
    const fixture = await createFixture();
    const event = requestedEvent(fixture.directory);
    const first = await workflow(fixture).dispatch(event);
    const second = await workflow(fixture).dispatch(event);

    expect(second).toMatchObject({ status: "processed", workflowRunId: first.workflowRunId });
    expect(
      fixture.runtimeStore.findWorkflowRun({
        triggerEventId: event.id,
        kind: "quality-engineering",
      }),
    ).toBeTruthy();
    const snapshot = await fixture.qualityEngineeringStore.readQualityEngineering(
      fixture.directory,
    );
    expect(snapshot.qualityEngineering?.assessments).toHaveLength(1);
    expect(snapshot.qualityEngineering?.gates).toHaveLength(1);

    const pendingEvent = requestedEvent(
      fixture.directory,
      "event-quality-assessment-requested-002",
    );
    fixture.runtimeStore.appendDomainEvent(pendingEvent, fixture.directory);
    const processed = await workflow(fixture).processPending({ projectRoot: fixture.directory });
    expect(processed).toHaveLength(1);
    expect(processed[0]).toMatchObject({ status: "processed", eventId: pendingEvent.id });
  });

  it("retries a failed Workflow after the quality store recovers", async () => {
    const fixture = await createFixture();
    let fail = true;
    const baseStore = fixture.qualityEngineeringStore;
    const flakyStore: QualityEngineeringStore = {
      readQualityEngineering: baseStore.readQualityEngineering.bind(baseStore),
      validateQualityEngineering: baseStore.validateQualityEngineering.bind(baseStore),
      async writeQualityEngineering(...args) {
        if (fail) {
          fail = false;
          return {
            written: false,
            qualityEngineeringPath: join(fixture.directory, ".ai-qa", "quality-engineering.yaml"),
            diagnostics: [
              {
                code: "QUALITY_ENGINEERING_REVISION_CONFLICT",
                path: ".ai-qa/quality-engineering.yaml",
                message: "injected failure",
                severity: "error" as const,
              },
            ],
          };
        }
        return baseStore.writeQualityEngineering(...args);
      },
    };
    const event = requestedEvent(fixture.directory);
    const first = await workflow(fixture, { qualityEngineeringStore: flakyStore }).dispatch(event);
    expect(first).toMatchObject({ status: "failed", processed: false });
    expect(fixture.runtimeStore.getDomainEvent(event.id)).toMatchObject({ status: "failed" });

    const retried = (
      await workflow(fixture, { qualityEngineeringStore: flakyStore }).processPending({
        projectRoot: fixture.directory,
      })
    )[0];
    expect(retried).toMatchObject({
      status: "processed",
      processed: true,
      workflowRunId: first.workflowRunId,
    });
    expect(fixture.runtimeStore.getDomainEvent(event.id)).toMatchObject({ status: "processed" });
    expect(
      fixture.runtimeStore.findWorkflowRun({
        triggerEventId: event.id,
        kind: "quality-engineering",
      }),
    ).not.toHaveProperty("error");
  });

  it("reuses planned IDs when a write succeeds before the workflow step is recorded", async () => {
    const fixture = await createFixture();
    const event = requestedEvent(fixture.directory, "event-quality-assessment-requested-crash-001");
    const appendStep = vi.spyOn(fixture.runtimeStore, "appendWorkflowStep");
    let failOnce = true;
    appendStep.mockImplementation((input) => {
      if (input.key === "assessment-created" && failOnce) {
        failOnce = false;
        throw new Error("injected step persistence failure");
      }
      return SqliteRuntimeStore.prototype.appendWorkflowStep.call(fixture.runtimeStore, input);
    });

    const first = await workflow(fixture).dispatch(event);
    const second = await workflow(fixture).dispatch(event);
    const snapshot = await fixture.qualityEngineeringStore.readQualityEngineering(
      fixture.directory,
    );

    expect(first.status).toBe("failed");
    expect(second).toMatchObject({ status: "processed", processed: true });
    expect(snapshot.qualityEngineering?.assessments).toHaveLength(1);
    expect(snapshot.qualityEngineering?.gates).toHaveLength(1);
  });

  it.each([
    [
      "quality.proposal.applied",
      { qualityRevision: "a".repeat(64), requirementIds: ["checkout"] },
      { type: "requirement", id: "checkout" },
    ],
    [
      "evidence.imported",
      {
        testRunId: "run-checkout",
        evidenceId: "evidence-checkout",
        evidenceRevision: "a".repeat(64),
      },
      { type: "test-run", id: "run-checkout" },
    ],
  ] as const)("routes %s to the target described by its payload", async (type, payload, target) => {
    const fixture = await createFixture();
    const event: DomainEvent = {
      id: `event-${type.replaceAll(".", "-")}-001`,
      schemaVersion: "0.3",
      type,
      aggregateType: type === "evidence.imported" ? "evidence" : "quality",
      aggregateId: type === "evidence.imported" ? "evidence-checkout" : "checkout",
      occurredAt: "2026-09-27T08:10:00Z",
      source: "application",
      payload: { projectRoot: fixture.directory, ...payload },
    } as DomainEvent;

    const result = await workflow(fixture).dispatch(event);
    const snapshot = await fixture.qualityEngineeringStore.readQualityEngineering(
      fixture.directory,
    );

    expect(result.status).toBe("processed");
    expect(snapshot.qualityEngineering?.assessments[0]?.target).toEqual(target);
  });

  it.each([
    [
      "quality.proposal.applied",
      { qualityRevision: "invalid", requirementIds: ["checkout"] },
      "payload.qualityRevision",
    ],
    [
      "quality.proposal.applied",
      { qualityRevision: "a".repeat(64), requirementIds: [] },
      "payload.requirementIds",
    ],
    [
      "quality.proposal.applied",
      { qualityRevision: "a".repeat(64), requirementIds: ["checkout", "login"] },
      "payload.requirementIds",
    ],
    [
      "evidence.imported",
      { evidenceRevision: "invalid", testRunId: "run-checkout", evidenceId: "evidence-checkout" },
      "payload.evidenceRevision",
    ],
    [
      "evidence.imported",
      { evidenceRevision: "a".repeat(64), testRunId: "run-checkout" },
      "payload.evidenceId",
    ],
  ] as const)("rejects incomplete %s trigger payloads", async (type, payload, path) => {
    const fixture = await createFixture();
    const event: DomainEvent = {
      id: `event-invalid-${type.replaceAll(".", "-")}-one`,
      schemaVersion: "0.3",
      type,
      aggregateType: type === "evidence.imported" ? "evidence" : "quality",
      aggregateId: "checkout",
      occurredAt: "2026-09-27T08:10:00Z",
      source: "application",
      payload: { projectRoot: fixture.directory, ...payload },
    } as DomainEvent;

    const result = await workflow(fixture).dispatch(event);

    expect(result).toMatchObject({ status: "failed", processed: false });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ path }));
  });

  it("persists audit-only events without starting an assessment workflow", async () => {
    const fixture = await createFixture();
    const event: DomainEvent = {
      id: "event-quality-assessment-created-audit-001",
      schemaVersion: "0.3",
      type: "quality.assessment.created",
      aggregateType: "assessment",
      aggregateId: "assessment-audit-001",
      occurredAt: "2026-09-27T08:10:00Z",
      source: "workflow",
      payload: {
        projectRoot: fixture.directory,
        assessmentId: "assessment-audit-001",
        target: { type: "project" },
        verdict: "pass",
      },
    };

    const result = await workflow(fixture).dispatch(event);

    expect(result).toMatchObject({ status: "processed", processed: true, eventId: event.id });
    expect(fixture.runtimeStore.getDomainEvent(event.id)).toMatchObject({ status: "processed" });
    expect(
      fixture.runtimeStore.findWorkflowRun({
        triggerEventId: event.id,
        kind: "quality-engineering",
      }),
    ).toBeUndefined();
  });
});
