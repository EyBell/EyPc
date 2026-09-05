import type { CodexState } from './codex'
import type { WindowSlot, WindowTarget } from './windows'

export const FEATURE_MODULE_IDS = ['ports', 'mqtt', 'favorites', 'windows', 'codex', 'settings'] as const
export type AppTabId = typeof FEATURE_MODULE_IDS[number]

export interface FeatureConfig {
  id: AppTabId
  enabled: boolean
  sortOrder: number
}

export const DEFAULT_FEATURE_CONFIGS: readonly FeatureConfig[] = Object.freeze([
  { id: 'ports', enabled: true, sortOrder: 1 },
  { id: 'favorites', enabled: false, sortOrder: 2 },
  { id: 'mqtt', enabled: true, sortOrder: 3 },
  { id: 'windows', enabled: false, sortOrder: 4 },
  { id: 'codex', enabled: true, sortOrder: 5 },
  { id: 'settings', enabled: true, sortOrder: 6 }
])

export interface PortProcess {
  id: string
  pid: number
  port: number
  command: string
  address: string
  protocol: 'tcp'
  state: 'LISTEN'
  user?: string
}

export interface PortGroup {
  id: string
  name: string
  color: string
  entries: string[]
  folderId: string | null
  sortOrder: number
}

export interface PortGroupFolder {
  id: string
  name: string
  color: string
  sortOrder: number
}

export type PortGroupTarget =
  | { kind: 'group'; id: string }
  | { kind: 'folder'; id: string }

export type FavoriteKind = 'file' | 'folder' | 'group'
export type FavoritePlatform = 'darwin' | 'win32' | 'linux'
export type FavoriteRunnerMode = 'background' | 'terminal'
export type FavoriteRunnerCwdMode = 'target-directory' | 'custom'

export type FavoriteRunStatus = 'running' | 'exited' | 'failed' | 'stopped'

/** One background launch as the platform bridge reports it. Local-only; never synced. */
export interface FavoriteRunRecord {
  runId: string
  favoriteId: string
  favoriteName: string
  mode: FavoriteRunnerMode
  status: FavoriteRunStatus
  startedAt: number
  endedAt?: number
  exitCode?: number
  signal?: string
  executable: string
  args: string[]
  cwd: string
  logPath?: string
  logBytes?: number
  logTruncated?: boolean
  declaredLogPath?: string
  declaredLogExists?: boolean
  message?: string
}

export interface FavoriteRunnerConfig {
  mode: FavoriteRunnerMode
  executable: string
  args: string[]
  cwdMode: FavoriteRunnerCwdMode
  cwd?: string
  /** L2: where this runner writes its own log. Informational, never executed or created. */
  logPath?: string
  trustedAt?: number
  trustedFingerprint?: string
}

export interface FavoriteSlot {
  slot: number
  favoriteIdByPlatform: Partial<Record<FavoritePlatform, string>>
}

export interface FavoriteSearchAffinity {
  query: string
  favoriteId: string
  usageCount: number
  lastUsedAt: number
}

export type MqttQos = 0 | 1 | 2
export type MqttMessageDirection = 'incoming' | 'outgoing' | 'event'
export type MqttWorkspaceLayout = 'stack' | 'split'
export type MqttInfoFilter = 'all' | 'incoming' | 'outgoing' | 'favorites'
export type MqttPublishDraftHistorySource = 'overwrite' | 'manual'

export interface MqttLayoutPrefs {
  workspaceLayout: MqttWorkspaceLayout
  stackReceiveRatio: number
  splitReceiveRatio: number
  connectionPanelOpen: boolean
  subscriptionPanelOpen: boolean
  publishRecordsOpen: boolean
  collapsedConnectionGroupIds: string[]
}

export interface MqttViewPrefs {
  infoFilter: MqttInfoFilter
  followLatest: boolean
  activeSubscriptionTopicsByConfigId: Record<string, string[]>
}

export interface MqttConnectionConfig {
  id: string
  name: string
  url: string
  clientId: string
  username: string
  groupId: string | null
  subscriptions: string[]
  subscriptionAliases: Record<string, string>
  subscriptionColors: Record<string, string>
  publishTopic: string
  publishTopics: string[]
  qos: MqttQos
  retain: boolean
  autoReconnect: boolean
  reconnectPeriodMs: number
  connectTimeoutMs: number
  keepaliveSec: number
  clean: boolean
  reconnectOnConnackError: boolean
  resubscribeOnReconnect: boolean
  syncRecords: boolean
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export interface MqttConnectionGroup {
  id: string
  name: string
  color: string
  parentId: string | null
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export interface MqttState {
  configs: MqttConnectionConfig[]
  connectionGroups: MqttConnectionGroup[]
  activeConfigId: string | null
  layoutPrefs: MqttLayoutPrefs
  viewPrefs: MqttViewPrefs
}

export interface MqttPublishDraft {
  topic: string
  payload: string
  qos: MqttQos
  retain: boolean
}

export interface MqttMessageRecord {
  id: string
  connectionId: string
  sessionId: string
  direction: MqttMessageDirection
  topic: string
  payload: string
  qos: MqttQos
  retain: boolean
  timestamp: number
  title?: string
  note?: string
}

export interface MqttSessionRecord {
  id: string
  connectionId: string
  title: string
  note?: string
  startedAt: number
  endedAt?: number
  messages: MqttMessageRecord[]
}

export interface MqttPublishTemplate {
  id: string
  connectionId: string
  title: string
  note?: string
  topic: string
  payload: string
  qos: MqttQos
  retain: boolean
  createdAt: number
  updatedAt: number
  operatedAt?: number
}

export interface MqttPublishDraftHistoryEntry {
  id: string
  connectionId: string
  title: string
  note?: string
  topic: string
  payload: string
  qos: MqttQos
  retain: boolean
  source: MqttPublishDraftHistorySource
  createdAt: number
  updatedAt: number
}

export interface MqttConnectionSnapshot {
  id: string
  name: string
  url: string
  clientId: string
  username: string
  publishTopic: string
  publishTopics: string[]
  qos: MqttQos
  retain: boolean
  syncRecords: boolean
  createdAt: number
  updatedAt: number
}

export interface MqttArchiveState {
  version: 1
  connectionSnapshots: MqttConnectionSnapshot[]
  sessions: MqttSessionRecord[]
  publishTemplates: MqttPublishTemplate[]
  publishDraftHistory: MqttPublishDraftHistoryEntry[]
}

export interface MqttStorageStatus {
  mode: 'sqlite' | 'legacy-dbStorage' | 'browser-localStorage'
  sqliteAvailable: boolean
  dbPath?: string
  migratedLegacyArchive: boolean
  lastError?: string
}

export interface FavoriteNode {
  id: string
  kind: FavoriteKind
  path: string
  name: string
  parentId: string | null
  tags: string[]
  color: string
  sortOrder: number
  createdAt: number
  updatedAt: number
  usageCount?: number
  lastUsedAt?: number
  runnerByPlatform?: Partial<Record<FavoritePlatform, FavoriteRunnerConfig>>
}

export interface FavoriteTreeNode {
  node: FavoriteNode
  depth: number
  children: FavoriteTreeNode[]
}

export interface KeybindingOverride {
  commandId: string
  shortcutId?: string
  shortcutIds?: string[]
  enabled?: boolean
  when?: string
  source?: 'user' | 'removed'
  weight?: number
  disabled?: boolean
}

export type ShortcutProfileId = 'global' | AppTabId

export interface ToolPreviewPrefs {
  hoverPreviewEnabled: boolean
  hoverPreviewDelayMs: number
}

export interface ShortcutProfileState {
  keybindingOverrides: KeybindingOverride[]
  updatedAt: number
}

export type ShortcutProfileMap = Record<ShortcutProfileId, ShortcutProfileState>

export type RuntimeDiagnosticsLevel = 'error' | 'info' | 'debug'

export interface RuntimeDiagnosticsSettings {
  enabled: boolean
  level: RuntimeDiagnosticsLevel
  /** Explicit choices survive later default migrations. */
  userConfigured: boolean
  /** One-time default migration marker for the v3 ownership contract. */
  defaultsRevision?: 3
}

export interface AppSettings {
  keybindingOverrides: KeybindingOverride[]
  shortcutProfiles: ShortcutProfileMap
  featureConfigs: FeatureConfig[]
  toolPreviewPrefs: ToolPreviewPrefs
  preferSqlite: boolean
  runtimeDiagnostics: RuntimeDiagnosticsSettings
}

export interface AppState {
  version: 1
  activeTab: AppTabId
  portSearch: string
  favoriteSearch: string
  windowSearch: string
  searchHistories: {
    ports: {
      processes: string[]
      groups: string[]
    }
    favorites: {
      files: string[]
    }
  }
  portSearchHistory: string[]
  favoriteSearchHistory: string[]
  portGroups: PortGroup[]
  portGroupFolders: PortGroupFolder[]
  collapsedPortGroupFolderIds: string[]
  collapsedFavoriteGroupIds: string[]
  favorites: FavoriteNode[]
  favoriteSlots: FavoriteSlot[]
  favoriteSearchAffinities: FavoriteSearchAffinity[]
  windowTargets: WindowTarget[]
  windowSlots: WindowSlot[]
  mqtt: MqttState
  codex: CodexState
  settings: AppSettings
  settingsTabId: 'shortcuts' | 'maintenance'
  settingsMaintenanceSectionId: 'features' | 'tools' | 'layers' | 'storage' | 'commands' | 'resolution' | 'reservations' | 'runtime-logs' | 'window-diagnostics'
  updatedAt: number
}

export interface KillRequest {
  pid: number
  port: number
  force: boolean
}

export interface KillResult {
  ok: boolean
  pid: number
  port: number
  force: boolean
  error?: string
}
