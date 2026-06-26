export interface QuickJumpRect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export interface QuickJumpLayoutAnchor {
  id: string
  label: string
  targetRect: QuickJumpRect
  anchorRect?: QuickJumpRect | null
}

export interface QuickJumpLayoutItem {
  id: string
  label: string
  left: number
  top: number
  width: number
  height: number
}

export interface QuickJumpLayoutOptions {
  viewportWidth: number
  viewportHeight: number
  margin?: number
  badgeHeight?: number
  minBadgeWidth?: number
  charWidth?: number
  textPadding?: number
  targetPadding?: number
  yOffset?: number
  anchorGap?: number
  collisionGap?: number
}

interface LayoutBox {
  left: number
  top: number
  right: number
  bottom: number
}

interface LayoutPoint {
  left: number
  top: number
  weight: number
}

const DEFAULT_LAYOUT_OPTIONS = {
  margin: 8,
  badgeHeight: 18,
  minBadgeWidth: 18,
  charWidth: 8,
  textPadding: 4,
  targetPadding: 8,
  yOffset: -7,
  anchorGap: 6,
  collisionGap: 4
}

function layoutOptions(options: QuickJumpLayoutOptions) {
  return {
    ...DEFAULT_LAYOUT_OPTIONS,
    ...options
  }
}

function clamp(value: number, min: number, max: number) {
  if (max < min) return min
  return Math.min(Math.max(value, min), max)
}

function badgeWidth(label: string, options: ReturnType<typeof layoutOptions>) {
  return Math.max(options.minBadgeWidth, Math.ceil(label.length * options.charWidth + options.textPadding))
}

function pointFromVisualCenter(x: number, y: number, weight: number, options: ReturnType<typeof layoutOptions>): LayoutPoint {
  return {
    left: x,
    top: y - options.yOffset,
    weight
  }
}

function visualBox(point: LayoutPoint, width: number, options: ReturnType<typeof layoutOptions>): LayoutBox {
  const centerY = point.top + options.yOffset
  return {
    left: point.left - width / 2,
    top: centerY - options.badgeHeight / 2,
    right: point.left + width / 2,
    bottom: centerY + options.badgeHeight / 2
  }
}

function clampPoint(point: LayoutPoint, width: number, options: ReturnType<typeof layoutOptions>): LayoutPoint {
  const halfWidth = width / 2
  const halfHeight = options.badgeHeight / 2
  return {
    ...point,
    left: clamp(point.left, options.margin + halfWidth, options.viewportWidth - options.margin - halfWidth),
    top: clamp(
      point.top,
      options.margin + halfHeight - options.yOffset,
      options.viewportHeight - options.margin - halfHeight - options.yOffset
    )
  }
}

function expandBox(box: LayoutBox, gap: number): LayoutBox {
  return {
    left: box.left - gap,
    top: box.top - gap,
    right: box.right + gap,
    bottom: box.bottom + gap
  }
}

function overlapArea(a: LayoutBox, b: LayoutBox) {
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
  return width * height
}

function collisionScore(box: LayoutBox, placedBoxes: LayoutBox[], options: ReturnType<typeof layoutOptions>) {
  const candidate = expandBox(box, options.collisionGap)
  return placedBoxes.reduce((score, placed) => score + overlapArea(candidate, expandBox(placed, options.collisionGap)), 0)
}

function targetInnerPoints(rect: QuickJumpRect, width: number, options: ReturnType<typeof layoutOptions>): LayoutPoint[] {
  if (rect.width < width + options.targetPadding * 2 || rect.height < options.badgeHeight + options.targetPadding * 2) {
    return []
  }

  const halfWidth = width / 2
  const halfHeight = options.badgeHeight / 2
  const left = rect.left + options.targetPadding + halfWidth
  const centerX = rect.left + rect.width / 2
  const right = rect.right - options.targetPadding - halfWidth
  const top = rect.top + options.targetPadding + halfHeight
  const centerY = rect.top + rect.height / 2
  const bottom = rect.bottom - options.targetPadding - halfHeight

  return [
    pointFromVisualCenter(right, top, 0, options),
    pointFromVisualCenter(left, top, 1, options),
    pointFromVisualCenter(centerX, top, 2, options),
    pointFromVisualCenter(right, centerY, 3, options),
    pointFromVisualCenter(left, centerY, 4, options),
    pointFromVisualCenter(centerX, centerY, 5, options),
    pointFromVisualCenter(right, bottom, 6, options),
    pointFromVisualCenter(left, bottom, 7, options),
    pointFromVisualCenter(centerX, bottom, 8, options)
  ]
}

function markerCandidates(anchor: QuickJumpLayoutAnchor, width: number, options: ReturnType<typeof layoutOptions>): LayoutPoint[] {
  const candidates: LayoutPoint[] = []
  const anchorRect = anchor.anchorRect
  if (anchorRect && anchorRect.width > 0 && anchorRect.height > 0) {
    candidates.push(pointFromVisualCenter(
      anchorRect.right + options.anchorGap + width / 2,
      anchorRect.top + anchorRect.height / 2,
      0,
      options
    ))
    candidates.push(pointFromVisualCenter(
      anchorRect.left - options.anchorGap - width / 2,
      anchorRect.top + anchorRect.height / 2,
      1,
      options
    ))
  }

  candidates.push(...targetInnerPoints(anchor.targetRect, width, options))
  candidates.push({
    left: anchor.targetRect.left + anchor.targetRect.width / 2,
    top: anchor.targetRect.top + anchor.targetRect.height / 2,
    weight: 20
  })
  return candidates.map((point) => clampPoint(point, width, options))
}

export function layoutQuickJumpMarkers(anchors: readonly QuickJumpLayoutAnchor[], optionsInput: QuickJumpLayoutOptions): QuickJumpLayoutItem[] {
  const options = layoutOptions(optionsInput)
  const placedBoxes: LayoutBox[] = []

  return anchors.map((anchor) => {
    const width = badgeWidth(anchor.label, options)
    const candidates = markerCandidates(anchor, width, options)
    const selected = candidates
      .map((point) => {
        const box = visualBox(point, width, options)
        return {
          point,
          box,
          score: collisionScore(box, placedBoxes, options) + point.weight
        }
      })
      .sort((a, b) => a.score - b.score)[0]
    placedBoxes.push(selected.box)

    return {
      id: anchor.id,
      label: anchor.label,
      left: selected.point.left,
      top: selected.point.top,
      width,
      height: options.badgeHeight
    }
  })
}
