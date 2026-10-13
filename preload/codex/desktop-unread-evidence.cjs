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
  desktopReadEvidence,
  persistedConnectorUnread
}
