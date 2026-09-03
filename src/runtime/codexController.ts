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
  CODEX_TASK_STATE_REVISION,
  type CodexAttentionKind,
  type CodexActivityDecisionDiagnostics,
  type CodexConfigSnapshotV1,
  type CodexEnvironmentSnapshotV1,
  type CodexExpandedSizePreference,
  type CodexHostProject,
  type CodexHostSnapshot,
  type CodexHostThread,
  type CodexLocalPin,
  type CodexManualPhaseValue,
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
  type ClaudeCodeObservation,
  type ClaudeCodeUnreadObservation
} from '../domain/claudeCode'
import {
  normalizeCursorAgentObservation,
  type CursorAgentObservation
} from '../domain/cursorAgent'
import { normalizeCodexModelCatalog } from '../domain/codexNewThread'
import { CODEX_ACTION_HOST_RUNTIME_REVISION, isCodexActionStartAccepted } from '../domain/codexEnvironment'
import {
  buildCodexTaskStatePackage,
  CODEX_TASK_STATE_DEGRADED_MESSAGE,
  type CodexTaskStatePackageV1
} from '../domain/codexPresentation'
import {
  projectCompanionTaskSnapshot,
  emptyCompanionTaskPackage,
  COMPANION_TASK_KERNEL_REVISION,
  COMPANION_TASK_PACKAGE_REVISION,
  type CompanionTaskSnapshotV6
} from '../domain/companionTaskPackage'
import {
  COMPANION_PROVIDER_REGISTRY_REVISION,
  COMPANION_TASK_ACK_REVISION,
  COMPANION_TASK_COMMAND_REVISION,
  COMPANION_TASK_SUBSCRIBE_REVISION,
  COMPANION_TASK_TOPOLOGY_REVISION,
  type CompanionTaskCommandNameV1
} from '../domain/companionTaskTopology'
import { codexActionLaneId, resolveCodexActionRunnerPriorityProject, type CodexActionRunnerCatalogV1 } from '../domain/codexActionRunner'
import type { AppState } from '../domain/types'
import {
  type CodexFloatWorkspaceDiagnostics,
  type CompanionTaskMutationDelta,
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
  /** The only task read model shared by Main, Float, badges and shortcuts. */
  taskSnapshot: CompanionTaskSnapshotV6
  /** Shared consumer template derived atomically from taskSnapshot. */
  taskState: CodexTaskStatePackageV1
  /** Compatibility view into taskState; it never owns or recomputes status. */
  conversations: ConversationSnapshotV1
  /** Project chrome/inventory only; task status must never be read from it. */
  taskInventory: CodexTaskStatePackageV1
  runtimeIdentity?: RuntimeIdentityHandshakeV1
  runtimeDiagnostics?: RuntimeDiagnosticsSnapshotV3
  activityDecisionDiagnostics: CodexActivityDecisionDiagnostics
  /** Claude provider state for the settings page. */
  claudeEnvironment: ClaudeEnvironmentSnapshot
  /**
   * Non-archived desktop-app sessions in the current inventory. Settings-page
   * Status only; task cards come exclusively from `taskSnapshot`.
   */
  claudeCodeSessionCount: number
  cursorSessionCount: number
  cursorAvailable: boolean
  cursorInventoryReason: string
  cursorHooks: 'installed' | 'outdated' | 'missing' | 'unknown'
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
  /** Base/settings/quota lane; independent from taskSnapshot.packageRevision. */
  baseRevision?: number
  taskSnapshot?: CompanionTaskSnapshotV6
  /** Project chrome/inventory only; the Float derives every task status from taskSnapshot. */
  taskInventory?: CodexTaskStatePackageV1
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
  taskArchive: { key: string; status: 'idle' | 'archiving' | 'error'; message: string }
  /** Process-local action state; cards remain visible until verified removal. */
  archivingTaskKeys?: string[]
  projectArchive: { key: string; status: 'idle' | 'archiving' | 'error'; message: string }
  timeWindowDays: number
  actionDefaultProjectKey?: string
  keybindings?: Array<{
    actionId: string
    shortcutId: string
    layer: string
    when: string
    weight: number
    executionOwner: 'runtime-action' | 'shell' | 'main-quick-jump' | 'float-local' | 'action-local'
  }>
  /**
   * Multi-provider payload. Optional so an older floating child simply ignores
   * it and keeps rendering the Codex-only presentation.
   */
  companion?: CompanionSnapshotSlice
  generatedAt: number
}

function codexFloatBaseSemanticFingerprint(snapshot: CodexFloatSnapshotV1) {
  const base = { ...snapshot } as Record<string, unknown>
  delete base.baseRevision
  delete base.generatedAt
  delete base.taskSnapshot
  const companion = snapshot.companion ? { ...snapshot.companion } : undefined
  if (companion) {
    delete companion.revision
    delete companion.stateGeneration
    delete companion.unreadGeneration
  }
  base.companion = companion
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

/** Why a Claude quota read ran; `force` lets a manual read skip the fallback's ordinary cadence. */
interface ClaudeQuotaTrigger { reason: string; force?: boolean }

/** What each Claude quota lane contributed to one read, for the bounded diagnostics line. */
interface ClaudeQuotaLaneObservation {
  statuslineAgeMs: number | null
  planSampleAgeMs: number | null
  usageApi: 'disabled' | 'accepted' | 'skipped' | 'failed'
  access: Record<string, unknown> | null
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

export function createCodexController(options: CodexControllerOptions) {
  // Direct test/custom adapters may omit the capability. The production
  // platform adapter always supplies either the exact revision or `legacy`.
  const taskStateSourceRevision = options.platform.codex.taskStateRevision || CODEX_TASK_STATE_REVISION
  const companionKernel = options.platform.companionKernel?.revision === COMPANION_TASK_KERNEL_REVISION
    && options.platform.companionKernel.packageRevision === COMPANION_TASK_PACKAGE_REVISION
    && options.platform.companionKernel.registryRevision === COMPANION_PROVIDER_REGISTRY_REVISION
    && options.platform.companionKernel.topologyRevision === COMPANION_TASK_TOPOLOGY_REVISION
    && options.platform.companionKernel.commandRevision === COMPANION_TASK_COMMAND_REVISION
    && options.platform.companionKernel.subscribeRevision === COMPANION_TASK_SUBSCRIBE_REVISION
    && options.platform.companionKernel.ackRevision === COMPANION_TASK_ACK_REVISION
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
  let taskPresentation = buildCodexTaskStatePackage(emptyConversationSnapshot(), {
    sourceRevision: taskStateSourceRevision,
    dynamicTaskWindowHours: options.getAppState().codex.settings.dynamicTaskWindowHours
  })
  let taskSnapshot = emptyCompanionTaskPackage(options.getAppState().codex.settings.providers)
  // Incomplete Kernel packages are transport/readiness signals, never an
  // invitation to resurrect the legacy Renderer classifier. Metadata refreshes
  // continue projecting the last complete semantic decision until a newer
  // complete package replaces it.
  let latestKernelPackageRevision = 0
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
  let cursorSessions: CursorAgentObservation[] = []
  let cursorAvailable = false
  let cursorInventoryReason = ''
  let lastCursorReadAt = 0
  let cursorInventorySettled = true
  let cursorHooks: 'installed' | 'outdated' | 'missing' | 'unknown' = 'unknown'
  const cursorHookStates = new Map<string, { phase: CursorAgentObservation['hookPhase']; turnOpen: boolean; lastEventAt: number }>()
  let cursorEventDispose: (() => void) | null = null
  let cursorInventoryWatchDispose: (() => void) | null = null
  let cursorInventoryReading = false
  let cursorInventoryReadQueued = false
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
  let stopClaudeQuotaLifecycleListener: (() => void) | null = null
  let companionCommandSequence = 0
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
    // Instrumented because the error memory guarding this path asks whether a
    // dropout was held or accepted, and that question was previously
    // unanswerable from the log: only the outcome was visible, never the hold.
    options.platform.diagnostics?.record?.({
      level: 'info',
      scope: 'task-recovery',
      event: 'inventory-dropout',
      outcome: accept ? 'accepted-as-deletion' : 'held-as-transport',
      provider: 'codex',
      details: {
        missingCount: missingKeys.length,
        confirmations: candidate.confirmations,
        firstObservation,
        elapsedMs: elapsed,
        holdMs: hold
      }
    })
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
    options.setMessage(options.platform.runtimeIdentityStatus?.message || 'V6 任务 Kernel 未加载，需要重新接入或重载')
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

  function cursorEnabled(): boolean {
    return isCompanionProviderEnabled(codexState().settings.providers, 'cursor')
  }

  function refreshTaskPresentation(conversations: ConversationSnapshotV1, now = Date.now()) {
    // The Controller owns presentation metadata only. Every semantic task field
    // is overwritten from the one immutable Kernel snapshot by the shared
    // adapter below; no provider-specific reducer runs in the Renderer.
    sourceTaskState = buildCodexTaskStatePackage(conversations, {
      sourceRevision: taskStateSourceRevision,
      now,
      dynamicTaskWindowHours: codexState().settings.dynamicTaskWindowHours
    })
    if (taskSnapshot.complete) taskPresentation = projectCompanionTaskSnapshot(taskSnapshot, sourceTaskState)
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
    refreshTaskPresentation(sourceTaskState.conversations)
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
    refreshTaskPresentation(sourceTaskState.conversations, Number(delta.acceptedAt) || Date.now())
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
      options.notify()
      return
    }
    // Provider task state is observed by the Host/Kernel. This one-shot read is
    // settings telemetry only and never participates in task classification.
    void refreshClaude(Date.now()).then((changed) => {
      if (disposed || !changed) return
      options.notify()
    }).catch(() => { /* claude lane degrades on its own */ })
  }

  function cursorSessionsWithHooks(): CursorAgentObservation[] {
    if (!cursorHookStates.size) return cursorSessions
    return cursorSessions.map((session) => {
      const hook = cursorHookStates.get(session.composerId)
      if (!hook) return session
      return {
        ...session,
        ...(hook?.turnOpen ? { hookTurnOpen: true } : {}),
        ...(hook?.phase ? { hookPhase: hook.phase } : {}),
        ...(hook?.lastEventAt ? { hookLastEventAt: hook.lastEventAt } : {})
      }
    })
  }

  function applyCursorHookState() {
    const bridge = options.platform.cursor
    if (!bridge || typeof bridge.readHookState !== 'function') return false
    let rows: Array<{ sessionId: string; phase: string; turnOpen: boolean; lastEventAt: number }>
    try {
      rows = bridge.readHookState() || []
    } catch {
      return false
    }
    const next = new Map<string, { phase: CursorAgentObservation['hookPhase']; turnOpen: boolean; lastEventAt: number }>()
    for (const row of rows) {
      const sessionId = typeof row.sessionId === 'string' ? row.sessionId.trim() : ''
      if (!sessionId) continue
      const phase = row.phase === 'running' || row.phase === 'completed' || row.phase === 'stopped'
        ? row.phase
        : undefined
      next.set(sessionId, {
        phase,
        turnOpen: row.turnOpen === true,
        lastEventAt: Number(row.lastEventAt) || 0
      })
    }
    let changed = next.size !== cursorHookStates.size
    if (!changed) {
      for (const [key, value] of next) {
        const previous = cursorHookStates.get(key)
        if (!previous || previous.phase !== value.phase || previous.turnOpen !== value.turnOpen || previous.lastEventAt !== value.lastEventAt) {
          changed = true
          break
        }
      }
    }
    cursorHookStates.clear()
    for (const [key, value] of next) cursorHookStates.set(key, value)
    return changed
  }

  function kickCursorInventoryRefresh() {
    if (cursorInventoryReading) {
      cursorInventoryReadQueued = true
      return
    }
    cursorInventoryReading = true
    void refreshCursor().then((changed) => {
      cursorInventoryReading = false
      if (cursorInventoryReadQueued) {
        cursorInventoryReadQueued = false
        kickCursorInventoryRefresh()
        return
      }
      if (disposed || !changed) return
      refreshTaskPresentation(sourceTaskState.conversations)
      options.notify()
    }).catch(() => {
      cursorInventoryReading = false
      cursorInventoryReadQueued = false
    })
  }

  function subscribeCursorEvents() {
    if (disposed || !cursorEnabled()) {
      unsubscribeCursorEvents()
      return
    }
    const bridge = options.platform.cursor
    if (bridge && typeof bridge.watchEvents === 'function' && !cursorEventDispose) {
      try {
        cursorEventDispose = bridge.watchEvents(() => {
          if (disposed || !cursorEnabled()) return
          const changed = applyCursorHookState()
          if (!changed) return
          refreshTaskPresentation(sourceTaskState.conversations)
          options.notify()
        })
      } catch {
        cursorEventDispose = null
      }
    }
    if (bridge && typeof bridge.watchInventory === 'function' && !cursorInventoryWatchDispose) {
      try {
        cursorInventoryWatchDispose = bridge.watchInventory(() => {
          if (disposed || !cursorEnabled()) return
          kickCursorInventoryRefresh()
        })
      } catch {
        cursorInventoryWatchDispose = null
      }
    }
  }

  function unsubscribeCursorEvents() {
    if (cursorEventDispose) {
      try { cursorEventDispose() } catch { /* teardown is best effort */ }
      cursorEventDispose = null
    }
    if (cursorInventoryWatchDispose) {
      try { cursorInventoryWatchDispose() } catch { /* teardown is best effort */ }
      cursorInventoryWatchDispose = null
    }
    cursorInventoryReading = false
    cursorInventoryReadQueued = false
  }

  function resetCursorLane() {
    unsubscribeCursorEvents()
    cursorSessions = []
    cursorAvailable = false
    cursorInventoryReason = ''
    lastCursorReadAt = 0
    cursorInventorySettled = true
    cursorHooks = 'unknown'
    cursorHookStates.clear()
  }

  function cursorHookInstallState(value: unknown): typeof cursorHooks {
    return value === 'installed' || value === 'outdated' || value === 'missing' || value === 'unknown'
      ? value
      : 'unknown'
  }

  async function refreshCursorRegistration() {
    if (disposed || !cursorEnabled()) return false
    const inspect = options.platform.cursor?.inspect
    if (typeof inspect !== 'function') return false
    try {
      const inspected = await inspect()
      const nextHooks = cursorHookInstallState(inspected?.hooks)
      if (nextHooks === cursorHooks) return false
      cursorHooks = nextHooks
      return true
    } catch {
      return false
    }
  }

  async function refreshCursor() {
    if (disposed || !cursorEnabled()) return false
    const bridge = options.platform.cursor
    if (!bridge || typeof bridge.readInventory !== 'function') {
      cursorAvailable = false
      cursorInventoryReason = 'unknown'
      cursorInventorySettled = true
      return false
    }
    try {
      const snapshot = await bridge.readInventory()
      const next = Array.isArray(snapshot?.sessions)
        ? snapshot.sessions.flatMap((row) => {
          const observation = normalizeCursorAgentObservation(row)
          return observation ? [observation] : []
        })
        : []
      const available = snapshot?.available === true
      const reason = typeof snapshot?.reason === 'string' && snapshot.reason ? snapshot.reason : (available ? 'ready' : 'unknown')
      const changed = available !== cursorAvailable
        || reason !== cursorInventoryReason
        || next.length !== cursorSessions.length
        || next.some((row, index) => {
          const previous = cursorSessions[index]
          return !previous
            || previous.composerId !== row.composerId
            || previous.diskStatus !== row.diskStatus
            || previous.hasUnreadMessages !== row.hasUnreadMessages
            || previous.hasPendingPlan !== row.hasPendingPlan
            || previous.hasBlockingPendingActions !== row.hasBlockingPendingActions
            || previous.unfinishedRunAt !== row.unfinishedRunAt
            || previous.lastUpdatedAt !== row.lastUpdatedAt
            || previous.name !== row.name
        })
      cursorSessions = next
      cursorAvailable = available
      cursorInventoryReason = reason
      lastCursorReadAt = Date.now()
      cursorInventorySettled = true
      const hookChanged = applyCursorHookState()
      const registrationChanged = await refreshCursorRegistration()
      return changed || hookChanged || registrationChanged
    } catch {
      cursorAvailable = false
      cursorInventoryReason = 'degraded'
      cursorInventorySettled = true
      return false
    }
  }

  function syncCursorEnablement() {
    if (!cursorEnabled()) {
      resetCursorLane()
      options.notify()
      return
    }
    // Provider task state is observed by the Host/Kernel. This one-shot read is
    // settings telemetry only and never participates in task classification.
    void refreshCursor().then((changed) => {
      if (disposed) return
      if (changed) options.notify()
    }).catch(() => { /* cursor lane degrades on its own */ })
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
    const inspect = options.platform.claude?.inspect
    if (typeof inspect !== 'function') return false
    const previous = JSON.stringify(claudeEnvironment)
    try {
      claudeEnvironment = await inspect()
    } catch {
      claudeEnvironment = emptyClaudeEnvironment()
    }
    const changed = previous !== JSON.stringify(claudeEnvironment)
    if (changed) claudeControllerRevision += 1
    return changed
  }

  /** Settings-page telemetry only. Host/Kernel still own task inventory. */
  function refreshCompanionRegistrationTelemetry() {
    if (disposed || !isFeatureEnabled()) return
    if (claudeEnabled()) {
      void refreshClaudeEnvironment().then((changed) => {
        if (!disposed && changed) options.notify()
      }).catch(() => undefined)
    }
    if (cursorEnabled()) {
      void refreshCursorRegistration().then((changed) => {
        if (!disposed && changed) options.notify()
      }).catch(() => undefined)
    }
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

  async function refreshClaudeQuota(now = Date.now(), trigger: ClaudeQuotaTrigger = { reason: 'timer' }) {
    const bridge = options.platform.claude
    if (!bridge || claudeQuotaInFlight) return false
    claudeQuotaInFlight = true
    const laneToken = runtimeGeneration
    const previous = JSON.stringify({ quota: claudeQuota, access: claudeQuotaAccess })
    const startedAt = Date.now()
    const lane: ClaudeQuotaLaneObservation = { statuslineAgeMs: null, planSampleAgeMs: null, usageApi: 'disabled', access: null }
    try {
      const snapshot = await Promise.resolve(bridge.readSnapshot({ now })).catch(() => null)
      if (disposed || laneToken !== runtimeGeneration) return false
      if (snapshot?.quota) {
        const statuslineAt = Number(snapshot.quota.updatedAt) || 0
        lane.statuslineAgeMs = statuslineAt > 0 ? Math.max(0, now - statuslineAt) : null
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
            lane.planSampleAgeMs = Number.isFinite(sample.at) && sample.at > 0 ? Math.max(0, now - sample.at) : null
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
              : 0,
            force: trigger.force === true
          })
          lane.usageApi = fallback ? 'accepted' : 'skipped'
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
            const rawAccess = bridge.diagnostics().quotaAccess
            lane.access = rawAccess && typeof rawAccess === 'object' ? rawAccess as unknown as Record<string, unknown> : null
            const access = normalizeClaudeQuotaAccess(rawAccess)
            claudeQuotaAccess = access
            if (!fallback && access.lastAttemptAt >= now && access.status !== 'idle' && access.status !== 'ok') {
              lane.usageApi = 'failed'
              claudeQuota = staleClaudeQuota(claudeQuota, now)
            }
          }
        } catch { /* bounded fallback never affects state publication */ }
      } else {
        claudeQuotaAccess = emptyClaudeQuotaAccess()
      }
      const changed = previous !== JSON.stringify({ quota: claudeQuota, access: claudeQuotaAccess })
      if (changed) claudeControllerRevision += 1
      recordClaudeQuotaRead(trigger, lane, { now, startedAt, changed })
      return changed
    } finally {
      claudeQuotaInFlight = false
    }
  }

  /**
   * One bounded diagnostics line per Claude quota read. It answers "which lane
   * produced the number, how old it is and why the read ran" — the question the
   * surface cannot — without carrying any percentage, reset timestamp, identity
   * or credential state. Diagnostics never affect the lane itself.
   */
  function recordClaudeQuotaRead(trigger: ClaudeQuotaTrigger, lane: ClaudeQuotaLaneObservation, result: { now: number; startedAt: number; changed: boolean }) {
    const record = options.platform.diagnostics?.record
    if (typeof record !== 'function') return
    const windows = claudeQuota.windows
    const primary = windows.find((window) => window.kind === 'weekly' && !window.scope)
      || windows.find((window) => window.kind === 'short' && !window.scope)
      || windows[0]
      || null
    const earliestReset = windows.reduce<number | null>((earliest, window) => (
      window.resetAt !== null && window.resetAt > result.now && (earliest === null || window.resetAt < earliest) ? window.resetAt : earliest
    ), null)
    const newestUsageApiAt = windows.reduce((newest, window) => window.source === 'usage-api' ? Math.max(newest, window.updatedAt || 0) : newest, 0)
    const access = lane.access || {}
    const token = (value: unknown, max = 40) => typeof value === 'string' ? value.slice(0, max) : ''
    const retryAt = Number(access.retryAt) || 0
    const attempted = lane.usageApi === 'accepted' || lane.usageApi === 'failed'
    try {
      record({
        level: result.changed || attempted || trigger.reason === 'manual' ? 'info' : 'debug',
        scope: 'quota',
        event: 'claude-quota-read',
        outcome: result.changed ? 'changed' : 'unchanged',
        provider: 'claude',
        reason: trigger.reason,
        durationMs: Math.max(0, Date.now() - result.startedAt),
        count: windows.length,
        details: {
          trigger: trigger.reason,
          force: trigger.force === true,
          statuslineAgeMs: lane.statuslineAgeMs,
          planSampleAgeMs: lane.planSampleAgeMs,
          usageApi: lane.usageApi,
          usageApiAgeMs: newestUsageApiAt > 0 ? Math.max(0, result.now - newestUsageApiAt) : null,
          accessStatus: token(access.status, 32) || 'idle',
          accessReason: token(access.reason),
          blockedBy: token(access.blockedBy, 20),
          retryInMs: retryAt > result.now ? retryAt - result.now : 0,
          windowCount: windows.length,
          scopedCount: windows.filter((window) => Boolean(window.scope)).length,
          resetKnownCount: windows.filter((window) => window.resetAt !== null).length,
          nextResetInMs: earliestReset === null ? null : Math.max(0, earliestReset - result.now),
          primarySource: primary?.source || claudeQuota.source,
          primaryAgeMs: primary && (primary.updatedAt || 0) > 0 ? Math.max(0, result.now - (primary.updatedAt || 0)) : null,
          primaryFresh: primary ? primary.freshness === 'fresh' : false,
          quotaStatus: claudeQuota.status
        }
      })
    } catch { /* diagnostics never affect the quota lane */ }
  }

  function kickClaudeQuota(now = Date.now(), trigger: ClaudeQuotaTrigger = { reason: 'timer' }) {
    if (claudeQuotaInFlight) return
    lastClaudeQuotaReadAt = now
    const laneToken = runtimeGeneration
    void refreshClaudeQuota(now, trigger).then((changed) => {
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
    const requestRefresh = (reason: string) => {
      if (disposed || !started || !claudeEnabled()) return
      kickClaudeQuota(Date.now(), { reason })
    }
    const refreshOnResume: EventListener = (event) => requestRefresh(`lifecycle-${event.type}`)
    const refreshWhenVisible: EventListener = () => {
      if (target.document?.visibilityState === 'hidden') return
      requestRefresh('lifecycle-visible')
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
    kickClaudeAppPresence()
    if (includeQuota) kickClaudeQuota(now, { reason: 'cold' })
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
    refreshTaskPresentation(next)
  }

  function updateConversationStatus(patch: Partial<Pick<ConversationSnapshotV1, 'status' | 'errorCode' | 'errorMessage'>>) {
    rawConversations = { ...rawConversations, ...patch }
    refreshTaskPresentation({ ...sourceTaskState.conversations, ...patch })
  }

  function resetConversationProjection(next = rawConversations) {
    activityExitBaselines.clear()
    rawConversations = next
    refreshTaskPresentation(next)
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

  function schedule() {
    clearTimer()
    if (!started || disposed || !shouldRun()) return
    const settings = codexState().settings
    const now = Date.now()
    const quotaWait = shouldRefreshSurfaceData() && Number.isFinite(quotaDelay(settings)) ? Math.max(1000, lastQuotaReadAt + quotaDelay(settings) - now) : Number.POSITIVE_INFINITY
    const nextTaskTransitionAt = taskPresentation.dynamic.nextTransitionAt
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
      if (taskPresentation.dynamic.nextTransitionAt !== null && taskPresentation.dynamic.nextTransitionAt <= wokeAt) {
        refreshTaskPresentation(sourceTaskState.conversations, wokeAt)
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

  async function refresh(input: { force?: boolean; forceQuota?: boolean; forceTasks?: boolean; actionPreflight?: boolean; manualQuota?: boolean } = {}) {
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
    const claudeResetDue = claudeQuota.windows.some((window) => window.resetAt !== null
      && now >= window.resetAt + 1000
      && lastClaudeQuotaReadAt < window.resetAt + 1000)
    const includeClaudeQuota = !actionPreflight && claudeEnabled()
      && (input.force === true || input.forceQuota === true || lastClaudeQuotaReadAt <= 0
        || (Number.isFinite(quotaDelay(settings)) && now - lastClaudeQuotaReadAt >= quotaDelay(settings))
        || claudeResetDue)
    if (includeClaudeQuota) {
      kickClaudeQuota(now, input.manualQuota === true
        ? { reason: 'manual', force: true }
        : lastClaudeQuotaReadAt <= 0
          ? { reason: 'cold' }
          : input.force === true || input.forceQuota === true
            ? { reason: 'force' }
            : claudeResetDue ? { reason: 'reset' } : { reason: 'timer' })
    }
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
      runtimeGeneration += 1
      refreshGeneration += 1
      inFlight = null
      inFlightIncludesThreads = false
      resetStructuralRefresh()
      resetCodexDerivedRuntimeState()
    }
    if (featureEnabled && resuming) void inspectEnvironment(true)
    if (taskPresentation.compatibility === 'degraded') {
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
    const cursorEnablementChanged = current.providers.cursor !== next.providers.cursor
    const providerEnablementChanged = codexEnablementChanged || claudeEnablementChanged || cursorEnablementChanged
    if (codexEnablementChanged) codexInventorySettled = next.providers.codex !== true
    if (claudeEnablementChanged) claudeInventorySettled = next.providers.claude !== true
    if (cursorEnablementChanged) cursorInventorySettled = next.providers.cursor !== true
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
      refreshTaskPresentation(rawConversations)
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
    if (cursorEnablementChanged) syncCursorEnablement()
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

  async function setCodexhostPath(pathValue: string) {
    const path = pathValue.trim()
    if (!path) {
      options.setMessage('请输入 codexhost 可执行文件的完整路径')
      options.notify()
      return false
    }
    const change = options.platform.codex.setCodexhostPath
    return applyLaunchPathChange(
      typeof change === 'function' ? () => change(path) : undefined,
      {
        unsupported: '当前宿主不支持手动设置 codexhost 位置，请更新插件 preload 后重试',
        success: '已保存手动 codexhost 位置；下次需要启动 Codex 时使用该位置',
        failure: '手动 codexhost 位置不可用'
      }
    )
  }

  function clearCodexhostPath() {
    const change = options.platform.codex.clearCodexhostPath
    return applyLaunchPathChange(
      typeof change === 'function' ? () => change() : undefined,
      {
        unsupported: '当前宿主不支持恢复 codexhost 自动查找，请更新插件 preload 后重试',
        success: '已恢复 codexhost 自动查找',
        failure: '无法恢复 codexhost 自动查找'
      }
    )
  }

  function republishAfterReceiptChange() {
    publishConversationProjection({ receivedAt: rawConversations.updatedAt || Date.now(), advanceScan: false, status: rawConversations.status })
    options.save()
    options.notify()
  }

  function allTasks() {
    const conversations = taskPresentation.conversations
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
    void dispatchCompanionCommand('focus', { key: nextKey }, 'task-focus', {
      ...(Number.isFinite(revisionAt) ? { revisionAt } : {})
    })
    return true
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
    if (!stopCompanionPackageListener) {
      stopCompanionPackageListener = companionKernel.subscribe(taskSnapshot.packageRevision, (value) => {
        const changed = acceptCompanionTaskPackage(value)
        if (changed && started && !disposed) options.notify()
      })
    }
    syncCompanionTaskKernel()
  }

  function acceptCompanionTaskPackage(value: CompanionTaskSnapshotV6 | null | undefined): boolean {
    if (!value
      || value.schema !== COMPANION_TASK_PACKAGE_REVISION
      || value.kernelRevision !== COMPANION_TASK_KERNEL_REVISION
      || value.registryRevision !== COMPANION_PROVIDER_REGISTRY_REVISION
      || value.topologySchemaRevision !== COMPANION_TASK_TOPOLOGY_REVISION
      || value.commandRevision !== COMPANION_TASK_COMMAND_REVISION) return false
    if (value.packageRevision <= latestKernelPackageRevision) return false
    latestKernelPackageRevision = value.packageRevision
    const knownKeys = new Set(sourceTaskState.conversations.all.map((task) => task.key))
    const missingCodexMetadata = value.complete
      && value.tasks.some((task) => task.provider === 'codex' && !knownKeys.has(task.key))
    const configurationBarrier = value.enabled !== taskSnapshot.enabled
      || value.providers.codex !== taskSnapshot.providers.codex
      || value.providers.claude !== taskSnapshot.providers.claude
      || value.providers.cursor !== taskSnapshot.providers.cursor
    // An incomplete evidence read must not erase the last complete semantic
    // package. A Kernel configuration barrier is different: disabling the
    // inbox or one Provider is itself authoritative and must clear its stale
    // cards immediately while the remaining lanes preflight again.
    if (value.complete || configurationBarrier) {
      taskSnapshot = value
      const pausedKeys = new Set(value.views.pausedKeys)
      if (pausedKeys.size) {
        const receipts = codexState().receipts.filter((receipt) => !pausedKeys.has(receipt.key))
        if (receipts.length !== codexState().receipts.length) {
          codexState().receipts = receipts
          options.save()
        }
      }
      taskPresentation = projectCompanionTaskSnapshot(value, sourceTaskState)
      companionKernel?.acknowledge({ consumer: 'main', revision: value.packageRevision })
    }
    if (missingCodexMetadata && started && !disposed) scheduleStructuralRefresh('urgent')
    return true
  }

  function syncCompanionTaskKernel(): boolean {
    if (!companionKernel || !companionKernelLease || disposed) return false
    const enabled = isFeatureEnabled() && shouldMaintainTaskData()
    companionKernel.configure?.({
      lease: companionKernelLease,
      enabled,
      providers: codexState().settings.providers,
      dynamicTaskWindowHours: codexState().settings.dynamicTaskWindowHours
    })
    // configure() returns a change flag, not a package. Always read the
    // resulting Kernel revision so provider disable/inbox disable cannot leave
    // Main and Float displaying the pre-configuration snapshot.
    const accepted = companionKernel.getLatest()
    if (!accepted) return false
    acceptCompanionTaskPackage(accepted)
    return true
  }

  function setTaskTab(tab: CodexTaskTab) {
    if (!isCodexTaskTab(tab)) return false
    codexState().lastTaskTab = normalizeCodexVisibleTaskTab(tab)
    republishAfterReceiptChange()
    return true
  }

  function setProjectCollapsed(key: string, collapsed: boolean) {
    if (!sourceTaskState.conversations.projects.some((project) => project.key === key)) return false
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
      : sourceTaskState.conversations.projects.some((project) => project.key === key)
    if (!exists) return false
    const value = alias.trim().slice(0, 120)
    const field = kind === 'task' ? 'taskAliases' : 'projectAliases'
    if (kind === 'task') {
      void dispatchCompanionCommand('set-alias', { key }, 'task-alias', { alias: value }).then((result) => {
        if (disposed) return
        if (result.outcome !== 'updated') {
          options.setMessage(result.message || '别名保存失败')
          options.notify()
          return
        }
        codexState().taskAliases = [
          ...codexState().taskAliases.filter((entry) => entry.key !== key),
          ...(value ? [{ key, alias: value }] : [])
        ].slice(-500)
        republishAfterReceiptChange()
        options.setMessage(value ? '别名已保存' : '别名已清除')
      })
      return true
    }
    codexState()[field] = [
      ...codexState()[field].filter((entry) => entry.key !== key),
      ...(value ? [{ key, alias: value }] : [])
    ].slice(-500)
    republishAfterReceiptChange()
    options.setMessage(value ? '别名已保存' : '别名已清除')
    return true
  }

  /**
   * Hand-set the phase of a task whose canonical phase is `unknown`.
   *
   * An empty phase clears it. The Kernel owns both the eligibility check and the
   * persistence order, so this only resolves the row and reports the outcome —
   * duplicating the `unknown` guard here would let the two drift apart.
   */
  function setManualPhase(key: string, phase: CodexManualPhaseValue | '') {
    const task = allTasks().find((item) => item.key === key)
    if (!task) return false
    if (!companionKernel || !companionKernelLease || !kernelOwnsTask(task.key)) return false
    void dispatchCompanionCommand('set-manual-phase', { key: task.key }, 'task-manual-phase', {
      phase,
      revisionAt: task.revisionAt
    }).then((result) => {
      if (disposed) return
      if (result.outcome !== 'updated') {
        options.setMessage(result.message || '任务状态手动指定失败')
        options.notify()
        return
      }
      options.setMessage(phase ? '已手动指定该任务状态' : '已恢复为自动判定状态')
      options.notify()
    })
    return true
  }

  function toggleLocalPin(kind: CodexLocalPin['kind'], key: string) {
    // Task rows are projected from the Kernel package, so their pin flag must be
    // committed there as well; project pins stay a Renderer-owned projection.
    // Existence is answered by the KERNEL first: the float lists tasks straight
    // from the kernel package, while this renderer's own presentation can lag
    // behind it (a hidden main window, a task discovered afterwards) — the old
    // presentation-only check silently swallowed every pin on such a task.
    const presentationTask = kind === 'task' ? allTasks().find((item) => item.key === key) : undefined
    const kernelTask = kind === 'task' && !presentationTask && companionKernel
      ? companionKernel.getLatest().tasks.find((item) => item.key === key)
      : undefined
    const task = presentationTask
      || (kernelTask ? ({ key: kernelTask.key, revisionAt: kernelTask.revisionAt } as CodexTaskCard) : undefined)
    const exists = kind === 'task'
      ? Boolean(task)
      : sourceTaskState.conversations.projects.some((project) => project.key === key && project.kind !== 'chats')
    if (!exists) {
      options.platform.diagnostics?.record?.({
        level: 'error',
        scope: 'task-action',
        event: 'set-pin-gate',
        outcome: 'blocked',
        code: 'target-not-found',
        provider: 'codex',
        taskRef: key
      })
      return false
    }
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
    if (!sourceTaskState.conversations.projects.some((project) => project.key === key && project.kind === 'project')) return false
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
    const project = sourceTaskState.conversations.projects.find((item) => item.key === key && item.actionAlias === actionAlias && item.kind === 'project')
    if (!project || sourceTaskState.conversations.completeness !== 'verified' || !sourceTaskState.conversations.sourceFingerprint || sourceFingerprint !== sourceTaskState.conversations.sourceFingerprint) {
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
    if (sourceTaskState.conversations.projects.some((item) => item.key === key)) {
      lastTaskReadAt = 0
      await refresh({ forceTasks: true })
    }
    return true
  }

  /** Builds one Provider-neutral command identity for the Host Kernel. */
  function companionOperationId(prefix: string, provided?: string) {
    if (provided && /^[a-z0-9:_-]{6,160}$/i.test(provided)) return provided
    companionCommandSequence += 1
    return `${prefix}_${Date.now().toString(36)}_${companionCommandSequence.toString(36)}`
  }

  function dispatchCompanionCommand(
    command: CompanionTaskCommandNameV1,
    selector: { key?: string; direction?: -1 | 1; attention?: 'input' | 'completed-unread' },
    source: string,
    payload: Record<string, unknown> = {},
    operationId?: string
  ) {
    if (!companionKernel) return Promise.resolve({ outcome: 'unavailable', errorCode: 'reload-required', message: 'V6 任务 Kernel 未加载，需要重新接入或重载' })
    const snapshot = companionKernel.getLatest()
    return companionKernel.dispatchCommand({
      revision: COMPANION_TASK_COMMAND_REVISION,
      operationId: companionOperationId(command, operationId),
      command,
      selector,
      source,
      expectedRevision: { snapshot: snapshot.packageRevision, topology: snapshot.topologyRevision },
      payload
    })
  }

  async function openThread(
    key: string,
    source: 'card-click' | 'manual-row-open' | 'manual-quick-jump' | 'attention-shortcut' | 'local-shortcut' | 'global-shortcut' = 'manual-row-open',
    operationId?: string
  ) {
    if (!key || disposed || !isFeatureEnabled()) return false
    if (!taskOperationsAllowed()) return rejectRuntimeMismatch()
    if (!companionKernel) {
      options.setMessage('V6 任务 Kernel 未加载，需要重新接入或重载')
      return false
    }
    const task = allTasks().find((item) => item.key === key)
    const result = await dispatchCompanionCommand('open', { key }, source, {}, operationId)
    const accepted = result.outcome === 'opened' || result.outcome === 'dispatched'
    if (disposed) return accepted
    options.setMessage(result.message || (result.outcome === 'dispatched'
      ? '已发送打开请求，等待 Codex 原生确认'
      : result.outcome === 'opened'
        ? task?.hiddenKind ? '已确认打开；任务仍在 Companion 已隐藏区' : '已确认打开 Codex 任务'
        : 'Codex 任务打开失败'))
    return accepted
  }

  function hasVerifiedTaskInventory() {
    return rawConversations.updatedAt > 0
      && lastCompleteness === 'verified'
      && /^[a-f0-9]{64}$/.test(lastSourceFingerprint)
  }

  function openFirstInput(operationId?: string, source: 'attention-shortcut' | 'local-shortcut' = 'attention-shortcut') {
    if (!taskOperationsAllowed()) return rejectRuntimeMismatch()
    void dispatchCompanionCommand('open-attention', { attention: 'input' }, source, {}, operationId).then((result) => {
      if (disposed || result.outcome === 'opened' || result.outcome === 'dispatched') return
      options.setMessage(result.message || '当前没有待输入任务')
      options.notify()
    })
    return true
  }

  function openFirstCompletedUnread(operationId?: string, source: 'attention-shortcut' | 'local-shortcut' = 'attention-shortcut') {
    if (!taskOperationsAllowed()) return rejectRuntimeMismatch()
    void dispatchCompanionCommand('open-attention', { attention: 'completed-unread' }, source, {}, operationId).then((result) => {
      if (disposed || result.outcome === 'opened' || result.outcome === 'dispatched') return
      options.setMessage(result.message || '当前没有已完成未读任务')
      options.notify()
    })
    return true
  }

  function archiveFocusedTask(operationId?: string) {
    if (!taskOperationsAllowed()) return rejectRuntimeMismatch()
    void dispatchCompanionCommand('archive', {}, 'archive-shortcut', { focused: true }, operationId).then((result) => {
      if (disposed || result.outcome === 'dispatched') return
      options.setMessage(result.message || '当前没有唯一且可归档的任务')
      options.notify()
    })
    return true
  }

  function cycleTaskFromCurrentInventory(direction: -1 | 1, operationId?: string, source: 'global-shortcut' | 'local-shortcut' = 'global-shortcut') {
    void dispatchCompanionCommand('cycle', { direction }, source, {}, operationId).then((result) => {
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
    const projects = sourceTaskState.conversations.projects.filter((project) => project.kind === 'project')
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
      projects: sourceTaskState.conversations.projects
    })
  }

  function runnerProjectForLane(laneId: string) {
    const cachedTarget = runnerTargets.get(laneId)
    if (cachedTarget) return sourceTaskState.conversations.projects.find((project) => project.key === cachedTarget.projectKey)
    const encodedProjectKey = String(laneId || '').split(':', 1)[0]
    if (!encodedProjectKey) return undefined
    let projectKey = ''
    try { projectKey = decodeURIComponent(encodedProjectKey) } catch { return undefined }
    return sourceTaskState.conversations.projects.find((project) => project.kind === 'project' && project.key === projectKey)
  }

  function reconcileActionRunnerProjectCache() {
    const currentProjects = new Map(sourceTaskState.conversations.projects
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
          const refreshed = sourceTaskState.conversations.projects.find((candidate) => candidate.kind === 'project' && candidate.key === project.key)
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
        const latest = sourceTaskState.conversations.projects.find((candidate) => candidate.kind === 'project' && candidate.key === current.key)
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
    const result = await dispatchCompanionCommand(
      paused ? 'pause' : 'resume',
      { key: task.key },
      source,
      { planLifecycleRevision: task.planLifecycleRevision }
    )
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
    const result = await dispatchCompanionCommand(
      'execute-plan',
      { key: task.key },
      source,
      { planLifecycleRevision: task.planLifecycleRevision }
    )
    if (disposed) return result.outcome === 'executed' || result.outcome === 'confirmation-required'
    const accepted = result.outcome === 'executed' || result.outcome === 'confirmation-required'
    options.setMessage(result.message || (result.outcome === 'executed' ? '已按原 Plan 启动执行' : 'Plan 执行失败'))
    options.notify()
    return accepted
  }

  /** Every root task, including Cursor, is owned by the V6 Kernel snapshot. */
  function kernelOwnsTask(key: string): boolean {
    return companionKernel ? companionKernel.getLatest().tasks.some((item) => item.key === key) : false
  }

  function commitCompanionVisibility(task: CodexTaskCard, hidden: boolean) {
    if (!companionKernel || !companionKernelLease || !kernelOwnsTask(task.key)) return false
    void dispatchCompanionCommand('set-visibility', { key: task.key }, 'task-visibility', {
      hidden,
      revisionAt: task.revisionAt
    }).then((result) => {
      if (!disposed && result.outcome !== 'updated') {
        options.setMessage(result.message || '任务显示状态更新失败')
        options.notify()
      }
    })
    return true
  }

  /** Same unified command contract as visibility; Plan-ready rows stay pinnable. */
  function companionCommandGate(key: string): string {
    if (!companionKernel) return 'kernel-missing'
    if (!companionKernelLease) return 'lease-missing'
    if (!kernelOwnsTask(key)) return 'task-unowned'
    return ''
  }

  function commitCompanionLocalPin(task: CodexTaskCard, localPin: boolean) {
    let gate = companionCommandGate(task.key)
    if (gate === 'lease-missing' || gate === 'task-unowned') {
      // A stale lease or a stale kernel view after a preload restart used to
      // eat every pin silently — the toggle returned false with no command,
      // no message and no log. One re-attach turns that into either a working
      // command or a logged gate the next diagnosis can read.
      syncCompanionTaskAuthority()
      gate = companionCommandGate(task.key)
    }
    if (gate) {
      options.platform.diagnostics?.record?.({
        level: 'error',
        scope: 'task-action',
        event: 'set-pin-gate',
        outcome: 'blocked',
        code: gate,
        provider: 'codex',
        taskRef: task.key
      })
      return false
    }
    void dispatchCompanionCommand('set-pin', { key: task.key }, 'task-pin', {
      pinned: localPin,
      revisionAt: task.revisionAt
    }).then((result) => {
      if (!disposed && result.outcome !== 'updated') {
        options.setMessage(result.message || '任务置顶状态更新失败')
        options.notify()
      }
    })
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
    const task = taskPresentation.conversations.hidden.find((item) => item.key === key && item.hiddenKind === kind)
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

  async function performTaskArchive(
    task: CodexTaskCard,
    source: 'card' | 'batch' | 'shortcut',
    operationId?: string,
    confirmationRecorded = false
  ) {
    if (!taskOperationsAllowed()) return rejectRuntimeMismatch()
    const canonical = taskSnapshot.tasks.find((item) => item.key === task.key)
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
    const result = await dispatchCompanionCommand(
      'archive',
      { key: canonical.key },
      source === 'card' ? 'archive-button' : source === 'batch' ? 'batch-archive' : 'archive-shortcut',
      { revisionAt: canonical.revisionAt, phase: canonical.phase, confirmationRecorded },
      operationId
    )
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
    taskArchive = { key: '', status: 'idle', message: '' }
    options.setMessage(provider === 'claude'
      ? 'EyPc 已归档并移除。Claude 原生侧栏同步未确认，当前不受支持。'
      : result.message || '已归档 Codex 任务')
    // The Kernel already committed the verified removal across every selector.
    // Provider inventories remain read-only metadata sources and converge on
    // their next evidence event; the Controller must not maintain a second
    // provider-specific task cache or mutate status independently.
    syncCompanionTaskAuthority()
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
    if (!task || task.archiveCapability !== 'allowed') {
      options.setMessage(task?.archiveCapability === 'blocked-stopped'
        ? '任务状态证据不足，暂不能归档'
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
    const project = sourceTaskState.conversations.projects.find((item) => item.key === key && item.actionAlias === actionAlias)
    if (!project || project.kind === 'chats' && !actionAlias || !sourceTaskState.conversations.sourceFingerprint) {
      options.setMessage('项目动作已失效，请刷新后重试')
      return false
    }
    projectArchive = { key, status: 'archiving', message: '正在分批归档项目任务' }
    options.notify()
    const result = await options.platform.codex.archiveProject(actionAlias, {
      expectedSourceFingerprint: sourceTaskState.conversations.sourceFingerprint,
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
      subscribeClaudeQuotaLifecycle()
      if (isFeatureEnabled()) void inspectEnvironment()
      syncActivation(true)
      refreshCompanionRegistrationTelemetry()
    },
    dispose() {
      disposed = true
      environmentGeneration += 1
      refreshGeneration += 1
      if (environment.checking) environment = { ...environment, checking: false }
      clearTimer()
      resetStructuralRefresh()
      resetInventoryDisappearanceCandidate()
      stopClaudeQuotaLifecycleListener?.()
      stopClaudeQuotaLifecycleListener = null
      stopCompanionPackageListener?.()
      stopCompanionPackageListener = null
      unsubscribeClaudeEvents()
      unsubscribeCursorEvents()
      if (companionKernelLease) companionKernel?.detach?.({ lease: companionKernelLease })
      companionKernelLease = 0
    },
    syncActivation,
    refresh: () => refresh({ force: true }),
    /** Manual refresh from a quota reading: both providers now, Claude bypassing its ordinary cadence. */
    async refreshQuota() {
      if (disposed || !started) return false
      kickClaudeQuota(Date.now(), { reason: 'manual', force: true })
      await refresh({ forceQuota: true, manualQuota: true })
      return true
    },
    /** Registers or removes the explicitly confirmed Claude hook/status line. */
    async setCursorRegistration(register: boolean) {
      const bridge = options.platform.cursor
      if (!bridge || typeof bridge.install !== 'function' || typeof bridge.uninstall !== 'function') {
        options.setMessage('Cursor 模块不可用')
        return false
      }
      const result = register ? await bridge.install() : await bridge.uninstall()
      if (!result?.ok) {
        options.setMessage(result?.message || (register ? 'Cursor 注册失败' : 'Cursor 注销失败'))
        return false
      }
      options.setMessage(register ? '已注册 Cursor 事件钩子' : '已移除 Cursor 事件钩子')
      await refreshCursor()
      options.notify()
      return true
    },
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
      options.notify()
      return true
    },
    inspectEnvironment: () => inspectEnvironment(true),
    setLaunchPath,
    clearLaunchPath,
    setCodexhostPath,
    clearCodexhostPath,
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
    setManualPhase,
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
        taskSnapshot,
        taskState: taskPresentation,
        taskInventory: sourceTaskState,
        conversations: taskPresentation.conversations,
        ...(options.platform.runtimeIdentityStatus ? { runtimeIdentity: options.platform.runtimeIdentityStatus } : {}),
        ...(options.platform.diagnostics?.snapshot ? { runtimeDiagnostics: options.platform.diagnostics.snapshot() } : {}),
        activityDecisionDiagnostics,
        claudeEnvironment,
        // Provider counts are task-state consumers too. Derive them from the
        // same public Kernel snapshot as cards, badges and navigation instead
        // of retaining Renderer-side provider caches as a shadow count owner.
        claudeCodeSessionCount: taskSnapshot.complete
          ? taskSnapshot.tasks.filter((task) => task.provider === 'claude').length
          : 0,
        cursorSessionCount: taskSnapshot.complete
          ? taskSnapshot.tasks.filter((task) => task.provider === 'cursor').length
          : 0,
        cursorAvailable,
        cursorInventoryReason,
        cursorHooks,
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
        taskSnapshot,
        taskInventory: sourceTaskState,
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
