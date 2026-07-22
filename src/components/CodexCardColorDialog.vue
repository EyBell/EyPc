<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { Check, X } from '@lucide/vue'
import type { CodexColorSettings } from '../domain/codex'
import {
  codexThemeCssVars,
  contrastRatio,
  hexToHsl,
  hslToHex,
  isHslContrastSafe,
  nearestContrastHsl,
  normalizeHex,
  resolveCodexSurfaceTheme,
  validateCodexCustomColors
} from '../domain/codexAppearance'
import type { HslColor } from '../domain/codexAppearance'

const props = defineProps<{ colors: CodexColorSettings }>()
const emit = defineEmits<{
  confirm: [colors: CodexColorSettings]
  preview: [colors: CodexColorSettings]
  cancel: []
}>()

type ColorGroupId = 'surface' | 'foreground'

interface ColorDraft {
  hex: string
  validHex: string
  hsl: HslColor
}

interface ColorGroup {
  id: ColorGroupId
  label: string
  description: string
  draft: ColorDraft
}

const BOARD_WIDTH = 180
const BOARD_HEIGHT = 108
const COLOR_CARD_OPTIONS = [
  { name: '纸白', hex: '#F7F9F7' },
  { name: '雾白', hex: '#E8EEEC' },
  { name: '薄荷', hex: '#B5E3B5' },
  { name: '海盐', hex: '#BFE7DF' },
  { name: '雾蓝', hex: '#C9DFF1' },
  { name: '沙白', hex: '#FAEFD9' },
  { name: '珊瑚', hex: '#F2B8B5' },
  { name: '薰衣草', hex: '#D8D2F0' },
  { name: '深墨', hex: '#07161D' },
  { name: '石墨', hex: '#20252A' },
  { name: '深海', hex: '#102C3C' },
  { name: '靛夜', hex: '#1D2444' }
] as const
const dialog = ref<HTMLElement | null>(null)
const lastAnchor = ref<ColorGroupId>('surface')
const openColorCards = ref<ColorGroupId | null>(null)
const boardCanvases: Record<ColorGroupId, HTMLCanvasElement | null> = { surface: null, foreground: null }
const colorCardTriggers: Record<ColorGroupId, HTMLButtonElement | null> = { surface: null, foreground: null }
const colorCardPopovers: Record<ColorGroupId, HTMLElement | null> = { surface: null, foreground: null }
const linkedAdjustmentMessage = ref('')
let drawFrame: number | null = null

function draftHsl(value: string): HslColor {
  const hsl = hexToHsl(value) || { h: 0, s: 0, l: 0 }
  return { h: Math.round(hsl.h), s: Math.round(hsl.s * 10) / 10, l: Math.round(hsl.l * 10) / 10 }
}

function createDraft(value: string): ColorDraft {
  const validHex = normalizeHex(value) || '#000000'
  return reactive({ hex: validHex, validHex, hsl: draftHsl(validHex) })
}

const surface = createDraft(props.colors.card)
const foreground = createDraft(props.colors.cardForeground)
const colorGroups = computed<ColorGroup[]>(() => [
  { id: 'surface', label: '卡片表面色', description: '卡片背景与表面', draft: surface },
  { id: 'foreground', label: '文字/图标前景色', description: '标题、正文与图标', draft: foreground }
])

function groupById(id: ColorGroupId): ColorGroup {
  return colorGroups.value.find((group) => group.id === id)!
}

const candidate = computed<CodexColorSettings>(() => ({
  ...props.colors,
  card: surface.validHex,
  cardForeground: foreground.validHex
}))
const malformedFields = computed(() => colorGroups.value.filter((group) => normalizeHex(group.draft.hex) === null))
const theme = computed(() => resolveCodexSurfaceTheme('card', candidate.value))
const previewStyle = computed(() => codexThemeCssVars(theme.value))
const pairContrast = computed(() => contrastRatio(candidate.value.card, candidate.value.cardForeground))
const validation = computed(() => {
  if (malformedFields.value.length) return { valid: false, message: '请修正标记的 HEX；需输入 # 加 6 位十六进制字符' }
  return validateCodexCustomColors(candidate.value)
})
const validationMessage = computed(() => validation.value.valid
  ? `${linkedAdjustmentMessage.value ? `${linkedAdjustmentMessage.value} ` : ''}当前对比度 ${pairContrast.value.toFixed(2)}:1（要求 4.5:1），可应用。`
  : validation.value.message)

function fieldInvalid(group: ColorGroup) {
  return normalizeHex(group.draft.hex) === null || (!malformedFields.value.length && !validation.value.valid)
}

function writeHsl(draft: ColorDraft, value: HslColor, preserveMalformedHex = false) {
  const hsl = {
    h: Math.round(((value.h % 360) + 360) % 360),
    s: Math.round(Math.max(0, Math.min(100, value.s)) * 10) / 10,
    l: Math.round(Math.max(0, Math.min(100, value.l)) * 10) / 10
  }
  const hex = hslToHex(hsl)
  draft.hsl = hsl
  draft.validHex = hex
  if (!preserveMalformedHex || normalizeHex(draft.hex)) draft.hex = hex
}

function publishPreview() {
  if (malformedFields.value.length || !validation.value.valid) return
  emit('preview', { ...candidate.value })
}

function syncLinkedPair(id: ColorGroupId) {
  const changed = groupById(id).draft
  const partnerId: ColorGroupId = id === 'surface' ? 'foreground' : 'surface'
  const partner = groupById(partnerId).draft
  if (!normalizeHex(changed.hex) || !normalizeHex(partner.hex)) {
    linkedAdjustmentMessage.value = ''
    return
  }
  if (isHslContrastSafe(partner.hsl, changed.validHex)) {
    linkedAdjustmentMessage.value = ''
    return
  }
  writeHsl(partner, nearestContrastHsl(partner.hsl, changed.validHex))
  linkedAdjustmentMessage.value = `已同步调整${groupById(partnerId).label}亮度，确保对比度可读。`
}

function applyHsl(id: ColorGroupId, value: HslColor) {
  lastAnchor.value = id
  writeHsl(groupById(id).draft, value)
  syncLinkedPair(id)
  queueDrawBoards()
  publishPreview()
}

function applyHex(id: ColorGroupId, value: string) {
  const normalized = normalizeHex(value)
  if (!normalized) return
  const draft = groupById(id).draft
  draft.hex = normalized
  draft.validHex = normalized
  draft.hsl = draftHsl(normalized)
  lastAnchor.value = id
  syncLinkedPair(id)
  queueDrawBoards()
  publishPreview()
}

function updateHex(id: ColorGroupId, event: Event) {
  const draft = groupById(id).draft
  draft.hex = (event.target as HTMLInputElement).value.toUpperCase()
  const normalized = normalizeHex(draft.hex)
  if (!normalized) return
  applyHex(id, normalized)
}

function setColorCardTrigger(id: ColorGroupId, element: unknown) {
  colorCardTriggers[id] = typeof HTMLButtonElement !== 'undefined' && element instanceof HTMLButtonElement ? element : null
}

function setColorCardPopover(id: ColorGroupId, element: unknown) {
  colorCardPopovers[id] = element instanceof HTMLElement ? element : null
}

function closeColorCards(restoreFocus = false) {
  const id = openColorCards.value
  if (!id) return
  openColorCards.value = null
  if (restoreFocus) void nextTick(() => colorCardTriggers[id]?.focus({ preventScroll: true }))
}

function toggleColorCards(id: ColorGroupId) {
  if (openColorCards.value === id) {
    closeColorCards(true)
    return
  }
  openColorCards.value = id
  void nextTick(() => colorCardPopovers[id]?.querySelector<HTMLButtonElement>('[role="option"]')?.focus({ preventScroll: true }))
}

function selectColorCard(id: ColorGroupId, hex: string) {
  applyHex(id, hex)
  closeColorCards(true)
}

function handleColorCardKeys(id: ColorGroupId, event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    closeColorCards(true)
    return
  }
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
  const options = Array.from(colorCardPopovers[id]?.querySelectorAll<HTMLButtonElement>('[role="option"]') || [])
  if (!options.length) return
  event.preventDefault()
  const current = Math.max(0, options.indexOf(document.activeElement as HTMLButtonElement))
  const columns = 4
  let next = current
  if (event.key === 'ArrowLeft') next = (current - 1 + options.length) % options.length
  else if (event.key === 'ArrowRight') next = (current + 1) % options.length
  else if (event.key === 'ArrowUp') next = (current - columns + options.length) % options.length
  else if (event.key === 'ArrowDown') next = (current + columns) % options.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = options.length - 1
  options[next]?.focus({ preventScroll: true })
}

function handleDocumentPointerDown(event: PointerEvent) {
  const id = openColorCards.value
  const target = event.target
  if (!id || !(target instanceof Node)) return
  if (colorCardTriggers[id]?.contains(target) || colorCardPopovers[id]?.contains(target)) return
  closeColorCards()
}

function handleDialogEscape() {
  if (openColorCards.value) closeColorCards(true)
  else emit('cancel')
}

function updateHue(id: ColorGroupId, event: Event) {
  const draft = groupById(id).draft
  applyHsl(id, { ...draft.hsl, h: Number((event.target as HTMLInputElement).value) })
}

function pickBoardColor(id: ColorGroupId, event: PointerEvent) {
  const canvas = boardCanvases[id]
  if (!canvas) return
  const bounds = canvas.getBoundingClientRect()
  if (bounds.width <= 0 || bounds.height <= 0) return
  const saturation = ((event.clientX - bounds.left) / bounds.width) * 100
  const lightness = (1 - (event.clientY - bounds.top) / bounds.height) * 100
  applyHsl(id, { ...groupById(id).draft.hsl, s: saturation, l: lightness })
}

function startBoardPick(id: ColorGroupId, event: PointerEvent) {
  boardCanvases[id]?.setPointerCapture?.(event.pointerId)
  pickBoardColor(id, event)
}

function continueBoardPick(id: ColorGroupId, event: PointerEvent) {
  if (event.buttons !== 1) return
  pickBoardColor(id, event)
}

function moveBoard(id: ColorGroupId, event: KeyboardEvent) {
  const draft = groupById(id).draft
  const step = event.shiftKey ? 5 : 1
  const next = { ...draft.hsl }
  if (event.key === 'ArrowLeft') next.s -= step
  else if (event.key === 'ArrowRight') next.s += step
  else if (event.key === 'ArrowUp') next.l += step
  else if (event.key === 'ArrowDown') next.l -= step
  else if (event.key === 'Home') next.s = 0
  else if (event.key === 'End') next.s = 100
  else return
  event.preventDefault()
  applyHsl(id, next)
}

function rgb(value: string): [number, number, number] {
  const normalized = normalizeHex(value) || '#000000'
  return [1, 3, 5].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16)) as [number, number, number]
}

function drawBoard(group: ColorGroup) {
  const canvas = boardCanvases[group.id]
  if (!canvas) return
  let context: CanvasRenderingContext2D | null = null
  try {
    context = canvas.getContext('2d')
  } catch {
    return
  }
  if (!context) return
  const image = context.createImageData(BOARD_WIDTH, BOARD_HEIGHT)
  const fixedColor = group.id === 'surface' ? foreground.validHex : surface.validHex
  for (let y = 0; y < BOARD_HEIGHT; y += 1) {
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      const hsl = { h: group.draft.hsl.h, s: (x / (BOARD_WIDTH - 1)) * 100, l: (1 - y / (BOARD_HEIGHT - 1)) * 100 }
      let [red, green, blue] = rgb(hslToHex(hsl))
      if (!isHslContrastSafe(hsl, fixedColor)) {
        const striped = (x + y) % 10 < 2 || ((x - y + 1_000) % 10) < 2
        red = Math.round(red * (striped ? 0.3 : 0.52) + 255 * (striped ? 0.7 : 0.48))
        green = Math.round(green * (striped ? 0.3 : 0.52) + 255 * (striped ? 0.7 : 0.48))
        blue = Math.round(blue * (striped ? 0.3 : 0.52) + 255 * (striped ? 0.7 : 0.48))
      }
      const offset = (y * BOARD_WIDTH + x) * 4
      image.data[offset] = red
      image.data[offset + 1] = green
      image.data[offset + 2] = blue
      image.data[offset + 3] = 255
    }
  }
  context.putImageData(image, 0, 0)
  const markerX = (group.draft.hsl.s / 100) * (BOARD_WIDTH - 1)
  const markerY = (1 - group.draft.hsl.l / 100) * (BOARD_HEIGHT - 1)
  context.beginPath()
  context.arc(markerX, markerY, 5.5, 0, Math.PI * 2)
  context.strokeStyle = '#FFFFFF'
  context.lineWidth = 3
  context.stroke()
  context.beginPath()
  context.arc(markerX, markerY, 6.5, 0, Math.PI * 2)
  context.strokeStyle = '#132B35'
  context.lineWidth = 1.5
  context.stroke()
}

function drawBoards() {
  drawFrame = null
  colorGroups.value.forEach(drawBoard)
}

function queueDrawBoards() {
  if (drawFrame !== null) cancelAnimationFrame(drawFrame)
  drawFrame = requestAnimationFrame(drawBoards)
}

function setBoardCanvas(id: ColorGroupId, element: unknown) {
  boardCanvases[id] = typeof HTMLCanvasElement !== 'undefined' && element instanceof HTMLCanvasElement ? element : null
  queueDrawBoards()
}

function trapFocus(event: KeyboardEvent) {
  const focusable = Array.from(dialog.value?.querySelectorAll<HTMLElement>(
    'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])'
  ) || []).filter((element) => element.isConnected && !element.hasAttribute('hidden'))
  if (!focusable.length) return
  const current = focusable.indexOf(document.activeElement as HTMLElement)
  const next = event.shiftKey
    ? (current <= 0 ? focusable.length - 1 : current - 1)
    : (current < 0 || current === focusable.length - 1 ? 0 : current + 1)
  event.preventDefault()
  focusable[next].focus({ preventScroll: true })
}

function confirm() {
  if (validation.value.valid) emit('confirm', { ...candidate.value })
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  void nextTick(() => {
    queueDrawBoards()
    boardCanvases.surface?.focus({ preventScroll: true })
    publishPreview()
  })
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  if (drawFrame !== null) cancelAnimationFrame(drawFrame)
})
</script>

<template>
  <div class="modal-backdrop codex-card-color-backdrop" @click.self="emit('cancel')">
    <section
      ref="dialog"
      class="codex-card-color-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="codex-card-color-title"
      aria-describedby="codex-card-color-intro codex-card-color-status"
      @keydown.tab="trapFocus"
      @keydown.escape.prevent.stop="handleDialogEscape"
    >
      <header class="codex-card-color-header">
        <div>
          <span>卡片颜色配置</span>
          <h2 id="codex-card-color-title">双色取色编辑</h2>
          <p id="codex-card-color-intro">可独立选择两块色板；每个色值都实时预览草稿效果，确认后保存，取消即恢复。</p>
        </div>
        <button type="button" class="codex-card-color-close" aria-label="取消并关闭双色编辑器" @click="emit('cancel')"><X :size="18" aria-hidden="true" /></button>
      </header>

      <div class="codex-card-color-body">
        <div class="codex-card-color-controls">
          <fieldset v-for="group in colorGroups" :key="group.id" class="codex-card-color-fieldset" :class="{ anchor: lastAnchor === group.id, 'cards-open': openColorCards === group.id }">
            <legend>
              <button
                :ref="(element) => setColorCardTrigger(group.id, element)"
                type="button"
                class="codex-card-color-swatch"
                :style="{ background: group.draft.validHex }"
                :aria-label="`打开${group.label}候选色卡`"
                aria-haspopup="listbox"
                :aria-expanded="openColorCards === group.id"
                :aria-controls="`codex-card-${group.id}-cards`"
                @click="toggleColorCards(group.id)"
              />
              <span><strong>{{ group.label }}</strong><small>{{ group.description }}</small></span>
            </legend>

            <div
              v-if="openColorCards === group.id"
              :id="`codex-card-${group.id}-cards`"
              :ref="(element) => setColorCardPopover(group.id, element)"
              class="codex-color-card-popover"
              role="listbox"
              data-operation-tooltip-ignore
              :aria-label="`${group.label}候选色卡`"
              @keydown="handleColorCardKeys(group.id, $event)"
            >
              <button
                v-for="option in COLOR_CARD_OPTIONS"
                :key="option.hex"
                type="button"
                role="option"
                :aria-selected="group.draft.validHex === option.hex"
                :aria-label="`${option.name} ${option.hex}`"
                :data-color-card="option.hex"
                @click="selectColorCard(group.id, option.hex)"
              >
                <i :style="{ background: option.hex }" aria-hidden="true" />
                <span>{{ option.name }}<small>{{ option.hex }}</small></span>
              </button>
            </div>

            <div class="codex-color-board-shell">
              <canvas
                :id="`codex-card-${group.id}-board`"
                :ref="(element) => setBoardCanvas(group.id, element)"
                class="codex-color-board"
                :class="{ anchor: lastAnchor === group.id }"
                :width="BOARD_WIDTH"
                :height="BOARD_HEIGHT"
                tabindex="0"
                role="slider"
                aria-valuemin="0"
                aria-valuemax="100"
                :aria-valuenow="group.draft.hsl.s"
                :aria-label="`${group.label}取色板；左右改变饱和度，上下改变亮度`"
                :aria-valuetext="`饱和度 ${group.draft.hsl.s}%，亮度 ${group.draft.hsl.l}%，颜色 ${group.draft.validHex}`"
                @pointerdown.prevent="startBoardPick(group.id, $event)"
                @pointermove.prevent="continueBoardPick(group.id, $event)"
                @keydown="moveBoard(group.id, $event)"
              />
              <span class="codex-color-board-key" aria-hidden="true">彩色配对 · 拖拽取值预览当前色板</span>
            </div>

            <div class="codex-color-board-values" aria-hidden="true">
              <span>S {{ group.draft.hsl.s }}%</span><span>L {{ group.draft.hsl.l }}%</span>
              <strong>{{ lastAnchor === group.id ? '当前编辑' : '待编辑' }}</strong>
            </div>

            <label class="codex-card-hue-field" :for="`codex-card-${group.id}-h`">
              <span>H · 色相 <strong>{{ group.draft.hsl.h }}°</strong></span>
              <input
                :id="`codex-card-${group.id}-h`"
                type="range"
                min="0"
                max="360"
                step="1"
                :value="group.draft.hsl.h"
                @input="updateHue(group.id, $event)"
              />
            </label>

            <label class="codex-card-hex-field" :for="`codex-card-${group.id}-hex`">
              <span>六位 HEX</span>
              <input
                :id="`codex-card-${group.id}-hex`"
                type="text"
                inputmode="text"
                autocomplete="off"
                spellcheck="false"
                maxlength="7"
                :value="group.draft.hex"
                :aria-invalid="fieldInvalid(group)"
                :aria-describedby="fieldInvalid(group) ? `codex-card-${group.id}-error codex-card-color-status` : 'codex-card-color-status'"
                @input="updateHex(group.id, $event)"
              />
            </label>
            <p v-if="normalizeHex(group.draft.hex) === null" :id="`codex-card-${group.id}-error`" class="codex-card-field-error">格式示例：#1A2B3C；预览继续使用最后一个有效值。</p>
          </fieldset>
        </div>

        <section class="codex-card-color-preview" :style="previewStyle" aria-label="卡片颜色草稿辅助预览">
          <span class="codex-card-preview-eyebrow"><Check :size="14" aria-hidden="true" /> 桌面伴侣同步中</span>
          <strong>真实悬浮卡片正在预览</strong>
          <p>这里仅显示缩略样例；桌面悬浮伴侣只展示效果，不放置任何配色控件。</p>
          <div><span>3 个任务</span><button type="button" tabindex="-1">查看详情</button></div>
        </section>
      </div>

      <p
        id="codex-card-color-status"
        class="codex-card-color-status"
        :class="validation.valid ? 'valid' : 'invalid'"
        :role="validation.valid ? 'status' : 'alert'"
        aria-live="polite"
      ><strong>{{ validation.valid ? '可以应用' : '暂不能应用' }}</strong><span>{{ validationMessage }}</span></p>

      <footer class="codex-card-color-actions">
        <button type="button" class="secondary" @click="emit('cancel')">取消并恢复</button>
        <button type="button" class="primary" :disabled="!validation.valid" aria-describedby="codex-card-color-status" @click="confirm">确认并应用</button>
      </footer>
    </section>
  </div>
</template>
