import {
  countConversationTasks,
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
  type CompanionProviderId
} from './companionProvider'
import type { CodexTaskStatePackageV1 } from './codexPresentation'

export const COMPANION_TASK_KERNEL_REVISION = 'companion-task-kernel-v4'
export const COMPANION_TASK_PACKAGE_REVISION = 'companion-task-package-v4'

export type CompanionTaskKind = 'codex-thread' | 'claude-session' | 'local-pin'
export type CompanionTaskPhase = 'running' | 'waiting-input' | 'waiting-approval' | 'completed' | 'stopped' | 'unknown'
export type CompanionTaskEvidencePhaseV4 = 'running' | 'waiting-input' | 'waiting-approval' | 'completed' | 'interrupted' | 'failed' | 'unknown'
export type CompanionTaskFreshnessV4 = 'fresh' | 'verifying'

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
export type CompanionTaskCycleTier = 'attention' | 'plan' | 'active' | 'fallback' | 'none'
export type CompanionTaskDynamicGroup = 'input' | 'active' | 'stopped' | 'unread' | 'completed' | 'none'

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
  paused: boolean
  turnMode: 'plan' | 'default' | 'unknown'
  idleConfirmed: boolean
  localPin: boolean
  dynamicEligible: boolean
  capabilities: {
    open: boolean
    archive: boolean
    pause: boolean
    resume: boolean
    executePlan: boolean
  }
  archiveRequest?: CompanionTaskArchiveRequestV3
  displayName?: string
  projectKey?: string
  projectName?: string
  projectKind?: 'project' | 'chats'
}

export interface CompanionTaskPackageDraftV4 {
  schema: 'companion-task-draft-v4'
  producer: 'renderer' | 'host-preflight' | 'host-evidence'
  sourceTaskStateRevision: string
  draftRevision: number
  acceptedAt: number
  enabled: boolean
  providers: CompanionProviderEnablement
  complete: boolean
  focusedKey: string
  sourceGenerations: {
    codex: number
    claude: number
  }
  sourceLaneGenerations: CompanionSourceLaneGenerations
  tasks: CompanionCanonicalTaskV4[]
}

export type CompanionSourceLane = 'membership' | 'phase' | 'unread'
export type CompanionSourceLaneGenerations = Record<CompanionProviderId, Record<CompanionSourceLane, number>>

export interface CompanionTaskPackageViewsV4 {
  groups: {
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
  packageRevision: number
  sourceTaskStateRevision: string
  publishedAt: number
  enabled: boolean
  providers: CompanionProviderEnablement
  complete: boolean
  freshness: CompanionTaskFreshnessV4
  focusedKey: string
  sourceGenerations: {
    codex: number
    claude: number
  }
  sourceLaneGenerations: CompanionSourceLaneGenerations
  tasks: CompanionCanonicalTaskV4[]
  views: CompanionTaskPackageViewsV4
}

/** Narrow source-compatibility aliases; every emitted runtime value is V4. */
export type CompanionTaskEvidencePhaseV3 = CompanionTaskEvidencePhaseV4
export type CompanionTaskFreshnessV3 = CompanionTaskFreshnessV4
export type CompanionTaskEvidenceV3 = CompanionTaskEvidenceV4
export type CanonicalTaskStateV3 = CanonicalTaskStateV4
export type CompanionCanonicalTaskV3 = CompanionCanonicalTaskV4
export type CompanionTaskPackageDraftV3 = CompanionTaskPackageDraftV4
export type CompanionTaskPackageViewsV3 = CompanionTaskPackageViewsV4
export type CompanionTaskPackageV3 = CompanionTaskPackageV4

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
  providers: CompanionProviderEnablement = { codex: true, claude: false }
): CompanionTaskPackageV4 {
  return {
    schema: COMPANION_TASK_PACKAGE_REVISION,
    kernelRevision: COMPANION_TASK_KERNEL_REVISION,
    packageRevision: 0,
    sourceTaskStateRevision: 'legacy',
    publishedAt: 0,
    enabled: false,
    providers: { ...providers },
    complete: false,
    freshness: 'verifying',
    focusedKey: '',
    sourceGenerations: { codex: 0, claude: 0 },
    sourceLaneGenerations: {
      codex: { membership: 0, phase: 0, unread: 0 },
      claude: { membership: 0, phase: 0, unread: 0 }
    },
    tasks: [],
    views: {
      groups: { input: [], active: [], stopped: [], unread: [], completed: [] },
      counts: { input: 0, active: 0, unread: 0 },
      cycleKeys: [],
      attentionKeys: { input: [], completedUnread: [], archive: [] },
      pausedKeys: []
    }
  }
}

function projectedLegacyState(
  phase: CompanionTaskPhase,
  unread: boolean,
  provider: CompanionProviderId
): CodexTaskCard['state'] {
  if (phase === 'waiting-input') return 'waiting-input'
  if (phase === 'waiting-approval') return 'waiting-approval'
  if (phase === 'running') return 'running'
  if (phase === 'completed') return unread ? 'pending-review' : 'recent-activity'
  if (phase === 'stopped') return 'stopped'
  return provider === 'claude' ? 'attention' : 'running'
}

function projectCanonicalCard(
  card: CodexTaskCard,
  task: CompanionCanonicalTaskV4
): CodexTaskCard {
  const live = task.phase === 'running' || task.phase === 'waiting-input' || task.phase === 'waiting-approval'
  const completed = task.phase === 'completed'
  const stopped = task.phase === 'stopped'
  const conservativeOngoing = task.phase === 'unknown' && task.provider === 'codex'
  const bucket: CodexTaskCard['bucket'] = live || conservativeOngoing
    ? 'ongoing'
    : completed
      ? task.unread ? 'completed-unread' : 'completed'
      : 'stopped'
  const activityState: CodexTaskCard['activityState'] = task.phase === 'waiting-input'
    ? 'waiting-input'
    : task.phase === 'waiting-approval'
      ? 'waiting-approval'
      : task.phase === 'running'
        ? 'active'
        : stopped
          ? 'stopped'
          : 'ongoing'
  const archiveCapability: CodexTaskCard['archiveCapability'] = live || task.phase === 'unknown'
    ? 'blocked-active'
    : task.capabilities.archive
      ? 'allowed'
      : 'blocked-stopped'
  const completionRevision = completed
    ? task.archiveRequest?.evidence === 'completed'
      ? task.archiveRequest.expectedRevisionAt
      : Math.max(
          card.completionRevision || 0,
          task.statusEnteredAt || task.phaseRevision || task.revisionAt
        )
    : 0
  const lastTurnStartedAt = task.archiveRequest?.expectedLastTurnStartedAt
    || card.lastTurnStartedAt
    || task.lastQuestionAt
  const sourceUpdatedAt = task.archiveRequest?.expectedUpdatedAt
    || Math.max(card.updatedAt, task.revisionAt)
  const next: CodexTaskCard = {
    ...card,
    ...(task.displayName ? { displayName: task.displayName, name: task.displayName } : {}),
    ...(task.projectKey ? { projectKey: task.projectKey } : {}),
    ...(task.projectName ? { projectName: task.projectName } : {}),
    ...(task.projectKind ? { projectKind: task.projectKind } : {}),
    ...(task.actionAlias ? { actionAlias: task.actionAlias } : {}),
    ...(task.provider === 'claude' ? { provider: 'claude', claudePhase: task.phase } : {}),
    bucket,
    activityState,
    archiveCapability,
    revisionAt: task.revisionAt,
    statusEnteredAt: task.statusEnteredAt || task.revisionAt,
    unreadState: completed && task.unreadKnown ? (task.unread ? 'unread' : 'read') : 'unknown',
    canonicalFreshness: task.freshness,
    state: projectedLegacyState(task.phase, task.unread, task.provider),
    updatedAt: sourceUpdatedAt,
    lastQuestionAt: task.lastQuestionAt || card.lastQuestionAt,
    lastTurnStartedAt,
    createdAt: task.createdAt || card.createdAt,
    isHidden: task.hidden || task.paused,
    planReady: task.planReady,
    planLifecycleRevision: task.planLifecycleRevision,
    planPaused: task.paused,
    companionCapabilities: { ...task.capabilities },
    hasCurrentActivity: live,
    canArchive: archiveCapability === 'allowed'
  }
  if (task.localPin) next.pinSource = 'local'
  else if (next.pinSource === 'local') delete next.pinSource
  if (task.phase === 'waiting-input') next.activeFlags = ['waitingOnUserInput']
  else if (task.phase === 'waiting-approval') next.activeFlags = ['waitingOnApproval']
  else delete next.activeFlags
  if ((task.phase === 'waiting-input' || task.phase === 'waiting-approval') && task.planImplementation) {
    next.planImplementationOnly = true
  } else delete next.planImplementationOnly
  if (completionRevision) {
    next.completionRevision = completionRevision
    next.lastTurnCompletedAt = task.archiveRequest?.expectedCompletionAt
      || Math.max(card.lastTurnCompletedAt || 0, completionRevision)
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

function minimalCanonicalCard(task: CompanionCanonicalTaskV4): CodexTaskCard {
  const name = task.displayName || (task.provider === 'codex' ? '新 Codex 任务' : '新 Claude 任务')
  const projectName = task.projectName || (task.provider === 'codex' ? 'Codex Chats' : 'Claude Chats')
  const projectKey = task.projectKey || `${task.provider}:chats`
  const projectKind = task.projectKind || 'chats'
  return projectCanonicalCard({
    key: task.key,
    ...(task.actionAlias ? { actionAlias: task.actionAlias } : {}),
    displayName: name,
    name,
    bucket: 'ongoing',
    activityState: 'ongoing',
    archiveCapability: 'blocked-active',
    revisionAt: task.revisionAt,
    statusEnteredAt: task.statusEnteredAt,
    unreadState: 'unknown',
    state: 'running',
    updatedAt: task.revisionAt,
    source: 'current',
    originalName: name,
    projectKey,
    projectName,
    originalProjectName: projectName,
    projectKind,
    isHidden: false,
    provider: task.provider
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
  const countedProviders = (['codex', 'claude'] as CompanionProviderId[]).filter((provider) => Boolean(providerTaskCounts[provider]))
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
  const inputRequired = visible.filter((task) => task.activityState === 'waiting-input' || task.activityState === 'waiting-approval')
  const completedTab = [...completedUnread, ...completed]
  const tasksByKey = new Map(all.map((task) => [task.key, task]))
  const projects = conversations.projects.map((project) => projectCardsForProject(project, tasksByKey, all))
  const hiddenProjects = conversations.hiddenProjects.map((project) => projectCardsForProject(project, tasksByKey, all))
  const projectsByKey = new Map([...projects, ...hiddenProjects].map((project) => [project.key, project]))
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
    projectSections: conversations.projectSections.map((section) => projectSection(section, tasksByKey, projectsByKey)),
    ...countConversationTasks(ongoing, stopped, completedUnread, completed, hidden)
  }
}

/**
 * Applies the process Kernel's one final decision to cards, tabs, projects,
 * dynamic groups and compact counters in one atomic projection.
 */
export function applyCompanionTaskPackageViews(
  taskState: CodexTaskStatePackageV1,
  taskPackage: CompanionTaskPackageV4
): CodexTaskStatePackageV1 {
  if (!taskPackage.complete) return taskState
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
    input: project(taskPackage.views.groups.input),
    active: project(taskPackage.views.groups.active),
    stopped: project(taskPackage.views.groups.stopped),
    unread: project(taskPackage.views.groups.unread),
    completed: project(taskPackage.views.groups.completed)
  }
  return {
    ...taskState,
    conversations: projectConversationSnapshot(taskState.conversations, cards),
    dynamic: {
      ...taskState.dynamic,
      groups,
      tasks: [groups.input, groups.active, groups.stopped, groups.unread, groups.completed].flat(),
      compactCounts: { ...taskPackage.views.counts }
    },
    generatedAt: Math.max(taskState.generatedAt, taskPackage.publishedAt)
  }
}
