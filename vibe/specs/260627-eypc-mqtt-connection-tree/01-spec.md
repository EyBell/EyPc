# MQTT Connection Tree Spec

Tool: codex

## Requirement

- 优化 MQTT 连接展示，连接栏从平铺配置列表升级为可分组的层级树。
- 允许新增分组、子分组，连接可以归入分组。
- 支持层级折叠和拖拽移动，交互风格参照 EyTodo：紧凑树、明显层级、行内动作、可见拖拽落点。

## Scope

- State: [src/domain/types.ts](../../../src/domain/types.ts#L1), [src/domain/mqtt.ts](../../../src/domain/mqtt.ts#L1).
- Tree domain: [src/domain/mqttConnectionTree.ts](../../../src/domain/mqttConnectionTree.ts#L1).
- Runtime/actions: [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L1).
- Keybindings/input roles: [src/runtime/keybinding/keybindingRuntime.ts](../../../src/runtime/keybinding/keybindingRuntime.ts#L1), [src/runtime/keyboardEvent.ts](../../../src/runtime/keyboardEvent.ts#L1).
- UI/styles: [src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L1), [src/styles/app.css](../../../src/styles/app.css#L1).

## Contracts

- `MqttConnectionConfig.groupId` is nullable and invalid group references normalize to `null`.
- `MqttState.connectionGroups` stores user-created connection groups with `parentId`, `color`, and sibling `sortOrder`.
- `MqttLayoutPrefs.collapsedConnectionGroupIds` persists collapsed group ids and prunes deleted groups.
- Deleting a group deletes only group metadata and promotes direct child groups/configs to the deleted group parent.
- Drag/drop move is pure-domain resolved before runtime mutation; groups cannot move under themselves or descendants.
- MQTT `Ctrl+T` remains subscription add; connection group creation uses `Ctrl+G`, header/row buttons, right-click, and the action drawer instead of stealing the subscription shortcut. `Ctrl+G` is intentionally reused across feature tabs through keybinding `when` scope.
- `Ctrl+G` / `Ctrl+N` in the MQTT connection rail are focus-scoped. Group row focus creates child group/connection, config row focus creates same-level group/connection, connection search or blank rail focus creates top-level targets, other non-edit MQTT panes create top-level targets only while the connection rail is expanded, and ordinary editors do not trigger these shortcuts.
- Connection tree edit defaults follow existing group semantics: `F2` edits the current config/group, `Shift+F2` renames it, and `Ctrl+F2` moves a group parent when the current target is a group. Group `Shift+F2` renames inline inside the tree label instead of opening the full group editor.
- Connection tree `Ctrl+ArrowLeft` opens the detail drawer and `Ctrl+ArrowRight` opens the action drawer for the same target model used by right-click menus.
- Connection tree rows and row actions stay discoverable through global Quick Jump `F`; editable group/config drawers keep normal text ownership and block global `F`.
- Group rows keep only the left disclosure affordance before the label. Do not add a separate folder/logo glyph; hierarchy, count, and one-line row treatment carry the group identity.
