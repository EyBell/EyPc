---
id: eypc-operation-tooltip-title-only-missing-product-attrs
status: verified
scope: project
fingerprint: operation-tooltip-missing__native-title-or-ctrl-gated-hint-only__layer-strips-title-without-data-operation-attrs
first_seen: 2026-07-30
last_verified: 2026-07-30
review_after: 2026-10-30
evidence:
  - src/components/OperationTooltipLayer.vue
  - src/pages/MqttPage.vue
  - tests/ui/operationTooltip.test.ts
  - vibe/specs/260730/1044-mqtt-tooltip-shortcut-polish/verify.md
  - vibe/specs/260730/2050-global-operation-tooltip-polish/spec.md
tags:
  - accessibility
  - tooltip
  - mqtt
  - cross-page
  - operation-help
  - shortcut-hint
---

# Product Tooltip Needs Explicit Operation Attributes

## Symptom

MQTT icon buttons looked unlabeled on hover after an “add titles” polish. Users saw no product tip, or only a bare aria name without the expected shortcut kbd.

## Wrong Assumption

Native `title` / `commandTitle(...)` was assumed to be the product hover tip. `data-mqtt-shortcut-hint` was also assumed to feed the Tooltip shortcut always, even though that attribute is written only while Ctrl-hint mode is active.

## Verified Root Cause

[OperationTooltipLayer.vue](../../../src/components/OperationTooltipLayer.vue#L1) suppresses native `title` into `data-operation-native-title` and renders one product overlay. Without `data-operation-tooltip` / always-on `data-operation-shortcut`, hover falls back to `aria-label` alone and loses the shortcut unless a Ctrl-gated hint attribute is present. Codex-style buttons already used explicit `data-operation-*`; MQTT did not.

## Evidence

- Title suppression and shortcut resolution: [OperationTooltipLayer.vue](../../../src/components/OperationTooltipLayer.vue#L1).
- MQTT helpers `commandTooltip` / `plainTooltip` bind product attrs: [MqttPage.vue](../../../src/pages/MqttPage.vue#L1).
- Regression for suppressed-title shortcut parsing: [operationTooltip.test.ts](../../../tests/ui/operationTooltip.test.ts#L1).
- Task verify remains user-owned after reload: [verify.md](../../specs/260730/1044-mqtt-tooltip-shortcut-polish/verify.md#L1).

## Detection Order

1. Hover an icon button with the product Tooltip layer mounted; confirm whether a bubble appears within ~100ms.
2. Inspect the control for `data-operation-tooltip` and `data-operation-shortcut` (not only `title` / `aria-label`).
3. Confirm `data-mqtt-shortcut-hint` is absent unless Ctrl-hint mode is on.
4. Check that the layer is not suspended by Quick Jump.
5. After a title-only fix, re-verify hover rather than trusting source strings containing `title=`.

## Prevention Rule

For EyPc operation icons, set `data-operation-tooltip` and an always-on `data-operation-shortcut` (or an equivalent helper such as MQTT `commandTooltip` / `plainTooltip`) in the same change as the control. Treat native `title` as accessibility fallback only; never gate product-tip shortcuts behind Ctrl-hint attributes. Prefer explicit `data-operation-*` over relying on suppressed titles, and do not add a page-owned pseudo-tooltip inside `.app-shell` where the shared layer already owns presentation.

## Alternative Route

- Status: `verified`.
- Preconditions: a control is covered by `OperationTooltipLayer` and currently uses only `title` / Ctrl-gated hints.
- Ordered steps: add product tooltip/shortcut attrs; keep `aria-label`; leave `title` optional; add a component regression when shortcut parsing changes; ask the user to reload and hover-accept.
- Verification: focus/hover shows label + shortcut kbd; `tests/ui/operationTooltip.test.ts` passes; MQTT page contracts mention `commandTooltip` / `plainTooltip`.
- Applicability boundary: product operation controls inside `.app-shell`; ordinary non-operation text is out of scope.
- Fallback: if a control must stay title-only, document that the layer will strip it and ensure `aria-label` alone is an acceptable tip.

## Occurrence History

| Date | Task | Trigger | Failed Route | Evidence | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-07-30 | MQTT tooltip/shortcut polish follow-up | User: “还是没有悬浮的提示信息” | MQTT buttons used `commandTitle`/`title` plus Ctrl-gated `data-mqtt-shortcut-hint` | Live hover after title-only polish | `commandTooltip`/`plainTooltip` + always-on `data-operation-shortcut`; title chord parse fallback | verified; user reload acceptance pending |
| 2026-07-30 | Global operation-tooltip expansion | User requested verification/optimization across every page | MQTT-local coverage and a competing Codex main-page pseudo-tip did not guarantee one cross-page presentation owner | Static inventory of 271 native buttons and shared selectors/styles | Shared fallback normalization, active metadata refresh, main Codex pseudo-tip suppression and Float boundary | implemented; user runtime acceptance pending |
