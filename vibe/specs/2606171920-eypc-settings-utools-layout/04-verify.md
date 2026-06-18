# Settings uTools Layout Verification

## Automated

- `pnpm run test -- tests/ui/settingsLayout.test.ts`
  - Result: pass after implementation; the same test failed before implementation, proving the layout contract was missing.
- `pnpm run typecheck`
  - Result: pass.
- `pnpm run test -- tests/runtime/keybinding.test.ts tests/domain/state.test.ts tests/ui/settingsLayout.test.ts`
  - Result: pass, 17 files / 105 tests.
- `pnpm run build`
  - Result: pass; includes `vue-tsc --noEmit`, Vite production build, runtime asset preparation, and `validate:utools`.

## Manual Smoke Checklist

- Settings defaults to `快捷键`.
- Shortcut scope/search/state controls remain on one compact strip.
- Shortcut rows stay single-line at uTools-sized widths and no right inspector remains.
- `键` opens recorder, `W` opens When editor, `复` resets, `禁` disables.
- `维护` shows layer priority, reservation rules, current storage, and read-only SQLite status.
