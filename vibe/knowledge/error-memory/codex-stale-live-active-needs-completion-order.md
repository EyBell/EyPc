---
id: eypc-codex-stale-live-active-needs-completion-order
status: verified
scope: project
fingerprint: codex-task-status-mismatch__stale-desktop-snapshot-outranks-newer-live-event__order-positive-and-terminal-events-above-initial-refollow-replay
first_seen: 2026-07-27
last_verified: 2026-07-29
review_after: 2026-08-27
evidence:
  - preload/index.js
  - public/preload.js
  - src/domain/codex.ts
  - src/runtime/codexController.ts
  - tests/domain/codex.test.ts
  - tests/runtime/codexController.test.ts
  - tests/platform/codexAppServerBridge.test.ts
  - vibe/specs/260718/1148-codex-quota-float/verify.md
tags:
  - codex-companion
  - desktop-ipc
  - active-shadow
  - status-projection
  - latest-turn
  - privacy-boundary
---

# Old Desktop Snapshots Must Not Outrank Newer Activity Or Completion

## Symptom

Codex and EyPc could disagree in both directions: an old active snapshot kept completed work ongoing, while an old `idle + interrupted` snapshot kept a newly resumed active task stopped. Either stale row could survive refollow and periodic inventory reconstruction.

## Wrong Assumption

Initial/refollow Desktop snapshots were treated as permanently newer than events from another live channel. That let replayed active outrank a later completion and, conversely, let replayed idle outrank an exact App Server active/Turn-started event.

## Verified Root Cause

[preload/index.js](../../../preload/index.js#L1) retained a Desktop active shadow across inventory rebuilds and projected it again without an interval boundary. After interval ordering was added, `codexDesktopShadowFromSnapshot` still minted `desktopActiveSince=Date.now()` for every active subscription snapshot, so a terminal task could receive a new interval merely because the bridge followed it again. [codex.ts](../../../src/domain/codex.ts#L1) correctly gives established desktop-live active priority; the missing distinction was subscription replay versus an actually observed activity transition.

The reverse defect remained in the App Server notification handler: `thread/status/changed=active` updated only connector fallback whenever a Desktop shadow already existed. A stale Desktop idle snapshot therefore retained `desktop-live` authority over the fresh positive event and kept a resumed interrupted task in stopped. The corrected bridge records session-only `app-server-live`, preserves it across snapshot replay/inventory rebuild, and clears it only on exact terminal/non-active evidence or a Desktop non-active activity patch.

## Evidence

- A user-visible task-status mismatch showed ongoing rows alongside a completed row where the task lifecycle was no longer coherent.
- [preload/index.js](../../../preload/index.js#L1) and [public/preload.js](../../../public/preload.js#L1) now record `desktopActiveSince` only on a snapshot/patch entering active, retain it through ordinary inventory projection, and clear it on active exit or live-authority loss. A replacement active snapshot inherits the previous shadow's `desktopActiveSince` instead of replacing it with `Date.now()`, so a resubscribe or owner change cannot push the interval past an already-known `completedAt`.
- [codex.ts](../../../src/domain/codex.ts#L1) and [codexController.ts](../../../src/runtime/codexController.ts#L1) accept a latest explicit completion only when `completedAt > desktopActiveSince`; absent, earlier or non-completed evidence keeps the desktop-live task active.
- [codex.test.ts](../../../tests/domain/codex.test.ts#L1) and [codexController.test.ts](../../../tests/runtime/codexController.test.ts#L1) contain the domain and Activity Delta V2 contracts. They are updated but intentionally unexecuted under the project validation rule.
- RAW-112 read-only correlation showed three anonymous rows as `desktop-live active` while all three latest Turns were `interrupted`; their active observation times were minted within the same millisecond-scale subscription burst. [codexAppServerBridge.test.ts](../../../tests/platform/codexAppServerBridge.test.ts#L1) now contains the uncorroborated active-snapshot and real-new-Turn recovery contract; it is intentionally unexecuted.

## Detection Order

1. Compare the displayed task state with the newest explicit Turn status and timestamps, without using recency or elapsed time as a terminal inference.
2. Trace whether a full inventory rebuild republishes an existing shadow or a follow subscription replaces it with an active snapshot after that terminal Turn.
3. Determine whether active came from a runtime/request patch or fresh inProgress Turn, versus the first snapshot replay of a subscription.
4. For a conflicting first snapshot, keep ongoing while rereading only that latest Turn through the existing bounded schedule; track a session-only activity revision and never settle across a patch, waiting request, remap or failed read.
5. Carry only an anonymous local interval timestamp across preload; do not carry a raw ID, body, cwd, path or private patch data.
6. Permit completion to supersede an established interval only when the latest Turn is explicit `completed` and its completion time is strictly later; permit an uncorroborated snapshot to settle only after an unchanged final successful terminal read.
7. Verify real new activity, waiting flags, missing timestamps, older/equal completions, read failures and uncertain bridge states remain active/ongoing.

## Prevention Rule

Desktop live active is authoritative for an interval actually observed through activity change or fresh Turn evidence, not for an unbounded future. A subscription's first snapshot is replay evidence and must not silently mint permanent authority over an already terminal Turn. Preserve ongoing during the existing bounded corroboration, then suppress only the same unchanged snapshot whose final successful reread remains terminal. Record one anonymous local start time for established active and do not renew it during inventory re-projection. Never replace these ordering rules with a timeout, generic recency check, connector status, read failure or missing-Turn inference.

Apply the same ordering in reverse: an initial/refollow idle snapshot must not suppress a later exact App Server active or Turn-started event. Connector inventory active remains insufficient; only a live event creates `app-server-live`, and only later explicit terminal/non-active evidence revokes it.

Do not rebuild the removed filter stack. A plain completed shape cannot close live activity, `completedAt` is not mandatory for an exact completed notification, and same-revision exact started/targeted inProgress is forward progress. Keep only strict older-revision rejection plus the bounded initial-snapshot/active-exit checks.

## Latest Applicable Implementation

- The preload creates `desktopActiveSince` on active snapshot entry or non-active-to-active patch transition, retains it for that same shadow, clears it on inactive/authority reset, and aggregates Side Chats using the latest still-active child interval.
- Activity Delta V2 and full inventory pass only the anonymous timestamp with the existing anonymous key and sanitized status fields.
- Domain and Controller apply the identical strict ordering rule before assigning active priority or preserving active lifecycle state.
- The preload keeps `activityRevision` and `suppressUncorroboratedActive` process-only. Runtime/request patches clear suppression and advance the revision; a complete newer `turn/started` restores active without scheduling an extra latest-Turn read. The initial-snapshot path reuses `[0,300,1000]` and requires the unchanged final successful terminal result.
- The ordinary configurable completion presentation hold still governs already-proven ordinary completion; the interval timestamp does not add a second delay.

## Alternative Route

- Status: `verified` by Bridge/Domain regressions; real preload-reloaded host acceptance remains pending.
- Preconditions: an existing or newly replayed desktop-live active projection, a current anonymous task mapping, and a latest Turn that provides explicit status/timestamps.
- Ordered steps: distinguish snapshot replay from real transition; preserve ongoing while corroborating the conflicting snapshot; settle only the unchanged final successful terminal result; preserve established interval timestamps through full inventory projection; project terminal state through the existing shared presentation owner.
- Verification: an interrupted/completed active subscription snapshot settles after the bounded reads; a genuine activity patch or fresh inProgress Turn remains active and cancels settlement; waiting/read failure/revision changes do not complete; renderer-visible payload contains no raw identity/content.
- Fallback: when the shadow changes, a read fails, or explicit terminal evidence is unavailable, preserve conservative active/ongoing and wait for ordinary verified evidence.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-27 | RAW-096 stale active observation ordering | User reported visible Codex/EyPc current-task state mismatch | Re-applied an old Desktop active shadow on every full inventory scan without interval ordering | Record one anonymous active observation time and let only a strictly later explicit completion supersede it | candidate; static source contracts complete, real host acceptance pending |
| 2026-07-27 | RAW-096 snapshot replacement interval leak | User reported completed task still shown as ongoing after RAW-096 interval fix | Replacement active snapshot from resubscribe/owner change overwrote `desktopActiveSince` with `Date.now()`, pushing it past `completedAt` | Inherit previous shadow's `desktopActiveSince` on active→active snapshot replacement; bridge test contract added | candidate; source/mirror/test synchronized, real preload reload acceptance pending |
| 2026-07-27 | RAW-102 click remint false active | User saw Codex stop while sidebar/EyPc still showed in-progress; click cleared then revived it | Click/focus briefly cleared active then reminted a newer `desktopActiveSince` after an already completed Turn | Supersede reminted active when latest Turn remains completed without waiting flags; verify stale active with targeted Turn read | candidate; source/mirror/tests updated, host acceptance pending |
| 2026-07-29 | RAW-112 initial follow snapshot replay | User saw two terminal tasks remain ongoing and a real current task raise the count to three | Fresh follow snapshots replayed stale active for terminal interrupted Turns and minted all intervals together | Preserve ongoing through bounded Turn corroboration; suppress only an unchanged terminal snapshot; restore immediately on activity/waiting/new Turn; bump task-state revision | candidate; source/public mirror/test contract updated, reload acceptance pending |
| 2026-07-30 | RAW-124 stale idle over resumed activity | A real ongoing task was displayed as stopped after an earlier interruption | App Server exact active was ignored whenever an old Desktop idle shadow already owned status authority | Add `app-server-live`, retain it through refollow/inventory replay, and clear it only on explicit later terminal/non-active evidence | verified by 38/38 Bridge and Domain regression; real host reload pending |
| 2026-07-30 | RAW-125 over-filter audit | Repeated state fixes still left exact starts/completions behind shape, same-revision and completedAt gates | Multiple owners independently revalidated the same live/terminal edge | Close live only with confirmed completion provenance; allow same-revision forward status and exact completion without completedAt | verified by 40/40 Bridge and 152/152 Codex matrix; real host reload pending |
