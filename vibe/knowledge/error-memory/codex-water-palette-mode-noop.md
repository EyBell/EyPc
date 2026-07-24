---
id: eypc-codex-water-palette-mode-noop
status: candidate
scope: project
fingerprint: codex-water-palette__selector-modes-share-the-same-liquid-rendering__palette-specific-layer-tokens__each-mode-has-a-visible-material-identity
first_seen: 2026-07-24
last_verified: 2026-07-24
review_after: 2027-01-24
evidence:
  - src/domain/codexAppearance.ts
  - src/components/CodexWaterBall.vue
  - src/pages/CodexPage.vue
tags:
  - codex-companion
  - water-ball
  - palette
  - visual-regression
  - configuration
---

# Keep Water Palette Modes Visibly Distinct

## Symptom

The liquid palette selector exposed “pure color”, “gradient” and “advanced aurora”, but advanced aurora visually collapsed to the same A/B liquid treatment as the simpler options.

## Wrong Assumption

Producing an alternate CSS variable for aurora was assumed to change the production liquid renderer. The component's liquid base and waves continued to consume the same two color variables.

## Candidate Root Cause

The persisted palette enum was not mapped to distinct layer rules in the shared production component. A configuration option existed without a renderer-owned material contract.

## Detection Order

1. Trace each configuration enum through its persisted value, CSS variables and final component selectors.
2. Compare the liquid base, each wave layer, refraction and crest colors across all palette modes.
3. Confirm that the difference remains visible with the same A/B values and does not depend on changing wave amplitude or motion.
4. Preserve reduced-motion behavior and the existing SVG wave paths before accepting a palette-only correction.

## Prevention Rule

Every visible palette option must own at least one distinct production layer rule. For this water ball, pure color uses one liquid tone, gradient uses A→B, and advanced aurora adds derived color-flow, refractive pools and a separate crest; none may alter the wave path, amplitude or motion contract.

## Alternative Route

- Status: `candidate`; static structure is complete, visual acceptance remains user-owned.
- Preconditions: a configurable component offers named palette modes.
- Ordered steps: derive mode-specific tokens from the saved colors; apply them in the shared production component; keep animation selectors unchanged; name the visual distinction in the configuration control.
- Verification: with identical A/B values, switch each palette and confirm a visible single-tone, two-tone and multi-tone outcome in both the page preview and desktop float.
- Applicability boundary: applies to palette modes that claim an aesthetic/material difference; it does not require unrelated status or progress-ring colors to change.
- Fallback: if a mode cannot produce a stable visible difference, remove or rename the option rather than leave a no-op selector.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-24 | Liquid palette refinement | User observed advanced aurora and pure color were visually indistinguishable | Aurora generated an unused gradient while the liquid consumed the generic A/B treatment | Added aurora-specific color-flow, refractive pools and crest tokens in the shared renderer | candidate; visual acceptance pending |
