import { describe, expect, it } from 'vitest'
import { defaultCodexSettings } from '../../src/domain/codex'
import { CodexAppearanceSession } from '../../src/domain/codexAppearanceSession'

describe('appearance edit session', () => {
  it('restores only edited fields and preserves unrelated concurrent changes', () => {
    const start = defaultCodexSettings()
    const session = new CodexAppearanceSession()
    const next = { ...start.colors, water: '#123456' }
    session.record(start, { colors: next })
    const current = { ...start, colors: { ...next, warning: '#654321' } }
    const result = session.restore(current)
    expect(result.conflicts).toEqual([])
    expect(result.patch.colors).toMatchObject({ water: start.colors.water, warning: '#654321' })
  })

  it('does not overwrite a newer value written through another entry', () => {
    const start = defaultCodexSettings()
    const session = new CodexAppearanceSession()
    session.record(start, { colors: { ...start.colors, water: '#123456' } })
    const result = session.restore({ ...start, colors: { ...start.colors, water: '#ABCDEF' } })
    expect(result.conflicts).toEqual(['colors.water'])
    expect(result.patch.colors).toBeUndefined()
  })

  it('retains the original baseline across rapid writes and clears a reverted edit', () => {
    const start = defaultCodexSettings()
    const session = new CodexAppearanceSession()
    session.record(start, { colors: { ...start.colors, water: '#123456' } })
    session.record(start, { colors: { ...start.colors, water: '#234567' } })
    expect(session.restore({ ...start, colors: { ...start.colors, water: '#234567' } }).patch.colors?.water).toBe(start.colors.water)
    session.record({ ...start, colors: { ...start.colors, water: '#234567' } }, { colors: start.colors })
    expect(session.dirty).toBe(false)
  })

  it('tracks component labels but leaves independent display style untouched', () => {
    const start = defaultCodexSettings()
    const session = new CodexAppearanceSession()
    session.record(start, { displayStyle: 'card', magpieQuotaGridCursorPrimaryLabel: 'Q' })
    const result = session.restore({ ...start, displayStyle: 'card', magpieQuotaGridCursorPrimaryLabel: 'Q' })
    expect(result.patch.displayStyle).toBeUndefined()
    expect(result.patch.magpieQuotaGridCursorPrimaryLabel).toBe(start.magpieQuotaGridCursorPrimaryLabel)
  })
})
