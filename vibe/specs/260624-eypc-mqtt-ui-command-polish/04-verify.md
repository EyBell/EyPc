# MQTT 三栏 UI 与 Command-Soul 优化验证记录

> Superseded: 当前有效验证记录迁移到 [../260624-eypc-mqtt-record-mode-consolidation/04-verify.md](../260624-eypc-mqtt-record-mode-consolidation/04-verify.md#L1)。本文保留旧实现的历史验证。

## 待验证命令

```bash
pnpm exec vitest run tests/runtime/keybinding.test.ts tests/runtime/action.test.ts tests/ui/mqttPage.test.ts tests/ui/searchShortcutHints.test.ts
pnpm run typecheck
pnpm run build
python3 /Users/gdkmjd/work/czz/CzzProj/CodeNote/AiRef/VibePractice/Vibe_Rules/scripts/audit_code_links.py --root /Users/gdkmjd/work/czzWork/EyBell/EyPc vibe/specs/260624-eypc-mqtt-ui-command-polish/01-spec.md vibe/specs/260624-eypc-mqtt-ui-command-polish/02-plan.md vibe/specs/260624-eypc-mqtt-ui-command-polish/04-verify.md vibe/specs/PROJECT_STATUS.md vibe/knowledge/ARCHITECTURE.md vibe/knowledge/technical-details.md vibe/knowledge/developer-soul.md
```

## Verification Results

- 2026-06-24 RED: `pnpm exec vitest run tests/runtime/keybinding.test.ts tests/runtime/action.test.ts tests/ui/mqttPage.test.ts tests/ui/searchShortcutHints.test.ts` failed as expected on missing `mqttMessageStats`, MQTT pane shortcuts, and page favorite/preview markers.
- 2026-06-24 PASS: `pnpm exec vitest run tests/runtime/keybinding.test.ts tests/runtime/action.test.ts` passed.
- 2026-06-24 PASS: `pnpm exec vitest run tests/ui/mqttPage.test.ts tests/ui/searchShortcutHints.test.ts` passed.
- 2026-06-24 PASS: `pnpm exec vitest run tests/runtime/keybinding.test.ts tests/runtime/action.test.ts tests/ui/mqttPage.test.ts tests/ui/searchShortcutHints.test.ts` passed: `4 files / 103 tests`.
- 2026-06-24 PASS: `pnpm run typecheck` passed.
- 2026-06-24 PASS: code link audit passed for task docs, `PROJECT_STATUS.md`, architecture, technical details, and developer-soul.
- 2026-06-24 PASS: `pnpm run build` passed, including `vue-tsc --noEmit`, Vite production build, uTools runtime asset preparation, and `validate:utools`.
- 2026-06-24 PASS: `pnpm run test` passed: `26 files / 204 tests`.
- 2026-06-24 RED: supplemental `pnpm exec vitest run tests/runtime/keybinding.test.ts tests/runtime/action.test.ts tests/ui/mqttPage.test.ts` failed as expected on missing `Ctrl+I` preview binding, no-arg preview dispatch, and missing config drawer DOM/CSS markers.
- 2026-06-24 PASS: supplemental `pnpm exec vitest run tests/runtime/keybinding.test.ts tests/runtime/action.test.ts tests/ui/mqttPage.test.ts` passed: `3 files / 98 tests`.
- 2026-06-24 PASS: supplemental `pnpm exec vitest run tests/runtime/keybinding.test.ts tests/runtime/action.test.ts tests/ui/mqttPage.test.ts tests/ui/searchShortcutHints.test.ts` passed: `4 files / 103 tests`.
- 2026-06-24 PASS: supplemental `pnpm run typecheck` passed.
- 2026-06-24 PASS: supplemental `pnpm run build` passed, including `vue-tsc --noEmit`, Vite production build, uTools runtime asset preparation, and `validate:utools`.
- 2026-06-24 PASS: supplemental `pnpm run test` passed: `26 files / 204 tests`.
- 2026-06-24 RED: config-drawer regression `pnpm exec vitest run tests/runtime/action.test.ts tests/ui/mqttPage.test.ts` failed as expected on new config drafts inheriting active config defaults, config subscription editing opening `mqttSubscriptionDraft`, and missing inline config subscription DOM.
- 2026-06-24 PASS: config-drawer regression `pnpm exec vitest run tests/runtime/action.test.ts tests/ui/mqttPage.test.ts` passed: `2 files / 73 tests`.
- 2026-06-24 PASS: targeted MQTT command/UI suite `pnpm exec vitest run tests/runtime/keybinding.test.ts tests/runtime/action.test.ts tests/ui/mqttPage.test.ts tests/ui/searchShortcutHints.test.ts` passed: `4 files / 105 tests`.
- 2026-06-24 PASS: `pnpm run typecheck` passed.
- 2026-06-24 PASS: `pnpm run build` passed, including `vue-tsc --noEmit`, Vite production build, uTools runtime asset preparation, and `validate:utools`.
- 2026-06-24 PASS: `pnpm run test` passed: `26 files / 206 tests`.
- 2026-06-24 PASS: code link audit passed for task docs, `PROJECT_STATUS.md`, architecture, technical details, and developer-soul.
- 2026-06-24 RED: MQTT preview/subscription refinement `pnpm exec vitest run tests/domain/mqttPayloadPreview.test.ts tests/ui/mqttPage.test.ts tests/runtime/keybinding.test.ts tests/runtime/action.test.ts` failed as expected on missing `mqttPayloadPreview`, old preview `ArrowUp/Down` scroll bindings, and old preview DOM markers.
- 2026-06-24 PASS: MQTT preview/subscription refinement `pnpm exec vitest run tests/domain/mqttPayloadPreview.test.ts tests/ui/mqttPage.test.ts tests/runtime/keybinding.test.ts tests/runtime/action.test.ts` passed: `4 files / 102 tests`.
- 2026-06-24 PASS: `pnpm run typecheck` passed.
- 2026-06-24 PASS: `pnpm run build` passed, including `vue-tsc --noEmit`, Vite production build, uTools runtime asset preparation, and `validate:utools`.
- 2026-06-24 PASS: `pnpm run test` passed: `27 files / 208 tests`.
- 2026-06-24 PASS: code link audit passed for task docs, `PROJECT_STATUS.md`, architecture, and technical details.
- 2026-06-24 PASS: screenshot follow-up `pnpm exec vitest run tests/ui/mqttPage.test.ts` passed after fixing subscription title action icons to stay in one centered row and compressing the connection/subscription rail widths.
- 2026-06-24 PASS: screenshot follow-up `pnpm run build` passed, including `vue-tsc --noEmit`, Vite production build, uTools runtime asset preparation, and `validate:utools`.
- 2026-06-24 RED: shortcut top-layer regression `pnpm exec vitest run tests/ui/mqttPage.test.ts` failed as expected because MQTT shortcuts still rendered inline `kbd` badges without a body Teleport fixed top layer.
- 2026-06-24 PASS: shortcut top-layer regression `pnpm exec vitest run tests/ui/mqttPage.test.ts` passed after moving MQTT held-Ctrl/Cmd shortcut hints to `data-mqtt-shortcut-hint` anchors plus a body-teleported `.mqtt-shortcut-top-layer`.
- 2026-06-24 PASS: shortcut top-layer follow-up `pnpm run build` passed, including `vue-tsc --noEmit`, Vite production build, uTools runtime asset preparation, and `validate:utools`.
- 2026-06-24 RED: shortcut collision/item-menu regression `pnpm exec vitest run tests/domain/shortcutHintLayout.test.ts tests/ui/mqttPage.test.ts` failed as expected on missing `shortcutHintLayout` helper and overloaded message item inline actions.
- 2026-06-24 PASS: shortcut collision/item-menu regression `pnpm exec vitest run tests/domain/shortcutHintLayout.test.ts tests/ui/mqttPage.test.ts` passed: `2 files / 3 tests`. The helper now auto-staggers nearby hints and clamps edges, while message item inline actions are preview/more only.
- 2026-06-24 PASS: targeted runtime/UI suite `pnpm exec vitest run tests/domain/shortcutHintLayout.test.ts tests/ui/mqttPage.test.ts tests/runtime/action.test.ts` passed: `3 files / 75 tests`.
- 2026-06-24 PASS: shortcut collision/item-menu follow-up `pnpm run build` passed, including `vue-tsc --noEmit`, Vite production build, uTools runtime asset preparation, and `validate:utools`.
- 2026-06-24 PASS: full regression `pnpm run test` passed: `28 files / 210 tests`.
- 2026-06-24 RED: MQTT item focus/layout regression `pnpm exec vitest run tests/ui/mqttPage.test.ts tests/runtime/keybinding.test.ts tests/runtime/action.test.ts` failed as expected on missing `mqttLayoutPrefs`, MQTT record-list focus commands, template search focus, left/right drawer split, payload snippet, item 2/3 alignment, and workspace resizer markers.
- 2026-06-24 PASS: MQTT item focus/layout regression `pnpm exec vitest run tests/ui/mqttPage.test.ts tests/runtime/keybinding.test.ts tests/runtime/action.test.ts` passed: `3 files / 101 tests`.
- 2026-06-24 PASS: MQTT item focus/layout `pnpm run typecheck` passed.
- 2026-06-24 PASS: MQTT item focus/layout `pnpm run build` passed, including `vue-tsc --noEmit`, Vite production build, uTools runtime asset preparation, and `validate:utools`.
- 2026-06-24 PASS: MQTT item focus/layout final targeted suite `pnpm exec vitest run tests/ui/mqttPage.test.ts tests/runtime/keybinding.test.ts tests/runtime/action.test.ts` passed: `3 files / 101 tests`.
- 2026-06-24 PASS: code link audit passed for task docs, `PROJECT_STATUS.md`, architecture, technical details, and developer-soul.
- 2026-06-24 RED: MQTT SQLite/history/favorite regression `pnpm vitest run tests/domain/recordListSelection.test.ts` failed as expected before [src/domain/recordListSelection.ts](../../../src/domain/recordListSelection.ts#L1) existed.
- 2026-06-24 PASS: MQTT SQLite/storage targeted suite `pnpm vitest run tests/domain/mqtt.test.ts tests/platform/eypcPlatform.test.ts tests/platform/mqttSqlitePreload.test.ts tests/domain/recordListSelection.test.ts` passed: `4 files / 56 tests`.
- 2026-06-24 PASS: MQTT runtime targeted suite `pnpm vitest run tests/runtime/action.test.ts -t "MQTT"` passed: `1 file / 36 tests`.
- 2026-06-24 PASS: MQTT UI/storage regression suite `pnpm vitest run tests/ui/mqttPage.test.ts tests/ui/settingsLayout.test.ts tests/runtime/action.test.ts tests/platform/eypcPlatform.test.ts tests/platform/mqttSqlitePreload.test.ts tests/platform/favoriteFileBridge.test.ts tests/domain/mqtt.test.ts tests/domain/recordListSelection.test.ts` passed: `8 files / 107 tests`.
- 2026-06-24 PASS: supplemental `pnpm run typecheck` passed.
- 2026-06-24 PASS: supplemental full regression `pnpm run test` passed: `30 files / 221 tests`.
- 2026-06-24 PASS: supplemental `pnpm run build` passed, including `vue-tsc --noEmit`, Vite production build, uTools runtime asset preparation, and `validate:utools`.
- 2026-06-24 PASS: supplemental code link audit passed for task docs, `PROJECT_STATUS.md`, architecture, technical details, and developer-soul.
- 2026-06-24 PASS: final interaction guard `pnpm vitest run tests/ui/mqttPage.test.ts tests/runtime/action.test.ts tests/domain/recordListSelection.test.ts && pnpm run typecheck && pnpm run build` passed after keeping history/favorite batch delete list-scoped without toggling the record panel.
- 2026-06-24 PASS: final full regression `pnpm run test` passed: `30 files / 221 tests`.
- 2026-06-24 RED: MQTT subscription editor focus regression `pnpm run test -- tests/runtime/action.test.ts tests/runtime/keybinding.test.ts tests/ui/mqttPage.test.ts` failed as expected on missing row-level `activeItemId` and subscription focus selectors.
- 2026-06-24 PASS: MQTT subscription editor focus regression `pnpm run test -- tests/runtime/action.test.ts tests/runtime/keybinding.test.ts tests/ui/mqttPage.test.ts` passed: `30 files / 222 tests`.
- 2026-06-24 PASS: MQTT subscription editor focus `pnpm run typecheck` passed.
- 2026-06-24 PASS: MQTT subscription editor focus `pnpm run build` passed, including `vue-tsc --noEmit`, Vite production build, uTools runtime asset preparation, and `validate:utools`.
- 2026-06-24 PASS: MQTT compact information workspace suite `pnpm exec vitest run tests/ui/mqttPage.test.ts tests/runtime/action.test.ts tests/domain/recordListSelection.test.ts` passed: `3 files / 80 tests`. It covers compact command bar, visible jump chips, full-width message stream, publish command bar, two-column publish records, message delete focus recovery, and isolated template/history search plus selection.
- 2026-06-24 PASS: compact workspace full regression `pnpm run test` passed: `30 files / 222 tests`; Node emitted only the existing SQLite experimental warning.
- 2026-06-24 PASS: compact workspace `pnpm run typecheck` passed.
- 2026-06-24 PASS: compact workspace `pnpm run build` passed, including `vue-tsc --noEmit`, Vite production build, uTools runtime asset preparation, and `validate:utools`.
- 2026-06-24 PASS: Playwright smoke on existing `http://127.0.0.1:8092/` confirmed the MQTT tab renders the compact command bar, six visible jump entries, publish command bar, records section, 1920px two-column record grid, 390px no-horizontal-scroll layout, and 390px single-column record grid. Console was clean after reload.
- 2026-06-24 RED: MQTT editor caret and blank subscription regression `pnpm exec vitest run tests/runtime/action.test.ts tests/runtime/keybinding.test.ts tests/ui/mqttPage.test.ts tests/ui/searchFocusCaret.test.ts` failed as expected on appended subscription topic still being `#` and subscription focus watcher still using an array-returning source.
- 2026-06-24 PASS: MQTT editor caret and blank subscription targeted suite `pnpm exec vitest run tests/runtime/action.test.ts tests/runtime/keybinding.test.ts tests/ui/mqttPage.test.ts tests/ui/searchFocusCaret.test.ts` passed: `4 files / 104 tests`.
- 2026-06-24 PASS: MQTT editor caret and blank subscription `pnpm run typecheck` passed.
- 2026-06-24 PASS: MQTT editor caret and blank subscription `pnpm run build` passed, including `vue-tsc --noEmit`, Vite production build, uTools runtime asset preparation, and `validate:utools`.
- 2026-06-24 PASS: MQTT editor caret and blank subscription code link audit passed for `04-verify.md` and `PROJECT_STATUS.md`.
- 2026-06-24 PASS: MQTT editor caret and blank subscription full regression `pnpm run test` passed: `30 files / 222 tests`; Node emitted only the existing SQLite experimental warning.

## Manual Status

- Completed: compact MQTT information workspace visual smoke for wide and 390px narrow viewports; jump entries, command bar, publish bar, and records grid do not horizontally overflow.
- Pending: live broker smoke for message streaming, hover/`c-i` preview with real payloads, message favorite alias, context drawer actions, config drawer edits, history/favorite multi-select with persisted SQLite rows, and migration status display.
