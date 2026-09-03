'use strict'

/**
 * Read-only Cursor Agent cold inventory.
 *
 * Only `composerHeaders` whitelist columns plus `json_extract(composerData.status)`
 * and `json_array_length(fullConversationHeadersOnly)` are read. Conversation
 * bodies, transcripts and credentials never enter this module. Empty shells
 * (`status=none` and zero conversation headers) are dropped. The live App
 * database is opened read-only and never written.
 *
 * Multitask fork rows (`isSubagent` with `subagentInfo`) never become cards.
 * Mirroring the Codex side-chat contract, they contribute per-parent evidence
 * only: each parent session carries its live fork ids and their cold
 * `unfinishedRunAt`, keyed by `subagentInfo.rootParentConversationId` so
 * nested forks still attach to the root conversation the App shows.
 */

const CURSOR_INVENTORY_REVISION = 'cursor-agent-inventory-v5'
const SQLITE_QUERY_TIMEOUT_MS = 20_000
const SQLITE_QUERY_MAX_BUFFER = 8 * 1024 * 1024
const { WATCHER_RECOVERY_INTERVAL_MS } = require('../timing-policy.cjs')
const SQLITE_BIN_CANDIDATES = Object.freeze([
  '/usr/bin/sqlite3',
  '/opt/homebrew/bin/sqlite3',
  '/usr/local/bin/sqlite3'
])
const COMPOSER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_ROWS = 500
/** Fork ids may be prefixed (`task-<uuid>`), so only sanity-bound them. */
const SUBAGENT_ID_MAX_LENGTH = 128
const MAX_SUBAGENTS_PER_PARENT = 24
/**
 * Cursor keeps the sidebar pin list per workspace window, not in the global
 * store: `workspaceStorage/<ws>/state.vscdb` `ItemTable` key
 * `cursor/pinnedComposers` is an ordered JSON string[] (composer ids, at most
 * 50, possibly a background-composer alias beside the id). Read-only: that
 * table is VS Code's in-memory StorageService, so an external write would be
 * clobbered on the next flush.
 */
const PINNED_COMPOSERS_KEY = 'cursor/pinnedComposers'
const PINNED_SQL = `SELECT value AS value FROM ItemTable WHERE key = '${PINNED_COMPOSERS_KEY}'`
const MAX_WORKSPACE_DBS = 200
const MAX_PINNED_PER_WORKSPACE = 50

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
  json_extract(h.value, '$.subagentInfo.parentComposerId') AS subagentParentComposerId,
  json_extract(h.value, '$.subagentInfo.rootParentConversationId') AS subagentRootComposerId,
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

/** Root beats direct parent so nested forks attach to the App's root row. */
function subagentParentIdOf(row) {
  const root = textOf(row.subagentRootComposerId).trim()
  if (COMPOSER_ID.test(root)) return root.toLowerCase()
  const parent = textOf(row.subagentParentComposerId).trim()
  return COMPOSER_ID.test(parent) ? parent.toLowerCase() : ''
}

/** Fork rows are evidence, never cards, so the empty-shell filter stays off. */
function isSubagentEvidenceRow(row) {
  if (!row || !flagOf(row.isSubagent) || flagOf(row.isArchived)) return false
  if (textOf(row.unifiedMode).trim() !== 'agent') return false
  if (isCloudRow(row)) return false
  const id = textOf(row.composerId).trim()
  return id.length > 0 && id.length <= SUBAGENT_ID_MAX_LENGTH
}

function collectSubagentsByParent(rows) {
  const byParent = new Map()
  let truncated = false
  for (const row of rows) {
    if (!isSubagentEvidenceRow(row)) continue
    const parentId = subagentParentIdOf(row)
    if (!parentId) continue
    let list = byParent.get(parentId)
    if (!list) {
      list = []
      byParent.set(parentId, list)
    }
    list.push({
      composerId: textOf(row.composerId).trim(),
      unfinishedRunAt: Number(row.unfinishedRunAt) || 0,
      lastUpdatedAt: Number(row.lastUpdatedAt) || 0
    })
  }
  for (const [parentId, list] of byParent) {
    if (list.length > MAX_SUBAGENTS_PER_PARENT) truncated = true
    list.sort((a, b) => (b.unfinishedRunAt - a.unfinishedRunAt) || (b.lastUpdatedAt - a.lastUpdatedAt))
    byParent.set(parentId, list.slice(0, MAX_SUBAGENTS_PER_PARENT)
      .map((entry) => ({ composerId: entry.composerId, unfinishedRunAt: entry.unfinishedRunAt })))
  }
  return { byParent, truncated }
}

function projectRow(row, subagents, pinnedOrder) {
  const composerId = textOf(row.composerId).trim()
  const order = pinnedOrder instanceof Map ? pinnedOrder.get(composerId.toLowerCase()) : undefined
  return {
    composerId,
    // Sidebar pin from workspace storage. `pinned` is always a boolean once a
    // pin scan ran; the reader's `pinnedAvailable` says whether it did.
    pinned: Number.isInteger(order),
    ...(Number.isInteger(order) ? { pinnedOrder: order } : {}),
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
    diskStatus: textOf(row.diskStatus).trim().toLowerCase(),
    ...(Array.isArray(subagents) && subagents.length ? { subagents } : {})
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

function queryWithDatabaseSync(DatabaseSync, dbPath, sql = INVENTORY_SQL) {
  const database = new DatabaseSync(dbPath, { readOnly: true })
  try {
    return database.prepare(sql).all()
  } finally {
    try { if (typeof database.close === 'function') database.close() } catch {}
  }
}

function queryWithCli(execFileSync, bin, dbPath, sql = INVENTORY_SQL) {
  const raw = execFileSync(bin, ['-readonly', '-json', sqliteUri(dbPath), sql], {
    encoding: 'utf8',
    timeout: SQLITE_QUERY_TIMEOUT_MS,
    maxBuffer: SQLITE_QUERY_MAX_BUFFER
  })
  const parsed = JSON.parse(String(raw || '').trim() || '[]')
  if (!Array.isArray(parsed)) throw new Error('sqlite-json-invalid')
  return parsed
}

function queryWithBuiltinSqlite(dbPath, sql = INVENTORY_SQL) {
  let sqlite
  try { sqlite = require('node:sqlite') } catch { throw sqliteUnavailable('node-sqlite-unavailable') }
  if (!sqlite || typeof sqlite.DatabaseSync !== 'function') throw sqliteUnavailable('node-sqlite-unavailable')
  return queryWithDatabaseSync(sqlite.DatabaseSync, dbPath, sql)
}

function queryRows(dependencies, dbPath, sql) {
  const DatabaseSync = dependencies.DatabaseSync
  if (typeof DatabaseSync === 'function') return queryWithDatabaseSync(DatabaseSync, dbPath, sql)
  const execFileSync = dependencies.execFileSync
  const bin = resolveSqliteBin(dependencies.fs, dependencies.sqliteBin)
  if (bin && typeof execFileSync === 'function') {
    try {
      return queryWithCli(execFileSync, bin, dbPath, sql)
    } catch (error) {
      if (error && error.code === 'sqlite-unavailable') throw error
      if (dependencies.allowBuiltinSqlite === false) throw error
      try { return queryWithBuiltinSqlite(dbPath, sql) } catch (fallback) {
        if (fallback && fallback.code === 'sqlite-unavailable') throw error
        throw fallback
      }
    }
  }
  if (dependencies.allowBuiltinSqlite === false) throw sqliteUnavailable('sqlite-unavailable')
  return queryWithBuiltinSqlite(dbPath, sql)
}

function queryInventoryRows(dependencies, dbPath) {
  return queryRows(dependencies, dbPath, INVENTORY_SQL)
}

/** Ordered composer ids from one workspace store; `[]` when the key is absent. */
function parsePinnedComposers(rows) {
  const first = Array.isArray(rows) && rows.length ? rows[0] : null
  const raw = first && typeof first === 'object' ? first.value : first
  if (typeof raw !== 'string' || !raw) return []
  let parsed
  try { parsed = JSON.parse(raw) } catch { return [] }
  if (!Array.isArray(parsed)) return []
  const ids = []
  for (const value of parsed) {
    const id = textOf(value).trim().toLowerCase()
    if (id && id.length <= SUBAGENT_ID_MAX_LENGTH && !ids.includes(id)) ids.push(id)
    if (ids.length >= MAX_PINNED_PER_WORKSPACE) break
  }
  return ids
}

function workspaceStorageDir(pathModule, dbPath) {
  const dirname = typeof pathModule.dirname === 'function' ? pathModule.dirname : (value) => String(value).replace(/[/\\][^/\\]+$/, '')
  return pathModule.join(dirname(dirname(dbPath)), 'workspaceStorage')
}

function createInventoryReader(dependencies) {
  const fs = dependencies.fs
  const path = dependencies.path
  const os = dependencies.os || { homedir: () => '' }
  const platform = dependencies.platform || (typeof process !== 'undefined' ? process.platform : 'darwin')
  const env = dependencies.env || (typeof process !== 'undefined' ? process.env : {})
  const watchFileFn = dependencies.watchFile
    || (typeof fs.watchFile === 'function' ? fs.watchFile.bind(fs) : null)
  const unwatchFileFn = dependencies.unwatchFile
    || (typeof fs.unwatchFile === 'function' ? fs.unwatchFile.bind(fs) : null)

  function resolveDbPath() {
    return textOf(dependencies.stateDbPath) || defaultStateDbPath(os, path, platform, env)
  }

  function resolveWorkspaceStorageDir() {
    return textOf(dependencies.workspaceStorageDir) || workspaceStorageDir(path, resolveDbPath())
  }

  /** workspace db path -> { signature, ids } so an unchanged store is never re-queried. */
  const pinnedCache = new Map()

  function listWorkspaceDbs() {
    const root = resolveWorkspaceStorageDir()
    let names = []
    try { names = fs.readdirSync(root) } catch { return [] }
    const paths = []
    for (const name of names) {
      if (paths.length >= MAX_WORKSPACE_DBS) break
      const candidate = path.join(root, String(name), 'state.vscdb')
      if (typeof fs.existsSync === 'function' && !fs.existsSync(candidate)) continue
      paths.push(candidate)
    }
    return paths
  }

  /**
   * composerId -> order across every workspace store. An id pinned in two
   * windows keeps its lowest position. A store that cannot be read keeps its
   * last known ids, so a transient lock never reads as "everything unpinned".
   */
  function readPinnedComposers() {
    const order = new Map()
    const dbs = listWorkspaceDbs()
    const seen = new Set(dbs)
    for (const key of [...pinnedCache.keys()]) if (!seen.has(key)) pinnedCache.delete(key)
    let available = dbs.length > 0
    let scanned = 0
    for (const dbPath of dbs) {
      const signature = dbSignature(dbPath)
      const cached = pinnedCache.get(dbPath)
      let ids = cached ? cached.ids : []
      if (!cached || cached.signature !== signature) {
        try {
          ids = parsePinnedComposers(queryRows(dependencies, dbPath, PINNED_SQL))
          pinnedCache.set(dbPath, { signature, ids })
          scanned += 1
        } catch {
          if (!cached) available = false
        }
      }
      ids.forEach((id, index) => {
        const existing = order.get(id)
        if (existing === undefined || index < existing) order.set(id, index)
      })
    }
    return { order, available, scanned, storeCount: dbs.length }
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
        topologyComplete: false,
        readAt: Date.now()
      }
    }
    try {
      const rows = queryInventoryRows(dependencies, dbPath)
      const allRows = Array.isArray(rows) ? rows : []
      const topology = collectSubagentsByParent(allRows)
      const pinned = readPinnedComposers()
      const sessions = []
      for (const row of allRows) {
        if (!isInventoryRow(row)) continue
        sessions.push(projectRow(row, topology.byParent.get(textOf(row.composerId).trim().toLowerCase()), pinned.order))
        if (sessions.length >= MAX_ROWS) break
      }
      return {
        revision: CURSOR_INVENTORY_REVISION,
        available: true,
        reason: 'ready',
        sessions,
        truncated: rows.length > sessions.length && sessions.length >= MAX_ROWS,
        topologyComplete: topology.truncated !== true,
        pinnedAvailable: pinned.available,
        pinnedStoreCount: pinned.storeCount,
        readAt: Date.now()
      }
    } catch (error) {
      return {
        revision: CURSOR_INVENTORY_REVISION,
        available: false,
        reason: error && error.code === 'sqlite-unavailable' ? 'sqlite-unavailable' : 'degraded',
        sessions: [],
        truncated: false,
        topologyComplete: false,
        readAt: Date.now()
      }
    }
  }

  function dbSignature(filePath) {
    try {
      const stat = fs.statSync(filePath)
      return `${Number(stat.size) || 0}:${Math.round(Number(stat.mtimeMs) || 0)}`
    } catch {
      return 'missing'
    }
  }

  function watch(listener) {
    if (typeof listener !== 'function') return () => {}
    const dbPath = resolveDbPath()
    const walPath = `${dbPath}-wal`
    const targets = [dbPath, walPath]
    const dirname = typeof path.dirname === 'function' ? path.dirname : (value) => String(value).replace(/[/\\][^/\\]+$/, '')
    const basename = typeof path.basename === 'function' ? path.basename : (value) => String(value).split(/[/\\]/).pop() || ''
    const accepted = new Set([basename(dbPath), `${basename(dbPath)}-wal`])
    const watchers = []
    const recovery = []
    let disposed = false
    let scheduled = false
    // Workspace pin stores change without touching the global db, so their
    // signatures join the change detector and a recursive watch covers them.
    const workspaceRoot = resolveWorkspaceStorageDir()
    const signatureOf = () => [...targets, ...listWorkspaceDbs()].map(dbSignature).join('|')
    let lastSignature = signatureOf()
    const notify = () => {
      if (disposed) return
      const next = signatureOf()
      if (next === lastSignature) return
      lastSignature = next
      try { listener() } catch { /* consumer's problem */ }
    }
    const requestNotify = () => {
      if (disposed || scheduled) return
      scheduled = true
      const schedule = typeof setImmediate === 'function' ? setImmediate : (fn) => setTimeout(fn, 0)
      schedule(() => {
        scheduled = false
        notify()
      })
    }
    try {
      const dirWatcher = fs.watch(dirname(dbPath), { persistent: false }, (_event, filename) => {
        if (filename && !accepted.has(String(filename))) return
        requestNotify()
      })
      if (dirWatcher && typeof dirWatcher.on === 'function') {
        dirWatcher.on('error', () => {
          try { if (typeof dirWatcher.close === 'function') dirWatcher.close() } catch { /* already gone */ }
        })
      }
      watchers.push(dirWatcher)
    } catch { /* directory watch is the fast path; file watches remain */ }
    try {
      const workspaceWatcher = fs.watch(workspaceRoot, { persistent: false, recursive: true }, (_event, filename) => {
        const name = basename(String(filename || ''))
        if (name !== 'state.vscdb' && name !== 'state.vscdb-wal') return
        requestNotify()
      })
      if (workspaceWatcher && typeof workspaceWatcher.on === 'function') {
        workspaceWatcher.on('error', () => {
          try { if (typeof workspaceWatcher.close === 'function') workspaceWatcher.close() } catch { /* already gone */ }
        })
      }
      watchers.push(workspaceWatcher)
    } catch { /* recursive watch is best effort; the next inventory read still scans */ }
    for (const filePath of targets) {
      try {
        const watcher = fs.watch(filePath, { persistent: false }, () => requestNotify())
        if (watcher && typeof watcher.on === 'function') {
          watcher.on('error', () => {
            try { if (typeof watcher.close === 'function') watcher.close() } catch { /* already gone */ }
          })
        }
        watchers.push(watcher)
      } catch { /* file may be missing until Cursor writes a WAL */ }
      if (watchFileFn) {
        try {
          const callback = () => requestNotify()
          watchFileFn(filePath, { persistent: false, interval: WATCHER_RECOVERY_INTERVAL_MS }, callback)
          recovery.push({ filePath, callback })
        } catch { /* recovery is optional */ }
      }
    }
    return () => {
      disposed = true
      for (const watcher of watchers) {
        try { if (watcher && typeof watcher.close === 'function') watcher.close() } catch { /* already gone */ }
      }
      if (unwatchFileFn) {
        for (const item of recovery) {
          try { unwatchFileFn(item.filePath, item.callback) } catch { /* already gone */ }
        }
      }
    }
  }

  return {
    revision: CURSOR_INVENTORY_REVISION,
    readInventory,
    watch
  }
}

module.exports = {
  CURSOR_INVENTORY_REVISION,
  PINNED_COMPOSERS_KEY,
  parsePinnedComposers,
  createInventoryReader
}
