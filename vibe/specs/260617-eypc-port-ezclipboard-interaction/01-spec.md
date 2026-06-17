# EyPc Port EzClipboard Interaction Spec

Tool: codex

## Goal

Migrate EzClipboard-style interaction taste into the EyPc port page: search-aware keyboard control, right-side action drawer, command-backed multi-select operations, and Esc recovery that returns to the initial port workbench state instead of exiting the plugin.

## Requirements

- Port search focus allows `↑↓` / `Ctrl+K/J`, `Space`, `Enter`, and `Ctrl+Enter` to operate on visible result rows.
- Search changes normalize result focus to the first visible row when the old focus is no longer visible.
- `Space` toggles the current result and moves focus to the next visible row; the last row stays clamped.
- Group search focus allows `↑↓` / `Ctrl+K/J` and `Enter`, while preserving text input for `Space`.
- Multi-select opens a right drawer in display mode; list keyboard focus remains active until the drawer is explicitly activated.
- `Ctrl+Right` activates the action drawer for the current row, selected ports, or focused group.
- Drawer actions, row buttons, shortcuts, and settings commands all share runtime action ids.
- `Escape` on the port page closes inward transient states, clears multi-select/search/filter, and returns to result focus without exiting the plugin.
- No real process kill is executed in automated verification.

## References

- Runtime state and action dispatch: [../../../src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L1).
- Keybinding resolution: [../../../src/runtime/keybinding/keybindingRuntime.ts](../../../src/runtime/keybinding/keybindingRuntime.ts#L1).
- Port UI surface: [../../../src/pages/PortsPage.vue](../../../src/pages/PortsPage.vue#L1).
- Project interaction taste: [../../knowledge/developer-soul.md](../../knowledge/developer-soul.md#L1).
