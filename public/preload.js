const { Buffer } = require('node:buffer')
const { execFile } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const STORAGE_KEY = 'eypc/state/v1'
const MQTT_ARCHIVE_STORAGE_KEY = 'eypc/mqtt/archive/v1'
const MQTT_SECRETS_LOCAL_STORAGE_KEY = 'eypc/mqtt/secrets-local/v1'
const MQTT_SECRETS_FILE_NAME = 'mqtt-secrets-local.json'
const MQTT_SECRETS_KEY_FILE_NAME = 'mqtt-secrets-local.key'
const MQTT_SECRETS_ENCRYPTION_VERSION = 2
const MQTT_SECRETS_AES_ALGORITHM = 'aes-256-gcm'
let lastEnterPayload = null
const enterPayloadListeners = new Set()
let mqttSqliteAdapter = null
let mqttStorageLastError = ''
let mqttMigratedLegacyArchive = false

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
  files: {
    capabilities: favoriteFileCapabilities(),
    open: openFavoritePath,
    reveal: revealFavoritePath,
    copyPath: copyFavoritePath,
    copyItems: copyFavoriteItems,
    inspectPaths: inspectFavoritePaths,
    pickFavorite: pickFavoritePath,
    pickFavorites: pickFavoritePaths,
    listDirectory: listFavoriteDirectory
  },
  clipboard: {
    copyText
  },
  app: {
    hide: async () => {
      try {
        if (globalThis.utools && typeof globalThis.utools.hideMainWindow === 'function') {
          return Boolean(globalThis.utools.hideMainWindow(true))
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
