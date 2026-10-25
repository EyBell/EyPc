import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createCodexDesktopShadow } = require('../../preload/codex/desktop-shadow.cjs')
const { createCodexDesktopActivityResolution } = require('../../preload/codex/desktop-activity-resolution.cjs')
const { createCodexDesktopRequestProjection } = require('../../preload/codex/desktop-request-projection.cjs')

function harness(shadowFactory = createCodexDesktopShadow) {
  let sequence = 0
  const deps = {
    record: (value: any) => value && typeof value === 'object' ? value : {},
    timestampMs: (value: any) => typeof value === 'number' ? value : 0,
    nextLiveEvidenceSequence: () => ++sequence
  }
  const projection = createCodexDesktopRequestProjection(deps)
  const shadow = shadowFactory({ ...deps,
    validThreadId: () => false, reduceWaitingEdge: () => ({}),
    activityStatus: (value: any) => value ? { status: value.type, activeFlags: value.activeFlags } : null,
    projectedRequest: projection.codexDesktopProjectedRequest,
    projectedRequests: projection.codexDesktopProjectedRequests
  })
  const question = { type: 'agentMessage', id: 'secret-id', questions: [{ title: 'secret prompt' }] }
  const reply = { type: 'steeringUserMessage', status: 'accepted', input: [{ type: 'text', text:
    '<send_user_message_question_reply>' + JSON.stringify({ questionItemId: JSON.stringify(['request_user_input_async', 'secret-id', 0]), question: 'secret prompt', answer: 'secret answer' }) + '</send_user_message_question_reply>' }] }
  const snapshot = (items: any[], previous?: any, status = 'inProgress', turnId: any = 'turn') => shadow.codexDesktopShadowFromSnapshot({ revision: 1, conversationState: {
    threadRuntimeStatus: { type: 'active', activeFlags: [] }, requests: [], turns: [{ turnId, status, items }]
  } }, previous)
  return { shadow, projection, question, reply, snapshot }
}

describe('Desktop root Goal source evidence', () => {
  function goalSnapshot(shadow: any, goal: any, previous?: any) {
    const state = shadow.codexDesktopShadowFromSnapshot({ revision: 1, conversationState: {
      threadRuntimeStatus: { type: 'active', activeFlags: [] }, requests: [], turns: [], threadGoal: goal
    } }, previous)
    state.ownerClientId = 'fixture-owner'
    return state
  }

  it.each(['active', 'paused', 'blocked', 'usageLimited', 'budgetLimited', 'complete'])('admits the finite owner Goal %s after an older no-Goal cache', (status) => {
    const { shadow } = harness()
    const state = goalSnapshot(shadow, { status, updatedAt: 100, objective: 'private objective' })
    const evidence = shadow.codexDesktopRootGoalEvidence(state, { goalStatus: 'none', goalUpdatedAt: 0 })
    expect(evidence).toMatchObject({ goalStatus: status, goalUpdatedAt: 100, goalFreshness: 'fresh' })
    expect(JSON.stringify(state)).not.toContain('private objective')
    const repeated = goalSnapshot(shadow, { status, updatedAt: 100 }, state)
    expect(shadow.codexDesktopRootGoalEvidence(repeated, null)).toEqual(evidence)
  })

  it('does not replace a newer Goal clock or a newer same-clock connector observation', () => {
    const { shadow } = harness()
    const state = goalSnapshot(shadow, { status: 'active', updatedAt: 100 })
    const evidence = shadow.codexDesktopRootGoalEvidence(state, null)
    expect(shadow.codexDesktopRootGoalEvidence(state, { goalStatus: 'paused', goalUpdatedAt: 200, goalEvidenceSequence: 1 })).toBeNull()
    expect(shadow.codexDesktopRootGoalEvidence(state, { goalStatus: 'complete', goalUpdatedAt: 100,
      goalEvidenceSequence: evidence.goalEvidenceSequence + 1 })).toBeNull()
    expect(shadow.codexApplyDesktopShadowPatch(state, { op: 'replace', path: ['threadGoal'], value: { status: 'complete', updatedAt: 300 } })).toBe(true)
    expect(shadow.codexDesktopRootGoalEvidence(state, evidence)).toMatchObject({ goalStatus: 'complete', goalUpdatedAt: 300 })
  })

  it('abstains on invalid, missing, disconnected and Side Goal sources', () => {
    const { shadow } = harness()
    for (const goal of [null, undefined, {}, { status: 'active' }, { status: 'future', updatedAt: 100 }]) {
      expect(shadow.codexDesktopRootGoalEvidence(goalSnapshot(shadow, goal), null)).toBeNull()
    }
    const state = goalSnapshot(shadow, { status: 'active', updatedAt: 100 })
    delete state.ownerClientId
    expect(shadow.codexDesktopRootGoalEvidence(state, null)).toBeNull()
    state.ownerClientId = 'fixture-owner'
    state.ownerDisconnectedAt = 1
    expect(shadow.codexDesktopRootGoalEvidence(state, null)).toBeNull()
    delete state.ownerDisconnectedAt
    state.sideConversation = true
    expect(shadow.codexDesktopRootGoalEvidence(state, null)).toBeNull()
  })
})

describe('Desktop finite thread source evidence', () => {
  function sourceSnapshot(shadow: any, threadSource?: unknown, previous?: any) {
    return shadow.codexDesktopShadowFromSnapshot({ revision: 1, conversationState: {
      sideConversation: true, threadSource,
      threadRuntimeStatus: { type: 'idle', activeFlags: [] }, requests: [], turns: []
    } }, previous)
  }

  it('classifies snapshots without retaining raw source data or a previous owner classification', () => {
    const { shadow } = harness()
    const review = sourceSnapshot(shadow, 'guardian_review')
    review.ownerClientId = 'previous-owner'
    expect(review.threadSourceKind).toBe('guardian_review')
    expect(sourceSnapshot(shadow, 'vscode', review).threadSourceKind).toBe('other')
    expect(sourceSnapshot(shadow, undefined, review).threadSourceKind).toBe('unknown')
    expect(sourceSnapshot(shadow, {}, review).threadSourceKind).toBe('unknown')
    const ordinary = sourceSnapshot(shadow, { subAgent: { other: 'private-fixture-source' } }, review)
    expect(ordinary.threadSourceKind).toBe('other')
    expect(ordinary).not.toHaveProperty('threadSource')
    expect(JSON.stringify(ordinary)).not.toContain('private-fixture-source')
  })

  it('accepts late exact source patches and clears the shadow classification on replacement or removal', () => {
    const { shadow } = harness()
    const state = sourceSnapshot(shadow)
    expect(shadow.codexApplyDesktopShadowPatch(state, { op: 'add', path: ['threadSource'], value: 'guardian_review' })).toBe(true)
    expect(state.threadSourceKind).toBe('guardian_review')
    expect(shadow.codexApplyDesktopShadowPatch(state, { op: 'replace', path: ['threadSource'], value: 'subagent' })).toBe(true)
    expect(state.threadSourceKind).toBe('other')
    expect(shadow.codexApplyDesktopShadowPatch(state, { op: 'replace', path: ['threadSource'], value: 'guardian_review' })).toBe(true)
    expect(shadow.codexApplyDesktopShadowPatch(state, { op: 'remove', path: ['threadSource'] })).toBe(true)
    expect(state.threadSourceKind).toBe('unknown')
    expect(shadow.codexApplyDesktopShadowPatch(state, { op: 'replace', path: ['threadSource'], value: { subAgent: {} } })).toBe(true)
    expect(state.threadSourceKind).toBe('unknown')
    expect(shadow.codexApplyDesktopShadowPatch(state, { op: 'replace', path: ['threadSource', 'subAgent'], value: {} })).toBe(false)
    expect(state.threadSourceKind).toBe('unknown')
  })

  it('keeps the shadow usable with an unknown source when the classifier module is unavailable', () => {
    const filename = require.resolve('../../preload/codex/desktop-shadow.cjs')
    const moduleRequire = createRequire(filename)
    const context = { module: { exports: {} as any }, require: (name: string) => {
      if (name === './subagent-discovery.cjs') throw new Error('classifier-unavailable')
      return moduleRequire(name)
    } }
    require('node:vm').runInNewContext(require('node:fs').readFileSync(filename, 'utf8'), context)
    const { shadow } = harness(context.module.exports.createCodexDesktopShadow)
    expect(sourceSnapshot(shadow, 'guardian_review').threadSourceKind).toBe('unknown')
  })
})

describe('Desktop terminal source precedence', () => {
  const resolution = createCodexDesktopActivityResolution({
    timestampMs: (value: any) => typeof value === 'number' ? value : 0,
    validThreadId: () => true, isConfirmedTurnEvidence: () => true,
    waitingEvidenceVisible: () => true, desktopRequestFlag: () => '', desktopIsPlanImplementationRequest: () => false
  })
  const owner = { ownerClientId: 'owner', revision: 2, canonicalLatestComplete: true,
    currentCanonicalTurn: { turnRef: 'current-ref', startedAt: 100_526, status: 'inProgress' } }

  it.each(['completed', 'interrupted', 'failed'])('rejects a lower-fidelity %s result that conflicts with the same running owner Turn', (status) => {
    expect(resolution.codexDesktopTerminalConflictsWithOwner({ status, startedAt: 100_000 }, owner, 'current-ref')).toBe(true)
  })

  it('keeps source status and epoch paired, and never borrows a main epoch for a Side', () => {
    const known = { connectorLastTurnStatus: 'interrupted', connectorLastTurnStartedAt: 90_000, lastTurnStartedAt: 999_000 }
    expect(resolution.codexDesktopBranchInventoryTurn(owner, null, known, true, 'old-ref')).toEqual({})
    expect(resolution.codexDesktopBranchInventoryTurn(null, null, known, true)).toMatchObject({ lastTurnStatus: 'interrupted', turnStartedAt: 90_000 })
    expect(resolution.codexDesktopBranchInventoryTurn(null, { lastTurnStatus: 'completed', turnStartedAt: 80_000 }, known, false))
      .toMatchObject({ lastTurnStatus: 'completed', turnStartedAt: 80_000 })
  })

  it('allows matching owner terminals and a strictly newer independent Turn without mixing ids or clock precision', () => {
    const complete = { ...owner, currentCanonicalTurn: { ...owner.currentCanonicalTurn, status: 'completed' } }
    expect(resolution.codexDesktopTerminalConflictsWithOwner({ status: 'completed', startedAt: 100_000 }, complete, 'current-ref')).toBe(false)
    expect(resolution.codexDesktopTerminalConflictsWithOwner({ status: 'interrupted', startedAt: 110_000 }, owner, 'new-ref')).toBe(false)
    expect(resolution.codexDesktopTerminalConflictsWithOwner({ status: 'completed', startedAt: 100_526 }, complete, 'different-ref')).toBe(true)
    expect(resolution.codexDesktopTerminalConflictsWithOwner({ status: 'interrupted', startedAt: 90_000 }, { ...owner, ownerDisconnectedAt: 1 }, 'old-ref')).toBe(false)
  })

  it('uses the current own Turn epoch for live evidence instead of an old connector terminal epoch', () => {
    expect(resolution.codexDesktopBranchTurnFields({ shadow: owner }, {
      connectorLastTurnStatus: 'interrupted', connectorLastTurnStartedAt: 90_000
    }, { main: true, live: true, activeSequence: 3 })).toMatchObject({
      lastTurnStatus: 'inProgress', lastTurnEvidence: 'turn-started', turnStartedAt: 100_526, activeEvidenceSequence: 3
    })
  })

  it('keeps inventory identity when rejecting an independent terminal, without minting a replacement outcome', () => {
    const turn = { id: 'current', status: 'interrupted', startedAt: 100_000 }
    expect(resolution.codexDesktopInventoryTurnCandidate(turn, owner, null, 'current-ref')).toEqual({})
    expect(resolution.codexDesktopInventoryTurnCandidate(turn, owner, {
      lastTurnStatus: 'inProgress', lastTurnStartedAt: 100_526, lastTurnEvidence: 'turn-started'
    }, 'current-ref')).toMatchObject({ status: 'inProgress', startedAt: 100_526, evidence: 'turn-started' })
  })

  it('preserves a real turn-completed event when an inventory rejection races its Desktop projection', () => {
    expect(resolution.codexDesktopInventoryTurnCandidate({ status: 'interrupted', startedAt: 100_000 }, owner, {
      lastTurnId: 'current', lastTurnStatus: 'failed', lastTurnStartedAt: 100_526, lastTurnEvidence: 'turn-completed'
    }, 'current-ref')).toMatchObject({ status: 'failed', startedAt: 100_526, evidence: 'turn-completed' })
  })

  it.each(['targeted-after-exit', 'turn-completed'])('checks an already recorded %s terminal with its proper authority', (evidence) => {
    const terminal = { lastTurnStatus: 'interrupted', turnStartedAt: 100_526, lastTurnEvidence: evidence, terminalEvidenceSequence: 8 }
    const fields = resolution.codexDesktopBranchTurnFields({ shadow: owner }, {}, { terminal, main: true, idleConfirmed: true })
    if (evidence === 'targeted-after-exit') expect(fields.lastTurnStatus).toBeUndefined()
    else expect(fields).toMatchObject({ lastTurnStatus: 'interrupted', lastTurnEvidence: 'turn-completed' })
    const live = resolution.codexDesktopBranchTurnFields({ shadow: owner }, {}, {
      terminal, main: true, live: true, terminalStrictlyNewer: true, activeSequence: 7
    })
    expect(live.lastTurnStatus).toBe(evidence === 'targeted-after-exit' ? 'inProgress' : 'interrupted')
  })
})

describe('GPT async question evidence', () => {
  it('keeps anonymous identity and first-observation sequence stable across snapshots', () => {
    const { question, snapshot } = harness()
    const first = snapshot([question])
    const next = snapshot([question], first)
    expect(next.requests[0]).toMatchObject({ identityExact: true, asyncQuestion: true, observedSequence: first.requests[0].observedSequence, interactionRef: first.requests[0].interactionRef })
    expect(JSON.stringify(next)).not.toContain('secret')
  })

  it.each(['pending', 'rejected', undefined])('does not consume a %s steering reply', (status) => {
    const { question, reply, snapshot } = harness()
    expect(snapshot([question, { ...reply, status }]).requests).toHaveLength(1)
    expect(snapshot([question, reply]).requests).toHaveLength(0)
  })

  it.each(['turns', 'canonical'])('closes only older questions after an accepted normal insertion in %s', (mode) => {
    const { question, snapshot, shadow } = harness()
    const insertion = { type: 'steeringUserMessage', status: 'pending', input: [{ type: 'text', text: 'secret continuation' }] }
    const newer = { ...question, id: 'new-secret-id' }
    let state = snapshot([question, insertion, newer])
    let prefix: any[] = ['turns', 0]
    if (mode === 'canonical') {
      state = shadow.codexDesktopShadowFromSnapshot({ revision: 1, conversationState: {
        threadRuntimeStatus: { type: 'idle' }, requests: [], turns: [], turnHistory: { kind: 'canonical', history: {
          islands: [{ entries: [{ value: 'entity' }] }], entitiesByKey: {
            entity: { turnId: 'turn', status: 'completed', items: [question, insertion, newer] }
          }
        } }
      } })
      prefix = ['turnHistory', 'history', 'entitiesByKey', 'entity']
    }
    expect(state.requests).toHaveLength(2)
    const newerRef = state.requests[1].interactionRef
    expect(shadow.codexApplyDesktopShadowPatch(state, { op: 'replace', path: [...prefix, 'items', 1, 'status'], value: 'rejected' })).toBe(true)
    expect(state.requests).toHaveLength(2)
    expect(shadow.codexApplyDesktopShadowPatch(state, { op: 'replace', path: [...prefix, 'items', 1, 'status'], value: 'accepted' })).toBe(true)
    expect(state.requests).toHaveLength(1)
    expect(state.requests[0].interactionRef).toBe(newerRef)
    expect(JSON.stringify(state)).not.toContain('secret')
    expect(snapshot([question, { ...insertion, status: 'accepted' }], undefined, 'completed').requests).toHaveLength(0)
  })

  it('keeps other questions on exact partial replies, empty input and malformed reply envelopes', () => {
    const { question, reply, snapshot } = harness()
    const questions = { ...question, questions: [{}, {}] }
    expect(snapshot([questions, reply]).requests).toHaveLength(1)
    for (const text of ['', '  ', '<send_user_message_question_reply>invalid</send_user_message_question_reply>']) {
      expect(snapshot([questions, { type: 'steeringUserMessage', status: 'accepted', input: [{ type: 'text', text }] }]).requests).toHaveLength(2)
    }
  })

  it('ignores cancelled and unidentified turns', () => {
    const { question, snapshot } = harness()
    expect(snapshot([question], undefined, 'completed').requests).toHaveLength(1)
    expect(snapshot([question], undefined, 'interrupted').requests).toHaveLength(0)
    expect(snapshot([question], undefined, 'failed').requests).toHaveLength(0)
    expect(snapshot([question], undefined, 'inProgress', null).requests).toHaveLength(0)
  })

  it('retains a canonical unanswered question when the matching live turn completes', () => {
    const { question, shadow } = harness()
    const state = shadow.codexDesktopShadowFromSnapshot({ revision: 1, conversationState: {
      threadRuntimeStatus: { type: 'active', activeFlags: [] }, requests: [], turns: [],
      turnHistory: { kind: 'canonical', history: {
        islands: [{ entries: [{ value: 'entity' }] }],
        entitiesByKey: { entity: { turnId: 'turn', status: 'inProgress', items: [question] } }
      } }
    } })
    expect(state.requests).toHaveLength(1)
    expect(JSON.stringify(state)).not.toContain('secret')
    expect(shadow.codexApplyDesktopShadowPatch(state, { op: 'add', path: ['turns', 0], value: { turnId: 'turn', status: 'completed', items: [] } })).toBe(true)
    expect(state.requests).toHaveLength(1)
    expect(shadow.codexApplyDesktopShadowPatch(state, { op: 'replace', path: ['turnHistory', 'history', 'entitiesByKey', 'entity', 'status'], value: 'completed' })).toBe(true)
  })

  it('does not carry an older question into a newer active turn', () => {
    const { question, snapshot, shadow } = harness()
    const state = snapshot([question])
    expect(shadow.codexApplyDesktopShadowPatch(state, { op: 'add', path: ['turns', 1], value: { turnId: 'new-turn', status: 'inProgress', items: [] } })).toBe(true)
    expect(state.requests).toHaveLength(0)
  })

  it('keeps native request indexes independent of synthetic questions', () => {
    const { question, snapshot, shadow } = harness()
    const state = snapshot([question])
    const original = state.requests[0]
    expect(shadow.codexApplyDesktopShadowPatch(state, { op: 'add', path: ['requests', 0], value: { id: 'approval', method: 'item/fileChange/requestApproval' } })).toBe(true)
    expect(state.requests).toHaveLength(2)
    expect(shadow.codexApplyDesktopShadowPatch(state, { op: 'remove', path: ['requests', 0] })).toBe(true)
    expect(state.requests).toEqual([original])
    expect(shadow.codexApplyDesktopShadowPatch(state, { op: 'replace', path: ['turns', 0, 'items', 0, 'questions'], value: [] })).toBe(true)
    expect(state.requests).toHaveLength(0)
  })

  it.each(['turns', 'canonical'])('applies %s question and accepted-reply patches without recovery', (mode) => {
    const { question, reply, snapshot, shadow } = harness()
    const state = snapshot([{ ...question, questions: [] }])
    let prefix: any[] = ['turns', 0]
    if (mode === 'canonical') {
      shadow.codexApplyDesktopShadowPatch(state, { op: 'replace', path: ['turns'], value: [] })
      expect(shadow.codexApplyDesktopShadowPatch(state, { op: 'replace', path: ['turnHistory'], value: {
        kind: 'canonical', history: { islands: [{ entries: [{ value: 'secret-entity' }] }], entitiesByKey: {
          'secret-entity': { turnId: 'turn', status: 'inProgress', items: [{ ...question, questions: [] }] }
        } }
      } })).toBe(true)
      prefix = ['turnHistory', 'history', 'entitiesByKey', 'secret-entity']
    }
    const patch = (path: any[], value: any, op = 'replace') => shadow.codexApplyDesktopShadowPatch(state, { op, path: [...prefix, ...path], value })
    expect(patch(['items', 0, 'questions'], question.questions)).toBe(true)
    expect(state.requests).toHaveLength(1)
    const sequence = state.requests[0].observedSequence
    expect(patch(['items', 0, 'questions', 0, 'title'], 'secret wording')).toBe(true)
    expect(state.requests[0].observedSequence).toBe(sequence)
    expect(state.asyncRequestSetChanged).toBe(false)
    expect(patch(['items', 1], { ...reply, status: 'pending' }, 'add')).toBe(true)
    expect(state.requests).toHaveLength(1)
    expect(patch(['items', 1, 'status'], 'accepted')).toBe(true)
    expect(state.requests).toHaveLength(0)
    expect(JSON.stringify(state)).not.toContain('secret')
  })

  it('ignores progress metadata but still rejects malformed observed paths', () => {
    const { question, snapshot, shadow } = harness()
    const state = snapshot([question, { id: 'tool', type: 'commandExecution', status: 'inProgress' }])
    for (let index = 0; index < 50; index += 1) {
      expect(shadow.codexApplyDesktopShadowPatch(state, { op: 'replace', path: ['turns', 0, 'items', 1, 'status'], value: 'completed' })).toBe(true)
      expect(state.asyncRequestSetChanged).toBe(false)
    }
    expect(state.requests).toHaveLength(1)
    expect(shadow.codexApplyDesktopShadowPatch(state, { op: 'replace', path: ['turns', 0, 'items', 99], value: question })).toBe(false)
    expect(shadow.codexApplyDesktopShadowPatch(state, { op: 'replace', path: ['turns', 0, 'items', 0, 'questions'], value: 'invalid' })).toBe(false)
  })

  it('does not resurrect an older unanswered turn after the newest turn completed', () => {
    const { question, shadow } = harness()
    const state = shadow.codexDesktopShadowFromSnapshot({ revision: 1, conversationState: {
      threadRuntimeStatus: { type: 'idle', activeFlags: [] }, requests: [], turns: [],
      turnHistory: { kind: 'canonical', history: {
        islands: [{ entries: [{ value: 'old' }, { value: 'new' }] }],
        entitiesByKey: {
          old: { turnId: 'old', status: 'inProgress', items: [question] },
          new: { turnId: 'new', status: 'completed', items: [] }
        }
      } }
    } })
    expect(state.requests).toHaveLength(0)
  })

  it.each(['completed', 'interrupted', 'failed'])('keeps native Side input separate from a later %s generation', (status) => {
    const { question, shadow } = harness()
    const build = (items: any[] = []) => shadow.codexDesktopShadowFromSnapshot({ revision: 1, conversationState: {
      sideConversation: true, threadRuntimeStatus: { type: 'idle', activeFlags: [] }, requests: [], turns: [],
      turnHistory: { kind: 'canonical', history: {
        islands: [{ entries: [{ value: 'question' }, { value: 'aborted' }] }], entitiesByKey: {
          question: { turnId: 'question', status: 'inProgress', items: [question] },
          aborted: { turnId: 'aborted', status, items }
        }
      } }
    } })
    const current = build()
    expect(current.requests).toHaveLength(1)
    expect(current.liveTurnRunning).toBe(false)
    const continuation = build([{ type: 'steeringUserMessage', status: 'accepted', input: [{ type: 'text', text: 'synthetic accepted continuation' }] }])
    expect(continuation.requests).toHaveLength(0)
  })

  it('does not retain answered async questions under the completed Plan exception', () => {
    const { question, snapshot, projection } = harness()
    const previous = snapshot([question])
    const current = snapshot([], previous)
    expect(projection.codexDesktopRetainCausallyOpenRequests(current, previous, true)).toBe(false)
    expect(current.requests).toEqual([])
  })
})


describe('GPT live Turn activity', () => {
  const activity = createCodexDesktopActivityResolution({
    timestampMs: (value: any) => typeof value === 'number' ? value : 0,
    validThreadId: () => false, isConfirmedTurnEvidence: () => false,
    waitingEvidenceVisible: () => true,
    desktopRequestFlag: () => '', desktopIsPlanImplementationRequest: () => false
  }).codexDesktopShadowActivity

  it('uses a current live Turn snapshot despite idle runtime and still honors targeted suppression', () => {
    const { shadow } = harness()
    const current = shadow.codexDesktopShadowFromSnapshot({ revision: 1, conversationState: {
      threadRuntimeStatus: { type: 'idle', activeFlags: [] }, requests: [],
      turns: [{ turnId: 'current', status: 'inProgress', items: [] }]
    } })
    expect(activity(current).status).toBe('active')
    current.suppressUncorroboratedActive = true
    expect(activity(current).status).toBe('notLoaded')
    delete current.suppressUncorroboratedActive
    expect(shadow.codexApplyDesktopShadowPatch(current, { op: 'replace', path: ['turns', 0, 'status'], value: 'completed' })).toBe(true)
    expect(activity(current).status).toBe('idle')
  })

  it('does not revive an old inProgress turn from history or an older live overlay', () => {
    const { shadow } = harness()
    const current = shadow.codexDesktopShadowFromSnapshot({ revision: 1, conversationState: {
      threadRuntimeStatus: { type: 'idle', activeFlags: [] }, requests: [],
      turns: [{ turnId: 'old', status: 'inProgress', items: [] }, { turnId: 'new', status: 'completed', items: [] }],
      turnHistory: { kind: 'canonical', history: {
        islands: [{ entries: [{ value: 'old' }] }],
        entitiesByKey: { old: { turnId: 'old', status: 'inProgress', items: [] } }
      } }
    } })
    expect(activity(current).status).toBe('idle')
    expect(current.liveTurnRunning).toBe(false)
  })
})


describe('canonical activity causal boundary', () => {
  const resolver = createCodexDesktopActivityResolution({
    timestampMs: (value: any) => typeof value === 'number' ? value : 0,
    validThreadId: () => false, isConfirmedTurnEvidence: () => false,
    waitingEvidenceVisible: () => true,
    desktopRequestFlag: () => '', desktopIsPlanImplementationRequest: () => false
  })
  it('does not reopen the same or older completed turn through progress or question closure', () => {
    const known = { lastTurnStatus: 'completed', lastTurnStartedAt: 100 }
    const shadow = { currentCanonicalTurn: { turnRef: 'same', status: 'inProgress', startedAt: 100 },
      runtime: { type: 'active' }, suppressUncorroboratedActive: true }
    const activity = { status: 'active', activeFlags: [] }
    expect(resolver.codexDesktopCanonicalRunningWitness(shadow, known, true, 'same')).toBe(false)
    expect(resolver.codexDesktopHasResolvedCanonicalRun(shadow, 20, activity, known, 'same')).toBe(false)
    shadow.currentCanonicalTurn = { turnRef: 'new', status: 'inProgress', startedAt: 101 }
    expect(resolver.codexDesktopCanonicalRunningWitness(shadow, known, true, 'same')).toBe(true)
    expect(resolver.codexDesktopHasResolvedCanonicalRun(shadow, 20, activity, known, 'same')).toBe(true)
    expect(resolver.codexDesktopCanonicalRunningWitness(shadow, known, false, 'same')).toBe(false)
  })
})

describe('native ephemeral Side evidence', () => {
  const resolver = createCodexDesktopActivityResolution({
    timestampMs: (value: any) => typeof value === 'number' && Number.isFinite(value) ? value : 0,
    validThreadId: (value: any) => typeof value === 'string' && value.length > 0,
    isConfirmedTurnEvidence: () => true, waitingEvidenceVisible: () => true,
    desktopRequestFlag: (request: any) => request.flag || '', desktopIsPlanImplementationRequest: () => false
  })
  const decision = resolver.codexDesktopSideTerminalDecision
  const terminalShadow = (extra: any = {}) => ({
    sideConversation: true, ephemeral: true, ownerClientId: 'owner', revision: 3,
    runtime: { type: 'idle', activeFlags: [] }, canonicalLatestComplete: true,
    currentCanonicalTurn: { turnRef: 'turn-ref', status: 'completed', startedAt: 100 },
    requests: [], asyncTurns: [], nativeTurnSubmissions: [], ...extra
  })

  function ownerSnapshot(extra: any = {}, previous?: any) {
    const { shadow } = harness()
    const build = (fields: any = {}, prior: any = previous) => Object.assign(shadow.codexDesktopShadowFromSnapshot({
      revision: 3, conversationState: {
        sideConversation: true, ephemeral: true, threadRuntimeStatus: { type: 'idle', activeFlags: [] },
        requests: [], turns: [], turnHistory: { kind: 'canonical', history: {
          islands: [{ entries: [{ value: 'secret-entity' }], newerBoundary: { status: 'exhausted' } }],
          entitiesByKey: { 'secret-entity': { turnId: 'secret-turn', status: 'completed', turnStartedAtMs: 100, items: [] } }
        } }, ...extra, ...fields
      }
    }, prior), { ownerClientId: 'owner' })
    return { shadow, build, current: build() }
  }

  it('projects explicit capability and latest boundary without retaining native identifiers or Goal text', () => {
    const { shadow, current } = ownerSnapshot({ threadGoal: { status: 'paused', updatedAt: 90, objective: 'secret goal' } })
    expect(current.ephemeral).toBe(true)
    expect(current.canonicalLatestComplete).toBe(true)
    expect(current.currentCanonicalTurn).toMatchObject({ status: 'completed', startedAt: 100 })
    expect(shadow.codexDesktopSideGoalEvidence(current)).toMatchObject({ goalStatus: 'paused', goalFreshness: 'fresh', goalUpdatedAt: 90 })
    expect(JSON.stringify(current)).not.toContain('secret')
  })

  it('uses the member capability only with an explicit ephemeral flag and current owner', () => {
    const { shadow, current, build } = ownerSnapshot()
    expect(shadow.codexDesktopSideGoalEvidence(current)).toMatchObject({ goalStatus: 'none', goalFreshness: 'fresh' })
    for (const extra of [{ ephemeral: undefined }, { ephemeral: false }, { sideConversation: false }]) {
      expect(shadow.codexDesktopSideGoalEvidence(build(extra))).toBeNull()
    }
    expect(shadow.codexDesktopSideGoalEvidence({ ...current, ownerClientId: '' })).toBeNull()
    expect(shadow.codexDesktopSideGoalEvidence({ ...current, ownerDisconnectedAt: 101 })).toBeNull()
  })

  it('preserves semantic Goal sequence across repeated snapshots and explicit none', () => {
    const { shadow, current, build } = ownerSnapshot()
    const first = shadow.codexDesktopSideGoalEvidence(current)
    const next = build({}, current)
    expect(shadow.codexDesktopSideGoalEvidence(next)).toEqual(first)
    expect(shadow.codexApplyDesktopShadowPatch(next, { op: 'replace', path: ['threadGoal'], value: null })).toBe(true)
    expect(shadow.codexDesktopSideGoalEvidence(next)).toEqual(first)
    expect(shadow.codexApplyDesktopShadowPatch(next, { op: 'replace', path: ['threadGoal'], value: { status: 'active', updatedAt: 120, objective: 'secret goal' } })).toBe(true)
    const active = shadow.codexDesktopSideGoalEvidence(next)
    expect(active.goalEvidenceSequence).toBeGreaterThan(first.goalEvidenceSequence)
    expect(active).toMatchObject({ goalStatus: 'active', goalUpdatedAt: 120 })
    expect(shadow.codexApplyDesktopShadowPatch(next, { op: 'replace', path: ['threadGoal', 'objective'], value: 'secret changed' })).toBe(true)
    expect(shadow.codexDesktopSideGoalEvidence(next)).toEqual(active)
    expect(JSON.stringify(next)).not.toContain('secret')
  })

  it.each([undefined, 'bad', {}, { status: 'invented', updatedAt: 10 }, { status: 'active' }])('keeps malformed explicit Goal %j verifying', (threadGoal) => {
    const { shadow, current } = ownerSnapshot({ threadGoal })
    expect(shadow.codexDesktopSideGoalEvidence(current)).toMatchObject({ goalStatus: 'unknown', goalFreshness: 'verifying' })
    expect(shadow.codexApplyDesktopShadowPatch(current, { op: 'remove', path: ['threadGoal'] })).toBe(true)
    expect(shadow.codexDesktopSideGoalEvidence(current).goalStatus).toBe('none')
  })

  it('patches Goal lifecycle fields and preserves unknown ephemeral separately from false', () => {
    const { shadow, current } = ownerSnapshot({ threadGoal: { status: 'active', updatedAt: 100 } })
    for (const [path, value] of [[['threadGoal', 'status'], 'complete'], [['threadGoal', 'updatedAt'], 140]] as any[]) {
      expect(shadow.codexApplyDesktopShadowPatch(current, { op: 'replace', path, value })).toBe(true)
    }
    expect(shadow.codexDesktopSideGoalEvidence(current)).toMatchObject({ goalStatus: 'complete', goalUpdatedAt: 140 })
    expect(shadow.codexApplyDesktopShadowPatch(current, { op: 'remove', path: ['ephemeral'] })).toBe(true)
    expect(current.ephemeral).toBeUndefined()
    expect(shadow.codexDesktopSideGoalEvidence(current)).toBeNull()
    expect(shadow.codexApplyDesktopShadowPatch(current, { op: 'add', path: ['ephemeral'], value: false })).toBe(true)
    expect(current.ephemeral).toBe(false)
    expect(shadow.codexApplyDesktopShadowPatch(current, { op: 'replace', path: ['ephemeral'], value: 'true' })).toBe(false)
  })

  it('tracks final-island boundaries and entries through native patches', () => {
    const { shadow, current } = ownerSnapshot()
    const patch = (path: any[], value: any, op = 'replace') => shadow.codexApplyDesktopShadowPatch(current, { op, path: ['turnHistory', 'history', ...path], value })
    expect(patch(['islands', 0, 'newerBoundary', 'status'], 'available')).toBe(true)
    expect(current.canonicalLatestComplete).toBe(false)
    expect(decision(current).turn).toBeUndefined()
    expect(patch(['islands', 0, 'newerBoundary'], { status: 'exhausted' })).toBe(true)
    expect(decision(current).turn).toMatchObject({ status: 'completed', startedAt: 100 })
    expect(patch(['islands', 1], { entries: [], newerBoundary: { status: 'exhausted' } }, 'add')).toBe(true)
    expect(current.currentCanonicalTurn).toBeNull()
    expect(decision(current).turn).toBeUndefined()
    expect(patch(['entitiesByKey', 'new-secret'], { turnId: 'new-secret-turn', status: 'completed', turnStartedAtMs: 200, items: [] }, 'add')).toBe(true)
    expect(patch(['islands', 1, 'entries', 0], { value: 'new-secret' }, 'add')).toBe(true)
    expect(decision(current).turn.startedAt).toBe(200)
    expect(patch(['entitiesByKey', 'new-secret', 'turnStartedAtMs'], 210)).toBe(true)
    expect(decision(current).turn.startedAt).toBe(210)
    expect(JSON.stringify(current)).not.toContain('secret')
  })

  it('blocks pending submissions until the native terminal patch arrives', () => {
    const { shadow, current } = ownerSnapshot({ unconfirmedTurnSubmissions: [{ terminal: false, text: 'secret pending' }] })
    expect(decision(current).reason).toBe('pending-work')
    expect(shadow.codexApplyDesktopShadowPatch(current, { op: 'replace', path: ['unconfirmedTurnSubmissions', 0, 'terminal'], value: true })).toBe(true)
    expect(decision(current).turn).toBeDefined()
    expect(JSON.stringify(current)).not.toContain('secret')
    const malformed = ownerSnapshot({ unconfirmedTurnSubmissions: null }).current
    expect(decision(malformed).reason).toBe('pending-work')
  })

  it.each(['completed', 'interrupted', 'failed'])('admits owner canonical %s with a complete latest boundary', (status) => {
    expect(decision(terminalShadow({ currentCanonicalTurn: { turnRef: 'turn-ref', status, startedAt: 100 } }))).toEqual({
      turn: { status, startedAt: 100 }, duplicate: false, reason: 'owner-canonical-terminal'
    })
  })

  it.each([
    { ephemeral: undefined }, { ephemeral: false }, { sideConversation: false },
    { ownerClientId: '' }, { ownerDisconnectedAt: 110 }, { revision: -1 },
    { canonicalLatestComplete: false }, { currentCanonicalTurn: { turnRef: 'x', status: 'completed', startedAt: 0 } },
    { runtime: { type: 'active', activeFlags: [] } }, { requests: [{ type: 'approval' }] },
    { asyncTurns: [{ turnRef: 'turn-ref', status: 'inProgress', startedAt: 100 }] },
    { asyncTurns: [{ turnRef: 'newer', status: 'completed', startedAt: 110 }] }
  ])('does not settle incomplete or active evidence %j', (extra) => {
    expect(decision(terminalShadow(extra)).turn).toBeUndefined()
  })

  it('rejects older canonical, branch and terminal epochs and exact same-turn activity', () => {
    for (const options of [
      { previousShadow: terminalShadow({ currentCanonicalTurn: { turnRef: 'newer', status: 'completed', startedAt: 120 } }) },
      { terminal: { lastTurnStatus: 'completed', turnStartedAt: 120 } },
      { branchTurnStartedAt: 120 }, { branchTurnStartedAt: 100, branchLiveExact: true },
      { branchLiveExact: true }, { previousShadow: terminalShadow({ revision: 4 }) }
    ]) expect(decision(terminalShadow(), options).turn).toBeUndefined()
    expect(decision(terminalShadow(), { branchTurnStartedAt: 90, branchLiveExact: true }).turn).toBeDefined()
  })

  it('allows same-owner completion but refuses same/newer live work on an owner switch', () => {
    const previous = terminalShadow({ revision: 2, runtime: { type: 'active', activeFlags: [] },
      currentCanonicalTurn: { turnRef: 'turn-ref', status: 'inProgress', startedAt: 100 } })
    expect(decision(terminalShadow(), { previousShadow: previous }).turn).toBeDefined()
    expect(decision(terminalShadow({ ownerClientId: 'new-owner' }), { previousShadow: previous }).reason).toBe('previous-owner-live')
    expect(decision(terminalShadow({ revision: 2 }), { previousShadow: previous }).reason).toBe('stale-revision')
  })

  it('marks repeated terminal snapshots duplicate and refuses newer active evidence', () => {
    const terminal = { lastTurnStatus: 'completed', turnStartedAt: 100, terminalEvidenceSequence: 20 }
    expect(decision(terminalShadow(), { terminal, branchLiveSequence: 10 }).duplicate).toBe(true)
    expect(decision(terminalShadow(), { terminal, branchLiveSequence: 21 }).reason).toBe('newer-active-evidence')
  })

  it('extracts the original refresh choices for uncorroborated active and settled Side snapshots', () => {
    const input = { known: { lastTurnStatus: 'completed', lastTurnStartedAt: 100 }, parentThreadId: 'parent',
      desktopRelation: 'parent', inventoryRelation: '', completeInventoryKnown: true, completeInventoryContains: false,
      parentTerminal: {}, branchTerminal: null, parentLiveSequence: 0 }
    const side = terminalShadow({ activityRevision: 3, activityEvidence: 'activity-event' })
    expect(resolver.codexDesktopSnapshotRefreshOptions('side', side, input)).toEqual({
      verifyStaleActive: true, settleSnapshotTerminal: true, queryThreadId: 'side', snapshotThreadId: 'side',
      snapshotActivityRevision: 3, forceQuery: true
    })
    expect(resolver.codexDesktopSnapshotRefreshOptions('side', side, { ...input, branchTerminal: {} })).toBeNull()
    const active = terminalShadow({ sideConversation: false, activityEvidence: 'initial-snapshot', activityRevision: 4,
      runtime: { type: 'active', activeFlags: [] } })
    expect(resolver.codexDesktopSnapshotRefreshOptions('parent', active, input).forceQuery).toBe(false)
    expect(resolver.codexDesktopSnapshotRefreshOptions('parent', active, { ...input, parentLiveSequence: 1 })).toBeNull()
    expect(resolver.codexDesktopSnapshotRefreshOptions('parent', active, { ...input, known: { ...input.known, connectorPlanImplementationOnly: true } })).toBeNull()
  })
})
