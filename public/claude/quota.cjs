'use strict'

/**
 * Claude quota fallback.
 *
 * Claude App's current encrypted OAuth cache is the complete quota authority.
 * The status-line and plan-history readers remain credential-free supplements.
 *
 * This module is deliberately:
 *
 *  - explicitly authorized and backed off because it decrypts one App-owned
 *    token in memory and calls the usage endpoint;
 *  - write-free, never caching, logging or returning the token — the value
 *    exists only inside `withAccessToken` and is overwritten before returning;
 *  - fail-quiet, degrading to "no reading" rather than surfacing an error, so a
 *    changed or withdrawn endpoint can never break the companion.
 */

const USAGE_ENDPOINT = 'https://api.anthropic.com/api/oauth/usage'
const OAUTH_BETA_HEADER = 'oauth-2025-04-20'
const ANTHROPIC_API_VERSION = '2023-06-01'
const REQUEST_TIMEOUT_MS = 8000
const MAX_RESPONSE_BYTES = 1024 * 1024

/** Minimum age of the primary reading before the fallback is worth attempting. */
const DEFAULT_MIN_STALE_MS = 10 * 60 * 1000
/** Never call more often than this, whatever the caller asks for. */
const MIN_CALL_INTERVAL_MS = 5 * 60 * 1000
const FAILURE_RETRY_DELAYS_MS = [60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000]
const FAILURE_COOLDOWN_MS = 60 * 60 * 1000
const CLAUDE_APP_TOKEN_CACHE_KEY = 'oauth:tokenCacheV2'
const CLAUDE_APP_CONFIG_NAME = 'config.json'
const CLAUDE_APP_SAFE_STORAGE_SERVICE = 'Claude Safe Storage'
const CLAUDE_APP_SAFE_STORAGE_ACCOUNT = 'Claude Key'
const SAFE_STORAGE_PREFIX = 'v10'
const SAFE_STORAGE_SALT = 'saltysalt'
const SAFE_STORAGE_ITERATIONS = 1003

const { claudeAppDataRoot } = require('./app-paths.cjs')

/**
 * Runs `use` with the access token and then drops the reference. The token is
 * never returned to the caller, so it cannot be captured by accident.
 */
function appTokenCachePath(dependencies) {
  return dependencies.path.join(claudeAppDataRoot(dependencies), CLAUDE_APP_CONFIG_NAME)
}

function readClaudeAppCredentialFingerprint(dependencies) {
  try {
    const stat = dependencies.fs.statSync(appTokenCachePath(dependencies))
    return `${Math.round(Number(stat.mtimeMs) || 0)}:${Number(stat.size) || 0}`
  } catch {
    return ''
  }
}

function tokenRecordRows(value) {
  if (!value || typeof value !== 'object') return []
  const container = value.tokens && typeof value.tokens === 'object' ? value.tokens : value
  return Array.isArray(container)
    ? container.map((record, index) => [String(index), record])
    : Object.entries(container)
}

function nonEmptyId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function candidateOrganizationId(key, record) {
  const explicit = nonEmptyId(record.organizationId) || nonEmptyId(record.organizationUuid)
    || nonEmptyId(record.orgId) || nonEmptyId(record.orgUuid)
  if (explicit) return explicit
  // Claude App v2 keys are `${clientId}:${orgId}:${apiHost}:${scope}`. The
  // apiHost may itself contain colons, but the organization is always segment 2.
  const segments = String(key || '').split(':')
  return segments.length >= 2 ? nonEmptyId(segments[1]) : ''
}

function candidateAccountIds(record) {
  return [record.accountId, record.accountUuid, record.account_id, record.account_uuid]
    .map(nonEmptyId)
    .filter(Boolean)
}

function decryptClaudeAppTokenCache(dependencies, encrypted) {
  if (!Buffer.isBuffer(encrypted) || encrypted.length < 4) return ''
  if (typeof dependencies.decryptClaudeAppTokenCache === 'function') {
    try { return String(dependencies.decryptClaudeAppTokenCache(encrypted) || '') } catch { return '' }
  }
  const platform = dependencies.platform || process.platform
  if (platform === 'darwin') {
    const execFileSync = dependencies.execFileSync
    const crypto = dependencies.crypto || require('node:crypto')
    if (typeof execFileSync !== 'function' || !crypto || encrypted.subarray(0, 3).toString('ascii') !== SAFE_STORAGE_PREFIX) return ''
    let rawPassword = null
    let derivedKey = null
    let decrypted = null
    try {
      const output = execFileSync('/usr/bin/security', [
        'find-generic-password', '-w',
        '-s', CLAUDE_APP_SAFE_STORAGE_SERVICE,
        '-a', CLAUDE_APP_SAFE_STORAGE_ACCOUNT
      ], {
        timeout: 5000,
        maxBuffer: 64 * 1024,
        stdio: ['ignore', 'pipe', 'ignore']
      })
      rawPassword = Buffer.isBuffer(output) ? Buffer.from(output) : Buffer.from(String(output || ''), 'utf8')
      let end = rawPassword.length
      while (end > 0 && (rawPassword[end - 1] === 10 || rawPassword[end - 1] === 13)) end -= 1
      if (end <= 0) return ''
      derivedKey = crypto.pbkdf2Sync(rawPassword.subarray(0, end), SAFE_STORAGE_SALT, SAFE_STORAGE_ITERATIONS, 16, 'sha1')
      const decipher = crypto.createDecipheriv('aes-128-cbc', derivedKey, Buffer.alloc(16, 32))
      decrypted = Buffer.concat([decipher.update(encrypted.subarray(3)), decipher.final()])
      if (decrypted.length > MAX_RESPONSE_BYTES) return ''
      return decrypted.toString('utf8')
    } catch {
      return ''
    } finally {
      if (rawPassword) rawPassword.fill(0)
      if (derivedKey) derivedKey.fill(0)
      if (decrypted) decrypted.fill(0)
    }
  }
  const safeStorage = dependencies.safeStorage
  if (!safeStorage || typeof safeStorage.decryptString !== 'function') return ''
  try { return safeStorage.decryptString(encrypted) } catch { return '' }
}

/**
 * Reads Claude App's encrypted token cache without ever returning its payload.
 * Exactly one live token must remain after optional active-account matching;
 * ambiguity fails closed so EyPc never reads quota for the wrong account.
 */
function readClaudeAppAccessToken(dependencies, now = Date.now()) {
  let config
  try { config = JSON.parse(dependencies.fs.readFileSync(appTokenCachePath(dependencies), 'utf8')) } catch { return '' }
  const encrypted = config && typeof config === 'object' ? config[CLAUDE_APP_TOKEN_CACHE_KEY] : ''
  if (typeof encrypted !== 'string' || !encrypted) return ''
  let cache
  try {
    const plaintext = decryptClaudeAppTokenCache(dependencies, Buffer.from(encrypted, 'base64'))
    if (!plaintext) return ''
    cache = JSON.parse(plaintext)
  } catch { return '' }

  const activeAccountHint = [
    cache && cache.activeAccountId,
    cache && cache.activeAccountUuid,
    config.activeAccountId,
    config.activeAccountUuid,
    config.lastKnownAccountUuid
  ].map(nonEmptyId).find(Boolean) || ''
  const activeOrganizationHint = [
    cache && cache.activeOrganizationId,
    cache && cache.activeOrganizationUuid,
    cache && cache.activeOrgId,
    cache && cache.activeOrgUuid,
    config.activeOrganizationId,
    config.activeOrganizationUuid,
    config.activeOrgId,
    config.activeOrgUuid
  ].map(nonEmptyId).find(Boolean) || ''
  const candidates = []
  for (const [key, record] of tokenRecordRows(cache)) {
    if (!record || typeof record !== 'object') continue
    const token = typeof record.token === 'string'
      ? record.token
      : typeof record.accessToken === 'string' ? record.accessToken : ''
    const expiresRaw = record.expiresAt ?? record.expires_at ?? record.expiration
    const numericExpiresAt = Number(expiresRaw)
    const parsedExpiresAt = Number.isFinite(numericExpiresAt) && numericExpiresAt > 0
      ? numericExpiresAt
      : typeof expiresRaw === 'string' ? Date.parse(expiresRaw) : Number.NaN
    const expiresAt = Number.isFinite(parsedExpiresAt) && parsedExpiresAt > 0 && parsedExpiresAt < 1e11
      ? parsedExpiresAt * 1000
      : parsedExpiresAt
    if (!token || !Number.isFinite(expiresAt) || expiresAt <= now) continue
    candidates.push({
      token,
      organizationId: candidateOrganizationId(key, record),
      accountIds: candidateAccountIds(record),
      // All candidates are identity-filtered first. If an organization has
      // several valid scopes, choose the unique least-privileged token; the
      // current App endpoint accepts the profile-only scope.
      scopeScore: (String(key || '').match(/user:/g) || []).length || Number.MAX_SAFE_INTEGER
    })
  }
  let matching = candidates
  if (activeAccountHint) {
    const comparable = matching.filter((candidate) => candidate.accountIds.length > 0)
    if (comparable.length) {
      matching = comparable.filter((candidate) => candidate.accountIds.includes(activeAccountHint))
      if (!matching.length) return ''
    }
  }
  if (activeOrganizationHint) {
    matching = matching.filter((candidate) => candidate.organizationId === activeOrganizationHint)
    if (!matching.length) return ''
  } else {
    const organizations = [...new Set(matching.map((candidate) => candidate.organizationId).filter(Boolean))]
    if (organizations.length > 1) return ''
    if (organizations.length === 1 && matching.some((candidate) => !candidate.organizationId)) return ''
  }
  const unique = [...new Set(matching.map((candidate) => candidate.token))]
  if (unique.length === 1) return unique[0]
  const minimumScopeScore = Math.min(...matching.map((candidate) => candidate.scopeScore))
  const leastPrivileged = [...new Set(matching
    .filter((candidate) => candidate.scopeScore === minimumScopeScore)
    .map((candidate) => candidate.token))]
  return leastPrivileged.length === 1 ? leastPrivileged[0] : ''
}

function withAccessToken(dependencies, _claudeHome, use, now = Date.now()) {
  let token = typeof dependencies.readClaudeAppAccessToken === 'function'
    ? dependencies.readClaudeAppAccessToken(now)
    : readClaudeAppAccessToken(dependencies, now)
  if (!token) return Promise.resolve(null)
  try {
    return Promise.resolve(use(token))
  } finally {
    token = ''
  }
}

/**
 * Maps the usage response onto the same `rate_limits` shape the status line
 * produces, so the domain layer has exactly one normalizer to maintain.
 */
function toRateLimits(payload) {
  if (!payload || typeof payload !== 'object') return null
  const source = payload.rate_limits && typeof payload.rate_limits === 'object' ? payload.rate_limits : payload
  const pick = (value) => {
    if (!value || typeof value !== 'object') return null
    const used = Number(value.used_percentage ?? value.utilization ?? value.percent ?? value.used)
    if (!Number.isFinite(used)) return null
    const resetRaw = value.resets_at ?? value.reset_at ?? value.resetsAt
    const window = { used_percentage: used }
    if (typeof resetRaw === 'number' && Number.isFinite(resetRaw)) window.resets_at = resetRaw
    else if (typeof resetRaw === 'string') {
      const parsed = Date.parse(resetRaw)
      if (Number.isFinite(parsed)) window.resets_at = Math.round(parsed / 1000)
    }
    return window
  }
  const result = {}
  const aliases = {
    fiveHour: 'five_hour', session: 'five_hour',
    sevenDay: 'seven_day', weekly: 'seven_day', weekly_all: 'seven_day'
  }
  for (const [rawKey, rawValue] of Object.entries(source)) {
    if (rawKey === 'limits') continue
    const key = aliases[rawKey] || rawKey
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(key)) continue
    if (key !== 'five_hour' && key !== 'seven_day' && !/^(five_hour|seven_day)[_-].+/.test(key)) continue
    const window = pick(rawValue)
    if (window) result[key] = window
  }
  const dynamicLimits = Array.isArray(payload.limits)
    ? payload.limits
    : Array.isArray(source.limits) ? source.limits : []
  const safeScope = (value) => {
    const normalized = String(value || '').normalize('NFKC').trim().toLowerCase()
    const readable = normalized.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48)
    if (readable) return readable
    if (!normalized) return ''
    // Stable Unicode fallback without importing or exposing the display name.
    let hash = 2166136261
    for (const character of normalized) {
      hash ^= character.codePointAt(0) || 0
      hash = Math.imul(hash, 16777619) >>> 0
    }
    return `scope_${hash.toString(16).padStart(8, '0')}`
  }
  for (const limit of dynamicLimits) {
    if (!limit || typeof limit !== 'object') continue
    const upstreamType = String(limit.type ?? limit.kind ?? limit.limit_type ?? limit.window_type ?? '').trim().toLowerCase()
    const displayName = String(
      limit.model?.display_name
      ?? limit.model?.displayName
      ?? limit.scope?.model?.display_name
      ?? limit.scope?.model?.displayName
      ?? limit.display_name
      ?? limit.displayName
      ?? limit.scope_name
      ?? ''
    ).trim().slice(0, 80)
    let key = aliases[upstreamType] || upstreamType
    if (upstreamType === 'weekly_scoped') {
      const scopeKey = safeScope(displayName || limit.model?.name || limit.scope?.model?.name || limit.scope)
      if (!scopeKey) continue
      key = `seven_day_${scopeKey}`
    }
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(key)) continue
    const window = pick(limit)
    if (!window) continue
    window.upstream_type = upstreamType
    if (displayName) {
      window.display_name = displayName
      window.scope = displayName
    }
    result[key] = window
  }
  return Object.keys(result).length ? result : null
}

/** Fetch-compatible Node 16 transport; never returns headers or raw bodies. */
function createNodeHttpsFetch(dependencies) {
  const https = dependencies.https
  if (!https || typeof https.request !== 'function') return null
  return (url, options) => new Promise((resolve, reject) => {
    const settings = options || {}
    let settled = false
    let request = null
    const finishError = (error) => {
      if (settled) return
      settled = true
      reject(error instanceof Error ? error : new Error('https request failed'))
    }
    try {
      request = https.request(url, {
        method: settings.method || 'GET',
        headers: settings.headers || {}
      }, (response) => {
        const chunks = []
        let bytes = 0
        response.on('data', (chunk) => {
          if (settled) return
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
          bytes += buffer.length
          if (bytes > MAX_RESPONSE_BYTES) {
            settled = true
            try { request.destroy() } catch {}
            reject(new Error('usage response too large'))
            return
          }
          chunks.push(buffer)
        })
        response.on('error', finishError)
        response.on('end', () => {
          if (settled) return
          settled = true
          const body = Buffer.concat(chunks).toString('utf8')
          resolve({
            ok: Number(response.statusCode) >= 200 && Number(response.statusCode) < 300,
            status: Number(response.statusCode) || 0,
            headers: {
              get: (name) => String(response.headers && response.headers[String(name || '').toLowerCase()] || '')
            },
            json: async () => JSON.parse(body)
          })
        })
      })
      request.on('error', finishError)
      if (typeof request.setTimeout === 'function') {
        request.setTimeout(REQUEST_TIMEOUT_MS, () => request.destroy(new Error('usage request timed out')))
      }
      const signal = settings.signal
      if (signal && typeof signal.addEventListener === 'function') {
        const abort = () => request.destroy(new Error('usage request aborted'))
        if (signal.aborted) abort()
        else signal.addEventListener('abort', abort, { once: true })
      }
      request.end()
    } catch (error) {
      finishError(error)
    }
  })
}

function createQuotaFallback(dependencies) {
  const fetchImpl = dependencies.fetch
    || createNodeHttpsFetch(dependencies)
  let lastAttemptAt = 0
  let consecutiveFailures = 0
  let nextAllowedAt = 0
  let lastFailure = ''
  let credentialFingerprint = ''

  /**
   * Attempts one fallback read.
   *
   * `enabled` is the hard access gate. `coldStart` and `supplement` describe
   * scheduling urgency but never grant access. Failures retry at 1m, 5m, 15m
   * and then hourly;
   * success restores the ordinary five-minute minimum interval.
   *
   * Returns null for every non-success path — not authorized, rate limited by
   * our own interval, no token, network failure, unexpected shape. The caller
   * treats null as "keep the previous reading", never as an error.
   */
  async function read(options) {
    const settings = options || {}
    const now = Number.isFinite(settings.now) ? settings.now : Date.now()
    if (settings.enabled !== true) return null
    if (typeof fetchImpl !== 'function') {
      lastFailure = 'transport-unavailable'
      return null
    }
    // Claude App OAuth is the complete quota/reset authority. Statusline and
    // plan history may fill a missing window but never postpone this read merely
    // because their partial cache is fresh.
    const nextCredentialFingerprint = readClaudeAppCredentialFingerprint(dependencies)
    if (nextCredentialFingerprint && nextCredentialFingerprint !== credentialFingerprint) {
      credentialFingerprint = nextCredentialFingerprint
      nextAllowedAt = 0
      consecutiveFailures = 0
    }
    if (nextAllowedAt > 0 && now < nextAllowedAt) return null
    lastAttemptAt = now

    const attempt = await withAccessToken(dependencies, settings.claudeHome || '', async (token) => {
      const controller = typeof AbortController === 'function' ? new AbortController() : null
      const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null
      try {
        const response = await fetchImpl(USAGE_ENDPOINT, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'anthropic-beta': OAUTH_BETA_HEADER,
            'anthropic-version': ANTHROPIC_API_VERSION,
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          ...(controller ? { signal: controller.signal } : {})
        })
        if (!response || response.ok !== true) {
          const status = Number(response && response.status) || 0
          const retryAfterRaw = response && response.headers && typeof response.headers.get === 'function'
            ? response.headers.get('retry-after')
            : ''
          const retrySeconds = Number(retryAfterRaw)
          const retryAt = Number.isFinite(retrySeconds) && retrySeconds >= 0
            ? now + retrySeconds * 1000
            : (typeof retryAfterRaw === 'string' && Number.isFinite(Date.parse(retryAfterRaw)) ? Date.parse(retryAfterRaw) : 0)
          return { result: null, reason: status ? `http-${status}` : 'http-rejected', status, retryAt }
        }
        const payload = await response.json()
        const rateLimits = toRateLimits(payload)
        return rateLimits
          ? { result: { rateLimits, updatedAt: now, source: 'usage-api' }, reason: '' }
          : { result: null, reason: 'unsupported-payload' }
      } catch {
        return { result: null, reason: 'request-failed' }
      } finally {
        if (timer) clearTimeout(timer)
      }
    }, now)
    const result = attempt && attempt.result ? attempt.result : null
    if (result) {
      consecutiveFailures = 0
      const refreshIntervalMs = Number.isFinite(settings.refreshIntervalMs) && settings.refreshIntervalMs > 0
        ? Math.max(1000, settings.refreshIntervalMs)
        : MIN_CALL_INTERVAL_MS
      nextAllowedAt = now + refreshIntervalMs
      lastFailure = ''
      return result
    }
    lastFailure = attempt && attempt.reason ? attempt.reason : 'credential-unavailable'
    consecutiveFailures += 1
    const retryDelay = FAILURE_RETRY_DELAYS_MS[consecutiveFailures - 1] || FAILURE_COOLDOWN_MS
    if (attempt && (attempt.status === 401 || attempt.status === 403)) nextAllowedAt = Number.MAX_SAFE_INTEGER
    else if (attempt && attempt.status === 429 && Number.isFinite(attempt.retryAt) && attempt.retryAt > now) nextAllowedAt = attempt.retryAt
    else nextAllowedAt = now + retryDelay
    return null
  }

  return {
    read,
    diagnostics: () => ({ lastAttemptAt, consecutiveFailures, nextAllowedAt, lastFailure }),
    reset: () => { lastAttemptAt = 0; consecutiveFailures = 0; nextAllowedAt = 0; lastFailure = ''; credentialFingerprint = '' }
  }
}

module.exports = {
  USAGE_ENDPOINT,
  OAUTH_BETA_HEADER,
  ANTHROPIC_API_VERSION,
  CLAUDE_APP_TOKEN_CACHE_KEY,
  CLAUDE_APP_CONFIG_NAME,
  CLAUDE_APP_SAFE_STORAGE_SERVICE,
  CLAUDE_APP_SAFE_STORAGE_ACCOUNT,
  DEFAULT_MIN_STALE_MS,
  MIN_CALL_INTERVAL_MS,
  FAILURE_RETRY_DELAYS_MS,
  FAILURE_COOLDOWN_MS,
  MAX_RESPONSE_BYTES,
  toRateLimits,
  appTokenCachePath,
  readClaudeAppCredentialFingerprint,
  decryptClaudeAppTokenCache,
  createNodeHttpsFetch,
  withAccessToken,
  createQuotaFallback
}
