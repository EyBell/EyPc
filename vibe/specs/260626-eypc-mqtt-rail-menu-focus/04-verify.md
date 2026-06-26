# MQTT Rail Menu And Focus Verification

Tool: codex

## Automated Evidence

| Command | Result |
| --- | --- |
| `./node_modules/.bin/vitest run tests/runtime/keyboardEvent.test.ts tests/runtime/keybinding.test.ts tests/runtime/action.test.ts tests/ui/mqttPage.test.ts` | Passed: 4 files / 132 tests. |
| `./node_modules/.bin/vitest run tests/ui/mqttPage.test.ts` | Passed after the MQTT action-drawer row layout fix. |
| Playwright on `http://127.0.0.1:8092/` | Passed split/stack checks for publish-options and draft-history popovers: computed `z-index` was `38`, sampled `elementFromPoint` hits were the popover, and drawer overlay token remained above at `40`. |
| `./node_modules/.bin/vue-tsc --noEmit` | Passed. |
| `git diff --check` | Passed. |

## Covered Behavior

- [../../../tests/runtime/keyboardEvent.test.ts](../../../tests/runtime/keyboardEvent.test.ts#L1): `role="textbox"` is editable and `data-role="mqtt-connections"` maps to the MQTT connection layer.
- [../../../tests/runtime/keybinding.test.ts](../../../tests/runtime/keybinding.test.ts#L1): connection/subscription rail shortcuts resolve for selection, copy, delete, detail, and action drawers.
- [../../../tests/runtime/action.test.ts](../../../tests/runtime/action.test.ts#L1): runtime movement, selection, copy, drawer targeting, deletion, use-as-publish-topic, and config-editor `Tab` traversal.
- [../../../tests/ui/mqttPage.test.ts](../../../tests/ui/mqttPage.test.ts#L1): row roles, context menus, action buttons, selected states, focused config editor rows, and CSS selectors.
- The MQTT action drawer now uses the same three-part action row pattern as the port/favorite drawers, with bounded shortcut labels so long labels cannot overlap the right-side close/action column.
- MQTT local popovers now use a fixed workbench layer: content/resizer under popovers, active workbench popovers under global drawers, and preview/modal/shortcut layers above as separate tiers.

## Manual Notes

- No external MQTT broker smoke was run; this task changes local interaction state and command wiring only.
- Playwright visual priority checks reused the running local Vite server on port `8092`; no extra dev server was started.
- Existing unrelated working-tree changes around `App.vue`, QuickJump files, and `pnpm-workspace.yaml` were left untouched.
