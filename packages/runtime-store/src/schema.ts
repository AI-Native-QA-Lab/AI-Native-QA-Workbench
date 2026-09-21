import type Database from "better-sqlite3";

export const RUNTIME_MIGRATION_VERSION = 1 as const;

export function migrateRuntimeDatabase(database: Database.Database): void {
  database.pragma("foreign_keys = ON");
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const current = database
    .prepare("SELECT MAX(version) AS version FROM schema_migrations")
    .get() as { version?: number | null } | undefined;
  const currentVersion = current?.version ?? 0;
  if (currentVersion >= RUNTIME_MIGRATION_VERSION) return;
  if (currentVersion !== 0)
    throw new Error(`Unsupported runtime migration version: ${currentVersion}`);

  const applyMigration = database.transaction(() => {
    database.exec(`
      CREATE TABLE agent_sessions (
        id TEXT PRIMARY KEY,
        project_root TEXT NOT NULL,
        ui_locale TEXT NOT NULL CHECK (ui_locale IN ('en', 'zh-CN')),
        created_at TEXT NOT NULL
      );

      CREATE TABLE agent_runs (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES agent_sessions(id),
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE agent_steps (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES agent_runs(id),
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE tool_runs (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES agent_runs(id),
        tool_name TEXT NOT NULL,
        permission TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE approval_requests (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES agent_runs(id),
        action TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
        created_at TEXT NOT NULL
      );

      CREATE TABLE workflow_runs (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES agent_runs(id),
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      INSERT INTO schema_migrations(version, applied_at)
      VALUES (1, CURRENT_TIMESTAMP);
    `);
  });
  applyMigration();
}
