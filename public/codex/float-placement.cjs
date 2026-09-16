'use strict'

// Screen-space anchor geometry. Preview bounds are disposable; only the
// collapsed anchor is persisted. All coordinates use the host's DIP space.
const RAIL_LENGTH = 120
const RAIL_THICKNESS = 8
const RAIL_INSET = 32
const PREVIEW_GAP = 6
const EDGES = ['left', 'right', 'top', 'bottom']
const clamp = (value, low, high) => Math.min(Math.max(low, high), Math.max(low, value))
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback
const areaOf = (display) => display.bounds || display.workArea
const horizontal = (edge) => edge === 'top' || edge === 'bottom'
const rect = (x, y, width, height) => ({ x: Math.round(x), y: Math.round(y), width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) })

function displayHint(display) {
  return { bounds: { ...areaOf(display) }, ...(typeof display.label === 'string' && display.label ? { label: display.label.slice(0, 120) } : {}), ...(typeof display.internal === 'boolean' ? { internal: display.internal } : {}) }
}

function preferredDisplay(position, displays) {
  const exact = displays.find((display) => String(display.id) === String(position?.displayId))
  if (exact) return exact
  const hint = position?.displayHint
  if (!hint?.label) return null
  const matches = displays.filter((display) => display.label === hint.label && (typeof hint.internal !== 'boolean' || display.internal === hint.internal))
  return matches.length === 1 ? matches[0] : null
}

function resolveDisplay(position, displays, fallback) {
  const preferred = preferredDisplay(position, displays)
  if (preferred) return { display: preferred, borrowed: false }
  // A cursor move must never migrate a saved window. For a missing monitor,
  // use the nearest old display centre; caller supplies primary as a fallback.
  const old = position?.displayHint?.bounds
  const point = old ? { x: old.x + old.width / 2, y: old.y + old.height / 2 }
    : Number.isFinite(position?.x) && Number.isFinite(position?.y) ? position : null
  const distance = (display) => {
    const area = areaOf(display)
    return point ? Math.hypot(point.x - clamp(point.x, area.x, area.x + area.width), point.y - clamp(point.y, area.y, area.y + area.height)) : 0
  }
  const display = point && displays.length ? [...displays].sort((a, b) => distance(a) - distance(b) || String(a.id).localeCompare(String(b.id)))[0] : fallback || displays[0]
  return { display, borrowed: Boolean(position?.displayId) }
}

function anchorSize(style, edge, display) {
  const area = areaOf(display)
  if (style === 'edge') return horizontal(edge)
    ? { width: Math.min(RAIL_LENGTH, area.width), height: Math.min(RAIL_THICKNESS, area.height) }
    : { width: Math.min(RAIL_THICKNESS, area.width), height: Math.min(RAIL_LENGTH, area.height) }
  return { width: Math.min(style === 'card' ? 156 : 94, area.width), height: Math.min(style === 'card' ? 82 : 94, area.height) }
}

function anchorAt(display, edge, offset, style = 'edge') {
  const area = areaOf(display)
  const size = anchorSize(style, edge, display)
  const fraction = clamp(finite(offset, 0.5), 0, 1)
  return rect(
    edge === 'left' ? area.x : edge === 'right' ? area.x + area.width - size.width : area.x + (area.width - size.width) * fraction,
    edge === 'top' ? area.y : edge === 'bottom' ? area.y + area.height - size.height : area.y + (area.height - size.height) * fraction,
    size.width, size.height
  )
}

function edgeOffset(anchor, display, edge) {
  const area = areaOf(display)
  const length = horizontal(edge) ? area.width - anchor.width : area.height - anchor.height
  return length > 0 ? clamp((horizontal(edge) ? anchor.x - area.x : anchor.y - area.y) / length, 0, 1) : 0.5
}

function restoreAnchor(position, display, style = 'edge') {
  const edge = EDGES.includes(position?.edge) ? position.edge : 'right'
  let offset = position?.edgeOffset
  if (!Number.isFinite(offset) && Number.isFinite(position?.x) && Number.isFinite(position?.y)) {
    const oldDisplay = position.displayHint?.bounds ? { bounds: position.displayHint.bounds } : display
    const size = anchorSize(style, edge, oldDisplay)
    // Legacy positions describe the padded native window, rather than paint.
    const padding = position.version === 2 ? 0 : 5
    offset = edgeOffset({ x: position.x + padding, y: position.y + padding, ...size }, oldDisplay, edge)
  }
  return { edge, anchor: anchorAt(display, edge, offset, style) }
}

function snapAnchor(anchor, display, previousEdge, style = 'edge', intent = {}) {
  const area = areaOf(display)
  const distances = {
    left: Math.abs(anchor.x - area.x), right: Math.abs(area.x + area.width - anchor.x - anchor.width),
    top: Math.abs(anchor.y - area.y), bottom: Math.abs(area.y + area.height - anchor.y - anchor.height)
  }
  // macOS can stop the native window at the menu bar. Recognize that
  // reachable top too, without pretending the write reached physical y=0.
  if (Number.isFinite(intent.topBoundary)) distances.top = Math.min(distances.top, Math.abs(anchor.y - intent.topBoundary))
  const toward = { left: -finite(intent.dx, 0), right: finite(intent.dx, 0), top: -finite(intent.dy, 0), bottom: finite(intent.dy, 0) }
  const approached = EDGES.filter((edge) => distances[edge] <= 16 && toward[edge] >= 5)
  const candidates = approached.length ? approached.sort((a, b) => toward[b] - toward[a]) : [...EDGES]
  const edge = (approached.length ? candidates : candidates.sort((a, b) => distances[a] - distances[b] || (a === previousEdge ? -1 : b === previousEdge ? 1 : EDGES.indexOf(a) - EDGES.indexOf(b))))[0]
  const size = anchorSize(style, edge, display)
  const centered = { x: anchor.x + (anchor.width - size.width) / 2, y: anchor.y + (anchor.height - size.height) / 2, ...size }
  return { edge, anchor: anchorAt(display, edge, edgeOffset(centered, display, edge), style) }
}

function savePosition(anchor, display, edge) {
  return { version: 2, displayId: String(display.id), x: anchor.x, y: anchor.y, edge, edgeOffset: edgeOffset(anchor, display, edge), displayHint: displayHint(display) }
}

function railLayout(anchor, display, edge, panelSize = null) {
  const area = areaOf(display)
  const work = display.workArea || area
  const inset = Math.min(RAIL_INSET, Math.max(0, (horizontal(edge) ? area.height - anchor.height : area.width - anchor.width)))
  const slot = horizontal(edge)
    ? rect(anchor.x, anchor.y - (edge === 'bottom' ? inset : 0), anchor.width, anchor.height + inset)
    : rect(anchor.x - (edge === 'right' ? inset : 0), anchor.y, anchor.width + inset, anchor.height)
  let panel = null
  if (panelSize) {
    const availableWidth = horizontal(edge) ? work.width : edge === 'right' ? slot.x - PREVIEW_GAP - work.x : work.x + work.width - slot.x - slot.width - PREVIEW_GAP
    const availableHeight = !horizontal(edge) ? work.height : edge === 'bottom' ? slot.y - PREVIEW_GAP - work.y : work.y + work.height - Math.max(work.y, slot.y + slot.height + PREVIEW_GAP)
    const width = Math.max(1, Math.min(panelSize.width, availableWidth))
    const height = Math.max(1, Math.min(panelSize.height, availableHeight))
    panel = rect(
      edge === 'right' ? slot.x - PREVIEW_GAP - width : edge === 'left' ? slot.x + slot.width + PREVIEW_GAP : clamp(anchor.x + (anchor.width - width) / 2, work.x, work.x + work.width - width),
      edge === 'bottom' ? slot.y - PREVIEW_GAP - height : edge === 'top' ? Math.max(work.y, slot.y + slot.height + PREVIEW_GAP) : clamp(anchor.y + (anchor.height - height) / 2, work.y, work.y + work.height - height),
      width, height
    )
  }
  const bounds = panel ? rect(Math.min(slot.x, panel.x), Math.min(slot.y, panel.y), Math.max(slot.x + slot.width, panel.x + panel.width) - Math.min(slot.x, panel.x), Math.max(slot.y + slot.height, panel.y + panel.height) - Math.min(slot.y, panel.y)) : slot
  const local = (value) => value ? { ...value, x: value.x - bounds.x, y: value.y - bounds.y } : null
  return { bounds, edge, rail: local(anchor), slot: local(slot), panel: local(panel) }
}

module.exports = { RAIL_LENGTH, RAIL_THICKNESS, areaOf, horizontal, anchorSize, anchorAt, edgeOffset, restoreAnchor, snapAnchor, savePosition, railLayout, preferredDisplay, resolveDisplay }
