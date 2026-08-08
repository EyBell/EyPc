import type {
  FavoriteNode,
  FavoritePlatform,
  FavoriteRunnerConfig,
  FavoriteSearchAffinity,
  FavoriteSlot
} from './types'

export const FAVORITE_SLOT_COUNT = 10
export const FAVORITE_SEARCH_HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000
export const FAVORITE_SEARCH_QUERY_LIMIT = 50
export const FAVORITE_SEARCH_ITEMS_PER_QUERY_LIMIT = 10

const FAVORITE_PLATFORMS: FavoritePlatform[] = ['darwin', 'win32', 'linux']
const RUNNER_MAX_EXECUTABLE_LENGTH = 4096
const RUNNER_MAX_ARGUMENT_COUNT = 64
const RUNNER_MAX_ARGUMENT_LENGTH = 4096

export interface ResolvedFavoriteRunner {
  executable: string
  args: string[]
  cwd: string
  mode: FavoriteRunnerConfig['mode']
  /** L2 declared log location after placeholder expansion. Absent when unset or not absolute. */
  declaredLogPath?: string
}

export function isFavoritePlatform(value: unknown): value is FavoritePlatform {
  return typeof value === 'string' && FAVORITE_PLATFORMS.includes(value as FavoritePlatform)
}

export function createFavoriteSlots(): FavoriteSlot[] {
  return Array.from({ length: FAVORITE_SLOT_COUNT }, (_, index) => ({
    slot: index + 1,
    favoriteIdByPlatform: {}
  }))
}

export function normalizeFavoriteSearchQuery(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase().slice(0, 128)
}

/**
 * The favorite name only reaches the executed argv when a runner field expands `{name}`.
 * Renaming an unaffected favorite is cosmetic, so it must not revoke trust.
 */
export function favoriteRunnerUsesName(config: FavoriteRunnerConfig): boolean {
  if (config.args.some((item) => item.includes('{name}'))) return true
  return config.cwdMode === 'custom' && String(config.cwd || '').includes('{name}')
}

function stableRunnerPayload(
  node: Pick<FavoriteNode, 'id' | 'kind' | 'path' | 'name'>,
  platform: FavoritePlatform,
  config: FavoriteRunnerConfig,
  includeName: boolean
): string {
  return JSON.stringify({
    platform,
    id: node.id,
    kind: node.kind,
    path: node.path,
    ...(includeName ? { name: node.name } : {}),
    mode: config.mode,
    executable: config.executable.trim(),
    args: config.args,
    cwdMode: config.cwdMode,
    cwd: config.cwdMode === 'custom' ? String(config.cwd || '').trim() : '',
    // Only present when set, so configurations written before declared log paths existed
    // keep producing their original payload and never lose trust on upgrade.
    ...(config.logPath ? { logPath: config.logPath.trim() } : {})
  })
}

function fnv1a64(text: string): string {
  let hash = 0xcbf29ce484222325n
  const prime = 0x100000001b3n
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index))
    hash = BigInt.asUintN(64, hash * prime)
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`
}

/** Stable drift detector for trusted local runner metadata; it is not an authentication primitive. */
export function favoriteRunnerFingerprint(
  node: Pick<FavoriteNode, 'id' | 'kind' | 'path' | 'name'>,
  platform: FavoritePlatform,
  config: FavoriteRunnerConfig
): string {
  return fnv1a64(stableRunnerPayload(node, platform, config, favoriteRunnerUsesName(config)))
}

/**
 * Pre-rename-tolerant algorithm: the name was unconditionally part of the payload.
 * Kept only so stored trust can be upgraded in place instead of being dropped.
 */
export function legacyFavoriteRunnerFingerprint(
  node: Pick<FavoriteNode, 'id' | 'kind' | 'path' | 'name'>,
  platform: FavoritePlatform,
  config: FavoriteRunnerConfig
): string {
  return fnv1a64(stableRunnerPayload(node, platform, config, true))
}

export function isFavoriteRunnerTrusted(
  node: Pick<FavoriteNode, 'id' | 'kind' | 'path' | 'name'>,
  platform: FavoritePlatform,
  config: FavoriteRunnerConfig | null | undefined
): boolean {
  if (!config?.trustedAt || !config.trustedFingerprint) return false
  if (config.trustedFingerprint === favoriteRunnerFingerprint(node, platform, config)) return true
  // A not-yet-upgraded record stays trusted under the stricter legacy rule.
  return config.trustedFingerprint === legacyFavoriteRunnerFingerprint(node, platform, config)
}

/**
 * Rewrites a still-valid legacy fingerprint to the current algorithm so a later rename
 * cannot revoke trust that the user already granted. Anything else is returned untouched.
 */
export function upgradeFavoriteRunnerTrust(
  node: Pick<FavoriteNode, 'id' | 'kind' | 'path' | 'name'>,
  platform: FavoritePlatform,
  config: FavoriteRunnerConfig
): FavoriteRunnerConfig {
  if (!config.trustedAt || !config.trustedFingerprint) return config
  const current = favoriteRunnerFingerprint(node, platform, config)
  if (config.trustedFingerprint === current) return config
  if (config.trustedFingerprint !== legacyFavoriteRunnerFingerprint(node, platform, config)) return config
  return { ...config, trustedFingerprint: current }
}

export function upgradeFavoriteRunnerTrustByPlatform(
  node: Pick<FavoriteNode, 'id' | 'kind' | 'path' | 'name'>,
  runnerByPlatform: FavoriteNode['runnerByPlatform'] | undefined
): FavoriteNode['runnerByPlatform'] | undefined {
  if (!runnerByPlatform) return runnerByPlatform
  const result: NonNullable<FavoriteNode['runnerByPlatform']> = {}
  for (const platform of FAVORITE_PLATFORMS) {
    const config = runnerByPlatform[platform]
    if (config) result[platform] = upgradeFavoriteRunnerTrust(node, platform, config)
  }
  return Object.keys(result).length ? result : undefined
}

export function trustFavoriteRunner(
  node: Pick<FavoriteNode, 'id' | 'kind' | 'path' | 'name'>,
  platform: FavoritePlatform,
  config: FavoriteRunnerConfig,
  now = Date.now()
): FavoriteRunnerConfig {
  const normalized = normalizeFavoriteRunnerConfig(config)
  if (!normalized) throw new Error('invalid favorite runner config')
  return {
    ...normalized,
    trustedAt: now,
    trustedFingerprint: favoriteRunnerFingerprint(node, platform, normalized)
  }
}

export function normalizeFavoriteRunnerConfig(value: unknown): FavoriteRunnerConfig | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  const mode = source.mode === 'terminal' ? 'terminal' : source.mode === 'background' ? 'background' : null
  const executable = typeof source.executable === 'string' ? source.executable.trim() : ''
  if (!Array.isArray(source.args) || source.args.length > RUNNER_MAX_ARGUMENT_COUNT || !source.args.every((item) => typeof item === 'string')) return null
  const args = [...source.args] as string[]
  const cwdMode = source.cwdMode === 'custom' ? 'custom' : source.cwdMode === 'target-directory' ? 'target-directory' : null
  const cwd = typeof source.cwd === 'string' ? source.cwd.trim() : ''
  const logPath = typeof source.logPath === 'string' ? source.logPath.trim() : ''
  if (!mode || !cwdMode || !executable || executable.length > RUNNER_MAX_EXECUTABLE_LENGTH) return null
  if (args.some((item) => item.length > RUNNER_MAX_ARGUMENT_LENGTH || item.includes('\0'))) return null
  if (executable.includes('\0') || cwd.includes('\0')) return null
  if (logPath.length > RUNNER_MAX_EXECUTABLE_LENGTH || logPath.includes('\0')) return null
  if (cwdMode === 'custom' && !cwd) return null
  const trustedAt = typeof source.trustedAt === 'number' && Number.isFinite(source.trustedAt) && source.trustedAt > 0
    ? source.trustedAt
    : undefined
  const trustedFingerprint = typeof source.trustedFingerprint === 'string' && source.trustedFingerprint.startsWith('fnv1a64:')
    ? source.trustedFingerprint
    : undefined
  return {
    mode,
    executable,
    args,
    cwdMode,
    ...(cwdMode === 'custom' ? { cwd } : {}),
    ...(logPath ? { logPath } : {}),
    ...(trustedAt ? { trustedAt } : {}),
    ...(trustedFingerprint ? { trustedFingerprint } : {})
  }
}

export function normalizeFavoriteRunnerByPlatform(value: unknown): FavoriteNode['runnerByPlatform'] | undefined {
  if (!value || typeof value !== 'object') return undefined
  const source = value as Record<string, unknown>
  const result: NonNullable<FavoriteNode['runnerByPlatform']> = {}
  for (const platform of FAVORITE_PLATFORMS) {
    const raw = source[platform]
    const config = normalizeFavoriteRunnerConfig(raw)
    if (config) {
      result[platform] = config
      continue
    }
    // Keep an editable, bounded representation of malformed legacy metadata.
    // Runtime resolution still rejects it, so migration never turns bad input into executable trust.
    if (!raw || typeof raw !== 'object') continue
    const candidate = raw as Record<string, unknown>
    result[platform] = {
      mode: candidate.mode === 'terminal' ? 'terminal' : 'background',
      executable: typeof candidate.executable === 'string' ? candidate.executable.slice(0, RUNNER_MAX_EXECUTABLE_LENGTH) : '',
      args: Array.isArray(candidate.args)
        ? candidate.args.filter((item): item is string => typeof item === 'string').slice(0, RUNNER_MAX_ARGUMENT_COUNT).map((item) => item.slice(0, RUNNER_MAX_ARGUMENT_LENGTH))
        : [],
      cwdMode: candidate.cwdMode === 'custom' ? 'custom' : 'target-directory',
      ...(typeof candidate.cwd === 'string' ? { cwd: candidate.cwd.slice(0, RUNNER_MAX_EXECUTABLE_LENGTH) } : {}),
      ...(typeof candidate.logPath === 'string' ? { logPath: candidate.logPath.slice(0, RUNNER_MAX_EXECUTABLE_LENGTH) } : {}),
      ...(typeof candidate.trustedAt === 'number' && Number.isFinite(candidate.trustedAt) && candidate.trustedAt > 0 ? { trustedAt: candidate.trustedAt } : {}),
      ...(typeof candidate.trustedFingerprint === 'string' ? { trustedFingerprint: candidate.trustedFingerprint.slice(0, 128) } : {})
    }
  }
  return Object.keys(result).length ? result : undefined
}

function favoriteTargetDirectory(node: Pick<FavoriteNode, 'kind' | 'path'>): string {
  const path = node.path.trim()
  if (node.kind === 'folder') {
    if (/^[A-Za-z]:[\\/]$/.test(path)) return path
    return path.replace(/[\\/]+$/, '') || path
  }
  const lastSeparator = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  if (lastSeparator < 0) return '.'
  if (lastSeparator === 0) return path.slice(0, 1)
  if (lastSeparator === 2 && /^[A-Za-z]:[\\/]/.test(path)) return path.slice(0, 3)
  return path.slice(0, lastSeparator)
}

function isAbsoluteFavoriteRunnerPath(value: string, platform?: FavoritePlatform): boolean {
  if (platform === 'win32') return /^[A-Za-z]:[\\/]/.test(value) || /^(?:\\\\|\/\/)/.test(value)
  if (platform === 'darwin' || platform === 'linux') return value.startsWith('/')
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || /^(?:\\\\|\/\/)/.test(value)
}

function isFavoriteRunnerExecutable(value: string, platform?: FavoritePlatform): boolean {
  if (platform === 'win32' && /\.(?:cmd|bat)$/i.test(value)) return false
  return isAbsoluteFavoriteRunnerPath(value, platform) || (!value.includes('/') && !value.includes('\\'))
}

function expandFavoriteRunnerTokens(value: string, node: Pick<FavoriteNode, 'kind' | 'path' | 'name'>): string {
  const directory = favoriteTargetDirectory(node)
  const replacements: Record<string, string> = {
    '{path}': node.path,
    '{dir}': directory,
    '{name}': node.name
  }
  return value.replace(/\{(?:path|dir|name)\}/g, (token) => replacements[token] || token)
}

export function resolveFavoriteRunner(
  node: Pick<FavoriteNode, 'kind' | 'path' | 'name'>,
  config: FavoriteRunnerConfig,
  platform?: FavoritePlatform
): ResolvedFavoriteRunner | null {
  const normalized = normalizeFavoriteRunnerConfig(config)
  if (!normalized) return null
  const executable = expandFavoriteRunnerTokens(normalized.executable, node).trim()
  const args = normalized.args.map((item) => expandFavoriteRunnerTokens(item, node))
  const cwd = normalized.cwdMode === 'custom'
    ? expandFavoriteRunnerTokens(normalized.cwd || '', node).trim()
    : favoriteTargetDirectory(node)
  if (!executable || !cwd || executable.includes('\0') || cwd.includes('\0') || args.some((item) => item.includes('\0'))) return null
  if (!isFavoriteRunnerExecutable(executable, platform) || !isAbsoluteFavoriteRunnerPath(cwd, platform)) return null
  // A declared log path that does not resolve to an absolute location is dropped, not guessed at,
  // and never blocks the launch: it only decides whether we can point the user at a second file.
  const declaredLogPath = normalized.logPath
    ? expandFavoriteRunnerTokens(normalized.logPath, node).trim()
    : ''
  const usableLogPath = declaredLogPath && !declaredLogPath.includes('\0') && isAbsoluteFavoriteRunnerPath(declaredLogPath, platform)
    ? declaredLogPath
    : ''
  return { executable, args, cwd, mode: normalized.mode, ...(usableLogPath ? { declaredLogPath: usableLogPath } : {}) }
}

export function suggestedFavoriteRunner(path: string, platform: FavoritePlatform): FavoriteRunnerConfig | null {
  const lower = path.trim().toLocaleLowerCase()
  const base = { mode: 'background' as const, cwdMode: 'target-directory' as const }
  if (platform === 'win32' && (lower.endsWith('.cmd') || lower.endsWith('.bat'))) {
    return { ...base, executable: 'cmd.exe', args: ['/d', '/s', '/c', 'call', '{path}'] }
  }
  if (platform === 'win32' && lower.endsWith('.ps1')) {
    return { ...base, executable: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-File', '{path}'] }
  }
  if ((platform === 'darwin' || platform === 'linux') && lower.endsWith('.sh')) {
    return { ...base, executable: '/bin/sh', args: ['{path}'] }
  }
  if (platform === 'darwin' && lower.endsWith('.command')) {
    return { ...base, executable: '/bin/zsh', args: ['{path}'] }
  }
  if (lower.endsWith('.py')) return { ...base, executable: platform === 'win32' ? 'python.exe' : 'python3', args: ['{path}'] }
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return { ...base, executable: 'node', args: ['{path}'] }
  return null
}

export function favoriteFrecency(usageCount: number | undefined, lastUsedAt: number | undefined, now: number): number {
  if (!usageCount || !lastUsedAt) return 0
  const age = Math.max(0, now - lastUsedAt)
  return usageCount * Math.pow(0.5, age / FAVORITE_SEARCH_HALF_LIFE_MS)
}

export function favoriteSearchAffinityScore(
  affinities: readonly FavoriteSearchAffinity[],
  query: string,
  favoriteId: string,
  now: number
): number {
  const normalizedQuery = normalizeFavoriteSearchQuery(query)
  if (!normalizedQuery) return 0
  const affinity = affinities.find((item) => item.query === normalizedQuery && item.favoriteId === favoriteId)
  return affinity ? favoriteFrecency(affinity.usageCount, affinity.lastUsedAt, now) : 0
}

export function recordFavoriteSearchAffinity(
  affinities: readonly FavoriteSearchAffinity[],
  query: string,
  favoriteId: string,
  now = Date.now()
): FavoriteSearchAffinity[] {
  const normalizedQuery = normalizeFavoriteSearchQuery(query)
  if (!normalizedQuery || !favoriteId) return affinities.map((item) => ({ ...item }))
  const next = affinities
    .filter((item) => item.query !== normalizedQuery || item.favoriteId !== favoriteId)
    .map((item) => ({ ...item }))
  const previous = affinities.find((item) => item.query === normalizedQuery && item.favoriteId === favoriteId)
  next.push({
    query: normalizedQuery,
    favoriteId,
    usageCount: (previous?.usageCount || 0) + 1,
    lastUsedAt: now
  })

  return pruneFavoriteSearchAffinities(next)
}

export function pruneFavoriteSearchAffinities(
  affinities: readonly FavoriteSearchAffinity[]
): FavoriteSearchAffinity[] {
  const deduped = new Map<string, FavoriteSearchAffinity>()
  for (const item of affinities) {
    const query = normalizeFavoriteSearchQuery(item.query)
    if (!query || !item.favoriteId || !Number.isFinite(item.usageCount) || item.usageCount <= 0 || !Number.isFinite(item.lastUsedAt) || item.lastUsedAt <= 0) continue
    const key = `${query}\0${item.favoriteId}`
    const previous = deduped.get(key)
    if (!previous || item.lastUsedAt > previous.lastUsedAt) {
      deduped.set(key, { query, favoriteId: item.favoriteId, usageCount: item.usageCount, lastUsedAt: item.lastUsedAt })
    }
  }

  const queryLastUsed = new Map<string, number>()
  for (const item of deduped.values()) queryLastUsed.set(item.query, Math.max(queryLastUsed.get(item.query) || 0, item.lastUsedAt))
  const retainedQueries = new Set([...queryLastUsed.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, FAVORITE_SEARCH_QUERY_LIMIT)
    .map(([queryKey]) => queryKey))

  const byQuery = new Map<string, FavoriteSearchAffinity[]>()
  for (const item of deduped.values()) {
    if (!retainedQueries.has(item.query)) continue
    const items = byQuery.get(item.query) || []
    items.push(item)
    byQuery.set(item.query, items)
  }
  return [...byQuery.entries()]
    .sort((left, right) => (queryLastUsed.get(right[0]) || 0) - (queryLastUsed.get(left[0]) || 0) || left[0].localeCompare(right[0]))
    .flatMap(([, items]) => items
      .sort((left, right) => right.lastUsedAt - left.lastUsedAt || right.usageCount - left.usageCount || left.favoriteId.localeCompare(right.favoriteId))
      .slice(0, FAVORITE_SEARCH_ITEMS_PER_QUERY_LIMIT))
}

export function removeFavoriteLearning(
  affinities: readonly FavoriteSearchAffinity[],
  favoriteIds: readonly string[]
): FavoriteSearchAffinity[] {
  const removing = new Set(favoriteIds)
  return affinities.filter((item) => !removing.has(item.favoriteId)).map((item) => ({ ...item }))
}
