<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { normalizeAppState } from './domain/state'
import { getPlatform } from './platform/eypcPlatform'
import ConfirmLayer from './components/ConfirmLayer.vue'
import TabShell from './components/TabShell.vue'
import CommandHints from './components/CommandHints.vue'
import PortsPage from './pages/PortsPage.vue'
import FavoritesPage from './pages/FavoritesPage.vue'
import SettingsPage from './pages/SettingsPage.vue'
import { createAppRuntime } from './runtime/appRuntime'
import type { ActiveInputRole } from './runtime/appRuntime'
import { routePluginFeature } from './runtime/feature/featureRouting'

const platform = getPlatform()
const runtime = createAppRuntime(normalizeAppState(platform.storage.getState()))
const version = ref(0)
let disposeRuntime: (() => void) | null = null
const snapshot = computed(() => {
  version.value
  return runtime.snapshot()
})

function shortcutFromEvent(event: KeyboardEvent): string {
  const parts: string[] = []
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey && !['Tab'].includes(event.key)) parts.push('Shift')
  const keyMap: Record<string, string> = {
    ' ': 'Space',
    Enter: 'Enter',
    Escape: 'Escape',
    ArrowUp: 'ArrowUp',
    ArrowDown: 'ArrowDown',
    ArrowLeft: 'ArrowLeft',
    ArrowRight: 'ArrowRight',
    Tab: event.shiftKey ? 'Shift+Tab' : 'Tab'
  }
  const key = keyMap[event.key] || event.key.toUpperCase()
  if (key === 'Shift+Tab') return key
  return [...parts, key].join('+')
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element) return false
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName) || element.isContentEditable
}

function activeInputRole(target: EventTarget | null): ActiveInputRole | undefined {
  const element = target as HTMLElement | null
  if (!element || !isEditableTarget(element)) return undefined
  const role = element.closest<HTMLElement>('[data-role]')?.dataset.role
  if (role === 'port-group-search') return 'port-group-search'
  if (role === 'port-group-editor') return 'port-group-editor'
  if (role === 'primary-search') return snapshot.value.state.activeTab === 'ports' ? 'port-search' : 'favorite-search'
  if (snapshot.value.state.activeTab === 'settings') return 'settings'
  return 'other'
}

function onKeydown(event: KeyboardEvent) {
  const shortcutId = shortcutFromEvent(event)
  const textInputFocused = isEditableTarget(event.target)
  const handled = runtime.handleShortcut(shortcutId, {
    textInputFocused,
    activeInputRole: activeInputRole(event.target)
  })
  if (handled) event.preventDefault()
}

watch(() => snapshot.value.searchFocusRequestId, () => {
  requestAnimationFrame(() => {
    const target = snapshot.value.searchFocusTarget === 'port-groups'
      ? 'port-group-search'
      : 'primary-search'
    document.querySelector<HTMLInputElement>(`[data-role="${target}"]`)?.focus()
  })
})

onMounted(() => {
  disposeRuntime = runtime.subscribe(() => {
    version.value += 1
  })
  window.addEventListener('keydown', onKeydown)
  const route = routePluginFeature(platform.getEnterPayload())
  runtime.setTab(route.tab)
  if (route.focusSearch) {
    runtime.dispatch('search.focus')
  }
  platform.clearEnterPayload()
  void runtime.scanPorts()
})

onUnmounted(() => {
  disposeRuntime?.()
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <main class="app-shell">
    <TabShell :active-tab="snapshot.state.activeTab" @select="runtime.setTab">
      <template #ports>
        <PortsPage
          :snapshot="snapshot"
          @search="runtime.setPortSearch"
          @group-search="runtime.setPortGroupSearch"
          @scan="runtime.scanPorts"
          @focus="runtime.focusPort"
          @toggle="runtime.togglePortSelection"
          @focus-group="runtime.focusPortGroup"
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
          @update-keybinding="runtime.updateKeybinding"
          @reset-keybinding="runtime.resetKeybinding"
        />
      </template>
    </TabShell>
    <CommandHints :snapshot="snapshot" />
    <ConfirmLayer
      v-if="snapshot.confirm"
      :title="snapshot.confirm.title"
      :detail="snapshot.confirm.detail"
      @cancel="runtime.cancelConfirm"
      @confirm="runtime.confirmNow"
    />
  </main>
</template>
