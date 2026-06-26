# EyPc Product Requirements

Tool: codex

## Purpose

This file is the current product requirement index for EyPc. Task-level history remains in dated folders under [PROJECT_STATUS.md](PROJECT_STATUS.md#L1); MQTT implementation mapping is maintained in [2606231645-eypc-mqtt-websocket-tab/06-sync-doc.md](2606231645-eypc-mqtt-websocket-tab/06-sync-doc.md#L1).

## Global

- EyPc is a keyboard-first uTools plugin for local PC operations.
- Runtime actions are the only user-visible mutation boundary; UI components emit commands and never perform shell, storage, MQTT, or filesystem writes directly.
- Top-level feature switching uses configurable `Ctrl+Shift+数字`; Settings opens with `Ctrl+Alt+S`; `Shift+Escape` hides the plugin window.
- Shortcut resolution is layered by command context. Editor, drawer, preview, dropdown, and popover layers take priority over page-level shortcuts.
- Host-shell transient command layers must be represented in runtime state before DOM focus is trusted, especially when a host reserves browser-like shortcuts.

## Ports

- The port page scans local TCP listeners, dedupes by `pid:port:protocol`, supports search, user-defined groups/folders, focus movement, group filtering, detail drawers, action drawers, and safe kill/force-kill commands.
- Metadata changes to port groups/folders are plugin-state changes only. Process kill actions must revalidate current PID/port ownership.
- Port group editing follows command-soul semantics: `F2` edit, `Shift+F2` rename, `Ctrl+F2` move folder, `Ctrl+S` / `Ctrl+Enter` save, `Escape` cancel, and editor-local `Tab` field cycling.

## File Favorites

- Favorites are plugin metadata for file/folder paths and virtual groups. Removing a favorite never deletes the disk file or folder.
- Quick favorite mode is search/open/reveal/copy only; management mode supports add, edit, move, duplicate focus, and directory listing.
- Open/reveal/copy stays behind the platform bridge in [src/platform/eypcPlatform.ts](../../src/platform/eypcPlatform.ts#L1) and [preload/index.js](../../preload/index.js#L1).

## MQTT

- MQTT over WebSocket is a first-class feature with lazy page/runtime loading, dynamic MQTT client import, SQLite-first local archive, legacy archive fallback, and local-only persistent secret storage.
- Connection configs store endpoint, Client ID, username, subscriptions, aliases, colors, publish defaults, reconnect options, `syncRecords`, and layout preferences. Password/token values persist only in the preload local userData encrypted secret envelope `mqtt-secrets-local.json`; they never enter app state, archive, templates, SQLite mirrors, or synced storage.
- `MqttConnectionConfig.publishTopics` stores multiple default publish topic candidates. The first normalized value is mirrored to `publishTopic` for compatibility with the existing send editor.
- Subscription topics are configured per connection. Aliases/colors are pruned with topic removal, and topic colors normalize to five defaults or valid hex colors.
- Runtime owns message sessions, publish templates, outgoing history, publish draft history, record-list focus/selection, drawers, preview, search, layout, view preferences, and focus targets.
- `MqttState.viewPrefs` persists the last `全/收/发/藏` information filter and valid topic filters per connection config.
- MQTT ordinary message rows and outgoing history rows sort newest first by message `timestamp`. Publish draft history sorts newest first by `updatedAt`. Publish favorites/templates sort newest first by `MqttPublishTemplate.operatedAt`, with `updatedAt` / `createdAt` fallback for older archives.
- `MqttArchiveState.publishDraftHistory` stores overwritten drafts and manual saves only. Real sends remain ordinary outgoing message records and are not duplicated into draft history.
- MQTT focus targets include `records`, `topic-filter`, `publish-topic`, `publish-payload`, `publish-options`, `publish-history`, draft-history editor fields, `connections`, and `subscriptions`.
- Connection rail rows support focus highlight, hover highlight, multi-select, `ArrowUp` / `ArrowDown` movement, `Space` selection, `Ctrl+C` endpoint copy, delete shortcuts, row-local edit/detail/more buttons, and right-click action menus.
- Subscription rail rows support focus highlight, hover highlight, multi-select, `ArrowUp` / `ArrowDown` movement, `Space` selection, `Enter` topic filter, `Ctrl+C` topic copy, `Ctrl+Enter` use-as-publish-topic, delete shortcuts, row-local edit/detail/more buttons, and right-click action menus.
- `Ctrl+ArrowLeft` opens the detail drawer and `Ctrl+ArrowRight` opens the action drawer for MQTT record, connection, subscription, and draft-history row targets.
- `Ctrl+S` favorites/unfavorites the current record/template in record focus and saves the current publish topic/payload as a template in publish editor focus. Edit layers keep `Ctrl+S` as save.
- `Ctrl+1/2/3` select `全/收/发`; `Ctrl+M` selects `藏`; `Ctrl+H` opens/closes the send-area draft-history popover and focuses it; `Ctrl+Shift+H` manually saves the current draft. `Ctrl+L`, `Ctrl+Shift+L`, and `Ctrl+Shift+M` have no default MQTT binding.
- `Ctrl+Shift+S` toggles layout, `Ctrl+Shift+F` opens the topic dropdown, `Ctrl+P` enters the publish topic field, and `Ctrl+ArrowRight` from the publish editor opens QoS/retain options.
- Draft-history rows apply only from the row apply button or `Enter`; plain row click focuses the row. `Ctrl+Enter` applies and sends the focused draft while keeping the popover open.
- Draft-history focus owns `Space` multi-select, `Ctrl+Left` detail, `Ctrl+Right` actions, `F2` title/note edit, `Shift+F2` topic/payload edit, `Ctrl+Delete` / `Ctrl+Backspace` delete, and `Escape` close/cancel.
- Draft-history editor modes use `Ctrl+S` / `Ctrl+Enter` save, `Tab` / `Shift+Tab` field cycling, and `Escape` cancel.
- Publish topic/payload focus clears information-list focus so `Space` cannot keep toggling message selection while the user edits publish content.
- Topic dropdown lists only current connection subscriptions, supports alias/topic search, is single-select, and filters only ordinary message rows under `全/收/发`; template and history rows ignore topic filtering.
- Subscription modal rows, connection config subscription rows, and connection config publish-topic rows use `ArrowUp` / `ArrowDown` for same-field row movement and `Ctrl+Delete` / `Ctrl+Backspace` for current-row deletion. Plain `Delete` / `Backspace` inside text inputs remains native text editing.
- Connection config editor `Tab` / `Shift+Tab` cycles through connection fields, each subscription alias/topic/color row, each publish-topic row, connection option fields, and storage options inside the editor layer.
- Pure Shift preview can open a readonly overlay for valid MQTT message/template rows and draft-history rows while the draft popover is open. `Ctrl/Command+Shift` suppresses Shift preview so `c-s-*` commands remain shortcut-owned.
- MQTT UI uses compact rails, red/green/gray status rectangles, connection-title `host:port` hover text, a top topic dropdown without a `topic:` prefix, unified record/favorite/history rows, a send-area draft-history popover, a draft editor modal, and a publish options popover.
- MQTT local popovers for topic filtering, publish options, and draft history must be topmost inside the workbench in both stack and split layouts, but must stay below global detail/action drawer masks, previews, modals, and shortcut top-layer hints.

## Settings

- Settings owns feature visibility/order, shortcut profiles, shortcut conflict/reservation visibility, storage status, and shared tool preview preferences.
- Shortcut edits are Settings-local drafts until saved as runtime shortcut profile updates.

## Documentation

- Process hub: [PROJECT_STATUS.md](PROJECT_STATUS.md#L1).
- MQTT implementation sync: [2606231645-eypc-mqtt-websocket-tab/06-sync-doc.md](2606231645-eypc-mqtt-websocket-tab/06-sync-doc.md#L1).
- Architecture memory: [../knowledge/ARCHITECTURE.md](../knowledge/ARCHITECTURE.md#L1).
- Technical memory: [../knowledge/technical-details.md](../knowledge/technical-details.md#L1).
- Error memory: [../knowledge/error-memory.md](../knowledge/error-memory.md#L1).
- Project soul: [../knowledge/developer-soul.md](../knowledge/developer-soul.md#L1).
