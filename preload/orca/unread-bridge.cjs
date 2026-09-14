'use strict'

/**
 * Temporary EyPc-owned completed-unread ledger for Orca.
 *
 * Official 1.4.202 does not export tab-bar `unreadAgentCompletionPanes`.
 * Once a pane was observed working, a later `done` stays completed-unread
 * until the user opens it from EyPc. Conversation bodies are never stored.
 */

const ORCA_UNREAD_BRIDGE_REVISION = 'orca-unread-bridge-v1'
const STORAGE_KEY = 'eypc/orca/unread-bridge/v1'
const PANE_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_RECORDS = 500

function textOf(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function paneKeyOf(value) {
  const key = textOf(value).toLowerCase()
  return PANE_KEY.test(key) ? key : ''
}

function timeOf(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : 0
}

function emptyRecord() {
  return { seenWorkingAt: 0, completionEpoch: 0, viewedAt: 0 }
}

function recordOf(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    seenWorkingAt: timeOf(source.seenWorkingAt),
    completionEpoch: timeOf(source.completionEpoch),
    viewedAt: timeOf(source.viewedAt)
  }
}

function createMemoryStore(initial) {
  const box = { value: initial && typeof initial === 'object' ? initial : null }
  return {
    getItem() {
      return box.value
    },
    setItem(_key, value) {
      box.value = value
      return true
    }
  }
}

function defaultStore() {
  const db = globalThis.utools && globalThis.utools.dbStorage
  if (db && typeof db.getItem === 'function' && typeof db.setItem === 'function') {
    return {
      getItem: (key) => db.getItem(key),
      setItem: (key, value) => db.setItem(key, value)
    }
  }
  return createMemoryStore(null)
}

function loadRecords(store) {
  const map = new Map()
  let parsed = store.getItem(STORAGE_KEY)
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed) } catch { parsed = null }
  }
  const rows = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed.records
    : null
  if (!rows || typeof rows !== 'object' || Array.isArray(rows)) return map
  for (const [key, value] of Object.entries(rows)) {
    const paneKey = paneKeyOf(key)
    if (!paneKey) continue
    map.set(paneKey, recordOf(value))
  }
  return map
}

function persistRecords(store, records) {
  const rows = {}
  for (const [key, value] of records) rows[key] = recordOf(value)
  try {
    store.setItem(STORAGE_KEY, {
      revision: ORCA_UNREAD_BRIDGE_REVISION,
      records: rows
    })
  } catch {
    /* dbStorage may be absent in tests */
  }
}

function prune(records) {
  if (records.size <= MAX_RECORDS) return records
  const ranked = [...records.entries()].sort((left, right) => {
    const leftFresh = Math.max(left[1].seenWorkingAt, left[1].completionEpoch, left[1].viewedAt)
    const rightFresh = Math.max(right[1].seenWorkingAt, right[1].completionEpoch, right[1].viewedAt)
    return leftFresh - rightFresh
  })
  const next = new Map(records)
  const extra = next.size - MAX_RECORDS
  for (let index = 0; index < extra; index += 1) next.delete(ranked[index][0])
  return next
}

function createUnreadBridge(dependencies = {}) {
  const store = dependencies.store && typeof dependencies.store.getItem === 'function'
    ? dependencies.store
    : defaultStore()
  const clock = typeof dependencies.now === 'function' ? dependencies.now : Date.now
  let records = loadRecords(store)

  function remember(paneKey, next) {
    records.set(paneKey, recordOf(next))
    records = prune(records)
    persistRecords(store, records)
  }

  function observe(sessions, observedAt) {
    const now = timeOf(observedAt) || clock()
    const rows = Array.isArray(sessions) ? sessions : []
    for (const session of rows) {
      if (!session || typeof session !== 'object') continue
      const paneKey = paneKeyOf(session.paneKey)
      if (!paneKey) continue
      const current = recordOf(records.get(paneKey) || emptyRecord())
      const state = textOf(session.state).toLowerCase()
      if (state === 'working') {
        remember(paneKey, { ...current, seenWorkingAt: now, completionEpoch: 0 })
        continue
      }
      if (state !== 'done') continue
      if (current.seenWorkingAt > 0 && current.completionEpoch === 0) {
        current.completionEpoch = now
        remember(paneKey, current)
      } else if (current.seenWorkingAt > 0) {
        remember(paneKey, current)
      }
      // unreadExplicit is "CLI sent a boolean", not "the pane is unread".
      if (session.unreadExplicit === true) continue
      if (current.seenWorkingAt > 0 && current.completionEpoch > current.viewedAt) {
        session.unread = true
      } else if (current.completionEpoch > 0 && current.viewedAt >= current.completionEpoch) {
        session.unread = false
      }
    }
  }

  function markViewed(paneKey, viewedAt) {
    const key = paneKeyOf(paneKey)
    if (!key) return emptyRecord()
    const current = recordOf(records.get(key) || emptyRecord())
    const next = { ...current, viewedAt: timeOf(viewedAt) || clock() }
    remember(key, next)
    return next
  }

  function recordFor(paneKey) {
    return recordOf(records.get(paneKeyOf(paneKey)) || emptyRecord())
  }

  return {
    revision: ORCA_UNREAD_BRIDGE_REVISION,
    observe,
    markViewed,
    recordFor
  }
}

module.exports = {
  ORCA_UNREAD_BRIDGE_REVISION,
  STORAGE_KEY,
  createUnreadBridge
}
