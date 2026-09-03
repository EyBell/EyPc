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
  desktopReadEvidence,
  persistedConnectorUnread
}
