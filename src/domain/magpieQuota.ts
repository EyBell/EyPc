/**
 * Magpie (Macpa) local quota gateway projection.
 *
 * EyPc reads the desktop gateway at 127.0.0.1:3425 when it is available and
 * projects only the four readings the collapsed water ball needs. Missing data
 * stays absent rather than being coerced into 0%.
 */

export const MAGPIE_QUOTA_ENDPOINT = 'http://127.0.0.1:3425/v1/magpie/quotas'

export type MagpieQuotaProviderId = 'codex' | 'grok' | 'cursor'

export interface MagpieQuotaWindow {
  name: string
  used?: number
  remaining?: number
  resetsAt?: string | null
}

export interface MagpieQuotaProvider {
  provider: MagpieQuotaProviderId | string
  name?: string
  plan?: string | null
  last?: boolean
  balance?: string | null
  windows?: MagpieQuotaWindow[]
  readAt?: string
}

export interface MagpieQuotaListResponse {
  data?: MagpieQuotaProvider[]
}

export type CompactQuotaGridCellKind = 'percent' | 'token' | 'placeholder' | 'missing'

export interface CompactQuotaGridCell {
  key: 'token' | 'grok' | 'cursor-models' | 'cursor-other'
  label: string
  kind: CompactQuotaGridCellKind
  /** Whole-number percentage when kind is `percent`. */
  percent: number | null
  /** Compact centre text, e.g. `6.9万` or `—`. */
  text: string
  detail: string
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

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function providerEntry(list: MagpieQuotaProvider[] | null | undefined, id: MagpieQuotaProviderId): MagpieQuotaProvider | null {
  if (!Array.isArray(list)) return null
  return list.find((entry) => entry?.provider === id) ?? null
}

function windowRemaining(provider: MagpieQuotaProvider | null, windowName: string): number | null {
  const windows = provider?.windows
  if (!Array.isArray(windows)) return null
  const window = windows.find((entry) => entry?.name === windowName)
  const remaining = finiteNumber(window?.remaining)
  return remaining === null ? null : clampPercent(remaining)
}

/** Parses `68541.61 credits` into a display number while keeping the unit implicit in copy. */
export function parseMagpieTokenBalance(balance: string | null | undefined): number | null {
  if (typeof balance !== 'string') return null
  const match = balance.trim().match(/([\d,.]+)/)
  if (!match) return null
  const normalized = Number(match[1].replace(/,/g, ''))
  return Number.isFinite(normalized) ? normalized : null
}

export function formatMagpieTokenBalance(balance: string | null | undefined): string {
  const value = parseMagpieTokenBalance(balance)
  if (value === null) return '—'
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
  key: Exclude<CompactQuotaGridCell['key'], 'token'>,
  label: string,
  percent: number,
  detail: string
): CompactQuotaGridCell {
  return { key, label, kind: 'percent', percent, text: String(percent), detail }
}

function shouldShowPercentQuota(percent: number | null): boolean {
  return percent !== null && percent > 0
}

function shouldShowTokenBalance(tokenValue: number | null, codexWeekly: number | null): boolean {
  if (tokenValue === null || tokenValue <= 0) return false
  return codexWeekly === null || codexWeekly === 0
}


const REMOTE_CODEX_PROVIDER = 'remote-magpie/codex'
const REMOTE_GROK_PROVIDER = 'remote-magpie/grok'
const REMOTE_CURSOR_PROVIDER = 'remote-magpie/cursor'

function isRemoteQuotaProvider(provider: string): boolean {
  return provider === REMOTE_CODEX_PROVIDER
    || provider === REMOTE_GROK_PROVIDER
    || provider === REMOTE_CURSOR_PROVIDER
}

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

interface CodexQuotaCandidate {
  entry: MagpieQuotaProvider
  index: number
  weekly: number | null
}

function compareActiveCodex(left: CodexQuotaCandidate, right: CodexQuotaCandidate): number {
  const leftLast = left.entry.last === true ? 1 : 0
  const rightLast = right.entry.last === true ? 1 : 0
  if (leftLast !== rightLast) return rightLast - leftLast
  const leftPromax = isPromaxPlan(left.entry) ? 1 : 0
  const rightPromax = isPromaxPlan(right.entry) ? 1 : 0
  if (leftPromax !== rightPromax) return rightPromax - leftPromax
  const leftWeekly = left.weekly ?? -1
  const rightWeekly = right.weekly ?? -1
  if (leftWeekly !== rightWeekly) return rightWeekly - leftWeekly
  return left.index - right.index
}

function compareTokenCodex(left: CodexQuotaCandidate, right: CodexQuotaCandidate): number {
  const leftPromax = isPromaxPlan(left.entry) ? 1 : 0
  const rightPromax = isPromaxPlan(right.entry) ? 1 : 0
  if (leftPromax !== rightPromax) return rightPromax - leftPromax
  const leftLast = left.entry.last === true ? 1 : 0
  const rightLast = right.entry.last === true ? 1 : 0
  if (leftLast !== rightLast) return rightLast - leftLast
  return left.index - right.index
}

function selectRemoteCodex(entries: MagpieQuotaProvider[]): MagpieQuotaProvider | null {
  const candidates = entries
    .map((entry, index) => ({ entry, index, weekly: windowRemaining(entry, '7 days') }))
    .filter((candidate) => !isFreeCodexPlan(candidate.entry))
  if (!candidates.length) return null
  const active = candidates.filter((candidate) => candidate.weekly !== null && candidate.weekly > 0)
  if (active.length) return [...active].sort(compareActiveCodex)[0].entry
  const funded = candidates.filter((candidate) => {
    const balance = parseMagpieTokenBalance(candidate.entry.balance)
    return balance !== null && balance > 0
  })
  if (funded.length) return [...funded].sort(compareTokenCodex)[0].entry
  return [...candidates].sort(compareActiveCodex)[0].entry
}

interface MagpieQuotaSources {
  codex: MagpieQuotaProvider | null
  grok: MagpieQuotaProvider | null
  cursor: MagpieQuotaProvider | null
}

function resolveMagpieQuotaSources(list: MagpieQuotaProvider[]): MagpieQuotaSources {
  const remoteMode = list.some((entry) => typeof entry?.provider === 'string' && isRemoteQuotaProvider(entry.provider))
  if (!remoteMode) {
    return {
      codex: providerEntry(list, 'codex'),
      grok: providerEntry(list, 'grok'),
      cursor: providerEntry(list, 'cursor')
    }
  }
  return {
    codex: selectRemoteCodex(entriesByProvider(list, REMOTE_CODEX_PROVIDER)),
    grok: entriesByProvider(list, REMOTE_GROK_PROVIDER)[0] ?? null,
    cursor: entriesByProvider(list, REMOTE_CURSOR_PROVIDER)[0] ?? null
  }
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

export interface MagpieQuotaGridLabelOptions {
  cursorModels?: string
  cursorOther?: string
}

/**
 * Resolves the centre Magpie quadrant grid.
 *
 * Fixed slots: Token top-left, Grok top-right, Cursor Models bottom-left,
 * Cursor Other bottom-right. A slot appears only when it still has remaining
 * value; a lone cell in a row centres; an empty row disappears and the other
 * row recentres in the ball.
 */
export function resolveCompactQuotaGridPresentation(
  providers: MagpieQuotaProvider[] | null | undefined,
  options: {
    enabled?: boolean
    status?: CompactQuotaGridPresentation['status']
    updatedAt?: number
    errorMessage?: string
    labels?: MagpieQuotaGridLabelOptions
  } = {}
): CompactQuotaGridPresentation {
  const enabled = options.enabled === true
  if (!enabled) return EMPTY_GRID
  const status = options.status || 'idle'
  const updatedAt = options.updatedAt || 0
  const list = normalizeMagpieQuotaProviders(providers)
  const sources = resolveMagpieQuotaSources(list)
  const codex = sources.codex
  const grok = sources.grok
  const cursor = sources.cursor
  const codexWeekly = windowRemaining(codex, '7 days')
  const grokWeekly = windowRemaining(grok, '7 days')
  const cursorModels = windowRemaining(cursor, 'Cursor Models')
  const cursorOther = windowRemaining(cursor, 'Other Models')
  const cursorModelsLabel = (options.labels?.cursorModels ?? 'G').trim().slice(0, 4) || 'G'
  const cursorOtherLabel = (options.labels?.cursorOther ?? 'A').trim().slice(0, 4) || 'A'

  const tokenBalance = codex?.balance ?? null
  const tokenText = formatMagpieTokenBalance(tokenBalance)
  const tokenValue = parseMagpieTokenBalance(tokenBalance)

  const tokenCell: CompactQuotaGridCell | null = shouldShowTokenBalance(tokenValue, codexWeekly)
    ? {
        key: 'token',
        label: 'Token',
        kind: 'token',
        percent: null,
        text: tokenText,
        detail: typeof tokenBalance === 'string' ? `Codex Token 余量 ${tokenBalance}` : `Codex Token 余量 ${tokenText}`
      }
    : null
  const grokCell = shouldShowPercentQuota(grokWeekly)
    ? percentCell('grok', 'Grok', grokWeekly as number, `Grok 7 天剩余 ${grokWeekly}%`)
    : null
  const cursorModelsCell = shouldShowPercentQuota(cursorModels)
    ? percentCell('cursor-models', cursorModelsLabel, cursorModels as number, `Cursor Models 剩余 ${cursorModels}%`)
    : null
  const cursorOtherCell = shouldShowPercentQuota(cursorOther)
    ? percentCell('cursor-other', cursorOtherLabel, cursorOther as number, `Cursor Other Models 剩余 ${cursorOther}%`)
    : null

  const { cells, rows, layout } = buildQuotaGridRows(
    [tokenCell, grokCell],
    [cursorModelsCell, cursorOtherCell]
  )
  const ariaParts = cells
    .filter((cell) => cell.kind !== 'placeholder')
    .map((cell) => cell.detail)
  return {
    enabled: true,
    status,
    updatedAt,
    ...(options.errorMessage ? { errorMessage: options.errorMessage } : {}),
    cells,
    rows,
    layout,
    ariaSuffix: ariaParts.length ? `，${ariaParts.join('；')}` : ''
  }
}

export async function fetchMagpieQuotaProviders(
  endpoint = MAGPIE_QUOTA_ENDPOINT,
  fetchImpl: typeof fetch = fetch
): Promise<MagpieQuotaProvider[]> {
  const response = await fetchImpl(endpoint, { method: 'GET' })
  if (!response.ok) throw new Error(`magpie quota http ${response.status}`)
  const payload = await response.json() as unknown
  const providers = normalizeMagpieQuotaProviders(payload)
  if (!providers.length) throw new Error('magpie quota empty')
  return providers
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

function windowByName(provider: MagpieQuotaProvider | null, windowName: string): MagpieQuotaWindow | null {
  if (!provider?.windows) return null
  return provider.windows.find((entry) => entry?.name === windowName) ?? null
}

/** Short countdown for expanded cards, aligned with float `formatReset` wording. */
export function magpieResetCountdownText(resetAt: number | null | undefined, now: number): string {
  if (typeof resetAt !== 'number' || !Number.isFinite(resetAt) || resetAt <= 0) return '重置时间未提供'
  if (now >= resetAt) return '窗口已重置 · 等待新读数'
  const minutes = Math.max(0, Math.round((resetAt - now) / 60_000))
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
  providers: MagpieQuotaProvider[] | null | undefined
): MagpieQuotaExpandCard[] {
  const list = normalizeMagpieQuotaProviders(providers)
  if (!list.length) return []
  const cards: MagpieQuotaExpandCard[] = []
  const sources = resolveMagpieQuotaSources(list)

  const codex = sources.codex
  const codexWeekly = windowByName(codex, '7 days')
  const codexRemaining = finiteNumber(codexWeekly?.remaining)
  if (codexRemaining !== null) {
    const resetAt = parseMagpieResetAt(codexWeekly?.resetsAt)
    cards.push(expandCard(
      'magpie-codex-weekly',
      'Codex 周额度',
      codexRemaining === 0 && codex?.balance ? formatMagpieTokenBalance(codex.balance) : String(clampPercent(codexRemaining)),
      codexRemaining,
      resetAt,
      codexRemaining === 0 && codex?.balance
        ? `周额度已用尽，Token ${codex.balance}`
        : `Codex 7 天剩余 ${clampPercent(codexRemaining)}%`
    ))
  }

  const grok = sources.grok
  const grokWeekly = windowByName(grok, '7 days')
  const grokRemaining = finiteNumber(grokWeekly?.remaining)
  if (grokRemaining !== null) {
    cards.push(expandCard(
      'magpie-grok-weekly',
      'Grok 7 天',
      String(clampPercent(grokRemaining)),
      clampPercent(grokRemaining),
      parseMagpieResetAt(grokWeekly?.resetsAt),
      `Grok 7 天剩余 ${clampPercent(grokRemaining)}%`
    ))
  }

  const cursor = sources.cursor
  const cursorModels = windowByName(cursor, 'Cursor Models')
  const cursorOther = windowByName(cursor, 'Other Models')
  const modelsRemaining = finiteNumber(cursorModels?.remaining)
  if (modelsRemaining !== null) {
    cards.push(expandCard(
      'magpie-cursor-models',
      'Cursor · C',
      String(clampPercent(modelsRemaining)),
      clampPercent(modelsRemaining),
      parseMagpieResetAt(cursorModels?.resetsAt),
      `Cursor Models 剩余 ${clampPercent(modelsRemaining)}%`
    ))
  }
  const otherRemaining = finiteNumber(cursorOther?.remaining)
  if (otherRemaining !== null) {
    cards.push(expandCard(
      'magpie-cursor-other',
      'Cursor · O',
      String(clampPercent(otherRemaining)),
      clampPercent(otherRemaining),
      parseMagpieResetAt(cursorOther?.resetsAt),
      `Cursor Other Models 剩余 ${clampPercent(otherRemaining)}%`
    ))
  }

  const openrouter = list.find((entry) => entry.provider === 'openrouter') ?? null
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
  if (typeof resetAt !== 'number' || !Number.isFinite(resetAt) || resetAt <= 0) return '—'
  if (now >= resetAt) return '已重置'
  const minutes = Math.max(1, Math.ceil((resetAt - now) / 60_000))
  if (minutes < 60) return `${minutes}分`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}时`
  return `${Math.floor(minutes / 1440)}天`
}


export interface MagpieQuotaResetLine {
  key: string
  /** Short label for the single-line bar, e.g. Codex / Grok / Cursor. */
  label: string
  resetAt: number | null
}

/**
 * One reset countdown per supplier for the expanded float bar. Cursor C/O share
 * one line because Magpie reports the same reset window for both.
 */
export function buildMagpieQuotaResetLines(
  providers: MagpieQuotaProvider[] | null | undefined
): MagpieQuotaResetLine[] {
  const list = normalizeMagpieQuotaProviders(providers)
  if (!list.length) return []
  const lines: MagpieQuotaResetLine[] = []
  const sources = resolveMagpieQuotaSources(list)

  const codex = sources.codex
  const codexWeekly = windowByName(codex, '7 days')
  if (finiteNumber(codexWeekly?.remaining) !== null || parseMagpieResetAt(codexWeekly?.resetsAt)) {
    lines.push({
      key: 'magpie-codex',
      label: 'Codex',
      resetAt: parseMagpieResetAt(codexWeekly?.resetsAt)
    })
  }

  const grok = sources.grok
  const grokWeekly = windowByName(grok, '7 days')
  if (finiteNumber(grokWeekly?.remaining) !== null) {
    lines.push({
      key: 'magpie-grok',
      label: 'Grok',
      resetAt: parseMagpieResetAt(grokWeekly?.resetsAt)
    })
  }

  const cursor = sources.cursor
  const cursorModels = windowByName(cursor, 'Cursor Models')
  const cursorOther = windowByName(cursor, 'Other Models')
  const hasCursor = finiteNumber(cursorModels?.remaining) !== null || finiteNumber(cursorOther?.remaining) !== null
  if (hasCursor) {
    const resetAt = parseMagpieResetAt(cursorModels?.resetsAt)
      ?? parseMagpieResetAt(cursorOther?.resetsAt)
    lines.push({ key: 'magpie-cursor', label: 'Cursor', resetAt })
  }

  return lines
}

export function formatMagpieQuotaResetInline(
  lines: readonly MagpieQuotaResetLine[],
  now: number
): string {
  if (!lines.length) return ''
  return lines
    .map((line) => `${line.label} ${magpieResetCountdownText(line.resetAt, now)}`)
    .join(' · ')
}
