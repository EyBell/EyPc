<script setup lang="ts">
import type { AppTabId } from '../domain/types'
import { formatShortcutLabel } from '../domain/shortcuts'
import type { TabShellRuntimeSliceV7 } from '../runtime/feature/featureRuntimeSlices'
import { quickJumpCommandTargetV7, useQuickJumpTargetV7 } from '../ui/quickJumpRegistry'
import CommandHints from './CommandHints.vue'

const vQuickJumpTarget = useQuickJumpTargetV7()

defineProps<{
  activeTab: AppTabId
  commandShortcutLabels: Record<string, string>
  showShortcutHints: boolean
  snapshot: TabShellRuntimeSliceV7
}>()
defineEmits<{ select: [tab: AppTabId] }>()
</script>

<template>
  <section class="tab-shell">
    <nav class="top-tabs" aria-label="EyPc 功能">
      <button
        v-for="feature in snapshot.visibleFeatures"
        :key="feature.id"
        v-quick-jump-target="quickJumpCommandTargetV7({ featureId: feature.id, commandId: `tab.select.${feature.id}`, label: feature.title, searchText: feature.description, disposition: 'open' })"
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
        <CommandHints v-slot="{ hintText }" :snapshot="snapshot">
          <button type="button" class="tab-help-trigger" aria-label="快捷键帮助" :data-operation-description="hintText">?</button>
        </CommandHints>
      </div>
    </nav>
    <section class="tab-content">
      <slot />
    </section>
  </section>
</template>
