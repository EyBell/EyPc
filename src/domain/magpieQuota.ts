/**
 * Magpie (Macpa) local quota gateway projection.
 *
 * EyPc reads the desktop gateway at 127.0.0.1:3425 when it is available and
 * projects only the four readings the collapsed water ball needs. Missing data
 * stays absent rather than being coerced into 0%.
 */

export const MAGPIE_QUOTA_ENDPOINT = 'http://127.0.0.1:3425/v1/magpie/quotas'

import {
  formatCompanionPercent,
  resolveCompanionQuota,
  resolveCompanionRemoteKeyLimit,
  COMPANION_QUOTA_EMAIL_NAMESPACE,
  type CompanionQuotaIdentityRef,
  type CompanionQuotaReading,
  type CompanionQuotaCursorReading,
  type CompanionQuotaSelection
} from './companionQuota'
import { companionQuotaDisplayLabel } from './companionQuotaDisplayLabel'

export type MagpieQuotaProviderId = 'codex' | 'grok' | 'cursor'

export interface MagpieQuotaWindow {
  name: string
  used?: number
  remaining?: number
  resetsAt?: string | null
  unlimited?: boolean
  text?: boolean
  amount?: number
  limit?: number
  unit?: string
}

export interface MagpieQuotaProvider {
  provider: MagpieQuotaProviderId | string
  name?: string
  plan?: string | null
  last?: boolean
  balance?: string | null
  user?: string | null
  workspaceName?: string | null
  windows?: MagpieQuotaWindow[]
  readAt?: string
  kind?: string
  error?: string
  asOf?: string
}

export interface MagpieRemoteLimitReading {
  remainingPercent: number
  used: number | null
  limit: number | null
  unit: 'tokens' | 'USD'
  name: string
  resetAt: number | null
  stale: boolean
}

export interface MagpieQuotaListResponse {
  data?: MagpieQuotaProvider[]
}

export type CompactQuotaGridCellKind = 'percent' | 'token' | 'placeholder' | 'missing'

export interface CompactQuotaGridCell {
  key: 'token' | 'grok' | 'cursor-models' | 'cursor-other'
  label: string
  kind: CompactQuotaGridCellKind
  /** Unrounded percentage when kind is `percent`. */
  percent: number | null
  /** Compact centre text, e.g. `6.9万` or `—`. */
  text: string
  detail: string
  stale?: boolean
}

export type CompactQuotaGridSlot = CompactQuotaGridCell['key']

export interface CompactQuotaGridRow {
  id: 'top' | 'bottom'
  slots: CompactQuotaGridSlot[]
  cells: CompactQuotaGridCell[]
}

export type CompactQuotaGridLayout =
  | 'empty'
  | 'one'
  | 'top-only'
  | 'bottom-only'
  | 'rows'

export interface CompactQuotaGridPresentation {
  enabled: boolean
  status: 'idle' | 'loading' | 'ok' | 'stale' | 'error'
  updatedAt: number
  errorMessage?: string
  cells: CompactQuotaGridCell[]
  rows: CompactQuotaGridRow[]
  layout: CompactQuotaGridLayout
  ariaSuffix: string
}

const EMPTY_GRID: CompactQuotaGridPresentation = {
  enabled: false,
  status: 'idle',
  updatedAt: 0,
  cells: [],
  rows: [],
  layout: 'empty',
  ariaSuffix: ''
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function windowRemaining(provider: MagpieQuotaProvider | null, windowName: string): number | null {
  const windows = provider?.windows
  if (!Array.isArray(windows)) return null
  const window = windows.find((entry) => entry?.name === windowName && validWindowPercent(entry) !== null)
  return validWindowPercent(window)
}

function tokenBalanceNumber(balance: string | null | undefined): number | null {
  if (typeof balance !== 'string') return null
  const match = balance.trim().match(/^((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)(?:\s+(?:credits?|tokens?))?$/i)
  if (!match) return null
  const normalized = Number(match[1].replace(/,/g, ''))
  return Number.isFinite(normalized) ? normalized : null
}

export function parseMagpieTokenBalance(balance: string | null | undefined): number | null {
  const value = tokenBalanceNumber(balance)
  return value !== null && value > 0 ? value : null
}

export function formatMagpieTokenBalance(balance: string | null | undefined): string {
  const value = tokenBalanceNumber(balance)
  if (value === null) return '—'
  if (value > 0 && value < 0.1) return '<0.1'
  if (value >= 10_000) {
    const w = value / 10_000
    return `${w >= 10 ? Math.round(w) : w.toFixed(1).replace(/\.0$/, '')}W`
  }
  if (value >= 1000) {
    const k = value / 1000
    return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')}k`
  }
  return value % 1 === 0 ? String(value) : value.toFixed(1)
}

export function normalizeMagpieQuotaProviders(input: unknown): MagpieQuotaProvider[] {
  if (Array.isArray(input)) return input as MagpieQuotaProvider[]
  if (input && typeof input === 'object' && Array.isArray((input as MagpieQuotaListResponse).data)) {
    return (input as MagpieQuotaListResponse).data as MagpieQuotaProvider[]
  }
  return []
}

function percentCell(
  key: CompactQuotaGridCell['key'],
  label: string,
  percent: number,
  detail: string,
  stale?: boolean
): CompactQuotaGridCell {
  return { key, label, kind: 'percent', percent, text: formatMagpiePercent(percent), detail, stale }
}

export function formatMagpiePercent(percent: number): string {
  if (percent > 0 && percent < 1) return '<1%'
  return `${Number(percent.toFixed(1))}%`
}


const REMOTE_CODEX_PROVIDER = 'remote-magpie/codex'
const REMOTE_GROK_PROVIDER = 'remote-magpie/grok'
const REMOTE_CURSOR_PROVIDER = 'remote-magpie/cursor'

function entriesByProvider(list: MagpieQuotaProvider[], provider: string): MagpieQuotaProvider[] {
  return list.filter((entry) => entry?.provider === provider)
}

function normalizedPlan(plan: string | null | undefined): string {
  return typeof plan === 'string' ? plan.trim().toLowerCase() : ''
}

function isFreeCodexPlan(entry: MagpieQuotaProvider): boolean {
  return normalizedPlan(entry.plan) === 'free'
}

function isPromaxPlan(entry: MagpieQuotaProvider): boolean {
  return normalizedPlan(entry.plan) === 'promax'
}

function compareTokenCodex(
  left: { entry: MagpieQuotaProvider; index: number },
  right: { entry: MagpieQuotaProvider; index: number }
): number {
  const leftPromax = isPromaxPlan(left.entry) ? 1 : 0
  const rightPromax = isPromaxPlan(right.entry) ? 1 : 0
  if (leftPromax !== rightPromax) return rightPromax - leftPromax
  const leftLast = left.entry.last === true ? 1 : 0
  const rightLast = right.entry.last === true ? 1 : 0
  if (leftLast !== rightLast) return rightLast - leftLast
  return left.index - right.index
}

export type MagpieQuotaReading = CompanionQuotaReading
export type MagpieCursorQuotaReading = CompanionQuotaCursorReading
export type MagpieQuotaSelection = CompanionQuotaSelection

export interface MagpieQuotaSelectionOptions {
  status?: CompactQuotaGridPresentation['status']
  updatedAt?: number
  now?: number
  identities?: ReadonlyArray<CompanionQuotaIdentityRef | null>
  quota?: Parameters<typeof resolveCompanionQuota>[0]['quota']
  quotaAccount?: Parameters<typeof resolveCompanionQuota>[0]['quotaAccount']
}

export interface MagpieQuotaProjectionOptions extends MagpieQuotaSelectionOptions {
  selection?: MagpieQuotaSelection
}

function validWindowPercent(window: MagpieQuotaWindow | null | undefined): number | null {
  if (!window || window.unlimited || window.text) return null
  const percent = finiteNumber(window.remaining)
  return percent === null ? null : Math.max(0, Math.min(100, percent))
}

function usableQuotaEntry(entry: MagpieQuotaProvider | null | undefined): entry is MagpieQuotaProvider {
  if (!entry) return false
  const asOf = parseMagpieResetAt(entry.asOf)
  if (entry.asOf !== undefined && asOf === null) return false
  return !entry.error || asOf !== null
}

function entryStale(
  entry: MagpieQuotaProvider,
  resetAt: number | null,
  options: MagpieQuotaSelectionOptions
): boolean {
  return (options.status !== undefined && options.status !== 'ok')
    || entry.asOf !== undefined
    || Boolean(entry.error)
    || (resetAt !== null && resetAt <= (options.now ?? Date.now()))
}

function resetDetail(resetAt: number | null, now: number): string {
  if (resetAt === null) return '重置时间未提供'
  return `重置 ${new Date(resetAt).toISOString()}${resetAt <= now ? '（待刷新）' : ''}`
}

function nearestReset(resets: Array<number | null>): number | null {
  const known = resets.filter((reset): reset is number => reset !== null)
  return known.length ? Math.min(...known) : null
}

export function resolveMagpieQuotaSelection(
  providers: MagpieQuotaProvider[] | null | undefined,
  options: MagpieQuotaSelectionOptions = {}
): MagpieQuotaSelection {
  return resolveCompanionQuota({
    magpieProviders: normalizeMagpieQuotaProviders(providers),
    magpieIdentities: options.identities,
    magpieEnabled: true,
    magpieStatus: options.status ?? 'ok',
    magpieUpdatedAt: options.updatedAt ?? 0,
    quota: options.quota,
    quotaAccount: options.quotaAccount,
    now: finiteNumber(options.now) ?? Date.now()
  }).selection
}

function projectionSelection(
  providers: MagpieQuotaProvider[] | null | undefined,
  options: MagpieQuotaProjectionOptions
): MagpieQuotaSelection {
  return options.selection ?? resolveMagpieQuotaSelection(providers, options)
}

export function hasMagpieAgentQuota(providers: MagpieQuotaProvider[] | null | undefined): boolean {
  return resolveCompanionQuota({ magpieProviders: providers, magpieEnabled: true }).agentEvidence
}

export function resolveMagpieRemoteLimit(
  providers: MagpieQuotaProvider[] | null | undefined,
  options: { status?: CompactQuotaGridPresentation['status']; updatedAt?: number } = {}
): MagpieRemoteLimitReading | null {
  const status = options.status ?? 'ok'
  const selected = resolveCompanionRemoteKeyLimit(normalizeMagpieQuotaProviders(providers), status, Date.now())
  return selected ? { remainingPercent: selected.percent, used: selected.used, limit: selected.limit, unit: selected.unit, name: selected.name, resetAt: selected.resetAt, stale: selected.stale } : null
}

export function formatMagpieRemoteLimitHint(reading: MagpieRemoteLimitReading): string {
  const numberText = (value: number | null) => value === null
    ? '未提供'
    : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 6 }).format(value)
  const parts = [
    `限额剩余 ${formatMagpiePercent(reading.remainingPercent)}`,
    `已用 ${numberText(reading.used)} ${reading.unit}`,
    `上限 ${numberText(reading.limit)} ${reading.unit}`,
    reading.resetAt === null ? '重置时间未提供' : `重置 ${new Date(reading.resetAt).toLocaleString('zh-CN', { hour12: false })}`
  ]
  if (reading.stale) parts.push('上次数据，可能过期')
  return parts.join('；')
}


function buildQuotaGridRows(
  top: Array<CompactQuotaGridCell | null>,
  bottom: Array<CompactQuotaGridCell | null>
): { cells: CompactQuotaGridCell[]; rows: CompactQuotaGridRow[]; layout: CompactQuotaGridLayout } {
  const topCells = top.filter((cell): cell is CompactQuotaGridCell => cell !== null)
  const bottomCells = bottom.filter((cell): cell is CompactQuotaGridCell => cell !== null)
  const rows: CompactQuotaGridRow[] = []
  if (topCells.length) {
    rows.push({
      id: 'top',
      slots: topCells.map((cell) => cell.key),
      cells: topCells
    })
  }
  if (bottomCells.length) {
    rows.push({
      id: 'bottom',
      slots: bottomCells.map((cell) => cell.key),
      cells: bottomCells
    })
  }
  const cells = rows.flatMap((row) => row.cells)
  let layout: CompactQuotaGridLayout = 'empty'
  if (cells.length === 0) layout = 'empty'
  else if (cells.length === 1) layout = 'one'
  else if (rows.length === 1 && rows[0].id === 'top') layout = 'top-only'
  else if (rows.length === 1 && rows[0].id === 'bottom') layout = 'bottom-only'
  else layout = 'rows'
  return { cells, rows, layout }
}

function compactQuotaGridAriaSuffix(cells: readonly CompactQuotaGridCell[]): string {
  const parts = cells.filter((cell) => cell.kind !== 'placeholder').map((cell) => cell.detail)
  return parts.length ? `，${parts.join('；')}` : ''
}

/** Rebuilds fixed-slot rows from a flat visible-cell list (tests / legacy callers). */
export function presentCompactQuotaGridCells(
  cells: CompactQuotaGridCell[] | null | undefined
): Pick<CompactQuotaGridPresentation, 'cells' | 'rows' | 'layout'> {
  const list = Array.isArray(cells) ? cells : []
  const byKey = new Map(list.map((cell) => [cell.key, cell] as const))
  return buildQuotaGridRows(
    [byKey.get('token') ?? null, byKey.get('grok') ?? null],
    [byKey.get('cursor-models') ?? null, byKey.get('cursor-other') ?? null]
  )
}

/** Drops matching cells and rebuilds rows, layout and the accessible suffix together. */
export function omitCompactQuotaGridCells(
  grid: CompactQuotaGridPresentation,
  omit: (cell: CompactQuotaGridCell) => boolean
): CompactQuotaGridPresentation {
  if (!grid.cells.some(omit)) return grid
  const shaped = presentCompactQuotaGridCells(grid.cells.filter((cell) => !omit(cell)))
  return { ...grid, ...shaped, ariaSuffix: compactQuotaGridAriaSuffix(shaped.cells) }
}

export interface MagpieQuotaGridLabelOptions {
  cursorModels?: string
  cursorOther?: string
}

/**
 * Resolves the centre Magpie quadrant grid.
 *
 * Fixed slots: Token top-left, Grok top-right, Cursor Models bottom-left,
 * Cursor Other bottom-right. A slot appears when it has a positive reading;
 * a lone cell in a row centres; an empty row disappears and the other
 * row recentres in the ball.
 */
export function resolveCompactQuotaGridPresentation(
  providers: MagpieQuotaProvider[] | null | undefined,
  options: MagpieQuotaProjectionOptions & {
    enabled?: boolean
    errorMessage?: string
    labels?: MagpieQuotaGridLabelOptions
  } = {}
): CompactQuotaGridPresentation {
  const enabled = options.enabled === true
  if (!enabled) return EMPTY_GRID
  const selection = projectionSelection(providers, options)
  const codex = selection.codex
  const cursorModelsLabel = (options.labels?.cursorModels ?? 'G').trim().slice(0, 4) || 'G'
  const cursorOtherLabel = (options.labels?.cursorOther ?? 'A').trim().slice(0, 4) || 'A'

  const tokenCell: CompactQuotaGridCell | null = codex && (codex.kind === 'token' || (codex.percent !== null && codex.percent > 0))
    ? {
        key: 'token',
        label: codex.kind === 'token' ? 'Token' : 'Codex',
        kind: codex.kind,
        percent: codex.percent,
        text: codex.valueText,
        detail: codex.detail,
        stale: codex.stale
      }
    : null
  const gridCell = (key: CompactQuotaGridCell['key'], label: string, reading: MagpieQuotaReading | null) =>
    reading && reading.percent !== null && reading.percent > 0
      ? percentCell(key, label, reading.percent, reading.detail, reading.stale)
      : null
  const grokCell = gridCell('grok', 'Grok', selection.grok)
  const cursorModelsCell = gridCell('cursor-models', cursorModelsLabel, selection.cursor?.models ?? null)
  const cursorOtherCell = gridCell('cursor-other', cursorOtherLabel, selection.cursor?.other ?? null)

  const { cells, rows, layout } = buildQuotaGridRows(
    [tokenCell, grokCell],
    [cursorModelsCell, cursorOtherCell]
  )
  return {
    enabled: true,
    status: [selection.codex, selection.grok, selection.cursor].some((reading) => reading?.stale)
      && selection.status === 'ok' ? 'stale' : selection.status,
    updatedAt: selection.updatedAt,
    ...(options.errorMessage ? { errorMessage: options.errorMessage } : {}),
    cells,
    rows,
    layout,
    ariaSuffix: compactQuotaGridAriaSuffix(cells)
  }
}

export async function fetchMagpieQuotaProviders(
  endpoint = MAGPIE_QUOTA_ENDPOINT,
  fetchImpl: typeof fetch = fetch
): Promise<MagpieQuotaProvider[]> {
  const response = await fetchImpl(endpoint, { method: 'GET' })
  if (!response.ok) throw new Error(`magpie quota http ${response.status}`)
  const payload = await response.json() as unknown
  if (!Array.isArray(payload)
    && !(payload && typeof payload === 'object' && Array.isArray((payload as MagpieQuotaListResponse).data))) {
    throw new Error('magpie quota invalid response')
  }
  return normalizeMagpieQuotaProviders(payload)
}

export function redactMagpieQuotaProviders(providers: readonly MagpieQuotaProvider[]): MagpieQuotaProvider[] {
  return providers.map((provider) => {
    const { user: _user, ...rest } = provider
    return rest
  })
}

function normalizedCompanionEmail(value: unknown): string {
  if (typeof value !== 'string') return ''
  const email = value.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ''
}

export async function resolveMagpieQuotaIdentities(
  providers: readonly MagpieQuotaProvider[] | null | undefined
): Promise<Array<CompanionQuotaIdentityRef | null>> {
  const subtle = globalThis.crypto?.subtle
  return Promise.all((providers || []).map(async (provider) => {
    const email = normalizedCompanionEmail(provider?.user)
    if (!email || !subtle) return null
    const bytes = await subtle.digest('SHA-256', new TextEncoder().encode(`${COMPANION_QUOTA_EMAIL_NAMESPACE}\n${email}`))
    const emailDigest = [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    const workspaceName = typeof provider.workspaceName === 'string' ? provider.workspaceName.trim().slice(0, 160) : ''
    return {
      emailDigest,
      label: companionQuotaDisplayLabel(email),
      ...(workspaceName ? { workspaceName } : {})
    }
  }))
}

export interface MagpieQuotaExpandCard {
  key: string
  label: string
  valueText: string
  /** 0–100 for progress track; null hides meaningful percent (e.g. token balance). */
  percent: number | null
  resetAt: number | null
  detail: string
}

function parseMagpieResetAt(value: string | null | undefined): number | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

export interface MagpieCodexWeeklyChip {
  percent: number
  valueText: string
  detail: string
  resetAt: number | null
  tokenFallback: boolean
  stale: boolean
  source: 'local' | 'remote'
  accountCount: number
  candidateCount: number
  partial: boolean
  /** True when the right-hand rail already includes this Codex window. */
  resetShown: boolean
}

function magpieCodexWeeklyChip(codex: MagpieQuotaReading | null): MagpieCodexWeeklyChip | null {
  if (!codex) return null
  return {
    ...codex,
    percent: codex.percent ?? 0,
    tokenFallback: codex.kind === 'token',
    resetShown: true
  }
}

/** The selected Codex weekly window, read once for the expanded percent chip. */
export function resolveMagpieCodexWeeklyChip(
  providers: MagpieQuotaProvider[] | null | undefined,
  options: MagpieQuotaProjectionOptions = {}
): MagpieCodexWeeklyChip | null {
  return magpieCodexWeeklyChip(projectionSelection(providers, options).codex)
}

/** Short countdown for expanded cards, aligned with float `formatReset` wording. */
export function magpieResetCountdownText(resetAt: number | null | undefined, now: number): string {
  if (typeof resetAt !== 'number' || !Number.isFinite(resetAt) || resetAt <= 0) return '重置时间未提供'
  if (now >= resetAt) return '待刷新'
  const minutes = Math.max(1, Math.ceil((resetAt - now) / 60_000))
  if (minutes < 60) return `${minutes} 分钟后重置`
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时后重置`
  return `${Math.floor(minutes / 1440)} 天后重置`
}

function expandCard(
  key: string,
  label: string,
  valueText: string,
  percent: number | null,
  resetAt: number | null,
  detail: string
): MagpieQuotaExpandCard {
  return { key, label, valueText, percent, resetAt, detail }
}

/**
 * Expanded float-card quota tiles for each Magpie provider window.
 */
export function buildMagpieQuotaExpandCards(
  providers: MagpieQuotaProvider[] | null | undefined,
  options: MagpieQuotaProjectionOptions = {}
): MagpieQuotaExpandCard[] {
  const list = normalizeMagpieQuotaProviders(providers)
  const cards: MagpieQuotaExpandCard[] = []
  const selection = projectionSelection(providers, options)
  const readings: Array<[string, string, MagpieQuotaReading | null]> = [
    ['magpie-codex-weekly', selection.codex?.kind === 'token' ? 'Magpie Token' : 'Magpie 周', selection.codex],
    ['magpie-grok-weekly', 'Grok 7 天', selection.grok],
    ['magpie-cursor-models', 'Cursor · C', selection.cursor?.models ?? null],
    ['magpie-cursor-other', 'Cursor · O', selection.cursor?.other ?? null]
  ]
  for (const [key, label, reading] of readings) {
    if (reading) cards.push(expandCard(key, label, reading.valueText, reading.percent, reading.resetAt, reading.detail))
  }

  const openrouter = list.find((entry) => entry?.provider === 'openrouter') ?? null
  if (openrouter?.balance) {
    cards.push(expandCard(
      'magpie-openrouter-balance',
      'OpenRouter',
      openrouter.balance,
      null,
      null,
      `OpenRouter 余额 ${openrouter.balance}`
    ))
  }

  return cards
}

/** Compact reading for the single quota row; full details remain in the hint. */
export function magpieResetCompactText(resetAt: number | null | undefined, now: number): string {
  if (typeof resetAt !== 'number' || !Number.isFinite(resetAt) || resetAt <= 0) return '重置时间未提供'
  if (now >= resetAt) return '待刷新'
  const minutes = Math.max(1, Math.ceil((resetAt - now) / 60_000))
  if (minutes < 60) return `${minutes}分`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}时`
  return `${Math.floor(minutes / 1440)}天`
}


export interface MagpieQuotaResetLine {
  key: string
  /** Full supplier name used by the accessible countdown. */
  label: string
  /** One-letter mark drawn beside the countdown. */
  compactLabel: string
  resetAt: number | null
  valueText: string
  detail: string
  stale: boolean
  resetLabel: string
}

export function buildMagpieQuotaResetLines(
  providers: MagpieQuotaProvider[] | null | undefined,
  options: MagpieQuotaProjectionOptions = {}
): MagpieQuotaResetLine[] {
  const lines: MagpieQuotaResetLine[] = []
  const selection = projectionSelection(providers, options)

  const codex = selection.codex
  if (codex) {
    const label = codex.kind === 'token' ? 'Magpie Token' : 'Magpie 周'
    lines.push({
      key: 'magpie-codex',
      label,
      compactLabel: label,
      resetAt: codex.resetAt,
      valueText: codex.valueText,
      detail: codex.detail,
      stale: codex.stale,
      resetLabel: '最近账号重置'
    })
  }

  const grok = selection.grok
  if (grok) {
    lines.push({
      key: 'magpie-grok',
      label: 'Grok',
      compactLabel: 'G',
      resetAt: grok.resetAt,
      valueText: grok.valueText,
      detail: grok.detail,
      stale: grok.stale,
      resetLabel: '重置'
    })
  }

  const cursor = selection.cursor
  if (cursor) {
    lines.push({
      key: 'magpie-cursor',
      label: 'Cursor',
      compactLabel: 'U',
      resetAt: cursor.resetAt,
      valueText: cursor.valueText,
      detail: cursor.detail,
      stale: cursor.stale,
      resetLabel: '最近窗口重置'
    })
  }

  return lines
}

export function formatMagpieQuotaResetInline(
  lines: readonly MagpieQuotaResetLine[],
  now: number
): string {
  if (!lines.length) return ''
  return lines
    .map((line) => `${line.label} ${line.valueText} · ${line.resetLabel} ${magpieResetCountdownText(line.resetAt, now)}${line.stale ? ' · 上次数据' : ''}；${line.detail}`)
    .join(' · ')
}

export { formatCompanionPercent }
