# Port Search Interaction Spec

## Goal

Refactor port search history and focus behavior so search stays keyboard-first: inline history appears as a passive right-side hint, explicit selection opens only on demand, and port panes always have an actionable focus target.

## Requirements

- [SearchSuggestBox.vue](../../../src/components/SearchSuggestBox.vue#L1) shows the first matching history item as a gray single-line right-edge inline match while keeping the input focused.
- History dropdown opens only through `Shift+↑/↓` or clicking the inline match; `Enter` or mouse click accepts a dropdown item, while `←/→` closes the dropdown and preserves the inline match.
- `Tab` no longer switches left/right port panes; it accepts the inline history match only when a match exists. `Shift+Tab` remains the port-pane cycle command.
- [appRuntime.ts](../../../src/runtime/appRuntime.ts#L1) defaults port search and group search to the first visible matching port, group, or folder so actions like `F2`, `Ctrl+Delete`, and `Ctrl+ArrowRight` can run without a preliminary arrow key.
- `Esc` recovery order remains unchanged: history dropdown, search blur, drawers/details, selection, filters, then row focus.

## Scope

- Includes ports process search, ports group search, and shared search history rendering.
- Favorites search keeps shared history rendering and explicit runtime history acceptance, but this task does not redesign favorite list focus.
