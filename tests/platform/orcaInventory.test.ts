import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require_ = createRequire(import.meta.url)
const inventory = require_(resolve(process.cwd(), 'preload/orca/inventory.cjs')) as {
  collectSessions: (
    worktrees: unknown[],
    terminals: unknown[],
    visualLayouts?: unknown
  ) => { sessions: Array<Record<string, unknown>>; truncated: boolean }
  fingerprintOf: (sessions: unknown[]) => string
  displayTitle: (title: string, agentType: string, repoName: string, tabTitle?: string) => string
  indexTabTitles: (visualLayouts: unknown) => Map<string, string>
  oscIndicatesWorking: (title: string) => boolean
  createInventoryReader: (dependencies: { cli: { available?: boolean; json: (args: string[]) => Promise<unknown> } }) => {
    readInventory: () => Promise<{ sessions: Array<Record<string, unknown>>; available: boolean }>
  }
}

const TAB = '2e625d72-50d4-473d-854d-e6faa62e4039'
const LEAF = 'e971fc98-d84d-43c4-ae40-ef3877e16485'
const HANDLE = 'term_056d6ca9-312c-4a27-8025-9cffd5d01297'
const NEW_TAB = '59c6d4f8-543c-4634-b15a-bd00ccde5581'
const NEW_LEAF = 'f0f3e4c5-aaaa-4bbb-8ccc-dddddddddddd'

describe('Orca agent inventory', () => {
  it('joins live agents with terminal handles and drops conversation bodies', () => {
    const { sessions } = inventory.collectSessions([{
      repo: 'EyPc',
      displayName: 'main',
      unread: true,
      isPinned: true,
      lastActivityAt: 100,
      agents: [{
        paneKey: `${TAB}:${LEAF}`,
        state: 'working',
        stateStartedAt: 150,
        agentType: 'grok',
        prompt: 'SECRET PROMPT',
        lastAssistantMessage: 'SECRET REPLY',
        toolInput: 'SECRET TOOL',
        updatedAt: 200
      }]
    }], [{
      handle: HANDLE,
      tabId: TAB,
      leafId: LEAF,
      title: '⠋ Grok',
      connected: true,
      agentIdentity: 'grok',
      lastOutputAt: 200,
      preview: 'SECRET BUFFER'
    }])
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({
      paneKey: `${TAB}:${LEAF}`,
      handle: HANDLE,
      agentType: 'grok',
      state: 'working',
      unread: false,
      pinned: true,
      stateStartedAt: 150,
      projectName: 'EyPc'
    })
    expect(JSON.stringify(sessions[0])).not.toMatch(/SECRET/)
    expect(sessions[0].name).toBe('gr · EyPc')
    expect(sessions[0].name).not.toMatch(/Grok/i)
  })

  it('uses CodexHost harness abbreviations in titles', () => {
    expect(inventory.displayTitle('⠋ Grok', 'grok', 'EyPc')).toBe('gr · EyPc')
    expect(inventory.displayTitle('260913-CPP-推送czz-dev工作分支 - grok', 'grok', 'CodexPlusPlus'))
      .toBe('gr · 260913-CPP-推送czz-dev工作分支')
    expect(inventory.displayTitle('Cursor ready', 'cursor', 'CodeNote')).toBe('cs · Cursor ready')
    expect(inventory.displayTitle('gr · already prefixed', 'grok', 'EyPc')).toBe('gr · already prefixed')
    expect(inventory.displayTitle('⠋ Grok', 'grok', 'EyPc', '260914-EYPC-任务已读仍进行中'))
      .toBe('gr · 260914-EYPC-任务已读仍进行中')
  })

  it('prefers Orca tab titles over spinner OSC titles and keeps two EyPc panes distinct', () => {
    const { sessions } = inventory.collectSessions([{
      repo: 'EyPc',
      agents: [
        { paneKey: `${TAB}:${LEAF}`, state: 'done', agentType: 'grok', updatedAt: 100 },
        { paneKey: `${NEW_TAB}:${NEW_LEAF}`, state: 'working', agentType: 'grok', updatedAt: 200 }
      ]
    }], [
      { handle: HANDLE, tabId: TAB, leafId: LEAF, title: 'EVPC Orca task monitoring - grok', connected: true, agentIdentity: 'grok' },
      {
        handle: 'term_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        tabId: NEW_TAB,
        leafId: NEW_LEAF,
        title: '⠋ Grok',
        connected: true,
        agentIdentity: 'grok'
      }
    ], [{
      worktreePath: '/SECRET/PATH/EyPc',
      root: {
        tabs: [
          {
            tabId: TAB,
            activeLeafId: LEAF,
            title: '260914-EYPC-Orca状态同步',
            panes: { tabId: TAB, leafId: LEAF, handle: HANDLE, type: 'leaf', title: 'EVPC Orca task monitoring - grok' }
          },
          {
            tabId: NEW_TAB,
            activeLeafId: NEW_LEAF,
            title: '260914-EYPC-任务已读仍进行中',
            panes: {
              tabId: NEW_TAB,
              leafId: NEW_LEAF,
              handle: 'term_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              type: 'leaf',
              title: '⠋ Grok'
            }
          }
        ]
      }
    }])
    expect(sessions.map((row) => [row.state, row.name])).toEqual([
      ['done', 'gr · 260914-EYPC-Orca状态同步'],
      ['working', 'gr · 260914-EYPC-任务已读仍进行中']
    ])
    expect(JSON.stringify(sessions)).not.toMatch(/SECRET/)
  })

  it('does not let pane OSC titles overwrite tab custom titles', () => {
    const titles = inventory.indexTabTitles([{
      root: {
        tabs: [{
          tabId: NEW_TAB,
          activeLeafId: NEW_LEAF,
          title: '260914-EYPC-插件标题未同步',
          panes: {
            tabId: NEW_TAB,
            leafId: NEW_LEAF,
            handle: HANDLE,
            type: 'leaf',
            title: '⠋ Grok'
          }
        }]
      }
    }])
    expect(titles.get(NEW_TAB)).toBe('260914-EYPC-插件标题未同步')
  })

  it('asks terminal list for visual layouts and falls back without them', async () => {
    const calls: string[][] = []
    const reader = inventory.createInventoryReader({
      cli: {
        json: async (args: string[]) => {
          calls.push(args)
          if (args[0] === 'worktree') {
            return { ok: true, result: { worktrees: [{ repo: 'EyPc', agents: [{ paneKey: `${TAB}:${LEAF}`, state: 'working', agentType: 'grok' }] }] } }
          }
          if (args.includes('--include-visual-layouts')) {
            return { ok: false, error: { code: 'unknown-option' } }
          }
          return {
            ok: true,
            result: {
              terminals: [{ handle: HANDLE, tabId: TAB, leafId: LEAF, title: '⠋ Grok', connected: true, agentIdentity: 'grok' }]
            }
          }
        }
      }
    })
    const snapshot = await reader.readInventory()
    expect(calls.some((args) => args.includes('--include-visual-layouts'))).toBe(true)
    expect(calls.some((args) => args[0] === 'terminal' && args[1] === 'list' && !args.includes('--include-visual-layouts'))).toBe(true)
    expect(snapshot.sessions[0]).toMatchObject({ state: 'working', name: 'gr · EyPc' })
  })

  it('skips plain shells and archived worktrees', () => {
    const { sessions } = inventory.collectSessions([{
      repo: 'shell',
      isArchived: true,
      agents: [{ paneKey: `${TAB}:${LEAF}`, state: 'done', agentType: 'grok' }]
    }], [{
      handle: HANDLE,
      tabId: TAB,
      leafId: LEAF,
      title: 'Terminal 1',
      connected: true
    }])
    expect(sessions).toEqual([])
  })

  it('does not fan worktree unread onto every agent in the group', () => {
    const leafB = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const leafC = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    const leafD = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    const { sessions } = inventory.collectSessions([{
      repo: 'CodeNote',
      unread: true,
      worktreeId: 'codenote-master',
      agents: [
        { paneKey: `${TAB}:${LEAF}`, state: 'done', agentType: 'grok', updatedAt: 10, stateStartedAt: 10 },
        { paneKey: `${TAB}:${leafB}`, state: 'done', agentType: 'grok', updatedAt: 40, stateStartedAt: 40 },
        { paneKey: `${TAB}:${leafC}`, state: 'done', agentType: 'grok', updatedAt: 20, stateStartedAt: 20 },
        { paneKey: `${TAB}:${leafD}`, state: 'working', agentType: 'grok', updatedAt: 50, stateStartedAt: 50 }
      ]
    }], [
      { handle: HANDLE, tabId: TAB, leafId: LEAF, title: 'old', connected: true, agentIdentity: 'grok' },
      { handle: 'term_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', tabId: TAB, leafId: leafB, title: 'newest done', connected: true, agentIdentity: 'grok' },
      { handle: 'term_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', tabId: TAB, leafId: leafC, title: 'mid', connected: true, agentIdentity: 'grok' },
      { handle: 'term_cccccccc-cccc-4ccc-8ccc-cccccccccccc', tabId: TAB, leafId: leafD, title: '⠋ Grok', connected: true, agentIdentity: 'grok' }
    ])
    expect(sessions.map((row) => [row.state, row.unread])).toEqual([
      ['done', false],
      ['done', true],
      ['done', false],
      ['working', false]
    ])
  })

  it('treats Grok waiting-for-response OSC frames as working before any tool output', () => {
    expect(inventory.oscIndicatesWorking('⠋ Grok')).toBe(true)
    expect(inventory.oscIndicatesWorking('⠋ - Waiting for response… - grok')).toBe(true)
    expect(inventory.oscIndicatesWorking('. investigating the failing test')).toBe(true)
    expect(inventory.oscIndicatesWorking('Check Unimplemented Prior Requirements B… - grok')).toBe(false)
    const { sessions } = inventory.collectSessions([{
      repo: 'AnyDrag',
      unread: true,
      agents: [{
        paneKey: `${TAB}:${LEAF}`,
        state: 'done',
        agentType: 'grok',
        stateStartedAt: 100,
        updatedAt: 100
      }]
    }], [{
      handle: HANDLE,
      tabId: TAB,
      leafId: LEAF,
      title: '⠋ Grok',
      connected: true,
      agentIdentity: 'grok',
      lastOutputAt: 160
    }], [{
      root: {
        tabs: [{
          tabId: TAB,
          activeLeafId: LEAF,
          title: '260913-AD-触发辅助功能授权',
          panes: { tabId: TAB, leafId: LEAF, handle: HANDLE, type: 'leaf', title: '⠋ Grok' }
        }]
      }
    }])
    expect(sessions[0]).toMatchObject({
      state: 'working',
      name: 'gr · 260913-AD-触发辅助功能授权',
      lastUpdatedAt: 160,
      stateStartedAt: 160
    })
  })

  it('maps interrupted and disconnected agents to interrupted', () => {
    const otherLeaf = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const { sessions } = inventory.collectSessions([{
      repo: 'CodeNote',
      agents: [
        { paneKey: `${TAB}:${LEAF}`, state: 'done', agentType: 'grok', interrupted: true, updatedAt: 1 },
        { paneKey: `${TAB}:${otherLeaf}`, state: 'done', agentType: 'cursor', updatedAt: 2 }
      ]
    }], [
      { handle: HANDLE, tabId: TAB, leafId: LEAF, title: 'done', connected: true, agentIdentity: 'grok' },
      { handle: 'term_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', tabId: TAB, leafId: otherLeaf, title: 'Cursor ready', connected: false, agentIdentity: 'cursor' }
    ])
    expect(sessions.map((row) => [row.agentType, row.state])).toEqual([
      ['grok', 'interrupted'],
      ['cursor', 'interrupted']
    ])
  })

  it('fingerprints only whitelist fields', () => {
    const session = {
      paneKey: `${TAB}:${LEAF}`,
      handle: HANDLE,
      agentType: 'grok',
      name: 't',
      state: 'done',
      unread: false,
      pinned: false,
      connected: true,
      lastUpdatedAt: 1,
      projectName: 'EyPc'
    }
    expect(inventory.fingerprintOf([session])).toBe(inventory.fingerprintOf([{ ...session, extra: 'nope' }]))
  })
})
