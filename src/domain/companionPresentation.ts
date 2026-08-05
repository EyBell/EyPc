import {
  claudePrimaryQuotaWindow,
  isClaudeAvailable,
  type ClaudeEnvironmentSnapshot,
  type ClaudeQuotaSnapshot
} from './claude'
import {
  COMPANION_PROVIDER_LABELS,
  companionTaskProvider,
  isCompanionCompatibilityMode,
  resolveCompanionWaterBallMapping,
  type CompanionProviderEnablement,
  type CompanionProviderId,
  type CompanionWaterBallMapping
} from './companionProvider'

/**
 * Companion presentation.
 *
 * The renderer must not decide which provider owns which visual channel, and it
 * must not decide when a provider marker is meaningful. Both are policy, so
 * both live here as pure functions the float and the settings page consume.
 */

/** Snapshot payload the Controller publishes for the Claude provider. */
export interface CompanionSnapshotSlice {
  providers: CompanionProviderEnablement
  claudeQuota: ClaudeQuotaSnapshot
  claudeEnvironment: ClaudeEnvironmentSnapshot
}

export interface CompanionWaterBallPresentation {
  mapping: CompanionWaterBallMapping
  /**
   * Centre percentage override, or null to keep the existing Codex-derived
   * rendering. Null is the compatibility path and must stay null whenever the
   * companion is Codex-only or Claude has no usable reading.
   */
  percentOverride: number | null
  /** Short provider label for the overridden channel; empty when not overridden. */
  percentProviderLabel: string
  /** Accessible suffix describing the override; empty when not overridden. */
  ariaSuffix: string
}

const EMPTY_PRESENTATION: CompanionWaterBallPresentation = {
  mapping: { liquid: 'codex', ring: 'codex', percent: 'codex', compatibility: true },
  percentOverride: null,
  percentProviderLabel: '',
  ariaSuffix: ''
}

/**
 * Resolves what the collapsed water ball should show.
 *
 * Codex-only, a missing Claude registration and an unreadable Claude quota all
 * converge on the same result: no override at all, so the ball renders exactly
 * as it did before this feature existed.
 */
export function resolveCompanionWaterBallPresentation(
  slice: CompanionSnapshotSlice | null | undefined
): CompanionWaterBallPresentation {
  if (!slice) return EMPTY_PRESENTATION
  const claudeLive = slice.providers.claude === true && isClaudeAvailable(slice.claudeEnvironment)
  const mapping = resolveCompanionWaterBallMapping(slice.providers, { claude: claudeLive })
  if (mapping.percent !== 'claude') return { ...EMPTY_PRESENTATION, mapping }
  const window = claudePrimaryQuotaWindow(slice.claudeQuota)
  if (!window) return { ...EMPTY_PRESENTATION, mapping }
  const percent = Math.max(0, Math.min(100, Math.round(window.remainingPercent)))
  return {
    mapping,
    percentOverride: percent,
    percentProviderLabel: COMPANION_PROVIDER_LABELS.claude,
    ariaSuffix: `，Claude 剩余 ${percent}%`
  }
}

/* ------------------------------------------------------------------ *
 * Row markers
 * ------------------------------------------------------------------ */

export interface CompanionRowMarker {
  provider: CompanionProviderId
  label: string
  /** Product tooltip text for the shared operation tooltip layer. */
  tooltip: string
}

/**
 * A row marker is only meaningful once the list actually mixes providers.
 * In compatibility mode every row would carry the same "Codex" badge, which is
 * noise, so the marker is suppressed entirely.
 */
export function resolveCompanionRowMarker(
  task: { provider?: CompanionProviderId } | null | undefined,
  providers: CompanionProviderEnablement
): CompanionRowMarker | null {
  if (!task || isCompanionCompatibilityMode(providers)) return null
  const provider = companionTaskProvider(task)
  const label = COMPANION_PROVIDER_LABELS[provider]
  return { provider, label, tooltip: `来源：${label}` }
}

/* ------------------------------------------------------------------ *
 * Quota sections
 * ------------------------------------------------------------------ */

export interface CompanionQuotaRow {
  key: string
  label: string
  remainingPercent: number
  resetAt: number | null
}

export interface CompanionQuotaSection {
  provider: CompanionProviderId
  label: string
  rows: CompanionQuotaRow[]
  /** Set when the provider is enabled but has nothing to show yet. */
  emptyReason: string
}

/**
 * Builds the Claude section of the expanded card's quota area. Codex keeps its
 * existing rendering untouched; this only describes the added section.
 */
export function buildClaudeQuotaSection(
  slice: CompanionSnapshotSlice | null | undefined
): CompanionQuotaSection | null {
  if (!slice || slice.providers.claude !== true) return null
  const label = COMPANION_PROVIDER_LABELS.claude
  if (!isClaudeAvailable(slice.claudeEnvironment)) {
    return { provider: 'claude', label, rows: [], emptyReason: claudeSetupHint(slice.claudeEnvironment) }
  }
  const rows: CompanionQuotaRow[] = []
  if (slice.claudeQuota.short) {
    rows.push({
      key: 'claude-short',
      label: '5 小时限额',
      remainingPercent: slice.claudeQuota.short.remainingPercent,
      resetAt: slice.claudeQuota.short.resetAt
    })
  }
  if (slice.claudeQuota.weekly) {
    rows.push({
      key: 'claude-weekly',
      label: '周限额',
      remainingPercent: slice.claudeQuota.weekly.remainingPercent,
      resetAt: slice.claudeQuota.weekly.resetAt
    })
  }
  return {
    provider: 'claude',
    label,
    rows,
    emptyReason: rows.length ? '' : '尚未读到额度，运行一次 Claude Code 后自动更新'
  }
}

/**
 * Actionable, privacy-safe hint for a Claude provider that is not fully usable.
 *
 * Ordered by how much the user loses. A missing executable is deliberately last
 * and explicitly says the readings still work, because it costs only the jump
 * back into Claude Code — reporting it as "not detected" while cards and quota
 * render correctly is what made the previous message misleading.
 */
export function claudeSetupHint(environment: ClaudeEnvironmentSnapshot | null | undefined): string {
  if (!environment) return 'Claude 状态未知'
  if (!environment.installed && !environment.homeReady) return '未检测到 Claude Code'
  if (!environment.authenticated) return 'Claude Code 尚未登录'
  if (!environment.homeReady) return 'Claude Code 数据目录不可读'
  if (environment.hooks === 'outdated') return '钩子配置已过期，请重新注册'
  if (environment.hooks !== 'installed') return '尚未注册事件钩子，任务状态无法实时更新'
  if (!environment.installed) return '未找到 claude 可执行文件，状态与额度正常，但无法从卡片打开会话'
  return ''
}
