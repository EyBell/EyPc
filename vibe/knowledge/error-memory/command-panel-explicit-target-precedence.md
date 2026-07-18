---
id: eypc-command-panel-explicit-target-precedence
status: verified
scope: project
fingerprint: context-panel-opens-wrong-item__explicit-target-loses-to-frozen-panel__infer-after-open-or-shape-only-validation__eypc-runtime-panels
first_seen: 2026-07-13
last_verified: 2026-07-13
review_after: 2026-10-13
evidence:
  - src/runtime/appRuntime.ts
  - tests/runtime/action.test.ts
  - tests/runtime/keybinding.test.ts
tags:
  - runtime
  - target-resolution
  - context-panel
  - stale-state
---

# Explicit Context-Panel Targets Must Replace Frozen Targets

## Symptom

With a detail/action panel already open for item A, invoking a row button or context menu for item B can keep A as the frozen target. A syntactically valid but missing explicit ID can also fall through to the old panel or current focus, so the visible command appears to act on the wrong item.

## Wrong Assumption

An already-open panel was treated as the strongest source of truth, and explicit target parsing checked only argument shape rather than confirming that the entity still existed.

## Verified Root Cause

Panel inference could consult frozen state before applying action arguments, while some open helpers mutated focus/selection first and inferred later. MQTT argument parsing also accepted kind/id pairs without validating the matching record, connection, subscription, history row or group.

## Evidence

- Target resolution and panel open actions: [appRuntime.ts](../../../src/runtime/appRuntime.ts#L1).
- Ports, Favorites and MQTT replacement/missing-target regressions: [action.test.ts](../../../tests/runtime/action.test.ts#L1).
- Atomic left/right switching: [keybinding.test.ts](../../../tests/runtime/keybinding.test.ts#L1).
- Task verification: [verify.md](../../specs/260713/0834-cross-tab-responsive-command-panels/verify.md#L1).

## Correct Detection Order

1. Open a panel for target A.
2. Dispatch the same or opposite panel action with an explicit target B without first closing A.
3. Inspect Runtime frozen target IDs and projected panel content.
4. Repeat with a missing explicit ID and confirm the action fails without fallback.
5. Only then verify focus/visible-selection fallback when no explicit target exists.

## Prevention Rule

Resolve panel targets in `explicit args → open frozen target → current pane focus → visible selection` order. If explicit arguments are present, validate entity existence and applicability before any focus/selection mutation; invalid explicit targets return failure and never fall through.

## Latest Applicable Implementation

[appRuntime.ts](../../../src/runtime/appRuntime.ts#L1) owns the target resolvers and panel actions. Page components dispatch explicit IDs from row buttons and context menus without mutating selection first.

## Alternative Route

- Status: `verified`.
- Preconditions: a command may be reached from keyboard, row button or context menu while another target panel is open.
- Steps: parse explicit args, validate against the current Runtime projection, freeze that target, then project detail/actions and focus the rendered panel.
- Verification: Runtime target replacement/missing-entity tests, keybinding side-switch tests, full project tests and browser focus checks pass.
- Applicability boundary: EyPc Ports, Favorites and MQTT context panels; Settings command rows use component-local selected-command validation.
- Fallback: with no explicit args, keep the documented frozen/focus/visible-selection chain.

## Occurrence History

| Date | Task | Trigger | Failed Route | Evidence | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-07-13 | Cross-tab responsive command panels | Open panel for B while A is already frozen | Infer from open panel before explicit args; MQTT shape-only validation | Read-only audit and Runtime RED regressions | Explicit-first validated resolvers | verified |
