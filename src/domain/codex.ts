export type CodexDisplayStyle = 'water' | 'card'
export type CodexQuotaRefreshMinutes = 5 | 10 | 15 | 30 | 0
export type CodexTaskRefreshSeconds = 15 | 30 | 60 | 0
export type CodexFloatEdge = 'left' | 'right' | 'top' | 'bottom'
export type CodexCompactField = 'short' | 'weekly' | 'tasks'
export type CodexExpandedField = 'plan' | 'short' | 'weekly' | 'reset' | 'config' | 'tasks' | 'updatedAt'
export type CodexEnvironmentPlatform = 'macos' | 'windows' | 'unsupported'
export type CodexRuntimeSource = 'configured' | 'volta' | 'npm-global' | 'local' | 'homebrew' | 'nvm' | 'path' | 'unknown'
export type CodexRuntimeState = 'detected' | 'missing' | 'unusable' | 'unsupported'
export type CodexProcessState = 'running' | 'not-running' | 'unknown'
export type CodexConfigFileState = 'loaded' | 'detected' | 'missing' | 'unreadable' | 'unknown'
export type CodexConnectionState = 'not-checked' | 'connected' | 'failed'
export type CodexTaskAuthority = 'live' | 'mixed' | 'inventory-only'
export type CodexTaskTab = 'all' | 'ongoing' | 'hidden' | 'completed' | 'projects'
export type CodexProjectSectionId = 'pinned' | 'projects' | 'chats'
export type CodexWaterPalette = 'solid' | 'gradient' | 'aurora'
export type CodexWaterMotion = 'static' | 'slow' | 'normal' | 'fast'
export type CodexWaterOuterStyle = 'solid' | 'segmented'
export type CodexWaterColorMode = 'quota' | 'custom'
export type CodexWaterGlow = 'off' | 'soft' | 'strong'

export interface CodexQuotaBucket {
  remainingPercent: number
  resetAt: number | null
  windowMinutes: number | null
}

export interface CodexQuotaSnapshotV1 {
  version: 1
  status: 'idle' | 'loading' | 'ok' | 'stale' | 'error'
  plan: string
  short: CodexQuotaBucket | null
  weekly: CodexQuotaBucket | null
  updatedAt: number
  errorCode?: string
  errorMessage?: string
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
  checkedAt: number
  errorCode?: CodexBridgeError['code']
}

export type CodexThreadStatus = 'active' | 'idle' | 'notLoaded' | 'systemError'
export type CodexThreadActiveFlag = 'waitingOnApproval' | 'waitingOnUserInput'
export type CodexTurnStatus = 'completed' | 'interrupted' | 'failed' | 'inProgress'

export interface CodexHostThread {
  /** Provider-issued stable anonymous correlation key; never a raw thread id. */
  key: string
  /** Short-lived provider action alias; never an arbitrary URL or raw thread id. */
  actionAlias: string
  name: string
  status: CodexThreadStatus
  activeFlags: CodexThreadActiveFlag[]
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

export interface CodexHostSnapshotV1 {
  version: 1
  receivedAt: number
  quota?: {
    plan: string
    short: CodexQuotaBucket | null
    weekly: CodexQuotaBucket | null
  }
  config?: Omit<CodexConfigSnapshotV1, 'version' | 'updatedAt'>
  threads?: CodexHostThread[]
  threadsPartial?: boolean
  taskAuthority?: CodexTaskAuthority
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
}

export type CodexHostSnapshot = CodexHostSnapshotV1 | CodexHostSnapshotV2

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
  errorCode?: string
  message?: string
}

export interface CodexThreadArchiveRequest {
  expectedUpdatedAt: number
  expectedRevisionAt: number
  expectedCompletionAt?: number
  expectedLastTurnStartedAt?: number
  expectedSourceFingerprint?: string
  evidence: 'completed' | 'terminal' | 'unknown'
}

export interface CodexProjectArchiveRequest {
  expectedSourceFingerprint: string
}

export interface CodexProjectArchiveResult {
  outcome: 'complete' | 'partial' | 'failed'
  archivedKeys: string[]
  skippedActiveKeys: string[]
  failed: Array<{ key: string; errorCode: string }>
  errorCode?: string
  message?: string
}

export interface CodexThreadReceipt {
  key: string
  acknowledgedRecency: number
  acknowledgedAt: number
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
}

export interface CodexWaterAppearanceSettings {
  inner: {
    palette: CodexWaterPalette
    colorA: string
    colorB: string
    opacity: number
    amplitude: number
    motion: CodexWaterMotion
  }
  outer: {
    style: CodexWaterOuterStyle
    thickness: number
    colorMode: CodexWaterColorMode
    progressColor: string
    trackColor: string
    glow: CodexWaterGlow
  }
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
  /** Rolling last-question window used by every Codex task tab. */
  timeWindowDays: number
  compactFields: CodexCompactField[]
  expandedFields: CodexExpandedField[]
  colors: CodexColorSettings
  waterAppearance: CodexWaterAppearanceSettings
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
  lastTaskTab: CodexTaskTab
  collapsedProjectKeys: string[]
  taskAliases: CodexAliasEntry[]
  projectAliases: CodexAliasEntry[]
  localPins: CodexLocalPin[]
  removedProjectKeys: string[]
  /** Removed projects that have since been observed absent from Codex. */
  removedProjectAbsentKeys: string[]
}

export type CodexTaskBucket = 'ongoing' | 'completed-unread' | 'completed'
export type CodexTaskActivityState = 'active' | 'waiting-input' | 'waiting-approval' | 'failed' | 'interrupted' | 'system-error' | 'unknown'
export type CodexArchiveCapability = 'blocked-active' | 'allowed' | 'allowed-with-warning'

export interface CodexTaskCard {
  key: string
  actionAlias?: string
  name: string
  /** V2 primary state. Hiding is intentionally orthogonal to this bucket. */
  bucket: CodexTaskBucket
  activityState: CodexTaskActivityState
  archiveCapability: CodexArchiveCapability
  /** Latest task revision used by hide/restore. Completed tasks use completionRevision. */
  revisionAt: number
  /** Privacy-safe persisted completion watermark, never turn content. */
  completionRevision?: number
  /** Latest Turn.startedAt; this is the only field used as “last question time”. */
  lastQuestionAt?: number
  /** Deprecated presentation state retained while old persisted renderers migrate. */
  state: 'running' | 'recent-activity' | 'waiting-approval' | 'waiting-input' | 'attention' | 'pending-review'
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
  completedUnread: CodexTaskCard[]
  completed: CodexTaskCard[]
  /** Deprecated V1 alias of completedUnread. */
  pending: CodexTaskCard[]
  hidden: CodexTaskCard[]
  /** V3 tab projections. V2 readers can continue using the legacy arrays above. */
  all: CodexTaskCard[]
  completedTab: CodexTaskCard[]
  projectSections: CodexProjectSection[]
  projects: CodexProjectCard[]
  removedProjects: CodexProjectCard[]
  activeTab: CodexTaskTab
  /** Exact App Server `active` tasks, including waiting input/approval. */
  ongoingCount: number
  waitingCount: number
  runningCount: number
  /** Cross-process activity whose live status is not observable by this App Server. */
  unknownCount: number
  attentionCount: number
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

const HEX_COLOR = /^#[0-9a-f]{6}$/i
const RECEIPT_KEY = /^[a-f0-9]{16,64}$/
const PROJECT_KEY = /^(?:[a-f0-9]{16,64}|chats)$/
const COMPACT_FIELDS: CodexCompactField[] = ['short', 'weekly', 'tasks']
const EXPANDED_FIELDS: CodexExpandedField[] = ['plan', 'short', 'weekly', 'reset', 'config', 'tasks', 'updatedAt']

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
  return typeof value === 'string' && HEX_COLOR.test(value) ? value.toUpperCase() : fallback
}

function isValidColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value)
}

function colorLuminance(value: string): number {
  const channels = [value.slice(1, 3), value.slice(3, 5), value.slice(5, 7)]
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

function normalizeColors(value: unknown, fallback: CodexColorSettings): CodexColorSettings {
  const source = record(value)
  const hasWaterSetting = Object.prototype.hasOwnProperty.call(source, 'water')
  const legacyCard = isValidColor(source.card) ? source.card.toUpperCase() : null
  const legacyCardIsDark = legacyCard !== null && colorLuminance(legacyCard) < 0.5

  return {
    healthy: color(source.healthy, fallback.healthy),
    warning: color(source.warning, fallback.warning),
    critical: color(source.critical, fallback.critical),
    water: hasWaterSetting
      ? color(source.water, fallback.water)
      : legacyCardIsDark ? legacyCard : fallback.water,
    card: hasWaterSetting
      ? color(source.card, fallback.card)
      : legacyCard && !legacyCardIsDark ? legacyCard : fallback.card
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
      colorA: colors.water,
      colorB: mixColorHex(colors.water, colors.healthy, 0.35),
      opacity: 78,
      amplitude: 8,
      motion: 'normal'
    },
    outer: {
      style: 'solid',
      thickness: 5,
      colorMode: 'quota',
      progressColor: colors.healthy,
      trackColor: mixColorHex(colors.water, '#FFFFFF', 0.45),
      glow: 'soft'
    }
  }
}

function defaultCodexSettingsColors(): CodexColorSettings {
  return { healthy: '#23B5A5', warning: '#F2A93B', critical: '#EF5B68', water: '#102C3C', card: '#F7F9F7' }
}

export function normalizeCodexWaterAppearance(value: unknown, colors: CodexColorSettings, fallback = defaultCodexWaterAppearance(colors)): CodexWaterAppearanceSettings {
  const source = record(value)
  const inner = record(source.inner)
  const outer = record(source.outer)
  return {
    inner: {
      palette: enumValue(inner.palette, ['solid', 'gradient', 'aurora'] as const, fallback.inner.palette),
      colorA: color(inner.colorA, fallback.inner.colorA),
      colorB: color(inner.colorB, fallback.inner.colorB),
      opacity: boundedInteger(inner.opacity, 40, 95, fallback.inner.opacity),
      amplitude: boundedInteger(inner.amplitude, 4, 12, fallback.inner.amplitude),
      motion: enumValue(inner.motion, ['static', 'slow', 'normal', 'fast'] as const, fallback.inner.motion)
    },
    outer: {
      style: enumValue(outer.style, ['solid', 'segmented'] as const, fallback.outer.style),
      thickness: boundedInteger(outer.thickness, 2, 6, fallback.outer.thickness),
      colorMode: enumValue(outer.colorMode, ['quota', 'custom'] as const, fallback.outer.colorMode),
      progressColor: color(outer.progressColor, fallback.outer.progressColor),
      trackColor: color(outer.trackColor, fallback.outer.trackColor),
      glow: enumValue(outer.glow, ['off', 'soft', 'strong'] as const, fallback.outer.glow)
    }
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

export function emptyCodexQuota(status: CodexQuotaSnapshotV1['status'] = 'idle'): CodexQuotaSnapshotV1 {
  return { version: 1, status, plan: '', short: null, weekly: null, updatedAt: 0 }
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
    checkedAt: 0
  }
}

export function emptyConversationSnapshot(status: ConversationSnapshotV1['status'] = 'idle'): ConversationSnapshotV1 {
  return {
    version: 3,
    status,
    ongoing: [],
    completedUnread: [],
    completed: [],
    pending: [],
    hidden: [],
    all: [],
    completedTab: [],
    projectSections: [],
    projects: [],
    removedProjects: [],
    activeTab: 'ongoing',
    ongoingCount: 0,
    waitingCount: 0,
    runningCount: 0,
    unknownCount: 0,
    attentionCount: 0,
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
    timeWindowDays: 30,
    compactFields: [...COMPACT_FIELDS],
    expandedFields: [...EXPANDED_FIELDS],
    colors,
    waterAppearance: defaultCodexWaterAppearance(colors),
    position: { displayId: '', x: null, y: null, edge: 'right' },
    expandedSizes: []
  }
}

export function normalizeCodexSettings(value: unknown): CodexSettings {
  const fallback = defaultCodexSettings()
  const source = record(value)
  const position = record(source.position)
  const colors = normalizeColors(source.colors, fallback.colors)
  return {
    floatEnabled: source.floatEnabled === true,
    displayStyle: enumValue(source.displayStyle, ['water', 'card'] as const, fallback.displayStyle),
    conversationInboxEnabled: source.conversationInboxEnabled !== false,
    quotaRefreshMinutes: enumValue(source.quotaRefreshMinutes, [0, 5, 10, 15, 30] as const, fallback.quotaRefreshMinutes),
    taskRefreshSeconds: enumValue(source.taskRefreshSeconds, [0, 15, 30, 60] as const, fallback.taskRefreshSeconds),
    timeWindowDays: boundedInteger(source.timeWindowDays, 1, 365, fallback.timeWindowDays),
    compactFields: orderedFields(source.compactFields, COMPACT_FIELDS, fallback.compactFields),
    expandedFields: orderedFields(source.expandedFields, EXPANDED_FIELDS, fallback.expandedFields),
    colors,
    waterAppearance: normalizeCodexWaterAppearance(source.waterAppearance, colors, defaultCodexWaterAppearance(colors)),
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

export function normalizeCodexQuota(value: unknown): CodexQuotaSnapshotV1 {
  const source = record(value)
  const status = enumValue(source.status, ['idle', 'loading', 'ok', 'stale', 'error'] as const, 'idle')
  return {
    version: 1,
    status,
    plan: typeof source.plan === 'string' ? source.plan.slice(0, 64) : '',
    short: normalizeBucket(source.short),
    weekly: normalizeBucket(source.weekly),
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
  return {
    version: 1,
    checking: source.checking === true,
    platform: enumValue(source.platform, ['macos', 'windows', 'unsupported'] as const, 'unsupported'),
    runtimeState: enumValue(source.runtimeState, ['detected', 'missing', 'unusable', 'unsupported'] as const, 'unsupported'),
    runtimeSource: enumValue(source.runtimeSource, ['configured', 'volta', 'npm-global', 'local', 'homebrew', 'nvm', 'path', 'unknown'] as const, 'unknown'),
    processState: enumValue(source.processState, ['running', 'not-running', 'unknown'] as const, 'unknown'),
    configState: enumValue(source.configState, ['loaded', 'detected', 'missing', 'unreadable', 'unknown'] as const, 'unknown'),
    connectionState: enumValue(source.connectionState, ['not-checked', 'connected', 'failed'] as const, 'not-checked'),
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
      pendingRecency: numberValue(source.pendingRecency, 0),
      pendingSince: numberValue(source.pendingSince, 0),
      ...(source.pendingMode === 'completion' || source.pendingMode === 'recency' ? { pendingMode: source.pendingMode } : {}),
      ...(numberValue(source.dismissedActivityRecency, 0) > 0 ? { dismissedActivityRecency: numberValue(source.dismissedActivityRecency, 0) } : {}),
      ...(numberValue(source.dismissedAt, 0) > 0 ? { dismissedAt: numberValue(source.dismissedAt, 0) } : {}),
      ...(numberValue(source.hiddenPendingRecency, 0) > 0 ? { hiddenPendingRecency: numberValue(source.hiddenPendingRecency, 0) } : {}),
      ...(numberValue(source.hiddenPendingAt, 0) > 0 ? { hiddenPendingAt: numberValue(source.hiddenPendingAt, 0) } : {})
    }
    const previous = byKey.get(key)
    const receiptWatermark = Math.max(receipt.pendingRecency, receipt.acknowledgedRecency, receipt.dismissedActivityRecency || 0, receipt.hiddenPendingRecency || 0)
    const previousWatermark = Math.max(previous?.pendingRecency || 0, previous?.acknowledgedRecency || 0, previous?.dismissedActivityRecency || 0, previous?.hiddenPendingRecency || 0)
    if (!previous || receiptWatermark >= previousWatermark) byKey.set(key, receipt)
  }
  const sorted = [...byKey.values()]
    .sort((a, b) => Math.max(b.pendingRecency, b.acknowledgedRecency, b.dismissedActivityRecency || 0, b.hiddenPendingRecency || 0) - Math.max(a.pendingRecency, a.acknowledgedRecency, a.dismissedActivityRecency || 0, a.hiddenPendingRecency || 0))
  const durableUserManaged = sorted.filter((receipt) =>
    (receipt.pendingMode === 'completion' && receipt.pendingRecency > receipt.acknowledgedRecency)
    || (receipt.dismissedActivityRecency || 0) > 0
  )
  const boundedBookkeeping = sorted.filter((receipt) => !durableUserManaged.includes(receipt)).slice(0, 100)
  return [...durableUserManaged, ...boundedBookkeeping]
    .sort((a, b) => Math.max(b.pendingRecency, b.acknowledgedRecency, b.dismissedActivityRecency || 0, b.hiddenPendingRecency || 0) - Math.max(a.pendingRecency, a.acknowledgedRecency, a.dismissedActivityRecency || 0, a.hiddenPendingRecency || 0))
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
    removedProjectKeys: [],
    removedProjectAbsentKeys: []
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
    lastTaskTab: enumValue(source.lastTaskTab, ['all', 'ongoing', 'hidden', 'completed', 'projects'] as const, 'ongoing'),
    collapsedProjectKeys: normalizeAnonymousKeys(source.collapsedProjectKeys, 500, true),
    taskAliases: normalizeCodexAliases(source.taskAliases),
    projectAliases: normalizeCodexAliases(source.projectAliases, true),
    localPins: normalizeCodexLocalPins(source.localPins),
    removedProjectKeys: normalizeAnonymousKeys(source.removedProjectKeys, 200, true).filter((key) => key !== 'chats'),
    removedProjectAbsentKeys: normalizeAnonymousKeys(source.removedProjectAbsentKeys, 200, true).filter((key) => key !== 'chats')
  }
}

function taskActivityState(thread: CodexHostThread): CodexTaskActivityState {
  if (thread.status === 'active' || thread.lastTurnStatus === 'inProgress') {
    if (thread.activeFlags.includes('waitingOnUserInput')) return 'waiting-input'
    if (thread.activeFlags.includes('waitingOnApproval')) return 'waiting-approval'
    return 'active'
  }
  if (thread.lastTurnStatus === 'failed') return 'failed'
  if (thread.lastTurnStatus === 'interrupted') return 'interrupted'
  if (thread.status === 'systemError') return 'system-error'
  return 'unknown'
}

function legacyTaskState(bucket: CodexTaskBucket, activityState: CodexTaskActivityState): CodexTaskCard['state'] {
  if (bucket === 'completed-unread') return 'pending-review'
  if (bucket === 'completed') return 'recent-activity'
  if (activityState === 'waiting-input') return 'waiting-input'
  if (activityState === 'waiting-approval') return 'waiting-approval'
  if (activityState === 'active') return 'running'
  if (activityState === 'unknown') return 'recent-activity'
  return 'attention'
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
  completedUnread: CodexTaskCard[],
  completed: CodexTaskCard[],
  hidden: CodexTaskCard[] = []
) {
  const waitingCount = ongoing.filter((task) => task.activityState === 'waiting-input' || task.activityState === 'waiting-approval').length
  const runningCount = ongoing.filter((task) => task.activityState === 'active').length
  const unknownCount = ongoing.filter((task) => task.activityState === 'unknown').length
  const attentionCount = ongoing.filter((task) => ['failed', 'interrupted', 'system-error'].includes(task.activityState)).length
  return {
    ongoingCount: waitingCount + runningCount,
    waitingCount,
    runningCount,
    unknownCount,
    attentionCount,
    completedUnreadCount: completedUnread.length,
    completedCount: completed.length,
    pendingCount: completedUnread.length,
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
  removedProjectKeys?: string[]
  sourceFingerprint?: string
  completeness?: 'verified'
  rawSourceCount?: number
  eligibleSourceCount?: number
  excludedSourceCount?: number
  nonConversationCount?: number
}): ConversationProjection {
  const now = input.now ?? Date.now()
  const windowStart = typeof input.timeWindowDays === 'number'
    ? now - boundedInteger(input.timeWindowDays, 1, 365, 30) * 24 * 60 * 60 * 1000
    : 0
  const firstBaseline = input.lastTaskScanAt <= 0
  const receiptMap = new Map(normalizeCodexReceipts(input.receipts).map((receipt) => [receipt.key, { ...receipt }]))
  const taskAliases = new Map(normalizeCodexAliases(input.taskAliases).map((entry) => [entry.key, entry.alias]))
  const projectAliases = new Map(normalizeCodexAliases(input.projectAliases, true).map((entry) => [entry.key, entry.alias]))
  const collapsedProjects = new Set(normalizeAnonymousKeys(input.collapsedProjectKeys, 500, true))
  const removedProjects = new Set(normalizeAnonymousKeys(input.removedProjectKeys, 200, true))
  const localPins = normalizeCodexLocalPins(input.localPins)
  const statuses: Record<string, CodexThreadStatus> = {}
  const ongoing: CodexTaskCard[] = []
  const completedUnread: CodexTaskCard[] = []
  const completed: CodexTaskCard[] = []
  const hidden: CodexTaskCard[] = []
  const validThreads = [...new Map(input.threads
    .filter((thread) => RECEIPT_KEY.test(thread.key)
      && Boolean(thread.actionAlias)
      && Number.isFinite(thread.updatedAt)
      && thread.updatedAt > 0
      && (!windowStart || (numberValue(thread.lastTurnStartedAt, 0) >= windowStart)))
    .map((thread) => [thread.key, thread] as const)).values()]

  for (const thread of validThreads) {
    statuses[thread.key] = thread.status
    const timing = taskTiming(thread)
    const receipt = receiptMap.get(thread.key) || { key: thread.key, acknowledgedRecency: 0, acknowledgedAt: 0, pendingRecency: 0, pendingSince: 0 }
    const authoritativeActive = thread.status === 'active' || thread.lastTurnStatus === 'inProgress'
    const completionRevision = !authoritativeActive && thread.lastTurnStatus === 'completed'
      ? numberValue(thread.lastTurnCompletedAt, 0) || numberValue(thread.lastTurnStartedAt, 0)
      : 0

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

    const legacyUnread = completionRevision > 0
      && receipt.pendingRecency > receipt.acknowledgedRecency
    if (completionRevision > 0 && firstBaseline && !legacyUnread && receipt.acknowledgedRecency <= 0 && completionRevision > receipt.acknowledgedRecency) {
      // Historical completions form the viewed baseline. Only a completion
      // observed after that baseline (or a legacy unread receipt) is unread.
      receipt.acknowledgedRecency = completionRevision
      receipt.acknowledgedAt = now
    }

    const unread = completionRevision > 0
      && (legacyUnread || completionRevision > receipt.acknowledgedRecency)
    if (unread) {
      const isNewRevision = completionRevision !== receipt.pendingRecency
      receipt.pendingRecency = completionRevision
      receipt.pendingMode = 'completion'
      if (!receipt.pendingSince || isNewRevision) receipt.pendingSince = now
    } else if (completionRevision > 0 && receipt.pendingMode === 'completion' && receipt.pendingRecency <= receipt.acknowledgedRecency) {
      receipt.pendingRecency = 0
      receipt.pendingSince = 0
      delete receipt.pendingMode
    }

    const bucket: CodexTaskBucket = authoritativeActive
      ? 'ongoing'
      : completionRevision > 0
        ? unread ? 'completed-unread' : 'completed'
        : 'ongoing'
    const activityState = taskActivityState(thread)
    const archiveCapability: CodexArchiveCapability = authoritativeActive
      ? 'blocked-active'
      : completionRevision > 0 || activityState === 'failed' || activityState === 'interrupted'
        ? 'allowed'
        : 'allowed-with-warning'
    const revisionAt = completionRevision || thread.updatedAt
    if ((receipt.dismissedActivityRecency || 0) > 0 && revisionAt > (receipt.dismissedActivityRecency || 0)) {
      delete receipt.dismissedActivityRecency
      delete receipt.dismissedAt
    }

    const card: CodexTaskCard = {
      key: thread.key,
      actionAlias: thread.actionAlias,
      name: taskAliases.get(thread.key) || thread.name || '未命名任务',
      originalName: thread.name || '未命名任务',
      ...(taskAliases.get(thread.key) ? { alias: taskAliases.get(thread.key) } : {}),
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
      state: legacyTaskState(bucket, activityState),
      ...(authoritativeActive ? { activeFlags: [...thread.activeFlags] } : {}),
      updatedAt: thread.updatedAt,
      ...(unread ? { pendingSince: receipt.pendingSince } : {}),
      source: 'current',
      canArchive: archiveCapability !== 'blocked-active',
      ...timing
    }
    card.projectName = projectAliases.get(card.projectKey) || card.originalProjectName
    const isHidden = (receipt.dismissedActivityRecency || 0) >= revisionAt
    card.isHidden = isHidden
    if (thread.nativePinned) card.pinSource = 'native'
    if (removedProjects.has(card.projectKey)) {
      if (receipt.pendingRecency || receipt.acknowledgedRecency || receipt.dismissedActivityRecency || receipt.hiddenPendingRecency) receiptMap.set(thread.key, receipt)
      continue
    }
    if (isHidden) hidden.push({ ...card, hiddenKind: 'task' })
    else if (bucket === 'completed-unread') completedUnread.push(card)
    else if (bucket === 'completed') completed.push(card)
    else ongoing.push(card)

    if (receipt.pendingRecency || receipt.acknowledgedRecency || receipt.dismissedActivityRecency || receipt.hiddenPendingRecency) receiptMap.set(thread.key, receipt)
  }

  ongoing.sort(compareConversationTasks)
  completedUnread.sort(compareConversationTasks)
  completed.sort(compareConversationTasks)
  hidden.sort(compareConversationTasks)
  const all = [...ongoing, ...completedUnread, ...completed, ...hidden].sort(compareConversationTasks)
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
      collapsed: collapsedProjects.has(project.key),
      tasks: all.filter((task) => task.projectKey === project.key)
    }
  })
  const removedProjectCards = projectCards.filter((project) => removedProjects.has(project.key))
  const visibleProjects = projectCards.filter((project) => !removedProjects.has(project.key))
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

  input.threads
    .filter((thread) => thread.nativePinned && taskByKey.has(thread.key))
    .sort((a, b) => (a.nativePinnedOrder ?? Number.MAX_SAFE_INTEGER) - (b.nativePinnedOrder ?? Number.MAX_SAFE_INTEGER))
    .forEach((thread) => pushPinnedTask(taskByKey.get(thread.key)!, 'native'))
  visibleProjects
    .filter((project) => project.nativePinned)
    .sort((a, b) => (a.nativePinnedOrder ?? Number.MAX_SAFE_INTEGER) - (b.nativePinnedOrder ?? Number.MAX_SAFE_INTEGER))
    .forEach((project) => pushPinnedProject(project, 'native'))
  for (const pin of localPins) {
    if (pin.kind === 'task') {
      const task = taskByKey.get(pin.key)
      if (task) pushPinnedTask(task, task.pinSource === 'native' ? 'native' : 'local')
    } else {
      const project = projectByKey.get(pin.key)
      if (project) pushPinnedProject(project, project.nativePinned ? 'native' : 'local')
    }
  }

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
  const counts = countConversationTasks(ongoing, completedUnread, completed, hidden)
  return {
    snapshot: {
      version: 3,
      status: 'ok',
      ongoing,
      completedUnread,
      completed,
      pending: completedUnread,
      hidden,
      all,
      completedTab,
      projectSections,
      projects: visibleProjects,
      removedProjects: removedProjectCards,
      activeTab: enumValue(input.activeTab, ['all', 'ongoing', 'hidden', 'completed', 'projects'] as const, 'ongoing'),
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
  // Receipts are view watermarks, not inventory. Without a current unarchived
  // App Server row there is deliberately no task to render.
  void receipts
  return emptyConversationSnapshot(status)
}

export function acknowledgeCodexThread(receipts: CodexThreadReceipt[], key: string, recency: number, now = Date.now()): CodexThreadReceipt[] {
  if (!RECEIPT_KEY.test(key)) return normalizeCodexReceipts(receipts)
  const byKey = new Map(normalizeCodexReceipts(receipts).map((receipt) => [receipt.key, { ...receipt }]))
  const receipt = byKey.get(key) || { key, acknowledgedRecency: 0, acknowledgedAt: 0, pendingRecency: 0, pendingSince: 0 }
  receipt.acknowledgedRecency = Math.max(receipt.acknowledgedRecency, receipt.pendingRecency, recency)
  receipt.acknowledgedAt = now
  receipt.pendingRecency = 0
  receipt.pendingSince = 0
  delete receipt.pendingMode
  delete receipt.hiddenPendingRecency
  delete receipt.hiddenPendingAt
  byKey.set(key, receipt)
  return normalizeCodexReceipts([...byKey.values()])
}

export function acknowledgeAllCodexThreads(receipts: CodexThreadReceipt[], now = Date.now(), eligibleKeys?: Iterable<string>): CodexThreadReceipt[] {
  const eligible = eligibleKeys ? new Set(eligibleKeys) : null
  return normalizeCodexReceipts(receipts).map((receipt) => {
    if ((eligible && !eligible.has(receipt.key)) || receipt.pendingRecency <= receipt.acknowledgedRecency) return receipt
    return {
      ...receipt,
      acknowledgedRecency: receipt.pendingRecency,
      acknowledgedAt: now,
      pendingRecency: 0,
      pendingSince: 0,
      pendingMode: undefined,
      hiddenPendingRecency: undefined,
      hiddenPendingAt: undefined
    }
  })
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
    receipt.acknowledgedRecency = Math.max(receipt.acknowledgedRecency, receipt.pendingRecency, recency)
    receipt.acknowledgedAt = now
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
