import { describe, expect, it } from 'vitest'

const {
  activityFromPhaseV7,
  codexBranchObservationV7,
  claudeSessionObservationV7,
  cursorSessionObservationV7,
  createEvidenceNodeV7,
  createEvidenceBatchV7
} = require('../../preload/companion/evidence-adapter-v7.cjs') as Record<string, (...args: any[]) => any>

describe('CompanionProviderEvidenceAdapterV7', () => {
  it('keeps waiting interactions separate from underlying activity', () => {
    expect(activityFromPhaseV7('waiting-input')).toBe('turn-completed')
    expect(activityFromPhaseV7('waiting-approval', { underlyingActivity: 'running' })).toBe('turn-running')
    expect(claudeSessionObservationV7({
      phase: 'waiting-approval',
      waitingApprovalAt: 20,
      turnStartedAt: 10
    }, false)).toMatchObject({
      kind: 'turn-completed',
      interactionKind: 'approval',
      interactionSequence: 20
    })
  })

  it('normalizes Codex branch activity, interaction, unread and Plan as independent facts', () => {
    expect(codexBranchObservationV7({
      status: 'active',
      statusAuthority: 'desktop-live',
      activityEvidence: 'activity-event',
      activeFlags: ['waitingOnUserInput'],
      activeEvidenceSequence: 30,
      waitingSince: 31,
      planImplementationOnly: true,
      planReady: true,
      unreadKnown: true,
      hasUnreadTurn: false
    })).toMatchObject({
      kind: 'unknown',
      candidates: [expect.objectContaining({ kind: 'turn-completed' })],
      interactionKind: 'plan-implementation',
      unreadKnown: true,
      unread: false,
      planState: 'available',
      planActionable: true
    })
  })

  it('keeps a hydration-only Codex active row unknown until exact activity arrives', () => {
    expect(codexBranchObservationV7({
      status: 'active',
      statusAuthority: 'app-server-live',
      activityEvidence: 'initial-snapshot',
      activeFlags: [],
      activeEvidenceSequence: 0,
      lastTurnStatus: 'inProgress'
    })).toMatchObject({
      kind: 'unknown',
      candidates: [expect.objectContaining({ kind: 'unknown', authority: 'unknown', exact: false })],
      interactionKind: ''
    })
  })

  it('maps a Cursor Plan artifact without fabricating an input interaction', () => {
    expect(cursorSessionObservationV7({ hasPendingPlan: true, lastUpdatedAt: 40 }, {})).toMatchObject({
      kind: 'turn-completed',
      interactionKind: '',
      planState: 'available',
      planActionable: true
    })
  })

  it('emits raw evidence nodes and lane-complete batches without public phase or groups', () => {
    const observation = cursorSessionObservationV7({ hasPendingPlan: true, lastUpdatedAt: 40 }, {})
    const node = createEvidenceNodeV7({
      provider: 'cursor',
      key: 'cursor:one',
      observation,
      metadata: { actionAlias: 'one', revisionAt: 40, membershipRevision: 40 },
      capabilities: ['open', 'execute-plan']
    })
    expect(node).toMatchObject({
      activity: { kind: 'turn-completed', candidates: [expect.objectContaining({ kind: 'turn-completed' })] },
      planArtifact: { state: 'available' },
      metadata: { actionAlias: 'one' }
    })
    expect(node).not.toHaveProperty('phase')
    expect(node).not.toHaveProperty('dynamicGroup')
    expect(node).not.toHaveProperty('cycleTier')

    const batch = createEvidenceBatchV7({
      provider: 'cursor',
      nodes: [node],
      laneGenerations: { membership: 40, activity: 41, planArtifact: 42 },
      snapshotLanes: ['membership', 'topology'],
      completeLanes: ['membership', 'topology'],
      relationsComplete: true,
      health: 'ready'
    })
    expect(batch.channels.membership).toMatchObject({ mode: 'snapshot', complete: true, generation: 40 })
    expect(batch.channels.activity).toMatchObject({ mode: 'delta', complete: false, generation: 41 })
    expect(batch.relationsComplete).toBe(true)
  })

  it('does not keep Host extra-process running after a corroborated completion', () => {
    expect(codexBranchObservationV7({
      status: 'active',
      statusAuthority: 'desktop-live',
      activityEvidence: 'activity-event',
      lastTurnStatus: 'completed',
      lastTurnEvidence: 'snapshot-corroborated',
      hostExternal: true,
      activeEvidenceSequence: 50,
      terminalEvidenceSequence: 40,
      turnStartedAt: 10,
      terminalAt: 20,
      unreadKnown: true,
      hasUnreadTurn: true
    })).toMatchObject({
      candidates: [expect.objectContaining({ kind: 'turn-completed', authority: 'terminal', exact: true })]
    })
    expect(codexBranchObservationV7({
      status: 'active',
      statusAuthority: 'desktop-live',
      activityEvidence: 'activity-event',
      lastTurnStatus: 'completed',
      lastTurnEvidence: 'snapshot-corroborated',
      hostExternal: true,
      activeEvidenceSequence: 50,
      terminalEvidenceSequence: 40
    }).candidates.some((candidate: { kind: string }) => candidate.kind === 'turn-running')).toBe(false)
  })

  it('treats Host extra-process connector-active as live running', () => {
    expect(codexBranchObservationV7({
      status: 'active',
      statusAuthority: 'connector',
      activityEvidence: 'connector',
      lastTurnStatus: 'inProgress',
      hostExternal: true,
      turnStartedAt: 10
    })).toMatchObject({
      candidates: [expect.objectContaining({ kind: 'turn-running', exact: true })]
    })
  })

  it('treats Host-corroborated extra-process completion as exact terminal unread', () => {
    expect(codexBranchObservationV7({
      status: 'idle',
      statusAuthority: 'connector',
      activityEvidence: 'connector',
      lastTurnStatus: 'completed',
      lastTurnEvidence: 'snapshot-corroborated',
      terminalEvidenceSequence: 40,
      activeEvidenceSequence: 30,
      turnStartedAt: 10,
      terminalAt: 20,
      unreadKnown: true,
      hasUnreadTurn: true
    })).toMatchObject({
      candidates: [expect.objectContaining({ kind: 'turn-completed', authority: 'terminal', exact: true })],
      unreadKnown: true,
      unread: true
    })
  })
})
