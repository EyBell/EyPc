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

`refreshPersistedUnread` and live publish treated any boolean snapshot unread as indefinitely live, including a pre-completion/refollow `false`. Targeted completion could clear the current false and retry briefly, but a late native-file write or replayed snapshot false could still leave the task in「已完成」instead of「已完成未读」. The native watcher fixed that direct unread gap, but RAW-126 showed another boundary: when current latest-Turn evidence was still stale interrupted, the later unread true remained read-only and never asked the provider for the now-completed Turn, so Controller could remain stopped until a task switch or full scan.

## Evidence

- [preload/index.js](../../../preload/index.js#L3882) resolves unread by evidence class: explicit live event first, live true second, then Codex-persisted state before snapshot false.
- [preload/index.js](../../../preload/index.js#L1) watches the native state directory read-only, publishes changed unread as `readStateOnly`, and schedules one existing targeted Turn refresh only for non-active, non-completed parents whose unread becomes true.
- [codexAppServerBridge.test.ts](../../../tests/platform/codexAppServerBridge.test.ts#L1) proves both late unread over stale snapshot false and late unread waking a stale interrupted Turn without task switching.
- [codexController.test.ts](../../../tests/runtime/codexController.test.ts#L1) proves that read-only deltas never resurrect activity and that the reconciled completion enters completed-unread without a stopped intermediate.
- Companion record: [codex-desktop-unread-missing-field-fallback.md](codex-desktop-unread-missing-field-fallback.md#L1) still owns omitted live fields; this record owns stale explicit false across the active→completed boundary.

## Correct Detection Order

1. If unread becomes true while a non-active task still lacks completed evidence, schedule the existing single-flight latest-Turn read; do not infer completion from unread.
2. Confirm latest Turn `completed` evidence (cache, targeted-after-exit, or verifyStaleActive RPC).
3. Classify unread evidence as initial/refollow snapshot or exact read-state event.
4. Prefer exact event false/true, then live true, then Codex-persisted state; snapshot false is only the last negative fallback.
5. Publish the completed Turn with current unread evidence; later native-state replacement remains anonymous `readStateOnly` only.
6. Never invent unread, replay activity, expose a native path or let a local receipt become upstream unread authority.

## Prevention Rule

Never let initial/refollow snapshot `hasUnreadTurn=false` permanently outrank a later Codex-persisted unread true. A late true may trigger evidence collection when completion is still unknown, but it cannot itself change Turn/Activity. Preserve explicit post-completion read-state event false as the stronger acknowledgement, and transport native-file changes as read-state only.

## Occurrence History

| Date | Trigger | Failed route | Recovery | Outcome |
| --- | --- | --- | --- | --- |
| 2026-07-27 | Completed-unread appeared only after delayed inventory | Clear pre-completion false and retry for 3s | Targeted completion refresh | Candidate; late file writes remained uncovered |
| 2026-07-30 | Codex sidebar showed a blue dot while EyPc omitted completed-unread | Snapshot false stayed live after native unread file changed | Evidence-aware precedence plus native-state watcher | Verified by Bridge and Controller regressions |
| 2026-07-30 | Native unread arrived while EyPc still held stale interrupted | Read-only update could not discover the now-completed latest Turn without switching tasks | Late true schedules one bounded targeted Turn read, then shared completion publisher carries current unread | Verified by Bridge 41/41 and state matrix 153/153 |

## Alternative Route

- Preconditions: user reports late or missing completed-unread after a visible Turn completion; live shadow or liveUnread still holds `false`.
- Ordered steps: classify snapshot/event evidence; keep exact events strongest; allow persisted true over snapshot false; if completion is unknown, launch one bounded Turn read; emit unread changes as `readStateOnly` only and publish any confirmed completion through the existing terminal path.
- Verification: Bridge late-write and stale-interrupted wakeup regressions plus Controller completed-unread sequence pass; preload canonical/public mirror and syntax checks pass.
- Applicability boundary: does not invent unread from missing fields; does not write Codex native unread; does not clear an explicit post-completion live read.
- Fallback: if persisted and live both unavailable, keep unknown/read projection until Codex authority arrives.
- Status: verified
