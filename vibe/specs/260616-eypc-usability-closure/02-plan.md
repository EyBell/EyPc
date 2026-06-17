# EyPc MVP Usability Closure Plan

Tool: codex

## Implementation

- Add runtime actions in [../../../src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L1) for `ports.killGroup.confirm`, `ports.killGroup.force`, `favorites.copyPath`, and `favorites.pickAndAdd`.
- Add default keybindings in [../../../src/runtime/keybinding/keybindingRuntime.ts](../../../src/runtime/keybinding/keybindingRuntime.ts#L1) for `tab.select.ports`, `tab.select.favorites`, and `tab.select.settings`.
- Add group cleanup controls in [../../../src/pages/PortsPage.vue](../../../src/pages/PortsPage.vue#L1).
- Add choose-path and copy-path controls in [../../../src/pages/FavoritesPage.vue](../../../src/pages/FavoritesPage.vue#L1).
- Implement `pickFavorite()` fallback behavior in [../../../preload/index.js](../../../preload/index.js#L1) and validate it from [../../../scripts/validate-utools-runtime.mjs](../../../scripts/validate-utools-runtime.mjs#L1).

## Validation

- Runtime tests cover group cleanup targeting, confirmation, force cleanup, Tab shortcuts, copy path, and picker add.
- Keybinding tests cover `Ctrl+1/2/3` and text input suppression.
- Full verification remains `pnpm run test`, `pnpm run typecheck`, `pnpm run build`, and `pnpm run validate:utools`.

