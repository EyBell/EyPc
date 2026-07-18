# EyPc Technical Details

Tool: codex

## File Favorites Runtime

- Last verified: 2026-07-11.
- Runtime boundary: favorite UI emits action ids; [src/runtime/appRuntime.ts](../../src/runtime/appRuntime.ts#L1) resolves target kind and IDs in `explicit → frozen drawer → active-pane focus → visible selection` order before [src/platform/eypcPlatform.ts](../../src/platform/eypcPlatform.ts#L1) or [preload/index.js](../../preload/index.js#L1) is called.
- `FileActionResult` uses `success | dispatched | revealed-instead | failed`; a legacy boolean `true` is only `dispatched`. Errors use the bounded file error-code set, and browser development actions are disabled by `FileCapabilities` when the host cannot perform them.
- Open performs path preflight and prefers Electron `shell.openPath`, whose empty result confirms success. uTools void calls are dispatch-only. On macOS, failed open followed by successful reveal reports `revealed-instead`; the native fallback retains timeout and handler error codes.
- Path inspections use `lstat/stat/access` with bounded promises. If metadata reads succeed but access is denied, the Runtime keeps known type, symlink, size and modification time with `exists=true`; `ENOENT` alone clears existence. Missing/denied/offline paths remain in metadata, and inspection rejection becomes explicit `unknown/io-error` instead of an endless loading label.
- Directory reads are one-level, bounded and race-protected. Host display paths are preserved while selection, focus, duplicate marking and favorite matching use [favoritePathIdentityKey](../../src/domain/favorites.ts#L1). Resolvable file/folder links expose target-kind metadata without recursive reads; special or unresolved entries are filtered rather than coerced to `file`.
- Quick mode invalidates directory requests, clears selections/drawer/edit layers and focuses its first visible row. Full mode cycles only available `containers | items | directory` panes, clears inactive-pane row focus, issues a DOM focus request and implements the documented Escape recovery chain.
- One-step removal undo reinserts nodes at their original positions and merges removed collapse ids. It restores sanitized pane/focus/selection only when the current context still equals the automatic post-removal context, so later navigation wins.
- [ConfirmLayer.vue](../../src/components/ConfirmLayer.vue#L1) restores persistent triggers directly. When a confirmed mutation removes the trigger, it selects an ordered visible fallback supplied by [src/App.vue](../../src/App.vue#L1) and retries for a bounded number of animation frames while focus remains on `body`.
- At `<=720px`, the container side layer makes `visibility` immediate on open and delays it only on close. [FavoritesPage.vue](../../src/pages/FavoritesPage.vue#L1) can therefore focus the tree after render without racing the 160ms transform transition.
- uTools packaging keeps the root package ESM while [public/package.json](../../public/package.json#L1) declares the CommonJS scope. [prepare-utools-runtime.mjs](../../scripts/prepare-utools-runtime.mjs#L1) synchronizes the canonical preload and [validate-utools-runtime.mjs](../../scripts/validate-utools-runtime.mjs#L1) rejects source/public/dist drift.
- Component behavior coverage uses [favoritesBehavior.test.ts](../../tests/ui/favoritesBehavior.test.ts#L1); domain/Runtime/platform matrices are in [favorites.test.ts](../../tests/domain/favorites.test.ts#L1), [action.test.ts](../../tests/runtime/action.test.ts#L1), [favoriteFileBridge.test.ts](../../tests/platform/favoriteFileBridge.test.ts#L1), and [eypcPlatform.test.ts](../../tests/platform/eypcPlatform.test.ts#L1).
- Update trigger: change this record when the graph/path contract, file result/capability bridge, target priority, Quick transition, directory request model, removal undo, preload packaging, or favorite focus/restore model changes.

## Documentation Sync

- Last verified: 2026-06-28.
- Current process hub: [../specs/PROJECT_STATUS.md](../specs/PROJECT_STATUS.md#L1).
- Current product requirements: [../specs/PRODUCT_REQUIREMENTS.md](../specs/PRODUCT_REQUIREMENTS.md#L1).
- Current MQTT implementation sync: [../specs/2606231645-eypc-mqtt-websocket-tab/06-sync-doc.md](../specs/2606231645-eypc-mqtt-websocket-tab/06-sync-doc.md#L1).
- Durable architecture facts live in [ARCHITECTURE.md](ARCHITECTURE.md#L1); repeated wrong paths live in [error-memory.md](error-memory.md#L1); interaction taste lives in [developer-soul.md](developer-soul.md#L1).

## Shared Operation Help And Command Panels

- Last verified: 2026-07-13.
- [OperationTooltipLayer.vue](../../src/components/OperationTooltipLayer.vue#L1) delegates hover/focus handling from the App root. Its operation selector covers buttons, summary/menu/tab/option/treeitem roles, draggable rows, checkbox/radio/number/range controls and selects; associated labels prevent a nested checkbox from inheriting its row's context-menu description.
- Disabled controls require captured `pointermove` plus `document.elementFromPoint` because disabled elements do not reliably bubble pointer events. The shared layer reports `data-disabled-reason` or the standard unavailable reason and suspends while Quick Jump is open.
- Cross-tab target resolution and default keybindings live in [appRuntime.ts](../../src/runtime/appRuntime.ts#L1) and [keybindingRuntime.ts](../../src/runtime/keybinding/keybindingRuntime.ts#L1). Explicit args replace existing frozen targets; missing explicit entities fail. Favorites distinguish left detail with `favoriteDrawer.active=false` from right actions with `true`, while Quick Favorites filters the action projection to safe commands.
- Ports, Favorites/Quick Favorites and MQTT watch panel kind/side/target changes, not only the open boolean, so `Ctrl/Cmd+Left → Ctrl/Cmd+Right` focuses the newly rendered close/action control. Settings implements the same contract locally for non-editing shortcut rows.
- MQTT connection-tree plain collapse/expand arrows use exact no-modifier ownership; modified left/right chords bubble to Runtime. Settings resolves side switching from both command rows and its active context panel.
- The final responsive cascade in [app.css](../../src/styles/app.css#L1) removes viewport-height assumptions, confines drawers to active Tab roots, switches to one-column/exclusive panels below 720px, stacks MQTT rails and receive/send workspace below 900px, and keeps horizontal overflow internal or absent.
- Verification coverage: [action.test.ts](../../tests/runtime/action.test.ts#L1), [keybinding.test.ts](../../tests/runtime/keybinding.test.ts#L1), [operationTooltip.test.ts](../../tests/ui/operationTooltip.test.ts#L1), [favoritesBehavior.test.ts](../../tests/ui/favoritesBehavior.test.ts#L1), [settingsContextPanel.test.ts](../../tests/ui/settingsContextPanel.test.ts#L1), and [quickJumpLayout.test.ts](../../tests/domain/quickJumpLayout.test.ts#L1).

## Global Quick Jump

- Last verified: 2026-07-13.
- Domain source: [src/domain/quickJump.ts](../../src/domain/quickJump.ts#L1); hit-test source: [src/domain/quickJumpHitTest.ts](../../src/domain/quickJumpHitTest.ts#L1); layout source: [src/domain/quickJumpLayout.ts](../../src/domain/quickJumpLayout.ts#L1); overlay source: [src/components/QuickJumpLayer.vue](../../src/components/QuickJumpLayer.vue#L1); App integration: [src/App.vue](../../src/App.vue#L1).
- Defaults live in [src/runtime/keybinding/keybindingRuntime.ts](../../src/runtime/keybinding/keybindingRuntime.ts#L1) as `F` for `quickJump.openForward` and `Shift+F` for `quickJump.openBackward`; [src/runtime/appRuntime.ts](../../src/runtime/appRuntime.ts#L1) returns those command ids to App instead of dispatching business actions.
- Marker generation excludes trigger key `f`; large target sets use fixed-width prefix-free markers so a partial marker narrows and a full marker activates deterministically. `displayMarker` stores the overlay label separately from the full `marker`, so after a multi-letter marker prefix is typed the overlay hides the consumed prefix and shows only the remaining suffix.
- Overlay markers are placed through [src/domain/quickJumpLayout.ts](../../src/domain/quickJumpLayout.ts#L1): title and external edge candidates precede target interiors, every candidate is viewport-clamped, and collision scoring includes all target boxes plus previously placed badges.
- Quick Jump badges use synchronized 18px layout/render boxes, a light solid background, colored border and subtle shadow. Active markers use a solid purple background with white text; the product Tooltip layer is suspended while markers are visible.
- App scans visible `[data-quick-jump-target]`, `[data-mqtt-shortcut-hint]`, buttons, links, focusable text controls, `role="button"`, `role="menuitem"`, `role="option"`, `role="treeitem"`, `role="textbox"`, and `role="searchbox"` targets, then filters hidden, disabled, ignored, clipped, and non-target editor surfaces.
- App visibility filtering intersects each target with scroll/hidden/clip ancestors, skips targets whose visible area is under 6px in either dimension, and then probes the visible rect with `document.elementsFromPoint` so targets covered by modal/drawer masks do not receive markers while top-layer close/refresh buttons remain targetable.
- MQTT connection rows, subscription rows, live message rows, publish template/history rows, and publish draft-history rows expose `role="option"` plus Quick Jump label/search metadata and title anchors so the row itself can be jumped to and selected, similar to connection cards.
- Target labels prefer `data-quick-jump-label`, then `aria-label`, `title`, shortcut hint metadata, `data-role`, visible text, and a final button fallback so icon-only command buttons can still receive markers.
- Editing-surface ancestors do not hide command buttons or explicit shortcut targets; only editable DOM itself blocks global Quick Jump.
- `role="textbox"` is editable in [src/runtime/keyboardEvent.ts](../../src/runtime/keyboardEvent.ts#L1), so global non-edit shortcuts cannot steal text entry from ARIA textboxes.
- Regression coverage: [tests/domain/quickJump.test.ts](../../tests/domain/quickJump.test.ts#L1), [tests/domain/quickJumpLayout.test.ts](../../tests/domain/quickJumpLayout.test.ts#L1), [tests/domain/quickJumpHitTest.test.ts](../../tests/domain/quickJumpHitTest.test.ts#L1), [tests/ui/quickJump.test.ts](../../tests/ui/quickJump.test.ts#L1), [tests/runtime/keybinding.test.ts](../../tests/runtime/keybinding.test.ts#L1), and [tests/runtime/keyboardEvent.test.ts](../../tests/runtime/keyboardEvent.test.ts#L1).

## MQTT State And Storage

- Last verified: 2026-06-27.
- Source of truth: [../specs/PRODUCT_REQUIREMENTS.md](../specs/PRODUCT_REQUIREMENTS.md#L1) and [../specs/2606231645-eypc-mqtt-websocket-tab/06-sync-doc.md](../specs/2606231645-eypc-mqtt-websocket-tab/06-sync-doc.md#L1).
- Persisted config keeps subscriptions, aliases, colors, publish defaults, connection flags, `groupId`, layout prefs, and `syncRecords` in [src/domain/types.ts](../../src/domain/types.ts#L1). Password/token values stay outside app state and archive data, and [preload/index.js](../../preload/index.js#L1) stores them only in the local userData encrypted secret envelope.
- `MqttState.connectionGroups` stores user-created MQTT connection groups with `parentId`, `color`, and sibling `sortOrder`. `MqttConnectionConfig.groupId` links configs to groups, and invalid references normalize to `null` through [src/domain/mqtt.ts](../../src/domain/mqtt.ts#L1).
- `MqttLayoutPrefs.collapsedConnectionGroupIds` persists collapsed connection groups and prunes missing ids during normalization.
- Connection tree projection, drop-target resolution, group move, delete promotion, and cycle prevention live in [src/domain/mqttConnectionTree.ts](../../src/domain/mqttConnectionTree.ts#L1).
- `MqttConnectionConfig.publishTopics` normalizes multiple default publish topics and mirrors the first value to `publishTopic` through [src/domain/mqtt.ts](../../src/domain/mqtt.ts#L1).
- `MqttState.viewPrefs` persists `全/收/发/藏` and valid topic filters per connection config. Invalid topics are pruned during normalization.
- `MqttArchiveState.publishDraftHistory` stores overwritten/manual drafts only. It is local recovery/reuse data and must not duplicate outgoing send records.
- SQLite-first archive durability is implemented through [preload/index.js](../../preload/index.js#L1) and surfaced by [src/platform/eypcPlatform.ts](../../src/platform/eypcPlatform.ts#L1). Legacy archive import remains additive and keeps old data as rollback backup.

## MQTT Workbench Runtime

- Last verified: 2026-06-27.
- Runtime source: [src/runtime/appRuntime.ts](../../src/runtime/appRuntime.ts#L1).
- Runtime projects active pane, active record list, record search, template/history rows, draft-history rows, MQTT connection tree rows, focus target, drawer targets, preview state, storage status, layout prefs, and view prefs.
- Ordinary messages and outgoing history sort newest first by `timestamp`; publish draft history sorts by `updatedAt`; templates sort by `MqttPublishTemplate.operatedAt` with `updatedAt` / `createdAt` fallback.
- Template operation time updates on save/edit/rename/apply/direct-send/repeat-send and does not update on focus, preview, detail, or menu open.
- Publish editor replacement archives the previous meaningful draft before applying a message/template/history/draft when the replacement differs. Manual draft save is `Ctrl+Shift+H`.
- Runtime shortcut context must treat open draft-history popovers/editors as command-owned layers before trusting DOM focus. This prevents stale `mqtt-publish-editor` focus from stealing `Space`, drawer, edit, or delete commands.
- Connection and subscription rails are runtime-owned row targets. Connection state includes selected config ids; subscription selection uses `MqttRecordSelection.kind = "subscription"` so detail/action drawers can target topics without pretending they are message records.
- Connection group rows use `MqttRecordSelection.kind = "connection-group"` and can focus, show detail/actions, edit, delete, collapse, expand, and drag/drop without switching the active MQTT connection config.
- Deleting a connection group removes only group metadata. Direct child groups/configs are promoted to the deleted group's parent so existing connections are not lost.
- Runtime adds `mqttTargetKind` to shortcut context so connection-pane `F2` and `Shift+F2` dispatch to config commands for config rows and group commands for group rows.
- Connection rail actions include movement, multi-select, endpoint copy, focused/selected delete, detail drawer, action drawer, and right-click entry. Subscription rail actions include movement, multi-select, topic copy, use-as-publish-topic, focused/selected delete, detail drawer, action drawer, and right-click entry.
- Connection-config editor focus is a generated matrix instead of a fixed field list, so `Tab` / `Shift+Tab` traverses per-subscription alias/topic/color rows, publish-topic rows, MQTT option fields, and storage options.

## MQTT Shortcut And Input Layers

- Last verified: 2026-06-27.

- Keybinding source: [src/runtime/keybinding/keybindingRuntime.ts](../../src/runtime/keybinding/keybindingRuntime.ts#L1); DOM role extraction source: [src/runtime/keyboardEvent.ts](../../src/runtime/keyboardEvent.ts#L1).
- Current defaults: `Ctrl+1/2/3` for `全/收/发`, `Ctrl+M` for `藏`, `Ctrl+H` for draft history, `Ctrl+Shift+H` for manual draft save, `Ctrl+F` for record search, `Ctrl+Shift+F` for topic dropdown, `Ctrl+P` for publish topic, and `Ctrl+Shift+S` for layout.
- Released defaults: `Ctrl+L`, `Ctrl+Shift+L`, and `Ctrl+Shift+M` are intentionally unbound for MQTT draft/history behavior.
- Input roles: `mqtt-publish-editor`, `mqtt-publish-draft`, `mqtt-publish-draft-editor`, `mqtt-topic-filter`, `mqtt-publish-options`, `mqtt-connections`, `mqtt-connection-group-editor`, `mqtt-subscriptions`, `mqtt-config-subscription-editor`, and `mqtt-config-publish-editor`.
- Draft-history focus owns `Space`, `Enter`, `Ctrl+Enter`, `Ctrl+S`, `Ctrl+Left`, `Ctrl+Right`, `F2`, `Shift+F2`, `Ctrl+Delete`, `Ctrl+Backspace`, and `Escape`; draft editor modes own `Ctrl+S` / `Ctrl+Enter` / `Tab` / `Shift+Tab` / `Escape`.
- Connection tree focus owns `Space`, `Ctrl+C`, `Delete`, `Backspace`, `Ctrl+Delete`, `Ctrl+Backspace`, `Ctrl+Left`, `Ctrl+Right`, `ArrowLeft` collapse, and `ArrowRight` expand. `Ctrl+T` remains subscription add and is not reused for group creation.
- Connection group defaults: `Ctrl+G` creates a group, `F2` edits the focused group in the group editor, `Shift+F2` renames it inline in the tree label, and `Ctrl+F2` opens move-parent mode. Config rows keep `F2` / `Shift+F2` for config edit/rename. `Ctrl+G` is also used by ports grouping and remains valid because keybindings are tab/context scoped.
- MQTT connection create shortcuts carry pane/panel/input-role context from [src/runtime/appRuntime.ts](../../src/runtime/appRuntime.ts#L1) into action dispatch. Parent inference for `Ctrl+G` / `Ctrl+N` uses explicit row args first, then `mqtt-connections` row focus, and otherwise creates root-level targets for connection search, blank rail, or other non-edit MQTT panes while the rail is expanded.
- Connection group editor focus owns `Ctrl+S`, `Ctrl+Enter`, `Tab`, `Shift+Tab`, and `Escape`.
- Subscription rail focus owns `Space`, `Ctrl+C`, `Delete`, `Backspace`, `Ctrl+Delete`, `Ctrl+Backspace`, `Ctrl+Left`, `Ctrl+Right`, `Enter` topic filter, and `Ctrl+Enter` use-as-publish-topic.
- Managed subscription/config/publish-topic editor rows use `ArrowUp` / `ArrowDown` for same-field row movement and `Ctrl+Delete` / `Ctrl+Backspace` for row deletion while plain text deletion remains native.
- Publish topic/payload editing intentionally does not own `Ctrl+Left` / `Ctrl+Right`; those chords remain native host text navigation. Publish options are opened by their button and close through `Escape` or outside pointerdown.
- Ordinary draft-history edit updates in [src/runtime/appRuntime.ts](../../src/runtime/appRuntime.ts#L1) must not request focus; focus requests belong to editor open and field-cycle commands.

## MQTT UI And Preview

- Last verified: 2026-06-27.

- UI source: [src/pages/MqttPage.vue](../../src/pages/MqttPage.vue#L1), [src/components/MqttPublishRecordList.vue](../../src/components/MqttPublishRecordList.vue#L1), and [src/styles/app.css](../../src/styles/app.css#L1).
- The top MQTT command bar owns connection status, topic filter, current-list search, `全/收/发/藏`, and layout controls. Template/history lists do not carry separate headers.
- The config drawer owns endpoint preview, compact endpoint fields, connection group assignment, subscription alias/topic/color rows, publish topic candidate rows, and compact connection options.
- Connection tree and subscription rows expose active, selected, hover, and keyboard-focus styling. Row-local buttons and right-click menus dispatch the same runtime actions as keyboard shortcuts.
- The connection rail renders a compact EyTodo-like hierarchy with nested groups, chevron collapse/expand controls, folder color marks, child-count metadata, `c-` shortcut hints, Quick Jump row anchors, and visible drag/drop target states.
- MQTT z-index tiers are fixed in [src/styles/app.css](../../src/styles/app.css#L1): workbench controls, active local popovers, global drawer overlays, floating previews, modals, and shortcut top-layer hints are separate layers. Publish options, topic filter, and draft-history popovers use the active workbench popover layer so they sit above split/stack panel content and resizers without covering drawers or modals.
- The send toolbar owns draft-history access. The visible star/template-save button is removed; publish editor `Ctrl+S` is the save-template path.
- Publish options and draft-history popovers are editor-adjacent transient layers. They guard inside clicks through their anchor elements and close on outside pointerdown.
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
- Rail menu and config focus traversal: [../specs/260626-eypc-mqtt-rail-menu-focus/04-verify.md](../specs/260626-eypc-mqtt-rail-menu-focus/04-verify.md#L1).
- Global Quick Jump: [../specs/260626-eypc-global-quick-jump/04-verify.md](../specs/260626-eypc-global-quick-jump/04-verify.md#L1).
- Editing keyboard ownership: [../specs/260626-eypc-mqtt-editing-keyboard-ownership/04-verify.md](../specs/260626-eypc-mqtt-editing-keyboard-ownership/04-verify.md#L1).
- MQTT connection tree grouping and drag-drop: [../specs/260627-eypc-mqtt-connection-tree/04-verify.md](../specs/260627-eypc-mqtt-connection-tree/04-verify.md#L1).

## Update Triggers

- Update MQTT memory when a state/archive field, shortcut default, input role, storage bridge, preview target model, connection tree contract, config editor contract, Quick Jump target surface, or verification gate changes.
- Update error memory when a host shortcut conflict, stale DOM focus problem, archive migration trap, or preload packaging trap recurs.
