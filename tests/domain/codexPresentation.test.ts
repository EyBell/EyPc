import { describe, expect, it } from 'vitest'
import {
  buildCodexTaskStatePackage,
  buildCodexCompactPresentation,
  CODEX_DYNAMIC_TASK_WINDOW_MS,
  normalizeCodexTaskStatePackage,
  projectCodexDynamicStatus
} from '../../src/domain/codexPresentation'
import { CODEX_TASK_STATE_REVISION, emptyConversationSnapshot, type CodexCompactField, type CodexQuotaSnapshotV1, type CodexTaskCard } from '../../src/domain/codex'

const NOW = 1_784_364_000_000

function quota(short: number | null, weekly: number | null): CodexQuotaSnapshotV1 {
  return {
    version: 1,
    status: 'ok',
    plan: 'pro',
    short: short === null ? null : { remainingPercent: short, resetAt: null, windowMinutes: 300 },
    weekly: weekly === null ? null : { remainingPercent: weekly, resetAt: null, windowMinutes: 10_080 },
    updatedAt: 100
  }
}

function presentation(short: number | null, weekly: number | null, fields: CodexCompactField[]) {
  return buildCodexCompactPresentation({
    quota: quota(short, weekly),
    compactFields: fields,
    conversationInboxEnabled: true,
    taskCounts: { input: 2, active: 3, unread: 1 }
  })
}

function task(key: string, overrides: Partial<CodexTaskCard> = {}): CodexTaskCard {
  return {
    key,
    actionAlias: `alias-${key}`,
    displayName: key,
    name: key,
    originalName: key,
    bucket: 'ongoing',
    activityState: 'active',
    archiveCapability: 'blocked-active',
    revisionAt: NOW - 1_000,
    state: 'running',
    updatedAt: NOW - 1_000,
    lastTurnStartedAt: NOW - 1_000,
    projectKey: 'chats',
    projectName: 'Chats',
    originalProjectName: 'Chats',
    projectKind: 'chats',
    isHidden: false,
    ...overrides
  }
}

describe('Codex compact presentation', () => {
  it('projects both quotas as 5h primary and Weekly secondary', () => {
    const value = presentation(80, 40, ['short', 'weekly', 'tasks'])
    expect(value.primary).toMatchObject({ kind: 'short', label: '5h' })
    expect(value.secondary).toMatchObject({ kind: 'weekly', label: 'Weekly' })
    expect(value).toMatchObject({
      showTasks: true,
      taskCounts: { input: 2, active: 3, unread: 1 },
      ongoingCount: 3,
      unknownCount: 0,
      attentionCount: 0,
      pendingCount: 1
    })
    expect(value.ariaLabel).toContain('2 个待输入，3 个进行中，1 个已完成未读')
    expect(value.ariaLabel).not.toContain('状态未知')
  })

  it.each([
    { title: '5h only by data', short: 80, weekly: null, fields: [] as CodexCompactField[], kind: 'short' },
    { title: 'Weekly only by data', short: null, weekly: 40, fields: ['short', 'weekly'] as CodexCompactField[], kind: 'weekly' }
  ])('does not duplicate the single reading: $title', ({ short, weekly, fields, kind }) => {
    const value = presentation(short, weekly, fields)
    expect(value.primary?.kind).toBe(kind)
    expect(value.secondary).toBeNull()
  })

  it('always presents the nearest real quota while task visibility remains configurable', () => {
    const quotaOnly = presentation(80, 40, [])
    expect(quotaOnly.primary?.kind).toBe('short')
    expect(quotaOnly.secondary?.kind).toBe('weekly')
    expect(quotaOnly.showTasks).toBe(false)
    expect(quotaOnly.taskCounts).toEqual({ input: 0, active: 0, unread: 0 })

    const tasksOnly = presentation(80, 40, ['tasks'])
    expect(tasksOnly.primary?.kind).toBe('short')
    expect(tasksOnly).toMatchObject({ showTasks: true, ongoingCount: 3, pendingCount: 1 })
  })

  it('describes an explicit failure state when no quota is available', () => {
    const failed = buildCodexCompactPresentation({
      quota: { ...quota(null, null), status: 'error' },
      compactFields: ['short', 'weekly'],
      conversationInboxEnabled: false,
      taskCounts: { input: 0, active: 0, unread: 0 }
    })
    expect(failed).toMatchObject({ primary: null, state: 'error', stateLabel: '读取失败' })
  })
})

describe('Codex dynamic status projection', () => {
  it('packages conversations, status groups, counters and compatibility as one atomic Controller value', () => {
    const active = task('packaged-active')
    const conversations = {
      ...emptyConversationSnapshot('ok'),
      ongoing: [active],
      all: [active],
      ongoingCount: 1,
      runningCount: 1,
      updatedAt: NOW
    }
    const current = buildCodexTaskStatePackage(conversations, {
      sourceRevision: CODEX_TASK_STATE_REVISION,
      now: NOW
    })

    expect(current).toMatchObject({
      compatibility: 'current',
      conversations,
      dynamic: { compactCounts: { input: 0, active: 1, unread: 0 } }
    })
    expect(current.dynamic.groups.active[0]).toBe(current.conversations.ongoing[0])
    expect(current.dynamic.nextTransitionAt).toBe(active.lastTurnStartedAt! + CODEX_DYNAMIC_TASK_WINDOW_MS + 1)

    const legacy = normalizeCodexTaskStatePackage(undefined, conversations, undefined, NOW)
    expect(legacy).toMatchObject({
      compatibility: 'degraded',
      sourceRevision: 'legacy',
      conversations,
      dynamic: { compactCounts: { input: 0, active: 1, unread: 0 } }
    })
    expect(legacy.compatibilityMessage).toContain('状态已保留')
  })

  it('derives mutually exclusive recent groups and all three counters from one stabilized snapshot', () => {
    const input = task('input', { activityState: 'waiting-input', state: 'waiting-input' })
    const active = task('active')
    const approval = task('approval', { activityState: 'waiting-approval', state: 'waiting-approval' })
    const conservative = task('conservative', { activityState: 'ongoing' })
    const stopped = task('stopped', { bucket: 'stopped', activityState: 'stopped', archiveCapability: 'allowed', state: 'stopped' })
    const unread = task('unread', { bucket: 'completed-unread', activityState: 'ongoing', archiveCapability: 'allowed', state: 'pending-review' })
    const completed = task('completed', { bucket: 'completed', activityState: 'ongoing', archiveCapability: 'allowed', state: 'recent-activity' })
    const oldActive = task('old-active', { lastTurnStartedAt: NOW - CODEX_DYNAMIC_TASK_WINDOW_MS - 1 })
    const hiddenActive = task('hidden-active', { isHidden: true })
    const hiddenInput = task('hidden-input', { activityState: 'waiting-input', state: 'waiting-input', isHidden: true })
    const hiddenUnread = task('hidden-unread', { bucket: 'completed-unread', activityState: 'ongoing', archiveCapability: 'allowed', state: 'pending-review', isHidden: true })

    const value = projectCodexDynamicStatus({
      ongoing: [input, active, approval, conservative, oldActive, hiddenActive],
      stopped: [stopped],
      completedUnread: [unread],
      completed: [completed],
      hidden: [hiddenActive, hiddenInput, hiddenUnread],
      inputRequired: [input, hiddenInput]
    }, NOW)

    expect(value.groups.input.map((item) => item.key)).toEqual(['input'])
    expect(value.groups.active.map((item) => item.key)).toEqual(['active', 'approval', 'conservative'])
    expect(value.groups.stopped.map((item) => item.key)).toEqual(['stopped'])
    expect(value.groups.unread.map((item) => item.key)).toEqual(['unread'])
    expect(value.groups.completed.map((item) => item.key)).toEqual(['completed'])
    expect(value.tasks).toHaveLength(7)
    expect(value.compactCounts).toEqual({ input: 2, active: 3, unread: 2 })
    expect(value.groups.active.map((item) => item.key)).not.toContain('old-active')
    expect(value.groups.active.map((item) => item.key)).not.toContain('hidden-active')
  })

  it('keeps card and active counter aligned through active/ongoing jitter, then switches once on stabilized completion', () => {
    for (const activityState of ['active', 'ongoing', 'active'] as const) {
      const current = task('jitter', { activityState })
      const value = projectCodexDynamicStatus({
        ongoing: [current],
        stopped: [],
        completedUnread: [],
        completed: [],
        hidden: [],
        inputRequired: []
      }, NOW)
      expect(value.groups.active.map((item) => item.key)).toEqual(['jitter'])
      expect(value.compactCounts.active).toBe(1)
    }

    const completed = task('jitter', {
      bucket: 'completed',
      activityState: 'ongoing',
      archiveCapability: 'allowed',
      state: 'recent-activity',
      completionRevision: NOW,
      lastTurnCompletedAt: NOW
    })
    const value = projectCodexDynamicStatus({
      ongoing: [],
      stopped: [],
      completedUnread: [],
      completed: [completed],
      hidden: [],
      inputRequired: []
    }, NOW)
    expect(value.groups.active).toHaveLength(0)
    expect(value.compactCounts.active).toBe(0)
    expect(value.groups.completed[0]).toMatchObject({ key: 'jitter', archiveCapability: 'allowed' })
  })
})
