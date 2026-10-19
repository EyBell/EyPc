import crypto from 'node:crypto'
import fs from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

const adapter = require('../../preload/companion/evidence-adapter-v7.cjs')
const { createCompanionTaskKernel } = require('../../preload/companion/task-kernel.cjs')
const inventory = require('../../preload/orca/inventory.cjs')

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
