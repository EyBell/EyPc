# MQTT End-to-End SyncDoc

Tool: codex

## Current Truth

- This document maps the current MQTT implementation from feature entry to UI, runtime, storage, and tests. Durable architecture memory remains in [vibe/knowledge/ARCHITECTURE.md](../../knowledge/ARCHITECTURE.md#L44).
- MQTT is a first-class feature: it is registered and enabled by default in [src/runtime/feature/featureRegistry.ts](../../../src/runtime/feature/featureRegistry.ts#L17) and [src/runtime/feature/featureRegistry.ts](../../../src/runtime/feature/featureRegistry.ts#L25).
- The uTools entry code `eypc-mqtt` routes to the MQTT tab when enabled in [src/runtime/feature/featureRouting.ts](../../../src/runtime/feature/featureRouting.ts#L35).
- The shell lazy-loads the MQTT page in [src/App.vue](../../../src/App.vue#L17), mounts it through the MQTT slot in [src/App.vue](../../../src/App.vue#L166), and passes storage status to Settings in [src/App.vue](../../../src/App.vue#L224).
- Initial app state owns normalized MQTT state in [src/domain/state.ts](../../../src/domain/state.ts#L249), and reload normalization keeps MQTT data valid in [src/domain/state.ts](../../../src/domain/state.ts#L291).

## Top-Down Module Map

| Layer | Responsibility | Code mapping |
| --- | --- | --- |
| Feature shell | Feature registration, default enablement, entry routing, lazy page mount. | [featureRegistry.ts](../../../src/runtime/feature/featureRegistry.ts#L17), [featureRouting.ts](../../../src/runtime/feature/featureRouting.ts#L35), [App.vue](../../../src/App.vue#L17) |
| State contracts | Main MQTT config state, archive shape, storage status, layout prefs. | [types.ts](../../../src/domain/types.ts#L46), [types.ts](../../../src/domain/types.ts#L55), [types.ts](../../../src/domain/types.ts#L143), [types.ts](../../../src/domain/types.ts#L150) |
| Domain normalize | WebSocket URL parsing, config cleanup, subscription aliases, archive trimming, templates, connect options. | [mqtt.ts](../../../src/domain/mqtt.ts#L92), [mqtt.ts](../../../src/domain/mqtt.ts#L147), [mqtt.ts](../../../src/domain/mqtt.ts#L324), [mqtt.ts](../../../src/domain/mqtt.ts#L496) |
| Runtime | Archive loading, drafts, connection lifecycle, actions, panes, drawers, preview, record selection. | [appRuntime.ts](../../../src/runtime/appRuntime.ts#L120), [appRuntime.ts](../../../src/runtime/appRuntime.ts#L591), [appRuntime.ts](../../../src/runtime/appRuntime.ts#L1275), [appRuntime.ts](../../../src/runtime/appRuntime.ts#L3962) |
| Platform | Host bridge, SQLite-first archive, legacy fallback, local-only secrets, storage status. | [eypcPlatform.ts](../../../src/platform/eypcPlatform.ts#L32), [preload/index.js](../../../preload/index.js#L235), [preload/index.js](../../../preload/index.js#L362), [preload/index.js](../../../preload/index.js#L609) |
| UI | Workbench grid, rails, config drawer, publish workspace, record lists, modals, drawers, preview, shortcut hints. | [MqttPage.vue](../../../src/pages/MqttPage.vue#L1105), [MqttPublishRecordList.vue](../../../src/components/MqttPublishRecordList.vue#L78), [app.css](../../../src/styles/app.css#L2482) |
| Verification | Domain, runtime, keybinding, platform, and static UI behavior tests. | [mqtt.test.ts](../../../tests/domain/mqtt.test.ts#L28), [action.test.ts](../../../tests/runtime/action.test.ts#L1192), [mqttPage.test.ts](../../../tests/ui/mqttPage.test.ts#L5) |

## State And Storage Contracts

- `MqttConnectionConfig` is the persisted connection contract; it stores endpoint, auth username, subscriptions, aliases, publish defaults, MQTT options, `syncRecords`, and timestamps in [src/domain/types.ts](../../../src/domain/types.ts#L55). Passwords and tokens are intentionally absent.
- `createMqttConnectionConfig` trims strings, removes duplicate subscriptions, prunes orphan aliases, and preserves `syncRecords` as a user privacy/sync preference in [src/domain/mqtt.ts](../../../src/domain/mqtt.ts#L147).
- `MqttState` stores connection configs, active config id, and MQTT layout preferences in [src/domain/types.ts](../../../src/domain/types.ts#L79). The app-level normalizer calls `normalizeMqttState` in [src/domain/mqtt.ts](../../../src/domain/mqtt.ts#L178).
- `MqttArchiveState` stores connection snapshots, sessions, messages, and publish templates in [src/domain/types.ts](../../../src/domain/types.ts#L143); archive normalization and retention are centralized in [src/domain/mqtt.ts](../../../src/domain/mqtt.ts#L324).
- `MqttStorageStatus` reports SQLite availability, db path, fallback mode, legacy migration, and last error in [src/domain/types.ts](../../../src/domain/types.ts#L150). Runtime exposes the current status in snapshots through [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L4255).
- Host storage prefers SQLite. The preload layer creates MQTT archive tables in [preload/index.js](../../../preload/index.js#L235), reads archive through [preload/index.js](../../../preload/index.js#L381), writes archive through [preload/index.js](../../../preload/index.js#L393), and exposes bridge methods through [preload/index.js](../../../preload/index.js#L609).
- Legacy archive migration is additive: when SQLite is available, legacy `dbStorage` archive data is imported into SQLite without deleting the old value, matching the preload verification in [tests/platform/mqttSqlitePreload.test.ts](../../../tests/platform/mqttSqlitePreload.test.ts#L92).
- Secrets are local-only. The platform bridge exposes `getMqttSecrets` and `setMqttSecrets` in [src/platform/eypcPlatform.ts](../../../src/platform/eypcPlatform.ts#L33), and preload exposes the same local secret bridge in [preload/index.js](../../../preload/index.js#L612).
- `syncRecords=false` does not disable local durability: runtime still appends incoming/outgoing records through [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L1527) and publish appends outgoing records through [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L2235).

## Runtime Flow

- MQTT archive loads lazily when the MQTT tab becomes active in [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L591), then `ensureMqttArchiveLoaded` reads and normalizes platform archive state in [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L1275).
- The runtime snapshot is the UI contract: it includes archive state, storage status, panes, searches, drafts, drawers, preview, subscription rows, record-list states, and logs from [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L71) through [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L106).
- Config editing starts with parsed URL and local secret hydration in [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L1374). Saving config normalizes endpoint fields, persists local secrets separately, updates archive snapshots, and writes app state in [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L1470).
- Connection lifecycle is isolated to MQTT runtime: connect dynamically loads MQTT client logic in [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L2163), subscribes configured topics, and appends incoming messages in [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L2198).
- Subscription rows are projected from active config with alias, display name, unread, active, selected, and focused state in [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L644). Dedicated subscription editing updates only subscriptions and aliases through [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L764).
- Publish templates and history are independent record lists: runtime derives template rows in [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L958), history rows in [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L967), and shared record-list focus/selection state in [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L1068).
- Record mutations stay inside archive helpers: messages append through [src/domain/mqtt.ts](../../../src/domain/mqtt.ts#L361), message/session metadata changes through [src/domain/mqtt.ts](../../../src/domain/mqtt.ts#L382), and publish templates save through [src/domain/mqtt.ts](../../../src/domain/mqtt.ts#L442).
- Preview and drawer layers are runtime-owned: drawer items are built from current selected record/context in [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L1961), preview commands are registered in [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L4033), and Escape unwinds MQTT top layers in [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L4584).

## Keybinding And Input Ownership

- DOM `data-role` is normalized into runtime input roles before keybinding resolution; MQTT subscription editor and config editor roles are detected in [src/runtime/keyboardEvent.ts](../../../src/runtime/keyboardEvent.ts#L24) and [src/runtime/keyboardEvent.ts](../../../src/runtime/keyboardEvent.ts#L31).
- MQTT layer priority gives editors, drawers, preview, search, and subscription list distinct ownership in [src/runtime/keybinding/keybindingRuntime.ts](../../../src/runtime/keybinding/keybindingRuntime.ts#L152).
- Default MQTT shortcuts cover config save/cancel, subscription editor, record editor, publish, template/history focus, preview, drawer, and search in [src/runtime/keybinding/keybindingRuntime.ts](../../../src/runtime/keybinding/keybindingRuntime.ts#L326).
- Text-editing reservations block lower-layer workbench shortcuts while allowing save/cancel/field-cycle commands in [src/runtime/keybinding/keybindingRuntime.ts](../../../src/runtime/keybinding/keybindingRuntime.ts#L722). Subscription-list ownership allows Space, Enter, Delete, and related list operations in [src/runtime/keybinding/keybindingRuntime.ts](../../../src/runtime/keybinding/keybindingRuntime.ts#L732).
- Runtime action registration is the mutation boundary. Config, subscription, layout, record, publish, preview, drawer, search, and detail commands are registered from [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L3962) through [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L4053).

## UI Surface Map

- The MQTT page receives snapshot props and emits runtime events; it imports domain preview helpers, shortcut hint layout, and the publish record list in [src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L1).
- The main workbench is a compact grid with connection rail, subscription rail, and message workspace in [src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L1105), styled from [src/styles/app.css](../../../src/styles/app.css#L2482).
- Connection rail and config actions live in [src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L1127). The right-side config drawer owns endpoint, password, subscriptions, QoS, reconnect, and `syncRecords` inputs in [src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L1307).
- Subscription rail keyboard/click ownership lives in [src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L1197), while the dedicated subscription modal uses stable item ids and `data-role="mqtt-subscription-editor"` from [src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L1588).
- Workspace toolbar, receive filters, record modes, layout controls, and publish-history access live in [src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L1266). Receive/send split layout and resizer are rendered in [src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L1475).
- Message stream rows expose preview, detail, and action drawer entry points in [src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L1502). The shared template/history list is implemented by [src/components/MqttPublishRecordList.vue](../../../src/components/MqttPublishRecordList.vue#L78).
- Favorite editor, record editor, log drawer, detail drawer, action drawer, and floating payload preview are rendered in [src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L1649), [src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L1685), [src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L1783), [src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L1843), [src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L1913), and [src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L1946).
- Payload preview is tokenized as JSON or plain text without HTML injection in [src/domain/mqttPayloadPreview.ts](../../../src/domain/mqttPayloadPreview.ts#L19). Top-layer shortcut hints are positioned by [src/domain/shortcutHintLayout.ts](../../../src/domain/shortcutHintLayout.ts#L88) and rendered in [src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L1977).
- Settings shows storage mode, SQLite state, db path or error, and migration state through the storage maintenance panel in [src/pages/SettingsPage.vue](../../../src/pages/SettingsPage.vue#L981).

## Verification Matrix

| Behavior | Tests |
| --- | --- |
| Config normalization removes secrets, dedupes subscriptions, preserves aliases and `syncRecords`. | [tests/domain/mqtt.test.ts](../../../tests/domain/mqtt.test.ts#L28) |
| Archive snapshots exclude secrets, message retention works, templates normalize/rename/delete/apply, topic filters match MQTT wildcards. | [tests/domain/mqtt.test.ts](../../../tests/domain/mqtt.test.ts#L171), [tests/domain/mqtt.test.ts](../../../tests/domain/mqtt.test.ts#L210), [tests/domain/mqtt.test.ts](../../../tests/domain/mqtt.test.ts#L250), [tests/domain/mqtt.test.ts](../../../tests/domain/mqtt.test.ts#L259) |
| Runtime keeps message records durable even when `syncRecords` is disabled and keeps secrets out of archive writes. | [tests/runtime/action.test.ts](../../../tests/runtime/action.test.ts#L1192) |
| Subscription filtering, deletion, dedicated editor draft, and inline config subscription editing match current runtime/UI behavior. | [tests/runtime/action.test.ts](../../../tests/runtime/action.test.ts#L1382), [tests/runtime/action.test.ts](../../../tests/runtime/action.test.ts#L1425), [tests/runtime/action.test.ts](../../../tests/runtime/action.test.ts#L1509), [tests/runtime/mqttConnectionLog.test.ts](../../../tests/runtime/mqttConnectionLog.test.ts#L275) |
| Layout, log drawer, publish templates, record-list focus, preview, detail, drawer, search targets, delete recovery, and local-only secret reload behavior stay covered. | [tests/runtime/action.test.ts](../../../tests/runtime/action.test.ts#L1586), [tests/runtime/action.test.ts](../../../tests/runtime/action.test.ts#L1880), [tests/runtime/action.test.ts](../../../tests/runtime/action.test.ts#L1967), [tests/runtime/action.test.ts](../../../tests/runtime/action.test.ts#L2109) |
| MQTT shortcut ownership and DOM role mapping cover subscription lists, editors, workbench panes, preview, and drawer layers. | [tests/runtime/keybinding.test.ts](../../../tests/runtime/keybinding.test.ts#L174), [tests/runtime/keybinding.test.ts](../../../tests/runtime/keybinding.test.ts#L201), [tests/runtime/keyboardEvent.test.ts](../../../tests/runtime/keyboardEvent.test.ts#L67) |
| Platform fallback archive, local-only secrets, SQLite archive round-trip, and legacy migration are verified. | [tests/platform/eypcPlatform.test.ts](../../../tests/platform/eypcPlatform.test.ts#L44), [tests/platform/eypcPlatform.test.ts](../../../tests/platform/eypcPlatform.test.ts#L71), [tests/platform/mqttSqlitePreload.test.ts](../../../tests/platform/mqttSqlitePreload.test.ts#L67), [tests/platform/mqttSqlitePreload.test.ts](../../../tests/platform/mqttSqlitePreload.test.ts#L92) |
| Static UI tests cover the MQTT page, CSS ownership, publish record list, preview layer, shortcut hints, and Settings storage panel. | [tests/ui/mqttPage.test.ts](../../../tests/ui/mqttPage.test.ts#L5), [tests/ui/settingsLayout.test.ts](../../../tests/ui/settingsLayout.test.ts#L114) |
| Helper tests cover payload preview tokenization and shared record-list selection/delete recovery. | [tests/domain/mqttPayloadPreview.test.ts](../../../tests/domain/mqttPayloadPreview.test.ts#L4), [tests/domain/recordListSelection.test.ts](../../../tests/domain/recordListSelection.test.ts#L10) |

## Invariants

- Passwords and tokens never enter main app state, archive snapshots, SQLite archive JSON, or publish templates; they stay behind the local secret bridge.
- `syncRecords` is not a local persistence kill switch. It is a user preference carried on connection config while local archive durability remains active.
- Runtime action dispatch is the only intended mutation boundary for MQTT UI interactions; Vue components emit events and do not mutate persisted state directly.
- Platform/preload owns storage mode and migration behavior. UI and runtime consume `MqttStorageStatus` instead of inferring host capabilities.
- [preload/index.js](../../../preload/index.js#L1) is the source-of-truth preload implementation. Generated public preload artifacts should not be cited as authoritative logic unless the build process is the subject.
