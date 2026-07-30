import { describe, expect, it } from 'vitest'
import { normalizeCodexQuota, type CodexQuotaSnapshotV1 } from '../../src/domain/codex'
import { buildCodexCompactPresentation } from '../../src/domain/codexPresentation'
import { resolveCodexNewThreadModel, resolveManualCodexModel } from '../../src/domain/codexNewThread'

const bucket = (remainingPercent: number, windowMinutes: number) => ({ remainingPercent, resetAt: 2_000_000_000_000, windowMinutes })

function quota(input: {
  short?: number | null
  weekly?: number | null
  sparkShort?: number | null
  sparkWeekly?: number | null
}): CodexQuotaSnapshotV1 {
  return normalizeCodexQuota({
    version: 2,
    status: 'ok',
    plan: 'pro',
    normal: {
      limitId: 'codex',
      limitName: 'Codex',
      short: input.short === undefined || input.short === null ? null : bucket(input.short, 300),
      weekly: input.weekly === undefined || input.weekly === null ? null : bucket(input.weekly, 10_080)
    },
    spark: [{
      limitId: 'codex_bengalfox',
      limitName: 'GPT-5.3-Codex-Spark',
      short: input.sparkShort === undefined || input.sparkShort === null ? null : bucket(input.sparkShort, 300),
      weekly: input.sparkWeekly === undefined || input.sparkWeekly === null ? null : bucket(input.sparkWeekly, 10_080)
    }],
    updatedAt: 1
  })
}

const catalog = {
  version: 1 as const,
  status: 'ok' as const,
  models: [
    { id: 'gpt-5.6-sol', displayName: 'GPT-5.6 Sol', description: '', family: 'normal' as const, isDefault: true, supportsText: true },
    { id: 'gpt-5.5-codex', displayName: 'GPT-5.5 Codex', description: '', family: 'normal' as const, isDefault: false, supportsText: true },
    { id: 'gpt-5.3-codex-spark', displayName: 'GPT-5.3 Codex Spark', description: '', family: 'spark' as const, isDefault: false, supportsText: true }
  ],
  fingerprint: 'a'.repeat(64),
  updatedAt: 1
}

describe('Codex quota-auto new-thread policy', () => {
  it('uses configured ordinary model while returned ordinary windows remain above zero', () => {
    const resolved = resolveCodexNewThreadModel({ quota: quota({ short: 72, weekly: 38, sparkWeekly: 95 }), modelCatalog: catalog, preferredModelId: 'gpt-5.5-codex' })
    expect(resolved).toMatchObject({ status: 'ready', modelId: 'gpt-5.5-codex', family: 'normal', reason: 'preferred-normal', quota: { remainingPercent: 72 } })
  })

  it('treats a missing ordinary window differently from an exhausted returned window', () => {
    expect(resolveCodexNewThreadModel({ quota: quota({ weekly: 33, sparkWeekly: 91 }), modelCatalog: catalog }).family).toBe('normal')
    expect(resolveCodexNewThreadModel({ quota: quota({ short: 0, weekly: 33, sparkWeekly: 91 }), modelCatalog: catalog })).toMatchObject({
      modelId: 'gpt-5.3-codex-spark',
      family: 'spark',
      reason: 'quota-spark',
      quota: { remainingPercent: 91 }
    })
    expect(resolveCodexNewThreadModel({ quota: quota({ short: 33, weekly: 0, sparkWeekly: 91 }), modelCatalog: catalog })).toMatchObject({
      modelId: 'gpt-5.3-codex-spark',
      family: 'spark',
      reason: 'quota-spark',
      quota: { remainingPercent: 91 }
    })
  })

  it('requires a manual choice when ordinary quota is exhausted and Spark cannot be used', () => {
    const noSpark = { ...catalog, models: catalog.models.filter((model) => model.family !== 'spark') }
    expect(resolveCodexNewThreadModel({ quota: quota({ short: 0, weekly: 0 }), modelCatalog: noSpark })).toMatchObject({ status: 'manual-required', reason: 'spark-unavailable' })
  })

  it('keeps a manual selection one-off and reports its matching quota family', () => {
    expect(resolveManualCodexModel({ modelId: 'gpt-5.3-codex-spark', quota: quota({ short: 80, weekly: 50, sparkWeekly: 96 }), modelCatalog: catalog })).toMatchObject({
      modelId: 'gpt-5.3-codex-spark',
      family: 'spark',
      reason: 'manual-selection',
      quota: { remainingPercent: 96 }
    })
  })
})

describe('Codex compact quota priority', () => {
  const compact = (quotaValue: CodexQuotaSnapshotV1) => buildCodexCompactPresentation({
    quota: quotaValue,
    compactFields: [],
    conversationInboxEnabled: false,
    taskCounts: { input: 0, active: 0, unread: 0 }
  })

  it('shows positive ordinary 5h, then ordinary weekly, then the highest Spark quota', () => {
    expect(compact(quota({ short: 60, weekly: 30, sparkWeekly: 99 })).primary).toMatchObject({ family: 'normal', kind: 'short', bucket: { remainingPercent: 60 } })
    expect(compact(quota({ short: 0, weekly: 30, sparkWeekly: 99 })).primary).toMatchObject({ family: 'normal', kind: 'weekly', bucket: { remainingPercent: 30 } })
    expect(compact(quota({ short: 0, weekly: 0, sparkWeekly: 99 })).primary).toMatchObject({ family: 'spark', kind: 'weekly', bucket: { remainingPercent: 99 } })
  })
})
