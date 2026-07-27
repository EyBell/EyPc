---
id: eypc-codex-explicit-archive-event-bypasses-inventory-quarantine
status: candidate
scope: project
fingerprint: codex-external-archive-not-disappearing__explicit-archive-event-was-reduced-to-generic-inventory-change__carry-only-known-anonymous-key-and-urgently-revalidate
first_seen: 2026-07-27
last_verified: 2026-07-27
review_after: 2026-08-27
evidence:
  - src/runtime/codexController.ts
  - preload/index.js
  - vibe/specs/260718/1148-codex-quota-float/raw-requirement.md
  - vibe/specs/260718/1148-codex-quota-float/verify.md
tags:
  - codex-companion
  - archive
  - activity-delta
  - inventory-quarantine
  - privacy-boundary
---

# Explicit Archive Events Are Not Generic Inventory Dropouts

## Symptom

After a task was archived in Codex, EyPc could continue showing it for one or more ordinary reconciliation periods. The behavior looked like the completed-state delay, but it affected a completed task that was already absent from the upstream unarchived inventory.

## Wrong Assumption

Treating every external `thread-archived` signal as only `inventoryChanged=true` was assumed safe because RAW-090 correctly protects against transient lower inventory snapshots. That loses the fact that an explicit provider event already identifies a particular published task.

## Candidate Root Cause

The preload converted both Desktop and App Server archive events into a generic structural refresh without forwarding an anonymous task key. The Controller then saw only a missing row in the next full snapshot and held the old projection until the same missing set survived its `max(15s, taskRefreshSeconds)` quarantine.

## Evidence

- [preload/index.js](../../../preload/index.js#L1) previously emitted an empty Activity Delta for explicit archive events; it now emits only the existing anonymous key when the current preload inventory maps that event.
- [codexController.ts](../../../src/runtime/codexController.ts#L1) keeps generic lower inventories behind RAW-090, but removes a mapped `archivedKeys` entry immediately and schedules an urgent full revalidation.
- The task's active requirement and static source trace are recorded in [raw-requirement.md](../../specs/260718/1148-codex-quota-float/raw-requirement.md#L1) as RAW-095.

## Detection Order

1. Distinguish a provider's explicit archive event from an ordinary complete snapshot with fewer rows.
2. Verify that preload can map the event to a currently published anonymous key without exposing the raw thread ID.
3. Confirm the delta carries only that anonymous key and requests urgent reconciliation.
4. Confirm the Controller removes only a key that exists in its current projection, clears transient local receipt state, and immediately schedules a full read.
5. Confirm unarchive, delete, unknown or malformed events cannot remove a row; ordinary missing-key snapshots remain subject to RAW-090.

## Prevention Rule

When a compatible provider explicitly reports that one currently mapped task was archived, propagate only its already-public anonymous key across preload, remove that exact key from the shared projection, and immediately revalidate through the ordinary verified inventory read. Do not lower the global reconciliation interval or weaken generic missing-key quarantine. Unknown, unarchive, delete and malformed events must not fabricate deletion.

## Latest Applicable Implementation

Activity Delta V2 optionally carries `archivedKeys`. Both the Desktop `thread-archived` broadcast and App Server `thread/archived` notification emit the field only after the preload resolves the event against its active mapping. The Controller filters the field against `lastThreads`, removes only the matching projection/receipt state, and promotes the structural refresh to urgent. Raw IDs, paths, bodies and private event payloads remain preload-only.

## Alternative Route

- Status: `candidate`; source behavior is reviewed, but a real external Codex archive after preload reload has not yet been accepted.
- Preconditions: a compatible Desktop or App Server archive notification and a current preload raw-ID-to-anonymous-key mapping.
- Ordered steps: resolve the key privately; emit the key plus `inventoryChanged`/urgent; remove it only if currently projected; immediately run the ordinary full inventory read; restore the row if the verified read still contains it.
- Verification: one external archive disappears without waiting for the normal missing-key hold; a generic lower snapshot still waits; unarchive/unknown events do not remove a row; no raw identity or body appears in the delta or renderer.
- Applicability boundary: this changes event-driven presentation only. Archive mutation authorization, exact preflight and false/true upstream archive verification remain governed by [codex-archive-revalidation-fail-open.md](codex-archive-revalidation-fail-open.md#L1).
- Fallback: when no current mapping exists or the event is unsupported, retain the row until the existing verified reconciliation can establish its state.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-27 | RAW-095 explicit archive fast path | User reported an already archived Codex task remained visible in EyPc | Reduced the explicit event to a generic inventory refresh, so RAW-090 held the old task | Carry only a mapped anonymous key, remove it immediately, and request urgent revalidation | candidate; source implementation complete, real host acceptance pending |
