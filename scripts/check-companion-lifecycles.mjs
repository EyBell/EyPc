import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Script } from 'node:vm'

async function checkDesktopSideTerminalCapability(require, assetRoot) {
  const { createCodexDesktopShadow } = require('./codex/desktop-shadow.cjs')
  const { createCodexDesktopActivityResolution } = require('./codex/desktop-activity-resolution.cjs')
  const { createCodexDesktopRequestProjection } = require('./codex/desktop-request-projection.cjs')
  const { createCodexRolloutRuntimeState } = require('./codex/rollout-runtime-state.cjs')
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
  const ordinarySide = snapshot({ ephemeral: false })
  assert.equal(current.canonicalLatestComplete, true, 'native exhausted boundary proves newest canonical coverage')
  for (const shadow of [current, ordinarySide]) {
    assert.deepEqual(activity.codexDesktopSideTerminalDecision(shadow).turn,
      { turnRef: shadow.currentCanonicalTurn.turnRef, status: 'completed', startedAt },
      'native idle canonical completion is accepted for both kinds of Side Chat')
  }
  let checked = 2
  for (const status of ['interrupted', 'failed']) {
    const turn = { ...ordinarySide.currentCanonicalTurn, status }
    assert.deepEqual(activity.codexDesktopSideTerminalDecision({ ...ordinarySide, currentCanonicalTurn: turn }).turn,
      { turnRef: turn.turnRef, status, startedAt }, 'current idle owner confirms the ordinary Side outcome')
    checked++
  }
  const refused = [
    ['unconfirmed-side-kind', snapshot({ ephemeral: undefined })],
    ['ordinary-newer-live', ordinarySide, { branchLiveExact: true, branchTurnStartedAt: startedAt + 1 }],
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
  const rollout = createCodexRolloutRuntimeState({ record: helpers.record,
    rolloutTimestampMs: (...values) => values.map(helpers.timestampMs).find(Boolean) || 0 })
  const abortLine = JSON.stringify({ type: 'event_msg', timestamp: startedAt + 10,
    payload: { type: 'turn_aborted', turn_id: 'synthetic-aborted', started_at: startedAt } })
  const aborted = rollout.codexRolloutRuntimeStateText(abortLine)
  assert.deepEqual(activity.codexDesktopUnloadedSideTerminal(null, aborted),
    { id: 'synthetic-aborted', status: 'interrupted', startedAt, interruptedAt: startedAt + 10 }, 'ordinary Side retains the abort event time independently of its start')
  const startOnly = rollout.codexRolloutRuntimeStateText(JSON.stringify({ type: 'event_msg',
    payload: { type: 'turn_aborted', turn_id: 'synthetic-aborted', started_at: startedAt } }))
  assert.deepEqual(activity.codexDesktopUnloadedSideTerminal(null, startOnly),
    { id: 'synthetic-aborted', status: 'interrupted', startedAt }, 'a start-only abort has a status but no verified end time')
  const { sanitizeCodexTurnStatus } = require('./codex/inventory-turn-fields.cjs').createCodexInventoryTurnFields(helpers)
  const endedTurn = sanitizeCodexTurnStatus({ id: 'synthetic-aborted', status: 'interrupted', startedAt, completedAt: startedAt + 30 })
  assert.equal(activity.codexDesktopUnloadedSideTerminal(endedTurn, aborted).interruptedAt, startedAt + 30,
    'the matching native Turn and abort event use the later end bound')
  assert.equal(sanitizeCodexTurnStatus({ ...endedTurn, completedAt: 0 }).interruptedAt, undefined)
  assert.equal(activity.codexDesktopUnloadedSideTerminal({ ...endedTurn, startedAt: startedAt + 2000 }, aborted).interruptedAt, undefined,
    'a conflicting native start cannot order the persisted Side interruption')
  assert.equal(activity.codexDesktopUnloadedSideTerminal({ ...endedTurn, startedAt: startedAt + 50, interruptedAt: 0 }, aborted).interruptedAt, undefined,
    'a candidate end before a more precise start in the same second cannot order the interruption')
  assert.equal(activity.codexDesktopUnloadedSideTerminal({ id: 'synthetic-aborted', status: 'inProgress', startedAt }, aborted),
    null, 'a current running Turn prevents abort recovery')
  assert.equal(activity.codexDesktopUnloadedSideTerminal(null, { ...aborted, startedAt: 0 }),
    null, 'a missing start does not become a terminal Turn')
  const emptySide = snapshot({ ephemeral: false, turnHistory: null })
  assert.equal(activity.codexDesktopSideNeedsPersistedTerminal(emptySide), true, 'an empty ordinary Side owner snapshot can recover a persisted terminal')
  assert.equal(activity.codexDesktopSideNeedsPersistedTerminal({ ...emptySide, ephemeral: true }), false, 'ephemeral Side skips native persisted recovery')
  checked += 10
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
  assert.deepEqual(activity.codexDesktopCanonicalTerminalDecision(main).turn,
    { turnRef: main.currentCanonicalTurn.turnRef, status: 'completed', startedAt },
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
  const ownerRequests = []
  const followed = []
  let sideParent = 'original-parent'
  const bridge = {
    state: 'connected', socket: {}, inventory: new Set(['original-parent', 'new-parent']),
    shadows: new Map(), sideShadows: new Map(), parentThreadIdFor: () => sideParent,
    send: (request) => ownerRequests.push(request) > 0,
    followAny: (...args) => followed.push(args) > 0
  }
  const owner = createCodexDesktopRequestProjection({ ...helpers, setTimeout: () => 1, clearTimeout: () => {} })
  const lookup = (parentId, turnStartedAt) => owner.codexDesktopRefreshInventoryOwner(bridge, 'ordinary-side',
    { connectorLastTurnStartedAt: turnStartedAt }, parentId, true)
  const resolveOwner = () => owner.codexDesktopHandleOwnerDiscoveryResponse(bridge, {
    type: 'response', requestId: ownerRequests.at(-1).requestId, method: 'thread-owner-discovery',
    resultType: 'success', handledByClientId: 'synthetic-owner'
  })
  assert.equal(lookup(sideParent, startedAt), true, 'a relation-only ordinary Side can discover its current owner')
  resolveOwner()
  assert.deepEqual(followed, [['ordinary-side', true, ['synthetic-owner']]], 'owner evidence triggers an exact Side subscription')
  assert.equal(lookup(sideParent, startedAt + 1), true)
  sideParent = 'new-parent'
  resolveOwner()
  assert.equal(followed.length, 1, 'an old parent discovery response does not follow the moved Side')
  assert.equal(lookup(sideParent, startedAt + 1), true, 'the new relation can look up its owner at the same inventory epoch')
  resolveOwner()
  assert.equal(followed.length, 2, 'the current relation can recover after rejecting the old response')
  checked += 4
  return checked + await checkDesktopOwnerDiscovery(require, assetRoot, { helpers, activity, rollout, abortLine, emptySide })
}

async function checkDesktopOwnerDiscovery(require, assetRoot, { helpers, activity, rollout, abortLine, emptySide }) {
  const { createCodexDesktopRequestProjection } = require('./codex/desktop-request-projection.cjs')
  const fields = require('./codex/inventory-turn-fields.cjs').createCodexInventoryTurnFields(helpers)
  const { createCodexRuntimeDiagnostics } = require('./codex/runtime-diagnostics.cjs')
  const source = readFileSync(resolve(assetRoot, assetRoot.endsWith('preload') ? 'index.js' : 'preload.js'), 'utf8')
  const start = source.indexOf('class CodexDesktopCompanionBridge {')
  const end = source.indexOf('\nfunction codexEnsureDesktopBridge(', start)
  assert(start >= 0 && end > start, 'packaged Desktop subscription entry is present')
  const rememberStart = source.indexOf('function codexRememberPrivateBranchTerminal(')
  const rememberEnd = source.indexOf('\nfunction codexForgetPrivateBranchTerminal(', rememberStart)
  assert(rememberStart >= 0 && rememberEnd > rememberStart)
  const historyStart = source.indexOf('function codexSideHistoryReadScope(')
  const historyEnd = source.indexOf('\nasync function readCodexThreadTurnStatuses(', historyStart)
  assert(historyStart >= 0 && historyEnd > historyStart)
  const bridgeClass = new Script(`${source.slice(rememberStart, rememberEnd)}\n${source.slice(historyStart, historyEnd)}
    (${source.slice(start, end)}).prototype`)
  const epoch = 1_800_000_000_000
  const oldStart = epoch - 10 * 86_400_000
  const ambiguous = { connectorStatus: 'notLoaded', connectorLastTurnStatus: 'interrupted',
    connectorLastTurnId: 'old-turn', connectorLastTurnStartedAt: oldStart }
  const completed = { connectorStatus: 'notLoaded', connectorLastTurnStatus: 'completed',
    lastTurnStatus: 'completed', lastTurnStartedAt: oldStart, connectorLastTurnStartedAt: oldStart }

  function fixture(rolloutText = abortLine) {
    let clock = epoch
    const timers = new Set()
    const events = [], writes = [], targeted = [], reads = [], scheduled = []
    const known = new Map(), relations = new Map(), members = new Map(), terminals = new Map(), trackers = new Map()
    const machines = new Set(), metadata = new Map()
    const recordStage = (parentId, stage, details, threadId = parentId) => events.push({ stage, threadId, ...details, at: clock })
    const owner = createCodexDesktopRequestProjection({ ...helpers, now: () => clock, recordSyncStage: recordStage,
      setTimeout(callback, delay) {
        const timer = { at: clock + delay, callback }
        timers.add(timer)
        return timer
      }, clearTimeout: timer => timers.delete(timer) })
    function advance(delay) {
      const until = clock + delay
      for (;;) {
        const next = [...timers].sort((left, right) => left.at - right.at)[0]
        if (!next || next.at > until) break
        timers.delete(next)
        clock = next.at
        next.callback()
      }
      clock = until
    }
    const prototype = bridgeClass.runInNewContext({
      validCodexThreadId: id => typeof id === 'string' && id.length > 0, codexActivityInventory: known,
      codexDesktopRequestProjection: owner, codexAllSideRelations: () => relations, codexSideParentThreadId: id => relations.get(id),
      codexInventorySideBranchEvidence: members, codexDesktopSideRelations: relations, codexInventorySideRelations: members,
      codexAppServerSideActivities: new Map(), codexAppServerSideActivity: () => null,
      codexCompleteInventoryThreadIds: null, codexRolloutDecisionTrackers: trackers, codexThreadTurnStatusCache: new Map(),
      codexInventoryMembershipGeneration: 1, codexThreadTurnStatusDirty: new Map(),
      codexSubagentDiscovery: { codexIsMachineRunThread: id => machines.has(id) }, codexCausalDomain: 'synthetic',
      codexReadPrivateBranchTerminal: (parent, id) => terminals.get(`${parent}/${id}`),
      codexPrivateBranchTerminals: terminals, codexPrivateBranchTerminalKey: (parent, id) => `${parent}/${id}`,
      codexIsConfirmedTurnEvidence: value => ['turn-completed', 'targeted-after-exit', 'snapshot-corroborated'].includes(value),
      CODEX_PRIVATE_BRANCH_TERMINAL_LIMIT: 2000, get codexDesktopBridge() { return bridge },
      codexDesktopActivityResolution: activity, codexTimestampMs: helpers.timestampMs, codexRecord: helpers.record,
      codexInventoryTurnFieldsModule: fields,
      codexNextLiveEvidenceSequence: helpers.nextLiveEvidenceSequence, recordCodexTaskSync: recordStage,
      CODEX_DESKTOP_TURN_REFRESH_DEADLINE_MS: 3000, CODEX_ROLLOUT_PENDING_INPUT_TAIL_BYTES: 1000,
      requestCodexRpc(method, { threadId }) {
        if (method === 'thread/turns/list') return { data: [] }
        assert.equal(method, 'thread/read')
        reads.push(threadId)
        return new Promise(resolve => metadata.set(threadId, { reply: resolve, parent: relations.get(threadId) }))
      },
      codexThreadRolloutCandidate: () => ({ candidate: 'synthetic', stat: { size: 10, mtimeMs: 1, ino: 2 } }),
      sanitizeCodexTurnStatusPage: () => null, codexReadRolloutTail: () => rolloutText,
      codexRolloutRuntimeStateText: rollout.codexRolloutRuntimeStateText, refreshCodexThreadGoal: () => null,
      codexPrivateThreadGoalEvidence: () => ({ goalFreshness: 'fresh', goalStatus: 'none' }),
      codexDesktopRequestCorrelation: owner.codexDesktopRequestCorrelation, codexPrivateBranchRef: (_parent, id) => id,
      codexThreadGoalNeedsTerminalRefresh: () => false,
      codexClearAppServerLiveActive(thread) {
        thread.appServerLiveActive = false
        delete thread.appServerLiveSequence
        delete thread.orderedTurnStart
      },
      codexMarkConfirmedTerminalEvidence(thread, evidence, sequence) {
        thread.lastTurnEvidence = evidence
        thread.terminalEvidenceSequence = sequence
      },
      runtimeDiagnostics: { record: event => events.push(event) },
      codexThreadHasPersistedPendingPlan: () => false, codexThreadPersistedInputEvidence: () => null, emitCodexActivityDelta() {}
    })
    const bridge = Object.assign(Object.create(prototype), {
      state: 'connected', socket: {}, streamGeneration: 1, inventory: new Set(), sideRecoveryPending: new Set(),
      sideTerminalReads: new Set(), shadows: new Map(), sideShadows: new Map(), streamProtocols: new Map(),
      liveUnread: new Map(), persistedUnread: new Map(), persistedUnreadCompletions: new Map(),
      turnRefreshes: new Map(), unreadRefreshes: new Map(),
      waitingEdgeRefreshes: new Map(), waitingStates: new Map(),
      send: request => writes.push(request) > 0,
      followAny(threadId, following, clients) { if (clients && following) targeted.push(threadId); return true },
      parentLiveEvidenceSequence: () => 0, scheduleLatestTurnRefresh: (_parent, refresh) => scheduled.push(refresh.queryThreadId),
      discardSupersededOrphanedPending() {}, refreshPersistedUnread() {}, ensureUnreadStateWatcher() {}, ensure() {}, emitParentActivity() {}
    })
    function addRoot(id, data) { bridge.inventory.add(id); known.set(id, { ...data }) }
    function response(request, extra) {
      return owner.codexDesktopHandleOwnerDiscoveryResponse(bridge, { type: 'response', method: 'thread-owner-discovery',
        requestId: request.requestId, resultType: 'success', handledByClientId: 'synthetic-owner', ...extra })
    }
    async function finishReads(valid = true) {
      for (const [id, { reply, parent }] of metadata) reply({ thread: { id, forkedFromId: parent,
        threadSource: valid ? 'user' : 'subagent', status: { type: 'notLoaded' } } })
      metadata.clear()
      await new Promise(resolve => setImmediate(resolve))
    }
    return { bridge, owner, known, relations, members, terminals, trackers, machines, events, writes, targeted, reads,
      scheduled, timers, addRoot, advance, response, finishReads, scan: () => bridge.updateInventory(bridge.inventory),
      sent: () => writes.map(request => request.params.conversationId) }
  }

  const cold = fixture()
  for (let index = 0; index < 160; index++) cold.addRoot(`idle-${index}`, index % 2 ? completed : {})
  for (let index = 0; index < 24; index++) {
    const id = `closed-${index}`
    cold.relations.set(id, 'idle-1')
    cold.machines.add(id)
    cold.members.set(id, { parentThreadId: 'idle-1', status: 'notLoaded', lastTurnStatus: 'interrupted',
      turnStartedAt: oldStart, closedSpawnObservedAt: 8, activeEvidenceSequence: 3 })
  }
  cold.bridge.followAll(true)
  assert.equal(cold.events.length, 0, 'empty inventory, completed roots and closed machine edges enqueue no owner work')
  for (let index = 0; index < 80; index++) cold.addRoot(`ambiguous-${index}`, ambiguous)
  cold.bridge.followAll(true)
  assert.equal(cold.events.filter(event => event.stage === 'owner-queued').length, 4, 'a large ambiguous inventory admits four probes')
  cold.advance(249)
  assert.deepEqual(cold.sent(), [], 'the broadcast can supply its owner first')
  cold.advance(1)
  assert.deepEqual(cold.sent(), ['ambiguous-0', 'ambiguous-1', 'ambiguous-2', 'ambiguous-3'])
  cold.trackers.set('ambiguous-79', { externalOpen: true })
  cold.terminals.set('ambiguous-79/ambiguous-79', { turnStartedAt: oldStart, lastTurnStatus: 'interrupted',
    lastTurnEvidence: 'targeted-after-exit', turnRef: cold.owner.codexDesktopRequestCorrelation({ id: ambiguous.connectorLastTurnId }) })
  cold.bridge.refreshSubscribedOwner('ambiguous-79')
  cold.addRoot('new-turn', { status: 'active', lastTurnEvidence: 'turn-started', lastTurnStartedAt: epoch })
  cold.bridge.refreshSubscribedOwner('new-turn')
  assert.deepEqual(cold.sent().slice(4), ['ambiguous-79', 'new-turn'], 'an old open rollout and a fresh Turn dispatch immediately')
  cold.advance(5000)
  cold.scan()
  cold.advance(30_000)
  assert.deepEqual(cold.sent().slice(6), ['ambiguous-79', 'new-turn'], 'still-unresolved urgent targets retry first')
  cold.advance(60_000)
  const initialTargets = cold.sent().slice(0, 6)
  assert.deepEqual(new Set(cold.sent()), new Set(initialTargets), 'elapsed backoff cannot expand the cold inventory scan')
  for (const id of initialTargets) assert.equal(cold.sent().filter(value => value === id).length, 2, 'one retry per unchanged demand')
  assert.equal(cold.events.filter(event => event.priority === 'background' && event.reason === 'response-deadline').length, 8)
  assert.equal(cold.timers.size, 0)

  const flow = fixture()
  for (const id of ['broadcast', 'timeout', 'late-background']) flow.addRoot(id, ambiguous)
  for (const id of ['broadcast', 'timeout']) flow.bridge.refreshSubscribedOwner(id)
  const turnRef = flow.owner.codexDesktopRequestCorrelation({ id: ambiguous.connectorLastTurnId })
  flow.bridge.shadows.set('broadcast', { ownerClientId: 'current-owner', revision: 9, currentCanonicalTurn: { turnRef, startedAt: oldStart } })
  flow.bridge.streamProtocols.set('broadcast', { available: true, generation: 1, trustedRevision: 9, ownerClientId: 'current-owner' })
  flow.advance(250)
  assert.deepEqual(flow.sent(), ['timeout'], 'dispatch rechecks the trusted broadcast revision and Turn')
  assert(flow.events.some(event => event.threadId === 'broadcast' && event.reason === 'stream-current'))
  flow.advance(4900)
  flow.bridge.refreshSubscribedOwner('late-background')
  flow.advance(100)
  assert(flow.events.some(event => event.threadId === 'late-background' && event.reason === 'background-backoff'))
  flow.addRoot('urgent', { connectorStatus: 'active' })
  flow.bridge.refreshSubscribedOwner('urgent')
  flow.advance(250)
  assert.deepEqual(flow.sent(), ['timeout', 'urgent'], 'backoff discards queued background while an urgent lookup can still send')
  assert.equal(flow.response(flow.writes[0]), false, 'the expired owner cannot subscribe')
  assert.deepEqual(flow.targeted, [])

  const reserved = fixture()
  reserved.addRoot('parent', completed)
  for (let index = 0; index < 4; index++) {
    reserved.addRoot(`background-${index}`, ambiguous)
    reserved.relations.set(`recovery-${index}`, 'parent')
  }
  reserved.bridge.followAll(true)
  reserved.advance(250)
  assert.equal(reserved.writes.length, 6, 'queued background and Side recovery leave two slots for current work')
  reserved.addRoot('live', { connectorStatus: 'active' })
  reserved.bridge.refreshSubscribedOwner('live')
  reserved.addRoot('pending', {})
  reserved.bridge.shadows.set('pending', { requests: [{ asyncQuestion: true, identityExact: true,
    method: 'requestUserInput', observedAt: epoch - 21_000, observedSequence: 19 }] })
  reserved.owner.codexDesktopRefreshPendingOwner(reserved.bridge, 'pending', reserved.known.get('pending'))
  assert.deepEqual(reserved.sent().slice(6), ['live', 'pending'], 'both urgent requests dispatch before any earlier timeout')

  const sides = fixture()
  sides.addRoot('parent', completed)
  const ids = Array.from({ length: 41 }, (_, index) => `side-${index}`)
  for (const id of ids) sides.relations.set(id, 'parent')
  sides.bridge.followAll(true)
  assert.deepEqual(sides.sent(), ids.slice(0, 4), 'four ordinary Side discoveries may run at once')
  assert(!sides.events.some(event => event.threadId === ids.at(-1)), 'the last Side exceeds even the full queue capacity')
  for (let index = 0; index < 8; index++) sides.bridge.sideTerminalReads.add(`busy-${index}`)
  sides.advance(10_000)
  assert.deepEqual(sides.sent(), ids.slice(0, 8), 'only two owner waves fit before their queue deadline')
  assert(sides.events.some(event => event.threadId === ids[8] && event.reason === 'queue-deadline'))
  assert.equal(sides.reads.length, 0)
  sides.bridge.sideTerminalReads.clear()
  for (let pass = 0; pass < Math.ceil(ids.length / 8); pass++) {
    sides.scan()
    assert(sides.bridge.sideTerminalReads.size <= 8)
    await sides.finishReads()
    sides.advance(10_000)
    assert(sides.bridge.sideTerminalReads.size <= 8)
    await sides.finishReads()
  }
  sides.scan()
  assert.deepEqual(sides.sent(), ids, 'inventory retries unsent Side targets and never resends the same failed owner')
  assert.deepEqual(sides.reads, ids, 'each timed-out Side reaches one bounded persisted read, including deferred reads and the tail')
  assert.equal(sides.terminals.size, ids.length)
  const abortTimestamp = JSON.parse(abortLine).timestamp
  assert([...sides.terminals.values()].every(turn => turn.lastTurnStatus === 'interrupted' && turn.lastTurnEvidence === 'targeted-after-exit'
    && turn.ordinarySideInterruptedAt === abortTimestamp && turn.terminalAt === turn.turnStartedAt))
  assert.equal(sides.timers.size, 0)

  for (const afterRetry of [false, true]) {
    const quiet = fixture()
    quiet.addRoot('parent', completed)
    quiet.relations.set('side', 'parent')
    quiet.bridge.followAll(true)
    if (afterRetry) {
      quiet.response(quiet.writes[0], { resultType: 'error', error: 'temporarily-unavailable' })
      quiet.advance(30_000)
    }
    const lookups = afterRetry ? 2 : 1
    assert.equal(quiet.writes.length, lookups)
    quiet.advance(125)
    assert.equal(quiet.response(quiet.writes.at(-1)), true)
    assert.deepEqual(quiet.targeted, ['side'])
    quiet.advance(4874)
    assert.deepEqual(quiet.reads, [], 'owner follow can still deliver a frame before the deadline')
    quiet.advance(1)
    assert.deepEqual(quiet.reads, ['side'], 'a quiet owner follow wakes one persisted Side read at the deadline')
    await quiet.finishReads()
    assert.equal(quiet.terminals.get('parent/side')?.lastTurnStatus, 'interrupted')
    quiet.advance(30_000)
    assert.deepEqual(quiet.reads, ['side'])
    assert.equal(quiet.writes.length, lookups)
    assert.equal(quiet.timers.size, 0)
  }

  for (const change of ['trusted-frame', 'stream-generation']) {
    const current = fixture()
    current.addRoot('parent', completed)
    current.relations.set('side', 'parent')
    current.bridge.followAll(true)
    current.response(current.writes[0])
    current.advance(4999)
    if (change === 'trusted-frame') {
      current.bridge.sideShadows.set('side', { ownerClientId: 'synthetic-owner', revision: 1, parentThreadId: 'parent' })
      current.bridge.streamProtocols.set('side', { available: true, generation: 1,
        ownerClientId: 'synthetic-owner', trustedRevision: 1 })
      current.owner.codexDesktopReconcileOwnerTarget(current.bridge, 'side')
    } else current.bridge.streamGeneration += 1
    current.advance(35_000)
    assert.deepEqual(current.reads, [], `${change} invalidates the scheduled Side read`)
    assert.deepEqual(current.sent(), ['side'])
    assert.equal(current.timers.size, 0)
  }

  const snapshot = fixture()
  snapshot.addRoot('parent', completed)
  snapshot.relations.set('side', 'parent')
  const shadow = { ...emptySide, parentThreadId: 'parent', activityEvidence: 'initial-snapshot', activityRevision: 1 }
  snapshot.bridge.sideShadows.set('side', shadow)
  snapshot.bridge.streamProtocols.set('side', { available: true })
  for (let index = 0; index < 8; index++) snapshot.bridge.sideTerminalReads.add(`busy-${index}`)
  const fullRead = snapshot.bridge.recoverUnloadedSideTerminal('parent', 'side', shadow)
  assert.equal(typeof fullRead.then, 'function', 'a full persisted-read pool still returns a Promise')
  await fullRead
  snapshot.bridge.verifyUncorroboratedActiveSnapshot('side', shadow)
  assert.deepEqual([snapshot.reads, snapshot.scheduled], [[], []], 'a saturated snapshot cannot bypass the shared limit')
  snapshot.bridge.sideTerminalReads.clear()
  snapshot.scan()
  await snapshot.finishReads(false)
  assert.deepEqual(snapshot.reads, ['side'], 'a still-current idle snapshot retries on the next inventory')
  assert.deepEqual(snapshot.scheduled, ['side'], 'a rejected persisted read resumes the existing scoped Turn verification')
  assert.equal(snapshot.terminals.size, 0)

  const stale = fixture()
  stale.addRoot('parent', completed)
  stale.relations.set('moved-side', 'parent')
  stale.bridge.followAll(true)
  stale.advance(5000)
  stale.owner.codexDesktopReconcileOwnerTarget(stale.bridge, 'moved-side', true)
  stale.addRoot('other-parent', completed)
  stale.relations.set('moved-side', 'other-parent')
  await stale.finishReads()
  assert.equal(stale.terminals.size, 0, 'a late persisted read cannot write after the Side changes parent')
  for (const change of ['socket', 'generation', 'turn', 'terminal', 'pending-resolved']) {
    const target = fixture()
    target.addRoot('current', { ...ambiguous, connectorStatus: 'active' })
    if (change === 'pending-resolved') {
      target.bridge.shadows.set('current', { requests: [{ asyncQuestion: true, identityExact: true, method: 'requestUserInput',
        observedSequence: 3, observedAt: epoch - 21_000 }] })
      target.owner.codexDesktopRefreshPendingOwner(target.bridge, 'current', target.known.get('current'))
      target.bridge.shadows.get('current').requests[0].interactionState = 'resolved'
    } else {
      target.bridge.refreshSubscribedOwner('current')
      if (change === 'socket') target.bridge.socket = {}
      if (change === 'generation') target.bridge.streamGeneration++
      if (change === 'turn') target.known.get('current').connectorLastTurnId = 'replacement-at-same-start'
      if (change === 'terminal') target.terminals.set('current/current', { turnStartedAt: oldStart, terminalEvidenceSequence: 10,
        turnRef: target.owner.codexDesktopRequestCorrelation({ id: ambiguous.connectorLastTurnId }) })
    }
    assert.equal(target.writes.length, 1)
    target.response(target.writes[0])
    assert.deepEqual(target.targeted, [], `${change} rejects the old reply`)
    assert.deepEqual(target.reads, [])
  }

  const interruptedTurnId = 'shutdown-interrupted'
  const originalAbort = JSON.stringify({ type: 'event_msg', timestamp: epoch + 10_000,
    payload: { type: 'turn_aborted', turn_id: interruptedTurnId, started_at: epoch } })
  const nextTurn = JSON.stringify({ type: 'event_msg', timestamp: epoch + 11_000,
    payload: { type: 'task_started', turn_id: 'next-turn' } })
  for (const scenario of ['same-turn', 'no-abort', 'different-turn', 'new-start', 'pending-work', 'old-stream']) {
    const text = scenario === 'no-abort' ? ''
      : scenario === 'different-turn' ? abortLine
        : scenario === 'new-start' ? `${originalAbort}\n${nextTurn}` : originalAbort
    const target = fixture(text)
    target.addRoot('interrupted', { status: 'active', lastTurnStatus: 'inProgress', lastTurnId: interruptedTurnId,
      lastTurnStartedAt: epoch + 338, appServerLiveActive: true, appServerLiveSequence: 7 })
    target.trackers.set('interrupted', { candidate: 'synthetic' })
    const ownerTurnRef = target.owner.codexDesktopRequestCorrelation({ id: interruptedTurnId })
    const shadow = {
      ownerClientId: 'current-owner', revision: 9, runtime: { type: 'idle', activeFlags: [] },
      canonicalLatestComplete: true, currentCanonicalTurn: { status: 'interrupted', turnRef: ownerTurnRef, startedAt: epoch },
      requests: scenario === 'pending-work' ? [{}] : []
    }
    target.bridge.shadows.set('interrupted', shadow)
    target.bridge.streamProtocols.set('interrupted', { available: true, generation: scenario === 'old-stream' ? 0 : 1,
      trustedRevision: 9, ownerClientId: 'current-owner' })
    target.bridge.reconcileDesktopBranchTerminal('interrupted', shadow)
    const accepted = scenario === 'same-turn'
    const thread = target.known.get('interrupted')
    assert.equal(thread.appServerLiveActive, !accepted, `reconnect preserves or retires only the matching live Turn: ${scenario}`)
    assert.equal(thread.lastTurnStatus, accepted ? 'interrupted' : 'inProgress')
    assert.equal(target.terminals.get('interrupted/interrupted')?.lastTurnStatus, accepted ? 'interrupted' : undefined)
  }

  const records = []
  const diagnostics = createCodexRuntimeDiagnostics({ now: () => epoch, runtimeDiagnostics: { record: event => records.push(event) } })
  for (const reason of ['queue-deadline', 'response-deadline', 'background-backoff', 'private-input']) {
    diagnostics.syncStage('h:1234567890abcdef', 'owner-resolved', { outcome: 'discarded', reason })
  }
  assert.deepEqual(records.map(event => event.details.reason), ['queue-deadline', 'response-deadline', 'background-backoff', undefined])
  diagnostics.syncStage('h:1234567890abcdef', 'side-terminal-read', { outcome: 'discarded', reason: 'queue-deadline' })
  assert.equal(Object.hasOwn(records.at(-1).details, 'reason'), false, 'owner reasons stay scoped to owner resolution')
  const retryStages = ['owner-queued', 'owner-resolved', 'owner-queued', 'owner-requested']
  for (const [index, outcome] of ['queued', 'discarded', 'queued', 'requested'].entries()) {
    diagnostics.syncStage('h:1234567890abcdef', retryStages[index], { outcome, priority: 'targeted' })
  }
  assert.deepEqual(records.slice(-4).map(event => event.details.stage), retryStages, 'a retry logs a new queue timestamp after discard')
  return 25
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

async function checkSpawnEdgeReaders(require) {
  const { createCodexSubagentDiscovery } = require('./codex/subagent-discovery.cjs')
  const parentId = '12345678-1234-4234-8234-123456789abc'
  const childIds = ['22345678-1234-4234-8234-123456789abc', '32345678-1234-4234-8234-123456789abc',
    '42345678-1234-4234-8234-123456789abc']
  const pairs = childIds.map((childId) => [childId, parentId])
  const rows = childIds.slice(0, 2).map((childId, index) => ({
    child_thread_id: childId, parent_thread_id: parentId, status: index === 0 ? 'closed' : 'open'
  }))
  const fs = { readdirSync: () => ['state_3.sqlite', 'state_5.sqlite'], existsSync: () => false }
  function discovery(dependencies) {
    const instance = createCodexSubagentDiscovery({ fs, path: require('node:path'), validThreadId: () => true, ...dependencies })
    for (const childId of childIds) instance.codexObserveThreadSourceKind(childId, 'machine')
    return instance
  }
  const builtin = discovery({ DatabaseSync: class {
    constructor(path, options) {
      assert(path.endsWith('state_5.sqlite'))
      assert.equal(options.readOnly, true)
    }
    prepare() { return { all: () => rows } }
    close() {}
  } })
  const cli = discovery({
    sqliteBin: '/synthetic/sqlite3',
    DatabaseSync: class { constructor() { throw new Error('node:sqlite unavailable') } },
    execFile(_binary, args, options, callback) {
      assert.deepEqual(args.slice(0, 2), ['-readonly', '-json'])
      assert(args[2].endsWith('state_5.sqlite?mode=ro'))
      assert(args[3].includes('thread_spawn_edges') && args[3].includes(parentId))
      assert(options.timeout > 0 && options.maxBuffer > 0)
      callback(null, JSON.stringify(rows))
    }
  })
  const outcome = await cli.codexReadSpawnEdges('/synthetic', pairs)
  assert.equal(outcome.driver, 'cli')
  assert.deepEqual(outcome.edges.map(({ status }) => status), ['closed', 'open', 'absent'])
  assert.deepEqual(outcome.edges, (await builtin.codexReadSpawnEdges('/synthetic', pairs)).edges)
  const unavailable = discovery({ sqliteBin: '/synthetic/sqlite3', execFile(_binary, _args, _options, callback) {
    callback(new Error('unavailable'))
  } })
  assert.deepEqual(await unavailable.codexReadSpawnEdges('/synthetic', pairs), { outcome: 'unavailable', driver: 'cli', edges: [] })
  return 4
}

async function checkColdRolloutAdmission(require, source, fixture) {
  const { createCodexRolloutRuntimeState } = require('./codex/rollout-runtime-state.cjs')
  const rollout = createCodexRolloutRuntimeState({ record: value => value ?? {}, rolloutTimestampMs: value => Number(value) || 0 })
  const probeStart = source.indexOf('function codexRefreshRolloutDecisionTracker(')
  const probeEnd = source.indexOf('\nfunction codexArmRolloutDecisionWatcher(', probeStart)
  const syncStart = source.indexOf('function codexSyncRolloutDecisionTrackers(')
  const syncEnd = source.indexOf('\nfunction readCodexNativePrimaryState(', syncStart)
  assert(probeStart >= 0 && probeEnd > probeStart && syncStart >= 0 && syncEnd > syncStart)
  const entry = new Script(`${source.slice(probeStart, probeEnd)}\n${source.slice(syncStart, syncEnd)}
    ({ probe: codexProbeColdRolloutActivity, sync: codexSyncRolloutDecisionTrackers })`)
  const threadId = 'synthetic-cold'
  const candidate = '/synthetic/cold.jsonl'
  const stat = { isFile: () => true, dev: 2, ino: 3, size: 14, mtimeMs: 305 }
  const match = { known: true, phase: 'active', turnId: 'current-turn', startedAt: 300 }
  const record = (type, timestamp, turnId = match.turnId) =>
    JSON.stringify({ type: 'event_msg', timestamp, payload: { type, turn_id: turnId } })
  const runtime = (...events) => rollout.codexRolloutRuntimeStateText(events.join('\n'))
  const sameTurnItem = record('item_completed', 330)
  const cases = [
    ['same Turn held by its writer', { expected: 'running' }],
    ['writer after sixteen inactive candidates', { earlierCandidates: 16, expected: 'running' }],
    ['same Turn item beyond the start window', { runtime: runtime(sameTurnItem), expected: 'running' }],
    ['same Turn item on a read-only descriptor', { runtime: runtime(sameTurnItem), access: 'r' }],
    ['different Turn item beyond the start window', { runtime: runtime(record('item_completed', 330, 'other-turn')) }],
    ['older item followed by unscoped activity', {
      runtime: runtime(record('item_completed', 290), record('token_count', 330, ''))
    }],
    ['late item cannot revive an ended Turn', {
      runtime: runtime(record('task_complete', 320), record('agent_reasoning', 325), sameTurnItem)
    }],
    ['read-only descriptor before and after publication', { access: 'r', background: true }],
    ['writer first observed after publication', { access: 'r', backgroundAccess: 'u', background: true, expected: 'running' }],
    ['writer first observed on the delayed probe', { access: 'r', retryAccess: 'u', background: true, expected: 'running' }],
    ['no writer after the delayed probe', { access: 'r', retryAccess: 'r', background: true }],
    ['writer from an old bridge stream', { access: 'r', backgroundAccess: 'u', background: true, replaceStream: true }],
    ['writer for a former Side parent', { access: 'r', backgroundAccess: 'u', background: true, replaceParent: true }],
    ['different Turn', { runtime: { ...match, turnId: 'other-turn' } }],
    ['rollout changed during read', { changedFile: true }],
    ['activity changed during probe', { dirty: true }],
    ['current Desktop owner', { shadow: { ownerClientId: 'desktop' } }],
    ['real idle interruption', { status: 'idle', exact: true, expected: 'stopped' }]
  ]
  for (const [name, changes] of cases) {
    const thread = { id: threadId, status: { type: changes.status || 'notLoaded' } }
    const earlier = Array.from({ length: changes.earlierCandidates || 0 }, (_, index) => ({
      id: `synthetic-earlier-${index}`, status: { type: 'notLoaded' }, path: `/synthetic/earlier-${index}.jsonl`
    }))
    const turn = { id: match.turnId, status: 'interrupted', startedAt: match.startedAt,
      ...(changes.exact ? { interruptedAt: 350 } : {}) }
    const known = { lastTurnId: turn.id, lastTurnStartedAt: turn.startedAt, status: thread.status.type, activeFlags: [],
      lastTurnStatus: turn.status, lastTurnEvidence: changes.exact ? 'targeted-after-exit' : 'inventory',
      terminalEvidenceSequence: changes.exact ? 350 : 0, idleConfirmed: changes.exact === true }
    const trackers = new Map()
    const dirty = new Map()
    const scheduled = []
    const desktop = { streamGeneration: 1, shadows: new Map([[threadId, changes.shadow]]),
      refreshSubscribedOwner() {}, parentThreadIdFor: () => parent }
    let parent = 'original-parent'
    let statReads = 0
    let backgroundProbes = 0
    const { probe, sync } = entry.runInNewContext({
      process: { platform: 'darwin' },
      execFile(command, args, { timeout }, callback) {
        assert.equal(command, '/usr/sbin/lsof')
        const cold = timeout === 750
        assert.deepEqual(Array.from(args), ['-n', '-Fpcfan', '--', ...(cold ? earlier.map(row => row.path) : []), candidate])
        if (!cold) backgroundProbes += 1
        const access = (backgroundProbes === 2 && changes.retryAccess)
          || (!cold && changes.backgroundAccess) || changes.access || 'u'
        callback(null, `p42\nccodex\nf10\na${access}\nn${candidate}\n`)
        if (!cold && changes.replaceStream) desktop.streamGeneration += 1
        if (!cold && changes.replaceParent) parent = 'new-parent'
      },
      fs: { statSync: () => ({ ...stat, size: stat.size + (changes.changedFile && statReads++ > 0 ? 1 : 0) }) },
      codexProcess: null, CODEX_COLD_ROLLOUT_PROBE_LIMIT: 16, CODEX_COLD_ROLLOUT_PROBE_TIMEOUT_MS: 750,
      codexThreadRolloutCandidate: row => ({ candidate: row.path || candidate, stat }), codexRolloutDecisionTrackers: trackers,
      codexThreadTurnStatusDirty: dirty, codexThreadPendingInputCache: new Map(),
      codexActivityInventory: new Map([[threadId, known]]),
      codexDesktopBridge: desktop,
      codexInventoryMembershipGeneration: 1, codexCausalDomain: 'source',
      codexSnapshotScopeCurrent: scope => scope.bridge === desktop && scope.stream === desktop.streamGeneration,
      codexSideParentThreadId: () => parent, codexRolloutProcessProbeGeneration: 1,
      codexRolloutProcessProbeTimer: null, codexRolloutProcessProbeInFlight: false,
      codexRolloutProcessProbePending: false, CODEX_ROLLOUT_PROCESS_PROBE_MS: 100,
      setTimeout(callback) { scheduled.push(callback); return 1 }, clearTimeout() {},
      validCodexThreadId: id => id === threadId, codexRecord: value => value ?? {},
      codexTimestampMs: Number, codexInventoryTerminalEvidence: () => known.lastTurnEvidence,
      codexIsConfirmedTurnEvidence: evidence => evidence === 'targeted-after-exit',
      codexHasConfirmedTerminalEvidence: () => changes.exact === true,
      codexRolloutDecisionState: () => ({ runtime: changes.runtime || match, input: { correlations: new Set() } }),
      codexApplyRolloutDecisionState(tracker, state, _emit, { observeRuntime, writable, appended }) {
        if (!observeRuntime || rollout.codexRolloutRuntimeForTurn(state.runtime, {
          known, owner: changes.shadow, confirmedTerminal: changes.exact, writable, appended
        })?.phase !== 'active') return false
        tracker.rolloutLiveSequence = 330
        Object.assign(known, { status: 'active', lastTurnStatus: 'inProgress', lastTurnEvidence: 'turn-started',
          appServerLiveActive: true, activeEvidenceSequence: 330, statusAuthority: 'app-server-live', activityEvidence: 'activity-event' })
        return true
      },
      codexArmRolloutDecisionWatcher() {}, codexRestoreRolloutFallback() {}, recordCodexTaskSync() {}
    })
    const latest = new Map([[threadId, turn]])
    const listed = [...earlier, thread]
    const opened = await probe(listed, {
      latest: new Map([...earlier.map(row => [row.id, { ...turn, id: `${row.id}-turn` }]), ...latest]),
      readSucceededIds: new Set(listed.map(row => row.id))
    })
    if (changes.dirty) dirty.set(threadId, 1)
    sync([thread], latest, opened, new Map())
    const snapshot = fixture()
    try {
      snapshot.publish([{ key: 'main', epoch: turn.startedAt, branch: known }], 1, { complete: true, hostEvidence: true })
      if (changes.background) {
        snapshot.expectRoot('unknown', false, 1)
        await scheduled[0]()
        if (changes.retryAccess) {
          assert.equal(known.appServerLiveActive, undefined, name)
          await scheduled[1]()
          if (changes.retryAccess === 'r') assert.equal(scheduled.length, 2, name)
        }
        snapshot.publish([{ key: 'main', epoch: turn.startedAt, branch: known }], 2, { hostEvidence: true })
      }
      const expected = changes.expected || 'unknown'
      assert.equal(snapshot.kernel.getLatest().tasks[0].phase, expected, name)
      assert.equal(snapshot.expectRoot(expected, false, 1).capabilities.continueTask, changes.exact === true, name)
    } finally { snapshot.kernel.close() }
  }
  const historical = `${record('task_started', 300)}\n${record('turn_aborted', 350)}\n`
  const append = (baseline, added) => rollout.codexRolloutRuntimeStateText(`${baseline}${added}`, Buffer.byteLength(added))
  const known = { lastTurnId: match.turnId, lastTurnStatus: 'interrupted', lastTurnStartedAt: 300 }
  const input = { known, cachedTurn: { id: match.turnId, interruptedAt: 350 }, confirmedTerminal: true, appended: true }
  const stale = append(historical, record('agent_reasoning', 375))
  assert.equal(rollout.codexRolloutRuntimeForTurn(stale, input), null, 'a reasoning line cannot reopen a confirmed interruption on its own')
  assert.equal(rollout.codexRolloutRuntimeForTurn(append(historical, record('item_completed', 375)), input),
    null, 'a late item cannot reopen a confirmed interruption')
  const restart = append(historical, `${record('task_started', 400)}\n${record('agent_reasoning', 401)}\n`)
  assert.equal(rollout.codexRolloutRuntimeForTurn(restart, input)?.phase, 'active', 'a new native start can resume the same Turn')
  const metadataOnly = append(`${record('task_started', 300)}\n`, '{"type":"session_meta"}\n')
  assert.equal(metadataOnly.appended, undefined, 'metadata bytes cannot restamp an unchanged runtime edge')
  const terminal = rollout.codexRolloutRuntimeStateText(historical)
  assert.equal(rollout.codexRolloutRuntimeForTurn(terminal, { known, writable: true })?.phase, 'interrupted')
  assert.equal(rollout.codexRolloutRuntimeForTurn(terminal, {
    known: { ...known, appServerLiveActive: true }, writable: true
  }), null, 'an unchanged terminal cannot retire a resumed native Turn')
  const completion = runtime(record('task_started', 300), record('task_complete', 350),
    record('token_count', 351, ''), record('item_completed', 352))
  assert.deepEqual([completion.phase, completion.turnId, completion.edgeAt], ['completed', match.turnId, 350],
    'usage or late item events preserve the exact completed Turn and its end time')
  const aborted = runtime(record('task_started', 300), record('turn_aborted', 350),
    record('token_count', 351, ''), record('agent_reasoning', 352, ''))
  assert.deepEqual([aborted.phase, aborted.turnId, aborted.interruptedAt], ['interrupted', match.turnId, 350],
    'unidentified work and usage do not erase the exact interrupted Turn')
  const afterCompletion = append(`${record('task_complete', 350)}\n`, record('token_count', 351, ''))
  assert.equal(afterCompletion.appended, undefined, 'a later usage append does not give the earlier terminal a new event revision')
  return cases.length + 8
}

async function checkColdUnreadRefresh(require, source) {
  const fields = require('./codex/inventory-turn-fields.cjs').createCodexInventoryTurnFields({ timestampMs: Number })
  const refreshStart = source.indexOf('  refreshPersistedUnread(')
  const refreshEnd = source.indexOf('\n  ensureUnreadStateWatcher()', refreshStart)
  const latestStart = source.indexOf('  scheduleLatestTurnRefresh(')
  const latestEnd = source.indexOf('\n  setState(', latestStart)
  const terminalStart = source.indexOf('function codexInventoryTerminalEvidence(')
  const terminalEnd = source.indexOf('\nfunction codexThreadHasPersistedPendingPlan(', terminalStart)
  assert(refreshStart >= 0 && refreshEnd > refreshStart && latestStart >= 0 && latestEnd > latestStart
    && terminalStart >= 0 && terminalEnd > terminalStart)
  const entry = new Script(`${source.slice(terminalStart, terminalEnd)}
    ({${source.slice(refreshStart, refreshEnd)}, ${source.slice(latestStart, latestEnd)}})`)
  const threadId = 'cold-root'
  const unreadIds = new Set([threadId])
  for (const scenario of ['baseline', 'weak-interruption', 'exact-interruption', 'idle-interruption']) {
    const idle = scenario === 'idle-interruption'
    const thread = {
      key: threadId, status: idle ? 'idle' : 'active', connectorStatus: idle ? 'idle' : 'notLoaded',
      lastTurnStartedAt: 300, lastTurnStatus: 'inProgress', lastTurnId: 'same-turn',
      unreadAuthority: 'desktop-persisted'
    }
    const turn = { id: 'same-turn', status: 'interrupted', startedAt: 300,
      ...(scenario === 'exact-interruption' ? { interruptedAt: 350 } : {}) }
    let turnReads = 0
    let published = 0
    const methods = entry.runInNewContext({
      validCodexThreadId: id => id === threadId, codexTimestampMs: Number, codexRecord: value => value ?? {},
      codexActivityInventory: new Map([[threadId, thread]]),
      codexInventorySideRelations: new Map(), codexInventorySideBranchEvidence: new Map(),
      codexThreadTurnStatusCache: new Map(), codexRolloutDecisionTrackers: new Map(),
      codexThreadTurnStatusDirty: new Map(), codexRetiredThreadIds: new Map(),
      currentCodexInventoryScope: () => ({ session: 1 }),
      codexSnapshotScopeCurrent: scope => scope.session === 1,
      codexSideParentThreadId: () => '',
      codexSubagentDiscovery: null, codexDesktopActivityResolution: null,
      codexInventoryTurnFieldsModule: fields,
      readCodexDesktopUnreadIds: () => unreadIds,
      codexDesktopShadow: { codexApplyNativeConnectorUnread: () => ({ applied: true, hasUnreadTurn: true }) },
      codexDesktopAggregateUnread: () => ({ hasUnreadTurn: true, unreadAuthority: 'desktop-persisted' }),
      codexActivityPublicEntry: value => value, recordCodexTaskSync() {}, codexNoteActivityDecision() {},
      CODEX_DESKTOP_TURN_REFRESH_DEADLINE_MS: 1000, CODEX_DESKTOP_TURN_REFRESH_DELAYS_MS: [0],
      requestCodexRpc: async (method, input) => {
        assert.equal(method, 'thread/turns/list')
        assert.equal(input.threadId, threadId)
        turnReads += 1
        return { data: [turn] }
      },
      sanitizeCodexTurnStatusPage: value => value.data[0],
      codexDesktopRequestCorrelation: () => '',
      codexApplyCachedCompletedTurnEvidence: () => false,
      codexThreadPersistedInputEvidence: () => null,
      codexClearAppServerLiveActive() {}, codexPrivateBranchIdleConfirmed: () => idle,
      codexMarkConfirmedTerminalEvidence: () => 350, codexRememberPrivateBranchTerminal() {},
      emitCodexActivityDelta() { published += 1 }
    })
    const bridge = {
      ...methods,
      inventory: new Set([threadId]),
      persistedUnread: scenario === 'baseline' ? new Map() : new Map([[threadId, false]]),
      shadows: new Map(), sideShadows: new Map(), turnRefreshes: new Map(),
      notePinMirror() {},
      notePersistedUnread(id, unread) {
        const changed = this.persistedUnread.get(id) !== unread
        this.persistedUnread.set(id, unread)
        return changed
      },
      parentLiveEvidenceSequence: () => idle ? 0 : 330,
      streamWriteContext: () => null, streamWriteCurrent: () => true,
      reconcileLateUnread(id, _unread, queryThreadId, { forceTerminalCheck }) {
        this.scheduleLatestTurnRefresh(id, { queryThreadId, forceQuery: forceTerminalCheck, verifyStaleActive: !idle })
      }
    }
    bridge.refreshPersistedUnread(false, { unreadIds, turnsRead: new Set([threadId]) })
    await new Promise(setImmediate)
    assert.equal(turnReads, scenario === 'baseline' ? 0 : 1, `${scenario}: use the accepted inventory history only for the initial read baseline`)
    assert.equal(bridge.persistedUnread.get(threadId), true, `${scenario}: record native unread`)
    const terminal = idle || scenario === 'exact-interruption'
    assert.equal(thread.lastTurnStatus, terminal ? 'interrupted' : 'inProgress', `${scenario}: stay running until a verified terminal`)
    assert.equal(published, terminal ? 1 : 0, `${scenario}: publish only a verified phase change`)
  }
  return 4
}

async function checkVerifiedInventorySharing(source) {
  const readStart = source.indexOf('function readVerifiedCodexInventory(')
  const readEnd = source.indexOf('\nasync function readCodexActivitySnapshot(', readStart)
  const scopeStart = source.indexOf('function codexSnapshotScopeCurrent(')
  const scopeEnd = source.indexOf('\nfunction scheduleCodexPendingRecovery(', scopeStart)
  const captureStart = source.indexOf('function currentCodexInventoryScope(')
  const captureEnd = source.indexOf('\nfunction invalidateCodexThreadList(', captureStart)
  assert(readStart >= 0 && readEnd > readStart && scopeStart >= 0 && scopeEnd > scopeStart
    && captureStart >= 0 && captureEnd > captureStart)
  const pending = []
  const supersededRead = Object.assign(new Error('inventory superseded'), { code: 'inventory-superseded' })
  const inventory = new Script(`let codexVerifiedInventoryInFlight = null
    ${source.slice(readStart, readEnd)}
    ${source.slice(scopeStart, scopeEnd)}
    ${source.slice(captureStart, captureEnd)}
    ({
      read: readVerifiedCodexInventory,
      reset: () => { codexInventoryMembershipGeneration += 1 },
      close: () => { codexStartupState.generation += 1 }
    })`).runInNewContext({
    codexDesktopBridge: { streamGeneration: 1 }, codexInventoryMembershipGeneration: 1, codexCausalDomain: 'source',
    codexInventoryListVersion: -1, codexThreadListVersion: 0, companionTaskKernel: null,
    codexStartupState: { generation: 1 }, noteCodexInventorySample() {},
    cacheVerifiedCodexInventory: value => value, reuseVerifiedCodexSnapshot: () => null,
    scanVerifiedCodexInventory: () => new Promise((resolve, reject) => pending.push({ resolve, reject }))
  })
  const first = inventory.read()
  assert.equal(inventory.read(), first, 'Main and Host share the same source read')
  assert.equal(pending.length, 1)
  inventory.reset()
  const replacement = inventory.read()
  assert.notEqual(replacement, first, 'a changed scope starts its own read')
  assert.equal(pending.length, 2)
  pending[0].reject(supersededRead)
  await new Promise(setImmediate)
  assert.equal(inventory.read(), replacement, 'superseded callers join the current in-flight read')
  pending[1].resolve('current')
  assert.deepEqual(await Promise.all([first, replacement]), ['current', 'current'])
  assert.equal(pending.length, 2, 'Host and Main sample the new generation once')
  const replacesOnce = inventory.read()
  inventory.reset()
  pending[2].reject(supersededRead)
  await new Promise(setImmediate)
  assert.equal(pending.length, 4)
  inventory.reset()
  pending[3].reject(supersededRead)
  await assert.rejects(replacesOnce, error => error === supersededRead)
  assert.equal(pending.length, 4, 'a single read cannot keep retrying across source churn')
  const pendingClose = inventory.read()
  inventory.close()
  pending[4].reject(supersededRead)
  await assert.rejects(pendingClose, error => error === supersededRead)
  assert.equal(pending.length, 5, 'an in-flight read must not restart a closed server')
  const membershipStart = source.indexOf('async function reconcileCodexInventoryMembership(')
  const membershipEnd = source.indexOf('\nfunction ensureCodexInventoryMembershipWatchers(', membershipStart)
  const listStart = source.indexOf('function listAllCodexThreads(')
  const listEnd = source.indexOf('\nasync function readCodexPinnedSectionOrder(', listStart)
  const scanStart = source.indexOf('async function scanVerifiedCodexInventory(')
  assert(membershipStart >= 0 && membershipEnd > membershipStart && scanStart >= 0 && readStart > scanStart
    && listStart >= 0 && listEnd > listStart)
  const listReads = []
  const recovered = []
  const emitted = []
  let queued = 0
  const endOfRoster = new Error('roster verified')
  const { reconcile, scan, rotate, knownNewerMembership, list } = new Script(`${source.slice(scopeStart, scopeEnd)}
    ${source.slice(captureStart, captureEnd)}
    ${source.slice(membershipStart, membershipEnd)}
    ${source.slice(listStart, listEnd)}
    ${source.slice(scanStart, readStart)}
    ({
      reconcile: () => reconcileCodexInventoryMembership('watcher-event', false, currentCodexInventoryScope()),
      scan: scanVerifiedCodexInventory,
      list: listAllCodexThreads,
      rotate: () => { codexDesktopBridge.streamGeneration += 1 },
      knownNewerMembership: () => { codexInventoryMembershipReconcilePending = true }
    })`).runInNewContext({
    codexDesktopBridge: { streamGeneration: 1 }, codexInventoryMembershipGeneration: 1, codexCausalDomain: 'source',
    codexInventoryMembershipEnabled: () => true,
    codexActivityInventory: new Map(), codexLocalArchiveRecoverySuppressions: new Set(),
    codexVerifiedOfficialThreadIds: new Set(), codexRosterForPreflight: null, codexDesktopSideRelations: new Map(),
    codexInventoryRefreshPending: false, codexInventoryMembershipReconcilePending: false, codexInventoryMembershipForcePending: false,
    companionTaskKernel: null, codexThreadTurnStatusDirty: new Map(),
    codexThreadListVersion: 0, codexThreadListSamples: new Map(), codexRetiredThreadIds: new Map(),
    codexRestoreDesktopSideRelationHints() {}, codexRuntimeDiagnostics: null,
    CODEX_THREAD_PAGE_SIZE: 100, noteCodexInventorySample() {},
    codexError: (code, message) => Object.assign(new Error(message), { code }),
    async requestCodexRpc(_method, { archived, sectionId }) {
      listReads.push(sectionId || archived)
      return { data: [{ id: archived ? 'archived' : `root-${listReads.length}` }] }
    },
    emitCodexActivityDelta(...args) { emitted.push(args) },
    queueCompanionHostReconciliation() { queued += 1 },
    runtimeDiagnostics: { record() {} }, readCodexNativeRegistry: () => ({}),
    recoverCodexThreadsMissingFromInventory(rows, _targets, archived) {
      recovered.push([rows[0].id, [...archived]])
      throw endOfRoster
    },
    validCodexThreadId: id => Boolean(id), codexRecord: value => value ?? {},
    codexThreadKey: id => id, CODEX_MISSING_ACTIVITY_MAPPING_RETENTION_MS: 100
  })
  assert.equal(await reconcile(), true)
  assert.equal(queued, 1, 'the membership observation owns one reconciliation')
  assert.equal(emitted[0][4].scheduleInventory, false, 'the membership delta does not queue the same work again')
  await assert.rejects(scan(), error => error === endOfRoster)
  assert.deepEqual(listReads, [false, true], 'the downstream preflight shares the verified lists')
  assert.equal(recovered[0][0], 'root-1')
  assert.deepEqual(Array.from(recovered[0][1]), ['archived'])
  await assert.rejects(scan(), error => error === endOfRoster)
  assert.deepEqual(listReads, [false, true], 'the same version still shares completed list samples')
  const pinned = { sectionId: 'pinned', maxPages: 5 }
  assert.equal(list(false, pinned), list(false, pinned), 'matching pinned queries share their own sample')
  await list(false, pinned)
  assert.deepEqual(listReads, [false, true, 'pinned'])
  await reconcile()
  rotate()
  await assert.rejects(scan(), error => error === endOfRoster)
  assert.deepEqual(listReads, [false, true, 'pinned', false], 'a new stream reads its own list')
  const queuesBefore = queued
  const superseded = reconcile()
  knownNewerMembership()
  assert.equal(await superseded, false, 'a newer membership signal prevents publishing the older sample')
  assert.equal(queued, queuesBefore)
  return 9
}

async function checkTurnReadScope(require, source) {
  const codexInventoryTurnFieldsModule = require('./codex/inventory-turn-fields.cjs').createCodexInventoryTurnFields({ timestampMs: Number })
  const proofStart = source.indexOf('function codexRolloutProof(')
  const proofEnd = source.indexOf('\nfunction codexPrivateBranchRef(', proofStart)
  const readStart = source.indexOf('async function readCodexThreadTurnStatuses(')
  const readEnd = source.indexOf('\nfunction sanitizeCodexThreads(', readStart)
  assert(proofStart >= 0 && proofEnd > proofStart && readStart >= 0 && readEnd > readStart)
  const member = { id: 'root', status: { type: 'active' } }
  for (const sourceChanged of [true, false]) {
    const turnCache = new Map()
    const dirty = new Map()
    const pending = []
    let session = 1
    const read = new Script(`${source.slice(proofStart, proofEnd)}
      ${source.slice(readStart, readEnd)}
      readCodexThreadTurnStatuses`).runInNewContext({
      codexThreadTurnStatusCache: turnCache, codexThreadTurnStatusDirty: dirty,
      codexInventoryTurnFieldsModule,
      codexRetiredThreadIds: new Map(), codexSubagentDiscovery: null,
      currentCodexInventoryScope: () => ({ session }),
      codexSnapshotScopeCurrent: scope => scope.session === session,
      codexRecord: value => value ?? {}, codexSideParentThreadId: () => '',
      codexThreadRolloutCandidate: () => null,
      sanitizeCodexTurnStatusPage: page => page.data[0],
      requestCodexRpc: () => new Promise(resolve => pending.push(resolve)),
      CODEX_THREAD_TURN_STATUS_CONCURRENCY: 1, CODEX_THREAD_TURN_STATUS_TIMEOUT_MS: 50
    })
    const query = read([member])
    assert.equal(pending.length, 1)
    const current = { turn: { id: 'current', status: 'inProgress', startedAt: 500 } }
    turnCache.set(member.id, current)
    if (sourceChanged) session += 1
    else dirty.set(member.id, 1)
    const before = { data: [{ id: 'old', status: 'completed', startedAt: 100 }] }
    pending[0](before)
    await new Promise(setImmediate)
    assert.equal(turnCache.get(member.id), current, 'a stale Turn response cannot overwrite current cached evidence')
    assert.equal(pending.length, sourceChanged ? 1 : 2, 'retry only the member and only inside the original source')
    if (!sourceChanged) pending[1](before)
    await query
    assert.equal(turnCache.get(member.id), current, 'a targeted retry cannot regress the admitted Turn')
  }
  const historical = { ...member, status: { type: 'notLoaded' } }
  let readCount = 0
  let inode = 2
  let listVersion = 1
  const readHistory = new Script(`${source.slice(proofStart, proofEnd)}
    ${source.slice(readStart, readEnd)}
    readCodexThreadTurnStatuses`).runInNewContext({
    codexThreadTurnStatusCache: new Map(), codexThreadTurnStatusDirty: new Map(),
    codexInventoryTurnFieldsModule,
    codexRetiredThreadIds: new Map(), codexSubagentDiscovery: null,
    currentCodexInventoryScope: () => ({ session: 1, listVersion }),
    codexSnapshotScopeCurrent: scope => scope.session === 1 && (scope.listVersion == null || scope.listVersion === listVersion),
    codexRecord: value => value ?? {}, codexSideParentThreadId: () => '',
    codexThreadRolloutCandidate: () => ({ candidate: '/synthetic/root.jsonl', stat: { dev: 1, ino: inode, size: 100, mtimeMs: 500 } }),
    sanitizeCodexTurnStatusPage: page => page.data[0],
    async requestCodexRpc() {
      readCount += 1
      return { data: [{ id: 'verified', status: 'completed', startedAt: 100 }] }
    },
    CODEX_THREAD_TURN_STATUS_CONCURRENCY: 1, CODEX_THREAD_TURN_STATUS_TIMEOUT_MS: 50
  })
  await readHistory([historical])
  listVersion += 1
  assert.equal((await readHistory([historical])).latest.get(historical.id).id, 'verified')
  assert.equal(readCount, 1, 'a new list sample can reuse the verified unchanged member history')
  inode += 1
  await readHistory([historical])
  assert.equal(readCount, 2, 'a replaced rollout triggers just the affected member read')
  for (const [label, page] of [
    ['malformed Turn', { data: [{ id: 'unparseable' }] }],
    ['empty page with a cursor', { data: [], nextCursor: 'older' }]
  ]) {
    const cached = { turn: { id: 'verified', status: 'completed', startedAt: 100 } }
    const turnCache = new Map([[member.id, cached]])
    let requests = 0
    const readUnresolved = new Script(`${source.slice(proofStart, proofEnd)}
      ${source.slice(readStart, readEnd)}
      readCodexThreadTurnStatuses`).runInNewContext({
      codexThreadTurnStatusCache: turnCache, codexThreadTurnStatusDirty: new Map(),
      codexRetiredThreadIds: new Map(), codexSubagentDiscovery: null,
      codexInventoryTurnFieldsModule,
      currentCodexInventoryScope: () => ({ session: 1 }),
      codexSnapshotScopeCurrent: scope => scope.session === 1,
      codexRecord: value => value ?? {}, codexSideParentThreadId: () => '',
      codexThreadRolloutCandidate: () => null, sanitizeCodexTurnStatusPage: () => null,
      runtimeDiagnostics: { record() {} },
      async requestCodexRpc() { requests += 1; return page },
      CODEX_THREAD_TURN_STATUS_CONCURRENCY: 1, CODEX_THREAD_TURN_STATUS_TIMEOUT_MS: 50
    })
    const result = await readUnresolved([member])
    assert(result.unresolvedIds.has(member.id), `${label} leaves the registered member pending verification`)
    assert(!result.nonConversationIds.has(member.id), `${label} cannot prove an empty history`)
    assert.equal(turnCache.get(member.id), cached, `${label} cannot remove previously verified history`)
    assert.equal(requests, 2, `${label} retries only its own member within the existing bound`)
  }
  const previous = { id: 'same-second-previous', status: 'completed', startedAt: 1000 }
  const incoming = { id: 'same-second-incoming', status: 'inProgress', startedAt: 1000 }
  for (const [label, orderedRows, expected, predecessor, verifying] of [
    ['native order advances the Turn', [incoming, previous], incoming.id, previous.id, false],
    ['native order identifies a late older Turn', [previous, incoming], previous.id, undefined, false],
    ['unrelated history cannot order the Turns', [incoming, { ...previous, id: 'different' }], previous.id, undefined, true]
  ]) {
    const cache = new Map([[member.id, { turn: previous }]])
    const limits = []
    const readOrdered = new Script(`${source.slice(proofStart, proofEnd)}
      ${source.slice(readStart, readEnd)}
      readCodexThreadTurnStatuses`).runInNewContext({
      codexThreadTurnStatusCache: cache, codexThreadTurnStatusDirty: new Map(),
      codexRetiredThreadIds: new Map(), codexSubagentDiscovery: null, codexInventoryTurnFieldsModule,
      currentCodexInventoryScope: () => ({ session: 1 }),
      codexSnapshotScopeCurrent: scope => scope.session === 1,
      codexRecord: value => value ?? {}, codexSideParentThreadId: () => '',
      codexThreadRolloutCandidate: () => null,
      sanitizeCodexTurnStatusPage: codexInventoryTurnFieldsModule.sanitizeCodexTurnStatusPage,
      sanitizeCodexTurnStatus: codexInventoryTurnFieldsModule.sanitizeCodexTurnStatus,
      async requestCodexRpc(_, { limit }) {
        limits.push(limit)
        return { data: limit === 1 ? [incoming] : orderedRows }
      },
      CODEX_THREAD_TURN_STATUS_CONCURRENCY: 1, CODEX_THREAD_TURN_STATUS_TIMEOUT_MS: 50
    })
    const result = await readOrdered([member])
    assert.equal(result.unresolvedIds.has(member.id), verifying, label)
    assert.equal(cache.get(member.id).turn.id, expected, label)
    assert.equal(cache.get(member.id).turn.predecessorId, predecessor, label)
    assert.deepEqual(limits, verifying ? [1, 2, 1, 2] : [1, 2], label)
  }
  const merged = codexInventoryTurnFieldsModule.codexMergedInventoryTurnFields({
    lastTurnId: incoming.id, lastTurnStatus: incoming.status, lastTurnStartedAt: incoming.startedAt,
    turnPredecessorId: previous.id
  }, { lastTurnId: previous.id, lastTurnStatus: previous.status, lastTurnStartedAt: previous.startedAt })
  assert.deepEqual([merged.lastTurnId, merged.lastTurnStatus, merged.turnPredecessorId],
    [incoming.id, incoming.status, previous.id], 'Host projection preserves a proven successor and its identity')
  const unproven = codexInventoryTurnFieldsModule.codexMergedInventoryTurnFields({
    lastTurnId: incoming.id, lastTurnStatus: 'completed', lastTurnStartedAt: incoming.startedAt, lastTurnCompletedAt: 1_002
  }, { lastTurnId: previous.id, lastTurnStatus: previous.status, lastTurnStartedAt: previous.startedAt })
  assert.equal(unproven.lastTurnId, previous.id, 'an unproven same-second completion cannot replace a retained completion')
  return 10
}

async function checkTargetedTurnReadScope(require, source) {
  const fields = require('./codex/inventory-turn-fields.cjs').createCodexInventoryTurnFields({ timestampMs: Number })
  const start = source.indexOf('  scheduleLatestTurnRefresh(threadId, options = {}) {')
  const end = source.indexOf('\n  setState(state)', start)
  assert(start >= 0 && end > start)
  const currentTurn = { id: 'current', status: 'inProgress', startedAt: 1_000 }
  const oldTurn = { id: 'old', status: 'completed', startedAt: 1_000, completedAt: 1_001 }
  const nextTurn = { id: 'next', status: 'completed', startedAt: 1_000, completedAt: 1_002 }
  const scenarios = [
    { label: 'complete empty history retires an absent Side', sidePage: { data: [] }, retirements: 1 },
    { label: 'a forward cursor keeps the Side', sidePage: { data: [], nextCursor: 'opaque' }, retirements: 0 },
    { label: 'a backwards cursor keeps the Side', sidePage: { data: [], backwardsCursor: 'opaque' }, retirements: 0 },
    { label: 'a same-second older terminal cannot replace current activity', turn: oldTurn, history: [currentTurn, oldTurn], expected: currentTurn },
    { label: 'a same-second verified successor can settle the current activity', turn: nextTurn, history: [nextTurn, currentTurn], expected: nextTurn },
    { label: 'an unordered same-second terminal remains pending', turn: nextTurn, history: [nextTurn, oldTurn], expected: currentTurn, retries: true },
    { label: 'a result from the replaced source cannot write a terminal', turn: nextTurn, replaceSource: true, expected: currentTurn },
    { label: 'a result behind the member evidence watermark cannot write a terminal', turn: nextTurn, advanceEvidence: true, expected: currentTurn }
  ]
  for (const scenario of scenarios) {
    const scenarioSide = Boolean(scenario.sidePage)
    const queryId = scenarioSide ? 'side' : 'root'
    const known = { status: scenarioSide ? 'active' : 'idle', lastTurnId: currentTurn.id,
      lastTurnStartedAt: currentTurn.startedAt, lastTurnStatus: currentTurn.status }
    const inventory = new Map([['root', known]])
    const cache = new Map([['root', { turn: currentTurn }]])
    const dirty = new Map()
    const timers = []
    const limits = []
    let session = 1
    let retirements = 0
    let sidePage = scenario.sidePage
    const refresh = new Script(`({${source.slice(start, end)}}).scheduleLatestTurnRefresh`).runInNewContext({
      validCodexThreadId: id => typeof id === 'string' && id.length > 0,
      codexTimestampMs: value => Number(value) || 0,
      codexRecord: value => value ?? {},
      codexActivityInventory: inventory,
      codexInventorySideBranchEvidence: new Map(),
      codexThreadTurnStatusCache: cache,
      codexThreadTurnStatusDirty: dirty,
      codexRetiredThreadIds: new Map(),
      codexSubagentDiscovery: null,
      codexDesktopActivityResolution: null,
      codexInventoryTurnFieldsModule: fields,
      currentCodexInventoryScope: () => ({ session }),
      codexSnapshotScopeCurrent: scope => scope.session === session,
      codexSideParentThreadId: id => id === 'side' ? 'root' : '',
      codexAppServerSideActivity: () => null,
      codexApplyCachedCompletedTurnEvidence: () => false,
      codexClearAppServerLiveActive() {},
      codexNoteActivityDecision() {},
      markCodexThreadTurnStatusDirty() {},
      emitCodexActivityDelta() {},
      sanitizeCodexTurnStatusPage: fields.sanitizeCodexTurnStatusPage,
      async requestCodexRpc(_, { limit }) {
        limits.push(limit)
        if (scenario.replaceSource) session += 1
        if (scenario.advanceEvidence) dirty.set(queryId, 1)
        return sidePage || { data: limit === 2 ? scenario.history : [scenario.turn] }
      },
      setTimeout(callback) { timers.push(callback); return {} },
      clearTimeout() {},
      CODEX_DESKTOP_TURN_REFRESH_DEADLINE_MS: 10_000,
      CODEX_DESKTOP_TURN_REFRESH_DELAYS_MS: [0, 300, 1_000],
      CODEX_COMPLETION_EVENT_REFRESH_DELAYS_MS: [0]
    })
    const bridge = {
      sideShadows: new Map(), shadows: new Map(), turnRefreshes: new Map(),
      parentLiveEvidenceSequence: () => 0, streamWriteContext: () => ({}), streamWriteCurrent: () => true,
      cancelLatestTurnRefreshByKey(key) { this.turnRefreshes.delete(key) },
      retireMissingDesktopSide() { retirements += 1; return true },
      publishTargetedCompletion() {}
    }
    const options = { queryThreadId: queryId, verifyStaleActive: scenarioSide,
      settleSnapshotTerminal: scenarioSide, snapshotThreadId: queryId, snapshotActivityRevision: 1 }
    const finishReads = async () => {
      await new Promise(setImmediate)
      while (timers.length) {
        timers.shift()()
        await new Promise(setImmediate)
      }
    }
    refresh.call(bridge, 'root', options)
    await finishReads()
    if (scenarioSide) {
      assert.equal(retirements, scenario.retirements, scenario.label)
      assert.deepEqual(limits, [1, 1, 1], scenario.label)
      if (!scenario.retirements) {
        inventory.set('root', { ...known })
        sidePage = { data: [] }
        refresh.call(bridge, 'root', options)
        await finishReads()
        assert.deepEqual(limits, [1, 1, 1], 'reprojecting the parent must not restart the same failed Side verification')
        refresh.call(bridge, 'root', { ...options, snapshotActivityRevision: 2 })
        await finishReads()
        assert.equal(retirements, 1, 'new native evidence may start another bounded Side verification')
      }
    } else {
      assert.equal(known.lastTurnId, scenario.expected.id, scenario.label)
      assert.equal(cache.get('root').turn.id, scenario.expected.id, scenario.label)
      assert.deepEqual(limits, scenario.retries ? [1, 2, 1, 2, 1, 2] : scenario.history ? [1, 2] : [1], scenario.label)
      if (scenario.expected === nextTurn) assert.equal(cache.get('root').turn.predecessorId, currentTurn.id)
    }
  }
  return scenarios.length
}

function checkRolloutTailSampleReuse(source) {
  const start = source.indexOf('function codexReadRolloutTail(')
  const end = source.indexOf('\nfunction codexThreadPersistedInputEvidence(', start)
  assert(start >= 0 && end > start)
  const text = Buffer.from('older\nsecond\nlatest\n')
  const sample = { dev: 1, ino: 2, size: text.length, mtimeMs: 500 }
  const cached = new Map()
  let reads = 0
  let observed = sample
  const readTail = new Script(`${source.slice(start, end)}\ncodexReadRolloutTail`).runInNewContext({
    Buffer, codexRolloutTailSamples: cached, codexRolloutTailCacheBytes: 0, CODEX_ROLLOUT_TAIL_CACHE_BYTES: 64,
    fs: { openSync: () => 1, closeSync() {}, fstatSync: () => observed,
      readSync(_descriptor, output, offset, size, position) {
        reads++
        return text.copy(output, offset, position, position + size)
      }
    }
  })
  assert.equal(readTail('/synthetic/turn.jsonl', sample, 64), text.toString())
  assert.equal(readTail('/synthetic/turn.jsonl', sample, 11), 'latest\n')
  assert.equal(reads, 1, 'a narrower view reuses the same stable read')
  observed = { ...sample, ino: 4 }
  assert.equal(readTail('/synthetic/turn.jsonl', { ...sample, ino: 3 }, 64), '')
  assert.equal(readTail('/synthetic/turn.jsonl', observed, 64), text.toString())
  assert.equal(reads, 3, 'a replaced file cannot use the old sample')
  return 1
}

function checkInventoryProjectAssignments(source) {
  const start = source.indexOf('function codexThreadNativeProject(')
  const end = source.indexOf('\nfunction sanitizeCodexTurnStatus(', start)
  assert(start >= 0 && end > start)
  const { assign } = new Script(`${source.slice(start, end)}
    ({ assign: codexInventoryProjectAssignments })`).runInNewContext({
    codexNormalizeNativeRoot: value => value,
    codexError: (code, message) => Object.assign(new Error(message), { code }),
    process: { platform: 'darwin' },
    path: { sep: '/' }
  })
  const primary = { key: 'primary', roots: ['/work/primary', '/work/shared'] }
  const secondary = { key: 'secondary', roots: ['/work/secondary', '/work/shared'] }
  const registry = { assignments: new Map([['root', 'primary']]), projectById: new Map([['primary', primary]]),
    projectlessThreadIds: new Set(), projects: [primary, secondary] }
  const child = { id: 'child', cwd: '/work/shared/child' }
  const root = { id: 'root', cwd: '/work/shared' }
  const other = { id: 'other', cwd: '/work/secondary' }
  const linked = assign([child, root, other], registry, new Map([['child', 'root']]))
  assert.equal(linked.assignments.get(child.id), linked.assignments.get(root.id))
  assert.equal(linked.sideRelations.get(child.id), root.id)
  assert.equal(linked.assignments.get(other.id).project, secondary)
  const outside = { id: 'outside', cwd: '/elsewhere' }
  const fallback = assign([other, outside], registry, new Map([[other.id, outside.id]]))
  assert.equal(fallback.assignments.get(other.id).project, secondary)
  assert.equal(fallback.sideRelations.size, 0)
  assert.throws(() => assign([child], registry, new Map()), /native project roots are ambiguous/)
  return 3
}

function checkMemberRequestWatermarks(source, fixture) {
  const deltaStart = source.indexOf('function codexActivityDelta(')
  const deltaEnd = source.indexOf('\nfunction sampleCodexActivityEvidence(', deltaStart)
  const emitStart = source.indexOf('function emitCodexActivityDelta(')
  const emitEnd = source.indexOf('\nfunction registerCodexLiveThreadMembership(', emitStart)
  assert(deltaStart >= 0 && deltaEnd > deltaStart && emitStart >= 0 && emitEnd > emitStart)
  const host = new Script(`${source.slice(deltaStart, deltaEnd)}
    ${source.slice(emitStart, emitEnd)}
    emitCodexActivityDelta`)
  const provider = 'codex'
  const set = (taskKey, requestSetRevision) => ({
    revision: 'companion-interaction-evidence-v1', provider, taskKey, requestSetRevision, complete: true
  })
  const request = requestSetRevision => ({
    revision: 'companion-interaction-evidence-v1', provider, taskKey: 'side-b', branchRef: 'side-b',
    interactionRef: 'b'.repeat(32), kind: 'user-input', state: 'opened', sequence: requestSetRevision,
    requestSetRevision, turnEpoch: 100, authority: 'provider-live', exact: true
  })
  for (const coverSideB of [true, false]) {
    const snapshot = fixture()
    const delivered = []
    const apply = delta => {
      delivered.push(delta)
      return Boolean(snapshot.publishRequests(delta.interactions || [], delta.interactionSets || [], delta.generation))
    }
    const emit = host.runInNewContext({
      codexRecord: value => value ?? {}, codexActivityPublicEntry: value => value,
      codexActivitySourceFingerprint: 'source', codexActivityGeneration: 100,
      codexActivityBridgeFingerprint: 'source\0connected\0clear',
      codexDesktopBridge: { state: 'connected', hasDegradedStreams: () => false },
      codexCompleteRequestSetRevisions: new Map(), codexInteractionSemanticFingerprints: new Map(), codexRequestSetProviderEpoch: undefined,
      codexInventoryRefreshPending: false, codexActivityListeners: new Set([apply]),
      applyCodexActivityToCompanionKernel: apply, companionTaskKernel: snapshot.kernel,
      companionDiagnosticTaskRef: (_provider, key) => key, codexActivityDecisionDiagnostics: () => ({}),
      companionV7Revisions: { interaction: 'companion-interaction-evidence-v1' },
      runtimeDiagnostics: { record() {} }
    })
    const send = (interactionSets, interactions = []) => emit([], false, 'normal', [], {
      interactionEvidence: { taskKey: 'main', interactionSets, interactions }
    })
    try {
      const rows = [{ key: 'main' }, { key: 'side-a' }, { key: 'side-b' }]
      const first = snapshot.publish(rows, 1, { complete: true, hostEvidence: true })
      const replay = snapshot.publish(rows, 1, { complete: true, hostEvidence: true })
      assert.equal(replay.tasks, first.tasks, 'the same inventory version reuses its task projection')
      assert.equal(replay.views, first.views)
      assert.equal(replay.packageRevision, first.packageRevision)
      assert.equal(send([set('side-a', 20)]), true)
      const revision = snapshot.kernel.getPackage().packageRevision
      if (coverSideB) {
        assert.equal(send([set('side-a', 20), set('side-b', 30)]), true, 'Side B coverage reaches Kernel independently')
        assert.equal(delivered.at(-1).interactionSets.at(-1).requestSetRevision, 30)
        assert.equal(snapshot.kernel.getPackage().packageRevision, revision, 'new coverage alone need not publish a package')
        assert.equal(send([set('side-a', 20), set('side-b', 30)]), false, 'identical full coverage does not enter V7 again')
        const prior = snapshot.kernel.getPackage()
        snapshot.publishRequests([], [set('side-b', 40)], 200)
        assert.equal(snapshot.kernel.getPackage().sourceLaneGenerations.codex.interaction, 200)
        assert.equal(snapshot.kernel.getPackage().tasks, prior.tasks, 'advancing existing coverage reuses the task projection')
        assert.equal(snapshot.kernel.getPackage().views, prior.views)
      }
      assert.equal(send([], [request(25)]), true)
      snapshot.expectRoot(coverSideB ? 'completed' : 'waiting-input', false, 3)
      if (coverSideB) {
        assert.equal(send([], [request(41)]), true)
        snapshot.expectRoot('waiting-input', false, 3)
      }
    } finally {
      snapshot.kernel.close()
    }
  }
  return 6
}

async function checkAttentionSettlement(fixture) {
  const rows = [
    { key: 'task-b', lastQuestionAt: 300, phase: 'waiting-input' },
    { key: 'task-a', lastQuestionAt: 200, phase: 'waiting-input' },
    { key: 'task-c', lastQuestionAt: 100, phase: 'waiting-input' }
  ]
  const publishOptions = { independent: true, complete: true, hostEvidence: true }
  for (const replaceRequest of [false, true]) {
    let inFlight
    const calls = []
    const snapshot = fixture(async (target) => {
      calls.push(target.key)
      if (calls.length !== 2) return { outcome: 'dispatched' }
      return new Promise(resolve => { inFlight = resolve })
    })
    try {
      snapshot.publish(rows, 1, publishOptions)
      assert.deepEqual(snapshot.kernel.getPackage().views.cycleKeys, ['task-b', 'task-a', 'task-c'])
      await snapshot.kernel.dispatch({ action: 'cycle', direction: 1 })
      assert.equal(snapshot.kernel.diagnostics().navigation.cursorKey, 'task-b')
      const first = snapshot.kernel.dispatch({ action: 'open-attention', kind: 'input', source: 'global-shortcut' })
      for (let index = 0; !inFlight && index < 20; index += 1) await Promise.resolve()
      assert.equal(typeof inFlight, 'function')
      assert.deepEqual(calls, ['task-b', 'task-a'])
      snapshot.publish(rows.map(row => row.key !== 'task-a' ? row : {
        ...row, lastQuestionAt: 400, ...(replaceRequest ? { requestRef: 'a'.repeat(32) } : {})
      }), 2, publishOptions)
      assert.deepEqual(snapshot.kernel.getPackage().views.cycleKeys, ['task-a', 'task-b', 'task-c'])
      inFlight({ outcome: 'dispatched' })
      assert.equal((await first).outcome, 'dispatched')
      assert.equal(snapshot.kernel.diagnostics().navigation.cursorKey, replaceRequest ? 'task-b' : 'task-a')
      await snapshot.kernel.dispatch({ action: 'open-attention', kind: 'input', source: 'global-shortcut' })
      assert.equal(calls.at(-1), replaceRequest ? 'task-a' : 'task-c')
    } finally {
      snapshot.kernel.close()
    }
  }
  for (const firstOutcome of ['dispatched', 'failed', 'unavailable']) {
    let inFlight
    let attempts = 0
    const snapshot = fixture(async () => {
      attempts += 1
      if (attempts !== 1) return { outcome: 'dispatched' }
      return new Promise(resolve => { inFlight = resolve })
    })
    try {
      snapshot.publish([{ key: 'main', phase: 'running' }], 1, { complete: true, hostEvidence: true })
      const first = snapshot.kernel.dispatch({ action: 'cycle', direction: 1, operationId: 'first-open' })
      for (let index = 0; !inFlight && index < 20; index += 1) await Promise.resolve()
      assert.equal(typeof inFlight, 'function')
      const tail = snapshot.kernel.dispatch({ action: 'cycle', direction: 1, operationId: 'tail-open' })
      inFlight({
        outcome: firstOutcome,
        ...(firstOutcome === 'unavailable' ? { errorCode: 'dispatch-unconfirmed' } : {})
      })
      assert.equal((await first).outcome, firstOutcome)
      const tailResult = await tail
      assert.equal(tailResult.operationId, 'tail-open')
      assert.equal(attempts, firstOutcome === 'failed' ? 2 : 1)
      if (firstOutcome === 'unavailable') {
        assert.equal(tailResult.outcome, 'unavailable', 'a pending native outcome cannot settle a queued tail as opened')
        assert.equal(snapshot.kernel.diagnostics().navigation.cursorKey, '')
        const nextPress = await snapshot.kernel.dispatch({ action: 'cycle', direction: 1, operationId: 'new-press' })
        assert.equal(nextPress.outcome, 'dispatched')
        assert.equal(attempts, 2, 'a fresh explicit press can try again after an unconfirmed native outcome')
      }
    } finally {
      snapshot.kernel.close()
    }
  }
  return 5
}

async function checkInFlightShortcutRetention(fixture) {
  let finishOpen
  let attempts = 0
  const snapshot = fixture(async () => {
    attempts += 1
    if (attempts > 1) return { outcome: 'dispatched' }
    return new Promise(resolve => { finishOpen = resolve })
  })
  try {
    snapshot.publish([{ key: 'main', phase: 'running' }], 1, { complete: true, hostEvidence: true })
    const request = { action: 'cycle', direction: 1, operationId: 'retained-open' }
    const first = snapshot.kernel.dispatch(request)
    await new Promise(setImmediate)
    assert.equal(typeof finishOpen, 'function')
    for (let index = 0; index < 501; index += 1) {
      await snapshot.kernel.dispatch({ action: 'focus', key: 'main', operationId: `churn-${index}` })
    }
    const duplicate = snapshot.kernel.dispatch(request)
    assert.equal(duplicate, first, 'settled command history cannot evict an in-flight operation')
    finishOpen({ outcome: 'dispatched' })
    assert.equal((await duplicate).outcome, 'dispatched')
    assert.equal(attempts, 1, 'the original operation dispatches to the provider once')
  } finally { snapshot.kernel.close() }
  return 1
}

async function checkStableShortcutRing(fixture) {
  const rows = [
    { key: 'main', phase: 'running', lastQuestionAt: 300 },
    { key: 'second', phase: 'running', lastQuestionAt: 200 },
    { key: 'third', phase: 'running', lastQuestionAt: 100 }
  ]
  const snapshot = fixture()
  const options = { independent: true, complete: true, hostEvidence: true }
  try {
    snapshot.publish(rows, 1, options)
    await snapshot.kernel.dispatch({ action: 'cycle', direction: 1 })
    const rebuilds = snapshot.kernel.diagnostics().navigation.ringRebuildCount
    assert(Number.isInteger(rebuilds))
    for (let index = 0; index < 20; index += 1) {
      const result = await snapshot.kernel.dispatch({ action: 'cycle', direction: 1 })
      assert.equal(result.outcome, 'dispatched')
    }
    const before = snapshot.kernel.getPackage()
    snapshot.publish(rows, 2, options)
    const advanced = snapshot.kernel.getPackage()
    assert.equal(advanced.sourceLaneGenerations.codex.activity, 2)
    assert.equal(advanced.tasks, before.tasks, 'new watermarks with the same facts reuse task projection')
    assert.equal(advanced.views, before.views, 'new watermarks with the same facts reuse views')
    snapshot.publish(rows.map(row => row.key === 'main' ? { ...row, lastQuestionAt: 301 } : row), 3, options)
    assert.deepEqual(snapshot.kernel.getPackage().views.cycleKeys, rows.map(row => row.key))
    assert.equal(snapshot.kernel.diagnostics().navigation.ringRebuildCount, rebuilds,
      'stable keys reuse the same ring through presses and metadata updates')
  } finally { snapshot.kernel.close() }
  return 1
}

export async function checkCompanionLifecycles(assetRoot) {
  const require = createRequire(resolve(assetRoot, 'index.js'))
  const { createCompanionTaskKernel } = require('./companion/task-kernel.cjs')
  const { createCompanionOpenReadiness } = require('./companion/open-readiness.cjs')
  const { createEvidenceNodeV7, createEvidenceBatchV7, codexBranchObservationV7 } = require('./companion/evidence-adapter-v7.cjs')
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
    function publishRequests(interactions, interactionSets, generation) {
      const current = kernel.getPackage()
      const laneGenerations = { ...current.sourceLaneGenerations.codex, interaction: generation }
      const batch = createEvidenceBatchV7({ provider: 'codex', interactions, interactionSets, laneGenerations, health: 'ready' })
      return kernel.publishEvidence({ schema: 'companion-task-evidence-draft-v7', producer: 'host-evidence',
        draftRevision: ++transport, acceptedAt: 1000, enabled: true, complete: true, providers,
        sourceGenerations: { codex: generation }, sourceLaneGenerations: { codex: laneGenerations },
        evidenceBatches: { codex: batch } })
    }
    function publish(rows, generation, { complete = false, remove = [], unreadGeneration = generation,
      activityGeneration = generation, hostEvidence = false, independent = false } = {}) {
      const family = 'codex:lifecycle'
      const nodes = rows.map(({ key, phase = 'completed', epoch = 100, unread = false, known = true, branch, lastQuestionAt = 100,
        closedMachineRun, machineRunCoverageCurrent, machineRunInterruptedAt, relationOnly, goalVerifying, capabilities,
        turnStartedAt = phase === 'unknown' ? 0 : epoch }) => {
        const root = independent || key === 'main'
        return createEvidenceNodeV7({
        key, provider: 'codex', family: independent ? `codex:${key}` : family, role: root ? 'root' : 'child', standaloneEligible: root,
        observedAt: epoch + (phase === 'completed' ? 10 : 0), causalKey: `${key}:${epoch}`,
        capabilities: capabilities || (root ? branch ? ['open', 'archive', 'continue-task'] : ['open', 'archive'] : []),
        metadata: { kind: root ? 'codex-thread' : 'topology-child',
          actionAlias: root ? `ct_lifecycle_${key}_1234567890` : '',
          revisionAt: epoch, membershipRevision: generation, visibilityRevision: generation, metadataRevision: generation,
          lastQuestionAt, createdAt: 50, closedMachineRun, machineRunCoverageCurrent, machineRunInterruptedAt, relationOnly,
          idleConfirmed: branch?.idleConfirmed === true },
        observation: branch ? codexBranchObservationV7({ branchKind: root ? 'main' : 'side',
          status: 'idle', lastTurnStatus: phase === 'unknown' ? undefined : phase === 'stopped' ? 'interrupted' : 'completed',
          goalStatus: 'none', goalFreshness: 'fresh',
          lastTurnEvidence: 'targeted-after-exit', terminalEvidenceSequence: epoch + 1, causalKey: `${key}:${epoch}`,
          causalDomain: 'native-domain', observedAt: epoch + 10, turnStartedAt, terminalAt: turnStartedAt,
          unreadKnown: known, hasUnreadTurn: unread, ...branch })
          : phase === 'unknown' && (relationOnly || goalVerifying)
          ? codexBranchObservationV7({ observedAt: epoch, turnStartedAt, relationOnly,
            goalStatus: 'unknown', goalFreshness: 'verifying', unreadKnown: known, hasUnreadTurn: unread })
          : { kind: phase === 'running' ? 'turn-running' : phase === 'stopped' ? 'turn-interrupted'
            : phase === 'unknown' ? 'unknown' : 'turn-completed', authority: 'live-turn', exact: phase !== 'unknown',
          sequence: epoch + (phase === 'completed' ? 10 : 0), turnStartedAt,
          statusEnteredAt: epoch + (phase === 'completed' ? 10 : 0), terminalAt: phase === 'completed' ? epoch + 10 : 0,
          unreadKnown: known, unread, unreadSequence: unreadGeneration }
        })
      })
      const relations = rows.filter(row => !independent && row.key !== 'main').map(row => ({ childKey: row.key,
        parentKey: row.parent || 'main', provider: 'codex', family, relation: row.relation || 'side-thread',
        authority: 'lifecycle-exact', exact: true, generation }))
      const interactions = rows.filter(row => row.phase === 'waiting-input' || row.interactionState === 'resolved').map(row => ({
        revision: 'companion-interaction-evidence-v1', provider: 'codex', taskKey: row.key, branchRef: row.key,
        interactionRef: row.requestRef || 'f'.repeat(32), kind: 'user-input', state: row.interactionState || 'opened', sequence: row.epoch || 100,
        turnEpoch: row.epoch || 100, requestSetRevision: generation, authority: 'provider-live', exact: true
      }))
      const interactionSets = rows.filter(row => row.requestCoverage === true).map(row => ({
        revision: 'companion-interaction-evidence-v1', provider: 'codex', taskKey: row.key,
        requestSetRevision: generation, complete: true
      }))
      const laneGenerations = Object.fromEntries(lanes.map(lane => [lane,
        lane === 'unread' ? unreadGeneration : lane === 'activity' ? activityGeneration : generation]))
      const batch = createEvidenceBatchV7({ provider: 'codex', nodes, interactions, interactionSets, relations, relationsComplete: complete,
        snapshotLanes: complete ? lanes : [], completeLanes: complete ? lanes : [],
        laneGenerations,
        removedKeys: { membership: remove }, health: 'ready' })
      batch.removedRelationChildKeys = remove
      const draft = { schema: 'companion-task-evidence-draft-v7', producer: 'host-evidence',
        sourceTaskStateRevision: 'task-state-v12', draftRevision: ++transport, acceptedAt: 1000,
        enabled: true, complete: true, providers, sourceGenerations: { codex: generation },
        sourceLaneGenerations: { codex: laneGenerations }, evidenceBatches: { codex: batch } }
      return hostEvidence ? kernel.publishEvidence(draft) : kernel.syncPackage({ lease, draft })
    }
    function expectRoot(phase, unread, count, unreadEntry = phase === 'completed' && unread) {
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
      assert.equal(snapshot.views.counts.unread, unreadEntry ? 1 : 0)
      assert.equal(snapshot.views.counts.active, phase === 'running' ? 1 : 0)
      assert.equal(snapshot.views.counts.input, phase === 'waiting-input' ? 1 : 0)
      assert(!snapshot.views.cycleKeys.includes('side'))
      checked++
      return snapshot.tasks[0]
    }
    return { kernel, publish, publishRequests, expectRoot, events }
  }
  const main = { key: 'main' }
  const side = { key: 'side' }
  const completedMain = { ...main, epoch: 300, branch: {} }
  const endedSide = { ...side, phase: 'stopped', epoch: 100, branch: { ordinarySideInterruptedAt: 200 } }
  const coldHistory = fixture()
  try {
    const interrupted = { ...main, phase: 'stopped', epoch: 300, branch: { status: 'notLoaded',
      lastTurnEvidence: 'inventory', terminalEvidenceSequence: 0 } }
    coldHistory.publish([interrupted], 1, { complete: true, hostEvidence: true })
    assert.equal(coldHistory.expectRoot('unknown', false, 1).capabilities.continueTask, false)
    coldHistory.publish([interrupted], 2, { complete: true, hostEvidence: true })
    assert.equal(coldHistory.expectRoot('unknown', false, 1).capabilities.continueTask, false)
    coldHistory.publish([{ ...interrupted, branch: { status: 'active', lastTurnStatus: 'inProgress',
      lastTurnEvidence: 'turn-started', statusAuthority: 'app-server-live', activityEvidence: 'activity-event',
      activeEvidenceSequence: 500 } }], 3, { hostEvidence: true })
    coldHistory.expectRoot('running', false, 1)
    coldHistory.publish([{ ...interrupted, branch: { status: 'idle', lastTurnEvidence: 'turn-completed',
      terminalEvidenceSequence: 501, idleConfirmed: true } }], 4, { hostEvidence: true })
    assert.equal(coldHistory.expectRoot('stopped', false, 1).capabilities.continueTask, true)
  } finally { coldHistory.kernel.close() }
  const weakSide = fixture()
  try {
    const stopped = { ...completedMain, phase: 'stopped', branch: { idleConfirmed: true } }
    const weak = { ...side, phase: 'stopped', epoch: 400, branch: {
      status: 'notLoaded', lastTurnEvidence: 'inventory', terminalEvidenceSequence: 0
    } }
    weakSide.publish([stopped, weak], 1, { complete: true, hostEvidence: true })
    assert.equal(weakSide.expectRoot('stopped', false, 2).capabilities.continueTask, false,
      'an unresolved Side preserves the confirmed main interruption but holds Continue')
    weakSide.publish([{ ...weak, branch: { status: 'active', lastTurnStatus: 'inProgress',
      lastTurnEvidence: 'turn-started', statusAuthority: 'app-server-live', activityEvidence: 'activity-event',
      activeEvidenceSequence: 500 } }], 2, { hostEvidence: true })
    assert.equal(weakSide.expectRoot('running', false, 2).capabilities.continueTask, false,
      'weak Side history cannot prevent admission of the exact same running Turn')
    assert.equal(weakSide.kernel.getActivityCheckpoint('side').phase, 'running')
  } finally { weakSide.kernel.close() }
  const sameSecond = fixture()
  try {
    const old = { ...completedMain, epoch: 20_000, branch: { causalKey: 'old-exact-turn', terminalEvidenceSequence: 30_000 } }
    const running = { ...old, phase: 'running', branch: {
      causalKey: 'new-exact-turn', status: 'active', lastTurnStatus: 'inProgress', lastTurnEvidence: 'turn-started',
      statusAuthority: 'app-server-live', activityEvidence: 'activity-event', activeEvidenceSequence: 30_001
    } }
    sameSecond.publish([old], 1, { complete: true, hostEvidence: true })
    sameSecond.expectRoot('completed', false, 1)
    sameSecond.publish([running], 2, { hostEvidence: true })
    assert.equal(sameSecond.expectRoot('completed', false, 1).freshness, 'verifying',
      'a later delivery cannot decide two different same-second Turns')
    sameSecond.publish([{ ...running, branch: { ...running.branch, turnPredecessorKey: 'old-exact-turn' } }],
      3, { hostEvidence: true })
    sameSecond.expectRoot('running', false, 1)
    sameSecond.publish([{ ...old, branch: { ...old.branch, terminalEvidenceSequence: 30_002 } }],
      4, { hostEvidence: true })
    sameSecond.expectRoot('running', false, 1)
    sameSecond.publish([{ ...old, branch: {
      causalKey: 'new-exact-turn', turnPredecessorKey: 'old-exact-turn', terminalEvidenceSequence: 30_003
    } }], 5, { hostEvidence: true })
    sameSecond.expectRoot('completed', false, 1)
    sameSecond.publish([{ ...running, branch: {
      ...running.branch, causalKey: 'old-exact-turn', orderedTurnStart: true, activeEvidenceSequence: 30_004
    } }], 6, { hostEvidence: true })
    sameSecond.expectRoot('completed', false, 1)
  } finally { sameSecond.kernel.close() }
  const mainWithPlan = { ...completedMain, branch: { planReady: true, planLifecycleRevision: 300 } }
  const plannedWithSide = fixture()
  try {
    const planned = { ...mainWithPlan, capabilities: ['open', 'archive', 'execute-plan'] }
    const quietSide = { ...side, branch: {} }
    plannedWithSide.publish([planned, quietSide], 1, { hostEvidence: true })
    assert.equal(plannedWithSide.expectRoot('waiting-input', false, 2).capabilities.executePlan, true)
    plannedWithSide.publishRequests([{
      revision: 'companion-interaction-evidence-v1', provider: 'codex', taskKey: 'main', branchRef: 'main',
      interactionRef: 'f'.repeat(32), kind: 'plan-implementation', state: 'opened', sequence: 400,
      turnEpoch: 300, requestSetRevision: 2, authority: 'provider-live', exact: true
    }], [], 2)
    plannedWithSide.publish([{ ...quietSide, branch: { submissionPending: true } }], 3, { hostEvidence: true })
    assert.equal(plannedWithSide.expectRoot('waiting-input', false, 2).capabilities.executePlan, false,
      'the main Plan still displays but cannot bypass a current Side submission')
  } finally { plannedWithSide.kernel.close() }
  for (const [name, rootRow, childRow, phase, trusted = true] of [
    ['old ordinary interruption, read', completedMain, endedSide, 'completed'],
    ['old ordinary interruption, unread', { ...completedMain, unread: true }, endedSide, 'completed'],
    ['a stopped Side keeps its native unread fact without qualifying as a completed unread', completedMain, { ...endedSide, unread: true }, 'completed'],
    ['old start alone', completedMain, { ...endedSide, branch: {} }, 'stopped'],
    ['boundary equality', completedMain, { ...endedSide, branch: { ordinarySideInterruptedAt: 300 } }, 'stopped'],
    ['unresolved subsecond order', { ...completedMain, epoch: 20_050 }, { ...endedSide, branch: { ordinarySideInterruptedAt: 20_000 } }, 'stopped'],
    ['overlapping interruption', completedMain, { ...endedSide, branch: { ordinarySideInterruptedAt: 310 } }, 'stopped'],
    ['later Side', completedMain, { ...endedSide, epoch: 350, branch: { ordinarySideInterruptedAt: 400 } }, 'stopped'],
    ['end before Side start', completedMain, { ...endedSide, branch: { ordinarySideInterruptedAt: 90 } }, 'stopped'],
    ['unknown main start', { ...completedMain, turnStartedAt: 0 }, endedSide, 'stopped'],
    ['incomparable domains', { ...completedMain, branch: { causalDomain: 'other-domain' } }, endedSide, 'stopped'],
    ['inventory without a current Turn reference', { ...completedMain, branch: { lastTurnEvidence: 'inventory' } }, endedSide, 'stopped'],
    ['subagent relation', completedMain, { ...endedSide, relation: 'subagent' }, 'stopped'],
    ['untrusted producer', completedMain, endedSide, 'stopped', false],
    ['failed is not interrupted', completedMain, { ...endedSide, branch: { ...endedSide.branch, lastTurnStatus: 'failed' } }, 'stopped'],
    ['current Goal', completedMain, { ...endedSide, branch: { ...endedSide.branch, goalStatus: 'active' } }, 'running'],
    ['paused Goal', completedMain, { ...endedSide, branch: { ...endedSide.branch, goalStatus: 'paused' } }, 'stopped'],
    ['root Plan with an interrupted ordinary Side', mainWithPlan, endedSide, 'stopped'],
    ['root Plan with a closed machine interruption', mainWithPlan, { ...endedSide, closedMachineRun: true, branch: {} }, 'waiting-input'],
    ['root Plan with a closed machine and a paused Goal', mainWithPlan,
      { ...endedSide, closedMachineRun: true, branch: { goalStatus: 'paused' } }, 'stopped'],
    ['current interaction', completedMain, { ...endedSide, phase: 'waiting-input', branch: { ...endedSide.branch, lastTurnStatus: 'interrupted' } }, 'waiting-input']
  ]) {
    const scenario = fixture()
    try {
      scenario.publish([rootRow, childRow], 1, { hostEvidence: trusted })
      const root = scenario.expectRoot(phase, Boolean(rootRow.unread || childRow.unread), 2, phase === 'completed' && Boolean(rootRow.unread))
      assert.equal(root.capabilities.continueTask, false, name)
      assert.equal(Object.hasOwn(root, 'ordinarySideInterruptedAt'), false, name)
      if (childRow === endedSide && trusted) assert.equal(scenario.kernel.getActivityCheckpoint('side').phase, 'stopped', name)
    } finally { scenario.kernel.close() }
  }
  const clearedPlan = { idleConfirmed: true, planLifecycleState: 'cleared', planClearReason: 'cancel' }
  const settledRoot = { ...completedMain, epoch: 30_000, requestCoverage: true, unread: true, branch: clearedPlan }
  const oldMachine = { ...endedSide, epoch: 10_000, requestCoverage: true, closedMachineRun: false,
    machineRunCoverageCurrent: true, machineRunInterruptedAt: 20_000, branch: { ...clearedPlan, terminalAt: 20_000 } }
  for (const [label, machine, phase] of [
    ['exact interruption earlier than this main Turn', oldMachine, 'completed'],
    ['exact interruption in its start second', { ...oldMachine, machineRunInterruptedAt: 10_000,
      branch: { ...clearedPlan, terminalAt: 10_000 } }, 'completed'],
    ['request coverage lost', { ...oldMachine, machineRunCoverageCurrent: false }, 'stopped'],
    ['incomplete request set', { ...oldMachine, requestCoverage: false }, 'stopped'],
    ['start without an actual end', { ...oldMachine, machineRunInterruptedAt: undefined,
      branch: { ...clearedPlan, terminalAt: 10_000 } }, 'stopped'],
    ['potential overlap within second precision', { ...oldMachine, machineRunInterruptedAt: 30_000,
      branch: { ...clearedPlan, terminalAt: 30_000 } }, 'stopped'],
    ['active Goal', { ...oldMachine, branch: { ...oldMachine.branch, goalStatus: 'active' } }, 'running']
  ]) {
    const scenario = fixture()
    try {
      scenario.publish([settledRoot, machine], 1, { hostEvidence: true })
      const root = scenario.expectRoot(phase, true, 2, phase !== 'running')
      assert.equal(root.capabilities.continueTask, false, label)
      if (phase === 'completed') {
        assert.equal(scenario.kernel.getActivityCheckpoint('side').phase, 'stopped', 'old machine activity stays in member history')
        scenario.publish([settledRoot, { ...machine, machineRunCoverageCurrent: false }], 2, { hostEvidence: true, activityGeneration: 1 })
        scenario.expectRoot('stopped', true, 2, true)
        scenario.publish([settledRoot, machine], 3, { hostEvidence: true, activityGeneration: 1 })
        scenario.expectRoot('completed', true, 2, true)
      }
    } finally { scenario.kernel.close() }
  }
  const resumed = fixture()
  try {
    resumed.publish([{ ...completedMain, phase: 'stopped' }, { ...side, unread: true }], 1, { hostEvidence: true })
    assert.equal(resumed.expectRoot('stopped', true, 2, true).capabilities.continueTask, true)
    const nextTurn = { ...completedMain, epoch: 400, branch: { status: 'active', statusAuthority: 'app-server-live',
      activityEvidence: 'activity-event', lastTurnStatus: 'inProgress', lastTurnEvidence: 'turn-started', activeEvidenceSequence: 402 } }
    resumed.publish([nextTurn, endedSide], 2, { hostEvidence: true })
    assert.equal(resumed.expectRoot('running', false, 2).capabilities.continueTask, false)
  } finally { resumed.kernel.close() }
  const lateTurnState = fixture()
  try {
    const stoppedMain = { ...completedMain, phase: 'stopped' }
    lateTurnState.publish([stoppedMain], 1, { hostEvidence: true })
    assert.equal(lateTurnState.expectRoot('stopped', false, 1).capabilities.continueTask, true)
    const late = { ...completedMain, epoch: 200, branch: {
      status: 'active', groupActivityConfirmed: true, submissionPending: true
    } }
    lateTurnState.publish([late], 2, { hostEvidence: true })
    const retained = lateTurnState.expectRoot('stopped', false, 1)
    assert.equal(retained.capabilities.continueTask, true, 'an older Turn cannot block the current continue action')
    assert.equal(retained.codexStatus.main.threadStatus, 'idle')

    const rechecking = { ...stoppedMain, branch: { submissionPending: true } }
    lateTurnState.publish([rechecking], 3, { hostEvidence: true })
    assert.equal(lateTurnState.expectRoot('stopped', false, 1).capabilities.continueTask, false,
      'a current submission blocks continue even when the Turn verdict stays the same')
    lateTurnState.publish([stoppedMain], 4, { hostEvidence: true })
    assert.equal(lateTurnState.expectRoot('stopped', false, 1).capabilities.continueTask, true)

    lateTurnState.publish([{ ...late, branch: { ...late.branch, goalStatus: 'budgetLimited',
      goalUpdatedAt: 350, goalEvidenceSequence: 400 } }], 5, { hostEvidence: true })
    const limited = lateTurnState.expectRoot('stopped', false, 1)
    assert.equal(limited.codexStatus.main.goal, 'budgetLimited', 'Goal evidence advances independently of a rejected Turn')
    assert.equal(limited.capabilities.continueTask, false)
  } finally { lateTurnState.kernel.close() }
  const supersededPlan = fixture()
  try {
    const planned = { ...completedMain, branch: { planReady: true, planLifecycleRevision: 300 } }
    supersededPlan.publish([planned], 1, { hostEvidence: true })
    assert.equal(supersededPlan.expectRoot('waiting-input', false, 1).planReady, true)
    const interrupted = { ...completedMain, phase: 'stopped', epoch: 400 }
    supersededPlan.publish([interrupted], 2, { hostEvidence: true })
    const stopped = supersededPlan.expectRoot('stopped', false, 1)
    assert.deepEqual([stopped.planReady, stopped.capabilities.executePlan, stopped.capabilities.continueTask],
      [false, false, true], 'a Plan from an older Turn cannot block Continue or remain executable')
    assert.deepEqual([stopped.planArtifactState, stopped.planLifecycleRevision], ['available', 300],
      'a newer Turn alone does not consume the retained Plan')
    supersededPlan.publish([planned], 3, { hostEvidence: true })
    assert.equal(supersededPlan.expectRoot('stopped', false, 1).planReady, false)
    const newPlan = { ...completedMain, epoch: 500, branch: { planReady: true, planLifecycleRevision: 500 } }
    supersededPlan.publish([newPlan], 4, { hostEvidence: true })
    assert.equal(supersededPlan.expectRoot('waiting-input', false, 1).planLifecycleRevision, 500)
  } finally { supersededPlan.kernel.close() }
  const coldMainStart = Date.parse('2026-11-18T19:24:58+08:00')
  const coldSideStart = Date.parse('2026-11-18T18:43:48+08:00')
  const coldSideEnd = Date.parse('2026-11-18T18:48:51.052+08:00')
  const turnFields = require('./codex/desktop-activity-resolution.cjs').createCodexDesktopActivityResolution({
    timestampMs: value => Number(value) || 0, validThreadId: () => true,
    isConfirmedTurnEvidence: () => false, waitingEvidenceVisible: () => false, desktopRequestFlag: () => '',
    desktopIsPlanImplementationRequest: () => false
  }).codexDesktopBranchTurnFields
  const coldMain = { key: 'main', epoch: coldMainStart, branch: turnFields({ lane: 'connector' }, {
    connectorLastTurnStatus: 'completed', connectorLastTurnStartedAt: coldMainStart
  }, { main: true, live: false, activeSequence: 0, turnRef: 'cold-main-turn' }) }
  assert.equal(coldMain.branch.turnStartedAtSource, 'inventory')
  assert.equal(coldMain.branch.terminalEvidenceSequence, 0)
  assert.equal(coldMain.branch.turnRef, 'cold-main-turn')
  const coldSide = { ...endedSide, epoch: coldSideStart, known: false,
    branch: { ordinarySideInterruptedAt: coldSideEnd, terminalEvidenceSequence: 7888 } }
  const machine = { key: 'machine', phase: 'stopped', epoch: coldMainStart + 203_000, closedMachineRun: true }
  const coldStart = fixture()
  try {
    coldStart.publish([coldMain, machine, { ...side, phase: 'unknown', known: false, relationOnly: true }], 1, { hostEvidence: true })
    coldStart.expectRoot('unknown', false, 3)
    coldStart.publish([coldMain], 2, { hostEvidence: true })
    assert(coldStart.events.some(event => event.event === 'state-decision' && event.details?.reason === 'sequence-incomparable'
      && event.details.sameIdentity && event.details.sameDomain && event.details.incomingPhase === 'completed'))
    coldStart.publish([coldSide], 3, { hostEvidence: true })
    const settled = coldStart.expectRoot('completed', false, 3)
    assert.deepEqual([settled.freshness, settled.dynamicGroup, settled.unreadKnown], ['verifying', 'completed', false])
    assert.equal(coldStart.kernel.getActivityCheckpoint('side').phase, 'stopped')
    coldStart.publish([{ ...coldMain, unread: true }], 4, { hostEvidence: true })
    assert.equal(coldStart.expectRoot('completed', true, 3).dynamicGroup, 'unread')
  } finally { coldStart.kernel.close() }
  for (const [rootOverrides, childOverrides, expected] of [
    [{}, { ordinarySideInterruptedAt: coldMainStart }, 'stopped'],
    [{}, { ordinarySideInterruptedAt: coldMainStart + 1 }, 'stopped'],
    [{}, { ordinarySideInterruptedAt: 0, terminalAt: coldSideStart }, 'stopped'],
    [{}, { causalDomain: 'previous-connection' }, 'stopped'],
    [{ turnRef: '' }, {}, 'stopped'],
    [{ causalDomain: '' }, {}, 'stopped'],
    [{ turnStartedAt: 0 }, {}, 'stopped'],
    [{ goalStatus: 'paused' }, {}, 'stopped'],
    [{ goalStatus: 'active' }, {}, 'running'],
    [{ planReady: true }, {}, 'stopped']
  ]) {
    const boundary = fixture()
    try {
      boundary.publish([{ ...coldMain, branch: { ...coldMain.branch, ...rootOverrides } },
        { ...coldSide, branch: { ...coldSide.branch, ...childOverrides } }], 1, { hostEvidence: true })
      boundary.expectRoot(expected, false, 2)
    } finally { boundary.kernel.close() }
  }
  const coldConflict = fixture()
  try {
    coldConflict.publish([coldMain, coldSide], 1, { hostEvidence: true })
    coldConflict.expectRoot('completed', false, 2)
    coldConflict.publish([{ ...coldMain, branch: { ...coldMain.branch, lastTurnStatus: 'inProgress', status: 'active',
      statusAuthority: 'app-server-live', activityEvidence: 'activity-event', activeEvidenceSequence: 8 } }], 2, { hostEvidence: true })
    assert.equal(coldConflict.kernel.getActivityCheckpoint('main').phase, 'completed', 'the existing same-Turn arbiter retains the inventory phase')
    coldConflict.expectRoot('stopped', false, 2)
    coldConflict.publish([coldMain], 3, { hostEvidence: true })
    coldConflict.expectRoot('stopped', false, 2)
  } finally { coldConflict.kernel.close() }
  const lateEnd = fixture()
  try {
    lateEnd.publish([coldMain, { ...coldSide, branch: { ...coldSide.branch, ordinarySideInterruptedAt: 0 } }], 1, { hostEvidence: true })
    lateEnd.expectRoot('stopped', false, 2)
    lateEnd.publish([coldSide], 2, { hostEvidence: true })
    lateEnd.expectRoot('completed', false, 2)
    lateEnd.publish([{ ...coldSide, branch: { ...coldSide.branch, ordinarySideInterruptedAt: coldMainStart + 2000 } }], 3, { hostEvidence: true })
    lateEnd.expectRoot('stopped', false, 2)
    lateEnd.publish([coldSide], 4, { hostEvidence: true })
    lateEnd.expectRoot('stopped', false, 2)
  } finally { lateEnd.kernel.close() }
  const closedRun = fixture()
  try {
    const stoppedSide = { ...side, phase: 'stopped' }
    closedRun.publish([main, stoppedSide], 1, { hostEvidence: true })
    closedRun.expectRoot('stopped', false, 2)
    closedRun.publish([main, { ...stoppedSide, closedMachineRun: true }], 2, { hostEvidence: true })
    closedRun.expectRoot('completed', false, 2)
    closedRun.publish([main, stoppedSide], 3, { hostEvidence: true })
    closedRun.expectRoot('completed', false, 2)
    closedRun.publish([main, { ...stoppedSide, closedMachineRun: false }], 4, { hostEvidence: true })
    closedRun.expectRoot('stopped', false, 2)
    closedRun.publish([main, { ...side, phase: 'running', epoch: 200, closedMachineRun: true }], 5, { hostEvidence: true })
    closedRun.expectRoot('running', false, 2)
  } finally { closedRun.kernel.close() }
  const unreadWithUnknownSide = fixture()
  try {
    const unknownSide = { ...side, phase: 'unknown', known: false, relationOnly: true }
    unreadWithUnknownSide.publish([{ ...main, unread: true }, unknownSide], 1, { hostEvidence: true })
    const incomplete = unreadWithUnknownSide.expectRoot('unknown', true, 2, true)
    assert.deepEqual(unreadWithUnknownSide.kernel.getPackage().views.attentionKeys.completedUnread, ['main'])
    assert.equal(incomplete.freshness, 'verifying')
    assert.equal(incomplete.capabilities.archive, false)
    unreadWithUnknownSide.publish([main, unknownSide], 2, { hostEvidence: true })
    unreadWithUnknownSide.expectRoot('unknown', false, 2)
    unreadWithUnknownSide.publish([{ ...main, unread: true }, { ...unknownSide, relationOnly: false, goalVerifying: true }], 3, { hostEvidence: true })
    unreadWithUnknownSide.expectRoot('unknown', true, 2, true)
    unreadWithUnknownSide.publish([{ ...main, unread: true }, { ...unknownSide, epoch: 200, turnStartedAt: 200 }], 4, { hostEvidence: true })
    unreadWithUnknownSide.expectRoot('unknown', true, 2, true)
    unreadWithUnknownSide.publish([{ ...main, unread: true }, { ...side, phase: 'running', epoch: 300, relationOnly: false }], 5, { hostEvidence: true })
    unreadWithUnknownSide.expectRoot('running', true, 2)
  } finally { unreadWithUnknownSide.kernel.close() }
  const emptySideHistory = fixture()
  try {
    const completedRoot = { ...completedMain, unread: true }
    const noTurn = { status: 'notLoaded', causalKey: '', causalDomain: '', terminalEvidenceSequence: 0,
      lastTurnStatus: undefined, turnStartedAt: 0, terminalAt: 0 }
    const empty = { ...side, phase: 'unknown', relationOnly: true, epoch: 100, known: false,
      branch: { ...noTurn, emptyTurnHistory: true } }
    emptySideHistory.publish([completedRoot, { ...empty, branch: noTurn }], 1, { hostEvidence: true })
    emptySideHistory.expectRoot('unknown', true, 2, true)
    emptySideHistory.publish([completedRoot, empty], 2, { hostEvidence: true })
    const settled = emptySideHistory.expectRoot('completed', true, 2)
    assert.equal(settled.capabilities.continueTask, false)
    assert.equal(settled.codexStatus.sides[0].turn, 'not-started')
    assert.equal(settled.codexStatus.sides[0].verifying, false)
    emptySideHistory.publish([{ ...completedRoot, unread: false }, empty], 3, { hostEvidence: true })
    emptySideHistory.expectRoot('completed', false, 2)
    emptySideHistory.publish([{ ...empty, branch: noTurn }], 4, { hostEvidence: true })
    emptySideHistory.expectRoot('unknown', false, 2)
    emptySideHistory.publish([empty], 5, { hostEvidence: true })
    emptySideHistory.expectRoot('completed', false, 2)
    emptySideHistory.publish([{ ...empty, phase: 'waiting-input' }], 6, { hostEvidence: true })
    emptySideHistory.expectRoot('waiting-input', false, 2)
    emptySideHistory.publish([{ ...empty, branch: noTurn, interactionState: 'resolved' }], 7, { hostEvidence: true })
    emptySideHistory.expectRoot('unknown', false, 2)
    emptySideHistory.publish([{ ...side, phase: 'running', epoch: 500, branch: { status: 'active', lastTurnStatus: 'inProgress',
      lastTurnEvidence: 'turn-started', statusAuthority: 'app-server-live', activityEvidence: 'activity-event',
      activeEvidenceSequence: 501 } }], 8, { hostEvidence: true })
    emptySideHistory.expectRoot('running', false, 2)
    emptySideHistory.publish([empty], 9, { hostEvidence: true })
    emptySideHistory.expectRoot('running', false, 2)
  } finally { emptySideHistory.kernel.close() }
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
    read.expectRoot('completed', true, 2) // A dispatched shortcut is not a read receipt.
    read.publish([main, { ...side, unread: true }], 3)
    read.expectRoot('completed', true, 2)
    read.publish([main, { ...side, phase: 'running', epoch: 200 }], 4)
    read.expectRoot('running', false, 2)
    read.publish([main, { ...side, epoch: 200, unread: true }], 5)
    read.expectRoot('completed', true, 2)
    read.publish([main, { ...side, unread: false }], 6, { unreadGeneration: 2 })
    read.expectRoot('completed', true, 2) // Old unread cannot erase the new completion.
  } finally { read.kernel.close() }
  const openConfirmed = async () => ({
    outcome: 'opened',
    confirmsRead: true,
    handoff: {
      revision: 'companion-open-handoff-v1',
      handoffId: 'coh_lifecycle_native_0001',
      stage: 'native-confirmed',
      sourceRelease: 'unknown',
      nativeVisible: true,
      controlOwner: 'target-native',
      confirmsRead: true
    }
  })
  const confirmed = fixture(openConfirmed)
  try {
    confirmed.publish([main, { ...side, unread: true }], 2)
    await confirmed.kernel.dispatch({ action: 'open', key: 'main', source: 'global-shortcut' })
    confirmed.expectRoot('completed', false, 2)
    confirmed.publish([main, { ...side, unread: true }], 3)
    confirmed.expectRoot('completed', false, 2) // Same-turn native unread does not rebound after a confirmed read.
  } finally { confirmed.kernel.close() }
  const stoppedUnread = fixture(openConfirmed)
  try {
    const stopped = { ...endedSide, epoch: 350, branch: {} }
    stoppedUnread.publish([{ ...completedMain, unread: true }, stopped], 1, { hostEvidence: true })
    const before = stoppedUnread.expectRoot('stopped', true, 2, true)
    assert.deepEqual(stoppedUnread.kernel.getPackage().views.attentionKeys.completedUnread, ['main'])
    const receipt = await stoppedUnread.kernel.dispatch({
      action: 'open-attention', kind: 'completed-unread', source: 'global-shortcut'
    })
    assert.equal(receipt.confirmsRead, true)
    const after = stoppedUnread.expectRoot('stopped', false, 2)
    assert.equal(after.capabilities.continueTask, before.capabilities.continueTask)
    assert.deepEqual(stoppedUnread.kernel.getPackage().views.attentionKeys.completedUnread, [])
    assert.deepEqual(stoppedUnread.kernel.getPackage().views.cycleKeys, ['main'])
  } finally { stoppedUnread.kernel.close() }
  const source = readFileSync(resolve(assetRoot, assetRoot.endsWith('preload') ? 'index.js' : 'preload.js'), 'utf8')
  checked += await checkColdRolloutAdmission(require, source, fixture)
  checked += await checkColdUnreadRefresh(require, source)
  checked += await checkVerifiedInventorySharing(source)
  checked += await checkTurnReadScope(require, source)
  checked += await checkTargetedTurnReadScope(require, source)
  checked += checkRolloutTailSampleReuse(source)
  checked += checkInventoryProjectAssignments(source)
  checked += checkMemberRequestWatermarks(source, fixture)
  checked += await checkAttentionSettlement(fixture)
  checked += await checkInFlightShortcutRetention(fixture)
  checked += await checkStableShortcutRing(fixture)
  const cacheStart = source.indexOf('function companionOpenTargetUnavailable(')
  const cacheEnd = source.indexOf('\nasync function openCompanionClaudeTarget(', cacheStart)
  const indexStart = source.indexOf('function companionCodexInventoryMatchV7(')
  const indexEnd = source.indexOf('\n}', indexStart) + 2
  const revokeStart = source.indexOf('function revokeCodexThreadMapping(')
  const revokeEnd = source.indexOf('\nfunction codexRolloutProof(', revokeStart)
  assert(cacheStart >= 0 && cacheEnd > cacheStart && indexStart >= 0 && indexEnd > indexStart
    && revokeStart >= 0 && revokeEnd > revokeStart)
  const key = 'a'.repeat(32)
  const threadId = '12345678-1234-4234-8234-123456789abc'
  const openEntries = new Map()
  const inventory = new Map([[threadId, { key }]])
  const opened = []
  let providerEpoch = 1
  let holdDispatch = false
  let resumeDispatch
  const { open: cache, revoke } = new Script(`${source.slice(indexStart, indexEnd)}
    ${source.slice(cacheStart, cacheEnd)}
    ${source.slice(revokeStart, revokeEnd)}
    ({ open: openCompanionCodexTarget, revoke: revokeCodexThreadMapping })`)
    .runInNewContext({
      companionCodexOpenEntries: openEntries, codexActivityInventory: inventory, codexActivityThreadIds: new Map([[key, threadId]]),
      codexCausalDomain: 'source-identity', codexActivitySourceFingerprint: 'source-fingerprint',
      codexInventoryMembershipGeneration: 1, codexRetiredThreadIds: new Map(), codexThreadActions: new Map(),
      codexDesktopBridge: null, codexThreadTurnStatusCache: new Map(), codexThreadGoalCache: new Map(), codexThreadGoalRefreshes: new Map(),
      codexClearDesktopOpenedRead() {}, invalidateCodexThreadList() {},
      companionTaskKernel: { providerEpoch: () => providerEpoch },
      validCodexThreadId: id => id === threadId, codexThreadKey: () => key,
      async dispatchCodexThreadOpen(entry, _request, identity) {
        assert.equal(identity.current(), true)
        if (holdDispatch) await new Promise(resolve => { resumeDispatch = resolve })
        if (!identity.current()) return { outcome: 'unavailable', errorCode: 'stale-target' }
        opened.push(entry.threadId)
        return { outcome: 'dispatched' }
      }
    })
  const request = { cacheOnly: true }
  const stale = cache({ key }, request)
  providerEpoch += 1
  assert.equal((await stale).errorCode, 'stale-target')
  assert.equal(openEntries.size, 0, 'a recovery queued in a previous source generation cannot restore a mapping')
  assert.equal((await cache({ key }, request)).errorCode, 'stale-target')
  assert.deepEqual(opened, [], 'the missed press does not dispatch or replay after recovery')
  assert.equal((await cache({ key }, request)).outcome, 'dispatched')
  assert.deepEqual(opened, [threadId], 'the next press opens only the exact inventory match without a listing')
  holdDispatch = true
  const deletedWhileOpening = cache({ key }, request)
  assert.equal(typeof resumeDispatch, 'function')
  revoke(threadId, 'thread-deleted')
  resumeDispatch()
  assert.equal((await deletedWhileOpening).errorCode, 'stale-target')
  assert.equal((await cache({ key }, request)).errorCode, 'stale-target')
  assert.equal(openEntries.size, 0, 'a stale reverse-index row cannot recover a deleted target')
  assert.deepEqual(opened, [threadId])
  checked += 2
  let finishProbe
  let readinessDispatches = 0
  const readinessEvents = []
  const readiness = createCompanionOpenReadiness({
    record: entry => readinessEvents.push(entry),
    strategies: { codex: { probe: () => new Promise(resolve => { finishProbe = resolve }), launch: async () => ({ ok: false }) } }
  })
  const staleAttention = fixture(readiness.wrapOpen('codex', async () => {
    readinessDispatches += 1
    return { outcome: 'dispatched' }
  }))
  try {
    staleAttention.publish([{ ...main, unread: true }], 1)
    const opening = staleAttention.kernel.dispatch({ action: 'open-attention', kind: 'completed-unread', source: 'global-shortcut' })
    for (let index = 0; !finishProbe && index < 20; index += 1) await Promise.resolve()
    assert.equal(typeof finishProbe, 'function')
    staleAttention.publish([{ ...main, epoch: 300, unread: true }], 2)
    finishProbe('running')
    assert.equal((await opening).errorCode, 'stale-target', 'the old completion cannot dispatch after the readiness await')
    assert.equal(readinessDispatches, 0)
    checked++
  } finally { staleAttention.kernel.close() }
  const ready = createCompanionOpenReadiness({ record: entry => readinessEvents.push(entry),
    strategies: { codex: { probe: () => 'running', launch: async () => ({ ok: false }) } } })
  await ready.wrapOpen('codex', async () => ({ outcome: 'dispatched' }))({ key }, { operationId: 'open-ready', source: 'global-shortcut' })
  assert(readinessEvents.some(event => event.event === 'open-readiness' && event.outcome === 'ready-for-dispatch'
    && event.operationId === 'open-ready' && event.source === 'global-shortcut' && event.details.probe === 'running'),
    'the readiness event can be joined to shortcut selection and dispatch by operation id')
  checked++
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
  return checked + await checkDesktopSideTerminalCapability(require, assetRoot) + checkInternalReviewMembership(require) + await checkSpawnEdgeReaders(require)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Companion lifecycles passed: ${await checkCompanionLifecycles(resolve(import.meta.dirname, '../preload'))} checkpoints`)
}
