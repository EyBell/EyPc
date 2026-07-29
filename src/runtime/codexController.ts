import {
  acknowledgeCodexCompletedUnread,
  compareConversationTasks,
  countConversationTasks,
  conversationSnapshotFromReceipts,
  emptyCodexEnvironment,
  emptyCodexModelCatalog,
  emptyConversationSnapshot,
  hideCodexThread,
  isCodexTaskTab,
  normalizeCodexConfig,
  normalizeCodexEnvironment,
  normalizeCodexFirstPromptTimes,
  normalizeCodexQuota,
  normalizeCodexSettings,
  normalizeCodexVisibleTaskTab,
  projectConversations,
  restoreCodexThread,
  CODEX_TASK_STATE_REVISION,
  type CodexActivityDelta,
  type CodexActivityDeltaEntryV2,
  type CodexConfigSnapshotV1,
  type CodexColorSettings,
  type CodexEnvironmentSnapshotV1,
  type CodexExpandedSizePreference,
  type CodexHostProject,
  type CodexHostThread,
  type CodexLocalPin,
  type CodexModelCatalogSnapshotV1,
  type CodexQuotaSnapshotV1,
  type CodexSettings,
  type CodexState,
  type CodexTaskTab,
  type CodexTaskCard,
  type ConversationSnapshotV1
} from '../domain/codex'
import { normalizeCodexModelCatalog } from '../domain/codexNewThread'
import { projectCodexDynamicStatus } from '../domain/codexPresentation'
import type { AppState } from '../domain/types'
import type { CodexFloatWorkspaceDiagnostics, EypcPlatformApi } from '../platform/eypcPlatform'

export interface CodexRuntimeView {
  settings: CodexSettings
  environment: CodexEnvironmentSnapshotV1
  quota: CodexQuotaSnapshotV1
  config: CodexConfigSnapshotV1
  modelCatalog: CodexModelCatalogSnapshotV1
  newThreadContextFingerprint: string
  conversations: ConversationSnapshotV1
  refreshing: boolean
  floatHost: {
    displayId: string
    expandedWidth: number
    expandedHeight: number
    expandedManual: boolean
    workspaceVisibility?: CodexFloatWorkspaceDiagnostics
  }
}

export interface CodexFloatSnapshotV1 {
  version: 1 | 2
  /** Optional for old floating renderers; current Controller snapshots always include it. */
  taskStateRevision?: string
  style: CodexSettings['displayStyle']
  conversationInboxEnabled: boolean
  compactFields: CodexSettings['compactFields']
  expandedFields: CodexSettings['expandedFields']
  colors: CodexSettings['colors']
  counterColors?: CodexSettings['counterColors']
  waterAppearance: CodexSettings['waterAppearance']
  /** Optional only for compatibility with an older floating child; current snapshots always include it. */
  expandedCardAppearance?: CodexSettings['expandedCardAppearance']
  expandedSizes: CodexSettings['expandedSizes']
  quota: CodexQuotaSnapshotV1
  config: CodexConfigSnapshotV1
  modelCatalog: CodexModelCatalogSnapshotV1
  newThreadContextFingerprint: string
  newThreadModelPolicy: CodexSettings['newThreadModelPolicy']
  newThreadPreferredModel: string
  conversations: ConversationSnapshotV1
  taskArchive: { key: string; status: 'idle' | 'archiving' | 'error'; message: string }
  projectArchive: { key: string; status: 'idle' | 'archiving' | 'error'; message: string }
  timeWindowDays: number
  keybindings?: Array<{ actionId: string; shortcutId: string; layer: string; when: string; weight: number }>
  generatedAt: number
}

export interface CodexControllerOptions {
  platform: EypcPlatformApi
  getAppState(): AppState
  save(): void
  notify(): void
  setMessage(message: string): void
}

function quotaDelay(settings: CodexSettings): number {
  return settings.quotaRefreshMinutes > 0 ? settings.quotaRefreshMinutes * 60_000 : Number.POSITIVE_INFINITY
}

function taskDelay(settings: CodexSettings): number {
  return settings.conversationInboxEnabled && settings.taskRefreshSeconds > 0 ? settings.taskRefreshSeconds * 1000 : Number.POSITIVE_INFINITY
}

function completionPresentationDelay(settings: CodexSettings): number {
  return settings.completionPresentationDelayMs
}

const MIN_INVENTORY_DISAPPEARANCE_HOLD_MS = 3_000
const URGENT_STRUCTURAL_REFRESH_DELAY_MS = 50
const NORMAL_STRUCTURAL_REFRESH_DELAY_MS = 200
const TASK_STATE_RELOAD_MESSAGE = 'Codex 任务状态桥版本不一致，请在 uTools 中重新加载 EyPc 插件'

function inventoryDisappearanceHold(settings: CodexSettings): number {
  const refreshDelay = taskDelay(settings)
  return Number.isFinite(refreshDelay)
    ? Math.max(MIN_INVENTORY_DISAPPEARANCE_HOLD_MS, refreshDelay)
    : MIN_INVENTORY_DISAPPEARANCE_HOLD_MS
}

type CompletionPresentationHold = {
  expiresAt: number
}

type ActivityExitBaseline = Pick<CodexHostThread, 'lastTurnStatus' | 'lastTurnStartedAt' | 'lastTurnCompletedAt' | 'desktopActiveSince'>

function isAuthoritativeCompletedAfterExit(thread: CodexHostThread, baseline: ActivityExitBaseline): boolean {
  if (thread.lastTurnStatus !== 'completed') return false
  const startedAt = Number.isFinite(thread.lastTurnStartedAt) ? thread.lastTurnStartedAt! : 0
  const completedAt = Number.isFinite(thread.lastTurnCompletedAt) ? thread.lastTurnCompletedAt! : 0
  if (!startedAt || !completedAt) return false
  const activeSince = Number.isFinite(baseline.desktopActiveSince) ? baseline.desktopActiveSince! : 0
  if (activeSince > 0 && completedAt <= activeSince) return false
  const baselineStartedAt = Number.isFinite(baseline.lastTurnStartedAt) ? baseline.lastTurnStartedAt! : 0
  return startedAt > baselineStartedAt
    || baseline.lastTurnStatus === 'inProgress' && startedAt === baselineStartedAt
    || baseline.lastTurnStatus === 'completed'
      && startedAt === baselineStartedAt
      && completedAt > (Number.isFinite(baseline.lastTurnCompletedAt) ? baseline.lastTurnCompletedAt! : 0)
}

type InventoryDisappearanceCandidate = {
  signature: string
  firstSeenAt: number
  confirmations: number
}

type StructuralRefreshPriority = 'normal' | 'urgent'

function isDesktopLiveActiveThread(thread: CodexHostThread): boolean {
  if (thread.statusAuthority !== 'desktop-live' || thread.status !== 'active') return false
  if (thread.activeFlags.includes('waitingOnUserInput') || thread.activeFlags.includes('waitingOnApproval')) return true
  if (thread.lastTurnStatus !== 'completed') return true
  const activeSince = Number.isFinite(thread.desktopActiveSince) ? thread.desktopActiveSince! : 0
  const completedAt = Number.isFinite(thread.lastTurnCompletedAt) ? thread.lastTurnCompletedAt! : 0
  const startedAt = Number.isFinite(thread.lastTurnStartedAt) ? thread.lastTurnStartedAt! : 0
  if (activeSince > 0 && completedAt > activeSince) return false
  if (activeSince > 0 && completedAt > 0 && activeSince >= completedAt && startedAt > 0 && activeSince >= startedAt) return false
  if (activeSince <= 0 && completedAt > 0) return false
  return true
}

function hasFreshTurnOutcomeAfterExit(thread: CodexHostThread, baseline: ActivityExitBaseline, targetedAfterExit = false): boolean {
  if (!thread.lastTurnStatus || thread.lastTurnStatus === 'inProgress' || !Number.isFinite(thread.lastTurnStartedAt) || thread.lastTurnStartedAt! <= 0) return false
  if (targetedAfterExit) return true
  const baselineStartedAt = Number.isFinite(baseline.lastTurnStartedAt) ? baseline.lastTurnStartedAt! : 0
  return thread.lastTurnStartedAt! > baselineStartedAt
    || baseline.lastTurnStatus === 'inProgress' && thread.lastTurnStartedAt === baselineStartedAt
}

function preserveLatestTurnEvidence(thread: CodexHostThread, previous: CodexHostThread | undefined): CodexHostThread {
  if (!previous) return thread
  const candidate = thread.updatedAt < previous.updatedAt ? { ...thread, updatedAt: previous.updatedAt } : thread
  const previousStartedAt = Number.isFinite(previous.lastTurnStartedAt) ? previous.lastTurnStartedAt! : 0
  const nextStartedAt = Number.isFinite(candidate.lastTurnStartedAt) ? candidate.lastTurnStartedAt! : 0
  const previousCompletedAt = Number.isFinite(previous.lastTurnCompletedAt) ? previous.lastTurnCompletedAt! : 0
  const nextCompletedAt = Number.isFinite(candidate.lastTurnCompletedAt) ? candidate.lastTurnCompletedAt! : 0
  const regressedRevision = previousStartedAt > 0 && nextStartedAt < previousStartedAt
  const regressedCompletedOutcome = previousStartedAt > 0
    && nextStartedAt === previousStartedAt
    && previous.lastTurnStatus === 'completed'
    && candidate.lastTurnStatus !== 'completed'
  const regressedCompletionTimestamp = previousStartedAt > 0
    && nextStartedAt === previousStartedAt
    && previous.lastTurnStatus === 'completed'
    && candidate.lastTurnStatus === 'completed'
    && previousCompletedAt > 0
    && nextCompletedAt < previousCompletedAt
  if (!regressedRevision && !regressedCompletedOutcome && !regressedCompletionTimestamp) return candidate
  const stable = {
    ...candidate,
    lastTurnStatus: previous.lastTurnStatus,
    lastTurnStartedAt: previous.lastTurnStartedAt
  }
  if (previous.lastTurnStatus === 'completed' && Number.isFinite(previous.lastTurnCompletedAt) && previous.lastTurnCompletedAt! > 0) {
    stable.lastTurnCompletedAt = previous.lastTurnCompletedAt
  } else {
    delete stable.lastTurnCompletedAt
  }
  return stable
}

function isPresentationOngoingThread(thread: CodexHostThread): boolean {
  return isDesktopLiveActiveThread(thread) || thread.lastTurnStatus !== 'completed'
}

function isCompletedReadThread(thread: CodexHostThread): boolean {
  return !isPresentationOngoingThread(thread)
    && thread.lastTurnStatus === 'completed'
    && thread.hasUnreadTurn !== true
}

function isUnreadOrOngoingThread(thread: CodexHostThread): boolean {
  return thread.hasUnreadTurn === true || isPresentationOngoingThread(thread)
}

function hasSameActivityState(previous: CodexHostThread, next: CodexHostThread): boolean {
  return previous.status === next.status
    && [...previous.activeFlags].sort().join('|') === [...next.activeFlags].sort().join('|')
    && previous.statusAuthority === next.statusAuthority
    && previous.desktopActiveSince === next.desktopActiveSince
    && previous.hasUnreadTurn === next.hasUnreadTurn
    && previous.unreadAuthority === next.unreadAuthority
    && previous.lastTurnStatus === next.lastTurnStatus
    && previous.lastTurnStartedAt === next.lastTurnStartedAt
    && previous.lastTurnCompletedAt === next.lastTurnCompletedAt
}

export function createCodexController(options: CodexControllerOptions) {
  // Direct test/custom adapters may omit the capability. The production
  // platform adapter always supplies either the exact revision or `legacy`.
  const taskStateCompatible = options.platform.codex.taskStateRevision === undefined
    || options.platform.codex.taskStateRevision === CODEX_TASK_STATE_REVISION
  let quota = normalizeCodexQuota(options.getAppState().codex.cachedQuota)
  if (quota.updatedAt > 0 && quota.status === 'ok') quota = { ...quota, status: 'stale' }
  let config = normalizeCodexConfig(options.getAppState().codex.cachedConfig)
  let modelCatalog = emptyCodexModelCatalog()
  let newThreadContextFingerprint = ''
  let environment = emptyCodexEnvironment()
  const incompatibleTaskStateSnapshot = () => ({
    ...emptyConversationSnapshot('error'),
    updatedAt: Date.now(),
    errorCode: 'preload-version-mismatch',
    errorMessage: TASK_STATE_RELOAD_MESSAGE
  })
  let rawConversations = taskStateCompatible
    ? conversationSnapshotFromReceipts(options.getAppState().codex.receipts)
    : incompatibleTaskStateSnapshot()
  let conversations = rawConversations
  let taskCycleKey = ''
  let lastThreads: CodexHostThread[] = []
  let lastProjects: CodexHostProject[] = []
  let lastThreadsPartial = false
  let lastTaskAuthority: 'live' | 'mixed' | 'inventory-only' = 'inventory-only'
  let lastSourceCount = 0
  let lastSourceFingerprint = ''
  let lastCompleteness: 'verified' | undefined
  let lastRawSourceCount = 0
  let lastEligibleSourceCount = 0
  let lastExcludedSourceCount = 0
  let lastNonConversationCount = 0
  let taskArchive = { key: '', status: 'idle' as 'idle' | 'archiving' | 'error', message: '' }
  let projectArchive = { key: '', status: 'idle' as 'idle' | 'archiving' | 'error', message: '' }
  let refreshing = false
  let started = false
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let activityTimer: ReturnType<typeof setTimeout> | null = null
  let structuralRefreshTimer: ReturnType<typeof setTimeout> | null = null
  let structuralRefreshPending = false
  let structuralRefreshPriority: StructuralRefreshPriority = 'normal'
  let completionPresentationTimer: ReturnType<typeof setTimeout> | null = null
  const completionPresentationHolds = new Map<string, CompletionPresentationHold>()
  const activityExitAt = new Map<string, number>()
  const activityExitBaselines = new Map<string, ActivityExitBaseline>()
  let inFlight: Promise<void> | null = null
  let activityInFlight: Promise<void> | null = null
  const archivingKeys = new Set<string>()
  let stopActivityListener: (() => void) | null = null
  let activityFailureCount = 0
  let lastActivityGeneration = 0
  let environmentInFlight: Promise<void> | null = null
  let environmentGeneration = 0
  let refreshGeneration = 0
  let lastQuotaReadAt = quota.updatedAt
  let lastTaskReadAt = options.getAppState().codex.lastTaskScanAt
  let cardColorPreview: CodexColorSettings | null = null
  let inventoryDisappearanceCandidate: InventoryDisappearanceCandidate | null = null

  function codexState(): CodexState {
    return options.getAppState().codex
  }

  function resetInventoryDisappearanceCandidate() {
    inventoryDisappearanceCandidate = null
  }

  // An explicit provider archive event is different from an absent row in a
  // complete snapshot. The former identifies one already-published anonymous
  // key, so it can disappear immediately while an urgent scan revalidates it.
  // All ordinary snapshot omissions continue through RAW-090's quarantine.
  function removeExplicitlyArchivedKeys(keys: readonly string[] | undefined, receivedAt: number): boolean {
    if (!keys?.length || !lastThreads.length) return false
    const knownKeys = new Set(lastThreads.map((thread) => thread.key))
    const archived = new Set(keys.filter((key) => typeof key === 'string' && knownKeys.has(key)))
    if (!archived.size) return false
    lastThreads = lastThreads.filter((thread) => !archived.has(thread.key))
    codexState().receipts = codexState().receipts.filter((receipt) => !archived.has(receipt.key))
    for (const key of archived) {
      completionPresentationHolds.delete(key)
      activityExitAt.delete(key)
      activityExitBaselines.delete(key)
    }
    if (archived.has(taskCycleKey)) taskCycleKey = ''
    resetInventoryDisappearanceCandidate()
    publishConversationProjection({ receivedAt, advanceScan: false, status: rawConversations.status })
    options.save()
    options.notify()
    return true
  }

  // Host completeness validates one scan's structure, not temporal deletion.
  // Keep the published inventory until the same absence survives a real
  // reconciliation interval; explicit verified mutations remove keys earlier.
  function inventoryDisappearanceDecision(threads: CodexHostThread[], now = Date.now()): { accept: boolean; firstObservation: boolean; missingCount: number } {
    if (!lastThreads.length) {
      resetInventoryDisappearanceCandidate()
      return { accept: true, firstObservation: false, missingCount: 0 }
    }
    const incomingKeys = new Set(threads.map((thread) => thread.key))
    const missingKeys = lastThreads.map((thread) => thread.key).filter((key) => !incomingKeys.has(key)).sort()
    if (!missingKeys.length) {
      resetInventoryDisappearanceCandidate()
      return { accept: true, firstObservation: false, missingCount: 0 }
    }
    const signature = missingKeys.join('|')
    const firstObservation = inventoryDisappearanceCandidate?.signature !== signature
    const candidate = firstObservation
      ? { signature, firstSeenAt: now, confirmations: 1 }
      : { ...inventoryDisappearanceCandidate!, confirmations: inventoryDisappearanceCandidate!.confirmations + 1 }
    inventoryDisappearanceCandidate = candidate
    const hold = inventoryDisappearanceHold(codexState().settings)
    const accept = candidate.confirmations >= 2 && now - candidate.firstSeenAt >= hold
    if (accept) resetInventoryDisappearanceCandidate()
    return { accept, firstObservation, missingCount: missingKeys.length }
  }

  function isFeatureEnabled(): boolean {
    return options.getAppState().settings.featureConfigs.find((item) => item.id === 'codex')?.enabled !== false
  }

  function shouldRun(): boolean {
    const state = options.getAppState()
    return isFeatureEnabled() && (state.activeTab === 'codex' || state.codex.settings.floatEnabled)
  }

  function publishTaskStateCompatibilityError() {
    if (taskStateCompatible) return
    resetInventoryDisappearanceCandidate()
    lastThreads = []
    lastProjects = []
    lastSourceFingerprint = ''
    lastCompleteness = undefined
    lastActivityGeneration = 0
    if (rawConversations.errorCode !== 'preload-version-mismatch' || rawConversations.all.length) {
      resetCompletionPresentation(incompatibleTaskStateSnapshot())
    }
  }

  function clearTimer() {
    if (timer) clearTimeout(timer)
    timer = null
  }

  function clearActivityTimer() {
    if (activityTimer) clearTimeout(activityTimer)
    activityTimer = null
  }

  function clearStructuralRefreshTimer() {
    if (structuralRefreshTimer) clearTimeout(structuralRefreshTimer)
    structuralRefreshTimer = null
  }

  function resetStructuralRefresh() {
    clearStructuralRefreshTimer()
    structuralRefreshPending = false
    structuralRefreshPriority = 'normal'
  }

  function clearCompletionPresentationTimer() {
    if (completionPresentationTimer) clearTimeout(completionPresentationTimer)
    completionPresentationTimer = null
  }

  function isPresentedRunning(task: CodexTaskCard | undefined): task is CodexTaskCard & {
    bucket: 'ongoing'
    state: 'running'
    activityState: 'active' | 'ongoing'
  } {
    return task?.bucket === 'ongoing'
      && task.state === 'running'
      && (task.activityState === 'active' || task.activityState === 'ongoing')
  }

  function isCompletedTask(task: CodexTaskCard | undefined): boolean {
    return task?.bucket === 'completed' || task?.bucket === 'completed-unread'
  }

  function isTerminalPresentationTask(task: CodexTaskCard | undefined): task is CodexTaskCard {
    return isCompletedTask(task)
  }

  function heldOngoingTask(task: CodexTaskCard): CodexTaskCard {
    const held = {
      ...task,
      bucket: 'ongoing' as const,
      activityState: 'ongoing' as const,
      archiveCapability: 'blocked-active' as const,
      state: 'running' as const,
      canArchive: false
    }
    delete held.completionRevision
    delete held.unreadState
    delete held.pendingSince
    delete held.lastTurnCompletedAt
    delete held.lastTurnDurationMs
    return held
  }

  function applyCompletionPresentationHolds(next: ConversationSnapshotV1): ConversationSnapshotV1 {
    if (!completionPresentationHolds.size) return next
    const heldKeys = new Set(next.all
      .filter((task) => completionPresentationHolds.has(task.key) && isTerminalPresentationTask(task))
      .map((task) => task.key))
    if (!heldKeys.size) return next

    const presentedByKey = new Map<string, CodexTaskCard>()
    const presentTask = (task: CodexTaskCard) => {
      const cached = presentedByKey.get(task.key)
      if (cached) return cached
      const hold = completionPresentationHolds.get(task.key)
      const presented = hold && isTerminalPresentationTask(task) ? heldOngoingTask(task) : task
      presentedByKey.set(task.key, presented)
      return presented
    }
    const uniqueSorted = (tasks: CodexTaskCard[]) => [...new Map(tasks.map((task) => [task.key, task] as const)).values()]
      .sort(compareConversationTasks)
    const heldVisible = next.all.filter((task) => heldKeys.has(task.key) && !task.isHidden)
    const ongoing = uniqueSorted([...next.ongoing.map(presentTask), ...heldVisible.map(presentTask)])
    const stopped = next.stopped.map(presentTask)
    const completedUnread = next.completedUnread.filter((task) => !heldKeys.has(task.key)).map(presentTask)
    const completed = next.completed.filter((task) => !heldKeys.has(task.key)).map(presentTask)
    const hidden = next.hidden.map(presentTask).sort(compareConversationTasks)
    const all = next.all.map(presentTask)
    const inputRequired = next.inputRequired.map(presentTask)
    const completedTab = [...completedUnread, ...completed].sort(compareConversationTasks)
    const presentProject = (project: ConversationSnapshotV1['projects'][number]) => ({
      ...project,
      tasks: project.tasks.map(presentTask)
    })
    const projectSections = next.projectSections.map((section) => ({
      ...section,
      entries: section.entries.map((entry) => entry.kind === 'task'
        ? { ...entry, task: presentTask(entry.task) }
        : { ...entry, project: presentProject(entry.project) })
    }))
    const counts = countConversationTasks(ongoing, stopped, completedUnread, completed, hidden)

    return {
      ...next,
      ongoing,
      stopped,
      completedUnread,
      completed,
      pending: completedUnread,
      hidden,
      all,
      inputRequired,
      completedTab,
      projectSections,
      projects: next.projects.map(presentProject),
      hiddenProjects: next.hiddenProjects.map(presentProject),
      removedProjects: next.removedProjects.map(presentProject),
      ...counts
    }
  }

  function scheduleCompletionPresentationRelease() {
    clearCompletionPresentationTimer()
    if (disposed || !shouldRun() || !completionPresentationHolds.size) return
    const expiresAt = Math.min(...[...completionPresentationHolds.values()].map((hold) => hold.expiresAt))
    completionPresentationTimer = setTimeout(() => {
      completionPresentationTimer = null
      const now = Date.now()
      let changed = false
      for (const [key, hold] of completionPresentationHolds) {
        if (hold.expiresAt <= now) {
          completionPresentationHolds.delete(key)
          changed = true
        }
      }
      if (changed) {
        conversations = applyCompletionPresentationHolds(rawConversations)
        options.notify()
      }
      scheduleCompletionPresentationRelease()
    }, Math.max(0, expiresAt - Date.now()))
  }

  function publishStabilizedConversations(next: ConversationSnapshotV1, immediateCompletionKeys: ReadonlySet<string> = new Set()) {
    const previousByKey = new Map(rawConversations.all.map((task) => [task.key, task] as const))
    const nextByKey = new Map(next.all.map((task) => [task.key, task] as const))
    const now = Date.now()

    for (const key of immediateCompletionKeys) completionPresentationHolds.delete(key)
    for (const key of completionPresentationHolds.keys()) {
      if (!isTerminalPresentationTask(nextByKey.get(key))) completionPresentationHolds.delete(key)
    }
    for (const task of next.all) {
      if (!completionPresentationHolds.has(task.key) && isTerminalPresentationTask(task)) {
        const previous = previousByKey.get(task.key)
        if (isPresentedRunning(previous)) {
          const delay = completionPresentationDelay(codexState().settings)
          const expiresAt = (activityExitAt.get(task.key) || now) + delay
          if (!immediateCompletionKeys.has(task.key) && delay > 0 && expiresAt > now) {
            completionPresentationHolds.set(task.key, {
              expiresAt
            })
          }
        }
        activityExitAt.delete(task.key)
        activityExitBaselines.delete(task.key)
      }
    }

    rawConversations = next
    conversations = applyCompletionPresentationHolds(next)
    scheduleCompletionPresentationRelease()
  }

  function updateConversationStatus(patch: Partial<Pick<ConversationSnapshotV1, 'status' | 'errorCode' | 'errorMessage'>>) {
    rawConversations = { ...rawConversations, ...patch }
    conversations = { ...conversations, ...patch }
  }

  function resetCompletionPresentation(next = rawConversations) {
    clearCompletionPresentationTimer()
    completionPresentationHolds.clear()
    activityExitAt.clear()
    activityExitBaselines.clear()
    rawConversations = next
    conversations = next
  }

  function guardStaleExitCompletion(thread: CodexHostThread): CodexHostThread {
    const baseline = activityExitBaselines.get(thread.key)
    if (!baseline || thread.lastTurnStatus !== 'completed' || hasFreshTurnOutcomeAfterExit(thread, baseline) || isAuthoritativeCompletedAfterExit(thread, baseline)) return thread
    const guarded = { ...thread, lastTurnStatus: 'inProgress' as const }
    delete guarded.lastTurnCompletedAt
    return guarded
  }

  function armStructuralRefresh() {
    if (disposed || !shouldRun() || !structuralRefreshPending || inFlight || structuralRefreshTimer) return
    const delay = structuralRefreshPriority === 'urgent'
      ? URGENT_STRUCTURAL_REFRESH_DELAY_MS
      : NORMAL_STRUCTURAL_REFRESH_DELAY_MS
    structuralRefreshTimer = setTimeout(() => {
      structuralRefreshTimer = null
      if (inFlight) return
      structuralRefreshPending = false
      structuralRefreshPriority = 'normal'
      lastTaskReadAt = 0
      void refresh({ forceTasks: true })
    }, delay)
  }

  function scheduleStructuralRefresh(priority: StructuralRefreshPriority = 'normal') {
    if (disposed || !shouldRun()) return
    const promoted = priority === 'urgent' && structuralRefreshPriority !== 'urgent'
    structuralRefreshPending = true
    if (promoted) structuralRefreshPriority = 'urgent'
    lastTaskReadAt = 0
    if (promoted && structuralRefreshTimer) clearStructuralRefreshTimer()
    armStructuralRefresh()
  }

  function applyActivityDelta(delta: CodexActivityDelta) {
    if (!taskStateCompatible || disposed || !shouldRun() || (delta?.version !== 1 && delta?.version !== 2)) return
    if (!Number.isFinite(delta.receivedAt) || !Number.isFinite(delta.generation) || delta.generation <= 0) return
    let environmentChanged = false
    const structuralPriority: StructuralRefreshPriority = delta.version === 2 && delta.inventoryRefreshPriority === 'urgent'
      ? 'urgent'
      : 'normal'
    if (delta.version === 2 && delta.receivedAt >= environment.checkedAt && environment.desktopBridgeState !== delta.desktopBridgeState) {
      environment = { ...environment, desktopBridgeState: delta.desktopBridgeState, checkedAt: delta.receivedAt }
      environmentChanged = true
    }
    if (!lastSourceFingerprint || lastCompleteness !== 'verified' || delta.sourceFingerprint !== lastSourceFingerprint) {
      if (delta.inventoryChanged) scheduleStructuralRefresh(structuralPriority)
      if (environmentChanged) options.notify()
      return
    }
    if (delta.generation < lastActivityGeneration) return
    if (delta.receivedAt < rawConversations.updatedAt && delta.version !== 2) return
    lastActivityGeneration = delta.generation
    const archivedRemoved = delta.version === 2
      ? removeExplicitlyArchivedKeys(delta.archivedKeys, delta.receivedAt)
      : false
    const byKey = new Map(delta.entries.map((entry) => [entry.key, entry]))
    const knownKeys = new Set(lastThreads.map((thread) => thread.key))
    if ([...byKey.keys()].some((key) => !knownKeys.has(key))) {
      scheduleStructuralRefresh('urgent')
      return
    }
    let changed = false
    const immediateCompletionKeys = new Set<string>()
    const nextThreads = lastThreads.map((thread) => {
      const entry = byKey.get(thread.key)
      if (!entry) return thread
      const liveEntry = delta.version === 2 ? entry as CodexActivityDeltaEntryV2 : null
      const readStateOnly = liveEntry?.readStateOnly === true
      const activeFlags = readStateOnly
        ? [...thread.activeFlags]
        : [...new Set(entry.activeFlags || thread.activeFlags)].sort()
      let next = (delta.version === 2
        ? readStateOnly
          ? {
              ...thread,
              ...(typeof liveEntry?.hasUnreadTurn === 'boolean' ? { hasUnreadTurn: liveEntry.hasUnreadTurn } : {}),
              ...(liveEntry?.unreadAuthority ? { unreadAuthority: liveEntry.unreadAuthority } : {})
            }
          : {
              ...thread,
              ...(liveEntry?.status ? { status: liveEntry.status } : {}),
              activeFlags,
              ...(liveEntry?.statusAuthority ? { statusAuthority: liveEntry.statusAuthority } : {}),
              ...(typeof liveEntry?.hasUnreadTurn === 'boolean' ? { hasUnreadTurn: liveEntry.hasUnreadTurn } : {}),
              ...(liveEntry?.unreadAuthority ? { unreadAuthority: liveEntry.unreadAuthority } : {})
            }
        : { ...thread, status: entry.status || thread.status, activeFlags, statusAuthority: 'connector' as const }) as CodexHostThread
      if (delta.version === 2 && !readStateOnly && liveEntry?.status) {
        if (liveEntry.status === 'active' && Number.isFinite(liveEntry.desktopActiveSince) && liveEntry.desktopActiveSince! > 0) {
          next.desktopActiveSince = liveEntry.desktopActiveSince!
        } else if (liveEntry.status !== 'active') {
          delete next.desktopActiveSince
        }
      }
      const hasLatestTurnEvidence = !readStateOnly && Boolean(liveEntry?.lastTurnStatus)
        && Number.isFinite(liveEntry?.lastTurnStartedAt)
        && liveEntry!.lastTurnStartedAt! > 0
      if (hasLatestTurnEvidence) {
        next.lastTurnStatus = liveEntry!.lastTurnStatus!
        next.lastTurnStartedAt = liveEntry!.lastTurnStartedAt!
        if (liveEntry!.lastTurnStatus === 'completed' && Number.isFinite(liveEntry!.lastTurnCompletedAt) && liveEntry!.lastTurnCompletedAt! > 0) {
          next.lastTurnCompletedAt = liveEntry!.lastTurnCompletedAt!
        } else {
          delete next.lastTurnCompletedAt
        }
      }
      next = preserveLatestTurnEvidence(next, thread)
      // A Desktop active→idle push proves only that live execution stopped. If
      // its delta still carries the same latest-Turn revision, keep the task
      // ongoing until the targeted status-only read supplies a fresh outcome.
      const exitedDesktopActivity = isDesktopLiveActiveThread(thread) && !isDesktopLiveActiveThread(next)
      if (exitedDesktopActivity && !activityExitBaselines.has(thread.key)) {
        activityExitBaselines.set(thread.key, {
          lastTurnStatus: thread.lastTurnStatus,
          lastTurnStartedAt: thread.lastTurnStartedAt,
          lastTurnCompletedAt: thread.lastTurnCompletedAt,
          desktopActiveSince: thread.desktopActiveSince
        })
      }
      const exitBaseline = activityExitBaselines.get(thread.key)
      const explicitDesktopExitStop = delta.version === 2
        && delta.desktopBridgeState === 'not-running'
        && (next.lastTurnStatus === 'failed' || next.lastTurnStatus === 'interrupted')
      const authoritativeCompletedAfterExit = exitBaseline
        ? isAuthoritativeCompletedAfterExit(next, exitBaseline)
        : false
      const confirmedAfterExit = (hasLatestTurnEvidence && liveEntry?.lastTurnEvidence === 'targeted-after-exit')
        || explicitDesktopExitStop
        || authoritativeCompletedAfterExit
      if (exitBaseline && next.lastTurnStatus && next.lastTurnStatus !== 'inProgress' && !hasFreshTurnOutcomeAfterExit(next, exitBaseline, confirmedAfterExit)) {
        next.lastTurnStatus = 'inProgress'
        delete next.lastTurnCompletedAt
      }
      if (authoritativeCompletedAfterExit || (confirmedAfterExit && liveEntry?.lastTurnEvidence === 'targeted-after-exit' && next.lastTurnStatus === 'completed')) {
        immediateCompletionKeys.add(thread.key)
      }
      if (hasSameActivityState(thread, next)) {
        return thread
      }
      changed = true
      return next
    })

    if (!changed) {
      if (environmentChanged) options.notify()
      if (delta.inventoryChanged || archivedRemoved) scheduleStructuralRefresh(archivedRemoved ? 'urgent' : structuralPriority)
      return
    }

    const previousByKey = new Map(lastThreads.map((thread) => [thread.key, thread] as const))
    for (const thread of nextThreads) {
      const previous = previousByKey.get(thread.key)
      if (!previous || hasSameActivityState(previous, thread)) continue
      const previousActive = isDesktopLiveActiveThread(previous)
      const nextActive = isDesktopLiveActiveThread(thread)
      if (previousActive && !nextActive) activityExitAt.set(thread.key, delta.receivedAt)
      if (nextActive) {
        activityExitAt.delete(thread.key)
        activityExitBaselines.delete(thread.key)
        completionPresentationHolds.delete(thread.key)
      } else if (thread.lastTurnStatus && thread.lastTurnStatus !== 'inProgress' && thread.lastTurnStatus !== 'completed') {
        activityExitAt.delete(thread.key)
        activityExitBaselines.delete(thread.key)
      }
      const priorityPromotion = isCompletedReadThread(previous) && isUnreadOrOngoingThread(thread)
      if (priorityPromotion) completionPresentationHolds.delete(thread.key)
    }

    lastThreads = nextThreads
    publishConversationProjection({
      receivedAt: delta.receivedAt,
      advanceScan: false,
      status: rawConversations.status,
      immediateCompletionKeys
    })
    options.notify()
    if (delta.inventoryChanged || archivedRemoved) scheduleStructuralRefresh(archivedRemoved ? 'urgent' : structuralPriority)
  }

  function scheduleActivity(delay?: number) {
    clearActivityTimer()
    if (!taskStateCompatible || !started || disposed || !shouldRun() || typeof options.platform.codex.readActivitySnapshot !== 'function') return
    const wait = delay ?? (activityFailureCount >= 3 ? 1_000 : 5_000)
    activityTimer = setTimeout(() => { void pollActivity() }, Math.max(0, wait))
  }

  async function pollActivity() {
    if (!taskStateCompatible || disposed || !shouldRun() || typeof options.platform.codex.readActivitySnapshot !== 'function') return
    if (activityInFlight) return activityInFlight
    const operation = (async () => {
      const result = await options.platform.codex.readActivitySnapshot!()
      if (disposed || !shouldRun()) return
      if (result.ok) {
        activityFailureCount = 0
        applyActivityDelta(result.value)
      } else {
        activityFailureCount += 1
      }
    })().finally(() => {
      if (activityInFlight === operation) activityInFlight = null
      scheduleActivity()
    })
    activityInFlight = operation
    return activityInFlight
  }

  function schedule() {
    clearTimer()
    if (!started || disposed || !shouldRun()) return
    const settings = codexState().settings
    const now = Date.now()
    const quotaWait = Number.isFinite(quotaDelay(settings)) ? Math.max(1000, lastQuotaReadAt + quotaDelay(settings) - now) : Number.POSITIVE_INFINITY
    const taskWait = taskStateCompatible && Number.isFinite(taskDelay(settings)) ? Math.max(1000, lastTaskReadAt + taskDelay(settings) - now) : Number.POSITIVE_INFINITY
    const delay = Math.min(quotaWait, taskWait)
    if (!Number.isFinite(delay)) return
    timer = setTimeout(() => { void refresh() }, delay)
  }

  function persistSnapshots() {
    const state = codexState()
    state.cachedQuota = normalizeCodexQuota(quota)
    state.cachedConfig = normalizeCodexConfig(config)
    options.save()
  }

  function publishConversationProjection(input: { receivedAt: number; advanceScan: boolean; status?: ConversationSnapshotV1['status']; immediateCompletionKeys?: ReadonlySet<string> }) {
    const state = codexState()
    const projection = projectConversations({
      threads: lastThreads,
      projects: lastProjects,
      receipts: state.receipts,
      lastTaskScanAt: codexState().lastTaskScanAt,
      now: input.receivedAt,
      partial: lastThreadsPartial,
      authority: lastTaskAuthority,
      sourceCount: lastSourceCount,
      timeWindowDays: state.settings.timeWindowDays,
      activeTab: state.lastTaskTab,
      collapsedProjectKeys: state.collapsedProjectKeys,
      taskAliases: state.taskAliases,
      projectAliases: state.projectAliases,
      localPins: state.localPins,
      hiddenProjectKeys: state.hiddenProjectKeys,
      sourceFingerprint: lastSourceFingerprint,
      completeness: lastCompleteness,
      rawSourceCount: lastRawSourceCount,
      eligibleSourceCount: lastEligibleSourceCount,
      excludedSourceCount: lastExcludedSourceCount,
      nonConversationCount: lastNonConversationCount,
      desktopBridgeState: environment.desktopBridgeState
    })
    const nextConversations = {
      ...projection.snapshot,
      status: input.status || projection.snapshot.status,
      ...(input.status && input.status !== 'ok' ? { errorCode: rawConversations.errorCode, errorMessage: rawConversations.errorMessage } : {})
    }
    publishStabilizedConversations(nextConversations, input.immediateCompletionKeys)
    state.receipts = projection.receipts
    if (input.advanceScan) {
      codexState().lastTaskScanAt = projection.lastTaskScanAt
    }
  }

  async function inspectEnvironment(force = false) {
    if (disposed || !isFeatureEnabled()) return
    if (environmentInFlight) return environmentInFlight
    if (!force && environment.checkedAt > 0) return
    environment = { ...environment, checking: true }
    options.notify()
    const generation = ++environmentGeneration
    const operation = (async () => {
      try {
        const inspect = options.platform.codex.inspectEnvironment
        const result = typeof inspect === 'function'
          ? normalizeCodexEnvironment(await inspect())
          : normalizeCodexEnvironment({ checking: false, checkedAt: Date.now() })
        if (disposed || !isFeatureEnabled() || generation !== environmentGeneration) return
        environment = result
      } catch {
        if (disposed || !isFeatureEnabled() || generation !== environmentGeneration) return
        environment = normalizeCodexEnvironment({
          ...environment,
          checking: false,
          connectionState: 'failed',
          checkedAt: Date.now(),
          errorCode: 'unavailable'
        })
      }
    })().finally(() => {
      if (environmentInFlight === operation) environmentInFlight = null
      if (!disposed && isFeatureEnabled() && generation === environmentGeneration) options.notify()
      if (!disposed && isFeatureEnabled() && environment.checkedAt <= 0 && generation !== environmentGeneration) {
        queueMicrotask(() => { void inspectEnvironment() })
      }
    })
    environmentInFlight = operation
    return environmentInFlight
  }

  async function refresh(input: { force?: boolean; forceTasks?: boolean } = {}) {
    if (disposed || !shouldRun()) return
    if (inFlight) return inFlight
    const now = Date.now()
    const settings = codexState().settings
    const includeQuota = input.force === true || quota.updatedAt <= 0 || (Number.isFinite(quotaDelay(settings)) && now - lastQuotaReadAt >= quotaDelay(settings))
    const includeThreads = taskStateCompatible && settings.conversationInboxEnabled && (input.force === true || input.forceTasks === true || rawConversations.updatedAt <= 0 || (Number.isFinite(taskDelay(settings)) && now - lastTaskReadAt >= taskDelay(settings)))
    const includeConfig = includeQuota
    if (!includeQuota && !includeThreads) {
      schedule()
      return
    }
    if (includeThreads) {
      clearStructuralRefreshTimer()
      structuralRefreshPending = false
      structuralRefreshPriority = 'normal'
    }
    refreshing = true
    if (includeQuota && quota.updatedAt <= 0) quota = { ...quota, status: 'loading' }
    if (includeThreads && rawConversations.updatedAt <= 0) updateConversationStatus({ status: 'loading' })
    options.notify()
    const generation = ++refreshGeneration
    const operation = (async () => {
      await inspectEnvironment(input.force === true)
      if (disposed || !shouldRun() || generation !== refreshGeneration) return
      const [quotaResult, threadResult] = await Promise.all([
        includeQuota
          ? options.platform.codex.readSnapshot({ includeQuota: true, includeConfig: true, includeThreads: false })
          : Promise.resolve(null),
        includeThreads
          ? options.platform.codex.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
          : Promise.resolve(null)
      ])
      if (disposed || !shouldRun() || generation !== refreshGeneration) return
      const receivedAt = Math.max(quotaResult?.receivedAt || 0, threadResult?.receivedAt || 0, Date.now())
      const successful = [quotaResult, threadResult].filter((result) => result?.ok === true)
      const failures = [quotaResult, threadResult].filter((result) => result?.ok === false)
      if (successful.length) {
        const connectedEnvironment = {
          ...environment,
          checking: false,
          connectionState: 'connected',
          configState: quotaResult?.ok && quotaResult.value.config ? 'loaded' : environment.configState,
          checkedAt: receivedAt,
        }
        delete connectedEnvironment.errorCode
        // A successful App Server round-trip proves only the connector. Keep the
        // preload's runtime/process/Desktop bridge classification authoritative.
        environment = normalizeCodexEnvironment(connectedEnvironment)
      }
      if (quotaResult) {
        const quotaReceivedAt = quotaResult.receivedAt || receivedAt
        if (quotaResult.ok) {
          if (quotaResult.value.quota) quota = normalizeCodexQuota({ version: 1, status: 'ok', ...quotaResult.value.quota, updatedAt: quotaReceivedAt })
          if (quotaResult.value.config) config = normalizeCodexConfig({ version: 1, ...quotaResult.value.config, updatedAt: quotaReceivedAt })
          if (Array.isArray(quotaResult.value.models)) {
            modelCatalog = normalizeCodexModelCatalog({
              version: 1,
              status: 'ok',
              models: quotaResult.value.models,
              fingerprint: quotaResult.value.modelCatalogFingerprint,
              updatedAt: quotaReceivedAt
            })
          } else if (quotaResult.value.modelCatalogErrorCode) {
            modelCatalog = { ...modelCatalog, status: modelCatalog.updatedAt > 0 ? 'stale' : 'error', errorCode: quotaResult.value.modelCatalogErrorCode }
          }
          newThreadContextFingerprint = typeof quotaResult.value.newThreadContextFingerprint === 'string' && /^[a-f0-9]{64}$/.test(quotaResult.value.newThreadContextFingerprint)
            ? quotaResult.value.newThreadContextFingerprint
            : ''
        } else {
          quota = { ...quota, status: quota.updatedAt > 0 ? 'stale' : 'error', errorCode: quotaResult.error.code, errorMessage: quotaResult.error.message }
          modelCatalog = { ...modelCatalog, status: modelCatalog.updatedAt > 0 ? 'stale' : 'error', errorCode: quotaResult.error.code }
        }
        lastQuotaReadAt = quotaReceivedAt
      }
      if (threadResult) {
        const taskReceivedAt = threadResult.receivedAt || receivedAt
        if (threadResult.ok && threadResult.value.threads) {
          const host = threadResult.value
          const verifiedV2 = host.version === 2
            && host.completeness === 'verified'
            && typeof host.sourceFingerprint === 'string'
            && /^[a-f0-9]{64}$/.test(host.sourceFingerprint)
            && Array.isArray(host.projects)
          if (host.version === 2 && !verifiedV2) {
            resetInventoryDisappearanceCandidate()
            updateConversationStatus({
              status: rawConversations.updatedAt > 0 ? 'stale' : 'error',
              errorCode: 'protocol-error',
              errorMessage: 'Codex 会话预检不完整，已拒绝发布快照'
            })
            lastTaskReadAt = taskReceivedAt
            options.setMessage('Codex 会话预检不完整，已保留上一份已验证快照')
          } else {
            const firstPromptByKey = new Map(codexState().firstPromptTimes.map((entry) => [entry.key, entry.firstPromptAt]))
            const previousByKey = new Map(lastThreads.map((thread) => [thread.key, thread] as const))
            const threads = (host.threads as CodexHostThread[]).filter((thread) => !archivingKeys.has(thread.key)).map((thread) => ({
              ...thread,
              ...(thread.firstPromptAt ? {} : firstPromptByKey.has(thread.key) ? { firstPromptAt: firstPromptByKey.get(thread.key) } : {})
            })).map((thread) => preserveLatestTurnEvidence(thread, previousByKey.get(thread.key)))
              .map((thread) => guardStaleExitCompletion(thread))
            const disappearance = inventoryDisappearanceDecision(threads)
            if (!disappearance.accept) {
              updateConversationStatus({
                status: rawConversations.updatedAt > 0 ? 'stale' : 'error',
                errorCode: 'protocol-error',
                errorMessage: 'Codex 任务清单数量暂时不稳定，已保留上一份稳定状态'
              })
              lastTaskReadAt = taskReceivedAt
              if (disappearance.firstObservation) {
                options.setMessage(`检测到 ${disappearance.missingCount} 项任务暂时缺失，已保留上一份稳定清单并自动复核`)
                scheduleStructuralRefresh()
              }
            } else {
              const refreshedKeys = new Set(threads.map((thread) => thread.key))
              for (const key of activityExitAt.keys()) if (!refreshedKeys.has(key)) activityExitAt.delete(key)
              for (const key of activityExitBaselines.keys()) if (!refreshedKeys.has(key)) activityExitBaselines.delete(key)
              for (const thread of threads) {
                if (isDesktopLiveActiveThread(thread) || thread.lastTurnStatus && thread.lastTurnStatus !== 'inProgress' && thread.lastTurnStatus !== 'completed') {
                  activityExitAt.delete(thread.key)
                  activityExitBaselines.delete(thread.key)
                }
              }
              lastThreads = threads
              lastProjects = host.version === 2 ? host.projects || [] : []
              lastThreadsPartial = host.threadsPartial === true
              lastTaskAuthority = host.taskAuthority || 'mixed'
              lastSourceCount = host.version === 2 ? host.eligibleSourceCount ?? threads.length : threads.length
              lastSourceFingerprint = host.version === 2 ? host.sourceFingerprint || '' : ''
              lastCompleteness = host.version === 2 ? host.completeness : undefined
              lastRawSourceCount = host.version === 2 ? host.rawSourceCount ?? threads.length : threads.length
              lastEligibleSourceCount = host.version === 2 ? host.eligibleSourceCount ?? threads.length : threads.length
              lastExcludedSourceCount = host.version === 2 ? host.excludedSourceCount ?? 0 : 0
              lastNonConversationCount = host.version === 2 ? host.nonConversationCount ?? 0 : 0
              lastActivityGeneration = 0
              publishConversationProjection({ receivedAt: taskReceivedAt, advanceScan: true })
              codexState().firstPromptTimes = normalizeCodexFirstPromptTimes([
                ...threads.flatMap((thread) => thread.firstPromptAt ? [{ key: thread.key, firstPromptAt: thread.firstPromptAt, updatedAt: taskReceivedAt }] : []),
                ...codexState().firstPromptTimes
              ])
              lastTaskReadAt = taskReceivedAt
            }
          }
        } else if (!threadResult.ok) {
          resetInventoryDisappearanceCandidate()
          updateConversationStatus({
            status: rawConversations.updatedAt > 0 ? 'stale' : 'error',
            errorCode: threadResult.error.code,
            errorMessage: threadResult.error.message
          })
          lastTaskReadAt = taskReceivedAt
        }
      }
      if (!successful.length) {
        const failure = failures[0]
        environment = normalizeCodexEnvironment({
          ...environment,
          checking: false,
          connectionState: 'failed',
          checkedAt: receivedAt,
          errorCode: failure && !failure.ok ? failure.error.code : 'unavailable'
        })
      }
      const firstFailure = failures[0]
      if (firstFailure && !firstFailure.ok) options.setMessage(firstFailure.error.message)
      if (successful.length) persistSnapshots()
    })().finally(() => {
      const retryInvalidatedRead = !disposed && shouldRun() && generation !== refreshGeneration
      refreshing = false
      if (inFlight === operation) inFlight = null
      if (!disposed) options.notify()
      if (retryInvalidatedRead) queueMicrotask(() => { void refresh({ force: true }) })
      else if (structuralRefreshPending) armStructuralRefresh()
      else schedule()
      if (!retryInvalidatedRead) scheduleActivity(0)
    })
    inFlight = operation
    return inFlight
  }

  function syncActivation(force = false) {
    if (!started || disposed) return
    if (!isFeatureEnabled()) {
      if (cardColorPreview) {
        cardColorPreview = null
        options.notify()
      }
      environmentGeneration += 1
      if (environment.checking) {
        environment = { ...environment, checking: false }
        options.notify()
      }
    }
    if (isFeatureEnabled() && environment.checkedAt <= 0) void inspectEnvironment()
    if (!shouldRun()) {
      refreshGeneration += 1
      clearTimer()
      clearActivityTimer()
      resetStructuralRefresh()
      resetInventoryDisappearanceCandidate()
      resetCompletionPresentation(emptyConversationSnapshot())
      options.platform.codex.close()
      return
    }
    if (!taskStateCompatible) {
      publishTaskStateCompatibilityError()
      options.setMessage(TASK_STATE_RELOAD_MESSAGE)
      options.notify()
    }
    if (force || (quota.updatedAt <= 0 && rawConversations.updatedAt <= 0)) void refresh({ force: true })
    else {
      schedule()
      scheduleActivity(0)
    }
  }

  function updateSettings(patch: Partial<CodexSettings>) {
    const current = codexState().settings
    const candidateColors = patch.colors ? { ...current.colors, ...patch.colors } : current.colors
    const candidateCounterColors = patch.counterColors ? { ...current.counterColors, ...patch.counterColors } : current.counterColors
    const candidateWaterAppearance = patch.waterAppearance ? {
      inner: { ...current.waterAppearance.inner, ...patch.waterAppearance.inner },
      outer: { ...current.waterAppearance.outer, ...patch.waterAppearance.outer }
    } : current.waterAppearance
    const candidateExpandedCardAppearance = patch.expandedCardAppearance
      ? { ...current.expandedCardAppearance, ...patch.expandedCardAppearance }
      : current.expandedCardAppearance
    const next = normalizeCodexSettings({
      ...current,
      ...patch,
      colors: candidateColors,
      counterColors: candidateCounterColors,
      waterAppearance: candidateWaterAppearance,
      expandedCardAppearance: candidateExpandedCardAppearance,
      position: patch.position ? { ...current.position, ...patch.position } : current.position
    })
    codexState().settings = next
    if (!next.conversationInboxEnabled) {
      resetInventoryDisappearanceCandidate()
      resetCompletionPresentation(emptyConversationSnapshot())
    } else if (current.timeWindowDays !== next.timeWindowDays && lastThreads.length) {
      publishConversationProjection({ receivedAt: Date.now(), advanceScan: false, status: rawConversations.status })
    }
    options.save()
    options.notify()
    const needsFreshRead = current.conversationInboxEnabled !== next.conversationInboxEnabled ||
      current.quotaRefreshMinutes !== next.quotaRefreshMinutes ||
      current.taskRefreshSeconds !== next.taskRefreshSeconds
    syncActivation(needsFreshRead || (!current.floatEnabled && next.floatEnabled))
    return true
  }

  function resolveCardColorCandidate(colors: Partial<CodexColorSettings>): CodexColorSettings | null {
    const current = codexState().settings
    const candidate = { ...current.colors, ...colors }
    return candidate
  }

  function previewCardColors(colors: Partial<CodexColorSettings>) {
    const candidate = resolveCardColorCandidate(colors)
    if (!candidate) return false
    cardColorPreview = candidate
    options.notify()
    return true
  }

  function clearCardColorPreview() {
    if (!cardColorPreview) return true
    cardColorPreview = null
    options.notify()
    return true
  }

  function commitCardColors(colors: Partial<CodexColorSettings>) {
    const candidate = resolveCardColorCandidate(colors)
    if (!candidate) return false
    const previousPreview = cardColorPreview
    cardColorPreview = null
    if (updateSettings({ colors: candidate })) return true
    cardColorPreview = previousPreview
    options.notify()
    return false
  }

  async function setLaunchPath(pathValue: string) {
    const path = pathValue.trim()
    if (!path) {
      options.setMessage('请输入 Codex CLI 可执行文件的完整路径')
      options.notify()
      return false
    }
    const setLaunchPath = options.platform.codex.setLaunchPath
    if (typeof setLaunchPath !== 'function') {
      options.setMessage('当前宿主不支持手动设置 Codex CLI 路径，请更新插件 preload 后重试')
      options.notify()
      return false
    }
    try {
      environment = normalizeCodexEnvironment(await setLaunchPath(path))
      options.setMessage('已保存手动 Codex CLI 位置；不会中断当前 App Server，下次启动将使用该位置')
      options.notify()
      void inspectEnvironment(true)
      return true
    } catch (error) {
      options.setMessage(error instanceof Error ? error.message : '手动 Codex CLI 位置不可用')
      options.notify()
      return false
    }
  }

  async function clearLaunchPath() {
    const clearLaunchPath = options.platform.codex.clearLaunchPath
    if (typeof clearLaunchPath !== 'function') {
      options.setMessage('当前宿主不支持恢复 Codex CLI 自动发现，请更新插件 preload 后重试')
      options.notify()
      return false
    }
    try {
      environment = normalizeCodexEnvironment(await clearLaunchPath())
      options.setMessage('已恢复 Codex CLI 自动发现；不会中断当前 App Server，下次启动将使用自动发现')
      options.notify()
      void inspectEnvironment(true)
      return true
    } catch (error) {
      options.setMessage(error instanceof Error ? error.message : '无法恢复 Codex CLI 自动发现')
      options.notify()
      return false
    }
  }

  function republishAfterReceiptChange() {
    publishConversationProjection({ receivedAt: rawConversations.updatedAt || Date.now(), advanceScan: false, status: rawConversations.status })
    options.save()
    options.notify()
  }

  function allTasks() {
    return conversations.all.length
      ? conversations.all
      : [...conversations.ongoing, ...conversations.completedUnread, ...conversations.completed, ...conversations.hidden]
  }

  function displayOrderedTasks(tasks: CodexTaskCard[]): CodexTaskCard[] {
    const pinnedOrder = new Map<string, number>()
    const pinned = conversations.projectSections.find((section) => section.id === 'pinned')
    for (const entry of pinned?.entries || []) {
      if (entry.kind === 'task' && !pinnedOrder.has(entry.task.key)) pinnedOrder.set(entry.task.key, pinnedOrder.size)
    }
    return tasks
      .map((task, index) => ({ task, index, pinned: pinnedOrder.get(task.key) }))
      .sort((left, right) => {
        if (left.pinned !== undefined && right.pinned !== undefined) return left.pinned - right.pinned
        if (left.pinned !== undefined) return -1
        if (right.pinned !== undefined) return 1
        return left.index - right.index
      })
      .map(({ task }) => task)
  }

  function setTaskTab(tab: CodexTaskTab) {
    if (!isCodexTaskTab(tab)) return false
    codexState().lastTaskTab = normalizeCodexVisibleTaskTab(tab)
    republishAfterReceiptChange()
    return true
  }

  function setProjectCollapsed(key: string, collapsed: boolean) {
    if (!conversations.projects.some((project) => project.key === key)) return false
    const values = new Set(codexState().collapsedProjectKeys)
    if (collapsed) values.add(key)
    else values.delete(key)
    codexState().collapsedProjectKeys = [...values]
    republishAfterReceiptChange()
    return true
  }

  function setAlias(kind: 'task' | 'project', key: string, alias: string) {
    const exists = kind === 'task'
      ? allTasks().some((task) => task.key === key)
      : conversations.projects.some((project) => project.key === key)
    if (!exists) return false
    const value = alias.trim().slice(0, 120)
    const field = kind === 'task' ? 'taskAliases' : 'projectAliases'
    codexState()[field] = [
      ...codexState()[field].filter((entry) => entry.key !== key),
      ...(value ? [{ key, alias: value }] : [])
    ].slice(-500)
    republishAfterReceiptChange()
    options.setMessage(value ? '别名已保存' : '别名已清除')
    return true
  }

  function toggleLocalPin(kind: CodexLocalPin['kind'], key: string) {
    const exists = kind === 'task'
      ? allTasks().some((task) => task.key === key)
      : conversations.projects.some((project) => project.key === key && project.kind !== 'chats')
    if (!exists) return false
    const identity = `${kind}:${key}`
    const pins = codexState().localPins
    const pinned = pins.some((pin) => `${pin.kind}:${pin.key}` === identity)
    codexState().localPins = pinned
      ? pins.filter((pin) => `${pin.kind}:${pin.key}` !== identity)
      : [...pins, { kind, key }].slice(-500)
    republishAfterReceiptChange()
    options.setMessage(pinned ? '已取消 EyPc 置顶' : '已在 EyPc 内置顶')
    return true
  }

  function moveLocalPin(kind: CodexLocalPin['kind'], key: string, direction: -1 | 1) {
    const pins = [...codexState().localPins]
    const index = pins.findIndex((pin) => pin.kind === kind && pin.key === key)
    if (index < 0) return false
    const target = index + direction
    if (target < 0 || target >= pins.length) return false
    ;[pins[index], pins[target]] = [pins[target], pins[index]]
    codexState().localPins = pins
    republishAfterReceiptChange()
    return true
  }

  function hideProject(key: string) {
    if (!conversations.projects.some((project) => project.key === key && project.kind === 'project')) return false
    codexState().hiddenProjectKeys = [...new Set([...codexState().hiddenProjectKeys, key])].slice(-200)
    republishAfterReceiptChange()
    options.setMessage('已隐藏项目分组；所属任务仍保留在其他会话页签')
    return true
  }

  function showProject(key: string) {
    if (!codexState().hiddenProjectKeys.includes(key)) return false
    codexState().hiddenProjectKeys = codexState().hiddenProjectKeys.filter((item) => item !== key)
    republishAfterReceiptChange()
    options.setMessage('已恢复项目分组显示')
    return true
  }

  async function removeProject(key: string, actionAlias: string, sourceFingerprint: string) {
    const project = conversations.projects.find((item) => item.key === key && item.actionAlias === actionAlias && item.kind === 'project')
    if (!project || conversations.completeness !== 'verified' || !conversations.sourceFingerprint || sourceFingerprint !== conversations.sourceFingerprint) {
      options.setMessage('项目动作或状态指纹已失效，请刷新后重试')
      return false
    }
    if (typeof options.platform.codex.removeProject !== 'function') {
      options.setMessage('当前宿主不支持真实 Codex 项目移除')
      return false
    }
    const result = await options.platform.codex.removeProject(actionAlias, { expectedSourceFingerprint: sourceFingerprint })
    if (disposed) return false
    options.setMessage(result.message)
    if (result.status !== 'verified') {
      options.notify()
      return false
    }
    const state = codexState()
    state.hiddenProjectKeys = state.hiddenProjectKeys.filter((item) => item !== key)
    state.collapsedProjectKeys = state.collapsedProjectKeys.filter((item) => item !== key)
    state.projectAliases = state.projectAliases.filter((item) => item.key !== key)
    state.localPins = state.localPins.filter((item) => !(item.kind === 'project' && item.key === key))
    const removedThreadKeys = new Set(lastThreads.filter((thread) => thread.projectKey === key).map((thread) => thread.key))
    lastThreads = lastThreads.filter((thread) => thread.projectKey !== key)
    lastProjects = lastProjects.filter((project) => project.key !== key)
    for (const threadKey of removedThreadKeys) {
      activityExitAt.delete(threadKey)
      activityExitBaselines.delete(threadKey)
      completionPresentationHolds.delete(threadKey)
    }
    resetInventoryDisappearanceCandidate()
    publishConversationProjection({ receivedAt: Date.now(), advanceScan: false })
    options.save()
    options.notify()
    lastTaskReadAt = 0
    await refresh({ forceTasks: true })
    if (conversations.projects.some((item) => item.key === key)) {
      lastTaskReadAt = 0
      await refresh({ forceTasks: true })
    }
    return true
  }

  async function openThread(key: string, actionAlias: string) {
    const task = allTasks()
      .find((item) => item.key === key && item.actionAlias === actionAlias)
    if (!task) {
      options.setMessage('线程动作已失效，请刷新后重试')
      return false
    }
    const result = await options.platform.codex.openThread(actionAlias)
    if (result.outcome === 'opened') {
      if (task.hiddenKind) {
        options.setMessage('已打开，任务仍在 Companion 已隐藏区')
      } else {
        options.setMessage('已打开 Codex 任务')
      }
      return true
    }
    options.setMessage(result.message || (result.outcome === 'dispatched' ? '已交给系统打开' : 'Codex 任务打开失败'))
    return result.outcome === 'dispatched'
  }

  function openFirstInput() {
    const task = conversations.inputRequired[0]
    if (!task?.actionAlias) {
      options.setMessage('当前没有待输入任务')
      return false
    }
    void openThread(task.key, task.actionAlias)
    return true
  }

  function openFirstCompletedUnread() {
    const task = displayOrderedTasks(allTasks().filter((item) => item.bucket === 'completed-unread'))[0]
    const completionRevision = task?.completionRevision
    if (!task?.actionAlias || typeof completionRevision !== 'number' || !Number.isFinite(completionRevision) || completionRevision <= 0) {
      options.setMessage('当前没有已完成未读任务')
      return false
    }
    codexState().receipts = acknowledgeCodexCompletedUnread(codexState().receipts, task.key, completionRevision)
    republishAfterReceiptChange()
    void openThread(task.key, task.actionAlias)
    return true
  }

  function cycleTasks(): Array<CodexTaskCard & { actionAlias: string }> {
    const tasks = allTasks()
    const recentActiveTasks = projectCodexDynamicStatus(conversations).groups.active
    const groups = [
      displayOrderedTasks(conversations.inputRequired),
      displayOrderedTasks(recentActiveTasks)
    ]
    const usableTasks = (candidates: CodexTaskCard[]) => {
      const seen = new Set<string>()
      return candidates.filter((task): task is CodexTaskCard & { actionAlias: string } => {
        if (!task.actionAlias || seen.has(task.key)) return false
        seen.add(task.key)
        return true
      })
    }
    const candidates = usableTasks(groups.flat())
    return candidates.length
      ? candidates
      : usableTasks(displayOrderedTasks(tasks.filter((task) => task.pinSource === 'local' && task.bucket !== 'stopped')))
  }

  function cycleTask(direction: -1 | 1) {
    const tasks = cycleTasks()
    if (!tasks.length) {
      options.setMessage('当前没有可切换的 Codex 任务')
      return false
    }
    const currentIndex = tasks.findIndex((task) => task.key === taskCycleKey)
    const nextIndex = currentIndex < 0
      ? direction > 0 ? 0 : tasks.length - 1
      : (currentIndex + direction + tasks.length) % tasks.length
    const task = tasks[nextIndex]
    taskCycleKey = task.key
    void openThread(task.key, task.actionAlias)
    return true
  }

  function hide(key: string, recency?: number) {
    if (!Number.isFinite(recency)) return false
    const candidates = allTasks().filter((item) => !item.isHidden && item.key === key)
    if (!candidates.length) {
      options.setMessage('当前任务不可隐藏')
      return false
    }
    const task = candidates.find((item) => item.revisionAt === recency)
    if (!task) {
      options.setMessage('任务状态已更新，请确认最新状态后再隐藏')
      return false
    }
    codexState().receipts = hideCodexThread(codexState().receipts, key, task.revisionAt, task.bucket)
    republishAfterReceiptChange()
    options.setMessage('已移入 Companion 的已隐藏区；不会修改 Codex 任务')
    return true
  }

  function dismiss(key: string, recency?: number) {
    return hide(key, recency)
  }

  function restore(key: string, recency?: number, kind?: 'task' | 'activity' | 'pending') {
    if (!Number.isFinite(recency) || !['task', 'activity', 'pending'].includes(kind || '')) return false
    const task = conversations.hidden.find((item) => item.key === key && item.hiddenKind === kind)
    if (!task || task.revisionAt !== recency) return false
    codexState().receipts = restoreCodexThread(codexState().receipts, key, task.revisionAt, kind!)
    republishAfterReceiptChange()
    options.setMessage('已从已隐藏区释放任务')
    return true
  }

  async function archive(key: string, recency?: number) {
    if (!Number.isFinite(recency) || typeof options.platform.codex.archiveThread !== 'function') return false
    const task = allTasks()
      .find((item) => item.key === key && item.revisionAt === recency)
    if (!task || task.archiveCapability !== 'allowed' || !task.actionAlias || !task.lastTurnStartedAt || conversations.completeness !== 'verified' || !conversations.sourceFingerprint || taskArchive.status === 'archiving') {
      options.setMessage('任务仍在进行中，暂不能归档')
      return false
    }
    taskArchive = { key, status: 'archiving', message: '正在归档 Codex 任务' }
    archivingKeys.add(key)
    const optimisticThread = lastThreads.find((thread) => thread.key === key)
    lastThreads = lastThreads.filter((thread) => thread.key !== key)
    resetInventoryDisappearanceCandidate()
    republishAfterReceiptChange()
    options.notify()
    const result = await options.platform.codex.archiveThread(task.actionAlias, {
      expectedUpdatedAt: task.updatedAt,
      expectedRevisionAt: task.revisionAt,
      ...(task.lastTurnCompletedAt ? { expectedCompletionAt: task.lastTurnCompletedAt } : {}),
      expectedLastTurnStartedAt: task.lastTurnStartedAt || 0,
      expectedSourceFingerprint: conversations.sourceFingerprint,
      evidence: task.bucket === 'stopped' ? 'stopped' : 'completed'
    })
    archivingKeys.delete(key)
    if (disposed) return false
    if (result.outcome !== 'archived') {
      if (optimisticThread && !lastThreads.some((thread) => thread.key === key)) {
        lastThreads = [...lastThreads, optimisticThread]
      }
      taskArchive = { key, status: 'error', message: result.message || 'Codex 任务归档失败' }
      republishAfterReceiptChange()
      options.setMessage(taskArchive.message)
      options.notify()
      return false
    }
    codexState().receipts = codexState().receipts.filter((receipt) => receipt.key !== key)
    lastThreads = lastThreads.filter((thread) => thread.key !== key)
    resetInventoryDisappearanceCandidate()
    taskArchive = { key: '', status: 'idle', message: '' }
    republishAfterReceiptChange()
    options.setMessage(result.desktopSync === 'dispatched'
      ? '已归档，并已通知 Codex 桌面端刷新'
      : '已归档；Codex 桌面端未确认即时刷新')
    return true
  }

  async function archiveMany(items: Array<{ key: string; revisionAt: number }>) {
    const unique = [...new Map(items
      .filter((item) => typeof item?.key === 'string' && Number.isFinite(item.revisionAt))
      .map((item) => [`${item.key}:${item.revisionAt}`, item] as const)).values()].slice(0, 500)
    let archivedCount = 0
    let failedCount = 0
    for (const item of unique) {
      if (await archive(item.key, item.revisionAt)) archivedCount += 1
      else failedCount += 1
    }
    options.setMessage(failedCount ? `已归档 ${archivedCount} 项，${failedCount} 项未通过真实状态核验` : `已归档 ${archivedCount} 项`)
    return failedCount === 0
  }

  async function archiveProject(key: string, actionAlias: string) {
    if (typeof options.platform.codex.archiveProject !== 'function' || projectArchive.status === 'archiving') return false
    const project = conversations.projects.find((item) => item.key === key && item.actionAlias === actionAlias)
    if (!project || project.kind === 'chats' && !actionAlias || !conversations.sourceFingerprint) {
      options.setMessage('项目动作已失效，请刷新后重试')
      return false
    }
    projectArchive = { key, status: 'archiving', message: '正在分批归档项目任务' }
    options.notify()
    const result = await options.platform.codex.archiveProject(actionAlias, { expectedSourceFingerprint: conversations.sourceFingerprint })
    if (disposed) return false
    if (result.archivedKeys.length) {
      const archived = new Set(result.archivedKeys)
      lastThreads = lastThreads.filter((thread) => !archived.has(thread.key))
      resetInventoryDisappearanceCandidate()
      codexState().receipts = codexState().receipts.filter((receipt) => !archived.has(receipt.key))
      publishConversationProjection({ receivedAt: Date.now(), advanceScan: false })
    }
    if (result.outcome === 'failed') {
      projectArchive = { key, status: 'error', message: result.message || '项目批量归档失败' }
      options.setMessage(projectArchive.message)
      options.notify()
      return false
    }
    const desktopSyncedCount = result.desktopSyncedKeys?.length || 0
    const desktopSyncFailedCount = Math.max(
      result.desktopSyncFailedKeys?.length || 0,
      result.archivedKeys.length - desktopSyncedCount
    )
    const desktopSyncMessage = desktopSyncFailedCount
      ? `；${desktopSyncFailedCount} 项未确认 Codex 桌面端即时刷新`
      : result.archivedKeys.length > 0 ? '，并已通知 Codex 桌面端刷新' : ''
    const archiveMessage = result.outcome === 'partial'
      ? `${result.archivedKeys.length} 项已归档，${result.failed.length} 项失败，${result.skippedActiveKeys.length} 项仍在进行中${desktopSyncMessage}`
      : `已归档 ${result.archivedKeys.length} 项${desktopSyncMessage}；跳过 ${result.skippedActiveKeys.length} 项进行中任务`
    projectArchive = {
      key: '',
      status: result.outcome === 'partial' ? 'error' : 'idle',
      message: result.outcome === 'partial' ? archiveMessage : ''
    }
    options.setMessage(archiveMessage)
    options.save()
    options.notify()
    lastTaskReadAt = 0
    void refresh({ force: true })
    return result.outcome === 'complete'
  }

  function saveGeometry(position: CodexSettings['position'], size: Omit<CodexExpandedSizePreference, 'displayId' | 'updatedAt'> & { displayId?: string; updatedAt?: number }) {
    const displayId = typeof size.displayId === 'string' && size.displayId ? size.displayId : position.displayId
    if (!displayId || !Number.isFinite(size.width) || !Number.isFinite(size.height)) return false
    const updatedAt = typeof size.updatedAt === 'number' && Number.isFinite(size.updatedAt) ? size.updatedAt : Date.now()
    const expandedSizes = [{ displayId, width: Math.round(size.width), height: Math.round(size.height), updatedAt }, ...codexState().settings.expandedSizes.filter((entry) => entry.displayId !== displayId)]
    return updateSettings({ position, expandedSizes })
  }

  function resetPosition() {
    const position = { displayId: '', x: null, y: null, edge: 'right' as const }
    const changed = updateSettings({ position })
    if (changed) options.platform.float.resetGeometry?.({ position, expandedSizes: codexState().settings.expandedSizes })
    return changed
  }

  function resetExpandedSize(displayId?: string) {
    const settings = codexState().settings
    const target = displayId || settings.position.displayId || settings.expandedSizes[0]?.displayId || ''
    if (!target) return true
    const changed = updateSettings({ expandedSizes: settings.expandedSizes.filter((entry) => entry.displayId !== target) })
    if (changed) options.platform.float.resetGeometry?.({ position: settings.position, expandedSizes: codexState().settings.expandedSizes })
    return changed
  }

  return {
    start() {
      if (started || disposed) return
      started = true
      stopActivityListener = taskStateCompatible
        ? options.platform.codex.onActivityChanged?.((delta) => applyActivityDelta(delta)) || null
        : null
      if (isFeatureEnabled()) void inspectEnvironment()
      syncActivation(true)
    },
    dispose() {
      disposed = true
      cardColorPreview = null
      environmentGeneration += 1
      refreshGeneration += 1
      if (environment.checking) environment = { ...environment, checking: false }
      clearTimer()
      clearActivityTimer()
      resetStructuralRefresh()
      resetInventoryDisappearanceCandidate()
      resetCompletionPresentation()
      stopActivityListener?.()
      stopActivityListener = null
      options.platform.codex.close()
    },
    syncActivation,
    refresh: () => refresh({ force: true }),
    inspectEnvironment: () => inspectEnvironment(true),
    setLaunchPath,
    clearLaunchPath,
    updateSettings,
    previewCardColors,
    clearCardColorPreview,
    commitCardColors,
    dismiss,
    hide,
    restore,
    archive,
    archiveMany,
    archiveProject,
    openThread,
    openFirstInput,
    openFirstCompletedUnread,
    cycleTask,
    setTaskTab,
    setProjectCollapsed,
    setAlias,
    toggleLocalPin,
    moveLocalPin,
    hideProject,
    showProject,
    removeProject,
    saveGeometry,
    resetPosition,
    resetExpandedSize,
    view(): CodexRuntimeView {
      const settings = codexState().settings
      const displayId = settings.position.displayId || settings.expandedSizes[0]?.displayId || ''
      const preferred = settings.expandedSizes.find((entry) => entry.displayId === displayId) || (!settings.position.displayId ? settings.expandedSizes[0] : undefined)
      const workspaceVisibility = options.platform.float?.diagnostics?.()
      return {
        settings,
        environment,
        quota,
        config,
        modelCatalog,
        newThreadContextFingerprint,
        conversations,
        refreshing,
        floatHost: {
          displayId,
          expandedWidth: preferred?.width || 360,
          expandedHeight: preferred?.height || 0,
          expandedManual: Boolean(preferred),
          ...(workspaceVisibility ? { workspaceVisibility } : {})
        }
      }
    },
    floatSnapshot(): CodexFloatSnapshotV1 {
      const settings = codexState().settings
      return {
        version: 2,
        taskStateRevision: CODEX_TASK_STATE_REVISION,
        style: cardColorPreview ? 'card' : settings.displayStyle,
        conversationInboxEnabled: settings.conversationInboxEnabled,
        compactFields: settings.compactFields,
        expandedFields: settings.expandedFields,
        colors: cardColorPreview || settings.colors,
        counterColors: settings.counterColors,
        waterAppearance: settings.waterAppearance,
        expandedCardAppearance: settings.expandedCardAppearance,
        expandedSizes: settings.expandedSizes,
        quota,
        config,
        modelCatalog,
        newThreadContextFingerprint,
        newThreadModelPolicy: settings.newThreadModelPolicy,
        newThreadPreferredModel: settings.newThreadPreferredModel,
        conversations,
        taskArchive,
        projectArchive,
        timeWindowDays: settings.timeWindowDays,
        generatedAt: Date.now()
      }
    }
  }
}
