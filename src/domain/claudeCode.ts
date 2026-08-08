import type {
  CodexArchiveCapability,
  CodexTaskActivityState,
  CodexTaskBucket,
  CodexTaskCard
} from './codex'
import { companionTaskKey } from './companionProvider'

export type ClaudeCodePhase =
  | 'running'
  | 'waiting-approval'
  | 'waiting-input'
  | 'completed'
  | 'stopped'
  | 'unknown'

export type ClaudeCodeStatusCorrelation =
  | 'direct-local'
  | 'unique-cli'
  | 'metadata-pulse'
  | 'ambiguous'
  | 'none'

export type ClaudeCodeStateSource = 'app-log' | 'hook' | 'metadata-history' | 'none'
export type ClaudeCodeStateCompatibility = 'compatible' | 'fallback' | 'unsupported'

const PHASES: readonly ClaudeCodePhase[] = [
  'running',
  'waiting-approval',
  'waiting-input',
  'completed',
  'stopped',
  'unknown'
]

const CORRELATIONS: readonly ClaudeCodeStatusCorrelation[] = [
  'direct-local',
  'unique-cli',
  'metadata-pulse',
  'ambiguous',
  'none'
]

const STATE_SOURCES: readonly ClaudeCodeStateSource[] = ['app-log', 'hook', 'metadata-history', 'none']
const STATE_COMPATIBILITY: readonly ClaudeCodeStateCompatibility[] = ['compatible', 'fallback', 'unsupported']

const LOCAL_SESSION_PATTERN = /^local_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CLI_SESSION_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function timeOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0
}

export interface ClaudeCodeObservation {
  sessionId: string
  cliSessionId: string
  title: string
  cwd: string
  originCwd: string
  projectKey?: string
  createdAt: number
  lastActivityAt: number
  lastFocusedAt: number
  model: string
  isArchived: boolean
  completedTurns: number
  metadataUpdatedAt: number
  statusCorrelation: ClaudeCodeStatusCorrelation
  stateSource: ClaudeCodeStateSource
  stateCompatibility: ClaudeCodeStateCompatibility
  stateGeneration: number
  phase: ClaudeCodePhase
  phaseUpdatedAt: number
  turnStartedAt: number
  hookActivityAt: number
  waitingApprovalAt: number
  waitingInputAt: number
  lastStopAt: number
  lastSessionEndAt: number
}

export function normalizeClaudeCodeObservation(raw: unknown): ClaudeCodeObservation | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const source = raw as Record<string, unknown>
  const sessionId = textOf(source.sessionId).trim().toLowerCase()
  const cliSessionId = textOf(source.cliSessionId).trim().toLowerCase()
  if (!LOCAL_SESSION_PATTERN.test(sessionId) || !CLI_SESSION_PATTERN.test(cliSessionId)) return null
  const statusCorrelation = CORRELATIONS.includes(source.statusCorrelation as ClaudeCodeStatusCorrelation)
    ? source.statusCorrelation as ClaudeCodeStatusCorrelation
    : 'none'
  const stateSource = STATE_SOURCES.includes(source.stateSource as ClaudeCodeStateSource)
    ? source.stateSource as ClaudeCodeStateSource
    : 'none'
  const stateCompatibility = STATE_COMPATIBILITY.includes(source.stateCompatibility as ClaudeCodeStateCompatibility)
    ? source.stateCompatibility as ClaudeCodeStateCompatibility
    : 'fallback'
  const declaredPhase = PHASES.includes(source.phase as ClaudeCodePhase)
    ? source.phase as ClaudeCodePhase
    : 'unknown'
  const phase = (statusCorrelation === 'ambiguous'
    || statusCorrelation === 'none' && stateSource !== 'metadata-history')
    ? 'unknown'
    : declaredPhase
  return {
    sessionId,
    cliSessionId,
    title: textOf(source.title),
    cwd: textOf(source.cwd),
    originCwd: textOf(source.originCwd),
    projectKey: /^[a-f0-9]{32}$/i.test(textOf(source.projectKey)) ? textOf(source.projectKey).toLowerCase() : '',
    createdAt: timeOf(source.createdAt),
    lastActivityAt: timeOf(source.lastActivityAt),
    lastFocusedAt: timeOf(source.lastFocusedAt),
    model: textOf(source.model),
    isArchived: source.isArchived === true,
    completedTurns: typeof source.completedTurns === 'number' && Number.isInteger(source.completedTurns) && source.completedTurns >= 0
      ? source.completedTurns
      : 0,
    metadataUpdatedAt: timeOf(source.metadataUpdatedAt),
    statusCorrelation,
    stateSource,
    stateCompatibility,
    stateGeneration: typeof source.stateGeneration === 'number' && Number.isInteger(source.stateGeneration) && source.stateGeneration > 0
      ? source.stateGeneration
      : 0,
    phase,
    phaseUpdatedAt: timeOf(source.phaseUpdatedAt),
    turnStartedAt: timeOf(source.turnStartedAt),
    hookActivityAt: timeOf(source.hookActivityAt),
    waitingApprovalAt: timeOf(source.waitingApprovalAt),
    waitingInputAt: timeOf(source.waitingInputAt),
    lastStopAt: timeOf(source.lastStopAt),
    lastSessionEndAt: timeOf(source.lastSessionEndAt)
  }
}

export interface ClaudeCodeUnreadObservation {
  version: 1 | 2
  ids: readonly string[]
  readAt: number
  generation: number
  sourceFingerprint: string
}

export function normalizeClaudeCodeUnread(raw: unknown): ClaudeCodeUnreadObservation | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const source = raw as Record<string, unknown>
  if (!Array.isArray(source.ids)) return null
  const isV2 = source.version === 2
  const generation = source.generation
  const sourceFingerprint = textOf(source.sourceFingerprint)
  // V2 is the reliable snapshot contract. A producer that declares V2 but
  // omits its stability proof must fail closed rather than silently becoming a
  // generation-0 observation that could overwrite a complete snapshot.
  if (isV2 && (!Number.isInteger(generation) || Number(generation) < 0 || !/^[a-f0-9]{16,64}$/i.test(sourceFingerprint))) return null
  const ids: string[] = []
  for (const value of source.ids) {
    const id = textOf(value).trim().toLowerCase()
    if (!LOCAL_SESSION_PATTERN.test(id) || ids.includes(id)) continue
    ids.push(id)
    if (ids.length >= 500) break
  }
  const version = isV2 ? 2 : 1
  return {
    version,
    ids,
    readAt: timeOf(source.readAt),
    generation: version === 2
      ? Number(generation)
      : 0,
    sourceFingerprint: version === 2
      ? sourceFingerprint.toLowerCase()
      : ''
  }
}

/** Stable only for one completed output; title/project metadata cannot advance it. */
export function claudeCodeCompletionEpoch(observation: ClaudeCodeObservation): string {
  if (observation.phase !== 'completed') return ''
  const completedAt = observation.lastStopAt || observation.phaseUpdatedAt || observation.lastActivityAt
  return `${observation.completedTurns}:${completedAt}`
}

export function claudeCodeDisplayName(observation: Pick<ClaudeCodeObservation, 'title'>): string {
  return observation.title.trim() || 'General coding session'
}

export function claudeCodeProjectPath(observation: Pick<ClaudeCodeObservation, 'originCwd' | 'cwd'>): string {
  return observation.originCwd || observation.cwd || ''
}

export function claudeCodeProjectName(observation: Pick<ClaudeCodeObservation, 'originCwd' | 'cwd'>): string {
  const path = claudeCodeProjectPath(observation).replace(/[\\/]+$/, '')
  const segments = path.split(/[\\/]/).filter(Boolean)
  return segments.at(-1) || 'Claude'
}

export function claudeCodeActivityAt(observation: ClaudeCodeObservation): number {
  return Math.max(
    observation.phaseUpdatedAt,
    observation.hookActivityAt,
    observation.lastActivityAt,
    observation.lastFocusedAt,
    observation.metadataUpdatedAt,
    observation.createdAt
  )
}

export interface ClaudeCodeResolvedState {
  phase: ClaudeCodePhase
  bucket: CodexTaskBucket
  activityState: CodexTaskActivityState
  archiveCapability: CodexArchiveCapability
  unreadState: 'unread' | 'read' | 'unknown'
}

export function resolveClaudeCodeState(
  observation: ClaudeCodeObservation,
  appUnread: readonly string[] | null = null
): ClaudeCodeResolvedState {
  const unreadKnown = Array.isArray(appUnread)
  const unread = unreadKnown && appUnread.includes(observation.sessionId)
  if (observation.phase === 'waiting-approval') {
    return { phase: observation.phase, bucket: 'ongoing', activityState: 'waiting-approval', archiveCapability: 'blocked-active', unreadState: 'unknown' }
  }
  if (observation.phase === 'waiting-input') {
    return { phase: observation.phase, bucket: 'ongoing', activityState: 'waiting-input', archiveCapability: 'blocked-active', unreadState: 'unknown' }
  }
  if (observation.phase === 'running') {
    return { phase: observation.phase, bucket: 'ongoing', activityState: 'active', archiveCapability: 'blocked-active', unreadState: 'unknown' }
  }
  // Native App unread membership is itself exact evidence of an unseen
  // completed output. It may recover a cold historical/unknown row, while a
  // newer live running/waiting phase above always keeps priority.
  if (observation.phase === 'completed' || unread) {
    return {
      phase: 'completed',
      bucket: unread ? 'completed-unread' : 'completed',
      activityState: 'ongoing',
      archiveCapability: 'allowed',
      unreadState: unreadKnown ? (unread ? 'unread' : 'read') : 'unknown'
    }
  }
  if (observation.phase === 'stopped') {
    return { phase: observation.phase, bucket: 'stopped', activityState: 'stopped', archiveCapability: 'blocked-stopped', unreadState: 'unknown' }
  }
  // The shared conversation schema has no fifth `unknown` bucket. Keep the
  // card in its one non-active bucket and mark the presentation as attention;
  // consumers can inspect `claudePhase` for the accurate label.
  return { phase: 'unknown', bucket: 'stopped', activityState: 'ongoing', archiveCapability: 'blocked-stopped', unreadState: 'unknown' }
}

export interface ClaudeCodeProjectionOptions {
  appUnread?: readonly string[] | null
  aliases?: Readonly<Record<string, string | undefined>>
  projectAliases?: Readonly<Record<string, string | undefined>>
  hiddenKeys?: readonly string[]
  localPinnedKeys?: readonly string[]
}

export type ClaudeCodeTaskCard = CodexTaskCard & { claudePhase: ClaudeCodePhase }

export function projectClaudeCodeTaskCard(
  observation: ClaudeCodeObservation,
  options: ClaudeCodeProjectionOptions = {}
): ClaudeCodeTaskCard {
  const resolved = resolveClaudeCodeState(observation, options.appUnread ?? null)
  const key = companionTaskKey('claude', observation.sessionId)
  const originalName = claudeCodeDisplayName(observation)
  const alias = options.aliases?.[key]
  const originalProjectName = claudeCodeProjectName(observation)
  const projectKey = observation.projectKey || companionTaskKey('claude', `project:${originalProjectName.normalize('NFKC').toLocaleLowerCase()}`)
  const projectName = options.projectAliases?.[projectKey] || originalProjectName
  const updatedAt = claudeCodeActivityAt(observation)
  const completedAt = resolved.phase === 'completed'
    ? observation.lastStopAt || observation.phaseUpdatedAt || observation.metadataUpdatedAt || observation.lastActivityAt
    : 0
  return {
    key,
    actionAlias: observation.sessionId,
    name: alias || originalName,
    displayName: alias || originalName,
    originalName,
    ...(alias ? { alias } : {}),
    bucket: resolved.bucket,
    activityState: resolved.activityState,
    archiveCapability: resolved.archiveCapability,
    revisionAt: completedAt || updatedAt,
    ...(completedAt ? { completionRevision: completedAt, lastTurnCompletedAt: completedAt } : {}),
    unreadState: resolved.unreadState,
    state: resolved.phase === 'waiting-approval'
      ? 'waiting-approval'
      : resolved.phase === 'waiting-input'
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
    activeFlags: resolved.phase === 'waiting-approval'
      ? ['waitingOnApproval']
      : resolved.phase === 'waiting-input'
        ? ['waitingOnUserInput']
        : undefined,
    updatedAt,
    ...(observation.turnStartedAt ? { lastQuestionAt: observation.turnStartedAt, lastTurnStartedAt: observation.turnStartedAt } : {}),
    createdAt: observation.createdAt || undefined,
    firstPromptAt: observation.createdAt || undefined,
    source: resolved.phase === 'unknown' ? 'unresolved' : 'current',
    hasCurrentActivity: resolved.bucket === 'ongoing',
    // Claude App exposes no compatible archive mutation; state can still be a
    // completed result while the action capability remains explicitly off.
    canArchive: false,
    projectKey,
    projectName,
    originalProjectName,
    projectKind: 'project',
    isHidden: (options.hiddenKeys || []).includes(key),
    ...((options.localPinnedKeys || []).includes(key) ? { pinSource: 'local' as const } : {}),
    provider: 'claude',
    claudePhase: resolved.phase
  }
}

export function projectClaudeCodeTaskCards(
  observations: readonly ClaudeCodeObservation[],
  options: ClaudeCodeProjectionOptions = {}
): ClaudeCodeTaskCard[] {
  return observations
    .filter((observation) => !observation.isArchived)
    .map((observation) => projectClaudeCodeTaskCard(observation, options))
}
