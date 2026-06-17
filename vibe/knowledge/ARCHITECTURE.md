# EyPc Architecture

Tool: codex

## Product Scope

EyPc is a keyboard-first uTools plugin for local PC capability calls. The first version provides port process management and file/folder favorites.

## Layers

```text
uTools feature entry / keyboard input
  -> Interaction Runtime
  -> Keybinding Runtime
  -> Action Runtime
  -> Domain services
  -> Platform bridge / preload
  -> UI projections
  -> uTools storage
```

## Invariants

- Action Runtime is the only user-visible mutation entry.
- Domain functions are pure and covered by tests.
- Platform functions isolate shell, process, file, and uTools APIs.
- UI renders projections and dispatches intents; it does not call shell commands directly.
- Project interaction taste is recorded in [developer-soul.md](developer-soul.md#L1); it guides medium or larger UI, shortcut, drawer, and AI-rule work before implementation details.
- Favorites removal never deletes disk files.
- Force-kill actions must be scoped to selected PID and verified port match.
- Port group cleanup expands configured group entries through the domain layer, then filters against the current scan before any kill request.
- Port scan results are deduped by `pid:port:protocol` in [src/domain/ports.ts](../../src/domain/ports.ts#L1), and duplicate listener addresses are merged before UI projection.
- Port search ranks exact, prefix, contains, and regex matches in [src/domain/ports.ts](../../src/domain/ports.ts#L1); regex group rules match full process text in [src/domain/ports.ts](../../src/domain/ports.ts#L1).
- Port groups are user-defined only; state normalization removes legacy `default:*` groups in [src/domain/state.ts](../../src/domain/state.ts#L60).
- Ports UI uses a two-pane group/results model with inline group/result search and group editing in [src/pages/PortsPage.vue](../../src/pages/PortsPage.vue#L29).
- Port-tab keyboard focus reserves `Tab` and `Shift+Tab` for group/results pane cycling in [src/runtime/keybinding/keybindingRuntime.ts](../../src/runtime/keybinding/keybindingRuntime.ts#L38), while global tab switching uses `Ctrl+1/2/3`.
- Shortcut resolution is layered, not flat: command profiles in [src/runtime/keybinding/keybindingRuntime.ts](../../src/runtime/keybinding/keybindingRuntime.ts#L1) resolve by layer priority, source weight, command weight, `when` specificity, and declaration order.
- Shortcut overrides are command-level state keyed by `commandId`; [src/domain/state.ts](../../src/domain/state.ts#L1) migrates legacy `shortcutId` into `shortcutIds`, while [src/runtime/appRuntime.ts](../../src/runtime/appRuntime.ts#L1) persists multi-binding and enabled/disabled overrides.
- Shortcut persistence is profile-based: [src/domain/types.ts](../../src/domain/types.ts#L1) stores `global`, `ports`, `favorites`, and `settings` profiles while preserving the legacy aggregate for compatibility.
- Settings shortcut governance lives in [src/pages/SettingsPage.vue](../../src/pages/SettingsPage.vue#L1): the page is a compact total-control surface with per-section profiles, conflict/reservation display, resolution preview, recording, and when editing.
- `Escape` is modeled as layer commands, with idle consumption in [src/runtime/appRuntime.ts](../../src/runtime/appRuntime.ts#L1) so nested interactions return one layer at a time and do not fall through to the uTools host.
- Edit layers use command-soul semantics in [src/runtime/keybinding/keybindingRuntime.ts](../../src/runtime/keybinding/keybindingRuntime.ts#L1): `F2` opens full edit, `Shift+F2` opens rename, `Ctrl+S` saves, `Escape` cancels, and `Tab` / `Shift+Tab` cycle fields inside the active editor only.
- Port search focus is pane-aware: `Ctrl+F` targets group search or result search through [src/runtime/appRuntime.ts](../../src/runtime/appRuntime.ts#L122) and [src/App.vue](../../src/App.vue#L55).
- Port search inputs are action-aware: `↑↓` / `Ctrl+K/J`, `Space`, `Enter`, and `Ctrl+Enter` can operate on visible results while unrelated text inputs remain protected by [src/runtime/keybinding/keybindingRuntime.ts](../../src/runtime/keybinding/keybindingRuntime.ts#L1).
- Port drawers are explicit runtime projections in [src/runtime/appRuntime.ts](../../src/runtime/appRuntime.ts#L1): `Ctrl+Left` opens the left single-process detail drawer, `Ctrl+Right` opens the right action menu, and multi-select does not auto-open a drawer.
- Port page `Escape` recovers inward before exiting outward: confirmation/editor, open drawer, multi-select, search/filter, and result focus are handled in [src/runtime/appRuntime.ts](../../src/runtime/appRuntime.ts#L1).
- Port search opening and first typed query auto-trigger scan through [src/runtime/appRuntime.ts](../../src/runtime/appRuntime.ts#L183), and uTools port entry dispatches search focus in [src/App.vue](../../src/App.vue#L64).
- Cross-platform scan commands are centralized as macOS/Linux `lsof -nP -iTCP -sTCP:LISTEN` and Windows `netstat -ano -p tcp` in [src/platform/processBridge.ts](../../src/platform/processBridge.ts#L8), with absolute-path GUI host candidates in [src/platform/processBridge.ts](../../src/platform/processBridge.ts#L13) and [preload/index.js](../../preload/index.js#L25).
- Local browser dev mode mirrors uTools process termination through POST `/__eypc__/ports/kill` in [src/platform/devPortServer.ts](../../src/platform/devPortServer.ts#L1); it re-scans before kill and refuses requests when PID no longer owns the requested port.
- Browser fallback storage persists normalized state to `localStorage['eypc/state/v1']` in [src/platform/eypcPlatform.ts](../../src/platform/eypcPlatform.ts#L1); uTools runtime storage continues to use preload `dbStorage`.
- Favorite path picking is an optional platform capability; unavailable hosts must return `null` and preserve manual path entry.

## Current Modules

- Domain models and projections: [src/domain/types.ts](../../src/domain/types.ts#L1), [src/domain/ports.ts](../../src/domain/ports.ts#L1), [src/domain/favorites.ts](../../src/domain/favorites.ts#L1), [src/domain/state.ts](../../src/domain/state.ts#L1).
- Runtime action/keybinding/feature logic: [src/runtime/appRuntime.ts](../../src/runtime/appRuntime.ts#L1), [src/runtime/action/actionRuntime.ts](../../src/runtime/action/actionRuntime.ts#L1), [src/runtime/keybinding/keybindingRuntime.ts](../../src/runtime/keybinding/keybindingRuntime.ts#L1), [src/runtime/feature/featureRouting.ts](../../src/runtime/feature/featureRouting.ts#L1).
- Platform bridge: [src/platform/eypcPlatform.ts](../../src/platform/eypcPlatform.ts#L1), [src/platform/processBridge.ts](../../src/platform/processBridge.ts#L1), [preload/index.js](../../preload/index.js#L1).
- UI pages and components: [src/App.vue](../../src/App.vue#L1), [src/pages/PortsPage.vue](../../src/pages/PortsPage.vue#L1), [src/pages/FavoritesPage.vue](../../src/pages/FavoritesPage.vue#L1), [src/pages/SettingsPage.vue](../../src/pages/SettingsPage.vue#L1).
