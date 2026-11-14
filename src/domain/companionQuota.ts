import type { CodexQuotaAccountContext, CodexQuotaPool, CodexQuotaSnapshotV1 } from './codex'
import type { ClaudeQuotaSnapshot, ClaudeQuotaWindowEntry } from './claude'
import type { MagpieQuotaProvider, MagpieQuotaWindow } from './magpieQuota'
import { acceptCompanionQuotaDisplayLabel } from './companionQuotaDisplayLabel'

export const COMPANION_QUOTA_EMAIL_NAMESPACE = 'eypc-companion-quota-identity/v1/codex'

export type CompanionQuotaSource = 'local' | 'remote'
export type CompanionQuotaCategory = 'codex' | 'grok' | 'cursor' | 'claude'
export type CompanionQuotaWindowKind = 'weekly' | 'short' | 'balance' | 'model' | 'cursor-models' | 'cursor-other' | 'cursor-extra'

export interface CompanionQuotaIdentityRef {
  emailDigest: string
  label: string
  workspaceName?: string
}

export interface CompanionQuotaWindowFact {
  category: CompanionQuotaCategory
  source: CompanionQuotaSource
  accountKey: string
  emailDigest: string
  workspaceName: string
  label: string
  baseLabel?: string
  displayIndex?: number
  window: CompanionQuotaWindowKind
  windowLabel: string
  percent: number | null
  balance: number | null
  resetAt: number | null
  readAt: number
  stale: boolean
  partial: boolean
  excluded: boolean
  promax: boolean
  last: boolean
  order: number
}

export interface CompanionQuotaReading {
  kind: 'percent' | 'token'
  percent: number | null
  valueText: string
  detail: string
  resetAt: number | null
  stale: boolean
  source: CompanionQuotaSource
  accountCount: number
  candidateCount: number
  partial: boolean
}

export interface CompanionQuotaCursorReading {
  models: CompanionQuotaReading | null
  other: CompanionQuotaReading | null
  valueText: string
  detail: string
  resetAt: number | null
  stale: boolean
  source: CompanionQuotaSource
  partial: boolean
  accountKey: string
}

export interface CompanionQuotaSelection {
  codex: CompanionQuotaReading | null
  grok: CompanionQuotaReading | null
  cursor: CompanionQuotaCursorReading | null
  status: 'idle' | 'loading' | 'ok' | 'stale' | 'error'
  updatedAt: number
  now: number
}

export interface CompanionQuotaResetDetail {
  key: string
  label: string
  baseLabel?: string
  displayIndex?: number
  windowLabel: string
  resetAt: number | null
  stale: boolean
  text: string
}

export interface CompanionQuotaResetGroup {
  category: CompanionQuotaCategory
  label: string
  summary: string
  details: CompanionQuotaResetDetail[]
  detailText: string
  stale: boolean
  partial: boolean
}

export interface CompanionQuotaRing {
  owner: 'codex' | 'claude' | 'magpie' | null
  window: 'weekly' | null
  percent: number | null
  visible: boolean
  reason: string
  stale: boolean
  resetAt: number | null
}

export interface CompanionQuotaResult {
  windows: CompanionQuotaWindowFact[]
  currentWeekly: { percent: number; resetAt: number | null; stale: boolean } | null
  selection: CompanionQuotaSelection
  ring: CompanionQuotaRing
  resets: CompanionQuotaResetGroup[]
  agentEvidence: boolean
  remoteKey: CompanionRemoteKeyLimit | null
  nativeQuota: CodexQuotaSnapshotV1 | null
  centreCodexOrder: number | null
}

export interface CompanionQuotaInput {
  quota?: Pick<CodexQuotaSnapshotV1, 'plan' | 'status'> | CodexQuotaSnapshotV1 | null
  quotaAccount?: CodexQuotaAccountContext | null
  magpieProviders?: readonly MagpieQuotaProvider[] | null
  magpieIdentities?: ReadonlyArray<CompanionQuotaIdentityRef | null>
  magpieEnabled?: boolean
  magpieStatus?: CompanionQuotaSelection['status']
  magpieUpdatedAt?: number
  claudeQuota?: ClaudeQuotaSnapshot | null
  claudeReady?: boolean
  claudeUsageApiAllowed?: boolean
  providers?: { codex?: boolean; claude?: boolean; cursor?: boolean; orca?: boolean }
  ringOwner?: 'codex' | 'claude'
  now?: number
}

const CURSOR_MODELS = 'Cursor Models'
const CURSOR_OTHER = 'Other Models'

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
function clamp(value: number): number { return Math.max(0, Math.min(100, value)) }
export function formatCompanionPercent(percent: number): string {
  if (percent > 0 && percent < 1) return '<1%'
  return `${Number(percent.toFixed(1))}%`
}
export function formatCompanionToken(value: number): string {
  if (value > 0 && value < 0.1) return '<0.1'
  if (value >= 10_000) {
    const scaled = value / 10_000
    return `${scaled >= 10 ? Math.round(scaled) : scaled.toFixed(1).replace(/\.0$/, '')}W`
  }
  if (value >= 1000) {
    const scaled = value / 1000
    return `${scaled >= 10 ? Math.round(scaled) : scaled.toFixed(1).replace(/\.0$/, '')}k`
  }
  return value % 1 === 0 ? String(value) : value.toFixed(1)
}
function balanceValue(value: string | null | undefined): number | null {
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)(?:\s+(?:credits?|tokens?))?$/i)
  if (!match) return null
  const parsed = Number(match[1].replace(/,/g, ''))
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}
function balanceOf(value: string | null | undefined): number | null {
  const parsed = balanceValue(value)
  return parsed !== null && parsed > 0 ? parsed : null
}
function timeOf(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}
function percentOf(window: MagpieQuotaWindow | null | undefined): number | null {
  if (!window || window.unlimited || window.text) return null
  const value = finite(window.remaining)
  return value === null ? null : clamp(value)
}
function named(provider: MagpieQuotaProvider, name: string): MagpieQuotaWindow | null {
  return (provider.windows || []).find((entry) => entry?.name === name && percentOf(entry) !== null) || null
}
function usable(provider: MagpieQuotaProvider): boolean {
  const asOf = timeOf(provider.asOf)
  if (provider.asOf !== undefined && asOf === null) return false
  return !provider.error || asOf !== null
}
function sourceOf(provider: string): CompanionQuotaSource {
  return provider.startsWith('remote-magpie/') ? 'remote' : 'local'
}
function categoryOf(provider: string): 'codex' | 'grok' | 'cursor' | null {
  if (provider === 'codex' || provider === 'remote-magpie/codex') return 'codex'
  if (provider === 'grok' || provider === 'remote-magpie/grok') return 'grok'
  if (provider === 'cursor' || provider === 'remote-magpie/cursor') return 'cursor'
  return null
}
function clock(value: number): string {
  const date = new Date(value + 8 * 3_600_000)
  const part = (size: number) => String(size).padStart(2, '0')
  return `${part(date.getUTCMonth() + 1)}${part(date.getUTCDate())}-${part(date.getUTCHours())}${part(date.getUTCMinutes())}`
}
export function companionResetText(resetAt: number | null, now: number, stale = false): string {
  if (resetAt === null) return '—'
  if (resetAt <= now) return '待刷新'
  const duration = resetAt - now
  if (duration >= 86_400_000) return `${Math.floor(duration / 86_400_000)}D`
  if (duration >= 3_600_000) return `${Math.floor(duration / 3_600_000)}H`
  return `${Math.max(1, Math.floor(duration / 60_000))}M`
}
export function companionResetDetailText(resetAt: number | null, now: number): string {
  if (resetAt === null) return '—'
  return clock(resetAt)
}
function rank(reading: CompanionQuotaReading): number {
  if (reading.kind === 'percent' && (reading.percent ?? -1) > 0) return reading.stale ? 2 : 0
  if (reading.kind === 'token') return reading.stale ? 3 : 1
  if (reading.kind === 'percent' && reading.percent === 0) return 4
  return 5
}
function choose<T extends { source: CompanionQuotaSource }>(values: Array<T | null>, score: (value: T) => number): T | null {
  return values.filter((value): value is T => value !== null)
    .sort((left, right) => score(left) - score(right) || Number(right.source === 'remote') - Number(left.source === 'remote'))[0] ?? null
}
function ambiguousAccountKeys(facts: readonly CompanionQuotaWindowFact[]): Set<string> {
  const grouped = new Map<string, Map<string, Set<string>>>()
  facts.forEach((fact) => {
    if (!fact.emailDigest || fact.category !== 'codex') return
    const sourceGroups = grouped.get(`${fact.source}\u0000${fact.emailDigest}`) || new Map<string, Set<string>>()
    const workspaces = sourceGroups.get(fact.accountKey) || new Set<string>()
    workspaces.add(fact.workspaceName)
    sourceGroups.set(fact.accountKey, workspaces)
    grouped.set(`${fact.source}\u0000${fact.emailDigest}`, sourceGroups)
  })
  const ambiguous = new Set<string>()
  for (const accounts of grouped.values()) {
    if (accounts.size < 2) continue
    const workspaces = new Set([...accounts.values()].flatMap((entry) => [...entry]))
    if (workspaces.size !== 1 || workspaces.has('')) {
      for (const accountKey of accounts.keys()) ambiguous.add(accountKey)
    }
  }
  return ambiguous
}
function dedupe(facts: CompanionQuotaWindowFact[], ambiguous: ReadonlySet<string>): CompanionQuotaWindowFact[] {
  const groups = new Map<string, CompanionQuotaWindowFact[]>()
  facts.forEach((fact) => {
    if (!fact.emailDigest || ambiguous.has(fact.accountKey)) return
    if (!fact.workspaceName) return
    const key = `${fact.category}|${fact.source}|${fact.emailDigest}|${fact.workspaceName}|${fact.window}|${fact.windowLabel}`
    groups.set(key, [...(groups.get(key) || []), fact])
  })
  const dropped = new Set<CompanionQuotaWindowFact>()
  const usableValue = (fact: CompanionQuotaWindowFact) => fact.percent !== null || fact.balance !== null
  for (const rows of groups.values()) {
    const winner = [...rows].sort((left, right) => Number(usableValue(right)) - Number(usableValue(left)) || Number(left.stale) - Number(right.stale) || right.readAt - left.readAt || left.order - right.order)[0]
    rows.forEach((row) => { if (row !== winner) dropped.add(row) })
  }
  return facts.filter((fact) => !dropped.has(fact))
}
function assignLabels(facts: CompanionQuotaWindowFact[]) {
  const groups = new Map<string, string[]>()
  const identityOf = (fact: CompanionQuotaWindowFact) => fact.emailDigest && fact.workspaceName ? `${fact.emailDigest}|${fact.workspaceName}` : fact.accountKey
  facts.forEach((fact) => {
    if (fact.excluded || !fact.label) return
    const identities = groups.get(fact.label) || []
    const identity = identityOf(fact)
    if (!identities.includes(identity)) identities.push(identity)
    groups.set(fact.label, identities)
  })
  facts.forEach((fact) => {
    const identities = groups.get(fact.label)
    const index = identities && identities.length > 1 ? identities.indexOf(identityOf(fact)) : -1
    fact.baseLabel = fact.label
    if (index >= 0) {
      fact.displayIndex = index + 1
      fact.label = `${fact.label}·${fact.displayIndex}`
    }
  })
  const anonymous = new Map<string, string>()
  let next = 1
  facts.forEach((fact) => {
    if (fact.label || fact.excluded || fact.category === 'claude') return
    const known = anonymous.get(fact.accountKey)
    if (known) fact.label = known
    else {
      fact.label = `账号${next}`
      anonymous.set(fact.accountKey, fact.label)
      next += 1
    }
  })
}
function percentReading(percent: number, source: CompanionQuotaSource, resetAt: number | null, stale: boolean, partial: boolean, accounts: number, candidates: number, label: string): CompanionQuotaReading {
  const state = [stale ? '上次数据' : '', partial ? '部分数据' : ''].filter(Boolean).join('，')
  return { kind: 'percent', percent, valueText: formatCompanionPercent(percent), detail: state ? `${label} ${formatCompanionPercent(percent)}，${state}` : `${label} ${formatCompanionPercent(percent)}`, resetAt, stale, source, accountCount: accounts, candidateCount: candidates, partial }
}
function codexReadings(facts: readonly CompanionQuotaWindowFact[], source: CompanionQuotaSource): CompanionQuotaReading[] {
  const weekly = facts.filter((fact) => fact.category === 'codex' && fact.source === source && fact.window === 'weekly' && !fact.excluded)
  const values = weekly.filter((fact) => fact.percent !== null)
  const readings: CompanionQuotaReading[] = []
  if (values.length) {
    const percent = values.reduce((total, fact) => total + (fact.percent as number), 0) / values.length
    const resets = values.map((fact) => fact.resetAt).filter((value): value is number => value !== null)
    readings.push(percentReading(percent, source, resets.length ? Math.min(...resets) : null, values.some((fact) => fact.stale), weekly.some((fact) => fact.partial), values.length, weekly.length, 'Codex'))
  }
  const balances = facts.filter((fact) => fact.category === 'codex' && fact.source === source && fact.window === 'balance' && fact.balance !== null && !fact.excluded)
    .sort((left, right) => Number(left.stale) - Number(right.stale) || Number(right.promax) - Number(left.promax) || Number(right.last) - Number(left.last) || left.order - right.order)
  const selected = balances[0]
  if (selected?.balance !== null && selected?.balance !== undefined && selected.balance > 0) {
    readings.push({ kind: 'token', percent: null, valueText: formatCompanionToken(selected.balance), detail: `Token ${formatCompanionToken(selected.balance)}${selected.stale ? '，上次数据' : ''}`, resetAt: null, stale: selected.stale, source, accountCount: 1, candidateCount: balances.length, partial: weekly.some((fact) => fact.partial) })
  }
  return readings
}
function firstReading(facts: readonly CompanionQuotaWindowFact[], category: 'grok', source: CompanionQuotaSource): CompanionQuotaReading | null {
  const fact = facts.find((entry) => entry.category === category && entry.source === source && entry.window === 'weekly' && entry.percent !== null)
  return fact?.percent === null || fact?.percent === undefined ? null : percentReading(fact.percent, source, fact.resetAt, fact.stale, false, 1, 1, 'Grok')
}
function cursorReading(facts: readonly CompanionQuotaWindowFact[], source: CompanionQuotaSource): CompanionQuotaCursorReading | null {
  const primary = facts.find((fact) => fact.category === 'cursor' && fact.source === source && (fact.window === 'cursor-models' || fact.window === 'cursor-other'))
  if (!primary) return null
  const owned = facts.filter((fact) => fact.accountKey === primary.accountKey)
  const reading = (kind: 'cursor-models' | 'cursor-other') => {
    const fact = owned.find((entry) => entry.window === kind && entry.percent !== null)
    return fact?.percent === null || fact?.percent === undefined ? null : percentReading(fact.percent, source, fact.resetAt, fact.stale, owned.some((entry) => entry.partial), 1, 1, 'Cursor')
  }
  const models = reading('cursor-models')
  const other = reading('cursor-other')
  if (!models && !other) return null
  const stale = Boolean(models?.stale || other?.stale)
  const partial = !models || !other
  const resets = [models?.resetAt ?? null, other?.resetAt ?? null].filter((value): value is number => value !== null)
  return { models: models ? { ...models, stale, partial } : null, other: other ? { ...other, stale, partial } : null, valueText: `C ${models?.valueText ?? '—'} / O ${other?.valueText ?? '—'}`, detail: '', resetAt: resets.length ? Math.min(...resets) : null, stale, source, partial, accountKey: primary.accountKey }
}
function isFullQuota(quota: CodexQuotaSnapshotV1 | Pick<CodexQuotaSnapshotV1, 'plan' | 'status'> | null | undefined): quota is CodexQuotaSnapshotV1 {
  return Boolean(quota && 'updatedAt' in quota && ('weekly' in quota || 'short' in quota || 'normal' in quota || 'spark' in quota))
}
function nativeFacts(quota: CodexQuotaSnapshotV1 | Pick<CodexQuotaSnapshotV1, 'plan' | 'status'> | null | undefined, account: CodexQuotaAccountContext | null, now: number): CompanionQuotaWindowFact[] {
  if (!isFullQuota(quota)) return []
  const normal: CodexQuotaPool = 'normal' in quota ? quota.normal : { limitId: 'codex', limitName: 'Codex', family: 'normal', short: quota.short, weekly: quota.weekly }
  const spark = 'spark' in quota ? quota.spark : []
  const rows: Array<[CodexQuotaPool, 'weekly' | 'short', string]> = []
  if (normal.weekly) rows.push([normal, 'weekly', '周'])
  if (normal.short) rows.push([normal, 'short', '短'])
  spark.forEach((pool) => {
    if (pool.weekly) rows.push([pool, 'weekly', 'Spark周'])
    if (pool.short) rows.push([pool, 'short', 'Spark短'])
  })
  return rows.flatMap(([pool, window, windowLabel], index) => {
    const bucket = window === 'weekly' ? pool.weekly : pool.short
    if (!bucket) return []
    return [{
      category: 'codex' as const, source: 'local' as const, accountKey: `native:${pool.limitId}`, emailDigest: account?.emailDigest || '',
      workspaceName: account?.workspaceName || '', label: account?.label || '', window, windowLabel,
      percent: clamp(bucket.remainingPercent), balance: null, resetAt: bucket.resetAt, readAt: quota.updatedAt || 0,
      stale: quota.status !== 'ok' || (bucket.resetAt !== null && bucket.resetAt <= now), partial: false, excluded: pool.family === 'spark',
      promax: false, last: true, order: -100 + index
    }]
  })
}
function detail(fact: CompanionQuotaWindowFact, now: number): CompanionQuotaResetDetail {
  return { key: `${fact.category}:${fact.accountKey}:${fact.window}:${fact.windowLabel}`, label: fact.label, baseLabel: fact.baseLabel, displayIndex: fact.displayIndex, windowLabel: fact.windowLabel, resetAt: fact.resetAt, stale: fact.stale, text: companionResetText(fact.resetAt, now, fact.stale) }
}
function group(category: CompanionQuotaCategory, label: string, facts: CompanionQuotaWindowFact[], now: number, ambiguous: ReadonlySet<string>, partial = false): CompanionQuotaResetGroup | null {
  const seen = new Set<string>()
  const rows = facts.filter((fact) => fact.window !== 'balance').filter((fact) => {
    const identity = fact.emailDigest && fact.workspaceName && !ambiguous.has(fact.accountKey) ? `${fact.emailDigest}|${fact.workspaceName}` : fact.accountKey
    const key = `${fact.category}|${identity}|${fact.window}|${fact.windowLabel}|${fact.resetAt ?? 'none'}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  if (!rows.length) return null
  const accountRows = category === 'codex'
    ? [...rows.reduce((accounts, fact) => {
        const current = accounts.get(fact.accountKey)
        if (!current || ((fact.resetAt ?? Number.MAX_SAFE_INTEGER) < (current.resetAt ?? Number.MAX_SAFE_INTEGER))) accounts.set(fact.accountKey, fact)
        return accounts
      }, new Map<string, CompanionQuotaWindowFact>()).values()]
    : rows
  const monthNames = new Set(['Other Models', 'Free usage', 'Total'])
  const monthRow = category === 'cursor'
    ? rows.find((fact) => fact.windowLabel === 'Cursor Models' && fact.resetAt !== null)
      || rows.find((fact) => monthNames.has(fact.windowLabel) && fact.resetAt !== null)
      || rows.find((fact) => fact.windowLabel === 'Cursor Models')
      || null
    : null
  const botRow = category === 'cursor' ? rows.find((fact) => fact.windowLabel === 'Grok Bot') || null : null
  const compactRows = category === 'cursor' ? [monthRow, botRow].filter((fact): fact is CompanionQuotaWindowFact => fact != null) : accountRows
  const summaryRows = category === 'cursor' ? (monthRow ? [monthRow] : []) : compactRows
  const details = compactRows.map((fact) => ({ ...detail(fact, now), text: companionResetDetailText(fact.resetAt, now) }))
  const stale = rows.some((fact) => fact.stale)
  const groupPartial = partial || rows.some((fact) => fact.partial)
  const known = summaryRows.filter((fact) => fact.resetAt !== null)
  const expired = known.some((fact) => (fact.resetAt as number) <= now)
  const future = known.map((fact) => fact.resetAt as number).filter((value) => value > now)
  const summary = !summaryRows.length && category === 'cursor' ? '—' : expired ? '待刷新' : future.length ? companionResetText(Math.min(...future), now) : '—'
  const suffix = (item: CompanionQuotaResetDetail) => item.displayIndex ? ` ·${item.displayIndex}` : ''
  return { category, label, summary, details, detailText: details.map((item) => category === 'cursor' ? `${item.windowLabel === 'Grok Bot' ? 'Bot' : '月'} ${item.text}${suffix(item)}` : `${item.baseLabel || item.label} ${item.text}${suffix(item)}`).join('\n'), stale, partial: groupPartial }
}
function claudeFacts(quota: ClaudeQuotaSnapshot | null | undefined, ready: boolean, usageApiAllowed: boolean, now: number): CompanionQuotaWindowFact[] {
  if (!ready || !quota) return []
  const windows: ClaudeQuotaWindowEntry[] = (quota.windows?.length ? quota.windows : [])
    .filter((entry) => entry.source !== 'usage-api' || usageApiAllowed)
  return windows.filter((entry) => entry.kind === 'weekly' || entry.kind === 'short' || entry.kind === 'other').map((entry, index) => ({
    category: 'claude', source: 'local', accountKey: 'claude', emailDigest: '', workspaceName: '', label: 'Claude',
    window: entry.kind === 'weekly' && entry.scope ? 'model' : entry.kind === 'weekly' ? 'weekly' : entry.kind === 'other' ? 'model' : 'short', windowLabel: entry.shortLabel || entry.label,
    percent: clamp(entry.remainingPercent), balance: null, resetAt: entry.resetAt, readAt: entry.updatedAt || quota.updatedAt || 0,
    stale: entry.freshness === 'fresh' ? entry.resetAt !== null && entry.resetAt <= now : entry.freshness === 'stale' || entry.freshness === 'unknown' || entry.freshness === undefined && quota.status !== 'ok' || (entry.resetAt !== null && entry.resetAt <= now), partial: false,
    excluded: false, promax: false, last: false, order: 100000 + index
  }))
}


export interface CompanionRemoteKeyLimit {
  percent: number
  resetAt: number | null
  stale: boolean
  name: string
  used: number | null
  limit: number | null
  unit: 'tokens' | 'USD'
}

export function resolveCompanionRemoteKeyLimit(
  providers: readonly MagpieQuotaProvider[] | null | undefined,
  status: CompanionQuotaSelection['status'],
  now: number
): CompanionRemoteKeyLimit | null {
  if (status !== 'ok' && status !== 'stale') return null
  const cards = (providers || []).filter((entry) => String(entry.provider || '').endsWith('/~keys'))
  if (cards.length !== 1) return null
  const card = cards[0]
  if (card.kind !== 'plan' || !Array.isArray(card.windows)) return null
  const asOf = timeOf(card.asOf)
  if ((card.asOf !== undefined && asOf === null) || (card.error && asOf === null)) return null
  let selected: CompanionRemoteKeyLimit | null = null
  for (const window of card.windows) {
    if (!window || window.unlimited === true || window.text === true
      || (window.unlimited !== undefined && typeof window.unlimited !== 'boolean')
      || (window.text !== undefined && typeof window.text !== 'boolean')
      || (window.unit !== 'tokens' && window.unit !== 'USD')) continue
    const used = finite(window.amount)
    const limit = finite(window.limit)
    if ((window.amount !== undefined && (used === null || used < 0))
      || (window.limit !== undefined && (limit === null || limit <= 0))) continue
    let percent = finite(window.remaining)
    if (window.remaining !== undefined && (percent === null || percent < 0 || percent > 100)) continue
    if (percent === null && used !== null && limit !== null) percent = clamp((1 - used / limit) * 100)
    if (percent === null) continue
    if (!selected || percent < selected.percent) {
      selected = {
        percent,
        resetAt: timeOf(window.resetsAt),
        stale: status === 'stale' || asOf !== null || Boolean(window.resetsAt && timeOf(window.resetsAt) !== null && (timeOf(window.resetsAt) as number) <= now),
        name: typeof window.name === 'string' ? window.name.trim().slice(0, 80) : '',
        used,
        limit,
        unit: window.unit
      }
    }
  }
  return selected
}

export function resolveCompanionQuota(input: CompanionQuotaInput): CompanionQuotaResult {
  const now = finite(input.now) ?? Date.now()
  const status = input.magpieStatus ?? 'ok'
  const providers = input.magpieEnabled === false ? [] : [...(input.magpieProviders || [])]
  const codexEnabled = input.providers?.codex !== false
  const native = codexEnabled ? nativeFacts(input.quota, input.quotaAccount || null, now) : []
  const nativeWeekly = native.find((fact) => fact.accountKey === 'native:codex' && fact.window === 'weekly' && fact.windowLabel === '周')
    || native.find((fact) => fact.window === 'weekly' && fact.windowLabel === '周')
  const facts: CompanionQuotaWindowFact[] = []
  let rawAgentEvidence = false
  const seen = new Set<string>()
  providers.forEach((provider, index) => {
    const category = categoryOf(String(provider.provider || ''))
    if (!category) return
    const source = sourceOf(String(provider.provider))
    const evidenceWeekly = named(provider, '7 days')
    const evidenceModels = named(provider, CURSOR_MODELS)
    const evidenceOther = named(provider, CURSOR_OTHER)
    const evidenceExtras = (provider.windows || []).some((entry) => entry?.name && entry.name !== CURSOR_MODELS && entry.name !== CURSOR_OTHER && percentOf(entry) !== null)
    if (category === 'codex' && (evidenceWeekly || balanceValue(provider.balance) !== null)) rawAgentEvidence = true
    if (category === 'grok' && evidenceWeekly) rawAgentEvidence = true
    if (category === 'cursor' && (evidenceModels || evidenceOther || evidenceExtras)) rawAgentEvidence = true
    if ((category === 'grok' || category === 'cursor') && seen.has(`${category}:${source}`)) return
    if (category === 'grok' || category === 'cursor') seen.add(`${category}:${source}`)
    const identity = input.magpieIdentities?.[index]
    const emailDigest = identity && /^[a-f0-9]{64}$/.test(identity.emailDigest) ? identity.emailDigest : ''
    const label = acceptCompanionQuotaDisplayLabel(identity?.label || '')
    const workspaceName = identity?.workspaceName?.trim().slice(0, 160) || ''
    const readAt = timeOf(provider.readAt) || timeOf(provider.asOf) || 0
    const accountKey = `${category}:${source}:${index}`
    const base = { category, source, accountKey, emailDigest, workspaceName, label, readAt, excluded: false, promax: String(provider.plan || '').trim().toLowerCase() === 'promax', last: provider.last === true, order: index }
    if (category === 'codex' && String(provider.plan || '').trim().toLowerCase() === 'free') return
    if (!usable(provider)) {
      if (category === 'codex') facts.push({ ...base, window: 'weekly', windowLabel: '周', percent: null, balance: null, resetAt: null, partial: true, stale: true })
      return
    }
    const push = (window: CompanionQuotaWindowKind, windowLabel: string, percent: number | null, balance: number | null, resetAt: number | null, partial: boolean) => facts.push({ ...base, window, windowLabel, percent, balance, resetAt, partial, stale: status !== 'ok' || provider.asOf !== undefined || Boolean(provider.error) || (resetAt !== null && resetAt <= now) })
    if (category === 'codex') {
      const weekly = named(provider, '7 days')
      const balance = balanceValue(provider.balance)
      push('weekly', '周', weekly ? percentOf(weekly) : null, null, timeOf(weekly?.resetsAt), !weekly)
      if (balance !== null) push('balance', '余额', null, balance, null, false)
      return
    }
    if (category === 'grok') {
      const weekly = named(provider, '7 days')
      if (weekly) push('weekly', '周', percentOf(weekly), null, timeOf(weekly.resetsAt), false)
      return
    }
    const models = named(provider, CURSOR_MODELS)
    const other = named(provider, CURSOR_OTHER)
    const extras = (provider.windows || []).filter((entry) => entry?.name && entry.name !== CURSOR_MODELS && entry.name !== CURSOR_OTHER && percentOf(entry) !== null)
    const partial = !models || !other
    if (models) push('cursor-models', CURSOR_MODELS, percentOf(models), null, timeOf(models.resetsAt), partial)
    if (other) push('cursor-other', CURSOR_OTHER, percentOf(other), null, timeOf(other.resetsAt), partial)
    for (const extra of provider.windows || []) {
      if (!extra?.name || extra.name === CURSOR_MODELS || extra.name === CURSOR_OTHER || percentOf(extra) === null) continue
      push('cursor-extra', extra.name, percentOf(extra), null, timeOf(extra.resetsAt), partial)
    }
  })
  const ambiguous = ambiguousAccountKeys(facts)
  const deduped = dedupe(facts, ambiguous)
  let currentWeekly = nativeWeekly ? { percent: nativeWeekly.percent as number, resetAt: nativeWeekly.resetAt, stale: nativeWeekly.stale } : null
  const currentAccount = input.quotaAccount
  const identityMatches = (fact: CompanionQuotaWindowFact) => {
    if (!currentAccount?.emailDigest || fact.category !== 'codex' || fact.emailDigest !== currentAccount.emailDigest) return false
    if (fact.workspaceName && currentAccount.workspaceName && fact.workspaceName !== currentAccount.workspaceName) return false
    return !ambiguous.has(fact.accountKey)
  }
  const confirmedAccounts = new Set<string>()
  for (const source of ['local', 'remote'] as const) {
    const accounts = new Map<string, { digest: string; workspace: string }>()
    deduped.filter((fact) => fact.source === source && identityMatches(fact)).forEach((fact) => accounts.set(fact.accountKey, { digest: fact.emailDigest, workspace: fact.workspaceName }))
    const identities = new Set([...accounts.values()].map((account) => `${account.digest}\u0000${account.workspace}`))
    if (accounts.size === 1 || identities.size === 1) for (const accountKey of accounts.keys()) confirmedAccounts.add(accountKey)
  }
  if (currentWeekly?.stale) {
    const fresh = deduped
      .filter((fact) => confirmedAccounts.has(fact.accountKey) && fact.window === 'weekly' && fact.percent !== null && !fact.stale)
      .sort((left, right) => Number(right.source === 'remote') - Number(left.source === 'remote') || right.readAt - left.readAt || left.order - right.order)
    if (fresh[0]) currentWeekly = { percent: fresh[0].percent as number, resetAt: fresh[0].resetAt, stale: false }
  }
  const hasOrdinaryWeekly = Boolean(nativeWeekly)
  if (hasOrdinaryWeekly) {
    deduped.forEach((fact) => {
      if (confirmedAccounts.has(fact.accountKey) && (fact.window === 'weekly' || fact.window === 'balance')) fact.excluded = true
    })
  }
  const claude = claudeFacts(input.claudeQuota, input.claudeReady === true, input.claudeUsageApiAllowed !== false, now)
  assignLabels([...native, ...deduped, ...claude])
  const visible = deduped.filter((fact) => !fact.excluded)
  const sources: CompanionQuotaSource[] = ['local', 'remote']
  const codex = choose(sources.flatMap((source) => codexReadings(visible, source)), rank)
  const grok = choose(sources.map((source) => firstReading(visible, 'grok', source)), rank)
  const cursor = choose(sources.map((source) => cursorReading(visible, source)), (value) => ((value.models?.percent ?? 0) > 0 || (value.other?.percent ?? 0) > 0 ? (value.stale ? 2 : 0) : 4))
  const cursorRows = cursor ? visible.filter((fact) => fact.accountKey === cursor.accountKey && fact.percent !== null) : []
  const selectedCodexSource = codex?.kind === 'percent' ? codex.source : null
  const currentWeeklyFact = currentWeekly && nativeWeekly
    ? { ...nativeWeekly, percent: currentWeekly.percent, resetAt: currentWeekly.resetAt, stale: currentWeekly.stale, excluded: false }
    : null
  const codexReset = [
    ...(currentWeeklyFact ? [currentWeeklyFact] : []),
    ...native.filter((fact) => fact.window === 'short' || fact.windowLabel.startsWith('Spark')),
    ...visible.filter((fact) => fact.category === 'codex' && fact.window === 'weekly' && fact.source === selectedCodexSource && fact.percent !== null)
  ]
  const enablement = input.providers
  const codexOnly = !enablement || (enablement.codex !== false && enablement.claude !== true && enablement.cursor !== true && enablement.orca !== true)
  const remoteKey = codexOnly && input.ringOwner !== 'claude' && !rawAgentEvidence
    && native.length === 0
    && String(input.quota?.plan || '').trim().toLowerCase() === 'free'
    && input.quota?.status === 'ok'
    ? resolveCompanionRemoteKeyLimit(providers, status, now)
    : null
  if (remoteKey) {
    codexReset.push({
      category: 'codex', source: 'remote', accountKey: 'remote-key', emailDigest: '', workspaceName: '', label: '限额',
      window: 'weekly', windowLabel: remoteKey.name || '限额', percent: remoteKey.percent, balance: null,
      resetAt: remoteKey.resetAt, readAt: input.magpieUpdatedAt || 0, stale: remoteKey.stale, partial: false,
      excluded: false, promax: false, last: false, order: 900000
    })
  }
  const resets = [
    group('codex', 'Codex', codexReset, now, ambiguous, Boolean(codex?.partial)),
    group('grok', 'Grok', visible.filter((fact) => fact.category === 'grok' && fact.source === grok?.source), now, ambiguous),
    group('cursor', 'Cursor', cursorRows, now, ambiguous),
    group('claude', 'Claude', claude, now, ambiguous)
  ].filter((entry): entry is CompanionQuotaResetGroup => entry !== null)
  const positive = codex?.kind === 'percent' && (codex.percent ?? 0) > 0 ? codex.percent : null
  const claudeWeekly = claude.find((fact) => fact.window === 'weekly' && fact.windowLabel !== 'Spark周')
  const codexRing: CompanionQuotaRing = remoteKey
    ? { owner: 'codex', window: 'weekly', percent: remoteKey.percent, visible: true, reason: 'free-codex-key-limit', stale: remoteKey.stale, resetAt: remoteKey.resetAt }
    : currentWeekly && currentWeekly.percent > 0
    ? { owner: 'codex', window: 'weekly', percent: currentWeekly.percent, visible: true, reason: 'native-weekly', stale: currentWeekly.stale, resetAt: currentWeekly.resetAt }
    : positive !== null
      ? { owner: 'magpie', window: 'weekly', percent: positive, visible: true, reason: currentWeekly ? 'native-weekly-exhausted' : 'native-weekly-missing', stale: Boolean(codex?.stale), resetAt: codex?.resetAt ?? null }
      : currentWeekly
        ? { owner: 'codex', window: 'weekly', percent: 0, visible: true, reason: 'native-weekly-zero', stale: currentWeekly.stale, resetAt: currentWeekly.resetAt }
        : { owner: null, window: null, percent: null, visible: false, reason: 'no-weekly-reading', stale: false, resetAt: null }
  const claudeRing: CompanionQuotaRing = claudeWeekly
    ? { owner: 'claude', window: 'weekly', percent: claudeWeekly.percent ?? 0, visible: true, reason: 'claude-weekly', stale: claudeWeekly.stale, resetAt: claudeWeekly.resetAt }
    : { owner: null, window: null, percent: null, visible: false, reason: 'no-weekly-reading', stale: false, resetAt: null }
  const hiddenCodexRing: CompanionQuotaRing = { owner: null, window: null, percent: null, visible: false, reason: 'no-weekly-reading', stale: false, resetAt: null }
  const ring = input.ringOwner === 'claude' ? claudeRing : codexEnabled ? codexRing : hiddenCodexRing
  return {
    windows: [...native, ...deduped, ...claude], currentWeekly,
    selection: { codex, grok, cursor, status, updatedAt: input.magpieUpdatedAt || 0, now },
    ring, resets,
    agentEvidence: rawAgentEvidence,
    remoteKey,
    nativeQuota: codexEnabled && isFullQuota(input.quota) ? input.quota : null,
    centreCodexOrder: ring.owner === 'magpie' ? visible.find((fact) => fact.category === 'codex' && fact.window === 'weekly' && fact.percent !== null)?.order ?? null : null
  }
}
