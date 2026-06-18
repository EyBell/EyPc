# Settings Shortcut Ez Style Spec

Tool: codex

## Goal

Make the shortcut maintenance page match the local EzClipboard command-first style while preserving EyPc shortcut governance and runtime command ownership.

## Requirements

- [src/pages/SettingsPage.vue](../../../src/pages/SettingsPage.vue#L1) uses command id as the primary table text and moves Chinese title/default details into a fast mouse-following upper tooltip with complete multiline content.
- The main shortcut table does not show the old inline gray default shortcut hint.
- Scope chips use English profile/layer labels with hover text for the Chinese profile/layer meaning and layer priority.
- State chips are compact: source, risk, conflict count, and reservation count appear as short codes with hover detail.
- Layer recovery/maintenance commands such as `ports.detail.close`, `confirm.*`, and `search.history.*` move into the maintenance tab under `Layer Commands` but remain editable.
- Settings shortcut tab captures `Ctrl+F` / `Cmd+F` locally, shows a compact `c-f` hint on the search field only while Ctrl/Command is held, and focuses the shortcut search input without changing global `search.focus`.
- Shortcut resolution preview is maintained inside the maintenance tab instead of the main shortcut worktable.
- Shortcut recording and binding management must match local EzClipboard behavior: the dialog shows current bindings, pending bindings, capture staging, direct input, default restore, per-binding removal, and edit-in-place for pending bindings.
- Shortcut row operations use a Settings-local draft profile. `键` / `W` / `复` / `禁` update the draft only; the page-level save action writes all shortcut profiles to runtime storage in one operation.
- Disabled shortcut commands retain their current/default shortcut list in the draft but set `enabled: false` / `disabled: true`, preserving the configured key shape for later re-enable.

## Scope

- Includes [src/pages/SettingsPage.vue](../../../src/pages/SettingsPage.vue#L1), [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L1), [src/App.vue](../../../src/App.vue#L1), [src/styles/app.css](../../../src/styles/app.css#L1), [tests/ui/settingsLayout.test.ts](../../../tests/ui/settingsLayout.test.ts#L1), and [tests/runtime/action.test.ts](../../../tests/runtime/action.test.ts#L1).
- Does not change shortcut runtime resolution, persisted settings schema, keybinding profile shape, or runtime action ids.
