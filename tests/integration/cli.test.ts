import { fileURLToPath } from "node:url";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

const tsxEntry = fileURLToPath(new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url));
const cliEntry = fileURLToPath(new URL("../../apps/cli/src/main.ts", import.meta.url));
const temporaryDirectories: string[] = [];

function runCli(args: string[], cwd: string) {
  return spawnSync(process.execPath, [tsxEntry, "--conditions=development", cliEntry, ...args], {
    cwd,
    encoding: "utf8",
  });
}

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "qaw-cli-"));
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

describe("qaw CLI", () => {
  it("initializes a project through the real command entry point", async () => {
    const directory = await createTemporaryDirectory();
    const result = runCli(["init", "--name", "Checkout Service"], directory);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Initialized project at");
    expect(result.stderr).toBe("");
    await expect(readFile(join(directory, ".ai-qa", "project.yaml"), "utf8")).resolves.toContain(
      "name: Checkout Service",
    );
  });

  it("validates an initialized project through the real command entry point", async () => {
    const directory = await createTemporaryDirectory();
    const initialized = runCli(["init"], directory);
    const result = runCli(["validate"], directory);

    expect(initialized.status).toBe(0);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Project is valid:");
    expect(result.stderr).toBe("");
  });

  it("refuses to overwrite an existing project file", async () => {
    const directory = await createTemporaryDirectory();
    const first = runCli(["init", "--name", "Original Project"], directory);
    const projectPath = join(directory, ".ai-qa", "project.yaml");
    const before = await readFile(projectPath, "utf8");
    const second = runCli(["init", "--name", "Replacement Project"], directory);
    const after = await readFile(projectPath, "utf8");

    expect(first.status).toBe(0);
    expect(second.status).toBe(1);
    expect(second.stderr).toContain("PROJECT_FILE_EXISTS");
    expect(after).toBe(before);
  });

  it("reports a missing project file", async () => {
    const directory = await createTemporaryDirectory();
    const result = runCli(["validate"], directory);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("PROJECT_FILE_MISSING");
    expect(result.stdout).toBe("");
  });

  it("rejects unknown options with usage output", async () => {
    const directory = await createTemporaryDirectory();
    const result = runCli(["init", "--unknown"], directory);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Usage:");
  });
});
