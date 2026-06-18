# Port Compact Help And Group Delete Spec

## Goal

Compact the port page layout, move shortcut hints out of the fixed footer, and make highlighted search/group targets actionable without extra focus steps.

## Requirements

- [src/App.vue](../../../src/App.vue#L1) no longer renders the bottom fixed command-hint footer.
- [src/components/TabShell.vue](../../../src/components/TabShell.vue#L1) owns a top-right `?` help trigger that shows [src/components/CommandHints.vue](../../../src/components/CommandHints.vue#L1) on hover/focus.
- [src/components/SearchSuggestBox.vue](../../../src/components/SearchSuggestBox.vue#L1) renders history inline as ghost text after the current query with about `2ch` spacing, while preserving `Tab`, `Shift+↑/↓`, click, and `←/→` history behavior.
- Search-input `Enter` remains reserved for history dropdown/cache acceptance. It must not confirm the currently highlighted port/group/folder or clear/exit search when the history dropdown is closed.
- [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L1) supports confirmed and forced deletion for focused group/folder targets; folder deletion cascades child groups and clears related filter/detail/drawer/focus state.
- [src/runtime/keybinding/keybindingRuntime.ts](../../../src/runtime/keybinding/keybindingRuntime.ts#L1) maps group-pane `Delete`/`Backspace` to confirmed metadata deletion and `Ctrl+Delete`/`Ctrl+Backspace` to forced deletion.
- Port search `Esc` first clears multi-select, then clears focused search text and exits focus in one step; it no longer spends a separate search-blur step when query text exists.

## Scope

- Includes ports page layout, search input rendering, group/folder metadata deletion, confirm-layer `Enter`, search-input `Enter` history preservation, and automated test updates.
- Does not change process kill semantics or favorite removal semantics.
