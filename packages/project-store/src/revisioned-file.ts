import { createHash, randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";

const writeTails = new Map<string, Promise<void>>();

export function revisionFor(contents: Uint8Array): string {
  return createHash("sha256").update(contents).digest("hex");
}

export async function currentRevision(path: string): Promise<string | null> {
  try {
    return revisionFor(await readFile(path));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

async function withFileWriteLock<T>(path: string, operation: () => Promise<T>): Promise<T> {
  const previous = writeTails.get(path) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  writeTails.set(path, queued);

  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (writeTails.get(path) === queued) writeTails.delete(path);
  }
}

export async function writeRevisionedFile(
  path: string,
  contents: string,
  expectedRevision: string | null,
): Promise<{ written: true; revision: string } | { written: false }> {
  return withFileWriteLock(path, async () => {
    const current = await currentRevision(path);
    if (current !== expectedRevision) return { written: false };

    const temporaryPath = `${path}.${randomUUID()}.tmp`;
    let renamed = false;
    try {
      await writeFile(temporaryPath, contents, "utf8");
      const beforeRename = await currentRevision(path);
      if (beforeRename !== expectedRevision) return { written: false };
      await rename(temporaryPath, path);
      renamed = true;
    } finally {
      if (!renamed) await rm(temporaryPath, { force: true }).catch(() => undefined);
    }

    return {
      written: true,
      revision: revisionFor(Buffer.from(contents, "utf8")),
    };
  });
}
