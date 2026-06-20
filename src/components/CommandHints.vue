<script setup lang="ts">
import { computed } from 'vue'
import { formatShortcutList } from '../domain/shortcuts'
import type { AppRuntimeSnapshot } from '../runtime/appRuntime'
import { DEFAULT_KEYBINDINGS, buildShortcutCommandRows } from '../runtime/keybinding/keybindingRuntime'

const props = defineProps<{ snapshot: AppRuntimeSnapshot }>()
const defaultRows = buildShortcutCommandRows(DEFAULT_KEYBINDINGS)
const defaultShortcutLabels = new Map(defaultRows.map((row) => [row.commandId, formatShortcutList(row.defaultShortcutIds)]))

const modifierHint = computed(() => {
  const platform = typeof navigator === 'undefined' ? '' : `${navigator.platform || ''} ${navigator.userAgent || ''}`
  return `按住 ${/Mac|iPhone|iPad|iPod/i.test(platform) ? '⌘' : 'Ctrl'} 可看`
})

function defaultLabel(commandId: string, fallback: string) {
  return defaultShortcutLabels.get(commandId) || fallback
}
</script>

<template>
  <div class="command-hints">
    <span v-if="snapshot.state.activeTab === 'ports'">
      端口默认 · {{ defaultLabel('ports.scan', 'c-r') }} 刷新 ·
      {{ defaultLabel('ports.pane.toggleNext', 'tab') }}/{{ defaultLabel('ports.pane.togglePrev', 's-tab') }} 切栏 ·
      ↑↓ 移动 · {{ defaultLabel('ports.kill.confirm', 'del / backspace') }} 终止 ·
      {{ defaultLabel('ports.group.apply', 'cr') }} 筛选组 ·
      {{ defaultLabel('ports.group.focusMatches', 'c-cr') }} 聚焦匹配 ·
      {{ defaultLabel('ports.group.save', 'c-s / c-cr') }} 保存编辑 ·
      {{ defaultLabel('app.hide', 's-esc') }} 隐藏 · {{ modifierHint }}
    </span>
    <span v-else-if="snapshot.state.activeTab === 'favorites'">
      收藏默认 · ↑↓ 移动 · {{ defaultLabel('favorites.open', 'cr') }} 打开 ·
      {{ defaultLabel('favorites.reveal', 'c-cr') }} 定位 ·
      {{ defaultLabel('favorites.save', 'c-s / c-cr') }} 保存编辑 ·
      {{ defaultLabel('favorites.cancel', 'esc') }} 取消 · {{ modifierHint }}
    </span>
    <span v-else>
      设置默认 · c-f 搜索命令 · c-s/c-cr 保存草稿或弹窗 · esc 关闭录制/when 编辑 · 恢复默认可移除用户覆盖
    </span>
  </div>
</template>
