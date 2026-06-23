# EyPc File Management Tab Spec

Tool: codex

## Goal

Upgrade the existing favorites MVP into a keyboard-first quick-open favorites loop: capture `name + absolute path + type`, review selected paths before saving, search saved paths, and run open/reveal/copy actions from both the full favorites page and compact uTools quick entry. Virtual containers, real folder one-level browsing, and right-click action drawers remain available, but they must not dominate the default page.

## Requirements

- Favorites distinguish virtual `group` nodes from real `file` / `folder` targets in [../../../src/domain/types.ts](../../../src/domain/types.ts#L40), while all three node kinds can act as virtual parents.
- Domain logic projects both legacy group-only trees and full favorite container trees, filters target rows by container/search, blocks parent cycles across any node kind, and cascades only plugin metadata deletion in [../../../src/domain/favorites.ts](../../../src/domain/favorites.ts#L1).
- Initialization is explicit and user-controlled: empty favorites show `选择文件`, `选择文件夹`, `手动添加`, and `新建分组`; no folders are scanned or created automatically in [../../../src/pages/FavoritesPage.vue](../../../src/pages/FavoritesPage.vue#L1).
- Target creation normalizes pasted/selected paths, infers a missing name from the path tail, attaches to the selected virtual group or root, and focuses an existing target instead of adding a duplicate `kind + path` through [../../../src/domain/favorites.ts](../../../src/domain/favorites.ts#L1) and [../../../src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L1).
- OS path picking is split by target type: `files.pickFavorites('file')` uses file multi-selection and `files.pickFavorites('folder')` uses folder multi-selection. This avoids Electron's Windows/Linux mixed file+folder selector limitation in [../../../src/platform/eypcPlatform.ts](../../../src/platform/eypcPlatform.ts#L1) and [../../../preload/index.js](../../../preload/index.js#L1).
- Picked paths enter a non-persisted runtime review layer `favoritePickReview`; users can edit names/tags/colors/parent, then `Ctrl+S` or `Ctrl+Enter` commits through runtime actions, while `Escape` cancels without writing metadata in [../../../src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L1).
- The favorite edit layer path field provides an OS path picker button that fills the current draft path/kind/name without immediately writing favorite metadata in [../../../src/pages/FavoritesPage.vue](../../../src/pages/FavoritesPage.vue#L1) and [../../../src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L1).
- Runtime exposes favorites container/item panes, current container virtual children, folder directory entries, command-backed editing, confirmed/force metadata removal, usage stats, target creation, multi-path picking, duplicate focusing, directory-row selection, action drawers, and quick mode through [../../../src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L1).
- Shortcuts follow command-soul semantics in [../../../src/runtime/keybinding/keybindingRuntime.ts](../../../src/runtime/keybinding/keybindingRuntime.ts#L1): `Tab` pane loop, `Ctrl+N` manual target, `Ctrl+O` pick files, `Ctrl+Shift+O` pick folders, review-layer `Ctrl+S` / `Ctrl+Enter` commit, review-layer `Escape` cancel, `F2` edit, `Shift+F2` rename, `Ctrl+C` copy path, `Ctrl+ArrowRight` favorite action drawer, and `Ctrl+1..9` drawer actions.
- The full favorites page renders a compact container tree, primary path list, focused-row open/reveal/copy/more/remove actions, review modal, on-demand real folder one-level directory section, real directory multi-selection, and right-click action drawer in [../../../src/pages/FavoritesPage.vue](../../../src/pages/FavoritesPage.vue#L1).
- Platform bridge exposes `files.pickFavorites(kind)` and `files.listDirectory(path)` with browser-safe fallback in [../../../src/platform/eypcPlatform.ts](../../../src/platform/eypcPlatform.ts#L1); preload maps split uTools/Electron multi-selection dialogs and non-recursive `fs.readdir(..., { withFileTypes: true })` directory reads in [../../../preload/index.js](../../../preload/index.js#L1).
- uTools feature routing supports `eypc-favorites-quick` through [../../../public/plugin.json](../../../public/plugin.json#L1) and [../../../src/runtime/feature/featureRouting.ts](../../../src/runtime/feature/featureRouting.ts#L1).
- Preload broadcasts repeated `onPluginEnter` payloads for the single-instance plugin through [../../../preload/index.js](../../../preload/index.js#L1).
- macOS favorite open/reveal must wait for real platform results: [../../../preload/index.js](../../../preload/index.js#L210) uses `/usr/bin/open` and `/usr/bin/open -R`, falls back from unsupported default open to Finder reveal, and falls back to uTools shell APIs only after native reveal fails.
- The uTools runtime package keeps manifest `preload.js`, but ships a local CommonJS package scope through [../../../public/package.json](../../../public/package.json#L1) because Electron requires preload scripts through CommonJS while the root project package is ESM.
- Favorite command search hints follow the shared compact hint contract: [../../../src/App.vue](../../../src/App.vue#L177) passes shortcut hint state into full and quick favorite pages; target search shows `c-f`, container search shows `c-s-f`, and quick search shows `c-f` through [../../../src/pages/FavoritesPage.vue](../../../src/pages/FavoritesPage.vue#L35) and [../../../src/pages/QuickFavoritesPage.vue](../../../src/pages/QuickFavoritesPage.vue#L12).

## Safety

- Removing a favorite never deletes disk files or folders.
- Normal removal opens confirmation; force removal deletes only EyPc metadata.
- Opening, locating, and copying paths remain platform-bridge calls, not direct UI shell calls.
- uTools preload packaging must be validated after build so `dist/plugin.json`, `dist/package.json`, and `dist/preload.js` describe the same CommonJS runtime.
- Quick favorite mode only opens, locates, copies, searches, clears, and hides; it does not expose add, edit, rename, or remove commands.
- Pick review is transient runtime state only; canceling or closing it must not mutate `AppState` or uTools storage.
- Real directory browsing reads only the selected folder's immediate children, never recursively scans, and never adds rows to favorites unless the user explicitly runs the add command.
- File containers show file metadata and virtual children only; EyPc does not read file contents in this version.
