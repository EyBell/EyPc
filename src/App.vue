<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue'
import { normalizeAppState } from './domain/state'
import { getPlatform } from './platform/eypcPlatform'
import ConfirmLayer from './components/ConfirmLayer.vue'
import OperationTooltipLayer from './components/OperationTooltipLayer.vue'
import QuickJumpLayer from './components/QuickJumpLayer.vue'
import TabShell from './components/TabShell.vue'
import PortsPage from './pages/PortsPage.vue'
import FavoritesPage from './pages/FavoritesPage.vue'
import QuickFavoritesPage from './pages/QuickFavoritesPage.vue'
import SettingsPage from './pages/SettingsPage.vue'
import { assignQuickJumpMarkers, moveQuickJumpActive, resolveQuickJumpQuery } from './domain/quickJump'
import type { QuickJumpTarget } from './domain/quickJump'
import { quickJumpHitStackContainsTarget, quickJumpHitTestPoints } from './domain/quickJumpHitTest'
import { createAppRuntime } from './runtime/appRuntime'
import { routePluginFeature } from './runtime/feature/featureRouting'
import { activeInputRoleFromTarget, blockHandledShortcutEvent, isEditableTarget, shortcutFromEvent, shouldEnableShiftPreview } from './runtime/keyboardEvent'
import { createShortcutHintTiming } from './runtime/shortcutHintTiming'

const platform = getPlatform()
const MqttPage = defineAsyncComponent(() => import('./pages/MqttPage.vue'))
const runtime = createAppRuntime(normalizeAppState(platform.storage.getState()))
const version = ref(0)
const shiftPreview = ref(false)
const shortcutHints = ref(false)
const initialMaintenanceSection = ref<'features' | null>(null)
const appRoot = ref<HTMLElement | null>(null)
let disposeRuntime: (() => void) | null = null
let disposeEnterPayload: (() => void) | null = null
const shortcutHintTiming = createShortcutHintTiming({
  show: () => { shortcutHints.value = true },
  hide: () => { shortcutHints.value = false }
})
const snapshot = computed(() => {
  version.value
  return runtime.snapshot()
})
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

interface QuickJumpDomTarget extends QuickJumpTarget {
  element: HTMLElement
}

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

const quickJump = ref<QuickJumpState>({
  open: false,
  direction: 'forward',
  query: '',
  sourceTargets: [],
  targets: [],
  activeTargetId: null
})

function targetText(element: HTMLElement, attribute: string) {
  const value = element.getAttribute(attribute)
  return value ? value.replace(/\s+/g, ' ').trim() : ''
}

function quickJumpLabel(element: HTMLElement) {
  return targetText(element, 'data-quick-jump-label')
    || targetText(element, 'aria-label')
    || targetText(element, 'title')
    || targetText(element, 'placeholder')
    || targetText(element, 'data-mqtt-shortcut-hint')
    || targetText(element, 'data-role')
    || (element.textContent || '').replace(/\s+/g, ' ').trim()
    || (element.tagName === 'BUTTON' ? 'button' : '')
}

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

function quickJumpStyleHidden(style: CSSStyleDeclaration) {
  return style.display === 'none'
    || style.visibility === 'hidden'
    || Number(style.opacity) === 0
    || style.pointerEvents === 'none'
}

function quickJumpClippingAncestor(element: HTMLElement) {
  const style = window.getComputedStyle(element)
  return /(auto|scroll|hidden|clip)/.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`)
}

function quickJumpVisibleRect(element: HTMLElement) {
  const sourceRect = element.getBoundingClientRect()
  let left = Math.max(0, sourceRect.left)
  let top = Math.max(0, sourceRect.top)
  let right = Math.min(window.innerWidth, sourceRect.right)
  let bottom = Math.min(window.innerHeight, sourceRect.bottom)
  for (let current = element.parentElement; current; current = current.parentElement) {
    const style = window.getComputedStyle(current)
    if (quickJumpStyleHidden(style)) return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }
    if (quickJumpClippingAncestor(current)) {
      const rect = current.getBoundingClientRect()
      left = Math.max(left, rect.left)
      top = Math.max(top, rect.top)
      right = Math.min(right, rect.right)
      bottom = Math.min(bottom, rect.bottom)
    }
  }
  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top)
  }
}

function quickJumpHitTargetVisible(element: HTMLElement, visibleRect: ReturnType<typeof quickJumpVisibleRect>) {
  if (typeof document.elementsFromPoint !== 'function') return true
  return quickJumpHitTestPoints(visibleRect).some((point) => quickJumpHitStackContainsTarget(element, document.elementsFromPoint(point.x, point.y)))
}

function isVisibleQuickJumpTarget(element: HTMLElement) {
  if (element.closest('[data-quick-jump-ignore]') && !element.hasAttribute('data-quick-jump-target')) return false
  if (element.closest(QUICK_JUMP_EDITING_SELECTOR) && !isQuickJumpEditingSurfaceTarget(element)) return false
  if (isEditableTarget(element) && !isQuickJumpFocusableTarget(element)) return false
  if (element.getAttribute('aria-hidden') === 'true' || element.getAttribute('aria-disabled') === 'true') return false
  const rect = element.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return false
  const style = window.getComputedStyle(element)
  if (quickJumpStyleHidden(style)) return false
  const visibleRect = quickJumpVisibleRect(element)
  if (visibleRect.width < 6 || visibleRect.height < 6) return false
  if (!(visibleRect.bottom >= 0 && visibleRect.right >= 0 && visibleRect.top <= window.innerHeight && visibleRect.left <= window.innerWidth)) return false
  return quickJumpHitTargetVisible(element, visibleRect)
}

function collectQuickJumpTargets(direction: QuickJumpDirection): QuickJumpDomTarget[] {
  const root = appRoot.value || document.body
  const elements = Array.from(root.querySelectorAll<HTMLElement>(QUICK_JUMP_TARGET_SELECTOR))
  const seen = new Set<HTMLElement>()
  const targets = elements
    .filter((element) => {
      if (seen.has(element) || !isVisibleQuickJumpTarget(element)) return false
      seen.add(element)
      return true
    })
    .map((element, index) => {
      const rect = element.getBoundingClientRect()
      const label = quickJumpLabel(element)
      return {
        id: element.getAttribute('data-quick-jump-id') || `${index}:${label}:${Math.round(rect.left)}:${Math.round(rect.top)}`,
        label,
        searchText: [
          targetText(element, 'data-quick-jump-search'),
          targetText(element, 'data-role'),
          targetText(element, 'data-mqtt-shortcut-hint')
        ].filter(Boolean).join(' '),
        element
      }
    })
    .filter((target) => Boolean(target.label))
  return assignQuickJumpMarkers(direction === 'backward' ? targets.reverse() : targets)
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
  shiftPreview.value = shouldEnableShiftPreview(event)
  if (event.defaultPrevented) return
  const shortcutId = shortcutFromEvent(event)
  if (handleQuickJumpShortcut(shortcutId)) {
    blockHandledShortcutEvent(event)
    return
  }
  shortcutHintTiming.keydown(event)
  const textInputFocused = isEditableTarget(event.target)
  const handled = runtime.handleShortcut(shortcutId, {
    textInputFocused,
    activeInputRole: activeInputRoleFromTarget(event.target, snapshot.value.state.activeTab)
  })
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
  const restoreEntry = !payload?.code || payload.code === 'eypc-main' || !['eypc-ports', 'eypc-mqtt', 'eypc-favorites', 'eypc-favorites-quick', 'eypc-settings'].includes(payload.code)
  initialMaintenanceSection.value = route.settingsMaintenanceSection || null
  if (typeof route.favoriteQuick === 'boolean') runtime.setFavoriteQuickMode(route.favoriteQuick)
  else if (!restoreEntry) runtime.setFavoriteQuickMode(false)
  runtime.setTab(route.tab)
  if (route.focusSearch) {
    runtime.dispatch(route.tab === 'favorites' ? 'favorites.search.focus' : route.tab === 'mqtt' ? 'mqtt.search.focus' : 'search.focus')
  }
  if (route.favoriteQuick) {
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-role="favorite-items"]')?.focus())
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
    if (role === 'port-search' || role === 'mqtt-search' || role === 'mqtt-record-search' || role === 'mqtt-template-search' || role === 'mqtt-history-search' || role === 'favorite-search' || role === 'favorite-group-search' || role === 'port-group-search' || role === 'primary-search') active?.blur()
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

onMounted(() => {
  disposeRuntime = runtime.subscribe(() => {
    version.value += 1
  })
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('keyup', onKeyup)
  window.addEventListener('blur', clearShiftPreview)
  applyPluginRoute(platform.getEnterPayload())
  disposeEnterPayload = platform.onEnterPayload?.((payload) => {
    applyPluginRoute(payload)
  }) || null
  platform.clearEnterPayload()
  void runtime.scanPorts()
})

onUnmounted(() => {
  disposeRuntime?.()
  disposeEnterPayload?.()
  shortcutHintTiming.dispose()
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('keyup', onKeyup)
  window.removeEventListener('blur', clearShiftPreview)
})
</script>

<template>
  <main ref="appRoot" class="app-shell" :class="{ 'shift-preview': shiftPreview }">
    <TabShell
      :active-tab="snapshot.state.activeTab"
      :command-shortcut-labels="snapshot.commandShortcutLabels"
      :show-shortcut-hints="shortcutHints"
      :snapshot="snapshot"
      @select="(tab) => runtime.dispatch(`tab.select.${tab}`)"
    >
      <template #ports>
        <PortsPage
          :snapshot="snapshot"
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
          :snapshot="snapshot"
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
          :snapshot="snapshot"
          :show-shortcut-hints="shortcutHints"
          @search="runtime.setFavoriteSearch"
          @focus="runtime.focusFavorite"
          @dispatch="runtime.dispatch"
        />
        <FavoritesPage
          v-else
          :snapshot="snapshot"
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
      <template #settings>
        <SettingsPage
          :actions="runtime.actions()"
          :default-keybindings="runtime.defaultKeybindings"
          :overrides="snapshot.state.settings.keybindingOverrides"
          :shortcut-profiles="snapshot.state.settings.shortcutProfiles"
          :feature-configs="snapshot.state.settings.featureConfigs"
          :initial-maintenance-section="initialMaintenanceSection"
          :settings="snapshot.state.settings"
          :mqtt-storage-status="snapshot.mqttStorageStatus"
          @update-keybinding="runtime.updateKeybinding"
          @reset-keybinding="runtime.resetKeybinding"
          @save-shortcut-profiles="runtime.saveShortcutProfiles"
          @save-feature-configs="runtime.saveFeatureConfigs"
          @update-tool-preview-prefs="(input) => runtime.dispatch('tool.preview.hover.update', input)"
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
    <OperationTooltipLayer :suspended="quickJump.open" />
    <QuickJumpLayer
      v-if="quickJump.open"
      :targets="quickJump.targets"
      :active-target-id="quickJump.activeTargetId"
    />
  </main>
</template>
