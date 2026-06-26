# MQTT Rail Menu And Focus Spec

Tool: codex

## Background

The MQTT workbench already had compact connection and subscription rails, but the expanded rail rows did not fully expose the same keyboard, selection, menu, and detail contracts as message rows. The connection-config drawer also had an incomplete `Tab` cycle that could skip managed subscription/publish rows or land on the wrong field.

## Requirements

- Connection rail rows are focusable targets owned by runtime state. They expose highlight, focus, multi-select, movement, detail, action menu, copy address, edit, delete, connect, disconnect, and logs.
- Subscription rail rows are focusable targets owned by runtime state. They expose highlight, focus, multi-select, movement, detail, action menu, copy topic, use-as-publish-topic, edit, delete, and topic filter application.
- `Ctrl+ArrowLeft` opens the detail drawer and `Ctrl+ArrowRight` opens the action drawer for focused connection/subscription targets.
- `Space` toggles selection in connection and subscription rails without falling through to publish/message row selection.
- `Ctrl+C` copies the active connection endpoint or subscription topic according to the active rail.
- `Delete` / `Backspace` delete the focused connection or subscription; `Ctrl+Delete` / `Ctrl+Backspace` delete the selected set.
- Right-click on connection/subscription rows opens the same action drawer target as keyboard `Ctrl+ArrowRight`.
- The config editor `Tab` / `Shift+Tab` cycle includes connection basics, each subscription alias/topic/color row, each publish-topic row, and MQTT option fields in deterministic order.

## Scope

- Runtime focus/action state: [../../../src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L1).
- Shortcut/input role ownership: [../../../src/runtime/keybinding/keybindingRuntime.ts](../../../src/runtime/keybinding/keybindingRuntime.ts#L1), [../../../src/runtime/keyboardEvent.ts](../../../src/runtime/keyboardEvent.ts#L1).
- MQTT UI and row affordances: [../../../src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L1), [../../../src/styles/app.css](../../../src/styles/app.css#L1).
- Regression coverage: [../../../tests/runtime/action.test.ts](../../../tests/runtime/action.test.ts#L1), [../../../tests/runtime/keybinding.test.ts](../../../tests/runtime/keybinding.test.ts#L1), [../../../tests/runtime/keyboardEvent.test.ts](../../../tests/runtime/keyboardEvent.test.ts#L1), [../../../tests/ui/mqttPage.test.ts](../../../tests/ui/mqttPage.test.ts#L1).

## Out Of Scope

- External broker behavior.
- MQTT archive schema changes.
- Secret storage, SQLite persistence, or publish payload serialization changes.
