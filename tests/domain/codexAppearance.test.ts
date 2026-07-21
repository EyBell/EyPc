import { describe, expect, it } from 'vitest'
import {
  CODEX_THEME_PRESETS,
  codexWaterAppearanceCssVars,
  contrastRatio,
  matchCodexThemePreset,
  resolveCodexSurfaceTheme,
  validateCodexCustomColors,
  validateCodexWaterAppearance
} from '../../src/domain/codexAppearance'
import { defaultCodexSettings } from '../../src/domain/codex'

describe('Codex appearance', () => {
  it('keeps every preset as a paired dark-water and light-card theme', () => {
    for (const preset of CODEX_THEME_PRESETS) {
      expect(validateCodexCustomColors(preset.colors)).toEqual({ valid: true, message: '' })
      expect(validateCodexWaterAppearance(preset.colors, preset.waterAppearance)).toEqual({ valid: true, message: '' })
      expect(matchCodexThemePreset(preset.colors, preset.waterAppearance)).toBe(preset.id)
    }
    expect(matchCodexThemePreset(defaultCodexSettings().colors)).toBe('sea-salt')
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

  it('rejects malformed or skin-inverting custom surface colors', () => {
    const base = CODEX_THEME_PRESETS[0].colors
    expect(validateCodexCustomColors({ ...base, healthy: 'teal' }).valid).toBe(false)
    expect(validateCodexCustomColors({ ...base, water: '#F5F5F5' }).valid).toBe(false)
    expect(validateCodexCustomColors({ ...base, card: '#20252A' }).valid).toBe(false)
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
