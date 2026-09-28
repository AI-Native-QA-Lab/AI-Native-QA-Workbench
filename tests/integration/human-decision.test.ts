import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FileHumanDecisionService,
  type DomainEventPublisher,
} from "@ai-native-qa-workbench/application";
import {
  QUALITY_ENGINEERING_SCHEMA_VERSION,
  type EvidenceSnapshot,
  type QualityEngineeringSnapshot,
} from "@ai-native-qa-workbench/domain";
import {
  FileEvidenceStore,
  FileProjectStore,
  FileQualityEngineeringStore,
  QUALITY_ENGINEERING_FILE_RELATIVE_PATH,
} from "@ai-native-qa-workbench/project-store";

const temporaryDirectories: string[] = [];

function qualityEngineeringSnapshot(): QualityEngineeringSnapshot {
  return {
    schemaVersion: QUALITY_ENGINEERING_SCHEMA_VERSION,
    assessments: [
      {
        id: "assessment-release",
        target: { type: "project" },
        verdict: "warn",
        summary: "Execution evidence is unverified.",
        reasonCodes: ["EVIDENCE_UNVERIFIED"],
        evidenceIds: [],
        source: "deterministic",
        basedOnRevision: null,
        createdAt: "2026-09-27T08:00:00Z",
      },
    ],
    gates: [
      {
        id: "gate-release",
        kind: "release-readiness",
        target: { type: "project" },
        assessmentId: "assessment-release",
        outcome: "warn",
        requiredHumanDecision: true,
        evaluatedAt: "2026-09-27T08:01:00Z",
      },
    ],
    humanDecisions: [],
  };
}

async function createFixture(): Promise<{
  directory: string;
  qualityEngineeringStore: FileQualityEngineeringStore;
  publisherEvents: Parameters<DomainEventPublisher["publish"]>[0][];
}> {
  const directory = await mkdtemp(join(tmpdir(), "qaw-human-decision-"));
  temporaryDirectories.push(directory);
  const projectStore = new FileProjectStore();
  const evidenceStore = new FileEvidenceStore();
  const qualityEngineeringStore = new FileQualityEngineeringStore(projectStore, evidenceStore);
  expect((await projectStore.initProject({ rootDirectory: directory })).created).toBe(true);
  await projectStore.writeQuality(directory, {
    schemaVersion: "0.1",
    requirements: [],
    acceptanceCriteria: [],
    qualityRisks: [],
    testObligations: [],
    testCases: [],
    traceLinks: [],
  });
  const emptyEvidence: EvidenceSnapshot = {
    schemaVersion: "0.2",
    testRuns: [],
    evidenceRecords: [],
  };
  await evidenceStore.writeEvidence(directory, emptyEvidence, null);
  await qualityEngineeringStore.writeQualityEngineering(
    directory,
    qualityEngineeringSnapshot(),
    null,
  );
  const publisherEvents: Parameters<DomainEventPublisher["publish"]>[0][] = [];
  return { directory, qualityEngineeringStore, publisherEvents };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("FileHumanDecisionService integration", () => {
  it("atomically appends the decision and emits a human-sourced audit event", async () => {
    const fixture = await createFixture();
    const projectStore = new FileProjectStore();
    const evidenceStore = new FileEvidenceStore();
    const publisher: DomainEventPublisher = {
      publish: async (event) => {
        fixture.publisherEvents.push(event);
      },
    };
    const service = new FileHumanDecisionService({
      projectStore,
      evidenceStore,
      qualityEngineeringStore: fixture.qualityEngineeringStore,
      publisher,
      clock: () => "2026-09-27T08:02:00Z",
      idFactory: () => "decision-release",
    });
    const before = await fixture.qualityEngineeringStore.readQualityEngineering(fixture.directory);

    const result = await service.record({
      rootDirectory: fixture.directory,
      gateId: "gate-release",
      decision: "approve",
      reviewer: "alice",
      rationale: "I reviewed the warning and accept the current release risk.",
      expectedRevision: before.revision,
    });
    const after = await fixture.qualityEngineeringStore.readQualityEngineering(fixture.directory);

    expect(result).toMatchObject({
      written: true,
      resolvedGateStatus: "approved",
      revision: expect.any(String),
    });
    expect(after.qualityEngineering?.humanDecisions).toEqual([
      {
        id: "decision-release",
        gateId: "gate-release",
        decision: "approve",
        reviewer: "alice",
        rationale: "I reviewed the warning and accept the current release risk.",
        decidedAt: "2026-09-27T08:02:00Z",
      },
    ]);
    expect(fixture.publisherEvents).toHaveLength(1);
    expect(fixture.publisherEvents[0]).toMatchObject({
      id: "event-quality-human-decision-recorded-decision-release",
      source: "human",
      type: "quality.human-decision.recorded",
    });
  });

  it("does not modify the file when the expected revision is stale", async () => {
    const fixture = await createFixture();
    const projectStore = new FileProjectStore();
    const evidenceStore = new FileEvidenceStore();
    const publisher: DomainEventPublisher = { publish: async () => {} };
    const service = new FileHumanDecisionService({
      projectStore,
      evidenceStore,
      qualityEngineeringStore: fixture.qualityEngineeringStore,
      publisher,
      clock: () => "2026-09-27T08:02:00Z",
      idFactory: () => "decision-release",
    });
    const before = await fixture.qualityEngineeringStore.readQualityEngineering(fixture.directory);

    const result = await service.record({
      rootDirectory: fixture.directory,
      gateId: "gate-release",
      decision: "reject",
      reviewer: "alice",
      rationale: "The warning remains unresolved.",
      expectedRevision: "c".repeat(64),
    });
    const after = await fixture.qualityEngineeringStore.readQualityEngineering(fixture.directory);

    expect(result).toMatchObject({ written: false });
    expect(result.diagnostics.map((item) => item.code)).toContain(
      "QUALITY_ENGINEERING_REVISION_CONFLICT",
    );
    expect(after.revision).toBe(before.revision);
    expect(after.qualityEngineering?.humanDecisions).toHaveLength(0);
  });

  it("retries publication for an already-written decision without appending a duplicate", async () => {
    const fixture = await createFixture();
    let failOnce = true;
    const publisherEvents: Parameters<DomainEventPublisher["publish"]>[0][] = [];
    const publisher: DomainEventPublisher = {
      publish: async (event) => {
        if (failOnce) {
          failOnce = false;
          throw new Error("injected publication failure");
        }
        publisherEvents.push(event);
      },
    };
    const service = new FileHumanDecisionService({
      projectStore: new FileProjectStore(),
      evidenceStore: new FileEvidenceStore(),
      qualityEngineeringStore: fixture.qualityEngineeringStore,
      publisher,
      clock: () => "2026-09-27T08:02:00Z",
      idFactory: () => "decision-release",
    });
    const before = await fixture.qualityEngineeringStore.readQualityEngineering(fixture.directory);
    const input = {
      rootDirectory: fixture.directory,
      gateId: "gate-release",
      decision: "approve" as const,
      reviewer: "alice",
      rationale: "I reviewed the warning and accept the current release risk.",
      expectedRevision: before.revision,
    };

    const first = await service.record(input);
    const second = await service.record({ ...input, expectedRevision: first.revision ?? null });
    const after = await fixture.qualityEngineeringStore.readQualityEngineering(fixture.directory);

    expect(first).toMatchObject({ written: true, decision: { id: "decision-release" } });
    expect(first.diagnostics).toContainEqual(
      expect.objectContaining({ code: "QUALITY_ENGINEERING_WORKFLOW_FAILED" }),
    );
    expect(second).toMatchObject({ written: true, diagnostics: [] });
    expect(after.qualityEngineering?.humanDecisions).toHaveLength(1);
    expect(publisherEvents).toHaveLength(1);
  });

  it("fails closed when the current quality-engineering file is malformed", async () => {
    const fixture = await createFixture();
    await mkdir(join(fixture.directory, ".ai-qa"), { recursive: true });
    await writeFile(
      join(fixture.directory, QUALITY_ENGINEERING_FILE_RELATIVE_PATH),
      "schemaVersion: 0.3\nqualityEngineering: [broken]\n",
      "utf8",
    );
    const service = new FileHumanDecisionService({
      projectStore: new FileProjectStore(),
      evidenceStore: new FileEvidenceStore(),
      qualityEngineeringStore: fixture.qualityEngineeringStore,
      publisher: { publish: async () => {} },
      clock: () => "2026-09-27T08:02:00Z",
      idFactory: () => "decision-release",
    });

    const result = await service.record({
      rootDirectory: fixture.directory,
      gateId: "gate-release",
      decision: "approve",
      reviewer: "alice",
      rationale: "Review completed.",
      expectedRevision: null,
    });

    expect(result.written).toBe(false);
    expect(result.diagnostics.map((item) => item.code)).toContain(
      "QUALITY_ENGINEERING_FILE_MALFORMED",
    );
    expect(result.diagnostics.map((item) => item.path)).toContain("qualityEngineering");
  });
});
