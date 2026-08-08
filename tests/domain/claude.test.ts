import { describe, expect, it } from 'vitest'
import {
  CLAUDE_SHORT_WINDOW_MINUTES,
  CLAUDE_WEEKLY_WINDOW_MINUTES,
  claudePrimaryQuotaWindow,
  claudeReadinessReason,
  claudeResetAtToMs,
  emptyClaudeEnvironment,
  emptyClaudeQuota,
  mergeClaudePlanUsage,
  mergeClaudeQuotaWindows,
  normalizeClaudeQuota,
  quotaNeedsClaudeSupplement,
  staleClaudeQuota
} from '../../src/domain/claude'

const NOW = 1_738_500_000_000

describe('Claude dynamic quota windows', () => {
  it('keeps Fable and future windows with stable labels and order', () => {
    const quota = normalizeClaudeQuota({
      seven_day_fable: { used_percentage: 44, resets_at: 1_738_857_600 },
      monthly_extra: { used_percentage: 20 },
      five_hour: { used_percentage: 35, resets_at: 1_738_425_600 },
      seven_day: { used_percentage: 29, resets_at: 1_738_857_600 }
    }, { updatedAt: NOW })
    expect(quota.windows.map((entry) => entry.key)).toEqual([
      'five_hour', 'seven_day', 'seven_day_fable', 'monthly_extra'
    ])
    expect(quota.windows.map((entry) => entry.label)).toEqual([
      '5 小时限额', '周限额', '周限额 · Fable', 'Monthly extra'
    ])
    expect(quota.windows[2]).toMatchObject({ scope: 'Fable', remainingPercent: 56 })
    expect(quota.short).toMatchObject({ windowMinutes: CLAUDE_SHORT_WINDOW_MINUTES })
    expect(quota.weekly).toMatchObject({ windowMinutes: CLAUDE_WEEKLY_WINDOW_MINUTES })
  })

  it('does not let a scoped weekly impersonate the all-model weekly', () => {
    const quota = normalizeClaudeQuota({
      seven_day_opus: { used_percentage: 90 },
      seven_day: { used_percentage: 10 }
    })
    expect(quota.weekly?.remainingPercent).toBe(90)
    expect(quota.windows.map((entry) => entry.scope)).toEqual(['', 'Opus'])
  })

  it('uses the upstream scoped model display name instead of reconstructing it from the key', () => {
    const quota = normalizeClaudeQuota({
      seven_day_fable_5: {
        used_percentage: 12,
        display_name: 'Fable 5',
        scope: 'Fable 5',
        upstream_type: 'weekly_scoped'
      }
    })
    expect(quota.windows[0]).toMatchObject({
      key: 'seven_day_fable_5',
      scope: 'Fable 5',
      label: '周限额 · Fable 5',
      upstreamType: 'weekly_scoped'
    })
  })

  it('preserves a third window when a newer two-window sample arrives', () => {
    const base = normalizeClaudeQuota({
      five_hour: { used_percentage: 60, resets_at: 1_800_000_000 },
      seven_day: { used_percentage: 20, resets_at: 1_800_600_000 },
      seven_day_fable: { used_percentage: 56, resets_at: 1_800_600_000 }
    }, { updatedAt: 1_000 })
    const merged = mergeClaudePlanUsage(base, {
      at: 2_000,
      fiveHourUsedPercent: 65,
      sevenDayUsedPercent: 29
    }, 1_500)
    expect(merged.windows.map((entry) => entry.key)).toEqual(['five_hour', 'seven_day', 'seven_day_fable'])
    expect(merged.short).toMatchObject({ remainingPercent: 35, resetAt: 1_800_000_000_000 })
    expect(merged.windows[2]).toMatchObject({ remainingPercent: 44, resetAt: 1_800_600_000_000 })
  })

  it('adds missing plain windows beside an existing scoped window', () => {
    const base = normalizeClaudeQuota({
      seven_day_fable: { used_percentage: 56, resets_at: 1_800_600_000 }
    }, { updatedAt: 1_000 })
    const merged = mergeClaudePlanUsage(base, {
      at: 2_000,
      fiveHourUsedPercent: 65,
      sevenDayUsedPercent: 29
    }, 1_500)
    expect(merged.windows.map((entry) => entry.key)).toEqual(['five_hour', 'seven_day', 'seven_day_fable'])
    expect(merged.short).toMatchObject({ remainingPercent: 35, resetAt: null })
    expect(merged.weekly).toMatchObject({ remainingPercent: 71, resetAt: null })
    expect(merged.windows[2]).toMatchObject({ remainingPercent: 44, resetAt: 1_800_600_000_000 })
  })

  it('merges an incomplete supplement by key without erasing prior windows', () => {
    const base = normalizeClaudeQuota({
      five_hour: { used_percentage: 50 },
      seven_day: { used_percentage: 20 },
      seven_day_fable: { used_percentage: 70, resets_at: 1_900_000_000 }
    }, { updatedAt: 1_000 })
    const incoming = normalizeClaudeQuota({
      five_hour: { used_percentage: 40 },
      seven_day: { used_percentage: 10 }
    }, { source: 'usage-api', updatedAt: 2_000 })
    const merged = mergeClaudeQuotaWindows(base, incoming, NOW)
    expect(merged.windows.map((entry) => entry.key)).toEqual(['five_hour', 'seven_day', 'seven_day_fable'])
    expect(merged.windows[2].resetAt).toBe(1_900_000_000_000)
  })

  it('keeps a scoped usage window when a newer primary sample updates only plain windows', () => {
    const base = normalizeClaudeQuota({
      five_hour: { used_percentage: 50, resets_at: 1_800_000_000 },
      seven_day: { used_percentage: 20, resets_at: 1_800_600_000 },
      seven_day_fable: { used_percentage: 70, resets_at: 1_800_600_000 }
    }, { source: 'usage-api', updatedAt: 1_000 })
    const primary = normalizeClaudeQuota({
      five_hour: { used_percentage: 40, resets_at: 1_800_000_100 },
      seven_day: { used_percentage: 10, resets_at: 1_800_600_100 }
    }, { updatedAt: 2_000 })
    const merged = mergeClaudeQuotaWindows(base, primary, NOW)
    expect(merged.windows.map((entry) => entry.key)).toEqual(['five_hour', 'seven_day', 'seven_day_fable'])
    expect(merged.windows.find((entry) => entry.key === 'seven_day_fable')).toMatchObject({
      remainingPercent: 30,
      source: 'usage-api'
    })
  })

  it('requests a completeness supplement for empty, expired or two-window readings', () => {
    expect(quotaNeedsClaudeSupplement(emptyClaudeQuota())).toBe(true)
    expect(quotaNeedsClaudeSupplement(normalizeClaudeQuota({ five_hour: { used_percentage: 1 }, seven_day: { used_percentage: 2 } }))).toBe(true)
    expect(quotaNeedsClaudeSupplement(normalizeClaudeQuota({ seven_day_fable: { used_percentage: 2 } }))).toBe(true)
    expect(quotaNeedsClaudeSupplement(normalizeClaudeQuota({
      five_hour: { used_percentage: 1 },
      seven_day: { used_percentage: 2 },
      seven_day_fable: { used_percentage: 3 }
    }))).toBe(true)
    const complete = normalizeClaudeQuota({
      five_hour: { used_percentage: 1, resets_at: NOW / 1000 + 60 },
      seven_day: { used_percentage: 2, resets_at: NOW / 1000 + 120 },
      seven_day_fable: { used_percentage: 3, resets_at: NOW / 1000 + 120 }
    }, { now: NOW })
    expect(quotaNeedsClaudeSupplement(complete, NOW)).toBe(false)
    expect(quotaNeedsClaudeSupplement(complete, NOW + 121_000)).toBe(true)
  })

  it('normalizes reset shapes, clamps percentages and expires exact windows', () => {
    expect(claudeResetAtToMs(1_738_425_600)).toBe(1_738_425_600_000)
    expect(claudeResetAtToMs('2026-08-06T12:00:00.000Z')).toBe(Date.parse('2026-08-06T12:00:00.000Z'))
    expect(normalizeClaudeQuota({ five_hour: { used_percentage: 140 } }).short?.remainingPercent).toBe(0)
    expect(normalizeClaudeQuota({ five_hour: { used_percentage: -20 } }).short?.remainingPercent).toBe(100)
    const expired = normalizeClaudeQuota({ five_hour: { used_percentage: 10, resets_at: NOW / 1000 - 1 } }, { now: NOW })
    expect(expired.status).toBe('stale')
    expect(expired.short?.resetAt).toBeNull()
    const implausible = normalizeClaudeQuota({ five_hour: { used_percentage: 10, resets_at: NOW / 1000 + 7 * 24 * 60 * 60 } }, { now: NOW })
    expect(implausible).toMatchObject({ status: 'stale', short: { resetAt: null } })
  })

  it('seeds plan history without inventing resets and keeps stale readings', () => {
    const seeded = mergeClaudePlanUsage(emptyClaudeQuota(), {
      at: 2_000,
      fiveHourUsedPercent: 35,
      sevenDayUsedPercent: 29
    }, 2_100)
    expect(seeded.windows.map((entry) => entry.key)).toEqual(['five_hour', 'seven_day'])
    expect(seeded.short).toMatchObject({ remainingPercent: 65, resetAt: null })
    expect(staleClaudeQuota(seeded)).toMatchObject({ status: 'stale' })
    expect(claudePrimaryQuotaWindow(seeded)?.remainingPercent).toBe(65)
  })
})

describe('Claude registration readiness', () => {
  it('keeps setup diagnostics privacy-safe', () => {
    expect(claudeReadinessReason(emptyClaudeEnvironment())).toBe('not-installed')
    const ready = { ...emptyClaudeEnvironment(), installed: true, authenticated: true, homeReady: true, hooks: 'installed' as const }
    expect(claudeReadinessReason(ready)).toBe('ready')
  })
})
