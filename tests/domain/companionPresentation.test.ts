import { describe, expect, it } from 'vitest'
import {
  buildClaudeQuotaSection,
  claudeSetupHint,
  resolveCompanionRowMarker,
  resolveCompanionWaterBallPresentation,
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
    providers: { codex: true, claude: true },
    claudeQuota: normalizeClaudeQuota({ five_hour: { used_percentage: 30 }, seven_day: { used_percentage: 55 } }),
    claudeEnvironment: READY_ENVIRONMENT,
    ...patch
  }
}

describe('water ball presentation', () => {
  it('does not override anything in codex-only compatibility mode', () => {
    const result = resolveCompanionWaterBallPresentation(slice({ providers: { codex: true, claude: false } }))
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
    expect(result.percentOverride).toBe(70)
    expect(result.percentProviderLabel).toBe('Claude')
    expect(result.ariaSuffix).toBe('，Claude 剩余 70%')
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
    expect(result.percentOverride).toBe(70)
  })

  it('falls back to the legacy rendering while claude has no quota reading yet', () => {
    const result = resolveCompanionWaterBallPresentation(slice({ claudeQuota: emptyClaudeQuota() }))
    expect(result.percentOverride).toBeNull()
    expect(result.percentProviderLabel).toBe('')
  })

  it('lets claude own the whole ball when it is the only enabled provider', () => {
    const result = resolveCompanionWaterBallPresentation(slice({ providers: { codex: false, claude: true } }))
    expect(result.mapping).toMatchObject({ liquid: 'claude', ring: 'claude', percent: 'claude' })
    expect(result.percentOverride).toBe(70)
  })

  it('rounds and clamps the displayed percentage', () => {
    const result = resolveCompanionWaterBallPresentation(slice({
      claudeQuota: normalizeClaudeQuota({ five_hour: { used_percentage: 33.33 } })
    }))
    expect(result.percentOverride).toBe(67)
  })

  it('uses the weekly window when the 5-hour window is absent', () => {
    const result = resolveCompanionWaterBallPresentation(slice({
      claudeQuota: normalizeClaudeQuota({ seven_day: { used_percentage: 10 } })
    }))
    expect(result.percentOverride).toBe(90)
  })
})

describe('row markers', () => {
  it('is suppressed entirely in compatibility mode', () => {
    expect(resolveCompanionRowMarker({ provider: 'codex' }, { codex: true, claude: false })).toBeNull()
    expect(resolveCompanionRowMarker({ provider: 'claude' }, { codex: true, claude: false })).toBeNull()
  })

  it('labels both providers once the list can mix them', () => {
    const providers = { codex: true, claude: true }
    expect(resolveCompanionRowMarker({ provider: 'codex' }, providers)).toEqual({ provider: 'codex', label: 'Codex', tooltip: '来源：Codex' })
    expect(resolveCompanionRowMarker({ provider: 'claude' }, providers)).toEqual({ provider: 'claude', label: 'Claude', tooltip: '来源：Claude' })
  })

  it('treats a legacy card without a provider field as codex', () => {
    expect(resolveCompanionRowMarker({}, { codex: true, claude: true })?.provider).toBe('codex')
  })

  it('returns null for a missing task', () => {
    expect(resolveCompanionRowMarker(null, { codex: true, claude: true })).toBeNull()
  })
})

describe('claude quota section', () => {
  it('is absent entirely while the provider is disabled', () => {
    expect(buildClaudeQuotaSection(slice({ providers: { codex: true, claude: false } }))).toBeNull()
    expect(buildClaudeQuotaSection(null)).toBeNull()
  })

  it('lists both windows with their reset times', () => {
    const section = buildClaudeQuotaSection(slice())
    expect(section?.rows.map((row) => row.key)).toEqual(['claude-short', 'claude-weekly'])
    expect(section?.rows[0]).toMatchObject({ label: '5 小时限额', remainingPercent: 70 })
    expect(section?.emptyReason).toBe('')
  })

  it('explains an unusable provider instead of showing empty rows', () => {
    const section = buildClaudeQuotaSection(slice({ claudeEnvironment: emptyClaudeEnvironment() }))
    expect(section?.rows).toEqual([])
    expect(section?.emptyReason).toBe('未检测到 Claude Code')
  })

  it('explains a connected provider that has no reading yet', () => {
    const section = buildClaudeQuotaSection(slice({ claudeQuota: emptyClaudeQuota() }))
    expect(section?.rows).toEqual([])
    expect(section?.emptyReason).toContain('尚未读到额度')
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
