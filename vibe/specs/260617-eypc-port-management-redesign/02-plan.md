# EyPc Port Management Redesign Plan

Tool: codex

## Summary

Rebuild the port management feature around a tested domain matcher, user-owned groups, two-pane keyboard navigation, action-backed commands, and synchronized process documentation.

## Implementation

- Extend [src/domain/ports.ts](../../../src/domain/ports.ts#L72) with relevance scoring, auto-regex matching, group rule parsing, and full process text matching.
- Update [src/domain/state.ts](../../../src/domain/state.ts#L6) so new state has no default groups and legacy `default:*` groups are dropped during normalization.
- Extend [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L73) with port pane focus, shared search state, group CRUD, group creation from selection, list shortcuts, and action dispatch.
- Extend [src/runtime/keybinding/keybindingRuntime.ts](../../../src/runtime/keybinding/keybindingRuntime.ts#L19) so all port commands are overrideable in Settings.
- Replace [src/pages/PortsPage.vue](../../../src/pages/PortsPage.vue#L17) with a two-pane keyboard-first UI and centered search/editor layers.

## Verification

- Add focused tests for search scoring, group regex matching, default group migration, shortcut-driven list navigation, group cleanup, and group creation from selection.
- Run `pnpm run test`, `pnpm run typecheck`, `pnpm run build`, and `pnpm run validate:utools`.
- Record manual gaps for real uTools loading and real cross-platform process cleanup.
