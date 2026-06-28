# MQTT Connection Tree Plan

Tool: codex

## Plan

1. Add MQTT connection group state, persisted collapsed ids, and normalization compatibility.
2. Add pure tree helpers for row projection, drop target resolution, move, delete, and cycle prevention.
3. Extend runtime snapshot/actions with group draft editing, group focus, tree rows, collapse/expand, drag move, and config `groupId` editing.
4. Extend keybinding/input role ownership for `mqtt-connection-group-editor` and connection-tree `ArrowLeft` / `ArrowRight`.
5. Add connection-tree shortcut defaults and hints: `Ctrl+G`, target-aware `F2` / `Shift+F2`, group `Ctrl+F2`, `Ctrl+ArrowLeft`, `Ctrl+ArrowRight`, and Quick Jump row/action metadata.
6. Replace MQTT connection rail rendering with a compact tree using native drag/drop, right-click entry, and row-local actions.
7. Add focused tests across domain, state normalization, runtime actions, keybinding, keyboard role extraction, Quick Jump/UI source expectations.
8. Update project process docs and memory.

## Risks

- Existing persisted MQTT configs must load with `groupId: null`.
- Active MQTT config must not change when focusing a group.
- Group actions must not copy/connect the active config accidentally when a group row is focused.
- Drag/drop must avoid cycles and keep sibling sort stable.
- F2 routing must distinguish config rows from group rows without introducing shortcut conflicts in the MQTT profile.
