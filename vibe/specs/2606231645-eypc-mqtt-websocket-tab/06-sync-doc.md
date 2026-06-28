# MQTT WebSocket Implementation Sync

Tool: codex

## Purpose

This document maps the current MQTT workbench behavior from product requirement to module boundary and verification evidence. Current product contracts are indexed in [PRODUCT_REQUIREMENTS.md](../PRODUCT_REQUIREMENTS.md#L1); active task history is routed from [PROJECT_STATUS.md](../PROJECT_STATUS.md#L1).

## Design Thought Sync

- User design feedback for MQTT must update project soul at [../../knowledge/developer-soul.md](../../knowledge/developer-soul.md#L1) and this sync document in the same implementation loop when it changes selected style, avoided style, focus priority, layering priority, or command ownership.
- Selected style: compact command-owned workbench behavior, visible focus/selection/multi-select states, row-local menus before global drawers, deterministic editor `Tab` traversal, and focused transient layers above their local workbench surface.
- Avoided style: generic decorative or marketing-like panels, hidden active/focused/selected state, clipped right-side drawers, popovers that sit under their own controls, globally highest local popovers, and chat-only design corrections that are not written into project memory.
- Time-display style: row timestamps prefer readable seconds over compressed digits or sub-second noise. Same-day rows omit the date and show `HH:MM:SS`; non-today rows include `MM-DD` or `YYYY-MM-DD` plus time, with date and clock rendered as visually distinct chips.
- Detail/preview timestamp style: expanded MQTT message contexts always show full date plus seconds (`YYYY-MM-DD HH:MM:SS`) because the detail surface has room and is used for diagnosis; milliseconds stay hidden.
- Evidence label for this entry: `user-confirmed`, from the 2026-06-26 instruction to extract design thinking into project soul and real-time docs for every design-bearing question.
- 2026-06-26 visual-density sync: MQTT workbench spacing should stay tight across rails, record rows, toolbars, resizers, popovers, and publish inputs in [app.css](../../../src/styles/app.css#L1). Selected style is single-row subscription items, 28px-class icon controls, 31px record rows, lighter panel borders, and non-orange publish-editor focus; avoided style is oversized rail cards, large inter-panel gutters, and heavy focus shadows. Evidence label: `user-screenshot`.
- 2026-06-26 config-editor label sync: connection option checkboxes in [MqttPage.vue](../../../src/pages/MqttPage.vue#L1) should use a dedicated compact row group, flex-wrap outer alignment, nowrap per-option labels, and fixed 16px checkbox inputs in [app.css](../../../src/styles/app.css#L1). Selected style keeps checkbox and text close together while labels such as “重连后重订阅” and “本地归档” move to the next row only as complete options; avoided style is inherited full-width checkbox inputs, grid columns that split text, or `space-between` layouts that push labels apart and overflow. Evidence label: `user-screenshot`.
- 2026-06-27 connection-tree sync: MQTT connection display should follow the EyTodo-like compact hierarchy in [MqttPage.vue](../../../src/pages/MqttPage.vue#L1): selected style is an IDE/tree rail with nested groups, visible expand/collapse state, row-local group actions, and visible drag/drop insertion/inside targets; avoided style is a flat connection list, decorative cards that hide hierarchy, or drag behavior without clear target feedback. Evidence label: `user-request`, from “优化mqtt的连接展示, 允许增加分组, 有层级, 可拖拽, 参照EyTodo项目”.
- 2026-06-28 group icon-density sync: MQTT connection group rows in [MqttPage.vue](../../../src/pages/MqttPage.vue#L1) and [app.css](../../../src/styles/app.css#L1) keep only the left disclosure button before the label; selected style uses tree indentation, count, and row treatment for group identity, while avoided style is an extra folder/logo glyph or wide icon gaps. Evidence label: `user-screenshot`.

## Layer Map

| Layer | Responsibility | Code mapping |
| --- | --- | --- |
| Feature shell | Feature registration, entry routing, lazy MQTT page mount, and tab restore. | [featureRegistry.ts](../../../src/runtime/feature/featureRegistry.ts#L1), [featureRouting.ts](../../../src/runtime/feature/featureRouting.ts#L1), [App.vue](../../../src/App.vue#L1) |
| State contracts | MQTT config state, view prefs, archive shape, storage status, layout prefs, and publish records. | [types.ts](../../../src/domain/types.ts#L1) |
| Domain normalization | WebSocket endpoint parsing, config cleanup, topic colors, publish topics, connection group hierarchy cleanup, archive trimming, draft history, and template operation time. | [mqtt.ts](../../../src/domain/mqtt.ts#L1), [mqttConnectionTree.ts](../../../src/domain/mqttConnectionTree.ts#L1) |
| Runtime | Archive loading, focus state, connection lifecycle, record projections, publish/draft actions, drawers, previews, and shortcut context. | [appRuntime.ts](../../../src/runtime/appRuntime.ts#L1) |
| Keybindings | Layered MQTT shortcuts, text-input allowlists, popover/editor ownership, and input role extraction. | [keybindingRuntime.ts](../../../src/runtime/keybinding/keybindingRuntime.ts#L1), [keyboardEvent.ts](../../../src/runtime/keyboardEvent.ts#L1) |
| Platform | Host bridge, SQLite-first archive, legacy fallback, local-only secrets, storage status, and clipboard. | [eypcPlatform.ts](../../../src/platform/eypcPlatform.ts#L1), [preload/index.js](../../../preload/index.js#L1) |
| UI | Compact MQTT workbench, record rows, config drawer, send-area draft popover, preview layer, and shortcut hints. | [MqttPage.vue](../../../src/pages/MqttPage.vue#L1), [MqttPublishRecordList.vue](../../../src/components/MqttPublishRecordList.vue#L1), [app.css](../../../src/styles/app.css#L1) |

## State Contracts

- `MqttConnectionConfig` stores endpoint, client id, username, subscriptions, aliases, colors, publish defaults, MQTT flags, reconnect settings, and `syncRecords` in [types.ts](../../../src/domain/types.ts#L1). Passwords and tokens are intentionally absent.
- `publishTopics: string[]` stores multiple default publish candidates. Normalization trims/dedupes values and mirrors the first valid value to `publishTopic` in [mqtt.ts](../../../src/domain/mqtt.ts#L1).
- `MqttState.viewPrefs` persists the last information filter and per-config topic filters. Invalid remembered topics are pruned during MQTT state normalization.
- `MqttState.connectionGroups` stores MQTT connection group hierarchy with `parentId`, `color`, and sibling `sortOrder`; invalid parent references normalize to root-level groups.
- `MqttConnectionConfig.groupId` links a connection config to a group. Invalid group references normalize to `null`, preserving old persisted configs as root-level connections.
- `MqttLayoutPrefs.collapsedConnectionGroupIds` persists collapsed MQTT connection groups and prunes deleted group ids during state normalization.
- `MqttArchiveState` stores connection snapshots, sessions/messages, publish templates, and publish draft history. Draft history is editor recovery/reuse data, not a send log.
- `MqttPublishTemplate.operatedAt` is the operation-order timestamp for template rows; older archives fall back to `updatedAt` then `createdAt`.
- Local secret storage remains separate under the platform/preload local-only bridge: [preload/index.js](../../../preload/index.js#L1) persists passwords/tokens to the encrypted userData envelope `mqtt-secrets-local.json`, prefers Electron safeStorage, falls back to AES-256-GCM with local-only `mqtt-secrets-local.key`, uses localStorage only as encrypted compatibility fallback, and never writes secrets into archive JSON or SQLite mirrors.

## Runtime Behavior

- MQTT remains lazy: the page is lazy-loaded by [App.vue](../../../src/App.vue#L1), the archive is loaded after entering the enabled MQTT tab, and MQTT client code is dynamically imported only when connecting.
- Runtime derives ordinary message rows, publish template rows, outgoing history rows, draft-history rows, current record list state, connection/subscription rail selection state, active focus target, drawer targets, preview state, storage status, and layout/view preferences from [appRuntime.ts](../../../src/runtime/appRuntime.ts#L1).
- Runtime derives `mqttConnectionRows` through [mqttConnectionTree.ts](../../../src/domain/mqttConnectionTree.ts#L1), so the connection rail can render groups/configs from the same pure projection used by move/delete tests.
- Ordinary message rows and outgoing history rows sort newest first by `timestamp`; draft history sorts by `updatedAt`; templates sort by `operatedAt`.
- Applying a message/template/history/draft can archive the previous publish editor content when it is meaningful and different from the replacement. Manual `Ctrl+Shift+H` saves a draft without creating an outgoing message.
- Draft-history row click only focuses. Applying requires the row apply button or `Enter`; `Ctrl+Enter` applies and sends the focused draft while keeping the popover open.
- Connection and subscription rails are runtime-owned row targets. They support movement, highlight, multi-select, detail/action drawer entry, right-click menus, copy, delete, and row-local buttons through shared action ids.
- Connection groups are runtime-owned row targets with independent focus, create/edit/delete drafts, move-parent drafts, collapse/expand, detail drawer, and action drawer. Focusing a group does not switch the active MQTT connection config.
- Runtime exposes `mqttTargetKind` to shortcut resolution so connection-pane `F2` / `Shift+F2` route to config edits for config rows and group edits for group rows without ambiguous duplicate bindings.
- Drag/drop connection tree moves are resolved in the domain before mutation. Groups cannot move under themselves or descendants, and deleting a group promotes direct child groups/configs to the deleted group's parent.
- The connection-config editor has a deterministic focus matrix covering connection fields, each subscription alias/topic/color row, each publish-topic row, MQTT option fields, and storage options.
- Runtime shortcut context treats an open draft-history popover or editor as the effective MQTT command layer before trusting DOM focus, preventing stale publish-editor focus from stealing draft-history commands.
- `Escape` recovers top MQTT layers inward first: preview, draft-history editor/popover, publish options, topic dropdown, record editor/drawers, search/filter state, then page-level focus.

## Shortcut And Input Ownership

- Current MQTT defaults: `Ctrl+1/2/3` for `全/收/发`, `Ctrl+M` for `藏`, `Ctrl+H` for draft history, `Ctrl+Shift+H` for manual draft save, `Ctrl+F` for current record search, `Ctrl+P` for publish topic, `Ctrl+Shift+F` for topic dropdown, `Ctrl+Shift+S` for layout, `Ctrl+ArrowLeft` for detail outside ordinary editors, and `Ctrl+ArrowRight` for actions outside ordinary editors.
- Connection tree defaults: `Ctrl+N` creates a connection config, `Ctrl+G` creates a connection group, `F2` edits the focused config/group, `Shift+F2` renames the focused config/group, `Ctrl+F2` moves the focused group parent, `ArrowLeft` collapses a group, and `ArrowRight` expands a group. `Ctrl+G` / `Ctrl+N` inherit a parent only from explicit row actions or `mqtt-connections` row focus: focused groups create children, focused configs create same-level targets, connection search/blank rail creates root targets, and other non-edit MQTT panes create root targets only while the connection rail is expanded. Group `Shift+F2` renders an inline tree-label input instead of the right-side group editor overlay. `Ctrl+T` remains subscription add.
- Released defaults: `Ctrl+L`, `Ctrl+Shift+L`, and `Ctrl+Shift+M` do not map to MQTT draft/history commands.
- `mqtt-publish-editor` keeps native arrows/Delete/Backspace and `Ctrl+ArrowLeft` / `Ctrl+ArrowRight` text navigation while allowing command-owned save/send/draft/focus shortcuts. Publish options open from the button and close by `Escape` or outside pointerdown.
- `mqtt-publish-draft` owns draft-history list navigation, `Space`, `Enter`, `Ctrl+Enter`, `Ctrl+S`, `Ctrl+Left`, `Ctrl+Right`, `F2`, `Shift+F2`, `Ctrl+Delete`, `Ctrl+Backspace`, and `Escape`.
- `mqtt-publish-draft-editor` owns `Ctrl+S`, `Ctrl+Enter`, `Tab`, `Shift+Tab`, and `Escape` for the alias/detail modal.
- `mqtt-topic-filter` and `mqtt-publish-options` are transient layers with their own navigation and close behavior.
- `mqtt-connections` owns connection tree movement, `Space`, `Ctrl+C`, delete shortcuts, `Ctrl+ArrowLeft`, `Ctrl+ArrowRight`, `ArrowLeft` collapse, `ArrowRight` expand, `Ctrl+G` group create, `Ctrl+N` connection create, and group-target `Ctrl+F2` parent move.
- `mqtt-connection-group-editor` owns group editor `Ctrl+S`, `Ctrl+Enter`, `Tab`, `Shift+Tab`, and `Escape`; inline group rename also accepts plain `Enter` to save while keeping `Escape` cancel.
- `mqtt-subscriptions` owns subscription rail movement, `Space`, `Enter`, `Ctrl+C`, `Ctrl+Enter`, delete shortcuts, `Ctrl+ArrowLeft`, and `Ctrl+ArrowRight`.
- `mqtt-config-subscription-editor` and `mqtt-config-publish-editor` own same-field row movement and row deletion while plain text deletion remains native.
- Editor-local keydown handlers only intercept owned commands. Unowned keys bubble to the global resolver and browser default, so ordinary editing shortcuts do not get swallowed by MQTT modal layers.

## UI Surface

- The MQTT page renders a compact workbench with connection tree rail, subscription rail, and message/publish workspace in [MqttPage.vue](../../../src/pages/MqttPage.vue#L1); visual density is owned by [app.css](../../../src/styles/app.css#L1).
- Connection tree rows expose visible group/config hierarchy, active/selected/focused states, row-local detail/edit/move/more controls, `c-` shortcut hint badges, native drag/drop, Quick Jump row anchors, and contextmenu action drawer entry. Group rows use a single left disclosure control before the label, without a separate folder/logo icon.
- The top command bar owns connection status, topic filter dropdown, current-list search, `全/收/发/藏`, and layout controls. Template/history lists no longer carry their own header search.
- Message/template/history rows share fixed-height row behavior and payload snippets. Topic visuals use subscription alias/color when available.
- Message row time uses conditional date display and distinct date/clock parts so current-day traffic stays compact while older traffic keeps enough context for diagnosis.
- Message detail and preview headers use full date-time to seconds even when the row is from today.
- The config drawer header owns the assembled endpoint preview. Endpoint fields are compact, subscriptions include alias/topic/color, publish topic candidates are editable rows, and bottom MQTT flags live in a compact options panel.
- Right-side connection and action drawers must follow existing display patterns: controls remain fully inside the panel, close buttons and shortcut chips are not clipped by panel edges, and focused floating editors/popovers outrank adjacent list rows and panel contents without covering global masks or modal layers.
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
| Connection/subscription rail menu and config `Tab` traversal | [rail menu verify](../260626-eypc-mqtt-rail-menu-focus/04-verify.md#L1) |
| Editing keyboard ownership and publish options outside close | [editing ownership verify](../260626-eypc-mqtt-editing-keyboard-ownership/04-verify.md#L1) |
| MQTT connection tree grouping and drag-drop | [connection tree verify](../260627-eypc-mqtt-connection-tree/04-verify.md#L1) |
| Local-only encrypted password/token persistence | 2026-06-26 targeted storage regression in [mqttSqlitePreload.test.ts](../../../tests/platform/mqttSqlitePreload.test.ts#L1), plus typecheck, build, and uTools runtime validation |

## Boundaries

- Current local-only secret change affects only on-disk durability location; passwords/tokens still do not enter app state, archive JSON, SQLite mirrors, templates, synced storage, broker protocol behavior, external MQTT traffic, or uTools manifest window size.
- `syncRecords=false` remains a user-facing sync/privacy preference; it is not a local durability kill switch.
- `preload/index.js` is the source-of-truth preload implementation. Generated public preload artifacts should not be cited as authoritative logic unless packaging output is the subject.
