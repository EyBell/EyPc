# EyPc Port Group UI Optimization Plan

Tool: codex

## Steps

1. Add RED tests for group folder normalization, tree flattening, folder matching, group-panel toggle, group drawers, group-search key blocking, and `esc` stack behavior.
2. Extend domain state and pure port helpers in [src/domain/types.ts](../../../src/domain/types.ts#L14), [src/domain/state.ts](../../../src/domain/state.ts#L160), and [src/domain/ports.ts](../../../src/domain/ports.ts#L251).
3. Extend runtime actions and keybindings in [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L12) and [src/runtime/keybinding/keybindingRuntime.ts](../../../src/runtime/keybinding/keybindingRuntime.ts#L3).
4. Update UI rendering, drag/drop, drawers, blur handling, and command hints in [src/pages/PortsPage.vue](../../../src/pages/PortsPage.vue#L110), [src/App.vue](../../../src/App.vue#L44), and [src/components/CommandHints.vue](../../../src/components/CommandHints.vue#L1).
5. Verify with targeted tests, full tests, typecheck, build, uTools validation, and a local UI smoke.

## Risk Controls

- No dependency changes.
- No production process kill is used during verification.
- `esc` returns `null` only when no plugin interaction state remains, allowing the host to exit.
