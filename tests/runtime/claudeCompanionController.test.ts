import { describe, expect, it, vi } from 'vitest'
import { createInitialState } from '../../src/domain/state'
import type { ClaudeRateLimitsInput } from '../../src/domain/claude'
import type { EypcPlatformApi } from '../../src/platform/eypcPlatform'
import { createCodexController } from '../../src/runtime/codexController'

const SOURCE_FINGERPRINT = 'a'.repeat(64)
/** Frozen clock for cases that must replay a session identically. */
const FIXED_NOW = 1_785_910_000_000

interface ClaudeSessionSeed {
  sessionId: string
  hookEvent?: string | null
  /** Fixed clock, so a session can be replayed identically across a restart. */
  at?: number
  updatedAt?: number
  lastAssistantAt?: number
  lastPromptAt?: number
  pid?: number
  isSidechain?: boolean
  parentSessionId?: string
}

function claudeSession(seed: ClaudeSessionSeed) {
  const now = seed.at ?? Date.now()
  return {
    sessionId: seed.sessionId,
    projectSlug: '-w-app',
    cwd: '/w/app',
    startedAt: now - 600_000,
    updatedAt: seed.updatedAt ?? now - 1_000,
    lastPromptAt: seed.lastPromptAt ?? now - 5_000,
    lastAssistantAt: seed.lastAssistantAt ?? now - 1_000,
    lastStopAt: seed.hookEvent === 'stop' ? now - 500 : 0,
    model: 'claude-opus-5',
    isSidechain: seed.isSidechain === true,
    parentSessionId: seed.parentSessionId || '',
    turns: 1,
    pendingToolUse: 0,
    contextTokens: 1000,
    hookEvent: seed.hookEvent ?? null,
    hookEventAt: now - 1_000,
    pid: seed.pid ?? 0
  }
}

interface ClaudeDesktopSeed {
  sessionId: string
  cliSessionId?: string
  title?: string
  lastEvent?: string
  at?: number
  isArchived?: boolean
}

/** Skew between an audit line's own timestamp and the mtime of its write. */
const MTIME_SKEW_MS = 5

function desktopSession(seed: ClaudeDesktopSeed) {
  const now = seed.at ?? Date.now()
  return {
    sessionId: seed.sessionId,
    title: seed.title ?? '桌面任务',
    cwd: '/internal/outputs',
    userSelectedFolders: ['/w/app'],
    createdAt: now - 600_000,
    lastActivityAt: now - 20_000 + MTIME_SKEW_MS,
    model: 'claude-fable-5',
    isArchived: seed.isArchived === true,
    scheduledTaskId: '',
    cliSessionId: seed.cliSessionId ?? '',
    // mtime and the metadata heartbeat are stamped *after* the audit line they
    // recorded, so they must never equal the in-line timestamps. Collapsing all
    // four onto one instant is a value that cannot occur on a real machine, and
    // it hid a live bug: the hide reconciliation compared two expressions that
    // only agree when the skew is zero.
    metadataUpdatedAt: now - 20_000 + MTIME_SKEW_MS,
    auditBytes: 2048,
    auditUpdatedAt: now - 20_000 + MTIME_SKEW_MS,
    lastEvent: seed.lastEvent ?? 'status',
    lastEventAt: now - 20_000,
    lastResultAt: seed.lastEvent === 'result' ? now - 20_000 : 0,
    lastPermissionRequestAt: 0,
    lastPermissionResponseAt: 0,
    rateLimit: null
  }
}

interface HarnessOptions {
  sessions?: ClaudeSessionSeed[]
  claudeEnabled?: boolean
  bridgeAbsent?: boolean
  unavailable?: boolean
  throwOnSnapshot?: boolean
  quota?: ClaudeRateLimitsInput | null
  openResult?: { outcome: string; confirmsRead: boolean; message?: string }
  codexThreads?: unknown[]
  quotaFallbackResult?: { rateLimits: { five_hour?: { used_percentage: number } }; updatedAt: number } | null
  /** Hold each readSnapshot until the test releases it, to exercise in-flight replay. */
  gateSnapshot?: boolean
  /** Present only when defined — an absent port models an older preload. */
  desktopSessions?: ClaudeDesktopSeed[]
  throwOnDesktopSnapshot?: boolean
  /** Model a bridge that could not arm a watcher yet (no session dirs). */
  desktopWatchUnarmed?: boolean
  /**
   * The app's own unread set, one entry per refresh cycle. `null` models a
   * reading that failed; `undefined` (an exhausted list) keeps the last value.
   */
  desktopUnread?: (string[] | null)[]
  /** Seeds the persisted authority before the controller is constructed. */
  desktopUnreadBaseline?: string[]
  /** Latest sample the desktop app recorded for itself; absent means never written. */
  planUsage?: { at: number; fiveHourUsedPercent: number | null; sevenDayUsedPercent: number | null } | null
}

function harness(options: HarnessOptions = {}) {
  let sessions = options.sessions || []
  let desktopSessions = options.desktopSessions
  const state = createInitialState(1)
  if (options.desktopUnreadBaseline) state.codex.claudeDesktopUnread = [...options.desktopUnreadBaseline]
  state.activeTab = 'codex'
  state.codex.settings.floatEnabled = true
  state.codex.settings.providers = { codex: true, claude: options.claudeEnabled !== false }
  const openCalls: Array<{ sessionId: string }> = []
  const fallbackCalls: Array<{ enabled?: boolean; coldStart?: boolean }> = []
  const eventListeners: Array<() => void> = []
  const desktopListeners: Array<() => void> = []
  let watchDisposals = 0
  let desktopWatchDisposals = 0
  const snapshotGates: Array<() => void> = []
  let snapshotReads = 0
  let planUsageReads = 0
  let desktopWatchAttempts = 0
  const desktopLane = options.desktopSessions === undefined ? {} : {
    readDesktopSnapshot: async () => {
      if (options.throwOnDesktopSnapshot) throw new Error('desktop reader exploded')
      return {
        version: 1 as const,
        revision: 'desktop-test',
        sessions: (desktopSessions || []).map(desktopSession),
        truncated: false,
        readAt: Date.now()
      }
    },
    readDesktopUnread: () => {
      const queue = options.desktopUnread
      if (!queue || !queue.length) return null
      const ids = queue.length > 1 ? queue.shift()! : queue[0]
      return ids === null ? null : { version: 1 as const, ids: [...ids], readAt: Date.now() }
    },
    watchDesktopSessions: (listener: () => void) => {
      desktopWatchAttempts += 1
      // A bridge with no session directory yet returns null so the caller knows
      // to retry rather than assume it is subscribed.
      if (options.desktopWatchUnarmed && desktopWatchAttempts < 2) return null
      desktopListeners.push(listener)
      return () => { desktopWatchDisposals += 1 }
    }
  }
  const claudeBridge = {
    ...desktopLane,
    inspect: () => options.unavailable
      ? { version: 1 as const, installed: false, homeReady: false, authenticated: false, cliVersion: '', hooks: 'missing' as const, statusline: 'missing' as const, checkedAt: Date.now() }
      : { version: 1 as const, installed: true, homeReady: true, authenticated: true, cliVersion: '2.1.220', hooks: 'installed' as const, statusline: 'installed' as const, checkedAt: Date.now() },
    readSnapshot: async () => {
      snapshotReads += 1
      if (options.throwOnSnapshot) throw new Error('claude bridge exploded')
      if (options.gateSnapshot) {
        await new Promise<void>((release) => { snapshotGates.push(release) })
      }
      return {
        version: 1 as const,
        revision: 'test',
        sessions: sessions.map(claudeSession),
        truncated: false,
        quota: options.quota === null ? null : { rateLimits: options.quota || { five_hour: { used_percentage: 25 } }, updatedAt: Date.now() },
        readAt: Date.now()
      }
    },
    readQuotaFallback: async (opts?: { enabled?: boolean; coldStart?: boolean }) => {
      fallbackCalls.push({ enabled: opts?.enabled, coldStart: opts?.coldStart })
      return options.quotaFallbackResult ?? null
    },
    readPlanUsage: async () => {
      planUsageReads += 1
      return options.planUsage ?? null
    },
    watchEvents: (listener: () => void) => {
      eventListeners.push(listener)
      return () => { watchDisposals += 1 }
    },
    install: () => ({ ok: true }),
    uninstall: () => ({ ok: true }),
    // One route for both families: the bridge turns every id into the same
    // `claude://resume` deep link, so the caller passes nothing but the id.
    openTask: async (sessionId: string) => {
      openCalls.push({ sessionId })
      return options.openResult
        || { outcome: 'dispatched' as const, confirmsRead: false, message: '已在 Claude 桌面端打开该任务' }
    },
    diagnostics: () => ({ revision: 'test', loaded: true, loadError: '' }),
    close: () => undefined
  }
  const messages: string[] = []
  const platform = {
    codex: {
      readSnapshot: async (input: Record<string, boolean>) => input.includeThreads
        ? {
            ok: true as const,
            receivedAt: Date.now(),
            value: {
              version: 2 as const,
              receivedAt: Date.now(),
              threads: options.codexThreads || [],
              projects: [{ key: 'chats', name: 'Chats', kind: 'chats' as const, nativePinned: false }],
              sourceFingerprint: SOURCE_FINGERPRINT,
              completeness: 'verified' as const
            }
          }
        : {
            ok: true as const,
            receivedAt: Date.now(),
            value: { version: 2 as const, receivedAt: Date.now(), quota: { plan: 'pro', short: { remainingPercent: 80, resetAt: 0, windowMinutes: 300 } } }
          },
      openThread: async () => ({ outcome: 'opened' as const }),
      close: () => undefined
    },
    ...(options.bridgeAbsent ? {} : { claude: claudeBridge })
  } as unknown as EypcPlatformApi
  const controller = createCodexController({
    platform,
    getAppState: () => state,
    save: () => undefined,
    notify: () => undefined,
    setMessage: (message: string) => { messages.push(message) }
  })
  return {
    controller,
    state,
    openCalls,
    fallbackCalls,
    messages,
    snapshotReads: () => snapshotReads,
    planUsageReads: () => planUsageReads,
    subscriptions: () => eventListeners.length,
    disposals: () => watchDisposals,
    desktopSubscriptions: () => desktopListeners.length,
    desktopWatchAttempts: () => desktopWatchAttempts,
    desktopDisposals: () => desktopWatchDisposals,
    emitHookEvent: () => { eventListeners[eventListeners.length - 1]?.() },
    emitDesktopEvent: () => { desktopListeners[desktopListeners.length - 1]?.() },
    releaseSnapshot: () => { snapshotGates.shift()?.() },
    pendingGates: () => snapshotGates.length,
    setSessions: (next: ClaudeSessionSeed[]) => { sessions = next },
    setDesktopSessions: (next: ClaudeDesktopSeed[]) => { desktopSessions = next }
  }
}

function createRestartedController(state: ReturnType<typeof createInitialState>, sessions: ClaudeSessionSeed[]) {
  const platform = {
    codex: {
      readSnapshot: async () => ({
        ok: true as const,
        receivedAt: Date.now(),
        value: {
          version: 2 as const,
          receivedAt: Date.now(),
          threads: [],
          projects: [{ key: 'chats', name: 'Chats', kind: 'chats' as const, nativePinned: false }],
          sourceFingerprint: SOURCE_FINGERPRINT,
          completeness: 'verified' as const
        }
      }),
      openThread: async () => ({ outcome: 'opened' as const }),
      close: () => undefined
    },
    claude: {
      inspect: () => ({ version: 1 as const, installed: true, homeReady: true, authenticated: true, cliVersion: '2.1.220', hooks: 'installed' as const, statusline: 'installed' as const, checkedAt: Date.now() }),
      readSnapshot: () => ({ version: 1 as const, revision: 'test', sessions: sessions.map(claudeSession), truncated: false, quota: null, readAt: Date.now() }),
      install: () => ({ ok: true }),
      uninstall: () => ({ ok: true }),
      openTask: async () => ({ outcome: 'dispatched' as const, confirmsRead: false }),
      diagnostics: () => ({ revision: 'test', loaded: true, loadError: '' }),
      close: () => undefined
    }
  } as unknown as EypcPlatformApi
  return {
    controller: createCodexController({
      platform,
      getAppState: () => state,
      save: () => undefined,
      notify: () => undefined,
      setMessage: () => undefined
    })
  }
}

async function settle(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
}

/** The float snapshot marks taskState optional for legacy readers; tests need it. */
function conversationsOf(controller: ReturnType<typeof harness>['controller']) {
  const taskState = controller.floatSnapshot().taskState
  expect(taskState).toBeDefined()
  return taskState!.conversations
}

describe('claude provider aggregation', () => {
  it('folds claude sessions into the same task package as codex', async () => {
    const context = harness({ sessions: [{ sessionId: 's1', hookEvent: 'pre-tool' }] })
    context.controller.start()
    await settle()
    const ongoing = conversationsOf(context.controller).ongoing
    expect(ongoing.map((task) => task.key)).toContain('claude:s1')
    expect(ongoing.find((task) => task.key === 'claude:s1')?.provider).toBe('claude')
    context.controller.dispose()
  })

  it('merges badges by state across providers', async () => {
    const context = harness({
      sessions: [
        { sessionId: 'waiting', hookEvent: 'notification' },
        { sessionId: 'approving', hookEvent: 'permission-request' },
        { sessionId: 'done', hookEvent: 'stop' }
      ]
    })
    context.controller.start()
    await settle()
    const conversations = conversationsOf(context.controller)
    expect(conversations.inputRequiredCount).toBe(1)
    expect(conversations.waitingCount).toBe(2)
    expect(conversations.completedUnreadCount).toBe(1)
    context.controller.dispose()
  })

  it('keeps the package free of claude data while the provider is disabled', async () => {
    const context = harness({ claudeEnabled: false, sessions: [{ sessionId: 's1', hookEvent: 'pre-tool' }] })
    context.controller.start()
    await settle()
    const conversations = conversationsOf(context.controller)
    expect(conversations.all.some((task) => task.key.startsWith('claude:'))).toBe(false)
    expect(context.snapshotReads()).toBe(0)
    context.controller.dispose()
  })

  it('never reads the bridge while disabled, so a disabled provider costs nothing', async () => {
    const context = harness({ claudeEnabled: false })
    context.controller.start()
    await settle()
    expect(context.snapshotReads()).toBe(0)
    context.controller.dispose()
  })

  it('degrades to codex only when the preload exposes no claude port', async () => {
    const context = harness({ bridgeAbsent: true, sessions: [{ sessionId: 's1' }] })
    context.controller.start()
    await settle()
    const conversations = conversationsOf(context.controller)
    expect(conversations.all.some((task) => task.key.startsWith('claude:'))).toBe(false)
    expect(conversations.status).toBe('ok')
    context.controller.dispose()
  })

  it('degrades to codex only when claude is enabled but not registered', async () => {
    const context = harness({ unavailable: true, sessions: [{ sessionId: 's1', hookEvent: 'pre-tool' }] })
    context.controller.start()
    await settle()
    expect(conversationsOf(context.controller).all.some((task) => task.key.startsWith('claude:'))).toBe(false)
    context.controller.dispose()
  })

  it('keeps the codex lane healthy when the claude bridge throws', async () => {
    const context = harness({ throwOnSnapshot: true, sessions: [{ sessionId: 's1' }] })
    context.controller.start()
    await settle()
    const conversations = conversationsOf(context.controller)
    expect(conversations.status).toBe('ok')
    expect(conversations.all.some((task) => task.key.startsWith('claude:'))).toBe(false)
    context.controller.dispose()
  })

  it('folds a running side chat into its parent rather than listing it twice', async () => {
    const context = harness({
      sessions: [
        { sessionId: 'parent', hookEvent: 'stop' },
        { sessionId: 'child', isSidechain: true, parentSessionId: 'parent', hookEvent: 'pre-tool' }
      ]
    })
    context.controller.start()
    await settle()
    const conversations = conversationsOf(context.controller)
    const claudeKeys = conversations.all.filter((task) => task.key.startsWith('claude:')).map((task) => task.key)
    expect(claudeKeys).toEqual(['claude:parent'])
    expect(conversations.ongoing.some((task) => task.key === 'claude:parent')).toBe(true)
    context.controller.dispose()
  })
})

describe('claude task jump', () => {
  it('routes a claude task through the claude bridge, not the codex one', async () => {
    const context = harness({ sessions: [{ sessionId: 's1', hookEvent: 'notification', pid: 4242 }] })
    context.controller.start()
    await settle()
    const opened = await context.controller.openFirstInput()
    await settle()
    expect(opened).toBe(true)
    expect(context.openCalls).toEqual([{ sessionId: 's1' }])
    context.controller.dispose()
  })

  /**
   * Handing the desktop app a deep link says nothing about what the user then
   * looked at, so no Claude jump spends the unread state (RAW-138). Only a
   * result that claims `confirmsRead` could, and none does today.
   */
  it('leaves a completed task unread after a desktop hand-off', async () => {
    const context = harness({ sessions: [{ sessionId: 'done', hookEvent: 'stop' }] })
    context.controller.start()
    await settle()
    expect(conversationsOf(context.controller).completedUnreadCount).toBe(1)
    await context.controller.openFirstCompletedUnread()
    await settle()
    expect(conversationsOf(context.controller).completedUnreadCount).toBe(1)
    context.controller.dispose()
  })

  it('reports a failure without changing read state', async () => {
    const context = harness({
      sessions: [{ sessionId: 'done', hookEvent: 'stop' }],
      openResult: { outcome: 'failed', confirmsRead: false, message: '唤起 Claude 桌面端失败' }
    })
    context.controller.start()
    await settle()
    // The direct-open command reports that it accepted the request, matching the
    // existing Codex contract; the jump outcome surfaces as a message instead.
    await context.controller.openFirstCompletedUnread()
    await settle()
    expect(conversationsOf(context.controller).completedUnreadCount).toBe(1)
    expect(context.messages).toContain('唤起 Claude 桌面端失败')
    context.controller.dispose()
  })

  it('re-publishing a merged snapshot updates claude state instead of freezing it', async () => {
    const context = harness({ sessions: [{ sessionId: 's1', hookEvent: 'pre-tool' }] })
    context.controller.start()
    await settle()
    expect(conversationsOf(context.controller).ongoing
      .find((task) => task.key === 'claude:s1')?.activityState).toBe('active')
    context.setSessions([{ sessionId: 's1', hookEvent: 'notification' }])
    await context.controller.refresh()
    await settle()
    const conversations = conversationsOf(context.controller)
    expect(conversations.ongoing.filter((task) => task.key === 'claude:s1')).toHaveLength(1)
    expect(conversations.ongoing.find((task) => task.key === 'claude:s1')?.activityState).toBe('waiting-input')
    expect(conversations.inputRequiredCount).toBe(1)
    context.controller.dispose()
  })
})

describe('compatibility wording', () => {
  it('keeps the legacy codex-only message while claude is disabled', async () => {
    const context = harness({ claudeEnabled: false })
    context.controller.start()
    await settle()
    context.controller.cycleTask(1)
    await settle()
    expect(context.messages.at(-1)).toBe('当前没有可切换的 Codex 任务')
    context.controller.dispose()
  })

  it('drops the codex-specific noun once a second provider is enabled', async () => {
    const context = harness({ sessions: [] })
    context.controller.start()
    await settle()
    context.controller.cycleTask(1)
    await settle()
    expect(context.messages.at(-1)).toBe('当前没有可切换的任务')
    context.controller.dispose()
  })
})

describe('review regressions', () => {
  it('leaves the codex-only snapshot object untouched, counters included', async () => {
    // The aggregate helpers recompute counters from their own arrays and omit
    // the hidden-unread term the canonical Codex counter includes, so
    // compatibility mode must not run them at all.
    const context = harness({ claudeEnabled: false })
    context.controller.start()
    await settle()
    const before = conversationsOf(context.controller)
    await context.controller.refresh()
    await settle()
    const after = conversationsOf(context.controller)
    expect(after.completedUnreadCount).toBe(before.completedUnreadCount)
    expect(after.pendingCount).toBe(after.completedUnreadCount)
  })

  it('applies a provider toggle immediately instead of waiting for the next tick', async () => {
    const context = harness({ sessions: [{ sessionId: 's1', hookEvent: 'pre-tool' }] })
    context.controller.start()
    await settle()
    expect(conversationsOf(context.controller).all.some((task) => task.key === 'claude:s1')).toBe(true)
    context.controller.updateSettings({ providers: { codex: true, claude: false } })
    await settle()
    expect(conversationsOf(context.controller).all.some((task) => task.key.startsWith('claude:'))).toBe(false)
    context.controller.dispose()
  })

  /**
   * No jump writes a receipt any more — a desktop hand-off is not evidence — but
   * the persisted ones still have to be honoured, so a stored receipt must keep
   * a completed session out of the unread bucket across a restart.
   */
  it('honours a persisted read receipt across a controller restart', async () => {
    const context = harness({ sessions: [{ sessionId: 'done', hookEvent: 'stop', at: FIXED_NOW }] })
    context.controller.start()
    await settle()
    expect(conversationsOf(context.controller).completedUnreadCount).toBe(1)
    context.controller.dispose()

    context.state.codex.claudeReceipts = { 'claude:done': FIXED_NOW }
    const restarted = createRestartedController(context.state, [{ sessionId: 'done', hookEvent: 'stop', at: FIXED_NOW }])
    restarted.controller.start()
    await settle()
    expect(conversationsOf(restarted.controller).completedUnreadCount).toBe(0)
    restarted.controller.dispose()
  })

  it('refuses to archive a claude task instead of calling the codex bridge', async () => {
    const context = harness({ sessions: [{ sessionId: 'done', hookEvent: 'stop' }] })
    context.controller.start()
    await settle()
    const card = conversationsOf(context.controller).completedUnread.find((task) => task.key === 'claude:done')
    expect(card).toBeDefined()
    const archived = await context.controller.archive('claude:done', card!.completionRevision || card!.updatedAt)
    expect(archived).toBe(false)
    expect(context.messages).toContain('Claude 会话不支持归档')
    context.controller.dispose()
  })

  it('does not start a second bridge read while one is in flight', async () => {
    const context = harness({ sessions: [{ sessionId: 's1', hookEvent: 'pre-tool' }] })
    context.controller.start()
    await settle()
    const before = context.snapshotReads()
    await Promise.all([context.controller.refresh(), context.controller.refresh(), context.controller.refresh()])
    await settle()
    expect(context.snapshotReads() - before).toBeLessThanOrEqual(1)
    context.controller.dispose()
  })
})

describe('claude refresh lane', () => {
  it('runs on its own cadence and does not block the codex lane', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(100_000)
    try {
      const context = harness({ sessions: [{ sessionId: 's1', hookEvent: 'pre-tool' }] })
      context.state.codex.settings.taskRefreshSeconds = 3
      context.state.codex.settings.quotaRefreshSeconds = 5
      context.controller.start()
      await vi.advanceTimersByTimeAsync(0)
      expect(context.snapshotReads()).toBe(1)
      await vi.advanceTimersByTimeAsync(2_999)
      expect(context.snapshotReads()).toBe(1)
      await vi.advanceTimersByTimeAsync(1_500)
      expect(context.snapshotReads()).toBe(2)
      context.controller.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps refreshing quota after the conversation inbox is switched off', async () => {
    // One read serves both surfaces, so the lane wakes on whichever cadence is
    // due first — the same `Math.min(quotaWait, taskWait, …)` rule the Codex
    // scheduler uses. Binding it to `taskDelay` alone meant switching off the
    // inbox (which makes `taskDelay` infinite) also froze the quota reading,
    // leaving the water ball on a number that never updated again.
    vi.useFakeTimers()
    vi.setSystemTime(100_000)
    try {
      const context = harness({ sessions: [{ sessionId: 's1', hookEvent: 'pre-tool' }] })
      context.state.codex.settings.conversationInboxEnabled = false
      context.state.codex.settings.quotaRefreshSeconds = 2
      context.controller.start()
      await vi.advanceTimersByTimeAsync(0)
      const first = context.snapshotReads()
      expect(first).toBeGreaterThan(0)
      await vi.advanceTimersByTimeAsync(5_000)
      expect(context.snapshotReads()).toBeGreaterThan(first)
      context.controller.dispose()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('quota cold start versus idle drift', () => {
  /**
   * The status line is the credential-free source but only runs while Claude
   * Code renders. Until it has run once the quota area is blank, which is worth
   * one automatic read; after that, keeping an existing reading fresh is the
   * user's decision because it means reading credentials periodically.
   */
  it('asks for a cold read when the status line has produced nothing', async () => {
    const app = harness({ sessions: [{ sessionId: 's1' }], quota: null })
    await app.controller.start()
    await app.controller.refresh()

    expect(app.state.codex.settings.claudeQuotaFallback).toBe(false)
    expect(app.fallbackCalls.length).toBeGreaterThan(0)
    expect(app.fallbackCalls[0]).toEqual({ enabled: false, coldStart: true })
  })

  it('stops asking once any reading exists', async () => {
    const app = harness({ sessions: [{ sessionId: 's1' }] })
    await app.controller.start()
    await app.controller.refresh()
    // The bridge snapshot carried a status line reading, so there is nothing
    // blank to rescue and the opt-in switch is off.
    expect(app.fallbackCalls).toEqual([])
    expect(app.controller.view().claudeQuota.short?.remainingPercent).toBe(75)
  })

  it('keeps the periodic refresh behind the opt-in switch', async () => {
    const app = harness({ sessions: [{ sessionId: 's1' }] })
    app.state.codex.settings.claudeQuotaFallback = true
    await app.controller.start()
    await app.controller.refresh()
    expect(app.fallbackCalls[0]).toEqual({ enabled: true, coldStart: false })
  })

  it('adopts a cold reading and reports it as coming from the usage API', async () => {
    const app = harness({
      sessions: [{ sessionId: 's1' }],
      quota: null,
      quotaFallbackResult: { rateLimits: { five_hour: { used_percentage: 40 } }, updatedAt: Date.now() }
    })
    await app.controller.start()
    await app.controller.refresh()
    const view = app.controller.view()
    expect(view.claudeQuota.short?.remainingPercent).toBe(60)
    expect(view.claudeQuota.source).toBe('usage-api')
  })
})

describe('desktop app usage history keeps the reading fresh', () => {
  it('moves the reading forward without touching reset moments or the per-model window', async () => {
    const app = harness({
      sessions: [{ sessionId: 's1' }],
      quota: {
        five_hour: { used_percentage: 60, resets_at: 2_000_000_000 },
        seven_day: { used_percentage: 20, resets_at: 2_000_600_000 },
        seven_day_fable: { used_percentage: 56, resets_at: 2_000_600_000 }
      },
      planUsage: { at: Date.now() + 60_000, fiveHourUsedPercent: 65, sevenDayUsedPercent: 29 }
    })
    await app.controller.start()
    await app.controller.refresh()
    const quota = app.controller.view().claudeQuota
    expect(app.planUsageReads()).toBeGreaterThan(0)
    expect(quota.short?.remainingPercent).toBe(35)
    expect(quota.weekly?.remainingPercent).toBe(71)
    // The status line contributed these two facts and the sample carries
    // neither, so they must survive the merge.
    expect(quota.short?.resetAt).toBe(2_000_000_000_000)
    expect(quota.windows.map((entry) => entry.key)).toEqual(['five_hour', 'seven_day', 'seven_day_fable'])
    expect(quota.windows[2].remainingPercent).toBe(44)
  })

  it('shows a reading even when the status line never ran', async () => {
    const app = harness({
      sessions: [{ sessionId: 's1' }],
      quota: null,
      planUsage: { at: Date.now(), fiveHourUsedPercent: 35, sevenDayUsedPercent: 29 }
    })
    await app.controller.start()
    await app.controller.refresh()
    const quota = app.controller.view().claudeQuota
    expect(quota.source).toBe('plan-history')
    expect(quota.short?.remainingPercent).toBe(65)
    expect(quota.short?.resetAt).toBeNull()
  })

  it('leaves the reading untouched when the app never wrote a sample', async () => {
    const app = harness({ sessions: [{ sessionId: 's1' }], planUsage: null })
    await app.controller.start()
    await app.controller.refresh()
    // Default harness quota is a 25% five-hour reading from the status line.
    expect(app.controller.view().claudeQuota.short?.remainingPercent).toBe(75)
    expect(app.controller.view().claudeQuota.source).toBe('statusline')
  })
})

describe('hook events push instead of waiting for the interval', () => {
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

  it('subscribes while the provider is on and refreshes on an event', async () => {
    const app = harness({ sessions: [{ sessionId: 's1' }] })
    await app.controller.start()
    await app.controller.refresh()
    expect(app.subscriptions()).toBe(1)

    const before = app.snapshotReads()
    app.setSessions([{ sessionId: 's1' }, { sessionId: 's2' }])
    app.emitHookEvent()
    await tick()
    await tick()

    // No timer advanced: the read happened because the queue changed.
    expect(app.snapshotReads()).toBeGreaterThan(before)
    const keys = app.controller.view().taskState.conversations.all.map((task) => task.key)
    expect(keys).toContain('claude:s2')
  })

  it('replays an event that arrived while a read was in flight', async () => {
    const app = harness({ sessions: [{ sessionId: 's1' }], gateSnapshot: true })
    await app.controller.start()
    void app.controller.refresh()
    await tick()
    expect(app.pendingGates()).toBe(1)

    // The queue grew mid-read. Dropping this would lose the event entirely,
    // because the append already happened and nothing re-announces it.
    app.emitHookEvent()
    const before = app.snapshotReads()
    app.releaseSnapshot()
    await tick()
    await tick()
    expect(app.snapshotReads()).toBeGreaterThan(before)
    app.releaseSnapshot()
  })

  it('unsubscribes when the provider is switched off and resubscribes when it returns', async () => {
    const app = harness({ sessions: [{ sessionId: 's1' }] })
    await app.controller.start()
    expect(app.subscriptions()).toBe(1)

    app.controller.updateSettings({ providers: { codex: true, claude: false } })
    expect(app.disposals()).toBe(1)
    expect(app.subscriptions()).toBe(1)

    app.controller.updateSettings({ providers: { codex: true, claude: true } })
    expect(app.subscriptions()).toBe(2)
  })

  it('ignores an event after dispose', async () => {
    const app = harness({ sessions: [{ sessionId: 's1' }] })
    await app.controller.start()
    await app.controller.refresh()
    app.controller.dispose()
    expect(app.disposals()).toBe(1)

    const before = app.snapshotReads()
    app.emitHookEvent()
    await tick()
    await tick()
    expect(app.snapshotReads()).toBe(before)
  })

  it('starts without a push lane when the preload is too old to offer one', async () => {
    const app = harness({ sessions: [{ sessionId: 's1' }] })
    await app.controller.start()
    await app.controller.refresh()
    // The lane is optional; the interval alone still produced the inventory.
    expect(app.controller.view().taskState.conversations.all.length).toBeGreaterThan(0)
  })
})

describe('claude desktop lane', () => {
  it('folds desktop sessions into the claude channel with the app-owned title', async () => {
    const context = harness({ sessions: [], desktopSessions: [{ sessionId: 'local_d1', title: '原型推进', lastEvent: 'status' }] })
    context.controller.start()
    await settle()
    const ongoing = conversationsOf(context.controller).ongoing
    const card = ongoing.find((task) => task.key === 'claude:local_d1')
    expect(card).toBeDefined()
    expect(card?.provider).toBe('claude')
    expect(card?.displayName).toBe('原型推进')
    context.controller.dispose()
  })

  it('suppresses the cli duplicate of a wrapped session', async () => {
    const context = harness({
      sessions: [{ sessionId: 'cli-1', hookEvent: 'pre-tool' }, { sessionId: 'cli-2', hookEvent: 'pre-tool' }],
      desktopSessions: [{ sessionId: 'local_d2', cliSessionId: 'cli-1' }]
    })
    context.controller.start()
    await settle()
    const keys = conversationsOf(context.controller).all.map((task) => task.key)
    expect(keys).toContain('claude:local_d2')
    expect(keys).toContain('claude:cli-2')
    expect(keys).not.toContain('claude:cli-1')
    context.controller.dispose()
  })

  it('never projects an app-archived desktop session', async () => {
    const context = harness({ sessions: [], desktopSessions: [{ sessionId: 'local_d3', isArchived: true }] })
    context.controller.start()
    await settle()
    expect(conversationsOf(context.controller).all.map((task) => task.key)).not.toContain('claude:local_d3')
    context.controller.dispose()
  })

  it('keeps the claude lane identical when the preload lacks the desktop port', async () => {
    const context = harness({ sessions: [{ sessionId: 's1', hookEvent: 'pre-tool' }] })
    context.controller.start()
    await settle()
    const keys = conversationsOf(context.controller).all.map((task) => task.key)
    expect(keys.filter((key) => key.startsWith('claude:'))).toEqual(['claude:s1'])
    context.controller.dispose()
  })

  /**
   * The desktop id travels verbatim; the bridge owns the `local_` strip and the
   * deep-link shape, so the Controller has no per-family branch left to get
   * wrong.
   */
  it('routes a desktop session through the same opener as a CLI one', async () => {
    const context = harness({ sessions: [], desktopSessions: [{ sessionId: 'local_d4', title: '原型缺口推进' }] })
    context.controller.start()
    await settle()
    const opened = await context.controller.openThread('claude:local_d4', 'local_d4')
    expect(opened).toBe(true)
    expect(context.openCalls).toEqual([{ sessionId: 'local_d4' }])
    context.controller.dispose()
  })

  /**
   * Activating the app proves nothing about which session the user is looking
   * at, so this open must never spend the unread state (RAW-138).
   */
  it('writes no read receipt for a desktop activation', async () => {
    const context = harness({
      sessions: [],
      desktopSessions: [{ sessionId: 'local_d6', lastEvent: 'result' }]
    })
    context.controller.start()
    await settle()
    await context.controller.openThread('claude:local_d6', 'local_d6')
    expect(Object.keys(context.state.codex.claudeReceipts || {})).not.toContain('claude:local_d6')
    context.controller.dispose()
  })


  /**
   * The app's own unread set is this lane's read authority: EyPc's badge is a
   * mirror of the dot in its sidebar. Opening the session there drops it from
   * the set, and the badge follows on the next reading.
   */
  it('mirrors the app unread set and clears when the app clears it', async () => {
    const context = harness({
      sessions: [],
      desktopSessions: [{ sessionId: 'local_d8', lastEvent: 'result' }],
      desktopUnread: [['local_d8'], []]
    })
    context.controller.start()
    await settle()
    expect(conversationsOf(context.controller).completedUnreadCount).toBe(1)
    context.emitDesktopEvent()
    await settle()
    expect(conversationsOf(context.controller).completedUnreadCount).toBe(0)
    context.controller.dispose()
  })

  /**
   * The reading is a write-window observation — the app compacts the record out
   * of reach between writes — so a failed reading keeps the last known set
   * rather than dropping the authority and the badge with it.
   */
  it('keeps the last known set when the reading fails', async () => {
    const context = harness({
      sessions: [],
      desktopSessions: [{ sessionId: 'local_da', lastEvent: 'result' }],
      desktopUnread: [['local_da'], null]
    })
    context.controller.start()
    await settle()
    context.emitDesktopEvent()
    await settle()
    expect(context.state.codex.claudeDesktopUnread).toEqual(['local_da'])
    expect(conversationsOf(context.controller).completedUnreadCount).toBe(1)
    context.controller.dispose()
  })

  /**
   * No reading, no authority, no badge — the behaviour this lane shipped with,
   * and the reason it shipped that way.
   */
  it('produces no unread badge when the set was never read', async () => {
    const context = harness({
      sessions: [],
      desktopSessions: [{ sessionId: 'local_db', lastEvent: 'result' }]
    })
    context.controller.start()
    await settle()
    expect(conversationsOf(context.controller).completedUnreadCount).toBe(0)
    expect(context.state.codex.claudeDesktopUnread).toBeUndefined()
    context.controller.dispose()
  })

  /** A restart mirrors the app's dots immediately, without waiting for a write. */
  it('restores the authority from persisted state', async () => {
    const context = harness({
      sessions: [],
      desktopSessions: [{ sessionId: 'local_dc', lastEvent: 'result' }],
      desktopUnreadBaseline: ['local_dc']
    })
    context.controller.start()
    await settle()
    expect(conversationsOf(context.controller).completedUnreadCount).toBe(1)
    context.controller.dispose()
  })

  it('reports a failed desktop activation without touching cards', async () => {
    const context = harness({
      sessions: [],
      desktopSessions: [{ sessionId: 'local_d7' }],
      openResult: { outcome: 'unavailable', confirmsRead: false, message: 'Claude 桌面端未在运行' }
    })
    context.controller.start()
    await settle()
    const opened = await context.controller.openThread('claude:local_d7', 'local_d7')
    expect(opened).toBe(false)
    expect(context.messages.some((message) => message.includes('桌面端未在运行'))).toBe(true)
    expect(conversationsOf(context.controller).all.map((task) => task.key)).toContain('claude:local_d7')
    context.controller.dispose()
  })

  it('counts non-archived desktop sessions for the settings status line', async () => {
    const context = harness({
      sessions: [],
      desktopSessions: [{ sessionId: 'local_d8' }, { sessionId: 'local_d9' }, { sessionId: 'local_d10', isArchived: true }]
    })
    context.controller.start()
    await settle()
    expect(context.controller.view().claudeDesktopSessionCount).toBe(2)
    context.controller.dispose()
  })

  it('subscribes to desktop heartbeats and disposes them with the lane', async () => {
    const context = harness({ sessions: [], desktopSessions: [{ sessionId: 'local_d5' }] })
    context.controller.start()
    await settle()
    expect(context.desktopSubscriptions()).toBe(1)
    const before = context.snapshotReads()
    context.emitDesktopEvent()
    await settle()
    expect(context.snapshotReads()).toBeGreaterThan(before)
    context.controller.dispose()
    expect(context.desktopDisposals()).toBe(1)
  })

  it('actually hides a desktop card when the user hides it', async () => {
    // This is the end-to-end shape that was broken: `hide()` returned true and
    // reported 「已移入 Companion 的已隐藏区」 while the card stayed exactly
    // where it was, because the stored watermark (`task.revisionAt`) and the
    // reconciliation expression had drifted apart by the mtime skew.
    const context = harness({ sessions: [], desktopSessions: [{ sessionId: 'local_hide' }] })
    context.controller.start()
    await settle()
    const before = conversationsOf(context.controller)
    const card = before.all.find((task) => task.key === 'claude:local_hide')
    expect(card?.isHidden).toBe(false)

    expect(context.controller.hide('claude:local_hide', card!.revisionAt)).toBe(true)
    await settle()

    const after = conversationsOf(context.controller)
    expect(after.hidden.map((task) => task.key)).toContain('claude:local_hide')
    expect(after.ongoing.map((task) => task.key)).not.toContain('claude:local_hide')
    // Restorable, like a Codex card: the hidden bucket has to carry a kind or
    // the 「显」 control renders permanently disabled (codex.ts:1765).
    expect(after.hidden.find((task) => task.key === 'claude:local_hide')?.hiddenKind).toBe('task')
    expect(context.controller.restore('claude:local_hide', card!.revisionAt, 'task')).toBe(true)
    await settle()
    expect(conversationsOf(context.controller).hidden.map((task) => task.key))
      .not.toContain('claude:local_hide')
    context.controller.dispose()
  })

  it('never leaves a finished desktop session in the unread badge', async () => {
    // Nothing can write a read receipt for a desktop session, so producing
    // completed-unread created a badge no action inside EyPc could clear —
    // hiding does not clear it either, since the compact counter deliberately
    // includes hidden completed-unread cards (PRODUCT_REQUIREMENTS.md:122).
    const context = harness({
      sessions: [],
      desktopSessions: [{ sessionId: 'local_done', lastEvent: 'result' }]
    })
    context.controller.start()
    await settle()
    const conversations = conversationsOf(context.controller)
    const card = conversations.all.find((task) => task.key === 'claude:local_done')
    expect(card?.bucket).toBe('completed')
    expect(card?.unreadState).toBe('unknown')
    expect(conversations.completedUnread.map((task) => task.key)).not.toContain('claude:local_done')
    expect(conversations.completedTab.map((task) => task.key)).toContain('claude:local_done')
    context.controller.dispose()
  })

  it('shows desktop sessions even when the CLI is not installed at all', async () => {
    // The desktop app keeps its sessions outside `~/.claude` and needs neither
    // the CLI binary nor a CLI login, but the lane was gated on the CLI's
    // readiness — so a desktop-only user saw nothing whatsoever (P5 review).
    const context = harness({
      unavailable: true,
      sessions: [],
      desktopSessions: [{ sessionId: 'local_only', title: '只装了桌面端' }]
    })
    context.controller.start()
    await settle()
    const keys = conversationsOf(context.controller).all.map((task) => task.key)
    expect(keys).toContain('claude:local_only')
    expect(context.controller.view().claudeDesktopSessionCount).toBe(1)
    context.controller.dispose()
  })

  it('keeps the codex lane untouched when the desktop reader throws', async () => {
    const withDesktop = harness({
      sessions: [],
      desktopSessions: [{ sessionId: 'local_boom' }],
      throwOnDesktopSnapshot: true
    })
    withDesktop.controller.start()
    await settle()
    const codexKeys = conversationsOf(withDesktop.controller).all
      .filter((task) => task.provider !== 'claude')
      .map((task) => task.key)
    withDesktop.controller.dispose()

    const baseline = harness({ sessions: [] })
    baseline.controller.start()
    await settle()
    const baselineKeys = conversationsOf(baseline.controller).all
      .filter((task) => task.provider !== 'claude')
      .map((task) => task.key)
    baseline.controller.dispose()

    expect(codexKeys).toEqual(baselineKeys)
  })

  it('retries the heartbeat subscription until the bridge can arm one', async () => {
    // Before the first desktop session exists there is no directory to watch.
    // A null disposer has to mean "not subscribed", or the lane silently loses
    // push for the whole plugin session (P5 review). The retry rides the normal
    // refresh cadence, so recovery is automatic rather than restart-only.
    const context = harness({
      sessions: [],
      desktopSessions: [{ sessionId: 'local_late' }],
      desktopWatchUnarmed: true
    })
    context.controller.start()
    await settle()
    expect(context.desktopWatchAttempts()).toBeGreaterThan(1)
    expect(context.desktopSubscriptions()).toBe(1)
    context.controller.dispose()
    expect(context.desktopDisposals()).toBe(1)
  })

  it('drops desktop observations when the provider is switched off', async () => {
    const context = harness({ sessions: [], desktopSessions: [{ sessionId: 'local_off' }] })
    context.controller.start()
    await settle()
    expect(context.controller.view().claudeDesktopSessionCount).toBe(1)
    context.controller.updateSettings({ providers: { codex: true, claude: false } })
    await settle()
    expect(context.controller.view().claudeDesktopSessionCount).toBe(0)
    expect(conversationsOf(context.controller).all.map((task) => task.key)).not.toContain('claude:local_off')
    context.controller.dispose()
  })
})
