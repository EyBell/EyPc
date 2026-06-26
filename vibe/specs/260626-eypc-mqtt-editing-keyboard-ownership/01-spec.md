# Editing Keyboard Ownership Spec

Tool: codex

## Problem

EyPc edit boxes must preserve native text editing semantics before project shortcuts. The reported MQTT send/draft surfaces exposed two failures:

- `Ctrl+ArrowRight` in the MQTT publish topic/payload editor opened publish options instead of acting like the host text-navigation chord.
- Publish draft-history editing could request focus during ordinary value updates, resetting caret/selection and making `Delete` / `Backspace` feel broken.

## Scope

- MQTT publish topic/payload editor, publish options popover, publish draft-history editor, subscription editor, config editor, record editor.
- Project edit roles in [keybindingRuntime.ts](../../../src/runtime/keybinding/keybindingRuntime.ts#L1), including port group editor, favorites editor/review, settings input role, and command-enhanced search roles.
- Runtime focus ownership in [appRuntime.ts](../../../src/runtime/appRuntime.ts#L1) and UI event ownership in [MqttPage.vue](../../../src/pages/MqttPage.vue#L1).

## Acceptance

- `Delete`, `Backspace`, plain arrows, and `Ctrl+ArrowLeft` / `Ctrl+ArrowRight` remain native in ordinary edit boxes unless the specific editor documents ownership of that chord.
- MQTT publish editor no longer opens publish options from `Ctrl+ArrowRight`; publish options remain reachable by button and close through `Escape` or outside click.
- Draft-history edit value changes and user focus changes do not increment `mqttFocusRequestId`; command transitions such as open and `Tab` field cycling still request focus.
- Editor-local keydown handlers call `preventDefault` / `stopPropagation` only for owned commands such as save, cancel, field cycle, or managed row movement/delete.
- Search inputs remain command-enhanced exceptions and keep their documented list navigation/action shortcuts.
