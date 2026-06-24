export type ShortcutHintPlacement = 'above' | 'below'

export interface ShortcutHintRect {
  left: number
  top: number
  width: number
  height: number
}

export interface ShortcutHintAnchor {
  id: string
  label: string
  rect: ShortcutHintRect
}

export interface ShortcutHintViewport {
  width: number
  height: number
}

export interface ShortcutHintLayoutOptions {
  margin?: number
  gap?: number
  minWidth?: number
  maxWidth?: number
  height?: number
  charWidth?: number
  collisionGap?: number
}

export interface ShortcutHintLayoutItem extends ShortcutHintRect {
  id: string
  label: string
  placement: ShortcutHintPlacement
}

const DEFAULT_OPTIONS: Required<ShortcutHintLayoutOptions> = {
  margin: 8,
  gap: 6,
  minWidth: 44,
  maxWidth: 220,
  height: 22,
  charWidth: 8,
  collisionGap: 4
}

function clamp(value: number, min: number, max: number) {
  if (max < min) return min
  return Math.min(max, Math.max(min, value))
}

function hintWidth(label: string, options: Required<ShortcutHintLayoutOptions>) {
  return Math.min(options.maxWidth, Math.max(options.minWidth, label.length * options.charWidth + 16))
}

function overlaps(a: ShortcutHintRect, b: ShortcutHintRect, gap: number) {
  return a.left < b.left + b.width + gap
    && a.left + a.width + gap > b.left
    && a.top < b.top + b.height + gap
    && a.top + a.height + gap > b.top
}

function buildCandidate(
  anchor: ShortcutHintAnchor,
  viewport: ShortcutHintViewport,
  options: Required<ShortcutHintLayoutOptions>,
  placement: ShortcutHintPlacement,
  lane: number,
  xOffset: number
): ShortcutHintLayoutItem {
  const width = hintWidth(anchor.label, options)
  const height = options.height
  const center = anchor.rect.left + anchor.rect.width / 2 + xOffset
  const left = clamp(center - width / 2, options.margin, viewport.width - options.margin - width)
  const laneOffset = lane * (height + options.gap)
  const rawTop = placement === 'above'
    ? anchor.rect.top - options.gap - height - laneOffset
    : anchor.rect.top + anchor.rect.height + options.gap + laneOffset
  const top = clamp(rawTop, options.margin, viewport.height - options.margin - height)
  return { id: anchor.id, label: anchor.label, placement, left, top, width, height }
}

function candidateScore(candidate: ShortcutHintLayoutItem, placed: ShortcutHintLayoutItem[], anchor: ShortcutHintAnchor, options: Required<ShortcutHintLayoutOptions>) {
  return placed.reduce((score, item) => score + (overlaps(candidate, item, options.collisionGap) ? 1000 : 0), 0)
    + (overlaps(candidate, anchor.rect, 1) ? 500 : 0)
}

export function layoutShortcutHints(
  anchors: ShortcutHintAnchor[],
  viewport: ShortcutHintViewport,
  inputOptions: ShortcutHintLayoutOptions = {}
): ShortcutHintLayoutItem[] {
  const options = { ...DEFAULT_OPTIONS, ...inputOptions }
  const placed: ShortcutHintLayoutItem[] = []

  for (const anchor of anchors) {
    if (!anchor.label.trim() || anchor.rect.width <= 0 || anchor.rect.height <= 0) continue
    const spaceAbove = anchor.rect.top - options.margin
    const spaceBelow = viewport.height - options.margin - (anchor.rect.top + anchor.rect.height)
    const placements: ShortcutHintPlacement[] = spaceAbove >= options.height + options.gap || spaceAbove >= spaceBelow
      ? ['above', 'below']
      : ['below', 'above']
    const width = hintWidth(anchor.label, options)
    const xOffsets = [0, -width * 0.45, width * 0.45, -width * 0.9, width * 0.9]
    let fallback: ShortcutHintLayoutItem | null = null
    let fallbackScore = Number.POSITIVE_INFINITY

    for (let lane = 0; lane < 8; lane += 1) {
      for (const placement of placements) {
        for (const xOffset of xOffsets) {
          const candidate = buildCandidate(anchor, viewport, options, placement, lane, xOffset)
          const score = candidateScore(candidate, placed, anchor, options)
          if (score < fallbackScore) {
            fallback = candidate
            fallbackScore = score
          }
          if (score === 0) {
            placed.push(candidate)
            fallback = null
            break
          }
        }
        if (!fallback) break
      }
      if (!fallback) break
    }

    if (fallback) placed.push(fallback)
  }

  return placed
}
