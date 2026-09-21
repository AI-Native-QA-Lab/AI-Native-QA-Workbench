import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const domainSourceRoot = fileURLToPath(new URL("../../packages/domain/src", import.meta.url));
const forbiddenDomainTokens = [".ai-qa", "better-sqlite3", "sqlite", "fastify", "react"];

async function collectSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(entryPath);
    }
  }

  return files;
}

describe("v0.1 MVP architecture boundaries", () => {
  it("keeps the Domain source independent from quality storage and UI infrastructure", async () => {
    const files = await collectSourceFiles(domainSourceRoot);
    const violations: string[] = [];

    for (const filePath of files) {
      const source = await readFile(filePath, "utf8");
      for (const token of forbiddenDomainTokens) {
        if (source.toLowerCase().includes(token)) {
          violations.push(`${filePath}: ${token}`);
        }
      }
    }

    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
});
