<script setup lang="ts">
import { computed } from 'vue'
import { ChevronDown, ChevronRight } from '@lucide/vue'

const props = defineProps<{
  title: string
  variant?: 'project' | 'hidden-project'
  tone?: string
  count?: number
  collapsible?: boolean
  collapsed?: boolean
  quickDigit?: string
  quickHint?: string
}>()

defineEmits<{ toggle: [] }>()

const actionLabel = computed(() => `${props.collapsed ? '展开' : '折叠'}${props.title}`)
const accessibleAction = computed(() =>
  `${actionLabel.value}${props.count === undefined ? '' : `，${props.count} 项`}${props.quickHint || ''}`
)
</script>

<template>
  <h2 :class="[variant ? 'float-project-section' : 'float-status-section', tone, {
    'hidden-project-section': variant === 'hidden-project',
    collapsible,
    collapsed
  }]">
    <button
      v-if="collapsible"
      type="button"
      class="status-section-toggle"
      :aria-expanded="!collapsed"
      :aria-label="accessibleAction"
      data-quick-jump-target
      :data-quick-jump-label="actionLabel"
      @click="$emit('toggle')"
    >
      <ChevronRight v-if="collapsed" :size="13" aria-hidden="true" />
      <ChevronDown v-else :size="13" aria-hidden="true" />
      <span v-if="quickDigit" class="status-quick-index" aria-hidden="true">{{ quickDigit }}</span>
      <span class="float-section-label">{{ title }}</span>
      <em v-if="count !== undefined">{{ count }}</em>
    </button>
    <template v-else>
      <span class="float-section-label">{{ title }}</span>
      <em v-if="count !== undefined">{{ count }}</em>
    </template>
  </h2>
</template>
