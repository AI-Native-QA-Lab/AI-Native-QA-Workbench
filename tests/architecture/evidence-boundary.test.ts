import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const evidenceSourceRoot = fileURLToPath(new URL("../../packages/evidence/src", import.meta.url));

const forbiddenImportFragments = [
  "node:fs",
  "node:child_process",
  "node:dns",
  "node:http",
  "node:https",
  "node:net",
  "node:tls",
  "node:worker_threads",
  "fastify",
  "react",
  "openai",
  "anthropic",
  "deepseek",
  "gemini",
  "mcp",
  "github",
  "jira",
  "dsh",
  "playwright",
  "axios",
  "undici",
];

interface BoundaryViolation {
  filePath: string;
  detail: string;
}

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

function findImportedSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const importPatterns = [/from\s+["']([^"']+)["']/g, /import\s*(?:[(]\s*)?["']([^"']+)["']/g];

  for (const pattern of importPatterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1] !== undefined) specifiers.push(match[1]);
    }
  }

  return specifiers;
}

async function findViolations(): Promise<BoundaryViolation[]> {
  const files = await collectTypeScriptFiles(evidenceSourceRoot);
  const violations: BoundaryViolation[] = [];

  for (const filePath of files) {
    const source = await readFile(filePath, "utf8");
    for (const specifier of findImportedSpecifiers(source)) {
      const normalized = specifier.toLowerCase();
      if (
        !normalized.startsWith(".") &&
        forbiddenImportFragments.some((fragment) => normalized.includes(fragment))
      ) {
        violations.push({ filePath, detail: "forbidden import: " + specifier });
      }
    }
    if (source.includes(".ai-qa") || source.includes("fetch(")) {
      violations.push({ filePath, detail: "direct workspace or network access" });
    }
  }

  return violations;
}

describe("Evidence adapter architecture boundary", () => {
  it("keeps parsers independent from filesystem, network, providers, and integrations", async () => {
    const violations = await findViolations();

    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
});
