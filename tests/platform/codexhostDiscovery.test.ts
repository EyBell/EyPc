import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const discoveryModule = require('../../preload/codex/codexhost-discovery.cjs') as {
  CODEXHOST_LIST_TTL_MS: number
  CODEXHOST_STORE_DEBOUNCE_MS: number
  CODEXHOST_FORGET_SUPPRESS_MS: number
  CODEXHOST_THREAD_MEMORY_STORAGE_KEY: string
  codexhostHarnessLabel(value: unknown): string
  codexhostExternalIdentity(row: unknown): Record<string, string>
  codexhostExternalUnreadFields(
    hostUnread: unknown,
    desktopUnread: unknown,
    lastTurnCompleted: unknown
  ): { hasUnreadTurn: boolean; unreadAuthority: string }
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
    honorExternalProjection(threadId: string, known: Record<string, any>, activity: Record<string, any> | null): Record<string, any>
    honorExternalOpenRead(threadId: string, result: Record<string, any>, markRead?: (id: string) => void): Record<string, any>
    isExternalOpenedRead(threadId: string): boolean
    externalGoalEvidence(threadId: string): Record<string, unknown> | null
    compareHostDesktopUnread(known: Record<string, any>, input?: Record<string, any>): Record<string, any>
    codexhostForgetThread(threadId: string): boolean
    codexhostTakeRemovedThreadIds(): string[]
    codexhostInvalidateList(): void
    codexhostResetDiscovery(options?: { forgetMemory?: boolean }): void
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

  it('falls back to Desktop unread only when the Host reports nothing', () => {
    const unread = discoveryModule.codexhostExternalUnreadFields
    // Host value present: exact, and a Desktop disagreement never overrides it.
    expect(unread(false, true, true)).toEqual({ hasUnreadTurn: false, unreadAuthority: 'desktop-persisted' })
    expect(unread(true, false, false)).toEqual({ hasUnreadTurn: true, unreadAuthority: 'desktop-persisted' })
    // Host silent: a Desktop unread-true is real evidence and is adopted.
    expect(unread(null, true, false)).toEqual({ hasUnreadTurn: true, unreadAuthority: 'desktop-persisted' })
    // Host silent and Desktop silent: silence is not a read receipt for these
    // ids, so a completed Turn stays unread; anything else is simply unknown.
    expect(unread(null, false, true)).toEqual({ hasUnreadTurn: true, unreadAuthority: 'desktop-persisted' })
    expect(unread(null, null, false)).toEqual({ hasUnreadTurn: false, unreadAuthority: 'unavailable' })
  })

  it('drops a cached rendezvous when every list fails so a new Host generation is picked up', async () => {
    const calls: Array<{ command: string; args: string[] }> = []
    let clock = 1_000_000
    let listWorks = false
    const execFile = (command: string, args: string[], settings: unknown, done: (error: Error | null, stdout?: string) => void) => {
      // A dead endpoint yields no output at all — it never produces the CLI
      // error envelope that used to be the only thing invalidating the cache.
      if (command === CLI && !listWorks) {
        calls.push({ command, args })
        return done(new Error('endpoint is gone'))
      }
      return fakeExecFile(calls, {})(command, args, settings, done)
    }
    const discovery = discoveryModule.createCodexhostDiscovery({ execFile, now: () => clock, record: () => undefined })

    await discovery.codexhostRowsForScan({ roots: ['/repo/gonavi'], threadKey: (id: string) => id })
    const afterFailedPass = calls.length
    // Past the list TTL but still inside the rendezvous TTL: without the drop
    // the next pass reuses the previous runtime's endpoint and fails again.
    clock += 30_000
    listWorks = true
    const recovered = await discovery.codexhostRowsForScan({ roots: ['/repo/gonavi'], threadKey: (id: string) => id })

    expect(calls.slice(afterFailedPass).some((call) => call.command === 'pgrep')).toBe(true)
    expect(recovered.rows.length).toBeGreaterThan(0)
  })

  it('watches the Host mapping-store threads directory and refreshes the list before the TTL', async () => {
    const calls: Array<{ command: string; args: string[] }> = []
    const watches: Array<{ directory: string; listener: (event: string, filename: string) => void; closed: boolean }> = []
    const timers: Array<{ fn: () => void; ms: number }> = []
    const rosterChanges: number[] = []
    let clock = 100_000
    const discovery = discoveryModule.createCodexhostDiscovery({
      execFile: fakeExecFile(calls),
      now: () => clock,
      record: () => undefined,
      fs: {
        watch: (directory: string, _options: unknown, listener: (event: string, filename: string) => void) => {
          const entry = { directory, listener, closed: false, close: () => { entry.closed = true } }
          watches.push(entry)
          return entry
        }
      },
      path: { join: (...parts: string[]) => parts.join('/') },
      homeDirectory: '/Users/tester',
      setTimeout: (fn: () => void, ms: number) => { timers.push({ fn, ms }); return timers.length },
      clearTimeout: (id: number) => { timers.splice(id - 1, 1, { fn: () => undefined, ms: 0 }) },
      onRosterChanged: () => rosterChanges.push(clock)
    })

    await discovery.codexhostRowsForScan({ roots: ['/repo/gonavi'], threadKey: (id: string) => id })
    // The watcher lands on the Host's own store, not the lock-churning root.
    expect(watches.map((entry) => entry.directory)).toEqual(['/Users/tester/.codexhost/mapping-store/threads'])
    const listsAfterFirst = calls.filter((call) => call.command === CLI).length

    // Inside the running-list TTL nothing refreshes on its own.
    clock += 500
    await discovery.codexhostRowsForScan({ roots: ['/repo/gonavi'], threadKey: (id: string) => id })
    expect(calls.filter((call) => call.command === CLI)).toHaveLength(listsAfterFirst)

    // A Host record write (a Desktop-side pin of an extra process) is
    // debounced into one invalidation, then the next scan re-lists.
    watches[0].listener('change', 'ccd66b72-1111-4222-8333-944444444444.json')
    watches[0].listener('change', 'ccd66b72-1111-4222-8333-944444444444.json')
    watches[0].listener('change', 'store.lock')
    expect(rosterChanges).toEqual([])
    const pending = timers.filter((timer) => timer.ms === discoveryModule.CODEXHOST_STORE_DEBOUNCE_MS)
    expect(pending.length).toBeGreaterThan(0)
    pending.at(-1)!.fn()
    expect(rosterChanges).toEqual([clock])
    await discovery.codexhostRowsForScan({ roots: ['/repo/gonavi'], threadKey: (id: string) => id })
    expect(calls.filter((call) => call.command === CLI)).toHaveLength(listsAfterFirst + 1)

    discovery.codexhostResetDiscovery()
    expect(watches[0].closed).toBe(true)
  })

  it('reports a refresh failure and a cache-served pass instead of going silent', async () => {
    const records: Array<Record<string, any>> = []
    const discovery = discoveryModule.createCodexhostDiscovery({
      execFile: fakeExecFile([]),
      record: (entry: Record<string, any>) => { records.push(entry) }
    })

    // Throwing inside refreshExternalThreads before its first diagnostic used
    // to leave nothing in the log — identical to "no extra processes".
    await discovery.codexhostRowsForScan({
      roots: ['/repo/gonavi'],
      threadKey: () => { throw new RangeError('bad key') }
    })

    const failure = records.find((entry) => entry.outcome === 'failed')
    expect(failure).toMatchObject({ level: 'error', event: 'codexhost-discovery', details: { error: 'RangeError' } })
    // A pass served from the cache still leaves a breadcrumb, so "the lane ran"
    // stays distinguishable from "the lane was never reached".
    expect(records.some((entry) => entry.outcome === 'cached')).toBe(true)
  })

  it('projects the Harness identity only for external rows with a well-formed id', () => {
    // Native Codex rows must not gain the field, and an unknown Harness the
    // Host adds later must cross unchanged — the charset is the only gate.
    expect(discoveryModule.codexhostExternalIdentity({ codexhostExternal: true, codexhostHarnessId: 'claude-code' }))
      .toEqual({ codexhostHarnessId: 'claude-code' })
    expect(discoveryModule.codexhostExternalIdentity({ codexhostExternal: true, codexhostHarnessId: 'mystery-9' }))
      .toEqual({ codexhostHarnessId: 'mystery-9' })
    expect(discoveryModule.codexhostExternalIdentity({ codexhostHarnessId: 'grok' })).toEqual({})
    expect(discoveryModule.codexhostExternalIdentity({ codexhostExternal: true })).toEqual({})
    expect(discoveryModule.codexhostExternalIdentity({ codexhostExternal: true, codexhostHarnessId: 'Bad Id' }))
      .toEqual({})
    expect(discoveryModule.codexhostExternalIdentity(null)).toEqual({})
  })

  it('discovers the rendezvous from runtime children and shapes external rows with synthetic turns', async () => {
    const calls: Array<{ command: string; args: string[] }> = []
    const observedCliPaths: string[] = []
    let clock = 1_000_000
    const discovery = discoveryModule.createCodexhostDiscovery({
      execFile: fakeExecFile(calls),
      now: () => clock,
      onCliPathObserved: (cliPath: string) => { observedCliPaths.push(cliPath) }
    })
    const result = await discovery.codexhostRowsForScan({
      roots: ['/repo/gonavi'],
      threadKey: (threadId: string) => `key:${threadId}`
    })

    const listCall = calls.find((call) => call.command === CLI)
    expect(listCall?.args).toEqual(['thread', 'list', '--limit', '50', '--sort', 'recency-desc', '--all', 'true'])
    // The launch lane learns the CLI location while a Host is around to tell it.
    expect(observedCliPaths).toEqual([CLI])

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
    // No App Server Goal exists for an extra-process id. Answering none/fresh
    // keeps the Kernel from ranking a goal-verifying `unknown` above the Host
    // running/completed evidence (which hid every extra-process row).
    expect(discovery.externalGoalEvidence(PI_ID))
      .toEqual({ goalStatus: 'none', goalFreshness: 'fresh', goalEvidenceSequence: 0, goalUpdatedAt: 0 })
    expect(discovery.externalGoalEvidence(NATIVE_ID)).toBeNull()

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

    // Official follow of extra-process ids is notLoaded/idle. That silence is
    // not Host state: running stays running, completed stays idle, and a
    // leftover Desktop inProgress cannot revive a corroborated Host terminal.
    const running = { connectorStatus: 'active', connectorActiveFlags: [] }
    expect(discovery.honorExternalProjection(PI_ID, running, { status: 'notLoaded' }))
      .toMatchObject({ status: 'active', activeFlags: [] })
    expect(discovery.honorExternalProjection(PI_ID, running, null))
      .toMatchObject({ status: 'active', activeFlags: [] })
    expect(discovery.honorExternalProjection(PI_ID, running, { status: 'idle' }))
      .toMatchObject({ status: 'active', activeFlags: [] })
    const completed = {
      connectorStatus: 'idle',
      lastTurnStatus: 'completed',
      lastTurnEvidence: 'snapshot-corroborated'
    }
    expect(discovery.honorExternalProjection(PI_ID, completed, { status: 'notLoaded' }))
      .toMatchObject({ status: 'idle', activeFlags: [] })
    expect(discovery.honorExternalProjection(PI_ID, completed, { status: 'active', activeFlags: [] }))
      .toMatchObject({ status: 'idle', activeFlags: [] })
    expect(discovery.honorExternalProjection(NATIVE_ID, running, { status: 'notLoaded' }))
      .toEqual({ status: 'notLoaded' })

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

  it('keeps Host unread unless Codex APP has already marked the thread read', () => {
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
    })).toEqual({ hasUnreadTurn: false, unreadAuthority: 'desktop-persisted' })
    expect(discoveryModule.compareHostDesktopUnread(hostUnread, {
      connected: true,
      shadow: { hasUnreadTurn: true, unreadEvidence: 'event' }
    })).toEqual({ hasUnreadTurn: true, unreadAuthority: 'desktop-persisted' })
    expect(discoveryModule.compareHostDesktopUnread(hostUnread, {
      connected: true,
      shadow: { hasUnreadTurn: false, unreadEvidence: 'snapshot' }
    })).toEqual({ hasUnreadTurn: true, unreadAuthority: 'desktop-persisted' })
    expect(discoveryModule.compareHostDesktopUnread(hostUnread, { connected: false }))
      .toEqual({ hasUnreadTurn: true, unreadAuthority: 'desktop-persisted' })
    expect(discoveryModule.compareHostDesktopUnread({}, { connected: true }))
      .toEqual({ hasUnreadTurn: false, unreadAuthority: 'unavailable' })
    expect(discoveryModule.compareHostDesktopUnread(hostUnread, {
      connected: false,
      liveUnread: { hasUnreadTurn: false, ownerClientId: 'eypc-open' }
    })).toEqual({ hasUnreadTurn: false, unreadAuthority: 'desktop-live' })
  })

  it('shares one Desktop evidence reading with the entry and honours only its read polarity', () => {
    const evidence = require('../../preload/codex/desktop-unread-evidence.cjs') as {
      desktopReadEvidence(input: Record<string, unknown>): 'read' | 'unread' | null
      persistedConnectorUnread(known: Record<string, unknown> | null): { hasUnreadTurn: boolean; unreadAuthority: string }
    }
    expect(evidence.desktopReadEvidence({ liveUnread: { ownerClientId: 'eypc-open', hasUnreadTurn: false } })).toBe('read')
    expect(evidence.desktopReadEvidence({ connected: true, liveUnread: { unreadEvidence: 'event', hasUnreadTurn: true } })).toBe('unread')
    expect(evidence.desktopReadEvidence({ connected: false, liveUnread: { unreadEvidence: 'event', hasUnreadTurn: true } })).toBeNull()
    expect(evidence.desktopReadEvidence({ shadow: { unreadEvidence: 'snapshot', hasUnreadTurn: false } })).toBeNull()
    expect(evidence.persistedConnectorUnread({ connectorUnreadAuthority: 'desktop-persisted', connectorHasUnreadTurn: true }))
      .toEqual({ hasUnreadTurn: true, unreadAuthority: 'desktop-persisted' })
    expect(evidence.persistedConnectorUnread(null)).toEqual({ hasUnreadTurn: false, unreadAuthority: 'unavailable' })
    // An exact Desktop unread-true never outranks the Host for an extra process.
    expect(discoveryModule.compareHostDesktopUnread(
      { connectorUnreadAuthority: 'desktop-persisted', connectorHasUnreadTurn: false },
      { connected: true, liveUnread: { unreadEvidence: 'event', hasUnreadTurn: true } }
    )).toEqual({ hasUnreadTurn: false, unreadAuthority: 'desktop-persisted' })
  })

  it('treats an extra-process jump into Codex APP as read and leaves native jumps unchanged', async () => {
    const marked: string[] = []
    const discovery = discoveryModule.createCodexhostDiscovery({
      execFile: fakeExecFile([]),
      now: () => 6_000_000
    })
    await discovery.codexhostRowsForScan({ roots: ['/repo/gonavi'] })
    const extra = discovery.honorExternalOpenRead(PI_ID, {
      outcome: 'dispatched',
      confirmsRead: false
    }, (id) => { marked.push(id) })
    // The receipt is untouched: Codex read state lives in the Provider, not in a Kernel hint.
    expect(extra).toEqual({ outcome: 'dispatched', confirmsRead: false })
    expect(marked).toEqual([PI_ID])
    expect(discovery.isExternalOpenedRead(PI_ID)).toBe(true)
    const native = discovery.honorExternalOpenRead(NATIVE_ID, {
      outcome: 'dispatched',
      confirmsRead: false
    }, (id) => { marked.push(id) })
    expect(native).toEqual({ outcome: 'dispatched', confirmsRead: false })
    expect(marked).toEqual([PI_ID])
    discovery.codexhostResetDiscovery()
  })

  it('retries Host list after a missed rendezvous instead of caching empty', async () => {
    const calls: Array<{ command: string; args: string[] }> = []
    let hasChild = false
    let clock = 7_000_000
    const discovery = discoveryModule.createCodexhostDiscovery({
      execFile: (command: string, args: string[], _settings: unknown, done: (error: Error | null, stdout?: string) => void) => {
        calls.push({ command, args })
        if (command === 'ps' && args[0] === '-axww') return done(null, processTable())
        if (command === 'pgrep') return done(null, hasChild ? `${CHILD_PID}\n` : '')
        if (command === 'ps' && args[0] === 'eww') {
          return done(null, `${CHILD_PID} node adapter CODEXHOST_RUNTIME_ENDPOINT=${ENDPOINT} CODEXHOST_RUNTIME_TOKEN=${TOKEN} CODEXHOST_CLI_PATH=${CLI}`)
        }
        if (command === CLI) return done(null, listPayload())
        return done(new Error('unexpected command'))
      },
      now: () => clock
    })
    const first = await discovery.codexhostRowsForScan({ roots: ['/repo/gonavi'] })
    expect(first.rows).toEqual([])
    hasChild = true
    clock += 200
    const second = await discovery.codexhostRowsForScan({ roots: ['/repo/gonavi'] })
    expect(second.rows.length).toBeGreaterThan(0)
    expect(discovery.isExternalThreadId(PI_ID)).toBe(true)
  })

  it('fails open with no runtime process at all', async () => {
    const discovery = discoveryModule.createCodexhostDiscovery({
      execFile: (_c: string, _a: string[], _s: unknown, done: (e: Error | null, out?: string) => void) => done(null, ''),
      now: () => 5_000_000
    })
    const result = await discovery.codexhostRowsForScan({ roots: ['/repo/gonavi'] })
    expect(result.rows).toEqual([])
  })

  describe('thread memory: status continuity and the remembered jump-read', () => {
    const PI_DONE = { threadId: PI_ID, harnessId: 'pi', status: 'completed', cwd: '/repo/gonavi', title: '你好', hasUnreadTurn: true }
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

    function fakeStorage() {
      const items = new Map<string, unknown>()
      return {
        getItem: (key: string) => (items.has(key) ? JSON.parse(JSON.stringify(items.get(key))) : null),
        setItem: (key: string, value: unknown) => { items.set(key, JSON.parse(JSON.stringify(value))) },
        items
      }
    }

    function memoryHarness(storage = fakeStorage()) {
      let clock = 9_000_000
      let threads: Array<Record<string, unknown>> = [PI_DONE]
      let hasChild = true
      const make = () => discoveryModule.createCodexhostDiscovery({
        execFile: (command: string, args: string[], _settings: unknown, done: (error: Error | null, stdout?: string) => void) => {
          if (command === 'ps' && args[0] === '-axww') return done(null, processTable())
          if (command === 'pgrep') return done(null, hasChild ? `${CHILD_PID}\n` : '')
          if (command === 'ps' && args[0] === 'eww') {
            return done(null, `${CHILD_PID} node adapter CODEXHOST_RUNTIME_ENDPOINT=${ENDPOINT} CODEXHOST_RUNTIME_TOKEN=${TOKEN} CODEXHOST_CLI_PATH=${CLI}`)
          }
          if (command === CLI) return done(null, JSON.stringify({ threads, nextCursor: null }))
          return done(new Error('unexpected command'))
        },
        now: () => clock,
        storage: () => storage
      })
      let discovery = make()
      const scan = async () => {
        clock += discoveryModule.CODEXHOST_LIST_TTL_MS + 1
        await discovery.codexhostRowsForScan({ roots: ['/repo/gonavi'] })
        await settle()
        return discovery.codexhostRowsForScan({ roots: ['/repo/gonavi'] })
      }
      return {
        get discovery() { return discovery },
        scan,
        reload: () => { discovery = make() },
        setThreads: (next: Array<Record<string, unknown>>) => { threads = next },
        setHasChild: (value: boolean) => { hasChild = value },
        advance: (ms: number) => { clock += ms },
        storage
      }
    }

    it('keeps statusChangedAt across a roster loss so a completed row does not come back as 刚刚', async () => {
      const harness = memoryHarness()
      const first = await harness.scan()
      const seatedAt = first.rows[0].updatedAt as number
      harness.setHasChild(false)
      harness.advance(60_000)
      // Rendezvous gone: the roster empties (today's fail-open behaviour).
      expect((await harness.scan()).rows).toEqual([])
      harness.setHasChild(true)
      harness.advance(60_000)
      const restored = await harness.scan()
      expect(restored.rows[0].updatedAt).toBe(seatedAt)
      expect(restored.turns.get(PI_ID)).toMatchObject({ status: 'completed', startedAt: seatedAt, completedAt: seatedAt })
    })

    it('remembers the jump-read through a reset and a reload, until the Host status actually changes', async () => {
      const harness = memoryHarness()
      const first = await harness.scan()
      const seatedAt = first.rows[0].updatedAt as number
      expect(harness.discovery.isExternalOpenedRead(PI_ID)).toBe(false)
      harness.discovery.honorExternalOpenRead(PI_ID, { outcome: 'dispatched', confirmsRead: false })
      expect(harness.discovery.isExternalOpenedRead(PI_ID)).toBe(true)
      expect(discoveryModule.compareHostDesktopUnread({ connectorUnreadAuthority: 'desktop-persisted', connectorHasUnreadTurn: true }, { openedRead: true }))
        .toEqual({ hasUnreadTurn: false, unreadAuthority: 'desktop-live' })

      // Session reset keeps the memory; the reseated row keeps its timestamp and its read.
      harness.discovery.codexhostResetDiscovery()
      harness.advance(5_000)
      const reseated = await harness.scan()
      expect(reseated.rows[0].updatedAt).toBe(seatedAt)
      expect(harness.discovery.isExternalOpenedRead(PI_ID)).toBe(true)

      // A fresh instance over the same storage (plugin reload) sees the same truth.
      harness.reload()
      harness.advance(5_000)
      const reloaded = await harness.scan()
      expect(reloaded.rows[0].updatedAt).toBe(seatedAt)
      expect(harness.discovery.isExternalOpenedRead(PI_ID)).toBe(true)
      const stored = harness.storage.getItem(discoveryModule.CODEXHOST_THREAD_MEMORY_STORAGE_KEY) as { threads: Record<string, Record<string, unknown>> }
      expect(Object.keys(stored.threads)).toEqual([PI_ID])
      expect(JSON.stringify(stored)).not.toMatch(/gonavi|你好|TOKEN|127\.0\.0\.1/)

      // A real Host turn supersedes the read: running → completed moves statusChangedAt.
      harness.setThreads([{ ...PI_DONE, status: 'running' }])
      harness.advance(5_000)
      await harness.scan()
      expect(harness.discovery.isExternalOpenedRead(PI_ID)).toBe(false)
      harness.setThreads([PI_DONE])
      harness.advance(5_000)
      const completedAgain = await harness.scan()
      expect(completedAgain.rows[0].updatedAt).toBeGreaterThan(seatedAt)
      expect(harness.discovery.isExternalOpenedRead(PI_ID)).toBe(false)
    })

    it('drops the remembered read on a Host unread edge false → true, and forgets archived ids', async () => {
      const harness = memoryHarness()
      await harness.scan()
      harness.discovery.honorExternalOpenRead(PI_ID, { outcome: 'opened', confirmsRead: false })
      // Desktop consumed the read: the Host now says false.
      harness.setThreads([{ ...PI_DONE, hasUnreadTurn: false }])
      await harness.scan()
      expect(harness.discovery.isExternalOpenedRead(PI_ID)).toBe(true)
      // A completion between two scans never shows as running; the unread edge is the only evidence.
      harness.setThreads([PI_DONE])
      await harness.scan()
      expect(harness.discovery.isExternalOpenedRead(PI_ID)).toBe(false)

      harness.discovery.honorExternalOpenRead(PI_ID, { outcome: 'opened', confirmsRead: false })
      expect(harness.discovery.isExternalOpenedRead(PI_ID)).toBe(true)
      expect(harness.discovery.codexhostForgetThread(PI_ID)).toBe(true)
      expect(harness.discovery.isExternalOpenedRead(PI_ID)).toBe(false)
      const stored = harness.storage.getItem(discoveryModule.CODEXHOST_THREAD_MEMORY_STORAGE_KEY) as { threads: Record<string, unknown> }
      expect(stored.threads).toEqual({})
      harness.discovery.codexhostResetDiscovery({ forgetMemory: true })
    })
  })

  describe('archive lag and Host-list removals', () => {
    const PI = { threadId: PI_ID, harnessId: 'pi', status: 'completed', cwd: '/repo/gonavi', title: '你好', hasUnreadTurn: false }
    const CLAUDE = { threadId: CLAUDE_ID, harnessId: 'claude-code', status: 'completed', cwd: '/repo/gonavi', title: '供应商调优', hasUnreadTurn: false }
    // Idle rosters refresh behind the scan; let the background list land before reading again.
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

    function lagHarness() {
      let clock = 3_000_000
      let threads: Array<Record<string, unknown>> = [PI, CLAUDE]
      let failList = false
      const discovery = discoveryModule.createCodexhostDiscovery({
        execFile: fakeExecFile([], {
          list: () => failList
            ? JSON.stringify({ error: { code: 'RUNTIME_UNREACHABLE', message: 'x' } })
            : JSON.stringify({ threads, nextCursor: null })
        }),
        now: () => clock
      })
      const scan = async () => {
        clock += discoveryModule.CODEXHOST_LIST_TTL_MS + 1
        await discovery.codexhostRowsForScan({ roots: ['/repo/gonavi'] })
        await settle()
        return (await discovery.codexhostRowsForScan({ roots: ['/repo/gonavi'] })).rows.map((row) => row.id)
      }
      return {
        discovery,
        scan,
        setThreads: (next: Array<Record<string, unknown>>) => { threads = next },
        setFailList: (value: boolean) => { failList = value },
        advance: (ms: number) => { clock += ms }
      }
    }

    it('keeps a forgotten extra process out of the roster while the Host list still carries it', async () => {
      const harness = lagHarness()
      expect(await harness.scan()).toEqual([PI_ID, CLAUDE_ID])
      expect(harness.discovery.codexhostForgetThread(PI_ID)).toBe(true)
      // The Host page has not caught up with the archive: it must not seat the id again.
      expect(await harness.scan()).toEqual([CLAUDE_ID])
      expect(harness.discovery.isExternalThreadId(PI_ID)).toBe(false)
      // A forgotten id is not also reported as a removal.
      expect(harness.discovery.codexhostTakeRemovedThreadIds()).toEqual([])
      // The Host caught up (no PI): suppression is released, and a later list naming PI again is an unarchive.
      harness.setThreads([CLAUDE])
      expect(await harness.scan()).toEqual([CLAUDE_ID])
      harness.setThreads([PI, CLAUDE])
      expect(await harness.scan()).toEqual([PI_ID, CLAUDE_ID])
    })

    it('releases the suppression once the window has passed even if the Host never dropped the id', async () => {
      const harness = lagHarness()
      await harness.scan()
      harness.discovery.codexhostForgetThread(PI_ID)
      expect(await harness.scan()).toEqual([CLAUDE_ID])
      harness.advance(discoveryModule.CODEXHOST_FORGET_SUPPRESS_MS)
      expect(await harness.scan()).toEqual([PI_ID, CLAUDE_ID])
    })

    it('reports an id a complete Host list dropped exactly once and nothing on a degraded pass', async () => {
      const harness = lagHarness()
      await harness.scan()
      harness.setThreads([CLAUDE])
      expect(await harness.scan()).toEqual([CLAUDE_ID])
      expect(harness.discovery.codexhostTakeRemovedThreadIds()).toEqual([PI_ID])
      expect(harness.discovery.codexhostTakeRemovedThreadIds()).toEqual([])
      // Every list failed: the previous roster is kept and no removal is invented.
      harness.setFailList(true)
      expect(await harness.scan()).toEqual([CLAUDE_ID])
      expect(harness.discovery.isExternalThreadId(CLAUDE_ID)).toBe(true)
      expect(harness.discovery.codexhostTakeRemovedThreadIds()).toEqual([])
    })
  })
})
