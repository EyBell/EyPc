# Window Jump Workbench — Verification Record

## Current Status

`source-complete / user-validation-pending` — implementation includes cache/manual-load/`mainHide`, Quick Jump Escape capture, action-panel retarget, narrowed noise filter, refresh retention, all-desktop/all-display enumeration (macOS CGWindowList + Windows EnumWindows/cloaked), Workbench List multi-select (`Space` + advance), OS-close then confirm-force-terminate (`c-del`/`c-bs`), and shared list-selection helpers across Ports/Favorites/MQTT/Windows. Delivery status: **未校验，待用户验收**.

## Completed Static Evidence

- `public/plugin.json` parses as JSON, contains exactly ten `eypc-window-slot-*` entries, and each slot feature sets `mainHide: true`.
- The runtime-validator source rejects a missing window-jump feature, any missing stable slot label, or a slot without `mainHide`.
- Source-level regression coverage covers state, routing, keybinding (`windows.list.*`, `list.toggleSelection`, `windows.close`), listSelection domain, OS-close→confirm-force action path, platform close/terminate seams, and Runtime suites. Present but deliberately unexecuted.
- RAW-087 follow-up remains: no private shortcut-read bridge; slot configuration still routes through the official uTools settings redirect.

## Required User-owned Validation

- Unit, production-build, and uTools manifest/runtime gates.
- Silent slot jump / missing-target workbench / manual Tab load (no auto-scan).
- macOS: Screen Recording + Accessibility; refresh lists windows from other Spaces and displays; activate/close via AX; force terminate only after confirm.
- Windows: EnumWindows across virtual desktops/displays; cloaked shells absent; `WM_CLOSE` then confirm kill.
- `Space` toggles multi-select and advances; Esc clears selection before closing the action panel; right-click / `c-→` opens single vs multi action surface.
- `c-del` / `c-bs` OS-closes selection/focus; failures prompt force terminate.
- Ports/Favorites/MQTT Space advance matches Workbench List Taste; ports right-click on a selected row opens multi drawer.
- Window list `↑↓` with action panel open keeps list ownership and scrolls the focused row.

## Not Run by Task Authority

No automated test, build, uTools validation, screenshot/browser check, or real OS-window action has been run for this follow-up.
