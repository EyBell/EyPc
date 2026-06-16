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
- Favorites removal never deletes disk files.
- Force-kill actions must be scoped to selected PID and verified port match.

## Current Modules

- Domain models and projections: [src/domain/types.ts](../../src/domain/types.ts#L1), [src/domain/ports.ts](../../src/domain/ports.ts#L1), [src/domain/favorites.ts](../../src/domain/favorites.ts#L1), [src/domain/state.ts](../../src/domain/state.ts#L1).
- Runtime action/keybinding/feature logic: [src/runtime/appRuntime.ts](../../src/runtime/appRuntime.ts#L1), [src/runtime/action/actionRuntime.ts](../../src/runtime/action/actionRuntime.ts#L1), [src/runtime/keybinding/keybindingRuntime.ts](../../src/runtime/keybinding/keybindingRuntime.ts#L1), [src/runtime/feature/featureRouting.ts](../../src/runtime/feature/featureRouting.ts#L1).
- Platform bridge: [src/platform/eypcPlatform.ts](../../src/platform/eypcPlatform.ts#L1), [src/platform/processBridge.ts](../../src/platform/processBridge.ts#L1), [preload/index.js](../../preload/index.js#L1).
- UI pages and components: [src/App.vue](../../src/App.vue#L1), [src/pages/PortsPage.vue](../../src/pages/PortsPage.vue#L1), [src/pages/FavoritesPage.vue](../../src/pages/FavoritesPage.vue#L1), [src/pages/SettingsPage.vue](../../src/pages/SettingsPage.vue#L1).
