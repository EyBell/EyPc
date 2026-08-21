'use strict'

/**
 * Read-only Cursor Agent cold inventory.
 *
 * Only `composerHeaders` whitelist columns plus `json_extract(composerData.status)`
 * and `json_array_length(fullConversationHeadersOnly)` are read. Conversation
 * bodies, transcripts and credentials never enter this module. Empty shells
 * (`status=none` and zero conversation headers) are dropped. The live App
 * database is opened read-only and never written.
 */

const CURSOR_INVENTORY_REVISION = 'cursor-agent-inventory-v3'
const SQLITE_QUERY_TIMEOUT_MS = 20_000
const SQLITE_QUERY_MAX_BUFFER = 8 * 1024 * 1024
const SQLITE_BIN_CANDIDATES = Object.freeze([
  '/usr/bin/sqlite3',
  '/opt/homebrew/bin/sqlite3',
  '/usr/local/bin/sqlite3'
])
const COMPOSER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_ROWS = 500

const INVENTORY_SQL = `
SELECT
  h.composerId AS composerId,
  h.workspaceId AS workspaceId,
  h.isArchived AS isArchived,
  h.isSubagent AS isSubagent,
  h.createdAt AS createdAt,
  h.lastUpdatedAt AS lastUpdatedAt,
  json_extract(h.value, '$.unifiedMode') AS unifiedMode,
  json_extract(h.value, '$.isBestOfNSubcomposer') AS isBestOfNSubcomposer,
  json_extract(h.value, '$.hasUnreadMessages') AS hasUnreadMessages,
  json_extract(h.value, '$.isDraft') AS isDraft,
  json_extract(h.value, '$.hasPendingPlan') AS hasPendingPlan,
  json_extract(h.value, '$.hasBlockingPendingActions') AS hasBlockingPendingActions,
  json_extract(h.value, '$.unfinishedRunAt') AS unfinishedRunAt,
  json_extract(h.value, '$.subtitle') AS subtitle,
  json_extract(h.value, '$.workspaceIdentifier') AS workspaceIdentifier,
  json_extract(h.value, '$.name') AS name,
  json_extract(h.value, '$.createdFromBackgroundAgent') AS createdFromBackgroundAgent,
  json_extract(h.value, '$.glass.cloudAgentProjectMembership') AS cloudAgentProjectMembership,
  json_extract(h.value, '$.agentLocation.type') AS agentLocationType,
  (
    SELECT json_extract(d.value, '$.status')
    FROM cursorDiskKV d
    WHERE d.key = ('composerData:' || h.composerId)
  ) AS diskStatus,
  IFNULL((
    SELECT json_array_length(json_extract(d.value, '$.fullConversationHeadersOnly'))
    FROM cursorDiskKV d
    WHERE d.key = ('composerData:' || h.composerId)
  ), 0) AS conversationHeaderCount
FROM composerHeaders h
`

function textOf(value) {
  return typeof value === 'string' ? value : ''
}

function flagOf(value) {
  return value === true || value === 1 || value === '1' || value === 'true'
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

function isCloudRow(row) {
  if (flagOf(row.createdFromBackgroundAgent)) return true
  const membership = row.cloudAgentProjectMembership
  if (membership !== null && membership !== undefined && membership !== '' && membership !== 0 && membership !== false) return true
  const location = textOf(row.agentLocationType).trim().toLowerCase()
  return location === 'cloud' || location === 'background'
}

function conversationHeaderCountOf(row) {
  const count = Number(row && row.conversationHeaderCount)
  return Number.isFinite(count) && count > 0 ? Math.trunc(count) : 0
}

function isEmptyShell(row) {
  return textOf(row.diskStatus).trim().toLowerCase() === 'none' && conversationHeaderCountOf(row) === 0
}

function isInventoryRow(row) {
  if (!row || flagOf(row.isArchived) || flagOf(row.isSubagent) || flagOf(row.isBestOfNSubcomposer)) return false
  if (textOf(row.unifiedMode).trim() !== 'agent') return false
  if (isCloudRow(row)) return false
  if (isEmptyShell(row)) return false
  return COMPOSER_ID.test(textOf(row.composerId).trim())
}

function projectRow(row) {
  return {
    composerId: textOf(row.composerId).trim(),
    workspaceIdentifier: textOf(row.workspaceIdentifier).trim() || textOf(row.workspaceId).trim(),
    name: textOf(row.name).trim(),
    subtitle: textOf(row.subtitle).trim(),
    createdAt: Number(row.createdAt) || 0,
    lastUpdatedAt: Number(row.lastUpdatedAt) || 0,
    hasUnreadMessages: flagOf(row.hasUnreadMessages),
    isDraft: flagOf(row.isDraft),
    hasPendingPlan: flagOf(row.hasPendingPlan),
    hasBlockingPendingActions: flagOf(row.hasBlockingPendingActions),
    unfinishedRunAt: Number(row.unfinishedRunAt) || 0,
    diskStatus: textOf(row.diskStatus).trim().toLowerCase()
  }
}

function sqliteUnavailable(message) {
  const error = new Error(message || 'sqlite-unavailable')
  error.code = 'sqlite-unavailable'
  return error
}

function resolveSqliteBin(fs, explicit) {
  if (typeof explicit === 'string' && explicit) return explicit
  if (!fs || typeof fs.existsSync !== 'function') return ''
  for (const candidate of SQLITE_BIN_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate
  }
  return ''
}

function sqliteUri(dbPath) {
  const normalized = String(dbPath || '').replace(/\\/g, '/')
  if (/^[A-Za-z]:\//.test(normalized)) return `file:///${normalized}?mode=ro`
  return `file:${normalized}?mode=ro`
}

function queryWithDatabaseSync(DatabaseSync, dbPath) {
  const database = new DatabaseSync(dbPath, { readOnly: true })
  try {
    return database.prepare(INVENTORY_SQL).all()
  } finally {
    try { if (typeof database.close === 'function') database.close() } catch {}
  }
}

function queryWithCli(execFileSync, bin, dbPath) {
  const raw = execFileSync(bin, ['-readonly', '-json', sqliteUri(dbPath), INVENTORY_SQL], {
    encoding: 'utf8',
    timeout: SQLITE_QUERY_TIMEOUT_MS,
    maxBuffer: SQLITE_QUERY_MAX_BUFFER
  })
  const parsed = JSON.parse(String(raw || '').trim() || '[]')
  if (!Array.isArray(parsed)) throw new Error('sqlite-json-invalid')
  return parsed
}

function queryWithBuiltinSqlite(dbPath) {
  let sqlite
  try { sqlite = require('node:sqlite') } catch { throw sqliteUnavailable('node-sqlite-unavailable') }
  if (!sqlite || typeof sqlite.DatabaseSync !== 'function') throw sqliteUnavailable('node-sqlite-unavailable')
  return queryWithDatabaseSync(sqlite.DatabaseSync, dbPath)
}

function queryInventoryRows(dependencies, dbPath) {
  const DatabaseSync = dependencies.DatabaseSync
  if (typeof DatabaseSync === 'function') return queryWithDatabaseSync(DatabaseSync, dbPath)
  const execFileSync = dependencies.execFileSync
  const bin = resolveSqliteBin(dependencies.fs, dependencies.sqliteBin)
  if (bin && typeof execFileSync === 'function') {
    try {
      return queryWithCli(execFileSync, bin, dbPath)
    } catch (error) {
      if (error && error.code === 'sqlite-unavailable') throw error
      if (dependencies.allowBuiltinSqlite === false) throw error
      try { return queryWithBuiltinSqlite(dbPath) } catch (fallback) {
        if (fallback && fallback.code === 'sqlite-unavailable') throw error
        throw fallback
      }
    }
  }
  if (dependencies.allowBuiltinSqlite === false) throw sqliteUnavailable('sqlite-unavailable')
  return queryWithBuiltinSqlite(dbPath)
}

function createInventoryReader(dependencies) {
  const fs = dependencies.fs
  const path = dependencies.path
  const os = dependencies.os || { homedir: () => '' }
  const platform = dependencies.platform || (typeof process !== 'undefined' ? process.platform : 'darwin')
  const env = dependencies.env || (typeof process !== 'undefined' ? process.env : {})

  function resolveDbPath() {
    return textOf(dependencies.stateDbPath) || defaultStateDbPath(os, path, platform, env)
  }

  function readInventory() {
    const dbPath = resolveDbPath()
    const exists = typeof fs.existsSync === 'function' ? fs.existsSync(dbPath) : false
    if (!exists) {
      return {
        revision: CURSOR_INVENTORY_REVISION,
        available: false,
        reason: 'not-installed',
        sessions: [],
        truncated: false,
        readAt: Date.now()
      }
    }
    try {
      const rows = queryInventoryRows(dependencies, dbPath)
      const sessions = []
      for (const row of Array.isArray(rows) ? rows : []) {
        if (!isInventoryRow(row)) continue
        sessions.push(projectRow(row))
        if (sessions.length >= MAX_ROWS) break
      }
      return {
        revision: CURSOR_INVENTORY_REVISION,
        available: true,
        reason: 'ready',
        sessions,
        truncated: rows.length > sessions.length && sessions.length >= MAX_ROWS,
        readAt: Date.now()
      }
    } catch (error) {
      return {
        revision: CURSOR_INVENTORY_REVISION,
        available: false,
        reason: error && error.code === 'sqlite-unavailable' ? 'sqlite-unavailable' : 'degraded',
        sessions: [],
        truncated: false,
        readAt: Date.now()
      }
    }
  }

  return {
    revision: CURSOR_INVENTORY_REVISION,
    readInventory
  }
}

module.exports = {
  CURSOR_INVENTORY_REVISION,
  createInventoryReader
}
