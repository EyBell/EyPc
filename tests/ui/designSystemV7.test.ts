import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('EyPc V7 design system contract', () => {
  it('loads the shared semantic contract before every product surface stylesheet', () => {
    for (const entry of ['src/main.ts', 'src/float-main.ts', 'src/action-main.ts']) {
      const source = read(entry)
      const designIndex = source.indexOf("./styles/design-system-v7.css")
      const firstSurfaceIndex = source.indexOf("./styles/", designIndex + 1)
      expect(designIndex, entry).toBeGreaterThan(-1)
      expect(firstSurfaceIndex, entry).toBeGreaterThan(designIndex)
    }
  })

  it('defines semantic density, theme, motion, focus and forced-color adapters', () => {
    const source = read('src/styles/design-system-v7.css')
    for (const contract of [
      '--eypc-control-compact: 24px',
      '--eypc-control-default: 28px',
      '--eypc-control-comfortable: 32px',
      'prefers-color-scheme: dark',
      'prefers-reduced-motion: reduce',
      'forced-colors: active',
      '--eypc-color-focus',
      '--eypc-z-modal'
    ]) expect(source).toContain(contract)
  })

  it('uses real icons and accessible names for compact Float row actions', () => {
    const component = read('src/FloatApp.vue')
    const styles = read('src/styles/float.css')
    expect(component).not.toContain('inline-character-button')
    expect(component).not.toMatch(/>\s*(顶|暂|恢|显|隐|归|执|移|确)\s*<\/button>/)
    expect(component).toContain('class="inline-icon-button action-pin"')
    expect(component).toContain('<Pin')
    expect(component).toContain('aria-label=')
    expect(styles).toContain('width: var(--eypc-control-compact)')
    expect(styles).not.toContain('.inline-character-button')
  })

  it('keeps container queries with media fallbacks on all adaptive surfaces', () => {
    const main = read('src/styles/app.css')
    const float = read('src/styles/float.css')
    const action = read('src/styles/action-runner.css')
    for (const source of [main, float, action]) {
      expect(source).toContain('container-type: inline-size')
      expect(source).toContain('@container')
      expect(source).toContain('@media')
    }
  })

  it('adapts the existing Codex settings identity to project semantic tokens', () => {
    const codex = read('src/styles/codex.css')
    for (const token of [
      'var(--eypc-color-canvas)',
      'var(--eypc-color-surface)',
      'var(--eypc-color-text)',
      'var(--eypc-color-text-muted)',
      'var(--eypc-color-border-soft)',
      'var(--eypc-color-focus)',
      'var(--eypc-z-tooltip)'
    ]) expect(codex).toContain(token)
    expect(codex).toContain('EyPc V7 semantic theme adapter')
    expect(codex).toMatch(/\.codex-form-grid select \{[^}]*background: var\(--eypc-color-surface-raised\);[^}]*color: var\(--eypc-color-text\);/s)
    expect(codex).toMatch(/\.water-settings-group \{[^}]*background: var\(--eypc-color-surface\);/s)
    expect(codex).toMatch(/\.codex-theme-toolbar \.codex-input \{[^}]*background: var\(--eypc-color-surface-raised\);[^}]*color: var\(--eypc-color-text\);/s)
    expect(codex).toMatch(/\.codex-theme-save \.codex-input \{[^}]*background: var\(--eypc-color-surface-raised\);[^}]*color: var\(--eypc-color-text\);/s)
    expect(codex).toMatch(/\.codex-color-grid input \{[^}]*border: 1px solid var\(--eypc-color-border\);[^}]*background: var\(--eypc-color-surface-raised\);/s)
    expect(codex).toMatch(/\.codex-card-color-fieldset \{[^}]*border: 1px solid var\(--eypc-color-border-soft\);[^}]*background: var\(--eypc-color-surface\);/s)
    expect(codex).toMatch(/\.codex-color-card-popover \{[^}]*z-index: var\(--eypc-z-popover\);[^}]*background: color-mix\(in srgb, var\(--eypc-color-surface-raised\)/s)

    for (const selector of [
      '.codex-color-grid input',
      '.codex-theme-save .codex-input',
      '.codex-card-color-trigger',
      '.codex-card-color-dialog',
      '.codex-config-page .codex-card-color-close',
      '.codex-card-color-fieldset',
      '.codex-card-hex-field input'
    ]) {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const rule = codex.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 's'))?.[1] ?? ''
      expect(rule, selector).not.toMatch(/(?:background|color|border(?:-color)?):[^;]*#[0-9a-f]{3,8}/i)
    }
  })

  it('keeps global keydown ownership in surface adapters', () => {
    const settings = read('src/pages/SettingsPage.vue')
    const tooltip = read('src/components/OperationTooltipLayer.vue')
    expect(settings).not.toMatch(/window\.addEventListener\(['"]keydown/)
    expect(tooltip).not.toMatch(/window\.addEventListener\(['"]keydown/)
    expect(settings).toContain('@keydown.capture="handleSettingsSurfaceKeydown"')
    expect(tooltip).toContain('handleSurfaceKeydown: onKeydown')
  })
})
