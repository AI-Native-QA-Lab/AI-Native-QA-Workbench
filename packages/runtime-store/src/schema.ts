import type Database from "better-sqlite3";

export const RUNTIME_MIGRATION_VERSION = 2 as const;

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
  if (currentVersion > RUNTIME_MIGRATION_VERSION) {
    throw new Error(`Unsupported runtime migration version: ${currentVersion}`);
  }

  if (currentVersion === 0) {
    const applyMigration1 = database.transaction(() => {
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
    applyMigration1();
  }

  if (currentVersion < 2) {
    const applyMigration2 = database.transaction(() => {
      database.exec(`
        ALTER TABLE workflow_runs ADD COLUMN trigger_event_id TEXT;
        ALTER TABLE workflow_runs ADD COLUMN workflow_kind TEXT;
        ALTER TABLE workflow_runs ADD COLUMN error TEXT;
        ALTER TABLE workflow_runs ADD COLUMN completed_at TEXT;

        CREATE TABLE domain_events (
          id TEXT PRIMARY KEY,
          project_root TEXT NOT NULL,
          event_json TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('pending', 'processed', 'failed')),
          received_at TEXT NOT NULL,
          processed_at TEXT,
          failed_at TEXT,
          error TEXT
        );

        CREATE INDEX domain_events_project_status_idx
          ON domain_events(project_root, status, received_at, id);

        CREATE TABLE workflow_steps (
          id TEXT PRIMARY KEY,
          workflow_run_id TEXT NOT NULL REFERENCES workflow_runs(id),
          step_key TEXT NOT NULL,
          status TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE(workflow_run_id, step_key)
        );

        CREATE UNIQUE INDEX workflow_runs_trigger_kind_idx
          ON workflow_runs(trigger_event_id, workflow_kind)
          WHERE trigger_event_id IS NOT NULL AND workflow_kind IS NOT NULL;

        INSERT INTO schema_migrations(version, applied_at)
        VALUES (2, CURRENT_TIMESTAMP);
      `);
    });
    applyMigration2();
  }
}
