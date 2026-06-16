<script setup lang="ts">
import { computed, ref } from 'vue'
import type { KeybindingOverride } from '../domain/types'
import type { RuntimeActionDefinition } from '../runtime/action/types'
import type { KeybindingDefinition } from '../runtime/keybinding/keybindingRuntime'

const props = defineProps<{
  actions: RuntimeActionDefinition[]
  defaultKeybindings: KeybindingDefinition[]
  overrides: KeybindingOverride[]
}>()
const emit = defineEmits<{
  updateKeybinding: [commandId: string, shortcutId: string, disabled?: boolean]
  resetKeybinding: [commandId: string]
}>()

const keyword = ref('')

const rows = computed(() => props.actions
  .map((action) => {
    const override = props.overrides.find((item) => item.commandId === action.id)
    const defaults = props.defaultKeybindings.filter((item) => item.actionId === action.id).map((item) => item.defaultShortcutId)
    return {
      id: action.id,
      title: action.title,
      group: action.group,
      risk: action.risk,
      shortcut: override?.shortcutId || defaults.join(', '),
      source: override ? (override.disabled ? 'disabled' : 'user') : 'system'
    }
  })
  .filter((row) => [row.id, row.title, row.group, row.shortcut].join(' ').toLowerCase().includes(keyword.value.trim().toLowerCase())))

function shortcutFromEvent(event: KeyboardEvent): string {
  event.preventDefault()
  const parts: string[] = []
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey && event.key !== 'Tab') parts.push('Shift')
  const key = event.key === ' ' ? 'Space' : event.key === 'Tab' && event.shiftKey ? 'Shift+Tab' : event.key.length === 1 ? event.key.toUpperCase() : event.key
  if (key === 'Shift+Tab') return key
  return [...parts, key].join('+')
}
</script>

<template>
  <section class="settings-page">
    <div class="toolbar">
      <input v-model="keyword" placeholder="搜索命令、快捷键、分组" />
    </div>
    <div class="settings-table">
      <div class="settings-row header">
        <span>命令</span>
        <span>分组</span>
        <span>快捷键</span>
        <span>来源</span>
        <span>操作</span>
      </div>
      <div v-for="row in rows" :key="row.id" class="settings-row">
        <span>{{ row.title }}<small>{{ row.id }}</small></span>
        <span>{{ row.group }}</span>
        <span>
          <input
            :value="row.shortcut"
            @keydown="emit('updateKeybinding', row.id, shortcutFromEvent($event))"
            placeholder="点击后按键"
          />
        </span>
        <span>{{ row.source }}</span>
        <span class="row-actions">
          <button type="button" @click="emit('resetKeybinding', row.id)">默认</button>
          <button type="button" @click="emit('updateKeybinding', row.id, row.shortcut || 'Disabled', true)">禁用</button>
        </span>
      </div>
    </div>
  </section>
</template>
