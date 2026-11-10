<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import CodexWaterBall from './CodexWaterBall.vue'
import { buildCodexCompactPresentation, codexWeeklyReading } from '../domain/codexPresentation'
import { resolveCompanionWaterBallPresentation } from '../domain/companionPresentation'
import { codexThemeCssVars, resolveCodexExpandedCardTheme } from '../domain/codexAppearance'
import type { CodexColorSettings, CodexCounterColors, CodexExpandedCardAppearanceSettings, CodexSettings } from '../domain/codex'
import type { CodexRuntimeView } from '../runtime/codexController'

const props = defineProps<{ snapshot: CodexRuntimeView; mode: 'water' | 'card' }>()
const emit = defineEmits<{ dispatch: [actionId: string, args?: Record<string, unknown>]; 'update:mode': [mode: 'water' | 'card']; 'update:selectedPart': [part: string] }>()
const selected = ref('')
const pointed = ref('')
const expanded = ref<Set<string>>(new Set())
const exploded = computed(() => expanded.value.size > 0)
const yaw = ref(0), pitch = ref(0)
let pointerStart: { x: number; y: number; yaw: number; pitch: number } | null = null
let suppressClick = false
const cardLayerIds = ['surface','accent','secondary','codexQuota','foreground']
function selectableLayer(id: string) { return props.mode === 'water' ? layers.some(layer => layer.id === id) || (['input','active','unread'].includes(id) && Boolean(compact.value.taskCounts[id as 'input' | 'active' | 'unread'])) : cardLayerIds.includes(id) }
function representedPart(id: string) { return props.mode === 'card' ? [...cardLayerIds, 'border', 'surfaceRaised'].includes(id) : selectableLayer(id) }
function toggleAll() { expanded.value = expanded.value.size ? new Set() : new Set(props.mode === 'water' ? [...layers.map(layer => layer.id), ...(['input','active','unread'] as const).filter(id => compact.value.taskCounts[id] > 0)] : cardLayerIds) }
function detach() { if (selectableLayer(selected.value)) expanded.value = new Set([...expanded.value, selected.value]) }
function restore() { const next = new Set(expanded.value); next.delete(selected.value); expanded.value = next }
function dragStart(event: PointerEvent) { if (event.button === 0) { suppressClick = false; pointerStart = { x: event.clientX, y: event.clientY, yaw: yaw.value, pitch: pitch.value } } }
function partFromTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return null
  const tagged = target.closest<HTMLElement>('[data-part]')
  if (tagged?.dataset.part) return tagged.dataset.part
  if (target.closest('.codex-water-ball__value')) return 'reading'
  const ringPart = target.closest('.codex-water-ball__ring .track, .codex-water-ball__ring .value, .codex-water-ball__ring .segment')
  if (ringPart) return ringPart.matches('.track, .segment:not(.active)') ? 'track' : 'ring'
  if (target.closest('.codex-water-ball__liquid')) return 'liquid'
  return target.closest('.codex-water-ball__surface') ? 'base' : null
}
function selectPart(id: string | null) { if (suppressClick) { suppressClick = false; return } if (id) selected.value = id }
function dragMove(event: PointerEvent) {
  if (!pointerStart || !event.buttons) return
  const dx = event.clientX - pointerStart.x, dy = event.clientY - pointerStart.y
  if (Math.hypot(dx, dy) > 4) suppressClick = true
  if (suppressClick) { yaw.value = pointerStart.yaw + dx * .006; pitch.value = Math.max(-.7, Math.min(.7, pointerStart.pitch - dy * .006)) }
}
function syncPointed(event: PointerEvent) {
  if (event.buttons) {
    if (suppressClick) pointed.value = ''
    return
  }
  pointed.value = partFromTarget(event.target) || ''
}
function onStagePointerMove(event: PointerEvent) {
  dragMove(event)
  syncPointed(event)
}
function onStagePointerLeave() {
  pointerStart = null
  pointed.value = ''
}
function stageKey(event: KeyboardEvent) { if (event.key === 'Home') { yaw.value = 0; pitch.value = 0; event.preventDefault(); return } if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return; event.preventDefault(); yaw.value += event.key === 'ArrowRight' ? .1 : event.key === 'ArrowLeft' ? -.1 : 0; pitch.value = Math.max(-.7, Math.min(.7, pitch.value + (event.key === 'ArrowUp' ? .1 : event.key === 'ArrowDown' ? -.1 : 0))) }
function pickBall(event: MouseEvent) { selectPart(partFromTarget(event.target)) }
function sampleLayer(id: string) {
  const p = realBallProps.value
  if (!expanded.value.has(id)) return false
  if (id === 'liquid') return p.liquidPercent == null && !p.primary
  if (id === 'ring' || id === 'track') return p.ringPercent == null && !codexWeeklyReading(p.primary, p.secondary)
  return false
}
function layerProps(id: string) { const p = realBallProps.value; return sampleLayer(id) ? { ...p, ...(id === 'liquid' ? { liquidPercent: 62 } : { ringPercent: 62 }) } : p }
function counterTransform(id: string) { const offsets: Record<string,string> = { input: 'translate3d(-42px,18px,65px)', active: 'translate3d(42px,-8px,65px)', unread: 'translate3d(42px,18px,65px)' }; return expanded.value.has(id) ? offsets[id] : 'translate3d(0,0,0)' }
const hue = ref(0)
const saturation = ref(0)
const brightness = ref(1)
const liquidColorChannel = ref<'A' | 'B'>('A')
const waterParts = [
  ['base', '球体底色'], ['liquid', '液体'], ['ring', '额度环'], ['track', '环形轨道'], ['reading', '读数文字'],
  ['input', '待输入角标'], ['active', '进行中角标'], ['unread', '未读角标'], ['healthy', '充足'], ['warning', '提醒'], ['critical', '紧张'],
  ['cursorGrid', 'Cursor 格标签']
] as const
const cardParts = [
  ['surface', '面板底色'], ['surfaceRaised', '内层块'], ['border', '边框'], ['foreground', '主文字'], ['secondary', '次文字'],
  ['accent', '选中强调'], ['focus', '焦点'], ['running', '进行中'], ['pending', '完成未读'], ['codexQuota', 'Codex 额度'], ['claudeQuota', 'Claude 额度'], ['cursorQuota', 'Cursor 额度（只读）']
] as const
const availableParts = computed(() => props.mode === 'water'
  ? waterParts.filter(([key]) => key !== 'cursorGrid' || props.snapshot.settings.magpieQuotaAccess)
  : cardParts.filter(([key]) => (key !== 'claudeQuota' || props.snapshot.settings.providers.claude) && (key !== 'cursorQuota' || props.snapshot.settings.providers.cursor || props.snapshot.settings.magpieQuotaAccess)))
function partName(id: string) { return availableParts.value.find(([key]) => key === id)?.[1] || '' }
const partHints = computed(() => ({ base: partName('base'), liquid: partName('liquid'), track: partName('track'), ring: partName('ring'), reading: partName('reading') }))
// The preview and editor share a grid row. Put the space removed between
// controls after them so compacting the editor does not shrink the preview.
const previewHeightSpace = computed(() => {
  const part = selected.value
  if (!part) return 0
  if (part === 'cursorGrid') return 36
  let rows = 6 + (representedPart(part) ? 0 : 1) + (props.mode === 'card' && part === 'cursorQuota' ? 1 : 0)
  let labels = 0
  if (props.mode === 'water') {
    if (part === 'base') { rows += 1; labels = 1 }
    else if (part === 'liquid') { rows += 5; labels = 5 }
    else if (part === 'ring' || part === 'track') { rows += 4; labels = 4 }
    else if (part === 'reading') { rows += 3; labels = 2 }
  }
  return 22 + (rows - 1) * 4 + labels
})
watch(() => props.mode, () => { selected.value = ''; pointed.value = ''; expanded.value = new Set() })
watch(() => props.snapshot.settings.magpieQuotaAccess, (enabled) => { if (!enabled && selected.value === 'cursorGrid') selected.value = '' })
watch(selected, (part) => emit('update:selectedPart', part))
function clearSelection() { selected.value = '' }
defineExpose({ clearSelection })
const compact = computed(() => buildCodexCompactPresentation({ quota: props.snapshot.quota, compactFields: props.snapshot.settings.compactFields, conversationInboxEnabled: props.snapshot.settings.conversationInboxEnabled, taskCounts: props.snapshot.taskState.dynamic.compactCounts }))
const companion = computed(() => resolveCompanionWaterBallPresentation({ providers: props.snapshot.settings.providers, claudeQuota: props.snapshot.claudeQuota, claudeEnvironment: props.snapshot.claudeEnvironment, magpieQuota: props.snapshot.companion?.magpieQuota }, { primary: compact.value.primary, secondary: compact.value.secondary, quota: props.snapshot.quota }))
const cardStyle = computed(() => codexThemeCssVars(resolveCodexExpandedCardTheme(props.snapshot.settings.colors, props.snapshot.settings.expandedCardAppearance, compact.value.primary?.bucket.remainingPercent ?? 100)))
const realBallProps = computed(() => ({ primary: compact.value.primary, secondary: compact.value.secondary, stateLabel: compact.value.stateLabel, label: `${compact.value.ariaLabel}${companion.value.ariaSuffix}${companion.value.quotaGrid.ariaSuffix}`, appearance: props.snapshot.settings.waterAppearance, colors: props.snapshot.settings.colors, percentOverride: companion.value.percentOverride, scopedPercent: companion.value.scopedPercent, percentProviderLabel: companion.value.percentProviderLabel, liquidPercent: companion.value.liquidPercent, ringPercent: companion.value.ringPercent, quotaGrid: companion.value.quotaGrid.enabled ? companion.value.quotaGrid.cells : null, quotaHint: companion.value.quotaHint, decorative: true }))
const layers = [ { id: 'base', name: '球体与高光', x: -62, y: -10, z: -40 }, { id: 'liquid', name: '水波', x: 64, y: 6, z: 35 }, { id: 'track', name: '外环轨道', x: -34, y: -68, z: 8 }, { id: 'ring', name: '额度环', x: 52, y: -66, z: 65 }, { id: 'reading', name: '读数', x: 0, y: 42, z: 90 } ] as const
function update(patch: Partial<CodexSettings>) { emit('dispatch', 'codex.settings.update', { settings: patch }) }
function updateInner(key: string, value: string | number | boolean) { const water = props.snapshot.settings.waterAppearance; update({ waterAppearance: { ...water, inner: { ...water.inner, [key]: value } } }) }
function updateOuter(key: string, value: string | number) { const water = props.snapshot.settings.waterAppearance; update({ waterAppearance: { ...water, outer: { ...water.outer, [key]: value } } }) }
function onCursorPrimaryLabel(value: string) { update({ magpieQuotaGridCursorPrimaryLabel: value.trim().slice(0, 4) || 'G' }) }
function onCursorSecondaryLabel(value: string) { update({ magpieQuotaGridCursorSecondaryLabel: value.trim().slice(0, 4) || 'A' }) }
const selectedColor = computed(() => {
  const s = props.snapshot.settings, k = selected.value
  if (props.mode === 'card') return k === 'cursorQuota' ? resolveCodexExpandedCardTheme(s.colors, s.expandedCardAppearance, compact.value.primary?.bucket.remainingPercent ?? 100).quotaCursor : s.expandedCardAppearance[k as keyof CodexExpandedCardAppearanceSettings] || '#000000'
  if (k === 'cursorGrid') return '#23B5A5'
  if (k === 'base') return s.colors.water
  if (k === 'liquid') return liquidColorChannel.value === 'A' ? s.waterAppearance.inner.fillColorA : s.waterAppearance.inner.fillColorB
  if (k === 'ring') return s.waterAppearance.outer.progressColor
  if (k === 'track') return s.waterAppearance.outer.trackColor
  if (k === 'reading') return s.waterAppearance.inner.percentColor
  if (k === 'input' || k === 'active' || k === 'unread') return s.counterColors[k as keyof CodexCounterColors]
  return s.colors[k as keyof CodexColorSettings] || '#000000'
})
function setColor(value: string) {
  const color = value.toUpperCase(), s = props.snapshot.settings, k = selected.value
  if (!/^#[0-9A-F]{6}$/.test(color) || (props.mode === 'card' && k === 'cursorQuota') || k === 'cursorGrid') return
  if (props.mode === 'card') update({ expandedCardAppearance: { ...s.expandedCardAppearance, [k]: color } })
  else if (k === 'base') update({ colors: { ...s.colors, water: color } })
  else if (k === 'liquid') updateInner(liquidColorChannel.value === 'A' ? 'fillColorA' : 'fillColorB', color)
  else if (k === 'ring') update({ waterAppearance: { ...s.waterAppearance, outer: { ...s.waterAppearance.outer, colorMode: 'custom', progressColor: color } } })
  else if (k === 'track') updateOuter('trackColor', color)
  else if (k === 'reading') updateInner('percentColor', color)
  else if (k === 'input' || k === 'active' || k === 'unread') update({ counterColors: { ...s.counterColors, [k]: color } })
  else update({ colors: { ...s.colors, [k]: color } })
}
function loadColor(hex: string) { const nums = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16) / 255); const max = Math.max(...nums), min = Math.min(...nums), d = max-min; let h = 0; if (d) { if (max===nums[0]) h=((nums[1]-nums[2])/d)%6; else if(max===nums[1]) h=(nums[2]-nums[0])/d+2; else h=(nums[0]-nums[1])/d+4; h=(h*60+360)%360 } hue.value=h; saturation.value=max?d/max:0; brightness.value=max }
watch(selectedColor, loadColor, { immediate: true })
function hsvHex() { const h=hue.value,s=saturation.value,v=brightness.value,c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c; const rgb=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];return '#'+rgb.map(n=>Math.round((n+m)*255).toString(16).padStart(2,'0')).join('').toUpperCase() }
function pickSpectrum(event: PointerEvent) { if (props.mode === 'card' && selected.value === 'cursorQuota') return; const el=event.currentTarget as HTMLElement, r=el.getBoundingClientRect(); saturation.value=Math.max(0,Math.min(1,(event.clientX-r.left)/r.width));brightness.value=1-Math.max(0,Math.min(1,(event.clientY-r.top)/r.height));setColor(hsvHex()) }
function startPick(event: PointerEvent) { if (props.mode === 'card' && selected.value === 'cursorQuota') return; (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); pickSpectrum(event) }
function spectrumKey(event: KeyboardEvent) { if (props.mode === 'card' && selected.value === 'cursorQuota') return; if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return; event.preventDefault(); saturation.value=Math.max(0,Math.min(1,saturation.value+(event.key==='ArrowRight'?.02:event.key==='ArrowLeft'?-.02:0)));brightness.value=Math.max(0,Math.min(1,brightness.value+(event.key==='ArrowUp'?.02:event.key==='ArrowDown'?-.02:0)));setColor(hsvHex()) }
</script>

<template>
  <div class="appearance-studio">
      <div class="appearance-studio-stage" tabindex="0" :aria-label="`模型预览，方向键旋转，Home 恢复视角，双击散开或聚合${mode === 'water' && companion.remoteLimit ? companion.ariaSuffix : ''}`" @keydown="stageKey" @dblclick="toggleAll" @pointerdown="dragStart" @pointermove="onStagePointerMove" @pointerup="pointerStart = null" @pointerleave="onStagePointerLeave">
        <div class="appearance-studio-tabs" @pointerdown.stop @pointermove.stop @pointerup.stop @click.stop @dblclick.stop @keydown.stop>
          <button type="button" :class="{ active: mode === 'water' }" :aria-pressed="mode === 'water'" @click="emit('update:mode','water')">水球</button>
          <button type="button" :class="{ active: mode === 'card' }" :aria-pressed="mode === 'card'" @click="emit('update:mode','card')">卡片</button>
          <button type="button" class="appearance-assembly" :aria-pressed="exploded" @click="toggleAll">{{ exploded ? '聚合' : '散开' }}</button>
        </div>
        <div v-if="mode === 'water'" class="appearance-studio-ball" :class="{ exploded }" :style="{ transform: `rotateX(${pitch}rad) rotateY(${yaw}rad)` }">
          <div v-if="!exploded" :class="['appearance-complete', selected ? `selected-${selected}` : '', pointed ? `pointed-${pointed}` : '']" @click="pickBall">
            <CodexWaterBall v-bind="realBallProps" :part-hints="partHints" />
            <button v-for="layer in layers" :key="layer.id" type="button" class="appearance-part-key" :data-part="layer.id" :aria-label="partName(layer.id)" @click.stop="selectPart(layer.id)">{{ partName(layer.id) }}</button>
          </div>
          <div v-for="layer in exploded ? layers : []" :key="layer.id" class="appearance-layer" :data-part="layer.id" :data-operation-tooltip="`${partName(layer.id)}${sampleLayer(layer.id) ? ' · 示例' : ''}`" :class="[`layer-${layer.id}`, { selected: selected === layer.id, pointed: pointed === layer.id }]" :style="{ transform: expanded.has(layer.id) ? `translate3d(${layer.x}px,${layer.y}px,${layer.z}px)` : 'translate3d(0,0,0)' }" @click.stop="selectPart(layer.id)"><CodexWaterBall v-bind="layerProps(layer.id)" suppress-grid-hints /><button type="button" class="appearance-part-key" :data-part="layer.id" :aria-label="`${partName(layer.id)}${sampleLayer(layer.id) ? '，示例' : ''}`" @click.stop="selectPart(layer.id)">{{ partName(layer.id) }}</button></div>
          <button v-if="compact.taskCounts.input" type="button" data-part="input" :data-operation-tooltip="partName('input')" :aria-label="`${partName('input')}：${compact.taskCounts.input}`" :style="{ background: snapshot.settings.counterColors.input, transform: counterTransform('input') }" :class="{ selected: selected === 'input', pointed: pointed === 'input' }" class="appearance-counter input" @click.stop="selectPart('input')">{{ compact.taskCounts.input }}</button>
          <button v-if="compact.taskCounts.active" type="button" data-part="active" :data-operation-tooltip="partName('active')" :aria-label="`${partName('active')}：${compact.taskCounts.active}`" :style="{ background: snapshot.settings.counterColors.active, transform: counterTransform('active') }" :class="{ selected: selected === 'active', pointed: pointed === 'active' }" class="appearance-counter active" @click.stop="selectPart('active')">{{ compact.taskCounts.active }}</button>
          <button v-if="compact.taskCounts.unread" type="button" data-part="unread" :data-operation-tooltip="partName('unread')" :aria-label="`${partName('unread')}：${compact.taskCounts.unread}`" :style="{ background: snapshot.settings.counterColors.unread, transform: counterTransform('unread') }" :class="{ selected: selected === 'unread', pointed: pointed === 'unread' }" class="appearance-counter unread" @click.stop="selectPart('unread')">{{ compact.taskCounts.unread }}</button>
        </div>
        <div v-else class="appearance-card" :class="{ exploded, 'selected-raised': selected === 'surfaceRaised', 'pointed-raised': pointed === 'surfaceRaised' }" :style="[cardStyle, { transform: `rotateX(${pitch}rad) rotateY(${yaw}rad)` }]">
          <button type="button" data-part="surface" :aria-label="partName('surface')" class="appearance-card-surface" :class="{ selected: selected === 'surface' || selected === 'border', pointed: pointed === 'surface' || pointed === 'border' }" :style="{ transform: expanded.has('surface') ? 'translate3d(0px,0px,-35px)' : 'translate3d(0,0,0)' }" @click="selectPart(partFromTarget($event.target))"><span v-for="edge in ['top','right','bottom','left']" :key="edge" data-part="border" :data-operation-tooltip="partName('border')" :class="['appearance-border-hit', edge]" /></button>
          <button type="button" data-part="accent" :aria-label="partName('accent')" class="appearance-card-tabs" :class="{ selected: selected === 'accent', pointed: pointed === 'accent' }" :style="{ transform: expanded.has('accent') ? 'translate3d(0px,-34px,50px)' : 'translate3d(0,0,0)' }" @click="selectPart('accent')">动态　　已完成　　已隐藏　　项目</button>
          <button type="button" data-part="secondary" :aria-label="partName('secondary')" class="appearance-card-search" :class="{ selected: selected === 'secondary', pointed: pointed === 'secondary' }" :style="{ transform: expanded.has('secondary') ? 'translate3d(-25px,-12px,70px)' : 'translate3d(0,0,0)' }" @click="selectPart('secondary')">⌕　别名|任务|项目</button>
          <button type="button" data-part="codexQuota" :data-operation-tooltip="partName('codexQuota')" :aria-label="`${partName('codexQuota')}：${compact.primary ? `${compact.primary.bucket.remainingPercent}%` : '—'}`" class="appearance-card-quota" :class="{ selected: selected === 'codexQuota', pointed: pointed === 'codexQuota' }" :style="{ transform: expanded.has('codexQuota') ? 'translate3d(24px,8px,90px)' : 'translate3d(0,0,0)' }" @click="selectPart('codexQuota')">{{ compact.primary?.longLabel || '额度' }}　{{ compact.primary ? `${compact.primary.bucket.remainingPercent}%` : '—' }}</button>
          <button type="button" data-part="foreground" :aria-label="partName('foreground')" class="appearance-card-task" :class="{ selected: selected === 'foreground', pointed: pointed === 'foreground' }" :style="{ transform: expanded.has('foreground') ? 'translate3d(0px,30px,110px)' : 'translate3d(0,0,0)' }" @click="selectPart('foreground')">●　{{ compact.taskCounts.active }} 个进行中任务</button>
        </div>
      </div>
    <div class="appearance-studio-editor" :class="{ 'appearance-has-unrepresented': selected && selected !== 'cursorGrid' && !representedPart(selected) }" :style="{ '--appearance-preview-space': `${previewHeightSpace}px` }">
      <div class="appearance-studio-toolbar">
        <label class="appearance-part-select"><select v-model="selected" class="codex-select" aria-label="选择配置部件" :data-operation-tooltip="selected ? partName(selected) : '选择'"><option value="">选择</option><option v-for="[id,name] in availableParts" :key="id" :value="id">{{ name }}</option></select></label>
        <slot name="theme-controls" />
      </div>
      <slot name="theme-error" />
      <template v-if="selected">
      <p v-if="selected !== 'cursorGrid' && !representedPart(selected)" class="appearance-unrepresented"><span class="appearance-unrepresented-chip" :style="{ '--part-color': selectedColor }" aria-hidden="true" /> 此部件当前未显示在模型中，可继续配置。</p>
      <template v-if="selected !== 'cursorGrid'">
      <p v-if="mode === 'card' && selected === 'cursorQuota'" class="appearance-readonly">Cursor 颜色由主题自动派生，只读。</p>
      <div class="appearance-spectrum" role="slider" :tabindex="mode === 'card' && selected === 'cursorQuota' ? -1 : 0" :aria-disabled="mode === 'card' && selected === 'cursorQuota'" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="Math.round(saturation * 100)" aria-label="颜色饱和度与亮度" :aria-valuetext="selectedColor" :style="{ backgroundColor: `hsl(${hue},100%,50%)` }" @pointerdown="startPick" @pointermove="event => { if (event.buttons) pickSpectrum(event) }" @keydown="spectrumKey"><i :style="{ left: `${saturation * 100}%`, top: `${(1 - brightness) * 100}%` }" /></div>
      <input class="appearance-hue" type="range" min="0" max="359" :disabled="mode === 'card' && selected === 'cursorQuota'" :value="hue" aria-label="色相" @input="hue = Number(($event.target as HTMLInputElement).value); setColor(hsvHex())" />
      <label class="appearance-hex"><span>HEX</span><input :value="selectedColor" :disabled="mode === 'card' && selected === 'cursorQuota'" maxlength="7" aria-label="十六进制颜色" @change="setColor(($event.target as HTMLInputElement).value)" /></label>
      <div class="appearance-swatches"><button v-for="color in ['#FFFFFF','#1B3331','#23B5A5','#3B8FD4','#D88A26','#E85A4F','#B78B00','#8B78BF']" :key="color" type="button" :style="{ background: color }" :aria-label="`选择 ${color}`" :disabled="mode === 'card' && selected === 'cursorQuota'" @click="setColor(color)" /></div>
      <template v-if="mode === 'water' && selected === 'base'"><label>底色透明度 <input type="range" min="0" max="100" :value="snapshot.settings.waterAppearance.inner.baseOpacity" @input="updateInner('baseOpacity', Number(($event.target as HTMLInputElement).value))" /></label></template>
      <template v-if="mode === 'water' && selected === 'liquid'"><label>液体颜色<select v-model="liquidColorChannel" class="codex-select"><option value="A">颜色 A</option><option value="B">颜色 B</option></select></label><label>液体配色<select class="codex-select" :value="snapshot.settings.waterAppearance.inner.palette" @change="updateInner('palette', ($event.target as HTMLSelectElement).value)"><option value="solid">纯色</option><option value="gradient">渐变</option><option value="aurora">炫彩</option></select></label><label>液体透明度 <input type="range" min="40" max="95" :value="snapshot.settings.waterAppearance.inner.opacity" @input="updateInner('opacity', Number(($event.target as HTMLInputElement).value))" /></label><label>水波幅度 <input type="range" min="4" max="12" :value="snapshot.settings.waterAppearance.inner.amplitude" @input="updateInner('amplitude', Number(($event.target as HTMLInputElement).value))" /></label><label>水波速度 <select class="codex-select" :value="snapshot.settings.waterAppearance.inner.motion" @change="updateInner('motion', ($event.target as HTMLSelectElement).value)"><option value="static">静止</option><option value="slow">缓慢</option><option value="normal">正常</option><option value="fast">快速</option></select></label></template>
      <template v-if="mode === 'water' && (selected === 'ring' || selected === 'track')"><label>环样式 <select class="codex-select" :value="snapshot.settings.waterAppearance.outer.style" @change="updateOuter('style', ($event.target as HTMLSelectElement).value)"><option value="solid">圆环</option><option value="segmented">固定分段</option></select></label><label>环宽 <input type="range" min="2" max="6" :value="snapshot.settings.waterAppearance.outer.thickness" @input="updateOuter('thickness', Number(($event.target as HTMLInputElement).value))" /></label><label>进度颜色<select class="codex-select" :value="snapshot.settings.waterAppearance.outer.colorMode" @change="updateOuter('colorMode', ($event.target as HTMLSelectElement).value)"><option value="quota">跟随额度状态</option><option value="custom">自定义</option></select></label><label>环光晕<select class="codex-select" :value="snapshot.settings.waterAppearance.outer.glow" @change="updateOuter('glow', ($event.target as HTMLSelectElement).value)"><option value="off">关闭</option><option value="soft">柔和</option><option value="strong">强</option></select></label></template>
      </template>
      <div v-if="selected !== 'cursorGrid'" class="appearance-part-actions"><button type="button" :disabled="!selectableLayer(selected) || expanded.has(selected)" @click="detach">拆出</button><button type="button" :disabled="!expanded.has(selected)" @click="restore">放回</button></div>
      <template v-if="mode === 'water' && selected === 'reading'"><label><span>显示读数 <input type="checkbox" :checked="snapshot.settings.waterAppearance.inner.showPercent" @change="updateInner('showPercent', ($event.target as HTMLInputElement).checked)" /></span></label><label>文字位置<select class="codex-select" :value="snapshot.settings.waterAppearance.inner.percentPosition" @change="updateInner('percentPosition', ($event.target as HTMLSelectElement).value)"><option value="auto">自动</option><option value="center">居中</option><option value="bottom-left">左下</option><option value="bottom-right">右下</option></select></label><label>文字大小 <input type="range" min="12" max="32" :value="snapshot.settings.waterAppearance.inner.percentSize" @input="updateInner('percentSize', Number(($event.target as HTMLInputElement).value))" /></label></template>
      <template v-if="mode === 'water' && selected === 'cursorGrid'"><p class="appearance-readonly">仅影响 Magpie 水球 Cursor 格简称，不改额度来源。</p><label>主格简称<input class="codex-text" type="text" maxlength="4" :value="snapshot.settings.magpieQuotaGridCursorPrimaryLabel" @change="onCursorPrimaryLabel(($event.target as HTMLInputElement).value)" /></label><label>次格简称<input class="codex-text" type="text" maxlength="4" :value="snapshot.settings.magpieQuotaGridCursorSecondaryLabel" @change="onCursorSecondaryLabel(($event.target as HTMLInputElement).value)" /></label></template>
      </template>
    </div>
  </div>
</template>

<style scoped>
.appearance-studio{display:grid;grid-template-columns:minmax(280px,1.15fr) minmax(240px,300px);align-items:stretch;gap:8px;margin:4px 0 0;min-width:0}
.appearance-studio-tabs{position:absolute;z-index:10;inset:8px 8px auto;display:flex;align-items:center;gap:4px;pointer-events:none}.appearance-studio-tabs button{pointer-events:auto;border:1px solid var(--codex-border,#dce7de);border-radius:7px;background:var(--codex-surface,#fff);padding:5px 9px;color:var(--codex-muted,#61796e);font-size:12px;cursor:pointer}.appearance-studio-tabs button.active{color:var(--codex-fg,#244238);box-shadow:0 1px 5px #1745351c}.appearance-studio-tabs .appearance-assembly{margin-left:auto;color:var(--codex-accent,#138574)}
.appearance-studio-stage{position:relative;display:grid;place-items:center;min-width:0;min-height:clamp(260px,calc(100vh - 245px),420px);height:auto;overflow:hidden;border-radius:10px;perspective:800px;background:radial-gradient(ellipse at 50% 38%,#fafbf5,#e4efe5);touch-action:none}.appearance-studio-stage::before{content:'';position:absolute;inset:0;background-image:linear-gradient(#60907a0b 1px,transparent 1px),linear-gradient(90deg,#60907a0b 1px,transparent 1px);background-size:30px 30px;pointer-events:none}.appearance-studio-ball{position:relative;width:94px;height:94px;scale:2;transform-style:preserve-3d;transition:scale .4s,translate .4s}.appearance-studio-ball.exploded{scale:1.18;translate:0 -8%}.appearance-layer,.appearance-complete{position:absolute;inset:0;transform-style:preserve-3d;transition:transform .65s cubic-bezier(.22,.7,.2,1);cursor:pointer}.appearance-part-key{position:absolute;top:50%;left:50%;width:1px;height:1px;min-height:0!important;padding:0;border:0;opacity:0;overflow:hidden;pointer-events:none}
.layer-base :deep(.codex-water-ball__liquid),.layer-base :deep(.codex-water-ball__ring),.layer-base :deep(.codex-water-ball__value){visibility:hidden}.layer-liquid :deep(.codex-water-ball__surface::before){opacity:0}.layer-liquid :deep(.codex-water-ball__surface){box-shadow:none}.layer-liquid :deep(.refraction),.layer-liquid :deep(.glass-highlight),.layer-liquid :deep(.codex-water-ball__ring),.layer-liquid :deep(.codex-water-ball__value){visibility:hidden}.layer-track :deep(.codex-water-ball__surface),.layer-track :deep(.codex-water-ball__value),.layer-track :deep(.codex-water-ball__ring .value),.layer-track :deep(.codex-water-ball__ring .segment.active){visibility:hidden}.layer-ring :deep(.codex-water-ball__surface),.layer-ring :deep(.codex-water-ball__value),.layer-ring :deep(.codex-water-ball__ring .track),.layer-ring :deep(.codex-water-ball__ring .segment:not(.active)){visibility:hidden}.layer-reading :deep(.codex-water-ball__surface),.layer-reading :deep(.codex-water-ball__ring){visibility:hidden}
.appearance-layer{pointer-events:none}.layer-base :deep(.codex-water-ball__surface),.layer-liquid :deep(.codex-water-ball__liquid),.layer-reading :deep(.codex-water-ball__value){pointer-events:auto}.appearance-studio-ball :deep(.codex-water-ball__ring){pointer-events:none}.appearance-studio-ball :deep(.codex-water-ball__ring circle),.appearance-studio-ball :deep(.codex-water-ball__ring line){pointer-events:visibleStroke}
.appearance-counter{transition:transform .6s;position:absolute;z-index:5;display:grid;min-width:20px;height:20px;place-items:center;border:2px solid #fff;border-radius:20px;color:#fff;font-weight:800;font-size:9px}.appearance-counter.input{left:0;bottom:0;background:#e5486f}.appearance-counter.active{right:0;bottom:23px;background:#258bc7}.appearance-counter.unread{right:0;bottom:0;background:#b84d91}
/* Preserve the card preview size when the surrounding padding is removed. */
.appearance-card{position:relative;width:min(calc(82% - 31.16px),340px);height:220px;transform-style:preserve-3d}.appearance-card button{position:absolute;text-align:left;font-size:11px;cursor:pointer}.appearance-card-surface{inset:0;border:1px solid var(--codex-border);border-radius:14px;background:var(--codex-surface)}.appearance-card-tabs,.appearance-card-search,.appearance-card-quota,.appearance-card-task{left:12px;right:12px;border:0;border-radius:6px;color:var(--codex-fg);background:var(--codex-surface-raised);padding:8px;transition:transform .5s}.appearance-card-tabs{top:12px}.appearance-card-search{top:52px;color:var(--codex-muted)}.appearance-card-quota{top:92px}.appearance-card-task{top:132px}

/* Mark only the visible geometry belonging to the actual pointed or selected part. */
.appearance-layer.selected.layer-base :deep(.codex-water-ball__surface),.appearance-layer.pointed.layer-base :deep(.codex-water-ball__surface),.appearance-layer.layer-base:focus-within :deep(.codex-water-ball__surface),.appearance-complete.selected-base :deep(.codex-water-ball__surface),.appearance-complete.pointed-base :deep(.codex-water-ball__surface),.appearance-complete:has(.appearance-part-key[data-part="base"]:focus-visible) :deep(.codex-water-ball__surface){outline:3px solid #e4163d;outline-offset:-3px}
.appearance-layer.selected.layer-liquid :deep(.codex-water-ball__liquid),.appearance-layer.pointed.layer-liquid :deep(.codex-water-ball__liquid),.appearance-layer.layer-liquid:focus-within :deep(.codex-water-ball__liquid),.appearance-complete.selected-liquid :deep(.codex-water-ball__liquid),.appearance-complete.pointed-liquid :deep(.codex-water-ball__liquid),.appearance-complete:has(.appearance-part-key[data-part="liquid"]:focus-visible) :deep(.codex-water-ball__liquid){outline:3px solid #e4163d;outline-offset:-3px}
.appearance-layer.selected.layer-reading :deep(.codex-water-ball__value),.appearance-layer.pointed.layer-reading :deep(.codex-water-ball__value),.appearance-layer.layer-reading:focus-within :deep(.codex-water-ball__value),.appearance-complete.selected-reading :deep(.codex-water-ball__value),.appearance-complete.pointed-reading :deep(.codex-water-ball__value),.appearance-complete:has(.appearance-part-key[data-part="reading"]:focus-visible) :deep(.codex-water-ball__value){outline:3px solid #e4163d;outline-offset:2px;border-radius:5px}
.appearance-layer.selected.layer-track :deep(.codex-water-ball__ring .track),.appearance-layer.pointed.layer-track :deep(.codex-water-ball__ring .track),.appearance-layer.layer-track:focus-within :deep(.codex-water-ball__ring .track),.appearance-layer.selected.layer-track :deep(.codex-water-ball__ring .segment:not(.active)),.appearance-layer.pointed.layer-track :deep(.codex-water-ball__ring .segment:not(.active)),.appearance-layer.layer-track:focus-within :deep(.codex-water-ball__ring .segment:not(.active)),.appearance-complete.selected-track :deep(.codex-water-ball__ring .track),.appearance-complete.pointed-track :deep(.codex-water-ball__ring .track),.appearance-complete:has(.appearance-part-key[data-part="track"]:focus-visible) :deep(.codex-water-ball__ring .track),.appearance-complete.selected-track :deep(.codex-water-ball__ring .segment:not(.active)),.appearance-complete.pointed-track :deep(.codex-water-ball__ring .segment:not(.active)),.appearance-complete:has(.appearance-part-key[data-part="track"]:focus-visible) :deep(.codex-water-ball__ring .segment:not(.active)),.appearance-layer.selected.layer-ring :deep(.codex-water-ball__ring .value),.appearance-layer.pointed.layer-ring :deep(.codex-water-ball__ring .value),.appearance-layer.layer-ring:focus-within :deep(.codex-water-ball__ring .value),.appearance-layer.selected.layer-ring :deep(.codex-water-ball__ring .segment.active),.appearance-layer.pointed.layer-ring :deep(.codex-water-ball__ring .segment.active),.appearance-layer.layer-ring:focus-within :deep(.codex-water-ball__ring .segment.active),.appearance-complete.selected-ring :deep(.codex-water-ball__ring .value),.appearance-complete.pointed-ring :deep(.codex-water-ball__ring .value),.appearance-complete:has(.appearance-part-key[data-part="ring"]:focus-visible) :deep(.codex-water-ball__ring .value),.appearance-complete.selected-ring :deep(.codex-water-ball__ring .segment.active),.appearance-complete.pointed-ring :deep(.codex-water-ball__ring .segment.active),.appearance-complete:has(.appearance-part-key[data-part="ring"]:focus-visible) :deep(.codex-water-ball__ring .segment.active){filter:drop-shadow(0 0 1px #e4163d) drop-shadow(0 0 2px #e4163d) drop-shadow(0 0 2px #e4163d)}
.appearance-counter.selected,.appearance-counter.pointed,.appearance-counter:focus-visible,.appearance-card button.selected,.appearance-card button.pointed,.appearance-card button:focus-visible{outline:3px solid #e4163d;outline-offset:2px}
.appearance-card.selected-raised .appearance-card-tabs,.appearance-card.pointed-raised .appearance-card-tabs,.appearance-card.selected-raised .appearance-card-search,.appearance-card.pointed-raised .appearance-card-search,.appearance-card.selected-raised .appearance-card-quota,.appearance-card.pointed-raised .appearance-card-quota,.appearance-card.selected-raised .appearance-card-task,.appearance-card.pointed-raised .appearance-card-task{outline:3px solid #e4163d;outline-offset:2px}
.appearance-border-hit{position:absolute;display:block}.appearance-border-hit.top,.appearance-border-hit.bottom{left:0;right:0;height:7px}.appearance-border-hit.top{top:0}.appearance-border-hit.bottom{bottom:0}.appearance-border-hit.left,.appearance-border-hit.right{top:0;bottom:0;width:7px}.appearance-border-hit.left{left:0}.appearance-border-hit.right{right:0}
.appearance-unrepresented{margin:0;line-height:1.5}.appearance-unrepresented-chip{display:inline-flex;align-items:center;gap:5px;margin:3px;padding:2px 5px;outline:2px solid #e4163d;outline-offset:2px;border-radius:4px;color:var(--codex-fg)}.appearance-unrepresented-chip::before{content:'';width:10px;height:10px;border:1px solid #789;border-radius:50%;background:var(--part-color)}

.appearance-studio-editor{display:grid;align-content:start;gap:6px;min-width:0;padding:0 0 var(--appearance-preview-space,0);font-size:11px;color:var(--codex-muted,#607c6e)}.appearance-studio-toolbar{display:flex;flex-wrap:wrap;gap:4px;align-items:center}.appearance-part-select{display:grid;flex:1.15 1 112px;min-width:110px}.appearance-studio-toolbar :deep(.appearance-theme-select){display:grid;flex:1 1 105px;min-width:100px}.appearance-studio-toolbar :deep(.appearance-theme-actions){flex:0 0 auto}.appearance-studio-editor label{display:grid;gap:4px}.appearance-spectrum{position:relative;height:132px;border-radius:8px;cursor:crosshair;touch-action:none;background-image:linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,transparent)}.appearance-spectrum i{position:absolute;width:12px;height:12px;border:2px solid white;border-radius:50%;box-shadow:0 0 0 1px #143b37;transform:translate(-50%,-50%);pointer-events:none}.appearance-hue{appearance:none;width:100%;height:8px;border-radius:8px;background:linear-gradient(to right,red,#ff0,#0f0,#00f,#f0f,red)}.appearance-hue::-webkit-slider-thumb{appearance:none;width:15px;height:15px;border:2px solid #268778;border-radius:50%;background:white}.appearance-hex{display:flex!important;align-items:center;gap:8px;padding:6px;border:1px solid var(--codex-border,#dce7de);border-radius:7px}.appearance-hex input{min-width:0;flex:1;border:0;background:transparent;color:var(--codex-fg);font:inherit}.appearance-swatches,.appearance-part-actions{display:flex;gap:6px}.appearance-swatches button{width:20px;height:20px;border:1px solid #d9e5dc;border-radius:50%;cursor:pointer}.appearance-part-actions button{flex:1;padding:6px;border:1px solid var(--codex-border);border-radius:7px;background:transparent;color:var(--codex-fg);cursor:pointer}.appearance-studio-editor input[type=range]{width:100%;accent-color:var(--codex-accent,#138574)}
.appearance-studio-toolbar :deep(.codex-select){width:100%;min-width:0;text-overflow:ellipsis}
@media(max-width:700px){.appearance-studio{grid-template-columns:minmax(0,1fr) minmax(210px,260px)}}@media(max-width:520px){.appearance-studio{grid-template-columns:1fr}.appearance-studio-stage{min-height:280px}}
@media(min-width:521px) and (max-width:700px){.appearance-studio-editor{padding-bottom:max(0px,calc(var(--appearance-preview-space,0px) - 32px))}}
@media(min-width:521px) and (max-width:700px){.appearance-studio-editor.appearance-has-unrepresented{padding-bottom:max(0px,calc(var(--appearance-preview-space,0px) - 15px))}}
@media(max-width:520px){.appearance-studio-editor{padding-bottom:0}.appearance-card{width:min(calc(82% - 27.88px),340px)}}

@media(prefers-reduced-motion:reduce){.appearance-layer,.appearance-studio-ball,.appearance-card button,.appearance-counter{transition:none!important}}
</style>
