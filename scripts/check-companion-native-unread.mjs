import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

export function checkCompanionNativeUnread(assetRoot) {
  const require = createRequire(resolve(assetRoot, 'index.js'))
  const { parseCodexDesktopUnreadState: parse, codexReadStateContextBinding: bind,
    createCodexDesktopUnreadRecovery } = require('./codex/desktop-unread-evidence.cjs')
  const main = '12345678-1234-4234-8234-123456789abc'
  const side = '22345678-1234-4234-8234-123456789abc'
  const remote = '32345678-1234-4234-8234-123456789abc'
  const identity = { kind: 'chatgpt', accountId: 'synthetic-account', userId: 'synthetic-user' }
  const identityKey = createHash('sha256').update(JSON.stringify(['chatgpt', identity.accountId, identity.userId])).digest('hex')
  const binding = bind({ identity, executionHostKey: 'synthetic-local-host' })
  assert.deepEqual(binding, { identityKey, executionHostKey: 'synthetic-local-host' })
  assert(!JSON.stringify(binding).includes('synthetic-account'), 'raw identity stays private')
  const state = {
    version: 1,
    unreadByIdentity: { [identityKey]: { 'synthetic-local-host': [main, side], 'synthetic-remote-host': [remote] } },
    legacyMigration: { identityKey, adoptedHostIds: { local: 'synthetic-local-host' } }
  }
  const root = { 'electron-thread-read-state-v1': state }
  assert.deepEqual(parse(root), [main, side], 'native migration selects only its local identity/host')
  assert.deepEqual(parse({ ...root, 'electron-persisted-atom-state': { 'unread-thread-ids-by-host-v1': { local: [] } } }), [main, side],
    'current native state wins over a conflicting old atom')
  assert.deepEqual(parse({ 'electron-persisted-atom-state': JSON.stringify({ 'unread-thread-ids-by-host-v1': JSON.stringify({ local: [main] }) }) }), [main])
  const otherKey = 'f'.repeat(64)
  const ambiguous = { 'electron-thread-read-state-v1': { ...state, unreadByIdentity: { ...state.unreadByIdentity, [otherKey]: { 'synthetic-local-host': [remote] } } } }
  assert.throws(() => parse(ambiguous), /identity/, 'never union unbound account buckets')
  assert.deepEqual(parse(ambiguous, binding), [main, side], 'exact accepted context selects one identity')
  assert.throws(() => parse({ 'electron-thread-read-state-v1': { ...state, legacyMigration: { ...state.legacyMigration, cleared: true } } }), /identity/)
  assert.throws(() => parse({ 'electron-thread-read-state-v1': { ...state, version: 2 } }), /invalid/)
  assert.deepEqual(parse({ 'electron-thread-read-state-v1': { version: 1, unreadByIdentity: {} } }, binding), [], 'native exact-context empty bucket is read')
  const { boundNativeUnreadIds, createCodexDesktopOpenObservation } = require('./codex/desktop-open-observation.cjs')
  const localHost = `local:${createHash('sha256').update(JSON.stringify(['local', 'local', null])).digest('hex')}`
  const owner = createHash('sha256').update(JSON.stringify([identity.userId, identity.accountId])).digest('hex')
  const protectedState = {
    'electron-renderer-content-owner': owner,
    'environment-catalog-cache-v2': { accountId: identity.accountId, userId: identity.userId },
    'electron-thread-read-state-v1': {
      ...state, legacyMigration: { identityKey, adoptedHostIds: { local: localHost } },
      unreadByIdentity: { [identityKey]: { [localHost]: [side], 'synthetic-remote-host': [main, remote] } }
    }
  }
  assert.deepEqual([...boundNativeUnreadIds(protectedState, { identityKey, executionHostKey: localHost })], [side],
    'only the verified current account and local host may clear the target')
  assert.equal(boundNativeUnreadIds(protectedState, binding), null, 'a receipt from the previous execution host is unknown')
  assert.equal(boundNativeUnreadIds({ ...protectedState, 'electron-renderer-content-owner': otherKey },
    { identityKey, executionHostKey: localHost }), null, 'a changed renderer account invalidates the target read')
  let currentCompletion = 'first'
  const oldShadow = { ownerClientId: 'owner', revision: 7, hasUnreadTurn: true, unreadEvidence: 'snapshot' }
  const readBridge = { state: 'connected', inventory: new Set([main]), shadows: new Map([[main, oldShadow]]),
    liveUnread: new Map(), sideShadows: new Map(), followAny: () => true }
  const recovery = createCodexDesktopUnreadRecovery({
    knownThread: () => ({ unreadAuthority: 'desktop-persisted', hasUnreadTurn: true }),
    completedInstance: () => currentCompletion
  })
  recovery.persistenceFailed(readBridge, {
    unreadFailureReason: 'binding-unavailable', unreadSourceFingerprint: 'a'.repeat(64)
  }, true)
  currentCompletion = 'second'
  const oldRead = { ...oldShadow, hasUnreadTurn: false, runtime: { status: 'idle' } }
  assert.equal(recovery.snapshotAccepted(readBridge, main, oldRead, oldShadow, 'owner'), false)
  assert.equal(oldRead.hasUnreadTurn, undefined, 'a recovery snapshot from the earlier completion cannot clear the new one')
  assert.deepEqual(oldRead.runtime, { status: 'idle' }, 'obsolete read evidence does not suppress other snapshot fields')
  currentCompletion = 'first'
  let currentGeneration = 1
  let clock = 1000
  const openEvents = []
  const observation = createCodexDesktopOpenObservation({
    record: event => openEvents.push(event), now: () => clock, setTimer: () => 1, clearTimer: () => {}
  })
  const open = observation.begin({
    threadId: main, key: 'main', operationId: 'open-first', route: 'electron-deep-link',
    readScope: { current: () => currentCompletion === 'first', acceptsLive: observed => currentGeneration === 1 && observed === binding }
  })
  open(true)
  observation.nativeRead(side, binding)
  observation.nativeRead(main, { ...binding })
  assert(!openEvents.some(event => event.outcome === 'confirmed'), 'another target or binding cannot confirm the open')
  currentCompletion = 'second'
  assert.equal(observation.nativeRead(main, binding), false, 'a superseded open receipt must not be applied to the current completion')
  observation.begin({
    threadId: main, key: 'main', operationId: 'open-second', route: 'electron-deep-link',
    readScope: { current: () => currentCompletion === 'second', acceptsLive: observed => observed === binding }
  })(true)
  assert.equal(observation.nativeRead(main, binding), false, 'reopening the same thread cannot attribute an old receipt to the new completion')
  assert(openEvents.some(event => event.operationId === 'open-first' && event.event === 'codex-open-native-read' && event.outcome === 'superseded'),
    'a delayed receipt settles only its original completion')
  assert.equal(openEvents.filter(event => event.event === 'codex-open-native-read').length, 1, 'settle the old operation once')
  currentGeneration = 2
  assert.equal(observation.nativeRead(main, binding), true, 'an independent read on the new connection may apply')
  currentGeneration = 1
  clock += 4000
  assert.equal(observation.nativeRead(main, binding), true, 'the old open cannot block native read events after its observation window')
  assert(!openEvents.some(event => event.operationId === 'open-second' && event.outcome === 'confirmed'), 'the repeated open has no attributable receipt')
  assert(openEvents.some(event => event.event === 'codex-open-target-visible' && event.outcome === 'unconfirmed'),
    'dispatch does not establish target visibility')
  const timedOut = observation.begin({
    threadId: main, key: 'main', operationId: 'open-timeout', dispatchTimeoutMs: 10_000,
    readScope: { current: () => currentCompletion === 'second', acceptsLive: observed => observed === binding }
  })
  clock += 10_000
  timedOut(false, 'unconfirmed')
  currentCompletion = 'third'
  assert.equal(observation.nativeRead(main, binding), false, 'an unconfirmed dispatch guards the original completion')
  assert(openEvents.some(event => event.operationId === 'open-timeout' && event.event === 'codex-open-native-read'
    && event.outcome === 'superseded'))
  clock += 4_000
  assert.equal(observation.nativeRead(main, binding), true, 'a subsequent independent read remains eligible')
  const { codexDesktopIpcVersionAccepted } = require('./codex/desktop-protocol.cjs')
  const file = resolve(assetRoot, assetRoot.endsWith('preload') ? 'index.js' : 'preload.js')
  const source = readFileSync(file, 'utf8')
  for (const version of [1, 2, 3]) assert(codexDesktopIpcVersionAccepted('thread-read-state-changed', version), `native unread protocol v${version}`)
  assert(!codexDesktopIpcVersionAccepted('thread-read-state-changed', 4), 'unknown unread protocol abstains')
  // Execute the real member request projector with privacy-safe synthetic shadows.
  const { createCodexDesktopRequestProjection } = require('./codex/desktop-request-projection.cjs')
  const projector = createCodexDesktopRequestProjection({ record: value => value && typeof value === 'object' ? value : {},
    timestampMs: value => Number(value) || 0, nextLiveEvidenceSequence: () => 30 })
  const project = (bridge) => projector.codexDesktopCompanionInteractionsForParent(
    bridge, 'parent', { key: 'root-key', lastTurnStartedAt: 1000 }, () => 'synthetic-side-ref', () => true)
  const own = { requestSetComplete: true, requestSetRevision: 20, requests: [] }
  const child = { parentThreadId: 'parent', requestSetComplete: true, requestSetRevision: 21,
    currentCanonicalTurn: { startedAt: 2000 }, requests: [{ type: 'userInput', method: 'requestUserInput', interactionRef: 'a'.repeat(32), observedSequence: 21, identityExact: true }] }
  const projected = project({ shadows: new Map([['parent', own]]), sideShadows: new Map([['child', child]]) })
  assert.equal(projected.interactions[0].taskKey, 'codex-child:synthetic-side-ref', 'Side question belongs to the child')
  assert.equal(projected.interactions[0].turnEpoch, 2000, 'parent epoch cannot close child input')
  assert.deepEqual(Array.from(projected.interactionSets, value => value.taskKey).sort(), ['codex-child:synthetic-side-ref', 'root-key'])
  own.requestSetComplete = false
  assert.equal(project({ shadows: new Map([['parent', own]]), sideShadows: new Map([['child', child]]) }).interactionSets.length, 1,
    'each observed member has its own complete request set')
  const proof = source.match(/topologyExact: row\.threadId === parentThreadId([\s\S]*?),\n      topologyAuthority:/)
  assert(proof)
  assert(vm.runInNewContext(`row.threadId === parentThreadId${proof[1]}`, {
    row: { threadId: 'child' }, parentThreadId: 'parent', codexInventorySideRelations: new Map(),
    codexDesktopSideRelations: new Map([['child', 'parent']])
  }), 'verified Desktop-only Side attaches without inventory duplication')
  const applyStart = source.indexOf('function applyCodexActivityToCompanionKernel(')
  const applyEnd = source.indexOf('\nfunction ', applyStart + 1)
  const selection = source.slice(source.indexOf('function selectCodexEvidenceMembers('), source.indexOf('function noteLostCodexEvidence('))
  const retirement = source.slice(source.indexOf('function retirePendingCodexMembers('), source.indexOf('function preparePendingCodexEvidence('))
  const { createEvidenceNodeV7, createEvidenceBatchV7 } = require('./companion/evidence-adapter-v7.cjs')
  const { validateCompanionEvidenceBatchV3 } = require('./companion/contracts-v7.cjs')
  const members = ['root-key', 'codex-child:synthetic-side-ref'].map((key, index) => createEvidenceNodeV7({
    provider: 'codex', key, family: 'codex:root-key', role: index ? 'child' : 'root',
    metadata: { kind: index ? 'topology-child' : 'codex-thread', revisionAt: 30 }
  }))
  const configuration = { enabled: true, providers: { codex: true, claude: true }, dynamicTaskWindowHours: 24 }
  const taskPackage = { enabled: true, providers: configuration.providers, complete: true, sourceLaneGenerations: {}, packageRevision: 1 }
  let published
  const applyContext = vm.createContext({ Date,
    codexDesktopBridge: null,
    codexRecord: value => value || {}, companionEvidenceSequenceV7: (...values) => Math.max(0, ...values.map(value => Number(value) || 0)),
    companionTaskKernel: { getPackage: () => taskPackage, isProviderCached: provider => provider === 'codex' },
    companionPersistedTaskState: () => ({}), companionTaskConfiguration: () => configuration,
    companionCodexEvidenceV7: () => ({ nodes: members,
      relations: [], interactions: projected.interactions, interactionSets: projected.interactionSets }),
    createCompanionInteractionEvidenceV7: value => value, createCompanionInteractionSetV7: value => value,
    createCompanionEvidenceBatchV7: createEvidenceBatchV7,
    publishCompanionEvidenceBatchesV3: value => { published = value; return true },
    runtimeDiagnostics: { record() {} }, codexActivitySourceFingerprint: 'synthetic'
  })
  const apply = vm.runInContext(`${selection}\n${retirement}\n${source.slice(applyStart, applyEnd)}; applyCodexActivityToCompanionKernel`, applyContext)
  for (const complete of [true, false]) {
    taskPackage.complete = complete
    published = null
    assert.equal(apply({ generation: 30, entries: [{ key: 'root-key' }] }), true, 'cached Codex evidence publishes independently of other sources')
    assert(validateCompanionEvidenceBatchV3(published.evidenceBatches.codex, 'codex'), 'member evidence passes the Kernel input contract')
    assert.equal(published.evidenceBatches.codex.interactions[0].taskKey, 'codex-child:synthetic-side-ref',
      'unchanged open member input survives activity-only replay')
  }
  const cacheGuard = source.match(/if \((queryThreadId === threadId[\s\S]*?codexApplyCachedCompletedTurnEvidence\(known, threadId\))\) \{/)
  assert(cacheGuard, 'cached parent completion is limited to parent query')
  let cachedRead = false
  assert.equal(vm.runInNewContext(cacheGuard[1], { queryThreadId: 'child', threadId: 'parent', known: {},
    refresh: {}, codexApplyCachedCompletedTurnEvidence: () => { cachedRead = true; return true } }), false)
  assert.equal(cachedRead, false)
  const confirmationStart = source.indexOf('        if (refresh.confirmCompletionEvent && validTerminalTurn')
  const confirmationEnd = source.indexOf('        const resumedTerminalRevision', confirmationStart)
  assert(confirmationStart >= 0 && confirmationEnd > confirmationStart)
  let terminal
  const confirm = vm.runInNewContext(`(function() {${source.slice(confirmationStart, confirmationEnd)}})`, {
    queryThreadId: 'child', threadId: 'parent', refresh: { confirmCompletionEvent: true }, known: { lastTurnStartedAt: 10000 },
    validTerminalTurn: true, turn: { id: 'side-turn', status: 'failed', startedAt: 2000 },
    codexApplySideTerminalNotification: (_bridge, parent, child, turn) => {
      terminal = { parent, child, turn }
      return true
    }, finish() {}
  })
  confirm()
  assert.equal(terminal?.child, 'child', 'a newer parent epoch does not invalidate the current child terminal')
  assert.equal(terminal?.turn.status, 'failed')
  const { createCodexDesktopShadow } = require('./codex/desktop-shadow.cjs')
  let questionSequence = 0
  const questionProjector = createCodexDesktopRequestProjection({ record: value => value || {},
    timestampMs: value => Number(value) || 0, nextLiveEvidenceSequence: () => ++questionSequence })
  const shadow = createCodexDesktopShadow({ record: value => value || {}, timestampMs: value => Number(value) || 0,
    validThreadId: () => false, reduceWaitingEdge: () => ({}), activityStatus: value => ({ status: value.type, activeFlags: value.activeFlags }),
    nextLiveEvidenceSequence: () => ++questionSequence,
    projectedRequest: questionProjector.codexDesktopProjectedRequest, projectedRequests: questionProjector.codexDesktopProjectedRequests })
  for (const status of ['completed', 'interrupted', 'failed']) {
    const current = shadow.codexDesktopShadowFromSnapshot({ revision: 1, conversationState: {
      sideConversation: true, threadRuntimeStatus: { type: 'idle', activeFlags: [] }, requests: [], turns: [],
      turnHistory: { kind: 'canonical', history: {
        islands: [{ entries: [{ value: 'question' }, { value: 'aborted' }] }], entitiesByKey: {
          question: { turnId: 'question-turn', status: 'inProgress', items: [{ type: 'agentMessage', id: 'synthetic-question', questions: [{}] }] },
          aborted: { turnId: 'aborted-turn', status, items: [] }
        }
      } }
    } })
    assert.equal(current.requests.length, 1, 'Side native-visible question outlives a later aborted generation')
    assert.equal(current.liveTurnRunning, false, 'old question must not fabricate a running witness')
  }
  // Run the production private projection; unknown Side epochs must never
  // borrow a newer parent epoch and reject their own later terminal as stale.
  const terminals = new Map()
  const member = { parentThreadId: main, runtime: { type: 'active', activeFlags: [] }, activityEvidence: 'activity-event', activityEventSequence: 20 }
  const ownShadow = { runtime: { type: 'idle', activeFlags: [] } }
  const activity = value => value ? { status: value.suppressUncorroboratedActive ? 'notLoaded' : value.runtime.type, activeFlags: [] } : null
  const { createCodexDesktopActivityResolution } = require('./codex/desktop-activity-resolution.cjs')
  const resolution = createCodexDesktopActivityResolution({ timestampMs: value => Number(value) || 0, validThreadId: () => true,
    isConfirmedTurnEvidence: () => true, waitingEvidenceVisible: () => true, desktopRequestFlag: () => '', desktopIsPlanImplementationRequest: () => false })
  const { createCodexSubagentDiscovery } = require('./codex/subagent-discovery.cjs')
  const discovery = createCodexSubagentDiscovery({ fs: { readdirSync: () => [] }, path: require('node:path'),
    validThreadId: value => [main, side].includes(value) })
  discovery.codexObserveThreadRows([{ id: main, threadSource: 'vscode' }, { id: side, threadSource: 'subagent' }])
  const known = { key: 'synthetic-root', lastTurnStatus: 'completed', lastTurnStartedAt: 500, connectorLastTurnStartedAt: 500, connectorLastTurnStatus: 'completed', connectorStatus: 'idle' }
  const projectionContext = vm.createContext({
    Set, crypto: { createHash }, codexCausalDomain: 'synthetic-source-domain',
    codexSubagentDiscovery: discovery, codexRuntimeDiagnostics: null,
    codexActivityInventory: new Map([[main, known]]), codexThreadTurnStatusCache: new Map(),
    codexSourceIdentityPublishes: new Map(),
    codexDesktopActivityResolution: resolution, codexDesktopRequestCorrelation: projector.codexDesktopRequestCorrelation,
    validCodexThreadId: value => [main, side].includes(value),
    codexDesktopBridge: { shadows: new Map([[main, ownShadow]]), sideShadows: new Map([[side, member]]) },
    honorHostExternalProjection: (_id, _known, value) => value,
    codexDesktopShadowActivity: activity, codexAppServerActiveDominates: () => false, codexAppServerSideActivity: () => null,
    codexAllSideRelations: () => new Map([[side, main]]), codexInventorySideBranchEvidence: new Map(),
    codexInventorySideRelations: new Map(), codexDesktopSideRelations: new Map([[side, main]]),
    codexDesktopUnreadObservation: () => ({ hasUnreadTurn: false, unreadAuthority: 'desktop-live' }),
    codexInventorySnapshotLiveSequence: () => 0, codexhostDiscovery: null,
    codexReadPrivateBranchTerminal: (_parent, id) => terminals.get(id),
    codexForgetPrivateBranchTerminal: (_parent, id) => terminals.delete(id),
    codexPrivateThreadGoalEvidence: () => ({ goalStatus: 'none' }), codexPrivateBranchRef: (_parent, id) => id
  })
  const projectionStart = source.indexOf('function codexPrivateBranchEvidence(')
  const projectionEnd = source.indexOf('\nfunction ', projectionStart + 1)
  assert(projectionStart >= 0 && projectionEnd > projectionStart)
  for (const name of ['codexRetainReferencedThreadIdentities', 'codexPrivateBranchTerminalKey', 'companionCausalKey']) {
    const start = source.indexOf(`function ${name}(`)
    const end = source.indexOf('\nfunction ', start + 1)
    assert(start >= 0 && end > start, `private projection dependency ${name} is available`)
    vm.runInContext(source.slice(start, end), projectionContext)
  }
  vm.runInContext(source.slice(projectionStart, projectionEnd), projectionContext)
  let branches = projectionContext.codexPrivateBranchEvidence(main, known).branches
  assert.equal(branches.find(value => value.branchKind === 'side').turnStartedAt, 0, 'unknown Side epoch cannot borrow the parent epoch')
  terminals.set(side, { lastTurnStatus: 'completed', lastTurnEvidence: 'snapshot-corroborated', turnStartedAt: 100,
    terminalAt: 120, terminalEvidenceSequence: 30, causalDomain: 'synthetic-source-domain' })
  member.suppressUncorroboratedActive = true
  branches = projectionContext.codexPrivateBranchEvidence(main, known).branches
  assert.equal(branches.find(value => value.branchKind === 'main').turnStartedAt, 500, 'Side completion preserves the newer parent epoch')
  assert.equal(branches.find(value => value.branchKind === 'side').turnStartedAt, 100, 'Side completion keeps its own exact epoch')
  terminals.get(side).causalDomain = 'retired-source-domain'
  assert.equal(projectionContext.codexPrivateBranchEvidence(main, known).branches.find(value => value.branchKind === 'side').lastTurnStatus,
    undefined, 'a retired source cannot contribute a Side terminal')
  projectionContext.codexInventorySideBranchEvidence.set(side, { parentThreadId: main, spawnEdgeStatus: 'open' })
  terminals.set(side, { lastTurnStatus: 'interrupted', lastTurnEvidence: 'turn-completed', turnRef: 'machine-turn',
    turnStartedAt: 100, terminalAt: 100, sideInterruptedAt: 200, terminalEvidenceSequence: 30, causalDomain: 'synthetic-source-domain' })
  const machine = projectionContext.codexPrivateBranchEvidence(main, known).branches.find(value => value.branchKind === 'side')
  assert.equal(machine.closedMachineRun, false, 'an exact open spawn edge is retained as its own fact')
  assert.equal(machine.terminalAt, 200, 'an exact machine interruption provides its actual end rather than a start-time fallback')
  assert.equal(machine.machineRunInterruptedAt, 200, 'carry the exact interruption separately from a display timestamp')
  terminals.get(side).sideInterruptedAt = 100
  assert.equal(projectionContext.codexPrivateBranchEvidence(main, known).branches.find(value => value.branchKind === 'side').machineRunInterruptedAt,
    100, 'a native interruption in the same time bucket as its start remains exact')
  delete terminals.get(side).sideInterruptedAt
  assert.equal(projectionContext.codexPrivateBranchEvidence(main, known).branches.find(value => value.branchKind === 'side').machineRunInterruptedAt,
    undefined, 'a fallback to the start does not prove when a machine run ended')
  projectionContext.codexInventorySideBranchEvidence.delete(side)
  // Exercise the actual cold-idle scheduling method without an IPC payload,
  // messages, process launch or any inferred completion from runtime idle.
  terminals.clear()
  member.runtime.type = 'idle'
  member.sideConversation = true
  member.activityEvidence = 'initial-snapshot'
  member.activityRevision = 1
  delete member.suppressUncorroboratedActive
  projectionContext.codexActivityInventory = new Map([[main, known]])
  projectionContext.codexCompleteInventoryThreadIds = new Set([main])
  projectionContext.codexTimestampMs = value => Number(value) || 0
  const queries = []
  const schedulingBridge = { parentLiveEvidenceSequence: () => 0,
    scheduleLatestTurnRefresh: (threadId, options) => queries.push({ threadId, options }) }
  const methodStart = source.indexOf('  verifyUncorroboratedActiveSnapshot(')
  const methodEnd = source.indexOf('\n  retireMissingDesktopSide(', methodStart)
  assert(methodStart >= 0 && methodEnd > methodStart)
  vm.runInContext(source.slice(methodStart, methodEnd).replace('  verifyUncorroboratedActiveSnapshot(', 'function verifyUncorroboratedActiveSnapshot('), projectionContext)
  projectionContext.verifyUncorroboratedActiveSnapshot.call(schedulingBridge, side, member)
  assert.equal(queries.length, 1, 'cold idle Side requires its own bounded Turn verification')
  assert.equal(queries[0].threadId, main)
  assert.equal(queries[0].options.queryThreadId, side)
  assert.equal(queries[0].options.forceQuery, true)
  assert.equal(queries[0].options.settleSnapshotTerminal, true)
  assert.equal(resolution.codexSnapshotTerminalReady({ startedAt: 100 }, 0, '', false, true), true, 'exact inactive member terminal can settle at first successful read')
  assert.equal(resolution.codexSnapshotTerminalReady({ startedAt: 100 }, 200, 'inProgress', true, true), false, 'idle cannot authorize an older member epoch')
  return 45
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Companion native unread passed: ${checkCompanionNativeUnread(resolve(import.meta.dirname, '../preload'))} checkpoints`)
}
