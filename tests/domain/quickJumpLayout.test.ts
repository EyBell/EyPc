import { describe, expect, it } from 'vitest'
import { layoutQuickJumpMarkers } from '../../src/domain/quickJumpLayout'
import type { QuickJumpLayoutItem, QuickJumpRect } from '../../src/domain/quickJumpLayout'

function rect(left: number, top: number, width: number, height: number): QuickJumpRect {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height
  }
}

function visualBox(item: QuickJumpLayoutItem) {
  const centerY = item.top - 7
  return {
    left: item.left - item.width / 2,
    top: centerY - item.height / 2,
    right: item.left + item.width / 2,
    bottom: centerY + item.height / 2
  }
}

function overlaps(a: ReturnType<typeof visualBox>, b: ReturnType<typeof visualBox>) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

describe('quick jump layout', () => {
  it('prefers target edges and avoids overlapping badges', () => {
    const targetRect = rect(120, 80, 260, 72)
    const items = layoutQuickJumpMarkers([
      { id: 'row', label: 'aa', targetRect },
      { id: 'text', label: 'as', targetRect },
      { id: 'action', label: 'ad', targetRect }
    ], {
      viewportWidth: 640,
      viewportHeight: 360
    })

    expect(items).toHaveLength(3)
    expect(items.every((item) => {
      const box = visualBox(item)
      return box.left >= 8 && box.right <= 632 && box.top >= 8 && box.bottom <= 352
    })).toBe(true)
    expect(items.every((item) => {
      const box = visualBox(item)
      return box.bottom <= targetRect.top || box.top >= targetRect.bottom || box.right <= targetRect.left || box.left >= targetRect.right
    })).toBe(true)
    expect(overlaps(visualBox(items[0]), visualBox(items[1]))).toBe(false)
    expect(overlaps(visualBox(items[0]), visualBox(items[2]))).toBe(false)
    expect(overlaps(visualBox(items[1]), visualBox(items[2]))).toBe(false)
  })

  it('clamps small target badges inside the viewport', () => {
    const [item] = layoutQuickJumpMarkers([
      { id: 'edge', label: 'aa', targetRect: rect(1, 1, 18, 18) }
    ], {
      viewportWidth: 80,
      viewportHeight: 48
    })

    const box = visualBox(item)
    expect(box.left).toBeGreaterThanOrEqual(8)
    expect(box.top).toBeGreaterThanOrEqual(8)
    expect(box.right).toBeLessThanOrEqual(72)
    expect(box.bottom).toBeLessThanOrEqual(40)
  })
})
