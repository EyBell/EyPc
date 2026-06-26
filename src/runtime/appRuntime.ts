import { addFavoriteNode, deleteFavoriteMetadata, favoriteParentOptions, favoriteVirtualChildren, filterFavoriteContainerTree, filterFavoriteGroupTree, filterFavoriteItems, filterFavoriteTree, flattenFavoriteTree, inferFavoriteNameFromPath, isValidFavoriteParent, moveFavoriteNode, normalizeFavoritePath } from '../domain/favorites'
import { DEFAULT_MQTT_LAYOUT_PREFS, MQTT_LAYOUT_RATIO_MAX, MQTT_LAYOUT_RATIO_MIN, appendMqttMessage, buildMqttWebSocketUrl, clearMqttPublishDraftHistory, createMqttClientId, createMqttConnectionConfig, createMqttConnectionSnapshot, createMqttSession, deleteMqttPublishDraftHistory, deleteMqttPublishTemplate, deleteMqttRecord, matchMqttTopicFilter, mqttConnectOptionsFromConfig, mqttPublishTemplateOperationTime, normalizeMqttArchiveState, normalizeMqttTopicColor, parseMqttWebSocketUrl, renameMqttPublishTemplate, renameMqttRecord, saveMqttPublishDraftHistory, saveMqttPublishTemplate, toMqttPublishDraft, touchMqttPublishTemplate, updateMqttPublishDraftHistory } from '../domain/mqtt'
import { dedupePortProcesses, filterPortProcesses, flattenPortGroupTargets, matchPortGroupProcesses, matchPortGroupTargetProcesses, movePortGroupToFolder, shouldProcessMatchVerifiedPort } from '../domain/ports'
import { applyRecordListDeleteRecovery, computeRecordListDeleteAnchor, toggleRecordListSelection } from '../domain/recordListSelection'
import { normalizeAppState } from '../domain/state'
import { formatShortcutList } from '../domain/shortcuts'
import { normalizeToolPreviewPrefs } from '../domain/toolPreview'
import type { AppState, AppTabId, FavoriteNode, FeatureConfig, KillRequest, MqttArchiveState, MqttConnectionConfig, MqttInfoFilter, MqttLayoutPrefs, MqttMessageRecord, MqttPublishDraft, MqttPublishDraftHistoryEntry, MqttPublishTemplate, MqttQos, MqttStorageStatus, PortGroup, PortGroupFolder, PortGroupTarget, PortProcess, ShortcutProfileId, ShortcutProfileMap, ToolPreviewPrefs } from '../domain/types'
import type { PortGroupTreeRow } from '../domain/ports'
import { getPlatform, type FavoriteDirectoryEntry, type MqttSecretMap, type PickedFavorite, type PickedFavoriteKind } from '../platform/eypcPlatform'
import { createActionRuntime } from './action/actionRuntime'
import type { RuntimeActionContext, RuntimeActionRisk } from './action/types'
import { FEATURES, visibleFeatures, type VisibleFeatureDefinition } from './feature/featureRegistry'
import { buildDefaultKeybindings, buildEffectiveKeybindings, normalizeShortcutId, resolveKeybinding } from './keybinding/keybindingRuntime'
import type { KeybindingContext } from './keybinding/keybindingRuntime'
import { resolveMqttConnect, type MqttRuntimeClient } from './mqttClientModule'

export interface AppRuntimeSnapshot {
  state: AppState
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
  favoriteGroupSearch: string
  favoriteGroupRows: ReturnType<typeof flattenFavoriteTree>
  favoriteContainerRows: ReturnType<typeof flattenFavoriteTree>
  favoriteItemRows: FavoriteNode[]
  favoriteVirtualChildRows: FavoriteNode[]
  favoriteDirectoryEntries: FavoriteDirectoryRow[]
  favoriteDirectoryError: string | null
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
export type FavoritePaneId = 'groups' | 'items'
export type MqttPaneId = 'connections' | 'subscriptions' | 'messages' | 'publish' | 'publish-records'
export type MqttRecordListId = 'messages' | 'templates' | 'history'
export type SearchFocusTarget = 'ports' | 'port-groups' | 'mqtt' | 'mqtt-templates' | 'mqtt-history' | 'favorites' | 'favorite-groups'
export type ActiveInputRole = NonNullable<KeybindingContext['activeInputRole']>
export type PortDrawerMode = 'single' | 'multi' | 'group'
export type FavoriteDrawerTargetKind = 'favorite' | 'directory'
export type MqttReceiveFilter = 'all' | 'incoming' | 'outgoing'
export type MqttWorkspaceLayout = 'stack' | 'split'
export type MqttFocusTarget = 'records' | 'topic-filter' | 'publish-topic' | 'publish-payload' | 'publish-options' | 'publish-draft' | 'publish-draft-edit-title' | 'publish-draft-edit-note' | 'publish-draft-edit-topic' | 'publish-draft-edit-payload' | 'connections' | 'subscriptions'
export type MqttPublishField = 'topic' | 'payload'
export type MqttPublishDraftHistoryEditMode = 'rename' | 'edit'
export type MqttPublishDraftHistoryEditField = 'title' | 'note' | 'topic' | 'payload'
export type MqttRecordSelection =
  | { kind: 'config'; id: string }
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

export interface AppRuntimeOptions {
  mqttModuleLoader?: () => Promise<unknown>
}

const SHORTCUT_PROFILE_IDS: ShortcutProfileId[] = ['global', 'ports', 'mqtt', 'favorites', 'settings']

export function createAppRuntime(initialState: AppState, options: AppRuntimeOptions = {}) {
  const platform = getPlatform()
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
  let favoriteGroupSearch = ''
  let favoriteDirectoryEntries: FavoriteDirectoryEntry[] = []
  let favoriteDirectoryError: string | null = null
  let favoriteDirectoryRequestId = 0
  let focusedFavoriteDirectoryPath: string | null = null
  let selectedFavoriteDirectoryPaths: string[] = []
  let favoriteDrawer: FavoriteDrawerState = { open: false, active: false, activeIndex: 0, targetKind: 'favorite', targetIds: [] }
  let favoriteQuickMode = false
  let favoritePickReview: FavoritePickReview | null = null
  let favoriteDraft: FavoriteDraft | null = null
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

  function context(): RuntimeActionContext {
    const layerIds = [
      confirm ? 'confirm' : null,
      portGroupDraft ? 'port-group-editor' : null,
      mqttConfigDraft ? 'mqtt-editor' : null,
      mqttSubscriptionDraft ? 'mqtt-subscription-editor' : null,
      mqttFavoriteDraft ? 'mqtt-favorite-editor' : null,
      mqttRecordEditDraft ? 'mqtt-record-editor' : null,
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
      favoriteDrawer.open ? 'favorites-drawer' : null
    ].filter((item): item is string => Boolean(item))
    return {
      tab: state.activeTab,
      selectedIds: state.activeTab === 'ports' ? selectedPortIds : selectedFavoriteIds,
      layerIds,
      portPane: activePortPane,
      favoritePane: activeFavoritePane,
      favoriteQuickMode
    }
  }

  function setMessage(value: string) {
    message = value
    notify()
  }

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

  function setTab(tab: AppTabId) {
    state.activeTab = isTabEnabled(tab) ? tab : 'settings'
    if (state.activeTab === 'mqtt') ensureMqttArchiveLoaded()
    save()
    notify()
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

  function mqttConfigIdFromArgs(args?: Record<string, unknown>): string | null {
    const explicit = mqttExplicitTargetFromArgs(args)
    if (explicit?.kind === 'config') return explicit.id
    if (typeof args?.configId === 'string' && args.configId.trim()) return args.configId.trim()
    if (mqttSelectedRecord?.kind === 'config') return mqttSelectedRecord.id
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

  function toggleMqttConnectionSelection(args?: Record<string, unknown>) {
    const targetId = mqttConfigIdFromArgs(args)
    if (!targetId || !mqttConfigById(targetId)) return false
    focusMqttConfigInternal(targetId, false)
    mqttSelectedConfigIds = mqttSelectedConfigIds.includes(targetId)
      ? mqttSelectedConfigIds.filter((id) => id !== targetId)
      : [...mqttSelectedConfigIds, targetId]
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
    const rows = state.mqtt.configs
    if (!rows.length) {
      state.mqtt.activeConfigId = null
      mqttSelectedRecord = null
      notify()
      return true
    }
    const currentId = mqttSelectedRecord?.kind === 'config' ? mqttSelectedRecord.id : state.mqtt.activeConfigId
    const currentIndex = rows.findIndex((item) => item.id === currentId)
    const current = currentIndex >= 0 ? currentIndex : direction > 0 ? -1 : rows.length
    const nextIndex = Math.min(rows.length - 1, Math.max(0, current + direction * (page ? 5 : 1)))
    return focusMqttConfigInternal(rows[nextIndex].id)
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

  function deleteFocusedMqttConnection(args?: Record<string, unknown>) {
    const targetId = mqttConfigIdFromArgs(args)
    return targetId ? deleteMqttConfigs([targetId]) : false
  }

  function deleteSelectedMqttConnections() {
    return deleteMqttConfigs(mqttSelectedConfigIds.length ? mqttSelectedConfigIds : [mqttConfigIdFromArgs() || ''])
  }

  function copyMqttConnectionAddress(args?: Record<string, unknown>) {
    const config = mqttConfigById(mqttConfigIdFromArgs(args))
    if (!config?.url) return false
    void copyText(config.url, '已复制 MQTT 连接地址')
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

  function toggleMqttSubscriptionSelection(topic?: string) {
    const config = currentMqttConfig()
    if (!config) return false
    const target = (typeof topic === 'string' ? topic : mqttFocusedSubscriptionTopic || '').trim()
    if (!target || !config.subscriptions.includes(target)) return false
    activeMqttPane = 'subscriptions'
    mqttFocusedSubscriptionTopic = target
    mqttSelectedRecord = { kind: 'subscription', id: target }
    mqttSelectedSubscriptionTopics = mqttSelectedSubscriptionTopics.includes(target)
      ? mqttSelectedSubscriptionTopics.filter((item) => item !== target)
      : [...mqttSelectedSubscriptionTopics, target]
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

  function toggleMqttPublishDraftHistorySelection(args?: Record<string, unknown>) {
    const entry = activeMqttPublishDraftHistoryEntry(args)
    if (!entry) return false
    const rows = mqttPublishDraftHistoryForActiveConfig()
    const index = rows.findIndex((item) => item.id === entry.id)
    if (index >= 0) mqttPublishDraftHistoryActiveIndex = index
    mqttPublishDraftHistorySelectedIds = mqttPublishDraftHistorySelectedIds.includes(entry.id)
      ? mqttPublishDraftHistorySelectedIds.filter((id) => id !== entry.id)
      : [...mqttPublishDraftHistorySelectedIds, entry.id]
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

  function defaultMqttConfigDraft(mode: MqttConfigDraft['mode'], target: MqttConnectionConfig | null): MqttConfigDraft {
    if (!target) {
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

  function beginMqttConfigDraft(mode: MqttConfigDraft['mode']) {
    ensureMqttArchiveLoaded()
    const target = mode === 'create' ? null : currentMqttConfig()
    mqttConfigDraft = defaultMqttConfigDraft(mode, target)
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
          publishTopic: draft.mode === 'rename' ? config.publishTopic : publishTopic,
          publishTopics: draft.mode === 'rename' ? config.publishTopics : publishTopics,
          updatedAt: now
        }, now)
        return next
      })
      if (state.mqtt.configs.some((config) => config.id === targetId)) setMqttSecret(targetId, draft.password)
    }
    state.mqtt.configs = state.mqtt.configs.sort((a, b) => a.sortOrder - b.sortOrder).map((item, index) => ({ ...item, sortOrder: index + 1 }))
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
    const kind = rawKind === 'config' || rawKind === 'subscription' || rawKind === 'session' || rawKind === 'message' || rawKind === 'log' || rawKind === 'publish-template' || rawKind === 'publish-draft-history'
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

  function inferMqttDrawerState(active: boolean): MqttDrawerState | null {
    const target = mqttTargetFromArgs()
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

  function openMqttDrawer(active = true) {
    const inferred = inferMqttDrawerState(active)
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
    activeFavoritePane = 'groups'
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

  function openPortDetail() {
    if (activePortPane === 'groups') {
      setMessage('端口组没有进程详情')
      return false
    }
    normalizeFocusedPort(false)
    if (!focusedPortId) {
      setMessage('没有选中的端口进程')
      return false
    }
    if (portDrawer.open) closePortDrawer(false)
    if (portGroupDetail.open) closePortGroupDetail(false)
    portDetail = { open: true, active: true, targetId: focusedPortId }
    notify()
    return true
  }

  function openPortGroupDetail() {
    if (activePortPane !== 'groups') return false
    clearHiddenFocusedGroup()
    if (!focusedPortGroupTarget) {
      setMessage('没有选中的端口组')
      return false
    }
    if (portDrawer.open) closePortDrawer(false)
    if (portDetail.open) closePortDetail(false)
    portGroupDetail = { open: true, active: true, target: focusedPortGroupTarget }
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
    const ok = await platform.app.hide()
    if (!ok) setMessage('当前环境不支持隐藏插件窗口')
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

  function inferPortDrawerState(): PortDrawerState | null {
    if (activePortPane === 'groups') {
      clearHiddenFocusedGroup()
      return focusedPortGroupTarget ? { open: true, active: true, mode: 'group', activeIndex: 0, targetIds: [focusedPortGroupTarget.id], groupTarget: focusedPortGroupTarget } : null
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

  function openPortDrawer() {
    const inferred = inferPortDrawerState()
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

  function inferFavoriteDrawerState(): FavoriteDrawerState | null {
    if (favoriteQuickMode) return null
    const directoryTargets = selectedFavoriteDirectoryPaths.length
      ? selectedFavoriteDirectoryPaths
      : focusedFavoriteDirectoryPath ? [focusedFavoriteDirectoryPath] : []
    if (directoryTargets.length && activeFavoritePane === 'items') {
      return { open: true, active: true, activeIndex: 0, targetKind: 'directory', targetIds: [...directoryTargets] }
    }
    if (activeFavoritePane === 'groups' && focusedFavoriteGroupId) {
      return { open: true, active: true, activeIndex: 0, targetKind: 'favorite', targetIds: [focusedFavoriteGroupId] }
    }
    const ids = selectedFavoriteIds.length ? selectedFavoriteIds : focusedFavoriteId ? [focusedFavoriteId] : []
    return ids.length ? { open: true, active: true, activeIndex: 0, targetKind: 'favorite', targetIds: [...ids] } : null
  }

  function buildFavoriteDrawerItems(drawer = favoriteDrawer): FavoriteDrawerItem[] {
    if (!drawer.open) return []
    if (drawer.targetKind === 'directory') {
      return [
        favoriteDrawerItem('favorites.directory.open', '打开', '打开选中的实际目录项。', 'open', { directoryPaths: drawer.targetIds }),
        favoriteDrawerItem('favorites.directory.reveal', '定位', '在系统文件管理器中定位实际目录项。', 'reveal', { directoryPaths: drawer.targetIds }),
        favoriteDrawerItem('favorites.directory.copyPath', '复制路径', '复制选中实际目录项的绝对路径。', 'copy', { directoryPaths: drawer.targetIds }),
        favoriteDrawerItem('favorites.directory.addSelected', '添加到收藏', '把选中实际目录项加入当前虚拟容器。', 'add', { directoryPaths: drawer.targetIds })
      ]
    }
    const targetId = drawer.targetIds[0] || null
    const target = favoriteById(targetId)
    const args = target ? { favoriteId: target.id } : {}
    const pathItems = target?.kind === 'group' ? [] : [
      favoriteDrawerItem('favorites.open', '打开', '打开当前收藏目标。', 'open', args),
      favoriteDrawerItem('favorites.reveal', '定位', '在系统文件管理器中定位当前收藏。', 'reveal', args),
      favoriteDrawerItem('favorites.copyPath', '复制路径', '复制当前收藏的绝对路径。', 'copy', args)
    ]
    return [
      ...pathItems,
      favoriteDrawerItem('favorites.group.create', '新建子分组', '在当前节点下创建虚拟子分组。', 'group', args),
      favoriteDrawerItem('favorites.target.create', '添加子目标', '在当前节点下添加文件或文件夹目标。', 'add', args),
      favoriteDrawerItem('favorites.edit', '编辑', '编辑当前收藏元数据。', 'edit', args),
      favoriteDrawerItem('favorites.rename', '重命名', '只重命名插件收藏元数据。', 'rename', args),
      favoriteDrawerItem('favorites.group.moveParent', '移动父级', '调整当前节点所在虚拟父级。', 'move', args),
      favoriteDrawerItem('favorites.remove', '移出收藏', '确认后移除插件收藏元数据。', 'remove', args),
      favoriteDrawerItem('favorites.remove.force', '直接移除', '跳过确认，只删除插件收藏元数据。', 'delete', args)
    ]
  }

  function openFavoriteDrawer() {
    const inferred = inferFavoriteDrawerState()
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
    const favoritePaths = new Set(state.favorites.map((item) => `${item.kind}:${normalizeFavoritePath(item.path)}`))
    const selected = new Set(selectedFavoriteDirectoryPaths)
    return favoriteDirectoryEntries.map((entry) => ({
      ...entry,
      path: normalizeFavoritePath(entry.path),
      favorited: favoritePaths.has(`${entry.kind}:${normalizeFavoritePath(entry.path)}`),
      selected: selected.has(normalizeFavoritePath(entry.path)),
      focused: focusedFavoriteDirectoryPath === normalizeFavoritePath(entry.path)
    }))
  }

  async function loadSelectedFavoriteDirectory() {
    const requestId = favoriteDirectoryRequestId + 1
    favoriteDirectoryRequestId = requestId
    const container = selectedFavoriteContainer()
    selectedFavoriteDirectoryPaths = []
    focusedFavoriteDirectoryPath = null
    favoriteDirectoryError = null
    if (favoriteQuickMode || container?.kind !== 'folder' || !container.path) {
      favoriteDirectoryEntries = []
      notify()
      return
    }
    const result = await platform.files.listDirectory(container.path)
    if (requestId !== favoriteDirectoryRequestId) return
    favoriteDirectoryEntries = result.ok ? result.entries.map((entry) => ({ ...entry, path: normalizeFavoritePath(entry.path) })) : []
    favoriteDirectoryError = result.ok ? null : result.error || '当前宿主不可读取目录'
    notify()
  }

  function selectedDirectoryEntries(): FavoriteDirectoryRow[] {
    const rows = favoriteDirectoryRows()
    const selected = rows.filter((row) => selectedFavoriteDirectoryPaths.includes(row.path))
    if (selected.length) return selected
    return focusedFavoriteDirectoryPath ? rows.filter((row) => row.path === focusedFavoriteDirectoryPath) : []
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
    if (state.activeTab === 'favorites' && activeFavoritePane === 'groups') {
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
        toggleMqttConnectionSelection()
        return
      }
      if (activeMqttPane === 'subscriptions') {
        toggleMqttSubscriptionSelection()
        return
      }
      if (activeMqttPane !== 'messages') return
      toggleMqttRecordSelection()
      return
    }
    if (state.activeTab === 'ports' && activePortPane === 'results' && focusedPortId) {
      focusedPortGroupTarget = null
      focusedPortGroupId = null
      const rows = currentPortFilter().items
      const currentIndex = rows.findIndex((item) => item.id === focusedPortId)
      selectedPortIds = selectedPortIds.includes(focusedPortId) ? selectedPortIds.filter((item) => item !== focusedPortId) : [...selectedPortIds, focusedPortId]
      if (advance && currentIndex >= 0 && currentIndex < rows.length - 1) {
        focusedPortId = rows[currentIndex + 1].id
      }
      syncSelectionDrawer()
      notify()
    }
    if (state.activeTab === 'favorites' && activeFavoritePane === 'items' && focusedFavoriteId) {
      const rows = currentFavoriteItems()
      const currentIndex = rows.findIndex((item) => item.id === focusedFavoriteId)
      selectedFavoriteIds = selectedFavoriteIds.includes(focusedFavoriteId) ? selectedFavoriteIds.filter((item) => item !== focusedFavoriteId) : [...selectedFavoriteIds, focusedFavoriteId]
      if (advance && currentIndex >= 0 && currentIndex < rows.length - 1) {
        focusedFavoriteId = rows[currentIndex + 1].id
      }
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
    if (portGroupDetail.open && portGroupDetail.active) {
      closePortGroupDetail()
      return 'ports.groupDetail.close'
    }
    if (portDetail.open && portDetail.active) {
      closePortDetail()
      return 'ports.detail.close'
    }
    if (portDrawer.open && portDrawer.active) {
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

  function favoritePickKindFromArgs(args?: Record<string, unknown> | null): PickedFavoriteKind | null {
    return args?.kind === 'file' || args?.kind === 'folder' ? args.kind : null
  }

  function directoryPathsFromArgs(args?: Record<string, unknown> | null): string[] {
    return Array.isArray(args?.directoryPaths)
      ? args.directoryPaths.map((item) => normalizeFavoritePath(String(item || ''))).filter(Boolean)
      : []
  }

  function focusFavoriteActionTarget(args?: Record<string, unknown> | null, useAsContainer = false): FavoriteNode | null {
    const target = favoriteById(favoriteIdFromArgs(args))
    if (!target) return null
    selectedFavoriteIds = []
    if (useAsContainer) {
      focusedFavoriteGroupId = target.id
      selectedFavoriteGroupId = target.id
      focusedFavoriteId = null
      activeFavoritePane = 'groups'
      return target
    }
    if (target.kind === 'group') {
      focusedFavoriteGroupId = target.id
      focusedFavoriteId = null
      activeFavoritePane = 'groups'
    } else {
      focusedFavoriteId = target.id
      focusedFavoriteGroupId = null
      activeFavoritePane = 'items'
    }
    return target
  }

  function selectedFavorite(targetId?: string | null): FavoriteNode | null {
    const id = targetId
      || (favoriteDrawer.open && favoriteDrawer.targetKind === 'favorite' ? favoriteDrawer.targetIds[0] : null)
      || selectedFavoriteIds[0]
      || focusedFavoriteId
      || (activeFavoritePane === 'groups' ? focusedFavoriteGroupId : null)
    const item = favoriteById(id)
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
    normalizeFocusedFavorite(false)
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
    notify()
    return result
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

  function selectedFavoriteMetadataIds(): string[] {
    if (activeFavoritePane === 'groups' && focusedFavoriteGroupId) return [focusedFavoriteGroupId]
    return selectedFavoriteIds.length ? selectedFavoriteIds : focusedFavoriteId ? [focusedFavoriteId] : []
  }

  function removeFavoriteNow(ids = selectedFavoriteMetadataIds()) {
    if (!ids.length) return
    state.favorites = deleteFavoriteMetadata(state.favorites, ids)
    state.collapsedFavoriteGroupIds = state.collapsedFavoriteGroupIds.filter((id) => state.favorites.some((item) => item.id === id))
    selectedFavoriteIds = []
    if (favoriteDrawer.open && favoriteDrawer.targetKind === 'favorite' && favoriteDrawer.targetIds.some((id) => !state.favorites.some((item) => item.id === id))) closeFavoriteDrawer(false)
    if (focusedFavoriteId && !state.favorites.some((item) => item.id === focusedFavoriteId)) focusedFavoriteId = null
    if (focusedFavoriteGroupId && !state.favorites.some((item) => item.id === focusedFavoriteGroupId)) focusedFavoriteGroupId = null
    if (selectedFavoriteGroupId && !state.favorites.some((item) => item.id === selectedFavoriteGroupId)) selectedFavoriteGroupId = null
    void loadSelectedFavoriteDirectory()
    normalizeFocusedFavorite(false)
    normalizeFocusedFavoriteGroup()
    save()
    notify()
  }

  function removeFavorite() {
    const ids = selectedFavoriteMetadataIds()
    if (!ids.length) return
    confirm = {
      title: '移出收藏',
      detail: '只会删除 EyPc 收藏元数据，不会删除磁盘上的真实文件或文件夹。',
      onConfirm: () => removeFavoriteNow(ids)
    }
    notify()
  }

  function markFavoriteUsed(id: string) {
    const now = Date.now()
    state.favorites = state.favorites.map((item) => item.id === id ? { ...item, usageCount: (item.usageCount || 0) + 1, lastUsedAt: now, updatedAt: now } : item)
    save()
    notify()
  }

  async function openFavorite(targetId?: string | null) {
    const item = selectedFavorite(targetId)
    if (!item?.path) {
      setMessage('没有选中的文件或文件夹')
      return
    }
    const ok = await platform.files.open(item.path)
    if (ok) {
      markFavoriteUsed(item.id)
      if (favoriteQuickMode) void hideAppWindow()
    }
    setMessage(ok ? '已打开收藏' : '打开收藏失败')
  }

  async function revealFavorite(targetId?: string | null) {
    const item = selectedFavorite(targetId)
    if (!item?.path) {
      setMessage('没有选中的文件或文件夹')
      return
    }
    const ok = await platform.files.reveal(item.path)
    if (ok && favoriteQuickMode) void hideAppWindow()
    setMessage(ok ? '已定位收藏' : '定位收藏失败')
  }

  async function copyFavoritePath(targetId?: string | null) {
    const raw = favoriteById(targetId || selectedFavoriteIds[0] || focusedFavoriteId || focusedFavoriteGroupId)
    const item = selectedFavorite(targetId)
    if (!item) {
      if (raw?.kind === 'group') {
        setMessage('分组节点没有可复制路径')
        return
      }
      setMessage('没有选中的收藏')
      return
    }
    if (!item.path) {
      setMessage('分组节点没有可复制路径')
      return
    }
    const ok = await platform.files.copyPath(item.path)
    if (ok && favoriteQuickMode) void hideAppWindow()
    setMessage(ok ? '路径已复制' : '复制路径失败')
  }

  function directoryTargets(paths: string[] = []): FavoriteDirectoryRow[] {
    const requested = paths.length ? new Set(paths.map(normalizeFavoritePath)) : null
    const rows = favoriteDirectoryRows()
    if (requested) return rows.filter((row) => requested.has(row.path))
    return selectedDirectoryEntries()
  }

  async function openDirectoryTargets(paths: string[] = []) {
    const rows = directoryTargets(paths)
    if (!rows.length) {
      setMessage('没有选中的实际目录项')
      return
    }
    const results = await Promise.all(rows.map((row) => platform.files.open(row.path)))
    setMessage(`已打开 ${results.filter(Boolean).length}/${rows.length} 项`)
  }

  async function revealDirectoryTargets(paths: string[] = []) {
    const rows = directoryTargets(paths)
    if (!rows.length) {
      setMessage('没有选中的实际目录项')
      return
    }
    const results = await Promise.all(rows.map((row) => platform.files.reveal(row.path)))
    setMessage(`已定位 ${results.filter(Boolean).length}/${rows.length} 项`)
  }

  async function copyDirectoryTargetPaths(paths: string[] = []) {
    const rows = directoryTargets(paths)
    if (!rows.length) {
      setMessage('没有选中的实际目录项')
      return
    }
    const ok = await platform.files.copyPath(rows.map((row) => row.path).join('\n'))
    setMessage(ok ? '路径已复制' : '复制路径失败')
  }

  function tagsTextToList(value: string) {
    return value.split(',').map((tag) => tag.trim()).filter(Boolean)
  }

  function pickReviewItems(picked: PickedFavorite[], kind: PickedFavoriteKind, parentId: string | null): FavoritePickReviewItem[] {
    const now = Date.now()
    return picked.flatMap((item, index) => {
      const path = normalizeFavoritePath(item.path)
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
      path: normalizeFavoritePath(item.path),
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
    const path = normalizeFavoritePath(item.path)
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

  function addSelectedDirectoryEntries(paths: string[] = []) {
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

  function targetFavoriteForDraft(): FavoriteNode | null {
    if (activeFavoritePane === 'groups') return favoriteById(focusedFavoriteGroupId)
    return favoriteById(focusedFavoriteId)
  }

  function beginFavoriteDraft(mode: FavoriteDraft['mode']) {
    const now = Date.now()
    const target = mode === 'create-group' || mode === 'create-target' ? null : targetFavoriteForDraft()
    if (mode !== 'create-group' && mode !== 'create-target' && !target) return false
    const kind = mode === 'create-group' ? 'group' : mode === 'create-target' ? 'folder' : target?.kind || 'folder'
    favoriteDraft = {
      mode,
      targetId: target?.id || null,
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
    if (!isValidFavoriteParent(state.favorites, draft.mode === 'create-group' ? '' : draft.targetId || '', parentId)) {
      setMessage('不能移动到自身或子分组下')
      return false
    }
    const now = Date.now()
    if (draft.mode === 'create-group') {
      const id = `fav-group:${now}:${Math.random().toString(36).slice(2, 8)}`
      state.favorites.push({ id, kind: 'group', path: '', name, parentId, tags: [], color: draft.color || '#00A676', sortOrder: state.favorites.length + 1, createdAt: now, updatedAt: now })
      focusedFavoriteGroupId = id
      activeFavoritePane = 'groups'
    } else if (draft.mode === 'create-target' && (kind === 'file' || kind === 'folder')) {
      addFavorite({
        kind,
        path: normalizeFavoritePath(draft.path),
        name: name || inferFavoriteNameFromPath(draft.path),
        parentId,
        tags: tagsTextToList(draft.tagsText),
        color: draft.color || '#2F80ED'
      })
    } else if (target) {
      state.favorites = state.favorites.map((item) => {
        if (item.id !== target.id) return item
        if (draft.mode === 'rename') return { ...item, name, updatedAt: now }
        if (draft.mode === 'move-parent') return { ...item, parentId, updatedAt: now }
        return {
          ...item,
          kind,
          name: name || inferFavoriteNameFromPath(draft.path),
          path: kind === 'group' ? '' : normalizeFavoritePath(draft.path),
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
    actions.register({ id: 'ports.groupDetail.open', title: '打开端口组详情抽屉', description: '展示当前分组或分组夹的规则和快捷操作。', icon: 'detail', group: '端口', risk: 'normal', scope: 'tab', priority: 96, shortcut: 'Ctrl+ArrowLeft', when: (ctx) => ctx.tab === 'ports', run: () => openPortGroupDetail() })
    actions.register({ id: 'ports.groupDetail.close', title: '关闭端口组详情抽屉', description: '关闭左侧端口组详情抽屉。', icon: 'close', group: '端口', risk: 'normal', scope: 'layer', priority: 96, when: (ctx) => ctx.tab === 'ports', run: () => closePortGroupDetail() })
    actions.register({ id: 'ports.drawer.open', title: '打开端口动作抽屉', description: '展示当前端口、选中端口或端口组的可执行动作。', icon: 'drawer', group: '端口', risk: 'normal', scope: 'tab', priority: 96, shortcut: 'Ctrl+ArrowRight', when: (ctx) => ctx.tab === 'ports', run: () => openPortDrawer() })
    actions.register({ id: 'ports.drawer.close', title: '关闭端口动作抽屉', description: '关闭右侧动作抽屉。', icon: 'close', group: '端口', risk: 'normal', scope: 'layer', priority: 96, when: (ctx) => ctx.tab === 'ports', run: () => closePortDrawer() })
    actions.register({ id: 'ports.detail.open', title: '打开端口详情抽屉', description: '展示当前高亮进程的端口、PID、命令和快捷操作。', icon: 'detail', group: '端口', risk: 'normal', scope: 'tab', priority: 96, shortcut: 'Ctrl+ArrowLeft', when: (ctx) => ctx.tab === 'ports', run: () => openPortDetail() })
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
    actions.register({ id: 'mqtt.config.create', title: '新建 MQTT 配置', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 95, shortcut: 'Ctrl+N', when: (ctx) => ctx.tab === 'mqtt', run: () => beginMqttConfigDraft('create') })
    actions.register({ id: 'mqtt.config.edit', title: '编辑 MQTT 配置', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 94, shortcut: 'F2', when: (ctx) => ctx.tab === 'mqtt', run: () => beginMqttConfigDraft('edit') })
    actions.register({ id: 'mqtt.config.rename', title: '重命名 MQTT 配置', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 94, shortcut: 'Shift+F2', when: (ctx) => ctx.tab === 'mqtt', run: () => beginMqttConfigDraft('rename') })
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
    actions.register({ id: 'mqtt.subscription.editor.open', title: '管理 MQTT 订阅', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 92, when: (ctx) => ctx.tab === 'mqtt', run: () => beginMqttSubscriptionDraft(false) })
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
    actions.register({ id: 'mqtt.detail.open', title: '打开 MQTT 详情', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 90, shortcut: 'Ctrl+ArrowLeft', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => { if (args) mqttSelectedRecord = mqttTargetFromArgs(args); return openMqttDrawer(false) } })
    actions.register({ id: 'mqtt.detail.close', title: '关闭 MQTT 详情', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 90, when: (ctx) => ctx.layerIds.includes('mqtt-detail'), run: () => closeMqttDrawer() })
    actions.register({ id: 'mqtt.drawer.open', title: '打开 MQTT 动作抽屉', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 90, shortcut: 'Ctrl+ArrowRight', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => { if (args) mqttSelectedRecord = mqttTargetFromArgs(args); return openMqttDrawer(true) } })
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
    actions.register({ id: 'favorites.pane.toggleNext', title: '切换收藏栏', group: '收藏', risk: 'normal', scope: 'tab', priority: 100, shortcut: 'Tab', when: (ctx) => ctx.tab === 'favorites', run: () => { activeFavoritePane = activeFavoritePane === 'items' ? 'groups' : 'items'; if (activeFavoritePane === 'groups') normalizeFocusedFavoriteGroup(); else normalizeFocusedFavorite(); notify(); return true } })
    actions.register({ id: 'favorites.pane.togglePrev', title: '反向切换收藏栏', group: '收藏', risk: 'normal', scope: 'tab', priority: 100, shortcut: 'Shift+Tab', when: (ctx) => ctx.tab === 'favorites', run: () => { activeFavoritePane = activeFavoritePane === 'items' ? 'groups' : 'items'; if (activeFavoritePane === 'groups') normalizeFocusedFavoriteGroup(); else normalizeFocusedFavorite(); notify(); return true } })
    actions.register({ id: 'favorites.search.focus', title: '聚焦收藏搜索', group: '收藏', risk: 'normal', scope: 'tab', priority: 99, shortcut: 'Ctrl+F', when: (ctx) => ctx.tab === 'favorites', run: () => focusFavoriteSearch() })
    actions.register({ id: 'favorites.groupSearch.focus', title: '聚焦收藏分组搜索', group: '收藏', risk: 'normal', scope: 'tab', priority: 99, shortcut: 'Ctrl+Shift+F', when: (ctx) => ctx.tab === 'favorites' && !ctx.favoriteQuickMode, run: () => focusFavoriteGroupSearch() })
    actions.register({ id: 'favorites.group.apply', title: '应用收藏容器', group: '收藏', risk: 'normal', scope: 'tab', priority: 100, shortcut: 'Enter', when: (ctx) => ctx.tab === 'favorites', run: (_ctx, args) => applyFocusedFavoriteContainer(favoriteIdFromArgs(args) || focusedFavoriteGroupId) })
    actions.register({ id: 'favorites.target.create', title: '新增收藏目标', group: '收藏', risk: 'data-write', scope: 'tab', priority: 95, shortcut: 'Ctrl+N', when: (ctx) => ctx.tab === 'favorites' && !ctx.favoriteQuickMode, run: (_ctx, args) => { if (favoriteIdFromArgs(args)) focusFavoriteActionTarget(args, true); return beginFavoriteDraft('create-target') } })
    actions.register({ id: 'favorites.group.create', title: '新增收藏分组', group: '收藏', risk: 'data-write', scope: 'tab', priority: 95, shortcut: 'Ctrl+T', when: (ctx) => ctx.tab === 'favorites' && !ctx.favoriteQuickMode, run: (_ctx, args) => { if (favoriteIdFromArgs(args)) focusFavoriteActionTarget(args, true); return beginFavoriteDraft('create-group') } })
    actions.register({ id: 'favorites.group.moveParent', title: '移动收藏父级', group: '收藏', risk: 'data-write', scope: 'tab', priority: 95, shortcut: 'Ctrl+F2', when: (ctx) => ctx.tab === 'favorites' && !ctx.favoriteQuickMode, run: (_ctx, args) => { if (favoriteIdFromArgs(args)) focusFavoriteActionTarget(args); return beginFavoriteDraft('move-parent') } })
    actions.register({ id: 'favorites.group.collapse', title: '折叠收藏分组', group: '收藏', risk: 'normal', scope: 'tab', priority: 95, shortcut: 'ArrowLeft', when: (ctx) => ctx.tab === 'favorites', run: () => { if (!focusedFavoriteGroupId) return false; state.collapsedFavoriteGroupIds = [...new Set([...state.collapsedFavoriteGroupIds, focusedFavoriteGroupId])]; save(); notify(); return true } })
    actions.register({ id: 'favorites.group.expand', title: '展开收藏分组', group: '收藏', risk: 'normal', scope: 'tab', priority: 95, shortcut: 'ArrowRight', when: (ctx) => ctx.tab === 'favorites', run: () => { if (!focusedFavoriteGroupId) return false; state.collapsedFavoriteGroupIds = state.collapsedFavoriteGroupIds.filter((id) => id !== focusedFavoriteGroupId); save(); notify(); return true } })
    actions.register({ id: 'favorites.open', title: '打开收藏', group: '收藏', risk: 'normal', scope: 'tab', priority: 100, shortcut: 'Enter', when: (ctx) => ctx.tab === 'favorites', run: (_ctx, args) => { void openFavorite(favoriteIdFromArgs(args)); return true } })
    actions.register({ id: 'favorites.reveal', title: '定位收藏', group: '收藏', risk: 'normal', scope: 'tab', priority: 100, shortcut: 'Ctrl+Enter', when: (ctx) => ctx.tab === 'favorites', run: (_ctx, args) => { void revealFavorite(favoriteIdFromArgs(args)); return true } })
    actions.register({ id: 'favorites.copyPath', title: '复制收藏路径', group: '收藏', risk: 'normal', scope: 'tab', priority: 95, when: (ctx) => ctx.tab === 'favorites', run: (_ctx, args) => { void copyFavoritePath(favoriteIdFromArgs(args)); return true } })
    actions.register({ id: 'favorites.pick.files', title: '选择文件并审核收藏', group: '收藏', risk: 'data-write', scope: 'tab', priority: 95, shortcut: 'Ctrl+O', when: (ctx) => ctx.tab === 'favorites' && !ctx.favoriteQuickMode, run: () => { void pickFavoritesForReview('file'); return true } })
    actions.register({ id: 'favorites.pick.folders', title: '选择文件夹并审核收藏', group: '收藏', risk: 'data-write', scope: 'tab', priority: 94, shortcut: 'Ctrl+Shift+O', when: (ctx) => ctx.tab === 'favorites' && !ctx.favoriteQuickMode, run: () => { void pickFavoritesForReview('folder'); return true } })
    actions.register({ id: 'favorites.draft.pickPath', title: '为收藏草稿选择路径', group: '收藏', risk: 'normal', scope: 'layer', priority: 96, when: (ctx) => ctx.tab === 'favorites' && ctx.layerIds.includes('favorites-editor'), run: (_ctx, args) => { void pickFavoriteDraftPath(favoritePickKindFromArgs(args)); return true } })
    actions.register({ id: 'favorites.add.duplicateFocus', title: '定位重复收藏', group: '收藏', risk: 'normal', scope: 'tab', priority: 80, when: (ctx) => ctx.tab === 'favorites' && !ctx.favoriteQuickMode, run: (_ctx, args) => focusDuplicateFavorite(typeof args?.id === 'string' ? args.id : null) })
    actions.register({ id: 'favorites.remove', title: '移出收藏', group: '收藏', risk: 'data-write', scope: 'tab', priority: 100, when: (ctx) => ctx.tab === 'favorites' && !ctx.favoriteQuickMode, run: (_ctx, args) => { if (favoriteIdFromArgs(args)) focusFavoriteActionTarget(args); removeFavorite(); return true } })
    actions.register({ id: 'favorites.remove.force', title: '直接移出收藏元数据', group: '收藏', risk: 'destructive', scope: 'tab', priority: 100, when: (ctx) => ctx.tab === 'favorites' && !ctx.favoriteQuickMode, run: (_ctx, args) => { if (favoriteIdFromArgs(args)) focusFavoriteActionTarget(args); removeFavoriteNow(); return true } })
    actions.register({ id: 'favorites.edit', title: '编辑收藏', group: '收藏', risk: 'data-write', scope: 'tab', priority: 95, shortcut: 'F2', when: (ctx) => ctx.tab === 'favorites' && !ctx.favoriteQuickMode, run: (_ctx, args) => { if (favoriteIdFromArgs(args)) focusFavoriteActionTarget(args); return beginFavoriteDraft('edit') } })
    actions.register({ id: 'favorites.rename', title: '重命名收藏', group: '收藏', risk: 'data-write', scope: 'tab', priority: 95, shortcut: 'Shift+F2', when: (ctx) => ctx.tab === 'favorites' && !ctx.favoriteQuickMode, run: (_ctx, args) => { if (favoriteIdFromArgs(args)) focusFavoriteActionTarget(args); return beginFavoriteDraft('rename') } })
    actions.register({ id: 'favorites.save', title: '保存收藏编辑', group: '收藏', risk: 'data-write', scope: 'layer', priority: 100, shortcut: 'Ctrl+S', when: (ctx) => ctx.tab === 'favorites' && ctx.layerIds.includes('favorites-editor'), run: () => saveFavoriteDraft() })
    actions.register({ id: 'favorites.edit.nextField', title: '收藏编辑下一个字段', group: '收藏', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Tab', when: (ctx) => ctx.tab === 'favorites' && ctx.layerIds.includes('favorites-editor'), run: () => cycleFavoriteDraftField(1) })
    actions.register({ id: 'favorites.edit.prevField', title: '收藏编辑上一个字段', group: '收藏', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Shift+Tab', when: (ctx) => ctx.tab === 'favorites' && ctx.layerIds.includes('favorites-editor'), run: () => cycleFavoriteDraftField(-1) })
    actions.register({ id: 'favorites.cancel', title: '取消收藏编辑', group: '收藏', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Escape', when: (ctx) => ctx.tab === 'favorites' && ctx.layerIds.includes('favorites-editor'), run: () => { favoriteDraft = null; notify(); return true } })
    actions.register({ id: 'favorites.pickReview.commit', title: '保存点选收藏', group: '收藏', risk: 'data-write', scope: 'layer', priority: 100, shortcut: 'Ctrl+S', when: (ctx) => ctx.tab === 'favorites' && ctx.layerIds.includes('favorites-pick-review'), run: () => commitFavoritePickReview() })
    actions.register({ id: 'favorites.pickReview.cancel', title: '取消点选收藏', group: '收藏', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Escape', when: (ctx) => ctx.tab === 'favorites' && ctx.layerIds.includes('favorites-pick-review'), run: () => cancelFavoritePickReview() })
    actions.register({ id: 'favorites.pickReview.next', title: '点选审核下一个项目', group: '收藏', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Tab', when: (ctx) => ctx.tab === 'favorites' && ctx.layerIds.includes('favorites-pick-review'), run: () => cycleFavoritePickReview(1) })
    actions.register({ id: 'favorites.pickReview.prev', title: '点选审核上一个项目', group: '收藏', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Shift+Tab', when: (ctx) => ctx.tab === 'favorites' && ctx.layerIds.includes('favorites-pick-review'), run: () => cycleFavoritePickReview(-1) })
    actions.register({ id: 'favorites.search.blur', title: '退出收藏搜索焦点', group: '收藏', risk: 'normal', scope: 'layer', priority: 99, shortcut: 'Escape', when: (ctx) => ctx.tab === 'favorites', run: () => blurSearchFocus() })
    actions.register({ id: 'favorites.drawer.open', title: '打开收藏动作抽屉', description: '展示当前收藏节点或实际目录行可执行动作。', icon: 'drawer', group: '收藏', risk: 'normal', scope: 'tab', priority: 96, shortcut: 'Ctrl+ArrowRight', when: (ctx) => ctx.tab === 'favorites' && !ctx.favoriteQuickMode, run: () => openFavoriteDrawer() })
    actions.register({ id: 'favorites.drawer.close', title: '关闭收藏动作抽屉', description: '关闭右侧收藏动作抽屉。', icon: 'close', group: '收藏', risk: 'normal', scope: 'layer', priority: 96, when: (ctx) => ctx.tab === 'favorites', run: () => closeFavoriteDrawer() })
    actions.register({ id: 'favorites.drawer.next', title: '收藏抽屉下移', description: '移动到下一个收藏抽屉动作。', icon: 'down', group: '收藏', risk: 'normal', scope: 'layer', priority: 96, when: (ctx) => ctx.tab === 'favorites', run: () => moveFavoriteDrawer(1) })
    actions.register({ id: 'favorites.drawer.prev', title: '收藏抽屉上移', description: '移动到上一个收藏抽屉动作。', icon: 'up', group: '收藏', risk: 'normal', scope: 'layer', priority: 96, when: (ctx) => ctx.tab === 'favorites', run: () => moveFavoriteDrawer(-1) })
    actions.register({ id: 'favorites.drawer.select', title: '执行收藏抽屉动作', description: '执行当前高亮的收藏抽屉动作。', icon: 'enter', group: '收藏', risk: 'normal', scope: 'layer', priority: 96, when: (ctx) => ctx.tab === 'favorites', run: () => executeFavoriteDrawerItem() })
    actions.register({ id: 'favorites.directory.open', title: '打开实际目录项', group: '收藏', risk: 'normal', scope: 'row', priority: 92, when: (ctx) => ctx.tab === 'favorites' && !ctx.favoriteQuickMode, run: (_ctx, args) => { void openDirectoryTargets(directoryPathsFromArgs(args)); return true } })
    actions.register({ id: 'favorites.directory.reveal', title: '定位实际目录项', group: '收藏', risk: 'normal', scope: 'row', priority: 92, when: (ctx) => ctx.tab === 'favorites' && !ctx.favoriteQuickMode, run: (_ctx, args) => { void revealDirectoryTargets(directoryPathsFromArgs(args)); return true } })
    actions.register({ id: 'favorites.directory.copyPath', title: '复制实际目录项路径', group: '收藏', risk: 'normal', scope: 'row', priority: 92, when: (ctx) => ctx.tab === 'favorites' && !ctx.favoriteQuickMode, run: (_ctx, args) => { void copyDirectoryTargetPaths(directoryPathsFromArgs(args)); return true } })
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
    actions.register({ id: 'settings.open', title: '打开设置', group: '全局', risk: 'normal', scope: 'global', priority: 10, shortcut: 'Ctrl+Alt+S', when: () => true, run: () => { setTab('settings'); return true } })
    actions.register({ id: 'search.focus', title: '聚焦搜索', group: '全局', risk: 'normal', scope: 'global', priority: 10, shortcut: 'Ctrl+F', when: () => true, run: () => focusSearch() })
    actions.register({ id: 'confirm.cancel', title: '关闭确认弹窗', group: '全局', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Escape', when: (ctx) => ctx.layerIds.includes('confirm'), run: () => { confirm = null; notify(); return true } })
    actions.register({ id: 'confirm.accept', title: '确认当前弹窗', group: '全局', risk: 'data-write', scope: 'layer', priority: 100, shortcut: 'Enter', when: (ctx) => ctx.layerIds.includes('confirm'), run: () => confirmNowInternal() })
    actions.register({ id: 'ports.workspace.reset', title: '重置端口工作区', group: '端口', risk: 'normal', scope: 'tab', priority: 90, shortcut: 'Escape', when: (ctx) => ctx.tab === 'ports', run: () => { resetPortWorkspace(); return true } })
  }

  registerActions()

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
      mqttPane: activeMqttPane,
      mqttDrawerOpen: mqttDrawer.open && mqttDrawer.active,
      mqttDrawerActive: mqttDrawer.open && mqttDrawer.active,
      mqttDetailOpen: mqttDrawer.open && !mqttDrawer.active,
      mqttDetailActive: mqttDrawer.open && !mqttDrawer.active,
      mqttLogDrawerOpen: mqttLogDrawer.open,
      mqttPreviewOpen: mqttPreview.open,
      portDrawerOpen: portDrawer.open,
      portDrawerActive: portDrawer.active,
      favoriteDrawerOpen: favoriteDrawer.open,
      favoriteDrawerActive: favoriteDrawer.active,
      favoritePickReviewOpen: Boolean(favoritePickReview),
      portDetailOpen: portDetail.open,
      portDetailActive: portDetail.active,
      portGroupDetailOpen: portGroupDetail.open,
      portGroupDetailActive: portGroupDetail.active,
      portSelectionMode: selectedPortIds.length > 0
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
      return {
        state,
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
        favoriteGroupSearch,
        favoriteGroupRows: groupFavoriteRows,
        favoriteContainerRows: containerFavoriteRows,
        favoriteItemRows: itemFavoriteRows,
        favoriteVirtualChildRows: currentFavoriteVirtualChildren(),
        favoriteDirectoryEntries: directoryRows,
        favoriteDirectoryError,
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
    setTab,
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
      normalizeFocusedFavorite()
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
      activeFavoritePane = 'groups'
      normalizeFocusedFavoriteGroup()
      notify()
    },
    setFavoriteQuickMode(value: boolean) {
      favoriteQuickMode = value
      activeFavoritePane = 'items'
      if (value) {
        state.activeTab = 'favorites'
        selectedFavoriteGroupId = null
        focusedFavoriteGroupId = null
        favoritePickReview = null
        favoriteDraft = null
        favoriteDirectoryEntries = []
        favoriteDirectoryError = null
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
      notify()
    },
    focusPortGroup(id: string) {
      activePortPane = 'groups'
      groupSidePanelOpen = true
      focusedPortId = null
      focusedPortGroupTarget = { kind: 'group', id }
      focusedPortGroupId = id
      notify()
    },
    focusPortGroupFolder(id: string) {
      activePortPane = 'groups'
      groupSidePanelOpen = true
      focusedPortId = null
      focusedPortGroupTarget = { kind: 'folder', id }
      focusedPortGroupId = null
      notify()
    },
    focusPortGroupTarget(target: PortGroupTarget) {
      activePortPane = 'groups'
      groupSidePanelOpen = true
      focusedPortId = null
      focusedPortGroupTarget = target
      focusedPortGroupId = target.kind === 'group' ? target.id : null
      notify()
    },
    movePortGroupToFolder: moveGroupToFolder,
    focusFavorite(id: string) {
      activeFavoritePane = 'items'
      focusedFavoriteGroupId = null
      focusedFavoriteId = id
      focusedFavoriteDirectoryPath = null
      notify()
    },
    focusFavoriteGroup(id: string) {
      activeFavoritePane = 'groups'
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
      activeFavoritePane = 'items'
      focusedFavoriteId = null
      focusedFavoriteDirectoryPath = normalizeFavoritePath(path)
      notify()
    },
    toggleFavoriteDirectorySelection(path: string) {
      activeFavoritePane = 'items'
      focusedFavoriteId = null
      const normalized = normalizeFavoritePath(path)
      focusedFavoriteDirectoryPath = normalized
      selectedFavoriteDirectoryPaths = selectedFavoriteDirectoryPaths.includes(normalized)
        ? selectedFavoriteDirectoryPaths.filter((item) => item !== normalized)
        : [...selectedFavoriteDirectoryPaths, normalized]
      notify()
    },
    toggleFavoriteCollapse(id: string) {
      state.collapsedFavoriteGroupIds = state.collapsedFavoriteGroupIds.includes(id) ? state.collapsedFavoriteGroupIds.filter((item) => item !== id) : [...state.collapsedFavoriteGroupIds, id]
      collapsedFavoriteIds = collapsedFavoriteIds.includes(id) ? collapsedFavoriteIds.filter((item) => item !== id) : [...collapsedFavoriteIds, id]
      save()
      notify()
    },
    reorderFavorite(nodeId: string, parentId: string | null, beforeNodeId: string | null) {
      state.favorites = moveFavoriteNode(state.favorites, nodeId, parentId, beforeNodeId)
      save()
      notify()
    },
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
        const favoriteSearchFocused = input.activeInputRole === 'favorite-search' || input.activeInputRole === 'favorite-group-search'
        if (state.activeTab === 'favorites' && favoriteDrawer.open && favoriteDrawer.active) {
          closeFavoriteDrawer()
          return 'favorites.drawer.close'
        }
        if (state.activeTab === 'favorites' && favoriteQuickMode && state.favoriteSearch) {
          this.setFavoriteSearch('')
          return 'favorites.search.clear'
        }
        if (state.activeTab === 'favorites' && favoriteQuickMode) {
          void hideAppWindow()
          return 'app.hide'
        }
        if (state.activeTab === 'favorites' && favoriteSearchFocused && (state.favoriteSearch || favoriteGroupSearch)) {
          state.favoriteSearch = ''
          favoriteGroupSearch = ''
          searchBlurRequestId += 1
          save()
          notify()
          return 'favorites.search.clear'
        }
        if (state.activeTab === 'favorites' && favoriteSearchFocused) {
          blurSearchFocus()
          return 'favorites.search.blur'
        }
        if (state.activeTab === 'favorites' && (state.favoriteSearch || favoriteGroupSearch)) {
          state.favoriteSearch = ''
          favoriteGroupSearch = ''
          save()
          notify()
          return 'favorites.search.clear'
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
        if (['ports', 'mqtt', 'favorites', 'settings'].includes(tab) && isTabEnabled(tab)) setTab(tab)
        return binding.actionId
      }
      if (binding.actionId === 'quickJump.openForward' || binding.actionId === 'quickJump.openBackward') {
        return binding.actionId
      }
      if (binding.actionId === 'list.up') {
        moveInList(-1)
        return binding.actionId
      }
      if (binding.actionId === 'list.down') {
        moveInList(1)
        return binding.actionId
      }
      if (binding.actionId === 'list.pageUp') {
        moveInList(-1, true)
        return binding.actionId
      }
      if (binding.actionId === 'list.pageDown') {
        moveInList(1, true)
        return binding.actionId
      }
      if (binding.actionId === 'list.toggleSelection') {
        if (state.activeTab === 'mqtt' && activeMqttPane !== 'messages') return null
        toggleFocusedSelection()
        return binding.actionId
      }
      const result = actions.dispatch({ actionId: binding.actionId, context: context() })
      return result.handled ? binding.actionId : null
    },
    get defaultKeybindings() {
      return buildDefaultKeybindings(state.settings.featureConfigs)
    }
  }
}
