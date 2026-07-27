---
id: eypc-codex-water-preview-renderer-divergence
status: candidate
scope: project
fingerprint: codex-water-preview__separate-or-simplified-renderer-diverges-from-desktop-ball__shared-component-with-preserved-layered-motion__configuration-preview-and-float-remain-identical
first_seen: 2026-07-24
last_verified: 2026-07-26
review_after: 2027-01-26
evidence:
  - src/components/CodexWaterBall.vue
  - src/pages/CodexPage.vue
  - src/FloatApp.vue
  - src/styles/float.css
  - src/styles/codex.css
  - src/domain/codexAppearance.ts
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

The configuration preview and the desktop water ball presented different color/layer outcomes. Replacing the preview mismatch with a simplified static liquid composition then introduced a flat lower liquid region and removed the established wave, refraction and high-light character.

## Wrong Assumption

A separate illustrated preview, or a simpler shared renderer, was treated as equivalent to the existing interactive water ball. Matching palette controls alone was assumed to prove visual parity.

## Candidate Root Cause

Two rendering paths owned overlapping water-ball semantics. The page preview had its own ring/liquid drawing, while the subsequent shared-path correction rewrote rather than reused the established SVG wave paths and motion tokens. This made a configuration correction alter the component's visual language and introduced a non-wave lower layer.

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

## Prevention Rule

When a configuration preview represents a live visual component, reuse the production component and its data projection. Do not substitute an illustrative preview or simplify an established wave renderer while correcting a color/configuration mismatch. A new control must name the exact layer it changes and preserve unrelated semantic data and interaction overlays. Compact counter overlays outside the shared ball must keep the same corner geometry as the desktop float whenever that geometry changes.

## Alternative Route

- Status: `candidate`; static structure is complete, visual acceptance remains user-owned.
- Preconditions: a configurable component has both a settings preview and a desktop/runtime presentation.
- Ordered steps: reuse the production component; pass the persisted appearance and projected data; keep the original layer order and motion tokens; add only a narrowly scoped CSS variable for the requested layer; retain separate interactive counter controls outside the decorative preview and mirror their desktop corner positions.
- Verification: inspect normal, transparent-base and reduced-motion states with and without Weekly data; preview and desktop must show the same ball layers, the same counter corners and no flat rectangular liquid artifact.
- Applicability boundary: applies to visual components whose configuration preview claims runtime fidelity; it does not require every static form sample to mount production interaction handlers.
- Fallback: if a preview cannot mount the production component, keep the existing production renderer unchanged and obtain a rendered comparison before editing its visual layers.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-24 | RAW-072/073 water preview parity | Screenshot showed configuration and desktop water balls differed | Separate page illustration and desktop rendering evolved independently | Mounted the shared production component in the preview and carried the same appearance/data values | candidate; visual acceptance pending |
| 2026-07-24 | RAW-074 layered-water restoration | Screenshot feedback rejected the static replacement and identified a lower rectangular layer | Shared component was simplified instead of retaining established wave layers | Restored existing SVG waves, refraction, high-light and timing tokens; kept base opacity as an independent layer | candidate; static checks pass, visual acceptance pending |
| 2026-07-26 | RAW-083 counter geometry follow-up | User reported configuration water preview no longer matched the real float after lower-corner counter move | Preview CSS and control captions stayed on the old upper-corner layout while float.css adopted lower-left/lower-right | Aligned `.water-preview-counter*` to float corner geometry and updated CodexPage counter captions | candidate; static source fix, visual acceptance pending |
