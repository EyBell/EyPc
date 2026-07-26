---
id: eypc-window-list-focus-steal-on-actions-open
status: candidate
scope: project
fingerprint: window-actions-open__arrow-up-down-dead__windowFocusRequestId-steals-button-focus__list-scroll-lost
first_seen: 2026-07-26
last_verified: 2026-07-26
review_after: 2026-10-26
evidence:
  - src/App.vue
  - src/runtime/appRuntime.ts
  - src/runtime/keybinding/keybindingRuntime.ts
  - tests/runtime/action.test.ts
  - tests/runtime/keybinding.test.ts
tags:
  - windows
  - keybinding
  - focus
  - action-panel
---

# Window List Navigation Must Not Share Focus Request With Action-Panel Open

## Symptom

With the windows right-action panel open, `↑↓` often feels dead or jumps focus without scrolling the list. Clicking a row then pressing arrows is similarly unreliable.

## Wrong Assumption

One `windowFocusRequestId` can both (a) scroll/focus the list after list moves and (b) focus the first action-panel button after opening the panel. Global `list.up`/`list.down` gated on `!windowActionsOpen` is enough once that gate is relaxed.

## Verified Root Cause

`moveInList` increments `windowFocusRequestId` on every list move. The App watch treated `windowActionsOpen` as “always focus the first enabled action button and return”, so each arrow yanking focus off the list and never scrolling the active row. Row click via `focusWindow` also did not request list focus.

## Evidence

- User report that arrows still fail in various states after the `!windowActionsOpen` relaxation.
- Split signals: list ownership uses `windowFocusRequestId`; panel open uses `windowActionsFocusRequestId`.
- Dedicated `windows.list.up` / `windows.list.down` on the `windows` layer (weight 220) win over global list movement while the panel is open.

## Correct Detection Order

1. Open windows Tab, load list, open action panel (`→` or right-click).
2. Press `↑↓` and confirm the list selection moves, the panel retargets, and the focused row scrolls into view.
3. Click another row, then press arrows again without clicking the search box.

## Prevention Rule

Never use the list-navigation focus request to focus the action panel. Opening the panel bumps a dedicated actions-focus request; list moves and row focus bump only the list-focus request. Keep window-tab arrow commands on the `windows` layer so they remain valid while `window-actions` is active.

## Alternative Route

- Status: `candidate`
- Preconditions: windows workbench with a loaded list and open action panel.
- Steps: split focus request IDs; add `windows.list.*` bindings; click-to-focus list via `focusWindow`.
- Verification: keybinding + action contracts; user-owned host arrows.
- Applicability boundary: windows Tab only; other tabs keep global `list.up`/`list.down`.
- Fallback: close the action panel with `←` / `Escape`, then navigate the list.
