import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('port group selection rail style', () => {
  it('only paints the left group color rail for highlighted group rows', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/app.css'), 'utf8')

    const groupRowRule = css.match(/\.group-row \{[^}]*\}/s)?.[0] || ''
    const childRowRule = css.match(/\.group-row\.child \{[^}]*\}/s)?.[0] || ''
    const groupActionsRule = css.match(/\.group-actions \{[^}]*\}/s)?.[0] || ''
    const groupActionsVisibleRule = css.match(/\.group-row:hover \.group-actions,[\s\S]*?\.group-row:focus-within \.group-actions \{[^}]*\}/s)?.[0] || ''
    const groupActionButtonRule = css.match(/\.group-actions button \{[^}]*\}/s)?.[0] || ''

    expect(groupRowRule).not.toMatch(/border-left:\s*[^;]+var\(--group-color\)/)
    expect(childRowRule).not.toMatch(/border-left-width:/)
    expect(css).not.toContain('.group-row.child::before')
    expect(css).toMatch(/\.group-row\.(?:focused|selected)::before[\s\S]*background:\s*var\(--group-color\)/)
    expect(css).toMatch(/\.group-row\.focused \{[\s\S]*background:\s*#e6f7f1;/)
    expect(css).toMatch(/\.group-row\.selected \{[\s\S]*background:\s*#dff4ec;/)
    expect(groupActionsRule).toMatch(/display:\s*inline-flex;/)
    expect(groupActionsRule).toMatch(/position:\s*absolute;/)
    expect(groupActionsRule).toMatch(/right:\s*8px;/)
    expect(groupActionsRule).toMatch(/bottom:\s*7px;/)
    expect(groupActionsRule).not.toMatch(/display:\s*none;/)
    expect(groupActionsVisibleRule).not.toMatch(/display:/)
    expect(groupActionButtonRule).toMatch(/grid-template-columns:\s*auto auto;/)
    expect(groupActionButtonRule).toMatch(/height:\s*20px;/)
    expect(groupActionButtonRule).toMatch(/padding:\s*1px 4px;/)
  })
})
