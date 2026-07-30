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

RAW-127 showed two residual wakeup blockers: unread true returned immediately for every active row even when that active evidence was stale, and an already running stale-active read could suppress the active-exit/non-active read before ending itself. The current route verifies an ambiguous active row only when it has no waiting request or exact `turn-started`, and the mode-aware single-flight replaces incompatible cycles. Unread remains evidence collection only.

RAW-128 found three later conflicts: a legacy EyPc completion-revision acknowledgement could suppress Codex native unread true; unchanged persisted unread true was reprocessed during ordinary polling, repeatedly restarting the same active-terminal corroboration; and a cold bridge whose first persisted observation was already true could skip its only wake because the inventory projection already contained true. The acknowledgement override is removed and ignored on migration. A session-only observation watermark starts reconciliation once for the first or newly true native value; compatible snapshot evidence reuses the current bounded cycle and ordinary polling cannot restart it.

## Evidence

- [preload/index.js](../../../preload/index.js#L3882) resolves unread by evidence class: explicit live event first, live true second, then Codex-persisted state before snapshot false.
- [preload/index.js](../../../preload/index.js#L1) watches the native state directory read-only, publishes changed unread as `readStateOnly`, and schedules a bounded Turn refresh for non-completed inactive or ambiguous stale-active parents.
- [codexAppServerBridge.test.ts](../../../tests/platform/codexAppServerBridge.test.ts#L1) proves late unread over stale snapshot false, stale interrupted recovery, stale-active verification and incompatible reader replacement without task switching.
- [codexController.test.ts](../../../tests/runtime/codexController.test.ts#L1) proves that read-only deltas never resurrect activity and that the reconciled completion enters completed-unread without a stopped intermediate.
- Companion record: [codex-desktop-unread-missing-field-fallback.md](codex-desktop-unread-missing-field-fallback.md#L1) still owns omitted live fields; this record owns stale explicit false across the active→completed boundary.

## Correct Detection Order

1. If unread becomes true while a task still lacks completed evidence, schedule the ordinary reader for non-active state or `verifyStaleActive` for ambiguous active state; exact `turn-started` and waiting requests remain active and skip this extra read.
2. Confirm latest Turn `completed` evidence (cache, targeted-after-exit, or verifyStaleActive RPC).
3. Classify unread evidence as initial/refollow snapshot or exact read-state event.
4. Prefer exact event false/true, then live true, then Codex-persisted state; snapshot false is only the last negative fallback.
5. Publish the completed Turn with current unread evidence; later native-state replacement remains anonymous `readStateOnly` only.
6. Never invent unread, replay activity, expose a native path or let a local receipt override Codex native unread authority.

## Prevention Rule

Never let initial/refollow snapshot `hasUnreadTurn=false` or an EyPc-only receipt outrank a Codex-persisted unread true. The first available true observation and a later false/unknown→true change may each trigger evidence collection when completion is still unknown—including verification of ambiguous stale-active—but unread cannot itself change Turn/Activity. Track the persisted observation separately from the already-projected value so cold start is not mistaken for an unchanged poll. Compatible evidence reuses the bounded cycle; new evidence or incompatible modes may replace it. Preserve explicit post-completion read-state event false as the stronger acknowledgement, and transport native-file changes as read-state only.

## Occurrence History

| Date | Trigger | Failed route | Recovery | Outcome |
| --- | --- | --- | --- | --- |
| 2026-07-27 | Completed-unread appeared only after delayed inventory | Clear pre-completion false and retry for 3s | Targeted completion refresh | Candidate; late file writes remained uncovered |
| 2026-07-30 | Codex sidebar showed a blue dot while EyPc omitted completed-unread | Snapshot false stayed live after native unread file changed | Evidence-aware precedence plus native-state watcher | Verified by Bridge and Controller regressions |
| 2026-07-30 | Native unread arrived while EyPc still held stale interrupted | Read-only update could not discover the now-completed latest Turn without switching tasks | Late true schedules one bounded targeted Turn read, then shared completion publisher carries current unread | Verified by Bridge 41/41 and state matrix 153/153 |
| 2026-07-30 | RAW-127 stale-active/single-flight audit | Late true could not wake a stale active row, or its new read was suppressed by an incompatible in-flight cycle | Verify ambiguous active only; replace incompatible reader mode; keep exact started/waiting active | Verified by Bridge 45/45 and state matrix 157/157 |
| 2026-07-30 | RAW-128 native-authority/polling audit | Native unread true was hidden by a local completion acknowledgement or repeatedly reset active corroboration | Remove the local override; wake only when native unread changes to true; reuse compatible verification | Verified by Domain/Bridge focused regressions; host reload pending |
| 2026-07-30 | RAW-128 cold-start unread audit | Native unread was already true in both registry projection and first bridge refresh, so equality skipped the only Turn verification wake | Track the first persisted observation independently; first/new true starts one bounded cycle, unchanged polls do nothing | Verified by Bridge 51/51 and state chain 115/115; host reload pending |

## Alternative Route

- Preconditions: user reports late or missing completed-unread after a visible Turn completion; live shadow or liveUnread still holds `false`.
- Ordered steps: classify snapshot/event evidence; keep exact events strongest; allow persisted true over snapshot false; if completion is unknown, launch one bounded Turn read; emit unread changes as `readStateOnly` only and publish any confirmed completion through the existing terminal path.
- Verification: Bridge late-write and stale-interrupted wakeup regressions plus Controller completed-unread sequence pass; preload canonical/public mirror and syntax checks pass.
- Applicability boundary: does not invent unread from missing fields; does not write Codex native unread; does not clear an explicit post-completion live read.
- Fallback: if persisted and live both unavailable, keep unknown/read projection until Codex authority arrives.
- Status: verified
