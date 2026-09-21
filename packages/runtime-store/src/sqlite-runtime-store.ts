import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";

import { migrateRuntimeDatabase } from "./schema.js";

export type RuntimeLocale = "en" | "zh-CN";

export interface RuntimeSession {
  id: string;
  projectRoot: string;
  uiLocale: RuntimeLocale;
  createdAt: string;
}

export interface RuntimeRun {
  id: string;
  sessionId: string;
  kind: string;
  status: string;
  createdAt: string;
}

export interface RuntimeStep {
  id: string;
  runId: string;
  kind: string;
  status: string;
  payload: unknown;
  createdAt: string;
}

export interface RuntimeToolRun {
  id: string;
  runId: string;
  toolName: string;
  permission: string;
  status: string;
  createdAt: string;
}

export interface RuntimeApproval {
  id: string;
  runId: string;
  action: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

export interface RuntimeWorkflowRun {
  id: string;
  runId: string;
  kind: string;
  status: string;
  createdAt: string;
}

export interface RuntimeStore {
  createSession(input: { projectRoot: string; uiLocale: RuntimeLocale }): string;
  appendRun(input: { sessionId: string; kind: string; status?: string }): string;
  appendStep(input: { runId: string; kind: string; status: string; payload: unknown }): string;
  appendToolRun(input: {
    runId: string;
    toolName: string;
    permission: string;
    status: string;
  }): string;
  appendApproval(input: {
    runId: string;
    action: string;
    status: RuntimeApproval["status"];
  }): string;
  appendWorkflowRun(input: { runId: string; kind: string; status: string }): string;
  getMigrationVersion(): number;
  getSession(id: string): RuntimeSession | undefined;
  listRuns(sessionId: string): RuntimeRun[];
  listSteps(runId: string): RuntimeStep[];
  listToolRuns(runId: string): RuntimeToolRun[];
  listApprovals(runId: string): RuntimeApproval[];
  listWorkflowRuns(runId: string): RuntimeWorkflowRun[];
  close(): void;
}

function parsePayload(payload: string): unknown {
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return undefined;
  }
}

export class SqliteRuntimeStore implements RuntimeStore {
  private readonly database: Database.Database;

  constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new Database(databasePath);
    migrateRuntimeDatabase(this.database);
  }

  createSession(input: { projectRoot: string; uiLocale: RuntimeLocale }): string {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    this.database
      .prepare(
        "INSERT INTO agent_sessions(id, project_root, ui_locale, created_at) VALUES (?, ?, ?, ?)",
      )
      .run(id, input.projectRoot, input.uiLocale, createdAt);
    return id;
  }

  appendRun(input: { sessionId: string; kind: string; status?: string }): string {
    const id = randomUUID();
    this.database
      .prepare(
        "INSERT INTO agent_runs(id, session_id, kind, status, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(id, input.sessionId, input.kind, input.status ?? "running", new Date().toISOString());
    return id;
  }

  appendStep(input: { runId: string; kind: string; status: string; payload: unknown }): string {
    const id = randomUUID();
    this.database
      .prepare(
        "INSERT INTO agent_steps(id, run_id, kind, status, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        input.runId,
        input.kind,
        input.status,
        JSON.stringify(input.payload ?? null),
        new Date().toISOString(),
      );
    return id;
  }

  appendToolRun(input: {
    runId: string;
    toolName: string;
    permission: string;
    status: string;
  }): string {
    const id = randomUUID();
    this.database
      .prepare(
        "INSERT INTO tool_runs(id, run_id, tool_name, permission, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        input.runId,
        input.toolName,
        input.permission,
        input.status,
        new Date().toISOString(),
      );
    return id;
  }

  appendApproval(input: {
    runId: string;
    action: string;
    status: RuntimeApproval["status"];
  }): string {
    const id = randomUUID();
    this.database
      .prepare(
        "INSERT INTO approval_requests(id, run_id, action, status, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(id, input.runId, input.action, input.status, new Date().toISOString());
    return id;
  }

  appendWorkflowRun(input: { runId: string; kind: string; status: string }): string {
    const id = randomUUID();
    this.database
      .prepare(
        "INSERT INTO workflow_runs(id, run_id, kind, status, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(id, input.runId, input.kind, input.status, new Date().toISOString());
    return id;
  }

  getMigrationVersion(): number {
    const row = this.database
      .prepare("SELECT MAX(version) AS version FROM schema_migrations")
      .get() as { version?: number | null } | undefined;
    return row?.version ?? 0;
  }

  getSession(id: string): RuntimeSession | undefined {
    const row = this.database
      .prepare("SELECT id, project_root, ui_locale, created_at FROM agent_sessions WHERE id = ?")
      .get(id) as
      | { id: string; project_root: string; ui_locale: RuntimeLocale; created_at: string }
      | undefined;
    return row
      ? {
          id: row.id,
          projectRoot: row.project_root,
          uiLocale: row.ui_locale,
          createdAt: row.created_at,
        }
      : undefined;
  }

  listRuns(sessionId: string): RuntimeRun[] {
    const rows = this.database
      .prepare(
        "SELECT id, session_id, kind, status, created_at FROM agent_runs WHERE session_id = ? ORDER BY created_at, id",
      )
      .all(sessionId) as Array<{
      id: string;
      session_id: string;
      kind: string;
      status: string;
      created_at: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      kind: row.kind,
      status: row.status,
      createdAt: row.created_at,
    }));
  }

  listSteps(runId: string): RuntimeStep[] {
    const rows = this.database
      .prepare(
        "SELECT id, run_id, kind, status, payload_json, created_at FROM agent_steps WHERE run_id = ? ORDER BY created_at, id",
      )
      .all(runId) as Array<{
      id: string;
      run_id: string;
      kind: string;
      status: string;
      payload_json: string;
      created_at: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      runId: row.run_id,
      kind: row.kind,
      status: row.status,
      payload: parsePayload(row.payload_json),
      createdAt: row.created_at,
    }));
  }

  listToolRuns(runId: string): RuntimeToolRun[] {
    const rows = this.database
      .prepare(
        "SELECT id, run_id, tool_name, permission, status, created_at FROM tool_runs WHERE run_id = ? ORDER BY created_at, id",
      )
      .all(runId) as Array<{
      id: string;
      run_id: string;
      tool_name: string;
      permission: string;
      status: string;
      created_at: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      runId: row.run_id,
      toolName: row.tool_name,
      permission: row.permission,
      status: row.status,
      createdAt: row.created_at,
    }));
  }

  listApprovals(runId: string): RuntimeApproval[] {
    const rows = this.database
      .prepare(
        "SELECT id, run_id, action, status, created_at FROM approval_requests WHERE run_id = ? ORDER BY created_at, id",
      )
      .all(runId) as Array<{
      id: string;
      run_id: string;
      action: string;
      status: RuntimeApproval["status"];
      created_at: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      runId: row.run_id,
      action: row.action,
      status: row.status,
      createdAt: row.created_at,
    }));
  }

  listWorkflowRuns(runId: string): RuntimeWorkflowRun[] {
    const rows = this.database
      .prepare(
        "SELECT id, run_id, kind, status, created_at FROM workflow_runs WHERE run_id = ? ORDER BY created_at, id",
      )
      .all(runId) as Array<{
      id: string;
      run_id: string;
      kind: string;
      status: string;
      created_at: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      runId: row.run_id,
      kind: row.kind,
      status: row.status,
      createdAt: row.created_at,
    }));
  }

  close(): void {
    if (this.database.open) this.database.close();
  }
}
