# EyPc Error Memory

Tool: codex

## File Favorites macOS Open, Preload, And Shortcut Hints

- Date: 2026-06-23.
- Evidence: code, tests, user-reported screenshots/logs.
- Symptom: macOS favorites `打开` / `定位` appeared to do nothing; Electron reported `require() of ES Module dist/preload.js not supported`; full favorites search inputs did not show command hints.
- Wrong assumption: treating uTools shell API sync return values as proof of success, assuming copied preload code works under the root ESM package scope, and assuming App-level shortcut hint state automatically reaches every page.
- Verified root cause: [preload/index.js](../../preload/index.js#L1) needed native macOS command fallback and async success/failure; [public/package.json](../../public/package.json#L1) needed a local CommonJS scope; favorite pages needed explicit shortcut-hint propagation.
- Correct detection order: inspect the runtime artifact path from the host log, compare `public/plugin.json`, `dist/plugin.json`, and local package scopes, then compare working page hint propagation with the broken page.
- Prevention rule: after preload or manifest changes, run `node scripts/prepare-utools-runtime.mjs` and `pnpm run validate:utools`; after command hint changes, add UI regression coverage.
- Latest correct scheme: [technical-details.md](technical-details.md#L1) and [ARCHITECTURE.md](ARCHITECTURE.md#L1).

## MQTT Draft History Shortcut Host Conflict

- Date: 2026-06-25.
- Evidence: user report, RED/PASS regressions, browser smoke, full tests, build.
- Symptom: `Ctrl+L` opening MQTT draft history was unreliable in the uTools host. A stale-focus fix protected follow-up keys, but the host-level shortcut conflict still made the default unsuitable.
- Wrong assumption: relying on browser DOM focus as the only keyboard layer source immediately after opening a command popover, then trying to keep `Ctrl+L` as the default despite host focus behavior.
- Verified root cause: shortcut context could still see `activeInputRole='mqtt-publish-editor'` while `mqttPublishDraftHistoryOpen=true`, so draft-layer commands such as `Space` could resolve incorrectly.
- Correct scheme: runtime shortcut context treats `mqttPublishDraftHistoryOpen` and `mqttPublishDraftHistoryEditDraft` as command-owned layers before consulting DOM focus. MQTT draft history defaults are `Ctrl+H` and `Ctrl+Shift+H`; `Ctrl+L` and `Ctrl+Shift+L` are intentionally unbound.
- Correct detection order: reproduce in host or browser smoke, inspect runtime shortcut context before keybinding defaults, then check whether a host-reserved chord is involved.
- Prevention rule: transient command layers must be runtime-owned, not post-render DOM-focus-owned. Do not assign MQTT draft history to `Ctrl+L` by default; add stale-focus and released-shortcut regressions when adding MQTT popovers or editor layers.
- Latest correct scheme: [technical-details.md](technical-details.md#L1), [ARCHITECTURE.md](ARCHITECTURE.md#L1), and [../specs/260625-eypc-mqtt-focus-state-draft-history/04-verify.md](../specs/260625-eypc-mqtt-focus-state-draft-history/04-verify.md#L1).
