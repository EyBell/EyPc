'use strict'

/**
 * Claude quota fallback.
 *
 * The status line wrapper is the primary source and needs no credentials: it is
 * handed the official `rate_limits` object by Claude Code itself. But it only
 * runs while Claude Code renders, so an idle machine has no fresh reading.
 *
 * This module is the fallback for exactly that gap. It is deliberately:
 *
 *  - opt-in, because it reads an OAuth token (which on macOS prompts for
 *    keychain access) and calls an endpoint Anthropic does not document;
 *  - write-free, never caching, logging or returning the token — the value
 *    exists only inside `withAccessToken` and is overwritten before returning;
 *  - fail-quiet, degrading to "no reading" rather than surfacing an error, so a
 *    changed or withdrawn endpoint can never break the companion.
 */

const USAGE_ENDPOINT = 'https://api.anthropic.com/api/oauth/usage'
const OAUTH_BETA_HEADER = 'oauth-2025-04-20'
const KEYCHAIN_SERVICE = 'Claude Code-credentials'
const REQUEST_TIMEOUT_MS = 8000

/** Minimum age of the primary reading before the fallback is worth attempting. */
const DEFAULT_MIN_STALE_MS = 10 * 60 * 1000
/** Never call more often than this, whatever the caller asks for. */
const MIN_CALL_INTERVAL_MS = 5 * 60 * 1000
/**
 * How many times the cold-start path may try before giving up for this process.
 *
 * Cold start runs without the user opting in, so it must be self-limiting. A
 * denied keychain prompt or a withdrawn endpoint returns the same "no reading"
 * as a transient network failure, and retrying that forever would re-prompt the
 * user indefinitely for a read they never asked for.
 */
const MAX_COLD_START_ATTEMPTS = 3

function readTokenFromCredentialsFile(dependencies, claudeHome) {
  const fs = dependencies.fs
  const path = dependencies.path
  let raw
  try {
    raw = fs.readFileSync(path.join(claudeHome, '.credentials.json'), 'utf8')
  } catch {
    return ''
  }
  try {
    const parsed = JSON.parse(raw)
    const oauth = parsed && typeof parsed === 'object' ? parsed.claudeAiOauth : null
    const token = oauth && typeof oauth.accessToken === 'string' ? oauth.accessToken : ''
    return token
  } catch {
    return ''
  }
}

function readTokenFromKeychain(dependencies) {
  const execFileSync = dependencies.execFileSync
  if (typeof execFileSync !== 'function') return ''
  try {
    const output = execFileSync('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'], {
      timeout: 5000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const trimmed = String(output || '').trim()
    if (!trimmed) return ''
    // macOS stores the whole credentials blob, not a bare token.
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed)
        const oauth = parsed && typeof parsed === 'object' ? parsed.claudeAiOauth : null
        return oauth && typeof oauth.accessToken === 'string' ? oauth.accessToken : ''
      } catch {
        return ''
      }
    }
    return trimmed
  } catch {
    return ''
  }
}

/**
 * Runs `use` with the access token and then drops the reference. The token is
 * never returned to the caller, so it cannot be captured by accident.
 */
function withAccessToken(dependencies, claudeHome, use) {
  const platform = dependencies.platform || process.platform
  let token = platform === 'darwin'
    ? readTokenFromKeychain(dependencies) || readTokenFromCredentialsFile(dependencies, claudeHome)
    : readTokenFromCredentialsFile(dependencies, claudeHome) || readTokenFromKeychain(dependencies)
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
    const used = Number(value.used_percentage ?? value.utilization ?? value.used)
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
  const fiveHour = pick(source.five_hour || source.fiveHour || source.session)
  const sevenDay = pick(source.seven_day || source.sevenDay || source.weekly)
  if (!fiveHour && !sevenDay) return null
  const result = {}
  if (fiveHour) result.five_hour = fiveHour
  if (sevenDay) result.seven_day = sevenDay
  return result
}

function createQuotaFallback(dependencies) {
  const fetchImpl = dependencies.fetch || (typeof fetch === 'function' ? fetch : null)
  let lastAttemptAt = 0
  let coldStartAttempts = 0

  /**
   * Attempts one fallback read.
   *
   * Two callers, one mechanism. `enabled` is the user's opt-in for the periodic
   * idle refresh; `coldStart` is the unconditional first read that only applies
   * while no reading exists at all. Either one may authorize an attempt, and
   * both are bounded — `enabled` by the call interval, `coldStart` by that plus
   * an attempt cap.
   *
   * Returns null for every non-success path — not authorized, rate limited by
   * our own interval, no token, network failure, unexpected shape. The caller
   * treats null as "keep the previous reading", never as an error.
   */
  async function read(options) {
    const settings = options || {}
    const now = Number.isFinite(settings.now) ? settings.now : Date.now()
    const minStaleMs = Number.isFinite(settings.minStaleMs) ? settings.minStaleMs : DEFAULT_MIN_STALE_MS
    const primaryAt = Number.isFinite(settings.primaryUpdatedAt) ? settings.primaryUpdatedAt : 0
    // A cold start is only cold while nothing has ever been read. A caller that
    // still has a cached status line reading is asking for the idle refresh,
    // whatever flag it passed.
    const coldStart = settings.coldStart === true && primaryAt <= 0
    if (settings.enabled !== true && !coldStart) return null
    if (coldStart && settings.enabled !== true && coldStartAttempts >= MAX_COLD_START_ATTEMPTS) return null
    if (typeof fetchImpl !== 'function') return null
    // The status line is authoritative while it is fresh; only reach for the
    // undocumented endpoint once the primary reading has actually gone stale.
    if (primaryAt > 0 && now - primaryAt < minStaleMs) return null
    if (lastAttemptAt > 0 && now - lastAttemptAt < MIN_CALL_INTERVAL_MS) return null
    lastAttemptAt = now
    if (coldStart) coldStartAttempts += 1

    return withAccessToken(dependencies, settings.claudeHome || '', async (token) => {
      const controller = typeof AbortController === 'function' ? new AbortController() : null
      const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null
      try {
        const response = await fetchImpl(USAGE_ENDPOINT, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'anthropic-beta': OAUTH_BETA_HEADER,
            Accept: 'application/json'
          },
          ...(controller ? { signal: controller.signal } : {})
        })
        if (!response || response.ok !== true) return null
        const payload = await response.json()
        const rateLimits = toRateLimits(payload)
        return rateLimits ? { rateLimits, updatedAt: now, source: 'usage-api' } : null
      } catch {
        return null
      } finally {
        if (timer) clearTimeout(timer)
      }
    })
  }

  return { read, reset: () => { lastAttemptAt = 0; coldStartAttempts = 0 } }
}

module.exports = {
  USAGE_ENDPOINT,
  OAUTH_BETA_HEADER,
  KEYCHAIN_SERVICE,
  DEFAULT_MIN_STALE_MS,
  MIN_CALL_INTERVAL_MS,
  MAX_COLD_START_ATTEMPTS,
  toRateLimits,
  withAccessToken,
  createQuotaFallback
}
