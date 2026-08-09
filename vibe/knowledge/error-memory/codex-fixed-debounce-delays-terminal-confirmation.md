---
id: eypc-codex-fixed-debounce-delays-terminal-confirmation
status: candidate
scope: project
fingerprint: codex-live-status-lag__fixed-activity-debounce-and-full-inventory-scan-delayed-completion__push-immediate-ongoing-and-confirm-one-latest-turn
first_seen: 2026-07-26
last_verified: 2026-08-08
review_after: 2026-08-26
evidence:
  - preload/index.js
  - public/preload.js
  - src/domain/codex.ts
  - src/runtime/codexController.ts
  - src/FloatApp.vue
  - tests/platform/codexAppServerBridge.test.ts
  - tests/runtime/codexController.test.ts
  - vibe/specs/260718/1148-codex-quota-float/verify.md
  - bidirectional-waiting-edge-phase-only-watchdog-regressions
tags:
  - codex-companion
  - live-status
  - targeted-confirmation
  - debounce
  - conservative-fallback
  - privacy-boundary
  - waiting-edge-watchdog
---

# Confirm One Latest Turn Instead Of Debouncing Every Activity Delta

## 更新引入（2026-08-08，RAW-151）

本记录的“定向而非全量”原则现扩展到待输入的两条边，但不复用 completion reader 猜测状态。请求新增/解除、新 Turn 和 matching rollout output 直接进入共享 reducer；漏通知时，Controller 每 1 秒调用 phase-only Activity 快照，Preload 只复核已登记候选。任一有效 Desktop snapshot/patch、App Server 状态/Turn 或 rollout 文件新证据都会取消当前定向重订；若新证据自身仍与 live owner 冲突，才开启一轮新的有界复核。该 watchdog 不读取 unread、quota、inventory 或全量 latest Turn，也不受 `taskRefreshSeconds=0/86400`、当前 Tab 或悬浮窗可见性影响；缺少明确新证据时保持现状并退避。

## Symptom

The Codex task surface could remain behind the native Desktop state by a visibly large interval. A two-second cache was suspected, but the local configuration and source had separate clocks: a 15-second full inventory reconciliation, a 1500ms completion presentation hold, and a former fixed two-second Activity Delta debounce. After that debounce was removed, new inventory could still wait behind a fixed structural coalescing delay or an already-running scan, and strong targeted completion could still be held as if it were ordinary snapshot evidence.

## Wrong Assumption

Every non-input activity change was treated as noise that should wait for a generic debounce, while a full inventory scan was treated as the normal way to discover the latest completed Turn. That coupled high-frequency status feedback to an expensive all-thread reconciliation and exposed provider anomalies as separate product states.

## Verified Source Root Cause / Host Latency Pending

The live channel knew exactly which task left active, but it did not always carry a fresh latest-Turn result. The Controller therefore saw only an active-to-idle transition and historically waited for both a fixed debounce and a later full scan before it could receive authoritative completion evidence.

RAW-135 verified one remaining source-level delay after those holds were removed: an exact App Server `turn/completed` notification may contain only the thread identity. The generic fallback scheduled `verifyStaleActive`, but the same thread's existing exact-positive activity waterline correctly rejected stale-active verification. That left only `inventoryChanged=urgent`, so the 50ms Controller coalescer launched an all-thread inventory scan and real completion could still appear 1–2 seconds later. The corrected route gives this exact notification its own completion-event mode and never treats it as stale-active evidence. Real uTools latency after reload remains pending user acceptance, so the record stays `candidate` rather than claiming host verification.

## Evidence

- A read-only local observation longer than three minutes showed the native Codex list and EyPc float both holding four ongoing tasks; the steady state matched, but no natural transition occurred, so transition latency is not runtime-verified.
- The local persisted settings were 15 seconds for task reconciliation and 1500ms for completion presentation. The former is structurally expensive because a verified scan enumerates unarchived inventory and reads the latest Turn for every eligible thread.
- [preload/index.js](../../../preload/index.js#L1) now reacts to a Desktop active exit with one cancellable, single-flight latest-Turn request bounded to three seconds. It emits only anonymous status/timestamps and asks for a full inventory refresh only when confirmation is exhausted.
- [codexController.ts](../../../src/runtime/codexController.ts#L1) applies Activity Delta immediately and publishes any completion that passes the Turn revision/status gate without a second presentation hold.
- A payload-less exact `turn/completed` now resolves the known main/Side Chat target, reads only that latest Turn immediately, and retries after 25/75/150/300/600/1000ms inside the existing three-second deadline. New positive activity cancels the reader; only exhaustion returns to urgent full inventory.
- [codex.ts](../../../src/domain/codex.ts#L1) permits only explicit latest-Turn completed evidence to leave ongoing. Abnormal, missing and authority-loss states remain `ongoing/running/blocked-active`.
- Focused contracts in [codexAppServerBridge.test.ts](../../../tests/platform/codexAppServerBridge.test.ts#L1) and [codexController.test.ts](../../../tests/runtime/codexController.test.ts#L1) cover the one-thread request, privacy projection, immediate delta application and absence of an extra two-second delay. They were updated but not executed under the project validation rule.

## Detection Order

1. Separate every configured or hard-coded clock: full reconciliation, watchdog, targeted request deadline, structural event coalescing and downstream UI timers; verify that no completion presentation hold remains active.
2. Observe native and product counts long enough to distinguish steady-state correctness from transition latency; do not claim a latency measurement when no transition occurs.
3. Trace the exact live event that identifies the changed entity before considering faster full polling.
4. Inspect whether the live delta carries enough authoritative completed evidence. If not, query only that entity's newest Turn with a bounded request and reject an unchanged pre-active completed revision.
5. Keep unknown, failure, interruption and timeout conservative in the product projection; only explicit completion may enable completion/archive.
6. Verify that accepted completion reaches the shared atomic projection immediately and that no generic debounce, presentation hold or consumer-local timer stacks behind it.
7. Retain a slower full reconciliation for new inventory, project changes and missed events.

## Prevention Rule

Do not reduce a verified all-thread inventory interval merely to improve one task's live status. Use the live provider event to identify the task, publish conservative ongoing immediately, fetch only its newest authoritative Turn within a bounded deadline, and fall back to full reconciliation only when targeted confirmation fails. New-task/turn events may use a short coalesced dirty-entity scan, but a periodic scan must remain complete for missed-event recovery. An event arriving during a scan must schedule one follow-up. Generic debounce or a presentation hold must not sit behind already-targeted strong completion evidence. Only explicit completed evidence may leave ongoing or enable archive.

For waiting-input, do not fall back to the complete inventory at all: use one bidirectional reducer, target-scoped `0/50/150/300/600/1000ms` resubscribe through 1.25 seconds, and a one-second phase-only watchdog over registered rollout candidates. Cancel the current cycle on any valid Desktop/App Server/rollout evidence; restart only for a newly observed conflict. Recovery timeout is diagnostic, not evidence that waiting ended.

## Latest Applicable Implementation

- Desktop push owns exact active/input/approval transitions.
- Active exit starts a three-second bounded single-task latest-Turn confirmation with immediate, 300ms and 1000ms attempts.
- A known exact completion event without a usable Turn payload uses the denser completion-only table: immediate, then 25/75/150/300/600/1000ms. It accepts only completed with valid `startedAt`, never failed/interrupted, and remains cancellable by a newer activity epoch.
- Activity Delta V2 may include only sanitized latest-Turn status and timestamps; raw IDs and Turn content stay in preload. A prior completed revision must not satisfy a later active exit.
- Controller applies deltas immediately; RAW-120 removes every completion presentation deadline.
- Urgent structural events coalesce for 50ms; event scans reuse session-verified Turn cache for unchanged tasks and reread dirty/uncached tasks, while no-event periodic scans remain complete. A pending event after an in-flight scan is replayed once.
- An unregistered Desktop main-task shadow remains preload-only until verified inventory can assign an anonymous key/project/action alias; it can then publish exact waiting-input without another Desktop round trip.
- Fifteen-second task refresh remains a structural reconciliation setting. The legacy completion-delay field is absent from normalized runtime settings, and exact/cached/targeted/full-snapshot completion all publish immediately after the same revision/status gate.
- All non-completed abnormal/unconfirmed states remain ongoing and unarchivable.

## Alternative Route

- Status: `candidate`; source and contracts are complete, but a real native active-to-completed transition has not been accepted.
- Preconditions: a privacy-safe live event identifies one changed task and the provider exposes a bounded latest-Turn metadata read.
- Ordered steps: publish ongoing while evidence is unresolved; start one cancellable targeted request; emit sanitized completed evidence on success; request full reconciliation on exhaustion; apply one shared projection immediately without a presentation hold.
- Verification: one active exit causes one target Turn read in the success case; a payload-less exact completion succeeds with one targeted read or, when the first result is still inProgress, retries at 25ms without a full inventory read; no raw identity/content crosses the bridge; completion does not wait for the configured structural scan or an extra display debounce; failure/interruption/disconnect remains ongoing and archive-disabled.
- Fallback: when a targeted method is unavailable or repeatedly fails, retain ongoing and schedule the existing verified inventory scan. Never infer completion from idle, notLoaded, elapsed time or retry count.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-26 | RAW-089 real-time status correction | Large perceived status delay and a requirement that uncertain/abnormal states display as ongoing | Fixed two-second delta debounce plus later all-thread latest-Turn scan; separate abnormal/unknown product states | Push immediate ongoing, bounded single-task latest-Turn confirmation, completion-only exit, full scan as reconciliation | candidate; steady-state observed, static verification pending, real transition acceptance pending |
| 2026-07-27 | RAW-092 positive-signal fast path | New tasks, waiting-input and completion still felt late while count/status jitter had to remain filtered | One structural delay/scan path for both positive additions and negative uncertainty; in-flight events could wait for later scheduling; targeted completion still used the ordinary hold | 50ms urgent coalescing, dirty-task cached event scan, in-flight replay, pending Desktop shadow and targeted completion direct publish | candidate; source/contracts synchronized, real transition latency acceptance pending |
| 2026-07-30 | RAW-120 evidence-only completion | Exact task state made the remaining ordinary completion hold and cross-clock filters redundant | Treated proven completion as presentation noise after its revision/status had already been accepted | Remove the hold and cross-clock ordering; retain only bounded evidence reconciliation and inventory protection | focused bridge/Controller/Domain/UI/type verification passed; real uTools acceptance pending |
| 2026-07-30 | RAW-121 terminal epoch closure | An accepted completion could later return to ongoing after a full snapshot | Kept the active-exit baseline after terminal acceptance, so the next identical inventory row reused a guard that belonged to the closed epoch | Clear the baseline when terminal evidence survives the guard; add targeted-completed → identical-full-snapshot regression coverage | automated status chain passed; real uTools acceptance pending |
| 2026-07-31 | RAW-135 payload-less exact completion | User observed completed synchronization still lagging 1–2 seconds after presentation holds were removed | Routed an exact completed notification without Turn data through stale-active verification; the exact-positive waterline rejected it, forcing urgent all-thread inventory | Add a completion-event single-flight with immediate + 25/75/150/300/600/1000ms entity reads, positive-epoch cancellation and full-scan fallback only on exhaustion | Four related files `165/165`, typecheck, production build and uTools runtime validation passed; real uTools latency acceptance pending |
| 2026-08-08 | RAW-151 bidirectional waiting watchdog | Input request creation and resolution could each lag or disappear behind missed callback/full reconciliation | Treated full inventory as a practical fallback and lacked a symmetric removal/new-Turn lane | Add one reducer, target-only bounded resubscribe and 1-second phase-only candidate watchdog independent of inventory frequency | focused automated P95/recovery contracts pass; real v7 uTools acceptance pending |
