<script setup lang="ts">
import { computed } from 'vue'
import type { CodexColorSettings, CodexWaterAppearanceSettings } from '../domain/codex'
import { codexWaterAppearanceCssVars } from '../domain/codexAppearance'
import type { CodexQuotaReading } from '../domain/codexPresentation'

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
}>(), {
  taskCount: 0,
  signal: 'quiet',
  decorative: false
})

const percent = computed(() => props.primary?.bucket.remainingPercent ?? 0)
const weekly = computed(() => props.primary?.kind === 'weekly' ? props.primary : props.secondary?.kind === 'weekly' ? props.secondary : null)
const weeklyPercent = computed(() => weekly.value?.bucket.remainingPercent ?? 0)
const activeWeeklySegments = computed(() => Math.ceil(weeklyPercent.value / 5))
const wavePath = 'M0 12 C12.5 0 37.5 0 50 12 S87.5 24 100 12 C112.5 0 137.5 0 150 12 S187.5 24 200 12 L200 24 L0 24 Z'
const style = computed(() => ({
  ...codexWaterAppearanceCssVars(props.appearance, props.colors, percent.value, weekly.value ? weeklyPercent.value : percent.value),
  '--water-level': `${percent.value}%`,
  '--weekly-ring': String(weeklyPercent.value)
}))
</script>

<template>
  <div
    class="codex-water-ball"
    :class="[`palette-${appearance.inner.palette}`, `ring-${appearance.outer.style}`, `motion-${appearance.inner.motion}`, `signal-${signal}`, { 'has-weekly': weekly }]"
    :style="style"
    :role="decorative ? undefined : 'img'"
    :aria-hidden="decorative ? 'true' : undefined"
    :aria-label="decorative ? undefined : label"
  >
    <div class="codex-water-ball__surface" aria-hidden="true">
      <i class="refraction refraction-a" />
      <i class="refraction refraction-b" />
      <div v-if="primary && percent > 0" class="codex-water-ball__liquid">
        <i class="liquid-base" />
        <svg class="liquid-wave wave-a" viewBox="0 0 200 24" preserveAspectRatio="none"><path :d="wavePath" /></svg>
        <svg class="liquid-wave wave-b" viewBox="0 0 200 24" preserveAspectRatio="none"><path :d="wavePath" /></svg>
        <svg class="liquid-wave wave-c" viewBox="0 0 200 24" preserveAspectRatio="none"><path :d="wavePath" /></svg>
      </div>
      <i class="glass-highlight" />
    </div>

    <svg v-if="weekly" class="codex-water-ball__ring" viewBox="0 0 100 100" aria-hidden="true">
      <template v-if="appearance.outer.style === 'segmented'">
        <line
          v-for="index in 20"
          :key="index"
          class="segment"
          :class="{ active: weekly && index <= activeWeeklySegments }"
          x1="50"
          y1="5"
          x2="50"
          y2="11"
          :transform="`rotate(${(index - 1) * 18} 50 50)`"
        />
      </template>
      <template v-else>
        <circle class="track" cx="50" cy="50" r="45" />
        <circle v-if="weekly" class="value" cx="50" cy="50" r="45" />
      </template>
    </svg>

    <div class="codex-water-ball__value" :class="{ empty: !primary }">
      <span v-if="primary?.family === 'spark'" class="codex-water-ball__spark" aria-hidden="true">S</span>
      <strong>{{ primary ? `${primary.bucket.remainingPercent}%` : stateLabel }}</strong>
    </div>
  </div>
</template>

<style scoped>
.codex-water-ball {
  --signal-a: var(--water-fill-a);
  --signal-b: var(--water-fill-b);
  position: relative;
  width: var(--water-size, 94px);
  height: var(--water-size, 94px);
  border-radius: 50%;
  background: transparent;
  color: #f7fbff;
  isolation: isolate;
}
.codex-water-ball.signal-ongoing { --signal-a: #28d7ff; --signal-b: #7357ff; }
.codex-water-ball.signal-completed-unread { --signal-a: #ff4fd8; --signal-b: #ffb02e; }
.codex-water-ball.signal-completed { --signal-a: #42e695; --signal-b: #27c8ff; }

.codex-water-ball__surface {
  position: absolute;
  z-index: 1;
  inset: 2px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, #fff 58%, var(--signal-a));
  border-radius: 50%;
  background:
    radial-gradient(circle at 34% 22%, rgba(255,255,255,.34), transparent 22%),
    radial-gradient(circle at 68% 74%, color-mix(in srgb, var(--signal-b) 36%, transparent), transparent 48%),
    color-mix(in srgb, var(--codex-surface) 92%, #071927);
  box-shadow:
    0 10px 26px rgba(2, 12, 23, .48),
    0 0 17px color-mix(in srgb, var(--signal-a) 38%, transparent),
    inset 0 0 0 1px rgba(255,255,255,.16),
    inset 0 -14px 24px rgba(2, 11, 21, .32);
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
    linear-gradient(135deg, var(--signal-a), var(--signal-b) 58%, var(--water-fill-b));
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

.codex-water-ball__value {
  position: absolute;
  z-index: 7;
  top: 50%;
  left: 50%;
  display: grid;
  width: 64px;
  min-height: 48px;
  place-content: center;
  justify-items: center;
  border: 0;
  background: transparent;
  box-shadow: none;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0,0,0,.9);
  transform: translate(-50%, -50%);
}
.codex-water-ball__value strong { font-size: 22px; line-height: 1; letter-spacing: -.04em; }
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
.codex-water-ball__value.empty { width: 64px; padding: 0 7px; text-align: center; }
.codex-water-ball__value.empty strong { font-size: 11px; line-height: 1.15; letter-spacing: 0; }

.codex-water-ball__badge {
  position: absolute;
  z-index: 9;
  top: 1px;
  right: 3px;
  display: grid;
  min-width: 22px;
  height: 22px;
  padding: 0 5px;
  place-items: center;
  border: 2px solid color-mix(in srgb, var(--codex-surface) 90%, #fff);
  border-radius: 12px;
  background: linear-gradient(135deg, #ffb020, #ff6b00);
  color: #171006;
  font-size: 10px;
  font-weight: 950;
  box-shadow: 0 3px 9px rgba(0,0,0,.4);
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
  .codex-water-ball__liquid,
  .codex-water-ball__ring .value,
  .codex-water-ball__ring .segment { transition: none !important; }
}
</style>
