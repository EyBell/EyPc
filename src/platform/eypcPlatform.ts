import { normalizeAppState } from '../domain/state'
import { normalizeMqttArchiveState } from '../domain/mqtt'
import type { AppState, FavoriteNode, FavoritePlatform, FavoriteRunnerMode, FavoriteRunRecord, KillRequest, KillResult, MqttArchiveState, MqttStorageStatus, PortProcess, RuntimeDiagnosticsSettings } from '../domain/types'
import type { LiveWindow, NativeWindowObservation, WindowActivationRequest, WindowInstanceProbeResult, WindowPlatform } from '../domain/windows'
import {
  CODEX_TASK_STATE_REVISION,
  type CodexActivityDelta,
  type CodexBridgeResult,
  type CodexEnvironmentPlatform,
  type CodexEnvironmentSnapshotV1,
  type CodexHostSnapshot,
  type CodexNewThreadRequest,
  type CodexNewThreadResult,
  type CodexProjectArchiveRequest,
  type CodexProjectArchiveResult,
  type CodexProjectRemoveRequest,
  type CodexProjectRemoveResult,
  type CodexThreadArchiveRequest,
  type CodexThreadArchiveResult,
  type CodexThreadOpenResult
} from '../domain/codex'
import type { ClaudeEnvironmentSnapshot, ClaudePlanUsageSample, ClaudeQuotaAccessSnapshot, ClaudeRateLimitsInput } from '../domain/claude'
import type { ClaudeCodePhase, ClaudeCodeStatusCorrelation } from '../domain/claudeCode'
import type {
  CodexEnvironmentActionRunResult,
  CodexEnvironmentActionSessionProjection,
  CodexEnvironmentListResult
} from '../domain/codexEnvironment'
import type {
  CodexActionRunnerActionEvent,
  CodexActionRunnerCatalogV1
} from '../domain/codexActionRunner'
import {
  COMPANION_TASK_KERNEL_REVISION,
  COMPANION_TASK_PACKAGE_REVISION,
  type CompanionTaskPackageDraftV4,
  type CompanionTaskPackageV4
} from '../domain/companionTaskPackage'

export type PickedFavoriteKind = Exclude<FavoriteNode['kind'], 'group'>
export type PickedFavorite = Pick<FavoriteNode, 'path' | 'name' | 'parentId' | 'tags' | 'color'> & { kind: PickedFavoriteKind }
export type MqttSecretMap = Record<string, string>
export type FileActionOutcome = 'success' | 'dispatched' | 'revealed-instead' | 'failed'
export type FileErrorCode = 'invalid-path' | 'not-found' | 'permission-denied' | 'no-handler' | 'timeout' | 'unsupported' | 'io-error'
export type FavoritePathStatus = 'available' | 'missing' | 'permission-denied' | 'offline' | 'invalid' | 'unknown'
export type WindowPermissionState = 'granted' | 'required' | 'unknown' | 'unsupported'
export const WINDOW_BRIDGE_REVISION = 'wj22-native-instance-space-cache'
export type WindowActivationOutcome = 'activated' | 'not-found' | 'ambiguous' | 'permission-required' | 'focus-denied' | 'unsupported' | 'failed'
export type WindowActivationReasonCode = 'space-unbound' | 'space-unbound-multiwindow' | 'space-ambiguous' | 'space-switch-timeout' | 'instance-mismatch' | 'member-mismatch' | 'identity-unavailable'
export type WindowOperationTraceStage = 'bridge' | 'space' | 'target' | 'process' | 'restore' | 'foreground' | 'raise' | 'verify' | 'topmost'
export type WindowOperationTraceOutcome = 'ok' | 'skipped' | 'not-found' | 'ambiguous' | 'failed' | 'denied' | 'unsupported' | 'unavailable'
export type WindowOperationTraceDetail =
  | 'instance-match'
  | 'instance-mismatch'
  | 'identity-unavailable'
  | 'focus-state-mismatch'
  | 'root-family-match'
  | 'ax-cg-id-match'
  | 'ax-focused-root-window'
  | 'session-cache'
  | 'direct-space-binding'
  | 'reverse-space-binding'
  | 'space-switch-confirmed'
  | 'error'

/** A bounded, sanitized native-operation trace. It is returned only when a development renderer requests it. */
export interface WindowOperationTraceStep {
  stage: WindowOperationTraceStage
  outcome: WindowOperationTraceOutcome
  detail?: WindowOperationTraceDetail
}

export interface WindowOperationTrace {
  steps: WindowOperationTraceStep[]
}

export interface WindowActivationOptions {
  debugTrace?: boolean
}

export interface FileActionResult {
  outcome: FileActionOutcome
  errorCode?: FileErrorCode
  message?: string
  paths?: string[]
}

export interface SaveTextFileInput {
  suggestedName: string
  text: string
  mimeType?: string
}

export interface SaveTextFileResult {
  outcome: 'saved' | 'cancelled' | 'failed'
  errorCode?: FileErrorCode
  message?: string
}

export interface FileCapabilities {
  platform?: FavoritePlatform | 'unsupported'
  open: boolean
  reveal: boolean
  copyPath: boolean
  copyItems: boolean
  pickFiles: boolean
  pickFolders: boolean
  listDirectory: boolean
  inspectPaths: boolean
  run?: boolean
  terminalRun?: boolean
}

export interface FavoriteRunRequest {
  targetPath: string
  executable: string
  args: string[]
  cwd: string
  mode: FavoriteRunnerMode
  favoriteId?: string
  favoriteName?: string
  declaredLogPath?: string
}

export interface FavoriteRunResult {
  outcome: 'started' | 'dispatched' | 'unsupported' | 'failed'
  errorCode?: FileErrorCode
  message?: string
  paths?: string[]
  runId?: string
  startedAt?: number
  logPath?: string
  declaredLogPath?: string
}

export interface FavoritePathInspection {
  path: string
  status: FavoritePathStatus
  kind: 'file' | 'folder' | 'other' | 'unknown'
  exists: boolean
  isSymbolicLink: boolean
  linkTargetKind?: 'file' | 'folder' | 'other' | 'missing' | 'unknown'
  size?: number
  modifiedAt?: number
  errorCode?: FileErrorCode
  error?: string
}

export interface WindowCapability {
  platform: WindowPlatform | 'unsupported'
  bridgeRevision?: string
  supported: boolean
  permission: WindowPermissionState
  canList: boolean
  canActivate: boolean
  canClose?: boolean
  /** Windows-only: keep a third-party top-level window above ordinary windows. */
  canAlwaysOnTop?: boolean
  reason?: string
}

export interface WindowListResult {
  capability: WindowCapability
  /** Raw native observations; Runtime must normalize these through the domain coalescer. */
  windows: NativeWindowObservation[]
  /** Whether this snapshot can authoritatively evict windows absent from the result. */
  completeness?: 'complete' | 'partial'
  message?: string
}

export type WindowCloseOutcome = 'closed' | 'terminated' | 'close-denied' | 'not-found' | 'ambiguous' | 'permission-required' | 'unsupported' | 'failed'

export interface WindowCloseResult {
  outcome: WindowCloseOutcome
  message?: string
}

export interface WindowActivationResult {
  outcome: WindowActivationOutcome
  /** Current bridge-verified identity, returned on success for legacy-state backfill. */
  instanceId?: string
  memberInstanceId?: string
  reasonCode?: WindowActivationReasonCode
  message?: string
  candidates?: LiveWindow[]
  trace?: WindowOperationTrace
}
const STORAGE_KEY = 'eypc/state/v1'
const MQTT_ARCHIVE_STORAGE_KEY = 'eypc/mqtt/archive/v1'
const MQTT_SECRETS_LOCAL_STORAGE_KEY = 'eypc/mqtt/secrets-local/v1'

export interface FavoriteDirectoryEntry {
  kind: Exclude<FavoriteNode['kind'], 'group'>
  name: string
  path: string
  size?: number
  modifiedAt?: number
  isSymbolicLink?: boolean
  linkTargetKind?: 'file' | 'folder' | 'other' | 'missing' | 'unknown'
}

export interface FavoriteDirectoryListResult {
  ok: boolean
  entries: FavoriteDirectoryEntry[]
  error?: string
  errorCode?: FileErrorCode
}

export interface CodexReadOptions {
  includeQuota?: boolean
  includeConfig?: boolean
  includeThreads?: boolean
}

export interface CodexFloatAction {
  actionId: string
  args: Record<string, unknown>
}

export interface CodexFloatWorkspaceDiagnostics {
  supported: boolean
  alwaysOnTop: boolean
  allWorkspaces: boolean
  visibleOnFullScreen: boolean
  checkedAt: number
  errorCode?: string
  health?: {
    alive: boolean
    persistent: boolean
    lastHeartbeatAt: number
    lastRecreateAt: number
    recoveryDeadline: number
    interaction: 'idle' | 'drag' | 'resize'
  }
}

export interface ClaudeBridgeSnapshot {
  version: 1
  revision: string
  /** Compatibility field; current Code inventory uses `readCodeSnapshot`. */
  sessions: []
  truncated: boolean
  quota: { rateLimits: ClaudeRateLimitsInput; updatedAt: number } | null
  readAt: number
}

export interface ClaudeRegistrationResult {
  ok: boolean
  hooks?: string
  statusline?: string
  message?: string
}

export interface ClaudeOpenResult {
  outcome: 'opened' | 'dispatched' | 'unavailable' | 'failed'
  confirmsRead: boolean
  message?: string
}

export interface ClaudeArchiveResult {
  outcome: 'archived' | 'failed' | 'indeterminate'
  message?: string
  errorCode?: string
  alreadyArchived?: boolean
}

export interface CompanionTaskMutationDelta {
  version: 1
  revision: 'claude-task-mutation-delta-v1'
  provider: 'claude'
  generation: number
  acceptedAt: number
  mutations: Array<{
    key: string
    mutation: 'remove' | 'upsert' | 'archived'
    acceptedAt: number
    session?: ClaudeCodeBridgeSession
  }>
}

/** One privacy-safe Claude App Code-mode session observation. */
export interface ClaudeCodeBridgeSession {
  sessionId: string
  cliSessionId: string
  title: string
  cwd: string
  originCwd: string
  /** Opaque fingerprint using the same normalized-root algorithm as Codex projects. */
  projectKey?: string
  createdAt: number
  lastActivityAt: number
  lastFocusedAt: number
  model: string
  isArchived: boolean
  completedTurns: number
  metadataUpdatedAt: number
  statusCorrelation: ClaudeCodeStatusCorrelation
  stateSource: 'app-log' | 'hook' | 'metadata-history' | 'none'
  stateCompatibility: 'compatible' | 'fallback' | 'unsupported'
  stateGeneration: number
  phase: ClaudeCodePhase
  phaseUpdatedAt: number
  turnStartedAt: number
  hookActivityAt: number
  waitingApprovalAt: number
  waitingInputAt: number
  lastStopAt: number
  lastSessionEndAt: number
}

export interface ClaudeCodeBridgeSnapshot {
  version: 2
  revision: string
  sessions: ClaudeCodeBridgeSession[]
  /** False means the scan was incomplete/unreadable and must not replace a hot cache. */
  available?: boolean
  truncated: boolean
  readAt: number
  /** Compatibility aliases retained for a long-lived preload/Renderer pair. */
  stateGeneration?: number
  stateCompatibility?: 'compatible' | 'fallback' | 'unsupported'
}

export type ClaudeCodeStateDeltaSource = 'app-log' | 'hook' | 'metadata-history' | 'mixed' | 'none'

/** State-only V2 payload. Inventory identity and unread/quota are not part of this authority. */
export interface ClaudeCodeStateDeltaV2 extends ClaudeCodeBridgeSnapshot {
  version: 2
  generation: number
  source: ClaudeCodeStateDeltaSource
  freshness: {
    readAt: number
    newestEvidenceAt: number
  }
  compatibility: 'compatible' | 'fallback' | 'unsupported'
}

export interface ClaudeAppPresenceSnapshot {
  status: 'running' | 'closed' | 'unknown'
  pid: number
  appId: string
  instanceId: string
  startToken: string
  verifiedAt: number
}

export type CompanionNavigationProviderId = 'codex' | 'claude' | 'cursor'
export const COMPANION_NAVIGATION_REVISION = 'companion-navigation-v4'
export const COMPANION_TASK_ACTIONS_REVISION = 'companion-task-actions-v2'

export interface RuntimeIdentityExpectationV1 {
  hostAssetId: string
  rendererAssetId: string
  kernelRevision: string
  taskPackageRevision: string
}

export interface RuntimeIdentityHandshakeV1 {
  revision: 'runtime-identity-v1'
  status: 'host-loaded' | 'reload-required'
  expected: RuntimeIdentityExpectationV1
  actual: RuntimeIdentityExpectationV1
  kernelRevision: string
  taskPackageRevision: string
  message: string
  errorCode?: string
}

export interface RuntimeIdentityBridgeV1 {
  revision: string
  get?(): unknown
  handshake(input: RuntimeIdentityExpectationV1): RuntimeIdentityHandshakeV1
}

export interface CompanionNavigationTarget {
  key: string
  provider: CompanionNavigationProviderId
  actionAlias: string
}

export interface CompanionTaskActionTarget extends CompanionNavigationTarget {
  revisionAt: number
  phase: string
  canArchive: boolean
  planReady: boolean
  planLifecycleRevision: number
  paused: boolean
  canPause: boolean
  canResume: boolean
  canExecutePlan: boolean
  archiveRequest?: {
    expectedUpdatedAt: number
    expectedRevisionAt: number
    expectedCompletionAt?: number
    expectedLastTurnStartedAt: number
    expectedSourceFingerprint: string
    evidence: 'completed' | 'stopped'
  }
}

export interface CompanionTaskActionsBridge {
  revision: string
  sync(input: {
    enabled: boolean
    providers: { codex: boolean; claude: boolean }
    ready: boolean
    targets: CompanionTaskActionTarget[]
    focusedKey?: string
    attentionKeys?: string[]
  }): boolean
  inspect?(provider: CompanionNavigationProviderId): Promise<unknown>
  open(input: {
    key: string
    source: string
    operationId?: string
    target?: CompanionTaskActionTarget
  }): Promise<CompanionNavigationResult>
  archive(input: {
    key: string
    revisionAt: number
    phase: string
    source: string
    operationId?: string
    confirmationRecorded?: boolean
    target?: CompanionTaskActionTarget
  }): Promise<{
    outcome: 'confirmation-required' | 'archived' | 'failed' | 'indeterminate'
    provider?: CompanionNavigationProviderId
    key?: string
    errorCode?: string
    message?: string
    alreadyArchived?: boolean
    operationId?: string
  }>
  /** Uses the same process-owned five-second confirmation as the hot mainHide path. */
  shortcutArchive(): boolean
  diagnostics(): {
    revision: string
    enabled: boolean
    ready: boolean
    targetCount: number
    archiveInFlight: number
    confirmationPending: boolean
  }
}

export interface CompanionNavigationResult {
  outcome: 'opened' | 'dispatched' | 'unavailable' | 'failed'
  provider?: CompanionNavigationProviderId
  key?: string
  errorCode?: string
  message?: string
  confirmsRead?: boolean
  operationId?: string
}

export interface CompanionNavigationDiagnostics {
  revision: string
  enabled: boolean
  ready: boolean
  enabledProviderCount: number
  targetCount: number
  cycleCount: number
  pendingCycle: boolean
  directQueueDepth: number
  dispatchInFlight: boolean
  maxConcurrent: number
  replacedCount: number
  acceptedCycleCount: number
  dispatched: { codex: number; claude: number }
  pendingResultCount: number
  lastOutcome: string
}

export interface CompanionNavigationResultEvent {
  id: number
  provider: CompanionNavigationProviderId
  key: string
  source?: string
  outcome: 'opened' | 'dispatched'
  operationId?: string
  at: number
}

export type CompanionTaskIntentV4 =
  | { action: 'cycle'; direction: -1 | 1; source?: string; operationId?: string }
  | { action: 'open'; key: string; expectedActionAlias?: string; source?: string; operationId?: string }
  | { action: 'open-attention'; kind: 'input' | 'completed-unread'; source?: string; operationId?: string }
  | { action: 'archive-focused'; source?: string; operationId?: string }
  | { action: 'archive'; key: string; revisionAt: number; phase: string; source: string; operationId?: string; confirmationRecorded?: boolean }
  | { action: 'pause'; key: string; planLifecycleRevision: number; source?: string; operationId?: string }
  | { action: 'resume'; key: string; planLifecycleRevision: number; source?: string; operationId?: string }
  | { action: 'execute-plan'; key: string; planLifecycleRevision: number; source?: string; operationId?: string }

/** @deprecated Compatibility alias for callers compiled before task-state-v10. */
export type CompanionTaskIntentV3 = CompanionTaskIntentV4

export interface CompanionTaskKernelBridge {
  revision: typeof COMPANION_TASK_KERNEL_REVISION
  packageRevision: typeof COMPANION_TASK_PACKAGE_REVISION
  attach(input: { enabled: boolean; providers: { codex: boolean; claude: boolean }; dynamicTaskWindowHours?: number }): {
    revision: typeof COMPANION_TASK_KERNEL_REVISION
    packageRevision: typeof COMPANION_TASK_PACKAGE_REVISION
    lease: number
    retained: boolean
    ready: boolean
    package: CompanionTaskPackageV4
  }
  configure?(input: { lease: number; enabled: boolean; providers: { codex: boolean; claude: boolean }; dynamicTaskWindowHours?: number; focusedKey?: string }): CompanionTaskPackageV4 | null
  /**
   * Local hide/restore authority. Commits without a Provider read, so ordinary
   * visibility keeps working while Codex/Claude is not running.
   */
  setVisibility?(input: { lease: number; key: string; revisionAt?: number; hidden: boolean }): CompanionTaskPackageV4 | null
  /** Local pin authority; unlike hide it stays available for Plan-ready rows. */
  setLocalPin?(input: { lease: number; key: string; revisionAt?: number; localPin: boolean }): CompanionTaskPackageV4 | null
  /**
   * Open-only auxiliary providers (cursor). Rows join the process-owned
   * previous/next cycle and open targets without entering the canonical
   * package; the kernel rederives tier and dynamic eligibility itself.
   */
  publishAuxiliaryCycleTasks(input: {
    provider: 'cursor'
    tasks: Array<{
      key: string
      actionAlias: string
      revisionAt: number
      phase: string
      lastQuestionAt?: number
      createdAt?: number
      statusEnteredAt?: number
      turnStartedAt?: number
      terminalAt?: number
      localPin?: boolean
    }>
  }): boolean
  /** @deprecated Renderer drafts are not a production authority in V4. */
  syncPackage?(input: { lease: number; draft: CompanionTaskPackageDraftV4 }): CompanionTaskPackageV4 | null
  detach?(input: { lease: number }): boolean
  dispatch(input: CompanionTaskIntentV4): Promise<CompanionNavigationResult | {
    outcome: 'confirmation-required' | 'archived' | 'paused' | 'resumed' | 'executed' | 'failed' | 'indeterminate'
    provider?: CompanionNavigationProviderId
    key?: string
    errorCode?: string
    message?: string
    alreadyArchived?: boolean
    operationId?: string
  }>
  /** @deprecated Use getLatest(). */
  getPackage?(): CompanionTaskPackageV4
  getLatest(): CompanionTaskPackageV4
  subscribe(afterRevision: number, listener: (value: CompanionTaskPackageV4) => void): () => void
  onPackage?(listener: (value: CompanionTaskPackageV4) => void): () => void
  onResult?(listener: (event: CompanionNavigationResultEvent) => void): () => void
  takeResults?(input: { lease: number }): CompanionNavigationResultEvent[]
  diagnostics(): {
    revision: string
    packageRevision: string
    enabled: boolean
    ready: boolean
    packageGeneration: number
    taskCount: number
    cycleCount: number
    auxiliaryTaskCount?: number
    codexBranchParentCount: number
    codexBranchCount: number
    preflightInFlight: boolean
    freshness: string
  }
}

export interface CompanionNavigationBridge {
  revision: string
  begin(input: { enabled: boolean; providers: { codex: boolean; claude: boolean } }): {
    revision: string
    lease: number
    retained: boolean
    ready: boolean
  }
  sync(input: {
    lease: number
    enabled: boolean
    providers: { codex: boolean; claude: boolean }
    ready: boolean
    targets: CompanionNavigationTarget[]
    cycleKeys: string[]
  }): boolean
  detach?(input: { lease: number }): boolean
  cycle(direction: -1 | 1, input?: { operationId?: string; source?: string }): Promise<CompanionNavigationResult>
  open(input: {
    key: string
    source: string
    operationId?: string
    target?: CompanionNavigationTarget
  }): Promise<CompanionNavigationResult>
  onResult?(listener: (event: CompanionNavigationResultEvent) => void): () => void
  takeResults?(input: { lease: number }): CompanionNavigationResultEvent[]
  diagnostics(): CompanionNavigationDiagnostics
}

export interface RuntimeDiagnosticEventV3 {
  v: 2 | 3
  at: number
  iso: string
  seq: number
  sessionId: string
  processId: number
  level: 'error' | 'info' | 'debug'
  scope: string
  event: string
  outcome: string
  code?: string
  errorCode?: string
  durationMs?: number
  count?: number
  cache?: string
  provider?: string
  phase?: string
  reason?: string
  evidence?: string
  taskRef?: string
  operationId?: string
  traceId?: string
  source?: string
  beforePhase?: string
  afterPhase?: string
  beforeUnread?: boolean
  afterUnread?: boolean
  turnStartedAt?: number
  statusEnteredAt?: number
  terminalAt?: number
  observationGeneration?: number
  semanticRevision?: number
  packageRevision?: number
  details?: Record<string, unknown>
}

export interface RuntimeDiagnosticInputV3 {
  level: 'error' | 'info' | 'debug'
  scope: string
  event: string
  outcome: string
  code?: string
  errorCode?: string
  durationMs?: number
  count?: number
  cache?: string
  provider?: string
  phase?: string
  reason?: string
  evidence?: string
  taskRef?: string
  operationId?: string
  traceId?: string
  source?: string
  beforePhase?: string
  afterPhase?: string
  beforeUnread?: boolean
  afterUnread?: boolean
  turnStartedAt?: number
  statusEnteredAt?: number
  terminalAt?: number
  observationGeneration?: number
  semanticRevision?: number
  packageRevision?: number
  details?: Record<string, unknown>
}

export interface RuntimeDiagnosticsSnapshotV3 {
  revision: 'eypc-runtime-diagnostics-v3'
  status: 'ok' | 'degraded' | 'disabled' | 'unavailable'
  updatedAt: number
  sessionId: string
  processId: number
  settings: RuntimeDiagnosticsSettings
  directory: string
  activeFile: string
  totals: { events: number; filtered: number; debug: number; info: number; error: number; slow: number; writeFailures: number }
  storage: { fileCount: number; totalBytes: number; maxFileBytes: number; maxTotalBytes: number; retentionDays: number }
  recent: RuntimeDiagnosticEventV3[]
}

export interface RuntimeDiagnosticsClearResultV3 {
  outcome: 'cleared' | 'partial' | 'empty' | 'failed' | 'unavailable'
  removedFiles: number
  failedFiles: number
  remainingFiles: number
  remainingBytes: number
}

export interface EypcPlatformApi {
  runtimeIdentity?: RuntimeIdentityBridgeV1
  /** Renderer-owned result of the Main/Preload identity handshake. */
  runtimeIdentityStatus?: RuntimeIdentityHandshakeV1
  diagnostics?: {
    revision: 'eypc-runtime-diagnostics-v3'
    snapshot(): RuntimeDiagnosticsSnapshotV3
    record(input: RuntimeDiagnosticInputV3): RuntimeDiagnosticEventV3 | null
    configure(settings: RuntimeDiagnosticsSettings): RuntimeDiagnosticsSnapshotV3
    openDirectory(): Promise<FileActionResult>
    openFile?(): Promise<FileActionResult>
    clear?(): RuntimeDiagnosticsClearResultV3
  }
  storage: {
    getState(): AppState
    setState(state: AppState): boolean
    getMqttArchive(): MqttArchiveState
    setMqttArchive(archive: MqttArchiveState): boolean
    getMqttStorageStatus(): MqttStorageStatus
    getMqttSecrets(): MqttSecretMap
    setMqttSecrets(secrets: MqttSecretMap): boolean
  }
  ports: {
    scan(): Promise<PortProcess[]>
    kill(request: KillRequest): Promise<KillResult>
  }
  windows: {
    capabilities(): Promise<WindowCapability>
    list(): Promise<WindowListResult>
    /** Exact native-instance liveness probe. Inventory absence is not closure evidence. */
    probeInstance?(window: LiveWindow): Promise<WindowInstanceProbeResult>
    activate(request: WindowActivationRequest, options?: WindowActivationOptions): Promise<WindowActivationResult>
    /** Sets a real Windows topmost z-order; unsupported on macOS instead of pretending to persist it. */
    alwaysOnTop?(window: LiveWindow, options?: WindowActivationOptions): Promise<WindowActivationResult>
    close?(window: LiveWindow): Promise<WindowCloseResult>
    terminate?(window: LiveWindow): Promise<WindowCloseResult>
    openPermissionSettings?(): Promise<boolean>
  }
  files: {
    capabilities?: FileCapabilities
    open(path: string): Promise<FileActionResult>
    run?(request: FavoriteRunRequest): Promise<FavoriteRunResult>
    /** Newest-first background run history for this plugin process. Local-only, never synced. */
    listRuns?(limit?: number): FavoriteRunRecord[]
    /** Fires when a run starts or ends; returns a disposer. */
    watchRuns?(listener: () => void): () => void
    reveal(path: string): Promise<FileActionResult>
    copyPath(path: string): Promise<FileActionResult>
    copyItems?(paths: string[]): Promise<FileActionResult>
    inspectPaths?(paths: string[]): Promise<FavoritePathInspection[]>
    pickFavorite?(): Promise<PickedFavorite | null>
    pickFavorites?(kind: PickedFavoriteKind): Promise<PickedFavorite[]>
    listDirectory(path: string): Promise<FavoriteDirectoryListResult>
    saveTextFile(input: SaveTextFileInput): Promise<SaveTextFileResult>
  }
  clipboard: {
    copyText(text: string): Promise<boolean>
  }
  codex: {
    /** Missing on older long-lived preload instances; the adapter normalizes that case to `legacy`. */
    taskStateRevision?: string
    /** Missing on older long-lived preload instances; Action execution must fail closed in that case. */
    actionRuntimeRevision?: string
    inspectEnvironment(): Promise<CodexEnvironmentSnapshotV1>
    setLaunchPath?(path: string): Promise<CodexEnvironmentSnapshotV1>
    clearLaunchPath?(): Promise<CodexEnvironmentSnapshotV1>
    readSnapshot(options?: CodexReadOptions): Promise<CodexBridgeResult<CodexHostSnapshot>>
    readActivitySnapshot?(options?: { phaseOnly?: boolean }): Promise<CodexBridgeResult<CodexActivityDelta>>
    onActivityChanged?(listener: (delta: CodexActivityDelta) => void): () => void
    openThread(actionAlias: string): Promise<CodexThreadOpenResult>
    createThread?(request: CodexNewThreadRequest): Promise<CodexNewThreadResult>
    openBlank?(): Promise<CodexThreadOpenResult>
    archiveThread?(actionAlias: string, request: CodexThreadArchiveRequest): Promise<CodexThreadArchiveResult>
    archiveProject?(actionAlias: string, request: CodexProjectArchiveRequest): Promise<CodexProjectArchiveResult>
    removeProject?(actionAlias: string, request: CodexProjectRemoveRequest): Promise<CodexProjectRemoveResult>
    listProjectEnvironments?(targetAlias: string): Promise<CodexEnvironmentListResult> | CodexEnvironmentListResult
    runProjectAction?(request: {
      targetAlias: string
      targetId: string
      projectKey?: string
      projectName?: string
      environmentId: string
      environmentName?: string
      actionId: string
      actionName?: string
      confirmToken?: string
      stopIfRunning?: boolean
      restartIfRunning?: boolean
    }): Promise<CodexEnvironmentActionRunResult>
    listActionSessions?(): Promise<CodexEnvironmentActionSessionProjection[]> | CodexEnvironmentActionSessionProjection[]
    stopActionSession?(request: {
      targetId: string
      projectKey?: string
      environmentId: string
      actionId: string
    }): Promise<CodexEnvironmentActionRunResult>
    setActionRunArchived?(request: { runId: string; archived: boolean }): Promise<{ ok: boolean; message?: string }>
    close(options?: { preserveDesktop?: boolean }): void
  }
  /**
   * Claude companion provider. Optional because an older long-lived preload can
   * still be alive while a newer renderer loads; every consumer must treat an
   * absent port as "Claude unavailable" rather than as an error.
   */
  claude?: {
    inspect(): Promise<ClaudeEnvironmentSnapshot> | ClaudeEnvironmentSnapshot
    readSnapshot(options?: { now?: number; windowMs?: number }): Promise<ClaudeBridgeSnapshot> | ClaudeBridgeSnapshot
    /**
     * Authorized Claude App quota read. `enabled` is the hard access gate;
     * coldStart/supplement describe urgency and never bypass that gate.
     */
    readQuotaFallback?(options?: { enabled?: boolean; coldStart?: boolean; supplement?: boolean; now?: number; minStaleMs?: number; refreshIntervalMs?: number }): Promise<{ rateLimits: ClaudeRateLimitsInput; updatedAt: number } | null>
    /**
     * Drains the first semantic Hook append from the process-owned native file
     * callback; duplicate tails are fingerprint no-ops. Native StatWatcher
     * recovery is bounded by `recoveryPollMs` and does not depend on Renderer
     * timers while uTools keeps the Main WebContents hidden.
     */
    watchEvents?(listener: () => void, options?: { coalesceMs?: number; recoveryPollMs?: number }): () => void
    readCodeSnapshot?(options?: { now?: number; windowMs?: number }): Promise<ClaudeCodeBridgeSnapshot> | ClaudeCodeBridgeSnapshot
    /** State-only hot projection over the bridge's feature-lifetime inventory cache. */
    readCodeStateSnapshot?(options?: { now?: number }): Promise<ClaudeCodeStateDeltaV2> | ClaudeCodeStateDeltaV2
    watchCodeState?(listener: () => void, options?: { coalesceMs?: number; recoveryPollMs?: number }): () => void
    watchCodeSessions?(listener: (delta?: CompanionTaskMutationDelta) => void): () => void
    readCodeUnread?(): Promise<
      | { version: 1; revision: string; ids: string[]; readAt: number }
      | { version: 2; revision: string; ids: string[]; readAt: number; generation: number; sourceFingerprint: string }
      | null
    >
    watchCodeUnread?(listener: () => void): () => void
    /**
     * Latest quota sample the desktop app recorded for itself. Credential-free
     * and independent of the status line, so it keeps the reading moving at the
     * app's own cadence. Null when the app has never written one.
     */
    readPlanUsage?(): Promise<ClaudePlanUsageSample | null> | ClaudePlanUsageSample | null
    readAppPresence?(): Promise<ClaudeAppPresenceSnapshot> | ClaudeAppPresenceSnapshot
    install(options?: { statusline?: boolean }): Promise<ClaudeRegistrationResult> | ClaudeRegistrationResult
    uninstall(): Promise<ClaudeRegistrationResult> | ClaudeRegistrationResult
    /**
     * Opens one existing App Code history row by exact local id. The bridge
     * refuses CLI ids and refuses to dispatch unless App-running is proven.
     */
    openTask(sessionId: string): Promise<ClaudeOpenResult>
    /** Single-target Claude App metadata archive transaction (structural revalidation, not version-gated). */
    archiveCodeSession?(sessionId: string): Promise<ClaudeArchiveResult>
    diagnostics(): { revision: string; loaded: boolean; loadError: string; quotaAccess?: ClaudeQuotaAccessSnapshot }
    close(): void
  }
  /**
   * Cursor Agent companion. Optional so an older preload degrades this lane
   * alone. Hook install/watch are feature-detected; `openTask` dispatches the
   * `agent?id=<composerId>` deep link and reports `dispatched`, never a read.
   * `archiveTask` mirrors the App's own archive bit on one header row after
   * re-verifying the task carries no live evidence.
   */
  cursor?: {
    inspect(): Promise<{ available: boolean; reason: string; sessionCount?: number; readAt?: number; hooks?: string }> | { available: boolean; reason: string; sessionCount?: number; readAt?: number; hooks?: string }
    readInventory(): Promise<{
      revision: string
      available: boolean
      reason: string
      sessions: Array<Record<string, unknown>>
      truncated: boolean
      readAt: number
    }> | {
      revision: string
      available: boolean
      reason: string
      sessions: Array<Record<string, unknown>>
      truncated: boolean
      readAt: number
    }
    readHookState?(): Array<{ sessionId: string; phase: string; turnOpen: boolean; lastEventAt: number }>
    watchEvents?(listener: () => void, options?: { coalesceMs?: number; recoveryPollMs?: number }): () => void
    watchInventory?(listener: () => void): () => void
    install?(): Promise<ClaudeRegistrationResult> | ClaudeRegistrationResult
    uninstall?(): Promise<ClaudeRegistrationResult> | ClaudeRegistrationResult
    openTask(composerId: string): Promise<ClaudeOpenResult>
    archiveTask?(composerId: string): Promise<ClaudeArchiveResult>
    diagnostics(): { revision: string; loaded: boolean; loadError: string }
    close(): void
  }
  /**
   * Process-lifetime cross-provider navigation. Optional so a newer Renderer
   * can fail closed while an older uTools preload is still alive.
   */
  companionNavigation?: CompanionNavigationBridge
  companionTasks?: CompanionTaskActionsBridge
  /** Unified process-owned authority used by current Main, Float and shortcuts. */
  companionKernel?: CompanionTaskKernelBridge
  float: {
    sync(payload: { visible: boolean; snapshot?: unknown; position?: unknown; expandedSizes?: unknown }): boolean
    activate?(payload?: { command?: 'new-thread' | 'quick' }): boolean
    diagnostics?(): CodexFloatWorkspaceDiagnostics
    resetGeometry?(payload?: { position?: unknown; expandedSizes?: unknown }): boolean
    close(): void
    onAction(listener: (action: CodexFloatAction) => void): () => void
  }
  actionRunner?: {
    syncCatalog(catalog: CodexActionRunnerCatalogV1): boolean
    activate?(payload?: { laneId?: string }): boolean
    readPreference?(): { selectedLaneId: string }
    updatePreference?(payload: {
      pinned?: boolean
      view?: 'records' | 'archived'
      selectedLaneId?: string
      runtime?: { projectKey: string; mode: 'auto' | 'manual'; candidateId?: string }
    }): boolean
    close(): void
    onAction(listener: (action: CodexActionRunnerActionEvent) => void): () => void
  }
  app: {
    hide(): Promise<boolean> | boolean
    show?(): boolean
    configureHotkey?(commandLabel: string): boolean
  }
  getEnterPayload(): { code?: string } | null
  clearEnterPayload(): void
  onEnterPayload?(listener: (payload: { code?: string } | null) => void): () => void
}

export function normalizeFileActionResult(value: unknown, failedErrorCode: FileErrorCode = 'io-error'): FileActionResult {
  if (value && typeof value === 'object' && 'outcome' in value && ['success', 'dispatched', 'revealed-instead', 'failed'].includes(String((value as { outcome?: unknown }).outcome))) {
    return value as FileActionResult
  }
  if (value === true) return { outcome: 'dispatched', message: 'legacy host reported dispatch only' }
  return { outcome: 'failed', errorCode: failedErrorCode }
}

const FAVORITE_RUN_STATUSES = ['running', 'exited', 'failed', 'stopped']

/**
 * Bridge payloads are untrusted shapes. A malformed row is dropped rather than rendered,
 * so a bad host can degrade the run list to empty but never inject partial records.
 */
export function normalizeFavoriteRunRecords(value: unknown): FavoriteRunRecord[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const source = item as Record<string, unknown>
    const runId = typeof source.runId === 'string' ? source.runId : ''
    const status = typeof source.status === 'string' && FAVORITE_RUN_STATUSES.includes(source.status)
      ? source.status as FavoriteRunRecord['status']
      : null
    const startedAt = typeof source.startedAt === 'number' && Number.isFinite(source.startedAt) ? source.startedAt : 0
    if (!runId || !status || startedAt <= 0) return []
    const args = Array.isArray(source.args) ? source.args.filter((entry): entry is string => typeof entry === 'string') : []
    const optionalNumber = (key: 'endedAt' | 'exitCode' | 'logBytes') =>
      typeof source[key] === 'number' && Number.isFinite(source[key]) ? { [key]: source[key] as number } : {}
    const optionalText = (key: 'signal' | 'logPath' | 'declaredLogPath' | 'message') =>
      typeof source[key] === 'string' && source[key] ? { [key]: source[key] as string } : {}
    return [{
      runId,
      favoriteId: typeof source.favoriteId === 'string' ? source.favoriteId : '',
      favoriteName: typeof source.favoriteName === 'string' ? source.favoriteName : '',
      mode: source.mode === 'terminal' ? 'terminal' as const : 'background' as const,
      status,
      startedAt,
      executable: typeof source.executable === 'string' ? source.executable : '',
      args,
      cwd: typeof source.cwd === 'string' ? source.cwd : '',
      ...optionalNumber('endedAt'),
      ...optionalNumber('exitCode'),
      ...optionalNumber('logBytes'),
      ...optionalText('signal'),
      ...optionalText('logPath'),
      ...optionalText('declaredLogPath'),
      ...optionalText('message'),
      ...(source.logTruncated === true ? { logTruncated: true } : {}),
      ...(typeof source.declaredLogExists === 'boolean' ? { declaredLogExists: source.declaredLogExists } : {})
    }]
  })
}

export function normalizeFavoriteRunResult(value: unknown): FavoriteRunResult {
  if (value && typeof value === 'object' && 'outcome' in value && ['started', 'dispatched', 'unsupported', 'failed'].includes(String((value as { outcome?: unknown }).outcome))) {
    return value as FavoriteRunResult
  }
  return { outcome: 'failed', errorCode: 'io-error', message: 'invalid runner result' }
}

function errorCodeFromUnknown(error: unknown): FileErrorCode {
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code || '') : ''
  if (code === 'ENOENT') return 'not-found'
  if (code === 'EACCES' || code === 'EPERM') return 'permission-denied'
  if (code === 'ETIMEDOUT') return 'timeout'
  if (code === 'ENOTSUP' || code === 'ENOSYS') return 'unsupported'
  return 'io-error'
}

async function callFileAction(call: (() => Promise<unknown>) | undefined, unsupportedMessage: string): Promise<FileActionResult> {
  if (!call) return { outcome: 'failed', errorCode: 'unsupported', message: unsupportedMessage }
  try {
    return normalizeFileActionResult(await call())
  } catch (error) {
    return {
      outcome: 'failed',
      errorCode: errorCodeFromUnknown(error),
      message: error instanceof Error ? error.message : unsupportedMessage
    }
  }
}

function normalizeSaveTextFileResult(value: unknown): SaveTextFileResult {
  if (value && typeof value === 'object' && 'outcome' in value) {
    const outcome = String((value as { outcome?: unknown }).outcome)
    if (outcome === 'saved' || outcome === 'cancelled' || outcome === 'failed') return value as SaveTextFileResult
  }
  return { outcome: 'failed', errorCode: 'io-error', message: 'save text file failed' }
}

async function callSaveTextFile(call: (() => Promise<unknown>) | undefined): Promise<SaveTextFileResult> {
  if (!call) return { outcome: 'failed', errorCode: 'unsupported', message: 'save text file unavailable' }
  try {
    return normalizeSaveTextFileResult(await call())
  } catch (error) {
    return {
      outcome: 'failed',
      errorCode: errorCodeFromUnknown(error),
      message: error instanceof Error ? error.message : 'save text file failed'
    }
  }
}

function unknownInspection(path: string, errorCode: FileErrorCode = 'unsupported', error = 'path inspection unavailable'): FavoritePathInspection {
  return { path, status: 'unknown', kind: 'unknown', exists: false, isSymbolicLink: false, errorCode, error }
}

function inferLegacyHostPlatform(): CodexEnvironmentPlatform {
  const candidate = typeof window !== 'undefined'
    ? window.navigator as Navigator & { userAgentData?: { platform?: string } }
    : undefined
  const hint = [candidate?.userAgentData?.platform, candidate?.platform, candidate?.userAgent]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
  if (/windows?|win32|win64/i.test(hint)) return 'windows'
  if (/macintosh|mac\s?os|macintel|darwin/i.test(hint)) return 'macos'
  return 'unsupported'
}

function legacyHostCodexEnvironment(): CodexEnvironmentSnapshotV1 {
  const platform = inferLegacyHostPlatform()
  return {
    version: 1,
    checking: false,
    platform,
    // The bridge capability is present, but CLI readiness stays unverified until
    // the first App Server round-trip succeeds.
    runtimeState: platform === 'unsupported' ? 'unsupported' : 'missing',
    runtimeSource: 'unknown',
    processState: 'unknown',
    configState: 'unknown',
    connectionState: 'not-checked',
    desktopBridgeState: 'not-checked',
    launchMode: 'legacy-fallback',
    manualLaunchPathState: 'unavailable',
    launchCandidates: [],
    statusFeedMode: 'connector-fallback',
    checkedAt: Date.now()
  }
}

function unsupportedCodexEnvironment(): CodexEnvironmentSnapshotV1 {
  return {
    version: 1,
    checking: false,
    platform: 'unsupported',
    runtimeState: 'unsupported',
    runtimeSource: 'unknown',
    processState: 'unknown',
    configState: 'unknown',
    connectionState: 'not-checked',
    desktopBridgeState: 'not-checked',
    launchMode: 'unknown',
    manualLaunchPathState: 'unavailable',
    launchCandidates: [],
    statusFeedMode: 'unavailable',
    checkedAt: Date.now()
  }
}

function unsupportedWindowCapability(reason = '当前宿主不支持窗口跳转'): WindowCapability {
  return {
    platform: 'unsupported',
    supported: false,
    permission: 'unsupported',
    canList: false,
    canActivate: false,
    canClose: false,
    reason
  }
}

function unsupportedWindowList(reason?: string): WindowListResult {
  return { capability: unsupportedWindowCapability(reason), windows: [], completeness: 'partial', ...(reason ? { message: reason } : {}) }
}

declare global {
  interface Window {
    eypcPlatform?: EypcPlatformApi
  }
}

const memory = {
  state: normalizeAppState(null),
  mqttSecrets: {} as MqttSecretMap,
  enterPayload: null as { code?: string } | null
}

function normalizeMqttSecrets(value: unknown): MqttSecretMap {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const candidate = source.version === 1 && source.secrets && typeof source.secrets === 'object'
    ? source.secrets as Record<string, unknown>
    : source
  return Object.fromEntries(
    Object.entries(candidate)
      .map(([key, secret]) => [key.trim(), secret] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[0]) && typeof entry[1] === 'string' && entry[1].length > 0)
  )
}

function readFallbackState(): AppState {
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) return normalizeAppState(JSON.parse(raw))
    } catch {}
  }
  return memory.state
}

function readFallbackMqttArchive(): MqttArchiveState {
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(MQTT_ARCHIVE_STORAGE_KEY)
      if (raw) return normalizeMqttArchiveState(JSON.parse(raw))
    } catch {}
  }
  return normalizeMqttArchiveState(null)
}

function readFallbackMqttSecrets(): MqttSecretMap {
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(MQTT_SECRETS_LOCAL_STORAGE_KEY)
      if (raw) return normalizeMqttSecrets(JSON.parse(raw))
    } catch {}
  }
  return { ...memory.mqttSecrets }
}

function writeFallbackState(state: AppState): boolean {
  const normalized = normalizeAppState(state)
  memory.state = normalized
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
      return true
    } catch {}
  }
  return true
}

function writeFallbackMqttArchive(archive: MqttArchiveState): boolean {
  const normalized = normalizeMqttArchiveState(archive)
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(MQTT_ARCHIVE_STORAGE_KEY, JSON.stringify(normalized))
      return true
    } catch {}
  }
  return true
}

function fallbackMqttStorageStatus(): MqttStorageStatus {
  return {
    mode: 'browser-localStorage',
    sqliteAvailable: false,
    migratedLegacyArchive: false
  }
}

function writeFallbackMqttSecrets(secrets: MqttSecretMap): boolean {
  const normalized = normalizeMqttSecrets(secrets)
  memory.mqttSecrets = normalized
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(MQTT_SECRETS_LOCAL_STORAGE_KEY, JSON.stringify({ version: 1, secrets: normalized }))
      return true
    } catch {}
  }
  return true
}

async function scanViaDevApi(): Promise<PortProcess[]> {
  if (typeof fetch !== 'function') return []
  try {
    const response = await fetch('/__eypc__/ports/scan')
    if (!response.ok) return []
    const payload = await response.json() as { ports?: unknown }
    return Array.isArray(payload.ports) ? payload.ports.filter((item): item is PortProcess => {
      const source = item as Partial<PortProcess>
      return typeof source.id === 'string' && typeof source.pid === 'number' && typeof source.port === 'number' && typeof source.command === 'string'
    }) : []
  } catch {
    return []
  }
}

async function killViaDevApi(request: KillRequest): Promise<KillResult> {
  if (typeof fetch !== 'function') return { ok: false, ...request, error: 'dev kill api unavailable' }
  try {
    const response = await fetch('/__eypc__/ports/kill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    })
    const payload = await response.json() as Partial<KillResult>
    return {
      ok: Boolean(response.ok && payload.ok),
      pid: Number(payload.pid ?? request.pid),
      port: Number(payload.port ?? request.port),
      force: Boolean(payload.force ?? request.force),
      error: typeof payload.error === 'string' ? payload.error : response.ok ? undefined : 'dev kill api failed'
    }
  } catch (error) {
    return { ok: false, ...request, error: error instanceof Error ? error.message : 'dev kill api failed' }
  }
}

type BrowserPickedFile = Pick<File, 'name'> & {
  path?: string
  webkitRelativePath?: string
}

function pathTail(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path
}

function normalizeBrowserPickedFile(file: BrowserPickedFile, kind: PickedFavoriteKind): PickedFavorite | null {
  const relativePath = typeof file.webkitRelativePath === 'string' ? file.webkitRelativePath.trim() : ''
  const explicitPath = typeof file.path === 'string' ? file.path.trim() : ''
  const folderRoot = relativePath.split(/[\\/]/).filter(Boolean)[0] || ''
  const path = kind === 'folder'
    ? folderRoot || explicitPath.replace(/[\\/][^\\/]*$/, '') || file.name
    : explicitPath || relativePath || file.name
  const normalizedPath = String(path || '').trim()
  if (!normalizedPath) return null
  const name = kind === 'folder' ? folderRoot || pathTail(normalizedPath) : file.name || pathTail(normalizedPath)
  return {
    kind,
    path: normalizedPath,
    name,
    parentId: null,
    tags: [],
    color: kind === 'folder' ? '#2F80ED' : '#F2994A'
  }
}

function normalizeBrowserPickedFiles(files: ArrayLike<BrowserPickedFile>, kind: PickedFavoriteKind): PickedFavorite[] {
  const seen = new Set<string>()
  return Array.from(files)
    .map((file) => normalizeBrowserPickedFile(file, kind))
    .filter((item): item is PickedFavorite => {
      if (!item) return false
      const key = `${item.kind}:${item.path}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

async function pickFavoritesViaBrowserInput(kind: PickedFavoriteKind): Promise<PickedFavorite[]> {
  if (typeof document === 'undefined' || !document.body) return []
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.style.display = 'none'
    if (kind === 'folder') {
      input.setAttribute('webkitdirectory', '')
      input.setAttribute('directory', '')
    }

    const cleanup = () => {
      input.remove()
    }
    const finish = () => {
      const picked = input.files ? normalizeBrowserPickedFiles(input.files, kind) : []
      cleanup()
      resolve(picked)
    }
    const cancel = () => {
      cleanup()
      resolve([])
    }

    input.addEventListener('change', finish, { once: true })
    input.addEventListener('cancel', cancel, { once: true })
    document.body.appendChild(input)

    try {
      input.click()
    } catch {
      cancel()
    }
  })
}

async function saveTextFileViaBrowser(input: SaveTextFileInput): Promise<SaveTextFileResult> {
  if (typeof document === 'undefined' || !document.body || typeof URL === 'undefined' || typeof Blob === 'undefined') {
    return { outcome: 'failed', errorCode: 'unsupported', message: 'browser download unavailable' }
  }
  const suggestedName = input.suggestedName.trim() || 'mqtt-export.json'
  try {
    const objectUrl = URL.createObjectURL(new Blob([input.text], { type: input.mimeType || 'text/plain;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = suggestedName
    anchor.hidden = true
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
    return { outcome: 'saved' }
  } catch (error) {
    return {
      outcome: 'failed',
      errorCode: errorCodeFromUnknown(error),
      message: error instanceof Error ? error.message : 'browser download failed'
    }
  }
}

export function getPlatform(): EypcPlatformApi {
  if (typeof window !== 'undefined' && window.eypcPlatform) {
    const hostFiles = window.eypcPlatform.files
    const hostClipboard = window.eypcPlatform.clipboard
    const hostStorage = window.eypcPlatform.storage
    const hostCodex = window.eypcPlatform.codex
    const hostFloat = window.eypcPlatform.float
    const hostActionRunner = window.eypcPlatform.actionRunner
    const hostWindows = window.eypcPlatform.windows
    const hostClaude = window.eypcPlatform.claude
    const hostCursor = window.eypcPlatform.cursor
    const hostCompanionNavigation = window.eypcPlatform.companionNavigation
    const hostCompanionTasks = window.eypcPlatform.companionTasks
    const hostCompanionKernel = window.eypcPlatform.companionKernel
    const hostRuntimeIdentity = window.eypcPlatform.runtimeIdentity
    const expectation: RuntimeIdentityExpectationV1 = {
      hostAssetId: __EYPC_HOST_ASSET_ID__,
      rendererAssetId: __EYPC_RENDERER_ASSET_ID__,
      kernelRevision: __EYPC_COMPANION_KERNEL_REVISION__,
      taskPackageRevision: __EYPC_COMPANION_TASK_PACKAGE_REVISION__
    }
    let runtimeIdentityStatus: RuntimeIdentityHandshakeV1
    try {
      runtimeIdentityStatus = hostRuntimeIdentity?.revision === __EYPC_RUNTIME_IDENTITY_REVISION__
        && typeof hostRuntimeIdentity.handshake === 'function'
        ? hostRuntimeIdentity.handshake(expectation)
        : {
            revision: 'runtime-identity-v1',
            status: 'reload-required',
            expected: expectation,
            actual: { hostAssetId: '', rendererAssetId: '', kernelRevision: '', taskPackageRevision: '' },
            kernelRevision: '',
            taskPackageRevision: '',
            message: `Preload ${hostCodex?.taskStateRevision || 'unknown'} / UI ${CODEX_TASK_STATE_REVISION}，需要重新接入或重载`,
            errorCode: 'identity-missing'
          }
    } catch {
      runtimeIdentityStatus = {
        revision: 'runtime-identity-v1',
        status: 'reload-required',
        expected: expectation,
        actual: { hostAssetId: '', rendererAssetId: '', kernelRevision: '', taskPackageRevision: '' },
        kernelRevision: '',
        taskPackageRevision: '',
        message: '运行身份握手失败，需要重新接入或重载',
        errorCode: 'identity-handshake-failed'
      }
    }
    let runtimeCompatible = runtimeIdentityStatus.status === 'host-loaded'
    const kernelCompatible = runtimeCompatible
      && hostCompanionKernel?.revision === COMPANION_TASK_KERNEL_REVISION
      && hostCompanionKernel.packageRevision === COMPANION_TASK_PACKAGE_REVISION
      && typeof hostCompanionKernel.attach === 'function'
      && typeof hostCompanionKernel.configure === 'function'
      && typeof hostCompanionKernel.publishAuxiliaryCycleTasks === 'function'
      && typeof hostCompanionKernel.dispatch === 'function'
      && typeof hostCompanionKernel.getLatest === 'function'
      && typeof hostCompanionKernel.subscribe === 'function'
      && typeof hostCompanionKernel.diagnostics === 'function'
    if (runtimeCompatible && !kernelCompatible) {
      runtimeIdentityStatus = {
        ...runtimeIdentityStatus,
        status: 'reload-required',
        message: 'V4 任务 Kernel 未完整加载，需要重新接入或重载',
        errorCode: 'kernel-missing'
      }
      runtimeCompatible = false
    }
    const hostCapabilities: FileCapabilities = hostFiles.capabilities || {
      platform: 'unsupported',
      open: typeof hostFiles.open === 'function',
      reveal: typeof hostFiles.reveal === 'function',
      copyPath: typeof hostFiles.copyPath === 'function',
      copyItems: typeof hostFiles.copyItems === 'function',
      pickFiles: typeof hostFiles.pickFavorites === 'function' || typeof hostFiles.pickFavorite === 'function',
      pickFolders: typeof hostFiles.pickFavorites === 'function',
      listDirectory: typeof hostFiles.listDirectory === 'function',
      inspectPaths: typeof hostFiles.inspectPaths === 'function',
      run: typeof hostFiles.run === 'function',
      terminalRun: typeof hostFiles.run === 'function'
    }
    return {
      ...window.eypcPlatform,
      runtimeIdentityStatus,
      windows: {
        capabilities: hostWindows?.capabilities || (async () => unsupportedWindowCapability('当前 preload 未提供窗口能力')),
        list: hostWindows?.list || (async () => unsupportedWindowList('当前 preload 未提供窗口能力')),
        probeInstance: hostWindows?.probeInstance || (async (window) => ({
          status: 'indeterminate' as const,
          instanceId: window.instanceId,
          liveness: 'indeterminate' as const,
          reason: 'unsupported' as const
        })),
        activate: hostWindows?.activate || (async () => ({ outcome: 'unsupported', message: '当前 preload 未提供窗口激活能力' })),
        alwaysOnTop: hostWindows?.alwaysOnTop || (async () => ({ outcome: 'unsupported', message: '当前 preload 未提供页面置顶能力' })),
        close: hostWindows?.close || (async () => ({ outcome: 'unsupported', message: '当前 preload 未提供窗口关闭能力' })),
        terminate: hostWindows?.terminate || (async () => ({ outcome: 'unsupported', message: '当前 preload 未提供窗口强杀能力' })),
        openPermissionSettings: hostWindows?.openPermissionSettings
      },
      storage: {
        getState: hostStorage.getState || readFallbackState,
        setState: hostStorage.setState || writeFallbackState,
        getMqttArchive: hostStorage.getMqttArchive || readFallbackMqttArchive,
        setMqttArchive: hostStorage.setMqttArchive || writeFallbackMqttArchive,
        getMqttStorageStatus: hostStorage.getMqttStorageStatus || fallbackMqttStorageStatus,
        getMqttSecrets: hostStorage.getMqttSecrets || readFallbackMqttSecrets,
        setMqttSecrets: hostStorage.setMqttSecrets || writeFallbackMqttSecrets
      },
      files: {
        capabilities: hostCapabilities,
        open: (path) => callFileAction(hostFiles.open ? () => hostFiles.open(path) : undefined, 'open unavailable'),
        run: hostFiles.run ? (request) => Promise.resolve(hostFiles.run!(request)).then(normalizeFavoriteRunResult).catch((error) => ({ outcome: 'failed', errorCode: errorCodeFromUnknown(error), message: error instanceof Error ? error.message : 'runner failed' })) : undefined,
        listRuns: hostFiles.listRuns ? (limit) => normalizeFavoriteRunRecords(hostFiles.listRuns!(limit)) : undefined,
        watchRuns: hostFiles.watchRuns
          ? (listener) => {
              try {
                return hostFiles.watchRuns!(listener) || (() => {})
              } catch {
                return () => {}
              }
            }
          : undefined,
        reveal: (path) => callFileAction(hostFiles.reveal ? () => hostFiles.reveal(path) : undefined, 'reveal unavailable'),
        copyPath: (path) => callFileAction(hostFiles.copyPath ? () => hostFiles.copyPath(path) : undefined, 'copy path unavailable'),
        copyItems: (paths) => callFileAction(hostFiles.copyItems ? () => hostFiles.copyItems!(paths) : undefined, 'copy items unavailable'),
        inspectPaths: hostFiles.inspectPaths || (async (paths) => paths.map((path) => unknownInspection(path))),
        pickFavorite: hostFiles.pickFavorite,
        pickFavorites: hostFiles.pickFavorites || (async () => {
          const picked = await hostFiles.pickFavorite?.()
          return picked ? [picked] : []
        }),
        listDirectory: hostFiles.listDirectory || (async () => ({ ok: false, entries: [], error: 'directory listing unavailable', errorCode: 'unsupported' })),
        saveTextFile: (input) => callSaveTextFile(hostFiles.saveTextFile ? () => hostFiles.saveTextFile(input) : undefined)
      },
      clipboard: {
        copyText: hostClipboard?.copyText || (async () => false)
      },
      codex: {
        taskStateRevision: typeof hostCodex?.readSnapshot === 'function'
          ? typeof hostCodex.taskStateRevision === 'string' && hostCodex.taskStateRevision
            ? hostCodex.taskStateRevision
            : 'legacy'
          : undefined,
        actionRuntimeRevision: typeof hostCodex?.listProjectEnvironments === 'function'
          ? typeof hostCodex.actionRuntimeRevision === 'string' && hostCodex.actionRuntimeRevision
            ? hostCodex.actionRuntimeRevision
            : 'legacy'
          : undefined,
        // uTools can keep a previous preload alive while loading a newer renderer.
        // Treat an existing snapshot bridge as positive capability evidence instead
        // of misreporting the desktop host as an unsupported browser.
        inspectEnvironment: hostCodex?.inspectEnvironment || (async () => typeof hostCodex?.readSnapshot === 'function'
          ? legacyHostCodexEnvironment()
          : unsupportedCodexEnvironment()),
        setLaunchPath: hostCodex?.setLaunchPath,
        clearLaunchPath: hostCodex?.clearLaunchPath,
        readSnapshot: hostCodex?.readSnapshot || (async () => ({ ok: false, error: { code: 'unsupported', message: 'Codex App Server unavailable in this host' }, receivedAt: Date.now() })),
        readActivitySnapshot: hostCodex?.readActivitySnapshot,
        onActivityChanged: hostCodex?.onActivityChanged,
        openThread: hostCodex?.openThread || (async () => ({ outcome: 'failed', errorCode: 'unsupported', message: 'Codex thread open unavailable' })),
        createThread: hostCodex?.createThread,
        openBlank: hostCodex?.openBlank,
        archiveThread: hostCodex?.archiveThread,
        archiveProject: hostCodex?.archiveProject,
        removeProject: hostCodex?.removeProject,
        listProjectEnvironments: hostCodex?.listProjectEnvironments,
        runProjectAction: hostCodex?.runProjectAction,
        listActionSessions: hostCodex?.listActionSessions,
        stopActionSession: hostCodex?.stopActionSession,
        setActionRunArchived: hostCodex?.setActionRunArchived,
        close: hostCodex?.close || (() => undefined)
      },
      // Passed through only when the packaged preload actually exposes it; an
      // older preload simply leaves `claude` undefined and the Controller then
      // keeps the provider dormant.
      claude: hostClaude && typeof hostClaude.readSnapshot === 'function' ? hostClaude : undefined,
      cursor: hostCursor && typeof hostCursor.readInventory === 'function' ? hostCursor : undefined,
      companionNavigation: runtimeCompatible && hostCompanionNavigation?.revision === COMPANION_NAVIGATION_REVISION
        && typeof hostCompanionNavigation.begin === 'function'
        && typeof hostCompanionNavigation.sync === 'function'
        && typeof hostCompanionNavigation.cycle === 'function'
        && typeof hostCompanionNavigation.open === 'function'
        && typeof hostCompanionNavigation.diagnostics === 'function'
          ? hostCompanionNavigation
          : undefined,
      companionTasks: runtimeCompatible && hostCompanionTasks?.revision === COMPANION_TASK_ACTIONS_REVISION
        && typeof hostCompanionTasks.sync === 'function'
        && typeof hostCompanionTasks.open === 'function'
        && typeof hostCompanionTasks.archive === 'function'
        && typeof hostCompanionTasks.shortcutArchive === 'function'
        && typeof hostCompanionTasks.diagnostics === 'function'
          ? hostCompanionTasks
          : undefined,
      companionKernel: runtimeCompatible && kernelCompatible ? hostCompanionKernel : undefined,
      float: {
        sync: hostFloat?.sync || (() => false),
        activate: hostFloat?.activate,
        diagnostics: hostFloat?.diagnostics,
        resetGeometry: hostFloat?.resetGeometry,
        close: hostFloat?.close || (() => undefined),
        onAction: hostFloat?.onAction || (() => () => undefined)
      },
      actionRunner: {
        syncCatalog: hostActionRunner?.syncCatalog || (() => false),
        activate: hostActionRunner?.activate,
        readPreference: hostActionRunner?.readPreference,
        updatePreference: hostActionRunner?.updatePreference,
        close: hostActionRunner?.close || (() => undefined),
        onAction: hostActionRunner?.onAction || (() => () => undefined)
      },
      app: window.eypcPlatform.app || { hide: async () => false }
    }
  }
  return {
    runtimeIdentityStatus: {
      revision: 'runtime-identity-v1',
      status: 'reload-required',
      expected: {
        hostAssetId: __EYPC_HOST_ASSET_ID__,
        rendererAssetId: __EYPC_RENDERER_ASSET_ID__,
        kernelRevision: __EYPC_COMPANION_KERNEL_REVISION__,
        taskPackageRevision: __EYPC_COMPANION_TASK_PACKAGE_REVISION__
      },
      actual: { hostAssetId: '', rendererAssetId: '', kernelRevision: '', taskPackageRevision: '' },
      kernelRevision: '',
      taskPackageRevision: '',
      message: '浏览器模式未连接 uTools Preload',
      errorCode: 'host-unavailable'
    },
    storage: {
      getState: readFallbackState,
      setState: writeFallbackState,
      getMqttArchive: readFallbackMqttArchive,
      setMqttArchive: writeFallbackMqttArchive,
      getMqttStorageStatus: fallbackMqttStorageStatus,
      getMqttSecrets: readFallbackMqttSecrets,
      setMqttSecrets: writeFallbackMqttSecrets
    },
    ports: {
      scan: scanViaDevApi,
      kill: killViaDevApi
    },
    windows: {
      capabilities: async () => unsupportedWindowCapability('浏览器预览不提供系统窗口能力'),
      list: async () => unsupportedWindowList('浏览器预览不提供系统窗口能力'),
      probeInstance: async (window) => ({ status: 'indeterminate', instanceId: window.instanceId, liveness: 'indeterminate', reason: 'unsupported' }),
      activate: async () => ({ outcome: 'unsupported', message: '浏览器预览不提供系统窗口激活能力' }),
      alwaysOnTop: async () => ({ outcome: 'unsupported', message: '浏览器预览不提供页面置顶能力' }),
      close: async () => ({ outcome: 'unsupported', message: '浏览器预览不提供系统窗口关闭能力' }),
      terminate: async () => ({ outcome: 'unsupported', message: '浏览器预览不提供系统窗口强杀能力' })
    },
    files: {
      capabilities: {
        platform: 'unsupported',
        open: false,
        reveal: false,
        copyPath: typeof navigator !== 'undefined' && Boolean(navigator.clipboard),
        copyItems: false,
        pickFiles: typeof document !== 'undefined',
        pickFolders: typeof document !== 'undefined',
        listDirectory: false,
        inspectPaths: false,
        run: false,
        terminalRun: false
      },
      open: async () => ({ outcome: 'failed', errorCode: 'unsupported', message: 'open unavailable in browser' }),
      reveal: async () => ({ outcome: 'failed', errorCode: 'unsupported', message: 'reveal unavailable in browser' }),
      copyPath: async (path) => {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          try {
            await navigator.clipboard.writeText(path)
            return { outcome: 'success' }
          } catch (error) {
            return { outcome: 'failed', errorCode: errorCodeFromUnknown(error), message: error instanceof Error ? error.message : 'copy path failed' }
          }
        }
        return { outcome: 'failed', errorCode: 'unsupported', message: 'copy path unavailable in browser' }
      },
      copyItems: async () => ({ outcome: 'failed', errorCode: 'unsupported', message: 'copy items unavailable in browser' }),
      inspectPaths: async (paths) => paths.map((path) => unknownInspection(path)),
      pickFavorites: pickFavoritesViaBrowserInput,
      listDirectory: async () => ({ ok: false, entries: [], error: 'directory listing unavailable', errorCode: 'unsupported' }),
      saveTextFile: saveTextFileViaBrowser
    },
    clipboard: {
      copyText: async (text) => {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          await navigator.clipboard.writeText(text)
          return true
        }
        return false
      }
    },
    codex: {
      actionRuntimeRevision: undefined,
      inspectEnvironment: async () => unsupportedCodexEnvironment(),
      setLaunchPath: undefined,
      clearLaunchPath: undefined,
      readSnapshot: async () => ({ ok: false, error: { code: 'unsupported', message: 'Codex App Server unavailable in browser' }, receivedAt: Date.now() }),
      readActivitySnapshot: undefined,
      onActivityChanged: undefined,
      openThread: async () => ({ outcome: 'failed', errorCode: 'unsupported', message: 'Codex thread open unavailable in browser' }),
      createThread: undefined,
      openBlank: undefined,
      archiveThread: undefined,
      archiveProject: undefined,
      removeProject: undefined,
      listProjectEnvironments: undefined,
      runProjectAction: undefined,
      listActionSessions: undefined,
      stopActionSession: undefined,
      setActionRunArchived: undefined,
      close: () => undefined
    },
    companionNavigation: undefined,
    companionTasks: undefined,
    companionKernel: undefined,
    float: {
      sync: () => false,
      activate: () => false,
      diagnostics: () => ({ supported: false, alwaysOnTop: false, allWorkspaces: false, visibleOnFullScreen: false, checkedAt: 0, errorCode: 'unsupported' }),
      resetGeometry: () => false,
      close: () => undefined,
      onAction: () => () => undefined
    },
    actionRunner: {
      syncCatalog: () => false,
      activate: () => false,
      readPreference: () => ({ selectedLaneId: '' }),
      updatePreference: () => false,
      close: () => undefined,
      onAction: () => () => undefined
    },
    app: {
      hide: async () => false
    },
    getEnterPayload: () => memory.enterPayload,
    clearEnterPayload: () => {
      memory.enterPayload = null
    }
  }
}
