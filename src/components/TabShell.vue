<script setup lang="ts">
import type { AppTabId } from '../domain/types'
import { formatShortcutLabel } from '../domain/shortcuts'
import { visibleFeatures } from '../runtime/feature/featureRegistry'

defineProps<{
  activeTab: AppTabId
  commandShortcutLabels: Record<string, string>
  showShortcutHints: boolean
}>()
defineEmits<{ select: [tab: AppTabId] }>()

const features = visibleFeatures()
</script>

<template>
  <section class="tab-shell">
    <nav class="top-tabs" aria-label="EyPc 功能">
      <button
        v-for="feature in features"
        :key="feature.id"
        type="button"
        class="tab-button"
        :class="{ active: feature.id === activeTab }"
        :title="`${feature.title} · ${feature.description} · ${commandShortcutLabels[feature.shortcutCommandId] || formatShortcutLabel(feature.shortcutId)}`"
        @click="$emit('select', feature.id)"
      >
        <span>{{ feature.title }}</span>
        <kbd v-if="showShortcutHints">{{ commandShortcutLabels[feature.shortcutCommandId] || formatShortcutLabel(feature.shortcutId) }}</kbd>
      </button>
    </nav>
    <section class="tab-content">
      <slot v-if="activeTab === 'ports'" name="ports" />
      <slot v-else-if="activeTab === 'favorites'" name="favorites" />
      <slot v-else name="settings" />
    </section>
  </section>
</template>
