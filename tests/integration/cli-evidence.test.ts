import { fileURLToPath } from "node:url";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

const tsxEntry = fileURLToPath(new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url));
const cliEntry = fileURLToPath(new URL("../../apps/cli/src/main.ts", import.meta.url));
const fixturePath = new URL("../fixtures/evidence/junit-minimal.xml", import.meta.url);
const temporaryDirectories: string[] = [];

function runCli(args: string[], cwd: string) {
  return spawnSync(process.execPath, [tsxEntry, "--conditions=development", cliEntry, ...args], {
    cwd,
    encoding: "utf8",
  });
}

async function createProject(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "qaw-cli-evidence-"));
  temporaryDirectories.push(directory);
  const initialized = runCli(["init"], directory);
  expect(initialized.status).toBe(0);
  await writeFile(join(directory, "report.xml"), await readFile(fixturePath));
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("qaw evidence CLI", () => {
  it("requires the evidence subcommand, report, format, and rejects --trusted", async () => {
    const directory = await createProject();

    const missingSubcommand = runCli(["evidence"], directory);
    const missingReport = runCli(["evidence", "import", "--format", "junit"], directory);
    const missingFormat = runCli(["evidence", "import", "report.xml"], directory);
    const missingFormatValue = runCli(["evidence", "import", "report.xml", "--format"], directory);
    const unsupportedFormat = runCli(
      ["evidence", "import", "report.xml", "--format", "unknown"],
      directory,
    );
    const trusted = runCli(
      ["evidence", "import", "report.xml", "--format", "junit", "--trusted"],
      directory,
    );

    for (const result of [
      missingSubcommand,
      missingReport,
      missingFormat,
      missingFormatValue,
      unsupportedFormat,
      trusted,
    ]) {
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("Usage:");
    }
  });

  it("imports, reuses, validates metadata, and verifies artifact integrity", async () => {
    const directory = await createProject();

    const imported = runCli(
      ["evidence", "import", "report.xml", "--format", "junit", "--run-id", "run-cli"],
      directory,
    );
    const reused = runCli(
      ["evidence", "import", "report.xml", "--format", "junit", "--run-id", "run-cli"],
      directory,
    );
    const verified = runCli(["evidence", "verify"], directory);
    const manifestPath = join(directory, ".ai-qa", "evidence.yaml");
    const manifest = await readFile(manifestPath, "utf8");
    const relativePath = manifest.match(/relativePath: ([^\n]+)/)?.[1]?.trim();
    await writeFile(
      manifestPath,
      manifest.replace(/schemaVersion: [^\n]+/, "schemaVersion: 999"),
      "utf8",
    );
    const invalidMetadata = runCli(["validate"], directory);
    await writeFile(manifestPath, manifest, "utf8");

    expect(relativePath).toBeTruthy();
    await writeFile(
      join(directory, ".ai-qa", "evidence", relativePath ?? ""),
      "corrupt artifact",
      "utf8",
    );
    const validatedMetadata = runCli(["validate"], directory);
    const failedDoctor = runCli(["doctor"], directory);
    const failedVerify = runCli(["evidence", "verify"], directory);

    expect(imported.status).toBe(0);
    expect(imported.stdout).toContain("Evidence imported:");
    expect(imported.stdout).toContain("run=run-cli");
    expect(imported.stdout).toContain("evidence=");
    expect(imported.stdout).not.toContain("Score");
    expect(imported.stderr).toBe("");
    expect(reused.status).toBe(0);
    expect(reused.stdout).toContain("reused");
    expect(verified.status).toBe(0);
    expect(verified.stdout).toContain("Evidence verify passed");
    expect(invalidMetadata.status).toBe(1);
    expect(invalidMetadata.stderr).toContain("EVIDENCE_SCHEMA_UNSUPPORTED");
    expect(validatedMetadata.status).toBe(0);
    expect(failedDoctor.status).toBe(1);
    expect(failedDoctor.stderr).toContain("EVIDENCE_ARTIFACT_");
    expect(failedVerify.status).toBe(1);
    expect(failedVerify.stderr).toContain("EVIDENCE_ARTIFACT_");
  });
});
