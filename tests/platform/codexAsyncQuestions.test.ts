import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createCodexDesktopShadow } = require('../../preload/codex/desktop-shadow.cjs')
const { createCodexDesktopActivityResolution } = require('../../preload/codex/desktop-activity-resolution.cjs')
const { createCodexDesktopRequestProjection } = require('../../preload/codex/desktop-request-projection.cjs')

function harness() {
  let sequence = 0
  const deps = {
    record: (value: any) => value && typeof value === 'object' ? value : {},
    timestampMs: (value: any) => typeof value === 'number' ? value : 0,
    nextLiveEvidenceSequence: () => ++sequence
  }
  const projection = createCodexDesktopRequestProjection(deps)
  const shadow = createCodexDesktopShadow({ ...deps,
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
