import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";

import type { DomainEvent } from "@ai-native-qa-workbench/domain";

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
  triggerEventId?: string;
  workflowKind?: string;
  error?: string;
  completedAt?: string;
}

export type RuntimeDomainEventStatus = "pending" | "processed" | "failed";
export type RuntimeWorkflowStatus = "pending" | "running" | "completed" | "failed";

export interface RuntimeWorkflowStatusRecord {
  eventId: string;
  eventType: DomainEvent["type"];
  status: RuntimeWorkflowStatus;
  workflowRunId?: string;
  error?: string;
  receivedAt: string;
}

export interface RuntimeDomainEventRecord {
  id: string;
  projectRoot: string;
  event: DomainEvent;
  status: RuntimeDomainEventStatus;
  receivedAt: string;
  processedAt?: string;
  failedAt?: string;
  error?: string;
}

export interface RuntimeWorkflowStep {
  id: string;
  workflowRunId: string;
  key: string;
  status: string;
  payload: unknown;
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
  appendWorkflowRun(input: {
    runId: string;
    kind: string;
    status: string;
    triggerEventId?: string;
    workflowKind?: string;
  }): string;
  appendDomainEvent(event: DomainEvent, projectRoot: string): string;
  getDomainEvent(id: string): RuntimeDomainEventRecord | undefined;
  listPendingDomainEvents(projectRoot: string): RuntimeDomainEventRecord[];
  listWorkflowStatuses(projectRoot: string): RuntimeWorkflowStatusRecord[];
  markDomainEventProcessed(eventId: string, processedAt: string): void;
  markDomainEventFailed(eventId: string, error: string, failedAt: string): void;
  findWorkflowRun(input: { triggerEventId: string; kind: string }): RuntimeWorkflowRun | undefined;
  appendWorkflowStep(input: {
    workflowRunId: string;
    key: string;
    status: string;
    payload: unknown;
  }): string;
  listWorkflowSteps(workflowRunId: string): RuntimeWorkflowStep[];
  updateWorkflowRun(
    id: string,
    input: { status: string; error?: string; completedAt?: string },
  ): void;
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

interface WorkflowRunRow {
  id: string;
  run_id: string;
  kind: string;
  status: string;
  created_at: string;
  trigger_event_id?: string | null;
  workflow_kind?: string | null;
  error?: string | null;
  completed_at?: string | null;
}

interface WorkflowStatusRow {
  event_id: string;
  event_json: string;
  event_status: RuntimeDomainEventStatus;
  received_at: string;
  event_error?: string | null;
  workflow_run_id?: string | null;
  workflow_status?: string | null;
  workflow_error?: string | null;
}

const workflowTriggerEventTypes: ReadonlySet<DomainEvent["type"]> = new Set([
  "quality.assessment.requested",
  "quality.proposal.applied",
  "evidence.imported",
]);

function isRuntimeWorkflowStatus(value: string | null | undefined): value is RuntimeWorkflowStatus {
  return value === "pending" || value === "running" || value === "completed" || value === "failed";
}

function statusFromDomainEvent(status: RuntimeDomainEventStatus): RuntimeWorkflowStatus {
  if (status === "pending") return "pending";
  if (status === "failed") return "failed";
  return "completed";
}

function mapWorkflowRun(row: WorkflowRunRow): RuntimeWorkflowRun {
  return {
    id: row.id,
    runId: row.run_id,
    kind: row.kind,
    status: row.status,
    createdAt: row.created_at,
    ...(row.trigger_event_id ? { triggerEventId: row.trigger_event_id } : {}),
    ...(row.workflow_kind ? { workflowKind: row.workflow_kind } : {}),
    ...(row.error ? { error: row.error } : {}),
    ...(row.completed_at ? { completedAt: row.completed_at } : {}),
  };
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

  appendWorkflowRun(input: {
    runId: string;
    kind: string;
    status: string;
    triggerEventId?: string;
    workflowKind?: string;
  }): string {
    const id = randomUUID();
    const workflowKind = input.workflowKind ?? (input.triggerEventId ? input.kind : null);
    const triggerEventId = input.triggerEventId ?? null;
    this.database
      .prepare(
        `INSERT INTO workflow_runs(
          id, run_id, kind, status, created_at, trigger_event_id, workflow_kind
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT DO NOTHING`,
      )
      .run(
        id,
        input.runId,
        input.kind,
        input.status,
        new Date().toISOString(),
        triggerEventId,
        workflowKind,
      );

    if (input.triggerEventId && workflowKind) {
      const existing = this.database
        .prepare("SELECT id FROM workflow_runs WHERE trigger_event_id = ? AND workflow_kind = ?")
        .get(input.triggerEventId, workflowKind) as { id: string } | undefined;
      return existing?.id ?? id;
    }
    return id;
  }

  appendDomainEvent(event: DomainEvent, projectRoot: string): string {
    this.database
      .prepare(
        `INSERT OR IGNORE INTO domain_events(
          id, project_root, event_json, status, received_at
        ) VALUES (?, ?, ?, 'pending', ?)`,
      )
      .run(event.id, projectRoot, JSON.stringify(event), new Date().toISOString());
    return event.id;
  }

  getDomainEvent(id: string): RuntimeDomainEventRecord | undefined {
    const row = this.database
      .prepare(
        `SELECT id, project_root, event_json, status, received_at, processed_at, failed_at, error
         FROM domain_events WHERE id = ?`,
      )
      .get(id) as
      | {
          id: string;
          project_root: string;
          event_json: string;
          status: RuntimeDomainEventStatus;
          received_at: string;
          processed_at?: string | null;
          failed_at?: string | null;
          error?: string | null;
        }
      | undefined;
    if (!row) return undefined;
    return {
      id: row.id,
      projectRoot: row.project_root,
      event: JSON.parse(row.event_json) as DomainEvent,
      status: row.status,
      receivedAt: row.received_at,
      ...(row.processed_at ? { processedAt: row.processed_at } : {}),
      ...(row.failed_at ? { failedAt: row.failed_at } : {}),
      ...(row.error ? { error: row.error } : {}),
    };
  }

  listPendingDomainEvents(projectRoot: string): RuntimeDomainEventRecord[] {
    const rows = this.database
      .prepare(
        `SELECT id FROM domain_events
         WHERE project_root = ? AND status IN ('pending', 'failed')
         ORDER BY received_at, id`,
      )
      .all(projectRoot) as Array<{ id: string }>;
    return rows
      .map((row) => this.getDomainEvent(row.id))
      .filter((record): record is RuntimeDomainEventRecord => record !== undefined);
  }

  listWorkflowStatuses(projectRoot: string): RuntimeWorkflowStatusRecord[] {
    const rows = this.database
      .prepare(
        `SELECT
           de.id AS event_id,
           de.event_json,
           de.status AS event_status,
           de.received_at,
           de.error AS event_error,
           wr.id AS workflow_run_id,
           wr.status AS workflow_status,
           wr.error AS workflow_error
         FROM domain_events AS de
         LEFT JOIN workflow_runs AS wr
           ON wr.trigger_event_id = de.id
          AND wr.workflow_kind = 'quality-engineering'
         WHERE de.project_root = ?
         ORDER BY de.received_at DESC, de.id DESC`,
      )
      .all(projectRoot) as WorkflowStatusRow[];

    return rows.flatMap((row) => {
      const event = parsePayload(row.event_json);
      if (
        event === null ||
        typeof event !== "object" ||
        Array.isArray(event) ||
        !workflowTriggerEventTypes.has((event as DomainEvent).type)
      ) {
        return [];
      }
      const eventType = (event as DomainEvent).type;
      const status = isRuntimeWorkflowStatus(row.workflow_status)
        ? row.workflow_status
        : statusFromDomainEvent(row.event_status);
      const error = row.workflow_error ?? row.event_error;
      return [
        {
          eventId: row.event_id,
          eventType,
          status,
          ...(row.workflow_run_id ? { workflowRunId: row.workflow_run_id } : {}),
          ...(error ? { error } : {}),
          receivedAt: row.received_at,
        },
      ];
    });
  }

  markDomainEventProcessed(eventId: string, processedAt: string): void {
    this.database
      .prepare(
        `UPDATE domain_events
         SET status = 'processed', processed_at = ?, failed_at = NULL, error = NULL
         WHERE id = ?`,
      )
      .run(processedAt, eventId);
  }

  markDomainEventFailed(eventId: string, error: string, failedAt: string): void {
    this.database
      .prepare(
        `UPDATE domain_events
         SET status = 'failed', failed_at = ?, error = ?, processed_at = NULL
         WHERE id = ?`,
      )
      .run(failedAt, error, eventId);
  }

  findWorkflowRun(input: { triggerEventId: string; kind: string }): RuntimeWorkflowRun | undefined {
    const row = this.database
      .prepare(
        `SELECT id, run_id, kind, status, created_at, trigger_event_id, workflow_kind, error, completed_at
         FROM workflow_runs
         WHERE trigger_event_id = ? AND workflow_kind = ?
         ORDER BY created_at, id LIMIT 1`,
      )
      .get(input.triggerEventId, input.kind) as WorkflowRunRow | undefined;
    return row ? mapWorkflowRun(row) : undefined;
  }

  appendWorkflowStep(input: {
    workflowRunId: string;
    key: string;
    status: string;
    payload: unknown;
  }): string {
    const id = randomUUID();
    this.database
      .prepare(
        `INSERT INTO workflow_steps(
          id, workflow_run_id, step_key, status, payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(workflow_run_id, step_key) DO NOTHING`,
      )
      .run(
        id,
        input.workflowRunId,
        input.key,
        input.status,
        JSON.stringify(input.payload ?? null),
        new Date().toISOString(),
      );
    const existing = this.database
      .prepare("SELECT id FROM workflow_steps WHERE workflow_run_id = ? AND step_key = ?")
      .get(input.workflowRunId, input.key) as { id: string } | undefined;
    return existing?.id ?? id;
  }

  listWorkflowSteps(workflowRunId: string): RuntimeWorkflowStep[] {
    const rows = this.database
      .prepare(
        `SELECT id, workflow_run_id, step_key, status, payload_json, created_at
         FROM workflow_steps WHERE workflow_run_id = ? ORDER BY rowid`,
      )
      .all(workflowRunId) as Array<{
      id: string;
      workflow_run_id: string;
      step_key: string;
      status: string;
      payload_json: string;
      created_at: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      workflowRunId: row.workflow_run_id,
      key: row.step_key,
      status: row.status,
      payload: parsePayload(row.payload_json),
      createdAt: row.created_at,
    }));
  }

  updateWorkflowRun(
    id: string,
    input: { status: string; error?: string; completedAt?: string },
  ): void {
    if (input.status === "completed") {
      this.database
        .prepare(
          `UPDATE workflow_runs
           SET status = ?, error = NULL, completed_at = COALESCE(?, completed_at)
           WHERE id = ?`,
        )
        .run(input.status, input.completedAt ?? null, id);
      return;
    }
    this.database
      .prepare(
        `UPDATE workflow_runs
         SET status = ?, error = COALESCE(?, error), completed_at = COALESCE(?, completed_at)
         WHERE id = ?`,
      )
      .run(input.status, input.error ?? null, input.completedAt ?? null, id);
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
        `SELECT id, run_id, kind, status, created_at, trigger_event_id, workflow_kind, error, completed_at
         FROM workflow_runs WHERE run_id = ? ORDER BY created_at, id`,
      )
      .all(runId) as Array<{
      id: string;
      run_id: string;
      kind: string;
      status: string;
      created_at: string;
      trigger_event_id?: string | null;
      workflow_kind?: string | null;
      error?: string | null;
      completed_at?: string | null;
    }>;
    return rows.map(mapWorkflowRun);
  }

  close(): void {
    if (this.database.open) this.database.close();
  }
}
