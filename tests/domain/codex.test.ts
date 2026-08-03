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
import { projectCodexDynamicStatus } from '../../src/domain/codexPresentation'

const KEY = '0123456789abcdef'
const keyAt = (index: number) => index.toString(16).padStart(16, '0')

function thread(
  status: CodexHostThread['status'],
  updatedAt: number,
  activeFlags: CodexHostThread['activeFlags'] = [],
  key = KEY,
  evidence: Partial<Pick<CodexHostThread, 'createdAt' | 'firstPromptAt' | 'lastTurnStatus' | 'lastTurnStartedAt' | 'lastTurnCompletedAt' | 'lastTurnEvidence' | 'statusAuthority' | 'activityEvidence' | 'activityRevision' | 'desktopActiveSince' | 'hasUnreadTurn' | 'unreadAuthority' | 'planImplementationOnly'>> = {}
): CodexHostThread {
  return {
    key,
    actionAlias: `alias-${key}`,
    name: `任务 ${key.slice(-2)}`,
    status,
    activeFlags,
    statusAuthority: 'desktop-live',
    hasUnreadTurn: false,
    unreadAuthority: 'desktop-persisted',
    updatedAt,
    ...evidence
  }
}

describe('Codex domain', () => {
  it('normalizes configurable display, refresh and privacy-safe storage fields', () => {
    const settings = normalizeCodexSettings({
      floatEnabled: true,
      displayStyle: 'card',
      quotaRefreshSeconds: 7,
      taskRefreshSeconds: 23,
      dynamicTaskWindowHours: 48,
      compactFields: ['weekly', 'tasks', 'unknown'],
      expandedFields: ['tasks', 'config'],
      colors: { healthy: '#00aa99', warning: 'invalid' },
      position: { displayId: 'screen-2', x: 101.6, y: -50.2, edge: 'left' }
    })

    expect(settings).toMatchObject({
      floatEnabled: true,
      displayStyle: 'card',
      quotaRefreshSeconds: 7,
      taskRefreshSeconds: 23,
      dynamicTaskWindowHours: 48,
      compactFields: ['weekly', 'tasks'],
      expandedFields: ['tasks', 'config'],
      position: { displayId: 'screen-2', x: 102, y: -50, edge: 'left' }
    })
    expect(settings.colors).toEqual({ ...defaultCodexSettings().colors, healthy: '#00aa99', warning: 'invalid' })
  })

  it('normalizes custom second refresh intervals and migrates the legacy minute field', () => {
    expect(defaultCodexSettings()).toMatchObject({ quotaRefreshSeconds: 300, taskRefreshSeconds: 15 })
    expect(normalizeCodexSettings({ quotaRefreshMinutes: 10 }).quotaRefreshSeconds).toBe(600)
    expect(normalizeCodexSettings({ quotaRefreshMinutes: 0 }).quotaRefreshSeconds).toBe(0)
    expect(normalizeCodexSettings({ quotaRefreshSeconds: 1.6, taskRefreshSeconds: 2.4 })).toMatchObject({
      quotaRefreshSeconds: 2,
      taskRefreshSeconds: 2
    })
    expect(normalizeCodexSettings({ quotaRefreshSeconds: -1, taskRefreshSeconds: -1 })).toMatchObject({
      quotaRefreshSeconds: 0,
      taskRefreshSeconds: 0
    })
    expect(normalizeCodexSettings({ quotaRefreshSeconds: 999_999, taskRefreshSeconds: 999_999 })).toMatchObject({
      quotaRefreshSeconds: 86_400,
      taskRefreshSeconds: 86_400
    })
  })

  it('defaults the dynamic task window to 24 hours and bounds persisted edits', () => {
    expect(defaultCodexSettings().dynamicTaskWindowHours).toBe(24)
    expect(normalizeCodexSettings({ dynamicTaskWindowHours: 0 }).dynamicTaskWindowHours).toBe(1)
    expect(normalizeCodexSettings({ dynamicTaskWindowHours: 999_999 }).dynamicTaskWindowHours).toBe(365 * 24)
    expect(normalizeCodexSettings({ dynamicTaskWindowHours: 'invalid' }).dynamicTaskWindowHours).toBe(24)
  })

  it('preserves explicit empty field selections and drops obsolete cap/retention settings', () => {
    const settings = normalizeCodexSettings({
      pendingRetention: '30m',
      maxTasksPerGroup: 1,
      completionPresentationDelayMs: 1500,
      compactFields: [],
      expandedFields: []
    })
    expect(settings).toMatchObject({ compactFields: [], expandedFields: [] })
    expect(settings).not.toHaveProperty('pendingRetention')
    expect(settings).not.toHaveProperty('maxTasksPerGroup')
    expect(settings).not.toHaveProperty('completionPresentationDelayMs')
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
      healthy: '#00aa99',
      warning: '#dd9900',
      critical: '#dd3344',
      water: '#13243a',
      card: '#13243a',
      cardForeground: '#07161D'
    })
    expect(settings.waterAppearance).toMatchObject({
      inner: { palette: 'aurora', fillColorA: '#102c3c', fillColorB: '#0b6570', opacity: 95, amplitude: 4, motion: 'fast' },
      outer: { style: 'segmented', thickness: 6, colorMode: 'custom', progressColor: '#23b5a5', trackColor: '#718a94', glow: 'strong' }
    })
    expect(settings.expandedSizes).toHaveLength(8)
  })

  it('uses the configured default when a card foreground is missing', () => {
    expect(normalizeCodexSettings({
      colors: { ...defaultCodexSettings().colors, card: '#20252A', cardForeground: undefined }
    }).colors).toMatchObject({ card: '#20252A', cardForeground: '#07161D' })

    expect(normalizeCodexSettings({
      colors: { ...defaultCodexSettings().colors, card: '#F7F9F7', cardForeground: undefined }
    }).colors).toMatchObject({ card: '#F7F9F7', cardForeground: '#07161D' })
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
    expect(baseline.receipts).toEqual([])
  })

  it('lets a newer completed Turn supersede an older Desktop active observation', () => {
    const result = projectConversations({
      threads: [thread('active', 600, [], KEY, {
        desktopActiveSince: 200,
        lastTurnStatus: 'completed',
        lastTurnStartedAt: 400,
        lastTurnCompletedAt: 500,
        lastTurnEvidence: 'snapshot-corroborated'
      })],
      receipts: [],
      lastTaskScanAt: 0,
      now: 600
    })

    expect(result.snapshot).toMatchObject({ ongoingCount: 0, completedCount: 1 })
    expect(result.snapshot.completed[0]).toMatchObject({ key: KEY, completionRevision: 500, archiveCapability: 'allowed' })
  })

  it('rejects a reminted Desktop active interval that only revives after an already completed Turn', () => {
    const revived = projectConversations({
      threads: [thread('active', 900, [], KEY, {
        desktopActiveSince: 850,
        lastTurnStatus: 'completed',
        lastTurnStartedAt: 400,
        lastTurnCompletedAt: 500,
        lastTurnEvidence: 'turn-completed'
      })],
      receipts: [],
      lastTaskScanAt: 0,
      now: 900
    })
    expect(revived.snapshot).toMatchObject({ ongoingCount: 0, completedCount: 1 })

    const waiting = projectConversations({
      threads: [thread('active', 900, ['waitingOnUserInput'], KEY, {
        desktopActiveSince: 850,
        planImplementationOnly: true,
        lastTurnStatus: 'completed',
        lastTurnStartedAt: 400,
        lastTurnCompletedAt: 500,
        lastTurnEvidence: 'turn-completed'
      })],
      receipts: [],
      lastTaskScanAt: 0,
      now: 900
    })
    expect(waiting.snapshot.ongoing[0]).toMatchObject({ key: KEY, activityState: 'waiting-input', planImplementationOnly: true })
  })

  it('lets a verified persisted Plan wait outrank completed unread without live authority', () => {
    const result = projectConversations({
      threads: [thread('active', 900, ['waitingOnUserInput'], KEY, {
        statusAuthority: 'connector',
        planImplementationOnly: true,
        hasUnreadTurn: true,
        unreadAuthority: 'desktop-persisted',
        lastTurnStatus: 'completed',
        lastTurnStartedAt: 400,
        lastTurnCompletedAt: 500,
        lastTurnEvidence: 'inventory'
      })],
      receipts: [],
      lastTaskScanAt: 0,
      now: 900
    })

    expect(result.snapshot).toMatchObject({
      ongoingCount: 1,
      inputRequiredCount: 1,
      completedUnreadCount: 0,
      completedCount: 0
    })
    expect(result.snapshot.ongoing[0]).toMatchObject({
      key: KEY,
      bucket: 'ongoing',
      activityState: 'waiting-input',
      planImplementationOnly: true,
      archiveCapability: 'blocked-active'
    })
  })

  it('lets a real activity patch start a new epoch while exact completion still closes it immediately', () => {
    const active = projectConversations({
      threads: [thread('active', 900, [], KEY, {
        activityEvidence: 'activity-event',
        activityRevision: 8,
        lastTurnStatus: 'completed',
        lastTurnStartedAt: 400,
        lastTurnCompletedAt: 500
      })],
      receipts: [],
      lastTaskScanAt: 0,
      now: 900
    })
    expect(active.snapshot.ongoing[0]).toMatchObject({ key: KEY, activityState: 'active' })

    const completed = projectConversations({
      threads: [thread('active', 901, [], KEY, {
        activityEvidence: 'activity-event',
        activityRevision: 8,
        lastTurnStatus: 'completed',
        lastTurnStartedAt: 400,
        lastTurnCompletedAt: 500,
        lastTurnEvidence: 'turn-completed'
      })],
      receipts: [],
      lastTaskScanAt: 0,
      now: 901
    })
    expect(completed.snapshot.completed[0]).toMatchObject({ key: KEY, completionRevision: 500 })
  })

  it('marks a newer persisted completion unread without comparing it to thread metadata recency', () => {
    const result = projectConversations({
      threads: [thread('notLoaded', 900, [], KEY, {
        lastTurnStatus: 'completed',
        lastTurnStartedAt: 700,
        lastTurnCompletedAt: 800,
        hasUnreadTurn: true
      })],
      receipts: [{
        key: KEY,
        acknowledgedRecency: 400,
        acknowledgedAt: 450,
        pendingRecency: 0,
        pendingSince: 0,
        // Legacy EyPc-only acknowledgement must not suppress a Codex-owned
        // unread=true observation for the same completion revision.
        completedUnreadAcknowledgedRevision: 800,
        completedUnreadAcknowledgedAt: 850
      }],
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

  it('keeps unconfirmed abnormalities ongoing but separates an explicitly stopped Turn', () => {
    const rows = [
      thread('active', 900, ['waitingOnUserInput'], keyAt(1), { lastTurnStatus: 'inProgress', lastTurnStartedAt: 800 }),
      thread('notLoaded', 800, [], keyAt(2), { lastTurnStatus: 'failed', lastTurnStartedAt: 700 }),
      thread('idle', 700, [], keyAt(3), { lastTurnStatus: 'interrupted', lastTurnStartedAt: 600 }),
      thread('systemError', 600, [], keyAt(4), { lastTurnStartedAt: 500 }),
      thread('notLoaded', 500, [], keyAt(5), { lastTurnStartedAt: 400 })
    ]
    const result = projectConversations({ threads: rows, receipts: [], lastTaskScanAt: 100, now: 1_000 })

    expect(result.snapshot.ongoing.map((task) => [task.key, task.activityState])).toEqual([
      [keyAt(1), 'waiting-input'],
      [keyAt(2), 'ongoing'],
      [keyAt(4), 'ongoing'],
      [keyAt(5), 'ongoing']
    ])
    expect(result.snapshot.ongoing.map((task) => task.archiveCapability)).toEqual([
      'blocked-active',
      'blocked-active',
      'blocked-active',
      'blocked-active'
    ])
    expect(result.snapshot.stopped[0]).toMatchObject({
      key: keyAt(3),
      bucket: 'stopped',
      activityState: 'stopped',
      state: 'stopped',
      archiveCapability: 'blocked-stopped',
      canArchive: false,
      revisionAt: 600
    })
    expect(result.snapshot).toMatchObject({ ongoingCount: 4, stoppedCount: 1, waitingCount: 1, runningCount: 0, attentionCount: 0, unknownCount: 0 })
  })

  it.each([
    { name: 'exact active beats interrupted', status: 'active', flags: [], authority: 'desktop-live', turn: 'interrupted', evidence: 'inventory', bucket: 'ongoing', activity: 'active', archive: 'blocked-active' },
    { name: 'initial active conflict stays ongoing', status: 'notLoaded', flags: [], authority: 'desktop-live', turn: 'failed', evidence: 'targeted-after-exit', bucket: 'ongoing', activity: 'ongoing', archive: 'blocked-active' },
    { name: 'uncertain terminal stays ongoing', status: 'notLoaded', flags: [], authority: 'connector', turn: 'interrupted', evidence: 'inventory', bucket: 'ongoing', activity: 'ongoing', archive: 'blocked-active' },
    { name: 'exact idle plus failure is stopped', status: 'idle', flags: [], authority: 'desktop-live', turn: 'failed', evidence: 'targeted-after-exit', bucket: 'stopped', activity: 'stopped', archive: 'blocked-stopped' },
    { name: 'plain completed shape cannot beat active', status: 'active', flags: [], authority: 'desktop-live', turn: 'completed', evidence: 'inventory', bucket: 'ongoing', activity: 'active', archive: 'blocked-active' },
    { name: 'confirmed completion can close stale active', status: 'active', flags: [], authority: 'desktop-live', turn: 'completed', evidence: 'turn-completed', bucket: 'completed', activity: 'ongoing', archive: 'allowed' },
    { name: 'waiting still beats confirmed completion', status: 'active', flags: ['waitingOnUserInput'], authority: 'desktop-live', turn: 'completed', evidence: 'turn-completed', bucket: 'ongoing', activity: 'waiting-input', archive: 'blocked-active' }
  ])('$name', ({ status, flags, authority, turn: turnStatus, evidence, bucket, activity, archive }) => {
    const result = projectConversations({
      threads: [thread(
        status as CodexHostThread['status'],
        1_000,
        flags as CodexHostThread['activeFlags'],
        keyAt(9),
        {
          statusAuthority: authority as CodexHostThread['statusAuthority'],
          lastTurnStatus: turnStatus as CodexHostThread['lastTurnStatus'],
          lastTurnStartedAt: 900,
          ...(turnStatus === 'completed' ? { lastTurnCompletedAt: 950 } : {}),
          lastTurnEvidence: evidence as CodexHostThread['lastTurnEvidence']
        }
      )],
      receipts: [],
      lastTaskScanAt: 800,
      now: 1_100,
      desktopBridgeState: 'connected'
    })
    const projected = [
      ...result.snapshot.ongoing,
      ...result.snapshot.stopped,
      ...result.snapshot.completedUnread,
      ...result.snapshot.completed
    ].find((task) => task.key === keyAt(9))
    expect(projected).toMatchObject({ bucket, activityState: activity, archiveCapability: archive })
  })

  it('requires exact live-idle or desktop-exit evidence before a failed/interrupted Turn is stopped', () => {
    const live = projectConversations({
      threads: [
        thread('active', 1_000, [], keyAt(1), { lastTurnStatus: 'interrupted', lastTurnStartedAt: 900 }),
        thread('idle', 900, [], keyAt(2), { lastTurnStatus: 'failed', lastTurnStartedAt: 800 }),
        thread('idle', 850, [], keyAt(4), { lastTurnStartedAt: 750 })
      ],
      receipts: [],
      lastTaskScanAt: 700,
      now: 1_100,
      desktopBridgeState: 'connected'
    })
    expect(live.snapshot.ongoing.map((task) => task.key)).toEqual([keyAt(1), keyAt(4)])
    expect(live.snapshot.stopped.map((task) => task.key)).toEqual([keyAt(2)])

    const uncertain = projectConversations({
      threads: [thread('notLoaded', 900, [], keyAt(3), { statusAuthority: 'connector', lastTurnStatus: 'interrupted', lastTurnStartedAt: 800 })],
      receipts: [],
      lastTaskScanAt: 700,
      now: 1_100,
      desktopBridgeState: 'failed'
    })
    expect(uncertain.snapshot).toMatchObject({ ongoingCount: 1, stoppedCount: 0 })
    expect(projectCodexDynamicStatus(uncertain.snapshot, 1_100)).toMatchObject({
      compactCounts: { active: 1 },
      groups: { active: [{ key: keyAt(3) }], stopped: [] }
    })

    const connectedUncertain = projectConversations({
      threads: [thread('notLoaded', 900, [], keyAt(3), { statusAuthority: 'connector', lastTurnStatus: 'interrupted', lastTurnStartedAt: 800 })],
      receipts: [],
      lastTaskScanAt: 700,
      now: 1_100,
      desktopBridgeState: 'connected'
    })
    expect(connectedUncertain.snapshot).toMatchObject({ ongoingCount: 1, stoppedCount: 0, runningCount: 0 })

    const exited = projectConversations({
      threads: [
        thread('notLoaded', 900, [], keyAt(3), { statusAuthority: 'connector', lastTurnStatus: 'interrupted', lastTurnStartedAt: 800 }),
        thread('notLoaded', 850, [], keyAt(4), { statusAuthority: 'connector', lastTurnStartedAt: 750 })
      ],
      receipts: [],
      lastTaskScanAt: 700,
      now: 1_100,
      desktopBridgeState: 'not-running'
    })
    expect(exited.snapshot).toMatchObject({ ongoingCount: 1, stoppedCount: 1 })
    expect(exited.snapshot.ongoing[0]).toMatchObject({ key: keyAt(4), activityState: 'ongoing' })
    expect(projectCodexDynamicStatus(exited.snapshot, 1_100)).toMatchObject({
      compactCounts: { active: 1 },
      groups: { active: [{ key: keyAt(4) }], stopped: [{ key: keyAt(3) }] }
    })
  })

  it('keeps an interrupted revision ongoing when a fresh App Server event says the task is active', () => {
    const result = projectConversations({
      threads: [thread('active', 1_000, [], KEY, {
        statusAuthority: 'app-server-live',
        activityEvidence: 'activity-event',
        lastTurnStatus: 'interrupted',
        lastTurnStartedAt: 900
      })],
      receipts: [],
      lastTaskScanAt: 700,
      now: 1_100,
      desktopBridgeState: 'connected'
    })

    expect(result.snapshot).toMatchObject({ ongoingCount: 1, stoppedCount: 0, runningCount: 1 })
    expect(result.snapshot.ongoing[0]).toMatchObject({
      key: KEY,
      bucket: 'ongoing',
      activityState: 'active',
      state: 'running'
    })
  })

  it('does not promote connector or persisted-turn heuristics without a live active event', () => {
    const result = projectConversations({
      threads: [
        thread('active', 900, ['waitingOnUserInput'], KEY, { statusAuthority: 'connector', lastTurnStatus: 'inProgress', lastTurnStartedAt: 800 }),
        thread('notLoaded', 850, [], keyAt(2), { lastTurnStatus: 'inProgress', lastTurnStartedAt: 750 })
      ],
      receipts: [],
      lastTaskScanAt: 700,
      now: 1_000
    })

    expect(result.snapshot.inputRequired).toEqual([])
    expect(result.snapshot.ongoing.map((task) => [task.key, task.activityState])).toEqual([
      [KEY, 'ongoing'],
      [keyAt(2), 'ongoing']
    ])
    expect(result.snapshot).toMatchObject({ ongoingCount: 2, waitingCount: 0, runningCount: 0, unknownCount: 0 })
  })

  it('promotes only provenance-marked persisted input decisions without widening plain connector hints', () => {
    const result = projectConversations({
      threads: [
        thread('active', 900, ['waitingOnUserInput'], KEY, {
          statusAuthority: 'persisted-decision',
          lastTurnStatus: 'interrupted',
          lastTurnStartedAt: 800
        }),
        thread('active', 850, ['waitingOnUserInput'], keyAt(2), {
          statusAuthority: 'connector',
          lastTurnStatus: 'inProgress',
          lastTurnStartedAt: 750
        })
      ],
      receipts: [],
      lastTaskScanAt: 700,
      now: 1_000
    })

    expect(result.snapshot.inputRequired).toHaveLength(1)
    expect(result.snapshot.inputRequired[0]).toMatchObject({
      key: KEY,
      bucket: 'ongoing',
      activityState: 'waiting-input',
      archiveCapability: 'blocked-active'
    })
    expect(result.snapshot.ongoing.find((task) => task.key === keyAt(2))).toMatchObject({
      activityState: 'ongoing'
    })
    expect(result.snapshot).toMatchObject({ ongoingCount: 2, waitingCount: 1, runningCount: 0 })
  })

  it('uses desktop live state immediately and removes active classification as soon as that authority is lost', () => {
    const baseline = projectConversations({
      threads: [thread('active', 10_000, [], KEY, { lastTurnStatus: 'inProgress', lastTurnStartedAt: 9_900 })],
      receipts: [],
      lastTaskScanAt: 9_000,
      now: 10_000
    })

    const result = projectConversations({
      threads: [thread('active', 10_300, [], KEY, { statusAuthority: 'connector', lastTurnStatus: 'inProgress', lastTurnStartedAt: 10_100 })],
      receipts: [],
      lastTaskScanAt: 9_000,
      now: 10_301,
      previousStatuses: baseline.statuses
    })

    expect(result.snapshot.ongoing).toHaveLength(1)
    expect(result.snapshot.ongoing[0]).toMatchObject({ key: KEY, activityState: 'ongoing', state: 'running' })
    expect(result.snapshot.ongoingCount).toBe(1)
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
      activityState: 'ongoing',
      archiveCapability: 'blocked-active',
      revisionAt: 1,
      state: 'running',
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

  it('sorts every tab by latest Turn.startedAt and excludes rows without a Turn revision', () => {
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

    expect(result.snapshot.ongoing.map((task) => task.key)).toEqual([keyAt(4), keyAt(3)])
    expect(result.snapshot.hidden.map((task) => [task.key, task.bucket])).toEqual([
      [hiddenCompleted, 'completed'],
      [hiddenOngoing, 'ongoing']
    ])
  })

  it('keeps Codex unread authoritative across hide/restore and unhides a new completion', () => {
    const unread = projectConversations({
      threads: [thread('notLoaded', 220, [], KEY, { lastTurnStatus: 'completed', lastTurnStartedAt: 180, lastTurnCompletedAt: 200, hasUnreadTurn: true })],
      receipts: [],
      lastTaskScanAt: 100,
      now: 230
    })
    expect(unread.snapshot.completedUnread).toHaveLength(1)

    const hiddenReceipts = hideCodexThread(unread.receipts, KEY, 200, 'completed-unread', 240)
    const hidden = projectConversations({
      threads: [thread('notLoaded', 220, [], KEY, { lastTurnStatus: 'completed', lastTurnStartedAt: 180, lastTurnCompletedAt: 200, hasUnreadTurn: true })],
      receipts: hiddenReceipts,
      lastTaskScanAt: unread.lastTaskScanAt,
      now: 250
    })
    expect(hidden.snapshot.hidden[0]).toMatchObject({ bucket: 'completed-unread', hiddenKind: 'task', unreadState: 'unread' })
    expect(hidden.snapshot.completedUnreadCount).toBe(1)
    expect(hidden.receipts[0]).toMatchObject({ dismissedActivityRecency: 200, pendingRecency: 0 })

    const restoredReceipts = restoreCodexThread(hidden.receipts, KEY, 200, 'task')
    const restored = projectConversations({
      threads: [thread('notLoaded', 220, [], KEY, { lastTurnStatus: 'completed', lastTurnStartedAt: 180, lastTurnCompletedAt: 200, hasUnreadTurn: true })],
      receipts: restoredReceipts,
      lastTaskScanAt: hidden.lastTaskScanAt,
      now: 260
    })
    expect(restored.snapshot.completedUnread[0]).toMatchObject({ bucket: 'completed-unread', unreadState: 'unread' })

    const newer = projectConversations({
      threads: [thread('notLoaded', 340, [], KEY, { lastTurnStatus: 'completed', lastTurnStartedAt: 280, lastTurnCompletedAt: 320, hasUnreadTurn: true })],
      receipts: hidden.receipts,
      lastTaskScanAt: hidden.lastTaskScanAt,
      now: 350
    })
    expect(newer.snapshot.completedUnread[0]).toMatchObject({ completionRevision: 320 })
    expect(newer.snapshot.hidden).toHaveLength(0)
  })

  it('uses desktop unread authority while migrating legacy hidden and pending receipt fields', () => {
    const unreadKey = keyAt(11)
    const hiddenKey = keyAt(12)
    const acknowledgedKey = keyAt(13)
    const completedThread = (key: string, hasUnreadTurn = false) => thread('notLoaded', 120, [], key, {
      lastTurnStatus: 'completed',
      lastTurnStartedAt: 80,
      lastTurnCompletedAt: 100,
      hasUnreadTurn
    })
    const result = projectConversations({
      threads: [completedThread(unreadKey, true), completedThread(hiddenKey), completedThread(acknowledgedKey)],
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
    const migratedUnreadReceipt = result.receipts.find((receipt) => receipt.key === unreadKey)
    expect(migratedUnreadReceipt).toMatchObject({ pendingRecency: 0, pendingSince: 0 })
    expect(migratedUnreadReceipt).not.toHaveProperty('pendingMode')
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

  it('orders project-tab pins by conversation then project, with EyPc pins before Codex-native pins and no duplicates', () => {
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
      `task:${localTask}`,
      `task:${pinnedTask}`,
      `project:${projectC}`,
      `project:${projectB}`
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
    expect(result.snapshot.all.find((task) => task.key === localTask)).toMatchObject({ alias: '本地任务别名', displayName: '本地任务别名', name: '本地任务别名', originalName: `任务 ${localTask.slice(-2)}`, pinSource: 'local' })
    expect(result.snapshot.all.find((task) => task.key === pinnedTask)).toMatchObject({ displayName: `任务 ${pinnedTask.slice(-2)}`, name: `任务 ${pinnedTask.slice(-2)}`, originalName: `任务 ${pinnedTask.slice(-2)}` })
    expect(result.snapshot.all.find((task) => task.key === pinnedTask)).not.toHaveProperty('alias')
    expect(result.snapshot.projects.find((project) => project.key === projectC)).toMatchObject({ pinSource: 'local' })
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
      hiddenProjectKeys: [projectKey, 'chats', '/private/project'],
      removedProjectKeys: [projectKey, 'chats', '/private/project'],
      removedProjectAbsentKeys: [projectKey]
    })

    expect(state.settings.timeWindowDays).toBe(365)
    expect(state.lastTaskTab).toBe('projects')
    expect(state.collapsedProjectKeys).toEqual([projectKey])
    expect(state.taskAliases).toEqual([{ key: taskKey, alias: 'a'.repeat(120) }])
    expect(state.projectAliases).toEqual([{ key: projectKey, alias: '项目别名' }])
    expect(state.localPins).toEqual([{ kind: 'task', key: taskKey }, { kind: 'project', key: projectKey }])
    expect(state.hiddenProjectKeys).toEqual([projectKey])
    expect(state).not.toHaveProperty('removedProjectKeys')
    expect(state).not.toHaveProperty('removedProjectAbsentKeys')
    expect(JSON.stringify(state)).not.toContain('/private/project')
    expect(normalizeCodexState({}).lastTaskTab).toBe('ongoing')
  })

  it('hides only a project grouping while preserving its tasks and counts in conversation tabs', () => {
    const projectKey = keyAt(53)
    const taskKey = keyAt(54)
    const result = projectConversations({
      threads: [{
        ...thread('notLoaded', 1_010, [], taskKey, { lastTurnStatus: 'failed', lastTurnStartedAt: 1_000 }),
        projectKey,
        projectName: 'Hidden Project',
        projectKind: 'project'
      }],
      projects: [{ key: projectKey, name: 'Hidden Project', kind: 'project', nativePinned: false, nativeOrder: 0 }],
      receipts: [],
      lastTaskScanAt: 1,
      now: 2_000,
      hiddenProjectKeys: [projectKey]
    })

    expect(result.snapshot.all.map((task) => task.key)).toContain(taskKey)
    expect(result.snapshot.ongoing.map((task) => task.key)).toContain(taskKey)
    expect(result.snapshot.projects.find((project) => project.key === projectKey)).toBeDefined()
    expect(result.snapshot.hiddenProjects).toEqual([expect.objectContaining({ key: projectKey })])
    expect(result.snapshot.projectSections.flatMap((section) => section.entries).some((entry) => entry.kind === 'project' && entry.project.key === projectKey)).toBe(false)
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
      activityState: 'ongoing',
      createdAt: 50_000,
      firstPromptAt: 60_000,
      lastQuestionAt: 180_000
    })
    expect(result.snapshot.ongoing[0]).not.toHaveProperty('lastTurnCompletedAt')
  })
})
