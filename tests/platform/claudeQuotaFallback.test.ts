import { describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
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

  it('leaves a fresh primary reading alone', async () => {
    const home = makeHome()
    const fetchImpl = vi.fn()
    const fallback = makeFallback(fetchImpl)
    const result = await fallback.read({
      enabled: true,
      now: NOW,
      primaryUpdatedAt: NOW - 60_000,
      minStaleMs: 10 * 60 * 1000,
      claudeHome: home.claudeHome
    })
    expect(result).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
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
    const fetchImpl = vi.fn(async (url: string, init: { headers: Record<string, string> }) => {
      seenUrl = url
      seenBeta = init.headers['anthropic-beta']
      return okResponse({ five_hour: { used_percentage: 10 } })
    })
    await makeFallback(fetchImpl).read({ enabled: true, now: NOW, primaryUpdatedAt: 0, claudeHome: home.claudeHome })
    expect(seenUrl).toBe(quota.USAGE_ENDPOINT)
    expect(seenBeta).toBe(quota.OAUTH_BETA_HEADER)
  })

  it('does not call anything when no credential can be found', async () => {
    const home = makeHome(false)
    const fetchImpl = vi.fn()
    const fallback = makeFallback(fetchImpl, { execFileSync: () => { throw new Error('no keychain') } })
    expect(await fallback.read({ enabled: true, now: NOW, primaryUpdatedAt: 0, claudeHome: home.claudeHome })).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('accepts the macOS keychain blob shape without returning it', async () => {
    const home = makeHome(false)
    let seenAuthorization = ''
    const fetchImpl = vi.fn(async (_url: string, init: { headers: Record<string, string> }) => {
      seenAuthorization = init.headers.Authorization
      return okResponse({ five_hour: { used_percentage: 10 } })
    })
    const fallback = makeFallback(fetchImpl, {
      platform: 'darwin',
      execFileSync: () => JSON.stringify({ claudeAiOauth: { accessToken: TOKEN } })
    })
    const result = await fallback.read({ enabled: true, now: NOW, primaryUpdatedAt: 0, claudeHome: home.claudeHome })
    expect(seenAuthorization).toBe(`Bearer ${TOKEN}`)
    expect(JSON.stringify(result)).not.toContain(TOKEN)
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
})
