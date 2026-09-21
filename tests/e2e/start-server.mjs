/* global process */

import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const templateDirectory = resolve(process.argv[2]);
const temporaryRoot = await mkdtemp(join(tmpdir(), "qaw-golden-path-"));
await cp(join(templateDirectory, ".ai-qa"), join(temporaryRoot, ".ai-qa"), { recursive: true });

const server = spawn("pnpm", ["--filter", "@ai-native-qa-workbench/server", "dev"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    QAW_ROOT_DIRECTORY: temporaryRoot,
    QAW_PORT: "4317",
  },
  stdio: "inherit",
});

let stopping = false;
async function stop(code) {
  if (stopping) return;
  stopping = true;
  if (!server.killed) server.kill("SIGTERM");
  await rm(temporaryRoot, { recursive: true, force: true });
  process.exit(code);
}

process.on("SIGINT", () => void stop(130));
process.on("SIGTERM", () => void stop(143));
server.on("exit", (code) => void stop(code ?? 1));
