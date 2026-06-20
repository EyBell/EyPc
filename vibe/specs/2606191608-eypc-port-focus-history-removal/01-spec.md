# Port Focus And History Removal Spec

Tool: codex

## Goal

Remove the search-history interaction surface while keeping port-page search fields action-aware and preserving one clear logical focus target.

## Requirements

- [SearchSuggestBox.vue](../../../src/components/SearchSuggestBox.vue#L1) remains a plain controlled search input with status/error and optional shortcut hint only; it no longer renders inline history, a history dropdown, or history delete controls.
- [keybindingRuntime.ts](../../../src/runtime/keybinding/keybindingRuntime.ts#L1) no longer defines a `search-history` layer or `search.history.*` commands. Group-search input focus still allows group-pane actions: `Enter`, `Shift+Enter`, `F2`, `Shift+F2`, `Delete`, `Backspace`, `Ctrl+Delete`, `Ctrl+Backspace`, `Ctrl+Enter`, `Ctrl+ArrowLeft`, and `Ctrl+ArrowRight`.
- [appRuntime.ts](../../../src/runtime/appRuntime.ts#L1) no longer records or accepts search history from search interactions. Legacy `searchHistories`, `portSearchHistory`, and `favoriteSearchHistory` state remains compatible through normalization but is inert in UI/runtime behavior.
- [appRuntime.ts](../../../src/runtime/appRuntime.ts#L1) clears stale port and group row highlights when `ports.search.focus`, `ports.groupSearch.focus`, or the global `search.focus` route moves logical focus into a port search input. `ArrowUp` / `ArrowDown` and search filtering can then establish a fresh focused row.
- [appRuntime.ts](../../../src/runtime/appRuntime.ts#L1) keeps port-result and port-group row focus mutually exclusive. Moving focus into result rows clears `focusedPortGroupTarget`; moving focus into group rows clears `focusedPortId`.
- [PortsPage.vue](../../../src/pages/PortsPage.vue#L1) renders group row `focused` / `selected` highlight only while the group pane owns logical focus, so a filtered group is not painted as a second movable focus while result rows are active.
- [PortsPage.vue](../../../src/pages/PortsPage.vue#L1) keeps Shift preview, but only when the group pane is the active logical focus area, the side panel is open, a focused group exists, and no editor/confirm/drawer/detail layer is active. Preview uses `focusedPortGroupTarget`, not `selectedPortGroupTarget`.

## Non-Goals

- Do not remove the persisted legacy search-history fields from [types.ts](../../../src/domain/types.ts#L88) or state normalization.
- Do not change process scan, kill verification, group/folder deletion safety, or feature-tab maintenance behavior.
