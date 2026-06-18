import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('command help hints', () => {
  it('renders shortcut hints from the top-right help trigger instead of a fixed footer', () => {
    const app = readFileSync(resolve(process.cwd(), 'src/App.vue'), 'utf8')
    const component = readFileSync(resolve(process.cwd(), 'src/components/CommandHints.vue'), 'utf8')
    const tabShell = readFileSync(resolve(process.cwd(), 'src/components/TabShell.vue'), 'utf8')
    const css = readFileSync(resolve(process.cwd(), 'src/styles/app.css'), 'utf8')

    expect(app).not.toContain('<CommandHints')
    expect(tabShell).toContain('tab-help-trigger')
    expect(tabShell).toContain('CommandHints')
    expect(component).toContain('modifierHint')
    expect(component).toContain('Mac|iPhone|iPad|iPod')
    expect(component).toContain('{{ modifierHint }}')
    expect(component).not.toContain('<footer')
    expect(css).toContain('.tab-help-popover')
    expect(css).not.toMatch(/\.command-hints \{[^}]*position:\s*fixed;/s)
    expect(component).not.toContain("label('ports.groups.togglePanel'")
    expect(component).not.toContain("label('ports.search.focus'")
    expect(component).not.toContain("label('ports.groupSearch.focus'")
    expect(component).not.toContain("label('ports.detail.open'")
    expect(component).not.toContain("label('ports.drawer.open'")
    expect(component).not.toContain("label('ports.kill.force'")
    expect(component).not.toContain("label('ports.group.focusMatches'")
    expect(component).not.toContain('c-1..9')
    expect(component).not.toContain('c-cr')
  })
})
