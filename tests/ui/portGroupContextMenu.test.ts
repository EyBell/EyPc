import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('port group context menu', () => {
  it('opens the command-backed drawer from right-click on group and folder rows', () => {
    const component = readFileSync(resolve(process.cwd(), 'src/pages/PortsPage.vue'), 'utf8')

    expect(component).toContain('function openGroupContextMenu')
    expect(component).toContain('@contextmenu.prevent="openGroupContextMenu(row.target)"')
    expect(component).toContain("emit('dispatch', 'ports.groupTarget.focus', targetArgs(target))")
    expect(component).toContain("emit('dispatch', 'ports.drawer.open')")
    expect(component).toContain('folder-row-line')
    expect(component).toContain("focusGroupRow(row.target); emit('dispatch', 'ports.drawer.open')")
  })

  it('labels folder rename drafts as folder rename dialogs', () => {
    const component = readFileSync(resolve(process.cwd(), 'src/pages/PortsPage.vue'), 'utf8')

    expect(component).toContain('function groupEditorTitle')
    expect(component).toContain("draft.mode === 'create' ? '新增分组夹' : '重命名分组夹'")
    expect(component).toContain('新增分组夹')
    expect(component).toContain('重命名分组夹')
    expect(component).toContain('{{ groupEditorTitle() }}')
  })

  it('selects text when port group editor fields receive command focus', () => {
    const component = readFileSync(resolve(process.cwd(), 'src/pages/PortsPage.vue'), 'utf8')

    expect(component).toContain('function focusActiveGroupDraftField')
    expect(component).toContain("props.snapshot.portGroupDraft ? `${props.snapshot.portGroupDraft.mode}:${props.snapshot.portGroupDraft.target?.kind || 'new'}:${props.snapshot.portGroupDraft.target?.id || 'new'}` : ''")
    expect(component).toContain('const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>')
    expect(component).toContain('input?.focus()')
    expect(component).toContain('input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement')
  })

  it('renders a folder-only group move editor and clears folder selection with delete keys', () => {
    const component = readFileSync(resolve(process.cwd(), 'src/pages/PortsPage.vue'), 'utf8')

    expect(component).toContain("draft.mode === 'move-folder' ? '变更分组夹' :")
    expect(component).toContain("props.snapshot.portGroupDraft.mode === 'move-folder'")
    expect(component).toContain('function clearGroupDraftFolder')
    expect(component).toContain('@keydown.delete.prevent="clearGroupDraftFolder"')
    expect(component).toContain('@keydown.backspace.prevent="clearGroupDraftFolder"')
  })

  it('uses a dedicated amplified icon for the group panel toggle', () => {
    const component = readFileSync(resolve(process.cwd(), 'src/pages/PortsPage.vue'), 'utf8')
    const css = readFileSync(resolve(process.cwd(), 'src/styles/app.css'), 'utf8')

    expect(component).toContain('group-panel-toggle-icon')
    expect(component).not.toContain('>\n      ›\n    </button>')
    expect(component).not.toContain('>\n          ‹\n        </button>')
    expect(css).toMatch(/\.group-panel-toggle \{[^}]*width:\s*36px;[^}]*height:\s*36px;/s)
    expect(css).toContain('.group-panel-toggle-icon::before')
    expect(css).toContain('.group-panel-toggle-icon::after')
    expect(css).toContain('.group-panel-toggle-inline .group-panel-toggle-icon')
  })
})
