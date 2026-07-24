---
id: eypc-codex-desktop-unread-missing-field-fallback
status: candidate
scope: project
fingerprint: codex-desktop-live-unread__optional-live-field-was-treated-as-false-and-overwrote-confirmed-persisted-fallback__preserve-persisted-unread-until-explicit-live-read-state
first_seen: 2026-07-24
last_verified: 2026-07-24
review_after: 2026-08-24
evidence:
  - user-observed-state-mismatch
  - preload-source-inspection
  - static-syntax-and-mirror-check
tags:
  - codex-companion
  - desktop-ipc
  - unread-state
  - optional-field
  - input-required
---

# Preserve Confirmed Unread When Live Fields Are Optional

## Symptom

Completed-unread tasks could disappear from that state after a Desktop live snapshot or patch that omitted its unread field. Waiting-input could also be missed when an otherwise known Desktop request name used underscore or other separators.

## Wrong Assumption

An omitted optional live unread field was treated as a definite read/unknown value and overwrote the previously confirmed Codex persisted unread result. Request matching assumed only the observed casing and separator spelling.

## Candidate Root Cause

The bridge stored one mutable unread value without retaining the authority of its persisted fallback. Its live publish path therefore wrote an unavailable value whenever the optional field was absent. Separately, request name checks matched literals before normalizing separators.

## Evidence

- [preload/index.js](../../../preload/index.js#L1673) narrows known request identifiers by removing separators, while `waitingOnUserInput` remains available only from exact Desktop live `active` shadows.
- [preload/index.js](../../../preload/index.js#L1686) preserves `desktop-persisted` unread authority as an explicit fallback; [the bridge publish path](../../../preload/index.js#L2110) selects live read-state first and that fallback only when the live field is absent.
- [preload/index.js](../../../preload/index.js#L2297) refreshes the persisted unread baseline without replacing an explicit live value; the initial inventory stores both authority channels.
- [verify.md](../../specs/260718/1148-codex-quota-float/verify.md#L36) records the user acceptance matrix for RAW-081.

## Detection Order

1. Confirm the activity is an exact Desktop live `active` state before examining request flags.
2. Distinguish an explicit live `hasUnreadTurn` value, an explicit live read-state message, and an omitted live field.
3. If the field is omitted, read only the latest successful Codex persisted unread authority; if that source is unavailable, remain unknown.
4. Keep persisted fallback data separate from transient live read-state so an explicit read event cannot rewrite the fallback baseline.
5. Normalize only separators in the existing known request identifiers; do not broaden the accepted semantic classes.
6. Never use connector active, `notLoaded`, recency, elapsed time or ordinary refresh as unread, completion or input evidence.

## Prevention Rule

Optional live fields are not negative values. Preserve the last confirmed fallback with its authority, let explicit live events win, and degrade to unknown only when all authorized sources are absent. Normalize harmless spelling separators only after constraining the known protocol vocabulary and source authority.

## Alternative Route

- Status: `candidate`; static source checks pass, while user Desktop acceptance remains pending.
- Preconditions: a provider supplies optional live fields and a second trusted persisted read source exists.
- Ordered steps: store source-specific unread authority; apply explicit live read-state first; apply snapshot/patch unread only when boolean; otherwise retain persisted fallback; normalize known request identifiers; aggregate Side Chat unread without exporting raw IDs.
- Verification: an omitted live unread field preserves completed-unread, an explicit live read clears it, and underscore/hyphen/camel-case forms of known active input requests all produce waiting-input without connector/recency inference.
- Applicability boundary: this does not make the persisted unread set a source of live input/approval/running state, and it does not turn unknown into completion evidence.
- Fallback: when the persisted source cannot be read, publish unread authority as unknown and retain the existing host-unknown behavior.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-24 | RAW-081 live state fallback | User reported inaccurate waiting-input and completed-unread states | Missing live unread was written as unavailable, and request spelling required exact separators | Retained persisted unread authority, kept explicit live read-state priority, and normalized separators for existing known request names | candidate; static source/mirror checks pass, user Desktop acceptance pending |
