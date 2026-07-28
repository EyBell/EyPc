---
id: eypc-codex-stale-live-unread-false-blocks-completion-unread
status: candidate
scope: project
fingerprint: codex-completion-unread-latency__pre-completion-live-hasUnreadTurn-false-outranks-persisted-unread__clear-stale-false-then-refresh-persisted-on-targeted-completion
first_seen: 2026-07-27
last_verified: 2026-07-27
review_after: 2026-08-27
evidence:
  - user-observed-late-completed-unread
  - preload-source-inspection
  - static-syntax-and-mirror-check
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

## Candidate Root Cause

`refreshPersistedUnread` and live publish prefer any boolean live unread, including a pre-completion `false`. Targeted completion deltas (`targeted-after-exit`) often published `completed` while still carrying that stale false, so the domain kept the task in「已完成」instead of「已完成未读」.

## Evidence

- [preload/index.js](../../../preload/index.js#L3121) clears only pre-completion live `false` when publishing targeted completion, then immediately reads Codex persisted unread for that thread.
- [preload/index.js](../../../preload/index.js#L3204) `publishTargetedCompletion` pairs completion evidence with unread refresh; [scheduleCompletionUnreadRefresh](../../../preload/index.js#L3210) retries within the same 3s / `[0,300,1000]` bound used for Turn refresh without inventing unread from missing fields.
- Explicit post-completion live `false` from `thread-read-state-changed` is not cleared on retries, preserving RAW-081/097 read acknowledgement.
- Companion record: [codex-desktop-unread-missing-field-fallback.md](codex-desktop-unread-missing-field-fallback.md#L1) still owns omitted live fields; this record owns stale explicit false across the active→completed boundary.

## Correct Detection Order

1. Confirm latest Turn `completed` evidence (cache, targeted-after-exit, or verifyStaleActive RPC).
2. On that fresh completion publish, drop only live unread `false` that predated the completion.
3. Prefer remaining live `true`; otherwise read Codex persisted unread immediately.
4. If still not unread, retry persisted reads inside the existing Turn-refresh deadline; never treat omitted unread as false completion, and never invent unread without Codex live/persisted authority.
5. Active without waiting flags may verify latest Turn at active entry so completion is not gated only on the 15s full scan.

## Prevention Rule

When publishing a fresh targeted completion, never let a pre-completion live `hasUnreadTurn=false` block Codex persisted unread. Refresh unread in the same completion publish path.

## Alternative Route

- Preconditions: user reports late or missing completed-unread after a visible Turn completion; live shadow or liveUnread still holds `false`.
- Ordered steps: clear stale live false on targeted completion; apply persisted unread; schedule bounded unread retries; verify active-entry Turn check when not waiting.
- Verification: after uTools preload reload, a newly completed task enters「已完成未读」with completion rather than after the next full inventory.
- Applicability boundary: does not invent unread from missing fields; does not write Codex native unread; does not clear an explicit post-completion live read.
- Fallback: if persisted and live both unavailable, keep unknown/read projection until Codex authority arrives.
- Status: candidate
