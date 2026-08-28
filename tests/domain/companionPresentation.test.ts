import { describe, expect, it } from 'vitest'
import {
  buildClaudeQuotaSection,
  buildCompanionQuotaStrip,
  claudeRealtimeGapNote,
  claudeRegistrationRows,
  claudeSetupHint,
  claudeSourceStatusText,
  cursorSourceStatusText,
  companionQuotaChipAriaLabel,
  companionQuotaChipHint,
  companionQuotaFreshnessText,
  companionResetDetailText,
  companionSearchAlertText,
  companionSearchHintOverlaps,
  companionSearchIconHint,
  companionSearchMetaText,
  companionSearchPlaceholder,
  placeFloatActionHint,
  COMPANION_SEARCH_PLACEHOLDER,
  COMPANION_SEARCH_STALE_ALERT,
  resolveCompanionProjectMarker,
  resolveCompanionRowMarker,
  resolveCompanionWaterBallPresentation,
  type CompanionCodexQuotaWindow,
  type CompanionSnapshotSlice
} from '../../src/domain/companionPresentation'
import { emptyClaudeEnvironment, emptyClaudeQuota, normalizeClaudeQuota } from '../../src/domain/claude'

const READY_ENVIRONMENT = {
  ...emptyClaudeEnvironment(),
  installed: true,
  homeReady: true,
  authenticated: true,
  cliVersion: '2.1.220',
  hooks: 'installed' as const,
  statusline: 'installed' as const
}

function slice(patch: Partial<CompanionSnapshotSlice> = {}): CompanionSnapshotSlice {
  return {
    providers: { codex: true, claude: true, cursor: false },
    claudeQuota: normalizeClaudeQuota({ five_hour: { used_percentage: 30 }, seven_day: { used_percentage: 55 } }),
    claudeEnvironment: READY_ENVIRONMENT,
    ...patch
  }
}

describe('water ball presentation', () => {
  it('does not override anything in codex-only compatibility mode', () => {
    const result = resolveCompanionWaterBallPresentation(slice({ providers: { codex: true, claude: false, cursor: false } }))
    expect(result.percentOverride).toBeNull()
    expect(result.ariaSuffix).toBe('')
    expect(result.mapping.compatibility).toBe(true)
  })

  it('returns the compatibility result for a missing slice', () => {
    expect(resolveCompanionWaterBallPresentation(null).percentOverride).toBeNull()
    expect(resolveCompanionWaterBallPresentation(undefined).mapping.percent).toBe('codex')
  })

  it('puts the claude percentage in the centre while both providers are live', () => {
    const result = resolveCompanionWaterBallPresentation(slice())
    expect(result.mapping).toMatchObject({ liquid: 'codex', ring: 'codex', percent: 'claude' })
    // The centre reads the plain weekly window (55% used), not the 5-hour one.
    expect(result.percentOverride).toBe(45)
    expect(result.percentProviderLabel).toBe('Claude')
    expect(result.ariaSuffix).toBe('，Claude 剩余 45%')
  })

  it('falls back to the legacy rendering while claude is not installed', () => {
    const result = resolveCompanionWaterBallPresentation(slice({ claudeEnvironment: emptyClaudeEnvironment() }))
    expect(result.percentOverride).toBeNull()
    expect(result.mapping.compatibility).toBe(true)
  })

  it('still shows a real reading from a degraded provider', () => {
    // Hook registration governs task state, not quota: once a genuine reading
    // exists, hiding it would be less useful than showing it.
    const result = resolveCompanionWaterBallPresentation(slice({
      claudeEnvironment: { ...READY_ENVIRONMENT, hooks: 'missing' }
    }))
    expect(result.percentOverride).toBe(45)
  })

  it('falls back to the legacy rendering while claude has no quota reading yet', () => {
    const result = resolveCompanionWaterBallPresentation(slice({ claudeQuota: emptyClaudeQuota() }))
    expect(result.percentOverride).toBeNull()
    expect(result.percentProviderLabel).toBe('')
  })

  it('lets claude own the whole ball when it is the only enabled provider', () => {
    const result = resolveCompanionWaterBallPresentation(slice({ providers: { codex: false, claude: true, cursor: false } }))
    expect(result.mapping).toMatchObject({ liquid: 'claude', ring: 'claude', percent: 'claude' })
    expect(result.percentOverride).toBe(45)
  })

  it('rounds and clamps the displayed percentage', () => {
    const result = resolveCompanionWaterBallPresentation(slice({
      claudeQuota: normalizeClaudeQuota({ seven_day: { used_percentage: 33.33 } })
    }))
    expect(result.percentOverride).toBe(67)
  })

  it('reads the plain weekly window rather than a scoped one', () => {
    const result = resolveCompanionWaterBallPresentation(slice({
      claudeQuota: normalizeClaudeQuota({
        five_hour: { used_percentage: 30 },
        seven_day: { used_percentage: 10 },
        seven_day_opus: { used_percentage: 80 }
      })
    }))
    expect(result.percentOverride).toBe(90)
  })

  it('falls back to the 5-hour window when the weekly window is absent', () => {
    const result = resolveCompanionWaterBallPresentation(slice({
      claudeQuota: normalizeClaudeQuota({ five_hour: { used_percentage: 30 } })
    }))
    expect(result.percentOverride).toBe(70)
  })

  it('pairs the Fable weekly with the plain one when the account reports both', () => {
    const result = resolveCompanionWaterBallPresentation(slice({
      claudeQuota: normalizeClaudeQuota({
        five_hour: { used_percentage: 30 },
        seven_day: { used_percentage: 55 },
        seven_day_fable: { used_percentage: 21 }
      })
    }))
    // Centre reads `79/45`: Fable first, plain weekly second, no unit.
    expect(result.scopedPercent).toBe(79)
    expect(result.percentOverride).toBe(45)
    expect(result.scopedLabel).toBe('Fable')
    expect(result.ariaSuffix).toBe('，Claude Fable周限额剩余 79%，普通周限额剩余 45%')
  })

  it('prefers the Fable weekly over another scoped weekly in the leading position', () => {
    const result = resolveCompanionWaterBallPresentation(slice({
      claudeQuota: normalizeClaudeQuota({
        seven_day: { used_percentage: 55 },
        seven_day_opus: { used_percentage: 90 },
        seven_day_fable_5: { used_percentage: 21, display_name: 'Fable 5' }
      })
    }))
    expect(result.scopedPercent).toBe(79)
    expect(result.scopedLabel).toBe('Fable 5')
  })

  it('stays a single percentage while the account reports no scoped weekly', () => {
    const result = resolveCompanionWaterBallPresentation(slice())
    expect(result.scopedPercent).toBeNull()
    expect(result.scopedLabel).toBe('')
    expect(result.ariaSuffix).toBe('，Claude 剩余 45%')
  })

  it('never pairs a scoped weekly with the 5-hour fallback', () => {
    // Two different window lengths behind one slash would read as one comparison.
    const result = resolveCompanionWaterBallPresentation(slice({
      claudeQuota: normalizeClaudeQuota({
        five_hour: { used_percentage: 30 },
        seven_day_fable: { used_percentage: 21 }
      })
    }))
    expect(result.percentOverride).toBe(70)
    expect(result.scopedPercent).toBeNull()
  })

  it('keeps the pair out of every compatibility path', () => {
    expect(resolveCompanionWaterBallPresentation(null).scopedPercent).toBeNull()
    expect(resolveCompanionWaterBallPresentation(slice({
      providers: { codex: true, claude: false, cursor: false },
      claudeQuota: normalizeClaudeQuota({
        seven_day: { used_percentage: 55 },
        seven_day_fable: { used_percentage: 21 }
      })
    })).scopedPercent).toBeNull()
    expect(resolveCompanionWaterBallPresentation(slice({
      claudeEnvironment: emptyClaudeEnvironment(),
      claudeQuota: normalizeClaudeQuota({
        seven_day: { used_percentage: 55 },
        seven_day_fable: { used_percentage: 21 }
      })
    })).scopedPercent).toBeNull()
  })
})

describe('row markers', () => {
  it.each([
    ['Codex', { provider: 'codex' as const }, { provider: 'codex', label: '归属 Codex', tooltip: '归属 Codex' }],
    ['Claude', { provider: 'claude' as const }, { provider: 'claude', label: '归属 Claude', tooltip: '归属 Claude' }],
    ['Cursor', { provider: 'cursor' as const }, { provider: 'cursor', label: '归属 Cursor', tooltip: '归属 Cursor' }],
    ['legacy Codex', {}, { provider: 'codex', label: '归属 Codex', tooltip: '归属 Codex' }]
  ])('always exposes one textual owner cue for %s cards', (_name, task, expected) => {
    expect(resolveCompanionRowMarker(task)).toEqual(expected)
  })

  it('returns null for a missing task', () => {
    expect(resolveCompanionRowMarker(null)).toBeNull()
  })

  it.each([
    ['Codex', { providers: ['codex' as const] }, { label: '归属 Codex', className: 'provider-codex', claudeOnly: false }],
    ['Claude', { providers: ['claude' as const] }, { label: '归属 Claude', className: 'provider-claude', claudeOnly: true }],
    ['shared', { providers: ['claude' as const, 'codex' as const] }, { label: '归属 Codex + Claude', className: 'provider-shared', claudeOnly: false }],
    ['Cursor', { providers: ['cursor' as const] }, { label: '归属 Cursor', className: 'provider-cursor', claudeOnly: false }],
    ['legacy empty', {}, { label: '归属 Codex', className: 'provider-codex', claudeOnly: false }]
  ])('resolves one reusable %s project marker', (_name, project, expected) => {
    expect(resolveCompanionProjectMarker(project)).toMatchObject(expected)
  })

  it('derives a legacy project provider from its tasks', () => {
    expect(resolveCompanionProjectMarker({ tasks: [{ provider: 'claude' }] }))
      .toMatchObject({ providers: ['claude'], label: '归属 Claude', claudeOnly: true })
  })

  it('describes Cursor cold-inventory source status without quota language', () => {
    expect(cursorSourceStatusText({ enabled: false, available: true, sessionCount: 3 })).toBe('关闭时不读取任何 Cursor 数据')
    expect(cursorSourceStatusText({ enabled: true, available: false, sessionCount: 0 })).toBe('本机 Cursor 状态库不可读')
    expect(cursorSourceStatusText({ enabled: true, available: false, reason: 'not-installed', sessionCount: 0 })).toBe('本机未找到 Cursor 状态库')
    expect(cursorSourceStatusText({ enabled: true, available: false, reason: 'sqlite-unavailable', sessionCount: 0 })).toBe('当前 uTools 不能用内置 Node 读 Cursor 库')
    expect(cursorSourceStatusText({ enabled: true, available: true, sessionCount: 2 })).toBe('已接入 2 条本机 Agent')
    expect(cursorSourceStatusText({ enabled: true, available: true, sessionCount: 2, hooks: 'missing' })).toBe('已接入 2 条本机 Agent · 钩子未注册')
  })
})

describe('claude quota section', () => {
  it('is absent entirely while the provider is disabled', () => {
    expect(buildClaudeQuotaSection(slice({ providers: { codex: true, claude: false, cursor: false } }))).toBeNull()
    expect(buildClaudeQuotaSection(null)).toBeNull()
  })

  it('lists both windows with their reset times', () => {
    const section = buildClaudeQuotaSection(slice())
    expect(section?.rows.map((row) => row.key)).toEqual(['claude-five_hour', 'claude-seven_day'])
    expect(section?.rows[0]).toMatchObject({ label: '5 小时限额', remainingPercent: 70 })
    expect(section?.emptyReason).toBe('')
  })

  it('lists a per-model weekly as its own row, in payload-independent order', () => {
    const section = buildClaudeQuotaSection(slice({
      claudeQuota: normalizeClaudeQuota({
        seven_day_fable: { used_percentage: 56 },
        five_hour: { used_percentage: 65 },
        seven_day: { used_percentage: 71 }
      }, { updatedAt: 1 })
    }))
    expect(section?.rows.map((row) => row.label)).toEqual(['5 小时限额', '周限额', '周限额 · Fable'])
    expect(section?.rows.map((row) => row.shortLabel)).toEqual(['5h', '周', '周·Fable'])
  })

  it('explains an unusable provider instead of showing empty rows', () => {
    const section = buildClaudeQuotaSection(slice({ claudeEnvironment: emptyClaudeEnvironment() }))
    expect(section?.rows).toEqual([])
    expect(section?.emptyReason).toBe('未检测到 Claude Code')
  })

  it('still presents App-authorized quota when Claude Code readiness is unavailable', () => {
    const input = slice({
      claudeEnvironment: emptyClaudeEnvironment(),
      claudeAppQuotaAccess: true,
      claudeQuota: normalizeClaudeQuota({ five_hour: { used_percentage: 30 }, seven_day: { used_percentage: 55 } }, { source: 'usage-api' })
    })
    expect(buildClaudeQuotaSection(input)?.rows).toHaveLength(2)
    expect(resolveCompanionWaterBallPresentation(input).percentOverride).toBe(45)
  })

  it('explains a connected provider that has no reading yet', () => {
    const section = buildClaudeQuotaSection(slice({ claudeQuota: emptyClaudeQuota() }))
    expect(section?.rows).toEqual([])
    expect(section?.emptyReason).toContain('尚未读到额度')
  })

  it('distinguishes credential and Retry-After failures without exposing identities', () => {
    const credential = buildClaudeQuotaSection(slice({
      claudeAppQuotaAccess: true,
      claudeQuota: emptyClaudeQuota(),
      claudeQuotaAccess: { status: 'credential-unavailable', lastAttemptAt: 10, retryAt: 0 }
    }))
    expect(credential?.emptyReason).toBe('Claude App 额度凭据不可用，等待账号凭据更新')
    const rateLimited = buildClaudeQuotaSection(slice({
      claudeAppQuotaAccess: true,
      claudeQuota: emptyClaudeQuota(),
      claudeQuotaAccess: { status: 'rate-limited', lastAttemptAt: 10, retryAt: 20 }
    }))
    expect(rateLimited?.emptyReason).toContain('Retry-After')
  })
})

describe('single-row quota strip', () => {
  const CODEX_WINDOWS: CompanionCodexQuotaWindow[] = [
    { key: 'normal-short', label: '5 小时限额', family: 'normal', window: 'short', remainingPercent: 78, resetAt: 10 },
    { key: 'normal-weekly', label: '周限额', family: 'normal', window: 'weekly', remainingPercent: 23, resetAt: 20 },
    { key: 'codex_bengalfox-weekly', label: 'Spark 周额度', family: 'spark', window: 'weekly', remainingPercent: 52, resetAt: 30 }
  ]

  it('keeps codex-only output free of any provider caption', () => {
    const strip = buildCompanionQuotaStrip(CODEX_WINDOWS, slice({ providers: { codex: true, claude: false, cursor: false } }))
    expect(strip.multiProvider).toBe(false)
    expect(strip.groups).toHaveLength(1)
    expect(strip.groups[0].caption).toBe('')
    expect(strip.groups[0].chips.map((chip) => chip.shortLabel)).toEqual(['5h', '周', 'S周'])
    expect(strip.groups[0].chips.map((chip) => chip.spark)).toEqual([false, false, true])
  })

  it('joins both providers into one ordered strip once claude is enabled', () => {
    const strip = buildCompanionQuotaStrip(CODEX_WINDOWS, slice())
    expect(strip.multiProvider).toBe(true)
    expect(strip.groups.map((group) => group.provider)).toEqual(['codex', 'claude'])
    expect(strip.groups[0].caption).toBe('')
    expect(strip.groups[1].caption).toBe('Claude')
    expect(strip.groups[1].chips.map((chip) => chip.shortLabel)).toEqual(['5h', '周'])
    expect(strip.groups[1].chips.every((chip) => chip.spark === false)).toBe(true)
  })

  /**
   * User decision 2026-08-06: everything visible in the Claude app must be
   * visible here, so a third window becomes a third chip on the same single
   * row rather than being hidden behind the expanded card.
   */
  it('emits one chip per declared window, per-model weekly included', () => {
    const strip = buildCompanionQuotaStrip(CODEX_WINDOWS, slice({
      claudeQuota: normalizeClaudeQuota({
        five_hour: { used_percentage: 65 },
        seven_day: { used_percentage: 71 },
        seven_day_fable: { used_percentage: 56 }
      }, { updatedAt: 1 })
    }))
    expect(strip.groups[1].chips.map((chip) => chip.shortLabel)).toEqual(['5h', '周', '周·Fable'])
    expect(strip.groups[1].chips.map((chip) => chip.remainingPercent)).toEqual([35, 29, 44])
    // Still one Codex group untouched beside it — the row stays one row.
    expect(strip.groups[0].chips.map((chip) => chip.shortLabel)).toEqual(['5h', '周', 'S周'])
  })

  it('drops the codex group entirely when only claude is enabled', () => {
    const strip = buildCompanionQuotaStrip([], slice({ providers: { codex: false, claude: true, cursor: false } }))
    expect(strip.groups.map((group) => group.provider)).toEqual(['claude'])
    expect(strip.multiProvider).toBe(false)
    expect(strip.groups[0].caption).toBe('')
  })

  it('carries a per-group reason instead of an empty row', () => {
    const codexOnly = buildCompanionQuotaStrip([], slice({ providers: { codex: true, claude: false, cursor: false } }))
    expect(codexOnly.groups[0].emptyReason).toBe('服务端未返回额度窗口')
    expect(buildCompanionQuotaStrip([], slice({ providers: { codex: true, claude: false, cursor: false } }), '连接异常').groups[0].emptyReason)
      .toBe('连接异常')

    const unusableClaude = buildCompanionQuotaStrip(CODEX_WINDOWS, slice({ claudeEnvironment: emptyClaudeEnvironment() }))
    expect(unusableClaude.groups[1].chips).toEqual([])
    expect(unusableClaude.groups[1].emptyReason).toBe('未检测到 Claude Code')
  })

  it('names the platform in help only once the row actually mixes providers', () => {
    const chip = buildCompanionQuotaStrip(CODEX_WINDOWS, slice()).groups[1].chips[0]
    expect(companionQuotaChipHint(chip, '3 小时后重置', true)).toBe('Claude · 5 小时限额 · 3 小时后重置')
    expect(companionQuotaChipHint(chip, '3 小时后重置', false)).toBe('5 小时限额 · 3 小时后重置')
    expect(companionQuotaChipHint(chip, '', false)).toBe('5 小时限额')
    expect(companionQuotaChipAriaLabel(chip, '3 小时后重置', true)).toBe('Claude 5 小时限额，剩余 70%，3 小时后重置')
    expect(companionQuotaChipAriaLabel(chip, '', false)).toBe('5 小时限额，剩余 70%')
  })
})

describe('setup hints', () => {
  it('names the first blocking condition and never a path', () => {
    expect(claudeSetupHint(emptyClaudeEnvironment())).toBe('未检测到 Claude Code')
    expect(claudeSetupHint({ ...emptyClaudeEnvironment(), installed: true })).toBe('Claude Code 尚未登录')
    expect(claudeSetupHint({ ...emptyClaudeEnvironment(), installed: true, authenticated: true })).toBe('Claude Code 数据目录不可读')
    expect(claudeSetupHint({ ...READY_ENVIRONMENT, hooks: 'missing' })).toContain('尚未注册事件钩子')
    expect(claudeSetupHint({ ...READY_ENVIRONMENT, hooks: 'outdated' })).toBe('钩子配置已过期，请重新注册')
    expect(claudeSetupHint(READY_ENVIRONMENT)).toBe('')
    expect(claudeSetupHint(null)).toBe('Claude 状态未知')
  })

  it('ranks a missing executable last and says the readings still work', () => {
    // Losing only the jump-back path must not be reported as "Claude Code not
    // detected" while cards and quota are rendering correctly.
    const hint = claudeSetupHint({ ...READY_ENVIRONMENT, installed: false })
    expect(hint).toContain('未找到 claude 可执行文件')
    expect(hint).toContain('状态与额度正常')
    expect(hint).not.toContain('未检测到 Claude Code')
  })

  it('never leaks a filesystem path', () => {
    for (const environment of [
      emptyClaudeEnvironment(),
      { ...READY_ENVIRONMENT, hooks: 'missing' as const },
      { ...READY_ENVIRONMENT, hooks: 'outdated' as const },
      { ...READY_ENVIRONMENT, installed: false }
    ]) {
      expect(claudeSetupHint(environment)).not.toContain('/')
    }
  })
})

describe('reset detail text', () => {
  // GMT+8 wall-time fixtures (user decision 2026-08-06): the display timezone
  // is fixed, so the instants are built via Date.UTC minus the +8 offset and
  // the assertions hold on a runner in any TZ.
  const gmt8 = (month: number, day: number, hour: number, minute: number) =>
    Date.UTC(2026, month - 1, day, hour - 8, minute)
  const base = gmt8(8, 6, 10, 0) // 周四 10:00 GMT+8

  it('is empty without a usable reset timestamp', () => {
    expect(companionResetDetailText(null, base)).toBe('')
    expect(companionResetDetailText(0, base)).toBe('')
    expect(companionResetDetailText(undefined, base)).toBe('')
  })

  it('gives the absolute GMT+8 clock plus a relative distance for the same day', () => {
    expect(companionResetDetailText(gmt8(8, 6, 13, 30), base)).toBe('今天 13:30 重置（约 3 小时后）')
  })

  it('uses minutes below one hour', () => {
    expect(companionResetDetailText(gmt8(8, 6, 10, 25), base)).toBe('今天 10:25 重置（25 分钟后）')
  })

  it('says 明天 across one GMT+8 midnight even within 24 hours', () => {
    expect(companionResetDetailText(gmt8(8, 7, 8, 0), base)).toBe('明天 08:00 重置（约 22 小时后）')
  })

  it('names the weekday for the weekly window', () => {
    expect(companionResetDetailText(gmt8(8, 10, 3, 0), base)).toBe('周一 03:00 重置（3 天后）')
  })

  it('falls back to a calendar date beyond one week', () => {
    expect(companionResetDetailText(gmt8(8, 20, 3, 0), base)).toBe('8月20日 03:00 重置（13 天后）')
  })

  it('reports an already-rolled-over window instead of a past clock time', () => {
    // The ordinary case once Claude Code has not run for a while: the reading
    // is old enough that its reset moment has passed. Stating "今天 09:00 重置
    // （0 分钟后）" would be wrong twice over.
    expect(companionResetDetailText(gmt8(8, 6, 9, 0), base)).toBe('额度窗口已重置 · 等待新读数')
    expect(companionResetDetailText(base, base)).toBe('额度窗口已重置 · 等待新读数')
  })

  it('renders GMT+8 independent of the runner timezone', () => {
    // 2026-08-06 16:00:00Z is 2026-08-07 00:00 GMT+8: the clock must read
    // 00:00 and the day boundary must be GMT+8's, not the runner's.
    const at = Date.UTC(2026, 7, 6, 16, 0)
    expect(companionResetDetailText(at, base)).toBe('明天 00:00 重置（约 14 小时后）')
  })
})

describe('quota freshness text', () => {
  const now = new Date(2026, 7, 6, 10, 0).getTime()

  it('is empty without a snapshot or a fresh unread state', () => {
    expect(companionQuotaFreshnessText(null, now)).toBe('')
    expect(companionQuotaFreshnessText({ status: 'idle', updatedAt: 0 }, now)).toBe('')
  })

  it('reports the reading age', () => {
    expect(companionQuotaFreshnessText({ status: 'ok', updatedAt: now - 12 * 60_000 }, now)).toBe('读数更新于 12 分钟前')
    expect(companionQuotaFreshnessText({ status: 'ok', updatedAt: now - 20_000 }, now)).toBe('读数刚刚更新')
    expect(companionQuotaFreshnessText({ status: 'ok', updatedAt: now - 3 * 3_600_000 }, now)).toBe('读数更新于 3 小时前')
  })

  it('says a stale reading may be outdated, as the non-color cue for dimming', () => {
    expect(companionQuotaFreshnessText({ status: 'stale', updatedAt: now - 60 * 60_000 }, now))
      .toBe('读数更新于 1 小时前，可能已过期')
    expect(companionQuotaFreshnessText({ status: 'stale', updatedAt: 0 }, now)).toBe('读数可能已过期')
    expect(companionQuotaFreshnessText({ freshness: 'unknown', updatedAt: now - 60_000 }, now))
      .toBe('读数更新于 1 分钟前，可能已过期')
  })

  it('uses per-window freshness when it is available', () => {
    expect(companionQuotaFreshnessText({ freshness: 'fresh', status: 'stale', updatedAt: now - 60_000 }, now))
      .toBe('读数更新于 1 分钟前')
  })
})

describe('quota chip staleness projection', () => {
  const CODEX_WINDOWS: CompanionCodexQuotaWindow[] = [
    { key: 'normal-short', label: '5 小时限额', family: 'normal', window: 'short', remainingPercent: 78, resetAt: 10 }
  ]

  it('marks each Claude chip from its own freshness instead of the total snapshot', () => {
    const staleSlice = slice()
    staleSlice.claudeQuota = {
      ...staleSlice.claudeQuota,
      status: 'stale',
      windows: staleSlice.claudeQuota.windows.map((window, index) => ({
        ...window,
        freshness: index === 0 ? 'stale' : 'fresh'
      }))
    }
    const strip = buildCompanionQuotaStrip(CODEX_WINDOWS, staleSlice)
    expect(strip.groups[0].chips[0].stale).toBeUndefined()
    expect(strip.groups[1].chips.map((chip) => chip.stale)).toEqual([true, false])
  })

  it('leaves the codex chip shape untouched with fresh Claude windows', () => {
    const freshSlice = slice()
    freshSlice.claudeQuota = {
      ...freshSlice.claudeQuota,
      status: 'stale',
      windows: freshSlice.claudeQuota.windows.map((window) => ({ ...window, freshness: 'fresh' }))
    }
    const strip = buildCompanionQuotaStrip(CODEX_WINDOWS, freshSlice)
    expect('stale' in strip.groups[0].chips[0]).toBe(false)
    expect(strip.groups[1].chips.every((chip) => chip.stale === false)).toBe(true)
  })

  it('keeps the three-argument hint and aria output byte-identical', () => {
    const chip = buildCompanionQuotaStrip(CODEX_WINDOWS, slice()).groups[1].chips[0]
    expect(companionQuotaChipHint(chip, '3 小时后重置', true)).toBe('Claude · 5 小时限额 · 3 小时后重置')
    expect(companionQuotaChipAriaLabel(chip, '', false)).toBe('5 小时限额，剩余 70%')
  })

  it('appends freshness after the reset text in hint and aria', () => {
    const chip = buildCompanionQuotaStrip(CODEX_WINDOWS, slice()).groups[1].chips[0]
    expect(companionQuotaChipHint(chip, '今天 13:30 重置（约 3 小时后）', true, '读数更新于 12 分钟前'))
      .toBe('Claude · 5 小时限额 · 今天 13:30 重置（约 3 小时后） · 读数更新于 12 分钟前')
    expect(companionQuotaChipAriaLabel(chip, '今天 13:30 重置（约 3 小时后）', false, '读数更新于 12 分钟前'))
      .toBe('5 小时限额，剩余 70%，今天 13:30 重置（约 3 小时后），读数更新于 12 分钟前')
    expect(companionQuotaChipHint(chip, '', false, '读数可能已过期')).toBe('5 小时限额 · 读数可能已过期')
  })
})

describe('realtime gap note', () => {
  it('is empty whenever claude is disabled, so the codex-only status line never changes', () => {
    expect(claudeRealtimeGapNote(null)).toBe('')
    expect(claudeRealtimeGapNote(slice({ providers: { codex: true, claude: false, cursor: false } }))).toBe('')
  })

  it('stays silent for the fully-registered lane and the fully-unusable lane', () => {
    expect(claudeRealtimeGapNote(slice())).toBe('')
    // The unusable lane belongs to claudeSetupHint, not the status line.
    expect(claudeRealtimeGapNote(slice({ claudeEnvironment: emptyClaudeEnvironment() }))).toBe('')
  })

  it('names outdated hooks first, then missing hooks, then the status line', () => {
    expect(claudeRealtimeGapNote(slice({ claudeEnvironment: { ...READY_ENVIRONMENT, hooks: 'outdated' } })))
      .toBe('Claude 钩子已过期，重新注册后恢复实时状态')
    expect(claudeRealtimeGapNote(slice({ claudeEnvironment: { ...READY_ENVIRONMENT, hooks: 'missing' } })))
      .toBe('Claude 钩子未注册，任务状态非实时')
    expect(claudeRealtimeGapNote(slice({ claudeEnvironment: { ...READY_ENVIRONMENT, statusline: 'missing' } })))
      .toBe('Claude 状态栏未注册，额度不会自动更新')
  })

  it('never leaks a filesystem path', () => {
    for (const environment of [
      { ...READY_ENVIRONMENT, hooks: 'outdated' as const },
      { ...READY_ENVIRONMENT, hooks: 'missing' as const },
      { ...READY_ENVIRONMENT, statusline: 'missing' as const }
    ]) {
      expect(claudeRealtimeGapNote(slice({ claudeEnvironment: environment }))).not.toContain('/')
    }
  })
})

describe('claude source status line', () => {
  it('says nothing is read while the provider is off, Code sessions included', () => {
    expect(claudeSourceStatusText({ enabled: false, environment: READY_ENVIRONMENT, codeSessionCount: 4 }))
      .toBe('关闭时不读取任何 Claude 数据')
  })

  it('appends the App Code fact to the connected state instead of adding a control', () => {
    expect(claudeSourceStatusText({ enabled: true, environment: READY_ENVIRONMENT, codeSessionCount: 3 }))
      .toBe('已连接 Claude Code 2.1.220 · App Code 3 个会话')
    expect(claudeSourceStatusText({ enabled: true, environment: READY_ENVIRONMENT, codeSessionCount: 0 }))
      .toBe('已连接 Claude Code 2.1.220')
  })

  /**
   * No CLI plus live App Code sessions is a real state, so the two facts are
   * joined rather than ranked.
   */
  it('keeps a cli hint and a desktop count together', () => {
    expect(claudeSourceStatusText({ enabled: true, environment: emptyClaudeEnvironment(), codeSessionCount: 2 }))
      .toBe('未检测到 Claude Code · App Code 2 个会话')
  })

  it('tolerates a missing environment and a nonsense count', () => {
    expect(claudeSourceStatusText({ enabled: true, environment: null, codeSessionCount: Number.NaN }))
      .toBe('Claude 状态未知')
    expect(claudeSourceStatusText({ enabled: true, environment: READY_ENVIRONMENT, codeSessionCount: -3 }))
      .toBe('已连接 Claude Code 2.1.220')
  })
})

describe('claude registration rows', () => {
  const now = Date.UTC(2026, 7, 6, 2, 0)
  const rows = (environment: Parameters<typeof claudeRegistrationRows>[0], at = now) =>
    Object.fromEntries(claudeRegistrationRows(environment, at).map((row) => [row.id, row]))

  it('keeps the same row set whatever the state, so a healthy panel is still checkable', () => {
    const healthy = claudeRegistrationRows(READY_ENVIRONMENT, now).map((row) => row.id)
    const empty = claudeRegistrationRows(emptyClaudeEnvironment(), now).map((row) => row.id)
    const missing = claudeRegistrationRows(null, now).map((row) => row.id)
    expect(healthy).toEqual(['hooks', 'statusline', 'auth', 'cli', 'home', 'checked'])
    expect(empty).toEqual(healthy)
    expect(missing).toEqual(healthy)
  })

  it('reads every registered part as ready', () => {
    const row = rows({ ...READY_ENVIRONMENT, checkedAt: now - 30_000 })
    expect(row.hooks.value).toBe('已注册')
    expect(row.hooks.tone).toBe('ready')
    expect(row.statusline.value).toBe('已注册')
    expect(row.auth.value).toBe('已登录')
    expect(row.cli.value).toBe('已找到 2.1.220')
    expect(row.home.value).toBe('可读')
    expect(row.checked.value).toBe('刚刚')
  })

  it('separates outdated hooks from unregistered ones, both as warnings', () => {
    expect(rows({ ...READY_ENVIRONMENT, hooks: 'outdated' }).hooks).toMatchObject({ value: '已过期', tone: 'warning' })
    expect(rows({ ...READY_ENVIRONMENT, hooks: 'missing' }).hooks).toMatchObject({ value: '未注册', tone: 'warning' })
    // Distinct remediation copy: an outdated hook needs re-registration, a
    // missing one explains what is lost.
    expect(rows({ ...READY_ENVIRONMENT, hooks: 'outdated' }).hooks.detail)
      .not.toBe(rows({ ...READY_ENVIRONMENT, hooks: 'missing' }).hooks.detail)
  })

  it('leaves an unknown probe muted rather than alarming', () => {
    const row = rows(emptyClaudeEnvironment())
    expect(row.hooks).toMatchObject({ value: '未知', tone: 'muted' })
    expect(row.statusline).toMatchObject({ value: '未知', tone: 'muted' })
  })

  /** The binary only serves the jump action; a healthy panel must not go warning over it. */
  it('keeps a missing cli muted while the blocking parts stay warnings', () => {
    const row = rows({ ...READY_ENVIRONMENT, installed: false, cliVersion: '' })
    expect(row.cli).toMatchObject({ value: '未找到', tone: 'muted' })
    expect(row.hooks.tone).toBe('ready')
    expect(rows({ ...READY_ENVIRONMENT, authenticated: false }).auth.tone).toBe('warning')
    expect(rows({ ...READY_ENVIRONMENT, homeReady: false }).home.tone).toBe('warning')
  })

  it('reports the check age in the same vocabulary as the quota reading', () => {
    expect(rows({ ...READY_ENVIRONMENT, checkedAt: 0 }).checked.value).toBe('尚未检查')
    expect(rows({ ...READY_ENVIRONMENT, checkedAt: now - 12 * 60_000 }).checked.value).toBe('12 分钟前')
    expect(rows({ ...READY_ENVIRONMENT, checkedAt: now - 3 * 3_600_000 }).checked.value).toBe('3 小时前')
    expect(rows({ ...READY_ENVIRONMENT, checkedAt: now - 2 * 86_400_000 }).checked.value).toBe('2 天前')
  })

  it('never leaks a filesystem path, matching the setup hint boundary', () => {
    const serialized = JSON.stringify([
      claudeRegistrationRows(READY_ENVIRONMENT, now),
      claudeRegistrationRows(emptyClaudeEnvironment(), now),
      claudeRegistrationRows({ ...READY_ENVIRONMENT, hooks: 'outdated', statusline: 'missing' }, now)
    ])
    expect(serialized).not.toMatch(/[/\\]/)
    expect(serialized).not.toContain('~')
  })
})

describe('companion search chrome', () => {
  it('keeps the compact placeholder and inventory count separate from alerts', () => {
    expect(companionSearchPlaceholder(false)).toBe(COMPANION_SEARCH_PLACEHOLDER)
    expect(companionSearchPlaceholder(true)).toBe('筛选任务，c-1…0 直接打开')
    expect(companionSearchMetaText({ hasInventory: true, timeWindowDays: 30, count: 42 })).toBe('最近 30 天的 42 条')
    expect(companionSearchMetaText({ hasInventory: false, count: 42 })).toBe('')
    expect(companionSearchAlertText({ conversationStatus: 'stale' })).toBe(COMPANION_SEARCH_STALE_ALERT)
    expect(companionSearchAlertText({ conversationStatus: 'ok', claudeGapNote: 'Claude 钩子未注册，任务状态非实时' }))
      .toBe('Claude 钩子未注册，任务状态非实时')
    expect(companionSearchAlertText({ conversationStatus: 'ok' })).toBe('')
  })

  it('hides the left hint only when it would overlap the right-aligned count', () => {
    expect(companionSearchHintOverlaps(180, 72, 96)).toBe(false)
    expect(companionSearchHintOverlaps(160, 72, 96)).toBe(true)
    expect(companionSearchHintOverlaps(0, 72, 96)).toBe(false)
    expect(companionSearchIconHint(COMPANION_SEARCH_STALE_ALERT, false, COMPANION_SEARCH_PLACEHOLDER))
      .toBe(COMPANION_SEARCH_STALE_ALERT)
    expect(companionSearchIconHint('', true, COMPANION_SEARCH_PLACEHOLDER)).toBe(COMPANION_SEARCH_PLACEHOLDER)
    expect(companionSearchIconHint(COMPANION_SEARCH_STALE_ALERT, true, COMPANION_SEARCH_PLACEHOLDER))
      .toBe(`${COMPANION_SEARCH_STALE_ALERT} · ${COMPANION_SEARCH_PLACEHOLDER}`)
  })
})

describe('float action hint placement', () => {
  const card = { cardLeft: 0, cardTop: 0, cardWidth: 320, cardHeight: 400 }

  it('prefers the top side when the card has room above the anchor', () => {
    const placed = placeFloatActionHint({
      ...card,
      anchorLeft: 100,
      anchorTop: 80,
      anchorWidth: 24,
      anchorHeight: 24,
      hintWidth: 120,
      hintHeight: 28
    })
    expect(placed.placement).toBe('top')
    expect(placed.left).toBe(52)
    expect(placed.top).toBe(45)
    expect(placed.arrowLeft).toBe(60)
    expect(placed.maxWidth).toBe(304)
  })

  it('flips below when the top of the card is too tight', () => {
    const placed = placeFloatActionHint({
      ...card,
      anchorLeft: 100,
      anchorTop: 20,
      anchorWidth: 24,
      anchorHeight: 24,
      hintWidth: 120,
      hintHeight: 28
    })
    expect(placed.placement).toBe('bottom')
    expect(placed.top).toBe(51)
  })

  it('clamps to the card and keeps the arrow on the anchor', () => {
    const placed = placeFloatActionHint({
      ...card,
      anchorLeft: 8,
      anchorTop: 80,
      anchorWidth: 24,
      anchorHeight: 24,
      hintWidth: 160,
      hintHeight: 28
    })
    expect(placed.left).toBe(8)
    expect(placed.arrowLeft).toBeGreaterThanOrEqual(10)
    expect(placed.left + placed.arrowLeft).toBeCloseTo(20, 5)
    expect(placed.left + 160).toBeLessThanOrEqual(320)
  })

  it('falls back without a measured card box', () => {
    const placed = placeFloatActionHint({
      cardLeft: 0,
      cardTop: 0,
      cardWidth: 0,
      cardHeight: 0,
      anchorLeft: 100,
      anchorTop: 60,
      anchorWidth: 24,
      anchorHeight: 24,
      hintWidth: 120,
      hintHeight: 28
    })
    expect(placed.placement).toBe('top')
    expect(placed.left).toBe(52)
    expect(placed.maxWidth).toBe(240)
  })
})
