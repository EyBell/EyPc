/** Pure quota and registration-readiness domain for the Claude provider. */

export type ClaudeQuotaStatus = 'idle' | 'loading' | 'ok' | 'stale' | 'error'
export type ClaudeQuotaWindowKind = 'short' | 'weekly' | 'other'
export type ClaudeQuotaAccessStatus = 'idle' | 'ok' | 'credential-unavailable' | 'rate-limited' | 'failed'

/** Privacy-safe App OAuth health; contains no account, path, task or token data. */
export interface ClaudeQuotaAccessSnapshot {
  status: ClaudeQuotaAccessStatus
  lastAttemptAt: number
  retryAt: number
}

export function emptyClaudeQuotaAccess(): ClaudeQuotaAccessSnapshot {
  return { status: 'idle', lastAttemptAt: 0, retryAt: 0 }
}

export function normalizeClaudeQuotaAccess(value: unknown): ClaudeQuotaAccessSnapshot {
  const source = value && typeof value === 'object' ? value as Partial<ClaudeQuotaAccessSnapshot> : {}
  const status: ClaudeQuotaAccessStatus = ['idle', 'ok', 'credential-unavailable', 'rate-limited', 'failed'].includes(String(source.status))
    ? source.status as ClaudeQuotaAccessStatus
    : 'idle'
  return {
    status,
    lastAttemptAt: Number.isFinite(source.lastAttemptAt) ? Math.max(0, Number(source.lastAttemptAt)) : 0,
    retryAt: Number.isFinite(source.retryAt) ? Math.max(0, Number(source.retryAt)) : 0
  }
}

export interface ClaudeQuotaWindow {
  remainingPercent: number
  resetAt: number | null
  windowMinutes: number
}

/** One limit window exactly as the upstream payload declared it. */
export interface ClaudeQuotaWindowEntry extends ClaudeQuotaWindow {
  key: string
  kind: ClaudeQuotaWindowKind
  scope: string
  /** Upstream window discriminator, e.g. session / weekly_all / weekly_scoped. */
  upstreamType?: string
  label: string
  shortLabel: string
  /** Per-window provenance prevents the UI from inferring it from a merged snapshot. */
  source?: ClaudeQuotaSnapshot['source']
  updatedAt?: number
  freshness?: 'fresh' | 'stale' | 'unknown'
}

export interface ClaudeQuotaSnapshot {
  version: 1
  status: ClaudeQuotaStatus
  windows: ClaudeQuotaWindowEntry[]
  short: ClaudeQuotaWindow | null
  weekly: ClaudeQuotaWindow | null
  source: 'statusline' | 'usage-api' | 'plan-history' | 'none'
  updatedAt: number
}

export const CLAUDE_SHORT_WINDOW_MINUTES = 5 * 60
export const CLAUDE_WEEKLY_WINDOW_MINUTES = 7 * 24 * 60

export function emptyClaudeQuota(): ClaudeQuotaSnapshot {
  return { version: 1, status: 'idle', windows: [], short: null, weekly: null, source: 'none', updatedAt: 0 }
}

function usedPercentToRemaining(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.round(100 - Math.min(100, Math.max(0, value)))
}

/** Normalizes epoch seconds, epoch milliseconds or an ISO reset timestamp. */
export function claudeResetAtToMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value > 1e11 ? Math.round(value) : Math.round(value * 1000)
  }
  if (typeof value === 'string' && value) {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  }
  return null
}

export function claudeQuotaWindowExpired(
  window: Pick<ClaudeQuotaWindow, 'resetAt'> | null | undefined,
  now: number
): boolean {
  return Boolean(window && window.resetAt !== null && now >= window.resetAt)
}

/** A merged window is fresh only while it still carries a future reset. */
function claudeQuotaWindowFreshness(resetAt: number | null | undefined, now: number): 'fresh' | 'stale' {
  return typeof resetAt === 'number' && resetAt > now ? 'fresh' : 'stale'
}

/**
 * Snapshot status for a merged window list: any window without a live reset
 * marks the whole reading stale. `normalizeClaudeQuota` keeps its own stricter
 * plausibility rule for a payload straight from upstream; merges and the
 * stale-marking pass share this one.
 */
function claudeQuotaMergedStatus(windows: readonly ClaudeQuotaWindowEntry[], now: number): ClaudeQuotaStatus {
  return windows.some((entry) => !entry.resetAt || claudeQuotaWindowExpired(entry, now)) ? 'stale' : 'ok'
}

function markExpiredClaudeQuotaWindows(windows: readonly ClaudeQuotaWindowEntry[], now: number): ClaudeQuotaWindowEntry[] {
  return windows.map((entry) => entry.resetAt !== null && entry.resetAt <= now
    ? { ...entry, resetAt: null, freshness: 'stale' as const }
    : entry)
}

interface ClaudeRateLimitWindowInput {
  used_percentage?: unknown
  resets_at?: unknown
  display_name?: unknown
  scope?: unknown
  upstream_type?: unknown
}

export interface ClaudeRateLimitsInput {
  five_hour?: ClaudeRateLimitWindowInput | null
  seven_day?: ClaudeRateLimitWindowInput | null
  [key: string]: ClaudeRateLimitWindowInput | null | undefined
}

function titleCaseScope(value: string): string {
  const cleaned = value.replace(/[_-]+/g, ' ').trim()
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : ''
}

function describeQuotaKey(key: string): { kind: ClaudeQuotaWindowKind; scope: string; windowMinutes: number } {
  const match = /^(five_hour|seven_day)(?:[_-](.+))?$/.exec(key)
  const scope = titleCaseScope(match?.[2] || '')
  if (match?.[1] === 'five_hour') return { kind: 'short', scope, windowMinutes: CLAUDE_SHORT_WINDOW_MINUTES }
  if (match?.[1] === 'seven_day') return { kind: 'weekly', scope, windowMinutes: CLAUDE_WEEKLY_WINDOW_MINUTES }
  return { kind: 'other', scope: titleCaseScope(key), windowMinutes: 0 }
}

function quotaWindowLabels(kind: ClaudeQuotaWindowKind, scope: string): { label: string; shortLabel: string } {
  const base = kind === 'short' ? '5 小时限额' : kind === 'weekly' ? '周限额' : scope || '限额'
  const shortBase = kind === 'short' ? '5h' : kind === 'weekly' ? '周' : (scope || '限额').slice(0, 4)
  if (!scope || kind === 'other') return { label: base, shortLabel: shortBase }
  return { label: `${base} · ${scope}`, shortLabel: `${shortBase}·${scope}` }
}

function quotaWindowRank(entry: ClaudeQuotaWindowEntry): number {
  if (entry.kind === 'short') return entry.scope ? 1 : 0
  if (entry.kind === 'weekly') return entry.scope ? 3 : 2
  return 4
}

function windowFrom(
  key: string,
  input: ClaudeRateLimitWindowInput | null | undefined,
  metadata: { source?: ClaudeQuotaSnapshot['source']; updatedAt?: number } = {}
): ClaudeQuotaWindowEntry | null {
  if (!input || typeof input !== 'object') return null
  const remainingPercent = usedPercentToRemaining(input.used_percentage)
  if (remainingPercent === null) return null
  const inferred = describeQuotaKey(key)
  const declaredScope = typeof input.display_name === 'string' && input.display_name.trim()
    ? input.display_name.trim().slice(0, 80)
    : typeof input.scope === 'string' && input.scope.trim()
      ? input.scope.trim().slice(0, 80)
      : ''
  const description = { ...inferred, scope: declaredScope || inferred.scope }
  return {
    key,
    ...description,
    upstreamType: typeof input.upstream_type === 'string' ? input.upstream_type.slice(0, 80) : undefined,
    ...quotaWindowLabels(description.kind, description.scope),
    remainingPercent,
    resetAt: claudeResetAtToMs(input.resets_at),
    source: metadata.source || 'statusline',
    updatedAt: Number.isFinite(metadata.updatedAt) ? metadata.updatedAt : 0,
    freshness: 'unknown'
  }
}

function plausibleResetAt(entry: ClaudeQuotaWindowEntry, now: number): boolean {
  if (entry.resetAt === null) return false
  const tolerance = 5 * 60 * 1000
  const maximum = entry.windowMinutes > 0
    ? entry.windowMinutes * 60 * 1000 + tolerance
    : 366 * 24 * 60 * 60 * 1000
  return entry.resetAt > now && entry.resetAt <= now + maximum
}

function plainWindow(
  windows: readonly ClaudeQuotaWindowEntry[],
  kind: ClaudeQuotaWindowKind
): ClaudeQuotaWindow | null {
  return windows.find((entry) => entry.kind === kind && !entry.scope) || null
}

/**
 * Rebuilds a snapshot around a replaced window list. The plain `short` /
 * `weekly` fields are projections of `windows`, so every caller that swaps the
 * list goes through here instead of re-deriving them by hand.
 */
export function withClaudeQuotaWindows(
  base: ClaudeQuotaSnapshot,
  windows: readonly ClaudeQuotaWindowEntry[],
  patch: Partial<Pick<ClaudeQuotaSnapshot, 'status' | 'source' | 'updatedAt'>> = {}
): ClaudeQuotaSnapshot {
  return {
    ...base,
    ...patch,
    windows: [...windows],
    short: plainWindow(windows, 'short'),
    weekly: plainWindow(windows, 'weekly')
  }
}

/** Keeps all declared windows; model names are data, never an allowlist. */
export function normalizeClaudeQuota(
  input: ClaudeRateLimitsInput | null | undefined,
  options: {
    source?: ClaudeQuotaSnapshot['source']
    updatedAt?: number
    status?: ClaudeQuotaStatus
    now?: number
  } = {}
): ClaudeQuotaSnapshot {
  const source = options.source || 'statusline'
  const updatedAt = Number.isFinite(options.updatedAt) ? options.updatedAt! : 0
  const now = Number.isFinite(options.now) ? options.now! : null
  let invalidReset = false
  const windows = (input && typeof input === 'object' ? Object.keys(input) : [])
    .map((key) => windowFrom(key, input?.[key], { source, updatedAt }))
    .filter((entry): entry is ClaudeQuotaWindowEntry => entry !== null)
    .map((entry) => {
      if (now === null) return entry
      const valid = plausibleResetAt(entry, now)
      if (!valid) invalidReset = true
      return {
        ...entry,
        resetAt: valid ? entry.resetAt : null,
        freshness: valid ? 'fresh' as const : 'stale' as const
      }
    })
    .sort((left, right) => quotaWindowRank(left) - quotaWindowRank(right))
  return {
    version: 1,
    status: options.status || (windows.length ? (invalidReset ? 'stale' : 'ok') : 'idle'),
    windows,
    short: plainWindow(windows, 'short'),
    weekly: plainWindow(windows, 'weekly'),
    source: windows.length ? source : 'none',
    updatedAt
  }
}

/** Latest two-window sample written by Claude App plan history. */
export interface ClaudePlanUsageSample {
  at: number
  fiveHourUsedPercent: number | null
  sevenDayUsedPercent: number | null
}

function seedWindow(key: string, usedPercent: number | null, updatedAt: number): ClaudeQuotaWindowEntry | null {
  return usedPercent === null
    ? null
    : windowFrom(key, { used_percentage: usedPercent }, { source: 'plan-history', updatedAt })
}

/** Refreshes plain percentages without erasing resets or scoped windows. */
export function mergeClaudePlanUsage(
  quota: ClaudeQuotaSnapshot | null | undefined,
  sample: ClaudePlanUsageSample | null | undefined,
  now: number = Date.now()
): ClaudeQuotaSnapshot {
  const base = quota || emptyClaudeQuota()
  if (!sample || !Number.isFinite(sample.at) || sample.at <= 0) return base
  const byKind: Partial<Record<'short' | 'weekly', number | null>> = {
    short: sample.fiveHourUsedPercent,
    weekly: sample.sevenDayUsedPercent
  }
  const patched = base.windows.map((entry) => {
    if (entry.scope || entry.kind === 'other') return entry
    if (sample.at <= (entry.updatedAt || 0)) return entry
    const remainingPercent = usedPercentToRemaining(byKind[entry.kind])
    return remainingPercent === null ? entry : {
      ...entry,
      remainingPercent,
      source: 'plan-history',
      updatedAt: sample.at,
      freshness: claudeQuotaWindowFreshness(entry.resetAt, now)
    }
  })
  const hasPlainShort = patched.some((entry) => entry.kind === 'short' && !entry.scope)
  const hasPlainWeekly = patched.some((entry) => entry.kind === 'weekly' && !entry.scope)
  const windows = [
    ...patched,
    ...(hasPlainShort ? [] : [seedWindow('five_hour', sample.fiveHourUsedPercent, sample.at)]),
    ...(hasPlainWeekly ? [] : [seedWindow('seven_day', sample.sevenDayUsedPercent, sample.at)])
  ]
    .filter((entry): entry is ClaudeQuotaWindowEntry => entry !== null)
    .sort((left, right) => quotaWindowRank(left) - quotaWindowRank(right))
  if (!windows.length) return base
  return withClaudeQuotaWindows(base, windows, {
    status: claudeQuotaMergedStatus(windows, now),
    source: patched.length ? base.source : 'plan-history',
    updatedAt: Math.max(base.updatedAt, sample.at)
  })
}

/** A two-window sample cannot prove that no scoped weekly window exists. */
export function quotaNeedsClaudeSupplement(
  quota: ClaudeQuotaSnapshot | null | undefined,
  now: number = Date.now()
): boolean {
  return !quota?.windows.length
    || !quota.short
    || !quota.weekly
    || quota.short.resetAt === null
    || quota.short.resetAt <= now
    || quota.weekly.resetAt === null
    || quota.weekly.resetAt <= now
    || !quota.windows.some((entry) => Boolean(entry.scope))
    || quota.windows.some((entry) => Boolean(entry.scope) && (entry.resetAt === null || entry.resetAt <= now))
}

/** Non-destructive, key-based merge of a bounded complete-source supplement. */
export function mergeClaudeQuotaWindows(
  baseInput: ClaudeQuotaSnapshot | null | undefined,
  incoming: ClaudeQuotaSnapshot | null | undefined,
  now: number = Date.now()
): ClaudeQuotaSnapshot {
  const base = baseInput || emptyClaudeQuota()
  if (!incoming?.windows.length) return base
  const byKey = new Map(base.windows.map((entry) => [entry.key, entry]))
  for (const entry of incoming.windows) {
    const previous = byKey.get(entry.key)
    const incomingWindowAt = entry.updatedAt || incoming.updatedAt
    const previousWindowAt = previous?.updatedAt || base.updatedAt
    if (!previous || incomingWindowAt >= previousWindowAt) {
      // A percentage-only source may advance usage, but it cannot erase a
      // still-valid reset moment from a complete earlier source.
      const resetAt = entry.resetAt ?? (previous?.resetAt && previous.resetAt > now ? previous.resetAt : null)
      byKey.set(entry.key, {
        ...entry,
        resetAt,
        // An incoming reset counts as fresh even when it is already past: the
        // expiry pass below turns it stale, exactly as before this helper.
        freshness: entry.resetAt ? 'fresh' : claudeQuotaWindowFreshness(resetAt, now)
      })
    }
  }
  const windows = markExpiredClaudeQuotaWindows([...byKey.values()], now)
    .sort((left, right) => quotaWindowRank(left) - quotaWindowRank(right))
  return withClaudeQuotaWindows(base, windows, {
    status: claudeQuotaMergedStatus(windows, now),
    source: incoming.updatedAt >= base.updatedAt || base.source === 'none' ? incoming.source : base.source,
    updatedAt: Math.max(base.updatedAt, incoming.updatedAt)
  })
}

export function staleClaudeQuota(
  previous: ClaudeQuotaSnapshot | null | undefined,
  now: number = Date.now()
): ClaudeQuotaSnapshot {
  if (!previous?.windows.length) return { ...emptyClaudeQuota(), status: 'stale' }
  return withClaudeQuotaWindows(previous, markExpiredClaudeQuotaWindows(previous.windows, now), { status: 'stale' })
}

/**
 * The single reading that stands for Claude as a whole (water ball centre).
 *
 * The plain weekly window owns it: it is the limit that actually paces a week
 * of work, while the 5-hour window swings too fast to read as a status number.
 * Both fallbacks exist only so an account that never reports a plain weekly
 * window still gets a reading instead of an empty ball; `windows[0]` keeps the
 * scoped-only account covered.
 */
export function claudePrimaryQuotaWindow(quota: ClaudeQuotaSnapshot | null | undefined): ClaudeQuotaWindow | null {
  return quota?.weekly || quota?.short || quota?.windows[0] || null
}

/**
 * The scoped weekly window that reads beside the plain one (water ball centre).
 *
 * A per-model weekly limit is what actually stops the work first, so it earns
 * the leading position in the centre while the plain weekly keeps the trailing
 * one. Model names stay data rather than an allowlist: a Fable window only wins
 * *among* the scoped weeklies, and an account whose scope is named something
 * else still contributes its reading instead of falling back to one number.
 */
export function claudeScopedWeeklyQuotaWindow(
  quota: ClaudeQuotaSnapshot | null | undefined
): ClaudeQuotaWindowEntry | null {
  const scoped = (quota?.windows || []).filter((entry) => entry.kind === 'weekly' && Boolean(entry.scope))
  if (!scoped.length) return null
  return scoped.find((entry) => /fable/i.test(`${entry.scope} ${entry.key}`)) || scoped[0]
}

export interface ClaudeEnvironmentSnapshot {
  version: 1
  installed: boolean
  homeReady: boolean
  authenticated: boolean
  cliVersion: string
  hooks: 'installed' | 'missing' | 'outdated' | 'unknown'
  statusline: 'installed' | 'missing' | 'unknown'
  checkedAt: number
}

export function emptyClaudeEnvironment(): ClaudeEnvironmentSnapshot {
  return {
    version: 1,
    installed: false,
    homeReady: false,
    authenticated: false,
    cliVersion: '',
    hooks: 'unknown',
    statusline: 'unknown',
    checkedAt: 0
  }
}

/** App inventory can remain readable when CLI registration is degraded. */
export function claudeReadinessReason(
  environment: ClaudeEnvironmentSnapshot | null | undefined
): 'ready' | 'not-installed' | 'not-authenticated' | 'degraded' | 'unknown' {
  if (!environment) return 'unknown'
  if (!environment.installed && !environment.homeReady) return 'not-installed'
  if (!environment.authenticated) return 'not-authenticated'
  if (!environment.homeReady || !environment.installed || environment.hooks !== 'installed') return 'degraded'
  return 'ready'
}

export function isClaudeAvailable(environment: ClaudeEnvironmentSnapshot | null | undefined): boolean {
  const reason = claudeReadinessReason(environment)
  return reason === 'ready' || reason === 'degraded'
}
