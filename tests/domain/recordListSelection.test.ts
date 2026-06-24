import { describe, expect, it } from 'vitest'
import {
  applyRecordListDeleteRecovery,
  computeRecordListDeleteAnchor,
  toggleRecordListSelection
} from '../../src/domain/recordListSelection'

const rows = ['a', 'b', 'c', 'd'].map((id) => ({ id }))

describe('record list selection helpers', () => {
  it('moves highlight down after selecting the current row by keyboard', () => {
    expect(toggleRecordListSelection({
      rows,
      activeIndex: 1,
      selectedIds: []
    })).toEqual({
      activeIndex: 2,
      selectedIds: ['b']
    })
  })

  it('keeps highlight in place when unselecting the current row', () => {
    expect(toggleRecordListSelection({
      rows,
      activeIndex: 1,
      selectedIds: ['b', 'c']
    })).toEqual({
      activeIndex: 1,
      selectedIds: ['c']
    })
  })

  it('recovers deletion highlight to the first retained row below the deleted region', () => {
    const anchor = computeRecordListDeleteAnchor({
      rows,
      activeIndex: 1,
      selectedIds: ['b', 'c'],
      deleteIds: ['b', 'c']
    })
    const nextRows = ['a', 'd'].map((id) => ({ id }))

    expect(anchor).toEqual({
      anchorIndex: 2,
      preferItemId: 'd',
      selectedIds: []
    })
    expect(applyRecordListDeleteRecovery(nextRows, anchor)).toEqual({
      activeIndex: 1,
      activeId: 'd'
    })
  })

  it('recovers deletion highlight upward when deleting the list tail', () => {
    const anchor = computeRecordListDeleteAnchor({
      rows,
      activeIndex: 3,
      selectedIds: [],
      deleteIds: ['d']
    })
    const nextRows = ['a', 'b', 'c'].map((id) => ({ id }))

    expect(anchor).toEqual({
      anchorIndex: 3,
      preferItemId: 'c',
      selectedIds: []
    })
    expect(applyRecordListDeleteRecovery(nextRows, anchor)).toEqual({
      activeIndex: 2,
      activeId: 'c'
    })
  })
})
