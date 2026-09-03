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
  type CompanionTaskSnapshotV6,
  type CompanionTaskViewV6
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

function publicTask(task: CompanionCanonicalTaskV4): CompanionTaskViewV6 {
  const {
    actionAlias: _actionAlias,
    capabilityToken: _capabilityToken,
    archiveRequest: _archiveRequest,
    observationGeneration: _observationGeneration,
    membershipRevision: _membershipRevision,
    phaseRevision: _phaseRevision,
    unreadRevision: _unreadRevision,
    visibilityRevision: _visibilityRevision,
    metadataRevision: _metadataRevision,
    planClearReason: _planClearReason,
    ...value
  } = task
  return value
}

function packageFor(task: CompanionCanonicalTaskV4 | null, revision: number): CompanionTaskSnapshotV6 {
  const tasks = task ? [publicTask(task)] : []
  const phase = task?.phase
  // Mirrors the Kernel rule: a pinned, finished, already-read root is placed in
  // the dedicated pinned group rather than the window-bounded completed one.
  const group = phase === 'running' ? 'active' : phase === 'stopped' ? 'stopped' : phase === 'completed' ? task?.unread ? 'unread' : (task?.localPin || task?.providerPin === true) ? 'pinned' : 'completed' : null
  return {
    schema: COMPANION_TASK_PACKAGE_REVISION,
    kernelRevision: COMPANION_TASK_KERNEL_REVISION,
    registryRevision: 'companion-provider-registry-v1',
    topologySchemaRevision: 'companion-task-topology-v2',
    commandRevision: 'companion-task-command-v1',
    packageRevision: revision,
    topologyRevision: revision,
    sourceTaskStateRevision: CODEX_TASK_STATE_REVISION,
    publishedAt: 1_000 + revision,
    enabled: true,
    providers: { codex: true, claude: false, cursor: false },
    complete: true,
    freshness: 'fresh',
    focusedKey: '',
    sourceGenerations: { codex: revision, claude: 0, cursor: 0 },
    sourceLaneGenerations: {
      codex: { membership: revision, activity: revision, interaction: revision, unread: revision, planArtifact: revision, metadata: revision, topology: revision },
      claude: { membership: 0, activity: 0, interaction: 0, unread: 0, planArtifact: 0, metadata: 0, topology: 0 },
      cursor: { membership: 0, activity: 0, interaction: 0, unread: 0, planArtifact: 0, metadata: 0, topology: 0 }
    },
    providerHealth: {
      codex: { status: 'ready', generation: revision, errorCode: '' },
      claude: { status: 'disabled', generation: 0, errorCode: '' },
      cursor: { status: 'disabled', generation: 0, errorCode: '' }
    },
    tasks,
    views: {
      groups: {
        pinned: group === 'pinned' ? [key] : [],
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

  it('shows a provider-side pin as a native pin and keeps a local pin as the control identity', () => {
    const source = emptyConversationSnapshot()
    const initialCard = card()
    source.stopped = [initialCard]
    source.all = [initialCard]
    source.stoppedCount = 1
    source.sourceFingerprint = 'a'.repeat(64)
    let state = buildCodexTaskStatePackage(source, { sourceRevision: CODEX_TASK_STATE_REVISION, now: 1_000 })

    state = applyCompanionTaskPackageViews(state, packageFor(canonical({
      unread: false,
      dynamicGroup: 'pinned',
      providerPin: true,
      providerPinAuthority: 'app-server',
      capabilities: { open: true, archive: true, pause: false, resume: false, executePlan: false, pin: true }
    }), 1))
    expect(state.conversations.all[0]).toMatchObject({ pinSource: 'native', companionCapabilities: { pin: true } })
    expect(state.dynamic.groups.pinned.map((task) => task.key)).toEqual([key])
    expect(state.conversations.projectSections.find((section) => section.id === 'pinned')?.entries).toEqual([
      expect.objectContaining({ kind: 'task', pinSource: 'native' })
    ])

    state = applyCompanionTaskPackageViews(state, packageFor(canonical({
      unread: false,
      dynamicGroup: 'pinned',
      localPin: true,
      providerPin: true,
      revisionAt: 300,
      visibilityRevision: 300
    }), 2))
    expect(state.conversations.all[0].pinSource).toBe('local')

    state = applyCompanionTaskPackageViews(state, packageFor(canonical({
      unread: false,
      dynamicGroup: 'completed',
      providerPin: false,
      revisionAt: 400,
      visibilityRevision: 400
    }), 3))
    expect(state.conversations.all[0].pinSource).toBeUndefined()
    expect(state.dynamic.groups.pinned).toEqual([])
  })

  it('fails closed on an incomplete configuration barrier instead of reviving inventory state', () => {
    const source = emptyConversationSnapshot()
    const inventoryCard = card()
    source.stopped = [inventoryCard]
    source.all = [inventoryCard]
    source.stoppedCount = 1
    const inventory = buildCodexTaskStatePackage(source, {
      sourceRevision: CODEX_TASK_STATE_REVISION,
      now: 1_000
    })
    const barrier = {
      ...packageFor(null, 2),
      enabled: false,
      complete: false,
      providerHealth: {
        codex: { status: 'disabled' as const, generation: 2, errorCode: '' },
        claude: { status: 'disabled' as const, generation: 0, errorCode: '' },
        cursor: { status: 'disabled' as const, generation: 0, errorCode: '' }
      }
    }

    const projected = applyCompanionTaskPackageViews(inventory, barrier)
    expect(projected.conversations.all).toEqual([])
    expect(projected.dynamic.tasks).toEqual([])
    expect(projected.dynamic.compactCounts).toEqual({ input: 0, active: 0, unread: 0 })
  })

  it('keeps an EyPc alias as the display name while still refreshing the original title', () => {
    const source = emptyConversationSnapshot()
    const aliased = { ...card(), name: '我的别名', displayName: '我的别名', alias: '我的别名', originalName: '原始标题' }
    source.stopped = [aliased]
    source.all = [aliased]
    source.stoppedCount = 1
    const state = applyCompanionTaskPackageViews(
      buildCodexTaskStatePackage(source, { sourceRevision: CODEX_TASK_STATE_REVISION, now: 1_000 }),
      packageFor(canonical({
        phase: 'stopped',
        dynamicGroup: 'none',
        alias: '我的别名',
        originalTitle: 'Provider 原始标题',
        displayName: '我的别名'
      }), 1)
    )
    expect(state.conversations.all[0]).toMatchObject({
      alias: '我的别名',
      name: '我的别名',
      displayName: '我的别名',
      originalName: 'Provider 原始标题'
    })

    const plain = emptyConversationSnapshot()
    const unaliased = card()
    plain.stopped = [unaliased]
    plain.all = [unaliased]
    plain.stoppedCount = 1
    const plainState = applyCompanionTaskPackageViews(
      buildCodexTaskStatePackage(plain, { sourceRevision: CODEX_TASK_STATE_REVISION, now: 1_000 }),
      packageFor(canonical({ phase: 'stopped', dynamicGroup: 'none', displayName: '新的原始标题' }), 1)
    )
    expect(plainState.conversations.all[0]).toMatchObject({ name: '新的原始标题', displayName: '新的原始标题' })
  })

  it('projects unknown as a neutral Kernel state without reviving inventory semantics', () => {
    const codexSource = emptyConversationSnapshot()
    const codexCard = card()
    codexSource.stopped = [codexCard]
    codexSource.all = [codexCard]
    let codexState = buildCodexTaskStatePackage(codexSource, { sourceRevision: CODEX_TASK_STATE_REVISION, now: 1_000 })
    const codexPackage = packageFor(canonical({
      phase: 'unknown',
      cycleTier: 'none',
      dynamicGroup: 'none',
      capabilities: { open: true, archive: false, pause: false, resume: false, executePlan: false }
    }), 1)
    codexState = applyCompanionTaskPackageViews(codexState, codexPackage)
    expect(codexState.conversations.stopped[0]).toMatchObject({
      bucket: 'stopped',
      activityState: 'ongoing',
      state: 'attention',
      unreadState: 'unknown',
      canArchive: false,
      canonicalFreshness: 'fresh'
    })
    expect(codexState.conversations.stopped[0]).not.toHaveProperty('actionAlias')
    expect(codexState.dynamic.tasks).toEqual([])

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
    claudePackage.providers = { codex: false, claude: true, cursor: false }
    claudePackage.views.groups.stopped = [key]
    claudeState = applyCompanionTaskPackageViews(claudeState, claudePackage)
    expect(claudeState.conversations.stopped[0]).toMatchObject({
      bucket: 'stopped',
      activityState: 'ongoing',
      claudePhase: 'unknown',
      state: 'attention',
      unreadState: 'unknown',
      canArchive: false
    })
    expect(claudeState.dynamic.groups.stopped.map((task) => task.key)).toEqual([key])
  })

  it('never fabricates running when an unknown package task arrives before metadata', () => {
    const source = emptyConversationSnapshot()
    let state = buildCodexTaskStatePackage(source, { sourceRevision: CODEX_TASK_STATE_REVISION, now: 1_000 })
    const taskPackage = packageFor(canonical({
      phase: 'unknown',
      cycleTier: 'none',
      dynamicGroup: 'none',
      freshness: 'verifying',
      capabilities: { open: true, archive: false, pause: false, resume: false, executePlan: false }
    }), 1)
    state = applyCompanionTaskPackageViews(state, taskPackage)

    expect(state.conversations.all[0]).toMatchObject({
      bucket: 'stopped',
      activityState: 'ongoing',
      state: 'attention',
      hasCurrentActivity: false,
      canArchive: false,
      canonicalFreshness: 'verifying'
    })
    expect(state.dynamic.tasks).toEqual([])
    expect(state.dynamic.compactCounts.active).toBe(0)
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
      turnStartedAt: 150,
      terminalAt: 180
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

  it('projects Codex and Cursor roots together from one complete V6 snapshot', () => {
    const cursorKey = 'cursor:86e0370a-21b3-434d-a1a3-0ce83edc5ddd'
    const cursorCard: CodexTaskCard = {
      ...card(),
      key: cursorKey,
      actionAlias: 'ct_cursor',
      name: 'Cursor Agent',
      originalName: 'Cursor Agent',
      bucket: 'ongoing',
      activityState: 'active',
      archiveCapability: 'blocked-active',
      canArchive: false,
      provider: 'cursor'
    }
    const source = emptyConversationSnapshot()
    const initialCard = card()
    source.stopped = [initialCard]
    source.ongoing = [cursorCard]
    source.all = [initialCard, cursorCard]
    source.stoppedCount = 1
    source.ongoingCount = 1
    source.sourceFingerprint = 'a'.repeat(64)
    const taskPackage = packageFor(canonical(), 1)
    taskPackage.providers.cursor = true
    taskPackage.providerHealth.cursor = { status: 'ready', generation: 1, errorCode: '' }
    taskPackage.tasks.push(publicTask(canonical({
      key: cursorKey,
      provider: 'cursor',
      kind: 'cursor-session',
      phase: 'running',
      cycleTier: 'active',
      dynamicGroup: 'active',
      actionAlias: 'ct_cursor',
      displayName: 'Cursor Agent',
      capabilities: { open: true, archive: false, pause: false, resume: false, executePlan: false }
    })))
    taskPackage.views.groups.active = [cursorKey]
    taskPackage.views.counts.active = 1
    taskPackage.views.cycleKeys = [cursorKey]
    const state = applyCompanionTaskPackageViews(
      buildCodexTaskStatePackage(source, { sourceRevision: CODEX_TASK_STATE_REVISION, now: 1_000 }),
      taskPackage
    )
    expect(state.conversations.all.some((task) => task.key === cursorKey)).toBe(true)
    expect(state.dynamic.groups.active.map((task) => task.key)).toEqual([cursorKey])
    expect(state.dynamic.groups.unread.map((task) => task.key)).toEqual([key])
    expect(state.dynamic.compactCounts.active).toBe(1)
  })
})
