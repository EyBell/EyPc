const { Buffer } = require('node:buffer')
const { execFile, execFileSync, spawn } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')

const STORAGE_KEY = 'eypc/state/v1'
const CODEX_LAUNCH_PATH_STORAGE_KEY = 'eypc/codex/launch-path/v1'
const MQTT_ARCHIVE_STORAGE_KEY = 'eypc/mqtt/archive/v1'
const MQTT_SECRETS_LOCAL_STORAGE_KEY = 'eypc/mqtt/secrets-local/v1'
const MQTT_SECRETS_FILE_NAME = 'mqtt-secrets-local.json'
const MQTT_SECRETS_KEY_FILE_NAME = 'mqtt-secrets-local.key'
const MQTT_SECRETS_ENCRYPTION_VERSION = 2
const MQTT_SECRETS_AES_ALGORITHM = 'aes-256-gcm'
const CODEX_RPC_TIMEOUT_MS = 12_000
const CODEX_PROXY_OUTPUT_LIMIT = 16 * 1024
const CODEX_PROCESS_OUTPUT_LIMIT = 256 * 1024
const CODEX_THREAD_ALIAS_TTL_MS = 10 * 60_000
const CODEX_THREAD_LIMIT = 100
const CODEX_THREAD_PAGE_LIMIT = 500
const CODEX_NATIVE_STATE_MAX_BYTES = 4 * 1024 * 1024
const CODEX_THREAD_TURN_STATUS_CONCURRENCY = 10
const CODEX_THREAD_TURN_STATUS_TIMEOUT_MS = 5_000
const CODEX_THREAD_TURN_STATUS_RETRY_MS = 30_000
const CODEX_DESKTOP_TURN_REFRESH_DEADLINE_MS = 3_000
const CODEX_DESKTOP_TURN_REFRESH_DELAYS_MS = [0, 300, 1_000]
const CODEX_COMPLETION_EVENT_REFRESH_DELAYS_MS = [0, 25, 75, 150, 300, 600, 1_000]
const CODEX_THREAD_FIRST_PROMPT_PAGE_LIMIT = 50
const CODEX_THREAD_FIRST_PROMPT_PAGE_BUDGET = 4
const CODEX_DESKTOP_IPC_FRAME_MAX_BYTES = 256 * 1024 * 1024
const CODEX_DESKTOP_IPC_RECONNECT_MAX_MS = 5_000
// Keep synchronized with src/domain/codex.ts. This value crosses the context
// boundary so a newer renderer can mark long-lived preload evidence degraded.
const CODEX_TASK_STATE_REVISION = 'task-state-v5'
const CODEX_DESKTOP_IPC_VERSIONS = {
  'client-status-changed': 0,
  'ipc-connection-reset': 1,
  'thread-stream-state-changed': 11,
  'thread-stream-following-changed': 1,
  'thread-stream-following-status-requested': 1,
  'thread-read-state-changed': 2,
  'thread-archived': 2,
  'thread-unarchived': 1
}

function codexDesktopIpcVersionAccepted(method, version) {
  const expectedVersion = CODEX_DESKTOP_IPC_VERSIONS[method]
  if (!Number.isInteger(expectedVersion)) return true
  // Older installed Codex editor extensions publish unrevisioned stream-state
  // v6 and read-state v1; the current Desktop/editor protocol uses v11/v2.
  return version === expectedVersion
    || method === 'thread-stream-state-changed' && version === 6
    || method === 'thread-read-state-changed' && version === 1
}
const CODEX_FLOAT_WATER_SIZE = { width: 104, height: 104 }
const CODEX_FLOAT_CARD_SIZE = { width: 166, height: 92 }
const CODEX_FLOAT_EXPANDED_WIDTH = 360
const CODEX_FLOAT_EXPANDED_MIN_WIDTH = 340
const CODEX_FLOAT_EXPANDED_MIN_HEIGHT = 280
const CODEX_FLOAT_EXPANDED_MAX_HEIGHT = 460
const CODEX_FLOAT_MARGIN = 12
const WINDOW_BRIDGE_TIMEOUT_MS = 5_000
const WINDOW_BRIDGE_OUTPUT_LIMIT = 1024 * 1024
const WINDOW_BRIDGE_REVISION = 'wj22-native-instance-space-cache'
let windowSubsystem = null
let windowSubsystemLoadError = ''
try {
  let windowModule = null
  let relativeLoadError = null
  try {
    windowModule = require('./windows/index.cjs')
  } catch (error) {
    relativeLoadError = error
  }
  if (!windowModule) {
    const baseCandidates = [
      typeof __dirname === 'string' ? __dirname : '',
      process.cwd(),
      path.join(process.cwd(), 'preload'),
      path.join(process.cwd(), 'public')
    ].filter(Boolean)
    for (const base of Array.from(new Set(baseCandidates))) {
      try {
        windowModule = require(path.join(base, 'windows', 'index.cjs'))
        break
      } catch {}
    }
  }
  const createWindowSubsystem = windowModule && windowModule.createWindowSubsystem
  if (typeof createWindowSubsystem !== 'function') throw relativeLoadError || new Error('window module factory unavailable')
  windowSubsystem = createWindowSubsystem({
    execFile,
    platform: process.platform,
    process,
    globalThis,
    timeoutMs: WINDOW_BRIDGE_TIMEOUT_MS,
    outputLimit: WINDOW_BRIDGE_OUTPUT_LIMIT
  })
} catch (error) {
  windowSubsystemLoadError = String(error && error.message || error || 'window module unavailable')
}

// Claude companion bridge. Loaded exactly like the window subsystem: a guarded
// require with public/dist fallbacks, so a missing or broken module degrades the
// Claude provider alone and never touches Codex, MQTT, ports or favorites.
let claudeBridge = null
let claudeBridgeLoadError = ''
try {
  let claudeModule = null
  let claudeRelativeLoadError = null
  try {
    claudeModule = require('./claude/index.cjs')
  } catch (error) {
    claudeRelativeLoadError = error
  }
  if (!claudeModule) {
    const claudeBaseCandidates = [
      typeof __dirname === 'string' ? __dirname : '',
      process.cwd(),
      path.join(process.cwd(), 'preload'),
      path.join(process.cwd(), 'public')
    ].filter(Boolean)
    for (const base of Array.from(new Set(claudeBaseCandidates))) {
      try {
        claudeModule = require(path.join(base, 'claude', 'index.cjs'))
        break
      } catch {}
    }
  }
  const createClaudeBridge = claudeModule && claudeModule.createClaudeBridge
  if (typeof createClaudeBridge !== 'function') throw claudeRelativeLoadError || new Error('claude module factory unavailable')
  claudeBridge = createClaudeBridge({
    fs,
    path,
    os,
    execFile,
    execFileSync,
    platform: process.platform,
    dataDirectory: resolveClaudeDataDirectory(),
    windows: {
      list: (...args) => windowSubsystem ? windowSubsystem.list(...args) : Promise.resolve({ windows: [] }),
      activate: (...args) => windowSubsystem ? windowSubsystem.activate(...args) : Promise.resolve({ outcome: 'unsupported' })
    }
  })
} catch (error) {
  claudeBridgeLoadError = String(error && error.message || error || 'claude module unavailable')
}

function claudeUnavailable(shape) {
  const message = `Claude 模块未加载：${claudeBridgeLoadError || 'unknown error'}`
  if (shape === 'snapshot') return { version: 1, revision: '', sessions: [], truncated: false, quota: null, readAt: Date.now() }
  if (shape === 'environment') {
    return { version: 1, installed: false, homeReady: false, authenticated: false, cliVersion: '', hooks: 'unknown', statusline: 'unknown', checkedAt: Date.now() }
  }
  if (shape === 'open') return { outcome: 'unavailable', confirmsRead: false, message }
  return { ok: false, message }
}

function unavailableWindowCapability(reason = '') {
  return {
    platform: 'unsupported',
    bridgeRevision: WINDOW_BRIDGE_REVISION,
    supported: false,
    permission: 'unsupported',
    canList: false,
    canActivate: false,
    canClose: false,
    canAlwaysOnTop: false,
    reason: reason || '窗口子系统未加载'
  }
}
const CODEX_FLOAT_CHANNELS = {
  snapshot: 'eypc-float:snapshot',
  state: 'eypc-float:state',
  activate: 'eypc-float:activate',
  expansion: 'eypc-float:expansion',
  returnFocus: 'eypc-float:return-focus',
  action: 'eypc-float:action',
  threadCreate: 'eypc-float:thread-create',
  threadCreateResult: 'eypc-float:thread-create-result',
  threadOpen: 'eypc-float:thread-open',
  threadOpenResult: 'eypc-float:thread-open-result',
  blankOpen: 'eypc-float:blank-open',
  blankOpenResult: 'eypc-float:blank-open-result',
  copyText: 'eypc-float:copy-text',
  copyTextResult: 'eypc-float:copy-text-result',
  dragStart: 'eypc-float:drag-start',
  dragMove: 'eypc-float:drag-move',
  dragEnd: 'eypc-float:drag-end',
  resizeStart: 'eypc-float:resize-start',
  resizeMove: 'eypc-float:resize-move',
  resizeEnd: 'eypc-float:resize-end',
  resizeCancel: 'eypc-float:resize-cancel'
}
const CODEX_ACTION_RUNNER_CHANNELS = {
  snapshot: 'eypc-action-runner:snapshot',
  log: 'eypc-action-runner:log',
  action: 'eypc-action-runner:action',
  snapshotRequest: 'eypc-action-runner:snapshot-request',
  hide: 'eypc-action-runner:hide',
  dragStart: 'eypc-action-runner:drag-start',
  dragMove: 'eypc-action-runner:drag-move',
  dragEnd: 'eypc-action-runner:drag-end',
  resizeStart: 'eypc-action-runner:resize-start',
  resizeMove: 'eypc-action-runner:resize-move',
  resizeEnd: 'eypc-action-runner:resize-end',
  resizeCancel: 'eypc-action-runner:resize-cancel'
}
const CODEX_ACTION_RUNNER_STORAGE_KEY = 'eypc/codex/action-runner/v1'
const CODEX_ACTION_RUNNER_MIN_WIDTH = 720
const CODEX_ACTION_RUNNER_MIN_HEIGHT = 420
const CODEX_ACTION_LOG_FLUSH_MS = 50
const CODEX_ACTION_LOG_FLUSH_BYTES = 16 * 1024
let lastEnterPayload = null
const enterPayloadListeners = new Set()
let mqttSqliteAdapter = null
let mqttStorageLastError = ''
let mqttMigratedLegacyArchive = false
let codexProcess = null
let codexLaunchKey = ''
let codexStartupHint = ''
let codexReadyPromise = null
let codexRpcId = 0
let codexRpcBuffer = ''
const codexRpcPending = new Map()
const codexThreadActions = new Map()
const codexProjectActions = new Map()
const codexActivityListeners = new Set()
let codexActivityInventory = new Map()
let codexActivitySourceFingerprint = ''
let codexActivityGeneration = 0
let codexLiveEvidenceSequence = 0
let codexActivityDecisionCounters = {
  liveEpochOpened: 0,
  staleTurnDiscarded: 0,
  branchTerminalDeferred: 0,
  snapshotConflictSuppressed: 0,
  missingMappingRetained: 0
}
const CODEX_MISSING_ACTIVITY_MAPPING_RETENTION_MS = 120_000
const CODEX_DESKTOP_SIDE_RELATION_LIMIT = 1_000
const CODEX_DESKTOP_OPENED_READ_LIMIT = 1_000
const CODEX_DESKTOP_PROVISIONAL_FOLLOW_LIMIT = 1_000
const CODEX_ROLLOUT_PENDING_INPUT_TAIL_BYTES = 4 * 1024 * 1024
const CODEX_ROLLOUT_PENDING_PLAN_TAIL_BYTES = [256 * 1024, 1024 * 1024, 4 * 1024 * 1024]
let codexDesktopBridge = null
// Session-only recovery hints intentionally survive Desktop/App Server bridge
// teardown inside this preload process. They carry topology only: never live
// state, unread state, prompts, or Renderer-visible identifiers.
const codexDesktopSideRelations = new Map()
// A successful task deep link is an EyPc-owned read acknowledgement for the
// currently observed completion. It must survive mainHide/pluginOut closing
// and rebuilding the Desktop bridge, but never leaves this preload process.
const codexDesktopOpenedReadAcknowledgements = new Map()
const codexThreadTurnStatusCache = new Map()
const codexThreadTurnStatusDirty = new Map()
let codexThreadTurnStatusDirtyGeneration = 0
const codexThreadFirstPromptCache = new Map()
const codexThreadPendingInputCache = new Map()
const codexThreadPendingPlanCache = new Map()
let codexThreadTurnStatusRpcAvailable = null
let codexThreadFirstPromptScanRunning = false
let codexThreadFirstPromptScanGeneration = 0
let codexFloatWindow = null
let codexFloatExpanded = false
let codexFloatPinned = false
let codexFloatEdge = 'right'
let codexFloatSnapshot = null
let codexFloatDrag = null
let codexFloatResize = null
let codexFloatExpandedSizes = []
let codexFloatPositionDisplayId = ''
let codexFloatPersistent = false
let codexFloatWorkspaceDiagnostics = {
  supported: process.platform === 'darwin',
  alwaysOnTop: false,
  allWorkspaces: false,
  visibleOnFullScreen: false,
  checkedAt: 0,
  errorCode: process.platform === 'darwin' ? 'not-checked' : 'unsupported'
}
const codexFloatActionListeners = new Set()
const codexActionRunnerActionListeners = new Set()
let codexActionRunnerWindow = null
let codexActionRunnerCatalog = { version: 1, projects: [], generatedAt: 0 }
let codexActionRunnerPreference = { pinned: false, view: 'records', runtimeByProject: {} }
let codexActionRunnerPreferenceLoaded = false
let codexActionRunnerForceClose = false
let codexActionRunnerVisible = false
let codexActionRunnerDrag = null
let codexActionRunnerResize = null
let codexActionRunDatabase = null
let codexActionRunDatabaseReady = false
let codexActionRunMemory = []
let codexNodeRuntimeDiscoveryCache = { expiresAt: 0, candidates: [] }

function run(command, args) {
  return new Promise((resolve) => {
    execFile(command, args, { windowsHide: true, timeout: 10_000 }, (error, stdout, stderr) => {
      resolve({ ok: !error, command, stdout: String(stdout || ''), stderr: String(stderr || ''), error: error ? String(error.message || error) : '' })
    })
  })
}

async function runFirst(plans) {
  let last = null
  for (const plan of plans) {
    const result = await run(plan.command, plan.args)
    last = result
    if (result.ok) return result
  }
  return last || { ok: false, stdout: '', stderr: '', error: 'no command candidates' }
}

function scanPlans() {
  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot || 'C:\\Windows'
    return [
      { command: `${systemRoot}\\System32\\netstat.exe`, args: ['-ano', '-p', 'tcp'] },
      { command: 'netstat', args: ['-ano', '-p', 'tcp'] }
    ]
  }
  return [
    { command: '/usr/sbin/lsof', args: ['-nP', '-iTCP', '-sTCP:LISTEN'] },
    { command: '/usr/bin/lsof', args: ['-nP', '-iTCP', '-sTCP:LISTEN'] },
    { command: 'lsof', args: ['-nP', '-iTCP', '-sTCP:LISTEN'] }
  ]
}

function killPlans(pid, force) {
  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot || 'C:\\Windows'
    const args = ['/PID', String(pid), '/T', ...(force ? ['/F'] : [])]
    return [
      { command: `${systemRoot}\\System32\\taskkill.exe`, args },
      { command: 'taskkill', args }
    ]
  }
  const args = [force ? '-KILL' : '-TERM', String(pid)]
  return [
    { command: '/bin/kill', args },
    { command: 'kill', args }
  ]
}

function portFromAddress(value) {
  const match = String(value || '').match(/:(\d+)(?:\s|\)|$)/)
  return match ? Number(match[1]) : null
}

function dedupePorts(items) {
  const byKey = new Map()
  for (const item of items) {
    const key = `${item.pid}:${item.port}:${item.protocol}`
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, { ...item, id: key })
      continue
    }
    const addresses = Array.from(new Set([...String(existing.address || '').split(' · '), item.address].map((value) => String(value || '').trim()).filter(Boolean)))
    byKey.set(key, {
      ...existing,
      command: existing.command || item.command,
      user: existing.user || item.user,
      state: existing.state || item.state,
      address: addresses.join(' · ')
    })
  }
  return Array.from(byKey.values())
}

function parseLsof(output) {
  const rows = String(output || '')
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const parts = line.split(/\s+/)
      if (parts.length < 9 || !line.includes('(LISTEN)')) return []
      const pid = Number(parts[1])
      const port = portFromAddress(parts.slice(8).join(' '))
      if (!Number.isInteger(pid) || !port) return []
      return [{ id: `${pid}:${port}:tcp`, pid, port, command: parts[0], user: parts[2], address: parts.slice(8).join(' ').replace(/\s*\(LISTEN\)\s*$/, ''), protocol: 'tcp', state: 'LISTEN' }]
    })
  return dedupePorts(rows)
}

function parseNetstat(output) {
  const rows = String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^TCP\s+/i.test(line) && /\bLISTENING\b/i.test(line))
    .flatMap((line) => {
      const parts = line.split(/\s+/)
      const pid = Number(parts[parts.length - 1])
      const port = portFromAddress(parts[1])
      if (!Number.isInteger(pid) || !port) return []
      return [{ id: `${pid}:${port}:tcp`, pid, port, command: `pid-${pid}`, address: parts[1], protocol: 'tcp', state: 'LISTEN' }]
    })
  return dedupePorts(rows)
}

async function scanPorts() {
  const result = await runFirst(scanPlans())
  if (!result.ok) {
    console.warn('[EyPc] port scan failed:', result.error || result.stderr)
    return []
  }
  return process.platform === 'win32' ? parseNetstat(result.stdout) : parseLsof(result.stdout)
}

async function killProcess(request) {
  const pid = Math.max(0, Math.trunc(Number(request && request.pid) || 0))
  const port = Math.max(0, Math.trunc(Number(request && request.port) || 0))
  const force = Boolean(request && request.force)
  const current = await scanPorts()
  if (!current.some((item) => item.pid === pid && item.port === port)) {
    return { ok: false, pid, port, force, error: 'PID no longer owns target port' }
  }
  const result = await runFirst(killPlans(pid, force))
  return { ok: result.ok, pid, port, force, error: result.ok ? undefined : result.error || result.stderr || 'kill failed' }
}

function readState() {
  try {
    if (!globalThis.utools || !globalThis.utools.dbStorage) return null
    return globalThis.utools.dbStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function writeState(state) {
  try {
    if (!globalThis.utools || !globalThis.utools.dbStorage) return false
    globalThis.utools.dbStorage.setItem(STORAGE_KEY, state)
    return true
  } catch {
    return false
  }
}

function normalizeCodexLaunchPathPreference(value) {
  const candidate = typeof value === 'string' ? value.trim() : ''
  if (!candidate || candidate.length > 4096 || candidate.includes('\u0000')) return ''
  const platformPath = codexPlatformPath()
  if (!platformPath.isAbsolute(candidate)) return ''
  return platformPath.normalize(candidate)
}

function readCodexLaunchPathPreference() {
  try {
    if (!globalThis.utools || !globalThis.utools.dbStorage) return ''
    const saved = globalThis.utools.dbStorage.getItem(CODEX_LAUNCH_PATH_STORAGE_KEY)
    const value = saved && typeof saved === 'object' ? saved.path : saved
    return normalizeCodexLaunchPathPreference(value)
  } catch {
    return ''
  }
}

function writeCodexLaunchPathPreference(pathValue) {
  try {
    if (!globalThis.utools || !globalThis.utools.dbStorage) return false
    const path = normalizeCodexLaunchPathPreference(pathValue)
    globalThis.utools.dbStorage.setItem(CODEX_LAUNCH_PATH_STORAGE_KEY, path ? { version: 1, path } : { version: 1 })
    return true
  } catch {
    return false
  }
}

function codexLaunchPathIsFile(pathValue) {
  try { return fs.statSync(pathValue).isFile() } catch { return false }
}

function readLegacyMqttArchive() {
  try {
    if (!globalThis.utools || !globalThis.utools.dbStorage) return null
    return globalThis.utools.dbStorage.getItem(MQTT_ARCHIVE_STORAGE_KEY)
  } catch {
    return null
  }
}

function writeLegacyMqttArchive(archive) {
  try {
    if (!globalThis.utools || !globalThis.utools.dbStorage) return false
    globalThis.utools.dbStorage.setItem(MQTT_ARCHIVE_STORAGE_KEY, archive)
    return true
  } catch {
    return false
  }
}

function archiveHasData(archive) {
  return Boolean(
    archive &&
    typeof archive === 'object' &&
    (
      (Array.isArray(archive.connectionSnapshots) && archive.connectionSnapshots.length > 0) ||
      (Array.isArray(archive.sessions) && archive.sessions.length > 0) ||
      (Array.isArray(archive.publishTemplates) && archive.publishTemplates.length > 0) ||
      (Array.isArray(archive.publishDraftHistory) && archive.publishDraftHistory.length > 0)
    )
  )
}

function defaultMqttArchive() {
  return { version: 1, connectionSnapshots: [], sessions: [], publishTemplates: [], publishDraftHistory: [] }
}

function resolveMqttSqlitePath() {
  const explicitPath = process.env && typeof process.env.EYPC_MQTT_DB_PATH === 'string'
    ? process.env.EYPC_MQTT_DB_PATH.trim()
    : ''
  if (explicitPath) return explicitPath
  let baseDir = ''
  try {
    if (globalThis.utools && typeof globalThis.utools.getPath === 'function') {
      baseDir = String(globalThis.utools.getPath('userData') || '').trim()
    }
  } catch {}
  if (!baseDir) {
    try {
      baseDir = path.join(os.homedir(), '.eypc')
    } catch {
      baseDir = path.join(process.cwd(), '.eypc')
    }
  }
  return path.join(baseDir, 'mqtt-archive.sqlite')
}

function resolveClaudeDataDirectory() {
  let baseDir = ''
  try {
    if (globalThis.utools && typeof globalThis.utools.getPath === 'function') {
      baseDir = String(globalThis.utools.getPath('userData') || '').trim()
    }
  } catch {}
  if (!baseDir) {
    try {
      baseDir = path.join(os.homedir(), '.eypc')
    } catch {
      baseDir = path.join(process.cwd(), '.eypc')
    }
  }
  return path.join(baseDir, 'claude-companion')
}

function resolveMqttUserDataDir() {
  try {
    if (globalThis.utools && typeof globalThis.utools.getPath === 'function') {
      const userData = String(globalThis.utools.getPath('userData') || '').trim()
      if (userData) return userData
    }
  } catch {}
  try {
    return path.dirname(resolveMqttSqlitePath())
  } catch {}
  try {
    return path.join(os.homedir(), '.eypc')
  } catch {
    return path.join(process.cwd(), '.eypc')
  }
}

function resolveMqttSecretsPath() {
  const explicitPath = process.env && typeof process.env.EYPC_MQTT_SECRETS_PATH === 'string'
    ? process.env.EYPC_MQTT_SECRETS_PATH.trim()
    : ''
  return explicitPath || path.join(resolveMqttUserDataDir(), MQTT_SECRETS_FILE_NAME)
}

function resolveMqttSecretsKeyPath() {
  return path.join(path.dirname(resolveMqttSecretsPath()), MQTT_SECRETS_KEY_FILE_NAME)
}

function normalizeSqliteArchiveInput(archive) {
  const source = archive && typeof archive === 'object' ? archive : {}
  return {
    version: 1,
    connectionSnapshots: Array.isArray(source.connectionSnapshots) ? source.connectionSnapshots : [],
    sessions: Array.isArray(source.sessions) ? source.sessions : [],
    publishTemplates: Array.isArray(source.publishTemplates) ? source.publishTemplates : [],
    publishDraftHistory: Array.isArray(source.publishDraftHistory) ? source.publishDraftHistory : []
  }
}

function ensureMqttSqliteSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS connection_snapshots (
      id TEXT PRIMARY KEY,
      updated_at INTEGER NOT NULL DEFAULT 0,
      data_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL,
      started_at INTEGER NOT NULL DEFAULT 0,
      data_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      connection_id TEXT NOT NULL,
      direction TEXT NOT NULL,
      timestamp INTEGER NOT NULL DEFAULT 0,
      data_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS publish_templates (
      id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT 0,
      data_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS publish_draft_history (
      id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT 0,
      data_json TEXT NOT NULL
    );
  `)
}

function createMqttSqliteAdapter() {
  try {
    const sqlite = require('node:sqlite')
    const DatabaseSync = sqlite && sqlite.DatabaseSync
    if (typeof DatabaseSync !== 'function') throw new Error('node:sqlite DatabaseSync unavailable')
    const dbPath = resolveMqttSqlitePath()
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    const db = new DatabaseSync(dbPath)
    ensureMqttSqliteSchema(db)

    const readMeta = db.prepare('SELECT value FROM meta WHERE key = ?')
    const writeMeta = db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
    const clearConnections = db.prepare('DELETE FROM connection_snapshots')
    const clearSessions = db.prepare('DELETE FROM sessions')
    const clearMessages = db.prepare('DELETE FROM messages')
    const clearTemplates = db.prepare('DELETE FROM publish_templates')
    const clearDraftHistory = db.prepare('DELETE FROM publish_draft_history')
    const insertConnection = db.prepare('INSERT OR REPLACE INTO connection_snapshots (id, updated_at, data_json) VALUES (?, ?, ?)')
    const insertSession = db.prepare('INSERT OR REPLACE INTO sessions (id, connection_id, started_at, data_json) VALUES (?, ?, ?, ?)')
    const insertMessage = db.prepare('INSERT OR REPLACE INTO messages (id, session_id, connection_id, direction, timestamp, data_json) VALUES (?, ?, ?, ?, ?, ?)')
    const insertTemplate = db.prepare('INSERT OR REPLACE INTO publish_templates (id, connection_id, updated_at, data_json) VALUES (?, ?, ?, ?)')
    const insertDraftHistory = db.prepare('INSERT OR REPLACE INTO publish_draft_history (id, connection_id, updated_at, data_json) VALUES (?, ?, ?, ?)')

    function writeArchiveToSqlite(archive) {
      const normalized = normalizeSqliteArchiveInput(archive)
      db.exec('BEGIN IMMEDIATE')
      try {
        clearConnections.run()
        clearSessions.run()
        clearMessages.run()
        clearTemplates.run()
        clearDraftHistory.run()
        for (const snapshot of normalized.connectionSnapshots) {
          if (!snapshot || !snapshot.id) continue
          insertConnection.run(String(snapshot.id), Math.trunc(Number(snapshot.updatedAt) || 0), JSON.stringify(snapshot))
        }
        for (const session of normalized.sessions) {
          if (!session || !session.id) continue
          insertSession.run(String(session.id), String(session.connectionId || ''), Math.trunc(Number(session.startedAt) || 0), JSON.stringify(session))
          const messages = Array.isArray(session.messages) ? session.messages : []
          for (const message of messages) {
            if (!message || !message.id) continue
            insertMessage.run(
              String(message.id),
              String(message.sessionId || session.id),
              String(message.connectionId || session.connectionId || ''),
              String(message.direction || 'event'),
              Math.trunc(Number(message.timestamp) || 0),
              JSON.stringify(message)
            )
          }
        }
        for (const template of normalized.publishTemplates) {
          if (!template || !template.id) continue
          insertTemplate.run(String(template.id), String(template.connectionId || ''), Math.trunc(Number(template.operatedAt || template.updatedAt) || 0), JSON.stringify(template))
        }
        for (const item of normalized.publishDraftHistory) {
          if (!item || !item.id) continue
          insertDraftHistory.run(String(item.id), String(item.connectionId || ''), Math.trunc(Number(item.updatedAt) || 0), JSON.stringify(item))
        }
        writeMeta.run('archive_json', JSON.stringify(normalized))
        writeMeta.run('updated_at', String(Date.now()))
        db.exec('COMMIT')
        return true
      } catch (error) {
        try {
          db.exec('ROLLBACK')
        } catch {}
        throw error
      }
    }

    function readArchiveFromSqlite() {
      const current = readMeta.get('archive_json')
      if (current && typeof current.value === 'string') {
        try {
          return normalizeSqliteArchiveInput(JSON.parse(current.value))
        } catch {}
      }
      const legacy = readLegacyMqttArchive()
      if (archiveHasData(legacy)) {
        writeArchiveToSqlite(legacy)
        mqttMigratedLegacyArchive = true
        writeMeta.run('migrated_legacy_archive_at', String(Date.now()))
        return normalizeSqliteArchiveInput(legacy)
      }
      return defaultMqttArchive()
    }

    return {
      dbPath,
      readArchive: readArchiveFromSqlite,
      writeArchive: writeArchiveToSqlite
    }
  } catch (error) {
    mqttStorageLastError = error instanceof Error ? error.message : String(error)
    return null
  }
}

function mqttSqlite() {
  if (mqttSqliteAdapter) return mqttSqliteAdapter
  mqttSqliteAdapter = createMqttSqliteAdapter()
  return mqttSqliteAdapter
}

function getMqttStorageStatus() {
  const adapter = mqttSqlite()
  if (adapter) {
    return {
      mode: 'sqlite',
      sqliteAvailable: true,
      dbPath: adapter.dbPath,
      migratedLegacyArchive: mqttMigratedLegacyArchive,
      ...(mqttStorageLastError ? { lastError: mqttStorageLastError } : {})
    }
  }
  return {
    mode: globalThis.utools && globalThis.utools.dbStorage ? 'legacy-dbStorage' : 'browser-localStorage',
    sqliteAvailable: false,
    migratedLegacyArchive: mqttMigratedLegacyArchive,
    ...(mqttStorageLastError ? { lastError: mqttStorageLastError } : {})
  }
}

function readMqttArchive() {
  const adapter = mqttSqlite()
  if (adapter) {
    try {
      return adapter.readArchive()
    } catch (error) {
      mqttStorageLastError = error instanceof Error ? error.message : String(error)
    }
  }
  return readLegacyMqttArchive()
}

function writeMqttArchive(archive) {
  const adapter = mqttSqlite()
  if (adapter) {
    try {
      const ok = adapter.writeArchive(archive)
      writeLegacyMqttArchive(archive)
      return ok
    } catch (error) {
      mqttStorageLastError = error instanceof Error ? error.message : String(error)
    }
  }
  return writeLegacyMqttArchive(archive)
}

function normalizeMqttSecrets(value) {
  const source = value && typeof value === 'object' ? value : {}
  const candidate = source.version === 1 && source.secrets && typeof source.secrets === 'object'
    ? source.secrets
    : source
  return Object.fromEntries(Object.entries(candidate)
    .map(([key, secret]) => [String(key || '').trim(), secret])
    .filter(([key, secret]) => key && typeof secret === 'string' && secret.length > 0))
}

function isEncryptedMqttSecretsPayload(value) {
  return Boolean(value && typeof value === 'object' && value.version === MQTT_SECRETS_ENCRYPTION_VERSION && typeof value.data === 'string')
}

function mqttSecretsPlaintext(secrets) {
  return JSON.stringify({
    version: 1,
    secrets: normalizeMqttSecrets(secrets)
  })
}

function getElectronSafeStorage() {
  try {
    const electron = require('electron')
    const safeStorage = electron && electron.safeStorage
    if (!safeStorage || typeof safeStorage.encryptString !== 'function' || typeof safeStorage.decryptString !== 'function') return null
    if (typeof safeStorage.isEncryptionAvailable === 'function' && !safeStorage.isEncryptionAvailable()) return null
    return safeStorage
  } catch {
    return null
  }
}

function parseStoredMqttSecretsKey(raw) {
  const text = String(raw || '').trim()
  if (!text) return null
  try {
    const key = Buffer.from(text, 'base64')
    return key.length === 32 ? key : null
  } catch {
    return null
  }
}

function readOrCreateMqttSecretsKey() {
  const keyPath = resolveMqttSecretsKeyPath()
  try {
    const existing = parseStoredMqttSecretsKey(fs.readFileSync(keyPath, 'utf8'))
    if (existing) return existing
  } catch {}
  const key = crypto.randomBytes(32)
  fs.mkdirSync(path.dirname(keyPath), { recursive: true })
  fs.writeFileSync(keyPath, key.toString('base64'), { mode: 0o600 })
  try {
    fs.chmodSync(keyPath, 0o600)
  } catch {}
  return key
}

function encryptMqttSecretsPayload(secrets) {
  const plaintext = mqttSecretsPlaintext(secrets)
  const safeStorage = getElectronSafeStorage()
  if (safeStorage) {
    const encrypted = safeStorage.encryptString(plaintext)
    return {
      version: MQTT_SECRETS_ENCRYPTION_VERSION,
      crypto: 'electron-safe-storage',
      encoding: 'base64',
      data: Buffer.from(encrypted).toString('base64')
    }
  }

  const key = readOrCreateMqttSecretsKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(MQTT_SECRETS_AES_ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    version: MQTT_SECRETS_ENCRYPTION_VERSION,
    crypto: MQTT_SECRETS_AES_ALGORITHM,
    encoding: 'base64',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: ciphertext.toString('base64')
  }
}

function decryptMqttSecretsPayload(payload) {
  if (!isEncryptedMqttSecretsPayload(payload)) return normalizeMqttSecrets(payload)
  try {
    if (payload.crypto === 'electron-safe-storage') {
      const safeStorage = getElectronSafeStorage()
      if (!safeStorage) return {}
      return normalizeMqttSecrets(JSON.parse(safeStorage.decryptString(Buffer.from(payload.data, 'base64'))))
    }
    if (payload.crypto !== MQTT_SECRETS_AES_ALGORITHM || typeof payload.iv !== 'string' || typeof payload.tag !== 'string') return {}
    const decipher = crypto.createDecipheriv(MQTT_SECRETS_AES_ALGORITHM, readOrCreateMqttSecretsKey(), Buffer.from(payload.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'))
    const plaintext = Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64')), decipher.final()]).toString('utf8')
    return normalizeMqttSecrets(JSON.parse(plaintext))
  } catch {
    return {}
  }
}

function readMqttSecrets() {
  try {
    const raw = fs.readFileSync(resolveMqttSecretsPath(), 'utf8')
    const payload = JSON.parse(raw)
    const secrets = decryptMqttSecretsPayload(payload)
    if (!isEncryptedMqttSecretsPayload(payload) && Object.keys(secrets).length) writeMqttSecrets(secrets)
    return secrets
  } catch (error) {
    if (!error || error.code !== 'ENOENT') return {}
  }
  try {
    if (!globalThis.localStorage) return {}
    const raw = globalThis.localStorage.getItem(MQTT_SECRETS_LOCAL_STORAGE_KEY)
    const payload = raw ? JSON.parse(raw) : {}
    const secrets = decryptMqttSecretsPayload(payload)
    if (Object.keys(secrets).length) writeMqttSecrets(secrets)
    return secrets
  } catch {
    return {}
  }
}

function writeMqttSecrets(secrets) {
  const normalized = normalizeMqttSecrets(secrets)
  let encryptedPayload = null
  try {
    encryptedPayload = encryptMqttSecretsPayload(normalized)
  } catch {
    return false
  }
  let wroteFile = false
  try {
    const secretsPath = resolveMqttSecretsPath()
    fs.mkdirSync(path.dirname(secretsPath), { recursive: true })
    fs.writeFileSync(secretsPath, JSON.stringify(encryptedPayload, null, 2), { mode: 0o600 })
    try {
      fs.chmodSync(secretsPath, 0o600)
    } catch {}
    wroteFile = true
  } catch {}
  let wroteLocalStorage = false
  try {
    if (!globalThis.localStorage) return wroteFile
    globalThis.localStorage.setItem(MQTT_SECRETS_LOCAL_STORAGE_KEY, JSON.stringify(encryptedPayload))
    wroteLocalStorage = true
  } catch {
    wroteLocalStorage = false
  }
  return wroteFile || wroteLocalStorage
}

function fileActionResult(outcome, options = {}) {
  return { outcome, ...options }
}

function fileErrorCode(error, fallback = 'io-error') {
  const code = error && typeof error === 'object' ? String(error.code || '') : ''
  if (code === 'ENOENT') return 'not-found'
  if (code === 'EACCES' || code === 'EPERM') return 'permission-denied'
  if (code === 'ETIMEDOUT') return 'timeout'
  if (code === 'ENOTSUP' || code === 'ENOSYS') return 'unsupported'
  const message = String(error && (error.message || error) || '').toLowerCase()
  if (message.includes('no application') || message.includes('no handler') || message.includes('default app')) return 'no-handler'
  if (message.includes('timed out') || message.includes('timeout')) return 'timeout'
  if (message.includes('permission') || message.includes('access denied')) return 'permission-denied'
  if (message.includes('not found') || message.includes('no such file')) return 'not-found'
  return fallback
}

function fileErrorMessage(error, fallback) {
  return String(error && (error.message || error) || fallback)
}

function isAbsoluteFavoritePath(target) {
  if (!target) return false
  return process.platform === 'win32' ? path.win32.isAbsolute(target) : path.posix.isAbsolute(target)
}

function favoriteStatKind(stat) {
  if (stat && typeof stat.isFile === 'function' && stat.isFile()) return 'file'
  if (stat && typeof stat.isDirectory === 'function' && stat.isDirectory()) return 'folder'
  return 'other'
}

async function inspectFavoritePath(target) {
  const normalizedTarget = String(target || '').trim()
  if (!isAbsoluteFavoritePath(normalizedTarget)) {
    return {
      path: normalizedTarget,
      status: 'invalid',
      kind: 'unknown',
      exists: false,
      isSymbolicLink: false,
      errorCode: 'invalid-path',
      error: 'path must be absolute'
    }
  }

  try {
    const lstat = await withFileActionTimeout(fs.promises.lstat ? fs.promises.lstat(normalizedTarget) : fs.promises.stat(normalizedTarget))
    const isSymbolicLink = Boolean(lstat && typeof lstat.isSymbolicLink === 'function' && lstat.isSymbolicLink())
    let resolvedStat = lstat
    let linkTargetKind
    if (isSymbolicLink) {
      try {
        resolvedStat = await withFileActionTimeout(fs.promises.stat(normalizedTarget))
        linkTargetKind = favoriteStatKind(resolvedStat)
      } catch (error) {
        const errorCode = fileErrorCode(error)
        return {
          path: normalizedTarget,
          status: errorCode === 'not-found' ? 'missing' : errorCode === 'permission-denied' ? 'permission-denied' : 'offline',
          kind: 'other',
          exists: errorCode !== 'not-found',
          isSymbolicLink: true,
          linkTargetKind: errorCode === 'not-found' ? 'missing' : 'unknown',
          ...(Number.isFinite(lstat && lstat.size) ? { size: lstat.size } : {}),
          ...(Number.isFinite(lstat && lstat.mtimeMs) ? { modifiedAt: lstat.mtimeMs } : {}),
          errorCode,
          error: fileErrorMessage(error, 'symbolic link target unavailable')
        }
      }
    }
    const inspection = {
      path: normalizedTarget,
      status: 'available',
      kind: favoriteStatKind(resolvedStat),
      exists: true,
      isSymbolicLink,
      ...(linkTargetKind ? { linkTargetKind } : {}),
      ...(Number.isFinite(resolvedStat && resolvedStat.size) ? { size: resolvedStat.size } : {}),
      ...(Number.isFinite(resolvedStat && resolvedStat.mtimeMs) ? { modifiedAt: resolvedStat.mtimeMs } : {})
    }
    if (fs.promises.access) {
      try {
        await withFileActionTimeout(fs.promises.access(normalizedTarget, fs.constants && fs.constants.R_OK))
      } catch (error) {
        const errorCode = fileErrorCode(error)
        return {
          ...inspection,
          status: errorCode === 'not-found' ? 'missing' : errorCode === 'permission-denied' ? 'permission-denied' : 'offline',
          exists: errorCode !== 'not-found',
          errorCode,
          error: fileErrorMessage(error, 'path access check failed')
        }
      }
    }
    return inspection
  } catch (error) {
    const errorCode = fileErrorCode(error)
    return {
      path: normalizedTarget,
      status: errorCode === 'not-found' ? 'missing' : errorCode === 'permission-denied' ? 'permission-denied' : 'offline',
      kind: 'unknown',
      exists: false,
      isSymbolicLink: false,
      errorCode,
      error: fileErrorMessage(error, 'path inspection failed')
    }
  }
}

async function inspectFavoritePaths(targets) {
  const paths = Array.isArray(targets) ? targets : []
  return Promise.all(paths.map((target) => inspectFavoritePath(target)))
}

async function preflightFavoritePath(target) {
  const inspection = await inspectFavoritePath(target)
  if (inspection.status === 'available') return { target: inspection.path, inspection }
  return {
    result: fileActionResult('failed', {
      errorCode: inspection.errorCode || 'io-error',
      message: inspection.error || 'path unavailable',
      paths: [inspection.path]
    })
  }
}

function electronShell() {
  try {
    const electron = require('electron')
    return electron.shell || (electron.remote && electron.remote.shell) || null
  } catch {
    return null
  }
}

async function withFileActionTimeout(value) {
  let timeoutId
  try {
    return await Promise.race([
      Promise.resolve(value),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(Object.assign(new Error('file action timed out'), { code: 'ETIMEDOUT' })), 10_000)
      })
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

function utoolsShellDispatch(method, target) {
  try {
    if (!globalThis.utools) return fileActionResult('failed', { errorCode: 'unsupported', message: `${method} unavailable`, paths: [target] })
    if (method === 'reveal') {
      if (typeof globalThis.utools.shellShowItemInFolder !== 'function') return fileActionResult('failed', { errorCode: 'unsupported', message: 'reveal unavailable', paths: [target] })
      globalThis.utools.shellShowItemInFolder(target)
      return fileActionResult('dispatched', { paths: [target] })
    }
    if (typeof globalThis.utools.shellOpenPath !== 'function') return fileActionResult('failed', { errorCode: 'unsupported', message: 'open unavailable', paths: [target] })
    globalThis.utools.shellOpenPath(target)
    return fileActionResult('dispatched', { paths: [target] })
  } catch (error) {
    return fileActionResult('failed', { errorCode: fileErrorCode(error), message: fileErrorMessage(error, `${method} failed`), paths: [target] })
  }
}

async function copyTextAction(target) {
  const normalizedTarget = String(target || '')
  try {
    if (globalThis.utools && typeof globalThis.utools.copyText === 'function') {
      const copied = await globalThis.utools.copyText(normalizedTarget)
      if (copied === false) return fileActionResult('failed', { errorCode: 'io-error', message: 'copy text failed', paths: [normalizedTarget] })
      return fileActionResult(copied === true ? 'success' : 'dispatched', { paths: [normalizedTarget] })
    }
  } catch (error) {
    return fileActionResult('failed', { errorCode: fileErrorCode(error), message: fileErrorMessage(error, 'copy text failed'), paths: [normalizedTarget] })
  }
  return fileActionResult('failed', { errorCode: 'unsupported', message: 'copy text unavailable', paths: [normalizedTarget] })
}

async function copyText(target) {
  const result = await copyTextAction(target)
  return result.outcome === 'success' || result.outcome === 'dispatched'
}

function saveTextFilePath(result) {
  if (typeof result === 'string') return result.trim()
  if (result && typeof result === 'object' && typeof result.filePath === 'string' && !result.canceled) return result.filePath.trim()
  return ''
}

function saveTextFileName(value) {
  const base = path.basename(String(value || '').trim()) || 'mqtt-export.json'
  return base.toLowerCase().endsWith('.json') ? base : `${base}.json`
}

async function saveTextFile(input) {
  const source = input && typeof input === 'object' ? input : {}
  const suggestedName = saveTextFileName(source.suggestedName)
  const text = String(source.text ?? '')
  const options = {
    title: '保存 MQTT 融合 JSON',
    defaultPath: suggestedName,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  }
  let target = ''
  try {
    if (globalThis.utools && typeof globalThis.utools.showSaveDialog === 'function') {
      target = saveTextFilePath(await globalThis.utools.showSaveDialog(options))
    } else {
      const electron = require('electron')
      const dialog = electron.dialog || (electron.remote && electron.remote.dialog)
      if (dialog && typeof dialog.showSaveDialogSync === 'function') {
        target = saveTextFilePath(dialog.showSaveDialogSync(options))
      } else if (dialog && typeof dialog.showSaveDialog === 'function') {
        target = saveTextFilePath(await dialog.showSaveDialog(options))
      } else {
        return { outcome: 'failed', errorCode: 'unsupported', message: 'save dialog unavailable' }
      }
    }
    if (!target) return { outcome: 'cancelled' }
    await withFileActionTimeout(fs.promises.writeFile(target, text, { encoding: 'utf8' }))
    return { outcome: 'saved' }
  } catch (error) {
    return {
      outcome: 'failed',
      errorCode: fileErrorCode(error),
      message: fileErrorMessage(error, 'save text file failed')
    }
  }
}

async function copyFavoritePath(target) {
  const normalizedTarget = String(target || '').trim()
  if (!normalizedTarget) return fileActionResult('failed', { errorCode: 'invalid-path', message: 'empty path' })
  return copyTextAction(normalizedTarget)
}

async function copyFavoriteItems(targets) {
  const paths = Array.isArray(targets) ? [...new Set(targets.map((target) => String(target || '').trim()).filter(Boolean))] : []
  if (!paths.length) return fileActionResult('failed', { errorCode: 'invalid-path', message: 'no files to copy' })
  const inspections = await inspectFavoritePaths(paths)
  const unavailable = inspections.find((inspection) => inspection.status !== 'available')
  if (unavailable) {
    return fileActionResult('failed', {
      errorCode: unavailable.errorCode || 'io-error',
      message: unavailable.error || 'file unavailable',
      paths
    })
  }
  try {
    if (!globalThis.utools || typeof globalThis.utools.copyFile !== 'function') {
      return fileActionResult('failed', { errorCode: 'unsupported', message: 'copy items unavailable', paths })
    }
    const copied = await globalThis.utools.copyFile(paths)
    return copied
      ? fileActionResult('success', { paths })
      : fileActionResult('failed', { errorCode: 'io-error', message: 'copy items failed', paths })
  } catch (error) {
    return fileActionResult('failed', { errorCode: fileErrorCode(error), message: fileErrorMessage(error, 'copy items failed'), paths })
  }
}

async function macOpen(target, reveal = false) {
  const result = await runFirst([{
    command: '/usr/bin/open',
    args: reveal ? ['-R', target] : [target]
  }])
  if (result && result.ok) return fileActionResult('success', { paths: [target] })
  const error = result && (result.error || result.stderr)
  return fileActionResult('failed', {
    errorCode: fileErrorCode(error, 'no-handler'),
    message: fileErrorMessage(error, reveal ? 'reveal failed' : 'default open failed'),
    paths: [target]
  })
}

async function openFavoritePath(target) {
  const preflight = await preflightFavoritePath(target)
  if (preflight.result) return preflight.result
  const normalizedTarget = preflight.target
  let failure = fileActionResult('failed', { errorCode: 'unsupported', message: 'open unavailable', paths: [normalizedTarget] })
  const shell = electronShell()
  if (shell && typeof shell.openPath === 'function') {
    try {
      const errorText = String(await withFileActionTimeout(shell.openPath(normalizedTarget)) || '').trim()
      if (!errorText) return fileActionResult('success', { paths: [normalizedTarget] })
      failure = fileActionResult('failed', { errorCode: fileErrorCode(errorText, 'no-handler'), message: errorText, paths: [normalizedTarget] })
    } catch (error) {
      failure = fileActionResult('failed', { errorCode: fileErrorCode(error), message: fileErrorMessage(error, 'open failed'), paths: [normalizedTarget] })
    }
  } else if (process.platform === 'darwin') {
    const macResult = await macOpen(normalizedTarget, false)
    if (macResult.outcome === 'success') return macResult
    failure = macResult
  }

  if (process.platform === 'darwin') {
    const revealResult = await macOpen(normalizedTarget, true)
    if (revealResult.outcome === 'success') {
      return fileActionResult('revealed-instead', { message: 'open failed; item revealed instead', paths: [normalizedTarget] })
    }
  }
  const dispatched = utoolsShellDispatch('open', normalizedTarget)
  return dispatched.outcome === 'dispatched' ? dispatched : failure
}

async function revealFavoritePath(target) {
  const preflight = await preflightFavoritePath(target)
  if (preflight.result) return preflight.result
  const normalizedTarget = preflight.target
  if (process.platform === 'darwin') {
    const macResult = await macOpen(normalizedTarget, true)
    if (macResult.outcome === 'success') return macResult
  }
  const shell = electronShell()
  if (shell && typeof shell.showItemInFolder === 'function') {
    try {
      shell.showItemInFolder(normalizedTarget)
      return fileActionResult('dispatched', { paths: [normalizedTarget] })
    } catch (error) {
      const failure = fileActionResult('failed', { errorCode: fileErrorCode(error), message: fileErrorMessage(error, 'reveal failed'), paths: [normalizedTarget] })
      const dispatched = utoolsShellDispatch('reveal', normalizedTarget)
      return dispatched.outcome === 'dispatched' ? dispatched : failure
    }
  }
  return utoolsShellDispatch('reveal', normalizedTarget)
}

function favoriteFileCapabilities() {
  const shell = electronShell()
  const utools = globalThis.utools || {}
  let dialog = null
  try {
    const electron = require('electron')
    dialog = electron.dialog || (electron.remote && electron.remote.dialog)
  } catch {}
  const canPick = typeof utools.showOpenDialog === 'function' || Boolean(dialog && (dialog.showOpenDialog || dialog.showOpenDialogSync))
  return {
    open: Boolean((shell && typeof shell.openPath === 'function') || process.platform === 'darwin' || typeof utools.shellOpenPath === 'function'),
    reveal: Boolean(process.platform === 'darwin' || (shell && typeof shell.showItemInFolder === 'function') || typeof utools.shellShowItemInFolder === 'function'),
    copyPath: typeof utools.copyText === 'function',
    copyItems: typeof utools.copyFile === 'function',
    pickFiles: canPick,
    pickFolders: canPick,
    listDirectory: true,
    inspectPaths: true
  }
}

function normalizePickedFavorite(result, kind) {
  const filePaths = Array.isArray(result)
    ? result
    : Array.isArray(result && result.filePaths)
      ? result.filePaths
      : typeof result === 'string'
        ? [result]
        : []
  const target = String(filePaths[0] || '').trim()
  if (!target) return null
  const explicitKind = result && typeof result === 'object' && result.kind
  let inferredKind = 'folder'
  try {
    inferredKind = fs.statSync(target).isFile() ? 'file' : 'folder'
  } catch {}
  const pickedKind = kind === 'file' || kind === 'folder'
    ? kind
    : explicitKind === 'file' || explicitKind === 'folder'
      ? explicitKind
      : inferredKind
  return {
    kind: pickedKind,
    path: target,
    name: path.basename(target) || target,
    parentId: null,
    tags: [],
    color: pickedKind === 'folder' ? '#2F80ED' : '#F2994A'
  }
}

function normalizePickedFavorites(result, kind) {
  const filePaths = Array.isArray(result)
    ? result
    : Array.isArray(result && result.filePaths)
      ? result.filePaths
      : typeof result === 'string'
        ? [result]
        : []
  return filePaths
    .map((target) => normalizePickedFavorite([target], kind))
    .filter(Boolean)
}

function favoritePickDialogOptions(kind) {
  kind = kind === 'folder' ? 'folder' : 'file'
  const properties = kind === 'folder' ? ['openDirectory', 'multiSelections'] : ['openFile', 'multiSelections']
  return {
    title: kind === 'folder' ? '选择要收藏的文件夹' : '选择要收藏的文件',
    properties
  }
}

async function pickFavoritePaths(kind) {
  const options = favoritePickDialogOptions(kind)
  try {
    if (globalThis.utools && typeof globalThis.utools.showOpenDialog === 'function') {
      const result = await globalThis.utools.showOpenDialog(options)
      return normalizePickedFavorites(result, kind)
    }
  } catch {}

  try {
    const electron = require('electron')
    const dialog = electron.dialog || (electron.remote && electron.remote.dialog)
    if (dialog && typeof dialog.showOpenDialogSync === 'function') {
      return normalizePickedFavorites(dialog.showOpenDialogSync(options), kind)
    }
    if (dialog && typeof dialog.showOpenDialog === 'function') {
      const result = await dialog.showOpenDialog(options)
      return normalizePickedFavorites(result, kind)
    }
  } catch {}

  return []
}

async function pickFavoritePath() {
  const picked = await pickFavoritePaths('file')
  return picked[0] || null
}

async function listFavoriteDirectory(target) {
  const base = String(target || '').trim()
  if (!isAbsoluteFavoritePath(base)) return { ok: false, entries: [], error: 'directory path must be absolute', errorCode: 'invalid-path' }
  try {
    const entries = await withFileActionTimeout(fs.promises.readdir(base, { withFileTypes: true }))
    const normalized = await Promise.all(entries.map(async (entry) => {
      const entryPath = path.join(base, entry.name)
      let lstat = null
      try {
        lstat = await withFileActionTimeout(fs.promises.lstat ? fs.promises.lstat(entryPath) : fs.promises.stat(entryPath))
      } catch {}
      const isSymbolicLink = Boolean((typeof entry.isSymbolicLink === 'function' && entry.isSymbolicLink()) || (lstat && typeof lstat.isSymbolicLink === 'function' && lstat.isSymbolicLink()))
      let resolvedStat = lstat
      let linkTargetKind
      if (isSymbolicLink) {
        try {
          resolvedStat = await withFileActionTimeout(fs.promises.stat(entryPath))
          linkTargetKind = favoriteStatKind(resolvedStat)
        } catch (error) {
          linkTargetKind = fileErrorCode(error) === 'not-found' ? 'missing' : 'unknown'
        }
      }
      const direntKind = typeof entry.isDirectory === 'function' && entry.isDirectory() ? 'folder' : typeof entry.isFile === 'function' && entry.isFile() ? 'file' : null
      const resolvedKind = favoriteStatKind(resolvedStat)
      const kind = direntKind || (resolvedKind === 'folder' || resolvedKind === 'file' ? resolvedKind : null)
      if (!kind) return null
      return {
        kind,
        name: entry.name,
        path: entryPath,
        ...(Number.isFinite(resolvedStat && resolvedStat.size) && kind === 'file' ? { size: resolvedStat.size } : {}),
        ...(Number.isFinite(resolvedStat && resolvedStat.mtimeMs) ? { modifiedAt: resolvedStat.mtimeMs } : {}),
        ...(isSymbolicLink ? { isSymbolicLink: true, linkTargetKind: linkTargetKind || resolvedKind } : {})
      }
    }))
    const supportedEntries = normalized.filter(Boolean)
    return {
      ok: true,
      entries: supportedEntries.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    }
  } catch (error) {
    return { ok: false, entries: [], error: error instanceof Error ? error.message : 'directory listing failed', errorCode: fileErrorCode(error) }
  }
}

function codexError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function codexErrorResult(error) {
  const sourceCode = error && typeof error === 'object' ? String(error.code || '') : ''
  const code = sourceCode === 'ETIMEDOUT' || sourceCode === 'timeout'
    ? 'timeout'
    : sourceCode === 'not-authenticated'
      ? 'not-authenticated'
      : sourceCode === 'runtime-unavailable'
        ? 'runtime-unavailable'
        : sourceCode === 'process-exited'
          ? 'process-exited'
          : sourceCode === 'protocol-error'
            ? 'protocol-error'
            : 'unavailable'
  const messages = {
    timeout: 'Codex App Server 响应超时',
    'not-authenticated': 'Codex 尚未登录或登录已失效',
    'runtime-unavailable': 'Codex CLI 启动失败，请检查本机 Node/Codex 安装',
    'process-exited': 'Codex App Server 已退出',
    'protocol-error': 'Codex App Server 返回了不兼容的数据',
    unavailable: '未找到可用的 Codex CLI'
  }
  return { ok: false, error: { code, message: messages[code] }, receivedAt: Date.now() }
}

function codexRecord(value) {
  return value && typeof value === 'object' ? value : {}
}

function codexNextLiveEvidenceSequence() {
  codexLiveEvidenceSequence += 1
  return codexLiveEvidenceSequence
}

function codexNoteActivityDecision(name) {
  if (!Object.prototype.hasOwnProperty.call(codexActivityDecisionCounters, name)) return
  codexActivityDecisionCounters[name] = Math.min(
    Number.MAX_SAFE_INTEGER,
    codexActivityDecisionCounters[name] + 1
  )
}

function codexActivityDecisionDiagnostics() {
  return { ...codexActivityDecisionCounters }
}

function codexMarkAppServerLiveActive(known) {
  if (!known) return
  known.appServerLiveActive = true
  known.appServerLiveSequence = codexNextLiveEvidenceSequence()
}

function codexClearAppServerLiveActive(known) {
  if (!known) return
  known.appServerLiveActive = false
  delete known.appServerLiveSequence
}

function codexStoredConnectorStatusAuthority(known) {
  return known?.connectorStatusAuthority === 'persisted-decision'
    ? 'persisted-decision'
    : 'connector'
}

function codexDesktopActivitySupersedesAppServer(known, shadows) {
  if (known?.appServerLiveActive !== true || !Number.isInteger(known.appServerLiveSequence)) return false
  const latestDesktopSequence = Math.max(0, ...shadows
    .filter(Boolean)
    .map((shadow) => Number.isInteger(shadow.activityEventSequence) ? shadow.activityEventSequence : 0))
  return latestDesktopSequence > known.appServerLiveSequence
}

function codexNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function codexTimestampMs(value) {
  const parsed = codexNumber(value)
  if (parsed <= 0) return 0
  return parsed < 10_000_000_000 ? parsed * 1000 : parsed
}

function codexPercent(value) {
  return Math.max(0, Math.min(100, Math.round(codexNumber(value))))
}

function codexPlatformPath() {
  return process.platform === 'win32' ? path.win32 : path
}

const CODEX_LAUNCH_SOURCE_LABELS = {
  manual: '手动指定的位置',
  configured: '环境变量指定位置',
  volta: 'Volta 默认位置',
  'npm-global': 'npm 全局目录',
  local: '用户目录默认位置',
  homebrew: 'Homebrew 默认位置',
  nvm: 'NVM 版本目录',
  path: '系统 PATH',
  unknown: '未识别位置'
}

function codexLaunchCandidate(source, state) {
  return {
    source,
    label: CODEX_LAUNCH_SOURCE_LABELS[source] || CODEX_LAUNCH_SOURCE_LABELS.unknown,
    state
  }
}

function codexLaunchResult(plan, launchMode, manualLaunchPathState, launchCandidates) {
  return {
    ...plan,
    launchMode,
    manualLaunchPathState,
    launchCandidates: launchCandidates.slice(0, 8)
  }
}

function codexBundledBinary(jsEntry) {
  const platformPath = codexPlatformPath()
  const target = process.platform === 'win32'
    ? process.arch === 'arm64' ? ['codex-win32-arm64', 'aarch64-pc-windows-msvc', 'codex.exe'] : ['codex-win32-x64', 'x86_64-pc-windows-msvc', 'codex.exe']
    : process.platform === 'darwin'
      ? process.arch === 'x64' ? ['codex-darwin-x64', 'x86_64-apple-darwin', 'codex'] : ['codex-darwin-arm64', 'aarch64-apple-darwin', 'codex']
      : null
  if (!target || !jsEntry) return ''
  const packageRoot = platformPath.dirname(platformPath.dirname(jsEntry))
  const packageName = target[0]
  const vendorTail = ['vendor', target[1], 'bin', target[2]]
  const candidates = [
    platformPath.join(packageRoot, 'node_modules', '@openai', packageName, ...vendorTail),
    platformPath.join(platformPath.dirname(packageRoot), packageName, ...vendorTail),
    platformPath.join(packageRoot, ...vendorTail)
  ]
  return candidates.find((candidate) => {
    try { return fs.existsSync(candidate) } catch { return false }
  }) || ''
}

function codexJavascriptEntry(candidate, resolved) {
  const platformPath = codexPlatformPath()
  if (/\.[cm]?js$/i.test(resolved || '')) return resolved
  if (!/\.(?:cmd|bat)$/i.test(candidate || '')) return ''
  const npmEntry = platformPath.join(platformPath.dirname(candidate), 'node_modules', '@openai', 'codex', 'bin', 'codex.js')
  try { return fs.existsSync(npmEntry) ? npmEntry : '' } catch { return '' }
}

function codexNodeRuntime(candidate) {
  const platformPath = codexPlatformPath()
  const env = process.env || {}
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path')
  const pathValue = pathKey && typeof env[pathKey] === 'string' ? env[pathKey] : ''
  const candidates = [platformPath.join(platformPath.dirname(candidate), process.platform === 'win32' ? 'node.exe' : 'node')]
  if (process.platform === 'win32') {
    if (typeof env.NVM_SYMLINK === 'string') candidates.push(platformPath.join(env.NVM_SYMLINK, 'node.exe'))
    if (typeof env.VOLTA_HOME === 'string') candidates.push(platformPath.join(env.VOLTA_HOME, 'bin', 'node.exe'))
    if (typeof env.ProgramFiles === 'string') candidates.push(platformPath.join(env.ProgramFiles, 'nodejs', 'node.exe'))
  }
  for (const directory of pathValue.split(platformPath.delimiter).filter(Boolean)) {
    candidates.push(platformPath.join(directory, process.platform === 'win32' ? 'node.exe' : 'node'))
  }
  return candidates.find((nodePath) => {
    try { return fs.existsSync(nodePath) } catch { return false }
  }) || ''
}

function codexLaunchPlan(candidate, source = 'unknown', detected = false) {
  const platformPath = codexPlatformPath()
  const command = candidate || 'codex'
  const argsPrefix = []
  if (platformPath.isAbsolute(command)) {
    try {
      const resolved = fs.realpathSync(command)
      const jsEntry = codexJavascriptEntry(command, resolved)
      const bundledBinary = codexBundledBinary(jsEntry)
      if (bundledBinary) {
        return { command: bundledBinary, argsPrefix: [], key: bundledBinary, source, detected: true }
      }
      const nodeRuntime = codexNodeRuntime(command)
      if (jsEntry && nodeRuntime) {
        return { command: nodeRuntime, argsPrefix: [jsEntry], key: `${nodeRuntime}\u0000${jsEntry}`, source, detected: true }
      }
      if (jsEntry || /\.(?:cmd|bat)$/i.test(command)) {
        return { command, argsPrefix: [], key: command, source, detected: false, invalid: true }
      }
    } catch {}
  }
  return { command, argsPrefix, key: command, source, detected }
}

function readCodexProbe(command, args, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      clearTimeout(guard)
      resolve(value)
    }
    const guard = setTimeout(() => finish(''), timeoutMs + 250)
    try {
      execFile(command, args, {
        encoding: 'utf8',
        maxBuffer: CODEX_PROXY_OUTPUT_LIMIT,
        timeout: timeoutMs,
        windowsHide: true
      }, (error, stdout) => finish(error ? '' : String(stdout || '')))
    } catch {
      finish('')
    }
  })
}

function codexScutilValue(output, key) {
  const prefix = `${key} :`
  const line = String(output || '').split(/\r?\n/).find((candidate) => candidate.trim().startsWith(prefix))
  return line ? line.trim().slice(prefix.length).trim() : ''
}

function codexLoopbackPacUrl(value) {
  const match = String(value || '').trim().match(/^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):(\d{1,5})(\/\S*)?$/i)
  if (!match) return ''
  const port = Number(match[2])
  return port > 0 && port <= 65_535 ? match[0] : ''
}

function codexStaticPacProxy(value) {
  const source = String(value || '').replace(/^\uFEFF/, '').trim()
  if (!source || Buffer.byteLength(source, 'utf8') > CODEX_PROXY_OUTPUT_LIMIT) return ''
  const match = source.match(/^function\s+FindProxyForURL\s*\(\s*[A-Za-z_$][\w$]*\s*,\s*[A-Za-z_$][\w$]*\s*\)\s*\{\s*return\s+(["'])([^"'\\\r\n]*)\1\s*;\s*\}\s*;?$/i)
  if (!match) return ''
  const firstDirective = match[2].split(';').map((item) => item.trim()).filter(Boolean)[0] || ''
  const proxy = firstDirective.match(/^PROXY\s+(127\.0\.0\.1|localhost|\[::1\]):(\d{1,5})$/i)
  if (!proxy) return ''
  const port = Number(proxy[2])
  if (port <= 0 || port > 65_535) return ''
  return `http://${proxy[1].toLowerCase()}:${port}`
}

function codexHasExplicitProxyEnvironment(env) {
  const proxyKeys = new Set(['http_proxy', 'https_proxy', 'all_proxy'])
  return Object.entries(env || {}).some(([key, value]) => proxyKeys.has(key.toLowerCase()) && typeof value === 'string' && value.trim())
}

async function resolveCodexProxyEnvironment() {
  const inherited = process.env || {}
  if (process.platform !== 'darwin' || codexHasExplicitProxyEnvironment(inherited)) return {}
  const systemProxy = await readCodexProbe('/usr/sbin/scutil', ['--proxy'], 1_000)
  if (codexScutilValue(systemProxy, 'ProxyAutoConfigEnable') !== '1') return {}
  const pacUrl = codexLoopbackPacUrl(codexScutilValue(systemProxy, 'ProxyAutoConfigURLString'))
  if (!pacUrl) return {}
  const pac = await readCodexProbe('/usr/bin/curl', [
    '--fail',
    '--silent',
    '--show-error',
    '--noproxy',
    '*',
    '--proto',
    '=http',
    '--connect-timeout',
    '1',
    '--max-time',
    '2',
    pacUrl
  ], 2_500)
  const proxy = codexStaticPacProxy(pac)
  if (!proxy) return {}
  return {
    HTTP_PROXY: proxy,
    HTTPS_PROXY: proxy,
    http_proxy: proxy,
    https_proxy: proxy
  }
}

function codexSpawnEnvironment(command, additions = {}) {
  const platformPath = codexPlatformPath()
  const env = { ...(process.env || {}), ...additions }
  if (!platformPath.isAbsolute(command)) return env
  const pathKey = process.platform === 'win32'
    ? Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'Path'
    : 'PATH'
  const commandDir = platformPath.dirname(command)
  const existing = typeof env[pathKey] === 'string' ? env[pathKey] : ''
  const entries = existing.split(platformPath.delimiter).filter(Boolean)
  env[pathKey] = [commandDir, ...entries.filter((entry) => entry !== commandDir)].join(platformPath.delimiter)
  return env
}

function resolveCodexLaunchPlan() {
  const platformPath = codexPlatformPath()
  const candidates = []
  const env = process.env || {}
  const manualPath = readCodexLaunchPathPreference()
  if (manualPath) {
    const exists = codexLaunchPathIsFile(manualPath)
    const plan = exists
      ? codexLaunchPlan(manualPath, 'manual', true)
      : { ...codexLaunchPlan(manualPath, 'manual', false), invalid: true }
    return codexLaunchResult(
      plan,
      'manual',
      plan.detected ? 'valid' : 'invalid',
      [codexLaunchCandidate('manual', plan.detected ? 'available' : 'unusable')]
    )
  }
  if (typeof env.CODEX_CLI_PATH === 'string' && env.CODEX_CLI_PATH.trim()) candidates.push({ path: env.CODEX_CLI_PATH.trim(), source: 'configured' })
  const home = os.homedir()
  if (process.platform === 'win32') {
    const appData = typeof env.APPDATA === 'string' ? env.APPDATA : platformPath.join(home, 'AppData', 'Roaming')
    const localAppData = typeof env.LOCALAPPDATA === 'string' ? env.LOCALAPPDATA : platformPath.join(home, 'AppData', 'Local')
    const voltaHomes = [...new Set([
      typeof env.VOLTA_HOME === 'string' && env.VOLTA_HOME.trim() ? env.VOLTA_HOME.trim() : '',
      platformPath.join(localAppData, 'Volta'),
      platformPath.join(home, '.volta')
    ].filter(Boolean))]
    candidates.push(
      { path: platformPath.join(appData, 'npm', 'codex.cmd'), source: 'npm-global' },
      ...voltaHomes.flatMap((voltaHome) => [
        { path: platformPath.join(voltaHome, 'bin', 'codex.exe'), source: 'volta' },
        { path: platformPath.join(voltaHome, 'bin', 'codex.cmd'), source: 'volta' }
      ]),
      ...(typeof env.NVM_SYMLINK === 'string' ? [{ path: platformPath.join(env.NVM_SYMLINK, 'codex.cmd'), source: 'nvm' }] : []),
      { path: platformPath.join(home, '.codex', 'bin', 'codex.exe'), source: 'local' },
      { path: platformPath.join(home, '.local', 'bin', 'codex.exe'), source: 'local' },
      { path: platformPath.join(localAppData, 'Programs', 'Codex', 'codex.exe'), source: 'local' }
    )
  } else {
    candidates.push(
      { path: platformPath.join(home, '.volta', 'bin', 'codex'), source: 'volta' },
      { path: platformPath.join(home, '.local', 'bin', 'codex'), source: 'local' },
      { path: '/opt/homebrew/bin/codex', source: 'homebrew' },
      { path: '/usr/local/bin/codex', source: 'homebrew' }
    )
    try {
      const nvmRoot = platformPath.join(home, '.nvm', 'versions', 'node')
      const versions = fs.readdirSync(nvmRoot, { withFileTypes: true })
        .filter((entry) => entry && typeof entry.isDirectory === 'function' && entry.isDirectory())
        .map((entry) => entry.name)
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      for (const version of versions) candidates.push({ path: platformPath.join(nvmRoot, version, 'bin', 'codex'), source: 'nvm' })
    } catch {}
  }
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path')
  const pathValue = pathKey && typeof env[pathKey] === 'string' ? env[pathKey] : ''
  const executableNames = process.platform === 'win32' ? ['codex.exe', 'codex.cmd', 'codex.bat'] : ['codex']
  for (const directory of pathValue.split(platformPath.delimiter).filter(Boolean)) {
    for (const executable of executableNames) candidates.push({ path: platformPath.join(directory, executable), source: 'path' })
  }
  let detectedPlan = null
  let invalidPlan = null
  const launchCandidates = []
  const recordCandidate = (source, state) => {
    if (!launchCandidates.some((candidate) => candidate.source === source && candidate.state === state)) {
      launchCandidates.push(codexLaunchCandidate(source, state))
    }
  }
  for (const candidate of candidates) {
    if (!candidate.path || !platformPath.isAbsolute(candidate.path)) continue
    try {
      if (fs.existsSync(candidate.path)) {
        const plan = codexLaunchPlan(candidate.path, candidate.source, true)
        recordCandidate(candidate.source, plan.detected ? 'available' : 'unusable')
        if (plan.detected && !detectedPlan) detectedPlan = plan
        if (!invalidPlan) invalidPlan = plan
      }
    } catch {}
  }
  return codexLaunchResult(
    detectedPlan || invalidPlan || codexLaunchPlan('codex', 'unknown', false),
    'automatic',
    'not-configured',
    launchCandidates
  )
}

function readCodexProbeResult(command, args, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      clearTimeout(guard)
      resolve(value)
    }
    const guard = setTimeout(() => finish({ ok: false, stdout: '' }), timeoutMs + 250)
    try {
      execFile(command, args, {
        encoding: 'utf8',
        maxBuffer: CODEX_PROCESS_OUTPUT_LIMIT,
        timeout: timeoutMs,
        windowsHide: true
      }, (error, stdout) => finish({ ok: !error, stdout: error ? '' : String(stdout || '') }))
    } catch {
      finish({ ok: false, stdout: '' })
    }
  })
}

function inspectCodexConfigFile() {
  const platformPath = codexPlatformPath()
  const env = process.env || {}
  const codexHome = typeof env.CODEX_HOME === 'string' && env.CODEX_HOME.trim()
    ? env.CODEX_HOME.trim()
    : platformPath.join(os.homedir(), '.codex')
  const configFile = platformPath.join(codexHome, 'config.toml')
  try {
    if (!fs.existsSync(configFile)) return 'missing'
    if (typeof fs.accessSync === 'function') fs.accessSync(configFile, fs.constants && fs.constants.R_OK)
    return 'detected'
  } catch {
    return 'unreadable'
  }
}

async function inspectCodexRelatedProcess() {
  if (codexProcessAlive()) return 'running'
  if (process.platform === 'darwin') {
    const result = await readCodexProbeResult('/bin/ps', ['-ax', '-o', 'comm='], 1_500)
    if (!result.ok) return 'unknown'
    const running = result.stdout.split(/\r?\n/).some((line) => {
      const executable = line.trim().split('/').pop() || ''
      return /^codex(?:\.exe)?$/i.test(executable)
    })
    return running ? 'running' : 'not-running'
  }
  if (process.platform === 'win32') {
    const platformPath = codexPlatformPath()
    const systemRoot = process.env.SystemRoot || 'C:\\Windows'
    const tasklist = platformPath.join(systemRoot, 'System32', 'tasklist.exe')
    const result = await readCodexProbeResult(tasklist, ['/FO', 'CSV', '/NH'], 1_500)
    if (!result.ok) return 'unknown'
    const running = result.stdout.split(/\r?\n/).some((line) => /^"?codex(?:\.exe)?"?,/i.test(line.trim()))
    return running ? 'running' : 'not-running'
  }
  return 'unknown'
}

async function inspectCodexEnvironment() {
  const platform = process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'unsupported'
  const launch = resolveCodexLaunchPlan()
  const processState = await inspectCodexRelatedProcess()
  const desktopBridgeState = codexEnsureDesktopBridge().state
  const runtimeState = platform === 'unsupported' ? 'unsupported' : launch.detected ? 'detected' : launch.invalid ? 'unusable' : 'missing'
  return {
    version: 1,
    checking: false,
    platform,
    runtimeState,
    runtimeSource: launch.detected || launch.invalid ? launch.source : 'unknown',
    processState,
    configState: platform === 'unsupported' ? 'unknown' : inspectCodexConfigFile(),
    connectionState: codexProcessAlive() ? 'connected' : 'not-checked',
    desktopBridgeState,
    launchMode: launch.launchMode,
    manualLaunchPathState: launch.manualLaunchPathState,
    launchCandidates: launch.launchCandidates,
    statusFeedMode: desktopBridgeState === 'connected'
      ? 'desktop-live'
      : platform === 'unsupported' ? 'unavailable' : 'connector-fallback',
    checkedAt: Date.now(),
    ...(launch.invalid ? { errorCode: 'runtime-unavailable' } : {})
  }
}

async function setCodexLaunchPath(pathValue) {
  const manualPath = normalizeCodexLaunchPathPreference(pathValue)
  if (!manualPath) throw codexError('runtime-unavailable', '请输入 Codex CLI 可执行文件的完整绝对路径')
  const exists = codexLaunchPathIsFile(manualPath)
  const plan = exists ? codexLaunchPlan(manualPath, 'manual', true) : null
  if (!plan || !plan.detected) throw codexError('runtime-unavailable', '所选 Codex CLI 路径不可用，请选择可执行文件本身')
  if (!writeCodexLaunchPathPreference(manualPath)) throw codexError('unavailable', '无法保存手动 Codex CLI 位置')
  return inspectCodexEnvironment()
}

async function clearCodexLaunchPath() {
  if (!writeCodexLaunchPathPreference('')) throw codexError('unavailable', '无法清除手动 Codex CLI 位置')
  return inspectCodexEnvironment()
}

function rejectCodexPending(error) {
  for (const pending of codexRpcPending.values()) {
    clearTimeout(pending.timeoutId)
    pending.reject(error)
  }
  codexRpcPending.clear()
}

function inspectCodexStderr(chunk) {
  const sample = Buffer.isBuffer(chunk)
    ? chunk.subarray(0, 512).toString('utf8')
    : String(chunk || '').slice(0, 512)
  const normalized = sample.toLowerCase()
  if ((normalized.includes('env: node') || normalized.includes('node: not found')) && normalized.includes('no such file')) {
    codexStartupHint = 'node-not-found'
  }
}

function codexProcessEndError(reason) {
  const reasonCode = reason && typeof reason === 'object' ? String(reason.code || '') : ''
  if (reasonCode === 'ENOENT' || codexStartupHint === 'node-not-found') {
    return codexError('runtime-unavailable', 'Codex runtime unavailable')
  }
  return codexError('process-exited', 'Codex App Server exited')
}

function codexDesktopIpcEndpoint() {
  if (process.platform !== 'darwin') return ''
  return path.join(codexNativeStatePaths().codexHome, 'ipc', 'ipc.sock')
}

function codexDesktopIpcEndpointIsSecure(endpoint) {
  if (!endpoint || process.platform !== 'darwin') return false
  const uid = typeof process.getuid === 'function' ? process.getuid() : null
  if (uid === null) return false
  try {
    const directory = fs.lstatSync(path.dirname(endpoint))
    const socket = fs.lstatSync(endpoint)
    return directory.isDirectory()
      && socket.isSocket()
      && directory.uid === uid
      && socket.uid === uid
      && (directory.mode & 0o077) === 0
      && (socket.mode & 0o077) === 0
  } catch {
    return false
  }
}

function codexDesktopProjectedRequest(value) {
  const source = codexRecord(value)
  return {
    type: typeof source.type === 'string' ? source.type.slice(0, 80) : '',
    method: typeof source.method === 'string' ? source.method.slice(0, 120) : ''
  }
}

function codexDesktopIsPlanImplementationRequest(request) {
  return String(request?.method || '').toLowerCase() === 'item/plan/requestimplementation'
}

function codexDesktopRequestFlag(request) {
  const type = String(request?.type || '').toLowerCase()
  const method = String(request?.method || '').toLowerCase()
  const identifier = `${type}:${method}`.replace(/[^a-z0-9]/g, '')
  if (codexDesktopIsPlanImplementationRequest(request)
    || identifier.includes('userinput')
    || identifier.includes('optionpicker')
    || identifier.includes('setupcodex')) return 'waitingOnUserInput'
  if (identifier.includes('approval')
    || identifier.includes('elicitation')
    || identifier.includes('permissionrequest')) return 'waitingOnApproval'
  return ''
}

function codexDesktopPersistedUnread(known) {
  const unreadAuthority = known?.connectorUnreadAuthority === 'desktop-persisted'
    ? 'desktop-persisted'
    : 'unavailable'
  return {
    hasUnreadTurn: unreadAuthority === 'desktop-persisted' && known?.connectorHasUnreadTurn === true,
    unreadAuthority
  }
}

function codexIsConfirmedTurnEvidence(value) {
  return value === 'turn-completed' || value === 'targeted-after-exit' || value === 'snapshot-corroborated'
}

function codexDesktopUnreadObservation(bridge, known, threadId, shadow, persistedUnreadIds) {
  if (codexDesktopOpenedReadAcknowledgements.has(threadId)) {
    return { hasUnreadTurn: false, unreadAuthority: 'desktop-live' }
  }
  const cachedUnread = bridge?.liveUnread.get(threadId)
  const liveUnread = bridge?.state === 'connected' || cachedUnread?.ownerClientId === 'eypc-open'
    ? cachedUnread
    : null
  const exact = shadow?.unreadEvidence === 'event'
    ? shadow
    : liveUnread?.unreadEvidence === 'event' ? liveUnread : null
  if (exact && typeof exact.hasUnreadTurn === 'boolean') {
    return { hasUnreadTurn: exact.hasUnreadTurn === true, unreadAuthority: 'desktop-live' }
  }
  // A refollow snapshot is the only replayable current-state evidence after
  // an exact read event was missed while EyPc was disconnected. Its explicit
  // false may clear a stale persisted true. A snapshot true remains weaker
  // than native non-membership; completion publication already clears any
  // pre-completion false before a new unread transition is reconciled.
  if (shadow?.unreadEvidence === 'snapshot' && shadow.hasUnreadTurn === false) {
    return { hasUnreadTurn: false, unreadAuthority: 'desktop-live' }
  }
  // A successfully parsed native set remains authoritative over snapshot true:
  // both membership and non-membership beat that weaker positive replay.
  if (persistedUnreadIds instanceof Set) {
    return { hasUnreadTurn: persistedUnreadIds.has(threadId), unreadAuthority: 'desktop-persisted' }
  }
  // Once this preload session has successfully parsed Codex's native unread
  // set, a transient atomic-replace/read failure must not demote that exact
  // membership/nonmembership to a weaker snapshot true. The bridge cache also
  // spans a full inventory object replacement, which prevents refresh/shortcut
  // paths from publishing one stale unread frame before Desktop corrects it.
  if (bridge?.persistedUnread?.has(threadId)) {
    return {
      hasUnreadTurn: bridge.persistedUnread.get(threadId) === true,
      unreadAuthority: 'desktop-persisted'
    }
  }
  const lastPersisted = codexDesktopPersistedUnread(known)
  if (lastPersisted.unreadAuthority === 'desktop-persisted') return lastPersisted
  if (typeof liveUnread?.hasUnreadTurn === 'boolean' || typeof shadow?.hasUnreadTurn === 'boolean') {
    const fallback = typeof liveUnread?.hasUnreadTurn === 'boolean' ? liveUnread : shadow
    return { hasUnreadTurn: fallback?.hasUnreadTurn === true, unreadAuthority: 'desktop-live' }
  }
  return codexDesktopPersistedUnread(known)
}

function codexDesktopAggregateUnread(bridge, known, parentThreadId, ownShadow, childEntries, persistedUnreadIds) {
  const observations = [
    codexDesktopUnreadObservation(bridge, known, parentThreadId, ownShadow, persistedUnreadIds),
    ...childEntries.map(([threadId, shadow]) => {
      return codexDesktopUnreadObservation(bridge, known, threadId, shadow, persistedUnreadIds)
    })
  ]
  const positive = observations.filter((observation) => observation.hasUnreadTurn)
  const authorityPool = positive.length ? positive : observations
  const unreadAuthority = authorityPool.some((observation) => observation.unreadAuthority === 'desktop-live')
    ? 'desktop-live'
    : authorityPool.some((observation) => observation.unreadAuthority === 'desktop-persisted')
      ? 'desktop-persisted'
      : 'unavailable'
  return {
    hasUnreadTurn: positive.length > 0,
    unreadAuthority
  }
}

function codexRememberDesktopSideRelation(threadId, parentThreadId) {
  if (!validCodexThreadId(threadId)
    || !validCodexThreadId(parentThreadId)
    || threadId === parentThreadId) return false
  codexDesktopSideRelations.delete(threadId)
  codexDesktopSideRelations.set(threadId, parentThreadId)
  while (codexDesktopSideRelations.size > CODEX_DESKTOP_SIDE_RELATION_LIMIT) {
    const oldest = codexDesktopSideRelations.keys().next().value
    if (!oldest) break
    codexDesktopSideRelations.delete(oldest)
  }
  return true
}

function codexForgetDesktopSideRelation(threadId) {
  codexDesktopSideRelations.delete(threadId)
}

function codexForgetDesktopSideRelationsForParent(parentThreadId) {
  for (const [threadId, parent] of codexDesktopSideRelations) {
    if (parent === parentThreadId) codexDesktopSideRelations.delete(threadId)
  }
}

function codexRememberDesktopOpenedRead(threadId, parentThreadId, known) {
  if (!validCodexThreadId(threadId) || !validCodexThreadId(parentThreadId)) return false
  const turnStartedAt = codexTimestampMs(known?.lastTurnStartedAt)
  // A process-scope acknowledgement must be bound to a concrete Turn. An
  // unbound false could otherwise suppress every later completion if an open
  // races inventory/bootstrap and no exact started event is observed.
  if (!turnStartedAt) return false
  codexDesktopOpenedReadAcknowledgements.delete(threadId)
  codexDesktopOpenedReadAcknowledgements.set(threadId, {
    parentThreadId,
    turnId: typeof known?.lastTurnId === 'string' ? known.lastTurnId : '',
    turnStartedAt,
    turnCompletedAt: codexTimestampMs(known?.lastTurnCompletedAt)
  })
  while (codexDesktopOpenedReadAcknowledgements.size > CODEX_DESKTOP_OPENED_READ_LIMIT) {
    const oldest = codexDesktopOpenedReadAcknowledgements.keys().next().value
    if (!oldest) break
    codexDesktopOpenedReadAcknowledgements.delete(oldest)
  }
  return true
}

function codexDesktopOpenedReadCoversCompletion(parentThreadId, known) {
  const acknowledgement = codexDesktopOpenedReadAcknowledgements.get(parentThreadId)
  if (!acknowledgement || acknowledgement.parentThreadId !== parentThreadId) return false
  const currentStartedAt = codexTimestampMs(known?.lastTurnStartedAt)
  if (!acknowledgement.turnStartedAt || !currentStartedAt) return false
  const acknowledgementTurnId = typeof acknowledgement.turnId === 'string' ? acknowledgement.turnId : ''
  const currentTurnId = typeof known?.lastTurnId === 'string' ? known.lastTurnId : ''
  // Turn identity is the stable epoch key. completedAt may be filled in or
  // corrected after the task was opened; treating that enrichment as a new
  // completion makes an already-read card recur as unread.
  if (acknowledgementTurnId && currentTurnId) return acknowledgementTurnId === currentTurnId
  if (currentStartedAt < acknowledgement.turnStartedAt) return true
  if (currentStartedAt > acknowledgement.turnStartedAt) return false
  const currentCompletedAt = codexTimestampMs(known?.lastTurnCompletedAt)
  return !acknowledgement.turnCompletedAt || currentCompletedAt <= acknowledgement.turnCompletedAt
}

function codexClearDesktopOpenedRead(bridge, parentThreadId) {
  if (!validCodexThreadId(parentThreadId)) return false
  const relatedThreadIds = []
  for (const [threadId, acknowledgement] of codexDesktopOpenedReadAcknowledgements) {
    if (threadId === parentThreadId || acknowledgement.parentThreadId === parentThreadId) relatedThreadIds.push(threadId)
  }
  if (!relatedThreadIds.length) return false
  for (const threadId of relatedThreadIds) {
    codexDesktopOpenedReadAcknowledgements.delete(threadId)
    const liveUnread = bridge?.liveUnread.get(threadId)
    if (liveUnread?.ownerClientId === 'eypc-open') bridge.liveUnread.delete(threadId)
    const shadow = bridge?.shadows.get(threadId) || bridge?.sideShadows.get(threadId)
    if (liveUnread?.ownerClientId === 'eypc-open'
      && shadow?.unreadEvidence === 'event'
      && shadow.hasUnreadTurn === false) {
      shadow.hasUnreadTurn = undefined
      shadow.unreadEvidence = ''
    }
  }
  return true
}

function codexReconcileDesktopOpenedReadWithTurn(bridge, parentThreadId, turn) {
  if (!codexDesktopOpenedReadAcknowledgements.has(parentThreadId)) return false
  if (!turn?.lastTurnStatus || !codexTimestampMs(turn.lastTurnStartedAt)) return false
  if (turn.lastTurnStatus === 'completed'
    && codexDesktopOpenedReadCoversCompletion(parentThreadId, turn)) return false
  return codexClearDesktopOpenedRead(bridge, parentThreadId)
}

function codexForgetDesktopOpenedReadThread(threadId) {
  codexDesktopOpenedReadAcknowledgements.delete(threadId)
}

function codexDesktopRuntimeProjection(value) {
  const activity = sanitizeCodexActivityStatus(value)
  return activity ? { type: activity.status, activeFlags: activity.activeFlags } : null
}

function codexDesktopShadowFromSnapshot(change) {
  const state = codexRecord(change.conversationState)
  const revision = Number.isInteger(change.revision) && change.revision >= 0 ? change.revision : -1
  const runtime = codexDesktopRuntimeProjection(state.threadRuntimeStatus)
  const requests = Array.isArray(state.requests) && state.requests.length <= 10_000
    ? state.requests.map(codexDesktopProjectedRequest)
    : null
  if (revision < 0 || !runtime || requests === null) return null
  const shadow = {
    revision,
    activityRevision: revision,
    activityEvidence: 'initial-snapshot',
    runtime,
    sideConversation: state.sideConversation === true,
    parentThreadId: validCodexThreadId(state.forkedFromId)
      ? state.forkedFromId
      : typeof state.sideConversationParentNavigationPath === 'string'
        ? (state.sideConversationParentNavigationPath.match(/^\/local\/([0-9a-f-]{36})$/i)?.[1] || '')
        : '',
    resumeState: typeof state.resumeState === 'string' ? state.resumeState.slice(0, 40) : '',
    hasUnreadTurn: typeof state.hasUnreadTurn === 'boolean' ? state.hasUnreadTurn : undefined,
    unreadEvidence: typeof state.hasUnreadTurn === 'boolean' ? 'snapshot' : '',
    requests
  }
  if (codexDesktopShadowActivity(shadow)?.status === 'active') shadow.desktopActiveSince = Date.now()
  return shadow
}

function codexDesktopShadowActivity(shadow) {
  if (!shadow?.runtime) return null
  const activeFlags = new Set(shadow.runtime.activeFlags || [])
  let hasPlanImplementationRequest = false
  let hasOtherWaitingRequest = false
  for (const request of shadow.requests || []) {
    const flag = codexDesktopRequestFlag(request)
    if (flag) activeFlags.add(flag)
    if (codexDesktopIsPlanImplementationRequest(request)) hasPlanImplementationRequest = true
    else if (flag) hasOtherWaitingRequest = true
  }
  // Desktop keeps unresolved requests in conversationState.requests. A plan
  // implementation request is created only after the Plan turn is complete,
  // so it is authoritative user-waiting evidence even if runtime status has
  // already moved to idle in the same patch batch.
  const status = activeFlags.size > 0
    ? 'active'
    : shadow.suppressUncorroboratedActive === true && shadow.runtime.type === 'active'
      ? 'notLoaded'
      : shadow.runtime.type
  const desktopActiveSince = status === 'active' ? codexTimestampMs(shadow.desktopActiveSince) : 0
  const planImplementationOnly = status === 'active'
    && hasPlanImplementationRequest
    && !hasOtherWaitingRequest
    && !activeFlags.has('waitingOnApproval')
  return {
    status,
    activeFlags: status === 'active' ? [...activeFlags] : [],
    ...(planImplementationOnly ? { planImplementationOnly: true } : {}),
    ...(desktopActiveSince ? { desktopActiveSince } : {})
  }
}

function codexDesktopHasStickyPendingRequest(shadow) {
  const activity = codexDesktopShadowActivity(shadow)
  return activity?.status === 'active'
    && activity.activeFlags.some((flag) => flag === 'waitingOnUserInput' || flag === 'waitingOnApproval')
}

function codexRecordDesktopShadowInventoryBaseline(shadow, known) {
  if (!shadow || !known) return
  if (shadow.ownerDisconnectedAt && shadow.inventoryBaselineRecorded === true) return
  const turnStartedAt = codexTimestampMs(known.connectorLastTurnStartedAt || known.lastTurnStartedAt)
  const updatedAt = codexTimestampMs(known.connectorUpdatedAt)
  if (turnStartedAt) shadow.inventoryBaselineTurnStartedAt = turnStartedAt
  if (updatedAt) shadow.inventoryBaselineUpdatedAt = updatedAt
  if (typeof known.connectorLastTurnStatus === 'string') {
    shadow.inventoryBaselineTurnStatus = known.connectorLastTurnStatus
  }
  shadow.inventoryBaselineRecorded = true
}

function codexDesktopOrphanedPendingSuperseded(shadow, known) {
  if (!shadow?.ownerDisconnectedAt || !known) return false
  const baselineTurnStartedAt = codexTimestampMs(shadow.inventoryBaselineTurnStartedAt)
  const currentTurnStartedAt = codexTimestampMs(known.connectorLastTurnStartedAt)
  if (baselineTurnStartedAt && currentTurnStartedAt > baselineTurnStartedAt) return true
  if (baselineTurnStartedAt
    && currentTurnStartedAt === baselineTurnStartedAt
    && shadow.inventoryBaselineTurnStatus
    && known.connectorLastTurnStatus
    && shadow.inventoryBaselineTurnStatus !== known.connectorLastTurnStatus) return true
  const baselineUpdatedAt = codexTimestampMs(shadow.inventoryBaselineUpdatedAt)
  const currentUpdatedAt = codexTimestampMs(known.connectorUpdatedAt)
  return Boolean(baselineUpdatedAt && currentUpdatedAt > baselineUpdatedAt)
}

function codexResolveParentActivity(own, childActivities, options = {}) {
  const activities = [own, ...childActivities].filter(Boolean)
  const activeFlags = [...new Set(activities.flatMap((activity) => activity.activeFlags || []))]
  const hasInput = activeFlags.includes('waitingOnUserInput')
  const hasApproval = activeFlags.includes('waitingOnApproval')
  const hasActive = activities.some((activity) => activity.status === 'active')
  const hasSystemError = activities.some((activity) => activity.status === 'systemError')
  const appServerActive = options.appServerActive === true && !hasActive && !hasInput && !hasApproval
  const status = hasInput || hasApproval || hasActive || appServerActive
    ? 'active'
    : hasSystemError ? 'systemError' : own.status
  const waitingActivities = activities.filter((activity) => (activity.activeFlags || [])
    .some((flag) => flag === 'waitingOnUserInput' || flag === 'waitingOnApproval'))
  const planImplementationOnly = status === 'active'
    && waitingActivities.length > 0
    && waitingActivities.every((activity) => activity.planImplementationOnly === true)
  const desktopActiveSince = status === 'active'
    ? Math.max(0, ...activities
      .filter((activity) => activity.status === 'active')
      .map((activity) => codexTimestampMs(activity.desktopActiveSince)))
    : 0
  return {
    status,
    activeFlags: status === 'active'
      ? (appServerActive ? [...(options.connectorActiveFlags || [])] : activeFlags)
      : [],
    planImplementationOnly,
    hasInput,
    hasApproval,
    hasActive,
    hasSystemError,
    appServerActive,
    desktopActiveSince
  }
}

function codexDesktopPatchIndex(value, length, allowEnd = false) {
  const index = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : -1
  const maximum = allowEnd ? length : length - 1
  return Number.isInteger(index) && index >= 0 && index <= maximum ? index : -1
}

function codexApplyDesktopShadowPatch(shadow, patch) {
  const source = codexRecord(patch)
  const operation = source.op
  const patchPath = Array.isArray(source.path) ? source.path : null
  if (!['add', 'replace', 'remove'].includes(operation) || !patchPath || patchPath.length === 0 || patchPath.length > 64) return false
  const root = patchPath[0]
  // Desktop streams the whole private conversation state. The Companion keeps
  // only the finite runtime/request/read subset; unrelated well-formed patches
  // still advance the stream revision and must not tear down live authority.
  // A malformed patch inside the observed subset remains a resubscribe signal.
  if (!['hasUnreadTurn', 'resumeState', 'threadRuntimeStatus', 'requests'].includes(root)) return true
  if (patchPath.length > 8) return false
  if (root === 'hasUnreadTurn') {
    if (patchPath.length !== 1) return false
    if (operation === 'remove') {
      shadow.hasUnreadTurn = undefined
      shadow.unreadEvidence = ''
    } else if (typeof source.value === 'boolean') {
      shadow.hasUnreadTurn = source.value
      shadow.unreadEvidence = 'event'
    }
    else return false
    return true
  }
  if (root === 'resumeState') {
    if (patchPath.length !== 1) return false
    if (operation === 'remove') shadow.resumeState = ''
    else if (typeof source.value === 'string') shadow.resumeState = source.value.slice(0, 40)
    else return false
    return true
  }
  if (root === 'threadRuntimeStatus') {
    if (patchPath.length === 1) {
      if (operation === 'remove') return false
      const runtime = codexDesktopRuntimeProjection(source.value)
      if (!runtime) return false
      shadow.runtime = runtime
      return true
    }
    if (patchPath[1] === 'type') {
      if (patchPath.length !== 2 || operation === 'remove' || !['active', 'idle', 'notLoaded', 'systemError'].includes(source.value)) return false
      shadow.runtime.type = source.value
      if (source.value !== 'active') shadow.runtime.activeFlags = []
      return true
    }
    if (patchPath[1] !== 'activeFlags') return false
    if (patchPath.length === 2) {
      if (operation === 'remove') shadow.runtime.activeFlags = []
      else if (Array.isArray(source.value)) {
        shadow.runtime.activeFlags = [...new Set(source.value.filter((flag) => flag === 'waitingOnApproval' || flag === 'waitingOnUserInput'))]
      } else return false
      return true
    }
    if (patchPath.length !== 3) return false
    const flags = shadow.runtime.activeFlags || []
    const index = codexDesktopPatchIndex(patchPath[2], flags.length, operation === 'add')
    if (index < 0) return false
    if (operation === 'remove') flags.splice(index, 1)
    else if (source.value === 'waitingOnApproval' || source.value === 'waitingOnUserInput') {
      if (operation === 'add') flags.splice(index, 0, source.value)
      else flags[index] = source.value
    } else return false
    shadow.runtime.activeFlags = [...new Set(flags)]
    return true
  }
  if (root !== 'requests') return false
  if (patchPath.length === 1) {
    if (operation === 'remove') shadow.requests = []
    else if (Array.isArray(source.value) && source.value.length <= 10_000) shadow.requests = source.value.map(codexDesktopProjectedRequest)
    else return false
    return true
  }
  const requests = shadow.requests || []
  const index = codexDesktopPatchIndex(patchPath[1], requests.length, operation === 'add')
  if (index < 0) return false
  if (patchPath.length === 2) {
    if (operation === 'remove') requests.splice(index, 1)
    else if (operation === 'add') requests.splice(index, 0, codexDesktopProjectedRequest(source.value))
    else requests[index] = codexDesktopProjectedRequest(source.value)
    shadow.requests = requests
    return true
  }
  if (patchPath.length !== 3 || (patchPath[2] !== 'type' && patchPath[2] !== 'method')) return false
  if (operation === 'remove') requests[index][patchPath[2]] = ''
  else if (typeof source.value === 'string') requests[index][patchPath[2]] = source.value.slice(0, patchPath[2] === 'type' ? 80 : 120)
  else return false
  return true
}

function codexApplyCachedCompletedTurnEvidence(known, threadId) {
  const turn = codexThreadTurnStatusCache.get(threadId)?.turn
  if (!turn || turn.status !== 'completed' || !turn.startedAt) return false
  const baselineStartedAt = codexTimestampMs(known.lastTurnStartedAt)
  const baselineCompletedAt = codexTimestampMs(known.lastTurnCompletedAt)
  const freshCompleted = turn.startedAt > baselineStartedAt
    || turn.startedAt === baselineStartedAt && known.lastTurnStatus !== 'completed'
    || turn.startedAt === baselineStartedAt
      && known.lastTurnStatus === 'completed'
      && turn.completedAt > baselineCompletedAt
  if (!freshCompleted) return false
  known.lastTurnStatus = 'completed'
  known.lastTurnStartedAt = turn.startedAt
  if (turn.id) known.lastTurnId = turn.id
  else if (turn.startedAt !== baselineStartedAt) delete known.lastTurnId
  if (turn.completedAt) known.lastTurnCompletedAt = turn.completedAt
  else delete known.lastTurnCompletedAt
  known.lastTurnEvidence = 'targeted-after-exit'
  codexClearAppServerLiveActive(known)
  return true
}

function codexPromoteCompletedPlanWait(known) {
  if (!known || known.lastTurnStatus !== 'completed'
    || known.pendingCompletedPlanItem !== true) return false
  delete known.pendingCompletedPlanItem
  const hasOtherWaiting = known.activeFlags.includes('waitingOnApproval')
    || known.activeFlags.includes('waitingOnUserInput')
      && known.planImplementationOnly !== true
  known.connectorPlanImplementationOnly = true
  known.connectorStatus = 'active'
  known.connectorActiveFlags = [...new Set([...known.connectorActiveFlags, 'waitingOnUserInput'])]
  known.connectorStatusAuthority = 'persisted-decision'
  known.status = 'active'
  known.activeFlags = [...new Set([...known.activeFlags, 'waitingOnUserInput'])]
  known.planImplementationOnly = !hasOtherWaiting
  if (known.statusAuthority !== 'desktop-live') {
    known.statusAuthority = 'persisted-decision'
    known.activityEvidence = 'connector'
    delete known.desktopActiveSince
  }
  return true
}

function codexApplyCompletedTurnNotification(bridge, known, threadId, value) {
  if (!bridge || !known || !validCodexThreadId(threadId)) return false
  const turn = sanitizeCodexTurnStatus(value)
  if (turn?.status !== 'completed' || !turn.startedAt) return false
  const previousStartedAt = codexTimestampMs(known.lastTurnStartedAt)
  const previousCompletedAt = codexTimestampMs(known.lastTurnCompletedAt)
  // An exact turn/completed notification is stronger than the local time at
  // which an active shadow was observed. Provider timestamps may be only
  // second-granular, and a task-switch replay can also observe active after the
  // Turn has already completed. Freshness is therefore ordered by this Turn's
  // started/completed revision below, not by cross-clock millisecond ordering.
  // A resumed interrupted/failed Turn can keep the same startedAt. If its
  // exact latest outcome is now completed, that terminal transition is newer
  // even when the intermediate inProgress notification was missed.
  const recoveredTerminalRevision = turn.startedAt === previousStartedAt
    && known.lastTurnStatus !== 'completed'
  const unresolvedLiveActive = known.status === 'active'
    && (known.statusAuthority === 'desktop-live' || known.statusAuthority === 'app-server-live')
    && !codexIsConfirmedTurnEvidence(known.lastTurnEvidence)
  const freshCompleted = turn.startedAt > previousStartedAt
    || recoveredTerminalRevision
    || known.lastTurnStatus === 'completed'
      && turn.startedAt === previousStartedAt
      && (turn.completedAt > previousCompletedAt || unresolvedLiveActive)
  if (!freshCompleted) return false

  bridge.clearOrphanedPending(threadId)
  known.connectorStatus = 'notLoaded'
  known.connectorActiveFlags = []
  known.connectorPlanImplementationOnly = false
  known.connectorStatusAuthority = 'connector'
  if (known.statusAuthority !== 'desktop-live') {
    known.status = 'notLoaded'
    known.activeFlags = []
    known.planImplementationOnly = false
    known.statusAuthority = 'connector'
    known.activityEvidence = 'connector'
    delete known.desktopActiveSince
  }

  codexThreadTurnStatusCache.set(threadId, { turn: { ...turn } })
  known.lastTurnStatus = 'completed'
  known.lastTurnStartedAt = turn.startedAt
  if (turn.id) known.lastTurnId = turn.id
  else if (turn.startedAt !== previousStartedAt) delete known.lastTurnId
  if (turn.completedAt) known.lastTurnCompletedAt = turn.completedAt
  else delete known.lastTurnCompletedAt
  known.lastTurnEvidence = 'turn-completed'
  codexClearAppServerLiveActive(known)
  codexPromoteCompletedPlanWait(known)
  bridge.cancelLatestTurnRefresh(threadId)
  // Any false already present when the exact completion arrives belongs to
  // the pre-completion epoch, even when an unresolved request flag is still
  // draining. Clear it through the shared completion publisher; a genuinely
  // later read-state event can immediately reassert explicit false.
  bridge.publishTargetedCompletion(known, threadId, 'turn-completed')
  return true
}

function codexApplyStartedTurnNotification(bridge, known, threadId, value) {
  if (!bridge || !known || !validCodexThreadId(threadId)) return false
  const turn = sanitizeCodexTurnStatus(value)
  if (turn?.status !== 'inProgress' || !turn.startedAt) return false
  bridge.clearOrphanedPending(threadId)
  delete known.pendingCompletedPlanItem
  known.connectorStatus = 'active'
  known.connectorActiveFlags = []
  known.connectorPlanImplementationOnly = false
  known.connectorStatusAuthority = 'connector'
  const previousStartedAt = codexTimestampMs(known.lastTurnStartedAt)
  const alreadyDesktopActive = known.statusAuthority === 'desktop-live' && known.status === 'active'
  const restoreAppServerActive = () => {
    codexMarkAppServerLiveActive(known)
    if (alreadyDesktopActive) return
    known.status = 'active'
    known.activeFlags = []
    known.planImplementationOnly = false
    known.statusAuthority = 'app-server-live'
    known.activityEvidence = 'activity-event'
    known.activityRevision = codexActivityGeneration
    delete known.desktopActiveSince
  }
  if (known.lastTurnStatus === 'inProgress' && turn.startedAt === previousStartedAt) {
    restoreAppServerActive()
    bridge.cancelLatestTurnRefresh(threadId)
    bridge.cancelCompletionUnreadRefresh(threadId)
    emitCodexActivityDelta([known], false)
    return true
  }
  // App Server notifications are ordered on one stream. A same-second
  // completed/interrupted → started transition is therefore a real restart,
  // not a timestamp regression. Only an actually older startedAt is stale.
  if (turn.startedAt < previousStartedAt) return false

  codexClearDesktopOpenedRead(bridge, threadId)
  codexThreadTurnStatusCache.set(threadId, { turn: { ...turn } })
  known.lastTurnStatus = 'inProgress'
  known.lastTurnStartedAt = turn.startedAt
  if (turn.id) known.lastTurnId = turn.id
  else if (turn.startedAt !== previousStartedAt) delete known.lastTurnId
  delete known.lastTurnCompletedAt
  known.lastTurnEvidence = 'turn-started'
  restoreAppServerActive()
  bridge.cancelLatestTurnRefresh(threadId)
  bridge.cancelCompletionUnreadRefresh(threadId)
  if (!bridge.restoreSuppressedActive(threadId)) emitCodexActivityDelta([known], false)
  return true
}

function codexClearStalePreCompletionLiveUnread(bridge, threadId) {
  if (!bridge || !validCodexThreadId(threadId)) return
  const known = codexActivityInventory.get(threadId)
  if (codexDesktopOpenedReadCoversCompletion(threadId, known)) return
  codexClearDesktopOpenedRead(bridge, threadId)
  const shadow = bridge.shadows.get(threadId)
  if (shadow && shadow.hasUnreadTurn === false) shadow.hasUnreadTurn = undefined
  const liveUnread = bridge.liveUnread.get(threadId)
  if (liveUnread && liveUnread.hasUnreadTurn === false) bridge.liveUnread.delete(threadId)
  for (const [sideId, sideShadow] of bridge.sideShadows) {
    if (sideShadow.parentThreadId !== threadId) continue
    if (sideShadow.hasUnreadTurn === false) sideShadow.hasUnreadTurn = undefined
    const sideLive = bridge.liveUnread.get(sideId)
    if (sideLive && sideLive.hasUnreadTurn === false) bridge.liveUnread.delete(sideId)
  }
}

class CodexDesktopCompanionBridge {
  constructor() {
    this.state = 'not-checked'
    this.socket = null
    this.buffer = Buffer.alloc(0)
    this.clientId = 'initializing-client'
    this.initializeRequestId = ''
    this.initializeTimer = null
    this.reconnectTimer = null
    this.reconnectAttempt = 0
    this.closed = false
    this.inventory = new Set()
    this.shadows = new Map()
    this.sideShadows = new Map()
    this.sideRecoveryPending = new Set()
    this.liveUnread = new Map()
    this.persistedUnread = new Map()
    this.turnRefreshes = new Map()
    this.unreadRefreshes = new Map()
    this.unreadStateWatcher = null
    this.unreadStateWatchTimer = null
    this.lastSocketError = ''
  }

  cancelLatestTurnRefreshByKey(refreshKey) {
    const refresh = this.turnRefreshes.get(refreshKey)
    if (!refresh) return false
    refresh.cancelled = true
    if (refresh.timer) clearTimeout(refresh.timer)
    this.turnRefreshes.delete(refreshKey)
    return true
  }

  cancelLatestTurnRefresh(threadId) {
    if (!validCodexThreadId(threadId)) return
    for (const [refreshKey, refresh] of [...this.turnRefreshes]) {
      if (refresh.parentThreadId === threadId || refresh.queryThreadId === threadId) {
        this.cancelLatestTurnRefreshByKey(refreshKey)
      }
    }
  }

  cancelCompletionUnreadRefresh(threadId) {
    const refresh = this.unreadRefreshes.get(threadId)
    if (!refresh) return
    refresh.cancelled = true
    if (refresh.timer) clearTimeout(refresh.timer)
    this.unreadRefreshes.delete(threadId)
  }

  clearLatestTurnRefreshes() {
    for (const refreshKey of [...this.turnRefreshes.keys()]) this.cancelLatestTurnRefreshByKey(refreshKey)
    for (const threadId of this.unreadRefreshes.keys()) this.cancelCompletionUnreadRefresh(threadId)
  }

  parentLiveEvidenceSequence(threadId) {
    const known = codexActivityInventory.get(threadId)
    const shadows = [
      this.shadows.get(threadId),
      ...[...this.sideShadows.values()].filter((shadow) => shadow.parentThreadId === threadId)
    ].filter(Boolean)
    return Math.max(
      known?.appServerLiveActive === true && Number.isInteger(known.appServerLiveSequence)
        ? known.appServerLiveSequence
        : 0,
      ...shadows.map((shadow) => {
        const activity = codexDesktopShadowActivity(shadow)
        return activity?.status === 'active'
          && shadow.activityEvidence === 'activity-event'
          && Number.isInteger(shadow.activityEventSequence)
          ? shadow.activityEventSequence
          : 0
      })
    )
  }

  hasExactPositiveActivity(threadId) {
    return this.parentLiveEvidenceSequence(threadId) > 0
  }

  hasOtherActiveBranch(parentThreadId, branchThreadId) {
    if (!validCodexThreadId(parentThreadId) || !validCodexThreadId(branchThreadId)) return false
    const known = codexActivityInventory.get(parentThreadId)
    if (branchThreadId !== parentThreadId && known?.appServerLiveActive === true) return true
    const branches = [
      [parentThreadId, this.shadows.get(parentThreadId)],
      ...[...this.sideShadows.entries()].filter(([, shadow]) => shadow.parentThreadId === parentThreadId)
    ]
    return branches.some(([threadId, shadow]) => {
      if (threadId === branchThreadId || !shadow) return false
      return codexDesktopShadowActivity(shadow)?.status === 'active'
    })
  }

  openParentLiveEpoch(threadId, options = {}) {
    const known = codexActivityInventory.get(threadId)
    if (!known) return false
    codexClearDesktopOpenedRead(this, threadId)
    known.lastTurnStatus = 'inProgress'
    delete known.lastTurnId
    delete known.lastTurnCompletedAt
    delete known.lastTurnEvidence
    codexThreadTurnStatusCache.delete(threadId)
    if (options.preserveLatestTurnRefresh !== true) this.cancelLatestTurnRefresh(threadId)
    this.cancelCompletionUnreadRefresh(threadId)
    codexNoteActivityDecision('liveEpochOpened')
    return true
  }

  applyFreshCompletionUnread(known, threadId, options = {}) {
    if (!known || !validCodexThreadId(threadId)) return false
    if (options.clearStaleLiveFalse === true) codexClearStalePreCompletionLiveUnread(this, threadId)
    let unreadIds = null
    try { unreadIds = readCodexDesktopUnreadIds() } catch {}
    if (unreadIds) {
      known.connectorHasUnreadTurn = unreadIds.has(threadId)
      known.connectorUnreadAuthority = 'desktop-persisted'
    }
    const observation = codexDesktopUnreadObservation(this, known, threadId, this.shadows.get(threadId), unreadIds)
    known.hasUnreadTurn = observation.hasUnreadTurn
    known.unreadAuthority = observation.unreadAuthority
    return known.hasUnreadTurn === true
  }

  publishTargetedCompletion(known, threadId, evidence = 'targeted-after-exit') {
    codexClearAppServerLiveActive(known)
    known.lastTurnEvidence = evidence
    codexPromoteCompletedPlanWait(known)
    this.applyFreshCompletionUnread(known, threadId, { clearStaleLiveFalse: true })
    emitCodexActivityDelta([known], false)
    if (known.hasUnreadTurn !== true && !codexDesktopOpenedReadCoversCompletion(threadId, known)) {
      this.scheduleCompletionUnreadRefresh(threadId)
    }
  }

  restoreSuppressedActive(threadId) {
    if (!validCodexThreadId(threadId)) return false
    const shadows = [
      this.shadows.get(threadId),
      ...[...this.sideShadows.values()].filter((shadow) => shadow.parentThreadId === threadId)
    ].filter(Boolean)
    let restored = false
    for (const shadow of shadows) {
      if (shadow.suppressUncorroboratedActive !== true) continue
      delete shadow.suppressUncorroboratedActive
      const activity = codexDesktopShadowActivity(shadow)
      if (activity?.status === 'active' && !codexTimestampMs(shadow.desktopActiveSince)) shadow.desktopActiveSince = Date.now()
      restored = true
    }
    if (restored) this.emitParentActivity(threadId)
    return restored
  }

  verifyTerminalActiveSnapshot(threadId, shadow, options = {}) {
    if (!validCodexThreadId(threadId) || !shadow) return
    const parentThreadId = shadow.sideConversation ? shadow.parentThreadId : threadId
    const known = codexActivityInventory.get(parentThreadId)
    const activity = codexDesktopShadowActivity(shadow)
    const terminalTurn = known?.lastTurnStatus === 'completed'
      || known?.lastTurnStatus === 'failed'
      || known?.lastTurnStatus === 'interrupted'
    if (!known || !validCodexThreadId(parentThreadId) || !terminalTurn || !known.lastTurnStartedAt) return
    if (known.connectorPlanImplementationOnly === true) return
    if (shadow.activityEvidence !== 'initial-snapshot' || this.hasExactPositiveActivity(parentThreadId)) return
    if (activity?.status !== 'active' || activity.activeFlags.length > 0) return
    this.scheduleLatestTurnRefresh(parentThreadId, {
      verifyStaleActive: true,
      settleSnapshotTerminal: true,
      queryThreadId: threadId,
      snapshotThreadId: threadId,
      snapshotActivityRevision: shadow.activityRevision,
      restart: options.restart === true
    })
  }

  settleTerminalActiveSnapshot(threadId, refresh, known, turn) {
    const shadow = this.shadows.get(refresh.snapshotThreadId) || this.sideShadows.get(refresh.snapshotThreadId)
    if (!shadow || shadow.activityRevision !== refresh.snapshotActivityRevision) return false
    const activity = codexDesktopShadowActivity(shadow)
    if (activity?.status !== 'active' || activity.activeFlags.length > 0) return false
    const parentThreadId = shadow.sideConversation ? shadow.parentThreadId : refresh.snapshotThreadId
    if (parentThreadId !== threadId || codexActivityInventory.get(threadId) !== known) return false
    if (refresh.queryThreadId !== threadId
      && this.hasOtherActiveBranch(threadId, refresh.queryThreadId)) {
      shadow.suppressUncorroboratedActive = true
      delete shadow.desktopActiveSince
      this.openParentLiveEpoch(threadId, { preserveLatestTurnRefresh: true })
      codexNoteActivityDecision('branchTerminalDeferred')
      this.emitParentActivity(threadId)
      return true
    }

    codexThreadTurnStatusCache.set(threadId, { turn: { ...turn } })
    known.lastTurnStatus = turn.status
    known.lastTurnStartedAt = turn.startedAt
    if (turn.id) known.lastTurnId = turn.id
    else delete known.lastTurnId
    if (turn.status === 'completed' && turn.completedAt) known.lastTurnCompletedAt = turn.completedAt
    else delete known.lastTurnCompletedAt
    if (turn.status === 'completed') codexClearAppServerLiveActive(known)
    shadow.suppressUncorroboratedActive = true
    delete shadow.desktopActiveSince
    codexNoteActivityDecision('snapshotConflictSuppressed')
    this.emitParentActivity(threadId)
    const settled = codexActivityInventory.get(threadId)
    if (settled?.status !== 'active') {
      if (turn.status === 'completed') {
        // The first non-active delta intentionally preserves the exact shadow
        // transition as unavailable. The corroborated terminal result then
        // closes only that unchanged activity epoch as idle, so Controller
        // cannot guard a recovered same-revision completion back to inProgress.
        settled.status = 'idle'
        settled.activeFlags = []
        settled.planImplementationOnly = false
        delete settled.desktopActiveSince
        this.publishTargetedCompletion(settled, threadId, 'snapshot-corroborated')
      } else {
        // A replayed active snapshot and a failed/interrupted latest Turn are
        // conflicting evidence. Suppression projects unavailable/ongoing, not
        // synthetic idle/stopped, until a real non-active patch arrives.
        settled.lastTurnEvidence = 'targeted-after-exit'
        emitCodexActivityDelta([settled], false)
      }
    }
    return true
  }

  scheduleCompletionUnreadRefresh(threadId) {
    if (!validCodexThreadId(threadId) || this.unreadRefreshes.has(threadId)) return
    const known = codexActivityInventory.get(threadId)
    if (!known) return
    if (known.lastTurnStatus === 'completed' && known.hasUnreadTurn === true) return
    const refresh = {
      cancelled: false,
      timer: null,
      attempt: 0,
      deadlineAt: Date.now() + CODEX_DESKTOP_TURN_REFRESH_DEADLINE_MS
    }
    this.unreadRefreshes.set(threadId, refresh)
    const finish = () => {
      if (refresh.timer) clearTimeout(refresh.timer)
      refresh.timer = null
      if (this.unreadRefreshes.get(threadId) === refresh) this.unreadRefreshes.delete(threadId)
    }
    const run = () => {
      refresh.timer = null
      const latest = codexActivityInventory.get(threadId)
      if (refresh.cancelled || !latest) {
        finish()
        return
      }
      if (latest.lastTurnStatus === 'completed') {
        if (latest.hasUnreadTurn === true) {
          finish()
          return
        }
        const becameUnread = this.applyFreshCompletionUnread(latest, threadId)
        if (becameUnread) {
          emitCodexActivityDelta([{ ...latest, readStateOnly: true }], false)
          finish()
          return
        }
      }
      const remaining = refresh.deadlineAt - Date.now()
      if (remaining <= 0 || refresh.attempt >= CODEX_DESKTOP_TURN_REFRESH_DELAYS_MS.length) {
        finish()
        return
      }
      const nextDelay = CODEX_DESKTOP_TURN_REFRESH_DELAYS_MS[refresh.attempt]
      refresh.attempt += 1
      if (typeof nextDelay !== 'number' || Date.now() + nextDelay >= refresh.deadlineAt) {
        finish()
        return
      }
      refresh.timer = setTimeout(() => { run() }, nextDelay)
      refresh.timer.unref?.()
    }
    void run()
  }

  scheduleLatestTurnRefresh(threadId, options = {}) {
    if (!validCodexThreadId(threadId)) return
    const verifyStaleActive = options.verifyStaleActive === true
    const confirmCompletionEvent = options.confirmCompletionEvent === true
    const forceQuery = options.forceQuery === true
    const settleSnapshotTerminal = verifyStaleActive && options.settleSnapshotTerminal === true
    const confirmCurrentTerminal = verifyStaleActive && !settleSnapshotTerminal && options.confirmCurrentTerminal === true
    const queryThreadId = validCodexThreadId(options.queryThreadId) ? options.queryThreadId : threadId
    const refreshKey = queryThreadId === threadId ? threadId : `${threadId}:${queryThreadId}`
    if (verifyStaleActive && this.hasExactPositiveActivity(threadId)) {
      codexNoteActivityDecision('staleTurnDiscarded')
      return
    }
    const snapshotThreadId = settleSnapshotTerminal && validCodexThreadId(options.snapshotThreadId) ? options.snapshotThreadId : ''
    const snapshotActivityRevision = settleSnapshotTerminal && Number.isInteger(options.snapshotActivityRevision) ? options.snapshotActivityRevision : -1
    const existing = this.turnRefreshes.get(refreshKey)
    if (existing) {
      let incompatibleMode = options.restart === true
        || existing.baselineInventory !== codexActivityInventory.get(threadId)
        || existing.verifyStaleActive !== verifyStaleActive
        || existing.confirmCompletionEvent !== confirmCompletionEvent
        || existing.forceQuery !== forceQuery
      if (!incompatibleMode && verifyStaleActive) {
        if (settleSnapshotTerminal) {
          incompatibleMode = !existing.settleSnapshotTerminal
            || existing.snapshotThreadId !== snapshotThreadId
            || existing.snapshotActivityRevision !== snapshotActivityRevision
        } else if (confirmCurrentTerminal) {
          incompatibleMode = !existing.settleSnapshotTerminal && !existing.confirmCurrentTerminal
        }
      }
      if (!incompatibleMode) return
      this.cancelLatestTurnRefreshByKey(refreshKey)
    }
    const baseline = codexActivityInventory.get(threadId)
    const refresh = {
      cancelled: false,
      timer: null,
      attempt: 0,
      parentThreadId: threadId,
      queryThreadId,
      verifyStaleActive,
      confirmCompletionEvent,
      forceQuery,
      settleSnapshotTerminal,
      confirmCurrentTerminal,
      snapshotThreadId,
      snapshotActivityRevision,
      deadlineAt: Date.now() + CODEX_DESKTOP_TURN_REFRESH_DEADLINE_MS,
      baselineTurnStatus: baseline?.lastTurnStatus,
      baselineTurnStartedAt: codexTimestampMs(baseline?.lastTurnStartedAt),
      baselineInventory: baseline,
      baselineStatusAuthority: baseline?.statusAuthority,
      baselineActivityEvidence: baseline?.activityEvidence,
      baselineActivityRevision: baseline?.activityRevision,
      baselinePositiveSequence: this.parentLiveEvidenceSequence(threadId),
      refreshDelays: confirmCompletionEvent
        ? CODEX_COMPLETION_EVENT_REFRESH_DELAYS_MS
        : CODEX_DESKTOP_TURN_REFRESH_DELAYS_MS
    }
    this.turnRefreshes.set(refreshKey, refresh)

    const finish = (inventoryChanged = false) => {
      if (refresh.timer) clearTimeout(refresh.timer)
      refresh.timer = null
      if (this.turnRefreshes.get(refreshKey) === refresh) this.turnRefreshes.delete(refreshKey)
      if (inventoryChanged) {
        const known = codexActivityInventory.get(threadId)
        markCodexThreadTurnStatusDirty(threadId)
        emitCodexActivityDelta(known ? [known] : [], true, 'urgent')
      }
    }
    const run = async () => {
      refresh.timer = null
      const known = codexActivityInventory.get(threadId)
      if (refresh.cancelled || !known) {
        finish(false)
        return
      }
      const waitingLive = Array.isArray(known.activeFlags)
        && known.activeFlags.some((flag) => flag === 'waitingOnUserInput' || flag === 'waitingOnApproval')
      if (known.status === 'active'
        && !refresh.verifyStaleActive
        && !refresh.confirmCompletionEvent
        && !refresh.forceQuery) {
        finish(false)
        return
      }
      if (refresh.confirmCompletionEvent
        && this.parentLiveEvidenceSequence(threadId) !== refresh.baselinePositiveSequence) {
        codexNoteActivityDecision('staleTurnDiscarded')
        finish(false)
        return
      }
      if (refresh.verifyStaleActive) {
        if (known.status !== 'active' || waitingLive) {
          finish(false)
          return
        }
        if (this.parentLiveEvidenceSequence(threadId) !== refresh.baselinePositiveSequence) {
          codexNoteActivityDecision('staleTurnDiscarded')
          finish(false)
          return
        }
      }
      if (!refresh.verifyStaleActive
        && !refresh.forceQuery
        && codexApplyCachedCompletedTurnEvidence(known, threadId)) {
        finish(false)
        this.publishTargetedCompletion(known, threadId, refresh.confirmCompletionEvent ? 'turn-completed' : 'targeted-after-exit')
        return
      }
      const remaining = refresh.deadlineAt - Date.now()
      if (remaining <= 0 || refresh.attempt >= refresh.refreshDelays.length) {
        finish(true)
        return
      }
      refresh.attempt += 1
      try {
        const page = await requestCodexRpc('thread/turns/list', {
          threadId: queryThreadId,
          limit: 1,
          sortDirection: 'desc',
          itemsView: 'notLoaded'
        }, refresh.confirmCompletionEvent
          ? Math.max(100, Math.min(350, remaining))
          : Math.max(250, Math.min(1_000, remaining)))
        const latestKnown = codexActivityInventory.get(threadId)
        if (refresh.cancelled || latestKnown !== known) {
          finish(false)
          return
        }
        if (!refresh.verifyStaleActive
          && known.status === 'active'
          && !refresh.confirmCompletionEvent
          && !refresh.forceQuery) {
          finish(false)
          return
        }
        if (refresh.confirmCompletionEvent
          && this.parentLiveEvidenceSequence(threadId) !== refresh.baselinePositiveSequence) {
          codexNoteActivityDecision('staleTurnDiscarded')
          finish(false)
          return
        }
        const latestWaitingLive = Array.isArray(known.activeFlags)
          && known.activeFlags.some((flag) => flag === 'waitingOnUserInput' || flag === 'waitingOnApproval')
        if (refresh.verifyStaleActive && (known.status !== 'active' || latestWaitingLive)) {
          finish(false)
          return
        }
        if (refresh.verifyStaleActive
          && this.parentLiveEvidenceSequence(threadId) !== refresh.baselinePositiveSequence) {
          codexNoteActivityDecision('staleTurnDiscarded')
          finish(false)
          return
        }
        const turn = sanitizeCodexTurnStatusPage(page)
        const terminalTurn = turn?.status === 'completed' || turn?.status === 'failed' || turn?.status === 'interrupted'
        const validTerminalTurn = terminalTurn && turn.startedAt > 0
        const finalAttempt = refresh.attempt >= refresh.refreshDelays.length
        if (refresh.settleSnapshotTerminal
          && validTerminalTurn
          && turn.startedAt >= refresh.baselineTurnStartedAt
          && (turn.startedAt > refresh.baselineTurnStartedAt
            || refresh.baselineTurnStatus === 'inProgress'
            || finalAttempt)
          && this.settleTerminalActiveSnapshot(threadId, refresh, known, turn)) {
          finish(false)
          return
        }
        const resumedTerminalRevision = turn?.startedAt === refresh.baselineTurnStartedAt
          && refresh.baselineTurnStatus !== 'inProgress'
        if (refresh.verifyStaleActive && turn?.status === 'inProgress'
          && (turn.startedAt > refresh.baselineTurnStartedAt || resumedTerminalRevision)) {
          codexThreadTurnStatusCache.set(threadId, { turn: { ...turn } })
          known.lastTurnStatus = 'inProgress'
          known.lastTurnStartedAt = turn.startedAt
          if (turn.id) known.lastTurnId = turn.id
          else delete known.lastTurnId
          delete known.lastTurnCompletedAt
          delete known.lastTurnEvidence
          finish(false)
          emitCodexActivityDelta([known], false)
          return
        }
        const unchangedActiveEpoch = known.status === 'active'
          && known.statusAuthority === refresh.baselineStatusAuthority
          && known.activityEvidence === refresh.baselineActivityEvidence
          && known.activityRevision === refresh.baselineActivityRevision
          && known.lastTurnEvidence !== 'turn-started'
        const corroboratedCurrentCompletion = refresh.confirmCurrentTerminal
          && finalAttempt
          && unchangedActiveEpoch
          && refresh.baselineTurnStatus === 'completed'
          && turn?.status === 'completed'
          && turn.startedAt === refresh.baselineTurnStartedAt
        const exactCompletionConfirmation = refresh.confirmCompletionEvent
          && unchangedActiveEpoch
          && refresh.baselineTurnStatus === 'completed'
          && turn?.status === 'completed'
          && turn.startedAt === refresh.baselineTurnStartedAt
        const freshTerminalTurn = exactCompletionConfirmation
          || corroboratedCurrentCompletion
          || turn?.startedAt > refresh.baselineTurnStartedAt
          || turn?.startedAt === refresh.baselineTurnStartedAt
            && (refresh.baselineTurnStatus === 'inProgress' || turn.status !== refresh.baselineTurnStatus)
        if (turn?.startedAt
          && turn.status !== 'inProgress'
          && (!refresh.confirmCompletionEvent || turn.status === 'completed')
          && freshTerminalTurn) {
          if (queryThreadId !== threadId && this.hasOtherActiveBranch(threadId, queryThreadId)) {
            // A child result is branch-scoped evidence. Keep the aggregate Turn
            // epoch live while a sibling/main branch is still authoritatively
            // active; otherwise this async read can reintroduce the old
            // running -> stopped/completed parent regression.
            this.openParentLiveEpoch(threadId, { preserveLatestTurnRefresh: true })
            codexNoteActivityDecision('branchTerminalDeferred')
            finish(false)
            this.emitParentActivity(threadId)
            return
          }
          codexThreadTurnStatusCache.set(threadId, { turn: { ...turn } })
          known.lastTurnStatus = turn.status
          known.lastTurnStartedAt = turn.startedAt
          if (turn.id) known.lastTurnId = turn.id
          else delete known.lastTurnId
          if (turn.status === 'completed' && turn.completedAt) known.lastTurnCompletedAt = turn.completedAt
          else delete known.lastTurnCompletedAt
          codexClearAppServerLiveActive(known)
          finish(false)
          if (turn.status === 'completed') this.publishTargetedCompletion(
            known,
            threadId,
            refresh.confirmCompletionEvent ? 'turn-completed' : 'targeted-after-exit'
          )
          else {
            known.lastTurnEvidence = 'targeted-after-exit'
            emitCodexActivityDelta([known], false)
          }
          return
        }
      } catch {}

      const nextDelay = refresh.refreshDelays[refresh.attempt]
      if (typeof nextDelay !== 'number' || Date.now() + nextDelay >= refresh.deadlineAt) {
        finish(true)
        return
      }
      refresh.timer = setTimeout(() => { void run() }, nextDelay)
      refresh.timer.unref?.()
    }

    void run()
  }

  setState(state) {
    if (this.state === state) return
    this.state = state
    emitCodexActivityDelta([...codexActivityInventory.values()].map(codexActivityPublicEntry), false)
  }

  ensure() {
    if (this.closed || this.socket || this.reconnectTimer || this.state === 'incompatible') return
    if (process.platform !== 'darwin') {
      this.setState('failed')
      return
    }
    const endpoint = codexDesktopIpcEndpoint()
    if (!codexDesktopIpcEndpointIsSecure(endpoint)) {
      this.setState(fs.existsSync(endpoint) ? 'failed' : 'not-running')
      this.scheduleReconnect()
      return
    }
    this.setState('connecting')
    this.lastSocketError = ''
    const socket = net.connect(endpoint)
    this.socket = socket
    socket.on('connect', () => this.initialize())
    socket.on('data', (chunk) => this.handleData(chunk))
    socket.on('error', (error) => {
      this.lastSocketError = String(error?.code || '')
    })
    socket.on('close', () => this.handleClose(socket))
  }

  scheduleReconnect() {
    if (this.closed || this.reconnectTimer || this.state === 'incompatible') return
    const delay = Math.min(CODEX_DESKTOP_IPC_RECONNECT_MAX_MS, 250 * (2 ** Math.min(this.reconnectAttempt, 5)))
    this.reconnectAttempt += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.ensure()
    }, delay)
    this.reconnectTimer.unref?.()
  }

  initialize() {
    this.initializeRequestId = crypto.randomUUID()
    this.send({
      type: 'request',
      method: 'initialize',
      requestId: this.initializeRequestId,
      sourceClientId: 'initializing-client',
      version: 0,
      params: { clientType: 'eypc-desktop-companion' }
    })
    this.initializeTimer = setTimeout(() => this.failConnection('failed'), 2_000)
    this.initializeTimer.unref?.()
  }

  send(message, callback) {
    if (!this.socket || !this.socket.writable) return false
    try {
      const body = Buffer.from(JSON.stringify(message), 'utf8')
      if (!body.length || body.length > CODEX_DESKTOP_IPC_FRAME_MAX_BYTES) return false
      const frame = Buffer.allocUnsafe(body.length + 4)
      frame.writeUInt32LE(body.length, 0)
      body.copy(frame, 4)
      this.socket.write(frame, callback)
      return true
    } catch {
      return false
    }
  }

  sendBroadcast(method, params, targetClientIds, callback) {
    const version = CODEX_DESKTOP_IPC_VERSIONS[method]
    if (!Number.isInteger(version) || this.clientId === 'initializing-client') return false
    return this.send({
      type: 'broadcast',
      method,
      sourceClientId: this.clientId,
      ...(Array.isArray(targetClientIds) ? { targetClientIds } : {}),
      params,
      version
    }, callback)
  }

  handleData(chunk) {
    if (!Buffer.isBuffer(chunk) || !chunk.length) return
    this.buffer = Buffer.concat([this.buffer, chunk])
    for (;;) {
      if (this.buffer.length < 4) return
      const length = this.buffer.readUInt32LE(0)
      if (!length || length > CODEX_DESKTOP_IPC_FRAME_MAX_BYTES) {
        this.failConnection('incompatible')
        return
      }
      if (this.buffer.length < length + 4) return
      const payload = this.buffer.subarray(4, length + 4).toString('utf8')
      this.buffer = this.buffer.subarray(length + 4)
      let message
      try { message = JSON.parse(payload) } catch {
        this.failConnection('incompatible')
        return
      }
      this.handleMessage(message)
    }
  }

  handleMessage(value) {
    const message = codexRecord(value)
    if (message.type === 'client-discovery-request') {
      if (typeof message.requestId === 'string') {
        this.send({ type: 'client-discovery-response', requestId: message.requestId, response: { canHandle: false } })
      }
      return
    }
    if (message.type === 'response' && message.requestId === this.initializeRequestId) {
      const result = codexRecord(message.result)
      if (message.resultType !== 'success' || message.method !== 'initialize' || typeof result.clientId !== 'string' || !result.clientId) {
        this.failConnection('incompatible')
        return
      }
      if (this.initializeTimer) clearTimeout(this.initializeTimer)
      this.initializeTimer = null
      this.clientId = result.clientId
      this.reconnectAttempt = 0
      this.setState('connected')
      this.refreshPersistedUnread(false)
      this.followAll(true)
      return
    }
    if (message.type !== 'broadcast' || typeof message.method !== 'string') return
    if (Array.isArray(message.targetClientIds) && !message.targetClientIds.includes(this.clientId)) return
    if (!codexDesktopIpcVersionAccepted(message.method, message.version)) {
      this.failConnection('incompatible')
      return
    }
    const params = codexRecord(message.params)
    if (message.method === 'client-status-changed') {
      const clientId = typeof params.clientId === 'string' ? params.clientId : ''
      if (clientId && clientId !== this.clientId) {
        if (params.status === 'connected' || params.connected === true) this.followAll(true, [clientId])
        else if (params.status === 'disconnected' || params.status === 'closed' || params.connected === false) {
          this.dropOwner(clientId)
          this.followAll(true)
        }
      }
      return
    }
    if (message.method === 'thread-stream-following-status-requested') {
      if (params.hostId === 'local' && validCodexThreadId(params.conversationId)) {
        const targetClientIds = typeof message.sourceClientId === 'string' && message.sourceClientId
          ? [message.sourceClientId]
          : undefined
        if (this.inventory.has(params.conversationId)
          || this.shadows.size + this.sideShadows.size < CODEX_DESKTOP_PROVISIONAL_FOLLOW_LIMIT) {
          this.followAny(params.conversationId, true, targetClientIds)
        }
      }
      return
    }
    if (message.method === 'thread-stream-following-changed') {
      const threadId = params.conversationId
      const ownerClientId = typeof message.sourceClientId === 'string' ? message.sourceClientId : ''
      const shadow = validCodexThreadId(threadId)
        ? (this.shadows.get(threadId) || this.sideShadows.get(threadId))
        : null
      const sideParentThreadId = shadow?.sideConversation ? shadow.parentThreadId : ''
      if (params.hostId === 'local' && params.following === false && ownerClientId && validCodexThreadId(threadId)) {
        const ownsShadow = shadow?.ownerClientId === ownerClientId
        const ownsUnread = this.liveUnread.get(threadId)?.ownerClientId === ownerClientId
        if (!ownsShadow && !ownsUnread) return
        const stillInventoried = this.inventory.has(threadId)
          || Boolean(sideParentThreadId && this.inventory.has(sideParentThreadId))
        // Codex Desktop changes its own followed conversation when the user
        // switches tasks. EyPc still follows every inventoried task, so keep
        // the last exact shadow while requesting a replacement snapshot from
        // the same live owner. A real owner disconnect is handled separately
        // by client-status-changed and still drops all of its live authority.
        if (ownsShadow && stillInventoried && this.followAny(threadId, true, [ownerClientId])) {
          const parentThreadId = sideParentThreadId || threadId
          const known = codexActivityInventory.get(parentThreadId)
          const activity = codexDesktopShadowActivity(shadow)
          const waitingLive = activity?.activeFlags.includes('waitingOnUserInput')
            || activity?.activeFlags.includes('waitingOnApproval')
          // A task switch can race with turn/completed: the refollowed owner may
          // replay the old active snapshot after the completion notification was
          // missed. Confirm that one ambiguous active edge from latest-Turn data.
          if (known
            && activity?.status === 'active'
            && !waitingLive
            && shadow.activityEvidence === 'initial-snapshot'
            && !this.hasExactPositiveActivity(parentThreadId)) {
            this.scheduleLatestTurnRefresh(parentThreadId, {
              verifyStaleActive: true,
              queryThreadId: threadId,
              restart: true
            })
          }
          return
        }
        if (ownsShadow) {
          this.shadows.delete(threadId)
          this.sideShadows.delete(threadId)
        }
        if (ownsUnread) this.liveUnread.delete(threadId)
        const known = codexActivityInventory.get(threadId)
        if (ownsShadow && sideParentThreadId) {
          this.refreshPersistedUnread(false)
          this.emitParentActivity(sideParentThreadId)
          return
        }
        if (known) {
          if (!ownsShadow && shadow) {
            this.publishShadow(threadId, shadow)
            return
          }
          if (ownsShadow) {
            if (sideParentThreadId) this.emitParentActivity(sideParentThreadId)
            else {
              known.status = known.connectorStatus
              known.activeFlags = [...known.connectorActiveFlags]
              known.planImplementationOnly = known.connectorPlanImplementationOnly === true
              known.statusAuthority = codexStoredConnectorStatusAuthority(known)
              delete known.desktopActiveSince
            }
          }
          this.refreshPersistedUnread(false)
          emitCodexActivityDelta([known], false)
        }
      }
      if (params.hostId === 'local' && params.following === true && ownerClientId && validCodexThreadId(threadId)) {
        this.followAny(threadId, true, [ownerClientId])
      }
      return
    }
    if (message.method === 'thread-stream-state-changed') {
      this.handleStreamState(params, message.sourceClientId, message.version)
      return
    }
    if (message.method === 'thread-read-state-changed') {
      this.handleReadState(params, message.sourceClientId)
      return
    }
    if (message.method === 'thread-archived' || message.method === 'thread-unarchived') {
      if (params.hostId === 'local' && validCodexThreadId(params.conversationId)) {
        const archivedKey = message.method === 'thread-archived'
          ? codexArchivedActivityKey(params.conversationId)
          : ''
        const sideShadow = this.sideShadows.get(params.conversationId)
        if (message.method === 'thread-archived') {
          if (sideShadow || codexDesktopSideRelations.has(params.conversationId)) {
            codexForgetDesktopOpenedReadThread(params.conversationId)
            codexForgetDesktopSideRelation(params.conversationId)
          } else {
            codexClearDesktopOpenedRead(this, params.conversationId)
            codexForgetDesktopSideRelationsForParent(params.conversationId)
          }
          this.sideRecoveryPending.delete(params.conversationId)
          this.persistedUnread.delete(params.conversationId)
        }
        this.shadows.delete(params.conversationId)
        this.sideShadows.delete(params.conversationId)
        this.liveUnread.delete(params.conversationId)
        if (sideShadow?.parentThreadId) this.emitParentActivity(sideShadow.parentThreadId)
        emitCodexActivityDelta([], true, archivedKey ? 'urgent' : 'normal', archivedKey ? [archivedKey] : [])
      }
      return
    }
    if (message.method === 'ipc-connection-reset') {
      this.resetLiveAuthority()
      this.followAll(true)
    }
  }

  handleStreamState(params, ownerClientId, protocolVersion) {
    if (params.hostId !== 'local' || !validCodexThreadId(params.conversationId)) return
    const change = codexRecord(params.change)
    if (change.type === 'snapshot') {
      const previousShadow = this.shadows.get(params.conversationId) || this.sideShadows.get(params.conversationId)
      const normalizedChange = protocolVersion === 6 && !Number.isInteger(change.revision)
        ? { ...change, revision: previousShadow?.ownerClientId === ownerClientId ? previousShadow.revision + 1 : 1 }
        : change
      const shadow = codexDesktopShadowFromSnapshot(normalizedChange)
      if (!shadow) {
        this.resubscribe(params.conversationId)
        return
      }
      shadow.ownerClientId = ownerClientId
      const hintedParentThreadId = codexDesktopSideRelations.get(params.conversationId) || ''
      const recoveryRequested = this.sideRecoveryPending.delete(params.conversationId)
      const recoveringSide = recoveryRequested
        && shadow.sideConversation
        && shadow.parentThreadId === hintedParentThreadId
      if (recoveryRequested && hintedParentThreadId && !recoveringSide && !shadow.sideConversation) {
        codexForgetDesktopSideRelation(params.conversationId)
      }
      if (shadow.desktopActiveSince && previousShadow && codexTimestampMs(previousShadow.desktopActiveSince)) {
        shadow.desktopActiveSince = previousShadow.desktopActiveSince
      }
      if (this.inventory.has(params.conversationId)) {
        this.shadows.set(params.conversationId, shadow)
        this.publishShadow(params.conversationId, shadow)
        this.verifyTerminalActiveSnapshot(params.conversationId, shadow)
      } else if (shadow.sideConversation && validCodexThreadId(shadow.parentThreadId)) {
        codexRememberDesktopSideRelation(params.conversationId, shadow.parentThreadId)
        this.sideShadows.set(params.conversationId, shadow)
        this.publishSideShadow(params.conversationId, shadow)
        this.verifyTerminalActiveSnapshot(params.conversationId, shadow)
        if (recoveringSide && codexDesktopShadowActivity(shadow)?.status !== 'active') {
          this.scheduleLatestTurnRefresh(shadow.parentThreadId, {
            queryThreadId: params.conversationId,
            forceQuery: true,
            restart: true
          })
        }
        if (codexDesktopShadowActivity(shadow)?.status === 'active'
          && this.openParentLiveEpoch(shadow.parentThreadId, { preserveLatestTurnRefresh: true })) {
          this.emitParentActivity(shadow.parentThreadId)
        }
      } else {
        // Keep an unregistered main-task shadow inside preload until the
        // verified inventory scan supplies its anonymous key and action alias.
        this.shadows.set(params.conversationId, shadow)
        markCodexThreadTurnStatusDirty(params.conversationId)
        emitCodexActivityDelta([], true, 'urgent')
      }
      return
    }
    if (change.type !== 'patches') return
    const shadow = this.shadows.get(params.conversationId) || this.sideShadows.get(params.conversationId)
    const legacyUnrevisioned = protocolVersion === 6
      && !Number.isInteger(change.baseRevision)
      && !Number.isInteger(change.revision)
    const baseRevision = legacyUnrevisioned ? shadow?.revision : change.baseRevision
    const revision = legacyUnrevisioned && Number.isInteger(shadow?.revision)
      ? shadow.revision + 1
      : change.revision
    if (!shadow
      || shadow.ownerClientId !== ownerClientId
      || !Number.isInteger(baseRevision)
      || baseRevision !== shadow.revision
      || !Number.isInteger(revision)
      || revision <= shadow.revision
      || !Array.isArray(change.patches)
      || change.patches.length > 50_000) {
      this.resubscribe(params.conversationId)
      return
    }
    const wasActive = codexDesktopShadowActivity(shadow)?.status === 'active'
    let containsReadStatePatch = false
    let containsActivityPatch = false
    for (const patch of change.patches) {
      const patchSource = codexRecord(patch)
      const patchPath = Array.isArray(patchSource.path) ? patchSource.path : []
      if (patchPath[0] === 'hasUnreadTurn') containsReadStatePatch = true
      if (patchPath[0] === 'threadRuntimeStatus' || patchPath[0] === 'requests') containsActivityPatch = true
      if (!codexApplyDesktopShadowPatch(shadow, patch)) {
        this.resubscribe(params.conversationId)
        return
      }
    }
    shadow.revision = revision
    delete shadow.ownerDisconnectedAt
    if (containsActivityPatch) {
      shadow.activityRevision = revision
      shadow.activityEvidence = 'activity-event'
      shadow.activityEventSequence = codexNextLiveEvidenceSequence()
      delete shadow.suppressUncorroboratedActive
    }
    const currentActivity = codexDesktopShadowActivity(shadow)
    const isActive = currentActivity?.status === 'active'
    if (containsActivityPatch && isActive) {
      const evidenceThreadId = shadow.sideConversation ? shadow.parentThreadId : params.conversationId
      const known = codexActivityInventory.get(evidenceThreadId)
      if (known) {
        if (!currentActivity.activeFlags.length) {
          delete known.pendingCompletedPlanItem
          known.connectorPlanImplementationOnly = false
        }
        this.openParentLiveEpoch(evidenceThreadId)
      }
    }
    if (isActive) {
      if (!wasActive || !codexTimestampMs(shadow.desktopActiveSince)) shadow.desktopActiveSince = Date.now()
    } else {
      delete shadow.desktopActiveSince
    }
    const readStateOnly = containsReadStatePatch && !containsActivityPatch
    if (this.sideShadows.has(params.conversationId)) {
      this.publishSideShadow(params.conversationId, shadow, readStateOnly, wasActive && !isActive)
    }
    else this.publishShadow(params.conversationId, shadow, readStateOnly)
  }

  publishShadow(threadId, shadow, readStateOnly = false) {
    const known = codexActivityInventory.get(threadId)
    const activity = codexDesktopShadowActivity(shadow)
    if (!known || !activity) return
    codexRecordDesktopShadowInventoryBaseline(shadow, known)
    const previousStatus = known.status
    const desktopEvidence = shadow.activityEvidence === 'activity-event' ? 'activity-event' : 'initial-snapshot'
    const desktopInactiveSupersedes = desktopEvidence === 'activity-event'
      && activity.status !== 'active'
      && codexDesktopActivitySupersedesAppServer(known, [shadow])
    if (desktopInactiveSupersedes) codexClearAppServerLiveActive(known)
    const appServerActive = known.appServerLiveActive === true && activity.status !== 'active'
    known.status = appServerActive ? 'active' : activity.status
    known.activeFlags = appServerActive ? [...known.connectorActiveFlags] : activity.activeFlags
    known.planImplementationOnly = !appServerActive && activity.planImplementationOnly === true
    known.statusAuthority = appServerActive ? 'app-server-live' : 'desktop-live'
    known.activityEvidence = appServerActive ? 'activity-event' : desktopEvidence
    known.activityRevision = shadow.activityRevision
    if (activity.desktopActiveSince) known.desktopActiveSince = activity.desktopActiveSince
    else delete known.desktopActiveSince
    let unreadIds = null
    try { unreadIds = readCodexDesktopUnreadIds() } catch {}
    const unread = codexDesktopUnreadObservation(this, known, threadId, shadow, unreadIds)
    known.hasUnreadTurn = unread.hasUnreadTurn
    known.unreadAuthority = unread.unreadAuthority
    this.emitParentActivity(threadId, previousStatus, readStateOnly)
  }

  emitParentActivity(parentThreadId, previousStatus, readStateOnly = false, exitQueryThreadId = '') {
    const known = codexActivityInventory.get(parentThreadId)
    if (!known) return
    const priorStatus = previousStatus || known.status
    const own = codexDesktopShadowActivity(this.shadows.get(parentThreadId)) || {
      status: known.connectorStatus,
      activeFlags: [...known.connectorActiveFlags]
    }
    const childEntries = [...this.sideShadows.entries()].filter(([, shadow]) => shadow.parentThreadId === parentThreadId)
    const children = childEntries.map(([, shadow]) => shadow)
    const childActivities = children.map(codexDesktopShadowActivity).filter(Boolean)
    if (known.connectorPlanImplementationOnly === true) {
      childActivities.push({
        status: 'active',
        activeFlags: ['waitingOnUserInput'],
        planImplementationOnly: true
      })
    }
    const evidenceShadows = [this.shadows.get(parentThreadId), ...children].filter(Boolean)
    for (const shadow of evidenceShadows) codexRecordDesktopShadowInventoryBaseline(shadow, known)
    const desktopActivityEvent = evidenceShadows.some((shadow) => shadow.activityEvidence === 'activity-event')
    let projection = codexResolveParentActivity(own, childActivities, {
      appServerActive: known.appServerLiveActive === true,
      connectorActiveFlags: known.connectorActiveFlags
    })
    const desktopInactiveSupersedes = desktopActivityEvent
      && !projection.hasActive
      && !projection.hasInput
      && !projection.hasApproval
      && codexDesktopActivitySupersedesAppServer(known, evidenceShadows)
    if (desktopInactiveSupersedes) {
      codexClearAppServerLiveActive(known)
      projection = codexResolveParentActivity(own, childActivities, {
        appServerActive: false,
        connectorActiveFlags: known.connectorActiveFlags
      })
    }
    const { status, activeFlags, desktopActiveSince } = projection
    known.status = status
    known.activeFlags = activeFlags
    known.planImplementationOnly = projection.planImplementationOnly === true
    known.statusAuthority = projection.appServerActive ? 'app-server-live' : 'desktop-live'
    known.activityEvidence = projection.appServerActive || evidenceShadows.some((shadow) => shadow.activityEvidence === 'activity-event')
      ? 'activity-event'
      : 'initial-snapshot'
    known.activityRevision = Math.max(0, ...evidenceShadows.map((shadow) => Number.isInteger(shadow.activityRevision) ? shadow.activityRevision : 0))
    if (desktopActiveSince) known.desktopActiveSince = desktopActiveSince
    else delete known.desktopActiveSince
    const ownShadow = this.shadows.get(parentThreadId)
    let unreadIds = null
    try { unreadIds = readCodexDesktopUnreadIds() } catch {}
    const unread = codexDesktopAggregateUnread(
      this,
      known,
      parentThreadId,
      ownShadow,
      childEntries,
      unreadIds
    )
    known.hasUnreadTurn = unread.hasUnreadTurn
    known.unreadAuthority = unread.unreadAuthority
    const waitingLive = status === 'active'
      && (activeFlags.includes('waitingOnUserInput') || activeFlags.includes('waitingOnApproval'))
    const openedWaitingEpoch = waitingLive
      && known.lastTurnStatus !== 'inProgress'
      && this.openParentLiveEpoch(parentThreadId)
    emitCodexActivityDelta([readStateOnly && !openedWaitingEpoch ? { ...known, readStateOnly: true } : known], false)
    if (status === 'active') {
      if (!waitingLive && (known.lastTurnStatus === 'completed'
        || priorStatus !== 'active' && known.lastTurnStatus !== 'inProgress')) {
        for (const [evidenceThreadId, shadow] of [
          [parentThreadId, this.shadows.get(parentThreadId)],
          ...childEntries
        ]) {
          this.verifyTerminalActiveSnapshot(evidenceThreadId, shadow)
        }
      } else if (waitingLive) {
        this.cancelLatestTurnRefresh(parentThreadId)
      }
    } else if (priorStatus === 'active') {
      const cachedCompleted = codexApplyCachedCompletedTurnEvidence(known, parentThreadId)
      const confirmedCompletion = known.lastTurnStatus === 'completed'
        && codexIsConfirmedTurnEvidence(known.lastTurnEvidence)
      if (cachedCompleted || confirmedCompletion) this.publishTargetedCompletion(known, parentThreadId)
      else this.scheduleLatestTurnRefresh(parentThreadId, {
        queryThreadId: validCodexThreadId(exitQueryThreadId) ? exitQueryThreadId : parentThreadId
      })
    }
  }

  publishSideShadow(threadId, shadow, readStateOnly = false, exitedActive = false) {
    if (!shadow?.parentThreadId || !this.sideShadows.has(threadId)) return
    this.emitParentActivity(shadow.parentThreadId, undefined, readStateOnly, exitedActive ? threadId : '')
  }

  handleReadState(params, ownerClientId) {
    // v1 Codex editor-extension broadcasts are local-only and omit hostId;
    // v2 Desktop broadcasts may include it. Reject only an explicit non-local
    // host so both real producers reach the same exact read-state path.
    if (params.hostId !== undefined && params.hostId !== 'local') return
    if (!validCodexThreadId(params.conversationId) || typeof params.hasUnreadTurn !== 'boolean') return
    const known = codexActivityInventory.get(params.conversationId)
    const ownShadow = this.shadows.get(params.conversationId)
    const sideShadow = this.sideShadows.get(params.conversationId)
    if (!known && !ownShadow && !sideShadow) return
    if (sideShadow) {
      sideShadow.hasUnreadTurn = params.hasUnreadTurn
      this.liveUnread.set(params.conversationId, {
        ownerClientId: typeof ownerClientId === 'string' && ownerClientId ? ownerClientId : 'desktop-live',
        hasUnreadTurn: params.hasUnreadTurn,
        unreadEvidence: 'event'
      })
      this.emitParentActivity(sideShadow.parentThreadId, undefined, true)
      this.reconcileLateUnread(sideShadow.parentThreadId, params.hasUnreadTurn, params.conversationId)
      return
    }
    this.liveUnread.set(params.conversationId, {
      ownerClientId: typeof ownerClientId === 'string' && ownerClientId ? ownerClientId : 'desktop-live',
      hasUnreadTurn: params.hasUnreadTurn,
      unreadEvidence: 'event'
    })
    if (ownShadow) {
      ownShadow.hasUnreadTurn = params.hasUnreadTurn
      ownShadow.unreadEvidence = 'event'
    }
    if (!known) return
    known.hasUnreadTurn = codexDesktopOpenedReadAcknowledgements.has(params.conversationId)
      ? false
      : params.hasUnreadTurn
    known.unreadAuthority = 'desktop-live'
    emitCodexActivityDelta([{ ...known, readStateOnly: true }], false)
    this.reconcileLateUnread(params.conversationId, params.hasUnreadTurn, params.conversationId)
  }

  markThreadOpenedRead(parentThreadId, targetThreadId = parentThreadId) {
    if (!validCodexThreadId(parentThreadId)) return false
    const known = codexActivityInventory.get(parentThreadId)
    this.cancelCompletionUnreadRefresh(parentThreadId)
    const relatedThreadIds = new Set([parentThreadId])
    if (validCodexThreadId(targetThreadId)) relatedThreadIds.add(targetThreadId)
    for (const [threadId, shadow] of this.sideShadows) {
      if (shadow.parentThreadId === parentThreadId) relatedThreadIds.add(threadId)
    }
    for (const [threadId, relatedParentThreadId] of codexDesktopSideRelations) {
      if (relatedParentThreadId === parentThreadId) relatedThreadIds.add(threadId)
    }
    for (const threadId of relatedThreadIds) {
      codexRememberDesktopOpenedRead(threadId, parentThreadId, known)
      this.liveUnread.set(threadId, {
        ownerClientId: 'eypc-open',
        hasUnreadTurn: false,
        unreadEvidence: 'event'
      })
      const shadow = this.shadows.get(threadId) || this.sideShadows.get(threadId)
      if (shadow) {
        shadow.hasUnreadTurn = false
        shadow.unreadEvidence = 'event'
      }
    }
    if (!known) return false
    this.emitParentActivity(parentThreadId, undefined, true)
    return true
  }

  reconcileLateUnread(threadId, hasUnreadTurn, queryThreadId = threadId) {
    if (hasUnreadTurn !== true || !validCodexThreadId(threadId)) return
    const known = codexActivityInventory.get(threadId)
    if (!known) return
    if (known.status === 'active') {
      if (known.lastTurnEvidence === 'turn-started') return
      if (this.hasExactPositiveActivity(threadId)) return
      const waitingLive = Array.isArray(known.activeFlags)
        && known.activeFlags.some((flag) => flag === 'waitingOnUserInput' || flag === 'waitingOnApproval')
      if (waitingLive || known.lastTurnStatus === 'completed' && codexIsConfirmedTurnEvidence(known.lastTurnEvidence)) return
      const shadow = this.shadows.get(threadId)
      if (known.lastTurnStatus === 'completed' && shadow) this.verifyTerminalActiveSnapshot(threadId, shadow, { restart: true })
      else this.scheduleLatestTurnRefresh(threadId, {
        verifyStaleActive: true,
        queryThreadId,
        confirmCurrentTerminal: known.lastTurnStatus === 'completed',
        restart: true
      })
      return
    }
    if (known.lastTurnStatus === 'completed') return
    this.scheduleLatestTurnRefresh(threadId)
  }

  follow(threadId, following, targetClientIds) {
    if (!this.inventory.has(threadId) && following) return false
    return this.followAny(threadId, following, targetClientIds)
  }

  followAny(threadId, following, targetClientIds) {
    if (!validCodexThreadId(threadId)) return false
    return this.sendBroadcast('thread-stream-following-changed', {
      hostId: 'local',
      conversationId: threadId,
      following: following === true
    }, targetClientIds)
  }

  followAll(following, targetClientIds) {
    if (this.state !== 'connected') return
    for (const threadId of this.inventory) this.follow(threadId, following, targetClientIds)
    for (const [threadId, parentThreadId] of codexDesktopSideRelations) {
      if (!this.inventory.has(parentThreadId)) continue
      if (following && !this.sideShadows.has(threadId)) this.sideRecoveryPending.add(threadId)
      this.followAny(threadId, following, targetClientIds)
    }
  }

  resubscribe(threadId) {
    const sideShadow = this.sideShadows.get(threadId)
    this.shadows.delete(threadId)
    this.sideShadows.delete(threadId)
    this.liveUnread.delete(threadId)
    this.refreshPersistedUnread(false)
    if (sideShadow?.parentThreadId) this.emitParentActivity(sideShadow.parentThreadId)
    else this.restoreConnectorAuthority(threadId)
    this.followAny(threadId, false)
    this.followAny(threadId, true)
  }

  markOwnerDisconnected(shadow, known) {
    if (!shadow) return
    codexRecordDesktopShadowInventoryBaseline(shadow, known)
    shadow.ownerDisconnectedAt = Date.now()
  }

  clearOrphanedPending(parentThreadId) {
    if (!validCodexThreadId(parentThreadId)) return false
    let changed = false
    const ownShadow = this.shadows.get(parentThreadId)
    if (ownShadow?.ownerDisconnectedAt) {
      this.shadows.delete(parentThreadId)
      changed = true
    }
    for (const [threadId, shadow] of this.sideShadows) {
      if (shadow.parentThreadId !== parentThreadId || !shadow.ownerDisconnectedAt) continue
      this.sideShadows.delete(threadId)
      this.sideRecoveryPending.delete(threadId)
      changed = true
    }
    if (!changed) return false
    const known = codexActivityInventory.get(parentThreadId)
    if (known) {
      known.status = known.connectorStatus
      known.activeFlags = [...known.connectorActiveFlags]
      known.planImplementationOnly = known.connectorPlanImplementationOnly === true
      known.statusAuthority = codexStoredConnectorStatusAuthority(known)
      known.activityEvidence = 'connector'
      delete known.desktopActiveSince
    }
    return true
  }

  discardSupersededOrphanedPending() {
    for (const [threadId, shadow] of this.shadows) {
      const known = codexActivityInventory.get(threadId)
      if (!codexDesktopOrphanedPendingSuperseded(shadow, known)) continue
      this.shadows.delete(threadId)
    }
    for (const [threadId, shadow] of this.sideShadows) {
      const known = codexActivityInventory.get(shadow.parentThreadId)
      if (!codexDesktopOrphanedPendingSuperseded(shadow, known)) continue
      this.sideShadows.delete(threadId)
      this.sideRecoveryPending.delete(threadId)
    }
  }

  dropOwner(clientId) {
    const affected = new Set()
    const affectedParents = new Set()
    const retainedParents = new Set()
    for (const [threadId, shadow] of this.shadows) {
      if (shadow.ownerClientId !== clientId) continue
      const known = codexActivityInventory.get(threadId)
      if (codexDesktopHasStickyPendingRequest(shadow)) {
        this.markOwnerDisconnected(shadow, known)
        retainedParents.add(threadId)
        continue
      }
      this.shadows.delete(threadId)
      if (!known) continue
      known.status = known.connectorStatus
      known.activeFlags = [...known.connectorActiveFlags]
      known.planImplementationOnly = known.connectorPlanImplementationOnly === true
      known.statusAuthority = codexStoredConnectorStatusAuthority(known)
      delete known.desktopActiveSince
      affected.add(threadId)
    }
    for (const [threadId, shadow] of this.sideShadows) {
      if (shadow.ownerClientId !== clientId) continue
      const known = codexActivityInventory.get(shadow.parentThreadId)
      if (codexDesktopHasStickyPendingRequest(shadow)) {
        this.markOwnerDisconnected(shadow, known)
        if (shadow.parentThreadId) retainedParents.add(shadow.parentThreadId)
        continue
      }
      this.sideShadows.delete(threadId)
      if (shadow.parentThreadId) affectedParents.add(shadow.parentThreadId)
    }
    for (const [threadId, unread] of this.liveUnread) {
      if (unread.ownerClientId !== clientId) continue
      this.liveUnread.delete(threadId)
      affected.add(threadId)
    }
    for (const threadId of [...affected]) {
      const shadow = this.shadows.get(threadId)
      if (!shadow) continue
      this.publishShadow(threadId, shadow)
      affected.delete(threadId)
    }
    if (!affected.size && !affectedParents.size && !retainedParents.size) return
    this.refreshPersistedUnread(false)
    emitCodexActivityDelta([...affected].map((threadId) => codexActivityInventory.get(threadId)).filter(Boolean), false)
    for (const parentThreadId of new Set([...affectedParents, ...retainedParents])) this.emitParentActivity(parentThreadId)
  }

  restoreConnectorAuthority(threadId) {
    const known = codexActivityInventory.get(threadId)
    if (!known) return
    known.status = known.connectorStatus
    known.activeFlags = [...known.connectorActiveFlags]
    known.planImplementationOnly = known.connectorPlanImplementationOnly === true
    known.statusAuthority = codexStoredConnectorStatusAuthority(known)
    delete known.desktopActiveSince
    emitCodexActivityDelta([codexActivityPublicEntry(known)], false)
  }

  refreshPersistedUnread(emit = true) {
    let unreadIds = null
    try { unreadIds = readCodexDesktopUnreadIds() } catch {}
    const changed = []
    for (const threadId of this.inventory) {
      const known = codexActivityInventory.get(threadId)
      if (!known) continue
      const shadow = this.shadows.get(threadId)
      const connectorHasUnreadTurn = unreadIds instanceof Set
        ? unreadIds.has(threadId)
        : known.connectorHasUnreadTurn === true
      let persistedBecameTrueQuery = Boolean(unreadIds)
        && this.persistedUnread.get(threadId) !== true
        && connectorHasUnreadTurn
        ? threadId
        : ''
      if (unreadIds instanceof Set) {
        this.persistedUnread.set(threadId, connectorHasUnreadTurn)
        known.connectorHasUnreadTurn = connectorHasUnreadTurn
        known.connectorUnreadAuthority = 'desktop-persisted'
      }
      const childEntries = [...this.sideShadows.entries()]
        .filter(([, sideShadow]) => sideShadow.parentThreadId === threadId)
      if (unreadIds) {
        for (const [childThreadId] of childEntries) {
          const childHasUnreadTurn = unreadIds.has(childThreadId)
          if (!persistedBecameTrueQuery
            && this.persistedUnread.get(childThreadId) !== true
            && childHasUnreadTurn) persistedBecameTrueQuery = childThreadId
          this.persistedUnread.set(childThreadId, childHasUnreadTurn)
        }
      }
      const observation = codexDesktopAggregateUnread(
        this,
        known,
        threadId,
        shadow,
        childEntries,
        unreadIds
      )
      if (known.hasUnreadTurn === observation.hasUnreadTurn && known.unreadAuthority === observation.unreadAuthority) {
        if (persistedBecameTrueQuery) this.reconcileLateUnread(threadId, true, persistedBecameTrueQuery)
        continue
      }
      known.hasUnreadTurn = observation.hasUnreadTurn
      known.unreadAuthority = observation.unreadAuthority
      changed.push(codexActivityPublicEntry({ ...known, readStateOnly: true }))
      this.reconcileLateUnread(threadId, observation.hasUnreadTurn, persistedBecameTrueQuery || threadId)
    }
    if (emit && changed.length) emitCodexActivityDelta(changed, false)
  }

  ensureUnreadStateWatcher() {
    if (this.unreadStateWatcher || !this.inventory.size || typeof fs.watch !== 'function') return
    const { primary } = codexNativeStatePaths()
    try {
      this.unreadStateWatcher = fs.watch(path.dirname(primary), { persistent: false }, (_event, filename) => {
        if (filename && String(filename) !== path.basename(primary)) return
        if (this.unreadStateWatchTimer) clearTimeout(this.unreadStateWatchTimer)
        this.unreadStateWatchTimer = setTimeout(() => {
          this.unreadStateWatchTimer = null
          if (!this.closed) this.refreshPersistedUnread(true)
        }, 25)
        this.unreadStateWatchTimer.unref?.()
      })
      this.unreadStateWatcher.unref?.()
      this.unreadStateWatcher.on?.('error', () => this.closeUnreadStateWatcher())
    } catch {
      this.unreadStateWatcher = null
    }
  }

  closeUnreadStateWatcher() {
    if (this.unreadStateWatchTimer) clearTimeout(this.unreadStateWatchTimer)
    this.unreadStateWatchTimer = null
    try { this.unreadStateWatcher?.close() } catch {}
    this.unreadStateWatcher = null
  }

  resetLiveAuthority() {
    this.clearLatestTurnRefreshes()
    const retainedParents = new Set()
    for (const [threadId, shadow] of this.shadows) {
      const known = codexActivityInventory.get(threadId)
      if (codexDesktopHasStickyPendingRequest(shadow)) {
        this.markOwnerDisconnected(shadow, known)
        retainedParents.add(threadId)
      } else this.shadows.delete(threadId)
    }
    for (const [threadId, shadow] of this.sideShadows) {
      const known = codexActivityInventory.get(shadow.parentThreadId)
      if (codexDesktopHasStickyPendingRequest(shadow)) {
        this.markOwnerDisconnected(shadow, known)
        if (shadow.parentThreadId) retainedParents.add(shadow.parentThreadId)
      } else this.sideShadows.delete(threadId)
    }
    this.sideRecoveryPending.clear()
    this.liveUnread.clear()
    const changed = []
    for (const threadId of this.inventory) {
      const known = codexActivityInventory.get(threadId)
      if (!known) continue
      if (retainedParents.has(threadId)) continue
      known.status = known.connectorStatus
      known.activeFlags = [...known.connectorActiveFlags]
      known.planImplementationOnly = known.connectorPlanImplementationOnly === true
      known.statusAuthority = codexStoredConnectorStatusAuthority(known)
      delete known.desktopActiveSince
      changed.push(known)
    }
    this.refreshPersistedUnread(false)
    emitCodexActivityDelta(changed, false)
    for (const parentThreadId of retainedParents) this.emitParentActivity(parentThreadId)
  }

  updateInventory(threadIds, options = {}) {
    const next = new Set([...threadIds].filter(validCodexThreadId))
    const previous = this.inventory
    if (this.state === 'connected') {
      for (const threadId of this.inventory) if (!next.has(threadId)) this.follow(threadId, false)
    }
    for (const [threadId, shadow] of this.shadows) {
      if (next.has(threadId)) continue
      const pendingLiveRegistration = !previous.has(threadId)
        && codexDesktopShadowActivity(shadow)?.status === 'active'
      if (!pendingLiveRegistration) this.shadows.delete(threadId)
    }
    for (const threadId of this.liveUnread.keys()) if (!next.has(threadId)) this.liveUnread.delete(threadId)
    for (const threadId of this.persistedUnread.keys()) {
      const sideParentThreadId = codexDesktopSideRelations.get(threadId)
      if (!next.has(threadId) && !(sideParentThreadId && next.has(sideParentThreadId))) {
        this.persistedUnread.delete(threadId)
      }
    }
    for (const [refreshKey, refresh] of [...this.turnRefreshes]) {
      if (!next.has(refresh.parentThreadId)) this.cancelLatestTurnRefreshByKey(refreshKey)
    }
    for (const threadId of this.unreadRefreshes.keys()) if (!next.has(threadId)) this.cancelCompletionUnreadRefresh(threadId)
    for (const [threadId, shadow] of this.sideShadows) {
      if (next.has(shadow.parentThreadId)) continue
      this.sideShadows.delete(threadId)
      this.sideRecoveryPending.delete(threadId)
      if (this.state === 'connected') this.followAny(threadId, false)
    }
    if (options.preserveSideRelations !== true) {
      for (const [threadId, parentThreadId] of [...codexDesktopSideRelations]) {
        if (next.has(parentThreadId)) continue
        if (this.state === 'connected') this.followAny(threadId, false)
        this.sideRecoveryPending.delete(threadId)
        this.persistedUnread.delete(threadId)
        codexForgetDesktopSideRelation(threadId)
      }
    }
    this.inventory = next
    this.discardSupersededOrphanedPending()
    this.refreshPersistedUnread(false)
    if (next.size) this.ensureUnreadStateWatcher()
    else this.closeUnreadStateWatcher()
    this.ensure()
    for (const [threadId, shadow] of this.shadows) {
      if (next.has(threadId)) {
        this.publishShadow(threadId, shadow)
        this.verifyTerminalActiveSnapshot(threadId, shadow)
      }
    }
    const sideParents = new Set()
    for (const [threadId, shadow] of this.sideShadows) {
      if (!next.has(shadow.parentThreadId)) continue
      sideParents.add(shadow.parentThreadId)
      this.verifyTerminalActiveSnapshot(threadId, shadow)
    }
    for (const parentThreadId of sideParents) this.emitParentActivity(parentThreadId)
    if (this.state === 'connected') {
      for (const threadId of next) if (!previous.has(threadId)) this.follow(threadId, true)
      for (const [threadId, parentThreadId] of codexDesktopSideRelations) {
        if (!next.has(parentThreadId) || previous.has(parentThreadId) || this.sideShadows.has(threadId)) continue
        this.sideRecoveryPending.add(threadId)
        this.followAny(threadId, true)
      }
    }
  }

  activityForThread(threadId) {
    if (this.state !== 'connected') return null
    const shadow = this.shadows.get(threadId)
    return shadow ? codexDesktopShadowActivity(shadow) : null
  }

  navigationTargetForThread(threadId) {
    if (!validCodexThreadId(threadId)) return threadId
    const priority = (shadow) => {
      const activity = codexDesktopShadowActivity(shadow)
      if (!activity) return 0
      if (activity.activeFlags.includes('waitingOnUserInput')) return 3
      if (activity.activeFlags.includes('waitingOnApproval')) return 2
      return activity.status === 'active' ? 1 : 0
    }
    const candidates = [...this.sideShadows.entries()]
      .filter(([, shadow]) => shadow.parentThreadId === threadId && priority(shadow) > 0)
      .sort((left, right) => priority(right[1]) - priority(left[1]) || right[1].revision - left[1].revision)
    return candidates[0]?.[0] || threadId
  }

  notifyThreadArchived(threadId, cwd) {
    if (this.state === 'incompatible') return Promise.resolve('incompatible')
    if (this.state === 'not-running') return Promise.resolve('not-running')
    if (this.state !== 'connected' || !this.socket?.writable) return Promise.resolve('failed')
    return new Promise((resolve) => {
      let settled = false
      const finish = (value) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        if (value === 'dispatched') {
          this.follow(threadId, false)
          codexForgetDesktopSideRelationsForParent(threadId)
          this.shadows.delete(threadId)
          this.liveUnread.delete(threadId)
          this.persistedUnread.delete(threadId)
          emitCodexActivityDelta([], true)
        }
        resolve(value)
      }
      const timeout = setTimeout(() => finish('failed'), 1_000)
      const sent = this.sendBroadcast('thread-archived', {
        hostId: 'local',
        conversationId: threadId,
        cwd: typeof cwd === 'string' ? cwd : ''
      }, undefined, () => finish('dispatched'))
      if (!sent) finish('failed')
    })
  }

  failConnection(state) {
    this.resetLiveAuthority()
    this.setState(state)
    try { this.socket?.destroy() } catch {}
  }

  handleClose(socket) {
    if (this.socket !== socket) return
    if (this.initializeTimer) clearTimeout(this.initializeTimer)
    this.initializeTimer = null
    this.socket = null
    this.buffer = Buffer.alloc(0)
    this.clientId = 'initializing-client'
    if (this.closed) return
    this.resetLiveAuthority()
    if (this.state !== 'incompatible') {
      this.setState(this.lastSocketError === 'ENOENT' || this.lastSocketError === 'ECONNREFUSED' ? 'not-running' : 'failed')
      this.scheduleReconnect()
    }
  }

  dispose() {
    this.closed = true
    this.clearLatestTurnRefreshes()
    this.closeUnreadStateWatcher()
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.initializeTimer) clearTimeout(this.initializeTimer)
    this.reconnectTimer = null
    this.initializeTimer = null
    if (this.state === 'connected') this.followAll(false)
    try { this.socket?.destroy() } catch {}
    this.socket = null
    this.shadows.clear()
    this.sideShadows.clear()
    this.sideRecoveryPending.clear()
    this.liveUnread.clear()
    this.persistedUnread.clear()
    this.state = 'not-checked'
  }
}

function codexEnsureDesktopBridge() {
  if (!codexDesktopBridge || codexDesktopBridge.closed) codexDesktopBridge = new CodexDesktopCompanionBridge()
  codexDesktopBridge.ensure()
  return codexDesktopBridge
}

function closeCodexDesktopBridge() {
  codexDesktopBridge?.dispose()
  codexDesktopBridge = null
}

function resetCodexThreadSessionState(options = {}) {
  codexThreadActions.clear()
  codexProjectActions.clear()
  codexActivityInventory = new Map()
  codexActivitySourceFingerprint = ''
  codexActivityGeneration += 1
  codexActivityDecisionCounters = {
    liveEpochOpened: 0,
    staleTurnDiscarded: 0,
    branchTerminalDeferred: 0,
    snapshotConflictSuppressed: 0,
    missingMappingRetained: 0
  }
  if (options.preserveDesktopActivity !== true) {
    codexDesktopBridge?.updateInventory(new Set(), { preserveSideRelations: true })
  }
  codexThreadTurnStatusCache.clear()
  codexThreadTurnStatusDirty.clear()
  codexThreadTurnStatusDirtyGeneration += 1
  codexThreadFirstPromptCache.clear()
  codexThreadPendingInputCache.clear()
  codexThreadPendingPlanCache.clear()
  codexThreadTurnStatusRpcAvailable = null
  codexThreadFirstPromptScanRunning = false
  codexThreadFirstPromptScanGeneration += 1
}

function sanitizeCodexActivityStatus(value) {
  const source = codexRecord(value)
  const status = ['active', 'idle', 'notLoaded', 'systemError'].includes(source.type) ? source.type : ''
  if (!status) return null
  const activeFlags = status === 'active' && Array.isArray(source.activeFlags)
    ? [...new Set(source.activeFlags.filter((flag) => flag === 'waitingOnApproval' || flag === 'waitingOnUserInput'))]
    : []
  return { status, activeFlags }
}

function codexActivityPublicEntry(value) {
  const source = codexRecord(value)
  const readStateOnly = source.readStateOnly === true
  const status = ['active', 'idle', 'notLoaded', 'systemError'].includes(source.status) ? source.status : undefined
  const activeFlags = status === 'active' && Array.isArray(source.activeFlags)
    ? [...new Set(source.activeFlags.filter((flag) => flag === 'waitingOnApproval' || flag === 'waitingOnUserInput'))]
    : []
  const statusAuthority = ['desktop-live', 'app-server-live', 'persisted-decision', 'connector', 'unavailable'].includes(source.statusAuthority)
    ? source.statusAuthority
    : 'unavailable'
  const activityEvidence = ['connector', 'initial-snapshot', 'activity-event'].includes(source.activityEvidence)
    ? source.activityEvidence
    : undefined
  const activityRevision = Number.isInteger(source.activityRevision) && source.activityRevision >= 0
    ? source.activityRevision
    : undefined
  const unreadAuthority = ['desktop-live', 'desktop-persisted', 'unavailable'].includes(source.unreadAuthority)
    ? source.unreadAuthority
    : 'unavailable'
  const lastTurnStatus = ['completed', 'interrupted', 'failed', 'inProgress'].includes(source.lastTurnStatus)
    ? source.lastTurnStatus
    : undefined
  const lastTurnStartedAt = codexTimestampMs(source.lastTurnStartedAt)
  const lastTurnCompletedAt = lastTurnStatus === 'completed' ? codexTimestampMs(source.lastTurnCompletedAt) : 0
  const desktopActiveSince = status === 'active' && statusAuthority === 'desktop-live'
    ? codexTimestampMs(source.desktopActiveSince)
    : 0
  const lastTurnEvidence = ['inventory', 'turn-started', 'turn-completed', 'targeted-after-exit', 'snapshot-corroborated'].includes(source.lastTurnEvidence)
    ? source.lastTurnEvidence
    : undefined
  return {
    key: typeof source.key === 'string' ? source.key : '',
    ...(readStateOnly
      ? { readStateOnly: true }
      : {
          ...(status ? { status } : {}),
          activeFlags,
          planImplementationOnly: source.planImplementationOnly === true,
          statusAuthority,
          ...(activityEvidence ? { activityEvidence } : {}),
          ...(activityRevision !== undefined ? { activityRevision } : {}),
          ...(desktopActiveSince ? { desktopActiveSince } : {}),
          ...(lastTurnStatus ? { lastTurnStatus } : {}),
          ...(lastTurnStartedAt ? { lastTurnStartedAt } : {}),
          ...(lastTurnCompletedAt ? { lastTurnCompletedAt } : {}),
          ...(lastTurnEvidence ? { lastTurnEvidence } : {})
        }),
    ...(typeof source.hasUnreadTurn === 'boolean' ? { hasUnreadTurn: source.hasUnreadTurn } : {}),
    unreadAuthority
  }
}

function codexArchivedActivityKey(threadId) {
  const known = codexActivityInventory.get(threadId)
  if (!known || typeof known.key !== 'string' || !/^[a-f0-9]{32}$/.test(known.key)) return ''
  for (const [alias, action] of codexThreadActions) {
    if (action.threadId === threadId) codexThreadActions.delete(alias)
  }
  codexThreadTurnStatusCache.delete(threadId)
  codexThreadTurnStatusDirty.delete(threadId)
  codexThreadFirstPromptCache.delete(threadId)
  codexActivityInventory.delete(threadId)
  return known.key
}

function codexActivityDelta(entries, inventoryChanged, receivedAt = Date.now(), inventoryRefreshPriority = 'normal', archivedKeys = []) {
  const normalizedArchivedKeys = [...new Set(archivedKeys.filter((key) => typeof key === 'string' && /^[a-f0-9]{32}$/.test(key)))]
  return {
    version: 2,
    sourceFingerprint: codexActivitySourceFingerprint,
    generation: codexActivityGeneration,
    entries: entries.map(codexActivityPublicEntry).filter((entry) => entry.key),
    ...(normalizedArchivedKeys.length ? { archivedKeys: normalizedArchivedKeys } : {}),
    inventoryChanged: inventoryChanged === true,
    ...(inventoryChanged === true ? { inventoryRefreshPriority: inventoryRefreshPriority === 'urgent' ? 'urgent' : 'normal' } : {}),
    desktopBridgeState: codexDesktopBridge?.state || 'not-checked',
    decisionDiagnostics: codexActivityDecisionDiagnostics(),
    receivedAt
  }
}

function emitCodexActivityDelta(entries, inventoryChanged, inventoryRefreshPriority = 'normal', archivedKeys = []) {
  if (!codexActivitySourceFingerprint) return
  codexActivityGeneration += 1
  const delta = codexActivityDelta(entries, inventoryChanged, Date.now(), inventoryRefreshPriority, archivedKeys)
  for (const listener of codexActivityListeners) {
    try { listener(delta) } catch {}
  }
}

function handleCodexServerMessage(message) {
  if (!message || typeof message !== 'object' || typeof message.method !== 'string') return false
  const method = message.method
  const params = codexRecord(message.params)
  if (method === 'thread/status/changed') {
    const threadId = typeof params.threadId === 'string' ? params.threadId : ''
    const known = codexActivityInventory.get(threadId)
    const activity = sanitizeCodexActivityStatus(params.status)
    if (known && activity) {
      const exitedActive = known.connectorStatus === 'active' && activity.status !== 'active'
      known.connectorStatus = activity.status
      known.connectorActiveFlags = activity.activeFlags
      known.connectorStatusAuthority = 'connector'
      if (activity.status === 'active') {
        const bridge = codexEnsureDesktopBridge()
        bridge.clearOrphanedPending(threadId)
        codexClearDesktopOpenedRead(bridge, threadId)
        delete known.pendingCompletedPlanItem
        known.connectorPlanImplementationOnly = false
        codexMarkAppServerLiveActive(known)
        known.status = 'active'
        known.activeFlags = activity.activeFlags
        known.planImplementationOnly = false
        known.statusAuthority = 'app-server-live'
        known.activityEvidence = 'activity-event'
        known.activityRevision = codexActivityGeneration
        known.lastTurnStatus = 'inProgress'
        delete known.lastTurnId
        delete known.lastTurnCompletedAt
        delete known.lastTurnEvidence
        codexThreadTurnStatusCache.delete(threadId)
        bridge.cancelLatestTurnRefresh(threadId)
        bridge.cancelCompletionUnreadRefresh(threadId)
        delete known.desktopActiveSince
      } else {
        codexClearAppServerLiveActive(known)
        if (known.statusAuthority !== 'desktop-live') {
          known.status = activity.status
          known.activeFlags = activity.activeFlags
          known.planImplementationOnly = known.connectorPlanImplementationOnly === true
          known.statusAuthority = 'connector'
          known.activityEvidence = 'connector'
          known.activityRevision = codexActivityGeneration
          delete known.desktopActiveSince
        }
      }
      if (exitedActive) markCodexThreadTurnStatusDirty(threadId)
      emitCodexActivityDelta([known], exitedActive, exitedActive ? 'urgent' : 'normal')
    } else {
      markCodexThreadTurnStatusDirty(threadId)
      emitCodexActivityDelta([], true, 'urgent')
    }
    return true
  }
  if (['turn/started', 'turn/completed', 'thread/started'].includes(method)) {
    const startedThread = method === 'thread/started' ? codexRecord(params.thread) : null
    const threadId = typeof params.threadId === 'string'
      ? params.threadId
      : typeof startedThread?.id === 'string' ? startedThread.id : ''
    if ((method === 'turn/started' || method === 'turn/completed') && validCodexThreadId(threadId)) {
      const bridge = codexEnsureDesktopBridge()
      const known = codexActivityInventory.get(threadId)
      if (known && method === 'turn/started' && codexApplyStartedTurnNotification(bridge, known, threadId, params.turn)) return true
      if (known && method === 'turn/completed' && codexApplyCompletedTurnNotification(bridge, known, threadId, params.turn)) return true
      if (method === 'turn/completed') {
        const sideShadow = bridge.sideShadows.get(threadId)
        const parentThreadId = validCodexThreadId(sideShadow?.parentThreadId) ? sideShadow.parentThreadId : threadId
        const parent = codexActivityInventory.get(parentThreadId)
        if (parent) {
          bridge.scheduleLatestTurnRefresh(parentThreadId, {
            confirmCompletionEvent: true,
            queryThreadId: threadId,
            restart: true
          })
          return true
        }
      }
    }
    markCodexThreadTurnStatusDirty(threadId)
    emitCodexActivityDelta([], true, 'urgent')
    return true
  }
  if (method === 'item/completed') {
    const threadId = typeof params.threadId === 'string' ? params.threadId : ''
    const known = codexActivityInventory.get(threadId)
    const item = codexRecord(params.item)
    if (known && String(item.type || '').toLowerCase() === 'plan') {
      known.pendingCompletedPlanItem = true
    }
    return true
  }
  if (method === 'thread/archived') {
    const threadId = typeof params.threadId === 'string' ? params.threadId : typeof params.conversationId === 'string' ? params.conversationId : ''
    if (validCodexThreadId(threadId)) codexClearDesktopOpenedRead(codexDesktopBridge, threadId)
    const archivedKey = validCodexThreadId(threadId) ? codexArchivedActivityKey(threadId) : ''
    emitCodexActivityDelta([], true, archivedKey ? 'urgent' : 'normal', archivedKey ? [archivedKey] : [])
    return true
  }
  if (['thread/unarchived', 'thread/deleted'].includes(method)) {
    const threadId = typeof params.threadId === 'string' ? params.threadId : typeof params.conversationId === 'string' ? params.conversationId : ''
    if (method === 'thread/deleted' && validCodexThreadId(threadId)) codexClearDesktopOpenedRead(codexDesktopBridge, threadId)
    emitCodexActivityDelta([], true, 'normal')
    return true
  }
  // Server-initiated approval/input requests are deliberately not answered by
  // this read-only companion. They belong to the client that owns the turn.
  return true
}

function onCodexProcessEnd(processRef = codexProcess, reason = null) {
  if (processRef && processRef !== codexProcess) return
  rejectCodexPending(codexProcessEndError(reason))
  codexProcess = null
  codexLaunchKey = ''
  codexStartupHint = ''
  codexReadyPromise = null
  codexRpcBuffer = ''
  resetCodexThreadSessionState({ preserveDesktopActivity: true })
}

function handleCodexStdout(chunk) {
  codexRpcBuffer += String(chunk || '')
  if (codexRpcBuffer.length > 1_000_000) {
    codexRpcBuffer = ''
    rejectCodexPending(codexError('protocol-error', 'Codex App Server frame overflow'))
    return
  }
  for (;;) {
    const newline = codexRpcBuffer.indexOf('\n')
    if (newline < 0) break
    const line = codexRpcBuffer.slice(0, newline).trim()
    codexRpcBuffer = codexRpcBuffer.slice(newline + 1)
    if (!line) continue
    let message
    try {
      message = JSON.parse(line)
    } catch {
      continue
    }
    if (!message || typeof message !== 'object') continue
    if (typeof message.method === 'string') {
      handleCodexServerMessage(message)
      continue
    }
    if (!Number.isInteger(message.id)) continue
    const pending = codexRpcPending.get(message.id)
    if (!pending) continue
    codexRpcPending.delete(message.id)
    clearTimeout(pending.timeoutId)
    if (message.error) {
      const error = codexError('protocol-error', 'Codex App Server request failed')
      const rpcCode = Number(codexRecord(message.error).code)
      if (Number.isFinite(rpcCode)) error.rpcCode = rpcCode
      pending.reject(error)
    } else pending.resolve(codexRecord(message.result))
  }
}

function sendCodexRpc(method, params, timeoutMs = CODEX_RPC_TIMEOUT_MS) {
  if (!codexProcess || !codexProcess.stdin || typeof codexProcess.stdin.write !== 'function') {
    return Promise.reject(codexError('process-exited', 'Codex App Server is unavailable'))
  }
  const id = ++codexRpcId
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      codexRpcPending.delete(id)
      reject(codexError('timeout', 'Codex App Server request timed out'))
    }, timeoutMs)
    codexRpcPending.set(id, { resolve, reject, timeoutId })
    try {
      codexProcess.stdin.write(`${JSON.stringify({ method, id, params: params || {} })}\n`)
    } catch {
      clearTimeout(timeoutId)
      codexRpcPending.delete(id)
      reject(codexError('process-exited', 'Codex App Server write failed'))
    }
  })
}

function notifyCodexRpc(method, params) {
  try {
    codexProcess?.stdin?.write(`${JSON.stringify({ method, params: params || {} })}\n`)
  } catch {}
}

function codexProcessAlive() {
  return Boolean(codexProcess && codexProcess.exitCode == null && codexProcess.killed !== true)
}

async function startCodexServer() {
  if (typeof spawn !== 'function') throw codexError('unavailable', 'Codex process bridge is unavailable')
  const launch = resolveCodexLaunchPlan()
  if (!launch.detected) throw codexError('runtime-unavailable', 'Codex runtime unavailable')
  if (codexReadyPromise && codexLaunchKey === launch.key) return codexReadyPromise
  if (codexProcessAlive()) throw codexError('unavailable', 'Previous Codex App Server session is still exiting')
  codexLaunchKey = launch.key
  codexStartupHint = ''
  const readyPromise = (async () => {
    const proxyEnvironment = await resolveCodexProxyEnvironment()
    if (codexReadyPromise !== readyPromise) throw codexError('process-exited', 'Codex App Server session closed')
    codexProcess = spawn(launch.command, [...launch.argsPrefix, 'app-server', '--listen', 'stdio://'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: codexSpawnEnvironment(launch.command, proxyEnvironment),
      cwd: os.homedir()
    })
    if (!codexProcess || !codexProcess.stdin || !codexProcess.stdout) {
      onCodexProcessEnd()
      throw codexError('unavailable', 'Codex App Server pipes unavailable')
    }
    const processRef = codexProcess
    const processEnd = (reason) => onCodexProcessEnd(processRef, reason)
    codexProcess.stdout.on('data', handleCodexStdout)
    codexProcess.stderr?.on('data', inspectCodexStderr)
    codexProcess.once?.('error', processEnd)
    codexProcess.once?.('exit', (code) => processEnd({ exitCode: code }))
    await sendCodexRpc('initialize', {
      clientInfo: { name: 'eypc_codex_quota', title: 'EyPc Codex Quota', version: '0.1.0' },
      capabilities: { experimentalApi: true }
    })
    notifyCodexRpc('initialized', {})
    return true
  })()
  codexReadyPromise = readyPromise
  return readyPromise.catch((error) => {
    if (codexReadyPromise === readyPromise) closeCodexServer()
    throw error
  })
}

async function requestCodexRpc(method, params, timeoutMs = CODEX_RPC_TIMEOUT_MS) {
  await startCodexServer()
  return sendCodexRpc(method, params, timeoutMs)
}

function closeCodexServer() {
  const processRef = codexProcess
  rejectCodexPending(codexError('process-exited', 'Codex App Server session closed'))
  codexProcess = null
  codexLaunchKey = ''
  codexStartupHint = ''
  codexReadyPromise = null
  codexRpcBuffer = ''
  try { processRef?.stdout?.off?.('data', handleCodexStdout) } catch {}
  try { processRef?.stderr?.off?.('data', inspectCodexStderr) } catch {}
  try { processRef?.stdin?.end() } catch {}
  try { processRef?.stdout?.destroy?.() } catch {}
  try { processRef?.stderr?.destroy?.() } catch {}
  resetCodexThreadSessionState({ preserveDesktopActivity: true })
}

function closeCodexConnections(options = {}) {
  if (options.preserveDesktop !== true) closeCodexDesktopBridge()
  if (options.force !== true && shouldDeferCodexActionServerClose()) {
    codexActionDeferredServerClose = true
    return
  }
  codexActionDeferredServerClose = false
  closeCodexServer()
}

function sanitizeCodexQuotaWindow(value) {
  const source = codexRecord(value)
  if (!Object.keys(source).length || typeof source.usedPercent !== 'number') return null
  return {
    remainingPercent: codexPercent(100 - source.usedPercent),
    resetAt: codexTimestampMs(source.resetsAt) || null,
    windowMinutes: codexNumber(source.windowDurationMins) || null
  }
}

function sanitizeCodexQuota(rateResult, accountResult) {
  const rateSource = codexRecord(rateResult)
  const byLimit = codexRecord(rateSource.rateLimitsByLimitId)
  const pools = Object.entries(byLimit).flatMap(([key, value]) => {
    const source = codexRecord(value)
    const limitId = typeof source.limitId === 'string' && source.limitId ? source.limitId.slice(0, 120) : String(key || '').slice(0, 120)
    if (!limitId) return []
    const limitName = typeof source.limitName === 'string' && source.limitName ? source.limitName.slice(0, 160) : limitId
    const family = /spark/i.test(`${limitId} ${limitName}`) || limitId === 'codex_bengalfox' ? 'spark' : 'normal'
    const windows = [sanitizeCodexQuotaWindow(source.primary), sanitizeCodexQuotaWindow(source.secondary)].filter(Boolean)
      .sort((left, right) => (left.windowMinutes || Number.MAX_SAFE_INTEGER) - (right.windowMinutes || Number.MAX_SAFE_INTEGER))
    return [{
      limitId,
      limitName,
      family,
      short: windows.find((window) => window.windowMinutes && window.windowMinutes <= 24 * 60) || null,
      weekly: [...windows].reverse().find((window) => window.windowMinutes && window.windowMinutes > 24 * 60) || null,
      planType: typeof source.planType === 'string' ? source.planType : ''
    }]
  })
  if (!pools.length && Object.keys(codexRecord(rateSource.rateLimits)).length) {
    const source = codexRecord(rateSource.rateLimits)
    const windows = [sanitizeCodexQuotaWindow(source.primary), sanitizeCodexQuotaWindow(source.secondary)].filter(Boolean)
      .sort((left, right) => (left.windowMinutes || Number.MAX_SAFE_INTEGER) - (right.windowMinutes || Number.MAX_SAFE_INTEGER))
    pools.push({
      limitId: 'codex',
      limitName: 'Codex',
      family: 'normal',
      short: windows.find((window) => window.windowMinutes && window.windowMinutes <= 24 * 60) || null,
      weekly: [...windows].reverse().find((window) => window.windowMinutes && window.windowMinutes > 24 * 60) || null,
      planType: typeof source.planType === 'string' ? source.planType : ''
    })
  }
  const selected = pools.find((pool) => pool.limitId === 'codex') || pools.find((pool) => pool.family === 'normal') || {
    limitId: 'codex', limitName: 'Codex', family: 'normal', short: null, weekly: null, planType: ''
  }
  const normal = { limitId: selected.limitId, limitName: selected.limitName, family: 'normal', short: selected.short, weekly: selected.weekly }
  const spark = pools.filter((pool) => pool.family === 'spark').map((pool) => ({
    limitId: pool.limitId,
    limitName: pool.limitName,
    family: 'spark',
    short: pool.short,
    weekly: pool.weekly
  })).sort((left, right) => Math.max(right.short?.remainingPercent ?? -1, right.weekly?.remainingPercent ?? -1)
    - Math.max(left.short?.remainingPercent ?? -1, left.weekly?.remainingPercent ?? -1) || left.limitId.localeCompare(right.limitId))
  const account = codexRecord(codexRecord(accountResult).account)
  const plan = typeof selected.planType === 'string' && selected.planType
    ? selected.planType
    : typeof account.planType === 'string'
      ? account.planType
      : ''
  return { plan: plan.slice(0, 64), short: normal.short, weekly: normal.weekly, normal, spark }
}

function sanitizeCodexModelList(value) {
  const source = codexRecord(value)
  const rows = Array.isArray(source.data) ? source.data : Array.isArray(source.models) ? source.models : []
  const seen = new Set()
  const models = rows.flatMap((value) => {
    const row = codexRecord(value)
    const idCandidate = typeof row.id === 'string' ? row.id : typeof row.model === 'string' ? row.model : typeof row.slug === 'string' ? row.slug : ''
    const id = /^[A-Za-z0-9._:-]{1,120}$/.test(idCandidate) ? idCandidate : ''
    if (!id || seen.has(id) || row.hidden === true || row.visibility === 'hidden' || row.visibility === 'hide') return []
    const modalities = Array.isArray(row.inputModalities) ? row.inputModalities : Array.isArray(row.supportedInputModalities) ? row.supportedInputModalities : null
    const supportsText = !modalities || modalities.includes('text')
    if (!supportsText) return []
    seen.add(id)
    return [{
      id,
      displayName: typeof row.displayName === 'string' && row.displayName.trim()
        ? row.displayName.trim().slice(0, 160)
        : typeof row.name === 'string' && row.name.trim() ? row.name.trim().slice(0, 160) : id,
      description: typeof row.description === 'string' ? row.description.trim().slice(0, 240) : '',
      family: /(?:^|[-_.])spark(?:$|[-_.])/i.test(id) ? 'spark' : 'normal',
      isDefault: row.isDefault === true || row.default === true,
      supportsText: true
    }]
  }).sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || left.displayName.localeCompare(right.displayName)).slice(0, 80)
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(models)).digest('hex')
  return { models, fingerprint }
}

function codexNewThreadContextFingerprint(quota, modelCatalogFingerprint, projectFingerprint) {
  const stableQuota = {
    normal: codexRecord(quota).normal || null,
    spark: Array.isArray(codexRecord(quota).spark) ? codexRecord(quota).spark : []
  }
  return crypto.createHash('sha256').update(JSON.stringify({ quota: stableQuota, modelCatalogFingerprint, projectFingerprint })).digest('hex')
}

function sanitizeCodexConfig(value) {
  const config = codexRecord(codexRecord(value).config)
  return {
    model: typeof config.model === 'string' ? config.model.slice(0, 120) : '',
    reasoningEffort: typeof config.model_reasoning_effort === 'string' ? config.model_reasoning_effort.slice(0, 80) : '',
    serviceTier: typeof config.service_tier === 'string' ? config.service_tier.slice(0, 80) : ''
  }
}

function validCodexThreadId(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function codexThreadKey(threadId) {
  return crypto.createHash('sha256').update(threadId).digest('hex').slice(0, 32)
}

function codexThreadAlias(threadId, now, metadata = {}) {
  const key = codexThreadKey(threadId)
  for (const [alias, entry] of codexThreadActions) {
    if (entry.expiresAt <= now) codexThreadActions.delete(alias)
    else if (entry.key === key && entry.threadId === threadId) {
      entry.expiresAt = now + CODEX_THREAD_ALIAS_TTL_MS
      entry.projectKey = metadata.projectKey || entry.projectKey || ''
      entry.sourceFingerprint = metadata.sourceFingerprint || entry.sourceFingerprint || ''
      entry.cwd = metadata.cwd || entry.cwd || ''
      return { key, alias }
    }
  }
  const alias = `ct_${crypto.randomBytes(18).toString('base64url')}`
  codexThreadActions.set(alias, {
    key,
    threadId,
    expiresAt: now + CODEX_THREAD_ALIAS_TTL_MS,
    projectKey: metadata.projectKey || '',
    sourceFingerprint: metadata.sourceFingerprint || '',
    cwd: metadata.cwd || ''
  })
  return { key, alias }
}

function codexNativeString(value, maximum = 240) {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum && !/[\u0000-\u001f]/.test(value) ? value : ''
}

function codexNativeStringList(value, maximum = 100_000) {
  if (!Array.isArray(value) || value.length > maximum) throw codexError('protocol-error', 'Codex native project state is invalid')
  const result = []
  for (const item of value) {
    const normalized = codexNativeString(item)
    if (!normalized) throw codexError('protocol-error', 'Codex native project state is invalid')
    if (!result.includes(normalized)) result.push(normalized)
  }
  return result
}

function codexNormalizeNativeRoot(value) {
  if (typeof value !== 'string' || !value.trim()) return ''
  const pathApi = process.platform === 'win32' ? path.win32 : path
  if (!pathApi.isAbsolute(value)) return ''
  let normalized = pathApi.normalize(value)
  try {
    if (fs.existsSync(normalized)) normalized = fs.realpathSync(normalized)
  } catch {}
  normalized = pathApi.normalize(normalized).replace(/[\\/]+$/, '') || pathApi.parse(normalized).root
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function codexProjectKey(roots) {
  return crypto.createHash('sha256').update(`codex-project\0${[...roots].sort().join('\0')}`).digest('hex').slice(0, 32)
}

function codexStableNativeProjection(value) {
  if (Array.isArray(value)) return value.map(codexStableNativeProjection)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, codexStableNativeProjection(value[key])]))
}

function parseCodexNativeRegistryText(text) {
  let parsed
  try { parsed = JSON.parse(text) } catch { throw codexError('protocol-error', 'Codex native project state is invalid') }
  const source = codexRecord(parsed)
  const localProjectsSource = source['local-projects']
  const assignmentsSource = source['thread-project-assignments']
  if (!localProjectsSource || typeof localProjectsSource !== 'object' || Array.isArray(localProjectsSource)) throw codexError('protocol-error', 'Codex native project state is invalid')
  if (!assignmentsSource || typeof assignmentsSource !== 'object' || Array.isArray(assignmentsSource)) throw codexError('protocol-error', 'Codex native project state is invalid')
  const projectOrder = codexNativeStringList(source['project-order'])
  const pinnedProjectIds = codexNativeStringList(source['pinned-project-ids'])
  const selectedProjectSource = source['selected-project']
  const selectedProjectRecord = codexRecord(selectedProjectSource)
  const selectedProjectId = typeof selectedProjectSource === 'string'
    ? codexNativeString(selectedProjectSource)
    : selectedProjectSource && typeof selectedProjectSource === 'object' && selectedProjectRecord.type === 'local'
      ? codexNativeString(selectedProjectRecord.projectId)
      : ''
  if (selectedProjectSource !== undefined && selectedProjectSource !== null && !selectedProjectId) throw codexError('protocol-error', 'Codex selected project state is invalid')
  const pinnedThreadIds = codexNativeStringList(source['pinned-thread-ids']).filter(validCodexThreadId)
  const projectlessThreadIds = codexNativeStringList(source['projectless-thread-ids']).filter(validCodexThreadId)
  const projects = []
  const projectById = new Map()
  const projectKeySet = new Set()
  const localProjectEntries = Object.entries(localProjectsSource)
  if (localProjectEntries.length > 10_000) throw codexError('protocol-error', 'Codex native project state is invalid')
  for (let insertionOrder = 0; insertionOrder < localProjectEntries.length; insertionOrder += 1) {
    const [storageId, rawValue] = localProjectEntries[insertionOrder]
    const project = codexRecord(rawValue)
    const id = codexNativeString(project.id)
    const name = codexNativeString(project.name, 160)
    if (!id || id !== storageId || !name || !Array.isArray(project.rootPaths) || project.rootPaths.length < 1 || project.rootPaths.length > 32) throw codexError('protocol-error', 'Codex native project state is invalid')
    const roots = [...new Set(project.rootPaths.map(codexNormalizeNativeRoot))]
    if (roots.some((root) => !root) || roots.length < 1) throw codexError('protocol-error', 'Codex native project state is invalid')
    const key = codexProjectKey(roots)
    if (projectKeySet.has(key)) throw codexError('protocol-error', 'Codex native project roots are ambiguous')
    projectKeySet.add(key)
    const normalized = { id, key, name, roots, insertionOrder }
    projects.push(normalized)
    projectById.set(id, normalized)
  }
  const assignments = new Map()
  const assignmentEntries = Object.entries(assignmentsSource)
  if (assignmentEntries.length > 100_000) throw codexError('protocol-error', 'Codex native project state is invalid')
  for (const [threadId, rawValue] of assignmentEntries) {
    if (!validCodexThreadId(threadId)) throw codexError('protocol-error', 'Codex native project state is invalid')
    const assignment = codexRecord(rawValue)
    const projectId = codexNativeString(assignment.projectId)
    if (!projectId) throw codexError('protocol-error', 'Codex native project state is invalid')
    assignments.set(threadId, projectId)
  }
  const nativeProjection = {
    projects: projects.map((project) => ({ id: project.id, name: project.name, roots: [...project.roots].sort() })),
    projectOrder,
    pinnedProjectIds,
    selectedProjectId,
    pinnedThreadIds,
    assignments: [...assignments.entries()].sort(([left], [right]) => left.localeCompare(right)),
    projectlessThreadIds: [...projectlessThreadIds].sort()
  }
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(codexStableNativeProjection(nativeProjection))).digest('hex')
  const orderById = new Map(projectOrder.map((id, index) => [id, index]))
  const pinnedOrderById = new Map(pinnedProjectIds.map((id, index) => [id, index]))
  for (const project of projects) {
    project.nativePinnedOrder = pinnedOrderById.get(project.id)
    project.nativeOrder = orderById.has(project.id) ? orderById.get(project.id) : projectOrder.length + project.insertionOrder
  }
  return {
    projects,
    projectById,
    assignments,
    projectlessThreadIds: new Set(projectlessThreadIds),
    pinnedThreadOrder: new Map(pinnedThreadIds.map((id, index) => [id, index])),
    selectedProjectId,
    fingerprint
  }
}

function codexNativeStatePaths() {
  const codexHome = typeof process.env.CODEX_HOME === 'string' && process.env.CODEX_HOME.trim()
    ? path.resolve(process.env.CODEX_HOME)
    : path.join(os.homedir(), '.codex')
  const primary = path.join(codexHome, '.codex-global-state.json')
  return { codexHome, primary, backup: `${primary}.bak` }
}

function readCodexNativeRegistry() {
  const { primary } = codexNativeStatePaths()
  const candidates = [primary, `${primary}.bak`]
  let lastError = null
  for (const candidate of candidates) {
    try {
      const stat = fs.statSync(candidate)
      if (!stat || typeof stat.size !== 'number' || stat.size <= 0 || stat.size > CODEX_NATIVE_STATE_MAX_BYTES) throw codexError('protocol-error', 'Codex native project state is invalid')
      return parseCodexNativeRegistryText(fs.readFileSync(candidate, 'utf8'))
    } catch (error) {
      lastError = error
    }
  }
  if (lastError && codexRecord(lastError).code === 'protocol-error') throw lastError
  throw codexError('protocol-error', 'Codex native project state is unavailable')
}

function readCodexDesktopUnreadIds() {
  const { primary } = codexNativeStatePaths()
  const stat = fs.statSync(primary)
  if (!stat || typeof stat.size !== 'number' || stat.size <= 0 || stat.size > CODEX_NATIVE_STATE_MAX_BYTES) {
    throw codexError('protocol-error', 'Codex desktop unread state is invalid')
  }
  let parsed
  try { parsed = JSON.parse(fs.readFileSync(primary, 'utf8')) } catch {
    throw codexError('protocol-error', 'Codex desktop unread state is invalid')
  }
  const atomsValue = codexRecord(parsed)['electron-persisted-atom-state']
  let atoms
  try { atoms = typeof atomsValue === 'string' ? codexRecord(JSON.parse(atomsValue)) : codexRecord(atomsValue) } catch {
    throw codexError('protocol-error', 'Codex desktop unread state is invalid')
  }
  const byHostValue = atoms['unread-thread-ids-by-host-v1']
  let byHost
  try { byHost = typeof byHostValue === 'string' ? codexRecord(JSON.parse(byHostValue)) : codexRecord(byHostValue) } catch {
    throw codexError('protocol-error', 'Codex desktop unread state is invalid')
  }
  const local = byHost.local
  if (!Array.isArray(local) || local.length > 100_000 || local.some((threadId) => !validCodexThreadId(threadId))) {
    throw codexError('protocol-error', 'Codex desktop unread state is invalid')
  }
  return new Set(local)
}

function codexRolloutHasPendingUserInputText(text) {
  if (typeof text !== 'string' || !text) return false
  const pendingCallIds = new Set()
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.length > 1_000_000) continue
    let record
    try { record = JSON.parse(line) } catch { continue }
    const source = codexRecord(record)
    const payload = codexRecord(source.payload)
    if (source.type === 'event_msg' && payload.type === 'user_message'
      || source.type === 'response_item' && payload.type === 'message' && payload.role === 'user') {
      pendingCallIds.clear()
      continue
    }
    if (source.type !== 'response_item') continue
    const callId = typeof payload.call_id === 'string' && payload.call_id.length <= 200
      ? payload.call_id
      : ''
    if (!callId) continue
    if (payload.type === 'function_call' && payload.name === 'request_user_input') {
      pendingCallIds.add(callId)
    } else if (payload.type === 'function_call_output') {
      pendingCallIds.delete(callId)
    }
  }
  return pendingCallIds.size > 0
}

function codexRolloutPendingPlanStateText(text) {
  if (typeof text !== 'string' || !text) return { known: false, pending: false }
  let sawTurnBoundary = false
  let pending = false
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.length > 1_000_000) continue
    let record
    try { record = JSON.parse(line) } catch { continue }
    const source = codexRecord(record)
    const payload = codexRecord(source.payload)
    if (source.type !== 'event_msg') continue
    if (payload.type === 'task_started') {
      sawTurnBoundary = true
      pending = false
      continue
    }
    if (payload.type !== 'item_completed') continue
    const item = codexRecord(payload.item)
    if (String(item.type || '').toLowerCase() === 'plan') pending = true
  }
  return { known: sawTurnBoundary || pending, pending }
}

function codexPathInside(root, candidate) {
  const relative = path.relative(root, candidate)
  return relative === '' || Boolean(relative && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function codexThreadRolloutCandidate(thread) {
  if (!thread || typeof thread.path !== 'string') return null
  const { codexHome } = codexNativeStatePaths()
  try {
    const sessionsRoot = fs.realpathSync(path.join(codexHome, 'sessions'))
    const candidate = fs.realpathSync(thread.path)
    if (!codexPathInside(sessionsRoot, candidate)) return null
    const stat = fs.statSync(candidate)
    if (!stat?.isFile?.() || !Number.isFinite(stat.size) || stat.size <= 0) return null
    return { candidate, stat }
  } catch {
    return null
  }
}

function codexReadRolloutTail(candidate, stat, maximumBytes) {
  let descriptor = null
  try {
    const length = Math.min(stat.size, maximumBytes)
    const buffer = Buffer.alloc(length)
    descriptor = fs.openSync(candidate, 'r')
    const bytesRead = fs.readSync(descriptor, buffer, 0, length, stat.size - length)
    let text = buffer.subarray(0, bytesRead).toString('utf8')
    if (stat.size > length) {
      const firstNewline = text.indexOf('\n')
      text = firstNewline >= 0 ? text.slice(firstNewline + 1) : ''
    }
    return text
  } catch {
    return ''
  } finally {
    try { if (descriptor !== null) fs.closeSync(descriptor) } catch {}
  }
}

function codexThreadHasPersistedPendingInput(thread, lastTurn) {
  if (!thread || typeof thread.path !== 'string' || !lastTurn
    || !['interrupted', 'failed', 'inProgress'].includes(lastTurn.status)) return false
  const rollout = codexThreadRolloutCandidate(thread)
  if (!rollout) return false
  const { candidate, stat } = rollout
  const cached = codexThreadPendingInputCache.get(candidate)
  const mtimeMs = codexTimestampMs(stat.mtimeMs)
  if (cached && cached.size === stat.size && cached.mtimeMs === mtimeMs) return cached.pending === true
  const text = codexReadRolloutTail(candidate, stat, CODEX_ROLLOUT_PENDING_INPUT_TAIL_BYTES)
  const pending = codexRolloutHasPendingUserInputText(text)
  codexThreadPendingInputCache.set(candidate, { size: stat.size, mtimeMs, pending })
  return pending
}

function codexThreadHasPersistedPendingPlan(thread, lastTurn) {
  if (!lastTurn || lastTurn.status !== 'completed') return false
  const rollout = codexThreadRolloutCandidate(thread)
  if (!rollout) return false
  const { candidate, stat } = rollout
  const mtimeMs = codexTimestampMs(stat.mtimeMs)
  const cached = codexThreadPendingPlanCache.get(candidate)
  if (cached && cached.size === stat.size && cached.mtimeMs === mtimeMs) return cached.pending === true
  let state = { known: false, pending: false }
  for (const maximumBytes of CODEX_ROLLOUT_PENDING_PLAN_TAIL_BYTES) {
    state = codexRolloutPendingPlanStateText(codexReadRolloutTail(candidate, stat, maximumBytes))
    if (state.known || maximumBytes >= stat.size) break
  }
  codexThreadPendingPlanCache.set(candidate, { size: stat.size, mtimeMs, pending: state.pending })
  return state.pending
}

function readCodexNativePrimaryState() {
  const paths = codexNativeStatePaths()
  const stat = fs.statSync(paths.primary)
  if (!stat || typeof stat.size !== 'number' || stat.size <= 0 || stat.size > CODEX_NATIVE_STATE_MAX_BYTES) {
    throw codexError('protocol-error', 'Codex native project state is invalid')
  }
  const buffer = fs.readFileSync(paths.primary)
  const text = buffer.toString('utf8')
  let value
  try { value = JSON.parse(text) } catch { throw codexError('protocol-error', 'Codex native project state is invalid') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw codexError('protocol-error', 'Codex native project state is invalid')
  return { paths, stat, buffer, value, registry: parseCodexNativeRegistryText(text) }
}

function codexProbeExactProcess(command, args, noMatchCode = 1) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true, timeout: 3_000 }, (error, stdout) => {
      if (!error) {
        resolve(Boolean(String(stdout || '').trim()))
        return
      }
      const code = codexRecord(error).code
      if (code === noMatchCode || String(code) === String(noMatchCode)) {
        resolve(false)
        return
      }
      reject(error)
    })
  })
}

async function codexDesktopIsRunning() {
  if (process.platform === 'darwin' || process.platform === 'linux') {
    for (const executable of ['Codex', 'ChatGPT']) {
      if (await codexProbeExactProcess('/usr/bin/pgrep', ['-x', executable])) return true
    }
    return false
  }
  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot || 'C:\\Windows'
    const result = await run(`${systemRoot}\\System32\\tasklist.exe`, ['/NH', '/FO', 'CSV'])
    if (!result.ok && !result.stdout) throw new Error(result.error || 'Codex desktop process check failed')
    return /"(?:ChatGPT|Codex)\.exe"/i.test(result.stdout)
  }
  throw new Error('Codex desktop process check is unsupported')
}

function codexWriteSyncedTemp(target, data, mode) {
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.tmp-${Date.now()}-${crypto.randomUUID()}`)
  const descriptor = fs.openSync(temporary, 'wx', mode)
  try {
    fs.writeFileSync(descriptor, data)
    fs.fsyncSync(descriptor)
  } finally {
    fs.closeSync(descriptor)
  }
  return temporary
}

function codexSyncDirectory(directory) {
  let descriptor = null
  try {
    descriptor = fs.openSync(directory, 'r')
    fs.fsyncSync(descriptor)
  } finally {
    if (descriptor !== null) fs.closeSync(descriptor)
  }
}

function codexRestoreAtomicFile(target, previous, mode) {
  if (previous === null) {
    if (fs.existsSync(target)) fs.unlinkSync(target)
    return
  }
  const temporary = codexWriteSyncedTemp(target, previous, mode)
  fs.renameSync(temporary, target)
}

function codexRemoveTemporaryFile(target) {
  try {
    if (target && fs.existsSync(target)) fs.unlinkSync(target)
  } catch {}
}

function codexProjectActionAlias(project, sourceFingerprint, now) {
  for (const [alias, entry] of codexProjectActions) {
    if (entry.expiresAt <= now) codexProjectActions.delete(alias)
    else if (entry.projectKey === project.key) {
      entry.expiresAt = now + CODEX_THREAD_ALIAS_TTL_MS
      entry.sourceFingerprint = sourceFingerprint
      entry.projectId = project.id || ''
      entry.kind = project.kind || 'project'
      return alias
    }
  }
  const alias = `cp_${crypto.randomBytes(18).toString('base64url')}`
  codexProjectActions.set(alias, {
    projectKey: project.key,
    projectId: project.id || '',
    kind: project.kind || 'project',
    sourceFingerprint,
    expiresAt: now + CODEX_THREAD_ALIAS_TTL_MS
  })
  return alias
}

function codexThreadNativeProject(thread, registry) {
  const threadId = thread.id
  if (registry.assignments.has(threadId)) {
    const project = registry.projectById.get(registry.assignments.get(threadId))
    return project ? { project, reason: 'assignment' } : null
  }
  if (registry.projectlessThreadIds.has(threadId)) {
    return { project: { id: '', key: 'chats', name: 'Chats', roots: [], kind: 'chats' }, reason: 'projectless' }
  }
  const cwd = codexNormalizeNativeRoot(thread.cwd)
  if (!cwd) return null
  const pathApi = process.platform === 'win32' ? path.win32 : path
  const matches = []
  for (const project of registry.projects) {
    for (const root of project.roots) {
      if (cwd === root || cwd.startsWith(`${root}${pathApi.sep}`)) matches.push({ project, depth: root.length })
    }
  }
  matches.sort((left, right) => right.depth - left.depth || left.project.insertionOrder - right.project.insertionOrder)
  if (matches.length > 1 && matches[0].depth === matches[1].depth && matches[0].project.key !== matches[1].project.key) throw codexError('protocol-error', 'Codex native project roots are ambiguous')
  return matches[0] ? { project: matches[0].project, reason: 'cwd' } : null
}

function sanitizeCodexTurnStatus(value) {
  const turn = codexRecord(value)
  const status = ['completed', 'interrupted', 'failed', 'inProgress'].includes(turn.status) ? turn.status : ''
  if (!status) return null
  const id = typeof turn.id === 'string' && turn.id.length > 0 && turn.id.length <= 200 ? turn.id : ''
  const completedAt = status === 'completed' ? codexTimestampMs(turn.completedAt) : 0
  const startedAt = codexTimestampMs(turn.startedAt)
  return {
    status,
    ...(id ? { id } : {}),
    ...(startedAt ? { startedAt } : {}),
    ...(completedAt ? { completedAt } : {})
  }
}

function sanitizeCodexTurnStatusPage(value) {
  const source = codexRecord(value)
  const turns = Array.isArray(source.data) ? source.data : []
  return sanitizeCodexTurnStatus(turns[0])
}

function scheduleCodexFirstPromptScan(value) {
  if (codexThreadFirstPromptScanRunning || codexThreadTurnStatusRpcAvailable === false) return
  const source = codexRecord(value)
  const rows = Array.isArray(source.data) ? source.data : []
  const currentIds = new Set(rows.map((row) => codexRecord(row).id).filter(validCodexThreadId))
  for (const threadId of codexThreadFirstPromptCache.keys()) {
    if (!currentIds.has(threadId)) codexThreadFirstPromptCache.delete(threadId)
  }
  const candidates = rows.map((row) => codexRecord(row)).filter((thread) => validCodexThreadId(thread.id))
  if (!candidates.some((thread) => !codexThreadFirstPromptCache.get(thread.id)?.done)) return
  codexThreadFirstPromptScanRunning = true
  const generation = codexThreadFirstPromptScanGeneration
  Promise.resolve().then(async () => {
    let budget = CODEX_THREAD_FIRST_PROMPT_PAGE_BUDGET
    for (const thread of candidates) {
      if (budget <= 0) break
      let entry = codexThreadFirstPromptCache.get(thread.id) || { cursor: null, oldestStartedAt: 0, firstPromptAt: 0, done: false, retryAt: 0 }
      if (entry.done || entry.retryAt > Date.now()) continue
      while (!entry.done && budget > 0) {
        if (generation !== codexThreadFirstPromptScanGeneration) return
        try {
          const params = {
            threadId: thread.id,
            limit: CODEX_THREAD_FIRST_PROMPT_PAGE_LIMIT,
            sortDirection: 'desc',
            itemsView: 'notLoaded',
            ...(entry.cursor ? { cursor: entry.cursor } : {})
          }
          const page = await requestCodexRpc('thread/turns/list', params, CODEX_THREAD_TURN_STATUS_TIMEOUT_MS)
          if (generation !== codexThreadFirstPromptScanGeneration) return
          const pageSource = codexRecord(page)
          const turns = Array.isArray(pageSource.data) ? pageSource.data : []
          for (const row of turns) {
            const startedAt = codexTimestampMs(codexRecord(row).startedAt)
            if (startedAt && (!entry.oldestStartedAt || startedAt < entry.oldestStartedAt)) entry.oldestStartedAt = startedAt
          }
          entry.cursor = typeof pageSource.nextCursor === 'string' && pageSource.nextCursor ? pageSource.nextCursor : null
          entry.done = !entry.cursor
          if (entry.done && entry.oldestStartedAt) entry.firstPromptAt = entry.oldestStartedAt
          entry.retryAt = 0
          codexThreadFirstPromptCache.set(thread.id, { ...entry })
          budget -= 1
        } catch {
          if (generation !== codexThreadFirstPromptScanGeneration) return
          entry.retryAt = Date.now() + CODEX_THREAD_TURN_STATUS_RETRY_MS
          codexThreadFirstPromptCache.set(thread.id, { ...entry })
          break
        }
      }
    }
  }).finally(() => {
    if (generation === codexThreadFirstPromptScanGeneration) codexThreadFirstPromptScanRunning = false
  })
}

async function listAllCodexThreads(archived) {
  const rows = []
  const seenThreadIds = new Set()
  const seenCursors = new Set()
  let cursor = ''
  for (let pageIndex = 0; pageIndex < CODEX_THREAD_PAGE_LIMIT; pageIndex += 1) {
    const page = codexRecord(await requestCodexRpc('thread/list', {
      limit: CODEX_THREAD_LIMIT,
      archived: archived === true,
      sortKey: 'recency_at',
      sortDirection: 'desc',
      ...(cursor ? { cursor } : {})
    }))
    if (!Array.isArray(page.data)) throw codexError('protocol-error', 'Codex thread pagination is invalid')
    for (const value of page.data) {
      const thread = codexRecord(value)
      if (!validCodexThreadId(thread.id)) throw codexError('protocol-error', 'Codex thread identity is invalid')
      if (seenThreadIds.has(thread.id)) continue
      seenThreadIds.add(thread.id)
      rows.push(thread)
    }
    const nextCursor = page.nextCursor == null || page.nextCursor === '' ? '' : typeof page.nextCursor === 'string' ? page.nextCursor : null
    if (nextCursor === null) throw codexError('protocol-error', 'Codex thread cursor is invalid')
    if (!nextCursor) return rows
    if (seenCursors.has(nextCursor)) throw codexError('protocol-error', 'Codex thread cursor loop detected')
    seenCursors.add(nextCursor)
    cursor = nextCursor
  }
  throw codexError('protocol-error', 'Codex thread pagination exceeded the safety bound')
}

async function recoverDirtyCodexThreadsMissingFromInventory(rows, dirtyThreadIds) {
  const knownIds = new Set(rows.map((row) => codexRecord(row).id).filter(validCodexThreadId))
  const candidateIds = [...dirtyThreadIds]
    .filter((threadId) => validCodexThreadId(threadId) && !knownIds.has(threadId))
    .slice(0, CODEX_THREAD_TURN_STATUS_CONCURRENCY)
  if (!candidateIds.length) return rows

  const queue = [...candidateIds]
  const recovered = new Map()
  const workers = Array.from(
    { length: Math.min(CODEX_THREAD_TURN_STATUS_CONCURRENCY, queue.length) },
    async () => {
      for (;;) {
        const threadId = queue.shift()
        if (!threadId) return
        try {
          const response = codexRecord(await requestCodexRpc(
            'thread/read',
            { threadId, includeTurns: false },
            CODEX_THREAD_TURN_STATUS_TIMEOUT_MS
          ))
          const thread = codexRecord(response.thread)
          const status = codexRecord(thread.status).type
          if (thread.id !== threadId || !['active', 'idle', 'notLoaded', 'systemError'].includes(status)) continue
          recovered.set(threadId, thread)
        } catch {}
      }
    }
  )
  await Promise.all(workers)
  return recovered.size
    ? [...rows, ...candidateIds.map((threadId) => recovered.get(threadId)).filter(Boolean)]
    : rows
}

function markCodexThreadTurnStatusDirty(threadId) {
  if (!validCodexThreadId(threadId)) return
  codexThreadTurnStatusDirtyGeneration += 1
  codexThreadTurnStatusDirty.set(threadId, codexThreadTurnStatusDirtyGeneration)
}

async function readCodexThreadTurnStatuses(rows, dirtyThreadIds = new Set()) {
  const candidates = rows.map(codexRecord)
  const latest = new Map()
  const nonConversationIds = new Set()
  const useEventFastPath = dirtyThreadIds.size > 0
  const queue = []

  for (const thread of candidates) {
    const cached = codexThreadTurnStatusCache.get(thread.id)
    if (!useEventFastPath || dirtyThreadIds.has(thread.id) || !cached) {
      queue.push(thread)
      continue
    }
    if (cached.nonConversation === true) nonConversationIds.add(thread.id)
    else if (cached.turn) latest.set(thread.id, { ...cached.turn })
    else queue.push(thread)
  }

  const readOne = async (thread) => {
    const page = await requestCodexRpc(
      'thread/turns/list',
      {
        threadId: thread.id,
        limit: 1,
        sortDirection: 'desc',
        itemsView: 'notLoaded'
      },
      CODEX_THREAD_TURN_STATUS_TIMEOUT_MS
    )
    const pageSource = codexRecord(page)
    if (!Array.isArray(pageSource.data)) throw codexError('protocol-error', 'Codex latest Turn response is invalid')
    if (pageSource.data.length === 0) {
      nonConversationIds.add(thread.id)
      codexThreadTurnStatusCache.set(thread.id, { nonConversation: true })
      return
    }
    const turn = sanitizeCodexTurnStatusPage(page)
    if (!turn || !turn.startedAt) throw codexError('protocol-error', 'Codex latest Turn is missing startedAt')
    latest.set(thread.id, turn)
    codexThreadTurnStatusCache.set(thread.id, { turn: { ...turn } })
  }

  const workers = Array.from(
    { length: Math.min(CODEX_THREAD_TURN_STATUS_CONCURRENCY, queue.length) },
    async () => {
      for (;;) {
        const thread = queue.shift()
        if (!thread) return
        await readOne(thread)
      }
    }
  )
  await Promise.all(workers)
  return { latest, nonConversationIds }
}

function sanitizeCodexThreads(rows, registry, assignments, turnStatuses = new Map(), unreadIds = null) {
  const now = Date.now()
  const threads = []
  for (const row of rows) {
    const thread = codexRecord(row)
    const native = assignments.get(thread.id)
    if (!native) continue
    const statusSource = codexRecord(thread.status)
    const connectorStatus = ['active', 'idle', 'notLoaded', 'systemError'].includes(statusSource.type) ? statusSource.type : 'notLoaded'
    const lastTurn = turnStatuses.get(thread.id)
    if (!lastTurn || !lastTurn.startedAt) continue
    const persistedPendingInput = connectorStatus !== 'active'
      && codexThreadHasPersistedPendingInput(thread, lastTurn)
    const persistedPendingPlan = connectorStatus !== 'active'
      && codexThreadHasPersistedPendingPlan(thread, lastTurn)
    const persistedDecision = persistedPendingInput || persistedPendingPlan
    const status = persistedDecision ? 'active' : connectorStatus
    const activeFlags = persistedDecision
      ? ['waitingOnUserInput']
      : status === 'active' && Array.isArray(statusSource.activeFlags)
      ? statusSource.activeFlags.filter((flag) => flag === 'waitingOnApproval' || flag === 'waitingOnUserInput')
      : []
    const project = native.project
    const action = codexThreadAlias(thread.id, now, { projectKey: project.key, sourceFingerprint: registry.fingerprint, cwd: codexNormalizeNativeRoot(thread.cwd) })
    threads.push({
      key: action.key,
      actionAlias: action.alias,
      name: typeof thread.name === 'string' && thread.name.trim() ? thread.name.trim().slice(0, 120) : '未命名任务',
      status,
      activeFlags,
      ...(persistedPendingPlan ? { planImplementationOnly: true } : {}),
      statusAuthority: persistedDecision ? 'persisted-decision' : 'connector',
      hasUnreadTurn: unreadIds ? unreadIds.has(thread.id) : false,
      unreadAuthority: unreadIds ? 'desktop-persisted' : 'unavailable',
      updatedAt: codexTimestampMs(thread.recencyAt) || codexTimestampMs(thread.updatedAt) || lastTurn.startedAt,
      ...(codexTimestampMs(thread.createdAt) ? { createdAt: codexTimestampMs(thread.createdAt) } : {}),
      ...(codexThreadFirstPromptCache.get(thread.id)?.firstPromptAt ? { firstPromptAt: codexThreadFirstPromptCache.get(thread.id).firstPromptAt } : {}),
      lastTurnStatus: lastTurn.status,
      lastTurnStartedAt: lastTurn.startedAt,
      ...(lastTurn.completedAt ? { lastTurnCompletedAt: lastTurn.completedAt } : {}),
      projectKey: project.key,
      projectName: project.name,
      projectKind: project.kind === 'chats' ? 'chats' : 'project',
      nativePinned: registry.pinnedThreadOrder.has(thread.id),
      ...(registry.pinnedThreadOrder.has(thread.id) ? { nativePinnedOrder: registry.pinnedThreadOrder.get(thread.id) } : {})
    })
  }
  return threads
}

function sanitizeCodexProjects(registry) {
  const now = Date.now()
  const projects = registry.projects
    .slice()
    .sort((left, right) => (left.nativeOrder ?? Number.MAX_SAFE_INTEGER) - (right.nativeOrder ?? Number.MAX_SAFE_INTEGER))
    .map((project) => ({
      key: project.key,
      actionAlias: codexProjectActionAlias(project, registry.fingerprint, now),
      name: project.name,
      kind: 'project',
      nativePinned: typeof project.nativePinnedOrder === 'number',
      selected: registry.selectedProjectId === project.id,
      ...(typeof project.nativePinnedOrder === 'number' ? { nativePinnedOrder: project.nativePinnedOrder } : {}),
      ...(typeof project.nativeOrder === 'number' ? { nativeOrder: project.nativeOrder } : {})
    }))
  const chats = { id: '', key: 'chats', name: 'Chats', kind: 'chats' }
  projects.push({
    key: 'chats',
    actionAlias: codexProjectActionAlias(chats, registry.fingerprint, now),
    name: 'Chats',
    kind: 'chats',
    nativePinned: false
  })
  return projects
}

function codexMergedInventoryTurnFields(projection, previousActivity) {
  if (!projection?.lastTurnStatus || !codexTimestampMs(projection.lastTurnStartedAt)) return {}
  const next = {
    lastTurnStatus: projection.lastTurnStatus,
    lastTurnStartedAt: codexTimestampMs(projection.lastTurnStartedAt),
    ...(projection.lastTurnStatus === 'completed' && codexTimestampMs(projection.lastTurnCompletedAt)
      ? { lastTurnCompletedAt: codexTimestampMs(projection.lastTurnCompletedAt) }
      : {}),
    lastTurnEvidence: 'inventory'
  }
  const previousStartedAt = codexTimestampMs(previousActivity?.lastTurnStartedAt)
  if (!previousActivity?.lastTurnStatus || !previousStartedAt) return next

  const previous = {
    lastTurnStatus: previousActivity.lastTurnStatus,
    lastTurnStartedAt: previousStartedAt,
    ...(previousActivity.lastTurnStatus === 'completed' && codexTimestampMs(previousActivity.lastTurnCompletedAt)
      ? { lastTurnCompletedAt: codexTimestampMs(previousActivity.lastTurnCompletedAt) }
      : {}),
    ...(previousActivity.lastTurnEvidence ? { lastTurnEvidence: previousActivity.lastTurnEvidence } : {})
  }
  const previousDirectLive = previousActivity.status === 'active'
    && (previousActivity.statusAuthority === 'desktop-live' || previousActivity.statusAuthority === 'app-server-live')
    && previousActivity.lastTurnStatus === 'inProgress'
    && (previousActivity.lastTurnEvidence === 'turn-started' || previousActivity.activityEvidence === 'activity-event')
  const regressedRevision = previousStartedAt > next.lastTurnStartedAt
  const regressedCompletedOutcome = previousStartedAt === next.lastTurnStartedAt
    && previousActivity.lastTurnStatus === 'completed'
    && next.lastTurnStatus !== 'completed'
  if (previousDirectLive || regressedRevision || regressedCompletedOutcome) return previous

  const sameOutcome = previousStartedAt === next.lastTurnStartedAt
    && previousActivity.lastTurnStatus === next.lastTurnStatus
  if (sameOutcome && previousActivity.lastTurnEvidence && previousActivity.lastTurnEvidence !== 'inventory') {
    next.lastTurnEvidence = previousActivity.lastTurnEvidence
    if (next.lastTurnStatus === 'completed') {
      const completedAt = Math.max(
        codexTimestampMs(next.lastTurnCompletedAt),
        codexTimestampMs(previousActivity.lastTurnCompletedAt)
      )
      if (completedAt) next.lastTurnCompletedAt = completedAt
    }
  }
  return next
}

async function scanVerifiedCodexInventory() {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const previousActivityInventory = codexActivityInventory
    const dirtySnapshot = new Map(codexThreadTurnStatusDirty)
    const registry = readCodexNativeRegistry()
    const listedRows = await listAllCodexThreads(false)
    const rows = await recoverDirtyCodexThreadsMissingFromInventory(listedRows, dirtySnapshot.keys())
    const assignments = new Map()
    let excludedSourceCount = 0
    for (const thread of rows) {
      const native = codexThreadNativeProject(thread, registry)
      if (native) assignments.set(thread.id, native)
      else excludedSourceCount += 1
    }
    const eligibleRows = rows.filter((thread) => assignments.has(thread.id))
    const turns = await readCodexThreadTurnStatuses(eligibleRows, new Set(dirtySnapshot.keys()))
    const endingRegistry = readCodexNativeRegistry()
    if (endingRegistry.fingerprint !== registry.fingerprint) {
      if (attempt === 0) continue
      throw codexError('protocol-error', 'Codex native project state changed during the scan')
    }
    let unreadIds = null
    try { unreadIds = readCodexDesktopUnreadIds() } catch {}
    const threads = sanitizeCodexThreads(eligibleRows, registry, assignments, turns.latest, unreadIds)
    const eligibleIds = new Set(eligibleRows.map((thread) => thread.id))
    for (const threadId of codexThreadTurnStatusCache.keys()) {
      if (!eligibleIds.has(threadId)) codexThreadTurnStatusCache.delete(threadId)
    }
    const validKeys = new Set(threads.map((thread) => thread.key))
    const threadByKey = new Map(threads.map((thread) => [thread.key, thread]))
    const activityInventory = new Map()
    for (const row of eligibleRows) {
      const thread = codexRecord(row)
      const key = validCodexThreadId(thread.id) ? codexThreadKey(thread.id) : ''
      if (!key || !validKeys.has(key)) continue
      const projection = threadByKey.get(key)
      const activity = sanitizeCodexActivityStatus({
        type: projection?.status,
        activeFlags: projection?.activeFlags
      })
      if (!activity) throw codexError('protocol-error', 'Codex thread activity status is invalid')
      const previousActivity = previousActivityInventory.get(thread.id)
      const preserveAppServerActive = previousActivity?.appServerLiveActive === true
      const turnFields = codexMergedInventoryTurnFields(projection, previousActivity)
      const connectorStatusAuthority = projection?.statusAuthority === 'persisted-decision'
        ? 'persisted-decision'
        : 'connector'
      const latestTurn = turns.latest.get(thread.id)
      const latestTurnMatchesProjection = latestTurn?.startedAt === turnFields.lastTurnStartedAt
        && latestTurn?.status === turnFields.lastTurnStatus
      const previousTurnMatchesProjection = previousActivity?.lastTurnStartedAt === turnFields.lastTurnStartedAt
        && previousActivity?.lastTurnStatus === turnFields.lastTurnStatus
      const lastTurnId = latestTurnMatchesProjection && latestTurn?.id
        ? latestTurn.id
        : previousTurnMatchesProjection ? previousActivity?.lastTurnId || '' : ''
      codexReconcileDesktopOpenedReadWithTurn(codexDesktopBridge, thread.id, {
        ...turnFields,
        ...(lastTurnId ? { lastTurnId } : {})
      })
      if (turnFields.lastTurnStatus && turnFields.lastTurnStartedAt) {
        codexThreadTurnStatusCache.set(thread.id, {
          turn: {
            ...(lastTurnId ? { id: lastTurnId } : {}),
            status: turnFields.lastTurnStatus,
            startedAt: turnFields.lastTurnStartedAt,
            ...(turnFields.lastTurnCompletedAt ? { completedAt: turnFields.lastTurnCompletedAt } : {})
          }
        })
      }
      activityInventory.set(thread.id, {
        key,
        ...activity,
        connectorStatus: activity.status,
        connectorActiveFlags: activity.activeFlags,
        connectorPlanImplementationOnly: projection?.planImplementationOnly === true,
        connectorStatusAuthority,
        connectorUpdatedAt: projection?.updatedAt,
        connectorLastTurnStatus: projection?.lastTurnStatus,
        connectorLastTurnStartedAt: projection?.lastTurnStartedAt,
        ...(preserveAppServerActive ? { status: 'active', activeFlags: [...(previousActivity.activeFlags || [])] } : {}),
        statusAuthority: preserveAppServerActive ? 'app-server-live' : connectorStatusAuthority,
        activityEvidence: preserveAppServerActive ? 'activity-event' : 'connector',
        activityRevision: 0,
        planImplementationOnly: projection?.planImplementationOnly === true,
        ...(preserveAppServerActive ? {
          appServerLiveActive: true,
          ...(Number.isInteger(previousActivity.appServerLiveSequence)
            ? { appServerLiveSequence: previousActivity.appServerLiveSequence }
            : {})
        } : {}),
        hasUnreadTurn: projection?.hasUnreadTurn === true,
        connectorHasUnreadTurn: projection?.hasUnreadTurn === true,
        connectorUnreadAuthority: projection?.unreadAuthority || 'unavailable',
        unreadAuthority: projection?.unreadAuthority || 'unavailable',
        ...(lastTurnId ? { lastTurnId } : {}),
        ...turnFields
      })
    }
    const retainedAt = Date.now()
    const retainMissingMappings = codexActivitySourceFingerprint === registry.fingerprint
    for (const [threadId, previousActivity] of retainMissingMappings ? previousActivityInventory : []) {
      if (activityInventory.has(threadId) || !validCodexThreadId(threadId)) continue
      const missingSince = codexTimestampMs(previousActivity.inventoryMissingSince) || retainedAt
      if (retainedAt - missingSince > CODEX_MISSING_ACTIVITY_MAPPING_RETENTION_MS) continue
      activityInventory.set(threadId, {
        ...previousActivity,
        inventoryMissingSince: missingSince
      })
      codexNoteActivityDecision('missingMappingRetained')
    }
    codexActivityInventory = activityInventory
    codexActivitySourceFingerprint = registry.fingerprint
    codexActivityGeneration += 1
    codexEnsureDesktopBridge().updateInventory(activityInventory.keys())
    const activityByKey = new Map([...activityInventory.values()].map((entry) => [entry.key, entry]))
    for (const thread of threads) {
      const activity = activityByKey.get(thread.key)
      if (!activity) continue
      thread.status = activity.status
      thread.activeFlags = [...activity.activeFlags]
      thread.planImplementationOnly = activity.planImplementationOnly === true
      thread.statusAuthority = activity.statusAuthority
      thread.activityEvidence = activity.activityEvidence
      thread.activityRevision = activity.activityRevision
      if (activity.desktopActiveSince) thread.desktopActiveSince = activity.desktopActiveSince
      else delete thread.desktopActiveSince
      thread.hasUnreadTurn = activity.hasUnreadTurn === true
      thread.unreadAuthority = activity.unreadAuthority
      if (activity.lastTurnStatus && activity.lastTurnStartedAt) {
        thread.lastTurnStatus = activity.lastTurnStatus
        thread.lastTurnStartedAt = activity.lastTurnStartedAt
        if (activity.lastTurnStatus === 'completed' && activity.lastTurnCompletedAt) thread.lastTurnCompletedAt = activity.lastTurnCompletedAt
        else delete thread.lastTurnCompletedAt
      }
      if (activity.lastTurnEvidence) thread.lastTurnEvidence = activity.lastTurnEvidence
      else delete thread.lastTurnEvidence
    }
    for (const [threadId, generation] of dirtySnapshot) {
      if (codexThreadTurnStatusDirty.get(threadId) === generation) codexThreadTurnStatusDirty.delete(threadId)
    }
    if (codexThreadTurnStatusDirty.size > 0) {
      queueMicrotask(() => emitCodexActivityDelta([], true, 'urgent'))
    }
    return {
      threads,
      projects: sanitizeCodexProjects(registry),
      activityGeneration: codexActivityGeneration,
      sourceFingerprint: registry.fingerprint,
      rawSourceCount: rows.length,
      eligibleSourceCount: eligibleRows.length,
      excludedSourceCount,
      nonConversationCount: turns.nonConversationIds.size
    }
  }
  throw codexError('protocol-error', 'Codex native project state changed during the scan')
}

async function readCodexActivitySnapshot() {
  try {
    if (!codexActivitySourceFingerprint) throw codexError('protocol-error', 'Codex activity baseline is unavailable')
    const bridge = codexEnsureDesktopBridge()
    bridge.refreshPersistedUnread(false)
    const receivedAt = Date.now()
    return {
      ok: true,
      value: codexActivityDelta([...codexActivityInventory.values()], false, receivedAt),
      receivedAt
    }
  } catch (error) {
    return codexErrorResult(error)
  }
}

async function readCodexSnapshot(options) {
  const input = codexRecord(options)
  const includeQuota = input.includeQuota !== false
  const includeConfig = input.includeConfig !== false
  const includeThreads = input.includeThreads !== false
  try {
    const value = { version: 2, receivedAt: Date.now() }
    if (includeQuota) {
      const [rateResult, accountResult] = await Promise.all([
        requestCodexRpc('account/rateLimits/read', {}),
        requestCodexRpc('account/read', { refreshToken: false })
      ])
      if (codexRecord(accountResult).requiresOpenaiAuth === true && !codexRecord(accountResult).account) throw codexError('not-authenticated', 'Codex authentication required')
      value.quota = sanitizeCodexQuota(rateResult, accountResult)
    }
    if (includeConfig) {
      value.config = sanitizeCodexConfig(await requestCodexRpc('config/read', { includeLayers: false }))
      try {
        const catalog = sanitizeCodexModelList(await requestCodexRpc('model/list', {}))
        value.models = catalog.models
        value.modelCatalogFingerprint = catalog.fingerprint
      } catch (error) {
        value.modelCatalogErrorCode = typeof codexRecord(error).code === 'string' ? codexRecord(error).code.slice(0, 80) : 'model-list-failed'
      }
    }
    if (includeThreads) {
      const inventory = await scanVerifiedCodexInventory()
      Object.assign(value, inventory, {
        completeness: 'verified',
        threadsPartial: false,
        taskAuthority: inventory.threads.length > 0 && inventory.threads.every((thread) => thread.status === 'notLoaded') ? 'inventory-only' : 'mixed'
      })
    }
    if (value.quota && value.modelCatalogFingerprint) {
      try {
        const projectFingerprint = value.sourceFingerprint || readCodexNativeRegistry().fingerprint
        value.newThreadContextFingerprint = codexNewThreadContextFingerprint(value.quota, value.modelCatalogFingerprint, projectFingerprint)
      } catch {}
    }
    value.receivedAt = Date.now()
    return { ok: true, value, receivedAt: value.receivedAt }
  } catch (error) {
    return codexErrorResult(error)
  }
}

async function archiveCodexThread(actionAlias, request) {
  const input = codexRecord(request)
  const expectedUpdatedAt = Number.isFinite(input.expectedUpdatedAt) && input.expectedUpdatedAt > 0 ? input.expectedUpdatedAt : 0
  const expectedRevisionAt = Number.isFinite(input.expectedRevisionAt) && input.expectedRevisionAt > 0 ? input.expectedRevisionAt : 0
  const expectedCompletionAt = Number.isFinite(input.expectedCompletionAt) && input.expectedCompletionAt > 0 ? input.expectedCompletionAt : 0
  const expectedLastTurnStartedAt = Number.isFinite(input.expectedLastTurnStartedAt) && input.expectedLastTurnStartedAt > 0 ? input.expectedLastTurnStartedAt : 0
  const expectedSourceFingerprint = typeof input.expectedSourceFingerprint === 'string' && /^[a-f0-9]{64}$/.test(input.expectedSourceFingerprint) ? input.expectedSourceFingerprint : ''
  const evidence = input.evidence === 'completed' ? input.evidence : ''
  const requestIsValid = typeof actionAlias === 'string'
    && /^ct_[A-Za-z0-9_-]{16,80}$/.test(actionAlias)
    && expectedUpdatedAt > 0
    && expectedRevisionAt > 0
    && expectedLastTurnStartedAt > 0
    && Boolean(expectedSourceFingerprint)
    && Boolean(evidence)
    && expectedRevisionAt === (expectedCompletionAt || expectedLastTurnStartedAt)
  if (!requestIsValid) {
    return { outcome: 'failed', errorCode: 'invalid-request', message: '归档请求已失效，请刷新后重试' }
  }
  const entry = codexThreadActions.get(actionAlias)
  if (!entry || entry.expiresAt <= Date.now() || !validCodexThreadId(entry.threadId)) {
    codexThreadActions.delete(actionAlias)
    return { outcome: 'failed', errorCode: 'expired-alias', message: '任务动作已过期，请刷新后重试' }
  }
  try {
    const registry = readCodexNativeRegistry()
    if (registry.fingerprint !== expectedSourceFingerprint || entry.sourceFingerprint !== expectedSourceFingerprint) {
      return { outcome: 'failed', errorCode: 'source-changed', message: 'Codex 项目状态已更新，未执行归档' }
    }
    const [threadResult, turnPage] = await Promise.all([
      requestCodexRpc('thread/read', { threadId: entry.threadId, includeTurns: false }),
      requestCodexRpc('thread/turns/list', { threadId: entry.threadId, limit: 1, sortDirection: 'desc', itemsView: 'notLoaded' }, CODEX_THREAD_TURN_STATUS_TIMEOUT_MS)
    ])
    const response = codexRecord(threadResult)
    const thread = codexRecord(response.thread)
    const status = codexRecord(thread.status).type
    const recencyAt = codexTimestampMs(thread.recencyAt) || codexTimestampMs(thread.updatedAt) || 0
    const turnPageSource = codexRecord(turnPage)
    const turnRows = Array.isArray(turnPageSource.data) ? turnPageSource.data : null
    const turn = sanitizeCodexTurnStatusPage(turnPage)
    const native = codexThreadNativeProject(thread, registry)
    const validStatus = ['active', 'idle', 'notLoaded', 'systemError'].includes(status)
    const validTurnShape = turnRows !== null && (turnRows.length === 0 || Boolean(turn))
    if (thread.id !== entry.threadId || !validStatus || recencyAt <= 0 || recencyAt !== expectedUpdatedAt || !validTurnShape || !native || native.project.key !== entry.projectKey) {
      return { outcome: 'failed', errorCode: 'state-changed', message: '任务状态已更新，未执行归档' }
    }
    if (!turn || turn.startedAt !== expectedLastTurnStartedAt) {
      return { outcome: 'failed', errorCode: 'turn-changed', message: '任务最新提问已更新，未执行归档' }
    }
    const desktopActivity = codexEnsureDesktopBridge().activityForThread(entry.threadId)
    if (desktopActivity?.status === 'active' || status === 'active' || turn?.status === 'inProgress') {
      return { outcome: 'failed', errorCode: 'active-task', message: '任务已恢复进行中，未执行归档' }
    }
    if (!turn || turn.status !== 'completed' || (turn.completedAt || turn.startedAt) !== expectedRevisionAt || (expectedCompletionAt > 0 && turn.completedAt !== expectedCompletionAt)) {
      return { outcome: 'failed', errorCode: 'completion-changed', message: '任务完成版本已更新，未执行归档' }
    }
    await requestCodexRpc('thread/archive', { threadId: entry.threadId })
    const [unarchivedRows, archivedRows] = await Promise.all([
      listAllCodexThreads(false),
      listAllCodexThreads(true)
    ])
    const remainsUnarchived = unarchivedRows.some((row) => row.id === entry.threadId)
    const appearsArchived = archivedRows.some((row) => row.id === entry.threadId)
    if (remainsUnarchived || !appearsArchived) {
      return { outcome: 'failed', errorCode: 'archive-not-verified', message: 'Codex 未确认归档结果，请刷新后核验' }
    }
    for (const [alias, action] of codexThreadActions) {
      if (action.threadId === entry.threadId) codexThreadActions.delete(alias)
    }
    codexThreadTurnStatusCache.delete(entry.threadId)
    codexThreadFirstPromptCache.delete(entry.threadId)
    const archivedKey = codexArchivedActivityKey(entry.threadId)
    if (archivedKey) emitCodexActivityDelta([], true, 'urgent', [archivedKey])
    const desktopSync = await codexEnsureDesktopBridge().notifyThreadArchived(
      entry.threadId,
      typeof thread.cwd === 'string' ? thread.cwd : ''
    )
    return { outcome: 'archived', desktopSync }
  } catch (error) {
    const source = codexRecord(error)
    return { outcome: 'failed', errorCode: typeof source.code === 'string' ? source.code : 'archive-failed', message: 'Codex 任务归档失败，请刷新后重试' }
  }
}

async function archiveCodexProject(actionAlias, request) {
  const input = codexRecord(request)
  const expectedSourceFingerprint = typeof input.expectedSourceFingerprint === 'string' && /^[a-f0-9]{64}$/.test(input.expectedSourceFingerprint) ? input.expectedSourceFingerprint : ''
  const emptyResult = (errorCode, message) => ({
    outcome: 'failed',
    archivedKeys: [],
    skippedActiveKeys: [],
    failed: [],
    desktopSyncedKeys: [],
    desktopSyncFailedKeys: [],
    errorCode,
    message
  })
  if (typeof actionAlias !== 'string' || !/^cp_[A-Za-z0-9_-]{16,80}$/.test(actionAlias) || !expectedSourceFingerprint) {
    return emptyResult('invalid-request', '项目归档请求已失效，请刷新后重试')
  }
  const action = codexProjectActions.get(actionAlias)
  if (!action || action.expiresAt <= Date.now()) {
    codexProjectActions.delete(actionAlias)
    return emptyResult('expired-alias', '项目动作已过期，请刷新后重试')
  }
  try {
    const registry = readCodexNativeRegistry()
    if (registry.fingerprint !== expectedSourceFingerprint || action.sourceFingerprint !== expectedSourceFingerprint) {
      return emptyResult('source-changed', 'Codex 项目状态已更新，未执行批量归档')
    }
    const unarchivedRows = await listAllCodexThreads(false)
    const candidates = []
    for (const thread of unarchivedRows) {
      const native = codexThreadNativeProject(thread, registry)
      if (native?.project.key === action.projectKey) candidates.push(thread)
    }
    const archivedKeys = []
    const skippedActiveKeys = []
    const failed = []
    const desktopSyncedKeys = []
    const desktopSyncFailedKeys = []
    for (let batchStart = 0; batchStart < candidates.length; batchStart += 20) {
      if (readCodexNativeRegistry().fingerprint !== expectedSourceFingerprint) {
        for (const thread of candidates.slice(batchStart)) failed.push({ key: codexThreadKey(thread.id), errorCode: 'source-changed' })
        break
      }
      const batch = candidates.slice(batchStart, batchStart + 20)
      const queue = [...batch]
      const staged = []
      const workers = Array.from({ length: Math.min(2, queue.length) }, async () => {
        for (;;) {
          const listedThread = queue.shift()
          if (!listedThread) return
          const key = codexThreadKey(listedThread.id)
          try {
            const [threadResult, turnPage] = await Promise.all([
              requestCodexRpc('thread/read', { threadId: listedThread.id, includeTurns: false }),
              requestCodexRpc('thread/turns/list', { threadId: listedThread.id, limit: 1, sortDirection: 'desc', itemsView: 'notLoaded' }, CODEX_THREAD_TURN_STATUS_TIMEOUT_MS)
            ])
            const thread = codexRecord(codexRecord(threadResult).thread)
            const turnSource = codexRecord(turnPage)
            if (!Array.isArray(turnSource.data)) throw codexError('protocol-error', 'Codex latest Turn response is invalid')
            const turn = turnSource.data.length ? sanitizeCodexTurnStatusPage(turnPage) : null
            if (turnSource.data.length && (!turn || !turn.startedAt)) throw codexError('protocol-error', 'Codex latest Turn is missing startedAt')
            const status = codexRecord(thread.status).type
            const native = codexThreadNativeProject(thread, registry)
            const listedRecency = codexTimestampMs(listedThread.recencyAt) || codexTimestampMs(listedThread.updatedAt) || 0
            const currentRecency = codexTimestampMs(thread.recencyAt) || codexTimestampMs(thread.updatedAt) || 0
            if (thread.id !== listedThread.id || !native || native.project.key !== action.projectKey || !listedRecency || currentRecency !== listedRecency) {
              failed.push({ key, errorCode: 'state-changed' })
              continue
            }
            const desktopActivity = codexEnsureDesktopBridge().activityForThread(listedThread.id)
            if (desktopActivity?.status === 'active' || status === 'active' || turn?.status !== 'completed') {
              skippedActiveKeys.push(key)
              continue
            }
            await requestCodexRpc('thread/archive', { threadId: listedThread.id })
            staged.push({ id: listedThread.id, key, cwd: typeof thread.cwd === 'string' ? thread.cwd : '' })
          } catch (error) {
            failed.push({ key, errorCode: typeof codexRecord(error).code === 'string' ? codexRecord(error).code : 'archive-failed' })
          }
        }
      })
      await Promise.all(workers)
      if (staged.length) {
        const [remainingRows, archivedRows] = await Promise.all([listAllCodexThreads(false), listAllCodexThreads(true)])
        const remainingIds = new Set(remainingRows.map((thread) => thread.id))
        const archivedIds = new Set(archivedRows.map((thread) => thread.id))
        const verified = []
        const removedActivityKeys = []
        for (const item of staged) {
          if (!remainingIds.has(item.id) && archivedIds.has(item.id)) {
            archivedKeys.push(item.key)
            verified.push(item)
            const removedKey = codexArchivedActivityKey(item.id)
            if (removedKey) removedActivityKeys.push(removedKey)
          }
          else failed.push({ key: item.key, errorCode: 'archive-not-verified' })
        }
        if (removedActivityKeys.length) emitCodexActivityDelta([], true, 'urgent', removedActivityKeys)
        const syncResults = await Promise.all(verified.map(async (item) => {
          try {
            return { key: item.key, result: await codexEnsureDesktopBridge().notifyThreadArchived(item.id, item.cwd) }
          } catch {
            return { key: item.key, result: 'failed' }
          }
        }))
        for (const sync of syncResults) {
          if (sync.result === 'dispatched') desktopSyncedKeys.push(sync.key)
          else desktopSyncFailedKeys.push(sync.key)
        }
      }
    }
    const outcome = failed.length ? archivedKeys.length || skippedActiveKeys.length ? 'partial' : 'failed' : 'complete'
    return { outcome, archivedKeys, skippedActiveKeys, failed, desktopSyncedKeys, desktopSyncFailedKeys }
  } catch (error) {
    return emptyResult(typeof codexRecord(error).code === 'string' ? codexRecord(error).code : 'archive-failed', '项目批量归档失败，请刷新后重试')
  }
}

async function removeCodexProject(actionAlias, request) {
  const input = codexRecord(request)
  const expectedSourceFingerprint = typeof input.expectedSourceFingerprint === 'string' && /^[a-f0-9]{64}$/.test(input.expectedSourceFingerprint)
    ? input.expectedSourceFingerprint
    : ''
  const failed = (status, message) => ({ status, message })
  if (typeof actionAlias !== 'string' || !/^cp_[A-Za-z0-9_-]{16,80}$/.test(actionAlias) || !expectedSourceFingerprint) {
    return failed('stale-source', '项目移除请求已失效，请刷新后重试')
  }

  let desktopRunning
  try {
    desktopRunning = await codexDesktopIsRunning()
  } catch {
    return failed('write-failed', '无法可靠确认 Codex 桌面进程状态，未修改项目')
  }
  if (desktopRunning) return failed('codex-running', 'Codex 正在运行；请先完全退出 Codex，再次执行移除')

  const action = codexProjectActions.get(actionAlias)
  if (!action || action.expiresAt <= Date.now() || action.kind !== 'project') {
    codexProjectActions.delete(actionAlias)
    return failed('stale-source', '项目动作已过期，请刷新后重试')
  }

  let primaryState
  try {
    primaryState = readCodexNativePrimaryState()
  } catch {
    return failed('unsupported-schema', 'Codex 主项目状态缺失、无效或结构不受支持，未执行移除')
  }
  const { paths, stat, buffer: previousPrimary, value, registry } = primaryState
  if (registry.fingerprint !== expectedSourceFingerprint || action.sourceFingerprint !== expectedSourceFingerprint) {
    return failed('stale-source', 'Codex 项目状态已更新，未执行移除')
  }
  const project = registry.projectById.get(action.projectId)
  if (!project || project.key !== action.projectKey || action.projectId !== project.id) {
    return failed('stale-source', '目标项目已变化或不再存在，未执行移除')
  }

  const source = codexRecord(value)
  const localProjects = source['local-projects']
  const selectedProject = source['selected-project']
  const selectedProjectRecord = codexRecord(selectedProject)
  const selectedProjectSupported = selectedProject === undefined || selectedProject === null || typeof selectedProject === 'string'
    || (selectedProjectRecord.type === 'local' && typeof selectedProjectRecord.projectId === 'string')
  if (!localProjects || typeof localProjects !== 'object' || Array.isArray(localProjects)
    || !Object.prototype.hasOwnProperty.call(localProjects, project.id)
    || !Array.isArray(source['project-order'])
    || !Array.isArray(source['pinned-project-ids'])
    || !selectedProjectSupported) {
    return failed('unsupported-schema', 'Codex 项目状态结构不受支持，未执行移除')
  }

  const backupExists = fs.existsSync(paths.backup)
  let previousBackup = null
  let backupMode = stat.mode
  try {
    if (backupExists) {
      const backupStat = fs.statSync(paths.backup)
      if (!backupStat || backupStat.size > CODEX_NATIVE_STATE_MAX_BYTES) throw new Error('backup too large')
      previousBackup = fs.readFileSync(paths.backup)
      backupMode = backupStat.mode
    }
  } catch {
    return failed('write-failed', '无法建立 Codex 状态回滚点，未执行移除')
  }

  delete localProjects[project.id]
  source['project-order'] = source['project-order'].filter((id) => id !== project.id)
  source['pinned-project-ids'] = source['pinned-project-ids'].filter((id) => id !== project.id)
  if (selectedProject === project.id || selectedProjectRecord.projectId === project.id) source['selected-project'] = null
  const serialized = Buffer.from(JSON.stringify(source), 'utf8')
  if (!serialized.length || serialized.length > CODEX_NATIVE_STATE_MAX_BYTES) {
    return failed('unsupported-schema', 'Codex 项目状态无法安全序列化，未执行移除')
  }

  let primaryTemporary = ''
  let backupTemporary = ''
  let commitStarted = false
  try {
    if (!fs.readFileSync(paths.primary).equals(previousPrimary)) return failed('stale-source', 'Codex 项目状态在操作期间发生变化，未执行移除')
    primaryTemporary = codexWriteSyncedTemp(paths.primary, serialized, stat.mode)
    backupTemporary = codexWriteSyncedTemp(paths.backup, serialized, backupMode)
    if (await codexDesktopIsRunning()) {
      codexRemoveTemporaryFile(primaryTemporary)
      codexRemoveTemporaryFile(backupTemporary)
      return failed('codex-running', 'Codex 已在操作期间启动；未修改项目，请退出后重试')
    }
    closeCodexServer()
    commitStarted = true
    fs.renameSync(backupTemporary, paths.backup)
    backupTemporary = ''
    fs.renameSync(primaryTemporary, paths.primary)
    primaryTemporary = ''
    codexSyncDirectory(paths.codexHome)

    const verifiedPrimaryText = fs.readFileSync(paths.primary, 'utf8')
    const verifiedBackupText = fs.readFileSync(paths.backup, 'utf8')
    const verifiedPrimary = parseCodexNativeRegistryText(verifiedPrimaryText)
    const verifiedBackup = parseCodexNativeRegistryText(verifiedBackupText)
    if (verifiedPrimary.projectById.has(project.id)
      || verifiedBackup.projectById.has(project.id)
      || verifiedPrimaryText !== serialized.toString('utf8')
      || verifiedBackupText !== serialized.toString('utf8')) {
      throw new Error('Codex project removal verification failed')
    }
  } catch {
    codexRemoveTemporaryFile(primaryTemporary)
    codexRemoveTemporaryFile(backupTemporary)
    if (commitStarted) {
      try {
        codexRestoreAtomicFile(paths.primary, previousPrimary, stat.mode)
        codexRestoreAtomicFile(paths.backup, previousBackup, backupMode)
        codexSyncDirectory(paths.codexHome)
      } catch {
        return failed('write-failed', 'Codex 项目状态写入失败，且自动回滚未能完整确认；请勿启动 Codex，先检查全局状态文件')
      }
    }
    return failed('write-failed', 'Codex 项目状态写入或核验失败，已恢复原状态')
  }

  for (const [alias, entry] of codexProjectActions) {
    if (entry.projectKey === action.projectKey) codexProjectActions.delete(alias)
  }
  return { status: 'verified', message: 'Codex 项目已移出侧栏；项目目录和既有会话均未删除' }
}

async function openCodexThread(actionAlias) {
  if (typeof actionAlias !== 'string' || !/^ct_[A-Za-z0-9_-]{16,80}$/.test(actionAlias)) return { outcome: 'failed', errorCode: 'invalid-alias', message: '线程动作已失效' }
  const entry = codexThreadActions.get(actionAlias)
  if (!entry || entry.expiresAt <= Date.now() || !validCodexThreadId(entry.threadId)) {
    codexThreadActions.delete(actionAlias)
    return { outcome: 'failed', errorCode: 'expired-alias', message: '线程动作已过期，请刷新后重试' }
  }
  const targetThreadId = codexDesktopBridge?.navigationTargetForThread(entry.threadId) || entry.threadId
  const target = `codex://threads/${encodeURIComponent(targetThreadId)}`
  const shell = electronShell()
  if (shell && typeof shell.openExternal === 'function') {
    try {
      await withFileActionTimeout(shell.openExternal(target))
      codexDesktopBridge?.markThreadOpenedRead(entry.threadId, targetThreadId)
      return { outcome: 'opened' }
    } catch {
      if (targetThreadId !== entry.threadId) {
        try {
          await withFileActionTimeout(shell.openExternal(`codex://threads/${encodeURIComponent(entry.threadId)}`))
          codexDesktopBridge?.markThreadOpenedRead(entry.threadId, entry.threadId)
          return { outcome: 'opened', message: 'Side Chat 无法直达，已回到主对话' }
        } catch {}
      }
      return { outcome: 'failed', errorCode: 'open-failed', message: 'Codex 线程打开失败' }
    }
  }
  try {
    if (globalThis.utools && typeof globalThis.utools.shellOpenExternal === 'function') {
      const dispatched = globalThis.utools.shellOpenExternal(target)
      if (dispatched === false) throw new Error('shellOpenExternal rejected')
      codexDesktopBridge?.markThreadOpenedRead(entry.threadId, targetThreadId)
      return { outcome: 'dispatched', message: '已交给系统打开' }
    }
  } catch {}
  return { outcome: 'failed', errorCode: 'unsupported', message: '当前宿主不支持打开 Codex 线程' }
}

async function openCodexBlank() {
  const target = 'codex://new'
  const shell = electronShell()
  if (shell && typeof shell.openExternal === 'function') {
    try {
      await withFileActionTimeout(shell.openExternal(target))
      return { outcome: 'opened' }
    } catch {
      return { outcome: 'failed', errorCode: 'open-failed', message: 'Codex 空白页打开失败' }
    }
  }
  try {
    if (globalThis.utools && typeof globalThis.utools.shellOpenExternal === 'function') {
      globalThis.utools.shellOpenExternal(target)
      return { outcome: 'dispatched' }
    }
  } catch {}
  return { outcome: 'failed', errorCode: 'unsupported', message: '当前宿主不支持打开 Codex 空白页' }
}

async function freshCodexNewThreadContext() {
  const [rateResult, accountResult, modelResult] = await Promise.all([
    requestCodexRpc('account/rateLimits/read', {}),
    requestCodexRpc('account/read', { refreshToken: false }),
    requestCodexRpc('model/list', {})
  ])
  if (codexRecord(accountResult).requiresOpenaiAuth === true && !codexRecord(accountResult).account) throw codexError('not-authenticated', 'Codex authentication required')
  const quota = sanitizeCodexQuota(rateResult, accountResult)
  const catalog = sanitizeCodexModelList(modelResult)
  const registry = readCodexNativeRegistry()
  const receivedAt = Date.now()
  return {
    quota: { version: 2, status: 'ok', ...quota, updatedAt: receivedAt },
    modelCatalog: { version: 1, status: 'ok', models: catalog.models, fingerprint: catalog.fingerprint, updatedAt: receivedAt },
    contextFingerprint: codexNewThreadContextFingerprint(quota, catalog.fingerprint, registry.fingerprint),
    projectFingerprint: registry.fingerprint,
    receivedAt,
    registry
  }
}

async function cleanupCodexZeroTurn(threadId) {
  try {
    await requestCodexRpc('thread/archive', { threadId })
    return true
  } catch {
    return false
  }
}

function safeCodexNewThreadContext(context) {
  return {
    quota: context.quota,
    modelCatalog: context.modelCatalog,
    contextFingerprint: context.contextFingerprint,
    projectFingerprint: context.projectFingerprint,
    receivedAt: context.receivedAt
  }
}

function refreshedCodexNewThreadTarget(projectKey, context) {
  if (projectKey === 'chats') {
    const project = { id: '', key: 'chats', name: 'Chats', kind: 'chats' }
    return {
      projectKey: 'chats',
      projectAlias: codexProjectActionAlias(project, context.projectFingerprint, Date.now()),
      projectName: 'Chats',
      projectKind: 'chats',
      projectFingerprint: context.projectFingerprint
    }
  }
  const project = context.registry.projects.find((item) => item.key === projectKey)
  if (!project) return undefined
  return {
    projectKey: project.key,
    projectAlias: codexProjectActionAlias({ ...project, kind: 'project' }, context.projectFingerprint, Date.now()),
    projectName: project.name,
    projectKind: 'project',
    projectFingerprint: context.projectFingerprint
  }
}

async function createCodexThread(request) {
  const input = codexRecord(request)
  const target = codexRecord(input.target)
  const projectKey = typeof target.projectKey === 'string' && /^(?:[a-f0-9]{16,64}|chats)$/.test(target.projectKey) ? target.projectKey : ''
  const projectAlias = typeof target.projectAlias === 'string' && /^cp_[A-Za-z0-9_-]{16,80}$/.test(target.projectAlias) ? target.projectAlias : ''
  const projectFingerprint = typeof target.projectFingerprint === 'string' && /^[a-f0-9]{64}$/.test(target.projectFingerprint) ? target.projectFingerprint : ''
  const contextFingerprint = typeof input.contextFingerprint === 'string' && /^[a-f0-9]{64}$/.test(input.contextFingerprint) ? input.contextFingerprint : ''
  const modelId = typeof input.modelId === 'string' && /^[A-Za-z0-9._:-]{1,120}$/.test(input.modelId) ? input.modelId : ''
  const mode = input.mode === 'send-and-open' || input.mode === 'create-empty' ? input.mode : ''
  const prompt = typeof input.prompt === 'string' && input.prompt.length <= 50_000 ? input.prompt : ''
  if (!projectKey || !projectAlias || !projectFingerprint || !contextFingerprint || !modelId || !mode || (mode === 'send-and-open' && !prompt.trim())) {
    return { outcome: 'failed', errorCode: 'invalid-request', message: '新会话请求已失效，请重新打开编辑器', retryAllowed: true }
  }

  try {
    const context = await freshCodexNewThreadContext()
    const refreshedTarget = refreshedCodexNewThreadTarget(projectKey, context)
    if (context.contextFingerprint !== contextFingerprint || context.projectFingerprint !== projectFingerprint) {
      return { outcome: 'stale-selection', errorCode: 'selection-stale', message: '额度、模型目录或项目状态已更新，请确认刷新后的模型后再次提交', retryAllowed: true, context: safeCodexNewThreadContext(context), ...(refreshedTarget ? { target: refreshedTarget } : {}) }
    }
    const projectAction = codexProjectActions.get(projectAlias)
    if (!projectAction || projectAction.expiresAt <= Date.now() || projectAction.projectKey !== projectKey || projectAction.sourceFingerprint !== projectFingerprint) {
      return { outcome: 'stale-selection', errorCode: 'project-stale', message: '目标项目已更新，请重新确认后提交', retryAllowed: true, context: safeCodexNewThreadContext(context), ...(refreshedTarget ? { target: refreshedTarget } : {}) }
    }
    const model = context.modelCatalog.models.find((item) => item.id === modelId && item.supportsText === true)
    if (!model) {
      return { outcome: 'stale-selection', errorCode: 'model-unavailable', message: '所选模型已不在可用目录中，请重新选择', retryAllowed: true, context: safeCodexNewThreadContext(context), ...(refreshedTarget ? { target: refreshedTarget } : {}) }
    }

    let cwd
    if (projectKey !== 'chats') {
      const project = context.registry.projectById.get(projectAction.projectId)
      if (!project || project.key !== projectKey || !project.roots[0]) {
        return { outcome: 'stale-selection', errorCode: 'project-stale', message: '目标项目根目录已更新，请重新确认后提交', retryAllowed: true, context: safeCodexNewThreadContext(context), ...(refreshedTarget ? { target: refreshedTarget } : {}) }
      }
      cwd = project.roots[0]
    }

    const started = codexRecord(await requestCodexRpc('thread/start', {
      ...(cwd ? { cwd } : {}),
      model: modelId,
      allowProviderModelFallback: false,
      ephemeral: false
    }))
    const thread = codexRecord(started.thread)
    const threadId = validCodexThreadId(thread.id) ? thread.id : ''
    if (!threadId) return { outcome: 'failed', errorCode: 'thread-start-invalid', message: 'Codex 未返回有效的新会话', retryAllowed: true }
    const actualModel = typeof started.model === 'string' ? started.model : ''
    const actualCwd = codexNormalizeNativeRoot(started.cwd)
    if (actualModel !== modelId || (cwd && actualCwd !== cwd)) {
      const cleaned = await cleanupCodexZeroTurn(threadId)
      return cleaned
        ? { outcome: 'failed', errorCode: actualModel !== modelId ? 'model-mismatch' : 'project-mismatch', message: 'Codex 未按指定模型或项目创建会话，已清理本次空会话', retryAllowed: true }
        : { outcome: 'failed', errorCode: 'cleanup-failed', message: '新会话校验失败且清理未确认，已停止自动重试', retryAllowed: false }
    }

    const alias = codexThreadAlias(threadId, Date.now(), { projectKey, sourceFingerprint: projectFingerprint }).alias
    if (mode === 'send-and-open') {
      try {
        const turnResult = codexRecord(await requestCodexRpc('turn/start', { threadId, input: [{ type: 'text', text: prompt }] }))
        const turn = codexRecord(turnResult.turn)
        if (typeof turn.id !== 'string' || !turn.id) throw codexError('protocol-error', 'Codex did not return a Turn identity')
      } catch {
        const cleaned = await cleanupCodexZeroTurn(threadId)
        return cleaned
          ? { outcome: 'failed', errorCode: 'turn-start-failed', message: '首轮发送失败，空会话已清理；提示词仍保留，可重试', retryAllowed: true }
          : { outcome: 'failed', errorCode: 'cleanup-failed', message: '首轮发送失败且空会话清理未确认，已停止自动重试', retryAllowed: false }
      }
    }

    const opened = await openCodexThread(alias)
    if (opened.outcome === 'opened' || opened.outcome === 'dispatched') return { outcome: 'opened', modelId, retryAllowed: false }
    if (mode === 'send-and-open') {
      return { outcome: 'reopen-available', modelId, reopenAlias: alias, errorCode: opened.errorCode || 'open-failed', message: '首轮已启动，但 Codex 页面未打开；可在短时间内重试打开', retryAllowed: true }
    }
    const cleaned = await cleanupCodexZeroTurn(threadId)
    return cleaned
      ? { outcome: 'failed', errorCode: 'open-failed', message: '空会话未能打开，已清理本次零轮会话', retryAllowed: true }
      : { outcome: 'failed', errorCode: 'cleanup-failed', message: '空会话未能打开且清理未确认，已停止自动重试', retryAllowed: false }
  } catch (error) {
    const code = typeof codexRecord(error).code === 'string' ? codexRecord(error).code : 'unavailable'
    if (['unavailable', 'runtime-unavailable', 'process-exited', 'not-authenticated', 'timeout'].includes(code)) {
      return { outcome: 'manual-only', errorCode: code, message: 'Codex App Server 当前不可用；不会复制或写入提示词，可显式打开 Codex 空白页手动创建', retryAllowed: true }
    }
    return { outcome: 'failed', errorCode: code, message: '新会话创建失败，请刷新后重试', retryAllowed: true }
  }
}

function electronIpcRenderer() {
  try {
    const electron = require('electron')
    return electron.ipcRenderer || null
  } catch {
    return null
  }
}

function codexFloatAlive() {
  if (!codexFloatWindow) return false
  try {
    return typeof codexFloatWindow.isDestroyed !== 'function' || !codexFloatWindow.isDestroyed()
  } catch {
    return false
  }
}

function applyCodexFloatWorkspaceVisibility() {
  const diagnostics = {
    supported: process.platform === 'darwin',
    alwaysOnTop: false,
    allWorkspaces: false,
    visibleOnFullScreen: false,
    checkedAt: Date.now(),
    errorCode: ''
  }
  if (!codexFloatAlive()) {
    codexFloatWorkspaceDiagnostics = { ...diagnostics, errorCode: 'window-unavailable' }
    return false
  }
  try {
    codexFloatWindow.setAlwaysOnTop(true, 'floating')
    diagnostics.alwaysOnTop = typeof codexFloatWindow.isAlwaysOnTop === 'function' ? codexFloatWindow.isAlwaysOnTop() === true : true
  } catch {
    diagnostics.errorCode = 'always-on-top-failed'
  }
  if (process.platform !== 'darwin') {
    codexFloatWorkspaceDiagnostics = { ...diagnostics, errorCode: diagnostics.errorCode || 'unsupported' }
    return diagnostics.alwaysOnTop
  }
  if (typeof codexFloatWindow.setVisibleOnAllWorkspaces !== 'function') {
    codexFloatWorkspaceDiagnostics = { ...diagnostics, errorCode: diagnostics.errorCode || 'all-workspaces-unavailable' }
    return false
  }
  try {
    codexFloatWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    diagnostics.allWorkspaces = true
    diagnostics.visibleOnFullScreen = true
  } catch {
    diagnostics.errorCode = diagnostics.errorCode || 'all-workspaces-failed'
  }
  codexFloatWorkspaceDiagnostics = diagnostics
  return diagnostics.alwaysOnTop && diagnostics.allWorkspaces && diagnostics.visibleOnFullScreen
}

function getCodexFloatWorkspaceDiagnostics() {
  return { ...codexFloatWorkspaceDiagnostics }
}

function floatDisplayForPoint(point) {
  const utools = globalThis.utools
  try {
    if (utools && typeof utools.getDisplayNearestPoint === 'function') {
      const display = utools.getDisplayNearestPoint(point)
      if (display) return display
    }
  } catch {}
  return { id: 'primary', workArea: { x: 0, y: 0, width: 1440, height: 900 }, bounds: { x: 0, y: 0, width: 1440, height: 900 } }
}

function floatDisplayForPosition(position) {
  const utools = globalThis.utools
  if (position && position.displayId && utools && typeof utools.getAllDisplays === 'function') {
    try {
      const match = utools.getAllDisplays().find((display) => String(display.id) === String(position.displayId))
      if (match) return match
    } catch {}
  }
  let point = { x: 720, y: 450 }
  try {
    if (utools && typeof utools.getCursorScreenPoint === 'function') point = utools.getCursorScreenPoint()
  } catch {}
  return floatDisplayForPoint(point)
}

function clampFloatBounds(bounds, display) {
  const area = display.workArea || display.bounds || { x: 0, y: 0, width: 1440, height: 900 }
  const areaWidth = Math.max(1, Math.round(area.width))
  const areaHeight = Math.max(1, Math.round(area.height))
  const marginX = areaWidth >= 72 + CODEX_FLOAT_MARGIN * 2 ? CODEX_FLOAT_MARGIN : 0
  const marginY = areaHeight >= 72 + CODEX_FLOAT_MARGIN * 2 ? CODEX_FLOAT_MARGIN : 0
  const requestedWidth = Number.isFinite(bounds.width) ? Math.round(bounds.width) : 72
  const requestedHeight = Number.isFinite(bounds.height) ? Math.round(bounds.height) : 72
  const width = Math.max(1, Math.min(Math.max(72, requestedWidth), areaWidth - marginX * 2))
  const height = Math.max(1, Math.min(Math.max(72, requestedHeight), areaHeight - marginY * 2))
  const minX = area.x + marginX
  const minY = area.y + marginY
  const maxX = area.x + areaWidth - width - marginX
  const maxY = area.y + areaHeight - height - marginY
  const requestedX = Number.isFinite(bounds.x) ? Math.round(bounds.x) : minX
  const requestedY = Number.isFinite(bounds.y) ? Math.round(bounds.y) : minY
  return { x: Math.min(maxX, Math.max(minX, requestedX)), y: Math.min(maxY, Math.max(minY, requestedY)), width, height }
}

function nearestFloatEdge(bounds, display) {
  const area = display.workArea || display.bounds
  const distances = [
    ['left', Math.abs(bounds.x - area.x)],
    ['right', Math.abs(area.x + area.width - (bounds.x + bounds.width))],
    ['top', Math.abs(bounds.y - area.y)],
    ['bottom', Math.abs(area.y + area.height - (bounds.y + bounds.height))]
  ]
  distances.sort((a, b) => a[1] - b[1])
  return distances[0][0]
}

function snapFloatBounds(bounds, display) {
  const area = display.workArea || display.bounds
  const next = clampFloatBounds(bounds, display)
  const edge = nearestFloatEdge(next, display)
  const marginX = area.width >= 72 + CODEX_FLOAT_MARGIN * 2 ? CODEX_FLOAT_MARGIN : 0
  const marginY = area.height >= 72 + CODEX_FLOAT_MARGIN * 2 ? CODEX_FLOAT_MARGIN : 0
  if (edge === 'left') next.x = area.x + marginX
  if (edge === 'right') next.x = area.x + area.width - next.width - marginX
  if (edge === 'top') next.y = area.y + marginY
  if (edge === 'bottom') next.y = area.y + area.height - next.height - marginY
  return { bounds: next, edge }
}

function codexFloatCollapsedSize(snapshot) {
  return codexRecord(snapshot).style === 'card'
    ? { ...CODEX_FLOAT_CARD_SIZE }
    : { ...CODEX_FLOAT_WATER_SIZE }
}

function codexFloatExpandedHeight(snapshot) {
  const source = codexRecord(snapshot)
  const quota = codexRecord(source.quota)
  const conversations = codexRecord(source.conversations)
  const expandedFields = new Set(Array.isArray(source.expandedFields) ? source.expandedFields : [])

  // Root padding + header + footer, with a small rendering allowance. Content
  // blocks below mirror the renderer's actual one-row quota grid and compact
  // empty-task treatment so an empty inbox does not create a blank panel.
  let height = 151
  let visibleQuotaBuckets = 0
  const quotaFieldEnabled = expandedFields.has('short') || expandedFields.has('weekly')
  if (expandedFields.has('short') && quota.short && typeof quota.short === 'object') visibleQuotaBuckets += 1
  if (expandedFields.has('weekly') && quota.weekly && typeof quota.weekly === 'object') visibleQuotaBuckets += 1
  if (visibleQuotaBuckets > 0) height += expandedFields.has('reset') ? 82 : 64
  else if (quotaFieldEnabled) height += 64
  if (expandedFields.has('config')) height += 38

  if (source.conversationInboxEnabled === true && expandedFields.has('tasks')) {
    const ongoingCount = Array.isArray(conversations.ongoing) ? conversations.ongoing.length : 0
    const stoppedCount = Array.isArray(conversations.stopped) ? conversations.stopped.length : 0
    const hiddenCount = Array.isArray(conversations.hidden) ? conversations.hidden.length : 0
    const completedUnreadCount = Array.isArray(conversations.completedUnread)
      ? conversations.completedUnread.length
      : Array.isArray(conversations.pending) ? conversations.pending.length : 0
    const completedCount = Array.isArray(conversations.completed) ? conversations.completed.length : 0
    const taskCount = Math.max(ongoingCount + stoppedCount, hiddenCount, completedUnreadCount + completedCount)
    height += 69
    if (taskCount === 0) height += 30
    else height += taskCount * 48 + Math.max(0, taskCount - 1) * 5
  }

  return Math.max(CODEX_FLOAT_EXPANDED_MIN_HEIGHT, Math.min(CODEX_FLOAT_EXPANDED_MAX_HEIGHT, height))
}

function normalizeCodexExpandedSizes(value) {
  if (!Array.isArray(value)) return []
  const byDisplay = new Map()
  for (const item of value) {
    const source = codexRecord(item)
    const displayId = typeof source.displayId === 'string' ? source.displayId.slice(0, 120) : ''
    if (!displayId || !Number.isFinite(source.width) || !Number.isFinite(source.height) || !Number.isFinite(source.updatedAt)) continue
    const entry = {
      displayId,
      width: Math.max(CODEX_FLOAT_EXPANDED_MIN_WIDTH, Math.round(source.width)),
      height: Math.max(CODEX_FLOAT_EXPANDED_MIN_HEIGHT, Math.round(source.height)),
      updatedAt: Math.max(0, Math.round(source.updatedAt))
    }
    const previous = byDisplay.get(displayId)
    if (!previous || entry.updatedAt >= previous.updatedAt) byDisplay.set(displayId, entry)
  }
  return [...byDisplay.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8)
}

function clampCodexExpandedSize(size, display) {
  const area = display?.workArea || display?.bounds || { x: 0, y: 0, width: 1440, height: 900 }
  const maxWidth = Math.max(1, Math.round(area.width) - CODEX_FLOAT_MARGIN * 2)
  const maxHeight = Math.max(1, Math.round(area.height) - CODEX_FLOAT_MARGIN * 2)
  return {
    width: Math.min(maxWidth, Math.max(Math.min(CODEX_FLOAT_EXPANDED_MIN_WIDTH, maxWidth), Math.round(size.width))),
    height: Math.min(maxHeight, Math.max(Math.min(CODEX_FLOAT_EXPANDED_MIN_HEIGHT, maxHeight), Math.round(size.height)))
  }
}

function codexFloatExpandedPreference(display) {
  const displayId = String(display?.id || '')
  const exact = codexFloatExpandedSizes.find((entry) => entry.displayId === displayId)
  if (exact) return exact
  if (codexFloatPositionDisplayId && codexFloatPositionDisplayId === displayId) return null
  return codexFloatExpandedSizes[0] || null
}

function codexFloatDesiredSize(snapshot, expanded, display) {
  if (!expanded) return codexFloatCollapsedSize(snapshot)
  const preferred = codexFloatExpandedPreference(display)
  return clampCodexExpandedSize(preferred || { width: CODEX_FLOAT_EXPANDED_WIDTH, height: codexFloatExpandedHeight(snapshot) }, display)
}

function codexFloatResizeCorner(bounds, display, edge) {
  const area = display.workArea || display.bounds
  const vertical = bounds.y + bounds.height / 2 <= area.y + area.height / 2 ? 'bottom' : 'top'
  const horizontal = bounds.x + bounds.width / 2 <= area.x + area.width / 2 ? 'right' : 'left'
  if (edge === 'left') return `${vertical}-right`
  if (edge === 'right') return `${vertical}-left`
  if (edge === 'top') return `bottom-${horizontal}`
  return `top-${horizontal}`
}

function validCodexResizeCorner(value) {
  return value === 'top-left' || value === 'top-right' || value === 'bottom-left' || value === 'bottom-right'
}

function validCodexFloatEdge(edge) {
  return edge === 'left' || edge === 'right' || edge === 'top' || edge === 'bottom'
}

function alignFloatBoundsToEdge(bounds, display, edge) {
  const area = display.workArea || display.bounds
  const next = clampFloatBounds(bounds, display)
  const marginX = area.width >= 72 + CODEX_FLOAT_MARGIN * 2 ? CODEX_FLOAT_MARGIN : 0
  const marginY = area.height >= 72 + CODEX_FLOAT_MARGIN * 2 ? CODEX_FLOAT_MARGIN : 0
  if (edge === 'left') next.x = area.x + marginX
  if (edge === 'right') next.x = area.x + area.width - next.width - marginX
  if (edge === 'top') next.y = area.y + marginY
  if (edge === 'bottom') next.y = area.y + area.height - next.height - marginY
  return clampFloatBounds(next, display)
}

function resizeFloatBounds(current, size, display, preferredEdge) {
  const edge = validCodexFloatEdge(preferredEdge) ? preferredEdge : nearestFloatEdge(current, display)
  const next = { x: current.x, y: current.y, width: size.width, height: size.height }
  if (edge === 'right') next.x = current.x + current.width - size.width
  if (edge === 'bottom') next.y = current.y + current.height - size.height
  return { bounds: alignFloatBoundsToEdge(next, display, edge), edge }
}

function pushCodexFloatSnapshot() {
  if (!codexFloatAlive() || !codexFloatSnapshot) return false
  try {
    codexFloatWindow.webContents.send(CODEX_FLOAT_CHANNELS.snapshot, codexFloatSnapshot)
    pushCodexFloatState()
    return true
  } catch {
    return false
  }
}

function pushCodexFloatState() {
  if (!codexFloatAlive() || typeof codexFloatWindow.getBounds !== 'function') return false
  try {
    const bounds = codexFloatWindow.getBounds()
    const display = floatDisplayForPoint({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 })
    const preference = codexFloatExpandedPreference(display)
      codexFloatWindow.webContents.send(CODEX_FLOAT_CHANNELS.state, {
        expanded: codexFloatExpanded,
        pinned: codexFloatPinned,
        resizing: Boolean(codexFloatResize),
      resizeCorner: codexFloatExpanded ? codexFloatResizeCorner(bounds, display, codexFloatEdge) : null,
      expandedSize: codexFloatExpanded ? {
        displayId: String(display.id || ''),
        width: bounds.width,
        height: bounds.height,
        manual: Boolean(preference)
      } : null
    })
    return true
  } catch {
    return false
  }
}

function initialCodexFloatBounds(position) {
  const display = floatDisplayForPosition(position)
  const area = display.workArea || display.bounds
  const size = codexFloatDesiredSize(codexFloatSnapshot, false, display)
  const fallback = { x: area.x + area.width - size.width - CODEX_FLOAT_MARGIN, y: area.y + Math.round((area.height - size.height) / 2), ...size }
  const requested = position && Number.isFinite(position.x) && Number.isFinite(position.y)
    ? { x: position.x, y: position.y, ...size }
    : fallback
  const requestedEdge = position && validCodexFloatEdge(position.edge) ? position.edge : 'right'
  return { display, bounds: alignFloatBoundsToEdge(requested, display, requestedEdge), edge: requestedEdge }
}

function codexFloatDevelopmentEntry() {
  const href = typeof globalThis.location?.href === 'string' ? globalThis.location.href : ''
  return /^http:\/\/127\.0\.0\.1:8092(?:\/|$)/.test(href)
    ? 'http://127.0.0.1:8092/float.html'
    : ''
}

function createCodexFloat(position) {
  const utools = globalThis.utools
  if (!utools || typeof utools.createBrowserWindow !== 'function') return false
  const initial = initialCodexFloatBounds(position)
  const developmentEntry = codexFloatDevelopmentEntry()
  let redirectedToDevelopment = false
  const finishCreateCodexFloat = () => {
    applyCodexFloatWorkspaceVisibility()
    try {
      if (typeof codexFloatWindow?.showInactive === 'function') codexFloatWindow.showInactive()
      else codexFloatWindow?.show()
    } catch {}
    pushCodexFloatSnapshot()
  }
  try {
    codexFloatEdge = initial.edge
    codexFloatWindow = utools.createBrowserWindow('float.html', {
      show: false,
      title: 'EyPc Codex',
      x: initial.bounds.x,
      y: initial.bounds.y,
      width: initial.bounds.width,
      height: initial.bounds.height,
      backgroundColor: '#00000000',
      frame: false,
      transparent: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      movable: false,
      closeable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      roundedCorners: false,
      hasShadow: false,
      autoHideMenuBar: true,
      webPreferences: { preload: 'float-preload.js' }
    }, () => {
      if (developmentEntry && !redirectedToDevelopment && typeof codexFloatWindow?.loadURL === 'function') {
        redirectedToDevelopment = true
        try {
          const loading = codexFloatWindow.loadURL(developmentEntry)
          if (loading && typeof loading.then === 'function') loading.then(finishCreateCodexFloat).catch(finishCreateCodexFloat)
          return
        } catch {}
      }
      finishCreateCodexFloat()
    })
    applyCodexFloatWorkspaceVisibility()
    return true
  } catch {
    codexFloatWindow = null
    return false
  }
}

function closeCodexFloat() {
  if (codexFloatAlive()) {
    try { codexFloatWindow.close() } catch {}
  }
  codexFloatWindow = null
  codexFloatExpanded = false
  codexFloatPinned = false
  codexFloatEdge = 'right'
  codexFloatDrag = null
  codexFloatResize = null
}

function activateCodexFloat(payload) {
  if (!codexFloatAlive()) return false
  resizeCodexFloat(true, true)
  try {
    if (typeof codexFloatWindow.show === 'function') codexFloatWindow.show()
    else if (typeof codexFloatWindow.showInactive === 'function') codexFloatWindow.showInactive()
    if (typeof codexFloatWindow.focus === 'function') codexFloatWindow.focus()
    const command = codexRecord(payload).command === 'new-thread' ? 'new-thread' : undefined
    codexFloatWindow.webContents.send(CODEX_FLOAT_CHANNELS.activate, { requestedAt: Date.now(), ...(command ? { command } : {}) })
    return true
  } catch {
    return false
  }
}

function syncCodexFloat(payload) {
  const source = codexRecord(payload)
  codexFloatPersistent = source.visible === true
  if (source.visible !== true) {
    closeCodexFloat()
    return true
  }
  codexFloatSnapshot = source.snapshot && typeof source.snapshot === 'object' ? source.snapshot : null
  codexFloatExpandedSizes = normalizeCodexExpandedSizes(source.expandedSizes || codexRecord(source.snapshot).expandedSizes)
  const position = codexRecord(source.position)
  codexFloatPositionDisplayId = typeof position.displayId === 'string' ? position.displayId : ''
  if (!codexFloatAlive() && !createCodexFloat(position)) return false
  applyCodexFloatWorkspaceVisibility()
  if (!codexFloatResize) resizeCodexFloat(codexFloatExpanded, false)
  return pushCodexFloatSnapshot()
}

function emitCodexFloatAction(actionId, args) {
  if (typeof actionId !== 'string' || !actionId.startsWith('codex.')) return
  if (actionId === 'codex.settings.open') {
    try {
      if (globalThis.utools && typeof globalThis.utools.showMainWindow === 'function') globalThis.utools.showMainWindow()
    } catch {}
  }
  for (const listener of codexFloatActionListeners) {
    try { listener({ actionId, args: codexRecord(args) }) } catch {}
  }
}

function resizeCodexFloat(expanded, notifyState = true) {
  if (!codexFloatAlive() || typeof codexFloatWindow.getBounds !== 'function') return
  const current = codexFloatWindow.getBounds()
  const display = floatDisplayForPoint({ x: current.x + current.width / 2, y: current.y + current.height / 2 })
  const edge = validCodexFloatEdge(codexFloatEdge) ? codexFloatEdge : nearestFloatEdge(current, display)
  const size = codexFloatDesiredSize(codexFloatSnapshot, expanded, display)
  const resized = resizeFloatBounds(current, size, display, edge)
  if (current.x !== resized.bounds.x || current.y !== resized.bounds.y || current.width !== resized.bounds.width || current.height !== resized.bounds.height) {
    try { codexFloatWindow.setBounds(resized.bounds) } catch {}
  }
  codexFloatEdge = resized.edge
  codexFloatExpanded = expanded
  codexFloatPinned = false
  if (notifyState) pushCodexFloatState()
}

function resetCodexFloatGeometry(payload) {
  const source = codexRecord(payload)
  codexFloatExpandedSizes = normalizeCodexExpandedSizes(source.expandedSizes)
  if (!codexFloatAlive() || typeof codexFloatWindow.getBounds !== 'function') return true
  codexFloatDrag = null
  codexFloatResize = null
  const position = codexRecord(source.position)
  codexFloatPositionDisplayId = typeof position.displayId === 'string' ? position.displayId : ''
  const display = floatDisplayForPosition(position)
  const area = display.workArea || display.bounds
  const size = codexFloatDesiredSize(codexFloatSnapshot, codexFloatExpanded, display)
  const edge = validCodexFloatEdge(position.edge) ? position.edge : 'right'
  const requested = Number.isFinite(position.x) && Number.isFinite(position.y)
    ? { x: position.x, y: position.y, ...size }
    : { x: area.x + area.width - size.width - CODEX_FLOAT_MARGIN, y: area.y + Math.round((area.height - size.height) / 2), ...size }
  const bounds = alignFloatBoundsToEdge(requested, display, edge)
  try { codexFloatWindow.setBounds(bounds) } catch { return false }
  applyCodexFloatWorkspaceVisibility()
  codexFloatEdge = edge
  pushCodexFloatState()
  return true
}

function moveCodexFloatResize(screenX, screenY) {
  if (!codexFloatResize || !codexFloatAlive()) return false
  if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) return false
  const start = codexFloatResize
  const dx = screenX - start.pointerX
  const dy = screenY - start.pointerY
  const left = start.corner.endsWith('-left')
  const top = start.corner.startsWith('top-')
  const requested = {
    width: left ? start.bounds.width - dx : start.bounds.width + dx,
    height: top ? start.bounds.height - dy : start.bounds.height + dy
  }
  const size = clampCodexExpandedSize(requested, start.display)
  const candidate = {
    x: left ? start.bounds.x + start.bounds.width - size.width : start.bounds.x,
    y: top ? start.bounds.y + start.bounds.height - size.height : start.bounds.y,
    ...size
  }
  const bounds = alignFloatBoundsToEdge(candidate, start.display, start.edge)
  try { codexFloatWindow.setBounds(bounds) } catch { return false }
  return true
}

function installCodexFloatIpc() {
  const ipc = electronIpcRenderer()
  if (!ipc || typeof ipc.on !== 'function') return
  ipc.on(CODEX_FLOAT_CHANNELS.expansion, (_event, payload) => {
    if (codexFloatResize) return
    const source = codexRecord(payload)
    const expanded = source.expanded === true
    resizeCodexFloat(expanded, true)
  })
  ipc.on(CODEX_FLOAT_CHANNELS.returnFocus, () => {
    if (!codexFloatAlive()) return
    try { codexFloatWindow.hide() } catch {}
  })
  ipc.on(CODEX_FLOAT_CHANNELS.action, (_event, payload) => emitCodexFloatAction(codexRecord(payload).actionId, codexRecord(payload).args))
  ipc.on(CODEX_FLOAT_CHANNELS.threadCreate, async (_event, payload) => {
    const source = codexRecord(payload)
    const requestId = typeof source.requestId === 'string' && /^ftr_[A-Za-z0-9_-]{6,80}$/.test(source.requestId) ? source.requestId : ''
    if (!requestId) return
    const result = await createCodexThread(source.request)
    if (!codexFloatAlive()) return
    try { codexFloatWindow.webContents.send(CODEX_FLOAT_CHANNELS.threadCreateResult, { requestId, result }) } catch {}
  })
  ipc.on(CODEX_FLOAT_CHANNELS.blankOpen, async (_event, payload) => {
    const source = codexRecord(payload)
    const requestId = typeof source.requestId === 'string' && /^ftr_[A-Za-z0-9_-]{6,80}$/.test(source.requestId) ? source.requestId : ''
    if (!requestId) return
    const result = await openCodexBlank()
    if (!codexFloatAlive()) return
    try { codexFloatWindow.webContents.send(CODEX_FLOAT_CHANNELS.blankOpenResult, { requestId, result }) } catch {}
  })
  ipc.on(CODEX_FLOAT_CHANNELS.copyText, async (_event, payload) => {
    const source = codexRecord(payload)
    const requestId = typeof source.requestId === 'string' && /^ftr_[A-Za-z0-9_-]{6,80}$/.test(source.requestId) ? source.requestId : ''
    const text = typeof source.text === 'string' && source.text.length <= 50_000 ? source.text : ''
    if (!requestId || !text.trim()) return
    const copied = await copyText(text)
    if (!codexFloatAlive()) return
    try { codexFloatWindow.webContents.send(CODEX_FLOAT_CHANNELS.copyTextResult, { requestId, result: copied }) } catch {}
  })
  ipc.on(CODEX_FLOAT_CHANNELS.threadOpen, async (_event, payload) => {
    const source = codexRecord(payload)
    const requestId = typeof source.requestId === 'string' && /^ftr_[A-Za-z0-9_-]{6,80}$/.test(source.requestId) ? source.requestId : ''
    const actionAlias = typeof source.actionAlias === 'string' ? source.actionAlias : ''
    if (!requestId) return
    const result = await openCodexThread(actionAlias)
    if (!codexFloatAlive()) return
    try { codexFloatWindow.webContents.send(CODEX_FLOAT_CHANNELS.threadOpenResult, { requestId, result }) } catch {}
  })
  ipc.on(CODEX_FLOAT_CHANNELS.dragStart, (_event, payload) => {
    if (codexFloatResize || !codexFloatAlive() || typeof codexFloatWindow.getBounds !== 'function') return
    const point = codexRecord(payload)
    if (!Number.isFinite(point.screenX) || !Number.isFinite(point.screenY)) return
    codexFloatDrag = { pointerX: point.screenX, pointerY: point.screenY, bounds: codexFloatWindow.getBounds() }
  })
  ipc.on(CODEX_FLOAT_CHANNELS.dragMove, (_event, payload) => {
    if (!codexFloatDrag || !codexFloatAlive()) return
    const point = codexRecord(payload)
    if (!Number.isFinite(point.screenX) || !Number.isFinite(point.screenY)) return
    const candidate = {
      ...codexFloatDrag.bounds,
      x: codexFloatDrag.bounds.x + point.screenX - codexFloatDrag.pointerX,
      y: codexFloatDrag.bounds.y + point.screenY - codexFloatDrag.pointerY
    }
    const display = floatDisplayForPoint({ x: candidate.x + candidate.width / 2, y: candidate.y + candidate.height / 2 })
    try { codexFloatWindow.setBounds(clampFloatBounds(candidate, display)) } catch {}
  })
  ipc.on(CODEX_FLOAT_CHANNELS.dragEnd, () => {
    if (!codexFloatDrag || !codexFloatAlive() || typeof codexFloatWindow.getBounds !== 'function') return
    const current = codexFloatWindow.getBounds()
    const startBounds = codexFloatDrag.bounds
    if (current.x === startBounds.x && current.y === startBounds.y && current.width === startBounds.width && current.height === startBounds.height) {
      codexFloatDrag = null
      return
    }
    const display = floatDisplayForPoint({ x: current.x + current.width / 2, y: current.y + current.height / 2 })
    const snapped = snapFloatBounds(current, display)
    try { codexFloatWindow.setBounds(snapped.bounds) } catch {}
    applyCodexFloatWorkspaceVisibility()
    codexFloatEdge = snapped.edge
    codexFloatPositionDisplayId = String(display.id || '')
    codexFloatDrag = null
    emitCodexFloatAction('codex.float.position.save', {
      position: { displayId: String(display.id || ''), x: snapped.bounds.x, y: snapped.bounds.y, edge: snapped.edge }
    })
  })
  ipc.on(CODEX_FLOAT_CHANNELS.resizeStart, (_event, payload) => {
    if (!codexFloatExpanded || codexFloatDrag || codexFloatResize || !codexFloatAlive() || typeof codexFloatWindow.getBounds !== 'function') return
    const point = codexRecord(payload)
    if (!Number.isFinite(point.screenX) || !Number.isFinite(point.screenY) || !validCodexResizeCorner(point.corner)) return
    const bounds = codexFloatWindow.getBounds()
    const display = floatDisplayForPoint({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 })
    const expectedCorner = codexFloatResizeCorner(bounds, display, codexFloatEdge)
    if (point.corner !== expectedCorner) return
    codexFloatResize = {
      pointerX: point.screenX,
      pointerY: point.screenY,
      bounds: { ...bounds },
      display,
      displayId: String(display.id || ''),
      edge: codexFloatEdge,
      corner: point.corner
    }
    pushCodexFloatState()
  })
  ipc.on(CODEX_FLOAT_CHANNELS.resizeMove, (_event, payload) => {
    const point = codexRecord(payload)
    moveCodexFloatResize(point.screenX, point.screenY)
  })
  ipc.on(CODEX_FLOAT_CHANNELS.resizeEnd, () => {
    if (!codexFloatResize || !codexFloatAlive() || typeof codexFloatWindow.getBounds !== 'function') return
    const resize = codexFloatResize
    const bounds = codexFloatWindow.getBounds()
    codexFloatResize = null
    pushCodexFloatState()
    if (bounds.width === resize.bounds.width && bounds.height === resize.bounds.height) return
    emitCodexFloatAction('codex.float.geometry.save', {
      position: { displayId: resize.displayId, x: bounds.x, y: bounds.y, edge: resize.edge },
      expandedSize: { displayId: resize.displayId, width: bounds.width, height: bounds.height, updatedAt: Date.now() }
    })
  })
  ipc.on(CODEX_FLOAT_CHANNELS.resizeCancel, () => {
    if (!codexFloatResize || !codexFloatAlive()) return
    const bounds = codexFloatResize.bounds
    codexFloatResize = null
    try { codexFloatWindow.setBounds(bounds) } catch {}
    pushCodexFloatState()
  })
}

installCodexFloatIpc()

if (globalThis.utools && typeof globalThis.utools.onPluginEnter === 'function') {
  globalThis.utools.onPluginEnter((action) => {
    lastEnterPayload = action || null
    for (const listener of enterPayloadListeners) {
      try {
        listener(lastEnterPayload)
      } catch {}
    }
  })
}

if (globalThis.utools && typeof globalThis.utools.onPluginOut === 'function') {
  globalThis.utools.onPluginOut((isKill) => {
    if (isKill) {
      shutdownCodexEnvironmentActions()
      closeCodexActionRunner()
      closeCodexFloat()
      closeCodexConnections({ force: true })
      return
    }
    if (!codexFloatPersistent) closeCodexFloat()
    // mainHide/background exit is a visibility transition, not a process
    // boundary. Keep the App Server session, aliases and latest-Turn cache hot
    // for the next global shortcut. Explicit Controller close, feature disable
    // and onPluginOut(true) still own session teardown.
  })
}

const CODEX_ACTION_HOST_RUNTIME_REVISION = 'action-host-v2-exact-argv-target'
const CODEX_ENV_ACTION_CONFIRM_TTL_MS = 30_000
const codexEnvironmentCommandVault = new Map()
const codexEnvironmentActionSessions = new Map()
const codexEnvironmentConfirmTokens = new Map()
let codexActionDeferredServerClose = false
let codexEnvironmentShuttingDown = false

function codexEnvUnquoteTomlString(raw) {
  const value = String(raw || '').trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1).replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  return value
}

function parseCodexEnvironmentTomlText(text) {
  if (typeof text !== 'string' || !text.trim()) return null
  if (text.includes('"""') || text.includes("'''")) return null
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  let section = 'root'
  let version = 0
  let versionPresent = false
  let name = ''
  let setupScript = ''
  const actions = []
  let currentAction = null
  let parseError = false

  const stripTomlComment = (rawLine) => {
    let inSingle = false
    let inDouble = false
    let escaped = false
    for (let i = 0; i < rawLine.length; i += 1) {
      const ch = rawLine[i]
      if (escaped) {
        escaped = false
        continue
      }
      if (inDouble && ch === '\\') {
        escaped = true
        continue
      }
      if (!inDouble && ch === '\'') {
        inSingle = !inSingle
        continue
      }
      if (!inSingle && ch === '"') {
        inDouble = !inDouble
        continue
      }
      if (ch === '#' && !inSingle && !inDouble) return rawLine.slice(0, i)
    }
    return rawLine
  }
  const flushAction = () => {
    if (!currentAction) return
    if (currentAction.name && currentAction.command) actions.push({ ...currentAction })
    else parseError = true
    currentAction = null
  }
  for (const rawLine of lines) {
    const line = stripTomlComment(rawLine).trim()
    if (!line) continue
    if (line === '[setup]') { flushAction(); section = 'setup'; continue }
    if (line === '[[actions]]') {
      flushAction()
      section = 'action'
      currentAction = { name: '', icon: 'run', command: '' }
      continue
    }
    if (line.startsWith('[')) { flushAction(); section = 'root'; continue }
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    const rawValue = line.slice(eq + 1).trim()
    const value = codexEnvUnquoteTomlString(rawValue)
    if (section === 'root') {
      if (key === 'version') {
        versionPresent = true
        if (rawValue !== '1') parseError = true
        version = rawValue === '1' ? 1 : NaN
      }
      else if (key === 'name') name = value.slice(0, 120)
    } else if (section === 'setup') {
      if (key === 'script') setupScript = value.slice(0, 4_000)
    } else if (section === 'action' && currentAction) {
      if (key === 'name') currentAction.name = value.slice(0, 80)
      else if (key === 'icon') currentAction.icon = value.slice(0, 40) || 'run'
      else if (key === 'command') currentAction.command = value.slice(0, 4_000)
    }
  }
  flushAction()
  if (!name && !actions.length && !setupScript) return null
  if (parseError) return null
  if (!versionPresent || version !== 1) return null
  return { version: 1, name: name || 'Environment', setupScript, actions }
}

function codexEnvironmentActionIdFromName(name, index) {
  const slug = String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
  return slug || `action-${index + 1}`
}

function tokenizeCodexEnvironmentActionCommandHost(command) {
  if (typeof command !== 'string' || !command.trim() || /[\r\n]/.test(command)) return null
  const result = []
  let current = ''
  let quote = null
  let escaped = false
  for (const ch of command) {
    if (escaped) {
      current += ch
      escaped = false
      continue
    }
    if (quote) {
      if (ch === '\\' && quote === '"') { escaped = true; continue }
      if (ch === quote) { quote = null; continue }
      current += ch
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; continue }
    if (ch === '\\') { escaped = true; continue }
    if (/\s/.test(ch)) {
      if (current) { result.push(current); current = '' }
      continue
    }
    current += ch
  }
  if (quote || escaped) return null
  if (current) result.push(current)
  return result
}

function validateCodexEnvironmentActionCommandHost(command) {
  const argv = tokenizeCodexEnvironmentActionCommandHost(command)
  if (!argv) return null
  if (argv.length === 3 && ['pnpm', 'npm', 'yarn', 'bun'].includes(argv[0]) && argv[1] === 'run' && ['build', 'serve'].includes(argv[2])) {
    return {
      family: 'package-script',
      executable: argv[0],
      task: argv[2],
      argv: [argv[0], 'run', argv[2]],
      risk: argv[2] === 'serve' ? 'long-running' : 'normal'
    }
  }
  if (argv.length === 2 && argv[0] === 'vite' && ['build', 'serve'].includes(argv[1])) {
    return {
      family: 'vite',
      executable: 'vite',
      task: argv[1],
      argv: ['vite', argv[1]],
      risk: argv[1] === 'serve' ? 'long-running' : 'normal'
    }
  }
  if (argv.length === 2 && argv[0] === 'git' && argv[1] === 'push') {
    return { family: 'git-push', executable: 'git', task: 'push', argv: ['git', 'push'], risk: 'external-write' }
  }
  return null
}

function codexEnvironmentIdFromFileName(fileName) {
  const base = String(fileName || '').replace(/\.toml$/i, '').trim().toLowerCase()
  const slug = base.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
  return slug || 'environment'
}

function codexEnvironmentTargetId(input) {
  const projectKey = String(input?.projectKey || '')
  if (!projectKey) return ''
  if (input?.kind === 'project') return projectKey
  const executionCwd = path.resolve(String(input?.executionCwd || ''))
  return `cat_${crypto.createHash('sha256').update(`codex-action-target\0${projectKey}\0${executionCwd}`).digest('hex').slice(0, 32)}`
}

function resolveCodexEnvironmentTargetCwd(targetAlias) {
  const now = Date.now()
  if (typeof targetAlias !== 'string') return { errorCode: 'invalid-request', message: '目标别名无效' }
  if (/^ct_[A-Za-z0-9_-]{16,80}$/.test(targetAlias)) {
    const entry = codexThreadActions.get(targetAlias)
    if (!entry || entry.expiresAt <= now) return { errorCode: 'stale-alias', message: '会话动作已失效，请刷新后重试' }
    try {
      const registry = readCodexNativeRegistry()
      if (!entry.sourceFingerprint || entry.sourceFingerprint !== registry.fingerprint) {
        return { errorCode: 'stale-alias', message: '会话动作已失效，请刷新后重试' }
      }
      const byKey = entry.projectKey && entry.projectKey !== 'chats'
        ? registry.projects.find((item) => item.key === entry.projectKey)
        : null
      const byAssignment = registry.projectById.get(registry.assignments.get(entry.threadId)) || null
      const project = byKey || byAssignment
      const roots = (project?.roots || []).filter((root) => {
        try { return fs.statSync(path.join(root, '.codex', 'environments')).isDirectory() } catch { return false }
      })
      if (roots.length !== 1) {
        return roots.length > 1
          ? { errorCode: 'ambiguous-root', message: '项目存在多个 Environment 根目录，请先消除歧义' }
          : { errorCode: 'cwd-missing', message: '项目未配置 Environment 根目录' }
      }
      const executionCwd = codexNormalizeNativeRoot(entry.cwd)
      if (!executionCwd) return { errorCode: 'cwd-missing', message: '会话缺少精确工作目录，请刷新后重试' }
      try {
        if (!fs.statSync(executionCwd).isDirectory()) return { errorCode: 'cwd-missing', message: '会话工作目录已失效，请刷新后重试' }
      } catch {
        return { errorCode: 'cwd-missing', message: '会话工作目录已失效，请刷新后重试' }
      }
      const target = { configRoot: roots[0], executionCwd, projectKey: project.key, kind: 'task' }
      return { ...target, targetId: codexEnvironmentTargetId(target) }
    } catch {}
    return { errorCode: 'cwd-missing', message: '无法解析会话工作目录' }
  }
  if (/^cp_[A-Za-z0-9_-]{16,80}$/.test(targetAlias)) {
    const entry = codexProjectActions.get(targetAlias)
    if (!entry || entry.expiresAt <= now) return { errorCode: 'stale-alias', message: '项目动作已失效，请刷新后重试' }
    if (entry.kind === 'chats' || entry.projectKey === 'chats') return { errorCode: 'unsupported-target', message: 'Chats 分组没有项目根目录' }
    try {
      const registry = readCodexNativeRegistry()
      if (!entry.sourceFingerprint || entry.sourceFingerprint !== registry.fingerprint) {
        return { errorCode: 'stale-alias', message: '项目动作已失效，请刷新后重试' }
      }
      const project = registry.projectById.get(entry.projectId) || registry.projects.find((item) => item.key === entry.projectKey)
      const roots = (project?.roots || []).filter((root) => {
        try { return fs.statSync(path.join(root, '.codex', 'environments')).isDirectory() } catch { return false }
      })
      if (roots.length === 1) {
        const target = { configRoot: roots[0], executionCwd: roots[0], projectKey: project.key, kind: 'project' }
        return { ...target, targetId: codexEnvironmentTargetId(target) }
      }
      if (roots.length > 1) return { errorCode: 'ambiguous-root', message: '项目存在多个 Environment 根目录，请先消除歧义' }
    } catch {}
    return { errorCode: 'cwd-missing', message: '无法解析项目根目录' }
  }
  return { errorCode: 'invalid-request', message: '目标别名无效' }
}

function rememberCodexEnvironmentCommands(vaultKey, environments) {
  const key = String(vaultKey || '')
  if (!key) return
  const map = new Map()
  for (const environment of environments) {
    const actionMap = new Map()
    for (const action of environment._hostActions || []) actionMap.set(action.id, action)
    map.set(environment.id, actionMap)
  }
  codexEnvironmentCommandVault.set(key, map)
}

function listCodexProjectEnvironments(targetAlias) {
  const resolved = resolveCodexEnvironmentTargetCwd(targetAlias)
  if (resolved.errorCode) {
    return { outcome: 'failed', runtimeRevision: CODEX_ACTION_HOST_RUNTIME_REVISION, errorCode: resolved.errorCode, message: resolved.message, environments: [] }
  }
  const envDir = path.join(resolved.configRoot, '.codex', 'environments')
  let entries = []
  try {
    entries = fs.readdirSync(envDir, { withFileTypes: true })
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
    if (code === 'ENOENT') {
      return { outcome: 'ok', runtimeRevision: CODEX_ACTION_HOST_RUNTIME_REVISION, projectKey: resolved.projectKey, targetId: resolved.targetId, environments: [], message: '未发现 Environment 配置' }
    }
    return { outcome: 'failed', runtimeRevision: CODEX_ACTION_HOST_RUNTIME_REVISION, errorCode: 'unreadable', message: '无法读取 Environment 配置', environments: [] }
  }
  const environments = []
  const seenEnvironmentIds = new Set()
  for (const entry of entries) {
    if (!entry.isFile() || !/\.toml$/i.test(entry.name)) continue
    let text = ''
    try { text = fs.readFileSync(path.join(envDir, entry.name), 'utf8') } catch { continue }
    const parsed = parseCodexEnvironmentTomlText(text)
    if (!parsed) continue
    const environmentFileFingerprint = crypto.createHash('sha256').update(text).digest('hex')
    const id = codexEnvironmentIdFromFileName(entry.name)
    if (seenEnvironmentIds.has(id)) {
      return { outcome: 'failed', runtimeRevision: CODEX_ACTION_HOST_RUNTIME_REVISION, errorCode: 'environment-id-collision', message: 'Environment 标识冲突，请检查文件名', environments: [] }
    }
    seenEnvironmentIds.add(id)
    const seen = new Set()
    const hostActions = []
    const actions = []
    parsed.actions.forEach((action, index) => {
      let actionId = codexEnvironmentActionIdFromName(action.name, index)
      if (seen.has(actionId)) actionId = `${actionId}-${index + 1}`
      seen.add(actionId)
      const validatedCommand = validateCodexEnvironmentActionCommandHost(action.command)
      if (!validatedCommand) return
      const risk = validatedCommand.risk
      const commandFingerprint = crypto.createHash('sha256').update(String(action.command || '')).digest('hex')
      hostActions.push({ id: actionId, name: action.name, icon: action.icon || 'run', validatedCommand, risk, environmentFileFingerprint, commandFingerprint })
      actions.push({
        id: actionId,
        name: String(action.name || '').trim().slice(0, 80) || `Action ${index + 1}`,
        icon: String(action.icon || 'run').trim().slice(0, 40) || 'run',
        risk,
        displayOnly: false,
        slotEligible: true
      })
    })
    environments.push({
      id,
      name: parsed.name || id,
      setupScriptPresent: Boolean(String(parsed.setupScript || '').trim()),
      actions,
      _hostActions: hostActions
    })
  }
  environments.sort((left, right) => left.id.localeCompare(right.id))
  rememberCodexEnvironmentCommands(resolved.targetId, environments)
  return {
    outcome: 'ok',
    runtimeRevision: CODEX_ACTION_HOST_RUNTIME_REVISION,
    projectKey: resolved.projectKey,
    targetId: resolved.targetId,
    environments: environments.map((item) => ({
      id: item.id,
      name: item.name,
      setupScriptPresent: item.setupScriptPresent,
      actions: item.actions
    }))
  }
}

function codexEnvironmentSessionKey(targetId, environmentId, actionId) {
  return `${targetId}\0${environmentId}\0${actionId}`
}

function sanitizeCodexEnvironmentSession(session) {
  if (!session) return null
  return {
    targetAlias: typeof session.targetAlias === 'string' && session.targetAlias ? session.targetAlias : (typeof session.projectKey === 'string' ? session.projectKey : ''),
    targetId: session.targetId,
    projectKey: session.projectKey,
    environmentId: session.environmentId,
    actionId: session.actionId,
    state: session.state,
    startedAt: session.startedAt,
    exitCode: typeof session.exitCode === 'number' ? session.exitCode : undefined,
    message: session.message || ''
  }
}

function listCodexEnvironmentActionSessions() {
  return [...codexEnvironmentActionSessions.values()].map(sanitizeCodexEnvironmentSession).filter(Boolean)
}

function stopCodexEnvironmentActionSession(input) {
  const requestedTargetId = typeof input?.targetId === 'string' ? input.targetId : ''
  const projectKey = typeof input?.projectKey === 'string' ? input.projectKey : ''
  const targetId = requestedTargetId || projectKey
  const environmentId = typeof input?.environmentId === 'string' ? input.environmentId : ''
  const actionId = typeof input?.actionId === 'string' ? input.actionId : ''
  if (!targetId || !environmentId || !actionId) return { outcome: 'failed', errorCode: 'invalid-request', message: '停止请求无效' }
  const key = codexEnvironmentSessionKey(targetId, environmentId, actionId)
  const session = codexEnvironmentActionSessions.get(key)
  if (!session) return { outcome: 'failed', errorCode: 'not-running', message: '没有运行中的 Action 会话' }
  if (projectKey && session.projectKey !== projectKey) return { outcome: 'failed', errorCode: 'target-mismatch', message: 'Action 目标身份不匹配' }
  if (session.state === 'stopping') return { outcome: 'stopping', session: sanitizeCodexEnvironmentSession(session) }
  session.state = 'stopping'
  session.message = '正在停止 Action'
  if (session.run) {
    session.run.status = 'stopping'
    session.run.message = session.message
    persistCodexActionRun(session.run)
    pushCodexActionRunnerSnapshot(session.message)
  }
  signalCodexEnvironmentSession(session)
  return { outcome: 'stopping', session: sanitizeCodexEnvironmentSession(session) }
}

function signalCodexEnvironmentSession(session) {
  try {
    if (process.platform !== 'win32' && typeof session.childPid === 'number') {
      process.kill(-session.childPid, 'SIGTERM')
      return
    }
    if (process.platform === 'win32' && typeof session.childPid === 'number') {
      const systemRoot = typeof process.env.SystemRoot === 'string' && process.env.SystemRoot.trim()
        ? path.win32.resolve(process.env.SystemRoot.trim())
        : 'C:\\Windows'
      const taskkill = /^[A-Za-z]:\\/.test(systemRoot)
        ? path.win32.join(systemRoot, 'System32', 'taskkill.exe')
        : 'C:\\Windows\\System32\\taskkill.exe'
      void run(taskkill, ['/PID', String(session.childPid), '/T']).then((result) => {
        if (!result.ok) {
          try { session.child?.kill?.('SIGTERM') } catch {}
        }
      })
      return
    }
    session.child?.kill?.('SIGTERM')
  } catch {
    try { session.child?.kill?.('SIGTERM') } catch {}
  }
}

function issueCodexEnvironmentConfirmToken(targetId, environmentId, actionId, environmentFileFingerprint, commandFingerprint) {
  const token = `cet_${crypto.randomBytes(12).toString('base64url')}`
  codexEnvironmentConfirmTokens.set(token, {
    targetId,
    environmentId,
    actionId,
    environmentFileFingerprint,
    commandFingerprint,
    expiresAt: Date.now() + CODEX_ENV_ACTION_CONFIRM_TTL_MS
  })
  return token
}

function consumeCodexEnvironmentConfirmToken(token, targetId, environmentId, actionId, environmentFileFingerprint, commandFingerprint) {
  const entry = codexEnvironmentConfirmTokens.get(token)
  codexEnvironmentConfirmTokens.delete(token)
  if (!entry || entry.expiresAt <= Date.now()) return false
  return (
    entry.targetId === targetId &&
    entry.environmentId === environmentId &&
    entry.actionId === actionId &&
    entry.environmentFileFingerprint === environmentFileFingerprint &&
    entry.commandFingerprint === commandFingerprint
  )
}

function shouldDeferCodexActionServerClose() {
  if (codexEnvironmentShuttingDown) return false
  if (codexActionRunnerVisible) return true
  if (codexActionRunnerCatalog?.loading === true) return true
  return [...codexEnvironmentActionSessions.values()].some((session) => session?.state === 'running' || session?.state === 'stopping')
}

function flushCodexActionDeferredServerClose() {
  if (!codexActionDeferredServerClose || shouldDeferCodexActionServerClose()) return false
  codexActionDeferredServerClose = false
  closeCodexServer()
  return true
}

function shutdownCodexEnvironmentActions() {
  codexEnvironmentShuttingDown = true
  const sessions = [...codexEnvironmentActionSessions.values()]
  for (const session of sessions) {
    session.pendingRestart = null
    if (session.run && (session.run.status === 'running' || session.run.status === 'stopping')) {
      finishCodexActionRun(session.run, 'interrupted', undefined, '宿主进程结束，运行已中断')
    }
  }
  codexEnvironmentActionSessions.clear()
  codexEnvironmentCommandVault.clear()
  codexEnvironmentConfirmTokens.clear()
  for (const session of sessions) signalCodexEnvironmentSession(session)
  try { codexActionRunDatabase?.close?.() } catch {}
  codexActionRunDatabase = null
  codexActionRunDatabaseReady = false
}

function codexActionRunnerPreferences() {
  const stored = globalThis.utools?.dbStorage?.getItem?.(CODEX_ACTION_RUNNER_STORAGE_KEY)
  const source = codexRecord(stored)
  const runtimeByProject = {}
  for (const [projectKey, value] of Object.entries(codexRecord(source.runtimeByProject)).slice(0, 100)) {
    const preference = codexRecord(value)
    if (!projectKey || projectKey.length > 160 || preference.mode !== 'manual' || typeof preference.candidateId !== 'string' || !preference.candidateId) continue
    runtimeByProject[projectKey] = { mode: 'manual', candidateId: preference.candidateId.slice(0, 120) }
  }
  return {
    pinned: source.pinned === true,
    view: source.view === 'archived' ? 'archived' : 'records',
    selectedLaneId: typeof source.selectedLaneId === 'string' ? source.selectedLaneId.slice(0, 300) : '',
    bounds: codexRecord(source.bounds),
    runtimeByProject
  }
}

function ensureCodexActionRunnerPreferencesLoaded() {
  if (codexActionRunnerPreferenceLoaded) return
  codexActionRunnerPreference = { ...codexActionRunnerPreference, ...codexActionRunnerPreferences() }
  codexActionRunnerPreferenceLoaded = true
}

function writeCodexActionRunnerPreferences() {
  const payload = { version: 1, ...codexActionRunnerPreference }
  try {
    if (codexActionRunnerAlive() && typeof codexActionRunnerWindow.getBounds === 'function') payload.bounds = codexActionRunnerWindow.getBounds()
    return globalThis.utools?.dbStorage?.setItem?.(CODEX_ACTION_RUNNER_STORAGE_KEY, payload) !== false
  } catch { return false }
}

function codexActionRunnerAlive() {
  if (!codexActionRunnerWindow) return false
  try { return typeof codexActionRunnerWindow.isDestroyed !== 'function' || !codexActionRunnerWindow.isDestroyed() } catch { return false }
}

function codexActionRunDatabasePath() {
  let base = ''
  try { base = globalThis.utools?.getPath?.('userData') || '' } catch {}
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
      if (index < 200 && retainedBytes + bytes <= 100 * 1024 * 1024) {
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
    database.prepare('DELETE FROM action_runs WHERE started_at < ?').run(Date.now() - 30 * 24 * 60 * 60_000)
    database.prepare('DELETE FROM action_runs WHERE run_id IN (SELECT run_id FROM action_runs ORDER BY started_at DESC LIMIT -1 OFFSET 200)').run()
    enforceCodexActionRunRetention(database)
    const rows = database.prepare('SELECT * FROM action_runs ORDER BY started_at DESC LIMIT 200').all()
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

function sanitizeCodexActionLogText(text, privatePaths = []) {
  let value = String(text || '')
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]|\u001B[@-_]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  const paths = [...new Set([os.homedir(), ...privatePaths].filter(Boolean))].sort((left, right) => right.length - left.length)
  for (const privatePath of paths) value = value.split(privatePath).join('<private-path>')
  return value
    .replace(/(authorization\s*[:=]\s*)(?:bearer\s+)?[^\s'"`]+/gi, '$1<redacted>')
    .replace(/((?:token|password|passwd|secret|api[_-]?key)\s*[:=]\s*)[^\s'"`]+/gi, '$1<redacted>')
    .replace(/(https?:\/\/)([^\s/@:]+):([^\s/@]+)@/gi, '$1<redacted>@')
    .slice(0, 32 * 1024)
}

function codexActionFlushLog(run) {
  if (!run) return
  if (run._logFlushTimer) {
    clearTimeout(run._logFlushTimer)
    run._logFlushTimer = null
  }
  const queue = Array.isArray(run._logQueue) ? run._logQueue.splice(0) : []
  run._logQueueBytes = 0
  if (!queue.length) return
  let next = run.logText || ''
  const deltas = []
  for (const item of queue) {
    next += item.text
    run.cursor = (run.cursor || 0) + 1
    deltas.push({ version: 1, runId: run.runId, cursor: run.cursor, stream: item.stream, text: item.text, receivedAt: item.receivedAt })
  }
  run.logText = next.length > 2 * 1024 * 1024 ? next.slice(next.length - 2 * 1024 * 1024) : next
  run.logBytes = Buffer.byteLength(run.logText, 'utf8')
  run.logLines = (run.logText.match(/\n/g) || []).length + (run.logText && !run.logText.endsWith('\n') ? 1 : 0)
  persistCodexActionRun(run)
  if (!codexActionRunnerAlive()) return
  for (const delta of deltas) {
    try { codexActionRunnerWindow.webContents.send(CODEX_ACTION_RUNNER_CHANNELS.log, delta) } catch {}
  }
}

function codexActionQueueSafeLog(run, stream, text) {
  if (!text) return
  run._logQueue ||= []
  const previous = run._logQueue[run._logQueue.length - 1]
  if (previous && previous.stream === stream && Buffer.byteLength(previous.text, 'utf8') + Buffer.byteLength(text, 'utf8') <= CODEX_ACTION_LOG_FLUSH_BYTES) {
    previous.text += text
    previous.receivedAt = Date.now()
  } else {
    run._logQueue.push({ stream, text, receivedAt: Date.now() })
  }
  run._logQueueBytes = (run._logQueueBytes || 0) + Buffer.byteLength(text, 'utf8')
  if (run._logQueueBytes >= CODEX_ACTION_LOG_FLUSH_BYTES) codexActionFlushLog(run)
  else if (!run._logFlushTimer) run._logFlushTimer = setTimeout(() => codexActionFlushLog(run), CODEX_ACTION_LOG_FLUSH_MS)
}

function codexActionLogStream(run, stream, privatePaths) {
  run._logStreams ||= new Map()
  if (run._logStreams.has(stream)) return run._logStreams.get(stream)
  let decoder = null
  try {
    const { StringDecoder } = require('node:string_decoder')
    decoder = new StringDecoder('utf8')
  } catch {
    decoder = { write: (chunk) => Buffer.from(chunk).toString('utf8'), end: () => '' }
  }
  const state = { decoder, pending: '', dropUntilNewline: false, privatePaths: [...new Set(privatePaths || [])] }
  run._logStreams.set(stream, state)
  return state
}

function codexActionConsumeDecodedLog(run, stream, state, decoded, final = false) {
  if (decoded) state.pending += decoded
  if (state.dropUntilNewline) {
    const newline = state.pending.indexOf('\n')
    if (newline < 0) {
      state.pending = ''
      return
    }
    state.pending = state.pending.slice(newline + 1)
    state.dropUntilNewline = false
  }
  for (;;) {
    const newline = state.pending.indexOf('\n')
    if (newline < 0) break
    const complete = state.pending.slice(0, newline + 1)
    state.pending = state.pending.slice(newline + 1)
    codexActionQueueSafeLog(run, stream, sanitizeCodexActionLogText(complete, state.privatePaths))
  }
  if (state.pending.length > 64 * 1024) {
    codexActionQueueSafeLog(run, 'system', '[单行输出超过安全上限，已截断]\n')
    state.pending = ''
    state.dropUntilNewline = true
  }
  if (final && state.pending) {
    codexActionQueueSafeLog(run, stream, sanitizeCodexActionLogText(state.pending, state.privatePaths))
    state.pending = ''
  }
}

function appendCodexActionRunLog(run, stream, chunk, privatePaths) {
  if (!run || !['stdout', 'stderr', 'system'].includes(stream)) return
  const state = codexActionLogStream(run, stream, privatePaths)
  codexActionConsumeDecodedLog(run, stream, state, state.decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk || ''))))
}

function finalizeCodexActionRunLogs(run) {
  if (!run?._logStreams) {
    codexActionFlushLog(run)
    return
  }
  for (const [stream, state] of run._logStreams) codexActionConsumeDecodedLog(run, stream, state, state.decoder.end(), true)
  codexActionFlushLog(run)
  run._logStreams.clear()
}

function createCodexActionRun(input, resolved, hostAction, launch = null) {
  ensureCodexActionRunDatabase()
  const run = {
    version: 1,
    runId: `car_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('base64url')}`,
    laneId: `${encodeURIComponent(resolved.targetId)}:${encodeURIComponent(input.environmentId)}:${encodeURIComponent(input.actionId)}`,
    projectKey: resolved.projectKey,
    projectName: String(input.projectName || resolved.projectKey).slice(0, 120),
    environmentId: input.environmentId,
    environmentName: String(input.environmentName || input.environmentId).slice(0, 120),
    actionId: input.actionId,
    actionName: String(input.actionName || hostAction.name || input.actionId).slice(0, 120),
    risk: hostAction.risk,
    status: 'running',
    startedAt: Date.now(),
    logText: '',
    logBytes: 0,
    logLines: 0,
    message: '正在执行',
    cursor: 0,
    runtimeMode: launch?.runtime?.mode,
    runtimeSource: launch?.runtime?.source,
    runtimeVersion: launch?.runtime?.version,
    runtimeLabel: launch?.runtime?.label
  }
  codexActionRunMemory.unshift(run)
  codexActionRunMemory = codexActionRunMemory.slice(0, 200)
  persistCodexActionRun(run)
  return run
}

function recordCodexActionRestartFailure(input, result) {
  const now = Date.now()
  const run = {
    version: 1,
    runId: `car_${now.toString(36)}_${crypto.randomBytes(6).toString('base64url')}`,
    laneId: `${encodeURIComponent(String(input.targetId || input.projectKey || ''))}:${encodeURIComponent(String(input.environmentId || ''))}:${encodeURIComponent(String(input.actionId || ''))}`,
    projectKey: String(input.projectKey || '').slice(0, 160),
    projectName: String(input.projectName || input.projectKey || '项目').slice(0, 120),
    environmentId: String(input.environmentId || '').slice(0, 64),
    environmentName: String(input.environmentName || input.environmentId || 'Environment').slice(0, 120),
    actionId: String(input.actionId || '').slice(0, 80),
    actionName: String(input.actionName || input.actionId || 'Serve').slice(0, 120),
    risk: 'long-running',
    status: 'failed',
    startedAt: now,
    endedAt: now,
    logText: '',
    logBytes: 0,
    logLines: 0,
    message: String(result?.message || 'Serve 重新执行前校验失败').slice(0, 240),
    cursor: 0
  }
  codexActionRunMemory.unshift(run)
  codexActionRunMemory = codexActionRunMemory.slice(0, 200)
  persistCodexActionRun(run)
  pushCodexActionRunnerSnapshot(run.message)
}

async function restartCodexEnvironmentActionAfterExit(input) {
  if (codexEnvironmentShuttingDown) return
  const previousRunIds = new Set(codexActionRunMemory.map((run) => run.runId))
  const result = await runCodexProjectEnvironmentAction(input)
  const created = codexActionRunMemory.some((run) => !previousRunIds.has(run.runId))
  if (!created && !['ok', 'started', 'running', 'stopping'].includes(result?.outcome)) recordCodexActionRestartFailure(input, result)
}

function finishCodexActionRun(run, status, exitCode, message) {
  if (!run) return
  finalizeCodexActionRunLogs(run)
  run.status = status
  run.endedAt = Date.now()
  if (typeof exitCode === 'number') run.exitCode = exitCode
  run.message = message
  persistCodexActionRun(run)
  if (codexActionRunDatabase) enforceCodexActionRunRetention(codexActionRunDatabase)
  pushCodexActionRunnerSnapshot(message)
}

function codexActionUsableFile(candidate) {
  try {
    if (!path.isAbsolute(candidate) || !fs.statSync(candidate).isFile()) return ''
    return fs.realpathSync(candidate)
  } catch { return '' }
}

function codexActionProbeNodeVersion(candidate) {
  const command = codexActionUsableFile(candidate)
  if (!command) return ''
  try {
    const { execFileSync } = require('node:child_process')
    if (typeof execFileSync !== 'function') return ''
    const output = String(execFileSync(command, ['--version'], {
      encoding: 'utf8',
      timeout: 1_500,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore']
    }) || '').trim()
    return /^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(output) ? output : ''
  } catch { return '' }
}

function codexActionSemverParts(version) {
  const match = String(version || '').match(/^v?(\d+)\.(\d+)\.(\d+)/)
  return match ? match.slice(1, 4).map(Number) : [0, 0, 0]
}

function codexActionCompareNodeCandidates(left, right) {
  const leftParts = codexActionSemverParts(left.version)
  const rightParts = codexActionSemverParts(right.version)
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return rightParts[index] - leftParts[index]
  }
  return left.id.localeCompare(right.id)
}

function codexActionNvmRoots() {
  if (process.platform !== 'darwin') return []
  const home = os.homedir()
  const xdg = typeof process.env.XDG_CONFIG_HOME === 'string' && path.isAbsolute(process.env.XDG_CONFIG_HOME)
    ? path.join(process.env.XDG_CONFIG_HOME, 'nvm')
    : ''
  const candidates = [
    typeof process.env.NVM_DIR === 'string' && path.isAbsolute(process.env.NVM_DIR) ? process.env.NVM_DIR : '',
    xdg,
    path.join(home, '.nvm')
  ]
  const roots = []
  const seen = new Set()
  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      const real = fs.realpathSync(candidate)
      if (!fs.statSync(real).isDirectory() || seen.has(real)) continue
      seen.add(real)
      roots.push(real)
    } catch {}
  }
  return roots
}

function codexActionNodeRuntimeCandidates(force = false) {
  const now = Date.now()
  if (!force && codexNodeRuntimeDiscoveryCache.expiresAt > now) return codexNodeRuntimeDiscoveryCache.candidates
  const candidates = []
  const seenPaths = new Set()
  for (const root of codexActionNvmRoots()) {
    const versionRoot = path.join(root, 'versions', 'node')
    let entries = []
    try { entries = fs.readdirSync(versionRoot, { withFileTypes: true }) } catch {}
    for (const entry of entries) {
      if (!entry?.isDirectory?.() || !/^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(entry.name)) continue
      const requestedPath = path.join(versionRoot, entry.name, 'bin', process.platform === 'win32' ? 'node.exe' : 'node')
      const nodePath = codexActionUsableFile(requestedPath)
      if (!nodePath || seenPaths.has(nodePath)) continue
      const version = codexActionProbeNodeVersion(nodePath)
      if (!version) continue
      if (candidates.some((candidate) => candidate.id === `nvm:${version}`)) continue
      seenPaths.add(nodePath)
      candidates.push({
        id: `nvm:${version}`,
        label: `Node ${version} · NVM`,
        version,
        source: 'nvm',
        nodePath,
        binDir: path.dirname(requestedPath),
        nvmRoot: root
      })
    }
  }
  candidates.sort(codexActionCompareNodeCandidates)
  const systemPaths = process.platform === 'darwin'
    ? [
        process.arch === 'arm64' ? '/opt/homebrew/bin/node' : '/usr/local/bin/node',
        process.arch === 'arm64' ? '/usr/local/bin/node' : '/opt/homebrew/bin/node',
        '/usr/bin/node',
        path.basename(process.execPath || '') === 'node' ? process.execPath : ''
      ]
    : process.platform === 'win32'
      ? [path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe')]
      : ['/usr/local/bin/node', '/usr/bin/node', path.basename(process.execPath || '') === 'node' ? process.execPath : '']
  for (const requestedPath of systemPaths) {
    if (!requestedPath) continue
    const nodePath = codexActionUsableFile(requestedPath)
    if (!nodePath || seenPaths.has(nodePath)) continue
    const version = codexActionProbeNodeVersion(nodePath)
    if (!version) continue
    seenPaths.add(nodePath)
    const id = `system:${crypto.createHash('sha256').update(nodePath).digest('hex').slice(0, 12)}`
    candidates.push({ id, label: `Node ${version} · 系统`, version, source: 'system', nodePath, binDir: path.dirname(requestedPath), nvmRoot: '' })
  }
  codexNodeRuntimeDiscoveryCache = { expiresAt: now + 5_000, candidates }
  return candidates
}

function codexActionReadVersionToken(filePath, nvmrc = false) {
  let text = ''
  try {
    if (!fs.statSync(filePath).isFile()) return { present: true, token: '', invalid: true }
  } catch (error) {
    return error && typeof error === 'object' && error.code === 'ENOENT'
      ? { present: false, token: '' }
      : { present: true, token: '', invalid: true }
  }
  try { text = fs.readFileSync(filePath, 'utf8') } catch { return { present: true, token: '', invalid: true } }
  if (text.length > 4_096) return { present: true, token: '', invalid: true }
  const values = []
  for (const sourceLine of text.split(/\r?\n/)) {
    const line = (nvmrc ? sourceLine.replace(/#.*/, '') : sourceLine).trim()
    if (!line || nvmrc && /^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(line)) continue
    values.push(line)
  }
  const token = values.length === 1 ? values[0] : ''
  const invalid = !token || /\s|[\\`;$|&<>]/.test(token) || token.startsWith('/') || token.includes('..') || token.length > 80
  return { present: true, token: invalid ? '' : token, invalid }
}

function codexActionProjectNodeHint(projectRoot) {
  const nvmrc = codexActionReadVersionToken(path.join(projectRoot, '.nvmrc'), true)
  if (nvmrc.present) return { ...nvmrc, source: '.nvmrc' }
  const nodeVersion = codexActionReadVersionToken(path.join(projectRoot, '.node-version'), false)
  return nodeVersion.present ? { ...nodeVersion, source: '.node-version' } : { present: false, token: '', source: '' }
}

function codexActionReadNvmAlias(root, token) {
  const normalized = String(token || '').replace(/^v/, '')
  if (!normalized || !/^[A-Za-z0-9*._/-]+$/.test(normalized) || normalized.includes('..')) return ''
  const aliasRoot = path.join(root, 'alias')
  const aliasPath = path.resolve(aliasRoot, ...normalized.split('/'))
  const relative = path.relative(aliasRoot, aliasPath)
  if (relative.startsWith('..') || path.isAbsolute(relative)) return ''
  const value = codexActionReadVersionToken(aliasPath, true)
  return value.present && !value.invalid ? value.token : ''
}

function codexActionResolveNodeToken(token, candidates, roots, depth = 0) {
  if (depth > 8) return null
  const normalized = String(token || '').trim().toLowerCase().replace(/^v(?=\d)/, '')
  const nvmCandidates = candidates.filter((candidate) => candidate.source === 'nvm')
  if (!normalized) return null
  if (normalized === 'node' || normalized === 'stable' || normalized === 'current') return nvmCandidates[0] || null
  if (normalized === 'lts/*') {
    for (const root of roots) {
      const value = codexActionReadNvmAlias(root, 'lts/*')
      if (value) return codexActionResolveNodeToken(value, candidates, roots, depth + 1)
    }
    return null
  }
  if (/^\d+(?:\.\d+){0,2}$/.test(normalized)) {
    const prefix = normalized.split('.')
    return nvmCandidates.find((candidate) => {
      const actual = candidate.version.replace(/^v/, '').split(/[.-]/).slice(0, prefix.length)
      return actual.join('.') === prefix.join('.')
    }) || null
  }
  for (const root of roots) {
    const alias = codexActionReadNvmAlias(root, normalized)
    if (!alias || alias.toLowerCase() === normalized) continue
    const candidate = codexActionResolveNodeToken(alias, candidates, roots, depth + 1)
    if (candidate) return candidate
  }
  return null
}

function codexActionRuntimePreference(projectKey) {
  ensureCodexActionRunnerPreferencesLoaded()
  const source = codexRecord(codexActionRunnerPreference.runtimeByProject)[projectKey]
  const preference = codexRecord(source)
  return preference.mode === 'manual' && typeof preference.candidateId === 'string' && preference.candidateId
    ? { mode: 'manual', candidateId: preference.candidateId.slice(0, 120) }
    : { mode: 'auto', candidateId: '' }
}

function codexActionRuntimeProjection(projectKey, projectRoot, force = false) {
  const candidates = codexActionNodeRuntimeCandidates(force)
  const roots = codexActionNvmRoots()
  const preference = codexActionRuntimePreference(projectKey)
  const publicCandidates = candidates.map((candidate) => ({ id: candidate.id, label: candidate.label, version: candidate.version, source: candidate.source }))
  let resolved = null
  let state = 'ready'
  let message = ''
  let hintSource = ''
  if (preference.mode === 'manual') {
    resolved = candidates.find((candidate) => candidate.id === preference.candidateId) || null
    if (!resolved) {
      state = 'unavailable'
      message = '手动选择的 Node 已不可用，请重新选择'
    }
  } else {
    const hint = codexActionProjectNodeHint(projectRoot)
    if (hint.present) {
      hintSource = hint.source
      resolved = hint.invalid ? null : codexActionResolveNodeToken(hint.token, candidates, roots)
      if (!resolved) {
        state = 'invalid-project-version'
        message = `${hint.source} 指定的 Node 未安装或格式无效`
      }
    } else {
      for (const root of roots) {
        const defaultAlias = codexActionReadNvmAlias(root, 'default')
        if (!defaultAlias) continue
        resolved = codexActionResolveNodeToken(defaultAlias, candidates, roots)
        if (resolved) break
      }
      resolved ||= candidates.find((candidate) => candidate.source === 'nvm') || candidates.find((candidate) => candidate.source === 'system') || null
      if (!resolved) {
        state = 'unavailable'
        message = '未检测到可用的 NVM 或系统 Node'
      }
    }
  }
  return {
    preference,
    resolved,
    public: {
      mode: preference.mode,
      state,
      selectedCandidateId: preference.candidateId || undefined,
      resolvedCandidateId: resolved?.id,
      label: resolved?.label,
      version: resolved?.version,
      source: resolved?.source,
      hintSource: hintSource || undefined,
      candidates: publicCandidates,
      message: message || undefined
    }
  }
}

function codexActionPackageManagerEntry(runtime, name) {
  if (!runtime) return ''
  const prefix = path.resolve(runtime.binDir, '..')
  const direct = codexActionUsableFile(path.join(runtime.binDir, process.platform === 'win32' ? `${name}.cmd` : name))
  if (direct && /\.(?:c?js|mjs)$/i.test(direct)) return direct
  const byName = {
    npm: [path.join(prefix, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'), path.join(prefix, 'node_modules', 'npm', 'bin', 'npm-cli.js')],
    pnpm: [path.join(prefix, 'lib', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'), path.join(prefix, 'lib', 'node_modules', 'pnpm', 'bin', 'pnpm.js')],
    yarn: [path.join(prefix, 'lib', 'node_modules', 'yarn', 'bin', 'yarn.js')]
  }
  if (runtime.source === 'system') {
    byName.pnpm.push('/opt/homebrew/lib/node_modules/pnpm/bin/pnpm.cjs', '/usr/local/lib/node_modules/pnpm/bin/pnpm.cjs')
    byName.yarn.push('/opt/homebrew/lib/node_modules/yarn/bin/yarn.js', '/usr/local/lib/node_modules/yarn/bin/yarn.js')
  }
  return (byName[name] || []).map(codexActionUsableFile).find(Boolean) || ''
}

function resolveCodexActionLaunchPlan(validatedCommand, projectRoot, projectKey = '') {
  const verified = validateCodexEnvironmentActionCommandHost(Array.isArray(validatedCommand?.argv) ? validatedCommand.argv.join(' ') : '')
  if (!verified || JSON.stringify(verified) !== JSON.stringify(validatedCommand)) return null
  const name = verified.executable
  const args = verified.argv.slice(1)
  if (name === 'vite' || name === 'npm' || name === 'pnpm' || name === 'yarn') {
    const runtimeResult = codexActionRuntimeProjection(projectKey, projectRoot, true)
    if (!runtimeResult.resolved) return { errorCode: 'node-runtime-unavailable', message: runtimeResult.public.message || 'Node 运行时不可用', runtime: runtimeResult.public }
    const script = name === 'vite'
      ? codexActionUsableFile(path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js'))
      : codexActionPackageManagerEntry(runtimeResult.resolved, name)
    if (!script) return { errorCode: 'package-manager-unavailable', message: `所选 Node 未提供 ${name} 入口`, runtime: runtimeResult.public }
    return {
      command: runtimeResult.resolved.nodePath,
      args: [script, ...args],
      binDir: runtimeResult.resolved.binDir,
      runtime: runtimeResult.public
    }
  }
  const home = os.homedir()
  const candidatesByName = {
    git: process.platform === 'win32'
      ? [path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'cmd', 'git.exe')]
      : ['/usr/bin/git', '/opt/homebrew/bin/git', '/usr/local/bin/git'],
    pnpm: process.platform === 'win32'
      ? [path.join(process.env.LOCALAPPDATA || '', 'pnpm', 'pnpm.exe')]
      : [path.join(home, 'Library', 'pnpm', 'pnpm'), path.join(home, '.local', 'share', 'pnpm', 'pnpm'), '/opt/homebrew/bin/pnpm', '/usr/local/bin/pnpm'],
    yarn: process.platform === 'win32' ? [] : ['/opt/homebrew/bin/yarn', '/usr/local/bin/yarn'],
    bun: process.platform === 'win32' ? [path.join(home, '.bun', 'bin', 'bun.exe')] : [path.join(home, '.bun', 'bin', 'bun'), '/opt/homebrew/bin/bun']
  }
  const command = (candidatesByName[name] || []).map(codexActionUsableFile).find(Boolean)
  return command ? { command, args } : null
}

async function runCodexProjectEnvironmentAction(input) {
  const targetAlias = typeof input?.targetAlias === 'string' ? input.targetAlias : ''
  const requestedTargetId = typeof input?.targetId === 'string' ? input.targetId : ''
  const compatibilityProjectKey = typeof input?.projectKey === 'string' ? input.projectKey : ''
  const environmentId = typeof input?.environmentId === 'string' ? input.environmentId.slice(0, 64) : ''
  const actionId = typeof input?.actionId === 'string' ? input.actionId.slice(0, 80) : ''
  const confirmToken = typeof input?.confirmToken === 'string' ? input.confirmToken : ''
  const stopIfRunning = input?.stopIfRunning === true
  const restartIfRunning = input?.restartIfRunning === true
  if (!targetAlias || !environmentId || !actionId) {
    return { outcome: 'failed', errorCode: 'invalid-request', message: 'Action 请求无效' }
  }
  if (actionId === 'setup') {
    return { outcome: 'rejected', errorCode: 'display-only', message: 'Setup 仅展示，不会由 EyPc 执行' }
  }
  const resolved = resolveCodexEnvironmentTargetCwd(targetAlias)
  if (resolved.errorCode) {
    return { outcome: 'failed', errorCode: resolved.errorCode, message: resolved.message }
  }
  if (requestedTargetId && requestedTargetId !== resolved.targetId) {
    return { outcome: 'failed', errorCode: 'target-mismatch', message: 'Action 目标身份不匹配' }
  }
  if (!requestedTargetId && (resolved.kind !== 'project' || compatibilityProjectKey !== resolved.projectKey)) {
    return { outcome: 'failed', errorCode: 'runtime-revision-required', message: 'Action Host 已更新，请重载插件后再试' }
  }
  const latestList = listCodexProjectEnvironments(targetAlias)
  if (latestList.outcome !== 'ok') return latestList
  if (latestList.runtimeRevision !== CODEX_ACTION_HOST_RUNTIME_REVISION || latestList.targetId !== resolved.targetId) {
    return { outcome: 'failed', errorCode: 'target-mismatch', message: 'Action 目标刷新结果不一致' }
  }
  const vault = codexEnvironmentCommandVault.get(resolved.targetId)
  const hostAction = vault?.get(environmentId)?.get(actionId)
  if (!hostAction) {
    return { outcome: 'failed', errorCode: 'action-missing', message: '未找到对应 Action，请刷新后重试' }
  }
  if (hostAction.risk === 'display-only') {
    return { outcome: 'rejected', errorCode: 'display-only', message: '该 Action 仅展示，不会执行' }
  }
  if (hostAction.risk !== 'normal' && hostAction.risk !== 'external-write' && hostAction.risk !== 'long-running') {
    return { outcome: 'rejected', errorCode: 'action-not-allowed', message: '该 Action 不在允许列表中' }
  }
  const environmentFileFingerprint = typeof hostAction.environmentFileFingerprint === 'string' ? hostAction.environmentFileFingerprint : ''
  const commandFingerprint = typeof hostAction.commandFingerprint === 'string' ? hostAction.commandFingerprint : ''
  const sessionKey = codexEnvironmentSessionKey(resolved.targetId, environmentId, actionId)
  const existing = codexEnvironmentActionSessions.get(sessionKey)
  if (existing?.state === 'running' && hostAction.risk !== 'long-running') {
    return { outcome: 'running', session: sanitizeCodexEnvironmentSession(existing), message: '该 Action 正在运行，已定位到当前记录' }
  }
  if (existing?.state === 'stopping' && hostAction.risk !== 'long-running') {
    return { outcome: 'stopping', session: sanitizeCodexEnvironmentSession(existing), message: '该 Action 正在停止' }
  }
  if (hostAction.risk === 'long-running') {
    if (existing?.state === 'running') {
      const existingEnvironmentFileFingerprint = typeof existing.environmentFileFingerprint === 'string' ? existing.environmentFileFingerprint : ''
      const existingCommandFingerprint = typeof existing.commandFingerprint === 'string' ? existing.commandFingerprint : ''
      if (restartIfRunning) {
        existing.pendingRestart = { ...input, confirmToken: undefined, restartIfRunning: false }
        return stopCodexEnvironmentActionSession({ targetId: resolved.targetId, projectKey: resolved.projectKey, environmentId, actionId })
      }
      if ((existingEnvironmentFileFingerprint && existingCommandFingerprint) && (existingEnvironmentFileFingerprint !== environmentFileFingerprint || existingCommandFingerprint !== commandFingerprint)) {
        return {
          outcome: 'rejected',
          errorCode: 'session-fingerprint-mismatch',
          message: 'Serve 运行的命令/环境指纹与当前 Action 不一致，请先停止该会话后重试'
        }
      }
      if (stopIfRunning) return stopCodexEnvironmentActionSession({ targetId: resolved.targetId, projectKey: resolved.projectKey, environmentId, actionId })
      return { outcome: 'running', session: sanitizeCodexEnvironmentSession(existing), message: 'Serve 仍在运行；再次确认可停止' }
    }
    if (existing?.state === 'stopping') {
      return {
        outcome: 'stopping',
        session: sanitizeCodexEnvironmentSession(existing),
        message: 'Serve 正在停止；请稍后重试'
      }
    }
  }
  if (hostAction.risk === 'external-write') {
    if (!confirmToken || !consumeCodexEnvironmentConfirmToken(confirmToken, resolved.targetId, environmentId, actionId, environmentFileFingerprint, commandFingerprint)) {
      const token = issueCodexEnvironmentConfirmToken(resolved.targetId, environmentId, actionId, environmentFileFingerprint, commandFingerprint)
      return {
        outcome: 'confirm-required',
        errorCode: 'confirm-required',
        message: 'Git Push 会写入远程仓库，请再次确认',
        confirmToken: token,
        risk: 'external-write'
      }
    }
  }
  const launch = resolveCodexActionLaunchPlan(hostAction.validatedCommand, resolved.executionCwd, resolved.projectKey)
  if (!launch || launch.errorCode) return {
    outcome: 'rejected',
    errorCode: launch?.errorCode || 'executable-unavailable',
    message: launch?.message || '未找到受信任的绝对可执行入口'
  }
  const spawnEnvironment = {
    ...process.env,
    PATH: [
      launch.binDir,
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      '/usr/sbin',
      '/sbin'
    ].filter(Boolean).join(path.delimiter)
  }
  if (hostAction.risk === 'long-running') {
    const run = createCodexActionRun({ ...input, environmentId, actionId }, resolved, hostAction, launch)
    let child
    try {
      child = spawn(launch.command, launch.args, {
        cwd: resolved.executionCwd,
        env: spawnEnvironment,
        detached: process.platform !== 'win32',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false
      })
    } catch {
      finishCodexActionRun(run, 'failed', undefined, '无法启动 Serve')
      return { outcome: 'failed', errorCode: 'spawn-failed', message: '无法启动 Serve' }
    }
    const session = {
      targetAlias,
      targetId: resolved.targetId,
      projectKey: resolved.projectKey,
      environmentId,
      actionId,
      environmentFileFingerprint,
      commandFingerprint,
      state: 'running',
      startedAt: Date.now(),
      message: 'Serve 已启动',
      run,
      child,
      childPid: typeof child?.pid === 'number' ? child.pid : undefined,
    }
    codexEnvironmentActionSessions.set(sessionKey, session)
    pushCodexActionRunnerSnapshot(session.message)
    child.stdout?.on?.('data', (chunk) => appendCodexActionRunLog(run, 'stdout', chunk, [resolved.executionCwd]))
    child.stderr?.on?.('data', (chunk) => appendCodexActionRunLog(run, 'stderr', chunk, [resolved.executionCwd]))
    child.on?.('exit', (code) => {
      const current = codexEnvironmentActionSessions.get(sessionKey)
      if (!current || current.child !== child) return
      const wasStopping = current.state === 'stopping'
      const pendingRestart = current.pendingRestart
      current.pendingRestart = null
      current.state = 'idle'
      current.exitCode = typeof code === 'number' ? code : 0
      current.message = code === 0 ? 'Serve 已结束' : `Serve 已退出（${code}）`
      current.child = null
      finishCodexActionRun(run, wasStopping ? 'stopped' : (code === 0 ? 'completed' : 'failed'), typeof code === 'number' ? code : undefined, current.message)
      flushCodexActionDeferredServerClose()
      if (pendingRestart && !codexEnvironmentShuttingDown) queueMicrotask(() => { void restartCodexEnvironmentActionAfterExit(pendingRestart) })
    })
    child.on?.('error', () => {
      const current = codexEnvironmentActionSessions.get(sessionKey)
      if (!current || current.child !== child) return
      current.state = 'idle'
      current.exitCode = undefined
      current.message = 'Serve 启动失败'
      current.child = null
      finishCodexActionRun(run, 'failed', undefined, current.message)
      flushCodexActionDeferredServerClose()
    })
    return { outcome: 'started', session: sanitizeCodexEnvironmentSession(session) }
  }
  const nonLongTimeoutMs = 10 * 60_000
  const result = await new Promise((resolvePromise) => {
    let done = false
    let timedOut = false
    let child
    const run = createCodexActionRun({ ...input, environmentId, actionId }, resolved, hostAction, launch)
    try {
      child = spawn(launch.command, launch.args, {
        cwd: resolved.executionCwd,
        env: spawnEnvironment,
        detached: process.platform !== 'win32',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false
      })
    } catch {
      finishCodexActionRun(run, 'failed', undefined, '命令启动失败')
      resolvePromise({ outcome: 'failed', errorCode: 'spawn-failed', exitCode: undefined, message: '命令启动失败' })
      return
    }
    const session = {
      targetAlias,
      targetId: resolved.targetId,
      projectKey: resolved.projectKey,
      environmentId,
      actionId,
      environmentFileFingerprint,
      commandFingerprint,
      state: 'running',
      startedAt: run.startedAt,
      message: '正在执行',
      run,
      child,
      childPid: typeof child?.pid === 'number' ? child.pid : undefined
    }
    codexEnvironmentActionSessions.set(sessionKey, session)
    pushCodexActionRunnerSnapshot(session.message)
    child.stdout?.on?.('data', (chunk) => appendCodexActionRunLog(run, 'stdout', chunk, [resolved.executionCwd]))
    child.stderr?.on?.('data', (chunk) => appendCodexActionRunLog(run, 'stderr', chunk, [resolved.executionCwd]))
    const timeoutId = setTimeout(() => {
      if (done) return
      timedOut = true
      session.state = 'stopping'
      session.message = '执行超时，正在停止'
      run.status = 'stopping'
      run.message = session.message
      persistCodexActionRun(run)
      pushCodexActionRunnerSnapshot(session.message)
      signalCodexEnvironmentSession(session)
    }, nonLongTimeoutMs)
    child.on?.('exit', (code) => {
      if (done) return
      done = true
      clearTimeout(timeoutId)
      const exitCode = typeof code === 'number' ? code : 0
      const explicitlyStopped = session.state === 'stopping' && !timedOut
      const status = timedOut ? 'failed' : explicitlyStopped ? 'stopped' : exitCode === 0 ? 'completed' : 'failed'
      const message = timedOut ? '命令执行超时并已停止' : explicitlyStopped ? '已停止' : exitCode === 0 ? '已完成' : `命令退出（${exitCode}）`
      session.state = 'idle'
      session.child = null
      session.exitCode = exitCode
      session.message = message
      finishCodexActionRun(run, status, exitCode, message)
      flushCodexActionDeferredServerClose()
      resolvePromise({
        outcome: status === 'completed' ? 'ok' : 'failed',
        errorCode: timedOut ? 'command-timeout' : status === 'stopped' ? 'stopped' : exitCode === 0 ? undefined : 'command-exit',
        exitCode,
        message
      })
    })
    child.on?.('error', () => {
      if (done) return
      done = true
      clearTimeout(timeoutId)
      session.state = 'idle'
      session.child = null
      finishCodexActionRun(run, 'failed', undefined, '命令启动失败')
      flushCodexActionDeferredServerClose()
      resolvePromise({ outcome: 'failed', errorCode: 'spawn-error', exitCode: undefined, message: '命令启动失败' })
    })
  })
  return result
}

function codexActionRunnerCatalogProjection() {
  return {
    ...codexActionRunnerCatalog,
    capabilities: ['node-runtime-selection-v1', 'log-cursor-v1', 'explicit-window-geometry-v1'],
    projects: (codexActionRunnerCatalog.projects || []).map((project) => {
      const { targetAlias, targetId, ...publicProject } = project
      const resolved = typeof targetAlias === 'string' && targetAlias ? resolveCodexEnvironmentTargetCwd(targetAlias) : null
      const nodeRuntime = resolved && !resolved.errorCode
        ? codexActionRuntimeProjection(project.key, resolved.executionCwd).public
        : { mode: codexActionRuntimePreference(project.key).mode, state: 'unavailable', candidates: codexActionNodeRuntimeCandidates().map((candidate) => ({ id: candidate.id, label: candidate.label, version: candidate.version, source: candidate.source })), message: '项目工作目录不可用' }
      return {
        ...publicProject,
        nodeRuntime,
        environments: (project.environments || []).map((environment) => ({
          ...environment,
          actions: (environment.actions || []).map((action) => {
            const session = codexEnvironmentActionSessions.get(codexEnvironmentSessionKey(targetId || project.key, environment.id, action.id))
            const state = session?.state === 'running' || session?.state === 'stopping' ? session.state : action.state === 'confirm-required' ? 'confirm-required' : 'idle'
            return { ...action, state }
          })
        }))
      }
    })
  }
}

function pushCodexActionRunnerSnapshot(message = '') {
  ensureCodexActionRunDatabase()
  if (!codexActionRunnerAlive()) return false
  const catalog = codexActionRunnerCatalogProjection()
  const selectedLaneId = typeof catalog.selectedLaneId === 'string' ? catalog.selectedLaneId : ''
  const snapshot = {
    version: 1,
    catalog,
    capabilities: ['node-runtime-selection-v1', 'log-cursor-v1', 'explicit-window-geometry-v1'],
    runs: codexActionRunMemory.slice(0, 200).map((run) => ({
      version: 1,
      runId: run.runId,
      laneId: run.laneId,
      projectKey: run.projectKey,
      projectName: run.projectName,
      environmentId: run.environmentId,
      environmentName: run.environmentName,
      actionId: run.actionId,
      actionName: run.actionName,
      risk: run.risk,
      status: run.status,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      exitCode: run.exitCode,
      archivedAt: run.archivedAt,
      logText: run.logText,
      logBytes: run.logBytes,
      logLines: run.logLines,
      message: run.message,
      cursor: run.cursor || 0,
      runtimeMode: run.runtimeMode,
      runtimeSource: run.runtimeSource,
      runtimeVersion: run.runtimeVersion,
      runtimeLabel: run.runtimeLabel
    })),
    selectedLaneId,
    view: codexActionRunnerPreference.view,
    pinned: codexActionRunnerPreference.pinned,
    loading: catalog.loading === true,
    message: message || catalog.message || '',
    generatedAt: Date.now()
  }
  try { codexActionRunnerWindow.webContents.send(CODEX_ACTION_RUNNER_CHANNELS.snapshot, snapshot); return true } catch { return false }
}

function codexActionRunnerDevelopmentEntry() {
  const href = typeof globalThis.location?.href === 'string' ? globalThis.location.href : ''
  return /^http:\/\/127\.0\.0\.1:8092(?:\/|$)/.test(href) ? 'http://127.0.0.1:8092/action.html' : ''
}

function clampCodexActionRunnerBounds(bounds, display) {
  const area = display?.workArea || display?.bounds || { x: 0, y: 0, width: 1440, height: 900 }
  const maxWidth = Math.max(1, Math.round(area.width))
  const maxHeight = Math.max(1, Math.round(area.height))
  const width = Math.min(maxWidth, Math.max(Math.min(CODEX_ACTION_RUNNER_MIN_WIDTH, maxWidth), Math.round(Number(bounds.width) || 980)))
  const height = Math.min(maxHeight, Math.max(Math.min(CODEX_ACTION_RUNNER_MIN_HEIGHT, maxHeight), Math.round(Number(bounds.height) || 640)))
  const requestedX = Number.isFinite(bounds.x) ? Math.round(bounds.x) : area.x
  const requestedY = Number.isFinite(bounds.y) ? Math.round(bounds.y) : area.y
  const x = Math.min(area.x + maxWidth - width, Math.max(area.x, requestedX))
  const y = Math.min(area.y + maxHeight - height, Math.max(area.y, requestedY))
  return { x, y, width, height }
}

function resizeCodexActionRunnerBounds(start, screenX, screenY) {
  const dx = screenX - start.pointerX
  const dy = screenY - start.pointerY
  const left = start.corner.includes('left')
  const top = start.corner.includes('top')
  const area = start.display?.workArea || start.display?.bounds || { x: 0, y: 0, width: 1440, height: 900 }
  const oppositeX = left ? start.bounds.x + start.bounds.width : start.bounds.x
  const oppositeY = top ? start.bounds.y + start.bounds.height : start.bounds.y
  const requestedWidth = left ? start.bounds.width - dx : start.bounds.width + dx
  const requestedHeight = top ? start.bounds.height - dy : start.bounds.height + dy
  const maxWidth = left ? oppositeX - area.x : area.x + area.width - oppositeX
  const maxHeight = top ? oppositeY - area.y : area.y + area.height - oppositeY
  const width = Math.min(maxWidth, Math.max(Math.min(CODEX_ACTION_RUNNER_MIN_WIDTH, maxWidth), Math.round(requestedWidth)))
  const height = Math.min(maxHeight, Math.max(Math.min(CODEX_ACTION_RUNNER_MIN_HEIGHT, maxHeight), Math.round(requestedHeight)))
  return { x: left ? oppositeX - width : oppositeX, y: top ? oppositeY - height : oppositeY, width, height }
}

function createCodexActionRunner() {
  const utools = globalThis.utools
  if (!utools || typeof utools.createBrowserWindow !== 'function') return false
  ensureCodexActionRunnerPreferencesLoaded()
  const bounds = codexRecord(codexActionRunnerPreference.bounds)
  const validBounds = Number.isFinite(bounds.x) && Number.isFinite(bounds.y) && Number.isFinite(bounds.width) && Number.isFinite(bounds.height)
  const initialDisplay = validBounds ? floatDisplayForPoint({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }) : floatDisplayForPosition(null)
  const initialBounds = clampCodexActionRunnerBounds(validBounds ? bounds : { width: 980, height: 640 }, initialDisplay)
  const developmentEntry = codexActionRunnerDevelopmentEntry()
  let redirected = false
  const ready = () => {
    try {
      codexActionRunnerWindow.setAlwaysOnTop(codexActionRunnerPreference.pinned === true, 'floating')
      codexActionRunnerWindow.show()
      codexActionRunnerWindow.focus?.()
      codexActionRunnerVisible = true
    } catch {}
    pushCodexActionRunnerSnapshot()
  }
  try {
    codexActionRunnerWindow = utools.createBrowserWindow('action.html', {
      show: false,
      title: 'EyPc Action Runner',
      ...initialBounds,
      minWidth: CODEX_ACTION_RUNNER_MIN_WIDTH,
      minHeight: CODEX_ACTION_RUNNER_MIN_HEIGHT,
      backgroundColor: '#080d19',
      frame: false,
      transparent: false,
      resizable: false,
      movable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      closable: false,
      alwaysOnTop: codexActionRunnerPreference.pinned === true,
      skipTaskbar: false,
      autoHideMenuBar: true,
      webPreferences: { preload: 'action-preload.js' }
    }, () => {
      if (developmentEntry && !redirected && typeof codexActionRunnerWindow?.loadURL === 'function') {
        redirected = true
        try {
          const loading = codexActionRunnerWindow.loadURL(developmentEntry)
          if (loading && typeof loading.then === 'function') loading.then(ready).catch(ready)
          return
        } catch {}
      }
      ready()
    })
    return true
  } catch {
    codexActionRunnerWindow = null
    return false
  }
}

function activateCodexActionRunner(payload) {
  const source = codexRecord(payload)
  if (typeof source.laneId === 'string' && source.laneId) codexActionRunnerCatalog = { ...codexActionRunnerCatalog, selectedLaneId: source.laneId }
  if (!codexActionRunnerAlive() && !createCodexActionRunner()) return false
  try {
    codexActionRunnerWindow.show()
    codexActionRunnerWindow.focus?.()
    codexActionRunnerWindow.restore?.()
    codexActionRunnerVisible = true
  } catch { return false }
  pushCodexActionRunnerSnapshot()
  return true
}

function syncCodexActionRunnerCatalog(catalog) {
  const source = codexRecord(catalog)
  if (source.version !== 1 || !Array.isArray(source.projects)) return false
  codexActionRunnerCatalog = { ...source, version: 1, projects: source.projects.slice(0, 100) }
  pushCodexActionRunnerSnapshot()
  flushCodexActionDeferredServerClose()
  return true
}

function readCodexActionRunnerPreference() {
  ensureCodexActionRunnerPreferencesLoaded()
  return {
    selectedLaneId: typeof codexActionRunnerPreference.selectedLaneId === 'string'
      ? codexActionRunnerPreference.selectedLaneId.slice(0, 300)
      : ''
  }
}

function updateCodexActionRunnerPreference(payload) {
  const source = codexRecord(payload)
  if (typeof source.pinned === 'boolean') codexActionRunnerPreference.pinned = source.pinned
  if (source.view === 'records' || source.view === 'archived') codexActionRunnerPreference.view = source.view
  if (typeof source.selectedLaneId === 'string' && source.selectedLaneId) {
    codexActionRunnerPreference.selectedLaneId = source.selectedLaneId.slice(0, 300)
    codexActionRunnerCatalog = { ...codexActionRunnerCatalog, selectedLaneId: codexActionRunnerPreference.selectedLaneId }
  }
  const runtime = codexRecord(source.runtime)
  if (typeof runtime.projectKey === 'string' && runtime.projectKey && (codexActionRunnerCatalog.projects || []).some((project) => project.key === runtime.projectKey)) {
    const runtimeByProject = { ...codexRecord(codexActionRunnerPreference.runtimeByProject) }
    if (runtime.mode === 'auto') {
      delete runtimeByProject[runtime.projectKey]
    } else if (runtime.mode === 'manual' && typeof runtime.candidateId === 'string') {
      const candidate = codexActionNodeRuntimeCandidates(true).find((item) => item.id === runtime.candidateId)
      if (!candidate) return false
      runtimeByProject[runtime.projectKey] = { mode: 'manual', candidateId: candidate.id }
    }
    codexActionRunnerPreference.runtimeByProject = runtimeByProject
  }
  try { codexActionRunnerWindow?.setAlwaysOnTop?.(codexActionRunnerPreference.pinned, 'floating') } catch {}
  writeCodexActionRunnerPreferences()
  pushCodexActionRunnerSnapshot()
  return true
}

function setCodexActionRunArchived(input) {
  ensureCodexActionRunDatabase()
  const runId = typeof input?.runId === 'string' ? input.runId : ''
  const run = codexActionRunMemory.find((item) => item.runId === runId)
  if (!run) return Promise.resolve({ ok: false, message: '未找到执行记录' })
  if (!['completed', 'failed', 'stopped', 'interrupted'].includes(run.status)) return Promise.resolve({ ok: false, message: '仅已结束记录可归档' })
  run.archivedAt = input?.archived === true ? Date.now() : undefined
  persistCodexActionRun(run)
  pushCodexActionRunnerSnapshot(run.archivedAt ? '已归档' : '已恢复')
  return Promise.resolve({ ok: true })
}

function closeCodexActionRunner() {
  writeCodexActionRunnerPreferences()
  codexActionRunnerDrag = null
  codexActionRunnerResize = null
  if (codexActionRunnerAlive()) {
    codexActionRunnerForceClose = true
    try { codexActionRunnerWindow.close() } catch {}
  }
  codexActionRunnerWindow = null
  codexActionRunnerVisible = false
  codexActionRunnerForceClose = false
  flushCodexActionDeferredServerClose()
}

function validCodexActionRunnerSender(event) {
  if (!codexActionRunnerAlive()) return false
  const expected = codexActionRunnerWindow?.webContents?.id
  const actual = event && Number.isFinite(event.senderId) ? event.senderId : event?.sender?.id
  return Number.isFinite(expected) && Number.isFinite(actual) && expected === actual
}

function installCodexActionRunnerIpc() {
  const ipc = electronIpcRenderer()
  if (!ipc || typeof ipc.on !== 'function') return
  const allowed = new Set([
    'codex.actionRunner.run',
    'codex.actionRunner.stop',
    'codex.actionRunner.run.archive',
    'codex.actionRunner.run.restore',
    'codex.actionRunner.preference.update',
    'codex.actionRunner.runtime.update',
    'codex.actionRunner.project.reorder',
    'codex.actionRunner.hotkey.configure'
  ])
  ipc.on(CODEX_ACTION_RUNNER_CHANNELS.action, (event, payload) => {
    if (!validCodexActionRunnerSender(event)) return
    const source = codexRecord(payload)
    const actionId = typeof source.actionId === 'string' ? source.actionId : ''
    if (!allowed.has(actionId)) return
    const args = codexRecord(source.args)
    for (const listener of codexActionRunnerActionListeners) {
      try { listener({ actionId, args }) } catch {}
    }
  })
  ipc.on(CODEX_ACTION_RUNNER_CHANNELS.snapshotRequest, (event) => {
    if (validCodexActionRunnerSender(event)) pushCodexActionRunnerSnapshot()
  })
  ipc.on(CODEX_ACTION_RUNNER_CHANNELS.hide, (event) => {
    if (!validCodexActionRunnerSender(event) || !codexActionRunnerAlive()) return
    codexActionRunnerDrag = null
    codexActionRunnerResize = null
    writeCodexActionRunnerPreferences()
    try { codexActionRunnerWindow.hide() } catch {}
    codexActionRunnerVisible = false
    flushCodexActionDeferredServerClose()
  })
  ipc.on(CODEX_ACTION_RUNNER_CHANNELS.dragStart, (event, payload) => {
    if (!validCodexActionRunnerSender(event) || codexActionRunnerResize || !codexActionRunnerAlive() || typeof codexActionRunnerWindow.getBounds !== 'function') return
    const point = codexRecord(payload)
    if (!Number.isFinite(point.screenX) || !Number.isFinite(point.screenY)) return
    codexActionRunnerDrag = { pointerX: point.screenX, pointerY: point.screenY, bounds: codexActionRunnerWindow.getBounds() }
  })
  ipc.on(CODEX_ACTION_RUNNER_CHANNELS.dragMove, (event, payload) => {
    if (!validCodexActionRunnerSender(event) || !codexActionRunnerDrag || !codexActionRunnerAlive()) return
    const point = codexRecord(payload)
    if (!Number.isFinite(point.screenX) || !Number.isFinite(point.screenY)) return
    const candidate = {
      ...codexActionRunnerDrag.bounds,
      x: codexActionRunnerDrag.bounds.x + point.screenX - codexActionRunnerDrag.pointerX,
      y: codexActionRunnerDrag.bounds.y + point.screenY - codexActionRunnerDrag.pointerY
    }
    const display = floatDisplayForPoint({ x: candidate.x + candidate.width / 2, y: candidate.y + candidate.height / 2 })
    try { codexActionRunnerWindow.setBounds(clampCodexActionRunnerBounds(candidate, display)) } catch {}
  })
  ipc.on(CODEX_ACTION_RUNNER_CHANNELS.dragEnd, (event) => {
    if (!validCodexActionRunnerSender(event) || !codexActionRunnerDrag) return
    codexActionRunnerDrag = null
    writeCodexActionRunnerPreferences()
  })
  ipc.on(CODEX_ACTION_RUNNER_CHANNELS.resizeStart, (event, payload) => {
    if (!validCodexActionRunnerSender(event) || codexActionRunnerDrag || codexActionRunnerResize || !codexActionRunnerAlive() || typeof codexActionRunnerWindow.getBounds !== 'function') return
    const point = codexRecord(payload)
    if (!Number.isFinite(point.screenX) || !Number.isFinite(point.screenY) || !validCodexResizeCorner(point.corner)) return
    const bounds = codexActionRunnerWindow.getBounds()
    const display = floatDisplayForPoint({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 })
    codexActionRunnerResize = { pointerX: point.screenX, pointerY: point.screenY, bounds: { ...bounds }, display, corner: point.corner }
  })
  ipc.on(CODEX_ACTION_RUNNER_CHANNELS.resizeMove, (event, payload) => {
    if (!validCodexActionRunnerSender(event) || !codexActionRunnerResize || !codexActionRunnerAlive()) return
    const point = codexRecord(payload)
    if (!Number.isFinite(point.screenX) || !Number.isFinite(point.screenY)) return
    try { codexActionRunnerWindow.setBounds(resizeCodexActionRunnerBounds(codexActionRunnerResize, point.screenX, point.screenY)) } catch {}
  })
  ipc.on(CODEX_ACTION_RUNNER_CHANNELS.resizeEnd, (event) => {
    if (!validCodexActionRunnerSender(event) || !codexActionRunnerResize) return
    codexActionRunnerResize = null
    writeCodexActionRunnerPreferences()
  })
  ipc.on(CODEX_ACTION_RUNNER_CHANNELS.resizeCancel, (event) => {
    if (!validCodexActionRunnerSender(event) || !codexActionRunnerResize || !codexActionRunnerAlive()) return
    const bounds = codexActionRunnerResize.bounds
    codexActionRunnerResize = null
    try { codexActionRunnerWindow.setBounds(bounds) } catch {}
  })
}

installCodexActionRunnerIpc()

window.eypcPlatform = {
  storage: {
    getState: readState,
    setState: writeState,
    getMqttArchive: readMqttArchive,
    setMqttArchive: writeMqttArchive,
    getMqttStorageStatus,
    getMqttSecrets: readMqttSecrets,
    setMqttSecrets: writeMqttSecrets
  },
  ports: {
    scan: scanPorts,
    kill: killProcess
  },
  windows: {
    capabilities: (...args) => windowSubsystem
      ? windowSubsystem.capabilities(...args)
      : Promise.resolve(unavailableWindowCapability(`窗口子系统未加载：${windowSubsystemLoadError || 'unknown error'}`)),
    list: (...args) => windowSubsystem
      ? windowSubsystem.list(...args)
      : Promise.resolve({ capability: unavailableWindowCapability('窗口子系统未加载'), windows: [], completeness: 'partial' }),
    probeInstance: (...args) => windowSubsystem
      ? windowSubsystem.probeInstance(...args)
      : Promise.resolve({ status: 'indeterminate', instanceId: String(args[0] && args[0].instanceId || ''), liveness: 'indeterminate', reason: 'unsupported' }),
    activate: (...args) => windowSubsystem ? windowSubsystem.activate(...args) : Promise.resolve({ outcome: 'unsupported', message: '窗口桥接实现不可用' }),
    alwaysOnTop: (...args) => windowSubsystem ? windowSubsystem.alwaysOnTop(...args) : Promise.resolve({ outcome: 'unsupported', message: '窗口桥接实现不可用' }),
    close: (...args) => windowSubsystem ? windowSubsystem.close(...args) : Promise.resolve({ outcome: 'unsupported', message: '窗口桥接实现不可用' }),
    terminate: (...args) => windowSubsystem ? windowSubsystem.terminate(...args) : Promise.resolve({ outcome: 'unsupported', message: '窗口桥接实现不可用' }),
    openPermissionSettings: (...args) => windowSubsystem ? windowSubsystem.openPermissionSettings(...args) : Promise.resolve(false)
  },
  claude: {
    inspect: () => claudeBridge ? claudeBridge.inspect() : claudeUnavailable('environment'),
    readSnapshot: (...args) => claudeBridge ? claudeBridge.readSnapshot(...args) : claudeUnavailable('snapshot'),
    // Opt-in idle fallback. The Controller feature-detects this method, so
    // omitting it here silently disabled the `claudeQuotaFallback` setting no
    // matter what the user chose.
    readQuotaFallback: (...args) => claudeBridge ? claudeBridge.readQuotaFallback(...args) : Promise.resolve(null),
    install: (...args) => claudeBridge ? claudeBridge.install(...args) : claudeUnavailable('result'),
    uninstall: (...args) => claudeBridge ? claudeBridge.uninstall(...args) : claudeUnavailable('result'),
    openTask: (...args) => claudeBridge ? claudeBridge.openTask(...args) : Promise.resolve(claudeUnavailable('open')),
    diagnostics: () => ({
      revision: claudeBridge ? claudeBridge.revision : '',
      loaded: Boolean(claudeBridge),
      loadError: claudeBridgeLoadError
    }),
    close: () => { if (claudeBridge) claudeBridge.close() }
  },
  files: {
    capabilities: favoriteFileCapabilities(),
    open: openFavoritePath,
    reveal: revealFavoritePath,
    copyPath: copyFavoritePath,
    copyItems: copyFavoriteItems,
    inspectPaths: inspectFavoritePaths,
    pickFavorite: pickFavoritePath,
    pickFavorites: pickFavoritePaths,
    listDirectory: listFavoriteDirectory,
    saveTextFile
  },
  clipboard: {
    copyText
  },
  codex: {
    taskStateRevision: CODEX_TASK_STATE_REVISION,
    actionRuntimeRevision: CODEX_ACTION_HOST_RUNTIME_REVISION,
    inspectEnvironment: inspectCodexEnvironment,
    setLaunchPath: setCodexLaunchPath,
    clearLaunchPath: clearCodexLaunchPath,
    readSnapshot: readCodexSnapshot,
    readActivitySnapshot: readCodexActivitySnapshot,
    onActivityChanged(listener) {
      if (typeof listener !== 'function') return () => {}
      codexActivityListeners.add(listener)
      return () => codexActivityListeners.delete(listener)
    },
    openThread: openCodexThread,
    createThread: createCodexThread,
    openBlank: openCodexBlank,
    archiveThread: archiveCodexThread,
    archiveProject: archiveCodexProject,
    removeProject: removeCodexProject,
    listProjectEnvironments: listCodexProjectEnvironments,
    runProjectAction: runCodexProjectEnvironmentAction,
    listActionSessions: listCodexEnvironmentActionSessions,
    stopActionSession: stopCodexEnvironmentActionSession,
    setActionRunArchived: setCodexActionRunArchived,
    close: closeCodexConnections
  },
  float: {
    sync: syncCodexFloat,
    activate: activateCodexFloat,
    diagnostics: getCodexFloatWorkspaceDiagnostics,
    resetGeometry: resetCodexFloatGeometry,
    close() {
      codexFloatPersistent = false
      closeCodexFloat()
    },
    onAction(listener) {
      if (typeof listener !== 'function') return () => {}
      codexFloatActionListeners.add(listener)
      return () => codexFloatActionListeners.delete(listener)
    }
  },
  actionRunner: {
    syncCatalog: syncCodexActionRunnerCatalog,
    activate: activateCodexActionRunner,
    readPreference: readCodexActionRunnerPreference,
    updatePreference: updateCodexActionRunnerPreference,
    close: closeCodexActionRunner,
    onAction(listener) {
      if (typeof listener !== 'function') return () => {}
      codexActionRunnerActionListeners.add(listener)
      return () => codexActionRunnerActionListeners.delete(listener)
    }
  },
  app: {
    show() {
      try {
        if (globalThis.utools && typeof globalThis.utools.showMainWindow === 'function') {
          globalThis.utools.showMainWindow()
          return true
        }
      } catch {}
      return false
    },
    hide: async () => {
      try {
        if (globalThis.utools && typeof globalThis.utools.hideMainWindow === 'function') {
          return Boolean(globalThis.utools.hideMainWindow(true))
        }
      } catch {}
      return false
    },
    configureHotkey(commandLabel) {
      try {
        if (globalThis.utools && typeof globalThis.utools.redirectHotKeySetting === 'function') {
          globalThis.utools.redirectHotKeySetting(String(commandLabel || '').slice(0, 80))
          return true
        }
      } catch {}
      return false
    }
  },
  getEnterPayload() {
    return lastEnterPayload
  },
  clearEnterPayload() {
    lastEnterPayload = null
  },
  onEnterPayload(listener) {
    if (typeof listener !== 'function') return () => {}
    enterPayloadListeners.add(listener)
    return () => {
      enterPayloadListeners.delete(listener)
    }
  }
}
