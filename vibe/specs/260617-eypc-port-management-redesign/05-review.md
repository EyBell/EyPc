# EyPc Port Management Redesign Review

Tool: codex

## Requirement Coverage

- Search now supports relevance sorting and regex handling in [src/domain/ports.ts](../../../src/domain/ports.ts#L98).
- User-defined groups support ports, ranges, and regex over full process text in [src/domain/ports.ts](../../../src/domain/ports.ts#L150).
- New state starts without default groups and drops legacy `default:*` groups in [src/domain/state.ts](../../../src/domain/state.ts#L60).
- Runtime actions cover pane focus, group apply, cleanup, group CRUD, and selection-to-group in [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L349).
- Search open and first typed query now auto-scan empty port data through [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L183).
- Keybinding defaults expose port commands for Settings override in [src/runtime/keybinding/keybindingRuntime.ts](../../../src/runtime/keybinding/keybindingRuntime.ts#L20).
- Ports page now renders left groups, right results, inline search inputs, and group editor in [src/pages/PortsPage.vue](../../../src/pages/PortsPage.vue#L29).
- macOS/Linux use `lsof`; Windows uses `netstat` for scan command selection in [src/platform/processBridge.ts](../../../src/platform/processBridge.ts#L8). uTools preload uses absolute-path candidates first to avoid GUI PATH misses in [preload/index.js](../../../preload/index.js#L25).
- Browser/dev fallback now performs a real local scan instead of returning an empty list through [src/platform/eypcPlatform.ts](../../../src/platform/eypcPlatform.ts#L51) and [src/platform/devPortServer.ts](../../../src/platform/devPortServer.ts#L1).

## Manual Confirmation

- 2026-06-17 user screenshot confirms inline query `8081` displays live `node` listeners for ports `8081` and `17889`, closing the visible-result regression.

## Risk And Compatibility

- Force cleanup remains direct, but runtime still re-scans and filters by PID+port before invoking preload kill.
- Existing stored `default:*` groups are intentionally removed. User-created groups are preserved.
- No dependency was added.
- Real process termination was not executed in automated verification.
- Windows/Linux real process scans still require release-gate manual checks on those systems.
