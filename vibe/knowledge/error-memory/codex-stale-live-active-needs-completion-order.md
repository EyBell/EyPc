---
id: eypc-codex-stale-live-active-needs-completion-order
status: superseded
scope: project
fingerprint: codex-task-status-mismatch__stale-desktop-snapshot-outranks-newer-live-event__order-positive-and-terminal-events-above-initial-refollow-replay
first_seen: 2026-07-27
last_verified: 2026-08-13
review_after: 2027-08-13
evidence:
  - preload/index.js
  - public/preload.js
  - src/domain/codex.ts
  - src/pages/CodexPage.vue
  - src/runtime/codexController.ts
  - tests/domain/codex.test.ts
  - tests/runtime/codexController.test.ts
  - tests/ui/codexCompanion.test.ts
  - tests/platform/codexAppServerBridge.test.ts
  - vibe/specs/260718/1148-codex-quota-float/verify.md
tags:
  - codex-companion
  - desktop-ipc
  - active-shadow
  - status-projection
  - latest-turn
  - privacy-boundary
---

# Old Desktop Snapshots Must Not Outrank Newer Activity Or Completion

## 逻辑归档（2026-08-13，RAW-166）

本记录的历史复现与检测矩阵继续有效，但其独立 candidate 修复通路已被 [Provider 状态与双向分支因果门禁](codex-provider-status-display-normalization.md#L1) 统一取代。当前实现不再分别维护“stale active”“stale terminal”两套修复：稳定 branch ref、Provider Turn epoch、同 Turn event sequence 与 attention monotonicity 在 Kernel 一个 admission 中同时处理 live↔live、live↔terminal 和 terminal↔terminal。本文只作为历史证据和回流门禁，不进入自动 recall。

## 更新引入（2026-08-08，RAW-150）

本记录继续主责 live/terminal 因果顺序；RAW-131 当时形成的 `blocked-stopped` 归档结论不再是当前能力合同。当前 Domain 仍须先以同一闭合状态机建立 explicit `stopped`，Presentation 将其显示为“待继续”；任务级 Codex 归档发送 `stopped` evidence，但 Host 写前重读精确任务/latest Turn，只有最新仍 failed/interrupted 且实时停止边界仍成立才执行，恢复运行返回 `state-changed`。项目批量继续只接纳 completed。

## Symptom

Codex and EyPc could disagree in both directions: an old active snapshot kept completed work ongoing, while an old `idle + interrupted` snapshot kept a newly resumed active task stopped. Either stale row could survive refollow and periodic inventory reconstruction.

## Wrong Assumption

Initial/refollow Desktop snapshots were treated as permanently newer than events from another live channel. That let replayed active outrank a later completion and, conversely, let replayed idle outrank an exact App Server active/Turn-started event.

## Verified Root Cause

[preload/index.js](../../../preload/index.js#L1) retained a Desktop active shadow across inventory rebuilds and projected it again without an interval boundary. After interval ordering was added, `codexDesktopShadowFromSnapshot` still minted `desktopActiveSince=Date.now()` for every active subscription snapshot, so a terminal task could receive a new interval merely because the bridge followed it again. [codex.ts](../../../src/domain/codex.ts#L1) correctly gives established desktop-live active priority; the missing distinction was subscription replay versus an actually observed activity transition.

The reverse defect remained in the App Server notification handler: `thread/status/changed=active` updated only connector fallback whenever a Desktop shadow already existed. A stale Desktop idle snapshot therefore retained `desktop-live` authority over the fresh positive event and kept a resumed interrupted task in stopped. The corrected bridge records session-only `app-server-live`, preserves it across snapshot replay/inventory rebuild, and clears it only on exact terminal/non-active evidence or a Desktop non-active activity patch.

RAW-130 found that the marker still had no causal waterline. A historical Desktop shadow whose shape remained `activityEvidence=activity-event + idle` could be republished by a read-state-only patch, Side Chat aggregation, refollow or full inventory reconstruction after a newer App Server active event. The publisher cleared the boolean marker merely because the old shape existed, so a still-running resumed task returned to stopped. The corrected preload gives every true Desktop activity patch and accepted exact App Server live event one shared process-local sequence; only a strictly later Desktop non-active event may revoke the marker.

RAW-131 invalidated the remaining “global audit complete” claim. The earlier route accumulated scenario regressions but never closed the source × current-state × event × revision × replay-entry × consumer matrix. At review time, a stale-active latest-Turn reader could revoke a newer exact active epoch; conflicting initial active plus failed/interrupted could be converted into synthetic idle; active→active waiting patches could remain behind prior completion; inventory dropout could erase Preload identity mapping while Controller retained the old row; Side Chat had no equivalent parent/child replay contract; a late full snapshot could overwrite a newer delta generation; and stopped archive remained implemented as allowed although canonical requirements said blocked. Some passing tests encoded the synthetic-idle and stopped-archive behavior, so their pass count could not prove the product invariant.

RAW-132 adds a regression-safe optimization boundary after that audit. Parent aggregation had still been expressed as mutable publisher logic, and a child latest-Turn result could be mistaken for aggregate parent terminal state while a sibling or the main branch remained active. The current route centralizes the projection, treats child terminal evidence as branch-scoped, and adds anonymous decision totals behind the existing generation barrier. The counters are observability only and cannot become status evidence.

RAW-133 found one observability gap in that boundary: Controller could accept a newer diagnostics package without changing any task row, then skip `notify` because only task/environment changes participated in the final notification branch. The settings page would therefore retain old guard counts until another state change, hiding evidence needed to diagnose the same false-stop family. The repair makes Domain the single owner of diagnostic keys, normalization and equality, and treats an accepted diagnostics-only package as one atomic view change. Unchanged polls and stale generations still produce no notification; the counters remain non-authoritative.

RAW-126 exposed a second reverse edge after active exited: Controller guarded an unchanged old completed result in the delta path, but the full-inventory path could accept the same old interrupted/failed result and then delete the active-exit baseline merely because it looked terminal. The task therefore moved from active to stopped before the latest completed Turn arrived. Both inputs now use one exit-transition reducer; an unchanged pre-active terminal is projected as ongoing and keeps the epoch open.

RAW-127 found the remaining blockers around that reducer rather than inside it. Exact same-revision completion still required a later `completedAt` when inventory already said completed, snapshot corroboration still required completedAt as shape, and an existing stale-active reader could silently suppress the active-exit reader that should replace it. Confirmed targeted provenance also existed only on the emitted copy. The corrected preload accepts exact/corroborated completion without completedAt under the existing revision/activity checks, replaces incompatible reader modes, and stores confirmed provenance on the session inventory. Domain now requires explicit failed/interrupted before idle/not-running can produce stopped; missing outcome stays ongoing.

RAW-128 found cross-layer batch blockers after the per-task reducer was correct. Full inventory reconstruction could replace exact inProgress or confirmed terminal provenance with plain inventory evidence; snapshot and delta had no shared activity-generation barrier; an unknown key or one missing inventory row could suppress valid updates for known/present tasks; identical active snapshots could keep resetting corroboration; and active exit could label unchanged inventory completed as targeted evidence. The current route preserves stronger session evidence, sequences every delta against the full snapshot, applies known/present rows independently, reuses compatible corroboration and only upgrades active-exit completion when evidence advances or is already confirmed.

The final RAW-128 audit found one caller-owned gate still outside that reducer: the delta caller explicitly passed “confirmed terminal,” while the verified full-snapshot caller did not. A same-revision `snapshot-corroborated` completion could therefore be guarded back to inProgress even though both paths invoked the same function. Confirmation is now derived from the candidate inside the pure reducer; callers can supply only the independent Desktop-not-running stop fact.

RAW-155 found the same ordering defect one layer earlier in Host projection: `companionPhaseForCodexThread` returned running for an active shell before checking an exact latest-Turn `interrupted` watermark. The corrected order first preserves unresolved waiting and causally newer active evidence, then lets exact interrupted/stopped close the stale shell；inventory-only interruption remains conservative. The regression exercises this exact Host function, not only the downstream Domain reducer.

## Evidence

- A user-visible task-status mismatch showed ongoing rows alongside a completed row where the task lifecycle was no longer coherent.
- [preload/index.js](../../../preload/index.js#L1) and [public/preload.js](../../../public/preload.js#L1) now record `desktopActiveSince` only on a snapshot/patch entering active, retain it through ordinary inventory projection, and clear it on active exit or live-authority loss. A replacement active snapshot inherits the previous shadow's `desktopActiveSince` instead of replacing it with `Date.now()`, so a resubscribe or owner change cannot push the interval past an already-known `completedAt`.
- [codex.ts](../../../src/domain/codex.ts#L1) accepts only confirmed terminal provenance over live activity; [codexController.ts](../../../src/runtime/codexController.ts#L1) applies one active-exit transition to both deltas and full inventory without cross-clock ordering.
- [codex.test.ts](../../../tests/domain/codex.test.ts#L1) and [codexController.test.ts](../../../tests/runtime/codexController.test.ts#L1) contain the domain and Activity Delta V2 contracts; the Controller regression covers stale interrupted full inventory followed by completed-unread and a genuinely fresh stop.
- RAW-112 read-only correlation showed three anonymous rows as `desktop-live active` while all three latest Turns were `interrupted`; their active observation times were minted within the same millisecond-scale subscription burst. [codexAppServerBridge.test.ts](../../../tests/platform/codexAppServerBridge.test.ts#L1) now covers uncorroborated active snapshots, no-completedAt exact/corroborated completion, incompatible latest-Turn mode replacement and real-new-Turn recovery.
- RAW-130 extends that Bridge contract through an older Desktop idle activity event, a newer exact App Server inProgress event, a read-state-only publication, refollow and two full inventory scans; every replay must remain `app-server-live`. A genuinely later Desktop idle activity patch must still revoke it. The contract is written but has not been executed under the project verification rule.

## Detection Order

1. Compare the displayed task state with the newest explicit Turn status and timestamps, without using recency or elapsed time as a terminal inference.
2. Trace whether a full inventory rebuild republishes an existing shadow or a follow subscription replaces it with an active snapshot after that terminal Turn.
3. Determine whether active came from a runtime/request patch or fresh inProgress Turn, versus the first snapshot replay of a subscription.
4. For a conflicting first snapshot, keep ongoing while rereading only that latest Turn through the existing bounded schedule; track a session-only activity revision and never settle across a patch, waiting request, remap or failed read.
5. Carry only an anonymous local interval timestamp across preload; do not carry a raw ID, body, cwd, path or private patch data.
6. Apply the same active-exit baseline to real-time and full-inventory candidates. Accept confirmed/fresh terminal evidence once; keep an unchanged pre-active terminal ongoing and retain the baseline.
7. When a task's required latest-Turn mode changes, replace the incompatible single-flight cycle and ensure a canceled result cannot delete or overwrite its successor.
8. For cross-source conflicts, compare only the private event sequence: read-state-only publication, initial/refollow snapshots and inventory reconstruction mint no live sequence; a Desktop non-active patch must be strictly later than the current App Server waterline before it can revoke active.
9. Verify real new activity, waiting flags, missing timestamps/outcomes, old interrupted inventory, read failures and uncertain bridge states remain active/ongoing.
10. Before declaring the route complete, enumerate both directions of every asynchronous ordering and every replay entrance, then assert the same stable result across authority, card bucket, compact count and archive capability. Treat tests whose expected result contradicts the canonical invariant as defects, not coverage.
11. For a Side Chat terminal, inspect all other branch shadows before mutating the parent Turn; keep the aggregate epoch live while any other exact branch remains active, and verify diagnostics remain identity-free and generation-monotonic.
12. Compare the accepted diagnostics package after the same source/generation barrier as task state. Notify once when that package changes even if no row changes, and never notify for an unchanged or rejected package.

## Prevention Rule

Desktop live active is authoritative for an interval actually observed through activity change or fresh Turn evidence, not for an unbounded future. A subscription's first snapshot is replay evidence and must not silently mint permanent authority over an already terminal Turn. Preserve ongoing during the existing bounded corroboration, then suppress only the same unchanged snapshot whose final successful reread remains terminal. Record one anonymous local start time for established active and do not renew it during inventory re-projection. Never replace these ordering rules with a timeout, generic recency check, connector status, read failure or missing-Turn inference.

Apply the same ordering in reverse: an initial/refollow idle snapshot or historical Desktop idle activity event must not suppress a later exact App Server active or Turn-started event. Connector inventory active remains insufficient; only a live event creates `app-server-live`. Exact terminal/non-active evidence may revoke it directly, while Desktop non-active evidence must carry a strictly later process-local live-event sequence. Never infer cross-source ordering from payload shape or provider/local wall clocks.

Do not rebuild the removed filter stack. A plain completed shape cannot close live activity, `completedAt` is not mandatory for exact or snapshot-corroborated completion, and same-revision exact started/targeted inProgress is forward progress. Keep only strict older-revision rejection plus the bounded initial-snapshot/active-exit checks, replace incompatible reader modes, persist confirmed provenance for the session, and run delta/full-snapshot candidates through the same exit reducer. Missing Turn outcome never proves stopped.

Do not turn structural uncertainty into a batch-level status gate. Unknown delta keys request reconciliation without blocking known rows; missing inventory keys retain only those rows; full snapshots carry the activity generation they include; and identical snapshot evidence shares one bounded verification cycle. Start once for an initially/newly true unread observation; restart only for task-switch ambiguity, changed activity/mapping or incompatible mode. Terminal confirmation belongs inside the shared reducer, never in one caller.

Do not accept scenario-by-scenario regression growth as a closed state machine. A newer true-positive epoch must be monotonic until same/newer explicit terminal or non-active evidence; conflicting active and failed/interrupted evidence remains ongoing and must never be normalized into synthetic idle; exact waiting requests outrank stale completion even on active→active patches; identity/generation barriers must be symmetric between delta and full snapshot; main and Side Chat must share the same causal reducer; and list, counts and archive capability must consume one stable result. Acceptance requires a closed transition matrix covering every write, clear, copy, aggregation, asynchronous replay and consumer path.

Do not let one branch own the aggregate terminal transition. Parent Activity must be derived by one reducer from main and child evidence; a child terminal closes only that child's uncorroborated shadow and is deferred while another exact branch remains active. Anonymous counters may reveal which guard fired, but they must never carry identity or participate in the decision itself.

Do not duplicate the diagnostic schema or hide its accepted changes behind task-row equality. One Domain key tuple must drive normalization and comparison; Controller performs one post-generation package comparison; Renderer formats only the already-normalized result. A diagnostics-only change is one view update, while identical polling and old generations are zero updates. Keep internal counters outside status live regions and behind focusable native help.

## Latest Applicable Implementation

- The preload creates `desktopActiveSince` on active snapshot entry or non-active-to-active patch transition, retains it for that same shadow, clears it on inactive/authority reset, and aggregates Side Chats using the latest still-active child interval.
- Activity Delta V2 and full inventory pass only the anonymous timestamp with the existing anonymous key and sanitized status fields.
- Domain owns visible priority; Controller owns one exit-transition reducer shared by real-time and verified-inventory inputs.
- The preload keeps `activityRevision` and `suppressUncorroboratedActive` process-only. Runtime/request patches clear suppression and advance the revision; a complete newer `turn/started` restores active without scheduling an extra latest-Turn read. The initial-snapshot path reuses `[0,300,1000]` and requires the unchanged final successful terminal result.
- The preload also keeps `appServerLiveSequence` and each Desktop shadow's `activityEventSequence` process-only. True activity/App Server live events advance one shared counter; read-state, refollow and full inventory preserve but never mint or expose the waterline.
- Accepted completion publishes immediately. The exit baseline and bounded Turn read fill an evidence gap only; they add no presentation hold.
- RAW-131 implements the previously missing boundaries: stale-active readers capture the parent positive sequence; Side Chat initial and last-active-exit readers query the causal child; conflicting terminal snapshots suppress to unavailable/ongoing instead of idle; every exact active activity patch opens a new epoch and waiting additionally wins over completion; same-fingerprint missing mappings outlive Controller quarantine while verified archive clears them directly; every affected Side Chat parent reaggregates after inventory rebuild; Controller rejects stale same-source delta bridge state plus lower/generationless V2 full snapshots. Its historical completed-only/`blocked-stopped` archive conclusion is superseded by RAW-150's task-level stopped evidence plus Host write-time revalidation; all causal state contracts remain current.
- RAW-132 routes parent projection through `codexResolveParentActivity`, defers a child terminal when `hasOtherActiveBranch` remains true, reopens the aggregate live epoch before re-publication, and exposes five session-only decision totals through the existing Activity generation barrier. Domain/Bridge/Controller reverse contracts pass.
- RAW-133 centralizes the diagnostic tuple/normalization/equality in Domain, adds one Controller diagnostics-only notification path, compacts the Runtime summary, separates counters from `aria-live`, and makes all Codex help triggers native buttons. The parent-priority table invokes the production resolver; contracts pass.

## Alternative Route

- Status: `superseded`; replacement is [codex-provider-status-display-normalization](codex-provider-status-display-normalization.md#L1). Real preload-reloaded host acceptance remains a release gate of the current Controlled task, not an independent route in this record.
- Preconditions: an existing or newly replayed desktop-live active projection, a current anonymous task mapping, and a latest Turn that provides explicit status/timestamps.
- Ordered steps: distinguish snapshot replay from real transition; sequence true Desktop activity and exact App Server live events inside preload; preserve the newer App Server waterline across read-state/refollow/inventory publication; pass delta and full inventory through the same active-exit reducer; settle only accepted terminal or strictly later Desktop non-active evidence; project once through the shared package owner.
- Verification: an older Desktop idle activity event cannot stop a newer exact App Server active event across read-state, refollow and repeated inventory scans; a genuinely later Desktop idle patch still settles; renderer-visible payload contains neither the sequence nor raw identity/content.
- Fallback: when the shadow changes, a read fails, or explicit terminal evidence is unavailable, preserve conservative active/ongoing and wait for ordinary verified evidence.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-27 | RAW-096 stale active observation ordering | User reported visible Codex/EyPc current-task state mismatch | Re-applied an old Desktop active shadow on every full inventory scan without interval ordering | Record one anonymous active observation time and let only a strictly later explicit completion supersede it | candidate; static source contracts complete, real host acceptance pending |
| 2026-07-27 | RAW-096 snapshot replacement interval leak | User reported completed task still shown as ongoing after RAW-096 interval fix | Replacement active snapshot from resubscribe/owner change overwrote `desktopActiveSince` with `Date.now()`, pushing it past `completedAt` | Inherit previous shadow's `desktopActiveSince` on active→active snapshot replacement; bridge test contract added | candidate; source/mirror/test synchronized, real preload reload acceptance pending |
| 2026-07-27 | RAW-102 click remint false active | User saw Codex stop while sidebar/EyPc still showed in-progress; click cleared then revived it | Click/focus briefly cleared active then reminted a newer `desktopActiveSince` after an already completed Turn | Supersede reminted active when latest Turn remains completed without waiting flags; verify stale active with targeted Turn read | candidate; source/mirror/tests updated, host acceptance pending |
| 2026-07-29 | RAW-112 initial follow snapshot replay | User saw two terminal tasks remain ongoing and a real current task raise the count to three | Fresh follow snapshots replayed stale active for terminal interrupted Turns and minted all intervals together | Preserve ongoing through bounded Turn corroboration; suppress only an unchanged terminal snapshot; restore immediately on activity/waiting/new Turn; bump task-state revision | candidate; source/public mirror/test contract updated, reload acceptance pending |
| 2026-07-30 | RAW-124 stale idle over resumed activity | A real ongoing task was displayed as stopped after an earlier interruption | App Server exact active was ignored whenever an old Desktop idle shadow already owned status authority | Add `app-server-live`, retain it through refollow/inventory replay, and clear it only on explicit later terminal/non-active evidence | verified by 38/38 Bridge and Domain regression; real host reload pending |
| 2026-07-30 | RAW-125 over-filter audit | Repeated state fixes still left exact starts/completions behind shape, same-revision and completedAt gates | Multiple owners independently revalidated the same live/terminal edge | Close live only with confirmed completion provenance; allow same-revision forward status and exact completion without completedAt | verified by 40/40 Bridge and 152/152 Codex matrix; real host reload pending |
| 2026-07-30 | RAW-126 split exit arbitration | Active→completed-unread disappeared into stopped, especially after an earlier interruption | Delta guarded only old completed while full inventory accepted old interrupted/failed and cleared the same epoch | Share one exit reducer across delta/full snapshot; keep unchanged old terminal ongoing until accepted evidence | verified by Controller 33/33 and Codex state matrix 153/153; real host reload pending |
| 2026-07-30 | RAW-127 residual blocker audit | Global audit found no-completedAt, single-flight mode and missing-outcome stop gates still able to suppress the current terminal path | Local shape/freshness checks and one undifferentiated reader slot independently revalidated an already evidence-backed transition | Accept exact/corroborated no-completedAt completion, replace incompatible modes, persist provenance and require explicit failed/interrupted for stopped | verified by Bridge 45/45 and Codex state matrix 157/157; real host reload pending |
| 2026-07-30 | RAW-128 full-chain blocker audit | Known task updates still stalled behind full-inventory rebuild, unknown/missing rows and repeatedly reset corroboration | Applied evidence and structural guards to whole batches instead of their exact row/sequence boundary | Preserve stronger inventory evidence, add generation barrier, apply known/present rows, row-scope missing quarantine and reuse compatible verification | verified by focused state chain 113/113; full matrix and host reload recorded in current verify |
| 2026-07-30 | RAW-128 full-snapshot confirmed-terminal audit | Same-revision corroborated completion could pass through delta but return to ongoing through full inventory | Confirmation was an option supplied only by the delta caller instead of a property read by the shared reducer | Derive confirmed provenance inside `reduceActivityExitTransition`; leave callers only explicit not-running stop context | verified by Controller 38/38 and state matrix 168/168; host reload pending |
| 2026-07-30 | RAW-130 replayed old idle activity after resumed active | Screenshots showed a background Codex task still running while EyPc moved it from ongoing to stopped | `appServerLiveActive` was a boolean; any historical Desktop `activity-event + idle` shape could clear it during read-state, refollow or inventory publication without proving later causality | Add one private shared live-evidence sequence, preserve the App Server waterline through reconstruction and require a strictly later Desktop non-active activity patch | implementation and regression contract written; execution and real host acceptance pending |
| 2026-07-30 | RAW-131 closed-state-machine audit | User reported that repeated “full audits” still omitted related status blockers | Repaired the latest screenshot path and counted passing examples without closing all source/state/event/revision/replay/consumer combinations; two tests preserved wrong synthetic-idle and stopped-archive expectations | Freeze scenario patches, enumerate every write/clear/replay/consumer edge, repair all seven P1 and require one closed transition matrix before acceptance | candidate; implementation/contracts written, all automated/host verification pending |
| 2026-07-30 | RAW-132 regression-safe optimization | User required further optimization without bringing back prior false-stop errors | Parent aggregation remained mutable and child terminal evidence could still be applied at aggregate scope; diagnostics had no explicit privacy/generation contract | Centralize parent resolution, defer branch terminal while another exact branch is active, add identity-free counters and reverse regression contracts | candidate; static implementation/contracts written, execution and host acceptance pending |
| 2026-07-30 | RAW-133 unified diagnostic projection | User required globally concise, efficient and unified optimization without restoring old errors | Accepted diagnostics-only deltas shared the task generation barrier but could skip view notification; field normalization/comparison and help semantics were not yet one contract | Centralize diagnostics in Domain, notify exactly once on accepted package change, compact/focus-gate details and use native help buttons outside the live region | candidate; static implementation/contracts written, execution and host acceptance pending |
| 2026-08-08 | RAW-150 stopped archive update | User clarified that an explicit stopped task should be shown as waiting-to-continue and may be archived | Historical closed-matrix acceptance treated stopped capability as permanently blocked | Preserve the stopped evidence reducer, but move mutation safety to exact Host reread and return `state-changed` after resume | focused Domain/Controller/Host/UI contracts pass; real v7 uTools archive remains host-pending |
| 2026-08-10 | RAW-155 Host exact-interrupted order | Screenshot showed an exact interrupted task under “进行中” | Host phase helper checked stale active shell before exact terminal evidence, so downstream V2 lanes received the wrong phase | Check unresolved waiting/newer activity first, then exact interrupted before generic active；inventory-only interruption stays conservative | focused Host regression verified；real uTools pending |
