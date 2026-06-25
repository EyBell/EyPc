# MQTT WebSocket Implementation Sync

Tool: codex

## Purpose

This document maps the current MQTT workbench behavior from product requirement to module boundary and verification evidence. Current product contracts are indexed in [PRODUCT_REQUIREMENTS.md](../PRODUCT_REQUIREMENTS.md#L1); active task history is routed from [PROJECT_STATUS.md](../PROJECT_STATUS.md#L1).

## Layer Map

| Layer | Responsibility | Code mapping |
| --- | --- | --- |
| Feature shell | Feature registration, entry routing, lazy MQTT page mount, and tab restore. | [featureRegistry.ts](../../../src/runtime/feature/featureRegistry.ts#L1), [featureRouting.ts](../../../src/runtime/feature/featureRouting.ts#L1), [App.vue](../../../src/App.vue#L1) |
| State contracts | MQTT config state, view prefs, archive shape, storage status, layout prefs, and publish records. | [types.ts](../../../src/domain/types.ts#L1) |
| Domain normalization | WebSocket endpoint parsing, config cleanup, topic colors, publish topics, archive trimming, draft history, and template operation time. | [mqtt.ts](../../../src/domain/mqtt.ts#L1) |
| Runtime | Archive loading, focus state, connection lifecycle, record projections, publish/draft actions, drawers, previews, and shortcut context. | [appRuntime.ts](../../../src/runtime/appRuntime.ts#L1) |
| Keybindings | Layered MQTT shortcuts, text-input allowlists, popover/editor ownership, and input role extraction. | [keybindingRuntime.ts](../../../src/runtime/keybinding/keybindingRuntime.ts#L1), [keyboardEvent.ts](../../../src/runtime/keyboardEvent.ts#L1) |
| Platform | Host bridge, SQLite-first archive, legacy fallback, local-only secrets, storage status, and clipboard. | [eypcPlatform.ts](../../../src/platform/eypcPlatform.ts#L1), [preload/index.js](../../../preload/index.js#L1) |
| UI | Compact MQTT workbench, record rows, config drawer, send-area draft popover, preview layer, and shortcut hints. | [MqttPage.vue](../../../src/pages/MqttPage.vue#L1), [MqttPublishRecordList.vue](../../../src/components/MqttPublishRecordList.vue#L1), [app.css](../../../src/styles/app.css#L1) |

## State Contracts

- `MqttConnectionConfig` stores endpoint, client id, username, subscriptions, aliases, colors, publish defaults, MQTT flags, reconnect settings, and `syncRecords` in [types.ts](../../../src/domain/types.ts#L1). Passwords and tokens are intentionally absent.
- `publishTopics: string[]` stores multiple default publish candidates. Normalization trims/dedupes values and mirrors the first valid value to `publishTopic` in [mqtt.ts](../../../src/domain/mqtt.ts#L1).
- `MqttState.viewPrefs` persists the last information filter and per-config topic filters. Invalid remembered topics are pruned during MQTT state normalization.
- `MqttArchiveState` stores connection snapshots, sessions/messages, publish templates, and publish draft history. Draft history is editor recovery/reuse data, not a send log.
- `MqttPublishTemplate.operatedAt` is the operation-order timestamp for template rows; older archives fall back to `updatedAt` then `createdAt`.
- Local secret storage remains separate under the platform/preload local-only bridge and is never written into archive JSON or SQLite mirrors.

## Runtime Behavior

- MQTT remains lazy: the page is lazy-loaded by [App.vue](../../../src/App.vue#L1), the archive is loaded after entering the enabled MQTT tab, and MQTT client code is dynamically imported only when connecting.
- Runtime derives ordinary message rows, publish template rows, outgoing history rows, draft-history rows, current record list state, active focus target, drawer targets, preview state, storage status, and layout/view preferences from [appRuntime.ts](../../../src/runtime/appRuntime.ts#L1).
- Ordinary message rows and outgoing history rows sort newest first by `timestamp`; draft history sorts by `updatedAt`; templates sort by `operatedAt`.
- Applying a message/template/history/draft can archive the previous publish editor content when it is meaningful and different from the replacement. Manual `Ctrl+Shift+H` saves a draft without creating an outgoing message.
- Draft-history row click only focuses. Applying requires the row apply button or `Enter`; `Ctrl+Enter` applies and sends the focused draft while keeping the popover open.
- Runtime shortcut context treats an open draft-history popover or editor as the effective MQTT command layer before trusting DOM focus, preventing stale publish-editor focus from stealing draft-history commands.
- `Escape` recovers top MQTT layers inward first: preview, draft-history editor/popover, publish options, topic dropdown, record editor/drawers, search/filter state, then page-level focus.

## Shortcut And Input Ownership

- Current MQTT defaults: `Ctrl+1/2/3` for `全/收/发`, `Ctrl+M` for `藏`, `Ctrl+H` for draft history, `Ctrl+Shift+H` for manual draft save, `Ctrl+F` for current record search, `Ctrl+P` for publish topic, `Ctrl+Shift+F` for topic dropdown, `Ctrl+Shift+S` for layout, `Ctrl+ArrowLeft` for detail, and `Ctrl+ArrowRight` for actions/options.
- Released defaults: `Ctrl+L`, `Ctrl+Shift+L`, and `Ctrl+Shift+M` do not map to MQTT draft/history commands.
- `mqtt-publish-editor` keeps native arrows/Delete/Backspace while allowing command-owned save/send/draft/options/focus shortcuts.
- `mqtt-publish-draft` owns draft-history list navigation, `Space`, `Enter`, `Ctrl+Enter`, `Ctrl+S`, `Ctrl+Left`, `Ctrl+Right`, `F2`, `Shift+F2`, `Ctrl+Delete`, `Ctrl+Backspace`, and `Escape`.
- `mqtt-publish-draft-editor` owns `Ctrl+S`, `Ctrl+Enter`, `Tab`, `Shift+Tab`, and `Escape` for the alias/detail modal.
- `mqtt-topic-filter` and `mqtt-publish-options` are transient layers with their own navigation and close behavior.
- `mqtt-config-subscription-editor` and `mqtt-config-publish-editor` own same-field row movement and row deletion while plain text deletion remains native.

## UI Surface

- The MQTT page renders a compact workbench with connection rail, subscription rail, and message/publish workspace in [MqttPage.vue](../../../src/pages/MqttPage.vue#L1).
- The top command bar owns connection status, topic filter dropdown, current-list search, `全/收/发/藏`, and layout controls. Template/history lists no longer carry their own header search.
- Message/template/history rows share fixed-height row behavior and payload snippets. Topic visuals use subscription alias/color when available.
- The config drawer header owns the assembled endpoint preview. Endpoint fields are compact, subscriptions include alias/topic/color, publish topic candidates are editable rows, and bottom MQTT flags live in a compact options panel.
- The send toolbar owns the draft-history button/popover. The visible star/template-save button is removed; publish editor `Ctrl+S` remains the save-template command.
- Pure Shift preview is an immediate readonly overlay for valid rows, independent of ordinary hover settings. `Ctrl/Command+Shift` suppresses Shift preview so `c-s-*` shortcuts remain clean.

## Verification Evidence

| Area | Evidence |
| --- | --- |
| Base MQTT storage, connection, archive, and lazy-load behavior | [04-verify.md](04-verify.md#L1) |
| Record interaction, top search, colors, and template save/favorite semantics | [record interaction verify](../260624-eypc-mqtt-record-interaction-polish/04-verify.md#L1) |
| Focus commands, topic dropdown, and publish options | [focus command verify](../260625-eypc-mqtt-focus-command-refinement/04-verify.md#L1) |
| View prefs and publish draft history | [focus state verify](../260625-eypc-mqtt-focus-state-draft-history/04-verify.md#L1) |
| Draft popover preview/direct send | [draft popover verify](../260625-eypc-mqtt-draft-popover-preview-send/04-verify.md#L1) |
| Shift preview ownership and wheel/keyboard scroll | [Shift preview verify](../260625-eypc-mqtt-shift-hover-preview/04-verify.md#L1) |
| Record time ordering and `operatedAt` | [record time verify](../260625-eypc-mqtt-record-time-order/04-verify.md#L1) |
| Compact config drawer and `publishTopics` | [config editor verify](../260625-eypc-mqtt-config-editor-ui/04-verify.md#L1) |
| Managed editor row shortcuts | [editor row shortcuts verify](../260625-eypc-mqtt-editor-row-shortcuts/04-verify.md#L1) |

## Boundaries

- No current MQTT documentation task changes broker protocol behavior, external MQTT traffic, uTools manifest window size, or local-only secret rules.
- `syncRecords=false` remains a user-facing sync/privacy preference; it is not a local durability kill switch.
- `preload/index.js` is the source-of-truth preload implementation. Generated public preload artifacts should not be cited as authoritative logic unless packaging output is the subject.
