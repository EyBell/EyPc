'use strict'

const DIAGNOSTICS_REVISION = 'eypc-runtime-diagnostics-v3'
const DEFAULT_DIAGNOSTICS_ENABLED = true
// Keep the installation-diagnostics window verbose by default. Persisted user
// choices still win, including a quieter info/error level or a disabled sink.
const DEFAULT_DIAGNOSTICS_LEVEL = 'debug'
const DEFAULT_MAX_FILE_BYTES = 8 * 1024 * 1024
const DEFAULT_MAX_TOTAL_BYTES = 64 * 1024 * 1024
const DEFAULT_RETENTION_MS = 14 * 24 * 60 * 60 * 1000
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000
const RECENT_LIMIT = 100
const DETAILS_DEPTH_LIMIT = 4
const DETAILS_KEY_LIMIT = 60
const DETAILS_ARRAY_LIMIT = 40
const DETAILS_STRING_LIMIT = 4096

const LEVEL_WEIGHT = Object.freeze({ error: 0, info: 1, debug: 2 })
const FORBIDDEN_KEY_PARTS = Object.freeze([
  'prompt', 'command', 'argv', 'argument', 'transcript', 'conversation',
  'content', 'body', 'message', 'response', 'stdout', 'stderr', 'reasoning',
  'thought', 'stack', 'token', 'secret', 'credential', 'password', 'apikey',
  'authorization', 'cookie', 'payload', 'toolinput', 'tooloutput'
])

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : fallback
}

function boundedString(value, limit = DETAILS_STRING_LIMIT) {
  return String(value == null ? '' : value).slice(0, limit)
}

function normalizeLevel(value, fallback = DEFAULT_DIAGNOSTICS_LEVEL) {
  if (value === 'error' || value === 'debug' || value === 'info') return value
  // v1 call sites used "warn". In v2 it is an informational operational event.
  if (value === 'warn') return 'info'
  return fallback
}

function normalizeSettings(value) {
  const source = value && typeof value === 'object' ? value : {}
  return {
    enabled: source.enabled !== false,
    level: normalizeLevel(source.level),
    userConfigured: source.userConfigured === true,
    defaultsRevision: 3
  }
}

function explicitLevel(value) {
  return value === 'error' || value === 'info' || value === 'debug'
}

function forbiddenKey(key) {
  const normalized = String(key || '').replace(/[^a-z0-9]/gi, '').toLowerCase()
  return FORBIDDEN_KEY_PARTS.some((part) => normalized.includes(part))
}

function sanitizeDetails(value, depth = 0, seen = new Set()) {
  if (value == null || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') return boundedString(value)
  if (typeof value === 'bigint') return boundedString(value)
  if (typeof value !== 'object' || depth >= DETAILS_DEPTH_LIMIT || seen.has(value)) return undefined
  seen.add(value)
  if (Array.isArray(value)) {
    const result = value
      .slice(0, DETAILS_ARRAY_LIMIT)
      .map((item) => sanitizeDetails(item, depth + 1, seen))
      .filter((item) => item !== undefined)
    seen.delete(value)
    return result
  }
  const result = {}
  for (const key of Object.keys(value).slice(0, DETAILS_KEY_LIMIT)) {
    if (forbiddenKey(key)) continue
    const sanitized = sanitizeDetails(value[key], depth + 1, seen)
    if (sanitized !== undefined) result[boundedString(key, 120)] = sanitized
  }
  seen.delete(value)
  return result
}

function createRuntimeDiagnostics(dependencies = {}) {
  const fs = dependencies.fs
  const path = dependencies.path
  const now = typeof dependencies.now === 'function' ? dependencies.now : Date.now
  const random = typeof dependencies.random === 'function' ? dependencies.random : Math.random
  const directory = typeof dependencies.directory === 'string' ? dependencies.directory : ''
  const maxFileBytes = finite(dependencies.maxFileBytes, DEFAULT_MAX_FILE_BYTES)
  const maxTotalBytes = finite(dependencies.maxTotalBytes, DEFAULT_MAX_TOTAL_BYTES)
  const retentionMs = finite(dependencies.retentionMs, DEFAULT_RETENTION_MS)
  const processId = finite(dependencies.processId, typeof process === 'object' ? process.pid : 0)
  const startedAt = now()
  const sessionId = `${startedAt.toString(36)}-${processId.toString(36)}-${Math.floor(random() * 0xffffff).toString(36)}`
  const recent = []
  const totals = { events: 0, filtered: 0, debug: 0, info: 0, error: 0, slow: 0, writeFailures: 0 }
  let settings = normalizeSettings(dependencies.settings)
  let activePath = ''
  let activeBytes = 0
  let fileSequence = 0
  let eventSequence = 0
  let lastEventAt = 0
  let lastCleanupAt = 0
  let storage = { fileCount: 0, totalBytes: 0 }

  function ensureDirectory() {
    if (!fs || !directory) return false
    try {
      fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
      fs.chmodSync?.(directory, 0o700)
      return true
    } catch {
      totals.writeFailures += 1
      return false
    }
  }

  function diagnosticFiles() {
    if (!fs || !path || !directory) return []
    let names = []
    try { names = fs.readdirSync(directory) } catch { return [] }
    return names
      .filter((name) => /^runtime-[0-9]+-[0-9]+\.jsonl$/.test(name))
      .map((name) => {
        const filePath = path.join(directory, name)
        try {
          const stat = fs.statSync(filePath)
          return { name, path: filePath, size: finite(stat.size), mtimeMs: finite(stat.mtimeMs) }
        } catch { return null }
      })
      .filter(Boolean)
      .sort((left, right) => left.mtimeMs - right.mtimeMs || left.name.localeCompare(right.name))
  }

  function cleanup() {
    if (!fs || !path || !directory || !ensureDirectory()) return false
    const cleanupAt = now()
    const cutoff = cleanupAt - retentionMs
    let files = diagnosticFiles()
    for (const file of files) {
      if (file.mtimeMs >= cutoff || file.path === activePath) continue
      try { fs.unlinkSync(file.path) } catch {}
    }
    files = diagnosticFiles()
    let totalBytes = files.reduce((sum, file) => sum + file.size, 0)
    for (const file of files) {
      if (totalBytes <= maxTotalBytes || file.path === activePath) continue
      try {
        fs.unlinkSync(file.path)
        totalBytes -= file.size
      } catch {}
    }
    files = diagnosticFiles()
    storage = { fileCount: files.length, totalBytes: files.reduce((sum, file) => sum + file.size, 0) }
    lastCleanupAt = cleanupAt
    return true
  }

  function clear() {
    if (!fs || !path || !directory) {
      return { outcome: 'unavailable', removedFiles: 0, failedFiles: 0, remainingFiles: storage.fileCount, remainingBytes: storage.totalBytes }
    }
    const files = diagnosticFiles()
    let removedFiles = 0
    let failedFiles = 0
    for (const file of files) {
      try {
        fs.unlinkSync(file.path)
        removedFiles += 1
      } catch {
        failedFiles += 1
      }
    }
    const remaining = diagnosticFiles()
    const retainedActive = remaining.find((file) => file.path === activePath) || null
    activePath = retainedActive?.path || ''
    activeBytes = retainedActive?.size || 0
    storage = {
      fileCount: remaining.length,
      totalBytes: remaining.reduce((sum, file) => sum + file.size, 0)
    }
    recent.splice(0, recent.length)
    totals.events = 0
    totals.filtered = 0
    totals.debug = 0
    totals.info = 0
    totals.error = 0
    totals.slow = 0
    totals.writeFailures = failedFiles
    lastEventAt = 0
    return {
      outcome: failedFiles === 0 ? (removedFiles ? 'cleared' : 'empty') : removedFiles ? 'partial' : 'failed',
      removedFiles,
      failedFiles,
      remainingFiles: storage.fileCount,
      remainingBytes: storage.totalBytes
    }
  }

  function nextFile() {
    if (!fs || !path || !directory || !ensureDirectory()) return false
    activePath = path.join(directory, `runtime-${now()}-${++fileSequence}.jsonl`)
    activeBytes = 0
    cleanup()
    return true
  }

  function write(event) {
    const line = `${JSON.stringify(event)}\n`
    const bytes = Buffer.byteLength(line)
    if (!activePath || activeBytes + bytes > maxFileBytes) {
      if (!nextFile()) return false
    }
    try {
      fs.appendFileSync(activePath, line, { encoding: 'utf8', mode: 0o600 })
      fs.chmodSync?.(activePath, 0o600)
      activeBytes += bytes
      storage.totalBytes += bytes
      storage.fileCount = Math.max(1, storage.fileCount)
      if (activeBytes === bytes || storage.totalBytes > maxTotalBytes || now() - lastCleanupAt >= CLEANUP_INTERVAL_MS) cleanup()
      return true
    } catch {
      totals.writeFailures += 1
      return false
    }
  }

  function buildEvent(input, forced = false) {
    const at = now()
    const level = normalizeLevel(input.level, 'error')
    if (!forced && (!settings.enabled || LEVEL_WEIGHT[level] > LEVEL_WEIGHT[settings.level])) {
      totals.filtered += 1
      return null
    }
    const durationMs = finite(input.durationMs)
    const details = sanitizeDetails(input.details)
    const errorCode = input.errorCode || input.code
    return {
      v: 3,
      at,
      iso: new Date(at).toISOString(),
      seq: ++eventSequence,
      sessionId,
      processId,
      level,
      scope: boundedString(input.scope || 'runtime', 160),
      event: boundedString(input.event || 'event', 160),
      outcome: boundedString(input.outcome || 'observed', 160),
      ...(input.code ? { code: boundedString(input.code, 240) } : {}),
      ...(errorCode ? { errorCode: boundedString(errorCode, 240) } : {}),
      ...(durationMs ? { durationMs } : {}),
      ...(Number.isFinite(input.count) ? { count: finite(input.count) } : {}),
      ...(typeof input.cache === 'string' ? { cache: boundedString(input.cache, 160) } : {}),
      ...(typeof input.provider === 'string' ? { provider: boundedString(input.provider, 80) } : {}),
      ...(typeof input.phase === 'string' ? { phase: boundedString(input.phase, 160) } : {}),
      ...(typeof input.reason === 'string' ? { reason: boundedString(input.reason, 240) } : {}),
      ...(typeof input.evidence === 'string' ? { evidence: boundedString(input.evidence, 240) } : {}),
      ...(typeof input.taskRef === 'string' ? { taskRef: boundedString(input.taskRef, 1024) } : {}),
      ...(typeof input.operationId === 'string' ? { operationId: boundedString(input.operationId, 160) } : {}),
      ...(typeof input.traceId === 'string' ? { traceId: boundedString(input.traceId, 160) } : {}),
      ...(typeof input.source === 'string' ? { source: boundedString(input.source, 160) } : {}),
      ...(typeof input.beforePhase === 'string' ? { beforePhase: boundedString(input.beforePhase, 80) } : {}),
      ...(typeof input.afterPhase === 'string' ? { afterPhase: boundedString(input.afterPhase, 80) } : {}),
      ...(typeof input.beforeUnread === 'boolean' ? { beforeUnread: input.beforeUnread } : {}),
      ...(typeof input.afterUnread === 'boolean' ? { afterUnread: input.afterUnread } : {}),
      ...(finite(input.turnStartedAt) ? { turnStartedAt: finite(input.turnStartedAt) } : {}),
      ...(finite(input.statusEnteredAt) ? { statusEnteredAt: finite(input.statusEnteredAt) } : {}),
      ...(finite(input.terminalAt) ? { terminalAt: finite(input.terminalAt) } : {}),
      ...(finite(input.observationGeneration) ? { observationGeneration: finite(input.observationGeneration) } : {}),
      ...(finite(input.semanticRevision) ? { semanticRevision: finite(input.semanticRevision) } : {}),
      ...(finite(input.packageRevision) ? { packageRevision: finite(input.packageRevision) } : {}),
      ...(details && Object.keys(details).length ? { details } : {})
    }
  }

  function appendEvent(event) {
    if (!event) return null
    totals.events += 1
    totals[event.level] += 1
    if (event.durationMs >= 250) totals.slow += 1
    lastEventAt = event.at
    recent.push(event)
    if (recent.length > RECENT_LIMIT) recent.splice(0, recent.length - RECENT_LIMIT)
    write(event)
    return event
  }

  function record(input = {}) {
    if (!explicitLevel(input.level)) {
      if (settings.enabled) {
        appendEvent(buildEvent({
          level: 'error',
          scope: 'runtime-diagnostics',
          event: 'diagnostics-level-missing',
          outcome: 'rejected',
          code: 'level-required',
          details: {
            requestedScope: boundedString(input.scope || 'runtime', 160),
            requestedEvent: boundedString(input.event || 'event', 160)
          }
        }, true))
      }
      return null
    }
    return appendEvent(buildEvent(input, false))
  }

  function forceRecord(input = {}) {
    return appendEvent(buildEvent(input, true))
  }

  function configure(value) {
    const previous = settings
    const next = normalizeSettings(value)
    if (previous.enabled && !next.enabled) {
      forceRecord({
        level: 'info', scope: 'runtime-diagnostics', event: 'configuration', outcome: 'disabled',
        details: { previous, next }
      })
    }
    settings = next
    if (next.enabled && (!previous.enabled || previous.level !== next.level)) {
      forceRecord({
        level: 'info', scope: 'runtime-diagnostics', event: 'configuration', outcome: previous.enabled ? 'level-changed' : 'enabled',
        details: { previous, next }
      })
    }
    return snapshot()
  }

  function snapshot() {
    return {
      revision: DIAGNOSTICS_REVISION,
      status: !settings.enabled ? 'disabled' : totals.writeFailures ? 'degraded' : fs && directory ? 'ok' : 'unavailable',
      updatedAt: lastEventAt,
      sessionId,
      processId,
      settings: { ...settings },
      directory,
      activeFile: activePath,
      totals: { ...totals },
      storage: {
        fileCount: storage.fileCount,
        totalBytes: storage.totalBytes,
        maxFileBytes,
        maxTotalBytes,
        retentionDays: Math.round(retentionMs / (24 * 60 * 60 * 1000))
      },
      recent: recent.slice(-30).map((event) => ({ ...event, ...(event.details ? { details: sanitizeDetails(event.details) } : {}) }))
    }
  }

  cleanup()
  if (settings.enabled) {
    record({
      level: 'info', scope: 'runtime-diagnostics', event: 'process-start', outcome: 'started',
      details: { revision: DIAGNOSTICS_REVISION, settings, directory, startedAt }
    })
  }
  return { revision: DIAGNOSTICS_REVISION, record, configure, snapshot, cleanup, clear, ensureDirectory }
}

module.exports = {
  DIAGNOSTICS_REVISION,
  DEFAULT_DIAGNOSTICS_ENABLED,
  DEFAULT_DIAGNOSTICS_LEVEL,
  DEFAULT_MAX_FILE_BYTES,
  DEFAULT_MAX_TOTAL_BYTES,
  DEFAULT_RETENTION_MS,
  normalizeSettings,
  createRuntimeDiagnostics
}
