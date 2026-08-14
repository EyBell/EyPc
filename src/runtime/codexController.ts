import {
  conversationSnapshotFromReceipts,
  emptyCodexEnvironment,
  emptyCodexModelCatalog,
  emptyConversationSnapshot,
  hideCodexThread,
  hasCodexLiveActivityEvidence,
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
  type CodexAttentionKind,
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
  type CodexProjectCard,
  type CodexQuotaSnapshotV1,
  type CodexSettings,
  type CodexState,
  type CodexTaskTab,
  type CodexTaskCard,
  type ConversationSnapshotV1
} from '../domain/codex'
import { companionTaskKey, companionTaskProvider, isCompanionProviderEnabled, isCompanionLivePhase } from '../domain/companionProvider'
import { mergeCompanionConversations, withoutCompanionProvider } from '../domain/companionAggregate'
import type { CompanionSnapshotSlice } from '../domain/companionPresentation'
import {
  emptyClaudeEnvironment,
  emptyClaudeQuota,
  emptyClaudeQuotaAccess,
  mergeClaudeQuotaWindows,
  mergeClaudePlanUsage,
  normalizeClaudeQuota,
  normalizeClaudeQuotaAccess,
  quotaNeedsClaudeSupplement,
  staleClaudeQuota,
  type ClaudeEnvironmentSnapshot,
  type ClaudeQuotaAccessSnapshot,
  type ClaudeQuotaSnapshot
} from '../domain/claude'
import {
  claudeCodeCompletionEpoch,
  claudeCodeStateEvidenceAt,
  compareClaudeCodeStateVersion,
  normalizeClaudeCodeObservation,
  normalizeClaudeCodeUnread,
  projectClaudeCodeTaskCards,
  type ClaudeCodeObservation,
  type ClaudeCodeUnreadObservation
} from '../domain/claudeCode'
import { normalizeCodexModelCatalog } from '../domain/codexNewThread'
import { CODEX_ACTION_HOST_RUNTIME_REVISION, isCodexActionStartAccepted } from '../domain/codexEnvironment'
import {
  buildCodexTaskStatePackage,
  CODEX_TASK_STATE_DEGRADED_MESSAGE,
  type CodexTaskStatePackageV1
} from '../domain/codexPresentation'
import {
  applyCompanionTaskPackageViews,
  emptyCompanionTaskPackage,
  COMPANION_TASK_KERNEL_REVISION,
  COMPANION_TASK_PACKAGE_REVISION,
  type CompanionTaskPackageV4
} from '../domain/companionTaskPackage'
import { codexActionLaneId, resolveCodexActionRunnerPriorityProject, type CodexActionRunnerCatalogV1 } from '../domain/codexActionRunner'
import type { AppState } from '../domain/types'
import {
  type CodexFloatWorkspaceDiagnostics,
  type CompanionTaskMutationDelta,
  type CompanionNavigationResult,
  type CompanionNavigationResultEvent,
  type EypcPlatformApi,
  type RuntimeDiagnosticsSnapshotV3,
  type RuntimeIdentityHandshakeV1
} from '../platform/eypcPlatform'

export interface CodexRuntimeView {
  settings: CodexSettings
  environment: CodexEnvironmentSnapshotV1
  quota: CodexQuotaSnapshotV1
  config: CodexConfigSnapshotV1
  modelCatalog: CodexModelCatalogSnapshotV1
  newThreadContextFingerprint: string
  taskState: CodexTaskStatePackageV1
  /** Process-owned canonical package shared by Main, Float and shortcuts. */
  companionTaskPackage: CompanionTaskPackageV4
  runtimeIdentity?: RuntimeIdentityHandshakeV1
  runtimeDiagnostics?: RuntimeDiagnosticsSnapshotV3
  /** @deprecated Consume taskState.conversations. */
  conversations: ConversationSnapshotV1
  activityDecisionDiagnostics: CodexActivityDecisionDiagnostics
  /** Claude provider state for the settings page. */
  claudeEnvironment: ClaudeEnvironmentSnapshot
  /**
   * Non-archived desktop-app sessions in the current inventory. Settings-page
   * status only; the cards themselves already arrive merged in `taskState`.
   */
  claudeCodeSessionCount: number
  claudeQuota: ClaudeQuotaSnapshot
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
  /** Base/settings/quota lane; independent from companionTaskPackage.packageRevision. */
  baseRevision?: number
  /** Optional for old floating renderers; current Controller snapshots always include it. */
  taskStateRevision?: string
  /** Optional only when consuming a long-lived older Controller snapshot. */
  taskState?: CodexTaskStatePackageV1
  companionTaskPackage?: CompanionTaskPackageV4
  runtimeIdentity?: RuntimeIdentityHandshakeV1
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
  /** Process-local action state; cards remain visible until verified removal. */
  archivingTaskKeys?: string[]
  projectArchive: { key: string; status: 'idle' | 'archiving' | 'error'; message: string }
  timeWindowDays: number
  actionDefaultProjectKey?: string
  keybindings?: Array<{ actionId: string; shortcutId: string; layer: string; when: string; weight: number }>
  /**
   * Multi-provider payload. Optional so an older floating child simply ignores
   * it and keeps rendering the Codex-only presentation.
   */
  companion?: CompanionSnapshotSlice
  generatedAt: number
}

function codexFloatTaskStructure(snapshot: CodexFloatSnapshotV1) {
  const conversations = snapshot.taskState?.conversations
  if (!conversations) return null
  const project = (value: typeof conversations.projects[number]) => ({
    key: value.key,
    actionAlias: value.actionAlias || '',
    name: value.name,
    kind: value.kind,
    collapsed: value.collapsed,
    nativePinned: value.nativePinned,
    virtual: value.virtual,
    providers: value.providers,
    tasks: value.tasks.map((task) => [task.key, task.actionAlias || '', task.name, task.projectKey, task.projectName, task.projectKind])
  })
  return {
    sourceFingerprint: conversations.sourceFingerprint,
    projects: conversations.projects.map(project),
    hiddenProjects: conversations.hiddenProjects.map(project),
    tasks: conversations.all.map((task) => [task.key, task.actionAlias || '', task.name, task.projectKey, task.projectName, task.projectKind]),
    sections: conversations.projectSections.map((section) => ({
      id: section.id,
      entries: section.entries.map((entry) => entry.kind === 'task'
        ? ['task', entry.task.key]
        : ['project', entry.project.key])
    }))
  }
}

function codexFloatBaseSemanticFingerprint(snapshot: CodexFloatSnapshotV1) {
  const base = { ...snapshot } as Record<string, unknown>
  delete base.baseRevision
  delete base.generatedAt
  delete base.companionTaskPackage
  delete base.taskState
  delete base.conversations
  const companion = snapshot.companion ? { ...snapshot.companion } : undefined
  if (companion) {
    delete companion.revision
    delete companion.stateGeneration
    delete companion.unreadGeneration
  }
  base.companion = companion
  base.taskStructure = codexFloatTaskStructure(snapshot)
  return JSON.stringify(base)
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

/** Independent Claude quota wake-up: cadence or the earliest reset + 1 second. */
export function claudeQuotaScheduleDelay(
  settings: Pick<CodexSettings, 'quotaRefreshSeconds'>,
  lastReadAt: number,
  windows: readonly { resetAt: number | null }[],
  now: number
): number {
  const cadence = settings.quotaRefreshSeconds > 0
    ? Math.max(1000, lastReadAt + settings.quotaRefreshSeconds * 1000 - now)
    : Number.POSITIVE_INFINITY
  const earliestResetAt = windows.reduce<number | null>((earliest, window) => {
    if (window.resetAt === null) return earliest
    const wakeAt = window.resetAt + 1000
    // A reset wake-up is one-shot. Once a read has started at or after the
    // deadline, a retained stale reset must not create a 1ms retry loop; the
    // quota adapter's credential/Retry-After/backoff clock owns later retries.
    if (lastReadAt >= wakeAt) return earliest
    return earliest === null ? window.resetAt : Math.min(earliest, window.resetAt)
  }, null)
  const reset = earliestResetAt === null ? Number.POSITIVE_INFINITY : Math.max(1, earliestResetAt + 1000 - now)
  return Math.min(cadence, reset)
}

const MIN_INVENTORY_DISAPPEARANCE_HOLD_MS = 3_000
const URGENT_STRUCTURAL_REFRESH_DELAY_MS = 50
const NORMAL_STRUCTURAL_REFRESH_DELAY_MS = 200
function inventoryDisappearanceHold(_settings: CodexSettings): number {
  return MIN_INVENTORY_DISAPPEARANCE_HOLD_MS
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
  if (!hasCodexLiveActivityEvidence(thread)) return false
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
  // A verified inventory refresh can omit the private causal counters. It may
  // refine metadata, but it cannot erase a newer live/terminal ordering that
  // the activity lane already established.
  if (!candidate.activeEvidenceSequence && previous.activeEvidenceSequence) {
    candidate = { ...candidate, activeEvidenceSequence: previous.activeEvidenceSequence }
  }
  if (!candidate.terminalEvidenceSequence && previous.terminalEvidenceSequence) {
    candidate = { ...candidate, terminalEvidenceSequence: previous.terminalEvidenceSequence }
  }
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
    && (previous.planReady === true) === (next.planReady === true)
    && previous.planLifecycleRevision === next.planLifecycleRevision
    && previous.turnMode === next.turnMode
    && (previous.idleConfirmed === true) === (next.idleConfirmed === true)
    && previous.statusAuthority === next.statusAuthority
    && previous.activityEvidence === next.activityEvidence
    && previous.activityRevision === next.activityRevision
    && previous.waitingSince === next.waitingSince
    && previous.desktopActiveSince === next.desktopActiveSince
    && previous.hasUnreadTurn === next.hasUnreadTurn
    && previous.unreadAuthority === next.unreadAuthority
    && previous.lastTurnStatus === next.lastTurnStatus
    && previous.lastTurnStartedAt === next.lastTurnStartedAt
    && previous.lastTurnCompletedAt === next.lastTurnCompletedAt
    && previous.lastTurnEvidence === next.lastTurnEvidence
    && previous.activeEvidenceSequence === next.activeEvidenceSequence
    && previous.terminalEvidenceSequence === next.terminalEvidenceSequence
}

export function createCodexController(options: CodexControllerOptions) {
  // Direct test/custom adapters may omit the capability. The production
  // platform adapter always supplies either the exact revision or `legacy`.
  const taskStateSourceRevision = options.platform.codex.taskStateRevision || CODEX_TASK_STATE_REVISION
  const companionKernel = options.platform.companionKernel?.revision === COMPANION_TASK_KERNEL_REVISION
    && options.platform.companionKernel.packageRevision === COMPANION_TASK_PACKAGE_REVISION
    ? options.platform.companionKernel
    : null
  let quota = normalizeCodexQuota(options.getAppState().codex.cachedQuota)
  if (quota.updatedAt > 0 && quota.status === 'ok') quota = { ...quota, status: 'stale' }
  let config = normalizeCodexConfig(options.getAppState().codex.cachedConfig)
  let modelCatalog = emptyCodexModelCatalog()
  let newThreadContextFingerprint = ''
  let environment = emptyCodexEnvironment()
  let rawConversations = conversationSnapshotFromReceipts(options.getAppState().codex.receipts)
  let sourceTaskState = buildCodexTaskStatePackage(rawConversations, {
    sourceRevision: taskStateSourceRevision,
    dynamicTaskWindowHours: options.getAppState().codex.settings.dynamicTaskWindowHours
  })
  let taskState = companionKernel
    ? buildCodexTaskStatePackage(emptyConversationSnapshot(), {
        sourceRevision: taskStateSourceRevision,
        dynamicTaskWindowHours: options.getAppState().codex.settings.dynamicTaskWindowHours
      })
    : sourceTaskState
  let companionTaskPackage = emptyCompanionTaskPackage(options.getAppState().codex.settings.providers)
  // Incomplete Kernel packages are transport/readiness signals, never an
  // invitation to resurrect the legacy Renderer classifier. Metadata refreshes
  // continue projecting the last complete semantic decision until a newer
  // complete package replaces it.
  let lastCompleteCompanionTaskPackage: CompanionTaskPackageV4 | null = null
  // Claude provider lane. Kept entirely separate from the Codex lane so a
  // Claude failure degrades Claude alone; every field resets on disable.
  let claudeEnvironment: ClaudeEnvironmentSnapshot = emptyClaudeEnvironment()
  let claudeCodeSessions: ClaudeCodeObservation[] = []
  let claudeQuota: ClaudeQuotaSnapshot = emptyClaudeQuota()
  let claudeQuotaAccess: ClaudeQuotaAccessSnapshot = emptyClaudeQuotaAccess()
  const claudeAppQuotaKeys = new Set<string>()
  let claudeEventDispose: (() => void) | null = null
  let claudeCodeWatchDispose: (() => void) | null = null
  let claudeUnreadWatchDispose: (() => void) | null = null
  let claudeStatePending = false
  let claudeInventoryPending = false
  let claudeUnreadPending = false
  // Exact native unread is deliberately process-local. A failed current
  // snapshot is `unknown`; persisted legacy sets must never impersonate it.
  let claudeCodeUnread: string[] | null = null
  type ClaudeReadHint = { completionEpoch: string; acknowledgedAt: number; nativeConfirmed: boolean }
  const claudeReadHints = new Map<string, ClaudeReadHint>()
  const claudeUnreadRecheckTimers = new Set<ReturnType<typeof setTimeout>>()
  let lastClaudeUnreadVersion: 0 | 1 | 2 = 0
  let lastClaudeUnreadGeneration = 0
  let lastClaudeUnreadReadAt = 0
  let lastClaudeStateGeneration = 0
  let lastClaudeInventoryGeneration = 0
  let lastClaudeMutationGeneration = 0
  const claudeMembershipTombstones = new Map<string, number>()
  let claudeStateFailureCount = 0
  let claudeControllerRevision = 0
  let lastClaudeTaskPublishRevision = 0
  let lastClaudeReadAt = 0
  let lastClaudeQuotaReadAt = 0
  type ClaudeLaneRefreshResult = { changed: boolean; available: boolean }
  let claudeStateInFlight: Promise<ClaudeLaneRefreshResult> | null = null
  let claudeInventoryInFlight: Promise<boolean> | null = null
  let claudeUnreadInFlight: Promise<ClaudeLaneRefreshResult> | null = null
  let claudeQuotaInFlight = false
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
  let taskInventoryPublishSequence = 0
  let taskArchive = { key: '', status: 'idle' as 'idle' | 'archiving' | 'error', message: '' }
  let projectArchive = { key: '', status: 'idle' as 'idle' | 'archiving' | 'error', message: '' }
  let floatBaseRevision = 0
  let floatBaseFingerprint = ''
  let floatBaseSnapshot: CodexFloatSnapshotV1 | null = null
  let refreshing = false
  let started = false
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let structuralRefreshTimer: ReturnType<typeof setTimeout> | null = null
  let inventoryDisappearanceTimer: ReturnType<typeof setTimeout> | null = null
  let structuralRefreshPending = false
  let structuralRefreshPriority: StructuralRefreshPriority = 'normal'
  const activityExitBaselines = new Map<string, ActivityExitBaseline>()
  let inFlight: Promise<void> | null = null
  let inFlightIncludesThreads = false
  let actionPreflightInFlight = false
  const archivingKeys = new Set<string>()
  const taskArchiveInFlight = new Map<string, Promise<boolean>>()
  let focusedCompanionTaskKey = ''
  let stopActivityListener: (() => void) | null = null
  let stopClaudeQuotaLifecycleListener: (() => void) | null = null
  let stopNavigationResultListener: (() => void) | null = null
  let lastActivityGeneration = 0
  let activityDecisionDiagnostics = normalizeCodexActivityDecisionDiagnostics(null)
  let environmentInFlight: Promise<void> | null = null
  let environmentGeneration = 0
  let refreshGeneration = 0
  let runtimeGeneration = 0
  let runtimeActive = false
  let codexInventorySettled = false
  let claudeInventorySettled = false
  let companionKernelLease = 0
  let stopCompanionPackageListener: (() => void) | null = null
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

  function taskOperationsAllowed(): boolean {
    return Boolean(companionKernel)
      && options.platform.runtimeIdentityStatus?.status !== 'reload-required'
  }

  function rejectRuntimeMismatch(): false {
    options.setMessage(options.platform.runtimeIdentityStatus?.message || 'V4 任务 Kernel 未加载，需要重新接入或重载')
    options.notify()
    return false
  }

  function shouldRun(): boolean {
    // Global task shortcuts consume the same Controller-owned materialized
    // view as the Codex page and float. Keep that view subscribed and
    // reconciled for the whole enabled feature lifetime; changing tabs or
    // hiding a surface is not a cache/session boundary.
    return isFeatureEnabled()
  }

  function shouldRefreshSurfaceData(): boolean {
    const state = options.getAppState()
    return isFeatureEnabled() && (state.activeTab === 'codex' || state.codex.settings.floatEnabled)
  }

  function shouldMaintainTaskData(): boolean {
    return isFeatureEnabled() && codexState().settings.conversationInboxEnabled
  }

  function options_platform_claude() {
    return options.platform.claude || null
  }

  function claudeEnabled(): boolean {
    return isCompanionProviderEnabled(codexState().settings.providers, 'claude')
  }

  /** Claude task cards for the current lane state; empty while disabled. */
  function claudeCards(_now: number) {
    if (!claudeEnabled() || !claudeCodeSessions.length) return []
    const state = codexState()
    const dismissedByKey = new Map(state.receipts.map((receipt) => [receipt.key, receipt.dismissedActivityRecency || 0]))
    const aliases = Object.fromEntries(state.taskAliases.map((entry) => [entry.key, entry.alias]))
    const projectAliases = Object.fromEntries(state.projectAliases.map((entry) => [entry.key, entry.alias]))
    const localPinnedKeys = state.localPins.filter((pin) => pin.kind === 'task').map((pin) => pin.key)
    const hideResolved = <T>(
      project: (hiddenKeys: readonly string[]) => T[]
    ): T[] => {
      const open = project([])
      const hiddenKeys = (open as unknown as CodexTaskCard[])
        .filter((card) => card.revisionAt > 0 && (dismissedByKey.get(card.key) || 0) >= card.revisionAt)
        .map((card) => card.key)
      return hiddenKeys.length ? project(hiddenKeys) : open
    }
    const effectiveUnread = claudeCodeUnread?.filter((sessionId) => {
      const row = claudeCodeSessions.find((candidate) => candidate.sessionId === sessionId)
      const hint = claudeReadHints.get(sessionId)
      return !row || !hint || hint.completionEpoch !== claudeCodeCompletionEpoch(row)
    }) ?? null
    return hideResolved((hiddenKeys) => projectClaudeCodeTaskCards(claudeCodeSessions, {
      appUnread: effectiveUnread,
      aliases,
      projectAliases,
      hiddenKeys,
      localPinnedKeys
    }))
  }

  function publishTaskStatePackage(conversations: ConversationSnapshotV1, now = Date.now()) {
    // Claude cards are folded in here rather than inside the Codex projection,
    // so the Codex-only path stays byte-identical to the previous release.
    //
    // Callers legitimately re-publish from `taskState.conversations`, which is
    // already merged. Stripping first makes the merge a replace rather than an
    // append: without it a card that was appended once would keep its original
    // bucket forever, because appending skips keys that are already present.
    // Compatibility mode must not touch the snapshot at all: both aggregate
    // helpers recompute counters from their own arrays, and that recomputation
    // omits the hidden-unread term the canonical Codex counter includes. Running
    // them with nothing to merge would silently change a default-configuration
    // number.
    const cards = claudeCards(now)
    // Skip both aggregate helpers when there is genuinely nothing to do. They
    // recompute counters from their own arrays, and that recomputation omits the
    // hidden-unread term the canonical Codex counter includes — running them on
    // an untouched Codex snapshot would silently change a default-configuration
    // number. The foreign-card check is what makes this safe across a
    // provider being switched off: callers re-publish from an already merged
    // snapshot, which must still be stripped.
    const carriesForeign = conversations.all.some((task) => companionTaskProvider(task) !== 'codex')
    const merged = !cards.length && !carriesForeign
      ? conversations
      : mergeCompanionConversations(withoutCompanionProvider(conversations, 'claude'), cards)
    sourceTaskState = buildCodexTaskStatePackage(merged, {
      sourceRevision: taskStateSourceRevision,
      now,
      dynamicTaskWindowHours: codexState().settings.dynamicTaskWindowHours
    })
    // Metadata and the process package advance on independent lanes. Reapply
    // the latest canonical package after a metadata refresh without treating
    // the same package revision as a new publication.
    const projectionPackage = companionTaskPackage.complete
      ? companionTaskPackage
      : lastCompleteCompanionTaskPackage
    if (projectionPackage) {
      taskState = applyCompanionTaskPackageViews(sourceTaskState, projectionPackage)
    } else if (!companionKernel) {
      taskState = sourceTaskState
    }
    syncCompanionTaskAuthority()
    if (started && !disposed && !actionPreflightInFlight && shouldRun()) schedule()
  }

  /** Feature-lifetime subscriptions. Each authority refreshes only its lane. */
  function subscribeClaudeEvents() {
    if (disposed || !claudeEnabled()) {
      unsubscribeClaudeEvents()
      return
    }
    // Idempotent on purpose: start() and the runtime-resume path both call this,
    // and stacking watchers would fan one append out into several reads.
    const bridge = options.platform.claude
    if (!bridge) return
    const watchState = bridge.watchCodeState || bridge.watchEvents
    if (!claudeEventDispose && typeof watchState === 'function') {
      try {
        claudeEventDispose = watchState.call(bridge, () => handleClaudeStateEvent())
      } catch {
        claudeEventDispose = null
      }
    }
    if (!claudeCodeWatchDispose && typeof bridge.watchCodeSessions === 'function') {
      try {
        claudeCodeWatchDispose = bridge.watchCodeSessions((delta) => handleClaudeInventoryEvent(delta))
      } catch {
        claudeCodeWatchDispose = null
      }
    }
    if (!claudeUnreadWatchDispose && typeof bridge.watchCodeUnread === 'function') {
      try {
        claudeUnreadWatchDispose = bridge.watchCodeUnread(() => handleClaudeUnreadEvent())
      } catch {
        claudeUnreadWatchDispose = null
      }
    }
    // The process-lifetime Claude bridge owns native fs.watch/fs.watchFile
    // recovery. A Renderer timer is both redundant and unsafe here: uTools
    // throttles it while the Main WebContents is background-hidden.
  }

  function unsubscribeClaudeEvents() {
    claudeStatePending = false
    claudeInventoryPending = false
    claudeUnreadPending = false
    if (claudeCodeWatchDispose) {
      try { claudeCodeWatchDispose() } catch { /* teardown is best effort */ }
      claudeCodeWatchDispose = null
    }
    if (claudeUnreadWatchDispose) {
      try { claudeUnreadWatchDispose() } catch { /* teardown is best effort */ }
      claudeUnreadWatchDispose = null
    }
    if (!claudeEventDispose) return
    try { claudeEventDispose() } catch { /* teardown is best effort */ }
    claudeEventDispose = null
  }

  function sameClaudeRows(left: readonly ClaudeCodeObservation[], right: readonly ClaudeCodeObservation[]) {
    return JSON.stringify(left) === JSON.stringify(right)
  }

  function normalizeClaudeRows(snapshot: unknown): { rows: ClaudeCodeObservation[]; generation: number } | null {
    if (!snapshot || typeof snapshot !== 'object' || !Array.isArray((snapshot as { sessions?: unknown }).sessions)) return null
    if ((snapshot as { available?: unknown }).available === false) return null
    const rows: ClaudeCodeObservation[] = []
    for (const row of (snapshot as { sessions: unknown[] }).sessions) {
      const observation = normalizeClaudeCodeObservation(row)
      if (observation) rows.push(observation)
    }
    const declaredGeneration = Number((snapshot as { generation?: unknown; stateGeneration?: unknown }).generation
      ?? (snapshot as { stateGeneration?: unknown }).stateGeneration)
    const generation = Number.isInteger(declaredGeneration) && declaredGeneration > 0 ? declaredGeneration : 0
    return {
      rows: generation > 0 ? rows.map((row) => ({ ...row, stateGeneration: generation })) : rows,
      generation
    }
  }

  function patchClaudeState(
    current: ClaudeCodeObservation,
    incoming: ClaudeCodeObservation,
    allowExactTie = true
  ): ClaudeCodeObservation {
    const comparison = compareClaudeCodeStateVersion(incoming, current)
    if (comparison < 0 || comparison === 0 && !allowExactTie) return current
    return {
      ...current,
      statusCorrelation: incoming.statusCorrelation,
      stateSource: incoming.stateSource,
      stateCompatibility: incoming.stateCompatibility,
      stateGeneration: incoming.stateGeneration,
      phase: incoming.phase,
      phaseUpdatedAt: incoming.phaseUpdatedAt,
      turnStartedAt: incoming.turnStartedAt,
      hookActivityAt: incoming.hookActivityAt,
      waitingApprovalAt: incoming.waitingApprovalAt,
      waitingInputAt: incoming.waitingInputAt,
      lastStopAt: incoming.lastStopAt,
      lastSessionEndAt: incoming.lastSessionEndAt
    }
  }

  /** Inventory owns membership/metadata; its newer state evidence must not be
   * overwritten by an older Controller cache. Missing state evidence alone
   * inherits the previous state lane. */
  function mergeClaudeInventory(
    incoming: readonly ClaudeCodeObservation[],
    currentRows: readonly ClaudeCodeObservation[] = claudeCodeSessions
  ): ClaudeCodeObservation[] {
    const currentById = new Map(currentRows.map((row) => [row.sessionId, row] as const))
    return incoming.map((row) => {
      const current = currentById.get(row.sessionId)
      if (!current) return row
      const incomingHasStateEvidence = row.stateGeneration > 0
        || row.phaseUpdatedAt > 0
        || row.stateSource !== 'none'
        || row.statusCorrelation !== 'none'
      const incomingEvidenceAt = claudeCodeStateEvidenceAt(row)
      const currentEvidenceAt = claudeCodeStateEvidenceAt(current)
      // Inventory can carry a newer session.phase while its producer-local
      // generation is lower than the state-lane cache. Order cross-lane
      // evidence by causal event time; a delayed inventory read must still not
      // regress a newer state event. Only an inventory row with no state
      // evidence inherits the previous phase.
      const state = !incomingHasStateEvidence
        ? current
        : incomingEvidenceAt > 0 && currentEvidenceAt > incomingEvidenceAt
          ? current
          : row
      return {
        ...row,
        statusCorrelation: state.statusCorrelation,
        stateSource: state.stateSource,
        stateCompatibility: state.stateCompatibility,
        stateGeneration: state.stateGeneration,
        phase: state.phase,
        phaseUpdatedAt: state.phaseUpdatedAt,
        turnStartedAt: state.turnStartedAt,
        hookActivityAt: state.hookActivityAt,
        waitingApprovalAt: state.waitingApprovalAt,
        waitingInputAt: state.waitingInputAt,
        lastStopAt: state.lastStopAt,
        lastSessionEndAt: state.lastSessionEndAt
      }
    })
  }

  /** A state delta cannot add/drop inventory rows after the cache is warm. */
  function applyClaudeStateDelta(incoming: readonly ClaudeCodeObservation[]): ClaudeCodeObservation[] {
    const admitted = incoming.filter((row) => !claudeMembershipTombstones.has(companionTaskKey('claude', row.sessionId)))
    if (!claudeInventorySettled) return [...admitted]
    if (!claudeCodeSessions.length) return []
    const incomingById = new Map(admitted.map((row) => [row.sessionId, row] as const))
    return claudeCodeSessions.map((current) => {
      const row = incomingById.get(current.sessionId)
      return row ? patchClaudeState(current, row) : current
    })
  }

  function reconcileClaudeReadHints() {
    for (const [sessionId, hint] of claudeReadHints) {
      const row = claudeCodeSessions.find((candidate) => candidate.sessionId === sessionId)
      if (!row || claudeCodeCompletionEpoch(row) !== hint.completionEpoch) claudeReadHints.delete(sessionId)
    }
  }

  function degradeStuckClaudeActivity() {
    let changed = false
    claudeCodeSessions = claudeCodeSessions.map((row) => {
      if (!isCompanionLivePhase(row.phase)) return row
      changed = true
      return { ...row, phase: 'unknown', stateSource: 'none', statusCorrelation: 'none' }
    })
    if (changed) reconcileClaudeReadHints()
    return changed
  }

  function publishClaudeTaskChange(changed: boolean, laneToken: number) {
    if (!changed || disposed || laneToken !== runtimeGeneration) return
    if (lastClaudeTaskPublishRevision >= claudeControllerRevision) return
    publishTaskStatePackage(sourceTaskState.conversations)
    lastClaudeTaskPublishRevision = claudeControllerRevision
    options.notify()
  }

  function handleClaudeStateEvent() {
    if (disposed || !claudeEnabled()) return
    if (claudeStateInFlight) {
      claudeStatePending = true
      return
    }
    claudeStatePending = false
    const laneToken = runtimeGeneration
    void refreshClaudeState(Date.now()).then((result) => publishClaudeTaskChange(result.changed, laneToken))
      .catch(() => { claudeStatePending = false })
  }

  function applyClaudeMutationDelta(delta: CompanionTaskMutationDelta): boolean | null {
    if (delta?.version !== 1
      || delta.revision !== 'claude-task-mutation-delta-v1'
      || delta.provider !== 'claude'
      || !Number.isInteger(delta.generation)
      || delta.generation <= 0
      || !Array.isArray(delta.mutations)) return null
    if (delta.generation <= lastClaudeMutationGeneration) return false
    lastClaudeMutationGeneration = delta.generation
    lastClaudeInventoryGeneration = Math.max(lastClaudeInventoryGeneration, Number(delta.acceptedAt) || Date.now())
    let rows = claudeCodeSessions
    let changed = false
    let persistedChanged = false
    for (const mutation of delta.mutations) {
      if (mutation.mutation === 'remove' || mutation.mutation === 'archived') {
        const removed = rows.find((row) => companionTaskKey('claude', row.sessionId) === mutation.key)
        const sessionId = removed?.sessionId || ''
        const acceptedAt = Number(mutation.acceptedAt) || Number(delta.acceptedAt) || Date.now()
        claudeMembershipTombstones.set(mutation.key, acceptedAt)
        const next = rows.filter((row) => companionTaskKey('claude', row.sessionId) !== mutation.key)
        changed = changed || next.length !== rows.length
        rows = next
        if (sessionId && claudeReadHints.delete(sessionId)) persistedChanged = true
        if (sessionId && claudeCodeUnread) {
          const unread = claudeCodeUnread.filter((id) => id !== sessionId)
          changed = changed || unread.length !== claudeCodeUnread.length
          claudeCodeUnread = unread
        }
        const receipts = codexState().receipts.filter((receipt) => receipt.key !== mutation.key)
        if (receipts.length !== codexState().receipts.length) {
          codexState().receipts = receipts
          persistedChanged = true
        }
        continue
      }
      if (mutation.mutation !== 'upsert' || !mutation.session) continue
      const incoming = normalizeClaudeCodeObservation(mutation.session)
      if (!incoming || mutation.key !== companionTaskKey('claude', incoming.sessionId) || incoming.isArchived) continue
      claudeMembershipTombstones.delete(mutation.key)
      const next = mergeClaudeInventory([
        ...rows.filter((row) => row.sessionId !== incoming.sessionId),
        incoming
      ], rows)
      changed = changed || !sameClaudeRows(rows, next)
      rows = next
    }
    claudeInventorySettled = true
    if (!changed) {
      if (persistedChanged) options.save()
      syncCompanionTaskAuthority()
      return false
    }
    claudeCodeSessions = rows
    reconcileClaudeReadHints()
    claudeControllerRevision += 1
    publishTaskStatePackage(sourceTaskState.conversations, Number(delta.acceptedAt) || Date.now())
    lastClaudeTaskPublishRevision = claudeControllerRevision
    if (persistedChanged) options.save()
    options.notify()
    return true
  }

  function handleClaudeInventoryEvent(delta?: CompanionTaskMutationDelta) {
    if (disposed || !claudeEnabled()) return
    if (delta) {
      const applied = applyClaudeMutationDelta(delta)
      if (applied !== null) return
    }
    if (claudeInventoryInFlight) {
      claudeInventoryPending = true
      return
    }
    claudeInventoryPending = false
    const laneToken = runtimeGeneration
    void refreshClaudeInventory(Date.now()).then((changed) => publishClaudeTaskChange(changed, laneToken))
      .catch(() => { claudeInventoryPending = false })
  }

  function handleClaudeUnreadEvent() {
    if (disposed || !claudeEnabled()) return
    if (claudeUnreadInFlight) {
      claudeUnreadPending = true
      return
    }
    claudeUnreadPending = false
    const laneToken = runtimeGeneration
    void refreshClaudeUnread().then((result) => publishClaudeTaskChange(result.changed, laneToken))
      .catch(() => { claudeUnreadPending = false })
  }

  /** Applies an enablement change immediately instead of waiting for a Codex tick. */
  function syncClaudeEnablement() {
    if (!claudeEnabled()) {
      unsubscribeClaudeEvents()
      resetClaudeLane()
      publishTaskStatePackage(sourceTaskState.conversations)
      options.notify()
      return
    }
    subscribeClaudeEvents()
    void refreshClaude(Date.now()).then((changed) => {
      if (disposed || !changed) return
      publishTaskStatePackage(sourceTaskState.conversations)
      options.notify()
    }).catch(() => { /* claude lane degrades on its own */ })
  }

  function resetClaudeLane() {
    const carriedMaterial = claudeCodeSessions.length > 0 || claudeQuota.windows.length > 0 || claudeCodeUnread !== null
    claudeEnvironment = emptyClaudeEnvironment()
    claudeCodeSessions = []
    claudeCodeUnread = null
    claudeQuota = emptyClaudeQuota()
    claudeQuotaAccess = emptyClaudeQuotaAccess()
    claudeAppQuotaKeys.clear()
    claudeReadHints.clear()
    for (const timer of claudeUnreadRecheckTimers) clearTimeout(timer)
    claudeUnreadRecheckTimers.clear()
    lastClaudeUnreadVersion = 0
    lastClaudeUnreadGeneration = 0
    lastClaudeUnreadReadAt = 0
    lastClaudeStateGeneration = 0
    lastClaudeInventoryGeneration = 0
    lastClaudeMutationGeneration = 0
    claudeMembershipTombstones.clear()
    claudeStateFailureCount = 0
    lastClaudeReadAt = 0
    lastClaudeQuotaReadAt = 0
    claudeInventorySettled = false
    if (carriedMaterial) claudeControllerRevision += 1
  }

  async function refreshClaudeEnvironment() {
    const bridge = options.platform.claude
    if (!bridge) return false
    const previous = JSON.stringify(claudeEnvironment)
    try {
      claudeEnvironment = await bridge.inspect()
    } catch {
      claudeEnvironment = emptyClaudeEnvironment()
    }
    const changed = previous !== JSON.stringify(claudeEnvironment)
    if (changed) claudeControllerRevision += 1
    return changed
  }

  function refreshClaudeInventory(now = Date.now()): Promise<boolean> {
    const bridge = options.platform.claude
    const readCodeSnapshot = bridge?.readCodeSnapshot
    if (claudeInventoryInFlight) return claudeInventoryInFlight
    if (!bridge || typeof readCodeSnapshot !== 'function') {
      claudeInventorySettled = true
      syncCompanionTaskKernel()
      return Promise.resolve(false)
    }
    const laneToken = runtimeGeneration
    const operation = (async () => {
      try {
        const snapshot = await readCodeSnapshot({ now })
        const normalized = normalizeClaudeRows(snapshot)
        if (disposed || laneToken !== runtimeGeneration || normalized === null) return false
        lastClaudeInventoryGeneration = Math.max(lastClaudeInventoryGeneration, Number(snapshot.readAt) || now)
        const rows = mergeClaudeInventory(normalized.rows.filter((row) => !claudeMembershipTombstones.has(companionTaskKey('claude', row.sessionId))))
        const changed = !sameClaudeRows(claudeCodeSessions, rows)
        if (changed) claudeCodeSessions = rows
        if (changed) claudeControllerRevision += 1
        reconcileClaudeReadHints()
        subscribeClaudeEvents()
        return changed
      } catch {
        // Inventory failure retains the last valid feature-lifetime materialized
        // view. Unlike unread, absence of a fresh scan is not proof of deletion.
        return false
      } finally {
        if (!disposed && laneToken === runtimeGeneration) {
          claudeInventorySettled = true
          syncCompanionTaskKernel()
        }
      }
    })().finally(() => {
      if (claudeInventoryInFlight === operation) claudeInventoryInFlight = null
      if (claudeInventoryPending && !disposed) queueMicrotask(() => handleClaudeInventoryEvent())
    })
    claudeInventoryInFlight = operation
    return operation
  }

  function refreshClaudeState(now = Date.now()): Promise<ClaudeLaneRefreshResult> {
    const bridge = options.platform.claude
    if (!bridge) return Promise.resolve({ changed: false, available: false })
    if (claudeStateInFlight) return claudeStateInFlight
    const laneToken = runtimeGeneration
    const inFlight = (async (): Promise<ClaudeLaneRefreshResult> => {
      try {
        const snapshot = typeof bridge.readCodeStateSnapshot === 'function'
          ? await bridge.readCodeStateSnapshot({ now })
          : typeof bridge.readCodeSnapshot === 'function'
            ? await bridge.readCodeSnapshot({ now })
            : null
        const normalized = normalizeClaudeRows(snapshot)
        if (disposed || laneToken !== runtimeGeneration) return { changed: false, available: false }
        if (normalized === null) {
          claudeStateFailureCount += 1
          const changed = claudeStateFailureCount >= 2 ? degradeStuckClaudeActivity() : false
          if (changed) claudeControllerRevision += 1
          return { changed, available: false }
        }
        if (normalized.generation > 0 && lastClaudeStateGeneration > 0 && normalized.generation < lastClaudeStateGeneration) {
          return { changed: false, available: true }
        }
        if (normalized.generation > 0) lastClaudeStateGeneration = normalized.generation
        claudeStateFailureCount = 0
        const rows = applyClaudeStateDelta(normalized.rows)
        const changed = !sameClaudeRows(claudeCodeSessions, rows)
        if (changed) claudeCodeSessions = rows
        if (changed) claudeControllerRevision += 1
        reconcileClaudeReadHints()
        return { changed, available: true }
      } catch {
        claudeStateFailureCount += 1
        const changed = claudeStateFailureCount >= 2 ? degradeStuckClaudeActivity() : false
        if (changed) claudeControllerRevision += 1
        return { changed, available: false }
      } finally {
        claudeStateInFlight = null
        if (claudeStatePending && !disposed) queueMicrotask(() => handleClaudeStateEvent())
      }
    })()
    claudeStateInFlight = inFlight
    return inFlight
  }

  function refreshClaudeUnread(): Promise<ClaudeLaneRefreshResult> {
    const bridge = options.platform.claude
    if (!bridge) return Promise.resolve({ changed: false, available: false })
    if (claudeUnreadInFlight) return claudeUnreadInFlight
    const laneToken = runtimeGeneration
    const inFlight = (async (): Promise<ClaudeLaneRefreshResult> => {
      try {
        const snapshot = typeof bridge.readCodeUnread === 'function' ? await bridge.readCodeUnread() : null
        const observation: ClaudeCodeUnreadObservation | null = normalizeClaudeCodeUnread(snapshot)
        if (disposed || laneToken !== runtimeGeneration) return { changed: false, available: false }
        if (!observation) {
          const changed = claudeCodeUnread !== null
          claudeCodeUnread = null
          if (changed) claudeControllerRevision += 1
          return { changed, available: false }
        }
        if (lastClaudeUnreadVersion === 2 && observation.version === 1) return { changed: false, available: true }
        if (observation.version === 2 && lastClaudeUnreadVersion === 2) {
          if (observation.generation < lastClaudeUnreadGeneration) return { changed: false, available: true }
          if (observation.generation === lastClaudeUnreadGeneration && observation.readAt < lastClaudeUnreadReadAt) {
            return { changed: false, available: true }
          }
        }
        lastClaudeUnreadVersion = observation.version
        lastClaudeUnreadGeneration = observation.generation
        lastClaudeUnreadReadAt = observation.readAt
        const next = [...observation.ids]
        const changed = JSON.stringify(claudeCodeUnread) !== JSON.stringify(next)
        claudeCodeUnread = next
        if (changed) claudeControllerRevision += 1
        for (const [sessionId, hint] of claudeReadHints) {
          if (!next.includes(sessionId) && !hint.nativeConfirmed) claudeReadHints.set(sessionId, { ...hint, nativeConfirmed: true })
        }
        return { changed, available: true }
      } catch {
        const changed = claudeCodeUnread !== null
        claudeCodeUnread = null
        if (changed) claudeControllerRevision += 1
        return { changed, available: false }
      } finally {
        claudeUnreadInFlight = null
        if (claudeUnreadPending && !disposed) queueMicrotask(() => handleClaudeUnreadEvent())
      }
    })()
    claudeUnreadInFlight = inFlight
    return inFlight
  }

  async function refreshClaudeQuota(now = Date.now()) {
    const bridge = options.platform.claude
    if (!bridge || claudeQuotaInFlight) return false
    claudeQuotaInFlight = true
    const laneToken = runtimeGeneration
    const previous = JSON.stringify({ quota: claudeQuota, access: claudeQuotaAccess })
    try {
      const snapshot = await Promise.resolve(bridge.readSnapshot({ now })).catch(() => null)
      if (disposed || laneToken !== runtimeGeneration) return false
      if (snapshot?.quota) {
        const primary = normalizeClaudeQuota(snapshot.quota.rateLimits, {
          updatedAt: snapshot.quota.updatedAt,
          now
        })
        if (!codexState().settings.claudeAppQuotaAccess) claudeAppQuotaKeys.clear()
        const supplement = claudeAppQuotaKeys.size
          ? { ...primary, windows: primary.windows.filter((window) => !claudeAppQuotaKeys.has(window.key)) }
          : primary
        claudeQuota = mergeClaudeQuotaWindows(claudeQuota, supplement, now)
      } else {
        claudeQuota = staleClaudeQuota(claudeQuota, now)
      }
      if (typeof bridge.readPlanUsage === 'function') {
        try {
          const sample = await bridge.readPlanUsage()
          if (!disposed && laneToken === runtimeGeneration && sample) {
            const appOwned = new Map(claudeQuota.windows
              .filter((window) => claudeAppQuotaKeys.has(window.key))
              .map((window) => [window.key, window] as const))
            const planPatched = mergeClaudePlanUsage(claudeQuota, sample, now)
            if (!appOwned.size) claudeQuota = planPatched
            else {
              const windows = planPatched.windows.map((window) => appOwned.get(window.key) || window)
              claudeQuota = {
                ...planPatched,
                windows,
                short: windows.find((window) => window.kind === 'short' && !window.scope) || null,
                weekly: windows.find((window) => window.kind === 'weekly' && !window.scope) || null,
                source: claudeQuota.source
              }
            }
          }
        } catch { /* independent best-effort freshness */ }
      }
      const needsSupplement = quotaNeedsClaudeSupplement(claudeQuota, now)
      if (codexState().settings.claudeAppQuotaAccess && typeof bridge.readQuotaFallback === 'function') {
        try {
          const fallback = await bridge.readQuotaFallback({
            enabled: codexState().settings.claudeAppQuotaAccess === true,
            coldStart: claudeQuota.windows.length === 0,
            supplement: needsSupplement,
            now,
            minStaleMs: Number.isFinite(quotaDelay(codexState().settings))
              ? Math.max(quotaDelay(codexState().settings) * 4, 10 * 60 * 1000)
              : 10 * 60 * 1000,
            refreshIntervalMs: Number.isFinite(quotaDelay(codexState().settings))
              ? quotaDelay(codexState().settings)
              : 0
          })
          if (!disposed && laneToken === runtimeGeneration && fallback) {
            const appQuota = normalizeClaudeQuota(fallback.rateLimits, {
              updatedAt: fallback.updatedAt,
              source: 'usage-api',
              now
            })
            const incomingKeys = new Set(appQuota.windows.map((window) => window.key))
            const preservedWindows = claudeQuota.windows.filter((window) => !incomingKeys.has(window.key))
            const preserved: ClaudeQuotaSnapshot = {
              ...claudeQuota,
              windows: preservedWindows,
              short: preservedWindows.find((window) => window.kind === 'short' && !window.scope) || null,
              weekly: preservedWindows.find((window) => window.kind === 'weekly' && !window.scope) || null
            }
            claudeQuota = mergeClaudeQuotaWindows(preserved, appQuota, now)
            claudeAppQuotaKeys.clear()
            for (const key of incomingKeys) claudeAppQuotaKeys.add(key)
          }
          if (!disposed && laneToken === runtimeGeneration) {
            const access = normalizeClaudeQuotaAccess(bridge.diagnostics().quotaAccess)
            claudeQuotaAccess = access
            if (!fallback && access.lastAttemptAt >= now && access.status !== 'idle' && access.status !== 'ok') {
              claudeQuota = staleClaudeQuota(claudeQuota, now)
            }
          }
        } catch { /* bounded fallback never affects state publication */ }
      } else {
        claudeQuotaAccess = emptyClaudeQuotaAccess()
      }
      const changed = previous !== JSON.stringify({ quota: claudeQuota, access: claudeQuotaAccess })
      if (changed) claudeControllerRevision += 1
      return changed
    } finally {
      claudeQuotaInFlight = false
    }
  }

  function kickClaudeQuota(now = Date.now()) {
    if (claudeQuotaInFlight) return
    lastClaudeQuotaReadAt = now
    const laneToken = runtimeGeneration
    void refreshClaudeQuota(now).then((changed) => {
      if (changed && !disposed && laneToken === runtimeGeneration) options.notify()
    }).catch(() => undefined)
  }

  function subscribeClaudeQuotaLifecycle() {
    if (stopClaudeQuotaLifecycleListener) return
    const target = globalThis as typeof globalThis & {
      addEventListener?: (type: string, listener: EventListener) => void
      removeEventListener?: (type: string, listener: EventListener) => void
      document?: Document
    }
    if (typeof target.addEventListener !== 'function' || typeof target.removeEventListener !== 'function') return
    const requestRefresh = () => {
      if (disposed || !started || !claudeEnabled()) return
      kickClaudeQuota(Date.now())
    }
    const refreshOnResume: EventListener = () => requestRefresh()
    const refreshWhenVisible: EventListener = () => {
      if (target.document?.visibilityState === 'hidden') return
      requestRefresh()
    }
    target.addEventListener('online', refreshOnResume)
    target.addEventListener('focus', refreshOnResume)
    target.addEventListener('pageshow', refreshOnResume)
    target.document?.addEventListener('visibilitychange', refreshWhenVisible)
    stopClaudeQuotaLifecycleListener = () => {
      target.removeEventListener?.('online', refreshOnResume)
      target.removeEventListener?.('focus', refreshOnResume)
      target.removeEventListener?.('pageshow', refreshOnResume)
      target.document?.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }

  function kickClaudeAppPresence() {
    const bridge = options.platform.claude
    if (!bridge || typeof bridge.readAppPresence !== 'function') return
    void Promise.resolve(bridge.readAppPresence()).catch(() => undefined)
  }

  /** Cold/reconnect reconciliation. Quota starts in parallel and is never awaited. */
  async function refreshClaude(now = Date.now(), includeQuota = true) {
    if (!claudeEnabled()) {
      if (claudeCodeSessions.length || claudeQuota.status !== 'idle') resetClaudeLane()
      return false
    }
    const bridge = options.platform.claude
    lastClaudeReadAt = now
    if (!bridge) {
      claudeEnvironment = emptyClaudeEnvironment()
      claudeCodeSessions = []
      claudeCodeUnread = null
      claudeQuota = staleClaudeQuota(claudeQuota)
      claudeInventorySettled = true
      syncCompanionTaskKernel()
      return false
    }
    subscribeClaudeEvents()
    kickClaudeAppPresence()
    if (includeQuota) kickClaudeQuota(now)
    const [environmentChanged, inventoryChanged, unreadResult] = await Promise.all([
      refreshClaudeEnvironment(),
      refreshClaudeInventory(now),
      refreshClaudeUnread()
    ])
    return environmentChanged || inventoryChanged || unreadResult.changed
  }

  function clearTimer() {
    if (timer) clearTimeout(timer)
    timer = null
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
    publishTaskStatePackage({ ...sourceTaskState.conversations, ...patch })
  }

  function resetConversationProjection(next = rawConversations) {
    activityExitBaselines.clear()
    rawConversations = next
    publishTaskStatePackage(next)
  }

  function resetCodexTaskDerivedState() {
    clearActionRunnerProjectCache()
    codexInventorySettled = false
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
    if (disposed || !shouldRun() || !shouldMaintainTaskData() || (delta?.version !== 1 && delta?.version !== 2)) return
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
              planReady: liveEntry?.planReady === true,
              planLifecycleRevision: Number.isFinite(liveEntry?.planLifecycleRevision)
                ? Math.max(0, Math.trunc(liveEntry!.planLifecycleRevision!))
                : 0,
              turnMode: liveEntry?.turnMode === 'plan' || liveEntry?.turnMode === 'default'
                ? liveEntry.turnMode
                : 'unknown',
              idleConfirmed: liveEntry?.idleConfirmed === true,
              ...(liveEntry?.statusAuthority ? { statusAuthority: liveEntry.statusAuthority } : {}),
              ...(liveEntry?.activityEvidence ? { activityEvidence: liveEntry.activityEvidence } : {}),
              ...(Number.isInteger(liveEntry?.activityRevision) ? { activityRevision: liveEntry!.activityRevision } : {}),
              ...(Number.isFinite(liveEntry?.waitingSince) && liveEntry!.waitingSince! > 0 ? { waitingSince: liveEntry!.waitingSince } : {}),
              ...(typeof liveEntry?.hasUnreadTurn === 'boolean' ? { hasUnreadTurn: liveEntry.hasUnreadTurn } : {}),
              ...(liveEntry?.unreadAuthority ? { unreadAuthority: liveEntry.unreadAuthority } : {})
            }
        : { ...thread, status: entry.status || thread.status, activeFlags, planImplementationOnly: false, statusAuthority: 'connector' as const }) as CodexHostThread
      if (delta.version === 2 && !readStateOnly && liveEntry?.status) {
        if (liveEntry.status !== 'active'
          || !activeFlags.some((flag) => flag === 'waitingOnUserInput' || flag === 'waitingOnApproval')
          || !Number.isFinite(liveEntry.waitingSince)
          || liveEntry.waitingSince! <= 0) delete next.waitingSince
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
        const previousTurnStartedAt = Number.isFinite(thread.lastTurnStartedAt) ? thread.lastTurnStartedAt! : 0
        const incomingTurnStartedAt = liveEntry!.lastTurnStartedAt!
        const incomingOutcomeChanged = liveEntry!.lastTurnStatus !== thread.lastTurnStatus
          || incomingTurnStartedAt !== previousTurnStartedAt
        next.lastTurnStatus = liveEntry!.lastTurnStatus!
        next.lastTurnStartedAt = incomingTurnStartedAt
        if (liveEntry?.lastTurnEvidence) next.lastTurnEvidence = liveEntry.lastTurnEvidence
        else if (incomingOutcomeChanged) delete next.lastTurnEvidence
        if (liveEntry!.lastTurnStatus === 'completed' && Number.isFinite(liveEntry!.lastTurnCompletedAt) && liveEntry!.lastTurnCompletedAt! > 0) {
          next.lastTurnCompletedAt = liveEntry!.lastTurnCompletedAt!
        } else {
          delete next.lastTurnCompletedAt
        }
      }
      if (delta.version === 2 && !readStateOnly && liveEntry?.status) {
        const explicitActiveSequence = Number.isInteger(liveEntry.activeEvidenceSequence)
          && liveEntry.activeEvidenceSequence! > 0
          ? liveEntry.activeEvidenceSequence!
          : 0
        const explicitTerminalSequence = Number.isInteger(liveEntry.terminalEvidenceSequence)
          && liveEntry.terminalEvidenceSequence! > 0
          ? liveEntry.terminalEvidenceSequence!
          : 0
        const confirmedTerminal = isCodexConfirmedTerminalEvidence(liveEntry.lastTurnEvidence)
          && liveEntry.lastTurnStatus !== 'inProgress'
        const exactLiveStart = !confirmedTerminal
          && next.status === 'active'
          && ['desktop-live', 'app-server-live'].includes(next.statusAuthority || '')
          && (activeFlags.some((flag) => flag === 'waitingOnUserInput' || flag === 'waitingOnApproval')
            || liveEntry.activityEvidence === 'activity-event' && liveEntry.lastTurnStatus !== 'completed'
            || liveEntry.lastTurnEvidence === 'turn-started')

        if (explicitActiveSequence) next.activeEvidenceSequence = explicitActiveSequence
        else if (exactLiveStart) next.activeEvidenceSequence = delta.generation
        else if (confirmedTerminal && !next.activeEvidenceSequence) {
          next.activeEvidenceSequence = Math.max(1, delta.generation - 1)
        }

        if (explicitTerminalSequence) next.terminalEvidenceSequence = explicitTerminalSequence
        else if (confirmedTerminal) next.terminalEvidenceSequence = delta.generation
        else if (exactLiveStart) delete next.terminalEvidenceSequence
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

  function schedule() {
    clearTimer()
    if (!started || disposed || !shouldRun()) return
    const settings = codexState().settings
    const now = Date.now()
    const quotaWait = shouldRefreshSurfaceData() && Number.isFinite(quotaDelay(settings)) ? Math.max(1000, lastQuotaReadAt + quotaDelay(settings) - now) : Number.POSITIVE_INFINITY
    const nextTaskTransitionAt = taskState.dynamic.nextTransitionAt
    const taskTransitionWait = nextTaskTransitionAt === null
      ? Number.POSITIVE_INFINITY
      : Math.max(1, nextTaskTransitionAt - now)
    const claudeQuotaWait = claudeEnabled() && !claudeQuotaInFlight
      ? claudeQuotaScheduleDelay(settings, lastClaudeQuotaReadAt, claudeQuota.windows, now)
      : Number.POSITIVE_INFINITY
    const delay = Math.min(
      quotaWait,
      taskTransitionWait,
      claudeQuotaWait
    )
    if (!Number.isFinite(delay)) return
    timer = setTimeout(() => {
      const wokeAt = Date.now()
      if (taskState.dynamic.nextTransitionAt !== null && taskState.dynamic.nextTransitionAt <= wokeAt) {
        publishTaskStatePackage(sourceTaskState.conversations, wokeAt)
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
    taskInventoryPublishSequence += 1
    publishConversationProjection({ receivedAt, advanceScan: input.advanceScan, status: input.status })
    reconcileActionRunnerProjectCache()
    if (runnerCatalog.generatedAt > 0) {
      const selectedLaneId = runnerPersistedSelectedLaneId || runnerCatalog.selectedLaneId || ''
      composeActionRunnerCatalog(selectedLaneId)
      // Once Runner has been initialized, keep its project shards aligned with
      // verified inventory in the background. The loader is per-project
      // single-flight, so unchanged projects stay hot and only additions or
      // alias revisions cross the Host boundary.
      queueMicrotask(() => {
        if (!disposed && runnerCatalog.generatedAt > 0) {
          void refreshActionRunnerCatalog(selectedLaneId, true, false).catch(() => undefined)
        }
      })
    }
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

  async function refresh(input: { force?: boolean; forceQuota?: boolean; forceTasks?: boolean; actionPreflight?: boolean } = {}) {
    const actionPreflight = input.actionPreflight === true
    const refreshAllowed = () => actionPreflight ? isFeatureEnabled() : shouldRun()
    if (disposed || !refreshAllowed()) return
    if (inFlight) {
      const existingIncludesThreads = inFlightIncludesThreads
      const inventorySequenceBeforeWait = taskInventoryPublishSequence
      await inFlight
      if (actionPreflight
        && (!existingIncludesThreads || taskInventoryPublishSequence === inventorySequenceBeforeWait)
        && !disposed
        && refreshAllowed()) return refresh(input)
      return
    }
    const runtimeToken = runtimeGeneration
    const now = Date.now()
    const settings = codexState().settings
    const includeQuota = !actionPreflight && shouldRefreshSurfaceData() && (input.force === true || input.forceQuota === true || quota.updatedAt <= 0 || (Number.isFinite(quotaDelay(settings)) && now - lastQuotaReadAt >= quotaDelay(settings)))
    const includeThreads = actionPreflight || settings.conversationInboxEnabled
      && (input.force === true || input.forceTasks === true || rawConversations.updatedAt <= 0)
    const includeConfig = includeQuota && !actionPreflight
    // Claude membership/state/unread are push-owned after cold admission. A full
    // read is reserved for cold start, reconnect and an explicit gap recovery.
    const includeClaude = !actionPreflight && claudeEnabled()
      && (input.force === true || lastClaudeReadAt <= 0)
    const includeClaudeQuota = !actionPreflight && claudeEnabled()
      && (input.force === true || input.forceQuota === true || lastClaudeQuotaReadAt <= 0
        || (Number.isFinite(quotaDelay(settings)) && now - lastClaudeQuotaReadAt >= quotaDelay(settings))
        || claudeQuota.windows.some((window) => window.resetAt !== null
          && now >= window.resetAt + 1000
          && lastClaudeQuotaReadAt < window.resetAt + 1000))
    if (includeClaude) {
      void refreshClaude(now, false).then((changed) => {
        if (disposed || !changed || runtimeGeneration !== runtimeToken) return
        publishTaskStatePackage(sourceTaskState.conversations)
        options.notify()
      }).catch(() => { /* claude lane degrades on its own */ })
    }
    if (includeClaudeQuota) kickClaudeQuota(now)
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
      if (!actionPreflight) await inspectEnvironment(input.force === true)
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
            const threads = (host.threads as CodexHostThread[]).map((thread) => ({
              ...thread,
              ...(thread.firstPromptAt ? {} : firstPromptByKey.has(thread.key) ? { firstPromptAt: firstPromptByKey.get(thread.key) } : {})
            })).map((thread) => {
              const previous = previousByKey.get(thread.key)
              let sequenced = thread
              if (hostActivityGeneration > 0) {
                const exactTerminal = isCodexConfirmedTerminalEvidence(thread.lastTurnEvidence)
                  && thread.lastTurnStatus !== 'inProgress'
                const exactLiveStart = !exactTerminal
                  && hasCodexLiveActivityEvidence(thread)
                  && (thread.lastTurnStatus !== 'completed' || thread.lastTurnEvidence === 'turn-started')
                if (exactLiveStart && !thread.activeEvidenceSequence) {
                  sequenced = { ...sequenced, activeEvidenceSequence: hostActivityGeneration }
                }
                if (exactTerminal && !thread.terminalEvidenceSequence) {
                  sequenced = {
                    ...sequenced,
                    activeEvidenceSequence: thread.activeEvidenceSequence
                      || previous?.activeEvidenceSequence
                      || Math.max(1, hostActivityGeneration - 1),
                    terminalEvidenceSequence: hostActivityGeneration
                  }
                }
              }
              const preserved = preserveLatestTurnEvidence(sequenced, previous)
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
      if (includeThreads && !disposed && runtimeToken === runtimeGeneration && generation === refreshGeneration) {
        codexInventorySettled = true
        syncCompanionTaskKernel()
      }
      if (actionPreflight) actionPreflightInFlight = false
      if (inFlight !== operation) return
      refreshing = false
      inFlight = null
      inFlightIncludesThreads = false
      if (!disposed) options.notify()
      if (disposed || actionPreflight || !shouldRun() || runtimeToken !== runtimeGeneration) return
      if (structuralRefreshPending) armStructuralRefresh()
      else schedule()
    })
    inFlightIncludesThreads = includeThreads
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
      inFlightIncludesThreads = false
      refreshing = false
      clearTimer()
      resetStructuralRefresh()
      resetCodexDerivedRuntimeState()
      options.platform.codex.close({ preserveDesktop: featureEnabled })
      // The bridge's close() drops its watcher, so the disposer we hold is
      // already spent; keeping it would make the next subscribe a no-op.
      unsubscribeClaudeEvents()
      try { options.platform.claude?.close() } catch { /* provider teardown is best effort */ }
      return
    }
    const resuming = !runtimeActive
    if (resuming) {
      runtimeActive = true
      subscribeClaudeEvents()
      runtimeGeneration += 1
      refreshGeneration += 1
      inFlight = null
      inFlightIncludesThreads = false
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
    const codexEnablementChanged = current.providers.codex !== next.providers.codex
    const claudeEnablementChanged = current.providers.claude !== next.providers.claude
    const providerEnablementChanged = codexEnablementChanged || claudeEnablementChanged
    if (codexEnablementChanged) codexInventorySettled = next.providers.codex !== true
    if (claudeEnablementChanged) claudeInventorySettled = next.providers.claude !== true
    const inboxChanged = current.conversationInboxEnabled !== next.conversationInboxEnabled
    if (inboxChanged) {
      runtimeGeneration += 1
      refreshGeneration += 1
      inFlight = null
      inFlightIncludesThreads = false
      refreshing = false
      clearTimer()
      resetStructuralRefresh()
      resetCodexTaskDerivedState()
    } else if (current.timeWindowDays !== next.timeWindowDays && lastThreads.length) {
      publishConversationProjection({ receivedAt: Date.now(), advanceScan: false, status: rawConversations.status })
    } else if (current.dynamicTaskWindowHours !== next.dynamicTaskWindowHours) {
      publishTaskStatePackage(rawConversations)
    }
    options.save()
    options.notify()
    const taskAuthorityChanged = inboxChanged || providerEnablementChanged
    const quotaPolicyChanged = current.quotaRefreshSeconds !== next.quotaRefreshSeconds
      || current.claudeAppQuotaAccess !== next.claudeAppQuotaAccess
    if (providerEnablementChanged) beginCompanionNavigation()
    syncActivation(taskAuthorityChanged)
    if (quotaPolicyChanged && shouldRun()) void refresh({ forceQuota: true })
    // A provider toggle must take effect now: disabling should clear the lane
    // immediately rather than leaving stale cards until the next Codex tick.
    if (claudeEnablementChanged) syncClaudeEnablement()
    return true
  }

  async function applyLaunchPathChange(
    change: (() => Promise<CodexEnvironmentSnapshotV1>) | undefined,
    messages: { unsupported: string; success: string; failure: string }
  ) {
    if (!change) {
      options.setMessage(messages.unsupported)
      options.notify()
      return false
    }
    try {
      environment = normalizeCodexEnvironment(await change())
      options.setMessage(messages.success)
      options.notify()
      return true
    } catch (error) {
      options.setMessage(error instanceof Error ? error.message : messages.failure)
      options.notify()
      return false
    }
  }

  async function setLaunchPath(pathValue: string) {
    const path = pathValue.trim()
    if (!path) {
      options.setMessage('请输入 Codex CLI 可执行文件的完整路径')
      options.notify()
      return false
    }
    const change = options.platform.codex.setLaunchPath
    return applyLaunchPathChange(
      typeof change === 'function' ? () => change(path) : undefined,
      {
        unsupported: '当前宿主不支持手动设置 Codex CLI 路径，请更新插件 preload 后重试',
        success: '已保存手动 Codex CLI 位置；不会中断当前 App Server，下次启动将使用该位置',
        failure: '手动 Codex CLI 位置不可用'
      }
    )
  }

  function clearLaunchPath() {
    const change = options.platform.codex.clearLaunchPath
    return applyLaunchPathChange(
      typeof change === 'function' ? () => change() : undefined,
      {
        unsupported: '当前宿主不支持恢复 Codex CLI 自动发现，请更新插件 preload 后重试',
        success: '已恢复 Codex CLI 自动发现；不会中断当前 App Server，下次启动将使用自动发现',
        failure: '无法恢复 Codex CLI 自动发现'
      }
    )
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

  function syncCompanionTaskAuthority(): boolean {
    return syncCompanionTaskKernel()
  }

  function setFocusedTask(key: string, revisionAt?: number) {
    const task = allTasks().find((candidate) => candidate.key === key)
    const nextKey = task ? task.key : ''
    if (nextKey === focusedCompanionTaskKey) return false
    focusedCompanionTaskKey = nextKey
    syncCompanionTaskKernel()
    return true
  }

  function hasCompleteTaskInventory() {
    const providers = codexState().settings.providers
    return (providers.codex !== true || codexInventorySettled)
      && (providers.claude !== true || claudeInventorySettled)
  }

  function consumeNavigationResults() {
    if (disposed || !hasCompleteTaskInventory()) return
    const events = companionKernel?.takeResults && companionKernelLease
      ? companionKernel.takeResults({ lease: companionKernelLease })
      : []
    for (const event of events) applyNavigationResult(event)
  }

  function applyNavigationResult(event: CompanionNavigationResultEvent) {
    if (event.provider !== 'claude' || !['opened', 'dispatched'].includes(event.outcome)) return
    const task = allTasks().find((candidate) => candidate.key === event.key && candidate.actionAlias)
    if (!task?.actionAlias) return
    const row = currentClaudeSyncTarget(task.key, task.actionAlias)
    if (!row) return
    applyClaudeOpenSuccess(task.key, task.actionAlias, row, event.at)
  }

  function applyClaudeOpenSuccess(key: string, actionAlias: string, row: ClaudeCodeObservation, acknowledgedAt = Date.now()) {
    if (disposed) return
    const completionEpoch = claudeCodeCompletionEpoch(row)
    if (completionEpoch) {
      claudeReadHints.set(row.sessionId, { completionEpoch, acknowledgedAt, nativeConfirmed: false })
      claudeControllerRevision += 1
      publishTaskStatePackage(sourceTaskState.conversations)
      options.notify()
    }
    void syncClaudeTask(key, actionAlias, { silent: true }).catch(() => undefined)
    scheduleClaudeUnreadRechecks()
  }

  function beginCompanionNavigation() {
    if (!companionKernel) return
    const receipt = companionKernel.attach({
      enabled: isFeatureEnabled() && shouldMaintainTaskData(),
      providers: codexState().settings.providers,
      dynamicTaskWindowHours: codexState().settings.dynamicTaskWindowHours
    })
    companionKernelLease = receipt.lease
    acceptCompanionTaskPackage(receipt.package)
    if (!stopCompanionPackageListener && typeof companionKernel.subscribe === 'function') {
      stopCompanionPackageListener = companionKernel.subscribe(companionTaskPackage.packageRevision, (value) => {
        const changed = acceptCompanionTaskPackage(value)
        if (changed && started && !disposed) options.notify()
      })
    } else if (!stopCompanionPackageListener && typeof companionKernel.onPackage === 'function') {
      stopCompanionPackageListener = companionKernel.onPackage((value) => {
        const changed = acceptCompanionTaskPackage(value)
        if (changed && started && !disposed) options.notify()
      })
    }
    if (!stopNavigationResultListener && typeof companionKernel.onResult === 'function') {
      stopNavigationResultListener = companionKernel.onResult(() => consumeNavigationResults())
    }
    syncCompanionTaskKernel()
  }

  function acceptCompanionTaskPackage(value: CompanionTaskPackageV4 | null | undefined): boolean {
    if (!value || value.schema !== COMPANION_TASK_PACKAGE_REVISION || value.kernelRevision !== COMPANION_TASK_KERNEL_REVISION) return false
    if (value.packageRevision <= companionTaskPackage.packageRevision) return false
    const knownKeys = new Set(sourceTaskState.conversations.all.map((task) => task.key))
    const missingCodexMetadata = value.complete
      && value.tasks.some((task) => task.provider === 'codex' && !knownKeys.has(task.key))
    companionTaskPackage = value
    if (value.complete) {
      lastCompleteCompanionTaskPackage = value
      const pausedKeys = new Set(value.views.pausedKeys)
      if (pausedKeys.size) {
        const receipts = codexState().receipts.filter((receipt) => !pausedKeys.has(receipt.key))
        if (receipts.length !== codexState().receipts.length) {
          codexState().receipts = receipts
          options.save()
        }
      }
      taskState = applyCompanionTaskPackageViews(sourceTaskState, value)
    }
    if (missingCodexMetadata && started && !disposed) scheduleStructuralRefresh('urgent')
    return true
  }

  function syncCompanionTaskKernel(): boolean {
    if (!companionKernel || !companionKernelLease || disposed) return false
    const enabled = isFeatureEnabled() && shouldMaintainTaskData()
    const accepted = companionKernel.configure?.({
      lease: companionKernelLease,
      enabled,
      providers: codexState().settings.providers,
      dynamicTaskWindowHours: codexState().settings.dynamicTaskWindowHours,
      focusedKey: focusedCompanionTaskKey
    }) || companionKernel.getLatest() || companionKernel.getPackage?.()
    if (!accepted) return false
    acceptCompanionTaskPackage(accepted)
    if (accepted.complete) consumeNavigationResults()
    return true
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
    // Task rows are projected from the Kernel package, so their pin flag must be
    // committed there as well; project pins stay a Renderer-owned projection.
    const task = kind === 'task' ? allTasks().find((item) => item.key === key) : undefined
    const exists = kind === 'task'
      ? Boolean(task)
      : taskState.conversations.projects.some((project) => project.key === key && project.kind !== 'chats')
    if (!exists) return false
    const identity = `${kind}:${key}`
    const pins = codexState().localPins
    const pinned = pins.some((pin) => `${pin.kind}:${pin.key}` === identity)
    if (task && !commitCompanionLocalPin(task, !pinned)) {
      options.setMessage('任务状态已更新，请确认最新状态后再置顶')
      return false
    }
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

  /**
   * Opens a Claude session in the Claude desktop app.
   *
   * Only an exact App local id reaches the bridge. The hand-off writes no read
   * receipt. A process-local hint suppresses late native `true` values only for
   * the same completion epoch while bounded native rereads confirm the result.
   */
  function currentClaudeSyncTarget(key: string, actionAlias: string) {
    return claudeCodeSessions.find((row) => !row.isArchived
      && row.sessionId === actionAlias
      && companionTaskKey('claude', row.sessionId) === key) || null
  }

  async function syncClaudeTask(
    key: string,
    actionAlias: string,
    request: { silent?: boolean } = {}
  ) {
    const target = currentClaudeSyncTarget(key, actionAlias)
    if (!target || disposed || !claudeEnabled()) {
      if (!request.silent) options.setMessage('Claude 任务身份已失效，请刷新后重试')
      return { accepted: false, state: 'unavailable' as const, unread: 'unavailable' as const, changed: false }
    }
    const laneToken = runtimeGeneration
    const revisionBefore = claudeControllerRevision
    const [stateResult, unreadResult] = await Promise.all([
      refreshClaudeState(Date.now()),
      refreshClaudeUnread()
    ])
    if (disposed || laneToken !== runtimeGeneration) {
      return { accepted: false, state: 'unavailable' as const, unread: 'unavailable' as const, changed: false }
    }
    const changed = claudeControllerRevision > revisionBefore
    publishClaudeTaskChange(changed, laneToken)
    const stateStatus = stateResult.available ? 'ok' as const : 'unavailable' as const
    const unreadStatus = unreadResult.available ? 'ok' as const : 'unavailable' as const
    if (!request.silent) {
      if (stateResult.available && unreadResult.available) {
        options.setMessage(changed ? '已同步 Claude 状态与已读信息' : 'Claude 状态与已读信息已是最新')
      } else if (stateResult.available) {
        options.setMessage('Claude 状态已同步；原生已读信息暂不可用')
      } else if (unreadResult.available) {
        options.setMessage('Claude 原生已读信息已同步；任务状态暂不可用')
      } else {
        options.setMessage('Claude 状态与原生已读信息暂不可用')
      }
    }
    return { accepted: true, state: stateStatus, unread: unreadStatus, changed }
  }

  function scheduleClaudeUnreadRechecks() {
    const laneToken = runtimeGeneration
    for (const delay of [0, 100, 300, 1000]) {
      const timer = setTimeout(() => {
        claudeUnreadRecheckTimers.delete(timer)
        if (disposed || laneToken !== runtimeGeneration || !claudeEnabled()) return
        void refreshClaudeUnread().then((result) => publishClaudeTaskChange(result.changed, laneToken))
          .catch(() => undefined)
      }, delay)
      claudeUnreadRecheckTimers.add(timer)
    }
  }

  async function openClaudeTask(key: string, actionAlias: string, navigationResult?: CompanionNavigationResult) {
    const bridge = options.platform.claude
    if (!bridge && !navigationResult) {
      options.setMessage('Claude 模块不可用')
      return false
    }
    const row = currentClaudeSyncTarget(key, actionAlias)
    if (!row) {
      options.setMessage('Claude 任务身份已失效，请刷新后重试')
      return false
    }
    const result = navigationResult || await bridge!.openTask(actionAlias)
    const dispatched = result?.outcome === 'opened' || result?.outcome === 'dispatched'
    if (disposed) return dispatched
    options.setMessage(result?.message || (dispatched
      ? '已在 Claude 桌面端打开该任务'
      : 'Claude 桌面端打开失败'))
    if (dispatched) applyClaudeOpenSuccess(key, actionAlias, row)
    return dispatched
  }

  async function openThread(
    key: string,
    actionAlias: string,
    _resetAttentionKind?: CodexAttentionKind,
    source: 'card-click' | 'manual-row-open' | 'manual-quick-jump' | 'attention-shortcut' | 'local-shortcut' | 'global-shortcut' = 'manual-row-open',
    operationId?: string
  ) {
    if (!key || disposed || !isFeatureEnabled()) return false
    if (!taskOperationsAllowed()) return rejectRuntimeMismatch()
    const task = allTasks().find((item) => item.key === key)
    if (!companionKernel) {
      options.setMessage('V4 任务 Kernel 未加载，需要重新接入或重载')
      return false
    }
    const result = await companionKernel.dispatch({
      action: 'open',
      key,
      expectedActionAlias: actionAlias,
      source,
      operationId
    })
    const canonical = companionKernel.getLatest().tasks.find((item) => item.key === key)
      || companionTaskPackage.tasks.find((item) => item.key === key)
    if (result.provider === 'claude' || canonical?.provider === 'claude') {
      return openClaudeTask(key, canonical?.actionAlias || actionAlias, result as CompanionNavigationResult)
    }
    const opened = result.outcome === 'opened' || result.outcome === 'dispatched'
    if (disposed) return opened
    options.setMessage(result.message || (opened
      ? task?.hiddenKind ? '已打开，任务仍在 Companion 已隐藏区' : '已打开 Codex 任务'
      : 'Codex 任务打开失败'))
    return opened
  }

  function hasVerifiedTaskInventory() {
    return rawConversations.updatedAt > 0
      && lastCompleteness === 'verified'
      && /^[a-f0-9]{64}$/.test(lastSourceFingerprint)
  }

  function openFirstInput(operationId?: string, source: 'attention-shortcut' | 'local-shortcut' = 'attention-shortcut') {
    if (!taskOperationsAllowed()) return rejectRuntimeMismatch()
    void companionKernel!.dispatch({ action: 'open-attention', kind: 'input', source, operationId }).then((result) => {
      if (disposed || result.outcome === 'opened' || result.outcome === 'dispatched') return
      options.setMessage(result.message || '当前没有待输入任务')
      options.notify()
    })
    return true
  }

  function openFirstCompletedUnread(operationId?: string, source: 'attention-shortcut' | 'local-shortcut' = 'attention-shortcut') {
    if (!taskOperationsAllowed()) return rejectRuntimeMismatch()
    void companionKernel!.dispatch({ action: 'open-attention', kind: 'completed-unread', source, operationId }).then((result) => {
      if (disposed || result.outcome === 'opened' || result.outcome === 'dispatched') return
      options.setMessage(result.message || '当前没有已完成未读任务')
      options.notify()
    })
    return true
  }

  function archiveFocusedTask(operationId?: string) {
    if (!taskOperationsAllowed()) return rejectRuntimeMismatch()
    void companionKernel!.dispatch({ action: 'archive-focused', source: 'archive-shortcut', operationId }).then((result) => {
      if (disposed || result.outcome === 'dispatched') return
      options.setMessage(result.message || '当前没有唯一且可归档的任务')
      options.notify()
    })
    return true
  }

  function cycleTaskFromCurrentInventory(direction: -1 | 1, operationId?: string, source: 'global-shortcut' | 'local-shortcut' = 'global-shortcut') {
    void companionKernel!.dispatch({ action: 'cycle', direction, source, operationId }).then((result) => {
      if (disposed || result.outcome === 'opened' || result.outcome === 'dispatched' || result.errorCode === 'superseded') return
      options.setMessage(result.message || '任务切换失败，请重试')
      options.notify()
    }).catch(() => {
      if (disposed) return
      options.setMessage('任务切换失败，请重试')
      options.notify()
    })
    return true
  }

  function cycleTask(direction: -1 | 1, operationId?: string, source: 'global-shortcut' | 'local-shortcut' = 'global-shortcut') {
    if (!taskOperationsAllowed()) return rejectRuntimeMismatch()
    return cycleTaskFromCurrentInventory(direction, operationId, source)
  }

  type RunnerTarget = {
    laneId: string
    targetId: string
    projectKey: string
    projectName: string
    targetAlias: string
    environmentId: string
    environmentName: string
    actionId: string
    actionName: string
    risk: 'normal' | 'external-write' | 'long-running'
  }
  type RunnerProjectCache = {
    projectKey: string
    actionAlias: string
    targetId: string
    environments: CodexActionRunnerCatalogV1['projects'][number]['environments']
  }
  const runnerTargets = new Map<string, RunnerTarget>()
  const runnerProjectCatalogCache = new Map<string, RunnerProjectCache>()
  const runnerProjectCatalogInFlight = new Map<string, Promise<{ ok: boolean; message: string }>>()
  let runnerCatalog: CodexActionRunnerCatalogV1 = { version: 1, projects: [], generatedAt: 0 }
  let pendingEnvironmentPush: { laneId: string; confirmToken: string; until: number } | null = null
  let runnerPreferenceLoaded = false
  let runnerPersistedSelectedLaneId = ''
  let runnerProjectCatalogGeneration = 0

  function clearActionRunnerProjectCache() {
    runnerProjectCatalogGeneration += 1
    runnerProjectCatalogCache.clear()
    runnerProjectCatalogInFlight.clear()
    runnerTargets.clear()
    pendingEnvironmentPush = null
    runnerCatalog = { version: 1, projects: [], generatedAt: 0 }
  }

  function loadActionRunnerPreference() {
    if (runnerPreferenceLoaded) return
    const preference = options.platform.actionRunner?.readPreference?.()
    runnerPersistedSelectedLaneId = typeof preference?.selectedLaneId === 'string'
      ? preference.selectedLaneId.slice(0, 300)
      : ''
    runnerPreferenceLoaded = true
  }

  function syncActionRunnerCatalog(next: CodexActionRunnerCatalogV1) {
    runnerCatalog = next
    options.platform.actionRunner?.syncCatalog(runnerCatalog)
  }

  function setActionRunnerMessage(message: string, selectedLaneId = runnerCatalog.selectedLaneId || '') {
    syncActionRunnerCatalog({ ...runnerCatalog, selectedLaneId, loading: false, message, generatedAt: Date.now() })
    options.setMessage(message)
  }

  function showActionRunnerLoading(laneId = '', message = '正在刷新 Action 目标…') {
    loadActionRunnerPreference()
    const selectedLaneId = laneId || runnerPersistedSelectedLaneId || runnerCatalog.selectedLaneId || ''
    syncActionRunnerCatalog({ ...runnerCatalog, selectedLaneId, loading: true, message, generatedAt: Date.now() })
    return options.platform.actionRunner?.activate?.({ laneId: selectedLaneId }) !== false
  }

  function actionHostRevisionReady() {
    return options.platform.codex.actionRuntimeRevision === CODEX_ACTION_HOST_RUNTIME_REVISION
  }

  function failOldActionHost(selectedLaneId = '') {
    clearActionRunnerProjectCache()
    const message = 'Action Host 版本过旧，需重载插件后再试'
    syncActionRunnerCatalog({ version: 1, projects: [], selectedLaneId, loading: false, message, generatedAt: Date.now() })
    options.setMessage(message)
    return false
  }

  function orderedRunnerProjects() {
    const projects = taskState.conversations.projects.filter((project) => project.kind === 'project')
    const byKey = new Map(projects.map((project) => [project.key, project]))
    const ordered: typeof projects = []
    const seen = new Set<string>()
    const add = (key: string) => {
      const project = byKey.get(key)
      if (!project || seen.has(project.key)) return
      seen.add(project.key)
      ordered.push(project)
    }
    const defaultKey = codexState().settings.actionDefaultProjectKey
    if (defaultKey) add(defaultKey)
    codexState().localPins.filter((pin) => pin.kind === 'project').forEach((pin) => add(pin.key))
    projects.filter((project) => project.nativePinned).sort((left, right) => (left.nativePinnedOrder ?? Number.MAX_SAFE_INTEGER) - (right.nativePinnedOrder ?? Number.MAX_SAFE_INTEGER)).forEach((project) => add(project.key))
    projects.filter((project) => project.selected).forEach((project) => add(project.key))
    projects.sort((left, right) => (left.nativeOrder ?? Number.MAX_SAFE_INTEGER) - (right.nativeOrder ?? Number.MAX_SAFE_INTEGER)).forEach((project) => add(project.key))
    return ordered
  }

  function runnerTargetProject() {
    return resolveCodexActionRunnerPriorityProject({
      defaultProjectKey: codexState().settings.actionDefaultProjectKey,
      localProjectKeys: codexState().localPins.filter((pin) => pin.kind === 'project').map((pin) => pin.key),
      projects: taskState.conversations.projects
    })
  }

  function runnerProjectForLane(laneId: string) {
    const cachedTarget = runnerTargets.get(laneId)
    if (cachedTarget) return taskState.conversations.projects.find((project) => project.key === cachedTarget.projectKey)
    const encodedProjectKey = String(laneId || '').split(':', 1)[0]
    if (!encodedProjectKey) return undefined
    let projectKey = ''
    try { projectKey = decodeURIComponent(encodedProjectKey) } catch { return undefined }
    return taskState.conversations.projects.find((project) => project.kind === 'project' && project.key === projectKey)
  }

  function reconcileActionRunnerProjectCache() {
    const currentProjects = new Map(taskState.conversations.projects
      .filter((project) => project.kind === 'project')
      .map((project) => [project.key, project]))
    let changed = false
    for (const [projectKey, cached] of runnerProjectCatalogCache) {
      const current = currentProjects.get(projectKey)
      if (current?.actionAlias === cached.actionAlias) continue
      runnerProjectCatalogCache.delete(projectKey)
      changed = true
    }
    return changed
  }

  function composeActionRunnerCatalog(
    selectionAuthority: string,
    options: { loading?: boolean; message?: string } = {}
  ) {
    const now = Date.now()
    runnerTargets.clear()
    const catalogProjects: CodexActionRunnerCatalogV1['projects'] = []
    for (const project of orderedRunnerProjects()) {
      if (!project.actionAlias) continue
      const cached = runnerProjectCatalogCache.get(project.key)
      if (!cached || cached.actionAlias !== project.actionAlias) continue
      const environments = cached.environments.map((environment) => ({
        ...environment,
        actions: environment.actions.map((action) => {
          const laneId = codexActionLaneId(cached.targetId, environment.id, action.id)
          runnerTargets.set(laneId, {
            laneId,
            targetId: cached.targetId,
            projectKey: project.key,
            projectName: project.name,
            targetAlias: project.actionAlias!,
            environmentId: environment.id,
            environmentName: environment.name,
            actionId: action.id,
            actionName: action.name,
            risk: action.risk as RunnerTarget['risk']
          })
          return {
            ...action,
            laneId,
            state: pendingEnvironmentPush?.laneId === laneId && pendingEnvironmentPush.until >= now
              ? 'confirm-required' as const
              : 'idle' as const
          }
        })
      })).filter((environment) => environment.actions.length > 0)
      if (environments.length) {
        catalogProjects.push({
          key: project.key,
          name: project.name,
          pinSource: project.pinSource,
          targetAlias: project.actionAlias,
          targetId: cached.targetId,
          environments
        })
      }
    }
    const priorityProject = runnerTargetProject()
    const priorityCatalogProject = catalogProjects.find((project) => project.key === priorityProject?.key)
    const defaultLaneId = priorityCatalogProject?.environments[0]?.actions[0]?.laneId || ''
    const selectedLaneId = selectionAuthority || defaultLaneId
    const selectedTarget = runnerTargets.get(selectedLaneId)
    let message = options.message || ''
    if (!priorityProject) message ||= '请先配置 Action 默认项目，或置顶一个项目'
    else if (!priorityCatalogProject && options.loading !== true) message ||= '优先项目未配置可执行的 Environment Action'
    else if (selectionAuthority && !selectedTarget && options.loading !== true) message ||= '上次选择的 Environment Action 已失效，请在 Runner 中重新选择'
    else if (selectedTarget && selectedTarget.projectKey !== priorityProject.key) message ||= '当前 Environment 选择不属于优先项目；全局槽已停用，请在优先项目中重新选择'
    syncActionRunnerCatalog({
      version: 1,
      projects: catalogProjects,
      selectedLaneId,
      confirmLaneId: pendingEnvironmentPush?.until && pendingEnvironmentPush.until >= now ? pendingEnvironmentPush.laneId : undefined,
      loading: options.loading === true,
      message,
      generatedAt: now
    })
    return Boolean(priorityProject && priorityCatalogProject)
  }

  async function loadActionRunnerProject(
    project: CodexProjectCard,
    allowStaleAliasRetry = true,
    force = false
  ): Promise<{ ok: boolean; message: string }> {
    if (!project.actionAlias || typeof options.platform.codex.listProjectEnvironments !== 'function') {
      return { ok: false, message: '当前宿主不支持 Action Runner，请重载插件后再试' }
    }
    const cached = runnerProjectCatalogCache.get(project.key)
    if (!force && cached?.actionAlias === project.actionAlias) return { ok: true, message: '' }
    const existing = runnerProjectCatalogInFlight.get(project.key)
    if (existing) return existing
    const generation = runnerProjectCatalogGeneration
    const operation = (async () => {
      let current = project
      let canRetryStaleAlias = allowStaleAliasRetry
      for (;;) {
        let listed
        try {
          listed = await options.platform.codex.listProjectEnvironments!(current.actionAlias!)
        } catch {
          return { ok: false, message: 'Action 目标读取失败' }
        }
        if (disposed || generation !== runnerProjectCatalogGeneration) return { ok: false, message: '' }
        if (listed?.errorCode === 'stale-alias' && canRetryStaleAlias) {
          canRetryStaleAlias = false
          await refresh({ actionPreflight: true })
          if (disposed || generation !== runnerProjectCatalogGeneration) return { ok: false, message: '' }
          const refreshed = taskState.conversations.projects.find((candidate) => candidate.kind === 'project' && candidate.key === project.key)
          if (!refreshed?.actionAlias) return { ok: false, message: 'Action 目标别名重建失败' }
          current = refreshed
          continue
        }
        if (!listed || listed.runtimeRevision !== CODEX_ACTION_HOST_RUNTIME_REVISION) {
          failOldActionHost(runnerCatalog.selectedLaneId || '')
          return { ok: false, message: 'Action Host 版本过旧，需重载插件后再试' }
        }
        if (listed.outcome !== 'ok') return { ok: false, message: listed.message || 'Action 目标读取失败' }
        if (!listed.targetId || listed.projectKey !== current.key) return { ok: false, message: 'Action 目标身份校验失败，已拒绝执行' }
        const latest = taskState.conversations.projects.find((candidate) => candidate.kind === 'project' && candidate.key === current.key)
        if (!latest?.actionAlias || latest.actionAlias !== current.actionAlias) {
          return { ok: false, message: 'Action 目标在读取期间发生变化，请重试' }
        }
        const environments = listed.environments.map((environment) => ({
          id: environment.id,
          name: environment.name,
          actions: environment.actions
            .filter((action) => action.slotEligible && ['normal', 'external-write', 'long-running'].includes(action.risk))
            .map((action) => ({
              id: action.id,
              laneId: codexActionLaneId(listed.targetId!, environment.id, action.id),
              name: action.name,
              icon: action.icon,
              risk: action.risk,
              state: 'idle' as const
            }))
        }))
        runnerProjectCatalogCache.set(current.key, {
          projectKey: current.key,
          actionAlias: current.actionAlias,
          targetId: listed.targetId,
          environments
        })
        return { ok: true, message: '' }
      }
    })().finally(() => {
      if (runnerProjectCatalogInFlight.get(project.key) === operation) runnerProjectCatalogInFlight.delete(project.key)
    })
    runnerProjectCatalogInFlight.set(project.key, operation)
    return operation
  }

  async function refreshActionRunnerCatalog(
    selectedLaneId = '',
    allowStaleAliasRetry = true,
    runTasksPreflight = true,
    scope: 'all' | 'priority' | 'selected' = 'all',
    force = false
  ): Promise<boolean> {
    loadActionRunnerPreference()
    const selectionAuthority = selectedLaneId || runnerPersistedSelectedLaneId || runnerCatalog.selectedLaneId || ''
    if (!actionHostRevisionReady()) return failOldActionHost(selectionAuthority)
    if (typeof options.platform.codex.listProjectEnvironments !== 'function') {
      setActionRunnerMessage('当前宿主不支持 Action Runner，请重载插件后再试', selectionAuthority)
      return false
    }
    if (runTasksPreflight && !hasVerifiedTaskInventory()) await refresh({ actionPreflight: true })
    if (disposed) return false
    reconcileActionRunnerProjectCache()
    const projects = orderedRunnerProjects()
    const priorityProject = runnerTargetProject()
    const selectedProject = runnerProjectForLane(selectionAuthority)
    const candidates = scope === 'priority'
      ? priorityProject ? [priorityProject] : []
      : scope === 'selected'
        ? selectedProject ? [selectedProject] : priorityProject ? [priorityProject] : []
        : [
            ...(selectedProject ? [selectedProject] : []),
            ...(priorityProject && priorityProject.key !== selectedProject?.key ? [priorityProject] : []),
            ...projects.filter((project) => project.key !== selectedProject?.key && project.key !== priorityProject?.key)
          ]
    const pendingProjects = candidates.filter((project) => project.actionAlias && (force || runnerProjectCatalogCache.get(project.key)?.actionAlias !== project.actionAlias))
    composeActionRunnerCatalog(selectionAuthority, {
      loading: pendingProjects.length > 0,
      message: pendingProjects.length > 0 ? '正在增量同步 Action 目标…' : ''
    })
    let failureMessage = ''
    for (const project of pendingProjects) {
      const result = await loadActionRunnerProject(project, allowStaleAliasRetry, force)
      if (disposed) return false
      failureMessage ||= result.message
      composeActionRunnerCatalog(selectionAuthority, {
        loading: project !== pendingProjects[pendingProjects.length - 1],
        message: result.ok ? '' : failureMessage
      })
    }
    return composeActionRunnerCatalog(selectionAuthority, { message: failureMessage })
  }

  async function activateActionRunner(laneId = '') {
    showActionRunnerLoading(laneId)
    await refreshActionRunnerCatalog(laneId)
    return true
  }

  async function runActionRunnerLane(laneId: string, restartLongRunning = false) {
    if (typeof options.platform.codex.runProjectAction !== 'function') return false
    loadActionRunnerPreference()
    if (!actionHostRevisionReady()) return failOldActionHost(laneId)
    if (!hasVerifiedTaskInventory()) await refresh({ actionPreflight: true })
    reconcileActionRunnerProjectCache()
    composeActionRunnerCatalog(laneId, { message: '正在校验 Action 目标…' })
    let target = runnerTargets.get(laneId)
    if (!target) {
      showActionRunnerLoading(laneId, '正在增量同步 Action 目标…')
      await refreshActionRunnerCatalog(laneId, true, false, 'selected')
      target = runnerTargets.get(laneId)
    }
    if (!target) {
      setActionRunnerMessage('Action 目标已失效，请在 Runner 中重新选择', laneId)
      return false
    }
    const now = Date.now()
    const confirmToken = pendingEnvironmentPush?.laneId === laneId && pendingEnvironmentPush.until >= now ? pendingEnvironmentPush.confirmToken : undefined
    syncActionRunnerCatalog({ ...runnerCatalog, selectedLaneId: laneId, loading: false, generatedAt: Date.now() })
    options.platform.actionRunner?.activate?.({ laneId })
    const execute = (current: RunnerTarget) => options.platform.codex.runProjectAction!({
      targetAlias: current.targetAlias,
      targetId: current.targetId,
      projectKey: current.projectKey,
      projectName: current.projectName,
      environmentId: current.environmentId,
      environmentName: current.environmentName,
      actionId: current.actionId,
      actionName: current.actionName,
      confirmToken,
      restartIfRunning: restartLongRunning && current.risk === 'long-running'
    })
    let result = await execute(target)
    if (disposed) return false
    if (result?.errorCode === 'stale-alias') {
      runnerProjectCatalogCache.delete(target.projectKey)
      await refresh({ actionPreflight: true })
      await refreshActionRunnerCatalog(laneId, false, false, 'selected', true)
      target = runnerTargets.get(laneId)
      if (!target) {
        setActionRunnerMessage('Action 目标重建失败，已拒绝执行', laneId)
        return false
      }
      result = await execute(target)
      if (disposed) return false
    }
    if (result?.outcome === 'confirm-required' && result.confirmToken) {
      pendingEnvironmentPush = { laneId, confirmToken: result.confirmToken, until: now + 30_000 }
      composeActionRunnerCatalog(laneId)
      setActionRunnerMessage(`${target.actionName}：请在 Runner 中确认 Git Push`, laneId)
      return true
    }
    pendingEnvironmentPush = null
    if (['action-missing', 'target-mismatch', 'cwd-missing', 'ambiguous-root', 'unsupported-target', 'environment-id-collision'].includes(result?.errorCode || '')) {
      runnerProjectCatalogCache.delete(target.projectKey)
      await refreshActionRunnerCatalog(laneId, false, false, 'selected', true)
    } else {
      composeActionRunnerCatalog(laneId)
    }
    setActionRunnerMessage(result?.message || `${target.actionName} 执行失败`, laneId)
    return isCodexActionStartAccepted(result?.outcome)
  }

  async function stopActionRunnerLane(laneId: string) {
    if (typeof options.platform.codex.stopActionSession !== 'function') return false
    if (!actionHostRevisionReady()) return failOldActionHost(laneId)
    if (!hasVerifiedTaskInventory()) await refresh({ actionPreflight: true })
    reconcileActionRunnerProjectCache()
    let target = runnerTargets.get(laneId)
    if (!target) {
      await refreshActionRunnerCatalog(laneId, true, false, 'selected')
      target = runnerTargets.get(laneId)
    }
    if (!target) return false
    const result = await options.platform.codex.stopActionSession({ targetId: target.targetId, projectKey: target.projectKey, environmentId: target.environmentId, actionId: target.actionId })
    setActionRunnerMessage(result?.message || '停止请求失败', laneId)
    return result?.outcome === 'stopping'
  }

  async function setActionRunnerRunArchived(runId: string, archived: boolean) {
    const result = await options.platform.codex.setActionRunArchived?.({ runId, archived })
    if (!result?.ok) options.setMessage(result?.message || '记录状态更新失败')
    return result?.ok === true
  }

  function updateActionRunnerPreference(payload: {
    pinned?: boolean
    view?: 'records' | 'archived'
    selectedLaneId?: string
    runtime?: { projectKey: string; mode: 'auto' | 'manual'; candidateId?: string }
  }) {
    if (payload.selectedLaneId && runnerTargets.has(payload.selectedLaneId)) {
      runnerPreferenceLoaded = true
      runnerPersistedSelectedLaneId = payload.selectedLaneId
      syncActionRunnerCatalog({ ...runnerCatalog, selectedLaneId: payload.selectedLaneId, message: '', generatedAt: Date.now() })
    }
    if (payload.runtime && !runnerCatalog.projects.some((project) => project.key === payload.runtime?.projectKey)) return false
    return options.platform.actionRunner?.updatePreference?.(payload) === true
  }

  function reorderActionRunnerProjects(projectKeys: string[]) {
    const pins = [...codexState().localPins]
    const localKeys = pins.filter((pin) => pin.kind === 'project').map((pin) => pin.key)
    const localSet = new Set(localKeys)
    const proposed = projectKeys.filter((key) => localSet.has(key))
    if (proposed.length !== localKeys.length || new Set(proposed).size !== localSet.size) return false
    let projectIndex = 0
    codexState().localPins = pins.map((pin) => pin.kind === 'project' ? { kind: 'project' as const, key: proposed[projectIndex++] } : pin)
    republishAfterReceiptChange()
    composeActionRunnerCatalog(runnerCatalog.selectedLaneId || '')
    return true
  }

  async function runEnvironmentActionSlot(slotIndex: number) {
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 4) return false
    showActionRunnerLoading('', `正在解析 Action 槽 ${slotIndex + 1}…`)
    loadActionRunnerPreference()
    const selectionAuthority = runnerPersistedSelectedLaneId || runnerCatalog.selectedLaneId || ''
    await refreshActionRunnerCatalog(selectionAuthority, true, true, 'priority')
    if (!actionHostRevisionReady()) return false
    const targetProject = runnerTargetProject()
    if (!targetProject) {
      setActionRunnerMessage('请先配置 Action 默认项目，或置顶一个项目', selectionAuthority)
      return false
    }
    if (!targetProject.actionAlias) {
      setActionRunnerMessage('目标项目动作别名已失效，请刷新后重试', selectionAuthority)
      return false
    }
    const catalogProject = runnerCatalog.projects.find((project) => project.key === targetProject.key)
    if (!catalogProject) {
      setActionRunnerMessage('优先项目未配置可执行的 Environment Action', selectionAuthority)
      return false
    }
    const selectedLaneId = runnerPersistedSelectedLaneId || runnerCatalog.selectedLaneId || ''
    const selectedProject = runnerProjectForLane(selectedLaneId)
    if (selectedProject && selectedProject.key !== targetProject.key) {
      setActionRunnerMessage('当前 Environment 选择不属于优先项目；请在优先项目中重新选择', selectedLaneId)
      return false
    }
    const selectedTarget = runnerTargets.get(selectedLaneId)
    if (!selectedTarget) {
      setActionRunnerMessage('上次选择的 Environment Action 已失效，请在 Runner 中重新选择', selectedLaneId)
      return false
    }
    if (selectedTarget.projectKey !== targetProject.key) {
      setActionRunnerMessage('当前 Environment 选择不属于优先项目；请在优先项目中重新选择', selectedLaneId)
      return false
    }
    const selectedEnvironment = catalogProject.environments.find((environment) => environment.id === selectedTarget.environmentId)
    if (!selectedEnvironment) {
      setActionRunnerMessage('目标 Environment 已失效，请在 Runner 中重新选择', selectedLaneId)
      return false
    }
    const action = selectedEnvironment.actions[slotIndex]
    if (!action) {
      setActionRunnerMessage(`${selectedEnvironment.name} 的 Action 槽 ${slotIndex + 1} 为空；未回退其他 Environment`, selectedLaneId)
      return false
    }
    return runActionRunnerLane(action.laneId, true)
  }

  async function setPlanPaused(key: string, recency: number | undefined, paused: boolean, source = paused ? 'pause-button' : 'resume-button') {
    if (!Number.isFinite(recency) || !companionKernel) {
      options.setMessage('当前运行环境不支持 Plan 暂停状态')
      return false
    }
    const task = allTasks().find((item) => item.key === key && item.revisionAt === recency)
    const allowed = paused
      ? task?.companionCapabilities?.pause === true
      : task?.companionCapabilities?.resume === true
    if (!task?.planReady || !task.planLifecycleRevision || !allowed) {
      options.setMessage('Plan 状态已变化，请刷新后重试')
      return false
    }
    const result = await companionKernel.dispatch({
      action: paused ? 'pause' : 'resume',
      key: task.key,
      planLifecycleRevision: task.planLifecycleRevision,
      source
    })
    if (disposed) return result.outcome === (paused ? 'paused' : 'resumed')
    const succeeded = result.outcome === (paused ? 'paused' : 'resumed')
    options.setMessage(result.message || (succeeded
      ? paused ? 'Plan 已暂停并移入已隐藏区' : 'Plan 已恢复到待继续列表'
      : 'Plan 状态更新失败'))
    options.notify()
    return succeeded
  }

  function pausePlan(key: string, recency?: number, source = 'pause-button') {
    return setPlanPaused(key, recency, true, source)
  }

  function resumePlan(key: string, recency?: number, source = 'resume-button') {
    return setPlanPaused(key, recency, false, source)
  }

  async function executePlan(key: string, recency?: number, source = 'execute-plan-button') {
    if (!Number.isFinite(recency) || !companionKernel) {
      options.setMessage('Plan 执行服务尚未就绪')
      return false
    }
    const task = allTasks().find((item) => item.key === key && item.revisionAt === recency)
    if (!task?.planReady || !task.planLifecycleRevision || task.companionCapabilities?.executePlan !== true) {
      options.setMessage('当前 Plan 尚未完成，或任务已有其它待决状态')
      return false
    }
    const result = await companionKernel.dispatch({
      action: 'execute-plan',
      key: task.key,
      planLifecycleRevision: task.planLifecycleRevision,
      source
    })
    if (disposed) return result.outcome === 'executed' || result.outcome === 'confirmation-required'
    const accepted = result.outcome === 'executed' || result.outcome === 'confirmation-required'
    options.setMessage(result.message || (result.outcome === 'executed' ? '已按原 Plan 启动执行' : 'Plan 执行失败'))
    options.notify()
    return accepted
  }

  /**
   * The Kernel package owns the visible bucket, so a persisted receipt alone
   * cannot move a row: it only becomes canonical `hidden` through the cold
   * preflight, which needs a verified live Provider read. Commit the same
   * local decision to the Kernel here so hide/restore stays available while
   * Codex/Claude is not running; the preflight later recomputes the identical
   * flag from this same receipt.
   */
  function acceptCompanionLocalCommit(accepted: CompanionTaskPackageV4 | null | undefined) {
    if (!accepted) return false
    acceptCompanionTaskPackage(accepted)
    return true
  }

  function commitCompanionVisibility(task: CodexTaskCard, hidden: boolean) {
    if (!companionKernel?.setVisibility || !companionKernelLease) return true
    return acceptCompanionLocalCommit(companionKernel.setVisibility({
      lease: companionKernelLease,
      key: task.key,
      revisionAt: task.revisionAt,
      hidden
    }))
  }

  /** Same local-commit contract as visibility; Plan-ready rows stay pinnable. */
  function commitCompanionLocalPin(task: CodexTaskCard, localPin: boolean) {
    if (!companionKernel?.setLocalPin || !companionKernelLease) return true
    return acceptCompanionLocalCommit(companionKernel.setLocalPin({
      lease: companionKernelLease,
      key: task.key,
      revisionAt: task.revisionAt,
      localPin
    }))
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
    if (task.planReady) {
      void pausePlan(task.key, task.revisionAt, 'hide-plan-route')
      return true
    }
    if (!commitCompanionVisibility(task, true)) {
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
    if (task.planReady && task.planPaused) {
      void resumePlan(task.key, task.revisionAt, 'restore-plan-route')
      return true
    }
    if (!commitCompanionVisibility(task, false)) {
      options.setMessage('任务状态已更新，请确认最新状态后再恢复')
      return false
    }
    codexState().receipts = restoreCodexThread(codexState().receipts, key, task.revisionAt, kind!)
    republishAfterReceiptChange()
    options.setMessage('已从已隐藏区释放任务')
    return true
  }

  function applyVerifiedArchiveMutation(task: CodexTaskCard) {
    const provider = companionTaskProvider(task)
    let changed = false
    if (provider === 'codex') {
      const nextThreads = lastThreads.filter((thread) => thread.key !== task.key)
      changed = nextThreads.length !== lastThreads.length
      lastThreads = nextThreads
      resetInventoryDisappearanceCandidate()
    } else if (task.actionAlias) {
      const nextRows = claudeCodeSessions.filter((row) => row.sessionId !== task.actionAlias)
      changed = nextRows.length !== claudeCodeSessions.length
      claudeCodeSessions = nextRows
      claudeMembershipTombstones.set(task.key, Date.now())
      claudeReadHints.delete(task.actionAlias)
      if (claudeCodeUnread) claudeCodeUnread = claudeCodeUnread.filter((id) => id !== task.actionAlias)
      if (changed) claudeControllerRevision += 1
    }
    const receipts = codexState().receipts.filter((receipt) => receipt.key !== task.key)
    const receiptChanged = receipts.length !== codexState().receipts.length
    if (receiptChanged) codexState().receipts = receipts
    if (!changed && !receiptChanged) return false
    if (provider === 'codex') {
      // A local mutation must stay on the current inventory timeline. Using
      // wall-clock time here can make valid fixtures (and imported history)
      // look older than the dynamic window and disappear as collateral.
      const projectionTime = Math.max(
        rawConversations.updatedAt || 0,
        task.updatedAt || 0,
        task.revisionAt || 0
      ) || Date.now()
      publishConversationProjection({ receivedAt: projectionTime, advanceScan: false })
    } else {
      publishTaskStatePackage(sourceTaskState.conversations)
      lastClaudeTaskPublishRevision = claudeControllerRevision
    }
    options.save()
    return true
  }

  async function performTaskArchive(
    task: CodexTaskCard,
    source: 'card' | 'batch' | 'shortcut',
    operationId?: string,
    confirmationRecorded = false
  ) {
    if (!taskOperationsAllowed()) return rejectRuntimeMismatch()
    const canonical = companionTaskPackage.tasks.find((item) => item.key === task.key)
    if (!canonical?.capabilities.archive || !companionKernel) {
      options.setMessage('任务状态已变化，当前不能归档')
      return false
    }
    const provider = canonical.provider
    taskArchive = {
      key: task.key,
      status: 'archiving',
      message: provider === 'claude' ? '正在静默归档 Claude 任务' : '正在归档 Codex 任务'
    }
    archivingKeys.add(task.key)
    options.notify()
    syncCompanionTaskAuthority()
    const result = await companionKernel.dispatch({
      action: 'archive',
      key: canonical.key,
      revisionAt: canonical.revisionAt,
      phase: canonical.phase,
      source: source === 'card' ? 'archive-button' : source === 'batch' ? 'batch-archive' : 'archive-shortcut',
      operationId,
      confirmationRecorded
    })
    archivingKeys.delete(task.key)
    if (disposed) return false
    if (result.outcome !== 'archived') {
      taskArchive = {
        key: task.key,
        status: 'error',
        message: result.message || (result.outcome === 'indeterminate'
          ? '归档结果无法唯一确认，已保留任务卡片'
          : '任务归档失败，已保留任务卡片')
      }
      options.setMessage(taskArchive.message)
      options.notify()
      return false
    }
    const changed = provider === 'codex' ? false : applyVerifiedArchiveMutation(task)
    taskArchive = { key: '', status: 'idle', message: '' }
    options.setMessage(provider === 'claude'
      ? 'EyPc 已归档并移除。Claude 原生侧栏同步未确认，当前不受支持。'
      : result.message || '已归档 Codex 任务')
    // The file watcher may already have published the same verified Claude
    // removal. In that case only refresh transient action state, not the task
    // package a second time.
    if (provider !== 'codex' && !changed) syncCompanionTaskAuthority()
    options.notify()
    return true
  }

  function archive(
    key: string,
    recency?: number,
    source: 'card' | 'batch' | 'shortcut' = 'card',
    operationId?: string,
    confirmationRecorded = false
  ): Promise<boolean> {
    if (!Number.isFinite(recency)) return Promise.resolve(false)
    const task = allTasks().find((item) => item.key === key && item.revisionAt === recency)
    if (!task || task.archiveCapability !== 'allowed' || !task.actionAlias) {
      options.setMessage(task?.archiveCapability === 'blocked-stopped'
        ? '当前 Provider 无法安全确认归档边界'
        : '任务仍在进行中，暂不能归档')
      return Promise.resolve(false)
    }
    const inFlightKey = `${companionTaskProvider(task)}:${task.key}`
    const existing = taskArchiveInFlight.get(inFlightKey)
    if (existing) return existing
    const operation = performTaskArchive(task, source, operationId, confirmationRecorded).finally(() => {
      if (taskArchiveInFlight.get(inFlightKey) === operation) taskArchiveInFlight.delete(inFlightKey)
    })
    taskArchiveInFlight.set(inFlightKey, operation)
    return operation
  }

  async function archiveMany(items: Array<{ key: string; revisionAt: number }>, operationId?: string, confirmationRecorded = false) {
    const unique = [...new Map(items
      .filter((item) => typeof item?.key === 'string' && Number.isFinite(item.revisionAt))
      .map((item) => [`${item.key}:${item.revisionAt}`, item] as const)).values()]
    const results = await Promise.all(unique.map((item, index) => archive(
      item.key,
      item.revisionAt,
      'batch',
      operationId ? `${operationId}:${index}` : undefined,
      confirmationRecorded
    )))
    const archivedCount = results.filter(Boolean).length
    const failedCount = results.length - archivedCount
    options.setMessage(failedCount ? `已归档 ${archivedCount} 项，${failedCount} 项未通过真实状态核验` : `已归档 ${archivedCount} 项`)
    return failedCount === 0
  }

  async function archiveProject(key: string, actionAlias: string, operationId?: string, confirmationRecorded = false) {
    if (typeof options.platform.codex.archiveProject !== 'function' || projectArchive.status === 'archiving') return false
    const project = taskState.conversations.projects.find((item) => item.key === key && item.actionAlias === actionAlias)
    if (!project || project.kind === 'chats' && !actionAlias || !taskState.conversations.sourceFingerprint) {
      options.setMessage('项目动作已失效，请刷新后重试')
      return false
    }
    projectArchive = { key, status: 'archiving', message: '正在分批归档项目任务' }
    options.notify()
    const result = await options.platform.codex.archiveProject(actionAlias, {
      expectedSourceFingerprint: taskState.conversations.sourceFingerprint,
      operationId,
      source: 'project-archive',
      confirmationRecorded
    })
    if (disposed) return false
    // Every Codex item has already crossed the process-owned verified archive
    // commit gate. Renderer/controller inventory must never independently hide
    // a task merely because an RPC or project worker returned success.
    if (result.outcome === 'failed') {
      projectArchive = { key, status: 'error', message: result.message || '项目批量归档失败' }
      options.setMessage(projectArchive.message)
      options.notify()
      return false
    }
    const desktopSyncFailedCount = result.desktopSyncFailedKeys?.length || 0
    const desktopSyncMessage = desktopSyncFailedCount
      ? `；${desktopSyncFailedCount} 项未通过原生持久化后置条件，已保留`
      : result.archivedKeys.length > 0 ? '，且已完成原生持久化核验' : ''
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
    void refresh({ forceTasks: true })
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
      beginCompanionNavigation()
      stopActivityListener = options.platform.codex.onActivityChanged?.((delta) => applyActivityDelta(delta)) || null
      subscribeClaudeQuotaLifecycle()
      subscribeClaudeEvents()
      if (isFeatureEnabled()) void inspectEnvironment()
      syncActivation(true)
    },
    dispose() {
      disposed = true
      environmentGeneration += 1
      refreshGeneration += 1
      if (environment.checking) environment = { ...environment, checking: false }
      clearTimer()
      resetStructuralRefresh()
      resetInventoryDisappearanceCandidate()
      stopActivityListener?.()
      stopActivityListener = null
      stopClaudeQuotaLifecycleListener?.()
      stopClaudeQuotaLifecycleListener = null
      stopNavigationResultListener?.()
      stopNavigationResultListener = null
      stopCompanionPackageListener?.()
      stopCompanionPackageListener = null
      for (const timer of claudeUnreadRecheckTimers) clearTimeout(timer)
      claudeUnreadRecheckTimers.clear()
      unsubscribeClaudeEvents()
      if (companionKernelLease) companionKernel?.detach?.({ lease: companionKernelLease })
      companionKernelLease = 0
    },
    syncActivation,
    refresh: () => refresh({ force: true }),
    /** Registers or removes the explicitly confirmed Claude hook/status line. */
    async setClaudeRegistration(register: boolean, request: { statusline?: boolean } = {}) {
      const bridge = options_platform_claude()
      if (!bridge) {
        options.setMessage('Claude 模块不可用')
        return false
      }
      const result = register ? await bridge.install(request) : await bridge.uninstall()
      if (!result?.ok) {
        options.setMessage(result?.message || (register ? 'Claude 注册失败' : 'Claude 注销失败'))
        return false
      }
      options.setMessage(register ? '已注册 Claude 事件钩子' : '已移除 Claude 事件钩子')
      await refreshClaude(Date.now())
      publishTaskStatePackage(sourceTaskState.conversations)
      options.notify()
      return true
    },
    inspectEnvironment: () => inspectEnvironment(true),
    setLaunchPath,
    clearLaunchPath,
    updateSettings,
    dismiss,
    hide,
    restore,
    pausePlan,
    resumePlan,
    executePlan,
    archive,
    archiveMany,
    archiveFocusedTask,
    setFocusedTask,
    archiveProject,
    syncClaudeTask,
    openThread,
    openFirstInput,
    openFirstCompletedUnread,
    cycleTask,
    runEnvironmentActionSlot,
    activateActionRunner,
    runActionRunnerLane,
    stopActionRunnerLane,
    setActionRunnerRunArchived,
    updateActionRunnerPreference,
    reorderActionRunnerProjects,
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
        taskState,
        companionTaskPackage,
        ...(options.platform.runtimeIdentityStatus ? { runtimeIdentity: options.platform.runtimeIdentityStatus } : {}),
        ...(options.platform.diagnostics?.snapshot ? { runtimeDiagnostics: options.platform.diagnostics.snapshot() } : {}),
        conversations: taskState.conversations,
        activityDecisionDiagnostics,
        claudeEnvironment,
        claudeCodeSessionCount: claudeCodeSessions.reduce(
          (total, observation) => total + (observation.isArchived ? 0 : 1),
          0
        ),
        claudeQuota,
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
    floatSnapshot(keybindings: CodexFloatSnapshotV1['keybindings'] = []): CodexFloatSnapshotV1 {
      const settings = codexState().settings
      const candidate: CodexFloatSnapshotV1 = {
        version: 2,
        baseRevision: floatBaseRevision,
        taskStateRevision: CODEX_TASK_STATE_REVISION,
        taskState,
        companionTaskPackage,
        ...(options.platform.runtimeIdentityStatus ? { runtimeIdentity: options.platform.runtimeIdentityStatus } : {}),
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
        archivingTaskKeys: [...archivingKeys],
        projectArchive,
        timeWindowDays: settings.timeWindowDays,
        actionDefaultProjectKey: settings.actionDefaultProjectKey || '',
        keybindings,
      companion: {
        providers: settings.providers,
        claudeAppQuotaAccess: settings.claudeAppQuotaAccess,
        revision: claudeControllerRevision,
        stateGeneration: lastClaudeStateGeneration,
        unreadGeneration: lastClaudeUnreadGeneration,
        claudeQuotaAccess,
        claudeQuota,
        claudeEnvironment
      },
        generatedAt: 0
      }
      const fingerprint = codexFloatBaseSemanticFingerprint(candidate)
      if (floatBaseSnapshot && fingerprint === floatBaseFingerprint) return floatBaseSnapshot
      floatBaseRevision += 1
      candidate.baseRevision = floatBaseRevision
      candidate.generatedAt = Date.now()
      floatBaseFingerprint = fingerprint
      floatBaseSnapshot = candidate
      return candidate
    }
  }
}
