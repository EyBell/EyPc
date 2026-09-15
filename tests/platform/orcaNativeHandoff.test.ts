import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
const require_ = createRequire(import.meta.url)
const { createOrcaBridge } = require_(resolve('preload/orca/index.cjs'))
const TAB = '2e625d72-50d4-473d-854d-e6faa62e4039'
const LEAF = 'e971fc98-d84d-43c4-ae40-ef3877e16485'
const PANE = `${TAB}:${LEAF}`
const HANDLE = 'term_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

describe('Orca native unread handoff', () => {
  it.each([true, false])('preserves native unread=%s across a dispatched open', async unread => {
    let nativeUnread = unread
    let marked = 0
    const bridge = createOrcaBridge({
      platform: 'test',
      unreadBridge: { ready: async () => {}, observe: () => {}, markViewed: () => { marked++ } },
      cli: { json: async (args: string[]) => ({ ok: true, result: args[0] === 'worktree'
        ? { worktrees: [{ repo: 'fixture', agents: [{ paneKey: PANE, agentType: 'grok', state: 'done', unread: nativeUnread }] }] }
        : args[1] === 'switch' ? { focus: { handle: HANDLE, navigated: true } }
        : { terminals: [{ handle: HANDLE, tabId: TAB, leafId: LEAF, title: 'done', agentIdentity: 'grok', connected: true }] } }) }
    })
    try {
      const initial = await bridge.readInventory()
      expect(initial.sessions[0].unread).toBe(unread)
      expect(await bridge.openTask(PANE)).toMatchObject({ outcome: 'dispatched', confirmsRead: false })
      expect(initial.sessions[0].unread).toBe(unread)
      expect(marked).toBe(0)
      nativeUnread = false
      expect((await bridge.readInventory()).sessions[0].unread).toBe(false)
    } finally { bridge.close() }
  })
})
