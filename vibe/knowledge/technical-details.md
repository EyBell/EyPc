# EyPc Technical Details

Tool: codex

## File Favorites Runtime

- Last verified: 2026-06-23.
- Evidence: code, tests, build.
- Runtime boundary: favorites open/reveal/copy stays behind [preload/index.js](../../preload/index.js#L210), [src/platform/eypcPlatform.ts](../../src/platform/eypcPlatform.ts#L1), and [src/runtime/appRuntime.ts](../../src/runtime/appRuntime.ts#L1); UI pages dispatch action ids instead of shelling out.
- macOS open/reveal: [preload/index.js](../../preload/index.js#L210) runs `/usr/bin/open <path>` for open and `/usr/bin/open -R <path>` for reveal. Unsupported default open falls back to Finder reveal, and failed native reveal falls back to the uTools shell API.
- uTools preload packaging: root [package.json](../../package.json#L1) is ESM, so [public/package.json](../../public/package.json#L1) declares `type: commonjs`. [scripts/prepare-utools-runtime.mjs](../../scripts/prepare-utools-runtime.mjs#L1) syncs `plugin.json`, `package.json`, and `preload.js` into `dist`, while [scripts/validate-utools-runtime.mjs](../../scripts/validate-utools-runtime.mjs#L1) validates the CommonJS package scope.
- Quick favorite focus: [src/runtime/appRuntime.ts](../../src/runtime/appRuntime.ts#L3025) focuses the first visible favorite when quick mode starts, so empty-search `Enter` has a target.
- Favorite search command hints: [src/App.vue](../../src/App.vue#L177) passes `showShortcutHints` into [src/pages/FavoritesPage.vue](../../src/pages/FavoritesPage.vue#L35) and [src/pages/QuickFavoritesPage.vue](../../src/pages/QuickFavoritesPage.vue#L12). Full target search uses `c-f`, full container search uses `c-s-f`, and quick search uses `c-f`.
- Regression tests: [tests/platform/favoriteFileBridge.test.ts](../../tests/platform/favoriteFileBridge.test.ts#L1), [tests/runtime/action.test.ts](../../tests/runtime/action.test.ts#L1), and [tests/ui/searchShortcutHints.test.ts](../../tests/ui/searchShortcutHints.test.ts#L73).
- Update trigger: change this record when favorites bridge methods, uTools preload packaging, quick-mode focus initialization, or favorite search hint propagation changes.

## Documentation Sync

- Last verified: 2026-06-23.
- The current file favorites source of truth is [vibe/specs/2606201810-eypc-file-management-tab/01-spec.md](../specs/2606201810-eypc-file-management-tab/01-spec.md#L1) with verification in [vibe/specs/2606201810-eypc-file-management-tab/04-verify.md](../specs/2606201810-eypc-file-management-tab/04-verify.md#L1).
- Durable architecture facts live in [ARCHITECTURE.md](ARCHITECTURE.md#L1), while repeated wrong paths are archived in [error-memory.md](error-memory.md#L1).
