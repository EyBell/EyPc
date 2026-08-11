import { describe, expect, it } from 'vitest'
import {
  CODEX_TASK_STATE_REVISION,
  emptyConversationSnapshot,
  type CodexTaskCard
} from '../../src/domain/codex'
import { buildCodexTaskStatePackage } from '../../src/domain/codexPresentation'
import {
  applyCompanionTaskPackageViews,
  COMPANION_TASK_KERNEL_REVISION,
  COMPANION_TASK_PACKAGE_REVISION,
  type CompanionCanonicalTaskV4,
  type CompanionTaskPackageV4
} from '../../src/domain/companionTaskPackage'

const key = '0123456789abcdef'

function card(): CodexTaskCard {
  return {
    key,
    actionAlias: 'ct_0123456789abcdef',
    name: 'Task',
    originalName: 'Task',
    bucket: 'stopped',
    activityState: 'stopped',
    archiveCapability: 'allowed',
    revisionAt: 100,
    state: 'stopped',
    updatedAt: 100,
    lastQuestionAt: 90,
    lastTurnStartedAt: 90,
    projectKey: 'chats',
    projectName: 'Chats',
    originalProjectName: 'Chats',
    projectKind: 'chats',
    isHidden: false,
    canArchive: true
  }
}

function canonical(patch: Partial<CompanionCanonicalTaskV4> = {}): CompanionCanonicalTaskV4 {
  return {
    key,
    provider: 'codex',
    kind: 'codex-thread',
    phase: 'completed',
    cycleTier: 'none',
    dynamicGroup: 'unread',
    actionAlias: 'ct_0123456789abcdef',
    revisionAt: 200,
    semanticRevision: 1,
    observationGeneration: 1,
    membershipRevision: 100,
    phaseRevision: 200,
    unreadRevision: 200,
    visibilityRevision: 100,
    statusEnteredAt: 200,
    turnStartedAt: 100,
    terminalAt: 200,
    metadataRevision: 200,
    capabilityToken: 'ct_0123456789abcdef',
    freshness: 'fresh',
    lastQuestionAt: 90,
    createdAt: 50,
    displayOrder: 0,
    cycleOrder: 0,
    attentionOrder: 0,
    hidden: false,
    unreadKnown: true,
    unread: true,
    planImplementation: false,
    planReady: false,
    planLifecycleRevision: 0,
    paused: false,
    turnMode: 'unknown',
    idleConfirmed: false,
    localPin: false,
    dynamicEligible: true,
    capabilities: { open: true, archive: true, pause: false, resume: false, executePlan: false },
    ...patch
  }
}

function packageFor(task: CompanionCanonicalTaskV4 | null, revision: number): CompanionTaskPackageV4 {
  const tasks = task ? [task] : []
  const phase = task?.phase
  const group = phase === 'running' ? 'active' : phase === 'stopped' ? 'stopped' : phase === 'completed' ? task?.unread ? 'unread' : 'completed' : null
  return {
    schema: COMPANION_TASK_PACKAGE_REVISION,
    kernelRevision: COMPANION_TASK_KERNEL_REVISION,
    packageRevision: revision,
    sourceTaskStateRevision: CODEX_TASK_STATE_REVISION,
    publishedAt: 1_000 + revision,
    enabled: true,
    providers: { codex: true, claude: false },
    complete: true,
    freshness: 'fresh',
    focusedKey: '',
    sourceGenerations: { codex: revision, claude: 0 },
    sourceLaneGenerations: {
      codex: { membership: revision, phase: revision, unread: revision },
      claude: { membership: 0, phase: 0, unread: 0 }
    },
    tasks,
    views: {
      groups: {
        input: [],
        active: group === 'active' ? [key] : [],
        stopped: group === 'stopped' ? [key] : [],
        unread: group === 'unread' ? [key] : [],
        completed: group === 'completed' ? [key] : []
      },
      counts: {
        input: 0,
        active: group === 'active' ? 1 : 0,
        unread: group === 'unread' ? 1 : 0
      },
      cycleKeys: group === 'active' ? [key] : [],
      attentionKeys: {
        input: [],
        completedUnread: group === 'unread' ? [key] : [],
        archive: task?.capabilities.archive ? [key] : []
      },
      pausedKeys: task?.paused ? [key] : []
    }
  }
}

describe('canonical Companion task projection', () => {
  it('moves card, tab, badge and archive state from one final decision', () => {
    const source = emptyConversationSnapshot()
    const initialCard = card()
    source.stopped = [initialCard]
    source.all = [initialCard]
    source.stoppedCount = 1
    source.sourceFingerprint = 'a'.repeat(64)
    let state = buildCodexTaskStatePackage(source, { sourceRevision: CODEX_TASK_STATE_REVISION, now: 1_000 })

    state = applyCompanionTaskPackageViews(state, packageFor(canonical(), 1))
    expect(state.conversations.completedUnread).toHaveLength(1)
    expect(state.conversations.completedUnread[0]).toMatchObject({
      bucket: 'completed-unread',
      unreadState: 'unread',
      canArchive: true
    })
    expect(state.dynamic.groups.unread.map((task) => task.key)).toEqual([key])
    expect(state.dynamic.compactCounts).toEqual({ input: 0, active: 0, unread: 1 })

    state = applyCompanionTaskPackageViews(state, packageFor(canonical({ unread: false, dynamicGroup: 'completed', unreadRevision: 300 }), 2))
    expect(state.conversations.completed).toHaveLength(1)
    expect(state.conversations.completedUnread).toHaveLength(0)
    expect(state.dynamic.compactCounts.unread).toBe(0)

    state = applyCompanionTaskPackageViews(state, packageFor(canonical({
      phase: 'running',
      cycleTier: 'active',
      dynamicGroup: 'active',
      unread: false,
      revisionAt: 400,
      phaseRevision: 400,
      statusEnteredAt: 400,
      capabilities: { open: true, archive: false, pause: false, resume: false, executePlan: false }
    }), 3))
    expect(state.conversations.ongoing[0]).toMatchObject({
      activityState: 'active',
      archiveCapability: 'blocked-active',
      canArchive: false
    })
    expect(state.dynamic.compactCounts.active).toBe(1)

    state = applyCompanionTaskPackageViews(state, packageFor(null, 4))
    expect(state.conversations.all).toEqual([])
    expect(state.conversations.ongoingCount).toBe(0)
    expect(state.dynamic.tasks).toEqual([])
  })

  it('keeps provider-specific unknown tasks visible instead of dropping or mislabeling them', () => {
    const codexSource = emptyConversationSnapshot()
    const codexCard = card()
    codexSource.stopped = [codexCard]
    codexSource.all = [codexCard]
    let codexState = buildCodexTaskStatePackage(codexSource, { sourceRevision: CODEX_TASK_STATE_REVISION, now: 1_000 })
    const codexPackage = packageFor(canonical({
      phase: 'unknown',
      cycleTier: 'active',
      dynamicGroup: 'active',
      capabilities: { open: true, archive: false, pause: false, resume: false, executePlan: false }
    }), 1)
    codexPackage.views.groups.active = [key]
    codexPackage.views.counts.active = 1
    codexPackage.views.cycleKeys = [key]
    codexState = applyCompanionTaskPackageViews(codexState, codexPackage)
    expect(codexState.conversations.ongoing[0]).toMatchObject({
      bucket: 'ongoing',
      activityState: 'ongoing',
      state: 'running',
      canArchive: false
    })
    expect(codexState.dynamic.groups.active.map((task) => task.key)).toEqual([key])

    const claudeSource = emptyConversationSnapshot()
    const claudeCard = { ...card(), provider: 'claude' as const, claudePhase: 'unknown' as const }
    claudeSource.stopped = [claudeCard]
    claudeSource.all = [claudeCard]
    let claudeState = buildCodexTaskStatePackage(claudeSource, { sourceRevision: CODEX_TASK_STATE_REVISION, now: 1_000 })
    const claudePackage = packageFor(canonical({
      provider: 'claude',
      kind: 'claude-session',
      phase: 'unknown',
      cycleTier: 'none',
      dynamicGroup: 'stopped',
      capabilities: { open: true, archive: false, pause: false, resume: false, executePlan: false }
    }), 2)
    claudePackage.providers = { codex: false, claude: true }
    claudePackage.views.groups.stopped = [key]
    claudeState = applyCompanionTaskPackageViews(claudeState, claudePackage)
    expect(claudeState.conversations.stopped[0]).toMatchObject({
      bucket: 'stopped',
      activityState: 'ongoing',
      claudePhase: 'unknown',
      state: 'attention',
      canArchive: false
    })
    expect(claudeState.dynamic.groups.stopped.map((task) => task.key)).toEqual([key])
  })

  it('preserves the Codex completion watermark when unread revisions advance', () => {
    const source = emptyConversationSnapshot()
    const completedCard: CodexTaskCard = {
      ...card(),
      bucket: 'completed-unread',
      activityState: 'ongoing',
      state: 'pending-review',
      revisionAt: 180,
      updatedAt: 220,
      lastQuestionAt: 150,
      lastTurnStartedAt: 150,
      lastTurnCompletedAt: 180,
      completionRevision: 180,
      unreadState: 'unread'
    }
    source.completedUnread = [completedCard]
    source.all = [completedCard]
    source.sourceFingerprint = 'a'.repeat(64)
    let state = buildCodexTaskStatePackage(source, { sourceRevision: CODEX_TASK_STATE_REVISION, now: 1_000 })
    const taskPackage = packageFor(canonical({
      revisionAt: 300,
      phaseRevision: 180,
      unreadRevision: 300,
      statusEnteredAt: 180,
      lastQuestionAt: 150,
      archiveRequest: {
        expectedUpdatedAt: 220,
        expectedRevisionAt: 180,
        expectedCompletionAt: 180,
        expectedLastTurnStartedAt: 150,
        expectedSourceFingerprint: 'a'.repeat(64),
        evidence: 'completed'
      }
    }), 1)
    state = applyCompanionTaskPackageViews(state, taskPackage)
    expect(state.conversations.completedUnread[0]).toMatchObject({
      revisionAt: 300,
      updatedAt: 220,
      completionRevision: 180,
      lastTurnStartedAt: 150,
      lastTurnCompletedAt: 180
    })

  })
})
