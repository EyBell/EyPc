# EyPc Port Group UI Optimization Spec

Tool: codex

## Goal

Optimize the port group workbench so groups can be collapsed with configurable `c-w`, organized into one-level folder trees, searched separately from port results with `c-s-f`, operated through command-backed interactions, and recovered through a strict `esc` interaction stack.

## Behavior

- Port group state includes folder ownership and ordering in [src/domain/types.ts](../../../src/domain/types.ts#L1), with normalized persisted state in [src/domain/state.ts](../../../src/domain/state.ts#L1).
- Group folders participate in tree flattening, search, collapse state, drag/drop movement, and union-rule matching through [src/domain/ports.ts](../../../src/domain/ports.ts#L1).
- Shared shortcut codec and command extraction live in [src/domain/shortcuts.ts](../../../src/domain/shortcuts.ts#L1), [src/runtime/keybinding/keybindingRuntime.ts](../../../src/runtime/keybinding/keybindingRuntime.ts#L1), and [src/runtime/keyboardEvent.ts](../../../src/runtime/keyboardEvent.ts#L1). User-facing labels use Ez short-chain style such as `c-w`, `c-f`, `c-s-f`, `cr`, `c-cr`, `esc`, and `↑↓←→`.
- Search histories are partitioned by target in [src/domain/searchHistory.ts](../../../src/domain/searchHistory.ts#L1) and persisted through `searchHistories.ports.processes`, `searchHistories.ports.groups`, and `searchHistories.favorites.files` in [src/domain/state.ts](../../../src/domain/state.ts#L1).
- `c-f` always focuses port-result search in the port page, while `c-s-f` focuses the group search. Search focus selects the target but does not reopen an unchanged history popup; input changes or `s-↑↓` open matching history through [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L1).
- Holding Ctrl/Command reveals shortcut hints for the top tabs and both port search boxes. Search boxes show only the current bindings that still contain `c-`; if the user changes a search command to a non-Ctrl shortcut, the Ctrl-held hint is hidden by [src/pages/PortsPage.vue](../../../src/pages/PortsPage.vue#L1) and [src/components/SearchSuggestBox.vue](../../../src/components/SearchSuggestBox.vue#L1).
- Choosing a highlighted or clicked history candidate keeps the matching search input focused and places the caret after the last character through [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L1) and [src/App.vue](../../../src/App.vue#L1). Directly submitting the current query still blurs search and moves into the filtered list.
- `cr` on a focused group or folder applies only the port-result filter; `c-cr` applies the filter, moves to the result pane, focuses the first matched port, and multi-selects all matched ports through [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L1).
- Group search and pane activation do not auto-highlight the first row. Group tree navigation supports visible-row `↑↓`, `←` collapse or parent movement, and `→` expand or first-child movement through command actions in [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L1).
- Search suggestion UI is shared by port, group, and favorite search in [src/components/SearchSuggestBox.vue](../../../src/components/SearchSuggestBox.vue#L1), with `s-↑↓` candidate movement, `cr` accept, and `del` / `backspace` delete for highlighted history items.
- The group UI is compact by default; hover or focus-within reveals row actions, while Shift preview displays a readonly group editor preview in [src/pages/PortsPage.vue](../../../src/pages/PortsPage.vue#L1) and [src/styles/app.css](../../../src/styles/app.css#L1).

## Constraints

- User-visible mutations remain runtime actions.
- Force kill still verifies PID and port ownership before process mutation.
- Initial scan, pane activation, and group search text changes do not create row focus; first movement, history accept, or group apply creates focus.
