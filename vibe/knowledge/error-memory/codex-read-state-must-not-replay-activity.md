---
id: eypc-codex-read-state-must-not-replay-activity
status: candidate
scope: project
fingerprint: codex-native-read-marks-completed-task-ongoing__read-state-event-replayed-full-live-shadow__emit-unread-only-v2-entry-and-ignore-activity-at-controller
first_seen: 2026-07-27
last_verified: 2026-07-27
review_after: 2026-08-27
evidence:
  - preload/index.js
  - public/preload.js
  - src/domain/codex.ts
  - src/runtime/codexController.ts
  - tests/runtime/codexController.test.ts
  - tests/platform/codexAppServerBridge.test.ts
  - vibe/specs/260718/1148-codex-quota-float/verify.md
tags:
  - codex-companion
  - desktop-ipc
  - read-state
  - unread-authority
  - activity-delta
  - status-projection
---

# Read State Must Not Replay Activity

## Symptom

After the user manually read a completed-unread task in Codex Desktop, EyPc could present that task as ongoing instead of completed.

## Wrong Assumption

A native unread notification can safely resend the complete current Desktop live shadow.

## Candidate Root Cause

`thread-read-state-changed` and stream patches containing only `hasUnreadTurn` re-emitted the full known activity entry. The Controller consequently accepted stale status, active flags, active interval and latest-Turn data together with the intended unread update.

## Evidence

- [preload/index.js](../../../preload/index.js#L1) and [public/preload.js](../../../public/preload.js#L1) classify direct native read-state and unread-only patches before publishing V2.
- [src/domain/codex.ts](../../../src/domain/codex.ts#L1) defines the `readStateOnly` marker, and [src/runtime/codexController.ts](../../../src/runtime/codexController.ts#L1) limits its application to unread fields.
- [tests/runtime/codexController.test.ts](../../../tests/runtime/codexController.test.ts#L1) rejects malicious accompanying activity data; [tests/platform/codexAppServerBridge.test.ts](../../../tests/platform/codexAppServerBridge.test.ts#L1) covers direct native read-state and unread-only patches.
- [verify.md](../../specs/260718/1148-codex-quota-float/verify.md#L8) records the controlled acceptance boundary.

## Detection Order

1. Identify whether the incoming event is native read-state or a patch whose only observed state root is `hasUnreadTurn`.
2. Inspect the outbound V2 shape and ensure it contains only anonymous key, unread value and unread authority.
3. Verify that applying this shape cannot change status, active flags, active interval or latest Turn, even if those fields are maliciously present.
4. Preserve full activity deltas for actual runtime/request changes.

## Prevention Rule

Read-state is unread authority only. A read-state V2 entry must not carry or apply activity, active flags, active interval or Turn evidence. It may change only the completed-unread versus completed presentation; actual runtime/request changes retain full activity authority.

## Latest Applicable Implementation

Preload marks direct `thread-read-state-changed` and `hasUnreadTurn`-only patch publication as `readStateOnly`, strips the public entry to read-state fields and applies the same rule to aggregated Side Chats. The Controller preserves all activity and Turn fields whenever that marker is present.

## Alternative Route

Preconditions: the provider introduces a distinct canonical read-state event shape or V3 delta contract.

1. Preserve the same unread-only semantic in the new adapter rather than translating it into a generic activity delta.
2. Keep a hostile-payload contract proving activity fields are ignored on the read path.
3. Verify the native completed-unread to completed transition after preload reload without running a live task as active.

Applicability boundary: this rule applies to native read/unread state, not to runtime or unresolved-request events. If event classification is ambiguous, retain the conservative full activity path until the protocol is explicitly documented.

## Occurrence History

- 2026-07-27 / RAW-097: user reported that manually reading in Codex made a completed task appear ongoing; source trace found full live-shadow replay. The source now isolates read-state, while runtime acceptance remains user-owned.
