import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export async function checkCompanionLifecycles(assetRoot) {
  const require = createRequire(resolve(assetRoot, 'index.js'))
  const { createCompanionTaskKernel } = require('./companion/task-kernel.cjs')
  const { createEvidenceNodeV7, createEvidenceBatchV7 } = require('./companion/evidence-adapter-v7.cjs')
  const providers = { codex: true, claude: false, cursor: false, orca: false }
  const lanes = ['membership', 'activity', 'interaction', 'unread', 'planArtifact', 'metadata', 'topology']
  let checked = 0
  function fixture(open = async () => ({ outcome: 'dispatched', confirmsRead: false })) {
    const events = []
    const kernel = createCompanionTaskKernel({ record: event => events.push(event), now: () => 1000, coalesceMs: 0,
      setTimeout: () => 0, clearTimeout: () => {}, initialConfiguration: { enabled: true, providers },
      adapters: { codex: { open } } })
    const lease = kernel.attach({ enabled: true, providers }).lease
    let transport = 0
    function publish(rows, generation, { complete = false, remove = [], unreadGeneration = generation } = {}) {
      const family = 'codex:lifecycle'
      const nodes = rows.map(({ key, phase = 'completed', epoch = 100, unread = false, known = true, parent }) => createEvidenceNodeV7({
        key, provider: 'codex', family, role: key === 'main' ? 'root' : 'child', standaloneEligible: key === 'main',
        observedAt: epoch + (phase === 'completed' ? 10 : 0), causalKey: `${key}:${epoch}`,
        capabilities: key === 'main' ? ['open', 'archive'] : [],
        metadata: { kind: key === 'main' ? 'codex-thread' : 'topology-child',
          actionAlias: key === 'main' ? 'ct_lifecycle_main_1234567890' : '',
          revisionAt: epoch, membershipRevision: generation, visibilityRevision: generation, metadataRevision: generation,
          lastQuestionAt: 100, createdAt: 50 },
        observation: { kind: phase === 'running' ? 'turn-running' : 'turn-completed', authority: 'live-turn', exact: true,
          sequence: epoch + (phase === 'completed' ? 10 : 0), turnStartedAt: epoch,
          statusEnteredAt: epoch + (phase === 'completed' ? 10 : 0), terminalAt: phase === 'completed' ? epoch + 10 : 0,
          unreadKnown: known, unread, unreadSequence: unreadGeneration }
      }))
      const relations = rows.filter(row => row.key !== 'main').map(row => ({ childKey: row.key,
        parentKey: row.parent || 'main', provider: 'codex', family, relation: 'side-thread',
        authority: 'lifecycle-exact', exact: true, generation }))
      const batch = createEvidenceBatchV7({ provider: 'codex', nodes, relations, relationsComplete: complete,
        snapshotLanes: complete ? lanes : [], completeLanes: complete ? lanes : [],
        laneGenerations: Object.fromEntries(lanes.map(lane => [lane, lane === 'unread' ? unreadGeneration : generation])),
        removedKeys: { membership: remove }, health: 'ready' })
      batch.removedRelationChildKeys = remove
      return kernel.syncPackage({ lease, draft: { schema: 'companion-task-evidence-draft-v7', producer: 'host-evidence',
        sourceTaskStateRevision: 'task-state-v12', draftRevision: ++transport, acceptedAt: 1000,
        enabled: true, complete: true, providers, sourceGenerations: { codex: generation }, sourceLaneGenerations: { codex: Object.fromEntries(lanes.map(lane => [lane, lane === 'unread' ? unreadGeneration : generation])) }, evidenceBatches: { codex: batch } } })
    }
    function expectRoot(phase, unread, count) {
      const snapshot = kernel.getLatest()
      for (const event of events.filter(event => event.event === 'phase-transition' && event.taskRef)) {
        assert.equal(event.provider, 'codex', 'root phase diagnostics share the Provider namespace with Side topology diagnostics')
        assert.equal(event.details.provider, event.provider, 'the top-level Provider agrees with the diagnostic detail')
      }
      assert.equal(snapshot.tasks.length, 1, 'only the original root is public')
      assert.equal(snapshot.tasks[0].key, 'main')
      assert.equal(snapshot.tasks[0].phase, phase)
      assert.equal(snapshot.tasks[0].unread, unread)
      assert.equal(snapshot.tasks[0].topology.memberCount, count)
      assert.equal(snapshot.views.counts.unread, phase === 'completed' && unread ? 1 : 0)
      assert.equal(snapshot.views.counts.active, phase === 'running' ? 1 : 0)
      assert(!snapshot.views.cycleKeys.includes('side'))
      checked++
      return snapshot.tasks[0]
    }
    return { kernel, publish, expectRoot, events }
  }
  const main = { key: 'main' }
  const side = { key: 'side' }
  const graph = fixture()
  try {
    graph.publish([main, { ...side, phase: 'running' }], 2)
    graph.expectRoot('running', false, 2)
    graph.publish([main], 3) // An incomplete family is not a retirement.
    graph.expectRoot('running', false, 2)
    graph.publish([], 1, { remove: ['side'] }) // New transport, old source generation.
    graph.expectRoot('running', false, 2)
    graph.publish([], 4, { remove: ['side'] })
    graph.expectRoot('completed', false, 1)
    graph.publish([main, { ...side, phase: 'running' }], 3)
    graph.expectRoot('completed', false, 1)
    graph.publish([main, { ...side, phase: 'running' }, { key: 'nested', parent: 'side', phase: 'running' }], 5)
    graph.expectRoot('running', false, 3)
    graph.publish([main], 6, { complete: true })
    graph.expectRoot('completed', false, 1)
  } finally { graph.kernel.close() }
  const archived = fixture()
  try {
    archived.publish([main, side], 2)
    archived.publish([main], 3)
    assert.equal(archived.kernel.commitArchived({ provider: 'codex', key: 'main', verified: true, membershipRevision: 500 }).outcome, 'archived')
    assert.equal(archived.kernel.getLatest().tasks.length, 0)
    archived.kernel.commitArchived({ provider: 'codex', key: 'side', verified: true, membershipRevision: 500 })
    assert.equal(archived.events.filter(event => event.event === 'archive-kernel-commit').at(-1).outcome,
      'no-op', 'archiving the root already removed every admitted Side member')
    checked++
  } finally { archived.kernel.close() }
  const read = fixture()
  try {
    read.publish([main, { ...side, known: false }], 1)
    assert.equal(read.expectRoot('completed', false, 2).unreadKnown, false, 'unknown is not a read receipt')
    read.publish([main, { ...side, unread: true }], 2)
    read.expectRoot('completed', true, 2)
    await read.kernel.dispatch({ action: 'open', key: 'main', source: 'global-shortcut' })
    read.expectRoot('completed', false, 2)
    read.publish([main, { ...side, unread: true }], 3)
    read.expectRoot('completed', false, 2) // Same-turn native unread does not rebound.
    read.publish([main, { ...side, phase: 'running', epoch: 200 }], 4)
    read.expectRoot('running', false, 2)
    read.publish([main, { ...side, epoch: 200, unread: true }], 5)
    read.expectRoot('completed', true, 2)
    read.publish([main, { ...side, unread: false }], 6, { unreadGeneration: 2 })
    read.expectRoot('completed', true, 2) // Old unread cannot erase the new completion.
  } finally { read.kernel.close() }
  const failed = fixture(async () => ({ outcome: 'failed' }))
  try {
    failed.publish([main, { ...side, unread: true }], 1)
    await failed.kernel.dispatch({ action: 'open', key: 'main', source: 'global-shortcut' })
    failed.expectRoot('completed', true, 2)
  } finally { failed.kernel.close() }
  let release
  const pending = fixture(() => new Promise(resolve => { release = resolve }))
  try {
    pending.publish([main, { ...side, unread: true }], 1)
    const opening = pending.kernel.dispatch({ action: 'open', key: 'main', source: 'global-shortcut' })
    for (let i = 0; !release && i < 20; i++) await Promise.resolve()
    assert.equal(typeof release, 'function', 'the existing open gateway was invoked')
    pending.publish([main, { ...side, epoch: 200, unread: true }], 2)
    release({ outcome: 'dispatched', confirmsRead: false })
    await opening
    pending.expectRoot('completed', true, 2) // A late open result cannot read a newer Side completion.
  } finally { pending.kernel.close() }
  return checked
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Companion lifecycles passed: ${await checkCompanionLifecycles(resolve(import.meta.dirname, '../preload'))} checkpoints`)
}
