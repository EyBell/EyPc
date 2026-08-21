import type { CodexColorSettings, CodexDisplayStyle, CodexExpandedCardAppearanceSettings, CodexWaterAppearanceSettings } from './codex'

export interface CodexThemePreset {
  id:
    | 'sea-salt'
    | 'graphite'
    | 'indigo-sand'
    | 'aurora-night'
    | 'amber-mist'
    | 'neon-tide'
    | 'crimson-flare'
    | 'jade-pulse'
    | 'violet-bolt'
    | 'solar-crown'
    | 'ice-prism'
    | 'rose-crystal'
  label: string
  description: string
  colors: CodexColorSettings
  waterAppearance: CodexWaterAppearanceSettings
  expandedCardAppearance: CodexExpandedCardAppearanceSettings
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
  /** Percentage tone for Codex quota windows in the expanded card. */
  quotaCodex: string
  /** Percentage tone for Claude quota windows in the expanded card. */
  quotaClaude: string
  /**
   * Cursor ownership tone. Always algorithm-derived (no persisted picker):
   * the 255° rotation sits 105° from both the Codex (0°) and Claude (150°)
   * rotations, the maximal three-way separation on the shared theme hue.
   */
  quotaCursor: string
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
      inner: { palette: 'gradient', fillColorA: '#102C3C', fillColorB: '#175C61', opacity: 78, amplitude: 8, motion: 'normal', baseOpacity: 100, showPercent: true, percentPosition: 'auto', percentSize: 22, percentTextStyle: 'bold', percentColor: '#FFFFFF' },
      outer: { style: 'solid', thickness: 5, colorMode: 'quota', progressColor: '#23B5A5', trackColor: '#7C8B94', glow: 'soft', shellOpacity: 72 }
    },
    expandedCardAppearance: presetExpandedCardAppearance({ healthy: '#23B5A5', warning: '#F2A93B', critical: '#EF5B68', water: '#102C3C', card: '#F7F9F7', cardForeground: '#07161D' })
  },
  {
    id: 'graphite',
    label: '石墨',
    description: '石墨深水，Blue 信号',
    colors: { healthy: '#3B8FD4', warning: '#C47A1A', critical: '#D14B5C', water: '#18212B', card: '#F2F4F3', cardForeground: '#07161D' },
    waterAppearance: {
      inner: { palette: 'gradient', fillColorA: '#18212B', fillColorB: '#244866', opacity: 78, amplitude: 8, motion: 'normal', baseOpacity: 100, showPercent: true, percentPosition: 'auto', percentSize: 22, percentTextStyle: 'bold', percentColor: '#FFFFFF' },
      outer: { style: 'solid', thickness: 5, colorMode: 'quota', progressColor: '#3B8FD4', trackColor: '#80858A', glow: 'soft', shellOpacity: 72 }
    },
    expandedCardAppearance: presetExpandedCardAppearance({ healthy: '#3B8FD4', warning: '#C47A1A', critical: '#D14B5C', water: '#18212B', card: '#F2F4F3', cardForeground: '#07161D' })
  },
  {
    id: 'indigo-sand',
    label: '靛砂',
    description: '靛蓝深水，Indigo 信号',
    colors: { healthy: '#5B6BD6', warning: '#B78B00', critical: '#C24A63', water: '#1A2248', card: '#FAF7F0', cardForeground: '#07161D' },
    waterAppearance: {
      inner: { palette: 'gradient', fillColorA: '#1A2248', fillColorB: '#313C7A', opacity: 78, amplitude: 8, motion: 'normal', baseOpacity: 100, showPercent: true, percentPosition: 'auto', percentSize: 22, percentTextStyle: 'bold', percentColor: '#FFFFFF' },
      outer: { style: 'solid', thickness: 5, colorMode: 'quota', progressColor: '#5B6BD6', trackColor: '#81859A', glow: 'soft', shellOpacity: 72 }
    },
    expandedCardAppearance: presetExpandedCardAppearance({ healthy: '#5B6BD6', warning: '#B78B00', critical: '#C24A63', water: '#1A2248', card: '#FAF7F0', cardForeground: '#07161D' })
  },
  {
    id: 'aurora-night',
    label: '极光夜',
    description: '夜蓝深水，冷青信号',
    colors: { healthy: '#46A8E9', warning: '#D48A26', critical: '#CF4566', water: '#111B34', card: '#F3F7FF', cardForeground: '#0A1428' },
    waterAppearance: {
      inner: { palette: 'gradient', fillColorA: '#111B34', fillColorB: '#244C73', opacity: 78, amplitude: 8, motion: 'normal', baseOpacity: 100, showPercent: true, percentPosition: 'auto', percentSize: 22, percentTextStyle: 'bold', percentColor: '#FFFFFF' },
      outer: { style: 'solid', thickness: 5, colorMode: 'quota', progressColor: '#46A8E9', trackColor: '#7C828F', glow: 'soft', shellOpacity: 72 }
    },
    expandedCardAppearance: presetExpandedCardAppearance({ healthy: '#46A8E9', warning: '#D48A26', critical: '#CF4566', water: '#111B34', card: '#F3F7FF', cardForeground: '#0A1428' })
  },
  {
    id: 'amber-mist',
    label: '琥珀雾',
    description: '暖金深水，Amber 信号',
    colors: { healthy: '#D88A26', warning: '#E1B84A', critical: '#C64A47', water: '#201A12', card: '#FAF3E8', cardForeground: '#24180E' },
    waterAppearance: {
      inner: { palette: 'gradient', fillColorA: '#201A12', fillColorB: '#604119', opacity: 78, amplitude: 8, motion: 'normal', baseOpacity: 100, showPercent: true, percentPosition: 'auto', percentSize: 22, percentTextStyle: 'bold', percentColor: '#FFFFFF' },
      outer: { style: 'solid', thickness: 5, colorMode: 'quota', progressColor: '#D88A26', trackColor: '#84817D', glow: 'soft', shellOpacity: 72 }
    },
    expandedCardAppearance: presetExpandedCardAppearance({ healthy: '#D88A26', warning: '#E1B84A', critical: '#C64A47', water: '#201A12', card: '#FAF3E8', cardForeground: '#24180E' })
  },
  {
    id: 'neon-tide',
    label: '霓虹潮',
    description: '潮青深水，Cyan 信号',
    colors: { healthy: '#1DB8C4', warning: '#E0A03A', critical: '#E4567A', water: '#0A2A32', card: '#F0FBFC', cardForeground: '#062028' },
    waterAppearance: {
      inner: { palette: 'gradient', fillColorA: '#0A2A32', fillColorB: '#115C65', opacity: 78, amplitude: 8, motion: 'normal', baseOpacity: 100, showPercent: true, percentPosition: 'auto', percentSize: 22, percentTextStyle: 'bold', percentColor: '#FFFFFF' },
      outer: { style: 'solid', thickness: 5, colorMode: 'quota', progressColor: '#1DB8C4', trackColor: '#788A8E', glow: 'soft', shellOpacity: 72 }
    },
    expandedCardAppearance: presetExpandedCardAppearance({ healthy: '#1DB8C4', warning: '#E0A03A', critical: '#E4567A', water: '#0A2A32', card: '#F0FBFC', cardForeground: '#062028' })
  },
  {
    id: 'crimson-flare',
    label: '绯焰',
    description: '绛红深水，Coral 信号',
    colors: { healthy: '#E85A4F', warning: '#E0A03A', critical: '#C81E4A', water: '#2A1216', card: '#FFF5F3', cardForeground: '#2A0F14' },
    waterAppearance: {
      inner: { palette: 'gradient', fillColorA: '#2A1216', fillColorB: '#6D2B2A', opacity: 78, amplitude: 8, motion: 'normal', baseOpacity: 100, showPercent: true, percentPosition: 'auto', percentSize: 22, percentTextStyle: 'bold', percentColor: '#FFFFFF' },
      outer: { style: 'solid', thickness: 5, colorMode: 'quota', progressColor: '#E85A4F', trackColor: '#8A7D7F', glow: 'soft', shellOpacity: 72 }
    },
    expandedCardAppearance: presetExpandedCardAppearance({ healthy: '#E85A4F', warning: '#E0A03A', critical: '#C81E4A', water: '#2A1216', card: '#FFF5F3', cardForeground: '#2A0F14' })
  },
  {
    id: 'jade-pulse',
    label: '翠璃',
    description: '翡翠深水，Green 信号',
    colors: { healthy: '#2FAF7A', warning: '#D4A017', critical: '#E04B64', water: '#0F241C', card: '#F3FFF8', cardForeground: '#06241A' },
    waterAppearance: {
      inner: { palette: 'gradient', fillColorA: '#0F241C', fillColorB: '#1A553D', opacity: 78, amplitude: 8, motion: 'normal', baseOpacity: 100, showPercent: true, percentPosition: 'auto', percentSize: 22, percentTextStyle: 'bold', percentColor: '#FFFFFF' },
      outer: { style: 'solid', thickness: 5, colorMode: 'quota', progressColor: '#2FAF7A', trackColor: '#7B8782', glow: 'soft', shellOpacity: 72 }
    },
    expandedCardAppearance: presetExpandedCardAppearance({ healthy: '#2FAF7A', warning: '#D4A017', critical: '#E04B64', water: '#0F241C', card: '#F3FFF8', cardForeground: '#06241A' })
  },
  {
    id: 'violet-bolt',
    label: '紫电',
    description: '紫晶深水，Violet 信号',
    colors: { healthy: '#7B6FD4', warning: '#D4A017', critical: '#E05A78', water: '#1A1630', card: '#F7F4FF', cardForeground: '#161022' },
    waterAppearance: {
      inner: { palette: 'gradient', fillColorA: '#1A1630', fillColorB: '#3C3569', opacity: 78, amplitude: 8, motion: 'normal', baseOpacity: 100, showPercent: true, percentPosition: 'auto', percentSize: 22, percentTextStyle: 'bold', percentColor: '#FFFFFF' },
      outer: { style: 'solid', thickness: 5, colorMode: 'quota', progressColor: '#7B6FD4', trackColor: '#817F8D', glow: 'soft', shellOpacity: 72 }
    },
    expandedCardAppearance: presetExpandedCardAppearance({ healthy: '#7B6FD4', warning: '#D4A017', critical: '#E05A78', water: '#1A1630', card: '#F7F4FF', cardForeground: '#161022' })
  },
  {
    id: 'solar-crown',
    label: '日曜',
    description: '日冕深水，Gold 信号',
    colors: { healthy: '#E09A2B', warning: '#E8C24A', critical: '#D94B45', water: '#24180C', card: '#FFF8EB', cardForeground: '#2A1A08' },
    waterAppearance: {
      inner: { palette: 'gradient', fillColorA: '#24180C', fillColorB: '#664617', opacity: 78, amplitude: 8, motion: 'normal', baseOpacity: 100, showPercent: true, percentPosition: 'auto', percentSize: 22, percentTextStyle: 'bold', percentColor: '#FFFFFF' },
      outer: { style: 'solid', thickness: 5, colorMode: 'quota', progressColor: '#E09A2B', trackColor: '#878079', glow: 'soft', shellOpacity: 72 }
    },
    expandedCardAppearance: presetExpandedCardAppearance({ healthy: '#E09A2B', warning: '#E8C24A', critical: '#D94B45', water: '#24180C', card: '#FFF8EB', cardForeground: '#2A1A08' })
  },
  {
    id: 'ice-prism',
    label: '冰棱',
    description: '冰蓝深水，Sky 信号',
    colors: { healthy: '#3BA4D8', warning: '#D4A84A', critical: '#E05A78', water: '#0E1F2C', card: '#F2F9FF', cardForeground: '#0A1C2C' },
    waterAppearance: {
      inner: { palette: 'gradient', fillColorA: '#0E1F2C', fillColorB: '#1E4E68', opacity: 78, amplitude: 8, motion: 'normal', baseOpacity: 100, showPercent: true, percentPosition: 'auto', percentSize: 22, percentTextStyle: 'bold', percentColor: '#FFFFFF' },
      outer: { style: 'solid', thickness: 5, colorMode: 'quota', progressColor: '#3BA4D8', trackColor: '#7A848B', glow: 'soft', shellOpacity: 72 }
    },
    expandedCardAppearance: presetExpandedCardAppearance({ healthy: '#3BA4D8', warning: '#D4A84A', critical: '#E05A78', water: '#0E1F2C', card: '#F2F9FF', cardForeground: '#0A1C2C' })
  },
  {
    id: 'rose-crystal',
    label: '玫璃',
    description: '蔷薇深水，Rose 信号',
    colors: { healthy: '#D46A9A', warning: '#D4A017', critical: '#C81E4A', water: '#24141C', card: '#FFF1F7', cardForeground: '#2A0F1C' },
    waterAppearance: {
      inner: { palette: 'gradient', fillColorA: '#24141C', fillColorB: '#623248', opacity: 78, amplitude: 8, motion: 'normal', baseOpacity: 100, showPercent: true, percentPosition: 'auto', percentSize: 22, percentTextStyle: 'bold', percentColor: '#FFFFFF' },
      outer: { style: 'solid', thickness: 5, colorMode: 'quota', progressColor: '#D46A9A', trackColor: '#877E82', glow: 'soft', shellOpacity: 72 }
    },
    expandedCardAppearance: presetExpandedCardAppearance({ healthy: '#D46A9A', warning: '#D4A017', critical: '#C81E4A', water: '#24141C', card: '#FFF1F7', cardForeground: '#2A0F1C' })
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

function presetExpandedCardAppearance(colors: CodexColorSettings): CodexExpandedCardAppearanceSettings {
  return {
    surface: colors.card,
    surfaceRaised: mixHex(colors.card, colors.cardForeground, 0.025),
    foreground: colors.cardForeground,
    secondary: mixHex(colors.card, colors.cardForeground, 0.52),
    border: mixHex(colors.card, colors.cardForeground, 0.28),
    focus: colors.healthy,
    accent: colors.healthy,
    running: '#2F7CC0',
    pending: '#C6631A',
    ...defaultCompanionQuotaTones(colors)
  }
}

/**
 * Default per-provider quota tones for the expanded card's single quota row.
 *
 * Both derive from the theme's own signal hue, so a built-in or saved theme keeps
 * one visual family instead of gaining an unrelated brand color. They are held
 * apart by a fixed hue rotation rather than by borrowing `warning` or `critical`:
 * several presets (`amber-mist`, `solar-crown`, `crimson-flare`, `rose-crystal`)
 * put those within a few degrees of `healthy`, so a signal-color pairing would
 * collapse into one hue exactly where the user needs to tell two providers apart,
 * and `critical` additionally already means "quota is tight".
 *
 * Each tone is pulled to a 4.5:1 ratio against the card surface because it
 * carries the percentage text itself, not just a decorative rule.
 */
export function defaultCompanionQuotaTones(colors: CodexColorSettings): { codexQuota: string; claudeQuota: string } {
  return {
    codexQuota: providerQuotaTone(colors.healthy, colors.card, 0),
    claudeQuota: providerQuotaTone(colors.healthy, colors.card, 150)
  }
}

function providerQuotaTone(base: string, surface: string, hueShift: number): string {
  const hsl = hexToHsl(base)
  if (!hsl) return base
  // A washed-out theme hue would rotate into another washed-out hue, so the
  // saturation floor is what actually keeps the two providers separable.
  return hslToHex(nearestContrastHsl({ h: hsl.h + hueShift, s: Math.max(hsl.s, 45), l: hsl.l }, surface, 4.5))
}

export function quotaStatusColor(percent: number, colors: CodexColorSettings): string {
  if (percent <= 20) return colors.critical
  if (percent <= 50) return colors.warning
  return colors.healthy
}

export function resolveCodexSurfaceTheme(style: CodexDisplayStyle, colors: CodexColorSettings, percent = 100): CodexSurfaceTheme {
  const surface = style === 'water' ? colors.water : colors.card
  const foreground = style === 'card'
    ? colors.cardForeground
    : readableForeground(surface)
  const accent = quotaStatusColor(percent, colors)
  const warning = colors.warning
  const critical = colors.critical
  const running = '#2F7CC0'
  const pending = '#C6631A'
  const liquid = mixHex(surface, accent, 0.56)
  const liquidCrest = mixHex(surface, accent, 0.68)
  return {
    style,
    surface,
    surfaceRaised: mixHex(surface, foreground, style === 'water' ? 0.06 : 0.025),
    foreground,
    secondary: readableTone(surface, foreground, 4.5),
    border: readableTone(surface, foreground, 3),
    focus: accent,
    accent,
    liquid,
    liquidCrest,
    warning,
    critical,
    running,
    pending,
    onAccent: strictForeground(accent),
    onRunning: strictForeground(running),
    onPending: strictForeground(pending),
    // The compact skin has no quota row; these keep the token set complete so a
    // shared stylesheet never resolves an undefined variable mid-transition.
    quotaCodex: providerQuotaTone(colors.healthy, surface, 0),
    quotaClaude: providerQuotaTone(colors.healthy, surface, 150),
    quotaCursor: providerQuotaTone(colors.healthy, surface, 255)
  }
}

/** The expanded float always consumes this independent panel theme, regardless of compact style. */
export function resolveCodexExpandedCardTheme(
  colors: CodexColorSettings,
  appearance: CodexExpandedCardAppearanceSettings,
  percent = 100
): CodexSurfaceTheme {
  const base = resolveCodexSurfaceTheme('card', colors, percent)
  const accent = appearance.accent
  return {
    ...base,
    style: 'card',
    surface: appearance.surface,
    surfaceRaised: appearance.surfaceRaised,
    foreground: appearance.foreground,
    secondary: appearance.secondary,
    border: appearance.border,
    focus: appearance.focus,
    accent,
    liquid: mixHex(appearance.surface, accent, 0.56),
    liquidCrest: mixHex(appearance.surface, accent, 0.68),
    running: appearance.running,
    pending: appearance.pending,
    onAccent: strictForeground(accent),
    onRunning: strictForeground(appearance.running),
    onPending: strictForeground(appearance.pending),
    quotaCodex: appearance.codexQuota,
    quotaClaude: appearance.claudeQuota,
    // Not a persisted appearance field: Cursor ownership stays derived from
    // the theme hue against the actual card surface so contrast holds even
    // when the user customizes the panel while Codex/Claude tones are edited.
    quotaCursor: providerQuotaTone(colors.healthy, appearance.surface, 255)
  }
}

export function validateCodexCustomColors(colors: CodexColorSettings): CodexColorValidation {
  void colors
  return { valid: true, message: '' }
}

export function validateCodexWaterAppearance(colors: CodexColorSettings, appearance: CodexWaterAppearanceSettings): CodexColorValidation {
  void colors
  void appearance
  return { valid: true, message: '' }
}

export function matchCodexThemePreset(
  colors: CodexColorSettings,
  appearance?: CodexWaterAppearanceSettings,
  expandedCardAppearance?: CodexExpandedCardAppearanceSettings
): CodexThemePreset['id'] | null {
  const signature = JSON.stringify(Object.fromEntries(Object.entries(colors).map(([key, value]) => [key, normalizeHex(value)])))
  return CODEX_THEME_PRESETS.find((preset) => JSON.stringify(preset.colors) === signature
    && (!appearance || JSON.stringify(preset.waterAppearance) === JSON.stringify(appearance))
    && (!expandedCardAppearance || JSON.stringify(preset.expandedCardAppearance) === JSON.stringify(expandedCardAppearance)))?.id || null
}


export function codexWaterAppearanceCssVars(
  appearance: CodexWaterAppearanceSettings,
  colors: CodexColorSettings,
  percent = 100,
  weeklyPercent = percent
): Record<string, string> {
  const durations = {
    static: ['0s', '0s'],
    slow: ['10s', '12s'],
    normal: ['6.4s', '7.8s'],
    fast: ['4.8s', '5.8s']
  } as const
  const [durationA, durationB] = durations[appearance.inner.motion]
  const progress = appearance.outer.colorMode === 'quota' ? resolveCodexSurfaceTheme('water', colors, weeklyPercent).accent : appearance.outer.progressColor
  const auroraAccent = mixHex(appearance.inner.fillColorB, colors.healthy, 0.52)
  const auroraGlow = mixHex(appearance.inner.fillColorA, colors.warning, 0.36)
  const fill = appearance.inner.palette === 'solid'
    ? appearance.inner.fillColorA
    : appearance.inner.palette === 'aurora'
      ? `linear-gradient(115deg, ${appearance.inner.fillColorA} 0%, ${appearance.inner.fillColorB} 52%, ${mixHex(appearance.inner.fillColorB, colors.healthy, 0.28)} 100%)`
      : `linear-gradient(135deg, ${appearance.inner.fillColorA}, ${appearance.inner.fillColorB})`
  const glow = appearance.outer.glow === 'strong'
    ? `drop-shadow(0 0 5px ${progress})`
    : appearance.outer.glow === 'soft' ? `drop-shadow(0 0 2px ${progress})` : 'none'
  return {
    '--water-base': colors.water,
    '--water-base-opacity': String(appearance.inner.baseOpacity / 100),
    '--water-fill': fill,
    '--water-fill-color-a': appearance.inner.fillColorA,
    '--water-fill-color-b': appearance.inner.fillColorB,
    '--water-aurora-accent': auroraAccent,
    '--water-aurora-glow': auroraGlow,
    '--water-opacity': String(appearance.inner.opacity / 100),
    '--water-amplitude': `${appearance.inner.amplitude}px`,
    '--water-wave-a-duration': durationA,
    '--water-wave-b-duration': durationB,
    '--water-wave-a-delay': appearance.inner.motion === 'static' ? '0s' : `-${Number.parseFloat(durationA) * 0.18}s`,
    '--water-wave-b-delay': appearance.inner.motion === 'static' ? '0s' : `-${Number.parseFloat(durationB) * 0.57}s`,
    '--ring-width': String(appearance.outer.thickness),
    '--ring-progress': progress,
    '--ring-track': appearance.outer.trackColor,
    '--ring-glow': glow
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
    '--codex-on-pending': theme.onPending,
    '--codex-quota-codex': theme.quotaCodex,
    '--codex-quota-claude': theme.quotaClaude,
    '--codex-quota-cursor': theme.quotaCursor
  }
}
