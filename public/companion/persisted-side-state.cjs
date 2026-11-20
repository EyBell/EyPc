'use strict'

const crypto = require('node:crypto')

/**
 * uTools `dbStorage` side-state for the companion lanes: Plan pause receipts,
 * the interaction identity salt and interaction tombstones.
 *
 * Extracted from the preload entry under its line budget. The entry keeps the
 * EyPc state-file concerns (`readState`/`writeState`); everything here is keyed
 * storage the companion owns, so the two no longer share one 14k-line file.
 *
 * The factory takes its collaborators rather than reaching back into the entry:
 * `record` is the entry's value sanitizer and `revisions` is read lazily because
 * the V7 revision table is resolved after this module is constructed.
 */

const COMPANION_PLAN_PAUSE_STORAGE_KEY = 'eypc/companion/v7/plan-pause'
const COMPANION_PLAN_PAUSE_LEGACY_STORAGE_KEY = 'eypc/companion/plan-pause/v1'
const COMPANION_PLAN_PAUSE_STORAGE_VERSION = 7
const COMPANION_INTERACTION_IDENTITY_STORAGE_KEY = 'eypc/companion/v7/interaction-identity'
const COMPANION_INTERACTION_TOMBSTONE_STORAGE_KEY = 'eypc/companion/v7/interaction-tombstones'

function createCompanionPersistedSideState(options = {}) {
  const record = typeof options.record === 'function'
    ? options.record
    : (value) => (value && typeof value === 'object' ? value : {})
  const revisions = typeof options.revisions === 'function' ? options.revisions : () => null
  /**
   * Storage is injected, never read off `globalThis`. The preload entry is also
   * executed inside VM sandboxes, and this module is resolved through the
   * sandbox's `require` into the REAL realm — so a `globalThis.utools` lookup
   * here would silently read the host global instead of the sandbox's and drop
   * every write on the floor.
   */
  const storage = typeof options.storage === 'function' ? options.storage : () => undefined

  let planPauseStorageReady = true
  let blockedPauseKeys = null

  function sanitizeCompanionPlanPauseReceipts(stored) {
    const rows = Array.isArray(stored?.receipts) ? stored.receipts : []
    return rows.flatMap((value) => {
      const source = record(value)
      const key = typeof source.key === 'string' && /^[a-f0-9]{16,64}$/i.test(source.key) ? source.key.toLowerCase() : ''
      const planLifecycleRevision = Number.isSafeInteger(source.planLifecycleRevision) && source.planLifecycleRevision > 0
        ? source.planLifecycleRevision : 0
      if (!key || !planLifecycleRevision || source.paused !== true) return []
      return [{
        key,
        planLifecycleRevision,
        paused: true,
        updatedAt: Number.isFinite(source.updatedAt) ? Math.max(0, Math.trunc(source.updatedAt)) : 0
      }]
    }).sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 2_000)
  }

  function writeCompanionPlanPauseReceipts(rows) {
    try {
      const store = storage()
      if (typeof store?.setItem !== 'function') return false
      return store.setItem(COMPANION_PLAN_PAUSE_STORAGE_KEY, {
        version: COMPANION_PLAN_PAUSE_STORAGE_VERSION,
        receipts: sanitizeCompanionPlanPauseReceipts({ receipts: rows })
      }) !== false
    } catch {
      return false
    }
  }

  function readCompanionPlanPauseReceipts() {
    planPauseStorageReady = false
    blockedPauseKeys = null
    try {
      const store = storage()
      if (typeof store?.getItem !== 'function') return []
      const current = store.getItem(COMPANION_PLAN_PAUSE_STORAGE_KEY)
      const stored = current ?? store.getItem(COMPANION_PLAN_PAUSE_LEGACY_STORAGE_KEY)
      if (stored == null) {
        planPauseStorageReady = true
        return []
      }
      if (stored.version !== (current == null ? 1 : COMPANION_PLAN_PAUSE_STORAGE_VERSION)
        || !Array.isArray(stored.receipts) || stored.receipts.length > 2_000) return []
      const receipts = sanitizeCompanionPlanPauseReceipts(stored)
      if (receipts.length !== stored.receipts.length
        || new Set(receipts.map(value => value.key)).size !== receipts.length) return []
      if (current == null) {
        blockedPauseKeys = receipts.map(value => value.key)
        if (!writeCompanionPlanPauseReceipts(receipts)) return receipts
        const saved = store.getItem(COMPANION_PLAN_PAUSE_STORAGE_KEY)
        if (saved?.version !== COMPANION_PLAN_PAUSE_STORAGE_VERSION || !Array.isArray(saved.receipts)
          || saved.receipts.length !== receipts.length
          || JSON.stringify(sanitizeCompanionPlanPauseReceipts(saved)) !== JSON.stringify(receipts)) {
          // A different current namespace may protect additional tasks.
          blockedPauseKeys = null
          return []
        }
      }
      planPauseStorageReady = true
      blockedPauseKeys = null
      return receipts
    } catch {
      blockedPauseKeys = null
      return []
    }
  }

  function readCompanionInteractionIdentitySalt() {
    try {
      const stored = storage()?.getItem?.(COMPANION_INTERACTION_IDENTITY_STORAGE_KEY)
      const value = typeof stored?.salt === 'string' && /^[a-f0-9]{64}$/i.test(stored.salt)
        ? stored.salt.toLowerCase()
        : ''
      if (value) return Buffer.from(value, 'hex')
    } catch {}
    const salt = crypto.randomBytes(32)
    try {
      storage()?.setItem?.(COMPANION_INTERACTION_IDENTITY_STORAGE_KEY, {
        version: 1,
        salt: salt.toString('hex')
      })
    } catch {}
    return salt
  }

  function sanitizeCompanionInteractionTombstone(value) {
    const source = record(value)
    const provider = source.provider === 'codex' || source.provider === 'claude' || source.provider === 'cursor'
      ? source.provider
      : ''
    const state = source.state === 'resolved' || source.state === 'cancelled' || source.state === 'execution-started'
      ? source.state
      : ''
    const kind = ['user-input', 'approval', 'plan-choice', 'plan-implementation'].includes(source.kind)
      ? source.kind
      : ''
    const authority = ['provider-live', 'provider-snapshot', 'host-command', 'rollout'].includes(source.authority)
      ? source.authority
      : ''
    const taskKey = typeof source.taskKey === 'string' && /^[a-f0-9]{16,64}$/i.test(source.taskKey) ? source.taskKey : ''
    const branchRef = typeof source.branchRef === 'string' && source.branchRef.length > 0 && source.branchRef.length <= 128
      ? source.branchRef
      : ''
    const interactionRef = typeof source.interactionRef === 'string' && /^[a-f0-9]{16,64}$/i.test(source.interactionRef)
      ? source.interactionRef.toLowerCase()
      : ''
    const sequence = Number.isSafeInteger(source.sequence) && source.sequence > 0 ? source.sequence : 0
    const requestSetRevision = Number.isSafeInteger(source.requestSetRevision) && source.requestSetRevision > 0
      ? source.requestSetRevision
      : 0
    if (source.revision !== revisions()?.interaction || !provider || !state || !kind || !authority
      || !taskKey || !branchRef || !interactionRef || !sequence || !requestSetRevision) return null
    return {
      revision: revisions().interaction,
      provider,
      taskKey,
      branchRef,
      interactionRef,
      kind,
      state,
      sequence,
      turnEpoch: Number.isSafeInteger(source.turnEpoch) && source.turnEpoch >= 0 ? source.turnEpoch : 0,
      requestSetRevision,
      authority,
      exact: source.exact === true
    }
  }

  function readCompanionInteractionTombstones() {
    try {
      const stored = storage()?.getItem?.(COMPANION_INTERACTION_TOMBSTONE_STORAGE_KEY)
      if (stored?.revision !== revisions()?.interactionStore) return []
      return (Array.isArray(stored.tombstones) ? stored.tombstones : [])
        .map(sanitizeCompanionInteractionTombstone)
        .filter(Boolean)
        .slice(-2_000)
    } catch {
      return []
    }
  }

  let tombstonePersistTimer = null
  let tombstonePendingRows = []

  function flushCompanionInteractionTombstones() {
    if (tombstonePersistTimer) clearTimeout(tombstonePersistTimer)
    tombstonePersistTimer = null
    const tombstones = tombstonePendingRows
      .map(sanitizeCompanionInteractionTombstone)
      .filter(Boolean)
      .slice(-2_000)
    tombstonePendingRows = []
    try {
      return storage()?.setItem?.(COMPANION_INTERACTION_TOMBSTONE_STORAGE_KEY, {
        revision: revisions().interactionStore,
        tombstones,
        updatedAt: Date.now()
      }) !== false
    } catch {
      return false
    }
  }

  function persistCompanionInteractionTombstones(rows, options = {}) {
    tombstonePendingRows = Array.isArray(rows) ? rows.slice(-2_000) : []
    if (options.flush === true) return flushCompanionInteractionTombstones()
    if (!tombstonePersistTimer) {
      tombstonePersistTimer = setTimeout(flushCompanionInteractionTombstones, 50)
      tombstonePersistTimer.unref?.()
    }
    return true
  }

  function persistCompanionPlanPause(receipt) {
    const source = record(receipt)
    const key = typeof source.key === 'string' && /^[a-f0-9]{16,64}$/i.test(source.key) ? source.key : ''
    const planLifecycleRevision = Number.isFinite(source.planLifecycleRevision)
      ? Math.max(0, Math.trunc(source.planLifecycleRevision))
      : 0
    if (!key || !planLifecycleRevision) return false
    const stored = readCompanionPlanPauseReceipts()
    if (!planPauseStorageReady) return false
    const previous = stored.find(value => value.key === key.toLowerCase())
    if (source.paused !== true && previous?.planLifecycleRevision !== planLifecycleRevision) return true
    const rows = stored.filter(value => value !== previous)
    if (source.paused === true) rows.unshift({ key, planLifecycleRevision, paused: true, updatedAt: Date.now() })
    return rows.length <= 2_000 && writeCompanionPlanPauseReceipts(rows)
  }

  return {
    planPauseStorageReady: () => planPauseStorageReady,
    blockedPauseKeys: () => blockedPauseKeys,
    sanitizeCompanionPlanPauseReceipts,
    writeCompanionPlanPauseReceipts,
    readCompanionPlanPauseReceipts,
    persistCompanionPlanPause,
    readCompanionInteractionIdentitySalt,
    sanitizeCompanionInteractionTombstone,
    readCompanionInteractionTombstones,
    flushCompanionInteractionTombstones,
    persistCompanionInteractionTombstones
  }
}

module.exports = {
  createCompanionPersistedSideState,
  COMPANION_PLAN_PAUSE_STORAGE_KEY,
  COMPANION_PLAN_PAUSE_LEGACY_STORAGE_KEY,
  COMPANION_PLAN_PAUSE_STORAGE_VERSION,
  COMPANION_INTERACTION_IDENTITY_STORAGE_KEY,
  COMPANION_INTERACTION_TOMBSTONE_STORAGE_KEY
}
