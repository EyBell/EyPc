---
id: eypc-codex-provider-status-display-normalization
status: candidate
scope: project
fingerprint: codex-provider-status-display__raw-interrupted-enum-reached-badges-cards-and-details__provider-evidence-coupled-to-product-vocabulary__normalize-at-domain-card-projection-preserve-raw-action-evidence
first_seen: 2026-07-22
last_verified: 2026-08-09
review_after: 2026-08-22
evidence:
  - src/domain/codex.ts
  - src/runtime/codexController.ts
  - src/FloatApp.vue
  - preload/index.js
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

## Symptom

Badges, task cards, hidden views and details first exposed the provider term `interrupted / 已中断`, even though the product wanted uncertain tasks presented consistently as “进行中”. After the visible label and archive capability were normalized, a later real count showed a second failure mode: two exact live-idle interrupted sessions were still counted as active work, producing four displayed ongoing tasks when only two were actually active.

## Wrong Assumption

The first correction separated provider vocabulary from visible labels but still treated the upstream Turn status as the archive-capability owner. The next conservative expansion then assumed that every non-completed provider outcome must remain one product state. That prevented false completion, but erased the factual difference between transport uncertainty and explicit terminal Turn evidence paired with a known idle/not-running Desktop state.

## Candidate Root Cause

Normalization first stopped at the visible activity enum instead of projecting the full product state; later it overcorrected into a blanket fallback. The projector lacked a named stopped state and a two-source evidence rule, so `failed/interrupted` was treated identically whether Desktop was actively running, exactly idle, explicitly not running, or merely unreachable.

## Evidence

- [codex.ts](../../../src/domain/codex.ts#L1) keeps raw Turn/Host evidence and projects unresolved waiting first、causally newer activity second、completed third、exact interrupted terminal fourth；ordinary failed requires live idle/not-running。Every remaining abnormal or unconfirmed case stays `ongoing/blocked-active`；stopped is excluded from the active count。
- [codexController.ts](../../../src/runtime/codexController.ts#L1) rejects blocked capability before dispatch, sends `completed | stopped` evidence for Codex task-level archive, and keeps project batch completed-only.
- [FloatApp.vue](../../../src/FloatApp.vue#L1) consumes ongoing and stopped as separate stable groups, maps stopped to visible “待继续”, and consumes the Domain capability without duplicating evidence rules.
- [preload/index.js](../../../preload/index.js#L1) retains raw provider evidence for targeted latest-Turn confirmation and Host archive revalidation without exposing separate abnormal product states.
- [verify.md](../../specs/260718/1148-codex-quota-float/verify.md#L1) records the visible-status and archive-capability acceptance matrix without preserving raw-interrupted action behavior.

## Detection Order

1. Identify the raw provider status and every consumer that needs diagnostic/action evidence.
2. Identify the domain projection seam that creates user-visible cards.
3. Define a product-visible state union independently of the provider union.
4. Trace counts, groups, labels, icons, colors, hidden views, details and every action capability from the projected state.
5. Separate absence of authority from positive authority: transport failure is not idle, and bridge failed is not process not-running.
6. Compare every provider-source transition that maps to the same product state; fixed action slots must not toggle availability between equivalent projections.
7. Guard active-exit deltas against terminal outcomes that predate the live activity, but carry a finite privacy-safe provenance token on the deliberate post-exit targeted reread so a same-Turn stop does not fall back to the 15-second structural cycle; explicit not-running may confirm failed/interrupted only.
8. Revalidate the same rule in Controller evidence selection and Host single/batch mutation guards.

## Prevention Rule

Provider enums are evidence, not automatically product vocabulary or action capability. Normalize the complete product state once at the domain projection boundary—including destructive-action availability—but do not flatten positive terminal evidence into the same bucket as missing authority. Split exact user interruption from ordinary failure：waiting still wins；a causally newer Turn/active wins；otherwise exact interrupted may establish stopped directly，while failed still needs exact idle/not-running。Transport failure remains ongoing。Presentation may map internal stopped to “待继续”，but every UI/count/action surface must consume the same projection。A stopped archive must be revalidated at mutation time；do not fix labels、counts or actions with scattered Renderer branches。

## Alternative Route

- Status: `candidate`; static implementation is complete and user runtime/archive acceptance is pending.
- Preconditions: an upstream status must remain available for diagnostics or action verification but should use different product semantics.
- Ordered steps: preserve raw status; add/adjust the visible union; normalize visible state and action capability in one projector; update counts and every presentation/action consumer; align Controller evidence and Host mutation guards; scan for leaked branches and source-driven availability changes.
- Verification: unresolved input + interrupted remains input；newer Turn restores ongoing；exact interrupted without either becomes “待继续” immediately and leaves ongoing counts；ordinary failed still requires live idle/not-running；bridge failed/system-error/notLoaded/missing evidence stays ongoing。Ongoing keeps archive disabled，while explicit stopped and completed allow task-level archive。Codex stopped is rejected after resume by Host reread；project batch remains completed-only。Current focused evidence passes locally，while rebuilt v9 uTools and real stopped/archive acceptance remain pending。
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
