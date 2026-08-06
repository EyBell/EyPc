import { describe, expect, it } from 'vitest'
import {
  CLAUDE_DESKTOP_EVENT_MAX_AGE_MS,
  CLAUDE_DESKTOP_IDLE_GRACE_MS,
  claudeDesktopCliSessionIds,
  claudeDesktopActivityAt,
  claudeDesktopCompletionRevision,
  claudeDesktopProjectKey,
  claudeDesktopProjectName,
  claudeDesktopSessionDisplayName,
  combineClaudeLaneCards,
  normalizeClaudeDesktopAuditLine,
  normalizeClaudeDesktopSession,
  normalizeClaudeDesktopUnread,
  projectClaudeDesktopTaskCard,
  projectClaudeDesktopTaskCards,
  resolveClaudeDesktopSessionState,
  type ClaudeDesktopObservation,
  type ClaudeDesktopSessionMetadata
} from '../../src/domain/claudeDesktop'
import type { CodexTaskCard } from '../../src/domain/codex'

const NOW = Date.UTC(2026, 7, 6, 4, 0, 0)

function metadata(patch: Partial<ClaudeDesktopSessionMetadata> = {}): ClaudeDesktopSessionMetadata {
  return {
    sessionId: 'local_aaaaaaaa-0000-0000-0000-000000000000',
    title: '示例任务',
    cwd: '/Users/someone/work/project',
    folders: ['/Users/someone/work/project'],
    createdAt: NOW - 3_600_000,
    lastActivityAt: NOW - 30_000,
    model: 'claude-fable-5',
    isArchived: false,
    scheduledTaskId: '',
    cliSessionId: 'c4f43c03-69a7-4fa5-a1ef-b500ea75ae9c',
    ...patch
  }
}

/**
 * Milliseconds between an audit line's own timestamp and the mtime of the write
 * that appended it.
 *
 * Every fixture below keeps these two clocks apart. The original suite set
 * `auditUpdatedAt === lastEventAt === lastResultAt === lastActivityAt` to a
 * single instant, a value that cannot occur on a real machine — and that one
 * choice hid the cross-clock completion bug *and* the watermark bug at once.
 */
const MTIME_SKEW_MS = 5

function observation(patch: Partial<ClaudeDesktopObservation> = {}): ClaudeDesktopObservation {
  return {
    metadata: metadata(),
    lastEvent: null,
    lastEventAt: 0,
    lastResultAt: 0,
    lastPermissionRequestAt: 0,
    lastPermissionResponseAt: 0,
    auditUpdatedAt: NOW - 30_000,
    auditBytes: 1024,
    auditTailUnparsed: false,
    ...patch
  }
}

/** A finished turn as it really lands: mtime stamped just after the line. */
function finishedTurn(agoMs: number, patch: Partial<ClaudeDesktopObservation> = {}): ClaudeDesktopObservation {
  const at = NOW - agoMs
  return observation({
    lastEvent: 'result',
    lastEventAt: at,
    lastResultAt: at,
    auditUpdatedAt: at + MTIME_SKEW_MS,
    metadata: metadata({ lastActivityAt: at + MTIME_SKEW_MS }),
    ...patch
  })
}

describe('desktop session metadata normalization', () => {
  it('keeps only the privacy-safe fields from a sampled-shape payload', () => {
    const result = normalizeClaudeDesktopSession({
      sessionId: 'local_x',
      cliSessionId: ' cli-1 ',
      cwd: '/w',
      userSelectedFolders: ['/w', 7, ''],
      createdAt: 1785981489064,
      lastActivityAt: 1785987300638,
      model: 'claude-fable-5',
      permissionMode: 'bypassPermissions',
      isArchived: false,
      title: 't',
      scheduledTaskId: '',
      systemPrompt: 'MUST NEVER SURVIVE',
      initialMessage: 'MUST NEVER SURVIVE',
      emailAddress: 'MUST NEVER SURVIVE'
    })
    expect(result).not.toBeNull()
    expect(result!.sessionId).toBe('local_x')
    expect(result!.cliSessionId).toBe('cli-1')
    expect(result!.folders).toEqual(['/w'])
    expect(result!.lastActivityAt).toBe(1785987300638)
    // Assert the exact key set, not a sentinel scan. Real metadata carries ~40
    // top-level keys; a `not.toContain` check only ever covers the handful the
    // fixture happens to poison, so it would wave through a future field like
    // `accountName` or `coworkSyspromptMap` (P5 review).
    expect(Object.keys(result!).sort()).toEqual([
      'cliSessionId', 'createdAt', 'cwd', 'folders', 'isArchived',
      'lastActivityAt', 'model', 'scheduledTaskId', 'sessionId', 'title'
    ])
    expect(JSON.stringify(result)).not.toContain('MUST NEVER SURVIVE')
  })

  it('tolerates ISO and epoch-second timestamps', () => {
    const iso = normalizeClaudeDesktopSession({ sessionId: 's', lastActivityAt: '2026-08-06T03:35:00.000Z' })
    expect(iso!.lastActivityAt).toBe(Date.UTC(2026, 7, 6, 3, 35, 0))
    const seconds = normalizeClaudeDesktopSession({ sessionId: 's', lastActivityAt: 1785998400 })
    expect(seconds!.lastActivityAt).toBe(1785998400000)
  })

  it('rejects only a missing session id, never other gaps', () => {
    expect(normalizeClaudeDesktopSession({ title: 'no id' })).toBeNull()
    expect(normalizeClaudeDesktopSession(null)).toBeNull()
    expect(normalizeClaudeDesktopSession([])).toBeNull()
    const minimal = normalizeClaudeDesktopSession({ sessionId: 's' })
    expect(minimal).toMatchObject({ sessionId: 's', title: '', folders: [], isArchived: false, cliSessionId: '' })
  })
})

describe('audit line normalization', () => {
  const at = '2026-08-06T03:31:35.514Z'
  const atMs = Date.parse(at)

  it('maps the sampled vocabulary to privacy-safe classes', () => {
    expect(normalizeClaudeDesktopAuditLine({ type: 'system', subtype: 'init', timestamp: at }))
      .toEqual({ event: 'init', at: atMs })
    expect(normalizeClaudeDesktopAuditLine({ type: 'system', subtype: 'status', status: 'requesting', timestamp: at }))
      .toEqual({ event: 'status', at: atMs })
    expect(normalizeClaudeDesktopAuditLine({ type: 'system', subtype: 'thinking_tokens', timestamp: at }))
      .toEqual({ event: 'activity', at: atMs })
    expect(normalizeClaudeDesktopAuditLine({ type: 'assistant', timestamp: at, message: 'SECRET' }))
      .toEqual({ event: 'activity', at: atMs })
    expect(normalizeClaudeDesktopAuditLine({ type: 'user', timestamp: at }))
      .toEqual({ event: 'activity', at: atMs })
    expect(normalizeClaudeDesktopAuditLine({ type: 'command_lifecycle', state: 'started', timestamp: at }))
      .toEqual({ event: 'command-started', at: atMs })
    expect(normalizeClaudeDesktopAuditLine({ type: 'command_lifecycle', state: 'queued', timestamp: at }))
      .toEqual({ event: 'command-started', at: atMs })
    expect(normalizeClaudeDesktopAuditLine({ type: 'command_lifecycle', state: 'completed', timestamp: at }))
      .toEqual({ event: 'command-completed', at: atMs })
    expect(normalizeClaudeDesktopAuditLine({ type: 'result', subtype: 'success', timestamp: at, result: 'SECRET' }))
      .toEqual({ event: 'result', at: atMs })
  })

  it('extracts permission decisions without tool payloads', () => {
    const request = normalizeClaudeDesktopAuditLine({
      type: 'system',
      subtype: 'permission_request',
      tool_name: 'Bash',
      tool_input: { command: 'SECRET' },
      timestamp: at
    })
    expect(request).toEqual({ event: 'permission-request', at: atMs })
    const response = normalizeClaudeDesktopAuditLine({
      type: 'system',
      subtype: 'permission_response',
      decision: 'approve',
      granted: true,
      timestamp: at
    })
    expect(response).toEqual({ event: 'permission-response', at: atMs, granted: true })
  })

  it('normalizes rate-limit events with epoch-second reset moments', () => {
    const line = normalizeClaudeDesktopAuditLine({
      type: 'rate_limit_event',
      timestamp: at,
      rate_limit_info: {
        status: 'allowed',
        resetsAt: 1785998400,
        rateLimitType: 'five_hour',
        overageStatus: 'rejected'
      }
    })
    expect(line).toEqual({
      event: 'rate-limit',
      at: atMs,
      rateLimit: { resetsAt: 1785998400000, limited: false, windowType: 'five_hour' }
    })
    const limited = normalizeClaudeDesktopAuditLine({
      type: 'rate_limit_event',
      timestamp: at,
      rate_limit_info: { status: 'rate_limited', rateLimitType: 'five_hour' }
    })
    expect(limited!.rateLimit).toEqual({ resetsAt: null, limited: true, windowType: 'five_hour' })
  })

  it('treats unknown well-formed types as plain activity and drops timestamp-less lines', () => {
    expect(normalizeClaudeDesktopAuditLine({ type: 'future_thing', timestamp: at }))
      .toEqual({ event: 'activity', at: atMs })
    expect(normalizeClaudeDesktopAuditLine({ type: 'result' })).toBeNull()
    expect(normalizeClaudeDesktopAuditLine({ timestamp: at })).toBeNull()
    expect(normalizeClaudeDesktopAuditLine('junk')).toBeNull()
  })
})

describe('desktop session state resolution', () => {
  it('keeps a fresh event-bearing session active', () => {
    const state = resolveClaudeDesktopSessionState(observation({
      lastEvent: 'status',
      lastEventAt: NOW - 5_000
    }), NOW)
    expect(state).toMatchObject({ bucket: 'ongoing', activityState: 'active', conservative: false })
  })

  it('surfaces an unanswered permission request as waiting-approval', () => {
    const state = resolveClaudeDesktopSessionState(observation({
      lastEvent: 'permission-request',
      lastEventAt: NOW - 5_000,
      lastPermissionRequestAt: NOW - 5_000,
      lastPermissionResponseAt: 0
    }), NOW)
    expect(state).toMatchObject({ bucket: 'ongoing', activityState: 'waiting-approval' })
  })

  it('releases waiting-approval once the response lands', () => {
    const state = resolveClaudeDesktopSessionState(observation({
      lastEvent: 'permission-response',
      lastEventAt: NOW - 4_000,
      lastPermissionRequestAt: NOW - 5_000,
      lastPermissionResponseAt: NOW - 4_000
    }), NOW)
    expect(state.activityState).toBe('active')
  })

  it('completes on a turn result with nothing newer', () => {
    // Regression: the mtime is *later* than the result's own timestamp, which
    // is how it always is on disk. Comparing the two across clocks made this
    // rule unreachable, so a finished turn kept reading "运行中" for the full
    // 30-minute event ceiling (P5 review).
    const base = finishedTurn(60_000)
    expect(base.auditUpdatedAt).toBeGreaterThan(base.lastResultAt!)
    expect(resolveClaudeDesktopSessionState(base, NOW).bucket).toBe('completed')
  })

  it('never claims unread without a read authority, mirroring the codex provider', () => {
    // codex.ts:1704 computes `unread = completionRevision > 0 && unreadKnown &&
    // hasUnreadTurn === true`, so a thread with no read authority resolves to
    // `completed` + `unreadState: 'unknown'` — it never asserts "you have not
    // read this" from a missing receipt. Nothing writes a receipt for desktop
    // sessions (AX activation cannot prove which session was seen), so treating
    // the absence as unread produced a badge that nothing in EyPc could clear:
    // hiding does not clear it either, because the compact counter includes
    // hidden completed-unread cards (codexPresentation.ts:159-160,
    // PRODUCT_REQUIREMENTS.md:122).
    const done = finishedTurn(60_000)
    const state = resolveClaudeDesktopSessionState(done, NOW)
    expect(state.bucket).toBe('completed')
    expect(state.readKnown).toBe(false)
    expect(projectClaudeDesktopTaskCard(done, { now: NOW }).unreadState).toBe('unknown')
  })

  it('still honours a receipt if a confirmation path ever writes one', () => {
    // The receipt branch is kept live so that wiring up a real confirmation
    // later needs no change here: an older receipt leaves newer work unread.
    const done = finishedTurn(60_000)
    const stale = { [done.metadata.sessionId]: NOW - 600_000 }
    expect(resolveClaudeDesktopSessionState(done, NOW, stale)).toMatchObject({
      bucket: 'completed-unread',
      readKnown: true
    })
    const current = { [done.metadata.sessionId]: NOW - 60_000 }
    expect(resolveClaudeDesktopSessionState(done, NOW, current)).toMatchObject({
      bucket: 'completed',
      readKnown: true
    })
    expect(projectClaudeDesktopTaskCard(done, { now: NOW, receipts: current }).unreadState).toBe('read')
  })

  it('keeps a result non-terminal while the audit tail had unparsed content', () => {
    // The bridge could not parse everything it saw, so "nothing newer" is not
    // proven. 铁律 8: uncertainty stays ongoing rather than inventing an end.
    const blind = finishedTurn(60_000, { auditTailUnparsed: true })
    expect(resolveClaudeDesktopSessionState(blind, NOW).bucket).toBe('ongoing')
    // Same observation with a readable tail does complete, which is what makes
    // the assertion above about the flag rather than about the fixture.
    expect(resolveClaudeDesktopSessionState(finishedTurn(60_000), NOW).bucket).toBe('completed')
  })

  it('stops claiming active work once silence outlives the grace window', () => {
    // Event still inside the 30-minute ceiling, but 20 minutes of total
    // silence. Previously this returned `active`, contradicting the module's
    // own three-minute grace rule (P5 review).
    const quiet = NOW - 20 * 60_000
    const state = resolveClaudeDesktopSessionState(observation({
      lastEvent: 'activity',
      lastEventAt: quiet,
      auditUpdatedAt: quiet + MTIME_SKEW_MS,
      metadata: metadata({ lastActivityAt: quiet + MTIME_SKEW_MS })
    }), NOW)
    expect(state).toMatchObject({ bucket: 'ongoing', activityState: 'ongoing', conservative: true })
    expect(state.activityState).not.toBe('active')
  })

  it('does not let a rename re-flag a session the user already read', () => {
    // The desktop app rewrites the metadata file (and therefore its mtime and
    // heartbeat) on rename and archive. Folding those into the read watermark
    // meant renaming a finished session made it unread again (P5 review).
    const done = finishedTurn(60_000)
    const receipts = { [done.metadata.sessionId]: NOW - 60_000 }
    expect(resolveClaudeDesktopSessionState(done, NOW, receipts).bucket).toBe('completed')
    const renamed: ClaudeDesktopObservation = {
      ...done,
      auditUpdatedAt: NOW - 1_000,
      metadata: metadata({ ...done.metadata, title: '改了个名', lastActivityAt: NOW - 1_000 })
    }
    expect(claudeDesktopCompletionRevision(renamed)).toBe(NOW - 60_000)
    // Still read; the heartbeat only makes it look recently active, and that is
    // an ordering signal, not evidence of new work to review.
    expect(resolveClaudeDesktopSessionState(renamed, NOW, receipts).bucket).not.toBe('completed-unread')
  })

  it('separates the ordering signal from the read watermark', () => {
    const heartbeatOnly = observation({
      lastEvent: null,
      lastEventAt: 0,
      lastResultAt: 0,
      auditUpdatedAt: NOW - 10_000,
      metadata: metadata({ lastActivityAt: NOW - 5_000 })
    })
    // No content evidence at all: the watermark falls back so the card stays
    // hideable and acknowledgeable rather than being pinned at 0.
    expect(claudeDesktopActivityAt(heartbeatOnly)).toBe(NOW - 5_000)
    expect(claudeDesktopCompletionRevision(heartbeatOnly)).toBe(NOW - 5_000)
    const withContent = finishedTurn(60_000)
    expect(claudeDesktopActivityAt(withContent)).toBe(NOW - 60_000 + MTIME_SKEW_MS)
    expect(claudeDesktopCompletionRevision(withContent)).toBe(NOW - 60_000)
  })

  it('does not let a stale result outlive the event ceiling as authority', () => {
    // Result older than the ceiling, but the heartbeat says the session moved
    // on recently: the pulse fallback decides, not the ancient event.
    const state = resolveClaudeDesktopSessionState(observation({
      lastEvent: 'result',
      lastEventAt: NOW - CLAUDE_DESKTOP_EVENT_MAX_AGE_MS - 60_000,
      lastResultAt: NOW - CLAUDE_DESKTOP_EVENT_MAX_AGE_MS - 60_000,
      auditUpdatedAt: 0,
      metadata: metadata({ lastActivityAt: NOW - 30_000 })
    }), NOW)
    expect(state.bucket).toBe('ongoing')
    expect(state.conservative).toBe(true)
  })

  it('falls back to growth pulses without parsed events', () => {
    const exact = resolveClaudeDesktopSessionState(observation({ auditUpdatedAt: NOW - 10_000 }), NOW)
    expect(exact).toMatchObject({ bucket: 'ongoing', activityState: 'active', conservative: false })
    const heartbeatOnly = resolveClaudeDesktopSessionState(observation({
      auditUpdatedAt: 0,
      metadata: metadata({ lastActivityAt: NOW - 60_000 })
    }), NOW)
    expect(heartbeatOnly).toMatchObject({ bucket: 'ongoing', activityState: 'ongoing', conservative: true })
  })

  it('never manufactures a terminal state out of silence, mirroring the codex provider', () => {
    // codex.ts:1686 requires an explicit `lastTurnStatus === 'completed'` for
    // `completionRevision`, and codex.ts:1713 falls through to `ongoing` when
    // there is none — elapsed time is never evidence. This lane used to return
    // `completedState` past the grace window, inventing a completion out of a
    // three-minute gap, which PRODUCT_REQUIREMENTS.md:137 forbids outright:
    // "elapsed time and recency never create completion or stop".
    for (const idleMs of [
      CLAUDE_DESKTOP_IDLE_GRACE_MS + 1_000,
      CLAUDE_DESKTOP_EVENT_MAX_AGE_MS + 60_000,
      7 * 24 * 60 * 60 * 1000
    ]) {
      const state = resolveClaudeDesktopSessionState(observation({
        auditUpdatedAt: NOW - idleMs,
        metadata: metadata({ lastActivityAt: NOW - idleMs })
      }), NOW)
      expect(state).toMatchObject({ bucket: 'ongoing', conservative: true })
      expect(state.archiveCapability).not.toBe('allowed')
    }
  })

  it('never reports stopped, because app liveness is not observable here', () => {
    // The old `appRunning` gate looked like a guard but no producer ever set
    // it — the bridge reads files, and a file surface cannot prove a process is
    // alive. Rather than keep a branch that could never run, the field is gone
    // and the honest answer is the conservative one. If a real liveness signal
    // is ever wired up, this test is the thing that should fail.
    const silent = resolveClaudeDesktopSessionState(observation({
      auditUpdatedAt: NOW - 10_000,
      metadata: metadata({ lastActivityAt: NOW - 10_000 })
    }), NOW)
    expect(silent.bucket).not.toBe('stopped')
    expect(silent.bucket).toBe('ongoing')
  })

  it('projects archived sessions as completed and read, unconditionally', () => {
    const state = resolveClaudeDesktopSessionState(observation({
      metadata: metadata({ isArchived: true, lastActivityAt: NOW - 1_000 }),
      lastEvent: 'status',
      lastEventAt: NOW - 1_000
    }), NOW)
    expect(state).toMatchObject({ bucket: 'completed', archiveCapability: 'allowed' })
  })
})

describe('cross-provider dedup', () => {
  it('collects non-empty cli session ids', () => {
    const ids = claudeDesktopCliSessionIds([
      metadata({ cliSessionId: 'a' }),
      metadata({ sessionId: 's2', cliSessionId: '' }),
      metadata({ sessionId: 's3', cliSessionId: 'a' }),
      metadata({ sessionId: 's4', cliSessionId: 'b' })
    ])
    expect([...ids].sort()).toEqual(['a', 'b'])
    expect(claudeDesktopCliSessionIds(null).size).toBe(0)
  })
})

describe('project identity and display name', () => {
  it('prefers the first connected folder over the internal cwd', () => {
    const meta = metadata({ folders: ['/Users/x/work/EyPc'], cwd: '/internal/outputs' })
    expect(claudeDesktopProjectName(meta)).toBe('EyPc')
    expect(claudeDesktopProjectKey(meta)).toBe('claude:project:/Users/x/work/EyPc')
  })

  it('falls back to cwd, then a stable placeholder', () => {
    expect(claudeDesktopProjectName(metadata({ folders: [], cwd: '/a/b' }))).toBe('b')
    expect(claudeDesktopProjectName(metadata({ folders: [], cwd: '' }))).toBe('Claude')
    expect(claudeDesktopProjectKey(metadata({ folders: [], cwd: '' }))).toBe('claude:project:claude-desktop')
  })

  it('uses the app-owned title, falling back to project plus id', () => {
    expect(claudeDesktopSessionDisplayName(metadata({ title: ' 原型缺口推进计划 ' }))).toBe('原型缺口推进计划')
    const untitled = metadata({ title: '', sessionId: 'local_abcdef12-3456', folders: ['/w/EyPc'] })
    expect(claudeDesktopSessionDisplayName(untitled)).toBe('EyPc abcdef12')
  })
})

describe('desktop task card projection', () => {
  it('projects the shared claude-lane card contract', () => {
    const card = projectClaudeDesktopTaskCard(observation({
      lastEvent: 'status',
      lastEventAt: NOW - 5_000
    }), { now: NOW })
    expect(card.key).toBe('claude:local_aaaaaaaa-0000-0000-0000-000000000000')
    expect(card.provider).toBe('claude')
    expect(card.actionAlias).toBe('local_aaaaaaaa-0000-0000-0000-000000000000')
    expect(card.bucket).toBe('ongoing')
    expect(card.state).toBe('running')
    expect(card.hasCurrentActivity).toBe(true)
    expect(card.canArchive).toBe(false)
    expect(card.projectName).toBe('project')
    expect(card.unreadState).toBe('unknown')
  })

  it('marks waiting-approval with the shared active flag', () => {
    const card = projectClaudeDesktopTaskCard(observation({
      lastEvent: 'permission-request',
      lastEventAt: NOW - 5_000,
      lastPermissionRequestAt: NOW - 5_000
    }), { now: NOW })
    expect(card.state).toBe('waiting-approval')
    expect(card.activeFlags).toEqual(['waitingOnApproval'])
  })

  it('carries completion revision and honors aliases', () => {
    const done = finishedTurn(60_000)
    const card = projectClaudeDesktopTaskCard(done, { now: NOW })
    expect(card.bucket).toBe('completed')
    // Literal, not the function's own output fed back to itself.
    expect(card.completionRevision).toBe(NOW - 60_000)
    // Ordering uses the later mtime; the watermark does not.
    expect(card.updatedAt).toBe(NOW - 60_000 + MTIME_SKEW_MS)
    const aliased = projectClaudeDesktopTaskCard(done, {
      now: NOW,
      aliases: { [card.key]: '我的别名' }
    })
    expect(aliased.displayName).toBe('我的别名')
    expect(aliased.originalName).toBe('示例任务')
  })

  it('uses one revision currency so a stored hide watermark keeps matching', () => {
    // `hide()` stores `task.revisionAt` (codexController.ts) and the lane
    // reconciles against it. Codex keeps those the same number by deriving
    // `revisionAt` from `completionRevision` first (codex.ts:1722). When this
    // lane derived the two from different expressions they drifted apart by the
    // mtime skew, and 「隐」 became a silent no-op that still reported success.
    const done = finishedTurn(60_000)
    const card = projectClaudeDesktopTaskCard(done, { now: NOW })
    expect(card.revisionAt).toBe(card.completionRevision)
    // A live session has no completion revision, so it falls back to activity —
    // still one expression, still non-zero, so it stays hideable.
    const live = projectClaudeDesktopTaskCard(observation({
      lastEvent: 'status',
      lastEventAt: NOW - 5_000
    }), { now: NOW })
    expect(live.completionRevision).toBeUndefined()
    expect(live.revisionAt).toBeGreaterThan(0)
  })

  it('exposes turn equivalents so downstream recency filters can see it', () => {
    // `codexPresentation.taskActivityAt` reads only
    // `max(lastTurnStartedAt, lastTurnCompletedAt)` and deliberately ignores
    // `updatedAt` (soul:87 lists "using updatedAt as activity" as avoided).
    // With neither set, every desktop card scored 0 and was filtered out of the
    // 动态 tab, the ongoing badge and the previous/next cycle.
    const card = projectClaudeDesktopTaskCard(finishedTurn(60_000), { now: NOW })
    expect(card.lastTurnStartedAt).toBe(NOW - 3_600_000)
    expect(card.lastTurnCompletedAt).toBe(NOW - 60_000)
    expect(Math.max(card.lastTurnStartedAt || 0, card.lastTurnCompletedAt || 0)).toBeGreaterThan(0)
  })

  it('excludes app-archived sessions from the inventory projection', () => {
    const cards = projectClaudeDesktopTaskCards([
      observation(),
      observation({ metadata: metadata({ sessionId: 'local_archived', isArchived: true }) })
    ], { now: NOW })
    expect(cards).toHaveLength(1)
    expect(cards[0].key).toContain('local_aaaaaaaa')
  })
})

describe('claude lane combination', () => {
  const cliCard = (sessionId: string): CodexTaskCard => ({
    key: `claude:${sessionId}`,
    actionAlias: sessionId,
    name: sessionId,
    displayName: sessionId,
    originalName: sessionId,
    bucket: 'ongoing',
    activityState: 'active',
    archiveCapability: 'blocked-active',
    revisionAt: NOW,
    unreadState: 'unknown',
    state: 'running',
    updatedAt: NOW,
    source: 'current',
    hasCurrentActivity: true,
    canArchive: false,
    projectKey: 'claude:project:/w',
    projectName: 'w',
    originalProjectName: 'w',
    projectKind: 'project',
    isHidden: false,
    provider: 'claude'
  } as CodexTaskCard)

  it('returns the cli array by reference while the desktop source is empty', () => {
    const cli = [cliCard('c1'), cliCard('c2')]
    expect(combineClaudeLaneCards(cli, [], [])).toBe(cli)
    expect(combineClaudeLaneCards(cli, [], null)).toBe(cli)
  })

  it('suppresses cli cards wrapped by a desktop session and appends desktop cards', () => {
    const cli = [cliCard('c4f43c03-69a7-4fa5-a1ef-b500ea75ae9c'), cliCard('other')]
    const desktop = projectClaudeDesktopTaskCards([observation()], { now: NOW })
    const combined = combineClaudeLaneCards(cli, desktop, [metadata()])
    expect(combined.map((card) => card.actionAlias)).toEqual([
      'other',
      'local_aaaaaaaa-0000-0000-0000-000000000000'
    ])
  })

  it('keeps unwrapped cli cards when desktop sessions carry no cli id', () => {
    const cli = [cliCard('c1')]
    const sessions = [metadata({ cliSessionId: '' })]
    const desktop = projectClaudeDesktopTaskCards([observation({ metadata: sessions[0] })], { now: NOW })
    const combined = combineClaudeLaneCards(cli, desktop, sessions)
    expect(combined).toHaveLength(2)
    expect(combined[0].actionAlias).toBe('c1')
  })

  it('never lets an archived desktop session delete the cli card it wrapped', () => {
    // Archiving a Cowork session inside the desktop app used to make the
    // running Claude Code session it wrapped disappear from the lane entirely:
    // the archived session was excluded from the projection but still counted
    // in the dedup set, so it suppressed a card and produced none (P5 review).
    const cli = [cliCard('c4f43c03-69a7-4fa5-a1ef-b500ea75ae9c'), cliCard('other')]
    const archived = metadata({ isArchived: true })
    const desktop = projectClaudeDesktopTaskCards([observation({ metadata: archived })], { now: NOW })
    expect(desktop).toHaveLength(0)
    const combined = combineClaudeLaneCards(cli, desktop, [archived])
    expect(combined.map((card) => card.actionAlias)).toEqual([
      'c4f43c03-69a7-4fa5-a1ef-b500ea75ae9c',
      'other'
    ])
  })

  it('interleaves desktop cards by recency instead of appending them', () => {
    // `companionAggregate.mergeByRecency` is a two-way merge and requires its
    // additions to be sorted. Concatenating two individually-sorted runs broke
    // that precondition, so a brand-new desktop session could sort behind an
    // old CLI one in both the card list and the previous/next cycle.
    const older = cliCard('old')
    ;(older as { updatedAt: number; revisionAt: number }).updatedAt = NOW - 3_600_000
    ;(older as { updatedAt: number; revisionAt: number }).revisionAt = NOW - 3_600_000
    const newest = NOW - 1_000
    const desktopSession = metadata({ sessionId: 'local_fresh', cliSessionId: '', lastActivityAt: newest })
    const desktop = projectClaudeDesktopTaskCards([observation({
      metadata: desktopSession,
      auditUpdatedAt: newest
    })], { now: NOW })
    const combined = combineClaudeLaneCards([older], desktop, [desktopSession])
    expect(combined.map((card) => card.actionAlias)).toEqual(['local_fresh', 'old'])
    // The aggregate's two-way merge orders by this exact expression, so the
    // combined run has to be descending in it or the merge silently misplaces
    // cards downstream.
    const activity = combined.map((card) => Math.max(
      card.lastTurnStartedAt || 0,
      card.lastTurnCompletedAt || 0,
      card.updatedAt || 0
    ))
    expect(activity).toEqual([...activity].sort((a, b) => b - a))
  })
})


describe('app-owned unread set', () => {
  it('keeps only desktop session ids and reports the reading time', () => {
    const observation = normalizeClaudeDesktopUnread({
      ids: ['local_a1', 'local_a1', 'cse_remote', '../../etc/passwd', 42, ''],
      readAt: 1_785_900_000_000
    })
    expect(observation).toEqual({ ids: ['local_a1'], readAt: 1_785_900_000_000 })
  })

  it('rejects a shape that carries no id list at all', () => {
    expect(normalizeClaudeDesktopUnread(null)).toBeNull()
    expect(normalizeClaudeDesktopUnread({})).toBeNull()
    expect(normalizeClaudeDesktopUnread({ ids: 'local_a1' })).toBeNull()
  })

  /**
   * The badge is a mirror of the app's own dot: listed means unread, absent
   * means the user opened it there.
   */
  it('mirrors the app unread set onto a finished session', () => {
    const finished = finishedTurn(60_000)
    const id = finished.metadata.sessionId
    expect(resolveClaudeDesktopSessionState(finished, NOW, {}, [id]).bucket).toBe('completed-unread')
    expect(resolveClaudeDesktopSessionState(finished, NOW, {}, []).bucket).toBe('completed')
  })

  it('carries the mirror through the card projection', () => {
    const finished = finishedTurn(60_000)
    const id = finished.metadata.sessionId
    const unread = projectClaudeDesktopTaskCard(finished, { now: NOW, appUnread: [id] })
    expect(unread.bucket).toBe('completed-unread')
    expect(unread.unreadState).toBe('unread')
    const read = projectClaudeDesktopTaskCard(finished, { now: NOW, appUnread: [] })
    expect(read.bucket).toBe('completed')
    expect(read.unreadState).toBe('read')
  })

  /**
   * No observation means no authority. Asserting "unread" from a reading that
   * never happened is exactly the badge nothing could clear — which is why this
   * lane shipped without one in the first place.
   */
  it('produces no badge at all when the set has never been observed', () => {
    const card = projectClaudeDesktopTaskCard(finishedTurn(60_000), { now: NOW })
    expect(card.bucket).toBe('completed')
    expect(card.unreadState).toBe('unknown')
  })
})
