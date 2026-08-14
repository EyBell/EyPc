import type {
  CodexProjectCard,
  CodexProjectEntry,
  CodexProjectSection,
  CodexTaskCard,
  ConversationSnapshotV1
} from './codex'
import { compareConversationTasks, orderCodexAttentionTasks } from './codex'
import { companionTaskProvider, type CompanionProviderId, isCompanionAttentionState } from './companionProvider'

/**
 * Companion aggregation.
 *
 * The Controller keeps one atomic task-state package. This module is the pure
 * seam that folds a second provider's task cards into the snapshot the Codex
 * pipeline already produced, so every downstream surface — dynamic projection,
 * badges, task cycle, floating card — consumes one merged inventory instead of
 * learning about providers individually.
 *
 * The merge is deliberately additive: the Codex projection is never re-run,
 * then every affected status bucket is sorted by the shared latest-question
 * comparator. That keeps provider and pin identity out of display position.
 */

/**
 * Buckets a card belongs to, derived from its own state rather than its source.
 *
 * Hidden cards land in `hidden` only, matching the Codex projection
 * (codex.ts:1765). That projection also stamps `hiddenKind: 'task'` on the way
 * in, and the restore control is gated on it (`FloatApp.taskCanRestore`), so a
 * foreign card that arrives here without the stamp gets a permanently disabled
 * 「显」 button — see `withHiddenKind` below.
 */
function bucketsFor(card: CodexTaskCard): Array<keyof ConversationSnapshotV1 & string> {
  if (card.isHidden) return ['hidden']
  const buckets: Array<keyof ConversationSnapshotV1 & string> = []
  if (card.bucket === 'ongoing') buckets.push('ongoing')
  if (card.bucket === 'stopped') buckets.push('stopped')
  if (card.bucket === 'completed-unread') buckets.push('completedUnread', 'completedTab')
  if (card.bucket === 'completed') buckets.push('completed', 'completedTab')
  if (card.bucket === 'ongoing' && (isCompanionAttentionState(card.activityState))) buckets.push('inputRequired')
  return buckets
}

/**
 * Stamps `hiddenKind: 'task'` on foreign cards entering the hidden bucket.
 *
 * The Codex projection does this inline (codex.ts:1765) and `restore()` plus
 * the 「显」 control both key off it, so foreign cards without the stamp were
 * hideable but never restorable — the button rendered permanently disabled and
 * batch restore never offered them. Cards that already carry a kind keep it.
 */
function withHiddenKind(cards: readonly CodexTaskCard[]): CodexTaskCard[] {
  return cards.map((card) => (card.hiddenKind ? card : { ...card, hiddenKind: 'task' as const }))
}

/**
 * Merges providers, then applies the shared latest-question order. Provider and
 * pin membership never affect position inside a status group.
 */
function mergeByRecency(target: readonly CodexTaskCard[], cards: readonly CodexTaskCard[]): CodexTaskCard[] {
  if (!cards.length) return target as CodexTaskCard[]
  const seen = new Set(target.map((card) => card.key))
  const additions = cards.filter((card) => !seen.has(card.key))
  if (!additions.length) return target as CodexTaskCard[]
  return [...target, ...additions].sort(compareConversationTasks)
}

function countWaiting(cards: readonly CodexTaskCard[]): number {
  return cards.filter((card) => isCompanionAttentionState(card.activityState)).length
}

function normalizedProjectName(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase()
}

function projectWithProviders(project: CodexProjectCard, tasks: CodexTaskCard[]): CodexProjectCard {
  const codex = tasks.filter((task) => companionTaskProvider(task) === 'codex').length
  const claude = tasks.filter((task) => companionTaskProvider(task) === 'claude').length
  const providers: CompanionProviderId[] = [
    ...(codex > 0 || Boolean(project.actionAlias) || project.kind === 'chats' ? ['codex' as const] : []),
    ...(claude > 0 ? ['claude' as const] : [])
  ]
  return {
    ...project,
    tasks,
    providers,
    providerTaskCounts: { codex, claude },
    virtual: providers.includes('claude')
  }
}

function sectionKeys(snapshot: ConversationSnapshotV1, sectionId: string, kind: 'task' | 'project'): string[] {
  return (snapshot.projectSections.find((section) => section.id === sectionId)?.entries || [])
    .filter((entry) => entry.kind === kind)
    .map((entry) => entry.kind === 'task' ? entry.task.key : entry.project.key)
}

function buildProjectSections(
  projects: readonly CodexProjectCard[],
  allTasks: readonly CodexTaskCard[],
  hiddenProjectKeys: ReadonlySet<string>,
  pinnedTaskKeys: readonly string[],
  pinnedProjectKeys: readonly string[],
  regularProjectKeys: readonly string[]
): CodexProjectSection[] {
  const taskByKey = new Map(allTasks.map((task) => [task.key, task] as const))
  const projectByKey = new Map(projects.map((project) => [project.key, project] as const))
  const usedTasks = new Set<string>()
  const usedProjects = new Set<string>()
  const pinned: CodexProjectEntry[] = []
  for (const key of pinnedTaskKeys) {
    const task = taskByKey.get(key)
    if (!task || usedTasks.has(key) || hiddenProjectKeys.has(task.projectKey)) continue
    usedTasks.add(key)
    const pinSource = task.pinSource || 'local'
    pinned.push({ kind: 'task', task: { ...task, pinSource }, pinSource })
  }
  for (const key of pinnedProjectKeys) {
    const project = projectByKey.get(key)
    if (!project || project.kind === 'chats' || hiddenProjectKeys.has(key) || usedProjects.has(key)) continue
    usedProjects.add(key)
    const pinSource = project.pinSource || 'local'
    pinned.push({
      kind: 'project',
      project: { ...project, tasks: project.tasks.filter((task) => !usedTasks.has(task.key)) },
      pinSource
    })
  }
  const orderedRegularKeys = [
    ...regularProjectKeys,
    ...projects.filter((project) => project.kind === 'project').map((project) => project.key)
  ]
  const regular: CodexProjectEntry[] = []
  for (const key of orderedRegularKeys) {
    const project = projectByKey.get(key)
    if (!project || project.kind !== 'project' || hiddenProjectKeys.has(key) || usedProjects.has(key)) continue
    usedProjects.add(key)
    regular.push({ kind: 'project', project: { ...project, tasks: project.tasks.filter((task) => !usedTasks.has(task.key)) } })
  }
  const chats = projects.find((project) => project.kind === 'chats' && !hiddenProjectKeys.has(project.key))
  return [
    { id: 'pinned', title: 'Pinned', entries: pinned },
    { id: 'projects', title: 'Projects', entries: regular },
    { id: 'chats', title: 'Chats', entries: chats ? [{ kind: 'project', project: { ...chats, tasks: chats.tasks.filter((task) => !usedTasks.has(task.key)) } }] : [] }
  ]
}

function mergeProjectProjection(
  base: ConversationSnapshotV1,
  snapshot: ConversationSnapshotV1,
  foreignCards: readonly CodexTaskCard[]
): ConversationSnapshotV1 {
  const foreignGroups = new Map<string, CodexTaskCard[]>()
  for (const card of foreignCards) {
    const group = foreignGroups.get(card.projectKey) || []
    group.push(card)
    foreignGroups.set(card.projectKey, group)
  }
  const codexProjects = base.projects.filter((project) => project.kind === 'project')
  const codexNames = new Map<string, CodexProjectCard[]>()
  for (const project of codexProjects) {
    const name = normalizedProjectName(project.originalName || project.name)
    codexNames.set(name, [...(codexNames.get(name) || []), project])
  }
  const foreignNames = new Map<string, string[]>()
  for (const [key, tasks] of foreignGroups) {
    const name = normalizedProjectName(tasks[0]?.originalProjectName || tasks[0]?.projectName || '')
    foreignNames.set(name, [...(foreignNames.get(name) || []), key])
  }

  const targetByForeignKey = new Map<string, { key: string; name: string; originalName: string }>()
  for (const [foreignKey, tasks] of foreignGroups) {
    const originalName = tasks[0]?.originalProjectName || tasks[0]?.projectName || 'Claude'
    const normalizedName = normalizedProjectName(originalName)
    const exact = codexProjects.find((project) => project.key === foreignKey)
    const uniqueName = !exact && codexNames.get(normalizedName)?.length === 1 && foreignNames.get(normalizedName)?.length === 1
      ? codexNames.get(normalizedName)![0]
      : null
    const target = exact || uniqueName
    targetByForeignKey.set(foreignKey, target
      ? { key: target.key, name: target.name, originalName: target.originalName }
      : { key: foreignKey, name: tasks[0]?.projectName || originalName, originalName })
  }

  const remap = (task: CodexTaskCard): CodexTaskCard => {
    if (companionTaskProvider(task) !== 'claude') return task
    const target = targetByForeignKey.get(task.projectKey)
    return target ? { ...task, projectKey: target.key, projectName: target.name, originalProjectName: target.originalName } : task
  }
  const remapList = (tasks: readonly CodexTaskCard[]) => tasks.map(remap)
  const next: ConversationSnapshotV1 = {
    ...snapshot,
    ongoing: remapList(snapshot.ongoing),
    stopped: remapList(snapshot.stopped),
    completedUnread: remapList(snapshot.completedUnread),
    completed: remapList(snapshot.completed),
    completedTab: remapList(snapshot.completedTab),
    inputRequired: remapList(snapshot.inputRequired),
    hidden: remapList(snapshot.hidden),
    all: remapList(snapshot.all)
  }
  next.pending = next.completedUnread

  const definitions = new Map(base.projects.map((project) => [project.key, project] as const))
  for (const [foreignKey, target] of targetByForeignKey) {
    if (definitions.has(target.key)) continue
    const tasks = foreignGroups.get(foreignKey) || []
    definitions.set(target.key, {
      key: target.key,
      name: target.name,
      originalName: target.originalName,
      kind: 'project',
      nativePinned: false,
      collapsed: false,
      tasks: []
    })
  }
  const projects = [...definitions.values()].map((project) => projectWithProviders(
    project,
    next.all.filter((task) => task.projectKey === project.key)
  ))
  const hiddenProjectKeys = new Set(base.hiddenProjects.map((project) => project.key))
  const pinnedTaskKeys = [
    ...sectionKeys(base, 'pinned', 'task'),
    ...next.all.filter((task) => task.pinSource === 'local' && companionTaskProvider(task) === 'claude').map((task) => task.key)
  ]
  const pinnedProjectKeys = sectionKeys(base, 'pinned', 'project')
  const regularProjectKeys = [
    ...sectionKeys(base, 'projects', 'project'),
    ...projects.filter((project) => project.virtual && project.providers?.length === 1).map((project) => project.key)
  ]
  next.projects = projects
  next.hiddenProjects = projects.filter((project) => hiddenProjectKeys.has(project.key))
  next.projectSections = buildProjectSections(
    projects,
    next.all,
    hiddenProjectKeys,
    pinnedTaskKeys,
    pinnedProjectKeys,
    regularProjectKeys
  )
  return next
}

/**
 * Merges foreign-provider cards into a Codex conversation snapshot.
 *
 * Counters are recomputed from the merged arrays rather than incremented, so a
 * card that lands in more than one bucket cannot be double counted and the
 * result is identical whether the merge runs once or is re-derived.
 */
export function mergeCompanionConversations(
  snapshot: ConversationSnapshotV1,
  cards: readonly CodexTaskCard[]
): ConversationSnapshotV1 {
  if (!cards.length) return snapshot
  const next: ConversationSnapshotV1 = { ...snapshot }
  const byBucket = new Map<string, CodexTaskCard[]>()
  for (const card of cards) {
    for (const bucket of bucketsFor(card)) {
      const list = byBucket.get(bucket) || []
      list.push(card)
      byBucket.set(bucket, list)
    }
  }
  next.ongoing = mergeByRecency(snapshot.ongoing, byBucket.get('ongoing') || [])
  next.stopped = mergeByRecency(snapshot.stopped, byBucket.get('stopped') || [])
  next.completedUnread = orderCodexAttentionTasks(mergeByRecency(snapshot.completedUnread, byBucket.get('completedUnread') || []))
  next.completed = mergeByRecency(snapshot.completed, byBucket.get('completed') || [])
  next.completedTab = [...next.completedUnread, ...next.completed]
  next.hidden = mergeByRecency(snapshot.hidden, withHiddenKind(byBucket.get('hidden') || []))
  // `pending` is the deprecated V1 alias of completedUnread and must not drift.
  next.pending = next.completedUnread
  next.all = mergeByRecency(snapshot.all, cards)
  // Attention shortcuts use the same complete hidden-inclusive set as Codex.
  next.inputRequired = orderCodexAttentionTasks(next.all.filter((card) => card.bucket === 'ongoing'
    && (isCompanionAttentionState(card.activityState))))

  next.ongoingCount = next.ongoing.length
  next.stoppedCount = next.stopped.length + next.hidden.filter((card) => card.bucket === 'stopped').length
  next.waitingCount = countWaiting(next.ongoing)
  next.runningCount = next.ongoing.filter((card) => card.activityState === 'active').length
  next.inputRequiredCount = [...next.ongoing, ...next.hidden].filter((card) => isCompanionAttentionState(card.activityState)).length
  next.completedUnreadCount = next.completedUnread.length
    + next.hidden.filter((card) => card.bucket === 'completed-unread').length
  next.completedCount = next.completed.length
  next.pendingCount = next.completedUnreadCount
  next.hiddenCount = next.hidden.length
  return mergeProjectProjection(snapshot, next, cards)
}

/** Removes one provider's cards from a merged snapshot. */
export function withoutCompanionProvider(
  snapshot: ConversationSnapshotV1,
  provider: CompanionProviderId
): ConversationSnapshotV1 {
  const keep = (cards: readonly CodexTaskCard[]) => cards.filter((card) => companionTaskProvider(card) !== provider)
  const next: ConversationSnapshotV1 = {
    ...snapshot,
    ongoing: keep(snapshot.ongoing),
    stopped: keep(snapshot.stopped),
    completedUnread: orderCodexAttentionTasks(keep(snapshot.completedUnread)),
    completed: keep(snapshot.completed),
    completedTab: [],
    inputRequired: [],
    hidden: keep(snapshot.hidden),
    all: keep(snapshot.all)
  }
  next.completedTab = [...next.completedUnread, ...next.completed]
  next.inputRequired = orderCodexAttentionTasks(next.all.filter((card) => card.bucket === 'ongoing'
    && (isCompanionAttentionState(card.activityState))))
  next.pending = next.completedUnread
  next.ongoingCount = next.ongoing.length
  next.stoppedCount = next.stopped.length + next.hidden.filter((card) => card.bucket === 'stopped').length
  next.waitingCount = countWaiting(next.ongoing)
  next.runningCount = next.ongoing.filter((card) => card.activityState === 'active').length
  next.inputRequiredCount = [...next.ongoing, ...next.hidden].filter((card) => isCompanionAttentionState(card.activityState)).length
  next.completedUnreadCount = next.completedUnread.length
    + next.hidden.filter((card) => card.bucket === 'completed-unread').length
  next.completedCount = next.completed.length
  next.pendingCount = next.completedUnreadCount
  next.hiddenCount = next.hidden.length
  const projects = snapshot.projects
    .map((project) => projectWithProviders(
      project,
      project.tasks.filter((task) => companionTaskProvider(task) !== provider)
    ))
    .filter((project) => project.kind === 'chats' || Boolean(project.actionAlias) || project.tasks.length > 0)
  const hiddenProjectKeys = new Set(snapshot.hiddenProjects
    .map((project) => project.key)
    .filter((key) => projects.some((project) => project.key === key)))
  next.projects = projects
  next.hiddenProjects = projects.filter((project) => hiddenProjectKeys.has(project.key))
  next.projectSections = buildProjectSections(
    projects,
    next.all,
    hiddenProjectKeys,
    sectionKeys(snapshot, 'pinned', 'task').filter((key) => next.all.some((task) => task.key === key)),
    sectionKeys(snapshot, 'pinned', 'project').filter((key) => projects.some((project) => project.key === key)),
    sectionKeys(snapshot, 'projects', 'project').filter((key) => projects.some((project) => project.key === key))
  )
  return next
}

/* ------------------------------------------------------------------ *
 * Quota aggregation
 * ------------------------------------------------------------------ */

export interface CompanionQuotaChannelReading {
  provider: CompanionProviderId
  remainingPercent: number
  resetAt: number | null
  label: string
}

export interface CompanionWaterBallReadings {
  liquid: CompanionQuotaChannelReading | null
  ring: CompanionQuotaChannelReading | null
  percent: CompanionQuotaChannelReading | null
}

/**
 * Resolves the three water-ball channels from the already-mapped provider
 * assignment plus each provider's current readings. A channel whose provider
 * has no usable reading resolves to null so the renderer can fall back to its
 * existing empty presentation instead of showing a fabricated zero.
 */
export function resolveCompanionWaterBallReadings(
  mapping: { liquid: CompanionProviderId | null; ring: CompanionProviderId | null; percent: CompanionProviderId | null },
  readings: Partial<Record<CompanionProviderId, { short: CompanionQuotaChannelReading | null; weekly: CompanionQuotaChannelReading | null }>>
): CompanionWaterBallReadings {
  const pick = (provider: CompanionProviderId | null, kind: 'short' | 'weekly') => {
    if (!provider) return null
    const source = readings[provider]
    if (!source) return null
    return source[kind] || (kind === 'weekly' ? source.short : source.weekly) || null
  }
  return {
    liquid: pick(mapping.liquid, 'short'),
    ring: pick(mapping.ring, 'weekly'),
    percent: pick(mapping.percent, 'short')
  }
}
