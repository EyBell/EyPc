import { describe, expect, it } from 'vitest'
import { mergeCompanionConversations, resolveCompanionWaterBallReadings, withoutCompanionProvider } from '../../src/domain/companionAggregate'
import { emptyConversationSnapshot, type CodexProjectCard, type CodexTaskCard, type ConversationSnapshotV1 } from '../../src/domain/codex'
import type { CompanionProviderId } from '../../src/domain/companionProvider'

function card(
  key: string,
  patch: Partial<CodexTaskCard> = {}
): CodexTaskCard {
  return {
    key,
    actionAlias: key,
    name: key,
    originalName: key,
    bucket: 'ongoing',
    activityState: 'active',
    archiveCapability: 'blocked-active',
    revisionAt: 1,
    state: 'running',
    updatedAt: 1,
    projectKey: 'p',
    projectName: 'p',
    originalProjectName: 'p',
    projectKind: 'project',
    isHidden: false,
    ...patch
  } as CodexTaskCard
}

function codexSnapshot(): ConversationSnapshotV1 {
  const base = emptyConversationSnapshot('ok')
  const running = card('c1')
  const waiting = card('c2', { activityState: 'waiting-input', state: 'waiting-input' })
  const unread = card('c3', { bucket: 'completed-unread', activityState: 'ongoing', state: 'pending-review' })
  return {
    ...base,
    ongoing: [running, waiting],
    completedUnread: [unread],
    pending: [unread],
    completedTab: [unread],
    inputRequired: [waiting],
    all: [running, waiting, unread],
    ongoingCount: 2,
    waitingCount: 1,
    runningCount: 1,
    inputRequiredCount: 1,
    completedUnreadCount: 1,
    pendingCount: 1
  }
}

function keys(cards: readonly CodexTaskCard[]): string[] {
  return cards.map((item) => item.key)
}

function snapshotWithProjects(definitions: Array<Pick<CodexProjectCard, 'key' | 'name' | 'originalName'> & { actionAlias?: string }>) {
  const snapshot = codexSnapshot()
  const projects: CodexProjectCard[] = definitions.map((project) => ({
    ...project,
    kind: 'project',
    nativePinned: false,
    collapsed: false,
    tasks: snapshot.all.filter((task) => task.projectKey === project.key)
  }))
  return {
    ...snapshot,
    projects,
    projectSections: [
      { id: 'pinned' as const, title: 'Pinned' as const, entries: [] },
      { id: 'projects' as const, title: 'Projects' as const, entries: projects.map((project) => ({ kind: 'project' as const, project })) },
      { id: 'chats' as const, title: 'Chats' as const, entries: [] }
    ]
  }
}

describe('merging a second provider', () => {
  it('returns the exact same object when there is nothing to merge', () => {
    const snapshot = codexSnapshot()
    expect(mergeCompanionConversations(snapshot, [])).toBe(snapshot)
  })

  it('adds foreign cards without disturbing the codex sequence', () => {
    const merged = mergeCompanionConversations(codexSnapshot(), [
      card('claude:l1', { provider: 'claude' }),
      card('claude:l2', { provider: 'claude', activityState: 'waiting-input', state: 'waiting-input' })
    ])
    expect(keys(merged.ongoing).filter((key) => !key.startsWith('claude:'))).toEqual(['c1', 'c2'])
    expect(keys(merged.ongoing)).toHaveLength(4)
    expect(keys(merged.inputRequired)).toEqual(['c2', 'claude:l2'])
  })

  it('interleaves by recency rather than parking foreign cards at the end', () => {
    // Appending would be source grouping by another name; the visible list is
    // supposed to read as one merged, status-driven sequence.
    const snapshot = {
      ...codexSnapshot(),
      ongoing: [card('c-old', { updatedAt: 100 }), card('c-older', { updatedAt: 50 })],
      all: [card('c-old', { updatedAt: 100 }), card('c-older', { updatedAt: 50 })]
    }
    const merged = mergeCompanionConversations(snapshot, [
      card('claude:new', { provider: 'claude', updatedAt: 200 }),
      card('claude:mid', { provider: 'claude', updatedAt: 75 })
    ])
    expect(keys(merged.ongoing)).toEqual(['claude:new', 'c-old', 'claude:mid', 'c-older'])
  })

  it('never reorders codex cards relative to each other', () => {
    // The codex projection order encodes rules this layer must not second-guess,
    // so even an out-of-order codex sequence survives the merge intact.
    const snapshot = {
      ...codexSnapshot(),
      ongoing: [card('c-a', { updatedAt: 10 }), card('c-b', { updatedAt: 900 }), card('c-c', { updatedAt: 40 })],
      all: []
    }
    const merged = mergeCompanionConversations(snapshot, [card('claude:x', { provider: 'claude', updatedAt: 500 })])
    expect(keys(merged.ongoing).filter((key) => key.startsWith('c-'))).toEqual(['c-a', 'c-b', 'c-c'])
  })

  it('sinks a foreign card with no activity to the end rather than the front', () => {
    const snapshot = {
      ...codexSnapshot(),
      ongoing: [card('c1', { updatedAt: 100 })],
      all: []
    }
    const merged = mergeCompanionConversations(snapshot, [
      card('claude:unknown', { provider: 'claude', updatedAt: 0, lastTurnStartedAt: 0, lastTurnCompletedAt: 0 })
    ])
    expect(keys(merged.ongoing)).toEqual(['c1', 'claude:unknown'])
  })

  it('keeps an existing card first when activity ties', () => {
    const snapshot = { ...codexSnapshot(), ongoing: [card('c1', { updatedAt: 500 })], all: [] }
    const merged = mergeCompanionConversations(snapshot, [card('claude:tie', { provider: 'claude', updatedAt: 500 })])
    expect(keys(merged.ongoing)).toEqual(['c1', 'claude:tie'])
  })

  it('routes each card by its own state rather than its source', () => {
    const merged = mergeCompanionConversations(codexSnapshot(), [
      card('claude:done', { provider: 'claude', bucket: 'completed-unread', activityState: 'ongoing' }),
      card('claude:read', { provider: 'claude', bucket: 'completed', activityState: 'ongoing' }),
      card('claude:dead', { provider: 'claude', bucket: 'stopped', activityState: 'stopped' })
    ])
    expect(keys(merged.completedUnread)).toEqual(['c3', 'claude:done'])
    expect(keys(merged.completed)).toEqual(['claude:read'])
    expect(keys(merged.stopped)).toEqual(['claude:dead'])
    expect(keys(merged.completedTab)).toEqual(['c3', 'claude:done', 'claude:read'])
  })

  it('recomputes counters across providers instead of incrementing them', () => {
    const merged = mergeCompanionConversations(codexSnapshot(), [
      card('claude:l1', { provider: 'claude' }),
      card('claude:l2', { provider: 'claude', activityState: 'waiting-input' }),
      card('claude:l3', { provider: 'claude', activityState: 'waiting-approval' }),
      card('claude:done', { provider: 'claude', bucket: 'completed-unread', activityState: 'ongoing' })
    ])
    expect(merged.ongoingCount).toBe(5)
    expect(merged.runningCount).toBe(2)
    expect(merged.waitingCount).toBe(3)
    expect(merged.inputRequiredCount).toBe(2)
    expect(merged.completedUnreadCount).toBe(2)
    expect(merged.pendingCount).toBe(merged.completedUnreadCount)
  })

  it('is idempotent, so a re-published snapshot cannot double count', () => {
    const cards = [card('claude:l1', { provider: 'claude' }), card('claude:l2', { provider: 'claude' })]
    const once = mergeCompanionConversations(codexSnapshot(), cards)
    const twice = mergeCompanionConversations(once, cards)
    expect(keys(twice.ongoing)).toEqual(keys(once.ongoing))
    expect(twice.ongoingCount).toBe(once.ongoingCount)
  })

  it('sends hidden cards only to the hidden bucket', () => {
    const merged = mergeCompanionConversations(codexSnapshot(), [
      card('claude:h1', { provider: 'claude', isHidden: true }),
      card('claude:h2', { provider: 'claude', isHidden: true, bucket: 'completed-unread', activityState: 'ongoing' })
    ])
    expect(keys(merged.hidden)).toEqual(['claude:h1', 'claude:h2'])
    expect(keys(merged.ongoing)).toEqual(['c1', 'c2'])
    expect(merged.hiddenCount).toBe(2)
    expect(merged.completedUnreadCount).toBe(1)
  })

  it('counts a hidden waiting task in the input-required total, matching the codex contract', () => {
    const merged = mergeCompanionConversations(codexSnapshot(), [
      card('claude:h1', { provider: 'claude', isHidden: true, activityState: 'waiting-input' })
    ])
    expect(merged.inputRequiredCount).toBe(2)
    expect(keys(merged.inputRequired)).toEqual(['c2'])
  })

  it('does not mutate the source snapshot', () => {
    const snapshot = codexSnapshot()
    const before = JSON.stringify(snapshot)
    mergeCompanionConversations(snapshot, [card('claude:l1', { provider: 'claude' })])
    expect(JSON.stringify(snapshot)).toBe(before)
  })
})

describe('removing a provider', () => {
  it('restores the codex-only snapshot exactly', () => {
    const snapshot = codexSnapshot()
    const merged = mergeCompanionConversations(snapshot, [
      card('claude:l1', { provider: 'claude' }),
      card('claude:done', { provider: 'claude', bucket: 'completed-unread', activityState: 'ongoing' })
    ])
    const restored = withoutCompanionProvider(merged, 'claude')
    expect(keys(restored.ongoing)).toEqual(keys(snapshot.ongoing))
    expect(keys(restored.all)).toEqual(keys(snapshot.all))
    expect(restored.ongoingCount).toBe(snapshot.ongoingCount)
    expect(restored.completedUnreadCount).toBe(snapshot.completedUnreadCount)
  })

  it('treats a card without a provider field as codex', () => {
    const merged = mergeCompanionConversations(codexSnapshot(), [card('claude:l1', { provider: 'claude' })])
    expect(keys(withoutCompanionProvider(merged, 'codex').ongoing)).toEqual(['claude:l1'])
  })
})

describe('virtual companion projects', () => {
  it('merges exact opaque project keys and keeps the Codex action capability', () => {
    const snapshot = snapshotWithProjects([{ key: 'p', name: 'EyPc', originalName: 'EyPc', actionAlias: 'codex-project' }])
    const merged = mergeCompanionConversations(snapshot, [card('claude:exact', {
      provider: 'claude', projectKey: 'p', projectName: 'Other label', originalProjectName: 'Other label'
    })])
    expect(merged.projects).toHaveLength(1)
    expect(merged.projects[0]).toMatchObject({
      key: 'p',
      actionAlias: 'codex-project',
      providers: ['codex', 'claude'],
      providerTaskCounts: { codex: 3, claude: 1 },
      virtual: true
    })
  })

  it('uses a normalized unique name only when it is unique on both sides', () => {
    const snapshot = snapshotWithProjects([{ key: 'codex-eypc', name: 'EyPc', originalName: 'EyPc', actionAlias: 'codex-project' }])
    const merged = mergeCompanionConversations(snapshot, [card('claude:named', {
      provider: 'claude', projectKey: 'claude-eypc', projectName: ' eYpC ', originalProjectName: ' eYpC '
    })])
    expect(merged.projects).toHaveLength(1)
    expect(merged.all.find((task) => task.key === 'claude:named')?.projectKey).toBe('codex-eypc')
  })

  it('keeps ambiguous names separate and marks the Claude-only project virtual', () => {
    const snapshot = snapshotWithProjects([
      { key: 'codex-a', name: 'Shared', originalName: 'Shared', actionAlias: 'a' },
      { key: 'codex-b', name: 'Shared', originalName: 'Shared', actionAlias: 'b' }
    ])
    const merged = mergeCompanionConversations(snapshot, [card('claude:ambiguous', {
      provider: 'claude', projectKey: 'claude-shared', projectName: 'Shared', originalProjectName: 'Shared'
    })])
    expect(merged.projects.map((project) => project.key)).toEqual(['codex-a', 'codex-b', 'claude-shared'])
    expect(merged.projects.at(-1)).toMatchObject({ providers: ['claude'], virtual: true })
    expect(merged.projects.at(-1)).not.toHaveProperty('actionAlias')
  })

  it('adds locally pinned Claude tasks to Pinned and removes the virtual project cleanly on disable', () => {
    const snapshot = snapshotWithProjects([])
    const merged = mergeCompanionConversations(snapshot, [card('claude:pinned', {
      provider: 'claude', projectKey: 'claude-only', projectName: 'Claude only', originalProjectName: 'Claude only', pinSource: 'local'
    })])
    expect(merged.projectSections.find((section) => section.id === 'pinned')?.entries[0]).toMatchObject({ kind: 'task' })
    expect(merged.projectSections.find((section) => section.id === 'projects')?.entries).toHaveLength(1)
    const stripped = withoutCompanionProvider(merged, 'claude')
    expect(stripped.projects).toHaveLength(0)
    expect(stripped.projectSections.every((section) => section.entries.length === 0)).toBe(true)
  })
})

describe('water ball channel readings', () => {
  const reading = (provider: CompanionProviderId, remainingPercent: number, label: string) =>
    ({ provider, remainingPercent, resetAt: null, label })

  const readings = {
    codex: { short: reading('codex', 60, '5h'), weekly: reading('codex', 40, 'Weekly') },
    claude: { short: reading('claude', 80, '5h'), weekly: reading('claude', 70, '7d') }
  }

  it('maps the shared layout to ring=codex and centre=claude', () => {
    const resolved = resolveCompanionWaterBallReadings({ liquid: 'codex', ring: 'codex', percent: 'claude' }, readings)
    expect(resolved.liquid?.remainingPercent).toBe(60)
    expect(resolved.ring?.remainingPercent).toBe(40)
    expect(resolved.percent?.remainingPercent).toBe(80)
  })

  it('keeps every channel on codex in compatibility mode', () => {
    const resolved = resolveCompanionWaterBallReadings({ liquid: 'codex', ring: 'codex', percent: 'codex' }, readings)
    expect(resolved.percent?.provider).toBe('codex')
  })

  it('falls back within a provider when the preferred window is missing', () => {
    const resolved = resolveCompanionWaterBallReadings(
      { liquid: 'codex', ring: 'codex', percent: 'claude' },
      { ...readings, claude: { short: null, weekly: reading('claude', 70, '7d') } }
    )
    expect(resolved.percent?.remainingPercent).toBe(70)
  })

  it('resolves to null rather than fabricating a zero when a provider has no reading', () => {
    const resolved = resolveCompanionWaterBallReadings(
      { liquid: 'codex', ring: 'codex', percent: 'claude' },
      { codex: readings.codex }
    )
    expect(resolved.percent).toBeNull()
    expect(resolved.liquid).not.toBeNull()
  })

  it('resolves an unassigned channel to null', () => {
    const resolved = resolveCompanionWaterBallReadings({ liquid: null, ring: null, percent: null }, readings)
    expect(resolved).toEqual({ liquid: null, ring: null, percent: null })
  })
})
