---
id: eypc-codex-control-owned-source-feedback
status: candidate
scope: project
fingerprint: codex-action-source-feedback__row-tail-label-duplicates-state__source-split-across-row-and-control__state-control-hover-focus-source
first_seen: 2026-07-22
last_verified: 2026-07-22
review_after: 2026-08-22
evidence:
  - src/FloatApp.vue
  - src/styles/float.css
  - tests/ui/codexCompanion.test.ts
  - vibe/specs/260718/1148-codex-quota-float/verify.md
tags:
  - codex-companion
  - pin-source
  - control-state
  - tooltip
  - accessibility
---

# Control-Owned Source Feedback

## Symptom

Local pin origin was repeated as a small “本地顶” label at the row tail while the actual `顶` control also carried pressed state. The duplicate label consumed dense-row space, separated source from the action and did not explain native read-only or Chats states.

## Wrong Assumption

An extra row-tail label was treated as the clearest way to make persistence visible, even though the fixed action control was already the natural state and interaction owner.

## Verified Root Cause

State was split across two surfaces: the row label described origin while the button owned action, focus, pressed state and shortcuts. This made source inconsistent across local, native, unpinned and unavailable cases and encouraged color/text duplication instead of one accessible state model.

## Evidence

- [FloatApp.vue](../../../src/FloatApp.vue#L1) centralizes four source messages and routes click, Quick Jump and shortcuts through the same read-only guard.
- [float.css](../../../src/styles/float.css#L1) uses the existing warning token for local pin state and keeps native/Chats controls focusable.
- [codexCompanion.test.ts](../../../tests/ui/codexCompanion.test.ts#L1) records source wording, absence of row-tail text and no-dispatch behavior for read-only sources.

## Detection Order

1. Identify which control owns the action, pressed state and keyboard route.
2. Enumerate mutable, read-only, unavailable and inactive source states.
3. Check whether source text is duplicated elsewhere in the row or separated from the owning control.
4. Verify pointer and focus expose equivalent detail without disabling focus.
5. Route click, Enter, Quick Jump and shortcuts through one availability guard.

## Prevention Rule

Express an operation's source and availability on its stateful control and accessible hover/focus explanation. Do not add a separate dense-row tail label when the control can encode the state with token color, `aria-pressed`/`aria-disabled` and one source message.

## Alternative Route

- Status: `candidate`; awaiting user visual and keyboard acceptance.
- Preconditions: a fixed row control represents state originating from local, native or unavailable authority.
- Ordered steps: normalize source to one enum; derive label/style/ARIA from it; keep read-only controls focusable; gate every activation route; remove duplicate row labels.
- Verification: check all source variants by hover, focus, click, Enter, Quick Jump and configured shortcuts; confirm sorting/persistence is unchanged.
- Applicability boundary: applies to compact state/action controls, not long-form provenance fields in a detail panel.
- Fallback: if the control cannot remain legible, expose source in the control's adjacent accessible description rather than an unrelated row-tail badge.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-22 | RAW-058 selection/pin/counter fusion | User required removal of row-tail “本地置顶” and source disclosure on hover | Source split between row-tail text and pressed button; native/Chats were disabled and could not explain themselves | Moved source to the fixed `顶` control, kept read-only states focusable and added a shared activation guard | candidate; static contract updated, user acceptance pending |
