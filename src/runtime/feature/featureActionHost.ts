/** Feature 动作登记宿主：具名引用 createAppRuntime 既有函数与可变绑定，禁止漏斗。 */
import type { RuntimeActionDefinition, RuntimeActionHandlerV7 } from '../action/types'

export interface FeatureActionHostV7 {
  register(action: RuntimeActionDefinition): void
  registerHandler(handler: RuntimeActionHandlerV7): void
  activeFavoritePane: any
  activeMqttPane: any
  activeMqttRecordList: any
  codexController: any
  favoriteAddMenuOpen: any
  favoriteCapabilities: any
  favoriteContainerPanelOpen: any
  favoriteDraft: any
  favoriteRemovalUndo: any
  focusedFavoriteGroupId: any
  lastCodexFloatToggleAt: any
  lastCodexFloatToggleSource: any
  mqttConfigDraft: any
  mqttFavoriteDraft: any
  mqttLogDrawer: any
  mqttPanelOpen: any
  mqttReceiveFilter: any
  mqttSubscriptionPanelOpen: any
  mqttWorkspaceLayout: any
  platform: any
  portGroupDraft: any
  searchFocusRequestId: any
  searchFocusTarget: any
  selectedWindowIds: any
  state: any
  windowActionsMode: any
  windowActionsOpen: any
  windowOperationTraceEnabled: any
  activateFavoriteSlot: (...args: any[]) => any
  activateWindowRow: (...args: any[]) => any
  activateWindowSlot: (...args: any[]) => any
  activationAttemptFor: (...args: any[]) => any
  addSelectedDirectoryEntries: (...args: any[]) => any
  applyFocusedFavoriteContainer: (...args: any[]) => any
  applyFocusedGroup: (...args: any[]) => any
  applyMqttPublishDraftHistory: (...args: any[]) => any
  applyMqttPublishTemplate: (...args: any[]) => any
  applyMqttSubscriptionFilter: (...args: any[]) => any
  applySuggestedFavoriteRunner: (...args: any[]) => any
  assignFavoriteSlot: (...args: any[]) => any
  assignWindowSlot: (...args: any[]) => any
  beginFavoriteDraft: (...args: any[]) => any
  beginMqttConfigDraft: (...args: any[]) => any
  beginMqttConnectionGroupDraft: (...args: any[]) => any
  beginMqttPublishDraftHistoryEdit: (...args: any[]) => any
  beginMqttRecordEdit: (...args: any[]) => any
  beginMqttSubscriptionDraft: (...args: any[]) => any
  beginWindowDraft: (...args: any[]) => any
  blurMqttPublishEditor: (...args: any[]) => any
  blurSearchFocus: (...args: any[]) => any
  cancelFavoritePickReview: (...args: any[]) => any
  cancelFavoriteRunPrompt: (...args: any[]) => any
  cancelMqttConnectionGroupDraft: (...args: any[]) => any
  cancelMqttFavoriteDraft: (...args: any[]) => any
  cancelMqttPublishDraftHistoryEditDraft: (...args: any[]) => any
  cancelMqttRecordEditDraft: (...args: any[]) => any
  cancelMqttSubscriptionDraft: (...args: any[]) => any
  cancelWindowDraft: (...args: any[]) => any
  clearAllMqttSubscriptions: (...args: any[]) => any
  clearCurrentMqttPublishDraftHistory: (...args: any[]) => any
  clearFavoriteSlot: (...args: any[]) => any
  clearMqttLogs: (...args: any[]) => any
  clearMqttRailSelection: (...args: any[]) => any
  clearMqttRecordList: (...args: any[]) => any
  clearPortSelection: (...args: any[]) => any
  clearWindowActivationDiagnostics: (...args: any[]) => any
  clearWindowCandidates: (...args: any[]) => any
  clearWindowOperationTraces: (...args: any[]) => any
  clearWindowSelection: (...args: any[]) => any
  clearWindowSlot: (...args: any[]) => any
  closeFavoriteDrawer: (...args: any[]) => any
  closeFavoriteSlotManager: (...args: any[]) => any
  closeMqttCommandFocusSurfaces: (...args: any[]) => any
  closeMqttDrawer: (...args: any[]) => any
  closeMqttPreview: (...args: any[]) => any
  closeMqttPublishDraftHistory: (...args: any[]) => any
  closeMqttPublishOptions: (...args: any[]) => any
  closeMqttTopicFilter: (...args: any[]) => any
  closePortDetail: (...args: any[]) => any
  closePortDrawer: (...args: any[]) => any
  closePortGroupDetail: (...args: any[]) => any
  closeWindowActions: (...args: any[]) => any
  closeWindowRows: (...args: any[]) => any
  commitFavoritePickReview: (...args: any[]) => any
  configureFavoriteSlotHotkey: (...args: any[]) => any
  configureWindowSlotHotkey: (...args: any[]) => any
  confirmKill: (...args: any[]) => any
  confirmKillGroup: (...args: any[]) => any
  connectMqtt: (...args: any[]) => any
  copyDirectoryTargetPaths: (...args: any[]) => any
  copyFavoriteItems: (...args: any[]) => any
  copyFavoritePath: (...args: any[]) => any
  copyFavoriteRunCommand: (...args: any[]) => any
  copyFavoriteRunLogPath: (...args: any[]) => any
  copyMqttConnectionAddress: (...args: any[]) => any
  copyMqttRecordAll: (...args: any[]) => any
  copyMqttRecordPayload: (...args: any[]) => any
  copyMqttRecordTopic: (...args: any[]) => any
  copyMqttSubscriptionTopic: (...args: any[]) => any
  copySelectedMqttRecordPayloads: (...args: any[]) => any
  copySelectedMqttRecordTopics: (...args: any[]) => any
  copySelectedMqttRecordsAsMergedJson: (...args: any[]) => any
  copyWindowHandle: (...args: any[]) => any
  createGroupFromSelection: (...args: any[]) => any
  createPortGroupFolder: (...args: any[]) => any
  currentPortGroupSelection: (...args: any[]) => any
  cycleFavoriteDraftField: (...args: any[]) => any
  cycleFavoritePane: (...args: any[]) => any
  cycleFavoritePickReview: (...args: any[]) => any
  deleteFocusedGroup: (...args: any[]) => any
  deleteFocusedMqttConnection: (...args: any[]) => any
  deleteFocusedMqttSubscription: (...args: any[]) => any
  deleteMqttConfigPublishRow: (...args: any[]) => any
  deleteMqttConfigSubscriptionRow: (...args: any[]) => any
  deleteMqttConnectionGroupById: (...args: any[]) => any
  deleteMqttPublishDraftHistoryEntry: (...args: any[]) => any
  deleteMqttSubscriptionDraftRow: (...args: any[]) => any
  deleteMqttTemplate: (...args: any[]) => any
  deleteSelectedMqttConnections: (...args: any[]) => any
  deleteSelectedMqttLog: (...args: any[]) => any
  deleteSelectedMqttRecord: (...args: any[]) => any
  deleteSelectedMqttSubscriptions: (...args: any[]) => any
  directoryPathsFromArgs: (...args: any[]) => any
  disconnectMqtt: (...args: any[]) => any
  executeFavoriteDrawerItem: (...args: any[]) => any
  executeMqttDrawerItem: (...args: any[]) => any
  executePortDrawerItem: (...args: any[]) => any
  executeQuickFavoriteAt: (...args: any[]) => any
  favoriteActionTargetKind: (...args: any[]) => any
  favoriteIdFromArgs: (...args: any[]) => any
  favoriteMqttPublishDraftHistory: (...args: any[]) => any
  favoritePickKindFromArgs: (...args: any[]) => any
  favoriteWindowRows: (...args: any[]) => any
  fillMqttPublishDraftFromSelection: (...args: any[]) => any
  finishWindowActivation: (...args: any[]) => any
  focusDuplicateFavorite: (...args: any[]) => any
  focusFavoriteActionTarget: (...args: any[]) => any
  focusFavoriteGroupSearch: (...args: any[]) => any
  focusFavoriteSearch: (...args: any[]) => any
  focusFocusedGroupMatches: (...args: any[]) => any
  focusMqttConfigPublishEditor: (...args: any[]) => any
  focusMqttConfigSubscriptionEditor: (...args: any[]) => any
  focusMqttPublishDraftHistory: (...args: any[]) => any
  focusMqttPublishEditor: (...args: any[]) => any
  focusMqttRecordFromArgs: (...args: any[]) => any
  focusMqttRecordList: (...args: any[]) => any
  focusMqttSubscription: (...args: any[]) => any
  focusMqttTopicFilter: (...args: any[]) => any
  focusPortGroupSearch: (...args: any[]) => any
  focusPortPane: (...args: any[]) => any
  focusPortSearch: (...args: any[]) => any
  focusWindowSlot: (...args: any[]) => any
  folderFromTarget: (...args: any[]) => any
  groupFromTarget: (...args: any[]) => any
  isTabEnabled: (...args: any[]) => any
  killPortTargets: (...args: any[]) => any
  killPorts: (...args: any[]) => any
  loadSelectedFavoriteDirectory: (...args: any[]) => any
  moveFavoriteDrawer: (...args: any[]) => any
  moveMqttConfigDraftField: (...args: any[]) => any
  moveMqttConfigPublishRow: (...args: any[]) => any
  moveMqttConfigSubscriptionRow: (...args: any[]) => any
  moveMqttConnectionGroupDraftField: (...args: any[]) => any
  moveMqttConnectionTreeFromArgs: (...args: any[]) => any
  moveMqttDrawer: (...args: any[]) => any
  moveMqttPane: (...args: any[]) => any
  moveMqttPublishDraftHistory: (...args: any[]) => any
  moveMqttPublishDraftHistoryEditField: (...args: any[]) => any
  moveMqttPublishField: (...args: any[]) => any
  moveMqttPublishOptions: (...args: any[]) => any
  moveMqttRecordEditDraftField: (...args: any[]) => any
  moveMqttSubscriptionDraftField: (...args: any[]) => any
  moveMqttSubscriptionDraftRow: (...args: any[]) => any
  moveMqttTopicFilter: (...args: any[]) => any
  movePortDrawer: (...args: any[]) => any
  movePortGroupDraftField: (...args: any[]) => any
  moveWindowDraftField: (...args: any[]) => any
  mqttFocusedGroupIdFromArgs: (...args: any[]) => any
  mqttPublishTemplateIdFromArgs: (...args: any[]) => any
  mqttSubscriptionTopicFromArgs: (...args: any[]) => any
  navigateFocusedWindowTree: (...args: any[]) => any
  notify: (...args: any[]) => any
  openDirectoryTargets: (...args: any[]) => any
  openFavorite: (...args: any[]) => any
  openFavoriteDrawer: (...args: any[]) => any
  openFavoriteRunLog: (...args: any[]) => any
  openFavoriteSlotManager: (...args: any[]) => any
  openFolderRenameDraft: (...args: any[]) => any
  openGroupDraft: (...args: any[]) => any
  openMqttDrawer: (...args: any[]) => any
  openMqttPreview: (...args: any[]) => any
  openMqttPublishOptions: (...args: any[]) => any
  openPortDetail: (...args: any[]) => any
  openPortDrawer: (...args: any[]) => any
  openPortGroupDetail: (...args: any[]) => any
  openWindowActions: (...args: any[]) => any
  openWindowSlotActions: (...args: any[]) => any
  persistMqttLayoutPrefs: (...args: any[]) => any
  pickFavoriteDraftPath: (...args: any[]) => any
  pickFavoritesForReview: (...args: any[]) => any
  refreshFavoritePathInspections: (...args: any[]) => any
  refreshMqttConfigClientId: (...args: any[]) => any
  refreshWindows: (...args: any[]) => any
  removeFavorite: (...args: any[]) => any
  removeFavoriteNow: (...args: any[]) => any
  renameMqttTemplate: (...args: any[]) => any
  renameSelectedMqttRecord: (...args: any[]) => any
  reorderFavoriteMetadata: (...args: any[]) => any
  repeatMqttPublishRecords: (...args: any[]) => any
  requestMqttFocus: (...args: any[]) => any
  resetFavoriteLearning: (...args: any[]) => any
  resetMqttLayoutRatio: (...args: any[]) => any
  resetPortWorkspace: (...args: any[]) => any
  resizeMqttLayout: (...args: any[]) => any
  revealDirectoryTargets: (...args: any[]) => any
  revealFavorite: (...args: any[]) => any
  revealFavoriteRunLog: (...args: any[]) => any
  save: (...args: any[]) => any
  saveCurrentMqttPublishDraftHistory: (...args: any[]) => any
  saveCurrentMqttPublishTemplate: (...args: any[]) => any
  saveFavoriteDraft: (...args: any[]) => any
  saveMqttConfigDraft: (...args: any[]) => any
  saveMqttConnectionGroupDraft: (...args: any[]) => any
  saveMqttFavoriteDraft: (...args: any[]) => any
  saveMqttPublishDraftHistoryEditDraft: (...args: any[]) => any
  saveMqttRecordEditDraft: (...args: any[]) => any
  saveMqttSubscriptionDraft: (...args: any[]) => any
  savePortGroupDraft: (...args: any[]) => any
  saveSelectedMqttRecordsAsMergedJson: (...args: any[]) => any
  saveWindowDraft: (...args: any[]) => any
  scanPorts: (...args: any[]) => any
  scrollMqttPreview: (...args: any[]) => any
  selectMqttPublishOption: (...args: any[]) => any
  selectMqttSubscription: (...args: any[]) => any
  selectMqttTopicFilter: (...args: any[]) => any
  selectedFavoriteMetadataIds: (...args: any[]) => any
  sendMqttPublishDraft: (...args: any[]) => any
  sendMqttPublishDraftHistory: (...args: any[]) => any
  sendMqttPublishTemplate: (...args: any[]) => any
  setMessage: (...args: any[]) => any
  setMqttConnectionGroupCollapsed: (...args: any[]) => any
  setMqttHistorySearch: (...args: any[]) => any
  setMqttPreviewScroll: (...args: any[]) => any
  setMqttTemplateSearch: (...args: any[]) => any
  setMqttTopicFilterSearch: (...args: any[]) => any
  setMqttWorkspaceLayout: (...args: any[]) => any
  setTab: (...args: any[]) => any
  setWindowAlwaysOnTop: (...args: any[]) => any
  setWindowGroupExpanded: (...args: any[]) => any
  submitFavoriteRunPrompt: (...args: any[]) => any
  targetFromArgs: (...args: any[]) => any
  toggleFocusedGroupFolder: (...args: any[]) => any
  toggleGroupPanel: (...args: any[]) => any
  toggleMqttConnectionGroupCollapse: (...args: any[]) => any
  toggleMqttConnectionSelection: (...args: any[]) => any
  toggleMqttFollowLatest: (...args: any[]) => any
  toggleMqttPublishDraftHistory: (...args: any[]) => any
  toggleMqttPublishDraftHistorySelection: (...args: any[]) => any
  toggleMqttRecordFavorite: (...args: any[]) => any
  toggleMqttRecordSelectionFromArgs: (...args: any[]) => any
  toggleMqttSubscriptionSelection: (...args: any[]) => any
  togglePortPane: (...args: any[]) => any
  toggleWindowFavorite: (...args: any[]) => any
  toggleWindowPins: (...args: any[]) => any
  undoFavoriteRemoval: (...args: any[]) => any
  updateToolPreviewPrefs: (...args: any[]) => any
  useMqttSubscriptionAsPublishTopic: (...args: any[]) => any
  whenWindowInteraction: (...args: any[]) => any
}
