# MQTT Draft Popover Preview And Send Verification

Tool: codex

## RED

- `pnpm exec vitest run tests/runtime/action.test.ts --testNamePattern "publish draft history|shift preview|highlight stable"` failed before implementation because `Enter` kept the draft popover open and focused on `publish-draft`, and `source: 'shift'` rejected `publish-draft-history` targets.
- `pnpm exec vitest run tests/runtime/keybinding.test.ts --testNamePattern "MQTT"` and `pnpm exec vitest run tests/ui/mqttPage.test.ts` were prepared to cover the missing `Ctrl+Enter` draft command and draft popover preview targets.

## PASS

- `pnpm exec vitest run tests/runtime/action.test.ts --testNamePattern "publish draft history|shift preview|highlight stable"`: passed on 2026-06-25; 3 tests passed, 84 skipped.
- `pnpm exec vitest run tests/runtime/keybinding.test.ts --testNamePattern "MQTT"`: passed on 2026-06-25; 1 test passed, 26 skipped.
- `pnpm exec vitest run tests/ui/mqttPage.test.ts`: passed on 2026-06-25; 1 test passed.
- `pnpm run typecheck`: passed on 2026-06-25.
- `pnpm run test`: passed on 2026-06-25; 30 files passed, 243 tests passed.
- `pnpm run build`: passed on 2026-06-25; includes `vue-tsc --noEmit`, Vite build, uTools asset preparation, and uTools runtime validation.

## Coverage

- Runtime coverage verifies draft apply closes the popover and returns focus to payload, `Ctrl+Enter` sends the focused draft while keeping the popover open, active highlight survives overwrite archiving, and draft-history preview is Shift-only in [../../../tests/runtime/action.test.ts](../../../tests/runtime/action.test.ts#L1).
- Keybinding coverage verifies `Ctrl+Enter` resolves to `mqtt.publish.draft.send` in the draft popover in [../../../tests/runtime/keybinding.test.ts](../../../tests/runtime/keybinding.test.ts#L1).
- UI coverage verifies draft row preview targets, popover mouse handlers, active-index Shift preview sync, direct-send dispatch, and draft preview lookup in [../../../tests/ui/mqttPage.test.ts](../../../tests/ui/mqttPage.test.ts#L1).
