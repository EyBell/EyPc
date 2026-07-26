<script setup lang="ts">
import type { AppTabId } from '../domain/types'
import { formatShortcutLabel } from '../domain/shortcuts'
import type { AppRuntimeSnapshot } from '../runtime/appRuntime'
import CommandHints from './CommandHints.vue'

defineProps<{
  activeTab: AppTabId
  commandShortcutLabels: Record<string, string>
  showShortcutHints: boolean
  snapshot: AppRuntimeSnapshot
}>()
defineEmits<{ select: [tab: AppTabId] }>()
</script>

<template>
  <section class="tab-shell">
    <nav class="top-tabs" aria-label="EyPc 功能">
      <button
        v-for="feature in snapshot.visibleFeatures"
        :key="feature.id"
        type="button"
        class="tab-button"
        :class="{ active: feature.id === activeTab, 'shortcut-hinting': showShortcutHints }"
        :title="`${feature.title} · ${feature.description} · ${commandShortcutLabels[feature.shortcutCommandId] || formatShortcutLabel(feature.shortcutId)}`"
        @click="$emit('select', feature.id)"
      >
        <span>{{ feature.title }}</span>
        <kbd v-if="showShortcutHints" class="tab-shortcut-hint">{{ commandShortcutLabels[feature.shortcutCommandId] || formatShortcutLabel(feature.shortcutId) }}</kbd>
      </button>
      <div class="tab-help">
        <button type="button" class="tab-help-trigger" aria-label="快捷键帮助">?</button>
        <div class="tab-help-popover" role="tooltip">
          <CommandHints :snapshot="snapshot" />
        </div>
      </div>
    </nav>
    <section class="tab-content">
      <slot v-if="activeTab === 'ports'" name="ports" />
      <slot v-else-if="activeTab === 'mqtt'" name="mqtt" />
      <slot v-else-if="activeTab === 'favorites'" name="favorites" />
      <slot v-else-if="activeTab === 'windows'" name="windows" />
      <slot v-else-if="activeTab === 'codex'" name="codex" />
      <slot v-else name="settings" />
    </section>
  </section>
</template>
