<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  kind: 'compact' | 'expanded'
  card?: boolean
  offset?: { x: number; y: number }
}>()

const surfaceStyle = computed(() => props.kind === 'compact' && props.offset
  ? { '--compact-offset-x': `${props.offset.x}px`, '--compact-offset-y': `${props.offset.y}px` }
  : undefined)
</script>

<template>
  <component
    :is="kind === 'expanded' ? 'section' : 'div'"
    :class="kind === 'expanded' ? 'float-expanded-card' : ['float-compact-shell', card ? 'card-shell' : 'water-shell', { 'collapse-anchored': offset }]"
    :style="surfaceStyle"
  >
    <slot />
  </component>
</template>
