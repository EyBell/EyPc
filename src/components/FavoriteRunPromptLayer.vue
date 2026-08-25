<script setup lang="ts">
import { Play, X } from '@lucide/vue'
import type { FavoriteRunPrompt } from '../runtime/appRuntime'
import DialogShell from './DialogShell.vue'

const props = defineProps<{ prompt: FavoriteRunPrompt }>()
const emit = defineEmits<{
  update: [name: string, value: string]
  submit: []
  cancel: []
}>()

</script>

<template>
  <DialogShell
      as="form"
      panel-class="favorite-run-prompt confirm-layer"
      data-role="favorite-run-prompt"
      label-id="favorite-run-prompt-title"
      initial-focus-selector="input"
      @close="emit('cancel')"
      @submit="emit('submit')"
    >
      <header class="favorite-run-prompt-header">
        <div>
          <h2 id="favorite-run-prompt-title">运行参数</h2>
          <small>{{ props.prompt.favoriteName }}</small>
        </div>
        <button type="button" aria-label="取消本次运行" title="取消本次运行" @click="emit('cancel')"><X :size="15" aria-hidden="true" /></button>
      </header>
      <label v-for="field in props.prompt.fields" :key="field.name">
        {{ field.name }}<span v-if="field.required" class="favorite-run-prompt-required" aria-hidden="true"> *</span>
        <input
          :value="field.value"
          :aria-required="field.required"
          :placeholder="field.required ? '必填' : '可留空使用默认值'"
          @input="emit('update', field.name, ($event.target as HTMLInputElement).value)"
        />
      </label>
      <section v-if="props.prompt.preview" class="favorite-run-prompt-preview" aria-label="解析后的命令行">
        <strong>将执行</strong>
        <code>{{ props.prompt.preview }}</code>
        <small>填写的内容按整体作为一个参数传入，不会被再次解析。</small>
      </section>
      <p v-else class="favorite-run-prompt-error" role="alert">{{ props.prompt.error || '请补全参数' }}</p>
      <div class="dialog-actions">
        <button type="button" @click="emit('cancel')">取消</button>
        <button type="submit" :disabled="!props.prompt.preview"><Play :size="14" aria-hidden="true" />运行</button>
      </div>
  </DialogShell>
</template>
