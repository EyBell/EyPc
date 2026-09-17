"use strict"
const { trace: freezeTrace } = require('../freeze-trace.cjs')

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

// dbStorage uses synchronous IPC. Use the same document envelope through the
// public asynchronous API so existing receipts need no migration.
function defaultStore(host) {
  const db = host && host.db && host.db.promises
  if (!db || typeof db.get !== 'function' || typeof db.put !== 'function') {
    return createMemoryStore(null)
  }
  return {
    async getItem(key) {
      const doc = await freezeTrace.run('orca.unread-db-get', () => db.get(key))
      if (doc && doc.error) throw new Error('unread-storage-read-failed')
      return doc ? doc.value : null
    },
    async setItem(key, value) {
      const doc = await freezeTrace.run('orca.unread-db-get', () => db.get(key))
      if (doc && doc.error) throw new Error('unread-storage-read-failed')
      const result = await freezeTrace.run('orca.unread-db-put', () => db.put({ _id: key, ...(doc && doc._rev ? { _rev: doc._rev } : {}), value }), { count: Object.keys(value.records).length })
      if (!result || result.error) throw new Error('unread-storage-write-failed')
    }
  }
}

function loadRecords(parsed) {
  const map = new Map()
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed) } catch { parsed = null }
  }
  const rows = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed.records : null
  if (!rows || typeof rows !== 'object' || Array.isArray(rows)) return map
  for (const [key, value] of Object.entries(rows)) {
    const paneKey = paneKeyOf(key)
    if (paneKey) map.set(paneKey, recordOf(value))
  }
  return prune(map)
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
    : defaultStore(dependencies.utools)
  const clock = typeof dependencies.now === 'function' ? dependencies.now : Date.now
  let records = new Map()
  let initialized = false
  let writable = false
  let dirty = false
  let writing = null
  let persistenceError = null
  // A stalled host read must not hold the inventory indefinitely. On failure
  // retain a session-only ledger and never overwrite the unknown stored one.
  const ready = new Promise((resolve) => {
    const timer = setTimeout(() => finish(null, 'load-timeout'), dependencies.loadTimeoutMs ?? 1000)
    function finish(value, error) {
      if (initialized) return
      clearTimeout(timer)
      records = loadRecords(value)
      initialized = true
      writable = !error
      persistenceError = error
      resolve()
    }
    Promise.resolve().then(() => store.getItem(STORAGE_KEY))
      .then((value) => finish(value, null), () => finish(null, 'load-failed'))
  })

  function schedulePersist() {
    if (!writable || !dirty || writing) return
    // One writer, one latest in-memory snapshot; no queue per pane or poll.
    writing = Promise.resolve().then(async () => {
      while (dirty) {
        dirty = false
        const rows = {}
        for (const [key, value] of records) rows[key] = recordOf(value)
        try {
          await store.setItem(STORAGE_KEY, { revision: ORCA_UNREAD_BRIDGE_REVISION, records: rows })
          persistenceError = null
        } catch {
          dirty = true
          persistenceError = 'write-failed'
          break // retry only on a later observation, never a tight retry loop
        }
      }
    }).finally(() => {
      writing = null
      if (dirty && !persistenceError) schedulePersist()
    })
  }

  function remember(paneKey, next) {
    const normalized = recordOf(next)
    const previous = records.get(paneKey)
    if (previous && previous.seenWorkingAt === normalized.seenWorkingAt
      && previous.completionEpoch === normalized.completionEpoch
      && previous.viewedAt === normalized.viewedAt) return
    records.set(paneKey, normalized)
    records = prune(records)
    dirty = true
  }

  function observe(sessions, observedAt) {
    const freezeSpan = freezeTrace.begin('orca.observe', { count: Array.isArray(sessions) ? sessions.length : 0 })
    try {
    if (!initialized) return
    const now = timeOf(observedAt) || clock()
    const rows = Array.isArray(sessions) ? sessions : []
    for (const session of rows) {
      if (!session || typeof session !== 'object') continue
      const paneKey = paneKeyOf(session.paneKey)
      if (!paneKey) continue
      const current = recordOf(records.get(paneKey) || emptyRecord())
      const state = textOf(session.state).toLowerCase()
      // Projected session.state is the source. working+monitoring stays working.
      if (state === 'working') {
        remember(paneKey, { ...current, seenWorkingAt: now, completionEpoch: 0 })
        continue
      }
      if (state !== 'done') continue
      if (current.seenWorkingAt > 0 && current.completionEpoch === 0) {
        current.completionEpoch = now
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
    schedulePersist()

    } finally { freezeTrace.end(freezeSpan) }
  }

  function markViewed(paneKey, viewedAt) {
    const key = paneKeyOf(paneKey)
    if (!initialized || !key) return emptyRecord()
    const current = recordOf(records.get(key) || emptyRecord())
    const next = { ...current, viewedAt: timeOf(viewedAt) || clock() }
    remember(key, next)
    schedulePersist()
    return next
  }

  function recordFor(paneKey) {
    return recordOf(records.get(paneKeyOf(paneKey)) || emptyRecord())
  }

  return {
    revision: ORCA_UNREAD_BRIDGE_REVISION,
    ready: () => ready,
    flush: async () => { await ready; schedulePersist(); if (writing) await writing },
    persistenceStatus: () => ({ initialized, writable, dirty, writing: !!writing, error: persistenceError }),
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
