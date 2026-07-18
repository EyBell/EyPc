import { describe, expect, it } from 'vitest'
import { layoutQuickJumpMarkers } from '../../src/domain/quickJumpLayout'
import type { QuickJumpRect } from '../../src/domain/quickJumpLayout'

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

describe('quick jump layout', () => {
  it('keeps every marker fixed at its target center without staggering', () => {
    const targetRect = rect(120, 80, 260, 72)
    const items = layoutQuickJumpMarkers([
      { id: 'row', label: 'aa', targetRect },
      { id: 'text', label: 'as', targetRect },
      { id: 'action', label: 'ad', targetRect }
    ])

    expect(items).toHaveLength(3)
    expect(items.every((item) => item.left === 250 && item.top === 116)).toBe(true)
    expect(items.every((item) => item.width === 20 && item.height === 18)).toBe(true)
  })

  it('keeps target alignment independent from marker label width', () => {
    const targetRect = rect(40, 30, 100, 40)
    const [single, multiple] = layoutQuickJumpMarkers([
      { id: 'single', label: 'a', targetRect },
      { id: 'multiple', label: 'asdf', targetRect }
    ])

    expect(single).toMatchObject({ left: 90, top: 50, width: 18, height: 18 })
    expect(multiple).toMatchObject({ left: 90, top: 50, width: 36, height: 18 })
  })

  it('does not clamp target-centered markers at viewport edges', () => {
    const [item] = layoutQuickJumpMarkers([
      { id: 'edge', label: 'aa', targetRect: rect(-30, -20, 20, 10) }
    ])

    expect(item).toMatchObject({ left: -20, top: -15, width: 20, height: 18 })
  })
})
