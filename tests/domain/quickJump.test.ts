import { describe, expect, it } from 'vitest'
import {
  assignQuickJumpMarkers,
  filterQuickJumpTargets,
  moveQuickJumpActive,
  resolveQuickJumpQuery
} from '../../src/domain/quickJump'

function hasPrefixCollision(markers: string[]) {
  return markers.some((marker, index) => markers.some((other, otherIndex) => index !== otherIndex && other.startsWith(marker)))
}

describe('quick jump domain', () => {
  it('assigns prefix-free vim-style markers without using the trigger key', () => {
    const targets = Array.from({ length: 60 }, (_, index) => ({ id: `target-${index}`, label: `Target ${index}` }))
    const marked = assignQuickJumpMarkers(targets)
    const markers = marked.map((target) => target.marker)

    expect(new Set(markers).size).toBe(targets.length)
    expect(hasPrefixCollision(markers)).toBe(false)
    expect(markers).not.toContain('f')
    expect(markers.every((marker) => /^[a-z]+$/.test(marker))).toBe(true)
  })

  it('filters by visible label or extra search text and reassigns markers to the filtered list', () => {
    const targets = [
      { id: 'open', label: '打开收藏', searchText: 'favorite open' },
      { id: 'copy', label: '复制路径', searchText: 'copy path' },
      { id: 'delete', label: '移出收藏', searchText: 'remove delete' }
    ]

    expect(filterQuickJumpTargets(targets, 'copy')).toMatchObject([{ id: 'copy', marker: 'a' }])
    expect(filterQuickJumpTargets(targets, '收藏').map((target) => target.id)).toEqual(['open', 'delete'])
  })

  it('treats marker prefixes before falling back to text search', () => {
    const marked = assignQuickJumpMarkers(Array.from({ length: 30 }, (_, index) => ({ id: `target-${index}`, label: `Target ${index}` })))

    const prefix = resolveQuickJumpQuery(marked, 'a')
    expect(prefix.mode).toBe('marker')
    expect(prefix.exactTargetId).toBeNull()
    expect(prefix.targets.length).toBeGreaterThan(1)

    const exact = resolveQuickJumpQuery(marked, marked[0].marker)
    expect(exact.mode).toBe('marker')
    expect(exact.exactTargetId).toBe(marked[0].id)
  })

  it('shows only the unresolved marker suffix after a multi-letter marker prefix', () => {
    const marked = assignQuickJumpMarkers(Array.from({ length: 30 }, (_, index) => ({ id: `target-${index}`, label: `Target ${index}` })))

    const prefix = resolveQuickJumpQuery(marked, 'a')

    expect(prefix.targets.slice(0, 3).map((target) => [target.marker, target.displayMarker])).toEqual([
      ['aa', 'a'],
      ['as', 's'],
      ['ad', 'd']
    ])
    expect(prefix.targets.every((target) => target.marker.startsWith(prefix.query))).toBe(true)
  })

  it('wraps active target movement in the current filtered list', () => {
    const targets = assignQuickJumpMarkers([
      { id: 'first', label: 'First' },
      { id: 'second', label: 'Second' },
      { id: 'third', label: 'Third' }
    ])

    expect(moveQuickJumpActive(targets, 'first', -1)).toBe('third')
    expect(moveQuickJumpActive(targets, 'third', 1)).toBe('first')
    expect(moveQuickJumpActive(targets, null, 1)).toBe('first')
  })
})
