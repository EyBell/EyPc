'use strict'

/**
 * Single timing policy for the companion runtime.
 *
 * These numbers encode product contracts, not tuning knobs, and each was
 * previously written out once per consumer — six separate `1000`s across five
 * files for one policy. Changing the policy then meant finding every copy, and
 * a missed one is invisible until a watcher behaves differently from its
 * siblings. The semantics live here, at the definition, rather than being
 * re-explained at each call site.
 */

/**
 * Recovery interval for registered files and directories.
 *
 * The fast path is the native callback; this StatWatcher exists **only** to
 * recover a dropped notification. It must never become the path of record, and
 * raising its frequency is not a way to make anything feel faster — that would
 * turn a recovery net into a poll, which the product contract forbids.
 */
const WATCHER_RECOVERY_INTERVAL_MS = 1_000

/**
 * Structural-event merge window.
 *
 * Zero means "merge inside the current microtask, publish on the next frame" —
 * equivalent evidence collapses without any wall-clock wait. This is not a
 * debounce delay and must not be raised to smooth display: waiting windows were
 * deliberately removed from the completion path and cannot return here.
 */
const DEFAULT_COALESCE_MS = 0

module.exports = {
  WATCHER_RECOVERY_INTERVAL_MS,
  DEFAULT_COALESCE_MS
}
