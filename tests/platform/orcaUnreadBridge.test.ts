import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require_ = createRequire(import.meta.url)
const unreadModule = require_(resolve(process.cwd(), 'preload/orca/unread-bridge.cjs')) as {
  createUnreadBridge: (dependencies?: Record<string, unknown>) => {
    ready: () => Promise<void>
    flush: () => Promise<void>
    persistenceStatus: () => Record<string, unknown>
    observe: (sessions: Array<Record<string, unknown>>, observedAt?: number) => void
    markViewed: (paneKey: string, viewedAt?: number) => Record<string, unknown>
    recordFor: (paneKey: string) => Record<string, number>
  }
}
const inventory = require_(resolve(process.cwd(), 'preload/orca/inventory.cjs')) as {
  createInventoryReader: (deps: Record<string, unknown>) => { readInventory: () => Promise<{ sessions: Array<Record<string, unknown>> }> }
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
  it('keeps a pane completed-unread after working until EyPc opens it', async () => {
    let now = 100
    const bridge = unreadModule.createUnreadBridge({ store: memoryStore(), now: () => now })
    await bridge.ready()
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

  it('does not treat a click during working as reading the later completion', async () => {
    let now = 100
    const bridge = unreadModule.createUnreadBridge({ store: memoryStore(), now: () => now })
    await bridge.ready()
    const working = live('working')
    inventory.collectSessions(working.worktrees, working.terminals, undefined, undefined, bridge)
    now = 150
    bridge.markViewed(PANE, 150)
    now = 200
    const done = live('done')
    expect(inventory.collectSessions(done.worktrees, done.terminals, undefined, undefined, bridge).sessions[0]?.unread)
      .toBe(true)
  })

  it('does not mark a cold already-done pane unread', async () => {
    const bridge = unreadModule.createUnreadBridge({ store: memoryStore(), now: () => 100 })
    await bridge.ready()
    const done = live('done')
    expect(inventory.collectSessions(done.worktrees, done.terminals, undefined, undefined, bridge).sessions[0]?.unread)
      .toBe(false)
  })

  it('lets an explicit CLI unread boolean win over the bridge', async () => {
    let now = 100
    const bridge = unreadModule.createUnreadBridge({ store: memoryStore(), now: () => now })
    await bridge.ready()
    inventory.collectSessions(live('working').worktrees, live('working').terminals, undefined, undefined, bridge)
    now = 200
    const explicitFalse = live('done', { unread: false })
    expect(inventory.collectSessions(explicitFalse.worktrees, explicitFalse.terminals, undefined, undefined, bridge).sessions[0]?.unread)
      .toBe(false)
    const explicitTrue = live('done', { unread: true })
    expect(inventory.collectSessions(explicitTrue.worktrees, explicitTrue.terminals, undefined, undefined, bridge).sessions[0]?.unread)
      .toBe(true)
  })

  it('can mark one finished sibling unread without guessing the other', async () => {
    let now = 100
    const bridge = unreadModule.createUnreadBridge({ store: memoryStore(), now: () => now })
    await bridge.ready()
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

  it('reloads persisted viewed receipts from storage', async () => {
    const store = memoryStore()
    let now = 100
    const first = unreadModule.createUnreadBridge({ store, now: () => now })
    await first.ready()
    first.observe([{ paneKey: PANE, state: 'working' }], 100)
    first.observe([{ paneKey: PANE, state: 'done' }], 200)
    first.markViewed(PANE, 300)
    await first.flush()
    const second = unreadModule.createUnreadBridge({ store, now: () => 400 })
    await second.ready()
    expect(second.recordFor(PANE)).toMatchObject({ seenWorkingAt: 100, completionEpoch: 200, viewedAt: 300 })
  })
})

describe('Orca unread persistence isolation', () => {
  it('batches 200 panes once per changed scan and skips unchanged done scans', async () => {
    let writes = 0
    const bridge = unreadModule.createUnreadBridge({ store: { getItem: () => null, setItem: () => { writes++ } } })
    await bridge.ready()
    const rows = Array.from({ length: 200 }, (_, i) => ({ paneKey: `${TAB}:00000000-0000-0000-0000-${String(i).padStart(12, '0')}`, state: 'working' }))
    bridge.observe(rows, 100)
    expect(writes).toBe(0)
    await bridge.flush()
    expect(writes).toBe(1)
    rows.forEach(row => { row.state = 'done' })
    bridge.observe(rows, 200)
    await bridge.flush()
    expect(writes).toBe(2)
    bridge.observe(rows, 300)
    await bridge.flush()
    expect(writes).toBe(2)
  })

  it('uses async document APIs with the existing value envelope and revision', async () => {
    let doc: any = { _id: 'eypc/orca/unread-bridge/v1', _rev: '1-old', value: { records: { [PANE]: { seenWorkingAt: 100, completionEpoch: 200, viewedAt: 0 } } } }
    let puts = 0
    const bridge = unreadModule.createUnreadBridge({ utools: {
      dbStorage: { getItem: () => { throw new Error('sync read forbidden') }, setItem: () => { throw new Error('sync write forbidden') } },
      db: { promises: { get: async () => doc, put: async (next: any) => {
        expect(next._rev).toBe(doc._rev)
        doc = { ...next, _rev: `${++puts}-new` }
        return { ok: true, rev: doc._rev }
      } } }
    } })
    await bridge.ready()
    expect(bridge.recordFor(PANE).completionEpoch).toBe(200)
    bridge.markViewed(PANE, 300)
    await bridge.flush()
    expect(puts).toBe(1)
    expect(doc.value.records[PANE].viewedAt).toBe(300)
  })

  it('coalesces changes behind one stalled writer and eventually saves the latest receipt', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const saved: any[] = []
    const bridge = unreadModule.createUnreadBridge({ store: { getItem: async () => null, setItem: async (_key: string, value: unknown) => {
      saved.push(value)
      if (saved.length === 1) await gate
    } } })
    await bridge.ready()
    bridge.observe([{ paneKey: PANE, state: 'working' }], 100)
    await Promise.resolve()
    bridge.observe([{ paneKey: PANE, state: 'done' }], 200)
    bridge.markViewed(PANE, 300)
    expect(saved).toHaveLength(1)
    release()
    await bridge.flush()
    expect(saved).toHaveLength(2)
    expect(saved[1].records[PANE]).toEqual({ seenWorkingAt: 100, completionEpoch: 200, viewedAt: 300 })
  })

  it('bounds a stalled initial read without overwriting unknown persistent receipts', async () => {
    let writes = 0
    let release!: (value: unknown) => void
    const bridge = unreadModule.createUnreadBridge({ loadTimeoutMs: 5, store: {
      getItem: () => new Promise(resolve => { release = resolve }), setItem: () => { writes++ }
    } })
    await bridge.ready()
    bridge.observe([{ paneKey: PANE, state: 'working' }], 100)
    bridge.observe([{ paneKey: PANE, state: 'done' }], 200)
    release({ records: {} })
    await bridge.flush()
    expect(bridge.recordFor(PANE).completionEpoch).toBe(200)
    expect(writes).toBe(0)
    expect(bridge.persistenceStatus()).toMatchObject({ writable: false, error: 'load-timeout' })
  })

  it('keeps failed writes dirty and retries on the next unchanged observation', async () => {
    let writes = 0
    const bridge = unreadModule.createUnreadBridge({ store: { getItem: () => null, setItem: async () => {
      if (++writes === 1) throw new Error('unavailable')
    } } })
    await bridge.ready()
    bridge.observe([{ paneKey: PANE, state: 'working' }], 100)
    bridge.observe([{ paneKey: PANE, state: 'done' }], 200)
    await bridge.flush()
    expect(writes).toBe(1)
    expect(bridge.persistenceStatus()).toMatchObject({ dirty: true, error: 'write-failed' })
    bridge.observe([{ paneKey: PANE, state: 'done' }], 300)
    await bridge.flush()
    expect(writes).toBe(2)
    expect(bridge.persistenceStatus()).toMatchObject({ dirty: false, error: null })
  })
})

 it('waits for stored receipts before projecting the first inventory', async () => {
    let release!: (value: unknown) => void
    const bridge = unreadModule.createUnreadBridge({ store: {
      getItem: () => new Promise(resolve => { release = resolve }), setItem: async () => true
    } })
    const done = live('done')
    const reader = inventory.createInventoryReader({
      unreadBridge: bridge,
      nativeState: { pinnedTabIds: () => new Set() },
      cli: { json: async (args: string[]) => ({ ok: true, result: args[0] === 'worktree'
        ? { worktrees: done.worktrees } : { terminals: done.terminals } }) }
    })
    let settled = false
    const pending = reader.readInventory().then(value => { settled = true; return value })
    await Promise.resolve()
    await Promise.resolve()
    expect(settled).toBe(false)
    release({ records: { [PANE]: { seenWorkingAt: 100, completionEpoch: 200, viewedAt: 0 } } })
    expect((await pending).sessions[0]?.unread).toBe(true)
  })
