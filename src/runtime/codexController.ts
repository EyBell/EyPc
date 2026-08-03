import {
  conversationSnapshotFromReceipts,
  emptyCodexEnvironment,
  emptyCodexModelCatalog,
  emptyConversationSnapshot,
  hideCodexThread,
  isCodexConfirmedTerminalEvidence,
  isCodexTaskTab,
  normalizeCodexActivityDecisionDiagnostics,
  normalizeCodexConfig,
  normalizeCodexEnvironment,
  normalizeCodexFirstPromptTimes,
  normalizeCodexQuota,
  normalizeCodexSettings,
  normalizeCodexVisibleTaskTab,
  projectConversations,
  restoreCodexThread,
  sameCodexActivityDecisionDiagnostics,
  CODEX_TASK_STATE_REVISION,
  type CodexActivityDelta,
  type CodexActivityDecisionDiagnostics,
  type CodexActivityDeltaEntryV2,
  type CodexConfigSnapshotV1,
  type CodexEnvironmentSnapshotV1,
  type CodexExpandedSizePreference,
  type CodexHostProject,
  type CodexHostSnapshot,
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
import {
  buildCodexTaskStatePackage,
  CODEX_TASK_STATE_DEGRADED_MESSAGE,
  type CodexTaskStatePackageV1
} from '../domain/codexPresentation'
import {
  buildCodexEnvironmentActionSlots,
  buildCodexEnvironmentProjectCandidates,
  resolveCodexEnvironmentActionTarget
} from '../domain/codexEnvironment'
import type { AppState } from '../domain/types'
import type { CodexFloatWorkspaceDiagnostics, EypcPlatformApi } from '../platform/eypcPlatform'

export interface CodexRuntimeView {
  settings: CodexSettings
  environment: CodexEnvironmentSnapshotV1
  quota: CodexQuotaSnapshotV1
  config: CodexConfigSnapshotV1
  modelCatalog: CodexModelCatalogSnapshotV1
  newThreadContextFingerprint: string
  taskState: CodexTaskStatePackageV1
  /** @deprecated Consume taskState.conversations. */
  conversations: ConversationSnapshotV1
  activityDecisionDiagnostics: CodexActivityDecisionDiagnostics
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
  /** Optional only when consuming a long-lived older Controller snapshot. */
  taskState?: CodexTaskStatePackageV1
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
  /** @deprecated Consume taskState.conversations. */
  conversations: ConversationSnapshotV1
  taskArchive: { key: string; status: 'idle' | 'archiving' | 'error'; message: string }
  projectArchive: { key: string; status: 'idle' | 'archiving' | 'error'; message: string }
  timeWindowDays: number
  actionDefaultProjectKey?: string
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
  return settings.quotaRefreshSeconds > 0 ? settings.quotaRefreshSeconds * 1000 : Number.POSITIVE_INFINITY
}

function taskDelay(settings: CodexSettings): number {
  return settings.conversationInboxEnabled && settings.taskRefreshSeconds > 0 ? settings.taskRefreshSeconds * 1000 : Number.POSITIVE_INFINITY
}

const MIN_INVENTORY_DISAPPEARANCE_HOLD_MS = 3_000
const URGENT_STRUCTURAL_REFRESH_DELAY_MS = 50
const NORMAL_STRUCTURAL_REFRESH_DELAY_MS = 200
function inventoryDisappearanceHold(settings: CodexSettings): number {
  const refreshDelay = taskDelay(settings)
  return Number.isFinite(refreshDelay)
    ? Math.max(MIN_INVENTORY_DISAPPEARANCE_HOLD_MS, refreshDelay)
    : MIN_INVENTORY_DISAPPEARANCE_HOLD_MS
}

type ActivityExitBaseline = Pick<CodexHostThread, 'lastTurnStatus' | 'lastTurnStartedAt' | 'lastTurnCompletedAt'>

type ActivityExitTransitionOptions = {
  explicitDesktopExitStop?: boolean
}

type ActivityExitTransition = {
  thread: CodexHostThread
  baseline?: ActivityExitBaseline
}

type InventoryDisappearanceCandidate = {
  signature: string
  firstSeenAt: number
  confirmations: number
}

type StructuralRefreshPriority = 'normal' | 'urgent'

function isLiveActiveThread(thread: CodexHostThread): boolean {
  if (!['desktop-live', 'app-server-live'].includes(thread.statusAuthority || '') || thread.status !== 'active') return false
  return thread.lastTurnStatus !== 'completed'
    || !isCodexConfirmedTerminalEvidence(thread.lastTurnEvidence)
}

function hasFreshTurnOutcomeAfterExit(thread: CodexHostThread, baseline: ActivityExitBaseline, targetedAfterExit = false): boolean {
  if (!thread.lastTurnStatus || thread.lastTurnStatus === 'inProgress' || !Number.isFinite(thread.lastTurnStartedAt) || thread.lastTurnStartedAt! <= 0) return false
  if (targetedAfterExit) return true
  const baselineStartedAt = Number.isFinite(baseline.lastTurnStartedAt) ? baseline.lastTurnStartedAt! : 0
  if (thread.lastTurnStartedAt! > baselineStartedAt) return true
  if (thread.lastTurnStartedAt! < baselineStartedAt) return false
  if (thread.lastTurnStatus !== baseline.lastTurnStatus) return true
  if (thread.lastTurnStatus !== 'completed') return false
  const completedAt = Number.isFinite(thread.lastTurnCompletedAt) ? thread.lastTurnCompletedAt! : 0
  const baselineCompletedAt = Number.isFinite(baseline.lastTurnCompletedAt) ? baseline.lastTurnCompletedAt! : 0
  return completedAt > baselineCompletedAt
}

function reduceActivityExitTransition(
  previous: CodexHostThread,
  candidate: CodexHostThread,
  currentBaseline: ActivityExitBaseline | undefined,
  options: ActivityExitTransitionOptions = {}
): ActivityExitTransition {
  if (isLiveActiveThread(candidate)) return { thread: candidate }

  const baseline = currentBaseline || (isLiveActiveThread(previous) && !isLiveActiveThread(candidate)
    ? {
        lastTurnStatus: previous.lastTurnStatus,
        lastTurnStartedAt: previous.lastTurnStartedAt,
        lastTurnCompletedAt: previous.lastTurnCompletedAt
      }
    : undefined)
  if (!baseline) return { thread: candidate }

  const terminal = candidate.lastTurnStatus === 'completed'
    || candidate.lastTurnStatus === 'failed'
    || candidate.lastTurnStatus === 'interrupted'
  if (!terminal) return { thread: candidate, baseline }

  const confirmedTerminal = isCodexConfirmedTerminalEvidence(candidate.lastTurnEvidence)
    || options.explicitDesktopExitStop === true
  if (hasFreshTurnOutcomeAfterExit(candidate, baseline, confirmedTerminal)) {
    return { thread: candidate }
  }

  const guarded = { ...candidate, lastTurnStatus: 'inProgress' as const }
  delete guarded.lastTurnCompletedAt
  delete guarded.lastTurnEvidence
  return { thread: guarded, baseline }
}

function preserveLatestTurnEvidence(thread: CodexHostThread, previous: CodexHostThread | undefined): CodexHostThread {
  if (!previous) return thread
  let candidate = thread.updatedAt < previous.updatedAt ? { ...thread, updatedAt: previous.updatedAt } : thread
  const explicitLiveRestart = candidate.lastTurnStatus === 'inProgress'
    && candidate.status === 'active'
    && ['desktop-live', 'app-server-live'].includes(candidate.statusAuthority || '')
    && (candidate.activityEvidence === 'activity-event' || candidate.lastTurnEvidence === 'turn-started')
  if (explicitLiveRestart) return candidate
  const previousStartedAt = Number.isFinite(previous.lastTurnStartedAt) ? previous.lastTurnStartedAt! : 0
  const nextStartedAt = Number.isFinite(candidate.lastTurnStartedAt) ? candidate.lastTurnStartedAt! : 0
  const previousCompletedAt = Number.isFinite(previous.lastTurnCompletedAt) ? previous.lastTurnCompletedAt! : 0
  const nextCompletedAt = Number.isFinite(candidate.lastTurnCompletedAt) ? candidate.lastTurnCompletedAt! : 0
  const sameTurnOutcome = previousStartedAt > 0
    && nextStartedAt === previousStartedAt
    && candidate.lastTurnStatus === previous.lastTurnStatus
  if (sameTurnOutcome && previous.lastTurnEvidence
    && (!candidate.lastTurnEvidence || candidate.lastTurnEvidence === 'inventory')) {
    candidate = { ...candidate, lastTurnEvidence: previous.lastTurnEvidence }
  }
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
  if (previous.lastTurnEvidence) stable.lastTurnEvidence = previous.lastTurnEvidence
  else delete stable.lastTurnEvidence
  return stable
}

function hasSameActivityState(previous: CodexHostThread, next: CodexHostThread): boolean {
  return previous.status === next.status
    && [...previous.activeFlags].sort().join('|') === [...next.activeFlags].sort().join('|')
    && (previous.planImplementationOnly === true) === (next.planImplementationOnly === true)
    && previous.statusAuthority === next.statusAuthority
    && previous.activityEvidence === next.activityEvidence
    && previous.activityRevision === next.activityRevision
    && previous.desktopActiveSince === next.desktopActiveSince
    && previous.hasUnreadTurn === next.hasUnreadTurn
    && previous.unreadAuthority === next.unreadAuthority
    && previous.lastTurnStatus === next.lastTurnStatus
    && previous.lastTurnStartedAt === next.lastTurnStartedAt
    && previous.lastTurnCompletedAt === next.lastTurnCompletedAt
    && previous.lastTurnEvidence === next.lastTurnEvidence
}

export function createCodexController(options: CodexControllerOptions) {
  // Direct test/custom adapters may omit the capability. The production
  // platform adapter always supplies either the exact revision or `legacy`.
  const taskStateSourceRevision = options.platform.codex.taskStateRevision || CODEX_TASK_STATE_REVISION
  let quota = normalizeCodexQuota(options.getAppState().codex.cachedQuota)
  if (quota.updatedAt > 0 && quota.status === 'ok') quota = { ...quota, status: 'stale' }
  let config = normalizeCodexConfig(options.getAppState().codex.cachedConfig)
  let modelCatalog = emptyCodexModelCatalog()
  let newThreadContextFingerprint = ''
  let environment = emptyCodexEnvironment()
  let rawConversations = conversationSnapshotFromReceipts(options.getAppState().codex.receipts)
  let taskState = buildCodexTaskStatePackage(rawConversations, {
    sourceRevision: taskStateSourceRevision,
    dynamicTaskWindowHours: options.getAppState().codex.settings.dynamicTaskWindowHours
  })
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
  let inventoryDisappearanceTimer: ReturnType<typeof setTimeout> | null = null
  let structuralRefreshPending = false
  let structuralRefreshPriority: StructuralRefreshPriority = 'normal'
  const activityExitBaselines = new Map<string, ActivityExitBaseline>()
  let inFlight: Promise<void> | null = null
  let actionPreflightInFlight = false
  let activityInFlight: Promise<void> | null = null
  const archivingKeys = new Set<string>()
  let directTaskCommandQueue: Promise<void> = Promise.resolve()
  let stopActivityListener: (() => void) | null = null
  let activityFailureCount = 0
  let lastActivityGeneration = 0
  let activityDecisionDiagnostics = normalizeCodexActivityDecisionDiagnostics(null)
  let environmentInFlight: Promise<void> | null = null
  let environmentGeneration = 0
  let refreshGeneration = 0
  let runtimeGeneration = 0
  let runtimeActive = false
  let lastQuotaReadAt = quota.updatedAt
  let lastTaskReadAt = options.getAppState().codex.lastTaskScanAt
  let inventoryDisappearanceCandidate: InventoryDisappearanceCandidate | null = null

  function codexState(): CodexState {
    return options.getAppState().codex
  }

  function resetInventoryDisappearanceCandidate() {
    if (inventoryDisappearanceTimer) clearTimeout(inventoryDisappearanceTimer)
    inventoryDisappearanceTimer = null
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
  function inventoryDisappearanceDecision(threads: CodexHostThread[], now = Date.now()): { accept: boolean; firstObservation: boolean; missingCount: number; retryAfterMs: number } {
    if (!lastThreads.length) {
      resetInventoryDisappearanceCandidate()
      return { accept: true, firstObservation: false, missingCount: 0, retryAfterMs: 0 }
    }
    const incomingKeys = new Set(threads.map((thread) => thread.key))
    const missingKeys = lastThreads.map((thread) => thread.key).filter((key) => !incomingKeys.has(key)).sort()
    if (!missingKeys.length) {
      resetInventoryDisappearanceCandidate()
      return { accept: true, firstObservation: false, missingCount: 0, retryAfterMs: 0 }
    }
    const signature = missingKeys.join('|')
    const firstObservation = inventoryDisappearanceCandidate?.signature !== signature
    if (firstObservation && inventoryDisappearanceTimer) {
      clearTimeout(inventoryDisappearanceTimer)
      inventoryDisappearanceTimer = null
    }
    const candidate = firstObservation
      ? { signature, firstSeenAt: now, confirmations: 1 }
      : { ...inventoryDisappearanceCandidate!, confirmations: inventoryDisappearanceCandidate!.confirmations + 1 }
    inventoryDisappearanceCandidate = candidate
    const hold = inventoryDisappearanceHold(codexState().settings)
    const elapsed = now - candidate.firstSeenAt
    const accept = candidate.confirmations >= 2 && elapsed >= hold
    const retryAfterMs = candidate.confirmations >= 2 && !accept
      ? Math.max(1, hold - elapsed)
      : 0
    if (accept) resetInventoryDisappearanceCandidate()
    return { accept, firstObservation, missingCount: missingKeys.length, retryAfterMs }
  }

  function isFeatureEnabled(): boolean {
    return options.getAppState().settings.featureConfigs.find((item) => item.id === 'codex')?.enabled !== false
  }

  function shouldRun(): boolean {
    const state = options.getAppState()
    return isFeatureEnabled() && (state.activeTab === 'codex' || state.codex.settings.floatEnabled)
  }

  function publishTaskStatePackage(conversations: ConversationSnapshotV1, now = Date.now()) {
    taskState = buildCodexTaskStatePackage(conversations, {
      sourceRevision: taskStateSourceRevision,
      now,
      dynamicTaskWindowHours: codexState().settings.dynamicTaskWindowHours
    })
    if (started && !disposed && !actionPreflightInFlight && shouldRun()) schedule()
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

  function publishStabilizedConversations(next: ConversationSnapshotV1) {
    rawConversations = next
    publishTaskStatePackage(next)
  }

  function updateConversationStatus(patch: Partial<Pick<ConversationSnapshotV1, 'status' | 'errorCode' | 'errorMessage'>>) {
    rawConversations = { ...rawConversations, ...patch }
    publishTaskStatePackage({ ...taskState.conversations, ...patch })
  }

  function resetConversationProjection(next = rawConversations) {
    activityExitBaselines.clear()
    rawConversations = next
    publishTaskStatePackage(next)
  }

  function resetCodexTaskDerivedState() {
    taskCycleKey = ''
    lastThreads = []
    lastProjects = []
    lastThreadsPartial = false
    lastTaskAuthority = 'inventory-only'
    lastSourceCount = 0
    lastSourceFingerprint = ''
    lastCompleteness = undefined
    lastRawSourceCount = 0
    lastEligibleSourceCount = 0
    lastExcludedSourceCount = 0
    lastNonConversationCount = 0
    lastActivityGeneration = 0
    activityFailureCount = 0
    activityDecisionDiagnostics = normalizeCodexActivityDecisionDiagnostics(null)
    lastTaskReadAt = 0
    resetInventoryDisappearanceCandidate()
    resetConversationProjection(emptyConversationSnapshot())
  }

  function resetCodexDerivedRuntimeState() {
    resetCodexTaskDerivedState()
    lastQuotaReadAt = 0
    modelCatalog = emptyCodexModelCatalog()
    newThreadContextFingerprint = ''
  }

  function applyActivityExitTransition(
    previous: CodexHostThread,
    candidate: CodexHostThread,
    transitionOptions: ActivityExitTransitionOptions = {}
  ): CodexHostThread {
    const transition = reduceActivityExitTransition(
      previous,
      candidate,
      activityExitBaselines.get(candidate.key),
      transitionOptions
    )
    commitActivityExitTransition(candidate.key, transition)
    return transition.thread
  }

  function commitActivityExitTransition(key: string, transition: ActivityExitTransition) {
    if (transition.baseline) activityExitBaselines.set(key, transition.baseline)
    else activityExitBaselines.delete(key)
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
    if (disposed || actionPreflightInFlight || !shouldRun()) return
    const promoted = priority === 'urgent' && structuralRefreshPriority !== 'urgent'
    structuralRefreshPending = true
    if (promoted) structuralRefreshPriority = 'urgent'
    lastTaskReadAt = 0
    if (promoted && structuralRefreshTimer) clearStructuralRefreshTimer()
    armStructuralRefresh()
  }

  function scheduleInventoryDisappearanceRecheck(delay: number) {
    if (inventoryDisappearanceTimer) clearTimeout(inventoryDisappearanceTimer)
    inventoryDisappearanceTimer = null
    if (disposed || actionPreflightInFlight || !shouldRun() || !Number.isFinite(delay) || delay <= 0) return
    inventoryDisappearanceTimer = setTimeout(() => {
      inventoryDisappearanceTimer = null
      if (disposed || !shouldRun() || !inventoryDisappearanceCandidate) return
      lastTaskReadAt = 0
      if (inFlight) {
        structuralRefreshPending = true
        structuralRefreshPriority = 'urgent'
        return
      }
      void refresh({ forceTasks: true })
    }, Math.max(1, Math.ceil(delay)))
  }

  function applyActivityDelta(delta: CodexActivityDelta) {
    if (disposed || !shouldRun() || (delta?.version !== 1 && delta?.version !== 2)) return
    if (!Number.isFinite(delta.receivedAt) || !Number.isFinite(delta.generation) || delta.generation <= 0) return
    let environmentChanged = false
    let diagnosticsChanged = false
    const structuralPriority: StructuralRefreshPriority = delta.version === 2 && delta.inventoryRefreshPriority === 'urgent'
      ? 'urgent'
      : 'normal'
    const inventoryBaselineMatches = Boolean(lastSourceFingerprint)
      && lastCompleteness === 'verified'
      && delta.sourceFingerprint === lastSourceFingerprint
    // A same-source Activity generation orders the whole delta, including the
    // Desktop bridge state. Letting an older delta update only bridge state can
    // later turn failed/interrupted evidence into a false explicit stop.
    if (inventoryBaselineMatches && delta.generation < lastActivityGeneration) return
    if (inventoryBaselineMatches && delta.version === 2 && delta.decisionDiagnostics) {
      const diagnostics = normalizeCodexActivityDecisionDiagnostics(delta.decisionDiagnostics)
      if (!sameCodexActivityDecisionDiagnostics(activityDecisionDiagnostics, diagnostics)) {
        activityDecisionDiagnostics = diagnostics
        diagnosticsChanged = true
      }
    }
    if (delta.version === 2 && delta.receivedAt >= environment.checkedAt && environment.desktopBridgeState !== delta.desktopBridgeState) {
      environment = { ...environment, desktopBridgeState: delta.desktopBridgeState, checkedAt: delta.receivedAt }
      environmentChanged = true
    }
    if (!inventoryBaselineMatches) {
      if (delta.inventoryChanged) scheduleStructuralRefresh(structuralPriority)
      if (environmentChanged) options.notify()
      return
    }
    if (delta.receivedAt < rawConversations.updatedAt && delta.version !== 2) return
    lastActivityGeneration = delta.generation
    const archivedRemoved = delta.version === 2
      ? removeExplicitlyArchivedKeys(delta.archivedKeys, delta.receivedAt)
      : false
    const byKey = new Map(delta.entries.map((entry) => [entry.key, entry]))
    const knownKeys = new Set(lastThreads.map((thread) => thread.key))
    if ([...byKey.keys()].some((key) => !knownKeys.has(key))) {
      scheduleStructuralRefresh('urgent')
    }
    let changed = false
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
              planImplementationOnly: liveEntry?.planImplementationOnly === true,
              ...(liveEntry?.statusAuthority ? { statusAuthority: liveEntry.statusAuthority } : {}),
              ...(liveEntry?.activityEvidence ? { activityEvidence: liveEntry.activityEvidence } : {}),
              ...(Number.isInteger(liveEntry?.activityRevision) ? { activityRevision: liveEntry!.activityRevision } : {}),
              ...(typeof liveEntry?.hasUnreadTurn === 'boolean' ? { hasUnreadTurn: liveEntry.hasUnreadTurn } : {}),
              ...(liveEntry?.unreadAuthority ? { unreadAuthority: liveEntry.unreadAuthority } : {})
            }
        : { ...thread, status: entry.status || thread.status, activeFlags, planImplementationOnly: false, statusAuthority: 'connector' as const }) as CodexHostThread
      if (delta.version === 2 && !readStateOnly && liveEntry?.status) {
        if (liveEntry.status === 'active' && Number.isFinite(liveEntry.desktopActiveSince) && liveEntry.desktopActiveSince! > 0) {
          next.desktopActiveSince = liveEntry.desktopActiveSince!
        } else if (liveEntry.status !== 'active') {
          delete next.desktopActiveSince
        }
        if (liveEntry.status === 'active' && liveEntry.activityEvidence === 'activity-event' && !liveEntry.lastTurnEvidence) {
          delete next.lastTurnEvidence
        }
      }
      const hasLatestTurnEvidence = !readStateOnly && Boolean(liveEntry?.lastTurnStatus)
        && Number.isFinite(liveEntry?.lastTurnStartedAt)
        && liveEntry!.lastTurnStartedAt! > 0
      if (hasLatestTurnEvidence) {
        next.lastTurnStatus = liveEntry!.lastTurnStatus!
        next.lastTurnStartedAt = liveEntry!.lastTurnStartedAt!
        if (liveEntry?.lastTurnEvidence) next.lastTurnEvidence = liveEntry.lastTurnEvidence
        if (liveEntry!.lastTurnStatus === 'completed' && Number.isFinite(liveEntry!.lastTurnCompletedAt) && liveEntry!.lastTurnCompletedAt! > 0) {
          next.lastTurnCompletedAt = liveEntry!.lastTurnCompletedAt!
        } else {
          delete next.lastTurnCompletedAt
        }
      }
      next = preserveLatestTurnEvidence(next, thread)
      const explicitDesktopExitStop = delta.version === 2
        && delta.desktopBridgeState === 'not-running'
        && (next.lastTurnStatus === 'failed' || next.lastTurnStatus === 'interrupted')
      next = applyActivityExitTransition(thread, next, {
        explicitDesktopExitStop
      })
      if (hasSameActivityState(thread, next)) {
        return thread
      }
      changed = true
      return next
    })

    if (!changed) {
      if (environmentChanged || diagnosticsChanged) options.notify()
      if (delta.inventoryChanged || archivedRemoved) scheduleStructuralRefresh(archivedRemoved ? 'urgent' : structuralPriority)
      return
    }

    lastThreads = nextThreads
    publishConversationProjection({
      receivedAt: delta.receivedAt,
      advanceScan: false,
      status: rawConversations.status
    })
    options.notify()
    if (delta.inventoryChanged || archivedRemoved) scheduleStructuralRefresh(archivedRemoved ? 'urgent' : structuralPriority)
  }

  function scheduleActivity(delay?: number) {
    clearActivityTimer()
    if (!started || disposed || !shouldRun() || typeof options.platform.codex.readActivitySnapshot !== 'function') return
    const wait = delay ?? (activityFailureCount >= 3 ? 1_000 : 5_000)
    activityTimer = setTimeout(() => { void pollActivity() }, Math.max(0, wait))
  }

  async function pollActivity() {
    if (disposed || !shouldRun() || typeof options.platform.codex.readActivitySnapshot !== 'function') return
    if (activityInFlight) return activityInFlight
    const runtimeToken = runtimeGeneration
    const operation = (async () => {
      const result = await options.platform.codex.readActivitySnapshot!()
      if (disposed || !shouldRun() || runtimeToken !== runtimeGeneration) return
      if (result.ok) {
        activityFailureCount = 0
        applyActivityDelta(result.value)
      } else {
        activityFailureCount += 1
      }
    })().finally(() => {
      if (activityInFlight !== operation) return
      activityInFlight = null
      if (runtimeToken === runtimeGeneration) scheduleActivity()
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
    const taskWait = Number.isFinite(taskDelay(settings)) ? Math.max(1000, lastTaskReadAt + taskDelay(settings) - now) : Number.POSITIVE_INFINITY
    const nextTaskTransitionAt = taskState.dynamic.nextTransitionAt
    const taskTransitionWait = nextTaskTransitionAt === null
      ? Number.POSITIVE_INFINITY
      : Math.max(1, nextTaskTransitionAt - now)
    const delay = Math.min(quotaWait, taskWait, taskTransitionWait)
    if (!Number.isFinite(delay)) return
    timer = setTimeout(() => {
      const wokeAt = Date.now()
      if (taskState.dynamic.nextTransitionAt !== null && taskState.dynamic.nextTransitionAt <= wokeAt) {
        publishTaskStatePackage(taskState.conversations, wokeAt)
        options.notify()
      }
      void refresh()
    }, delay)
  }

  function persistSnapshots() {
    const state = codexState()
    state.cachedQuota = normalizeCodexQuota(quota)
    state.cachedConfig = normalizeCodexConfig(config)
    options.save()
  }

  function publishVerifiedThreadInventory(
    host: CodexHostSnapshot,
    threads: CodexHostThread[],
    exitTransitions: ReadonlyMap<string, ActivityExitTransition>,
    receivedAt: number,
    input: {
      advanceScan: boolean
      retainMissing: boolean
      status?: ConversationSnapshotV1['status']
    }
  ) {
    const refreshedKeys = new Set(threads.map((thread) => thread.key))
    if (!input.retainMissing) {
      for (const key of activityExitBaselines.keys()) if (!refreshedKeys.has(key)) activityExitBaselines.delete(key)
    }
    for (const [key, transition] of exitTransitions) commitActivityExitTransition(key, transition)

    lastThreads = threads
    if (host.version === 2) {
      const incomingProjects = host.projects || []
      if (input.retainMissing) {
        const incomingProjectKeys = new Set(incomingProjects.map((project) => project.key))
        const retainedProjectKeys = new Set(threads.map((thread) => thread.projectKey).filter(Boolean))
        lastProjects = [
          ...incomingProjects,
          ...lastProjects.filter((project) => retainedProjectKeys.has(project.key) && !incomingProjectKeys.has(project.key))
        ]
      } else {
        lastProjects = incomingProjects
      }
    } else {
      lastProjects = []
    }
    lastThreadsPartial = host.threadsPartial === true
    lastTaskAuthority = host.taskAuthority || 'mixed'
    lastSourceCount = input.retainMissing ? threads.length : host.version === 2 ? host.eligibleSourceCount ?? threads.length : threads.length
    lastSourceFingerprint = host.version === 2 ? host.sourceFingerprint || '' : ''
    lastCompleteness = host.version === 2 ? host.completeness : undefined
    lastRawSourceCount = host.version === 2 ? host.rawSourceCount ?? threads.length : threads.length
    lastEligibleSourceCount = host.version === 2 ? host.eligibleSourceCount ?? threads.length : threads.length
    lastExcludedSourceCount = host.version === 2 ? host.excludedSourceCount ?? 0 : 0
    lastNonConversationCount = host.version === 2 ? host.nonConversationCount ?? 0 : 0
    const incomingActivityGeneration = host.version === 2
      && Number.isInteger(host.activityGeneration)
      && host.activityGeneration! > 0
      ? host.activityGeneration!
      : 0
    lastActivityGeneration = Math.max(lastActivityGeneration, incomingActivityGeneration)
    publishConversationProjection({ receivedAt, advanceScan: input.advanceScan, status: input.status })
    codexState().firstPromptTimes = normalizeCodexFirstPromptTimes([
      ...threads.flatMap((thread) => thread.firstPromptAt ? [{ key: thread.key, firstPromptAt: thread.firstPromptAt, updatedAt: receivedAt }] : []),
      ...codexState().firstPromptTimes
    ])
    lastTaskReadAt = receivedAt
  }

  function publishConversationProjection(input: { receivedAt: number; advanceScan: boolean; status?: ConversationSnapshotV1['status'] }) {
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
    publishStabilizedConversations(nextConversations)
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

  async function refresh(input: { force?: boolean; forceTasks?: boolean; actionPreflight?: boolean } = {}) {
    const actionPreflight = input.actionPreflight === true
    const refreshAllowed = () => actionPreflight ? isFeatureEnabled() : shouldRun()
    if (disposed || !refreshAllowed()) return
    if (inFlight) {
      await inFlight
      if (actionPreflight && !disposed && refreshAllowed()) return refresh(input)
      return
    }
    const runtimeToken = runtimeGeneration
    const now = Date.now()
    const settings = codexState().settings
    const includeQuota = !actionPreflight && (input.force === true || quota.updatedAt <= 0 || (Number.isFinite(quotaDelay(settings)) && now - lastQuotaReadAt >= quotaDelay(settings)))
    const includeThreads = actionPreflight || settings.conversationInboxEnabled && (input.force === true || input.forceTasks === true || rawConversations.updatedAt <= 0 || (Number.isFinite(taskDelay(settings)) && now - lastTaskReadAt >= taskDelay(settings)))
    const includeConfig = includeQuota && !actionPreflight
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
    if (actionPreflight) actionPreflightInFlight = true
    if (includeQuota && quota.updatedAt <= 0) quota = { ...quota, status: 'loading' }
    if (includeThreads && rawConversations.updatedAt <= 0) updateConversationStatus({ status: 'loading' })
    options.notify()
    const generation = ++refreshGeneration
    const operation = (async () => {
      await inspectEnvironment(input.force === true)
      if (disposed || !refreshAllowed() || runtimeToken !== runtimeGeneration || generation !== refreshGeneration) return
      const [quotaResult, threadResult] = await Promise.all([
        includeQuota
          ? options.platform.codex.readSnapshot({ includeQuota: true, includeConfig: true, includeThreads: false })
          : Promise.resolve(null),
        includeThreads
          ? options.platform.codex.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
          : Promise.resolve(null)
      ])
      if (disposed || !refreshAllowed() || runtimeToken !== runtimeGeneration || generation !== refreshGeneration) return
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
          const hostActivityGeneration = host.version === 2
            && Number.isInteger(host.activityGeneration)
            && host.activityGeneration! > 0
            ? host.activityGeneration!
            : 0
          if (host.version === 2 && !verifiedV2) {
            resetInventoryDisappearanceCandidate()
            updateConversationStatus({
              status: rawConversations.updatedAt > 0 ? 'stale' : 'error',
              errorCode: 'protocol-error',
              errorMessage: 'Codex 会话预检不完整，已拒绝发布快照'
            })
            lastTaskReadAt = taskReceivedAt
            options.setMessage('Codex 会话预检不完整，已保留上一份已验证快照')
          } else if (host.version === 2
            && lastActivityGeneration > 0
            && (hostActivityGeneration === 0 || hostActivityGeneration < lastActivityGeneration)) {
            scheduleStructuralRefresh('urgent')
            options.setMessage('Codex 会话快照缺少当前实时代次或早于实时状态，已保留较新的任务状态并自动复核')
          } else {
            const firstPromptByKey = new Map(codexState().firstPromptTimes.map((entry) => [entry.key, entry.firstPromptAt]))
            const previousByKey = new Map(lastThreads.map((thread) => [thread.key, thread] as const))
            const exitTransitions = new Map<string, ActivityExitTransition>()
            const threads = (host.threads as CodexHostThread[]).filter((thread) => !archivingKeys.has(thread.key)).map((thread) => ({
              ...thread,
              ...(thread.firstPromptAt ? {} : firstPromptByKey.has(thread.key) ? { firstPromptAt: firstPromptByKey.get(thread.key) } : {})
            })).map((thread) => {
              const previous = previousByKey.get(thread.key)
              const preserved = preserveLatestTurnEvidence(thread, previous)
              if (!previous) return preserved
              const transition = reduceActivityExitTransition(
                previous,
                preserved,
                activityExitBaselines.get(thread.key)
              )
              exitTransitions.set(thread.key, transition)
              return transition.thread
            })
            const disappearance = inventoryDisappearanceDecision(threads)
            if (!disappearance.accept) {
              const status = rawConversations.updatedAt > 0 ? 'stale' : 'error'
              rawConversations = { ...rawConversations,
                status,
                errorCode: 'protocol-error',
                errorMessage: 'Codex 任务清单数量暂时不稳定，已保留上一份稳定状态'
              }
              const incomingKeys = new Set(threads.map((thread) => thread.key))
              const stabilizedThreads = [
                ...threads,
                ...lastThreads.filter((thread) => !incomingKeys.has(thread.key))
              ]
              publishVerifiedThreadInventory(host, stabilizedThreads, exitTransitions, taskReceivedAt, {
                advanceScan: false,
                retainMissing: true,
                status
              })
              if (disappearance.firstObservation) {
                options.setMessage(`检测到 ${disappearance.missingCount} 项任务暂时缺失，已保留上一份稳定清单并自动复核`)
                scheduleStructuralRefresh()
              } else if (disappearance.retryAfterMs > 0) {
                scheduleInventoryDisappearanceRecheck(disappearance.retryAfterMs)
              }
            } else {
              publishVerifiedThreadInventory(host, threads, exitTransitions, taskReceivedAt, {
                advanceScan: true,
                retainMissing: false
              })
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
      if (actionPreflight) actionPreflightInFlight = false
      if (inFlight !== operation) return
      refreshing = false
      inFlight = null
      if (!disposed) options.notify()
      if (disposed || actionPreflight || !shouldRun() || runtimeToken !== runtimeGeneration) return
      if (structuralRefreshPending) armStructuralRefresh()
      else schedule()
      scheduleActivity(0)
    })
    inFlight = operation
    return inFlight
  }

  function syncActivation(force = false) {
    if (!started || disposed) return
    const featureEnabled = isFeatureEnabled()
    const running = shouldRun()
    if (!featureEnabled) {
      environmentGeneration += 1
      environmentInFlight = null
      if (environment.checking) {
        environment = { ...environment, checking: false }
        options.notify()
      }
    }
    if (featureEnabled && environment.checkedAt <= 0) void inspectEnvironment()
    if (!running) {
      runtimeActive = false
      runtimeGeneration += 1
      refreshGeneration += 1
      inFlight = null
      activityInFlight = null
      refreshing = false
      clearTimer()
      clearActivityTimer()
      resetStructuralRefresh()
      resetCodexDerivedRuntimeState()
      options.platform.codex.close({ preserveDesktop: featureEnabled })
      return
    }
    const resuming = !runtimeActive
    if (resuming) {
      runtimeActive = true
      runtimeGeneration += 1
      refreshGeneration += 1
      inFlight = null
      activityInFlight = null
      resetStructuralRefresh()
      resetCodexDerivedRuntimeState()
    }
    if (featureEnabled && resuming) void inspectEnvironment(true)
    if (taskState.compatibility === 'degraded') {
      options.setMessage(CODEX_TASK_STATE_DEGRADED_MESSAGE)
    }
    if (resuming || force || (quota.updatedAt <= 0 && rawConversations.updatedAt <= 0)) void refresh({ force: true })
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
    const inboxChanged = current.conversationInboxEnabled !== next.conversationInboxEnabled
    if (inboxChanged) {
      runtimeGeneration += 1
      refreshGeneration += 1
      inFlight = null
      activityInFlight = null
      refreshing = false
      clearTimer()
      clearActivityTimer()
      resetStructuralRefresh()
      resetCodexTaskDerivedState()
    } else if (current.timeWindowDays !== next.timeWindowDays && lastThreads.length) {
      publishConversationProjection({ receivedAt: Date.now(), advanceScan: false, status: rawConversations.status })
    } else if (current.dynamicTaskWindowHours !== next.dynamicTaskWindowHours) {
      publishTaskStatePackage(rawConversations)
    }
    options.save()
    options.notify()
    const needsFreshRead = inboxChanged ||
      current.quotaRefreshSeconds !== next.quotaRefreshSeconds ||
      current.taskRefreshSeconds !== next.taskRefreshSeconds
    syncActivation(needsFreshRead || (!current.floatEnabled && next.floatEnabled))
    return true
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
    const conversations = taskState.conversations
    return conversations.all.length
      ? conversations.all
      : [...conversations.ongoing, ...conversations.completedUnread, ...conversations.completed, ...conversations.hidden]
  }

  function displayOrderedTasks(tasks: CodexTaskCard[]): CodexTaskCard[] {
    const pinnedOrder = new Map<string, number>()
    const pinned = taskState.conversations.projectSections.find((section) => section.id === 'pinned')
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
    if (!taskState.conversations.projects.some((project) => project.key === key)) return false
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
      : taskState.conversations.projects.some((project) => project.key === key)
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
      : taskState.conversations.projects.some((project) => project.key === key && project.kind !== 'chats')
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
    if (!taskState.conversations.projects.some((project) => project.key === key && project.kind === 'project')) return false
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
    const project = taskState.conversations.projects.find((item) => item.key === key && item.actionAlias === actionAlias && item.kind === 'project')
    if (!project || taskState.conversations.completeness !== 'verified' || !taskState.conversations.sourceFingerprint || sourceFingerprint !== taskState.conversations.sourceFingerprint) {
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
      activityExitBaselines.delete(threadKey)
    }
    resetInventoryDisappearanceCandidate()
    publishConversationProjection({ receivedAt: Date.now(), advanceScan: false })
    options.save()
    options.notify()
    lastTaskReadAt = 0
    await refresh({ forceTasks: true })
    if (taskState.conversations.projects.some((item) => item.key === key)) {
      lastTaskReadAt = 0
      await refresh({ forceTasks: true })
    }
    return true
  }

  async function openThread(key: string, actionAlias: string) {
    if (!key || !actionAlias || disposed || !isFeatureEnabled()) return false
    let task = allTasks().find((item) => item.key === key && item.actionAlias === actionAlias)
    if (!task) {
      await refresh({ actionPreflight: true })
      if (disposed || !isFeatureEnabled()) return false
      task = allTasks().find((item) => item.key === key && item.actionAlias)
    }
    if (!task) {
      options.setMessage('线程动作已失效，请刷新后重试')
      return false
    }
    let result = await options.platform.codex.openThread(task.actionAlias!)
    if (['expired-alias', 'invalid-alias', 'stale-alias'].includes(result.errorCode || '')) {
      const previousAlias = task.actionAlias
      await refresh({ actionPreflight: true })
      if (disposed || !isFeatureEnabled()) return false
      const refreshedTask = allTasks().find((item) => item.key === key && item.actionAlias)
      if (refreshedTask?.actionAlias && refreshedTask.actionAlias !== previousAlias) {
        task = refreshedTask
        result = await options.platform.codex.openThread(refreshedTask.actionAlias)
      }
    }
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

  function openFirstInputFromCurrentInventory() {
    const task = taskState.conversations.inputRequired[0]
    if (!task?.actionAlias) {
      options.setMessage('当前没有待输入任务')
      return false
    }
    void openThread(task.key, task.actionAlias)
    return true
  }

  function openFirstCompletedUnreadFromCurrentInventory() {
    const task = displayOrderedTasks(allTasks().filter((item) => item.bucket === 'completed-unread'))[0]
    if (!task?.actionAlias) {
      options.setMessage('当前没有已完成未读任务')
      return false
    }
    void openThread(task.key, task.actionAlias)
    return true
  }

  function runDirectTaskCommand(command: () => boolean) {
    if (disposed || !isFeatureEnabled()) return false
    if (lastThreads.length) return command()
    // A uTools mainHide entry can reach Runtime immediately after start(),
    // while syncActivation has intentionally cleared the previous lifecycle's
    // inventory. Serialize those accepted commands behind one tasks-only read
    // so a cold shortcut is not consumed against an empty projection.
    directTaskCommandQueue = directTaskCommandQueue
      .catch(() => undefined)
      .then(async () => {
        if (disposed || !isFeatureEnabled()) return
        if (!lastThreads.length) await refresh({ actionPreflight: true })
        if (disposed || !isFeatureEnabled()) return
        command()
      })
    return true
  }

  function openFirstInput() {
    return runDirectTaskCommand(openFirstInputFromCurrentInventory)
  }

  function openFirstCompletedUnread() {
    return runDirectTaskCommand(openFirstCompletedUnreadFromCurrentInventory)
  }

  function cycleTasks(): Array<CodexTaskCard & { actionAlias: string }> {
    const tasks = allTasks()
    const inputRequiredTasks = displayOrderedTasks(taskState.conversations.inputRequired)
    const recentActiveTasks = taskState.dynamic.groups.active
    const usableTasks = (candidates: CodexTaskCard[]) => {
      const seen = new Set<string>()
      return candidates.filter((task): task is CodexTaskCard & { actionAlias: string } => {
        if (!task.actionAlias || seen.has(task.key)) return false
        seen.add(task.key)
        return true
      })
    }
    const tiers = [
      [
        ...inputRequiredTasks.filter((task) => task.planImplementationOnly !== true),
        ...displayOrderedTasks(recentActiveTasks.filter((task) => task.activityState === 'waiting-approval'))
      ],
      inputRequiredTasks.filter((task) => task.planImplementationOnly === true),
      displayOrderedTasks(recentActiveTasks.filter((task) => task.activityState !== 'waiting-approval'))
    ]
    for (const tier of tiers) {
      const candidates = usableTasks(tier)
      if (candidates.length) return candidates
    }
    return usableTasks(displayOrderedTasks(tasks.filter((task) => task.pinSource === 'local' && task.bucket !== 'stopped')))
  }

  function cycleTaskFromCurrentInventory(direction: -1 | 1) {
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

  function cycleTask(direction: -1 | 1) {
    return runDirectTaskCommand(() => cycleTaskFromCurrentInventory(direction))
  }

  const environmentRememberedByProject: Record<string, string> = {}
  let pendingEnvironmentPush: {
    slotIndex: number
    confirmToken: string
    targetAlias: string
    environmentId: string
    actionId: string
    until: number
  } | null = null

  function rememberEnvironmentForProject(projectKey: string, environmentId: string) {
    if (typeof projectKey !== 'string' || !projectKey) return false
    if (typeof environmentId !== 'string' || !environmentId) return false
    environmentRememberedByProject[projectKey] = environmentId
    return true
  }

  async function runEnvironmentActionSlot(slotIndex: number) {
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 4) return false
    if (typeof options.platform.codex.listProjectEnvironments !== 'function' || typeof options.platform.codex.runProjectAction !== 'function') {
      options.setMessage('当前宿主不支持 Environment Action')
      return false
    }
    const settings = codexState().settings
    // uTools 全局热键冷启动时，可能尚未完成 Codex 会话快照装载；这里先拉取一次，避免 target 解析失败导致窗口被隐藏/执行空转。
    if (taskState.conversations.projects.length === 0 && lastCompleteness !== 'verified') {
      await refresh({ force: true })
    }
    let target = resolveCodexEnvironmentActionTarget({
      selectedTasks: [],
      defaultProjectKey: settings.actionDefaultProjectKey || '',
      projects: taskState.conversations.projects
    })
    if (!target) {
      const pinnedProjects = (taskState.conversations.projectSections.find((section) => section.id === 'pinned')?.entries || [])
        .filter((entry): entry is { kind: 'project'; project: (typeof taskState.conversations.projects)[number]; pinSource?: 'native' | 'local' } => entry.kind === 'project')
        .map((entry) => entry.project)
      const candidates = buildCodexEnvironmentProjectCandidates({
        pinnedProjects,
        projects: taskState.conversations.projects
      })
      const first = candidates.find((item) => item.actionAlias)
      if (first?.actionAlias) {
        target = {
          kind: 'project',
          projectKey: first.projectKey,
          projectName: first.projectName,
          targetAlias: first.actionAlias
        }
      }
    }
    if (!target) {
      options.setMessage('请先配置 Action 默认项目，或在悬浮卡「项目」Tab 置顶项目')
      return false
    }
    const listed = await options.platform.codex.listProjectEnvironments(target.targetAlias)
    if (disposed) return false
    if (!listed || listed.outcome !== 'ok' || !listed.environments.length) {
      options.setMessage(listed?.message || '该项目未配置 Environment')
      return false
    }
    const remembered = environmentRememberedByProject[target.projectKey]
    const environment = listed.environments.find((item) => item.id === remembered) || listed.environments[0]
    environmentRememberedByProject[target.projectKey] = environment.id
    const slots = buildCodexEnvironmentActionSlots(environment)
    const action = slots[slotIndex]?.action
    if (!action) {
      options.setMessage(`Action 槽 ${slotIndex + 1} 为空`)
      return false
    }
    const now = Date.now()
    const confirmToken = pendingEnvironmentPush
      && pendingEnvironmentPush.slotIndex === slotIndex
      && pendingEnvironmentPush.until >= now
      && pendingEnvironmentPush.targetAlias === target.targetAlias
      && pendingEnvironmentPush.environmentId === environment.id
      && pendingEnvironmentPush.actionId === action.id
      ? pendingEnvironmentPush.confirmToken
      : undefined
    const result = await options.platform.codex.runProjectAction({
      targetAlias: target.targetAlias,
      environmentId: environment.id,
      actionId: action.id,
      confirmToken,
      stopIfRunning: action.risk === 'long-running'
    })
    if (disposed) return false
    if (result?.outcome === 'confirm-required' && result.confirmToken) {
      pendingEnvironmentPush = {
        slotIndex,
        confirmToken: result.confirmToken,
        targetAlias: target.targetAlias,
        environmentId: environment.id,
        actionId: action.id,
        until: now + 5_000
      }
      options.setMessage(`${action.name}：请在 5 秒内再次触发全局快捷键确认（外部写入）`)
      return true
    }
    pendingEnvironmentPush = null
    options.setMessage(result?.message || (result?.outcome === 'ok' || result?.outcome === 'started' ? `${action.name} 已执行` : `${action.name} 执行失败`))
    return result?.outcome === 'ok' || result?.outcome === 'started' || result?.outcome === 'running' || result?.outcome === 'stopping'
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
    const task = taskState.conversations.hidden.find((item) => item.key === key && item.hiddenKind === kind)
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
    if (!task || task.archiveCapability !== 'allowed' || !task.actionAlias || !task.lastTurnStartedAt || taskState.conversations.completeness !== 'verified' || !taskState.conversations.sourceFingerprint || taskArchive.status === 'archiving') {
      options.setMessage(task?.archiveCapability === 'blocked-stopped'
        ? '会话已停止但未完成，不能归档'
        : '任务仍在进行中，暂不能归档')
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
      expectedSourceFingerprint: taskState.conversations.sourceFingerprint,
      evidence: 'completed'
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
    const project = taskState.conversations.projects.find((item) => item.key === key && item.actionAlias === actionAlias)
    if (!project || project.kind === 'chats' && !actionAlias || !taskState.conversations.sourceFingerprint) {
      options.setMessage('项目动作已失效，请刷新后重试')
      return false
    }
    projectArchive = { key, status: 'archiving', message: '正在分批归档项目任务' }
    options.notify()
    const result = await options.platform.codex.archiveProject(actionAlias, { expectedSourceFingerprint: taskState.conversations.sourceFingerprint })
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
      ? `${result.archivedKeys.length} 项已归档，${result.failed.length} 项失败，${result.skippedActiveKeys.length} 项未完成${desktopSyncMessage}`
      : `已归档 ${result.archivedKeys.length} 项${desktopSyncMessage}；跳过 ${result.skippedActiveKeys.length} 项未完成任务`
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
      stopActivityListener = options.platform.codex.onActivityChanged?.((delta) => applyActivityDelta(delta)) || null
      if (isFeatureEnabled()) void inspectEnvironment()
      syncActivation(true)
    },
    dispose() {
      disposed = true
      environmentGeneration += 1
      refreshGeneration += 1
      if (environment.checking) environment = { ...environment, checking: false }
      clearTimer()
      clearActivityTimer()
      resetStructuralRefresh()
      resetInventoryDisappearanceCandidate()
      resetConversationProjection()
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
    runEnvironmentActionSlot,
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
    rememberEnvironmentForProject,
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
        taskState,
        conversations: taskState.conversations,
        activityDecisionDiagnostics,
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
        taskState,
        style: settings.displayStyle,
        conversationInboxEnabled: settings.conversationInboxEnabled,
        compactFields: settings.compactFields,
        expandedFields: settings.expandedFields,
        colors: settings.colors,
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
        conversations: taskState.conversations,
        taskArchive,
        projectArchive,
        timeWindowDays: settings.timeWindowDays,
        actionDefaultProjectKey: settings.actionDefaultProjectKey || '',
        generatedAt: Date.now()
      }
    }
  }
}
