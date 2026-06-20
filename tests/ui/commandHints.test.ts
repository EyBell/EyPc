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
    expect(component).toContain('DEFAULT_KEYBINDINGS')
    expect(component).toContain('buildShortcutCommandRows')
    expect(component).toContain('defaultLabel')
    expect(component).toContain('modifierHint')
    expect(component).toContain('Mac|iPhone|iPad|iPod')
    expect(component).toContain('{{ modifierHint }}')
    expect(component).toContain("snapshot.state.activeTab === 'ports'")
    expect(component).toContain("snapshot.state.activeTab === 'favorites'")
    expect(component).not.toContain('snapshot.commandShortcutLabels')
    expect(component).not.toContain('snapshot.message')
    expect(component).not.toContain('snapshot.confirm')
    expect(component).not.toContain('snapshot.portDrawer.active')
    expect(component).not.toContain('snapshot.selectedPortIds.length')
    expect(component).not.toContain('<footer')
    expect(css).toContain('--mouse-tooltip-delay: 100ms')
    expect(css).toContain('.tab-help-popover')
    expect(css).toMatch(/\.tab-help-popover \{[^}]*opacity:\s*0;[^}]*visibility:\s*hidden;[^}]*transition-delay:\s*0ms;/s)
    expect(css).toMatch(/\.tab-help:hover \.tab-help-popover,[\s\S]*\.tab-help:focus-within \.tab-help-popover \{[^}]*transition-delay:\s*var\(--mouse-tooltip-delay\);/s)
    expect(css).not.toMatch(/\.command-hints \{[^}]*position:\s*fixed;/s)
    expect(component).not.toContain("defaultLabel('ports.groups.togglePanel'")
    expect(component).not.toContain('c-1..9')
  })
})
