import type { CodexColorSettings, CodexDisplayStyle, CodexWaterAppearanceSettings } from './codex'

export interface CodexThemePreset {
  id: 'sea-salt' | 'graphite' | 'indigo-sand'
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

const HEX_COLOR = /^#[0-9a-f]{6}$/i

export const CODEX_THEME_PRESETS: readonly CodexThemePreset[] = [
  {
    id: 'sea-salt',
    label: '海盐',
    description: '深海与纸白，Teal 信号',
    colors: { healthy: '#23B5A5', warning: '#F2A93B', critical: '#EF5B68', water: '#102C3C', card: '#F7F9F7' },
    waterAppearance: {
      inner: { palette: 'gradient', colorA: '#102C3C', colorB: '#175C61', opacity: 78, amplitude: 8, motion: 'normal' },
      outer: { style: 'solid', thickness: 4, colorMode: 'quota', progressColor: '#23B5A5', trackColor: '#7C8B94', glow: 'soft' }
    }
  },
  {
    id: 'graphite',
    label: '石墨',
    description: '石墨与雾白，Blue 信号',
    colors: { healthy: '#256FB5', warning: '#A66100', critical: '#BF3C50', water: '#18212B', card: '#F2F4F3' },
    waterAppearance: {
      inner: { palette: 'solid', colorA: '#18212B', colorB: '#174D68', opacity: 82, amplitude: 6, motion: 'slow' },
      outer: { style: 'segmented', thickness: 4, colorMode: 'quota', progressColor: '#4A9BE8', trackColor: '#73899D', glow: 'off' }
    }
  },
  {
    id: 'indigo-sand',
    label: '靛砂',
    description: '靛蓝与暖白，Indigo 信号',
    colors: { healthy: '#4E60C8', warning: '#9B6100', critical: '#B63D59', water: '#1D2444', card: '#FAF7F0' },
    waterAppearance: {
      inner: { palette: 'aurora', colorA: '#1D2444', colorB: '#343C77', opacity: 76, amplitude: 9, motion: 'normal' },
      outer: { style: 'solid', thickness: 5, colorMode: 'custom', progressColor: '#7987F2', trackColor: '#7E829E', glow: 'strong' }
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

function readableForeground(surface: string): string {
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
  const foreground = readableForeground(surface)
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
  if (relativeLuminance(colors.card) < 0.68) return { valid: false, message: '卡片表面需保持浅色，以维持纸白皮肤' }

  for (const style of ['water', 'card'] as const) {
    const theme = resolveCodexSurfaceTheme(style, colors)
    if (contrastRatio(theme.foreground, theme.surface) < 4.5 || contrastRatio(theme.secondary, theme.surface) < 4.5) {
      return { valid: false, message: '文字与表面对比度不足' }
    }
    if (contrastRatio(theme.border, theme.surface) < 3 || contrastRatio(theme.focus, theme.surface) < 3) {
      return { valid: false, message: '边界或焦点对比度不足' }
    }
  }
  return { valid: true, message: '' }
}

export function validateCodexWaterAppearance(colors: CodexColorSettings, appearance: CodexWaterAppearanceSettings): CodexColorValidation {
  const values = [appearance.inner.colorA, appearance.inner.colorB, appearance.outer.progressColor, appearance.outer.trackColor]
  if (values.some((value) => normalizeHex(value) === null)) return { valid: false, message: '水球颜色需使用完整的 6 位十六进制值' }
  if (appearance.inner.opacity < 40 || appearance.inner.opacity > 95) return { valid: false, message: '水纹透明度需在 40%–95% 之间' }
  if (appearance.inner.amplitude < 4 || appearance.inner.amplitude > 12) return { valid: false, message: '水纹振幅需在 4–12px 之间' }
  if (appearance.outer.thickness < 2 || appearance.outer.thickness > 6) return { valid: false, message: 'Weekly 环粗细需在 2–6px 之间' }
  const surface = colors.water
  const foreground = readableForeground(surface)
  for (const liquid of [appearance.inner.colorA, appearance.inner.colorB]) {
    if (contrastRatio(foreground, liquid) < 4.5) return { valid: false, message: '水纹最亮颜色与必要文字的对比度不足 4.5:1' }
  }
  if (contrastRatio(appearance.outer.trackColor, surface) < 3) return { valid: false, message: '外环轨道与水球表面对比度不足 3:1' }
  if (appearance.outer.colorMode === 'custom' && contrastRatio(appearance.outer.progressColor, surface) < 3) {
    return { valid: false, message: '外环进度色与水球表面对比度不足 3:1' }
  }
  return { valid: true, message: '' }
}

export function matchCodexThemePreset(colors: CodexColorSettings, appearance?: CodexWaterAppearanceSettings): CodexThemePreset['id'] | null {
  const signature = JSON.stringify(Object.fromEntries(Object.entries(colors).map(([key, value]) => [key, normalizeHex(value)])))
  return CODEX_THEME_PRESETS.find((preset) => JSON.stringify(preset.colors) === signature && (!appearance || JSON.stringify(preset.waterAppearance) === JSON.stringify(appearance)))?.id || null
}


export function codexWaterAppearanceCssVars(appearance: CodexWaterAppearanceSettings, colors: CodexColorSettings, percent: number, weeklyPercent = percent): Record<string, string> {
  const durations = {
    static: ['0s', '0s'],
    slow: ['10s', '12s'],
    normal: ['6.4s', '7.8s'],
    fast: ['4.8s', '5.8s']
  } as const
  const [durationA, durationB] = durations[appearance.inner.motion]
  const progress = appearance.outer.colorMode === 'quota' ? resolveCodexSurfaceTheme('water', colors, weeklyPercent).accent : appearance.outer.progressColor
  const fill = appearance.inner.palette === 'solid'
    ? appearance.inner.colorA
    : appearance.inner.palette === 'aurora'
      ? `linear-gradient(115deg, ${appearance.inner.colorA} 0%, ${appearance.inner.colorB} 52%, ${mixHex(appearance.inner.colorB, colors.healthy, 0.28)} 100%)`
      : `linear-gradient(135deg, ${appearance.inner.colorA}, ${appearance.inner.colorB})`
  const glow = appearance.outer.glow === 'strong'
    ? `drop-shadow(0 0 5px ${progress})`
    : appearance.outer.glow === 'soft' ? `drop-shadow(0 0 2px ${progress})` : 'none'
  return {
    '--water-fill': fill,
    '--water-fill-a': appearance.inner.colorA,
    '--water-fill-b': appearance.inner.colorB,
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
    '--codex-on-pending': theme.onPending
  }
}
