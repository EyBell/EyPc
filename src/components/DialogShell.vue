<script setup lang="ts">
import FocusScope from './FocusScope.vue'

const props = withDefaults(defineProps<{
  as?: 'section' | 'form' | 'aside'
  backdropClass?: string
  panelClass?: string
  labelId?: string
  descriptionId?: string
  label?: string
  dataRole?: string
  initialFocusSelector?: string
  restoreFocusSelectors?: string[]
  closeOnBackdrop?: boolean
}>(), {
  as: 'section',
  backdropClass: '',
  panelClass: '',
  labelId: '',
  descriptionId: '',
  label: '',
  dataRole: '',
  initialFocusSelector: '',
  restoreFocusSelectors: () => [],
  closeOnBackdrop: true
})

const emit = defineEmits<{ close: []; submit: [] }>()
</script>

<template>
  <div
    class="modal-backdrop"
    :class="props.backdropClass"
    @click.self="props.closeOnBackdrop && emit('close')"
  >
    <FocusScope
      :as="props.as"
      :class="props.panelClass"
      :role="'dialog'"
      :aria-modal="'true'"
      :aria-labelledby="props.labelId || undefined"
      :aria-describedby="props.descriptionId || undefined"
      :aria-label="props.label || undefined"
      :data-role="props.dataRole || undefined"
      :initial-focus-selector="props.initialFocusSelector"
      :restore-focus-selectors="props.restoreFocusSelectors"
      @escape="emit('close')"
      @submit.prevent="emit('submit')"
    >
      <slot />
    </FocusScope>
  </div>
</template>
