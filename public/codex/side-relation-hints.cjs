'use strict'

/**
 * Shapes the bounded persisted Desktop Side->parent recovery hints. A hint
 * carries topology identity only -- threadId, parentThreadId and the time the
 * relation was last observed -- never live phase, unread, waiting, titles or
 * content. Persistence exists solely so a fresh preload process can re-follow
 * a Desktop-only Side child and let the existing targeted latest-Turn
 * verification decide what is actually running; a restored hint on its own
 * asserts nothing about state.
 *
 * The TTL bounds how long a hint stays worth restoring; it never infers a
 * terminal. An expired hint simply means no recovery attempt, which is
 * exactly the pre-persistence baseline. `timestampMs`/`validThreadId` are
 * injected on the desktop-activity-resolution precedent. All functions are
 * pure over their arguments; no module state.
 */

const CODEX_SIDE_RELATION_HINTS_REVISION = 'codex-side-relation-hints-v1'
const CODEX_SIDE_RELATION_HINT_STORAGE_VERSION = 1
const CODEX_SIDE_RELATION_HINT_LIMIT = 200
const CODEX_SIDE_RELATION_HINT_TTL_MS = 48 * 60 * 60 * 1000

function createCodexSideRelationHints(dependencies = {}) {
  const timestampMs = dependencies.timestampMs
  const validThreadId = dependencies.validThreadId
  if (typeof timestampMs !== 'function' || typeof validThreadId !== 'function') {
    throw new TypeError('codex side relation hints requires timestampMs and validThreadId')
  }

  function sanitizeHintRow(value, nowMs) {
    const source = value && typeof value === 'object' ? value : {}
    const threadId = source.threadId
    const parentThreadId = source.parentThreadId
    if (!validThreadId(threadId) || !validThreadId(parentThreadId) || threadId === parentThreadId) return null
    // A future observedAt (clock rollback between sessions) is clamped so a
    // skewed entry cannot become effectively immortal.
    const observedAt = Math.min(timestampMs(source.observedAt), nowMs)
    if (!(observedAt > 0) || nowMs - observedAt > CODEX_SIDE_RELATION_HINT_TTL_MS) return null
    return { threadId, parentThreadId, observedAt }
  }

  function boundHintRows(rows, nowMs) {
    const byThreadId = new Map()
    for (const value of Array.isArray(rows) ? rows : []) {
      const row = sanitizeHintRow(value, nowMs)
      if (!row) continue
      const previous = byThreadId.get(row.threadId)
      if (!previous || row.observedAt > previous.observedAt) byThreadId.set(row.threadId, row)
    }
    return [...byThreadId.values()]
      .sort((left, right) => right.observedAt - left.observedAt)
      .slice(0, CODEX_SIDE_RELATION_HINT_LIMIT)
  }

  // Serializes the live relation map into the persisted payload shape.
  // Duck-typed on purpose: the entry's Map may come from another realm
  // (the vm test harness), where `instanceof Map` is false.
  function codexSideRelationHintPayload(relations, observedAtByThreadId, nowMs) {
    const rows = []
    const entries = typeof relations?.entries === 'function' ? relations.entries() : []
    const observedAtFor = typeof observedAtByThreadId?.get === 'function'
      ? (threadId) => observedAtByThreadId.get(threadId)
      : () => 0
    for (const [threadId, parentThreadId] of entries) {
      rows.push({
        threadId,
        parentThreadId,
        observedAt: timestampMs(observedAtFor(threadId)) || nowMs
      })
    }
    return {
      version: CODEX_SIDE_RELATION_HINT_STORAGE_VERSION,
      relations: boundHintRows(rows, nowMs),
      updatedAt: nowMs
    }
  }

  // Parses a stored payload back into hint rows; anything unexpected is [].
  function codexRestoredSideRelationHints(stored, nowMs) {
    const source = stored && typeof stored === 'object' ? stored : {}
    if (source.version !== CODEX_SIDE_RELATION_HINT_STORAGE_VERSION) return []
    return boundHintRows(source.relations, nowMs)
  }

  return {
    revision: CODEX_SIDE_RELATION_HINTS_REVISION,
    codexSideRelationHintPayload,
    codexRestoredSideRelationHints
  }
}

module.exports = {
  CODEX_SIDE_RELATION_HINTS_REVISION,
  CODEX_SIDE_RELATION_HINT_LIMIT,
  CODEX_SIDE_RELATION_HINT_TTL_MS,
  createCodexSideRelationHints
}
