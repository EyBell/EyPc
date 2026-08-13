import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require_ = createRequire(import.meta.url)
const causality = require_(resolve(process.cwd(), 'preload/companion/branch-causality.cjs')) as {
  phaseEvidenceSupersedes(previous: unknown, incoming: unknown, attentionRank?: (entry: any) => number): boolean
  mergeEvidenceLanes(previous: unknown, incoming: unknown, options?: Record<string, unknown>): any
  noAttentionRank(entry: unknown): number
}

const live = (overrides: Record<string, unknown> = {}) => ({
  liveCurrent: true,
  exactTerminal: false,
  turnStartedAt: 1_000,
  activeEvidenceSequence: 10,
  observedAt: 1_000,
  unreadObserved: false,
  ...overrides
})

const terminal = (overrides: Record<string, unknown> = {}) => ({
  liveCurrent: false,
  exactTerminal: true,
  turnStartedAt: 1_000,
  terminalAt: 1_500,
  terminalEvidenceSequence: 10,
  observedAt: 1_500,
  unreadObserved: false,
  ...overrides
})

// The core exists so every Provider shares one set of causal rules. A Provider
// with no branches, no attention concept and no Goal lane must be able to use
// it as-is — that is the precondition for routing Claude through it.
describe('branch causality core is provider-neutral', () => {
  it('orders evidence without any attention comparator', () => {
    const older = live({ turnStartedAt: 1_000 })
    const newer = live({ turnStartedAt: 2_000 })
    expect(causality.phaseEvidenceSupersedes(older, newer)).toBe(true)
    expect(causality.phaseEvidenceSupersedes(newer, older)).toBe(false)
  })

  it('refuses a stale terminal over a newer live edge', () => {
    const currentLive = live({ turnStartedAt: 2_000 })
    const staleTerminal = terminal({ turnStartedAt: 1_000, terminalAt: 1_500 })
    expect(causality.phaseEvidenceSupersedes(currentLive, staleTerminal)).toBe(false)
  })

  it('refuses a late live observation over a newer terminal', () => {
    const currentTerminal = terminal({ turnStartedAt: 2_000, terminalAt: 2_500 })
    const lateLive = live({ turnStartedAt: 1_000 })
    expect(causality.phaseEvidenceSupersedes(currentTerminal, lateLive)).toBe(false)
  })

  it('still admits a genuinely newer Turn immediately', () => {
    const currentTerminal = terminal({ turnStartedAt: 1_000, terminalAt: 1_500 })
    const newTurn = live({ turnStartedAt: 3_000 })
    expect(causality.phaseEvidenceSupersedes(currentTerminal, newTurn)).toBe(true)
  })

  it('keeps a retained unread lane when the incoming observation only saw phase', () => {
    const previous = live({ unreadObserved: true, unreadKnown: true, hasUnreadTurn: true })
    const phaseOnly = live({ turnStartedAt: 2_000, unreadObserved: false })
    const merged = causality.mergeEvidenceLanes(previous, phaseOnly)
    expect(merged.turnStartedAt).toBe(2_000)
    expect(merged).toMatchObject({ unreadObserved: true, unreadKnown: true, hasUnreadTurn: true })
  })

  it('keeps the retained phase when the incoming observation only saw unread', () => {
    const previous = live({ turnStartedAt: 2_000 })
    const unreadOnly = live({ turnStartedAt: 1_000, unreadObserved: true, unreadKnown: true, hasUnreadTurn: true })
    const merged = causality.mergeEvidenceLanes(previous, unreadOnly)
    expect(merged.turnStartedAt).toBe(2_000)
    expect(merged.hasUnreadTurn).toBe(true)
  })

  it('carries no Goal vocabulary of its own', () => {
    const merged = causality.mergeEvidenceLanes(live(), live({ turnStartedAt: 2_000 }))
    expect(merged).not.toHaveProperty('goalStatus')
    expect(causality.noAttentionRank(live())).toBe(0)
  })
})
