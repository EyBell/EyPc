<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { normalizeAppState } from './domain/state'
import { getPlatform } from './platform/eypcPlatform'
import ConfirmLayer from './components/ConfirmLayer.vue'
import TabShell from './components/TabShell.vue'
import PortsPage from './pages/PortsPage.vue'
import FavoritesPage from './pages/FavoritesPage.vue'
import SettingsPage from './pages/SettingsPage.vue'
import { createAppRuntime } from './runtime/appRuntime'
import { routePluginFeature } from './runtime/feature/featureRouting'
import { activeInputRoleFromTarget, blockHandledShortcutEvent, isEditableTarget, shortcutFromEvent } from './runtime/keyboardEvent'
import { createShortcutHintTiming } from './runtime/shortcutHintTiming'

const platform = getPlatform()
const runtime = createAppRuntime(normalizeAppState(platform.storage.getState()))
const version = ref(0)
const shiftPreview = ref(false)
const shortcutHints = ref(false)
const initialMaintenanceSection = ref<'features' | null>(null)
let disposeRuntime: (() => void) | null = null
const shortcutHintTiming = createShortcutHintTiming({
  show: () => { shortcutHints.value = true },
  hide: () => { shortcutHints.value = false }
})
const snapshot = computed(() => {
  version.value
  return runtime.snapshot()
})

function onKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented) return
  if (event.key === 'Shift') shiftPreview.value = true
  shortcutHintTiming.keydown(event)
  const shortcutId = shortcutFromEvent(event)
  const textInputFocused = isEditableTarget(event.target)
  const handled = runtime.handleShortcut(shortcutId, {
    textInputFocused,
    activeInputRole: activeInputRoleFromTarget(event.target, snapshot.value.state.activeTab)
  })
  if (handled) blockHandledShortcutEvent(event)
}

function onKeyup(event: KeyboardEvent) {
  if (event.key === 'Shift') shiftPreview.value = false
  shortcutHintTiming.keyup(event)
}

function clearShiftPreview() {
  shiftPreview.value = false
  shortcutHintTiming.clear()
}

watch(() => snapshot.value.searchFocusRequestId, () => {
  requestAnimationFrame(() => {
    const target = snapshot.value.searchFocusTarget === 'port-groups'
      ? 'port-group-search'
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
    if (role === 'port-search' || role === 'favorite-search' || role === 'port-group-search' || role === 'primary-search') active?.blur()
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
  const route = routePluginFeature(platform.getEnterPayload(), snapshot.value.state.settings.featureConfigs)
  initialMaintenanceSection.value = route.settingsMaintenanceSection || null
  runtime.setTab(route.tab)
  if (route.focusSearch) {
    runtime.dispatch('search.focus')
  }
  platform.clearEnterPayload()
  void runtime.scanPorts()
})

onUnmounted(() => {
  disposeRuntime?.()
  shortcutHintTiming.dispose()
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('keyup', onKeyup)
  window.removeEventListener('blur', clearShiftPreview)
})
</script>

<template>
  <main class="app-shell" :class="{ 'shift-preview': shiftPreview }">
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
      <template #favorites>
        <FavoritesPage
          :snapshot="snapshot"
          @search="runtime.setFavoriteSearch"
          @focus="runtime.focusFavorite"
          @toggle="runtime.toggleFavoriteSelection"
          @collapse="runtime.toggleFavoriteCollapse"
          @add="runtime.addFavorite"
          @remove="runtime.removeFavorite"
          @reorder="runtime.reorderFavorite"
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
          @update-keybinding="runtime.updateKeybinding"
          @reset-keybinding="runtime.resetKeybinding"
          @save-shortcut-profiles="runtime.saveShortcutProfiles"
          @save-feature-configs="runtime.saveFeatureConfigs"
        />
      </template>
    </TabShell>
    <ConfirmLayer
      v-if="snapshot.confirm"
      :title="snapshot.confirm.title"
      :detail="snapshot.confirm.detail"
      @cancel="runtime.cancelConfirm"
      @confirm="runtime.confirmNow"
    />
  </main>
</template>
