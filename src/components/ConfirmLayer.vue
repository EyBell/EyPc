<script setup lang="ts">
import DialogShell from './DialogShell.vue'

defineProps<{ title: string; detail: string; restoreFocusSelectors?: string[] }>()
defineEmits<{ cancel: []; confirm: [] }>()
</script>

<template>
  <DialogShell
    panel-class="confirm-layer"
    label-id="confirm-layer-title"
    description-id="confirm-layer-detail"
    :restore-focus-selectors="restoreFocusSelectors || []"
    @close="$emit('cancel')"
  >
      <h2 id="confirm-layer-title">{{ title }}</h2>
      <p id="confirm-layer-detail">{{ detail }}</p>
      <div class="confirm-actions">
        <button type="button" @click="$emit('cancel')">取消</button>
        <button type="button" class="danger" @click="$emit('confirm')">确认</button>
      </div>
  </DialogShell>
</template>
