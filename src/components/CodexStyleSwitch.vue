<script setup lang="ts">
import { Droplets, PanelsTopLeft } from '@lucide/vue'
import type { CodexDisplayStyle } from '../domain/codex'

defineProps<{
  modelValue: CodexDisplayStyle
  compact?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: CodexDisplayStyle]
}>()
</script>

<template>
  <div class="codex-style-switch" :class="{ compact }" role="group" aria-label="Codex 展示样式">
    <button
      type="button"
      :class="{ active: modelValue === 'water' }"
      :aria-pressed="modelValue === 'water'"
      @click.stop="emit('update:modelValue', 'water')"
    >
      <Droplets :size="compact ? 13 : 15" aria-hidden="true" />
      <span>水球</span>
    </button>
    <button
      type="button"
      :class="{ active: modelValue === 'card' }"
      :aria-pressed="modelValue === 'card'"
      @click.stop="emit('update:modelValue', 'card')"
    >
      <PanelsTopLeft :size="compact ? 13 : 15" aria-hidden="true" />
      <span>卡片</span>
    </button>
  </div>
</template>

<style>
.codex-style-switch {
  display: grid;
  width: 176px;
  height: 34px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 3px;
  padding: 3px;
  border: 1px solid var(--switch-border, #c8d4d7);
  border-radius: 10px;
  background: var(--switch-track, #e7edef);
}

.codex-style-switch.compact {
  width: 112px;
  height: 30px;
  border-radius: 9px;
}

.codex-style-switch button {
  display: inline-flex;
  min-width: 0;
  min-height: 26px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--switch-muted, #536873);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
}

.codex-style-switch.compact button {
  min-height: 22px;
  gap: 3px;
  padding: 0 4px;
  font-size: 10px;
}

.codex-style-switch button.active {
  border-color: var(--switch-active-border, #aebfc3);
  background: var(--switch-active-bg, #fff);
  color: var(--switch-active-fg, #0b746d);
  box-shadow: 0 2px 7px rgba(20, 47, 55, .1);
}

.codex-style-switch button:focus-visible {
  outline: 2px solid var(--switch-focus, #087d73);
  outline-offset: 1px;
}

@media (pointer: coarse) {
  .codex-style-switch,
  .codex-style-switch.compact {
    height: 50px;
  }

  .codex-style-switch button,
  .codex-style-switch.compact button {
    min-height: 44px;
  }
}
</style>
