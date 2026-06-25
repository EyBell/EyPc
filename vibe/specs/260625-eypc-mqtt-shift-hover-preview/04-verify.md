# MQTT Shift Hover Preview Verification

Tool: codex

## Automated

- `pnpm exec vitest run tests/runtime/keyboardEvent.test.ts tests/runtime/action.test.ts tests/ui/mqttPage.test.ts`: failed on 2026-06-25 before implementation because `shouldEnableShiftPreview` was missing, `Shift+ArrowDown` still scrolled 80px, and the preview layer had no wheel handler.
- `pnpm exec vitest run tests/runtime/keyboardEvent.test.ts tests/runtime/action.test.ts tests/ui/mqttPage.test.ts`: passed on 2026-06-25 after implementation; 3 files, 98 tests.
- `pnpm run test`: passed on 2026-06-25 after implementation; 30 files, 246 tests.
- `pnpm run typecheck`: passed on 2026-06-25 after implementation.
- `pnpm run build`: passed on 2026-06-25 after implementation; includes `typecheck`, Vite build, `prepare-utools-runtime`, and `validate:utools`.
- `pnpm exec vitest run tests/runtime/action.test.ts --testNamePattern "owns MQTT pane navigation"`: passed on 2026-06-25.
- `pnpm exec vitest run tests/ui/mqttPage.test.ts`: passed on 2026-06-25.
- `pnpm run test`: passed on 2026-06-25; 30 files, 239 tests.
- `pnpm run typecheck`: passed on 2026-06-25.
- `pnpm run build`: passed on 2026-06-25; includes `typecheck`, Vite build, `prepare-utools-runtime`, and `validate:utools`.

## Coverage

- Runtime test verifies `source: 'shift'` can open valid message preview while a config/editor draft blocks keyboard preview, and `Escape` closes preview before the draft in [tests/runtime/action.test.ts](../../../tests/runtime/action.test.ts#L2222).
- Runtime tests verify pure-Shift gating, `Ctrl/Command+Shift` suppression, recovery after releasing Ctrl/Command while Shift remains held, and 240px `Shift+ArrowUp/Down` preview scrolling in [tests/runtime/keyboardEvent.test.ts](../../../tests/runtime/keyboardEvent.test.ts#L1) and [tests/runtime/action.test.ts](../../../tests/runtime/action.test.ts#L1).
- UI test verifies hover target state, keyboard suspension, real mousemove recovery, explicit Shift source, and normal hover preference gates in [tests/ui/mqttPage.test.ts](../../../tests/ui/mqttPage.test.ts#L240).
- UI test verifies the fixed preview layer owns wheel handling and continues to synchronize preview payload scroll through `mqtt.preview.scroll.set` in [tests/ui/mqttPage.test.ts](../../../tests/ui/mqttPage.test.ts#L1).

## Manual Smoke

- Pending: hover row then hold Shift while publish/editor input has focus.
- Pending: disable normal hover preview, verify normal hover does not open and Shift+hover still opens.
- Pending: hold Shift, use `↑/↓` to change highlight, verify preview follows highlight.
- Pending: move pointer after keyboard navigation, verify preview returns to hover target.
- Pending: verify pure Shift opens preview, then pressing Ctrl/Command while Shift remains held closes or suppresses the preview.
- Pending: verify mouse wheel over the preview scrolls payload content without scrolling the underlying message list.
- Pending: verify `Shift+ArrowUp/Down` fast-scrolls preview content.
