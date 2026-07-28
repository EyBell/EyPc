import { addFavoriteNode, deleteFavoriteMetadata, favoriteParentOptions, favoritePathIdentityKey, favoriteVirtualChildren, filterFavoriteContainerTree, filterFavoriteGroupTree, filterFavoriteItems, filterFavoriteTree, flattenFavoriteTree, inferFavoriteNameFromPath, isValidFavoriteParent, moveFavoriteNode, normalizeFavoritePath } from '../domain/favorites'
import { DEFAULT_MQTT_LAYOUT_PREFS, MQTT_LAYOUT_RATIO_MAX, MQTT_LAYOUT_RATIO_MIN, appendMqttMessage, buildMqttWebSocketUrl, clearMqttPublishDraftHistory, createMqttClientId, createMqttConnectionConfig, createMqttConnectionSnapshot, createMqttSession, deleteMqttPublishDraftHistory, deleteMqttPublishTemplate, deleteMqttRecord, matchMqttTopicFilter, mqttConnectOptionsFromConfig, mqttPublishTemplateOperationTime, normalizeMqttArchiveState, normalizeMqttTopicColor, parseMqttWebSocketUrl, renameMqttPublishTemplate, renameMqttRecord, saveMqttPublishDraftHistory, saveMqttPublishTemplate, toMqttPublishDraft, touchMqttPublishTemplate, updateMqttPublishDraftHistory } from '../domain/mqtt'
import { buildMqttConnectionTreeRows, deleteMqttConnectionGroup, isValidMqttConnectionGroupParent, moveMqttConnectionTreeTarget, mqttConnectionTreeMoveTarget, normalizeMqttConfigGroupRefs, normalizeMqttConnectionGroups, type MqttConnectionTreeDropPosition, type MqttConnectionTreeRow, type MqttConnectionTreeTarget } from '../domain/mqttConnectionTree'
import { dedupePortProcesses, filterPortProcesses, flattenPortGroupTargets, matchPortGroupProcesses, matchPortGroupTargetProcesses, movePortGroupToFolder, shouldProcessMatchVerifiedPort } from '../domain/ports'
import { applyRecordListDeleteRecovery, computeRecordListDeleteAnchor, toggleRecordListSelection } from '../domain/recordListSelection'
import { resolveDrawerTargets, toggleIdWithAdvance } from '../domain/listSelection'
import { normalizeAppState } from '../domain/state'
import { formatShortcutList } from '../domain/shortcuts'
import { normalizeToolPreviewPrefs } from '../domain/toolPreview'
import { compareWindowRowsByApplication, filterJumpableLiveWindows, normalizeWindowText, targetMatchesLiveWindow, type LiveWindow, type WindowPlatform, type WindowTarget } from '../domain/windows'
import type { CodexFloatPosition, CodexSettings } from '../domain/codex'
import type { AppState, AppTabId, FavoriteNode, FeatureConfig, KillRequest, MqttArchiveState, MqttConnectionConfig, MqttConnectionGroup, MqttInfoFilter, MqttLayoutPrefs, MqttMessageRecord, MqttPublishDraft, MqttPublishDraftHistoryEntry, MqttPublishTemplate, MqttQos, MqttStorageStatus, PortGroup, PortGroupFolder, PortGroupTarget, PortProcess, ShortcutProfileId, ShortcutProfileMap, ToolPreviewPrefs } from '../domain/types'
import type { PortGroupTreeRow } from '../domain/ports'
import { WINDOW_BRIDGE_REVISION, getPlatform, normalizeFileActionResult, type FavoriteDirectoryEntry, type FavoritePathInspection, type FileActionResult, type FileCapabilities, type MqttSecretMap, type PickedFavorite, type PickedFavoriteKind, type WindowActivationOutcome, type WindowActivationReasonCode, type WindowCapability, type WindowEnvironmentPhase, type WindowEnvironmentPhaseSnapshot, type WindowEnvironmentSnapshot, type WindowOperationTrace } from '../platform/eypcPlatform'
import { createActionRuntime } from './action/actionRuntime'
import type { RuntimeActionContext, RuntimeActionRisk } from './action/types'
import { FEATURES, visibleFeatures, type VisibleFeatureDefinition } from './feature/featureRegistry'
import { buildDefaultKeybindings, buildEffectiveKeybindings, normalizeShortcutId, resolveKeybinding } from './keybinding/keybindingRuntime'
import type { KeybindingContext } from './keybinding/keybindingRuntime'
import { resolveMqttConnect, type MqttRuntimeClient } from './mqttClientModule'
import { createCodexController, type CodexFloatSnapshotV1, type CodexRuntimeView } from './codexController'

export interface AppRuntimeSnapshot {
  state: AppState
  codex: CodexRuntimeView
  codexFloat: CodexFloatSnapshotV1
  ports: PortProcess[]
  filteredPorts: PortProcess[]
  filteredPortGroups: PortGroup[]
  portGroupRows: PortGroupTreeRow[]
  selectedPortGroupTarget: PortGroupTarget | null
  portSearchError: string | null
  selectedPortIds: string[]
  selectedFavoriteIds: string[]
  collapsedFavoriteIds: string[]
  focusedPortId: string | null
  focusedPortGroupId: string | null
  focusedPortGroupTarget: PortGroupTarget | null
  selectedPortGroupId: string | null
  activePortPane: PortPaneId
  portGroupSearch: string
  groupSidePanelOpen: boolean
  portDetail: PortDetailState
  portDetailTarget: PortProcess | null
  portGroupDetail: PortGroupDetailState
  portGroupDetailTarget: PortGroupTreeRow | null
  portDrawer: PortDrawerState
  portDrawerItems: PortDrawerItem[]
  searchOverlayOpen: boolean
  searchFocusRequestId: number
  searchBlurRequestId: number
  groupPanelFocusRequestId: number
  listFocusRequestId: number
  listFocusTarget: PortPaneId | null
  searchFocusTarget: SearchFocusTarget
  portGroupDraft: PortGroupDraft | null
  focusedFavoriteId: string | null
  focusedFavoriteGroupId: string | null
  selectedFavoriteGroupId: string | null
  activeFavoritePane: FavoritePaneId
  favoritePaneFocusRequestId: number
  favoriteGroupSearch: string
  favoriteGroupRows: ReturnType<typeof flattenFavoriteTree>
  favoriteContainerRows: ReturnType<typeof flattenFavoriteTree>
  favoriteItemRows: FavoriteNode[]
  favoriteVirtualChildRows: FavoriteNode[]
  favoriteDirectoryEntries: FavoriteDirectoryRow[]
  favoriteDirectoryError: string | null
  favoriteDirectoryLoading: boolean
  favoritePathInspections: Record<string, FavoritePathInspection>
  favoriteCapabilities: FileCapabilities
  favoriteContainerPanelOpen: boolean
  favoriteAddMenuOpen: boolean
  favoriteCanUndoRemoval: boolean
  focusedFavoriteDirectoryPath: string | null
  selectedFavoriteDirectoryPaths: string[]
  selectedFavoriteContainer: FavoriteNode | null
  favoriteDrawer: FavoriteDrawerState
  favoriteDrawerItems: FavoriteDrawerItem[]
  favoriteQuickMode: boolean
  favoritePickReview: FavoritePickReview | null
  favoriteDraft: FavoriteDraft | null
  favoriteParentOptions: FavoriteNode[]
  favoriteRows: ReturnType<typeof flattenFavoriteTree>
  windowCapability: WindowCapability
  windowLoading: boolean
  windowListLoaded: boolean
  windowCacheUpdatedAt: number | null
  windowRows: WindowRow[]
  focusedWindowId: string | null
  selectedWindowIds: string[]
  windowActionsOpen: boolean
  windowActionTarget: WindowRow | null
  windowActionTargets: WindowRow[]
  windowActionsMode: 'single' | 'multi'
  windowDraft: WindowDraft | null
  windowCandidateTargetId: string | null
  windowFocusRequestId: number
  windowActionsFocusRequestId: number
  windowActivationDiagnostics: WindowActivationDiagnostic[]
  windowOperationTraceEnabled: boolean
  windowOperationTraces: WindowOperationDebugRecord[]
  mqttArchive: MqttArchiveState
  mqttArchiveLoaded: boolean
  mqttStorageStatus: MqttStorageStatus
  mqttPanelOpen: boolean
  mqttSubscriptionPanelOpen: boolean
  mqttWorkspaceLayout: MqttWorkspaceLayout
  mqttLayoutPrefs: MqttLayoutPrefs
  toolPreviewPrefs: ToolPreviewPrefs
  mqttLogDrawer: MqttLogDrawerState
  mqttSearch: string
  mqttTemplateSearch: string
  mqttHistorySearch: string
  mqttConnectionStatus: MqttConnectionStatus
  mqttLogs: MqttLogRecord[]
  mqttActiveConfig: MqttConnectionConfig | null
  mqttConnectionRows: MqttConnectionTreeRow[]
  mqttSubscriptionRows: MqttSubscriptionRow[]
  mqttActiveSubscriptionTopic: string | null
  mqttActiveSubscriptionTopics: string[]
  mqttSelectedSubscriptionTopics: string[]
  mqttSelectedConfigIds: string[]
  mqttFocusedSubscriptionTopic: string | null
  mqttFocusTarget: MqttFocusTarget
  mqttFocusRequestId: number
  mqttTopicFilterOpen: boolean
  mqttTopicFilterQuery: string
  mqttTopicFilterActiveIndex: number
  mqttTopicFilterOptions: MqttTopicFilterOption[]
  mqttReceiveFilter: MqttReceiveFilter
  activeMqttPane: MqttPaneId
  activeMqttRecordList: MqttRecordListId
  mqttMessageStats: MqttMessageStats
  mqttSessionRows: MqttSessionRecordView[]
  mqttMessageRows: MqttMessageRecord[]
  mqttSelectedRecord: MqttRecordSelection | null
  mqttSelectedLog: MqttLogRecord | null
  mqttConfigDraft: MqttConfigDraft | null
  mqttConnectionGroupDraft: MqttConnectionGroupDraft | null
  mqttSubscriptionDraft: MqttSubscriptionEditorDraft | null
  mqttPublishDraft: MqttPublishDraft
  mqttPublishScratch: MqttPublishDraft
  mqttPublishActiveField: MqttPublishField
  mqttPublishOptionsOpen: boolean
  mqttPublishOptionsActiveIndex: number
  mqttPublishDraftHistoryOpen: boolean
  mqttPublishDraftHistoryActiveIndex: number
  mqttPublishDraftHistorySelectedIds: string[]
  mqttPublishDraftHistoryEditDraft: MqttPublishDraftHistoryEditDraft | null
  mqttPublishRecordsOpen: boolean
  mqttPublishTemplateRows: MqttPublishTemplate[]
  mqttPublishHistoryRows: MqttMessageRecord[]
  mqttPublishDraftHistoryRows: MqttPublishDraftHistoryEntry[]
  mqttRecordListStates: Record<MqttRecordListId, MqttRecordListState>
  mqttDrawer: MqttDrawerState
  mqttDrawerItems: MqttDrawerItem[]
  mqttPreview: MqttPreviewState
  mqttFavoriteDraft: MqttFavoriteDraft | null
  mqttRecordEditDraft: MqttRecordEditDraft | null
  message: string
  confirm: { title: string; detail: string; onConfirm: () => void } | null
  commandShortcutLabels: Record<string, string>
  visibleFeatures: VisibleFeatureDefinition[]
}

export type PortPaneId = 'groups' | 'results'
export type FavoritePaneId = 'containers' | 'items' | 'directory'
export type MqttPaneId = 'connections' | 'subscriptions' | 'messages' | 'publish' | 'publish-records'
export type MqttRecordListId = 'messages' | 'templates' | 'history'
export type SearchFocusTarget = 'ports' | 'port-groups' | 'mqtt' | 'mqtt-templates' | 'mqtt-history' | 'favorites' | 'favorite-groups' | 'windows'
export type ActiveInputRole = NonNullable<KeybindingContext['activeInputRole']>
export type PortDrawerMode = 'single' | 'multi' | 'group'
export type FavoriteDrawerTargetKind = 'favorite' | 'directory'
export type MqttReceiveFilter = 'all' | 'incoming' | 'outgoing'
export type MqttWorkspaceLayout = 'stack' | 'split'
export type MqttFocusTarget = 'records' | 'topic-filter' | 'publish-topic' | 'publish-payload' | 'publish-options' | 'publish-draft' | 'publish-draft-edit-title' | 'publish-draft-edit-note' | 'publish-draft-edit-topic' | 'publish-draft-edit-payload' | 'connections' | 'subscriptions'
export type MqttPublishField = 'topic' | 'payload'
export type MqttPublishDraftHistoryEditMode = 'rename' | 'edit'
export type MqttPublishDraftHistoryEditField = 'title' | 'note' | 'topic' | 'payload'
export type WindowDraftMode = 'rename' | 'edit'
export type WindowDraftField = 'alias' | 'titleLocator'
export type WindowActivationEntry = 'slot' | 'manual'
export type WindowActivationDiagnosticLevel = 'accepted' | 'blocking'
export type WindowActivationDiagnosticStage = 'entry' | 'capability' | 'resolve' | 'refresh' | 'activate' | 'topmost' | 'visibility'
export type WindowActivationDiagnosticCode =
  | 'target-closed'
  | 'feature-disabled'
  | 'slot-missing'
  | 'slot-unassigned'
  | 'capability-read-failed'
  | 'bridge-stale'
  | 'unsupported-host'
  | 'permission-required'
  | 'refresh-failed'
  | 'refresh-superseded'
  | 'ambiguous-target'
  | 'space-unbound'
  | 'space-unbound-multiwindow'
  | 'space-ambiguous'
  | 'space-switch-timeout'
  | 'target-title-changed'
  | 'focus-denied'
  | 'activation-not-found'
  | 'activation-failed'
  | 'topmost-unsupported'
  | 'topmost-failed'
  | 'workbench-show-failed'
  | 'silent-hide-failed'

export interface WindowActivationDiagnostic {
  id: string
  timestamp: number
  entry: WindowActivationEntry
  slot: number | null
  platform: WindowPlatform | 'unsupported'
  stage: WindowActivationDiagnosticStage
  code: WindowActivationDiagnosticCode
  level: WindowActivationDiagnosticLevel
  message: string
}

export type WindowOperationKind = 'activate' | 'always-on-top'
export type WindowOperationTraceResult = 'success' | 'blocking' | 'target-closed'
export type WindowOperationTraceRuntimeStage = 'entry' | 'capability' | 'cache' | 'resolve' | 'refresh' | 'native' | 'visibility'
export type WindowOperationTraceRuntimeOutcome = 'ok' | 'skipped' | 'not-found' | 'ambiguous' | 'failed' | 'denied' | 'unsupported' | 'unavailable'

/** Development-only session record. It contains the user-authorized target title but no app, PID, handle, native reference, or host output. */
export interface WindowOperationDebugRecord {
  id: string
  timestamp: number
  targetTitle: string
  entry: WindowActivationEntry
  slot: number | null
  platform: WindowPlatform | 'unsupported'
  operation: WindowOperationKind
  result: WindowOperationTraceResult
  code: WindowActivationDiagnosticCode | 'activated' | 'topmost-enabled'
  envSnapshot?: WindowEnvironmentSnapshot
  envSnapshots?: WindowEnvironmentPhaseSnapshot[]
  steps: Array<{
    stage: WindowOperationTraceRuntimeStage | WindowOperationTrace['steps'][number]['stage']
    outcome: WindowOperationTraceRuntimeOutcome | WindowOperationTrace['steps'][number]['outcome']
    detail?: WindowOperationTrace['steps'][number]['detail']
  }>
}
export type MqttRecordSelection =
  | { kind: 'config'; id: string }
  | { kind: 'connection-group'; id: string }
  | { kind: 'subscription'; id: string }
  | { kind: 'session'; id: string }
  | { kind: 'message'; id: string }
  | { kind: 'log'; id: string }
  | { kind: 'publish-template'; id: string }
  | { kind: 'publish-draft-history'; id: string }

export type MqttRecordEditMode = 'rename' | 'edit'
export type MqttRecordEditField = 'title' | 'note' | 'topic' | 'payload' | 'qos' | 'retain'

export interface MqttRecordEditDraft {
  mode: MqttRecordEditMode
  targetKind: 'message' | 'publish-template'
  targetId: string
  title: string
  note: string
  topic: string
  payload: string
  qos: MqttQos
  retain: boolean
  activeField: MqttRecordEditField
}

export interface WindowRow {
  id: string
  live: LiveWindow | null
  target: WindowTarget | null
  displayName: string
  appName: string
  title: string
  favorite: boolean
  pinned: boolean
  slotNumbers: number[]
  focused: boolean
  selected: boolean
  unavailable: boolean
  ambiguous: boolean
}

export interface WindowDraft {
  mode: WindowDraftMode
  targetId: string | null
  sourceWindowId: string | null
  alias: string
  appName: string
  appId: string
  titleLocator: string
  activeField: WindowDraftField
}

export interface MqttPublishDraftHistoryEditDraft {
  mode: MqttPublishDraftHistoryEditMode
  id: string
  title: string
  note: string
  topic: string
  payload: string
  activeField: MqttPublishDraftHistoryEditField
}

export interface MqttConnectionStatus {
  state: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error'
  detail: string
}

export interface MqttLogRecord {
  id: string
  connectionId: string | null
  level: 'info' | 'warn' | 'error'
  message: string
  detail: string
  timestamp: number
}

export interface MqttSessionRecordView {
  id: string
  connectionId: string
  title: string
  note?: string
  startedAt: number
  endedAt?: number
  messageCount: number
  messages: MqttMessageRecord[]
}

export interface MqttSubscriptionRow {
  topic: string
  alias: string
  color: string
  displayName: string
  qos: MqttQos
  unreadCount: number
  active: boolean
  selected: boolean
  focused: boolean
}

export interface MqttTopicFilterOption {
  topic: string
  alias: string
  label: string
  color: string
  active: boolean
  highlighted: boolean
}

export interface MqttRecordListState {
  activeIndex: number
  selectedIds: string[]
}

export interface MqttSubscriptionDraftItem {
  topic: string
  alias: string
  color?: string
}

export interface MqttSubscriptionEditorItem {
  id: string
  topic: string
  alias: string
  color?: string
}

export interface MqttSubscriptionEditorDraft {
  connectionId: string
  items: MqttSubscriptionEditorItem[]
  activeItemId: string | null
  activeField: MqttSubscriptionEditorField
}

export type MqttSubscriptionEditorField = 'alias' | 'topic' | 'color'
export type MqttConfigSubscriptionDraftField = MqttSubscriptionEditorField
export type MqttConfigPublishDraftField = 'topic'

export interface MqttConfigDraft {
  mode: 'create' | 'edit' | 'rename'
  targetId: string | null
  name: string
  url: string
  protocol: 'ws' | 'wss'
  host: string
  port: string
  path: string
  ssl: boolean
  clientId: string
  username: string
  groupId: string | null
  password: string
  subscriptionsText: string
  subscriptionItems: MqttSubscriptionDraftItem[]
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
  activeField: MqttConfigDraftField
  activeSubscriptionIndex: number | null
  activeSubscriptionField: MqttConfigSubscriptionDraftField
  activePublishIndex: number | null
  activePublishField: MqttConfigPublishDraftField
}

export type MqttConfigDraftField =
  | 'name'
  | 'groupId'
  | 'protocol'
  | 'host'
  | 'port'
  | 'path'
  | 'clientId'
  | 'username'
  | 'password'
  | 'subscriptions'
  | 'publishTopic'
  | 'qos'
  | 'connection'
  | 'reconnectPeriodMs'
  | 'connectTimeoutMs'
  | 'keepaliveSec'
  | 'retain'
  | 'autoReconnect'
  | 'clean'
  | 'reconnectOnConnackError'
  | 'resubscribeOnReconnect'
  | 'storage'

interface MqttConfigDraftFocusCell {
  activeField: MqttConfigDraftField
  activeSubscriptionIndex?: number | null
  activeSubscriptionField?: MqttConfigSubscriptionDraftField
  activePublishIndex?: number | null
  activePublishField?: 'topic'
}

export type MqttConnectionGroupDraftMode = 'create' | 'edit' | 'rename' | 'move-parent'
export type MqttConnectionGroupDraftField = 'name' | 'color' | 'parent'

export interface MqttConnectionGroupDraft {
  mode: MqttConnectionGroupDraftMode
  targetId: string | null
  name: string
  color: string
  parentId: string | null
  activeField: MqttConnectionGroupDraftField
}

export interface MqttDrawerState {
  open: boolean
  active: boolean
  activeIndex: number
  targetKind: MqttRecordSelection['kind'] | null
  targetId: string | null
}

export interface MqttLogDrawerState {
  open: boolean
}

export interface MqttMessageStats {
  all: number
  incoming: number
  outgoing: number
}

export interface MqttDrawerItem {
  commandId: string
  title: string
  description: string
  icon: string
  shortcutLabel: string
  risk: RuntimeActionRisk
  enabled: boolean
  args?: Record<string, unknown>
}

export interface MqttPreviewState {
  open: boolean
  targetKind: 'message' | 'publish-template' | 'publish-draft-history' | null
  targetId: string | null
  source: 'hover' | 'keyboard' | 'shift' | null
  scrollTop: number
}

export interface MqttFavoriteDraft {
  targetKind: 'message' | 'publish-template'
  targetId: string
  title: string
  activeField: 'title'
}

export interface PortDetailState {
  open: boolean
  active: boolean
  targetId: string | null
}

export interface PortGroupDetailState {
  open: boolean
  active: boolean
  target: PortGroupTarget | null
}

export interface PortDrawerState {
  open: boolean
  active: boolean
  mode: PortDrawerMode
  activeIndex: number
  targetIds: string[]
  groupTarget: PortGroupTarget | null
}

export interface PortDrawerItem {
  commandId: string
  title: string
  description: string
  icon: string
  shortcutLabel: string
  risk: RuntimeActionRisk
  enabled: boolean
  args?: Record<string, unknown>
}

export interface FavoriteDirectoryRow extends FavoriteDirectoryEntry {
  favorited: boolean
  selected: boolean
  focused: boolean
}

export interface FavoriteDrawerState {
  open: boolean
  active: boolean
  activeIndex: number
  targetKind: FavoriteDrawerTargetKind
  targetIds: string[]
}

export interface FavoriteDrawerItem {
  commandId: string
  title: string
  description: string
  icon: string
  shortcutLabel: string
  risk: RuntimeActionRisk
  enabled: boolean
  args?: Record<string, unknown>
}

export interface ShortcutInputContext {
  textInputFocused: boolean
  activeInputRole?: ActiveInputRole
}

export interface KeybindingUpdateInput {
  commandId: string
  shortcutId?: string
  shortcutIds?: string[]
  enabled?: boolean
  when?: string
  disabled?: boolean
  profileId?: ShortcutProfileId
}

export interface PortGroupDraft {
  mode: 'create' | 'edit' | 'rename' | 'move-folder'
  target: PortGroupTarget | null
  groupId: string | null
  name: string
  entriesText: string
  color: string
  folderId: string | null
  activeField: PortGroupDraftField
}

export type PortGroupDraftField = 'name' | 'entries' | 'color' | 'folder'

export interface FavoriteDraft {
  mode: 'create-group' | 'create-target' | 'edit' | 'rename' | 'move-parent'
  targetId: string | null
  targetIds: string[]
  kind: FavoriteNode['kind']
  name: string
  path: string
  tagsText: string
  color: string
  parentId: string | null
  activeField: FavoriteDraftField
}

export type FavoriteDraftField = 'kind' | 'name' | 'path' | 'tags' | 'color' | 'parent'

export interface FavoritePickReviewItem {
  id: string
  kind: PickedFavoriteKind
  path: string
  name: string
  parentId: string | null
  tagsText: string
  color: string
}

export interface FavoritePickReview {
  kind: PickedFavoriteKind
  parentId: string | null
  items: FavoritePickReviewItem[]
  activeIndex: number
}

interface FavoriteRemovalContext {
  activePane: FavoritePaneId
  selectedIds: string[]
  focusedId: string | null
  focusedGroupId: string | null
  selectedGroupId: string | null
}

interface FavoriteRemovalUndo {
  removed: Array<{ node: FavoriteNode; index: number }>
  collapsedGroupIds: string[]
  before: FavoriteRemovalContext
  after: FavoriteRemovalContext
}

export interface AppRuntimeOptions {
  mqttModuleLoader?: () => Promise<unknown>
}

const SHORTCUT_PROFILE_IDS: ShortcutProfileId[] = ['global', 'ports', 'mqtt', 'favorites', 'windows', 'codex', 'settings']

function isDebugWindowOperationTracingBuild() {
  const environment = (import.meta as unknown as { env?: { DEV?: unknown } }).env
  return environment?.DEV === true
}

export function createAppRuntime(initialState: AppState, options: AppRuntimeOptions = {}) {
  const platform = getPlatform()
  // Vite replaces DEV in production builds. A packaged plugin therefore never creates or renders this trace surface.
  const windowOperationTraceEnabled = isDebugWindowOperationTracingBuild()
  const favoriteCapabilities: FileCapabilities = platform.files.capabilities || {
    open: true,
    reveal: true,
    copyPath: true,
    copyItems: Boolean(platform.files.copyItems),
    pickFiles: Boolean(platform.files.pickFavorites || platform.files.pickFavorite),
    pickFolders: Boolean(platform.files.pickFavorites),
    listDirectory: true,
    inspectPaths: Boolean(platform.files.inspectPaths)
  }
  let state = normalizeAppState(initialState)
  let ports: PortProcess[] = []
  let selectedPortIds: string[] = []
  let selectedFavoriteIds: string[] = []
  let collapsedFavoriteIds: string[] = []
  let focusedPortId: string | null = null
  let focusedPortGroupId: string | null = null
  let focusedPortGroupTarget: PortGroupTarget | null = null
  let selectedPortGroupId: string | null = null
  let selectedPortGroupTarget: PortGroupTarget | null = null
  let activePortPane: PortPaneId = 'results'
  let portGroupSearch = ''
  let groupSidePanelOpen = true
  let portDetail: PortDetailState = { open: false, active: false, targetId: null }
  let portGroupDetail: PortGroupDetailState = { open: false, active: false, target: null }
  let portDrawer: PortDrawerState = { open: false, active: false, mode: 'single', activeIndex: 0, targetIds: [], groupTarget: null }
  let searchOverlayOpen = false
  let searchFocusRequestId = 0
  let searchBlurRequestId = 0
  let groupPanelFocusRequestId = 0
  let listFocusRequestId = 0
  let listFocusTarget: PortPaneId | null = null
  let searchFocusTarget: SearchFocusTarget = 'ports'
  let portGroupDraft: PortGroupDraft | null = null
  let focusedFavoriteId: string | null = null
  let focusedFavoriteGroupId: string | null = null
  let selectedFavoriteGroupId: string | null = null
  let activeFavoritePane: FavoritePaneId = 'items'
  let favoritePaneFocusRequestId = 0
  let favoriteGroupSearch = ''
  let favoriteDirectoryEntries: FavoriteDirectoryEntry[] = []
  let favoriteDirectoryError: string | null = null
  let favoriteDirectoryLoading = false
  let favoriteDirectoryRequestId = 0
  let favoritePathInspectionRequestId = 0
  let favoritePathInspections: Record<string, FavoritePathInspection> = {}
  let focusedFavoriteDirectoryPath: string | null = null
  let selectedFavoriteDirectoryPaths: string[] = []
  let favoriteContainerPanelOpen = true
  let favoriteAddMenuOpen = false
  let favoriteRemovalUndo: FavoriteRemovalUndo | null = null
  let favoriteDrawer: FavoriteDrawerState = { open: false, active: false, activeIndex: 0, targetKind: 'favorite', targetIds: [] }
  let favoriteQuickMode = false
  let favoritePickReview: FavoritePickReview | null = null
  let favoriteDraft: FavoriteDraft | null = null
  let windowCapability: WindowCapability = { platform: 'unsupported', supported: false, permission: 'unsupported', canList: false, canActivate: false, reason: '尚未请求窗口能力' }
  let liveWindows: LiveWindow[] = []
  let windowLoading = false
  let windowListLoaded = false
  let windowCacheUpdatedAt: number | null = null
  let windowRequestId = 0
  let focusedWindowId: string | null = null
  let selectedWindowIds: string[] = []
  let windowActionsOpen = false
  let windowActionTargetId: string | null = null
  let windowActionsMode: 'single' | 'multi' = 'single'
  let windowDraft: WindowDraft | null = null
  let windowCandidateTargetId: string | null = null
  let windowCandidateLiveIds: string[] = []
  let windowFocusRequestId = 0
  let windowActionsFocusRequestId = 0
  let windowActivationDiagnostics: WindowActivationDiagnostic[] = []
  let windowActivationDiagnosticSequence = 0
  let windowOperationTraces: WindowOperationDebugRecord[] = []
  let windowOperationTraceSequence = 0
  let mqttArchive: MqttArchiveState = normalizeMqttArchiveState(null)
  let mqttArchiveLoaded = false
  let mqttPanelOpen = state.mqtt.layoutPrefs.connectionPanelOpen
  let mqttSubscriptionPanelOpen = state.mqtt.layoutPrefs.subscriptionPanelOpen
  let mqttWorkspaceLayout: MqttWorkspaceLayout = state.mqtt.layoutPrefs.workspaceLayout
  let mqttLogDrawer: MqttLogDrawerState = { open: false }
  let mqttSearch = ''
  let mqttTemplateSearch = ''
  let mqttHistorySearch = ''
  let mqttConnectionStatus: MqttConnectionStatus = { state: 'idle', detail: '未连接' }
  let mqttLogs: MqttLogRecord[] = []
  let mqttSelectedRecord: MqttRecordSelection | null = null
  let mqttConfigDraft: MqttConfigDraft | null = null
  let mqttConnectionGroupDraft: MqttConnectionGroupDraft | null = null
  let mqttSubscriptionDraft: MqttSubscriptionEditorDraft | null = null
  let mqttPublishDraft: MqttPublishDraft = { topic: '', payload: '', qos: 0, retain: false }
  let mqttPublishScratch: MqttPublishDraft = { ...mqttPublishDraft }
  let mqttPublishRecordsOpen = state.mqtt.layoutPrefs.publishRecordsOpen
  const initialMqttInfoFilter = state.mqtt.viewPrefs.infoFilter
  let mqttReceiveFilter: MqttReceiveFilter = initialMqttInfoFilter === 'all' || initialMqttInfoFilter === 'outgoing' ? initialMqttInfoFilter : 'incoming'
  let activeMqttPane: MqttPaneId = 'messages'
  let activeMqttRecordList: MqttRecordListId = initialMqttInfoFilter === 'favorites' ? 'templates' : 'messages'
  if (activeMqttRecordList !== 'messages') mqttPublishRecordsOpen = true
  let mqttRecordListStates: Record<MqttRecordListId, MqttRecordListState> = {
    messages: { activeIndex: 0, selectedIds: [] },
    templates: { activeIndex: 0, selectedIds: [] },
    history: { activeIndex: 0, selectedIds: [] }
  }
  let mqttActiveSubscriptionTopic: string | null = null
  let mqttActiveSubscriptionTopics: string[] = []
  let mqttSelectedSubscriptionTopics: string[] = []
  let mqttSelectedConfigIds: string[] = []
  let mqttFocusedSubscriptionTopic: string | null = null
  let mqttFocusTarget: MqttFocusTarget = 'records'
  let mqttFocusRequestId = 0
  let mqttTopicFilterOpen = false
  let mqttTopicFilterQuery = ''
  let mqttTopicFilterActiveIndex = 0
  let mqttPublishActiveField: MqttPublishField = 'topic'
  let mqttPublishOptionsOpen = false
  let mqttPublishOptionsActiveIndex = 0
  let mqttPublishDraftHistoryOpen = false
  let mqttPublishDraftHistoryActiveIndex = 0
  let mqttPublishDraftHistorySelectedIds: string[] = []
  let mqttPublishDraftHistoryEditDraft: MqttPublishDraftHistoryEditDraft | null = null
  const mqttSubscriptionRuntime = new Map<string, { note: string; unreadCount: number }>()
  let mqttDrawer: MqttDrawerState = { open: false, active: false, activeIndex: 0, targetKind: null, targetId: null }
  let mqttPreview: MqttPreviewState = { open: false, targetKind: null, targetId: null, source: null, scrollTop: 0 }
  let mqttFavoriteDraft: MqttFavoriteDraft | null = null
  let mqttRecordEditDraft: MqttRecordEditDraft | null = null
  let mqttCurrentSessionId: string | null = null
  let mqttClient: MqttRuntimeClient | null = null
  const mqttSecrets = new Map<string, string>(Object.entries(platform.storage.getMqttSecrets()))
  let message = ''
  let lastCodexFloatToggleAt = 0
  let lastCodexFloatToggleSource = ''
  let confirm: AppRuntimeSnapshot['confirm'] = null
  let scanInFlight: Promise<void> | null = null
  const listeners = new Set<() => void>()
  const undoStack: AppState[] = []
  const actions = createActionRuntime({
    captureSnapshot: () => normalizeAppState(state),
    commitSnapshot: (snapshot) => {
      undoStack.push(normalizeAppState(snapshot))
    }
  })

  function notify() {
    listeners.forEach((listener) => listener())
  }

  function save() {
    state.updatedAt = Date.now()
    platform.storage.setState(state)
  }

  function persistMqttSecrets() {
    const secrets: MqttSecretMap = {}
    for (const [configId, secret] of mqttSecrets) {
      if (secret) secrets[configId] = secret
    }
    platform.storage.setMqttSecrets(secrets)
  }

  function setMqttSecret(configId: string | null, password: string) {
    if (!configId) return
    if (password) mqttSecrets.set(configId, password)
    else mqttSecrets.delete(configId)
    persistMqttSecrets()
  }

  function context(input?: ShortcutInputContext): RuntimeActionContext {
    const layerIds = [
      confirm ? 'confirm' : null,
      portGroupDraft ? 'port-group-editor' : null,
      mqttConfigDraft ? 'mqtt-editor' : null,
      mqttConnectionGroupDraft ? 'mqtt-connection-group-editor' : null,
      mqttSubscriptionDraft ? 'mqtt-subscription-editor' : null,
      mqttFavoriteDraft ? 'mqtt-favorite-editor' : null,
      mqttRecordEditDraft ? 'mqtt-record-editor' : null,
      windowDraft ? 'window-editor' : null,
      windowActionsOpen ? 'window-actions' : null,
      mqttPreview.open ? 'mqtt-preview' : null,
      favoriteDraft ? 'favorites-editor' : null,
      favoritePickReview ? 'favorites-pick-review' : null,
      portGroupDetail.open ? 'port-group-detail' : null,
      portDetail.open ? 'port-detail' : null,
      portDrawer.open ? 'port-drawer' : null,
      mqttDrawer.open && mqttDrawer.active ? 'mqtt-drawer' : null,
      mqttDrawer.open && !mqttDrawer.active ? 'mqtt-detail' : null,
      mqttLogDrawer.open ? 'mqtt-log-drawer' : null,
      mqttPublishDraftHistoryEditDraft ? 'mqtt-publish-draft-editor' : null,
      mqttPublishDraftHistoryOpen ? 'mqtt-publish-draft' : null,
      favoriteDrawer.open && favoriteDrawer.active ? 'favorites-drawer' : null,
      favoriteDrawer.open && !favoriteDrawer.active ? 'favorite-detail' : null
    ].filter((item): item is string => Boolean(item))
    const base: RuntimeActionContext = {
      tab: state.activeTab,
      selectedIds: state.activeTab === 'ports' ? selectedPortIds : selectedFavoriteIds,
      layerIds,
      portPane: activePortPane,
      favoritePane: activeFavoritePane,
      favoriteQuickMode,
      favoriteUndoAvailable: Boolean(favoriteRemovalUndo?.removed.length),
      mqttPane: activeMqttPane,
      mqttPanelOpen,
      mqttTargetKind: mqttSelectedRecord?.kind,
      windowActionsOpen,
      windowEditorOpen: Boolean(windowDraft)
    }
    if (input) {
      base.textInputFocused = input.textInputFocused
      base.activeInputRole = input.activeInputRole
    }
    return base
  }

  function setMessage(value: string) {
    message = value
    notify()
  }

  interface WindowActivationAttempt {
    entry: WindowActivationEntry
    slot: number | null
    operation: WindowOperationKind
    trace: WindowOperationDebugRecord | null
    traceCompleted: boolean
    nativeAttemptCount: number
    nativeReasonCode?: WindowActivationReasonCode
    envSnapshots: WindowEnvironmentPhaseSnapshot[]
  }

  const windowActivationDiagnosticMessages: Record<WindowActivationDiagnosticCode, string> = {
    'target-closed': '已确认目标窗口已关闭，已清除陈旧引用。',
    'feature-disabled': '窗口跳转功能已关闭，请在设置中启用后重试。',
    'slot-missing': '窗口槽位不存在，请检查当前配置。',
    'slot-unassigned': '当前窗口槽尚未分配目标，请在窗口页完成分配。',
    'capability-read-failed': '无法读取窗口能力，请检查当前 uTools 宿主。',
    'bridge-stale': '窗口桥接版本与当前界面不一致，请重新准备并连接 uTools preload。',
    'unsupported-host': '当前宿主不支持所需的窗口跳转能力。',
    'permission-required': '需要系统窗口控制权限后才能继续。',
    'refresh-failed': '无法完成窗口实时重扫，未把目标视为已关闭。',
    'refresh-superseded': '窗口实时重扫被新的请求替代，请重试。',
    'ambiguous-target': '匹配到多个候选窗口，需要在工作台中明确选择。',
    'space-unbound': '无法唯一绑定目标窗口所在桌面，未执行不确定的桌面切换。',
    'space-unbound-multiwindow': '目标应用存在多个窗口且无法绑定目标桌面，未前置任意窗口。',
    'space-ambiguous': '目标窗口同时绑定到多个非当前桌面，需要明确后才能切换。',
    'space-switch-timeout': '目标桌面切换未在时限内确认，未继续激活窗口。',
    'target-title-changed': '目标窗口标题或所属应用已变化，请在候选窗口中重新确认。',
    'focus-denied': '系统拒绝聚焦该窗口；EyPc 未尝试绕过前台保护。',
    'activation-not-found': '激活时窗口引用已失效，尚未满足确认关闭条件。',
    'activation-failed': '宿主未能完成窗口激活，请在工作台中核查。',
    'topmost-unsupported': '当前系统只能前置窗口，不能将第三方窗口保持在最上层。',
    'topmost-failed': '宿主未能将页面置顶，请在工作台中核查。',
    'workbench-show-failed': '无法显示窗口工作台以呈现本次阻断原因。',
    'silent-hide-failed': '窗口已激活，但插件窗口未能静默隐藏。'
  }

  const nativeTraceStages = new Set<WindowOperationTrace['steps'][number]['stage']>([
    'bridge', 'space', 'target', 'process', 'restore', 'foreground', 'raise', 'verify', 'topmost'
  ])
  const nativeTraceOutcomes = new Set<WindowOperationTrace['steps'][number]['outcome']>([
    'ok', 'skipped', 'not-found', 'ambiguous', 'failed', 'denied', 'unsupported', 'unavailable'
  ])
  const nativeTraceDetails = new Set<NonNullable<WindowOperationTrace['steps'][number]['detail']>>([
    'switched', 'switch-confirmed', 'switch-timeout', 'current', 'walked', 'direct-unique', 'direct-multiple', 'reverse-unique', 'ambiguous-spaces',
    'ax-fallback', 'bad-ref', 'no-api', 'empty-spaces', 'no-space-id', 'no-display', 'process-frontmost', 'single-window-frontmost',
    'multiwindow-blocked', 'current-space-inferred', 'cg-ordinal-fallback', 'title-match', 'title-mismatch', 'focus-state-mismatch', 'error'
  ])

  function appendWindowOperationTrace(
    attempt: WindowActivationAttempt,
    stage: WindowOperationDebugRecord['steps'][number]['stage'],
    outcome: WindowOperationDebugRecord['steps'][number]['outcome'],
    detail?: WindowOperationDebugRecord['steps'][number]['detail']
  ) {
    if (!attempt.trace || attempt.traceCompleted || attempt.trace.steps.length >= 32) return
    attempt.trace.steps.push(detail ? { stage, outcome, detail } : { stage, outcome })
  }

  function appendNativeWindowOperationTrace(attempt: WindowActivationAttempt, trace: WindowOperationTrace | undefined) {
    if (!trace || !Array.isArray(trace.steps)) return
    for (const step of trace.steps.slice(0, 16)) {
      if (!step || !nativeTraceStages.has(step.stage) || !nativeTraceOutcomes.has(step.outcome)) continue
      const detail = step.detail && nativeTraceDetails.has(step.detail) ? step.detail : undefined
      appendWindowOperationTrace(attempt, step.stage, step.outcome, detail)
    }
  }

  function completeWindowOperationTrace(
    attempt: WindowActivationAttempt,
    result: WindowOperationTraceResult,
    code: WindowOperationDebugRecord['code'],
    platformId: WindowPlatform | 'unsupported' = currentWindowDiagnosticPlatform()
  ) {
    if (!attempt.trace || attempt.traceCompleted) return
    attempt.traceCompleted = true
    const record: WindowOperationDebugRecord = {
      ...attempt.trace,
      platform: platformId,
      result,
      code,
      ...(attempt.envSnapshots.length ? {
        envSnapshot: attempt.envSnapshots[attempt.envSnapshots.length - 1].snapshot,
        envSnapshots: attempt.envSnapshots.map((item) => ({ phase: item.phase, snapshot: { ...item.snapshot } }))
      } : {}),
      steps: attempt.trace.steps.map((step) => ({ ...step }))
    }
    windowOperationTraces = [record, ...windowOperationTraces].slice(0, 50)
    notify()
  }

  function currentWindowDiagnosticPlatform(): WindowPlatform | 'unsupported' {
    return windowCapability.platform === 'darwin' || windowCapability.platform === 'win32'
      ? windowCapability.platform
      : 'unsupported'
  }

  function recordWindowActivationDiagnostic(
    attempt: WindowActivationAttempt,
    stage: WindowActivationDiagnosticStage,
    code: WindowActivationDiagnosticCode,
    level: WindowActivationDiagnosticLevel,
    platformId: WindowPlatform | 'unsupported' = currentWindowDiagnosticPlatform()
  ) {
    const timestamp = Date.now()
    const diagnostic: WindowActivationDiagnostic = {
      id: `window-activation:${timestamp}:${++windowActivationDiagnosticSequence}`,
      timestamp,
      entry: attempt.entry,
      slot: attempt.slot,
      platform: platformId,
      stage,
      code,
      level,
      message: windowActivationDiagnosticMessages[code]
    }
    windowActivationDiagnostics = [diagnostic, ...windowActivationDiagnostics].slice(0, 50)
    notify()
    return diagnostic
  }

  function reportWindowActivationDiagnostic(
    attempt: WindowActivationAttempt,
    stage: WindowActivationDiagnosticStage,
    code: WindowActivationDiagnosticCode,
    level: WindowActivationDiagnosticLevel,
    platformId?: WindowPlatform | 'unsupported'
  ) {
    const diagnostic = recordWindowActivationDiagnostic(attempt, stage, code, level, platformId)
    setMessage(diagnostic.message)
    return diagnostic
  }

  function clearWindowActivationDiagnostics() {
    if (!windowActivationDiagnostics.length) return false
    windowActivationDiagnostics = []
    notify()
    return true
  }

  function clearWindowOperationTraces() {
    if (!windowOperationTraceEnabled || !windowOperationTraces.length) return false
    windowOperationTraces = []
    notify()
    return true
  }

  const codexController = createCodexController({
    platform,
    getAppState: () => state,
    save,
    notify,
    setMessage
  })

  function requestListFocus(target: PortPaneId) {
    listFocusTarget = target
    listFocusRequestId += 1
  }

  function requestMqttFocus(target: MqttFocusTarget) {
    mqttFocusTarget = target
    mqttFocusRequestId += 1
  }

  function mqttPublishDraftHistoryEditFocusTarget(field: MqttPublishDraftHistoryEditField): MqttFocusTarget {
    return field === 'note'
      ? 'publish-draft-edit-note'
      : field === 'payload'
        ? 'publish-draft-edit-payload'
        : field === 'topic'
          ? 'publish-draft-edit-topic'
          : 'publish-draft-edit-title'
  }

  function blurMqttInformationFocus() {
    if (
      mqttSelectedRecord?.kind === 'message' ||
      mqttSelectedRecord?.kind === 'publish-template' ||
      mqttSelectedRecord?.kind === 'session' ||
      mqttSelectedRecord?.kind === 'log'
    ) {
      mqttSelectedRecord = null
    }
    if (mqttPreview.open && mqttPreview.source === 'shift') {
      mqttPreview = { open: false, targetKind: null, targetId: null, source: null, scrollTop: 0 }
    }
  }

  function closeMqttCommandFocusSurfaces() {
    mqttTopicFilterOpen = false
    mqttPublishOptionsOpen = false
    mqttPublishDraftHistoryOpen = false
    mqttPublishDraftHistoryEditDraft = null
  }

  function targetKey(target: PortGroupTarget): string {
    return `${target.kind}:${target.id}`
  }

  function sameTarget(left: PortGroupTarget | null, right: PortGroupTarget | null): boolean {
    return Boolean(left && right && left.kind === right.kind && left.id === right.id)
  }

  function filterPortGroupRows(): PortGroupTreeRow[] {
    return flattenPortGroupTargets(state.portGroups, state.portGroupFolders, state.collapsedPortGroupFolderIds, portGroupSearch)
  }

  function rowForGroupTarget(target: PortGroupTarget | null): PortGroupTreeRow | null {
    if (!target) return null
    return filterPortGroupRows().find((row) => sameTarget(row.target, target)) || null
  }

  function currentWindowPlatform(): WindowPlatform | null {
    if (windowCapability.platform === 'darwin' || windowCapability.platform === 'win32') return windowCapability.platform
    return liveWindows[0]?.platform || null
  }

  function windowTargetById(id: string | null | undefined): WindowTarget | null {
    return id ? state.windowTargets.find((target) => target.id === id) || null : null
  }

  function liveWindowsForTarget(target: WindowTarget): { live: LiveWindow | null; candidates: LiveWindow[]; candidateReason: 'ambiguous' | 'title-changed' | null } {
    const samePlatform = liveWindows.filter((live) => live.platform === target.platform)
    const byRef = target.lastNativeRef
      ? samePlatform.find((live) => live.nativeRef === target.lastNativeRef && targetMatchesLiveWindow(target, live)) || null
      : null
    if (byRef) return { live: byRef, candidates: [byRef], candidateReason: null }
    const candidates = samePlatform.filter((live) => targetMatchesLiveWindow(target, live))
    if (candidates.length === 1) return { live: candidates[0], candidates, candidateReason: null }
    if (candidates.length > 1) return { live: null, candidates, candidateReason: 'ambiguous' }
    if (candidates.length === 0 && target.lastNativeRef) {
      const parts = /^(\d{1,12}):(\d{1,6}):(\d{1,12})$/.exec(String(target.lastNativeRef || '').trim())
      if (parts) {
        const targetPid = Number(parts[1])
        if (Number.isInteger(targetPid) && targetPid > 0) {
          const targetApp = normalizeWindowText(target.appId || target.appName)
          const byPid = samePlatform.filter((live) => live.pid === targetPid && normalizeWindowText(live.appId || live.appName) === targetApp)
          if (byPid.length) return { live: null, candidates: byPid, candidateReason: 'title-changed' }
        }
      }
    }
    return { live: null, candidates: [], candidateReason: null }
  }

  function windowSlotNumbers(targetId: string): number[] {
    const platform = currentWindowPlatform()
    return state.windowSlots
      .filter((slot) => {
        if (platform) return slot.targetIdByPlatform[platform] === targetId
        return Object.values(slot.targetIdByPlatform).includes(targetId)
      })
      .map((slot) => slot.slot)
  }

  function isSlotBoundWindowTarget(targetId: string): boolean {
    return windowSlotNumbers(targetId).length > 0
  }

  function makeWindowRow(target: WindowTarget | null, live: LiveWindow | null, ambiguous = false, rowId?: string): WindowRow {
    const id = rowId || (target ? `target:${target.id}` : `live:${live?.id || ''}`)
    const title = live?.title || target?.titleLocator || ''
    const appName = live?.appName || target?.appName || ''
    return {
      id,
      live,
      target,
      displayName: target?.alias || title || appName || '未命名窗口',
      appName,
      title,
      favorite: Boolean(target?.favorite),
      pinned: Boolean(target?.pinned),
      slotNumbers: target ? windowSlotNumbers(target.id) : [],
      focused: id === focusedWindowId,
      selected: selectedWindowIds.includes(id),
      unavailable: Boolean(target && !live),
      ambiguous
    }
  }

  function windowRows(): WindowRow[] {
    const platform = currentWindowPlatform()
    if (windowCandidateTargetId && windowCandidateLiveIds.length) {
      const target = windowTargetById(windowCandidateTargetId)
      const ids = new Set(windowCandidateLiveIds)
      return liveWindows
        .filter((live) => ids.has(live.id))
        .map((live) => makeWindowRow(target, live, false, `candidate:${live.id}`))
        .sort(compareWindowRowsByApplication)
    }
    const targets = state.windowTargets
      .filter((target) => (!platform || target.platform === platform) && (target.favorite || target.pinned || isSlotBoundWindowTarget(target.id)))
    const usedLiveIds = new Set<string>()
    const savedRows = targets.map((target) => {
      const resolved = liveWindowsForTarget(target)
      if (resolved.live) usedLiveIds.add(resolved.live.id)
      return makeWindowRow(target, resolved.live, resolved.candidates.length > 1)
    })
    const liveRows = liveWindows
      .filter((live) => !usedLiveIds.has(live.id) && !(live.platform === 'darwin' && live.minimized))
      .map((live) => makeWindowRow(null, live))
    const keyword = normalizeWindowText(state.windowSearch)
    const rows = [...savedRows, ...liveRows].sort(compareWindowRowsByApplication)
    if (!keyword) return rows
    return rows.filter((row) => normalizeWindowText([row.displayName, row.title, row.appName].join(' ')).includes(keyword))
  }

  function windowRowById(id: string | null | undefined): WindowRow | null {
    return id ? windowRows().find((row) => row.id === id) || null : null
  }

  function remapWindowRowIdentity(fromId: string, toId: string) {
    if (fromId === toId) return
    if (focusedWindowId === fromId) focusedWindowId = toId
    if (windowActionTargetId === fromId) windowActionTargetId = toId
    selectedWindowIds = Array.from(new Set(selectedWindowIds.map((id) => id === fromId ? toId : id)))
  }

  function normalizeFocusedWindow(notifyAfter = true) {
    const rows = windowRows()
    if (!rows.some((row) => row.id === focusedWindowId)) focusedWindowId = rows[0]?.id || null
    const visibleIds = new Set(rows.map((row) => row.id))
    selectedWindowIds = selectedWindowIds.filter((id) => visibleIds.has(id))
    if (windowActionTargetId && !rows.some((row) => row.id === windowActionTargetId)) {
      windowActionTargetId = null
      windowActionsOpen = false
      windowActionsMode = 'single'
    }
    if (notifyAfter) notify()
  }

  function rematchFocusedWindowAfterRefresh(previous: { rowId: string | null; live: LiveWindow | null; targetId: string | null }) {
    const rows = windowRows()
    if (previous.rowId && rows.some((row) => row.id === previous.rowId)) {
      focusedWindowId = previous.rowId
      if (windowActionsOpen) windowActionTargetId = previous.rowId
      return
    }
    if (previous.targetId) {
      const targetRow = rows.find((row) => row.target?.id === previous.targetId)
      if (targetRow) {
        focusedWindowId = targetRow.id
        if (windowActionsOpen) windowActionTargetId = targetRow.id
        return
      }
    }
    if (previous.live) {
      const liveMatch = liveWindows.find((live) => live.platform === previous.live!.platform
        && live.appId === previous.live!.appId
        && normalizeWindowText(live.title) === normalizeWindowText(previous.live!.title))
      if (liveMatch) {
        const liveRow = rows.find((row) => row.live?.id === liveMatch.id)
        focusedWindowId = liveRow?.id || `live:${liveMatch.id}`
        if (windowActionsOpen) windowActionTargetId = focusedWindowId
        return
      }
    }
    normalizeFocusedWindow(false)
  }

  function windowSlotLabel(slot: number): string {
    return `EyPc 窗口槽 ${slot}`
  }

  function createWindowTarget(live: LiveWindow, alias = live.title, favorite = true): WindowTarget {
    const now = Date.now()
    return {
      id: `window:${now}:${Math.random().toString(36).slice(2, 10)}`,
      alias: alias.trim() || live.title,
      platform: live.platform,
      appId: live.appId,
      appName: live.appName,
      titleLocator: live.title,
      lastNativeRef: live.nativeRef,
      favorite,
      pinned: false,
      createdAt: now,
      updatedAt: now
    }
  }

  function ensureWindowTarget(row: WindowRow, options: { favorite?: boolean } = {}): WindowTarget | null {
    if (row.target) return row.target
    if (!row.live) return null
    const existing = state.windowTargets.find((target) => targetMatchesLiveWindow(target, row.live!))
    if (existing) return existing
    const target = createWindowTarget(row.live, row.live.title, options.favorite ?? true)
    state.windowTargets = [...state.windowTargets, target]
    save()
    return target
  }

  type WindowRefreshOutcome = 'loaded' | 'failed' | 'superseded'
  type WindowResolveOutcome =
    | { kind: 'activated' }
    | { kind: 'no-match' }
    | { kind: 'ambiguous' }
    | { kind: 'rebind-required' }
    | { kind: 'activation-failed'; outcome: Exclude<WindowActivationOutcome, 'activated'> }

  async function refreshWindows({ clearSearch = false }: { clearSearch?: boolean } = {}): Promise<WindowRefreshOutcome> {
    if (clearSearch && state.windowSearch) {
      state.windowSearch = ''
      save()
    }
    const requestId = windowRequestId + 1
    windowRequestId = requestId
    const previousRow = windowRowById(focusedWindowId)
    const previousFocus = {
      rowId: focusedWindowId,
      live: previousRow?.live || null,
      targetId: previousRow?.target?.id || null
    }
    windowLoading = true
    notify()
    try {
      const result = await platform.windows.list()
      if (requestId !== windowRequestId) return 'superseded'
      windowCapability = result.capability
      liveWindows = filterJumpableLiveWindows(result.windows.map((window) => ({ ...window })))
      windowListLoaded = true
      windowCacheUpdatedAt = Date.now()
      const candidateIds = new Set(liveWindows.map((window) => window.id))
      windowCandidateLiveIds = windowCandidateLiveIds.filter((id) => candidateIds.has(id))
      if (!windowCandidateLiveIds.length) windowCandidateTargetId = null
      rematchFocusedWindowAfterRefresh(previousFocus)
      return 'loaded'
    } catch {
      if (requestId !== windowRequestId) return 'superseded'
      windowCapability = { platform: 'unsupported', supported: false, permission: 'unsupported', canList: false, canActivate: false, reason: '当前 preload 无法读取窗口' }
      // Keep the last successful session cache so refresh failure does not wipe the list.
      if (!windowListLoaded) {
        liveWindows = []
        windowCacheUpdatedAt = null
      }
      message = windowListLoaded ? '刷新失败，已保留上次窗口列表' : '当前 preload 无法读取窗口'
      normalizeFocusedWindow(false)
      return 'failed'
    } finally {
      if (requestId === windowRequestId) {
        windowLoading = false
        notify()
      }
    }
  }

  function clearWindowCandidates() {
    if (!windowCandidateTargetId && !windowCandidateLiveIds.length) return false
    windowCandidateTargetId = null
    windowCandidateLiveIds = []
    normalizeFocusedWindow(false)
    notify()
    return true
  }

  function showWindowWorkbench(options: { focusRowId?: string | null; messageText?: string } = {}) {
    if (isTabEnabled('windows')) state.activeTab = 'windows'
    else state.activeTab = 'settings'
    if (options.focusRowId) focusedWindowId = options.focusRowId
    if (options.messageText) message = options.messageText
    windowActionsOpen = false
    windowActionTargetId = null
    windowFocusRequestId += 1
    save()
    notify()
    try {
      return platform.app.show?.() === true
    } catch {
      return false
    }
  }

  function diagnosticCodeForActivationOutcome(
    outcome: Exclude<WindowActivationOutcome, 'activated'>,
    operation: WindowOperationKind = 'activate',
    reasonCode?: WindowActivationReasonCode
  ): WindowActivationDiagnosticCode {
    if (reasonCode === 'space-unbound') return 'space-unbound'
    if (reasonCode === 'space-unbound-multiwindow') return 'space-unbound-multiwindow'
    if (reasonCode === 'space-ambiguous') return 'space-ambiguous'
    if (reasonCode === 'space-switch-timeout') return 'space-switch-timeout'
    if (reasonCode === 'target-title-changed') return 'target-title-changed'
    if (operation === 'always-on-top' && outcome === 'unsupported') return 'topmost-unsupported'
    if (operation === 'always-on-top' && outcome === 'failed') return 'topmost-failed'
    if (outcome === 'focus-denied') return 'focus-denied'
    if (outcome === 'permission-required') return 'permission-required'
    if (outcome === 'unsupported') return 'unsupported-host'
    if (outcome === 'ambiguous') return 'ambiguous-target'
    if (outcome === 'not-found') return 'activation-not-found'
    return 'activation-failed'
  }

  function diagnosticMessageForActivationOutcome(outcome: Exclude<WindowActivationOutcome, 'activated'>, operation: WindowOperationKind, reasonCode?: WindowActivationReasonCode) {
    return windowActivationDiagnosticMessages[diagnosticCodeForActivationOutcome(outcome, operation, reasonCode)]
  }

  function traceStageForActivationDiagnostic(stage: WindowActivationDiagnosticStage): WindowOperationDebugRecord['steps'][number]['stage'] {
    if (stage === 'activate') return 'native'
    return stage
  }

  function finishWindowActivation(
    attempt: WindowActivationAttempt,
    stage: WindowActivationDiagnosticStage,
    code: WindowActivationDiagnosticCode,
    level: WindowActivationDiagnosticLevel,
    options: { focusRowId?: string | null; platformId?: WindowPlatform | 'unsupported' } = {}
  ) {
    appendWindowOperationTrace(attempt, traceStageForActivationDiagnostic(stage), level === 'accepted' ? 'ok' : 'failed')
    const diagnostic = reportWindowActivationDiagnostic(attempt, stage, code, level, options.platformId)
    if (attempt.entry === 'slot') {
      const shown = showWindowWorkbench({ focusRowId: options.focusRowId, messageText: diagnostic.message })
      if (!shown) {
        appendWindowOperationTrace(attempt, 'visibility', 'failed')
        reportWindowActivationDiagnostic(attempt, 'visibility', 'workbench-show-failed', 'blocking', options.platformId)
        completeWindowOperationTrace(attempt, 'blocking', 'workbench-show-failed', options.platformId)
        return false
      }
    }
    completeWindowOperationTrace(attempt, level === 'accepted' ? 'target-closed' : 'blocking', code, options.platformId)
    return false
  }

  async function readWindowActivationCapability(attempt: WindowActivationAttempt): Promise<WindowCapability | null> {
    let capability: WindowCapability
    try {
      capability = await platform.windows.capabilities()
    } catch {
      appendWindowOperationTrace(attempt, 'capability', 'failed')
      finishWindowActivation(attempt, 'capability', 'capability-read-failed', 'blocking')
      return null
    }
    windowCapability = capability
    notify()
    const platformId = capability.platform === 'darwin' || capability.platform === 'win32' ? capability.platform : 'unsupported'
    if (capability.supported && platformId !== 'unsupported' && capability.bridgeRevision !== WINDOW_BRIDGE_REVISION) {
      appendWindowOperationTrace(attempt, 'capability', 'failed')
      finishWindowActivation(attempt, 'capability', 'bridge-stale', 'blocking', { platformId })
      return null
    }
    if (capability.permission === 'required') {
      appendWindowOperationTrace(attempt, 'capability', 'denied')
      finishWindowActivation(attempt, 'capability', 'permission-required', 'blocking', { platformId })
      return null
    }
    if (!capability.supported || !capability.canActivate || platformId === 'unsupported') {
      appendWindowOperationTrace(attempt, 'capability', 'unsupported')
      finishWindowActivation(attempt, 'capability', 'unsupported-host', 'blocking', { platformId })
      return null
    }
    if (attempt.operation === 'always-on-top' && !capability.canAlwaysOnTop) {
      appendWindowOperationTrace(attempt, 'capability', 'unsupported')
      finishWindowActivation(attempt, 'topmost', 'topmost-unsupported', 'blocking', { platformId })
      return null
    }
    appendWindowOperationTrace(attempt, 'capability', 'ok')
    return capability
  }

  async function refreshForWindowActivation(attempt: WindowActivationAttempt, focusRowId: string | null, platformId: WindowPlatform): Promise<boolean> {
    const outcome = await refreshWindows()
    if (outcome === 'failed') {
      appendWindowOperationTrace(attempt, 'refresh', 'failed')
      return finishWindowActivation(attempt, 'refresh', 'refresh-failed', 'blocking', { focusRowId, platformId })
    }
    if (outcome === 'superseded') {
      appendWindowOperationTrace(attempt, 'refresh', 'failed')
      return finishWindowActivation(attempt, 'refresh', 'refresh-superseded', 'blocking', { focusRowId, platformId })
    }
    if (windowCapability.permission === 'required') {
      appendWindowOperationTrace(attempt, 'refresh', 'denied')
      return finishWindowActivation(attempt, 'refresh', 'permission-required', 'blocking', { focusRowId, platformId })
    }
    if (!windowCapability.supported || !windowCapability.canList || !windowCapability.canActivate) {
      appendWindowOperationTrace(attempt, 'refresh', 'unsupported')
      return finishWindowActivation(attempt, 'refresh', 'unsupported-host', 'blocking', { focusRowId, platformId })
    }
    appendWindowOperationTrace(attempt, 'refresh', 'ok')
    return true
  }

  function clearStaleWindowNativeRef(target: WindowTarget) {
    if (!target.lastNativeRef) return
    target.lastNativeRef = null
    target.updatedAt = Date.now()
    save()
  }

  async function activateLiveWindow(live: LiveWindow, target: WindowTarget | null, attempt: WindowActivationAttempt): Promise<WindowActivationOutcome> {
    if (attempt.trace && !attempt.trace.targetTitle) attempt.trace.targetTitle = target?.titleLocator || live.title
    const phase: WindowEnvironmentPhase = attempt.nativeAttemptCount === 0 ? 'pre-initial' : 'pre-retry'
    attempt.nativeAttemptCount += 1
    attempt.nativeReasonCode = undefined
    if (windowOperationTraceEnabled && platform.windows.inspectEnvironment) {
      try {
        const snapshot = await platform.windows.inspectEnvironment(live)
        attempt.envSnapshots = [...attempt.envSnapshots, { phase, snapshot }].slice(-3)
      } catch {}
    }
    let result: Awaited<ReturnType<typeof platform.windows.activate>>
    try {
      result = attempt.operation === 'always-on-top'
        ? (await platform.windows.alwaysOnTop?.(live, { debugTrace: windowOperationTraceEnabled }) ?? { outcome: 'unsupported' as const })
        : await platform.windows.activate(live, { debugTrace: windowOperationTraceEnabled })
    } catch {
      attempt.nativeReasonCode = undefined
      appendWindowOperationTrace(attempt, 'native', 'failed')
      setMessage(diagnosticMessageForActivationOutcome('failed', attempt.operation))
      return 'failed'
    }
    attempt.nativeReasonCode = result.reasonCode
    appendNativeWindowOperationTrace(attempt, result.trace)
    appendWindowOperationTrace(attempt, 'native', result.outcome === 'activated'
      ? 'ok'
      : result.outcome === 'not-found'
        ? 'not-found'
        : result.outcome === 'ambiguous'
          ? 'ambiguous'
          : result.outcome === 'focus-denied'
            ? 'denied'
            : result.outcome === 'unsupported'
              ? 'unsupported'
              : 'failed')
    if (result.outcome === 'activated') {
      if (target) {
        target.lastNativeRef = live.nativeRef
        target.updatedAt = Date.now()
        save()
      }
      windowCandidateTargetId = null
      windowCandidateLiveIds = []
      setMessage(attempt.operation === 'always-on-top' ? '页面已置顶并前置' : '窗口已展开并前置')
      const hidden = await hideAppWindow()
      if (!hidden) {
        appendWindowOperationTrace(attempt, 'visibility', 'failed')
        reportWindowActivationDiagnostic(attempt, 'visibility', 'silent-hide-failed', 'blocking', live.platform)
        completeWindowOperationTrace(attempt, 'blocking', 'silent-hide-failed', live.platform)
      } else {
        appendWindowOperationTrace(attempt, 'visibility', 'ok')
        completeWindowOperationTrace(attempt, 'success', attempt.operation === 'always-on-top' ? 'topmost-enabled' : 'activated', live.platform)
      }
      return 'activated'
    }
    if (result.outcome === 'permission-required') {
      windowCapability = { ...windowCapability, permission: 'required', canList: false, canActivate: false }
    }
    setMessage(result.outcome === 'not-found' && !result.reasonCode
      ? '窗口引用已失效，正在进行实时重扫。'
      : diagnosticMessageForActivationOutcome(result.outcome, attempt.operation, result.reasonCode))
    return result.outcome
  }

  function activationAttemptFor(
    entry: WindowActivationEntry,
    slot: number | null = null,
    operation: WindowOperationKind = 'activate'
  ): WindowActivationAttempt {
    const timestamp = Date.now()
    const trace = windowOperationTraceEnabled
      ? {
          id: `window-operation:${timestamp}:${++windowOperationTraceSequence}`,
          timestamp,
          targetTitle: '',
          entry,
          slot,
          platform: 'unsupported' as const,
          operation,
          result: 'blocking' as const,
          code: 'activation-failed' as const,
          steps: [{ stage: 'entry' as const, outcome: 'ok' as const }]
        }
      : null
    return { entry, slot, operation, trace, traceCompleted: false, nativeAttemptCount: 0, envSnapshots: [] }
  }

  function finishActivationOutcome(
    attempt: WindowActivationAttempt,
    outcome: Exclude<WindowActivationOutcome, 'activated'>,
    focusRowId: string | null,
    platformId: WindowPlatform
  ) {
    return finishWindowActivation(
      attempt,
      attempt.operation === 'always-on-top' ? 'topmost' : 'activate',
      diagnosticCodeForActivationOutcome(outcome, attempt.operation, attempt.nativeReasonCode),
      'blocking',
      { focusRowId, platformId }
    )
  }

  async function activateWindowTargetWithRecovery(target: WindowTarget, attempt: WindowActivationAttempt): Promise<boolean> {
    if (attempt.trace && !attempt.trace.targetTitle) attempt.trace.targetTitle = target.titleLocator
    const focusRowId = `target:${target.id}`
    const platformId = target.platform
    const cachedLive = liveWindowFromPersistedTarget(target)
    if (cachedLive) {
      appendWindowOperationTrace(attempt, 'cache', 'ok')
      const outcome = await activateLiveWindow(cachedLive, target, attempt)
      if (outcome === 'activated') return true
      if (outcome !== 'not-found') return finishActivationOutcome(attempt, outcome, focusRowId, platformId)
    } else {
      appendWindowOperationTrace(attempt, 'cache', 'skipped')
      const initial = await resolveAndActivateWindowTargetForAttempt(target, attempt)
      if (initial.kind === 'activated') return true
      if (initial.kind === 'ambiguous') return finishWindowActivation(attempt, 'resolve', 'ambiguous-target', 'blocking', { focusRowId: focusedWindowId, platformId })
      if (initial.kind === 'rebind-required') return finishWindowActivation(attempt, 'resolve', 'target-title-changed', 'blocking', { focusRowId: focusedWindowId, platformId })
      if (initial.kind === 'activation-failed' && initial.outcome !== 'not-found') return finishActivationOutcome(attempt, initial.outcome, focusRowId, platformId)
    }

    if (!await refreshForWindowActivation(attempt, focusRowId, platformId)) return false
    const retried = await resolveAndActivateWindowTargetForAttempt(target, attempt)
    if (retried.kind === 'activated') return true
    if (retried.kind === 'no-match') {
      clearStaleWindowNativeRef(target)
      return finishWindowActivation(attempt, 'resolve', 'target-closed', 'accepted', { focusRowId, platformId })
    }
    if (retried.kind === 'ambiguous') return finishWindowActivation(attempt, 'resolve', 'ambiguous-target', 'blocking', { focusRowId: focusedWindowId, platformId })
    if (retried.kind === 'rebind-required') return finishWindowActivation(attempt, 'resolve', 'target-title-changed', 'blocking', { focusRowId: focusedWindowId, platformId })
    return finishActivationOutcome(attempt, retried.outcome, focusRowId, platformId)
  }

  async function resolveAndActivateWindowTargetForAttempt(target: WindowTarget, attempt: WindowActivationAttempt): Promise<WindowResolveOutcome> {
    const resolved = liveWindowsForTarget(target)
    if (resolved.live) {
      appendWindowOperationTrace(attempt, 'resolve', 'ok')
      const outcome = await activateLiveWindow(resolved.live, target, attempt)
      return outcome === 'activated' ? { kind: 'activated' } : { kind: 'activation-failed', outcome }
    }
    if (resolved.candidates.length) {
      const rebindRequired = resolved.candidateReason === 'title-changed'
      appendWindowOperationTrace(attempt, 'resolve', rebindRequired ? 'not-found' : 'ambiguous')
      windowCandidateTargetId = target.id
      windowCandidateLiveIds = resolved.candidates.map((window) => window.id)
      focusedWindowId = `candidate:${resolved.candidates[0].id}`
      windowActionsOpen = false
      windowActionTargetId = null
      setMessage(windowActivationDiagnosticMessages[rebindRequired ? 'target-title-changed' : 'ambiguous-target'])
      if (rebindRequired) return { kind: 'rebind-required' }
      return { kind: 'ambiguous' }
    }
    appendWindowOperationTrace(attempt, 'resolve', 'not-found')
    setMessage('未找到匹配窗口，正在进行实时重扫。')
    return { kind: 'no-match' }
  }

  function liveWindowAfterRefresh(live: LiveWindow): { live: LiveWindow | null; ambiguous: boolean } {
    const exact = liveWindows.find((candidate) => candidate.platform === live.platform && candidate.nativeRef === live.nativeRef) || null
    if (exact) return { live: exact, ambiguous: false }
    const candidates = liveWindows.filter((candidate) => candidate.platform === live.platform
      && candidate.appId === live.appId
      && normalizeWindowText(candidate.title) === normalizeWindowText(live.title))
    return { live: candidates.length === 1 ? candidates[0] : null, ambiguous: candidates.length > 1 }
  }

  async function activateLiveWindowWithRecovery(live: LiveWindow, target: WindowTarget | null, attempt: WindowActivationAttempt): Promise<boolean> {
    const focusRowId = target ? `target:${target.id}` : `live:${live.id}`
    const outcome = await activateLiveWindow(live, target, attempt)
    if (outcome === 'activated') return true
    if (outcome !== 'not-found') return finishActivationOutcome(attempt, outcome, focusRowId, live.platform)

    if (!await refreshForWindowActivation(attempt, focusRowId, live.platform)) return false
    const refreshed = liveWindowAfterRefresh(live)
    if (refreshed.ambiguous) {
      appendWindowOperationTrace(attempt, 'resolve', 'ambiguous')
      return finishWindowActivation(attempt, 'resolve', 'ambiguous-target', 'blocking', { focusRowId, platformId: live.platform })
    }
    if (!refreshed.live) {
      appendWindowOperationTrace(attempt, 'resolve', 'not-found')
      if (target) clearStaleWindowNativeRef(target)
      return finishWindowActivation(attempt, 'resolve', 'target-closed', 'accepted', { focusRowId, platformId: live.platform })
    }
    const retried = await activateLiveWindow(refreshed.live, target, attempt)
    if (retried === 'activated') return true
    return finishActivationOutcome(attempt, retried, focusRowId, live.platform)
  }

  async function activateConfirmedWindowCandidate(live: LiveWindow, target: WindowTarget, attempt: WindowActivationAttempt): Promise<boolean> {
    if (attempt.trace) attempt.trace.targetTitle = live.title
    const activated = await activateLiveWindowWithRecovery(live, target, attempt)
    if (!activated) return false
    target.appId = live.appId
    target.appName = live.appName
    target.titleLocator = live.title
    target.lastNativeRef = live.nativeRef
    target.updatedAt = Date.now()
    windowCandidateTargetId = null
    windowCandidateLiveIds = []
    save()
    return true
  }

  async function activateWindowRow(rowId?: string) {
    const attempt = activationAttemptFor('manual')
    if (!isTabEnabled('windows')) return finishWindowActivation(attempt, 'entry', 'feature-disabled', 'blocking')
    if (!await readWindowActivationCapability(attempt)) return false
    const row = windowRowById(rowId || focusedWindowId)
    if (!row) {
      return finishWindowActivation(attempt, 'entry', 'activation-failed', 'blocking')
    }
    if (row.live) {
      const candidateTarget = windowCandidateTargetId ? windowTargetById(windowCandidateTargetId) : null
      if (candidateTarget) return activateConfirmedWindowCandidate(row.live, candidateTarget, attempt)
      if (row.target) return activateWindowTargetWithRecovery(row.target, attempt)
      return activateLiveWindowWithRecovery(row.live, null, attempt)
    }
    if (row.target) return activateWindowTargetWithRecovery(row.target, attempt)
    return finishWindowActivation(attempt, 'entry', 'activation-failed', 'blocking')
  }

  async function setWindowAlwaysOnTop(rowId?: string) {
    const attempt = activationAttemptFor('manual', null, 'always-on-top')
    if (!isTabEnabled('windows')) return finishWindowActivation(attempt, 'entry', 'feature-disabled', 'blocking')
    if (!await readWindowActivationCapability(attempt)) return false
    const row = windowRowById(rowId || focusedWindowId)
    if (!row) return finishWindowActivation(attempt, 'entry', 'topmost-failed', 'blocking')
    if (row.live) {
      const candidateTarget = windowCandidateTargetId ? windowTargetById(windowCandidateTargetId) : null
      if (candidateTarget) return activateConfirmedWindowCandidate(row.live, candidateTarget, attempt)
      if (row.target) return activateWindowTargetWithRecovery(row.target, attempt)
      return activateLiveWindowWithRecovery(row.live, null, attempt)
    }
    if (row.target) return activateWindowTargetWithRecovery(row.target, attempt)
    return finishWindowActivation(attempt, 'entry', 'topmost-failed', 'blocking')
  }

  function liveWindowFromPersistedTarget(target: WindowTarget): LiveWindow | null {
    if (!target.lastNativeRef) return null
    return {
      id: `${target.platform}:${target.lastNativeRef}`,
      platform: target.platform,
      nativeRef: target.lastNativeRef,
      appId: target.appId,
      appName: target.appName,
      pid: 0,
      title: target.titleLocator,
      minimized: false,
      focused: false
    }
  }

  async function activateWindowSlot(slotNumber: number) {
    const attempt = activationAttemptFor('slot', slotNumber)
    if (!isTabEnabled('windows')) return finishWindowActivation(attempt, 'entry', 'feature-disabled', 'blocking')
    const slot = state.windowSlots.find((item) => item.slot === slotNumber)
    if (!slot) {
      return finishWindowActivation(attempt, 'entry', 'slot-missing', 'blocking')
    }
    const capability = await readWindowActivationCapability(attempt)
    if (!capability) return false
    if (capability.platform !== 'darwin' && capability.platform !== 'win32') {
      return finishWindowActivation(attempt, 'capability', 'unsupported-host', 'blocking')
    }
    const platformId = capability.platform
    const targetId = slot.targetIdByPlatform[platformId]
    const target = windowTargetById(targetId)
    if (!target) {
      return finishWindowActivation(attempt, 'entry', 'slot-unassigned', 'blocking', { platformId })
    }
    return activateWindowTargetWithRecovery(target, attempt)
  }

  function resolveWindowActionTargets(rowId?: string) {
    const resolved = resolveDrawerTargets({
      focusedId: focusedWindowId,
      selectedIds: selectedWindowIds,
      explicitId: rowId || null
    })
    const rows = windowRows()
    const targets = resolved.targetIds
      .map((id) => rows.find((row) => row.id === id) || null)
      .filter((row): row is WindowRow => Boolean(row))
    return { mode: resolved.mode, targets }
  }

  function openWindowActions(rowId?: string) {
    const { mode, targets } = resolveWindowActionTargets(rowId)
    if (!targets.length) {
      setMessage('没有可操作的窗口')
      return false
    }
    windowActionsMode = mode
    focusedWindowId = targets[0].id
    windowActionTargetId = targets[0].id
    windowActionsOpen = true
    windowActionsFocusRequestId += 1
    notify()
    return true
  }

  function closeWindowActions() {
    if (!windowActionsOpen) return false
    windowActionsOpen = false
    windowActionTargetId = null
    windowActionsMode = 'single'
    windowFocusRequestId += 1
    notify()
    return true
  }

  function clearWindowSelection() {
    if (!selectedWindowIds.length) return false
    selectedWindowIds = []
    notify()
    return true
  }

  function windowRowsForClose(rowId?: string): WindowRow[] {
    const { mode, targets } = resolveWindowActionTargets(rowId)
    if (targets.length) return targets
    const focused = windowRowById(focusedWindowId)
    return focused ? [focused] : []
  }

  async function closeWindowRows(rowId?: string, force = false) {
    const rows = windowRowsForClose(rowId).filter((row) => row.live)
    if (!rows.length) {
      setMessage('没有可关闭的实时窗口')
      return false
    }
    if (force) {
      const failures: string[] = []
      for (const row of rows) {
        if (!row.live) continue
        const result = await platform.windows.terminate?.(row.live)
        if (!result || result.outcome !== 'terminated') failures.push(row.displayName)
      }
      await refreshWindows()
      selectedWindowIds = []
      setMessage(failures.length ? `强制关闭完成，${failures.length} 个失败` : `已强制关闭 ${rows.length} 个窗口`)
      return failures.length === 0
    }
    const failed: WindowRow[] = []
    let closed = 0
    for (const row of rows) {
      if (!row.live) continue
      const result = await platform.windows.close?.(row.live)
      if (result?.outcome === 'closed') closed += 1
      else failed.push(row)
    }
    await refreshWindows()
    if (!failed.length) {
      selectedWindowIds = []
      setMessage(`已关闭 ${closed} 个窗口`)
      return true
    }
    confirm = {
      title: '强制关闭未响应窗口？',
      detail: `${failed.length} 个窗口未能正常关闭：${failed.map((row) => row.displayName).join('、')}。确认后将终止对应进程，可能丢失未保存内容。`,
      onConfirm: () => {
        confirm = null
        void closeWindowRows(undefined, true)
      }
    }
    // Keep failed rows selected for force path.
    selectedWindowIds = failed.map((row) => row.id)
    focusedWindowId = failed[0]?.id || focusedWindowId
    notify()
    return false
  }

  function favoriteWindowRows(rowId?: string) {
    const targets = resolveWindowActionTargets(rowId).targets
    if (!targets.length) {
      setMessage('没有可收藏的窗口')
      return false
    }
    let changed = 0
    for (const row of targets) {
      if (!row.live && !row.target) continue
      const ensured = ensureWindowTarget(row)
      if (!ensured) continue
      if (!ensured.favorite) {
        state.windowTargets = state.windowTargets.map((item) => item.id === ensured.id ? { ...item, favorite: true, updatedAt: Date.now() } : item)
        changed += 1
      }
    }
    if (changed) {
      save()
      normalizeFocusedWindow(false)
    }
    setMessage(changed ? `已收藏 ${changed} 个窗口` : '选中窗口均已收藏')
    notify()
    return true
  }

  function toggleWindowFavorite(rowId?: string) {
    const row = windowRowById(rowId || focusedWindowId)
    if (!row) {
      setMessage('没有可收藏的窗口')
      return false
    }
    if (row.target) {
      const target = { ...row.target, favorite: !row.target.favorite, updatedAt: Date.now() }
      state.windowTargets = state.windowTargets.map((item) => item.id === target.id ? target : item)
      if (!target.favorite) {
        pruneOrphanWindowTargets()
        if (!windowTargetById(target.id) && row.live) {
          remapWindowRowIdentity(row.id, `live:${row.live.id}`)
        }
      }
      save()
      normalizeFocusedWindow(false)
      setMessage(target.favorite ? '已收藏窗口；别名仅保存在 EyPc' : '已取消收藏；置顶或稳定槽仍会保留该目标')
      return true
    }
    const target = ensureWindowTarget(row)
    if (!target) {
      setMessage('窗口当前不可收藏')
      return false
    }
    if (!target.favorite) {
      target.favorite = true
      target.updatedAt = Date.now()
    }
    const targetRowId = `target:${target.id}`
    remapWindowRowIdentity(row.id, targetRowId)
    focusedWindowId = targetRowId
    save()
    setMessage('已收藏窗口；别名仅保存在 EyPc')
    return true
  }

  function toggleWindowPins(rowId?: string) {
    const targets = resolveWindowActionTargets(rowId).targets
    if (!targets.length) {
      setMessage('没有可加入列表置顶的窗口')
      return false
    }
    const pin = targets.some((row) => !row.pinned)
    const liveFocusByTargetId = new Map<string, string>()
    let changed = 0
    for (const row of targets) {
      const target = row.target || (pin ? ensureWindowTarget(row, { favorite: false }) : null)
      if (!target || Boolean(target.pinned) === pin) continue
      state.windowTargets = state.windowTargets.map((item) => item.id === target.id
        ? { ...item, pinned: pin, updatedAt: Date.now() }
        : item)
      if (pin && !row.target) remapWindowRowIdentity(row.id, `target:${target.id}`)
      if (!pin && row.live) liveFocusByTargetId.set(target.id, `live:${row.live.id}`)
      changed += 1
    }
    if (!changed) {
      setMessage(pin ? '选中窗口均已在列表置顶' : '选中窗口均未在列表置顶')
      return true
    }
    if (!pin) {
      pruneOrphanWindowTargets()
      for (const [targetId, liveRowId] of liveFocusByTargetId) {
        if (!windowTargetById(targetId)) remapWindowRowIdentity(`target:${targetId}`, liveRowId)
      }
    }
    save()
    normalizeFocusedWindow(false)
    setMessage(pin ? `已将 ${changed} 个窗口置于列表顶部` : `已取消 ${changed} 个窗口的列表置顶`)
    notify()
    return true
  }

  function beginWindowDraft(mode: WindowDraftMode, rowId?: string) {
    const row = windowRowById(rowId || focusedWindowId)
    if (!row) {
      setMessage('请先选择窗口')
      return false
    }
    const source = row.live
    const target = row.target
    if (!source && !target) return false
    windowDraft = {
      mode,
      targetId: target?.id || null,
      sourceWindowId: source?.id || null,
      alias: target?.alias || source?.title || '',
      appName: target?.appName || source?.appName || '',
      appId: target?.appId || source?.appId || '',
      titleLocator: target?.titleLocator || source?.title || '',
      activeField: 'alias'
    }
    windowActionsOpen = false
    windowActionTargetId = null
    windowFocusRequestId += 1
    notify()
    return true
  }

  function updateWindowDraft(input: Partial<Pick<WindowDraft, 'alias' | 'titleLocator' | 'activeField'>>) {
    if (!windowDraft) return
    windowDraft = { ...windowDraft, ...input }
    notify()
  }

  function moveWindowDraftField(direction: 1 | -1) {
    if (!windowDraft) return false
    if (windowDraft.mode === 'rename') {
      windowDraft = { ...windowDraft, activeField: 'alias' }
      windowFocusRequestId += direction
      notify()
      return true
    }
    windowDraft = { ...windowDraft, activeField: windowDraft.activeField === 'alias' ? 'titleLocator' : 'alias' }
    windowFocusRequestId += direction
    notify()
    return true
  }

  function saveWindowDraft() {
    if (!windowDraft) return false
    const alias = windowDraft.alias.trim()
    const titleLocator = windowDraft.titleLocator.trim()
    if (!alias || !titleLocator || !windowDraft.appId.trim()) {
      setMessage('别名、应用和标题定位条件不能为空')
      return false
    }
    const existing = windowTargetById(windowDraft.targetId)
    const source = liveWindows.find((live) => live.id === windowDraft?.sourceWindowId) || null
    const now = Date.now()
    const target: WindowTarget = existing
      ? { ...existing, alias, titleLocator, appId: windowDraft.appId.trim(), appName: windowDraft.appName.trim() || windowDraft.appId.trim(), lastNativeRef: source?.nativeRef || existing.lastNativeRef, updatedAt: now }
      : source
        ? { ...createWindowTarget(source, alias), titleLocator, appId: windowDraft.appId.trim(), appName: windowDraft.appName.trim() || windowDraft.appId.trim(), updatedAt: now }
        : { id: `window:${now}:${Math.random().toString(36).slice(2, 10)}`, alias, platform: currentWindowPlatform() || 'darwin', appId: windowDraft.appId.trim(), appName: windowDraft.appName.trim() || windowDraft.appId.trim(), titleLocator, lastNativeRef: null, favorite: true, pinned: false, createdAt: now, updatedAt: now }
    state.windowTargets = existing
      ? state.windowTargets.map((item) => item.id === target.id ? target : item)
      : [...state.windowTargets, target]
    focusedWindowId = `target:${target.id}`
    windowDraft = null
    windowFocusRequestId += 1
    save()
    setMessage('已保存 EyPc 窗口别名与定位条件')
    return true
  }

  function cancelWindowDraft() {
    if (!windowDraft) return false
    windowDraft = null
    windowFocusRequestId += 1
    notify()
    return true
  }

  function assignWindowSlot(slotNumber: number, rowId?: string) {
    const row = windowRowById(rowId || focusedWindowId)
    const platform = currentWindowPlatform()
    if (!row || !platform || slotNumber < 1 || slotNumber > 10) {
      setMessage('当前无法分配窗口槽位')
      return false
    }
    // A stable hotkey retains the target by reference; it must not silently become a user favorite.
    const target = ensureWindowTarget(row, { favorite: false })
    if (!target) return false
    state.windowSlots = state.windowSlots.map((slot) => slot.slot === slotNumber
      ? { ...slot, targetIdByPlatform: { ...slot.targetIdByPlatform, [platform]: target.id } }
      : slot)
    focusedWindowId = `target:${target.id}`
    save()
    setMessage(`已将 “${target.alias}” 分配到窗口槽 ${slotNumber}（${platform === 'darwin' ? 'macOS' : 'Windows'}）`)
    return true
  }

  function pruneOrphanWindowTargets() {
    const referenced = new Set<string>()
    for (const slot of state.windowSlots) {
      for (const targetId of Object.values(slot.targetIdByPlatform)) {
        if (targetId) referenced.add(targetId)
      }
    }
    const next = state.windowTargets.filter((target) => target.favorite || target.pinned || referenced.has(target.id))
    if (next.length === state.windowTargets.length) return
    state.windowTargets = next
  }

  function clearWindowSlot(slotNumber: number) {
    const platform = currentWindowPlatform()
    if (!platform || slotNumber < 1 || slotNumber > 10) {
      setMessage('当前无法清除窗口槽位')
      return false
    }
    const slot = state.windowSlots.find((item) => item.slot === slotNumber)
    const previousId = slot?.targetIdByPlatform[platform]
    if (!previousId) {
      setMessage(`窗口槽 ${slotNumber} 当前平台尚未分配`)
      return false
    }
    const alias = windowTargetById(previousId)?.alias || previousId
    state.windowSlots = state.windowSlots.map((item) => {
      if (item.slot !== slotNumber) return item
      const targetIdByPlatform = { ...item.targetIdByPlatform }
      delete targetIdByPlatform[platform]
      return { ...item, targetIdByPlatform }
    })
    pruneOrphanWindowTargets()
    normalizeFocusedWindow(false)
    save()
    setMessage(`已清除窗口槽 ${slotNumber} 的 ${platform === 'darwin' ? 'macOS' : 'Windows'} 关联（“${alias}”）；uTools 全局快捷键需在官方设置中自行解绑`)
    return true
  }

  function configureWindowSlotHotkey(slotNumber: number) {
    if (slotNumber < 1 || slotNumber > 10) return false
    const label = windowSlotLabel(slotNumber)
    const opened = platform.app.configureHotkey?.(label) || false
    if (!opened) setMessage('当前宿主无法打开 uTools 快捷键设置')
    return opened
  }

  function focusWindowSlot(slotNumber: number) {
    if (slotNumber < 1 || slotNumber > 10) return false
    const platformId = currentWindowPlatform()
    const slot = state.windowSlots.find((item) => item.slot === slotNumber)
    if (!slot) {
      setMessage('窗口槽位不存在')
      return false
    }
    const targetId = platformId
      ? slot.targetIdByPlatform[platformId]
      : Object.values(slot.targetIdByPlatform).find(Boolean)
    if (!targetId) {
      setMessage(`窗口槽 ${slotNumber} 尚未分配目标`)
      return false
    }
    focusedWindowId = `target:${targetId}`
    windowFocusRequestId += 1
    notify()
    return true
  }

  async function copyWindowHandle(rowId?: string) {
    const row = windowRowById(rowId || focusedWindowId)
    if (!row?.live || row.live.platform !== 'win32') {
      setMessage('仅 Windows 实时窗口可复制 HWND')
      return false
    }
    const copied = await platform.clipboard.copyText(row.live.nativeRef)
    setMessage(copied ? '已复制 HWND' : '当前宿主无法复制 HWND')
    return copied
  }

  function setTab(tab: AppTabId, options: { refreshWindows?: boolean } = {}) {
    state.activeTab = isTabEnabled(tab) ? tab : 'settings'
    if (state.activeTab === 'mqtt') ensureMqttArchiveLoaded()
    if (state.activeTab === 'windows' && options.refreshWindows === true) void refreshWindows()
    save()
    notify()
    codexController.syncActivation(state.activeTab === 'codex')
  }

  function currentVisibleFeatures(): VisibleFeatureDefinition[] {
    return visibleFeatures(state.settings.featureConfigs)
  }

  function isTabEnabled(tab: AppTabId): boolean {
    return state.settings.featureConfigs.find((config) => config.id === tab)?.enabled !== false
  }

  function normalizeActiveTab() {
    if (!isTabEnabled(state.activeTab)) state.activeTab = 'settings'
  }

  function currentMqttConfig(): MqttConnectionConfig | null {
    return state.mqtt.configs.find((item) => item.id === state.mqtt.activeConfigId) || state.mqtt.configs[0] || null
  }

  function mqttConfigById(id: string | null): MqttConnectionConfig | null {
    return id ? state.mqtt.configs.find((item) => item.id === id) || null : null
  }

  function mqttConnectionGroupById(id: string | null): MqttConnectionGroup | null {
    return id ? state.mqtt.connectionGroups.find((item) => item.id === id) || null : null
  }

  function mqttConnectionSelectedTarget(): MqttConnectionTreeTarget | null {
    if (mqttSelectedRecord?.kind === 'config') return { kind: 'config', id: mqttSelectedRecord.id }
    if (mqttSelectedRecord?.kind === 'connection-group') return { kind: 'group', id: mqttSelectedRecord.id }
    return state.mqtt.activeConfigId ? { kind: 'config', id: state.mqtt.activeConfigId } : null
  }

  function mqttConnectionTreeRowsForSnapshot(): MqttConnectionTreeRow[] {
    return buildMqttConnectionTreeRows(state.mqtt.configs, state.mqtt.connectionGroups, {
      collapsedIds: state.mqtt.layoutPrefs.collapsedConnectionGroupIds,
      activeConfigId: state.mqtt.activeConfigId,
      selectedConfigIds: mqttSelectedConfigIds,
      selectedTarget: mqttConnectionSelectedTarget()
    })
  }

  function mqttTreeKindFromRaw(value: unknown): MqttConnectionTreeTarget['kind'] | null {
    if (value === 'group' || value === 'connection-group') return 'group'
    if (value === 'config') return 'config'
    return null
  }

  function mqttConnectionTreeTargetFromArgs(args?: Record<string, unknown>, prefix: 'target' | 'moving' | 'self' = 'target'): MqttConnectionTreeTarget | null {
    const kindValue = prefix === 'moving'
      ? args?.movingKind
      : prefix === 'target'
        ? (args?.targetKind ?? args?.kind)
        : args?.kind
    const idValue = prefix === 'moving'
      ? args?.movingId
      : prefix === 'target'
        ? (args?.targetId ?? args?.id)
        : args?.id
    const kind = mqttTreeKindFromRaw(kindValue)
    const id = typeof idValue === 'string' ? idValue.trim() : ''
    return kind && id ? { kind, id } : null
  }

  function focusMqttConnectionGroupInternal(id: string, notifyChange = true): boolean {
    const group = mqttConnectionGroupById(id)
    if (!group) return false
    mqttSelectedRecord = { kind: 'connection-group', id: group.id }
    activeMqttPane = 'connections'
    if (notifyChange) notify()
    return true
  }

  function focusMqttConnectionTreeTarget(target: MqttConnectionTreeTarget, notifyChange = true): boolean {
    return target.kind === 'config'
      ? focusMqttConfigInternal(target.id, notifyChange)
      : focusMqttConnectionGroupInternal(target.id, notifyChange)
  }

  function mqttFocusedGroupIdFromArgs(args?: Record<string, unknown>): string | null {
    const target = mqttConnectionTreeTargetFromArgs(args)
    if (target?.kind === 'group') return target.id
    const explicitId = typeof args?.groupId === 'string' ? args.groupId.trim() : ''
    if (explicitId) return explicitId
    const id = typeof args?.id === 'string' ? args.id.trim() : ''
    if (id && mqttConnectionGroupById(id)) return id
    return mqttSelectedRecord?.kind === 'connection-group' ? mqttSelectedRecord.id : null
  }

  function mqttConfigIdFromArgs(args?: Record<string, unknown>): string | null {
    const explicit = mqttExplicitTargetFromArgs(args)
    if (explicit?.kind === 'config') return explicit.id
    if (explicit?.kind === 'connection-group' || mqttConnectionTreeTargetFromArgs(args)?.kind === 'group') return null
    if (typeof args?.configId === 'string' && args.configId.trim()) return args.configId.trim()
    if (mqttSelectedRecord?.kind === 'config') return mqttSelectedRecord.id
    if (mqttSelectedRecord?.kind === 'connection-group') return null
    return state.mqtt.activeConfigId || currentMqttConfig()?.id || null
  }

  function focusMqttConfigInternal(id: string, notifyChange = true): boolean {
    const config = mqttConfigById(id)
    if (!config) return false
    ensureMqttArchiveLoaded()
    state.mqtt.activeConfigId = config.id
    mqttSelectedRecord = { kind: 'config', id: config.id }
    activeMqttPane = 'connections'
    mqttCurrentSessionId = null
    restoreMqttActiveSubscriptionTopics(config)
    if (notifyChange) {
      save()
      notify()
    }
    return true
  }

  function toggleMqttConnectionSelection(args?: Record<string, unknown>, advance = true) {
    const targetId = mqttConfigIdFromArgs(args)
    if (!targetId || !mqttConfigById(targetId)) return false
    focusMqttConfigInternal(targetId, false)
    const rows = mqttConnectionTreeRowsForSnapshot().filter((row) => row.kind === 'config').map((row) => ({ id: row.id }))
    const next = toggleIdWithAdvance({
      rows: rows.length ? rows : [{ id: targetId }],
      focusedId: targetId,
      selectedIds: mqttSelectedConfigIds,
      advance
    })
    mqttSelectedConfigIds = next.selectedIds
    if (next.focusedId && next.focusedId !== targetId) focusMqttConfigInternal(next.focusedId, false)
    save()
    notify()
    return true
  }

  function clearMqttRailSelection() {
    const hasSubscriptionFocus = !!mqttFocusedSubscriptionTopic || mqttSelectedRecord?.kind === 'subscription'
    const hasActiveSubscriptionFilter = mqttActiveSubscriptionTopics.length > 0
    if (!mqttSelectedConfigIds.length && !mqttSelectedSubscriptionTopics.length && !hasSubscriptionFocus && !hasActiveSubscriptionFilter) return false
    mqttSelectedConfigIds = []
    mqttSelectedSubscriptionTopics = []
    mqttFocusedSubscriptionTopic = null
    if (mqttSelectedRecord?.kind === 'subscription') mqttSelectedRecord = null
    if (hasActiveSubscriptionFilter) {
      const config = currentMqttConfig()
      if (config) {
        setMqttActiveSubscriptionTopics(config, [])
        persistMqttViewPrefs()
      } else {
        mqttActiveSubscriptionTopics = []
        syncMqttActiveSubscriptionTopic()
      }
    }
    notify()
    return true
  }

  function moveMqttConnectionFocus(direction: 1 | -1, page = false) {
    const rows = mqttConnectionTreeRowsForSnapshot()
    if (!rows.length) {
      state.mqtt.activeConfigId = null
      mqttSelectedRecord = null
      notify()
      return true
    }
    const currentTarget = mqttConnectionSelectedTarget()
    const currentIndex = rows.findIndex((item) => currentTarget && item.kind === currentTarget.kind && item.id === currentTarget.id)
    const current = currentIndex >= 0 ? currentIndex : direction > 0 ? -1 : rows.length
    const nextIndex = Math.min(rows.length - 1, Math.max(0, current + direction * (page ? 5 : 1)))
    return focusMqttConnectionTreeTarget(rows[nextIndex].target)
  }

  function deleteMqttConfigs(ids: string[]) {
    const targets = [...new Set(ids.map((id) => id.trim()).filter((id) => mqttConfigById(id)))]
    if (!targets.length) return false
    const targetSet = new Set(targets)
    state.mqtt.configs = state.mqtt.configs.filter((item) => !targetSet.has(item.id))
    for (const id of targets) {
      delete state.mqtt.viewPrefs.activeSubscriptionTopicsByConfigId[id]
      mqttSecrets.delete(id)
    }
    persistMqttSecrets()
    mqttSelectedConfigIds = mqttSelectedConfigIds.filter((id) => !targetSet.has(id))
    if (state.mqtt.activeConfigId && targetSet.has(state.mqtt.activeConfigId)) {
      state.mqtt.activeConfigId = state.mqtt.configs[0]?.id || null
    }
    restoreMqttActiveSubscriptionTopics()
    mqttSelectedRecord = state.mqtt.activeConfigId ? { kind: 'config', id: state.mqtt.activeConfigId } : null
    activeMqttPane = 'connections'
    closeMqttDrawer(false)
    save()
    notify()
    return true
  }

  function deleteMqttConnectionGroupById(id: string) {
    const group = mqttConnectionGroupById(id)
    if (!group) return false
    const result = deleteMqttConnectionGroup(state.mqtt.configs, state.mqtt.connectionGroups, group.id)
    state.mqtt.configs = result.configs
    state.mqtt.connectionGroups = result.groups
    state.mqtt.layoutPrefs.collapsedConnectionGroupIds = state.mqtt.layoutPrefs.collapsedConnectionGroupIds.filter((groupId) => groupId !== group.id && result.groups.some((item) => item.id === groupId))
    const nextTarget = group.parentId && mqttConnectionGroupById(group.parentId)
      ? { kind: 'connection-group' as const, id: group.parentId }
      : null
    mqttSelectedRecord = nextTarget || (state.mqtt.activeConfigId ? { kind: 'config', id: state.mqtt.activeConfigId } : null)
    activeMqttPane = 'connections'
    closeMqttDrawer(false)
    save()
    notify()
    return true
  }

  function deleteFocusedMqttConnection(args?: Record<string, unknown>) {
    const groupId = mqttFocusedGroupIdFromArgs(args)
    if (groupId) return deleteMqttConnectionGroupById(groupId)
    const targetId = mqttConfigIdFromArgs(args)
    return targetId ? deleteMqttConfigs([targetId]) : false
  }

  function deleteSelectedMqttConnections() {
    return deleteMqttConfigs(mqttSelectedConfigIds.length ? mqttSelectedConfigIds : [mqttConfigIdFromArgs() || ''])
  }

  function copyMqttConnectionAddress(args?: Record<string, unknown>) {
    if (mqttConnectionTreeTargetFromArgs(args)?.kind === 'group' || mqttSelectedRecord?.kind === 'connection-group') return false
    const config = mqttConfigById(mqttConfigIdFromArgs(args))
    if (!config?.url) return false
    void copyText(config.url, '已复制 MQTT 连接地址')
    return true
  }

  function mqttConnectionGroupCollapseTargetId(args?: Record<string, unknown>): string | null {
    const target = mqttConnectionTreeTargetFromArgs(args)
    if (target?.kind === 'group') return target.id
    return mqttFocusedGroupIdFromArgs(args)
  }

  function setMqttConnectionGroupCollapsed(args: Record<string, unknown> | undefined, collapsed: boolean) {
    const id = mqttConnectionGroupCollapseTargetId(args)
    if (!id || !mqttConnectionGroupById(id)) return false
    const current = new Set(state.mqtt.layoutPrefs.collapsedConnectionGroupIds)
    if (collapsed) current.add(id)
    else current.delete(id)
    state.mqtt.layoutPrefs.collapsedConnectionGroupIds = [...current].filter((groupId) => mqttConnectionGroupById(groupId))
    persistMqttLayoutPrefs()
    notify()
    return true
  }

  function toggleMqttConnectionGroupCollapse(args?: Record<string, unknown>) {
    const id = mqttConnectionGroupCollapseTargetId(args)
    if (!id || !mqttConnectionGroupById(id)) return false
    return setMqttConnectionGroupCollapsed(args, !state.mqtt.layoutPrefs.collapsedConnectionGroupIds.includes(id))
  }

  function moveMqttConnectionTreeFromArgs(args?: Record<string, unknown>) {
    const movingTarget = mqttConnectionTreeTargetFromArgs(args, 'moving')
    const dropTarget = mqttConnectionTreeTargetFromArgs(args, 'target')
    const position: MqttConnectionTreeDropPosition = args?.position === 'before' || args?.position === 'after' || args?.position === 'inside'
      ? args.position
      : 'inside'
    if (!movingTarget || !dropTarget) return false
    const resolved = mqttConnectionTreeMoveTarget(state.mqtt.configs, state.mqtt.connectionGroups, movingTarget, dropTarget, position)
    if (!resolved) return false
    const result = moveMqttConnectionTreeTarget(state.mqtt.configs, state.mqtt.connectionGroups, movingTarget, resolved.parentGroupId, resolved.beforeTarget)
    state.mqtt.configs = result.configs
    state.mqtt.connectionGroups = result.groups
    state.mqtt.layoutPrefs.collapsedConnectionGroupIds = state.mqtt.layoutPrefs.collapsedConnectionGroupIds.filter((id) => mqttConnectionGroupById(id))
    focusMqttConnectionTreeTarget(movingTarget, false)
    save()
    notify()
    return true
  }

  function mqttSubscriptionKey(configId: string, topic: string): string {
    return `${configId}\n${topic}`
  }

  function mqttSubscriptionRuntimeState(configId: string, topic: string) {
    const key = mqttSubscriptionKey(configId, topic)
    const current = mqttSubscriptionRuntime.get(key) || { note: '', unreadCount: 0 }
    mqttSubscriptionRuntime.set(key, current)
    return current
  }

  function validMqttSubscriptionTopics(config: MqttConnectionConfig, topics: string[]): string[] {
    const valid = new Set(config.subscriptions)
    return [...new Set(topics.map((topic) => topic.trim()).filter((topic) => valid.has(topic)))]
  }

  function syncMqttActiveSubscriptionTopic() {
    mqttActiveSubscriptionTopic = mqttActiveSubscriptionTopics[0] || null
  }

  function currentMqttInfoFilter(): MqttInfoFilter {
    return activeMqttRecordList === 'templates' ? 'favorites' : mqttReceiveFilter
  }

  function persistMqttViewPrefs() {
    const activeTopicsByConfig = { ...state.mqtt.viewPrefs.activeSubscriptionTopicsByConfigId }
    for (const config of state.mqtt.configs) {
      const topics = config.id === state.mqtt.activeConfigId
        ? validMqttSubscriptionTopics(config, mqttActiveSubscriptionTopics)
        : validMqttSubscriptionTopics(config, activeTopicsByConfig[config.id] || [])
      if (topics.length) activeTopicsByConfig[config.id] = topics
      else delete activeTopicsByConfig[config.id]
    }
    state.mqtt.viewPrefs = {
      infoFilter: currentMqttInfoFilter(),
      activeSubscriptionTopicsByConfigId: activeTopicsByConfig
    }
    save()
  }

  function setMqttActiveSubscriptionTopics(config: MqttConnectionConfig, topics: string[]) {
    mqttActiveSubscriptionTopics = validMqttSubscriptionTopics(config, topics)
    syncMqttActiveSubscriptionTopic()
  }

  function restoreMqttActiveSubscriptionTopics(config: MqttConnectionConfig | null = currentMqttConfig()) {
    mqttActiveSubscriptionTopics = config
      ? validMqttSubscriptionTopics(config, state.mqtt.viewPrefs.activeSubscriptionTopicsByConfigId[config.id] || [])
      : []
    mqttSelectedSubscriptionTopics = [...mqttActiveSubscriptionTopics]
    mqttFocusedSubscriptionTopic = mqttActiveSubscriptionTopics[0] || null
    syncMqttActiveSubscriptionTopic()
  }

  function pruneMqttSubscriptionState(config: MqttConnectionConfig) {
    const beforeActive = mqttActiveSubscriptionTopics.join('\n')
    const beforeSelected = mqttSelectedSubscriptionTopics.join('\n')
    const beforeFocused = mqttFocusedSubscriptionTopic
    mqttActiveSubscriptionTopics = validMqttSubscriptionTopics(config, mqttActiveSubscriptionTopics)
    mqttSelectedSubscriptionTopics = validMqttSubscriptionTopics(config, mqttSelectedSubscriptionTopics)
    if (mqttFocusedSubscriptionTopic && !config.subscriptions.includes(mqttFocusedSubscriptionTopic)) mqttFocusedSubscriptionTopic = null
    syncMqttActiveSubscriptionTopic()
    if (beforeActive !== mqttActiveSubscriptionTopics.join('\n') || beforeSelected !== mqttSelectedSubscriptionTopics.join('\n') || beforeFocused !== mqttFocusedSubscriptionTopic) persistMqttViewPrefs()
  }

  restoreMqttActiveSubscriptionTopics()

  function mqttSubscriptionRowsForActiveConfig(): MqttSubscriptionRow[] {
    const config = currentMqttConfig()
    if (!config) return []
    pruneMqttSubscriptionState(config)
    return config.subscriptions.map((topic) => {
      const runtimeState = mqttSubscriptionRuntimeState(config.id, topic)
      const alias = config.subscriptionAliases[topic] || ''
      const color = normalizeMqttTopicColor(config.subscriptionColors[topic], config.subscriptions.indexOf(topic))
      return {
        topic,
        alias,
        color,
        displayName: alias || topic,
        qos: config.qos,
        unreadCount: runtimeState.unreadCount,
        active: mqttActiveSubscriptionTopics.includes(topic),
        selected: mqttSelectedSubscriptionTopics.includes(topic),
        focused: mqttFocusedSubscriptionTopic === topic
      }
    })
  }

  function mqttTopicFilterOptionsForActiveConfig(): MqttTopicFilterOption[] {
    const query = mqttTopicFilterQuery.trim().toLowerCase()
    const allOption: MqttTopicFilterOption = {
      topic: '',
      alias: '',
      label: '全部 topic',
      color: '#9aa8b2',
      active: mqttActiveSubscriptionTopics.length === 0,
      highlighted: false
    }
    const rows = [
      allOption,
      ...mqttSubscriptionRowsForActiveConfig()
        .filter((row) => !query || [row.alias, row.topic].join(' ').toLowerCase().includes(query))
        .map((row) => ({
          topic: row.topic,
          alias: row.alias,
          label: row.displayName,
          color: row.color,
          active: mqttActiveSubscriptionTopics.includes(row.topic),
          highlighted: false
        }))
    ]
    if (rows.length && mqttTopicFilterActiveIndex >= rows.length) mqttTopicFilterActiveIndex = rows.length - 1
    if (mqttTopicFilterActiveIndex < 0) mqttTopicFilterActiveIndex = 0
    return rows.map((row, index) => ({ ...row, highlighted: index === mqttTopicFilterActiveIndex }))
  }

  function focusMqttTopicFilter() {
    mqttTopicFilterOpen = true
    mqttPublishOptionsOpen = false
    activeMqttPane = 'messages'
    const rows = mqttTopicFilterOptionsForActiveConfig()
    const activeIndex = rows.findIndex((item) => item.active)
    mqttTopicFilterActiveIndex = activeIndex >= 0 ? activeIndex : 0
    requestMqttFocus('topic-filter')
    notify()
    return true
  }

  function setMqttTopicFilterSearch(args?: Record<string, unknown>) {
    mqttTopicFilterQuery = typeof args?.query === 'string' ? args.query : ''
    mqttTopicFilterOpen = true
    const rows = mqttTopicFilterOptionsForActiveConfig()
    mqttTopicFilterActiveIndex = rows.length ? Math.min(mqttTopicFilterActiveIndex, rows.length - 1) : 0
    if (mqttTopicFilterQuery.trim() && mqttTopicFilterActiveIndex === 0 && rows.some((row) => row.topic)) {
      mqttTopicFilterActiveIndex = rows.findIndex((row) => row.topic)
    }
    requestMqttFocus('topic-filter')
    notify()
    return true
  }

  function moveMqttTopicFilter(direction: 1 | -1) {
    if (!mqttTopicFilterOpen) mqttTopicFilterOpen = true
    const rows = mqttTopicFilterOptionsForActiveConfig()
    if (!rows.length) {
      mqttTopicFilterActiveIndex = 0
      requestMqttFocus('topic-filter')
      notify()
      return true
    }
    mqttTopicFilterActiveIndex = (mqttTopicFilterActiveIndex + direction + rows.length) % rows.length
    requestMqttFocus('topic-filter')
    notify()
    return true
  }

  function selectMqttTopicFilter(args?: Record<string, unknown>) {
    const config = currentMqttConfig()
    if (!config) return false
    const hasExplicitTopic = typeof args?.topic === 'string'
    const explicitTopic = hasExplicitTopic ? String(args?.topic).trim() : ''
    const rows = mqttTopicFilterOptionsForActiveConfig()
    const selected = hasExplicitTopic ? rows.find((item) => item.topic === explicitTopic) : rows[mqttTopicFilterActiveIndex]
    if (!selected) return false
    const nextTopics = selected.topic && !(mqttActiveSubscriptionTopics.length === 1 && mqttActiveSubscriptionTopics[0] === selected.topic) ? [selected.topic] : []
    setMqttActiveSubscriptionTopics(config, nextTopics)
    mqttSelectedSubscriptionTopics = [...mqttActiveSubscriptionTopics]
    mqttFocusedSubscriptionTopic = selected.topic || null
    mqttTopicFilterOpen = false
    mqttTopicFilterQuery = ''
    persistMqttViewPrefs()
    focusMqttRecordList('messages')
    return true
  }

  function closeMqttTopicFilter() {
    mqttTopicFilterOpen = false
    mqttTopicFilterQuery = ''
    requestMqttFocus('records')
    notify()
    return true
  }

  function setMqttSubscriptionNote(topic: string, note: string) {
    const config = currentMqttConfig()
    const target = topic.trim()
    if (!config || !target || !config.subscriptions.includes(target)) return false
    const runtimeState = mqttSubscriptionRuntimeState(config.id, target)
    runtimeState.note = note.trim()
    notify()
    return true
  }

  function selectMqttSubscription(topic: string | null) {
    const config = currentMqttConfig()
    if (!config) return false
    const target = typeof topic === 'string' ? topic.trim() : ''
    if (!target) {
      activeMqttPane = 'subscriptions'
      mqttFocusedSubscriptionTopic = null
      if (mqttSelectedRecord?.kind === 'subscription') mqttSelectedRecord = null
      mqttSelectedSubscriptionTopics = []
      setMqttActiveSubscriptionTopics(config, [])
      persistMqttViewPrefs()
      notify()
      return true
    }
    if (!config.subscriptions.includes(target)) return false
    activeMqttPane = 'subscriptions'
    mqttFocusedSubscriptionTopic = target
    mqttSelectedRecord = { kind: 'subscription', id: target }
    mqttSelectedSubscriptionTopics = [target]
    setMqttActiveSubscriptionTopics(config, [target])
    mqttSubscriptionRuntimeState(config.id, target).unreadCount = 0
    persistMqttViewPrefs()
    notify()
    return true
  }

  function focusMqttSubscription(topic: string | null) {
    const config = currentMqttConfig()
    const target = typeof topic === 'string' ? topic.trim() : ''
    if (!config || !target || !config.subscriptions.includes(target)) return false
    activeMqttPane = 'subscriptions'
    mqttFocusedSubscriptionTopic = target
    mqttSelectedRecord = { kind: 'subscription', id: target }
    notify()
    return true
  }

  function toggleMqttSubscriptionSelection(topic?: string, advance = true) {
    const config = currentMqttConfig()
    if (!config) return false
    const target = (typeof topic === 'string' ? topic : mqttFocusedSubscriptionTopic || '').trim()
    if (!target || !config.subscriptions.includes(target)) return false
    activeMqttPane = 'subscriptions'
    mqttFocusedSubscriptionTopic = target
    mqttSelectedRecord = { kind: 'subscription', id: target }
    const rows = config.subscriptions.map((id) => ({ id }))
    const next = toggleIdWithAdvance({ rows, focusedId: target, selectedIds: mqttSelectedSubscriptionTopics, advance })
    mqttSelectedSubscriptionTopics = next.selectedIds
    if (next.focusedId) {
      mqttFocusedSubscriptionTopic = next.focusedId
      mqttSelectedRecord = { kind: 'subscription', id: next.focusedId }
    }
    notify()
    return true
  }

  function mqttSubscriptionSelectionMirrorsActiveFilter() {
    if (!mqttSelectedSubscriptionTopics.length) return false
    if (mqttSelectedSubscriptionTopics.length !== mqttActiveSubscriptionTopics.length) return false
    return mqttSelectedSubscriptionTopics.every((topic) => mqttActiveSubscriptionTopics.includes(topic))
  }

  function applyMqttSubscriptionFilter() {
    const config = currentMqttConfig()
    if (!config) return false
    activeMqttPane = 'subscriptions'
    const focusedTopic = mqttFocusedSubscriptionTopic
    const focusShouldOverrideMirroredSelection = Boolean(
      focusedTopic &&
      mqttSubscriptionSelectionMirrorsActiveFilter() &&
      !mqttSelectedSubscriptionTopics.includes(focusedTopic)
    )
    const targets = focusShouldOverrideMirroredSelection && focusedTopic
      ? [focusedTopic]
      : mqttSelectedSubscriptionTopics.length
        ? mqttSelectedSubscriptionTopics
        : focusedTopic
          ? [focusedTopic]
          : []
    setMqttActiveSubscriptionTopics(config, targets)
    mqttSelectedSubscriptionTopics = [...mqttActiveSubscriptionTopics]
    for (const topic of mqttActiveSubscriptionTopics) mqttSubscriptionRuntimeState(config.id, topic).unreadCount = 0
    persistMqttViewPrefs()
    notify()
    return true
  }

  function mqttSubscriptionTopicFromArgs(args?: Record<string, unknown>): string | null {
    const explicit = mqttExplicitTargetFromArgs(args)
    if (explicit?.kind === 'subscription') return explicit.id
    if (typeof args?.topic === 'string' && args.topic.trim()) return args.topic.trim()
    if (mqttSelectedRecord?.kind === 'subscription') return mqttSelectedRecord.id
    return mqttFocusedSubscriptionTopic || mqttActiveSubscriptionTopic || null
  }

  function moveMqttSubscriptionFocus(direction: 1 | -1, page = false) {
    const config = currentMqttConfig()
    if (!config?.subscriptions.length) {
      mqttFocusedSubscriptionTopic = null
      if (mqttSelectedRecord?.kind === 'subscription') mqttSelectedRecord = null
      notify()
      return true
    }
    const currentTopic = mqttFocusedSubscriptionTopic || mqttActiveSubscriptionTopic
    const currentIndex = config.subscriptions.findIndex((topic) => topic === currentTopic)
    const current = currentIndex >= 0 ? currentIndex : direction > 0 ? -1 : config.subscriptions.length
    const nextIndex = Math.min(config.subscriptions.length - 1, Math.max(0, current + direction * (page ? 5 : 1)))
    const topic = config.subscriptions[nextIndex]
    activeMqttPane = 'subscriptions'
    mqttFocusedSubscriptionTopic = topic
    mqttSelectedRecord = { kind: 'subscription', id: topic }
    notify()
    return true
  }

  function copyMqttSubscriptionTopic(args?: Record<string, unknown>) {
    const config = currentMqttConfig()
    const topic = mqttSubscriptionTopicFromArgs(args)
    if (!config || !topic || !config.subscriptions.includes(topic)) return false
    void copyText(topic, '已复制 MQTT 订阅 topic')
    return true
  }

  function useMqttSubscriptionAsPublishTopic(args?: Record<string, unknown>) {
    const config = currentMqttConfig()
    const topic = mqttSubscriptionTopicFromArgs(args)
    if (!config || !topic || !config.subscriptions.includes(topic)) return false
    updateMqttPublishDraftState({ topic })
    activeMqttPane = 'publish'
    requestMqttFocus('publish-topic')
    notify()
    return true
  }

  function unsubscribeMqttTopics(config: MqttConnectionConfig, topics: string[]) {
    if (!mqttClient?.unsubscribe || !topics.length) return
    const target = topics.length === 1 ? topics[0] : topics
    try {
      mqttClient.unsubscribe(target, (error) => {
        if (!error) return
        pushMqttLog('warn', '取消订阅失败', error.message, config.id)
        notify()
      })
    } catch (error) {
      pushMqttLog('warn', '取消订阅失败', error instanceof Error ? error.message : String(error), config.id)
    }
  }

  function subscribeMqttTopics(config: MqttConnectionConfig, topics: string[]) {
    if (!mqttClient?.subscribe || !topics.length) return
    const target = topics.length === 1 ? topics[0] : topics
    try {
      mqttClient.subscribe(target, { qos: config.qos }, (error) => {
        if (!error) return
        pushMqttLog('warn', '新增订阅失败', error.message, config.id)
        notify()
      })
    } catch (error) {
      pushMqttLog('warn', '新增订阅失败', error instanceof Error ? error.message : String(error), config.id)
    }
  }

  function createMqttSubscriptionEditorItem(topic = '', alias = '', color = '', seed = Date.now()): MqttSubscriptionEditorItem {
    return {
      id: `mqtt-subscription-item:${seed}:${Math.random().toString(16).slice(2, 8)}`,
      topic,
      alias,
      color
    }
  }

  function defaultMqttSubscriptionDraft(config: MqttConnectionConfig, appendBlank = false): MqttSubscriptionEditorDraft {
    const items = config.subscriptions.map((topic, index) =>
      createMqttSubscriptionEditorItem(topic, config.subscriptionAliases[topic] || '', normalizeMqttTopicColor(config.subscriptionColors[topic], index), config.createdAt + index)
    )
    const appendedItem = appendBlank ? createMqttSubscriptionEditorItem('', '', normalizeMqttTopicColor('', items.length), Date.now()) : null
    if (appendedItem) items.push(appendedItem)
    return {
      connectionId: config.id,
      items,
      activeItemId: appendedItem?.id || items[0]?.id || null,
      activeField: 'topic'
    }
  }

  function beginMqttSubscriptionDraft(appendBlank = false) {
    if (mqttConfigDraft) return false
    const config = currentMqttConfig()
    if (!config) return beginMqttConfigDraft('create')
    mqttSubscriptionDraft = defaultMqttSubscriptionDraft(config, appendBlank)
    notify()
    return true
  }

  function updateMqttSubscriptionDraft(input: Partial<Omit<MqttSubscriptionEditorDraft, 'connectionId'>>) {
    if (!mqttSubscriptionDraft) return
    const previousDraft = mqttSubscriptionDraft
    const nextItems = input.items ? input.items.map((item) => ({ ...item })) : previousDraft.items
    const requestedActiveItemId = Object.prototype.hasOwnProperty.call(input, 'activeItemId')
      ? input.activeItemId ?? null
      : previousDraft.activeItemId
    let fallbackItemId: string | null = nextItems[0]?.id || null
    if (input.items && previousDraft.activeItemId) {
      const previousIndex = previousDraft.items.findIndex((item) => item.id === previousDraft.activeItemId)
      if (previousIndex >= 0) fallbackItemId = nextItems[Math.min(previousIndex, nextItems.length - 1)]?.id || fallbackItemId
    }
    const nextActiveItemId = requestedActiveItemId && nextItems.some((item) => item.id === requestedActiveItemId)
      ? requestedActiveItemId
      : fallbackItemId
    mqttSubscriptionDraft = {
      ...previousDraft,
      ...input,
      items: nextItems,
      activeItemId: nextActiveItemId
    }
    notify()
  }

  function mqttSubscriptionDraftData(draft: MqttSubscriptionEditorDraft): { subscriptions: string[]; subscriptionAliases: Record<string, string>; subscriptionColors: Record<string, string> } {
    const subscriptions: string[] = []
    const subscriptionAliases: Record<string, string> = {}
    const subscriptionColors: Record<string, string> = {}
    for (const item of draft.items) {
      const topic = item.topic.trim()
      if (!topic || subscriptions.includes(topic)) continue
      subscriptions.push(topic)
      const alias = item.alias.trim()
      if (alias) subscriptionAliases[topic] = alias
      subscriptionColors[topic] = normalizeMqttTopicColor(item.color, subscriptions.length - 1)
    }
    return { subscriptions, subscriptionAliases, subscriptionColors }
  }

  function saveMqttSubscriptionDraft() {
    if (!mqttSubscriptionDraft) return false
    const draft = mqttSubscriptionDraft
    const config = state.mqtt.configs.find((item) => item.id === draft.connectionId)
    if (!config) {
      mqttSubscriptionDraft = null
      notify()
      return false
    }
    const data = mqttSubscriptionDraftData(draft)
    const nextSet = new Set(data.subscriptions)
    const previousSet = new Set(config.subscriptions)
    const added = data.subscriptions.filter((topic) => !previousSet.has(topic))
    const removed = config.subscriptions.filter((topic) => !nextSet.has(topic))
    const now = Date.now()
    const nextConfig = createMqttConnectionConfig({
      ...config,
      subscriptions: data.subscriptions,
      subscriptionAliases: data.subscriptionAliases,
      subscriptionColors: data.subscriptionColors,
      updatedAt: now
    }, now)
    state.mqtt.configs = state.mqtt.configs.map((item) => item.id === config.id ? nextConfig : item)
    for (const topic of removed) mqttSubscriptionRuntime.delete(mqttSubscriptionKey(config.id, topic))
    mqttActiveSubscriptionTopics = mqttActiveSubscriptionTopics.filter((topic) => nextSet.has(topic))
    mqttSelectedSubscriptionTopics = mqttSelectedSubscriptionTopics.filter((topic) => nextSet.has(topic))
    if (mqttFocusedSubscriptionTopic && !nextSet.has(mqttFocusedSubscriptionTopic)) mqttFocusedSubscriptionTopic = data.subscriptions[0] || null
    syncMqttActiveSubscriptionTopic()
    mqttSubscriptionDraft = null
    if (state.mqtt.activeConfigId === config.id) {
      unsubscribeMqttTopics(config, removed)
      subscribeMqttTopics(nextConfig, added)
    }
    save()
    notify()
    return true
  }

  function cancelMqttSubscriptionDraft() {
    if (!mqttSubscriptionDraft) return false
    mqttSubscriptionDraft = null
    notify()
    return true
  }

  function moveMqttSubscriptionDraftField(offset: number) {
    if (!mqttSubscriptionDraft) return false
    const fields: MqttSubscriptionEditorField[] = ['alias', 'topic', 'color']
    if (!mqttSubscriptionDraft.items.length) return false
    const activeItemId = mqttSubscriptionDraft.activeItemId && mqttSubscriptionDraft.items.some((item) => item.id === mqttSubscriptionDraft?.activeItemId)
      ? mqttSubscriptionDraft.activeItemId
      : mqttSubscriptionDraft.items[0].id
    const cells = mqttSubscriptionDraft.items.flatMap((item) => fields.map((field) => ({ itemId: item.id, field })))
    const index = Math.max(0, cells.findIndex((cell) => cell.itemId === activeItemId && cell.field === mqttSubscriptionDraft?.activeField))
    const next = cells[(index + offset + cells.length) % cells.length]
    mqttSubscriptionDraft = {
      ...mqttSubscriptionDraft,
      activeItemId: next.itemId,
      activeField: next.field
    }
    notify()
    return true
  }

  function subscriptionEditorFieldFromArgs(args?: Record<string, unknown>, fallback: MqttSubscriptionEditorField = 'topic'): MqttSubscriptionEditorField {
    return args?.field === 'alias' || args?.field === 'topic' || args?.field === 'color'
      ? args.field
      : fallback
  }

  function activeMqttSubscriptionDraftIndex(draft: MqttSubscriptionEditorDraft): number {
    if (!draft.items.length) return -1
    const activeIndex = draft.items.findIndex((item) => item.id === draft.activeItemId)
    return activeIndex >= 0 ? activeIndex : 0
  }

  function moveMqttSubscriptionDraftRow(offset: number) {
    if (!mqttSubscriptionDraft?.items.length) return false
    const currentIndex = activeMqttSubscriptionDraftIndex(mqttSubscriptionDraft)
    const nextIndex = Math.max(0, Math.min(mqttSubscriptionDraft.items.length - 1, currentIndex + offset))
    mqttSubscriptionDraft = {
      ...mqttSubscriptionDraft,
      activeItemId: mqttSubscriptionDraft.items[nextIndex]?.id || null
    }
    notify()
    return true
  }

  function deleteMqttSubscriptionDraftRow(args?: Record<string, unknown>) {
    if (!mqttSubscriptionDraft?.items.length) return false
    const requestedItemId = typeof args?.itemId === 'string' ? args.itemId : mqttSubscriptionDraft.activeItemId
    let targetIndex = requestedItemId ? mqttSubscriptionDraft.items.findIndex((item) => item.id === requestedItemId) : -1
    if (targetIndex < 0) targetIndex = activeMqttSubscriptionDraftIndex(mqttSubscriptionDraft)
    if (targetIndex < 0) return false
    const activeField = subscriptionEditorFieldFromArgs(args, mqttSubscriptionDraft.activeField)
    const nextItems = mqttSubscriptionDraft.items.filter((_, index) => index !== targetIndex)
    const fallbackIndex = nextItems.length ? Math.min(targetIndex, nextItems.length - 1) : -1
    mqttSubscriptionDraft = {
      ...mqttSubscriptionDraft,
      items: nextItems,
      activeItemId: fallbackIndex >= 0 ? nextItems[fallbackIndex]?.id || null : null,
      activeField
    }
    notify()
    return true
  }

  function deleteMqttSubscriptions(topics: string[]) {
    const config = currentMqttConfig()
    if (!config) return false
    const removed = validMqttSubscriptionTopics(config, topics)
    if (!removed.length) return false
    const removedSet = new Set(removed)
    const nextSubscriptions = config.subscriptions.filter((topic) => !removedSet.has(topic))
    const nextAliases: Record<string, string> = {}
    const nextColors: Record<string, string> = {}
    for (const topic of nextSubscriptions) {
      const alias = config.subscriptionAliases[topic]
      if (alias) nextAliases[topic] = alias
      nextColors[topic] = normalizeMqttTopicColor(config.subscriptionColors[topic], nextSubscriptions.indexOf(topic))
    }
    const now = Date.now()
    state.mqtt.configs = state.mqtt.configs.map((item) => item.id === config.id
      ? createMqttConnectionConfig({
          ...item,
          subscriptions: nextSubscriptions,
          subscriptionAliases: nextAliases,
          subscriptionColors: nextColors,
          updatedAt: now
        }, now)
      : item)
    for (const topic of removed) mqttSubscriptionRuntime.delete(mqttSubscriptionKey(config.id, topic))
    mqttActiveSubscriptionTopics = mqttActiveSubscriptionTopics.filter((topic) => !removedSet.has(topic))
    mqttSelectedSubscriptionTopics = mqttSelectedSubscriptionTopics.filter((topic) => !removedSet.has(topic))
    if (mqttFocusedSubscriptionTopic && removedSet.has(mqttFocusedSubscriptionTopic)) mqttFocusedSubscriptionTopic = nextSubscriptions[0] || null
    if (mqttSelectedRecord?.kind === 'subscription' && removedSet.has(mqttSelectedRecord.id)) {
      mqttSelectedRecord = mqttFocusedSubscriptionTopic ? { kind: 'subscription', id: mqttFocusedSubscriptionTopic } : null
    }
    syncMqttActiveSubscriptionTopic()
    unsubscribeMqttTopics(config, removed)
    save()
    notify()
    return true
  }

  function deleteFocusedMqttSubscription(topic?: string) {
    const target = typeof topic === 'string' && topic.trim() ? topic.trim() : mqttFocusedSubscriptionTopic || mqttActiveSubscriptionTopic || ''
    return deleteMqttSubscriptions(target ? [target] : [])
  }

  function deleteSelectedMqttSubscriptions() {
    return deleteMqttSubscriptions(mqttSelectedSubscriptionTopics)
  }

  function clearAllMqttSubscriptions() {
    const config = currentMqttConfig()
    if (!config) return false
    return deleteMqttSubscriptions(config.subscriptions)
  }

  function updateMqttUnreadForMessage(message: MqttMessageRecord) {
    if (message.direction !== 'incoming') return
    const config = state.mqtt.configs.find((item) => item.id === message.connectionId)
    if (!config) return
    for (const topic of config.subscriptions) {
      if (!matchMqttTopicFilter(message.topic, topic)) continue
      const runtimeState = mqttSubscriptionRuntimeState(config.id, topic)
      if (state.mqtt.activeConfigId === config.id && mqttActiveSubscriptionTopics.includes(topic)) continue
      runtimeState.unreadCount += 1
    }
  }

  function mqttPublishTemplatesForActiveConfig(): MqttPublishTemplate[] {
    const config = currentMqttConfig()
    if (!config) return []
    const query = mqttTemplateSearch.trim().toLowerCase()
    return mqttArchive.publishTemplates
      .filter((item) => item.connectionId === config.id)
      .filter((item) => !query || [item.title, item.topic, item.payload, item.note || ''].join(' ').toLowerCase().includes(query))
      .sort((a, b) => mqttPublishTemplateOperationTime(b) - mqttPublishTemplateOperationTime(a) || b.updatedAt - a.updatedAt)
  }

  function mqttPublishHistoryForActiveConfig(): MqttMessageRecord[] {
    const config = currentMqttConfig()
    if (!config) return []
    const query = mqttHistorySearch.trim().toLowerCase()
    return mqttArchive.sessions
      .filter((session) => session.connectionId === config.id)
      .flatMap((session) => session.messages)
      .filter((message) => message.direction === 'outgoing')
      .filter((message) => !query || [message.title || '', message.note || '', message.topic, message.payload].join(' ').toLowerCase().includes(query))
      .sort((a, b) => b.timestamp - a.timestamp)
  }

  function mqttPublishDraftHistoryForActiveConfig(): MqttPublishDraftHistoryEntry[] {
    const config = currentMqttConfig()
    if (!config) return []
    return mqttArchive.publishDraftHistory
      .filter((item) => item.connectionId === config.id)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  function syncMqttPublishDraftHistorySelection() {
    const visibleIds = new Set(mqttPublishDraftHistoryForActiveConfig().map((item) => item.id))
    mqttPublishDraftHistorySelectedIds = mqttPublishDraftHistorySelectedIds.filter((id) => visibleIds.has(id))
  }

  function activeMqttPublishDraftHistoryEntry(args?: Record<string, unknown>): MqttPublishDraftHistoryEntry | null {
    const id = typeof args?.id === 'string' ? args.id.trim() : ''
    const rows = mqttPublishDraftHistoryForActiveConfig()
    return (id ? rows.find((item) => item.id === id) : rows[mqttPublishDraftHistoryActiveIndex]) || null
  }

  function focusMqttPublishDraftHistoryEntryId(id: string) {
    const rows = mqttPublishDraftHistoryForActiveConfig()
    const index = rows.findIndex((item) => item.id === id)
    if (index >= 0) mqttPublishDraftHistoryActiveIndex = index
    return index >= 0
  }

  function samePublishDraftContent(a: Pick<MqttPublishDraft, 'topic' | 'payload'>, b: Pick<MqttPublishDraft, 'topic' | 'payload'>) {
    return a.topic.trim() === b.topic.trim() && a.payload === b.payload
  }

  function archiveCurrentPublishDraft(source: 'overwrite' | 'manual', replacing?: Pick<MqttPublishDraft, 'topic' | 'payload'> | null) {
    const config = currentMqttConfig()
    const topic = mqttPublishDraft.topic.trim()
    if (!config || !topic) return false
    if (source === 'overwrite') {
      if (topic === config.publishTopic.trim() && mqttPublishDraft.payload === '') return false
      if (replacing && samePublishDraftContent({ topic, payload: mqttPublishDraft.payload }, replacing)) return false
    }
    mqttArchive = saveMqttPublishDraftHistory(mqttArchive, {
      connectionId: config.id,
      title: topic,
      topic,
      payload: mqttPublishDraft.payload,
      qos: mqttPublishDraft.qos,
      retain: mqttPublishDraft.retain,
      source
    })
    saveMqttArchiveForConfig(config.id)
    const rows = mqttPublishDraftHistoryForActiveConfig()
    mqttPublishDraftHistoryActiveIndex = Math.max(0, rows.findIndex((item) => item.topic === topic && item.payload === mqttPublishDraft.payload))
    return true
  }

  function openMqttPublishDraftHistory() {
    closeMqttCommandFocusSurfaces()
    blurMqttInformationFocus()
    mqttPublishDraftHistoryOpen = true
    activeMqttPane = 'publish'
    const rows = mqttPublishDraftHistoryForActiveConfig()
    syncMqttPublishDraftHistorySelection()
    mqttPublishDraftHistoryActiveIndex = rows.length ? Math.min(mqttPublishDraftHistoryActiveIndex, rows.length - 1) : 0
    requestMqttFocus('publish-draft')
    notify()
    return true
  }

  function toggleMqttPublishDraftHistory() {
    if (mqttPublishDraftHistoryOpen) return closeMqttPublishDraftHistory()
    return openMqttPublishDraftHistory()
  }

  function closeMqttPublishDraftHistory() {
    mqttPublishDraftHistoryOpen = false
    mqttPublishDraftHistoryEditDraft = null
    activeMqttPane = 'publish'
    blurMqttInformationFocus()
    requestMqttFocus(mqttPublishActiveField === 'payload' ? 'publish-payload' : 'publish-topic')
    notify()
    return true
  }

  function saveCurrentMqttPublishDraftHistory() {
    const wasOpen = mqttPublishDraftHistoryOpen
    const saved = archiveCurrentPublishDraft('manual')
    if (!saved) return false
    mqttPublishDraftHistoryActiveIndex = 0
    syncMqttPublishDraftHistorySelection()
    if (wasOpen) {
      mqttPublishDraftHistoryOpen = true
      activeMqttPane = 'publish'
      blurMqttInformationFocus()
      requestMqttFocus('publish-draft')
    }
    notify()
    return true
  }

  function moveMqttPublishDraftHistory(direction: 1 | -1) {
    mqttPublishDraftHistoryOpen = true
    blurMqttInformationFocus()
    const rows = mqttPublishDraftHistoryForActiveConfig()
    if (!rows.length) {
      mqttPublishDraftHistoryActiveIndex = 0
    } else {
      mqttPublishDraftHistoryActiveIndex = (mqttPublishDraftHistoryActiveIndex + direction + rows.length) % rows.length
    }
    requestMqttFocus('publish-draft')
    notify()
    return true
  }

  function applyMqttPublishDraftHistory(args?: Record<string, unknown>) {
    const entry = activeMqttPublishDraftHistoryEntry(args)
    if (!entry) return false
    const targetId = entry.id
    mqttPublishDraftHistoryEditDraft = null
    archiveCurrentPublishDraft('overwrite', entry)
    focusMqttPublishDraftHistoryEntryId(targetId)
    mqttPublishDraft = toMqttPublishDraft(entry)
    mqttPublishScratch = { ...mqttPublishDraft }
    mqttPublishActiveField = 'payload'
    activeMqttPane = 'publish'
    mqttTopicFilterOpen = false
    mqttPublishOptionsOpen = false
    mqttPublishDraftHistoryOpen = false
    blurMqttInformationFocus()
    requestMqttFocus('publish-payload')
    notify()
    return true
  }

  function sendMqttPublishDraftHistory(args?: Record<string, unknown>) {
    const entry = activeMqttPublishDraftHistoryEntry(args)
    if (!entry) return false
    const targetId = entry.id
    mqttPublishDraftHistoryEditDraft = null
    archiveCurrentPublishDraft('overwrite', entry)
    mqttPublishDraft = toMqttPublishDraft(entry)
    mqttPublishScratch = { ...mqttPublishDraft }
    mqttPublishActiveField = 'payload'
    const sent = sendMqttPublishDraft()
    if (!sent) return false
    mqttPublishDraftHistoryOpen = true
    activeMqttPane = 'publish'
    blurMqttInformationFocus()
    focusMqttPublishDraftHistoryEntryId(targetId)
    requestMqttFocus('publish-draft')
    notify()
    return true
  }

  function focusMqttPublishDraftHistory(args?: Record<string, unknown>) {
    const id = typeof args?.id === 'string' ? args.id.trim() : ''
    if (!id) return false
    const rows = mqttPublishDraftHistoryForActiveConfig()
    const index = rows.findIndex((item) => item.id === id)
    if (index < 0) return false
    mqttPublishDraftHistoryActiveIndex = index
    mqttPublishDraftHistoryOpen = true
    activeMqttPane = 'publish'
    blurMqttInformationFocus()
    requestMqttFocus('publish-draft')
    notify()
    return true
  }

  function toggleMqttPublishDraftHistorySelection(args?: Record<string, unknown>, advance = true) {
    const entry = activeMqttPublishDraftHistoryEntry(args)
    if (!entry) return false
    const rows = mqttPublishDraftHistoryForActiveConfig()
    const index = rows.findIndex((item) => item.id === entry.id)
    if (index >= 0) mqttPublishDraftHistoryActiveIndex = index
    const next = toggleIdWithAdvance({
      rows: rows.map((item) => ({ id: item.id })),
      focusedId: entry.id,
      selectedIds: mqttPublishDraftHistorySelectedIds,
      advance
    })
    mqttPublishDraftHistorySelectedIds = next.selectedIds
    if (next.focusedId) {
      const nextIndex = rows.findIndex((item) => item.id === next.focusedId)
      if (nextIndex >= 0) mqttPublishDraftHistoryActiveIndex = nextIndex
    }
    mqttPublishDraftHistoryOpen = true
    activeMqttPane = 'publish'
    blurMqttInformationFocus()
    requestMqttFocus('publish-draft')
    notify()
    return true
  }

  function favoriteMqttPublishDraftHistory(args?: Record<string, unknown>) {
    const entry = activeMqttPublishDraftHistoryEntry(args)
    if (!entry) return false
    mqttArchive = saveMqttPublishTemplate(mqttArchive, {
      connectionId: entry.connectionId,
      title: typeof args?.title === 'string' ? args.title : entry.title || entry.topic,
      note: typeof args?.note === 'string' ? args.note : entry.note,
      topic: entry.topic,
      payload: entry.payload,
      qos: entry.qos,
      retain: entry.retain
    })
    saveMqttArchiveForConfig(entry.connectionId)
    activeMqttRecordList = 'templates'
    persistMqttViewPrefs()
    syncMqttRecordListState('templates', true)
    requestMqttFocus('publish-draft')
    notify()
    return true
  }

  function beginMqttPublishDraftHistoryEdit(mode: MqttPublishDraftHistoryEditMode, args?: Record<string, unknown>) {
    const entry = activeMqttPublishDraftHistoryEntry(args)
    if (!entry) return false
    focusMqttPublishDraftHistory({ id: entry.id })
    mqttTopicFilterOpen = false
    mqttPublishOptionsOpen = false
    mqttPublishDraftHistoryOpen = true
    mqttPublishDraftHistoryEditDraft = {
      mode,
      id: entry.id,
      title: entry.title || entry.topic,
      note: entry.note || '',
      topic: entry.topic,
      payload: entry.payload,
      activeField: mode === 'rename' ? 'title' : 'topic'
    }
    activeMqttPane = 'publish'
    blurMqttInformationFocus()
    requestMqttFocus(mqttPublishDraftHistoryEditFocusTarget(mqttPublishDraftHistoryEditDraft.activeField))
    notify()
    return true
  }

  function updateMqttPublishDraftHistoryEditDraft(input: Partial<Pick<MqttPublishDraftHistoryEditDraft, 'title' | 'note' | 'topic' | 'payload' | 'activeField'>>) {
    if (!mqttPublishDraftHistoryEditDraft) return
    const activeField = input.activeField === 'payload' || input.activeField === 'topic' || input.activeField === 'note' || input.activeField === 'title'
      ? input.activeField
      : mqttPublishDraftHistoryEditDraft.activeField
    mqttPublishDraftHistoryEditDraft = {
      ...mqttPublishDraftHistoryEditDraft,
      ...(typeof input.title === 'string' ? { title: input.title } : {}),
      ...(typeof input.note === 'string' ? { note: input.note } : {}),
      ...(typeof input.topic === 'string' ? { topic: input.topic } : {}),
      ...(typeof input.payload === 'string' ? { payload: input.payload } : {}),
      activeField
    }
    notify()
  }

  function moveMqttPublishDraftHistoryEditField(direction: 1 | -1) {
    if (!mqttPublishDraftHistoryEditDraft) return false
    const fields: MqttPublishDraftHistoryEditField[] = mqttPublishDraftHistoryEditDraft.mode === 'rename'
      ? ['title', 'note']
      : ['topic', 'payload']
    const index = fields.indexOf(mqttPublishDraftHistoryEditDraft.activeField)
    const current = index >= 0 ? index : 0
    const nextField = fields[(current + direction + fields.length) % fields.length]
    mqttPublishDraftHistoryEditDraft = {
      ...mqttPublishDraftHistoryEditDraft,
      activeField: nextField
    }
    requestMqttFocus(mqttPublishDraftHistoryEditFocusTarget(nextField))
    notify()
    return true
  }

  function saveMqttPublishDraftHistoryEditDraft() {
    if (!mqttPublishDraftHistoryEditDraft) return false
    const current = activeMqttPublishDraftHistoryEntry({ id: mqttPublishDraftHistoryEditDraft.id })
    if (!current) return false
    const topic = mqttPublishDraftHistoryEditDraft.mode === 'rename' ? current.topic : mqttPublishDraftHistoryEditDraft.topic.trim()
    if (!topic) return false
    const titleInput = mqttPublishDraftHistoryEditDraft.title.trim()
    const title = titleInput || topic
    mqttArchive = updateMqttPublishDraftHistory(mqttArchive, current.id, {
      title,
      note: mqttPublishDraftHistoryEditDraft.note,
      topic,
      payload: mqttPublishDraftHistoryEditDraft.mode === 'rename' ? current.payload : mqttPublishDraftHistoryEditDraft.payload,
      qos: current.qos,
      retain: current.retain
    })
    saveMqttArchiveForConfig(current.connectionId)
    const rows = mqttPublishDraftHistoryForActiveConfig()
    mqttPublishDraftHistoryActiveIndex = Math.max(0, rows.findIndex((item) => item.id === current.id))
    mqttPublishDraftHistoryEditDraft = null
    mqttPublishDraftHistoryOpen = true
    activeMqttPane = 'publish'
    syncMqttPublishDraftHistorySelection()
    requestMqttFocus('publish-draft')
    notify()
    return true
  }

  function cancelMqttPublishDraftHistoryEditDraft() {
    if (!mqttPublishDraftHistoryEditDraft) return false
    mqttPublishDraftHistoryEditDraft = null
    mqttPublishDraftHistoryOpen = true
    activeMqttPane = 'publish'
    requestMqttFocus('publish-draft')
    notify()
    return true
  }

  function deleteMqttPublishDraftHistoryEntry(args?: Record<string, unknown>) {
    const entry = activeMqttPublishDraftHistoryEntry(args)
    if (!entry) return false
    mqttArchive = deleteMqttPublishDraftHistory(mqttArchive, entry.id)
    mqttPublishDraftHistorySelectedIds = mqttPublishDraftHistorySelectedIds.filter((id) => id !== entry.id)
    saveMqttArchiveForConfig(entry.connectionId)
    if (mqttPublishDraftHistoryEditDraft?.id === entry.id) mqttPublishDraftHistoryEditDraft = null
    const rows = mqttPublishDraftHistoryForActiveConfig()
    mqttPublishDraftHistoryActiveIndex = rows.length ? Math.min(mqttPublishDraftHistoryActiveIndex, rows.length - 1) : 0
    notify()
    return true
  }

  function clearCurrentMqttPublishDraftHistory() {
    const config = currentMqttConfig()
    if (!config) return false
    mqttArchive = clearMqttPublishDraftHistory(mqttArchive, config.id)
    saveMqttArchiveForConfig(config.id)
    mqttPublishDraftHistoryActiveIndex = 0
    mqttPublishDraftHistorySelectedIds = []
    mqttPublishDraftHistoryEditDraft = null
    notify()
    return true
  }

  function persistMqttLayoutPrefs() {
    state.mqtt.layoutPrefs = {
      ...state.mqtt.layoutPrefs,
      workspaceLayout: mqttWorkspaceLayout,
      connectionPanelOpen: mqttPanelOpen,
      subscriptionPanelOpen: mqttSubscriptionPanelOpen,
      publishRecordsOpen: mqttPublishRecordsOpen
    }
    save()
  }

  function clampMqttLayoutRatio(value: unknown) {
    const raw = typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_MQTT_LAYOUT_PREFS.stackReceiveRatio
    return Math.round(Math.min(MQTT_LAYOUT_RATIO_MAX, Math.max(MQTT_LAYOUT_RATIO_MIN, raw)) * 1000) / 1000
  }

  function setMqttWorkspaceLayout(layout: MqttWorkspaceLayout) {
    mqttWorkspaceLayout = layout
    persistMqttLayoutPrefs()
  }

  function resizeMqttLayout(args?: Record<string, unknown>) {
    const layout: MqttWorkspaceLayout = args?.layout === 'split' ? 'split' : args?.layout === 'stack' ? 'stack' : mqttWorkspaceLayout
    const receiveRatio = clampMqttLayoutRatio(args?.receiveRatio)
    state.mqtt.layoutPrefs = {
      ...state.mqtt.layoutPrefs,
      ...(layout === 'split' ? { splitReceiveRatio: receiveRatio } : { stackReceiveRatio: receiveRatio })
    }
    persistMqttLayoutPrefs()
    notify()
    return true
  }

  function resetMqttLayoutRatio(args?: Record<string, unknown>) {
    const layout: MqttWorkspaceLayout = args?.layout === 'split' ? 'split' : args?.layout === 'stack' ? 'stack' : mqttWorkspaceLayout
    return resizeMqttLayout({
      layout,
      receiveRatio: layout === 'split' ? DEFAULT_MQTT_LAYOUT_PREFS.splitReceiveRatio : DEFAULT_MQTT_LAYOUT_PREFS.stackReceiveRatio
    })
  }

  function updateToolPreviewPrefs(args?: Record<string, unknown>) {
    state.settings.toolPreviewPrefs = normalizeToolPreviewPrefs({
      ...state.settings.toolPreviewPrefs,
      hoverPreviewEnabled: typeof args?.enabled === 'boolean' ? args.enabled : state.settings.toolPreviewPrefs.hoverPreviewEnabled,
      hoverPreviewDelayMs: typeof args?.delayMs === 'number' ? args.delayMs : state.settings.toolPreviewPrefs.hoverPreviewDelayMs
    })
    save()
    notify()
    return true
  }

  function focusMqttRecordList(list: MqttRecordListId) {
    closeMqttCommandFocusSurfaces()
    activeMqttRecordList = list
    activeMqttPane = 'messages'
    mqttPublishRecordsOpen = list !== 'messages'
    persistMqttLayoutPrefs()
    persistMqttViewPrefs()
    syncMqttRecordListState(list)
    requestMqttFocus('records')
    notify()
    return true
  }

  function focusMqttPublishEditor() {
    closeMqttCommandFocusSurfaces()
    blurMqttInformationFocus()
    activeMqttPane = 'publish'
    mqttPublishActiveField = 'topic'
    requestMqttFocus('publish-topic')
    notify()
    return true
  }

  function blurMqttPublishEditor() {
    closeMqttCommandFocusSurfaces()
    activeMqttPane = 'messages'
    restoreMqttActiveRecordListFocus()
    requestMqttFocus('records')
    notify()
    return true
  }

  function updateMqttPublishDraftState(input: Partial<MqttPublishDraft>) {
    mqttPublishDraft = { ...mqttPublishDraft, ...input }
    mqttPublishScratch = { ...mqttPublishDraft }
    if (Object.prototype.hasOwnProperty.call(input, 'topic')) mqttPublishActiveField = 'topic'
    if (Object.prototype.hasOwnProperty.call(input, 'payload')) mqttPublishActiveField = 'payload'
    activeMqttPane = 'publish'
    blurMqttInformationFocus()
    notify()
  }

  function moveMqttPublishField(direction: 1 | -1) {
    closeMqttCommandFocusSurfaces()
    blurMqttInformationFocus()
    mqttPublishActiveField = direction > 0
      ? (mqttPublishActiveField === 'topic' ? 'payload' : 'topic')
      : (mqttPublishActiveField === 'payload' ? 'topic' : 'payload')
    activeMqttPane = 'publish'
    requestMqttFocus(mqttPublishActiveField === 'topic' ? 'publish-topic' : 'publish-payload')
    notify()
    return true
  }

  function openMqttPublishOptions() {
    mqttTopicFilterOpen = false
    mqttPublishDraftHistoryOpen = false
    mqttPublishDraftHistoryEditDraft = null
    mqttPublishOptionsOpen = true
    mqttPublishOptionsActiveIndex = Math.max(0, Math.min(2, mqttPublishDraft.qos))
    activeMqttPane = 'publish'
    blurMqttInformationFocus()
    requestMqttFocus('publish-options')
    notify()
    return true
  }

  function closeMqttPublishOptions() {
    mqttPublishOptionsOpen = false
    activeMqttPane = 'publish'
    requestMqttFocus(mqttPublishActiveField === 'payload' ? 'publish-payload' : 'publish-topic')
    notify()
    return true
  }

  function moveMqttPublishOptions(direction: 1 | -1) {
    mqttTopicFilterOpen = false
    mqttPublishOptionsOpen = true
    const count = 4
    mqttPublishOptionsActiveIndex = (mqttPublishOptionsActiveIndex + direction + count) % count
    requestMqttFocus('publish-options')
    notify()
    return true
  }

  function selectMqttPublishOption(args?: Record<string, unknown>) {
    mqttPublishOptionsOpen = true
    const option = typeof args?.option === 'string' ? args.option : ''
    const index = option === 'qos0' ? 0 : option === 'qos1' ? 1 : option === 'qos2' ? 2 : option === 'retain' ? 3 : mqttPublishOptionsActiveIndex
    mqttPublishOptionsActiveIndex = Math.max(0, Math.min(3, index))
    if (mqttPublishOptionsActiveIndex <= 2) {
      updateMqttPublishDraftState({ qos: mqttPublishOptionsActiveIndex as MqttQos })
    } else {
      updateMqttPublishDraftState({ retain: !mqttPublishDraft.retain })
    }
    requestMqttFocus('publish-options')
    notify()
    return true
  }

  function setMqttTemplateSearch(args?: Record<string, unknown>) {
    mqttTemplateSearch = typeof args?.query === 'string' ? args.query : ''
    activeMqttRecordList = 'templates'
    activeMqttPane = 'messages'
    mqttPublishRecordsOpen = true
    persistMqttLayoutPrefs()
    const rows = mqttPublishTemplatesForActiveConfig()
    if (mqttSelectedRecord?.kind === 'publish-template' && !rows.some((item) => item.id === mqttSelectedRecord?.id)) mqttSelectedRecord = null
    syncMqttRecordListState('templates', true)
    notify()
    return true
  }

  function setMqttHistorySearch(args?: Record<string, unknown>) {
    mqttHistorySearch = typeof args?.query === 'string' ? args.query : ''
    activeMqttRecordList = 'history'
    activeMqttPane = 'messages'
    mqttPublishRecordsOpen = true
    persistMqttLayoutPrefs()
    if (mqttSelectedRecord?.kind === 'message' && !mqttPublishHistoryForActiveConfig().some((item) => item.id === mqttSelectedRecord?.id)) mqttSelectedRecord = null
    syncMqttRecordListState('history', true)
    notify()
    return true
  }

  function mqttRecordRowsForList(list: MqttRecordListId): MqttRecordSelection[] {
    if (list === 'templates') {
      return mqttPublishTemplatesForActiveConfig().map((item) => ({ kind: 'publish-template', id: item.id }))
    }
    if (list === 'history') {
      return mqttPublishHistoryForActiveConfig().map((item) => ({ kind: 'message', id: item.id }))
    }
    return mqttMessagesForSelection().map((item) => ({ kind: 'message', id: item.id }))
  }

  function mqttRecordRowsForActiveList(): MqttRecordSelection[] {
    return mqttRecordRowsForList(activeMqttRecordList)
  }

  function syncMqttRecordListState(list: MqttRecordListId, selectFirst = false) {
    const rows = mqttRecordRowsForList(list)
    const visibleIds = new Set(rows.map((item) => item.id))
    const current = mqttRecordListStates[list] || { activeIndex: 0, selectedIds: [] }
    const nextIndex = rows.length ? selectFirst ? 0 : Math.min(Math.max(current.activeIndex, 0), rows.length - 1) : 0
    mqttRecordListStates = {
      ...mqttRecordListStates,
      [list]: {
        activeIndex: nextIndex,
        selectedIds: current.selectedIds.filter((id) => visibleIds.has(id))
      }
    }
    if (selectFirst && list === activeMqttRecordList) {
      mqttSelectedRecord = rows[nextIndex] || null
    }
    if (list === activeMqttRecordList && mqttSelectedRecord && !rows.some((row) => row.kind === mqttSelectedRecord?.kind && row.id === mqttSelectedRecord?.id)) {
      mqttSelectedRecord = null
    }
  }

  function restoreMqttActiveRecordListFocus() {
    syncMqttRecordListState(activeMqttRecordList)
    const rows = mqttRecordRowsForActiveList()
    const activeIndex = mqttRecordListStates[activeMqttRecordList]?.activeIndex || 0
    mqttSelectedRecord = rows[activeIndex] || null
  }

  function selectMqttRecord(target: MqttRecordSelection, list: MqttRecordListId = activeMqttRecordList) {
    mqttSelectedRecord = target
    activeMqttRecordList = list
    activeMqttPane = 'messages'
    if (list === 'templates' || list === 'history') {
      mqttPublishRecordsOpen = true
      persistMqttLayoutPrefs()
    }
    if (list === 'messages') {
      mqttPublishRecordsOpen = false
      persistMqttLayoutPrefs()
    }
    const rows = mqttRecordRowsForList(list)
    const index = rows.findIndex((item) => item.kind === target.kind && item.id === target.id)
    if (index >= 0) {
      mqttRecordListStates = {
        ...mqttRecordListStates,
        [list]: {
          ...mqttRecordListStates[list],
          activeIndex: index
        }
      }
    }
    notify()
    return true
  }

  function focusMqttRecordFromArgs(args?: Record<string, unknown>) {
    const target = mqttTargetFromArgs(args)
    if (!target || (target.kind !== 'message' && target.kind !== 'publish-template')) return false
    const listArg = args?.list === 'templates' || args?.list === 'history' || args?.list === 'messages' ? args.list : null
    const list: MqttRecordListId = listArg || (target.kind === 'publish-template' ? 'templates' : activeMqttRecordList === 'history' ? 'history' : 'messages')
    return selectMqttRecord(target, list)
  }

  function moveMqttRecordInList(direction: 1 | -1, page = false) {
    const rows = mqttRecordRowsForActiveList()
    if (!rows.length) {
      mqttSelectedRecord = null
      notify()
      return
    }
    const currentIndex = rows.findIndex((item) => item.kind === mqttSelectedRecord?.kind && item.id === mqttSelectedRecord?.id)
    const current = currentIndex >= 0 ? currentIndex : direction > 0 ? -1 : rows.length
    const next = Math.min(rows.length - 1, Math.max(0, current + direction * (page ? 5 : 1)))
    mqttSelectedRecord = rows[next]
    mqttRecordListStates = {
      ...mqttRecordListStates,
      [activeMqttRecordList]: {
        ...mqttRecordListStates[activeMqttRecordList],
        activeIndex: next
      }
    }
    notify()
  }

  function toggleMqttRecordSelection() {
    const rows = mqttRecordRowsForActiveList()
    if (!rows.length) return false
    const current = mqttRecordListStates[activeMqttRecordList]
    const next = toggleRecordListSelection({
      rows,
      activeIndex: current.activeIndex,
      selectedIds: current.selectedIds
    })
    mqttRecordListStates = {
      ...mqttRecordListStates,
      [activeMqttRecordList]: next
    }
    mqttSelectedRecord = rows[next.activeIndex] || null
    notify()
    return true
  }

  function toggleMqttRecordSelectionFromArgs(args?: Record<string, unknown>) {
    const list = args?.list === 'templates' || args?.list === 'history' || args?.list === 'messages' ? args.list : activeMqttRecordList
    const rows = mqttRecordRowsForList(list)
    const target = mqttTargetFromArgs(args)
    if (!target || (target.kind !== 'message' && target.kind !== 'publish-template')) return toggleMqttRecordSelection()
    const targetIndex = rows.findIndex((row) => row.kind === target.kind && row.id === target.id)
    if (targetIndex < 0) return false
    const current = mqttRecordListStates[list]
    if (args?.range === true) {
      const start = Math.min(current.activeIndex, targetIndex)
      const end = Math.max(current.activeIndex, targetIndex)
      const rangeIds = rows.slice(start, end + 1).map((row) => row.id)
      mqttRecordListStates = {
        ...mqttRecordListStates,
        [list]: {
          activeIndex: targetIndex,
          selectedIds: [...new Set([...current.selectedIds, ...rangeIds])]
        }
      }
      selectMqttRecord(target, list)
      return true
    }
    const selectedIds = current.selectedIds.includes(target.id)
      ? current.selectedIds.filter((id) => id !== target.id)
      : [...current.selectedIds, target.id]
    mqttRecordListStates = {
      ...mqttRecordListStates,
      [list]: {
        activeIndex: targetIndex,
        selectedIds
      }
    }
    selectMqttRecord(target, list)
    return true
  }

  function pushMqttLog(level: MqttLogRecord['level'], messageText: string, detail = '', connectionId: string | null = currentMqttConfig()?.id || null) {
    const now = Date.now()
    mqttLogs = [{
      id: `mqtt-log:${now}:${Math.random().toString(16).slice(2, 8)}`,
      connectionId,
      level,
      message: messageText,
      detail,
      timestamp: now
    }, ...mqttLogs].slice(0, 100)
  }

  function selectedMqttLog(): MqttLogRecord | null {
    const logId = mqttSelectedRecord?.kind === 'log' ? mqttSelectedRecord.id : null
    if (!logId) return null
    return mqttLogs.find((item) => item.id === logId) || null
  }

  function clearMqttLogSelectionIfMissing() {
    if (mqttSelectedRecord?.kind === 'log' && !selectedMqttLog()) mqttSelectedRecord = null
  }

  function deleteMqttLog(id: string | null) {
    if (!id) return false
    const before = mqttLogs.length
    mqttLogs = mqttLogs.filter((item) => item.id !== id)
    if (before === mqttLogs.length) return false
    clearMqttLogSelectionIfMissing()
    notify()
    return true
  }

  function deleteSelectedMqttLog() {
    return deleteMqttLog(mqttSelectedRecord?.kind === 'log' ? mqttSelectedRecord.id : null)
  }

  function clearMqttLogs(scope: 'all' | 'current') {
    if (scope === 'all') {
      if (!mqttLogs.length) return false
      mqttLogs = []
      clearMqttLogSelectionIfMissing()
      notify()
      return true
    }
    const configId = currentMqttConfig()?.id || null
    if (!configId) return false
    const before = mqttLogs.length
    mqttLogs = mqttLogs.filter((item) => item.connectionId !== configId)
    if (before === mqttLogs.length) return false
    clearMqttLogSelectionIfMissing()
    notify()
    return true
  }

  function mqttUnestablishedHint(config: MqttConnectionConfig): string {
    const endpoint = parseMqttWebSocketUrl(config.url)
    const base = `未收到 CONNACK。请检查服务器地址、端口、Path、SSL/TLS、用户名/密码。当前 URL: ${config.url}`
    if (!endpoint.port) return `${base}。当前 URL 未配置端口；如果 Broker 使用 8083/8084，请在配置页填写端口。`
    return base
  }

  function ensureMqttArchiveLoaded() {
    if (mqttArchiveLoaded) return
    mqttArchive = normalizeMqttArchiveState(platform.storage.getMqttArchive())
    mqttArchiveLoaded = true
  }

  function archiveWithConnectionSnapshots(archive: MqttArchiveState): MqttArchiveState {
    const byId = new Map(archive.connectionSnapshots.map((snapshot) => [snapshot.id, snapshot]))
    for (const config of state.mqtt.configs) {
      byId.set(config.id, createMqttConnectionSnapshot(config))
    }
    return normalizeMqttArchiveState({
      ...archive,
      connectionSnapshots: [...byId.values()]
    })
  }

  function saveMqttArchiveForConfig(configId: string | null) {
    if (!configId) return
    mqttArchive = archiveWithConnectionSnapshots(mqttArchive)
    platform.storage.setMqttArchive(mqttArchive)
  }

  function mqttSessionsForActiveConfig(): MqttSessionRecordView[] {
    const config = currentMqttConfig()
    if (!config) return []
    const query = mqttSearch.trim().toLowerCase()
    return mqttArchive.sessions
      .filter((session) => session.connectionId === config.id)
      .filter((session) => {
        if (!query) return true
        return [
          session.title,
          session.note || '',
          ...session.messages.flatMap((item) => [item.title || '', item.note || '', item.topic, item.payload])
        ].join(' ').toLowerCase().includes(query)
      })
      .map((session) => ({
        ...session,
        messageCount: session.messages.length
      }))
  }

  function mqttSelectedSessionMessages(): MqttMessageRecord[] {
    const config = currentMqttConfig()
    if (!config) return []
    const selectedRecord = mqttSelectedRecord
    if (selectedRecord?.kind === 'session') {
      const session = mqttSessionsForActiveConfig().find((item) => item.id === selectedRecord.id)
      if (session) return session.messages
    }
    return mqttArchive.sessions
      .filter((item) => item.connectionId === config.id)
      .flatMap((item) => item.messages)
      .sort((a, b) => a.timestamp - b.timestamp)
  }

  function mqttMessagePassesTopicFilters(message: MqttMessageRecord): boolean {
    if (!mqttActiveSubscriptionTopics.length) return true
    return mqttActiveSubscriptionTopics.some((topic) => matchMqttTopicFilter(message.topic, topic))
  }

  function mqttBaseMessagesForStats(): MqttMessageRecord[] {
    return mqttSelectedSessionMessages().filter((message) => mqttMessagePassesTopicFilters(message))
  }

  function mqttMessageStatsForSelection(): MqttMessageStats {
    const messages = mqttBaseMessagesForStats()
    return {
      all: messages.length,
      incoming: messages.filter((message) => message.direction === 'incoming').length,
      outgoing: messages.filter((message) => message.direction === 'outgoing').length
    }
  }

  function mqttMessagesForSelection(): MqttMessageRecord[] {
    const query = mqttSearch.trim().toLowerCase()
    return mqttBaseMessagesForStats().filter((message) => {
      if (mqttReceiveFilter !== 'all' && message.direction !== mqttReceiveFilter) return false
      if (!query) return true
      return [message.title || '', message.note || '', message.topic, message.payload].join(' ').toLowerCase().includes(query)
    }).sort((a, b) => b.timestamp - a.timestamp)
  }

  function ensureCurrentMqttSession(config: MqttConnectionConfig, now = Date.now()): string {
    ensureMqttArchiveLoaded()
    const existing = mqttCurrentSessionId
      ? mqttArchive.sessions.find((session) => session.id === mqttCurrentSessionId && session.connectionId === config.id)
      : null
    if (existing) return existing.id
    const session = createMqttSession(config.id, now)
    mqttArchive = normalizeMqttArchiveState({ ...mqttArchive, sessions: [session, ...mqttArchive.sessions] }, now)
    mqttCurrentSessionId = session.id
    saveMqttArchiveForConfig(config.id)
    return session.id
  }

  function hasArg(args: Record<string, unknown> | undefined, key: string) {
    return Boolean(args && Object.prototype.hasOwnProperty.call(args, key))
  }

  function validMqttConnectionGroupId(value: unknown): string | null {
    const id = typeof value === 'string' ? value.trim() : ''
    return id && mqttConnectionGroupById(id) ? id : null
  }

  function mqttConnectionCreateParentId(args?: Record<string, unknown>, actionContext?: RuntimeActionContext, explicitKey: 'groupId' | 'parentId' = 'parentId'): string | null {
    if (hasArg(args, explicitKey)) return validMqttConnectionGroupId(args?.[explicitKey])
    const target = mqttConnectionTreeTargetFromArgs(args)
    if (target?.kind === 'group') return target.id
    if (target?.kind === 'config') return mqttConfigById(target.id)?.groupId || null

    const hasShortcutInput = Boolean(actionContext && (hasArg(actionContext as unknown as Record<string, unknown>, 'textInputFocused') || hasArg(actionContext as unknown as Record<string, unknown>, 'activeInputRole')))
    if (hasShortcutInput) {
      if (actionContext?.activeInputRole !== 'mqtt-connections') return null
      if (mqttSelectedRecord?.kind === 'connection-group') return mqttSelectedRecord.id
      if (mqttSelectedRecord?.kind === 'config') return mqttConfigById(mqttSelectedRecord.id)?.groupId || null
      return null
    }

    if (mqttSelectedRecord?.kind === 'connection-group') return mqttSelectedRecord.id
    if (mqttSelectedRecord?.kind === 'config') return mqttConfigById(mqttSelectedRecord.id)?.groupId || null
    return currentMqttConfig()?.groupId || null
  }

  function defaultMqttConfigDraft(mode: MqttConfigDraft['mode'], target: MqttConnectionConfig | null, args?: Record<string, unknown>, actionContext?: RuntimeActionContext): MqttConfigDraft {
    if (!target) {
      const groupId = mqttConnectionCreateParentId(args, actionContext, 'groupId')
      return {
        mode,
        targetId: null,
        name: '',
        url: '',
        protocol: 'ws',
        host: '',
        port: '',
        path: '',
        ssl: false,
        clientId: '',
        username: '',
        groupId: groupId && mqttConnectionGroupById(groupId) ? groupId : null,
        password: '',
        subscriptionsText: '',
        subscriptionItems: [],
        publishTopic: '',
        publishTopics: [],
        qos: 0,
        retain: false,
        autoReconnect: true,
        reconnectPeriodMs: 3000,
        connectTimeoutMs: 10000,
        keepaliveSec: 60,
        clean: true,
        reconnectOnConnackError: false,
        resubscribeOnReconnect: true,
        syncRecords: true,
        activeField: 'name',
        activeSubscriptionIndex: null,
        activeSubscriptionField: 'topic',
        activePublishIndex: null,
        activePublishField: 'topic'
      }
    }
    const config = target || createMqttConnectionConfig({}, Date.now())
    const endpoint = parseMqttWebSocketUrl(config.url)
    return {
      mode,
      targetId: target?.id || null,
      name: config.name,
      url: config.url,
      protocol: endpoint.protocol,
      host: endpoint.host,
      port: endpoint.port,
      path: endpoint.path,
      ssl: endpoint.ssl,
      clientId: config.clientId,
      username: config.username,
      groupId: config.groupId,
      password: target ? mqttSecrets.get(target.id) || '' : '',
      subscriptionsText: config.subscriptions.join('\n'),
      subscriptionItems: config.subscriptions.map((topic, index) => ({ topic, alias: config.subscriptionAliases[topic] || '', color: normalizeMqttTopicColor(config.subscriptionColors[topic], index) })),
      publishTopic: config.publishTopic,
      publishTopics: config.publishTopics?.length ? [...config.publishTopics] : (config.publishTopic ? [config.publishTopic] : []),
      qos: config.qos,
      retain: config.retain,
      autoReconnect: config.autoReconnect,
      reconnectPeriodMs: config.reconnectPeriodMs,
      connectTimeoutMs: config.connectTimeoutMs,
      keepaliveSec: config.keepaliveSec,
      clean: config.clean,
      reconnectOnConnackError: config.reconnectOnConnackError,
      resubscribeOnReconnect: config.resubscribeOnReconnect,
      syncRecords: config.syncRecords,
      activeField: 'name',
      activeSubscriptionIndex: null,
      activeSubscriptionField: 'topic',
      activePublishIndex: null,
      activePublishField: 'topic'
    }
  }

  function mqttConnectionGroupDraftTargetFromArgs(args?: Record<string, unknown>): MqttConnectionGroup | null {
    const target = mqttConnectionTreeTargetFromArgs(args)
    if (target?.kind === 'group') return mqttConnectionGroupById(target.id)
    const groupId = mqttFocusedGroupIdFromArgs(args)
    return mqttConnectionGroupById(groupId)
  }

  function defaultMqttConnectionGroupParentId(args?: Record<string, unknown>, actionContext?: RuntimeActionContext): string | null {
    return mqttConnectionCreateParentId(args, actionContext, 'parentId')
  }

  function defaultMqttConnectionGroupDraft(mode: MqttConnectionGroupDraftMode, target: MqttConnectionGroup | null, args?: Record<string, unknown>, actionContext?: RuntimeActionContext): MqttConnectionGroupDraft {
    if (target) {
      return {
        mode,
        targetId: target.id,
        name: target.name,
        color: target.color,
        parentId: target.parentId,
        activeField: mode === 'move-parent' ? 'parent' : 'name'
      }
    }
    return {
      mode,
      targetId: null,
      name: '',
      color: '#00A676',
      parentId: defaultMqttConnectionGroupParentId(args, actionContext),
      activeField: 'name'
    }
  }

  function beginMqttConnectionGroupDraft(mode: MqttConnectionGroupDraftMode, args?: Record<string, unknown>, actionContext?: RuntimeActionContext) {
    ensureMqttArchiveLoaded()
    const target = mode === 'create' ? null : mqttConnectionGroupDraftTargetFromArgs(args)
    if (mode !== 'create' && !target) return false
    mqttConnectionGroupDraft = defaultMqttConnectionGroupDraft(mode, target, args, actionContext)
    mqttConfigDraft = null
    mqttDrawer = { open: false, active: false, activeIndex: 0, targetKind: null, targetId: null }
    mqttPreview = { open: false, targetKind: null, targetId: null, source: null, scrollTop: 0 }
    notify()
    return true
  }

  function updateMqttConnectionGroupDraft(input: Partial<Omit<MqttConnectionGroupDraft, 'mode' | 'targetId'>>) {
    if (!mqttConnectionGroupDraft) return
    const targetId = mqttConnectionGroupDraft.targetId || ''
    const parentId = input.parentId !== undefined
      ? (input.parentId && isValidMqttConnectionGroupParent(state.mqtt.connectionGroups, targetId, input.parentId) ? input.parentId : null)
      : mqttConnectionGroupDraft.parentId
    const activeField = input.activeField === 'color' || input.activeField === 'parent' || input.activeField === 'name'
      ? input.activeField
      : mqttConnectionGroupDraft.activeField
    mqttConnectionGroupDraft = {
      ...mqttConnectionGroupDraft,
      ...input,
      parentId,
      activeField
    }
    notify()
  }

  function saveMqttConnectionGroupDraft() {
    if (!mqttConnectionGroupDraft) return false
    const now = Date.now()
    const draft = mqttConnectionGroupDraft
    const name = draft.name.trim() || '新分组'
    const parentId = draft.parentId && isValidMqttConnectionGroupParent(state.mqtt.connectionGroups, draft.targetId || '', draft.parentId) ? draft.parentId : null
    if (draft.mode === 'create') {
      const siblingCount = state.mqtt.connectionGroups.filter((group) => (group.parentId ?? null) === (parentId ?? null)).length
      const group: MqttConnectionGroup = {
        id: `mqtt-group:${now}:${Math.random().toString(16).slice(2, 8)}`,
        name,
        color: draft.color || '#00A676',
        parentId,
        sortOrder: siblingCount + 1,
        createdAt: now,
        updatedAt: now
      }
      state.mqtt.connectionGroups = normalizeMqttConnectionGroups([...state.mqtt.connectionGroups, group], now)
      mqttSelectedRecord = { kind: 'connection-group', id: group.id }
    } else {
      const targetId = draft.targetId || ''
      const target = mqttConnectionGroupById(targetId)
      if (!target) return false
      state.mqtt.connectionGroups = normalizeMqttConnectionGroups(state.mqtt.connectionGroups.map((group) => {
        if (group.id !== targetId) return group
        return {
          ...group,
          name: draft.mode === 'move-parent' ? target.name : name,
          color: draft.mode === 'rename' || draft.mode === 'move-parent' ? group.color : draft.color,
          parentId: draft.mode === 'rename' ? group.parentId : parentId,
          updatedAt: now
        }
      }), now)
      mqttSelectedRecord = { kind: 'connection-group', id: targetId }
    }
    state.mqtt.configs = normalizeMqttConfigGroupRefs(state.mqtt.configs, state.mqtt.connectionGroups)
    state.mqtt.layoutPrefs.collapsedConnectionGroupIds = state.mqtt.layoutPrefs.collapsedConnectionGroupIds.filter((id) => mqttConnectionGroupById(id))
    mqttConnectionGroupDraft = null
    activeMqttPane = 'connections'
    save()
    notify()
    return true
  }

  function moveMqttConnectionGroupDraftField(offset: number) {
    if (!mqttConnectionGroupDraft) return false
    const fields: MqttConnectionGroupDraftField[] = mqttConnectionGroupDraft.mode === 'rename'
      ? ['name']
      : mqttConnectionGroupDraft.mode === 'move-parent'
        ? ['parent']
        : ['name', 'color', 'parent']
    const index = fields.indexOf(mqttConnectionGroupDraft.activeField)
    mqttConnectionGroupDraft = {
      ...mqttConnectionGroupDraft,
      activeField: fields[(index + offset + fields.length) % fields.length]
    }
    notify()
    return true
  }

  function cancelMqttConnectionGroupDraft() {
    mqttConnectionGroupDraft = null
    notify()
    return true
  }

  function beginMqttConfigDraft(mode: MqttConfigDraft['mode'], args?: Record<string, unknown>, actionContext?: RuntimeActionContext) {
    ensureMqttArchiveLoaded()
    if (mode !== 'create' && mqttSelectedRecord?.kind === 'connection-group') {
      return beginMqttConnectionGroupDraft(mode === 'rename' ? 'rename' : 'edit', args, actionContext)
    }
    const target = mode === 'create' ? null : currentMqttConfig()
    mqttConfigDraft = defaultMqttConfigDraft(mode, target, args, actionContext)
    mqttDrawer = { open: false, active: false, activeIndex: 0, targetKind: null, targetId: null }
    mqttPreview = { open: false, targetKind: null, targetId: null, source: null, scrollTop: 0 }
    notify()
    return true
  }

  function normalizedDraftIndex(value: unknown, count: number): number | null {
    if (!count || typeof value !== 'number' || !Number.isFinite(value)) return null
    return Math.max(0, Math.min(count - 1, Math.trunc(value)))
  }

  function configSubscriptionFieldFromArgs(args?: Record<string, unknown>, fallback: MqttConfigSubscriptionDraftField = 'topic'): MqttConfigSubscriptionDraftField {
    return args?.field === 'alias' || args?.field === 'topic' || args?.field === 'color'
      ? args.field
      : fallback
  }

  function configDraftPublishTopic(topics: string[]): string {
    return topics.map((topic) => topic.trim()).find(Boolean) || ''
  }

  function normalizeMqttConfigDraftFocus(draft: MqttConfigDraft): MqttConfigDraft {
    const subscriptionItems = draft.subscriptionItems.map((item) => ({ ...item }))
    const publishTopics = [...draft.publishTopics]
    const activeField = draft.activeField === 'connection' ? 'reconnectPeriodMs' : draft.activeField
    return {
      ...draft,
      activeField,
      publishTopic: configDraftPublishTopic(publishTopics) || draft.publishTopic.trim(),
      subscriptionItems,
      publishTopics,
      activeSubscriptionIndex: normalizedDraftIndex(draft.activeSubscriptionIndex, subscriptionItems.length),
      activeSubscriptionField: configSubscriptionFieldFromArgs({ field: draft.activeSubscriptionField }, 'topic'),
      activePublishIndex: normalizedDraftIndex(draft.activePublishIndex, publishTopics.length),
      activePublishField: 'topic'
    }
  }

  function updateMqttConfigDraft(input: Partial<Omit<MqttConfigDraft, 'mode' | 'targetId' | 'activeField'>>) {
    if (!mqttConfigDraft) return
    mqttConfigDraft = normalizeMqttConfigDraftFocus({ ...mqttConfigDraft, ...input })
    notify()
  }

  function refreshMqttConfigClientId() {
    if (!mqttConfigDraft) return false
    mqttConfigDraft = { ...mqttConfigDraft, clientId: createMqttClientId() }
    notify()
    return true
  }

  function mqttDraftSubscriptionData(draft: MqttConfigDraft): { subscriptions: string[]; subscriptionAliases: Record<string, string>; subscriptionColors: Record<string, string> } {
    const rawItems = draft.subscriptionItems?.length
      ? draft.subscriptionItems
      : draft.subscriptionsText.split(/\r?\n|,/).map((topic, index) => ({ topic, alias: '', color: normalizeMqttTopicColor('', index) }))
    const subscriptions: string[] = []
    const subscriptionAliases: Record<string, string> = {}
    const subscriptionColors: Record<string, string> = {}
    for (const item of rawItems) {
      const topic = item.topic.trim()
      if (!topic) continue
      if (!subscriptions.includes(topic)) subscriptions.push(topic)
      const alias = item.alias.trim()
      if (alias) subscriptionAliases[topic] = alias
      else delete subscriptionAliases[topic]
      subscriptionColors[topic] = normalizeMqttTopicColor(item.color, subscriptions.indexOf(topic))
    }
    return { subscriptions, subscriptionAliases, subscriptionColors }
  }

  function mqttDraftPublishTopics(draft: MqttConfigDraft): string[] {
    const rawTopics = draft.publishTopics?.length ? draft.publishTopics : [draft.publishTopic]
    return [...new Set(rawTopics.map((topic) => topic.trim()).filter(Boolean))]
  }

  function focusMqttConfigSubscriptionEditor(args?: Record<string, unknown>) {
    if (!mqttConfigDraft?.subscriptionItems.length) return false
    const index = normalizedDraftIndex(typeof args?.index === 'number' ? args.index : mqttConfigDraft.activeSubscriptionIndex, mqttConfigDraft.subscriptionItems.length) ?? 0
    mqttConfigDraft = normalizeMqttConfigDraftFocus({
      ...mqttConfigDraft,
      activeField: 'subscriptions',
      activeSubscriptionIndex: index,
      activeSubscriptionField: configSubscriptionFieldFromArgs(args, mqttConfigDraft.activeSubscriptionField)
    })
    notify()
    return true
  }

  function moveMqttConfigSubscriptionRow(offset: number) {
    if (!mqttConfigDraft?.subscriptionItems.length) return false
    const currentIndex = normalizedDraftIndex(mqttConfigDraft.activeSubscriptionIndex, mqttConfigDraft.subscriptionItems.length) ?? 0
    const nextIndex = Math.max(0, Math.min(mqttConfigDraft.subscriptionItems.length - 1, currentIndex + offset))
    mqttConfigDraft = normalizeMqttConfigDraftFocus({
      ...mqttConfigDraft,
      activeField: 'subscriptions',
      activeSubscriptionIndex: nextIndex
    })
    notify()
    return true
  }

  function deleteMqttConfigSubscriptionRow(args?: Record<string, unknown>) {
    if (!mqttConfigDraft?.subscriptionItems.length) return false
    const targetIndex = normalizedDraftIndex(typeof args?.index === 'number' ? args.index : mqttConfigDraft.activeSubscriptionIndex, mqttConfigDraft.subscriptionItems.length)
    if (targetIndex === null) return false
    const activeField = configSubscriptionFieldFromArgs(args, mqttConfigDraft.activeSubscriptionField)
    const subscriptionItems = mqttConfigDraft.subscriptionItems.filter((_, index) => index !== targetIndex)
    const activeSubscriptionIndex = subscriptionItems.length ? Math.min(targetIndex, subscriptionItems.length - 1) : null
    mqttConfigDraft = normalizeMqttConfigDraftFocus({
      ...mqttConfigDraft,
      subscriptionItems,
      subscriptionsText: subscriptionItems.map((item) => item.topic).join('\n'),
      activeField: 'subscriptions',
      activeSubscriptionIndex,
      activeSubscriptionField: activeField
    })
    notify()
    return true
  }

  function focusMqttConfigPublishEditor(args?: Record<string, unknown>) {
    if (!mqttConfigDraft?.publishTopics.length) return false
    const index = normalizedDraftIndex(typeof args?.index === 'number' ? args.index : mqttConfigDraft.activePublishIndex, mqttConfigDraft.publishTopics.length) ?? 0
    mqttConfigDraft = normalizeMqttConfigDraftFocus({
      ...mqttConfigDraft,
      activeField: 'publishTopic',
      activePublishIndex: index,
      activePublishField: 'topic'
    })
    notify()
    return true
  }

  function moveMqttConfigPublishRow(offset: number) {
    if (!mqttConfigDraft?.publishTopics.length) return false
    const currentIndex = normalizedDraftIndex(mqttConfigDraft.activePublishIndex, mqttConfigDraft.publishTopics.length) ?? 0
    const nextIndex = Math.max(0, Math.min(mqttConfigDraft.publishTopics.length - 1, currentIndex + offset))
    mqttConfigDraft = normalizeMqttConfigDraftFocus({
      ...mqttConfigDraft,
      activeField: 'publishTopic',
      activePublishIndex: nextIndex,
      activePublishField: 'topic'
    })
    notify()
    return true
  }

  function deleteMqttConfigPublishRow(args?: Record<string, unknown>) {
    if (!mqttConfigDraft?.publishTopics.length) return false
    const targetIndex = normalizedDraftIndex(typeof args?.index === 'number' ? args.index : mqttConfigDraft.activePublishIndex, mqttConfigDraft.publishTopics.length)
    if (targetIndex === null) return false
    const publishTopics = mqttConfigDraft.publishTopics.filter((_, index) => index !== targetIndex)
    const activePublishIndex = publishTopics.length ? Math.min(targetIndex, publishTopics.length - 1) : null
    mqttConfigDraft = normalizeMqttConfigDraftFocus({
      ...mqttConfigDraft,
      publishTopic: configDraftPublishTopic(publishTopics),
      publishTopics,
      activeField: 'publishTopic',
      activePublishIndex,
      activePublishField: 'topic'
    })
    notify()
    return true
  }

  function saveMqttConfigDraft() {
    if (!mqttConfigDraft) return false
    ensureMqttArchiveLoaded()
    const now = Date.now()
    const draft = mqttConfigDraft
    const subscriptionData = mqttDraftSubscriptionData(draft)
    const publishTopics = mqttDraftPublishTopics(draft)
    const publishTopic = publishTopics[0] || ''
    let savedConfigId: string | null = null
    if (draft.mode === 'create') {
      const config = createMqttConnectionConfig({
        ...draft,
        url: buildMqttWebSocketUrl(draft),
        ...subscriptionData,
        publishTopic,
        publishTopics,
        groupId: draft.groupId,
        sortOrder: state.mqtt.configs.length + 1,
        createdAt: now,
        updatedAt: now
      }, now)
      state.mqtt.configs.push(config)
      state.mqtt.activeConfigId = config.id
      savedConfigId = config.id
      setMqttSecret(config.id, draft.password)
    } else {
      const targetId = draft.targetId || currentMqttConfig()?.id || null
      savedConfigId = targetId
      state.mqtt.configs = state.mqtt.configs.map((config) => {
        if (config.id !== targetId) return config
        const next = createMqttConnectionConfig({
          ...config,
          ...draft,
          id: config.id,
          subscriptions: draft.mode === 'rename' ? config.subscriptions : subscriptionData.subscriptions,
          subscriptionAliases: draft.mode === 'rename' ? config.subscriptionAliases : subscriptionData.subscriptionAliases,
          subscriptionColors: draft.mode === 'rename' ? config.subscriptionColors : subscriptionData.subscriptionColors,
          url: draft.mode === 'rename' ? config.url : buildMqttWebSocketUrl(draft),
          clientId: draft.mode === 'rename' ? config.clientId : draft.clientId,
          username: draft.mode === 'rename' ? config.username : draft.username,
          groupId: draft.mode === 'rename' ? config.groupId : draft.groupId,
          publishTopic: draft.mode === 'rename' ? config.publishTopic : publishTopic,
          publishTopics: draft.mode === 'rename' ? config.publishTopics : publishTopics,
          updatedAt: now
        }, now)
        return next
      })
      if (state.mqtt.configs.some((config) => config.id === targetId)) setMqttSecret(targetId, draft.password)
    }
    state.mqtt.configs = normalizeMqttConfigGroupRefs(state.mqtt.configs, state.mqtt.connectionGroups)
    restoreMqttActiveSubscriptionTopics()
    persistMqttViewPrefs()
    mqttConfigDraft = null
    saveMqttArchiveForConfig(savedConfigId)
    save()
    notify()
    return true
  }

  function mqttConfigDraftFocusCells(draft: MqttConfigDraft): MqttConfigDraftFocusCell[] {
    const cells: MqttConfigDraftFocusCell[] = [
      { activeField: 'name' },
      { activeField: 'groupId' },
      { activeField: 'clientId' },
      { activeField: 'protocol' },
      { activeField: 'host' },
      { activeField: 'port' },
      { activeField: 'path' },
      { activeField: 'username' },
      { activeField: 'password' }
    ]
    draft.subscriptionItems.forEach((_, index) => {
      cells.push(
        { activeField: 'subscriptions', activeSubscriptionIndex: index, activeSubscriptionField: 'alias' },
        { activeField: 'subscriptions', activeSubscriptionIndex: index, activeSubscriptionField: 'topic' },
        { activeField: 'subscriptions', activeSubscriptionIndex: index, activeSubscriptionField: 'color' }
      )
    })
    draft.publishTopics.forEach((_, index) => {
      cells.push({ activeField: 'publishTopic', activePublishIndex: index })
    })
    cells.push(
      { activeField: 'qos' },
      { activeField: 'reconnectPeriodMs' },
      { activeField: 'connectTimeoutMs' },
      { activeField: 'keepaliveSec' },
      { activeField: 'retain' },
      { activeField: 'autoReconnect' },
      { activeField: 'clean' },
      { activeField: 'reconnectOnConnackError' },
      { activeField: 'resubscribeOnReconnect' },
      { activeField: 'storage' }
    )
    return cells
  }

  function mqttConfigFocusComparable(cell: MqttConfigDraftFocusCell) {
    return [
      cell.activeField,
      cell.activeField === 'subscriptions' ? cell.activeSubscriptionIndex ?? null : null,
      cell.activeField === 'subscriptions' ? cell.activeSubscriptionField || 'topic' : null,
      cell.activeField === 'publishTopic' ? cell.activePublishIndex ?? null : null,
      cell.activeField === 'publishTopic' ? cell.activePublishField || 'topic' : null
    ].join(':')
  }

  function sameMqttConfigFocusCell(left: MqttConfigDraftFocusCell, right: MqttConfigDraftFocusCell) {
    return mqttConfigFocusComparable(left) === mqttConfigFocusComparable(right)
  }

  function mqttConfigDraftFocusCell(draft: MqttConfigDraft): MqttConfigDraftFocusCell {
    const activeField = draft.activeField === 'connection' ? 'reconnectPeriodMs' : draft.activeField
    if (activeField === 'subscriptions') {
      return {
        activeField,
        activeSubscriptionIndex: normalizedDraftIndex(draft.activeSubscriptionIndex, draft.subscriptionItems.length) ?? 0,
        activeSubscriptionField: draft.activeSubscriptionField || 'topic'
      }
    }
    if (activeField === 'publishTopic') {
      return {
        activeField,
        activePublishIndex: normalizedDraftIndex(draft.activePublishIndex, draft.publishTopics.length) ?? 0,
        activePublishField: 'topic'
      }
    }
    return { activeField }
  }

  function moveMqttConfigDraftField(offset: number) {
    if (!mqttConfigDraft) return false
    const fields = mqttConfigDraftFocusCells(mqttConfigDraft)
    const current = mqttConfigDraftFocusCell(mqttConfigDraft)
    const index = fields.findIndex((field) => sameMqttConfigFocusCell(field, current))
    const currentIndex = index >= 0 ? index : offset > 0 ? -1 : fields.length
    const activeField = fields[(currentIndex + offset + fields.length) % fields.length]
    mqttConfigDraft = normalizeMqttConfigDraftFocus({
      ...mqttConfigDraft,
      activeField: activeField.activeField,
      activeSubscriptionIndex: activeField.activeField === 'subscriptions' ? activeField.activeSubscriptionIndex ?? 0 : null,
      activeSubscriptionField: activeField.activeSubscriptionField || mqttConfigDraft.activeSubscriptionField,
      activePublishIndex: activeField.activeField === 'publishTopic' ? activeField.activePublishIndex ?? 0 : null,
      activePublishField: 'topic'
    })
    notify()
    return true
  }

  function appendMqttMessageRecord(input: Omit<MqttMessageRecord, 'id' | 'connectionId' | 'sessionId' | 'timestamp'> & { id?: string; timestamp?: number }) {
    const config = currentMqttConfig()
    if (!config) return false
    const now = input.timestamp || Date.now()
    const sessionId = ensureCurrentMqttSession(config, now)
    const record: MqttMessageRecord = {
      id: input.id || `mqtt-message:${now}:${Math.random().toString(16).slice(2, 8)}`,
      connectionId: config.id,
      sessionId,
      direction: input.direction,
      topic: input.topic,
      payload: input.payload,
      qos: input.qos,
      retain: input.retain,
      timestamp: now
    }
    mqttArchive = appendMqttMessage(mqttArchive, record)
    updateMqttUnreadForMessage(record)
    mqttSelectedRecord = { kind: 'message', id: record.id }
    saveMqttArchiveForConfig(config.id)
    notify()
    return true
  }

  function renameSelectedMqttRecord(input: { title?: string; note?: string }) {
    if (!mqttSelectedRecord) return false
    if (mqttSelectedRecord.kind === 'log') return false
    if (mqttSelectedRecord.kind === 'publish-template') return renameMqttTemplate(mqttSelectedRecord.id, input)
    if (mqttSelectedRecord.kind === 'config') {
      const title = typeof input.title === 'string' ? input.title.trim() : ''
      if (!title) return false
      state.mqtt.configs = state.mqtt.configs.map((config) => config.id === mqttSelectedRecord?.id ? { ...config, name: title, updatedAt: Date.now() } : config)
      save()
      notify()
      return true
    }
    if (mqttSelectedRecord.kind === 'message') {
      const record = mqttMessageById(mqttSelectedRecord.id)
      if (!record) return false
      const template = saveMqttMessageAsTemplate(record, input, { defaultTitleOnEmpty: true })
      if (!template) return false
      mqttSelectedRecord = { kind: 'publish-template', id: template.id }
      activeMqttPane = 'messages'
      activeMqttRecordList = 'templates'
      mqttPublishRecordsOpen = true
      saveMqttArchiveForConfig(currentMqttConfig()?.id || null)
      notify()
      return true
    }
    if (mqttSelectedRecord.kind !== 'session') return false
    mqttArchive = renameMqttRecord(mqttArchive, mqttSelectedRecord, input)
    saveMqttArchiveForConfig(currentMqttConfig()?.id || null)
    notify()
    return true
  }

  function beginMqttRecordEdit(mode: MqttRecordEditMode, args?: Record<string, unknown>) {
    const target = mqttTargetFromArgs(args)
    if (target?.kind === 'config') return beginMqttConfigDraft(mode === 'rename' ? 'rename' : 'edit')
    if (!target || (target.kind !== 'message' && target.kind !== 'publish-template')) return false
    const record = mqttPublishableRecordFromTarget(target)
    if (!record) return false
    mqttRecordEditDraft = {
      mode,
      targetKind: target.kind,
      targetId: target.id,
      title: record.title || '',
      note: record.note || '',
      topic: record.topic,
      payload: record.payload,
      qos: record.qos,
      retain: record.retain,
      activeField: 'title'
    }
    closeMqttDrawer(false)
    closeMqttPreview()
    notify()
    return true
  }

  function updateMqttRecordEditDraft(input: Partial<Omit<MqttRecordEditDraft, 'mode' | 'targetKind' | 'targetId'>>) {
    if (!mqttRecordEditDraft) return
    mqttRecordEditDraft = {
      ...mqttRecordEditDraft,
      ...input,
      qos: input.qos === 0 || input.qos === 1 || input.qos === 2 ? input.qos : mqttRecordEditDraft.qos
    }
    notify()
  }

  function moveMqttRecordEditDraftField(offset: number) {
    if (!mqttRecordEditDraft) return false
    const renameFields: MqttRecordEditField[] = ['title', 'note']
    const editFields: MqttRecordEditField[] = ['title', 'note', 'topic', 'payload', 'qos', 'retain']
    const fields = mqttRecordEditDraft.mode === 'rename' ? renameFields : editFields
    const index = fields.indexOf(mqttRecordEditDraft.activeField)
    mqttRecordEditDraft = {
      ...mqttRecordEditDraft,
      activeField: fields[(index + offset + fields.length) % fields.length]
    }
    notify()
    return true
  }

  function formatMqttAutoFavoriteTitle(now = Date.now()): string {
    const date = new Date(now)
    const parts = [
      date.getFullYear() % 100,
      date.getMonth() + 1,
      date.getDate(),
      date.getHours(),
      date.getMinutes()
    ]
    return parts.map((part) => String(part).padStart(2, '0')).join('')
  }

  function saveMqttMessageAsTemplate(
    record: MqttMessageRecord,
    input: Partial<Pick<MqttPublishTemplate, 'title' | 'note' | 'topic' | 'payload' | 'qos' | 'retain'>>,
    options: { defaultTitleOnEmpty: boolean },
    now = Date.now()
  ): MqttPublishTemplate | null {
    const connectionId = record.connectionId || currentMqttConfig()?.id || ''
    const topic = typeof input.topic === 'string' ? input.topic.trim() : record.topic
    if (!connectionId || !topic) return null
    const titleInput = typeof input.title === 'string' ? input.title.trim() : ''
    const title = titleInput || (options.defaultTitleOnEmpty ? formatMqttAutoFavoriteTitle(now) : '')
    const beforeIds = new Set(mqttArchive.publishTemplates.map((template) => template.id))
    mqttArchive = saveMqttPublishTemplate(mqttArchive, {
      connectionId,
      title,
      note: typeof input.note === 'string' ? input.note : record.note,
      topic,
      payload: typeof input.payload === 'string' ? input.payload : record.payload,
      qos: input.qos === 0 || input.qos === 1 || input.qos === 2 ? input.qos : record.qos,
      retain: typeof input.retain === 'boolean' ? input.retain : record.retain
    }, now)
    return mqttArchive.publishTemplates.find((template) => !beforeIds.has(template.id)) || mqttArchive.publishTemplates[0] || null
  }

  function saveMqttRecordEditDraft(args?: Record<string, unknown>) {
    if (!mqttRecordEditDraft) return false
    const draft = {
      ...mqttRecordEditDraft,
      ...(typeof args?.title === 'string' ? { title: args.title } : {}),
      ...(typeof args?.note === 'string' ? { note: args.note } : {})
    }
    const input = draft.mode === 'rename'
      ? { title: draft.title, note: draft.note }
      : {
          title: draft.title,
          note: draft.note,
          topic: draft.topic,
          payload: draft.payload,
          qos: draft.qos,
          retain: draft.retain
        }
    if (draft.targetKind === 'publish-template') {
      const template = mqttTemplateById(draft.targetId)
      if (!template) return false
      mqttArchive = draft.mode === 'rename'
        ? renameMqttPublishTemplate(mqttArchive, draft.targetId, input)
        : saveMqttPublishTemplate(mqttArchive, {
            ...template,
            ...input,
            id: draft.targetId,
            connectionId: template.connectionId,
            topic: draft.topic.trim(),
            payload: draft.payload
          })
    } else {
      const record = mqttMessageById(draft.targetId)
      if (!record) return false
      const template = saveMqttMessageAsTemplate(record, input, { defaultTitleOnEmpty: true })
      if (!template) return false
      mqttSelectedRecord = { kind: 'publish-template', id: template.id }
      activeMqttPane = 'messages'
      activeMqttRecordList = 'templates'
      mqttPublishRecordsOpen = true
      mqttRecordEditDraft = null
      saveMqttArchiveForConfig(currentMqttConfig()?.id || null)
      notify()
      return true
    }
    mqttSelectedRecord = { kind: draft.targetKind, id: draft.targetId }
    mqttRecordEditDraft = null
    saveMqttArchiveForConfig(currentMqttConfig()?.id || null)
    notify()
    return true
  }

  function cancelMqttRecordEditDraft() {
    mqttRecordEditDraft = null
    notify()
    return true
  }

  function deleteSelectedMqttRecord(args?: Record<string, unknown>) {
    const listArg = args?.list === 'templates' || args?.list === 'history' || args?.list === 'messages' ? args.list : null
    if (listArg && mqttRecordListStates[listArg].selectedIds.length) return deleteSelectedMqttPublishRecords(listArg)
    if (!mqttSelectedRecord) return false
    if (mqttSelectedRecord.kind === 'log') return deleteSelectedMqttLog()
    if (mqttSelectedRecord.kind === 'subscription') return deleteFocusedMqttSubscription(mqttSelectedRecord.id)
    if (mqttRecordListStates[activeMqttRecordList].selectedIds.length) {
      return deleteSelectedMqttPublishRecords(activeMqttRecordList)
    }
    if (mqttSelectedRecord.kind === 'publish-template') return deleteMqttTemplate(mqttSelectedRecord.id)
    if (mqttSelectedRecord.kind === 'config') return deleteFocusedMqttConnection({ kind: 'config', id: mqttSelectedRecord.id })
    if (mqttSelectedRecord.kind === 'connection-group') return deleteMqttConnectionGroupById(mqttSelectedRecord.id)
    if (mqttSelectedRecord.kind !== 'session' && mqttSelectedRecord.kind !== 'message') return false
    const activeList = activeMqttRecordList === 'history' && mqttRecordRowsForList('history').some((row) => row.id === mqttSelectedRecord?.id)
      ? 'history'
      : 'messages'
    const rows = mqttRecordRowsForList(activeList)
    const current = mqttRecordListStates[activeList]
    const targetIndex = rows.findIndex((row) => row.kind === mqttSelectedRecord?.kind && row.id === mqttSelectedRecord?.id)
    const anchor = computeRecordListDeleteAnchor({
      rows,
      activeIndex: targetIndex >= 0 ? targetIndex : current.activeIndex,
      selectedIds: current.selectedIds,
      deleteIds: [mqttSelectedRecord.id]
    })
    mqttArchive = deleteMqttRecord(mqttArchive, mqttSelectedRecord)
    saveMqttArchiveForConfig(currentMqttConfig()?.id || null)
    const nextRows = mqttRecordRowsForList(activeList)
    const recovery = applyRecordListDeleteRecovery(nextRows, anchor)
    mqttRecordListStates = {
      ...mqttRecordListStates,
      [activeList]: {
        activeIndex: recovery.activeIndex,
        selectedIds: anchor.selectedIds.filter((id) => nextRows.some((row) => row.id === id))
      }
    }
    mqttSelectedRecord = recovery.activeId ? nextRows.find((row) => row.id === recovery.activeId) || null : null
    notify()
    return true
  }

  function deleteSelectedMqttPublishRecords(list: MqttRecordListId) {
    const rows = mqttRecordRowsForList(list)
    const stateForList = mqttRecordListStates[list]
    const selectedSet = new Set(stateForList.selectedIds)
    const deleteTargets = rows.filter((row) => selectedSet.has(row.id))
    if (!deleteTargets.length) return false
    const deleteIds = deleteTargets.map((row) => row.id)
    const anchor = computeRecordListDeleteAnchor({
      rows,
      activeIndex: stateForList.activeIndex,
      selectedIds: stateForList.selectedIds,
      deleteIds
    })
    if (list === 'templates') {
      for (const id of deleteIds) mqttArchive = deleteMqttPublishTemplate(mqttArchive, id)
    } else {
      for (const id of deleteIds) mqttArchive = deleteMqttRecord(mqttArchive, { kind: 'message', id })
    }
    saveMqttArchiveForConfig(currentMqttConfig()?.id || null)
    const nextRows = mqttRecordRowsForList(list)
    const recovery = applyRecordListDeleteRecovery(nextRows, anchor)
    mqttRecordListStates = {
      ...mqttRecordListStates,
      [list]: {
        activeIndex: recovery.activeIndex,
        selectedIds: anchor.selectedIds.filter((id) => nextRows.some((row) => row.id === id))
      }
    }
    mqttSelectedRecord = recovery.activeId ? nextRows.find((row) => row.id === recovery.activeId) || null : null
    notify()
    return true
  }

  function clearMqttRecordList(list: Extract<MqttRecordListId, 'messages' | 'history'>) {
    const rows = mqttRecordRowsForList(list)
    const deleteTargets = rows.filter((row) => row.kind === 'message')
    if (!deleteTargets.length) return false
    for (const target of deleteTargets) {
      mqttArchive = deleteMqttRecord(mqttArchive, { kind: 'message', id: target.id })
    }
    saveMqttArchiveForConfig(currentMqttConfig()?.id || null)
    mqttRecordListStates = {
      ...mqttRecordListStates,
      [list]: { activeIndex: 0, selectedIds: [] }
    }
    if (list === activeMqttRecordList) mqttSelectedRecord = null
    notify()
    return true
  }

  function fillMqttPublishDraftFromSelection(args?: Record<string, unknown>) {
    const record = mqttPublishableRecordFromArgs(args)
    if (!record) return false
    if (isMqttPublishTemplateRecord(record)) {
      mqttArchive = touchMqttPublishTemplate(mqttArchive, record.id)
      saveMqttArchiveForConfig(record.connectionId)
    }
    archiveCurrentPublishDraft('overwrite', record)
    mqttPublishDraft = toMqttPublishDraft(record)
    mqttPublishScratch = { ...mqttPublishDraft }
    activeMqttPane = 'publish'
    mqttPublishActiveField = 'topic'
    closeMqttCommandFocusSurfaces()
    blurMqttInformationFocus()
    requestMqttFocus('publish-topic')
    notify()
    return true
  }

  function mqttPublishTemplateIdFromArgs(args?: Record<string, unknown>): string {
    return typeof args?.id === 'string' ? args.id.trim() : ''
  }

  function saveCurrentMqttPublishTemplate(args?: Record<string, unknown>) {
    const config = currentMqttConfig()
    const topic = mqttPublishDraft.topic.trim()
    if (!config || !topic) return false
    mqttArchive = saveMqttPublishTemplate(mqttArchive, {
      connectionId: config.id,
      title: typeof args?.title === 'string' ? args.title : topic,
      note: typeof args?.note === 'string' ? args.note : undefined,
      topic,
      payload: mqttPublishDraft.payload,
      qos: mqttPublishDraft.qos,
      retain: mqttPublishDraft.retain
    })
    saveMqttArchiveForConfig(config.id)
    notify()
    return true
  }

  function applyMqttPublishTemplate(id: string) {
    const template = mqttArchive.publishTemplates.find((item) => item.id === id)
    if (!template) return false
    mqttArchive = touchMqttPublishTemplate(mqttArchive, id)
    mqttSelectedRecord = { kind: 'publish-template', id }
    archiveCurrentPublishDraft('overwrite', template)
    mqttPublishDraft = toMqttPublishDraft(template)
    mqttPublishScratch = { ...mqttPublishDraft }
    saveMqttArchiveForConfig(template.connectionId)
    notify()
    return true
  }

  function sendMqttPublishTemplate(id: string) {
    if (!applyMqttPublishTemplate(id)) return false
    return sendMqttPublishDraft()
  }

  function repeatMqttPublishRecords(args?: Record<string, unknown>) {
    const list = args?.list === 'templates' || args?.list === 'history' ? args.list : activeMqttRecordList
    const selectedRows = (list === 'templates' || list === 'history')
      ? mqttRecordRowsForList(list).filter((row) => mqttRecordListStates[list].selectedIds.includes(row.id))
      : []
    const explicitRecord = mqttPublishableRecordFromArgs(args)
    const targets = selectedRows.length
      ? selectedRows.map((row) => mqttPublishableRecordFromTarget(row)).filter((record): record is MqttMessageRecord | MqttPublishTemplate => Boolean(record))
      : explicitRecord
        ? [explicitRecord]
        : mqttPublishableRecordFromTarget(mqttSelectedRecord)
          ? [mqttPublishableRecordFromTarget(mqttSelectedRecord)!]
          : []
    if (!targets.length) return false
    let sent = false
    for (const record of targets) {
      if (isMqttPublishTemplateRecord(record)) {
        mqttArchive = touchMqttPublishTemplate(mqttArchive, record.id)
        saveMqttArchiveForConfig(record.connectionId)
      }
      mqttPublishDraft = toMqttPublishDraft(record)
      mqttPublishScratch = { ...mqttPublishDraft }
      sent = sendMqttPublishDraft() || sent
    }
    return sent
  }

  function renameMqttTemplate(id: string, args?: Record<string, unknown>) {
    if (!id) return false
    mqttArchive = renameMqttPublishTemplate(mqttArchive, id, {
      title: typeof args?.title === 'string' ? args.title : undefined,
      note: typeof args?.note === 'string' ? args.note : undefined
    })
    saveMqttArchiveForConfig(currentMqttConfig()?.id || null)
    notify()
    return true
  }

  function deleteMqttTemplate(id: string) {
    if (!id) return false
    const rows = mqttRecordRowsForList('templates')
    const current = mqttRecordListStates.templates
    const anchor = computeRecordListDeleteAnchor({
      rows,
      activeIndex: current.activeIndex,
      selectedIds: current.selectedIds,
      deleteIds: [id]
    })
    mqttArchive = deleteMqttPublishTemplate(mqttArchive, id)
    saveMqttArchiveForConfig(currentMqttConfig()?.id || null)
    const nextRows = mqttRecordRowsForList('templates')
    const recovery = applyRecordListDeleteRecovery(nextRows, anchor)
    mqttRecordListStates = {
      ...mqttRecordListStates,
      templates: {
        activeIndex: recovery.activeIndex,
        selectedIds: anchor.selectedIds.filter((selectedId) => selectedId !== id)
      }
    }
    if (mqttSelectedRecord?.kind === 'publish-template' && mqttSelectedRecord.id === id) {
      mqttSelectedRecord = recovery.activeId ? nextRows.find((row) => row.id === recovery.activeId) || null : null
    }
    notify()
    return true
  }

  function mqttExplicitTargetFromArgs(args?: Record<string, unknown>): MqttRecordSelection | null {
    const rawKind = typeof args?.kind === 'string'
      ? args.kind
      : typeof args?.targetKind === 'string'
        ? args.targetKind
        : null
    const id = typeof args?.id === 'string'
      ? args.id.trim()
      : typeof args?.targetId === 'string'
        ? args.targetId.trim()
        : ''
    const kind = rawKind === 'connection-group' || rawKind === 'group'
      ? 'connection-group'
      : rawKind === 'config' || rawKind === 'subscription' || rawKind === 'session' || rawKind === 'message' || rawKind === 'log' || rawKind === 'publish-template' || rawKind === 'publish-draft-history'
        ? rawKind
      : null
    if (kind && id) return { kind, id }
    return null
  }

  function mqttTargetFromArgs(args?: Record<string, unknown>): MqttRecordSelection | null {
    const explicitTarget = mqttExplicitTargetFromArgs(args)
    if (explicitTarget) return explicitTarget
    if (mqttDrawer.targetKind && mqttDrawer.targetId) return { kind: mqttDrawer.targetKind, id: mqttDrawer.targetId }
    if (mqttPublishDraftHistoryOpen) {
      const entry = activeMqttPublishDraftHistoryEntry()
      if (entry) return { kind: 'publish-draft-history', id: entry.id }
    }
    return mqttSelectedRecord
  }

  function mqttMessageById(id: string): MqttMessageRecord | null {
    return mqttArchive.sessions.flatMap((session) => session.messages).find((message) => message.id === id) || null
  }

  function mqttTemplateById(id: string): MqttPublishTemplate | null {
    return mqttArchive.publishTemplates.find((template) => template.id === id) || null
  }

  function mqttPublishDraftHistoryById(id: string): MqttPublishDraftHistoryEntry | null {
    return mqttArchive.publishDraftHistory.find((entry) => entry.id === id) || null
  }

  function mqttPublishableRecordFromTarget(target: MqttRecordSelection | null): MqttMessageRecord | MqttPublishTemplate | MqttPublishDraftHistoryEntry | null {
    if (target?.kind === 'message') return mqttMessageById(target.id)
    if (target?.kind === 'publish-template') return mqttTemplateById(target.id)
    if (target?.kind === 'publish-draft-history') return mqttPublishDraftHistoryById(target.id)
    return null
  }

  function isMqttPublishTemplateRecord(record: MqttMessageRecord | MqttPublishTemplate | MqttPublishDraftHistoryEntry): record is MqttPublishTemplate {
    return !('direction' in record) && !('source' in record)
  }

  function mqttPublishableRecordFromArgs(args?: Record<string, unknown>): MqttMessageRecord | MqttPublishTemplate | MqttPublishDraftHistoryEntry | null {
    return mqttPublishableRecordFromTarget(mqttTargetFromArgs(args))
  }

  function mqttTargetArgs(target: MqttRecordSelection | null): Record<string, unknown> {
    return target ? { kind: target.kind, id: target.id, targetKind: target.kind, targetId: target.id } : {}
  }

  function closeMqttDrawer(notifyChange = true) {
    mqttDrawer = { open: false, active: false, activeIndex: 0, targetKind: null, targetId: null }
    if (notifyChange) notify()
    return true
  }

  function hasExplicitMqttTargetArgs(args?: Record<string, unknown>) {
    return Boolean(args && (typeof args.kind === 'string' || typeof args.targetKind === 'string' || typeof args.id === 'string' || typeof args.targetId === 'string'))
  }

  function mqttTargetExists(target: MqttRecordSelection) {
    if (target.kind === 'config') return Boolean(mqttConfigById(target.id))
    if (target.kind === 'connection-group') return Boolean(mqttConnectionGroupById(target.id))
    if (target.kind === 'subscription') return mqttSubscriptionRowsForActiveConfig().some((item) => item.topic === target.id)
    if (target.kind === 'session') return mqttArchive.sessions.some((item) => item.id === target.id)
    if (target.kind === 'message') return Boolean(mqttMessageById(target.id))
    if (target.kind === 'log') return mqttLogs.some((item) => item.id === target.id)
    if (target.kind === 'publish-template') return Boolean(mqttTemplateById(target.id))
    return Boolean(mqttPublishDraftHistoryById(target.id))
  }

  function inferMqttDrawerState(active: boolean, args?: Record<string, unknown>): MqttDrawerState | null {
    const explicitTarget = mqttExplicitTargetFromArgs(args)
    if (hasExplicitMqttTargetArgs(args) && (!explicitTarget || !mqttTargetExists(explicitTarget))) return null
    const target = explicitTarget
      || (mqttDrawer.targetKind && mqttDrawer.targetId ? { kind: mqttDrawer.targetKind, id: mqttDrawer.targetId } as MqttRecordSelection : null)
      || mqttTargetFromArgs()
    return { open: true, active, activeIndex: 0, targetKind: target?.kind || null, targetId: target?.id || null }
  }

  function mqttDrawerItem(
    commandId: string,
    title: string,
    description: string,
    icon: string,
    args?: Record<string, unknown>
  ): MqttDrawerItem {
    const action = actions.get(commandId)
    return {
      commandId,
      title,
      description,
      icon,
      args,
      risk: action?.risk || 'normal',
      shortcutLabel: shortcutLabelsFor(commandId),
      enabled: Boolean(action?.when(context()))
    }
  }

  function buildMqttDrawerItems(drawer = mqttDrawer): MqttDrawerItem[] {
    if (!drawer.open) return []
    const target = drawer.targetKind && drawer.targetId
      ? { kind: drawer.targetKind, id: drawer.targetId } as MqttRecordSelection
      : mqttTargetFromArgs()
    const args = mqttTargetArgs(target)
    if (target?.kind === 'log') {
      return [
        mqttDrawerItem('mqtt.detail.open', '详情', '查看当前日志详情。', 'detail', args),
        mqttDrawerItem('mqtt.log.delete', '删除', '删除当前日志记录。', 'trash', args),
        mqttDrawerItem('mqtt.log.clearCurrentConfig', '清空本连接', '清空当前连接日志。', 'clear', args),
        mqttDrawerItem('mqtt.log.clearAll', '清空全部', '清空全部 MQTT 日志。', 'clear-all', args)
      ]
    }
    if (target?.kind === 'publish-template') {
      return [
        mqttDrawerItem('mqtt.detail.open', '详情', '查看当前收藏模板详情。', 'detail', args),
        mqttDrawerItem('mqtt.record.rename', '别名', '编辑当前收藏模板标题或备注。', 'rename', args),
        mqttDrawerItem('mqtt.record.edit', '完整编辑', '编辑模板 topic、payload、QoS 与 retain。', 'edit', args),
        mqttDrawerItem('mqtt.record.copyTopic', '复制主题', '复制模板 topic。', 'copy-topic', args),
        mqttDrawerItem('mqtt.record.copyPayload', '复制内容', '复制模板 payload。', 'copy-payload', args),
        mqttDrawerItem('mqtt.record.resendDraft', '填入发布', '把模板填入发布编辑区。', 'apply', args),
        mqttDrawerItem('mqtt.publish.template.send', '再次发送', '直接发送当前模板。', 'send', args),
        mqttDrawerItem('mqtt.publish.template.delete', '删除', '删除当前模板。', 'trash', args)
      ]
    }
    if (target?.kind === 'publish-draft-history') {
      return [
        mqttDrawerItem('mqtt.detail.open', '详情', '查看当前发送草稿详情。', 'detail', args),
        mqttDrawerItem('mqtt.publish.draft.apply', '应用草稿', '把当前草稿填入发送编辑区。', 'apply', args),
        mqttDrawerItem('mqtt.publish.draft.send', '发送草稿', '把当前草稿填入发送编辑区并立即发送。', 'send', args),
        mqttDrawerItem('mqtt.publish.draft.favorite', '收藏草稿', '保存或更新为发送收藏模板。', 'star', args),
        mqttDrawerItem('mqtt.record.copyTopic', '复制主题', '复制草稿 topic。', 'copy-topic', args),
        mqttDrawerItem('mqtt.record.copyPayload', '复制内容', '复制草稿 payload。', 'copy-payload', args),
        mqttDrawerItem('mqtt.publish.draft.rename', '别名', '编辑草稿标题或备注。', 'rename', args),
        mqttDrawerItem('mqtt.publish.draft.edit', '完整编辑', '编辑草稿 topic 与 payload。', 'edit', args),
        mqttDrawerItem('mqtt.publish.draft.delete', '删除', '删除当前草稿。', 'trash', args)
      ]
    }
    if (target?.kind === 'message') {
      const historyTarget = activeMqttRecordList === 'history' && mqttRecordRowsForList('history').some((row) => row.id === target.id)
      return [
        mqttDrawerItem('mqtt.detail.open', '详情', '查看当前 MQTT 消息详情。', 'detail', args),
        mqttDrawerItem('mqtt.record.rename', '别名', '编辑当前消息别名或备注。', 'rename', args),
        mqttDrawerItem('mqtt.record.edit', '完整编辑', '编辑当前消息 topic、payload、QoS 与 retain。', 'edit', args),
        mqttDrawerItem('mqtt.record.favorite', '收藏/取消收藏', '保存为发送收藏；别名可用 F2 另行编辑。', 'star', args),
        mqttDrawerItem('mqtt.record.copyTopic', '复制主题', '复制当前消息 topic。', 'copy-topic', args),
        mqttDrawerItem('mqtt.record.copyPayload', '复制内容', '复制当前消息 payload。', 'copy-payload', args),
        mqttDrawerItem('mqtt.record.resendDraft', '填入发布', '把当前消息填入发布编辑区。', 'apply', args),
        mqttDrawerItem('mqtt.record.repeatSend', '再次发送', '用当前消息内容再次发送。', 'send', args),
        mqttDrawerItem('mqtt.record.delete', '删除', '删除当前消息记录。', 'trash', args),
        historyTarget
          ? mqttDrawerItem('mqtt.history.clearAll', '清空历史', '清理当前历史列表中的记录。', 'clear-all', args)
          : mqttDrawerItem('mqtt.messages.clearAll', '清空消息', '清理当前消息视图中的记录。', 'clear-all', args)
      ]
    }
    if (target?.kind === 'connection-group') {
      return [
        mqttDrawerItem('mqtt.detail.open', '详情', '查看当前连接分组。', 'detail', args),
        mqttDrawerItem('mqtt.connectionGroup.create', '子分组', '在当前分组下新增子分组。', 'folder-plus', { parentId: target.id }),
        mqttDrawerItem('mqtt.config.create', '新建连接', '在当前分组下新增 MQTT 连接。', 'plus', args),
        mqttDrawerItem('mqtt.connectionGroup.moveParent', '移动父级', '选择当前分组所在的父级分组，或留空放在根层。', 'folder', args),
        mqttDrawerItem('mqtt.connectionGroup.rename', '重命名', '只编辑当前连接分组名称。', 'rename', args),
        mqttDrawerItem('mqtt.connectionGroup.edit', '编辑分组', '编辑当前连接分组名称、颜色和父级。', 'edit', args),
        mqttDrawerItem('mqtt.connectionGroup.collapse', '折叠', '折叠当前连接分组。', 'collapse', args),
        mqttDrawerItem('mqtt.connectionGroup.expand', '展开', '展开当前连接分组。', 'expand', args),
        mqttDrawerItem('mqtt.connectionGroup.delete', '删除', '删除分组并提升直接子项。', 'trash', args)
      ]
    }
    if (target?.kind === 'config') {
      return [
        mqttDrawerItem('mqtt.detail.open', '详情', '查看当前连接配置。', 'detail', args),
        mqttDrawerItem('mqtt.connection.copyAddress', '复制地址', '复制当前连接 URL。', 'copy', args),
        mqttDrawerItem('mqtt.connection.connect', '连接', '连接或重连当前 MQTT。', 'plug', args),
        mqttDrawerItem('mqtt.connection.disconnect', '断开', '断开当前 MQTT。', 'unplug', args),
        mqttDrawerItem('mqtt.config.edit', '配置', '编辑当前连接配置。', 'edit', args),
        mqttDrawerItem('mqtt.log.drawer.open', '日志', '打开当前连接日志。', 'log', args),
        mqttDrawerItem('mqtt.record.delete', '删除', '删除当前连接配置。', 'trash', args)
      ]
    }
    if (target?.kind === 'subscription') {
      return [
        mqttDrawerItem('mqtt.detail.open', '详情', '查看当前订阅 topic。', 'detail', args),
        mqttDrawerItem('mqtt.subscription.copyTopic', '复制 topic', '复制当前订阅 topic。', 'copy-topic', args),
        mqttDrawerItem('mqtt.subscription.useAsPublishTopic', '填入发布', '把订阅 topic 填入发布编辑区。', 'apply', args),
        mqttDrawerItem('mqtt.subscription.editor.open', '编辑', '打开订阅管理。', 'edit', args),
        mqttDrawerItem('mqtt.subscription.delete', '删除', '删除当前订阅 topic。', 'trash', args)
      ]
    }
    return []
  }

  function openMqttDrawer(active = true, args?: Record<string, unknown>) {
    const inferred = inferMqttDrawerState(active, args)
    if (!inferred) {
      setMessage('没有选中的 MQTT 上下文')
      return false
    }
    mqttDrawer = inferred
    notify()
    return true
  }

  function moveMqttDrawer(direction: 1 | -1) {
    if (!mqttDrawer.open) return false
    const items = buildMqttDrawerItems()
    if (!items.length) return false
    mqttDrawer = {
      ...mqttDrawer,
      activeIndex: (mqttDrawer.activeIndex + direction + items.length) % items.length
    }
    notify()
    return true
  }

  function executeMqttDrawerItem(index = mqttDrawer.activeIndex, useInferredWhenClosed = false) {
    const drawer = mqttDrawer.open ? mqttDrawer : useInferredWhenClosed ? inferMqttDrawerState(true) : null
    if (!drawer) return false
    const items = buildMqttDrawerItems(drawer)
    const item = items[index]
    if (!item || !item.enabled) return false
    const result = actions.dispatch({ actionId: item.commandId, context: context(), args: item.args })
    if (mqttDrawer.open && item.commandId !== 'mqtt.detail.open' && item.commandId !== 'mqtt.record.favorite') closeMqttDrawer(false)
    notify()
    return result.handled
  }

  async function copyText(text: string, successMessage: string) {
    const writer = platform.clipboard?.copyText || platform.files.copyPath
    const ok = await writer(text)
    setMessage(ok ? successMessage : '当前环境不支持复制文本')
    return ok
  }

  function copyMqttRecordTopic(args?: Record<string, unknown>) {
    const record = mqttPublishableRecordFromArgs(args)
    if (!record?.topic) return false
    void copyText(record.topic, '已复制 MQTT topic')
    return true
  }

  function copyMqttRecordPayload(args?: Record<string, unknown>) {
    const record = mqttPublishableRecordFromArgs(args)
    if (!record) return false
    void copyText(record.payload, '已复制 MQTT payload')
    return true
  }

  function mqttTargetsForListAction(list: MqttRecordListId, args?: Record<string, unknown>): MqttRecordSelection[] {
    const explicitTarget = mqttExplicitTargetFromArgs(args)
    if (explicitTarget) {
      const matchesList = list === 'templates'
        ? explicitTarget.kind === 'publish-template'
        : explicitTarget.kind === 'message'
      if (matchesList && mqttPublishableRecordFromTarget(explicitTarget)) return [explicitTarget]
    }
    const rows = mqttRecordRowsForList(list)
    const selectedIds = new Set(mqttRecordListStates[list].selectedIds)
    const selectedRows = rows.filter((row) => selectedIds.has(row.id))
    if (selectedRows.length) return selectedRows
    const target = mqttTargetFromArgs(args)
    if (target && rows.some((row) => row.kind === target.kind && row.id === target.id)) return [target]
    return mqttSelectedRecord && rows.some((row) => row.kind === mqttSelectedRecord?.kind && row.id === mqttSelectedRecord?.id) ? [mqttSelectedRecord] : []
  }

  function toggleMqttRecordFavorite(args?: Record<string, unknown>) {
    const target = mqttTargetFromArgs(args)
    const list: MqttRecordListId = args?.list === 'templates' || args?.list === 'history' || args?.list === 'messages'
      ? args.list
      : target?.kind === 'publish-template'
        ? 'templates'
        : target?.kind === 'message'
          ? activeMqttRecordList === 'history' && mqttRecordRowsForList('history').some((row) => row.id === target.id) ? 'history' : 'messages'
        : activeMqttRecordList

    if (list === 'templates' || target?.kind === 'publish-template') {
      const templateTargets = mqttTargetsForListAction('templates', args).filter((item) => item.kind === 'publish-template')
      if (!templateTargets.length) return false
      for (const item of templateTargets) mqttArchive = deleteMqttPublishTemplate(mqttArchive, item.id)
      mqttRecordListStates = {
        ...mqttRecordListStates,
        templates: { activeIndex: 0, selectedIds: [] }
      }
      syncMqttRecordListState('templates', true)
      saveMqttArchiveForConfig(currentMqttConfig()?.id || null)
      closeMqttDrawer(false)
      notify()
      return true
    }

    const messageTargets = mqttTargetsForListAction(list, args).filter((item) => item.kind === 'message')
    if (!messageTargets.length) return false
    let saved: MqttPublishTemplate | null = null
    for (const item of messageTargets) {
      const record = mqttMessageById(item.id)
      if (!record) continue
      saved = saveMqttMessageAsTemplate(record, { title: '' }, { defaultTitleOnEmpty: false }) || saved
    }
    if (!saved) return false
    activeMqttPane = 'messages'
    activeMqttRecordList = 'templates'
    mqttPublishRecordsOpen = true
    mqttRecordListStates = {
      ...mqttRecordListStates,
      [list]: { ...mqttRecordListStates[list], selectedIds: [] }
    }
    mqttSelectedRecord = { kind: 'publish-template', id: saved.id }
    syncMqttRecordListState('templates')
    saveMqttArchiveForConfig(currentMqttConfig()?.id || null)
    closeMqttDrawer(false)
    notify()
    return true
  }

  function beginMqttFavoriteDraft(args?: Record<string, unknown>) {
    const target = mqttTargetFromArgs(args)
    const record = mqttPublishableRecordFromTarget(target)
    if (!record || !target || (target.kind !== 'message' && target.kind !== 'publish-template')) return false
    mqttFavoriteDraft = {
      targetKind: target.kind,
      targetId: target.id,
      title: record.title || record.topic || '未命名收藏',
      activeField: 'title'
    }
    notify()
    return true
  }

  function updateMqttFavoriteDraft(input: Partial<Pick<MqttFavoriteDraft, 'title' | 'activeField'>>) {
    if (!mqttFavoriteDraft) return
    mqttFavoriteDraft = { ...mqttFavoriteDraft, ...input }
    notify()
  }

  function saveMqttFavoriteDraft(args?: Record<string, unknown>) {
    if (!mqttFavoriteDraft) return false
    const config = currentMqttConfig()
    const record = mqttPublishableRecordFromTarget({ kind: mqttFavoriteDraft.targetKind, id: mqttFavoriteDraft.targetId })
    if (!config || !record?.topic) return false
    const title = typeof args?.title === 'string' && args.title.trim()
      ? args.title.trim()
      : mqttFavoriteDraft.title.trim() || record.title || record.topic
    mqttArchive = saveMqttPublishTemplate(mqttArchive, {
      connectionId: config.id,
      title,
      note: record.note,
      topic: record.topic,
      payload: record.payload,
      qos: record.qos,
      retain: record.retain
    })
    mqttFavoriteDraft = null
    mqttPublishRecordsOpen = true
    activeMqttPane = 'messages'
    activeMqttRecordList = 'templates'
    saveMqttArchiveForConfig(config.id)
    notify()
    return true
  }

  function cancelMqttFavoriteDraft() {
    mqttFavoriteDraft = null
    notify()
    return true
  }

  function openMqttPreview(args?: Record<string, unknown>) {
    const source = args?.source === 'hover' ? 'hover' : args?.source === 'shift' ? 'shift' : 'keyboard'
    if (confirm) return false
    if (source !== 'shift' && (mqttFavoriteDraft || mqttConfigDraft || mqttSubscriptionDraft || mqttRecordEditDraft)) return false
    const target = mqttTargetFromArgs(args)
    if (target?.kind === 'publish-draft-history' && source !== 'shift') return false
    if (target?.kind !== 'message' && target?.kind !== 'publish-template' && target?.kind !== 'publish-draft-history') return false
    if (!mqttPublishableRecordFromTarget(target)) return false
    mqttPreview = {
      open: true,
      targetKind: target.kind,
      targetId: target.id,
      source,
      scrollTop: mqttPreview.targetId === target.id ? mqttPreview.scrollTop : 0
    }
    notify()
    return true
  }

  function closeMqttPreview() {
    if (!mqttPreview.open) return false
    mqttPreview = { open: false, targetKind: null, targetId: null, source: null, scrollTop: 0 }
    notify()
    return true
  }

  function scrollMqttPreview(direction: 1 | -1) {
    if (!mqttPreview.open) return false
    mqttPreview = { ...mqttPreview, scrollTop: Math.max(0, mqttPreview.scrollTop + direction * 240) }
    notify()
    return true
  }

  function setMqttPreviewScroll(args?: Record<string, unknown>) {
    if (!mqttPreview.open || typeof args?.scrollTop !== 'number' || !Number.isFinite(args.scrollTop)) return false
    const scrollTop = Math.max(0, args.scrollTop)
    if (mqttPreview.scrollTop === scrollTop) return true
    mqttPreview = { ...mqttPreview, scrollTop }
    notify()
    return true
  }

  const mqttPaneOrder: MqttPaneId[] = ['connections', 'subscriptions', 'messages', 'publish']

  function focusMqttPane(pane: MqttPaneId) {
    closeMqttCommandFocusSurfaces()
    activeMqttPane = pane === 'publish-records' ? 'messages' : pane
    if (pane === 'messages') activeMqttRecordList = 'messages'
    requestMqttFocus(activeMqttPane === 'connections' ? 'connections' : activeMqttPane === 'subscriptions' ? 'subscriptions' : activeMqttPane === 'publish' ? 'publish-topic' : 'records')
    notify()
    return true
  }

  function moveMqttPane(direction: 1 | -1) {
    const current = mqttPaneOrder.indexOf(activeMqttPane)
    const next = mqttPaneOrder[(current + direction + mqttPaneOrder.length) % mqttPaneOrder.length]
    return focusMqttPane(next)
  }

  async function connectMqtt() {
    const config = currentMqttConfig()
    if (!config?.url) {
      setMessage('请先创建 MQTT 连接配置')
      return false
    }
    ensureMqttArchiveLoaded()
    mqttConnectionStatus = { state: 'connecting', detail: config.url }
    pushMqttLog('info', '开始连接', config.url, config.id)
    notify()
    try {
      const mqtt = options.mqttModuleLoader ? await options.mqttModuleLoader() : await import('mqtt')
      const connect = resolveMqttConnect(mqtt)
      mqttClient?.end(true)
      const client = connect(config.url, mqttConnectOptionsFromConfig(config, mqttSecrets.get(config.id) || ''))
      mqttClient = client
      let connectedInAttempt = false
      let unestablishedLogged = false
      const logUnestablished = () => {
        if (connectedInAttempt || unestablishedLogged) return
        unestablishedLogged = true
        pushMqttLog('warn', '连接未建立', mqttUnestablishedHint(config), config.id)
      }
      client.on('connect', () => {
        connectedInAttempt = true
        mqttConnectionStatus = { state: 'connected', detail: config.url }
        pushMqttLog('info', '连接成功', config.url, config.id)
        ensureCurrentMqttSession(config)
        if (config.subscriptions.length) client.subscribe(config.subscriptions, { qos: config.qos })
        notify()
      })
      client.on('reconnect', () => { mqttConnectionStatus = { state: 'reconnecting', detail: config.url }; pushMqttLog('warn', '正在重连', config.url, config.id); logUnestablished(); notify() })
      client.on('close', () => { mqttConnectionStatus = { state: 'disconnected', detail: config.url }; pushMqttLog('warn', '连接关闭', config.url, config.id); logUnestablished(); notify() })
      client.on('error', (error: Error) => { mqttConnectionStatus = { state: 'error', detail: error.message }; pushMqttLog('error', '连接错误', error.message, config.id); notify() })
      client.on('message', (topic: string, payload: Uint8Array) => {
        appendMqttMessageRecord({ direction: 'incoming', topic, payload: new TextDecoder().decode(payload), qos: config.qos, retain: false })
      })
      return true
    } catch (error) {
      mqttConnectionStatus = { state: 'error', detail: error instanceof Error ? error.message : 'MQTT 连接失败' }
      pushMqttLog('error', '连接失败', mqttConnectionStatus.detail, config.id)
      notify()
      return false
    }
  }

  function disconnectMqtt() {
    const config = currentMqttConfig()
    mqttClient?.end(true)
    mqttClient = null
    mqttConnectionStatus = { state: 'disconnected', detail: '已断开' }
    pushMqttLog('info', '手动断开', config?.url || '', config?.id || null)
    notify()
    return true
  }

  function sendMqttPublishDraft(args?: Record<string, unknown>) {
    if (args && (args.kind || args.id || args.targetKind || args.targetId)) {
      if (!fillMqttPublishDraftFromSelection(args)) return false
    }
    const config = currentMqttConfig()
    if (!config || !mqttPublishDraft.topic.trim()) return false
    const draft = { ...mqttPublishDraft, topic: mqttPublishDraft.topic.trim() }
    if (!mqttClient) pushMqttLog('warn', '未连接，消息仅记录', draft.topic, config.id)
    if (mqttClient) {
      mqttClient.publish(draft.topic, draft.payload, { qos: draft.qos, retain: draft.retain }, (error) => {
        if (error) {
          pushMqttLog('error', '发布失败', error.message, config.id)
          setMessage(error.message)
        }
      })
    }
    appendMqttMessageRecord({ direction: 'outgoing', topic: draft.topic, payload: draft.payload, qos: draft.qos, retain: draft.retain })
    return true
  }

  function focusPortPane(pane: PortPaneId) {
    activePortPane = pane
    requestListFocus(pane)
    if (pane === 'groups') {
      focusedPortId = null
      groupSidePanelOpen = true
      normalizeFocusedGroup()
      return
    }
    focusedPortGroupTarget = null
    focusedPortGroupId = null
    normalizeFocusedPort()
  }

  function togglePortPane() {
    if (activePortPane === 'results') {
      focusPortPane('groups')
    } else {
      focusPortPane('results')
    }
    notify()
    return true
  }

  function toggleGroupPanel() {
    groupSidePanelOpen = !groupSidePanelOpen
    if (groupSidePanelOpen) {
      activePortPane = 'groups'
      normalizeFocusedGroup()
      groupPanelFocusRequestId += 1
    } else {
      activePortPane = 'results'
      focusedPortGroupTarget = null
      focusedPortGroupId = null
      if (portGroupDetail.open) closePortGroupDetail(false)
      if (portDrawer.open && portDrawer.mode === 'group') closePortDrawer(false)
    }
    notify()
    return true
  }

  function focusSearch() {
    if (state.activeTab === 'ports') {
      return focusPortSearch()
    } else if (state.activeTab === 'mqtt') {
      searchFocusTarget = 'mqtt'
      searchFocusRequestId += 1
      notify()
      return true
    } else if (state.activeTab === 'favorites') {
      return focusFavoriteSearch()
    } else {
      searchFocusTarget = 'ports'
    }
    searchFocusRequestId += 1
    notify()
    return true
  }

  function clearPortFocusHighlights() {
    focusedPortId = null
    focusedPortGroupTarget = null
    focusedPortGroupId = null
  }

  function focusPortSearch() {
    state.activeTab = 'ports'
    activePortPane = 'results'
    searchFocusTarget = 'ports'
    clearPortFocusHighlights()
    ensurePortsScanned()
    searchFocusRequestId += 1
    notify()
    return true
  }

  function focusPortGroupSearch() {
    state.activeTab = 'ports'
    groupSidePanelOpen = true
    activePortPane = 'groups'
    searchFocusTarget = 'port-groups'
    clearPortFocusHighlights()
    searchFocusRequestId += 1
    notify()
    return true
  }

  function focusFavoriteSearch() {
    state.activeTab = 'favorites'
    activeFavoritePane = 'items'
    searchFocusTarget = 'favorites'
    searchFocusRequestId += 1
    notify()
    return true
  }

  function focusFavoriteGroupSearch() {
    state.activeTab = 'favorites'
    favoriteQuickMode = false
    activeFavoritePane = 'containers'
    searchFocusTarget = 'favorite-groups'
    searchFocusRequestId += 1
    notify()
    return true
  }

  function normalizeFocusedPort(allowInitial = true) {
    const rows = currentPortFilter().items
    focusedPortId = focusedPortId && rows.some((item) => item.id === focusedPortId) ? focusedPortId : allowInitial ? rows[0]?.id || null : null
  }

  function normalizeFocusedGroup() {
    const rows = filterPortGroupRows()
    const currentKey = focusedPortGroupTarget ? targetKey(focusedPortGroupTarget) : ''
    focusedPortGroupTarget = rows.some((row) => targetKey(row.target) === currentKey) ? focusedPortGroupTarget : rows[0]?.target || null
    focusedPortGroupId = focusedPortGroupTarget?.kind === 'group' ? focusedPortGroupTarget.id : null
  }

  function clearHiddenFocusedGroup() {
    const rows = filterPortGroupRows()
    const currentKey = focusedPortGroupTarget ? targetKey(focusedPortGroupTarget) : ''
    if (!currentKey || rows.some((row) => targetKey(row.target) === currentKey)) {
      focusedPortGroupId = focusedPortGroupTarget?.kind === 'group' ? focusedPortGroupTarget.id : null
      return
    }
    focusedPortGroupTarget = null
    focusedPortGroupId = null
  }

  function resetPortWorkspace() {
    state.portSearch = ''
    portGroupSearch = ''
    selectedPortGroupId = null
    selectedPortGroupTarget = null
    activePortPane = 'results'
    searchBlurRequestId += 1
    normalizeFocusedPort(Boolean(state.portSearch || selectedPortGroupTarget || selectedPortGroupId))
    save()
    notify()
  }

  function closePortDrawer(notifyChange = true) {
    portDrawer = { open: false, active: false, mode: portDrawer.mode, activeIndex: 0, targetIds: [], groupTarget: null }
    if (notifyChange) notify()
    return true
  }

  function closePortDetail(notifyChange = true) {
    portDetail = { open: false, active: false, targetId: null }
    if (notifyChange) notify()
    return true
  }

  function closePortGroupDetail(notifyChange = true) {
    portGroupDetail = { open: false, active: false, target: null }
    if (notifyChange) notify()
    return true
  }

  function explicitPortIdFromArgs(args?: Record<string, unknown>) {
    const value = typeof args?.portId === 'string' ? args.portId : typeof args?.id === 'string' ? args.id : ''
    return value && ports.some((item) => item.id === value) ? value : null
  }

  function hasExplicitPortArgs(args?: Record<string, unknown>) {
    return Boolean(args && (typeof args.portId === 'string' || typeof args.id === 'string' || Array.isArray(args.portIds) || typeof args.targetId === 'string' || typeof args.groupId === 'string'))
  }

  function explicitPortGroupTargetFromArgs(args?: Record<string, unknown>): PortGroupTarget | null {
    const target = args?.targetKind === 'folder' && typeof args.targetId === 'string'
      ? { kind: 'folder' as const, id: args.targetId }
      : args?.targetKind === 'group' && typeof args.targetId === 'string'
        ? { kind: 'group' as const, id: args.targetId }
        : typeof args?.groupId === 'string'
          ? { kind: 'group' as const, id: args.groupId }
          : null
    if (!target) return null
    if (target.kind === 'group' && state.portGroups.some((item) => item.id === target.id)) return target
    if (target.kind === 'folder' && state.portGroupFolders.some((item) => item.id === target.id)) return target
    return null
  }

  function openPortDetail(args?: Record<string, unknown>) {
    if (activePortPane === 'groups') {
      setMessage('端口组没有进程详情')
      return false
    }
    const explicitId = explicitPortIdFromArgs(args)
    if (hasExplicitPortArgs(args) && !explicitId) return false
    normalizeFocusedPort(false)
    const targetId = explicitId
      || (portDrawer.open && portDrawer.mode === 'single' ? portDrawer.targetIds[0] || null : null)
      || portDetail.targetId
      || focusedPortId
    if (!targetId) {
      setMessage('没有选中的端口进程')
      return false
    }
    if (portDrawer.open) closePortDrawer(false)
    if (portGroupDetail.open) closePortGroupDetail(false)
    portDetail = { open: true, active: true, targetId }
    notify()
    return true
  }

  function openPortGroupDetail(args?: Record<string, unknown>) {
    if (activePortPane !== 'groups') return false
    const explicitTarget = explicitPortGroupTargetFromArgs(args)
    if (hasExplicitPortArgs(args) && !explicitTarget) return false
    clearHiddenFocusedGroup()
    const target = explicitTarget || portDrawer.groupTarget || portGroupDetail.target || focusedPortGroupTarget
    if (!target) {
      setMessage('没有选中的端口组')
      return false
    }
    if (portDrawer.open) closePortDrawer(false)
    if (portDetail.open) closePortDetail(false)
    portGroupDetail = { open: true, active: true, target }
    notify()
    return true
  }

  function clearPortSelection() {
    selectedPortIds = []
    if (portDrawer.mode === 'multi') closePortDrawer(false)
    notify()
    return true
  }

  async function hideAppWindow() {
    try {
      const ok = await platform.app.hide()
      if (!ok) setMessage('当前环境不支持隐藏插件窗口')
      return ok === true
    } catch {
      setMessage('当前环境无法隐藏插件窗口')
      return false
    }
  }

  function shortcutLabelsFor(commandId: string) {
    const labels = buildEffectiveKeybindings(state.settings.shortcutProfiles, state.settings.featureConfigs)
      .filter((binding) => binding.actionId === commandId && !binding.disabled && binding.source !== 'removed')
      .map((binding) => binding.shortcutId)
      .filter(Boolean)
    return formatShortcutList(labels)
  }

  function buildCommandShortcutLabels(): Record<string, string> {
    const output: Record<string, string> = {}
    for (const binding of buildEffectiveKeybindings(state.settings.shortcutProfiles, state.settings.featureConfigs)) {
      if (binding.disabled || binding.source === 'removed') continue
      if (!output[binding.actionId]) output[binding.actionId] = shortcutLabelsFor(binding.actionId)
    }
    return output
  }

  function drawerItem(
    commandId: string,
    title: string,
    description: string,
    icon: string,
    args?: Record<string, unknown>
  ): PortDrawerItem {
    const action = actions.get(commandId)
    return {
      commandId,
      title,
      description,
      icon,
      args,
      risk: action?.risk || 'normal',
      shortcutLabel: shortcutLabelsFor(commandId),
      enabled: Boolean(action?.when(context()))
    }
  }

  function inferPortDrawerState(args?: Record<string, unknown>): PortDrawerState | null {
    if (hasExplicitPortArgs(args)) {
      const groupTarget = explicitPortGroupTargetFromArgs(args)
      if (groupTarget) return { open: true, active: true, mode: 'group', activeIndex: 0, targetIds: [groupTarget.id], groupTarget }
      const portIds = Array.isArray(args?.portIds)
        ? [...new Set(args.portIds.map(String))].filter((id) => ports.some((item) => item.id === id))
        : [explicitPortIdFromArgs(args)].filter((id): id is string => Boolean(id))
      if (!portIds.length) return null
      return { open: true, active: true, mode: portIds.length > 1 ? 'multi' : 'single', activeIndex: 0, targetIds: portIds, groupTarget: null }
    }
    if (portDrawer.open && (portDrawer.targetIds.length || portDrawer.groupTarget)) return { ...portDrawer, active: true }
    if (portGroupDetail.open && portGroupDetail.target) return { open: true, active: true, mode: 'group', activeIndex: 0, targetIds: [portGroupDetail.target.id], groupTarget: portGroupDetail.target }
    if (portDetail.open && portDetail.targetId) return { open: true, active: true, mode: 'single', activeIndex: 0, targetIds: [portDetail.targetId], groupTarget: null }
    if (activePortPane === 'groups') {
      clearHiddenFocusedGroup()
      return focusedPortGroupTarget ? { open: true, active: true, mode: 'group', activeIndex: 0, targetIds: [focusedPortGroupTarget.id], groupTarget: focusedPortGroupTarget } : null
    }
    if (focusedPortId && !selectedPortIds.includes(focusedPortId)) {
      return { open: true, active: true, mode: 'single', activeIndex: 0, targetIds: [focusedPortId], groupTarget: null }
    }
    if (selectedPortIds.length) {
      return { open: true, active: true, mode: 'multi', activeIndex: 0, targetIds: [...selectedPortIds], groupTarget: null }
    }
    return focusedPortId ? { open: true, active: true, mode: 'single', activeIndex: 0, targetIds: [focusedPortId], groupTarget: null } : null
  }

  function buildPortDrawerItems(drawer = portDrawer): PortDrawerItem[] {
    if (!drawer.open) return []
    if (drawer.mode === 'group') {
      const target = drawer.groupTarget || (drawer.targetIds[0] ? { kind: 'group' as const, id: drawer.targetIds[0] } : null)
      const groupId = target?.kind === 'group' ? target.id : undefined
      const args = target ? { targetKind: target.kind, targetId: target.id, groupId } : {}
      const items = [
        drawerItem('ports.group.apply', target?.kind === 'folder' ? '筛选分组夹' : '筛选分组', '只筛选右侧端口结果。', 'search', args),
        drawerItem('ports.group.focusMatches', '聚焦匹配端口', '筛选后聚焦并多选当前匹配端口。', 'focus', args),
        drawerItem('ports.group.kill.confirm', '终止组进程', '先确认，再终止当前匹配监听进程。', 'stop', args),
        drawerItem('ports.group.kill.force', '强杀组进程', '跳过普通确认，但继续校验 PID 与端口。', 'bolt', args)
      ]
      if (target?.kind === 'group') {
        items.push(
          drawerItem('ports.group.moveFolder', '变更分组夹', '选择当前分组所在的分组夹，或留空放在根层。', 'folder', args),
          drawerItem('ports.group.rename', '重命名', '打开分组名称编辑。', 'rename', args),
          drawerItem('ports.group.edit', '编辑规则', '维护端口、区间、正则规则和所在分组夹。', 'edit', args)
        )
      } else if (target?.kind === 'folder') {
        items.push(drawerItem('ports.group.rename', '重命名', '打开分组夹名称编辑。', 'rename', args))
      }
      return items
    }
    return [
      drawerItem('ports.kill.confirm', '终止确认', drawer.mode === 'multi' ? '确认后终止已选端口进程。' : '确认后终止当前端口进程。', ''),
      drawerItem('ports.kill.force', '强杀', '直接执行强杀，并保留 PID + 端口双重校验。', ''),
      drawerItem('ports.group.createFromSelection', '收藏为组', '把当前目标端口写入新的端口组草稿。', ''),
      drawerItem('ports.scan', '刷新扫描', '重新扫描本机监听端口。', ''),
      drawerItem('search.focus', '聚焦搜索', '回到当前栏搜索框。', '')
    ]
  }

  function openPortDrawer(args?: Record<string, unknown>) {
    const inferred = inferPortDrawerState(args)
    if (!inferred) {
      setMessage(activePortPane === 'groups' ? '没有选中的端口组' : '没有选中的端口进程')
      return false
    }
    if (portDetail.open) closePortDetail(false)
    if (portGroupDetail.open) closePortGroupDetail(false)
    portDrawer = inferred
    notify()
    return true
  }

  function movePortDrawer(direction: 1 | -1) {
    if (!portDrawer.open) return false
    const items = buildPortDrawerItems()
    if (!items.length) return false
    portDrawer = {
      ...portDrawer,
      activeIndex: (portDrawer.activeIndex + direction + items.length) % items.length
    }
    notify()
    return true
  }

  function executePortDrawerItem(index = portDrawer.activeIndex, useInferredWhenClosed = false) {
    const drawer = portDrawer.open ? portDrawer : useInferredWhenClosed ? inferPortDrawerState() : null
    if (!drawer) return false
    const items = buildPortDrawerItems(drawer)
    const item = items[index]
    if (!item || !item.enabled) return false
    const result = actions.dispatch({ actionId: item.commandId, context: context(), args: item.args })
    if (portDrawer.open) closePortDrawer(false)
    notify()
    return result.handled
  }

  function syncSelectionDrawer() {
    if (selectedPortIds.length && portDrawer.open) {
      portDrawer = {
        open: true,
        active: portDrawer.active,
        mode: 'multi',
        activeIndex: Math.min(portDrawer.activeIndex, buildPortDrawerItems({ open: true, active: false, mode: 'multi', activeIndex: 0, targetIds: selectedPortIds, groupTarget: null }).length - 1),
        targetIds: [...selectedPortIds],
        groupTarget: null
      }
      return
    }
    if (portDrawer.mode === 'multi') {
      closePortDrawer(false)
    }
  }

  function closeFavoriteDrawer(notifyChange = true) {
    favoriteDrawer = { open: false, active: false, activeIndex: 0, targetKind: favoriteDrawer.targetKind, targetIds: [] }
    if (notifyChange) notify()
    return true
  }

  function favoriteDrawerItem(
    commandId: string,
    title: string,
    description: string,
    icon: string,
    args?: Record<string, unknown>
  ): FavoriteDrawerItem {
    const action = actions.get(commandId)
    return {
      commandId,
      title,
      description,
      icon,
      args,
      risk: action?.risk || 'normal',
      shortcutLabel: shortcutLabelsFor(commandId),
      enabled: Boolean(action?.when(context()))
    }
  }

  function hasExplicitFavoriteDrawerArgs(args?: Record<string, unknown>) {
    return Boolean(args && (Array.isArray(args.favoriteIds) || typeof args.favoriteId === 'string' || Array.isArray(args.directoryPaths)))
  }

  function inferFavoriteDrawerState(active = true, args?: Record<string, unknown>): FavoriteDrawerState | null {
    if (hasExplicitFavoriteDrawerArgs(args)) {
      const directoryTargets = directoryPathsFromArgs(args) || []
      if (directoryTargets.length && !favoriteQuickMode) return { open: true, active, activeIndex: 0, targetKind: 'directory', targetIds: directoryTargets }
      const ids = favoriteIdsFromArgs(args).filter((id) => state.favorites.some((item) => item.id === id))
      if (!ids.length) return null
      return { open: true, active, activeIndex: 0, targetKind: 'favorite', targetIds: ids }
    }
    if (favoriteDrawer.open && favoriteDrawer.targetIds.length) return { ...favoriteDrawer, active }
    const directoryTargets = resolveFavoriteDirectoryPaths(undefined, true)
    if (directoryTargets.length && activeFavoritePane === 'directory' && !favoriteQuickMode) {
      return { open: true, active, activeIndex: 0, targetKind: 'directory', targetIds: [...directoryTargets] }
    }
    if (activeFavoritePane === 'containers' && focusedFavoriteGroupId) {
      return { open: true, active, activeIndex: 0, targetKind: 'favorite', targetIds: [focusedFavoriteGroupId] }
    }
    const ids = resolveFavoriteIds(undefined, true)
    return ids.length ? { open: true, active, activeIndex: 0, targetKind: 'favorite', targetIds: [...ids] } : null
  }

  function buildFavoriteDrawerItems(drawer = favoriteDrawer): FavoriteDrawerItem[] {
    if (!drawer.open) return []
    if (drawer.targetKind === 'directory') {
      const items = [
        favoriteDrawerItem('favorites.directory.open', '打开', '打开选中的实际目录项。', 'open', { directoryPaths: drawer.targetIds }),
        favoriteDrawerItem('favorites.directory.reveal', '定位', '在系统文件管理器中定位实际目录项。', 'reveal', { directoryPaths: drawer.targetIds }),
        favoriteDrawerItem('favorites.directory.copyPath', '复制路径', '复制选中实际目录项的绝对路径。', 'copy', { directoryPaths: drawer.targetIds }),
        favoriteDrawerItem('favorites.copyItems', '复制真实项', '复制选中的实际文件或文件夹。', 'copy', { directoryPaths: drawer.targetIds }),
        favoriteDrawerItem('favorites.directory.addSelected', '添加到收藏', '把选中实际目录项加入当前虚拟容器。', 'add', { directoryPaths: drawer.targetIds })
      ]
      return drawer.targetIds.length === 1
        ? items
        : items.map((item) => item.commandId === 'favorites.directory.open' || item.commandId === 'favorites.directory.reveal' ? { ...item, enabled: false } : item)
    }
    const targetId = drawer.targetIds[0] || null
    const target = favoriteById(targetId)
    const args = target ? { favoriteId: target.id } : {}
    const batchArgs = drawer.targetIds.length ? { favoriteIds: drawer.targetIds } : args
    const pathItems = target?.kind === 'group' ? [] : [
      favoriteDrawerItem('favorites.open', '打开', '打开当前收藏目标。', 'open', batchArgs),
      favoriteDrawerItem('favorites.reveal', '定位', '在系统文件管理器中定位当前收藏。', 'reveal', batchArgs),
      favoriteDrawerItem('favorites.copyPath', '复制路径', '复制当前收藏的绝对路径。', 'copy', batchArgs),
      favoriteDrawerItem('favorites.copyItems', '复制真实项', '复制真实文件或文件夹到系统剪贴板。', 'copy', batchArgs)
    ].map((item) => drawer.targetIds.length !== 1 && (item.commandId === 'favorites.open' || item.commandId === 'favorites.reveal') ? { ...item, enabled: false } : item)
    const items = [
      ...pathItems,
      favoriteDrawerItem('favorites.group.create', '新建子分组', '在当前节点下创建虚拟子分组。', 'group', args),
      favoriteDrawerItem('favorites.target.create', '添加子目标', '在当前节点下添加文件或文件夹目标。', 'add', args),
      favoriteDrawerItem('favorites.edit', '编辑', '编辑当前收藏元数据。', 'edit', args),
      favoriteDrawerItem('favorites.rename', '重命名', '只重命名插件收藏元数据。', 'rename', args),
      favoriteDrawerItem('favorites.group.moveParent', '移动父级', '调整当前节点所在虚拟父级。', 'move', batchArgs),
      favoriteDrawerItem('favorites.remove', '移出收藏', '确认后移除插件收藏元数据。', 'remove', batchArgs),
      favoriteDrawerItem('favorites.remove.force', '直接移除', '跳过确认，只删除插件收藏元数据。', 'delete', batchArgs)
    ]
    return favoriteQuickMode
      ? items.filter((item) => ['favorites.open', 'favorites.reveal', 'favorites.copyPath', 'favorites.copyItems'].includes(item.commandId))
      : items
  }

  function openFavoriteDrawer(active = true, args?: Record<string, unknown>) {
    const inferred = inferFavoriteDrawerState(active, args)
    if (!inferred) {
      setMessage('没有选中的收藏目标')
      return false
    }
    favoriteDrawer = inferred
    notify()
    return true
  }

  function moveFavoriteDrawer(direction: 1 | -1) {
    if (!favoriteDrawer.open) return false
    const items = buildFavoriteDrawerItems()
    if (!items.length) return false
    favoriteDrawer = {
      ...favoriteDrawer,
      activeIndex: (favoriteDrawer.activeIndex + direction + items.length) % items.length
    }
    notify()
    return true
  }

  function executeFavoriteDrawerItem(index = favoriteDrawer.activeIndex) {
    if (!favoriteDrawer.open) return false
    const items = buildFavoriteDrawerItems()
    const item = items[index]
    if (!item || !item.enabled) return false
    const result = actions.dispatch({ actionId: item.commandId, context: context(), args: item.args })
    closeFavoriteDrawer(false)
    notify()
    return result.handled
  }

  function currentPortSelection(): PortProcess[] {
    const ids = portDrawer.open && portDrawer.mode !== 'group' && portDrawer.targetIds.length
      ? portDrawer.targetIds
      : portDetail.open && portDetail.active && portDetail.targetId ? [portDetail.targetId]
      : selectedPortIds.length ? selectedPortIds : focusedPortId ? [focusedPortId] : []
    return ids.flatMap((id) => ports.find((item) => item.id === id) || [])
  }

  function targetFromArgs(args?: Record<string, unknown> | null): PortGroupTarget | null {
    if (args?.targetKind === 'folder' && typeof args.targetId === 'string') return { kind: 'folder', id: args.targetId }
    if (args?.targetKind === 'group' && typeof args.targetId === 'string') return { kind: 'group', id: args.targetId }
    if (typeof args?.groupId === 'string') return { kind: 'group', id: args.groupId }
    return focusedPortGroupTarget
  }

  function currentPortGroupSelection(target: PortGroupTarget | null): PortProcess[] {
    if (!target) return []
    return matchPortGroupTargetProcesses(ports, target, state.portGroups, state.portGroupFolders)
  }

  function focusedGroup(): PortGroup | null {
    const id = focusedPortGroupTarget?.kind === 'group' ? focusedPortGroupTarget.id : focusedPortGroupId || selectedPortGroupId
    return id ? state.portGroups.find((group) => group.id === id) || null : null
  }

  function groupFromTarget(target: PortGroupTarget | null): PortGroup | null {
    const id = target?.kind === 'group' ? target.id : focusedPortGroupId || selectedPortGroupId
    return id ? state.portGroups.find((group) => group.id === id) || null : null
  }

  function folderFromTarget(target: PortGroupTarget | null): PortGroupFolder | null {
    return target?.kind === 'folder' ? state.portGroupFolders.find((folder) => folder.id === target.id) || null : null
  }

  function filterPortGroups(): PortGroup[] {
    return filterPortGroupRows().flatMap((row) => row.group ? [row.group] : [])
  }

  function currentPortFilter() {
    const scopedPorts = selectedPortGroupTarget
      ? matchPortGroupTargetProcesses(ports, selectedPortGroupTarget, state.portGroups, state.portGroupFolders)
      : selectedPortGroupId
        ? matchPortGroupProcesses(ports, state.portGroups.find((item) => item.id === selectedPortGroupId) || { id: '', name: '', color: '', entries: [], folderId: null, sortOrder: 0 })
        : ports
    return filterPortProcesses(scopedPorts, state.portSearch)
  }

  function favoriteGroupRows() {
    return flattenFavoriteTree(filterFavoriteGroupTree(state.favorites, favoriteGroupSearch), state.collapsedFavoriteGroupIds)
  }

  function favoriteContainerRows() {
    return flattenFavoriteTree(filterFavoriteContainerTree(state.favorites, favoriteGroupSearch), state.collapsedFavoriteGroupIds)
  }

  function currentFavoriteItems() {
    return filterFavoriteItems(state.favorites, {
      keyword: state.favoriteSearch,
      groupId: favoriteQuickMode ? null : selectedFavoriteGroupId
    })
  }

  function normalizeFocusedFavoriteGroup() {
    const rows = favoriteContainerRows()
    focusedFavoriteGroupId = focusedFavoriteGroupId && rows.some((row) => row.node.id === focusedFavoriteGroupId)
      ? focusedFavoriteGroupId
      : rows[0]?.node.id || null
  }

  function normalizeFocusedFavorite(allowInitial = true) {
    const rows = currentFavoriteItems()
    focusedFavoriteId = focusedFavoriteId && rows.some((item) => item.id === focusedFavoriteId)
      ? focusedFavoriteId
      : allowInitial ? rows[0]?.id || null : null
  }

  function favoriteById(id: string | null): FavoriteNode | null {
    return id ? state.favorites.find((item) => item.id === id) || null : null
  }

  function selectedFavoriteContainer(): FavoriteNode | null {
    return favoriteById(selectedFavoriteGroupId)
  }

  function currentFavoriteVirtualChildren(): FavoriteNode[] {
    return favoriteVirtualChildren(state.favorites, favoriteQuickMode ? null : selectedFavoriteGroupId)
  }

  function favoriteDirectoryRows(): FavoriteDirectoryRow[] {
    const favoritePaths = new Set(state.favorites.map((item) => `${item.kind}:${favoritePathIdentityKey(item.path)}`))
    const selected = new Set(selectedFavoriteDirectoryPaths.map(favoritePathIdentityKey))
    return favoriteDirectoryEntries.map((entry) => ({
      ...entry,
      favorited: favoritePaths.has(`${entry.kind}:${favoritePathIdentityKey(entry.path)}`),
      selected: selected.has(favoritePathIdentityKey(entry.path)),
      focused: focusedFavoriteDirectoryPath ? favoritePathIdentityKey(focusedFavoriteDirectoryPath) === favoritePathIdentityKey(entry.path) : false
    }))
  }

  function availableFavoritePanes(): FavoritePaneId[] {
    if (favoriteQuickMode) return ['items']
    const panes: FavoritePaneId[] = []
    if (favoriteContainerPanelOpen) panes.push('containers')
    panes.push('items')
    if (selectedFavoriteContainer()?.kind === 'folder') panes.push('directory')
    return panes
  }

  function cycleFavoritePane(direction: 1 | -1) {
    const panes = availableFavoritePanes()
    if (!panes.length) return false
    const current = panes.indexOf(activeFavoritePane)
    activeFavoritePane = panes[(Math.max(0, current) + direction + panes.length) % panes.length]
    if (activeFavoritePane === 'containers') {
      focusedFavoriteId = null
      focusedFavoriteDirectoryPath = null
      normalizeFocusedFavoriteGroup()
    }
    if (activeFavoritePane === 'items') {
      focusedFavoriteGroupId = null
      focusedFavoriteDirectoryPath = null
      normalizeFocusedFavorite()
    }
    if (activeFavoritePane === 'directory') {
      const rows = favoriteDirectoryRows()
      const focusedKey = focusedFavoriteDirectoryPath ? favoritePathIdentityKey(focusedFavoriteDirectoryPath) : ''
      focusedFavoriteDirectoryPath = rows.find((row) => favoritePathIdentityKey(row.path) === focusedKey)?.path || rows[0]?.path || null
      focusedFavoriteId = null
      focusedFavoriteGroupId = null
    }
    favoritePaneFocusRequestId += 1
    notify()
    return true
  }

  async function refreshFavoritePathInspections() {
    const requestId = favoritePathInspectionRequestId + 1
    favoritePathInspectionRequestId = requestId
    const items = state.favorites.filter((item) => item.kind !== 'group' && Boolean(item.path))
    if (!platform.files.inspectPaths) {
      favoritePathInspections = {}
      notify()
      return
    }
    try {
      const inspections = await platform.files.inspectPaths(items.map((item) => item.path))
      if (requestId !== favoritePathInspectionRequestId) return
      favoritePathInspections = Object.fromEntries(inspections.map((inspection) => [favoritePathIdentityKey(inspection.path), inspection]))
    } catch (error) {
      if (requestId !== favoritePathInspectionRequestId) return
      favoritePathInspections = Object.fromEntries(items.map((item) => [favoritePathIdentityKey(item.path), {
        path: item.path,
        status: 'unknown' as const,
        kind: 'unknown' as const,
        exists: false,
        isSymbolicLink: false,
        errorCode: 'io-error' as const,
        error: error instanceof Error ? error.message : '路径检查失败'
      }]))
    }
    notify()
  }

  async function loadSelectedFavoriteDirectory() {
    const requestId = favoriteDirectoryRequestId + 1
    favoriteDirectoryRequestId = requestId
    const container = selectedFavoriteContainer()
    selectedFavoriteDirectoryPaths = []
    focusedFavoriteDirectoryPath = null
    favoriteDirectoryError = null
    favoriteDirectoryLoading = false
    if (favoriteQuickMode || container?.kind !== 'folder' || !container.path) {
      favoriteDirectoryEntries = []
      notify()
      return
    }
    favoriteDirectoryLoading = true
    notify()
    try {
      const result = await platform.files.listDirectory(container.path)
      if (requestId !== favoriteDirectoryRequestId) return
      favoriteDirectoryEntries = result.ok ? result.entries.map((entry) => ({ ...entry })) : []
      favoriteDirectoryError = result.ok ? null : result.error || '当前宿主不可读取目录'
    } catch (error) {
      if (requestId !== favoriteDirectoryRequestId) return
      favoriteDirectoryEntries = []
      favoriteDirectoryError = error instanceof Error ? error.message : '当前宿主不可读取目录'
    } finally {
      if (requestId === favoriteDirectoryRequestId) {
        favoriteDirectoryLoading = false
        notify()
      }
    }
  }

  function selectedDirectoryEntries(): FavoriteDirectoryRow[] {
    const rows = favoriteDirectoryRows()
    const selectedKeys = new Set(selectedFavoriteDirectoryPaths.map(favoritePathIdentityKey))
    const selected = rows.filter((row) => selectedKeys.has(favoritePathIdentityKey(row.path)))
    if (selected.length) return selected
    const focusedKey = focusedFavoriteDirectoryPath ? favoritePathIdentityKey(focusedFavoriteDirectoryPath) : ''
    return focusedKey ? rows.filter((row) => favoritePathIdentityKey(row.path) === focusedKey) : []
  }

  function moveInList(direction: 1 | -1, page = false) {
    if (state.activeTab === 'ports' && activePortPane === 'groups') {
      const rows = filterPortGroupRows()
      focusedPortId = null
      if (!rows.length) {
        focusedPortGroupTarget = null
        focusedPortGroupId = null
        notify()
        return
      }
      const currentKey = focusedPortGroupTarget ? targetKey(focusedPortGroupTarget) : ''
      const currentIndex = rows.findIndex((row) => targetKey(row.target) === currentKey)
      const current = currentIndex >= 0 ? currentIndex : direction > 0 ? -1 : rows.length
      const next = Math.min(rows.length - 1, Math.max(0, current + direction * (page ? 5 : 1)))
      focusedPortGroupTarget = rows[next].target
      focusedPortGroupId = focusedPortGroupTarget.kind === 'group' ? focusedPortGroupTarget.id : null
      notify()
      return
    }
    if (state.activeTab === 'ports') {
      const rows = currentPortFilter().items
      focusedPortGroupTarget = null
      focusedPortGroupId = null
      if (!rows.length) {
        focusedPortId = null
        notify()
        return
      }
      const currentIndex = rows.findIndex((item) => item.id === focusedPortId)
      const current = currentIndex >= 0 ? currentIndex : direction > 0 ? -1 : rows.length
      const next = Math.min(rows.length - 1, Math.max(0, current + direction * (page ? 5 : 1)))
      focusedPortId = rows[next].id
      notify()
      return
    }
    if (state.activeTab === 'windows') {
      const rows = windowRows()
      if (!rows.length) {
        focusedWindowId = null
        notify()
        return
      }
      const currentIndex = rows.findIndex((row) => row.id === focusedWindowId)
      const current = currentIndex >= 0 ? currentIndex : direction > 0 ? -1 : rows.length
      const next = Math.min(rows.length - 1, Math.max(0, current + direction * (page ? 5 : 1)))
      focusedWindowId = rows[next].id
      if (windowActionsOpen) windowActionTargetId = focusedWindowId
      windowFocusRequestId += 1
      notify()
      return
    }
    if (state.activeTab === 'mqtt') {
      if (activeMqttPane === 'connections') {
        moveMqttConnectionFocus(direction, page)
        return
      }
      if (activeMqttPane === 'subscriptions') {
        moveMqttSubscriptionFocus(direction, page)
        return
      }
      if (activeMqttPane === 'messages') {
        moveMqttRecordInList(direction, page)
        return
      }
    }
    if (state.activeTab === 'favorites' && activeFavoritePane === 'containers') {
      const rows = favoriteContainerRows()
      focusedFavoriteId = null
      if (!rows.length) {
        focusedFavoriteGroupId = null
        notify()
        return
      }
      const currentIndex = rows.findIndex((row) => row.node.id === focusedFavoriteGroupId)
      const current = currentIndex >= 0 ? currentIndex : direction > 0 ? -1 : rows.length
      const next = Math.min(rows.length - 1, Math.max(0, current + direction * (page ? 5 : 1)))
      focusedFavoriteGroupId = rows[next].node.id
      notify()
      return
    }
    if (state.activeTab === 'favorites' && activeFavoritePane === 'directory') {
      const rows = favoriteDirectoryRows()
      focusedFavoriteId = null
      focusedFavoriteGroupId = null
      if (!rows.length) {
        focusedFavoriteDirectoryPath = null
        notify()
        return
      }
      const currentKey = focusedFavoriteDirectoryPath ? favoritePathIdentityKey(focusedFavoriteDirectoryPath) : ''
      const currentIndex = rows.findIndex((row) => favoritePathIdentityKey(row.path) === currentKey)
      const current = currentIndex >= 0 ? currentIndex : direction > 0 ? -1 : rows.length
      const next = Math.min(rows.length - 1, Math.max(0, current + direction * (page ? 5 : 1)))
      focusedFavoriteDirectoryPath = rows[next].path
      notify()
      return
    }
    if (state.activeTab === 'favorites') {
      const rows = currentFavoriteItems()
      focusedFavoriteGroupId = null
      if (!rows.length) {
        focusedFavoriteId = null
        notify()
        return
      }
      const currentIndex = rows.findIndex((item) => item.id === focusedFavoriteId)
      const current = currentIndex >= 0 ? currentIndex : direction > 0 ? -1 : rows.length
      const next = Math.min(rows.length - 1, Math.max(0, current + direction * (page ? 5 : 1)))
      focusedFavoriteId = rows[next].id
      notify()
    }
  }

  function toggleFocusedSelection(advance = true) {
    if (state.activeTab === 'mqtt') {
      if (activeMqttPane === 'connections') {
        toggleMqttConnectionSelection(undefined, advance)
        return
      }
      if (activeMqttPane === 'subscriptions') {
        toggleMqttSubscriptionSelection(undefined, advance)
        return
      }
      if (activeMqttPane !== 'messages') return
      toggleMqttRecordSelection()
      return
    }
    if (state.activeTab === 'windows' && focusedWindowId) {
      const rows = windowRows()
      const next = toggleIdWithAdvance({ rows, focusedId: focusedWindowId, selectedIds: selectedWindowIds, advance })
      selectedWindowIds = next.selectedIds
      focusedWindowId = next.focusedId
      if (windowActionsOpen) windowActionTargetId = focusedWindowId
      windowFocusRequestId += 1
      notify()
      return
    }
    if (state.activeTab === 'ports' && activePortPane === 'results' && focusedPortId) {
      focusedPortGroupTarget = null
      focusedPortGroupId = null
      const rows = currentPortFilter().items
      const next = toggleIdWithAdvance({ rows, focusedId: focusedPortId, selectedIds: selectedPortIds, advance })
      selectedPortIds = next.selectedIds
      focusedPortId = next.focusedId
      syncSelectionDrawer()
      notify()
      return
    }
    if (state.activeTab === 'favorites' && activeFavoritePane === 'items' && focusedFavoriteId) {
      const rows = currentFavoriteItems()
      const next = toggleIdWithAdvance({ rows, focusedId: focusedFavoriteId, selectedIds: selectedFavoriteIds, advance })
      selectedFavoriteIds = next.selectedIds
      focusedFavoriteId = next.focusedId
      notify()
      return
    }
    if (state.activeTab === 'favorites' && activeFavoritePane === 'directory' && focusedFavoriteDirectoryPath) {
      const rows = favoriteDirectoryRows().map((row) => ({ id: favoritePathIdentityKey(row.path), path: row.path }))
      const focusedKey = favoritePathIdentityKey(focusedFavoriteDirectoryPath)
      const selectedKeys = selectedFavoriteDirectoryPaths.map(favoritePathIdentityKey)
      const next = toggleIdWithAdvance({ rows, focusedId: focusedKey, selectedIds: selectedKeys, advance })
      const pathByKey = new Map(rows.map((row) => [row.id, row.path]))
      selectedFavoriteDirectoryPaths = next.selectedIds.map((key) => pathByKey.get(key)).filter((path): path is string => Boolean(path))
      focusedFavoriteDirectoryPath = next.focusedId ? pathByKey.get(next.focusedId) || focusedFavoriteDirectoryPath : focusedFavoriteDirectoryPath
      notify()
    }
  }

  async function scanPorts() {
    ports = dedupePortProcesses(await platform.ports.scan())
    const visibleIds = new Set(ports.map((item) => item.id))
    selectedPortIds = selectedPortIds.filter((id) => visibleIds.has(id))
    if (portDetail.targetId && !visibleIds.has(portDetail.targetId)) closePortDetail(false)
    normalizeFocusedPort(false)
    syncSelectionDrawer()
    notify()
  }

  function ensurePortsScanned() {
    if (ports.length || scanInFlight) return
    scanInFlight = scanPorts().finally(() => {
      scanInFlight = null
    })
  }

  async function killPortTargets(targets: PortProcess[], force: boolean, emptyMessage = '没有选中的端口进程') {
    if (!targets.length) {
      setMessage(emptyMessage)
      return
    }
    const current = await platform.ports.scan()
    const verified = targets.filter((target) => shouldProcessMatchVerifiedPort(target, current))
    if (!verified.length) {
      setMessage('选中进程已不再占用目标端口')
      await scanPorts()
      return
    }
    const results = await Promise.all(verified.map((target) => platform.ports.kill({ pid: target.pid, port: target.port, force } satisfies KillRequest)))
    const okCount = results.filter((item) => item.ok).length
    setMessage(`${force ? '强杀' : '终止'}完成：${okCount}/${results.length}`)
    await scanPorts()
  }

  async function killPorts(force: boolean) {
    await killPortTargets(currentPortSelection(), force)
  }

  function confirmKill() {
    const targets = currentPortSelection()
    if (!targets.length) {
      setMessage('没有选中的端口进程')
      return
    }
    confirm = {
      title: '终止端口进程',
      detail: `确认终止 ${targets.length} 个进程？失败后可使用 ${shortcutLabelsFor('ports.kill.force') || 'c-del / c-backspace'} 强杀。`,
      onConfirm: () => {
        confirm = null
        void killPorts(false)
      }
    }
    notify()
  }

  function confirmKillGroup(target: PortGroupTarget | null) {
    const targets = currentPortGroupSelection(target)
    if (!targets.length) {
      setMessage('组内端口当前无监听进程')
      return
    }
    confirm = {
      title: '终止端口组进程',
      detail: `确认终止组内 ${targets.length} 个进程？失败后可使用强杀组。`,
      onConfirm: () => {
        confirm = null
        void killPortTargets(targets, false, '组内端口当前无监听进程')
      }
    }
    notify()
  }

  function applyFocusedGroup(targetInput?: PortGroupTarget | null) {
    const target = targetInput || focusedPortGroupTarget
    if (!target) {
      setMessage('没有选中的端口组')
      return false
    }
    selectedPortGroupTarget = target
    selectedPortGroupId = target.kind === 'group' ? target.id : null
    focusedPortId = null
    selectedPortIds = []
    notify()
    return true
  }

  function focusFocusedGroupMatches(targetInput?: PortGroupTarget | null) {
    const target = targetInput || focusedPortGroupTarget
    if (!applyFocusedGroup(target)) return false
    const rows = currentPortFilter().items
    selectedPortIds = rows.map((item) => item.id)
    focusedPortId = rows[0]?.id || null
    focusedPortGroupTarget = null
    focusedPortGroupId = null
    activePortPane = 'results'
    syncSelectionDrawer()
    notify()
    return true
  }

  function openGroupDraft(group: PortGroup | null, mode: PortGroupDraft['mode'] = group ? 'edit' : 'create') {
    portGroupDraft = group
      ? { mode, target: { kind: 'group', id: group.id }, groupId: group.id, name: group.name, entriesText: group.entries.join('\n'), color: group.color, folderId: group.folderId, activeField: mode === 'move-folder' ? 'folder' : 'name' }
      : { mode: 'create', target: null, groupId: null, name: '', entriesText: '', color: '#00A676', folderId: null, activeField: 'name' }
    notify()
  }

  function openFolderRenameDraft(folder: PortGroupFolder) {
    portGroupDraft = {
      mode: 'rename',
      target: { kind: 'folder', id: folder.id },
      groupId: null,
      name: folder.name,
      entriesText: '',
      color: folder.color,
      folderId: null,
      activeField: 'name'
    }
    notify()
  }

  function createGroupFromSelection() {
    const targets = currentPortSelection()
    if (!targets.length) {
      setMessage('没有选中的端口进程')
      return false
    }
    const portsText = [...new Set(targets.map((item) => String(item.port)))].join('\n')
    portGroupDraft = {
      mode: 'create',
      target: null,
      groupId: null,
      name: `端口分组 ${state.portGroups.length + 1}`,
      entriesText: portsText,
      color: '#00A676',
      folderId: null,
      activeField: 'name'
    }
    notify()
    return true
  }

  function updatePortGroupDraft(input: Partial<Pick<PortGroupDraft, 'name' | 'entriesText' | 'color' | 'folderId'>>) {
    if (!portGroupDraft) return
    portGroupDraft = { ...portGroupDraft, ...input }
    notify()
  }

  function movePortGroupDraftField(direction: 1 | -1) {
    if (!portGroupDraft) return false
    const fields: PortGroupDraftField[] = portGroupDraft.mode === 'rename'
      ? ['name']
      : portGroupDraft.mode === 'move-folder' ? ['folder'] : ['name', 'entries', 'color', 'folder']
    const current = fields.indexOf(portGroupDraft.activeField)
    const next = fields[(Math.max(0, current) + direction + fields.length) % fields.length]
    portGroupDraft = { ...portGroupDraft, activeField: next }
    notify()
    return true
  }

  function selectNextVisibleGroupTarget() {
    const rows = filterPortGroupRows()
    focusedPortGroupTarget = rows[0]?.target || null
    focusedPortGroupId = focusedPortGroupTarget?.kind === 'group' ? focusedPortGroupTarget.id : null
  }

  function deletePortGroupTarget(target: PortGroupTarget | null) {
    if (!target) return false
    const deletedGroupIds = new Set<string>()
    if (target.kind === 'group') {
      if (!state.portGroups.some((group) => group.id === target.id)) return false
      deletedGroupIds.add(target.id)
      state.portGroups = state.portGroups.filter((group) => group.id !== target.id)
    } else {
      if (!state.portGroupFolders.some((folder) => folder.id === target.id)) return false
      for (const group of state.portGroups) {
        if (group.folderId === target.id) deletedGroupIds.add(group.id)
      }
      state.portGroupFolders = state.portGroupFolders.filter((folder) => folder.id !== target.id)
      state.portGroups = state.portGroups.filter((group) => group.folderId !== target.id)
      state.collapsedPortGroupFolderIds = state.collapsedPortGroupFolderIds.filter((id) => id !== target.id)
    }
    const targetDeleted = (candidate: PortGroupTarget | null) => {
      if (!candidate) return false
      if (sameTarget(candidate, target)) return true
      return candidate.kind === 'group' && deletedGroupIds.has(candidate.id)
    }
    if (selectedPortGroupId && deletedGroupIds.has(selectedPortGroupId)) selectedPortGroupId = null
    if (targetDeleted(selectedPortGroupTarget)) {
      selectedPortGroupTarget = null
      selectedPortGroupId = null
    }
    if (targetDeleted(portGroupDetail.target)) closePortGroupDetail(false)
    if (portDrawer.mode === 'group' && targetDeleted(portDrawer.groupTarget)) closePortDrawer(false)
    if (targetDeleted(focusedPortGroupTarget)) selectNextVisibleGroupTarget()
    else focusedPortGroupId = focusedPortGroupTarget?.kind === 'group' ? focusedPortGroupTarget.id : null
    save()
    notify()
    return true
  }

  function deleteFocusedGroup(force = false, targetInput?: PortGroupTarget | null) {
    const target = targetInput || focusedPortGroupTarget
    const group = groupFromTarget(target)
    const folder = folderFromTarget(target)
    if (!group && !folder) {
      setMessage('没有选中的端口组或分组夹')
      return false
    }
    if (force) return deletePortGroupTarget(target)
    const childCount = folder ? state.portGroups.filter((item) => item.folderId === folder.id).length : 0
    confirm = {
      title: folder ? '删除分组夹' : '删除端口组',
      detail: folder
        ? `确认删除分组夹「${folder.name}」及其中 ${childCount} 个端口组？此操作只删除插件元数据，不会终止进程。`
        : `确认删除端口组「${group?.name}」？此操作只删除插件元数据，不会终止进程。`,
      onConfirm: () => {
        confirm = null
        deletePortGroupTarget(target)
      }
    }
    notify()
    return true
  }

  function createPortGroupFolder() {
    const id = `folder:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
    const folder: PortGroupFolder = {
      id,
      name: `分组夹 ${state.portGroupFolders.length + 1}`,
      color: '#2F80ED',
      sortOrder: state.portGroupFolders.length + 1
    }
    state.portGroupFolders.push(folder)
    groupSidePanelOpen = true
    activePortPane = 'groups'
    focusedPortGroupTarget = { kind: 'folder', id }
    focusedPortGroupId = null
    save()
    portGroupDraft = {
      mode: 'create',
      target: { kind: 'folder', id: folder.id },
      groupId: null,
      name: folder.name,
      entriesText: '',
      color: folder.color,
      folderId: null,
      activeField: 'name'
    }
    notify()
    return true
  }

  function toggleFocusedGroupFolder(expand?: boolean) {
    if (focusedPortGroupTarget?.kind === 'group' && expand === false) {
      const group = state.portGroups.find((item) => item.id === focusedPortGroupTarget?.id)
      if (!group?.folderId) return false
      focusedPortGroupTarget = { kind: 'folder', id: group.folderId }
      focusedPortGroupId = null
      notify()
      return true
    }
    if (focusedPortGroupTarget?.kind !== 'folder') return false
    const id = focusedPortGroupTarget.id
    const collapsed = state.collapsedPortGroupFolderIds.includes(id)
    if (expand === true && !collapsed) {
      const firstChild = filterPortGroupRows().find((row) => row.kind === 'group' && row.group?.folderId === id)
      if (!firstChild) return false
      focusedPortGroupTarget = firstChild.target
      focusedPortGroupId = firstChild.target.id
      notify()
      return true
    }
    const shouldCollapse = expand === undefined ? !collapsed : !expand
    state.collapsedPortGroupFolderIds = shouldCollapse
      ? [...new Set([...state.collapsedPortGroupFolderIds, id])]
      : state.collapsedPortGroupFolderIds.filter((item) => item !== id)
    save()
    notify()
    return true
  }

  function blurSearchFocus() {
    searchBlurRequestId += 1
    notify()
    return true
  }

  function moveGroupToFolder(groupId: string, folderId: string | null) {
    if (!state.portGroups.some((group) => group.id === groupId)) return false
    if (folderId && !state.portGroupFolders.some((folder) => folder.id === folderId)) return false
    state.portGroups = movePortGroupToFolder(state.portGroups, groupId, folderId)
    focusedPortGroupTarget = { kind: 'group', id: groupId }
    focusedPortGroupId = groupId
    save()
    notify()
    return true
  }

  function clearPortSearchState() {
    const hadPersistentSearch = Boolean(state.portSearch || portGroupSearch)
    state.portSearch = ''
    portGroupSearch = ''
    searchBlurRequestId += 1
    if (hadPersistentSearch) save()
    notify()
  }

  function resolvePortEscapeStep(input: ShortcutInputContext): string | null {
    const searchFocused = input.activeInputRole === 'port-search' || input.activeInputRole === 'port-group-search'
    if (portGroupDetail.open) {
      closePortGroupDetail()
      return 'ports.groupDetail.close'
    }
    if (portDetail.open) {
      closePortDetail()
      return 'ports.detail.close'
    }
    if (portDrawer.open) {
      closePortDrawer()
      return 'ports.drawer.close'
    }
    if (selectedPortIds.length) {
      clearPortSelection()
      return 'ports.selection.clear'
    }
    if (searchFocused && (state.portSearch || portGroupSearch)) {
      clearPortSearchState()
      return 'ports.search.clear'
    }
    if (searchFocused) {
      blurSearchFocus()
      return 'ports.search.blur'
    }
    if (state.portSearch || portGroupSearch) {
      clearPortSearchState()
      return 'ports.search.clear'
    }
    if (selectedPortGroupTarget || selectedPortGroupId) {
      selectedPortGroupTarget = null
      selectedPortGroupId = null
      focusedPortId = null
      notify()
      return 'ports.groupFilter.clear'
    }
    if (activePortPane === 'groups' && focusedPortGroupTarget) {
      focusedPortGroupTarget = null
      focusedPortGroupId = null
      notify()
      return 'ports.focus.clear'
    }
    if (activePortPane === 'results' && focusedPortId) {
      focusedPortId = null
      notify()
      return 'ports.focus.clear'
    }
    return null
  }

  function inferShortcutProfileId(commandId: string): ShortcutProfileId {
    if (commandId.startsWith('ports.')) return 'ports'
    if (commandId.startsWith('mqtt.')) return 'mqtt'
    if (commandId.startsWith('favorites.')) return 'favorites'
    if (commandId.startsWith('windows.')) return 'windows'
    if (commandId.startsWith('codex.')) return 'codex'
    if (commandId.startsWith('settings.')) return 'settings'
    return 'global'
  }

  function aggregateShortcutProfiles() {
    return SHORTCUT_PROFILE_IDS
      .flatMap((profileId) => state.settings.shortcutProfiles[profileId].keybindingOverrides)
  }

  function cloneShortcutProfiles(input: ShortcutProfileMap): ShortcutProfileMap {
    return Object.fromEntries(SHORTCUT_PROFILE_IDS.map((profileId) => {
      const profile = input[profileId]
      return [profileId, {
        keybindingOverrides: (profile?.keybindingOverrides || []).map((item) => ({
          ...item,
          shortcutIds: item.shortcutIds ? [...item.shortcutIds] : item.shortcutId ? [item.shortcutId] : []
        })),
        updatedAt: profile?.updatedAt || Date.now()
      }]
    })) as ShortcutProfileMap
  }

  function savePortGroupDraft(input: { name: string; entriesText: string; color: string; folderId?: string | null }) {
    const draft = portGroupDraft
    if (!draft) return false
    const target = draft.target || (draft.groupId ? { kind: 'group' as const, id: draft.groupId } : null)
    if (target?.kind === 'folder') {
      if (!input.name.trim()) {
        setMessage('分组夹名称不能为空')
        return false
      }
      if (!state.portGroupFolders.some((folder) => folder.id === target.id)) return false
      state.portGroupFolders = state.portGroupFolders.map((folder) => folder.id === target.id ? { ...folder, name: input.name.trim() } : folder)
      focusedPortGroupTarget = target
      focusedPortGroupId = null
      portGroupDraft = null
      save()
      notify()
      return true
    }
    const currentGroup = target?.kind === 'group' ? state.portGroups.find((group) => group.id === target.id) || null : null
    if (draft.mode === 'move-folder' && target?.kind === 'group' && currentGroup) {
      const folderId = input.folderId && state.portGroupFolders.some((folder) => folder.id === input.folderId) ? input.folderId : null
      state.portGroups = state.portGroups.map((group) => group.id === target.id ? { ...group, folderId } : group)
      focusedPortGroupId = target.id
      focusedPortGroupTarget = target
      portGroupDraft = null
      save()
      notify()
      return true
    }
    const entries = draft.mode === 'rename' && currentGroup
      ? currentGroup.entries
      : [...new Set(input.entriesText.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))]
    const color = draft.mode === 'rename' && currentGroup ? currentGroup.color : input.color || '#00A676'
    const folderId = draft.mode === 'rename' && currentGroup
      ? currentGroup.folderId
      : input.folderId && state.portGroupFolders.some((folder) => folder.id === input.folderId) ? input.folderId : null
    if (!input.name.trim() || !entries.length) {
      setMessage('端口组名称和规则不能为空')
      return false
    }
    if (draft.mode === 'edit' && target?.kind === 'group') {
      state.portGroups = state.portGroups.map((group) => group.id === target.id ? { ...group, name: input.name.trim(), color, entries, folderId } : group)
      focusedPortGroupId = target.id
      focusedPortGroupTarget = target
    } else if (draft.mode === 'rename' && target?.kind === 'group') {
      state.portGroups = state.portGroups.map((group) => group.id === target.id ? { ...group, name: input.name.trim() } : group)
      focusedPortGroupId = target.id
      focusedPortGroupTarget = target
    } else {
      const id = `group:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
      state.portGroups.push({ id, name: input.name.trim(), color, entries, folderId, sortOrder: state.portGroups.length + 1 })
      focusedPortGroupId = id
      focusedPortGroupTarget = { kind: 'group', id }
    }
    portGroupDraft = null
    save()
    notify()
    return true
  }

  function favoriteIdFromArgs(args?: Record<string, unknown> | null): string | null {
    return typeof args?.favoriteId === 'string' ? args.favoriteId : null
  }

  function favoriteIdsFromArgs(args?: Record<string, unknown> | null): string[] {
    if (Array.isArray(args?.favoriteIds)) return [...new Set(args.favoriteIds.map((item) => String(item || '')).filter(Boolean))]
    const id = favoriteIdFromArgs(args)
    return id ? [id] : []
  }

  function hasExplicitFavoriteIds(args?: Record<string, unknown> | null): boolean {
    return Array.isArray(args?.favoriteIds) || typeof args?.favoriteId === 'string'
  }

  function favoritePickKindFromArgs(args?: Record<string, unknown> | null): PickedFavoriteKind | null {
    return args?.kind === 'file' || args?.kind === 'folder' ? args.kind : null
  }

  function directoryPathsFromArgs(args?: Record<string, unknown> | null): string[] | undefined {
    return Array.isArray(args?.directoryPaths)
      ? args.directoryPaths.map((item) => normalizeFavoritePath(String(item || ''))).filter(Boolean)
      : undefined
  }

  function favoriteActionTargetKind(args?: Record<string, unknown> | null): FavoriteDrawerTargetKind {
    if (hasExplicitFavoriteIds(args)) return 'favorite'
    if (directoryPathsFromArgs(args) !== undefined) return 'directory'
    if (favoriteDrawer.open) return favoriteDrawer.targetKind
    return activeFavoritePane === 'directory' ? 'directory' : 'favorite'
  }

  function visibleSelectedFavoriteIds(): string[] {
    const visible = new Set(currentFavoriteItems().map((item) => item.id))
    return selectedFavoriteIds.filter((id) => visible.has(id))
  }

  function resolveFavoriteIds(args?: Record<string, unknown> | null, batch = false): string[] {
    const explicit = favoriteIdsFromArgs(args).filter((id) => Boolean(favoriteById(id)))
    if (hasExplicitFavoriteIds(args)) return explicit
    if (favoriteDrawer.open && favoriteDrawer.targetKind === 'favorite') return favoriteDrawer.targetIds.filter((id) => Boolean(favoriteById(id)))
    if (activeFavoritePane === 'directory') return []
    const focusedId = activeFavoritePane === 'containers' ? focusedFavoriteGroupId : focusedFavoriteId
    const visibleSelection = visibleSelectedFavoriteIds()
    if (focusedId && favoriteById(focusedId)) {
      return batch && visibleSelection.includes(focusedId) ? visibleSelection : [focusedId]
    }
    return visibleSelection
  }

  function resolveFavoriteDirectoryPaths(explicitPaths: string[] | undefined, batch = false): string[] {
    const rows = favoriteDirectoryRows()
    const byKey = new Map(rows.map((row) => [favoritePathIdentityKey(row.path), row.path]))
    const normalizeVisible = (paths: string[]) => [...new Set(paths.flatMap((item) => byKey.get(favoritePathIdentityKey(item)) || []))]
    if (explicitPaths !== undefined) return normalizeVisible(explicitPaths)
    if (favoriteDrawer.open && favoriteDrawer.targetKind === 'directory') return normalizeVisible(favoriteDrawer.targetIds)
    const visibleSelection = normalizeVisible(selectedFavoriteDirectoryPaths)
    const focused = focusedFavoriteDirectoryPath ? byKey.get(favoritePathIdentityKey(focusedFavoriteDirectoryPath)) || null : null
    if (focused) return batch && visibleSelection.includes(focused) ? visibleSelection : [focused]
    return visibleSelection
  }

  function focusFavoriteActionTarget(args?: Record<string, unknown> | null, useAsContainer = false): FavoriteNode | null {
    const target = favoriteById(favoriteIdFromArgs(args))
    if (!target) return null
    selectedFavoriteIds = []
    if (useAsContainer) {
      focusedFavoriteGroupId = target.id
      selectedFavoriteGroupId = target.id
      focusedFavoriteId = null
      activeFavoritePane = 'containers'
      return target
    }
    if (target.kind === 'group') {
      focusedFavoriteGroupId = target.id
      focusedFavoriteId = null
      activeFavoritePane = 'containers'
    } else {
      focusedFavoriteId = target.id
      focusedFavoriteGroupId = null
      activeFavoritePane = 'items'
    }
    return target
  }

  function selectedFavorite(targetId?: string | null): FavoriteNode | null {
    const item = favoriteById(resolveFavoriteIds(targetId ? { favoriteId: targetId } : undefined)[0] || null)
    return item && item.kind !== 'group' ? item : null
  }

  function selectedFavoriteParentId() {
    const candidate = selectedFavoriteGroupId || focusedFavoriteGroupId
    const parent = favoriteById(candidate)
    return parent ? parent.id : null
  }

  function applyFocusedFavoriteContainer(targetId = focusedFavoriteGroupId) {
    if (targetId && !favoriteById(targetId)) {
      setMessage('没有选中的收藏容器')
      return false
    }
    selectedFavoriteGroupId = targetId || null
    activeFavoritePane = 'items'
    selectedFavoriteIds = []
    focusedFavoriteGroupId = null
    normalizeFocusedFavorite()
    void loadSelectedFavoriteDirectory()
    notify()
    return true
  }

  function focusDuplicateFavorite(id: string | null) {
    const item = favoriteById(id)
    if (!item || item.kind === 'group') return false
    selectedFavoriteIds = []
    focusedFavoriteId = item.id
    focusedFavoriteGroupId = null
    selectedFavoriteGroupId = item.parentId
    activeFavoritePane = 'items'
    message = '收藏已存在，已定位到现有项'
    notify()
    return true
  }

  function addFavorite(input: Pick<FavoriteNode, 'kind' | 'path' | 'name' | 'parentId' | 'tags' | 'color'>) {
    const now = Date.now()
    if (input.kind === 'group') return null
    if (!normalizeFavoritePath(input.path)) {
      setMessage('文件或文件夹路径不能为空')
      return null
    }
    const result = addFavoriteNode(state.favorites, {
      id: `fav:${now}:${Math.random().toString(36).slice(2, 8)}`,
      kind: input.kind,
      path: input.path,
      name: input.name,
      parentId: input.parentId ?? selectedFavoriteParentId(),
      tags: input.tags,
      color: input.color,
      now
    })
    state.favorites = result.nodes
    if (result.duplicate) {
      focusDuplicateFavorite(result.node.id)
    } else {
      selectedFavoriteIds = []
      focusedFavoriteId = result.node.id
      focusedFavoriteGroupId = null
      selectedFavoriteGroupId = result.node.parentId
      activeFavoritePane = 'items'
      message = '已添加收藏'
    }
    if (!result.duplicate) save()
    if (!result.duplicate) void refreshFavoritePathInspections()
    notify()
    return result
  }

  function reorderFavoriteMetadata(nodeId: string, parentId: string | null, beforeNodeId: string | null) {
    if (!favoriteById(nodeId)) return false
    state.favorites = moveFavoriteNode(state.favorites, nodeId, parentId, beforeNodeId)
    save()
    notify()
    return true
  }

  function addFavoriteTargets(inputs: Array<Pick<FavoriteNode, 'kind' | 'path' | 'name' | 'parentId' | 'tags' | 'color'>>, parentId = selectedFavoriteParentId()) {
    let added = 0
    let duplicates = 0
    let firstAddedId: string | null = null
    let firstDuplicateId: string | null = null
    for (const input of inputs) {
      const result = addFavorite({ ...input, parentId: input.parentId ?? parentId })
      if (!result) continue
      if (result.duplicate) {
        duplicates += 1
        firstDuplicateId ||= result.node.id
      } else {
        added += 1
        firstAddedId ||= result.node.id
      }
    }
    if (firstAddedId) {
      focusedFavoriteId = firstAddedId
      focusedFavoriteGroupId = null
      activeFavoritePane = 'items'
    } else if (firstDuplicateId) {
      focusDuplicateFavorite(firstDuplicateId)
    }
    if (added || duplicates) {
      message = added ? `已添加 ${added} 项${duplicates ? `，跳过 ${duplicates} 个重复项` : ''}` : '收藏已存在，已定位到现有项'
      void loadSelectedFavoriteDirectory()
      notify()
    }
    return { added, duplicates }
  }

  function selectedFavoriteMetadataIds(args?: Record<string, unknown> | null): string[] {
    return resolveFavoriteIds(args, true)
  }

  function favoriteRemovalPlan(ids: string[]) {
    const requested = [...new Set(ids)].filter((id) => Boolean(favoriteById(id)))
    const byId = new Map(state.favorites.map((item) => [item.id, item]))
    const isDescendantOf = (id: string, ancestorId: string) => {
      const visited = new Set<string>()
      let cursor = byId.get(id)
      while (cursor?.parentId && !visited.has(cursor.id)) {
        visited.add(cursor.id)
        if (cursor.parentId === ancestorId) return true
        cursor = byId.get(cursor.parentId)
      }
      return false
    }
    const roots = requested.filter((id) => !requested.some((candidate) => candidate !== id && isDescendantOf(id, candidate)))
    const remaining = deleteFavoriteMetadata(state.favorites, roots)
    const remainingIds = new Set(remaining.map((item) => item.id))
    const removed = state.favorites.filter((item) => !remainingIds.has(item.id)).map((item) => ({ ...item, tags: [...item.tags] }))
    return { roots, removed, remaining }
  }

  function favoriteRemovalContext(): FavoriteRemovalContext {
    return {
      activePane: activeFavoritePane,
      selectedIds: [...selectedFavoriteIds],
      focusedId: focusedFavoriteId,
      focusedGroupId: focusedFavoriteGroupId,
      selectedGroupId: selectedFavoriteGroupId
    }
  }

  function sameFavoriteRemovalContext(left: FavoriteRemovalContext, right: FavoriteRemovalContext) {
    return left.activePane === right.activePane
      && left.focusedId === right.focusedId
      && left.focusedGroupId === right.focusedGroupId
      && left.selectedGroupId === right.selectedGroupId
      && left.selectedIds.length === right.selectedIds.length
      && left.selectedIds.every((id, index) => id === right.selectedIds[index])
  }

  function removeFavoriteNow(ids = selectedFavoriteMetadataIds()) {
    const plan = favoriteRemovalPlan(ids)
    if (!plan.removed.length) return false
    const before = favoriteRemovalContext()
    const removedIds = new Set(plan.removed.map((item) => item.id))
    const removed = plan.removed.map((node) => ({
      node,
      index: state.favorites.findIndex((item) => item.id === node.id)
    }))
    const collapsedGroupIds = state.collapsedFavoriteGroupIds.filter((id) => removedIds.has(id))
    const selectedContainerRemoved = Boolean(selectedFavoriteGroupId && removedIds.has(selectedFavoriteGroupId))
    state.favorites = plan.remaining
    state.collapsedFavoriteGroupIds = state.collapsedFavoriteGroupIds.filter((id) => state.favorites.some((item) => item.id === id))
    selectedFavoriteIds = []
    if (favoriteDrawer.open && favoriteDrawer.targetKind === 'favorite' && favoriteDrawer.targetIds.some((id) => !state.favorites.some((item) => item.id === id))) closeFavoriteDrawer(false)
    if (focusedFavoriteId && !state.favorites.some((item) => item.id === focusedFavoriteId)) focusedFavoriteId = null
    if (focusedFavoriteGroupId && !state.favorites.some((item) => item.id === focusedFavoriteGroupId)) focusedFavoriteGroupId = null
    if (selectedFavoriteGroupId && !state.favorites.some((item) => item.id === selectedFavoriteGroupId)) selectedFavoriteGroupId = null
    if (activeFavoritePane === 'containers') {
      focusedFavoriteId = null
      focusedFavoriteDirectoryPath = null
      normalizeFocusedFavoriteGroup()
    } else if (activeFavoritePane === 'items') {
      focusedFavoriteGroupId = null
      focusedFavoriteDirectoryPath = null
      normalizeFocusedFavorite(false)
    } else {
      focusedFavoriteId = null
      focusedFavoriteGroupId = null
    }
    favoriteRemovalUndo = { removed, collapsedGroupIds, before, after: favoriteRemovalContext() }
    if (selectedContainerRemoved) void loadSelectedFavoriteDirectory()
    save()
    void refreshFavoritePathInspections()
    notify()
    return true
  }

  function undoFavoriteRemoval() {
    if (!favoriteRemovalUndo?.removed.length) return false
    const undo = favoriteRemovalUndo
    const restoreContext = sameFavoriteRemovalContext(favoriteRemovalContext(), undo.after)
    const restored = [...state.favorites]
    const existing = new Set(restored.map((item) => item.id))
    for (const entry of [...undo.removed].sort((left, right) => left.index - right.index)) {
      if (existing.has(entry.node.id)) continue
      restored.splice(Math.min(Math.max(0, entry.index), restored.length), 0, { ...entry.node, tags: [...entry.node.tags] })
      existing.add(entry.node.id)
    }
    state.favorites = restored
    state.collapsedFavoriteGroupIds = [...new Set([...state.collapsedFavoriteGroupIds, ...undo.collapsedGroupIds])]
    favoriteRemovalUndo = null
    if (restoreContext) {
      selectedFavoriteGroupId = undo.before.selectedGroupId && favoriteById(undo.before.selectedGroupId) ? undo.before.selectedGroupId : null
      const panes = availableFavoritePanes()
      activeFavoritePane = panes.includes(undo.before.activePane) ? undo.before.activePane : 'items'
      const visibleItems = new Set(currentFavoriteItems().map((item) => item.id))
      const visibleGroups = new Set(favoriteContainerRows().map((row) => row.node.id))
      selectedFavoriteIds = undo.before.selectedIds.filter((id) => visibleItems.has(id))
      focusedFavoriteId = activeFavoritePane === 'items' && undo.before.focusedId && visibleItems.has(undo.before.focusedId) ? undo.before.focusedId : null
      focusedFavoriteGroupId = activeFavoritePane === 'containers' && undo.before.focusedGroupId && visibleGroups.has(undo.before.focusedGroupId) ? undo.before.focusedGroupId : null
      if (undo.before.selectedGroupId !== undo.after.selectedGroupId) void loadSelectedFavoriteDirectory()
    }
    save()
    void refreshFavoritePathInspections()
    setMessage('已撤销移出收藏')
    return true
  }

  function removeFavorite(ids = selectedFavoriteMetadataIds()) {
    const plan = favoriteRemovalPlan(ids)
    if (!plan.removed.length) return false
    confirm = {
      title: '移出收藏',
      detail: `将移出 ${plan.roots.length} 个根节点、${Math.max(0, plan.removed.length - plan.roots.length)} 个后代。只会删除 EyPc 收藏元数据，不会删除磁盘上的真实文件或文件夹。`,
      onConfirm: () => removeFavoriteNow(plan.roots)
    }
    notify()
    return true
  }

  function markFavoriteUsed(id: string) {
    const now = Date.now()
    state.favorites = state.favorites.map((item) => item.id === id ? { ...item, usageCount: (item.usageCount || 0) + 1, lastUsedAt: now, updatedAt: now } : item)
    save()
    notify()
  }

  function acceptedFileAction(result: FileActionResult) {
    return result.outcome !== 'failed'
  }

  function fileActionFailureText(result: FileActionResult) {
    const labels: Partial<Record<NonNullable<FileActionResult['errorCode']>, string>> = {
      'invalid-path': '路径无效',
      'not-found': '路径不存在',
      'permission-denied': '没有访问权限',
      'no-handler': '没有可用的打开程序',
      timeout: '操作超时',
      unsupported: '当前宿主不支持此操作',
      'io-error': '系统 I/O 错误'
    }
    return result.errorCode ? labels[result.errorCode] || result.message || '未知错误' : result.message || '未知错误'
  }

  function fileActionNotice(action: 'open' | 'reveal' | 'copy-path' | 'copy-items', result: FileActionResult, count = 1) {
    if (result.outcome === 'failed') {
      const verb = action === 'open' ? '打开' : action === 'reveal' ? '定位' : '复制'
      return `${verb}失败：${fileActionFailureText(result)}`
    }
    if (result.outcome === 'dispatched') {
      if (action === 'open') return '已请求系统打开收藏'
      if (action === 'reveal') return '已请求系统定位收藏'
      return '已请求系统复制'
    }
    if (result.outcome === 'revealed-instead') return '打开失败，已在文件管理器中定位该项'
    if (action === 'open') return '已打开收藏'
    if (action === 'reveal') return '已定位收藏'
    if (action === 'copy-items') return `已复制 ${count} 个真实项`
    return count > 1 ? `已复制 ${count} 条路径` : '路径已复制'
  }

  async function openFavorite(args?: Record<string, unknown> | null) {
    const ids = resolveFavoriteIds(args)
    if (ids.length !== 1) {
      setMessage(ids.length > 1 ? '打开只支持单个收藏目标' : '没有选中的文件或文件夹')
      return
    }
    const item = favoriteById(ids[0])
    if (!item?.path || item.kind === 'group') {
      setMessage('没有选中的文件或文件夹')
      return
    }
    const result = normalizeFileActionResult(await platform.files.open(item.path))
    if (acceptedFileAction(result)) {
      markFavoriteUsed(item.id)
      if (favoriteQuickMode) void hideAppWindow()
    }
    setMessage(fileActionNotice('open', result))
  }

  async function revealFavorite(args?: Record<string, unknown> | null) {
    const ids = resolveFavoriteIds(args)
    if (ids.length !== 1) {
      setMessage(ids.length > 1 ? '定位只支持单个收藏目标' : '没有选中的文件或文件夹')
      return
    }
    const item = favoriteById(ids[0])
    if (!item?.path || item.kind === 'group') {
      setMessage('没有选中的文件或文件夹')
      return
    }
    const result = normalizeFileActionResult(await platform.files.reveal(item.path))
    if (acceptedFileAction(result) && favoriteQuickMode) void hideAppWindow()
    setMessage(fileActionNotice('reveal', result))
  }

  async function copyFavoritePath(args?: Record<string, unknown> | null) {
    const ids = resolveFavoriteIds(args, true)
    const items = ids.flatMap((id) => favoriteById(id) || []).filter((item) => item.kind !== 'group' && Boolean(item.path))
    if (!items.length) {
      if (ids.some((id) => favoriteById(id)?.kind === 'group')) setMessage('分组节点没有可复制路径')
      else setMessage('没有选中的收藏')
      return
    }
    const result = normalizeFileActionResult(await platform.files.copyPath(items.map((item) => item.path).join('\n')))
    if (acceptedFileAction(result) && favoriteQuickMode) void hideAppWindow()
    setMessage(fileActionNotice('copy-path', result, items.length))
  }

  async function copyFavoriteItems(args?: Record<string, unknown> | null) {
    const explicitDirectoryPaths = directoryPathsFromArgs(args)
    const useFavoriteTargets = favoriteActionTargetKind(args) === 'favorite'
    const paths = useFavoriteTargets
      ? resolveFavoriteIds(args, true).flatMap((id) => {
          const item = favoriteById(id)
          return item && item.kind !== 'group' && item.path ? [item.path] : []
        })
      : resolveFavoriteDirectoryPaths(explicitDirectoryPaths, true)
    if (!paths.length) {
      setMessage('没有选中的收藏')
      return
    }
    const result = normalizeFileActionResult(await platform.files.copyItems?.(paths), 'unsupported')
    if (acceptedFileAction(result) && favoriteQuickMode) void hideAppWindow()
    setMessage(fileActionNotice('copy-items', result, paths.length))
  }

  function directoryTargets(paths?: string[]): FavoriteDirectoryRow[] {
    const resolved = resolveFavoriteDirectoryPaths(paths, true)
    const requested = resolved.length ? new Set(resolved.map(favoritePathIdentityKey)) : null
    const rows = favoriteDirectoryRows()
    if (requested) return rows.filter((row) => requested.has(favoritePathIdentityKey(row.path)))
    return []
  }

  async function openDirectoryTargets(paths?: string[]) {
    const rows = directoryTargets(paths)
    if (rows.length !== 1) {
      if (rows.length > 1) setMessage('打开只支持单个实际目录项')
      else setMessage('没有选中的实际目录项')
      return
    }
    const result = normalizeFileActionResult(await platform.files.open(rows[0].path))
    setMessage(fileActionNotice('open', result))
  }

  async function revealDirectoryTargets(paths?: string[]) {
    const rows = directoryTargets(paths)
    if (rows.length !== 1) {
      if (rows.length > 1) setMessage('定位只支持单个实际目录项')
      else setMessage('没有选中的实际目录项')
      return
    }
    const result = normalizeFileActionResult(await platform.files.reveal(rows[0].path))
    setMessage(fileActionNotice('reveal', result))
  }

  async function copyDirectoryTargetPaths(paths?: string[]) {
    const rows = directoryTargets(paths)
    if (!rows.length) {
      setMessage('没有选中的实际目录项')
      return
    }
    const result = normalizeFileActionResult(await platform.files.copyPath(rows.map((row) => row.path).join('\n')))
    setMessage(fileActionNotice('copy-path', result, rows.length))
  }

  function tagsTextToList(value: string) {
    return value.split(',').map((tag) => tag.trim()).filter(Boolean)
  }

  function pickReviewItems(picked: PickedFavorite[], kind: PickedFavoriteKind, parentId: string | null): FavoritePickReviewItem[] {
    const now = Date.now()
    return picked.flatMap((item, index) => {
      const path = item.path.trim()
      if (!path) return []
      const pickedKind = item.kind === 'file' || item.kind === 'folder' ? item.kind : kind
      return [{
        id: `pick:${now}:${index}`,
        kind: pickedKind,
        path,
        name: item.name?.trim() || inferFavoriteNameFromPath(path),
        parentId: item.parentId ?? parentId,
        tagsText: (item.tags || []).join(', '),
        color: item.color || (pickedKind === 'folder' ? '#2F80ED' : '#F2994A')
      }]
    })
  }

  async function pickFavoritesForReview(kind: PickedFavoriteKind) {
    const picked = await platform.files.pickFavorites?.(kind)
    if (!picked?.length) {
      setMessage(kind === 'folder' ? '未选择文件夹或当前宿主不可选择文件夹' : '未选择文件或当前宿主不可选择文件')
      return
    }
    const parentId = selectedFavoriteParentId()
    const items = pickReviewItems(picked, kind, parentId)
    if (!items.length) {
      setMessage('没有可保存的有效路径')
      return
    }
    favoritePickReview = { kind, parentId, items, activeIndex: 0 }
    favoriteDraft = null
    notify()
  }

  function updateFavoritePickReviewItem(index: number, input: Partial<Pick<FavoritePickReviewItem, 'kind' | 'path' | 'name' | 'parentId' | 'tagsText' | 'color'>>) {
    if (!favoritePickReview) return
    if (index < 0 || index >= favoritePickReview.items.length) return
    favoritePickReview = {
      ...favoritePickReview,
      activeIndex: index,
      items: favoritePickReview.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...input } : item)
    }
    notify()
  }

  function cycleFavoritePickReview(direction: 1 | -1) {
    if (!favoritePickReview?.items.length) return false
    const nextIndex = (favoritePickReview.activeIndex + direction + favoritePickReview.items.length) % favoritePickReview.items.length
    favoritePickReview = { ...favoritePickReview, activeIndex: nextIndex }
    notify()
    return true
  }

  function cancelFavoritePickReview() {
    if (!favoritePickReview) return false
    favoritePickReview = null
    notify()
    return true
  }

  function commitFavoritePickReview() {
    const review = favoritePickReview
    if (!review) return false
    const inputs = review.items.map((item) => ({
      kind: item.kind,
      path: item.path.trim(),
      name: item.name.trim() || inferFavoriteNameFromPath(item.path),
      parentId: item.parentId ?? review.parentId,
      tags: tagsTextToList(item.tagsText),
      color: item.color || (item.kind === 'folder' ? '#2F80ED' : '#F2994A')
    }))
    favoritePickReview = null
    const result = addFavoriteTargets(inputs, review.parentId)
    if (!result.added && !result.duplicates) {
      setMessage('没有可保存的收藏')
    }
    notify()
    return result.added > 0 || result.duplicates > 0
  }

  async function pickFavoriteDraftPath(kindOverride: PickedFavoriteKind | null = null) {
    if (!favoriteDraft || favoriteDraft.kind === 'group') return
    const pickKind: PickedFavoriteKind = kindOverride || (favoriteDraft.kind === 'file' ? 'file' : 'folder')
    const picked = await platform.files.pickFavorites?.(pickKind)
    const item = picked?.[0]
    if (!item) {
      setMessage('当前宿主不可选择路径，请手填路径')
      return
    }
    const path = item.path.trim()
    const kind = item.kind === 'file' ? 'file' : 'folder'
    favoriteDraft = {
      ...favoriteDraft,
      kind,
      path,
      name: favoriteDraft.name.trim() || item.name?.trim() || inferFavoriteNameFromPath(path),
      tagsText: favoriteDraft.tagsText.trim() || (item.tags || []).join(', '),
      color: item.color || favoriteDraft.color || (kind === 'folder' ? '#2F80ED' : '#F2994A'),
      activeField: 'path'
    }
    notify()
  }

  function addSelectedDirectoryEntries(paths?: string[]) {
    const rows = directoryTargets(paths)
    if (!rows.length) {
      setMessage('没有选中的实际目录项')
      return false
    }
    const parentId = selectedFavoriteGroupId
    const result = addFavoriteTargets(rows.map((row) => ({
      kind: row.kind,
      path: row.path,
      name: row.name,
      parentId,
      tags: [],
      color: row.kind === 'folder' ? '#2F80ED' : '#F2994A'
    })), parentId)
    selectedFavoriteDirectoryPaths = []
    focusedFavoriteDirectoryPath = null
    return result.added > 0 || result.duplicates > 0
  }

  function beginFavoriteDraft(mode: FavoriteDraft['mode'], args?: Record<string, unknown> | null) {
    const now = Date.now()
    const targetIds = mode === 'create-group' || mode === 'create-target' ? [] : resolveFavoriteIds(args, mode === 'move-parent')
    const target = favoriteById(targetIds[0] || null)
    if (mode !== 'create-group' && mode !== 'create-target' && !target) return false
    const kind = mode === 'create-group' ? 'group' : mode === 'create-target' ? 'folder' : target?.kind || 'folder'
    favoriteDraft = {
      mode,
      targetId: target?.id || null,
      targetIds,
      kind,
      name: mode === 'create-group' ? '新分组' : target?.name || '',
      path: kind === 'group' ? '' : target?.path || '',
      tagsText: target?.tags.join(', ') || '',
      color: target?.color || (kind === 'group' ? '#00A676' : '#2F80ED'),
      parentId: mode === 'create-group' || mode === 'create-target' ? selectedFavoriteParentId() : target?.parentId || null,
      activeField: mode === 'move-parent' ? 'parent' : mode === 'create-target' ? 'path' : 'name'
    }
    if (mode === 'create-group' || mode === 'create-target') {
      favoriteDraft.targetId = `draft:${now}`
      favoriteDraft.targetIds = []
    }
    notify()
    return true
  }

  function updateFavoriteDraft(input: Partial<Pick<FavoriteDraft, 'kind' | 'name' | 'path' | 'tagsText' | 'color' | 'parentId' | 'activeField'>>) {
    if (!favoriteDraft) return
    favoriteDraft = { ...favoriteDraft, ...input }
    notify()
  }

  function cycleFavoriteDraftField(direction: 1 | -1) {
    if (!favoriteDraft) return false
    const fields: FavoriteDraftField[] = favoriteDraft.mode === 'move-parent'
      ? ['parent']
      : favoriteDraft.kind === 'group'
        ? ['name', 'color', 'parent']
        : ['kind', 'name', 'path', 'tags', 'color', 'parent']
    const current = Math.max(0, fields.indexOf(favoriteDraft.activeField))
    favoriteDraft.activeField = fields[(current + direction + fields.length) % fields.length]
    notify()
    return true
  }

  function saveFavoriteDraft(input: Partial<Pick<FavoriteDraft, 'kind' | 'name' | 'path' | 'tagsText' | 'color' | 'parentId'>> = {}) {
    if (!favoriteDraft) return false
    const draft = { ...favoriteDraft, ...input }
    const target = favoriteById(draft.targetId)
    const name = draft.name.trim()
    const kind = draft.mode === 'create-group' ? 'group' : draft.kind
    const parentId = draft.parentId || null
    if (kind === 'group' && !name) {
      setMessage('收藏名称不能为空')
      return false
    }
    if (kind !== 'group' && !draft.path.trim()) {
      setMessage('文件或文件夹路径不能为空')
      return false
    }
    const movingIds = draft.mode === 'move-parent' ? draft.targetIds : [draft.mode === 'create-group' ? '' : draft.targetId || '']
    if (movingIds.some((id) => !isValidFavoriteParent(state.favorites, id, parentId))) {
      setMessage('不能移动到自身或子分组下')
      return false
    }
    if (draft.mode === 'rename' && !name) {
      setMessage('收藏名称不能为空')
      return false
    }
    const displayPath = kind === 'group' ? '' : draft.path.trim()
    if (kind !== 'group' && draft.mode === 'edit') {
      const pathKey = favoritePathIdentityKey(displayPath)
      const duplicate = state.favorites.find((item) => item.id !== draft.targetId && item.kind === kind && favoritePathIdentityKey(item.path) === pathKey)
      if (duplicate) {
        setMessage('已有等价路径的同类型收藏')
        return false
      }
    }
    const now = Date.now()
    if (draft.mode === 'create-group') {
      const id = `fav-group:${now}:${Math.random().toString(36).slice(2, 8)}`
      state.favorites.push({ id, kind: 'group', path: '', name, parentId, tags: [], color: draft.color || '#00A676', sortOrder: state.favorites.length + 1, createdAt: now, updatedAt: now })
      focusedFavoriteGroupId = id
      activeFavoritePane = 'containers'
    } else if (draft.mode === 'create-target' && (kind === 'file' || kind === 'folder')) {
      addFavorite({
        kind,
        path: displayPath,
        name: name || inferFavoriteNameFromPath(draft.path),
        parentId,
        tags: tagsTextToList(draft.tagsText),
        color: draft.color || '#2F80ED'
      })
    } else if (target) {
      state.favorites = state.favorites.map((item) => {
        if (draft.mode === 'move-parent') return draft.targetIds.includes(item.id) ? { ...item, parentId, updatedAt: now } : item
        if (item.id !== target.id) return item
        if (draft.mode === 'rename') return { ...item, name, updatedAt: now }
        return {
          ...item,
          kind,
          name: name || inferFavoriteNameFromPath(draft.path),
          path: displayPath,
          tags: tagsTextToList(draft.tagsText),
          color: draft.color || item.color,
          parentId,
          updatedAt: now
        }
      })
      if (kind === 'group') focusedFavoriteGroupId = target.id
      else focusedFavoriteId = target.id
    }
    favoriteDraft = null
    save()
    void refreshFavoritePathInspections()
    notify()
    return true
  }

  function registerActions() {
    actions.register({ id: 'app.hide', title: '隐藏插件窗口', group: '全局', risk: 'normal', scope: 'global', priority: 100, shortcut: 'Shift+Escape', when: () => true, run: () => { void hideAppWindow(); return true } })
    actions.register({ id: 'quickJump.openForward', title: '快捷跳转', group: '全局', risk: 'normal', scope: 'global', priority: 99, shortcut: 'F', when: (ctx) => !ctx.layerIds.includes('confirm'), run: () => true })
    actions.register({ id: 'quickJump.openBackward', title: '反向快捷跳转', group: '全局', risk: 'normal', scope: 'global', priority: 99, shortcut: 'Shift+F', when: (ctx) => !ctx.layerIds.includes('confirm'), run: () => true })
    for (const feature of FEATURES) {
      const tabActionId = `tab.select.${feature.id}`
      actions.register({
        id: tabActionId,
        title: `切到${feature.title}`,
        group: '全局',
        risk: 'normal',
        scope: 'global',
        priority: 10,
        shortcut: undefined,
        when: () => isTabEnabled(feature.id),
        run: () => { setTab(feature.id); return true }
      })
    }
    actions.register({ id: 'windows.refresh', title: '刷新窗口列表', group: '窗口跳转', risk: 'normal', scope: 'tab', priority: 100, shortcut: 'Ctrl+R', when: (ctx) => ctx.tab === 'windows', run: () => { void refreshWindows({ clearSearch: true }); return true } })
    actions.register({ id: 'windows.search.focus', title: '聚焦窗口搜索', group: '窗口跳转', risk: 'normal', scope: 'tab', priority: 99, shortcut: 'Ctrl+F', when: (ctx) => ctx.tab === 'windows', run: () => { searchFocusTarget = 'windows'; searchFocusRequestId += 1; notify(); return true } })
    actions.register({ id: 'windows.activate', title: '展开并前置当前窗口', group: '窗口跳转', risk: 'normal', scope: 'tab', priority: 98, shortcut: 'Enter', when: (ctx) => ctx.tab === 'windows' && !ctx.layerIds.includes('window-editor'), run: (_ctx, args) => {
      void activateWindowRow(typeof args?.rowId === 'string' ? args.rowId : undefined).catch(() => {
        finishWindowActivation(activationAttemptFor('manual'), 'activate', 'activation-failed', 'blocking')
      })
      return true
    } })
    actions.register({ id: 'windows.actions.open', title: '打开窗口操作面板', group: '窗口跳转', risk: 'normal', scope: 'tab', priority: 98, shortcut: 'Ctrl+ArrowRight', when: (ctx) => ctx.tab === 'windows' && !ctx.layerIds.includes('window-editor'), run: (_ctx, args) => openWindowActions(typeof args?.rowId === 'string' ? args.rowId : undefined) })
    actions.register({ id: 'windows.actions.close', title: '返回窗口列表', group: '窗口跳转', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Ctrl+ArrowLeft', when: (ctx) => ctx.tab === 'windows' && ctx.layerIds.includes('window-actions'), run: () => closeWindowActions() })
    actions.register({ id: 'windows.layer.toggle', title: '切换窗口列表与操作层', group: '窗口跳转', risk: 'normal', scope: 'tab', priority: 97, shortcut: 'Tab', when: (ctx) => ctx.tab === 'windows' && !ctx.layerIds.includes('window-editor'), run: () => windowActionsOpen ? closeWindowActions() : openWindowActions() })
    actions.register({ id: 'windows.layer.togglePrev', title: '反向切换窗口列表与操作层', group: '窗口跳转', risk: 'normal', scope: 'tab', priority: 97, shortcut: 'Shift+Tab', when: (ctx) => ctx.tab === 'windows' && !ctx.layerIds.includes('window-editor'), run: () => windowActionsOpen ? closeWindowActions() : openWindowActions() })
    actions.register({ id: 'windows.favorite.toggle', title: '收藏或取消收藏窗口', group: '窗口跳转', risk: 'data-write', scope: 'tab', priority: 96, when: (ctx) => ctx.tab === 'windows' && !ctx.layerIds.includes('window-editor'), run: (_ctx, args) => {
      if (typeof args?.rowId === 'string' || windowActionsMode === 'single' || selectedWindowIds.length <= 1) {
        return toggleWindowFavorite(typeof args?.rowId === 'string' ? args.rowId : undefined)
      }
      return favoriteWindowRows()
    } })
    actions.register({ id: 'windows.alwaysOnTop', title: '页面置顶', group: '窗口跳转', risk: 'normal', scope: 'tab', priority: 97, when: (ctx) => ctx.tab === 'windows' && !ctx.layerIds.includes('window-editor'), run: (_ctx, args) => {
      void setWindowAlwaysOnTop(typeof args?.rowId === 'string' ? args.rowId : undefined).catch(() => {
        finishWindowActivation(activationAttemptFor('manual', null, 'always-on-top'), 'topmost', 'topmost-failed', 'blocking')
      })
      return true
    } })
    actions.register({ id: 'windows.pin.toggle', title: '切换窗口列表置顶', group: '窗口跳转', risk: 'data-write', scope: 'tab', priority: 96, when: (ctx) => ctx.tab === 'windows' && !ctx.layerIds.includes('window-editor'), run: (_ctx, args) => toggleWindowPins(typeof args?.rowId === 'string' ? args.rowId : undefined) })
    actions.register({ id: 'windows.close', title: '关闭窗口', group: '窗口跳转', risk: 'data-write', scope: 'tab', priority: 97, shortcut: 'Ctrl+Delete', when: (ctx) => ctx.tab === 'windows' && !ctx.layerIds.includes('window-editor'), run: (_ctx, args) => { void closeWindowRows(typeof args?.rowId === 'string' ? args.rowId : undefined, false); return true } })
    actions.register({ id: 'windows.close.force', title: '强制关闭窗口', group: '窗口跳转', risk: 'destructive', scope: 'tab', priority: 97, when: (ctx) => ctx.tab === 'windows' && !ctx.layerIds.includes('window-editor'), run: (_ctx, args) => { void closeWindowRows(typeof args?.rowId === 'string' ? args.rowId : undefined, true); return true } })
    actions.register({ id: 'windows.selection.clear', title: '清空窗口多选', group: '窗口跳转', risk: 'normal', scope: 'tab', priority: 95, when: (ctx) => ctx.tab === 'windows', run: () => clearWindowSelection() })
    actions.register({ id: 'windows.rename', title: '编辑窗口别名', group: '窗口跳转', risk: 'data-write', scope: 'tab', priority: 96, shortcut: 'Shift+F2', when: (ctx) => ctx.tab === 'windows' && !ctx.layerIds.includes('window-editor'), run: (_ctx, args) => beginWindowDraft('rename', typeof args?.rowId === 'string' ? args.rowId : undefined) })
    actions.register({ id: 'windows.edit', title: '编辑窗口目标', group: '窗口跳转', risk: 'data-write', scope: 'tab', priority: 96, shortcut: 'F2', when: (ctx) => ctx.tab === 'windows' && !ctx.layerIds.includes('window-editor'), run: (_ctx, args) => beginWindowDraft('edit', typeof args?.rowId === 'string' ? args.rowId : undefined) })
    actions.register({ id: 'windows.editor.save', title: '保存窗口目标', group: '窗口跳转', risk: 'data-write', scope: 'layer', priority: 100, shortcut: 'Ctrl+S', when: (ctx) => ctx.tab === 'windows' && ctx.layerIds.includes('window-editor'), run: () => saveWindowDraft() })
    actions.register({ id: 'windows.editor.cancel', title: '取消窗口编辑', group: '窗口跳转', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Escape', when: (ctx) => ctx.tab === 'windows' && ctx.layerIds.includes('window-editor'), run: () => cancelWindowDraft() })
    actions.register({ id: 'windows.editor.nextField', title: '窗口编辑下一个字段', group: '窗口跳转', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Tab', when: (ctx) => ctx.tab === 'windows' && ctx.layerIds.includes('window-editor'), run: () => moveWindowDraftField(1) })
    actions.register({ id: 'windows.editor.prevField', title: '窗口编辑上一个字段', group: '窗口跳转', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Shift+Tab', when: (ctx) => ctx.tab === 'windows' && ctx.layerIds.includes('window-editor'), run: () => moveWindowDraftField(-1) })
    actions.register({ id: 'windows.slot.activate', title: '跳转窗口槽位', group: '窗口跳转', risk: 'normal', scope: 'global', priority: 101, when: () => true, run: (_ctx, args) => {
      const slot = Math.trunc(Number(args?.slot))
      if (slot < 1 || slot > 10) return false
      void activateWindowSlot(slot).catch(() => {
        finishWindowActivation(activationAttemptFor('slot', slot), 'activate', 'activation-failed', 'blocking')
      })
      return true
    } })
    actions.register({ id: 'windows.activation.diagnostics.clear', title: '清空本次窗口激活诊断', group: '窗口跳转', risk: 'normal', scope: 'tab', priority: 94, when: (ctx) => ctx.tab === 'windows', run: () => clearWindowActivationDiagnostics() })
    actions.register({ id: 'windows.operation.traces.clear', title: '清空开发窗口操作追踪', group: '窗口跳转', risk: 'normal', scope: 'tab', priority: 94, when: (ctx) => ctx.tab === 'windows' && windowOperationTraceEnabled, run: () => clearWindowOperationTraces() })
    actions.register({ id: 'windows.slot.assign', title: '分配窗口槽位', group: '窗口跳转', risk: 'data-write', scope: 'row', priority: 96, when: (ctx) => ctx.tab === 'windows', run: (_ctx, args) => assignWindowSlot(Math.trunc(Number(args?.slot)), typeof args?.rowId === 'string' ? args.rowId : undefined) })
    for (let slot = 1; slot <= 10; slot += 1) {
      actions.register({
        id: `windows.slot.assign.${slot}`,
        title: `分配窗口到槽 ${slot}`,
        group: '窗口跳转',
        risk: 'data-write',
        scope: 'row',
        priority: 95,
        shortcut: slot === 10 ? 'Ctrl+0' : `Ctrl+${slot}`,
        when: (ctx) => ctx.tab === 'windows' && !ctx.layerIds.includes('window-editor'),
        run: () => assignWindowSlot(slot)
      })
    }
    actions.register({ id: 'windows.slot.clear', title: '清除窗口槽关联', group: '窗口跳转', risk: 'data-write', scope: 'row', priority: 96, when: (ctx) => ctx.tab === 'windows', run: (_ctx, args) => clearWindowSlot(Math.trunc(Number(args?.slot))) })
    actions.register({ id: 'windows.slot.focus', title: '聚焦窗口槽目标', group: '窗口跳转', risk: 'normal', scope: 'tab', priority: 96, when: (ctx) => ctx.tab === 'windows', run: (_ctx, args) => focusWindowSlot(Math.trunc(Number(args?.slot))) })
    actions.register({ id: 'windows.slot.configure', title: '配置窗口槽全局快捷键', group: '窗口跳转', risk: 'normal', scope: 'row', priority: 96, when: (ctx) => ctx.tab === 'windows', run: (_ctx, args) => configureWindowSlotHotkey(Math.trunc(Number(args?.slot))) })
    actions.register({ id: 'windows.hwnd.copy', title: '复制 Windows HWND', group: '窗口跳转', risk: 'normal', scope: 'row', priority: 96, when: (ctx) => ctx.tab === 'windows', run: (_ctx, args) => { void copyWindowHandle(typeof args?.rowId === 'string' ? args.rowId : undefined); return true } })
    actions.register({ id: 'windows.permission.settings', title: '打开 macOS 辅助功能设置', group: '窗口跳转', risk: 'normal', scope: 'tab', priority: 96, when: (ctx) => ctx.tab === 'windows', run: () => { void platform.windows.openPermissionSettings?.(); return true } })
    actions.register({ id: 'windows.candidates.clear', title: '退出窗口候选筛选', group: '窗口跳转', risk: 'normal', scope: 'tab', priority: 96, when: (ctx) => ctx.tab === 'windows', run: () => clearWindowCandidates() })
    actions.register({ id: 'ports.scan', title: '刷新端口', group: '端口', risk: 'normal', scope: 'tab', priority: 100, shortcut: 'Ctrl+R', when: (ctx) => ctx.tab === 'ports', run: () => { void scanPorts(); return true } })
    actions.register({ id: 'ports.groups.togglePanel', title: '展开/收起端口组栏', group: '端口', risk: 'normal', scope: 'tab', priority: 99, shortcut: 'Ctrl+Shift+W', when: (ctx) => ctx.tab === 'ports', run: () => toggleGroupPanel() })
    actions.register({ id: 'ports.search.focus', title: '聚焦端口搜索', group: '端口', risk: 'normal', scope: 'tab', priority: 99, shortcut: 'Ctrl+F', when: (ctx) => ctx.tab === 'ports', run: () => focusPortSearch() })
    actions.register({ id: 'ports.groupSearch.focus', title: '聚焦端口组搜索', group: '端口', risk: 'normal', scope: 'tab', priority: 99, shortcut: 'Ctrl+Shift+F', when: (ctx) => ctx.tab === 'ports', run: () => focusPortGroupSearch() })
    actions.register({ id: 'ports.search.blur', title: '退出端口搜索焦点', group: '端口', risk: 'normal', scope: 'layer', priority: 99, shortcut: 'Escape', when: (ctx) => ctx.tab === 'ports', run: () => blurSearchFocus() })
    actions.register({ id: 'ports.kill.confirm', title: '终止选中进程', group: '端口', risk: 'data-write', scope: 'tab', priority: 100, shortcut: 'Delete', when: (ctx) => ctx.tab === 'ports', run: () => { confirmKill(); return true } })
    actions.register({ id: 'ports.kill.force', title: '强杀选中进程', group: '端口', risk: 'destructive', scope: 'tab', priority: 100, shortcut: 'Ctrl+Delete', when: (ctx) => ctx.tab === 'ports', run: () => { void killPorts(true); return true } })
    actions.register({ id: 'ports.killGroup.confirm', title: '终止端口组', group: '端口', risk: 'data-write', scope: 'tab', priority: 90, when: (ctx) => ctx.tab === 'ports', run: (_ctx, args) => { confirmKillGroup(targetFromArgs(args)); return true } })
    actions.register({ id: 'ports.killGroup.force', title: '强杀端口组', group: '端口', risk: 'destructive', scope: 'tab', priority: 90, when: (ctx) => ctx.tab === 'ports', run: (_ctx, args) => { void killPortTargets(currentPortGroupSelection(targetFromArgs(args)), true, '组内端口当前无监听进程'); return true } })
    actions.register({ id: 'ports.pane.toggleNext', title: '切换端口栏', group: '端口', risk: 'normal', scope: 'tab', priority: 96, shortcut: 'Tab', when: (ctx) => ctx.tab === 'ports', run: () => togglePortPane() })
    actions.register({ id: 'ports.pane.togglePrev', title: '反向切换端口栏', group: '端口', risk: 'normal', scope: 'tab', priority: 96, shortcut: 'Shift+Tab', when: (ctx) => ctx.tab === 'ports', run: () => togglePortPane() })
    actions.register({ id: 'ports.pane.groups', title: '聚焦端口组栏', group: '端口', risk: 'normal', scope: 'tab', priority: 95, shortcut: 'Alt+ArrowLeft', when: (ctx) => ctx.tab === 'ports', run: () => { focusPortPane('groups'); notify(); return true } })
    actions.register({ id: 'ports.pane.results', title: '聚焦端口结果栏', group: '端口', risk: 'normal', scope: 'tab', priority: 95, shortcut: 'Alt+ArrowRight', when: (ctx) => ctx.tab === 'ports', run: () => { focusPortPane('results'); notify(); return true } })
    actions.register({ id: 'ports.group.apply', title: '应用端口组过滤', group: '端口', risk: 'normal', scope: 'tab', priority: 95, shortcut: 'Enter', when: (ctx) => ctx.tab === 'ports', run: (_ctx, args) => applyFocusedGroup(targetFromArgs(args)) })
    actions.register({ id: 'ports.group.focusMatches', title: '聚焦组内端口', group: '端口', risk: 'normal', scope: 'tab', priority: 95, shortcut: 'Ctrl+Enter', when: (ctx) => ctx.tab === 'ports', run: (_ctx, args) => focusFocusedGroupMatches(targetFromArgs(args)) })
    actions.register({ id: 'ports.group.kill.confirm', title: '终止当前端口组', group: '端口', risk: 'data-write', scope: 'tab', priority: 94, shortcut: 'Shift+Enter', when: (ctx) => ctx.tab === 'ports', run: (_ctx, args) => { confirmKillGroup(targetFromArgs(args)); return true } })
    actions.register({ id: 'ports.group.kill.force', title: '强杀当前端口组', group: '端口', risk: 'destructive', scope: 'tab', priority: 94, shortcut: 'Ctrl+Shift+Enter', when: (ctx) => ctx.tab === 'ports', run: (_ctx, args) => { void killPortTargets(currentPortGroupSelection(targetFromArgs(args)), true, '组内端口当前无监听进程'); return true } })
    actions.register({ id: 'ports.group.createFromSelection', title: '选中端口收藏为组', group: '端口', risk: 'data-write', scope: 'tab', priority: 93, shortcut: 'Ctrl+G', when: (ctx) => ctx.tab === 'ports', run: () => createGroupFromSelection() })
    actions.register({ id: 'ports.group.create', title: '新建端口组', group: '端口', risk: 'data-write', scope: 'tab', priority: 92, when: (ctx) => ctx.tab === 'ports', run: () => { openGroupDraft(null); return true } })
    actions.register({ id: 'ports.groupFolder.create', title: '新增分组夹', group: '端口', risk: 'data-write', scope: 'tab', priority: 92, shortcut: 'Ctrl+T', when: (ctx) => ctx.tab === 'ports', run: () => createPortGroupFolder() })
    actions.register({ id: 'ports.group.rename', title: '重命名端口组', group: '端口', risk: 'data-write', scope: 'tab', priority: 92, shortcut: 'Shift+F2', when: (ctx) => ctx.tab === 'ports', run: (_ctx, args) => {
      const target = targetFromArgs(args)
      const folder = folderFromTarget(target)
      if (folder) {
        openFolderRenameDraft(folder)
        return true
      }
      const group = groupFromTarget(target)
      if (!group) return false
      openGroupDraft(group, 'rename')
      return true
    } })
    actions.register({ id: 'ports.group.moveFolder', title: '变更端口组分组夹', group: '端口', risk: 'data-write', scope: 'tab', priority: 92, shortcut: 'Ctrl+F2', when: (ctx) => ctx.tab === 'ports', run: (_ctx, args) => {
      const group = groupFromTarget(targetFromArgs(args))
      if (!group) return false
      openGroupDraft(group, 'move-folder')
      return true
    } })
    actions.register({ id: 'ports.group.edit', title: '编辑端口组', group: '端口', risk: 'data-write', scope: 'tab', priority: 92, shortcut: 'F2', when: (ctx) => ctx.tab === 'ports', run: (_ctx, args) => {
      const target = targetFromArgs(args)
      const folder = folderFromTarget(target)
      if (folder) {
        openFolderRenameDraft(folder)
        return true
      }
      const group = groupFromTarget(target)
      if (!group) return false
      openGroupDraft(group, 'edit')
      return true
    } })
    actions.register({ id: 'ports.group.save', title: '保存端口组编辑', group: '端口', risk: 'data-write', scope: 'layer', priority: 100, shortcut: 'Ctrl+S', when: (ctx) => ctx.layerIds.includes('port-group-editor'), run: () => savePortGroupDraft(portGroupDraft || { name: '', entriesText: '', color: '#00A676', folderId: null }) })
    actions.register({ id: 'ports.group.edit.nextField', title: '编辑层下一个字段', group: '端口', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Tab', when: (ctx) => ctx.layerIds.includes('port-group-editor'), run: () => movePortGroupDraftField(1) })
    actions.register({ id: 'ports.group.edit.prevField', title: '编辑层上一个字段', group: '端口', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Shift+Tab', when: (ctx) => ctx.layerIds.includes('port-group-editor'), run: () => movePortGroupDraftField(-1) })
    actions.register({ id: 'ports.group.delete', title: '删除端口组/夹', group: '端口', risk: 'data-write', scope: 'tab', priority: 91, shortcut: 'Delete', when: (ctx) => ctx.tab === 'ports', run: (_ctx, args) => deleteFocusedGroup(false, targetFromArgs(args)) })
    actions.register({ id: 'ports.group.delete.force', title: '强制删除端口组/夹', group: '端口', risk: 'destructive', scope: 'tab', priority: 91, shortcut: 'Ctrl+Delete', when: (ctx) => ctx.tab === 'ports', run: (_ctx, args) => deleteFocusedGroup(true, targetFromArgs(args)) })
    actions.register({ id: 'ports.groupTarget.toggle', title: '折叠/展开端口组夹', description: '折叠或展开当前高亮分组夹。', icon: 'toggle', group: '端口', risk: 'normal', scope: 'tab', priority: 91, when: (ctx) => ctx.tab === 'ports', run: () => toggleFocusedGroupFolder() })
    actions.register({ id: 'ports.groupTarget.collapse', title: '折叠端口组夹', description: '折叠当前高亮分组夹。', icon: 'left', group: '端口', risk: 'normal', scope: 'tab', priority: 91, when: (ctx) => ctx.tab === 'ports', run: () => toggleFocusedGroupFolder(false) })
    actions.register({ id: 'ports.groupTarget.expand', title: '展开端口组夹', description: '展开当前高亮分组夹。', icon: 'right', group: '端口', risk: 'normal', scope: 'tab', priority: 91, when: (ctx) => ctx.tab === 'ports', run: () => toggleFocusedGroupFolder(true) })
    actions.register({ id: 'ports.groupDetail.open', title: '打开端口组详情抽屉', description: '展示当前分组或分组夹的规则和快捷操作。', icon: 'detail', group: '端口', risk: 'normal', scope: 'tab', priority: 96, shortcut: 'Ctrl+ArrowLeft', when: (ctx) => ctx.tab === 'ports', run: (_ctx, args) => openPortGroupDetail(args) })
    actions.register({ id: 'ports.groupDetail.close', title: '关闭端口组详情抽屉', description: '关闭左侧端口组详情抽屉。', icon: 'close', group: '端口', risk: 'normal', scope: 'layer', priority: 96, when: (ctx) => ctx.tab === 'ports', run: () => closePortGroupDetail() })
    actions.register({ id: 'ports.drawer.open', title: '打开端口动作抽屉', description: '展示当前端口、选中端口或端口组的可执行动作。', icon: 'drawer', group: '端口', risk: 'normal', scope: 'tab', priority: 96, shortcut: 'Ctrl+ArrowRight', when: (ctx) => ctx.tab === 'ports', run: (_ctx, args) => openPortDrawer(args) })
    actions.register({ id: 'ports.drawer.close', title: '关闭端口动作抽屉', description: '关闭右侧动作抽屉。', icon: 'close', group: '端口', risk: 'normal', scope: 'layer', priority: 96, when: (ctx) => ctx.tab === 'ports', run: () => closePortDrawer() })
    actions.register({ id: 'ports.detail.open', title: '打开端口详情抽屉', description: '展示当前高亮进程的端口、PID、命令和快捷操作。', icon: 'detail', group: '端口', risk: 'normal', scope: 'tab', priority: 96, shortcut: 'Ctrl+ArrowLeft', when: (ctx) => ctx.tab === 'ports', run: (_ctx, args) => openPortDetail(args) })
    actions.register({ id: 'ports.detail.close', title: '关闭端口详情抽屉', description: '关闭左侧进程详情抽屉。', icon: 'close', group: '端口', risk: 'normal', scope: 'layer', priority: 96, when: (ctx) => ctx.tab === 'ports', run: () => closePortDetail() })
    actions.register({ id: 'ports.drawer.next', title: '抽屉内下移', description: '移动到下一个抽屉动作。', icon: 'down', group: '端口', risk: 'normal', scope: 'layer', priority: 96, when: (ctx) => ctx.tab === 'ports', run: () => movePortDrawer(1) })
    actions.register({ id: 'ports.drawer.prev', title: '抽屉内上移', description: '移动到上一个抽屉动作。', icon: 'up', group: '端口', risk: 'normal', scope: 'layer', priority: 96, when: (ctx) => ctx.tab === 'ports', run: () => movePortDrawer(-1) })
    actions.register({ id: 'ports.drawer.select', title: '执行抽屉当前动作', description: '执行右侧抽屉中当前高亮的动作。', icon: 'enter', group: '端口', risk: 'normal', scope: 'layer', priority: 96, when: (ctx) => ctx.tab === 'ports', run: () => executePortDrawerItem() })
    actions.register({ id: 'ports.selection.clear', title: '清空端口多选', description: '清空当前端口多选并关闭多选抽屉。', icon: 'clear', group: '端口', risk: 'normal', scope: 'tab', priority: 95, when: (ctx) => ctx.tab === 'ports', run: () => clearPortSelection() })
    for (let index = 1; index <= 9; index += 1) {
      actions.register({
        id: `ports.drawer.select.${index}`,
        title: `执行抽屉第 ${index} 个动作`,
        description: '执行右侧抽屉中的指定序号动作。',
        icon: 'number',
        group: '端口',
        risk: 'normal',
        scope: 'layer',
        priority: 90 - index,
        shortcut: `Ctrl+${index}`,
        when: (ctx) => ctx.tab === 'ports',
        run: () => executePortDrawerItem(index - 1)
      })
      actions.register({
        id: `ports.drawer.action.${index}`,
        title: `直接执行第 ${index} 个端口动作`,
        description: '不打开抽屉，直接执行当前端口上下文的指定动作。',
        icon: 'number',
        group: '端口',
        risk: 'normal',
        scope: 'tab',
        priority: 80 - index,
        shortcut: `Ctrl+Alt+${index}`,
        when: (ctx) => ctx.tab === 'ports',
        run: () => executePortDrawerItem(index - 1, true)
      })
    }
    actions.register({ id: 'mqtt.connection.connect', title: '连接/重连 MQTT', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 100, shortcut: 'Ctrl+R', when: (ctx) => ctx.tab === 'mqtt', run: () => { void connectMqtt(); return true } })
    actions.register({ id: 'mqtt.connection.disconnect', title: '断开 MQTT', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 100, shortcut: 'Ctrl+Shift+R', when: (ctx) => ctx.tab === 'mqtt', run: () => disconnectMqtt() })
    actions.register({ id: 'mqtt.connection.toggleSelect', title: '多选 MQTT 连接', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 96, shortcut: 'Space', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => toggleMqttConnectionSelection(args) })
    actions.register({ id: 'mqtt.connection.copyAddress', title: '复制 MQTT 连接地址', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 96, shortcut: 'Ctrl+C', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => copyMqttConnectionAddress(args) })
    actions.register({ id: 'mqtt.connection.delete', title: '删除当前 MQTT 连接', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 95, shortcut: 'Delete', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => deleteFocusedMqttConnection(args) })
    actions.register({ id: 'mqtt.connection.deleteSelected', title: '删除选中 MQTT 连接', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 95, shortcut: 'Ctrl+Delete', when: (ctx) => ctx.tab === 'mqtt', run: () => deleteSelectedMqttConnections() })
    actions.register({ id: 'mqtt.selection.clear', title: '清空 MQTT 多选', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 95, when: (ctx) => ctx.tab === 'mqtt', run: () => clearMqttRailSelection() })
    actions.register({ id: 'mqtt.connectionTree.move', title: '移动 MQTT 连接树节点', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 95, when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => moveMqttConnectionTreeFromArgs(args) })
    actions.register({ id: 'mqtt.connectionGroup.create', title: '新建 MQTT 连接分组', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 95, shortcut: 'Ctrl+G', when: (ctx) => ctx.tab === 'mqtt', run: (ctx, args) => beginMqttConnectionGroupDraft('create', args, ctx) })
    actions.register({ id: 'mqtt.connectionGroup.edit', title: '编辑 MQTT 连接分组', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 94, shortcut: 'F2', when: (ctx) => ctx.tab === 'mqtt', run: (ctx, args) => beginMqttConnectionGroupDraft('edit', args, ctx) })
    actions.register({ id: 'mqtt.connectionGroup.rename', title: '重命名 MQTT 连接分组', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 94, shortcut: 'Shift+F2', when: (ctx) => ctx.tab === 'mqtt', run: (ctx, args) => beginMqttConnectionGroupDraft('rename', args, ctx) })
    actions.register({ id: 'mqtt.connectionGroup.moveParent', title: '移动 MQTT 连接分组父级', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 94, shortcut: 'Ctrl+F2', when: (ctx) => ctx.tab === 'mqtt', run: (ctx, args) => beginMqttConnectionGroupDraft('move-parent', args, ctx) })
    actions.register({ id: 'mqtt.connectionGroup.delete', title: '删除 MQTT 连接分组', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 95, shortcut: 'Delete', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => { const id = mqttFocusedGroupIdFromArgs(args); return id ? deleteMqttConnectionGroupById(id) : false } })
    actions.register({ id: 'mqtt.connectionGroup.toggleCollapse', title: '折叠/展开 MQTT 连接分组', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 94, when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => toggleMqttConnectionGroupCollapse(args) })
    actions.register({ id: 'mqtt.connectionGroup.collapse', title: '折叠 MQTT 连接分组', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 94, shortcut: 'ArrowLeft', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => setMqttConnectionGroupCollapsed(args, true) })
    actions.register({ id: 'mqtt.connectionGroup.expand', title: '展开 MQTT 连接分组', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 94, shortcut: 'ArrowRight', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => setMqttConnectionGroupCollapsed(args, false) })
    actions.register({ id: 'mqtt.connectionGroup.save', title: '保存 MQTT 连接分组', group: 'MQTT', risk: 'data-write', scope: 'layer', priority: 100, shortcut: 'Ctrl+S', when: (ctx) => ctx.layerIds.includes('mqtt-connection-group-editor'), run: () => saveMqttConnectionGroupDraft() })
    actions.register({ id: 'mqtt.connectionGroup.cancel', title: '取消 MQTT 分组编辑', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Escape', when: (ctx) => ctx.layerIds.includes('mqtt-connection-group-editor'), run: () => cancelMqttConnectionGroupDraft() })
    actions.register({ id: 'mqtt.connectionGroup.nextField', title: 'MQTT 分组编辑下一个字段', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Tab', when: (ctx) => ctx.layerIds.includes('mqtt-connection-group-editor'), run: () => moveMqttConnectionGroupDraftField(1) })
    actions.register({ id: 'mqtt.connectionGroup.prevField', title: 'MQTT 分组编辑上一个字段', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Shift+Tab', when: (ctx) => ctx.layerIds.includes('mqtt-connection-group-editor'), run: () => moveMqttConnectionGroupDraftField(-1) })
    actions.register({ id: 'mqtt.config.create', title: '新建 MQTT 配置', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 95, shortcut: 'Ctrl+N', when: (ctx) => ctx.tab === 'mqtt', run: (ctx, args) => beginMqttConfigDraft('create', args, ctx) })
    actions.register({ id: 'mqtt.config.edit', title: '编辑 MQTT 配置', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 94, shortcut: 'F2', when: (ctx) => ctx.tab === 'mqtt', run: (ctx, args) => beginMqttConfigDraft('edit', args, ctx) })
    actions.register({ id: 'mqtt.config.rename', title: '重命名 MQTT 配置', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 94, shortcut: 'Shift+F2', when: (ctx) => ctx.tab === 'mqtt', run: (ctx, args) => beginMqttConfigDraft('rename', args, ctx) })
    actions.register({ id: 'mqtt.config.save', title: '保存 MQTT 配置', group: 'MQTT', risk: 'data-write', scope: 'layer', priority: 100, shortcut: 'Ctrl+S', when: (ctx) => ctx.layerIds.includes('mqtt-editor'), run: () => saveMqttConfigDraft() })
    actions.register({ id: 'mqtt.config.cancel', title: '取消 MQTT 编辑', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Escape', when: (ctx) => ctx.layerIds.includes('mqtt-editor'), run: () => { mqttConfigDraft = null; notify(); return true } })
    actions.register({ id: 'mqtt.config.clientId.refresh', title: '刷新 MQTT Client ID', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 90, when: (ctx) => ctx.layerIds.includes('mqtt-editor'), run: () => refreshMqttConfigClientId() })
    actions.register({ id: 'mqtt.config.nextField', title: 'MQTT 编辑下一个字段', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Tab', when: (ctx) => ctx.layerIds.includes('mqtt-editor'), run: () => moveMqttConfigDraftField(1) })
    actions.register({ id: 'mqtt.config.prevField', title: 'MQTT 编辑上一个字段', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Shift+Tab', when: (ctx) => ctx.layerIds.includes('mqtt-editor'), run: () => moveMqttConfigDraftField(-1) })
    actions.register({ id: 'mqtt.config.subscription.focus', title: '聚焦 MQTT 配置订阅行', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 99, when: (ctx) => ctx.layerIds.includes('mqtt-editor'), run: (_ctx, args) => focusMqttConfigSubscriptionEditor(args) })
    actions.register({ id: 'mqtt.config.subscription.nextRow', title: 'MQTT 配置订阅下移', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 99, shortcut: 'ArrowDown', when: (ctx) => ctx.layerIds.includes('mqtt-editor'), run: () => moveMqttConfigSubscriptionRow(1) })
    actions.register({ id: 'mqtt.config.subscription.prevRow', title: 'MQTT 配置订阅上移', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 99, shortcut: 'ArrowUp', when: (ctx) => ctx.layerIds.includes('mqtt-editor'), run: () => moveMqttConfigSubscriptionRow(-1) })
    actions.register({ id: 'mqtt.config.subscription.deleteRow', title: '删除 MQTT 配置订阅行', group: 'MQTT', risk: 'data-write', scope: 'layer', priority: 99, shortcut: 'Ctrl+Delete', when: (ctx) => ctx.layerIds.includes('mqtt-editor'), run: (_ctx, args) => deleteMqttConfigSubscriptionRow(args) })
    actions.register({ id: 'mqtt.config.publish.focus', title: '聚焦 MQTT 配置发布 topic 行', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 99, when: (ctx) => ctx.layerIds.includes('mqtt-editor'), run: (_ctx, args) => focusMqttConfigPublishEditor(args) })
    actions.register({ id: 'mqtt.config.publish.nextRow', title: 'MQTT 配置发布 topic 下移', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 99, shortcut: 'ArrowDown', when: (ctx) => ctx.layerIds.includes('mqtt-editor'), run: () => moveMqttConfigPublishRow(1) })
    actions.register({ id: 'mqtt.config.publish.prevRow', title: 'MQTT 配置发布 topic 上移', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 99, shortcut: 'ArrowUp', when: (ctx) => ctx.layerIds.includes('mqtt-editor'), run: () => moveMqttConfigPublishRow(-1) })
    actions.register({ id: 'mqtt.config.publish.deleteRow', title: '删除 MQTT 配置发布 topic 行', group: 'MQTT', risk: 'data-write', scope: 'layer', priority: 99, shortcut: 'Ctrl+Delete', when: (ctx) => ctx.layerIds.includes('mqtt-editor'), run: (_ctx, args) => deleteMqttConfigPublishRow(args) })
    actions.register({ id: 'mqtt.record.rename', title: '编辑 MQTT 记录别名', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 94, shortcut: 'F2', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => args?.title || args?.note ? renameSelectedMqttRecord({ title: typeof args.title === 'string' ? args.title : undefined, note: typeof args.note === 'string' ? args.note : undefined }) : beginMqttRecordEdit('rename', args) })
    actions.register({ id: 'mqtt.record.edit', title: '完整编辑 MQTT 记录', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 94, shortcut: 'Shift+F2', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => beginMqttRecordEdit('edit', args) })
    actions.register({ id: 'mqtt.record.edit.save', title: '保存 MQTT 记录编辑', group: 'MQTT', risk: 'data-write', scope: 'layer', priority: 100, shortcut: 'Ctrl+S', when: (ctx) => ctx.layerIds.includes('mqtt-record-editor'), run: (_ctx, args) => saveMqttRecordEditDraft(args) })
    actions.register({ id: 'mqtt.record.edit.cancel', title: '取消 MQTT 记录编辑', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Escape', when: (ctx) => ctx.layerIds.includes('mqtt-record-editor'), run: () => cancelMqttRecordEditDraft() })
    actions.register({ id: 'mqtt.record.edit.nextField', title: 'MQTT 记录编辑下一个字段', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Tab', when: (ctx) => ctx.layerIds.includes('mqtt-record-editor'), run: () => moveMqttRecordEditDraftField(1) })
    actions.register({ id: 'mqtt.record.edit.prevField', title: 'MQTT 记录编辑上一个字段', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Shift+Tab', when: (ctx) => ctx.layerIds.includes('mqtt-record-editor'), run: () => moveMqttRecordEditDraftField(-1) })
    actions.register({ id: 'mqtt.record.delete', title: '删除 MQTT 记录', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 93, shortcut: 'Delete', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => deleteSelectedMqttRecord(args) })
    actions.register({ id: 'mqtt.messages.clearAll', title: '清空 MQTT 消息', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 92, when: (ctx) => ctx.tab === 'mqtt', run: () => clearMqttRecordList('messages') })
    actions.register({ id: 'mqtt.history.clearAll', title: '清空 MQTT 历史', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 92, when: (ctx) => ctx.tab === 'mqtt', run: () => clearMqttRecordList('history') })
    actions.register({ id: 'mqtt.log.delete', title: '删除当前 MQTT 日志', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 93, when: (ctx) => ctx.tab === 'mqtt', run: () => deleteSelectedMqttLog() })
    actions.register({ id: 'mqtt.log.clearCurrentConfig', title: '清空当前连接 MQTT 日志', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 92, when: (ctx) => ctx.tab === 'mqtt', run: () => clearMqttLogs('current') })
    actions.register({ id: 'mqtt.log.clearAll', title: '清空全部 MQTT 日志', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, when: (ctx) => ctx.tab === 'mqtt', run: () => clearMqttLogs('all') })
    actions.register({ id: 'mqtt.subscription.add', title: '新增 MQTT 订阅', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 92, shortcut: 'Ctrl+T', when: (ctx) => ctx.tab === 'mqtt', run: () => beginMqttSubscriptionDraft(true) })
    actions.register({ id: 'mqtt.subscription.editor.open', title: '管理 MQTT 订阅', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 92, shortcut: 'F2', when: (ctx) => ctx.tab === 'mqtt', run: () => beginMqttSubscriptionDraft(false) })
    actions.register({ id: 'mqtt.subscription.editor.save', title: '保存 MQTT 订阅编辑', group: 'MQTT', risk: 'data-write', scope: 'layer', priority: 100, shortcut: 'Ctrl+S', when: (ctx) => ctx.layerIds.includes('mqtt-subscription-editor'), run: () => saveMqttSubscriptionDraft() })
    actions.register({ id: 'mqtt.subscription.editor.cancel', title: '取消 MQTT 订阅编辑', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Escape', when: (ctx) => ctx.layerIds.includes('mqtt-subscription-editor'), run: () => cancelMqttSubscriptionDraft() })
    actions.register({ id: 'mqtt.subscription.editor.nextField', title: 'MQTT 订阅编辑下一个字段', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Tab', when: (ctx) => ctx.layerIds.includes('mqtt-subscription-editor'), run: () => moveMqttSubscriptionDraftField(1) })
    actions.register({ id: 'mqtt.subscription.editor.prevField', title: 'MQTT 订阅编辑上一个字段', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Shift+Tab', when: (ctx) => ctx.layerIds.includes('mqtt-subscription-editor'), run: () => moveMqttSubscriptionDraftField(-1) })
    actions.register({ id: 'mqtt.subscription.editor.nextRow', title: 'MQTT 订阅编辑下移', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'ArrowDown', when: (ctx) => ctx.layerIds.includes('mqtt-subscription-editor'), run: () => moveMqttSubscriptionDraftRow(1) })
    actions.register({ id: 'mqtt.subscription.editor.prevRow', title: 'MQTT 订阅编辑上移', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'ArrowUp', when: (ctx) => ctx.layerIds.includes('mqtt-subscription-editor'), run: () => moveMqttSubscriptionDraftRow(-1) })
    actions.register({ id: 'mqtt.subscription.editor.deleteRow', title: '删除 MQTT 订阅编辑行', group: 'MQTT', risk: 'data-write', scope: 'layer', priority: 100, shortcut: 'Ctrl+Delete', when: (ctx) => ctx.layerIds.includes('mqtt-subscription-editor'), run: (_ctx, args) => deleteMqttSubscriptionDraftRow(args) })
    actions.register({ id: 'mqtt.pane.next', title: '切换 MQTT 区域', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 93, shortcut: 'Tab', when: (ctx) => ctx.tab === 'mqtt', run: () => moveMqttPane(1) })
    actions.register({ id: 'mqtt.pane.prev', title: '反向切换 MQTT 区域', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 93, shortcut: 'Shift+Tab', when: (ctx) => ctx.tab === 'mqtt', run: () => moveMqttPane(-1) })
    actions.register({ id: 'mqtt.subscription.panel.toggle', title: '折叠/展开 MQTT 订阅栏', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 92, shortcut: 'Ctrl+Shift+T', when: (ctx) => ctx.tab === 'mqtt', run: () => {
      mqttSubscriptionPanelOpen = !mqttSubscriptionPanelOpen
      closeMqttCommandFocusSurfaces()
      activeMqttPane = mqttSubscriptionPanelOpen ? 'subscriptions' : 'messages'
      requestMqttFocus(mqttSubscriptionPanelOpen ? 'subscriptions' : 'records')
      persistMqttLayoutPrefs()
      notify()
      return true
    } })
    actions.register({ id: 'mqtt.subscription.select', title: '选择 MQTT 订阅筛选', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 92, when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => selectMqttSubscription(typeof args?.topic === 'string' ? args.topic : null) })
    actions.register({ id: 'mqtt.subscription.focus', title: '聚焦 MQTT 订阅', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => focusMqttSubscription(typeof args?.topic === 'string' ? args.topic : null) })
    actions.register({ id: 'mqtt.subscription.toggleSelect', title: '多选 MQTT 订阅', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'Space', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => toggleMqttSubscriptionSelection(mqttSubscriptionTopicFromArgs(args) || undefined) })
    actions.register({ id: 'mqtt.subscription.applyFilter', title: '应用 MQTT 订阅筛选', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'Enter', when: (ctx) => ctx.tab === 'mqtt', run: () => applyMqttSubscriptionFilter() })
    actions.register({ id: 'mqtt.subscription.copyTopic', title: '复制 MQTT 订阅 topic', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'Ctrl+C', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => copyMqttSubscriptionTopic(args) })
    actions.register({ id: 'mqtt.subscription.useAsPublishTopic', title: '填入 MQTT 发布 topic', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'Ctrl+Enter', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => useMqttSubscriptionAsPublishTopic(args) })
    actions.register({ id: 'mqtt.subscription.delete', title: '删除当前 MQTT 订阅', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 91, shortcut: 'Delete', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => deleteFocusedMqttSubscription(mqttSubscriptionTopicFromArgs(args) || undefined) })
    actions.register({ id: 'mqtt.subscription.deleteSelected', title: '删除选中 MQTT 订阅', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 90, shortcut: 'Ctrl+Delete', when: (ctx) => ctx.tab === 'mqtt', run: () => deleteSelectedMqttSubscriptions() })
    actions.register({ id: 'mqtt.subscription.clearAll', title: '清空 MQTT 订阅', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 89, when: (ctx) => ctx.tab === 'mqtt', run: () => clearAllMqttSubscriptions() })
    actions.register({ id: 'mqtt.layout.toggle', title: '切换 MQTT 收发布局', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'Ctrl+Shift+S', when: (ctx) => ctx.tab === 'mqtt', run: () => { setMqttWorkspaceLayout(mqttWorkspaceLayout === 'stack' ? 'split' : 'stack'); notify(); return true } })
    actions.register({ id: 'mqtt.layout.resize', title: '调整 MQTT 收发比例', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => resizeMqttLayout(args) })
    actions.register({ id: 'mqtt.layout.reset', title: '重置 MQTT 收发比例', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => resetMqttLayoutRatio(args) })
    actions.register({ id: 'tool.preview.hover.update', title: '更新工具悬浮预览设置', group: '工具系统', risk: 'normal', scope: 'global', priority: 91, when: () => true, run: (_ctx, args) => updateToolPreviewPrefs(args) })
    actions.register({ id: 'mqtt.log.drawer.open', title: '打开 MQTT 日志抽屉', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, when: (ctx) => ctx.tab === 'mqtt', run: () => { mqttLogDrawer = { open: true }; notify(); return true } })
    actions.register({ id: 'mqtt.log.drawer.close', title: '关闭 MQTT 日志抽屉', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 91, shortcut: 'Escape', when: (ctx) => ctx.layerIds.includes('mqtt-log-drawer'), run: () => { mqttLogDrawer = { open: false }; notify(); return true } })
    actions.register({ id: 'mqtt.receive.filter.all', title: 'MQTT 接收筛选全部', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'Ctrl+1', when: (ctx) => ctx.tab === 'mqtt', run: () => { mqttReceiveFilter = 'all'; focusMqttRecordList('messages'); return true } })
    actions.register({ id: 'mqtt.receive.filter.in', title: 'MQTT 接收筛选已接收', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'Ctrl+2', when: (ctx) => ctx.tab === 'mqtt', run: () => { mqttReceiveFilter = 'incoming'; focusMqttRecordList('messages'); return true } })
    actions.register({ id: 'mqtt.receive.filter.out', title: 'MQTT 接收筛选已发送', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'Ctrl+3', when: (ctx) => ctx.tab === 'mqtt', run: () => { mqttReceiveFilter = 'outgoing'; focusMqttRecordList('messages'); return true } })
    actions.register({ id: 'mqtt.topicFilter.focus', title: '聚焦 MQTT topic 筛选', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'Ctrl+Shift+F', when: (ctx) => ctx.tab === 'mqtt', run: () => focusMqttTopicFilter() })
    actions.register({ id: 'mqtt.topicFilter.search.set', title: '更新 MQTT topic 筛选搜索', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => setMqttTopicFilterSearch(args) })
    actions.register({ id: 'mqtt.topicFilter.next', title: 'MQTT topic 筛选下移', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'ArrowDown', when: (ctx) => ctx.tab === 'mqtt', run: () => moveMqttTopicFilter(1) })
    actions.register({ id: 'mqtt.topicFilter.prev', title: 'MQTT topic 筛选上移', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'ArrowUp', when: (ctx) => ctx.tab === 'mqtt', run: () => moveMqttTopicFilter(-1) })
    actions.register({ id: 'mqtt.topicFilter.select', title: '选择 MQTT topic 筛选', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'Enter', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => selectMqttTopicFilter(args) })
    actions.register({ id: 'mqtt.topicFilter.close', title: '关闭 MQTT topic 筛选', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'Escape', when: (ctx) => ctx.tab === 'mqtt', run: () => closeMqttTopicFilter() })
    actions.register({ id: 'mqtt.publish.send', title: '发送 MQTT 消息', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 100, shortcut: 'Ctrl+Enter', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => sendMqttPublishDraft(args) })
    actions.register({ id: 'mqtt.publish.draft.toggle', title: '打开/关闭 MQTT 发送草稿', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'Ctrl+H', when: (ctx) => ctx.tab === 'mqtt', run: () => toggleMqttPublishDraftHistory() })
    actions.register({ id: 'mqtt.publish.records.toggle', title: '打开/关闭 MQTT 发送草稿', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 90, when: (ctx) => ctx.tab === 'mqtt', run: () => toggleMqttPublishDraftHistory() })
    actions.register({ id: 'mqtt.publish.draft.saveDraft', title: '保存当前 MQTT 发送草稿', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 91, shortcut: 'Ctrl+Shift+H', when: (ctx) => ctx.tab === 'mqtt', run: () => saveCurrentMqttPublishDraftHistory() })
    actions.register({ id: 'mqtt.publish.draft.close', title: '关闭 MQTT 发送草稿', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 91, shortcut: 'Escape', when: (ctx) => ctx.layerIds.includes('mqtt-publish-draft'), run: () => closeMqttPublishDraftHistory() })
    actions.register({ id: 'mqtt.publish.draft.next', title: 'MQTT 发送草稿下移', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 91, shortcut: 'ArrowDown', when: (ctx) => ctx.layerIds.includes('mqtt-publish-draft'), run: () => moveMqttPublishDraftHistory(1) })
    actions.register({ id: 'mqtt.publish.draft.prev', title: 'MQTT 发送草稿上移', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 91, shortcut: 'ArrowUp', when: (ctx) => ctx.layerIds.includes('mqtt-publish-draft'), run: () => moveMqttPublishDraftHistory(-1) })
    actions.register({ id: 'mqtt.publish.draft.apply', title: '应用 MQTT 发送草稿', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 91, shortcut: 'Enter', when: (ctx) => ctx.layerIds.includes('mqtt-publish-draft'), run: (_ctx, args) => applyMqttPublishDraftHistory(args) })
    actions.register({ id: 'mqtt.publish.draft.send', title: '发送 MQTT 发送草稿', group: 'MQTT', risk: 'data-write', scope: 'layer', priority: 91, shortcut: 'Ctrl+Enter', when: (ctx) => ctx.layerIds.includes('mqtt-publish-draft'), run: (_ctx, args) => sendMqttPublishDraftHistory(args) })
    actions.register({ id: 'mqtt.publish.draft.toggleSelect', title: '多选 MQTT 发送草稿', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 91, shortcut: 'Space', when: (ctx) => ctx.layerIds.includes('mqtt-publish-draft'), run: (_ctx, args) => toggleMqttPublishDraftHistorySelection(args) })
    actions.register({ id: 'mqtt.publish.draft.focus', title: '聚焦 MQTT 发送草稿项', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 91, when: (ctx) => ctx.layerIds.includes('mqtt-publish-draft'), run: (_ctx, args) => focusMqttPublishDraftHistory(args) })
    actions.register({ id: 'mqtt.publish.draft.favorite', title: '收藏 MQTT 发送草稿', group: 'MQTT', risk: 'data-write', scope: 'layer', priority: 91, shortcut: 'Ctrl+S', when: (ctx) => ctx.layerIds.includes('mqtt-publish-draft'), run: (_ctx, args) => favoriteMqttPublishDraftHistory(args) })
    actions.register({ id: 'mqtt.publish.draft.edit', title: '完整编辑 MQTT 发送草稿', group: 'MQTT', risk: 'data-write', scope: 'layer', priority: 91, shortcut: 'Shift+F2', when: (ctx) => ctx.layerIds.includes('mqtt-publish-draft'), run: (_ctx, args) => beginMqttPublishDraftHistoryEdit('edit', args) })
    actions.register({ id: 'mqtt.publish.draft.rename', title: '编辑 MQTT 发送草稿别名', group: 'MQTT', risk: 'data-write', scope: 'layer', priority: 91, shortcut: 'F2', when: (ctx) => ctx.layerIds.includes('mqtt-publish-draft'), run: (_ctx, args) => beginMqttPublishDraftHistoryEdit('rename', args) })
    actions.register({ id: 'mqtt.publish.draft.edit.save', title: '保存 MQTT 发送草稿编辑', group: 'MQTT', risk: 'data-write', scope: 'layer', priority: 92, shortcut: 'Ctrl+S', when: (ctx) => ctx.layerIds.includes('mqtt-publish-draft-editor'), run: () => saveMqttPublishDraftHistoryEditDraft() })
    actions.register({ id: 'mqtt.publish.draft.edit.cancel', title: '取消 MQTT 发送草稿编辑', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 92, shortcut: 'Escape', when: (ctx) => ctx.layerIds.includes('mqtt-publish-draft-editor'), run: () => cancelMqttPublishDraftHistoryEditDraft() })
    actions.register({ id: 'mqtt.publish.draft.edit.nextField', title: 'MQTT 发送草稿编辑下一个字段', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 92, shortcut: 'Tab', when: (ctx) => ctx.layerIds.includes('mqtt-publish-draft-editor'), run: () => moveMqttPublishDraftHistoryEditField(1) })
    actions.register({ id: 'mqtt.publish.draft.edit.prevField', title: 'MQTT 发送草稿编辑上一个字段', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 92, shortcut: 'Shift+Tab', when: (ctx) => ctx.layerIds.includes('mqtt-publish-draft-editor'), run: () => moveMqttPublishDraftHistoryEditField(-1) })
    actions.register({ id: 'mqtt.publish.draft.delete', title: '删除 MQTT 发送草稿', group: 'MQTT', risk: 'data-write', scope: 'layer', priority: 91, shortcut: 'Delete', when: (ctx) => ctx.layerIds.includes('mqtt-publish-draft'), run: (_ctx, args) => deleteMqttPublishDraftHistoryEntry(args) })
    actions.register({ id: 'mqtt.publish.draft.clear', title: '清空 MQTT 发送草稿', group: 'MQTT', risk: 'data-write', scope: 'layer', priority: 90, when: (ctx) => ctx.layerIds.includes('mqtt-publish-draft'), run: () => clearCurrentMqttPublishDraftHistory() })
    actions.register({ id: 'mqtt.focus.messages', title: '聚焦 MQTT 消息区', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, when: (ctx) => ctx.tab === 'mqtt', run: () => focusMqttRecordList('messages') })
    actions.register({ id: 'mqtt.focus.templates', title: '聚焦 MQTT 收藏区', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'Ctrl+M', when: (ctx) => ctx.tab === 'mqtt', run: () => focusMqttRecordList('templates') })
    actions.register({ id: 'mqtt.focus.publish', title: '聚焦 MQTT 发送区', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'Ctrl+P', when: (ctx) => ctx.tab === 'mqtt', run: () => focusMqttPublishEditor() })
    actions.register({ id: 'mqtt.publish.blur', title: '退出 MQTT 发送编辑', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'Escape', when: (ctx) => ctx.tab === 'mqtt', run: () => blurMqttPublishEditor() })
    actions.register({ id: 'mqtt.publish.nextField', title: 'MQTT 发送编辑下一个字段', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'Tab', when: (ctx) => ctx.tab === 'mqtt', run: () => moveMqttPublishField(1) })
    actions.register({ id: 'mqtt.publish.prevField', title: 'MQTT 发送编辑上一个字段', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'Shift+Tab', when: (ctx) => ctx.tab === 'mqtt', run: () => moveMqttPublishField(-1) })
    actions.register({ id: 'mqtt.publish.options.open', title: '编辑 MQTT 发送选项', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, when: (ctx) => ctx.tab === 'mqtt', run: () => openMqttPublishOptions() })
    actions.register({ id: 'mqtt.publish.options.close', title: '关闭 MQTT 发送选项', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'Escape', when: (ctx) => ctx.tab === 'mqtt', run: () => closeMqttPublishOptions() })
    actions.register({ id: 'mqtt.publish.options.next', title: 'MQTT 发送选项下移', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'ArrowDown', when: (ctx) => ctx.tab === 'mqtt', run: () => moveMqttPublishOptions(1) })
    actions.register({ id: 'mqtt.publish.options.prev', title: 'MQTT 发送选项上移', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'ArrowUp', when: (ctx) => ctx.tab === 'mqtt', run: () => moveMqttPublishOptions(-1) })
    actions.register({ id: 'mqtt.publish.options.select', title: '选择 MQTT 发送选项', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'Enter', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => selectMqttPublishOption(args) })
    actions.register({ id: 'mqtt.record.focus', title: '聚焦 MQTT 记录', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => focusMqttRecordFromArgs(args) })
    actions.register({ id: 'mqtt.template.search.set', title: '筛选 MQTT 模板', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => setMqttTemplateSearch(args) })
    actions.register({ id: 'mqtt.history.search.set', title: '筛选 MQTT 历史', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => setMqttHistorySearch(args) })
    actions.register({ id: 'mqtt.publish.template.save', title: '保存 MQTT 发送模板', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 90, when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => saveCurrentMqttPublishTemplate(args) })
    actions.register({ id: 'mqtt.publish.template.apply', title: '应用 MQTT 发送模板', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 90, when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => applyMqttPublishTemplate(mqttPublishTemplateIdFromArgs(args)) })
    actions.register({ id: 'mqtt.publish.template.send', title: '直接发送 MQTT 模板', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 90, when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => sendMqttPublishTemplate(mqttPublishTemplateIdFromArgs(args)) })
    actions.register({ id: 'mqtt.publish.template.rename', title: '重命名 MQTT 发送模板', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 90, when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => renameMqttTemplate(mqttPublishTemplateIdFromArgs(args), args) })
    actions.register({ id: 'mqtt.publish.template.delete', title: '删除 MQTT 发送模板', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 90, when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => deleteMqttTemplate(mqttPublishTemplateIdFromArgs(args)) })
    actions.register({ id: 'mqtt.record.resendDraft', title: '从记录填充 MQTT 发布草稿', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 90, shortcut: 'Enter', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => fillMqttPublishDraftFromSelection(args) })
    actions.register({ id: 'mqtt.record.repeatSend', title: '重复发送 MQTT 记录', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 90, when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => repeatMqttPublishRecords(args) })
    actions.register({ id: 'mqtt.record.toggleSelect', title: '多选 MQTT 发送记录', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 90, when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => toggleMqttRecordSelectionFromArgs(args) })
    actions.register({ id: 'mqtt.record.copyTopic', title: '复制 MQTT topic', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 89, shortcut: 'Ctrl+Shift+C', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => copyMqttRecordTopic(args) })
    actions.register({ id: 'mqtt.record.copyPayload', title: '复制 MQTT payload', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 89, shortcut: 'Ctrl+C', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => copyMqttRecordPayload(args) })
    actions.register({ id: 'mqtt.record.favorite', title: '收藏/取消收藏 MQTT 消息', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 89, shortcut: 'Ctrl+S', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => toggleMqttRecordFavorite(args) })
    actions.register({ id: 'mqtt.record.favorite.save', title: '保存 MQTT 消息收藏', group: 'MQTT', risk: 'data-write', scope: 'layer', priority: 100, shortcut: 'Ctrl+S', when: (ctx) => ctx.layerIds.includes('mqtt-favorite-editor'), run: (_ctx, args) => saveMqttFavoriteDraft(args) })
    actions.register({ id: 'mqtt.record.favorite.cancel', title: '取消 MQTT 消息收藏', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Escape', when: (ctx) => ctx.layerIds.includes('mqtt-favorite-editor'), run: () => cancelMqttFavoriteDraft() })
    actions.register({ id: 'mqtt.record.favorite.nextField', title: 'MQTT 收藏下一个字段', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Tab', when: (ctx) => ctx.layerIds.includes('mqtt-favorite-editor'), run: () => { if (!mqttFavoriteDraft) return false; mqttFavoriteDraft = { ...mqttFavoriteDraft, activeField: 'title' }; notify(); return true } })
    actions.register({ id: 'mqtt.record.favorite.prevField', title: 'MQTT 收藏上一个字段', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Shift+Tab', when: (ctx) => ctx.layerIds.includes('mqtt-favorite-editor'), run: () => { if (!mqttFavoriteDraft) return false; mqttFavoriteDraft = { ...mqttFavoriteDraft, activeField: 'title' }; notify(); return true } })
    actions.register({ id: 'mqtt.preview.open', title: '打开 MQTT 预览', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 88, shortcut: 'Ctrl+I', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => openMqttPreview(args) })
    actions.register({ id: 'mqtt.preview.close', title: '关闭 MQTT 预览', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Escape', when: (ctx) => ctx.layerIds.includes('mqtt-preview'), run: () => closeMqttPreview() })
    actions.register({ id: 'mqtt.preview.scroll.up', title: 'MQTT 预览上滚', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Shift+ArrowUp', when: (ctx) => ctx.layerIds.includes('mqtt-preview'), run: () => scrollMqttPreview(-1) })
    actions.register({ id: 'mqtt.preview.scroll.down', title: 'MQTT 预览下滚', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Shift+ArrowDown', when: (ctx) => ctx.layerIds.includes('mqtt-preview'), run: () => scrollMqttPreview(1) })
    actions.register({ id: 'mqtt.preview.scroll.set', title: '同步 MQTT 预览滚动', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 99, when: (ctx) => ctx.layerIds.includes('mqtt-preview'), run: (_ctx, args) => setMqttPreviewScroll(args) })
    actions.register({ id: 'mqtt.search.focus', title: '聚焦 MQTT 搜索', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 99, shortcut: 'Ctrl+F', when: (ctx) => ctx.tab === 'mqtt', run: () => {
      searchFocusTarget = activeMqttRecordList === 'templates'
        ? 'mqtt-templates'
        : activeMqttRecordList === 'history'
          ? 'mqtt-history'
          : 'mqtt'
      searchFocusRequestId += 1
      notify()
      return true
    } })
    actions.register({ id: 'mqtt.search.blur', title: '退出 MQTT 搜索', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 99, shortcut: 'Escape', when: (ctx) => ctx.tab === 'mqtt', run: () => blurSearchFocus() })
    actions.register({ id: 'mqtt.panel.toggle', title: '折叠/展开 MQTT 侧栏', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 98, shortcut: 'Ctrl+Shift+W', when: (ctx) => ctx.tab === 'mqtt', run: () => {
      mqttPanelOpen = !mqttPanelOpen
      closeMqttCommandFocusSurfaces()
      activeMqttPane = mqttPanelOpen ? 'connections' : 'messages'
      requestMqttFocus(mqttPanelOpen ? 'connections' : 'records')
      persistMqttLayoutPrefs()
      notify()
      return true
    } })
    actions.register({ id: 'mqtt.detail.open', title: '打开 MQTT 详情', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 90, shortcut: 'Ctrl+ArrowLeft', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => openMqttDrawer(false, args) })
    actions.register({ id: 'mqtt.detail.close', title: '关闭 MQTT 详情', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 90, when: (ctx) => ctx.layerIds.includes('mqtt-detail'), run: () => closeMqttDrawer() })
    actions.register({ id: 'mqtt.drawer.open', title: '打开 MQTT 动作抽屉', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 90, shortcut: 'Ctrl+ArrowRight', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => openMqttDrawer(true, args) })
    actions.register({ id: 'mqtt.drawer.close', title: '关闭 MQTT 动作抽屉', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 90, when: (ctx) => ctx.layerIds.includes('mqtt-drawer') || ctx.layerIds.includes('mqtt-detail'), run: () => closeMqttDrawer() })
    actions.register({ id: 'mqtt.drawer.next', title: 'MQTT 抽屉内下移', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 90, shortcut: 'ArrowDown', when: (ctx) => ctx.tab === 'mqtt', run: () => moveMqttDrawer(1) })
    actions.register({ id: 'mqtt.drawer.prev', title: 'MQTT 抽屉内上移', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 90, shortcut: 'ArrowUp', when: (ctx) => ctx.tab === 'mqtt', run: () => moveMqttDrawer(-1) })
    actions.register({ id: 'mqtt.drawer.select', title: '执行 MQTT 抽屉当前动作', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 90, shortcut: 'Enter', when: (ctx) => ctx.tab === 'mqtt', run: () => executeMqttDrawerItem() })
    for (let index = 1; index <= 9; index += 1) {
      actions.register({
        id: `mqtt.drawer.select.${index}`,
        title: `执行 MQTT 抽屉第 ${index} 个动作`,
        group: 'MQTT',
        risk: 'normal',
        scope: 'layer',
        priority: 80 - index,
        shortcut: `Ctrl+${index}`,
        when: (ctx) => ctx.tab === 'mqtt',
        run: () => executeMqttDrawerItem(index - 1)
      })
      actions.register({
        id: `mqtt.drawer.action.${index}`,
        title: `直接执行第 ${index} 个 MQTT 动作`,
        group: 'MQTT',
        risk: 'normal',
        scope: 'tab',
        priority: 70 - index,
        shortcut: `Ctrl+Alt+${index}`,
        when: (ctx) => ctx.tab === 'mqtt',
        run: () => executeMqttDrawerItem(index - 1, true)
      })
    }
    actions.register({ id: 'favorites.pane.toggleNext', title: '切换收藏栏', group: '收藏', risk: 'normal', scope: 'tab', priority: 100, shortcut: 'Tab', when: (ctx) => ctx.tab === 'favorites' && !ctx.favoriteQuickMode, run: () => cycleFavoritePane(1) })
    actions.register({ id: 'favorites.pane.togglePrev', title: '反向切换收藏栏', group: '收藏', risk: 'normal', scope: 'tab', priority: 100, shortcut: 'Shift+Tab', when: (ctx) => ctx.tab === 'favorites' && !ctx.favoriteQuickMode, run: () => cycleFavoritePane(-1) })
    actions.register({ id: 'favorites.search.focus', title: '聚焦收藏搜索', group: '收藏', risk: 'normal', scope: 'tab', priority: 99, shortcut: 'Ctrl+F', when: (ctx) => ctx.tab === 'favorites', run: () => focusFavoriteSearch() })
    actions.register({ id: 'favorites.groupSearch.focus', title: '聚焦收藏分组搜索', group: '收藏', risk: 'normal', scope: 'tab', priority: 99, shortcut: 'Ctrl+Shift+F', when: (ctx) => ctx.tab === 'favorites' && !ctx.favoriteQuickMode, run: () => focusFavoriteGroupSearch() })
    actions.register({ id: 'favorites.group.apply', title: '应用收藏容器', group: '收藏', risk: 'normal', scope: 'tab', priority: 100, shortcut: 'Enter', when: (ctx) => ctx.tab === 'favorites', run: (_ctx, args) => applyFocusedFavoriteContainer(favoriteIdFromArgs(args) || focusedFavoriteGroupId) })
    actions.register({ id: 'favorites.target.create', title: '新增收藏目标', group: '收藏', risk: 'data-write', scope: 'tab', priority: 95, shortcut: 'Ctrl+N', when: (ctx) => ctx.tab === 'favorites' && !ctx.favoriteQuickMode, run: (_ctx, args) => { if (favoriteIdFromArgs(args)) focusFavoriteActionTarget(args, true); favoriteAddMenuOpen = false; return beginFavoriteDraft('create-target') } })
    actions.register({ id: 'favorites.group.create', title: '新增收藏分组', group: '收藏', risk: 'data-write', scope: 'tab', priority: 95, shortcut: 'Ctrl+G', when: (ctx) => ctx.tab === 'favorites' && !ctx.favoriteQuickMode, run: (_ctx, args) => { if (favoriteIdFromArgs(args)) focusFavoriteActionTarget(args, true); favoriteAddMenuOpen = false; return beginFavoriteDraft('create-group') } })
    actions.register({ id: 'favorites.group.moveParent', title: '移动收藏父级', group: '收藏', risk: 'data-write', scope: 'tab', priority: 95, shortcut: 'Ctrl+F2', when: (ctx) => ctx.tab === 'favorites' && !ctx.favoriteQuickMode, run: (_ctx, args) => beginFavoriteDraft('move-parent', args) })
    actions.register({ id: 'favorites.group.collapse', title: '折叠收藏分组', group: '收藏', risk: 'normal', scope: 'tab', priority: 95, shortcut: 'ArrowLeft', when: (ctx) => ctx.tab === 'favorites', run: () => { if (!focusedFavoriteGroupId) return false; state.collapsedFavoriteGroupIds = [...new Set([...state.collapsedFavoriteGroupIds, focusedFavoriteGroupId])]; save(); notify(); return true } })
    actions.register({ id: 'favorites.group.expand', title: '展开收藏分组', group: '收藏', risk: 'normal', scope: 'tab', priority: 95, shortcut: 'ArrowRight', when: (ctx) => ctx.tab === 'favorites', run: () => { if (!focusedFavoriteGroupId) return false; state.collapsedFavoriteGroupIds = state.collapsedFavoriteGroupIds.filter((id) => id !== focusedFavoriteGroupId); save(); notify(); return true } })
    actions.register({ id: 'favorites.open', title: '打开收藏', group: '收藏', risk: 'normal', scope: 'tab', priority: 100, shortcut: 'Enter', when: (ctx) => ctx.tab === 'favorites' && favoriteCapabilities.open, run: (_ctx, args) => { if (favoriteActionTargetKind(args) === 'directory') void openDirectoryTargets(directoryPathsFromArgs(args)); else void openFavorite(args); return true } })
    actions.register({ id: 'favorites.reveal', title: '定位收藏', group: '收藏', risk: 'normal', scope: 'tab', priority: 100, shortcut: 'Ctrl+Enter', when: (ctx) => ctx.tab === 'favorites' && favoriteCapabilities.reveal, run: (_ctx, args) => { if (favoriteActionTargetKind(args) === 'directory') void revealDirectoryTargets(directoryPathsFromArgs(args)); else void revealFavorite(args); return true } })
    actions.register({ id: 'favorites.copyPath', title: '复制收藏路径', group: '收藏', risk: 'normal', scope: 'tab', priority: 95, when: (ctx) => ctx.tab === 'favorites' && favoriteCapabilities.copyPath, run: (_ctx, args) => { if (favoriteActionTargetKind(args) === 'directory') void copyDirectoryTargetPaths(directoryPathsFromArgs(args)); else void copyFavoritePath(args); return true } })
    actions.register({ id: 'favorites.copyItems', title: '复制真实文件或文件夹', group: '收藏', risk: 'normal', scope: 'tab', priority: 95, shortcut: 'Ctrl+Shift+C', when: (ctx) => ctx.tab === 'favorites' && Boolean(platform.files.capabilities?.copyItems), run: (_ctx, args) => { void copyFavoriteItems(args); return true } })
    actions.register({ id: 'favorites.pick.files', title: '选择文件并审核收藏', group: '收藏', risk: 'data-write', scope: 'tab', priority: 95, shortcut: 'Ctrl+O', when: (ctx) => ctx.tab === 'favorites' && !ctx.favoriteQuickMode && favoriteCapabilities.pickFiles, run: () => { favoriteAddMenuOpen = false; void pickFavoritesForReview('file'); return true } })
    actions.register({ id: 'favorites.pick.folders', title: '选择文件夹并审核收藏', group: '收藏', risk: 'data-write', scope: 'tab', priority: 94, shortcut: 'Ctrl+Shift+O', when: (ctx) => ctx.tab === 'favorites' && !ctx.favoriteQuickMode && favoriteCapabilities.pickFolders, run: () => { favoriteAddMenuOpen = false; void pickFavoritesForReview('folder'); return true } })
    actions.register({ id: 'favorites.draft.pickPath', title: '为收藏草稿选择路径', group: '收藏', risk: 'normal', scope: 'layer', priority: 96, when: (ctx) => ctx.tab === 'favorites' && ctx.layerIds.includes('favorites-editor'), run: (_ctx, args) => { void pickFavoriteDraftPath(favoritePickKindFromArgs(args)); return true } })
    actions.register({ id: 'favorites.add.duplicateFocus', title: '定位重复收藏', group: '收藏', risk: 'normal', scope: 'tab', priority: 80, when: (ctx) => ctx.tab === 'favorites' && !ctx.favoriteQuickMode, run: (_ctx, args) => focusDuplicateFavorite(typeof args?.id === 'string' ? args.id : null) })
    actions.register({ id: 'favorites.remove', title: '移出收藏', group: '收藏', risk: 'data-write', scope: 'tab', priority: 100, when: (ctx) => ctx.tab === 'favorites' && !ctx.favoriteQuickMode, run: (_ctx, args) => removeFavorite(selectedFavoriteMetadataIds(args)) })
    actions.register({ id: 'favorites.remove.force', title: '直接移出收藏元数据', group: '收藏', risk: 'destructive', scope: 'tab', priority: 100, when: (ctx) => ctx.tab === 'favorites' && !ctx.favoriteQuickMode, run: (_ctx, args) => removeFavoriteNow(selectedFavoriteMetadataIds(args)) })
    actions.register({ id: 'favorites.reorder', title: '调整收藏顺序', group: '收藏', risk: 'data-write', scope: 'row', priority: 100, when: (ctx) => ctx.tab === 'favorites' && !ctx.favoriteQuickMode, run: (_ctx, args) => reorderFavoriteMetadata(String(args?.nodeId || ''), typeof args?.parentId === 'string' ? args.parentId : null, typeof args?.beforeNodeId === 'string' ? args.beforeNodeId : null) })
    actions.register({ id: 'favorites.remove.undo', title: '撤销移出收藏', group: '收藏', risk: 'data-write', scope: 'tab', priority: 101, shortcut: 'Ctrl+Z', when: (ctx) => ctx.tab === 'favorites' && !ctx.favoriteQuickMode && Boolean(favoriteRemovalUndo?.removed.length), run: () => undoFavoriteRemoval() })
    actions.register({ id: 'favorites.edit', title: '编辑收藏', group: '收藏', risk: 'data-write', scope: 'tab', priority: 95, shortcut: 'F2', when: (ctx) => ctx.tab === 'favorites' && !ctx.favoriteQuickMode, run: (_ctx, args) => beginFavoriteDraft('edit', args) })
    actions.register({ id: 'favorites.rename', title: '重命名收藏', group: '收藏', risk: 'data-write', scope: 'tab', priority: 95, shortcut: 'Shift+F2', when: (ctx) => ctx.tab === 'favorites' && !ctx.favoriteQuickMode, run: (_ctx, args) => beginFavoriteDraft('rename', args) })
    actions.register({ id: 'favorites.refresh', title: '刷新目录和路径状态', group: '收藏', risk: 'normal', scope: 'tab', priority: 96, shortcut: 'Ctrl+R', when: (ctx) => ctx.tab === 'favorites', run: () => { void loadSelectedFavoriteDirectory(); void refreshFavoritePathInspections(); return true } })
    actions.register({ id: 'favorites.containers.togglePanel', title: '展开或收起收藏容器栏', group: '收藏', risk: 'normal', scope: 'tab', priority: 96, shortcut: 'Ctrl+Shift+W', when: (ctx) => ctx.tab === 'favorites' && !ctx.favoriteQuickMode, run: () => { favoriteContainerPanelOpen = !favoriteContainerPanelOpen; activeFavoritePane = favoriteContainerPanelOpen ? 'containers' : 'items'; notify(); return true } })
    actions.register({ id: 'favorites.addMenu.toggle', title: '打开或关闭添加菜单', group: '收藏', risk: 'normal', scope: 'tab', priority: 96, when: (ctx) => ctx.tab === 'favorites' && !ctx.favoriteQuickMode, run: () => { favoriteAddMenuOpen = !favoriteAddMenuOpen; notify(); return true } })
    actions.register({ id: 'favorites.addMenu.close', title: '关闭添加菜单', group: '收藏', risk: 'normal', scope: 'layer', priority: 97, when: (ctx) => ctx.tab === 'favorites', run: () => { favoriteAddMenuOpen = false; notify(); return true } })
    actions.register({ id: 'favorites.save', title: '保存收藏编辑', group: '收藏', risk: 'data-write', scope: 'layer', priority: 100, shortcut: 'Ctrl+S', when: (ctx) => ctx.tab === 'favorites' && ctx.layerIds.includes('favorites-editor'), run: () => saveFavoriteDraft() })
    actions.register({ id: 'favorites.edit.nextField', title: '收藏编辑下一个字段', group: '收藏', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Tab', when: (ctx) => ctx.tab === 'favorites' && ctx.layerIds.includes('favorites-editor'), run: () => cycleFavoriteDraftField(1) })
    actions.register({ id: 'favorites.edit.prevField', title: '收藏编辑上一个字段', group: '收藏', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Shift+Tab', when: (ctx) => ctx.tab === 'favorites' && ctx.layerIds.includes('favorites-editor'), run: () => cycleFavoriteDraftField(-1) })
    actions.register({ id: 'favorites.cancel', title: '取消收藏编辑', group: '收藏', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Escape', when: (ctx) => ctx.tab === 'favorites' && ctx.layerIds.includes('favorites-editor'), run: () => { favoriteDraft = null; notify(); return true } })
    actions.register({ id: 'favorites.pickReview.commit', title: '保存点选收藏', group: '收藏', risk: 'data-write', scope: 'layer', priority: 100, shortcut: 'Ctrl+S', when: (ctx) => ctx.tab === 'favorites' && ctx.layerIds.includes('favorites-pick-review'), run: () => commitFavoritePickReview() })
    actions.register({ id: 'favorites.pickReview.cancel', title: '取消点选收藏', group: '收藏', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Escape', when: (ctx) => ctx.tab === 'favorites' && ctx.layerIds.includes('favorites-pick-review'), run: () => cancelFavoritePickReview() })
    actions.register({ id: 'favorites.pickReview.next', title: '点选审核下一个项目', group: '收藏', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Tab', when: (ctx) => ctx.tab === 'favorites' && ctx.layerIds.includes('favorites-pick-review'), run: () => cycleFavoritePickReview(1) })
    actions.register({ id: 'favorites.pickReview.prev', title: '点选审核上一个项目', group: '收藏', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Shift+Tab', when: (ctx) => ctx.tab === 'favorites' && ctx.layerIds.includes('favorites-pick-review'), run: () => cycleFavoritePickReview(-1) })
    actions.register({ id: 'favorites.search.blur', title: '退出收藏搜索焦点', group: '收藏', risk: 'normal', scope: 'layer', priority: 99, shortcut: 'Escape', when: (ctx) => ctx.tab === 'favorites', run: () => blurSearchFocus() })
    actions.register({ id: 'favorites.detail.open', title: '打开收藏详情', description: '展示当前收藏节点或实际目录项详情。', icon: 'detail', group: '收藏', risk: 'normal', scope: 'tab', priority: 96, shortcut: 'Ctrl+ArrowLeft', when: (ctx) => ctx.tab === 'favorites', run: (_ctx, args) => openFavoriteDrawer(false, args) })
    actions.register({ id: 'favorites.detail.close', title: '关闭收藏详情', description: '关闭左侧收藏详情面板。', icon: 'close', group: '收藏', risk: 'normal', scope: 'layer', priority: 96, when: (ctx) => ctx.tab === 'favorites', run: () => closeFavoriteDrawer() })
    actions.register({ id: 'favorites.drawer.open', title: '打开收藏动作抽屉', description: '展示当前收藏节点或实际目录行可执行动作。', icon: 'drawer', group: '收藏', risk: 'normal', scope: 'tab', priority: 96, shortcut: 'Ctrl+ArrowRight', when: (ctx) => ctx.tab === 'favorites', run: (_ctx, args) => openFavoriteDrawer(true, args) })
    actions.register({ id: 'favorites.drawer.close', title: '关闭收藏动作抽屉', description: '关闭右侧收藏动作抽屉。', icon: 'close', group: '收藏', risk: 'normal', scope: 'layer', priority: 96, when: (ctx) => ctx.tab === 'favorites', run: () => closeFavoriteDrawer() })
    actions.register({ id: 'favorites.drawer.next', title: '收藏抽屉下移', description: '移动到下一个收藏抽屉动作。', icon: 'down', group: '收藏', risk: 'normal', scope: 'layer', priority: 96, when: (ctx) => ctx.tab === 'favorites', run: () => moveFavoriteDrawer(1) })
    actions.register({ id: 'favorites.drawer.prev', title: '收藏抽屉上移', description: '移动到上一个收藏抽屉动作。', icon: 'up', group: '收藏', risk: 'normal', scope: 'layer', priority: 96, when: (ctx) => ctx.tab === 'favorites', run: () => moveFavoriteDrawer(-1) })
    actions.register({ id: 'favorites.drawer.select', title: '执行收藏抽屉动作', description: '执行当前高亮的收藏抽屉动作。', icon: 'enter', group: '收藏', risk: 'normal', scope: 'layer', priority: 96, when: (ctx) => ctx.tab === 'favorites', run: () => executeFavoriteDrawerItem() })
    actions.register({ id: 'favorites.directory.open', title: '打开实际目录项', group: '收藏', risk: 'normal', scope: 'row', priority: 92, when: (ctx) => ctx.tab === 'favorites' && !ctx.favoriteQuickMode && favoriteCapabilities.open, run: (_ctx, args) => { void openDirectoryTargets(directoryPathsFromArgs(args)); return true } })
    actions.register({ id: 'favorites.directory.reveal', title: '定位实际目录项', group: '收藏', risk: 'normal', scope: 'row', priority: 92, when: (ctx) => ctx.tab === 'favorites' && !ctx.favoriteQuickMode && favoriteCapabilities.reveal, run: (_ctx, args) => { void revealDirectoryTargets(directoryPathsFromArgs(args)); return true } })
    actions.register({ id: 'favorites.directory.copyPath', title: '复制实际目录项路径', group: '收藏', risk: 'normal', scope: 'row', priority: 92, when: (ctx) => ctx.tab === 'favorites' && !ctx.favoriteQuickMode && favoriteCapabilities.copyPath, run: (_ctx, args) => { void copyDirectoryTargetPaths(directoryPathsFromArgs(args)); return true } })
    actions.register({ id: 'favorites.directory.addSelected', title: '添加实际目录项到收藏', group: '收藏', risk: 'data-write', scope: 'row', priority: 91, when: (ctx) => ctx.tab === 'favorites' && !ctx.favoriteQuickMode, run: (_ctx, args) => addSelectedDirectoryEntries(directoryPathsFromArgs(args)) })
    for (let index = 1; index <= 9; index += 1) {
      actions.register({
        id: `favorites.drawer.select.${index}`,
        title: `执行收藏抽屉第 ${index} 个动作`,
        description: '执行右侧收藏抽屉中的指定序号动作。',
        icon: 'number',
        group: '收藏',
        risk: 'normal',
        scope: 'layer',
        priority: 90 - index,
        shortcut: `Ctrl+${index}`,
        when: (ctx) => ctx.tab === 'favorites',
        run: () => executeFavoriteDrawerItem(index - 1)
      })
    }
    actions.register({ id: 'codex.refresh', title: '刷新 Codex 状态', group: 'Codex', risk: 'normal', scope: 'global', priority: 100, shortcut: 'Ctrl+R', when: () => true, run: () => { void codexController.refresh(); return true } })
    actions.register({ id: 'codex.inspect-environment', title: '检测 Codex 连接环境', group: 'Codex', risk: 'normal', scope: 'global', priority: 99, when: () => true, run: () => { void codexController.inspectEnvironment(); return true } })
    actions.register({ id: 'codex.set-launch-path', title: '设置 Codex CLI 位置', group: 'Codex', risk: 'data-write', scope: 'global', priority: 97, when: () => true, run: (_ctx, args) => {
      const value = args?.path
      if (typeof value !== 'string' || !value.trim()) return false
      void codexController.setLaunchPath(value)
      return true
    } })
    actions.register({ id: 'codex.pick-launch-path', title: '从磁盘选择 Codex CLI', group: 'Codex', risk: 'data-write', scope: 'global', priority: 97, when: () => true, run: () => {
      void (async () => {
        const picked = await platform.files.pickFavorite?.()
        if (!picked) return
        await codexController.setLaunchPath(picked.path)
      })()
      return true
    } })
    actions.register({ id: 'codex.clear-launch-path', title: '恢复 Codex CLI 自动发现', group: 'Codex', risk: 'data-write', scope: 'global', priority: 97, when: () => true, run: () => { void codexController.clearLaunchPath(); return true } })
    actions.register({ id: 'codex.settings.open', title: '打开 Codex 配置', group: 'Codex', risk: 'normal', scope: 'global', priority: 98, when: () => true, run: () => { setTab('codex'); return true } })
    actions.register({ id: 'codex.thread.createFocused', title: '在当前项目新建会话', group: 'Codex', risk: 'normal', scope: 'global', priority: 99, shortcut: 'Ctrl+T', when: () => true, run: () => {
      const enabled = state.codex.settings.floatEnabled || codexController.updateSettings({ floatEnabled: true })
      if (!enabled) return false
      queueMicrotask(() => platform.float.activate?.({ command: 'new-thread' }))
      return true
    } })
    actions.register({ id: 'codex.settings.update', title: '更新 Codex 悬浮球配置', group: 'Codex', risk: 'data-write', scope: 'global', priority: 98, when: () => true, run: (_ctx, args) => {
      const source = args?.settings && typeof args.settings === 'object' ? args.settings : args
      return codexController.updateSettings((source || {}) as Partial<CodexSettings>)
    } })
    actions.register({ id: 'codex.card-colors.preview', title: '预览 Codex 卡片配对颜色', group: 'Codex', risk: 'normal', scope: 'global', priority: 98, when: () => true, run: (_ctx, args) => {
      const colors = args?.colors && typeof args.colors === 'object' ? args.colors : args
      return codexController.previewCardColors((colors || {}) as Partial<CodexSettings['colors']>)
    } })
    actions.register({ id: 'codex.card-colors.cancel', title: '取消 Codex 卡片配色预览', group: 'Codex', risk: 'normal', scope: 'global', priority: 98, when: () => true, run: () => codexController.clearCardColorPreview() })
    actions.register({ id: 'codex.card-colors.commit', title: '应用 Codex 卡片配对颜色', group: 'Codex', risk: 'data-write', scope: 'global', priority: 98, when: () => true, run: (_ctx, args) => {
      const colors = args?.colors && typeof args.colors === 'object' ? args.colors : args
      return codexController.commitCardColors((colors || {}) as Partial<CodexSettings['colors']>)
    } })
    actions.register({ id: 'codex.task.open', title: '打开 Codex 任务', group: 'Codex', risk: 'normal', scope: 'global', priority: 98, when: () => true, run: (_ctx, args) => {
      const key = typeof args?.key === 'string' ? args.key : ''
      const actionAlias = typeof args?.actionAlias === 'string' ? args.actionAlias : ''
      void codexController.openThread(key, actionAlias)
      return Boolean(key && actionAlias)
    } })
    actions.register({ id: 'codex.input.open', title: '打开 Codex 待输入任务', group: 'Codex', risk: 'normal', scope: 'global', priority: 98, when: () => true, run: () => codexController.openFirstInput() })
    actions.register({ id: 'codex.completed-unread.openFirst', title: '打开并标记第一个 Codex 已完成未读任务', group: 'Codex', risk: 'normal', scope: 'global', priority: 98, when: () => true, run: () => codexController.openFirstCompletedUnread() })
    actions.register({ id: 'codex.task.previous', title: '上一个 Codex 任务', group: 'Codex', risk: 'normal', scope: 'global', priority: 98, when: () => true, run: () => codexController.cycleTask(-1) })
    actions.register({ id: 'codex.task.next', title: '下一个 Codex 任务', group: 'Codex', risk: 'normal', scope: 'global', priority: 98, when: () => true, run: () => codexController.cycleTask(1) })
    actions.register({ id: 'codex.task.hide', title: '隐藏 Codex 任务到 Companion 已隐藏区', group: 'Codex', risk: 'data-write', scope: 'global', priority: 97, when: () => true, run: (_ctx, args) => {
      const key = typeof args?.key === 'string' ? args.key : ''
      const revisionAt = typeof args?.revisionAt === 'number' && Number.isFinite(args.revisionAt)
        ? args.revisionAt
        : typeof args?.updatedAt === 'number' && Number.isFinite(args.updatedAt) ? args.updatedAt : undefined
      return key && revisionAt !== undefined ? codexController.hide(key, revisionAt) : false
    } })
    actions.register({ id: 'codex.task.dismiss', title: '隐藏 Codex 任务到 Companion 已隐藏区', group: 'Codex', risk: 'data-write', scope: 'global', priority: 96, when: () => true, run: (_ctx, args) => {
      const key = typeof args?.key === 'string' ? args.key : ''
      const revisionAt = typeof args?.revisionAt === 'number' && Number.isFinite(args.revisionAt)
        ? args.revisionAt
        : typeof args?.updatedAt === 'number' && Number.isFinite(args.updatedAt) ? args.updatedAt : undefined
      return key && revisionAt !== undefined ? codexController.hide(key, revisionAt) : false
    } })
    actions.register({ id: 'codex.task.restore', title: '从 Companion 已隐藏区释放 Codex 任务', group: 'Codex', risk: 'data-write', scope: 'global', priority: 97, when: () => true, run: (_ctx, args) => {
      const key = typeof args?.key === 'string' ? args.key : ''
      const revisionAt = typeof args?.revisionAt === 'number' && Number.isFinite(args.revisionAt)
        ? args.revisionAt
        : typeof args?.updatedAt === 'number' && Number.isFinite(args.updatedAt) ? args.updatedAt : undefined
      const kind = args?.kind === 'task' || args?.kind === 'activity' || args?.kind === 'pending' ? args.kind : undefined
      return key && revisionAt !== undefined && kind ? codexController.restore(key, revisionAt, kind) : false
    } })
    actions.register({ id: 'codex.task.archive', title: '归档 Codex 任务', group: 'Codex', risk: 'destructive', scope: 'global', priority: 97, when: () => true, run: (_ctx, args) => {
      const key = typeof args?.key === 'string' ? args.key : ''
      const revisionAt = typeof args?.revisionAt === 'number' && Number.isFinite(args.revisionAt)
        ? args.revisionAt
        : typeof args?.updatedAt === 'number' && Number.isFinite(args.updatedAt) ? args.updatedAt : undefined
      if (!key || revisionAt === undefined) return false
      void codexController.archive(key, revisionAt)
      return true
    } })
    actions.register({ id: 'codex.tasks.archive', title: '批量归档 Codex 任务', group: 'Codex', risk: 'destructive', scope: 'global', priority: 97, when: () => true, run: (_ctx, args) => {
      const items = Array.isArray(args?.items) ? args.items.flatMap((value) => {
        if (!value || typeof value !== 'object') return []
        const item = value as Record<string, unknown>
        return typeof item.key === 'string' && typeof item.revisionAt === 'number' && Number.isFinite(item.revisionAt)
          ? [{ key: item.key, revisionAt: item.revisionAt }]
          : []
      }) : []
      if (!items.length) return false
      void codexController.archiveMany(items)
      return true
    } })
    actions.register({ id: 'codex.tab.set', title: '切换 Codex 会话页签', group: 'Codex', risk: 'data-write', scope: 'global', priority: 96, when: () => true, run: (_ctx, args) => {
      const tab = typeof args?.tab === 'string' ? args.tab : ''
      return codexController.setTaskTab(tab as 'all' | 'input' | 'ongoing' | 'completed' | 'hidden' | 'projects')
    } })
    actions.register({ id: 'codex.tab.prev', title: '上一个 Codex 页签', group: 'Codex', risk: 'data-write', scope: 'global', priority: 96, when: () => true, run: () => {
      const tabs = ['ongoing', 'completed', 'hidden', 'projects'] as const
      const current = tabs.includes(state.codex.lastTaskTab as typeof tabs[number]) ? state.codex.lastTaskTab as typeof tabs[number] : 'ongoing'
      return codexController.setTaskTab(tabs[(tabs.indexOf(current) - 1 + tabs.length) % tabs.length])
    } })
    actions.register({ id: 'codex.tab.next', title: '下一个 Codex 页签', group: 'Codex', risk: 'data-write', scope: 'global', priority: 96, when: () => true, run: () => {
      const tabs = ['ongoing', 'completed', 'hidden', 'projects'] as const
      const current = tabs.includes(state.codex.lastTaskTab as typeof tabs[number]) ? state.codex.lastTaskTab as typeof tabs[number] : 'ongoing'
      return codexController.setTaskTab(tabs[(tabs.indexOf(current) + 1) % tabs.length])
    } })
    actions.register({ id: 'codex.project.collapse', title: '折叠或展开 Codex 项目', group: 'Codex', risk: 'data-write', scope: 'global', priority: 96, when: () => true, run: (_ctx, args) => {
      return typeof args?.key === 'string' && typeof args?.collapsed === 'boolean'
        ? codexController.setProjectCollapsed(args.key, args.collapsed)
        : false
    } })
    actions.register({ id: 'codex.alias.set', title: '设置 Codex 本地别名', group: 'Codex', risk: 'data-write', scope: 'global', priority: 96, when: () => true, run: (_ctx, args) => {
      const kind = args?.kind === 'task' || args?.kind === 'project' ? args.kind : ''
      return kind && typeof args?.key === 'string' && typeof args?.alias === 'string'
        ? codexController.setAlias(kind, args.key, args.alias)
        : false
    } })
    actions.register({ id: 'codex.pin.toggle', title: '切换 Codex 本地置顶', group: 'Codex', risk: 'data-write', scope: 'global', priority: 96, when: () => true, run: (_ctx, args) => {
      const kind = args?.kind === 'task' || args?.kind === 'project' ? args.kind : ''
      return kind && typeof args?.key === 'string' ? codexController.toggleLocalPin(kind, args.key) : false
    } })
    actions.register({ id: 'codex.pin.move', title: '调整 Codex 本地置顶顺序', group: 'Codex', risk: 'data-write', scope: 'global', priority: 96, when: () => true, run: (_ctx, args) => {
      const kind = args?.kind === 'task' || args?.kind === 'project' ? args.kind : ''
      const direction = args?.direction === -1 || args?.direction === 1 ? args.direction : 0
      return kind && direction && typeof args?.key === 'string' ? codexController.moveLocalPin(kind, args.key, direction) : false
    } })
    actions.register({ id: 'codex.project.hide', title: '隐藏 Codex 项目分组', group: 'Codex', risk: 'data-write', scope: 'global', priority: 95, when: () => true, run: (_ctx, args) => typeof args?.key === 'string' ? codexController.hideProject(args.key) : false })
    actions.register({ id: 'codex.project.show', title: '恢复 Codex 项目分组', group: 'Codex', risk: 'data-write', scope: 'global', priority: 95, when: () => true, run: (_ctx, args) => typeof args?.key === 'string' ? codexController.showProject(args.key) : false })
    actions.register({ id: 'codex.project.remove', title: '从 Codex 侧栏移除项目', group: 'Codex', risk: 'destructive', scope: 'global', priority: 95, when: () => true, run: (_ctx, args) => {
      const key = typeof args?.key === 'string' ? args.key : ''
      const actionAlias = typeof args?.actionAlias === 'string' ? args.actionAlias : ''
      const sourceFingerprint = typeof args?.sourceFingerprint === 'string' ? args.sourceFingerprint : ''
      if (!key || !actionAlias || !sourceFingerprint) return false
      void codexController.removeProject(key, actionAlias, sourceFingerprint)
      return true
    } })
    actions.register({ id: 'codex.project.archive', title: '归档 Codex 项目全部已完成任务', group: 'Codex', risk: 'destructive', scope: 'global', priority: 95, when: () => true, run: (_ctx, args) => {
      const key = typeof args?.key === 'string' ? args.key : ''
      const actionAlias = typeof args?.actionAlias === 'string' ? args.actionAlias : ''
      if (!key || !actionAlias) return false
      void codexController.archiveProject(key, actionAlias)
      return true
    } })
    actions.register({ id: 'codex.float.position.save', title: '保存 Codex 悬浮球位置', group: 'Codex', risk: 'data-write', scope: 'global', priority: 92, when: () => true, run: (_ctx, args) => {
      const position = args?.position
      return position && typeof position === 'object' ? codexController.updateSettings({ position: position as CodexFloatPosition }) : false
    } })
    actions.register({ id: 'codex.float.geometry.save', title: '保存 Codex 展开尺寸与位置', group: 'Codex', risk: 'data-write', scope: 'global', priority: 92, when: () => true, run: (_ctx, args) => {
      const position = args?.position
      const expandedSize = args?.expandedSize
      return position && typeof position === 'object' && expandedSize && typeof expandedSize === 'object'
        ? codexController.saveGeometry(position as CodexFloatPosition, expandedSize as { displayId?: string; width: number; height: number; updatedAt?: number })
        : false
    } })
    actions.register({ id: 'codex.float.position.reset', title: '重置 Codex 悬浮球位置', group: 'Codex', risk: 'data-write', scope: 'global', priority: 91, when: () => true, run: () => codexController.resetPosition() })
    actions.register({ id: 'codex.float.size.reset', title: '恢复 Codex 自适应展开尺寸', group: 'Codex', risk: 'data-write', scope: 'global', priority: 91, when: () => true, run: (_ctx, args) => codexController.resetExpandedSize(typeof args?.displayId === 'string' ? args.displayId : undefined) })
    actions.register({ id: 'codex.float.toggle', title: '显示或隐藏 Codex 悬浮球', group: 'Codex', risk: 'data-write', scope: 'global', priority: 1000, shortcut: 'Ctrl+Alt+Q', when: () => true, run: (_ctx, args) => {
      if (!isTabEnabled('codex')) {
        setMessage('请先在总设置中启用 Codex Companion')
        return false
      }
      const now = Date.now()
      const source = args?.source === 'utools-feature' ? 'utools-feature' : args?.source === 'in-app-shortcut' ? 'in-app-shortcut' : 'runtime'
      if (lastCodexFloatToggleSource && source !== lastCodexFloatToggleSource && now - lastCodexFloatToggleAt < 300) {
        lastCodexFloatToggleAt = 0
        lastCodexFloatToggleSource = ''
        return true
      }
      lastCodexFloatToggleAt = now
      lastCodexFloatToggleSource = source
      return codexController.updateSettings({ floatEnabled: !state.codex.settings.floatEnabled })
    } })
    actions.register({ id: 'codex.float.activate', title: '进入 Codex 卡片', description: '显示并展开 Codex 卡片，将键盘焦点交给会话列表。', group: 'Codex', risk: 'normal', scope: 'global', priority: 1001, shortcut: 'Ctrl+Alt+Enter', when: () => true, run: () => {
      if (!isTabEnabled('codex')) {
        setMessage('请先在总设置中启用 Codex Companion')
        return false
      }
      const enabled = state.codex.settings.floatEnabled || codexController.updateSettings({ floatEnabled: true })
      if (!enabled) return false
      queueMicrotask(() => platform.float.activate?.())
      return true
    } })
    actions.register({ id: 'codex.float.hide', title: '隐藏 Codex 悬浮球', group: 'Codex', risk: 'data-write', scope: 'global', priority: 90, when: () => true, run: () => codexController.updateSettings({ floatEnabled: false }) })
    actions.register({ id: 'codex.hotkey.configure', title: '配置 Codex 系统级快捷键', group: 'Codex', risk: 'normal', scope: 'global', priority: 89, when: () => true, run: () => {
      const opened = platform.app.configureHotkey?.('直接展开 Codex 卡片') === true
      if (!opened) setMessage('请在 uTools 设置 → 全局功能中，为“直接展开 Codex 卡片”绑定快捷键')
      return opened
    } })
    actions.register({ id: 'codex.input.hotkey.configure', title: '配置 Codex 待输入快捷键', group: 'Codex', risk: 'normal', scope: 'global', priority: 89, when: () => true, run: () => {
      const opened = platform.app.configureHotkey?.('打开 Codex 待输入任务') === true
      if (!opened) setMessage('请在 uTools 设置 → 全局功能中，为“打开 Codex 待输入任务”绑定快捷键')
      return opened
    } })
    actions.register({ id: 'codex.completed-unread.hotkey.configure', title: '配置 Codex 已完成未读快捷键', group: 'Codex', risk: 'normal', scope: 'global', priority: 89, when: () => true, run: () => {
      const opened = platform.app.configureHotkey?.('打开并标记第一个 Codex 已完成未读任务') === true
      if (!opened) setMessage('请在 uTools 设置 → 全局功能中，为“打开并标记第一个 Codex 已完成未读任务”绑定快捷键')
      return opened
    } })
    actions.register({ id: 'codex.task.previous.hotkey.configure', title: '配置上一个 Codex 任务快捷键', group: 'Codex', risk: 'normal', scope: 'global', priority: 89, when: () => true, run: () => {
      const opened = platform.app.configureHotkey?.('上一个 Codex 任务') === true
      if (!opened) setMessage('请在 uTools 设置 → 全局功能中，为“上一个 Codex 任务”绑定快捷键')
      return opened
    } })
    actions.register({ id: 'codex.task.next.hotkey.configure', title: '配置下一个 Codex 任务快捷键', group: 'Codex', risk: 'normal', scope: 'global', priority: 89, when: () => true, run: () => {
      const opened = platform.app.configureHotkey?.('下一个 Codex 任务') === true
      if (!opened) setMessage('请在 uTools 设置 → 全局功能中，为“下一个 Codex 任务”绑定快捷键')
      return opened
    } })
    actions.register({ id: 'settings.open', title: '打开设置', group: '全局', risk: 'normal', scope: 'global', priority: 10, shortcut: 'Ctrl+Alt+S', when: () => true, run: () => { setTab('settings'); return true } })
    actions.register({ id: 'search.focus', title: '聚焦搜索', group: '全局', risk: 'normal', scope: 'global', priority: 10, shortcut: 'Ctrl+F', when: () => true, run: () => focusSearch() })
    actions.register({ id: 'confirm.cancel', title: '关闭确认弹窗', group: '全局', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Escape', when: (ctx) => ctx.layerIds.includes('confirm'), run: () => { confirm = null; notify(); return true } })
    actions.register({ id: 'confirm.accept', title: '确认当前弹窗', group: '全局', risk: 'data-write', scope: 'layer', priority: 100, shortcut: 'Enter', when: (ctx) => ctx.layerIds.includes('confirm'), run: () => confirmNowInternal() })
    actions.register({ id: 'ports.workspace.reset', title: '重置端口工作区', group: '端口', risk: 'normal', scope: 'tab', priority: 90, shortcut: 'Escape', when: (ctx) => ctx.tab === 'ports', run: () => { resetPortWorkspace(); return true } })
  }

  registerActions()
  void refreshFavoritePathInspections()

  function confirmNowInternal() {
    const next = confirm
    confirm = null
    notify()
    next?.onConfirm()
    return Boolean(next)
  }

  function normalizeShortcutInput(input: boolean | ShortcutInputContext): ShortcutInputContext {
    return typeof input === 'boolean' ? { textInputFocused: input } : input
  }

  function keybindingContext(input: ShortcutInputContext): KeybindingContext {
    const effectiveInput = mqttPublishDraftHistoryEditDraft
      ? { ...input, textInputFocused: true, activeInputRole: 'mqtt-publish-draft-editor' as const }
      : mqttPublishDraftHistoryOpen
        ? { ...input, textInputFocused: false, activeInputRole: 'mqtt-publish-draft' as const }
        : input
    return {
      tab: state.activeTab,
      confirmOpen: Boolean(confirm),
      textInputFocused: effectiveInput.textInputFocused,
      activeInputRole: effectiveInput.activeInputRole,
      portPane: activePortPane,
      favoritePane: activeFavoritePane,
      favoriteQuickMode,
      favoriteUndoAvailable: Boolean(favoriteRemovalUndo?.removed.length),
      mqttPane: activeMqttPane,
      mqttPanelOpen,
      mqttTargetKind: mqttSelectedRecord?.kind,
      mqttDrawerOpen: mqttDrawer.open && mqttDrawer.active,
      mqttDrawerActive: mqttDrawer.open && mqttDrawer.active,
      mqttDetailOpen: mqttDrawer.open && !mqttDrawer.active,
      mqttDetailActive: mqttDrawer.open && !mqttDrawer.active,
      mqttLogDrawerOpen: mqttLogDrawer.open,
      mqttPreviewOpen: mqttPreview.open,
      portDrawerOpen: portDrawer.open,
      portDrawerActive: portDrawer.active,
      favoriteDrawerOpen: favoriteDrawer.open && favoriteDrawer.active,
      favoriteDrawerActive: favoriteDrawer.open && favoriteDrawer.active,
      favoriteDetailOpen: favoriteDrawer.open && !favoriteDrawer.active,
      favoriteDetailActive: favoriteDrawer.open && !favoriteDrawer.active,
      favoritePickReviewOpen: Boolean(favoritePickReview),
      portDetailOpen: portDetail.open,
      portDetailActive: portDetail.active,
      portGroupDetailOpen: portGroupDetail.open,
      portGroupDetailActive: portGroupDetail.active,
      portSelectionMode: selectedPortIds.length > 0,
      windowActionsOpen,
      windowEditorOpen: Boolean(windowDraft)
    }
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    snapshot(): AppRuntimeSnapshot {
      const portFilter = currentPortFilter()
      const favoriteTree = filterFavoriteTree(state.favorites, { keyword: state.favoriteSearch, tags: [], groupId: null })
      const groupFavoriteRows = favoriteGroupRows()
      const containerFavoriteRows = favoriteContainerRows()
      const directoryRows = favoriteDirectoryRows()
      const itemFavoriteRows = currentFavoriteItems()
      const detailTarget = portDetail.targetId ? ports.find((item) => item.id === portDetail.targetId) || null : null
      const groupRows = filterPortGroupRows()
      const groupDetailTarget = portGroupDetail.target ? groupRows.find((row) => sameTarget(row.target, portGroupDetail.target)) || rowForGroupTarget(portGroupDetail.target) : null
      const currentWindowRows = windowRows()
      const windowActionTarget = windowActionTargetId ? currentWindowRows.find((row) => row.id === windowActionTargetId) || null : null
      const codexFloat = codexController.floatSnapshot()
      codexFloat.keybindings = buildEffectiveKeybindings(state.settings.shortcutProfiles, state.settings.featureConfigs)
        .filter((binding) => (binding.actionId.startsWith('codex.') || binding.actionId.startsWith('quickJump.')) && !binding.disabled && Boolean(binding.shortcutId))
        .map((binding) => ({ actionId: binding.actionId, shortcutId: binding.shortcutId, layer: binding.layer, when: binding.when, weight: binding.weight }))
      return {
        state,
        codex: codexController.view(),
        codexFloat,
        ports,
        filteredPorts: portFilter.items,
        filteredPortGroups: filterPortGroups(),
        portGroupRows: groupRows,
        portSearchError: portFilter.error,
        selectedPortIds,
        selectedFavoriteIds,
        collapsedFavoriteIds,
        focusedPortId,
        focusedPortGroupId,
        focusedPortGroupTarget,
        selectedPortGroupId,
        selectedPortGroupTarget,
        activePortPane,
        portGroupSearch,
        groupSidePanelOpen,
        portDetail,
        portDetailTarget: detailTarget,
        portGroupDetail,
        portGroupDetailTarget: groupDetailTarget,
        portDrawer,
        portDrawerItems: buildPortDrawerItems(),
        searchOverlayOpen,
        searchFocusRequestId,
        searchBlurRequestId,
        groupPanelFocusRequestId,
        listFocusRequestId,
        listFocusTarget,
        searchFocusTarget,
        portGroupDraft,
        focusedFavoriteId,
        focusedFavoriteGroupId,
        selectedFavoriteGroupId,
        activeFavoritePane,
        favoritePaneFocusRequestId,
        favoriteGroupSearch,
        favoriteGroupRows: groupFavoriteRows,
        favoriteContainerRows: containerFavoriteRows,
        favoriteItemRows: itemFavoriteRows,
        favoriteVirtualChildRows: currentFavoriteVirtualChildren(),
        favoriteDirectoryEntries: directoryRows,
        favoriteDirectoryError,
        favoriteDirectoryLoading,
        favoritePathInspections,
        favoriteCapabilities,
        favoriteContainerPanelOpen,
        favoriteAddMenuOpen,
        favoriteCanUndoRemoval: Boolean(favoriteRemovalUndo?.removed.length),
        focusedFavoriteDirectoryPath,
        selectedFavoriteDirectoryPaths,
        selectedFavoriteContainer: selectedFavoriteContainer(),
        favoriteDrawer,
        favoriteDrawerItems: buildFavoriteDrawerItems(),
        favoriteQuickMode,
        favoritePickReview,
        favoriteDraft,
        favoriteParentOptions: favoriteParentOptions(state.favorites, favoriteDraft?.targetId || null),
        favoriteRows: flattenFavoriteTree(favoriteTree, collapsedFavoriteIds),
        windowCapability,
        windowLoading,
        windowListLoaded,
        windowCacheUpdatedAt,
        windowRows: currentWindowRows,
        focusedWindowId,
        selectedWindowIds: [...selectedWindowIds],
        windowActionsOpen,
        windowActionTarget,
        windowActionTargets: windowActionsOpen
          ? (windowActionsMode === 'multi'
            ? selectedWindowIds.map((id) => currentWindowRows.find((row) => row.id === id)).filter((row): row is WindowRow => Boolean(row))
            : (windowActionTarget ? [windowActionTarget] : []))
          : [],
        windowActionsMode,
        windowDraft,
        windowCandidateTargetId,
        windowFocusRequestId,
        windowActionsFocusRequestId,
        windowActivationDiagnostics: windowActivationDiagnostics.map((diagnostic) => ({ ...diagnostic })),
        windowOperationTraceEnabled,
        windowOperationTraces: windowOperationTraces.map((record) => ({
          ...record,
          steps: record.steps.map((step) => (step.detail ? { stage: step.stage, outcome: step.outcome, detail: step.detail } : { stage: step.stage, outcome: step.outcome }))
        })),
        mqttArchive,
        mqttArchiveLoaded,
        mqttStorageStatus: platform.storage.getMqttStorageStatus(),
        mqttPanelOpen,
        mqttSubscriptionPanelOpen,
        mqttWorkspaceLayout,
        mqttLayoutPrefs: state.mqtt.layoutPrefs,
        toolPreviewPrefs: state.settings.toolPreviewPrefs,
        mqttLogDrawer,
        mqttSearch,
        mqttTemplateSearch,
        mqttHistorySearch,
        mqttConnectionStatus,
        mqttLogs,
        mqttActiveConfig: currentMqttConfig(),
        mqttConnectionRows: mqttConnectionTreeRowsForSnapshot(),
        mqttSubscriptionRows: mqttSubscriptionRowsForActiveConfig(),
        mqttActiveSubscriptionTopic,
        mqttActiveSubscriptionTopics,
        mqttSelectedSubscriptionTopics,
        mqttSelectedConfigIds,
        mqttFocusedSubscriptionTopic,
        mqttFocusTarget,
        mqttFocusRequestId,
        mqttTopicFilterOpen,
        mqttTopicFilterQuery,
        mqttTopicFilterActiveIndex,
        mqttTopicFilterOptions: mqttTopicFilterOptionsForActiveConfig(),
        mqttReceiveFilter,
        activeMqttPane,
        activeMqttRecordList,
        mqttMessageStats: mqttMessageStatsForSelection(),
        mqttSessionRows: mqttSessionsForActiveConfig(),
        mqttMessageRows: mqttMessagesForSelection(),
        mqttSelectedRecord,
        mqttSelectedLog: selectedMqttLog(),
        mqttConfigDraft,
        mqttConnectionGroupDraft,
        mqttSubscriptionDraft,
        mqttPublishDraft,
        mqttPublishScratch,
        mqttPublishActiveField,
        mqttPublishOptionsOpen,
        mqttPublishOptionsActiveIndex,
        mqttPublishDraftHistoryOpen,
        mqttPublishDraftHistoryActiveIndex,
        mqttPublishDraftHistorySelectedIds,
        mqttPublishDraftHistoryEditDraft,
        mqttPublishRecordsOpen,
        mqttPublishTemplateRows: mqttPublishTemplatesForActiveConfig(),
        mqttPublishHistoryRows: mqttPublishHistoryForActiveConfig(),
        mqttPublishDraftHistoryRows: mqttPublishDraftHistoryForActiveConfig(),
        mqttRecordListStates,
        mqttDrawer,
        mqttDrawerItems: buildMqttDrawerItems(),
        mqttPreview,
        mqttFavoriteDraft,
        mqttRecordEditDraft,
        message,
        confirm,
        commandShortcutLabels: buildCommandShortcutLabels(),
        visibleFeatures: currentVisibleFeatures()
      }
    },
    actions: actions.all,
    scanPorts,
    refreshWindows,
    setTab,
    setWindowSearch(value: string) {
      state.windowSearch = value
      if (windowCandidateTargetId) {
        windowCandidateTargetId = null
        windowCandidateLiveIds = []
      }
      normalizeFocusedWindow(false)
      save()
      notify()
    },
    focusWindow(id: string) {
      if (!windowRowById(id)) return
      focusedWindowId = id
      if (windowActionsOpen) windowActionTargetId = id
      windowFocusRequestId += 1
      notify()
    },
    updateWindowDraft,
    cancelWindowDraft,
    setPortSearch(value: string) {
      state.portSearch = value
      if (activePortPane === 'results') {
        focusedPortGroupTarget = null
        focusedPortGroupId = null
      }
      ensurePortsScanned()
      normalizeFocusedPort()
      save()
      notify()
    },
    setPortGroupSearch(value: string) {
      portGroupSearch = value
      if (activePortPane === 'groups') {
        focusedPortId = null
      }
      normalizeFocusedGroup()
      notify()
    },
    setFavoriteSearch(value: string) {
      state.favoriteSearch = value
      activeFavoritePane = 'items'
      focusedFavoriteGroupId = null
      focusedFavoriteDirectoryPath = null
      normalizeFocusedFavorite()
      const visible = new Set(currentFavoriteItems().map((item) => item.id))
      selectedFavoriteIds = selectedFavoriteIds.filter((id) => visible.has(id))
      save()
      notify()
    },
    setMqttSearch(value: string) {
      mqttSearch = value
      activeMqttPane = 'messages'
      activeMqttRecordList = 'messages'
      mqttPublishRecordsOpen = false
      persistMqttLayoutPrefs()
      persistMqttViewPrefs()
      syncMqttRecordListState('messages', true)
      notify()
    },
    focusMqttConfig(id: string) {
      focusMqttConfigInternal(id)
    },
    focusMqttConnectionGroup(id: string) {
      focusMqttConnectionGroupInternal(id)
    },
    focusMqttSession(id: string) {
      ensureMqttArchiveLoaded()
      mqttSelectedRecord = { kind: 'session', id }
      mqttCurrentSessionId = id
      activeMqttPane = 'messages'
      notify()
    },
    focusMqttMessage(id: string) {
      ensureMqttArchiveLoaded()
      selectMqttRecord({ kind: 'message', id }, 'messages')
    },
    focusMqttPublishHistory(id: string) {
      ensureMqttArchiveLoaded()
      selectMqttRecord({ kind: 'message', id }, 'history')
    },
    focusMqttTemplate(id: string) {
      ensureMqttArchiveLoaded()
      selectMqttRecord({ kind: 'publish-template', id }, 'templates')
    },
    focusMqttLog(id: string) {
      mqttSelectedRecord = { kind: 'log', id }
      activeMqttPane = 'messages'
      notify()
    },
    updateMqttConfigDraft,
    updateMqttConnectionGroupDraft,
    updateMqttSubscriptionDraft,
    updateMqttFavoriteDraft,
    updateMqttRecordEditDraft,
    updateMqttPublishDraftHistoryEditDraft,
    updateMqttPublishDraft(input: Partial<MqttPublishDraft>) {
      updateMqttPublishDraftState(input)
    },
    appendMqttMessageRecord,
    setFavoriteGroupSearch(value: string) {
      favoriteGroupSearch = value
      activeFavoritePane = 'containers'
      focusedFavoriteId = null
      focusedFavoriteDirectoryPath = null
      normalizeFocusedFavoriteGroup()
      const visibleIds = new Set(favoriteContainerRows().map((row) => row.node.id))
      if (selectedFavoriteGroupId && !visibleIds.has(selectedFavoriteGroupId)) {
        selectedFavoriteGroupId = null
        focusedFavoriteId = null
        selectedFavoriteIds = []
        favoriteDirectoryRequestId += 1
        favoriteDirectoryEntries = []
        favoriteDirectoryError = null
        favoriteDirectoryLoading = false
        focusedFavoriteDirectoryPath = null
        selectedFavoriteDirectoryPaths = []
      }
      notify()
    },
    setFavoriteQuickMode(value: boolean) {
      favoriteQuickMode = value
      activeFavoritePane = 'items'
      if (value) {
        state.activeTab = 'favorites'
        selectedFavoriteIds = []
        selectedFavoriteGroupId = null
        focusedFavoriteGroupId = null
        focusedFavoriteId = null
        closeFavoriteDrawer(false)
        favoriteAddMenuOpen = false
        favoritePickReview = null
        favoriteDraft = null
        favoriteDirectoryRequestId += 1
        favoriteDirectoryEntries = []
        favoriteDirectoryError = null
        favoriteDirectoryLoading = false
        focusedFavoriteDirectoryPath = null
        selectedFavoriteDirectoryPaths = []
      }
      normalizeFocusedFavorite(value)
      notify()
    },
    togglePortSelection(id: string) {
      activePortPane = 'results'
      focusedPortGroupTarget = null
      focusedPortGroupId = null
      focusedPortId = id
      selectedPortIds = selectedPortIds.includes(id) ? selectedPortIds.filter((item) => item !== id) : [...selectedPortIds, id]
      syncSelectionDrawer()
      notify()
    },
    focusPort(id: string) {
      activePortPane = 'results'
      focusedPortGroupTarget = null
      focusedPortGroupId = null
      focusedPortId = id
      if (portDrawer.open) {
        portDrawer = { open: true, active: portDrawer.active, mode: 'single', activeIndex: 0, targetIds: [id], groupTarget: null }
      }
      if (portDetail.open) {
        portDetail = { open: true, active: portDetail.active, targetId: id }
      }
      notify()
    },
    focusPortGroup(id: string) {
      activePortPane = 'groups'
      groupSidePanelOpen = true
      focusedPortId = null
      focusedPortGroupTarget = { kind: 'group', id }
      focusedPortGroupId = id
      if (portDrawer.open) {
        portDrawer = { open: true, active: portDrawer.active, mode: 'group', activeIndex: 0, targetIds: [id], groupTarget: { kind: 'group', id } }
      }
      if (portGroupDetail.open) {
        portGroupDetail = { open: true, active: portGroupDetail.active, target: { kind: 'group', id } }
      }
      notify()
    },
    focusPortGroupFolder(id: string) {
      activePortPane = 'groups'
      groupSidePanelOpen = true
      focusedPortId = null
      focusedPortGroupTarget = { kind: 'folder', id }
      focusedPortGroupId = null
      if (portDrawer.open) {
        portDrawer = { open: true, active: portDrawer.active, mode: 'group', activeIndex: 0, targetIds: [id], groupTarget: { kind: 'folder', id } }
      }
      if (portGroupDetail.open) {
        portGroupDetail = { open: true, active: portGroupDetail.active, target: { kind: 'folder', id } }
      }
      notify()
    },
    focusPortGroupTarget(target: PortGroupTarget) {
      activePortPane = 'groups'
      groupSidePanelOpen = true
      focusedPortId = null
      focusedPortGroupTarget = target
      focusedPortGroupId = target.kind === 'group' ? target.id : null
      if (portDrawer.open) {
        portDrawer = { open: true, active: portDrawer.active, mode: 'group', activeIndex: 0, targetIds: [target.id], groupTarget: target }
      }
      if (portGroupDetail.open) {
        portGroupDetail = { open: true, active: portGroupDetail.active, target }
      }
      notify()
    },
    movePortGroupToFolder: moveGroupToFolder,
    focusFavorite(id: string) {
      activeFavoritePane = 'items'
      focusedFavoriteGroupId = null
      focusedFavoriteId = id
      focusedFavoriteDirectoryPath = null
      if (favoriteDrawer.open) {
        favoriteDrawer = { open: true, active: favoriteDrawer.active, activeIndex: 0, targetKind: 'favorite', targetIds: [id] }
      }
      notify()
    },
    focusFavoriteGroup(id: string) {
      activeFavoritePane = 'containers'
      focusedFavoriteId = null
      focusedFavoriteGroupId = id
      focusedFavoriteDirectoryPath = null
      notify()
    },
    toggleFavoriteSelection(id: string) {
      activeFavoritePane = 'items'
      focusedFavoriteId = id
      focusedFavoriteDirectoryPath = null
      selectedFavoriteIds = selectedFavoriteIds.includes(id) ? selectedFavoriteIds.filter((item) => item !== id) : [...selectedFavoriteIds, id]
      notify()
    },
    focusFavoriteDirectory(path: string) {
      activeFavoritePane = 'directory'
      focusedFavoriteId = null
      focusedFavoriteGroupId = null
      const key = favoritePathIdentityKey(path)
      focusedFavoriteDirectoryPath = favoriteDirectoryRows().find((row) => favoritePathIdentityKey(row.path) === key)?.path || path
      if (favoriteDrawer.open) {
        favoriteDrawer = { open: true, active: favoriteDrawer.active, activeIndex: 0, targetKind: 'directory', targetIds: [focusedFavoriteDirectoryPath] }
      }
      notify()
    },
    toggleFavoriteDirectorySelection(path: string) {
      activeFavoritePane = 'directory'
      focusedFavoriteId = null
      focusedFavoriteGroupId = null
      const key = favoritePathIdentityKey(path)
      const displayPath = favoriteDirectoryRows().find((row) => favoritePathIdentityKey(row.path) === key)?.path || path
      focusedFavoriteDirectoryPath = displayPath
      selectedFavoriteDirectoryPaths = selectedFavoriteDirectoryPaths.some((item) => favoritePathIdentityKey(item) === key)
        ? selectedFavoriteDirectoryPaths.filter((item) => favoritePathIdentityKey(item) !== key)
        : [...selectedFavoriteDirectoryPaths, displayPath]
      notify()
    },
    toggleFavoriteCollapse(id: string) {
      state.collapsedFavoriteGroupIds = state.collapsedFavoriteGroupIds.includes(id) ? state.collapsedFavoriteGroupIds.filter((item) => item !== id) : [...state.collapsedFavoriteGroupIds, id]
      collapsedFavoriteIds = collapsedFavoriteIds.includes(id) ? collapsedFavoriteIds.filter((item) => item !== id) : [...collapsedFavoriteIds, id]
      save()
      notify()
    },
    reorderFavorite: reorderFavoriteMetadata,
    addFavorite,
    removeFavorite,
    updateFavoritePickReviewItem,
    updateFavoriteDraft,
    saveFavoriteDraft,
    cancelFavoriteDraft() {
      favoriteDraft = null
      notify()
    },
    updatePortGroupDraft,
    savePortGroupDraft,
    cancelPortGroupDraft() {
      portGroupDraft = null
      notify()
    },
    closeSearchOverlay() {
      searchOverlayOpen = false
      notify()
    },
    saveShortcutProfiles(nextProfiles: ShortcutProfileMap) {
      state.settings.shortcutProfiles = cloneShortcutProfiles(nextProfiles)
      state.settings.keybindingOverrides = aggregateShortcutProfiles()
      save()
      notify()
    },
    saveFeatureConfigs(nextConfigs: FeatureConfig[]) {
      state.settings.featureConfigs = normalizeAppState({ settings: { featureConfigs: nextConfigs } }).settings.featureConfigs
      normalizeActiveTab()
      save()
      notify()
      codexController.syncActivation()
    },
    updateKeybinding(input: string | KeybindingUpdateInput, shortcutId?: string, disabled = false) {
      const payload: KeybindingUpdateInput = typeof input === 'string'
        ? { commandId: input, shortcutId, disabled }
        : input
      const shortcutIds = (payload.shortcutIds?.length ? payload.shortcutIds : payload.shortcutId ? [payload.shortcutId] : [])
        .map(normalizeShortcutId)
        .filter(Boolean)
      const isDisabled = payload.disabled === true || payload.enabled === false
      const profileId = payload.profileId || inferShortcutProfileId(payload.commandId)
      const override = {
        commandId: payload.commandId,
        shortcutId: shortcutIds[0],
        shortcutIds,
        when: payload.when,
        enabled: !isDisabled,
        source: isDisabled ? 'removed' : 'user',
        disabled: isDisabled
      } as const
      state.settings.shortcutProfiles[profileId].keybindingOverrides = state.settings.shortcutProfiles[profileId].keybindingOverrides.filter((item) => item.commandId !== payload.commandId)
      state.settings.shortcutProfiles[profileId].keybindingOverrides.push(override)
      state.settings.shortcutProfiles[profileId].updatedAt = Date.now()
      state.settings.keybindingOverrides = aggregateShortcutProfiles()
      save()
      notify()
    },
    resetKeybinding(commandId: string) {
      for (const profile of Object.values(state.settings.shortcutProfiles)) {
        profile.keybindingOverrides = profile.keybindingOverrides.filter((item) => item.commandId !== commandId)
      }
      state.settings.keybindingOverrides = aggregateShortcutProfiles()
      save()
      notify()
    },
    cancelConfirm() {
      confirm = null
      notify()
    },
    confirmNow() {
      confirmNowInternal()
    },
    dispatch(actionId: string, args?: Record<string, unknown>) {
      return actions.dispatch({ actionId, context: context(), args })
    },
    handleShortcut(shortcutId: string, inputContext: boolean | ShortcutInputContext): string | null {
      const input = normalizeShortcutInput(inputContext)
      if (confirm && shortcutId === 'Escape') {
        confirm = null
        notify()
        return 'confirm.cancel'
      }
      if (confirm && shortcutId === 'Enter') {
        confirmNowInternal()
        return 'confirm.accept'
      }
      if (state.activeTab === 'mqtt' && mqttPreview.open && shortcutId === 'Escape') {
        closeMqttPreview()
        return 'mqtt.preview.close'
      }
      if (portGroupDraft && shortcutId === 'Escape') {
        portGroupDraft = null
        notify()
        return 'ports.group.edit.cancel'
      }
      if (mqttSubscriptionDraft && shortcutId === 'Escape') {
        mqttSubscriptionDraft = null
        notify()
        return 'mqtt.subscription.editor.cancel'
      }
      if (mqttConnectionGroupDraft && shortcutId === 'Escape') {
        mqttConnectionGroupDraft = null
        notify()
        return 'mqtt.connectionGroup.cancel'
      }
      if (mqttFavoriteDraft && shortcutId === 'Escape') {
        mqttFavoriteDraft = null
        notify()
        return 'mqtt.record.favorite.cancel'
      }
      if (mqttRecordEditDraft && shortcutId === 'Escape') {
        mqttRecordEditDraft = null
        notify()
        return 'mqtt.record.edit.cancel'
      }
      if (windowDraft && shortcutId === 'Escape') {
        cancelWindowDraft()
        return 'windows.editor.cancel'
      }
      if (mqttConfigDraft && shortcutId === 'Escape') {
        mqttConfigDraft = null
        notify()
        return 'mqtt.config.cancel'
      }
      if (favoriteDraft && shortcutId === 'Escape') {
        favoriteDraft = null
        notify()
        return 'favorites.cancel'
      }
      if (favoritePickReview && shortcutId === 'Escape') {
        favoritePickReview = null
        notify()
        return 'favorites.pickReview.cancel'
      }
      if (shortcutId === 'Escape') {
        if (state.activeTab === 'windows' && windowActionsOpen) {
          closeWindowActions()
          return 'windows.actions.close'
        }
        if (state.activeTab === 'windows' && selectedWindowIds.length) {
          clearWindowSelection()
          return 'windows.selection.clear'
        }
        if (state.activeTab === 'windows' && clearWindowCandidates()) {
          return 'windows.candidates.clear'
        }
        const windowSearchFocused = input.activeInputRole === 'window-search'
        if (state.activeTab === 'windows' && windowSearchFocused && state.windowSearch) {
          state.windowSearch = ''
          searchBlurRequestId += 1
          normalizeFocusedWindow(false)
          save()
          notify()
          return 'windows.search.clear'
        }
        if (state.activeTab === 'windows' && windowSearchFocused) {
          blurSearchFocus()
          return 'windows.search.blur'
        }
        if (state.activeTab === 'windows' && state.windowSearch) {
          state.windowSearch = ''
          normalizeFocusedWindow(false)
          save()
          notify()
          return 'windows.search.clear'
        }
        if (state.activeTab === 'ports') {
          return resolvePortEscapeStep(input)
        }
        const mqttSearchFocused = input.activeInputRole === 'mqtt-search'
        if (state.activeTab === 'mqtt' && mqttLogDrawer.open) {
          mqttLogDrawer = { open: false }
          notify()
          return 'mqtt.log.drawer.close'
        }
        if (state.activeTab === 'mqtt' && mqttPreview.open) {
          closeMqttPreview()
          return 'mqtt.preview.close'
        }
        if (state.activeTab === 'mqtt' && mqttDrawer.open) {
          const closeAction = mqttDrawer.active ? 'mqtt.drawer.close' : 'mqtt.detail.close'
          closeMqttDrawer()
          return closeAction
        }
        if (state.activeTab === 'mqtt' && (mqttTopicFilterOpen || input.activeInputRole === 'mqtt-topic-filter')) {
          closeMqttTopicFilter()
          return 'mqtt.topicFilter.close'
        }
        if (state.activeTab === 'mqtt' && (mqttPublishOptionsOpen || input.activeInputRole === 'mqtt-publish-options')) {
          closeMqttPublishOptions()
          return 'mqtt.publish.options.close'
        }
        if (state.activeTab === 'mqtt' && (mqttPublishDraftHistoryEditDraft || input.activeInputRole === 'mqtt-publish-draft-editor')) {
          cancelMqttPublishDraftHistoryEditDraft()
          return 'mqtt.publish.draft.edit.cancel'
        }
        if (state.activeTab === 'mqtt' && (mqttPublishDraftHistoryOpen || input.activeInputRole === 'mqtt-publish-draft')) {
          closeMqttPublishDraftHistory()
          return 'mqtt.publish.draft.close'
        }
        if (state.activeTab === 'mqtt' && input.activeInputRole === 'mqtt-publish-editor') {
          blurMqttPublishEditor()
          return 'mqtt.publish.blur'
        }
        if (state.activeTab === 'mqtt' && mqttSearchFocused && activeMqttRecordList === 'templates' && mqttTemplateSearch) {
          mqttTemplateSearch = ''
          searchBlurRequestId += 1
          syncMqttRecordListState('templates', true)
          notify()
          return 'mqtt.search.clear'
        }
        if (state.activeTab === 'mqtt' && mqttSearchFocused && activeMqttRecordList === 'history' && mqttHistorySearch) {
          mqttHistorySearch = ''
          searchBlurRequestId += 1
          syncMqttRecordListState('history', true)
          notify()
          return 'mqtt.search.clear'
        }
        if (state.activeTab === 'mqtt' && mqttSearchFocused && mqttSearch) {
          mqttSearch = ''
          searchBlurRequestId += 1
          notify()
          return 'mqtt.search.clear'
        }
        if (state.activeTab === 'mqtt' && mqttSearchFocused) {
          blurSearchFocus()
          return 'mqtt.search.blur'
        }
        if (state.activeTab === 'mqtt' && mqttSearch) {
          mqttSearch = ''
          notify()
          return 'mqtt.search.clear'
        }
        if (state.activeTab === 'mqtt' && clearMqttRailSelection()) {
          return 'mqtt.selection.clear'
        }
        if (state.activeTab === 'mqtt' && mqttSelectedRecord) {
          mqttSelectedRecord = null
          notify()
          return 'mqtt.record.clear'
        }
        const favoriteItemSearchFocused = input.activeInputRole === 'favorite-search'
        const favoriteGroupSearchFocused = input.activeInputRole === 'favorite-group-search'
        const favoriteSearchFocused = favoriteItemSearchFocused || favoriteGroupSearchFocused
        if (state.activeTab === 'favorites' && favoriteAddMenuOpen) {
          favoriteAddMenuOpen = false
          notify()
          return 'favorites.addMenu.close'
        }
        if (state.activeTab === 'favorites' && favoriteDrawer.open) {
          const closeAction = favoriteDrawer.active ? 'favorites.drawer.close' : 'favorites.detail.close'
          closeFavoriteDrawer()
          return closeAction
        }
        if (state.activeTab === 'favorites' && selectedFavoriteDirectoryPaths.length) {
          selectedFavoriteDirectoryPaths = []
          notify()
          return 'favorites.directory.selection.clear'
        }
        if (state.activeTab === 'favorites' && selectedFavoriteIds.length) {
          selectedFavoriteIds = []
          notify()
          return 'favorites.selection.clear'
        }
        if (state.activeTab === 'favorites' && favoriteItemSearchFocused && state.favoriteSearch) {
          state.favoriteSearch = ''
          searchBlurRequestId += 1
          save()
          notify()
          return 'favorites.search.clear'
        }
        if (state.activeTab === 'favorites' && favoriteGroupSearchFocused && favoriteGroupSearch) {
          favoriteGroupSearch = ''
          searchBlurRequestId += 1
          normalizeFocusedFavoriteGroup()
          notify()
          return 'favorites.groupSearch.clear'
        }
        if (state.activeTab === 'favorites' && favoriteSearchFocused) {
          blurSearchFocus()
          return 'favorites.search.blur'
        }
        if (state.activeTab === 'favorites' && state.favoriteSearch) {
          state.favoriteSearch = ''
          save()
          notify()
          return 'favorites.search.clear'
        }
        if (state.activeTab === 'favorites' && favoriteGroupSearch) {
          favoriteGroupSearch = ''
          normalizeFocusedFavoriteGroup()
          notify()
          return 'favorites.groupSearch.clear'
        }
        if (state.activeTab === 'favorites' && selectedFavoriteGroupId) {
          selectedFavoriteGroupId = null
          normalizeFocusedFavorite(false)
          notify()
          return 'favorites.group.clear'
        }
        if (state.activeTab === 'favorites' && (focusedFavoriteId || focusedFavoriteGroupId)) {
          focusedFavoriteId = null
          focusedFavoriteGroupId = null
          notify()
          return 'favorites.focus.clear'
        }
        if (state.activeTab === 'favorites' && focusedFavoriteDirectoryPath) {
          focusedFavoriteDirectoryPath = null
          notify()
          return 'favorites.focus.clear'
        }
        if (state.activeTab === 'favorites' && favoriteQuickMode) {
          void hideAppWindow()
          return 'app.hide'
        }
        return null
      }
      const binding = resolveKeybinding(buildEffectiveKeybindings(state.settings.shortcutProfiles, state.settings.featureConfigs), shortcutId, keybindingContext(input))
      if (!binding) return null
      if (binding.actionId === 'tab.next' || binding.actionId === 'tab.prev') {
        const order: AppTabId[] = currentVisibleFeatures().map((feature) => feature.id)
        const current = order.indexOf(state.activeTab)
        const offset = binding.actionId === 'tab.next' ? 1 : -1
        setTab(order[(current + offset + order.length) % order.length])
        return binding.actionId
      }
      if (binding.actionId.startsWith('tab.select.')) {
        const tab = binding.actionId.replace('tab.select.', '') as AppTabId
        if (['ports', 'mqtt', 'favorites', 'windows', 'codex', 'settings'].includes(tab) && isTabEnabled(tab)) setTab(tab)
        return binding.actionId
      }
      if (binding.actionId === 'quickJump.openForward' || binding.actionId === 'codex.quickJump.openForward') {
        return 'quickJump.openForward'
      }
      if (binding.actionId === 'quickJump.openBackward') {
        return binding.actionId
      }
      if (binding.actionId === 'list.up' || binding.actionId === 'windows.list.up') {
        moveInList(-1)
        return binding.actionId
      }
      if (binding.actionId === 'list.down' || binding.actionId === 'windows.list.down') {
        moveInList(1)
        return binding.actionId
      }
      if (binding.actionId === 'list.pageUp' || binding.actionId === 'windows.list.pageUp') {
        moveInList(-1, true)
        return binding.actionId
      }
      if (binding.actionId === 'list.pageDown' || binding.actionId === 'windows.list.pageDown') {
        moveInList(1, true)
        return binding.actionId
      }
      if (binding.actionId === 'list.toggleSelection') {
        if (state.activeTab === 'mqtt' && activeMqttPane !== 'messages') return null
        toggleFocusedSelection()
        return binding.actionId
      }
      const result = actions.dispatch({
        actionId: binding.actionId,
        context: context(input),
        ...(binding.actionId === 'codex.float.toggle' ? { args: { source: 'in-app-shortcut' } } : {})
      })
      return result.handled ? binding.actionId : null
    },
    get defaultKeybindings() {
      return buildDefaultKeybindings(state.settings.featureConfigs)
    },
    startCodex() {
      codexController.start()
    },
    dispose() {
      codexController.dispose()
    }
  }
}
