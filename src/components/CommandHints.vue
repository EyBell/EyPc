<script setup lang="ts">
import { computed } from 'vue'
import { formatShortcutList } from '../domain/shortcuts'
import type { TabShellRuntimeSliceV7 } from '../runtime/feature/featureRuntimeSlices'
import { featureModuleV7 } from '../runtime/feature/featureModules'
import { DEFAULT_KEYBINDINGS, buildShortcutCommandRows } from '../runtime/keybinding/keybindingRuntime'

const props = defineProps<{ snapshot: TabShellRuntimeSliceV7 }>()
const defaultRows = buildShortcutCommandRows(DEFAULT_KEYBINDINGS)
const defaultShortcutLabels = new Map(defaultRows.map((row) => [row.commandId, formatShortcutList(row.defaultShortcutIds)]))

const modifierHint = computed(() => {
  const platform = typeof navigator === 'undefined' ? '' : `${navigator.platform || ''} ${navigator.userAgent || ''}`
  return `按住 ${/Mac|iPhone|iPad|iPod/i.test(platform) ? '⌘' : 'Ctrl'} 可看`
})

function defaultLabel(commandId: string, fallback: string) {
  return defaultShortcutLabels.get(commandId) || fallback
}

const SETTINGS_COMMAND_HINTS = '设置默认 · c-f 搜索命令 · c-← 命令详情 · c-→ 命令操作 · 右键打开操作 · c-s/c-cr 保存草稿或弹窗 · esc 关闭当前层'

const hintText = computed(() => featureModuleV7(props.snapshot.state.activeTab).commandHints?.({
  defaultLabel,
  modifierHint: modifierHint.value,
  favoriteQuickMode: props.snapshot.favoriteQuickMode
}) ?? SETTINGS_COMMAND_HINTS)
</script>

<template>
  <div class="command-hints">
    <span>{{ hintText }}</span>
  </div>
</template>
