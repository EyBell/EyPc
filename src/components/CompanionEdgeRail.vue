<script setup lang="ts">
import { computed, ref } from 'vue'
import { codexBadgeText } from '../domain/codexPresentation'

const props = defineProps<{
  edge: 'left' | 'right' | 'top' | 'bottom'
  codexPercent: number | null
  claudePercent: number | null
  counts: { input: number; active: number; unread: number }
}>()
const emit = defineEmits<{ action: [kind: 'input' | 'active' | 'unread']; hover: [event: PointerEvent]; leave: [] }>()
const horizontal = computed(() => props.edge === 'top' || props.edge === 'bottom')
const counters = computed(() => ([
  { kind: 'input' as const, label: '待输入' },
  { kind: 'active' as const, label: '进行中' },
  { kind: 'unread' as const, label: '已完成未读' }
]).filter((item) => props.counts[item.kind] > 0))
const readings = computed(() => [
  { provider: 'codex', label: 'Codex', percent: props.codexPercent },
  { provider: 'claude', label: 'Claude', percent: props.claudePercent }
])
const label = computed(() => readings.value.map((item) => `${item.label} 周额度 ${item.percent == null ? '暂无数据' : `${item.percent}%`}`).join('；'))
const cancelled = ref(false)
function activate(event: MouseEvent, kind: 'input' | 'active' | 'unread') {
  if (event.detail === 0 || !cancelled.value) emit('action', kind)
  cancelled.value = false
}
</script>

<template>
  <div class="companion-edge-rail" :class="[edge, { horizontal }]">
    <div class="float-compact-drag-zone" aria-hidden="true" @click.stop />
    <div class="companion-edge-line float-drag-handle" role="img" :aria-label="label"
      @pointerenter="emit('hover', $event)" @pointerleave="emit('leave')">
      <span v-for="reading in readings" :key="reading.provider" class="edge-quota-track" :class="[reading.provider, { unavailable: reading.percent == null }]">
        <i v-if="reading.percent != null" :style="{ [horizontal ? 'width' : 'height']: `${Math.max(0, Math.min(100, reading.percent))}%` }" />
      </span>
    </div>
    <div class="edge-readout-body">
      <div class="edge-readings float-drag-handle" @pointerenter="emit('hover', $event)" @pointerleave="emit('leave')">
        <div v-for="reading in readings" :key="reading.provider" class="edge-reading" :class="reading.provider"
          :aria-label="`${reading.label} 周额度 ${reading.percent == null ? '暂无数据' : `${reading.percent}%`}`">
          <strong>{{ reading.percent == null ? '—' : Math.round(reading.percent) }}</strong>
        </div>
      </div>
      <div v-if="counters.length" class="edge-counters">
        <button v-for="counter in counters" :key="counter.kind" type="button"
          class="companion-counter-geometry" :class="counter.kind"
          :aria-label="`${counter.label} ${counts[counter.kind]}`"
          @pointerdown.stop="cancelled = false" @pointerleave="cancelled = true" @pointercancel="cancelled = true"
          @click.stop="activate($event, counter.kind)"
        ><i class="edge-counter-dot" aria-hidden="true" /><span>{{ codexBadgeText(counts[counter.kind]) }}</span></button>
      </div>
    </div>
  </div>
</template>

<style>
.companion-edge-rail { position: relative; width: 40px; height: 120px; }
.companion-edge-rail.horizontal { width: 120px; height: 40px; }
.companion-edge-line.float-drag-handle { position: absolute; inset: 0 auto 0 0; display: flex; width: 8px; height: 100%; min-height: 0; margin: 0; padding: 0; gap: 0; border: 0; border-radius: 0; background: transparent; cursor: grab; touch-action: none; }
.companion-edge-line.float-drag-handle::after { content: none; }
.companion-edge-rail.right .companion-edge-line { left: auto; right: 0; }
.companion-edge-rail.horizontal .companion-edge-line { flex-direction: column; inset: 0 0 auto; width: 100%; height: 8px; }
.companion-edge-rail.bottom .companion-edge-line { top: auto; bottom: 0; }
.edge-quota-track { display: flex; align-items: flex-end; width: 4px; height: 100%; flex: 0 0 4px; overflow: hidden; background: color-mix(in srgb, var(--edge-color) 24%, transparent); --edge-color: var(--edge-codex); }
.edge-quota-track.claude { --edge-color: var(--edge-claude); }
.edge-quota-track i { display: block; width: 100%; height: 100%; background: var(--edge-color); }
.horizontal .edge-quota-track { width: 100%; height: 4px; }
.edge-quota-track.unavailable { opacity: .45; }
.edge-readout-body { position: absolute; inset: 0 0 0 8px; display: flex; flex-direction: column; padding: 3px 1px; border: 1px solid var(--codex-border); border-left: 0; border-radius: 0 8px 8px 0; background: var(--codex-surface); color: var(--codex-fg); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--codex-fg) 3%, transparent); }
.right .edge-readout-body { inset: 0 8px 0 0; border: 1px solid var(--codex-border); border-right: 0; border-radius: 8px 0 0 8px; }
.horizontal .edge-readout-body { inset: 8px 0 0; flex-direction: row; padding: 1px 3px; border: 1px solid var(--codex-border); border-top: 0; border-radius: 0 0 8px 8px; }
.bottom .edge-readout-body { inset: 0 0 8px; border: 1px solid var(--codex-border); border-bottom: 0; border-radius: 8px 8px 0 0; }
.edge-readings.float-drag-handle { position: relative; inset: auto; display: flex; flex-direction: column; flex: 1 1 0; min-height: 0; height: auto; gap: 0; }
.edge-reading { position: relative; display: flex; flex: 1 1 0; align-items: center; justify-content: center; min-height: 18px; font-size: 13px; font-weight: 650; font-variant-numeric: tabular-nums; }
.edge-reading + .edge-reading::before { position: absolute; top: 0; left: 30%; right: 30%; height: 1px; background: var(--codex-border); content: ''; }
.edge-counters { position: relative; z-index: 18; display: flex; flex-direction: column; flex: 0 0 auto; align-items: center; gap: 1px; padding-top: 3px; border-top: 1px solid var(--codex-border); pointer-events: none; }
.edge-counters button { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; height: 22px; min-width: 20px; padding: 0 2px; pointer-events: auto; border: 0; border-radius: 4px; color: var(--codex-fg); background: transparent; cursor: pointer; font-size: 10px; font-weight: 750; font-variant-numeric: tabular-nums; }
.edge-counter-dot { width: 5px; height: 5px; flex: none; border-radius: 50%; background: var(--codex-counter-input); }
.edge-counters button.active .edge-counter-dot { background: var(--codex-counter-active); }
.edge-counters button.unread .edge-counter-dot { background: var(--codex-counter-unread); }
.edge-counters button:hover { background: color-mix(in srgb, var(--codex-fg) 10%, transparent); }
.edge-counters button:focus-visible { outline: 2px solid var(--codex-focus); outline-offset: -2px; }
.horizontal .edge-readings { flex-direction: row; min-width: 0; }
.horizontal .edge-reading { min-width: 18px; min-height: 0; }
.horizontal .edge-reading + .edge-reading::before { top: 30%; bottom: 30%; left: 0; right: auto; width: 1px; height: auto; }
.horizontal .edge-counters { flex-direction: row; border-top: 0; border-left: 1px solid var(--codex-border); padding-top: 0; padding-left: 3px; }
</style>
