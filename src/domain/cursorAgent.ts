import type {
  CodexArchiveCapability,
  CodexTaskActivityState,
  CodexTaskBucket
} from './codex'
import { companionTaskKey } from './companionProvider'
import type { ClaudeCodePhase, ClaudeCodeTaskCard } from './claudeCode'

/**
 * Cursor Agent cold inventory. Phase vocabulary is Claude's six states so
 * Float grouping can reuse `claudePhase` without a fifth state machine.
 * An open hook Turn beats disk status. Missing hook evidence stays cold-only.
 */

export type CursorAgentDiskStatus = 'completed' | 'none' | 'aborted' | ''

/**
 * One multitask fork of this conversation. Forks never become cards; like a
 * Codex side chat they are an evidence line folded into the parent card.
 * `unfinishedRunAt` is the App's own cold live marker (cleared on finish).
 */
export interface CursorAgentSubagentObservation {
  composerId: string
  unfinishedRunAt: number
}

export interface CursorAgentObservation {
  composerId: string
  workspaceIdentifier: string
  name: string
  subtitle: string
  createdAt: number
  lastUpdatedAt: number
  hasUnreadMessages: boolean
  isDraft: boolean
  hasPendingPlan: boolean
  hasBlockingPendingActions: boolean
  unfinishedRunAt: number
  diskStatus: CursorAgentDiskStatus
  subagents?: readonly CursorAgentSubagentObservation[]
  /** Hook-reconciled fork liveness; when absent, cold fork evidence decides. */
  subagentRunning?: boolean
  hookPhase?: ClaudeCodePhase
  hookTurnOpen?: boolean
  hookLastEventAt?: number
}

const COMPOSER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DISK_STATUSES: readonly CursorAgentDiskStatus[] = ['completed', 'none', 'aborted']

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function timeOf(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value)
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed)
  }
  return 0
}

function flagOf(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true'
}

function diskStatusOf(value: unknown): CursorAgentDiskStatus {
  const text = textOf(value).trim().toLowerCase()
  return DISK_STATUSES.includes(text as CursorAgentDiskStatus) ? text as CursorAgentDiskStatus : ''
}

function subagentsOf(value: unknown): CursorAgentSubagentObservation[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const source = entry as Record<string, unknown>
    const composerId = textOf(source.composerId).trim()
    if (!composerId) return []
    return [{ composerId, unfinishedRunAt: timeOf(source.unfinishedRunAt) }]
  })
}

export function normalizeCursorAgentObservation(raw: unknown): CursorAgentObservation | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const source = raw as Record<string, unknown>
  const composerId = textOf(source.composerId).trim()
  if (!COMPOSER_ID.test(composerId)) return null
  const subagents = subagentsOf(source.subagents)
  return {
    composerId,
    workspaceIdentifier: textOf(source.workspaceIdentifier).trim(),
    name: textOf(source.name).trim(),
    subtitle: textOf(source.subtitle).trim(),
    createdAt: timeOf(source.createdAt),
    lastUpdatedAt: timeOf(source.lastUpdatedAt),
    hasUnreadMessages: flagOf(source.hasUnreadMessages),
    isDraft: flagOf(source.isDraft),
    hasPendingPlan: flagOf(source.hasPendingPlan),
    hasBlockingPendingActions: flagOf(source.hasBlockingPendingActions),
    unfinishedRunAt: timeOf(source.unfinishedRunAt),
    diskStatus: diskStatusOf(source.diskStatus),
    ...(subagents.length ? { subagents } : {}),
    ...(typeof source.subagentRunning === 'boolean' ? { subagentRunning: source.subagentRunning } : {}),
    ...(source.hookTurnOpen === true ? { hookTurnOpen: true } : {}),
    ...(source.hookPhase === 'running' || source.hookPhase === 'completed' || source.hookPhase === 'stopped'
      ? { hookPhase: source.hookPhase }
      : {}),
    ...(timeOf(source.hookLastEventAt) ? { hookLastEventAt: timeOf(source.hookLastEventAt) } : {})
  }
}

/**
 * A live multitask fork keeps the parent card live — the Codex side-chat
 * contract: any live branch keeps the aggregate running, even when the
 * parent's own Turn already closed. Controller-reconciled `subagentRunning`
 * beats cold fork evidence; when absent, a fork's own `unfinishedRunAt`
 * decides, exactly like the session's own cold marker.
 */
export function cursorSubagentsRunning(observation: CursorAgentObservation): boolean {
  if (observation.subagentRunning !== undefined) return observation.subagentRunning
  return (observation.subagents || []).some((fork) => fork.unfinishedRunAt > 0)
}

/**
 * Live cold markers beat disk. An open Hook Turn still beats aborted/empty
 * disk, but disk `completed` with no live cold run does not stay running on a
 * stale `hookTurnOpen` / hookPhase running. Never invents `waiting-approval`.
 * A live fork outranks the parent's own terminal hook phase but not its waiting-input.
 */
export function resolveCursorAgentPhase(observation: CursorAgentObservation): ClaudeCodePhase {
  // Cursor's blocking user decision (AskQuestion / plan question / terminal
  // approval) is 待输入 and outranks an open Turn, like Claude's waiting-input.
  if (observation.hasBlockingPendingActions) return 'waiting-input'
  const coldLive = observation.unfinishedRunAt > 0 || cursorSubagentsRunning(observation)
  const diskSettledCompleted = observation.diskStatus === 'completed'
  if (observation.hookTurnOpen && (coldLive || !diskSettledCompleted)) return 'running'
  if (observation.hasPendingPlan) return 'waiting-input'
  if (cursorSubagentsRunning(observation)) return 'running'
  if (observation.hookPhase === 'running' && (coldLive || !diskSettledCompleted)) return 'running'
  if (observation.hookPhase === 'completed' || observation.hookPhase === 'stopped') {
    return observation.hookPhase
  }
  if (observation.unfinishedRunAt > 0) return 'running'
  if (observation.hasUnreadMessages) return 'completed'
  if (observation.diskStatus === 'completed') return 'completed'
  if (observation.diskStatus === 'aborted') return 'stopped'
  return 'unknown'
}

export interface CursorAgentResolvedState {
  phase: ClaudeCodePhase
  bucket: CodexTaskBucket
  activityState: CodexTaskActivityState
  archiveCapability: CodexArchiveCapability
  unreadState: 'unread' | 'read' | 'unknown'
}

export function resolveCursorAgentState(observation: CursorAgentObservation): CursorAgentResolvedState {
  const phase = resolveCursorAgentPhase(observation)
  // Status-only gate: settled completed/stopped sessions may archive (the
  // preload adapter re-verifies live evidence and mirrors the App's own
  // `isArchived` pair). Only live phases and unknown evidence block.
  const archiveCapability: CodexArchiveCapability = 'allowed'
  if (phase === 'waiting-input') {
    return { phase, bucket: 'ongoing', activityState: 'waiting-input', archiveCapability: 'blocked-active', unreadState: 'unknown' }
  }
  if (phase === 'running') {
    return { phase, bucket: 'ongoing', activityState: 'active', archiveCapability: 'blocked-active', unreadState: 'unknown' }
  }
  if (phase === 'completed') {
    const unread = observation.hasUnreadMessages
    return {
      phase,
      bucket: unread ? 'completed-unread' : 'completed',
      activityState: 'ongoing',
      archiveCapability,
      unreadState: unread ? 'unread' : 'read'
    }
  }
  if (phase === 'stopped') {
    return { phase, bucket: 'stopped', activityState: 'stopped', archiveCapability, unreadState: 'unknown' }
  }
  return { phase: 'unknown', bucket: 'stopped', activityState: 'ongoing', archiveCapability: 'blocked-stopped', unreadState: 'unknown' }
}

export function cursorAgentDisplayName(observation: Pick<CursorAgentObservation, 'name' | 'subtitle'>): string {
  return observation.name.trim() || observation.subtitle.trim() || 'Cursor Agent'
}

export interface CursorAgentProjectionOptions {
  aliases?: Readonly<Record<string, string | undefined>>
  projectAliases?: Readonly<Record<string, string | undefined>>
  hiddenKeys?: readonly string[]
  localPinnedKeys?: readonly string[]
}

export function projectCursorAgentTaskCard(
  observation: CursorAgentObservation,
  options: CursorAgentProjectionOptions = {}
): ClaudeCodeTaskCard {
  const resolved = resolveCursorAgentState(observation)
  const key = companionTaskKey('cursor', observation.composerId)
  const originalName = cursorAgentDisplayName(observation)
  const alias = options.aliases?.[key]
  const workspace = observation.workspaceIdentifier || 'local'
  const originalProjectName = workspace
  const projectKey = companionTaskKey('cursor', `project:${workspace.normalize('NFKC').toLocaleLowerCase()}`)
  const projectName = options.projectAliases?.[projectKey] || 'Cursor Agent'
  const updatedAt = observation.lastUpdatedAt || observation.unfinishedRunAt || observation.createdAt
  const completedAt = resolved.phase === 'completed' ? (observation.lastUpdatedAt || observation.createdAt) : 0
  const questionAt = observation.unfinishedRunAt || completedAt || updatedAt
  const statusEnteredAt = resolved.phase === 'waiting-input'
    ? observation.lastUpdatedAt || updatedAt
    : resolved.bucket === 'completed-unread'
      ? completedAt
      : 0
  return {
    key,
    actionAlias: observation.composerId,
    name: alias || originalName,
    displayName: alias || originalName,
    originalName,
    ...(alias ? { alias } : {}),
    bucket: resolved.bucket,
    activityState: resolved.activityState,
    archiveCapability: resolved.archiveCapability,
    revisionAt: completedAt || updatedAt,
    ...(completedAt ? { completionRevision: completedAt, lastTurnCompletedAt: completedAt } : {}),
    ...(statusEnteredAt ? { statusEnteredAt } : {}),
    ...(resolved.bucket === 'completed-unread' && completedAt ? { pendingSince: completedAt } : {}),
    unreadState: resolved.unreadState,
    state: resolved.phase === 'waiting-input'
      ? 'waiting-input'
      : resolved.phase === 'running'
        ? 'running'
        : resolved.phase === 'completed' && resolved.bucket === 'completed-unread'
          ? 'pending-review'
          : resolved.phase === 'completed'
            ? 'recent-activity'
            : resolved.phase === 'stopped'
              ? 'stopped'
              : 'attention',
    activeFlags: resolved.phase === 'waiting-input' ? ['waitingOnUserInput'] : undefined,
    updatedAt,
    ...(questionAt ? { lastQuestionAt: questionAt } : {}),
    ...(observation.unfinishedRunAt ? { lastTurnStartedAt: observation.unfinishedRunAt } : {}),
    createdAt: observation.createdAt || undefined,
    firstPromptAt: observation.createdAt || undefined,
    source: resolved.phase === 'unknown' ? 'unresolved' : 'current',
    hasCurrentActivity: resolved.bucket === 'ongoing',
    canArchive: resolved.archiveCapability === 'allowed',
    projectKey,
    projectName,
    originalProjectName,
    projectKind: 'project',
    isHidden: (options.hiddenKeys || []).includes(key),
    ...((options.localPinnedKeys || []).includes(key) ? { pinSource: 'local' as const } : {}),
    provider: 'cursor',
    claudePhase: resolved.phase
  }
}

export function projectCursorAgentTaskCards(
  observations: readonly CursorAgentObservation[],
  options: CursorAgentProjectionOptions = {}
): ClaudeCodeTaskCard[] {
  return observations.map((observation) => projectCursorAgentTaskCard(observation, options))
}
