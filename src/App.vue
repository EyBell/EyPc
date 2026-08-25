<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue'
import { normalizeAppState } from './domain/state'
import { getPlatform } from './platform/eypcPlatform'
import ConfirmLayer from './components/ConfirmLayer.vue'
import FavoriteRunPromptLayer from './components/FavoriteRunPromptLayer.vue'
import OperationTooltipLayer from './components/OperationTooltipLayer.vue'
import QuickJumpLayer from './components/QuickJumpLayer.vue'
import TabShell from './components/TabShell.vue'
import { moveQuickJumpActive, resolveQuickJumpQuery } from './domain/quickJump'
import { createAppRuntime } from './runtime/appRuntime'
import { routePluginFeature } from './runtime/feature/featureRouting'
import {
  selectTabShellRuntimeSliceV7,
  type CodexRuntimeSliceV7,
  type FavoritesRuntimeSliceV7,
  type MqttRuntimeSliceV7,
  type PortsRuntimeSliceV7,
  type SettingsRuntimeSliceV7,
  type WindowsRuntimeSliceV7
} from './runtime/feature/featureRuntimeSlices'
import { featureModuleV7 } from './runtime/feature/featureModules'
import { createRuntimeSliceV7, type RuntimeSliceOwnerV7 } from './runtime/runtimeSlice'
import { activeInputRoleFromTarget, blockHandledShortcutEvent, isEditableTarget, shortcutFromEvent, shouldEnableShiftPreview } from './runtime/keyboardEvent'
import { createShortcutHintTiming } from './runtime/shortcutHintTiming'
import { createQuickJumpRegistryV7, defaultQuickJumpTargetVisibleV7, type QuickJumpDomTargetV7 } from './ui/quickJumpRegistry'
import { dispatchKeyboardContextMenuV7 } from './ui/contextMenuKeyboard'

const platform = getPlatform()
const PortsPage = defineAsyncComponent(() => import('./pages/PortsPage.vue'))
const FavoritesPage = defineAsyncComponent(() => import('./pages/FavoritesPage.vue'))
const QuickFavoritesPage = defineAsyncComponent(() => import('./pages/QuickFavoritesPage.vue'))
const WindowsPage = defineAsyncComponent(() => import('./pages/WindowsPage.vue'))
const MqttPage = defineAsyncComponent(() => import('./pages/MqttPage.vue'))
const CodexPage = defineAsyncComponent(() => import('./pages/CodexPage.vue'))
const SettingsPage = defineAsyncComponent(() => import('./pages/SettingsPage.vue'))
const runtime = createAppRuntime(normalizeAppState(platform.storage.getState()))
const companionVersion = ref(0)
const shiftPreview = ref(false)
const shortcutHints = ref(false)
const initialMaintenanceSection = ref<'features' | null>(null)
const appRoot = ref<HTMLElement | null>(null)
const operationTooltipLayer = ref<{ handleSurfaceKeydown: (event: KeyboardEvent) => void } | null>(null)
let disposeCompanionRuntime: (() => void) | null = null
let disposeEnterPayload: (() => void) | null = null
let disposeFloatAction: (() => void) | null = null
let disposeActionRunnerAction: (() => void) | null = null
const shortcutHintTiming = createShortcutHintTiming({
  show: () => { shortcutHints.value = true },
  hide: () => { shortcutHints.value = false }
})

const featureSliceSource = {
  readSnapshot: runtime.snapshot,
  subscribeDomain: runtime.subscribeDomain
}

function createFeatureSlice<TView>(id: 'ports' | 'mqtt' | 'favorites' | 'windows' | 'codex' | 'settings') {
  return featureModuleV7(id).createSlice(featureSliceSource) as RuntimeSliceOwnerV7<TView>
}

const shellSlice = createRuntimeSliceV7({
  id: 'shell',
  readSource: runtime.snapshot,
  select: selectTabShellRuntimeSliceV7,
  subscribeSource: (listener) => runtime.subscribeDomain('shell', listener)
})
const portsSlice = createFeatureSlice<PortsRuntimeSliceV7>('ports')
const mqttSlice = createFeatureSlice<MqttRuntimeSliceV7>('mqtt')
const favoritesSlice = createFeatureSlice<FavoritesRuntimeSliceV7>('favorites')
const windowsSlice = createFeatureSlice<WindowsRuntimeSliceV7>('windows')
const codexSlice = createFeatureSlice<CodexRuntimeSliceV7>('codex')
const settingsSlice = createFeatureSlice<SettingsRuntimeSliceV7>('settings')
const runtimeSlices = [shellSlice, portsSlice, mqttSlice, favoritesSlice, windowsSlice, codexSlice, settingsSlice] as const
const featureSlices = {
  ports: portsSlice,
  mqtt: mqttSlice,
  favorites: favoritesSlice,
  windows: windowsSlice,
  codex: codexSlice,
  settings: settingsSlice
} as const
let synchronizingFeatureSlices = false

function featureEnabled(id: keyof typeof featureSlices): boolean {
  return shellSlice.snapshot().state.settings.featureConfigs.find((item) => item.id === id)?.enabled !== false
}

function shouldSubscribeFeatureSlice(id: keyof typeof featureSlices): boolean {
  const activeTab = shellSlice.snapshot().state.activeTab
  if (id === activeTab) return true
  const module = featureModuleV7(id)
  if (!featureEnabled(id)) return false
  if (module.lifecycle.backgroundPolicy === 'entry-enabled') return true
  if (module.lifecycle.backgroundPolicy === 'connected-only') {
    return ['connecting', 'connected', 'reconnecting'].includes(mqttSlice.snapshot().mqttConnectionStatus.state)
  }
  return false
}

function synchronizeFeatureSliceSubscriptions(): void {
  if (synchronizingFeatureSlices) return
  synchronizingFeatureSlices = true
  try {
    for (const [id, slice] of Object.entries(featureSlices) as [keyof typeof featureSlices, typeof featureSlices[keyof typeof featureSlices]][]) {
      if (shouldSubscribeFeatureSlice(id)) slice.start()
      else slice.stop()
    }
  } finally {
    synchronizingFeatureSlices = false
  }
}

synchronizeFeatureSliceSubscriptions()
const runtimeSliceVersions = ref<Record<string, number>>(Object.fromEntries(runtimeSlices.map((slice) => [slice.id, slice.revision])))
const disposeRuntimeSliceListeners = runtimeSlices.map((slice) => slice.subscribe((revision) => {
  runtimeSliceVersions.value = { ...runtimeSliceVersions.value, [slice.id]: revision }
  if (slice.id === 'shell' || slice.id === 'feature:mqtt') synchronizeFeatureSliceSubscriptions()
}))

const snapshot = computed(() => {
  runtimeSliceVersions.value.shell
  return shellSlice.snapshot()
})
const tabShellSnapshot = snapshot
const portsSnapshot = computed(() => { runtimeSliceVersions.value['feature:ports']; return portsSlice.snapshot() })
const mqttSnapshot = computed(() => { runtimeSliceVersions.value['feature:mqtt']; return mqttSlice.snapshot() })
const favoritesSnapshot = computed(() => { runtimeSliceVersions.value['feature:favorites']; return favoritesSlice.snapshot() })
const quickFavoritesSnapshot = computed(() => favoritesSnapshot.value)
const windowsSnapshot = computed(() => { runtimeSliceVersions.value['feature:windows']; return windowsSlice.snapshot() })
const codexSnapshot = computed(() => { runtimeSliceVersions.value['feature:codex']; return codexSlice.snapshot() })
const settingsSnapshot = computed(() => { runtimeSliceVersions.value['feature:settings']; return settingsSlice.snapshot() })
const companionPresentation = computed(() => {
  companionVersion.value
  return runtime.companionPresentationSnapshot()
})
const runtimeReloadRequired = computed(() => platform.runtimeIdentityStatus?.status === 'reload-required')
const runtimeReloadMessage = computed(() => platform.runtimeIdentityStatus?.message || 'Preload 与 UI 版本不一致，需要重新接入或重载')
const confirmRestoreFocusSelectors = computed(() => {
  if (snapshot.value.state.activeTab !== 'favorites') return []
  return [...new Set([
    `[data-role="favorite-${snapshot.value.activeFavoritePane}"]`,
    '[data-role="favorite-items"]',
    '.favorite-add-button',
    '[data-role="favorite-containers"]'
  ])]
})

type QuickJumpDirection = 'forward' | 'backward'

type QuickJumpDomTarget = QuickJumpDomTargetV7

interface QuickJumpState {
  open: boolean
  direction: QuickJumpDirection
  query: string
  sourceTargets: QuickJumpDomTarget[]
  targets: QuickJumpDomTarget[]
  activeTargetId: string | null
}

const QUICK_JUMP_TARGET_SELECTOR = [
  '[data-quick-jump-target]',
  '[data-mqtt-shortcut-hint]',
  'button:not(:disabled)',
  'a[href]',
  'input:not([type="hidden"]):not(:disabled)',
  'textarea:not(:disabled)',
  'select:not(:disabled)',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="treeitem"]',
  '[role="textbox"]',
  '[role="searchbox"]'
].join(',')
const QUICK_JUMP_EDITING_SELECTOR = [
  '[data-role$="-editor"]',
  '[data-role="favorite-pick-review"]',
  '[data-role="settings-shortcut-record"]'
].join(',')
const quickJumpRegistry = createQuickJumpRegistryV7({ surfaceId: 'main', root: () => appRoot.value, fallbackSelector: QUICK_JUMP_TARGET_SELECTOR })

const quickJump = ref<QuickJumpState>({
  open: false,
  direction: 'forward',
  query: '',
  sourceTargets: [],
  targets: [],
  activeTargetId: null
})

function isQuickJumpCommandTarget(element: HTMLElement) {
  return element.hasAttribute('data-quick-jump-target')
    || element.hasAttribute('data-mqtt-shortcut-hint')
    || element.matches('a[href], [role="button"], [role="menuitem"]')
    || element.matches('button:not(:disabled)')
}

function isQuickJumpFocusableTarget(element: HTMLElement) {
  return element.matches('input:not([type="hidden"]):not(:disabled), textarea:not(:disabled), select:not(:disabled), [contenteditable="true"], [role="textbox"], [role="searchbox"]')
}

function isQuickJumpEditingSurfaceTarget(element: HTMLElement) {
  return isQuickJumpCommandTarget(element) || isQuickJumpFocusableTarget(element)
}

function isVisibleQuickJumpTarget(element: HTMLElement) {
  if (element.closest('[data-quick-jump-ignore]') && !element.hasAttribute('data-quick-jump-target')) return false
  if (element.closest(QUICK_JUMP_EDITING_SELECTOR) && !isQuickJumpEditingSurfaceTarget(element)) return false
  if (isEditableTarget(element) && !isQuickJumpFocusableTarget(element)) return false
  return defaultQuickJumpTargetVisibleV7(element)
}

function collectQuickJumpTargets(direction: QuickJumpDirection): QuickJumpDomTarget[] {
  return quickJumpRegistry.collect({ backward: direction === 'backward', accept: isVisibleQuickJumpTarget })
}

function clearQuickJumpActiveTarget() {
  appRoot.value?.querySelectorAll<HTMLElement>('[data-quick-jump-active="true"]').forEach((element) => {
    delete element.dataset.quickJumpActive
  })
}

function syncQuickJumpActiveTarget(scroll = false) {
  clearQuickJumpActiveTarget()
  if (!quickJump.value.open || !quickJump.value.activeTargetId) return
  const target = quickJump.value.targets.find((item) => item.id === quickJump.value.activeTargetId)
  if (!target) return
  target.element.dataset.quickJumpActive = 'true'
  if (scroll) target.element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

function closeQuickJump() {
  quickJump.value = {
    open: false,
    direction: 'forward',
    query: '',
    sourceTargets: [],
    targets: [],
    activeTargetId: null
  }
  clearQuickJumpActiveTarget()
}

function openQuickJump(direction: QuickJumpDirection) {
  const targets = collectQuickJumpTargets(direction)
  if (!targets.length) return false
  quickJump.value = {
    open: true,
    direction,
    query: '',
    sourceTargets: targets,
    targets,
    activeTargetId: targets[0]?.id || null
  }
  syncQuickJumpActiveTarget(true)
  return true
}

function activateQuickJumpTarget(targetId = quickJump.value.activeTargetId) {
  const target = targetId
    ? quickJump.value.sourceTargets.find((item) => item.id === targetId) || quickJump.value.targets.find((item) => item.id === targetId)
    : null
  if (!target) return false
  runtime.dispatch('codex.quickJump.activate', { source: 'manual-quick-jump' })
  closeQuickJump()
  target.element.focus({ preventScroll: true })
  target.element.click()
  return true
}

function applyQuickJumpQuery(query: string) {
  const result = resolveQuickJumpQuery(quickJump.value.sourceTargets, query)
  quickJump.value = {
    ...quickJump.value,
    query: result.query,
    targets: result.targets,
    activeTargetId: result.activeTargetId
  }
  syncQuickJumpActiveTarget(true)
  if (result.exactTargetId) activateQuickJumpTarget(result.exactTargetId)
}

function quickJumpLetter(shortcutId: string) {
  return /^[A-Z]$/.test(shortcutId) ? shortcutId.toLocaleLowerCase() : null
}

function handleQuickJumpShortcut(shortcutId: string) {
  if (!quickJump.value.open) return false
  if (shortcutId === 'Escape') {
    if (quickJump.value.query) {
      applyQuickJumpQuery('')
      return true
    }
    closeQuickJump()
    return true
  }
  if (shortcutId === 'Enter') {
    activateQuickJumpTarget()
    return true
  }
  if (shortcutId === 'ArrowDown' || shortcutId === 'Ctrl+J') {
    quickJump.value.activeTargetId = moveQuickJumpActive(quickJump.value.targets, quickJump.value.activeTargetId, 1)
    syncQuickJumpActiveTarget(true)
    return true
  }
  if (shortcutId === 'ArrowUp' || shortcutId === 'Ctrl+K') {
    quickJump.value.activeTargetId = moveQuickJumpActive(quickJump.value.targets, quickJump.value.activeTargetId, -1)
    syncQuickJumpActiveTarget(true)
    return true
  }
  if (shortcutId === 'Backspace') {
    applyQuickJumpQuery(quickJump.value.query.slice(0, -1))
    return true
  }
  const letter = quickJumpLetter(shortcutId)
  if (letter) {
    applyQuickJumpQuery(`${quickJump.value.query}${letter}`)
    return true
  }
  return true
}

function onKeydown(event: KeyboardEvent) {
  operationTooltipLayer.value?.handleSurfaceKeydown(event)
  if (dispatchKeyboardContextMenuV7(event, appRoot.value || document)) return
  shiftPreview.value = shouldEnableShiftPreview(event)
  const shortcutId = shortcutFromEvent(event)
  // Own Escape/Quick Jump in capture before uTools host exit and before defaultPrevented short-circuits.
  if (quickJump.value.open && shortcutId === 'Escape') {
    blockHandledShortcutEvent(event)
    if (quickJump.value.query) applyQuickJumpQuery('')
    else closeQuickJump()
    return
  }
  if (handleQuickJumpShortcut(shortcutId)) {
    blockHandledShortcutEvent(event)
    return
  }
  if (event.defaultPrevented) return
  shortcutHintTiming.keydown(event)
  const textInputFocused = isEditableTarget(event.target)
  const handled = runtime.handleShortcut(shortcutId, {
    textInputFocused,
    activeInputRole: activeInputRoleFromTarget(event.target, snapshot.value.state.activeTab)
  })
  if (handled && typeof handled === 'object') {
    if (handled.consumed) blockHandledShortcutEvent(event)
    return
  }
  if (handled === 'quickJump.openForward') {
    if (openQuickJump('forward')) blockHandledShortcutEvent(event)
    return
  }
  if (handled === 'quickJump.openBackward') {
    if (openQuickJump('backward')) blockHandledShortcutEvent(event)
    return
  }
  if (handled) blockHandledShortcutEvent(event)
}

function onKeyup(event: KeyboardEvent) {
  shiftPreview.value = shouldEnableShiftPreview(event)
  shortcutHintTiming.keyup(event)
}

function clearShiftPreview() {
  shiftPreview.value = false
  shortcutHintTiming.clear()
}

function applyPluginRoute(payload: { code?: string } | null) {
  const route = routePluginFeature(payload, snapshot.value.state.settings.featureConfigs, snapshot.value.state.activeTab)
  const isWindowSlot = /^eypc-window-slot-(?:[1-9]|10)$/.test(payload?.code || '')
  const isFavoriteSlot = /^eypc-favorite-slot-(?:[1-9]|10)$/.test(payload?.code || '')
  const restoreEntry = !payload?.code || payload.code === 'eypc-main' || payload.code === 'eypc-codex-toggle' || (!isWindowSlot && !isFavoriteSlot && !['eypc-ports', 'eypc-mqtt', 'eypc-favorites', 'eypc-favorites-quick', 'eypc-windows', 'eypc-codex', 'eypc-settings'].includes(payload.code))
  initialMaintenanceSection.value = route.settingsMaintenanceSection || null
  if (typeof route.favoriteQuick === 'boolean') runtime.setFavoriteQuickMode(route.favoriteQuick)
  else if (!restoreEntry) runtime.setFavoriteQuickMode(false)
  if (!route.hideAfterAction && !route.preserveCurrentTab) runtime.setTab(route.tab)
  if (route.actionId) {
    runtime.dispatch(route.actionId, { source: 'utools-feature', ...(route.actionArgs || {}) })
    if (route.hideAfterAction && route.visibilityOwner !== 'mainHide' && !isWindowSlot) requestAnimationFrame(() => { void platform.app.hide() })
    else if (payload?.code === 'eypc-codex-toggle' && route.visibilityOwner !== 'mainHide') requestAnimationFrame(() => { platform.app.show?.() })
  }
  if (route.focusSearch) {
    runtime.dispatch(route.tab === 'favorites' ? 'favorites.search.focus' : route.tab === 'mqtt' ? 'mqtt.search.focus' : route.tab === 'windows' ? 'windows.search.focus' : 'search.focus')
  }
}

watch(() => snapshot.value.searchFocusRequestId, () => {
  requestAnimationFrame(() => {
    const target = snapshot.value.searchFocusTarget === 'port-groups'
      ? 'port-group-search'
      : snapshot.value.searchFocusTarget === 'favorite-groups'
        ? 'favorite-group-search'
        : snapshot.value.searchFocusTarget === 'mqtt'
          ? 'mqtt-record-search'
        : snapshot.value.searchFocusTarget === 'mqtt-templates'
          ? 'mqtt-template-search'
        : snapshot.value.searchFocusTarget === 'mqtt-history'
          ? 'mqtt-history-search'
        : snapshot.value.searchFocusTarget === 'favorites'
          ? 'favorite-search'
          : snapshot.value.searchFocusTarget === 'windows'
            ? 'window-search'
          : 'port-search'
    const input = document.querySelector<HTMLInputElement>(`[data-role="${target}"]`)
    input?.focus()
    if (input) input.setSelectionRange(input.value.length, input.value.length)
  })
})

watch(() => snapshot.value.searchBlurRequestId, () => {
  requestAnimationFrame(() => {
    const active = document.activeElement as HTMLElement | null
    const role = active?.closest<HTMLElement>('[data-role]')?.dataset.role
    if (role === 'port-search' || role === 'mqtt-search' || role === 'mqtt-record-search' || role === 'mqtt-template-search' || role === 'mqtt-history-search' || role === 'favorite-search' || role === 'favorite-group-search' || role === 'window-search' || role === 'port-group-search' || role === 'primary-search') active?.blur()
  })
})

watch(() => snapshot.value.groupPanelFocusRequestId, () => {
  requestAnimationFrame(() => {
    if (snapshot.value.state.activeTab !== 'ports' || !snapshot.value.groupSidePanelOpen || snapshot.value.activePortPane !== 'groups') return
    document.querySelector<HTMLElement>('[data-role="port-groups-panel"]')?.focus()
  })
})

watch(() => snapshot.value.listFocusRequestId, () => {
  requestAnimationFrame(() => {
    if (snapshot.value.state.activeTab !== 'ports') return
    const role = snapshot.value.listFocusTarget === 'groups' ? 'port-groups-panel' : 'port-results-list'
    document.querySelector<HTMLElement>(`[data-role="${role}"]`)?.focus()
  })
})

watch(() => snapshot.value.windowFocusRequestId, () => {
  requestAnimationFrame(() => {
    if (snapshot.value.state.activeTab !== 'windows') return
    const draft = snapshot.value.windowDraft
    if (draft) {
      document.querySelector<HTMLElement>(`[data-role="window-editor"] [data-field="${draft.activeField}"]`)?.focus()
      return
    }
    // List navigation always owns the keyboard; action-panel focus uses windowActionsFocusRequestId.
    const list = document.querySelector<HTMLElement>('[data-role="window-list"]')
    list?.focus()
    const focusedId = snapshot.value.focusedWindowId
    if (!focusedId) return
    const row = document.getElementById(`window-row-${encodeURIComponent(focusedId).replace(/%/g, '_')}`)
    row?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })
})

watch(() => snapshot.value.windowActionsFocusRequestId, () => {
  requestAnimationFrame(() => {
    if (snapshot.value.state.activeTab !== 'windows' || !snapshot.value.windowActionsOpen || snapshot.value.windowDraft) return
    document.querySelector<HTMLElement>('[data-role="window-actions"] button:not([disabled])')?.focus()
  })
})

watch(companionPresentation, (payload) => {
  platform.float.sync(payload)
}, { deep: true, immediate: true })

onMounted(() => {
  disposeCompanionRuntime = runtime.subscribeDomain('companion', () => {
    companionVersion.value += 1
  })
  window.addEventListener('keydown', onKeydown, true)
  window.addEventListener('keyup', onKeyup, true)
  window.addEventListener('blur', clearShiftPreview)
  runtime.startCodex()
  applyPluginRoute(platform.getEnterPayload())
  disposeEnterPayload = platform.onEnterPayload?.((payload) => {
    applyPluginRoute(payload)
  }) || null
  disposeFloatAction = platform.float.onAction(({ actionId, args }) => {
    runtime.dispatch(actionId, args)
  })
  disposeActionRunnerAction = platform.actionRunner?.onAction(({ actionId, args }) => {
    runtime.dispatch(actionId, args)
  }) || null
  platform.clearEnterPayload()
  void runtime.scanPorts()
})

onUnmounted(() => {
  disposeCompanionRuntime?.()
  disposeRuntimeSliceListeners.forEach((dispose) => dispose())
  runtimeSlices.forEach((slice) => slice.dispose())
  disposeEnterPayload?.()
  disposeFloatAction?.()
  disposeActionRunnerAction?.()
  runtime.dispose()
  // Do not float.close() here. mainHide global shortcuts remount the main
  // renderer while the companion float must stay; sync({ visible:false }),
  // feature disable, and onPluginOut(true) own teardown.
  shortcutHintTiming.dispose()
  window.removeEventListener('keydown', onKeydown, true)
  window.removeEventListener('keyup', onKeyup, true)
  window.removeEventListener('blur', clearShiftPreview)
})
</script>

<template>
  <main ref="appRoot" class="app-shell" :class="{ 'shift-preview': shiftPreview }">
    <div v-if="runtimeReloadRequired" class="runtime-reload-banner" role="alert">
      <strong>任务操作已暂停：</strong>{{ runtimeReloadMessage }}
    </div>
    <TabShell
      :active-tab="snapshot.state.activeTab"
      :command-shortcut-labels="snapshot.commandShortcutLabels"
      :show-shortcut-hints="shortcutHints"
      :snapshot="tabShellSnapshot"
      @select="(tab) => runtime.dispatch(`tab.select.${tab}`)"
    >
      <template #ports>
        <PortsPage
          :snapshot="portsSnapshot"
          :shift-preview="shiftPreview"
          :show-shortcut-hints="shortcutHints"
          @search="runtime.setPortSearch"
          @group-search="runtime.setPortGroupSearch"
          @scan="runtime.scanPorts"
          @focus="runtime.focusPort"
          @toggle="runtime.togglePortSelection"
          @focus-group="runtime.focusPortGroup"
          @focus-group-target="runtime.focusPortGroupTarget"
          @move-group-to-folder="runtime.movePortGroupToFolder"
          @update-group-draft="runtime.updatePortGroupDraft"
          @save-group-draft="runtime.savePortGroupDraft"
          @cancel-group-draft="runtime.cancelPortGroupDraft"
          @dispatch="runtime.dispatch"
        />
      </template>
      <template #mqtt>
        <MqttPage
          :snapshot="mqttSnapshot"
          :shift-preview="shiftPreview"
          :show-shortcut-hints="shortcutHints"
          @search="runtime.setMqttSearch"
          @focus-config="runtime.focusMqttConfig"
          @focus-connection-group="runtime.focusMqttConnectionGroup"
          @focus-session="runtime.focusMqttSession"
          @focus-message="runtime.focusMqttMessage"
          @focus-log="runtime.focusMqttLog"
          @update-config-draft="runtime.updateMqttConfigDraft"
          @update-connection-group-draft="runtime.updateMqttConnectionGroupDraft"
          @update-subscription-draft="runtime.updateMqttSubscriptionDraft"
          @update-favorite-draft="runtime.updateMqttFavoriteDraft"
          @update-record-edit-draft="runtime.updateMqttRecordEditDraft"
          @update-publish-draft-history-edit-draft="runtime.updateMqttPublishDraftHistoryEditDraft"
          @update-publish-draft="runtime.updateMqttPublishDraft"
          @dispatch="runtime.dispatch"
        />
      </template>
      <template #favorites>
        <QuickFavoritesPage
          v-if="snapshot.favoriteQuickMode"
          :snapshot="quickFavoritesSnapshot"
          :show-shortcut-hints="shortcutHints"
          @search="runtime.setFavoriteSearch"
          @focus="runtime.focusFavorite"
          @dispatch="runtime.dispatch"
        />
        <FavoritesPage
          v-else
          :snapshot="favoritesSnapshot"
          :show-shortcut-hints="shortcutHints"
          @search="runtime.setFavoriteSearch"
          @group-search="runtime.setFavoriteGroupSearch"
          @focus="runtime.focusFavorite"
          @focus-group="runtime.focusFavoriteGroup"
          @focus-directory="runtime.focusFavoriteDirectory"
          @toggle="runtime.toggleFavoriteSelection"
          @toggle-directory="runtime.toggleFavoriteDirectorySelection"
          @collapse="runtime.toggleFavoriteCollapse"
          @add="runtime.addFavorite"
          @remove="runtime.removeFavorite"
          @reorder="(nodeId, parentId, beforeNodeId) => runtime.dispatch('favorites.reorder', { nodeId, parentId, beforeNodeId })"
          @update-pick-review-item="runtime.updateFavoritePickReviewItem"
          @update-favorite-draft="runtime.updateFavoriteDraft"
          @save-favorite-draft="runtime.saveFavoriteDraft"
          @cancel-favorite-draft="runtime.cancelFavoriteDraft"
          @dispatch="runtime.dispatch"
        />
      </template>
      <template #windows>
        <WindowsPage
          :snapshot="windowsSnapshot"
          :show-shortcut-hints="shortcutHints"
          @search="runtime.setWindowSearch"
          @focus="runtime.focusWindow"
          @update-draft="runtime.updateWindowDraft"
          @cancel-draft="runtime.cancelWindowDraft"
          @dispatch="runtime.dispatch"
        />
      </template>
      <template #codex>
        <CodexPage
          :snapshot="codexSnapshot.codex"
          @dispatch="runtime.dispatch"
        />
      </template>
      <template #settings>
        <SettingsPage
          :overrides="settingsSnapshot.state.settings.keybindingOverrides"
          :shortcut-profiles="settingsSnapshot.state.settings.shortcutProfiles"
          :feature-configs="settingsSnapshot.state.settings.featureConfigs"
          :initial-maintenance-section="initialMaintenanceSection"
          :persisted-settings-tab-id="settingsSnapshot.state.settingsTabId"
          :persisted-maintenance-section-id="settingsSnapshot.state.settingsMaintenanceSectionId"
          :settings="settingsSnapshot.state.settings"
          :runtime-diagnostics="settingsSnapshot.runtimeDiagnostics"
          :mqtt-storage-status="settingsSnapshot.mqttStorageStatus"
          :window-activation-diagnostics="settingsSnapshot.windowActivationDiagnostics"
          :window-operation-trace-enabled="settingsSnapshot.windowOperationTraceEnabled"
          :window-operation-traces="settingsSnapshot.windowOperationTraces"
          @update-keybinding="runtime.updateKeybinding"
          @reset-keybinding="runtime.resetKeybinding"
          @save-shortcut-profiles="runtime.saveShortcutProfiles"
          @save-feature-configs="runtime.saveFeatureConfigs"
          @update-tool-preview-prefs="(input) => runtime.dispatch('tool.preview.hover.update', input)"
          @update-settings-path="runtime.setSettingsPath"
          @dispatch="runtime.dispatch"
        />
      </template>
    </TabShell>
    <ConfirmLayer
      v-if="snapshot.confirm"
      :title="snapshot.confirm.title"
      :detail="snapshot.confirm.detail"
      :restore-focus-selectors="confirmRestoreFocusSelectors"
      @cancel="runtime.cancelConfirm"
      @confirm="runtime.confirmNow"
    />
    <FavoriteRunPromptLayer
      v-if="snapshot.favoriteRunPrompt"
      :prompt="snapshot.favoriteRunPrompt"
      @update="runtime.updateFavoriteRunPrompt"
      @submit="runtime.submitFavoriteRunPrompt"
      @cancel="runtime.cancelFavoriteRunPrompt"
    />
    <OperationTooltipLayer ref="operationTooltipLayer" :suspended="quickJump.open" />
    <QuickJumpLayer
      v-if="quickJump.open"
      :targets="quickJump.targets"
      :active-target-id="quickJump.activeTargetId"
    />
  </main>
</template>
