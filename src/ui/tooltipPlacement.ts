export type FloatActionHintPlacement = 'top' | 'bottom'

export interface FloatActionHintBox {
  left: number
  top: number
  placement: FloatActionHintPlacement
  arrowLeft: number
  maxWidth: number
}

/**
 * Places the float's speech-bubble hint against an expanded-card box.
 *
 * The bubble stays inside the card, prefers the side with room, and keeps the
 * arrow on the anchor even after left/right clamping. A zero-size card (jsdom)
 * falls back to the older window-style guess so hover tests still render.
 */
export function placeFloatActionHint(input: {
  anchorLeft: number
  anchorTop: number
  anchorWidth: number
  anchorHeight: number
  cardLeft: number
  cardTop: number
  cardWidth: number
  cardHeight: number
  hintWidth: number
  hintHeight: number
  gap?: number
  margin?: number
}): FloatActionHintBox {
  const gap = Number.isFinite(input.gap) ? Number(input.gap) : 7
  const margin = Number.isFinite(input.margin) ? Number(input.margin) : 8
  const hintWidth = Math.max(1, input.hintWidth)
  const hintHeight = Math.max(1, input.hintHeight)
  const anchorCenter = input.anchorLeft + input.anchorWidth / 2
  if (!(input.cardWidth > 0) || !(input.cardHeight > 0)) {
    const placement: FloatActionHintPlacement = input.anchorTop >= 48 ? 'top' : 'bottom'
    const left = Math.max(8, anchorCenter - hintWidth / 2)
    const top = placement === 'top'
      ? Math.max(8, input.anchorTop - gap - hintHeight)
      : input.anchorTop + input.anchorHeight + gap
    return {
      left,
      top,
      placement,
      arrowLeft: Math.min(Math.max(anchorCenter - left, 10), Math.max(10, hintWidth - 10)),
      maxWidth: 240
    }
  }
  const maxWidth = Math.max(margin * 2, input.cardWidth - margin * 2)
  const width = Math.min(hintWidth, maxWidth)
  const minLeft = input.cardLeft + margin
  const maxLeft = input.cardLeft + input.cardWidth - width - margin
  const preferredLeft = anchorCenter - width / 2
  const left = maxLeft < minLeft
    ? minLeft
    : Math.min(Math.max(preferredLeft, minLeft), maxLeft)
  const arrowLeft = Math.min(
    Math.max(anchorCenter - left, 10),
    Math.max(10, width - 10)
  )
  const need = hintHeight + gap + margin
  const spaceAbove = input.anchorTop - input.cardTop
  const placement: FloatActionHintPlacement = spaceAbove >= need ? 'top' : 'bottom'
  const preferredTop = placement === 'top'
    ? input.anchorTop - gap - hintHeight
    : input.anchorTop + input.anchorHeight + gap
  const minTop = input.cardTop + margin
  const maxTop = input.cardTop + input.cardHeight - hintHeight - margin
  const top = maxTop < minTop
    ? minTop
    : Math.min(Math.max(preferredTop, minTop), maxTop)
  return { left, top, placement, arrowLeft, maxWidth }
}

