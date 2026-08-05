import { describe, expect, it, vi } from 'vitest'
import { createInitialState } from '../../src/domain/state'
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

interface HarnessOptions {
  sessions?: ClaudeSessionSeed[]
  claudeEnabled?: boolean
  bridgeAbsent?: boolean
  unavailable?: boolean
  throwOnSnapshot?: boolean
  quota?: { five_hour?: { used_percentage: number } } | null
  openResult?: { outcome: string; confirmsRead: boolean; message?: string }
  codexThreads?: unknown[]
}

function harness(options: HarnessOptions = {}) {
  let sessions = options.sessions || []
  const state = createInitialState(1)
  state.activeTab = 'codex'
  state.codex.settings.floatEnabled = true
  state.codex.settings.providers = { codex: true, claude: options.claudeEnabled !== false }
  const openCalls: Array<{ sessionId: string; pid?: number }> = []
  let snapshotReads = 0
  const claudeBridge = {
    inspect: () => options.unavailable
      ? { version: 1 as const, installed: false, homeReady: false, authenticated: false, cliVersion: '', hooks: 'missing' as const, statusline: 'missing' as const, checkedAt: Date.now() }
      : { version: 1 as const, installed: true, homeReady: true, authenticated: true, cliVersion: '2.1.220', hooks: 'installed' as const, statusline: 'installed' as const, checkedAt: Date.now() },
    readSnapshot: () => {
      snapshotReads += 1
      if (options.throwOnSnapshot) throw new Error('claude bridge exploded')
      return {
        version: 1 as const,
        revision: 'test',
        sessions: sessions.map(claudeSession),
        truncated: false,
        quota: options.quota === null ? null : { rateLimits: options.quota || { five_hour: { used_percentage: 25 } }, updatedAt: Date.now() },
        readAt: Date.now()
      }
    },
    install: () => ({ ok: true }),
    uninstall: () => ({ ok: true }),
    openTask: async (sessionId: string, opts?: { pid?: number }) => {
      openCalls.push({ sessionId, pid: opts?.pid })
      return options.openResult || { outcome: 'opened' as const, confirmsRead: true }
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
    messages,
    snapshotReads: () => snapshotReads,
    setSessions: (next: ClaudeSessionSeed[]) => { sessions = next }
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
      openTask: async () => ({ outcome: 'opened' as const, confirmsRead: true }),
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
    expect(context.openCalls).toEqual([{ sessionId: 's1', pid: 4242 }])
    context.controller.dispose()
  })

  it('marks a completed task read only after a confirmed focus', async () => {
    const context = harness({ sessions: [{ sessionId: 'done', hookEvent: 'stop' }] })
    context.controller.start()
    await settle()
    expect(conversationsOf(context.controller).completedUnreadCount).toBe(1)
    await context.controller.openFirstCompletedUnread()
    await settle()
    expect(conversationsOf(context.controller).completedUnreadCount).toBe(0)
    context.controller.dispose()
  })

  it('leaves a task unread when the jump could only be dispatched', async () => {
    const context = harness({
      sessions: [{ sessionId: 'done', hookEvent: 'stop' }],
      openResult: { outcome: 'dispatched', confirmsRead: false, message: '已在新终端恢复会话' }
    })
    context.controller.start()
    await settle()
    await context.controller.openFirstCompletedUnread()
    await settle()
    expect(conversationsOf(context.controller).completedUnreadCount).toBe(1)
    context.controller.dispose()
  })

  it('reports a failure without changing read state', async () => {
    const context = harness({
      sessions: [{ sessionId: 'done', hookEvent: 'stop' }],
      openResult: { outcome: 'failed', confirmsRead: false, message: '终端窗口激活失败' }
    })
    context.controller.start()
    await settle()
    // The direct-open command reports that it accepted the request, matching the
    // existing Codex contract; the jump outcome surfaces as a message instead.
    await context.controller.openFirstCompletedUnread()
    await settle()
    expect(conversationsOf(context.controller).completedUnreadCount).toBe(1)
    expect(context.messages).toContain('终端窗口激活失败')
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

  it('remembers a read receipt across a controller restart', async () => {
    const context = harness({ sessions: [{ sessionId: 'done', hookEvent: 'stop', at: FIXED_NOW }] })
    context.controller.start()
    await settle()
    await context.controller.openFirstCompletedUnread()
    await settle()
    expect(conversationsOf(context.controller).completedUnreadCount).toBe(0)
    expect(Object.keys(context.state.codex.claudeReceipts || {})).toContain('claude:done')
    context.controller.dispose()

    // A fresh controller over the same persisted state must not resurrect it.
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
      context.state.codex.settings.quotaRefreshSeconds = 2
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
})
