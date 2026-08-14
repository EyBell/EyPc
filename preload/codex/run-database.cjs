'use strict'

/**
 * Action run history: SQLite schema, migration, retention and the in-memory
 * mirror the runner window is projected from.
 *
 * The first block under RAW-169 that moves *state* rather than only functions.
 * The entry used to hold `codexActionRunDatabase`, its ready flag and the run
 * memory as three module-level `let`s written from seven places; they now live
 * here and the entry reaches them through a named operation. That is the point
 * of the exercise — a split that leaves the state behind has moved code without
 * moving responsibility.
 *
 * `utools` is injected for the same reason `process` was in node-runtime: read
 * from the global it silently resolves to a different object under a sandbox,
 * with identical source.
 */

const CODEX_RUN_DATABASE_REVISION = 'codex-run-database-v1'
const CODEX_RUN_MEMORY_LIMIT = 200
const CODEX_RUN_RETAINED_BYTES = 100 * 1024 * 1024
const CODEX_RUN_MAX_AGE_MS = 30 * 24 * 60 * 60_000

function createCodexRunDatabase(dependencies = {}) {
  const fs = dependencies.fs || require('node:fs')
  const path = dependencies.path || require('node:path')
  const os = dependencies.os || require('node:os')
  const host = dependencies.utools || (typeof globalThis !== 'undefined' ? globalThis.utools : null)

  let codexActionRunDatabase = null
  let codexActionRunDatabaseReady = false
  let codexActionRunMemory = []

  function codexActionRunDatabasePath() {
    let base = ''
    try { base = host?.getPath?.('userData') || '' } catch {}
    if (!base) base = path.join(os.homedir(), '.eypc')
    fs.mkdirSync(base, { recursive: true })
    return path.join(base, 'codex-action-runs.sqlite')
  }

  function enforceCodexActionRunRetention(database) {
    try {
      const rows = database.prepare('SELECT run_id, log_bytes FROM action_runs ORDER BY started_at DESC').all()
      let retainedBytes = 0
      const retained = new Set()
      for (const [index, row] of rows.entries()) {
        const bytes = Math.max(0, Number(row.log_bytes) || 0)
        if (index < CODEX_RUN_MEMORY_LIMIT && retainedBytes + bytes <= CODEX_RUN_RETAINED_BYTES) {
          retained.add(row.run_id)
          retainedBytes += bytes
        }
      }
      const removed = rows.filter((row) => !retained.has(row.run_id)).map((row) => row.run_id)
      const remove = database.prepare('DELETE FROM action_runs WHERE run_id = ?')
      for (const runId of removed) remove.run(runId)
      if (removed.length) codexActionRunMemory = codexActionRunMemory.filter((run) => retained.has(run.runId))
    } catch {}
  }

  function ensureCodexActionRunDatabase() {
    if (codexActionRunDatabaseReady) return codexActionRunDatabase
    codexActionRunDatabaseReady = true
    try {
      const { DatabaseSync } = require('node:sqlite')
      const database = new DatabaseSync(codexActionRunDatabasePath())
      database.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS action_runs (
        run_id TEXT PRIMARY KEY,
        lane_id TEXT NOT NULL,
        project_key TEXT NOT NULL,
        project_name TEXT NOT NULL,
        environment_id TEXT NOT NULL,
        environment_name TEXT NOT NULL,
        action_id TEXT NOT NULL,
        action_name TEXT NOT NULL,
        risk TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        exit_code INTEGER,
        archived_at INTEGER,
        log_text TEXT NOT NULL DEFAULT '',
        log_bytes INTEGER NOT NULL DEFAULT 0,
        log_lines INTEGER NOT NULL DEFAULT 0,
        message TEXT NOT NULL DEFAULT '',
        runtime_mode TEXT,
        runtime_source TEXT,
        runtime_version TEXT,
        runtime_label TEXT
      );
      CREATE INDEX IF NOT EXISTS action_runs_started_at ON action_runs(started_at DESC);
    `)
      const columns = new Set(database.prepare('PRAGMA table_info(action_runs)').all().map((column) => column.name))
      for (const [name, type] of [['runtime_mode', 'TEXT'], ['runtime_source', 'TEXT'], ['runtime_version', 'TEXT'], ['runtime_label', 'TEXT']]) {
        if (!columns.has(name)) database.exec(`ALTER TABLE action_runs ADD COLUMN ${name} ${type}`)
      }
      database.prepare("UPDATE action_runs SET status = 'interrupted', ended_at = COALESCE(ended_at, ?), message = '宿主上次退出，运行状态已中断' WHERE status IN ('running', 'stopping')").run(Date.now())
      database.prepare('DELETE FROM action_runs WHERE started_at < ?').run(Date.now() - CODEX_RUN_MAX_AGE_MS)
      database.prepare(`DELETE FROM action_runs WHERE run_id IN (SELECT run_id FROM action_runs ORDER BY started_at DESC LIMIT -1 OFFSET ${CODEX_RUN_MEMORY_LIMIT})`).run()
      enforceCodexActionRunRetention(database)
      const rows = database.prepare(`SELECT * FROM action_runs ORDER BY started_at DESC LIMIT ${CODEX_RUN_MEMORY_LIMIT}`).all()
      codexActionRunMemory = rows.map((row) => ({
        version: 1,
        runId: row.run_id,
        laneId: row.lane_id,
        projectKey: row.project_key,
        projectName: row.project_name,
        environmentId: row.environment_id,
        environmentName: row.environment_name,
        actionId: row.action_id,
        actionName: row.action_name,
        risk: row.risk,
        status: row.status,
        startedAt: row.started_at,
        endedAt: row.ended_at || undefined,
        exitCode: typeof row.exit_code === 'number' ? row.exit_code : undefined,
        archivedAt: row.archived_at || undefined,
        logText: row.log_text || '',
        logBytes: row.log_bytes || 0,
        logLines: row.log_lines || 0,
        message: row.message || '',
        cursor: 0,
        runtimeMode: row.runtime_mode || undefined,
        runtimeSource: row.runtime_source || undefined,
        runtimeVersion: row.runtime_version || undefined,
        runtimeLabel: row.runtime_label || undefined
      }))
      codexActionRunDatabase = database
    } catch {
      codexActionRunDatabase = null
    }
    return codexActionRunDatabase
  }

  function persistCodexActionRun(run) {
    const database = ensureCodexActionRunDatabase()
    if (!database) return
    try {
      database.prepare(`INSERT INTO action_runs (
      run_id, lane_id, project_key, project_name, environment_id, environment_name, action_id, action_name,
      risk, status, started_at, ended_at, exit_code, archived_at, log_text, log_bytes, log_lines, message
      , runtime_mode, runtime_source, runtime_version, runtime_label
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(run_id) DO UPDATE SET status=excluded.status, ended_at=excluded.ended_at,
      exit_code=excluded.exit_code, archived_at=excluded.archived_at, log_text=excluded.log_text,
      log_bytes=excluded.log_bytes, log_lines=excluded.log_lines, message=excluded.message,
      runtime_mode=excluded.runtime_mode, runtime_source=excluded.runtime_source,
      runtime_version=excluded.runtime_version, runtime_label=excluded.runtime_label`).run(
        run.runId, run.laneId, run.projectKey, run.projectName, run.environmentId, run.environmentName,
        run.actionId, run.actionName, run.risk, run.status, run.startedAt, run.endedAt || null,
        typeof run.exitCode === 'number' ? run.exitCode : null, run.archivedAt || null,
        run.logText || '', run.logBytes || 0, run.logLines || 0, run.message || '',
        run.runtimeMode || null, run.runtimeSource || null, run.runtimeVersion || null, run.runtimeLabel || null
      )
    } catch {}
  }

  // Named operations for the seven entry sites that used to write these three
  // bindings directly. Each one is the whole thing the entry actually meant.
  function closeCodexActionRunDatabase() {
    try { codexActionRunDatabase?.close?.() } catch {}
    codexActionRunDatabase = null
    codexActionRunDatabaseReady = false
  }

  function enforceRetentionIfOpen() {
    if (codexActionRunDatabase) enforceCodexActionRunRetention(codexActionRunDatabase)
  }

  function rememberCodexActionRun(run) {
    codexActionRunMemory.unshift(run)
    codexActionRunMemory = codexActionRunMemory.slice(0, CODEX_RUN_MEMORY_LIMIT)
  }

  function codexActionRunMemorySnapshot() {
    return codexActionRunMemory.slice(0, CODEX_RUN_MEMORY_LIMIT)
  }

  function findCodexActionRun(runId) {
    return codexActionRunMemory.find((item) => item.runId === runId)
  }

  return {
    revision: CODEX_RUN_DATABASE_REVISION,
    codexActionRunDatabasePath,
    enforceCodexActionRunRetention,
    ensureCodexActionRunDatabase,
    persistCodexActionRun,
    closeCodexActionRunDatabase,
    enforceRetentionIfOpen,
    rememberCodexActionRun,
    codexActionRunMemorySnapshot,
    findCodexActionRun
  }
}

module.exports = {
  CODEX_RUN_DATABASE_REVISION,
  CODEX_RUN_MEMORY_LIMIT,
  createCodexRunDatabase
}
