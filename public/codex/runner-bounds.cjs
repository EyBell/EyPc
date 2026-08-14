'use strict'

/**
 * Action Runner window geometry.
 *
 * Owns both the clamping arithmetic and the minimums it clamps to. Keeping the
 * two apart is how a window ends up sized by one rule and constrained by
 * another: the entry used to declare `MIN_WIDTH`/`MIN_HEIGHT` next to unrelated
 * channel constants while the arithmetic lived a thousand lines away.
 *
 * Pure geometry — no filesystem, no host, not even a Node builtin.
 */

const CODEX_RUNNER_BOUNDS_REVISION = 'codex-runner-bounds-v1'
const CODEX_ACTION_RUNNER_MIN_WIDTH = 720
const CODEX_ACTION_RUNNER_MIN_HEIGHT = 420

function clampCodexActionRunnerBounds(bounds, display) {
  const area = display?.workArea || display?.bounds || { x: 0, y: 0, width: 1440, height: 900 }
  const maxWidth = Math.max(1, Math.round(area.width))
  const maxHeight = Math.max(1, Math.round(area.height))
  const width = Math.min(maxWidth, Math.max(Math.min(CODEX_ACTION_RUNNER_MIN_WIDTH, maxWidth), Math.round(Number(bounds.width) || 980)))
  const height = Math.min(maxHeight, Math.max(Math.min(CODEX_ACTION_RUNNER_MIN_HEIGHT, maxHeight), Math.round(Number(bounds.height) || 640)))
  const requestedX = Number.isFinite(bounds.x) ? Math.round(bounds.x) : area.x
  const requestedY = Number.isFinite(bounds.y) ? Math.round(bounds.y) : area.y
  const x = Math.min(area.x + maxWidth - width, Math.max(area.x, requestedX))
  const y = Math.min(area.y + maxHeight - height, Math.max(area.y, requestedY))
  return { x, y, width, height }
}

function resizeCodexActionRunnerBounds(start, screenX, screenY) {
  const dx = screenX - start.pointerX
  const dy = screenY - start.pointerY
  const left = start.corner.includes('left')
  const top = start.corner.includes('top')
  const area = start.display?.workArea || start.display?.bounds || { x: 0, y: 0, width: 1440, height: 900 }
  const oppositeX = left ? start.bounds.x + start.bounds.width : start.bounds.x
  const oppositeY = top ? start.bounds.y + start.bounds.height : start.bounds.y
  const requestedWidth = left ? start.bounds.width - dx : start.bounds.width + dx
  const requestedHeight = top ? start.bounds.height - dy : start.bounds.height + dy
  const maxWidth = left ? oppositeX - area.x : area.x + area.width - oppositeX
  const maxHeight = top ? oppositeY - area.y : area.y + area.height - oppositeY
  const width = Math.min(maxWidth, Math.max(Math.min(CODEX_ACTION_RUNNER_MIN_WIDTH, maxWidth), Math.round(requestedWidth)))
  const height = Math.min(maxHeight, Math.max(Math.min(CODEX_ACTION_RUNNER_MIN_HEIGHT, maxHeight), Math.round(requestedHeight)))
  return { x: left ? oppositeX - width : oppositeX, y: top ? oppositeY - height : oppositeY, width, height }
}

module.exports = {
  CODEX_RUNNER_BOUNDS_REVISION,
  CODEX_ACTION_RUNNER_MIN_WIDTH,
  CODEX_ACTION_RUNNER_MIN_HEIGHT,
  clampCodexActionRunnerBounds,
  resizeCodexActionRunnerBounds
}
