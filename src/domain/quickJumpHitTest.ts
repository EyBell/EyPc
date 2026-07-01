import type { QuickJumpRect } from './quickJumpLayout'

export interface QuickJumpHitTestPoint {
  x: number
  y: number
}

function uniquePoints(points: QuickJumpHitTestPoint[]) {
  const seen = new Set<string>()
  return points.filter((point) => {
    const key = `${point.x}:${point.y}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function quickJumpHitTestPoints(rect: QuickJumpRect): QuickJumpHitTestPoint[] {
  if (rect.width <= 0 || rect.height <= 0) return []
  const leftInset = rect.left + rect.width * 0.25
  const rightInset = rect.left + rect.width * 0.75
  const topInset = rect.top + rect.height * 0.25
  const bottomInset = rect.top + rect.height * 0.75
  return uniquePoints([
    { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
    { x: leftInset, y: topInset },
    { x: rightInset, y: topInset },
    { x: leftInset, y: bottomInset },
    { x: rightInset, y: bottomInset }
  ])
}

export function quickJumpHitStackContainsTarget(target: Element, stack: readonly Element[]) {
  const topElement = stack[0]
  return Boolean(topElement && (topElement === target || target.contains(topElement)))
}
