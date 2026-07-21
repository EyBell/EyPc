import { describe, expect, it } from 'vitest'
import { clampFloatBounds, isFloatDrag, nearestFloatEdge, snapFloatBounds } from '../../src/domain/floatWindow'

describe('Codex float window geometry', () => {
  const workArea = { x: -1920, y: -120, width: 1920, height: 1080 }

  it('clamps saved positions into a monitor work area with negative coordinates', () => {
    expect(clampFloatBounds({ x: -2500, y: -500, width: 104, height: 104 }, workArea)).toEqual({
      x: -1908,
      y: -108,
      width: 104,
      height: 104
    })
  })

  it('snaps to the nearest edge and preserves its display-relative bounds', () => {
    const result = snapFloatBounds({ x: -125, y: 300, width: 104, height: 104 }, workArea)
    expect(result.edge).toBe('right')
    expect(result.bounds.x).toBe(-116)
    expect(nearestFloatEdge(result.bounds, workArea)).toBe('right')
  })

  it('separates a click from a drag at the configured threshold', () => {
    expect(isFloatDrag(10, 10, 13, 13)).toBe(false)
    expect(isFloatDrag(10, 10, 13, 14)).toBe(true)
  })

  it('fits inside work areas smaller than the normal minimum and drops the margin', () => {
    expect(clampFloatBounds({ x: 999, y: 999, width: 104, height: 104 }, { x: 10, y: 20, width: 60, height: 50 })).toEqual({
      x: 10,
      y: 20,
      width: 60,
      height: 50
    })
  })
})
