# Settings uTools Layout Plan

## Implementation

- Add `SettingsTabId = 'shortcuts' | 'maintenance'` and shortcut scope filtering inside [SettingsPage.vue](../../../src/pages/SettingsPage.vue#L1).
- Pass `snapshot.state.settings` from [App.vue](../../../src/App.vue#L1) into Settings for read-only maintenance display.
- Replace the old Settings body with:
  - compact Settings sub tabs,
  - shortcut filter strip,
  - shortcut resolution preview strip,
  - single-line shortcut worktable,
  - maintenance grid for layer rules, reservations, and storage status.
- Update [app.css](../../../src/styles/app.css#L1) with compact row, strip, maintenance, and responsive styles.
- Add static UI regression coverage in [settingsLayout.test.ts](../../../tests/ui/settingsLayout.test.ts#L1).

## Verification

- Red/green static UI test for layout contract.
- `pnpm run test -- tests/runtime/keybinding.test.ts tests/domain/state.test.ts tests/ui/settingsLayout.test.ts`.
- `pnpm run typecheck`.
- `pnpm run build`.
