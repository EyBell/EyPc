import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('port group context menu', () => {
  it('opens the command-backed drawer from right-click on group and folder rows', () => {
    const component = readFileSync(resolve(process.cwd(), 'src/pages/PortsPage.vue'), 'utf8')

    expect(component).toContain('function openGroupContextMenu')
    expect(component).toContain('@contextmenu.prevent="openGroupContextMenu(row.target)"')
    expect(component).toContain("emit('focusGroupTarget', target)")
    expect(component).toContain("emit('dispatch', 'ports.drawer.open')")
  })

  it('labels folder rename drafts as folder rename dialogs', () => {
    const component = readFileSync(resolve(process.cwd(), 'src/pages/PortsPage.vue'), 'utf8')

    expect(component).toContain('function groupEditorTitle')
    expect(component).toContain('重命名分组夹')
    expect(component).toContain('{{ groupEditorTitle() }}')
  })
})
