import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require_ = createRequire(import.meta.url)
const { createOrcaBridge, ORCA_QUIET_RECOVERY_MS, ORCA_LIVE_RECOVERY_MS, readWakeEntriesFromFile } = require_(resolve('preload/orca/index.cjs'))
const TAB = '2e625d72-50d4-473d-854d-e6faa62e4039'
const LEAF = 'e971fc98-d84d-43c4-ae40-ef3877e16485'
const PANE = `${TAB}:${LEAF}`

function fixture(state: string) {
  return {
    cli: {
      json: async (args: string[]) => ({
        ok: true,
        result: args[0] === 'worktree'
          ? { worktrees: [{ repo: 'fixture', agents: [{ paneKey: PANE, agentType: 'cursor', state, unread: false }] }] }
          : { terminals: [{ handle: 'term_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', tabId: TAB, leafId: LEAF, title: 'task', agentIdentity: 'cursor', connected: true }] }
      })
    },
    unreadBridge: { ready: async () => {}, observe: () => {}, markViewed: () => {} },
    watchWake: () => ({ close() {} })
  }
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

describe('Orca status wake', () => {
  it('drops prompt and tool arguments before returning a wake row', () => {
    const fs = require('node:fs')
    const os = require('node:os')
    const path = require('node:path')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eypc-wake-'))
    const file = path.join(dir, 'last-status.json')
    const secret = 'secret-prompt-should-not-leak'
    fs.writeFileSync(file, JSON.stringify({
      version: 2,
      entries: {
        [PANE]: {
          paneKey: PANE,
          payload: { state: 'working', prompt: secret, agentType: 'cursor', toolName: 'Shell', toolInput: secret }
        }
      }
    }))
    try {
      const rows = readWakeEntriesFromFile(file, fs)
      expect(rows[0].state).toBe('working')
      expect(rows[0].toolName).toBe('Shell')
      expect(JSON.stringify(rows)).not.toContain(secret)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('projects a signature change onto phase without another CLI read', async () => {
    let signature = '1:10'
    let state = 'done'
    let now = 5_000
    let calls = 0
    const ticks: Array<() => void> = []
    const bridge = createOrcaBridge({
      ...fixture('done'),
      statWake: () => signature,
      readWakeEntries: () => [{ paneKey: PANE, state, agentType: 'cursor', toolName: '', interrupted: false, stateStartedAt: 4_000 }],
      now: () => now,
      setInterval: (fn: () => void) => { ticks.push(fn); return 1 },
      clearInterval: () => {},
      cli: {
        json: async (args: string[]) => {
          calls += 1
          return fixture('done').cli.json(args)
        }
      }
    })
    try {
      let reads = 0
      let seen = null as Promise<any> | null
      bridge.watchInventory(() => { reads += 1; seen = bridge.readInventory() })
      await flush()
      expect(calls).toBe(2)
      expect(reads).toBe(1)
      ticks[0]()
      await flush()
      expect(calls).toBe(2)
      signature = '2:11'
      state = 'working'
      ticks[0]()
      await flush()
      expect(calls).toBe(2)
      expect(reads).toBe(2)
      const snapshot = await seen
      expect(snapshot.sessions[0].state).toBe('working')
      expect(calls).toBe(2)
    } finally { bridge.close() }
  })

  it('does not let a stale done wake clear a Grok card held working by OSC', async () => {
    let signature = '1:10'
    const ticks: Array<() => void> = []
    const bridge = createOrcaBridge({
      platform: 'test',
      unreadBridge: { ready: async () => {}, observe: () => {}, markViewed: () => {} },
      watchWake: () => ({ close() {} }),
      statWake: () => signature,
      readWakeEntries: () => [{ paneKey: PANE, state: 'done', agentType: 'grok', toolName: '', interrupted: false, stateStartedAt: 1 }],
      now: () => 5_000,
      setInterval: (fn: () => void) => { ticks.push(fn); return 1 },
      clearInterval: () => {},
      cli: {
        json: async (args: string[]) => ({
          ok: true,
          result: args[0] === 'worktree'
            ? { worktrees: [{ repo: 'fixture', agents: [{ paneKey: PANE, agentType: 'grok', state: 'done', unread: false }] }] }
            : { terminals: [{ handle: 'term_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', tabId: TAB, leafId: LEAF, title: '⠋ Grok', agentIdentity: 'grok', connected: true }] }
        })
      }
    })
    try {
      let seen = null as Promise<any> | null
      bridge.watchInventory(() => { seen = bridge.readInventory() })
      await flush()
      const before = await seen
      expect(before.sessions[0].state).toBe('working')
      signature = '2:10'
      ticks[0]()
      await flush()
      expect(before.sessions[0].state).toBe('working')
    } finally { bridge.close() }
  })

  it('settles a turn leaving working with one CLI read and ignores closed panes afterwards', async () => {
    const STALE = `${TAB}:00000000-0000-4000-8000-000000000000`
    let signature = '1:10'
    let state = 'working'
    let calls = 0
    const ticks: Array<() => void> = []
    const bridge = createOrcaBridge({
      ...fixture('working'),
      statWake: () => signature,
      readWakeEntries: () => [
        { paneKey: PANE, state, agentType: 'cursor', toolName: '', interrupted: false, stateStartedAt: 4_000 },
        { paneKey: STALE, state: 'done', agentType: 'cursor', toolName: '', interrupted: false, stateStartedAt: 1 }
      ],
      now: () => 5_000,
      setInterval: (fn: () => void) => { ticks.push(fn); return 1 },
      clearInterval: () => {},
      cli: { json: async (args: string[]) => { calls += 1; return fixture(state).cli.json(args) } }
    })
    try {
      bridge.watchInventory(() => {})
      await flush()
      ticks[0]()
      await flush()
      const started = calls
      signature = '2:10'
      ticks[0]()
      await flush()
      expect(calls).toBe(started + 2)
      signature = '3:10'
      state = 'done'
      ticks[0]()
      await flush()
      expect(calls).toBe(started + 4)
      expect((await bridge.readInventory()).sessions[0].state).toBe('done')
      signature = '4:10'
      ticks[0]()
      await flush()
      expect(calls).toBe(started + 4)
    } finally { bridge.close() }
  })

  it('keeps the fast cadence while a live pane is missing from the status file', async () => {
    let now = 5_000
    let calls = 0
    const ticks: Array<() => void> = []
    const bridge = createOrcaBridge({
      ...fixture('working'),
      statWake: () => 'same',
      readWakeEntries: () => [],
      now: () => now,
      setInterval: (fn: () => void) => { ticks.push(fn); return 1 },
      clearInterval: () => {},
      cli: { json: async (args: string[]) => { calls += 1; return fixture('working').cli.json(args) } }
    })
    try {
      bridge.watchInventory(() => {})
      await flush()
      const started = calls
      now += ORCA_LIVE_RECOVERY_MS
      ticks[0]()
      await flush()
      expect(calls).toBe(started + 2)
    } finally { bridge.close() }
  })

  it('full-reads on the quiet recovery interval when the signature stays put', async () => {
    let now = 5_000
    let calls = 0
    const ticks: Array<() => void> = []
    const bridge = createOrcaBridge({
      ...fixture('done'),
      statWake: () => 'same',
      now: () => now,
      setInterval: (fn: () => void) => { ticks.push(fn); return 1 },
      clearInterval: () => {},
      cli: {
        json: async (args: string[]) => {
          calls += 1
          return fixture('done').cli.json(args)
        }
      }
    })
    try {
      bridge.watchInventory(() => {})
      await flush()
      const started = calls
      ticks[0]()
      await flush()
      expect(calls).toBe(started)
      now += ORCA_QUIET_RECOVERY_MS
      ticks[0]()
      await flush()
      expect(calls).toBe(started + 2)
    } finally { bridge.close() }
  })
})
