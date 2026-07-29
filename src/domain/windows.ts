export type WindowPlatform = 'darwin' | 'win32'

export interface LiveWindow {
  id: string
  platform: WindowPlatform
  nativeRef: string
  appId: string
  appName: string
  pid: number
  title: string
  minimized: boolean
  focused: boolean
}

export interface WindowTarget {
  id: string
  alias: string
  platform: WindowPlatform
  appId: string
  appName: string
  titleLocator: string
  /** Recent successfully verified titles used only to recover the same logical window after native ids change. */
  titleHistory?: string[]
  lastNativeRef: string | null
  favorite: boolean
  pinned: boolean
  createdAt: number
  updatedAt: number
}

export interface WindowTargetCandidate<T extends Pick<LiveWindow, 'platform' | 'appId' | 'appName' | 'title'>> {
  live: T
  score: number
  exact: boolean
  sharedAnchor: boolean
}

export interface WindowTargetCandidateResolution<T extends Pick<LiveWindow, 'platform' | 'appId' | 'appName' | 'title'>> {
  live: T | null
  candidates: T[]
  kind: 'exact' | 'similar' | 'ambiguous' | 'confirmation' | 'none'
  score: number
}

export interface WindowSlot {
  slot: number
  targetIdByPlatform: Partial<Record<WindowPlatform, string>>
}

export const WINDOW_SLOT_COUNT = 10

/** Exact normalized titles that are host/IME chrome, not jump targets. */
const HOST_SHELL_TITLES = new Set([
  'program manager',
  'default ime',
  'msctfime ui',
  'gdi+ window',
  'olemainthreadwndname',
  'cicerouiwndframe',
  'cicero ui wnd frame'
])

export function normalizeWindowText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

export function compareWindowRowsByApplication<T extends { pinned: boolean; appName: string; displayName: string; title: string; id: string }>(left: T, right: T): number {
  if (left.pinned !== right.pinned) return left.pinned ? -1 : 1
  return left.appName.localeCompare(right.appName, undefined, { sensitivity: 'base' })
    || left.displayName.localeCompare(right.displayName, undefined, { sensitivity: 'base' })
    || left.title.localeCompare(right.title, undefined, { sensitivity: 'base' })
    || left.id.localeCompare(right.id, undefined, { sensitivity: 'base' })
}

export function liveWindowIdentity(window: Pick<LiveWindow, 'platform' | 'nativeRef'>): string {
  return `${window.platform}:${window.nativeRef}`
}

export function targetMatchesLiveWindow(target: Pick<WindowTarget, 'platform' | 'appId' | 'appName' | 'titleLocator'>, window: Pick<LiveWindow, 'platform' | 'appId' | 'appName' | 'title'>): boolean {
  if (!windowTargetAppMatches(target, window)) return false
  const targetTitle = normalizeWindowText(target.titleLocator)
  return Boolean(targetTitle && targetTitle === normalizeWindowText(window.title))
}

export function windowTargetAppMatches(
  target: Pick<WindowTarget, 'platform' | 'appId' | 'appName'>,
  window: Pick<LiveWindow, 'platform' | 'appId' | 'appName'>
): boolean {
  if (target.platform !== window.platform) return false
  const targetApp = normalizeWindowText(target.appId || target.appName)
  const liveApp = normalizeWindowText(window.appId || window.appName)
  return Boolean(targetApp && targetApp === liveApp)
}

const WINDOW_TITLE_HISTORY_LIMIT = 4
const WINDOW_TITLE_CONFIRMATION_SCORE = 0.46
const WINDOW_TITLE_SINGLE_AUTO_SCORE = 0.66
const WINDOW_TITLE_MULTI_AUTO_SCORE = 0.82
const WINDOW_TITLE_MULTI_AUTO_MARGIN = 0.16
const WINDOW_TITLE_GENERIC_TOKENS = new Set([
  'browser', 'dashboard', 'document', 'editor', 'file', 'folder', 'home', 'index', 'main', 'new', 'page',
  'preferences', 'project', 'readme', 'settings', 'tab', 'untitled', 'window', '文档', '文件', '新标签页', '设置', '首页'
])

function uniqueWindowTitles(values: readonly string[]): string[] {
  const normalized = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const title = String(value || '').trim()
    const key = normalizeWindowText(title)
    if (!key || normalized.has(key)) continue
    normalized.add(key)
    result.push(title)
  }
  return result
}

export function rememberWindowTargetTitle(target: Pick<WindowTarget, 'titleLocator' | 'titleHistory'>, title: string): string[] {
  return uniqueWindowTitles([title, target.titleLocator, ...(target.titleHistory || [])]).slice(0, WINDOW_TITLE_HISTORY_LIMIT + 1)
}

function textLength(value: string): number {
  return Array.from(value).length
}

function titleTokens(value: string): string[] {
  return value.match(/[\p{L}\p{N}]+/gu)?.filter((token) => {
    if (/^\d+$/u.test(token)) return token.length >= 4
    return /[^\x00-\x7f]/u.test(token) ? textLength(token) >= 2 : token.length >= 3
  }) || []
}

function isDistinctiveTitleToken(token: string): boolean {
  return !WINDOW_TITLE_GENERIC_TOKENS.has(normalizeWindowText(token))
}

function stripApplicationIdentity(title: string, appNames: readonly string[]): string {
  let result = normalizeWindowText(title)
  for (const appName of appNames) {
    const normalizedApp = normalizeWindowText(appName)
    if (normalizedApp.length >= 3) result = result.split(normalizedApp).join(' ')
  }
  return result.replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim()
}

function ngramDice(left: string, right: string, size = 3): number {
  if (left === right) return left ? 1 : 0
  if (left.length < size || right.length < size) return 0
  const counts = new Map<string, number>()
  for (let index = 0; index <= left.length - size; index += 1) {
    const gram = left.slice(index, index + size)
    counts.set(gram, (counts.get(gram) || 0) + 1)
  }
  let shared = 0
  for (let index = 0; index <= right.length - size; index += 1) {
    const gram = right.slice(index, index + size)
    const count = counts.get(gram) || 0
    if (!count) continue
    shared += 1
    counts.set(gram, count - 1)
  }
  return (2 * shared) / ((left.length - size + 1) + (right.length - size + 1))
}

function tokenDice(left: readonly string[], right: readonly string[]): number {
  const leftSet = new Set(left)
  const rightSet = new Set(right)
  const weight = (token: string) => Math.min(12, Math.max(2, textLength(token)))
  const leftWeight = [...leftSet].reduce((sum, token) => sum + weight(token), 0)
  const rightWeight = [...rightSet].reduce((sum, token) => sum + weight(token), 0)
  if (!leftWeight || !rightWeight) return 0
  const sharedWeight = [...leftSet].reduce((sum, token) => sum + (rightSet.has(token) ? weight(token) : 0), 0)
  return (2 * sharedWeight) / (leftWeight + rightWeight)
}

function commonEdgeRatio(left: string, right: string, fromEnd = false): number {
  const a = fromEnd ? Array.from(left).reverse() : Array.from(left)
  const b = fromEnd ? Array.from(right).reverse() : Array.from(right)
  const limit = Math.min(a.length, b.length)
  let shared = 0
  while (shared < limit && a[shared] === b[shared]) shared += 1
  return limit ? shared / limit : 0
}

function stableTitleSegments(value: string, appNames: readonly string[]): string[] {
  const normalized = normalizeWindowText(value)
  return uniqueWindowTitles(normalized.split(/\s+(?:-|–|—|\||·|•)\s+/u))
    .map((segment) => stripApplicationIdentity(segment, appNames))
    .filter((segment) => textLength(segment) >= 6)
}

function scoreWindowTitles(reference: string, candidate: string, appNames: readonly string[]): { score: number; sharedAnchor: boolean } {
  const referenceText = stripApplicationIdentity(reference, appNames)
  const candidateText = stripApplicationIdentity(candidate, appNames)
  if (!referenceText || !candidateText) return { score: 0, sharedAnchor: false }
  const referenceTokens = titleTokens(referenceText)
  const candidateTokens = titleTokens(candidateText)
  const candidateTokenSet = new Set(candidateTokens)
  const sharedTokens = referenceTokens.filter((token) => candidateTokenSet.has(token) && isDistinctiveTitleToken(token))
  const referenceSegments = new Set(stableTitleSegments(reference, appNames))
  const sameStableSegment = stableTitleSegments(candidate, appNames).some((segment) => referenceSegments.has(segment)
    && titleTokens(segment).some(isDistinctiveTitleToken))
  const leadingAnchor = Boolean(referenceTokens[0]
    && referenceTokens[0] === candidateTokens[0]
    && isDistinctiveTitleToken(referenceTokens[0]))
  const sharedAnchor = sameStableSegment || leadingAnchor || sharedTokens.length >= 2
  const tokens = tokenDice(referenceTokens, candidateTokens)
  const characters = ngramDice(referenceText, candidateText)
  const prefix = commonEdgeRatio(referenceText, candidateText)
  const suffix = commonEdgeRatio(referenceText, candidateText, true)
  const edgeScore = Math.max(prefix, suffix) >= 0.5 ? 0.7 + Math.max(prefix, suffix) * 0.22 : 0
  const score = Math.max(sameStableSegment ? 0.92 : 0, tokens * 0.55 + characters * 0.45, edgeScore)
  return { score: Math.min(1, score), sharedAnchor }
}

/**
 * Resolves a persisted logical target after native ids/PIDs change. Application identity is mandatory.
 * Similar-title replacement is accepted only from a complete inventory and only when one candidate is
 * sufficiently strong and distinct; otherwise candidates remain confirmation-only.
 */
export function resolveWindowTargetCandidate<T extends Pick<LiveWindow, 'platform' | 'appId' | 'appName' | 'title'>>(
  target: Pick<WindowTarget, 'platform' | 'appId' | 'appName' | 'titleLocator' | 'titleHistory'>,
  windows: readonly T[],
  options: { allowSimilar?: boolean } = {}
): WindowTargetCandidateResolution<T> {
  const sameApp = windows.filter((window) => windowTargetAppMatches(target, window))
  const titleSamples = uniqueWindowTitles([target.titleLocator, ...(target.titleHistory || [])])
  const exact = sameApp.filter((window) => {
    const title = normalizeWindowText(window.title)
    return titleSamples.some((sample) => normalizeWindowText(sample) === title)
  })
  if (exact.length === 1) return { live: exact[0], candidates: exact, kind: 'exact', score: 1 }
  if (exact.length > 1) return { live: null, candidates: exact, kind: 'ambiguous', score: 1 }
  if (options.allowSimilar === false || !sameApp.length) return { live: null, candidates: [], kind: 'none', score: 0 }

  const ranked: WindowTargetCandidate<T>[] = sameApp.map((live) => {
    const best = titleSamples.reduce((current, sample) => {
      const next = scoreWindowTitles(sample, live.title, [target.appName, live.appName])
      return next.score > current.score ? next : current
    }, { score: 0, sharedAnchor: false })
    return { live, score: best.score, exact: false, sharedAnchor: best.sharedAnchor }
  }).sort((left, right) => right.score - left.score)
  const plausible = ranked.filter((candidate) => candidate.sharedAnchor && candidate.score >= WINDOW_TITLE_CONFIRMATION_SCORE)
  const best = plausible[0]
  if (!best) {
    return sameApp.length === 1
      ? { live: null, candidates: sameApp, kind: 'confirmation', score: ranked[0]?.score || 0 }
      : { live: null, candidates: [], kind: 'none', score: ranked[0]?.score || 0 }
  }
  const runnerUp = plausible[1]
  const autoThreshold = sameApp.length === 1 ? WINDOW_TITLE_SINGLE_AUTO_SCORE : WINDOW_TITLE_MULTI_AUTO_SCORE
  const margin = best.score - (runnerUp?.score || 0)
  if (best.score >= autoThreshold && (sameApp.length === 1 || margin >= WINDOW_TITLE_MULTI_AUTO_MARGIN)) {
    return { live: best.live, candidates: [best.live], kind: 'similar', score: best.score }
  }
  return { live: null, candidates: plausible.map((candidate) => candidate.live), kind: plausible.length > 1 ? 'ambiguous' : 'confirmation', score: best.score }
}

export function isChromiumFamilyApp(window: Pick<LiveWindow, 'appId' | 'appName'>): boolean {
  const text = normalizeWindowText(`${window.appId} ${window.appName}`)
  return /(?:^|[^a-z0-9.])(?:microsoft edge|google chrome|chromium|brave browser|brave|vivaldi|opera|arc)(?:[^a-z0-9.]|$)/.test(` ${text} `)
    || /(?:^|\s)msedge(?:\s|$)/.test(text)
    || text.includes('com.microsoft.edgemac')
    || text.includes('com.google.chrome')
    || text.includes('com.brave.browser')
}

/** Jumpable live windows exclude empty titles, host chrome, and Chromium AX shells titled exactly "Window". */
export function isJumpableLiveWindow(window: Pick<LiveWindow, 'appId' | 'appName' | 'title'>): boolean {
  const title = normalizeWindowText(window.title)
  if (!title) return false
  if (HOST_SHELL_TITLES.has(title)) return false
  // Only Chromium uses the AX placeholder "Window"; do not drop title==appName (real New Tab / app-named windows).
  if (title === 'window' && isChromiumFamilyApp(window)) return false
  return true
}

export function filterJumpableLiveWindows<T extends Pick<LiveWindow, 'appId' | 'appName' | 'title'>>(windows: readonly T[]): T[] {
  return windows.filter((window) => isJumpableLiveWindow(window))
}

export function createWindowSlots(): WindowSlot[] {
  return Array.from({ length: WINDOW_SLOT_COUNT }, (_, index) => ({
    slot: index + 1,
    targetIdByPlatform: {}
  }))
}
