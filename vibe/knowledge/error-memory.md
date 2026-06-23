# EyPc Error Memory

Tool: codex

## File Favorites macOS Open, Preload, And Shortcut Hints

- Date: 2026-06-23.
- Evidence: code, test, user-reported screenshots/logs.
- Symptom: macOS favorites `打开` / `定位` appeared to do nothing; Electron reported `require() of ES Module dist/preload.js not supported`; full favorites search inputs did not show command hints even though top tabs did.
- Wrong assumption: treating uTools `shellOpenPath` / `shellShowItemInFolder` synchronous return as proof of success, assuming a copied `preload.js` works inside the root ESM package scope, and assuming App-level shortcut hint state reaches every page because top-level tab hints render.
- Disproven path: renaming only to `preload.cjs` or preparing only `public/preload.js` is not enough when `dist/plugin.json` and `dist/package.json` can be stale. Fixing the shared `SearchSuggestBox` is also the wrong target when a page does not pass `shortcutHint`.
- Verified root cause: [preload/index.js](../../preload/index.js#L210) needed macOS native command fallback and real async success/failure; the uTools runtime needed a local CommonJS package scope through [public/package.json](../../public/package.json#L1); [src/App.vue](../../src/App.vue#L177) did not pass `showShortcutHints` into favorites pages, and [src/pages/FavoritesPage.vue](../../src/pages/FavoritesPage.vue#L35) / [src/pages/QuickFavoritesPage.vue](../../src/pages/QuickFavoritesPage.vue#L12) did not pass favorite command labels into `SearchSuggestBox`.
- Correct detection order: first inspect the actual runtime artifact path from the host log (`dist/preload.js`), then compare `public/plugin.json`, `dist/plugin.json`, and local package scopes; for command hints, compare a working page pattern such as [src/pages/PortsPage.vue](../../src/pages/PortsPage.vue#L186) against the broken favorites pages before editing shared components.
- Prevention rule: after any uTools preload or manifest change, run `node scripts/prepare-utools-runtime.mjs` and `pnpm run validate:utools`; after any command hint change, add a UI regression in [tests/ui/searchShortcutHints.test.ts](../../tests/ui/searchShortcutHints.test.ts#L1) that verifies both App prop propagation and page-level `shortcutHint` binding.
- Latest correct scheme: [technical-details.md](technical-details.md#L1) and [ARCHITECTURE.md](ARCHITECTURE.md#L1).
