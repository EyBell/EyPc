'use strict'

/**
 * Cursor Agent archive adapter.
 *
 * Archive mirrors the App's own archive bit 1:1: the target `composerHeaders`
 * row gets `isArchived = 1` plus the JSON `isArchived: true` twin — exactly the
 * pair the App itself writes (verified live on Cursor 3.17.8, column and JSON
 * always move together, no companion field). Only that single row is ever
 * touched and conversation bodies are never read.
 *
 * The status gate is re-verified at write time: a row that still carries live
 * evidence (`unfinishedRunAt`, a pending plan, or a live un-archived fork) is
 * refused, the UPDATE itself repeats those guards so a concurrent phase change
 * degrades to `indeterminate` instead of archiving a running task, and the row
 * is read back before `archived` is reported. If the App later rewrites the
 * row from memory the inventory watcher simply resurfaces the card.
 */

const CURSOR_ARCHIVE_REVISION = 'cursor-agent-archive-v1'
const SQLITE_QUERY_TIMEOUT_MS = 20_000
const SQLITE_QUERY_MAX_BUFFER = 1024 * 1024
const COMPOSER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SQLITE_BIN_CANDIDATES = Object.freeze([
  '/usr/bin/sqlite3',
  '/opt/homebrew/bin/sqlite3',
  '/usr/local/bin/sqlite3'
])

function textOf(value) {
  return typeof value === 'string' ? value : ''
}

function normalizeComposerId(composerId) {
  const id = textOf(composerId).trim().toLowerCase()
  return COMPOSER_ID_PATTERN.test(id) ? id : ''
}

function defaultStateDbPath(os, pathModule, platform, env) {
  const home = typeof os.homedir === 'function' ? os.homedir() : ''
  if (platform === 'darwin') {
    return pathModule.join(home, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb')
  }
  if (platform === 'win32') {
    const appData = textOf(env && env.APPDATA) || pathModule.join(home, 'AppData', 'Roaming')
    return pathModule.join(appData, 'Cursor', 'User', 'globalStorage', 'state.vscdb')
  }
  return pathModule.join(home, '.config', 'Cursor', 'User', 'globalStorage', 'state.vscdb')
}

/** `id` is regex-bound to hex/dash before it may enter any statement. */
function gateSql(id) {
  return `
SELECT
  IFNULL(h.isArchived, 0) AS isArchived,
  IFNULL(h.isSubagent, 0) AS isSubagent,
  IFNULL(json_extract(h.value, '$.unfinishedRunAt'), 0) AS unfinishedRunAt,
  IFNULL(json_extract(h.value, '$.hasPendingPlan'), 0) AS hasPendingPlan,
  (
    SELECT COUNT(*) FROM composerHeaders f
    WHERE f.isSubagent = 1
      AND IFNULL(f.isArchived, 0) != 1
      AND IFNULL(json_extract(f.value, '$.unfinishedRunAt'), 0) > 0
      AND (
        LOWER(IFNULL(json_extract(f.value, '$.subagentInfo.rootParentConversationId'), '')) = LOWER(h.composerId)
        OR LOWER(IFNULL(json_extract(f.value, '$.subagentInfo.parentComposerId'), '')) = LOWER(h.composerId)
      )
  ) AS liveForkCount
FROM composerHeaders h
WHERE LOWER(h.composerId) = '${id}'
`
}

function archiveSql(id) {
  return `
UPDATE composerHeaders
SET isArchived = 1, value = json_set(value, '$.isArchived', json('true'))
WHERE LOWER(composerId) = '${id}'
  AND IFNULL(isArchived, 0) != 1
  AND IFNULL(json_extract(value, '$.unfinishedRunAt'), 0) = 0
  AND IFNULL(json_extract(value, '$.hasPendingPlan'), 0) NOT IN (1, 'true')
  AND NOT EXISTS (
    SELECT 1 FROM composerHeaders f
    WHERE f.isSubagent = 1
      AND IFNULL(f.isArchived, 0) != 1
      AND IFNULL(json_extract(f.value, '$.unfinishedRunAt'), 0) > 0
      AND (
        LOWER(IFNULL(json_extract(f.value, '$.subagentInfo.rootParentConversationId'), '')) = '${id}'
        OR LOWER(IFNULL(json_extract(f.value, '$.subagentInfo.parentComposerId'), '')) = '${id}'
      )
  )
`
}

function verifySql(id) {
  return `
SELECT IFNULL(h.isArchived, 0) AS isArchived, json_type(h.value, '$.isArchived') AS jsonType
FROM composerHeaders h
WHERE LOWER(h.composerId) = '${id}'
`
}

function flagOf(value) {
  return value === true || value === 1 || value === '1' || value === 'true'
}

function outcome(kind, message, extra) {
  return { outcome: kind, message, revision: CURSOR_ARCHIVE_REVISION, ...(extra || {}) }
}

function resolveSqliteBin(fs, explicit) {
  if (typeof explicit === 'string' && explicit) return explicit
  if (!fs || typeof fs.existsSync !== 'function') return ''
  for (const candidate of SQLITE_BIN_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate
  }
  return ''
}

function databaseSyncClient(DatabaseSync, dbPath) {
  const database = new DatabaseSync(dbPath)
  database.exec('PRAGMA busy_timeout = 5000')
  return {
    rows: (sql) => database.prepare(sql).all(),
    mutate: (sql) => Number(database.prepare(sql).run().changes) || 0,
    close: () => { try { database.close() } catch { /* already closed */ } }
  }
}

function cliClient(execFileSync, bin, dbPath) {
  const run = (sql) => {
    // `.timeout` is a dot command and emits nothing, unlike PRAGMA busy_timeout
    // whose own result row would corrupt the -json payload.
    const raw = execFileSync(bin, ['-json', '-cmd', '.timeout 5000', dbPath, sql], {
      encoding: 'utf8',
      timeout: SQLITE_QUERY_TIMEOUT_MS,
      maxBuffer: SQLITE_QUERY_MAX_BUFFER
    })
    const trimmed = String(raw || '').trim()
    if (!trimmed) return []
    const parsed = JSON.parse(trimmed)
    if (!Array.isArray(parsed)) throw new Error('sqlite-json-invalid')
    return parsed
  }
  return {
    rows: run,
    mutate: (sql) => {
      const rows = run(`${sql};\nSELECT changes() AS changed;`)
      return Number(rows[0] && rows[0].changed) || 0
    },
    close: () => {}
  }
}

function openClient(dependencies, dbPath) {
  const DatabaseSync = dependencies.DatabaseSync
  if (typeof DatabaseSync === 'function') return databaseSyncClient(DatabaseSync, dbPath)
  const bin = resolveSqliteBin(dependencies.fs, dependencies.sqliteBin)
  if (bin && typeof dependencies.execFileSync === 'function') {
    return cliClient(dependencies.execFileSync, bin, dbPath)
  }
  if (dependencies.allowBuiltinSqlite === false) return null
  let sqlite
  try { sqlite = require('node:sqlite') } catch { return null }
  if (!sqlite || typeof sqlite.DatabaseSync !== 'function') return null
  return databaseSyncClient(sqlite.DatabaseSync, dbPath)
}

function createArchiver(dependencies) {
  const os = dependencies.os || { homedir: () => '' }
  const platform = dependencies.platform || (typeof process !== 'undefined' ? process.platform : 'darwin')
  const env = dependencies.env || (typeof process !== 'undefined' ? process.env : {})

  function resolveDbPath() {
    return textOf(dependencies.stateDbPath) || defaultStateDbPath(os, dependencies.path, platform, env)
  }

  function archiveTask(composerId) {
    const id = normalizeComposerId(composerId)
    if (!id) return outcome('failed', 'Cursor 任务身份已失效')
    const dbPath = resolveDbPath()
    const exists = dependencies.fs && typeof dependencies.fs.existsSync === 'function'
      ? dependencies.fs.existsSync(dbPath)
      : false
    if (!exists) return outcome('failed', 'Cursor 数据库不可用，未执行归档')
    let client = null
    try {
      client = openClient(dependencies, dbPath)
      if (!client) return outcome('failed', '本机缺少可用的 SQLite 运行时，未执行归档')
      const gate = client.rows(gateSql(id))[0]
      if (!gate) return outcome('failed', 'Cursor 任务身份无法唯一确认，未执行归档')
      if (flagOf(gate.isSubagent)) return outcome('failed', 'Multitask 分叉不支持独立归档')
      if (flagOf(gate.isArchived)) {
        return outcome('archived', '该任务已在 Cursor 归档列表中', { alreadyArchived: true })
      }
      if (Number(gate.unfinishedRunAt) > 0 || flagOf(gate.hasPendingPlan) || Number(gate.liveForkCount) > 0) {
        return outcome('failed', 'Cursor 任务仍在进行中，未执行归档')
      }
      const changed = client.mutate(archiveSql(id))
      if (changed !== 1) {
        return outcome('indeterminate', 'Cursor 任务状态在归档期间发生变化，未确认归档，已保留任务卡片')
      }
      const verified = client.rows(verifySql(id))[0]
      if (!verified || !flagOf(verified.isArchived) || verified.jsonType !== 'true') {
        return outcome('indeterminate', 'Cursor 归档写入后未通过复验，已保留任务卡片')
      }
      return outcome('archived', '已归档 Cursor 任务（App 归档列表同步可见）')
    } catch {
      return outcome('failed', 'Cursor 归档执行失败，已保留任务卡片')
    } finally {
      if (client) client.close()
    }
  }

  return { revision: CURSOR_ARCHIVE_REVISION, archiveTask }
}

module.exports = {
  CURSOR_ARCHIVE_REVISION,
  createArchiver
}
