'use strict'

/** Exact Claude App unread mirror, read only from a private LevelDB snapshot. */

const { claudeAppDataRoot } = require('./app-paths.cjs')
const { LOCAL_SESSION_PATTERN } = require('./code-sessions.cjs')

const UNREAD_READER_REVISION = 'claude-native-unread-snapshot-v2'
const UNREAD_STORE_KEY = 'epitaxy-unread-v1'
// Chromium Local Storage key: origin, NUL separator, string-value tag (0x01),
// then the application key. The tag is part of the exact key on disk.
const UNREAD_LEVELDB_KEY = `_https://claude.ai\u0000\u0001${UNREAD_STORE_KEY}`
const UNREAD_MAX_IDS = 500
const UNREAD_MAX_ATTEMPTS = 2
const UNREAD_RECOVERY_POLL_MS = 1000

function textOf(value) {
  return typeof value === 'string' ? value : ''
}

function decodeChromiumValue(value) {
  if (!Buffer.isBuffer(value) || value.length < 2) return null
  if (value[0] === 1) return value.subarray(1).toString('utf8')
  if (value[0] === 0) return value.subarray(1).toString('utf16le')
  return null
}

function normalizeUnreadValue(value) {
  const text = decodeChromiumValue(value)
  if (!text) return null
  let parsed
  try { parsed = JSON.parse(text) } catch { return null }
  const raw = parsed && parsed.state && Array.isArray(parsed.state.unreadIds)
    ? parsed.state.unreadIds
    : null
  if (!raw) return null
  const ids = []
  for (const value of raw) {
    if (typeof value !== 'string') continue
    const id = value.trim().toLowerCase()
    if (!LOCAL_SESSION_PATTERN.test(id) || ids.includes(id)) continue
    ids.push(id)
    if (ids.length >= UNREAD_MAX_IDS) break
  }
  return ids
}

function hostResourcesPath(dependencies) {
  const explicit = textOf(dependencies.resourcesPath).trim()
  if (explicit) return explicit
  if (typeof process.resourcesPath === 'string' && process.resourcesPath) return process.resourcesPath
  const executable = textOf(process.execPath)
  if ((dependencies.platform || process.platform) === 'darwin' && executable) {
    return dependencies.path.resolve(dependencies.path.dirname(executable), '..', 'Resources')
  }
  return ''
}

/**
 * uTools ships a signed `leveldown` inside its own Electron ASAR. Loading that
 * copy avoids the macOS Hardened Runtime rejecting a differently signed native
 * addon. Absence/version skew fails closed; no byte-scanning fallback exists.
 */
function resolveLeveldown(dependencies) {
  if (typeof dependencies.leveldown === 'function') return dependencies.leveldown
  const resources = hostResourcesPath(dependencies)
  if (!resources) return null
  const request = typeof dependencies.requireModule === 'function' ? dependencies.requireModule : require
  try {
    const candidate = request(dependencies.path.join(resources, 'app.asar', 'node_modules', 'leveldown'))
    return typeof candidate === 'function' ? candidate : null
  } catch {
    return null
  }
}

function openDatabase(leveldown, snapshotPath) {
  return new Promise((resolve) => {
    let database
    try { database = leveldown(snapshotPath) } catch { resolve(null); return }
    database.open({ createIfMissing: false, errorIfExists: false }, (error) => {
      if (error) { resolve(null); return }
      resolve(database)
    })
  })
}

function closeDatabase(database) {
  return new Promise((resolve) => {
    if (!database || typeof database.close !== 'function') { resolve(); return }
    try { database.close(() => resolve()) } catch { resolve() }
  })
}

function findUnreadValue(database) {
  return new Promise((resolve) => {
    let iterator
    try { iterator = database.iterator({ keyAsBuffer: true, valueAsBuffer: true }) } catch { resolve(null); return }
    let resolved = false
    const finish = (value) => {
      if (resolved) return
      resolved = true
      try { iterator.end(() => resolve(value)) } catch { resolve(value) }
    }
    const next = () => {
      try {
        iterator.next((error, key, value) => {
          if (error || key === undefined) { finish(null); return }
          const keyText = Buffer.isBuffer(key) ? key.toString('utf8') : String(key || '')
          if (keyText === UNREAD_LEVELDB_KEY) { finish(value); return }
          next()
        })
      } catch { finish(null) }
    }
    next()
  })
}

function createUnreadReader(dependencies) {
  const fs = dependencies.fs
  const path = dependencies.path
  const os = dependencies.os
  const setIntervalFn = dependencies.setInterval || setInterval
  const clearIntervalFn = dependencies.clearInterval || clearInterval
  const watchFileFn = dependencies.watchFile
    || (typeof fs.watchFile === 'function' ? fs.watchFile.bind(fs) : null)
  const unwatchFileFn = dependencies.unwatchFile
    || (typeof fs.unwatchFile === 'function' ? fs.unwatchFile.bind(fs) : null)
  let watcher = null
  const recoveryFileWatches = new Map()
  let recoveryTimer = null
  let lastFingerprint = ''
  let lastStableFingerprint = ''
  let generation = 0
  let readInFlight = null

  function sourceRoot() {
    const override = textOf(dependencies.claudeLocalStorageRoot).trim()
    return override || path.join(claudeAppDataRoot(dependencies), 'Local Storage', 'leveldb')
  }

  function cleanup(directory) {
    if (!directory) return
    try { fs.rmSync(directory, { recursive: true, force: true }) } catch {}
  }

  async function attempt(leveldown) {
    let temporary = ''
    let database = null
    try {
      const before = fingerprint()
      if (!before) return null
      temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'eypc-claude-unread-'))
      fs.chmodSync(temporary, 0o700)
      const snapshot = path.join(temporary, 'snapshot')
      fs.cpSync(sourceRoot(), snapshot, { recursive: true })
      const after = fingerprint()
      if (!after || after !== before) return null
      database = await openDatabase(leveldown, snapshot)
      if (!database) return null
      const raw = await findUnreadValue(database)
      const ids = normalizeUnreadValue(raw)
      if (!ids) return null
      if (after !== lastStableFingerprint) {
        lastStableFingerprint = after
        generation += 1
      }
      return {
        version: 2,
        revision: UNREAD_READER_REVISION,
        ids,
        readAt: Date.now(),
        generation,
        sourceFingerprint: after
      }
    } catch {
      return null
    } finally {
      await closeDatabase(database)
      cleanup(temporary)
    }
  }

  function read() {
    if (readInFlight) return readInFlight
    const operation = (async () => {
      const leveldown = resolveLeveldown(dependencies)
      if (!leveldown) return null
      for (let index = 0; index < UNREAD_MAX_ATTEMPTS; index += 1) {
        const result = await attempt(leveldown)
        if (result) return result
      }
      return null
    })().finally(() => {
      if (readInFlight === operation) readInFlight = null
    })
    readInFlight = operation
    return operation
  }

  function fingerprint() {
    const rows = []
    try {
      for (const entry of fs.readdirSync(sourceRoot(), { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
        if (!entry.isFile()) continue
        let stat
        try { stat = fs.statSync(path.join(sourceRoot(), entry.name)) } catch { continue }
        rows.push(`${entry.name}:${Number(stat.mtimeMs) || 0}:${Number(stat.ctimeMs) || 0}:${Number(stat.size) || 0}:${Number(stat.ino) || 0}`)
      }
    } catch { return '' }
    if (!rows.length) return ''
    const crypto = dependencies.crypto || require('node:crypto')
    try { return crypto.createHash('sha256').update(rows.join('\n')).digest('hex').slice(0, 32) } catch { return '' }
  }

  function stopWatching() {
    if (recoveryTimer) clearIntervalFn(recoveryTimer)
    recoveryTimer = null
    if (unwatchFileFn) {
      for (const [filePath, callback] of recoveryFileWatches) {
        try { unwatchFileFn(filePath, callback) } catch {}
      }
    }
    recoveryFileWatches.clear()
    if (watcher) { try { watcher.close() } catch {} }
    watcher = null
  }

  function recoveryTargets() {
    const targets = new Set([sourceRoot()])
    try {
      for (const entry of fs.readdirSync(sourceRoot(), { withFileTypes: true })) {
        if (entry.isFile()) targets.add(path.join(sourceRoot(), entry.name))
      }
    } catch {}
    return targets
  }

  function watch(listener) {
    stopWatching()
    if (typeof listener !== 'function') return () => {}
    let disposed = false
    lastFingerprint = fingerprint()
    const notifyIfChanged = () => {
      if (disposed) return
      const next = fingerprint()
      if (next === lastFingerprint) return
      lastFingerprint = next
      try { listener() } catch {}
    }
    const reconcileRecoveryWatches = () => {
      const targets = recoveryTargets()
      for (const [filePath, callback] of recoveryFileWatches) {
        if (targets.has(filePath)) continue
        if (unwatchFileFn) { try { unwatchFileFn(filePath, callback) } catch {} }
        recoveryFileWatches.delete(filePath)
      }
      if (watchFileFn) {
        for (const filePath of targets) {
          if (recoveryFileWatches.has(filePath)) continue
          try {
            const callback = () => {
              reconcileRecoveryWatches()
              notifyIfChanged()
            }
            watchFileFn(filePath, { persistent: false, interval: UNREAD_RECOVERY_POLL_MS }, callback)
            recoveryFileWatches.set(filePath, callback)
          } catch {}
        }
      }
      const needsFallback = recoveryFileWatches.size !== targets.size
      if (needsFallback && !recoveryTimer) {
        recoveryTimer = setIntervalFn(() => {
          reconcileRecoveryWatches()
          notifyIfChanged()
        }, UNREAD_RECOVERY_POLL_MS)
        if (recoveryTimer && typeof recoveryTimer.unref === 'function') recoveryTimer.unref()
      } else if (!needsFallback && recoveryTimer) {
        clearIntervalFn(recoveryTimer)
        recoveryTimer = null
      }
    }
    const onChange = () => {
      // The first native callback owns the semantic wake. The async LevelDB
      // snapshot reader already singleflights concurrent consumers; identical
      // fingerprints therefore need neither a debounce nor a publication.
      reconcileRecoveryWatches()
      notifyIfChanged()
    }
    try { watcher = fs.watch(sourceRoot(), { persistent: false }, onChange) } catch { watcher = null }
    reconcileRecoveryWatches()
    return () => { disposed = true; stopWatching() }
  }

  return { revision: UNREAD_READER_REVISION, sourceRoot, read, watch, close: stopWatching }
}

module.exports = {
  UNREAD_READER_REVISION,
  UNREAD_STORE_KEY,
  UNREAD_LEVELDB_KEY,
  UNREAD_MAX_ATTEMPTS,
  UNREAD_RECOVERY_POLL_MS,
  decodeChromiumValue,
  normalizeUnreadValue,
  resolveLeveldown,
  createUnreadReader
}
