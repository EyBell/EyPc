---
id: eypc-codex-selection-state-needs-structural-contrast
status: candidate
scope: project
fingerprint: codex-multiselect-feedback__small-hit-area-state-replacement-or-flow-positioned-mode-bar-disrupts-dense-list__decorative-selection-cue-or-top-flow-mode-bar__full-height-selector-bottom-overlay-mode-gradient-state-icon
first_seen: 2026-07-22
last_verified: 2026-08-28
review_after: 2026-11-28
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

Selected rows used an accent gradient, border and glow, but the user still could not clearly distinguish selection mode or selected membership from ordinary hover/focus states. The later checked control also left only a narrow selector and replaced useful task-state identity, so selection could be hard to trigger and the result still felt unclear. A later mode bar correctly named the state but appeared as a temporary top normal-flow row, visibly shifting the dense list whenever selection entered or exited.

## Wrong Assumption

Increasing effects within the same hue and later adding a check symbol were treated as sufficient without validating hit-area discoverability, row/button event ownership or preservation of the status icon. Naming the mode was also treated as sufficient without validating whether the cue entered normal flow and changed the user's established list geometry.

## Current Root Cause

The first correction amplified decoration without adding independent semantic and structural cues. The next correction named the mode but kept the left target narrow and overloaded the status control with a check. User feedback established that reliable selection needs both a broad, stable hit region and a result that preserves task-state identity while the row carries the multi-select emphasis. The latest correction establishes that a transient global cue also must preserve spatial stability: inserting it as a top flow row changes the visible list and creates avoidable layout jump even when selection semantics are otherwise correct.

## Evidence

- [FloatApp.vue](../../../src/FloatApp.vue#L1) exposes the persistent selection-mode label, live count and Escape hint inside the list stage rather than above it.
- [float.css](../../../src/styles/float.css#L1) de-emphasizes unselected rows, makes the selector a full-height 38px rectangle, composes selected rows from existing theme tokens, and positions the mode cue as a bottom overlay with scroll/batch-toolbar avoidance.
- [codexCompanion.test.ts](../../../tests/ui/codexCompanion.test.ts#L1) records mode lifecycle, click state machine and row/child key ownership.

## Detection Order

1. Compare ordinary hover, keyboard focus and selected states without relying on animation.
2. Check whether the overall mode is named outside individual rows.
3. Check that the selector is a large, stable region rather than a small icon target, and that it preserves any status identity users still need.
4. Verify row-level Space and button-native Space/Enter cannot both handle the same event.
5. Check whether selected and unselected rows differ in at least two independent channels: shape/structure, text, luminance or saturation.
6. Verify the last deselection removes every mode cue.
7. Enter and exit selection while the list is scrolled: the list top, visible height and existing row coordinates must not change, the final row must remain scroll-reachable, and a bottom batch toolbar must not overlap the mode cue.

## Prevention Rule

Do not encode a major interaction mode only through subtle same-hue effects or a small replacement symbol. Name the mode, expose its count, reduce competing visual weight, provide a broad stable selector, preserve the task-state icon, and put selected emphasis on the row/control surface. A transient mode cue in a dense list must be an overlay or occupy permanently reserved geometry; do not insert/remove a normal-flow top row. Preserve ARIA state and give row versus child buttons deterministic keyboard ownership.

## Alternative Route

- Status: `candidate`; awaiting user visual acceptance.
- Preconditions: selection coexists with hover and keyboard focus in a dense list.
- Ordered steps: add a mode-level status cue; expand the selector to the full row-leading region; preserve status identity; de-emphasize nonmembers; compose selected theme gradients and hover/focus/active rules; place the cue as a bottom stage overlay with scroll reserve and batch-toolbar avoidance; isolate row and child-button key handling.
- Verification: test mode entry/count/exit, selected membership toggles, keyboard parity, forced/reduced-motion behavior, contrast on supported themes, list-geometry stability and overlay non-overlap.
- Applicability boundary: applies to explicit selection modes, not transient hover-only highlighting.
- Fallback: if theme tokens cannot maintain adequate contrast, use text and outline structure rather than introducing an undocumented color.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-22 | RAW-057 selection contrast | User reported the reinforced multi-select effect was still not obvious | Same-hue gradient, glow and narrow leading accent | Added mode bar/count, nonmember de-emphasis, thick selected boundary and solid check badge | candidate; user acceptance pending |
| 2026-07-22 | RAW-058 selection/pin/counter fusion | User reported selection was often impossible to trigger and the checked result remained unsatisfactory | Narrow selector plus status-icon replacement; child key events could reach row commands | Expanded the selector to 38px full height, restored the status icon, added theme tri-gradient and isolated row/button key ownership | candidate; focused multi-select tests `3 / 3` pass, visual acceptance pending |
| 2026-07-22 | RAW-064 selection layout correction | User reported that the temporary top mode bar added a row and changed the dense-list layout | Conditional normal-flow top status bar | Moved the cue to a bottom list-stage overlay, reserved scroll space and lifted the bottom batch toolbar | candidate; user visual acceptance pending |

| 2026-08-28 | 逾期 candidate 复核 | validate:error-memory 报告复核窗口过期 | 无——本轮为复核而非再尝试 | 未改动实现 | candidate；2026-08-28 复核：源码与样式实现仍在位，无回归；本轮无法取得验收证据——视觉结论只能由用户给出，运行诊断日志不记录观感。状态维持 candidate，复核窗口顺延。待验收项：多选模式识别度、38px 全高选择区、进出多选时列表几何稳定。 |