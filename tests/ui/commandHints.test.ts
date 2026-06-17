import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('command footer hints', () => {
  it('summarizes Ctrl/Command shortcuts instead of listing c-prefixed bindings', () => {
    const component = readFileSync(resolve(process.cwd(), 'src/components/CommandHints.vue'), 'utf8')

    expect(component).toContain('modifierHint')
    expect(component).toContain('Mac|iPhone|iPad|iPod')
    expect(component).toContain('{{ modifierHint }}')
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
