<script setup lang="ts">
defineProps<{ title: string; detail: string }>()
defineEmits<{ cancel: []; confirm: [] }>()
</script>

<template>
  <div class="modal-backdrop">
    <section class="confirm-layer" role="dialog" aria-modal="true">
      <h2>{{ title }}</h2>
      <p>{{ detail }}</p>
      <div class="confirm-actions">
        <button type="button" @click="$emit('cancel')">取消</button>
        <button type="button" class="danger" @click="$emit('confirm')">确认</button>
      </div>
    </section>
  </div>
</template>
