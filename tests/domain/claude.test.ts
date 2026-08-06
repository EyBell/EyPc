import { describe, expect, it } from 'vitest'
import {
  CLAUDE_HOOK_EVIDENCE_MAX_AGE_MS,
  CLAUDE_IDLE_GRACE_MS,
  CLAUDE_MAX_RECEIPTS,
  CLAUDE_SHORT_WINDOW_MINUTES,
  CLAUDE_WEEKLY_WINDOW_MINUTES,
  claudeCompletionRevision,
  claudePrimaryQuotaWindow,
  claudeProjectNameFromSlug,
  canOpenClaudeTask,
  claudeReadinessReason,
  claudeSessionDisplayName,
  emptyClaudeEnvironment,
  emptyClaudeQuota,
  isClaudeAvailable,
  mergeClaudePlanUsage,
  normalizeClaudeHookEvent,
  claudeResetAtToMs,
  normalizeClaudeQuota,
  normalizeClaudeReceipts,
  projectClaudeTaskCard,
  projectClaudeTaskCards,
  resolveClaudeSessionState,
  staleClaudeQuota,
  type ClaudeSessionObservation
} from '../../src/domain/claude'

const NOW = 1_785_900_000_000

function observation(patch: Partial<ClaudeSessionObservation> = {}): ClaudeSessionObservation {
  return {
    sessionId: 'sess-1',
    projectSlug: '-Users-me-work-app',
    cwd: '/Users/me/work/app',
    startedAt: NOW - 600_000,
    updatedAt: NOW - 1_000,
    lastPromptAt: NOW - 5_000,
    lastAssistantAt: NOW - 1_000,
    ...patch
  }
}

describe('hook event normalization', () => {
  it('maps the official hook event names onto privacy-safe classes', () => {
    expect(normalizeClaudeHookEvent('PermissionRequest')).toBe('permission-request')
    expect(normalizeClaudeHookEvent('Notification')).toBe('notification')
    expect(normalizeClaudeHookEvent('Stop')).toBe('stop')
    expect(normalizeClaudeHookEvent('PreToolUse')).toBe('pre-tool')
    expect(normalizeClaudeHookEvent('PostToolUseFailure')).toBe('post-tool')
    expect(normalizeClaudeHookEvent('SessionEnd')).toBe('session-end')
  })

  it('accepts an already-normalized class and rejects anything unknown', () => {
    expect(normalizeClaudeHookEvent('pre-tool')).toBe('pre-tool')
    expect(normalizeClaudeHookEvent('MadeUpEvent')).toBeNull()
    expect(normalizeClaudeHookEvent(undefined)).toBeNull()
    expect(normalizeClaudeHookEvent(42)).toBeNull()
  })
})

describe('session state resolution', () => {
  it('treats a permission request as waiting for approval', () => {
    const state = resolveClaudeSessionState(observation({ hookEvent: 'permission-request' }), NOW)
    expect(state).toMatchObject({ bucket: 'ongoing', activityState: 'waiting-approval', archiveCapability: 'blocked-active' })
  })

  it('treats a notification as waiting for input', () => {
    expect(resolveClaudeSessionState(observation({ hookEvent: 'notification' }), NOW).activityState).toBe('waiting-input')
  })

  it('treats tool and prompt hooks as active', () => {
    for (const event of ['prompt-submit', 'pre-tool', 'post-tool', 'session-start'] as const) {
      expect(resolveClaudeSessionState(observation({ hookEvent: event }), NOW).activityState).toBe('active')
    }
  })

  it('turns a Stop hook into completed-unread until a receipt covers it', () => {
    const source = observation({ hookEvent: 'stop', lastStopAt: NOW - 500 })
    expect(resolveClaudeSessionState(source, NOW).bucket).toBe('completed-unread')
    const watermark = claudeCompletionRevision(source)
    expect(resolveClaudeSessionState(source, NOW, { 'sess-1': watermark }).bucket).toBe('completed')
    expect(resolveClaudeSessionState(source, NOW, { 'sess-1': watermark - 1 }).bucket).toBe('completed-unread')
  })

  it('maps session end and stop failure onto the stopped bucket', () => {
    expect(resolveClaudeSessionState(observation({ hookEvent: 'session-end' }), NOW))
      .toMatchObject({ bucket: 'stopped', archiveCapability: 'blocked-stopped' })
    expect(resolveClaudeSessionState(observation({ hookEvent: 'stop-failure' }), NOW).bucket).toBe('stopped')
  })

  it('stops a session whose process is gone even without a session-end hook', () => {
    expect(resolveClaudeSessionState(observation({ hookEvent: 'pre-tool', processAlive: false }), NOW).bucket).toBe('stopped')
  })

  it('lets an exact Stop hook win over a dead process', () => {
    expect(resolveClaudeSessionState(observation({ hookEvent: 'stop', processAlive: false }), NOW).bucket).toBe('completed-unread')
  })
})

describe('terminal-state precedence', () => {
  it('keeps a completed conversation completed when the CLI is exited afterwards', () => {
    // Stop then SessionEnd is the ordinary shutdown sequence. Letting SessionEnd
    // win would erase the completed-unread badge every time the user quits.
    const finished = observation({ hookEvent: 'session-end', lastStopAt: NOW - 500, lastPromptAt: NOW - 5_000 })
    expect(resolveClaudeSessionState(finished, NOW).bucket).toBe('completed-unread')
  })

  it('still stops a session that ended without ever completing a turn', () => {
    const abandoned = observation({ hookEvent: 'session-end', lastStopAt: 0, lastPromptAt: NOW - 5_000 })
    expect(resolveClaudeSessionState(abandoned, NOW).bucket).toBe('stopped')
  })

  it('stops a session whose last turn predates its newest prompt', () => {
    const interrupted = observation({ hookEvent: 'session-end', lastStopAt: NOW - 60_000, lastPromptAt: NOW - 5_000 })
    expect(resolveClaudeSessionState(interrupted, NOW).bucket).toBe('stopped')
  })
})

describe('hook evidence expiry', () => {
  it('stops trusting a waiting hook once it has gone stale', () => {
    // A Notification fired just before the terminal was killed produces no Stop
    // and no SessionEnd; without expiry the task waits for input forever.
    const abandoned = observation({
      hookEvent: 'notification',
      hookEventAt: NOW - CLAUDE_HOOK_EVIDENCE_MAX_AGE_MS - 1_000,
      updatedAt: NOW - CLAUDE_HOOK_EVIDENCE_MAX_AGE_MS - 1_000,
      lastPromptAt: NOW - 3_600_000,
      lastAssistantAt: NOW - 3_500_000
    })
    expect(resolveClaudeSessionState(abandoned, NOW).activityState).not.toBe('waiting-input')
  })

  it('keeps trusting a recent waiting hook', () => {
    const waiting = observation({ hookEvent: 'notification', hookEventAt: NOW - 60_000 })
    expect(resolveClaudeSessionState(waiting, NOW).activityState).toBe('waiting-input')
  })

  it('treats a hook with no timestamp as current rather than stale', () => {
    const noTimestamp = observation({ hookEvent: 'notification', hookEventAt: 0 })
    expect(resolveClaudeSessionState(noTimestamp, NOW).activityState).toBe('waiting-input')
  })

  it('still honours a dead process once the hook has expired', () => {
    const gone = observation({
      hookEvent: 'pre-tool',
      hookEventAt: NOW - CLAUDE_HOOK_EVIDENCE_MAX_AGE_MS - 1_000,
      processAlive: false
    })
    expect(resolveClaudeSessionState(gone, NOW).bucket).toBe('stopped')
  })
})

describe('persisted read receipts', () => {
  it('keeps only positive numeric entries and bounds the map', () => {
    expect(normalizeClaudeReceipts({ a: 5, b: '7', c: 0, d: -1, e: 'x', f: null })).toEqual({ a: 5, b: 7 })
    expect(normalizeClaudeReceipts(null)).toEqual({})
    expect(normalizeClaudeReceipts([1, 2])).toEqual({})
    const many = Object.fromEntries(Array.from({ length: CLAUDE_MAX_RECEIPTS + 50 }, (_, index) => [`s${index}`, index + 1]))
    expect(Object.keys(normalizeClaudeReceipts(many))).toHaveLength(CLAUDE_MAX_RECEIPTS)
  })

  it('drops the oldest entries first when bounding', () => {
    const many = Object.fromEntries(Array.from({ length: CLAUDE_MAX_RECEIPTS + 1 }, (_, index) => [`s${index}`, index + 1]))
    const bounded = normalizeClaudeReceipts(many)
    expect(bounded.s0).toBeUndefined()
    expect(bounded[`s${CLAUDE_MAX_RECEIPTS}`]).toBe(CLAUDE_MAX_RECEIPTS + 1)
  })
})

describe('cold-start transcript fallback', () => {
  it('treats freshly touched transcripts as active', () => {
    const state = resolveClaudeSessionState(observation({ updatedAt: NOW - 1_000 }), NOW)
    expect(state).toMatchObject({ bucket: 'ongoing', activityState: 'active' })
  })

  it('completes an idle session whose last transcript entry is an assistant reply', () => {
    const idle = observation({
      updatedAt: NOW - CLAUDE_IDLE_GRACE_MS - 1_000,
      lastPromptAt: NOW - 120_000,
      lastAssistantAt: NOW - 90_000
    })
    expect(resolveClaudeSessionState(idle, NOW).bucket).toBe('completed-unread')
  })

  it('stays conservatively ongoing when the newest entry is an unanswered prompt', () => {
    const unresolved = observation({
      updatedAt: NOW - CLAUDE_IDLE_GRACE_MS - 1_000,
      lastPromptAt: NOW - 60_000,
      lastAssistantAt: NOW - 120_000
    })
    const state = resolveClaudeSessionState(unresolved, NOW)
    expect(state).toMatchObject({ bucket: 'ongoing', activityState: 'ongoing', conservative: true })
  })

  it('stays conservatively ongoing while tool calls are unanswered', () => {
    const pending = observation({
      updatedAt: NOW - CLAUDE_IDLE_GRACE_MS - 1_000,
      lastPromptAt: NOW - 120_000,
      lastAssistantAt: NOW - 90_000,
      pendingToolUse: 2
    })
    expect(resolveClaudeSessionState(pending, NOW)).toMatchObject({ bucket: 'ongoing', conservative: true })
  })
})

describe('task card projection', () => {
  it('namespaces the key, tags the provider and keeps the raw session id as the action alias', () => {
    const card = projectClaudeTaskCard(observation({ hookEvent: 'pre-tool' }), { now: NOW })
    expect(card.key).toBe('claude:sess-1')
    expect(card.provider).toBe('claude')
    expect(card.actionAlias).toBe('sess-1')
    expect(card.projectName).toBe('app')
    expect(card.projectKey).toBe('claude:project:/Users/me/work/app')
  })

  it('never derives a display name from conversation content', () => {
    const card = projectClaudeTaskCard(observation({ sessionId: 'abcdef123456' }), { now: NOW })
    expect(card.originalName).toBe('app abcdef12')
    expect(card.originalName).not.toContain('/')
  })

  it('applies EyPc-local alias, hide and pin metadata', () => {
    const card = projectClaudeTaskCard(observation(), {
      now: NOW,
      aliases: { 'claude:sess-1': '重构分支' },
      hiddenKeys: ['claude:sess-1'],
      localPinnedKeys: ['claude:sess-1']
    })
    expect(card.name).toBe('重构分支')
    expect(card.alias).toBe('重构分支')
    expect(card.isHidden).toBe(true)
    expect(card.pinSource).toBe('local')
  })

  it('exposes waiting flags the shared badge logic already understands', () => {
    expect(projectClaudeTaskCard(observation({ hookEvent: 'permission-request' }), { now: NOW }).activeFlags)
      .toEqual(['waitingOnApproval'])
    expect(projectClaudeTaskCard(observation({ hookEvent: 'notification' }), { now: NOW }).activeFlags)
      .toEqual(['waitingOnUserInput'])
    expect(projectClaudeTaskCard(observation({ hookEvent: 'pre-tool' }), { now: NOW }).activeFlags).toBeUndefined()
  })

  it('falls back to the slug tail when the transcript carried no cwd', () => {
    const card = projectClaudeTaskCard(observation({ cwd: '' }), { now: NOW })
    expect(card.projectName).toBe('app')
    expect(claudeProjectNameFromSlug('-Users-me-work-app')).toBe('app')
    expect(claudeProjectNameFromSlug('')).toBe('Claude')
  })

  it('labels a side chat distinctly', () => {
    expect(claudeSessionDisplayName(observation({ isSidechain: true, sessionId: 'child123456' })))
      .toBe('app · 子会话 child123')
  })
})

describe('side chat folding', () => {
  it('folds a child into its parent instead of listing it separately', () => {
    const cards = projectClaudeTaskCards([
      observation({ sessionId: 'parent', hookEvent: 'stop', lastStopAt: NOW - 500 }),
      observation({ sessionId: 'child', isSidechain: true, parentSessionId: 'parent', hookEvent: 'pre-tool' })
    ], { now: NOW })
    expect(cards).toHaveLength(1)
    expect(cards[0].actionAlias).toBe('parent')
  })

  it('keeps a parent ongoing while one of its side chats is still running', () => {
    const [card] = projectClaudeTaskCards([
      observation({ sessionId: 'parent', hookEvent: 'stop', lastStopAt: NOW - 500 }),
      observation({ sessionId: 'child', isSidechain: true, parentSessionId: 'parent', hookEvent: 'pre-tool' })
    ], { now: NOW })
    expect(card).toMatchObject({ bucket: 'ongoing', activityState: 'active', canArchive: false })
  })

  it('lets a finished parent complete once its side chats are finished too', () => {
    const [card] = projectClaudeTaskCards([
      observation({ sessionId: 'parent', hookEvent: 'stop', lastStopAt: NOW - 500 }),
      observation({ sessionId: 'child', isSidechain: true, parentSessionId: 'parent', hookEvent: 'stop', lastStopAt: NOW - 600 })
    ], { now: NOW })
    expect(card.bucket).toBe('completed-unread')
  })

  it('keeps an orphan side chat visible rather than dropping it', () => {
    const cards = projectClaudeTaskCards([
      observation({ sessionId: 'child', isSidechain: true, parentSessionId: 'missing-parent', hookEvent: 'pre-tool' })
    ], { now: NOW })
    expect(cards).toHaveLength(1)
    expect(cards[0].actionAlias).toBe('child')
  })
})

describe('quota windows beyond the original two', () => {
  /**
   * A Max plan shows `5-hour limit`, `Weekly · all models` and a per-model
   * weekly at once. The status-line cache already carried the third window's
   * bytes; only the projection was hardcoded to two keys, so the account's most
   * constrained limit was the one the user could not see.
   */
  it('keeps every declared window and derives its label from the payload key', () => {
    const quota = normalizeClaudeQuota({
      seven_day_fable: { used_percentage: 44, resets_at: 1_738_857_600 },
      five_hour: { used_percentage: 35, resets_at: 1_738_425_600 },
      seven_day: { used_percentage: 29, resets_at: 1_738_857_600 }
    }, { updatedAt: NOW })
    expect(quota.windows.map((entry) => entry.key)).toEqual(['five_hour', 'seven_day', 'seven_day_fable'])
    expect(quota.windows.map((entry) => entry.label)).toEqual(['5 小时限额', '周限额', '周限额 · Fable'])
    expect(quota.windows.map((entry) => entry.shortLabel)).toEqual(['5h', '周', '周·Fable'])
    expect(quota.windows[2]).toMatchObject({ kind: 'weekly', scope: 'Fable', remainingPercent: 56 })
  })

  it('never lets a per-model window impersonate the plain one', () => {
    const quota = normalizeClaudeQuota({
      seven_day_opus: { used_percentage: 90 },
      seven_day: { used_percentage: 10 }
    }, { updatedAt: NOW })
    // `weekly` feeds the water-ball centre and the legacy consumers; it must
    // stay the all-models window even though the scoped one is tighter.
    expect(quota.weekly?.remainingPercent).toBe(90)
    expect(quota.windows.map((entry) => entry.scope)).toEqual(['', 'Opus'])
  })

  it('carries an unrecognized key instead of dropping it', () => {
    const quota = normalizeClaudeQuota({ monthly_extra: { used_percentage: 20 } }, { updatedAt: NOW })
    expect(quota.windows.map((entry) => entry.kind)).toEqual(['other'])
    expect(quota.windows[0].label).toBe('Monthly extra')
    expect(quota.short).toBeNull()
    expect(quota.weekly).toBeNull()
    // The centre reading must still find something to show.
    expect(claudePrimaryQuotaWindow(quota)?.remainingPercent).toBe(80)
  })

  it('expires on any window whose own reset moment has passed', () => {
    const now = 1_738_500_000_000
    const quota = normalizeClaudeQuota({
      five_hour: { used_percentage: 10, resets_at: now / 1000 + 3600 },
      seven_day_opus: { used_percentage: 10, resets_at: now / 1000 - 60 }
    }, { updatedAt: now, now })
    expect(quota.status).toBe('stale')
  })
})

describe('desktop app usage history merge', () => {
  const statusline = () => normalizeClaudeQuota({
    five_hour: { used_percentage: 60, resets_at: 1_800_000_000 },
    seven_day: { used_percentage: 20, resets_at: 1_800_600_000 },
    seven_day_fable: { used_percentage: 56, resets_at: 1_800_600_000 }
  }, { updatedAt: 1_000 })

  it('moves the two shared windows forward while keeping resets and the per-model window', () => {
    const merged = mergeClaudePlanUsage(statusline(), {
      at: 2_000,
      fiveHourUsedPercent: 65,
      sevenDayUsedPercent: 29
    }, 1_500)
    expect(merged.short?.remainingPercent).toBe(35)
    expect(merged.weekly?.remainingPercent).toBe(71)
    // Reset moments and the per-model window are not in the sample, so they
    // must survive rather than be blanked or aligned to the all-models number.
    expect(merged.short?.resetAt).toBe(1_800_000_000_000)
    expect(merged.windows[2]).toMatchObject({ key: 'seven_day_fable', remainingPercent: 44 })
    expect(merged.updatedAt).toBe(2_000)
    expect(merged.source).toBe('statusline')
  })

  it('never walks a reading backwards with an older or absent sample', () => {
    const base = statusline()
    expect(mergeClaudePlanUsage(base, { at: 500, fiveHourUsedPercent: 99, sevenDayUsedPercent: 99 }, 1_500)).toBe(base)
    expect(mergeClaudePlanUsage(base, null, 1_500)).toBe(base)
    expect(mergeClaudePlanUsage(base, { at: 0, fiveHourUsedPercent: 5, sevenDayUsedPercent: 5 }, 1_500)).toBe(base)
  })

  it('seeds a first reading from the sample alone, without inventing reset moments', () => {
    const merged = mergeClaudePlanUsage(emptyClaudeQuota(), {
      at: 2_000,
      fiveHourUsedPercent: 35,
      sevenDayUsedPercent: 29
    }, 2_100)
    expect(merged.windows.map((entry) => entry.key)).toEqual(['five_hour', 'seven_day'])
    expect(merged.short).toMatchObject({ remainingPercent: 65, resetAt: null })
    expect(merged.source).toBe('plan-history')
    expect(merged.status).toBe('ok')
  })

  it('ignores a sample whose windows are both absent', () => {
    const base = statusline()
    expect(mergeClaudePlanUsage(base, { at: 9_000, fiveHourUsedPercent: null, sevenDayUsedPercent: null }, 9_100).windows)
      .toEqual(base.windows)
    expect(mergeClaudePlanUsage(emptyClaudeQuota(), { at: 9_000, fiveHourUsedPercent: null, sevenDayUsedPercent: null }, 9_100).windows)
      .toEqual([])
  })
})

describe('quota normalization', () => {
  it('converts the official used_percentage into the remaining-percent bucket contract', () => {
    const quota = normalizeClaudeQuota({
      five_hour: { used_percentage: 23.5, resets_at: 1_738_425_600 },
      seven_day: { used_percentage: 41.2, resets_at: 1_738_857_600 }
    }, { updatedAt: NOW })
    // Whole percent, matching the Codex chip that renders beside it and the
    // water-ball centre above it — one fact, one precision.
    expect(quota.short).toMatchObject({ remainingPercent: 77, resetAt: 1_738_425_600_000, windowMinutes: CLAUDE_SHORT_WINDOW_MINUTES })
    expect(quota.weekly).toMatchObject({ remainingPercent: 59, resetAt: 1_738_857_600_000, windowMinutes: CLAUDE_WEEKLY_WINDOW_MINUTES })
    expect(quota.status).toBe('ok')
    expect(quota.source).toBe('statusline')
  })

  it('marks a reading stale once its own window has already reset', () => {
    // `stale` was previously reachable only when a read failed outright, so a
    // reading could sit unrefreshed for hours and still render as current.
    // A window whose `resets_at` has passed is expired by definition — its
    // percentage describes a window that no longer exists.
    const resetAt = 1_738_425_600
    const fresh = normalizeClaudeQuota(
      { five_hour: { used_percentage: 80, resets_at: resetAt } },
      { updatedAt: NOW, now: resetAt * 1000 - 60_000 }
    )
    expect(fresh.status).toBe('ok')
    const expired = normalizeClaudeQuota(
      { five_hour: { used_percentage: 80, resets_at: resetAt } },
      { updatedAt: NOW, now: resetAt * 1000 + 1 }
    )
    expect(expired.status).toBe('stale')
    // The reading itself is preserved, not discarded — same contract as
    // `staleClaudeQuota`.
    expect(expired.short?.remainingPercent).toBe(20)
    // Without a clock the caller gets the old permissive behaviour rather than
    // a wrong guess.
    expect(normalizeClaudeQuota({ five_hour: { used_percentage: 80, resets_at: resetAt } }).status).toBe('ok')
  })

  it('accepts every resets_at shape the two sources can produce', () => {
    // Epoch seconds is what Claude Code documents; the usage-API fallback
    // produced ISO strings, and both land in this one normalizer so the two
    // sources cannot disagree about the same field.
    expect(claudeResetAtToMs(1_738_425_600)).toBe(1_738_425_600_000)
    expect(claudeResetAtToMs(1_738_425_600_000)).toBe(1_738_425_600_000)
    expect(claudeResetAtToMs('2026-08-06T12:00:00.000Z')).toBe(Date.parse('2026-08-06T12:00:00.000Z'))
    expect(claudeResetAtToMs(0)).toBeNull()
    expect(claudeResetAtToMs('nonsense')).toBeNull()
    expect(claudeResetAtToMs(null)).toBeNull()
  })

  it('handles an independently absent window without failing the other one', () => {
    const quota = normalizeClaudeQuota({ five_hour: { used_percentage: 10 } })
    expect(quota.short?.remainingPercent).toBe(90)
    expect(quota.short?.resetAt).toBeNull()
    expect(quota.weekly).toBeNull()
  })

  it('reports idle rather than ok when no window was provided at all', () => {
    expect(normalizeClaudeQuota(null)).toMatchObject({ status: 'idle', short: null, weekly: null, source: 'none' })
    expect(normalizeClaudeQuota({ five_hour: null, seven_day: undefined }).status).toBe('idle')
  })

  it('clamps out-of-range and malformed percentages', () => {
    expect(normalizeClaudeQuota({ five_hour: { used_percentage: 140 } }).short?.remainingPercent).toBe(0)
    expect(normalizeClaudeQuota({ five_hour: { used_percentage: -20 } }).short?.remainingPercent).toBe(100)
    expect(normalizeClaudeQuota({ five_hour: { used_percentage: 'high' } }).short).toBeNull()
  })

  it('accepts a millisecond reset timestamp as well as epoch seconds', () => {
    expect(normalizeClaudeQuota({ five_hour: { used_percentage: 1, resets_at: 1_738_425_600_000 } }).short?.resetAt)
      .toBe(1_738_425_600_000)
    expect(normalizeClaudeQuota({ five_hour: { used_percentage: 1, resets_at: 0 } }).short?.resetAt).toBeNull()
  })

  it('marks a previous reading stale instead of discarding it', () => {
    const good = normalizeClaudeQuota({ five_hour: { used_percentage: 20 } }, { updatedAt: NOW })
    const stale = staleClaudeQuota(good)
    expect(stale.status).toBe('stale')
    expect(stale.short?.remainingPercent).toBe(80)
    expect(staleClaudeQuota(emptyClaudeQuota())).toMatchObject({ status: 'stale', short: null })
    expect(staleClaudeQuota(null).status).toBe('stale')
  })

  it('prefers the 5-hour window for the centre percentage and falls back to weekly', () => {
    expect(claudePrimaryQuotaWindow(normalizeClaudeQuota({
      five_hour: { used_percentage: 20 },
      seven_day: { used_percentage: 50 }
    }))?.remainingPercent).toBe(80)
    expect(claudePrimaryQuotaWindow(normalizeClaudeQuota({ seven_day: { used_percentage: 50 } }))?.remainingPercent).toBe(50)
    expect(claudePrimaryQuotaWindow(null)).toBeNull()
  })
})

describe('environment readiness', () => {
  it('reports the blocking reason without leaking a path', () => {
    expect(claudeReadinessReason(emptyClaudeEnvironment())).toBe('not-installed')
    expect(claudeReadinessReason({ ...emptyClaudeEnvironment(), installed: true })).toBe('not-authenticated')
    expect(claudeReadinessReason({ ...emptyClaudeEnvironment(), installed: true, authenticated: true })).toBe('degraded')
    expect(claudeReadinessReason(null)).toBe('unknown')
  })

  it('treats a readable data directory as usable even without the binary', () => {
    // A Claude Code installed under nvm is invisible to a GUI-launched preload.
    // Transcripts and the quota cache do not need the executable, so the lane
    // must degrade the open capability alone rather than report "not installed".
    const noBinary = { ...emptyClaudeEnvironment(), authenticated: true, homeReady: true, hooks: 'installed' as const }
    expect(claudeReadinessReason(noBinary)).toBe('degraded')
    expect(isClaudeAvailable(noBinary)).toBe(true)
    expect(canOpenClaudeTask(noBinary)).toBe(false)
    expect(canOpenClaudeTask({ ...noBinary, installed: true })).toBe(true)
  })

  it('is ready only once the hook bridge is registered', () => {
    const base = { ...emptyClaudeEnvironment(), installed: true, authenticated: true, homeReady: true }
    expect(claudeReadinessReason({ ...base, hooks: 'missing' })).toBe('degraded')
    expect(claudeReadinessReason({ ...base, hooks: 'installed' })).toBe('ready')
    expect(isClaudeAvailable({ ...base, hooks: 'missing' })).toBe(true)
    expect(isClaudeAvailable(emptyClaudeEnvironment())).toBe(false)
  })
})
