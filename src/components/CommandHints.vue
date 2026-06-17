<script setup lang="ts">
import type { AppRuntimeSnapshot } from '../runtime/appRuntime'

const props = defineProps<{ snapshot: AppRuntimeSnapshot }>()

function label(commandId: string, fallback: string) {
  return props.snapshot.commandShortcutLabels[commandId] || fallback
}
</script>

<template>
  <footer class="command-hints">
    <span v-if="snapshot.message">{{ snapshot.message }}</span>
    <span v-else-if="snapshot.state.activeTab === 'ports' && snapshot.searchHistoryState.open && snapshot.searchHistoryState.items.length">cr 保存/应用搜索 · s-↑↓ 选历史 · del/backspace 删除高亮项 · {{ label('app.hide', 's-esc') }} 隐藏</span>
    <span v-else-if="snapshot.state.activeTab === 'ports' && snapshot.portDrawer.active">↑↓ 选动作 · cr 执行 · c-1..9 指定动作 · esc/← 关闭</span>
    <span v-else-if="snapshot.state.activeTab === 'ports' && snapshot.portGroupDetail.active">搜索/强杀/更多 · esc/→ 关闭分组详情</span>
    <span v-else-if="snapshot.state.activeTab === 'ports' && snapshot.portDetail.active">{{ label('ports.kill.confirm', 'del / backspace') }} 终止确认 · {{ label('ports.kill.force', 'c-del / c-backspace') }} 强杀 · {{ label('ports.drawer.open', 'c-→') }} 菜单 · esc/→ 关闭详情 · {{ label('app.hide', 's-esc') }} 隐藏</span>
    <span v-else-if="snapshot.state.activeTab === 'ports' && snapshot.selectedPortIds.length">↑↓ 移动 · space 继续选择 · {{ label('ports.drawer.open', 'c-→') }} 打开菜单 · esc 清空多选</span>
    <span v-else-if="snapshot.state.activeTab === 'ports' && snapshot.activePortPane === 'groups'">{{ label('ports.groups.togglePanel', 'c-w') }} 收起组栏 · ↑↓ 选组/夹 · ←→ 折叠/进入 · cr 筛选 · {{ label('ports.group.focusMatches', 'c-cr') }} 聚焦匹配 · {{ label('ports.groupSearch.focus', 'c-s-f') }} 分组搜索 · {{ label('app.hide', 's-esc') }} 隐藏</span>
    <span v-else-if="snapshot.state.activeTab === 'ports'">{{ label('ports.groups.togglePanel', 'c-w') }} 组栏 · ↑↓ 建立/移动高亮 · {{ label('ports.kill.confirm', 'del / backspace') }} 终止确认 · {{ label('ports.kill.force', 'c-del / c-backspace') }} 强杀 · {{ label('ports.search.focus', 'c-f') }} 搜索 · {{ label('ports.detail.open', 'c-←') }} 详情 · {{ label('app.hide', 's-esc') }} 隐藏</span>
    <span v-else-if="snapshot.state.activeTab === 'favorites'">cr 打开 · c-cr 定位 · space 多选 · 拖拽排序</span>
    <span v-else>点击快捷键输入框后按键录制 · 恢复默认可移除用户覆盖</span>
  </footer>
</template>
