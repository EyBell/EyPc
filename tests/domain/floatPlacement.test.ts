import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { defaultCodexSettings, normalizeCodexSettings } from '../../src/domain/codex'
const geometry = createRequire(import.meta.url)('../../preload/codex/float-placement.cjs')
const display = { id: 'external', label: 'Studio', scaleFactor: 2, bounds: { x: -1800, y: -240, width: 1800, height: 1200 }, workArea: { x: -1800, y: -215, width: 1800, height: 1120 } }

describe('durable float paint anchor', () => {
  it.each(['left', 'right', 'top', 'bottom'])('keeps %s paint fixed through preview expansion and collapse', (edge) => {
    const anchor = geometry.anchorAt(display, edge, .65)
    const compact = geometry.railLayout(anchor, display, edge)
    const expanded = geometry.railLayout(anchor, display, edge, { width: 360, height: 420 })
    for (const layout of [compact, expanded]) {
      expect({ ...layout.rail, x: layout.bounds.x + layout.rail.x, y: layout.bounds.y + layout.rail.y }).toEqual(anchor)
      expect(Math.min(layout.rail.width, layout.rail.height)).toBe(8)
      expect(Math.max(layout.rail.width, layout.rail.height)).toBe(120)
    }
    expect(expanded.panel.x).toBeGreaterThanOrEqual(0)
    expect(expanded.panel.y).toBeGreaterThanOrEqual(0)
    expect(expanded.panel.x + expanded.panel.width).toBeLessThanOrEqual(expanded.bounds.width)
    expect(expanded.panel.y + expanded.panel.height).toBeLessThanOrEqual(expanded.bounds.height)
    if (edge === 'top') expect(anchor.y).toBe(-240)
    if (edge === 'right') expect(anchor.x + anchor.width).toBe(0)
  })
  it('rotates at the closest edge while preserving the along-edge centre', () => {
    const snapped = geometry.snapAnchor({ x: -900, y: -230, width: 4, height: 120 }, display, 'left')
    expect(snapped.edge).toBe('top')
    expect(snapped.anchor).toEqual({ x: -958, y: -240, width: 120, height: 8 })
  })
  it('borrows deterministically and restores the preferred monitor after scaling and reordering', () => {
    const position = geometry.savePosition(geometry.anchorAt(display, 'bottom', .25), display, 'bottom')
    const borrowed = { id: 'laptop', bounds: { x: 0, y: 0, width: 1440, height: 900 } }
    expect(geometry.resolveDisplay(position, [borrowed], borrowed)).toEqual({ display: borrowed, borrowed: true })
    const resized = { ...display, scaleFactor: 1, bounds: { x: 1440, y: -200, width: 900, height: 600 } }
    expect(geometry.resolveDisplay(position, [borrowed, resized], borrowed)).toEqual({ display: resized, borrowed: false })
    expect(geometry.restoreAnchor(position, resized).anchor).toEqual({ x: 1635, y: 392, width: 120, height: 8 })
    expect(position.displayId).toBe('external')
  })
  it('round trips the new style and normalized anchor without discarding ownership metadata', () => {
    const position = geometry.savePosition(geometry.anchorAt(display, 'left', .75), display, 'left')
    const normalized = normalizeCodexSettings({ ...defaultCodexSettings(), displayStyle: 'edge', position })
    expect(normalized.displayStyle).toBe('edge')
    expect(normalized.position).toEqual(position)
  })
  it('removes both old host and paint insets for legacy water', () => {
    const { anchor } = geometry.restoreAnchor({ displayId: 'external', x: -116, y: 100, edge: 'right' }, display, 'water')
    expect(anchor.x + anchor.width).toBe(0)
    expect(anchor.y).toBe(105)
  })
})


it('uses outward intent near a corner but retains nearest-edge snapping away from it', () => {
  const screen = { bounds: { x: 0, y: 0, width: 1440, height: 900 }, workArea: { x: 0, y: 32, width: 1440, height: 868 } }
  const ball = { x: 1346, y: 37, width: 94, height: 94 }
  expect(geometry.snapAnchor(ball, screen, 'right', 'edge', { dx: 0, dy: -200, topBoundary: 32 }).edge).toBe('top')
  expect(geometry.snapAnchor({ ...ball, y: 200 }, screen, 'right', 'edge', { dx: 0, dy: -200, topBoundary: 32 }).edge).toBe('right')
  expect(geometry.snapAnchor({ ...ball, y: 806 }, screen, 'right', 'edge', { dx: 0, dy: 200 }).edge).toBe('bottom')
})
