---
id: eypc-window-slot-binding-hint-clips-full-height-list
status: candidate
scope: project
fingerprint: window-slot-binding-hint-in-normal-flow__window-list-keeps-100-percent-height__clipped-scroll-end
first_seen: 2026-08-08
last_verified: 2026-08-08
review_after: 2026-11-08
evidence:
  - src/pages/WindowsPage.vue
  - src/styles/app.css
  - tests/ui/windowsDiagnostics.test.ts
tags:
  - windows
  - ui
  - layout
  - scrolling
  - slots
---

# A Transient Sibling Must Reduce the Window List's Scroll Height

## Symptom

After entering slot-binding mode, the inline instruction bar appears above the window list, but the last window rows are clipped and cannot be fully reached by scrolling.

## Wrong Assumption

A scroll child with `height: 100%` remains valid after another normal-flow child is inserted into the same bounded panel.

## Confirmed Root Cause

The [binding hint and ARIA tree are siblings](../../../src/pages/WindowsPage.vue#L650). The hint consumed its own height while the list still requested the panel's full height; their combined height exceeded the workbench and the workbench's clipping hid the list tail. Presence and dispatch tests did not exercise the height-allocation contract.

## Correct Detection Order

1. Reproduce with more window rows than fit in one screen and enter slot-binding mode.
2. Identify the bounded parent, every normal-flow sibling and the single intended scroll owner.
3. Check whether the scroll owner requests the parent's full height instead of the remaining height.
4. Add a regression that is proven red while `height: 100%` remains.

## Prevention Rule

Use a `min-height: 0` column Flex panel for a bounded list plus transient bars. Give the transient bar intrinsic fixed allocation and make the list the only `flex: 1 1 0` scroller with `height: auto`; do not guess the bar height with a fixed value or `calc()`. The [layout rule](../../../src/styles/app.css#L7615) and [red-capable regression](../../../tests/ui/windowsDiagnostics.test.ts#L586) jointly forbid restoring the full-height child.

## Alternative Route

- Status: `candidate` until the real uTools host acceptance below passes.
- Preconditions: Window Jump contains more rows than fit in the visible workbench and an unassigned slot can enter binding mode.
- Steps: enter binding mode, scroll to the final row, click it, then enter binding mode again and cancel with `Escape`.
- Verification: the final row is fully visible and clickable; after `Escape`, the hint disappears and the list regains the whole panel height.
- Applicability boundary: bounded panels where a transient normal-flow sibling shares height with one scroll owner; it does not apply to overlays that are removed from document flow.
- Fallback: if host layout still differs, inspect the actual workbench height chain and computed styles before changing constants or component structure.
