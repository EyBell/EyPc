import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require_ = createRequire(import.meta.url)
const { createOrcaBridge, ORCA_QUIET_RECOVERY_MS } = require_(resolve('preload/orca/index.cjs'))
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
  it('reads once on a signature change and reuses that snapshot', async () => {
    let signature = '1:10'
    let state = 'done'
    let now = 5_000
    let calls = 0
    const ticks: Array<() => void> = []
    const bridge = createOrcaBridge({
      ...fixture('done'),
      statWake: () => signature,
      now: () => now,
      setInterval: (fn: () => void) => { ticks.push(fn); return 1 },
      clearInterval: () => {},
      cli: {
        json: async (args: string[]) => {
          calls += 1
          return fixture(state).cli.json(args)
        }
      }
    })
    try {
      let reads = 0
      bridge.watchInventory(() => { reads += 1; void bridge.readInventory() })
      await flush()
      expect(calls).toBe(2)
      expect(reads).toBe(1)
      const afterNotice = calls
      ticks[0]()
      await flush()
      expect(calls).toBe(afterNotice)
      signature = '2:10'
      state = 'working'
      ticks[0]()
      await flush()
      expect(calls).toBe(afterNotice + 2)
      expect(reads).toBe(2)
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
