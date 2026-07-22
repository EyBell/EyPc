import type { CodexColorSettings, CodexDisplayStyle, CodexWaterAppearanceSettings } from './codex'

export interface CodexThemePreset {
  id: 'sea-salt' | 'graphite' | 'indigo-sand' | 'aurora-night' | 'amber-mist'
  label: string
  description: string
  colors: CodexColorSettings
  waterAppearance: CodexWaterAppearanceSettings
}

export interface CodexSurfaceTheme {
  style: CodexDisplayStyle
  surface: string
  surfaceRaised: string
  foreground: string
  secondary: string
  border: string
  focus: string
  accent: string
  liquid: string
  liquidCrest: string
  warning: string
  critical: string
  running: string
  pending: string
  onAccent: string
  onRunning: string
  onPending: string
}

export interface CodexColorValidation {
  valid: boolean
  message: string
}

export interface HslColor {
  h: number
  s: number
  l: number
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i

export const CODEX_THEME_PRESETS: readonly CodexThemePreset[] = [
  {
    id: 'sea-salt',
    label: '海盐',
    description: '深海与纸白，Teal 信号',
    colors: { healthy: '#23B5A5', warning: '#F2A93B', critical: '#EF5B68', water: '#102C3C', card: '#F7F9F7', cardForeground: '#07161D' },
    waterAppearance: {
      inner: { palette: 'gradient', colorA: '#102C3C', colorB: '#175C61', opacity: 78, amplitude: 8, motion: 'normal' },
      outer: { style: 'solid', thickness: 4, colorMode: 'quota', progressColor: '#23B5A5', trackColor: '#7C8B94', glow: 'soft', shellOpacity: 72 }
    }
  },
  {
    id: 'graphite',
    label: '石墨',
    description: '石墨与雾白，Blue 信号',
    colors: { healthy: '#256FB5', warning: '#A66100', critical: '#BF3C50', water: '#18212B', card: '#F2F4F3', cardForeground: '#07161D' },
    waterAppearance: {
      inner: { palette: 'solid', colorA: '#18212B', colorB: '#174D68', opacity: 82, amplitude: 6, motion: 'slow' },
      outer: { style: 'segmented', thickness: 4, colorMode: 'quota', progressColor: '#4A9BE8', trackColor: '#73899D', glow: 'off', shellOpacity: 68 }
    }
  },
  {
    id: 'indigo-sand',
    label: '靛砂',
    description: '靛蓝与暖白，Indigo 信号',
    colors: { healthy: '#4E60C8', warning: '#9B6100', critical: '#B63D59', water: '#1D2444', card: '#FAF7F0', cardForeground: '#07161D' },
    waterAppearance: {
      inner: { palette: 'aurora', colorA: '#1D2444', colorB: '#343C77', opacity: 76, amplitude: 9, motion: 'normal' },
      outer: { style: 'solid', thickness: 5, colorMode: 'custom', progressColor: '#7987F2', trackColor: '#7E829E', glow: 'strong', shellOpacity: 74 }
    }
  },
  {
    id: 'aurora-night',
    label: '极光夜',
    description: '蓝绿电离层，冷峻深水',
    colors: { healthy: '#46A8E9', warning: '#D48A26', critical: '#CF4566', water: '#111B34', card: '#0D1630', cardForeground: '#EEF4FF' },
    waterAppearance: {
      inner: { palette: 'aurora', colorA: '#111B34', colorB: '#3A4DAA', opacity: 84, amplitude: 10, motion: 'fast' },
      outer: { style: 'segmented', thickness: 5, colorMode: 'quota', progressColor: '#46A8E9', trackColor: '#4A5872', glow: 'soft', shellOpacity: 70 }
    }
  },
  {
    id: 'amber-mist',
    label: '琥珀雾',
    description: '暖金渐变，低亮度可读',
    colors: { healthy: '#D88A26', warning: '#E1B84A', critical: '#C64A47', water: '#201A12', card: '#FAF3E8', cardForeground: '#24180E' },
    waterAppearance: {
      inner: { palette: 'gradient', colorA: '#201A12', colorB: '#4A3114', opacity: 78, amplitude: 8, motion: 'normal' },
      outer: { style: 'solid', thickness: 4, colorMode: 'custom', progressColor: '#F1BE58', trackColor: '#7F6754', glow: 'strong', shellOpacity: 72 }
    }
  }
] as const

function channels(value: string): [number, number, number] {
  const normalized = normalizeHex(value) || '#000000'
  return [1, 3, 5].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16)) as [number, number, number]
}

function hexChannel(value: number): string {
  return Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, '0').toUpperCase()
}

export function normalizeHex(value: unknown): string | null {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value.toUpperCase() : null
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum))
}

export function hexToHsl(value: string): HslColor | null {
  const normalized = normalizeHex(value)
  if (!normalized) return null
  const [red, green, blue] = channels(normalized).map((channel) => channel / 255)
  const maximum = Math.max(red, green, blue)
  const minimum = Math.min(red, green, blue)
  const delta = maximum - minimum
  const lightness = (maximum + minimum) / 2
  let hue = 0
  if (delta > 0) {
    if (maximum === red) hue = ((green - blue) / delta) % 6
    else if (maximum === green) hue = (blue - red) / delta + 2
    else hue = (red - green) / delta + 4
    hue *= 60
    if (hue < 0) hue += 360
  }
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1))
  return { h: hue, s: saturation * 100, l: lightness * 100 }
}

export function hslToHex(value: HslColor): string {
  const hue = ((value.h % 360) + 360) % 360
  const saturation = clamp(value.s, 0, 100) / 100
  const lightness = clamp(value.l, 0, 100) / 100
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const section = hue / 60
  const second = chroma * (1 - Math.abs(section % 2 - 1))
  const [red, green, blue] = section < 1 ? [chroma, second, 0]
    : section < 2 ? [second, chroma, 0]
      : section < 3 ? [0, chroma, second]
        : section < 4 ? [0, second, chroma]
          : section < 5 ? [second, 0, chroma]
            : [chroma, 0, second]
  const offset = lightness - chroma / 2
  return `#${[red, green, blue].map((channel) => hexChannel((channel + offset) * 255)).join('')}`
}

export function nearestContrastHsl(value: HslColor, fixedColor: string, minimum = 4.5): HslColor {
  const fixed = normalizeHex(fixedColor)
  const current = {
    h: ((value.h % 360) + 360) % 360,
    s: clamp(value.s, 0, 100),
    l: clamp(value.l, 0, 100)
  }
  if (!fixed || contrastRatio(hslToHex(current), fixed) >= minimum) return current

  let best: HslColor | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  let bestContrast = 0
  for (let step = 0; step <= 1000; step += 1) {
    const lightness = step / 10
    const candidate = { ...current, l: lightness }
    const ratio = contrastRatio(hslToHex(candidate), fixed)
    if (ratio < minimum) continue
    const distance = Math.abs(lightness - current.l)
    if (distance < bestDistance || (distance === bestDistance && ratio > bestContrast)) {
      best = candidate
      bestDistance = distance
      bestContrast = ratio
    }
  }
  return best || { ...current, l: contrastRatio('#000000', fixed) >= contrastRatio('#FFFFFF', fixed) ? 0 : 100 }
}

export function isHslContrastSafe(value: HslColor, fixedColor: string, minimum = 4.5): boolean {
  return normalizeHex(fixedColor) !== null && contrastRatio(hslToHex(value), fixedColor) >= minimum
}

export function mixHex(from: string, to: string, amount: number): string {
  const start = channels(from)
  const end = channels(to)
  const ratio = Math.max(0, Math.min(1, amount))
  return `#${start.map((value, index) => hexChannel(value + (end[index] - value) * ratio)).join('')}`
}

export function relativeLuminance(value: string): number {
  const linear = channels(value).map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  })
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
}

export function contrastRatio(first: string, second: string): number {
  const light = Math.max(relativeLuminance(first), relativeLuminance(second))
  const dark = Math.min(relativeLuminance(first), relativeLuminance(second))
  return (light + 0.05) / (dark + 0.05)
}

export function readableForeground(surface: string): string {
  const ink = '#07161D'
  const paper = '#F8FCFB'
  return contrastRatio(surface, ink) >= contrastRatio(surface, paper) ? ink : paper
}

function strictForeground(surface: string): string {
  return contrastRatio(surface, '#000000') >= contrastRatio(surface, '#FFFFFF') ? '#000000' : '#FFFFFF'
}

function readableTone(surface: string, foreground: string, minimum: number): string {
  let low = 0
  let high = 1
  for (let index = 0; index < 18; index += 1) {
    const middle = (low + high) / 2
    if (contrastRatio(surface, mixHex(surface, foreground, middle)) >= minimum) high = middle
    else low = middle
  }
  return mixHex(surface, foreground, Math.min(1, high + 0.035))
}

function ensureContrast(candidate: string, surface: string, minimum: number, direction: string): string {
  const normalized = normalizeHex(candidate) || direction
  if (contrastRatio(normalized, surface) >= minimum) return normalized
  let low = 0
  let high = 1
  for (let index = 0; index < 18; index += 1) {
    const middle = (low + high) / 2
    if (contrastRatio(mixHex(normalized, direction, middle), surface) >= minimum) high = middle
    else low = middle
  }
  return mixHex(normalized, direction, Math.min(1, high + 0.02))
}

export function quotaStatusColor(percent: number, colors: CodexColorSettings): string {
  if (percent <= 20) return colors.critical
  if (percent <= 50) return colors.warning
  return colors.healthy
}

export function resolveCodexSurfaceTheme(style: CodexDisplayStyle, colors: CodexColorSettings, percent = 100): CodexSurfaceTheme {
  const surface = normalizeHex(style === 'water' ? colors.water : colors.card) || (style === 'water' ? '#102C3C' : '#F7F9F7')
  const foreground = style === 'card'
    ? normalizeHex(colors.cardForeground) || readableForeground(surface)
    : readableForeground(surface)
  const direction = foreground
  const accent = ensureContrast(quotaStatusColor(percent, colors), surface, 3, direction)
  const warning = ensureContrast(colors.warning, surface, 3, direction)
  const critical = ensureContrast(colors.critical, surface, 3, direction)
  const running = ensureContrast('#2F7CC0', surface, 3, direction)
  const pending = ensureContrast('#C6631A', surface, 3, direction)
  const liquid = ensureContrast(mixHex(surface, accent, 0.56), foreground, 4.5, surface)
  const liquidCrest = ensureContrast(mixHex(surface, accent, 0.68), foreground, 4.5, surface)
  return {
    style,
    surface,
    surfaceRaised: mixHex(surface, foreground, style === 'water' ? 0.06 : 0.025),
    foreground,
    secondary: readableTone(surface, foreground, 4.5),
    border: readableTone(surface, foreground, 3),
    focus: ensureContrast(accent, surface, 3, direction),
    accent,
    liquid,
    liquidCrest,
    warning,
    critical,
    running,
    pending,
    onAccent: strictForeground(accent),
    onRunning: strictForeground(running),
    onPending: strictForeground(pending)
  }
}

export function validateCodexCustomColors(colors: CodexColorSettings): CodexColorValidation {
  const entries = Object.entries(colors)
  if (entries.some(([, value]) => normalizeHex(value) === null)) return { valid: false, message: '请使用完整的 6 位十六进制颜色' }
  if (relativeLuminance(colors.water) > 0.24) return { valid: false, message: '水球表面需保持深色，以确保桌面可读性' }
  if (contrastRatio(colors.card, colors.cardForeground) < 4.5) return { valid: false, message: '卡片表面与文字/图标前景色需达到 4.5:1' }

  for (const style of ['water', 'card'] as const) {
    const theme = resolveCodexSurfaceTheme(style, colors)
    if (contrastRatio(theme.foreground, theme.surface) < 4.5 || contrastRatio(theme.secondary, theme.surface) < 4.5) {
      return { valid: false, message: '文字与表面对比度不足 4.5:1' }
    }
    if (contrastRatio(theme.border, theme.surface) < 3 || contrastRatio(theme.focus, theme.surface) < 3) {
      return { valid: false, message: '边界或焦点对比度不足 3:1' }
    }
  }
  return { valid: true, message: '' }
}

export function validateCodexWaterAppearance(colors: CodexColorSettings, appearance: CodexWaterAppearanceSettings): CodexColorValidation {
  const values = [appearance.inner.colorA, appearance.inner.colorB]
  if (values.some((value) => normalizeHex(value) === null)) return { valid: false, message: '水球颜色需使用完整的 6 位十六进制值' }
  if (appearance.inner.opacity < 40 || appearance.inner.opacity > 95) return { valid: false, message: '水纹透明度需在 40%–95% 之间' }
  if (appearance.inner.amplitude < 4 || appearance.inner.amplitude > 12) return { valid: false, message: '水纹振幅需在 4–12px 之间' }
  if (appearance.outer.shellOpacity < 25 || appearance.outer.shellOpacity > 95) return { valid: false, message: '外层轮廓透明度需在 25%–95% 之间' }
  const surface = colors.water
  const foreground = readableForeground(surface)
  for (const liquid of [appearance.inner.colorA, appearance.inner.colorB]) {
    if (contrastRatio(foreground, liquid) < 4.5) return { valid: false, message: '水纹最亮颜色与必要文字的对比度不足 4.5:1' }
  }
  return { valid: true, message: '' }
}

export function matchCodexThemePreset(colors: CodexColorSettings, appearance?: CodexWaterAppearanceSettings): CodexThemePreset['id'] | null {
  const signature = JSON.stringify(Object.fromEntries(Object.entries(colors).map(([key, value]) => [key, normalizeHex(value)])))
  return CODEX_THEME_PRESETS.find((preset) => JSON.stringify(preset.colors) === signature && (!appearance || JSON.stringify(preset.waterAppearance) === JSON.stringify(appearance)))?.id || null
}


/** Extra quota arguments are accepted for one-release call-site compatibility; the removed outer ring no longer consumes them. */
export function codexWaterAppearanceCssVars(
  appearance: CodexWaterAppearanceSettings,
  colors: CodexColorSettings,
  _percent?: number,
  _weeklyPercent?: number
): Record<string, string> {
  const durations = {
    static: ['0s', '0s'],
    slow: ['10s', '12s'],
    normal: ['6.4s', '7.8s'],
    fast: ['4.8s', '5.8s']
  } as const
  const [durationA, durationB] = durations[appearance.inner.motion]
  const fill = appearance.inner.palette === 'solid'
    ? appearance.inner.colorA
    : appearance.inner.palette === 'aurora'
      ? `linear-gradient(115deg, ${appearance.inner.colorA} 0%, ${appearance.inner.colorB} 52%, ${mixHex(appearance.inner.colorB, colors.healthy, 0.28)} 100%)`
      : `linear-gradient(135deg, ${appearance.inner.colorA}, ${appearance.inner.colorB})`
  return {
    '--water-fill': fill,
    '--water-fill-a': appearance.inner.colorA,
    '--water-fill-b': appearance.inner.colorB,
    '--water-opacity': String(appearance.inner.opacity / 100),
    '--water-shell-opacity': String(Math.max(0.25, Math.min(0.95, appearance.outer.shellOpacity / 100))),
    '--water-amplitude': `${appearance.inner.amplitude}px`,
    '--water-wave-a-duration': durationA,
    '--water-wave-b-duration': durationB,
    '--water-wave-a-delay': appearance.inner.motion === 'static' ? '0s' : `-${Number.parseFloat(durationA) * 0.18}s`,
    '--water-wave-b-delay': appearance.inner.motion === 'static' ? '0s' : `-${Number.parseFloat(durationB) * 0.57}s`
  }
}

export function codexThemeCssVars(theme: CodexSurfaceTheme): Record<string, string> {
  return {
    '--codex-surface': theme.surface,
    '--codex-surface-raised': theme.surfaceRaised,
    '--codex-fg': theme.foreground,
    '--codex-muted': theme.secondary,
    '--codex-border': theme.border,
    '--codex-focus': theme.focus,
    '--codex-accent': theme.accent,
    '--codex-liquid': theme.liquid,
    '--codex-liquid-crest': theme.liquidCrest,
    '--codex-warning': theme.warning,
    '--codex-critical': theme.critical,
    '--codex-running': theme.running,
    '--codex-pending': theme.pending,
    '--codex-on-accent': theme.onAccent,
    '--codex-on-running': theme.onRunning,
    '--codex-on-pending': theme.onPending
  }
}
