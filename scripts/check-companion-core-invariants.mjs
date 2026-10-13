import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Requirement-owned checks, independent of editable Vitest expectations.
export function checkCompanionCoreInvariants(assetRoot) {
  const require = createRequire(resolve(assetRoot, 'index.js'))
  const { createCompanionTaskKernel } = require('./companion/task-kernel.cjs')
  const { createEvidenceNodeV7, createEvidenceBatchV7 } = require('./companion/evidence-adapter-v7.cjs')
  const providers = { codex: true, claude: false, cursor: false, orca: false }
  const lanes = ['membership', 'activity', 'interaction', 'unread', 'planArtifact', 'metadata', 'topology']
  let checked = 0
  function scenario(name, main, side, expected, unread = false) {
    const kernel = createCompanionTaskKernel({ now: () => 1000, coalesceMs: 0,
      setTimeout: () => 0, clearTimeout: () => {}, initialConfiguration: { enabled: true, providers } })
    const lease = kernel.attach({ enabled: true, providers }).lease
    const family = 'codex:invariant'
    const definitions = [{ key: 'main', role: 'root', phase: main },
      ...(side ? [{ key: 'side', role: 'child', phase: side }] : [])]
    const nodes = definitions.map(({ key, role, phase }) => createEvidenceNodeV7({
      key, role, provider: 'codex', family, standaloneEligible: role === 'root',
      observedAt: 100, causalKey: `invariant:${key}:100`, capabilities: role === 'root' ? ['open', 'archive'] : [],
      metadata: { kind: role === 'root' ? 'codex-thread' : 'topology-child', revisionAt: 100,
        membershipRevision: 100, visibilityRevision: 100, metadataRevision: 100,
        lastQuestionAt: 100, createdAt: 50, actionAlias: role === 'root' ? 'ct_invariant_main_1234567890' : '' },
      observation: { kind: phase === 'running' ? 'turn-running' : phase === 'stopped' ? 'turn-interrupted' : 'turn-completed',
        authority: 'live-turn', exact: true, sequence: 100, turnStartedAt: 100,
        terminalAt: phase === 'running' ? 0 : 100, statusEnteredAt: 100,
        unreadKnown: true, unread, unreadSequence: 100 }
    }))
    const interactions = definitions.filter(x => x.phase.startsWith('waiting-')).map(({ key, role, phase }) => ({
      revision: 'companion-interaction-evidence-v1', provider: 'codex', taskKey: key,
      branchRef: role === 'root' ? 'root' : 'child', interactionRef: role === 'root' ? 'a'.repeat(32) : 'b'.repeat(32),
      kind: phase === 'waiting-approval' ? 'approval' : 'user-input', state: 'opened',
      sequence: 100, turnEpoch: 100, requestSetRevision: 100, authority: 'provider-live', exact: true
    }))
    const batch = createEvidenceBatchV7({ provider: 'codex', nodes, interactions,
      laneGenerations: Object.fromEntries(lanes.map(lane => [lane, 1])),
      relations: side ? [{ childKey: 'side', parentKey: 'main', provider: 'codex', family,
        relation: 'side-thread', authority: 'invariant-exact', exact: true, generation: 1 }] : [], health: 'ready' })
    try {
      const snapshot = kernel.syncPackage({ lease, draft: {
        schema: 'companion-task-evidence-draft-v7', producer: 'host-evidence', sourceTaskStateRevision: 'task-state-v12',
        draftRevision: 1, acceptedAt: 1000, enabled: true, complete: true, providers, tasks: [],
        sourceGenerations: { codex: 1 }, evidenceBatches: { codex: batch }
      } })
      assert.equal(snapshot.tasks.length, 1, `${name}: root-only publication`)
      assert.equal(snapshot.tasks[0].phase, expected, `${name}: phase`)
      assert.equal(snapshot.views.counts.active, expected === 'running' ? 1 : 0, `${name}: active badge`)
      assert.equal(snapshot.views.counts.input, expected.startsWith('waiting-') ? 1 : 0, `${name}: input badge`)
      assert.equal(snapshot.views.counts.unread, expected === 'completed' && unread ? 1 : 0, `${name}: unread badge`)
      assert(!snapshot.views.cycleKeys.includes('side'), `${name}: root-only cycle`)
      if ([main, side].some(phase => phase === 'running' || phase?.startsWith('waiting-'))) {
        assert.equal(kernel.commitArchived({ provider: 'codex', key: 'main', verified: true, membershipRevision: 2 }).errorCode,
          'active-members', `${name}: archive guard`)
      }
      checked += 1
    } finally { kernel.close() }
  }
  scenario('main input survives working side', 'waiting-input', 'running', 'waiting-input')
  scenario('main input survives side approval', 'waiting-input', 'waiting-approval', 'waiting-input')
  scenario('main approval survives working side', 'waiting-approval', 'running', 'waiting-approval')
  scenario('working side survives stopped main', 'stopped', 'running', 'running')
  scenario('working side survives completed main', 'completed', 'running', 'running')
  scenario('main activity survives historical stopped side', 'running', 'stopped', 'running')
  scenario('main activity survives historical completed side', 'running', 'completed', 'running')
  scenario('side input remains actionable over unread', 'completed', 'waiting-input', 'waiting-input', true)
  scenario('memberless main remains running', 'running', null, 'running')
  scenario('completed unread remains unread', 'completed', null, 'completed', true)
  return checked
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const checked = checkCompanionCoreInvariants(resolve(import.meta.dirname, '../preload'))
  console.log(`Companion core preservation passed: ${checked} scenarios`)
}
