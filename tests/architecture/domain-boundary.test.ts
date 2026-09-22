import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const domainSourceRoot = fileURLToPath(new URL("../../packages/domain/src", import.meta.url));

const forbiddenImports = [
  "node:fs",
  "node:child_process",
  "node:dns",
  "node:http",
  "node:net",
  "node:sqlite",
  "node:tls",
  "node:worker_threads",
  "yaml",
  "zod",
  "fastify",
  "@fastify",
  "react",
  "openai",
  "anthropic",
  "deepseek",
  "gemini",
  "mcp",
  "github",
  "jira",
  "dsh",
  "vitest",
  "playwright",
  "@playwright",
];

interface ImportViolation {
  filePath: string;
  specifier: string;
}

async function collectTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTypeScriptFiles(entryPath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(entryPath);
    }
  }

  return files;
}

function isForbiddenSpecifier(specifier: string): boolean {
  return forbiddenImports.some(
    (forbiddenImport) =>
      specifier === forbiddenImport || specifier.startsWith(`${forbiddenImport}/`),
  );
}

function findImportedSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const importPatterns = [/\bfrom\s+["']([^"']+)["']/g, /\bimport\s*(?:\(\s*)?["']([^"']+)["']/g];

  for (const pattern of importPatterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1] !== undefined) {
        specifiers.push(match[1]);
      }
    }
  }

  return specifiers;
}

async function findImportViolations(): Promise<ImportViolation[]> {
  const files = await collectTypeScriptFiles(domainSourceRoot);
  const violations: ImportViolation[] = [];

  for (const filePath of files) {
    const source = await readFile(filePath, "utf8");
    for (const specifier of findImportedSpecifiers(source)) {
      if (isForbiddenSpecifier(specifier)) {
        violations.push({ filePath, specifier });
      }
    }
  }

  return violations;
}

describe("domain architecture boundary", () => {
  it("includes the Evidence domain module in the boundary scan", async () => {
    const files = await collectTypeScriptFiles(domainSourceRoot);

    expect(files).toContain(join(domainSourceRoot, "evidence-domain.ts"));
  });

  it("does not import infrastructure, provider, or test dependencies", async () => {
    const violations = await findImportViolations();

    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
});
