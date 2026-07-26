# Window Jump Workbench — Handoff

## Delivery State

`source-complete / user-validation-pending` — cache/manual-load/`mainHide`, navigation/filter, all-desktop enumeration, Workbench List multi-select, and OS-close→confirm-force are source-complete. Real host acceptance remains outside this task's authority. Status: **未校验，待用户验收**.

## Delivered Surface

- Domain/state: persistent local aliases/targets, feature defaults, exact title locator matching, ten platform-separated slots, and shared [listSelection.ts](../../../../src/domain/listSelection.ts#L1) helpers in [windows.ts](../../../../src/domain/windows.ts#L1), [state.ts](../../../../src/domain/state.ts#L1), and [types.ts](../../../../src/domain/types.ts#L1).
- Native bridge: Windows EnumWindows/cloaked + `WM_CLOSE`/terminate; macOS `CGWindowList` inventory + System Events AX activate/close; explicit stale/browser fallback in [preload/index.js](../../../../preload/index.js#L1), [public/preload.js](../../../../public/preload.js#L1), and [eypcPlatform.ts](../../../../src/platform/eypcPlatform.ts#L1).
- Runtime/UI: `mainHide` slot features, session cache + manual Tab load, cache-first slot activation, Workbench List multi-select/close panel, and Ports/Favorites right-click multi when the row is already selected — [appRuntime.ts](../../../../src/runtime/appRuntime.ts#L1), [WindowsPage.vue](../../../../src/pages/WindowsPage.vue#L1), [PortsPage.vue](../../../../src/pages/PortsPage.vue#L1), [FavoritesPage.vue](../../../../src/pages/FavoritesPage.vue#L1).
- Regression coverage (written, not run): listSelection, recordListSelection, keybinding (`windows.list.*`, `list.toggleSelection`, `windows.close`), OS-close→confirm-force action path, platform close/terminate, plus prior state/routing suites.

## User Validation Focus

Enable the feature, grant macOS Screen Recording + Accessibility (or Windows host rights), manually load once, then bind a global slot hotkey. Confirm warm-cache jump activates without showing EyPc; missing target opens the workbench. Confirm refresh lists other Spaces/displays. Confirm `Space` multi-select + advance, `c-del`/`c-bs` OS-close→confirm-force, and Ports/Favorites right-click multi when the row is already selected.

## Safety Reminder

Neither the plugin nor this task should attempt to grant macOS accessibility/screen-recording access, alter an application title, or bypass Windows foreground protection. Force terminate runs only after an explicit user confirm.
