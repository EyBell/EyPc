import { describe, expect, it } from 'vitest'
import {
  compareConversationTasks,
  conversationSnapshotFromReceipts,
  defaultCodexSettings,
  hideCodexThread,
  normalizeCodexQuota,
  normalizeCodexSettings,
  normalizeCodexState,
  projectConversations,
  restoreCodexThread,
  type CodexHostThread,
  type CodexTaskCard
} from '../../src/domain/codex'

const KEY = '0123456789abcdef'
const keyAt = (index: number) => index.toString(16).padStart(16, '0')

function thread(
  status: CodexHostThread['status'],
  updatedAt: number,
  activeFlags: CodexHostThread['activeFlags'] = [],
  key = KEY,
  evidence: Pick<CodexHostThread, 'createdAt' | 'firstPromptAt' | 'lastTurnStatus' | 'lastTurnStartedAt' | 'lastTurnCompletedAt'> = {}
): CodexHostThread {
  return { key, actionAlias: `alias-${key}`, name: `任务 ${key.slice(-2)}`, status, activeFlags, updatedAt, ...evidence }
}

describe('Codex domain', () => {
  it('normalizes configurable display, refresh and privacy-safe storage fields', () => {
    const settings = normalizeCodexSettings({
      floatEnabled: true,
      displayStyle: 'card',
      quotaRefreshMinutes: 0,
      taskRefreshSeconds: 60,
      compactFields: ['weekly', 'tasks', 'unknown'],
      expandedFields: ['tasks', 'config'],
      colors: { healthy: '#00aa99', warning: 'invalid' },
      position: { displayId: 'screen-2', x: 101.6, y: -50.2, edge: 'left' }
    })

    expect(settings).toMatchObject({
      floatEnabled: true,
      displayStyle: 'card',
      quotaRefreshMinutes: 0,
      taskRefreshSeconds: 60,
      compactFields: ['weekly', 'tasks'],
      expandedFields: ['tasks', 'config'],
      position: { displayId: 'screen-2', x: 102, y: -50, edge: 'left' }
    })
    expect(settings.colors).toEqual({ ...defaultCodexSettings().colors, healthy: '#00AA99' })
  })

  it('preserves explicit empty field selections and drops obsolete cap/retention settings', () => {
    const settings = normalizeCodexSettings({
      pendingRetention: '30m',
      maxTasksPerGroup: 1,
      compactFields: [],
      expandedFields: []
    })
    expect(settings).toMatchObject({ compactFields: [], expandedFields: [] })
    expect(settings).not.toHaveProperty('pendingRetention')
    expect(settings).not.toHaveProperty('maxTasksPerGroup')
    expect(normalizeCodexSettings({ compactFields: ['unknown'] }).compactFields).toEqual(defaultCodexSettings().compactFields)
  })

  it('migrates legacy colors and normalizes layered water appearance', () => {
    const settings = normalizeCodexSettings({
      colors: { healthy: '#00aa99', warning: '#dd9900', critical: '#dd3344', card: '#13243a' },
      waterAppearance: {
        inner: { palette: 'aurora', colorA: '#102c3c', colorB: '#0b6570', opacity: 120, amplitude: 2, motion: 'fast' },
        outer: { style: 'segmented', thickness: 9, colorMode: 'custom', progressColor: '#23b5a5', trackColor: '#718a94', glow: 'strong' }
      },
      expandedSizes: Array.from({ length: 10 }, (_, index) => ({ displayId: `display-${index}`, width: 400 + index, height: 500 + index, updatedAt: 100 + index }))
    })

    expect(settings.colors).toEqual({
      healthy: '#00AA99',
      warning: '#DD9900',
      critical: '#DD3344',
      water: '#13243A',
      card: '#F7F9F7'
    })
    expect(settings.waterAppearance).toMatchObject({
      inner: { palette: 'aurora', colorA: '#102C3C', colorB: '#0B6570', opacity: 95, amplitude: 4, motion: 'fast' },
      outer: { style: 'segmented', thickness: 6, colorMode: 'custom', progressColor: '#23B5A5', trackColor: '#718A94', glow: 'strong' }
    })
    expect(settings.expandedSizes).toHaveLength(8)
  })

  it('clamps quota percentages and keeps missing windows optional', () => {
    expect(normalizeCodexQuota({
      status: 'ok',
      plan: 'pro',
      short: { remainingPercent: 180, resetAt: 2000, windowMinutes: 300 },
      weekly: { remainingPercent: -5 }
    })).toMatchObject({
      status: 'ok',
      short: { remainingPercent: 100, resetAt: 2000, windowMinutes: 300 },
      weekly: { remainingPercent: 0, resetAt: null, windowMinutes: null }
    })
    expect(normalizeCodexQuota({ status: 'ok' }).short).toBeNull()
  })

  it('baselines historical completion and accepts completion older than later metadata', () => {
    const baseline = projectConversations({
      threads: [thread('notLoaded', 500, [], KEY, {
        lastTurnStatus: 'completed',
        lastTurnStartedAt: 300,
        lastTurnCompletedAt: 400
      })],
      receipts: [],
      lastTaskScanAt: 0,
      now: 600
    })

    expect(baseline.snapshot).toMatchObject({ version: 3, completedUnreadCount: 0, completedCount: 1 })
    expect(baseline.snapshot.completed[0]).toMatchObject({
      bucket: 'completed',
      completionRevision: 400,
      updatedAt: 500,
      lastQuestionAt: 300,
      archiveCapability: 'allowed'
    })
    expect(baseline.receipts[0]).toMatchObject({ acknowledgedRecency: 400 })
  })

  it('marks a newer persisted completion unread without comparing it to thread metadata recency', () => {
    const result = projectConversations({
      threads: [thread('notLoaded', 900, [], KEY, {
        lastTurnStatus: 'completed',
        lastTurnStartedAt: 700,
        lastTurnCompletedAt: 800
      })],
      receipts: [{ key: KEY, acknowledgedRecency: 400, acknowledgedAt: 450, pendingRecency: 0, pendingSince: 0 }],
      lastTaskScanAt: 600,
      now: 1_000
    })

    expect(result.snapshot.completedUnread[0]).toMatchObject({
      bucket: 'completed-unread',
      state: 'pending-review',
      completionRevision: 800,
      revisionAt: 800,
      updatedAt: 900
    })
    expect(result.snapshot.pending).toBe(result.snapshot.completedUnread)
  })

  it('keeps provider terminal and unknown states accurate while only active blocks archive', () => {
    const rows = [
      thread('active', 900, ['waitingOnUserInput'], keyAt(1), { lastTurnStatus: 'inProgress', lastTurnStartedAt: 800 }),
      thread('notLoaded', 800, [], keyAt(2), { lastTurnStatus: 'failed', lastTurnStartedAt: 700 }),
      thread('idle', 700, [], keyAt(3), { lastTurnStatus: 'interrupted', lastTurnStartedAt: 600 }),
      thread('systemError', 600, [], keyAt(4), { lastTurnStartedAt: 500 }),
      thread('notLoaded', 500, [], keyAt(5))
    ]
    const result = projectConversations({ threads: rows, receipts: [], lastTaskScanAt: 100, now: 1_000 })

    expect(result.snapshot.ongoing.map((task) => [task.key, task.activityState])).toEqual([
      [keyAt(1), 'waiting-input'],
      [keyAt(2), 'failed'],
      [keyAt(3), 'interrupted'],
      [keyAt(4), 'system-error'],
      [keyAt(5), 'unknown']
    ])
    expect(result.snapshot.ongoing.map((task) => task.archiveCapability)).toEqual([
      'blocked-active',
      'allowed',
      'allowed',
      'allowed-with-warning',
      'allowed-with-warning'
    ])
    expect(result.snapshot).toMatchObject({ ongoingCount: 1, waitingCount: 1, attentionCount: 3, unknownCount: 1 })
  })

  it('uses one stable comparator: last question, activity time, key', () => {
    const card = (overrides: Partial<CodexTaskCard>): CodexTaskCard => ({
      key: keyAt(10),
      actionAlias: 'alias',
      name: 'task',
      originalName: 'task',
      projectKey: 'chats',
      projectName: 'Chats',
      originalProjectName: 'Chats',
      projectKind: 'chats',
      isHidden: false,
      bucket: 'ongoing',
      activityState: 'unknown',
      archiveCapability: 'allowed-with-warning',
      revisionAt: 1,
      state: 'recent-activity',
      updatedAt: 1,
      ...overrides
    })
    const rows = [
      card({ key: keyAt(4), bucket: 'completed', lastQuestionAt: 900, updatedAt: 990 }),
      card({ key: keyAt(3), bucket: 'completed-unread', lastQuestionAt: 100, updatedAt: 500 }),
      card({ key: keyAt(2), bucket: 'ongoing', updatedAt: 999 }),
      card({ key: keyAt(1), bucket: 'ongoing', lastQuestionAt: 200, updatedAt: 300 }),
      card({ key: keyAt(0), bucket: 'ongoing', lastQuestionAt: 200, updatedAt: 300 })
    ].sort(compareConversationTasks)

    expect(rows.map((item) => item.key)).toEqual([keyAt(4), keyAt(0), keyAt(1), keyAt(3), keyAt(2)])
  })

  it('sorts every tab by latest Turn.startedAt and keeps missing question time last', () => {
    const hiddenOngoing = keyAt(1)
    const hiddenCompleted = keyAt(2)
    const result = projectConversations({
      threads: [
        thread('notLoaded', 800, [], keyAt(3), { lastTurnStatus: 'failed', lastTurnStartedAt: 500 }),
        thread('notLoaded', 900, [], keyAt(4), { lastTurnStatus: 'failed', lastTurnStartedAt: 700 }),
        thread('notLoaded', 950, [], keyAt(5), { lastTurnStatus: 'failed' }),
        thread('notLoaded', 600, [], hiddenOngoing, { lastTurnStatus: 'failed', lastTurnStartedAt: 300 }),
        thread('notLoaded', 700, [], hiddenCompleted, { lastTurnStatus: 'completed', lastTurnStartedAt: 650, lastTurnCompletedAt: 680 })
      ],
      receipts: [
        { key: hiddenOngoing, acknowledgedRecency: 0, acknowledgedAt: 0, pendingRecency: 0, pendingSince: 0, dismissedActivityRecency: 600, dismissedAt: 610 },
        { key: hiddenCompleted, acknowledgedRecency: 680, acknowledgedAt: 690, pendingRecency: 0, pendingSince: 0, dismissedActivityRecency: 680, dismissedAt: 690 }
      ],
      lastTaskScanAt: 100,
      now: 1_000
    })

    expect(result.snapshot.ongoing.map((task) => task.key)).toEqual([keyAt(4), keyAt(3), keyAt(5)])
    expect(result.snapshot.hidden.map((task) => [task.key, task.bucket])).toEqual([
      [hiddenCompleted, 'completed'],
      [hiddenOngoing, 'ongoing']
    ])
  })

  it('treats hide on completed-unread as viewed, restores it as completed, and unhides a new completion', () => {
    const unread = projectConversations({
      threads: [thread('notLoaded', 220, [], KEY, { lastTurnStatus: 'completed', lastTurnStartedAt: 180, lastTurnCompletedAt: 200 })],
      receipts: [],
      lastTaskScanAt: 100,
      now: 230
    })
    expect(unread.snapshot.completedUnread).toHaveLength(1)

    const hiddenReceipts = hideCodexThread(unread.receipts, KEY, 200, 'completed-unread', 240)
    const hidden = projectConversations({
      threads: [thread('notLoaded', 220, [], KEY, { lastTurnStatus: 'completed', lastTurnStartedAt: 180, lastTurnCompletedAt: 200 })],
      receipts: hiddenReceipts,
      lastTaskScanAt: unread.lastTaskScanAt,
      now: 250
    })
    expect(hidden.snapshot.hidden[0]).toMatchObject({ bucket: 'completed', hiddenKind: 'task' })
    expect(hidden.receipts[0]).toMatchObject({ acknowledgedRecency: 200, dismissedActivityRecency: 200, pendingRecency: 0 })

    const restoredReceipts = restoreCodexThread(hidden.receipts, KEY, 200, 'task')
    const restored = projectConversations({
      threads: [thread('notLoaded', 220, [], KEY, { lastTurnStatus: 'completed', lastTurnStartedAt: 180, lastTurnCompletedAt: 200 })],
      receipts: restoredReceipts,
      lastTaskScanAt: hidden.lastTaskScanAt,
      now: 260
    })
    expect(restored.snapshot.completed[0]).toMatchObject({ bucket: 'completed' })

    const newer = projectConversations({
      threads: [thread('notLoaded', 340, [], KEY, { lastTurnStatus: 'completed', lastTurnStartedAt: 280, lastTurnCompletedAt: 320 })],
      receipts: hidden.receipts,
      lastTaskScanAt: hidden.lastTaskScanAt,
      now: 350
    })
    expect(newer.snapshot.completedUnread[0]).toMatchObject({ completionRevision: 320 })
    expect(newer.snapshot.hidden).toHaveLength(0)
  })

  it('migrates legacy unread, hidden-confirmed and acknowledged completion receipts', () => {
    const unreadKey = keyAt(11)
    const hiddenKey = keyAt(12)
    const acknowledgedKey = keyAt(13)
    const completedThread = (key: string) => thread('notLoaded', 120, [], key, {
      lastTurnStatus: 'completed',
      lastTurnStartedAt: 80,
      lastTurnCompletedAt: 100
    })
    const result = projectConversations({
      threads: [completedThread(unreadKey), completedThread(hiddenKey), completedThread(acknowledgedKey)],
      receipts: [
        { key: unreadKey, acknowledgedRecency: 0, acknowledgedAt: 0, pendingRecency: 100, pendingSince: 90, pendingMode: 'completion' },
        { key: hiddenKey, acknowledgedRecency: 0, acknowledgedAt: 0, pendingRecency: 100, pendingSince: 90, pendingMode: 'completion', hiddenPendingRecency: 100, hiddenPendingAt: 95 },
        { key: acknowledgedKey, acknowledgedRecency: 100, acknowledgedAt: 100, pendingRecency: 0, pendingSince: 0 }
      ],
      lastTaskScanAt: 0,
      now: 200
    })

    expect(result.snapshot.completedUnread.map((task) => task.key)).toEqual([unreadKey])
    expect(result.snapshot.hidden[0]).toMatchObject({ key: hiddenKey, bucket: 'completed' })
    expect(result.snapshot.completed.map((task) => task.key)).toEqual([acknowledgedKey])
  })

  it('never creates receipt-only or archived recovery placeholders', () => {
    const receipt = { key: KEY, acknowledgedRecency: 0, acknowledgedAt: 0, pendingRecency: 100, pendingSince: 90, pendingMode: 'completion' as const }
    expect(conversationSnapshotFromReceipts([receipt], 'stale')).toMatchObject({
      ongoing: [],
      completedUnread: [],
      completed: [],
      hidden: []
    })

    const projected = projectConversations({
      threads: [],
      receipts: [receipt],
      recoveredPending: [{
        key: KEY,
        actionAlias: 'legacy-alias',
        name: '已归档任务',
        updatedAt: 100,
        lastTurnCompletedAt: 100,
        source: 'archived'
      }],
      pendingRecoveryStatus: 'complete',
      lastTaskScanAt: 50,
      now: 200
    })
    expect(projected.snapshot).toMatchObject({ ongoing: [], completedUnread: [], completed: [], hidden: [], pendingRecoveredCount: 0 })
  })

  it('projects all 100 current rows without truncation', () => {
    const threads = Array.from({ length: 100 }, (_, index) => thread(
      'notLoaded',
      10_000 + index,
      [],
      keyAt(index + 100),
      { lastTurnStatus: 'failed', lastTurnStartedAt: 5_000 + index }
    ))
    const result = projectConversations({ threads, receipts: [], lastTaskScanAt: 1, now: 20_000 })
    expect(result.snapshot.ongoing).toHaveLength(100)
    expect(result.snapshot.sourceCount).toBe(100)
    expect(new Set(result.snapshot.ongoing.map((task) => task.key)).size).toBe(100)
  })

  it('includes the rolling-day boundary and excludes older or timestamp-less conversations', () => {
    const day = 24 * 60 * 60 * 1000
    const now = 100 * day
    const boundary = now - 30 * day
    const result = projectConversations({
      threads: [
        thread('notLoaded', boundary + 10, [], keyAt(21), { lastTurnStatus: 'failed', lastTurnStartedAt: boundary }),
        thread('notLoaded', boundary + 9, [], keyAt(22), { lastTurnStatus: 'failed', lastTurnStartedAt: boundary - 1 }),
        thread('notLoaded', now, [], keyAt(23), { lastTurnStatus: 'failed' })
      ],
      receipts: [],
      lastTaskScanAt: 1,
      timeWindowDays: 30,
      now
    })

    expect(result.snapshot.all.map((task) => task.key)).toEqual([keyAt(21)])
  })

  it('builds Pinned, Projects and Chats in native order without duplicating locally pinned tasks', () => {
    const projectA = keyAt(31)
    const projectB = keyAt(32)
    const projectC = keyAt(33)
    const pinnedTask = keyAt(41)
    const localTask = keyAt(42)
    const projectBTask = keyAt(43)
    const chatTask = keyAt(44)
    const projectThread = (key: string, projectKey: string, projectName: string, startedAt: number, nativePinned = false) => ({
      ...thread('notLoaded', startedAt + 10, [], key, { lastTurnStatus: 'failed', lastTurnStartedAt: startedAt }),
      projectKey,
      projectName,
      projectKind: 'project' as const,
      nativePinned,
      ...(nativePinned ? { nativePinnedOrder: 0 } : {})
    })
    const result = projectConversations({
      threads: [
        projectThread(pinnedTask, projectA, 'Project A', 900, true),
        projectThread(localTask, projectA, 'Project A', 800),
        projectThread(projectBTask, projectB, 'Project B', 700),
        { ...thread('notLoaded', 610, [], chatTask, { lastTurnStatus: 'failed', lastTurnStartedAt: 600 }), projectKey: 'chats', projectName: 'Chats', projectKind: 'chats' as const }
      ],
      projects: [
        { key: projectA, name: 'Project A', kind: 'project', nativePinned: false, nativeOrder: 0 },
        { key: projectB, name: 'Project B', kind: 'project', nativePinned: true, nativePinnedOrder: 0, nativeOrder: 1 },
        { key: projectC, name: 'Project C', kind: 'project', nativePinned: false, nativeOrder: 2 },
        { key: 'chats', name: 'Chats', kind: 'chats', nativePinned: false }
      ],
      receipts: [],
      lastTaskScanAt: 1,
      now: 1_000,
      taskAliases: [{ key: localTask, alias: '本地任务别名' }],
      projectAliases: [{ key: projectA, alias: '项目甲' }],
      localPins: [{ kind: 'project', key: projectC }, { kind: 'task', key: localTask }]
    })
    const [pinned, projects, chats] = result.snapshot.projectSections

    expect(pinned.entries.map((entry) => entry.kind === 'task' ? `task:${entry.task.key}` : `project:${entry.project.key}`)).toEqual([
      `task:${pinnedTask}`,
      `project:${projectB}`,
      `project:${projectC}`,
      `task:${localTask}`
    ])
    expect(projects.entries.map((entry) => entry.kind === 'project' ? [entry.project.key, entry.project.name, entry.project.tasks.length] : null)).toEqual([
      [projectA, '项目甲', 0]
    ])
    expect(chats.entries[0]).toMatchObject({ kind: 'project', project: { key: 'chats', tasks: [{ key: chatTask }] } })
    const renderedTaskKeys = result.snapshot.projectSections.flatMap((section) => section.entries.flatMap((entry) =>
      entry.kind === 'task' ? [entry.task.key] : entry.project.tasks.map((task) => task.key)
    ))
    expect(renderedTaskKeys).toHaveLength(4)
    expect(new Set(renderedTaskKeys).size).toBe(4)
    expect(result.snapshot.all.find((task) => task.key === localTask)).toMatchObject({ name: '本地任务别名', originalName: `任务 ${localTask.slice(-2)}` })
  })

  it('migrates and bounds privacy-safe Codex UI metadata without retaining raw ids or paths', () => {
    const taskKey = keyAt(51)
    const projectKey = keyAt(52)
    const state = normalizeCodexState({
      settings: { timeWindowDays: 999 },
      lastTaskTab: 'projects',
      collapsedProjectKeys: [projectKey, '/private/project', projectKey],
      taskAliases: [{ key: taskKey, alias: `  ${'a'.repeat(140)}  ` }, { key: 'raw-thread-id-with-hyphens', alias: 'reject' }],
      projectAliases: [{ key: projectKey, alias: '项目别名' }, { key: '/private/project', alias: 'reject' }],
      localPins: [{ kind: 'task', key: taskKey }, { kind: 'task', key: taskKey }, { kind: 'project', key: projectKey }],
      removedProjectKeys: [projectKey, 'chats', '/private/project'],
      removedProjectAbsentKeys: [projectKey]
    })

    expect(state.settings.timeWindowDays).toBe(365)
    expect(state.lastTaskTab).toBe('projects')
    expect(state.collapsedProjectKeys).toEqual([projectKey])
    expect(state.taskAliases).toEqual([{ key: taskKey, alias: 'a'.repeat(120) }])
    expect(state.projectAliases).toEqual([{ key: projectKey, alias: '项目别名' }])
    expect(state.localPins).toEqual([{ kind: 'task', key: taskKey }, { kind: 'project', key: projectKey }])
    expect(state.removedProjectKeys).toEqual([projectKey])
    expect(JSON.stringify(state)).not.toContain('/private/project')
    expect(normalizeCodexState({}).lastTaskTab).toBe('ongoing')
  })

  it('projects timing without treating failed/interrupted timestamps as completion', () => {
    const result = projectConversations({
      threads: [thread('notLoaded', 200_000, [], KEY, {
        createdAt: 50_000,
        firstPromptAt: 60_000,
        lastTurnStatus: 'interrupted',
        lastTurnStartedAt: 180_000,
        lastTurnCompletedAt: 190_000
      })],
      receipts: [],
      lastTaskScanAt: 100_000,
      now: 210_000
    })

    expect(result.snapshot.ongoing[0]).toMatchObject({
      activityState: 'interrupted',
      createdAt: 50_000,
      firstPromptAt: 60_000,
      lastQuestionAt: 180_000
    })
    expect(result.snapshot.ongoing[0]).not.toHaveProperty('lastTurnCompletedAt')
  })
})
