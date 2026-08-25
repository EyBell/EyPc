'use strict'

/**
 * Computes the Float window's target pixel size: the collapsed card/water
 * shape, the expanded panel's content-driven height, and the final expanded
 * size after clamping to the user's saved preference and the display's work
 * area.
 *
 * Pure computation over its arguments. `record` is injected because
 * `codexRecord` has hundreds of call sites elsewhere in the entry.
 * `expandedPreference` and `clampExpandedSize` stay in the entry and are
 * injected as function references rather than reimplemented here:
 * `expandedPreference` reads `codexFloatExpandedSizes`/
 * `codexFloatPositionDisplayId`, two module-level bindings shared outside
 * this cluster, and `clampExpandedSize` has an independent call site in the
 * entry's resize handler -- migrating either would relocate the coupling
 * rather than remove it. The four `CODEX_FLOAT_*` size constants are
 * injected rather than copied so a future edit to one has a single home.
 */

const CODEX_FLOAT_WINDOW_SIZE_REVISION = 'codex-float-window-size-v1'

function createCodexFloatWindowSize(dependencies = {}) {
  const record = dependencies.record
  const expandedPreference = dependencies.expandedPreference
  const clampExpandedSize = dependencies.clampExpandedSize
  const cardSize = dependencies.cardSize
  const waterSize = dependencies.waterSize
  const expandedMinHeight = dependencies.expandedMinHeight
  const expandedMaxHeight = dependencies.expandedMaxHeight
  const expandedWidth = dependencies.expandedWidth
  if (typeof record !== 'function' || typeof expandedPreference !== 'function' || typeof clampExpandedSize !== 'function'
    || !cardSize || !waterSize || !Number.isFinite(expandedMinHeight) || !Number.isFinite(expandedMaxHeight) || !Number.isFinite(expandedWidth)) {
    throw new TypeError('codex float window size requires record, expandedPreference, clampExpandedSize and the CODEX_FLOAT_* size constants')
  }

  function codexFloatCollapsedSize(snapshot) {
    return record(snapshot).style === 'card'
      ? { ...cardSize }
      : { ...waterSize }
  }

  function codexFloatExpandedHeight(snapshot) {
    const source = record(snapshot)
    const quota = record(source.quota)
    const taskViews = record(record(source.taskSnapshot).views)
    const taskGroups = record(taskViews.groups)
    const expandedFields = new Set(Array.isArray(source.expandedFields) ? source.expandedFields : [])

    // Root padding + header + footer, with a small rendering allowance. Content
    // blocks below mirror the renderer's actual one-row quota grid and compact
    // empty-task treatment so an empty inbox does not create a blank panel.
    let height = 151
    let visibleQuotaBuckets = 0
    const quotaFieldEnabled = expandedFields.has('short') || expandedFields.has('weekly')
    if (expandedFields.has('short') && quota.short && typeof quota.short === 'object') visibleQuotaBuckets += 1
    if (expandedFields.has('weekly') && quota.weekly && typeof quota.weekly === 'object') visibleQuotaBuckets += 1
    if (visibleQuotaBuckets > 0) height += expandedFields.has('reset') ? 82 : 64
    else if (quotaFieldEnabled) height += 64
    if (expandedFields.has('config')) height += 38

    if (source.conversationInboxEnabled === true && expandedFields.has('tasks')) {
      const dynamicCount = ['input', 'active', 'stopped', 'unread', 'completed']
        .reduce((count, group) => count + (Array.isArray(taskGroups[group]) ? taskGroups[group].length : 0), 0)
      const hiddenCount = Array.isArray(taskViews.pausedKeys) ? taskViews.pausedKeys.length : 0
      const taskCount = Math.max(dynamicCount, hiddenCount)
      height += 69
      if (taskCount === 0) height += 30
      else height += taskCount * 48 + Math.max(0, taskCount - 1) * 5
    }

    return Math.max(expandedMinHeight, Math.min(expandedMaxHeight, height))
  }

  function codexFloatDesiredSize(snapshot, expanded, display) {
    if (!expanded) return codexFloatCollapsedSize(snapshot)
    const preferred = expandedPreference(display)
    return clampExpandedSize(preferred || { width: expandedWidth, height: codexFloatExpandedHeight(snapshot) }, display)
  }

  return {
    revision: CODEX_FLOAT_WINDOW_SIZE_REVISION,
    codexFloatCollapsedSize,
    codexFloatExpandedHeight,
    codexFloatDesiredSize
  }
}

module.exports = {
  CODEX_FLOAT_WINDOW_SIZE_REVISION,
  createCodexFloatWindowSize
}
