import {
  countConversationTasks,
  emptyConversationSnapshot,
  type CodexProjectCard,
  type CodexProjectEntry,
  type CodexProjectSection,
  type CodexTaskCard,
  type ConversationSnapshotV1
} from './codex'
import {
  companionTaskProvider,
  isCompanionProviderEnabled,
  type CompanionProviderEnablement,
  type CompanionProviderId,
  isCompanionAttentionState,
  isCompanionLivePhase
} from './companionProvider'
import { buildCodexTaskStatePackage, type CodexTaskStatePackageV1 } from './codexPresentation'
import type {
  CompanionProviderEvidenceBatchV3,
  CompanionTaskRelationObservationV1,
  CompanionTaskTopologySummaryV1
} from './companionTaskTopology'
import {
  COMPANION_V7_REVISIONS,
  type CompanionEvidenceChannelV7,
  type CompanionPlanArtifactStateV1
} from './generated/companionContractsV7'

export const COMPANION_TASK_KERNEL_REVISION = COMPANION_V7_REVISIONS.kernel
export const COMPANION_TASK_PACKAGE_REVISION = COMPANION_V7_REVISIONS.snapshot

export type CompanionTaskKind = 'codex-thread' | 'claude-session' | 'cursor-session' | 'topology-child' | 'local-pin'
export type CompanionProviderPinAuthority = 'app-server' | 'codexhost' | 'claude-metadata' | 'cursor-workspace'
export type CompanionTaskPhase = 'running' | 'waiting-input' | 'waiting-approval' | 'completed' | 'stopped' | 'unknown'
export type CompanionTaskEvidencePhaseV4 = 'running' | 'waiting-input' | 'waiting-approval' | 'completed' | 'interrupted' | 'failed' | 'unknown'
export type CompanionTaskFreshnessV4 = 'fresh' | 'verifying'
export type CompanionPlanLifecycleStateV6 = 'unknown' | 'ready' | 'cleared'
export type CompanionPlanClearReasonV6 = 'cancel' | 'execution-start' | 'archive' | 'removal' | ''

export interface CompanionTaskEvidenceV4 {
  provider: CompanionProviderId
  taskKey: string
  membership: 'present' | 'archived' | 'missing-candidate'
  phase: CompanionTaskEvidencePhaseV4
  authority: string
  exact: boolean
  turnStartedAt: number
  statusEnteredAt: number
  terminalAt: number
  unread: { known: boolean; value: boolean; revision: number }
  observationGeneration: number
  observedAt: number
  metadataRevision: number
  capabilityToken: string
}

export interface CanonicalTaskStateV4 {
  phase: CompanionTaskPhase
  unread: { known: boolean; value: boolean; revision: number }
  freshness: CompanionTaskFreshnessV4
  statusEnteredAt: number
  semanticRevision: number
  membershipRevision: number
  capabilities: CompanionCanonicalTaskV4['capabilities']
}
export type CompanionTaskCycleTier = 'attention' | 'plan' | 'active' | 'unread' | 'fallback' | 'none'
export type CompanionTaskDynamicGroup = 'pinned' | 'input' | 'active' | 'stopped' | 'unread' | 'completed' | 'none'

export interface CompanionTaskArchiveRequestV3 {
  expectedUpdatedAt: number
  expectedRevisionAt: number
  expectedCompletionAt?: number
  expectedLastTurnStartedAt: number
  expectedSourceFingerprint: string
  evidence: 'completed' | 'stopped'
}

/**
 * Anonymous canonical task material sent to the process-owned Kernel. Titles,
 * paths, provider payloads and raw provider identifiers never enter this
 * contract. `actionAlias` is the existing short-lived Host capability token.
 */
export interface CompanionCanonicalTaskV4 {
  key: string
  provider: CompanionProviderId
  kind: CompanionTaskKind
  phase: CompanionTaskPhase
  cycleTier: CompanionTaskCycleTier
  dynamicGroup: CompanionTaskDynamicGroup
  actionAlias: string
  revisionAt: number
  semanticRevision: number
  observationGeneration: number
  membershipRevision: number
  phaseRevision: number
  unreadRevision: number
  visibilityRevision: number
  statusEnteredAt: number
  turnStartedAt: number
  terminalAt: number
  metadataRevision: number
  capabilityToken: string
  freshness: CompanionTaskFreshnessV4
  lastQuestionAt: number
  createdAt: number
  displayOrder: number
  cycleOrder: number
  attentionOrder: number
  hidden: boolean
  unread: boolean
  unreadKnown: boolean
  planImplementation: boolean
  planReady: boolean
  planLifecycleRevision: number
  planLifecycleState?: CompanionPlanLifecycleStateV6
  planClearReason?: CompanionPlanClearReasonV6
  planArtifactState?: CompanionPlanArtifactStateV1
  planArtifactActionable?: boolean
  paused: boolean
  turnMode: 'plan' | 'default' | 'unknown'
  idleConfirmed: boolean
  localPin: boolean
  /** Provider-side pin; `null` when the provider has no pin lane for this row. */
  providerPin?: boolean | null
  providerPinOrder?: number
  providerPinAuthority?: CompanionProviderPinAuthority | ''
  manualPhase?: string
  dynamicEligible: boolean
  capabilities: {
    open: boolean
    archive: boolean
    pause: boolean
    resume: boolean
    executePlan: boolean
    /** The provider accepts an EyPc pin/unpin write (Codex app-server, CodexHost). */
    pin?: boolean
  }
  archiveRequest?: CompanionTaskArchiveRequestV3
  displayName?: string
  originalTitle?: string
  alias?: string
  projectKey?: string
  projectName?: string
  projectKind?: 'project' | 'chats'
  topology?: CompanionTaskTopologySummaryV1
}

/** Host-private material retained by the process graph; never emitted in V7 snapshots. */
export interface CompanionPrivateTaskNodeV5 extends CompanionCanonicalTaskV4 {
  family?: string
  role?: 'root' | 'child'
  standaloneEligible?: boolean
  error?: boolean
  causalKey?: string
  causalReliable?: boolean
}

export interface CompanionTaskPackageDraftV4 {
  schema: typeof COMPANION_V7_REVISIONS.draft
  producer: 'renderer' | 'host-preflight' | 'host-evidence'
  sourceTaskStateRevision: string
  draftRevision: number
  acceptedAt: number
  enabled: boolean
  providers: CompanionProviderEnablement
  complete: boolean
  focusedKey: string
  sourceGenerations: Record<CompanionProviderId, number>
  sourceLaneGenerations: CompanionSourceLaneGenerations
  providerHealth: CompanionProviderHealthV1
  relations?: CompanionTaskRelationObservationV1[]
  evidenceBatches?: Partial<Record<CompanionProviderId, CompanionProviderEvidenceBatchV3>>
}

export type CompanionSourceLane = CompanionEvidenceChannelV7
export type CompanionSourceLaneGenerations = Record<CompanionProviderId, Record<CompanionSourceLane, number>>

export type CompanionProviderHealthV1 = Record<CompanionProviderId, {
  status: 'ready' | 'unavailable' | 'degraded' | 'disabled'
  generation: number
  errorCode: string
}>

export interface CompanionTaskPackageViewsV4 {
  groups: {
    /** Locally pinned, finished and already-read roots; exempt from the activity window. */
    pinned: string[]
    input: string[]
    active: string[]
    stopped: string[]
    unread: string[]
    completed: string[]
  }
  counts: {
    input: number
    active: number
    unread: number
  }
  cycleKeys: string[]
  attentionKeys: {
    input: string[]
    completedUnread: string[]
    archive: string[]
  }
  pausedKeys: string[]
}

export interface CompanionTaskPackageV4 {
  schema: typeof COMPANION_TASK_PACKAGE_REVISION
  kernelRevision: typeof COMPANION_TASK_KERNEL_REVISION
  registryRevision: 'companion-provider-registry-v1'
  topologySchemaRevision: 'companion-task-topology-v2'
  commandRevision: 'companion-task-command-v1'
  packageRevision: number
  topologyRevision: number
  sourceTaskStateRevision: string
  publishedAt: number
  enabled: boolean
  providers: CompanionProviderEnablement
  complete: boolean
  freshness: CompanionTaskFreshnessV4
  focusedKey: string
  sourceGenerations: Record<CompanionProviderId, number>
  sourceLaneGenerations: CompanionSourceLaneGenerations
  providerHealth: CompanionProviderHealthV1
  tasks: CompanionCanonicalTaskV4[]
  views: CompanionTaskPackageViewsV4
}

/** Narrow source-compatibility aliases; every emitted runtime value is V7. */
export type CompanionTaskEvidencePhaseV3 = CompanionTaskEvidencePhaseV4
export type CompanionTaskFreshnessV3 = CompanionTaskFreshnessV4
export type CompanionTaskEvidenceV3 = CompanionTaskEvidenceV4
export type CanonicalTaskStateV3 = CanonicalTaskStateV4
export type CompanionCanonicalTaskV3 = CompanionCanonicalTaskV4
export type CompanionTaskPackageDraftV3 = CompanionTaskPackageDraftV4
export type CompanionTaskPackageViewsV3 = CompanionTaskPackageViewsV4
export type CompanionTaskPackageV3 = CompanionTaskPackageV4
export type CompanionCanonicalTaskV5 = CompanionCanonicalTaskV4
export type CompanionTaskPackageDraftV5 = CompanionTaskPackageDraftV4
export type CompanionTaskPackageViewsV5 = CompanionTaskPackageViewsV4
export type CompanionTaskSnapshotV5 = CompanionTaskPackageV4
export type CompanionCanonicalTaskV7 = CompanionCanonicalTaskV4
export type CompanionTaskPackageDraftV7 = CompanionTaskPackageDraftV4
export type CompanionTaskPackageViewsV7 = CompanionTaskPackageViewsV4
export type CompanionTaskViewV7 = Omit<CompanionCanonicalTaskV4,
  | 'actionAlias'
  | 'capabilityToken'
  | 'archiveRequest'
  | 'observationGeneration'
  | 'membershipRevision'
  | 'phaseRevision'
  | 'unreadRevision'
  | 'visibilityRevision'
  | 'metadataRevision'
  | 'planClearReason'
>
export type CompanionTaskSnapshotV7 = Omit<CompanionTaskPackageV4, 'tasks'> & {
  tasks: CompanionTaskViewV7[]
}
/** @deprecated V7 is the only emitted runtime contract. */
export type CompanionTaskViewV6 = CompanionTaskViewV7
/** @deprecated V7 is the only emitted runtime contract. */
export type CompanionTaskSnapshotV6 = CompanionTaskSnapshotV7

function allTaskCards(taskState: CodexTaskStatePackageV1): CodexTaskCard[] {
  const conversations = taskState.conversations
  if (conversations.all.length) return conversations.all
  return [
    ...conversations.ongoing,
    ...conversations.stopped,
    ...conversations.completedUnread,
    ...conversations.completed,
    ...conversations.hidden
  ]
}

export function emptyCompanionTaskPackage(
  providers: CompanionProviderEnablement = { codex: true, claude: false, cursor: false }
): CompanionTaskSnapshotV6 {
  return {
    schema: COMPANION_TASK_PACKAGE_REVISION,
    kernelRevision: COMPANION_TASK_KERNEL_REVISION,
    registryRevision: 'companion-provider-registry-v1',
    topologySchemaRevision: 'companion-task-topology-v2',
    commandRevision: 'companion-task-command-v1',
    packageRevision: 0,
    topologyRevision: 0,
    sourceTaskStateRevision: 'legacy',
    publishedAt: 0,
    enabled: false,
    providers: { ...providers },
    complete: false,
    freshness: 'verifying',
    focusedKey: '',
    sourceGenerations: { codex: 0, claude: 0, cursor: 0 },
    sourceLaneGenerations: {
      codex: { membership: 0, activity: 0, interaction: 0, unread: 0, planArtifact: 0, metadata: 0, topology: 0 },
      claude: { membership: 0, activity: 0, interaction: 0, unread: 0, planArtifact: 0, metadata: 0, topology: 0 },
      cursor: { membership: 0, activity: 0, interaction: 0, unread: 0, planArtifact: 0, metadata: 0, topology: 0 }
    },
    providerHealth: {
      codex: { status: providers.codex ? 'unavailable' : 'disabled', generation: 0, errorCode: '' },
      claude: { status: providers.claude ? 'unavailable' : 'disabled', generation: 0, errorCode: '' },
      cursor: { status: providers.cursor ? 'unavailable' : 'disabled', generation: 0, errorCode: '' }
    },
    tasks: [],
    views: {
      groups: { pinned: [], input: [], active: [], stopped: [], unread: [], completed: [] },
      counts: { input: 0, active: 0, unread: 0 },
      cycleKeys: [],
      attentionKeys: { input: [], completedUnread: [], archive: [] },
      pausedKeys: []
    }
  }
}

function projectedLegacyState(
  phase: CompanionTaskPhase,
  unread: boolean
): CodexTaskCard['state'] {
  if (phase === 'waiting-input') return 'waiting-input'
  if (phase === 'waiting-approval') return 'waiting-approval'
  if (phase === 'running') return 'running'
  if (phase === 'completed') return unread ? 'pending-review' : 'recent-activity'
  if (phase === 'stopped') return 'stopped'
  return 'attention'
}

function projectCanonicalCard(
  card: CodexTaskCard,
  task: CompanionTaskViewV6
): CodexTaskCard {
  const originalTitle = task.originalTitle || card.originalName || card.displayName || card.name
  const alias = task.alias || ''
  const displayName = alias || task.displayName || originalTitle
  const live = isCompanionLivePhase(task.phase)
  const completed = task.phase === 'completed'
  const stopped = task.phase === 'stopped'
  const unknown = task.phase === 'unknown'
  // `unknown` is itself the Kernel's semantic decision. The presentation
  // adapter maps it to a neutral, non-actionable legacy card; it must never
  // revive a Provider inventory's former running/stopped/unread state.
  const bucket: CodexTaskCard['bucket'] = unknown
    ? 'stopped'
    : live
      ? 'ongoing'
      : completed
        ? task.unread ? 'completed-unread' : 'completed'
        : 'stopped'
  const activityState: CodexTaskCard['activityState'] = unknown
    ? 'ongoing'
    : task.phase === 'waiting-input'
      ? 'waiting-input'
      : task.phase === 'waiting-approval'
        ? 'waiting-approval'
        : task.phase === 'running'
          ? 'active'
          : stopped
            ? 'stopped'
            : 'ongoing'
  const archiveCapability: CodexTaskCard['archiveCapability'] = unknown
    ? 'blocked-stopped'
    : live
      ? 'blocked-active'
      : task.capabilities.archive
        ? 'allowed'
        : 'blocked-stopped'
  const completionRevision = completed
    ? task.terminalAt || task.statusEnteredAt || task.revisionAt
    : 0
  const lastTurnStartedAt = task.turnStartedAt
    || task.lastQuestionAt
  // Existing cards receive display metadata from the inventory lane. An
  // unread-only revision must not overwrite that provider timestamp; causal
  // task ordering already has the independent `revisionAt` field.
  const sourceUpdatedAt = card.updatedAt || task.revisionAt
  const { actionAlias: _inventoryActionAlias, ...metadataCard } = card
  const next: CodexTaskCard = {
    ...metadataCard,
    displayName,
    name: displayName,
    originalName: originalTitle,
    alias: alias || undefined,
    ...(task.projectKey ? { projectKey: task.projectKey } : {}),
    ...(task.projectName ? { projectName: task.projectName } : {}),
    ...(task.projectKind ? { projectKind: task.projectKind } : {}),
    ...(task.provider === 'claude' ? { provider: 'claude', claudePhase: task.phase } : {}),
    bucket,
    activityState,
    archiveCapability,
    revisionAt: task.revisionAt,
    statusEnteredAt: task.statusEnteredAt || task.revisionAt,
    unreadState: completed && task.unreadKnown ? (task.unread ? 'unread' : 'read') : 'unknown',
    canonicalFreshness: task.freshness,
    companionPhase: task.phase,
    // Carried so the row can offer to clear it; the phase itself already
    // reads as the stand-in, which is what every other projection uses.
    manualPhase: (task.manualPhase || '') as CodexTaskCard['manualPhase'],
    state: projectedLegacyState(task.phase, task.unread),
    updatedAt: sourceUpdatedAt,
    lastQuestionAt: task.lastQuestionAt || card.lastQuestionAt,
    lastTurnStartedAt,
    createdAt: task.createdAt || card.createdAt,
    isHidden: task.hidden || task.paused,
    planReady: task.planReady,
    planLifecycleRevision: task.planLifecycleRevision,
    planPaused: task.paused,
    companionCapabilities: { ...task.capabilities },
    companionTopology: task.topology ? { ...task.topology } : undefined,
    hasCurrentActivity: live,
    canArchive: archiveCapability === 'allowed'
  }
  // A local pin wins the control's identity; a provider pin alone shows as
  // native (Codex Pinned section, Claude star, Cursor pinned agent).
  if (task.localPin) next.pinSource = 'local'
  else if (task.providerPin === true) next.pinSource = 'native'
  else if (task.providerPin === false) delete next.pinSource
  // Provider pin unknown (a Host without the lane): keep the legacy inventory
  // native marker, only never a stale local one.
  else if (next.pinSource === 'local') delete next.pinSource
  if (task.phase === 'waiting-input') next.activeFlags = ['waitingOnUserInput']
  else if (task.phase === 'waiting-approval') next.activeFlags = ['waitingOnApproval']
  else delete next.activeFlags
  if (isCompanionAttentionState(task.phase) && task.planImplementation) {
    next.planImplementationOnly = true
  } else delete next.planImplementationOnly
  if (completionRevision) {
    next.completionRevision = completionRevision
    next.lastTurnCompletedAt = completionRevision
    if (task.unread) next.pendingSince = completionRevision
    else delete next.pendingSince
  } else {
    delete next.completionRevision
    delete next.lastTurnCompletedAt
    delete next.pendingSince
  }
  if (task.hidden || task.paused) next.hiddenKind = 'task'
  else delete next.hiddenKind
  return next
}

function minimalCanonicalCard(task: CompanionTaskViewV6): CodexTaskCard {
  const name = task.displayName || (task.provider === 'codex' ? '新 Codex 任务' : task.provider === 'cursor' ? '新 Cursor 任务' : '新 Claude 任务')
  const projectName = task.projectName || (task.provider === 'codex' ? 'Codex Chats' : task.provider === 'cursor' ? 'Cursor Chats' : 'Claude Chats')
  const projectKey = task.projectKey || `${task.provider}:chats`
  const projectKind = task.projectKind || 'chats'
  const unknown = task.phase === 'unknown'
  return projectCanonicalCard({
    key: task.key,
    displayName: name,
    name,
    bucket: unknown ? 'stopped' : 'ongoing',
    activityState: 'ongoing',
    archiveCapability: unknown ? 'blocked-stopped' : 'blocked-active',
    revisionAt: task.revisionAt,
    statusEnteredAt: task.statusEnteredAt,
    unreadState: 'unknown',
    state: unknown ? 'attention' : 'running',
    updatedAt: task.revisionAt,
    source: 'current',
    originalName: name,
    projectKey,
    projectName,
    originalProjectName: projectName,
    projectKind,
    isHidden: false,
    provider: task.provider,
    hasCurrentActivity: false,
    canArchive: false
  }, task)
}

function projectCardsForProject(
  project: CodexProjectCard,
  byKey: ReadonlyMap<string, CodexTaskCard>,
  allCards?: readonly CodexTaskCard[]
): CodexProjectCard {
  const tasks = (allCards
    ? allCards.filter((task) => task.projectKey === project.key)
    : project.tasks.map((task) => byKey.get(task.key)).filter((task): task is CodexTaskCard => Boolean(task)))
    .filter((task) => !task.isHidden)
  const providerTaskCounts = tasks.reduce<NonNullable<CodexProjectCard['providerTaskCounts']>>((counts, task) => {
    const provider = companionTaskProvider(task)
    counts[provider] = (counts[provider] || 0) + 1
    return counts
  }, {})
  const countedProviders = (['codex', 'claude', 'cursor'] as CompanionProviderId[]).filter((provider) => Boolean(providerTaskCounts[provider]))
  const providers: CompanionProviderId[] = countedProviders.length
    ? countedProviders
    : project.providers?.length
      ? [...project.providers]
      : project.virtual ? [] : ['codex' as const]
  for (const provider of providers) providerTaskCounts[provider] ||= 0
  return {
    ...project,
    tasks,
    providers,
    providerTaskCounts
  }
}

function projectSection(
  section: CodexProjectSection,
  tasksByKey: ReadonlyMap<string, CodexTaskCard>,
  projectsByKey: ReadonlyMap<string, CodexProjectCard>
): CodexProjectSection {
  const entries = section.entries.map((entry): CodexProjectEntry | null => {
    if (entry.kind === 'task') {
      const task = tasksByKey.get(entry.task.key)
      return task && !task.isHidden ? { ...entry, task } : null
    }
    const project = projectsByKey.get(entry.project.key)
    return project ? { ...entry, project } : null
  }).filter((entry): entry is CodexProjectEntry => Boolean(entry))
  return { ...section, entries }
}

function projectConversationSnapshot(
  conversations: ConversationSnapshotV1,
  tasks: CodexTaskCard[]
): ConversationSnapshotV1 {
  const hidden = tasks
    .filter((task) => task.isHidden)
    .sort((left, right) => Number(right.planPaused === true) - Number(left.planPaused === true)
      || right.updatedAt - left.updatedAt
      || left.key.localeCompare(right.key))
  const visible = tasks.filter((task) => !task.isHidden)
  const ongoing = visible.filter((task) => task.bucket === 'ongoing')
  const stopped = visible.filter((task) => task.bucket === 'stopped')
  const completedUnread = visible.filter((task) => task.bucket === 'completed-unread')
  const completed = visible.filter((task) => task.bucket === 'completed')
  const all = [...tasks]
  const inputRequired = visible.filter((task) => isCompanionAttentionState(task.activityState))
  const completedTab = [...completedUnread, ...completed]
  const tasksByKey = new Map(all.map((task) => [task.key, task]))
  const projectedProjects = conversations.projects.map((project) => projectCardsForProject(project, tasksByKey, all))
  const hiddenProjects = conversations.hiddenProjects.map((project) => projectCardsForProject(project, tasksByKey, all))
  const existingProjectKeys = new Set([...projectedProjects, ...hiddenProjects].map((project) => project.key))
  const synthesizedProjects = [...new Map(all
    .filter((task) => !existingProjectKeys.has(task.projectKey))
    .map((task) => [task.projectKey, {
      key: task.projectKey,
      name: task.projectName,
      originalName: task.originalProjectName || task.projectName,
      kind: task.projectKind,
      nativePinned: false,
      collapsed: false,
      tasks: [] as CodexTaskCard[],
      providers: [companionTaskProvider(task)],
      virtual: true
    } satisfies CodexProjectCard] as const)).values()]
    .map((project) => projectCardsForProject(project, tasksByKey, all))
  const projects = [...projectedProjects, ...synthesizedProjects]
  const projectsByKey = new Map([...projects, ...hiddenProjects].map((project) => [project.key, project]))
  const projectedSections = conversations.projectSections.map((section) => projectSection(section, tasksByKey, projectsByKey))
  const representedProjects = new Set(projectedSections.flatMap((section) => section.entries
    .filter((entry) => entry.kind === 'project')
    .map((entry) => entry.project.key)))
  const representedTasks = new Set(projectedSections.flatMap((section) => section.entries
    .filter((entry) => entry.kind === 'task')
    .map((entry) => entry.task.key)))
  const pinnedTasks = visible.filter((task) => Boolean(task.pinSource) && !representedTasks.has(task.key))
  const missingProjects = projects.filter((project) => !representedProjects.has(project.key))
  const sectionById = new Map(projectedSections.map((section) => [section.id, section]))
  const ensureSection = (id: CodexProjectSection['id'], title: CodexProjectSection['title']) => {
    const existing = sectionById.get(id)
    if (existing) return existing
    const section: CodexProjectSection = { id, title, entries: [] }
    projectedSections.push(section)
    sectionById.set(id, section)
    return section
  }
  ensureSection('pinned', 'Pinned').entries.push(...pinnedTasks.map((task) => ({ kind: 'task' as const, task, pinSource: task.pinSource === 'native' ? 'native' as const : 'local' as const })))
  for (const project of missingProjects) {
    ensureSection(project.kind === 'chats' ? 'chats' : 'projects', project.kind === 'chats' ? 'Chats' : 'Projects')
      .entries.push({ kind: 'project', project })
  }
  return {
    ...conversations,
    ongoing,
    stopped,
    completedUnread,
    completed,
    pending: completedUnread,
    hidden,
    all,
    inputRequired,
    completedTab,
    projects,
    hiddenProjects,
    projectSections: projectedSections,
    ...countConversationTasks(ongoing, stopped, completedUnread, completed, hidden)
  }
}

/**
 * Applies the process Kernel's one final decision to cards, tabs, projects,
 * dynamic groups and compact counters in one atomic projection.
 */
export function applyCompanionTaskPackageViews(
  taskState: CodexTaskStatePackageV1,
  taskPackage: CompanionTaskSnapshotV6
): CodexTaskStatePackageV1 {
  const sourceByKey = new Map(allTaskCards(taskState).map((task) => [task.key, task]))
  const canonical = [...taskPackage.tasks].sort((left, right) => left.displayOrder - right.displayOrder)
  const cards = canonical
    .map((task) => {
      const source = sourceByKey.get(task.key)
      return source ? projectCanonicalCard(source, task) : minimalCanonicalCard(task)
    })
  const byKey = new Map(cards.map((task) => [task.key, task]))
  const project = (keys: readonly string[]) => keys.map((key) => byKey.get(key)).filter((task): task is CodexTaskCard => Boolean(task))
  const groups = {
    pinned: project(taskPackage.views.groups.pinned),
    input: project(taskPackage.views.groups.input),
    active: project(taskPackage.views.groups.active),
    stopped: project(taskPackage.views.groups.stopped),
    unread: project(taskPackage.views.groups.unread),
    completed: project(taskPackage.views.groups.completed)
  }
  const projected: CodexTaskStatePackageV1 = {
    ...taskState,
    conversations: projectConversationSnapshot(taskState.conversations, cards),
    dynamic: {
      ...taskState.dynamic,
      groups,
      tasks: [groups.pinned, groups.input, groups.active, groups.stopped, groups.unread, groups.completed].flat(),
      compactCounts: { ...taskPackage.views.counts }
    },
    generatedAt: Math.max(taskState.generatedAt, taskPackage.publishedAt)
  }
  return projected
}

/** Public Renderer adapter. It derives presentation only from one immutable V7
 * snapshot; the optional inventory contributes project chrome/health metadata
 * and is never allowed to reinterpret task state. */
export function projectCompanionTaskSnapshot(
  taskSnapshot: CompanionTaskSnapshotV6,
  inventory?: CodexTaskStatePackageV1
): CodexTaskStatePackageV1 {
  const source = inventory || buildCodexTaskStatePackage(emptyConversationSnapshot(), {
    sourceRevision: COMPANION_TASK_PACKAGE_REVISION,
    now: taskSnapshot.publishedAt
  })
  return applyCompanionTaskPackageViews(source, taskSnapshot)
}
