---
id: eypc-codex-pending-user-request-overrides-idle-runtime
status: verified
scope: project
fingerprint: codex-desktop-pending-request__plan-confirmation-was-misclassified-after-runtime-became-idle__inspect-finite-unresolved-requests-before-terminal-projection
first_seen: 2026-07-27
last_verified: 2026-08-24
review_after: 2027-02-03
evidence:
  - user-status-correction
  - current-desktop-source-inspection
  - preload-source-fix
  - static-syntax-mirror-and-diff-check
  - current-ownerless-needs-input-host-evidence
  - bounded-rollout-and-owner-loss-regressions
  - completed-plan-rollout-and-live-item-regressions
  - provider-to-domain-real-path-preflight
  - persisted-decision-provenance-regressions
  - relative-domain-module-preflight-loader
  - permission-request-lifecycle-and-private-correlation-regressions
  - bidirectional-waiting-edge-and-watchdog-regressions
  - active-vs-active-waiting-clear-causal-barrier-regressions
  - real-v7-provider-product-mismatch
  - v7-atomic-interaction-tombstone-and-plan-artifact-regressions
tags:
  - codex-companion
  - desktop-ipc
  - plan-confirmation
  - input-required
  - status-priority
  - owner-loss
  - rollout-recovery
  - bidirectional-hot-path
  - waiting-clear-barrier
  - stale-shadow-replay
---

# Pending User Requests Override Idle Runtime

## 更新引入（2026-08-07）

本记录继续只主责有限待输入决定的 live/sticky/rollout 证据与生产 Domain 投影。RAW-147 更正了它依赖的 stream 前提：`following=true` 既不是状态快照，也不是要求接收方重报的请求；正向公告回声的根因、修复和宿主验收统一由 [task-switch follow 主记录](codex-task-switch-unfollow-must-not-drop-live-shadow.md#L1) 管理。这里保留该前提用于检测顺序，不再形成第二份协议回声记忆。

## 更新引入（2026-08-08，RAW-151）

待输入证据现在必须双向收敛：请求新增快速进入，request 移除/resolved、matching output、用户继续以及精确新 `task_started`/active 快速退出并回到进行中。两条边共用一个 waiting-edge reducer；revision、owner 或载荷缺口只启动目标任务的 1.25 秒有界重订，ownerless rollout 只登记会话期文件监听并由 1 秒 phase-only watchdog 补漏。RAW-155 已删除周期性任务全量刷新；冷启动、重连或明确成员缺口的窄盘点不能暂停或放慢这条热通路。

## 更新引入（2026-08-09，RAW-153）

真实 v7 宿主证明“已建立双向边”仍不等于因果正确：当前 owner 的 shadow 同时为 `desktop-live + active + waiting` 时，旧 already-active 分支保留 waiting 并取消恢复重订；较新的 App Server active/Turn-started 只能压过 Desktop idle，压不过观测更早的 waiting，随后 snapshot、read-state 或 refollow 重放可让它再次出现。当前规则升级为 v8：每个私有 request/runtime waiting 观测都有单调序列；精确 remove/匹配 `serverRequest/resolved` 或更新运行证据建立 clear barrier，只有屏障后真正新出现的实例可重新进入等待。清除立即生效，重订只复核；未匹配 resolved 不清并发审批。

## 更新引入（2026-08-16）

用户回复 Plan 或提问后，Codex Desktop 已把 `threadRuntimeStatus` 恢复为无 waiting flag 的 plain-active，但 `conversationState.requests` 仍短暂残留同一 `item/plan/requestImplementation` 或 `requestUserInput`。旧筛选把任意可见请求无条件并入 waiting，且 `hasInput` 会禁止 App Server running 占优，于是卡片停在「待输入」。当前只在「先前已观测到同类等待」且 runtime 从 idle/waiting 转入 plain-active 时，把这些残留请求放进 waiting-clear 屏障；首次观测到的 `active + request` 仍是待输入，idle 上的 Plan 请求仍覆盖 idle。

## 更新引入（2026-08-24，RAW-179 V7）

真实日志又证明 waiting-clear 本身仍不是充分闭环：interaction resolve 产生了新 clear sequence，却没有在同一事务更新 Desktop Shadow/tombstone；约 343ms 后旧初始快照可以把已完成、已读任务恢复为待输入，Float 只是正确 ACK 了错误的 Host 包。同时，历史 completed Plan item 被当成仍需回答的请求。V7 将当前 `InteractionEvidenceV7` 与 `PlanArtifactEvidenceV7` 分离；resolve/cancel/execution-start 原子更新 Shadow 和 tombstone，artifact-only 只映射为 `stopped/待继续`。同 revision 冲突进入隔离诊断，不再按最后到达者覆盖。

## Symptom

A Plan turn can finish generating while still requiring the user to confirm implementation. An ownerless ordinary input can likewise remain native `Needs input` after Desktop stops replaying its request. EyPc may briefly or persistently show either task as completed/ongoing instead of waiting-input, making the most actionable state late.

## Wrong Assumption

The bridge assumed request-derived input flags were relevant only when `threadRuntimeStatus.type` was already `active`. It therefore trusted same-batch `idle` before examining an unresolved user decision.

## Verified Root Cause

The current ChatGPT/Codex Desktop creates unresolved finite requests in `conversationState.requests`, including `item/plan/requestImplementation`, and removes them after the decision. The original projection inspected requests only inside the runtime-active branch and did not recognize the Plan method. RAW-141 found the second ownership failure: after the stream owner disappears, Desktop accepts a new follow but does not replay the current `conversationState` to that follower; App Server list/latest/full Turn omit the pending request and may expose only `notLoaded + interrupted`. For ordinary `request_user_input`, the rollout remains the durable local evidence: an unmatched exact function call means input is pending, while the matching output or a later user message closes it. RAW-142 found a separate Plan boundary: latest Turn may already be `completed` and unread, while the rollout still records an exact completed `Plan` item and no newer `task_started`. That structural pair is durable evidence that planning finished but implementation has not begun; read state is orthogonal. RAW-145 found the cross-layer recurrence: Preload recovered the exact ordinary request but published it as plain `connector`; Domain deliberately rejected connector waiting to prevent historical inventory-hint false positives. The old real-machine preflight duplicated a looser predicate and stopped before production Domain projection, so it falsely certified the Bridge-only repair. While the original owner existed the same request was `desktop-live` and worked; after owner loss it crossed the unmarked persisted fallback and failed again. RAW-153 found the active-vs-active recurrence: v7's current-owner fast path treated any `desktop-live + active` as already current, even when the same shadow retained an older waiting flag. App Server running evidence had a waterline only against Desktop idle, not against waiting; no request/runtime instance-level clear sequence existed, and `serverRequest/resolved` was not handled. Consequently the correct active state could appear briefly, then an older shadow/read-state/refollow replay restored waiting.

## Evidence

- [preload/index.js](../../../preload/index.js#L1) recognizes the exact Plan implementation request, examines unresolved requests regardless of runtime type, and promotes a recognized request to anonymous `active + waitingOnUserInput`.
- [codexAppServerBridge.test.ts](../../../tests/platform/codexAppServerBridge.test.ts#L1) records the idle-runtime Plan-request contract, zero latest-Turn RPC and plan-content non-disclosure.
- The same Bridge contract records owner loss, sticky ordinary-input/approval/Plan shadows, ordinary-active downgrade, newer-evidence cleanup and safe rollout call/output/user-message parsing.
- [verify.md](../../specs/260718/1148-codex-quota-float/verify.md#L1) records RAW-093 source verification, privacy and the remaining real-host gate.
- RAW-141 current-host read-only evidence found exactly one unmatched `request_user_input` among current unarchived rollouts and exactly one native `Needs input`; the repaired source projection reports one authoritative active waiting-input without exposing the task identity or content.
- RAW-142 Bridge contracts historically projected a completed Plan item as Plan-only waiting；RAW-179 supersedes that presentation while retaining the bounded structural parser。The same evidence now creates only an anonymous executable Plan artifact，and unread remains an independent higher-priority lane。
- RAW-145 current-machine pre-fix evidence produced one plain connector waiting decision but zero production-Domain input tasks. The repaired preflight executes [codex.ts](../../../src/domain/codex.ts#L1): its first post-fix observation reported one `persisted-decision` waiting plus one product input task with zero plain connector waiting; after Provider state removed that decision, the final rerun reported zero and zero.
- RAW-145 focused `192/192`, typecheck, full production build and three-way main preload mirror pass. Exact new Turn/completion contracts clear the persisted provenance, while a plain connector waiting regression remains ongoing.
- RAW-153 real v7 evidence reported one product waiting and four active while the simultaneous Provider→production Domain projection reported zero waiting and five active. The v8 Bridge file passes `94/94`, including current-owner clear, stale snapshot/read-state/refollow suppression, new correlation re-entry, exact/unmatched resolved, concurrent approvals, runtime flag removal, Side Chat/Plan and rollout resume; the affected nine-file matrix is `379/379` with typecheck/build/preload/runtime gates green. Real v8 host acceptance remains rework.

## Detection Order

1. Prefer a valid, version-matched Desktop live snapshot or patch. A positive follower-state announcement alone is not a snapshot and cannot restore an ownerless request.
2. Inspect the unresolved request list using a finite method allowlist before accepting idle/completed presentation. Correlate repeated full snapshots with a process-random salted hash of a private request identity when available; never publish or persist the raw identity or hash.
3. Map exact `item/plan/requestImplementation` and ordinary input methods to `waitingOnUserInput`; map only command-execution, file-change, permissions `requestApproval` and MCP elicitation to `waitingOnApproval`.
4. While a recognized request exists, publish the known anonymous task immediately as Desktop live active/input. For an unregistered task, retain the private shadow until verified inventory creates its anonymous identity.
5. Across owner/transport loss, retain only an already observed finite input/approval/Plan request shadow for this preload session; ordinary active must drop. Every request/runtime flag keeps a private observation sequence. Exact removal/matching resolved, newer active/new Turn/continuation, or a previously observed wait whose Desktop runtime has resumed plain-active establishes the waiting-clear barrier before any resubscribe result; an older snapshot/read-state/refollow/rollout replay cannot cross it, while a later new correlation or a first-observation `active + request` can.
6. When no live/sticky request exists, allow interrupted/failed/inProgress inventory with a real rollout under `CODEX_HOME/sessions` to recover an unmatched exact `request_user_input` from a bounded tail. Publish it with explicit `persisted-decision` provenance; matching output, later user input or a new `task_started` clears it through the same reducer.
7. Separately, for latest Turn `completed` only, allow an exact latest-Turn `item_completed.item.type=Plan` to establish `PlanArtifactEvidenceV7.available`，never an interaction or waiting flag。A later execution-start/consumed/cancelled/removed transition updates that artifact；a newer Turn independently supplies activity。Unread outranks both current interaction and artifact-only stopped。File-watch loss is recovered only by the bounded candidate watcher，never by scanning all sessions。
8. Run any host preflight through the production Domain and Presentation projections plus the semantic revision gate; resolve every transpiled module's relative imports from that module's own source path. A Bridge/source count or a copied active predicate cannot prove the user-visible bucket or absence of approval double-counting.
9. Never infer input from arbitrary request names, plan text, `resumeState` alone, elapsed time, ordinary connector activity or other rollout content.

## Prevention Rule

For live state machines, an unresolved finite user-decision request outranks an idle runtime or persisted terminal result only while that exact/private interaction instance remains causally current. Classify exact live requests first and preserve only observed finite interactions across soft owner loss。When multiple same-method requests lack timestamps，keep first-observation clocks distinct with session-only salted correlation；never expose or persist raw identity。Removal/resolved、cancel、execution-start、newer running/continuation and a previously observed wait whose Desktop runtime resumed plain-active must atomically advance the interaction sequence plus Shadow tombstone；resubscribe is verification and stale replay cannot revive evidence at or below the barrier。A bounded exact completed Plan item is a separate executable artifact，not a pending decision。The enter/exit edges and artifact lifecycle must use the sole Kernel，independent of inventory frequency；Provider、Domain and UI cannot re-reduce them。Every real-host check must read the production Kernel Snapshot and Float applied ACK rather than a copied approximation。

## Alternative Route

- Status: `automated-verified / real-host-pending`; current interaction and stale-replay branches have V7 Kernel tests，while rebuilt uTools response/cancel/execute 300ms + 30s no-rebound acceptance remains external.
- Preconditions: either an authenticated、version-compatible Desktop Shadow exposes a finite unresolved request，an interrupted/failed/inProgress row provides an exact unmatched input call，or a completed row's bounded rollout contains an exact latest-Turn Plan item.
- Ordered steps: project exact current request as Interaction evidence；retain only observed finite interactions across soft owner loss；atomically tombstone resolve/cancel/execute/new-Turn；project bounded completed Plan evidence into the independent artifact lane；publish one Kernel Snapshot.
- Verification: current input/approval/Plan interaction enters attention；reply/cancel/execute clears within one semantic revision；old initial/full/refollow/read-state/rollout replay cannot restore it；a new instance can wait；artifact-only is stopped；unread is higher priority；content/raw identity/correlation do not cross the bridge.
- Applicability boundary: this rule does not turn plan text、`resumeState`、unread、arbitrary connector waiting、arbitrary rollout call or arbitrary item into waiting-input。The persisted Plan fallback requires an exact structural Plan item plus latest completed Turn and creates only an artifact.
- Fallback: if neither exact/sticky Desktop authority nor the safe ordinary-input rollout evidence exists, keep the conservative ongoing/terminal rules and wait for verified provider state.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-27 | RAW-093 Plan confirmation input | User clarified that completed Plan awaiting confirmation is waiting-input and must update fastest | Request flags were read only under runtime active, and the Plan method was not recognized | Added exact Plan-request mapping and unresolved-request priority over idle runtime; synchronized source/test/authority contracts | candidate; static source checks pass, real Desktop/uTools transition pending |
| 2026-08-03 | RAW-141 ownerless current input | Native Codex showed one long-lived `Needs input` while EyPc showed ongoing | Assumed refollow would replay current request; dropped every shadow on owner loss and trusted App Server latest Turn, which omitted the request | Kept finite observed request shadows across soft owner loss, preserved Desktop observation across non-kill hiding, and added bounded exact `request_user_input` rollout fallback | verified by unique current-host evidence, focused 170/170, full workspace 737/737 and isolated commit 711/711 plus type/build/runtime gates; rebuilt uTools display pending |
| 2026-08-03 | RAW-142 completed Plan implementation wait | A finished planning Turn appeared as completed-unread although implementation had not started | Required a replayable Desktop request and treated completed Turn as terminal regardless of exact Plan item | Parse exact latest-Turn Plan item from bounded rollout/live item events; project Plan-only waiting until a newer Turn, independent of unread | focused Bridge+Domain 114/114, Controller 2/2 and type/preload checks pass; real uTools pending |
| 2026-08-03 | RAW-145 persisted ordinary input recurrence | Native Codex again showed `Needs input` while EyPc showed ongoing, despite RAW-141 source preflight claiming active | Persisted fallback lost provenance as plain connector at the Domain boundary; the preflight copied a looser active predicate and never ran the production consumer | Added `persisted-decision`, preserved it through inventory/Activity reconstruction, cleared it on exact newer evidence, upgraded to v5 and made preflight execute production Domain | Provider→Domain first converged 1→1, then after decision removal 0→0; focused 192/192, typecheck/full build/mirror pass; installed uTools ASAR reload pending |
| 2026-08-07 | RAW-147 preflight import drift | The production-Domain preflight failed after `codex.ts` gained relative value imports | Evaluated the transpiled root with a `require` anchored at `scripts/`, so `./companionProvider` resolved outside `src/domain` | Added a cached in-memory TypeScript module loader that resolves each relative dependency from its importing source file | Current 30-day production projection returns `ok=true`, v5 and verified completeness; no generated source or private task data persisted |
| 2026-08-08 | RAW-149 permission attention lifecycle | Permission/command/file/MCP approvals were absent from the product attention set; identical untimestamped approvals also needed stable clocks across full-snapshot add/remove without leaking request identity | Recognized only older input/Plan families and matched private observations solely by type/method/time | Added the finite approval allowlist, latest unresolved state time, process-random salted private correlation, Side Chat aggregation and v6 anonymous `waitingSince/statusEnteredAt` boundary | Bridge `84/84` and full affected matrix pass; real Provider→Domain/Presentation v6 preflight is connected/verified, rebuilt uTools approval UI remains host-pending |
| 2026-08-08 | RAW-151 bidirectional waiting edge | Both ongoing→waiting and waiting→ongoing could remain behind full inventory or a missed callback | Added positive request handling without one equally direct removal/new-Turn path and used inventory frequency as the practical fallback | Unified both edges, added per-task bounded resubscribe, rollout file watch and one-second phase-only candidate watchdog；RAW-155 later removed the periodic inventory setting entirely | focused P95/drop contracts pass；real host remains separately gated |
| 2026-08-09 | RAW-153 active-vs-active waiting clear | Real v7 float stayed at one waiting/four active while Provider→production Domain was zero/five; the row could disappear and later return | Treated every current-owner `desktop-live + active` as reusable, ordered App Server active only against Desktop idle, lacked request/runtime clear sequences and ignored `serverRequest/resolved` | Added private request/runtime observation sequences, immediate waiting-clear barriers, exact resolved correlation, stale replay suppression and conservative unmatched-resolved resubscribe | Bridge `94/94`, affected matrix `379/379`, typecheck/build/preload/runtime gates pass; current ASAR is v7 and v8 real-host gate remains rework |
| 2026-08-16 | leftover plan/question request after user reply | After answering a Plan or question, Codex was already running but EyPc stayed on 待输入 | Unioned every visible Desktop request into waiting, even after runtime resumed plain-active without waiting flags, so leftover plan/question requests outranked running | Clear only previously observed wait flags when Desktop runtime transitions into plain-active; keep first-observation `active + request` and idle Plan override | Bridge `146/146` including leftover plan/question resume and first-observation wait; real uTools reload remains host-pending |
| 2026-08-24 | RAW-179 V7 stale waiting rebound | Two completed/read tasks still displayed waiting；one cleared state was overwritten by an old Desktop initial snapshot about 343ms later | Interaction clear was not an atomic Shadow transition，completed Plan artifact was merged into waiting，and multiple reducers allowed reverse overwrite | Separate Interaction/PlanArtifact lanes；atomic sequence+tombstone；artifact-only stopped；same-revision quarantine；one Kernel presentation snapshot | focused Kernel/Bridge/stale-replay tests and architecture review pass；real uTools 300ms/30s acceptance pending |
