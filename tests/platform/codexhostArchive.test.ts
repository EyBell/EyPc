import { createRequire } from 'node:module'
import crypto from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const discoveryModule = require('../../preload/codex/codexhost-discovery.cjs') as {
  createCodexhostDiscovery(dependencies?: Record<string, unknown>): {
    codexhostRowsForScan(input?: Record<string, unknown>): Promise<{ rows: Array<Record<string, any>>; turns: Map<string, Record<string, any>> }>
    isExternalThreadId(threadId: string): boolean
    isExternalThreadKey(key: string): boolean
    codexhostReadThread(threadId: string): Promise<Record<string, any>>
    codexhostArchiveThread(threadId: string, archived?: boolean): Promise<Record<string, any>>
    codexhostArchiveState(threadId: string): Promise<Record<string, any>>
    codexhostPinThread(threadId: string, pinned?: boolean): Promise<Record<string, any>>
    codexhostPinState(threadId: string): Promise<Record<string, any>>
    codexhostForgetThread(threadId: string): boolean
  }
}
const archiveBridgeModule = require('../../preload/codex/archive-bridge.cjs') as {
  createCodexArchiveBridge(dependencies: Record<string, unknown>): {
    archiveCodexThread(actionAlias: string, request: Record<string, unknown>): Promise<Record<string, any>>
  }
}

const RUNTIME_PID = 31660
const CHILD_PID = 31678
const ENDPOINT = 'http://127.0.0.1:59874'
const TOKEN = 'd1'.repeat(32)
const CLI = '/Users/tester/.local/bin/codexhost'
const EXT_ID = '9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f'
const NATIVE_ID = '01a052cb-77fa-7fd3-8acd-cb7e45f659ee'
const FINGERPRINT = 'a'.repeat(64)
const THREAD_KEY = (threadId: string) => `codex:${threadId}`

type ExecCall = { command: string; args: string[]; env?: Record<string, string> }

interface HostState {
  liveRows: Array<Record<string, unknown>>
  archivedRows: Array<Record<string, unknown>>
  read: Record<string, unknown>
  archiveError?: { code: string; message: string }
  pinError?: { code: string; message: string }
}

function hostState(): HostState {
  return {
    liveRows: [
      { threadId: EXT_ID, harnessId: 'grok', status: 'completed', cwd: '/repo/eypc', title: '', hasUnreadTurn: false, archived: false },
      { threadId: NATIVE_ID, harnessId: 'codex', status: 'completed', cwd: '/repo/eypc', title: '原生任务' }
    ],
    archivedRows: [],
    read: { threadId: EXT_ID, harnessId: 'grok', status: 'completed', turn: { turnId: 't-1', status: 'completed' } }
  }
}

function fakeExecFile(calls: ExecCall[], state: HostState) {
  return (command: string, args: string[], settings: { env?: Record<string, string> }, done: (error: Error | null, stdout?: string, stderr?: string) => void) => {
    calls.push({ command, args, ...(settings?.env ? { env: settings.env } : {}) })
    if (command === 'ps' && args[0] === '-axww') {
      return done(null, `${RUNTIME_PID} /opt/node/bin/node /opt/codex-host/packages/host-runtime/dist/main.js -c features.x=1 app-server --analytics-default-enabled`)
    }
    if (command === 'pgrep') return done(null, `${CHILD_PID}\n`)
    if (command === 'ps' && args[0] === 'eww') {
      return done(null, `${CHILD_PID} node adapter CODEXHOST_RUNTIME_ENDPOINT=${ENDPOINT} CODEXHOST_RUNTIME_TOKEN=${TOKEN} CODEXHOST_CLI_PATH=${CLI}`)
    }
    if (command === CLI && args[0] === 'thread') {
      const verb = args[1]
      if (verb === 'list') {
        const rows = args.includes('--archived') ? state.archivedRows : state.liveRows
        return done(null, JSON.stringify({ threads: rows, nextCursor: null }))
      }
      if (verb === 'read') return done(null, JSON.stringify(state.read))
      if (verb === 'pin' || verb === 'unpin') {
        if (state.pinError) {
          return done(Object.assign(new Error('exit 1'), { code: 1 }), '', JSON.stringify({ error: state.pinError }))
        }
        const threadId = args[2]
        const pinned = verb === 'pin'
        state.liveRows = state.liveRows.map((row) => row.threadId === threadId ? { ...row, pinned } : row)
        return done(null, JSON.stringify({ threadId, pinned }))
      }
      if (verb === 'archive') {
        if (state.archiveError) {
          // The CLI prints its error envelope to stderr and exits 1.
          return done(Object.assign(new Error('exit 1'), { code: 1 }), '', JSON.stringify({ error: state.archiveError }))
        }
        const threadId = args[2]
        state.liveRows = state.liveRows.filter((row) => row.threadId !== threadId)
        state.archivedRows = [...state.archivedRows, { threadId, harnessId: 'grok', status: 'completed', archived: true }]
        return done(null, JSON.stringify({ threadId, archived: true }))
      }
    }
    return done(new Error(`unexpected command ${command} ${args.join(' ')}`))
  }
}

async function loadedDiscovery(state: HostState, diagnostics: Array<Record<string, any>> = []) {
  const calls: ExecCall[] = []
  const discovery = discoveryModule.createCodexhostDiscovery({
    execFile: fakeExecFile(calls, state),
    record: (entry: Record<string, any>) => diagnostics.push(entry)
  })
  await discovery.codexhostRowsForScan({ roots: ['/repo/eypc'], threadKey: THREAD_KEY })
  expect(discovery.isExternalThreadId(EXT_ID)).toBe(true)
  return { discovery, calls }
}

describe('codexhost archive lane · discovery', () => {
  it('reads, archives and verifies an extra process through the Host CLI with the token only in the environment', async () => {
    const state = hostState()
    const diagnostics: Array<Record<string, any>> = []
    const { discovery, calls } = await loadedDiscovery(state, diagnostics)

    await expect(discovery.codexhostReadThread(EXT_ID)).resolves.toEqual({ ok: true, status: 'completed', turnStatus: 'completed' })
    await expect(discovery.codexhostArchiveThread(EXT_ID)).resolves.toEqual({ ok: true, threadId: EXT_ID, archived: true })
    await expect(discovery.codexhostArchiveState(EXT_ID)).resolves.toEqual({ ok: true, unarchivedPresent: false, archivedPresent: true })

    const cliCalls = calls.filter((call) => call.command === CLI)
    expect(cliCalls.map((call) => call.args.slice(0, 2))).toEqual(expect.arrayContaining([
      ['thread', 'read'],
      ['thread', 'archive'],
      ['thread', 'list']
    ]))
    const verification = cliCalls.filter((call) => call.args[1] === 'list' && call.args.includes('--cwd'))
    expect(verification.some((call) => call.args.includes('--archived'))).toBe(true)
    expect(verification.every((call) => call.args[call.args.indexOf('--cwd') + 1] === '/repo/eypc')).toBe(true)
    for (const call of cliCalls) {
      expect(call.env?.CODEXHOST_RUNTIME_TOKEN).toBe(TOKEN)
      expect(call.args.join(' ')).not.toContain(TOKEN)
    }
    expect(JSON.stringify(diagnostics)).not.toContain(TOKEN)
    expect(diagnostics.filter((entry) => entry.event === 'codexhost-command').map((entry) => entry.details.verb)).toEqual(
      expect.arrayContaining(['read', 'archive', 'list'])
    )

    expect(discovery.codexhostForgetThread(EXT_ID)).toBe(true)
    expect(discovery.isExternalThreadId(EXT_ID)).toBe(false)
    expect(discovery.isExternalThreadKey(THREAD_KEY(EXT_ID))).toBe(false)
    expect(discovery.codexhostForgetThread(EXT_ID)).toBe(false)
  })

  it('keeps the CLI error envelope from stderr instead of collapsing it into silence', async () => {
    const state = hostState()
    state.archiveError = { code: 'THREAD_BUSY', message: 'wait for the active Turn' }
    const diagnostics: Array<Record<string, any>> = []
    const { discovery } = await loadedDiscovery(state, diagnostics)
    await expect(discovery.codexhostArchiveThread(EXT_ID)).resolves.toEqual({ ok: false, code: 'THREAD_BUSY', message: 'wait for the active Turn' })
    const failed = diagnostics.find((entry) => entry.event === 'codexhost-command' && entry.outcome === 'failed')
    expect(failed?.details).toEqual({ verb: 'archive', code: 'THREAD_BUSY' })
    expect(discovery.isExternalThreadId(EXT_ID)).toBe(true)
  })
})

interface BridgeHarness {
  bridge: ReturnType<typeof archiveBridgeModule.createCodexArchiveBridge>
  alias: string
  key: string
  diagnostics: Array<Record<string, any>>
  requestCodexRpc: ReturnType<typeof vi.fn>
  listAllCodexThreads: ReturnType<typeof vi.fn>
  emitCodexActivityDelta: ReturnType<typeof vi.fn>
  commitArchived: ReturnType<typeof vi.fn>
  inventory: Map<string, Record<string, unknown>>
  suppressions: Set<string>
  lane: {
    isExternalThreadId: ReturnType<typeof vi.fn>
    codexhostReadThread: ReturnType<typeof vi.fn>
    codexhostArchiveThread: ReturnType<typeof vi.fn>
    codexhostArchiveState: ReturnType<typeof vi.fn>
    codexhostForgetThread: ReturnType<typeof vi.fn>
  }
}

function bridgeHarness(laneOverrides: Partial<BridgeHarness['lane']> = {}): BridgeHarness {
  const key = THREAD_KEY(EXT_ID)
  const alias = `ct_${crypto.randomBytes(18).toString('base64url')}`
  const now = Date.now()
  const threadActions = new Map([[alias, { key, threadId: EXT_ID, expiresAt: now + 60_000, projectKey: 'chats', sourceFingerprint: FINGERPRINT, cwd: '' }]])
  const inventory = new Map<string, Record<string, unknown>>([[EXT_ID, { key, lastTurnStatus: 'completed', lastTurnStartedAt: 1_700_000_000_000 }]])
  const suppressions = new Set<string>()
  const diagnostics: Array<Record<string, any>> = []
  const lane = {
    isExternalThreadId: vi.fn((threadId: string) => threadId === EXT_ID),
    codexhostReadThread: vi.fn(async () => ({ ok: true, status: 'completed', turnStatus: 'completed' })),
    codexhostArchiveThread: vi.fn(async () => ({ ok: true, threadId: EXT_ID, archived: true })),
    codexhostArchiveState: vi.fn(async () => ({ ok: true, unarchivedPresent: false, archivedPresent: true })),
    codexhostForgetThread: vi.fn(() => true),
    ...laneOverrides
  }
  const requestCodexRpc = vi.fn(async () => { throw Object.assign(new Error('official app-server must not see an extra process'), { code: 'protocol-error' }) })
  const listAllCodexThreads = vi.fn(async () => [])
  const emitCodexActivityDelta = vi.fn()
  const commitArchived = vi.fn(() => ({ outcome: 'archived' }))
  const bridge = archiveBridgeModule.createCodexArchiveBridge({
    utools: undefined,
    record: (value: unknown) => (value && typeof value === 'object' ? value : {}),
    timestampMs: (value: unknown) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0),
    error: (code: string, message: string) => Object.assign(new Error(message), { code }),
    threadKey: THREAD_KEY,
    validThreadId: (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),
    crypto,
    runtimeDiagnostics: { record: (entry: Record<string, any>) => diagnostics.push(entry) },
    requestCodexRpc,
    readCodexNativeRegistry: () => ({ fingerprint: FINGERPRINT }),
    codexDesktopIsRunning: async () => false,
    sanitizeCodexTurnStatusPage: () => null,
    codexIsConfirmedTurnEvidence: () => true,
    codexThreadNativeProject: () => null,
    codexNormalizeNativeRoot: (value: unknown) => value,
    codexThreadAlias: () => ({ key, alias }),
    listAllCodexThreads,
    codexEnsureDesktopBridge: () => ({ state: 'not-running', activityForThread: () => null, notifyThreadArchived: async () => 'not-running' }),
    desktopBridgeClientId: () => 'eypc-test',
    companionDiagnosticTaskRef: (_provider: string, threadId: string) => `h:${threadId}`,
    emitCodexActivityDelta,
    threadTurnStatusTimeoutMs: 1_000,
    threadActions,
    projectActions: new Map(),
    activityInventory: () => inventory,
    localArchiveRecoverySuppressions: suppressions,
    activityKeyForArchivedThread: (threadId: string) => {
      const known = inventory.get(threadId)
      inventory.delete(threadId)
      return typeof known?.key === 'string' ? known.key : ''
    },
    companionTaskKernel: { commitArchived },
    codexhostDiscovery: () => lane
  })
  return { bridge, alias, key, diagnostics, requestCodexRpc, listAllCodexThreads, emitCodexActivityDelta, commitArchived, inventory, suppressions, lane }
}

function archiveRequest(operationId: string) {
  const at = 1_700_000_000_000
  return {
    expectedUpdatedAt: at,
    expectedRevisionAt: at,
    expectedCompletionAt: at,
    expectedLastTurnStartedAt: at,
    expectedSourceFingerprint: FINGERPRINT,
    evidence: 'completed',
    operationId,
    intentRecorded: true,
    confirmationRecorded: true
  }
}

describe('codexhost archive lane · archive bridge', () => {
  it('archives an extra process through the Host CLI and never touches the official app-server', async () => {
    const harness = bridgeHarness()
    const result = await harness.bridge.archiveCodexThread(harness.alias, archiveRequest('archive-ui-test0001-1'))
    expect(result).toMatchObject({ outcome: 'archived', operationId: 'archive-ui-test0001-1', desktopSync: 'host-broadcast', nativeAck: 'not-required' })
    expect(harness.requestCodexRpc).not.toHaveBeenCalled()
    expect(harness.listAllCodexThreads).not.toHaveBeenCalled()
    expect(harness.lane.codexhostReadThread).toHaveBeenCalledWith(EXT_ID)
    expect(harness.lane.codexhostArchiveThread).toHaveBeenCalledWith(EXT_ID, true)
    expect(harness.lane.codexhostArchiveState).toHaveBeenCalledTimes(2)
    expect(harness.commitArchived).toHaveBeenCalledWith(expect.objectContaining({ provider: 'codex', key: harness.key, operationId: 'archive-ui-test0001-1', verified: true }))
    expect(harness.emitCodexActivityDelta).toHaveBeenCalledWith([], true, 'urgent', [harness.key])
    expect(harness.lane.codexhostForgetThread).toHaveBeenCalledWith(EXT_ID)
    expect(harness.inventory.has(EXT_ID)).toBe(false)
    expect(harness.suppressions.size).toBe(0)
    const stages = harness.diagnostics.filter((entry) => entry.scope === 'archive-transaction').map((entry) => `${entry.event}:${entry.outcome}`)
    expect(stages).toEqual(expect.arrayContaining([
      'archive-preflight:verified',
      'archive-provider-write:completed',
      'archive-server-verify-1:verified',
      'archive-desktop-sync:not-required',
      'archive-server-verify-2:verified',
      'archive-kernel-commit:archived'
    ]))
    expect(harness.diagnostics.find((entry) => entry.event === 'archive-provider-write')?.details.lane).toBe('codexhost')
  })

  it('retains the task when the Host still reports the extra process running', async () => {
    const harness = bridgeHarness({ codexhostReadThread: vi.fn(async () => ({ ok: true, status: 'running', turnStatus: 'running' })) })
    const result = await harness.bridge.archiveCodexThread(harness.alias, archiveRequest('archive-ui-test0002-1'))
    expect(result).toMatchObject({ outcome: 'failed', errorCode: 'active-task' })
    expect(harness.lane.codexhostArchiveThread).not.toHaveBeenCalled()
    expect(harness.commitArchived).not.toHaveBeenCalled()
    expect(harness.requestCodexRpc).not.toHaveBeenCalled()
    expect(harness.suppressions.size).toBe(0)
  })

  it('retains the task on a Host THREAD_BUSY write and on a failed archive verification', async () => {
    const busy = bridgeHarness({ codexhostArchiveThread: vi.fn(async () => ({ ok: false, code: 'THREAD_BUSY', message: 'busy' })) })
    await expect(busy.bridge.archiveCodexThread(busy.alias, archiveRequest('archive-ui-test0003-1'))).resolves.toMatchObject({ outcome: 'failed', errorCode: 'active-task' })
    expect(busy.commitArchived).not.toHaveBeenCalled()
    expect(busy.suppressions.size).toBe(0)

    const unverified = bridgeHarness({ codexhostArchiveState: vi.fn(async () => ({ ok: true, unarchivedPresent: true, archivedPresent: false })) })
    await expect(unverified.bridge.archiveCodexThread(unverified.alias, archiveRequest('archive-ui-test0004-1'))).resolves.toMatchObject({ outcome: 'indeterminate', errorCode: 'archive-verify-1-failed' })
    expect(unverified.commitArchived).not.toHaveBeenCalled()
    expect(unverified.lane.codexhostForgetThread).not.toHaveBeenCalled()
    expect(unverified.inventory.has(EXT_ID)).toBe(true)
    // verify-1 proved the row still unarchived: the recovery lane must not stay suppressed.
    expect(unverified.suppressions.size).toBe(0)
  })

  it('leaves native Codex rows on the official path', async () => {
    const harness = bridgeHarness({ isExternalThreadId: vi.fn(() => false) })
    const result = await harness.bridge.archiveCodexThread(harness.alias, archiveRequest('archive-ui-test0005-1'))
    expect(result.outcome).toBe('failed')
    expect(harness.requestCodexRpc).toHaveBeenCalled()
    expect(harness.lane.codexhostReadThread).not.toHaveBeenCalled()
  })
})

describe('codexhost pin lane · discovery', () => {
  it('lists the Host pinned field, pins through the CLI and keeps the roster ahead of the next list', async () => {
    const state = hostState()
    state.liveRows[0] = { ...state.liveRows[0], pinned: false }
    const diagnostics: Array<Record<string, any>> = []
    const { discovery, calls } = await loadedDiscovery(state, diagnostics)
    const before = await discovery.codexhostRowsForScan({ roots: ['/repo/eypc'], threadKey: THREAD_KEY })
    expect(before.rows.find((row) => row.id === EXT_ID)).toMatchObject({ codexhostPinned: false })

    await expect(discovery.codexhostPinThread(EXT_ID, true)).resolves.toEqual({ ok: true, threadId: EXT_ID, pinned: true })
    const pinCall = calls.find((call) => call.command === CLI && call.args[1] === 'pin')
    expect(pinCall?.args).toEqual(['thread', 'pin', EXT_ID])
    expect(pinCall?.env?.CODEXHOST_RUNTIME_TOKEN).toBe(TOKEN)
    // The roster reflects the verified value before any Host list refresh.
    const after = await discovery.codexhostRowsForScan({ roots: ['/repo/eypc'], threadKey: THREAD_KEY })
    expect(after.rows.find((row) => row.id === EXT_ID)).toMatchObject({ codexhostPinned: true })
    await expect(discovery.codexhostPinState(EXT_ID)).resolves.toEqual({ ok: true, pinned: true })

    await expect(discovery.codexhostPinThread(EXT_ID, false)).resolves.toEqual({ ok: true, threadId: EXT_ID, pinned: false })
    expect(calls.filter((call) => call.command === CLI).map((call) => call.args[1])).toEqual(expect.arrayContaining(['pin', 'unpin']))
    expect(JSON.stringify(diagnostics)).not.toContain(TOKEN)
  })

  it('surfaces the Host error envelope for a pin and leaves the roster untouched', async () => {
    const state = hostState()
    state.liveRows[0] = { ...state.liveRows[0], pinned: false }
    state.pinError = { code: 'THREAD_NOT_FOUND', message: 'gone' }
    const { discovery } = await loadedDiscovery(state)
    await expect(discovery.codexhostPinThread(EXT_ID, true)).resolves.toEqual({ ok: false, code: 'THREAD_NOT_FOUND', message: 'gone' })
    const rows = await discovery.codexhostRowsForScan({ roots: ['/repo/eypc'], threadKey: THREAD_KEY })
    expect(rows.rows.find((row) => row.id === EXT_ID)).toMatchObject({ codexhostPinned: false })
  })

  it('reports no pin lane for a Host that predates the field', async () => {
    const state = hostState()
    const { discovery } = await loadedDiscovery(state)
    const rows = await discovery.codexhostRowsForScan({ roots: ['/repo/eypc'], threadKey: THREAD_KEY })
    expect(rows.rows.find((row) => row.id === EXT_ID)).not.toHaveProperty('codexhostPinned')
    await expect(discovery.codexhostPinState(EXT_ID)).resolves.toEqual({ ok: true, pinned: null })
  })
})
