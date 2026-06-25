# EyPc Technical Details

Tool: codex

## File Favorites Runtime

- Last verified: 2026-06-23.
- Runtime boundary: favorites open/reveal/copy stays behind [preload/index.js](../../preload/index.js#L1), [src/platform/eypcPlatform.ts](../../src/platform/eypcPlatform.ts#L1), and [src/runtime/appRuntime.ts](../../src/runtime/appRuntime.ts#L1); UI pages dispatch action ids instead of shelling out.
- macOS open/reveal uses native `/usr/bin/open` fallback through preload, then falls back to uTools shell APIs when native reveal fails.
- uTools preload packaging keeps the root package ESM while [public/package.json](../../public/package.json#L1) declares a local CommonJS scope copied to `dist`.
- Quick favorite mode initializes a visible target focus so empty-search `Enter` has a target.
- Regression coverage: [tests/platform/favoriteFileBridge.test.ts](../../tests/platform/favoriteFileBridge.test.ts#L1), [tests/runtime/action.test.ts](../../tests/runtime/action.test.ts#L1), and [tests/ui/searchShortcutHints.test.ts](../../tests/ui/searchShortcutHints.test.ts#L1).
- Update trigger: change this record when favorites bridge methods, preload packaging, quick-mode focus initialization, or favorite search hint propagation changes.

## Documentation Sync

- Last verified: 2026-06-25.
- Current process hub: [../specs/PROJECT_STATUS.md](../specs/PROJECT_STATUS.md#L1).
- Current product requirements: [../specs/PRODUCT_REQUIREMENTS.md](../specs/PRODUCT_REQUIREMENTS.md#L1).
- Current MQTT implementation sync: [../specs/2606231645-eypc-mqtt-websocket-tab/06-sync-doc.md](../specs/2606231645-eypc-mqtt-websocket-tab/06-sync-doc.md#L1).
- Durable architecture facts live in [ARCHITECTURE.md](ARCHITECTURE.md#L1); repeated wrong paths live in [error-memory.md](error-memory.md#L1); interaction taste lives in [developer-soul.md](developer-soul.md#L1).

## MQTT State And Storage

- Last verified: 2026-06-25.
- Source of truth: [../specs/PRODUCT_REQUIREMENTS.md](../specs/PRODUCT_REQUIREMENTS.md#L1) and [../specs/2606231645-eypc-mqtt-websocket-tab/06-sync-doc.md](../specs/2606231645-eypc-mqtt-websocket-tab/06-sync-doc.md#L1).
- Persisted config keeps subscriptions, aliases, colors, publish defaults, connection flags, layout prefs, and `syncRecords` in [src/domain/types.ts](../../src/domain/types.ts#L1). Password/token values stay outside app state and archive data.
- `MqttConnectionConfig.publishTopics` normalizes multiple default publish topics and mirrors the first value to `publishTopic` through [src/domain/mqtt.ts](../../src/domain/mqtt.ts#L1).
- `MqttState.viewPrefs` persists `全/收/发/藏` and valid topic filters per connection config. Invalid topics are pruned during normalization.
- `MqttArchiveState.publishDraftHistory` stores overwritten/manual drafts only. It is local recovery/reuse data and must not duplicate outgoing send records.
- SQLite-first archive durability is implemented through [preload/index.js](../../preload/index.js#L1) and surfaced by [src/platform/eypcPlatform.ts](../../src/platform/eypcPlatform.ts#L1). Legacy archive import remains additive and keeps old data as rollback backup.

## MQTT Workbench Runtime

- Runtime source: [src/runtime/appRuntime.ts](../../src/runtime/appRuntime.ts#L1).
- Runtime projects active pane, active record list, record search, template/history rows, draft-history rows, focus target, drawer targets, preview state, storage status, layout prefs, and view prefs.
- Ordinary messages and outgoing history sort newest first by `timestamp`; publish draft history sorts by `updatedAt`; templates sort by `MqttPublishTemplate.operatedAt` with `updatedAt` / `createdAt` fallback.
- Template operation time updates on save/edit/rename/apply/direct-send/repeat-send and does not update on focus, preview, detail, or menu open.
- Publish editor replacement archives the previous meaningful draft before applying a message/template/history/draft when the replacement differs. Manual draft save is `Ctrl+Shift+H`.
- Runtime shortcut context must treat open draft-history popovers/editors as command-owned layers before trusting DOM focus. This prevents stale `mqtt-publish-editor` focus from stealing `Space`, drawer, edit, or delete commands.

## MQTT Shortcut And Input Layers

- Keybinding source: [src/runtime/keybinding/keybindingRuntime.ts](../../src/runtime/keybinding/keybindingRuntime.ts#L1); DOM role extraction source: [src/runtime/keyboardEvent.ts](../../src/runtime/keyboardEvent.ts#L1).
- Current defaults: `Ctrl+1/2/3` for `全/收/发`, `Ctrl+M` for `藏`, `Ctrl+H` for draft history, `Ctrl+Shift+H` for manual draft save, `Ctrl+F` for record search, `Ctrl+Shift+F` for topic dropdown, `Ctrl+P` for publish topic, and `Ctrl+Shift+S` for layout.
- Released defaults: `Ctrl+L`, `Ctrl+Shift+L`, and `Ctrl+Shift+M` are intentionally unbound for MQTT draft/history behavior.
- Input roles: `mqtt-publish-editor`, `mqtt-publish-draft`, `mqtt-publish-draft-editor`, `mqtt-topic-filter`, `mqtt-publish-options`, `mqtt-config-subscription-editor`, and `mqtt-config-publish-editor`.
- Draft-history focus owns `Space`, `Enter`, `Ctrl+Enter`, `Ctrl+S`, `Ctrl+Left`, `Ctrl+Right`, `F2`, `Shift+F2`, `Ctrl+Delete`, `Ctrl+Backspace`, and `Escape`; draft editor modes own `Ctrl+S` / `Ctrl+Enter` / `Tab` / `Shift+Tab` / `Escape`.
- Managed subscription/config/publish-topic editor rows use `ArrowUp` / `ArrowDown` for same-field row movement and `Ctrl+Delete` / `Ctrl+Backspace` for row deletion while plain text deletion remains native.

## MQTT UI And Preview

- UI source: [src/pages/MqttPage.vue](../../src/pages/MqttPage.vue#L1), [src/components/MqttPublishRecordList.vue](../../src/components/MqttPublishRecordList.vue#L1), and [src/styles/app.css](../../src/styles/app.css#L1).
- The top MQTT command bar owns connection status, topic filter, current-list search, `全/收/发/藏`, and layout controls. Template/history lists do not carry separate headers.
- The config drawer owns endpoint preview, compact endpoint fields, subscription alias/topic/color rows, publish topic candidate rows, and compact connection options.
- The send toolbar owns draft-history access. The visible star/template-save button is removed; publish editor `Ctrl+S` is the save-template path.
- Shift preview is pure-Shift only. `Ctrl/Command+Shift` suppresses preview for `c-s-*` shortcuts. Draft-history preview is allowed only for Shift-sourced preview.
- Payload previews use tokenized text segments from [src/domain/mqttPayloadPreview.ts](../../src/domain/mqttPayloadPreview.ts#L1) without `v-html`.

## MQTT Verification Map

- Base MQTT storage and lazy-load: [../specs/2606231645-eypc-mqtt-websocket-tab/04-verify.md](../specs/2606231645-eypc-mqtt-websocket-tab/04-verify.md#L1).
- Record interaction polish: [../specs/260624-eypc-mqtt-record-interaction-polish/04-verify.md](../specs/260624-eypc-mqtt-record-interaction-polish/04-verify.md#L1).
- Focus commands: [../specs/260625-eypc-mqtt-focus-command-refinement/04-verify.md](../specs/260625-eypc-mqtt-focus-command-refinement/04-verify.md#L1).
- Focus state and draft history: [../specs/260625-eypc-mqtt-focus-state-draft-history/04-verify.md](../specs/260625-eypc-mqtt-focus-state-draft-history/04-verify.md#L1).
- Draft popover preview/send: [../specs/260625-eypc-mqtt-draft-popover-preview-send/04-verify.md](../specs/260625-eypc-mqtt-draft-popover-preview-send/04-verify.md#L1).
- Shift preview: [../specs/260625-eypc-mqtt-shift-hover-preview/04-verify.md](../specs/260625-eypc-mqtt-shift-hover-preview/04-verify.md#L1).
- Record time ordering: [../specs/260625-eypc-mqtt-record-time-order/04-verify.md](../specs/260625-eypc-mqtt-record-time-order/04-verify.md#L1).
- Config editor UI: [../specs/260625-eypc-mqtt-config-editor-ui/04-verify.md](../specs/260625-eypc-mqtt-config-editor-ui/04-verify.md#L1).
- Editor row shortcuts: [../specs/260625-eypc-mqtt-editor-row-shortcuts/04-verify.md](../specs/260625-eypc-mqtt-editor-row-shortcuts/04-verify.md#L1).

## Update Triggers

- Update MQTT memory when a state/archive field, shortcut default, input role, storage bridge, preview target model, config editor contract, or verification gate changes.
- Update error memory when a host shortcut conflict, stale DOM focus problem, archive migration trap, or preload packaging trap recurs.
