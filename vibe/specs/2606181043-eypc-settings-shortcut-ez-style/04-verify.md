# Settings Shortcut Ez Style Verification

Tool: codex

## Automated

- `pnpm run test -- tests/ui/settingsLayout.test.ts`
  - RED result before implementation: fail on missing `primaryShortcutRows`, `maintenanceShortcutRows`, command tooltip helpers, settings search focus hook, and `Layer Commands`.
  - GREEN result after implementation: pass, 17 files / 109 tests.
- `pnpm run test -- tests/runtime/keybinding.test.ts tests/runtime/action.test.ts`
  - Result: pass, 17 files / 109 tests.
- `pnpm run typecheck`
  - Result: pass.
- `pnpm run build`
  - Result: pass; includes `vue-tsc --noEmit`, Vite production build, runtime asset preparation, and `validate:utools`.
- Follow-up after right-side command drawer fix:
  - `pnpm exec vitest run tests/ui/settingsLayout.test.ts`: pass, 1 file / 3 tests.
  - `pnpm exec vitest run tests/runtime/keybinding.test.ts tests/runtime/action.test.ts`: pass, 2 files / 56 tests.
  - `pnpm run typecheck`: pass.
  - `pnpm run build`: pass; includes `vue-tsc --noEmit`, Vite production build, runtime asset preparation, and `validate:utools`.
- Follow-up after hint placement fix:
  - `pnpm exec vitest run tests/ui/searchShortcutHints.test.ts tests/ui/settingsLayout.test.ts`: pass, 2 files / 7 tests.
  - `pnpm run typecheck`: pass.
  - `pnpm run build`: pass; includes `vue-tsc --noEmit`, Vite production build, runtime asset preparation, and `validate:utools`.
- Follow-up after lower command tooltip and settings search hint fix:
  - `pnpm exec vitest run tests/ui/settingsLayout.test.ts tests/ui/searchShortcutHints.test.ts`: pass, 2 files / 7 tests.
  - `pnpm run typecheck`: pass.
  - `pnpm run build`: pass; includes `vue-tsc --noEmit`, Vite production build, runtime asset preparation, and `validate:utools`.
- Follow-up after mouse-following tooltip, Ctrl-held search hint, and maintenance preview move:
  - `pnpm exec vitest run tests/ui/settingsLayout.test.ts tests/ui/searchShortcutHints.test.ts`: pass, 2 files / 7 tests.
  - `pnpm run typecheck`: pass.
  - `pnpm run build`: pass; includes `vue-tsc --noEmit`, Vite production build, runtime asset preparation, and `validate:utools`.
- Follow-up after command tooltip upper placement:
  - `pnpm exec vitest run tests/ui/settingsLayout.test.ts tests/ui/searchShortcutHints.test.ts`: pass, 2 files / 7 tests.
  - `pnpm run typecheck`: pass.
  - `pnpm run build`: pass; includes `vue-tsc --noEmit`, Vite production build, runtime asset preparation, and `validate:utools`.
- Follow-up after command-column full-cell hover target:
  - `pnpm exec vitest run tests/ui/settingsLayout.test.ts tests/ui/searchShortcutHints.test.ts`: pass, 2 files / 7 tests.
  - `pnpm run typecheck`: pass.
  - `pnpm run build`: pass; includes `vue-tsc --noEmit`, Vite production build, runtime asset preparation, and `validate:utools`.
- Follow-up after maintenance left-nav center-domain redesign:
  - RED: `pnpm exec vitest run tests/ui/settingsLayout.test.ts` failed on missing `MaintenanceSectionId`, `maintenance-section-nav`, `maintenance-center`, `maintenance-panel-body`, and `maintenance-command-table`.
  - `pnpm exec vitest run tests/ui/settingsLayout.test.ts`: pass, 1 file / 3 tests.
  - `pnpm run typecheck`: pass.
  - `pnpm exec vitest run tests/ui/settingsLayout.test.ts tests/ui/searchShortcutHints.test.ts`: pass, 2 files / 7 tests.
  - `pnpm run build`: pass; includes `vue-tsc --noEmit`, Vite production build, runtime asset preparation, and `validate:utools`.
- Follow-up after splitting maintenance overview menu:
  - RED: `pnpm exec vitest run tests/ui/settingsLayout.test.ts` failed on the old `overview` maintenance section instead of separate `layers` and `storage` sections. The same file also contains a pre-existing failing shortcut-record draft test unrelated to this menu split.
  - `pnpm exec vitest run tests/ui/settingsLayout.test.ts -t "moves layer and storage"`: pass, 1 test.
  - `pnpm exec vitest run tests/ui/searchShortcutHints.test.ts tests/ui/settingsLayout.test.ts -t "moves layer and storage|keeps shortcuts|uses scoped settings sub tabs"`: pass, 3 tests / 5 skipped.
  - `pnpm exec vitest run tests/ui/searchShortcutHints.test.ts`: pass, 1 file / 4 tests.
  - `pnpm run typecheck`: blocked by existing test typing issues in `tests/runtime/action.test.ts`: `window.eypcPlatform` possibly undefined and missing `saveShortcutProfiles` on the runtime test subject.
- Follow-up after EzClipboard-style recorder management and draft save:
  - RED: `pnpm exec vitest run tests/ui/settingsLayout.test.ts` failed on missing `draftShortcutProfiles` and recorder management structure.
  - RED: `pnpm exec vitest run tests/runtime/action.test.ts -t "saves shortcut profile drafts"` failed because `runtime.saveShortcutProfiles` was not implemented.
  - `pnpm exec vitest run tests/ui/settingsLayout.test.ts`: pass, 1 file / 4 tests.
  - `pnpm exec vitest run tests/runtime/action.test.ts -t "saves shortcut profile drafts"`: pass, 1 test / 36 skipped.
  - `pnpm exec vitest run tests/ui/settingsLayout.test.ts tests/ui/searchShortcutHints.test.ts`: pass, 2 files / 8 tests.
  - `pnpm exec vitest run tests/runtime/keybinding.test.ts tests/runtime/action.test.ts`: pass, 2 files / 57 tests.
  - `pnpm run typecheck`: pass.
  - `pnpm run build`: pass; includes `vue-tsc --noEmit`, Vite production build, runtime asset preparation, and `validate:utools`.
  - `pnpm run test`: pass, 17 files / 112 tests.

## Manual Smoke Checklist

- Open Settings -> 快捷键 and confirm the command column shows command ids first.
- Hover a command row and confirm the Chinese command title appears in the fast upper tooltip near the mouse point, not below the row or in a right-side drawer.
- Confirm the command tooltip shows complete multiline content without row-cell truncation.
- Confirm command tooltip appears only on mouse hover, not merely because the row is selected/highlighted.
- Confirm hovering any blank area inside the row's command column also shows the command tooltip.
- Hold Ctrl/Cmd and confirm top-tab shortcut hints float from the tab button's right edge without covering the tab label.
- Confirm the shortcut column has no always-visible `默认 ...` gray hint.
- Open Settings -> 维护 and confirm `Layer Commands` contains layer recovery commands such as `ports.detail.close`.
- Open Settings -> 维护 and confirm the left maintenance nav switches 层级优先级, 存储状态, Layer Commands, 解析候选, and 保留键与接管层 inside one center domain without affecting the top settings sub-tab.
- Confirm long `Layer Commands`, resolution candidates, and reservation lists scroll inside the center domain and do not overlap other maintenance sections.
- Press `Ctrl+F` or `Cmd+F` while Settings -> 快捷键 is active; focus should move to the shortcut search input.
- Confirm the Settings shortcut search input shows a compact `c-f` hint only while Ctrl/Command is held.
- Confirm the shortcut resolution preview is under Settings -> 维护, not between the shortcut filter and main table.
- Click `键` on a shortcut row and confirm the recorder shows current bindings, pending bindings, default values, capture staging, direct input, and default restore.
- Confirm captured shortcuts are staged first and only move to pending after clicking `✓`.
- Confirm removing current or pending bindings updates the merged binding list before saving.
- Confirm `键`, `W`, `复`, and `禁` change only the Settings draft; the runtime state persists only after clicking the page-level 保存 button or pressing `Ctrl/Cmd+S`.
- Confirm `禁` keeps the shortcut list visible but marks the command disabled after the draft is saved.
