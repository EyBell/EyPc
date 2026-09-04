import { describe, expect, it } from 'vitest'
import {
  cursorAgentDisplayName,
  cursorSubagentsRunning,
  normalizeCursorAgentObservation,
  projectCursorAgentTaskCard,
  resolveCursorAgentPhase,
  resolveCursorAgentState
} from '../../src/domain/cursorAgent'

const COMPOSER = '86e0370a-21b3-434d-a1a3-0ce83edc5ddd'

function observation(patch: Record<string, unknown> = {}) {
  return normalizeCursorAgentObservation({
    composerId: COMPOSER,
    workspaceIdentifier: '79413102b893919eccbe60ee4c8fbcca',
    name: 'local agent',
    createdAt: 1_000,
    lastUpdatedAt: 2_000,
    ...patch
  })
}

describe('cursor agent cold inventory', () => {
  it('rejects non-uuid composer ids and never invents waiting-approval', () => {
    expect(normalizeCursorAgentObservation({ composerId: 'not-a-uuid' })).toBeNull()
    const blocking = observation({ hasBlockingPendingActions: true })
    expect(blocking).not.toBeNull()
    // A blocking user decision is 待输入, never waiting-approval, and beats an open Turn.
    expect(resolveCursorAgentPhase(blocking!)).toBe('waiting-input')
    expect(resolveCursorAgentPhase(observation({ hasBlockingPendingActions: true, hookTurnOpen: true })!)).toBe('waiting-input')
    expect(resolveCursorAgentState(blocking!).activityState).toBe('waiting-input')
    expect(resolveCursorAgentState(blocking!).activityState).not.toBe('waiting-approval')
  })

  it('projects pending plan to waiting-input and unfinished run to running hint', () => {
    expect(resolveCursorAgentPhase(observation({ hasPendingPlan: true })!)).toBe('waiting-input')
    expect(resolveCursorAgentPhase(observation({ unfinishedRunAt: 9_000 })!)).toBe('running')
    expect(resolveCursorAgentPhase(observation({ diskStatus: 'aborted', unfinishedRunAt: 9_000 })!)).toBe('running')
  })

  it('lets an open hook turn beat disk status and never invents waiting-approval', () => {
    expect(resolveCursorAgentPhase(observation({
      diskStatus: 'aborted',
      hookTurnOpen: true,
      hookPhase: 'running'
    })!)).toBe('running')
    expect(resolveCursorAgentPhase(observation({
      unfinishedRunAt: 9_000,
      hookPhase: 'completed'
    })!)).toBe('completed')
    expect(resolveCursorAgentPhase(observation({
      hookPhase: 'stopped',
      diskStatus: 'completed'
    })!)).toBe('stopped')
    expect(resolveCursorAgentPhase(observation({ hookPhase: 'waiting-approval' })!)).toBe('unknown')
  })

  it('projects unread completed and aborted-without-live to stopped', () => {
    const unread = resolveCursorAgentState(observation({ hasUnreadMessages: true, diskStatus: 'completed' })!)
    expect(unread.phase).toBe('completed')
    expect(unread.bucket).toBe('completed-unread')
    expect(resolveCursorAgentPhase(observation({ diskStatus: 'aborted' })!)).toBe('stopped')
    expect(resolveCursorAgentPhase(observation({ diskStatus: 'none', isDraft: true })!)).toBe('unknown')
  })

  it('keeps a multitask parent running while any fork is live, like a Codex side chat', () => {
    const forked = observation({
      diskStatus: 'completed',
      hookPhase: 'completed',
      subagents: [
        { composerId: 'adf34211-6ee0-49e4-94bc-c21dc9cdd9ba', unfinishedRunAt: 9_000 },
        { composerId: 'task-246fecf4-4710-4086-aed5-8c3c9d70320f', unfinishedRunAt: 0 }
      ]
    })
    expect(forked!.subagents).toHaveLength(2)
    expect(cursorSubagentsRunning(forked!)).toBe(true)
    expect(resolveCursorAgentPhase(forked!)).toBe('running')
    expect(resolveCursorAgentState(forked!).bucket).toBe('ongoing')
  })

  it('lets hook-reconciled fork evidence beat the cold marker in both directions', () => {
    const settled = observation({
      diskStatus: 'completed',
      subagents: [{ composerId: 'adf34211-6ee0-49e4-94bc-c21dc9cdd9ba', unfinishedRunAt: 9_000 }],
      subagentRunning: false
    })
    expect(resolveCursorAgentPhase(settled!)).toBe('completed')
    const hotForks = observation({
      diskStatus: 'aborted',
      subagents: [{ composerId: 'adf34211-6ee0-49e4-94bc-c21dc9cdd9ba', unfinishedRunAt: 0 }],
      subagentRunning: true
    })
    expect(resolveCursorAgentPhase(hotForks!)).toBe('running')
  })

  it('keeps the parent waiting-input above running forks and settles when forks finish', () => {
    const waiting = observation({
      hasPendingPlan: true,
      subagents: [{ composerId: 'adf34211-6ee0-49e4-94bc-c21dc9cdd9ba', unfinishedRunAt: 9_000 }]
    })
    expect(resolveCursorAgentPhase(waiting!)).toBe('waiting-input')
    const finished = observation({
      diskStatus: 'completed',
      subagents: [{ composerId: 'adf34211-6ee0-49e4-94bc-c21dc9cdd9ba', unfinishedRunAt: 0 }]
    })
    expect(resolveCursorAgentPhase(finished!)).toBe('completed')
  })

  it('reuses claudePhase so Float unknown grouping works and gates archive by status alone', () => {
    const card = projectCursorAgentTaskCard(observation({ diskStatus: 'none' })!)
    expect(card.provider).toBe('cursor')
    expect(card.key).toBe(`cursor:${COMPOSER}`)
    expect(card.claudePhase).toBe('unknown')
    expect(card.bucket).toBe('stopped')
    expect(card.canArchive).toBe(false)
    expect(card.archiveCapability).toBe('blocked-stopped')
    const completed = projectCursorAgentTaskCard(observation({ diskStatus: 'completed' })!)
    expect(completed).toMatchObject({ canArchive: true, archiveCapability: 'allowed' })
    expect(completed.lastQuestionAt).toBe(2_000)
    expect(completed.lastTurnCompletedAt).toBe(2_000)
    const stopped = projectCursorAgentTaskCard(observation({ diskStatus: 'aborted' })!)
    expect(stopped).toMatchObject({ canArchive: true, archiveCapability: 'allowed' })
    const running = projectCursorAgentTaskCard(observation({ unfinishedRunAt: 9_000 })!)
    expect(running).toMatchObject({ canArchive: false, archiveCapability: 'blocked-active' })
    expect(cursorAgentDisplayName({ name: '', subtitle: 'hint' })).toBe('hint')
  })
})
