# Port Focus And History Removal Verification

Tool: codex

## Automated

- `pnpm vitest run tests/runtime/keybinding.test.ts tests/runtime/action.test.ts tests/ui/searchShortcutHints.test.ts tests/ui/portGroupPreviewStyle.test.ts`
  - Result: failed before implementation on history-command removal, group-search `Enter`/delete behavior, Shift-preview focus constraints, and stale row highlight after command-driven search focus; passed after implementation, 4 files / 66 tests.
- `pnpm vitest run tests/runtime/action.test.ts --testNamePattern "clears previous port highlights"`
  - Result: failed before implementation because `ports.search.focus` kept `focusedPortId`; passed after [appRuntime.ts](../../../src/runtime/appRuntime.ts#L278) clears stale port and group row highlights for search-focus commands.
- `pnpm vitest run tests/runtime/action.test.ts --testNamePattern "group search input after arrow movement|filters result rows"`
  - Result: failed before implementation because `ports.group.focusMatches` kept `focusedPortGroupId` after switching to result focus; passed after [appRuntime.ts](../../../src/runtime/appRuntime.ts#L1) made result and group row focus mutually exclusive.
- `pnpm vitest run tests/ui/portGroupPreviewStyle.test.ts`
  - Result: failed before implementation because group rows could render `focused` without checking the active logical pane; passed after [PortsPage.vue](../../../src/pages/PortsPage.vue#L1) constrained group row focus classes to the group pane.
- `pnpm run test`
  - Result: pass, 17 files / 117 tests.
- `pnpm run typecheck`
  - Result: pass.
- `pnpm run build`
  - Result: pass; includes `vue-tsc --noEmit`, Vite production build, runtime asset preparation, and `validate:utools`.

## Static Checks

- Source search for `searchHistoryState`, `search.history`, `search-history`, `search-inline`, `historyState`, and UI `SearchHistoryTarget` has no hits outside legacy domain compatibility and tests that assert removed behavior.
- [SearchSuggestBox.vue](../../../src/components/SearchSuggestBox.vue#L1), [PortsPage.vue](../../../src/pages/PortsPage.vue#L1), and [FavoritesPage.vue](../../../src/pages/FavoritesPage.vue#L1) no longer pass history props or emit history actions.

## Manual Smoke Checklist

- Port search `Enter` remains inert while the input is focused; `ArrowUp` / `ArrowDown` still moves the result highlight.
- Group search filters visible rows, `ArrowUp` / `ArrowDown` moves the focused group/folder, and `Enter` applies the focused group using normal group-pane logic.
- `Ctrl+F` / `Ctrl+Shift+F` into port search or group search clears any previous row highlight first; list movement or filtering can then create the next active row.
- When a group filter has moved focus into the result list, the filtered group remains filter context only and does not render a second movable focus highlight.
- From group search, `F2`, `Shift+F2`, `Ctrl+Enter`, `Ctrl+ArrowLeft`, `Ctrl+ArrowRight`, `Delete` / `Backspace`, and `Ctrl+Delete` / `Ctrl+Backspace` act on the focused group/folder.
- Holding Shift shows the readonly group preview only when the group pane is the active logical focus area and no higher layer is active.
