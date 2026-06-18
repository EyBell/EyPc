# Port Compact Help And Group Delete Verification

## Automated

- `pnpm vitest run tests/runtime/keybinding.test.ts tests/runtime/action.test.ts tests/ui/searchShortcutHints.test.ts tests/ui/commandHints.test.ts`
  - Result: pass, 4 files / 60 tests.
- `pnpm run test`
  - Result: pass, 17 files / 109 tests.
- `pnpm run typecheck`
  - Result: pass.
- `pnpm run build`
  - Result: pass; includes `vue-tsc --noEmit`, Vite production build, runtime asset preparation, and `validate:utools`.
- `pnpm run validate:utools`
  - Result: pass.

## Manual Smoke Checklist

- Top-right `?` displays shortcut hints on hover/focus; no fixed bottom hint bar is present.
- Port page panes use compact spacing without losing row readability.
- Inline history follows the typed query and truncates before right-side status/shortcut hints.
- Search-focused `Enter` does not confirm the highlighted port/group/folder when history dropdown is closed; with the dropdown open, it still accepts the highlighted history candidate.
- Group/folder `Delete` or `Backspace` opens confirmation; `Enter` accepts and `Escape` cancels.
- Group/folder `Ctrl+Delete` or `Ctrl+Backspace` deletes metadata directly; folder deletion removes child groups.
