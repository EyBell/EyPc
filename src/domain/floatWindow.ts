export interface FloatBounds {
  x: number
  y: number
  width: number
  height: number
}

export type FloatEdge = 'left' | 'right' | 'top' | 'bottom'

export function clampFloatBounds(bounds: FloatBounds, workArea: FloatBounds, margin = 12): FloatBounds {
  const areaWidth = Math.max(1, Math.round(workArea.width))
  const areaHeight = Math.max(1, Math.round(workArea.height))
  const marginX = areaWidth >= 72 + margin * 2 ? margin : 0
  const marginY = areaHeight >= 72 + margin * 2 ? margin : 0
  const requestedWidth = Number.isFinite(bounds.width) ? Math.round(bounds.width) : 72
  const requestedHeight = Number.isFinite(bounds.height) ? Math.round(bounds.height) : 72
  const width = Math.max(1, Math.min(Math.max(72, requestedWidth), areaWidth - marginX * 2))
  const height = Math.max(1, Math.min(Math.max(72, requestedHeight), areaHeight - marginY * 2))
  const minX = workArea.x + marginX
  const minY = workArea.y + marginY
  const maxX = workArea.x + areaWidth - width - marginX
  const maxY = workArea.y + areaHeight - height - marginY
  const requestedX = Number.isFinite(bounds.x) ? Math.round(bounds.x) : minX
  const requestedY = Number.isFinite(bounds.y) ? Math.round(bounds.y) : minY
  return {
    x: Math.min(maxX, Math.max(minX, requestedX)),
    y: Math.min(maxY, Math.max(minY, requestedY)),
    width,
    height
  }
}

export function nearestFloatEdge(bounds: FloatBounds, workArea: FloatBounds): FloatEdge {
  const distances: Array<[FloatEdge, number]> = [
    ['left', Math.abs(bounds.x - workArea.x)],
    ['right', Math.abs(workArea.x + workArea.width - (bounds.x + bounds.width))],
    ['top', Math.abs(bounds.y - workArea.y)],
    ['bottom', Math.abs(workArea.y + workArea.height - (bounds.y + bounds.height))]
  ]
  return distances.sort((a, b) => a[1] - b[1])[0][0]
}

export function snapFloatBounds(bounds: FloatBounds, workArea: FloatBounds, margin = 12): { bounds: FloatBounds; edge: FloatEdge } {
  const clamped = clampFloatBounds(bounds, workArea, margin)
  const edge = nearestFloatEdge(clamped, workArea)
  const snapped = { ...clamped }
  const marginX = workArea.width >= 72 + margin * 2 ? margin : 0
  const marginY = workArea.height >= 72 + margin * 2 ? margin : 0
  if (edge === 'left') snapped.x = workArea.x + marginX
  if (edge === 'right') snapped.x = workArea.x + workArea.width - snapped.width - marginX
  if (edge === 'top') snapped.y = workArea.y + marginY
  if (edge === 'bottom') snapped.y = workArea.y + workArea.height - snapped.height - marginY
  return { bounds: snapped, edge }
}

export function isFloatDrag(startX: number, startY: number, currentX: number, currentY: number, threshold = 5): boolean {
  return Math.hypot(currentX - startX, currentY - startY) >= threshold
}
