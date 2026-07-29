export type CodexDisplayStyle = 'water' | 'card'
export type CodexQuotaRefreshMinutes = 5 | 10 | 15 | 30 | 0
export type CodexTaskRefreshSeconds = 15 | 30 | 60 | 0
export type CodexFloatEdge = 'left' | 'right' | 'top' | 'bottom'
export type CodexCompactField = 'short' | 'weekly' | 'tasks'
export type CodexExpandedField = 'plan' | 'short' | 'weekly' | 'reset' | 'config' | 'tasks' | 'updatedAt'
export type CodexEnvironmentPlatform = 'macos' | 'windows' | 'unsupported'
export type CodexRuntimeSource = 'manual' | 'configured' | 'volta' | 'npm-global' | 'local' | 'homebrew' | 'nvm' | 'path' | 'unknown'
export type CodexRuntimeState = 'detected' | 'missing' | 'unusable' | 'unsupported'
export type CodexProcessState = 'running' | 'not-running' | 'unknown'
export type CodexConfigFileState = 'loaded' | 'detected' | 'missing' | 'unreadable' | 'unknown'
export type CodexConnectionState = 'not-checked' | 'connected' | 'failed'
export type CodexLaunchMode = 'manual' | 'automatic' | 'legacy-fallback' | 'unknown'
export type CodexManualLaunchPathState = 'not-configured' | 'valid' | 'invalid' | 'unavailable'
export type CodexStatusFeedMode = 'desktop-live' | 'connector-fallback' | 'unavailable'
export type CodexTaskAuthority = 'live' | 'mixed' | 'inventory-only'
export type CodexTaskTab = 'all' | 'input' | 'ongoing' | 'completed' | 'hidden' | 'projects'
export type CodexVisibleTaskTab = Exclude<CodexTaskTab, 'all' | 'input'>
export type CodexProjectSectionId = 'pinned' | 'projects' | 'chats'
export type CodexWaterPalette = 'solid' | 'gradient' | 'aurora'
export type CodexWaterMotion = 'static' | 'slow' | 'normal' | 'fast'
export type CodexWaterPercentPosition = 'auto' | 'bottom-left' | 'center' | 'bottom-right'
export type CodexWaterPercentTextStyle = 'regular' | 'bold' | 'italic' | 'bold-italic'
export type CodexWaterOuterStyle = 'solid' | 'segmented'
export type CodexWaterColorMode = 'quota' | 'custom'
export type CodexWaterGlow = 'off' | 'soft' | 'strong'
export type CodexQuotaFamily = 'normal' | 'spark'
export type CodexNewThreadModelPolicy = 'quota-auto'

export function isCodexTaskTab(value: unknown): value is CodexTaskTab {
  return value === 'all' || value === 'input' || value === 'ongoing' || value === 'completed' || value === 'hidden' || value === 'projects'
}

/** Legacy `all` and `input` targets are intentionally redirected to the visible dynamic tab. */
export function normalizeCodexVisibleTaskTab(value: unknown): CodexVisibleTaskTab {
  if (value === 'completed' || value === 'hidden' || value === 'projects') return value
  return 'ongoing'
}

export interface CodexQuotaBucket {
  remainingPercent: number
  resetAt: number | null
  windowMinutes: number | null
}

export interface CodexQuotaPool {
  limitId: string
  limitName: string
  family: CodexQuotaFamily
  short: CodexQuotaBucket | null
  weekly: CodexQuotaBucket | null
}

export interface CodexQuotaSnapshotLegacyV1 {
  version: 1
  status: 'idle' | 'loading' | 'ok' | 'stale' | 'error'
  plan: string
  short: CodexQuotaBucket | null
  weekly: CodexQuotaBucket | null
  updatedAt: number
  errorCode?: string
  errorMessage?: string
}

export interface CodexQuotaSnapshotV2 {
  version: 2
  status: CodexQuotaSnapshotLegacyV1['status']
  plan: string
  /** Compatibility mirrors for the ordinary Codex pool. */
  short: CodexQuotaBucket | null
  weekly: CodexQuotaBucket | null
  normal: CodexQuotaPool
  spark: CodexQuotaPool[]
  updatedAt: number
  errorCode?: string
  errorMessage?: string
}

/** Compatibility name retained for existing consumers while V2 rolls out. */
export type CodexQuotaSnapshotV1 = CodexQuotaSnapshotLegacyV1 | CodexQuotaSnapshotV2

export interface CodexModelCatalogEntry {
  id: string
  displayName: string
  description: string
  family: CodexQuotaFamily
  isDefault: boolean
  supportsText: boolean
}

export interface CodexModelCatalogSnapshotV1 {
  version: 1
  status: 'idle' | 'ok' | 'stale' | 'error'
  models: CodexModelCatalogEntry[]
  fingerprint: string
  updatedAt: number
  errorCode?: string
}

export interface CodexResolvedNewThreadModel {
  status: 'ready' | 'manual-required'
  modelId: string
  modelName: string
  family: CodexQuotaFamily
  reason: 'preferred-normal' | 'default-normal' | 'first-normal' | 'quota-spark' | 'manual-selection' | 'spark-unavailable' | 'catalog-empty'
  quota: CodexQuotaBucket | null
  quotaLabel: string
}

export interface CodexNewThreadTarget {
  projectKey: string
  projectAlias: string
  projectName: string
  projectKind: 'project' | 'chats'
  projectFingerprint: string
}

export interface CodexNewThreadSelectionContext {
  quota: CodexQuotaSnapshotV1
  modelCatalog: CodexModelCatalogSnapshotV1
  contextFingerprint: string
  projectFingerprint: string
  receivedAt: number
}

export interface CodexNewThreadRequest {
  target: Pick<CodexNewThreadTarget, 'projectKey' | 'projectAlias' | 'projectFingerprint'>
  modelId: string
  contextFingerprint: string
  mode: 'send-and-open' | 'create-empty'
  selectionKind: 'auto' | 'manual'
  /** Dedicated transient field: never place this request in snapshots, actions, logs, or storage. */
  prompt?: string
}

export interface CodexNewThreadResult {
  outcome: 'opened' | 'created' | 'reopen-available' | 'stale-selection' | 'manual-only' | 'failed'
  modelId?: string
  reopenAlias?: string
  errorCode?: string
  message?: string
  retryAllowed?: boolean
  context?: CodexNewThreadSelectionContext
  target?: CodexNewThreadTarget
}

export interface CodexConfigSnapshotV1 {
  version: 1
  model: string
  reasoningEffort: string
  serviceTier: string
  updatedAt: number
}

/**
 * Privacy-safe host readiness projection. It intentionally carries no paths,
 * process identifiers, credentials, or configuration values.
 */
export interface CodexEnvironmentSnapshotV1 {
  version: 1
  checking: boolean
  platform: CodexEnvironmentPlatform
  runtimeState: CodexRuntimeState
  runtimeSource: CodexRuntimeSource
  processState: CodexProcessState
  configState: CodexConfigFileState
  connectionState: CodexConnectionState
  desktopBridgeState: CodexDesktopBridgeState
  checkedAt: number
  errorCode?: CodexBridgeError['code']
  /** Manual launch location never crosses the preload boundary; only its validation outcome does. */
  launchMode?: CodexLaunchMode
  manualLaunchPathState?: CodexManualLaunchPathState
  /** Privacy-safe labels only: no executable paths, PIDs, or environment values. */
  launchCandidates?: CodexLaunchCandidate[]
  /** Connector fallback never grants Input/ongoing/unread authority. */
  statusFeedMode?: CodexStatusFeedMode
}

export interface CodexLaunchCandidate {
  source: CodexRuntimeSource
  label: string
  state: 'available' | 'unusable'
}

export type CodexThreadStatus = 'active' | 'idle' | 'notLoaded' | 'systemError'
export type CodexThreadActiveFlag = 'waitingOnApproval' | 'waitingOnUserInput'
export type CodexTurnStatus = 'completed' | 'interrupted' | 'failed' | 'inProgress'
export type CodexDesktopBridgeState = 'not-checked' | 'connecting' | 'connected' | 'not-running' | 'incompatible' | 'failed'
export type CodexStatusAuthority = 'desktop-live' | 'connector' | 'unavailable'
export type CodexUnreadAuthority = 'desktop-live' | 'desktop-persisted' | 'unavailable'
export type CodexActivityEvidenceOrigin = 'connector' | 'initial-snapshot' | 'activity-event'
export type CodexTurnEvidenceOrigin = 'inventory' | 'turn-started' | 'turn-completed' | 'targeted-after-exit' | 'snapshot-corroborated'

export interface CodexHostThread {
  /** Provider-issued stable anonymous correlation key; never a raw thread id. */
  key: string
  /** Short-lived provider action alias; never an arbitrary URL or raw thread id. */
  actionAlias: string
  displayName?: string
  name: string
  status: CodexThreadStatus
  activeFlags: CodexThreadActiveFlag[]
  /** Activity is authoritative only while the desktop follower is live. */
  statusAuthority?: CodexStatusAuthority
  /** Evidence provenance used to distinguish a replayed snapshot from a real later activity patch. */
  activityEvidence?: CodexActivityEvidenceOrigin
  activityRevision?: number
  /** @deprecated V2 transport compatibility only; never used for semantic ordering. */
  desktopActiveSince?: number
  /** Exact unread state owned by Codex Desktop, never an EyPc read receipt. */
  hasUnreadTurn?: boolean
  unreadAuthority?: CodexUnreadAuthority
  updatedAt: number
  /** Privacy-safe thread creation timestamp when provided by the host. */
  createdAt?: number
  /** Earliest known user turn timestamp; never accompanied by turn content. */
  firstPromptAt?: number
  /** Latest persisted turn metadata; turn items are intentionally not loaded. */
  lastTurnStatus?: CodexTurnStatus
  /** Latest turn start timestamp, independent from completion classification. */
  lastTurnStartedAt?: number
  /** Present only for an authoritative persisted `completed` turn. */
  lastTurnCompletedAt?: number
  /** Provenance of the latest Turn evidence; timestamps are never compared with local clocks. */
  lastTurnEvidence?: CodexTurnEvidenceOrigin
  /** Anonymous native project identity. Raw project ids and paths never cross the bridge. */
  projectKey?: string
  projectName?: string
  projectKind?: 'project' | 'chats'
  nativePinned?: boolean
  nativePinnedOrder?: number
}

export interface CodexHostProject {
  /** Stable hash of the normalized native root set, or the fixed Chats key. */
  key: string
  /** Short-lived provider action alias for project-scoped host operations. */
  actionAlias?: string
  name: string
  kind: 'project' | 'chats'
  nativePinned: boolean
  nativePinnedOrder?: number
  nativeOrder?: number
}

export interface CodexRecoveredPendingSource {
  key: string
  actionAlias: string
  name: string
  updatedAt: number
  createdAt?: number
  lastTurnStartedAt?: number
  lastTurnCompletedAt?: number
  source: 'history' | 'archived'
}

export interface CodexPendingRecoverySnapshotV1 {
  version: 1
  status: 'idle' | 'searching' | 'complete' | 'error'
  matches: CodexRecoveredPendingSource[]
  requestedCount: number
  resolvedCount: number
  scannedCount: number
  receivedAt: number
}

/**
 * Semantic revision for privacy-safe task evidence. A mixed-version runtime is
 * marked degraded, but its atomic task-state package is preserved rather than
 * being independently cleared by Controller or Renderer.
 */
export const CODEX_TASK_STATE_REVISION = 'task-state-v3'

export interface CodexHostSnapshotV1 {
  version: 1
  receivedAt: number
  quota?: {
    plan: string
    short: CodexQuotaBucket | null
    weekly: CodexQuotaBucket | null
    normal?: CodexQuotaPool
    spark?: CodexQuotaPool[]
  }
  config?: Omit<CodexConfigSnapshotV1, 'version' | 'updatedAt'>
  threads?: CodexHostThread[]
  threadsPartial?: boolean
  taskAuthority?: CodexTaskAuthority
  models?: CodexModelCatalogEntry[]
  modelCatalogFingerprint?: string
  modelCatalogErrorCode?: string
  newThreadContextFingerprint?: string
}

export interface CodexHostSnapshotV2 {
  version: 2
  receivedAt: number
  quota?: CodexHostSnapshotV1['quota']
  config?: CodexHostSnapshotV1['config']
  threads?: CodexHostThread[]
  projects?: CodexHostProject[]
  /** Hash of the allowlisted native project registry projection. */
  sourceFingerprint?: string
  completeness?: 'verified'
  rawSourceCount?: number
  eligibleSourceCount?: number
  excludedSourceCount?: number
  nonConversationCount?: number
  /** One-release V1 migration fields. V2 verified snapshots are never partial. */
  threadsPartial?: false
  taskAuthority?: CodexTaskAuthority
  models?: CodexModelCatalogEntry[]
  modelCatalogFingerprint?: string
  modelCatalogErrorCode?: string
  newThreadContextFingerprint?: string
}

export type CodexHostSnapshot = CodexHostSnapshotV1 | CodexHostSnapshotV2

export interface CodexActivityDeltaEntryV1 {
  /** Anonymous task key already present in the last verified host snapshot. */
  key: string
  status: CodexThreadStatus
  activeFlags: CodexThreadActiveFlag[]
}

/**
 * Privacy-safe high-frequency activity projection. Raw thread identities remain
 * inside the preload bridge and are never exposed to either renderer.
 */
export interface CodexActivityDeltaV1 {
  version: 1
  sourceFingerprint: string
  generation: number
  entries: CodexActivityDeltaEntryV1[]
  inventoryChanged: boolean
  receivedAt: number
}

export interface CodexActivityDeltaEntryV2 {
  /** Anonymous task key already present in the last verified host snapshot. */
  key: string
  /** A Desktop read-state event may update unread fields only; it is never activity authority. */
  readStateOnly?: boolean
  status?: CodexThreadStatus
  activeFlags?: CodexThreadActiveFlag[]
  statusAuthority?: CodexStatusAuthority
  activityEvidence?: CodexActivityEvidenceOrigin
  activityRevision?: number
  /** @deprecated V2 transport compatibility only; never used for semantic ordering. */
  desktopActiveSince?: number
  hasUnreadTurn?: boolean
  unreadAuthority?: CodexUnreadAuthority
  /** Fresh privacy-safe latest-Turn evidence collected for one live status transition. */
  lastTurnStatus?: CodexTurnStatus
  lastTurnStartedAt?: number
  lastTurnCompletedAt?: number
  /** Privacy-safe provenance for monotonic Turn evidence. */
  lastTurnEvidence?: CodexTurnEvidenceOrigin
}

export interface CodexActivityDeltaV2 {
  version: 2
  sourceFingerprint: string
  generation: number
  entries: CodexActivityDeltaEntryV2[]
  /** Already-public anonymous keys that a compatible provider explicitly reported archived. */
  archivedKeys?: string[]
  inventoryChanged: boolean
  /** Urgent upserts/terminal events bypass the ordinary structural coalescing window. */
  inventoryRefreshPriority?: 'urgent' | 'normal'
  desktopBridgeState: CodexDesktopBridgeState
  receivedAt: number
}

export type CodexActivityDelta = CodexActivityDeltaV1 | CodexActivityDeltaV2

export interface CodexBridgeError {
  code: 'unsupported' | 'unavailable' | 'runtime-unavailable' | 'not-authenticated' | 'timeout' | 'protocol-error' | 'process-exited' | 'open-failed'
  message: string
}

export type CodexBridgeResult<T> =
  | { ok: true; value: T; receivedAt: number }
  | { ok: false; error: CodexBridgeError; receivedAt: number }

export interface CodexThreadOpenResult {
  outcome: 'opened' | 'dispatched' | 'failed'
  errorCode?: string
  message?: string
}

export interface CodexThreadArchiveResult {
  outcome: 'archived' | 'failed'
  desktopSync?: 'dispatched' | 'not-running' | 'incompatible' | 'failed'
  errorCode?: string
  message?: string
}

export interface CodexThreadArchiveRequest {
  expectedUpdatedAt: number
  expectedRevisionAt: number
  expectedCompletionAt?: number
  expectedLastTurnStartedAt?: number
  expectedSourceFingerprint?: string
  evidence: 'completed' | 'stopped'
}

export interface CodexProjectArchiveRequest {
  expectedSourceFingerprint: string
}

export interface CodexProjectArchiveResult {
  outcome: 'complete' | 'partial' | 'failed'
  archivedKeys: string[]
  skippedActiveKeys: string[]
  failed: Array<{ key: string; errorCode: string }>
  desktopSyncedKeys?: string[]
  desktopSyncFailedKeys?: string[]
  errorCode?: string
  message?: string
}

export interface CodexProjectRemoveRequest {
  expectedSourceFingerprint: string
}

export type CodexProjectRemoveStatus = 'codex-running' | 'stale-source' | 'unsupported-schema' | 'write-failed' | 'verified'

export interface CodexProjectRemoveResult {
  status: CodexProjectRemoveStatus
  message: string
}

export interface CodexThreadReceipt {
  key: string
  /** Legacy local-view watermark; never authoritative for Codex unread state. */
  acknowledgedRecency: number
  acknowledgedAt: number
  /** Explicit user acknowledgement of one completed revision in EyPc only. */
  completedUnreadAcknowledgedRevision?: number
  completedUnreadAcknowledgedAt?: number
  /** Legacy completion-pending fields, cleared when a current host row is projected. */
  pendingRecency: number
  pendingSince: number
  pendingMode?: 'completion' | 'recency'
  /** Local-only hide watermark for the task revision rendered by EyPc. */
  dismissedActivityRecency?: number
  dismissedAt?: number
  /** Legacy V1 field. V2 migrates it to viewed + dismissed on the next live scan. */
  hiddenPendingRecency?: number
  hiddenPendingAt?: number
}

export interface CodexFloatPosition {
  displayId: string
  x: number | null
  y: number | null
  edge: CodexFloatEdge
}

export interface CodexColorSettings {
  healthy: string
  warning: string
  critical: string
  water: string
  card: string
  cardForeground: string
}

export interface CodexCounterColors {
  input: string
  active: string
  unread: string
}

export interface CodexWaterAppearanceSettings {
  inner: {
    palette: CodexWaterPalette
    fillColorA: string
    fillColorB: string
    /** Legacy persisted aliases; normalized into fillColorA/fillColorB. */
    colorA?: string
    colorB?: string
    opacity: number
    amplitude: number
    motion: CodexWaterMotion
    /** Opacity of the ball background only; liquid, ring, reading and counters stay visible. */
    baseOpacity: number
    showPercent: boolean
    percentPosition: CodexWaterPercentPosition
    percentSize: number
    percentTextStyle: CodexWaterPercentTextStyle
    percentColor: string
  }
  outer: {
    style: CodexWaterOuterStyle
    thickness: number
    colorMode: CodexWaterColorMode
    progressColor: string
    trackColor: string
    glow: CodexWaterGlow
    /** Legacy persistence compatibility only; the water surface no longer renders a decorative shell. */
    shellOpacity: number
  }
}

/**
 * Direct tokens for the panel shown after the floating companion expands.
 * These stay independent of the compact water-ball and compact-card skins.
 */
export interface CodexExpandedCardAppearanceSettings {
  surface: string
  surfaceRaised: string
  foreground: string
  secondary: string
  border: string
  focus: string
  accent: string
  running: string
  pending: string
}

export interface CodexSavedThemePreset {
  id: string
  name: string
  colors: CodexColorSettings
  waterAppearance: CodexWaterAppearanceSettings
  expandedCardAppearance: CodexExpandedCardAppearanceSettings
  createdAt: number
  updatedAt: number
}

export interface CodexExpandedSizePreference {
  displayId: string
  width: number
  height: number
  updatedAt: number
}

export interface CodexFirstPromptTimeCacheEntry {
  key: string
  firstPromptAt: number
  updatedAt: number
}

export interface CodexSettings {
  floatEnabled: boolean
  displayStyle: CodexDisplayStyle
  conversationInboxEnabled: boolean
  quotaRefreshMinutes: CodexQuotaRefreshMinutes
  taskRefreshSeconds: CodexTaskRefreshSeconds
  newThreadModelPolicy: CodexNewThreadModelPolicy
  /** Applies only while ordinary Codex quota is selected by quota-auto. */
  newThreadPreferredModel: string
  /** Rolling latest-Turn activity window for task projections; the dynamic view adds a fixed six-hour filter. */
  timeWindowDays: number
  /**
   * Optional default project for Environment Action slots.
   * Empty means “use the float Projects tab context” instead of a fixed project.
   */
  actionDefaultProjectKey: string
  compactFields: CodexCompactField[]
  expandedFields: CodexExpandedField[]
  colors: CodexColorSettings
  counterColors: CodexCounterColors
  waterAppearance: CodexWaterAppearanceSettings
  expandedCardAppearance: CodexExpandedCardAppearanceSettings
  savedThemePresets: CodexSavedThemePreset[]
  position: CodexFloatPosition
  expandedSizes: CodexExpandedSizePreference[]
}

export interface CodexAliasEntry {
  key: string
  alias: string
}

export interface CodexLocalPin {
  kind: 'task' | 'project'
  key: string
}

export interface CodexState {
  settings: CodexSettings
  receipts: CodexThreadReceipt[]
  firstPromptTimes: CodexFirstPromptTimeCacheEntry[]
  lastTaskScanAt: number
  cachedQuota: CodexQuotaSnapshotV1
  cachedConfig: CodexConfigSnapshotV1
  lastTaskTab: CodexVisibleTaskTab
  collapsedProjectKeys: string[]
  taskAliases: CodexAliasEntry[]
  projectAliases: CodexAliasEntry[]
  localPins: CodexLocalPin[]
  /** Local presentation state: hides only the Projects-tab group. */
  hiddenProjectKeys: string[]
}

export type CodexTaskBucket = 'ongoing' | 'stopped' | 'completed-unread' | 'completed'
export type CodexTaskActivityState = 'active' | 'ongoing' | 'stopped' | 'waiting-input' | 'waiting-approval'
export type CodexArchiveCapability = 'blocked-active' | 'blocked-stopped' | 'allowed'

export interface CodexTaskCard {
  key: string
  actionAlias?: string
  displayName?: string
  name: string
  /** V2 primary state. Hiding is intentionally orthogonal to this bucket. */
  bucket: CodexTaskBucket
  activityState: CodexTaskActivityState
  archiveCapability: CodexArchiveCapability
  /** Latest task revision used by hide/restore. Completed tasks use completionRevision. */
  revisionAt: number
  /** Privacy-safe persisted completion watermark, never turn content. */
  completionRevision?: number
  unreadState?: 'unread' | 'read' | 'unknown'
  /** Latest Turn.startedAt; this is the only field used as “last question time”. */
  lastQuestionAt?: number
  /** Deprecated presentation state retained while old persisted renderers migrate. */
  state: 'running' | 'stopped' | 'recent-activity' | 'waiting-approval' | 'waiting-input' | 'attention' | 'pending-review'
  /** Preserves simultaneous live requirements instead of collapsing both flags. */
  activeFlags?: CodexThreadActiveFlag[]
  updatedAt: number
  pendingSince?: number
  createdAt?: number
  firstPromptAt?: number
  lastTurnStartedAt?: number
  lastTurnCompletedAt?: number
  lastTurnDurationMs?: number
  source?: 'current' | 'history' | 'archived' | 'unresolved' | 'unavailable'
  hiddenKind?: 'task' | 'activity' | 'pending'
  hasCurrentActivity?: boolean
  canArchive?: boolean
  originalName: string
  alias?: string
  projectKey: string
  projectName: string
  originalProjectName: string
  projectKind: 'project' | 'chats'
  isHidden: boolean
  pinSource?: 'native' | 'local'
}

export interface CodexProjectCard {
  key: string
  actionAlias?: string
  name: string
  originalName: string
  alias?: string
  kind: 'project' | 'chats'
  nativePinned: boolean
  nativePinnedOrder?: number
  nativeOrder?: number
  pinSource?: 'native' | 'local'
  collapsed: boolean
  tasks: CodexTaskCard[]
}

export type CodexProjectEntry =
  | { kind: 'task'; task: CodexTaskCard; pinSource: 'native' | 'local' }
  | { kind: 'project'; project: CodexProjectCard; pinSource?: 'native' | 'local' }

export interface CodexProjectSection {
  id: CodexProjectSectionId
  title: 'Pinned' | 'Projects' | 'Chats'
  entries: CodexProjectEntry[]
}

export interface ConversationSnapshotV2 {
  version: 2 | 3
  status: 'idle' | 'loading' | 'ok' | 'stale' | 'error'
  ongoing: CodexTaskCard[]
  /** Explicit terminal Turn evidence that is not a completed result. */
  stopped: CodexTaskCard[]
  completedUnread: CodexTaskCard[]
  completed: CodexTaskCard[]
  /** Deprecated V1 alias of completedUnread. */
  pending: CodexTaskCard[]
  hidden: CodexTaskCard[]
  /** V3 tab projections. V2 readers can continue using the legacy arrays above. */
  all: CodexTaskCard[]
  inputRequired: CodexTaskCard[]
  completedTab: CodexTaskCard[]
  projectSections: CodexProjectSection[]
  projects: CodexProjectCard[]
  hiddenProjects: CodexProjectCard[]
  /** One-release compatibility field. Native project removal never populates it. */
  removedProjects: CodexProjectCard[]
  activeTab: CodexVisibleTaskTab
  /** Visible ongoing tasks: live work plus cases without authoritative completion or stop evidence. */
  ongoingCount: number
  stoppedCount: number
  waitingCount: number
  runningCount: number
  /** Cross-process activity whose live status is not observable by this App Server. */
  unknownCount: number
  attentionCount: number
  inputRequiredCount: number
  completedUnreadCount: number
  completedCount: number
  /** Deprecated V1 alias of completedUnreadCount. */
  pendingCount: number
  hiddenCount: number
  pendingRecoveredCount: number
  pendingUnresolvedCount: number
  pendingRecoveryStatus: CodexPendingRecoverySnapshotV1['status']
  updatedAt: number
  partial: boolean
  sourceCount: number
  rawSourceCount: number
  eligibleSourceCount: number
  excludedSourceCount: number
  nonConversationCount: number
  sourceFingerprint: string
  completeness: 'unknown' | 'verified'
  authority: CodexTaskAuthority
  errorCode?: string
  errorMessage?: string
}

/** @deprecated Use ConversationSnapshotV2. */
export type ConversationSnapshotV1 = ConversationSnapshotV2

export interface ConversationProjection {
  snapshot: ConversationSnapshotV2
  receipts: CodexThreadReceipt[]
  lastTaskScanAt: number
  statuses: Record<string, CodexThreadStatus>
  /** Complete completed-unread key set from the final rendered arrays. */
  pendingKeys: string[]
}

const RECEIPT_KEY = /^[a-f0-9]{16,64}$/
const PROJECT_KEY = /^(?:[a-f0-9]{16,64}|chats)$/
const COMPACT_FIELDS: CodexCompactField[] = ['short', 'weekly', 'tasks']
const EXPANDED_FIELDS: CodexExpandedField[] = ['plan', 'short', 'weekly', 'reset', 'config', 'tasks', 'updatedAt']
const MAX_SAVED_THEME_PRESETS = 20
const THEME_NAME_MAX_LENGTH = 40

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

function boundedInteger(value: unknown, minimum: number, maximum: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(minimum, Math.min(maximum, Math.round(value)))
}

function enumValue<T extends string | number>(value: unknown, allowed: readonly T[], fallback: T): T {
  return (typeof value === 'string' || typeof value === 'number') && allowed.includes(value as T) ? value as T : fallback
}

function orderedFields<T extends string>(value: unknown, allowed: readonly T[], fallback: readonly T[]): T[] {
  if (!Array.isArray(value)) return [...fallback]
  if (value.length === 0) return []
  const result = [...new Set(value.filter((item): item is T => typeof item === 'string' && allowed.includes(item as T)))]
  return result.length ? result : [...fallback]
}

function color(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 160) : fallback
}

function normalizeColors(value: unknown, fallback: CodexColorSettings): CodexColorSettings {
  const source = record(value)
  const hasWaterSetting = Object.prototype.hasOwnProperty.call(source, 'water')
  const legacyCard = color(source.card, '')
  const card = color(source.card, fallback.card)

  return {
    healthy: color(source.healthy, fallback.healthy),
    warning: color(source.warning, fallback.warning),
    critical: color(source.critical, fallback.critical),
    water: hasWaterSetting ? color(source.water, fallback.water) : legacyCard || fallback.water,
    card: hasWaterSetting ? card : legacyCard || fallback.card,
    cardForeground: color(source.cardForeground, fallback.cardForeground)
  }
}

function mixColorHex(from: string, to: string, amount: number): string {
  const ratio = Math.max(0, Math.min(1, amount))
  const channel = (value: string, offset: number) => Number.parseInt(value.slice(offset, offset + 2), 16)
  const mixed = [1, 3, 5].map((offset) => Math.round(channel(from, offset) + (channel(to, offset) - channel(from, offset)) * ratio).toString(16).padStart(2, '0'))
  return `#${mixed.join('')}`.toUpperCase()
}

export function defaultCodexWaterAppearance(colors: CodexColorSettings = defaultCodexSettingsColors()): CodexWaterAppearanceSettings {
  return {
    inner: {
      palette: 'gradient',
      fillColorA: colors.water,
      fillColorB: mixColorHex(colors.water, colors.healthy, 0.35),
      opacity: 78,
      amplitude: 8,
      motion: 'normal',
      baseOpacity: 100,
      showPercent: true,
      percentPosition: 'auto',
      percentSize: 22,
      percentTextStyle: 'bold',
      percentColor: '#FFFFFF'
    },
    outer: {
      style: 'solid',
      thickness: 5,
      colorMode: 'quota',
      progressColor: colors.healthy,
      trackColor: mixColorHex(colors.water, '#FFFFFF', 0.45),
      glow: 'soft',
      shellOpacity: 72
    }
  }
}

export function defaultCodexExpandedCardAppearance(colors: CodexColorSettings = defaultCodexSettingsColors()): CodexExpandedCardAppearanceSettings {
  const surface = colors.card
  const foreground = colors.cardForeground
  return {
    surface,
    surfaceRaised: mixColorHex(surface, foreground, 0.025),
    foreground,
    secondary: mixColorHex(surface, foreground, 0.52),
    border: mixColorHex(surface, foreground, 0.28),
    focus: colors.healthy,
    accent: colors.healthy,
    running: '#2F7CC0',
    pending: '#C6631A'
  }
}

function defaultCodexSettingsColors(): CodexColorSettings {
  return { healthy: '#23B5A5', warning: '#F2A93B', critical: '#EF5B68', water: '#102C3C', card: '#F7F9F7', cardForeground: '#07161D' }
}

function defaultCodexCounterColors(): CodexCounterColors {
  return { input: '#E5486F', active: '#258BC7', unread: '#B84D91' }
}

function normalizeCounterColors(value: unknown, fallback: CodexCounterColors): CodexCounterColors {
  const source = record(value)
  return {
    input: color(source.input, fallback.input),
    active: color(source.active, fallback.active),
    unread: color(source.unread, fallback.unread)
  }
}

export function normalizeCodexWaterAppearance(value: unknown, colors: CodexColorSettings, fallback = defaultCodexWaterAppearance(colors)): CodexWaterAppearanceSettings {
  const source = record(value)
  const inner = record(source.inner)
  const outer = record(source.outer)
  return {
    inner: {
      palette: enumValue(inner.palette, ['solid', 'gradient', 'aurora'] as const, fallback.inner.palette),
      fillColorA: color(inner.fillColorA || inner.colorA, fallback.inner.fillColorA),
      fillColorB: color(inner.fillColorB || inner.colorB, fallback.inner.fillColorB),
      opacity: boundedInteger(inner.opacity, 40, 95, fallback.inner.opacity),
      amplitude: boundedInteger(inner.amplitude, 4, 12, fallback.inner.amplitude),
      motion: enumValue(inner.motion, ['static', 'slow', 'normal', 'fast'] as const, fallback.inner.motion),
      baseOpacity: boundedInteger(inner.baseOpacity, 0, 100, fallback.inner.baseOpacity),
      showPercent: typeof inner.showPercent === 'boolean' ? inner.showPercent : fallback.inner.showPercent,
      percentPosition: enumValue(inner.percentPosition, ['auto', 'bottom-left', 'center', 'bottom-right'] as const, fallback.inner.percentPosition),
      percentSize: boundedInteger(inner.percentSize, 12, 32, fallback.inner.percentSize),
      percentTextStyle: enumValue(inner.percentTextStyle, ['regular', 'bold', 'italic', 'bold-italic'] as const, fallback.inner.percentTextStyle),
      percentColor: color(inner.percentColor, fallback.inner.percentColor)
    },
    outer: {
      style: enumValue(outer.style, ['solid', 'segmented'] as const, fallback.outer.style),
      thickness: boundedInteger(outer.thickness, 2, 6, fallback.outer.thickness),
      colorMode: enumValue(outer.colorMode, ['quota', 'custom'] as const, fallback.outer.colorMode),
      progressColor: color(outer.progressColor, fallback.outer.progressColor),
      trackColor: color(outer.trackColor, fallback.outer.trackColor),
      glow: enumValue(outer.glow, ['off', 'soft', 'strong'] as const, fallback.outer.glow),
      shellOpacity: boundedInteger(outer.shellOpacity, 25, 95, fallback.outer.shellOpacity)
    }
  }
}

export function normalizeCodexExpandedCardAppearance(
  value: unknown,
  colors: CodexColorSettings,
  fallback = defaultCodexExpandedCardAppearance(colors)
): CodexExpandedCardAppearanceSettings {
  const source = record(value)
  return {
    surface: color(source.surface, fallback.surface),
    surfaceRaised: color(source.surfaceRaised, fallback.surfaceRaised),
    foreground: color(source.foreground, fallback.foreground),
    secondary: color(source.secondary, fallback.secondary),
    border: color(source.border, fallback.border),
    focus: color(source.focus, fallback.focus),
    accent: color(source.accent, fallback.accent),
    running: color(source.running, fallback.running),
    pending: color(source.pending, fallback.pending)
  }
}

function normalizeExpandedSizes(value: unknown): CodexExpandedSizePreference[] {
  if (!Array.isArray(value)) return []
  const byDisplay = new Map<string, CodexExpandedSizePreference>()
  for (const item of value) {
    const source = record(item)
    const displayId = typeof source.displayId === 'string' ? source.displayId.slice(0, 120) : ''
    if (!displayId) continue
    const width = boundedInteger(source.width, 340, 10_000, 0)
    const height = boundedInteger(source.height, 280, 10_000, 0)
    const updatedAt = numberValue(source.updatedAt, 0)
    if (!width || !height || !updatedAt) continue
    const entry = { displayId, width, height, updatedAt }
    const previous = byDisplay.get(displayId)
    if (!previous || entry.updatedAt >= previous.updatedAt) byDisplay.set(displayId, entry)
  }
  return [...byDisplay.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8)
}

function normalizeThemePresetName(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, THEME_NAME_MAX_LENGTH) : ''
}

function normalizeSavedThemePresets(value: unknown, fallbackColors: CodexColorSettings): CodexSavedThemePreset[] {
  if (!Array.isArray(value)) return []
  const presets = new Map<string, CodexSavedThemePreset>()
  for (const item of value) {
    const source = record(item)
    const id = normalizeThemePresetName(source.id)
    if (!id) continue
    const name = normalizeThemePresetName(source.name)
    if (!name) continue
    const colors = normalizeColors(source.colors, fallbackColors)
    const waterAppearance = normalizeCodexWaterAppearance(source.waterAppearance, colors)
    const expandedCardAppearance = normalizeCodexExpandedCardAppearance(source.expandedCardAppearance, colors)
    const createdAt = numberValue(source.createdAt, 0)
    const updatedAt = numberValue(source.updatedAt, createdAt || Date.now())
    const existing = presets.get(id)
    if (!existing || updatedAt >= existing.updatedAt) {
      presets.set(id, { id, name, colors, waterAppearance, expandedCardAppearance, createdAt: createdAt || updatedAt, updatedAt })
    }
  }
  return [...presets.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SAVED_THEME_PRESETS)
}

export function normalizeCodexFirstPromptTimes(value: unknown): CodexFirstPromptTimeCacheEntry[] {
  if (!Array.isArray(value)) return []
  const byKey = new Map<string, CodexFirstPromptTimeCacheEntry>()
  for (const item of value) {
    const source = record(item)
    const key = typeof source.key === 'string' ? source.key.toLowerCase() : ''
    const firstPromptAt = numberValue(source.firstPromptAt, 0)
    const updatedAt = numberValue(source.updatedAt, 0)
    if (!RECEIPT_KEY.test(key) || !firstPromptAt || !updatedAt) continue
    const entry = { key, firstPromptAt, updatedAt }
    const previous = byKey.get(key)
    if (!previous || entry.updatedAt >= previous.updatedAt) byKey.set(key, entry)
  }
  return [...byKey.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 100)
}

function normalizeAnonymousKeys(value: unknown, maximum: number, projectKeys = false): string[] {
  if (!Array.isArray(value)) return []
  const pattern = projectKeys ? PROJECT_KEY : RECEIPT_KEY
  return [...new Set(value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.toLowerCase())
    .filter((item) => pattern.test(item)))]
    .slice(0, maximum)
}

export function normalizeCodexAliases(value: unknown, projectKeys = false): CodexAliasEntry[] {
  if (!Array.isArray(value)) return []
  const pattern = projectKeys ? PROJECT_KEY : RECEIPT_KEY
  const byKey = new Map<string, CodexAliasEntry>()
  for (const item of value) {
    const source = record(item)
    const key = typeof source.key === 'string' ? source.key.toLowerCase() : ''
    const alias = typeof source.alias === 'string' ? source.alias.trim().slice(0, 120) : ''
    if (!pattern.test(key) || !alias) continue
    byKey.set(key, { key, alias })
  }
  return [...byKey.values()].slice(-500)
}

export function normalizeCodexLocalPins(value: unknown): CodexLocalPin[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const pins: CodexLocalPin[] = []
  for (const item of value) {
    const source = record(item)
    const kind = source.kind === 'task' || source.kind === 'project' ? source.kind : ''
    const key = typeof source.key === 'string' ? source.key.toLowerCase() : ''
    if (!kind) continue
    const valid = kind === 'task' ? RECEIPT_KEY.test(key) : PROJECT_KEY.test(key) && key !== 'chats'
    const identity = `${kind}:${key}`
    if (!valid || seen.has(identity)) continue
    seen.add(identity)
    pins.push({ kind, key })
    if (pins.length >= 500) break
  }
  return pins
}

export function clampPercent(value: unknown): number {
  return Math.max(0, Math.min(100, Math.round(numberValue(value, 0))))
}

export function emptyCodexQuota(status: CodexQuotaSnapshotV1['status'] = 'idle'): CodexQuotaSnapshotV2 {
  return {
    version: 2,
    status,
    plan: '',
    short: null,
    weekly: null,
    normal: { limitId: 'codex', limitName: 'Codex', family: 'normal', short: null, weekly: null },
    spark: [],
    updatedAt: 0
  }
}

export function emptyCodexModelCatalog(status: CodexModelCatalogSnapshotV1['status'] = 'idle'): CodexModelCatalogSnapshotV1 {
  return { version: 1, status, models: [], fingerprint: '', updatedAt: 0 }
}

export function emptyCodexConfig(): CodexConfigSnapshotV1 {
  return { version: 1, model: '', reasoningEffort: '', serviceTier: '', updatedAt: 0 }
}

export function emptyCodexEnvironment(): CodexEnvironmentSnapshotV1 {
  return {
    version: 1,
    checking: true,
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
    checkedAt: 0
  }
}

export function emptyConversationSnapshot(status: ConversationSnapshotV1['status'] = 'idle'): ConversationSnapshotV1 {
  return {
    version: 3,
    status,
    ongoing: [],
    stopped: [],
    completedUnread: [],
    completed: [],
    pending: [],
    hidden: [],
    all: [],
    inputRequired: [],
    completedTab: [],
    projectSections: [],
    projects: [],
    hiddenProjects: [],
    removedProjects: [],
    activeTab: 'ongoing',
    ongoingCount: 0,
    stoppedCount: 0,
    waitingCount: 0,
    runningCount: 0,
    unknownCount: 0,
    attentionCount: 0,
    inputRequiredCount: 0,
    completedUnreadCount: 0,
    completedCount: 0,
    pendingCount: 0,
    hiddenCount: 0,
    pendingRecoveredCount: 0,
    pendingUnresolvedCount: 0,
    pendingRecoveryStatus: 'idle',
    updatedAt: 0,
    partial: false,
    sourceCount: 0,
    rawSourceCount: 0,
    eligibleSourceCount: 0,
    excludedSourceCount: 0,
    nonConversationCount: 0,
    sourceFingerprint: '',
    completeness: 'unknown',
    authority: 'inventory-only'
  }
}

export function defaultCodexSettings(): CodexSettings {
  const colors = defaultCodexSettingsColors()
  return {
    floatEnabled: false,
    displayStyle: 'water',
    conversationInboxEnabled: true,
    quotaRefreshMinutes: 5,
    taskRefreshSeconds: 15,
    newThreadModelPolicy: 'quota-auto',
    newThreadPreferredModel: '',
    timeWindowDays: 30,
    actionDefaultProjectKey: '',
    compactFields: [...COMPACT_FIELDS],
    expandedFields: [...EXPANDED_FIELDS],
    colors,
    counterColors: defaultCodexCounterColors(),
    waterAppearance: defaultCodexWaterAppearance(colors),
    expandedCardAppearance: defaultCodexExpandedCardAppearance(colors),
    savedThemePresets: [],
    position: { displayId: '', x: null, y: null, edge: 'right' },
    expandedSizes: []
  }
}

export function normalizeCodexSettings(value: unknown): CodexSettings {
  const fallback = defaultCodexSettings()
  const source = record(value)
  const position = record(source.position)
  const colors = normalizeColors(source.colors, fallback.colors)
  const counterColors = normalizeCounterColors(source.counterColors, fallback.counterColors)
  return {
    floatEnabled: source.floatEnabled === true,
    displayStyle: enumValue(source.displayStyle, ['water', 'card'] as const, fallback.displayStyle),
    conversationInboxEnabled: source.conversationInboxEnabled !== false,
    quotaRefreshMinutes: enumValue(source.quotaRefreshMinutes, [0, 5, 10, 15, 30] as const, fallback.quotaRefreshMinutes),
    taskRefreshSeconds: enumValue(source.taskRefreshSeconds, [0, 15, 30, 60] as const, fallback.taskRefreshSeconds),
    newThreadModelPolicy: enumValue(source.newThreadModelPolicy, ['quota-auto'] as const, fallback.newThreadModelPolicy),
    newThreadPreferredModel: typeof source.newThreadPreferredModel === 'string' && /^[A-Za-z0-9._:-]{1,120}$/.test(source.newThreadPreferredModel)
      ? source.newThreadPreferredModel
      : '',
    timeWindowDays: boundedInteger(source.timeWindowDays, 1, 365, fallback.timeWindowDays),
    actionDefaultProjectKey: typeof source.actionDefaultProjectKey === 'string'
      && /^[a-z0-9]{8,64}$/i.test(source.actionDefaultProjectKey.trim())
      ? source.actionDefaultProjectKey.trim().slice(0, 64)
      : '',
    compactFields: orderedFields(source.compactFields, COMPACT_FIELDS, fallback.compactFields),
    expandedFields: orderedFields(source.expandedFields, EXPANDED_FIELDS, fallback.expandedFields),
    colors,
    counterColors,
    waterAppearance: normalizeCodexWaterAppearance(source.waterAppearance, colors, defaultCodexWaterAppearance(colors)),
    expandedCardAppearance: normalizeCodexExpandedCardAppearance(source.expandedCardAppearance, colors, defaultCodexExpandedCardAppearance(colors)),
    savedThemePresets: normalizeSavedThemePresets(source.savedThemePresets, colors),
    position: {
      displayId: typeof position.displayId === 'string' ? position.displayId.slice(0, 120) : '',
      x: typeof position.x === 'number' && Number.isFinite(position.x) ? Math.round(position.x) : null,
      y: typeof position.y === 'number' && Number.isFinite(position.y) ? Math.round(position.y) : null,
      edge: enumValue(position.edge, ['left', 'right', 'top', 'bottom'] as const, fallback.position.edge)
    },
    expandedSizes: normalizeExpandedSizes(source.expandedSizes)
  }
}

function normalizeBucket(value: unknown): CodexQuotaBucket | null {
  const source = record(value)
  if (!Object.keys(source).length) return null
  return {
    remainingPercent: clampPercent(source.remainingPercent),
    resetAt: numberValue(source.resetAt, 0) || null,
    windowMinutes: numberValue(source.windowMinutes, 0) || null
  }
}

export function normalizeCodexQuota(value: unknown): CodexQuotaSnapshotV2 {
  const source = record(value)
  const status = enumValue(source.status, ['idle', 'loading', 'ok', 'stale', 'error'] as const, 'idle')
  const normalSource = record(source.normal)
  const legacyShort = normalizeBucket(source.short)
  const legacyWeekly = normalizeBucket(source.weekly)
  const normal: CodexQuotaPool = {
    limitId: typeof normalSource.limitId === 'string' ? normalSource.limitId.slice(0, 120) : 'codex',
    limitName: typeof normalSource.limitName === 'string' ? normalSource.limitName.slice(0, 160) : 'Codex',
    family: 'normal',
    short: normalizeBucket(normalSource.short) || legacyShort,
    weekly: normalizeBucket(normalSource.weekly) || legacyWeekly
  }
  const spark = Array.isArray(source.spark) ? source.spark.flatMap((value): CodexQuotaPool[] => {
    const pool = record(value)
    const limitId = typeof pool.limitId === 'string' ? pool.limitId.slice(0, 120) : ''
    if (!limitId) return []
    return [{
      limitId,
      limitName: typeof pool.limitName === 'string' ? pool.limitName.slice(0, 160) : limitId,
      family: 'spark',
      short: normalizeBucket(pool.short),
      weekly: normalizeBucket(pool.weekly)
    }]
  }).slice(0, 12) : []
  return {
    version: 2,
    status,
    plan: typeof source.plan === 'string' ? source.plan.slice(0, 64) : '',
    short: normal.short,
    weekly: normal.weekly,
    normal,
    spark,
    updatedAt: numberValue(source.updatedAt, 0),
    ...(typeof source.errorCode === 'string' ? { errorCode: source.errorCode.slice(0, 80) } : {}),
    ...(typeof source.errorMessage === 'string' ? { errorMessage: source.errorMessage.slice(0, 180) } : {})
  }
}

export function normalizeCodexConfig(value: unknown): CodexConfigSnapshotV1 {
  const source = record(value)
  return {
    version: 1,
    model: typeof source.model === 'string' ? source.model.slice(0, 120) : '',
    reasoningEffort: typeof source.reasoningEffort === 'string' ? source.reasoningEffort.slice(0, 80) : '',
    serviceTier: typeof source.serviceTier === 'string' ? source.serviceTier.slice(0, 80) : '',
    updatedAt: numberValue(source.updatedAt, 0)
  }
}

export function normalizeCodexEnvironment(value: unknown): CodexEnvironmentSnapshotV1 {
  const source = record(value)
  const launchCandidates = Array.isArray(source.launchCandidates)
    ? source.launchCandidates.flatMap((candidate) => {
        const item = record(candidate)
        const runtimeSource = enumValue(item.source, ['manual', 'configured', 'volta', 'npm-global', 'local', 'homebrew', 'nvm', 'path', 'unknown'] as const, 'unknown')
        const label = typeof item.label === 'string' ? item.label.trim().slice(0, 80) : ''
        const state = enumValue(item.state, ['available', 'unusable'] as const, 'unusable')
        return label ? [{ source: runtimeSource, label, state }] : []
      }).slice(0, 8)
    : []
  return {
    version: 1,
    checking: source.checking === true,
    platform: enumValue(source.platform, ['macos', 'windows', 'unsupported'] as const, 'unsupported'),
    runtimeState: enumValue(source.runtimeState, ['detected', 'missing', 'unusable', 'unsupported'] as const, 'unsupported'),
    runtimeSource: enumValue(source.runtimeSource, ['manual', 'configured', 'volta', 'npm-global', 'local', 'homebrew', 'nvm', 'path', 'unknown'] as const, 'unknown'),
    processState: enumValue(source.processState, ['running', 'not-running', 'unknown'] as const, 'unknown'),
    configState: enumValue(source.configState, ['loaded', 'detected', 'missing', 'unreadable', 'unknown'] as const, 'unknown'),
    connectionState: enumValue(source.connectionState, ['not-checked', 'connected', 'failed'] as const, 'not-checked'),
    desktopBridgeState: enumValue(source.desktopBridgeState, ['not-checked', 'connecting', 'connected', 'not-running', 'incompatible', 'failed'] as const, 'not-checked'),
    launchMode: enumValue(source.launchMode, ['manual', 'automatic', 'legacy-fallback', 'unknown'] as const, 'unknown'),
    manualLaunchPathState: enumValue(source.manualLaunchPathState, ['not-configured', 'valid', 'invalid', 'unavailable'] as const, 'unavailable'),
    launchCandidates,
    statusFeedMode: enumValue(source.statusFeedMode, ['desktop-live', 'connector-fallback', 'unavailable'] as const, 'unavailable'),
    checkedAt: numberValue(source.checkedAt, 0),
    ...(typeof source.errorCode === 'string' ? { errorCode: enumValue(source.errorCode, ['unsupported', 'unavailable', 'runtime-unavailable', 'not-authenticated', 'timeout', 'protocol-error', 'process-exited', 'open-failed'] as const, 'unavailable') } : {})
  }
}

export function normalizeCodexReceipts(value: unknown): CodexThreadReceipt[] {
  if (!Array.isArray(value)) return []
  const byKey = new Map<string, CodexThreadReceipt>()
  for (const item of value) {
    const source = record(item)
    const key = typeof source.key === 'string' ? source.key.toLowerCase() : ''
    if (!RECEIPT_KEY.test(key)) continue
    const receipt: CodexThreadReceipt = {
      key,
      acknowledgedRecency: numberValue(source.acknowledgedRecency, 0),
      acknowledgedAt: numberValue(source.acknowledgedAt, 0),
      ...(numberValue(source.completedUnreadAcknowledgedRevision, 0) > 0 ? { completedUnreadAcknowledgedRevision: numberValue(source.completedUnreadAcknowledgedRevision, 0) } : {}),
      ...(numberValue(source.completedUnreadAcknowledgedAt, 0) > 0 ? { completedUnreadAcknowledgedAt: numberValue(source.completedUnreadAcknowledgedAt, 0) } : {}),
      pendingRecency: numberValue(source.pendingRecency, 0),
      pendingSince: numberValue(source.pendingSince, 0),
      ...(source.pendingMode === 'completion' || source.pendingMode === 'recency' ? { pendingMode: source.pendingMode } : {}),
      ...(numberValue(source.dismissedActivityRecency, 0) > 0 ? { dismissedActivityRecency: numberValue(source.dismissedActivityRecency, 0) } : {}),
      ...(numberValue(source.dismissedAt, 0) > 0 ? { dismissedAt: numberValue(source.dismissedAt, 0) } : {}),
      ...(numberValue(source.hiddenPendingRecency, 0) > 0 ? { hiddenPendingRecency: numberValue(source.hiddenPendingRecency, 0) } : {}),
      ...(numberValue(source.hiddenPendingAt, 0) > 0 ? { hiddenPendingAt: numberValue(source.hiddenPendingAt, 0) } : {})
    }
    const previous = byKey.get(key)
    const receiptWatermark = Math.max(receipt.pendingRecency, receipt.acknowledgedRecency, receipt.completedUnreadAcknowledgedRevision || 0, receipt.dismissedActivityRecency || 0, receipt.hiddenPendingRecency || 0)
    const previousWatermark = Math.max(previous?.pendingRecency || 0, previous?.acknowledgedRecency || 0, previous?.completedUnreadAcknowledgedRevision || 0, previous?.dismissedActivityRecency || 0, previous?.hiddenPendingRecency || 0)
    if (!previous || receiptWatermark >= previousWatermark) byKey.set(key, receipt)
  }
  const sorted = [...byKey.values()]
    .sort((a, b) => Math.max(b.pendingRecency, b.acknowledgedRecency, b.completedUnreadAcknowledgedRevision || 0, b.dismissedActivityRecency || 0, b.hiddenPendingRecency || 0) - Math.max(a.pendingRecency, a.acknowledgedRecency, a.completedUnreadAcknowledgedRevision || 0, a.dismissedActivityRecency || 0, a.hiddenPendingRecency || 0))
  const durableUserManaged = sorted.filter((receipt) =>
    (receipt.pendingMode === 'completion' && receipt.pendingRecency > receipt.acknowledgedRecency)
    || (receipt.dismissedActivityRecency || 0) > 0
  )
  const boundedBookkeeping = sorted.filter((receipt) => !durableUserManaged.includes(receipt)).slice(0, 100)
  return [...durableUserManaged, ...boundedBookkeeping]
    .sort((a, b) => Math.max(b.pendingRecency, b.acknowledgedRecency, b.completedUnreadAcknowledgedRevision || 0, b.dismissedActivityRecency || 0, b.hiddenPendingRecency || 0) - Math.max(a.pendingRecency, a.acknowledgedRecency, a.completedUnreadAcknowledgedRevision || 0, a.dismissedActivityRecency || 0, a.hiddenPendingRecency || 0))
}

export function createDefaultCodexState(): CodexState {
  return {
    settings: defaultCodexSettings(),
    receipts: [],
    firstPromptTimes: [],
    lastTaskScanAt: 0,
    cachedQuota: emptyCodexQuota(),
    cachedConfig: emptyCodexConfig(),
    lastTaskTab: 'ongoing',
    collapsedProjectKeys: [],
    taskAliases: [],
    projectAliases: [],
    localPins: [],
    hiddenProjectKeys: []
  }
}

export function normalizeCodexState(value: unknown): CodexState {
  const source = record(value)
  return {
    settings: normalizeCodexSettings(source.settings),
    receipts: normalizeCodexReceipts(source.receipts),
    firstPromptTimes: normalizeCodexFirstPromptTimes(source.firstPromptTimes),
    lastTaskScanAt: numberValue(source.lastTaskScanAt, 0),
    cachedQuota: normalizeCodexQuota(source.cachedQuota),
    cachedConfig: normalizeCodexConfig(source.cachedConfig),
    lastTaskTab: normalizeCodexVisibleTaskTab(source.lastTaskTab),
    collapsedProjectKeys: normalizeAnonymousKeys(source.collapsedProjectKeys, 500, true),
    taskAliases: normalizeCodexAliases(source.taskAliases),
    projectAliases: normalizeCodexAliases(source.projectAliases, true),
    localPins: normalizeCodexLocalPins(source.localPins),
    hiddenProjectKeys: normalizeAnonymousKeys(source.hiddenProjectKeys, 200, true).filter((key) => key !== 'chats')
  }
}

function isLikelyActiveTask(thread: CodexHostThread) {
  return thread.statusAuthority === 'desktop-live' && thread.status === 'active'
}

function isSupersededDesktopActiveTask(thread: CodexHostThread) {
  if (!isLikelyActiveTask(thread) || thread.lastTurnStatus !== 'completed') return false
  // Unresolved live user decisions still outrank a completed Turn.
  if (thread.activeFlags.includes('waitingOnUserInput') || thread.activeFlags.includes('waitingOnApproval')) return false
  // A real activity patch starts a new activity epoch. Old inventory Turn
  // metadata must not keep that task completed while its new Turn event is
  // still in flight. Exact/corroborated completion evidence in the same epoch
  // remains stronger and may complete immediately.
  if (thread.activityEvidence === 'activity-event'
    && !['turn-completed', 'targeted-after-exit', 'snapshot-corroborated'].includes(thread.lastTurnEvidence || '')) return false
  const completedAt = numberValue(thread.lastTurnCompletedAt, 0)
  const startedAt = numberValue(thread.lastTurnStartedAt, 0)
  // Provider Turn timestamps and the local live-observation clock are not
  // comparable. A complete latest-Turn shape is the terminal authority; an
  // actual newer run must first advance its Turn revision or waiting state.
  return startedAt > 0 && completedAt > 0
}

function isCurrentDesktopActiveTask(thread: CodexHostThread) {
  return isLikelyActiveTask(thread) && !isSupersededDesktopActiveTask(thread)
}

function isExplicitlyStoppedTask(thread: CodexHostThread, desktopBridgeState?: CodexDesktopBridgeState) {
  if (isCurrentDesktopActiveTask(thread)) return false
  // Completed work leaves through the completion revision path, not stopped.
  if (thread.lastTurnStatus === 'completed') return false
  // Keep a brief ongoing window for inProgress rows that may still be waiting
  // for the first Desktop live shadow after inventory registration.
  if (thread.lastTurnStatus === 'inProgress') return false
  const hasTerminalStopEvidence = thread.lastTurnStatus === 'interrupted' || thread.lastTurnStatus === 'failed'
  const hasNoTurnOutcome = !thread.lastTurnStatus
  if (!hasTerminalStopEvidence && !hasNoTurnOutcome) return false
  // Exact live idle or Desktop exit remain the strongest stop proofs.
  if (thread.statusAuthority === 'desktop-live' && thread.status === 'idle') return true
  if (desktopBridgeState === 'not-running') return true
  return false
}

function taskActivityState(thread: CodexHostThread, explicitlyStopped: boolean): CodexTaskActivityState {
  if (isCurrentDesktopActiveTask(thread)) {
    if (thread.activeFlags.includes('waitingOnUserInput')) return 'waiting-input'
    if (thread.activeFlags.includes('waitingOnApproval')) return 'waiting-approval'
    return 'active'
  }
  if (explicitlyStopped) return 'stopped'
  // Without exact completion or stop evidence, authority gaps stay ongoing
  // only while Desktop live coverage is unavailable.
  return 'ongoing'
}

function legacyTaskState(bucket: CodexTaskBucket, activityState: CodexTaskActivityState): CodexTaskCard['state'] {
  if (bucket === 'completed-unread') return 'pending-review'
  if (bucket === 'completed') return 'recent-activity'
  if (bucket === 'stopped' || activityState === 'stopped') return 'stopped'
  if (activityState === 'waiting-input') return 'waiting-input'
  if (activityState === 'waiting-approval') return 'waiting-approval'
  return 'running'
}

function taskTiming(thread: CodexHostThread): Pick<CodexTaskCard, 'createdAt' | 'firstPromptAt' | 'lastQuestionAt' | 'lastTurnStartedAt' | 'lastTurnCompletedAt' | 'lastTurnDurationMs'> {
  const createdAt = numberValue(thread.createdAt, 0)
  const firstPromptAt = numberValue(thread.firstPromptAt, 0)
  const lastTurnStartedAt = numberValue(thread.lastTurnStartedAt, 0)
  const lastTurnCompletedAt = thread.lastTurnStatus === 'completed' ? numberValue(thread.lastTurnCompletedAt, 0) : 0
  const lastTurnDurationMs = lastTurnStartedAt && lastTurnCompletedAt >= lastTurnStartedAt ? lastTurnCompletedAt - lastTurnStartedAt : 0
  return {
    ...(createdAt ? { createdAt } : {}),
    ...(firstPromptAt ? { firstPromptAt } : {}),
    ...(lastTurnStartedAt ? { lastQuestionAt: lastTurnStartedAt } : {}),
    ...(lastTurnStartedAt ? { lastTurnStartedAt } : {}),
    ...(lastTurnCompletedAt ? { lastTurnCompletedAt } : {}),
    ...(lastTurnDurationMs ? { lastTurnDurationMs } : {})
  }
}

function latestTurnActivityAt(thread: CodexHostThread) {
  const lastTurnStartedAt = numberValue(thread.lastTurnStartedAt, 0)
  const lastTurnCompletedAt = thread.lastTurnStatus === 'completed' ? numberValue(thread.lastTurnCompletedAt, 0) : 0
  return Math.max(lastTurnStartedAt, lastTurnCompletedAt)
}

export function compareConversationTasks(a: CodexTaskCard, b: CodexTaskCard): number {
  const aQuestion = a.lastQuestionAt || 0
  const bQuestion = b.lastQuestionAt || 0
  if (Boolean(aQuestion) !== Boolean(bQuestion)) return aQuestion ? -1 : 1
  if (aQuestion !== bQuestion) return bQuestion - aQuestion
  const aActivity = Math.max(a.completionRevision || 0, a.updatedAt || 0)
  const bActivity = Math.max(b.completionRevision || 0, b.updatedAt || 0)
  if (aActivity !== bActivity) return bActivity - aActivity
  return a.key.localeCompare(b.key)
}

export function countConversationTasks(
  ongoing: CodexTaskCard[],
  stopped: CodexTaskCard[],
  completedUnread: CodexTaskCard[],
  completed: CodexTaskCard[],
  hidden: CodexTaskCard[] = []
) {
  const waitingCount = ongoing.filter((task) => task.activityState === 'waiting-input' || task.activityState === 'waiting-approval').length
  const runningCount = ongoing.filter((task) => task.activityState === 'active').length
  const unknownCount = 0
  const attentionCount = 0
  const hiddenUnreadCount = hidden.filter((task) => task.bucket === 'completed-unread').length
  const hiddenStoppedCount = hidden.filter((task) => task.bucket === 'stopped').length
  return {
    ongoingCount: ongoing.length,
    stoppedCount: stopped.length + hiddenStoppedCount,
    waitingCount,
    runningCount,
    unknownCount,
    attentionCount,
    inputRequiredCount: [...ongoing, ...hidden].filter((task) => task.activityState === 'waiting-input').length,
    completedUnreadCount: completedUnread.length + hiddenUnreadCount,
    completedCount: completed.length,
    pendingCount: completedUnread.length + hiddenUnreadCount,
    hiddenCount: hidden.length
  }
}

function inferredTaskAuthority(threads: CodexHostThread[], explicit?: CodexTaskAuthority): CodexTaskAuthority {
  if (explicit === 'live' || explicit === 'mixed' || explicit === 'inventory-only') return explicit
  return threads.length > 0 && threads.every((thread) => thread.status === 'notLoaded') ? 'inventory-only' : 'mixed'
}

export function projectConversations(input: {
  threads: CodexHostThread[]
  projects?: CodexHostProject[]
  receipts: CodexThreadReceipt[]
  /** Ignored in V2. Archived inventory must never be recovered into the UI. */
  recoveredPending?: CodexRecoveredPendingSource[]
  /** Ignored in V2. Kept only for persisted V1 caller compatibility. */
  pendingRecoveryStatus?: CodexPendingRecoverySnapshotV1['status']
  /** Deprecated caller compatibility; live state is never inferred from this cache. */
  previousStatuses?: Record<string, CodexThreadStatus>
  lastTaskScanAt: number
  now?: number
  partial?: boolean
  authority?: CodexTaskAuthority
  sourceCount?: number
  timeWindowDays?: number
  activeTab?: CodexTaskTab
  collapsedProjectKeys?: string[]
  taskAliases?: CodexAliasEntry[]
  projectAliases?: CodexAliasEntry[]
  localPins?: CodexLocalPin[]
  hiddenProjectKeys?: string[]
  sourceFingerprint?: string
  completeness?: 'verified'
  rawSourceCount?: number
  eligibleSourceCount?: number
  excludedSourceCount?: number
  nonConversationCount?: number
  desktopBridgeState?: CodexDesktopBridgeState
}): ConversationProjection {
  const now = input.now ?? Date.now()
  const windowStart = typeof input.timeWindowDays === 'number'
    ? now - boundedInteger(input.timeWindowDays, 1, 365, 30) * 24 * 60 * 60 * 1000
    : 0
  const receiptMap = new Map(normalizeCodexReceipts(input.receipts).map((receipt) => [receipt.key, { ...receipt }]))
  const taskAliases = new Map(normalizeCodexAliases(input.taskAliases).map((entry) => [entry.key, entry.alias]))
  const projectAliases = new Map(normalizeCodexAliases(input.projectAliases, true).map((entry) => [entry.key, entry.alias]))
  const collapsedProjects = new Set(normalizeAnonymousKeys(input.collapsedProjectKeys, 500, true))
  const hiddenProjects = new Set(normalizeAnonymousKeys(input.hiddenProjectKeys, 200, true))
  const localPins = normalizeCodexLocalPins(input.localPins)
  const localTaskPins = new Set(localPins.filter((pin) => pin.kind === 'task').map((pin) => pin.key))
  const localProjectPins = new Set(localPins.filter((pin) => pin.kind === 'project').map((pin) => pin.key))
  const statuses: Record<string, CodexThreadStatus> = {}
  const ongoing: CodexTaskCard[] = []
  const stopped: CodexTaskCard[] = []
  const completedUnread: CodexTaskCard[] = []
  const completed: CodexTaskCard[] = []
  const hidden: CodexTaskCard[] = []
  const validThreads = [...new Map(input.threads
    .filter((thread) => RECEIPT_KEY.test(thread.key)
      && Boolean(thread.actionAlias)
      && Number.isFinite(thread.updatedAt)
      && thread.updatedAt > 0
      && numberValue(thread.lastTurnStartedAt, 0) > 0
      && (!windowStart || latestTurnActivityAt(thread) >= windowStart))
    .map((thread) => [thread.key, thread] as const)).values()]

  for (const thread of validThreads) {
    statuses[thread.key] = thread.status
    const timing = taskTiming(thread)
    const receipt = receiptMap.get(thread.key) || { key: thread.key, acknowledgedRecency: 0, acknowledgedAt: 0, pendingRecency: 0, pendingSince: 0 }
    const authoritativeActive = isCurrentDesktopActiveTask(thread)
    const completionRevision = !authoritativeActive && thread.lastTurnStatus === 'completed'
      ? numberValue(thread.lastTurnCompletedAt, 0) || numberValue(thread.lastTurnStartedAt, 0)
      : 0
    const explicitlyStopped = isExplicitlyStoppedTask(thread, input.desktopBridgeState)

    if (completionRevision > 0 && (receipt.hiddenPendingRecency || 0) >= completionRevision) {
      // V1 “hidden pending” represented an explicit user review decision. V2
      // migrates it to viewed + hidden and never revives it from archived data.
      receipt.acknowledgedRecency = Math.max(receipt.acknowledgedRecency, completionRevision)
      receipt.acknowledgedAt = Math.max(receipt.acknowledgedAt, receipt.hiddenPendingAt || now)
      receipt.dismissedActivityRecency = Math.max(receipt.dismissedActivityRecency || 0, completionRevision)
      receipt.dismissedAt = Math.max(receipt.dismissedAt || 0, receipt.hiddenPendingAt || now)
      receipt.pendingRecency = 0
      receipt.pendingSince = 0
      delete receipt.pendingMode
      delete receipt.hiddenPendingRecency
      delete receipt.hiddenPendingAt
    }

    const unreadKnown = thread.unreadAuthority === 'desktop-live' || thread.unreadAuthority === 'desktop-persisted'
    const locallyAcknowledged = (receipt.completedUnreadAcknowledgedRevision || 0) >= completionRevision
    const unread = completionRevision > 0 && unreadKnown && thread.hasUnreadTurn === true && !locallyAcknowledged
    if (receipt.pendingMode === 'completion' || receipt.pendingRecency > 0) {
      receipt.pendingRecency = 0
      receipt.pendingSince = 0
      delete receipt.pendingMode
    }

    const bucket: CodexTaskBucket = authoritativeActive
      ? 'ongoing'
      : completionRevision > 0
        ? unread ? 'completed-unread' : 'completed'
        : explicitlyStopped ? 'stopped' : 'ongoing'
    const activityState = taskActivityState(thread, explicitlyStopped)
    const archiveCapability: CodexArchiveCapability = completionRevision > 0 || explicitlyStopped
      ? 'allowed'
      : 'blocked-active'
    const revisionAt = completionRevision
      || (explicitlyStopped ? numberValue(thread.lastTurnStartedAt, 0) : 0)
      || thread.updatedAt
    if ((receipt.dismissedActivityRecency || 0) > 0 && revisionAt > (receipt.dismissedActivityRecency || 0)) {
      delete receipt.dismissedActivityRecency
      delete receipt.dismissedAt
    }

    const originalName = thread.name || thread.displayName || '未命名任务'
    const alias = taskAliases.get(thread.key)
    const displayLabel = alias || originalName
    const card: CodexTaskCard = {
      key: thread.key,
      actionAlias: thread.actionAlias,
      displayName: displayLabel,
      name: displayLabel,
      originalName,
      ...(alias ? { alias } : {}),
      projectKey: PROJECT_KEY.test(thread.projectKey || '') ? thread.projectKey! : 'chats',
      projectName: '',
      originalProjectName: thread.projectName || (thread.projectKind === 'project' ? '未命名项目' : 'Chats'),
      projectKind: thread.projectKind === 'project' ? 'project' : 'chats',
      isHidden: false,
      bucket,
      activityState,
      archiveCapability,
      revisionAt,
      ...(completionRevision ? { completionRevision } : {}),
      ...(completionRevision ? { unreadState: unreadKnown ? unread ? 'unread' : 'read' : 'unknown' } : {}),
      state: legacyTaskState(bucket, activityState),
      ...(authoritativeActive ? { activeFlags: [...thread.activeFlags] } : {}),
      updatedAt: thread.updatedAt,
      ...(unread ? { pendingSince: completionRevision } : {}),
      source: 'current',
      canArchive: archiveCapability === 'allowed',
      ...timing
    }
    card.projectName = projectAliases.get(card.projectKey) || card.originalProjectName
    const isHidden = (receipt.dismissedActivityRecency || 0) >= revisionAt
    card.isHidden = isHidden
    if (localTaskPins.has(thread.key)) card.pinSource = 'local'
    else if (thread.nativePinned) card.pinSource = 'native'
    if (isHidden) hidden.push({ ...card, hiddenKind: 'task' })
    else if (bucket === 'stopped') stopped.push(card)
    else if (bucket === 'completed-unread') completedUnread.push(card)
    else if (bucket === 'completed') completed.push(card)
    else ongoing.push(card)

    if (receipt.pendingRecency || receipt.acknowledgedRecency || receipt.completedUnreadAcknowledgedRevision || receipt.dismissedActivityRecency || receipt.hiddenPendingRecency) receiptMap.set(thread.key, receipt)
  }

  ongoing.sort(compareConversationTasks)
  stopped.sort(compareConversationTasks)
  completedUnread.sort(compareConversationTasks)
  completed.sort(compareConversationTasks)
  hidden.sort(compareConversationTasks)
  const all = [...ongoing, ...stopped, ...completedUnread, ...completed, ...hidden].sort(compareConversationTasks)
  const inputRequired = all.filter((task) => task.activityState === 'waiting-input')
  const completedTab = [...completedUnread, ...completed].sort(compareConversationTasks)

  const sourceProjects = [...new Map((input.projects || [])
    .filter((project) => PROJECT_KEY.test(project.key))
    .map((project) => [project.key, project] as const)).values()]
  if (!sourceProjects.some((project) => project.key === 'chats')) {
    sourceProjects.push({ key: 'chats', name: 'Chats', kind: 'chats', nativePinned: false })
  }
  for (const task of all) {
    if (!sourceProjects.some((project) => project.key === task.projectKey)) {
      sourceProjects.push({ key: task.projectKey, name: task.originalProjectName, kind: task.projectKind, nativePinned: false })
    }
  }

  const projectCards = sourceProjects.map((project): CodexProjectCard => {
    const alias = projectAliases.get(project.key)
    const originalName = project.name || (project.kind === 'chats' ? 'Chats' : '未命名项目')
    return {
      key: project.key,
      ...(project.actionAlias ? { actionAlias: project.actionAlias } : {}),
      name: alias || originalName,
      originalName,
      ...(alias ? { alias } : {}),
      kind: project.kind,
      nativePinned: project.nativePinned,
      ...(typeof project.nativePinnedOrder === 'number' ? { nativePinnedOrder: project.nativePinnedOrder } : {}),
      ...(typeof project.nativeOrder === 'number' ? { nativeOrder: project.nativeOrder } : {}),
      ...(localProjectPins.has(project.key)
        ? { pinSource: 'local' as const }
        : project.nativePinned ? { pinSource: 'native' as const } : {}),
      collapsed: collapsedProjects.has(project.key),
      tasks: all.filter((task) => task.projectKey === project.key)
    }
  })
  const hiddenProjectCards = projectCards.filter((project) => project.kind === 'project' && hiddenProjects.has(project.key))
  const visibleProjects = projectCards.filter((project) => project.kind === 'chats' || !hiddenProjects.has(project.key))
  const taskByKey = new Map(all.map((task) => [task.key, task]))
  const projectByKey = new Map(visibleProjects.map((project) => [project.key, project]))
  const pinnedEntries: CodexProjectEntry[] = []
  const usedTasks = new Set<string>()
  const usedProjects = new Set<string>()

  const pushPinnedTask = (task: CodexTaskCard, pinSource: 'native' | 'local') => {
    if (usedTasks.has(task.key)) return
    usedTasks.add(task.key)
    task.pinSource = pinSource
    pinnedEntries.push({ kind: 'task', task, pinSource })
  }
  const pushPinnedProject = (project: CodexProjectCard, pinSource: 'native' | 'local') => {
    if (project.kind === 'chats' || usedProjects.has(project.key)) return
    usedProjects.add(project.key)
    project.pinSource = pinSource
    pinnedEntries.push({ kind: 'project', project, pinSource })
  }

  // Project-tab pin order is intentionally type-first: conversations stay
  // above projects, and EyPc-owned pinning takes precedence over Codex-native
  // pinning within the same type.
  for (const pin of localPins) {
    if (pin.kind === 'task') {
      const task = taskByKey.get(pin.key)
      if (task) pushPinnedTask(task, 'local')
    }
  }
  input.threads
    .filter((thread) => thread.nativePinned && taskByKey.has(thread.key) && !hiddenProjects.has(taskByKey.get(thread.key)!.projectKey))
    .sort((a, b) => (a.nativePinnedOrder ?? Number.MAX_SAFE_INTEGER) - (b.nativePinnedOrder ?? Number.MAX_SAFE_INTEGER))
    .forEach((thread) => pushPinnedTask(taskByKey.get(thread.key)!, 'native'))
  for (const pin of localPins) {
    if (pin.kind === 'project') {
      const project = projectByKey.get(pin.key)
      if (project) pushPinnedProject(project, 'local')
    }
  }
  visibleProjects
    .filter((project) => project.nativePinned)
    .sort((a, b) => (a.nativePinnedOrder ?? Number.MAX_SAFE_INTEGER) - (b.nativePinnedOrder ?? Number.MAX_SAFE_INTEGER))
    .forEach((project) => pushPinnedProject(project, 'native'))

  const projectEntry = (project: CodexProjectCard, pinSource?: 'native' | 'local'): CodexProjectEntry => ({
    kind: 'project',
    project: { ...project, tasks: project.tasks.filter((task) => !usedTasks.has(task.key)) },
    ...(pinSource ? { pinSource } : {})
  })
  const normalizedPinnedEntries = pinnedEntries.map((entry) => entry.kind === 'project'
    ? projectEntry(entry.project, entry.pinSource)
    : entry)
  const regularProjects = visibleProjects
    .filter((project) => project.kind === 'project' && !usedProjects.has(project.key))
    .sort((a, b) => (a.nativeOrder ?? Number.MAX_SAFE_INTEGER) - (b.nativeOrder ?? Number.MAX_SAFE_INTEGER) || a.originalName.localeCompare(b.originalName))
    .map((project) => projectEntry(project))
  const chats = visibleProjects.find((project) => project.kind === 'chats')
  const projectSections: CodexProjectSection[] = [
    { id: 'pinned', title: 'Pinned', entries: normalizedPinnedEntries },
    { id: 'projects', title: 'Projects', entries: regularProjects },
    { id: 'chats', title: 'Chats', entries: chats ? [projectEntry(chats)] : [] }
  ]
  const normalizedReceipts = normalizeCodexReceipts([...receiptMap.values()])
  const counts = countConversationTasks(ongoing, stopped, completedUnread, completed, hidden)
  return {
    snapshot: {
      version: 3,
      status: 'ok',
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
      projects: projectCards,
      hiddenProjects: hiddenProjectCards,
      removedProjects: [],
      activeTab: normalizeCodexVisibleTaskTab(input.activeTab),
      ...counts,
      pendingRecoveredCount: 0,
      pendingUnresolvedCount: 0,
      pendingRecoveryStatus: 'idle',
      updatedAt: now,
      partial: input.partial === true,
      sourceCount: input.sourceCount ?? validThreads.length,
      rawSourceCount: input.rawSourceCount ?? input.sourceCount ?? validThreads.length,
      eligibleSourceCount: input.eligibleSourceCount ?? validThreads.length,
      excludedSourceCount: input.excludedSourceCount ?? 0,
      nonConversationCount: input.nonConversationCount ?? 0,
      sourceFingerprint: typeof input.sourceFingerprint === 'string' ? input.sourceFingerprint.slice(0, 128) : '',
      completeness: input.completeness === 'verified' ? 'verified' : 'unknown',
      authority: inferredTaskAuthority(validThreads, input.authority)
    },
    receipts: normalizedReceipts,
    lastTaskScanAt: now,
    statuses,
    pendingKeys: [...completedUnread, ...hidden.filter((task) => task.bucket === 'completed-unread')].map((task) => task.key)
  }
}

export function conversationSnapshotFromReceipts(
  receipts: CodexThreadReceipt[],
  status: ConversationSnapshotV1['status'] = 'idle'
): ConversationSnapshotV1 {
  // Receipts are local hide watermarks, not inventory or unread authority.
  // Without a current verified host row there is deliberately no task to render.
  void receipts
  return emptyConversationSnapshot(status)
}

export function dismissCodexThread(receipts: CodexThreadReceipt[], key: string, activityRecency: number, now = Date.now()): CodexThreadReceipt[] {
  if (!RECEIPT_KEY.test(key) || !Number.isFinite(activityRecency) || activityRecency <= 0) return normalizeCodexReceipts(receipts)
  const byKey = new Map(normalizeCodexReceipts(receipts).map((receipt) => [receipt.key, { ...receipt }]))
  const receipt = byKey.get(key) || { key, acknowledgedRecency: 0, acknowledgedAt: 0, pendingRecency: 0, pendingSince: 0 }
  receipt.dismissedActivityRecency = Math.max(receipt.dismissedActivityRecency || 0, activityRecency)
  receipt.dismissedAt = now
  byKey.set(key, receipt)
  return normalizeCodexReceipts([...byKey.values()])
}

export function acknowledgeCodexCompletedUnread(receipts: CodexThreadReceipt[], key: string, completionRevision: number, now = Date.now()): CodexThreadReceipt[] {
  if (!RECEIPT_KEY.test(key) || !Number.isFinite(completionRevision) || completionRevision <= 0) return normalizeCodexReceipts(receipts)
  const byKey = new Map(normalizeCodexReceipts(receipts).map((receipt) => [receipt.key, { ...receipt }]))
  const receipt = byKey.get(key) || { key, acknowledgedRecency: 0, acknowledgedAt: 0, pendingRecency: 0, pendingSince: 0 }
  receipt.completedUnreadAcknowledgedRevision = Math.max(receipt.completedUnreadAcknowledgedRevision || 0, completionRevision)
  receipt.completedUnreadAcknowledgedAt = Math.max(receipt.completedUnreadAcknowledgedAt || 0, now)
  byKey.set(key, receipt)
  return normalizeCodexReceipts([...byKey.values()])
}

export function hideCodexThread(
  receipts: CodexThreadReceipt[],
  key: string,
  recency: number,
  kind: 'activity' | 'pending' | CodexTaskBucket,
  now = Date.now()
): CodexThreadReceipt[] {
  if (!RECEIPT_KEY.test(key) || !Number.isFinite(recency) || recency <= 0) return normalizeCodexReceipts(receipts)
  const byKey = new Map(normalizeCodexReceipts(receipts).map((receipt) => [receipt.key, { ...receipt }]))
  const receipt = byKey.get(key) || { key, acknowledgedRecency: 0, acknowledgedAt: 0, pendingRecency: 0, pendingSince: 0 }
  if (kind === 'pending' || kind === 'completed-unread') {
    receipt.pendingRecency = 0
    receipt.pendingSince = 0
    delete receipt.pendingMode
    delete receipt.hiddenPendingRecency
    delete receipt.hiddenPendingAt
  }
  receipt.dismissedActivityRecency = Math.max(receipt.dismissedActivityRecency || 0, recency)
  receipt.dismissedAt = now
  byKey.set(key, receipt)
  return normalizeCodexReceipts([...byKey.values()])
}

export function restoreCodexThread(
  receipts: CodexThreadReceipt[],
  key: string,
  recency: number,
  kind: 'task' | 'activity' | 'pending'
): CodexThreadReceipt[] {
  if (!RECEIPT_KEY.test(key) || !Number.isFinite(recency) || recency <= 0) return normalizeCodexReceipts(receipts)
  const byKey = new Map(normalizeCodexReceipts(receipts).map((receipt) => [receipt.key, { ...receipt }]))
  const receipt = byKey.get(key)
  if (!receipt) return [...byKey.values()]
  const dismissedMatches = (receipt.dismissedActivityRecency || 0) === recency
  const legacyPendingMatches = kind === 'pending' && (receipt.hiddenPendingRecency || 0) === recency
  if (!dismissedMatches && !legacyPendingMatches) return [...byKey.values()]
  if (dismissedMatches) {
    delete receipt.dismissedActivityRecency
    delete receipt.dismissedAt
  }
  if (legacyPendingMatches) {
    delete receipt.hiddenPendingRecency
    delete receipt.hiddenPendingAt
  }
  byKey.set(key, receipt)
  return normalizeCodexReceipts([...byKey.values()])
}
