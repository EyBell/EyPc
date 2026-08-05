/**
 * Companion provider identity.
 *
 * The floating companion aggregates more than one agent host. Each host is a
 * separate provider module; this file owns the identity, key namespace,
 * enablement and ordering contracts they all share. Providers never import each
 * other — they only agree on the contracts declared here.
 */
export type CompanionProviderId = 'codex' | 'claude'

/** Legacy inventories carry no provider field; they are Codex by definition. */
export const DEFAULT_COMPANION_PROVIDER: CompanionProviderId = 'codex'

export const COMPANION_PROVIDER_IDS: readonly CompanionProviderId[] = ['codex', 'claude']

/**
 * Fixed group order for the previous/next task cycle. Group membership never
 * depends on activity, so a live event can never reorder the groups themselves.
 */
export const COMPANION_PROVIDER_CYCLE_ORDER: readonly CompanionProviderId[] = ['codex', 'claude']

export const COMPANION_PROVIDER_LABELS: Readonly<Record<CompanionProviderId, string>> = {
  codex: 'Codex',
  claude: 'Claude'
}

export function isCompanionProviderId(value: unknown): value is CompanionProviderId {
  return value === 'codex' || value === 'claude'
}

export function normalizeCompanionProviderId(value: unknown): CompanionProviderId {
  return isCompanionProviderId(value) ? value : DEFAULT_COMPANION_PROVIDER
}

/** Reads a task's owning provider, defaulting legacy Codex cards to `codex`. */
export function companionTaskProvider(task: { provider?: CompanionProviderId | null } | null | undefined): CompanionProviderId {
  return normalizeCompanionProviderId(task?.provider)
}

const COMPANION_KEY_SEPARATOR = ':'

/**
 * Task key namespace. Codex keys stay byte-identical to the existing inventory
 * so persisted aliases, pins, hides and receipts migrate at zero cost. Every
 * other provider is explicitly prefixed and therefore cannot collide.
 */
export function companionTaskKey(provider: CompanionProviderId, rawKey: string): string {
  const key = typeof rawKey === 'string' ? rawKey : ''
  if (provider === DEFAULT_COMPANION_PROVIDER) return key
  return `${provider}${COMPANION_KEY_SEPARATOR}${key}`
}

export function parseCompanionTaskKey(key: string): { provider: CompanionProviderId; rawKey: string } {
  const value = typeof key === 'string' ? key : ''
  for (const provider of COMPANION_PROVIDER_IDS) {
    if (provider === DEFAULT_COMPANION_PROVIDER) continue
    const prefix = `${provider}${COMPANION_KEY_SEPARATOR}`
    if (value.startsWith(prefix)) return { provider, rawKey: value.slice(prefix.length) }
  }
  return { provider: DEFAULT_COMPANION_PROVIDER, rawKey: value }
}

/* ------------------------------------------------------------------ *
 * Enablement
 * ------------------------------------------------------------------ */

export interface CompanionProviderEnablement {
  codex: boolean
  claude: boolean
}

/**
 * Claude is opt-in. A stored settings object that predates this feature
 * therefore normalizes into the exact pre-existing behavior.
 */
export const DEFAULT_COMPANION_ENABLEMENT: Readonly<CompanionProviderEnablement> = { codex: true, claude: false }

export function normalizeCompanionEnablement(value: unknown): CompanionProviderEnablement {
  const source = value && typeof value === 'object' ? value as Partial<Record<CompanionProviderId, unknown>> : {}
  return {
    codex: source.codex === undefined ? DEFAULT_COMPANION_ENABLEMENT.codex : source.codex === true,
    claude: source.claude === undefined ? DEFAULT_COMPANION_ENABLEMENT.claude : source.claude === true
  }
}

export function enabledCompanionProviders(enablement: CompanionProviderEnablement): CompanionProviderId[] {
  return COMPANION_PROVIDER_CYCLE_ORDER.filter((provider) => enablement[provider] === true)
}

export function isCompanionProviderEnabled(enablement: CompanionProviderEnablement, provider: CompanionProviderId): boolean {
  return enablement[provider] === true
}

/**
 * True while the companion must behave exactly like the pre-multi-provider
 * release: Codex only, no provider markers, no aggregation seams.
 */
export function isCompanionCompatibilityMode(enablement: CompanionProviderEnablement): boolean {
  const enabled = enabledCompanionProviders(enablement)
  return enabled.length === 1 && enabled[0] === 'codex'
}

/* ------------------------------------------------------------------ *
 * Ordering
 * ------------------------------------------------------------------ */

/**
 * Structural shape the ordering primitives need. Declared locally rather than
 * imported so this module stays the lower layer: providers and the Codex domain
 * depend on it, never the other way round.
 */
export interface CompanionOrderableTask {
  key: string
  pinSource?: 'native' | 'local'
  provider?: CompanionProviderId
}

/**
 * Display order — the shared base comparator, and the single owner of the
 * pinned-first rule. Pinned tasks lead in the caller's explicit pinned-key
 * order when one is supplied, then everything keeps its stable source order.
 * Provider membership is deliberately ignored so the visible list stays one
 * merged, status-driven sequence.
 */
export function orderCompanionTasksForDisplay<T extends CompanionOrderableTask>(
  tasks: readonly T[],
  pinnedTaskKeys: readonly string[] = []
): T[] {
  const pinnedOrder = new Map(pinnedTaskKeys.map((key, index) => [key, index]))
  return tasks
    .map((task, sourceIndex) => ({ task, sourceIndex }))
    .sort((left, right) => {
      const leftPinned = Boolean(left.task.pinSource)
      const rightPinned = Boolean(right.task.pinSource)
      if (leftPinned !== rightPinned) return leftPinned ? -1 : 1
      if (leftPinned && rightPinned) {
        const leftOrder = pinnedOrder.get(left.task.key)
        const rightOrder = pinnedOrder.get(right.task.key)
        if (leftOrder !== undefined || rightOrder !== undefined) {
          return (leftOrder ?? Number.MAX_SAFE_INTEGER) - (rightOrder ?? Number.MAX_SAFE_INTEGER) || left.sourceIndex - right.sourceIndex
        }
      }
      return left.sourceIndex - right.sourceIndex
    })
    .map(({ task }) => task)
}

/**
 * Cycle order — the display comparator plus a provider group as primary key.
 *
 * The previous/next commands walk the current provider's group to its end
 * before entering the next group, and the group sequence is a constant
 * (`COMPANION_PROVIDER_CYCLE_ORDER`). Because grouping is a stable partition of
 * an already-stable order, a task that arrives or updates mid-cycle can only be
 * appended within its own group: it can never move an existing item across the
 * cursor, which is what makes repeated "next" presses monotonic instead of
 * bouncing between directions.
 */
export function orderCompanionTasksForCycle<T extends CompanionOrderableTask>(
  tasks: readonly T[],
  pinnedTaskKeys: readonly string[] = []
): T[] {
  const ordered = orderCompanionTasksForDisplay(tasks, pinnedTaskKeys)
  if (ordered.length < 2) return ordered
  const groups = new Map<CompanionProviderId, T[]>()
  for (const provider of COMPANION_PROVIDER_CYCLE_ORDER) groups.set(provider, [])
  const trailing: T[] = []
  for (const task of ordered) {
    const bucket = groups.get(companionTaskProvider(task))
    if (bucket) bucket.push(task)
    else trailing.push(task)
  }
  const result: T[] = []
  for (const provider of COMPANION_PROVIDER_CYCLE_ORDER) result.push(...(groups.get(provider) || []))
  result.push(...trailing)
  return result
}

/* ------------------------------------------------------------------ *
 * Cross-provider aggregation
 * ------------------------------------------------------------------ */

export interface CompanionTaskCounts {
  input: number
  active: number
  unread: number
}

function safeCount(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value as number)) : 0
}

/**
 * Badge aggregation is status-driven, never source-driven: one waiting-input
 * total, one active total, one completed-unread total across every enabled
 * provider.
 */
export function aggregateCompanionTaskCounts(parts: readonly (CompanionTaskCounts | null | undefined)[]): CompanionTaskCounts {
  return parts.reduce<CompanionTaskCounts>((total, part) => ({
    input: total.input + safeCount(part?.input),
    active: total.active + safeCount(part?.active),
    unread: total.unread + safeCount(part?.unread)
  }), { input: 0, active: 0, unread: 0 })
}

/** Counts the tasks of one provider inside an already-merged inventory. */
export function countCompanionTasksByProvider<T extends CompanionOrderableTask>(
  tasks: readonly T[]
): Record<CompanionProviderId, number> {
  const counts = { codex: 0, claude: 0 } as Record<CompanionProviderId, number>
  for (const task of tasks) counts[companionTaskProvider(task)] += 1
  return counts
}

/* ------------------------------------------------------------------ *
 * Water ball mapping
 * ------------------------------------------------------------------ */

/** Which provider feeds each visual channel of the collapsed water ball. */
export interface CompanionWaterBallMapping {
  /** Liquid level channel. */
  liquid: CompanionProviderId | null
  /** Outer progress ring channel. */
  ring: CompanionProviderId | null
  /** Center percentage text channel. */
  percent: CompanionProviderId | null
  /** True while the mapping is byte-identical to the pre-multi-provider release. */
  compatibility: boolean
}

export interface CompanionProviderAvailability {
  codex: boolean
  claude: boolean
}

const CODEX_ONLY_MAPPING: CompanionWaterBallMapping = { liquid: 'codex', ring: 'codex', percent: 'codex', compatibility: true }

/**
 * Resolves the collapsed water ball channels.
 *
 * - Codex only  → every channel is Codex (unchanged legacy rendering).
 * - Claude only → Claude owns the whole ball.
 * - Both        → the ring stays Codex and the center percentage becomes
 *                 Claude; if Claude is enabled but not connected, the
 *                 percentage falls back to Codex so the ball still reads
 *                 exactly as it did before.
 */
export function resolveCompanionWaterBallMapping(
  enablement: CompanionProviderEnablement,
  availability: Partial<CompanionProviderAvailability> = {}
): CompanionWaterBallMapping {
  const codexLive = enablement.codex === true && availability.codex !== false
  const claudeLive = enablement.claude === true && availability.claude !== false
  if (!codexLive && !claudeLive) {
    if (enablement.claude === true && enablement.codex !== true) {
      return { liquid: 'claude', ring: 'claude', percent: 'claude', compatibility: false }
    }
    return CODEX_ONLY_MAPPING
  }
  if (codexLive && !claudeLive) return CODEX_ONLY_MAPPING
  if (!codexLive && claudeLive) return { liquid: 'claude', ring: 'claude', percent: 'claude', compatibility: false }
  return { liquid: 'codex', ring: 'codex', percent: 'claude', compatibility: false }
}

/* ------------------------------------------------------------------ *
 * Provider port contract
 * ------------------------------------------------------------------ */

export type CompanionOpenOutcome = 'opened' | 'dispatched' | 'unavailable' | 'failed'

export interface CompanionOpenResult {
  outcome: CompanionOpenOutcome
  /** Only an `opened` result is strong enough to write a read receipt. */
  confirmsRead: boolean
  message?: string
}

export interface CompanionProviderReadiness {
  available: boolean
  /** Privacy-safe reason code; never a path, session id or transcript excerpt. */
  reason: 'ready' | 'not-installed' | 'not-authenticated' | 'disabled' | 'degraded' | 'unknown'
}

/**
 * The runtime port every provider module implements. The aggregator consumes
 * only this interface, so a provider failure degrades that provider alone and a
 * future host is added without touching the aggregation, cycle or UI layers.
 */
export interface CompanionProviderPort {
  readonly id: CompanionProviderId
  /** Environment probe; must resolve rather than throw when the host is absent. */
  inspect(): Promise<CompanionProviderReadiness>
  /** Opens a task using this provider's own jump mechanism. */
  openTask(taskKey: string, actionAlias?: string): Promise<CompanionOpenResult>
  /** Releases watchers, child processes and subscriptions owned by this provider. */
  close(): void
}
