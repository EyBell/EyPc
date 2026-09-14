import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require_ = createRequire(import.meta.url)
const unreadModule = require_(resolve(process.cwd(), 'preload/orca/unread-bridge.cjs')) as {
  createUnreadBridge: (dependencies?: Record<string, unknown>) => {
    observe: (sessions: Array<Record<string, unknown>>, observedAt?: number) => void
    markViewed: (paneKey: string, viewedAt?: number) => Record<string, unknown>
    recordFor: (paneKey: string) => Record<string, number>
  }
}
const inventory = require_(resolve(process.cwd(), 'preload/orca/inventory.cjs')) as {
  collectSessions: (
    worktrees: unknown[],
    terminals: unknown[],
    visualLayouts?: unknown,
    nativePins?: Set<string>,
    unreadBridge?: { observe: (sessions: Array<Record<string, unknown>>) => void }
  ) => { sessions: Array<Record<string, unknown>> }
}

const TAB = '2e625d72-50d4-473d-854d-e6faa62e4039'
const LEAF = 'e971fc98-d84d-43c4-ae40-ef3877e16485'
const PANE = `${TAB}:${LEAF}`
const HANDLE = 'term_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SIBLING_TAB = '59c6d4f8-543c-4634-b15a-bd00ccde5581'
const SIBLING_LEAF = 'f0f3e4c5-aaaa-4bbb-8ccc-dddddddddddd'

function memoryStore() {
  const box: { value: unknown } = { value: null }
  return {
    getItem: () => box.value,
    setItem: (_key: string, value: unknown) => {
      box.value = value
      return true
    }
  }
}

function live(state: string, extras: Record<string, unknown> = {}) {
  return {
    worktrees: [{
      repo: 'EyPc',
      agents: [{ paneKey: PANE, state, agentType: 'grok', updatedAt: 10, ...extras }]
    }],
    terminals: [{
      handle: HANDLE,
      tabId: TAB,
      leafId: LEAF,
      title: state === 'working' ? '⠋ Grok' : 'done',
      connected: true,
      agentIdentity: 'grok'
    }]
  }
}

describe('Orca completed-unread bridge', () => {
  it('keeps a pane completed-unread after working until EyPc opens it', () => {
    let now = 100
    const bridge = unreadModule.createUnreadBridge({ store: memoryStore(), now: () => now })
    const working = live('working')
    expect(inventory.collectSessions(working.worktrees, working.terminals, undefined, undefined, bridge).sessions[0])
      .toMatchObject({ unread: false, state: 'working' })
    now = 200
    const done = live('done')
    expect(inventory.collectSessions(done.worktrees, done.terminals, undefined, undefined, bridge).sessions[0])
      .toMatchObject({ unread: true, state: 'done' })
    now = 300
    bridge.markViewed(PANE, 300)
    expect(inventory.collectSessions(done.worktrees, done.terminals, undefined, undefined, bridge).sessions[0])
      .toMatchObject({ unread: false, state: 'done' })
  })

  it('does not treat a click during working as reading the later completion', () => {
    let now = 100
    const bridge = unreadModule.createUnreadBridge({ store: memoryStore(), now: () => now })
    const working = live('working')
    inventory.collectSessions(working.worktrees, working.terminals, undefined, undefined, bridge)
    now = 150
    bridge.markViewed(PANE, 150)
    now = 200
    const done = live('done')
    expect(inventory.collectSessions(done.worktrees, done.terminals, undefined, undefined, bridge).sessions[0]?.unread)
      .toBe(true)
  })

  it('does not mark a cold already-done pane unread', () => {
    const bridge = unreadModule.createUnreadBridge({ store: memoryStore(), now: () => 100 })
    const done = live('done')
    expect(inventory.collectSessions(done.worktrees, done.terminals, undefined, undefined, bridge).sessions[0]?.unread)
      .toBe(false)
  })

  it('lets an explicit CLI unread boolean win over the bridge', () => {
    let now = 100
    const bridge = unreadModule.createUnreadBridge({ store: memoryStore(), now: () => now })
    inventory.collectSessions(live('working').worktrees, live('working').terminals, undefined, undefined, bridge)
    now = 200
    const explicitFalse = live('done', { unread: false })
    expect(inventory.collectSessions(explicitFalse.worktrees, explicitFalse.terminals, undefined, undefined, bridge).sessions[0]?.unread)
      .toBe(false)
    const explicitTrue = live('done', { unread: true })
    expect(inventory.collectSessions(explicitTrue.worktrees, explicitTrue.terminals, undefined, undefined, bridge).sessions[0]?.unread)
      .toBe(true)
  })

  it('can mark one finished sibling unread without guessing the other', () => {
    let now = 100
    const bridge = unreadModule.createUnreadBridge({ store: memoryStore(), now: () => now })
    inventory.collectSessions(live('working').worktrees, live('working').terminals, undefined, undefined, bridge)
    now = 200
    const { sessions } = inventory.collectSessions([{
      repo: 'EyPc',
      unread: true,
      agents: [
        { paneKey: PANE, state: 'done', agentType: 'grok', updatedAt: 20 },
        { paneKey: `${SIBLING_TAB}:${SIBLING_LEAF}`, state: 'done', agentType: 'grok', updatedAt: 10 }
      ]
    }], [
      { handle: HANDLE, tabId: TAB, leafId: LEAF, title: 'watched', connected: true, agentIdentity: 'grok' },
      {
        handle: 'term_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        tabId: SIBLING_TAB,
        leafId: SIBLING_LEAF,
        title: 'cold sibling',
        connected: true,
        agentIdentity: 'grok'
      }
    ], undefined, undefined, bridge)
    expect(sessions.map((row) => [row.paneKey, row.unread])).toEqual([
      [PANE, true],
      [`${SIBLING_TAB}:${SIBLING_LEAF}`, false]
    ])
  })

  it('reloads persisted viewed receipts from storage', () => {
    const store = memoryStore()
    let now = 100
    const first = unreadModule.createUnreadBridge({ store, now: () => now })
    first.observe([{ paneKey: PANE, state: 'working' }], 100)
    first.observe([{ paneKey: PANE, state: 'done' }], 200)
    first.markViewed(PANE, 300)
    const second = unreadModule.createUnreadBridge({ store, now: () => 400 })
    expect(second.recordFor(PANE)).toMatchObject({ seenWorkingAt: 100, completionEpoch: 200, viewedAt: 300 })
  })
})
