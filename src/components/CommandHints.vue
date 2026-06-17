<script setup lang="ts">
import { computed } from 'vue'
import type { AppRuntimeSnapshot } from '../runtime/appRuntime'

const props = defineProps<{ snapshot: AppRuntimeSnapshot }>()

const modifierHint = computed(() => {
  const platform = typeof navigator === 'undefined' ? '' : `${navigator.platform || ''} ${navigator.userAgent || ''}`
  return `按住 ${/Mac|iPhone|iPad|iPod/i.test(platform) ? '⌘' : 'Ctrl'} 可看`
})

function label(commandId: string, fallback: string) {
  return props.snapshot.commandShortcutLabels[commandId] || fallback
}
</script>

<template>
  <footer class="command-hints">
    <span v-if="snapshot.message">{{ snapshot.message }}</span>
    <span v-else-if="snapshot.state.activeTab === 'ports' && snapshot.searchHistoryState.open && snapshot.searchHistoryState.items.length">cr 保存/应用搜索 · s-↑↓ 选历史 · del/backspace 删除高亮项 · {{ label('app.hide', 's-esc') }} 隐藏</span>
    <span v-else-if="snapshot.state.activeTab === 'ports' && snapshot.portDrawer.active">↑↓ 选动作 · cr 执行 · esc/← 关闭 · {{ modifierHint }}</span>
    <span v-else-if="snapshot.state.activeTab === 'ports' && snapshot.portGroupDetail.active">搜索/强杀/更多 · esc/→ 关闭分组详情</span>
    <span v-else-if="snapshot.state.activeTab === 'ports' && snapshot.portDetail.active">{{ label('ports.kill.confirm', 'del / backspace') }} 终止确认 · esc/→ 关闭详情 · {{ label('app.hide', 's-esc') }} 隐藏 · {{ modifierHint }}</span>
    <span v-else-if="snapshot.state.activeTab === 'ports' && snapshot.selectedPortIds.length">↑↓ 移动 · space 继续选择 · esc 清空多选 · {{ modifierHint }}</span>
    <span v-else-if="snapshot.state.activeTab === 'ports' && snapshot.activePortPane === 'groups'">↑↓ 选组/夹 · ←→ 折叠/进入 · cr 筛选 · {{ label('app.hide', 's-esc') }} 隐藏 · {{ modifierHint }}</span>
    <span v-else-if="snapshot.state.activeTab === 'ports'">↑↓ 建立/移动高亮 · {{ label('ports.kill.confirm', 'del / backspace') }} 终止确认 · {{ label('app.hide', 's-esc') }} 隐藏 · {{ modifierHint }}</span>
    <span v-else-if="snapshot.state.activeTab === 'favorites'">cr 打开 · space 多选 · 拖拽排序 · {{ modifierHint }}</span>
    <span v-else>点击快捷键输入框后按键录制 · 恢复默认可移除用户覆盖</span>
  </footer>
</template>
