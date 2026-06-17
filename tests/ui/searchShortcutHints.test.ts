import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('port search shortcut hints', () => {
  it('shows Ctrl-based shortcuts for both port search boxes only while shortcut hints are visible', () => {
    const app = readFileSync(resolve(process.cwd(), 'src/App.vue'), 'utf8')
    const portsPage = readFileSync(resolve(process.cwd(), 'src/pages/PortsPage.vue'), 'utf8')
    const suggestBox = readFileSync(resolve(process.cwd(), 'src/components/SearchSuggestBox.vue'), 'utf8')
    const tabShell = readFileSync(resolve(process.cwd(), 'src/components/TabShell.vue'), 'utf8')

    expect(app).toContain(':show-shortcut-hints="shortcutHints"')
    expect(portsPage).toContain('showShortcutHints?: boolean')
    expect(portsPage).toContain("ctrlCommandLabel('ports.search.focus')")
    expect(portsPage).toContain("ctrlCommandLabel('ports.groupSearch.focus')")
    expect(portsPage).toContain(".filter((label) => label.startsWith('c-'))")
    expect(suggestBox).toContain('shortcutHint?: string')
    expect(suggestBox).toContain('search-shortcut-hint')
    expect(tabShell).toContain('tab-shortcut-hint')
  })

  it('keeps placeholder left-aligned while compacting shortcut hints at the right edge', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/app.css'), 'utf8')
    const suggestBox = readFileSync(resolve(process.cwd(), 'src/components/SearchSuggestBox.vue'), 'utf8')

    expect(suggestBox).toContain('search-shortcut-hint')
    expect(css).toMatch(/\.search-suggest-box\.shortcut-hinting \.suggest-input \{[^}]*padding-right:\s*64px;/s)
    expect(css).not.toMatch(/\.search-suggest-box\.shortcut-hinting \.suggest-input \{[^}]*text-align:\s*right;/s)
    expect(css).not.toMatch(/\.search-suggest-box\.shortcut-hinting \.suggest-input::placeholder \{[^}]*text-align:\s*right;/s)
    expect(css).toMatch(/\.search-shortcut-hint \{[^}]*position: absolute;[^}]*right: 8px;[^}]*max-width: 48px;/s)
  })

  it('floats top-tab shortcut hints without widening tab buttons', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/app.css'), 'utf8')
    const tabShell = readFileSync(resolve(process.cwd(), 'src/components/TabShell.vue'), 'utf8')

    expect(tabShell).toContain('tab-shortcut-hint')
    expect(css).toMatch(/\.tab-button \{[^}]*position: relative;/s)
    expect(css).toMatch(/\.tab-button \{[^}]*width:\s*116px;[^}]*flex:\s*0 0 116px;/s)
    expect(css).not.toMatch(/\.tab-button \{[^}]*justify-content:\s*space-between;/s)
    expect(css).not.toContain('.tab-button.shortcut-hinting span')
    expect(css).toMatch(/\.tab-shortcut-hint \{[^}]*position: absolute;[^}]*right: 8px;[^}]*top:\s*calc\(100% \+ 4px\);[^}]*max-width: 54px;/s)
  })
})
