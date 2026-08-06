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
  /** Dense caption for the chip row. Absent rows fall back to the window family. */
  shortLabel?: string
  remainingPercent: number
  resetAt: number | null
}

/** Which limit window a quota reading covers. Drives the short caption. */
export type CompanionQuotaWindow = 'short' | 'weekly'

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
  // One row per window the payload actually declared, in the domain's display
  // order. Enumerating instead of picking two named fields is what lets an
  // account's per-model weekly appear here at all — the reading was always in
  // the cache, only the projection was hardcoded to `5 小时 + 周`.
  const rows: CompanionQuotaRow[] = slice.claudeQuota.windows.map((entry) => ({
    key: `claude-${entry.key}`,
    label: entry.label,
    shortLabel: entry.shortLabel,
    remainingPercent: entry.remainingPercent,
    resetAt: entry.resetAt
  }))
  return {
    provider: 'claude',
    label,
    rows,
    emptyReason: rows.length ? '' : '尚未读到额度，运行一次 Claude Code 后自动更新'
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
  /**
   * True when the reading is known to be stale. Only Claude chips carry the
   * flag: the Codex chip shape must stay untouched so the Codex-only rendering
   * remains byte-identical to the pre-companion float.
   */
  stale?: boolean
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
      emptyReason: codexWindows.length ? '' : (codexEmptyReason || '服务端未返回额度窗口')
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
        stale: slice?.claudeQuota.status === 'stale'
      })),
      emptyReason: claudeSection.emptyReason
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
  quota: Pick<ClaudeQuotaSnapshot, 'status' | 'updatedAt'> | null | undefined,
  now: number
): string {
  if (!quota) return ''
  const stale = quota.status === 'stale'
  const at = quota.updatedAt || 0
  if (at <= 0) return stale ? '读数可能已过期' : ''
  const minutes = Math.max(0, Math.round((now - at) / 60_000))
  const base = minutes < 1 ? '读数刚刚更新' : `读数更新于 ${elapsedText(at, now)}`
  return stale ? `${base}，可能已过期` : base
}

/**
 * One-line realtime-gap note for the float's existing status line.
 *
 * `claudeSetupHint` owns the fully-unusable lane; this covers the degraded
 * middle ground where cards and quota render but hooks or the status line are
 * not registered, which previously left the float silent about why task states
 * never showed as running. Returns '' whenever Claude is disabled, so the
 * Codex-only status line stays byte-identical.
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
  /** Non-archived desktop-app sessions currently in the inventory. */
  desktopSessionCount: number
}

/**
 * One status line for the settings page's Claude source row.
 *
 * The desktop app is not a separate provider and gets no separate switch — it
 * is the same account seen through another front end, and P1-2 already merged
 * it into the `claude` lane. So its presence is reported as a **fact appended
 * to the existing status**, never as new configuration: RAW-087 separates
 * status (may stay visible) from explanatory copy (must live behind a
 * focusable hint), and a second toggle here would be exactly the provider
 * sprawl the companion taste avoids.
 *
 * A CLI hint and a desktop count can be true at once — no Claude Code binary
 * with three desktop sessions is a real, useful state — so they are joined
 * rather than ranked.
 */
export function claudeSourceStatusText(input: ClaudeSourceStatusInput): string {
  if (!input.enabled) return '关闭时不读取任何 Claude 数据'
  const count = Number.isFinite(input.desktopSessionCount) ? Math.max(0, Math.trunc(input.desktopSessionCount)) : 0
  const hint = claudeSetupHint(input.environment)
  const version = input.environment?.cliVersion || ''
  const base = hint || (version ? `已连接 Claude Code ${version}` : '已连接 Claude Code')
  return count > 0 ? `${base} · 桌面端 ${count} 个会话` : base
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
