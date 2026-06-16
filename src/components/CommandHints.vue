<script setup lang="ts">
import type { AppTabId } from '../domain/types'

defineProps<{ tab: AppTabId; message: string }>()
</script>

<template>
  <footer class="command-hints">
    <span v-if="message">{{ message }}</span>
    <span v-else-if="tab === 'ports'">Enter 终止 · Ctrl+Enter 强杀 · Space 多选 · Ctrl+F 搜索</span>
    <span v-else-if="tab === 'favorites'">Enter 打开 · Ctrl+Enter 定位 · Space 多选 · 拖拽排序</span>
    <span v-else>点击快捷键输入框后按键录制 · 恢复默认可移除用户覆盖</span>
  </footer>
</template>
