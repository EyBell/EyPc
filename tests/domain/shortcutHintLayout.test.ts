import { describe, expect, it } from 'vitest'
import { layoutShortcutHints } from '../../src/domain/shortcutHintLayout'

function overlaps(a: { left: number; top: number; width: number; height: number }, b: { left: number; top: number; width: number; height: number }) {
  return a.left < b.left + b.width
    && a.left + a.width > b.left
    && a.top < b.top + b.height
    && a.top + a.height > b.top
}

describe('shortcut hint layout', () => {
  it('staggers nearby hints so they do not overlap each other', () => {
    const items = layoutShortcutHints([
      { id: 'favorite', label: 'c-d', rect: { left: 930, top: 462, width: 28, height: 28 } },
      { id: 'copy-topic', label: 'c-s-c', rect: { left: 958, top: 462, width: 28, height: 28 } },
      { id: 'copy-payload', label: 'c-c', rect: { left: 986, top: 462, width: 28, height: 28 } },
      { id: 'send', label: 'c-cr', rect: { left: 1014, top: 462, width: 28, height: 28 } }
    ], { width: 1200, height: 760 })

    expect(new Set(items.map((item) => item.top)).size).toBeGreaterThan(1)
    for (let index = 0; index < items.length; index += 1) {
      for (let next = index + 1; next < items.length; next += 1) {
        expect(overlaps(items[index], items[next])).toBe(false)
      }
    }
  })

  it('shifts hints fully inside viewport edges', () => {
    const [rightEdge, bottomEdge] = layoutShortcutHints([
      { id: 'right', label: 'c-s-1', rect: { left: 1178, top: 12, width: 28, height: 28 } },
      { id: 'bottom', label: 'c-cr', rect: { left: 620, top: 742, width: 28, height: 28 } }
    ], { width: 1200, height: 760 })

    expect(rightEdge.left).toBeGreaterThanOrEqual(8)
    expect(rightEdge.left + rightEdge.width).toBeLessThanOrEqual(1192)
    expect(bottomEdge.top).toBeGreaterThanOrEqual(8)
    expect(bottomEdge.top + bottomEdge.height).toBeLessThanOrEqual(752)
    expect(bottomEdge.placement).toBe('above')
  })
})
