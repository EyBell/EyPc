---
id: eypc-codex-expanded-card-theme-token-divergence
status: candidate
scope: project
fingerprint: codex-expanded-card__compact-theme-resolver-hides-panel-tokens__persisted-expanded-card-token-object-shared-by-preview-and-runtime__large-card-controls-remain-one-to-one
first_seen: 2026-07-24
last_verified: 2026-07-24
review_after: 2027-01-24
evidence:
  - src/domain/codex.ts
  - src/domain/codexAppearance.ts
  - src/runtime/codexController.ts
  - src/pages/CodexPage.vue
  - src/FloatApp.vue
  - vibe/specs/260718/1148-codex-quota-float/verify.md
tags:
  - codex-companion
  - expanded-card
  - theme
  - configuration
  - visual-regression
---

# Keep Expanded-Card Theme Tokens Separate From Compact Skins

## Symptom

The settings page showed a compact-card-derived preview and only two broad controls while the real expanded float remained themed by the current compact water/card style. The default theme's larger panel layers therefore had no visible, editable representation.

## Wrong Assumption

Card surface and foreground were treated as sufficient configuration for the expanded panel, and resolving the active compact style was assumed to style the expanded float correctly.

## Candidate Root Cause

The compact and expanded surfaces shared a generic style resolver. That hid the actual expanded-panel layers—raised regions, border, secondary text, selection, focus and task-state tones—and let a water compact style override the intended large-card theme at runtime.

## Evidence

- [codex.ts](../../../src/domain/codex.ts#L1) persists `expandedCardAppearance` in settings and saved themes with all nine panel tokens.
- [codexAppearance.ts](../../../src/domain/codexAppearance.ts#L1) gives built-in themes the same object and resolves it without validation or rollback.
- [codexController.ts](../../../src/runtime/codexController.ts#L1) forwards the object into the float snapshot.
- [CodexPage.vue](../../../src/pages/CodexPage.vue#L1) groups and labels every token in the same large-card preview.
- [FloatApp.vue](../../../src/FloatApp.vue#L1) selects that resolver only after expansion, independently of the compact water/card style.

## Detection Order

1. Identify whether the user means the compact surface or the post-expansion panel.
2. Enumerate every CSS token consumed by the actual expanded panel, including nested layers, text hierarchy, interaction and task states.
3. Verify the preview, settings persistence, theme presets, saved themes, Controller snapshot and expanded renderer share one token object.
4. Check that changing compact water/card style cannot change the expanded panel unless the expanded-card configuration itself changes.
5. Ask for visual acceptance only after each named control has a concrete panel target.

## Prevention Rule

When an expanded surface is materially more complex than its compact trigger, model it as its own persisted theme object. A configuration preview must be rendered from the same resolver as the expanded runtime and must expose every independently consumed visual token by a label that names the affected region.

## Alternative Route

- Status: `candidate`; source path is complete, but visual acceptance remains user-owned.
- Preconditions: a compact trigger expands into a distinct multi-region panel.
- Ordered steps: inventory runtime CSS tokens; define one direct persisted object; include it in built-in and saved themes; carry it through the runtime snapshot; resolve preview and expanded runtime from it; keep compact tokens isolated.
- Verification: change each token in an expanded float while the compact style is water, then repeat after saving/reapplying a theme; only the named large-card region should change and all values should remain after reopening settings.
- Applicability boundary: applies to configurable compact-to-expanded UI pairs with different visual structures; it does not require a separate theme for a compact surface that is merely resized without new layers.
- Fallback: if the existing resolver cannot accept a dedicated object, leave the compact rendering unchanged and introduce an explicit expanded resolver before exposing controls.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-24 | RAW-075 expanded-card target | User screenshot showed the old compact-card appearance in the configuration page | Replaced only the illustrative preview and retained compact-derived surface/foreground tokens | Drew an expanded-card preview and labeled the target | candidate; the renderer link was still incomplete |
| 2026-07-24 | RAW-076 large-card theme depth | User clarified that the default large-card theme has more configuration than the two visible controls | Kept the actual float on its compact-style resolver | Added nine persistent theme tokens, theme preset/save support, Controller forwarding and one expanded resolver | candidate; visual acceptance pending |
