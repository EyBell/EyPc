# Editing Keyboard Ownership Plan

Tool: codex

## Implementation

1. Add regression coverage in [keybinding.test.ts](../../../tests/runtime/keybinding.test.ts#L1), [action.test.ts](../../../tests/runtime/action.test.ts#L1), and [mqttPage.test.ts](../../../tests/ui/mqttPage.test.ts#L1).
2. Remove the publish-options default `Ctrl+ArrowRight` binding from [keybindingRuntime.ts](../../../src/runtime/keybinding/keybindingRuntime.ts#L1) and action metadata in [appRuntime.ts](../../../src/runtime/appRuntime.ts#L1).
3. Stop [appRuntime.ts](../../../src/runtime/appRuntime.ts#L1) from requesting MQTT focus on ordinary draft-history edit updates.
4. Update [MqttPage.vue](../../../src/pages/MqttPage.vue#L1) so draft/record active-field watchers do not select text when the target is already focused.
5. Update MQTT editor keydown handlers in [MqttPage.vue](../../../src/pages/MqttPage.vue#L1) so they only intercept owned shortcuts.
6. Add publish-options outside-click close wiring in [MqttPage.vue](../../../src/pages/MqttPage.vue#L1).
7. Record reusable rules in the CodeNote master UI/developer-soul documents and EyPc project memory.

## Risk

- Shortcut compatibility: `Ctrl+ArrowRight` remains the MQTT action drawer only outside ordinary edit fields and in command-enhanced search/draft-list contexts.
- Editor behavior: `Tab` / `Shift+Tab` remain field-cycle commands by existing EyPc contract.
- Settings shortcut recorder remains an intentional exception because its purpose is to capture key chords.

## Verification

- Red/green targeted tests for MQTT publish options, draft edit focus requests, and UI outside-click/static handler contracts.
- Full gates: `vitest`, `vue-tsc`, `vite build`, uTools runtime prepare/validate, AI rule audit, and Markdown code-link audit.
