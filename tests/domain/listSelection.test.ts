import { describe, expect, it } from 'vitest'
import { resolveDrawerTargets, toggleIdWithAdvance } from '../../src/domain/listSelection'

describe('listSelection', () => {
  it('toggles membership and advances focus', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const selected = toggleIdWithAdvance({ rows, focusedId: 'a', selectedIds: [], advance: true })
    expect(selected.selectedIds).toEqual(['a'])
    expect(selected.focusedId).toBe('b')
    const deselected = toggleIdWithAdvance({ rows, focusedId: 'a', selectedIds: ['a'], advance: true })
    expect(deselected.selectedIds).toEqual([])
    expect(deselected.focusedId).toBe('b')
  })

  it('does not wrap past the last row', () => {
    const rows = [{ id: 'a' }, { id: 'b' }]
    const next = toggleIdWithAdvance({ rows, focusedId: 'b', selectedIds: [], advance: true })
    expect(next.focusedId).toBe('b')
    expect(next.selectedIds).toEqual(['b'])
  })

  it('resolves single vs multi drawer targets', () => {
    expect(resolveDrawerTargets({ focusedId: 'a', selectedIds: ['a', 'b'] })).toEqual({
      mode: 'multi',
      targetIds: ['a', 'b']
    })
    expect(resolveDrawerTargets({ focusedId: 'c', selectedIds: ['a', 'b'] })).toEqual({
      mode: 'single',
      targetIds: ['c']
    })
    expect(resolveDrawerTargets({ focusedId: 'a', selectedIds: ['a', 'b'], explicitId: 'b' })).toEqual({
      mode: 'single',
      targetIds: ['b']
    })
  })
})
