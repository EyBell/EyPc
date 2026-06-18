# Settings Shortcut Ez Style Plan

Tool: codex

## Goal

Align EyPc Settings shortcut recording with local EzClipboard while preserving EyPc command ownership, layered shortcut resolution, and existing storage schema.

## Implementation

- Update [src/pages/SettingsPage.vue](../../../src/pages/SettingsPage.vue#L1) so shortcut rows are derived from `draftShortcutProfiles`; page-level save emits all draft profiles, while row operations mutate only the draft.
- Replace the old single-input recorder in [src/pages/SettingsPage.vue](../../../src/pages/SettingsPage.vue#L1) with current bindings, pending bindings, capture staging, direct input, default restore, remove, and pending edit controls.
- Add runtime profile commit support in [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L1), then connect [src/App.vue](../../../src/App.vue#L1) to `saveShortcutProfiles`.
- Extend [src/styles/app.css](../../../src/styles/app.css#L1) for the EzClipboard-style recorder panels, capture row, direct input row, and draft save controls.
- Keep validation conservative: modifier-only, `*`, reservation hits, invalid `when`, and overlapping same-layer conflicts block recorder and when saves.

## Tests

- Extend [tests/ui/settingsLayout.test.ts](../../../tests/ui/settingsLayout.test.ts#L1) to lock draft save controls and recorder structure.
- Extend [tests/runtime/action.test.ts](../../../tests/runtime/action.test.ts#L1) to verify `saveShortcutProfiles` replaces profile overrides, rebuilds the legacy aggregate, and persists once.
- Run `pnpm exec vitest run tests/ui/settingsLayout.test.ts tests/ui/searchShortcutHints.test.ts`.
- Run `pnpm exec vitest run tests/runtime/keybinding.test.ts tests/runtime/action.test.ts`.
- Run `pnpm run typecheck`.
- Run `pnpm run build`.

## Risks

- The page now has unsaved shortcut draft state; user changes are not persisted until the Settings shortcut save button or `Ctrl/Cmd+S`.
- The runtime schema stays compatible, but the UI behavior changes from immediate mutation to explicit commit.
