---
id: eypc-codex-provider-status-display-normalization
status: verified
scope: project
fingerprint: codex-provider-status-display__raw-interrupted-enum-reached-badges-cards-and-details__provider-evidence-coupled-to-product-vocabulary__normalize-at-domain-card-projection-preserve-raw-action-evidence
first_seen: 2026-07-22
last_verified: 2026-08-15
review_after: 2026-09-15
evidence:
  - src/domain/codex.ts
  - preload/companion/task-kernel.cjs
  - src/runtime/codexController.ts
  - src/FloatApp.vue
  - preload/index.js
  - tests/platform/codexAppServerBridge.test.ts
  - vibe/specs/260718/1148-codex-quota-float/verify.md
tags:
  - codex-companion
  - provider-state
  - domain-projection
  - user-visible-status
  - action-capability
  - archive-safety
---

# Normalize Provider Status Before It Reaches Product UI

## 更新引入（2026-08-08，RAW-150）

内部状态合同仍使用 `stopped`，但当前可见词统一为“待继续”，且不新增顶层 Tab、角标或快捷入口。RAW-091/131 的“stopped 永久禁止归档”只保留为历史防误判背景：显式 stopped 现在允许任务级归档，安全边界由 Domain capability、Controller provider adapter 和 Host 写前精确重读共同承担；恢复运行必须返回 `state-changed`。项目批量仍只处理 Codex completed。

## 更新引入（2026-08-09，RAW-154 / task-state-v9）

精确 `interrupted/user-stopped` 不再要求额外 Desktop idle：未解决 input/approval 仍最优先，因果上更新的新 Turn/active 次之；两者都没有时，精确 terminal watermark 立即进入 stopped/待继续，并清除更旧的 Desktop active/waiting shadow，但不得伪造 `desktop-live idle`。普通 `failed` 继续使用历史的 exact idle/not-running 保守门禁。后续严格更新的新 Turn 可恢复进行中。待继续仍只进入动态页卡片分段，不进入进行中分段或任一紧凑角标。

## 当前修正（2026-08-11，RAW-160 / task-state-v10）

RAW-154 的“任意精确 interrupted 立即 stopped”已被真实宿主复现为过宽并废止。2026-08-11 的第二次安装核验进一步证明，只有 Preload 临时父投影而没有 Kernel 私有分支账本仍不够：旧父级 `idleConfirmed` 能与新 active 共存并再次发布待继续。当前由 Kernel V4 的私有 Branch Evidence Store 逐分支裁决再聚合：真实 active 或 unresolved input/approval 优先；新 active、Turn 或更新 waiting 清理同分支旧 idle；普通 interrupted 只有在全部相关分支分别 idle-confirmed 后才能 stopped；未执行 Plan 还必须完成定向复读，证明没有更新 Turn、activity 或 pending，同时保留 `planReady`。证据不足保持上一稳定非终态并标记 `verifying`。

## 当前修正（2026-08-12，RAW-163 / main-first parent scope）

“逐分支裁决”并不等于“任一子分支都无条件拥有父任务展示权”。用户进一步明确：main 非 completed-read 时必须以 main 为核心；只有 main exact completed 且 unread 已知为 false 后，Side Chat 才可进入父级范围。此时 child running/waiting 可让父任务进入相应非终态，child completed-unread 可让父任务进入 completed-unread；main completed-unread、running、waiting、stopped 或 verifying 均不被 child 覆盖。相同 parent identity 规则也约束打开动作：所有入口只打开 parent，不按 Side Chat 活跃度选择 Deep Link。

## 当前修正（2026-08-12，RAW-164 / all-bead parent scope）

用户最新纠正取代了上一节的 main-first 展示门槛：父卡片代表根任务及全部已确认 Side Chat，任一珠子的更高优先级都必须投影到父任务，固定为 `running > completed-unread > completed`。`thread/list` 中的 fork 不能先作为公共 main 再等待 Desktop 修正；只有同一非空 session、父任务存在且无环时归入根，嵌套 fork 解析到根，异常关系保持独立。Side Chat 只进入 Host 私有 Branch Evidence，公共包只有根任务。RAW-163 的 parent-only 打开与成功后会话期已读确认继续有效。

## 当前修正（2026-08-13，RAW-165 / event-time terminal admission）

真实 Host 进一步证明“RPC 刚读取成功”不是“终态因果更新”：实时源持续 active/waiting 时，库存 `thread/turns/list` 可返回旧 interrupted，旧实现却用扫描时刻生成更高 terminal sequence，使 private branch 变成 terminal 并由 Kernel 正常推送到 Float。另一个同源缺陷是 transport lane 参与 branch ref，及 Side 的 aggregate App Server authority 泄漏到 main。当前 branch ref 只由稳定 parent/branch 决定；库存 terminal 仅为 sequence 0 baseline，真实 terminal event 或可比较的同一/更新 Turn epoch 才能关闭 live。完整快照逐分支合并，父 observation generation 只排序 transport。跨分支 attention 统一为 `waiting-approval > waiting-input/Plan > running > Goal > terminal`，Host push 只在最终 canonical package 与提议一致时记 accepted，否则匿名记 superseded。

## 当前修正（2026-08-13，RAW-166 / bidirectional branch admission）

全局复核发现 RAW-165 只保护了“旧 terminal 不覆盖新 live”，但同一合并点仍允许较晚送达的旧 live 覆盖更新 waiting/live，也允许旧 live 在账本中重开更新 terminal。当前改为一个双向 branch phase admission：live↔live、live↔terminal、terminal↔terminal 都先比较 Provider Turn epoch；同 Turn 的 live 再比较 active event sequence，无法比较时只允许更强 attention 前进，不允许无因果证据清除 waiting。unread 与 Goal 仍作为正交 lane 合并。由此 transport generation 只排序传输，不能在任何方向制造状态新鲜度。

## 当前修正（2026-08-15 / Desktop-only Side source quorum）

真实运行期出现 parent 已 completed/read、App Server 当前库存只有 parent，但父卡仍被一个 Desktop-only Side shadow 投影为 running；重启后立即恢复 completed，证明残留只在进程私有 relation/shadow，而不是父任务缺少完成事件。旧的完整库存同步只更新 inventory relation，没有反向清掉 Desktop relation；定向 child latest-Turn 连续返回 exact empty 后也只结束读循环，没有撤销 shadow，因而 Kernel 按设计继续聚合这颗“珠子”。

当前只允许一个严格结构化退休路径：先接纳 complete App Server inventory 并确认 child 不在其中，再对该 child 做三次 bounded latest-Turn read，且每次都是 exact empty。满足后才删除 Desktop-only relation、activity/shadow 与相关私有缓存，并在没有其它 live branch 时恢复 parent 已保留的 terminal evidence。任一 waiting/Plan、confirmed App Server live、newer evidence 或 incomplete inventory 都 fail closed 保留。诊断只记录 anonymous `task-topology / desktop-side-reconciled / retired-missing` 和有限的 `inventory=complete / latestTurn=empty`，不记录 raw identity/content。没有增加 staleness/TTL；运行时长仍不构成终态。

## Symptom

Badges, task cards, hidden views and details first exposed the provider term `interrupted / 已中断`, even though the product wanted uncertain tasks presented consistently as “进行中”. After the visible label and archive capability were normalized, a later real count showed a second failure mode: two exact live-idle interrupted sessions were still counted as active work, producing four displayed ongoing tasks when only two were actually active.

## Wrong Assumption

The first correction separated provider vocabulary from visible labels but still treated the upstream Turn status as the archive-capability owner. The next conservative expansion then assumed that every non-completed provider outcome must remain one product state. That prevented false completion, but erased the factual difference between transport uncertainty and explicit terminal Turn evidence paired with a known idle/not-running Desktop state.

## Verified Root Cause

Normalization first stopped at the visible activity enum instead of projecting the full product state; later it overcorrected into a blanket fallback. The projector lacked a named stopped state and a two-source evidence rule, so `failed/interrupted` was treated identically whether Desktop was actively running, exactly idle, explicitly not running, or merely unreachable.

## Evidence

- [task-kernel.cjs](../../../preload/companion/task-kernel.cjs#L1) owns the Host-only Branch Evidence Store、branch/parent causal reduction and the stale-idle clearing rule.
- [codex.ts](../../../src/domain/codex.ts#L1) preserves raw Provider evidence and the V10 privacy-safe fields；it does not own final group/count/cycle decisions.
- [codexController.ts](../../../src/runtime/codexController.ts#L1) consumes Kernel capability before dispatch and keeps project batch completed-only；it has no interrupted→stopped fallback.
- [FloatApp.vue](../../../src/FloatApp.vue#L1) consumes ongoing and stopped as separate stable groups, maps stopped to visible “待继续”, and consumes the Domain capability without duplicating evidence rules.
- [preload/index.js](../../../preload/index.js#L1) retains raw provider evidence for targeted latest-Turn confirmation and Host archive revalidation without exposing separate abnormal product states.
- [verify.md](../../specs/260718/1148-codex-quota-float/verify.md#L1) records the visible-status and archive-capability acceptance matrix without preserving raw-interrupted action behavior.

## Detection Order

1. Identify the raw provider status and every consumer that needs diagnostic/action evidence.
2. Identify the Kernel reducer/projection seam that creates user-visible cards and capabilities.
3. Define a product-visible state union independently of the provider union.
4. Trace counts, groups, labels, icons, colors, hidden views, details and every action capability from the projected state.
5. Separate absence of authority from positive authority: transport failure is not idle, and bridge failed is not process not-running.
6. Compare every provider-source transition that maps to the same product state; fixed action slots must not toggle availability between equivalent projections.
7. Guard both directions: an older terminal cannot close newer live/waiting, and an older live replay cannot clear newer waiting or reopen a newer terminal. Carry a finite privacy-safe provenance token on the deliberate post-exit targeted reread so a same-Turn stop does not fall back to structural reconciliation; explicit not-running may confirm failed/interrupted only.
8. Revalidate the same rule in Kernel capability、Actions selector and Host single/batch mutation guards；Controller must not restate it.

## Prevention Rule

Provider enums are evidence, not automatically product vocabulary, causal freshness or action capability. Normalize the complete product state once in Kernel and always include every confirmed root/Side bead in the parent scope。Branch identity must be stable across transport lanes；inventory/read success is observation only and must never mint terminal causal sequence。Merge complete snapshots per stable branch through one bidirectional admission gate using comparable Turn epochs/event sequences；stale live、waiting or terminal evidence cannot replace a causally newer branch state in either direction。Across branches use `waiting-approval > waiting-input/Plan > running > Goal > terminal`；within completion-facing states running still outranks completed-unread/completed，and latent unread cannot create a second group/count while active。Ordinary interruption needs exact branch-idle confirmation，and an unexecuted Plan interruption additionally needs targeted no-newer-Turn/activity/pending proof。A Desktop-only Side may be retired only by complete-inventory exclusion plus bounded exact-empty targeted reads，never by age；waiting/Plan、App Server live、newer evidence and incomplete inventory preserve it。Every UI/count/action surface consumes the same canonical package，and diagnostics judge proposal acceptance only after that package commits。Do not fix this with scan-time watermarks、extra visible states、TTL、long holds、faster polling or scattered Controller/Renderer branches。

## Alternative Route

- Status: `verified` through the 2026-08-15 state-source reconciliation affected automation；current rebuilt-host acceptance remains pending.
- Preconditions: an upstream status must remain available for diagnostics or action verification but should use different product semantics.
- Ordered steps: preserve raw status/unread and Provider Turn epoch → classify topology privately with stable branch refs → merge incoming evidence against prior branch causality → aggregate attention/running/Goal/terminal → compare Host proposal with final canonical package → open only parent → revalidate mutation in Host.
- Verification: stale inventory terminal cannot replace current running/waiting；stale live cannot clear newer waiting or reopen newer terminal；same/newer exact terminal and a genuinely newer Turn/event sequence can advance；no second public timestamp gate competes with Branch Evidence；main attention outranks Side running；Side authority does not leak to main；phase/unread/Goal lanes do not erase one another；canonical conflict is superseded, not accepted；a complete inventory excluding a Desktop-only Side plus three exact-empty targeted reads retires only that stale shadow，while waiting/Plan/App Server live/incomplete inventory blocks retirement。The 2026-08-15 affected 7-file matrix passes `340/340` plus canonical/public syntax/mirror、typecheck and 1871-module production/runtime validation；`host-931a95f5973c8c7f08e2 / renderer-d238ab7d0c6a67a71a5c` uTools acceptance remains pending。
- Applicability boundary: does not rewrite user-authored task titles or unrelated prose containing the same word.
- Fallback: if the product mapping is context-dependent, expose a named presentation mapper rather than mutating the raw protocol type.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-22 | RAW-066 visible status normalization | User required that no task-status surface display “中断” | Passed raw interrupted through the visible activity union and Renderer branches | Normalized at the domain card projection and preserved raw archive evidence | candidate; user runtime/archive acceptance pending |
| 2026-07-22 | RAW-068 ongoing archive stability | User observed archive-button flashing after visible normalization already worked | Stopped normalization at labels/state union while raw interrupted still enabled archive | Projected ongoing now blocks archive across UI/Controller/Host single and project paths | candidate; static checks only, user runtime acceptance pending |
| 2026-07-26 | RAW-089 conservative product-state fallback | User required uncertainty and abnormality to never appear as separate task states | Kept failed/system-error/unknown visible after interrupted had already normalized | Expanded the domain projection and capability rule to every non-completed abnormal/unconfirmed state | candidate; contracts updated, real transition acceptance pending |
| 2026-07-27 | RAW-091 explicit stop vs uncertainty | Real anonymous authority read showed four projected ongoing contained only two active tasks plus two live-idle interrupted sessions | Over-normalized every non-completed terminal outcome into ongoing and used the first idle delta before freshness reconciliation | Added stopped as a conjunction of terminal Turn + exact idle/not-running, preserved active/transport uncertainty priority, and guarded stale terminal exits | candidate; correction checkpoint matched `2 ongoing / 2 stopped`; later new active work changed the live count without reviving the error; uTools/crash acceptance pending |
| 2026-08-08 | RAW-150 waiting-to-continue/archive refinement | User required stopped to read as “待继续” and remain task-archiveable without a new top-level state entry | Treated an earlier safety block as permanent product capability and leaked the old “已停止” vocabulary | Keep internal stopped evidence, map presentation once, allow task archive with exact Host reread, retain completed-only project batch | focused automated contracts pass; real v7 uTools remains host-pending |
| 2026-08-09 | RAW-154 exact interruption priority | User observed interrupted tasks still appearing in ongoing and required 待继续 to stay out of the ongoing badge | Reused the ordinary failed idle/not-running conjunction for exact user interruption, so older Desktop active shadow could block stopped indefinitely | Add v9 terminal watermark: waiting/newer active first, otherwise exact interrupted immediately stopped；keep ordinary failed conservative | focused Domain/Bridge/Controller/UI contracts pass；real v9 host pending |
| 2026-08-11 | RAW-160 interruption causality | Real host showed ordinary interrupted being classified as 待继续 while work/Plan evidence was not yet settled | Let exact interruption bypass idle and targeted verification | Move branch/parent reduction to Kernel V4, require idle-confirmed ordinary stop and targeted Plan stop, retain stable verifying state on conflict | affected/full automation verified；current host matrix pending |
| 2026-08-12 | RAW-160 installed-host branch recurrence | A parent still displayed 待继续 while one real main/Side branch continued running | Preload aggregated branches but published only a parent projection；Kernel had no private branch ledger, so stale parent idle coexisted with new active；unknown projection and a new-row running baseline remained secondary false-positive routes | Add the Kernel-private Branch Evidence Store, clear branch-local idle on newer active/Turn/waiting, make Domain projection-only, reject hydration/cold replay as live without causal evidence, and preserve inventory semantics on abstain | latest affected 545/545 + full 1305/1305 + type/build passed；`host-719360…` matrix pending |
| 2026-08-12 | RAW-163 main-first Side Chat authority | User clarified that a Side Chat may follow a completed-read main, but must not overwrite any other main state；jumping must still open the main task | Reused the cross-branch “any live wins” priority as an unconditional parent rule and coupled visible child state to a child Deep-Link preference | Add main/side role plus branch unread evidence，gate all-branch scope on main completed-read，commit phase/unread atomically and remove Side Chat navigation target selection | focused `177/177`、syntax/mirror、type/build/runtime validation passed；current uTools identity pending |
| 2026-08-12 | RAW-164 all-bead Side Chat authority | User corrected the parent rule again：any earlier-state bead must win，including completed-unread main + running Side；inventory-listed children also appeared as duplicate rows | Kept RAW-163's main-completed-read gate and assumed Desktop alone supplied Side topology | Build same-session inventory topology，keep children private，always aggregate all beads，retain parent-only open and add semantic topology/parent/identity diagnostics | focused `189/189`、syntax/mirror、type/build/runtime validation passed；current uTools `host-loaded` acceptance pending |
| 2026-08-13 | RAW-165 inventory terminal causal inversion | Real Cloud task kept executing/waiting while EyPc published stopped/running from contradictory private evidence；Float applied the wrong canonical package | Treated a successful inventory RPC and local scan sequence as causally newer terminal，included transport lane in branch identity，leaked Side authority to main and judged Host proposal before final Kernel state | Stable branch refs，event-time terminal admission，per-branch Turn epoch merge，attention-first aggregation，branch-local authority and final-canonical accepted/superseded diagnostics | affected `364/364`、mirror/syntax、type/build/runtime validation passed；current uTools `host-loaded` acceptance pending |
| 2026-08-13 | RAW-166 bidirectional causality audit | Full review found that a later transport replay of an older live Turn could still clear a newer waiting state or overwrite a newer branch epoch；phase replacement could also erase unread/Goal；a public timestamp-only guard duplicated the private phase owner | Protected only terminal→live conflict and treated the incoming branch as one replaceable value | Use one live/terminal bidirectional admission gate over Turn time or real event sequence，merge phase/unread/Goal independently and remove the second phase gate | affected `457/457`、mirrors、error-memory validator、typecheck/build/uTools validator pass；real `host-loaded` pending |
| 2026-08-15 | Desktop-only Side source reconciliation | Parent native task was completed/read but EyPc remained running until Host restart；current complete App Server inventory contained only the parent | Inventory topology refresh removed only inventory relations；three exact-empty child reads exhausted without clearing the process-private Desktop relation/shadow | Retire the child only on complete-inventory exclusion + three exact-empty targeted reads，with waiting/live/newer/incomplete guards and no TTL | affected 7-file `340/340` plus type/build passed；real `host-loaded` pending |
