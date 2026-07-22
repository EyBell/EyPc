---
id: eypc-codex-selection-state-needs-structural-contrast
status: candidate
scope: project
fingerprint: codex-multiselect-feedback__small-hit-area-and-state-replacement-remain-ambiguous__decorative-selection-cue__full-height-selector-mode-gradient-state-icon
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
  - multi-select
  - visual-feedback
  - accessibility
  - interaction-state
---

# Selection Needs Structural Contrast

## Symptom

Selected rows used an accent gradient, border and glow, but the user still could not clearly distinguish selection mode or selected membership from ordinary hover/focus states. The later checked control also left only a narrow selector and replaced useful task-state identity, so selection could be hard to trigger and the result still felt unclear.

## Wrong Assumption

Increasing effects within the same hue and later adding a check symbol were treated as sufficient without validating hit-area discoverability, row/button event ownership or preservation of the status icon.

## Verified Root Cause

The first correction amplified decoration without adding independent semantic and structural cues. The next correction named the mode but kept the left target narrow and overloaded the status control with a check. User feedback established that reliable selection needs both a broad, stable hit region and a result that preserves task-state identity while the row carries the multi-select emphasis.

## Evidence

- [FloatApp.vue](../../../src/FloatApp.vue#L1) now exposes a persistent selection-mode label, live count and Escape hint.
- [float.css](../../../src/styles/float.css#L1) de-emphasizes unselected rows, makes the selector a full-height 38px rectangle and composes selected rows from existing theme tokens.
- [codexCompanion.test.ts](../../../tests/ui/codexCompanion.test.ts#L1) records mode lifecycle, click state machine and row/child key ownership.

## Detection Order

1. Compare ordinary hover, keyboard focus and selected states without relying on animation.
2. Check whether the overall mode is named outside individual rows.
3. Check that the selector is a large, stable region rather than a small icon target, and that it preserves any status identity users still need.
4. Verify row-level Space and button-native Space/Enter cannot both handle the same event.
5. Check whether selected and unselected rows differ in at least two independent channels: shape/structure, text, luminance or saturation.
6. Verify the last deselection removes every mode cue.

## Prevention Rule

Do not encode a major interaction mode only through subtle same-hue effects or a small replacement symbol. Name the mode, expose its count, reduce competing visual weight, provide a broad stable selector, preserve the task-state icon, and put selected emphasis on the row/control surface. Preserve ARIA state and give row versus child buttons deterministic keyboard ownership.

## Alternative Route

- Status: `candidate`; awaiting user visual acceptance.
- Preconditions: selection coexists with hover and keyboard focus in a dense list.
- Ordered steps: add a mode-level status cue; expand the selector to the full row-leading region; preserve status identity; de-emphasize nonmembers; compose selected theme gradients and hover/focus/active rules; isolate row and child-button key handling.
- Verification: test mode entry/count/exit, selected membership toggles, keyboard parity, forced/reduced-motion behavior and contrast on supported themes.
- Applicability boundary: applies to explicit selection modes, not transient hover-only highlighting.
- Fallback: if theme tokens cannot maintain adequate contrast, use text and outline structure rather than introducing an undocumented color.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-22 | RAW-057 selection contrast | User reported the reinforced multi-select effect was still not obvious | Same-hue gradient, glow and narrow leading accent | Added mode bar/count, nonmember de-emphasis, thick selected boundary and solid check badge | candidate; user acceptance pending |
| 2026-07-22 | RAW-058 selection/pin/counter fusion | User reported selection was often impossible to trigger and the checked result remained unsatisfactory | Narrow selector plus status-icon replacement; child key events could reach row commands | Expanded the selector to 38px full height, restored the status icon, added theme tri-gradient and isolated row/button key ownership | candidate; focused multi-select tests `3 / 3` pass, visual acceptance pending |
