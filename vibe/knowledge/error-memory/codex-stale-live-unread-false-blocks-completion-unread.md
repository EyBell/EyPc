---
id: eypc-codex-stale-live-unread-false-blocks-completion-unread
status: verified
scope: project
fingerprint: codex-unread-replay-conflict__missed-read-event-plus-stale-native-membership-or-unconfirmed-open__exact-session-event-then-current-snapshot-false-then-native-set-over-snapshot-true__session-only-successful-open
first_seen: 2026-07-27
last_verified: 2026-08-03
review_after: 2026-11-01
evidence:
  - user-observed-late-completed-unread
  - preload-source-inspection
  - static-syntax-and-mirror-check
  - late-native-unread-watcher-regression
  - reconnect-persisted-false-over-snapshot-true-regression
  - active-extension-read-event-before-plugin-connect-timeline
  - reconnect-snapshot-false-over-stale-persisted-true-regression
  - successful-host-open-session-read-regression
  - full-verify-722-of-722
  - real-utools-1.2.33-open-counter-2-to-1
  - transient-native-read-no-intermediate-unread-frame-regression
  - same-turn-completed-at-enrichment-read-ack-regression
  - older-full-snapshot-after-opened-read-generation-barrier
tags:
  - codex-companion
  - desktop-ipc
  - unread-state
  - completion
  - latency
---

# Codex Unread Conflicts Need Directional Replay Authority

## Symptom

A task that clearly finished could stay out of「已完成未读」for a long time, while a task read in Codex during an EyPc interruption could return as「已完成未读」after EyPc reopened. In the repeated 2026-08-03 incident, Codex already displayed the task as read, but EyPc retained completed-unread; clicking the EyPc card also lacked an explicit read acknowledgement.

## Wrong Assumption

One total order could cover every disagreement: either native persistence always outranks reconnect snapshots, or every open is merely navigation and must wait for Codex/App Server to publish read state.

## Verified Root Cause

`refreshPersistedUnread` and live publish originally treated any boolean snapshot unread as indefinitely live, including a pre-completion/refollow `false`. Targeted completion could clear the current false and retry briefly, but a late native-file write or replayed snapshot false could still leave the task in「已完成」instead of「已完成未读」. The native watcher fixed that direct unread gap, but RAW-126 showed another boundary: when current latest-Turn evidence was still stale interrupted, the later unread true remained read-only and never asked the provider for the now-completed Turn, so Controller could remain stopped until a task switch or full scan.

RAW-127 showed two residual wakeup blockers: unread true returned immediately for every active row even when that active evidence was stale, and an already running stale-active read could suppress the active-exit/non-active read before ending itself. The current route verifies an ambiguous active row only when it has no waiting request or exact `turn-started`, and the mode-aware single-flight replaces incompatible cycles. Unread remains evidence collection only.

RAW-128 found three later conflicts: a legacy EyPc completion-revision acknowledgement could suppress Codex native unread true; unchanged persisted unread true was reprocessed during ordinary polling, repeatedly restarting the same active-terminal corroboration; and a cold bridge whose first persisted observation was already true could skip its only wake because the inventory projection already contained true. The acknowledgement override is removed and ignored on migration. A session-only observation watermark starts reconciliation once for the first or newly true native value; compatible snapshot evidence reuses the current bounded cycle and ordinary polling cannot restart it.

RAW-137 exposed one reconnect conflict: the resolver checked snapshot `true` before current native nonmembership, so a task read while EyPc was off stayed unread. It initially treated snapshot `false` versus persisted `true` as symmetric and therefore made the whole parseable native set stronger than snapshots.

RAW-138 proved that symmetry was incorrect. The active Codex extension emitted exact `thread-read-state-changed=false` before the newly launched plugin connected; App Server has no read-state replay contract, and the native unread set still contained the task. The refollow snapshot was the only current replayable read fact, but stale persisted `true` suppressed it. Conversely, snapshot `true` still cannot create unread against current native nonmembership. Unread arbitration is therefore directional: exact session events first; then current snapshot `false`; then parseable native membership/nonmembership over snapshot `true`; finally snapshots only when native state is unavailable. A confirmed EyPc Host open is another session-only exact false. A new completion clears any older false so the next completion can become unread.

RAW-142 isolated the remaining visual instability: during an atomic native-state replacement, a read can momentarily lose the unread atom while the Desktop refollow snapshot still says `true`. A full inventory rebuild also replaces the public activity object, so relying only on that object's persisted fields can publish one wrong completed-unread frame and then correct it when the file becomes readable. The Desktop Bridge already owns the last successful native observation; reusing that membership/nonmembership across the object replacement stabilizes the source without a Renderer timer. Exact events, refollow false and the next successful native set still override immediately.

RAW-144 found a second recurrence source after a successful open. The process-level acknowledgement was keyed by started/completed timestamps. App Server may later enrich the same Turn with a larger `completedAt`; treating that metadata correction as a new completion released the acknowledgement and allowed stale native unread to reappear. The acknowledgement now requires a concrete Turn and prefers the sanitized internal Turn ID. Same-ID time enrichment stays read, while a different Turn/active epoch still releases it. The ID never crosses the public bridge. The uTools `shellOpenExternal` fallback also establishes the same acknowledgement when the host does not explicitly reject dispatch, and Controller's existing generation barrier is now covered by an unread-specific reverse-race test.

## Evidence

- [preload/index.js](../../../preload/index.js#L1) resolves unread directionally: exact Desktop or successful-open session event first, then current snapshot false, then current parseable native-set membership/nonmembership over snapshot true, then source-unavailable fallback.
- [preload/index.js](../../../preload/index.js#L1) watches the native state directory read-only, publishes changed unread as `readStateOnly`, and schedules a bounded Turn refresh for non-completed inactive or ambiguous stale-active parents.
- The active Codex extension log proves the exact read event preceded the latest plugin process/package launch; the current native state still retained unread membership, so neither App Server nor persistence could replay the already-visible Codex read state.
- RAW-139 host inspection found that an installed latest ASAR did not prove the existing float had adopted it: the visible child initially ran an older preload, then switched to the current 1.2.33 asset only after plugin activation. Under the correct preload, one real card click opened the expected Codex task and immediately moved the plugin count from 2 to 1, while native unread stayed true by design. Runtime-version identity must therefore precede conclusions about acknowledgement behavior.
- [codexAppServerBridge.test.ts](../../../tests/platform/codexAppServerBridge.test.ts#L1) proves snapshot false over stale persisted true, persisted false over snapshot true, exact-event override, successful/failed Host-open behavior, Side Chat parent aggregation, stale interrupted recovery and v11/v2 plus bounded v6/v1 protocol handling.
- [codexController.test.ts](../../../tests/runtime/codexController.test.ts#L1) proves that read-only deltas never resurrect activity and that the reconciled completion enters completed-unread without a stopped intermediate.
- RAW-142's Bridge regression forces native unread availability → transient atom absence → full inventory replacement + refollow snapshot true, and asserts every emitted entry remains false; it detects an intermediate wrong frame rather than checking only the final state.
- RAW-144's Bridge regression opens a completed-unread task, delivers a larger `completedAt` for the same internal Turn ID, and proves every later inventory/read remains false. A Controller regression then resolves an older full snapshot after the newer opened-read delta and proves completed-unread never reappears.
- Companion record: [codex-desktop-unread-missing-field-fallback.md](codex-desktop-unread-missing-field-fallback.md#L1) still owns omitted live fields; this record owns stale explicit false across the active→completed boundary.

## Correct Detection Order

1. If unread becomes true while a task still lacks completed evidence, schedule the ordinary reader for non-active state or `verifyStaleActive` for ambiguous active state; exact `turn-started` and waiting requests remain active and skip this extra read.
2. Confirm latest Turn `completed` evidence (cache, targeted-after-exit, or verifyStaleActive RPC).
3. Classify unread evidence as exact Desktop event, confirmed Host-open session event, current initial/refollow snapshot, parseable native set, or source-unavailable fallback.
4. Prefer exact false/true. Otherwise accept current snapshot false as disconnected-read replay; then apply current native set membership/nonmembership over snapshot true. If native parsing is transiently unavailable, reuse this Bridge's last successful native observation across inventory replacement before accepting a weaker snapshot true.
5. Publish the completed Turn with current unread evidence; later native-state replacement remains anonymous `readStateOnly` only. Bind a successful-open false to a concrete internal Turn identity, and clear it only for a genuinely different Turn/active epoch—not a late timestamp enrichment of the same Turn.
6. Never invent unread, replay activity, expose/write a native path, persist a local acknowledgement, or acknowledge failed/unconfirmed navigation.

## Prevention Rule

Do not impose a symmetric total order on reconnect read evidence. Exact Desktop events and confirmed Host-open facts are strongest. A current refollow snapshot false must repair stale persisted true after a missed disconnected event; native nonmembership must defeat snapshot true. A transient native read failure must not erase the last successful native decision or create a one-frame fallback; retain it only inside the current Bridge session and let fresh exact/native evidence supersede it. Native-file changes remain read-state only, and a local acknowledgement is session-only, success-gated, bound to a concrete internal Turn and never persisted. Timestamp enrichment is not Turn identity. The first available true observation and a later false/unknown→true change may trigger bounded evidence collection when completion is unknown, but unread cannot itself change Turn/Activity. A genuinely new completion epoch must remove the prior false so it can become unread.

## Latest Applicable Implementation

[preload/index.js](../../../preload/index.js#L1) owns unread arbitration, protocol adaptation, successful-open acknowledgement, Side Chat aggregation and completion-epoch cleanup. [codexController.ts](../../../src/runtime/codexController.ts#L1) keeps every card/counter/shortcut route on the shared `openThread` action. [codexAppServerBridge.test.ts](../../../tests/platform/codexAppServerBridge.test.ts#L1) and [codexController.test.ts](../../../tests/runtime/codexController.test.ts#L1) own the bridge/open regressions. The controlled acceptance record is [verify.md](../../specs/260718/1148-codex-quota-float/verify.md#L1).

## Occurrence History

| Date | Task | Trigger | Failed route | Evidence | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-07-27 | Codex task-state bridge | Completed-unread appeared only after delayed inventory | Clear pre-completion false and retry for 3s | User runtime report and source trace | Targeted completion refresh | Candidate; late file writes remained uncovered |
| 2026-07-30 | RAW-122 unread watcher | Codex sidebar showed a blue dot while EyPc omitted completed-unread | Snapshot false stayed live after native unread file changed | Native state/source trace and bridge regression | Evidence-aware precedence plus native-state watcher | Verified by Bridge and Controller regressions |
| 2026-07-30 | RAW-126 state convergence | Native unread arrived while EyPc still held stale interrupted | Read-only update could not discover the now-completed latest Turn without switching tasks | Bridge/Controller state sequence | Late true schedules one bounded targeted Turn read, then shared completion publisher carries current unread | Verified by Bridge 41/41 and state matrix 153/153 |
| 2026-07-30 | RAW-127 stale-active/single-flight audit | Late true could not wake a stale active row, or its new read was suppressed by an incompatible in-flight cycle | Require non-active before every unread wake and reuse any in-flight mode | Focused source audit and state matrix | Verify ambiguous active only; replace incompatible reader mode; keep exact started/waiting active | Verified by Bridge 45/45 and state matrix 157/157 |
| 2026-07-30 | RAW-128 native-authority/polling audit | Native unread true was hidden by a local completion acknowledgement or repeatedly reset active corroboration | Retain local receipt precedence and process unchanged true as new | Domain/Bridge focused regressions | Remove the local override; wake only when native unread changes to true; reuse compatible verification | Verified by Domain/Bridge focused regressions; host reload pending |
| 2026-07-30 | RAW-128 cold-start unread audit | Native unread was already true in both registry projection and first bridge refresh, so equality skipped the only Turn verification wake | Compare only against already-projected unread | Cold-start bridge regression | Track the first persisted observation independently; first/new true starts one bounded cycle, unchanged polls do nothing | Verified by Bridge 51/51 and state chain 115/115; host reload pending |
| 2026-08-01 | RAW-137 bridge interruption audit | Initial/refollow snapshot true survived ahead of a current native-set false after the user read the task while EyPc was off | Let snapshot true outrank native nonmembership | Main/Side reconnect matrix | Make current parseable native-set membership/nonmembership symmetric authority below exact events and above snapshots; reuse the same resolver for main and Side Chat aggregation | Verified by Bridge/Controller 106/106 and final unified Vitest 704/704; real-host interruption acceptance pending |
| 2026-08-03 | RAW-138 repeated real-host read mismatch | Exact Codex read event happened before plugin connection; stale native membership then suppressed current refollow false, and plugin-open had no success acknowledgement | Apply RAW-137's symmetric persisted-first order and leave every open navigation-only | Active extension/plugin launch timeline, native-state conflict and user screenshot | Make replay authority directional; route confirmed Host-open success into session exact false; keep failure/no-confirmation unchanged and clear old false at new completion | Verified by Bridge/Controller 116/116 and full verify 722/722; rebuilt host package reload/acceptance pending |
| 2026-08-03 | RAW-139 active-version correction | Latest package was installed but the existing float still belonged to an older cached ASAR, making the RAW-138 fix appear absent | Infer active code solely from installed version | Float URL/version/hash plus privacy-safe Codex route/count observation | Activate the current plugin instance before judging behavior; current 1.2.33 confirmed exact open and session read feedback | RAW-138 host-confirmed for the current preload; RAW-139 cold-route rebuild pending |
| 2026-08-03 | RAW-142 unread intermediate-frame stabilization | Refresh/shortcut could briefly show completed-unread and then correct it | On transient native atom loss, fall through to weaker snapshot true; a full inventory replacement discarded the public object's last persisted decision | Forced transient native-unavailable + inventory replacement + refollow sequence | Reuse the Bridge's last successful native membership/nonmembership before weaker snapshot true; assert no true frame is emitted | focused Bridge+Domain 114/114, type/preload checks pass; real uTools pending |
| 2026-08-03 | RAW-144 successful-open recurrence hardening | A task could become read after opening, then recur when the same Turn received a later `completedAt` or an older full snapshot resolved | Used completion timestamp as epoch identity and lacked a read-specific reverse-race contract; uTools fallback dispatch also skipped acknowledgement | Same-Turn ID enrichment, accepted fallback dispatch and delayed full-snapshot regressions | Bind acknowledgement to internal Turn ID, reject unbound process hints, acknowledge accepted fallback, retain Controller generation barrier | affected-suite 301/301 plus type/preload checks pass; real uTools pending |

## Alternative Route

- Preconditions: user reports late/missing completed-unread or stale completed-unread after EyPc/Desktop interruption, or a successful plugin-open does not clear unread.
- Ordered steps: correlate exact read-event and plugin-connect timing; classify exact, snapshot and native evidence; apply the directional order; success-gate any plugin-open acknowledgement; if unread is true while completion is unknown, launch one bounded Turn read; emit read-only changes through the existing anonymous path.
- Verification: Bridge two-direction reconnect/read-state, successful/failed/offline open, v11/v2 and v6/v1, Side Chat aggregation and stale-interrupted regressions plus Controller state sequence pass; preload canonical/public/dist mirror, syntax, typecheck and full verify pass.
- Applicability boundary: does not invent unread from missing fields or unknown Side Chats; does not write Codex native unread; does not acknowledge failed/unconfirmed open; does not preserve false across a new completion.
- Fallback: if persisted and live both unavailable, keep unknown/read projection until Codex authority arrives.
- Status: verified
