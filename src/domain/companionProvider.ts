/**
 * Companion provider identity.
 *
 * The floating companion aggregates more than one agent host. Each host is a
 * separate provider module; this file owns the identity, key namespace,
 * enablement and ordering contracts they all share. Providers never import each
 * other — they only agree on the contracts declared here.
 */
export type CompanionProviderId = 'codex' | 'claude' | 'cursor'

/** Legacy inventories carry no provider field; they are Codex by definition. */
export const DEFAULT_COMPANION_PROVIDER: CompanionProviderId = 'codex'

export const COMPANION_PROVIDER_IDS: readonly CompanionProviderId[] = ['codex', 'claude', 'cursor']

/**
 * Stable provider enumeration for enablement and compatibility decisions.
 * Previous/next task order is Provider-neutral and owned by the task Kernel.
 */
export const COMPANION_PROVIDER_CYCLE_ORDER: readonly CompanionProviderId[] = ['codex', 'claude', 'cursor']

export const COMPANION_PROVIDER_LABELS: Readonly<Record<CompanionProviderId, string>> = {
  codex: 'Codex',
  claude: 'Claude',
  cursor: 'Cursor'
}

export function isCompanionProviderId(value: unknown): value is CompanionProviderId {
  return value === 'codex' || value === 'claude' || value === 'cursor'
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
  cursor?: boolean
}

/**
 * Claude and Cursor are opt-in. A stored settings object that predates those
 * features therefore normalizes into the exact pre-existing Codex-only behavior.
 */
export const DEFAULT_COMPANION_ENABLEMENT: Readonly<CompanionProviderEnablement> = { codex: true, claude: false, cursor: false }

export function normalizeCompanionEnablement(value: unknown): CompanionProviderEnablement {
  const source = value && typeof value === 'object' ? value as Partial<Record<CompanionProviderId, unknown>> : {}
  return {
    codex: source.codex === undefined ? DEFAULT_COMPANION_ENABLEMENT.codex : source.codex === true,
    claude: source.claude === undefined ? DEFAULT_COMPANION_ENABLEMENT.claude : source.claude === true,
    cursor: source.cursor === undefined ? DEFAULT_COMPANION_ENABLEMENT.cursor : source.cursor === true
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
/**
 * "待审批与待回答同属待输入" is a product rule, stated once in the PRD, and it
 * decides grouping, counting and badge totals across both Providers. Written
 * inline it becomes a search-and-replace hazard: a missed site disagrees with
 * its siblings and nothing surfaces the disagreement.
 *
 * `phase` and `activityState` carry the same strings for these values, so one
 * predicate serves both vocabularies.
 */
export function isCompanionAttentionState(value: string | null | undefined): boolean {
  return value === 'waiting-input' || value === 'waiting-approval'
}

/** Running or waiting on the user — everything a newer observation may still move. */
export function isCompanionLivePhase(value: string | null | undefined): boolean {
  return value === 'running' || isCompanionAttentionState(value)
}

export interface CompanionOrderableTask {
  key: string
  pinSource?: 'native' | 'local'
  provider?: CompanionProviderId
  lastQuestionAt?: number
  createdAt?: number
}

/**
 * Display order — one provider-neutral comparator for every visible group.
 * Recent question time wins, then creation time and the anonymous key. Pin and
 * provider are deliberately excluded from ordering.
 */
export function orderCompanionTasksForDisplay<T extends CompanionOrderableTask>(
  tasks: readonly T[],
  _pinnedTaskKeys: readonly string[] = []
): T[] {
  return [...tasks].sort((left, right) => (Number(right.lastQuestionAt) || 0) - (Number(left.lastQuestionAt) || 0)
    || (Number(right.createdAt) || 0) - (Number(left.createdAt) || 0)
    || left.key.localeCompare(right.key))
}

/**
 * Cycle order uses the same provider-neutral order. Eligibility tiers are
 * selected by the process-owned Kernel before this comparator is applied.
 */
export function orderCompanionTasksForCycle<T extends CompanionOrderableTask>(
  tasks: readonly T[],
  pinnedTaskKeys: readonly string[] = []
): T[] {
  return orderCompanionTasksForDisplay(tasks, pinnedTaskKeys)
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
  const counts = { codex: 0, claude: 0, cursor: 0 } as Record<CompanionProviderId, number>
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
export const COMPANION_TASK_ACTIONS_REVISION = 'companion-task-actions-v2'

export type CompanionTaskActionSource =
  | 'card-click'
  | 'manual-row-open'
  | 'manual-quick-jump'
  | 'global-shortcut'
  | 'local-shortcut'
  | 'attention-shortcut'
  | 'archive-button'
  | 'archive-shortcut'
  | 'batch-archive'
  | 'project-archive'
  | 'pause-button'
  | 'resume-button'
  | 'execute-plan-button'
  | 'batch-pause'
  | 'batch-resume'
  | 'automatic-recovery'
export type CompanionArchiveOutcome = 'confirmation-required' | 'archived' | 'failed' | 'indeterminate'

export interface CompanionTaskTarget {
  provider: CompanionProviderId
  key: string
  actionAlias: string
  revisionAt: number
  phase: string
  planReady?: boolean
  planLifecycleRevision?: number
  paused?: boolean
}

export type CompanionTaskActionRequestV2 =
  | { action: 'open'; target: CompanionTaskTarget; source: Extract<CompanionTaskActionSource, 'card-click' | 'manual-row-open' | 'manual-quick-jump' | 'global-shortcut' | 'local-shortcut' | 'attention-shortcut' | 'automatic-recovery'> }
  | { action: 'archive'; target: CompanionTaskTarget; source: Extract<CompanionTaskActionSource, 'archive-button' | 'archive-shortcut' | 'batch-archive' | 'project-archive' | 'automatic-recovery'> }
  | { action: 'pause'; target: CompanionTaskTarget; source: Extract<CompanionTaskActionSource, 'pause-button' | 'batch-pause'> }
  | { action: 'resume'; target: CompanionTaskTarget; source: Extract<CompanionTaskActionSource, 'resume-button' | 'batch-resume'> }
  | { action: 'executePlan'; target: CompanionTaskTarget; source: 'execute-plan-button' }

export interface CompanionArchiveResultV2 {
  outcome: CompanionArchiveOutcome
  message?: string
  errorCode?: string
  alreadyArchived?: boolean
}

export interface CompanionOpenResultV2 {
  outcome: CompanionOpenOutcome
  /** Only an `opened` result is strong enough to write a read receipt. */
  confirmsRead: boolean
  message?: string
}

export interface CompanionExecutePlanResultV2 {
  outcome: 'executed' | 'failed' | 'indeterminate'
  message?: string
  errorCode?: string
  operationId?: string
}

/** Compatibility names retained for source consumers predating Actions v2. */
export type CompanionTaskActionRequestV3 = CompanionTaskActionRequestV2
export type CompanionArchiveResultV3 = CompanionArchiveResultV2
export type CompanionOpenResultV3 = CompanionOpenResultV2

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
  openTask(taskKey: string, actionAlias?: string): Promise<CompanionOpenResultV2>
  /** Releases watchers, child processes and subscriptions owned by this provider. */
  close(): void
}

/**
 * Provider-neutral mutation adapter. Queue/coalescing policy belongs to the
 * dispatcher; each adapter owns only its provider's inspection and side effect.
 */
export interface CompanionProviderAdapter {
  readonly id: CompanionProviderId
  inspect(): Promise<CompanionProviderReadiness>
  open(request: Extract<CompanionTaskActionRequestV2, { action: 'open' }>): Promise<CompanionOpenResultV2>
  archive(request: Extract<CompanionTaskActionRequestV2, { action: 'archive' }>): Promise<CompanionArchiveResultV2>
  executePlan?(request: Extract<CompanionTaskActionRequestV2, { action: 'executePlan' }>): Promise<CompanionExecutePlanResultV2>
  close(): void
}
