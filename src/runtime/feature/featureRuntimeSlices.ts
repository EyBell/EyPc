import type { AppRuntimeSnapshot } from '../appRuntime'
import type { AppState } from '../../domain/types'

export type PortsFeatureStateV7 = Readonly<Pick<AppState, 'portSearch' | 'portGroupFolders'>>
export type MqttFeatureStateV7 = Readonly<Pick<AppState, 'mqtt'>>
export type FavoritesFeatureStateV7 = Readonly<Pick<AppState,
  'favoriteSearch' | 'favorites' | 'favoriteSlots' | 'collapsedFavoriteGroupIds'
>>
export type WindowsFeatureStateV7 = Readonly<Pick<AppState, 'windowSearch' | 'windowSlots' | 'windowTargets'>>
export type SettingsFeatureStateV7 = Readonly<Pick<AppState, 'settings' | 'settingsTabId' | 'settingsMaintenanceSectionId'>>
export interface TabShellStateV7 {
  readonly activeTab: AppState['activeTab']
  readonly settings: Readonly<Pick<AppState['settings'], 'featureConfigs'>>
}

export type PortsRuntimeSliceV7 = Pick<AppRuntimeSnapshot,
  | 'activePortPane' | 'commandShortcutLabels' | 'confirm' | 'filteredPorts' | 'focusedPortGroupTarget'
  | 'focusedPortId' | 'groupSidePanelOpen' | 'portDetail' | 'portDetailTarget' | 'portDrawer'
  | 'portDrawerItems' | 'portGroupDetail' | 'portGroupDetailTarget' | 'portGroupDraft' | 'portGroupRows'
  | 'portGroupSearch' | 'portSearchError' | 'ports' | 'selectedPortGroupTarget' | 'selectedPortIds'
> & { readonly state: PortsFeatureStateV7 }

export type MqttRuntimeSliceV7 = Pick<AppRuntimeSnapshot,
  | 'activeMqttPane' | 'activeMqttRecordList' | 'commandShortcutLabels' | 'mqttActiveConfig' | 'mqttFollowLatest'
  | 'mqttActiveSubscriptionTopics' | 'mqttArchive' | 'mqttConfigDraft' | 'mqttConnectionGroupDraft'
  | 'mqttConnectionRows' | 'mqttConnectionStatus' | 'mqttDrawer' | 'mqttDrawerItems' | 'mqttFavoriteDraft'
  | 'mqttFocusRequestId' | 'mqttFocusTarget' | 'mqttHistorySearch' | 'mqttLayoutPrefs' | 'mqttLogDrawer'
  | 'mqttLogs' | 'mqttMessageRows' | 'mqttMessageStats' | 'mqttPanelOpen' | 'mqttPreview'
  | 'mqttPublishDraftHistoryActiveIndex' | 'mqttPublishDraftHistoryEditDraft' | 'mqttPublishDraftHistoryOpen'
  | 'mqttPublishDraftHistoryRows' | 'mqttPublishDraftHistorySelectedIds' | 'mqttPublishHistoryRows'
  | 'mqttPublishOptionsActiveIndex' | 'mqttPublishOptionsOpen' | 'mqttPublishRecordsOpen' | 'mqttPublishScratch'
  | 'mqttPublishTemplateRows' | 'mqttReceiveFilter' | 'mqttRecordEditDraft' | 'mqttRecordListStates'
  | 'mqttSearch' | 'mqttSelectedConfigIds' | 'mqttSelectedLog' | 'mqttSelectedRecord'
  | 'mqttSelectedSubscriptionTopics' | 'mqttSubscriptionDraft' | 'mqttSubscriptionPanelOpen' | 'mqttSubscriptionRows'
  | 'mqttTemplateSearch' | 'mqttTopicFilterOpen' | 'mqttTopicFilterOptions' | 'mqttTopicFilterQuery'
  | 'mqttWorkspaceLayout' | 'searchBlurRequestId' | 'searchFocusRequestId' | 'searchFocusTarget'
  | 'toolPreviewPrefs'
> & { readonly state: MqttFeatureStateV7 }

export type FavoritesRuntimeSliceV7 = Pick<AppRuntimeSnapshot,
  | 'activeFavoritePane' | 'commandShortcutLabels' | 'favoriteAddMenuOpen' | 'favoriteCapabilities'
  | 'favoriteContainerPanelOpen' | 'favoriteContainerRows' | 'favoriteCurrentPlatform' | 'favoriteDirectoryEntries'
  | 'favoriteDirectoryError' | 'favoriteDirectoryLoading' | 'favoriteDraft' | 'favoriteDrawer' | 'favoriteDrawerItems'
  | 'favoriteGroupSearch' | 'favoriteItemRows' | 'favoritePaneFocusRequestId' | 'favoriteParentOptions'
  | 'favoritePathInspections' | 'favoritePickReview' | 'favoriteRunSummaries' | 'favoriteSlotManagerOpen'
  | 'favoriteSlotManagerTargetId' | 'favoriteVirtualChildRows' | 'focusedFavoriteDirectoryPath'
  | 'focusedFavoriteGroupId' | 'focusedFavoriteId' | 'message' | 'selectedFavoriteContainer'
  | 'selectedFavoriteDirectoryPaths' | 'selectedFavoriteGroupId' | 'selectedFavoriteIds'
> & { readonly state: FavoritesFeatureStateV7 }

export type QuickFavoritesRuntimeSliceV7 = Pick<FavoritesRuntimeSliceV7,
  | 'commandShortcutLabels' | 'favoriteCapabilities' | 'favoriteCurrentPlatform' | 'favoriteDrawer'
  | 'favoriteDrawerItems' | 'favoriteItemRows' | 'favoritePathInspections' | 'favoriteRunSummaries'
  | 'focusedFavoriteId' | 'message' | 'selectedFavoriteIds' | 'state'
>

export type WindowsRuntimeSliceV7 = Pick<AppRuntimeSnapshot,
  | 'commandShortcutLabels' | 'focusedWindowId' | 'selectedWindowIds' | 'windowActionSlot'
  | 'windowActionTarget' | 'windowActionTargets' | 'windowActionsContext' | 'windowActionsMode' | 'windowActionsOpen'
  | 'windowActivationDiagnostics' | 'windowCacheUpdatedAt' | 'windowCapability' | 'windowDraft'
  | 'windowListLoaded' | 'windowLoading' | 'windowOperationTraceEnabled' | 'windowOperationTraces'
  | 'windowRebind' | 'windowRows'
> & { readonly state: WindowsFeatureStateV7 }

export type TabShellRuntimeSliceV7 = Pick<AppRuntimeSnapshot,
  | 'visibleFeatures' | 'favoriteQuickMode' | 'commandShortcutLabels' | 'confirm' | 'favoriteRunPrompt'
  | 'groupPanelFocusRequestId' | 'groupSidePanelOpen' | 'listFocusRequestId' | 'listFocusTarget'
  | 'searchBlurRequestId' | 'searchFocusRequestId' | 'searchFocusTarget' | 'windowActionsFocusRequestId'
  | 'windowActionsOpen' | 'windowDraft' | 'windowFocusRequestId' | 'activeFavoritePane' | 'activePortPane'
  | 'focusedWindowId'
> & { readonly state: TabShellStateV7 }

export type SettingsRuntimeSliceV7 = Pick<AppRuntimeSnapshot,
  | 'runtimeDiagnostics' | 'mqttStorageStatus' | 'toolPreviewPrefs'
  | 'windowActivationDiagnostics' | 'windowOperationTraceEnabled' | 'windowOperationTraces'
> & { readonly state: SettingsFeatureStateV7 }

export type CodexRuntimeSliceV7 = Pick<AppRuntimeSnapshot, 'codex'>

type RuntimeSliceKey<T> = Extract<keyof T, keyof AppRuntimeSnapshot>

function selectRuntimeFieldsV7<TSlice extends object>(
  snapshot: AppRuntimeSnapshot,
  keys: readonly RuntimeSliceKey<TSlice>[]
): TSlice {
  const selected: Partial<AppRuntimeSnapshot> = {}
  for (const key of keys) selected[key] = snapshot[key] as never
  return Object.freeze(selected) as TSlice
}

const PORTS_RUNTIME_FIELDS_V7 = [
  'activePortPane', 'commandShortcutLabels', 'confirm', 'filteredPorts', 'focusedPortGroupTarget',
  'focusedPortId', 'groupSidePanelOpen', 'portDetail', 'portDetailTarget', 'portDrawer',
  'portDrawerItems', 'portGroupDetail', 'portGroupDetailTarget', 'portGroupDraft', 'portGroupRows',
  'portGroupSearch', 'portSearchError', 'ports', 'selectedPortGroupTarget', 'selectedPortIds'
] as const satisfies readonly RuntimeSliceKey<PortsRuntimeSliceV7>[]

const MQTT_RUNTIME_FIELDS_V7 = [
  'activeMqttPane', 'activeMqttRecordList', 'commandShortcutLabels', 'mqttActiveConfig', 'mqttFollowLatest',
  'mqttActiveSubscriptionTopics', 'mqttArchive', 'mqttConfigDraft', 'mqttConnectionGroupDraft',
  'mqttConnectionRows', 'mqttConnectionStatus', 'mqttDrawer', 'mqttDrawerItems', 'mqttFavoriteDraft',
  'mqttFocusRequestId', 'mqttFocusTarget', 'mqttHistorySearch', 'mqttLayoutPrefs', 'mqttLogDrawer',
  'mqttLogs', 'mqttMessageRows', 'mqttMessageStats', 'mqttPanelOpen', 'mqttPreview',
  'mqttPublishDraftHistoryActiveIndex', 'mqttPublishDraftHistoryEditDraft', 'mqttPublishDraftHistoryOpen',
  'mqttPublishDraftHistoryRows', 'mqttPublishDraftHistorySelectedIds', 'mqttPublishHistoryRows',
  'mqttPublishOptionsActiveIndex', 'mqttPublishOptionsOpen', 'mqttPublishRecordsOpen', 'mqttPublishScratch',
  'mqttPublishTemplateRows', 'mqttReceiveFilter', 'mqttRecordEditDraft', 'mqttRecordListStates',
  'mqttSearch', 'mqttSelectedConfigIds', 'mqttSelectedLog', 'mqttSelectedRecord',
  'mqttSelectedSubscriptionTopics', 'mqttSubscriptionDraft', 'mqttSubscriptionPanelOpen', 'mqttSubscriptionRows',
  'mqttTemplateSearch', 'mqttTopicFilterOpen', 'mqttTopicFilterOptions', 'mqttTopicFilterQuery',
  'mqttWorkspaceLayout', 'searchBlurRequestId', 'searchFocusRequestId', 'searchFocusTarget',
  'toolPreviewPrefs'
] as const satisfies readonly RuntimeSliceKey<MqttRuntimeSliceV7>[]

const FAVORITES_RUNTIME_FIELDS_V7 = [
  'activeFavoritePane', 'commandShortcutLabels', 'favoriteAddMenuOpen', 'favoriteCapabilities',
  'favoriteContainerPanelOpen', 'favoriteContainerRows', 'favoriteCurrentPlatform', 'favoriteDirectoryEntries',
  'favoriteDirectoryError', 'favoriteDirectoryLoading', 'favoriteDraft', 'favoriteDrawer', 'favoriteDrawerItems',
  'favoriteGroupSearch', 'favoriteItemRows', 'favoritePaneFocusRequestId', 'favoriteParentOptions',
  'favoritePathInspections', 'favoritePickReview', 'favoriteRunSummaries', 'favoriteSlotManagerOpen',
  'favoriteSlotManagerTargetId', 'favoriteVirtualChildRows', 'focusedFavoriteDirectoryPath',
  'focusedFavoriteGroupId', 'focusedFavoriteId', 'message', 'selectedFavoriteContainer',
  'selectedFavoriteDirectoryPaths', 'selectedFavoriteGroupId', 'selectedFavoriteIds'
] as const satisfies readonly RuntimeSliceKey<FavoritesRuntimeSliceV7>[]

const QUICK_FAVORITES_RUNTIME_FIELDS_V7 = [
  'commandShortcutLabels', 'favoriteCapabilities', 'favoriteCurrentPlatform', 'favoriteDrawer',
  'favoriteDrawerItems', 'favoriteItemRows', 'favoritePathInspections', 'favoriteRunSummaries',
  'focusedFavoriteId', 'message', 'selectedFavoriteIds'
] as const satisfies readonly RuntimeSliceKey<QuickFavoritesRuntimeSliceV7>[]

const WINDOWS_RUNTIME_FIELDS_V7 = [
  'commandShortcutLabels', 'focusedWindowId', 'selectedWindowIds', 'windowActionSlot',
  'windowActionTarget', 'windowActionTargets', 'windowActionsContext', 'windowActionsMode', 'windowActionsOpen',
  'windowActivationDiagnostics', 'windowCacheUpdatedAt', 'windowCapability', 'windowDraft',
  'windowListLoaded', 'windowLoading', 'windowOperationTraceEnabled', 'windowOperationTraces',
  'windowRebind', 'windowRows'
] as const satisfies readonly RuntimeSliceKey<WindowsRuntimeSliceV7>[]

const TAB_SHELL_RUNTIME_FIELDS_V7 = [
  'visibleFeatures', 'favoriteQuickMode', 'commandShortcutLabels', 'confirm', 'favoriteRunPrompt',
  'groupPanelFocusRequestId', 'groupSidePanelOpen', 'listFocusRequestId', 'listFocusTarget',
  'searchBlurRequestId', 'searchFocusRequestId', 'searchFocusTarget', 'windowActionsFocusRequestId',
  'windowActionsOpen', 'windowDraft', 'windowFocusRequestId', 'activeFavoritePane', 'activePortPane',
  'focusedWindowId'
] as const satisfies readonly RuntimeSliceKey<TabShellRuntimeSliceV7>[]

const SETTINGS_RUNTIME_FIELDS_V7 = [
  'runtimeDiagnostics', 'mqttStorageStatus', 'toolPreviewPrefs', 'windowActivationDiagnostics',
  'windowOperationTraceEnabled', 'windowOperationTraces'
] as const satisfies readonly RuntimeSliceKey<SettingsRuntimeSliceV7>[]

const CODEX_RUNTIME_FIELDS_V7 = ['codex'] as const satisfies readonly RuntimeSliceKey<CodexRuntimeSliceV7>[]

export const selectPortsRuntimeSliceV7 = (snapshot: AppRuntimeSnapshot): PortsRuntimeSliceV7 => Object.freeze({
  ...selectRuntimeFieldsV7<Omit<PortsRuntimeSliceV7, 'state'>>(snapshot, PORTS_RUNTIME_FIELDS_V7),
  state: Object.freeze({
    portSearch: snapshot.state.portSearch,
    portGroupFolders: Object.freeze(snapshot.state.portGroupFolders.map((item) => Object.freeze({ ...item }))) as AppState['portGroupFolders']
  })
})

export const selectMqttRuntimeSliceV7 = (snapshot: AppRuntimeSnapshot): MqttRuntimeSliceV7 => Object.freeze({
  ...selectRuntimeFieldsV7<Omit<MqttRuntimeSliceV7, 'state'>>(snapshot, MQTT_RUNTIME_FIELDS_V7),
  state: Object.freeze({
    mqtt: Object.freeze({
      ...snapshot.state.mqtt,
      configs: Object.freeze(snapshot.state.mqtt.configs.map((item) => Object.freeze({ ...item }))) as AppState['mqtt']['configs'],
      connectionGroups: Object.freeze(snapshot.state.mqtt.connectionGroups.map((item) => Object.freeze({ ...item }))) as AppState['mqtt']['connectionGroups']
    }) as AppState['mqtt']
  })
})

export const selectFavoritesRuntimeSliceV7 = (snapshot: AppRuntimeSnapshot): FavoritesRuntimeSliceV7 => Object.freeze({
  ...selectRuntimeFieldsV7<Omit<FavoritesRuntimeSliceV7, 'state'>>(snapshot, FAVORITES_RUNTIME_FIELDS_V7),
  state: Object.freeze({
    favoriteSearch: snapshot.state.favoriteSearch,
    favorites: Object.freeze(snapshot.state.favorites.map((item) => Object.freeze({ ...item }))) as AppState['favorites'],
    favoriteSlots: Object.freeze(snapshot.state.favoriteSlots.map((item) => Object.freeze({ ...item }))) as AppState['favoriteSlots'],
    collapsedFavoriteGroupIds: Object.freeze([...snapshot.state.collapsedFavoriteGroupIds]) as AppState['collapsedFavoriteGroupIds']
  })
})

export const selectQuickFavoritesRuntimeSliceV7 = (snapshot: AppRuntimeSnapshot): QuickFavoritesRuntimeSliceV7 => Object.freeze({
  ...selectRuntimeFieldsV7<Omit<QuickFavoritesRuntimeSliceV7, 'state'>>(snapshot, QUICK_FAVORITES_RUNTIME_FIELDS_V7),
  state: selectFavoritesRuntimeSliceV7(snapshot).state
})

export const selectWindowsRuntimeSliceV7 = (snapshot: AppRuntimeSnapshot): WindowsRuntimeSliceV7 => Object.freeze({
  ...selectRuntimeFieldsV7<Omit<WindowsRuntimeSliceV7, 'state'>>(snapshot, WINDOWS_RUNTIME_FIELDS_V7),
  state: Object.freeze({
    windowSearch: snapshot.state.windowSearch,
    windowSlots: Object.freeze(snapshot.state.windowSlots.map((item) => Object.freeze({ ...item }))) as AppState['windowSlots'],
    windowTargets: Object.freeze(snapshot.state.windowTargets.map((item) => Object.freeze({ ...item }))) as AppState['windowTargets']
  })
})

export const selectTabShellRuntimeSliceV7 = (snapshot: AppRuntimeSnapshot): TabShellRuntimeSliceV7 => Object.freeze({
  ...selectRuntimeFieldsV7<Omit<TabShellRuntimeSliceV7, 'state'>>(snapshot, TAB_SHELL_RUNTIME_FIELDS_V7),
  state: Object.freeze({
    activeTab: snapshot.state.activeTab,
    settings: Object.freeze({
      featureConfigs: Object.freeze(snapshot.state.settings.featureConfigs.map((item) => Object.freeze({ ...item }))) as AppState['settings']['featureConfigs']
    })
  })
})

export const selectSettingsRuntimeSliceV7 = (snapshot: AppRuntimeSnapshot): SettingsRuntimeSliceV7 => Object.freeze({
  ...selectRuntimeFieldsV7<Omit<SettingsRuntimeSliceV7, 'state'>>(snapshot, SETTINGS_RUNTIME_FIELDS_V7),
  state: Object.freeze({
    settings: Object.freeze({
      ...snapshot.state.settings,
      featureConfigs: Object.freeze(snapshot.state.settings.featureConfigs.map((item) => Object.freeze({ ...item }))) as AppState['settings']['featureConfigs'],
      keybindingOverrides: Object.freeze(snapshot.state.settings.keybindingOverrides.map((item) => Object.freeze({ ...item }))) as AppState['settings']['keybindingOverrides']
    }) as AppState['settings'],
    settingsTabId: snapshot.state.settingsTabId,
    settingsMaintenanceSectionId: snapshot.state.settingsMaintenanceSectionId
  })
})

export const selectCodexRuntimeSliceV7 = (snapshot: AppRuntimeSnapshot) =>
  selectRuntimeFieldsV7<CodexRuntimeSliceV7>(snapshot, CODEX_RUNTIME_FIELDS_V7)
