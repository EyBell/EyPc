import { describe, expect, it } from 'vitest'
import {
  CODEX_THEME_PRESETS,
  codexWaterAppearanceCssVars,
  contrastRatio,
  hexToHsl,
  hslToHex,
  isHslContrastSafe,
  matchCodexThemePreset,
  nearestContrastHsl,
  resolveCodexSurfaceTheme,
  validateCodexCustomColors,
  validateCodexWaterAppearance
} from '../../src/domain/codexAppearance'
import { defaultCodexSettings } from '../../src/domain/codex'

describe('Codex appearance', () => {
  it('keeps every preset as a paired dark-water and contrast-safe card theme', () => {
    for (const preset of CODEX_THEME_PRESETS) {
      expect(preset.colors.cardForeground).toMatch(/^#[0-9A-F]{6}$/)
      expect(validateCodexCustomColors(preset.colors)).toEqual({ valid: true, message: '' })
      expect(validateCodexWaterAppearance(preset.colors, preset.waterAppearance)).toEqual({ valid: true, message: '' })
      expect(matchCodexThemePreset(preset.colors, preset.waterAppearance)).toBe(preset.id)
    }
    expect(matchCodexThemePreset(defaultCodexSettings().colors)).toBe('sea-salt')
    expect(matchCodexThemePreset({ ...defaultCodexSettings().colors, cardForeground: '#F8FCFB' })).toBeNull()
  })

  it('derives accessible text, boundary, focus and status colors for both surfaces', () => {
    for (const preset of CODEX_THEME_PRESETS) {
      for (const style of ['water', 'card'] as const) {
        const theme = resolveCodexSurfaceTheme(style, preset.colors, 42)
        expect(contrastRatio(theme.foreground, theme.surface)).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(theme.secondary, theme.surface)).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(theme.border, theme.surface)).toBeGreaterThanOrEqual(3)
        expect(contrastRatio(theme.focus, theme.surface)).toBeGreaterThanOrEqual(3)
        expect(contrastRatio(theme.accent, theme.surface)).toBeGreaterThanOrEqual(3)
        expect(contrastRatio(theme.foreground, theme.liquid)).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(theme.foreground, theme.liquidCrest)).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(theme.onRunning, theme.running)).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(theme.onPending, theme.pending)).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('accepts deep and light card pairs but rejects malformed, low-contrast, or light-water colors', () => {
    const base = CODEX_THEME_PRESETS[0].colors
    expect(validateCodexCustomColors({ ...base, healthy: 'teal' }).valid).toBe(false)
    expect(validateCodexCustomColors({ ...base, water: '#F5F5F5' }).valid).toBe(false)
    expect(validateCodexCustomColors({ ...base, card: '#20252A', cardForeground: '#F8FCFB' }).valid).toBe(true)
    expect(validateCodexCustomColors({ ...base, card: '#F7F9F7', cardForeground: '#07161D' }).valid).toBe(true)
    expect(validateCodexCustomColors({ ...base, card: '#20252A', cardForeground: '#30353A' }).valid).toBe(false)
    expect(validateCodexCustomColors({ ...base, cardForeground: '#12345G' }).valid).toBe(false)
  })

  it('round-trips HEX and HSL values in both directions', () => {
    for (const hex of ['#1A2B3C', '#F7F9F7', '#07161D', '#FF0000', '#00FF00', '#0000FF']) {
      const hsl = hexToHsl(hex)
      expect(hsl).not.toBeNull()
      expect(hslToHex(hsl!)).toBe(hex)
    }
    expect(hslToHex({ h: 360, s: 100, l: 50 })).toBe('#FF0000')
    expect(hexToHsl('invalid')).toBeNull()
  })

  it('keeps hue and saturation while moving a linked color to the nearest contrast-safe lightness', () => {
    const source = { h: 212, s: 63, l: 84 }
    const adjusted = nearestContrastHsl(source, '#F7F9F7')
    expect(adjusted.h).toBe(source.h)
    expect(adjusted.s).toBe(source.s)
    expect(adjusted.l).toBeLessThan(source.l)
    expect(contrastRatio(hslToHex(adjusted), '#F7F9F7')).toBeGreaterThanOrEqual(4.5)
    expect(isHslContrastSafe(adjusted, '#F7F9F7')).toBe(true)
    expect(isHslContrastSafe(source, '#F7F9F7')).toBe(false)
  })

  it('rejects invalid water bounds and low-contrast custom ring or liquid colors', () => {
    const preset = CODEX_THEME_PRESETS[0]
    expect(validateCodexWaterAppearance(preset.colors, { ...preset.waterAppearance, inner: { ...preset.waterAppearance.inner, opacity: 39 } }).valid).toBe(false)
    expect(validateCodexWaterAppearance(preset.colors, { ...preset.waterAppearance, outer: { ...preset.waterAppearance.outer, thickness: 7 } }).valid).toBe(false)
    expect(validateCodexWaterAppearance(preset.colors, { ...preset.waterAppearance, inner: { ...preset.waterAppearance.inner, colorB: '#FFFFFF' } }).valid).toBe(false)
    expect(validateCodexWaterAppearance(preset.colors, { ...preset.waterAppearance, outer: { ...preset.waterAppearance.outer, colorMode: 'custom', progressColor: preset.colors.water } }).valid).toBe(false)
  })

  it('resolves quota-driven outer-ring colors to a visible 3:1 boundary', () => {
    const preset = CODEX_THEME_PRESETS[0]
    const colors = { ...preset.colors, healthy: '#132F3E' }
    const vars = codexWaterAppearanceCssVars(preset.waterAppearance, colors, 80, 10)
    expect(vars['--ring-progress']).toBe(resolveCodexSurfaceTheme('water', colors, 10).accent)
    expect(contrastRatio(vars['--ring-progress'], colors.water)).toBeGreaterThanOrEqual(3)
  })
})
