import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

function checkDesktopSideTerminalCapability(require) {
  const { createCodexDesktopShadow } = require('./codex/desktop-shadow.cjs')
  const { createCodexDesktopActivityResolution } = require('./codex/desktop-activity-resolution.cjs')
  const { createCodexDesktopRequestProjection } = require('./codex/desktop-request-projection.cjs')
  let sequence = 0
  const helpers = { record: value => value && typeof value === 'object' ? value : {},
    timestampMs: value => Number(value) || 0, nextLiveEvidenceSequence: () => ++sequence }
  const requests = createCodexDesktopRequestProjection(helpers)
  const activity = createCodexDesktopActivityResolution({ ...helpers, validThreadId: () => true,
    isConfirmedTurnEvidence: value => value === 'snapshot-corroborated', waitingEvidenceVisible: () => true,
    desktopRequestFlag: requests.codexDesktopRequestFlag,
    desktopIsPlanImplementationRequest: requests.codexDesktopIsPlanImplementationRequest })
  const parser = createCodexDesktopShadow({ ...helpers, validThreadId: () => true,
    reduceWaitingEdge: activity.codexReduceWaitingEdge,
    activityStatus: value => ({ status: value.type, activeFlags: value.activeFlags }),
    projectedRequest: requests.codexDesktopProjectedRequest, projectedRequests: requests.codexDesktopProjectedRequests })
  assert.equal(typeof activity.codexDesktopSideTerminalDecision, 'function', 'native Side terminal capability is available')
  assert.equal(typeof parser.codexDesktopSideGoalEvidence, 'function', 'native ephemeral Goal capability is available')
  const startedAt = 2000
  function snapshot(state = {}, revision = 10, boundary = 'exhausted') {
    const shadow = parser.codexDesktopShadowFromSnapshot({ revision, conversationState: {
      sideConversation: true, ephemeral: true, threadRuntimeStatus: { type: 'idle', activeFlags: [] },
      requests: [], turns: [], turnHistory: { kind: 'canonical', history: {
        islands: [{ newerBoundary: { status: boundary }, entries: [{ value: 'current' }] }],
        entitiesByKey: { current: { turnId: 'synthetic-current', status: 'completed', turnStartedAtMs: startedAt, items: [] } }
      } }, ...state
    } })
    assert(shadow, 'a valid native Side snapshot is parsed')
    return { ...shadow, ownerClientId: 'synthetic-owner' }
  }
  const current = snapshot()
  assert.equal(current.canonicalLatestComplete, true, 'native exhausted boundary proves newest canonical coverage')
  assert.deepEqual(activity.codexDesktopSideTerminalDecision(current).turn, { status: 'completed', startedAt },
    'native ephemeral idle canonical completion is accepted without an App Server read')
  let checked = 1
  const refused = [
    ['ordinary-side', snapshot({ ephemeral: false })],
    ['incomplete-canonical', snapshot({}, 10, 'loading')],
    ['disconnected-owner', { ...current, ownerDisconnectedAt: 1 }],
    ['new-running', snapshot({ threadRuntimeStatus: { type: 'active', activeFlags: [] } })],
    ['waiting-input', snapshot({ requests: [{ id: 'synthetic-question', type: 'userInput', method: 'requestUserInput' }] })],
    ['pending-submission', snapshot({ unconfirmedTurnSubmissions: [{ terminal: false }] })],
    ['new-live-overlay', snapshot({ turns: [{ turnId: 'synthetic-new', status: 'inProgress', turnStartedAtMs: startedAt + 1, items: [] }] })],
    ['previous-owner-live', current, { previousShadow: { ...current, ownerClientId: 'synthetic-previous-owner', runtime: { type: 'active', activeFlags: [] } } }],
    ['old-owner-revision', current, { previousShadow: { ...current, revision: 11 } }],
    ['newer-branch-turn', current, { branchTurnStartedAt: startedAt + 1 }]
  ]
  for (const [name, shadow, options] of refused) {
    assert.equal(activity.codexDesktopSideTerminalDecision(shadow, options).turn, undefined, `native Side ${name} must not complete`)
    checked++
  }
  for (const [name, shadow, expected] of [
    ['ephemeral-capability', snapshot(), { goalStatus: 'none', goalFreshness: 'fresh' }],
    ['ordinary-side', snapshot({ ephemeral: false }), null],
    ['unspecified-capability', snapshot({ ephemeral: undefined }), null],
    ['explicit-active', snapshot({ threadGoal: { status: 'active', updatedAt: 3000 } }), { goalStatus: 'active', goalFreshness: 'fresh', goalUpdatedAt: 3000 }],
    ['malformed-goal', snapshot({ threadGoal: {} }), { goalStatus: 'unknown', goalFreshness: 'verifying' }]
  ]) {
    const actual = parser.codexDesktopSideGoalEvidence(shadow)
    if (expected === null) assert.equal(actual, null, `native Goal ${name} cannot imply unsupported`)
    else for (const [key, value] of Object.entries(expected)) assert.equal(actual?.[key], value, `native Goal ${name} preserves ${key}`)
    checked++
  }
  const main = { ...current, sideConversation: false, ephemeral: false }
  assert.deepEqual(activity.codexDesktopCanonicalTerminalDecision(main).turn, { status: 'completed', startedAt },
    'native main owner completion is accepted before independent reader completion')
  for (const status of ['interrupted', 'failed']) {
    assert.equal(activity.codexDesktopCanonicalTerminalDecision({ ...main,
      currentCanonicalTurn: { ...main.currentCanonicalTurn, status } }).turn?.status, status,
    `native main real ${status} remains terminal`)
  }
  assert.equal(activity.codexDesktopCanonicalTerminalDecision({ ...main, canonicalLatestComplete: false }).turn, undefined,
    'native main incomplete canonical cannot complete')
  const running = { ...main, currentCanonicalTurn: { ...main.currentCanonicalTurn, status: 'inProgress', startedAt: startedAt + 526 } }
  assert.equal(activity.codexDesktopTerminalConflictsWithOwner({ status: 'interrupted', startedAt }, running, current.currentCanonicalTurn.turnRef), true,
    'independent interrupted cannot override the same running owner Turn')
  assert.deepEqual(activity.codexDesktopBranchInventoryTurn(running, null,
    { connectorLastTurnStatus: 'interrupted', connectorLastTurnStartedAt: startedAt }, true, current.currentCanonicalTurn.turnRef), {},
  'conflicting connector terminal cannot enter a current private branch')
  assert.equal(activity.codexDesktopBranchInventoryTurn({ ...main, currentCanonicalTurn: { ...main.currentCanonicalTurn, startedAt: startedAt + 526 } }, null,
    { connectorLastTurnStatus: 'completed', connectorLastTurnStartedAt: startedAt }, true, current.currentCanonicalTurn.turnRef).turnStartedAt, startedAt,
  'inventory terminal status keeps its own epoch instead of a canonical epoch')
  assert.equal(activity.codexDesktopBranchInventoryTurn(null, null,
    { connectorLastTurnStatus: 'interrupted', connectorLastTurnStartedAt: startedAt }, true).lastTurnStatus, 'interrupted',
  'cold interrupted inventory remains usable without conflicting owner evidence')
  assert.deepEqual(activity.codexDesktopInventoryTurnCandidate({ status: 'interrupted', startedAt }, running, null,
    current.currentCanonicalTurn.turnRef), {}, 'inventory owner conflict is rejected before projection')
  assert.equal(activity.codexDesktopInventoryTurnCandidate({ status: 'interrupted', startedAt }, running,
    { lastTurnStatus: 'failed', lastTurnStartedAt: startedAt + 526, lastTurnEvidence: 'turn-completed' },
    current.currentCanonicalTurn.turnRef).status, 'failed', 'inventory rejection preserves an actual terminal notification')
  assert.equal(activity.codexDesktopBranchTurnFields({ shadow: running }, {}, { main: true,
    terminal: { lastTurnStatus: 'interrupted', turnStartedAt: startedAt, lastTurnEvidence: 'targeted-after-exit' }
  }).lastTurnStatus, undefined, 'recorded independent terminal cannot bypass current owner precedence')
  checked += 11
  return checked
}

function checkInternalReviewMembership(require) {
  const { createCodexSubagentDiscovery, isInternalReviewThreadSource } = require('./codex/subagent-discovery.cjs')
  assert.equal(typeof isInternalReviewThreadSource, 'function', 'internal review membership capability exists')
  assert.equal(isInternalReviewThreadSource('guardian_review'), true, 'exact internal review is excluded')
  const ordinarySources = ['subagent', 'vscode', undefined, {}, { subAgent: { other: 'guardian' } }]
  for (const source of ordinarySources) {
    assert.equal(isInternalReviewThreadSource(source), false, 'ordinary and unknown sources retain task membership')
  }
  const review = '42345678-1234-4234-8234-123456789abc'
  const child = '52345678-1234-4234-8234-123456789abc'
  const owner = createCodexSubagentDiscovery({ fs: { readdirSync: () => [] }, path: require('node:path'),
    validThreadId: value => typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value) })
  owner.codexObserveThreadRows([{ id: review, threadSource: 'guardian_review' }, { id: child, threadSource: 'subagent' }])
  assert.equal(owner.codexIsInternalReviewThread(review), true, 'verified review identity survives outside discovery rows')
  assert.equal(owner.codexIsInternalReviewThread(child), false, 'ordinary child remains eligible')
  owner.codexObserveThreadRows([{ id: review }, { id: review, threadSource: {} }])
  assert.equal(owner.codexIsInternalReviewThread(review), true, 'missing or malformed source cannot erase exact review identity')
  owner.codexObserveThreadRows([{ id: review, threadSource: 'vscode' }])
  assert.equal(owner.codexIsInternalReviewThread(review), false, 'explicit ordinary source corrects previous classification')
  owner.codexObserveThreadRows([{ id: review, threadSource: 'guardian_review' }])
  owner.codexResetSubagentDiscovery()
  assert.equal(owner.codexIsInternalReviewThread(review), false, 'session reset drops source memory')
  return 11
}

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
      const interactions = rows.filter(row => row.phase === 'waiting-input').map(row => ({
        revision: 'companion-interaction-evidence-v1', provider: 'codex', taskKey: row.key, branchRef: row.key,
        interactionRef: 'f'.repeat(32), kind: 'user-input', state: 'opened', sequence: row.epoch || 100,
        turnEpoch: row.epoch || 100, requestSetRevision: generation, authority: 'provider-live', exact: true
      }))
      const batch = createEvidenceBatchV7({ provider: 'codex', nodes, interactions, relations, relationsComplete: complete,
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
      assert.equal(snapshot.views.counts.input, phase === 'waiting-input' ? 1 : 0)
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
  const remaining = fixture()
  try {
    remaining.publish([main, { ...side, unread: true }, { key: 'sibling', phase: 'running' }], 1)
    const liveRoot = remaining.expectRoot('running', true, 3)
    assert.equal(liveRoot.capabilities.archive, false, 'a Side result cannot permit archive while a sibling runs')
    remaining.publish([main, { ...side, unread: true }, { key: 'sibling' }], 2)
    remaining.expectRoot('completed', true, 3)
  } finally { remaining.kernel.close() }
  const waiting = fixture()
  try {
    waiting.publish([main, { ...side, unread: true }, { key: 'sibling', phase: 'waiting-input' }], 1)
    const waitingRoot = waiting.expectRoot('waiting-input', true, 3)
    assert.equal(waitingRoot.capabilities.archive, false, 'a sibling question remains actionable after Side completion')
  } finally { waiting.kernel.close() }
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
  return checked + checkDesktopSideTerminalCapability(require) + checkInternalReviewMembership(require)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Companion lifecycles passed: ${await checkCompanionLifecycles(resolve(import.meta.dirname, '../preload'))} checkpoints`)
}
