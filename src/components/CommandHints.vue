<script setup lang="ts">
import type { AppRuntimeSnapshot } from '../runtime/appRuntime'

defineProps<{ snapshot: AppRuntimeSnapshot }>()
</script>

<template>
  <footer class="command-hints">
    <span v-if="snapshot.message">{{ snapshot.message }}</span>
    <span v-else-if="snapshot.state.activeTab === 'ports' && snapshot.portDrawer.active">↑↓ 选动作 · Enter 执行 · Ctrl+1..9 指定动作 · Esc/← 关闭</span>
    <span v-else-if="snapshot.state.activeTab === 'ports' && snapshot.portDetail.active">Enter 终止确认 · Ctrl+Enter 强杀 · Ctrl+→ 菜单 · Esc/→ 关闭详情</span>
    <span v-else-if="snapshot.state.activeTab === 'ports' && snapshot.selectedPortIds.length">↑↓ 移动 · Space 继续选择 · Ctrl+→ 打开菜单 · Esc 清空多选</span>
    <span v-else-if="snapshot.state.activeTab === 'ports'">Tab 切栏 · ↑↓ 移动 · Enter 终止确认 · Ctrl+Enter 强杀 · Ctrl+F 搜索 · Ctrl+← 详情</span>
    <span v-else-if="snapshot.state.activeTab === 'favorites'">Enter 打开 · Ctrl+Enter 定位 · Space 多选 · 拖拽排序</span>
    <span v-else>点击快捷键输入框后按键录制 · 恢复默认可移除用户覆盖</span>
  </footer>
</template>
