---
id: eypc-quick-favorites-stale-target
status: verified
scope: project
fingerprint: quick-favorite-command-hits-old-item__management-selection-or-drawer-survives-entry__route-only-tab-switch__eypc-quick-favorites
first_seen: 2026-07-11
last_verified: 2026-07-11
review_after: 2026-10-11
evidence:
  - tests/runtime/action.test.ts
  - src/runtime/appRuntime.ts
tags:
  - favorites
  - quick-entry
  - stale-state
  - focus
---

# Quick Favorites Must Start With Clean Transient Targets

## Symptom

Entering Quick Favorites after using the management page can leave an old multi-selection, drawer target, directory row, request, or edit layer active. A subsequent open/copy shortcut can act on that stale target instead of the first visible Quick result.

## Wrong Assumption

Switching the visible tab and search surface was treated as sufficient isolation even though target resolution also reads Runtime selection, drawer, pane, directory, and editor state.

## Verified Root Cause

Quick and management pages share one Runtime. Without an explicit transition reset, hidden management state remains eligible in the target-priority chain.

## Evidence

- Quick transition and target resolver: [appRuntime.ts](../../../src/runtime/appRuntime.ts#L1).
- Stale target, in-flight directory, explicit target, and Escape regressions: [action.test.ts](../../../tests/runtime/action.test.ts#L1).
- Task verification: [verify.md](../../specs/260711/1452-file-favorites-workbench/verify.md#L1).

## Correct Detection Order

1. Reproduce from a populated management selection or open drawer.
2. Enter through the actual `eypc-favorites-quick` route.
3. Inspect Runtime state, not only DOM visibility or active tab.
4. Confirm the Quick grid owns focus and `aria-activedescendant` points to the first visible result.

## Prevention Rule

`setFavoriteQuickMode(true)` must invalidate directory requests and clear every hidden management target before normalizing the first visible Quick focus. New transient favorite state must be added to the same reset contract.

## Latest Applicable Implementation

The canonical transition and priority resolver are in [appRuntime.ts](../../../src/runtime/appRuntime.ts#L1); route focus handoff is in [App.vue](../../../src/App.vue#L1).

## Alternative Route

- Status: `verified`.
- Preconditions: management and Quick surfaces share a Runtime instance.
- Steps: clear selections/drawer/directory/edit state, invalidate old requests, set `items` pane, normalize visible focus, then focus the Quick grid after render.
- Verification: Runtime regression, component behavior tests, and live Quick 420px browser smoke pass.
- Applicability boundary: EyPc Quick Favorites entry only; ordinary full-page tab restoration keeps its documented state.
- Fallback: if no visible result exists, keep focus on the empty Quick grid and expose the empty/no-match status.

## Occurrence History

| Date | Task | Trigger | Failed Route | Evidence | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-07-11 | File favorites workbench | RED stale-target entry | Route changed view without clearing Runtime transients | Runtime and live browser evidence | Atomic Quick transition reset | verified |
