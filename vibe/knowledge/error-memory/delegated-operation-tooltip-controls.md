---
id: eypc-delegated-operation-tooltip-controls
status: verified
scope: project
fingerprint: operation-tooltip-missing-or-wrong__disabled-or-nested-form-control__bubble-only-button-selector-or-parent-closest__eypc-delegated-help
first_seen: 2026-07-13
last_verified: 2026-07-13
review_after: 2026-10-13
evidence:
  - src/components/OperationTooltipLayer.vue
  - tests/ui/operationTooltip.test.ts
tags:
  - accessibility
  - tooltip
  - disabled-controls
  - event-delegation
---

# Delegated Operation Help Must Resolve Disabled And Nested Controls

## Symptom

A disabled action can show no hover help because it does not bubble pointer events. A checkbox nested inside a row with `data-operation-tooltip` can instead inherit the row's “open actions” message, and select/number controls can have no product Tooltip at all.

## Wrong Assumption

Bubble-phase hover plus a button-only selector was assumed to cover all operations. `closest()` was also assumed to find the intended control even when the control type was absent from the selector.

## Verified Root Cause

Disabled native controls do not reliably emit bubbling pointer events. When form controls are omitted from the delegated target selector, resolution climbs to the nearest actionable ancestor; when they are included but have no direct text, an associated label must supply the accessible name.

## Evidence

- Delegated selector, captured pointer handling and label resolution: [OperationTooltipLayer.vue](../../../src/components/OperationTooltipLayer.vue#L1).
- Disabled hover, nested checkbox and select regressions: [operationTooltip.test.ts](../../../tests/ui/operationTooltip.test.ts#L1).
- Task verification: [verify.md](../../specs/260713/0834-cross-tab-responsive-command-panels/verify.md#L1).

## Correct Detection Order

1. Test focus and pointer hover separately on an enabled button.
2. Repeat on a disabled button and inspect the disabled reason.
3. Focus a checkbox inside a row that has its own context-menu Tooltip; confirm the checkbox label wins.
4. Check select and numeric operation controls for direct or associated labels.
5. Confirm Quick Jump suppresses the normal Tooltip layer.

## Prevention Rule

Listen for pointer movement in capture phase and resolve the hit element with `document.elementFromPoint`. Include operation-form controls plus actionable option/tree/draggable rows in the selector, prefer direct `data-*`/ARIA/native/associated-label text before ancestor content, and keep one Tooltip owner.

## Latest Applicable Implementation

[OperationTooltipLayer.vue](../../../src/components/OperationTooltipLayer.vue#L1) is mounted once by [App.vue](../../../src/App.vue#L1); operation components provide `aria-label`, descriptions, shortcuts and disabled reasons as needed.

## Alternative Route

- Status: `verified`.
- Preconditions: product help is delegated instead of rendering one Tooltip instance per control.
- Steps: capture pointer coordinates, resolve the nearest supported control, derive its own accessible name, attach `aria-describedby`, clamp the single overlay, and restore prior title/description state on close.
- Verification: component regressions, disabled-control browser focus/hover smoke, full tests and build pass.
- Applicability boundary: EyPc operation controls; ordinary text-entry fields remain outside product-help targeting unless explicitly annotated.
- Fallback: annotate a non-standard operation with `data-operation-tooltip` and a precise accessible name.

## Occurrence History

| Date | Task | Trigger | Failed Route | Evidence | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-07-13 | Cross-tab responsive command panels | Universal operation-help audit | Bubble-only disabled hover and parent-row fallback for form controls | Closeout review, component and browser checks | Captured delegation plus control-local label resolution | verified |
| 2026-07-13 | Cross-tab final acceptance review | MQTT/Favorites actionable row coverage | Button/form-only delegated selector | Reviewer source audit and MQTT row browser focus | Add option/treeitem/draggable targets and row-specific descriptions | verified |
| 2026-07-30 | MQTT tooltip follow-up | Title-only MQTT icons lost product tips | Relied on suppressed native title / Ctrl-gated hints | User report after title polish | See [operation-tooltip-title-only-missing-product-attrs.md](operation-tooltip-title-only-missing-product-attrs.md#L1) | routed to sibling record |
