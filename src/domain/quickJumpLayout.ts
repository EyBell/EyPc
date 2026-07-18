export interface QuickJumpRect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export interface QuickJumpLayoutTarget {
  id: string
  label: string
  targetRect: QuickJumpRect
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
  badgeHeight?: number
  minBadgeWidth?: number
  charWidth?: number
  textPadding?: number
}

const DEFAULT_LAYOUT_OPTIONS = {
  badgeHeight: 18,
  minBadgeWidth: 18,
  charWidth: 8,
  textPadding: 4
}

function layoutOptions(options: QuickJumpLayoutOptions) {
  return {
    ...DEFAULT_LAYOUT_OPTIONS,
    ...options
  }
}

function badgeWidth(label: string, options: ReturnType<typeof layoutOptions>) {
  return Math.max(options.minBadgeWidth, Math.ceil(label.length * options.charWidth + options.textPadding))
}

export function layoutQuickJumpMarkers(
  targets: readonly QuickJumpLayoutTarget[],
  optionsInput: QuickJumpLayoutOptions = {}
): QuickJumpLayoutItem[] {
  const options = layoutOptions(optionsInput)

  return targets.map((target) => ({
    id: target.id,
    label: target.label,
    left: target.targetRect.left + target.targetRect.width / 2,
    top: target.targetRect.top + target.targetRect.height / 2,
    width: badgeWidth(target.label, options),
    height: options.badgeHeight
  }))
}
