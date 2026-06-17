import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('port search shortcut hints', () => {
  it('shows Ctrl-based shortcuts for both port search boxes only while shortcut hints are visible', () => {
    const app = readFileSync(resolve(process.cwd(), 'src/App.vue'), 'utf8')
    const portsPage = readFileSync(resolve(process.cwd(), 'src/pages/PortsPage.vue'), 'utf8')
    const suggestBox = readFileSync(resolve(process.cwd(), 'src/components/SearchSuggestBox.vue'), 'utf8')

    expect(app).toContain(':show-shortcut-hints="shortcutHints"')
    expect(portsPage).toContain('showShortcutHints?: boolean')
    expect(portsPage).toContain("ctrlCommandLabel('ports.search.focus')")
    expect(portsPage).toContain("ctrlCommandLabel('ports.groupSearch.focus')")
    expect(portsPage).toContain(".filter((label) => label.startsWith('c-'))")
    expect(suggestBox).toContain('shortcutHint?: string')
    expect(suggestBox).toContain('search-shortcut-hint')
  })
})
