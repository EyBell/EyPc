# MQTT Rail Menu And Focus Plan

Tool: codex

## Files

- [../../../src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L1): add connection/subscription selection targets, rail movement, copy/delete/detail/action handlers, and config-editor focus matrix.
- [../../../src/runtime/keybinding/keybindingRuntime.ts](../../../src/runtime/keybinding/keybindingRuntime.ts#L1): add `mqtt-connections` layer and rail-specific shortcut ownership.
- [../../../src/runtime/keyboardEvent.ts](../../../src/runtime/keyboardEvent.ts#L1): recognize `role="textbox"` and `data-role="mqtt-connections"` as command context.
- [../../../src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L1): expose focusable row targets, context menus, detail/menu/copy buttons, and selected/focused row state.
- [../../../src/styles/app.css](../../../src/styles/app.css#L1): add visible focus/selection/hover states and compact action button layouts.
- [../../../tests/runtime/action.test.ts](../../../tests/runtime/action.test.ts#L1), [../../../tests/runtime/keybinding.test.ts](../../../tests/runtime/keybinding.test.ts#L1), [../../../tests/runtime/keyboardEvent.test.ts](../../../tests/runtime/keyboardEvent.test.ts#L1), [../../../tests/ui/mqttPage.test.ts](../../../tests/ui/mqttPage.test.ts#L1): cover shortcut resolution, runtime transitions, and UI command wiring.

## Steps

1. Add failing tests for connection rail selection/movement/copy/delete/drawer actions, subscription rail menu/copy/use-as-publish actions, and config-editor `Tab` traversal.
2. Implement runtime selection targets and public actions through existing action dispatch.
3. Wire keyboard layers and DOM role extraction so shortcuts resolve to the intended rail.
4. Add row-level buttons, contextmenu entry points, and focus/selection styles.
5. Update process and memory docs, then run targeted tests, typecheck, and diff checks.

## Risks

- `Ctrl+C` and delete shortcuts must not break native editing inside text fields.
- Detail/action drawers must distinguish config targets from subscription targets.
- Config-editor `Tab` traversal must remain stable when subscription or publish-topic rows are added or removed.

## Verification

- [04-verify.md](04-verify.md#L1).
