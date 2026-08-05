import type {
  CodexArchiveCapability,
  CodexTaskActivityState,
  CodexTaskBucket,
  CodexTaskCard
} from './codex'
import { companionTaskKey } from './companionProvider'

/**
 * Claude Code companion domain.
 *
 * This module is pure: it turns the privacy-safe observations produced by the
 * Claude preload bridge into the same task cards and quota buckets the rest of
 * the companion already speaks. It never reads the filesystem, never touches a
 * credential and never sees prompt or transcript content — the bridge is
 * responsible for keeping those out of the observation in the first place.
 */

/* ------------------------------------------------------------------ *
 * Hook events
 * ------------------------------------------------------------------ */

/**
 * The subset of Claude Code hook events the companion subscribes to, reduced to
 * privacy-safe classes. The bridge maps raw `hook_event_name` values onto these
 * and discards every payload field except session identity and timing.
 */
export type ClaudeHookEvent =
  | 'session-start'
  | 'prompt-submit'
  | 'pre-tool'
  | 'post-tool'
  | 'permission-request'
  | 'notification'
  | 'stop'
  | 'stop-failure'
  | 'subagent-start'
  | 'subagent-stop'
  | 'session-end'

const CLAUDE_HOOK_EVENTS: readonly ClaudeHookEvent[] = [
  'session-start',
  'prompt-submit',
  'pre-tool',
  'post-tool',
  'permission-request',
  'notification',
  'stop',
  'stop-failure',
  'subagent-start',
  'subagent-stop',
  'session-end'
]

/** Raw Claude Code `hook_event_name` → companion event class. */
export const CLAUDE_HOOK_EVENT_NAMES: Readonly<Record<string, ClaudeHookEvent>> = {
  SessionStart: 'session-start',
  UserPromptSubmit: 'prompt-submit',
  PreToolUse: 'pre-tool',
  PostToolUse: 'post-tool',
  PostToolUseFailure: 'post-tool',
  PostToolBatch: 'post-tool',
  PermissionRequest: 'permission-request',
  Notification: 'notification',
  Stop: 'stop',
  StopFailure: 'stop-failure',
  SubagentStart: 'subagent-start',
  SubagentStop: 'subagent-stop',
  SessionEnd: 'session-end'
}

export function normalizeClaudeHookEvent(value: unknown): ClaudeHookEvent | null {
  if (typeof value !== 'string' || !value) return null
  if ((CLAUDE_HOOK_EVENTS as readonly string[]).includes(value)) return value as ClaudeHookEvent
  return CLAUDE_HOOK_EVENT_NAMES[value] || null
}

/* ------------------------------------------------------------------ *
 * Observations
 * ------------------------------------------------------------------ */

export interface ClaudeSessionObservation {
  sessionId: string
  /** Encoded project directory name under `~/.claude/projects`. */
  projectSlug: string
  /** Decoded working directory of the session. */
  cwd: string
  gitBranch?: string
  startedAt?: number
  /** Latest evidence timestamp: newest hook event or transcript append. */
  updatedAt: number
  lastPromptAt?: number
  lastAssistantAt?: number
  lastStopAt?: number
  model?: string
  /** Claude Code sub-agent transcript; the companion treats it as a side chat. */
  isSidechain?: boolean
  parentSessionId?: string
  turns?: number
  /** Tool calls issued but not yet answered by a tool result. */
  pendingToolUse?: number
  contextTokens?: number
  /** Newest hook event observed for this session in the current bridge session. */
  hookEvent?: ClaudeHookEvent | null
  hookEventAt?: number
  /** Whether the owning `claude` process is still alive, when the bridge knows. */
  processAlive?: boolean
  /** Terminal-window jump hint; never leaves the local machine. */
  pid?: number
}

/**
 * Session-scoped read receipts owned by EyPc. Claude has no native read-state,
 * so a completed session stays unread until the plugin itself opens it.
 */
export interface ClaudeReadReceipts {
  /** Session id → completion watermark that has already been opened. */
  readonly [sessionId: string]: number | undefined
}

/**
 * Normalizes persisted read receipts. Bounded and numeric-only, so a corrupted
 * or hand-edited state file cannot grow without limit or inject a non-number
 * into the completion comparison.
 */
export const CLAUDE_MAX_RECEIPTS = 500

export function normalizeClaudeReceipts(value: unknown): ClaudeReadReceipts {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const entries: Array<[string, number]> = []
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof key !== 'string' || !key || key.length > 128) continue
    const at = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isFinite(at) || at <= 0) continue
    entries.push([key, Math.trunc(at)])
  }
  entries.sort((left, right) => right[1] - left[1])
  return Object.fromEntries(entries.slice(0, CLAUDE_MAX_RECEIPTS))
}

/**
 * Idle grace period. A session whose newest evidence is older than this and
 * whose last event was an assistant reply is treated as finished rather than
 * still running, which is how a session that ended without a `Stop` hook (or
 * while the plugin was closed) still resolves.
 */
export const CLAUDE_IDLE_GRACE_MS = 45_000

/**
 * How long a hook event stays authoritative without any follow-up.
 *
 * Hook evidence is exact but it is not self-expiring: a `Notification` fired
 * just before the user killed the terminal produces no `Stop` and no
 * `SessionEnd`. Without a ceiling the task would sit in "waiting for input"
 * forever and keep capturing the task cycle. Past the ceiling the transcript
 * plus the idle grace period decides instead.
 */
export const CLAUDE_HOOK_EVIDENCE_MAX_AGE_MS = 30 * 60 * 1000

function isHookEvidenceStale(observation: ClaudeSessionObservation, now: number): boolean {
  if (!observation.hookEvent) return true
  const at = observation.hookEventAt || 0
  if (at <= 0) return false
  return now - at > CLAUDE_HOOK_EVIDENCE_MAX_AGE_MS
}

/* ------------------------------------------------------------------ *
 * State resolution
 * ------------------------------------------------------------------ */

export interface ClaudeResolvedState {
  bucket: CodexTaskBucket
  activityState: CodexTaskActivityState
  archiveCapability: CodexArchiveCapability
  /** True while the evidence is too weak to claim a terminal state. */
  conservative: boolean
}

function isRunningHook(event: ClaudeHookEvent | null | undefined): boolean {
  return event === 'prompt-submit' || event === 'pre-tool' || event === 'post-tool'
    || event === 'session-start' || event === 'subagent-start' || event === 'subagent-stop'
}

/**
 * Resolves one session's companion state.
 *
 * Hook evidence outranks transcript shape because it is exact and current. When
 * no hook has been seen — a cold start, or a session that ran while the plugin
 * was closed — the transcript tail plus the idle grace period is used, and any
 * genuinely ambiguous case stays `ongoing` rather than inventing a terminal
 * state.
 */
export function resolveClaudeSessionState(
  observation: ClaudeSessionObservation,
  now: number = Date.now(),
  receipts: ClaudeReadReceipts = {}
): ClaudeResolvedState {
  const ongoing = (activityState: CodexTaskActivityState, conservative = false): ClaudeResolvedState => ({
    bucket: 'ongoing',
    activityState,
    archiveCapability: 'blocked-active',
    conservative
  })
  const event = observation.hookEvent ?? null

  const stopped: ClaudeResolvedState = {
    bucket: 'stopped',
    activityState: 'stopped',
    archiveCapability: 'blocked-stopped',
    conservative: false
  }
  // A turn that finished normally before the CLI exited is a completed
  // conversation, not a stopped one. `SessionEnd` follows `Stop` in ordinary
  // usage, so letting it win would erase the completed-unread badge every time
  // the user simply quits the terminal.
  const endedAfterCompletedTurn = (observation.lastStopAt || 0) > 0
    && (observation.lastStopAt || 0) >= (observation.lastPromptAt || 0)

  if (isHookEvidenceStale(observation, now)) {
    // Fall through to the transcript below rather than trusting a hook that has
    // had no follow-up for long enough that the session may be gone.
  } else if (event === 'permission-request') return ongoing('waiting-approval')
  else if (event === 'notification') return ongoing('waiting-input')
  else if (event === 'session-end') return endedAfterCompletedTurn ? completedState(observation, receipts) : stopped
  else if (event === 'stop-failure') return stopped
  else if (observation.processAlive === false && event !== 'stop') return stopped
  else if (event === 'stop') return completedState(observation, receipts)
  else if (isRunningHook(event)) return ongoing('active')

  if (observation.processAlive === false) return stopped

  // No usable hook evidence: fall back to transcript shape.
  const idleFor = Math.max(0, now - (observation.updatedAt || 0))
  const pendingTools = Math.max(0, observation.pendingToolUse || 0)
  if (idleFor < CLAUDE_IDLE_GRACE_MS) return ongoing('active')
  const assistantLast = (observation.lastAssistantAt || 0) >= (observation.lastPromptAt || 0)
  if (!assistantLast) {
    // The user's prompt is the newest thing in the transcript and nothing has
    // answered it. That is unresolved, not finished.
    return ongoing('ongoing', true)
  }
  if (pendingTools > 0) return ongoing('ongoing', true)
  return completedState(observation, receipts)
}

function completedState(observation: ClaudeSessionObservation, receipts: ClaudeReadReceipts): ClaudeResolvedState {
  const watermark = claudeCompletionRevision(observation)
  const readAt = receipts[observation.sessionId]
  const read = typeof readAt === 'number' && readAt >= watermark
  return {
    bucket: read ? 'completed' : 'completed-unread',
    activityState: 'ongoing',
    archiveCapability: 'allowed',
    conservative: false
  }
}

/** Privacy-safe completion watermark: a timestamp, never turn content. */
export function claudeCompletionRevision(observation: ClaudeSessionObservation): number {
  return Math.max(
    observation.lastStopAt || 0,
    observation.lastAssistantAt || 0,
    observation.updatedAt || 0
  )
}

/* ------------------------------------------------------------------ *
 * Project identity
 * ------------------------------------------------------------------ */

/**
 * Claude Code encodes a project directory by replacing path separators and dots
 * with dashes, so the slug alone cannot be decoded back into a path. The bridge
 * therefore reports the real `cwd` from the transcript and this helper is only a
 * display fallback for a session whose transcript had no cwd yet.
 */
export function claudeProjectNameFromSlug(slug: string): string {
  const value = typeof slug === 'string' ? slug : ''
  const trimmed = value.replace(/^-+/, '')
  if (!trimmed) return 'Claude'
  const segments = trimmed.split('-').filter(Boolean)
  return segments.length ? segments[segments.length - 1] : trimmed
}

export function claudeProjectKey(observation: ClaudeSessionObservation): string {
  const base = observation.cwd || observation.projectSlug || 'claude'
  return companionTaskKey('claude', `project:${base}`)
}

function claudeProjectName(observation: ClaudeSessionObservation): string {
  if (observation.cwd) {
    const segments = observation.cwd.replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean)
    if (segments.length) return segments[segments.length - 1]
  }
  return claudeProjectNameFromSlug(observation.projectSlug)
}

/** Short, stable display name. Never derived from prompt or reply content. */
export function claudeSessionDisplayName(observation: ClaudeSessionObservation): string {
  const project = claudeProjectName(observation)
  const suffix = (observation.sessionId || '').slice(0, 8)
  const base = observation.isSidechain ? `${project} · 子会话` : project
  return suffix ? `${base} ${suffix}` : base
}

/* ------------------------------------------------------------------ *
 * Task card projection
 * ------------------------------------------------------------------ */

export interface ClaudeTaskProjectionOptions {
  now?: number
  receipts?: ClaudeReadReceipts
  /** EyPc-local aliases keyed by companion task key. */
  aliases?: Readonly<Record<string, string | undefined>>
  hiddenKeys?: readonly string[]
  localPinnedKeys?: readonly string[]
}

export function projectClaudeTaskCard(
  observation: ClaudeSessionObservation,
  options: ClaudeTaskProjectionOptions = {}
): CodexTaskCard {
  const now = Number.isFinite(options.now) ? options.now! : Date.now()
  const state = resolveClaudeSessionState(observation, now, options.receipts || {})
  const key = companionTaskKey('claude', observation.sessionId)
  const originalName = claudeSessionDisplayName(observation)
  const alias = options.aliases?.[key]
  const hidden = (options.hiddenKeys || []).includes(key)
  const locallyPinned = (options.localPinnedKeys || []).includes(key)
  const projectName = claudeProjectName(observation)
  return {
    key,
    actionAlias: observation.sessionId,
    name: alias || originalName,
    displayName: alias || originalName,
    originalName,
    ...(alias ? { alias } : {}),
    bucket: state.bucket,
    activityState: state.activityState,
    archiveCapability: state.archiveCapability,
    revisionAt: Math.max(observation.updatedAt || 0, observation.startedAt || 0),
    completionRevision: state.bucket === 'completed' || state.bucket === 'completed-unread'
      ? claudeCompletionRevision(observation)
      : undefined,
    unreadState: state.bucket === 'completed-unread' ? 'unread' : state.bucket === 'completed' ? 'read' : 'unknown',
    lastQuestionAt: observation.lastPromptAt,
    state: legacyPresentationState(state),
    activeFlags: state.activityState === 'waiting-approval'
      ? ['waitingOnApproval']
      : state.activityState === 'waiting-input'
        ? ['waitingOnUserInput']
        : undefined,
    updatedAt: observation.updatedAt || 0,
    createdAt: observation.startedAt,
    firstPromptAt: observation.startedAt,
    lastTurnStartedAt: observation.lastPromptAt,
    lastTurnCompletedAt: observation.lastAssistantAt,
    source: 'current',
    hasCurrentActivity: state.bucket === 'ongoing',
    canArchive: state.archiveCapability === 'allowed',
    projectKey: claudeProjectKey(observation),
    projectName,
    originalProjectName: projectName,
    projectKind: 'project',
    isHidden: hidden,
    ...(locallyPinned ? { pinSource: 'local' as const } : {}),
    provider: 'claude'
  }
}

function legacyPresentationState(state: ClaudeResolvedState): CodexTaskCard['state'] {
  if (state.activityState === 'waiting-approval') return 'waiting-approval'
  if (state.activityState === 'waiting-input') return 'waiting-input'
  if (state.bucket === 'stopped') return 'stopped'
  if (state.bucket === 'completed-unread') return 'pending-review'
  if (state.bucket === 'completed') return 'recent-activity'
  return 'running'
}

/**
 * Projects a whole inventory. Side chats are folded into their parent when the
 * parent is present, mirroring the Codex Side Chat contract: a child's terminal
 * state can never close a parent that is still active elsewhere.
 */
export function projectClaudeTaskCards(
  observations: readonly ClaudeSessionObservation[],
  options: ClaudeTaskProjectionOptions = {}
): CodexTaskCard[] {
  const parents = new Set(observations.filter((item) => !item.isSidechain).map((item) => item.sessionId))
  const cards: CodexTaskCard[] = []
  const childActivity = new Map<string, boolean>()
  for (const observation of observations) {
    if (observation.isSidechain && observation.parentSessionId && parents.has(observation.parentSessionId)) {
      const state = resolveClaudeSessionState(observation, options.now, options.receipts || {})
      if (state.bucket === 'ongoing') childActivity.set(observation.parentSessionId, true)
      continue
    }
    cards.push(projectClaudeTaskCard(observation, options))
  }
  return cards.map((card) => {
    const rawKey = card.actionAlias || ''
    if (!childActivity.get(rawKey) || card.bucket === 'ongoing') return card
    // A live side chat keeps its parent ongoing even after the parent's own
    // latest turn resolved.
    return {
      ...card,
      bucket: 'ongoing',
      activityState: 'active',
      archiveCapability: 'blocked-active',
      canArchive: false,
      hasCurrentActivity: true,
      unreadState: 'unknown',
      state: 'running'
    }
  })
}

/* ------------------------------------------------------------------ *
 * Quota
 * ------------------------------------------------------------------ */

export type ClaudeQuotaStatus = 'idle' | 'loading' | 'ok' | 'stale' | 'error'

export interface ClaudeQuotaWindow {
  /** Remaining share of the window, 0–100, matching the Codex bucket contract. */
  remainingPercent: number
  resetAt: number | null
  windowMinutes: number
}

export interface ClaudeQuotaSnapshot {
  version: 1
  status: ClaudeQuotaStatus
  /** 5-hour rolling window. */
  short: ClaudeQuotaWindow | null
  /** 7-day window. */
  weekly: ClaudeQuotaWindow | null
  source: 'statusline' | 'usage-api' | 'none'
  updatedAt: number
}

export const CLAUDE_SHORT_WINDOW_MINUTES = 5 * 60
export const CLAUDE_WEEKLY_WINDOW_MINUTES = 7 * 24 * 60

export function emptyClaudeQuota(): ClaudeQuotaSnapshot {
  return { version: 1, status: 'idle', short: null, weekly: null, source: 'none', updatedAt: 0 }
}

function usedPercentToRemaining(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const used = Math.min(100, Math.max(0, value))
  return Math.round((100 - used) * 10) / 10
}

function resetAtToMs(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  // Claude Code reports Unix epoch seconds; tolerate a millisecond value too.
  return value > 1e11 ? Math.round(value) : Math.round(value * 1000)
}

interface ClaudeRateLimitWindowInput {
  used_percentage?: unknown
  resets_at?: unknown
}

export interface ClaudeRateLimitsInput {
  five_hour?: ClaudeRateLimitWindowInput | null
  seven_day?: ClaudeRateLimitWindowInput | null
}

function windowFrom(input: ClaudeRateLimitWindowInput | null | undefined, windowMinutes: number): ClaudeQuotaWindow | null {
  if (!input || typeof input !== 'object') return null
  const remainingPercent = usedPercentToRemaining(input.used_percentage)
  if (remainingPercent === null) return null
  return { remainingPercent, resetAt: resetAtToMs(input.resets_at), windowMinutes }
}

/**
 * Normalizes the official `rate_limits` object Claude Code hands to a status
 * line script. Each window may be independently absent, which is not an error —
 * it just means that window has not been reported yet this session.
 */
export function normalizeClaudeQuota(
  input: ClaudeRateLimitsInput | null | undefined,
  options: { source?: ClaudeQuotaSnapshot['source']; updatedAt?: number; status?: ClaudeQuotaStatus } = {}
): ClaudeQuotaSnapshot {
  const short = windowFrom(input?.five_hour, CLAUDE_SHORT_WINDOW_MINUTES)
  const weekly = windowFrom(input?.seven_day, CLAUDE_WEEKLY_WINDOW_MINUTES)
  const hasReading = Boolean(short || weekly)
  return {
    version: 1,
    status: options.status || (hasReading ? 'ok' : 'idle'),
    short,
    weekly,
    source: hasReading ? (options.source || 'statusline') : 'none',
    updatedAt: Number.isFinite(options.updatedAt) ? options.updatedAt! : 0
  }
}

/** Marks a previously good reading as stale instead of discarding it. */
export function staleClaudeQuota(previous: ClaudeQuotaSnapshot | null | undefined): ClaudeQuotaSnapshot {
  if (!previous || (!previous.short && !previous.weekly)) return { ...emptyClaudeQuota(), status: 'stale' }
  return { ...previous, status: 'stale' }
}

/** Primary reading for the water ball centre percentage. */
export function claudePrimaryQuotaWindow(quota: ClaudeQuotaSnapshot | null | undefined): ClaudeQuotaWindow | null {
  if (!quota) return null
  return quota.short || quota.weekly
}

/* ------------------------------------------------------------------ *
 * Readiness
 * ------------------------------------------------------------------ */

export interface ClaudeEnvironmentSnapshot {
  version: 1
  /** CLI binary was located. */
  installed: boolean
  /** `~/.claude` exists and is readable. */
  homeReady: boolean
  authenticated: boolean
  cliVersion: string
  /** Hook bridge registration state. */
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

/**
 * Readiness describes whether Claude *state* can be read, which is not the same
 * question as whether the CLI binary can be found.
 *
 * Task cards come from the transcripts under `~/.claude/projects` and the quota
 * comes from the status line cache; neither needs the executable. The binary is
 * required for exactly one thing — resuming a session from a card — so a Claude
 * Code installed through a Node version manager the probe cannot see must
 * degrade that single capability instead of silently emptying the whole lane.
 * `installed: false` therefore only means "not installed at all" when the data
 * directory is missing too.
 */
export function claudeReadinessReason(
  environment: ClaudeEnvironmentSnapshot | null | undefined
): 'ready' | 'not-installed' | 'not-authenticated' | 'degraded' | 'unknown' {
  if (!environment) return 'unknown'
  if (!environment.installed && !environment.homeReady) return 'not-installed'
  if (!environment.authenticated) return 'not-authenticated'
  if (!environment.homeReady) return 'degraded'
  if (!environment.installed) return 'degraded'
  if (environment.hooks !== 'installed') return 'degraded'
  return 'ready'
}

export function isClaudeAvailable(environment: ClaudeEnvironmentSnapshot | null | undefined): boolean {
  const reason = claudeReadinessReason(environment)
  return reason === 'ready' || reason === 'degraded'
}

/**
 * Whether a card can hand a session back to Claude Code. This is the one
 * capability the CLI binary actually gates, kept separate from readiness so a
 * missing binary never reaches the reading paths.
 */
export function canOpenClaudeTask(environment: ClaudeEnvironmentSnapshot | null | undefined): boolean {
  return environment?.installed === true
}
