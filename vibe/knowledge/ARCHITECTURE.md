# EyPc Architecture

Tool: codex

## Product Scope

EyPc is a keyboard-first uTools plugin for local PC capability calls. Current feature areas are port process management, file/folder favorites, and MQTT over WebSocket.

## Layer Model

```text
uTools feature entry / keyboard input
  -> Interaction Runtime
  -> Keybinding Runtime
  -> Action Runtime
  -> Domain services
  -> Platform bridge / preload
  -> UI projections
  -> uTools storage / local archive
```

## Core Invariants

- Action Runtime is the only user-visible mutation entry.
- Domain functions are pure and covered by tests where behavior is non-trivial.
- Platform functions isolate uTools, shell, process, file-system, clipboard, and local storage APIs.
- UI renders projections and dispatches intents; it does not call shell, storage, MQTT, or filesystem side effects directly.
- Project interaction taste is recorded in [developer-soul.md](developer-soul.md#L1).
- Process status and task routing live in [../specs/PROJECT_STATUS.md](../specs/PROJECT_STATUS.md#L1), not in architecture memory.
- Current product contracts live in [../specs/PRODUCT_REQUIREMENTS.md](../specs/PRODUCT_REQUIREMENTS.md#L1).
- Current MQTT implementation mapping lives in [../specs/2606231645-eypc-mqtt-websocket-tab/06-sync-doc.md](../specs/2606231645-eypc-mqtt-websocket-tab/06-sync-doc.md#L1).

## Ports

- Port scan results are normalized and deduped in [src/domain/ports.ts](../../src/domain/ports.ts#L1).
- Port groups/folders are plugin metadata stored in normalized state, not filesystem or OS process objects.
- Process kill actions must stay behind runtime/platform bridges and revalidate selected PID/port ownership before side effects.
- Force kill is allowed only for explicit selected PID plus verified port match.

## File Favorites

- Favorites are plugin metadata for real file/folder paths and virtual groups.
- Removing a favorite never deletes real files from disk.
- Favorites open/reveal/copy stays behind [src/platform/eypcPlatform.ts](../../src/platform/eypcPlatform.ts#L1) and [preload/index.js](../../preload/index.js#L1).
- Quick favorite entry is search/open/reveal/copy only; management actions stay in the full favorites page.

## Feature Shell And Shortcuts

- Feature visibility/order is normalized in app state and rendered by [src/components/TabShell.vue](../../src/components/TabShell.vue#L1).
- Runtime tab switching uses dynamic visible-feature order; Settings has a fixed shortcut entry.
- Shortcut resolution is layered by context in [src/runtime/keybinding/keybindingRuntime.ts](../../src/runtime/keybinding/keybindingRuntime.ts#L1).
- Input roles are extracted centrally in [src/runtime/keyboardEvent.ts](../../src/runtime/keyboardEvent.ts#L1), then used by keybinding/runtime ownership decisions.
- `Escape` is modeled as layered recovery; `Shift+Escape` hides the uTools window through the platform bridge.

## MQTT State And Storage

- MQTT is a default-visible top-level feature declared in feature routing and lazy-loaded from [src/App.vue](../../src/App.vue#L1).
- MQTT domain contracts live in [src/domain/types.ts](../../src/domain/types.ts#L1), normalization helpers live in [src/domain/mqtt.ts](../../src/domain/mqtt.ts#L1), and connection tree projection/move helpers live in [src/domain/mqttConnectionTree.ts](../../src/domain/mqttConnectionTree.ts#L1).
- Connection configs persist endpoint, client id, username, subscriptions, aliases, colors, publish defaults, reconnect flags, `groupId`, `syncRecords`, layout prefs, and view prefs.
- MQTT connection groups are plugin metadata stored in `MqttState.connectionGroups`; they define connection hierarchy only and must not imply MQTT broker-side resources.
- Collapsed MQTT connection groups persist in `MqttLayoutPrefs.collapsedConnectionGroupIds`.
- Password/token values are excluded from persisted domain models, archives, SQLite mirrors, and publish templates; [preload/index.js](../../preload/index.js#L1) persists them only as an encrypted local userData envelope in `mqtt-secrets-local.json`, using Electron safeStorage when available and AES-256-GCM with the local-only key file `mqtt-secrets-local.key` as fallback.
- MQTT archive durability is SQLite-first through [preload/index.js](../../preload/index.js#L1), with legacy archive fallback surfaced by [src/platform/eypcPlatform.ts](../../src/platform/eypcPlatform.ts#L1).
- `syncRecords=false` is a user-facing sync/privacy preference, not a local durability kill switch.

## MQTT Runtime

- MQTT runtime state and action registration live in [src/runtime/appRuntime.ts](../../src/runtime/appRuntime.ts#L1).
- Runtime owns connection lifecycle, archive loading, record projections, focus targets, drawers, preview state, draft-history state, layout prefs, and view prefs.
- Runtime owns MQTT connection tree projection, group focus/edit/rename/move-parent/delete/collapse/expand, and drag/drop moves. Group focus must not switch the active MQTT connection config.
- MQTT shortcut context carries `mqttTargetKind` so connection-pane edit shortcuts can route config rows and group rows through distinct action ids without duplicate ambiguous bindings.
- `MqttState.viewPrefs` persists the last `全/收/发/藏` filter and valid per-connection topic filters.
- `MqttArchiveState.publishDraftHistory` stores overwritten/manual publish drafts only and never duplicates real outgoing send records.
- `MqttPublishTemplate.operatedAt` is the publish-template operation-order field with legacy fallback to `updatedAt` / `createdAt`.
- Runtime-owned transient layers, such as draft-history popover/editor, must be represented in shortcut context before DOM focus is trusted.

## MQTT UI

- The MQTT page is implemented in [src/pages/MqttPage.vue](../../src/pages/MqttPage.vue#L1), shared publish record rows in [src/components/MqttPublishRecordList.vue](../../src/components/MqttPublishRecordList.vue#L1), and workbench styling in [src/styles/app.css](../../src/styles/app.css#L1).
- The workbench uses compact connection tree, subscription, and message/publish surfaces suitable for uTools default windows.
- The connection rail is a hierarchy surface with group rows, config rows, row-local actions, visible collapse state, Quick Jump row anchors, `c-` shortcut hints, right-click/action drawers, and native drag/drop target feedback.
- The top command bar owns connection status, topic filter, record search, `全/收/发/藏`, and layout controls.
- Config editing is a right-side drawer with compact endpoint, subscription, publish-topic, and options sections.
- Send-area draft history is a recovery/reuse popover beside the publish editor, not an outgoing-history list.
- Preview surfaces are readonly overlays. Hover/Shift/`Ctrl+I` preview must not mutate records, steal list focus, or reflow rows.

## Verification

- Project gates are listed in [../specs/PROJECT_STATUS.md](../specs/PROJECT_STATUS.md#L1).
- MQTT verification evidence is indexed in [../specs/2606231645-eypc-mqtt-websocket-tab/06-sync-doc.md](../specs/2606231645-eypc-mqtt-websocket-tab/06-sync-doc.md#L1).
- Detailed maintenance facts and update triggers are in [technical-details.md](technical-details.md#L1).
