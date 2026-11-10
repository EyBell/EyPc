'use strict'

/**
 * Exact Desktop read/unread evidence for one thread.
 *
 * Both the entry's `codexDesktopUnreadObservation` (native Codex) and the
 * CodexHost lane's `compareHostDesktopUnread` (extra processes) used to carry
 * their own copy of "did the Desktop, or an EyPc jump, actually mark this
 * read". The copies drifted on which polarity they honoured. This module owns
 * the evidence; each consumer keeps only its policy:
 *
 *  - native Codex honours both `read` and `unread` (an exact unread event is
 *    the Desktop's own unread authority);
 *  - an extra process honours only `read` — its unread authority is the Host,
 *    which is never compared against a Desktop unread-true (RAW-190 / 193).
 */

const CODEX_DESKTOP_UNREAD_EVIDENCE_REVISION = 'codex-desktop-unread-evidence-v1'
const CODEX_DESKTOP_CONVERSATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CODEX_DESKTOP_UNREAD_READ_FAILURE_REASON = {
  'native-schema-invalid': true,
  'binding-unavailable': true,
  'binding-invalid': true,
  'bucket-invalid': true,
  'legacy-unavailable': true,
  'read-failed': true
}
const CODEX_DESKTOP_UNREAD_READ_FAILURE_REASONS = {
  'invalid native unread state': 'native-schema-invalid',
  'invalid native identity unread state': 'native-schema-invalid',
  'native unread identity or local host is unavailable': 'binding-unavailable',
  'invalid native unread binding': 'binding-invalid',
  'invalid native unread identity bucket': 'bucket-invalid',
  'native local unread bucket is unavailable': 'bucket-invalid',
  'legacy local unread state is unavailable': 'legacy-unavailable'
}

function nativeRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function nativeDecoded(value) {
  return typeof value === 'string' ? JSON.parse(value) : value
}

/** Select exactly one native identity and execution-host bucket, never a union. */
function parseCodexDesktopUnreadState(value, binding = null) {
  const root = nativeRecord(value)
  if (!root) throw new Error('invalid native unread state')
  if (Object.prototype.hasOwnProperty.call(root, 'electron-thread-read-state-v1')) {
    const state = nativeRecord(nativeDecoded(root['electron-thread-read-state-v1']))
    const identities = nativeRecord(state?.unreadByIdentity)
    if (state?.version !== 1 || !identities) throw new Error('invalid native identity unread state')
    let identityKey = binding?.identityKey
    let executionHostKey = binding?.executionHostKey
    if (!identityKey || !executionHostKey) {
      const migration = nativeRecord(state.legacyMigration)
      const keys = Object.keys(identities)
      const hosts = nativeRecord(migration?.adoptedHostIds)
      // Native migration explicitly binds its sole identity and local host.
      // Ambiguous identities, retired migration or no local adoption abstain.
      if (migration?.cleared === true || keys.length !== 1
        || keys[0] !== migration?.identityKey || typeof hosts?.local !== 'string' || !hosts.local) {
        throw new Error('native unread identity or local host is unavailable')
      }
      identityKey = keys[0]
      executionHostKey = hosts.local
    }
    if (typeof identityKey !== 'string' || !/^[a-f0-9]{64}$/.test(identityKey)
      || typeof executionHostKey !== 'string' || !executionHostKey || executionHostKey.length > 2048) {
      throw new Error('invalid native unread binding')
    }
    const identity = identities[identityKey]
    if (identity !== undefined && !nativeRecord(identity)) throw new Error('invalid native unread identity bucket')
    const local = identity?.[executionHostKey]
    // With an exact live binding native open() treats a missing bucket as [];
    // migration bootstrap must actually name an existing adopted bucket.
    if (local === undefined && binding) return []
    if (!Array.isArray(local)) throw new Error('native local unread bucket is unavailable')
    return local
  }
  const atoms = nativeRecord(nativeDecoded(root['electron-persisted-atom-state']))
  const hosts = nativeRecord(nativeDecoded(atoms?.['unread-thread-ids-by-host-v1']))
  if (!Array.isArray(hosts?.local)) throw new Error('legacy local unread state is unavailable')
  return hosts.local
}

function codexReadStateContextBinding(value) {
  const context = nativeRecord(value)
  const identity = nativeRecord(context?.identity)
  const valid = text => typeof text === 'string' && text.length > 0 && text.length <= 256 && !/[\u0000-\u001f]/.test(text)
  if (identity?.kind !== 'chatgpt' || !valid(identity.accountId) || !valid(identity.userId)
    || typeof context.executionHostKey !== 'string' || !context.executionHostKey
    || context.executionHostKey.length > 2048) return null
  return {
    identityKey: require('node:crypto').createHash('sha256')
      .update(JSON.stringify(['chatgpt', identity.accountId, identity.userId])).digest('hex'),
    executionHostKey: context.executionHostKey
  }
}

function codexDesktopConversationId(value) {
  return typeof value === 'string' && CODEX_DESKTOP_CONVERSATION_ID.test(value)
}

/**
 * Classify one thread-read-state notification without applying it.
 * Unspecified or local hosts, a UUID conversation and a boolean unread flag
 * match the existing read-state gate. Legacy v1/v2 do not need context.
 * v3 additionally requires hostId local and the existing hashed chatgpt
 * binding. Any other version is rejected. The result never carries the raw
 * payload; binding is that hashed shape only when v3 is accepted.
 */
function codexDesktopReadNotificationDecision(params, version) {
  const notification = nativeRecord(params)
  if (!notification) return { accepted: false, reason: 'payload-invalid', binding: null }
  if (notification.hostId !== undefined && notification.hostId !== 'local') {
    return { accepted: false, reason: 'host-not-local', binding: null }
  }
  if (!codexDesktopConversationId(notification.conversationId)) {
    return { accepted: false, reason: 'conversation-invalid', binding: null }
  }
  if (typeof notification.hasUnreadTurn !== 'boolean') {
    return { accepted: false, reason: 'unread-invalid', binding: null }
  }
  if (version === 1 || version === 2) return { accepted: true, reason: 'accepted', binding: null }
  if (version !== 3) return { accepted: false, reason: 'version-unsupported', binding: null }
  if (notification.hostId !== 'local') return { accepted: false, reason: 'host-not-local', binding: null }
  const binding = codexReadStateContextBinding(notification.context)
  if (!binding) return { accepted: false, reason: 'context-invalid', binding: null }
  return { accepted: true, reason: 'accepted', binding }
}

/** Map this module's parser failures to a fixed reason. Never echo error text or error.code. */
function codexDesktopUnreadReadFailureReason(error) {
  const declared = error && typeof error === 'object' ? error.unreadFailureReason : undefined
  if (typeof declared === 'string'
    && Object.prototype.hasOwnProperty.call(CODEX_DESKTOP_UNREAD_READ_FAILURE_REASON, declared)) {
    return declared
  }
  const message = typeof error === 'string'
    ? error
    : error && typeof error.message === 'string' ? error.message : ''
  if (Object.prototype.hasOwnProperty.call(CODEX_DESKTOP_UNREAD_READ_FAILURE_REASONS, message)) {
    return CODEX_DESKTOP_UNREAD_READ_FAILURE_REASONS[message]
  }
  if (error instanceof SyntaxError) return 'native-schema-invalid'
  return 'read-failed'
}

const CODEX_DESKTOP_UNREAD_RECOVERY_MS = 5_000
const codexDesktopUnreadRecoveryBridges = new WeakMap()

function codexDesktopBindingFields(binding) {
  if (!binding || typeof binding !== 'object') return null
  const identityKey = binding.identityKey
  const executionHostKey = binding.executionHostKey
  if (typeof identityKey !== 'string' || !/^[a-f0-9]{64}$/.test(identityKey)) return null
  if (typeof executionHostKey !== 'string' || !executionHostKey || executionHostKey.length > 2048) return null
  return { identityKey, executionHostKey }
}

function createCodexDesktopUnreadRecovery(dependencies = {}) {
  const record = dependencies.record
  const isExternalThreadId = dependencies.isExternalThreadId
  const isMachineThreadId = dependencies.isMachineThreadId
  const sideRelations = dependencies.sideRelations
  const knownThread = dependencies.knownThread
  const now = dependencies.now

  function clock() {
    try {
      const value = typeof now === 'function' ? now() : Date.now()
      return Number.isFinite(value) ? value : Date.now()
    } catch {
      return Date.now()
    }
  }

  function recoveryState(bridge, create) {
    if (!bridge || typeof bridge !== 'object') return null
    const existing = codexDesktopUnreadRecoveryBridges.get(bridge)
    if (existing || !create) return existing || null
    const created = { fingerprint: '', pending: new Map() }
    codexDesktopUnreadRecoveryBridges.set(bridge, created)
    return created
  }

  function safeRecord(entry) {
    if (typeof record !== 'function') return
    try { record(entry) } catch { /* diagnostic failure must not change unread authority */ }
  }

  function relations() {
    try {
      const value = typeof sideRelations === 'function' ? sideRelations() : sideRelations
      return value instanceof Map ? value : null
    } catch {
      return null
    }
  }

  function excluded(threadId) {
    try {
      if (typeof isExternalThreadId === 'function' && isExternalThreadId(threadId) === true) return true
      if (typeof isMachineThreadId === 'function' && isMachineThreadId(threadId) === true) return true
    } catch {
      return true
    }
    return false
  }

  function shadowFor(bridge, threadId) {
    return bridge.sideShadows?.get(threadId) || bridge.shadows?.get(threadId) || null
  }

  function ownerOf(shadow) {
    return typeof shadow?.ownerClientId === 'string' && shadow.ownerClientId ? shadow.ownerClientId : undefined
  }

  function sideIds(bridge, rootThreadId) {
    const ids = new Set()
    const mapped = relations()
    if (mapped) {
      for (const [threadId, parentThreadId] of mapped) {
        if (parentThreadId === rootThreadId && typeof threadId === 'string') ids.add(threadId)
      }
    }
    if (bridge.sideShadows instanceof Map) {
      for (const [threadId, shadow] of bridge.sideShadows) {
        if (shadow?.parentThreadId === rootThreadId && typeof threadId === 'string') ids.add(threadId)
      }
    }
    return ids
  }

  function tracked(bridge, threadId) {
    if (bridge.inventory instanceof Set && bridge.inventory.has(threadId)) return true
    if (bridge.sideShadows instanceof Map && bridge.sideShadows.has(threadId)) return true
    const mapped = relations()
    return mapped ? mapped.has(threadId) : false
  }

  function requestSnapshot(bridge, state, threadId, side) {
    const shadow = shadowFor(bridge, threadId)
    const owner = ownerOf(shadow)
    state.pending.set(threadId, {
      liveUnread: bridge.liveUnread instanceof Map ? bridge.liveUnread.get(threadId) : undefined,
      owner,
      revision: Number.isInteger(shadow?.revision) ? shadow.revision : undefined,
      side,
      time: clock()
    })
    let outcome = 'refollowed'
    try {
      if (bridge.followAny(threadId, true, owner ? [owner] : undefined) === false) outcome = 'dispatch-failed'
    } catch {
      outcome = 'dispatch-failed'
    }
    if (outcome === 'dispatch-failed') state.pending.delete(threadId)
    safeRecord({ level: 'info', scope: 'codex-read-recovery', provider: 'codex',
      event: 'desktop-read-recovery', outcome, taskRef: threadId,
      details: { reason: 'binding-unavailable', side } })
  }

  function settlePending(bridge, state, threadId, pending) {
    if (state.pending.get(threadId) !== pending) return
    state.pending.delete(threadId)
    if (!pending.refreshAgain) return
    // A source edge arriving during a query needs one trailing query. Capture
    // its evidence only after the current snapshot has been installed.
    queueMicrotask(() => {
      if (recoveryState(bridge, false) !== state || bridge.state !== 'connected'
        || state.pending.has(threadId) || !tracked(bridge, threadId) || excluded(threadId)) return
      requestSnapshot(bridge, state, threadId, pending.side)
    })
  }

  function prune(bridge, state) {
    const at = clock()
    for (const [threadId, pending] of [...state.pending]) {
      const expired = !Number.isFinite(pending.time) || at - pending.time > CODEX_DESKTOP_UNREAD_RECOVERY_MS
      if (expired || !tracked(bridge, threadId)) settlePending(bridge, state, threadId, pending)
    }
  }

  function forgetConnectorCache(threadId) {
    if (typeof knownThread !== 'function') return
    let known = null
    try { known = knownThread(threadId) } catch { return }
    if (!known || typeof known !== 'object') return
    delete known.connectorHasUnreadTurn
    delete known.connectorUnreadAuthority
  }

  function connectorThreadIds(bridge) {
    const threadIds = new Set()
    if (bridge.persistedUnread instanceof Map) {
      for (const threadId of bridge.persistedUnread.keys()) threadIds.add(threadId)
    }
    if (bridge.inventory instanceof Set) {
      for (const threadId of bridge.inventory) threadIds.add(threadId)
    }
    if (bridge.sideShadows instanceof Map) {
      for (const threadId of bridge.sideShadows.keys()) threadIds.add(threadId)
    }
    const mapped = relations()
    if (mapped) {
      for (const threadId of mapped.keys()) threadIds.add(threadId)
    }
    return threadIds
  }

  function clearPersistedBaseline(bridge) {
    for (const threadId of connectorThreadIds(bridge)) {
      if (typeof threadId !== 'string' || excluded(threadId)) continue
      if (bridge.persistedUnread instanceof Map) bridge.persistedUnread.delete(threadId)
      forgetConnectorCache(threadId)
    }
    bridge.unreadLine = undefined
  }

  function clearReboundEvidence(bridge) {
    if (bridge.liveUnread instanceof Map) {
      for (const [threadId, live] of [...bridge.liveUnread]) {
        if (excluded(threadId) || live?.ownerClientId === 'eypc-open') continue
        bridge.liveUnread.delete(threadId)
      }
    }
    for (const shadows of [bridge.shadows, bridge.sideShadows]) {
      if (!(shadows instanceof Map)) continue
      for (const [threadId, shadow] of shadows) {
        if (excluded(threadId) || !shadow || typeof shadow !== 'object') continue
        delete shadow.hasUnreadTurn
        delete shadow.unreadEvidence
      }
    }
  }

  function fingerprint(parsed) {
    try {
      const root = nativeRecord(parsed)
      if (!root || !Object.prototype.hasOwnProperty.call(root, 'electron-thread-read-state-v1')) return ''
      const state = nativeRecord(nativeDecoded(root['electron-thread-read-state-v1']))
      const identities = nativeRecord(state?.unreadByIdentity)
      if (!state || state.version !== 1 || !identities) return ''
      const canonical = []
      for (const identityKey of Object.keys(identities).sort()) {
        const hosts = nativeRecord(identities[identityKey])
        const hostCanonical = []
        if (hosts) {
          for (const hostKey of Object.keys(hosts).sort()) {
            const bucket = hosts[hostKey]
            const ids = Array.isArray(bucket)
              ? [...new Set(bucket.filter((threadId) => codexDesktopConversationId(threadId)))].sort()
              : []
            hostCanonical.push([hostKey, ids])
          }
        }
        canonical.push([identityKey, hostCanonical])
      }
      return require('node:crypto').createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
    } catch {
      return ''
    }
  }

  function bindingChanged(bridge, binding) {
    const next = codexDesktopBindingFields(binding)
    if (!bridge || typeof bridge !== 'object' || !next) return false
    const previous = codexDesktopBindingFields(bridge.readStateBinding)
    if (previous && previous.identityKey === next.identityKey && previous.executionHostKey === next.executionHostKey) {
      return false
    }
    const previousBindingKnown = previous !== null
    bridge.readStateBinding = next
    codexDesktopUnreadRecoveryBridges.delete(bridge)
    clearPersistedBaseline(bridge)
    if (previousBindingKnown) clearReboundEvidence(bridge)
    safeRecord({
      level: 'info',
      scope: 'codex-read-recovery',
      provider: 'codex',
      event: 'desktop-read-binding',
      outcome: previousBindingKnown ? 'rebound' : 'recovered',
      details: { previousBindingKnown }
    })
    return true
  }

  function persistenceFailed(bridge, error, emit) {
    if (emit !== true || bridge?.state !== 'connected' || !error || typeof error !== 'object') return
    if (error.unreadFailureReason !== 'binding-unavailable') return
    const sourceFingerprint = error.unreadSourceFingerprint
    if (typeof sourceFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(sourceFingerprint)) return
    const state = recoveryState(bridge, true)
    prune(bridge, state)
    if (state.fingerprint === sourceFingerprint) return
    state.fingerprint = sourceFingerprint
    if (typeof knownThread !== 'function' || !(bridge.inventory instanceof Set) || typeof bridge.followAny !== 'function') return
    const seen = new Set()
    for (const rootThreadId of bridge.inventory) {
      if (seen.has(rootThreadId) || excluded(rootThreadId)) continue
      let known = null
      try { known = knownThread(rootThreadId) } catch { continue }
      if (!known || known.hasUnreadTurn !== true) continue
      const targets = [rootThreadId]
      for (const threadId of sideIds(bridge, rootThreadId)) targets.push(threadId)
      for (const threadId of targets) {
        if (seen.has(threadId) || excluded(threadId)) continue
        seen.add(threadId)
        const pending = state.pending.get(threadId)
        if (pending) {
          pending.refreshAgain = true
          safeRecord({ level: 'debug', scope: 'codex-read-recovery', provider: 'codex',
            event: 'desktop-read-recovery', outcome: 'coalesced', taskRef: threadId,
            details: { reason: 'recovery-in-flight', side: threadId !== rootThreadId } })
          continue
        }
        requestSnapshot(bridge, state, threadId, threadId !== rootThreadId)
      }
    }
  }

  function notificationAccepted(bridge, threadId) {
    const state = recoveryState(bridge, false)
    if (!state || typeof threadId !== 'string') return
    const pending = state.pending.get(threadId)
    if (!pending) return
    pending.invalidated = true
    const shadow = shadowFor(bridge, threadId)
    if (shadow?.unreadEvidence !== 'event' || typeof shadow.hasUnreadTurn !== 'boolean') return
    if (!(bridge.liveUnread instanceof Map)) return
    // Preserve the accepted patch independently of the next full snapshot.
    // A v3 notification installs its own current value after this callback.
    bridge.liveUnread.set(threadId, {
      ownerClientId: ownerOf(shadow) || 'desktop-live',
      hasUnreadTurn: shadow.hasUnreadTurn,
      unreadEvidence: 'event'
    })
  }

  function snapshotAllowed(bridge, threadId, change, previousShadow, ownerClientId, unrevisioned = false) {
    const state = recoveryState(bridge, false)
    const pending = state?.pending.get(threadId)
    // Stream ordering outlives a recovery request. A late reply must not
    // replace a newer shadow after settlement, expiry or recovery reset.
    // A different owner has its own revision domain; legacy snapshots have
    // no native ordering and keep the pending-event guard below.
    if (!unrevisioned && previousShadow?.ownerClientId === ownerClientId
      && Number.isInteger(change?.revision) && Number.isInteger(previousShadow?.revision)
      && change.revision < previousShadow.revision) {
      safeRecord({ level: 'info', scope: 'codex-read-recovery', provider: 'codex',
        event: 'desktop-read-recovery-snapshot', outcome: 'superseded', taskRef: threadId,
        details: { reason: 'older-stream-revision', revision: change.revision, previousRevision: previousShadow.revision } })
      return false
    }
    if (!pending) return true
    if (clock() - pending.time > CODEX_DESKTOP_UNREAD_RECOVERY_MS) {
      settlePending(bridge, state, threadId, pending)
      return true
    }
    if (pending.owner && pending.owner !== ownerClientId) return true
    const revision = change?.revision
    const previousRevision = previousShadow?.revision
    if (!Number.isInteger(revision) || !Number.isInteger(previousRevision)) return true
    // Native read-state application disables stream patch broadcasts, and a
    // repeated follow sends the current revision. Equal revisions may therefore
    // carry a changed read value; they are not stale for that reason.
    const unordered = unrevisioned && pending.invalidated && previousShadow?.hasUnreadTurn === true
    const stale = unordered || previousShadow?.ownerClientId === ownerClientId && revision < previousRevision
    if (stale) {
      safeRecord({ level: 'info', scope: 'codex-read-recovery', provider: 'codex',
        event: 'desktop-read-recovery-snapshot', outcome: 'superseded', taskRef: threadId,
        details: { reason: unordered ? 'unordered-legacy-snapshot' : 'older-stream-revision',
          revision, previousRevision } })
      settlePending(bridge, state, threadId, pending)
    }
    return !stale
  }

  function snapshotAccepted(bridge, threadId, shadow, previousShadow, ownerClientId) {
    const state = recoveryState(bridge, false)
    if (!state || typeof threadId !== 'string') return false
    const pending = state.pending.get(threadId)
    if (!pending) return false
    const at = clock()
    if (!Number.isFinite(pending.time) || at - pending.time > CODEX_DESKTOP_UNREAD_RECOVERY_MS) {
      settlePending(bridge, state, threadId, pending)
      return false
    }
    const owner = typeof ownerClientId === 'string' && ownerClientId ? ownerClientId : undefined
    const nextRevision = shadow?.revision
    const previousRevision = previousShadow?.revision
    if ((pending.owner && pending.owner !== owner) || !Number.isInteger(nextRevision)
      || (previousShadow?.ownerClientId === owner && Number.isInteger(previousRevision) && nextRevision < previousRevision)
      || (pending.owner && Number.isInteger(pending.revision) && nextRevision < pending.revision)) return false
    if (pending.invalidated || pending.refreshAgain) {
      // Do not borrow read state from a request issued before the latest read
      // event/source edge. Other snapshot fields keep their existing path.
      shadow.hasUnreadTurn = previousShadow?.hasUnreadTurn
      shadow.unreadEvidence = previousShadow?.unreadEvidence || ''
      settlePending(bridge, state, threadId, pending)
      safeRecord({ level: 'info', scope: 'codex-read-recovery', provider: 'codex',
        event: 'desktop-read-recovery-snapshot', outcome: 'superseded', taskRef: threadId,
        details: { reason: pending.refreshAgain ? 'newer-source-edge' : 'newer-read-evidence' } })
      return false
    }
    settlePending(bridge, state, threadId, pending)
    if (shadow?.hasUnreadTurn !== false) return false
    const live = bridge.liveUnread instanceof Map ? bridge.liveUnread.get(threadId) : undefined
    if (live && live === pending.liveUnread && live.hasUnreadTurn === true) bridge.liveUnread.delete(threadId)
    safeRecord({ level: 'info', scope: 'codex-read-recovery', provider: 'codex',
      event: 'desktop-read-recovery-snapshot', outcome: live === pending.liveUnread ? 'observed' : 'superseded',
      taskRef: threadId, details: { reason: 'snapshot-read-confirmed', revision: nextRevision,
        previousRevision, requestedRevision: pending.revision,
        sameRevisionReadChanged: nextRevision === previousRevision && previousShadow?.hasUnreadTurn === true,
        clearedExactUnread: live === pending.liveUnread && live?.hasUnreadTurn === true } })
    return live === pending.liveUnread && pending.liveUnread?.hasUnreadTurn === true
  }

  function clear(bridge, revokeBinding = false) {
    if (!bridge || typeof bridge !== 'object') return
    codexDesktopUnreadRecoveryBridges.delete(bridge)
    if (revokeBinding !== true || !bridge.readStateBinding) return
    delete bridge.readStateBinding
    clearPersistedBaseline(bridge)
    clearReboundEvidence(bridge)
    safeRecord({ level: 'info', scope: 'codex-read-recovery', provider: 'codex',
      event: 'desktop-read-binding', outcome: 'invalidated',
      details: { reason: 'transport-reset' } })
  }

  return {
    fingerprint,
    bindingChanged,
    persistenceFailed,
    notificationAccepted,
    snapshotAllowed,
    snapshotAccepted,
    clear
  }
}

/**
 * `read` for an EyPc-open live false or an exact read event, `unread` for an
 * exact unread event, null when there is no exact evidence at all. A refollow
 * snapshot is not exact evidence and is left to the caller.
 */
function desktopReadEvidence(input = {}) {
  const cached = input.liveUnread && typeof input.liveUnread === 'object' ? input.liveUnread : null
  const live = input.connected === true || cached?.ownerClientId === 'eypc-open' ? cached : null
  const shadow = input.shadow && typeof input.shadow === 'object' ? input.shadow : null
  if (cached?.ownerClientId === 'eypc-open' && cached.hasUnreadTurn === false) return 'read'
  const exact = shadow?.unreadEvidence === 'event'
    ? shadow
    : live?.unreadEvidence === 'event' ? live : null
  if (exact && typeof exact.hasUnreadTurn === 'boolean') return exact.hasUnreadTurn ? 'unread' : 'read'
  return null
}

/** The last Desktop-persisted connector value, or `unavailable` when none was ever recorded. */
function persistedConnectorUnread(known) {
  const unreadAuthority = known?.connectorUnreadAuthority === 'desktop-persisted'
    ? 'desktop-persisted'
    : 'unavailable'
  return {
    hasUnreadTurn: unreadAuthority === 'desktop-persisted' && known?.connectorHasUnreadTurn === true,
    unreadAuthority
  }
}

module.exports = {
  CODEX_DESKTOP_UNREAD_EVIDENCE_REVISION,
  parseCodexDesktopUnreadState,
  codexReadStateContextBinding,
  codexDesktopReadNotificationDecision,
  codexDesktopUnreadReadFailureReason,
  createCodexDesktopUnreadRecovery,
  desktopReadEvidence,
  persistedConnectorUnread
}
