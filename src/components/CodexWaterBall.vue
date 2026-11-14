<script setup lang="ts">
import { computed } from 'vue'
import type { CodexColorSettings, CodexWaterAppearanceSettings } from '../domain/codex'
import { codexWaterAppearanceCssVars } from '../domain/codexAppearance'
import { codexWeeklyReading, type CodexQuotaReading } from '../domain/codexPresentation'
import { formatCompanionPercent, presentCompactQuotaGridCells, type CompactQuotaGridCell } from '../domain/magpieQuota'

const props = withDefaults(defineProps<{
  primary: CodexQuotaReading | null
  secondary: CodexQuotaReading | null
  stateLabel: string
  label: string
  appearance: CodexWaterAppearanceSettings
  colors: CodexColorSettings
  taskCount?: number
  signal?: 'ongoing' | 'completed-unread' | 'completed' | 'quiet'
  decorative?: boolean
  /**
   * Centre percentage owned by another provider. Null keeps the Codex-derived
   * rendering, which is the compatibility path: the liquid level and the ring
   * are unaffected either way, only the number in the middle changes.
   */
  percentOverride?: number | null
  /**
   * Leading per-model reading of an overridden centre. Set means the centre
   * reads `{scoped}/{primary}` with no unit and on a denser type scale, because
   * two percentages plus two `%` signs do not fit inside the ball.
   */
  scopedPercent?: number | null
  /** Short provider label shown beside an overridden percentage. */
  percentProviderLabel?: string
  /**
   * Liquid level owned by the centre provider when the mapped provider has no
   * positive reading. Null keeps the Codex-derived level — the compatibility
   * path — so the override only ever moves an otherwise-empty channel.
   */
  liquidPercent?: number | null
  /** Same fallback for the outer weekly ring. */
  ringPercent?: number | null
  /** Undefined keeps the legacy weekly-window decision; false explicitly hides the ring. */
  ringVisible?: boolean
  /** Marks the whole quota reading stale when no grid cell owns that state. */
  quotaStale?: boolean
  /** When set, the centre renders a 2×2 Magpie quota grid instead of one percentage. */
  quotaGrid?: CompactQuotaGridCell[] | null
  quotaHint?: string
  partHints?: { base: string; liquid: string; track: string; ring: string; reading: string }
  suppressGridHints?: boolean
}>(), {
  taskCount: 0,
  signal: 'quiet',
  decorative: false,
  percentOverride: null,
  scopedPercent: null,
  percentProviderLabel: '',
  liquidPercent: null,
  ringPercent: null,
  ringVisible: undefined,
  quotaStale: false,
  quotaGrid: null,
  quotaHint: ''
})

// Liquid level follows this ball's own primary reading; an override only
// replaces it when the mapped provider has nothing to show.
const percent = computed(() => props.primary?.bucket.remainingPercent ?? 0)
const hasLiquidOverride = computed(() => typeof props.liquidPercent === 'number' && Number.isFinite(props.liquidPercent))
const liquidLevel = computed(() => hasLiquidOverride.value ? props.liquidPercent as number : percent.value)
const hasPercentOverride = computed(() => typeof props.percentOverride === 'number' && Number.isFinite(props.percentOverride))
const displayPercent = computed(() => hasPercentOverride.value ? props.percentOverride as number : props.primary?.bucket.remainingPercent ?? null)
const centreText = computed(() => displayPercent.value === null ? props.stateLabel : formatCompanionPercent(displayPercent.value))
// A pair only renders when both halves are real readings; a lone scoped value
// would be an unlabelled number over an unrelated liquid level.
const dualReading = computed(() => hasPercentOverride.value
  && typeof props.scopedPercent === 'number'
  && Number.isFinite(props.scopedPercent)
  ? { scoped: props.scopedPercent as number, primary: props.percentOverride as number }
  : null)
const gridPresentation = computed(() => presentCompactQuotaGridCells(props.quotaGrid))
const gridRows = computed(() => gridPresentation.value.rows)
const gridMode = computed(() => gridRows.value.length > 0)
const gridLayout = computed(() => gridPresentation.value.layout)
const weekly = computed(() => codexWeeklyReading(props.primary, props.secondary))
const hasRingOverride = computed(() => typeof props.ringPercent === 'number' && Number.isFinite(props.ringPercent))
const weeklyPercent = computed(() => hasRingOverride.value ? props.ringPercent as number : weekly.value?.bucket.remainingPercent ?? 0)
const ringVisible = computed(() => props.ringVisible === false
  ? false
  : props.ringVisible === true || weekly.value !== null || hasRingOverride.value)
const cellIsStale = (cell: CompactQuotaGridCell) => cell.stale === true
const staleCells = computed(() => gridMode.value ? gridPresentation.value.cells.filter(cellIsStale) : [])
const showGlobalStale = computed(() => staleCells.value.length === 0 && props.quotaStale)
const activeWeeklySegments = computed(() => Math.ceil(weeklyPercent.value / 5))
const wavePath = 'M0 12 C12.5 0 37.5 0 50 12 S87.5 24 100 12 C112.5 0 137.5 0 150 12 S187.5 24 200 12 L200 24 L0 24 Z'
const percentTextIsBold = computed(() => props.appearance.inner.percentTextStyle === 'bold' || props.appearance.inner.percentTextStyle === 'bold-italic')
const percentTextIsItalic = computed(() => props.appearance.inner.percentTextStyle === 'italic' || props.appearance.inner.percentTextStyle === 'bold-italic')
const style = computed(() => ({
  ...codexWaterAppearanceCssVars(props.appearance, props.colors, liquidLevel.value, ringVisible.value ? weeklyPercent.value : liquidLevel.value),
  '--water-level': `${liquidLevel.value}%`,
  '--weekly-ring': String(weeklyPercent.value),
  '--water-percent-size': `${props.appearance.inner.percentSize}px`,
  '--water-percent-color': props.appearance.inner.percentColor,
  '--water-percent-font-weight': percentTextIsBold.value ? '700' : '400',
  '--water-percent-font-style': percentTextIsItalic.value ? 'italic' : 'normal'
}))
</script>

<template>
  <div
    class="codex-water-ball"
    :class="[`palette-${appearance.inner.palette}`, `ring-${appearance.outer.style}`, `motion-${appearance.inner.motion}`, `signal-${signal}`]"
    :style="style"
    :role="decorative ? undefined : 'img'"
    :aria-hidden="decorative ? 'true' : undefined"
    :aria-label="decorative ? undefined : label"
  >
    <div class="codex-water-ball__surface" aria-hidden="true" :data-operation-tooltip="partHints?.base">
      <i class="refraction refraction-a" />
      <i class="refraction refraction-b" />
      <div v-if="liquidLevel > 0" class="codex-water-ball__liquid" :data-operation-tooltip="partHints?.liquid">
        <i class="liquid-base" />
        <svg class="liquid-wave wave-a" viewBox="0 0 200 24" preserveAspectRatio="none"><path :d="wavePath" /></svg>
        <svg class="liquid-wave wave-b" viewBox="0 0 200 24" preserveAspectRatio="none"><path :d="wavePath" /></svg>
        <svg class="liquid-wave wave-c" viewBox="0 0 200 24" preserveAspectRatio="none"><path :d="wavePath" /></svg>
      </div>
      <i class="glass-highlight" />
    </div>

    <svg v-if="ringVisible" class="codex-water-ball__ring" viewBox="0 0 100 100" aria-hidden="true">
      <template v-if="appearance.outer.style === 'segmented'">
        <line
          v-for="index in 20"
          :key="index"
          class="segment"
          :class="{ active: index <= activeWeeklySegments }"
          :data-operation-tooltip="index <= activeWeeklySegments ? partHints?.ring : partHints?.track"
          x1="50"
          y1="5"
          x2="50"
          y2="11"
          :transform="`rotate(${(index - 1) * 18} 50 50)`"
        />
      </template>
      <template v-else>
        <circle class="track" cx="50" cy="50" r="45" :data-operation-tooltip="partHints?.track" />
        <circle class="value" cx="50" cy="50" r="45" :data-operation-tooltip="partHints?.ring" />
      </template>
    </svg>

    <div
      v-if="!primary || appearance.inner.showPercent"
      class="codex-water-ball__value"
      :data-operation-tooltip="partHints?.reading"
      :class="[`percent-${appearance.inner.percentPosition}`, { empty: !primary && !hasPercentOverride, 'has-grid': gridMode }]"
    >
      <div v-if="gridMode" class="codex-water-ball__grid" :class="`layout-${gridLayout}`" aria-hidden="true">
        <div
          v-for="row in gridRows"
          :key="row.id"
          class="codex-water-ball__grid-row"
          :class="[`row-${row.id}`, row.cells.length === 1 ? 'row-single' : 'row-pair']"
        >
          <div
            v-for="cell in row.cells"
            :key="cell.key"
            class="codex-water-ball__grid-cell"
            :class="[`kind-${cell.kind}`, `slot-${cell.key}`]"
            :data-operation-tooltip="partHints ? undefined : cell.label"
          >
            <span class="codex-water-ball__grid-label">{{ cell.label }}</span>
            <strong class="codex-water-ball__grid-value">{{ cell.text }}</strong>
            <small v-if="cell.stale" class="codex-water-ball__stale">旧</small>
          </div>
        </div>
      </div>
      <template v-else>
        <span v-if="primary?.family === 'spark' && !hasLiquidOverride" class="codex-water-ball__spark" aria-hidden="true">S</span>
        <strong v-if="dualReading" class="codex-water-ball__pair">
          <span>{{ formatCompanionPercent(dualReading.scoped) }}</span><i aria-hidden="true">/</i><span>{{ formatCompanionPercent(dualReading.primary) }}</span>
        </strong>
        <strong v-else>{{ centreText }}</strong>
        <em v-if="hasPercentOverride && percentProviderLabel" class="codex-water-ball__percent-source">{{ percentProviderLabel }}</em>
      </template>
      <small v-if="showGlobalStale" class="codex-water-ball__stale codex-water-ball__stale--global">旧</small>
    </div>
  </div>
</template>

<style scoped>
.codex-water-ball {
  --signal-a: var(--water-fill-color-a);
  --signal-b: var(--water-fill-color-b);
  position: relative;
  width: var(--water-size, 94px);
  height: var(--water-size, 94px);
  border-radius: 50%;
  background: transparent;
  color: #f7fbff;
  isolation: isolate;
  overflow: hidden;
}
.codex-water-ball.signal-ongoing { --signal-a: #28d7ff; --signal-b: #7357ff; }
.codex-water-ball.signal-completed-unread { --signal-a: #ff4fd8; --signal-b: #ffb02e; }
.codex-water-ball.signal-completed { --signal-a: #42e695; --signal-b: #27c8ff; }

.codex-water-ball__surface {
  position: absolute;
  z-index: 1;
  inset: 0;
  overflow: hidden;
  border: 0;
  border-radius: 50%;
  box-shadow: inset 0 -14px 24px rgba(2, 11, 21, calc(var(--water-base-opacity) * .32));
}
.codex-water-ball__surface::before {
  position: absolute;
  z-index: 0;
  inset: 0;
  border-radius: inherit;
  background:
    radial-gradient(circle at 34% 22%, rgba(255,255,255,.34), transparent 22%),
    radial-gradient(circle at 68% 74%, color-mix(in srgb, var(--signal-b) 36%, transparent), transparent 48%),
    color-mix(in srgb, var(--water-base) 92%, #071927);
  opacity: var(--water-base-opacity);
  content: '';
}
.codex-water-ball.palette-aurora .codex-water-ball__surface::before {
  background:
    radial-gradient(circle at 30% 18%, color-mix(in srgb, #fff 40%, transparent), transparent 20%),
    radial-gradient(circle at 82% 28%, color-mix(in srgb, var(--water-aurora-accent) 58%, transparent), transparent 37%),
    radial-gradient(circle at 42% 84%, color-mix(in srgb, var(--water-aurora-glow) 42%, transparent), transparent 46%),
    color-mix(in srgb, var(--water-base) 88%, #071927);
}

.refraction,
.glass-highlight {
  position: absolute;
  z-index: 4;
  pointer-events: none;
}
.refraction {
  width: 46px;
  height: 19px;
  border: 1px solid rgba(255,255,255,.38);
  border-radius: 50%;
  filter: blur(.2px);
  transform: rotate(-24deg);
}
.refraction-a { top: 15px; left: 8px; }
.refraction-b { right: 3px; bottom: 17px; opacity: .48; transform: rotate(-33deg) scale(.7); }
.glass-highlight {
  inset: 5px 9px 47px 13px;
  border-top: 3px solid rgba(255,255,255,.65);
  border-radius: 50%;
  filter: blur(.5px);
}

.codex-water-ball__ring {
  position: absolute;
  z-index: 5;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}
.codex-water-ball.ring-segmented .codex-water-ball__ring { transform: none; }
.codex-water-ball__ring circle { fill: none; stroke-width: var(--ring-width); }
.codex-water-ball__ring .track { stroke: color-mix(in srgb, var(--ring-track) 78%, #fff); }
.codex-water-ball__ring .value {
  stroke: var(--ring-progress);
  stroke-dasharray: 282.75;
  stroke-dashoffset: calc(282.75 - 2.8275 * var(--weekly-ring));
  stroke-linecap: round;
  filter: var(--ring-glow);
  transition: stroke-dashoffset 280ms ease-out;
}
.codex-water-ball__ring .segment {
  stroke: color-mix(in srgb, var(--ring-track) 78%, #fff);
  stroke-width: var(--ring-width);
  stroke-linecap: round;
  transition: stroke 280ms ease-out;
}
.codex-water-ball__ring .segment.active { stroke: var(--ring-progress); filter: var(--ring-glow); }

.codex-water-ball__liquid {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: calc(var(--water-level) + var(--water-amplitude));
  opacity: clamp(.74, var(--water-opacity), .96);
  transition: height 280ms ease-out;
}
.liquid-base {
  position: absolute;
  inset: var(--water-amplitude) 0 0;
  background:
    radial-gradient(circle at 24% 34%, rgba(255,255,255,.28), transparent 22%),
    linear-gradient(135deg, var(--signal-a), var(--signal-b) 58%, var(--water-fill-color-b));
}
.palette-solid .liquid-base { background: var(--signal-a); }
.palette-solid .wave-b { color: var(--signal-a); opacity: .58; }
.palette-aurora .liquid-base {
  background:
    radial-gradient(circle at 18% 24%, color-mix(in srgb, #fff 36%, transparent), transparent 22%),
    radial-gradient(circle at 77% 28%, color-mix(in srgb, var(--water-aurora-accent) 78%, transparent), transparent 38%),
    radial-gradient(circle at 42% 92%, color-mix(in srgb, var(--water-aurora-glow) 68%, transparent), transparent 48%),
    linear-gradient(122deg, var(--signal-a) 0%, var(--water-aurora-glow) 31%, var(--water-aurora-accent) 57%, var(--signal-b) 79%, var(--signal-a) 100%);
}
.liquid-wave {
  position: absolute;
  top: 0;
  left: 0;
  width: 200%;
  height: calc(var(--water-amplitude) * 2.15);
  overflow: visible;
  color: var(--signal-a);
  opacity: .92;
  will-change: transform;
}
.liquid-wave path { fill: currentColor; }
.wave-a { animation: codex-water-wave-left var(--water-wave-a-duration) linear var(--water-wave-a-delay) infinite; }
.wave-b {
  color: var(--signal-b);
  opacity: .66;
  animation: codex-water-wave-right var(--water-wave-b-duration) linear var(--water-wave-b-delay) infinite;
}
.wave-c {
  top: 3px;
  color: #fff;
  opacity: .24;
  transform: scaleY(.62);
  animation: codex-water-wave-left calc(var(--water-wave-a-duration) * .72) linear -1.8s infinite;
}
.palette-aurora .wave-a { color: var(--water-aurora-accent); opacity: .96; }
.palette-aurora .wave-b { color: var(--signal-b); opacity: .72; }
.palette-aurora .wave-c { color: var(--water-aurora-glow); opacity: .42; mix-blend-mode: screen; }

.codex-water-ball__value {
  position: absolute;
  z-index: 7;
  top: 50%;
  left: 50%;
  display: grid;
  min-width: 64px;
  max-width: 100%;
  min-height: 48px;
  place-content: center;
  justify-items: center;
  border: 0;
  background: transparent;
  box-shadow: none;
  color: var(--water-percent-color, #fff);
  text-shadow: 0 1px 3px rgba(0,0,0,.9);
  transform: translate(-50%, -50%);
}
.codex-water-ball__value.has-grid {
  /* Fill the ball and centre the grid box itself — translate+min-height made
     multi-row Magpie grids look pinned above the visual midpoint. */
  inset: 0;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  max-width: none;
  display: flex;
  align-items: center;
  justify-content: center;
  /* Sphere highlight sits high; a tiny optical nudge keeps the block from
     reading as top-pinned even when the box is geometrically centred. */
  transform: translateY(4%);
}
.codex-water-ball__value strong {
  font-size: var(--water-percent-size, 22px);
  font-style: var(--water-percent-font-style, normal);
  font-weight: var(--water-percent-font-weight, 700);
  line-height: 1;
  letter-spacing: -.04em;
  white-space: nowrap;
  /* Lining tabular figures: the reading refreshes in place, and proportional
     digits would shift the whole centre sideways on every new sample. */
  font-variant-numeric: tabular-nums lining-nums;
  font-feature-settings: 'tnum' 1, 'lnum' 1;
}
.codex-water-ball__value strong.codex-water-ball__pair {
  display: flex;
  align-items: baseline;
  /*
   * Two readings share the space one used to have, so the pair spends a
   * fraction of the configured size — and is additionally capped against the
   * ball itself. `percentSize` goes up to 32px, where an unbounded pair would
   * push `100/100` straight through the ring; the cap keeps the worst case
   * inside the glass while a user who shrank the reading still gets the
   * smaller one they asked for.
   */
  font-size: min(calc(var(--water-percent-size, 22px) * .7), calc(var(--water-size, 94px) * .165));
  /* Tabular figures already carry their own sidebearings; the display tracking
     that suits a lone `77%` closes a pair up into one long number. */
  letter-spacing: -.01em;
}
.codex-water-ball__value strong.codex-water-ball__pair i {
  margin: 0 .08em;
  font-size: .72em;
  font-style: normal;
  font-weight: 600;
  opacity: .82;
  transform: translateY(-.04em);
}
.codex-water-ball__value.percent-center,
.codex-water-ball__value.percent-auto { top: 50%; right: auto; bottom: auto; left: 50%; transform: translate(-50%, -50%); }
.codex-water-ball__value.percent-bottom-left { top: auto; right: auto; bottom: 20%; left: 20%; transform: none; }
.codex-water-ball__value.percent-bottom-right {
  top: auto; right: 16%; bottom: 20%;
  left: auto;
  transform: none;
}
.codex-water-ball__value.has-grid.percent-center,
.codex-water-ball__value.has-grid.percent-auto,
.codex-water-ball__value.has-grid.percent-bottom-left,
.codex-water-ball__value.has-grid.percent-bottom-right {
  inset: 0;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: translateY(4%);
}
.codex-water-ball__spark {
  margin-bottom: 3px;
  padding: 1px 5px;
  border: 1px solid color-mix(in srgb, #fff 72%, var(--signal-a));
  border-radius: 999px;
  background: color-mix(in srgb, var(--signal-a) 62%, rgba(3, 13, 24, .88));
  color: #fff;
  font-size: 9px;
  font-weight: 900;
  line-height: 1.25;
  letter-spacing: .08em;
}
.codex-water-ball__percent-source {
  display: block;
  margin-top: 1px;
  font-size: 8px;
  font-style: normal;
  line-height: 1;
  letter-spacing: .04em;
  text-transform: uppercase;
  opacity: .72;
  color: var(--water-percent-color, inherit);
}
.codex-water-ball__value.empty { width: 64px; padding: 0 7px; text-align: center; }
.codex-water-ball__value.empty strong { font-size: 11px; line-height: 1.15; letter-spacing: 0; }

.codex-water-ball__grid {
  display: grid;
  gap: 2px 4px;
  /* Scales with the same reading-size control as the centre percent. */
  width: min(calc(var(--water-size, 94px) * .82), calc(var(--water-percent-size, 22px) * 3.45));
  min-height: 0;
  height: auto;
  place-content: center;
  justify-items: center;
  align-content: center;
  margin: 0 auto;
}
.codex-water-ball__grid.layout-one {
  width: min(calc(var(--water-size, 94px) * .5), calc(var(--water-percent-size, 22px) * 2.25));
  min-height: 0;
}
.codex-water-ball__grid.layout-top-only,
.codex-water-ball__grid.layout-bottom-only {
  width: min(calc(var(--water-size, 94px) * .74), calc(var(--water-percent-size, 22px) * 3));
  min-height: 0;
}
.codex-water-ball__grid.layout-rows {
  width: min(calc(var(--water-size, 94px) * .82), calc(var(--water-percent-size, 22px) * 3.45));
  min-height: 0;
}
.codex-water-ball__grid-row {
  display: grid;
  gap: 2px 4px;
  align-items: center;
  justify-items: center;
  min-width: 0;
}
.codex-water-ball__grid-row.row-pair {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.codex-water-ball__grid-row.row-single {
  grid-template-columns: minmax(0, 1fr);
  justify-items: center;
}
.codex-water-ball__value .codex-water-ball__grid.layout-one .codex-water-ball__grid-value {
  font-size: min(calc(var(--water-percent-size, 22px) * .78), calc(var(--water-size, 94px) * .2));
}
.codex-water-ball__grid-cell {
  display: grid;
  gap: 0;
  justify-items: center;
  align-content: center;
  min-width: 0;
  min-height: calc(var(--water-percent-size, 22px) * .7);
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}
.codex-water-ball__grid-label {
  color: #F7F4EA;
  font-size: max(7px, calc(var(--water-percent-size, 22px) * .3));
  font-weight: 700;
  line-height: 1;
  letter-spacing: .02em;
  text-transform: none;
  opacity: .62;
}
/* Outrank `.codex-water-ball__value strong`, or 2x2 cells inherit the centre
   percent size and smash into each other (Token / Grok / Cursor). */
.codex-water-ball__value strong.codex-water-ball__grid-value {
  color: #F7F4EA;
  font-size: min(calc(var(--water-percent-size, 22px) * .66), calc(var(--water-size, 94px) * .17));
  font-weight: var(--water-percent-font-weight, 700);
  font-style: var(--water-percent-font-style, normal);
  line-height: 1.05;
  letter-spacing: -.02em;
  white-space: nowrap;
  font-variant-numeric: tabular-nums lining-nums;
  font-feature-settings: 'tnum' 1, 'lnum' 1;
}
.codex-water-ball__grid-cell.kind-placeholder .codex-water-ball__grid-value {
  opacity: .42;
}
.codex-water-ball__grid-cell.kind-missing .codex-water-ball__grid-value {
  opacity: .58;
}
.codex-water-ball__stale {
  margin-left: 2px;
  color: inherit;
  font-size: .58em;
  font-weight: 700;
  line-height: 1;
  opacity: .78;
}
.codex-water-ball__stale--global {
  position: absolute;
  top: -0.35em;
  right: -0.55em;
}

@keyframes codex-water-wave-left {
  from { transform: translate3d(0, 0, 0); }
  to { transform: translate3d(-50%, 0, 0); }
}
@keyframes codex-water-wave-right {
  from { transform: translate3d(-50%, 0, 0); }
  to { transform: translate3d(0, 0, 0); }
}
.codex-water-ball.motion-static .liquid-wave { animation: none; will-change: auto; }
.codex-water-ball.motion-static .wave-a { transform: translate3d(-12.5%, 0, 0); }
.codex-water-ball.motion-static .wave-b { transform: translate3d(-37.5%, 0, 0); }
.codex-water-ball.motion-static .wave-c { transform: translate3d(-22%, 0, 0) scaleY(.62); }

@media (prefers-reduced-motion: reduce) {
  .liquid-wave { animation: none !important; will-change: auto; }
  .wave-a { transform: translate3d(-12.5%, 0, 0) !important; }
  .wave-b { transform: translate3d(-37.5%, 0, 0) !important; }
  .wave-c { transform: translate3d(-22%, 0, 0) scaleY(.62) !important; }
  .codex-water-ball__liquid { transition: none !important; }
}
</style>
