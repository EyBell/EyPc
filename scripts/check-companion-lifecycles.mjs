import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Script } from 'node:vm'
import * as zlib from 'node:zlib'

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
      codexThreadPersistedInputEvidence: () => null, emitCodexActivityDelta() {}
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

async function checkSpawnEdgeDiscoveryBeyondFallback(require) {
  const { createCodexSubagentDiscovery, CODEX_SUBAGENT_DISCOVERY_LIMIT } = require('./codex/subagent-discovery.cjs')
  const path = require('node:path')
  const threadId = index => `${String(index).padStart(8, '0')}-1234-4234-8234-123456789abc`
  const [root, otherRoot, child, nested, conflict, orphan, archived] = Array.from({ length: 7 }, (_, index) => threadId(index + 1))
  const newer = Array.from({ length: CODEX_SUBAGENT_DISCOVERY_LIMIT }, (_, index) => threadId(index + 100))
  const now = Date.UTC(2026, 10, 25, 11)
  const names = [...newer, nested, conflict, orphan, archived, child]
    .map(id => ['rollout-2026-11-25T10-00-00-', id, '.jsonl'].join(''))
  const directories = new Map([
    ['/sessions', ['2026']], ['/sessions/2026', ['11']], ['/sessions/2026/11', ['25']],
    ['/sessions/2026/11/25', names], ['/native', ['state_5.sqlite']]
  ])
  const nativeParents = [
    { id: nested, parent: child }, { id: child, parent: root }, { id: conflict, parent: root },
    { id: orphan, parent: threadId(90) }, { id: archived, parent: root, childArchived: 1 }
  ]
  const rpcParents = new Map(nativeParents.map(({ id, parent }) => [id, parent]))
  rpcParents.set(conflict, otherRoot)
  const reads = []
  let nativeUnavailable = false
  let rpcUnavailable = false
  let newerFilesVisible = true
  let childMtime = 0
  const discovery = createCodexSubagentDiscovery({
    fs: {
      readdirSync(target) {
        const entries = directories.get(target) || []
        return target.endsWith('/25') && !newerFilesVisible ? entries.slice(newer.length) : entries
      },
      statSync(target) {
        const name = path.basename(target)
        return { mtimeMs: now - names.indexOf(name) + (name.includes(child) ? childMtime : 0) }
      }
    },
    path, validThreadId: id => typeof id === 'string' && /^[\da-f-]{36}$/.test(id),
    DatabaseSync: class {
      constructor(_file, options) { assert.equal(options.readOnly, true) }
      prepare(sql) {
        assert.match(sql, /child\.thread_source = 'subagent'/)
        if (nativeUnavailable) throw new Error('synthetic read unavailable')
        return { all: () => nativeParents.filter(({ id }) => sql.includes(id)) }
      }
      close() {}
    },
    readThread: async id => {
      reads.push(id)
      if (rpcUnavailable && id === child) throw new Error('synthetic read unavailable')
      return { thread: { id, threadSource: 'subagent', parentThreadId: rpcParents.get(id) } }
    }
  })
  const input = { root: '/sessions', rows: [{ id: root }, { id: otherRoot }], archivedThreadIds: new Set([archived]), nowMs: now }
  assert.deepEqual(await discovery.codexDiscoverSubagentThreadRows(input), [])
  assert.equal(reads.length, CODEX_SUBAGENT_DISCOVERY_LIMIT)
  const recovered = await discovery.codexDiscoverSubagentThreadRows({ ...input, directory: '/native' })
  assert.deepEqual(recovered.map(({ id }) => id), [child, nested])
  assert.deepEqual(new Set(reads.slice(CODEX_SUBAGENT_DISCOVERY_LIMIT)), new Set([child, nested, conflict]))
  assert.deepEqual(await discovery.codexDiscoverSubagentThreadRows({ ...input, directory: '/native', isCurrent: () => false }), [])

  const nativeInput = { ...input, directory: '/native' }
  nativeUnavailable = true
  assert.deepEqual((await discovery.codexDiscoverSubagentThreadRows(nativeInput)).map(row => row.id), [child, nested],
    'a transient native lookup failure preserves already verified nested membership')
  nativeUnavailable = false
  rpcUnavailable = true
  childMtime = 1
  assert.deepEqual((await discovery.codexDiscoverSubagentThreadRows(nativeInput)).map(row => row.id), [child, nested],
    'a transient member read failure preserves matching persisted relationships')

  rpcUnavailable = false
  newerFilesVisible = false
  nativeParents.find(({ id }) => id === child).parent = otherRoot
  rpcParents.set(child, otherRoot)
  const reparented = await discovery.codexDiscoverSubagentThreadRows(nativeInput)
  assert.equal(reparented.find(row => row.id === child)?.parentThreadId, otherRoot,
    'the same file modification time cannot reuse a different native parent')

  nativeParents.splice(nativeParents.findIndex(({ id }) => id === child), 1)
  const removed = await discovery.codexDiscoverSubagentThreadRows(nativeInput)
  assert(!removed.some(row => row.id === child || row.id === nested), 'a confirmed removal detaches the unreachable chain')
  const nativeArchive = await discovery.codexDiscoverSubagentThreadRows({ ...nativeInput, archivedThreadIds: new Set() })
  assert(!nativeArchive.some(row => row.id === archived), 'a native archived row cannot enter through the fallback budget')
  return 10
}

async function checkAttachedSideReaders(require, source) {
  const { createCodexSubagentDiscovery } = require('./codex/subagent-discovery.cjs')
  const { createCodexInventoryThreadTopology } = require('./codex/inventory-thread-topology.cjs')
  const [root, side, nested, retired, orphan] = [1, 2, 3, 4, 5].map(index => `${index}2345678-1234-4234-8234-123456789abc`)
  const fs = { readdirSync: () => ['state_5.sqlite'], existsSync: () => false }
  const responses = []
  const discovery = createCodexSubagentDiscovery({ fs, path: require('node:path'), validThreadId: Boolean,
    sqliteBin: '/synthetic/sqlite3', execFile(_bin, args, _options, callback) {
      assert.deepEqual(args.slice(0, 2), ['-readonly', '-json'])
      responses.push({ sql: args[3], resolve: rows => callback(null, JSON.stringify(rows)) })
    } })
  const rows = [
    { id: side, parent: root, archived: 0, turnId: 'latest-side', unread: 1 },
    { id: nested, parent: side, archived: 0, turnId: 'latest-nested', unread: 0 },
    { id: retired, parent: side, archived: 1, turnId: 'retired-turn', unread: 1 }
  ]
  const older = discovery.codexReadAttachedSides('/synthetic')
  const current = discovery.codexReadAttachedSides('/synthetic')
  assert.match(responses[1].sql, /LEFT JOIN thread_read_receipts/)
  responses[1].resolve(rows)
  const sample = await current
  responses[0].resolve([])
  const delayed = await older
  assert.deepEqual([...delayed.parents], [...sample.parents], 'a late attachment read cannot clear newer topology')
  assert.equal(sample.receipts.get(side).unread, true)
  assert.equal(sample.receipts.get(nested).unread, false)
  assert.deepEqual([...sample.retired], [retired])
  assert.equal(sample.receipts.has(retired), false)

  const topology = createCodexInventoryThreadTopology({ validThreadId: Boolean, nativeString: String, record: value => value })
  const attached = topology.codexAttachedSideParentsForRoots(sample.parents, new Set([root]))
  assert.deepEqual([...attached], [[side, root], [nested, side]])
  assert.equal(topology.codexAttachedSideParentsForRoots(sample.parents, new Set([side])).size, 0, 'an orphan Side cannot admit descendants as its own root')
  const metadata = [
    { id: root, threadSource: 'user' },
    { id: side, threadSource: 'user', attachedToThreadId: root, forkedFromId: orphan },
    { id: nested, threadSource: 'user', attachedToThreadId: side }
  ]
  const { relations, depths } = topology.codexInventoryThreadTopology(metadata, new Map(), attached)
  assert.deepEqual([...relations], [[side, root], [nested, root]], 'native attachments recover nested members despite independent fork metadata')
  assert.equal(depths.get(nested), 2)

  const readStart = source.indexOf('async function recoverCodexThreadsMissingFromInventory(')
  const readEnd = source.indexOf('\nfunction markCodexThreadTurnStatusDirty(', readStart)
  assert(readStart >= 0 && readEnd > readStart)
  const targetedIds = []
  const watched = new Map(['fresh', 'wrong-file', 'machine', 'moved', 'retired-watch'].map(id => [id, { path: `/synthetic/${id}` }]))
  const recover = new Script(`${source.slice(readStart, readEnd)}\nrecoverCodexThreadsMissingFromInventory`).runInNewContext({
    validCodexThreadId: Boolean, codexRecord: value => value, codexSnapshotScopeCurrent: Boolean,
    codexRetiredThreadIds: new Map(), CODEX_THREAD_TURN_STATUS_CONCURRENCY: 2,
    codexWatchedRolloutCandidates: watched, codexSideParentThreadId: () => '',
    codexLocalArchiveRecoverySuppressions: new Set(), recordCodexTaskSync() {},
    codexSubagentDiscovery: { codexIsMachineRunThread: id => id === 'machine' },
    codexThreadRolloutCandidate: thread => ({ candidate: thread.path, stat: { ino: 2, dev: 1 } }),
    async readCodexThreadMembershipRow(id, currentScope) {
      assert(currentScope())
      targetedIds.push(id)
      if (id === 'moved') watched.set(id, { path: '/synthetic/renamed' })
      return { id, source: 'vscode', threadSource: id === 'fresh' ? 'agent_created_thread' : 'user',
        path: `/synthetic/${id === 'wrong-file' ? 'other' : id}`, status: { type: 'notLoaded' } }
    }
  })
  const recovered = await recover([metadata[0]], new Set([side, nested, retired]), sample.retired, new Map(), {}, attached)
  assert.deepEqual(targetedIds, [side, nested])
  assert.deepEqual(Array.from(recovered, row => [row.id, row.attachedToThreadId]), [[root, undefined], [side, root], [nested, side]])
  const missing = await recover([metadata[0]], new Set(watched.keys()), new Set(['retired-watch']), new Map(), {}, new Map(), new Map(watched))
  assert.deepEqual(Array.from(missing, row => row.id), [root, 'fresh'], 'only a current and native-verified active rollout can fill an inventory gap')
  assert(!targetedIds.includes('retired-watch'), 'an archived rollout is excluded before the targeted read')
  return 12
}

async function checkColdAttachedSideInterruption(require, source) {
  const start = source.indexOf('function codexRecoverAttachedSideInterruption(')
  const end = source.indexOf('\nfunction sanitizeCodexThreads(', start)
  assert(start >= 0 && end > start)
  const { codexRolloutRuntimeStateText } = require('./codex/rollout-runtime-state.cjs')
    .createCodexRolloutRuntimeState({ record: value => value ?? {}, rolloutTimestampMs: value => Number(value) || 0 })
  const activity = require('./codex/desktop-activity-resolution.cjs').createCodexDesktopActivityResolution({
    timestampMs: Number, validThreadId: Boolean, isConfirmedTurnEvidence: () => true,
    waitingEvidenceVisible: () => false, desktopRequestFlag: () => '', desktopIsPlanImplementationRequest: () => false
  })
  const fields = require('./codex/inventory-turn-fields.cjs').createCodexInventoryTurnFields({ timestampMs: Number })
  const proof = { candidate: '/synthetic/side.jsonl', dev: 1, ino: 2, size: 100, mtimeMs: 2020 }
  const abort = (id, startedAt) => JSON.stringify({ type: 'event_msg', timestamp: 2010,
    payload: { type: 'turn_aborted', turn_id: id, started_at: startedAt } })
  const tails = new Map([
    ['side', abort('forked-turn', 2000)], ['no-identity', abort(null)], ['pending', abort('pending-turn', 2000)]
  ])
  const cache = new Map()
  const read = new Script(`${source.slice(start, end)}\nreadCodexThreadTurnStatuses`).runInNewContext({
    codexRecord: value => value, codexSnapshotScopeCurrent: Boolean, codexThreadTurnStatusDirty: new Map(),
    codexSubagentDiscovery: null,
    codexThreadTurnStatusCache: cache, codexCachedTurnReusable: () => false, codexSideParentThreadId: () => 'root',
    codexRetiredThreadIds: new Map(), codexRolloutProof: thread => ({ ...proof, candidate: thread.id }),
    codexSameRolloutProof: (left, right) => left.candidate === right.candidate && left.mtimeMs === right.mtimeMs,
    codexReadRolloutTail: candidate => tails.get(candidate), codexRolloutRuntimeStateText,
    codexRolloutPendingUserInputStateText: text => ({ pending: text.includes('pending-turn') }),
    codexRolloutPendingPlanStateText: () => ({ planReady: false }), CODEX_ROLLOUT_PENDING_INPUT_TAIL_BYTES: 4096,
    codexDesktopActivityResolution: activity, codexInventoryTurnFieldsModule: fields,
    codexNativeConnectorLiveTurn: () => null, codexSideHistoryReadScope: () => ({}),
    codexRememberEmptySideHistory: () => false, CODEX_THREAD_TURN_STATUS_TIMEOUT_MS: 1000,
    CODEX_THREAD_TURN_STATUS_CONCURRENCY: 2,
    requestCodexRpc: async (_method, _params, _timeout, current, { observation }) => {
      assert(current())
      Object.assign(observation, { statusRequestedAt: 2021, statusReceivedAt: 2022 })
      return { data: [], nextCursor: null, backwardsCursor: null }
    },
    codexStoreTurnCache: (thread, value) => cache.set(thread.id, value)
  })
  const rows = [...tails.keys()].map(id => ({ id, attachedToThreadId: 'root', threadSource: 'user', status: { type: 'notLoaded' } }))
  const output = await read(rows, new Set(), new Map(rows.map(({ id }) => [id, 'root'])), {})
  const recovered = output.latest.get('side')
  assert.deepEqual({ ...recovered }, { id: 'forked-turn', status: 'interrupted', startedAt: 2000, interruptedAt: 2010,
    statusRequestedAt: 2021, statusReceivedAt: 2022 })
  assert.deepEqual([...output.readSucceededIds], ['side'])
  assert.deepEqual(new Set(output.unresolvedIds), new Set(['no-identity', 'pending']))
  return 3
}

async function checkNativeSqliteUnreadStorage(require) {
  const { createCodexDesktopOpenObservation } = require('./codex/desktop-open-observation.cjs')
  const { codexDesktopPersistedReadBinding, parseCodexDesktopUnreadState } = require('./codex/desktop-unread-evidence.cjs')
  const { createHash } = require('node:crypto')
  const primary = '/synthetic/.codex-global-state.json'
  const database = '/synthetic/.codex-global-state.sqlite'
  const first = '12345678-1234-4234-8234-123456789abc'
  const second = '22345678-1234-4234-8234-123456789abc'
  const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
  let account = 'synthetic-account'
  const user = 'synthetic-user'
  const executionHostKey = `local:${digest(['local', 'local', null])}`
  const binding = { identityKey: digest(['chatgpt', account, user]), executionHostKey }
  let unread = [first, second]
  let unavailable = false
  let legacyReads = 0
  let inode = 1
  let hold = false
  let release
  const { unreadStorage, readBoundUnread } = createCodexDesktopOpenObservation({
    fs: { statSync: file => ({ isFile: () => file === database, dev: 1, ino: inode }),
      promises: { open() { legacyReads += 1 } } },
    sqliteBin: '/synthetic/sqlite3',
    execFile(_bin, args, _options, callback) {
      assert.deepEqual(args.slice(0, 2), ['-readonly', '-json'])
      assert.match(args[3], /FROM settings WHERE scope = 'global'/)
      if (unavailable) { callback(new Error('unavailable')); return }
      const identityKey = digest(['chatgpt', account, user])
      const state = {
        'electron-renderer-content-owner': digest([user, account]),
        'environment-catalog-cache-v2': { accountId: account, userId: user },
        'electron-thread-read-state-v1': {
          version: 1, legacyMigration: { identityKey, adoptedHostIds: { local: executionHostKey } },
          unreadByIdentity: { [identityKey]: { [executionHostKey]: unread } }
        }
      }
      const rows = JSON.stringify(Object.entries(state).map(([key, value]) => ({ key, value: JSON.stringify(value) })))
      if (hold) {
        hold = false
        release = () => callback(null, rows)
      } else callback(null, rows)
    }
  })
  await unreadStorage.refresh(primary)
  assert.deepEqual(parseCodexDesktopUnreadState(unreadStorage.snapshot(primary), binding), [first, second])
  unread = [second]
  assert.deepEqual([...await readBoundUnread(primary, binding)], [second])
  assert.deepEqual(parseCodexDesktopUnreadState(unreadStorage.snapshot(primary), binding), [second])
  unread = [first, second]
  assert.deepEqual([...await readBoundUnread(primary, binding)], [first, second])

  hold = true
  unread = [second]
  const beforeDispatch = unreadStorage.refresh(primary)
  await new Promise(setImmediate)
  unread = [first, second]
  assert.deepEqual([...await readBoundUnread(primary, binding)], [first, second])
  release()
  assert.equal(await beforeDispatch, null, 'the earlier query cannot override the target read')
  assert.deepEqual(parseCodexDesktopUnreadState(unreadStorage.snapshot(primary), binding), [first, second])

  hold = true
  unread = [second]
  let scopeCurrent = true
  const oldScope = unreadStorage.refresh(primary, () => scopeCurrent)
  await new Promise(setImmediate)
  scopeCurrent = false
  release()
  assert.equal(await oldScope, null)
  assert.deepEqual(parseCodexDesktopUnreadState(unreadStorage.snapshot(primary), binding), [first, second])

  hold = true
  const oldDatabase = readBoundUnread(primary, binding)
  await new Promise(setImmediate)
  inode += 1
  release()
  assert.equal(await oldDatabase, null, 'a same-path database replacement invalidates the old read')
  assert.equal(unreadStorage.snapshot(primary), null)
  assert.deepEqual([...await readBoundUnread(primary, binding)], [second])

  account = 'other-synthetic-account'
  assert.equal(await readBoundUnread(primary, binding), null)
  assert.throws(() => codexDesktopPersistedReadBinding(unreadStorage.snapshot(primary), binding),
    { unreadBindingConflict: true })
  unavailable = true
  assert.equal(await readBoundUnread(primary, binding), null)
  assert.equal(legacyReads, 0)
  assert.deepEqual(unreadStorage.watchPaths(primary), [primary, database, `${database}-wal`])
  return 17
}

async function checkNativeUnreadWatcherScope(source) {
  const guardStart = source.indexOf('function codexDesktopUnreadReadGuard(')
  const guardEnd = source.indexOf('\nclass CodexDesktopCompanionBridge', guardStart)
  const refreshStart = source.indexOf('  refreshPersistedUnreadFromStorage(')
  const refreshEnd = source.indexOf('\n  ensureUnreadStateWatcher(', refreshStart)
  assert(guardStart >= 0 && guardEnd > guardStart && refreshStart >= 0 && refreshEnd > refreshStart)
  const primary = '/synthetic/.codex-global-state.json'
  const reads = []
  const accepted = []
  const bridge = {
    unreadStateWatchPath: primary, state: 'connected', streamGeneration: 1,
    readStateBinding: {}, refreshPersistedUnread() { accepted.push(this.streamGeneration) }
  }
  const context = {
    codexDesktopBridge: bridge, codexCausalDomain: 'source', codexLiveEvidenceSequence: 40,
    codexNativeStatePaths: () => ({ primary }),
    codexDesktopOpenObservation: { unreadStorage: {
      refresh(_path, isCurrent) {
        return new Promise(resolve => reads.push(() => resolve(isCurrent() ? {} : null)))
      },
      snapshot: () => ({})
    } }
  }
  Object.assign(bridge, new Script(`${source.slice(guardStart, guardEnd)}
    ({${source.slice(refreshStart, refreshEnd)}})`).runInNewContext(context))

  bridge.refreshPersistedUnreadFromStorage(primary)
  bridge.streamGeneration += 1
  reads[0]()
  await new Promise(setImmediate)
  assert.deepEqual(accepted, [], 'a late read must not reach a new stream generation')

  context.codexLiveEvidenceSequence += 1
  reads[1]()
  await new Promise(setImmediate)
  assert.deepEqual(accepted, [], 'a sample started before newer completion evidence must not reach the watcher')

  reads[2]()
  await new Promise(setImmediate)
  assert.deepEqual(accepted, [2], 'the current sample is applied after the obsolete reads are dropped')
  return 3
}

function checkRolloutTurnOwnership(require) {
  const { createCodexRolloutEvidence } = require('./codex/rollout-evidence.cjs')
  const { createCodexRolloutRuntimeState } = require('./codex/rollout-runtime-state.cjs')
  const { createCodexDesktopActivityResolution } = require('./codex/desktop-activity-resolution.cjs')
  const helpers = { record: value => value || {}, timestampMs: value => Number(value) || 0 }
  const rollout = createCodexRolloutEvidence(helpers)
  const runtime = createCodexRolloutRuntimeState({ ...helpers, rolloutTimestampMs: rollout.codexRolloutTimestampMs })
  const activity = createCodexDesktopActivityResolution({ ...helpers, validThreadId: Boolean,
    isConfirmedTurnEvidence: () => true, waitingEvidenceVisible: () => false,
    desktopRequestFlag: () => '', desktopIsPlanImplementationRequest: () => false })
  const line = (timestamp, payload, type = 'event_msg') => JSON.stringify({ type, timestamp, payload })
  const olderStart = line(1000, { type: 'task_started', turn_id: 'old-turn' })
  const newerStart = line(2000, { type: 'task_started', turn_id: 'new-turn' })
  const newerComplete = line(2300, { type: 'task_complete', turn_id: 'new-turn' })
  const delayedAbort = line(2400, { type: 'turn_aborted', turn_id: 'old-turn', started_at: 1000 })
  const history = [olderStart, newerStart, newerComplete, delayedAbort].join('\n')
  const latest = runtime.codexRolloutRuntimeStateText(history)
  assert.deepEqual([latest.phase, latest.turnId], ['completed', 'new-turn'])

  const truncatedTerminal = line('2026-11-25T05:46:00Z', { type: 'task_complete', turn_id: 'previous-turn' })
  const replayedStart = line('2026-11-25T05:45:59.999Z', { type: 'task_started', turn_id: 'replayed-turn' })
  const overlappingStart = line('2026-11-25T05:46:00.180Z', { type: 'task_started', turn_id: 'next-turn' })
  for (const staleOrUnordered of [replayedStart, overlappingStart]) {
    const retained = runtime.codexRolloutRuntimeStateText([truncatedTerminal, staleOrUnordered].join('\n'))
    assert.deepEqual([retained.phase, retained.turnId], ['completed', 'previous-turn'],
      'a truncated terminal does not establish order for an earlier or overlapping start')
  }
  const nextStartedAt = '2026-11-25T05:47:08.180Z'
  const nextStart = line(nextStartedAt, { type: 'task_started', turn_id: 'next-turn' })
  const nextRun = runtime.codexRolloutRuntimeStateText([truncatedTerminal, replayedStart, nextStart].join('\n'))
  assert.deepEqual([nextRun.phase, nextRun.turnId, nextRun.turnOrderUnclear], ['active', 'next-turn', undefined])
  const proof = runtime.codexRolloutRuntimeForTurn(nextRun, {
    known: { lastTurnId: 'next-turn', lastTurnStatus: 'interrupted', lastTurnStartedAt: Date.parse(nextStartedAt) - 180 },
    writable: true
  })
  assert.equal(proof?.phase, 'active', 'the current writer can establish the same Turn after its predecessor ends')
  const nextComplete = line('2026-11-25T05:47:19.100Z', { type: 'task_complete', turn_id: 'next-turn' })
  const settled = runtime.codexRolloutRuntimeStateText([truncatedTerminal, nextStart, nextComplete].join('\n'))
  assert.deepEqual([settled.phase, settled.turnId], ['completed', 'next-turn'])

  const pending = line(2250, { type: 'function_call', turn_id: 'new-turn',
    name: 'request_user_input', call_id: 'current-question' }, 'response_item')
  for (const beginning of [[newerStart], []]) {
    const input = rollout.codexRolloutPendingUserInputStateText([...beginning, pending, delayedAbort].join('\n'))
    assert.equal(input.pending, true, 'an old interruption cannot settle the newer pending input')
  }

  const coarseTerminal = { id: 'old-turn', status: 'completed', startedAt: 3000,
    turnStartedAtPrecisionMs: 1000, completedAt: 3700 }
  const newerAbort = { phase: 'interrupted', edge: 'turn-aborted', turnId: 'new-turn',
    startedAt: 3200, edgeAt: 3710, interruptedAt: 3710 }
  assert.equal(activity.codexDesktopUnloadedSideTerminal(coarseTerminal, newerAbort), null,
    'an overlapping timestamp range cannot order different Turns')
  assert.equal(activity.codexDesktopUnloadedSideTerminal({ ...coarseTerminal, id: 'new-turn', status: 'interrupted' }, newerAbort)?.id,
    'new-turn', 'the same identified interruption can align timestamp precision')
  assert.equal(activity.codexDesktopUnloadedSideTerminal(coarseTerminal, { phase: 'active', turnId: 'new-turn', startedAt: 4000 }), null,
    'a native terminal from another Turn cannot hide the later rollout activity')

  const plan = [
    line(5000, { type: 'task_started', turn_id: 'plan-turn', collaboration_mode_kind: 'plan' }),
    line(5100, { type: 'item_completed', turn_id: 'plan-turn', item: { type: 'Plan', id: 'plan-artifact' } })
  ]
  const discussion = line(5200, { type: 'task_started', turn_id: 'feedback', collaboration_mode_kind: 'default' })
  for (const mutation of [
    { type: 'patch_apply_end' },
    { type: 'item_completed', item: { type: 'FileChange' } }
  ]) {
    assert.equal(rollout.codexRolloutPendingPlanStateText([...plan, discussion,
      line(5200, { ...mutation, turn_id: 'plan-turn' })].join('\n')).planReady, true)
    assert.equal(rollout.codexRolloutPendingPlanStateText([...plan, discussion,
      line(5200, { ...mutation, turn_id: 'feedback' })].join('\n')).planClearReason, 'execution-start')
  }
  assert.equal(rollout.codexRolloutPendingPlanStateText([...plan, discussion,
    line(5300, { type: 'task_started', turn_id: 'execute', collaboration_mode_kind: 'default',
      turn_attribution: { turn_trigger: 'plan_implementation' } })].join('\n')).planClearReason, 'execution-start')
  const questionText = ':::question_for_user{recommend=1}\n\n### Start the pilot?\n\n1. Start\n2. Wait\n\n:::'
  const questionItem = (text, phase = 'final_answer') => line(2200, {
    type: 'item_completed', turn_id: 'new-turn',
    item: { type: 'AgentMessage', id: 'question-card', phase, content: [{ type: 'Text', text }] }
  })
  const readQuestion = (...events) => rollout.codexRolloutPendingPlanStateText(events.join('\n')).questionCard
  assert.deepEqual(readQuestion(questionItem(questionText), newerComplete), { turnId: 'new-turn', itemId: 'question-card' },
    'the native final card survives completion even if the beginning of the Turn is outside the sample')
  assert.equal(readQuestion(newerStart, questionItem(questionText)), undefined, 'a running Turn has no final Question card')
  assert.equal(readQuestion(newerStart, questionItem(questionText), newerComplete, nextStart), undefined)
  for (const text of ['Could you decide?', `\`\`\`md\n${questionText}\n\`\`\``, `${questionText}\n${questionText}`,
    questionText.replace('recommend=1', 'recommend=3')]) {
    assert.equal(readQuestion(questionItem(text), newerComplete), undefined)
  }
  assert.equal(readQuestion(questionItem(questionText, 'commentary'), newerComplete), undefined)
  assert.equal(readQuestion(questionItem(questionText), questionItem('A later final answer.'), newerComplete), undefined)
  assert.deepEqual(readQuestion(newerStart, questionItem(questionText), newerComplete, delayedAbort),
    { turnId: 'new-turn', itemId: 'question-card' }, 'an old interruption does not close the latest card')
  return 26
}

async function checkNestedSpawnEdgeAdmission(require, source) {
  const start = source.indexOf('function codexConfirmInventoryBranchTerminal(')
  const end = source.indexOf('\nfunction codexSyncInventorySideTopology(', start)
  assert(start >= 0 && end > start)
  const fields = require('./codex/inventory-turn-fields.cjs').createCodexInventoryTurnFields({ timestampMs: Number })
  const activity = require('./codex/desktop-activity-resolution.cjs').createCodexDesktopActivityResolution({
    timestampMs: value => Number(value) || 0, validThreadId: Boolean, isConfirmedTurnEvidence: () => true,
    waitingEvidenceVisible: () => false, desktopRequestFlag: () => '', desktopIsPlanImplementationRequest: () => false
  })
  const turn = { id: 'machine-turn', status: 'interrupted', startedAt: 100, interruptedAt: 200,
    statusRequestedAt: 201, statusReceivedAt: 202 }
  const evidence = { parentThreadId: 'root', spawnEdgeParentId: 'side', spawnEdgeBasis: 1, status: 'notLoaded', latestTurn: turn }
  const replies = []
  const terminals = []
  const emitted = []
  let sequence = 2
  const { refresh, confirm } = new Script(`${source.slice(start, end)}\n({
    refresh: codexRefreshSpawnEdgeEvidence, confirm: codexConfirmInventoryBranchTerminal
  })`).runInNewContext({
    codexSpawnEdgeRead: null, codexCausalDomain: 'source', codexStateSqliteDirectory: () => '/synthetic',
    codexInventorySideRelations: new Map([['machine', 'root']]),
    codexInventorySideBranchEvidence: new Map([['machine', evidence]]),
    codexDesktopBridge: null, codexDesktopActivityResolution: activity, codexDesktopRequestProjection: null,
    codexInventoryTurnFieldsModule: fields, codexDesktopRequestCorrelation: ({ id }) => id,
    codexReadPrivateBranchTerminal: () => null, codexRememberPrivateBranchTerminal: (root, child, value) => {
      terminals.push([root, child, value.id])
      return value
    },
    codexSubagentDiscovery: { codexGetThreadSourceIdentity: () => 'machine',
      codexReadSpawnEdges(_directory, pairs) {
        assert.deepEqual(Array.from(pairs, pair => [...pair]), [['machine', 'side']])
        return new Promise(resolve => replies.push(resolve))
      }
    },
    codexThreadTurnStatusCache: new Map([['machine', { turn, scope: {} }]]),
    codexThreadTurnStatusDirty: new Map(), codexSnapshotScopeCurrent: Boolean,
    codexActivityInventory: new Map([['root', { key: 'root' }]]),
    codexPrivateThreadGoalEvidence: () => ({ goalStatus: 'none' }),
    codexDesktopShadowActivity: () => null, codexAppServerActiveDominates: () => false, codexAppServerSideActivity: () => null,
    codexNextLiveEvidenceSequence: () => ++sequence, runtimeDiagnostics: { record() {} },
    emitCodexActivityDelta(roots) { emitted.push(...Array.from(roots, root => root.key)) }
  })
  const close = { outcome: 'read', edges: [{ childId: 'machine', parentId: 'side', status: 'closed' }] }
  refresh()
  await new Promise(setImmediate)
  evidence.spawnEdgeBasis += 1
  replies.shift()(close)
  await new Promise(setImmediate)
  assert.equal(terminals.length, 0, 'late closure from a replaced member observation cannot confirm a Turn')
  refresh()
  await new Promise(setImmediate)
  replies.shift()(close)
  await new Promise(setImmediate)
  assert.deepEqual(terminals, [['root', 'machine', turn.id]])
  assert.deepEqual(emitted, ['root'], 'the direct parent verifies the native edge and the owning root gets the new evidence')
  const completed = { id: 'goal-turn', status: 'completed', statusRequestedAt: 201, statusReceivedAt: 202 }
  assert.equal(confirm('root', 'root', completed, { status: 'notLoaded', expectedStatus: 'completed', pending: true }), null)
  assert.equal(confirm('root', 'root', completed, { status: 'notLoaded', expectedStatus: 'completed' }), completed)
  return 5
}

function checkNativeStatusAcquisition(require) {
  const fields = require('./codex/inventory-turn-fields.cjs').createCodexInventoryTurnFields({
    timestampMs: value => typeof value === 'number' && value > 0 ? value < 10_000_000_000 ? value * 1_000 : value : 0
  })
  const seconds = 1_795_513_290
  const millisecondStart = seconds * 1_000 + 56
  const liveAt = millisecondStart + 100
  const first = { statusRequestedAt: liveAt - 1, statusReceivedAt: liveAt + 20 }
  const readback = { statusRequestedAt: liveAt + 21, statusReceivedAt: liveAt + 35 }
  const active = fields.sanitizeCodexTurnStatus({ id: 'same-turn', status: 'inProgress', startedAt: millisecondStart })
  const coarse = fields.sanitizeCodexTurnStatus({ id: active.id, status: 'completed', startedAt: seconds, completedAt: seconds + 1 }, first)
  assert.equal(coarse.turnStartedAtPrecisionMs, 1_000)
  assert.equal(fields.codexAlignCompletedTurnStart(active, coarse).startedAt, millisecondStart)
  assert.equal(fields.codexTurnReadIsCurrent(coarse, liveAt), false, 'a late arrival does not make an early request current')
  assert.equal(fields.codexTurnReadIsCurrent({ ...coarse, ...readback }, liveAt), true)
  assert.equal(fields.codexTurnReadIsCurrent({ ...coarse, ...readback }), true, 'current unloaded member need not have a live clock')
  assert.equal(fields.codexTurnReadIsCurrent({ ...coarse, statusReceivedAt: first.statusRequestedAt - 1 }), false)
  const other = { ...coarse, id: 'other-turn' }
  assert.equal(fields.compareInventoryTurns(active, other), 'unknown', 'overlap cannot order different Turn IDs')
  assert.equal(fields.compareInventoryTurns(active, { ...other, turnStartedAtPrecisionMs: 1 }), 'older',
    'an exact millisecond at the second boundary is still older')
  const pair = fields.codexOrderedTurnPair(active, other, { data: [other, active] }, readback)
  assert.equal(pair.turn.predecessorId, active.id)
  assert.deepEqual([pair.turn.statusRequestedAt, pair.turn.statusReceivedAt], [readback.statusRequestedAt, readback.statusReceivedAt])
  assert.equal(pair.turn.turnStartedAtPrecisionMs, 1_000)
  const goalTurn = fields.sanitizeCodexTurnStatus({ id: 'confirmed-goal-turn', status: 'completed' }, readback)
  assert.deepEqual([goalTurn.id, goalTurn.startedAt, fields.codexTurnReadIsCurrent(goalTurn)], ['confirmed-goal-turn', undefined, true])
  return 12
}

async function checkColdRolloutAdmission(require, source, fixture) {
  const { createCodexRolloutRuntimeState } = require('./codex/rollout-runtime-state.cjs')
  const rollout = createCodexRolloutRuntimeState({ record: value => value ?? {}, rolloutTimestampMs: value => Number(value) || 0 })
  const probeStart = source.indexOf('function codexRefreshRolloutDecisionTracker(')
  const probeEnd = source.indexOf('\nfunction codexArmRolloutFileWatcher(', probeStart)
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
      codexActivityInventory: new Map([[threadId, known]]), codexInventorySideBranchEvidence: new Map(),
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
      codexRolloutFileWatchers: new Map(), CODEX_ROLLOUT_FILE_WATCH_LIMIT: 64,
      CODEX_MISSING_ACTIVITY_MAPPING_RETENTION_MS: 120_000,
      codexArmRolloutDecisionWatcher() {}, codexArmRolloutFileWatcher() {},
      codexRestoreRolloutFallback() {}, recordCodexTaskSync() {}
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
  const refreshEnd = source.indexOf('\n  refreshPersistedUnreadFromStorage(', refreshStart)
  const latestStart = source.indexOf('  scheduleLatestTurnRefresh(')
  const latestEnd = source.indexOf('\n  setState(', latestStart)
  const terminalStart = source.indexOf('function codexInventoryTerminalEvidence(')
  const terminalEnd = source.indexOf('\nfunction codexThreadPersistedPlanLifecycle(', terminalStart)
  assert(refreshStart >= 0 && refreshEnd > refreshStart && latestStart >= 0 && latestEnd > latestStart
    && terminalStart >= 0 && terminalEnd > terminalStart)
  const entry = new Script(`${source.slice(terminalStart, terminalEnd)}
    ({${source.slice(refreshStart, refreshEnd)}, ${source.slice(latestStart, latestEnd)}})`)
  const threadId = 'cold-root'
  const unreadIds = new Set([threadId])
  const completion = { id: 'same-turn', status: 'completed', startedAt: 300_000, completedAt: 350_000 }
  const scenarios = [
    { name: 'baseline' },
    { name: 'weak-interruption' },
    { name: 'exact-interruption', expected: 'interrupted', interruptedAt: 350 },
    { name: 'idle-interruption', expected: 'interrupted' },
    { name: 'same Turn at second precision', expected: 'completed', turn: completion },
    { name: 'same Turn completes within its first second', expected: 'completed',
      turn: { ...completion, completedAt: completion.startedAt }, expectedCompletedAt: 300_420 },
    { name: 'older start in a different second', turn: { ...completion, startedAt: 299_000 } },
    { name: 'older precise start', turn: { ...completion, startedAt: 300_100 } },
    { name: 'different Turn in the same second', turn: { ...completion, id: 'older-turn' } }
  ]
  for (const { name: scenario, expected = 'inProgress', turn: completedTurn, interruptedAt,
    expectedCompletedAt = completion.completedAt } of scenarios) {
    const idle = scenario === 'idle-interruption'
    const startedAt = completedTurn ? 300_420 : 300
    const thread = {
      key: threadId, status: idle ? 'idle' : 'active', connectorStatus: idle ? 'idle' : 'notLoaded',
      lastTurnStartedAt: startedAt, lastTurnStatus: 'inProgress', lastTurnId: 'same-turn',
      unreadAuthority: 'desktop-persisted'
    }
    const turn = completedTurn || { id: 'same-turn', status: 'interrupted', startedAt, interruptedAt }
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
      markCodexThreadTurnStatusDirty() {},
      codexClearAppServerLiveActive() {}, codexPrivateBranchIdleConfirmed: () => idle,
      codexMarkConfirmedTerminalEvidence: () => 350, codexRememberPrivateBranchTerminal() {},
      emitCodexActivityDelta(_entries, inventoryChanged) {
        if (!inventoryChanged) published += 1
      }
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
      publishTargetedCompletion(known, _threadId, confirmed) {
        assert.equal(known, thread)
        assert.equal(confirmed.startedAt, startedAt, 'retain the live Turn start')
        assert.equal(confirmed.completedAt, expectedCompletedAt)
        published += 1
      },
      reconcileLateUnread(id, _unread, queryThreadId, { forceTerminalCheck }) {
        this.scheduleLatestTurnRefresh(id, { queryThreadId, forceQuery: forceTerminalCheck, verifyStaleActive: !idle })
      }
    }
    bridge.refreshPersistedUnread(false, { unreadIds, turnsRead: new Set([threadId]) })
    await new Promise(setImmediate)
    assert.equal(turnReads, scenario === 'baseline' ? 0 : 1, `${scenario}: use the accepted inventory history only for the initial read baseline`)
    assert.equal(bridge.persistedUnread.get(threadId), true, `${scenario}: record native unread`)
    assert.equal(thread.lastTurnStatus, expected, `${scenario}: stay running until a verified terminal`)
    assert.equal(published, expected === 'inProgress' ? 0 : 1, `${scenario}: publish only a verified phase change`)
  }
  return scenarios.length
}

async function checkVerifiedInventorySharing(require, source) {
  const readStart = source.indexOf('function readVerifiedCodexInventory(')
  const readEnd = source.indexOf('\nasync function readCodexActivitySnapshot(', readStart)
  const snapshotStart = source.indexOf('function rememberCodexSnapshotScope(')
  const scopeStart = source.indexOf('function codexSnapshotScopeCurrent(')
  const scopeEnd = source.indexOf('\nfunction scheduleCodexPendingRecovery(', scopeStart)
  const captureStart = source.indexOf('function currentCodexInventoryScope(')
  const captureEnd = source.indexOf('\nfunction invalidateCodexThreadList(', captureStart)
  assert(readStart >= 0 && readEnd > readStart && snapshotStart >= 0 && scopeStart > snapshotStart && scopeEnd > scopeStart
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
  const watcherEnd = source.indexOf('\nfunction closeCodexInventoryMembershipWatchers(', membershipEnd)
  const listStart = source.indexOf('function listAllCodexThreads(')
  const listEnd = source.indexOf('\nfunction readCodexPinMirror(', listStart)
  const scanStart = source.indexOf('async function scanVerifiedCodexInventory(')
  assert(membershipStart >= 0 && membershipEnd > membershipStart && watcherEnd > membershipEnd && scanStart >= 0 && readStart > scanStart
    && listStart >= 0 && listEnd > listStart)
  const listReads = []
  const indexModes = []
  const recovered = []
  let attachedSample = null
  const additionalTargets = []
  const { createCodexInventoryThreadTopology } = require('./codex/inventory-thread-topology.cjs')
  const inventoryTopology = createCodexInventoryThreadTopology({ validThreadId: Boolean, record: value => value ?? {}, nativeString: String })
  const emitted = []
  let queued = 0
  let pinPages = []
  let activeIndexRows = [{ id: 'root-1' }, { id: 'root-2' }]
  let nativeActiveRows = [{ id: 'root-1' }, { id: 'root-2' }]
  let nativeArchivedRows = [{ id: 'archived' }]
  const endOfRoster = new Error('roster verified')
  const { reconcile, scan, rotate, setMembershipPending, advanceArchive, trackSnapshot, readPinned, readActive } = new Script(`${source.slice(snapshotStart, scopeEnd)}
    ${source.slice(captureStart, captureEnd)}
    ${source.slice(membershipStart, membershipEnd)}
    ${source.slice(listStart, listEnd)}
    ${source.slice(scanStart, readStart)}
    ({
      reconcile: () => reconcileCodexInventoryMembership('watcher-event', false, currentCodexInventoryScope()),
      scan: scanVerifiedCodexInventory,
      readActive: (ids) => {
        codexVerifiedOfficialThreadIds = new Set(ids)
        return readCodexActiveInventoryPages({}, currentCodexInventoryScope())
      },
      readPinned: () => readCodexPinnedSection(() => true, Date.now() + 1000),
      rotate: () => { codexDesktopBridge.streamGeneration += 1 },
      setMembershipPending: value => { codexInventoryMembershipReconcilePending = value },
      advanceArchive: () => { codexInventoryArchiveRevision += 1 },
      trackSnapshot: () => {
        const threads = []
        rememberCodexSnapshotScope(threads)
        return () => codexSnapshotScopeCurrent(codexSnapshotScopes.get(threads))
      }
    })`).runInNewContext({
    codexDesktopBridge: { streamGeneration: 1 }, codexInventoryMembershipGeneration: 1, codexCausalDomain: 'source',
    codexInventoryMembershipEnabled: () => true,
    codexActivityInventory: new Map(), codexLocalArchiveRecoverySuppressions: new Set(),
    codexVerifiedOfficialThreadIds: new Set(['root-1']), codexRosterForPreflight: null, codexDesktopSideRelations: new Map(),
    codexIndexedInventoryRows: new WeakSet(), codexInventoryRelationRevision: 0, codexInventoryArchiveRevision: 0,
    codexSnapshotScopes: new WeakMap(), codexSideParentThreadId: () => '',
    codexVerifiedInventoryInFlight: null,
    codexInventoryRefreshPending: false, codexInventoryMembershipReconcilePending: false, codexInventoryMembershipForcePending: false,
    codexInventoryMembershipCoveragePending: false,
    companionTaskKernel: { isProviderCached: () => true }, codexThreadTurnStatusDirty: new Map(),
    codexThreadListVersion: 0, codexThreadListSamples: new Map(), codexRetiredThreadIds: new Map(),
    codexWatchedRolloutCandidates: new Map(), CODEX_THREAD_TURN_STATUS_TIMEOUT_MS: 1000,
    codexRestoreDesktopSideRelationHints() {}, codexRuntimeDiagnostics: null, codexPinObserver: null,
    codexStateSqliteDirectory: () => '/synthetic', readCodexAttachedSides: () => attachedSample,
    codexInventoryThreadTopologyModule: inventoryTopology, codexSubagentDiscovery: null,
    requestCodexPinReconciliation() {},
    codexPinBridgeModule: { CODEX_PINNED_SECTION_ID: 'pinned' },
    CODEX_THREAD_PAGE_SIZE: 100, noteCodexInventorySample() {},
    codexError: (code, message) => Object.assign(new Error(message), { code }),
    async requestCodexRpc(_method, { archived, sectionId, sortKey, useStateDbOnly, modelProviders }, _timeout, _current, options) {
      listReads.push(sectionId || archived)
      if (sectionId) {
        assert.equal(archived, false)
        assert.equal(sortKey, 'section_position')
        assert.equal(useStateDbOnly, true)
        assert.equal(modelProviders.length, 0)
        assert.equal(options.observeMembership, false)
        return pinPages.shift() || { data: [], nextCursor: null }
      }
      if (archived) return { data: nativeArchivedRows, nextCursor: null }
      indexModes.push(useStateDbOnly === true)
      if (useStateDbOnly) assert.equal(options.observeMembership, false)
      return { data: useStateDbOnly ? activeIndexRows : nativeActiveRows, nextCursor: null }
    },
    publishCodexInventoryArchive(archive, changed) {
      emitted.push([[...archive.roots], changed, 'urgent', [...archive.archivedKeys], { scheduleInventory: false }])
    },
    queueCompanionHostReconciliation() { queued += 1 },
    runtimeDiagnostics: { record() {} }, readCodexNativeRegistry: () => ({}),
    recoverCodexThreadsMissingFromInventory(rows, targets, archived, _relations, _scope, attachedParents) {
      if (attachedSample && !attachedParents.has('late-side')) return [...rows, { id: 'late-root' }]
      if (attachedSample) additionalTargets.push(...targets)
      recovered.push([rows[0].id, [...archived]])
      throw endOfRoster
    },
    validCodexThreadId: id => Boolean(id), codexRecord: value => value ?? {},
    codexThreadKey: id => id, CODEX_MISSING_ACTIVITY_MAPPING_RETENTION_MS: 100,
    codexThreadRolloutCandidate: thread => thread.path === '/synthetic/current'
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
  assert.equal((await readPinned()).length, 0, 'an ordered, independent partition accepts a complete empty page')
  assert.deepEqual(listReads, [false, true, 'pinned'])
  await reconcile()
  rotate()
  await assert.rejects(scan(), error => error === endOfRoster)
  assert.deepEqual(listReads, [false, true, 'pinned', false, true], 'a new stream reads its own active and archived lists')
  const queuesBefore = queued
  const superseded = reconcile()
  setMembershipPending(true)
  assert.equal(await superseded, false, 'a newer membership signal prevents publishing the older sample')
  assert.equal(queued, queuesBefore)
  setMembershipPending(false)
  const snapshotCurrent = trackSnapshot()
  assert.equal(snapshotCurrent(), true)
  const preArchive = reconcile()
  advanceArchive()
  assert.equal(await preArchive, false, 'an archive during membership reconciliation discards the old roster')
  assert.equal(queued, queuesBefore, 'a superseded roster cannot queue a stale preflight')
  assert.equal(snapshotCurrent(), false, 'an archive invalidates an older inventory between projection and publication')
  setMembershipPending(false)
  const readsBefore = listReads.length
  await assert.rejects(scan(), error => error === endOfRoster)
  assert.deepEqual(listReads.slice(readsBefore), [false, true], 'a new archive revision cannot join older list samples')
  pinPages = [{ data: [{ id: 'second' }], nextCursor: 'next' }, { data: [{ id: 'first' }], nextCursor: null }]
  assert.deepEqual(Array.from(await readPinned(), row => row.id), ['second', 'first'], 'the partition retains native page order')
  pinPages = [{ data: [] }]
  await assert.rejects(readPinned(), { code: 'protocol-error' }, 'a success frame without pagination coverage cannot clear pins')
  pinPages = [{ data: [{ id: 'root' }], nextCursor: 'next' }, { data: [{ id: 'root' }], nextCursor: null }]
  await assert.rejects(readPinned(), { code: 'protocol-error' }, 'a duplicated row invalidates the partition')
  pinPages = Array.from({ length: 5 }, (_, index) => ({ data: [], nextCursor: `cursor-${index}` }))
  await assert.rejects(readPinned(), { code: 'protocol-error' }, 'a continuation beyond the page bound cannot clear pins')
  assert(indexModes.every(Boolean), 'a covering index uses only the fast active inventory')
  activeIndexRows = [{ id: 'root-1' }, { id: 'index-only', path: '/synthetic/current', recencyAt: 100 },
    { id: 'missing-file', path: '/synthetic/missing' }]
  assert.deepEqual(Array.from(await readActive(['root-1', 'root-2']), thread => thread.id),
    ['index-only', 'root-1', 'root-2'], 'index coverage loss keeps native rows and verified index-only rows')
  assert.deepEqual(indexModes.slice(-2), [true, false], 'coverage loss invokes native scan-and-repair')
  nativeArchivedRows = [{ id: 'archived' }, { id: 'root-2' }]
  rotate()
  assert.equal((await readActive(['root-1', 'root-2'])).some(thread => thread.id === 'root-2'), false,
    'confirmed archive absence permits the fast active inventory')
  nativeArchivedRows.push({ id: 'index-only' })
  rotate()
  assert.equal((await readActive(['root-1', 'root-2'])).some(thread => thread.id === 'index-only'), false,
    'an active index row contradicted by archive membership is not recovered')
  assert.deepEqual(indexModes.slice(-2), [true, false], 'an active archive conflict requires the ordinary native query')
  rotate()
  attachedSample = { parents: new Map([['late-side', 'late-root']]), retired: new Set() }
  await assert.rejects(scan(), error => error === endOfRoster)
  assert.deepEqual(additionalTargets, ['late-side'], 'a recovered root unlocks its attached Side in the same inventory scan')
  const sessions = '/synthetic/sessions'
  const archivedSessions = '/synthetic/archived_sessions'
  const fresh = 'b3345678-1234-4234-8234-123456789abc'
  const known = 'a3345678-1234-4234-8234-123456789abc'
  const filename = id => `2026/11/25/rollout-2026-11-25T09-00-00-${id}.jsonl`
  const { createCodexSubagentDiscovery } = require('./codex/subagent-discovery.cjs')
  const discovery = createCodexSubagentDiscovery({ fs: {}, path: { basename: value => value.split('/').at(-1) },
    validThreadId: id => /^[a-f0-9-]{36}$/.test(id) })
  const listeners = new Map()
  const requests = []
  const targeted = []
  const hints = new Map()
  const turnCache = new Map()
  const dirty = []
  const watch = new Script(`${source.slice(membershipEnd, watcherEnd)}\nensureCodexInventoryMembershipWatchers`).runInNewContext({
    codexInventoryMembershipEnabled: () => true, codexInventoryMembershipRoots: () => [sessions, archivedSessions],
    codexInventoryMembershipWatchers: new Map(), codexInventoryMembershipStatPaths: new Set(),
    codexCompleteInventoryThreadIds: new Set([known]), codexVerifiedOfficialThreadIds: new Set(),
    codexWatchedRolloutCandidates: hints, CODEX_WATCHED_ROLLOUT_LIMIT: 100,
    CODEX_WATCHED_ROLLOUT_WAKE_DELAYS_MS: [300, 1000, 3000], codexThreadTurnStatusCache: turnCache,
    markCodexThreadTurnStatusDirty(id) { dirty.push(id) },
    queueCodexTargetedInventoryRead(id) { targeted.push(id); return true },
    codexWakeWatchedRolloutCandidates() {},
    codexSubagentDiscovery: discovery, path: { basename: value => value.split('/').at(-1), resolve },
    fs: { watch(root, _options, listener) { listeners.set(root, listener); return {} } },
    requestCodexInventoryMembershipReconciliation(reason, options) { requests.push([reason, options?.forceTasksOnly === true]) }
  })
  watch({ reconcile: false })
  listeners.get(sessions)('rename', filename(fresh))
  listeners.get(sessions)('rename', filename(known))
  listeners.get(archivedSessions)('rename', filename(fresh))
  listeners.get(sessions)('change', filename(fresh))
  assert.deepEqual(requests, [['watcher-event', false], ['watcher-event', false]],
    'an unknown rollout reads its exact member without invalidating the full list')
  assert.deepEqual(targeted, [fresh])
  assert.deepEqual([...hints.keys()], [fresh], 'an active rollout wake retains its exact identity')
  assert.equal(hints.get(fresh).path, `${sessions}/${filename(fresh)}`)
  turnCache.set(known, { emptySideHistory: {} })
  listeners.get(sessions)('rename', filename(known))
  assert.deepEqual(dirty, [known], 'materializing a verified empty Side invalidates the empty-history cache')
  assert.deepEqual(targeted, [fresh, known], 'a known Side gets a first-Turn refresh even with stable membership')
  const wakeStart = source.indexOf('function codexWakeWatchedRolloutCandidates(')
  const wakeEnd = source.indexOf('\nfunction scheduleCodexNativeInventoryCoverage(', wakeStart)
  let timer
  let now = hints.get(fresh).observedAt
  const wakeRequests = []
  const wake = new Script(`${source.slice(wakeStart, wakeEnd)}\ncodexWakeWatchedRolloutCandidates`).runInNewContext({
    codexWatchedRolloutWakeTimer: null, codexWatchedRolloutCandidates: hints,
    CODEX_WATCHED_ROLLOUT_WAKE_DELAYS_MS: [300, 1000, 3000], CODEX_MISSING_ACTIVITY_MAPPING_RETENTION_MS: 120000,
    codexInventoryMembershipEnabled: () => true, Date: { now: () => now },
    setTimeout(callback, delay) { timer = () => { now += delay; callback() }; return {} },
    queueCodexTargetedInventoryRead(id) { wakeRequests.push(id) },
    scheduleCodexNativeInventoryCoverage() { wakeRequests.push('coverage') }
  })
  wake()
  timer()
  wake()
  timer()
  assert.deepEqual(wakeRequests, [fresh, fresh], 'an earlier unrelated write does not consume the next index wake')
  wake()
  hints.delete(fresh)
  timer()
  assert.equal(wakeRequests.length, 2, 'a listed or archived candidate cannot be retried by a queued wake')

  const nativeWakeStart = source.indexOf('function scheduleCodexNativeInventoryCoverage(')
  const nativeWakeEnd = source.indexOf('\nfunction queueCodexTargetedInventoryRead(', nativeWakeStart)
  const nativeTimers = []
  const samples = []
  const fallbackReads = []
  const recoveredIds = []
  const nativeWake = new Script(`${source.slice(nativeWakeStart, nativeWakeEnd)}\ncodexWakeNativeInventory`).runInNewContext({
    codexNativeInventoryCoverageWake: null, codexLastNativeInventoryCoverageAt: now, codexNativeInventoryWake: null,
    codexNativeInventoryWakePending: false, CODEX_MISSING_ACTIVITY_MAPPING_RETENTION_MS: 4000, CODEX_WATCHED_ROLLOUT_LIMIT: 100,
    codexInventoryMembershipEnabled: () => true, currentCodexInventoryScope: () => ({}), codexSnapshotScopeCurrent: Boolean,
    codexCompleteInventoryThreadIds: new Set(), codexVerifiedOfficialThreadIds: new Set(), codexActivityInventory: new Map(),
    codexInventorySideRelations: new Map(), codexRetiredThreadIds: new Map(), codexWatchedRolloutCandidates: hints,
    codexStateSqliteDirectory: () => '/synthetic', Date: { now: () => now },
    codexSubagentDiscovery: { codexReadRecentInventoryTargets: () => new Promise(resolve => samples.push(resolve)) },
    requestCodexInventoryMembershipReconciliation(reason, options) { fallbackReads.push({ reason, ...options }); return true },
    queueCodexTargetedInventoryRead(id) { recoveredIds.push(id); return true },
    setTimeout(callback, delay) { nativeTimers.push({ callback, at: now + delay }); return {} }
  })
  const runNextTimer = () => {
    nativeTimers.sort((left, right) => left.at - right.at)
    const next = nativeTimers.shift()
    now = next.at
    return next.callback()
  }
  nativeWake()
  const firstSample = runNextTimer()
  nativeWake()
  samples.shift()({ ids: [], truncated: false })
  await firstSample
  assert.equal(fallbackReads.length, 0, 'coverage waits out its cooldown')
  const trailingSample = runNextTimer()
  samples.shift()({ ids: [fresh], truncated: false })
  await trailingSample
  assert.deepEqual(recoveredIds, [fresh], 'a WAL wake during the prior read gets a trailing read without another write')
  runNextTimer()
  assert.deepEqual(fallbackReads, [{ reason: 'state-file', forceTasksOnly: true, verifyCoverage: true, preserveCurrentList: true }],
    'the retained coverage request runs once even after the WAL goes quiet')
  return 39
}

async function checkColdInventoryTopologyFence(require, source) {
  const { createCodexInventoryThreadTopology } = require('./codex/inventory-thread-topology.cjs')
  const topology = createCodexInventoryThreadTopology({ validThreadId: Boolean, record: value => value ?? {}, nativeString: String })
  const start = source.indexOf('async function scanVerifiedCodexInventory(')
  const end = source.indexOf('    let unreadIds = null', start)
  assert(start >= 0 && end > start)
  const scanScript = new Script(`${source.slice(start, end)}
    return { listedRows, attached, memberRows }
  }
}
scanVerifiedCodexInventory`)
  const run = async ({ listChange = false, turnChanges = 0, projectChange = false, archiveAt = '', restoredSide = false } = {}) => {
    const scope = { listVersion: 1 }
    const retiring = { id: 'retiring' }
    const restored = { id: 'restored', threadSource: 'user', attachedToThreadId: 'root' }
    let active = [{ id: 'root' }, retiring]
    const archived = [{ id: 'archived' }]
    const retired = new Map([['archived', 'thread-archived']])
    if (restoredSide) retired.set(restored.id, 'archive-inventory-confirmed')
    const context = {
      codexInventoryRelationRevision: 1, codexInventoryArchiveRevision: 1, codexInventoryRefreshPending: false,
      codexRosterForPreflight: null, codexVerifiedInventoryInFlight: null,
      codexDesktopBridge: null, runtimeDiagnostics: { record() {} },
      codexThreadTurnStatusDirty: new Map(), codexIndexedInventoryRows: new WeakSet(),
      codexWatchedRolloutCandidates: new Map(), codexDesktopSideRelations: new Map(),
      codexRetiredThreadIds: retired,
      codexVerifiedOfficialThreadIds: new Set(['root']), codexActivityInventory: new Map(),
      codexStateSqliteDirectory: () => '/synthetic', codexRestoreDesktopSideRelationHints() {},
      codexSnapshotScopeCurrent: sample => sample?.listVersion === scope.listVersion,
      currentCodexInventoryScope: () => ({ ...scope }),
      noteCodexInventorySample() {},
      codexPinObserver: null, codexSubagentDiscovery: null, codexhostDiscovery: null,
      codexChatgptProjectIndex: null, codexDesktopOpenObservation: null,
      codexNativeStatePaths: () => ({}), codexDesktopUnreadReadGuard: () => () => true,
      codexRecord: value => value ?? {}, validCodexThreadId: Boolean, codexThreadKey: value => value,
      codexInventoryThreadTopologyModule: topology, codexObserveThreadMembership() {},
      codexInventoryProjectAssignments: () => ({ assignments: new Map(), sideRelations: new Map() }),
      recoverCodexThreadsMissingFromInventory: (rows, targets) => targets.has(restored.id) ? [...rows, restored] : rows,
      readCodexThreadGoals: async () => ({}),
      codexError: (code, message) => Object.assign(new Error(message), { code }),
      invalidateCodexThreadList() { scope.listVersion += 1 },
      codexSideParentThreadId: () => '',
      scheduleCodexNativeInventoryCoverage() { coverage += 1 }
    }
    const retire = () => {
      active = active.filter(row => row !== retiring)
      archived.push(retiring)
      retired.set(retiring.id, 'thread-archived')
      context.codexInventoryArchiveRevision += 1
      context.codexInventoryRelationRevision += 1
    }
    const lists = []
    const samples = []
    const archiveProofs = []
    let coverage = 0
    let fingerprint = 'current'
    let turnReads = 0
    context.readCodexNativeRegistry = () => ({ fingerprint })
    context.listAllCodexThreads = async isArchived => {
      const rows = isArchived ? archived : active
      lists.push(isArchived)
      if (listChange && lists.length === 1) context.codexInventoryRelationRevision += 1
      if (archiveAt === 'list' && lists.length === 1) retire()
      return rows
    }
    context.readCodexAttachedSides = () => {
      samples.push(context.codexInventoryRelationRevision)
      return { parents: new Map(restoredSide ? [[restored.id, restored.attachedToThreadId]] : []),
        retired: new Set(), topologyRevision: samples.at(-1) }
    }
    context.readCodexThreadTurnStatuses = async () => {
      turnReads += 1
      archiveProofs.push(retired.get('archived'))
      if (archiveAt === 'projection' && turnReads === 1) retire()
      if (turnReads <= turnChanges) context.codexInventoryRelationRevision += 1
      if (projectChange && turnReads === 1) fingerprint = 'changed'
      return { latest: new Map(), readSucceededIds: new Set() }
    }
    const result = await scanScript.runInNewContext(context)().catch(error => error.code || error.name)
    return { result, lists, samples, coverage, retired, archiveProofs, version: scope.listVersion }
  }
  const duringList = await run({ listChange: true })
  assert.deepEqual(duringList.samples, [2], 'the relation fence begins after the slow active list')
  assert.equal(duringList.result.attached?.topologyRevision, 2)
  const duringProjection = await run({ turnChanges: 1 })
  assert.deepEqual(duringProjection.lists, [false, true], 'retrying topology reuses both current roster pages')
  assert.deepEqual(duringProjection.samples, [1, 2], 'the retry fetches a fresh relation sample')
  assert.equal(duringProjection.version, 1, 'same-source relation churn does not invalidate the roster')
  assert.deepEqual(duringProjection.archiveProofs, ['thread-archived', 'thread-archived'],
    'a topology retry cannot promote archive evidence during projection')
  assert.equal(duringProjection.retired.get('archived'), 'archive-inventory-confirmed', 'a committed read can confirm archive evidence')
  const busy = await run({ turnChanges: 2, restoredSide: true })
  assert.equal(busy.result, 'protocol-error', 'a second conflict cannot publish an ambiguous topology')
  assert.equal(busy.coverage, 1, 'a second conflict schedules bounded background recovery')
  assert.equal(busy.retired.get('archived'), 'thread-archived', 'an aborted projection leaves archive proof untouched')
  assert.equal(busy.retired.get('restored'), 'archive-inventory-confirmed', 'an aborted attachment cannot clear a retirement marker')
  const restored = await run({ restoredSide: true })
  assert(restored.result.memberRows.some(row => row.id === 'restored'), 'a verified attachment enters the committed roster')
  assert.equal(restored.retired.has('restored'), false, 'commit releases the restored Side retirement marker')
  const newProject = await run({ projectChange: true })
  assert.equal(newProject.version, 2, 'a changed project still invalidates roster provenance')
  assert.deepEqual(newProject.lists, [false, true, false, true], 'project changes resample both rosters')
  const archivedDuringList = await run({ archiveAt: 'list' })
  assert.deepEqual(archivedDuringList.lists, [false, false, true], 'an archive in flight invalidates the active list before projection')
  assert.deepEqual(archivedDuringList.samples, [2], 'the obsolete roster never projects topology')
  assert.deepEqual(Array.from(archivedDuringList.result.memberRows, row => row.id), ['root'], 'the late active row cannot revive the archive')
  const archivedDuringProjection = await run({ archiveAt: 'projection' })
  assert.deepEqual(archivedDuringProjection.lists, [false, true, false, true], 'an archive during projection cannot reuse those rosters')
  assert.deepEqual(Array.from(archivedDuringProjection.result.memberRows, row => row.id), ['root'])
  assert.equal(archivedDuringProjection.retired.get('retiring'), 'archive-inventory-confirmed')
  return 21
}

async function checkHotTargetedInventory(require, source) {
  const { createCodexInventoryThreadTopology } = require('./codex/inventory-thread-topology.cjs')
  const topology = createCodexInventoryThreadTopology({ validThreadId: Boolean,
    record: value => value ?? {}, nativeString: value => typeof value === 'string' ? value : '' })
  const start = source.indexOf('async function recoverCodexTargetedInventory(')
  const end = source.indexOf('\nasync function recoverCodexThreadsMissingFromInventory(', start)
  const rows = new Map(['old-root', 'new-root', 'side', 'nested'].map(id => [
    id, { id, path: `/synthetic/${id}`, threadSource: 'user', status: { type: 'idle' } }
  ]))
  const sample = { parents: new Map([['side', 'new-root'], ['nested', 'side']]), receipts: new Map(),
    retired: new Set(), verified: true, topologyRevision: 1, readSequence: 1 }
  const inventory = new Map([['old-root', { key: 'old-root' }]])
  const sideRelations = new Map([['side', 'old-root'], ['nested', 'old-root'], ['unrelated', 'old-root']])
  const fences = new Map()
  const reads = []
  const emissions = []
  let release
  let held = false
  let coverage = 0
  const recover = new Script(`${source.slice(start, end)}\nrecoverCodexTargetedInventory`).runInNewContext({
    codexStateSqliteDirectory: () => '/synthetic', readCodexNativeRegistry: () => ({ fingerprint: 'current' }),
    codexActivitySourceFingerprint: 'current', codexSnapshotScopeCurrent: Boolean, codexInventoryMembershipEnabled: () => true,
    readCodexAttachedSides: () => sample, codexSubagentDiscovery: { codexCurrentAttachedSides: () => sample },
    codexSideParentThreadId: id => sideRelations.get(id), codexRetiredThreadIds: new Map(), codexTargetedInventoryFences: fences,
    codexLocalArchiveRecoverySuppressions: new Set(), codexWatchedRolloutCandidates: new Map(),
    codexInventorySideBranchEvidence: new Map(), codexDesktopSideRelations: new Map(),
    codexRolloutProof: ({ path }) => ({ candidate: path, dev: 1, ino: 2 }),
    async readCodexThreadMembershipRow(id) { reads.push(id); return rows.get(id) },
    codexInventoryThreadTopologyModule: topology, validCodexThreadId: Boolean,
    CODEX_THREAD_TURN_STATUS_CONCURRENCY: 2, CODEX_WATCHED_ROLLOUT_LIMIT: 100,
    codexInventoryProjectAssignments: (members, _registry, relations) => ({
      assignments: new Map(members.map(row => [row.id, true])), sideRelations: relations
    }),
    codexThreadTurnStatusDirty: new Map(), codexThreadTurnStatusCache: new Map(),
    async readCodexThreadTurnStatuses(members) {
      if (held) await new Promise(resolve => { release = resolve })
      const latest = new Map(members.map(row => [row.id, { id: `${row.id}-turn`, status: 'completed' }]))
      return { latest, readSucceededIds: new Set(latest.keys()), unresolvedIds: new Set() }
    },
    codexProbeColdRolloutActivity: async () => null, codexRolloutDecisionTrackers: new Map(),
    codexActivityInventory: inventory, codexActivityThreadIds: new Map(),
    sanitizeCodexThreads: members => members.map(row => ({ key: row.id, name: row.id, activeFlags: [], status: 'idle' })),
    sanitizeCodexActivityStatus: input => ({ status: input.type, activeFlags: [] }),
    codexMergedInventoryTurnFields: () => ({}), codexObserveThreadMembership() {},
    codexArchivedActivityKey: () => '', codexPrivateBranchRef: (parent, child) => `${parent}/${child}`,
    codexSyncInventorySideTopology(relations, _depths, _rows, _turns, _unread, _orphan, _sample, complete) {
      assert.equal(complete, false)
      for (const [id, parent] of relations) sideRelations.set(id, parent)
    },
    codexSyncRolloutDecisionTrackers() {}, emitCodexActivityDelta(...args) { emissions.push(args) },
    companionTaskKernel: { getActivityCheckpoint: key => emissions.at(-1)?.[4]?.targetedMembership.parents.has(key),
      getPackage: () => ({ packageRevision: emissions.length }) },
    recordCodexTaskSync() {}, codexThreadGoalCache: new Map(), codexThreadGoalRpcAvailable: false,
    scheduleCodexNativeInventoryCoverage() { coverage += 1 }
  })
  held = true
  const stale = recover(new Map([['nested', undefined]]), {})
  for (let attempt = 0; !release && attempt < 20; attempt++) await Promise.resolve()
  assert.equal(typeof release, 'function')
  fences.delete('side')
  release()
  await stale
  assert.equal(sideRelations.get('nested'), 'old-root', 'an expired intermediate member invalidates the nested result')
  assert.equal(coverage, 1, 'the invalidated chain schedules a bounded recheck')
  held = false
  const priorEmissions = emissions.length
  await recover(new Map([['nested', undefined]]), {})
  assert(reads.includes('new-root') && reads.includes('side') && reads.includes('nested'), 'a single ID recovers its missing native ancestors')
  assert.equal(sideRelations.get('nested'), 'new-root')
  assert.equal(sideRelations.get('side'), 'new-root')
  assert.equal(sideRelations.get('unrelated'), 'old-root', 'a partial result keeps an unrelated active member')
  assert.equal(emissions.length, priorEmissions + 1, 'the old edge and new attachment publish in the same delta')
  assert.deepEqual(Array.from(emissions.at(-1)[4].removedMemberKeys).sort(), ['codex-child:old-root/nested', 'codex-child:old-root/side'])
  const membership = emissions.at(-1)[4].targetedMembership
  assert.deepEqual(Array.from(membership.parents, ([key, parent]) => [key, parent]).sort(), [
    ['codex-child:new-root/nested', 'new-root'], ['codex-child:new-root/side', 'new-root'], ['new-root', '']
  ], 'only the verified root and its verified Side chain establish membership')
  assert.deepEqual(Array.from(membership.replacements, ([key, replacement]) => [key, replacement]).sort(), [
    ['codex-child:old-root/nested', 'codex-child:new-root/nested'], ['codex-child:old-root/side', 'codex-child:new-root/side']
  ])
  return 11
}

async function checkCompressedSideHistory(require, source) {
  const start = source.indexOf('function codexSideHistoryRolloutCurrent(')
  const end = source.indexOf('\nfunction codexRecoverAttachedSideInterruption(', start)
  assert(start >= 0 && end > start)
  const { createCodexNativeStatePaths } = require('./codex/native-state-paths.cjs')
  const { createCodexRolloutRuntimeState } = require('./codex/rollout-runtime-state.cjs')
  const { createCodexInventoryTurnFields } = require('./codex/inventory-turn-fields.cjs')
  const { createCodexRolloutEvidence } = require('./codex/rollout-evidence.cjs')
  const path = require('node:path').posix
  const home = '/synthetic/codex'
  const threadId = '12345678-1234-4234-8234-123456789abc'
  const logical = `${home}/sessions/${threadId}.jsonl`
  const compressed = `${logical}.zst`
  const header = id => JSON.stringify({ type: 'session_meta', payload: { id } }) + '\n'
  const encode = text => {
    const plain = Buffer.from(text)
    return zlib.zstdCompressSync ? zlib.zstdCompressSync(plain) : plain
  }
  const codec = zlib.zstdDecompress ? zlib : {
    constants: { ZSTD_d_windowLogMax: 100 },
    zstdDecompress: (buffer, _options, complete) => complete(null, buffer)
  }
  let bytes = encode(header(threadId))
  let bare = false
  let current = true
  let inode = 2
  const fileStat = () => ({ dev: 1, ino: inode, size: bytes.length, mtimeMs: 1000, isFile: () => true })
  const missing = Object.assign(new Error('not found'), { code: 'ENOENT' })
  const fs = {
    lstatSync() { if (!bare) throw missing; return fileStat() },
    realpathSync(file) { return file },
    statSync(file) { if (file !== compressed) throw missing; return fileStat() },
    promises: { open: async () => ({
      read: async buffer => ({ bytesRead: bytes.copy(buffer) }),
      stat: async () => fileStat(), close: async () => {}
    }) }
  }
  const paths = createCodexNativeStatePaths({ fs, os: { homedir: () => home }, path, process: { env: { CODEX_HOME: home } } })
  const runtime = createCodexRolloutRuntimeState({ record: value => value ?? {},
    rolloutTimestampMs: (...values) => values.map(Number).find(Boolean) || 0 })
  const cache = new Map()
  const { remember, isCurrent } = new Script(`${source.slice(start, end)}
    ({ remember: codexRememberEmptySideHistory, isCurrent: codexSideHistoryRolloutCurrent })`).runInNewContext({
    fs, Buffer, require: name => name === 'node:zlib' ? codec : require(name),
    codexNativeStatePathsModule: paths, codexThreadRolloutCandidate: paths.codexThreadRolloutCandidate,
    codexDesktopActivityResolution: { codexDesktopUnloadedSideMetadata: () => true },
    codexInventoryTurnFieldsModule: createCodexInventoryTurnFields({ timestampMs: Number }),
    codexSideHistoryScopeCurrent: () => true, codexThreadTurnStatusDirty: new Map(),
    codexThreadTurnStatusCache: cache, CODEX_ROLLOUT_PENDING_INPUT_TAIL_BYTES: 4 * 1024 * 1024,
    ...runtime, ...createCodexRolloutEvidence({ timestampMs: Number, record: value => value ?? {} })
  })
  const thread = { id: threadId, path: logical }
  const empty = { data: [], nextCursor: null, backwardsCursor: null }
  const inspect = (page = empty, proof = paths.codexCompressedSideHistoryCandidate(thread)) =>
    remember(thread, 'root', page, {}, proof, undefined, () => current)
  assert.equal(await inspect(), true, 'an empty precise native page and a matching compressed Side verify the empty history')
  const accepted = cache.get(threadId).emptySideHistory.rollout
  bare = true
  assert.equal(isCurrent(accepted), false, 'materializing plain history invalidates the compressed proof')
  bare = false
  inode++
  assert.equal(isCurrent(accepted), false, 'replacing the compressed file invalidates its evidence')
  cache.clear()
  assert.equal(await inspect({ ...empty, nextCursor: 'more' }), false, 'a partial empty page is not evidence')
  current = false
  assert.equal(await inspect(), false, 'an old async response cannot install empty history')
  current = true
  bytes = encode(header('another-thread'))
  assert.equal(await inspect(), false, 'a compressed file must identify the same Side')
  const event = JSON.stringify({ type: 'event_msg', timestamp: 2000, payload: { type: 'task_started', turn_id: 'first' } })
  bytes = encode(header(threadId) + event + '\n')
  assert.equal(await inspect(), false, 'a persisted first Turn contradicts the old empty page')
  assert.equal(cache.size, 0)
  return 8
}

function checkRolloutFileWatcher(source) {
  const closeStart = source.indexOf('function codexCloseRolloutFileWatcher(')
  const closeEnd = source.indexOf('\nfunction codexClearRolloutDecisionTrackers(', closeStart)
  const watchStart = source.indexOf('function codexArmRolloutFileWatcher(')
  const watchEnd = source.indexOf('\nfunction codexSyncRolloutDecisionTrackers(', watchStart)
  assert(closeStart >= 0 && closeEnd > closeStart && watchStart >= 0 && watchEnd > watchStart)

  const trackers = new Map(['first', 'second', 'third'].map(threadId => [
    threadId, { threadId, candidate: `/synthetic/${threadId}.jsonl`, watcherRetryAvailable: true }
  ]))
  const files = new Map()
  const polls = new Map()
  const refreshes = []
  const { arm, armFile, close } = new Script(`${source.slice(closeStart, closeEnd)}
    ${source.slice(watchStart, watchEnd)}
    ({ arm: codexArmRolloutDecisionWatcher, armFile: codexArmRolloutFileWatcher, close: codexCloseRolloutDecisionTracker })`)
    .runInNewContext({
      path: { dirname, basename }, process: { platform: 'darwin' }, queueMicrotask,
      codexRolloutDecisionTrackers: trackers, codexRolloutFileWatchers: files,
      CODEX_ROLLOUT_FILE_WATCH_LIMIT: 2, CODEX_NATIVE_STATE_RECOVERY_INTERVAL_MS: 1_000,
      codexRefreshRolloutDecisionTracker(id) { refreshes.push(id); return true },
      fs: {
        watch(target, _options, notify) {
          return { target, notify, closed: false, on(_event, listener) { this.fail = listener },
            close() { this.closed = true } }
        },
        watchFile(target, options, listener) { polls.set(target, { interval: options.interval, listener }) },
        unwatchFile(target, listener) {
          assert.equal(listener, polls.get(target)?.listener)
          polls.delete(target)
        }
      }
    })
  const [first, second, third] = trackers.values()
  for (const tracker of trackers.values()) arm(tracker)
  armFile(first)
  armFile(second)
  const initialFileWatch = files.get(first)
  assert.equal(initialFileWatch.target, first.candidate, 'the live listener watches the exact rollout')
  assert.equal(first.watcher.target, dirname(first.candidate), 'the directory listener stays available')
  assert.equal(polls.get(first.candidate).interval, 1_000, 'the original stat fallback remains bounded')
  initialFileWatch.notify('change')
  assert.deepEqual(refreshes, [first.threadId], 'an exact-file change refreshes immediately without a stat tick')
  const displacedFileWatch = files.get(second)
  armFile(third)
  assert.equal(files.size, 2, 'direct watchers cannot grow with the whole inventory')
  assert.equal(displacedFileWatch.closed, true, 'the least recently active file releases its descriptor')
  assert.equal(second.watcher.closed, false, 'displacement preserves the older task’s fallback')
  initialFileWatch.notify('rename')
  const replacement = files.get(first)
  assert.equal(initialFileWatch.closed, true)
  assert.notEqual(replacement, initialFileWatch, 'a replacement binds a fresh watcher to the same path')
  const beforeStaleCallback = refreshes.length
  initialFileWatch.notify('change')
  assert.equal(refreshes.length, beforeStaleCallback, 'late callbacks from an old file identity are ignored')
  const poll = polls.get(first.candidate).listener
  poll({ dev: 1, ino: 2, size: 25 }, { dev: 1, ino: 1, size: 15 })
  assert.equal(replacement.closed, true, 'the stat fallback detects a replacement even without a rename event')
  const errored = files.get(first)
  errored.fail()
  assert.equal(files.has(first), false)
  poll({ dev: 1, ino: 2, size: 30 }, { dev: 1, ino: 2, size: 25 })
  assert.equal(files.has(first), true, 'the next append recovers direct watching after an error')
  const active = files.get(first)
  close(first)
  assert.equal(active.closed, true)
  assert.equal(polls.has(first.candidate), false)
  const beforeCloseCallback = refreshes.length
  active.notify('change')
  poll({ dev: 1, ino: 2, size: 35 }, { dev: 1, ino: 2, size: 30 })
  assert.equal(refreshes.length, beforeCloseCallback, 'a retired tracker cannot refresh or rearm')
  return 16
}

function checkNativePinStateWatcher(require) {
  const { createCodexPinStateWatcher } = require('./codex/pin-bridge.cjs')
  const directory = resolve('fixtures', 'codex-pin-state')
  const database = resolve(directory, 'state_5.sqlite')
  const wal = resolve(directory, 'state_5.sqlite-wal')
  const handles = new Map()
  const timers = new Set()
  const files = ['state_5.sqlite', 'goals_1.sqlite', 'state_5.sqlite-shm']
  let wakes = 0
  const watcher = createCodexPinStateWatcher({
    watch(target, options, receive) {
      assert.equal(options.persistent, false)
      const handle = { receive, close: () => handles.delete(target) }
      handles.set(target, handle)
      return handle
    },
    readDirectory: () => files,
    onChange: () => { wakes += 1 },
    schedule: callback => (timers.add(callback), callback),
    cancel: callback => timers.delete(callback)
  })
  const settle = () => {
    for (const callback of timers) {
      timers.delete(callback)
      callback()
    }
  }
  watcher.update([directory])
  assert.deepEqual([...handles.keys()], [directory, database])
  handles.get(directory).receive('change', 'goals_1.sqlite')
  assert.equal(timers.size, 0, 'unrelated databases cannot wake the pin observer')
  files.push('state_5.sqlite-wal')
  handles.get(directory).receive('rename', 'state_5.sqlite-wal')
  const firstWal = handles.get(wal)
  assert(firstWal, 'directory discovery watches a newly created WAL')
  settle()
  assert.equal(wakes, 1)
  firstWal.receive('change')
  handles.get(database).receive('change')
  assert.equal(timers.size, 1, 'file writes wake the observer without a directory event and coalesce')
  settle()
  assert.equal(wakes, 2)
  firstWal.receive('rename')
  const replacementWal = handles.get(wal)
  assert(replacementWal && replacementWal !== firstWal, 'WAL replacement reconnects the file watcher')
  settle()
  firstWal.receive('change')
  assert.equal(timers.size, 0, 'a closed WAL watcher cannot wake the current observer')
  replacementWal.receive('change')
  assert.equal(timers.size, 1)
  watcher.update([])
  assert.equal(handles.size, 0)
  assert.equal(timers.size, 0, 'leaving the source cancels the queued wake')
  return 8
}

async function checkNativePinLifecycle(require, fixture) {
  const { createCodexNativePinObserver, CODEX_PINNED_SECTION_ID } = require('./codex/pin-bridge.cjs')
  const { kernel, publish } = fixture()
  const options = { hostEvidence: true, independent: true, complete: true }
  const root = { key: 'main', codexNativePin: true, providerPin: true, providerPinAuthority: 'app-server' }
  const input = { key: 'running', codexNativePin: true, phase: 'running', localPin: true }
  const external = { key: 'external', providerPin: true, providerPinAuthority: 'codexhost' }
  const rows = [root, input, external]
  const nativeRow = id => ({ id, section: { id: CODEX_PINNED_SECTION_ID } })
  const task = key => kernel.getPackage().tasks.find(row => row.key === key)
  const pending = []
  const timers = []
  const commits = []
  let scope = { providerEpoch: kernel.providerEpoch('codex') }
  let confirm = true
  const observer = createCodexNativePinObserver({
    getScope: () => scope,
    isScopeCurrent: value => value === scope,
    getCoverage: kernel.getCodexPinCoverage,
    isCurrentMember: kernel.isCurrentCodexPinMember,
    threadKey: key => key,
    readSection: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
    confirmSection: () => confirm,
    readMirror: () => ['main'],
    commit: evidence => {
      commits.push(evidence)
      return kernel.commitCodexPinEvidence(evidence)
    },
    schedule: callback => (timers.push(callback), callback),
    cancel: callback => timers.splice(timers.indexOf(callback), 1)
  })
  function startRead() {
    const callback = timers.shift()
    assert.equal(typeof callback, 'function')
    callback()
    assert.equal(pending.length, 1, 'each source has a single in-flight partition read')
    return pending.shift()
  }
  async function finish(read, values) {
    read.resolve(values)
    await new Promise(setImmediate)
  }
  try {
    publish(rows, 1, options)
    assert.equal(task('main').providerPin, null, 'a stale inventory snapshot may not publish native pins')
    observer.request('while-inventory-in-flight')
    const initial = startRead()
    observer.request('kernel-membership', { fence: false })
    observer.request('state-file', { fence: false })
    assert.equal(timers.length, 0, 'triggers coalesce during the current read')
    await finish(initial, [nativeRow('running'), nativeRow('main')])
    assert.equal(task('main').providerPin, true, 'the pin read publishes without an inventory result')
    assert.equal(task('running').providerPinOrder, 0)
    assert.equal(task('main').providerPinOrder, 1)
    assert.deepEqual(kernel.getPackage().views.groups.active, ['running'], 'phase wins over both pin sources')
    assert.deepEqual(kernel.getPackage().views.cycleKeys, ['running'])
    await finish(startRead(), [nativeRow('main'), nativeRow('running')])
    assert.equal(task('main').providerPinOrder, 0, 'section order publishes without an inventory rebuild')
    assert.equal(timers.length, 0)
    publish(rows, 2, options)
    assert.equal(task('running').providerPin, true, 'inventory without native pin evidence preserves the current value')

    observer.request('section-changed')
    startRead().reject(new Error('partial section'))
    await new Promise(setImmediate)
    assert.equal(task('main').providerPin, true, 'same-generation failure keeps last confirmed pin')
    assert.equal(task('main').providerPinFreshness, 'verifying')
    await finish(startRead(), [])
    assert.equal(task('main').providerPin, false, 'a complete native empty section clears the pin')
    assert.equal(task('running').localPin, true)
    assert.equal(task('external').providerPin, true)

    observer.request('archive')
    const late = startRead()
    publish([input, external], 3, { ...options, remove: ['main'] })
    publish(rows, 4, options)
    await finish(late, [nativeRow('main')])
    assert.equal(task('main').providerPin, null, 'a prior membership instance cannot pin a restored root')
    observer.request('restore')
    await finish(startRead(), [nativeRow('main')])
    assert.equal(task('main').providerPin, true, 'a fresh read covers the restored member')

    observer.request('before-write')
    const beforeWrite = startRead()
    observer.captureTarget('main').commit(false)
    await finish(beforeWrite, [nativeRow('main')])
    assert.equal(task('main').providerPin, false, 'an old partition result cannot undo a verified write')
    await finish(startRead(), [])
    const beforeUnchanged = kernel.getPackage().packageRevision
    observer.request('same-state')
    await finish(startRead(), [])
    assert.equal(kernel.getPackage().packageRevision, beforeUnchanged)

    observer.request('previous-source')
    const previousSource = startRead()
    scope = { ...scope }
    confirm = false
    observer.request('source-restored')
    assert.equal(task('main').providerPin, null, 'switching source invalidates old pin values')
    await finish(previousSource, [nativeRow('main')])
    await finish(startRead(), [])
    assert.equal(task('main').providerPin, null, 'a first empty response requires section capability')
    assert.equal(kernel.commitCodexPinEvidence(commits[0]), null, 'the Kernel rejects a previous source generation too')
    confirm = true
    await finish(startRead(), [])
    assert.equal(task('main').providerPin, false, 'an empty section is usable on startup once capability is confirmed')
    scope = { ...scope }
    observer.observeProtocol([{ id: 'main' }])
    timers.shift()()
    await new Promise(setImmediate)
    assert.equal(pending.length, 0, 'confirmed legacy protocol takes the read-only mirror path')
    assert.equal(task('main').providerPinAuthority, 'legacy-mirror')
    assert.equal(task('main').capabilities.pin, false)
    return 12
  } finally { observer.reset(); kernel.close() }
}

function checkPersistedTaskPreferences(require, source) {
  const start = source.indexOf('function companionPersistedTaskState(')
  const end = source.indexOf('\n/** Derived from the bound vocabulary', start)
  assert(start >= 0 && end > start)
  const { isManualTaskPhase } = require('./task-phase.cjs')
  const preferences = new Script(`${source.slice(start, end)}\ncompanionPersistedTaskState()`).runInNewContext({
    codexRecord: value => value ?? {},
    isManualTaskPhase,
    readState: () => ({ codex: {
      localPins: [{ kind: 'task', key: 'pinned-root' }],
      manualPhases: [
        { key: 'manual-root', phase: 'stopped', setAt: 123 },
        { key: 'unsupported-phase', phase: 'unknown', setAt: 124 }
      ]
    } })
  })
  assert.equal(preferences.manualPhases.get('manual-root').phase, 'stopped')
  assert.equal(preferences.manualPhases.get('manual-root').setAt, 123)
  assert.equal(preferences.manualPhases.size, 1)
  assert.equal(preferences.pins.has('pinned-root'), true)
  return 1
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

function checkRolloutInputResume(require, source, fixture, codexBranchObservationV7) {
  const { createCodexRolloutEvidence } = require('./codex/rollout-evidence.cjs')
  const { createCodexDesktopActivityResolution } = require('./codex/desktop-activity-resolution.cjs')
  const { createCodexDesktopRequestProjection } = require('./codex/desktop-request-projection.cjs')
  const threadId = 'synthetic-input-thread'
  const startedAt = 1000
  let sequence = 218
  let generation = 0
  const helpers = { record: value => value ?? {}, timestampMs: value => Number(value) || 0,
    nextLiveEvidenceSequence: () => ++sequence }
  const rollout = createCodexRolloutEvidence(helpers)
  const requests = createCodexDesktopRequestProjection(helpers)
  const { codexReduceWaitingEdge } = createCodexDesktopActivityResolution({ ...helpers, validThreadId: () => true,
    isConfirmedTurnEvidence: () => false, waitingEvidenceVisible: () => true,
    desktopRequestFlag: requests.codexDesktopRequestFlag,
    desktopIsPlanImplementationRequest: requests.codexDesktopIsPlanImplementationRequest })
  const known = { status: 'active', activeFlags: [], connectorStatus: 'active', connectorActiveFlags: [],
    statusAuthority: 'app-server-live', connectorStatusAuthority: 'connector', activityEvidence: 'activity-event',
    lastTurnStatus: 'inProgress', lastTurnId: 'same-turn', lastTurnStartedAt: startedAt, turnStartedAt: startedAt,
    lastTurnEvidence: 'turn-started', appServerLiveActive: true, appServerLiveSequence: sequence, activeEvidenceSequence: sequence }
  const tracker = { threadId, rolloutLiveSequence: sequence }
  const clear = []
  const bridge = { shadows: new Map(), cancelWaitingEdgeRefresh() {},
    clearWaitingEvidence: (id, flags, options) => clear.push([id, ...flags, options.sequence]) }
  const markStart = source.indexOf('function codexMarkAppServerLiveActive(')
  const markEnd = source.indexOf('\nfunction codexMarkConfirmedTerminalEvidence(', markStart)
  const applyStart = source.indexOf('function codexApplyRolloutDecisionState(')
  const applyEnd = source.indexOf('\nfunction codexRefreshRolloutDecisionTracker(', applyStart)
  assert(markStart >= 0 && markEnd > markStart && applyStart >= 0 && applyEnd > applyStart)
  const apply = new Script(`${source.slice(markStart, markEnd)}\n${source.slice(applyStart, applyEnd)}
    codexApplyRolloutDecisionState`).runInNewContext({
    codexActivityInventory: new Map([[threadId, known]]), codexEnsureDesktopBridge: () => bridge,
    codexActivityPublicEntry: value => value, codexTimestampMs: helpers.timestampMs,
    codexNextLiveEvidenceSequence: helpers.nextLiveEvidenceSequence, codexRolloutEvidence: rollout,
    codexReduceWaitingEdge, codexDesktopHasStickyPendingRequest: () => false
  })
  const snapshot = fixture()
  let text = ''
  const event = (timestamp, payload) => JSON.stringify({ type: 'response_item', timestamp, payload })
  const question = (callId, timestamp) => event(timestamp, { type: 'function_call', name: 'request_user_input', call_id: callId })
  const answer = (callId, timestamp) => event(timestamp, { type: 'function_call_output', call_id: callId })
  function publish(expected, line = '', interactions = []) {
    text += `${line}\n`
    apply(tracker, { input: rollout.codexRolloutPendingUserInputStateText(text), plan: {} }, false)
    const { interactionKind } = codexBranchObservationV7(known)
    const projected = requests.codexDesktopProjectFallbackInteractions({
      parentTaskKey: 'main', members: [{ taskKey: 'main', kind: interactionKind,
        waitingSince: known.waitingSince, turnEpoch: startedAt,
        clearSequence: interactionKind ? 0 : known.activeEvidenceSequence, exact: true }],
      nativeEvidence: { interactions }
    })
    snapshot.publish([{ key: 'main', phase: 'running', epoch: startedAt, branch: known }], ++generation,
      { complete: generation === 1, hostEvidence: true })
    snapshot.publishRequests(projected.interactions, projected.interactionSets, ++generation)
    snapshot.expectRoot(expected, false, 1)
    return projected.interactions
  }
  try {
    publish('running')
    const [first] = publish('waiting-input', question('first', 2000))
    publish('waiting-input', answer('unrelated', 2100))
    assert.equal(clear.length, 0, 'an unrelated output cannot close the pending question')
    const [resolved] = publish('running', answer('first', 2200))
    assert.equal(resolved.interactionRef, first.interactionRef)
    assert(resolved.sequence > first.sequence, 'the matched answer advances beyond the question and original activity')
    assert.equal(resolved.state, 'resolved')
    const next = publish('waiting-input', question('next', 2300)).find(request => request.state === 'opened')
    assert.notEqual(next.interactionRef, first.interactionRef, 'another question in the same Turn has its own instance')
    bridge.shadows.set(threadId, {})
    const approval = { ...next, kind: 'approval', interactionRef: 'a'.repeat(32),
      sequence: ++sequence, requestSetRevision: sequence }
    const pending = publish('waiting-approval', answer('next', 2400), [approval])
    assert(pending.some(request => request.interactionRef === approval.interactionRef && request.state === 'opened'))
    assert(clear.every(([id, flag]) => id === threadId && flag === 'waitingOnUserInput'))
    assert.equal(clear.at(-1)[2], resolved.sequence, 'an older rollout does not widen the current native owner cutoff')
    assert.equal(known.lastTurnId, 'same-turn')
  } finally { snapshot.kernel.close() }
}

function checkRolloutSideCompletion(require, source, fixture) {
  const { createCodexRolloutRuntimeState } = require('./codex/rollout-runtime-state.cjs')
  const { createCodexDesktopActivityResolution } = require('./codex/desktop-activity-resolution.cjs')
  const { createCodexInventoryTurnFields } = require('./codex/inventory-turn-fields.cjs')
  const parentThreadId = 'main'
  const threadId = 'side'
  const domain = 'source'
  const tracker = { threadId, parentThreadId, sideDomain: domain }
  const parents = new Map([[threadId, parentThreadId]])
  const inventory = new Map()
  const terminals = new Map()
  const turnCache = new Map()
  const sideActivities = new Map()
  const published = []
  const refreshes = []
  const bridge = { sideShadows: new Map(), hasOtherActiveBranch: () => false, cancelLatestTurnRefreshByKey() {},
    emitParentActivity: id => published.push(id),
    scheduleLatestTurnRefresh: (parent, options) => refreshes.push({ parent, ...options }) }
  let evidenceSequence = 100
  const utilities = { record: value => value ?? {}, timestampMs: value => Number(value) || 0 }
  const confirmed = value => value === 'turn-completed'
  const resolution = createCodexDesktopActivityResolution({ ...utilities, validThreadId: Boolean,
    isConfirmedTurnEvidence: confirmed, waitingEvidenceVisible: () => true,
    desktopRequestFlag: () => '', desktopIsPlanImplementationRequest: () => false })
  const rollout = createCodexRolloutRuntimeState({ ...utilities,
    rolloutTimestampMs: (...values) => values.map(utilities.timestampMs).find(Boolean) || 0 })
  const declarations = ['codexAppServerSideActivity', 'codexObserveAppServerSideActivity',
    'codexPrivateBranchTerminalKey', 'codexRememberPrivateBranchTerminal',
    'codexForgetPrivateBranchTerminal', 'codexReadPrivateBranchTerminal', 'codexApplySideTerminalNotification',
    'codexApplyRolloutSideRuntime', 'codexApplyRolloutDecisionState', 'codexRestoreRolloutFallback', 'codexSyncInventorySideTopology']
    .map(name => {
      const start = source.indexOf(`function ${name}(`)
      const end = source.indexOf('\nfunction ', start + 1)
      assert(start >= 0 && end > start, name)
      return source.slice(start, end)
    })
  const host = new Script(`${declarations.join('\n')}
    ({ apply: codexApplyRolloutDecisionState, sync: codexSyncInventorySideTopology, terminal: codexReadPrivateBranchTerminal,
      restore: codexRestoreRolloutFallback, observe: codexObserveAppServerSideActivity })`)
    .runInNewContext({
      codexCausalDomain: domain, validCodexThreadId: Boolean, codexRecord: utilities.record,
      codexTimestampMs: utilities.timestampMs, codexActivityInventory: new Map([[parentThreadId, {}]]),
      codexRetiredThreadIds: new Map(), codexInventorySideRelations: parents, codexInventorySideBranchEvidence: inventory,
      codexTargetedInventoryFences: new Map(), codexInventoryRelationRevision: 0,
      codexSideParentThreadId: id => parents.get(id), codexDesktopSideRelations: new Map(), codexDesktopBridge: bridge,
      codexEnsureDesktopBridge: () => bridge, codexThreadTurnStatusCache: turnCache, codexAppServerSideActivities: sideActivities,
      codexPrivateBranchTerminals: terminals, CODEX_PRIVATE_BRANCH_TERMINAL_LIMIT: 10,
      codexIsConfirmedTurnEvidence: confirmed, sanitizeCodexTurnStatus: value => value,
      codexInventoryTurnFieldsModule: createCodexInventoryTurnFields(utilities),
      codexDesktopRequestCorrelation: value => value.id, codexDesktopActivityResolution: resolution,
      codexDesktopHasStickyPendingRequest: () => false, codexNextLiveEvidenceSequence: () => ++evidenceSequence,
      codexDesktopShadowActivity: resolution.codexDesktopShadowActivity, codexReduceWaitingEdge: resolution.codexReduceWaitingEdge,
      codexRolloutRuntimeState: rollout, codexSubagentDiscovery: { codexIsMachineRunThread: id => id === threadId },
      recordCodexTaskSync() {},
      codexPrivateBranchIdleConfirmed: () => false, codexClearStalePreCompletionLiveUnread() {},
      codexThreadGoalNeedsTerminalRefresh: () => false, codexPrivateThreadGoalEvidence: () => ({}),
      codexLegacySideActive: false, codexRejectInternalReviewThread: () => false, codexThreadActions: new Map(),
      codexCompleteInventoryThreadIds: null, codexThreadPersistedPlanLifecycle: () => ({}),
      codexReconcileInventorySideOpenedReadWithTurn() {}, codexRefreshSpawnEdgeEvidence() {},
      codexInventoryThreadTopologyModule: null
    })
  const scenario = fixture()
  let revision = 0
  const child = { id: threadId, status: { type: 'notLoaded' } }
  function inventoryResult(turn) {
    host.sync(new Map([[threadId, parentThreadId]]), new Map(), new Map([[threadId, child]]),
      { latest: new Map([[threadId, turn]]), readSucceededIds: new Set([threadId]) })
  }
  function publish(expected) {
    const side = inventory.get(threadId)
    const terminal = host.terminal(parentThreadId, threadId)
    const member = sideActivities.get(threadId)
    const activeSequence = member?.appServerLiveSequence || side.activeEvidenceSequence
    const activity = member || side
    const fields = resolution.codexDesktopBranchTurnFields({ inventoryEvidence: side, activity,
      appServerActivity: member, lane: member ? 'app-server' : 'desktop' }, {}, {
      live: activity.status === 'active', terminal, activeSequence, turnRef: member?.turn.id || side.turnId,
      inventoryTurnRef: side.turnId, liveTurnStartedAt: member?.turn.startedAt,
      liveTurnStartedAtPrecisionMs: member?.turn.turnStartedAtPrecisionMs
    })
    scenario.publish([{ key: 'main', epoch: 1000, branch: {} }, {
      key: 'side', epoch: fields.turnStartedAt, branch: { ...side, ...fields, status: activity.status,
        ...(member ? { statusAuthority: 'app-server-live', activityEvidence: 'activity-event' } : {}) }
    }], ++revision, { complete: revision === 1, hostEvidence: true })
    scenario.expectRoot(expected, false, 2)
  }
  function observe(event, turnId, at, { emit = true, sourceTracker = tracker, writable = false,
    appended = false, pending = false } = {}) {
    const line = `${JSON.stringify({ type: 'event_msg', timestamp: at, payload: { type: event, turn_id: turnId } })}\n`
    const runtime = rollout.codexRolloutRuntimeStateText(line, appended ? Buffer.byteLength(line) : 0)
    return host.apply(sourceTracker, { runtime, input: { pending } }, emit, { observeRuntime: true, writable, appended })
  }
  try {
    const turn = { id: 'side-first', status: 'inProgress', startedAt: 1500 }
    inventoryResult(turn)
    publish('running')
    assert.equal(observe('task_complete', 'previous-turn', 1700), false)
    assert.equal(observe('task_complete', turn.id, 1400), false)
    assert.equal(observe('task_complete', turn.id, 1700, { sourceTracker: { ...tracker, sideDomain: 'old-source' } }), false)
    bridge.sideShadows.set(threadId, { ownerClientId: 'live-owner', canonicalLatestComplete: true,
      currentCanonicalTurn: { turnRef: turn.id, status: turn.status, startedAt: turn.startedAt } })
    assert.equal(observe('task_complete', turn.id, 1700), false, 'current Desktop activity vetoes a conflicting file terminal')
    bridge.sideShadows.clear()
    assert.equal(observe('task_complete', turn.id, 1700), true)
    assert.deepEqual(published, [parentThreadId])
    assert.equal(host.terminal(parentThreadId, threadId)?.terminalAt, 1700)
    publish('completed')
    inventoryResult(turn)
    publish('completed')
    const next = { ...turn, id: 'side-next', startedAt: 1800 }
    inventoryResult(next)
    publish('running')
    assert.equal(observe('task_complete', next.id, 1900, { emit: false }), true)
    assert.deepEqual(published, [parentThreadId], 'cold Side completion joins the inventory package')
    publish('completed')
    const detached = { id: 'detached-turn', status: 'interrupted', startedAt: 3000, turnStartedAtPrecisionMs: 1000,
      statusRequestedAt: 4000, statusReceivedAt: 4005 }
    inventoryResult(detached)
    publish('completed')
    assert.equal(observe('task_started', detached.id, 3916), false, 'an unchanged start requires a writable owner')
    assert.equal(observe('task_started', detached.id, 3916, { appended: true }), false,
      'an append before the current inventory request still needs a writer')
    assert.equal(observe('task_started', 'previous-turn', 3916, { writable: true }), false, 'another Turn cannot supply activity')
    assert.equal(observe('task_started', detached.id, 3916, { writable: true, pending: true }), false, 'an outstanding decision wins')
    assert.equal(observe('task_started', detached.id, 3916, { writable: true, emit: false }), true)
    const member = sideActivities.get(threadId)
    assert.equal(member.turn.id, detached.id)
    assert.equal(member.turn.turnStartedAtPrecisionMs, 1000, 'the live observation preserves the original coarse start')
    publish('running')
    inventoryResult(detached)
    publish('running')
    assert.equal(observe('task_complete', 'previous-turn', 4100, { appended: true }), false)
    assert.equal(observe('task_complete', detached.id, 3850, { appended: true }), false, 'an end before the millisecond start is stale')
    assert.equal(observe('task_complete', detached.id, 4100, { appended: true }), true)
    publish('completed')
    assert.equal(observe('task_started', detached.id, 3916, { appended: true }), false, 'confirmed terminal cannot reopen')
    const following = { ...detached, id: 'following-turn', startedAt: 5000, statusRequestedAt: 5080, statusReceivedAt: 5090 }
    inventoryResult(following)
    assert.equal(observe('task_started', following.id, 5110, { appended: true, emit: false }), true, 'a later same-member start can resume')
    publish('running')
    assert.equal(observe('turn_aborted', following.id, 5300), false, 'an unchanged abort cannot end a live turn')
    assert.equal(observe('turn_aborted', following.id, 5300, { appended: true, emit: false }), true)
    publish('stopped')
    const exited = { ...detached, id: 'writer-exit', startedAt: 6000 }
    inventoryResult(exited)
    assert.equal(observe('task_started', exited.id, 6110, { writable: true, emit: false }), true)
    assert.equal(host.restore(tracker), true)
    assert.deepEqual(refreshes.map(({ parent, queryThreadId, branchTurn }) => [parent, queryThreadId, branchTurn.id]),
      [[parentThreadId, threadId, exited.id]], 'writer exit checks the exact member and last live Turn')
    assert.equal(sideActivities.has(threadId), false)
    const handoff = { ...detached, id: 'owner-handoff', startedAt: 6000 }
    inventoryResult(handoff)
    assert.equal(observe('task_started', handoff.id, 6110, { writable: true, emit: false }), true)
    const received = host.observe(parentThreadId, threadId, { status: 'active', activeFlags: [] }, {
      ...handoff, status: 'inProgress'
    })
    assert.equal(received.fromRollout, undefined)
    assert.equal(host.restore(tracker, false), false, 'writer loss cannot delete the replacement owner')
    assert.equal(sideActivities.get(threadId), received)
  } finally { scenario.kernel.close() }
  return 24
}

function checkCodexPartialInventoryUpdates(require, source) {
  const { createCompanionTaskKernel } = require('./companion/task-kernel.cjs')
  const { createEvidenceNodeV7, createEvidenceBatchV7, createInteractionEvidenceV7,
    createInteractionSetV7 } = require('./companion/evidence-adapter-v7.cjs')
  const providers = { codex: true, claude: false, cursor: false, orca: false }
  const channels = Object.keys(createEvidenceBatchV7({ provider: 'codex' }).channels)
  const scopes = new WeakMap()
  const pending = []
  const membershipStart = source.indexOf('function codexInventoryMembershipEnabled(')
  const membershipEnd = source.indexOf('\nfunction codexPinScope(', membershipStart)
  const replayStart = source.indexOf('function selectCodexEvidenceMembers(')
  const replayEnd = source.indexOf('\nlet companionPreflightDraftSequence', replayStart)
  const applyStart = source.indexOf('function publishCompanionEvidenceBatchesV3(')
  const applyEnd = source.indexOf('\nfunction applyClaudeStateToCompanionKernel(', applyStart)
  const kernel = createCompanionTaskKernel({ initialConfiguration: { enabled: true, providers }, now: () => 1000,
    preparePendingEvidence: draft => host.preparePendingCodexEvidence(draft) })
  const configuration = { enabled: true, providers, dynamicTaskWindowHours: 24 }
  const host = new Script(`${source.slice(membershipStart, membershipEnd)}
    ${source.slice(replayStart, replayEnd)}
    ${source.slice(applyStart, applyEnd)}
    ({ applyCodexActivityToCompanionKernel, preparePendingCodexEvidence, codexInventoryMembershipEnabled })`).runInNewContext({
    companionTaskKernel: kernel, companionTaskConfiguration: () => configuration,
    companionHostReconcileInFlight: new Map(), companionHostDraftSequence: 0,
    companionProviderOrder: Object.keys(providers), companionEvidenceChannelsV7: channels,
    companionEvidenceSequenceV7: (value, fallback = 0) => Number.isSafeInteger(value) && value >= 0 ? value : fallback,
    companionCounterAggregate: value => value.activity,
    companionV7Revisions: { draft: 'companion-task-evidence-draft-v7',
      providerEvidenceBatch: createEvidenceBatchV7({ provider: 'codex' }).revision },
    createCompanionEvidenceBatchV7: createEvidenceBatchV7,
    createCompanionInteractionEvidenceV7: createInteractionEvidenceV7,
    createCompanionInteractionSetV7: createInteractionSetV7,
    companionPersistedTaskState: () => ({}),
    companionCodexEvidenceV7: entry => ({ nodes: [entry.node], relations: entry.relations || [], interactions: [], interactionSets: [] }),
    codexRecord: value => value || {}, codexDesktopBridge: null, codexCausalDomain: 'source',
    codexInventoryMembershipGeneration: 1,
    codexActivitySourceFingerprint: 'source', codexEvidenceScopes: scopes, codexSnapshotScopeCurrent: Boolean,
    codexPendingActivity: pending, codexPendingGaps: new Map(), codexPendingRecoveryAttempts: 0,
    CODEX_PENDING_ACTIVITY_LIMIT: 128, scheduleCodexPendingRecovery() {}, recordCompanionProbeGate() {},
    runtimeDiagnostics: { record() {} }
  })
  const node = (key, turnStartedAt, status, sequence, unread, parent) => createEvidenceNodeV7({
    provider: 'codex', key, family: `codex:${parent || key}`, role: parent ? 'child' : 'root',
    causalKey: `${key}:${turnStartedAt}`, causalDomain: 'source', standaloneEligible: !parent,
    capabilities: ['open'],
    metadata: { kind: 'codex-thread', actionAlias: `ct_${key}_1234567890`, revisionAt: 100, lastQuestionAt: 100 },
    observation: { kind: status, authority: status === 'turn-running' ? 'live-turn' : 'terminal',
      exact: true, sequence, observedAt: sequence, turnStartedAt, terminalAt: status === 'turn-completed' ? sequence : 0,
      unreadKnown: typeof unread === 'boolean', unread, unreadSequence: sequence }
  })
  const cache = (revision, generation, nodes, status = 'degraded') => {
    const lanes = Object.fromEntries(channels.map(lane => [lane, lane === 'membership' ? 100 + revision : generation]))
    const batch = createEvidenceBatchV7({ provider: 'codex', nodes, laneGenerations: lanes, health: status })
    scopes.set(batch, { domain: 'source', bridge: null, fingerprint: 'source' })
    return kernel.publishEvidence({ schema: 'companion-task-evidence-draft-v7', producer: 'host-preflight',
      draftRevision: revision, acceptedAt: 1000, enabled: true, complete: false, providers,
      sourceLaneGenerations: { codex: lanes }, sourceGenerations: { codex: generation },
      providerHealth: { codex: { status, generation } }, evidenceBatches: { codex: batch } },
    { provider: 'codex', epoch: kernel.providerEpoch('codex') })
  }
  const send = (generation, ...nodes) => host.applyCodexActivityToCompanionKernel({
    generation, receivedAt: 1000, sourceFingerprint: 'source', entries: nodes.map(value => ({ key: value.key, node: value }))
  })
  const current = key => kernel.getPackage().tasks.find(task => task.key === key)
  try {
    assert.equal(host.codexInventoryMembershipEnabled(), false)
    assert.equal(cache(1, 10, [node('known', 10, 'turn-running', 10)]).complete, false)
    assert.equal(kernel.isProviderCached('codex'), false)
    assert.equal(host.codexInventoryMembershipEnabled(), true, 'native recovery stays active after a partial inventory')
    assert.equal(send(20, node('known', 10, 'turn-completed', 20, true), node('cold', 15, 'turn-completed', 20, true)), 'buffered')
    assert.equal(current('known')?.phase, 'completed', 'a known member publishes while inventory coverage remains partial')
    assert.equal(current('known')?.completedUnread, true, 'the matching completion and unread evidence arrive in the same package')
    assert.equal(current('cold'), undefined, 'another member waits for its own scoped inventory evidence')
    cache(2, 18, [], 'unavailable')
    assert.equal(pending.length, 1, 'a failed inventory cannot consume held member evidence')
    cache(3, 18, [node('cold', 15, 'turn-running', 15)])
    assert.equal(current('cold')?.completedUnread, true, 'a partial sample replays evidence for the member it admitted')
    assert.equal(pending.length, 0)
    assert.equal(current('known')?.completedUnread, true, 'absence from a partial sample preserves the other member')
    assert.equal(send(21, node('known', 10, 'turn-running', 10)), true)
    assert.equal(current('known')?.completedUnread, true, 'late activity for the completed Turn cannot restore its running state')
    const read = createEvidenceNodeV7({ provider: 'codex', key: 'known', metadataPartial: true,
      metadata: { kind: 'codex-thread', revisionAt: 22 },
      observation: { unreadKnown: true, unread: false, unreadSequence: 22 } })
    assert.equal(host.applyCodexActivityToCompanionKernel({ generation: 22, receivedAt: 1000, sourceFingerprint: 'source',
      entries: [{ key: 'known', readStateOnly: true, node: read }] }), true)
    assert.equal(current('known')?.completedUnread, false, 'the known member accepts a read-only update without inventory completion')
    assert.equal(current('known')?.phase, 'completed')
    assert.equal(send(23, node('known', 23, 'turn-running', 23)), true)
    assert.equal(current('known')?.phase, 'running', 'the next Turn can start before the first complete package')
    assert.equal(kernel.getPackage().complete, false)
    assert.equal(send(24, node('target', 24, 'turn-completed', 24, true)), 'buffered')
    cache(4, 24, [node('other', 24, 'turn-running', 24)])
    assert.equal(current('target'), undefined, 'a newer partial sample of another member does not admit the target')
    const side = (key, parent, sequence) => ({
      node: node(key, 25, 'turn-running', sequence, undefined, parent),
      relations: [{ provider: 'codex', childKey: key, parentKey: parent, family: `codex:${parent}`,
        relation: 'side-thread', authority: 'codex-app-server-inventory', exact: true, generation: sequence }]
    })
    const submit = (generation, entries, parents, replacements = [], removedKeys = []) => (
      host.applyCodexActivityToCompanionKernel({ generation, receivedAt: 1000, sourceFingerprint: 'source', entries },
        removedKeys, { targetedMembership: { parents: new Map(parents), replacements: new Map(replacements) } })
    )
    const root = (key, sequence) => ({ node: node(key, 24, 'turn-completed', sequence) })
    assert.equal(submit(25, [root('target', 24), side('old-side', 'known', 25), side('unverified', 'target', 25)],
      [['target', ''], ['old-side', 'known'], ['unverified', 'wrong-parent']]), 'buffered')
    assert.equal(current('target')?.completedUnread, true, 'an exact target publishes and replays its held unread evidence')
    assert.equal(kernel.getActivityCheckpoint('old-side')?.phase, 'running', 'an exact child edge can enter during partial coverage')
    assert.equal(kernel.getActivityCheckpoint('unverified'), null, 'unproven sibling membership stays deferred')
    assert.equal(submit(26, [side('unverified', 'target', 26)], [['unverified', 'wrong-parent']],
      [['old-side', 'unverified']], ['old-side']), 'buffered')
    assert.equal(kernel.getActivityCheckpoint('old-side')?.phase, 'running', 'an unverified replacement cannot remove the old member')
    assert.equal(submit(27, [side('new-side', 'target', 27)], [['new-side', 'target']], [['old-side', 'new-side']], ['old-side']), true)
    assert.equal(kernel.getActivityCheckpoint('old-side'), null, 'a verified change of parent removes the previous member in the same transaction')
    assert.equal(kernel.getActivityCheckpoint('new-side')?.phase, 'running')
    assert.equal(submit(26, [side('old-side', 'known', 26)], [['old-side', 'known']], [['new-side', 'old-side']], ['new-side']), false)
    assert.equal(kernel.getActivityCheckpoint('old-side'), null, 'a late scoped result cannot reintroduce the retired member')
    assert.equal(kernel.isProviderCached('codex'), false, 'targeted admission does not assert whole inventory coverage')
  } finally { kernel.close() }
  return 21
}

function checkProviderSourceIsolation(require) {
  const { createCompanionTaskKernel } = require('./companion/task-kernel.cjs')
  const { registry } = require('./companion/provider-registry.cjs')
  const { createEvidenceNodeV7, createEvidenceBatchV7, claudeSessionObservationV7,
    cursorSessionObservationV7, orcaSessionObservationV7 } = require('./companion/evidence-adapter-v7.cjs')
  const providers = { codex: true, claude: true, cursor: true, orca: true }
  const sourceOrder = Object.keys(providers)
  let staleCodex = false
  const kernel = createCompanionTaskKernel({ initialConfiguration: { enabled: true, providers }, now: () => 1000,
    preparePendingEvidence: () => staleCodex ? false : null })
  const lanes = generation => ({ membership: generation, activity: generation, interaction: generation,
    unread: generation, planArtifact: generation, metadata: generation, topology: generation })
  function publish(revision, generation, observations, sourceProviders) {
    const sourceLaneGenerations = Object.fromEntries(sourceOrder.map(provider => [provider, lanes(generation)]))
    const providerHealth = Object.fromEntries(sourceOrder.map(provider => [provider, { status: 'ready', generation }]))
    const evidenceBatches = Object.fromEntries(sourceOrder.map(provider => {
      const key = `${provider}:main`
      const node = createEvidenceNodeV7({ provider, key, observation: observations[provider],
        metadata: { kind: registry.providers[provider].taskKind, revisionAt: generation,
          lastQuestionAt: 1000, actionAlias: key, ...(provider === 'codex' ? { codexNativePin: true } : {}) }, capabilities: ['open'] })
      return [provider, createEvidenceBatchV7({ provider, nodes: [node], laneGenerations: lanes(generation),
        snapshotLanes: ['membership'], completeLanes: ['membership'], health: 'ready' })]
    }))
    return kernel.publishEvidence({ schema: 'companion-task-evidence-draft-v7', producer: 'host-preflight',
      draftRevision: revision, acceptedAt: 1000, enabled: true, complete: true, providers,
      sourceGenerations: Object.fromEntries(sourceOrder.map(provider => [provider, generation])),
      sourceLaneGenerations, providerHealth, evidenceBatches }, { sourceProviders })
  }
  const observations = {
    codex: { kind: 'turn-running', authority: 'live-turn', exact: true, sequence: 10 },
    claude: claudeSessionObservationV7({ phase: 'running', turnStartedAt: 10, lastActivityAt: 10 }, false),
    cursor: cursorSessionObservationV7({ diskStatus: 'completed', lastUpdatedAt: 10 }),
    orca: orcaSessionObservationV7({ state: 'working', lastUpdatedAt: 10 })
  }
  const task = (value, provider) => value.tasks.find(row => row.provider === provider)
  try {
    const baseline = publish(1, 10, observations)
    assert.equal(baseline.complete, true)
    assert.equal(baseline.tasks.length, 4)
    const pinEpoch = kernel.providerEpoch('codex')
    const pinCoverage = kernel.getCodexPinCoverage()
    kernel.commitCodexPinEvidence({ epoch: pinEpoch, revision: 1, generation: 1, kind: 'complete',
      orderedKeys: ['codex:main'], authority: 'app-server', coverage: pinCoverage })
    kernel.commitCodexPinEvidence({ epoch: pinEpoch, revision: 2, generation: 1, kind: 'verifying', coverage: pinCoverage })
    assert.equal(task(kernel.getPackage(), 'codex').providerPin, true)
    assert.equal(task(kernel.getPackage(), 'codex').providerPinFreshness, 'verifying')
    const cursor = publish(4, 40, {
      ...observations,
      cursor: cursorSessionObservationV7({ diskStatus: 'completed', lastUpdatedAt: 10 },
        { turnOpen: true, turnStartedAt: 40, lastEventAt: 40 })
    }, ['cursor'])
    assert.equal(task(cursor, 'cursor').phase, 'running', 'Cursor Hook retains precedence over its older disk phase')
    assert.equal(cursor.providerHealth.orca.generation, 10)
    staleCodex = true
    const completed = {
      ...observations,
      codex: { kind: 'turn-completed', authority: 'terminal', exact: true, sequence: 30 },
      claude: claudeSessionObservationV7({ phase: 'completed', turnStartedAt: 10, lastStopAt: 30 }, true),
      orca: orcaSessionObservationV7({ state: 'done', lastUpdatedAt: 30, unread: true })
    }
    const mixed = publish(3, 30, completed)
    assert.equal(task(mixed, 'codex').phase, 'running', 'stale Codex scope never publishes its terminal')
    assert.equal(mixed.sourceLaneGenerations.codex.activity, 10)
    assert.equal(mixed.providerHealth.codex.generation, 10)
    assert.equal(task(mixed, 'cursor').phase, 'running', 'an earlier mixed draft cannot replace the accepted Cursor Hook result')
    assert.equal(mixed.sourceLaneGenerations.cursor.activity, 40)
    for (const provider of ['claude', 'orca']) {
      assert.equal(task(mixed, provider).phase, 'completed', `${provider} settles despite a stale Codex scope`)
      assert.equal(task(mixed, provider).unread, true, `${provider} retains its own unread evidence`)
      assert.equal(mixed.sourceLaneGenerations[provider].activity, 30)
    }
    assert.equal(publish(3, 30, completed, ['codex']), null, 'a stale single-source publication is rejected')
    staleCodex = false
    const retried = publish(3, 30, completed, ['codex'])
    assert.equal(task(retried, 'codex').phase, 'completed', 'retrying the rejected scope does not need a new draft revision')
    assert.equal(retried.tasks.length, 4)
    assert.equal(retried.sourceLaneGenerations.cursor.activity, 40)
    assert.equal(kernel.invalidateProvider('codex'), true)
    assert.equal(kernel.commitCodexPinEvidence({ epoch: pinEpoch, revision: 3, generation: 1, kind: 'complete',
      orderedKeys: ['codex:main'], authority: 'app-server', coverage: pinCoverage }), null)
    const next = kernel.getPackage()
    for (const provider of ['claude', 'cursor', 'orca']) {
      assert.equal(task(next, provider).semanticRevision, task(retried, provider).semanticRevision)
    }
    return 7
  } finally { kernel.close() }
}

async function checkProviderPreflightIsolation(require, source) {
  const { createEvidenceBatchV7 } = require('./companion/evidence-adapter-v7.cjs')
  const providers = { codex: true, claude: true, cursor: true, orca: true }
  const sourceOrder = Object.keys(providers)
  const lanes = Object.keys(createEvidenceBatchV7({ provider: 'codex' }).channels)
  const start = source.indexOf('async function preflightCompanionTaskPackageV7(')
  const end = source.indexOf('\n// Open readiness:', start)
  assert(start >= 0 && end > start)
  const threads = [{ key: 'main' }]
  const sessions = [{ sessionId: 'synthetic-session', composerId: 'synthetic-composer', paneKey: 'synthetic-pane' }]
  const evidence = provider => ({ nodes: [{ key: `${provider}:main`, role: 'root' }], interactions: [], interactionSets: [], relations: [] })
  let brokenOrca = false
  let recorded
  const preflight = new Script(`${source.slice(start, end)}
    preflightCompanionTaskPackageV7`).runInNewContext({
    codexRecord: value => value || {}, companionTaskConfiguration: () => ({ enabled: true, providers, dynamicTaskWindowHours: 24 }),
    readCompanionCodexPreflightSnapshotV7: async () => ({ provider: 'codex', status: 'ready',
      value: { threads, sourceFingerprint: 'current-source', activityGeneration: 30 } }),
    codexErrorResult: () => null, codexActivitySourceFingerprint: 'current-source',
    codexSnapshotScopes: new WeakMap([[threads, { sampledAt: 1000 }]]), codexSnapshotScopeCurrent: Boolean,
    codexEvidenceScopes: new WeakMap(), codexDesktopBridge: null, companionPreflightDraftSequence: 0,
    companionTaskKernel: { isProviderCached: provider => provider === 'codex' },
    codexRuntimeDiagnostics: { preflightRead: value => value, coldPreflight: value => { recorded = value } },
    claudeBridge: { readCodeSnapshot: () => ({ sessions, generation: 50 }), readCodeUnread: () => ({ ids: [], generation: 40 }) },
    cursorBridge: { readInventory: async () => ({ available: true, sessions }), readHookState: () => [] },
    orcaBridge: { readInventory() {
      if (brokenOrca) throw new Error('synthetic-read-error')
      return { available: true, sessions }
    } },
    companionPersistedTaskState: () => ({}), companionClaudeUnreadSnapshot: { available: false },
    companionEvidenceSequenceV7: (...values) => Math.max(0, ...values.map(value => Number(value) || 0)),
    companionProviderOrder: sourceOrder, companionEvidenceChannelsV7: lanes, createCompanionEvidenceBatchV7: createEvidenceBatchV7,
    companionCounterAggregate: generations => generations.activity,
    companionV7Revisions: { draft: 'companion-task-evidence-draft-v7', taskState: 'task-state-v12' },
    companionCodexEvidenceV7() { throw new Error('synthetic-projection-error') },
    companionClaudeEvidenceV7: () => evidence('claude'), companionCursorEvidenceV7: () => evidence('cursor'),
    companionOrcaEvidenceV7: () => evidence('orca')
  })
  const mixed = await preflight({ providers })
  assert.equal(mixed.providerHealth.codex.status, 'degraded')
  assert.equal(mixed.evidenceBatches.codex.channels.membership.complete, false, 'a failed Codex projection cannot clear its cached membership')
  assert.equal(mixed.sourceLaneGenerations.codex.activity, 0, 'a failed Codex projection cannot advance its activity lane')
  assert.equal(recorded.taskCount, 3)
  for (const provider of ['claude', 'cursor', 'orca']) {
    assert.equal(mixed.providerHealth[provider].status, 'ready')
    assert.equal(mixed.evidenceBatches[provider].channels.membership.complete, true)
  }
  brokenOrca = true
  const degraded = await preflight({ providers })
  assert.equal(degraded.providerHealth.orca.status, 'unavailable', 'a synchronous Orca read error stays local')
  assert.equal(degraded.providerHealth.claude.status, 'ready')
  assert.equal(degraded.providerHealth.cursor.status, 'ready')
  assert.equal(recorded.taskCount, 2)
  return 2
}

function checkMemberTurnCompetition(require, fixture) {
  const { createCodexDesktopActivityResolution } = require('./codex/desktop-activity-resolution.cjs')
  const resolution = createCodexDesktopActivityResolution({ timestampMs: value => Number(value) || 0,
    validThreadId: Boolean, isConfirmedTurnEvidence: () => true, waitingEvidenceVisible: () => true,
    desktopRequestFlag: () => '', desktopIsPlanImplementationRequest: () => false })
  const startedAt = 300_420
  const activeSequence = 200
  const terminal = { turnRef: 'current', turnStartedAt: 300_000, terminalAt: 330_000,
    lastTurnStatus: 'completed', lastTurnEvidence: 'turn-completed', terminalEvidenceSequence: 210 }
  const sourceRow = { lane: 'app-server', appServerActivity: { turn: { status: 'inProgress' } } }
  const baseline = { live: true, main: true, turnRef: 'current', liveTurnStartedAt: startedAt,
    activeSequence, idleConfirmed: false, causalDomain: 'native-domain' }
  for (const [label, witness, expected, explicitPredecessor, expectedStart = startedAt] of [
    ['the same Turn at second precision', terminal, 'completed'],
    ['a complete event from an earlier Turn with a higher sequence', { ...terminal, turnRef: 'earlier', turnStartedAt: 200_000 }, 'running'],
    ['a contradictory precise start with the same identity', { ...terminal, turnStartedAt: 300_100 }, 'running'],
    ['the verified predecessor even when its clock appears later', { ...terminal, turnRef: 'earlier', turnStartedAt: 300_500 },
      'running', 'earlier'],
    ['a successor with a coarse time in the same second', { ...terminal, turnRef: 'next', turnPredecessorRef: 'current' },
      'completed', '', 300_000]
  ]) {
    const snapshot = fixture()
    try {
      const fields = resolution.codexDesktopBranchTurnFields(sourceRow, {}, {
        ...baseline, terminal: witness, latestTurnRef: 'current', latestTurnPredecessorRef: explicitPredecessor
      })
      assert(fields.competingTurn, `${label}: the independent observations reach the evidence boundary`)
      const candidate = version => ({ ...version, causalKey: version.turnRef,
        causalDomain: baseline.causalDomain, turnPredecessorKey: version.turnPredecessorRef })
      snapshot.publish([{ key: 'main', epoch: startedAt, branch: {
        status: 'active', statusAuthority: 'app-server-live', activityEvidence: 'activity-event',
        lastTurnStatus: 'inProgress', turnRef: 'current', causalKey: 'current', activeEvidenceSequence: activeSequence
      } }], 1, { complete: true, hostEvidence: true })
      snapshot.publish([{ key: 'main', epoch: startedAt, branch: {
        ...candidate(fields), competingTurn: candidate(fields.competingTurn),
        status: 'active', statusAuthority: 'app-server-live', activityEvidence: 'activity-event'
      } }], 2, { hostEvidence: true })
      assert.equal(snapshot.expectRoot(expected, false, 1).turnStartedAt, expectedStart, label)
    } finally { snapshot.kernel.close() }
  }
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
        codexNativePin, providerPin, providerPinAuthority, localPin,
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
          codexNativePin, providerPin, providerPinAuthority, localPin,
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
      assert.equal(snapshot.views.counts.input, ['waiting-input', 'waiting-approval'].includes(phase) ? 1 : 0)
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
  const finalQuestion = fixture()
  try {
    const { createCodexDesktopRequestProjection } = require('./codex/desktop-request-projection.cjs')
    let sequence = 40_000
    const projection = createCodexDesktopRequestProjection({ record: value => value || {}, timestampMs: Number,
      nextLiveEvidenceSequence: () => ++sequence })
    const member = { taskKey: 'main', branchRef: 'root', turnRef: 'completed-question-turn', turnEpoch: 20_000,
      turnStartedAtPrecisionMs: 1000, questionCardRef: 'final-question-item' }
    const read = (value, nativeEvidence) => projection.codexDesktopProjectFallbackInteractions({
      parentTaskKey: 'main', members: [value], nativeEvidence
    })
    const publish = (result, generation) => finalQuestion.publishRequests(result.interactions, result.interactionSets, generation)
    const completed = { ...completedMain, unread: true, epoch: 20_000,
      branch: { causalKey: member.turnRef, turnStartedAtPrecisionMs: 1000 } }
    finalQuestion.publish([completed], 1, { hostEvidence: true })
    const opened = read(member)
    publish(opened, 2)
    const waiting = finalQuestion.expectRoot('waiting-input', true, 1)
    assert.equal(waiting.codexStatus.main.turn, 'turn-completed')
    assert.equal(waiting.planImplementation, false)
    assert.deepEqual(finalQuestion.kernel.getLatest().views.attentionKeys.input, ['main'])
    const nativeEmptySet = { interactions: [], interactionSets: [{
      revision: 'companion-interaction-evidence-v1', provider: 'codex', taskKey: 'main',
      requestSetRevision: 50_000, complete: true
    }] }
    publish(read(member, nativeEmptySet), 3)
    finalQuestion.expectRoot('waiting-input', true, 1)
    const nextTurn = { ...member, turnRef: 'following-turn', turnEpoch: 20_003,
      turnStartedAtPrecisionMs: 1, questionCardRef: '' }
    publish(read(nextTurn), 4)
    finalQuestion.expectRoot('waiting-input', true, 1)
    const successor = { ...nextTurn, turnPredecessorRef: member.turnRef }
    const closed = read(successor)
    assert.equal(closed.interactions[0].interactionRef, opened.interactions[0].interactionRef)
    assert.equal(closed.interactions[0].state, 'resolved')
    finalQuestion.publish([{ ...completed, phase: 'running', epoch: 20_003, branch: {
      causalKey: successor.turnRef, turnPredecessorKey: member.turnRef, turnStartedAtPrecisionMs: 1,
      status: 'active', statusAuthority: 'app-server-live', activityEvidence: 'activity-event',
      lastTurnStatus: 'inProgress', lastTurnEvidence: 'turn-started', activeEvidenceSequence: 40_010
    } }], 5, { hostEvidence: true })
    publish(closed, 6)
    finalQuestion.expectRoot('running', true, 1)
    assert.deepEqual(read(member).interactions, [], 'a replay of the older card cannot re-open it')
    publish(opened, 7)
    finalQuestion.expectRoot('running', true, 1)
  } finally { finalQuestion.kernel.close() }
  const plannedWithSide = fixture()
  try {
    const planned = { ...mainWithPlan, unread: true, capabilities: ['open', 'archive', 'execute-plan'] }
    const quietSide = { ...side, branch: {} }
    plannedWithSide.publish([planned, quietSide], 1, { hostEvidence: true })
    const artifactOnly = plannedWithSide.expectRoot('completed', true, 2)
    assert.equal(artifactOnly.planReady, true)
    assert.equal(artifactOnly.capabilities.executePlan, true)
    assert.deepEqual(plannedWithSide.kernel.getLatest().views.attentionKeys.input, [])
    const implementationRequest = {
      revision: 'companion-interaction-evidence-v1', provider: 'codex', taskKey: 'main', branchRef: 'main',
      interactionRef: 'f'.repeat(32), kind: 'plan-implementation', state: 'opened', sequence: 400,
      turnEpoch: 300, requestSetRevision: 2, authority: 'provider-live', exact: true
    }
    plannedWithSide.publishRequests([implementationRequest], [], 2)
    assert.equal(plannedWithSide.expectRoot('waiting-input', true, 2).planImplementation, true)
    plannedWithSide.publish([{ ...quietSide, branch: { submissionPending: true } }], 3, { hostEvidence: true })
    assert.equal(plannedWithSide.expectRoot('waiting-input', true, 2).capabilities.executePlan, false,
      'the main Plan still displays but cannot bypass a current Side submission')
    plannedWithSide.publishRequests([{ ...implementationRequest, state: 'resolved', sequence: 401, requestSetRevision: 4 }], [], 4)
    assert.equal(plannedWithSide.expectRoot('completed', true, 2).planReady, true)
    plannedWithSide.publishRequests([implementationRequest], [], 5)
    plannedWithSide.expectRoot('completed', true, 2)
    plannedWithSide.publish([{ ...planned, epoch: 2_000, branch: {
      status: 'active', statusAuthority: 'app-server-live', activityEvidence: 'activity-event',
      lastTurnStatus: 'inProgress', lastTurnEvidence: 'turn-started', activeEvidenceSequence: 2_010,
      planLifecycleState: 'cleared', planLifecycleRevision: 2_000, planClearReason: 'execution-start'
    } }], 6, { hostEvidence: true })
    assert.equal(plannedWithSide.expectRoot('running', true, 2).planReady, false)
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
    ['root Plan with an older ordinary Side interruption', mainWithPlan, endedSide, 'completed'],
    ['root Plan with a current ordinary Side interruption', mainWithPlan,
      { ...endedSide, branch: { ordinarySideInterruptedAt: 310 } }, 'stopped'],
    ['root Plan with a closed machine interruption', mainWithPlan, { ...endedSide, closedMachineRun: true, branch: {} }, 'completed'],
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
  const groupStatus = fixture()
  try {
    const rootWithHint = { ...settledRoot, branch: { idleConfirmed: true, groupActivityConfirmed: true } }
    const member = { ...side, epoch: 32_000, requestCoverage: true, branch: { ...clearedPlan, planLifecycleRevision: 31_900 } }
    groupStatus.publish([rootWithHint], 1, { hostEvidence: true })
    assert.equal(groupStatus.expectRoot('running', true, 1).codexStatus.groupActivity, true,
      'a current group signal covers members not seen yet')
    groupStatus.publish([rootWithHint, { ...member, branch: { ...member.branch, status: 'active',
      statusAuthority: 'app-server-live', activityEvidence: 'activity-event',
      lastTurnStatus: 'inProgress', activeEvidenceSequence: 32_005 } }], 2, { hostEvidence: true })
    assert.equal(groupStatus.expectRoot('running', true, 2).capabilities.archive, false)
    groupStatus.publish([rootWithHint, { ...member, branch: {
      idleConfirmed: true, planReady: true, planLifecycleRevision: 32_000, terminalEvidenceSequence: 32_010
    } }],
      3, { hostEvidence: true })
    const completedWithSidePlan = groupStatus.expectRoot('completed', true, 2)
    assert.equal(completedWithSidePlan.codexStatus.groupActivity, false,
      'a settled family retires the coarse group signal')
    assert.deepEqual([completedWithSidePlan.codexStatus.sides[0].phase, completedWithSidePlan.codexStatus.sides[0].planReady],
      ['completed', true])
    groupStatus.publishRequests([{
      revision: 'companion-interaction-evidence-v1', provider: 'codex', taskKey: 'side', branchRef: 'side',
      interactionRef: 'e'.repeat(32), kind: 'plan-choice', state: 'opened', sequence: 32_011,
      turnEpoch: 32_000, requestSetRevision: 4, authority: 'provider-live', exact: true
    }], [], 4)
    assert.equal(groupStatus.expectRoot('waiting-input', true, 2).codexStatus.sides[0].phase, 'waiting-input')
  } finally { groupStatus.kernel.close() }
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
    assert.equal(supersededPlan.expectRoot('completed', false, 1).planReady, true)
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
    assert.equal(supersededPlan.expectRoot('completed', false, 1).planLifecycleRevision, 500)
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
    [{ planReady: true }, {}, 'completed']
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
  checked += await checkVerifiedInventorySharing(require, source)
  checked += await checkColdInventoryTopologyFence(require, source)
  checked += await checkHotTargetedInventory(require, source)
  checked += checkRolloutFileWatcher(source)
  checked += checkNativePinStateWatcher(require)
  checked += await checkNativePinLifecycle(require, fixture)
  checked += checkPersistedTaskPreferences(require, source)
  checked += await checkTurnReadScope(require, source)
  checked += await checkTargetedTurnReadScope(require, source)
  checked += checkRolloutTailSampleReuse(source)
  checked += checkInventoryProjectAssignments(source)
  checked += checkMemberRequestWatermarks(source, fixture)
  checkRolloutInputResume(require, source, fixture, codexBranchObservationV7)
  checked += checkRolloutSideCompletion(require, source, fixture)
  checked += checkCodexPartialInventoryUpdates(require, source)
  checked += checkProviderSourceIsolation(require)
  checked += await checkProviderPreflightIsolation(require, source)
  checkMemberTurnCompetition(require, fixture)
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
      codexTargetedInventoryFences: new Map(), codexInventoryRelationRevision: 0, codexInventoryArchiveRevision: 0,
      codexWatchedRolloutCandidates: new Map(),
      codexDesktopBridge: null, codexThreadTurnStatusCache: new Map(), codexThreadGoalCache: new Map(), codexThreadGoalRefreshes: new Map(),
      codexClearDesktopOpenedRead() {}, invalidateCodexThreadList() {}, requestCodexPinReconciliation() {},
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
  return checked + await checkDesktopSideTerminalCapability(require, assetRoot) + checkInternalReviewMembership(require)
    + await checkSpawnEdgeReaders(require) + await checkSpawnEdgeDiscoveryBeyondFallback(require)
    + await checkAttachedSideReaders(require, source) + await checkColdAttachedSideInterruption(require, source)
    + await checkCompressedSideHistory(require, source)
    + await checkNativeSqliteUnreadStorage(require) + await checkNativeUnreadWatcherScope(source)
    + checkRolloutTurnOwnership(require)
    + await checkNestedSpawnEdgeAdmission(require, source) + checkNativeStatusAcquisition(require)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Companion lifecycles passed: ${await checkCompanionLifecycles(resolve(import.meta.dirname, '../preload'))} checkpoints`)
}
