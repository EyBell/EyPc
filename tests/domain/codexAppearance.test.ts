import { describe, expect, it } from 'vitest'
import {
  CODEX_THEME_PRESETS,
  codexWaterAppearanceCssVars,
  contrastRatio,
  hexToHsl,
  hslToHex,
  isHslContrastSafe,
  codexThemeCssVars,
  defaultCompanionQuotaTones,
  matchCodexThemePreset,
  nearestContrastHsl,
  resolveCodexExpandedCardTheme,
  resolveCodexSurfaceTheme,
  validateCodexCustomColors,
  validateCodexWaterAppearance
} from '../../src/domain/codexAppearance'
import { defaultCodexSettings, normalizeCodexExpandedCardAppearance } from '../../src/domain/codex'

describe('Codex appearance', () => {
  it('keeps every built-in preset complete and exactly matchable', () => {
    for (const preset of CODEX_THEME_PRESETS) {
      expect(preset.colors.cardForeground).toMatch(/^#[0-9A-F]{6}$/)
      expect(validateCodexCustomColors(preset.colors)).toEqual({ valid: true, message: '' })
      expect(validateCodexWaterAppearance(preset.colors, preset.waterAppearance)).toEqual({ valid: true, message: '' })
      expect(matchCodexThemePreset(preset.colors, preset.waterAppearance)).toBe(preset.id)
    }
    expect(matchCodexThemePreset(defaultCodexSettings().colors)).toBe('sea-salt')
    expect(matchCodexThemePreset({ ...defaultCodexSettings().colors, cardForeground: '#F8FCFB' })).toBeNull()
  })

  it('derives readable surface copy and status labels without rewriting persisted accent tokens', () => {
    for (const preset of CODEX_THEME_PRESETS) {
      for (const style of ['water', 'card'] as const) {
        const theme = resolveCodexSurfaceTheme(style, preset.colors, 42)
        expect(contrastRatio(theme.foreground, theme.surface)).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(theme.secondary, theme.surface)).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(theme.border, theme.surface)).toBeGreaterThanOrEqual(3)
        expect(theme.focus).toBe(preset.colors.warning)
        expect(theme.accent).toBe(preset.colors.warning)
        expect(contrastRatio(theme.onRunning, theme.running)).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(theme.onPending, theme.pending)).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('keeps validation compatibility calls non-blocking for direct color persistence', () => {
    const base = CODEX_THEME_PRESETS[0].colors
    expect(validateCodexCustomColors({ ...base, healthy: 'teal' })).toEqual({ valid: true, message: '' })
    expect(validateCodexCustomColors({ ...base, water: '#F5F5F5' })).toEqual({ valid: true, message: '' })
    expect(validateCodexCustomColors({ ...base, card: '#20252A', cardForeground: '#30353A' })).toEqual({ valid: true, message: '' })
    expect(validateCodexCustomColors({ ...base, cardForeground: '#12345G' })).toEqual({ valid: true, message: '' })
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

  it('keeps water appearance validation non-blocking for direct token persistence', () => {
    const preset = CODEX_THEME_PRESETS[0]
    expect(validateCodexWaterAppearance(preset.colors, { ...preset.waterAppearance, inner: { ...preset.waterAppearance.inner, opacity: 39 } })).toEqual({ valid: true, message: '' })
    expect(validateCodexWaterAppearance(preset.colors, { ...preset.waterAppearance, outer: { ...preset.waterAppearance.outer, thickness: 7 } })).toEqual({ valid: true, message: '' })
    expect(validateCodexWaterAppearance(preset.colors, { ...preset.waterAppearance, inner: { ...preset.waterAppearance.inner, fillColorB: '#FFFFFF' } })).toEqual({ valid: true, message: '' })
    expect(validateCodexWaterAppearance(preset.colors, { ...preset.waterAppearance, outer: { ...preset.waterAppearance.outer, colorMode: 'custom', progressColor: preset.colors.water } })).toEqual({ valid: true, message: '' })
  })

  it('derives quota ring status color but preserves a dedicated custom ring color exactly', () => {
    const preset = CODEX_THEME_PRESETS[0]
    const colors = { ...preset.colors, healthy: '#132F3E' }
    const quotaVars = codexWaterAppearanceCssVars(preset.waterAppearance, colors, 80, 10)
    const customAppearance = {
      ...preset.waterAppearance,
      outer: { ...preset.waterAppearance.outer, colorMode: 'custom' as const, progressColor: '#132F3E' }
    }
    const customVars = codexWaterAppearanceCssVars(customAppearance, colors, 80, 10)
    expect(quotaVars['--ring-progress']).toBe(resolveCodexSurfaceTheme('water', colors, 10).accent)
    expect(customVars['--ring-progress']).toBe('#132F3E')
  })
})


describe('per-provider quota tones', () => {
  it('gives every built-in theme two separable, readable quota tones', () => {
    for (const preset of CODEX_THEME_PRESETS) {
      const { codexQuota, claudeQuota } = preset.expandedCardAppearance
      expect(codexQuota).toMatch(/^#[0-9A-F]{6}$/)
      expect(claudeQuota).toMatch(/^#[0-9A-F]{6}$/)
      // Readable, because these tones carry the percentage text itself.
      expect(contrastRatio(codexQuota, preset.expandedCardAppearance.surface)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(claudeQuota, preset.expandedCardAppearance.surface)).toBeGreaterThanOrEqual(4.5)
      // Separable in every preset — this is the reason the default is a hue
      // rotation rather than a pairing of the theme's own signal colors.
      const codexHue = hexToHsl(codexQuota)?.h ?? 0
      const claudeHue = hexToHsl(claudeQuota)?.h ?? 0
      const distance = Math.abs(((codexHue - claudeHue + 540) % 360) - 180)
      expect(distance).toBeGreaterThan(60)
    }
  })

  it('exposes both tones as expanded-card tokens', () => {
    const settings = defaultCodexSettings()
    const vars = codexThemeCssVars(resolveCodexExpandedCardTheme(settings.colors, settings.expandedCardAppearance))
    expect(vars['--codex-quota-codex']).toBe(settings.expandedCardAppearance.codexQuota)
    expect(vars['--codex-quota-claude']).toBe(settings.expandedCardAppearance.claudeQuota)
    expect(vars['--codex-quota-codex']).not.toBe(vars['--codex-quota-claude'])

    // The compact skin has no quota row but must not emit undefined tokens.
    const compact = codexThemeCssVars(resolveCodexSurfaceTheme('water', settings.colors))
    expect(compact['--codex-quota-codex']).toMatch(/^#[0-9A-F]{6}$/)
    expect(compact['--codex-quota-claude']).toMatch(/^#[0-9A-F]{6}$/)
  })

  it('backfills a settings object stored before the quota row existed', () => {
    const colors = defaultCodexSettings().colors
    const legacy = { ...defaultCodexSettings().expandedCardAppearance } as Record<string, unknown>
    delete legacy.codexQuota
    delete legacy.claudeQuota
    const normalized = normalizeCodexExpandedCardAppearance(legacy, colors)
    expect(normalized.codexQuota).toBe(defaultCompanionQuotaTones(colors).codexQuota)
    expect(normalized.claudeQuota).toBe(defaultCompanionQuotaTones(colors).claudeQuota)

    // An explicit user choice still wins over the derived default.
    const custom = normalizeCodexExpandedCardAppearance({ ...legacy, claudeQuota: '#123456' }, colors)
    expect(custom.claudeQuota).toBe('#123456')
  })
})
