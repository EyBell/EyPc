import { describe, expect, it } from 'vitest'
import {
  COMPANION_PROVIDER_CYCLE_ORDER,
  DEFAULT_COMPANION_ENABLEMENT,
  aggregateCompanionTaskCounts,
  companionTaskKey,
  companionTaskProvider,
  countCompanionTasksByProvider,
  enabledCompanionProviders,
  isCompanionCompatibilityMode,
  normalizeCompanionEnablement,
  normalizeCompanionProviderId,
  orderCompanionTasksForCycle,
  orderCompanionTasksForDisplay,
  parseCompanionTaskKey,
  resolveCompanionWaterBallMapping,
  type CompanionProviderId
} from '../../src/domain/companionProvider'
import {
  hideCodexThread,
  isForeignCompanionKey,
  normalizeCodexAliases,
  normalizeCodexLocalPins,
  restoreCodexThread,
  type CodexTaskCard
} from '../../src/domain/codex'

function task(key: string, provider?: CompanionProviderId, pinSource?: 'native' | 'local', lastQuestionAt = 0): CodexTaskCard {
  return {
    key,
    name: key,
    originalName: key,
    bucket: 'ongoing',
    activityState: 'active',
    archiveCapability: 'blocked-active',
    revisionAt: 0,
    state: 'running',
    updatedAt: 0,
    lastQuestionAt,
    projectKey: 'p',
    projectName: 'p',
    originalProjectName: 'p',
    projectKind: 'project',
    isHidden: false,
    ...(pinSource ? { pinSource } : {}),
    ...(provider ? { provider } : {})
  } as CodexTaskCard
}

function keys(tasks: readonly CodexTaskCard[]): string[] {
  return tasks.map((item) => item.key)
}

describe('companion provider identity', () => {
  it('defaults legacy cards without a provider field to codex', () => {
    expect(companionTaskProvider(task('a'))).toBe('codex')
    expect(companionTaskProvider(task('b', 'claude'))).toBe('claude')
    expect(companionTaskProvider(null)).toBe('codex')
    expect(normalizeCompanionProviderId('nonsense')).toBe('codex')
    expect(normalizeCompanionProviderId('claude')).toBe('claude')
  })

  it('keeps codex keys byte-identical and namespaces every other provider', () => {
    expect(companionTaskKey('codex', 'thread-1')).toBe('thread-1')
    expect(companionTaskKey('claude', 'sess-1')).toBe('claude:sess-1')
    expect(companionTaskKey('cursor', '86e0370a-21b3-434d-a1a3-0ce83edc5ddd')).toBe('cursor:86e0370a-21b3-434d-a1a3-0ce83edc5ddd')
    expect(parseCompanionTaskKey('thread-1')).toEqual({ provider: 'codex', rawKey: 'thread-1' })
    expect(parseCompanionTaskKey('claude:sess-1')).toEqual({ provider: 'claude', rawKey: 'sess-1' })
    expect(parseCompanionTaskKey('cursor:86e0370a-21b3-434d-a1a3-0ce83edc5ddd')).toEqual({
      provider: 'cursor',
      rawKey: '86e0370a-21b3-434d-a1a3-0ce83edc5ddd'
    })
  })

  it('round-trips keys that themselves contain separators', () => {
    const raw = 'sess:with:colons'
    expect(parseCompanionTaskKey(companionTaskKey('claude', raw))).toEqual({ provider: 'claude', rawKey: raw })
    expect(parseCompanionTaskKey(companionTaskKey('codex', raw))).toEqual({ provider: 'codex', rawKey: raw })
  })
})

describe('namespaced keys survive persistence', () => {
  it('accepts a foreign task key everywhere a codex key is accepted', () => {
    // Hiding, renaming and pinning all round-trip through normalization. When
    // the key pattern rejected the namespaced form these writes were silently
    // dropped while the UI still reported success.
    const key = companionTaskKey('claude', 'c9c984d9-b103-5a78-84e7-ab60eded6bea')
    expect(isForeignCompanionKey(key)).toBe(true)
    expect(normalizeCodexAliases([{ key, alias: '重构分支' }])).toEqual([{ key, alias: '重构分支' }])
    expect(normalizeCodexLocalPins([{ kind: 'task', key }])).toEqual([{ kind: 'task', key }])
    const hidden = hideCodexThread([], key, 1_000, 'activity', 2_000)
    expect(hidden.find((receipt) => receipt.key === key)?.dismissedActivityRecency).toBe(1_000)
    expect(restoreCodexThread(hidden, key, 1_000, 'activity')
      .find((receipt) => receipt.key === key)?.dismissedActivityRecency).toBeUndefined()
  })

  it('still rejects keys that are not plainly namespaced', () => {
    expect(isForeignCompanionKey('claude:')).toBe(false)
    expect(isForeignCompanionKey('../etc/passwd')).toBe(false)
    expect(isForeignCompanionKey(`claude:${'x'.repeat(200)}`)).toBe(false)
    expect(normalizeCodexAliases([{ key: '../etc', alias: 'x' }])).toEqual([])
  })

  it('leaves an ordinary codex key untouched', () => {
    const key = 'a'.repeat(32)
    expect(isForeignCompanionKey(key)).toBe(false)
    expect(normalizeCodexAliases([{ key, alias: 'demo' }])).toEqual([{ key, alias: 'demo' }])
  })
})

describe('companion enablement', () => {
  it('normalizes absent settings into the pre-existing codex-only behavior', () => {
    expect(normalizeCompanionEnablement(undefined)).toEqual(DEFAULT_COMPANION_ENABLEMENT)
    expect(normalizeCompanionEnablement({})).toEqual({ codex: true, claude: false, cursor: false })
    expect(isCompanionCompatibilityMode(normalizeCompanionEnablement(undefined))).toBe(true)
  })

  it('treats any non-true value as disabled and reports enabled providers in cycle order', () => {
    expect(normalizeCompanionEnablement({ codex: 'yes', claude: 1 })).toEqual({ codex: false, claude: false, cursor: false })
    expect(enabledCompanionProviders({ codex: true, claude: true, cursor: true })).toEqual([...COMPANION_PROVIDER_CYCLE_ORDER])
    expect(enabledCompanionProviders({ codex: false, claude: true, cursor: false })).toEqual(['claude'])
    expect(enabledCompanionProviders({ codex: true, claude: false, cursor: false })).toEqual(['codex'])
    expect(isCompanionCompatibilityMode({ codex: true, claude: true, cursor: false })).toBe(false)
    expect(isCompanionCompatibilityMode({ codex: false, claude: true, cursor: false })).toBe(false)
  })
})

describe('display order stays provider-agnostic', () => {
  it('sorts by latest question across providers', () => {
    const tasks = [task('c1', 'codex', undefined, 400), task('l1', 'claude', undefined, 200), task('c2', 'codex', undefined, 300), task('l2', 'claude', undefined, 100)]
    expect(keys(orderCompanionTasksForDisplay(tasks))).toEqual(['c1', 'c2', 'l1', 'l2'])
  })

  it('does not let a pin override latest-question order', () => {
    const tasks = [task('c1', 'codex', undefined, 300), task('l1', 'claude', 'local', 100), task('c2', 'codex', undefined, 200)]
    expect(keys(orderCompanionTasksForDisplay(tasks))).toEqual(['c1', 'c2', 'l1'])
  })
})

describe('cycle order uses the same latest-question comparator', () => {
  it('interleaves providers solely by latest question', () => {
    const tasks = [task('c1', 'codex', undefined, 400), task('l1', 'claude', undefined, 300), task('c2', 'codex', undefined, 200), task('l2', 'claude', undefined, 100)]
    expect(keys(orderCompanionTasksForCycle(tasks))).toEqual(['c1', 'l1', 'c2', 'l2'])
  })

  it('does not apply pinned-first inside either provider', () => {
    const tasks = [
      task('c1', 'codex', undefined, 400),
      task('l1', 'claude', undefined, 300),
      task('c2', 'codex', 'local', 200),
      task('l2', 'claude', 'local', 100)
    ]
    expect(keys(orderCompanionTasksForCycle(tasks))).toEqual(['c1', 'l1', 'c2', 'l2'])
  })

  it('ignores explicit pin order for navigation position', () => {
    const tasks = [task('c1', 'codex', 'local', 300), task('l1', 'claude', 'local', 100), task('c2', 'codex', 'local', 200)]
    expect(keys(orderCompanionTasksForCycle(tasks, ['c2', 'c1', 'l1']))).toEqual(['c1', 'c2', 'l1'])
  })

  it('is identical to display order while only codex tasks exist', () => {
    const tasks = [task('c1'), task('c2', 'codex'), task('c3')]
    expect(keys(orderCompanionTasksForCycle(tasks))).toEqual(keys(orderCompanionTasksForDisplay(tasks)))
  })

  it('is idempotent, so re-projecting a cycle list never reshuffles it', () => {
    const tasks = [task('c1'), task('l1', 'claude'), task('c2'), task('l2', 'claude')]
    const once = orderCompanionTasksForCycle(tasks)
    expect(keys(orderCompanionTasksForCycle(once))).toEqual(keys(once))
  })

  it('moves a newly arrived latest question to the front', () => {
    const before = orderCompanionTasksForCycle([task('c1', 'codex', undefined, 300), task('l1', 'claude', undefined, 200), task('c2', 'codex', undefined, 100)])
    const after = orderCompanionTasksForCycle([...before, task('l3', 'claude', undefined, 400)])
    expect(keys(before)).toEqual(['c1', 'l1', 'c2'])
    expect(keys(after)).toEqual(['l3', 'c1', 'l1', 'c2'])
  })

  it('returns short inputs untouched', () => {
    expect(orderCompanionTasksForCycle([])).toEqual([])
    expect(keys(orderCompanionTasksForCycle([task('l1', 'claude')]))).toEqual(['l1'])
  })
})

describe('cross-provider aggregation is status-driven', () => {
  it('sums each status across providers', () => {
    expect(aggregateCompanionTaskCounts([
      { input: 1, active: 2, unread: 3 },
      { input: 4, active: 0, unread: 1 }
    ])).toEqual({ input: 5, active: 2, unread: 4 })
  })

  it('ignores missing or malformed parts instead of producing NaN', () => {
    expect(aggregateCompanionTaskCounts([null, undefined, { input: -3, active: Number.NaN, unread: 2.7 }]))
      .toEqual({ input: 0, active: 0, unread: 2 })
    expect(aggregateCompanionTaskCounts([])).toEqual({ input: 0, active: 0, unread: 0 })
  })

  it('counts inventory membership per provider', () => {
    expect(countCompanionTasksByProvider([task('c1'), task('l1', 'claude'), task('l2', 'claude')]))
      .toEqual({ codex: 1, claude: 2, cursor: 0 })
  })
})

describe('water ball channel mapping', () => {
  it('is unchanged from the legacy release while only codex is enabled', () => {
    expect(resolveCompanionWaterBallMapping({ codex: true, claude: false }))
      .toEqual({ liquid: 'codex', ring: 'codex', percent: 'codex', compatibility: true })
  })

  it('lets claude own the whole ball when it is the only enabled provider', () => {
    expect(resolveCompanionWaterBallMapping({ codex: false, claude: true }))
      .toEqual({ liquid: 'claude', ring: 'claude', percent: 'claude', compatibility: false })
  })

  it('shares the ball as ring=codex and centre percentage=claude', () => {
    expect(resolveCompanionWaterBallMapping({ codex: true, claude: true }))
      .toEqual({ liquid: 'codex', ring: 'codex', percent: 'claude', compatibility: false })
  })

  it('falls back to the legacy codex percentage while claude is enabled but not connected', () => {
    expect(resolveCompanionWaterBallMapping({ codex: true, claude: true }, { claude: false }))
      .toEqual({ liquid: 'codex', ring: 'codex', percent: 'codex', compatibility: true })
  })

  it('keeps the legacy mapping when nothing is enabled at all', () => {
    expect(resolveCompanionWaterBallMapping({ codex: false, claude: false }).compatibility).toBe(true)
  })

  it('keeps claude ownership when claude is the only enabled provider but is offline', () => {
    expect(resolveCompanionWaterBallMapping({ codex: false, claude: true }, { claude: false }))
      .toEqual({ liquid: 'claude', ring: 'claude', percent: 'claude', compatibility: false })
  })
})
