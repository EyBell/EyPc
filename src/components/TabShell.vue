<script setup lang="ts">
import type { AppTabId } from '../domain/types'
import { FEATURES } from '../runtime/feature/featureRegistry'

defineProps<{ activeTab: AppTabId }>()
defineEmits<{ select: [tab: AppTabId] }>()
</script>

<template>
  <section class="tab-shell">
    <nav class="top-tabs" aria-label="EyPc 功能">
      <button
        v-for="feature in FEATURES"
        :key="feature.id"
        type="button"
        class="tab-button"
        :class="{ active: feature.id === activeTab }"
        @click="$emit('select', feature.id)"
      >
        <span>{{ feature.title }}</span>
        <small>{{ feature.description }}</small>
      </button>
    </nav>
    <section class="tab-content">
      <slot v-if="activeTab === 'ports'" name="ports" />
      <slot v-else-if="activeTab === 'favorites'" name="favorites" />
      <slot v-else name="settings" />
    </section>
  </section>
</template>
