import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('port group shift preview style', () => {
  it('uses a readonly group editor preview instead of expanding row actions globally', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/app.css'), 'utf8')
    const component = readFileSync(resolve(process.cwd(), 'src/pages/PortsPage.vue'), 'utf8')

    expect(css).not.toContain('.shift-preview .group-row .group-actions')
    expect(css).not.toContain('.group-row.shift-preview-target .group-actions')
    expect(css).toContain('.group-preview-editor')
    expect(component).toContain('group-preview-editor')
    expect(component).toContain('readonly')
    expect(component).toContain("props.snapshot.activePortPane !== 'groups'")
    expect(component).toContain("props.snapshot.focusedPortGroupTarget?.kind !== 'group'")
    expect(component).not.toContain("props.snapshot.selectedPortGroupTarget?.kind === 'group' ? props.snapshot.selectedPortGroupTarget")
  })

  it('only renders group row focus when the group pane owns logical focus', () => {
    const component = readFileSync(resolve(process.cwd(), 'src/pages/PortsPage.vue'), 'utf8')

    expect(component).toContain('function isGroupRowFocused')
    expect(component).toContain("props.snapshot.activePortPane === 'groups'")
    expect(component).toContain('focused: isGroupRowFocused(row)')
  })
})
