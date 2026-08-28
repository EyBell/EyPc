---
id: eypc-codex-inventory-dropout-is-not-task-deletion
status: candidate
scope: project
fingerprint: codex-task-count-flicker__single-complete-snapshot-omitted-existing-keys-and-replaced-lastthreads__transport-completeness-confused-with-temporal-deletion-proof__hold-stable-inventory-until-same-missing-set-survives-reconciliation
first_seen: 2026-07-26
last_verified: 2026-08-28
review_after: 2026-11-28
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

Structural completeness proves that one scan followed the protocol; it does not prove that every upstream source returned a temporally stable inventory. Task deletion needs evidence across observations or an explicit verified mutation result. RAW-128 showed that this protection must be row-scoped: retaining the entire old projection also blocks valid completion/unread changes for rows that are still present. The same boundary needs monotonic latest-Turn/update/provenance evidence so an older status transfer cannot regress an accepted task revision.

## Evidence

- User correction established that abnormal task states and counts can be transport problems rather than real task disappearance.
- [codexController.ts](../../../src/runtime/codexController.ts#L1) detects missing prior anonymous keys before replacing `lastThreads`, retains only those missing rows plus required project metadata, applies all present rows, marks the lane stale and requests one immediate complete recheck.
- The same missing-key signature must survive at least two complete snapshots across the fixed three-second quarantine before the lower inventory publishes. Reappearance, a changed set, an intervening failed/incomplete read, disablement or disposal resets the candidate.
- Activity Delta and full inventory now preserve newer `updatedAt`, latest Turn `startedAt`, completed outcome and `completedAt` against regressive evidence.
- Verified single/project archive and native-project removal paths explicitly remove their targets and reset the candidate, so real user-authorized deletion is not delayed.
- [codexController.test.ts](../../../tests/runtime/codexController.test.ts#L1) contains source contracts for first/immediate-repeat retention, interval-spanning acceptance and Turn-evidence monotonicity. They are updated but not executed under the project validation rule.

## Detection Order

1. Compare the incoming anonymous key set with the last published in-memory inventory before replacing any task/project/count projection.
2. Separate additions from disappearance: additions-only snapshots can publish; any missing prior key creates a disappearance candidate.
3. Keep only missing rows from the last stable projection, publish present-row updates immediately, and perform one immediate complete recheck instead of publishing a lower count.
4. Track the sorted missing-key signature, observation count and first-seen time. Reset when the task reappears, the signature changes or a read is failed/incomplete.
5. Accept disappearance only after the same signature appears in at least two complete observations and spans one configured full-reconciliation interval, with a 15-second minimum.
6. Independently compare latest-Turn and update timestamps; never overwrite a newer revision with an older Turn, same-Turn completed regression or smaller completion/update timestamp.
7. Bypass temporal stabilization only for an explicit mutation result that already passed Host write/revalidation gates.

## Prevention Rule

Do not equate one successful inventory response with deletion authority, and do not turn deletion uncertainty into a batch-wide status freeze. Retain only missing rows, publish present rows immediately, confirm the identical absence across a real reconciliation interval, and merge status/version/provenance evidence monotonically. Do not solve count flicker by persisting task lists, inventing phantom rows, shortening the all-thread poll, or delaying exact Desktop live activity.

## Latest Applicable Implementation

[codexController.ts](../../../src/runtime/codexController.ts#L1) owns the runtime-only disappearance candidate, row merge and monotonic evidence merge. The hold is a fixed three seconds and the first omission schedules one Provider-only structural recheck. Additions/start/turn signals publish through trusted push or a gap-triggered dirty-task read；only missing prior keys enter quarantine. There is no periodic task-inventory setting.

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
| 2026-07-30 | RAW-128 row-scoped quarantine | A lower snapshot omitted one task while another present task completed/unread | Retained the entire previous projection until disappearance confirmation | Controller regression plus global status-chain audit | Merge present rows immediately and retain only missing rows through the existing hold | automated Controller contract verified; real host dropout acceptance pending |

| 2026-08-28 | 逾期 candidate 复核 | validate:error-memory 报告复核窗口过期 | 无——本轮为复核而非再尝试 | 见备注 | 未改动实现 | candidate；2026-08-28 复核：读取真机运行诊断日志（2026-08-27T13:42Z→2026-08-28T03:25Z，21387 事件，运行构建 host-8a1420a1a591c710f6fa 即当前 HEAD，零 error 零 warn）。**不能据此结案**：该窗口内 Codex Provider 几乎未被使用（带 provider 字段的事件 claude 42 / cursor 18 / codex 1，末次 cold-preflight 显示 codex 源未启用），且本记录关注的失败路径没有专门日志埋点，事件缺失属无效证据而非无复发证明。状态维持 candidate。待验收项：任务数量/分组不因传输波动而增删。 |