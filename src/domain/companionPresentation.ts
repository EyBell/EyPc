import type { CodexhostEnvironmentV1 } from './codex'
import {
  claudePrimaryQuotaWindow,
  type ClaudeQuotaAccessStatus,
  claudeScopedWeeklyQuotaWindow,
  isClaudeAvailable,
  type ClaudeEnvironmentSnapshot,
  type ClaudeQuotaAccessSnapshot,
  type ClaudeQuotaSnapshot
} from './claude'
import {
  COMPANION_PROVIDER_CYCLE_ORDER,
  COMPANION_PROVIDER_LABELS,
  companionTaskProvider,
  resolveCompanionWaterBallMapping,
  type CompanionProviderEnablement,
  type CompanionProviderId,
  type CompanionWaterBallMapping
} from './companionProvider'

/**
 * Companion presentation.
 *
 * The renderer must not decide which provider owns which visual channel, and it
 * must not decide how provider ownership is expressed. Both are policy, so
 * both live here as pure functions the float and the settings page consume.
 */

/** Snapshot payload the Controller publishes for the Claude provider. */
export interface CompanionSnapshotSlice {
  providers: CompanionProviderEnablement
  claudeAppQuotaAccess?: boolean
  /** Controller-owned monotonic revision; Float rejects older publications. */
  revision?: number
  stateGeneration?: number
  unreadGeneration?: number
  claudeQuotaAccess?: ClaudeQuotaAccessSnapshot
  claudeQuota: ClaudeQuotaSnapshot
  claudeEnvironment: ClaudeEnvironmentSnapshot
  /** Outcome of the latest manual quota refresh, so the float can say what it did. */
  quotaRefreshReceipt?: CompanionQuotaRefreshReceipt
}

/**
 * What one manual quota refresh actually did, per lane. Enumerations, counts
 * and waits only — never a percentage, reset moment or credential detail.
 */
export interface CompanionQuotaRefreshReceipt {
  at: number
  /** Claude lane result; absent when the Claude provider is off. */
  claude?: {
    /** Whether any Claude reading or access state changed in this read. */
    changed: boolean
    usageApi: 'disabled' | 'accepted' | 'skipped' | 'failed'
    accessStatus: ClaudeQuotaAccessStatus
    /** Why the usage API was skipped or is locked: interval | backoff | retry-after | credential. */
    blockedBy: string
    retryInMs: number
    windowCount: number
    scopedCount: number
  }
  /** Codex lane: the reading was re-requested; the row itself shows the value. */
  codex?: { requested: boolean }
}

/** Whether the App usage API contributed at least one window under authorization. */
export function claudeAppQuotaReadable(slice: Pick<CompanionSnapshotSlice, 'claudeAppQuotaAccess' | 'claudeQuota'>): boolean {
  return slice.claudeAppQuotaAccess === true
    && slice.claudeQuota.windows.some((window) => window.source === 'usage-api')
}

/** One staleness rule for every Claude reading surface: per-window freshness first, snapshot status as fallback. */
export function claudeQuotaReadingStale(quota: { freshness?: 'fresh' | 'stale' | 'unknown'; status?: string } | null | undefined): boolean {
  if (!quota) return false
  return quota.freshness ? quota.freshness !== 'fresh' : quota.status === 'stale'
}

function claudeQuotaAccessNote(status: ClaudeQuotaAccessStatus): string {
  return status === 'rate-limited'
    ? 'Claude App 额度暂受限，将按 Retry-After 重试'
    : status === 'credential-unavailable'
      ? 'Claude App 额度凭据不可用，等待账号凭据更新'
      : status === 'failed'
        ? 'Claude App 额度暂不可用，保留最近成功值'
        : ''
}

/**
 * Human sentence for a refresh receipt. It names the lane outcome the chip row
 * cannot show by itself: whether the App usage API answered, why it did not,
 * and when it may next. Readings stay in the chips.
 */
export function companionQuotaRefreshReceiptText(receipt: CompanionQuotaRefreshReceipt | null | undefined): string {
  if (!receipt) return ''
  const parts: string[] = []
  const claude = receipt.claude
  if (claude) {
    if (claude.usageApi === 'accepted') {
      parts.push(claude.scopedCount > 0
        ? `Claude 周额度已更新（含 ${claude.scopedCount} 个模型周窗口）`
        : 'Claude 额度已从 App 更新')
    } else if (claude.usageApi === 'disabled') {
      parts.push('Claude 只读了本地缓存（未授权读取 Claude App 额度）')
    } else {
      const access = claudeQuotaAccessNote(claude.accessStatus)
      const wait = claude.retryInMs > 0
        ? `，${claude.retryInMs >= 60_000 ? `${Math.ceil(claude.retryInMs / 60_000)} 分钟` : `${Math.ceil(claude.retryInMs / 1000)} 秒`}后可再试`
        : ''
      parts.push(claude.usageApi === 'failed'
        ? `Claude App 读取失败：${access || '未知原因'}${wait}`
        : `Claude App 未读取（${claude.blockedBy === 'retry-after' ? 'Retry-After 限制' : claude.blockedBy === 'credential' ? '凭据被锁定' : access || '按节奏跳过'}）${wait}`)
    }
  }
  if (receipt.codex?.requested) parts.push('Codex 额度已重新请求')
  return parts.length ? `已刷新：${parts.join('；')}` : '已刷新'
}

export interface CompanionWaterBallPresentation {
  mapping: CompanionWaterBallMapping
  /**
   * Centre percentage override, or null to keep the existing Codex-derived
   * rendering. Null is the compatibility path and must stay null whenever the
   * companion is Codex-only or Claude has no usable reading.
   */
  percentOverride: number | null
  /**
   * Leading per-model weekly reading, or null when the account reports only the
   * plain weekly window. Present means the centre reads `{scoped}/{plain}` with
   * no unit: two percentages plus two `%` signs do not fit inside the ball, and
   * a single unit on a pair would read as one number anyway.
   */
  scopedPercent: number | null
  /** Scope caption of the leading reading, e.g. `Fable`; empty when absent. */
  scopedLabel: string
  /** Short provider label for the overridden channel; empty when not overridden. */
  percentProviderLabel: string
  /** Accessible suffix describing the override; empty when not overridden. */
  ariaSuffix: string
}

const EMPTY_PRESENTATION: CompanionWaterBallPresentation = {
  mapping: { liquid: 'codex', ring: 'codex', percent: 'codex', compatibility: true },
  percentOverride: null,
  scopedPercent: null,
  scopedLabel: '',
  percentProviderLabel: '',
  ariaSuffix: ''
}

function clampQuotaPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
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
  const appQuotaReadable = claudeAppQuotaReadable(slice)
  const claudeLive = slice.providers.claude === true
    && (isClaudeAvailable(slice.claudeEnvironment) || appQuotaReadable)
  const mapping = resolveCompanionWaterBallMapping(slice.providers, { claude: claudeLive })
  if (mapping.percent !== 'claude') return { ...EMPTY_PRESENTATION, mapping }
  const window = claudePrimaryQuotaWindow(slice.claudeQuota)
  if (!window) return { ...EMPTY_PRESENTATION, mapping }
  const percent = clampQuotaPercent(window.remainingPercent)
  // The scoped reading joins the centre only when the trailing number really is
  // the plain weekly window. Pairing it with the 5-hour fallback would put two
  // different window lengths behind one slash and read as one comparison.
  const scoped = slice.claudeQuota.weekly ? claudeScopedWeeklyQuotaWindow(slice.claudeQuota) : null
  if (!scoped) {
    return {
      ...EMPTY_PRESENTATION,
      mapping,
      percentOverride: percent,
      percentProviderLabel: COMPANION_PROVIDER_LABELS.claude,
      ariaSuffix: `，Claude 剩余 ${percent}%`
    }
  }
  const scopedPercent = clampQuotaPercent(scoped.remainingPercent)
  return {
    mapping,
    percentOverride: percent,
    scopedPercent,
    scopedLabel: scoped.scope,
    percentProviderLabel: COMPANION_PROVIDER_LABELS.claude,
    ariaSuffix: `，Claude ${scoped.scope}周限额剩余 ${scopedPercent}%，普通周限额剩余 ${percent}%`
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

export interface CompanionProjectMarker {
  providers: CompanionProviderId[]
  label: string
  className: `provider-${CompanionProviderId | 'shared'}`
  claudeOnly: boolean
}

/**
 * Every status row carries a textual owner cue. Color remains supplementary,
 * so compatibility mode and forced-colors users receive the same information.
 */
export function resolveCompanionRowMarker(
  task: { provider?: CompanionProviderId } | null | undefined
): CompanionRowMarker | null {
  if (!task) return null
  const provider = companionTaskProvider(task)
  const label = COMPANION_PROVIDER_LABELS[provider]
  return { provider, label: `归属 ${label}`, tooltip: `归属 ${label}` }
}

/** One ownership projection shared by project text, tint, filters and actions. */
export function resolveCompanionProjectMarker(
  project: { providers?: CompanionProviderId[]; tasks?: Array<{ provider?: CompanionProviderId }> } | null | undefined
): CompanionProjectMarker | null {
  if (!project) return null
  const providers = [...new Set(project.providers?.length
    ? project.providers
    : (project.tasks || []).map(companionTaskProvider))]
  if (!providers.length) providers.push('codex')
  const shared = providers.length > 1
  const ordered = COMPANION_PROVIDER_CYCLE_ORDER.filter((provider) => providers.includes(provider))
  const owner = shared
    ? ordered.map((provider) => COMPANION_PROVIDER_LABELS[provider]).join(' + ')
    : COMPANION_PROVIDER_LABELS[providers[0]]
  return {
    providers,
    label: `归属 ${owner}`,
    className: `provider-${shared ? 'shared' : providers[0]}`,
    claudeOnly: providers.length === 1 && providers[0] === 'claude'
  }
}

/* ------------------------------------------------------------------ *
 * Quota sections
 * ------------------------------------------------------------------ */

export interface CompanionQuotaRow {
  key: string
  label: string
  /** Dense caption for the chip row. Absent rows fall back to the window family. */
  shortLabel?: string
  remainingPercent: number
  resetAt: number | null
  source?: ClaudeQuotaSnapshot['source']
  updatedAt?: number
  freshness?: 'fresh' | 'stale' | 'unknown'
}

/** Which limit window a quota reading covers. Drives the short caption. */
export type CompanionQuotaWindow = 'short' | 'weekly'

export interface CompanionQuotaSection {
  provider: CompanionProviderId
  label: string
  rows: CompanionQuotaRow[]
  /** Set when the provider is enabled but has nothing to show yet. */
  emptyReason: string
  /** Access problem worth showing beside existing rows (App lane blocked while cache rows remain). */
  note: string
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
  const appQuotaReadable = claudeAppQuotaReadable(slice)
  if (!isClaudeAvailable(slice.claudeEnvironment) && !appQuotaReadable) {
    return { provider: 'claude', label, rows: [], emptyReason: claudeSetupHint(slice.claudeEnvironment), note: '' }
  }
  // One row per window the payload actually declared, in the domain's display
  // order. Enumerating instead of picking two named fields is what lets an
  // account's per-model weekly appear here at all — the reading was always in
  // the cache, only the projection was hardcoded to `5 小时 + 周`.
  const rows: CompanionQuotaRow[] = slice.claudeQuota.windows.map((entry) => ({
    key: `claude-${entry.key}`,
    label: entry.label,
    shortLabel: entry.shortLabel,
    remainingPercent: entry.remainingPercent,
    resetAt: entry.resetAt,
    source: entry.source,
    updatedAt: entry.updatedAt,
    freshness: entry.freshness
  }))
  const accessStatus = slice.claudeQuotaAccess?.status || 'idle'
  const unavailableReason = claudeQuotaAccessNote(accessStatus) || 'Claude App 额度暂不可用，保留最近成功值'
  // Cache rows (statusline / plan history) keep the row populated while the
  // App lane is blocked, which used to hide the block completely: the user saw
  // one number and no reason why the per-model weekly never appeared.
  const note = rows.length && slice.claudeAppQuotaAccess === true && accessStatus !== 'idle' && accessStatus !== 'ok'
    ? unavailableReason
    : ''
  return {
    provider: 'claude',
    label,
    rows,
    emptyReason: rows.length
      ? ''
      : slice.claudeAppQuotaAccess
        ? unavailableReason
        : '尚未读到额度；可授权只读 Claude App 额度',
    note
  }
}

/* ------------------------------------------------------------------ *
 * Single-row quota strip
 * ------------------------------------------------------------------ */

/**
 * One Codex quota window as the float already resolves it. Passing the windows in
 * keeps this module off `codex.ts`, so the presentation layer stays consumable by
 * any provider rather than becoming Codex-shaped.
 */
export interface CompanionCodexQuotaWindow {
  key: string
  label: string
  family: 'normal' | 'spark'
  window: CompanionQuotaWindow
  remainingPercent: number
  resetAt: number | null
}

export interface CompanionQuotaChip {
  key: string
  provider: CompanionProviderId
  /** Spark pools stay visually subordinate to the ordinary Codex windows. */
  spark: boolean
  /** Dense caption carried in the row: `5h`, `周`, `S5h`, `S周`. */
  shortLabel: string
  /** Full product title, moved into hover help and the accessible name. */
  label: string
  remainingPercent: number
  resetAt: number | null
  source?: ClaudeQuotaSnapshot['source']
  updatedAt?: number
  freshness?: 'fresh' | 'stale' | 'unknown'
  /**
   * True when the reading is known to be stale. Only Claude chips carry the
   * flag: the Codex chip shape must stay untouched so the Codex-only rendering
   * remains byte-identical to the pre-companion float.
   */
  stale?: boolean
  /** Claude-only remaining-capacity reminder; no system notification. */
  tone?: 'normal' | 'warning' | 'danger'
}

export interface CompanionQuotaGroup {
  provider: CompanionProviderId
  /**
   * Provider caption. Empty in Codex-only compatibility mode, where a single
   * "Codex" caption would repeat what the whole surface already means.
   */
  caption: string
  chips: CompanionQuotaChip[]
  /** Set when the provider is enabled but has nothing to show yet. */
  emptyReason: string
  /** Access problem shown under populated Claude chips; empty for Codex. */
  note: string
}

export interface CompanionQuotaStrip {
  groups: CompanionQuotaGroup[]
  /** True once more than one provider group is present, so a separator is meaningful. */
  multiProvider: boolean
}

/** `S` is the established Spark marker; short/weekly keep the row scannable. */
function shortWindowLabel(window: CompanionQuotaWindow, spark: boolean): string {
  return `${spark ? 'S' : ''}${window === 'short' ? '5h' : '周'}`
}

/**
 * Builds the whole quota row as one ordered structure.
 *
 * The renderer must not decide which provider owns a reading, whether a provider
 * caption is meaningful, or what the dense caption for a window is — all three are
 * policy and all three live here.
 */
export function buildCompanionQuotaStrip(
  codexWindows: readonly CompanionCodexQuotaWindow[],
  slice: CompanionSnapshotSlice | null | undefined,
  codexEmptyReason = ''
): CompanionQuotaStrip {
  const claudeSection = buildClaudeQuotaSection(slice)
  const codexEnabled = !slice || slice.providers.codex === true
  const groups: CompanionQuotaGroup[] = []

  if (codexEnabled) {
    groups.push({
      provider: 'codex',
      caption: '',
      chips: codexWindows.map((item) => ({
        key: item.key,
        provider: 'codex',
        spark: item.family === 'spark',
        shortLabel: shortWindowLabel(item.window, item.family === 'spark'),
        label: item.label,
        remainingPercent: item.remainingPercent,
        resetAt: item.resetAt
      })),
      emptyReason: codexWindows.length ? '' : (codexEmptyReason || '服务端未返回额度窗口'),
      note: ''
    })
  }

  if (claudeSection) {
    groups.push({
      provider: 'claude',
      caption: claudeSection.label,
      chips: claudeSection.rows.map((row) => ({
        key: row.key,
        provider: 'claude',
        spark: false,
        shortLabel: row.shortLabel || shortWindowLabel(row.key.endsWith('-weekly') ? 'weekly' : 'short', false),
        label: row.label,
        remainingPercent: row.remainingPercent,
        resetAt: row.resetAt,
        source: row.source,
        updatedAt: row.updatedAt,
        freshness: row.freshness,
        stale: claudeQuotaReadingStale(row),
        tone: row.remainingPercent <= 10
          ? 'danger'
          : row.remainingPercent <= 20
            ? 'warning'
            : 'normal'
      })),
      emptyReason: claudeSection.emptyReason,
      note: claudeSection.note
    })
  }

  const multiProvider = groups.length > 1
  return {
    // A lone Codex group keeps the pre-multi-provider rendering: no caption at all.
    groups: multiProvider ? groups : groups.map((group) => ({ ...group, caption: '' })),
    multiProvider
  }
}

/**
 * Hover help and accessible name for one chip. The reset text is passed in rather
 * than formatted here so this stays a pure function of its arguments and the
 * float keeps one clock.
 */
export function companionQuotaChipHint(
  chip: CompanionQuotaChip,
  resetText: string,
  withProvider: boolean,
  freshnessText = ''
): string {
  const head = withProvider ? `${COMPANION_PROVIDER_LABELS[chip.provider]} · ${chip.label}` : chip.label
  const parts = [head]
  if (resetText) parts.push(resetText)
  if (freshnessText) parts.push(freshnessText)
  return parts.join(' · ')
}

export function companionQuotaChipAriaLabel(
  chip: CompanionQuotaChip,
  resetText: string,
  withProvider: boolean,
  freshnessText = ''
): string {
  const head = withProvider ? `${COMPANION_PROVIDER_LABELS[chip.provider]} ${chip.label}` : chip.label
  return `${head}，剩余 ${chip.remainingPercent}%${resetText ? `，${resetText}` : ''}${freshnessText ? `，${freshnessText}` : ''}`
}

/* ------------------------------------------------------------------ *
 * Quota detail texts (hover hint layer)
 * ------------------------------------------------------------------ */

const COMPANION_WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const

/**
 * Reset moments render in GMT+8 regardless of the machine's timezone (user
 * decision 2026-08-06). Rendering through a fixed offset plus UTC getters keeps
 * the output deterministic in tests and on hosts set to another zone.
 */
const COMPANION_RESET_TZ_OFFSET_MS = 8 * 3_600_000

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

/**
 * How long ago something happened, in the coarse buckets this UI reads at.
 * Shared by the quota reading and the registration check so the two never drift
 * into two different vocabularies for the same elapsed time.
 */
function elapsedText(from: number, now: number): string {
  const minutes = Math.max(0, Math.round((now - from) / 60_000))
  if (minutes < 60) return `${minutes} 分钟前`
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时前`
  return `${Math.floor(minutes / 1440)} 天前`
}

/**
 * Precise reset moment for the hover hint: an absolute GMT+8 time plus the
 * relative distance, e.g. `今天 21:30 重置（约 3 小时后）` or
 * `周四 03:00 重置（2 天后）`. The chip row itself stays a single line of
 * readings — this text only ever enters the shared 200ms hint and the
 * accessible name (user decision 2026-08-06).
 */
export function companionResetDetailText(resetAt: number | null | undefined, now: number): string {
  if (typeof resetAt !== 'number' || !Number.isFinite(resetAt) || resetAt <= 0) return ''
  // A reset moment in the past is not "今天 <过去的时刻>（0 分钟后）". Clamping
  // the negative difference to zero and folding every negative day difference
  // into "今天" made the line state a wrong date *and* a wrong countdown at the
  // same time — and it is the ordinary case, because the window keeps resetting
  // while Claude Code is not running to refresh the reading. The window has
  // rolled over; the honest statement is that the number is waiting on a new
  // reading. Same fact as `claudeQuotaWindowExpired`.
  if (now >= resetAt) return '额度窗口已重置 · 等待新读数'
  const time = new Date(resetAt + COMPANION_RESET_TZ_OFFSET_MS)
  const clock = `${pad2(time.getUTCHours())}:${pad2(time.getUTCMinutes())}`
  const minutes = Math.max(0, Math.round((resetAt - now) / 60_000))
  const relative = minutes < 60
    ? `${minutes} 分钟后`
    : minutes < 1440
      ? `约 ${Math.floor(minutes / 60)} 小时后`
      : `${Math.floor(minutes / 1440)} 天后`
  const nowDate = new Date(now + COMPANION_RESET_TZ_OFFSET_MS)
  const startOfToday = Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate())
  const startOfResetDay = Date.UTC(time.getUTCFullYear(), time.getUTCMonth(), time.getUTCDate())
  const dayDiff = Math.round((startOfResetDay - startOfToday) / 86_400_000)
  const day = dayDiff <= 0
    ? '今天'
    : dayDiff === 1
      ? '明天'
      : dayDiff < 7
        ? COMPANION_WEEKDAY_LABELS[time.getUTCDay()]
        : `${time.getUTCMonth() + 1}月${time.getUTCDate()}日`
  return `${day} ${clock} 重置（${relative}）`
}

/**
 * How old the Claude quota reading is, for the hover hint and accessible name.
 * A stale reading says so explicitly, because dimming the chip alone would be a
 * color/opacity-only state cue.
 */
export function companionQuotaFreshnessText(
  quota: {
    status?: ClaudeQuotaSnapshot['status']
    freshness?: 'fresh' | 'stale' | 'unknown'
    updatedAt?: number
  } | null | undefined,
  now: number
): string {
  if (!quota) return ''
  const stale = claudeQuotaReadingStale(quota)
  const at = quota.updatedAt || 0
  if (at <= 0) return stale ? '读数可能已过期' : ''
  const minutes = Math.max(0, Math.round((now - at) / 60_000))
  const base = minutes < 1 ? '读数刚刚更新' : `读数更新于 ${elapsedText(at, now)}`
  return stale ? `${base}，可能已过期` : base
}

/**
 * Hover-only realtime-gap note for the expanded-card search glyph.
 *
 * `claudeSetupHint` owns the fully-unusable lane; this covers the degraded
 * middle ground where cards and quota render but hooks or the status line are
 * not registered, which previously left the float silent about why task states
 * never showed as running. Returns '' whenever Claude is disabled, so the
 * Codex-only search chrome stays byte-identical.
 */
export function claudeRealtimeGapNote(slice: CompanionSnapshotSlice | null | undefined): string {
  if (!slice || slice.providers.claude !== true) return ''
  const environment = slice.claudeEnvironment
  if (!isClaudeAvailable(environment)) return ''
  if (environment.hooks === 'outdated') return 'Claude 钩子已过期，重新注册后恢复实时状态'
  if (environment.hooks !== 'installed') return 'Claude 钩子未注册，任务状态非实时'
  if (environment.statusline !== 'installed') return 'Claude 状态栏未注册，额度不会自动更新'
  return ''
}

export const COMPANION_SEARCH_PLACEHOLDER = '别名|任务|项目'
export const COMPANION_SEARCH_QUICK_PLACEHOLDER = '筛选任务，c-1…0 直接打开'
export const COMPANION_SEARCH_STALE_ALERT = '数据已过期 · 展示上一份已验证快照'

export function companionSearchPlaceholder(quickMode: boolean): string {
  return quickMode ? COMPANION_SEARCH_QUICK_PLACEHOLDER : COMPANION_SEARCH_PLACEHOLDER
}

export function companionSearchMetaText(input: {
  timeWindowDays?: number | null
  count?: number | null
  hasInventory?: boolean
}): string {
  if (!input.hasInventory) return ''
  const days = Number.isFinite(input.timeWindowDays) && Number(input.timeWindowDays) > 0
    ? Math.trunc(Number(input.timeWindowDays))
    : 30
  const count = Number.isFinite(input.count) ? Math.max(0, Math.trunc(Number(input.count))) : 0
  return `最近 ${days} 天的 ${count} 条`
}

export function companionSearchAlertText(input: {
  compatibility?: string | null
  compatibilityMessage?: string | null
  conversationStatus?: string | null
  conversationErrorMessage?: string | null
  claudeGapNote?: string | null
}): string {
  if (input.compatibility === 'degraded') return String(input.compatibilityMessage || '').trim()
  if (input.conversationStatus === 'stale') return COMPANION_SEARCH_STALE_ALERT
  if (input.conversationStatus === 'error') return String(input.conversationErrorMessage || '真实会话预检失败').trim()
  return String(input.claudeGapNote || '').trim()
}

export function companionSearchHintOverlaps(
  fieldWidth: number,
  leftWidth: number,
  rightWidth: number,
  gap = 10
): boolean {
  if (!(fieldWidth > 0) || !(leftWidth > 0) || !(rightWidth > 0)) return false
  return leftWidth + rightWidth + gap > fieldWidth
}

export function companionSearchIconHint(
  alertText: string,
  placeholderHidden: boolean,
  placeholder: string
): string {
  const alert = String(alertText || '').trim()
  const hint = placeholderHidden ? String(placeholder || '').trim() : ''
  if (alert && hint) return `${alert} · ${hint}`
  return alert || hint
}

export type FloatActionHintPlacement = 'top' | 'bottom'

export interface FloatActionHintBox {
  left: number
  top: number
  placement: FloatActionHintPlacement
  arrowLeft: number
  maxWidth: number
}

/**
 * Places the float's speech-bubble hint against an expanded-card box.
 *
 * The bubble stays inside the card, prefers the side with room, and keeps the
 * arrow on the anchor even after left/right clamping. A zero-size card (jsdom)
 * falls back to the older window-style guess so hover tests still render.
 */
export function placeFloatActionHint(input: {
  anchorLeft: number
  anchorTop: number
  anchorWidth: number
  anchorHeight: number
  cardLeft: number
  cardTop: number
  cardWidth: number
  cardHeight: number
  hintWidth: number
  hintHeight: number
  gap?: number
  margin?: number
}): FloatActionHintBox {
  const gap = Number.isFinite(input.gap) ? Number(input.gap) : 7
  const margin = Number.isFinite(input.margin) ? Number(input.margin) : 8
  const hintWidth = Math.max(1, input.hintWidth)
  const hintHeight = Math.max(1, input.hintHeight)
  const anchorCenter = input.anchorLeft + input.anchorWidth / 2
  if (!(input.cardWidth > 0) || !(input.cardHeight > 0)) {
    const placement: FloatActionHintPlacement = input.anchorTop >= 48 ? 'top' : 'bottom'
    const left = Math.max(8, anchorCenter - hintWidth / 2)
    const top = placement === 'top'
      ? Math.max(8, input.anchorTop - gap - hintHeight)
      : input.anchorTop + input.anchorHeight + gap
    return {
      left,
      top,
      placement,
      arrowLeft: Math.min(Math.max(anchorCenter - left, 10), Math.max(10, hintWidth - 10)),
      maxWidth: 240
    }
  }
  const maxWidth = Math.max(margin * 2, input.cardWidth - margin * 2)
  const width = Math.min(hintWidth, maxWidth)
  const minLeft = input.cardLeft + margin
  const maxLeft = input.cardLeft + input.cardWidth - width - margin
  const preferredLeft = anchorCenter - width / 2
  const left = maxLeft < minLeft
    ? minLeft
    : Math.min(Math.max(preferredLeft, minLeft), maxLeft)
  const arrowLeft = Math.min(
    Math.max(anchorCenter - left, 10),
    Math.max(10, width - 10)
  )
  const need = hintHeight + gap + margin
  const spaceAbove = input.anchorTop - input.cardTop
  const placement: FloatActionHintPlacement = spaceAbove >= need ? 'top' : 'bottom'
  const preferredTop = placement === 'top'
    ? input.anchorTop - gap - hintHeight
    : input.anchorTop + input.anchorHeight + gap
  const minTop = input.cardTop + margin
  const maxTop = input.cardTop + input.cardHeight - hintHeight - margin
  const top = maxTop < minTop
    ? minTop
    : Math.min(Math.max(preferredTop, minTop), maxTop)
  return { left, top, placement, arrowLeft, maxWidth }
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

export interface ClaudeSourceStatusInput {
  enabled: boolean
  environment: ClaudeEnvironmentSnapshot | null | undefined
  /** Non-archived Claude App Code sessions currently in the inventory. */
  codeSessionCount: number
}

/**
 * One status line for the settings page's Claude source row.
 *
 * Code inventory is independent from CLI readiness, so both facts remain
 * visible without turning Cowork/CLI-only sessions into task rows.
 */
export function claudeSourceStatusText(input: ClaudeSourceStatusInput): string {
  if (!input.enabled) return '关闭时不读取任何 Claude 数据'
  const count = Number.isFinite(input.codeSessionCount) ? Math.max(0, Math.trunc(input.codeSessionCount)) : 0
  const hint = claudeSetupHint(input.environment)
  const version = input.environment?.cliVersion || ''
  const base = hint || (version ? `已连接 Claude Code ${version}` : '已连接 Claude Code')
  return count > 0 ? `${base} · App Code ${count} 个会话` : base
}

const CODEXHOST_CLI_SOURCE_LABELS: Record<CodexhostEnvironmentV1['cliSource'], string> = {
  manual: '手动位置',
  observed: '上次会合点',
  configured: '环境变量',
  local: '用户目录',
  homebrew: 'Homebrew',
  cargo: 'Cargo',
  volta: 'Volta',
  bun: 'Bun',
  nvm: 'NVM',
  app: '应用包内',
  path: '系统 PATH',
  unknown: '未识别位置'
}

/** One line under the CodexHost launch switch: detection, CLI source and Host state. */
export function codexhostSourceStatusText(environment: CodexhostEnvironmentV1 | undefined): string {
  if (!environment) return '插件运行时未提供 CodexHost 检测'
  const parts: string[] = [
    environment.desktop === 'managed'
      ? 'Codex 当前经 CodexHost 启动'
      : environment.desktop === 'plain'
        ? 'Codex 当前未经 CodexHost 启动'
        : environment.desktop === 'closed' ? 'Codex 未运行' : 'Codex 运行状态未知'
  ]
  switch (environment.cliState) {
    case 'manual-valid':
      parts.push('codexhost 命令来自手动位置')
      break
    case 'manual-invalid':
      parts.push('手动 codexhost 位置无效')
      break
    case 'observed':
    case 'discovered':
      parts.push(`codexhost 命令来自${CODEXHOST_CLI_SOURCE_LABELS[environment.cliSource]}`)
      break
    case 'missing':
      parts.push('未找到 codexhost 命令')
      break
    default:
      parts.push('当前系统不支持 codexhost 启动')
  }
  if (environment.runtimeState === 'running') parts.push('Host 运行中')
  else if (environment.runtimeState === 'not-running') parts.push('Host 未运行')
  parts.push(environment.effective ? '当前生效：经 CodexHost 启动' : '当前生效：普通启动')
  return parts.join(' · ')
}

export function cursorSourceStatusText(input: {
  enabled: boolean
  available: boolean
  sessionCount: number
  reason?: string
  hooks?: 'installed' | 'outdated' | 'missing' | 'unknown'
}): string {
  if (!input.enabled) return '关闭时不读取任何 Cursor 数据'
  if (!input.available) {
    if (input.reason === 'not-installed') return '本机未找到 Cursor 状态库'
    if (input.reason === 'sqlite-unavailable') return '当前 uTools 不能用内置 Node 读 Cursor 库'
    return '本机 Cursor 状态库不可读'
  }
  const count = Number.isFinite(input.sessionCount) ? Math.max(0, Math.trunc(input.sessionCount)) : 0
  const base = count > 0 ? `已接入 ${count} 条本机 Agent` : '已接入，当前没有本机 Agent'
  if (input.hooks === 'outdated') return `${base} · 钩子已过期`
  if (input.hooks === 'missing') return `${base} · 钩子未注册`
  return base
}

export function cursorRegistrationRows(
  hooks: 'installed' | 'outdated' | 'missing' | 'unknown' | undefined
): ClaudeRegistrationRow[] {
  const state = hooks || 'unknown'
  return [{
    id: 'hooks',
    label: '事件钩子',
    value: state === 'installed' ? '已注册' : state === 'outdated' ? '已过期' : state === 'missing' ? '未注册' : '未知',
    tone: state === 'installed' ? 'ready' : state === 'unknown' ? 'muted' : 'warning',
    detail: state === 'outdated'
      ? '已注册的钩子命令与当前版本不一致。任务状态会退回冷读，点「重新注册钩子」即可恢复实时。'
      : '事件钩子决定进行中状态是否实时。未注册时仍能从本机库存冷读，但不会随 Cursor Agent 动作即时变化。'
  }]
}

/* ------------------------------------------------------------------ *
 * Registration diagnostics (settings page)
 * ------------------------------------------------------------------ */

export type ClaudeRegistrationRowId = 'hooks' | 'statusline' | 'auth' | 'cli' | 'home' | 'checked'

export type ClaudeRegistrationTone = 'ready' | 'warning' | 'muted'

export interface ClaudeRegistrationRow {
  id: ClaudeRegistrationRowId
  label: string
  /** Short scannable state, e.g. `已注册` / `已过期`. */
  value: string
  tone: ClaudeRegistrationTone
  /** Explanatory copy for the focusable information control, never permanent page text. */
  detail: string
}

/**
 * Per-item registration state for the settings page's source panel.
 *
 * `claudeSetupHint` deliberately reports only the *first* blocking reason,
 * which is right for a one-line status but leaves the user unable to answer
 * "are my hooks registered?" without changing something to find out. These rows
 * are the checkable view of the same snapshot: one line per moving part, each
 * saying what it costs when it is missing.
 *
 * The row set is fixed rather than filtered to problems, because a diagnostic
 * that only appears when broken cannot be used to confirm that things are fine.
 * Explanations live in `detail` (a focusable hint per RAW-087), never as
 * permanently visible instructional copy, and no row ever carries a filesystem
 * path — the same privacy boundary `claudeSetupHint` holds.
 */
export function claudeRegistrationRows(
  environment: ClaudeEnvironmentSnapshot | null | undefined,
  now: number
): ClaudeRegistrationRow[] {
  const hooks = environment?.hooks || 'unknown'
  const statusline = environment?.statusline || 'unknown'
  const checkedAt = environment?.checkedAt || 0
  return [
    {
      id: 'hooks',
      label: '事件钩子',
      value: hooks === 'installed' ? '已注册' : hooks === 'outdated' ? '已过期' : hooks === 'missing' ? '未注册' : '未知',
      tone: hooks === 'installed' ? 'ready' : hooks === 'unknown' ? 'muted' : 'warning',
      detail: hooks === 'outdated'
        ? '已注册的钩子命令与当前版本不一致（升级或数据目录变动后会出现）。任务状态会退回冷读，点「重新注册钩子」即可恢复实时。'
        : '事件钩子决定任务状态是否实时。未注册时仍能从会话记录冷读出状态，但不会随 Claude Code 的动作即时变化。'
    },
    {
      id: 'statusline',
      label: '状态栏包装',
      value: statusline === 'installed' ? '已注册' : statusline === 'missing' ? '未注册' : '未知',
      tone: statusline === 'installed' ? 'ready' : statusline === 'unknown' ? 'muted' : 'warning',
      detail: '额度的常规来源，只在 Claude Code 渲染状态栏时更新。注册时会保留并链式调用你原有的状态栏，移除时原样还原。'
    },
    {
      id: 'auth',
      label: '登录状态',
      value: environment?.authenticated ? '已登录' : '未登录',
      tone: environment?.authenticated ? 'ready' : 'warning',
      detail: '未登录时读不到任何会话与额度。请在 Claude Code 内完成登录，插件只探测凭证是否存在，从不读取其内容。'
    },
    {
      id: 'cli',
      label: '命令行程序',
      value: environment?.installed
        ? (environment.cliVersion ? `已找到 ${environment.cliVersion}` : '已找到')
        : '未找到',
      // Not a warning: the binary only serves the jump action, so a missing one
      // must not make an otherwise healthy panel look broken.
      tone: environment?.installed ? 'ready' : 'muted',
      detail: '仅作环境诊断。打开任务已改为桌面端深链，找不到时不影响状态、额度与从卡片打开。'
    },
    {
      id: 'home',
      label: '数据目录',
      value: environment?.homeReady ? '可读' : '不可读',
      tone: environment?.homeReady ? 'ready' : 'warning',
      detail: 'Claude 数据目录是任务卡片的来源。不可读时任务列表会是空的；插件只读取会话结构，不读取对话正文。'
    },
    {
      id: 'checked',
      label: '最近检查',
      value: checkedAt <= 0 ? '尚未检查' : now - checkedAt < 60_000 ? '刚刚' : elapsedText(checkedAt, now),
      tone: 'muted',
      detail: '环境状态随插件的任务刷新周期自动重新检查，注册或移除钩子后会立即刷新。'
    }
  ]
}
