---
id: eypc-codex-water-ring-layer-separation
status: candidate
scope: project
fingerprint: codex-water-ring-layer__weekly-data-svg-removed-while-static-surface-rim-remained__semantic-and-decorative-circles-confused__inventory-layer-ownership-before-removal
first_seen: 2026-07-22
last_verified: 2026-07-22
review_after: 2026-08-22
evidence:
  - src/components/CodexWaterBall.vue
  - src/styles/float.css
  - src/domain/codexAppearance.ts
  - src/pages/CodexPage.vue
  - vibe/specs/260718/1148-codex-quota-float/verify.md
tags:
  - codex-companion
  - water-ball
  - progress-ring
  - visual-layering
  - semantic-ui
---

# Separate Data Progress Rings From Decorative Surface Rims

## Symptom

The requested outer-circle cleanup first removed the Weekly SVG progress ring and its controls while a visually ordinary rim remained. After restoring the data ring and deleting the component-local inset, border, inset outline and shell, the user's follow-up screenshot still showed an outermost complete circle.

## Wrong Assumption

Every visible circle near the ball edge was treated as one interchangeable “outer ring”, and the layer inventory stopped inside the water component. Deletion followed selector shape instead of data ownership and omitted the component root, outer shadows and ancestor button interaction state.

## Candidate Root Cause

The rendered control had more than two circular systems: a quota-owned SVG track/value or 20 segments; component-local cosmetic layers from inset geometry, border, inset shadow, shell, root background and same-size outer glow; and a generic host-button `focus-visible` outline outside the component. The first correction did not inventory the full rendered ancestry and interaction states before choosing which layer to remove.

## Evidence

- [CodexWaterBall.vue](../../../src/components/CodexWaterBall.vue#L1) now renders the SVG ring only for a Weekly reading, keeps the root transparent and removes static surface rim and same-size outer-glow layers.
- [float.css](../../../src/styles/float.css#L1) suppresses the generic external circular focus outline only for the water button and moves the keyboard focus cue to the center reading.
- [codexAppearance.ts](../../../src/domain/codexAppearance.ts#L1) supplies only data-ring width/progress/track/glow tokens and their contrast validation; `shellOpacity` no longer affects rendering.
- [CodexPage.vue](../../../src/pages/CodexPage.vue#L1) exposes only the data-ring controls and no ordinary outline-opacity entry.
- [verify.md](../../specs/260718/1148-codex-quota-float/verify.md#L1) retains user-owned acceptance for the four quota-state scenarios.

## Detection Order

1. List every element, pseudo-element, background, border, inset, shadow and ancestor focus/outline state that can draw the apparent circle.
2. Label each layer by source data and product meaning before editing selectors.
3. Confirm which layer changes with quota and which stays static.
4. Trace every visible control to its actual CSS/SVG consumer.
5. Check pointer, keyboard-focus, Weekly-present and Weekly-absent states independently.

## Prevention Rule

Before removing a visually duplicated ring, separate semantic/data layers from decorative surface and host-interaction layers. Audit the component together with its clickable ancestor and every focus/hover state. Preserve the layer that encodes provider data, remove only layers with no state meaning, and replace any removed accessibility cue with a non-conflicting visible cue. A setting may remain visible only when a current renderer consumes it.

## Alternative Route

- Status: `candidate`; static implementation is complete and visual acceptance is pending.
- Preconditions: a component contains multiple concentric SVG/CSS/pseudo-element layers.
- Ordered steps: inventory component and ancestor interaction layers; map each to data/controls/accessibility; retain the data-owned layer; remove decorative root/background/inset/border/shell/shadow/focus-circle layers; replace focus feedback without another circle; verify present/absent data and keyboard states.
- Verification: compare 5-hour + Weekly, Weekly-only, Spark + Weekly and no-Weekly states in ordinary and keyboard-focus conditions; only a data-bearing progress ring may remain.
- Applicability boundary: applies to semantic gauges and progress indicators, not purely ornamental illustrations.
- Fallback: if layer ownership is still ambiguous, keep both unchanged and obtain a rendered-state comparison before deleting either.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-22 | RAW-065 Weekly ring correction | User reported that the wrong circle was removed | Removed Weekly SVG/controls but retained the static surface rim | Restored the Weekly data ring and controls; removed inset, border, inset outline and shell | candidate; user visual acceptance pending |
| 2026-07-22 | RAW-065 outermost-circle follow-up | User screenshot showed a complete outer circle still present after the first correction | Inspected only component-local rim layers and missed root glow/background plus the host button focus outline | Removed the remaining decorative sources and replaced the circular focus outline with a center-reading underline | candidate; refreshed static checks passed, user visual acceptance pending |
