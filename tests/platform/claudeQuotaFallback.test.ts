import { describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { EventEmitter } from 'node:events'
import { createCipheriv, pbkdf2Sync } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import * as fs from 'node:fs'
import * as path from 'node:path'

const require_ = createRequire(import.meta.url)
const quota = require_(resolve(process.cwd(), 'preload/claude/quota.cjs'))

const NOW = 1_785_900_000_000
const TOKEN = 'sk-ant-oat-secret-value'

function makeHome(withCredentials = true) {
  const root = mkdtempSync(join(tmpdir(), 'eypc-claude-quota-'))
  const claudeHome = join(root, '.claude')
  mkdirSync(claudeHome, { recursive: true })
  if (withCredentials) {
    writeFileSync(join(claudeHome, '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: TOKEN } }))
  }
  return { root, claudeHome }
}

function okResponse(payload: unknown) {
  return { ok: true, json: async () => payload }
}

function makeFallback(fetchImpl: unknown, overrides: Record<string, unknown> = {}) {
  return quota.createQuotaFallback({
    fs,
    path,
    platform: 'linux',
    fetch: fetchImpl,
    readClaudeAppAccessToken: () => TOKEN,
    ...overrides
  })
}

describe('fallback stays off unless asked for', () => {
  it('does nothing at all while disabled', async () => {
    const home = makeHome()
    const fetchImpl = vi.fn()
    const fallback = makeFallback(fetchImpl)
    expect(await fallback.read({ enabled: false, now: NOW, claudeHome: home.claudeHome })).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('does not let a fresh partial statusline reading postpone the App authority', async () => {
    const home = makeHome()
    const fetchImpl = vi.fn(async () => okResponse({ five_hour: { used_percentage: 1 } }))
    const fallback = makeFallback(fetchImpl)
    const result = await fallback.read({
      enabled: true,
      now: NOW,
      primaryUpdatedAt: NOW - 60_000,
      minStaleMs: 10 * 60 * 1000,
      claudeHome: home.claudeHome
    })
    expect(result).not.toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('reads once the primary reading has actually gone stale', async () => {
    const home = makeHome()
    const fetchImpl = vi.fn(async () => okResponse({
      five_hour: { used_percentage: 30, resets_at: 1_738_425_600 },
      seven_day: { used_percentage: 60 }
    }))
    const fallback = makeFallback(fetchImpl)
    const result = await fallback.read({
      enabled: true,
      now: NOW,
      primaryUpdatedAt: NOW - 60 * 60 * 1000,
      claudeHome: home.claudeHome
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ updatedAt: NOW, source: 'usage-api' })
    expect(result.rateLimits.five_hour.used_percentage).toBe(30)
    expect(result.rateLimits.seven_day.used_percentage).toBe(60)
  })

  it('reads when there is no primary reading at all', async () => {
    const home = makeHome()
    const fetchImpl = vi.fn(async () => okResponse({ five_hour: { used_percentage: 1 } }))
    const fallback = makeFallback(fetchImpl)
    expect(await fallback.read({ enabled: true, now: NOW, primaryUpdatedAt: 0, claudeHome: home.claudeHome })).not.toBeNull()
  })

  it('rate limits itself regardless of how often it is called', async () => {
    const home = makeHome()
    const fetchImpl = vi.fn(async () => okResponse({ five_hour: { used_percentage: 1 } }))
    const fallback = makeFallback(fetchImpl)
    const args = { enabled: true, primaryUpdatedAt: 0, claudeHome: home.claudeHome }
    await fallback.read({ ...args, now: NOW })
    await fallback.read({ ...args, now: NOW + 1_000 })
    await fallback.read({ ...args, now: NOW + 60_000 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await fallback.read({ ...args, now: NOW + quota.MIN_CALL_INTERVAL_MS + 1 })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('uses the configured quota cadence after a successful App read', async () => {
    const home = makeHome()
    const fetchImpl = vi.fn(async () => okResponse({ five_hour: { used_percentage: 1 } }))
    const fallback = makeFallback(fetchImpl)
    const args = { enabled: true, primaryUpdatedAt: 0, refreshIntervalMs: 60_000, claudeHome: home.claudeHome }
    await fallback.read({ ...args, now: NOW })
    await fallback.read({ ...args, now: NOW + 59_999 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await fallback.read({ ...args, now: NOW + 60_000 })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})

describe('Node 16 HTTPS transport', () => {
  it('does not fall back to a process global fetch', () => {
    const source = String(quota.createQuotaFallback)
    expect(source).not.toContain("typeof fetch === 'function'")
  })

  it('parses a bounded successful response without global fetch', async () => {
    const https = {
      request: (_url: string, _options: unknown, callback: (response: EventEmitter & { statusCode: number }) => void) => {
        const request = new EventEmitter() as EventEmitter & {
          setTimeout: (_ms: number, _listener: () => void) => void
          end: () => void
          destroy: (error?: Error) => void
        }
        request.setTimeout = () => undefined
        request.destroy = (error?: Error) => { if (error) request.emit('error', error) }
        request.end = () => {
          const response = new EventEmitter() as EventEmitter & { statusCode: number }
          response.statusCode = 200
          callback(response)
          queueMicrotask(() => {
            response.emit('data', Buffer.from('{"seven_day_fable":{"used_percentage":46}}'))
            response.emit('end')
          })
        }
        return request
      }
    }
    const transport = quota.createNodeHttpsFetch({ https })
    const response = await transport(quota.USAGE_ENDPOINT, { method: 'GET', headers: {} })
    expect(response.ok).toBe(true)
    expect(await response.json()).toEqual({ seven_day_fable: { used_percentage: 46 } })
  })
})

describe('credentials never escape', () => {
  it('sends the token as a bearer header and returns nothing containing it', async () => {
    const home = makeHome()
    let seenAuthorization = ''
    const fetchImpl = vi.fn(async (_url: string, init: { headers: Record<string, string> }) => {
      seenAuthorization = init.headers.Authorization
      return okResponse({ five_hour: { used_percentage: 10 } })
    })
    const fallback = makeFallback(fetchImpl)
    const result = await fallback.read({ enabled: true, now: NOW, primaryUpdatedAt: 0, claudeHome: home.claudeHome })
    expect(seenAuthorization).toBe(`Bearer ${TOKEN}`)
    expect(JSON.stringify(result)).not.toContain(TOKEN)
    expect(JSON.stringify(result)).not.toContain('sk-ant')
  })

  it('sends the documented beta header to the documented endpoint', async () => {
    const home = makeHome()
    let seenUrl = ''
    let seenBeta = ''
    let seenVersion = ''
    const fetchImpl = vi.fn(async (url: string, init: { headers: Record<string, string> }) => {
      seenUrl = url
      seenBeta = init.headers['anthropic-beta']
      seenVersion = init.headers['anthropic-version']
      return okResponse({ five_hour: { used_percentage: 10 } })
    })
    await makeFallback(fetchImpl).read({ enabled: true, now: NOW, primaryUpdatedAt: 0, claudeHome: home.claudeHome })
    expect(seenUrl).toBe(quota.USAGE_ENDPOINT)
    expect(seenBeta).toBe(quota.OAUTH_BETA_HEADER)
    expect(seenVersion).toBe(quota.ANTHROPIC_API_VERSION)
  })

  it('does not call anything when no credential can be found', async () => {
    const home = makeHome(false)
    const fetchImpl = vi.fn()
    const fallback = makeFallback(fetchImpl, { readClaudeAppAccessToken: () => '' })
    expect(await fallback.read({ enabled: true, now: NOW, primaryUpdatedAt: 0, claudeHome: home.claudeHome })).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('never falls back to the rejected Claude Code keychain credential', async () => {
    const home = makeHome(false)
    let seenAuthorization = ''
    const fetchImpl = vi.fn(async (_url: string, init: { headers: Record<string, string> }) => {
      seenAuthorization = init.headers.Authorization
      return okResponse({ five_hour: { used_percentage: 10 } })
    })
    const fallback = makeFallback(fetchImpl, {
      platform: 'darwin',
      readClaudeAppAccessToken: () => '',
      execFileSync: () => JSON.stringify({ claudeAiOauth: { accessToken: TOKEN } })
    })
    const result = await fallback.read({ enabled: true, now: NOW, primaryUpdatedAt: 0, claudeHome: home.claudeHome })
    expect(seenAuthorization).toBe('')
    expect(result).toBeNull()
    expect(JSON.stringify(result)).not.toContain(TOKEN)
  })
})

describe('Claude App encrypted credential authority', () => {
  function appFallback(cache: unknown, fetchImpl: unknown, config: Record<string, unknown> = {}) {
    const root = mkdtempSync(join(tmpdir(), 'eypc-claude-app-quota-'))
    const appRoot = join(root, 'Claude')
    mkdirSync(appRoot, { recursive: true })
    const encoded = Buffer.from(JSON.stringify(cache)).toString('base64')
    writeFileSync(join(appRoot, quota.CLAUDE_APP_CONFIG_NAME), JSON.stringify({
      ...config,
      [quota.CLAUDE_APP_TOKEN_CACHE_KEY]: encoded
    }))
    return quota.createQuotaFallback({
      fs,
      path,
      platform: 'linux',
      claudeAppDataRoot: appRoot,
      safeStorage: { decryptString: (value: Buffer) => value.toString('utf8') },
      fetch: fetchImpl
    })
  }

  it('uses the only unexpired Claude App token inside the request closure', async () => {
    let authorization = ''
    const fetchImpl = vi.fn(async (_url: string, init: { headers: Record<string, string> }) => {
      authorization = init.headers.Authorization
      return okResponse({ five_hour: { used_percentage: 10 } })
    })
    const fallback = appFallback({
      account: { token: TOKEN, expiresAt: NOW + 60_000 },
      expired: { token: 'expired-secret', expiresAt: NOW - 1 }
    }, fetchImpl)
    const result = await fallback.read({ enabled: true, now: NOW, primaryUpdatedAt: 0 })
    expect(authorization).toBe(`Bearer ${TOKEN}`)
    expect(JSON.stringify(result)).not.toContain(TOKEN)
  })

  it('fails closed when multiple live accounts cannot be uniquely matched', async () => {
    const fetchImpl = vi.fn()
    const fallback = appFallback({
      first: { token: 'first-secret', expiresAt: NOW + 60_000 },
      second: { token: 'second-secret', expiresAt: NOW + 60_000 }
    }, fetchImpl)
    expect(await fallback.read({ enabled: true, now: NOW, primaryUpdatedAt: 0 })).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('matches an explicit active organization when several accounts are live', async () => {
    let authorization = ''
    const fetchImpl = vi.fn(async (_url: string, init: { headers: Record<string, string> }) => {
      authorization = init.headers.Authorization
      return okResponse({ five_hour: { used_percentage: 10 } })
    })
    const fallback = appFallback({
      activeOrganizationId: 'org-a',
      tokens: {
        'client:org-a': { token: TOKEN, expiresAt: NOW + 60_000 },
        'client:org-b': { token: 'other-secret', expiresAt: NOW + 60_000 }
      }
    }, fetchImpl)
    await fallback.read({ enabled: true, now: NOW, primaryUpdatedAt: 0 })
    expect(authorization).toBe(`Bearer ${TOKEN}`)
  })

  it('chooses the unique least-privileged scope when one organization has several live scopes', async () => {
    let authorization = ''
    const fetchImpl = vi.fn(async (_url: string, init: { headers: Record<string, string> }) => {
      authorization = init.headers.Authorization
      return okResponse({ five_hour: { used_percentage: 10 } })
    })
    const fallback = appFallback({
      'desktop:org-a:https://api.anthropic.com:user:profile': {
        token: TOKEN, expiresAt: NOW + 60_000
      },
      'code:org-a:https://api.anthropic.com:user:inference user:profile user:sessions:claude_code': {
        token: 'code-capable-secret', expiresAt: NOW + 60_000
      }
    }, fetchImpl, { lastKnownAccountUuid: 'account-not-present-in-v2-records' })
    await fallback.read({ enabled: true, now: NOW, primaryUpdatedAt: 0 })
    expect(authorization).toBe(`Bearer ${TOKEN}`)
  })

  it('decrypts the Claude-specific macOS v10 cache with a bounded Keychain read', async () => {
    const root = mkdtempSync(join(tmpdir(), 'eypc-claude-app-quota-macos-'))
    const appRoot = join(root, 'Claude')
    mkdirSync(appRoot, { recursive: true })
    const password = Buffer.from('fixture-safe-storage-password')
    const key = pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1')
    const cipher = createCipheriv('aes-128-cbc', key, Buffer.alloc(16, 32))
    const plaintext = Buffer.from(JSON.stringify({
      'desktop:org-a:https://api.anthropic.com:user:profile': { token: TOKEN, expiresAt: NOW + 60_000 }
    }))
    const encrypted = Buffer.concat([Buffer.from('v10'), cipher.update(plaintext), cipher.final()])
    writeFileSync(join(appRoot, quota.CLAUDE_APP_CONFIG_NAME), JSON.stringify({
      [quota.CLAUDE_APP_TOKEN_CACHE_KEY]: encrypted.toString('base64')
    }))
    let authorization = ''
    const execFileSync = vi.fn(() => Buffer.from(`${password.toString('utf8')}\n`))
    const fallback = quota.createQuotaFallback({
      fs,
      path,
      platform: 'darwin',
      claudeAppDataRoot: appRoot,
      execFileSync,
      fetch: async (_url: string, init: { headers: Record<string, string> }) => {
        authorization = init.headers.Authorization
        return okResponse({ five_hour: { used_percentage: 10 } })
      }
    })
    await fallback.read({ enabled: true, now: NOW, primaryUpdatedAt: 0 })
    expect(authorization).toBe(`Bearer ${TOKEN}`)
    expect(execFileSync).toHaveBeenCalledWith('/usr/bin/security', [
      'find-generic-password', '-w', '-s', quota.CLAUDE_APP_SAFE_STORAGE_SERVICE,
      '-a', quota.CLAUDE_APP_SAFE_STORAGE_ACCOUNT
    ], expect.objectContaining({ timeout: 5000 }))
  })

  it('fails closed when an advertised active account does not match any cached account', async () => {
    const fetchImpl = vi.fn()
    const fallback = appFallback({
      only: { token: TOKEN, expiresAt: NOW + 60_000, accountUuid: 'account-a' }
    }, fetchImpl, { lastKnownAccountUuid: 'account-b' })
    expect(await fallback.read({ enabled: true, now: NOW, primaryUpdatedAt: 0 })).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('every failure degrades quietly', () => {
  const home = makeHome()
  const base = { enabled: true, now: NOW, primaryUpdatedAt: 0 }

  it('returns null on a non-ok response', async () => {
    const fallback = makeFallback(async () => ({ ok: false, json: async () => ({}) }))
    expect(await fallback.read({ ...base, claudeHome: home.claudeHome })).toBeNull()
  })

  it('returns null when the request throws', async () => {
    const fallback = makeFallback(async () => { throw new Error('network down') })
    expect(await fallback.read({ ...base, claudeHome: home.claudeHome })).toBeNull()
  })

  it('returns null when the body is not valid json', async () => {
    const fallback = makeFallback(async () => ({ ok: true, json: async () => { throw new Error('bad json') } }))
    expect(await fallback.read({ ...base, claudeHome: home.claudeHome })).toBeNull()
  })

  it('returns null when the shape carries no usable window', async () => {
    const fallback = makeFallback(async () => okResponse({ something: 'else' }))
    expect(await fallback.read({ ...base, claudeHome: home.claudeHome })).toBeNull()
  })

  it('returns null when fetch is unavailable in the host', async () => {
    const fallback = makeFallback(undefined)
    expect(await fallback.read({ ...base, claudeHome: home.claudeHome })).toBeNull()
  })

  it('waits for a credential change after 401 instead of polling the rejected token', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401, headers: { get: () => '' }, json: async () => ({}) }))
    const fallback = makeFallback(fetchImpl)
    await fallback.read({ ...base, claudeHome: home.claudeHome })
    await fallback.read({ ...base, now: NOW + 24 * 60 * 60 * 1000, claudeHome: home.claudeHome })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fallback.diagnostics().lastFailure).toBe('http-401')
  })

  it('honours Retry-After for 429 responses', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 429, headers: { get: () => '120' }, json: async () => ({}) }))
    const fallback = makeFallback(fetchImpl)
    await fallback.read({ ...base, claudeHome: home.claudeHome })
    await fallback.read({ ...base, now: NOW + 119_000, claudeHome: home.claudeHome })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await fallback.read({ ...base, now: NOW + 120_000, claudeHome: home.claudeHome })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})

describe('response mapping', () => {
  it('accepts the nested rate_limits envelope as well as a bare object', () => {
    expect(quota.toRateLimits({ rate_limits: { five_hour: { used_percentage: 20 } } })?.five_hour.used_percentage).toBe(20)
    expect(quota.toRateLimits({ five_hour: { used_percentage: 20 } })?.five_hour.used_percentage).toBe(20)
  })

  it('accepts the alternative field spellings the endpoint has used', () => {
    const mapped = quota.toRateLimits({ session: { utilization: 40 }, weekly: { used: 15 } })
    expect(mapped?.five_hour.used_percentage).toBe(40)
    expect(mapped?.seven_day.used_percentage).toBe(15)
  })

  it('converts an ISO reset timestamp into epoch seconds', () => {
    const mapped = quota.toRateLimits({ five_hour: { used_percentage: 1, resets_at: '2026-08-05T12:00:00.000Z' } })
    expect(mapped?.five_hour.resets_at).toBe(Math.round(Date.parse('2026-08-05T12:00:00.000Z') / 1000))
  })

  it('omits a reset it cannot understand rather than inventing one', () => {
    expect(quota.toRateLimits({ five_hour: { used_percentage: 1, resets_at: 'soon' } })?.five_hour.resets_at).toBeUndefined()
  })

  it('rejects a payload with no numeric usage', () => {
    expect(quota.toRateLimits({ five_hour: { used_percentage: 'lots' } })).toBeNull()
    expect(quota.toRateLimits(null)).toBeNull()
  })

  it('keeps a window that is present and drops one that is not', () => {
    const mapped = quota.toRateLimits({ five_hour: { used_percentage: 3 }, seven_day: null })
    expect(mapped).toEqual({ five_hour: { used_percentage: 3 } })
  })

  it('keeps every declared model-scoped window without a model allowlist', () => {
    const mapped = quota.toRateLimits({
      five_hour: { used_percentage: 3 },
      seven_day: { used_percentage: 4 },
      seven_day_fable: { used_percentage: 5 },
      seven_day_future_model: { used_percentage: 6 }
    })
    expect(Object.keys(mapped || {})).toEqual([
      'five_hour', 'seven_day', 'seven_day_fable', 'seven_day_future_model'
    ])
  })

  it('does not project spend metadata as a quota window', () => {
    const mapped = quota.toRateLimits({
      five_hour: { utilization: 2 },
      spend: { used: 0, limit: 100 }
    })
    expect(mapped).toEqual({ five_hour: { used_percentage: 2 } })
  })

  it('maps the App limits array and preserves the upstream Fable display name', () => {
    const mapped = quota.toRateLimits({
      limits: [
        { type: 'session', utilization: 20, resets_at: '2026-08-07T12:00:00.000Z' },
        { type: 'weekly_all', utilization: 30, resets_at: '2026-08-10T12:00:00.000Z' },
        { type: 'weekly_scoped', utilization: 40, resets_at: '2026-08-10T12:00:00.000Z', model: { display_name: 'Fable' } }
      ]
    })
    expect(Object.keys(mapped || {})).toEqual(['five_hour', 'seven_day', 'seven_day_fable'])
    expect(mapped?.seven_day_fable).toMatchObject({
      used_percentage: 40,
      display_name: 'Fable',
      scope: 'Fable',
      upstream_type: 'weekly_scoped'
    })
  })

  it('maps the current App kind/percent/nested-scope limits shape', () => {
    const mapped = quota.toRateLimits({
      limits: [
        { kind: 'session', percent: 20, resets_at: '2026-08-07T12:00:00.000Z', scope: null },
        { kind: 'weekly_all', percent: 30, resets_at: '2026-08-10T12:00:00.000Z', scope: null },
        {
          kind: 'weekly_scoped',
          percent: 40,
          resets_at: '2026-08-10T12:00:00.000Z',
          scope: { model: { id: 'redacted-upstream-id', display_name: 'Fable' }, surface: null }
        }
      ]
    })
    expect(Object.keys(mapped || {})).toEqual(['five_hour', 'seven_day', 'seven_day_fable'])
    expect(mapped?.seven_day_fable).toMatchObject({
      used_percentage: 40,
      display_name: 'Fable',
      upstream_type: 'weekly_scoped'
    })
  })

  it('uses a stable scoped key for a future non-ASCII model display name', () => {
    const payload = { limits: [{ type: 'weekly_scoped', display_name: '模型甲', utilization: 25 }] }
    const first = quota.toRateLimits(payload)
    const key = Object.keys(first || {})[0]
    expect(key).toMatch(/^seven_day_scope_[0-9a-f]{8}$/)
    expect(quota.toRateLimits(payload)).toHaveProperty(key)
  })
})

describe('authorization gate and retry schedule', () => {
  /**
   * The status line is credential-free but only runs while Claude Code renders.
   * Until it has run once there is nothing to show at all, so one usage-API read
   * is worth a single prompt — but it must never become a standing periodic read
   * behind the user's back, which is what the opt-in switch is still for.
   */
  it('does not bypass the access gate on cold start', async () => {
    const home = makeHome()
    const fetchImpl = vi.fn(async () => okResponse({ five_hour: { used_percentage: 30 } }))
    const fallback = makeFallback(fetchImpl)
    const result = await fallback.read({
      enabled: false,
      coldStart: true,
      now: NOW,
      primaryUpdatedAt: 0,
      claudeHome: home.claudeHome
    })
    expect(result).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('does not bypass the access gate when a stale status-line reading exists', async () => {
    const home = makeHome()
    const fetchImpl = vi.fn()
    const fallback = makeFallback(fetchImpl)
    const result = await fallback.read({
      enabled: false,
      coldStart: true,
      now: NOW,
      // A cached reading means the status line has run: this is idle drift, and
      // idle drift is the user's decision, not ours.
      primaryUpdatedAt: NOW - 24 * 60 * 60 * 1000,
      minStaleMs: 10 * 60 * 1000,
      claudeHome: home.claudeHome
    })
    expect(result).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('backs off at 1m, 5m, 15m and then one hour after failures', async () => {
    const home = makeHome()
    const fetchImpl = vi.fn(async () => ({ ok: false, json: async () => ({}) }))
    const fallback = makeFallback(fetchImpl)
    const attempt = (now: number) => fallback.read({
      enabled: true,
      coldStart: true,
      now,
      primaryUpdatedAt: 0,
      claudeHome: home.claudeHome
    })
    expect(await attempt(NOW)).toBeNull()
    expect(await attempt(NOW + 59_000)).toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(await attempt(NOW + 60_000)).toBeNull()
    expect(await attempt(NOW + 60_000 + 5 * 60_000)).toBeNull()
    expect(await attempt(NOW + 60_000 + 5 * 60_000 + 15 * 60_000)).toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(4)
    const hourlyAt = NOW + 60_000 + 5 * 60_000 + 15 * 60_000
    await attempt(hourlyAt + 59 * 60_000)
    expect(fetchImpl).toHaveBeenCalledTimes(4)
    await attempt(hourlyAt + quota.FAILURE_COOLDOWN_MS)
    expect(fetchImpl).toHaveBeenCalledTimes(5)
  })

  it('still respects the minimum call interval on the cold path', async () => {
    const home = makeHome()
    const fetchImpl = vi.fn(async () => okResponse({ five_hour: { used_percentage: 30 } }))
    const fallback = makeFallback(fetchImpl)
    const options = { enabled: true, coldStart: true, primaryUpdatedAt: 0, claudeHome: home.claudeHome }
    expect(await fallback.read({ ...options, now: NOW })).not.toBeNull()
    expect(await fallback.read({ ...options, now: NOW + 60_000 })).toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('releases failure backoff on reset, so re-enabling can try immediately', async () => {
    const home = makeHome()
    const fetchImpl = vi.fn(async () => null)
    const fallback = makeFallback(fetchImpl)
    const options = { enabled: true, coldStart: true, primaryUpdatedAt: 0, claudeHome: home.claudeHome }
    expect(await fallback.read({ ...options, now: NOW })).toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await fallback.read({ ...options, now: NOW + 10_000 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    fallback.reset()
    await fallback.read({ ...options, now: NOW + 10_001 })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('supplements a fresh two-window cache automatically under the same backoff', async () => {
    const home = makeHome()
    const fetchImpl = vi.fn(async () => ({ ok: false }))
    const fallback = makeFallback(fetchImpl)
    const attempt = (now: number) => fallback.read({
      enabled: true,
      coldStart: false,
      supplement: true,
      now,
      // Deliberately fresh: supplement completeness, not staleness, authorizes
      // the read.
      primaryUpdatedAt: NOW,
      minStaleMs: 24 * 60 * 60 * 1000,
      claudeHome: home.claudeHome
    })
    expect(await attempt(NOW)).toBeNull()
    expect(await attempt(NOW + 30_000)).toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(await attempt(NOW + quota.FAILURE_RETRY_DELAYS_MS[0])).toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})

describe('manual refresh from a quota reading', () => {
  const home = makeHome()
  const base = { enabled: true, primaryUpdatedAt: 0 }

  it('skips the post-success cadence only when asked to', async () => {
    const fetchImpl = vi.fn(async () => okResponse({ five_hour: { used_percentage: 10 } }))
    const fallback = makeFallback(fetchImpl)
    expect(await fallback.read({ ...base, now: NOW, refreshIntervalMs: 300_000, claudeHome: home.claudeHome })).not.toBeNull()
    expect(await fallback.read({ ...base, now: NOW + 1_000, refreshIntervalMs: 300_000, claudeHome: home.claudeHome })).toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fallback.diagnostics().nextAllowedReason).toBe('interval')
    expect(await fallback.read({ ...base, now: NOW + 2_000, refreshIntervalMs: 300_000, force: true, claudeHome: home.claudeHome })).not.toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('retries through the generic failure backoff', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500, headers: { get: () => '' }, json: async () => ({}) }))
    const fallback = makeFallback(fetchImpl)
    await fallback.read({ ...base, now: NOW, claudeHome: home.claudeHome })
    expect(fallback.diagnostics().nextAllowedReason).toBe('backoff')
    await fallback.read({ ...base, now: NOW + 1_000, claudeHome: home.claudeHome })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await fallback.read({ ...base, now: NOW + 2_000, force: true, claudeHome: home.claudeHome })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('never overrides a 429 Retry-After', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 429, headers: { get: () => '120' }, json: async () => ({}) }))
    const fallback = makeFallback(fetchImpl)
    await fallback.read({ ...base, now: NOW, claudeHome: home.claudeHome })
    await fallback.read({ ...base, now: NOW + 1_000, force: true, claudeHome: home.claudeHome })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fallback.diagnostics()).toMatchObject({ nextAllowedReason: 'retry-after', lastFailure: 'http-429' })
  })

  it('never retries a rejected credential', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401, headers: { get: () => '' }, json: async () => ({}) }))
    const fallback = makeFallback(fetchImpl)
    await fallback.read({ ...base, now: NOW, claudeHome: home.claudeHome })
    await fallback.read({ ...base, now: NOW + 60 * 60 * 1000, force: true, claudeHome: home.claudeHome })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fallback.diagnostics().nextAllowedReason).toBe('credential')
  })
})
