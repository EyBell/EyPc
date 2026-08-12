---
id: eypc-codex-water-preview-renderer-divergence
status: candidate
scope: project
fingerprint: codex-water-preview__separate-or-simplified-renderer-diverges-from-desktop-ball__shared-component-with-preserved-layered-motion__configuration-preview-and-float-remain-identical
first_seen: 2026-07-24
last_verified: 2026-08-12
review_after: 2027-01-26
evidence:
  - src/components/CodexWaterBall.vue
  - src/pages/CodexPage.vue
  - src/FloatApp.vue
  - src/styles/float.css
  - src/styles/codex.css
  - src/domain/codexAppearance.ts
  - tests/ui/codexCompanion.test.ts
  - vibe/specs/260718/1148-codex-quota-float/verify.md
tags:
  - codex-companion
  - water-ball
  - preview
  - shared-renderer
  - visual-regression
---

# Keep Water Preview And Desktop Renderer On One Layered Component

## Symptom

The configuration preview and the desktop water ball presented different color/layer outcomes. Replacing the preview mismatch with a simplified static liquid composition then introduced a flat lower liquid region and removed the established wave, refraction and high-light character. A later unrelated runtime-diagnostics change widened the real Float single-digit counter from `20px` to `26px` and added monospace/tabular numerals while the settings preview stayed at `20px`, producing a pill and another preview/runtime divergence without a product requirement.

## Wrong Assumption

A separate illustrated preview, or a simpler shared renderer, was treated as equivalent to the existing interactive water ball. Matching palette controls alone was assumed to prove visual parity. Counter typography/width was also treated as harmless diagnostics polish even though geometry and preview parity were explicitly retained by RAW-067.

## Candidate Root Cause

Two rendering paths owned overlapping water-ball semantics. The page preview had its own ring/liquid drawing, while the subsequent shared-path correction rewrote rather than reused the established SVG wave paths and motion tokens. Counter geometry then drifted because `.float-counter` and `.water-preview-counter` had no regression asserting the same height/min-width/padding/radius contract. This let a non-UI change alter the component's visual language and compact shape.

## Evidence

- [CodexWaterBall.vue](../../../src/components/CodexWaterBall.vue#L1) now owns the SVG wave paths, refraction, high-light, data-driven Weekly ring and base-only opacity layer.
- [CodexPage.vue](../../../src/pages/CodexPage.vue#L1) mounts that component for the live configuration preview and labels each directly controlled layer.
- [FloatApp.vue](../../../src/FloatApp.vue#L1) mounts the same component for the desktop ball.
- [codexAppearance.ts](../../../src/domain/codexAppearance.ts#L1) retains the existing `static / slow / normal / fast` wave-duration tokens and adds no alternate animation system.

## Detection Order

1. Identify the visual authority and enumerate every component, pseudo-element and overlay used by both preview and desktop contexts.
2. Verify that preview and desktop mount the same component and feed it the same normalized appearance, colors and quota projection.
3. Compare the component's water paths, motion tokens, refraction and high-light layers before changing any preview composition.
4. Change only the requested layer, such as base opacity, then confirm liquid, ring, reading and counters remain independent.
5. Inspect a rendered water level for flat lower rectangles before accepting a visual cleanup.
6. Compare `.float-counter` and `.water-preview-counter` geometry as one contract：single digit `20×20`、multi-digit natural width、same padding/radius、no unrequested monospace/tabular setting。

## Prevention Rule

When a configuration preview represents a live visual component, reuse the production component and its data projection. Do not substitute an illustrative preview or simplify an established wave renderer while correcting a color/configuration mismatch. A new control must name the exact layer it changes and preserve unrelated semantic data and interaction overlays. Compact counter overlays outside the shared ball must share the desktop Float contract：`20px` height、`20px` single-digit minimum、`0 5px` padding、fully rounded corners；two digits and `99+` expand naturally。Do not add monospace/tabular numerals or change geometry in an unrelated task without an explicit requirement and both-context regression.

## Alternative Route

- Status: `candidate`; structure and counter geometry automation pass, rebuilt-host visual acceptance remains user-owned.
- Preconditions: a configurable component has both a settings preview and a desktop/runtime presentation.
- Ordered steps: reuse the production component; pass the persisted appearance and projected data; keep the original layer order and motion tokens; add only a narrowly scoped CSS variable for the requested layer; retain separate interactive counter controls outside the decorative preview and mirror their desktop corner positions.
- Verification: inspect normal, transparent-base and reduced-motion states with and without Weekly data；automated CSS contract must assert preview/Float `20px` height/min-width/padding/radius and absence of monospace/tabular numerals；real host must visually confirm 1、10 and `99+`。
- Applicability boundary: applies to visual components whose configuration preview claims runtime fidelity; it does not require every static form sample to mount production interaction handlers.
- Fallback: if a preview cannot mount the production component, keep the existing production renderer unchanged and obtain a rendered comparison before editing its visual layers.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-24 | RAW-072/073 water preview parity | Screenshot showed configuration and desktop water balls differed | Separate page illustration and desktop rendering evolved independently | Mounted the shared production component in the preview and carried the same appearance/data values | candidate; visual acceptance pending |
| 2026-07-24 | RAW-074 layered-water restoration | Screenshot feedback rejected the static replacement and identified a lower rectangular layer | Shared component was simplified instead of retaining established wave layers | Restored existing SVG waves, refraction, high-light and timing tokens; kept base opacity as an independent layer | candidate; static checks pass, visual acceptance pending |
| 2026-07-26 | RAW-083 counter geometry follow-up | User reported configuration water preview no longer matched the real float after lower-corner counter move | Preview CSS and control captions stayed on the old upper-corner layout while float.css adopted lower-left/lower-right | Aligned `.water-preview-counter*` to float corner geometry and updated CodexPage counter captions | candidate; static source fix, visual acceptance pending |
| 2026-08-12 | RAW-160 counter shape regression | User reported a single-digit badge had become a rectangular pill | Unrelated diagnostics commit changed Float min-width `20→26` and added monospace/tabular numerals while preview retained `20` | Restore Float `20×20`, natural multi-digit expansion, remove typography additions and add a shared preview/Float geometry regression | shared CSS contract + latest affected 545/545 + full 1305/1305 + build pass；`host-719360…` visual acceptance pending |
