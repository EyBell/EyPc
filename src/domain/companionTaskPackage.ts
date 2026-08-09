import type { CodexTaskCard } from './codex'
import { orderCodexAttentionTasks } from './codex'
import {
  companionTaskProvider,
  isCompanionProviderEnabled,
  orderCompanionTasksForCycle,
  type CompanionProviderEnablement,
  type CompanionProviderId
} from './companionProvider'
import type { CodexTaskStatePackageV1 } from './codexPresentation'

export const COMPANION_TASK_KERNEL_REVISION = 'companion-task-kernel-v1'
export const COMPANION_TASK_PACKAGE_REVISION = 'companion-task-package-v1'

export type CompanionTaskKind = 'codex-thread' | 'claude-session' | 'local-pin'
export type CompanionTaskPhase = 'running' | 'waiting-input' | 'waiting-approval' | 'completed' | 'stopped' | 'unknown'
export type CompanionTaskCycleTier = 'attention' | 'plan-implementation' | 'active' | 'fallback' | 'none'
export type CompanionTaskDynamicGroup = 'input' | 'active' | 'stopped' | 'unread' | 'completed' | 'none'

export interface CompanionTaskArchiveRequestV1 {
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
export interface CompanionCanonicalTaskV1 {
  key: string
  provider: CompanionProviderId
  kind: CompanionTaskKind
  phase: CompanionTaskPhase
  cycleTier: CompanionTaskCycleTier
  dynamicGroup: CompanionTaskDynamicGroup
  actionAlias: string
  revisionAt: number
  statusEnteredAt: number
  displayOrder: number
  cycleOrder: number
  attentionOrder: number
  hidden: boolean
  unread: boolean
  planImplementation: boolean
  localPin: boolean
  dynamicEligible: boolean
  capabilities: {
    open: boolean
    archive: boolean
  }
  archiveRequest?: CompanionTaskArchiveRequestV1
}

export interface CompanionTaskPackageDraftV1 {
  schema: 'companion-task-draft-v1'
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
  tasks: CompanionCanonicalTaskV1[]
}

export interface CompanionTaskPackageViewsV1 {
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
}

export interface CompanionTaskPackageV1 {
  schema: typeof COMPANION_TASK_PACKAGE_REVISION
  kernelRevision: typeof COMPANION_TASK_KERNEL_REVISION
  packageRevision: number
  sourceTaskStateRevision: string
  publishedAt: number
  enabled: boolean
  providers: CompanionProviderEnablement
  complete: boolean
  freshness: 'fresh' | 'degraded'
  focusedKey: string
  sourceGenerations: {
    codex: number
    claude: number
  }
  tasks: CompanionCanonicalTaskV1[]
  views: CompanionTaskPackageViewsV1
}

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

function canonicalPhase(task: CodexTaskCard): CompanionTaskPhase {
  if (companionTaskProvider(task) === 'claude') return task.claudePhase || 'unknown'
  if (task.activityState === 'waiting-input') return 'waiting-input'
  if (task.activityState === 'waiting-approval') return 'waiting-approval'
  if (task.bucket === 'stopped' || task.activityState === 'stopped') return 'stopped'
  if (task.bucket === 'completed' || task.bucket === 'completed-unread') return 'completed'
  return 'running'
}

function dynamicGroupByKey(taskState: CodexTaskStatePackageV1): Map<string, CompanionTaskDynamicGroup> {
  const result = new Map<string, CompanionTaskDynamicGroup>()
  for (const group of ['input', 'active', 'stopped', 'unread', 'completed'] as const) {
    for (const task of taskState.dynamic.groups[group]) result.set(task.key, group)
  }
  return result
}

function cycleTier(task: CodexTaskCard, phase: CompanionTaskPhase): CompanionTaskCycleTier {
  if (task.isHidden) return 'none'
  if ((phase === 'waiting-input' || phase === 'waiting-approval') && task.planImplementationOnly !== true) return 'attention'
  if ((phase === 'waiting-input' || phase === 'waiting-approval') && task.planImplementationOnly === true) return 'plan-implementation'
  if (task.bucket === 'ongoing' && (task.activityState === 'active' || task.activityState === 'ongoing')) return 'active'
  if (task.pinSource === 'local' && task.bucket !== 'stopped') return 'fallback'
  return 'none'
}

function archiveRequest(task: CodexTaskCard, sourceFingerprint: string): CompanionTaskArchiveRequestV1 | undefined {
  if (companionTaskProvider(task) !== 'codex' || task.archiveCapability !== 'allowed') return undefined
  return {
    expectedUpdatedAt: task.updatedAt,
    expectedRevisionAt: task.revisionAt,
    ...(task.lastTurnCompletedAt ? { expectedCompletionAt: task.lastTurnCompletedAt } : {}),
    expectedLastTurnStartedAt: task.lastTurnStartedAt || 0,
    expectedSourceFingerprint: sourceFingerprint,
    evidence: task.bucket === 'stopped' ? 'stopped' : 'completed'
  }
}

export function buildCompanionTaskPackageDraft(
  taskState: CodexTaskStatePackageV1,
  options: {
    enabled: boolean
    providers: CompanionProviderEnablement
    complete: boolean
    focusedKey?: string
    draftRevision: number
    acceptedAt?: number
    sourceGenerations?: Partial<Record<CompanionProviderId, number>>
    localPins?: readonly string[]
  }
): CompanionTaskPackageDraftV1 {
  const cards = allTaskCards(taskState).filter((task) => isCompanionProviderEnabled(options.providers, companionTaskProvider(task)))
  const localPins = new Set(options.localPins || [])
  const cycleOrder = new Map(orderCompanionTasksForCycle(cards, [...localPins]).map((task, index) => [task.key, index]))
  const attentionOrder = new Map(orderCodexAttentionTasks(cards).map((task, index) => [task.key, index]))
  const dynamicGroups = dynamicGroupByKey(taskState)
  const sourceFingerprint = taskState.conversations.sourceFingerprint || ''
  const tasks = cards.map<CompanionCanonicalTaskV1>((task, displayOrder) => {
    const provider = companionTaskProvider(task)
    const phase = canonicalPhase(task)
    const localPin = task.pinSource === 'local' || localPins.has(task.key)
    const taskArchiveRequest = archiveRequest(task, sourceFingerprint)
    return {
      key: task.key,
      provider,
      kind: localPin ? 'local-pin' : provider === 'claude' ? 'claude-session' : 'codex-thread',
      phase,
      cycleTier: cycleTier({ ...task, ...(localPin ? { pinSource: 'local' as const } : {}) }, phase),
      dynamicGroup: dynamicGroups.get(task.key) || 'none',
      actionAlias: task.actionAlias || '',
      revisionAt: Math.max(0, Number(task.revisionAt) || 0),
      statusEnteredAt: Math.max(0, Number(task.statusEnteredAt || task.completionRevision || task.lastTurnStartedAt || task.updatedAt) || 0),
      displayOrder,
      cycleOrder: cycleOrder.get(task.key) ?? displayOrder,
      attentionOrder: attentionOrder.get(task.key) ?? displayOrder,
      hidden: task.isHidden === true,
      unread: task.bucket === 'completed-unread',
      planImplementation: task.planImplementationOnly === true,
      localPin,
      dynamicEligible: dynamicGroups.has(task.key),
      capabilities: {
        open: Boolean(task.actionAlias),
        archive: task.archiveCapability === 'allowed'
      },
      ...(taskArchiveRequest ? { archiveRequest: taskArchiveRequest } : {})
    }
  })
  return {
    schema: 'companion-task-draft-v1',
    producer: 'renderer',
    sourceTaskStateRevision: taskState.sourceRevision,
    draftRevision: Math.max(1, Math.trunc(options.draftRevision)),
    acceptedAt: Number.isFinite(options.acceptedAt) ? options.acceptedAt! : Date.now(),
    enabled: options.enabled,
    providers: { ...options.providers },
    complete: options.complete,
    focusedKey: typeof options.focusedKey === 'string' ? options.focusedKey : '',
    sourceGenerations: {
      codex: Math.max(0, Math.trunc(options.sourceGenerations?.codex || 0)),
      claude: Math.max(0, Math.trunc(options.sourceGenerations?.claude || 0))
    },
    tasks
  }
}

export function emptyCompanionTaskPackage(
  providers: CompanionProviderEnablement = { codex: true, claude: false }
): CompanionTaskPackageV1 {
  return {
    schema: COMPANION_TASK_PACKAGE_REVISION,
    kernelRevision: COMPANION_TASK_KERNEL_REVISION,
    packageRevision: 0,
    sourceTaskStateRevision: 'legacy',
    publishedAt: 0,
    enabled: false,
    providers: { ...providers },
    complete: false,
    freshness: 'degraded',
    focusedKey: '',
    sourceGenerations: { codex: 0, claude: 0 },
    tasks: [],
    views: {
      groups: { input: [], active: [], stopped: [], unread: [], completed: [] },
      counts: { input: 0, active: 0, unread: 0 },
      cycleKeys: [],
      attentionKeys: { input: [], completedUnread: [], archive: [] }
    }
  }
}

/** Applies the Kernel-owned dynamic keys/counts without rebuilding task state. */
export function applyCompanionTaskPackageViews(
  taskState: CodexTaskStatePackageV1,
  taskPackage: CompanionTaskPackageV1
): CodexTaskStatePackageV1 {
  if (!taskPackage.complete) return taskState
  const byKey = new Map(allTaskCards(taskState).map((task) => [task.key, task]))
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
    dynamic: {
      ...taskState.dynamic,
      groups,
      tasks: [groups.input, groups.active, groups.stopped, groups.unread, groups.completed].flat(),
      compactCounts: { ...taskPackage.views.counts }
    }
  }
}
