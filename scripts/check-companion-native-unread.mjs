import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

export function checkCompanionNativeUnread(assetRoot) {
  const require = createRequire(resolve(assetRoot, 'index.js'))
  const { parseCodexDesktopUnreadState: parse, codexReadStateContextBinding: bind } = require('./codex/desktop-unread-evidence.cjs')
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
  const file = resolve(assetRoot, assetRoot.endsWith('preload') ? 'index.js' : 'preload.js')
  const source = readFileSync(file, 'utf8')
  const start = source.indexOf('const CODEX_DESKTOP_IPC_VERSIONS =')
  const end = source.indexOf('const WINDOW_BRIDGE_TIMEOUT_MS', start)
  assert(start >= 0 && end > start)
  const context = vm.createContext({})
  vm.runInContext(source.slice(start, end), context)
  for (const version of [1, 2, 3]) assert(context.codexDesktopIpcVersionAccepted('thread-read-state-changed', version), `native unread protocol v${version}`)
  assert(!context.codexDesktopIpcVersionAccepted('thread-read-state-changed', 4), 'unknown unread protocol abstains')
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
  let published
  const applyContext = vm.createContext({ Date,
    codexRecord: value => value || {}, companionEvidenceSequenceV7: (...values) => Math.max(0, ...values.map(value => Number(value) || 0)),
    companionTaskKernel: { getPackage: () => ({ complete: true, providers: { codex: true }, sourceLaneGenerations: {}, packageRevision: 1 }) },
    companionPersistedTaskState: () => ({}), companionTaskConfiguration: () => ({ dynamicTaskWindowHours: 24 }),
    companionCodexEvidenceV7: () => ({ nodes: [{ key: 'root-key' }, { key: 'codex-child:synthetic-side-ref' }],
      relations: [], interactions: projected.interactions, interactionSets: projected.interactionSets }),
    createCompanionInteractionEvidenceV7: value => value, createCompanionInteractionSetV7: value => value,
    createCompanionEvidenceBatchV7: value => value,
    publishCompanionEvidenceBatchesV3: value => { published = value; return true },
    runtimeDiagnostics: { record() {} }, codexActivitySourceFingerprint: 'synthetic'
  })
  const apply = vm.runInContext(`${source.slice(applyStart, applyEnd)}; applyCodexActivityToCompanionKernel`, applyContext)
  apply({ generation: 30, entries: [{ key: 'root-key' }] })
  assert.equal(published.evidenceBatches.codex.interactions[0].taskKey, 'codex-child:synthetic-side-ref',
    'unchanged open member input survives activity-only replay')
  const cacheGuard = source.match(/if \((queryThreadId === threadId[\s\S]*?codexApplyCachedCompletedTurnEvidence\(known, threadId\))\) \{/)
  assert(cacheGuard, 'cached parent completion is limited to parent query')
  let cachedRead = false
  assert.equal(vm.runInNewContext(cacheGuard[1], { queryThreadId: 'child', threadId: 'parent', known: {},
    refresh: {}, codexApplyCachedCompletedTurnEvidence: () => { cachedRead = true; return true } }), false)
  assert.equal(cachedRead, false)
  const confirmationStart = source.indexOf('        const branchShadow = queryThreadId !== threadId ? this.sideShadows.get(queryThreadId) : null')
  const confirmationEnd = source.indexOf('        const resumedTerminalRevision', confirmationStart)
  assert(confirmationStart >= 0 && confirmationEnd > confirmationStart)
  let terminal
  let emitted = false
  const confirm = vm.runInNewContext(`(function() {${source.slice(confirmationStart, confirmationEnd)}})`, {
    queryThreadId: 'child', threadId: 'parent', refresh: { confirmCompletionEvent: true }, known: { lastTurnStartedAt: 10000 },
    turn: { status: 'completed', startedAt: 2000 }, codexInventorySideBranchEvidence: new Map(),
    codexNextLiveEvidenceSequence: () => 40, codexPrivateBranchIdleConfirmed: () => true,
    codexRememberPrivateBranchTerminal: (parent, child, turn) => { terminal = { parent, child, turn } }, finish() {}
  })
  confirm.call({ sideShadows: new Map([['child', { parentThreadId: 'parent', currentCanonicalTurn: { startedAt: 2000 } }]]),
    emitParentActivity: () => { emitted = true } })
  assert.equal(terminal?.child, 'child', 'a newer parent epoch does not invalidate current child completion')
  assert(emitted)
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
  const projectionContext = vm.createContext({
    codexDesktopActivityResolution: resolution, codexDesktopRequestCorrelation: projector.codexDesktopRequestCorrelation,
    validCodexThreadId: value => [main, side].includes(value),
    codexDesktopBridge: { shadows: new Map([[main, ownShadow]]), sideShadows: new Map([[side, member]]) },
    honorHostExternalProjection: (_id, _known, value) => value,
    codexDesktopShadowActivity: activity, codexAppServerActiveDominates: () => false,
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
  vm.runInContext(source.slice(projectionStart, projectionEnd), projectionContext)
  const known = { key: 'synthetic-root', lastTurnStatus: 'completed', lastTurnStartedAt: 500, connectorLastTurnStartedAt: 500, connectorLastTurnStatus: 'completed', connectorStatus: 'idle' }
  let branches = projectionContext.codexPrivateBranchEvidence(main, known).branches
  assert.equal(branches.find(value => value.branchKind === 'side').turnStartedAt, 0, 'unknown Side epoch cannot borrow the parent epoch')
  terminals.set(side, { lastTurnStatus: 'completed', lastTurnEvidence: 'snapshot-corroborated', turnStartedAt: 100, terminalAt: 120, terminalEvidenceSequence: 30 })
  member.suppressUncorroboratedActive = true
  branches = projectionContext.codexPrivateBranchEvidence(main, known).branches
  assert.equal(branches.find(value => value.branchKind === 'main').turnStartedAt, 500, 'Side completion preserves the newer parent epoch')
  assert.equal(branches.find(value => value.branchKind === 'side').turnStartedAt, 100, 'Side completion keeps its own exact epoch')
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
  return 23
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Companion native unread passed: ${checkCompanionNativeUnread(resolve(import.meta.dirname, '../preload'))} checkpoints`)
}
