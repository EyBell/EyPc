---
id: eypc-codex-fixed-debounce-delays-terminal-confirmation
status: candidate
scope: project
fingerprint: codex-live-status-lag__fixed-activity-debounce-and-full-inventory-scan-delayed-completion__push-immediate-ongoing-and-confirm-one-latest-turn
first_seen: 2026-07-26
last_verified: 2026-07-27
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
tags:
  - codex-companion
  - live-status
  - targeted-confirmation
  - debounce
  - conservative-fallback
  - privacy-boundary
---

# Confirm One Latest Turn Instead Of Debouncing Every Activity Delta

## Symptom

The Codex task surface could remain behind the native Desktop state by a visibly large interval. A two-second cache was suspected, but the local configuration and source had separate clocks: a 15-second full inventory reconciliation, a 1500ms completion presentation hold, and a former fixed two-second Activity Delta debounce. After that debounce was removed, new inventory could still wait behind a fixed structural coalescing delay or an already-running scan, and strong targeted completion could still be held as if it were ordinary snapshot evidence.

## Wrong Assumption

Every non-input activity change was treated as noise that should wait for a generic debounce, while a full inventory scan was treated as the normal way to discover the latest completed Turn. That coupled high-frequency status feedback to an expensive all-thread reconciliation and exposed provider anomalies as separate product states.

## Candidate Root Cause

The live channel knew exactly which task left active, but it did not carry a fresh latest-Turn result. The Controller therefore saw only an active-to-idle transition and waited for both a fixed debounce and a later full scan before it could receive authoritative completion evidence.

## Evidence

- A read-only local observation longer than three minutes showed the native Codex list and EyPc float both holding four ongoing tasks; the steady state matched, but no natural transition occurred, so transition latency is not runtime-verified.
- The local persisted settings were 15 seconds for task reconciliation and 1500ms for completion presentation. The former is structurally expensive because a verified scan enumerates unarchived inventory and reads the latest Turn for every eligible thread.
- [preload/index.js](../../../preload/index.js#L1) now reacts to a Desktop active exit with one cancellable, single-flight latest-Turn request bounded to three seconds. It emits only anonymous status/timestamps and asks for a full inventory refresh only when confirmation is exhausted.
- [codexController.ts](../../../src/runtime/codexController.ts#L1) applies Activity Delta immediately, records the active-exit timestamp, and starts any configured completion presentation hold from that event rather than after the targeted request returns.
- [codex.ts](../../../src/domain/codex.ts#L1) permits only explicit latest-Turn completed evidence to leave ongoing. Abnormal, missing and authority-loss states remain `ongoing/running/blocked-active`.
- Focused contracts in [codexAppServerBridge.test.ts](../../../tests/platform/codexAppServerBridge.test.ts#L1) and [codexController.test.ts](../../../tests/runtime/codexController.test.ts#L1) cover the one-thread request, privacy projection, immediate delta application and absence of an extra two-second delay. They were updated but not executed under the project validation rule.

## Detection Order

1. Separate every configured or hard-coded clock: full reconciliation, watchdog, targeted request deadline, presentation hold and downstream UI timers.
2. Observe native and product counts long enough to distinguish steady-state correctness from transition latency; do not claim a latency measurement when no transition occurs.
3. Trace the exact live event that identifies the changed entity before considering faster full polling.
4. Inspect whether the live delta carries enough authoritative completed evidence. If not, query only that entity's newest Turn with a bounded request and reject an unchanged pre-active completed revision.
5. Keep unknown, failure, interruption and timeout conservative in the product projection; only explicit completion may enable completion/archive.
6. Verify that the presentation hold begins at the real transition event and that no generic debounce or consumer-local timer stacks behind it.
7. Retain a slower full reconciliation for new inventory, project changes and missed events.

## Prevention Rule

Do not reduce a verified all-thread inventory interval merely to improve one task's live status. Use the live provider event to identify the task, publish conservative ongoing immediately, fetch only its newest authoritative Turn within a bounded deadline, and fall back to full reconciliation only when targeted confirmation fails. New-task/turn events may use a short coalesced dirty-entity scan, but a periodic scan must remain complete for missed-event recovery. An event arriving during a scan must schedule one follow-up. Generic debounce or a presentation hold must not sit behind already-targeted strong completion evidence. Only explicit completed evidence may leave ongoing or enable archive.

## Latest Applicable Implementation

- Desktop push owns exact active/input/approval transitions.
- Active exit starts a three-second bounded single-task latest-Turn confirmation with immediate, 300ms and 1000ms attempts.
- Activity Delta V2 may include only sanitized latest-Turn status and timestamps; raw IDs and Turn content stay in preload. A prior completed revision must not satisfy a later active exit.
- Controller applies deltas immediately and derives any configured completion presentation deadline from active exit.
- Urgent structural events coalesce for 50ms; event scans reuse session-verified Turn cache for unchanged tasks and reread dirty/uncached tasks, while no-event periodic scans remain complete. A pending event after an in-flight scan is replayed once.
- An unregistered Desktop main-task shadow remains preload-only until verified inventory can assign an anonymous key/project/action alias; it can then publish exact waiting-input without another Desktop round trip.
- Fifteen-second task refresh remains a structural reconciliation setting; 1500ms remains a user-configurable ordinary-completion presentation hold, not a cache or completion detector. `targeted-after-exit` completed bypasses that hold.
- All non-completed abnormal/unconfirmed states remain ongoing and unarchivable.

## Alternative Route

- Status: `candidate`; source and contracts are complete, but a real native active-to-completed transition has not been accepted.
- Preconditions: a privacy-safe live event identifies one changed task and the provider exposes a bounded latest-Turn metadata read.
- Ordered steps: publish ongoing; start one cancellable targeted request; emit sanitized completed evidence on success; request full reconciliation on exhaustion; apply one shared projection; start presentation hold from the original exit event.
- Verification: one active exit causes one target Turn read in the success case; no raw identity/content crosses the bridge; completion does not wait for the 15-second scan or an extra two-second debounce; failure/interruption/disconnect remains ongoing and archive-disabled.
- Fallback: when a targeted method is unavailable or repeatedly fails, retain ongoing and schedule the existing verified inventory scan. Never infer completion from idle, notLoaded, elapsed time or retry count.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-26 | RAW-089 real-time status correction | Large perceived status delay and a requirement that uncertain/abnormal states display as ongoing | Fixed two-second delta debounce plus later all-thread latest-Turn scan; separate abnormal/unknown product states | Push immediate ongoing, bounded single-task latest-Turn confirmation, completion-only exit, full scan as reconciliation | candidate; steady-state observed, static verification pending, real transition acceptance pending |
| 2026-07-27 | RAW-092 positive-signal fast path | New tasks, waiting-input and completion still felt late while count/status jitter had to remain filtered | One structural delay/scan path for both positive additions and negative uncertainty; in-flight events could wait for later scheduling; targeted completion still used the ordinary hold | 50ms urgent coalescing, dirty-task cached event scan, in-flight replay, pending Desktop shadow and targeted completion direct publish | candidate; source/contracts synchronized, real transition latency acceptance pending |
