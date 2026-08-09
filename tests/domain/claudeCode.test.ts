import { describe, expect, it } from 'vitest'
import {
  claudeCodeDisplayName,
  compareClaudeCodeStateVersion,
  normalizeClaudeCodeObservation,
  normalizeClaudeCodeUnread,
  projectClaudeCodeTaskCards,
  resolveClaudeCodeState,
  type ClaudeCodeObservation,
  type ClaudeCodePhase
} from '../../src/domain/claudeCode'

const LOCAL_A = 'local_11111111-1111-4111-8111-111111111111'
const LOCAL_B = 'local_22222222-2222-4222-8222-222222222222'
const CLI = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function observation(phase: ClaudeCodePhase, patch: Partial<ClaudeCodeObservation> = {}): ClaudeCodeObservation {
  return {
    sessionId: LOCAL_A,
    cliSessionId: CLI,
    title: 'App title',
    cwd: '/work/project',
    originCwd: '/work/project',
    createdAt: 100,
    lastActivityAt: 200,
    lastFocusedAt: 200,
    model: 'claude',
    isArchived: false,
    completedTurns: 1,
    metadataUpdatedAt: 200,
    statusCorrelation: 'unique-cli',
    stateSource: 'hook',
    stateCompatibility: 'compatible',
    stateGeneration: 0,
    phase,
    phaseUpdatedAt: 300,
    turnStartedAt: 250,
    hookActivityAt: 260,
    waitingApprovalAt: 0,
    waitingInputAt: 0,
    lastStopAt: phase === 'completed' ? 300 : 0,
    lastSessionEndAt: phase === 'stopped' ? 300 : 0,
    ...patch
  }
}

describe('Claude App Code domain', () => {
  it('uses the App title and fixed human fallback without UUID', () => {
    expect(claudeCodeDisplayName(observation('unknown'))).toBe('App title')
    expect(claudeCodeDisplayName(observation('unknown', { title: '  ' }))).toBe('General coding session')
  })

  it.each([
    ['running', 'ongoing', 'active'],
    ['waiting-approval', 'ongoing', 'waiting-approval'],
    ['waiting-input', 'ongoing', 'waiting-input'],
    ['stopped', 'stopped', 'stopped'],
    ['unknown', 'stopped', 'ongoing']
  ] as const)('maps %s into one visible bucket', (phase, bucket, activityState) => {
    expect(resolveClaudeCodeState(observation(phase))).toMatchObject({ phase, bucket, activityState })
  })

  it('projects the exact Claude phase appearance time into attention status instances', () => {
    expect(projectClaudeCodeTaskCards([
      observation('waiting-approval', { waitingApprovalAt: 410 }),
      observation('waiting-input', { sessionId: LOCAL_B, waitingInputAt: 420 })
    ]).map((card) => card.statusEnteredAt)).toEqual([410, 420])
    expect(projectClaudeCodeTaskCards([
      observation('completed', { lastStopAt: 430 })
    ], { appUnread: [LOCAL_A] })[0]).toMatchObject({
      bucket: 'completed-unread',
      statusEnteredAt: 430,
      pendingSince: 430
    })
  })

  it('orders state versions by generation before event time and then by authority', () => {
    const current = observation('running', { stateGeneration: 4, phaseUpdatedAt: 500, hookActivityAt: 500 })
    const newerGeneration = observation('completed', {
      stateGeneration: 5,
      phaseUpdatedAt: 100,
      hookActivityAt: 100,
      lastStopAt: 100
    })
    expect(compareClaudeCodeStateVersion(newerGeneration, current)).toBeGreaterThan(0)
    expect(compareClaudeCodeStateVersion(current, newerGeneration)).toBeLessThan(0)
    expect(compareClaudeCodeStateVersion(
      observation('completed', {
        stateGeneration: 4,
        stateSource: 'app-log',
        phaseUpdatedAt: 500,
        hookActivityAt: 500,
        lastStopAt: 500
      }),
      current
    )).toBeGreaterThan(0)
  })

  it('lets exact native unread recover any non-live historical row', () => {
    expect(resolveClaudeCodeState(observation('completed'), [LOCAL_A])).toMatchObject({ bucket: 'completed-unread', unreadState: 'unread' })
    expect(resolveClaudeCodeState(observation('completed'), [])).toMatchObject({ bucket: 'completed', unreadState: 'read' })
    expect(resolveClaudeCodeState(observation('completed'), null)).toMatchObject({ bucket: 'completed', unreadState: 'unknown' })
    expect(resolveClaudeCodeState(observation('running'), [LOCAL_A]).unreadState).toBe('unknown')
    expect(resolveClaudeCodeState(observation('unknown'), [LOCAL_A])).toMatchObject({ phase: 'completed', bucket: 'completed-unread', unreadState: 'unread' })
    expect(resolveClaudeCodeState(observation('stopped'), [LOCAL_A])).toMatchObject({ phase: 'completed', bucket: 'completed-unread' })
  })

  it('enables silent metadata archive only for the version-compatible App state lane', () => {
    expect(projectClaudeCodeTaskCards([observation('completed')])[0]).toMatchObject({
      archiveCapability: 'allowed',
      canArchive: true
    })
    expect(projectClaudeCodeTaskCards([
      observation('stopped', { stateCompatibility: 'unsupported' })
    ])[0]).toMatchObject({
      archiveCapability: 'blocked-stopped',
      canArchive: false
    })
  })

  it('keeps duplicate App rows and excludes archived rows', () => {
    const cards = projectClaudeCodeTaskCards([
      observation('running'),
      observation('unknown', { sessionId: LOCAL_B, title: '' }),
      observation('completed', { sessionId: 'local_33333333-3333-4333-8333-333333333333', isArchived: true })
    ])
    expect(cards.map((card) => card.actionAlias)).toEqual([LOCAL_A, LOCAL_B])
    expect(cards[1]).toMatchObject({ originalName: 'General coding session', claudePhase: 'unknown', source: 'unresolved' })
  })

  it('normalizes malformed phase/correlation to unknown', () => {
    const normalized = normalizeClaudeCodeObservation({
      ...observation('running'),
      phase: 'made-up',
      statusCorrelation: 'ambiguous'
    })
    expect(normalized).toMatchObject({ phase: 'unknown', statusCorrelation: 'ambiguous' })
    expect(normalizeClaudeCodeObservation({ ...observation('running'), sessionId: 'bad' })).toBeNull()
  })

  it('normalizes exact native unread ids and rejects absent evidence', () => {
    expect(normalizeClaudeCodeUnread({ ids: [LOCAL_A, LOCAL_A, 'bad'], readAt: 500 })).toEqual({
      version: 1,
      ids: [LOCAL_A],
      readAt: 500,
      generation: 0,
      sourceFingerprint: ''
    })
    expect(normalizeClaudeCodeUnread({
      version: 2,
      ids: [LOCAL_B],
      readAt: 600,
      generation: 3,
      sourceFingerprint: 'a'.repeat(32)
    })).toMatchObject({ version: 2, ids: [LOCAL_B], generation: 3, sourceFingerprint: 'a'.repeat(32) })
    expect(normalizeClaudeCodeUnread({ version: 2, ids: [LOCAL_B], readAt: 600, generation: 3 })).toBeNull()
    expect(normalizeClaudeCodeUnread({ version: 2, ids: [LOCAL_B], readAt: 600, sourceFingerprint: 'a'.repeat(32) })).toBeNull()
    expect(normalizeClaudeCodeUnread(null)).toBeNull()
    expect(normalizeClaudeCodeUnread({ ids: 'all' })).toBeNull()
  })
})
