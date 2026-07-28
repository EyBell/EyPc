---
id: eypc-codex-stale-live-active-needs-completion-order
status: candidate
scope: project
fingerprint: codex-task-status-mismatch__stale-desktop-active-shadow-reapplied-by-inventory-refresh__record-active-interval-and-let-strictly-later-completedat-supersede
first_seen: 2026-07-27
last_verified: 2026-07-27
review_after: 2026-08-27
evidence:
  - preload/index.js
  - public/preload.js
  - src/domain/codex.ts
  - src/runtime/codexController.ts
  - tests/domain/codex.test.ts
  - tests/runtime/codexController.test.ts
  - vibe/specs/260718/1148-codex-quota-float/verify.md
tags:
  - codex-companion
  - desktop-ipc
  - active-shadow
  - status-projection
  - latest-turn
  - privacy-boundary
---

# An Old Live Active Shadow Must Not Outrank A Newer Completion

## Symptom

Codex and EyPc could disagree about a task's current state: EyPc retained a task in ongoing even though its newest Turn was already explicitly completed. The stale row could persist through repeated ordinary inventory refreshes rather than settling after the normal completion presentation window.

## Wrong Assumption

Desktop live `active` was treated as permanently higher priority than persisted terminal evidence. Re-publishing the same shadow during each full inventory scan implicitly made an old observation appear current, even though the bridge had not observed a new active transition.

## Candidate Root Cause

[preload/index.js](../../../preload/index.js#L1) retained a Desktop active shadow across inventory rebuilds and projected it again without an interval boundary. [codex.ts](../../../src/domain/codex.ts#L1) correctly gave desktop-live active priority, but had no evidence ordering that could distinguish an old active observation from a later explicit completed Turn.

## Evidence

- A user-visible task-status mismatch showed ongoing rows alongside a completed row where the task lifecycle was no longer coherent.
- [preload/index.js](../../../preload/index.js#L1) and [public/preload.js](../../../public/preload.js#L1) now record `desktopActiveSince` only on a snapshot/patch entering active, retain it through ordinary inventory projection, and clear it on active exit or live-authority loss. A replacement active snapshot inherits the previous shadow's `desktopActiveSince` instead of replacing it with `Date.now()`, so a resubscribe or owner change cannot push the interval past an already-known `completedAt`.
- [codex.ts](../../../src/domain/codex.ts#L1) and [codexController.ts](../../../src/runtime/codexController.ts#L1) accept a latest explicit completion only when `completedAt > desktopActiveSince`; absent, earlier or non-completed evidence keeps the desktop-live task active.
- [codex.test.ts](../../../tests/domain/codex.test.ts#L1) and [codexController.test.ts](../../../tests/runtime/codexController.test.ts#L1) contain the domain and Activity Delta V2 contracts. They are updated but intentionally unexecuted under the project validation rule.

## Detection Order

1. Compare the displayed task state with the newest explicit Turn status and timestamps, without using recency or elapsed time as a terminal inference.
2. Trace whether a full inventory rebuild republishes an existing Desktop active shadow after that completed Turn.
3. Determine whether the active observation is a new interval or merely the same stored shadow being re-emitted.
4. Carry only an anonymous local interval timestamp across preload; do not carry a raw ID, body, cwd, path or private patch data.
5. Permit completion to supersede active only when the latest Turn is explicit `completed` and its completion time is strictly later than the active interval timestamp.
6. Verify new active intervals, missing timestamps, older/equal completions and uncertain states remain active/ongoing.

## Prevention Rule

Desktop live active is authoritative for the active interval it actually observed, not for an unbounded future. Record one anonymous local start time when active begins; do not renew it during ordinary inventory re-projection. A latest Turn may displace that active only with explicit `completed` status and a strictly later `completedAt`. Never replace this ordering rule with a timeout, generic recency check, connector status or missing-Turn inference.

## Latest Applicable Implementation

- The preload creates `desktopActiveSince` on active snapshot entry or non-active-to-active patch transition, retains it for that same shadow, clears it on inactive/authority reset, and aggregates Side Chats using the latest still-active child interval.
- Activity Delta V2 and full inventory pass only the anonymous timestamp with the existing anonymous key and sanitized status fields.
- Domain and Controller apply the identical strict ordering rule before assigning active priority or preserving active lifecycle state.
- The ordinary configurable completion presentation hold still governs already-proven ordinary completion; the interval timestamp does not add a second delay.

## Alternative Route

- Status: `candidate`; source contracts are updated, and real preload-reloaded acceptance remains pending.
- Preconditions: an existing desktop-live active projection, a current anonymous task mapping, and a latest Turn that provides explicit status/timestamps.
- Ordered steps: preserve the active interval timestamp through full inventory projection; accept only a strictly later completed Turn; project completion through the existing shared presentation owner; retain active for every incomplete or ambiguous comparison.
- Verification: an old active interval followed by a later completed Turn leaves ongoing after the configured ordinary completion window; a genuinely new active interval remains active; no interval timestamp and older/equal completion do not complete; renderer-visible payload contains no raw identity/content.
- Fallback: when the interval time or explicit later completion is unavailable, preserve the existing conservative active/ongoing state and wait for ordinary verified evidence.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-27 | RAW-096 stale active observation ordering | User reported visible Codex/EyPc current-task state mismatch | Re-applied an old Desktop active shadow on every full inventory scan without interval ordering | Record one anonymous active observation time and let only a strictly later explicit completion supersede it | candidate; static source contracts complete, real host acceptance pending |
| 2026-07-27 | RAW-096 snapshot replacement interval leak | User reported completed task still shown as ongoing after RAW-096 interval fix | Replacement active snapshot from resubscribe/owner change overwrote `desktopActiveSince` with `Date.now()`, pushing it past `completedAt` | Inherit previous shadow's `desktopActiveSince` on active→active snapshot replacement; bridge test contract added | candidate; source/mirror/test synchronized, real preload reload acceptance pending |
| 2026-07-27 | RAW-102 click remint false active | User saw Codex stop while sidebar/EyPc still showed in-progress; click cleared then revived it | Click/focus briefly cleared active then reminted a newer `desktopActiveSince` after an already completed Turn | Supersede reminted active when latest Turn remains completed without waiting flags; verify stale active with targeted Turn read | candidate; source/mirror/tests updated, host acceptance pending |
