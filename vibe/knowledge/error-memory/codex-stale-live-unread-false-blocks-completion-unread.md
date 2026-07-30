---
id: eypc-codex-stale-live-unread-false-blocks-completion-unread
status: verified
scope: project
fingerprint: codex-completion-unread-latency__pre-completion-live-hasUnreadTurn-false-outranks-persisted-unread__clear-stale-false-then-refresh-persisted-on-targeted-completion
first_seen: 2026-07-27
last_verified: 2026-07-30
review_after: 2026-09-30
evidence:
  - user-observed-late-completed-unread
  - preload-source-inspection
  - static-syntax-and-mirror-check
  - late-native-unread-watcher-regression
tags:
  - codex-companion
  - desktop-ipc
  - unread-state
  - completion
  - latency
---

# Clear Stale Live Unread=false On Fresh Completion

## Symptom

A task that clearly finished stayed out of「已完成未读」for a long time, then finally appeared. Compact or delayed inventory eventually corrected it.

## Wrong Assumption

Once Desktop live had emitted `hasUnreadTurn=false` during an active run, that live false remained authoritative after the Turn completed, so persisted Codex unread and later file flushes could not promote completed-unread until a later live true patch or a full 15s inventory path won.

## Verified Root Cause

`refreshPersistedUnread` and live publish treated any boolean snapshot unread as indefinitely live, including a pre-completion/refollow `false`. Targeted completion could clear the current false and retry briefly, but a late native-file write or replayed snapshot false could still leave the task in「已完成」instead of「已完成未读」. There was no event path from the later `.codex-global-state.json` replacement to an anonymous unread delta.

## Evidence

- [preload/index.js](../../../preload/index.js#L3882) resolves unread by evidence class: explicit live event first, live true second, then Codex-persisted state before snapshot false.
- [preload/index.js](../../../preload/index.js#L5020) watches the native state directory read-only, coalesces changes and publishes changed unread as `readStateOnly`.
- [codexAppServerBridge.test.ts](../../../tests/platform/codexAppServerBridge.test.ts#L633) proves that a late native unread write overrides stale snapshot false without carrying activity fields.
- [codexController.test.ts](../../../tests/runtime/codexController.test.ts#L734) proves that the resulting read-only delta moves completed to completed-unread without resurrecting activity.
- Companion record: [codex-desktop-unread-missing-field-fallback.md](codex-desktop-unread-missing-field-fallback.md#L1) still owns omitted live fields; this record owns stale explicit false across the active→completed boundary.

## Correct Detection Order

1. Confirm latest Turn `completed` evidence (cache, targeted-after-exit, or verifyStaleActive RPC).
2. Classify unread evidence as initial/refollow snapshot or exact read-state event.
3. Prefer exact event false/true, then live true, then Codex-persisted state; snapshot false is only the last negative fallback.
4. Observe later native-state replacement read-only and publish only anonymous `readStateOnly` when the derived value changes.
5. Never invent unread, replay activity, expose a native path or let a local receipt become upstream unread authority.

## Prevention Rule

Never let initial/refollow snapshot `hasUnreadTurn=false` permanently outrank a later Codex-persisted unread true. Preserve explicit post-completion read-state event false as the stronger acknowledgement, and transport native-file changes as read-state only.

## Occurrence History

| Date | Trigger | Failed route | Recovery | Outcome |
| --- | --- | --- | --- | --- |
| 2026-07-27 | Completed-unread appeared only after delayed inventory | Clear pre-completion false and retry for 3s | Targeted completion refresh | Candidate; late file writes remained uncovered |
| 2026-07-30 | Codex sidebar showed a blue dot while EyPc omitted completed-unread | Snapshot false stayed live after native unread file changed | Evidence-aware precedence plus native-state watcher | Verified by Bridge and Controller regressions |

## Alternative Route

- Preconditions: user reports late or missing completed-unread after a visible Turn completion; live shadow or liveUnread still holds `false`.
- Ordered steps: classify snapshot/event evidence; keep exact events strongest; allow persisted true over snapshot false; watch native state replacement; emit `readStateOnly` only.
- Verification: Bridge late-write regression and Controller completed→completed-unread regression pass; preload canonical/public mirror and syntax checks pass.
- Applicability boundary: does not invent unread from missing fields; does not write Codex native unread; does not clear an explicit post-completion live read.
- Fallback: if persisted and live both unavailable, keep unknown/read projection until Codex authority arrives.
- Status: verified
