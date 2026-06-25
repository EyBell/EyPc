# MQTT Focus State And Draft History Verification

Tool: codex

## RED

- Command: `pnpm exec vitest run tests/domain/mqtt.test.ts tests/runtime/keyboardEvent.test.ts tests/runtime/keybinding.test.ts tests/runtime/action.test.ts tests/ui/mqttPage.test.ts tests/platform/eypcPlatform.test.ts tests/platform/mqttSqlitePreload.test.ts`.
- Initial result: failed as expected before implementation because `viewPrefs`, `publishDraftHistory`, `mqtt-publish-draft`, `Ctrl+L`, and send-area draft UI were not implemented.
- 2026-06-25 edit refinement RED: `pnpm vitest run tests/domain/mqtt.test.ts tests/runtime/action.test.ts tests/runtime/keybinding.test.ts tests/runtime/keyboardEvent.test.ts tests/ui/mqttPage.test.ts`.
- Result: failed as expected before the edit refinement because `mqtt.publish.draft.edit`, `mqtt-publish-draft-editor`, DOM role mapping, and the edit modal UI did not exist; static UI also still found row-click apply and `window.prompt`.
- 2026-06-25 focus/multi-select RED: `pnpm vitest run tests/runtime/keybinding.test.ts`; `pnpm vitest run tests/runtime/action.test.ts`; `pnpm vitest run tests/ui/mqttPage.test.ts`.
- Result: failed as expected before implementation because draft-history `Space` resolved to global `list.toggleSelection`, publish-editor focus kept `mqttSelectedRecord`, `Ctrl+Left`/`Ctrl+Right` could not target a draft-history row, `F2` still meant old topic/payload editing, and the page lacked draft-history multi-select/alias UI.
- 2026-06-25 shortcut/naming correction RED: `pnpm exec vitest run tests/runtime/keybinding.test.ts --testNamePattern "MQTT"`; `pnpm exec vitest run tests/runtime/action.test.ts --testNamePattern "publish draft history|owns MQTT pane navigation"`; `pnpm exec vitest run tests/runtime/keyboardEvent.test.ts`; `pnpm exec vitest run tests/ui/mqttPage.test.ts`.
- Result: failed as expected before the correction because old `Ctrl+H` / `Ctrl+Shift+H` bindings and `mqtt.publish.history` / `mqtt-publish-history` naming still existed, `Ctrl+Shift+L` did not save the draft, and the page still rendered the history icon.
- 2026-06-25 `Ctrl+L` stale-focus RED: `pnpm exec vitest run tests/runtime/action.test.ts --testNamePattern "archives overwritten MQTT publish drafts"`.
- Result: failed as expected before the focus-layer correction because `mqttPublishDraftHistoryOpen=true` but a stale `activeInputRole='mqtt-publish-editor'` made `Space` resolve to `null` instead of `mqtt.publish.draft.toggleSelect`.
- 2026-06-25 draft-popover outside-click RED: `pnpm exec vitest run tests/ui/mqttPage.test.ts`.
- Result: failed as expected before implementation because [../../../src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L1) did not expose `handlePublishDraftHistoryOutsidePointerdown`, document `pointerdown` registration, `.mqtt-publish-draft-anchor` filtering, or `mqtt.publish.draft.close` dispatch for outside clicks.
- 2026-06-25 `Ctrl+H` remap RED: `pnpm exec vitest run tests/runtime/keybinding.test.ts --testNamePattern "MQTT"`; `pnpm exec vitest run tests/runtime/action.test.ts --testNamePattern "archives overwritten MQTT publish drafts|keeps publish draft history highlight stable|edits MQTT publish draft"`; `pnpm exec vitest run tests/ui/mqttPage.test.ts`.
- Result: failed as expected before implementation because default bindings still mapped draft toggle/save to `Ctrl+L` / `Ctrl+Shift+L`, `Ctrl+H` / `Ctrl+Shift+H` resolved to `null`, and [../../../src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L1) still used `c-l` / `c-s-l` tooltip fallbacks.

## PASS

- Targeted MQTT regression: `pnpm vitest run tests/domain/mqtt.test.ts tests/runtime/action.test.ts tests/runtime/keybinding.test.ts tests/runtime/keyboardEvent.test.ts tests/ui/mqttPage.test.ts`.
- Result: 5 files passed, 129 tests passed.
- 2026-06-25 focus/multi-select targeted regression: `pnpm vitest run tests/runtime/keybinding.test.ts`; `pnpm vitest run tests/runtime/action.test.ts`; `pnpm vitest run tests/ui/mqttPage.test.ts`.
- Result: 3 files passed, 111 tests passed. Covered draft-history `Space`, publish-editor Space isolation, `Ctrl+L` focus, `Ctrl+Left`/`Ctrl+Right` draft-history drawers, `F2` title/note alias edit, and `Shift+F2` topic/payload edit.
- Typecheck: `pnpm run typecheck`.
- Result: passed after the shortcut/naming correction.
- Full test: `pnpm run test`.
- Result: 30 files passed, 240 tests passed.
- Build: `pnpm run build`.
- Result: passed; Vite build, preload prepare, and uTools runtime validation completed.
- Browser smoke: bundled Playwright runtime with system Chrome against `http://127.0.0.1:4174/`.
- Result: passed. Seeded browser storage with one MQTT config, one message, and two draft-history rows; `Ctrl+L` focused the popover; `Space` selected only the draft-history row and did not select message rows; `Ctrl+Left` opened draft detail; `Ctrl+Right` opened draft actions; `F2` opened title/note alias edit and saved with `Ctrl+S`; `Shift+F2` opened topic/payload detail edit and saved with `Ctrl+S`; `Enter` applied the focused edited draft; desktop `1280x720` and narrow `390x760` had no horizontal overflow.
- Screenshots: [../../../output/playwright/mqtt-draft-history-focus-multiselect-desktop.png](../../../output/playwright/mqtt-draft-history-focus-multiselect-desktop.png), [../../../output/playwright/mqtt-draft-history-focus-multiselect-narrow.png](../../../output/playwright/mqtt-draft-history-focus-multiselect-narrow.png).
- 2026-06-25 shortcut/naming correction targeted regression: `pnpm exec vitest run tests/runtime/keybinding.test.ts --testNamePattern "MQTT"`; `pnpm exec vitest run tests/runtime/action.test.ts --testNamePattern "publish draft history|owns MQTT pane navigation"`; `pnpm exec vitest run tests/runtime/keyboardEvent.test.ts`; `pnpm exec vitest run tests/ui/mqttPage.test.ts`.
- Result: passed. Covered `Ctrl+L` draft toggle, `Ctrl+Shift+L` manual draft save, old H combinations unbound, log drawer action callable without default `Ctrl+L`, `mqtt-publish-draft` / `mqtt-publish-draft-editor` DOM roles, and the draft icon.
- 2026-06-25 `Ctrl+L` stale-focus targeted regression: `pnpm exec vitest run tests/runtime/action.test.ts --testNamePattern "archives overwritten MQTT publish drafts"`; `pnpm exec vitest run tests/runtime/action.test.ts tests/runtime/keybinding.test.ts tests/runtime/keyboardEvent.test.ts --testNamePattern "MQTT|draft|publish|keyboard"`; `pnpm exec vitest run tests/ui/mqttPage.test.ts`.
- Result: passed. Covered stale DOM focus after `Ctrl+L`: when the draft popover is open, runtime shortcut context treats `mqtt-publish-draft` / `mqtt-publish-draft-editor` as the active command layer even if the browser active element still reports `mqtt-publish-editor`, so `Space` toggles draft-history multi-select instead of leaking to publish text input or message selection.
- 2026-06-25 stale-focus browser smoke: bundled Playwright runtime with system Chrome against `http://127.0.0.1:8092/`.
- Result: passed. Seeded one MQTT config, saved a draft with `Ctrl+Shift+L`, opened the popover with `Ctrl+L`, forced DOM focus back to payload, then pressed `Space`; payload stayed unchanged, draft popover stayed open, and one draft row became selected. Only observed console noise was a 404 resource request.
- 2026-06-25 project gates: `pnpm run typecheck`; `pnpm run test`; `pnpm run build`.
- Result: passed. Full test result was 30 files passed, 243 tests passed; build completed Vite, `prepare-utools-runtime`, and `validate:utools`.
- 2026-06-25 draft-popover outside-click targeted regression: `pnpm exec vitest run tests/ui/mqttPage.test.ts`; `pnpm exec vitest run tests/runtime/action.test.ts --testNamePattern "archives overwritten MQTT publish drafts"`; `pnpm exec vitest run tests/runtime/keybinding.test.ts tests/runtime/keyboardEvent.test.ts`.
- Result: passed. Covered document-level capture `pointerdown` registration, `.mqtt-publish-draft-anchor` internal-click guard, outside-click `mqtt.publish.draft.close`, stale `Ctrl+L` focus ownership, MQTT keybinding context, and DOM role extraction.
- 2026-06-25 draft-popover outside-click browser smoke: bundled Playwright runtime with system Chrome against `http://127.0.0.1:8092/`.
- Result: passed. Seeded one MQTT config and one draft-history row in browser localStorage, opened the popover with `Ctrl+L`, clicked inside `.mqtt-publish-draft-popover` and the popover stayed visible, then clicked `.mqtt-payload-input` and the popover detached.
- 2026-06-25 draft-popover outside-click project gates: `pnpm run test`; `pnpm run typecheck`; `pnpm run build`.
- Result: passed. Full test result was 30 files passed, 243 tests passed; build completed Vite, `prepare-utools-runtime`, and `validate:utools`.
- 2026-06-25 `Ctrl+H` remap targeted regression: `pnpm exec vitest run tests/runtime/keybinding.test.ts --testNamePattern "MQTT"`; `pnpm exec vitest run tests/runtime/action.test.ts --testNamePattern "archives overwritten MQTT publish drafts|keeps publish draft history highlight stable|edits MQTT publish draft"`; `pnpm exec vitest run tests/ui/mqttPage.test.ts`.
- Result: passed. Covered default `Ctrl+H` draft toggle, default `Ctrl+Shift+H` manual draft save, released `Ctrl+L` / `Ctrl+Shift+L`, publish-editor text-input allowlist, shortcut rows, and UI tooltip fallback `c-h` / `c-s-h`.
- 2026-06-25 `Ctrl+H` remap browser smoke: bundled Playwright runtime with system Chrome against `http://127.0.0.1:8092/`.
- Result: passed. Seeded one MQTT config, filled publish topic/payload, `Ctrl+Shift+H` saved a manual draft into browser archive, `Ctrl+H` opened the draft popover, `Escape` closed it, and `Ctrl+L` did not reopen it.
- 2026-06-25 `Ctrl+H` remap project gates: `pnpm run test`; `pnpm run typecheck`; `pnpm run build`.
- Result: passed. Full test result was 30 files passed, 243 tests passed; build completed Vite, `prepare-utools-runtime`, and `validate:utools`.
- Markdown link audit: `python3 /Users/gdkmjd/work/czz/CzzProj/CodeNote/AiRef/VibePractice/Vibe_Rules/scripts/audit_code_links.py --root /Users/gdkmjd/work/czzWork/EyBell/EyPc ...`.
- Result: passed after current document update.

## Notes

- A narrow-window smoke initially found the popover could overflow left and below the viewport at `390px` width. Fixed by making the popover a fixed bottom viewport layer under the mobile breakpoint in [../../../src/styles/app.css](../../../src/styles/app.css#L1).
- Local Playwright cache did not have its bundled Chromium executable, so the browser smoke used `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` without adding project dependencies.
- Project dependencies do not expose the Playwright API package, so the latest browser smoke used the Codex bundled Node dependency path and system Chrome without modifying [../../../package.json](../../../package.json#L1).
- Local preview service remains available at `http://127.0.0.1:4174/` for manual inspection.
