import { describe, expect, it } from 'vitest'
import { buildCodexCompactPresentation } from '../../src/domain/codexPresentation'
import type { CodexCompactField, CodexQuotaSnapshotV1 } from '../../src/domain/codex'

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
    conversations: { ongoingCount: 2, unknownCount: 3, attentionCount: 1, pendingCount: 1 }
  })
}

describe('Codex compact presentation', () => {
  it('projects both quotas as 5h primary and Weekly secondary', () => {
    const value = presentation(80, 40, ['short', 'weekly', 'tasks'])
    expect(value.primary).toMatchObject({ kind: 'short', label: '5h' })
    expect(value.secondary).toMatchObject({ kind: 'weekly', label: 'Weekly' })
    expect(value).toMatchObject({ showTasks: true, ongoingCount: 6, unknownCount: 0, attentionCount: 0, pendingCount: 1 })
    expect(value.ariaLabel).toContain('6 个进行中或等待操作，1 个待查看')
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

    const tasksOnly = presentation(80, 40, ['tasks'])
    expect(tasksOnly.primary?.kind).toBe('short')
    expect(tasksOnly).toMatchObject({ showTasks: true, ongoingCount: 6, unknownCount: 0, attentionCount: 0, pendingCount: 1 })
  })

  it('describes an explicit failure state when no quota is available', () => {
    const failed = buildCodexCompactPresentation({
      quota: { ...quota(null, null), status: 'error' },
      compactFields: ['short', 'weekly'],
      conversationInboxEnabled: false,
      conversations: { ongoingCount: 0, unknownCount: 0, attentionCount: 0, pendingCount: 0 }
    })
    expect(failed).toMatchObject({ primary: null, state: 'error', stateLabel: '读取失败' })
  })
})
