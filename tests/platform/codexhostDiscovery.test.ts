import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const discoveryModule = require('../../preload/codex/codexhost-discovery.cjs') as {
  CODEXHOST_LIST_TTL_MS: number
  codexhostHarnessLabel(value: unknown): string
  projectHostConnector(thread: Record<string, any>): { type: string; activeFlags?: string[] }
  projectHostTurn(thread: Record<string, any>, at: number): Record<string, any>
  compareHostDesktopUnread(known: Record<string, any>, input?: Record<string, any>): Record<string, any>
  createCodexhostDiscovery(dependencies?: Record<string, unknown>): {
    codexhostRowsForScan(input?: Record<string, unknown>): Promise<{
      rows: Array<Record<string, any>>
      turns: Map<string, Record<string, any>>
    }>
    isExternalThreadId(threadId: string): boolean
    isExternalThreadKey(key: string): boolean
    honorExternalProjection(threadId: string, known: Record<string, any>, activity: Record<string, any>): Record<string, any>
    compareHostDesktopUnread(known: Record<string, any>, input?: Record<string, any>): Record<string, any>
    codexhostResetDiscovery(): void
  }
}

const RUNTIME_PID = 29660
const CHILD_PID = 29678
const ENDPOINT = 'http://127.0.0.1:58874'
const TOKEN = 'c0'.repeat(32)
const CLI = '/Users/tester/.local/bin/codexhost'
const PI_ID = '97417b4a-2d81-4234-9f9b-4ff799a01f9f'
const CLAUDE_ID = 'a81b5e79-bc0d-4cad-b408-51ae1a884243'
const NATIVE_ID = '01a052cb-77fa-7fd3-8acd-cb7e45f659ee'

function processTable() {
  return [
    `29444 /opt/codex-host/target/debug/codexhost launch --shim x --host-runtime /opt/codex-host/packages/host-runtime/dist/main.js`,
    `29445 /usr/bin/open -n --env CODEXHOST_HOST_RUNTIME_PATH=/opt/codex-host/packages/host-runtime/dist/main.js /Applications/ChatGPT.app`,
    `${RUNTIME_PID} /opt/node/bin/node /opt/codex-host/packages/host-runtime/dist/main.js -c features.x=1 app-server --analytics-default-enabled`
  ].join('\n')
}

function listPayload() {
  return JSON.stringify({
    threads: [
      { threadId: CLAUDE_ID, harnessId: 'claude-code', status: 'running', cwd: '/repo/gonavi', title: '260901-供应商调优', attention: 'approval' },
      { threadId: PI_ID, harnessId: 'pi', status: 'running', cwd: '/repo/gonavi', title: '你好', attention: 'input' },
      { threadId: NATIVE_ID, harnessId: 'codex', status: 'completed', cwd: '/repo/gonavi', title: '原生任务' },
      { threadId: 'not-a-thread-id', harnessId: 'pi', status: 'completed', cwd: '/repo/gonavi', title: 'x' }
    ],
    nextCursor: null
  })
}

function fakeExecFile(calls: Array<{ command: string; args: string[] }>, options: { failList?: boolean; list?: () => string } = {}) {
  return (command: string, args: string[], _settings: unknown, done: (error: Error | null, stdout?: string) => void) => {
    calls.push({ command, args })
    if (command === 'ps' && args[0] === '-axww') return done(null, processTable())
    if (command === 'pgrep') return done(null, `${CHILD_PID}\n`)
    if (command === 'ps' && args[0] === 'eww') {
      return done(null, `${CHILD_PID} node adapter CODEXHOST_RUNTIME_ENDPOINT=${ENDPOINT} CODEXHOST_RUNTIME_TOKEN=${TOKEN} CODEXHOST_CLI_PATH=${CLI}`)
    }
    if (command === CLI) {
      if (options.failList) return done(null, JSON.stringify({ error: { code: 'RUNTIME_UNREACHABLE', message: 'x' } }))
      return done(null, options.list ? options.list() : listPayload())
    }
    return done(new Error('unexpected command'))
  }
}

describe('codexhost external conversation discovery', () => {
  it('maps every Host list status onto the companion connector/turn shape', () => {
    const at = 1_000
    expect(discoveryModule.projectHostConnector({ status: 'creating' })).toEqual({ type: 'active', activeFlags: [] })
    expect(discoveryModule.projectHostTurn({ status: 'creating' }, at)).toEqual({ status: 'inProgress', startedAt: at })

    expect(discoveryModule.projectHostConnector({ status: 'running' })).toEqual({ type: 'active', activeFlags: [] })
    expect(discoveryModule.projectHostTurn({ status: 'running' }, at)).toEqual({ status: 'inProgress', startedAt: at })

    expect(discoveryModule.projectHostConnector({ status: 'running', awaitingInput: true })).toEqual({
      type: 'active',
      activeFlags: ['waitingOnUserInput']
    })
    expect(discoveryModule.projectHostTurn({ status: 'running', awaitingInput: true }, at)).toEqual({
      status: 'inProgress',
      startedAt: at
    })

    expect(discoveryModule.projectHostConnector({ status: 'running', awaitingApproval: true })).toEqual({
      type: 'active',
      activeFlags: ['waitingOnApproval']
    })

    expect(discoveryModule.projectHostConnector({ status: 'interrupted', awaitingInput: true })).toEqual({
      type: 'active',
      activeFlags: ['waitingOnUserInput']
    })

    expect(discoveryModule.projectHostConnector({ status: 'interrupted' })).toEqual({ type: 'idle' })
    expect(discoveryModule.projectHostTurn({ status: 'interrupted' }, at)).toEqual({
      status: 'interrupted',
      startedAt: at,
      completedAt: at
    })

    expect(discoveryModule.projectHostConnector({ status: 'failed' })).toEqual({ type: 'idle' })
    expect(discoveryModule.projectHostTurn({ status: 'failed' }, at)).toEqual({
      status: 'failed',
      startedAt: at,
      completedAt: at
    })

    expect(discoveryModule.projectHostConnector({ status: 'completed' })).toEqual({ type: 'idle' })
    expect(discoveryModule.projectHostTurn({ status: 'completed' }, at)).toEqual({
      status: 'completed',
      startedAt: at,
      completedAt: at
    })
  })

  it('labels harnesses with compressed prefixes', () => {
    expect(discoveryModule.codexhostHarnessLabel('pi')).toBe('pi')
    expect(discoveryModule.codexhostHarnessLabel('claude-code')).toBe('cc')
    expect(discoveryModule.codexhostHarnessLabel('grok')).toBe('gr')
    expect(discoveryModule.codexhostHarnessLabel('dsh')).toBe('ds')
    expect(discoveryModule.codexhostHarnessLabel('omp')).toBe('op')
    expect(discoveryModule.codexhostHarnessLabel('cursor')).toBe('cs')
    expect(discoveryModule.codexhostHarnessLabel('mystery')).toBe('mystery')
  })

  it('discovers the rendezvous from runtime children and shapes external rows with synthetic turns', async () => {
    const calls: Array<{ command: string; args: string[] }> = []
    let clock = 1_000_000
    const discovery = discoveryModule.createCodexhostDiscovery({
      execFile: fakeExecFile(calls),
      now: () => clock
    })
    const result = await discovery.codexhostRowsForScan({
      roots: ['/repo/gonavi'],
      threadKey: (threadId: string) => `key:${threadId}`
    })

    const listCall = calls.find((call) => call.command === CLI)
    expect(listCall?.args).toEqual(['thread', 'list', '--limit', '50', '--sort', 'recency-desc', '--all', 'true'])

    // Native codex threads and invalid ids are excluded; harness rows remain.
    expect(result.rows.map((row) => row.id).sort()).toEqual([NATIVE_ID < PI_ID ? PI_ID : PI_ID, CLAUDE_ID].sort())
    const claudeRow = result.rows.find((row) => row.id === CLAUDE_ID)!
    expect(claudeRow).toMatchObject({
      name: 'cc · 260901-供应商调优',
      // A pending Desktop approval maps to the waiting-approval flag so the
      // row lands in the attention group instead of a plain "running".
      status: { type: 'active', activeFlags: ['waitingOnApproval'] },
      cwd: '/repo/gonavi',
      codexhostExternal: true,
      codexhostHarnessId: 'claude-code'
    })
    expect(result.turns.get(CLAUDE_ID)).toMatchObject({ status: 'inProgress' })
    expect(result.turns.get(PI_ID)).toMatchObject({ status: 'inProgress' })
    const piRow = result.rows.find((row) => row.id === PI_ID)!
    expect(piRow).toMatchObject({
      name: 'pi · 你好',
      status: { type: 'active', activeFlags: ['waitingOnUserInput'] },
      codexhostExternal: true,
      codexhostHarnessId: 'pi'
    })
    expect(piRow).not.toHaveProperty('codexhostHasUnreadTurn')
    expect(claudeRow).not.toHaveProperty('codexhostHasUnreadTurn')
    expect(result.turns.get(PI_ID)).not.toHaveProperty('completedAt')
    expect(discovery.isExternalThreadId(PI_ID)).toBe(true)
    expect(discovery.isExternalThreadId(NATIVE_ID)).toBe(false)
    expect(discovery.isExternalThreadKey(`key:${PI_ID}`)).toBe(true)

    // A running extra process uses a 1s TTL, so a half-second scan still
    // serves the snapshot. Completion must not wait on the idle 12s cache.
    const callCount = calls.length
    clock += 500
    await discovery.codexhostRowsForScan({ roots: ['/repo/gonavi'] })
    expect(calls.length).toBe(callCount)

    const preserved = discovery.honorExternalProjection(PI_ID, {
      connectorActiveFlags: ['waitingOnUserInput'],
      connectorWaitingSince: 9
    }, { status: 'active', activeFlags: [] })
    expect(preserved).toMatchObject({
      status: 'active',
      activeFlags: ['waitingOnUserInput'],
      waitingSince: 9
    })

    discovery.codexhostResetDiscovery()
    expect(discovery.isExternalThreadId(PI_ID)).toBe(false)
  })

  it('refreshes a running extra process so Host completion is not stuck behind the idle TTL', async () => {
    const calls: Array<{ command: string; args: string[] }> = []
    let clock = 2_000_000
    let completed = false
    const discovery = discoveryModule.createCodexhostDiscovery({
      execFile: fakeExecFile(calls, {
        list: () => JSON.stringify({
          threads: [{
            threadId: PI_ID,
            harnessId: 'pi',
            status: completed ? 'completed' : 'running',
            cwd: '/repo/gonavi',
            title: '你好',
            hasUnreadTurn: completed
          }],
          nextCursor: null
        })
      }),
      now: () => clock
    })
    const first = await discovery.codexhostRowsForScan({ roots: ['/repo/gonavi'] })
    expect(first.rows[0]).toMatchObject({ status: { type: 'active' } })
    expect(first.turns.get(PI_ID)).toMatchObject({ status: 'inProgress' })

    completed = true
    clock += 1_001
    const second = await discovery.codexhostRowsForScan({ roots: ['/repo/gonavi'] })
    expect(second.rows[0]).toMatchObject({
      status: { type: 'idle' },
      codexhostHasUnreadTurn: true
    })
    expect(second.turns.get(PI_ID)).toMatchObject({ status: 'completed' })
  })

  it('fails open when the CLI answers with an error and drops the rendezvous', async () => {
    const calls: Array<{ command: string; args: string[] }> = []
    const discovery = discoveryModule.createCodexhostDiscovery({
      execFile: fakeExecFile(calls, { failList: true }),
      now: () => 5_000_000
    })
    const result = await discovery.codexhostRowsForScan({ roots: ['/repo/gonavi'] })
    expect(result.rows).toEqual([])
    expect(result.turns.size).toBe(0)
  })

  it('compares extra-process unread with Codex Desktop live unread', () => {
    const hostUnread = {
      connectorHasUnreadTurn: true,
      connectorUnreadAuthority: 'desktop-persisted'
    }
    const hostRead = {
      connectorHasUnreadTurn: false,
      connectorUnreadAuthority: 'desktop-persisted'
    }

    expect(discoveryModule.compareHostDesktopUnread(hostUnread, {
      connected: true,
      shadow: { hasUnreadTurn: false, unreadEvidence: 'event' }
    })).toEqual({ hasUnreadTurn: false, unreadAuthority: 'desktop-live' })
    expect(discoveryModule.compareHostDesktopUnread(hostRead, {
      connected: true,
      shadow: { hasUnreadTurn: true, unreadEvidence: 'event' }
    })).toEqual({ hasUnreadTurn: true, unreadAuthority: 'desktop-live' })
    expect(discoveryModule.compareHostDesktopUnread(hostUnread, {
      connected: true,
      shadow: { hasUnreadTurn: false, unreadEvidence: 'snapshot' }
    })).toEqual({ hasUnreadTurn: false, unreadAuthority: 'desktop-live' })
    expect(discoveryModule.compareHostDesktopUnread(hostUnread, { connected: false }))
      .toEqual({ hasUnreadTurn: true, unreadAuthority: 'desktop-persisted' })
    expect(discoveryModule.compareHostDesktopUnread({}, { connected: true }))
      .toEqual({ hasUnreadTurn: false, unreadAuthority: 'unavailable' })
    expect(discoveryModule.compareHostDesktopUnread(hostUnread, {
      connected: false,
      liveUnread: { hasUnreadTurn: false, ownerClientId: 'eypc-open' }
    })).toEqual({ hasUnreadTurn: false, unreadAuthority: 'desktop-live' })
  })

  it('fails open with no runtime process at all', async () => {
    const discovery = discoveryModule.createCodexhostDiscovery({
      execFile: (_c: string, _a: string[], _s: unknown, done: (e: Error | null, out?: string) => void) => done(null, ''),
      now: () => 5_000_000
    })
    const result = await discovery.codexhostRowsForScan({ roots: ['/repo/gonavi'] })
    expect(result.rows).toEqual([])
  })
})
