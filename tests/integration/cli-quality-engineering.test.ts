import { fileURLToPath } from "node:url";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

import { QUALITY_SCHEMA_VERSION } from "@ai-native-qa-workbench/domain";
import {
  FileProjectStore,
  FileQualityEngineeringStore,
} from "@ai-native-qa-workbench/project-store";

const tsxEntry = fileURLToPath(new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url));
const cliEntry = fileURLToPath(new URL("../../apps/cli/src/main.ts", import.meta.url));
const evidenceFixture = new URL("../fixtures/evidence/junit-minimal.xml", import.meta.url);
const temporaryDirectories: string[] = [];

function runCli(args: string[], cwd: string) {
  return spawnSync(process.execPath, [tsxEntry, "--conditions=development", cliEntry, ...args], {
    cwd,
    encoding: "utf8",
  });
}

async function createProject(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "qaw-cli-quality-engineering-"));
  temporaryDirectories.push(directory);
  const initialized = runCli(["init"], directory);
  expect(initialized.status).toBe(0);
  await new FileProjectStore().writeQuality(directory, {
    schemaVersion: QUALITY_SCHEMA_VERSION,
    requirements: [{ id: "checkout", title: "Checkout", description: "Checkout flow" }],
    acceptanceCriteria: [],
    qualityRisks: [],
    testObligations: [],
    testCases: [],
    traceLinks: [],
  });
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("qaw quality CLI", () => {
  it("validates the optional v0.3 file and evaluates a project synchronously", async () => {
    const directory = await createProject();

    const before = runCli(["quality", "validate"], directory);
    const evaluated = runCli(["quality", "evaluate"], directory);
    const after = runCli(["quality", "validate"], directory);
    const processed = runCli(["quality", "process"], directory);

    expect(before.status).toBe(0);
    expect(JSON.parse(before.stdout)).toMatchObject({ valid: true });
    expect(evaluated.status).toBe(0);
    expect(JSON.parse(evaluated.stdout)).toMatchObject({
      status: "processed",
      processed: true,
      assessmentId: expect.any(String),
      gateId: expect.any(String),
    });
    expect(after.status).toBe(0);
    expect(JSON.parse(after.stdout)).toMatchObject({
      valid: true,
      qualityEngineering: {
        assessments: [expect.objectContaining({ verdict: "insufficient-evidence" })],
        gates: [expect.objectContaining({ outcome: "insufficient-evidence" })],
      },
    });
    expect(processed.status).toBe(0);
    expect(JSON.parse(processed.stdout)).toEqual([]);
  });

  it("routes evaluate to a requirement target", async () => {
    const directory = await createProject();
    const evaluated = runCli(["quality", "evaluate", "--requirement-id", "checkout"], directory);

    expect(evaluated.status).toBe(0);
    expect(JSON.parse(evaluated.stdout)).toMatchObject({ status: "processed" });
    const qualityEngineering = await new FileQualityEngineeringStore().readQualityEngineering(
      directory,
    );
    expect(qualityEngineering.qualityEngineering?.assessments[0]?.target).toEqual({
      type: "requirement",
      id: "checkout",
    });
  });

  it("requires explicit human decision fields and exposes no approval shortcuts", async () => {
    const directory = await createProject();
    const missingReviewer = runCli(
      ["quality", "decide", "gate-checkout", "--decision", "approve", "--rationale", "reviewed"],
      directory,
    );
    const invalidDecision = runCli(
      [
        "quality",
        "decide",
        "gate-checkout",
        "--decision",
        "auto-approve",
        "--reviewer",
        "alice",
        "--rationale",
        "reviewed",
      ],
      directory,
    );
    const aiApprove = runCli(["quality", "evaluate", "--ai-approve"], directory);
    const trusted = runCli(["quality", "evaluate", "--trusted"], directory);

    for (const result of [missingReviewer, invalidDecision, aiApprove, trusted]) {
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Usage:");
    }
  });

  it("evaluates and then records an explicit human decision", async () => {
    const directory = await createProject();
    const evaluated = runCli(["quality", "evaluate"], directory);
    const evaluation = JSON.parse(evaluated.stdout) as { gateId: string };

    const decided = runCli(
      [
        "quality",
        "decide",
        evaluation.gateId,
        "--decision",
        "approve",
        "--reviewer",
        "alice",
        "--rationale",
        "I reviewed the current evidence.",
      ],
      directory,
    );

    expect(decided.status).toBe(0);
    expect(JSON.parse(decided.stdout)).toMatchObject({
      written: true,
      resolvedGateStatus: "approved",
      decision: { reviewer: "alice", decision: "approve" },
    });
  });

  it("drains an evidence event that was persisted by the evidence import command", async () => {
    const directory = await createProject();
    await writeFile(join(directory, "report.xml"), await readFile(evidenceFixture), "utf8");

    const imported = runCli(
      ["evidence", "import", "report.xml", "--format", "junit", "--run-id", "run-quality"],
      directory,
    );
    const processed = runCli(["quality", "process"], directory);

    expect(imported.status).toBe(0);
    expect(processed.status).toBe(0);
    expect(JSON.parse(processed.stdout)).toEqual([
      expect.objectContaining({ status: "processed", processed: true }),
    ]);
  });
});
