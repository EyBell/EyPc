import { describe, expect, it } from 'vitest'
import {
  quickJumpHitStackContainsTarget,
  quickJumpHitTestPoints
} from '../../src/domain/quickJumpHitTest'
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

function elementWithChildren(children: Element[] = []) {
  const element = {
    contains: (node: Node | null) => node === element || children.includes(node as Element)
  }
  return element as unknown as Element
}

describe('quick jump hit testing', () => {
  it('probes the center and inset corners of the visible target rect', () => {
    const points = quickJumpHitTestPoints(rect(10, 20, 40, 20))

    expect(points).toHaveLength(5)
    expect(points[0]).toEqual({ x: 30, y: 30 })
    expect(points).toEqual(expect.arrayContaining([
      { x: 20, y: 25 },
      { x: 40, y: 25 },
      { x: 20, y: 35 },
      { x: 40, y: 35 }
    ]))
  })

  it('keeps a target when the top hit element is the target or its child', () => {
    const child = elementWithChildren()
    const target = elementWithChildren([child])

    expect(quickJumpHitStackContainsTarget(target, [target])).toBe(true)
    expect(quickJumpHitStackContainsTarget(target, [child, target])).toBe(true)
  })

  it('rejects a target when a mask is above it in the hit stack', () => {
    const child = elementWithChildren()
    const target = elementWithChildren([child])
    const mask = elementWithChildren()

    expect(quickJumpHitStackContainsTarget(target, [mask, child, target])).toBe(false)
  })

  it('allows partially visible targets when any probe point hits the target', () => {
    const target = elementWithChildren()
    const mask = elementWithChildren()
    const stacks = [
      [mask, target],
      [mask, target],
      [mask, target],
      [target],
      [mask, target]
    ]

    const visible = quickJumpHitTestPoints(rect(0, 0, 24, 24))
      .some((_point, index) => quickJumpHitStackContainsTarget(target, stacks[index]))

    expect(visible).toBe(true)
  })
})
