import crypto from 'node:crypto'
import fs from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

const adapter = require('../../preload/companion/evidence-adapter-v7.cjs')
const { createCompanionTaskKernel } = require('../../preload/companion/task-kernel.cjs')
const inventory = require('../../preload/orca/inventory.cjs')
const { createCodexDesktopRequestProjection } = require('../../preload/codex/desktop-request-projection.cjs')
const { createCodexDesktopFrameReader } = require('../../preload/codex/desktop-ipc-endpoint.cjs')

describe('Desktop IPC bounded frame ingestion', () => {
  const frame = (text: string) => {
    const body = Buffer.from(text), result = Buffer.alloc(body.length + 4)
    result.writeUInt32LE(body.length); body.copy(result, 4)
    return result
  }

  it('preserves fragmented UTF-8 headers and coalesced frames with one copy per byte', () => {
    const reader = createCodexDesktopFrameReader(1024)
    const wire = Buffer.concat([frame('中文✓'), frame('next')]), result: string[] = []
    for (const byte of wire) expect(reader.push(Buffer.from([byte]), (body: Buffer) => result.push(body.toString()))).toBe(true)
    expect(result).toEqual(['中文✓', 'next'])
    expect(reader.stats()).toEqual({ copiedBytes: wire.length, completedFrames: 2, bufferedBytes: 0, allocatedBytes: 0 })
  })

  it('bounds fragmented large-frame copy work and releases an incomplete frame on reset', () => {
    const reader = createCodexDesktopFrameReader(3 * 1024 * 1024)
    const wire = frame('x'.repeat(2 * 1024 * 1024))
    let accepted = 0
    for (let offset = 0; offset < wire.length; offset += 8192) {
      expect(reader.push(wire.subarray(offset, offset + 8192), (body: Buffer) => { accepted += body.length })).toBe(true)
    }
    expect(accepted).toBe(2 * 1024 * 1024)
    expect(reader.stats().copiedBytes).toBe(wire.length)
    reader.push(wire.subarray(0, 8192), () => { throw Error('incomplete frame published') })
    expect(reader.stats().allocatedBytes).toBe(2 * 1024 * 1024)
    reader.reset()
    expect(reader.stats()).toMatchObject({ bufferedBytes: 0, allocatedBytes: 0 })
  })

  it.each([0, 33])('rejects invalid advertised length %s before allocating a body', (length) => {
    const reader = createCodexDesktopFrameReader(32), header = Buffer.alloc(4)
    header.writeUInt32LE(length)
    expect(reader.push(header, () => { throw Error('invalid frame published') })).toBe(false)
    expect(reader.stats().allocatedBytes).toBe(0)
  })

  it('stops on consumer rejection before allocating or consuming the next frame', () => {
    const reader = createCodexDesktopFrameReader(1024), first = frame('first'), second = frame('second')
    expect(reader.push(Buffer.concat([first, second]), () => false)).toBe(false)
    expect(reader.stats()).toEqual({ copiedBytes: first.length, completedFrames: 1, bufferedBytes: 0, allocatedBytes: 0 })
  })
})

function pendingOwnerHarness() {
  let clock = 30_000
  const timers = new Map<any, () => void>()
  const writes: any[] = []
  const follows: any[] = []
  const records: any[] = []
  const projection = createCodexDesktopRequestProjection({
    record: (value: any) => value || {}, timestampMs: (value: any) => Number(value) || 0,
    nextLiveEvidenceSequence: () => 1, now: () => clock,
    setTimeout: (callback: () => void) => { const timer = { unref() {} }; timers.set(timer, callback); return timer },
    clearTimeout: (timer: any) => timers.delete(timer), recordDiagnostic: (event: any) => records.push(event)
  })
  const shadow = { requests: [{ asyncQuestion: true, identityExact: true, observedSequence: 4, observedAt: 1_000 }] }
  const bridge: any = {
    state: 'connected', closed: false, socket: {}, clientId: 'fixture-client',
    inventory: new Set(['fixture-thread']), shadows: new Map([['fixture-thread', shadow]]), sideShadows: new Map(),
    send: (message: any) => { writes.push(message); return true },
    followAny: (...args: any[]) => { follows.push(args); return true }
  }
  const known = { connectorStatus: 'active', connectorActiveFlags: [], connectorLastTurnStartedAt: 100 }
  const refresh = () => projection.codexDesktopRefreshPendingOwner(bridge, 'fixture-thread', known)
  const response = (overrides: any = {}) => projection.codexDesktopHandleOwnerDiscoveryResponse(bridge, {
    type: 'response', method: 'thread-owner-discovery', requestId: writes.at(-1)?.requestId,
    resultType: 'success', handledByClientId: 'fixture-owner', ...overrides
  })
  return { projection, bridge, shadow, known, refresh, response, writes, follows, records, timers, setClock: (value: number) => { clock = value } }
}

describe('Codex pending owner snapshot recovery', () => {
  it('discovers an inventoried owner with no local question and only repeats for a new native turn', () => {
    const h = pendingOwnerHarness()
    h.shadow.requests = []
    const refresh = () => h.projection.codexDesktopRefreshInventoryOwner(h.bridge, 'fixture-thread', h.known)
    expect(refresh()).toBe(true)
    expect(h.response()).toBe(true)
    expect(h.follows).toEqual([['fixture-thread', true, ['fixture-owner']]])
    expect(refresh()).toBe(false)
    h.known.connectorLastTurnStartedAt = 200
    expect(refresh()).toBe(true)
    h.projection.codexDesktopClearOwnerRefreshes(h.bridge)
  })

  it('accepts owner discovery while the shadow advances but rejects a changed native turn', () => {
    const h = pendingOwnerHarness()
    h.projection.codexDesktopRefreshInventoryOwner(h.bridge, 'fixture-thread', h.known)
    h.bridge.shadows.set('fixture-thread', { requests: [] })
    expect(h.response()).toBe(true)
    expect(h.follows).toHaveLength(1)
    h.known.connectorLastTurnStartedAt = 200
    expect(h.projection.codexDesktopRefreshInventoryOwner(h.bridge, 'fixture-thread', h.known)).toBe(true)
    h.known.connectorLastTurnStartedAt = 300
    h.response()
    expect(h.follows).toHaveLength(1)
    h.projection.codexDesktopClearOwnerRefreshes(h.bridge)
  })

  it('keeps inventory subscription and pending reconciliation deduplication separate', () => {
    const h = pendingOwnerHarness()
    h.projection.codexDesktopRefreshInventoryOwner(h.bridge, 'fixture-thread', h.known)
    expect(h.refresh()).toBe(false)
    h.response()
    expect(h.refresh()).toBe(true)
    h.response()
    expect(h.projection.codexDesktopRefreshInventoryOwner(h.bridge, 'fixture-thread', h.known)).toBe(false)
    expect(h.refresh()).toBe(false)
    expect(h.writes).toHaveLength(2)
  })

  it('queues inventory subscriptions behind eight in-flight lookups and skips a removed queued target', () => {
    const h = pendingOwnerHarness()
    h.known.connectorStatus = 'notLoaded'
    for (let index = 0; index < 10; index++) {
      const id = `fixture-${index}`
      h.bridge.inventory.add(id)
      expect(h.projection.codexDesktopRefreshInventoryOwner(h.bridge, id, h.known)).toBe(true)
    }
    expect(h.writes).toHaveLength(8)
    h.response({ requestId: h.writes[0].requestId })
    expect(h.writes).toHaveLength(9)
    expect(h.writes[8].params.conversationId).toBe('fixture-8')
    h.bridge.inventory.delete('fixture-9')
    h.response({ requestId: h.writes[1].requestId })
    expect(h.writes).toHaveLength(9)
    h.projection.codexDesktopClearOwnerRefreshes(h.bridge)
    expect(h.timers.size).toBe(0)
  })

  it('subscribes a verified Side without a shadow while the independent connector is notLoaded', () => {
    const h = pendingOwnerHarness()
    h.known.connectorStatus = 'notLoaded'
    expect(h.projection.codexDesktopRefreshInventoryOwner(h.bridge, 'fixture-side', h.known, 'fixture-thread')).toBe(true)
    h.response()
    expect(h.follows).toEqual([['fixture-side', true, ['fixture-owner']]])
    expect(h.projection.codexDesktopRefreshInventoryOwner(h.bridge, 'unrelated-side', h.known, 'absent-parent')).toBe(false)
  })

  it('discovers the exact owner and requests a snapshot without clearing the pending question', () => {
    const h = pendingOwnerHarness()
    expect(h.refresh()).toBe(true)
    expect(h.writes[0]).toMatchObject({ type: 'request', method: 'thread-owner-discovery', version: 1,
      params: { hostId: 'local', conversationId: 'fixture-thread' } })
    expect(h.response()).toBe(true)
    expect(h.follows).toEqual([['fixture-thread', true, ['fixture-owner']]])
    expect(h.shadow.requests).toHaveLength(1)
    expect(h.timers.size).toBe(0)
    expect(JSON.stringify(h.records)).not.toContain('fixture-owner')
  })

  it('waits for the grace window and performs one lookup per unchanged question and native turn', () => {
    const h = pendingOwnerHarness()
    h.setClock(20_999)
    expect(h.refresh()).toBe(false)
    h.setClock(21_000)
    expect(h.refresh()).toBe(true)
    expect(h.refresh()).toBe(false)
    h.response()
    h.setClock(100_000)
    expect(h.refresh()).toBe(false)
    h.known.connectorLastTurnStartedAt = 200
    expect(h.refresh()).toBe(true)
    h.projection.codexDesktopClearOwnerRefreshes(h.bridge)
  })

  it.each(['error', 'timeout'])('keeps waiting on lookup %s without repeated retries', (mode) => {
    const h = pendingOwnerHarness()
    h.refresh()
    if (mode === 'error') h.response({ resultType: 'error', error: 'no-client-found' })
    else for (const callback of h.timers.values()) callback()
    expect(h.follows).toEqual([])
    expect(h.shadow.requests).toHaveLength(1)
    expect(h.refresh()).toBe(false)
  })

  it.each(['disconnected', 'removed', 'replaced', 'resolved'])('rejects a late owner result after the target is %s', (mode) => {
    const h = pendingOwnerHarness()
    h.refresh()
    if (mode === 'disconnected') h.bridge.socket = {}
    if (mode === 'removed') h.bridge.inventory.clear()
    if (mode === 'replaced') h.bridge.shadows.set('fixture-thread', { ...h.shadow })
    if (mode === 'resolved') h.shadow.requests = []
    expect(h.response()).toBe(true)
    expect(h.follows).toEqual([])
  })

  it('excludes native waiting, non-async requests and exhausted recovery capacity', () => {
    const h = pendingOwnerHarness()
    h.known.connectorActiveFlags = ['waitingOnUserInput'] as any
    expect(h.refresh()).toBe(false)
    h.known.connectorActiveFlags = []
    h.shadow.requests[0]!.asyncQuestion = false
    expect(h.refresh()).toBe(false)
    h.shadow.requests[0]!.asyncQuestion = true
    for (let index = 0; index < 8; index++) {
      const id = `fixture-${index}`
      h.bridge.inventory.add(id)
      h.bridge.shadows.set(id, { ...h.shadow })
      expect(h.projection.codexDesktopRefreshPendingOwner(h.bridge, id, h.known)).toBe(true)
    }
    expect(h.refresh()).toBe(false)
    expect(h.writes).toHaveLength(8)
    h.projection.codexDesktopClearOwnerRefreshes(h.bridge)
    expect(h.timers.size).toBe(0)
    expect(h.response()).toBe(false)
  })
})

// Run the actual production builders and semantic helpers, with no native host
// or conversation content. Kernel then computes the public groups and counts.
function builders() {
  const source = fs.readFileSync('preload/index.js', 'utf8')
  const names = ['codexRecord', 'companionEvidenceSequenceV7', 'companionPrivateChildKey', 'companionCausalKey',
    'companionProviderMetadataV7', 'companionUnknownObservationV7', 'companionProviderPinFields',
    'companionProjectLeafName', 'companionProviderProjectFields', 'companionSyntheticInteractionRefV7',
    'companionSyntheticInteractionBundleV7', 'companionCursorEvidenceV7', 'companionOrcaEvidenceV7']
  const context: any = {
    crypto, codexPinBridgeModule: require('../../preload/codex/pin-bridge.cjs'),
    isManualTaskPhase: () => false,
    cursorSessionObservationV7: adapter.cursorSessionObservationV7,
    orcaSessionObservationV7: adapter.orcaSessionObservationV7,
    createCompanionEvidenceNodeV7: adapter.createEvidenceNodeV7,
    createCompanionInteractionEvidenceV7: adapter.createInteractionEvidenceV7,
    createCompanionInteractionSetV7: adapter.createInteractionSetV7
  }
  for (const name of names) {
    const begin = source.indexOf(`function ${name}(`)
    if (begin < 0) throw new Error(`missing production owner: ${name}`)
    const end = source.indexOf('\n}\n', begin) + 3
    vm.runInNewContext(source.slice(begin, end), context)
  }
  return context
}

const persisted = () => ({ pins: new Set(), aliases: new Map(), receipts: new Map() })
const lanes = (generation: number) => Object.fromEntries(
  ['membership', 'activity', 'interaction', 'unread', 'planArtifact', 'metadata', 'topology'].map(key => [key, generation]))

function publish(kernel: any, provider: string, evidence: any, generation: number, acceptedAt: number) {
  expect(kernel.publishEvidence({
    schema: 'companion-task-evidence-draft-v7', producer: 'host-evidence', sourceTaskStateRevision: 'task-state-v12',
    draftRevision: generation, acceptedAt, enabled: true, complete: true,
    providers: { codex: false, claude: false, cursor: provider === 'cursor', orca: provider === 'orca' },
    sourceGenerations: { [provider]: generation }, sourceLaneGenerations: { [provider]: lanes(generation) },
    evidenceBatches: { [provider]: adapter.createEvidenceBatchV7({
      provider, ...evidence, laneGenerations: lanes(generation), complete: true, relationsComplete: true, health: 'ready'
    }) }
  })).toBeTruthy()
  return kernel.getPackage()
}

describe('provider state repair through production evidence and Kernel', () => {
  it('does not renew an old Cursor family on repeated inventory scans, including children without clocks', () => {
    const h = builders()
    const now = 1_790_000_000_000
    const old = now - 40 * 24 * 60 * 60 * 1_000
    const kernel = createCompanionTaskKernel({ now: () => now,
      initialConfiguration: { enabled: true, providers: { cursor: true }, dynamicTaskWindowHours: 48 } })
    const session = { composerId: 'root', lastUpdatedAt: old, diskStatus: 'completed',
      subagents: [{ composerId: 'child', lastUpdatedAt: old }, { composerId: 'clockless' }] }
    for (let scan = 1; scan <= 2; scan += 1) {
      const evidence = h.companionCursorEvidenceV7(session, {}, {
        persisted: persisted(), acceptedAt: now + scan, topologyGeneration: scan
      })
      expect(evidence.nodes[1].activity).toMatchObject({ sequence: old, terminalAt: old })
      expect(evidence.nodes[2].activity).toMatchObject({ sequence: 0, terminalAt: 0 })
      const result = publish(kernel, 'cursor', evidence, scan, now + scan)
      expect(result.tasks).toHaveLength(1)
      expect(result.tasks[0]).toMatchObject({ phase: 'completed', dynamicEligible: false, dynamicGroup: 'none' })
      expect(result.views.groups.completed).toEqual([])
    }
  })

  it('keeps real recent Cursor child activity and terminal clocks without using the parent or poll clock', () => {
    const h = builders()
    const session = { composerId: 'root', lastUpdatedAt: 500, diskStatus: 'completed',
      subagents: [{ composerId: 'child', lastUpdatedAt: 100 }] }
    for (const active of [true, false]) {
      const evidence = h.companionCursorEvidenceV7(session, { subagents: [{
        subagentId: 'child', parentConversationId: 'root', active, startedAt: 200, lastEventAt: 300, stoppedAt: active ? 0 : 300
      }] }, { persisted: persisted(), acceptedAt: 900 })
      expect(evidence.nodes[1].activity).toMatchObject({
        kind: active ? 'turn-running' : 'turn-completed', sequence: 300, turnStartedAt: 200, terminalAt: active ? 0 : 300
      })
    }
  })

  it('clears an Orca request when the current tool changes within the same waiting epoch', () => {
    const h = builders()
    const tabId = '11111111-1111-4111-8111-111111111111'
    const leafId = '22222222-2222-4222-8222-222222222222'
    const collect = (toolName: string) => inventory.collectSessions([{ repo: 'fixture', agents: [{
      paneKey: `${tabId}:${leafId}`, agentType: 'grok', state: 'waiting', toolName, stateStartedAt: 100, updatedAt: 150
    }] }], [{ tabId, leafId, connected: true, title: 'fixture', agentIdentity: 'grok' }]).sessions[0]
    const kernel = createCompanionTaskKernel({ now: () => 1_000,
      initialConfiguration: { enabled: true, providers: { orca: true } } })
    const waiting = collect('exit_plan_mode')
    const first = h.companionOrcaEvidenceV7(waiting, { persisted: persisted(), acceptedAt: 800 })
    expect(publish(kernel, 'orca', first, 1, 800).tasks[0].phase).toBe('waiting-input')
    const repeat = h.companionOrcaEvidenceV7(waiting, { persisted: persisted(), acceptedAt: 900 })
    expect(repeat.interactions).toEqual(first.interactions)
    const running = collect('Bash')
    expect(inventory.fingerprintOf([running])).not.toBe(inventory.fingerprintOf([waiting]))
    const after = h.companionOrcaEvidenceV7(running, { persisted: persisted(), acceptedAt: 950 })
    expect(publish(kernel, 'orca', after, 2, 950).tasks[0].phase).toBe('running')
  })

  it.each([
    ['waiting', 'exit_plan_mode', 'plan-implementation', 'waiting-input'],
    ['blocked', 'ExitPlanMode', 'plan-implementation', 'waiting-input'],
    ['waiting', 'AskUserQuestion', 'user-input', 'waiting-input'],
    ['blocked', 'request_user_input', 'user-input', 'waiting-input'],
    ['waiting', 'Bash', '', 'running'],
    ['blocked', 'unrecognized', '', 'running'],
    ['working', 'exit_plan_mode', '', 'running']
  ])('maps Orca %s/%s and clears a resolved interaction without an intermediate completion', (state, toolName, kind, phase) => {
    const h = builders()
    const tabId = '11111111-1111-4111-8111-111111111111'
    const leafId = '22222222-2222-4222-8222-222222222222'
    const collect = (stateValue: string, at: number, interrupted = false) => inventory.collectSessions([{ repo: 'fixture', agents: [{
      paneKey: `${tabId}:${leafId}`, agentType: 'claude', state: stateValue, toolName, stateStartedAt: at, updatedAt: at, interrupted
    }] }], [{ tabId, leafId, connected: true, title: 'fixture', agentIdentity: 'claude' }]).sessions[0]
    const kernel = createCompanionTaskKernel({ now: () => 1_000,
      initialConfiguration: { enabled: true, providers: { orca: true } } })
    const session = collect(state, 100)
    expect(session.interactionKind).toBe(kind)
    const evidence = h.companionOrcaEvidenceV7(session, { persisted: persisted(), acceptedAt: 800 })
    expect(evidence.interactions.map((entry: any) => entry.kind)).toEqual(kind ? [kind] : [])
    const first = publish(kernel, 'orca', evidence, 1, 800)
    expect(first.tasks[0].phase).toBe(phase)
    expect(first.views.counts.input).toBe(kind ? 1 : 0)
    const running = collect('working', 200)
    expect(running.interactionKind).toBe('')
    expect(inventory.fingerprintOf([session])).not.toBe(inventory.fingerprintOf([running]))
    const resumed = publish(kernel, 'orca', h.companionOrcaEvidenceV7(running,
      { persisted: persisted(), acceptedAt: 900 }), 2, 900)
    expect(resumed.tasks[0].phase).toBe('running')
    expect(resumed.views.counts.input).toBe(0)
    expect(collect(state, 300, true).interactionKind).toBe('')
  })
})
