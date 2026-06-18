# Port Search Interaction Verification

## Automated

- `pnpm vitest run tests/runtime/keybinding.test.ts tests/runtime/action.test.ts tests/ui/searchShortcutHints.test.ts`
  - Result: pass after implementation; the same focused set failed before implementation on `Tab`, inline history, default group focus, and search-input force-kill expectations.
- `pnpm run test`
  - Result: pass, 17 files / 106 tests.
- `pnpm run typecheck`
  - Result: pass.
- `pnpm run build`
  - Result: pass; includes `vue-tsc --noEmit`, Vite production build, runtime asset preparation, and `validate:utools`.
- `pnpm run validate:utools`
  - Result: pass.

## Manual Smoke Checklist

- Port search with a matching history shows a gray inline match at the right edge and does not open a dropdown while typing.
- `Tab` accepts that inline match; `Shift+↑/↓` opens the dropdown and highlights a candidate.
- With the dropdown open, `←/→` closes only the dropdown and leaves the inline match visible.
- Group search immediately highlights the first matching group/folder, allowing `F2`, `Ctrl+Enter`, and `Ctrl+ArrowRight` without arrow movement.
- `Shift+Tab` cycles between group/results panes, and the target pane has a visible actionable highlight.
