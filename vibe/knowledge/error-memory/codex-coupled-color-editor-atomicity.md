---
id: eypc-codex-coupled-color-editor-atomicity
status: verified
scope: project
fingerprint: codex-card-color-pair__independent-native-color-popups-or-wrong-float-editor__one-sided-validation-cannot-converge__shared-draft-whole-pair-validation-atomic-commit
first_seen: 2026-07-22
last_verified: 2026-07-22
review_after: 2027-01-22
evidence:
  - src/components/CodexCardColorDialog.vue
  - src/pages/CodexPage.vue
  - src/runtime/codexController.ts
  - tests/ui/codexCompanion.test.ts
tags:
  - codex-companion
  - coupled-colors
  - atomic-update
  - validation
  - accessibility
---

# Coupled Colors Need One Draft Transaction

## Symptom

The requested card surface/foreground pair was first represented as separate native color popups, then as adjacent controls with a modal-only preview; an unrelated water main/sub editor also appeared in the desktop float. These shapes did not provide the two linked selectable boards, constrained partner gamut, in-place alternate color cards or real-companion preview/rollback the user requested.

## Wrong Assumption

Putting two single-color controls or slider groups near each other was treated as equivalent to a paired board editor. A modal sample was treated as equivalent to previewing the actual desktop companion, and the float was mistakenly treated as an editor host instead of a display-only consumer.

## Verified Root Cause

Surface and foreground are one constrained value: validity depends on their combined contrast. Independent popup lifecycles and per-field writes expose invalid intermediate states to the validator. Even after sharing a modal, slider-only controls do not satisfy a request for selectable color planes, and modal-only preview cannot prove the real companion result. The complete interaction needs one draft lifetime, an explicit valid gamut, deterministic partner adjustment, transient real-target preview, rollback and atomic persistence.

## Evidence

- [CodexCardColorDialog.vue](../../../src/components/CodexCardColorDialog.vue#L1) owns both linked canvas boards, invalid-gamut mask, hue/HEX drafts, the in-place 12-card swatch palette, last-valid values, focus containment and one confirmation event.
- [CodexPage.vue](../../../src/pages/CodexPage.vue#L1) dispatches complete preview/commit/cancel actions and clears transient preview on unmount.
- [codexController.ts](../../../src/runtime/codexController.ts#L1) rejects one-sided, malformed and low-contrast previews/updates, publishes a memory-only real-float snapshot, restores persisted style/colors on cancel and saves the pair once on commit.
- [FloatApp.vue](../../../src/FloatApp.vue#L1) consumes the effective snapshot and contains no water/color editing controls.
- [codexCompanion.test.ts](../../../tests/ui/codexCompanion.test.ts#L1) verifies simultaneous boards, swatch-card selection, no native color input, local invalid drafts, real-float preview/rollback, one write on confirm, zero writes on cancellation and no float water editor.

## Detection Order

1. Identify fields whose validity depends on each other rather than on each field alone.
2. Inspect whether all coupled fields share one draft lifetime, actual requested picker surfaces, preview target and confirmation boundary.
3. Verify invalid text can remain editable without reaching persisted state or poisoning the last valid preview.
4. Count persistence calls for confirm, cancel, Escape and backdrop paths.
5. Verify transient preview cannot persist and every cancel/unmount path restores the saved target snapshot.
6. Repeat validation at the Controller boundary so a UI bypass cannot create a partial update.

## Prevention Rule

Coupled appearance values must use one local draft transaction, validate the complete candidate, and commit once. Do not describe adjacent native pickers or slider groups as a paired board editor. When the user asks for two boards, render two actual selectable color planes, make invalid partner gamut visible and adjust the coupled member deterministically. Preview the requested real target through reversible transient state; keep the target display-only. Cancellation paths write nothing and restore saved state, while persistence APIs reject patches that omit any coupled member.

## Alternative Route

- Status: `verified`.
- Preconditions: two or more fields jointly determine contrast, validity or derived tokens.
- Ordered steps: normalize the persisted pair; open one draft container with one selectable plane per member; render valid/invalid gamut; preserve the chosen member and move the partner to its nearest safe candidate; keep invalid text local; publish only complete valid drafts to reversible Controller memory; emit one complete commit or clear preview; repeat the same gate in Runtime/Controller.
- Verification: unit-test migration, nearest safe candidate and pair validation; component-test boards/palette/keyboard/draft/ARIA/focus/confirm/cancel; assert exactly one save for a valid pair and zero saves for previews, invalid or partial patches; verify cancellation restores the real target and inspect narrow/short-height layouts.
- Applicability boundary: applies to coupled theme tokens and similar multi-field constraints, not independent preferences whose validity and persistence do not interact.
- Fallback: if a platform picker cannot share the transaction and valid gamut, replace it with explicit custom boards plus text/range fallbacks inside one accessible modal rather than attempting sequential writes.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-22 | Codex card paired-color editor | User could still open only one color at a time and the wrong water editor appeared in the float | Independent native color inputs plus immediate one-sided updates | Replaced with one HSL/HEX modal draft, whole-pair/derived validation and atomic Controller persistence; removed the float water editor | verified |
| 2026-07-22 | RAW-054 linked color boards | User clarified that two actual linked boards, constrained partner gamut, real-float preview/rollback and a clickable swatch palette were required | Slider-only modal with modal-only preview | Added two canvas boards, invalid-gamut mask, nearest-lightness coupling, in-place 12-card palette and Controller transient real-float preview/rollback; float remains display-only | verified |
