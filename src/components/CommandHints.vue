<script setup lang="ts">
import { computed } from 'vue'
import { formatShortcutList } from '../domain/shortcuts'
import type { TabShellRuntimeSliceV7 } from '../runtime/feature/featureRuntimeSlices'
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
</script>

<template>
  <div class="command-hints">
    <span v-if="snapshot.state.activeTab === 'ports'">
      端口默认 · {{ defaultLabel('ports.scan', 'c-r') }} 刷新 ·
      {{ defaultLabel('ports.pane.toggleNext', 'tab') }}/{{ defaultLabel('ports.pane.togglePrev', 's-tab') }} 切栏 ·
      ↑↓ 移动 · {{ defaultLabel('ports.detail.open', 'c-←') }} 详情 ·
      {{ defaultLabel('ports.drawer.open', 'c-→') }} 菜单 ·
      {{ defaultLabel('ports.kill.confirm', 'del / backspace') }} 终止 ·
      {{ defaultLabel('ports.group.apply', 'cr') }} 筛选组 ·
      {{ defaultLabel('ports.group.focusMatches', 'c-cr') }} 聚焦匹配 ·
      {{ defaultLabel('ports.group.save', 'c-s / c-cr') }} 保存编辑 ·
      {{ defaultLabel('app.hide', 's-esc') }} 隐藏 · {{ modifierHint }}
    </span>
    <span v-else-if="snapshot.state.activeTab === 'mqtt'">
      MQTT 默认 · ↑↓ 移动 ·
      {{ defaultLabel('mqtt.pane.next', 'tab') }}/{{ defaultLabel('mqtt.pane.prev', 's-tab') }} 切区 ·
      {{ defaultLabel('mqtt.detail.open', 'c-←') }} 详情 ·
      {{ defaultLabel('mqtt.drawer.open', 'c-→') }} 菜单 ·
      {{ defaultLabel('mqtt.subscription.editor.open', 'f2') }} 编辑订阅 ·
      {{ defaultLabel('mqtt.connection.connect', 'c-r') }} 连接 · {{ modifierHint }}
    </span>
    <span v-else-if="snapshot.state.activeTab === 'favorites' && snapshot.favoriteQuickMode">
      快速收藏 · ↑↓ 移动 · {{ defaultLabel('favorites.open', 'cr') }} 打开 ·
      {{ defaultLabel('favorites.reveal', 'c-cr') }} 定位 ·
      {{ defaultLabel('favorites.copyPath', 'c-c') }} 复制路径 ·
      {{ defaultLabel('favorites.detail.open', 'c-←') }} 详情 ·
      {{ defaultLabel('favorites.drawer.open', 'c-→') }} 安全操作 · {{ modifierHint }}
    </span>
    <span v-else-if="snapshot.state.activeTab === 'favorites'">
      收藏默认 · ↑↓ 移动 · {{ defaultLabel('favorites.open', 'cr') }} 打开 ·
      {{ defaultLabel('favorites.target.create', 'c-n') }} 新增 ·
      {{ defaultLabel('favorites.pick.files', 'c-o') }} 选文件 ·
      {{ defaultLabel('favorites.pick.folders', 'c-s-o') }} 选文件夹 ·
      {{ defaultLabel('favorites.reveal', 'c-cr') }} 定位 ·
      {{ defaultLabel('favorites.copyPath', 'c-c') }} 复制路径 ·
      {{ defaultLabel('favorites.detail.open', 'c-←') }} 详情 ·
      {{ defaultLabel('favorites.drawer.open', 'c-→') }} 菜单 ·
      {{ defaultLabel('favorites.pane.toggleNext', 'tab') }} 切栏 ·
      {{ defaultLabel('favorites.save', 'c-s / c-cr') }} 保存编辑 ·
      {{ defaultLabel('favorites.cancel', 'esc') }} 取消 · {{ modifierHint }}
    </span>
    <span v-else>
      设置默认 · c-f 搜索命令 · c-← 命令详情 · c-→ 命令操作 · 右键打开操作 · c-s/c-cr 保存草稿或弹窗 · esc 关闭当前层
    </span>
  </div>
</template>
