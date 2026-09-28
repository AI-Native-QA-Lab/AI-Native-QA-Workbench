import { describe, expect, it } from "vitest";

import {
  FileHumanDecisionService,
  RuleBasedQualityAssessmentProvider,
  SqliteQualityEngineeringWorkflow,
  type HumanDecisionService,
} from "@ai-native-qa-workbench/application";
import {
  QUALITY_ENGINEERING_SCHEMA_VERSION,
  type DomainEvent,
  type EvidenceSnapshot,
  type QualityEngineeringSnapshot,
  type QualitySnapshot,
} from "@ai-native-qa-workbench/domain";
import type {
  EvidenceStore,
  ProjectStore,
  QualityEngineeringStore,
} from "@ai-native-qa-workbench/project-store";

const rootDirectory = "/tmp/checkout-service";
const currentRevision = "a".repeat(64);
const nextRevision = "b".repeat(64);

function quality(): QualitySnapshot {
  return {
    schemaVersion: "0.1",
    requirements: [{ id: "checkout", title: "Checkout", description: "Checkout flow" }],
    acceptanceCriteria: [],
    qualityRisks: [],
    testObligations: [],
    testCases: [],
    traceLinks: [],
  };
}

function evidence(): EvidenceSnapshot {
  return { schemaVersion: "0.2", testRuns: [], evidenceRecords: [] };
}

function snapshot(): QualityEngineeringSnapshot {
  return {
    schemaVersion: QUALITY_ENGINEERING_SCHEMA_VERSION,
    assessments: [
      {
        id: "assessment-checkout",
        target: { type: "project" },
        verdict: "pass",
        summary: "Trusted execution evidence passed.",
        reasonCodes: ["EVIDENCE_VERIFIED"],
        evidenceIds: [],
        source: "deterministic",
        basedOnRevision: null,
        createdAt: "2026-09-27T08:00:00Z",
      },
    ],
    gates: [
      {
        id: "gate-checkout",
        kind: "release-readiness",
        target: { type: "project" },
        assessmentId: "assessment-checkout",
        outcome: "pass",
        requiredHumanDecision: true,
        evaluatedAt: "2026-09-27T08:01:00Z",
      },
    ],
    humanDecisions: [],
  };
}

function dependencies(
  overrides: {
    current?: QualityEngineeringSnapshot;
    revision?: string | null;
    validationDiagnostics?: QualityEngineeringStore["validateQualityEngineering"] extends (
      ...args: never[]
    ) => Promise<infer Result>
      ? Result extends { diagnostics: infer Diagnostics }
        ? Diagnostics
        : never
      : never;
    publish?: (event: DomainEvent) => Promise<void>;
    write?: QualityEngineeringStore["writeQualityEngineering"];
  } = {},
) {
  const writes: Array<{
    rootDirectory: string;
    snapshot: QualityEngineeringSnapshot;
    expectedRevision: string | null;
  }> = [];
  const published: DomainEvent[] = [];
  const current = overrides.current ?? snapshot();
  const revision = overrides.revision === undefined ? currentRevision : overrides.revision;
  const qualityEngineeringStore = {
    readQualityEngineering: async () => ({
      valid: true,
      qualityEngineering: current,
      revision,
      diagnostics: [],
    }),
    validateQualityEngineering: async () => ({
      valid:
        overrides.validationDiagnostics === undefined ||
        overrides.validationDiagnostics.length === 0,
      qualityEngineering: current,
      revision,
      diagnostics: overrides.validationDiagnostics ?? [],
    }),
    writeQualityEngineering: async (
      receivedRoot: string,
      receivedSnapshot: QualityEngineeringSnapshot,
      expectedRevision: string | null,
    ) => {
      writes.push({ rootDirectory: receivedRoot, snapshot: receivedSnapshot, expectedRevision });
      if (overrides.write) return overrides.write(receivedRoot, receivedSnapshot, expectedRevision);
      return {
        written: true,
        qualityEngineeringPath: `${receivedRoot}/.ai-qa/quality-engineering.yaml`,
        revision: nextRevision,
        diagnostics: [],
      };
    },
  } as unknown as QualityEngineeringStore;
  const projectStore = {
    validateQuality: async () => ({
      valid: true,
      projectQuality: quality(),
      revision: currentRevision,
      diagnostics: [],
    }),
  } as unknown as ProjectStore;
  const evidenceStore = {
    validateEvidence: async () => ({
      valid: true,
      evidence: evidence(),
      revision: currentRevision,
      diagnostics: [],
    }),
  } as unknown as EvidenceStore;
  const publisher = {
    publish: async (event: DomainEvent) => {
      published.push(event);
      await overrides.publish?.(event);
    },
  };

  return {
    service: new FileHumanDecisionService({
      projectStore,
      evidenceStore,
      qualityEngineeringStore,
      publisher,
      clock: () => "2026-09-27T08:02:00Z",
      idFactory: () => "decision-checkout",
    }),
    writes,
    published,
  };
}

const input = {
  rootDirectory,
  gateId: "gate-checkout",
  decision: "approve" as const,
  reviewer: "alice",
  rationale: "Reviewed the current quality evidence.",
  expectedRevision: currentRevision,
};

describe("FileHumanDecisionService", () => {
  it.each([
    ["reviewer", { reviewer: " " }, "QUALITY_ENGINEERING_REVIEWER_EMPTY"],
    ["rationale", { rationale: "\t" }, "QUALITY_ENGINEERING_RATIONALE_EMPTY"],
  ] as const)("rejects an empty %s before writing", async (_field, override, code) => {
    const fixture = dependencies();
    const result = await fixture.service.record({ ...input, ...override });

    expect(result).toMatchObject({ written: false });
    expect(result.diagnostics.map((item) => item.code)).toContain(code);
    expect(fixture.writes).toHaveLength(0);
  });

  it("rejects an unknown gate", async () => {
    const fixture = dependencies();
    const result = await fixture.service.record({ ...input, gateId: "gate-missing" });

    expect(result).toMatchObject({ written: false });
    expect(result.diagnostics.map((item) => item.code)).toContain(
      "QUALITY_ENGINEERING_GATE_NOT_FOUND",
    );
    expect(fixture.writes).toHaveLength(0);
  });

  it("rejects a stale revision before writing", async () => {
    const fixture = dependencies();
    const result = await fixture.service.record({ ...input, expectedRevision: "c".repeat(64) });

    expect(result).toMatchObject({ written: false });
    expect(result.diagnostics.map((item) => item.code)).toContain(
      "QUALITY_ENGINEERING_REVISION_CONFLICT",
    );
    expect(fixture.writes).toHaveLength(0);
  });

  it("rejects an invalid current snapshot", async () => {
    const fixture = dependencies({
      validationDiagnostics: [
        {
          code: "QUALITY_ENGINEERING_FILE_MALFORMED",
          path: ".ai-qa/quality-engineering.yaml",
          message: "invalid current snapshot",
          severity: "error",
        },
      ],
    });
    const result = await fixture.service.record(input);

    expect(result).toMatchObject({ written: false });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "QUALITY_ENGINEERING_FILE_MALFORMED" }),
    ]);
    expect(fixture.writes).toHaveLength(0);
  });

  it.each([
    ["approve", "approved"],
    ["reject", "rejected"],
    ["waive", "waived"],
  ] as const)("records a human %s decision and resolves it as %s", async (decision, status) => {
    const fixture = dependencies();
    const result = await fixture.service.record({ ...input, decision });

    expect(result).toMatchObject({
      written: true,
      resolvedGateStatus: status,
      revision: nextRevision,
      decision: {
        id: "decision-checkout",
        gateId: "gate-checkout",
        decision,
        reviewer: "alice",
        rationale: input.rationale,
        decidedAt: "2026-09-27T08:02:00Z",
      },
    });
    expect(fixture.writes[0]).toMatchObject({
      rootDirectory,
      expectedRevision: currentRevision,
      snapshot: { humanDecisions: [expect.objectContaining({ id: "decision-checkout" })] },
    });
    expect(fixture.published[0]).toMatchObject({
      source: "human",
      type: "quality.human-decision.recorded",
      aggregateType: "gate",
      aggregateId: "gate-checkout",
      payload: {
        projectRoot: rootDirectory,
        gateId: "gate-checkout",
        decisionId: "decision-checkout",
        decision,
        reviewer: "alice",
      },
    });
  });

  it("does not expose a decision mutation method on provider or workflow dependencies", () => {
    expect("record" in new RuleBasedQualityAssessmentProvider()).toBe(false);
    expect("record" in ({} as SqliteQualityEngineeringWorkflow)).toBe(false);
    const service: HumanDecisionService = dependencies().service;
    expect(typeof service.record).toBe("function");
  });
});
