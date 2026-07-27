---
id: eypc-codex-inventory-dropout-is-not-task-deletion
status: candidate
scope: project
fingerprint: codex-task-count-flicker__single-complete-snapshot-omitted-existing-keys-and-replaced-lastthreads__transport-completeness-confused-with-temporal-deletion-proof__hold-stable-inventory-until-same-missing-set-survives-reconciliation
first_seen: 2026-07-26
last_verified: 2026-07-27
review_after: 2026-08-26
evidence:
  - preload/index.js
  - public/preload.js
  - src/runtime/codexController.ts
  - tests/platform/codexAppServerBridge.test.ts
  - tests/runtime/codexController.test.ts
  - vibe/specs/260718/1148-codex-quota-float/raw-requirement.md
  - vibe/specs/260718/1148-codex-quota-float/verify.md
tags:
  - codex-companion
  - inventory
  - transport-dropout
  - task-count
  - snapshot-acceptance
  - monotonic-evidence
---

# A Complete Snapshot Is Not Immediate Task-Deletion Proof

## Symptom

Codex task counts, groups or action slots could change abruptly when one structurally complete App Server snapshot temporarily omitted rows. A later snapshot could restore them, making real tasks look as if they disappeared and reappeared even though only the status/inventory transport had fluctuated.

## Wrong Assumption

The Controller treated Host V2 structural completeness as sufficient temporal deletion authority. Once pagination, project fingerprint and Turn shapes passed, it replaced `lastThreads` immediately, even when the new anonymous key set was lower than the already published stable inventory.

## Candidate Root Cause

Structural completeness proves that one scan followed the protocol; it does not prove that every upstream source returned a temporally stable inventory. Task deletion needs evidence across observations or an explicit verified mutation result. The same boundary also needs monotonic latest-Turn/update evidence so an older status transfer cannot regress an accepted task revision.

## Evidence

- User correction established that abnormal task states and counts can be transport problems rather than real task disappearance.
- [codexController.ts](../../../src/runtime/codexController.ts#L1) now detects missing prior anonymous keys before replacing `lastThreads`, keeps the previous task/project/count projection, marks the lane stale and requests one immediate complete recheck.
- The same missing-key signature must survive at least two complete snapshots plus `max(15s, taskRefreshSeconds)` before the lower inventory publishes. Reappearance, a changed set, an intervening failed/incomplete read, disablement or disposal resets the candidate.
- Activity Delta and full inventory now preserve newer `updatedAt`, latest Turn `startedAt`, completed outcome and `completedAt` against regressive evidence.
- Verified single/project archive and native-project removal paths explicitly remove their targets and reset the candidate, so real user-authorized deletion is not delayed.
- [codexController.test.ts](../../../tests/runtime/codexController.test.ts#L1) contains source contracts for first/immediate-repeat retention, interval-spanning acceptance and Turn-evidence monotonicity. They are updated but not executed under the project validation rule.

## Detection Order

1. Compare the incoming anonymous key set with the last published in-memory inventory before replacing any task/project/count projection.
2. Separate additions from disappearance: additions-only snapshots can publish; any missing prior key creates a disappearance candidate.
3. Keep the last stable projection and perform one immediate complete recheck instead of publishing a lower count.
4. Track the sorted missing-key signature, observation count and first-seen time. Reset when the task reappears, the signature changes or a read is failed/incomplete.
5. Accept disappearance only after the same signature appears in at least two complete observations and spans one configured full-reconciliation interval, with a 15-second minimum.
6. Independently compare latest-Turn and update timestamps; never overwrite a newer revision with an older Turn, same-Turn completed regression or smaller completion/update timestamp.
7. Bypass temporal stabilization only for an explicit mutation result that already passed Host write/revalidation gates.

## Prevention Rule

Do not equate one successful inventory response with deletion authority. Keep the last stable in-memory projection when previously published keys are missing, confirm the identical absence across a real reconciliation interval, and merge status/version evidence monotonically. Do not solve count flicker by persisting task lists, inventing phantom rows, shortening the all-thread poll, or delaying exact Desktop live activity.

## Latest Applicable Implementation

[codexController.ts](../../../src/runtime/codexController.ts#L1) owns the runtime-only disappearance candidate and monotonic evidence merge. The hold duration is `max(15s, taskRefreshSeconds)`; the first omission schedules the ordinary 200ms forced structural refresh. RAW-092 makes the asymmetry explicit: additions/start/turn signals may request a separate 50ms dirty-task scan and publish as soon as a verified additive snapshot arrives, while only missing prior keys enter the disappearance hold. Existing Host completeness, Desktop push, targeted latest-Turn confirmation and completed-only archive gates remain unchanged.

## Alternative Route

- Status: `candidate`; source and contracts are implemented, but a real App Server/Desktop transport dropout has not been accepted.
- Preconditions: a previously published in-memory inventory exists and a later complete snapshot omits one or more of its anonymous keys without a verified EyPc mutation result.
- Ordered steps: retain the published projection; mark the lane stale; request one complete recheck; compare the missing-key signature; reset on recovery/shape change/failure; accept only after two complete observations spanning one full reconciliation interval; keep revisions monotonic throughout.
- Verification: during a one-scan or immediate-repeat omission, task count/group/order/action slots do not change; recovery produces no visible jump; a persistent identical absence converges once after the hold; verified archive/project removal still disappears immediately.
- Applicability boundary: current-process Codex inventory stabilization. A cold start has no prior task list because privacy rules prohibit persisting inventories or raw identity.
- Fallback: when confirmation cannot complete, retain the stable projection as stale and retry through the existing full reconciliation schedule; never fabricate completion or deletion.

## Occurrence History

| Date | Task | Trigger | Failed Route | Evidence | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-07-26 | RAW-090 inventory stability | User clarified that abnormal status/count transfer can omit tasks without real deletion | Immediately replace `lastThreads` after every structurally complete response | User correction plus Controller source trace | Missing-key quarantine, immediate recheck, interval-spanning confirmation and monotonic evidence | candidate; source/link closeout passed, runtime acceptance pending |
| 2026-07-27 | RAW-092 asymmetric status timing | User required new/waiting tasks to appear quickly while abnormal count jitter remained hidden | Applying one generic delay policy to both additions and disappearance would either lag positive feedback or reintroduce count flicker | Existing missing-key rule plus a separate 50ms dirty-task event path for additions; no weakening of deletion proof | Positive additions are immediate after verification, negative disappearance remains interval-confirmed | candidate; contracts updated, real jitter/latency acceptance pending |
