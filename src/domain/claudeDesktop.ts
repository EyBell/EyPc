import type {
  CodexArchiveCapability,
  CodexTaskActivityState,
  CodexTaskBucket,
  CodexTaskCard
} from './codex'
import type { ClaudeReadReceipts } from './claude'
import { companionTaskKey } from './companionProvider'

/**
 * Claude Desktop (Cowork) companion domain — Phase 1.
 *
 * Pure module: it turns privacy-safe observations of the Claude desktop app's
 * session store (`~/Library/Application Support/Claude/local-agent-mode-sessions`)
 * into companion state. It never reads the filesystem itself — the future
 * preload bridge owns discovery and watching, and this module owns meaning.
 *
 * Verified inputs (spec 260806/1130, P0-1 sample of a live session):
 *
 * - `local_<uuid>.json` — metadata; heartbeats at minute granularity while the
 *   session runs. Carries `cliSessionId`, the id of the wrapped Claude Code CLI
 *   session — audit lines carry the same id, and the CLI provider may already
 *   see that session's transcript, so it is the cross-provider dedup key.
 * - `audit.jsonl` — append-only event log. Sampled vocabulary:
 *   `system/init`, `system/status` (requesting), `system/thinking_tokens`,
 *   `assistant`, `user`, `command_lifecycle` (queued/started/completed),
 *   `result` (turn terminal), `system/permission_request` /
 *   `permission_response`, `rate_limit_event` (resetsAt + limited flag, no
 *   percentage). Timestamps are ISO strings.
 *
 * Privacy rule for the future bridge, enforced by this module's input shape:
 * only `type`/`subtype`/`state`/`timestamp`/`granted`/`rate_limit_info`
 * scalars survive normalization. `message`, `tool_input`, `result` bodies and
 * every other content-bearing field must never reach the domain.
 */

/* ------------------------------------------------------------------ *
 * Metadata
 * ------------------------------------------------------------------ */

export interface ClaudeDesktopSessionMetadata {
  /** Desktop session id, e.g. `local_<uuid>`. */
  sessionId: string
  title: string
  /** Working directory the session runs in. */
  cwd: string
  /** Folders the user connected; drives project attribution. */
  folders: string[]
  createdAt: number
  /** Heartbeat: advances while the session is active. */
  lastActivityAt: number
  model: string
  isArchived: boolean
  /** Non-empty when the session belongs to a scheduled task. */
  scheduledTaskId: string
  /** Underlying Claude Code CLI session id; the cross-provider dedup key. */
  cliSessionId: string
}

function toMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    // Tolerate epoch seconds alongside milliseconds, like the quota domain.
    return value > 1e11 ? Math.round(value) : Math.round(value * 1000)
  }
  if (typeof value === 'string' && value) {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return 0
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Normalizes one `local_<uuid>.json` payload.
 *
 * Tolerant by design: every field except the session id may be absent or
 * malformed without discarding the session. The raw file also carries
 * `systemPrompt`, `initialMessage`, account identity and other content-bearing
 * fields — they are deliberately never copied into the result.
 */
export function normalizeClaudeDesktopSession(raw: unknown): ClaudeDesktopSessionMetadata | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const source = raw as Record<string, unknown>
  const sessionId = toText(source.sessionId).trim()
  if (!sessionId) return null
  const folders = Array.isArray(source.userSelectedFolders)
    ? source.userSelectedFolders.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : []
  return {
    sessionId,
    title: toText(source.title),
    cwd: toText(source.cwd),
    folders,
    createdAt: toMs(source.createdAt),
    lastActivityAt: toMs(source.lastActivityAt),
    model: toText(source.model),
    isArchived: source.isArchived === true,
    scheduledTaskId: toText(source.scheduledTaskId),
    cliSessionId: toText(source.cliSessionId).trim()
  }
}

/* ------------------------------------------------------------------ *
 * Audit events
 * ------------------------------------------------------------------ */

/** Privacy-safe audit event classes, the desktop analog of ClaudeHookEvent. */
export type ClaudeDesktopAuditEvent =
  | 'init'
  | 'status'
  | 'activity'
  | 'command-started'
  | 'command-completed'
  | 'result'
  | 'permission-request'
  | 'permission-response'
  | 'rate-limit'

const CLAUDE_DESKTOP_AUDIT_EVENTS: readonly ClaudeDesktopAuditEvent[] = [
  'init',
  'status',
  'activity',
  'command-started',
  'command-completed',
  'result',
  'permission-request',
  'permission-response',
  'rate-limit'
]

/**
 * Validates an event-class name that crossed the bridge as a plain string. An
 * unknown non-empty name degrades to `activity` — same tolerance as the line
 * classifier — and everything else is `null`.
 */
export function normalizeClaudeDesktopAuditEventName(value: unknown): ClaudeDesktopAuditEvent | null {
  if (typeof value !== 'string' || !value) return null
  return (CLAUDE_DESKTOP_AUDIT_EVENTS as readonly string[]).includes(value)
    ? value as ClaudeDesktopAuditEvent
    : 'activity'
}

export interface ClaudeDesktopRateLimitInfo {
  /** GMT reset moment in ms, when reported. */
  resetsAt: number | null
  /** True when the event says the account is currently limited. */
  limited: boolean
  /** e.g. `five_hour`; kept verbatim for the quota lane to interpret. */
  windowType: string
}

export interface ClaudeDesktopAuditObservation {
  event: ClaudeDesktopAuditEvent
  at: number
  /** permission-response only. */
  granted?: boolean
  /** rate-limit only. */
  rateLimit?: ClaudeDesktopRateLimitInfo
}

/**
 * Reduces one raw audit line to its privacy-safe class.
 *
 * Unknown but well-formed types normalize to `activity` — the log is an
 * evolving product surface and an unrecognized event is still evidence that
 * the session is alive (RAW-094's lesson: don't treat every unknown private
 * field as a broken protocol). Lines without a usable timestamp are dropped.
 */
export function normalizeClaudeDesktopAuditLine(raw: unknown): ClaudeDesktopAuditObservation | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const source = raw as Record<string, unknown>
  const at = toMs(source.timestamp)
  if (at <= 0) return null
  const type = toText(source.type)
  const subtype = toText(source.subtype)

  if (type === 'system') {
    if (subtype === 'init') return { event: 'init', at }
    if (subtype === 'status') return { event: 'status', at }
    if (subtype === 'permission_request') return { event: 'permission-request', at }
    if (subtype === 'permission_response') {
      return { event: 'permission-response', at, granted: source.granted === true }
    }
    return { event: 'activity', at }
  }
  if (type === 'command_lifecycle') {
    const state = toText(source.state)
    if (state === 'completed') return { event: 'command-completed', at }
    return { event: 'command-started', at }
  }
  if (type === 'result') return { event: 'result', at }
  if (type === 'rate_limit_event') {
    const info = (source.rate_limit_info && typeof source.rate_limit_info === 'object' && !Array.isArray(source.rate_limit_info))
      ? source.rate_limit_info as Record<string, unknown>
      : {}
    const resetsAt = toMs(info.resetsAt)
    return {
      event: 'rate-limit',
      at,
      rateLimit: {
        resetsAt: resetsAt > 0 ? resetsAt : null,
        limited: toText(info.status) !== '' && toText(info.status) !== 'allowed',
        windowType: toText(info.rateLimitType)
      }
    }
  }
  if (type === 'assistant' || type === 'user') return { event: 'activity', at }
  if (!type) return null
  return { event: 'activity', at }
}

/* ------------------------------------------------------------------ *
 * Session observation & state
 * ------------------------------------------------------------------ */

/**
 * One desktop session as observed through the read-only bridge.
 *
 * **Three different clocks land in this object and must never be compared with
 * each other.** A P5 adversarial review found the completion rule comparing an
 * in-line timestamp against a file mtime, which made it fire essentially never
 * on a real machine (mtime is always stamped a few milliseconds *after* the
 * line it wrote). Each field below names its frame of reference; only fields
 * sharing a frame may be ordered against one another.
 */
export interface ClaudeDesktopObservation {
  metadata: ClaudeDesktopSessionMetadata
  /** Newest normalized audit event, when the bridge has read any. */
  lastEvent?: ClaudeDesktopAuditEvent | null
  /** Clock A — in-line audit timestamp written by the desktop app. */
  lastEventAt?: number
  /** Clock A — newest `result` (turn terminal) in-line timestamp. */
  lastResultAt?: number
  /** Clock A — in-line timestamp. */
  lastPermissionRequestAt?: number
  /** Clock A — in-line timestamp. */
  lastPermissionResponseAt?: number
  /**
   * Clock B — audit file mtime (host wall clock), i.e. newest growth evidence
   * even when the appended lines were not parsed. 0 while the file is missing.
   * Always slightly later than the Clock A timestamp of the line it wrote.
   */
  auditUpdatedAt: number
  auditBytes: number
  /**
   * True when the bridge saw audit content it could not turn into an event —
   * a line newer than {@link lastEvent}, a torn tail, or a single line too
   * large for the tail window. The turn-terminal rule must stay conservative
   * while this is set: an unparsed tail is exactly the case where a `result`
   * may already have been superseded by work we cannot see (铁律 8).
   */
  auditTailUnparsed?: boolean
}

/**
 * Idle grace for desktop sessions.
 *
 * Wider than the CLI provider's 45s: there are no push hooks, a long single
 * tool call appends nothing until it finishes, and the sampled metadata
 * heartbeat is ~1 minute. Three minutes of total silence is strong evidence
 * the turn actually ended.
 */
export const CLAUDE_DESKTOP_IDLE_GRACE_MS = 3 * 60 * 1000

/**
 * How long a parsed audit event stays authoritative without follow-up, before
 * the growth-pulse fallback decides instead. Same rationale (and value) as the
 * CLI provider's hook-evidence ceiling.
 */
export const CLAUDE_DESKTOP_EVENT_MAX_AGE_MS = 30 * 60 * 1000

export interface ClaudeDesktopResolvedState {
  bucket: CodexTaskBucket
  activityState: CodexTaskActivityState
  archiveCapability: CodexArchiveCapability
  /** True while the evidence is too weak to claim a terminal state. */
  conservative: boolean
  /**
   * Whether a read authority exists for this session, mirroring the Codex
   * provider's `unreadKnown` (codex.ts:1704). False means "we cannot know",
   * which the card reports as `unreadState: 'unknown'` rather than pretending
   * the user has read it.
   */
  readKnown?: boolean
}

/**
 * Newest activity evidence of any kind, across all three clocks.
 *
 * This is an ordering/idle signal only — it is deliberately permissive and
 * includes weak evidence (file mtime, metadata heartbeat) that must not reach
 * the read watermark. Use it for `updatedAt`, recency ordering and idle math;
 * use {@link claudeDesktopCompletionRevision} for anything a read receipt is
 * compared against.
 */
export function claudeDesktopActivityAt(observation: ClaudeDesktopObservation): number {
  return Math.max(
    observation.auditUpdatedAt || 0,
    observation.lastEventAt || 0,
    observation.lastResultAt || 0,
    // Clock C — epoch ms written by the desktop app.
    observation.metadata.lastActivityAt || 0
  )
}

/**
 * Privacy-safe completion watermark, mirroring the CLI provider's contract.
 *
 * **Content evidence only.** A P5 review found the previous version folding in
 * the audit file's mtime and the metadata heartbeat — both of which the desktop
 * app rewrites on rename and archive, so merely renaming a session bumped the
 * watermark past the user's read receipt and re-flagged finished work as
 * unread (and, through the same value, resurrected manually hidden cards).
 *
 * Sessions the bridge never parsed an event for have no content evidence at
 * all; those fall back to the permissive activity signal, because a watermark
 * of 0 would leave them permanently unhideable and permanently unread. The
 * fallback keeps the weakness confined to sessions that have nothing better.
 */
export function claudeDesktopCompletionRevision(observation: ClaudeDesktopObservation): number {
  const content = Math.max(observation.lastEventAt || 0, observation.lastResultAt || 0)
  return content > 0 ? content : claudeDesktopActivityAt(observation)
}

/**
 * Resolves one desktop session's companion state.
 *
 * Event evidence outranks growth pulses; both inherit the CLI provider's iron
 * rules — evidence is not state, a missing pulse is not a deletion, and any
 * genuinely ambiguous case stays `ongoing` rather than inventing a terminal
 * state (铁律 8, RAW-090/112 lineage).
 */
export function resolveClaudeDesktopSessionState(
  observation: ClaudeDesktopObservation,
  now: number = Date.now(),
  receipts: ClaudeReadReceipts = {},
  appUnread: readonly string[] | null = null
): ClaudeDesktopResolvedState {
  const metadata = observation.metadata

  // The user filed it away in the desktop app: terminal and read, regardless
  // of receipts. Archived work must never re-enter badges or cycling.
  if (metadata.isArchived) {
    return { bucket: 'completed', activityState: 'ongoing', archiveCapability: 'allowed', conservative: false }
  }

  const ongoing = (activityState: CodexTaskActivityState, conservative = false): ClaudeDesktopResolvedState => ({
    bucket: 'ongoing',
    activityState,
    archiveCapability: 'blocked-active',
    conservative
  })

  const eventAt = observation.lastEventAt || 0
  const eventFresh = eventAt > 0 && now - eventAt <= CLAUDE_DESKTOP_EVENT_MAX_AGE_MS

  // An unanswered permission request is the strongest waiting signal, exactly
  // like the CLI provider's permission-request hook.
  if (eventFresh
    && (observation.lastPermissionRequestAt || 0) > 0
    && (observation.lastPermissionRequestAt || 0) > (observation.lastPermissionResponseAt || 0)) {
    return ongoing('waiting-approval')
  }

  const evidenceAt = claudeDesktopActivityAt(observation)
  const idleFor = evidenceAt > 0 ? Math.max(0, now - evidenceAt) : Number.MAX_SAFE_INTEGER
  const withinGrace = idleFor < CLAUDE_DESKTOP_IDLE_GRACE_MS

  // A turn terminal with nothing newer is a completed conversation, mirroring
  // the CLI provider's `stop` rule (SessionEnd must not outrank it — 铁律 8).
  //
  // "Nothing newer" is proven by the bridge, not by this layer: the previous
  // version compared the result's in-line timestamp against the file mtime,
  // two different clocks, so the mtime was always larger and the rule never
  // fired (P5 review). `auditTailUnparsed` is the same question answered where
  // both facts share a frame of reference.
  if (eventFresh && observation.lastEvent === 'result' && !observation.auditTailUnparsed) {
    return completedState(observation, receipts, appUnread)
  }

  // Fresh event evidence outranks pulses, but it cannot claim *active* work
  // once the session has been silent past the grace window — a 30-minute-old
  // event with 20 minutes of silence is uncertainty, not activity. Staying
  // non-terminal here is 铁律 8; claiming `active` was just wrong.
  if (eventFresh) return withinGrace ? ongoing('active') : ongoing('ongoing', true)

  if (withinGrace) {
    // Growth-pulse fallback: audit growth is exact activity; a metadata
    // heartbeat alone is weaker (the file also rewrites on rename/archive).
    const exactPulse = (observation.auditUpdatedAt || 0) > 0
      && now - observation.auditUpdatedAt < CLAUDE_DESKTOP_IDLE_GRACE_MS
    return ongoing(exactPulse ? 'active' : 'ongoing', !exactPulse)
  }

  // Silence is not an outcome. The Codex provider never derives a terminal
  // state from elapsed time — `completionRevision` there requires an explicit
  // `lastTurnStatus === 'completed'`, and a thread with no completion evidence
  // falls through to `ongoing` no matter how long it has been quiet
  // (codex.ts:1686 / codex.ts:1713). This lane used to return `completedState`
  // here, manufacturing a "completed" out of a three-minute gap, which is
  // exactly what PRODUCT_REQUIREMENTS.md:137 forbids: "elapsed time and recency
  // never create completion or stop".
  return ongoing('ongoing', true)
}

/**
 * Resolves a finished turn into `completed` or `completed-unread`.
 *
 * **Unread requires an authority.** The Codex provider computes
 * `unread = completionRevision > 0 && unreadKnown && hasUnreadTurn === true`
 * and, when no read authority exists, falls to `completed` with
 * `unreadState: 'unknown'` rather than to `completed-unread`
 * (codex.ts:1704 / codex.ts:1713-1716). It never asserts "you have not read
 * this" from the mere absence of a receipt.
 *
 * For this lane the authority is **the desktop app's own unread set** — the
 * sessions still carrying a dot in its sidebar, read out of its Local Storage.
 * When that set has been observed, EyPc's badge is simply a mirror of the app's
 * dot: listed means unread, absent means the user opened it there.
 *
 * That reverses the earlier contract, and deliberately. It was written when
 * opening a session could only foreground the app, so nothing could ever prove
 * a read and a completed-unread badge would have been unclearable; the lane
 * therefore reported `completed` with `unreadState: 'unknown'`. The app's own
 * set is exactly the proof that was missing, and a mirror cannot get stuck: the
 * badge clears the moment the app's next write says it did.
 *
 * With no observation at all the old behaviour still stands — no set, no
 * authority, no badge — and a stored receipt is still honoured, so nothing
 * regresses on a machine where the set cannot be read.
 */
function completedState(
  observation: ClaudeDesktopObservation,
  receipts: ClaudeReadReceipts,
  appUnread: readonly string[] | null = null
): ClaudeDesktopResolvedState {
  const watermark = claudeDesktopCompletionRevision(observation)
  const readAt = receipts[observation.metadata.sessionId]
  const receiptKnown = typeof readAt === 'number' && readAt > 0
  const observed = Array.isArray(appUnread)
  const readKnown = observed || receiptKnown
  const read = observed
    ? !appUnread!.includes(observation.metadata.sessionId)
    : (receiptKnown ? readAt >= watermark : true)
  return {
    readKnown,
    bucket: read ? 'completed' : 'completed-unread',
    activityState: 'ongoing',
    archiveCapability: 'allowed',
    conservative: false
  }
}

/* ------------------------------------------------------------------ *
 * Project identity & task card projection
 * ------------------------------------------------------------------ */

/**
 * Desktop sessions join the existing `claude` provider channel rather than
 * introducing a third provider id (P1-2 decision): it is the same Claude to the
 * user, `companionProvider.ts` stays untouched, and keys stay in the `claude:`
 * namespace — `local_<uuid>` ids cannot collide with CLI transcript uuids.
 * A desktop-vs-CLI row marker is a Phase 3 presentation decision.
 */

/**
 * Project attribution prefers the first user-connected folder: the session's
 * own cwd is a plugin-internal outputs directory, while the connected folder is
 * the project the user actually thinks in. Matching the CLI provider's
 * `project:<path>` shape means a CLI session in the same folder lands in the
 * same project group.
 */
export function claudeDesktopProjectPath(metadata: ClaudeDesktopSessionMetadata): string {
  return metadata.folders[0] || metadata.cwd || ''
}

export function claudeDesktopProjectKey(metadata: ClaudeDesktopSessionMetadata): string {
  return companionTaskKey('claude', `project:${claudeDesktopProjectPath(metadata) || 'claude-desktop'}`)
}

function lastPathSegment(value: string): string {
  const segments = value.replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean)
  return segments.length ? segments[segments.length - 1] : ''
}

export function claudeDesktopProjectName(metadata: ClaudeDesktopSessionMetadata): string {
  return lastPathSegment(claudeDesktopProjectPath(metadata)) || 'Claude'
}

/**
 * Display name: the desktop app's own session title. This is the exact analog
 * of the Codex thread names EyPc already shows — an app-owned session label,
 * not transcript content. Sessions without a title fall back to the CLI
 * provider's project-plus-id shape.
 */
export function claudeDesktopSessionDisplayName(metadata: ClaudeDesktopSessionMetadata): string {
  const title = metadata.title.trim()
  if (title) return title
  const suffix = metadata.sessionId.replace(/^local_/, '').slice(0, 8)
  return suffix ? `${claudeDesktopProjectName(metadata)} ${suffix}` : claudeDesktopProjectName(metadata)
}

export interface ClaudeDesktopTaskProjectionOptions {
  now?: number
  receipts?: ClaudeReadReceipts
  /**
   * The desktop app's own unread set, when it has been observed. `null`/absent
   * means no reading — which yields no badge, never "everything is unread".
   */
  appUnread?: readonly string[] | null
  /** EyPc-local aliases keyed by companion task key. */
  aliases?: Readonly<Record<string, string | undefined>>
  hiddenKeys?: readonly string[]
  localPinnedKeys?: readonly string[]
}

export function projectClaudeDesktopTaskCard(
  observation: ClaudeDesktopObservation,
  options: ClaudeDesktopTaskProjectionOptions = {}
): CodexTaskCard {
  const now = Number.isFinite(options.now) ? options.now! : Date.now()
  const metadata = observation.metadata
  const state = resolveClaudeDesktopSessionState(observation, now, options.receipts || {}, options.appUnread ?? null)
  const key = companionTaskKey('claude', metadata.sessionId)
  const originalName = claudeDesktopSessionDisplayName(metadata)
  const alias = options.aliases?.[key]
  const hidden = (options.hiddenKeys || []).includes(key)
  const locallyPinned = (options.localPinnedKeys || []).includes(key)
  const projectName = claudeDesktopProjectName(metadata)
  // Ordering/recency uses the permissive signal; the read watermark uses
  // content evidence only. Conflating the two is what let a rename re-flag a
  // finished session as unread (P5 review).
  const activityAt = claudeDesktopActivityAt(observation)
  const revision = claudeDesktopCompletionRevision(observation)
  const terminal = state.bucket === 'completed' || state.bucket === 'completed-unread'
  // Single revision currency, mirroring codex.ts:1722
  // (`completionRevision || … || thread.updatedAt`). Hide, restore and archive
  // all round-trip through this number, so anything that recomputes it from a
  // different expression silently stops matching — which is exactly how the
  // desktop lane's 「隐」 became a no-op that still reported success.
  const revisionAt = (terminal ? revision : 0) || Math.max(activityAt, metadata.createdAt || 0)
  // Turn equivalents. Desktop sessions have no Turn concept, but every
  // downstream consumer of "recent activity" reads `taskActivityAt =
  // max(lastTurnStartedAt, lastTurnCompletedAt)` (codexPresentation.ts) and
  // deliberately ignores `updatedAt` — soul:87 lists "using updatedAt as
  // activity/state" as avoided behaviour. Leaving both unset scored every
  // desktop card at 0, which silently excluded them from the 动态 tab, the
  // ongoing badge and the previous/next task cycle. The session's own creation
  // is its first turn start; its newest terminal or parsed event is the closest
  // honest analogue of a turn completion.
  const lastTurnStartedAt = metadata.createdAt || activityAt || undefined
  const lastTurnCompletedAt = (observation.lastResultAt || 0)
    || (observation.lastEventAt || 0)
    || undefined
  return {
    key,
    actionAlias: metadata.sessionId,
    name: alias || originalName,
    displayName: alias || originalName,
    originalName,
    ...(alias ? { alias } : {}),
    bucket: state.bucket,
    activityState: state.activityState,
    archiveCapability: state.archiveCapability,
    revisionAt,
    completionRevision: terminal ? revision : undefined,
    // `read` is only claimed when a receipt actually said so; without an
    // authority the honest answer is `unknown`, same as codex.ts:1750.
    unreadState: state.bucket === 'completed-unread'
      ? 'unread'
      : state.bucket === 'completed' && state.readKnown ? 'read' : 'unknown',
    state: desktopLegacyPresentationState(state),
    activeFlags: state.activityState === 'waiting-approval' ? ['waitingOnApproval'] : undefined,
    updatedAt: activityAt,
    ...(lastTurnStartedAt ? { lastTurnStartedAt } : {}),
    ...(lastTurnCompletedAt ? { lastTurnCompletedAt } : {}),
    ...(lastTurnCompletedAt ? { lastQuestionAt: lastTurnStartedAt } : {}),
    createdAt: metadata.createdAt || undefined,
    firstPromptAt: metadata.createdAt || undefined,
    source: 'current',
    hasCurrentActivity: state.bucket === 'ongoing',
    canArchive: state.archiveCapability === 'allowed',
    projectKey: claudeDesktopProjectKey(metadata),
    projectName,
    originalProjectName: projectName,
    projectKind: 'project',
    isHidden: hidden,
    ...(locallyPinned ? { pinSource: 'local' as const } : {}),
    provider: 'claude'
  }
}

function desktopLegacyPresentationState(state: ClaudeDesktopResolvedState): CodexTaskCard['state'] {
  if (state.activityState === 'waiting-approval') return 'waiting-approval'
  if (state.bucket === 'stopped') return 'stopped'
  if (state.bucket === 'completed-unread') return 'pending-review'
  if (state.bucket === 'completed') return 'recent-activity'
  return 'running'
}

/**
 * Projects a whole desktop inventory.
 *
 * Sessions archived inside the desktop app are excluded entirely, mirroring how
 * Codex-archived work leaves the inventory: the user already filed them away in
 * the owning product, and resurfacing them as永远-read completed rows would only
 * add noise. (Provisional P1-2 decision; revisit at Phase 3 if a "已归档" view
 * is ever wanted.)
 */
export function projectClaudeDesktopTaskCards(
  observations: readonly ClaudeDesktopObservation[],
  options: ClaudeDesktopTaskProjectionOptions = {}
): CodexTaskCard[] {
  const cards: CodexTaskCard[] = []
  for (const observation of observations) {
    if (observation.metadata.isArchived) continue
    cards.push(projectClaudeDesktopTaskCard(observation, options))
  }
  return cards
}

/* ------------------------------------------------------------------ *
 * Cross-provider dedup
 * ------------------------------------------------------------------ */

/**
 * CLI session ids that are already represented by a desktop session. The
 * aggregate (P1-2) suppresses the CLI provider's duplicate card for these, so
 * one Cowork session never counts twice across providers. Verified: audit
 * lines and metadata agree on the id.
 */
export function claudeDesktopCliSessionIds(
  sessions: readonly ClaudeDesktopSessionMetadata[] | null | undefined
): ReadonlySet<string> {
  const ids = new Set<string>()
  for (const session of sessions || []) {
    // Only a session that actually renders a card may suppress its CLI twin.
    // Archived sessions are excluded from the projection, so counting them here
    // deleted the CLI card without putting anything in its place: archiving a
    // Cowork session inside the desktop app made a still-running Claude Code
    // session vanish from the lane entirely (P5 review).
    if (session.isArchived) continue
    if (session.cliSessionId) ids.add(session.cliSessionId)
  }
  return ids
}

/**
 * Combines the CLI provider's cards with desktop cards for the shared `claude`
 * lane: a CLI card whose session is wrapped by a desktop session is suppressed
 * (the desktop card carries richer identity and the openable surface).
 *
 * With no desktop sessions the CLI array is returned **by reference** — the
 * existing lane must stay byte-identical while the desktop source is absent or
 * disabled, the same zero-difference contract the CLI provider itself honors
 * toward Codex-only mode.
 */
export function combineClaudeLaneCards(
  cliCards: readonly CodexTaskCard[],
  desktopCards: readonly CodexTaskCard[],
  desktopSessions: readonly ClaudeDesktopSessionMetadata[] | null | undefined
): readonly CodexTaskCard[] {
  if (!desktopCards.length && !(desktopSessions || []).length) return cliCards
  const wrapped = claudeDesktopCliSessionIds(desktopSessions)
  const kept = wrapped.size
    ? cliCards.filter((card) => !wrapped.has(card.actionAlias || ''))
    : cliCards
  if (!desktopCards.length) return kept === cliCards ? cliCards : [...kept]
  return mergeLaneCardsByRecency(kept, desktopCards)
}

/**
 * Latest activity a card can be ordered by — identical to the aggregate layer's
 * own rule so both sort the same way.
 *
 * @see companionAggregate.ts `activityAt`
 */
function laneActivityAt(card: CodexTaskCard): number {
  return Math.max(card.lastTurnStartedAt || 0, card.lastTurnCompletedAt || 0, card.updatedAt || 0)
}

/**
 * Interleaves the two sorted runs of this lane by recency.
 *
 * A plain concatenation looked harmless because each run is individually
 * sorted, but `companionAggregate.mergeByRecency` is a two-way merge that
 * *requires* its additions to arrive in descending order. Handing it
 * `[...cli, ...desktop]` broke that precondition, so a brand-new desktop
 * session could land behind an old CLI one in the card list and in the
 * previous/next task cycle (P5 review). Cards with no timestamp sink to the end
 * of their own run, matching the aggregate's behaviour.
 */
function mergeLaneCardsByRecency(
  left: readonly CodexTaskCard[],
  right: readonly CodexTaskCard[]
): readonly CodexTaskCard[] {
  const merged: CodexTaskCard[] = []
  let a = 0
  let b = 0
  while (a < left.length && b < right.length) {
    // Strictly greater keeps the CLI card first on a tie, preserving the
    // pre-existing sequence whenever timestamps are equal or absent.
    if (laneActivityAt(right[b]) > laneActivityAt(left[a])) merged.push(right[b++])
    else merged.push(left[a++])
  }
  while (a < left.length) merged.push(left[a++])
  while (b < right.length) merged.push(right[b++])
  return merged
}

/* ------------------------------------------------------------------ *
 * App-owned unread set
 * ------------------------------------------------------------------ */

/**
 * The desktop app's own unread set — the sessions still showing a dot in its
 * sidebar. Read from the app's Local Storage by the bridge; `null` anywhere in
 * this pipeline means "could not tell", never "nothing is unread".
 */
export interface ClaudeDesktopUnreadObservation {
  /** Desktop session ids the app still considers unread. */
  ids: readonly string[]
  readAt: number
}

const DESKTOP_UNREAD_MAX_IDS = 500

export function normalizeClaudeDesktopUnread(raw: unknown): ClaudeDesktopUnreadObservation | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const source = raw as Record<string, unknown>
  if (!Array.isArray(source.ids)) return null
  const ids: string[] = []
  for (const value of source.ids) {
    if (typeof value !== 'string') continue
    const id = value.trim()
    if (!/^local_[0-9a-f][0-9a-f-]*$/i.test(id)) continue
    if (!ids.includes(id)) ids.push(id)
    if (ids.length >= DESKTOP_UNREAD_MAX_IDS) break
  }
  const readAt = toMs(source.readAt)
  return { ids, readAt: readAt > 0 ? readAt : 0 }
}


