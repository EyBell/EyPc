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
    expect(suggestBox).toContain('search-inline-history')
    expect(tabShell).toContain('tab-shortcut-hint')
  })

  it('keeps placeholder left-aligned while rendering inline history after typed text', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/app.css'), 'utf8')
    const suggestBox = readFileSync(resolve(process.cwd(), 'src/components/SearchSuggestBox.vue'), 'utf8')

    expect(suggestBox).toContain('search-shortcut-hint')
    expect(suggestBox).toContain('search-inline-anchor')
    expect(suggestBox).toContain('search-inline-query')
    expect(css).toMatch(/\.search-suggest-box\.shortcut-hinting \.suggest-input \{[^}]*padding-right:\s*64px;/s)
    expect(css).toMatch(/\.search-inline-anchor \{[^}]*position: absolute;[^}]*left: 10px;[^}]*right: 96px;/s)
    expect(css).toMatch(/\.search-inline-history \{[^}]*margin-left:\s*2ch;[^}]*color:\s*#7a8b98;[^}]*text-overflow: ellipsis;/s)
    expect(css).not.toMatch(/\.search-inline-history \{[^}]*right: 10px;/s)
    expect(css).not.toMatch(/\.search-suggest-box\.shortcut-hinting \.suggest-input \{[^}]*text-align:\s*right;/s)
    expect(css).not.toMatch(/\.search-suggest-box\.shortcut-hinting \.suggest-input::placeholder \{[^}]*text-align:\s*right;/s)
    expect(css).toMatch(/\.search-shortcut-hint \{[^}]*position: absolute;[^}]*right: 8px;[^}]*max-width: 48px;/s)
  })

  it('floats top-tab shortcut hints from the right edge without widening or covering labels', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/app.css'), 'utf8')
    const tabShell = readFileSync(resolve(process.cwd(), 'src/components/TabShell.vue'), 'utf8')

    expect(tabShell).toContain('tab-shortcut-hint')
    expect(css).toMatch(/\.tab-button \{[^}]*position: relative;/s)
    expect(css).toMatch(/\.tab-button \{[^}]*width:\s*104px;[^}]*flex:\s*0 0 104px;/s)
    expect(css).toMatch(/\.top-tabs \{[^}]*padding:\s*4px 6px;/s)
    expect(css).toMatch(/\.page-grid \{[^}]*gap:\s*1px;[^}]*padding:\s*1px;/s)
    expect(css).not.toMatch(/\.tab-button \{[^}]*justify-content:\s*space-between;/s)
    expect(css).not.toContain('.tab-button.shortcut-hinting span')
    expect(css).toMatch(/\.tab-shortcut-hint \{[^}]*position: absolute;[^}]*right:\s*6px;[^}]*top:\s*50%;[^}]*max-width: 58px;/s)
    expect(css).toMatch(/\.tab-shortcut-hint \{[^}]*transform:\s*translate\(calc\(100% \+ 2px\), -50%\);/s)
    expect(css).not.toMatch(/\.tab-shortcut-hint \{[^}]*left:\s*50%;/s)
  })

  it('keeps feature tabs and port drawers on the light app theme', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/app.css'), 'utf8')

    expect(css).toMatch(/\.top-tabs \{[^}]*background:\s*#eaf2f5;/s)
    expect(css).toMatch(/\.tab-button \{[^}]*background:\s*#f8fbfd;/s)
    expect(css).toMatch(/\.tab-button \{[^}]*color:\s*#172026;/s)
    expect(css).toMatch(/\.tab-shortcut-hint \{[^}]*background:\s*#eef6ff;/s)
    expect(css).toMatch(/\.tab-shortcut-hint \{[^}]*color:\s*#172026;/s)
    expect(css).toMatch(/\.port-detail-drawer,\n\.port-action-drawer \{[^}]*background:\s*#fbfffd;/s)
    expect(css).toMatch(/\.port-detail-drawer,\n\.port-action-drawer \{[^}]*color:\s*#172026;/s)
    expect(css).not.toMatch(/\.top-tabs \{[^}]*background:\s*#101820;/s)
    expect(css).not.toMatch(/\.port-detail-drawer,\n\.port-action-drawer \{[^}]*background:\s*#101820;/s)
  })
})
