import { readFile } from "node:fs/promises";
import { glob } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const runtimeSourceDirectory = fileURLToPath(
  new URL("../../packages/runtime-store/src", import.meta.url),
);

describe("runtime store architecture boundary", () => {
  it("does not model project-quality entities or read the quality source of truth", async () => {
    const files: string[] = [];
    for await (const file of glob("**/*.ts", { cwd: runtimeSourceDirectory })) {
      files.push(file);
    }
    const source = await Promise.all(
      files.map(async (file) => readFile(`${runtimeSourceDirectory}/${file}`, "utf8")),
    );
    const combined = source.join("\n");

    expect(combined).not.toMatch(
      /quality\.yaml|requirements|acceptanceCriteria|qualityRisks|testObligations|testCases|traceLinks/,
    );
    expect(combined).toMatch(
      /agent_sessions|agent_runs|agent_steps|tool_runs|approval_requests|workflow_runs/,
    );
  });
});
