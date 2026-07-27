---
id: eypc-codex-provider-status-display-normalization
status: candidate
scope: project
fingerprint: codex-provider-status-display__raw-interrupted-enum-reached-badges-cards-and-details__provider-evidence-coupled-to-product-vocabulary__normalize-at-domain-card-projection-preserve-raw-action-evidence
first_seen: 2026-07-22
last_verified: 2026-07-27
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

## Symptom

Badges, task cards, hidden views and details first exposed the provider term `interrupted / 已中断`, even though the product wanted uncertain tasks presented consistently as “进行中”. After the visible label and archive capability were normalized, a later real count showed a second failure mode: two exact live-idle interrupted sessions were still counted as active work, producing four displayed ongoing tasks when only two were actually active.

## Wrong Assumption

The first correction separated provider vocabulary from visible labels but still treated the upstream Turn status as the archive-capability owner. The next conservative expansion then assumed that every non-completed provider outcome must remain one product state. That prevented false completion, but erased the factual difference between transport uncertainty and explicit terminal Turn evidence paired with a known idle/not-running Desktop state.

## Candidate Root Cause

Normalization first stopped at the visible activity enum instead of projecting the full product state; later it overcorrected into a blanket fallback. The projector lacked a named stopped state and a two-source evidence rule, so `failed/interrupted` was treated identically whether Desktop was actively running, exactly idle, explicitly not running, or merely unreachable.

## Evidence

- [codex.ts](../../../src/domain/codex.ts#L1) keeps raw Turn/Host evidence and projects active first, completed second, terminal Turn + live idle/not-running as `stopped/blocked-stopped`, and every remaining abnormal or unconfirmed case as `ongoing/blocked-active`; unknown/attention counts stay zero.
- [codexController.ts](../../../src/runtime/codexController.ts#L1) rejects blocked capability before dispatch and sends archive evidence only for explicitly completed cards.
- [FloatApp.vue](../../../src/FloatApp.vue#L1) consumes ongoing and stopped as separate stable groups/labels/icons while its compact counts, fixed action slot, drawer, Shift preview and batch targeting consume the same projected capability.
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

Provider enums are evidence, not automatically product vocabulary or action capability. Normalize the complete product state once at the domain projection boundary—including destructive-action availability—but do not flatten positive terminal evidence into the same bucket as missing authority. Require a conjunction for explicit stop (`failed/interrupted` plus exact live idle or bridge not-running), keep active first, and keep transport failure ongoing. Every UI/count/action surface must consume that projection; do not fix this with scattered Renderer text replacements.

## Alternative Route

- Status: `candidate`; static implementation is complete and user runtime/archive acceptance is pending.
- Preconditions: an upstream status must remain available for diagnostics or action verification but should use different product semantics.
- Ordered steps: preserve raw status; add/adjust the visible union; normalize visible state and action capability in one projector; update counts and every presentation/action consumer; align Controller evidence and Host mutation guards; scan for leaked branches and source-driven availability changes.
- Verification: exact active remains ongoing; terminal + live idle/not-running appears as stopped and leaves ongoing counts; bridge failed/system-error/notLoaded/missing evidence stays ongoing; both ongoing and stopped keep archive disabled; only completed enables archive. Current aggregate evidence passes locally, while user uTools/active-stop/crash acceptance remains pending.
- Applicability boundary: does not rewrite user-authored task titles or unrelated prose containing the same word.
- Fallback: if the product mapping is context-dependent, expose a named presentation mapper rather than mutating the raw protocol type.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-22 | RAW-066 visible status normalization | User required that no task-status surface display “中断” | Passed raw interrupted through the visible activity union and Renderer branches | Normalized at the domain card projection and preserved raw archive evidence | candidate; user runtime/archive acceptance pending |
| 2026-07-22 | RAW-068 ongoing archive stability | User observed archive-button flashing after visible normalization already worked | Stopped normalization at labels/state union while raw interrupted still enabled archive | Projected ongoing now blocks archive across UI/Controller/Host single and project paths | candidate; static checks only, user runtime acceptance pending |
| 2026-07-26 | RAW-089 conservative product-state fallback | User required uncertainty and abnormality to never appear as separate task states | Kept failed/system-error/unknown visible after interrupted had already normalized | Expanded the domain projection and capability rule to every non-completed abnormal/unconfirmed state | candidate; contracts updated, real transition acceptance pending |
| 2026-07-27 | RAW-091 explicit stop vs uncertainty | Real anonymous authority read showed four projected ongoing contained only two active tasks plus two live-idle interrupted sessions | Over-normalized every non-completed terminal outcome into ongoing and used the first idle delta before freshness reconciliation | Added stopped as a conjunction of terminal Turn + exact idle/not-running, preserved active/transport uncertainty priority, and guarded stale terminal exits | candidate; correction checkpoint matched `2 ongoing / 2 stopped`; later new active work changed the live count without reviving the error; uTools/crash acceptance pending |
