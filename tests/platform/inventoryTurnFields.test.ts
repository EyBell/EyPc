import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createCodexInventoryTurnFields } = require('../../preload/codex/inventory-turn-fields.cjs') as {
  createCodexInventoryTurnFields(dependencies: { timestampMs(value: unknown): number }): {
    codexMergedInventoryTurnFields(projection: Record<string, any>, previous: Record<string, any>): Record<string, any>
  }
}

describe('codex inventory turn field merge', () => {
  const merge = createCodexInventoryTurnFields({
    timestampMs: (value: unknown) => {
      const numeric = Number(value)
      return Number.isFinite(numeric) && numeric > 0 ? numeric : 0
    }
  }).codexMergedInventoryTurnFields

  it('lets Host snapshot-corroborated completion beat a previous Desktop-live inProgress turn', () => {
    expect(merge({
      // Only an extra process carries a Harness id, and only it may outrank a
      // live turn with an inventory-derived terminal (RAW-190).
      codexhostHarnessId: 'grok',
      lastTurnStatus: 'completed',
      lastTurnStartedAt: 2_000,
      lastTurnCompletedAt: 2_000,
      lastTurnEvidence: 'snapshot-corroborated'
    }, {
      status: 'active',
      statusAuthority: 'desktop-live',
      activityEvidence: 'activity-event',
      lastTurnStatus: 'inProgress',
      lastTurnStartedAt: 1_000,
      lastTurnEvidence: 'turn-started'
    })).toMatchObject({
      lastTurnStatus: 'completed',
      lastTurnStartedAt: 2_000,
      lastTurnEvidence: 'snapshot-corroborated'
    })
  })

  it('keeps a native live inProgress turn even against an exact terminal projection', () => {
    // Same evidence tag as the extra-process case, but no Harness id: a full
    // inventory rebuild must not overwrite live evidence on a native thread.
    expect(merge({
      lastTurnStatus: 'interrupted',
      lastTurnStartedAt: 2_000,
      lastTurnEvidence: 'targeted-after-exit'
    }, {
      status: 'active',
      statusAuthority: 'app-server-live',
      activityEvidence: 'activity-event',
      lastTurnStatus: 'inProgress',
      lastTurnStartedAt: 1_000,
      lastTurnEvidence: 'turn-started'
    })).toMatchObject({
      lastTurnStatus: 'inProgress',
      lastTurnStartedAt: 1_000,
      lastTurnEvidence: 'turn-started'
    })
  })

  it('still keeps a live inProgress turn over a weaker inventory idle snapshot', () => {
    expect(merge({
      lastTurnStatus: 'completed',
      lastTurnStartedAt: 2_000,
      lastTurnCompletedAt: 2_000,
      lastTurnEvidence: 'inventory'
    }, {
      status: 'active',
      statusAuthority: 'desktop-live',
      activityEvidence: 'activity-event',
      lastTurnStatus: 'inProgress',
      lastTurnStartedAt: 1_000,
      lastTurnEvidence: 'turn-started'
    })).toMatchObject({
      lastTurnStatus: 'inProgress',
      lastTurnStartedAt: 1_000
    })
  })
})
