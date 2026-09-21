import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const runtimeSourceDirectory = fileURLToPath(
  new URL("../../packages/runtime-store/src", import.meta.url),
);

async function collectTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTypeScriptFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(entryPath);
    }
  }

  return files;
}

describe("runtime store architecture boundary", () => {
  it("does not model project-quality entities or read the quality source of truth", async () => {
    const files = await collectTypeScriptFiles(runtimeSourceDirectory);
    const source = await Promise.all(files.map(async (file) => readFile(file, "utf8")));
    const combined = source.join("\n");

    expect(combined).not.toMatch(
      /quality\.yaml|requirements|acceptanceCriteria|qualityRisks|testObligations|testCases|traceLinks/,
    );
    expect(combined).toMatch(
      /agent_sessions|agent_runs|agent_steps|tool_runs|approval_requests|workflow_runs/,
    );
  });
});
