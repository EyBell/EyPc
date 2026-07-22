---
id: eypc-codex-provider-status-display-normalization
status: candidate
scope: project
fingerprint: codex-provider-status-display__raw-interrupted-enum-reached-badges-cards-and-details__provider-evidence-coupled-to-product-vocabulary__normalize-at-domain-card-projection-preserve-raw-action-evidence
first_seen: 2026-07-22
last_verified: 2026-07-22
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

Badges, task cards, hidden views and details first exposed the provider term `interrupted / 已中断`, even though the product wanted those tasks presented consistently as “进行中”. After the visible label was normalized, the fixed archive action still flashed because its availability continued to alternate with the raw provider source.

## Wrong Assumption

The first correction separated provider vocabulary from visible labels but still treated the upstream Turn status as the archive-capability owner. That left one product concept with a stable “进行中” label but two alternating action states.

## Candidate Root Cause

Normalization stopped at the visible activity enum instead of projecting the full product state. Raw protocol truth still controlled `archiveCapability`, so desktop-live active produced `blocked-active` while persisted interrupted produced `allowed`; repeated source updates toggled `canArchive` even though both rendered as ongoing.

## Evidence

- [codex.ts](../../../src/domain/codex.ts#L1) keeps raw `CodexTurnStatus='interrupted'`, projects it to visible `activityState='ongoing'`, adjusts counts and now derives `blocked-active` from the projected ongoing state.
- [codexController.ts](../../../src/runtime/codexController.ts#L1) rejects blocked capability before dispatch and sends terminal evidence only for explicitly allowed failed-state cards.
- [FloatApp.vue](../../../src/FloatApp.vue#L1) consumes ongoing for badges, grouping, labels, icons and detail surfaces, while its fixed action slot, drawer, Shift preview and batch targeting consume the same stable `canArchive`.
- [preload/index.js](../../../preload/index.js#L1) rejects interrupted during single-archive reread, skips it during project archive and accepts terminal evidence only for failed.
- [verify.md](../../specs/260718/1148-codex-quota-float/verify.md#L1) records the visible-status and archive-capability acceptance matrix without preserving raw-interrupted action behavior.

## Detection Order

1. Identify the raw provider status and every consumer that needs diagnostic/action evidence.
2. Identify the domain projection seam that creates user-visible cards.
3. Define a product-visible state union independently of the provider union.
4. Trace counts, groups, labels, icons, colors, hidden views, details and every action capability from the projected state.
5. Compare every provider-source transition that maps to the same product state; fixed action slots must not toggle availability between equivalent projections.
6. Revalidate the same rule in Controller evidence selection and Host single/batch mutation guards.

## Prevention Rule

Provider enums are evidence, not automatically product vocabulary or action capability. Normalize the complete product state once at the domain projection boundary—including destructive-action availability—then make every UI surface consume that projection. Raw evidence may remain for diagnostics and Host revalidation, but it must not reintroduce a product distinction that the projection intentionally removed. Do not fix this with scattered text replacements in the Renderer.

## Alternative Route

- Status: `candidate`; static implementation is complete and user runtime/archive acceptance is pending.
- Preconditions: an upstream status must remain available for diagnostics or action verification but should use different product semantics.
- Ordered steps: preserve raw status; add/adjust the visible union; normalize visible state and action capability in one projector; update counts and every presentation/action consumer; align Controller evidence and Host mutation guards; scan for leaked branches and source-driven availability changes.
- Verification: raw interrupted contributes to the ongoing badge and every task surface says “进行中”; fixed archive controls remain disabled across active/interrupted updates; single/project Host paths reject or skip interrupted; failed/system-error/unknown stay unchanged. Current evidence is static and user runtime acceptance remains pending.
- Applicability boundary: does not rewrite user-authored task titles or unrelated prose containing the same word.
- Fallback: if the product mapping is context-dependent, expose a named presentation mapper rather than mutating the raw protocol type.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-22 | RAW-066 visible status normalization | User required that no task-status surface display “中断” | Passed raw interrupted through the visible activity union and Renderer branches | Normalized at the domain card projection and preserved raw archive evidence | candidate; user runtime/archive acceptance pending |
| 2026-07-22 | RAW-068 ongoing archive stability | User observed archive-button flashing after visible normalization already worked | Stopped normalization at labels/state union while raw interrupted still enabled archive | Projected ongoing now blocks archive across UI/Controller/Host single and project paths | candidate; static checks only, user runtime acceptance pending |
