# EyPc Project Status Hub

Tool: codex

## Purpose

This is the project process hub for EyPc. It tracks the current main line, active task docs, implementation focus, and verification gates.

## Current Snapshot

- Date: 2026-06-24.
- Product: uTools plugin for cross-platform PC capability calls.
- Current main line: Port management redesign plus quick-open file favorites and MQTT over WebSocket quick connection: relevance search, user-defined port groups/folders, command-soul editing semantics, layered shortcut profiles, settings-page shortcut governance, dynamic feature tab maintenance, real process scan/kill fallback, compact help hints, metadata-only deletion, unified focus behavior, favorites virtual containers, explicit target initialization, target quick-open, uTools quick favorite entry, macOS Finder open/reveal fallback, uTools preload CommonJS package scope, Ctrl-based search command hints, MQTT SQLite-first local archive, connection snapshots, subscription aliases, dedicated subscription editor modal, multi-select filtering, lazy MQTT runtime loading, MQTT command-owned message/detail/action drawers, message favorite aliases, copy topic/payload commands, configurable hover plus `Ctrl+I`/Shift readonly preview, right-side connection config drawer, blank new-connection drafts, inline config subscription editing, compact Lucide icon MQTT workbench controls, top-layer fixed auto-staggered shortcut hints, colored and inline payload preview, record-list jumps, EzClipboard-style publish history/favorite multi-select, persisted MQTT rail/record/workspace layout state, compact MQTT information workspace, fixed-height single-line MQTT message/record rows, single-list record mode replacing the message area, contextual MQTT `F2`/`Shift+F2` editing, `Ctrl+Shift+S` layout switching, MQTT default-window command/publish bar adaptation, and shared tool preview preferences in Settings.
- Current task: uTools 默认窗口 MQTT 再适配已完成并通过自动与浏览器验证：顶部 command bar 保持连接摘要、收发筛选、记录视图三段单行稳定布局，筛选/记录图标和字号进一步缩小；消息、历史、收藏 item 固定 34px 单行高度，topic alias 以灰色角标呈现且不撑高，payload 使用 JSON/plain-text token 短预览；预览浮层缩小到 420px 默认宽、160px 最小高并保留内部滚动；发送栏在默认窗口下保持单行紧凑；`public/plugin.json` 的 uTools manifest 尺寸未修改。当前权威文档在 [260624-eypc-utools-default-window-adaptation/01-spec.md](260624-eypc-utools-default-window-adaptation/01-spec.md#L1)、[260624-eypc-utools-default-window-adaptation/02-plan.md](260624-eypc-utools-default-window-adaptation/02-plan.md#L1)、[260624-eypc-utools-default-window-adaptation/04-verify.md](260624-eypc-utools-default-window-adaptation/04-verify.md#L1)。核心变更落在 [../../src/pages/MqttPage.vue](../../src/pages/MqttPage.vue#L1266)、[../../src/components/MqttPublishRecordList.vue](../../src/components/MqttPublishRecordList.vue#L1)、[../../src/domain/mqttPayloadPreview.ts](../../src/domain/mqttPayloadPreview.ts#L1)、[../../src/styles/app.css](../../src/styles/app.css#L3119)、[../../tests/ui/mqttPage.test.ts](../../tests/ui/mqttPage.test.ts#L108)。
- Architecture source: [../knowledge/ARCHITECTURE.md](../knowledge/ARCHITECTURE.md#L1).
- Technical detail memory: [../knowledge/technical-details.md](../knowledge/technical-details.md#L1).
- Error memory: [../knowledge/error-memory.md](../knowledge/error-memory.md#L1).
- Project interaction taste: [../knowledge/developer-soul.md](../knowledge/developer-soul.md#L1).

## Active Process Index

- Initial MVP spec: [260616-eypc-initial-mvp/01-spec.md](260616-eypc-initial-mvp/01-spec.md#L1).
- Initial MVP plan: [260616-eypc-initial-mvp/02-plan.md](260616-eypc-initial-mvp/02-plan.md#L1).
- Initial MVP tasks: [260616-eypc-initial-mvp/03-tasks.md](260616-eypc-initial-mvp/03-tasks.md#L1).
- Initial MVP verification: [260616-eypc-initial-mvp/04-verify.md](260616-eypc-initial-mvp/04-verify.md#L1).
- Initial MVP review: [260616-eypc-initial-mvp/05-review.md](260616-eypc-initial-mvp/05-review.md#L1).
- Usability closure spec: [260616-eypc-usability-closure/01-spec.md](260616-eypc-usability-closure/01-spec.md#L1).
- Usability closure plan: [260616-eypc-usability-closure/02-plan.md](260616-eypc-usability-closure/02-plan.md#L1).
- Usability closure tasks: [260616-eypc-usability-closure/03-tasks.md](260616-eypc-usability-closure/03-tasks.md#L1).
- Usability closure verification: [260616-eypc-usability-closure/04-verify.md](260616-eypc-usability-closure/04-verify.md#L1).
- Usability closure review: [260616-eypc-usability-closure/05-review.md](260616-eypc-usability-closure/05-review.md#L1).
- Port management redesign spec: [260617-eypc-port-management-redesign/01-spec.md](260617-eypc-port-management-redesign/01-spec.md#L1).
- Port management redesign plan: [260617-eypc-port-management-redesign/02-plan.md](260617-eypc-port-management-redesign/02-plan.md#L1).
- Port management redesign tasks: [260617-eypc-port-management-redesign/03-tasks.md](260617-eypc-port-management-redesign/03-tasks.md#L1).
- Port management redesign verification: [260617-eypc-port-management-redesign/04-verify.md](260617-eypc-port-management-redesign/04-verify.md#L1).
- Port management redesign review: [260617-eypc-port-management-redesign/05-review.md](260617-eypc-port-management-redesign/05-review.md#L1).
- Port tab interaction spec: [260617-eypc-port-tab-interaction/01-spec.md](260617-eypc-port-tab-interaction/01-spec.md#L1).
- Port tab interaction plan: [260617-eypc-port-tab-interaction/02-plan.md](260617-eypc-port-tab-interaction/02-plan.md#L1).
- Port tab interaction tasks: [260617-eypc-port-tab-interaction/03-tasks.md](260617-eypc-port-tab-interaction/03-tasks.md#L1).
- Port tab interaction verification: [260617-eypc-port-tab-interaction/04-verify.md](260617-eypc-port-tab-interaction/04-verify.md#L1).
- Port tab interaction review: [260617-eypc-port-tab-interaction/05-review.md](260617-eypc-port-tab-interaction/05-review.md#L1).
- Port EzClipboard interaction spec: [260617-eypc-port-ezclipboard-interaction/01-spec.md](260617-eypc-port-ezclipboard-interaction/01-spec.md#L1).
- Port EzClipboard interaction plan: [260617-eypc-port-ezclipboard-interaction/02-plan.md](260617-eypc-port-ezclipboard-interaction/02-plan.md#L1).
- Port EzClipboard interaction tasks: [260617-eypc-port-ezclipboard-interaction/03-tasks.md](260617-eypc-port-ezclipboard-interaction/03-tasks.md#L1).
- Port EzClipboard interaction verification: [260617-eypc-port-ezclipboard-interaction/04-verify.md](260617-eypc-port-ezclipboard-interaction/04-verify.md#L1).
- Port EzClipboard interaction review: [260617-eypc-port-ezclipboard-interaction/05-review.md](260617-eypc-port-ezclipboard-interaction/05-review.md#L1).
- Dev kill bridge spec: [260617-eypc-dev-kill-bridge/01-spec.md](260617-eypc-dev-kill-bridge/01-spec.md#L1).
- Dev kill bridge plan: [260617-eypc-dev-kill-bridge/02-plan.md](260617-eypc-dev-kill-bridge/02-plan.md#L1).
- Dev kill bridge tasks: [260617-eypc-dev-kill-bridge/03-tasks.md](260617-eypc-dev-kill-bridge/03-tasks.md#L1).
- Dev kill bridge verification: [260617-eypc-dev-kill-bridge/04-verify.md](260617-eypc-dev-kill-bridge/04-verify.md#L1).
- Dev kill bridge review: [260617-eypc-dev-kill-bridge/05-review.md](260617-eypc-dev-kill-bridge/05-review.md#L1).
- Layered shortcuts settings spec: [260617-eypc-layered-shortcuts-settings/01-spec.md](260617-eypc-layered-shortcuts-settings/01-spec.md#L1).
- Layered shortcuts settings plan: [260617-eypc-layered-shortcuts-settings/02-plan.md](260617-eypc-layered-shortcuts-settings/02-plan.md#L1).
- Layered shortcuts settings tasks: [260617-eypc-layered-shortcuts-settings/03-tasks.md](260617-eypc-layered-shortcuts-settings/03-tasks.md#L1).
- Layered shortcuts settings verification: [260617-eypc-layered-shortcuts-settings/04-verify.md](260617-eypc-layered-shortcuts-settings/04-verify.md#L1).
- Command soul shortcuts spec: [260617-eypc-command-soul-shortcuts/01-spec.md](260617-eypc-command-soul-shortcuts/01-spec.md#L1).
- Command soul shortcuts plan: [260617-eypc-command-soul-shortcuts/02-plan.md](260617-eypc-command-soul-shortcuts/02-plan.md#L1).
- Command soul shortcuts tasks: [260617-eypc-command-soul-shortcuts/03-tasks.md](260617-eypc-command-soul-shortcuts/03-tasks.md#L1).
- Command soul shortcuts verification: [260617-eypc-command-soul-shortcuts/04-verify.md](260617-eypc-command-soul-shortcuts/04-verify.md#L1).
- Port group UI optimization spec: [260617-eypc-port-group-ui-optimization/01-spec.md](260617-eypc-port-group-ui-optimization/01-spec.md#L1).
- Port group UI optimization plan: [260617-eypc-port-group-ui-optimization/02-plan.md](260617-eypc-port-group-ui-optimization/02-plan.md#L1).
- Port group UI optimization tasks: [260617-eypc-port-group-ui-optimization/03-tasks.md](260617-eypc-port-group-ui-optimization/03-tasks.md#L1).
- Port group UI optimization verification: [260617-eypc-port-group-ui-optimization/04-verify.md](260617-eypc-port-group-ui-optimization/04-verify.md#L1).
- Settings uTools layout spec: [2606171920-eypc-settings-utools-layout/01-spec.md](2606171920-eypc-settings-utools-layout/01-spec.md#L1).
- Settings uTools layout plan: [2606171920-eypc-settings-utools-layout/02-plan.md](2606171920-eypc-settings-utools-layout/02-plan.md#L1).
- Settings uTools layout tasks: [2606171920-eypc-settings-utools-layout/03-tasks.md](2606171920-eypc-settings-utools-layout/03-tasks.md#L1).
- Settings uTools layout verification: [2606171920-eypc-settings-utools-layout/04-verify.md](2606171920-eypc-settings-utools-layout/04-verify.md#L1).
- Port search interaction spec: [2606180916-eypc-port-search-interaction/01-spec.md](2606180916-eypc-port-search-interaction/01-spec.md#L1).
- Port search interaction verification: [2606180916-eypc-port-search-interaction/04-verify.md](2606180916-eypc-port-search-interaction/04-verify.md#L1).
- Port focus and history removal spec: [2606191608-eypc-port-focus-history-removal/01-spec.md](2606191608-eypc-port-focus-history-removal/01-spec.md#L1).
- Port focus and history removal verification: [2606191608-eypc-port-focus-history-removal/04-verify.md](2606191608-eypc-port-focus-history-removal/04-verify.md#L1).
- Port compact help and group delete spec: [2606181025-eypc-port-compact-help-delete/01-spec.md](2606181025-eypc-port-compact-help-delete/01-spec.md#L1).
- Port compact help and group delete verification: [2606181025-eypc-port-compact-help-delete/04-verify.md](2606181025-eypc-port-compact-help-delete/04-verify.md#L1).
- Settings shortcut Ez style spec: [2606181043-eypc-settings-shortcut-ez-style/01-spec.md](2606181043-eypc-settings-shortcut-ez-style/01-spec.md#L1).
- Settings shortcut Ez style plan: [2606181043-eypc-settings-shortcut-ez-style/02-plan.md](2606181043-eypc-settings-shortcut-ez-style/02-plan.md#L1).
- Settings shortcut Ez style verification: [2606181043-eypc-settings-shortcut-ez-style/04-verify.md](2606181043-eypc-settings-shortcut-ez-style/04-verify.md#L1).
- Feature Tab maintenance spec: [260618-eypc-feature-tab-maintenance/01-spec.md](260618-eypc-feature-tab-maintenance/01-spec.md#L1).
- Feature Tab maintenance plan: [260618-eypc-feature-tab-maintenance/02-plan.md](260618-eypc-feature-tab-maintenance/02-plan.md#L1).
- Feature Tab maintenance verification: [260618-eypc-feature-tab-maintenance/04-verify.md](260618-eypc-feature-tab-maintenance/04-verify.md#L1).
- File management tab spec: [2606201810-eypc-file-management-tab/01-spec.md](2606201810-eypc-file-management-tab/01-spec.md#L1).
- File management tab verification: [2606201810-eypc-file-management-tab/04-verify.md](2606201810-eypc-file-management-tab/04-verify.md#L1).
- MQTT WebSocket quick tab spec: [2606231645-eypc-mqtt-websocket-tab/01-spec.md](2606231645-eypc-mqtt-websocket-tab/01-spec.md#L1).
- MQTT WebSocket quick tab verification: [2606231645-eypc-mqtt-websocket-tab/04-verify.md](2606231645-eypc-mqtt-websocket-tab/04-verify.md#L1).
- MQTT WebSocket quick tab sync doc: [2606231645-eypc-mqtt-websocket-tab/06-sync-doc.md](2606231645-eypc-mqtt-websocket-tab/06-sync-doc.md#L1).
- MQTT record mode consolidation spec: [260624-eypc-mqtt-record-mode-consolidation/01-spec.md](260624-eypc-mqtt-record-mode-consolidation/01-spec.md#L1).
- MQTT record mode consolidation plan: [260624-eypc-mqtt-record-mode-consolidation/02-plan.md](260624-eypc-mqtt-record-mode-consolidation/02-plan.md#L1).
- MQTT record mode consolidation verification: [260624-eypc-mqtt-record-mode-consolidation/04-verify.md](260624-eypc-mqtt-record-mode-consolidation/04-verify.md#L1).
- uTools default-window MQTT adaptation spec: [260624-eypc-utools-default-window-adaptation/01-spec.md](260624-eypc-utools-default-window-adaptation/01-spec.md#L1).
- uTools default-window MQTT adaptation plan: [260624-eypc-utools-default-window-adaptation/02-plan.md](260624-eypc-utools-default-window-adaptation/02-plan.md#L1).
- uTools default-window MQTT adaptation verification: [260624-eypc-utools-default-window-adaptation/04-verify.md](260624-eypc-utools-default-window-adaptation/04-verify.md#L1).

## Verification Gates

- Automated: `pnpm run test`, `pnpm run typecheck`, `pnpm run build`, `pnpm run validate:utools`.
- Current targeted MQTT default-window verification is recorded in [260624-eypc-utools-default-window-adaptation/04-verify.md](260624-eypc-utools-default-window-adaptation/04-verify.md#L1).
- Manual: MQTT live broker smoke is tracked in [2606231645-eypc-mqtt-websocket-tab/04-verify.md](2606231645-eypc-mqtt-websocket-tab/04-verify.md#L1); file management tab and quick entry smoke is tracked in [2606201810-eypc-file-management-tab/04-verify.md](2606201810-eypc-file-management-tab/04-verify.md#L1); port focus/history removal smoke is tracked in [2606191608-eypc-port-focus-history-removal/04-verify.md](2606191608-eypc-port-focus-history-removal/04-verify.md#L1); feature tab maintenance smoke is tracked in [260618-eypc-feature-tab-maintenance/04-verify.md](260618-eypc-feature-tab-maintenance/04-verify.md#L1); port-tab UI smoke is static in [260617-eypc-port-tab-interaction/04-verify.md](260617-eypc-port-tab-interaction/04-verify.md#L1); port dual-drawer and search/dedupe browser smoke is tracked in [260617-eypc-port-ezclipboard-interaction/04-verify.md](260617-eypc-port-ezclipboard-interaction/04-verify.md#L1); port group keyboard/layout smoke is tracked in [260617-eypc-port-group-ui-optimization/04-verify.md](260617-eypc-port-group-ui-optimization/04-verify.md#L1); compact help/group deletion smoke is tracked in [2606181025-eypc-port-compact-help-delete/04-verify.md](2606181025-eypc-port-compact-help-delete/04-verify.md#L1); settings compact layout smoke is tracked in [2606171920-eypc-settings-utools-layout/04-verify.md](2606171920-eypc-settings-utools-layout/04-verify.md#L1); settings shortcut Ez style manual checklist is tracked in [2606181043-eypc-settings-shortcut-ez-style/04-verify.md](2606181043-eypc-settings-shortcut-ez-style/04-verify.md#L1); shortcut settings UI smoke is tracked in [260617-eypc-layered-shortcuts-settings/04-verify.md](260617-eypc-layered-shortcuts-settings/04-verify.md#L1); dev kill bridge safe smoke is tracked in [260617-eypc-dev-kill-bridge/04-verify.md](260617-eypc-dev-kill-bridge/04-verify.md#L1); macOS real kill with a temporary process and Windows/Linux real process scan remain release gates.

## Current Implementation Focus

- Domain models: [src/domain/types.ts](../../src/domain/types.ts#L1).
- Port parsing/search/groups: [src/domain/ports.ts](../../src/domain/ports.ts#L1).
- Shortcut codec: [src/domain/shortcuts.ts](../../src/domain/shortcuts.ts#L1).
- Legacy search history compatibility domain: [src/domain/searchHistory.ts](../../src/domain/searchHistory.ts#L1).
- Favorite tree/search/group/item projections: [src/domain/favorites.ts](../../src/domain/favorites.ts#L1).
- MQTT config/session/message projections: [src/domain/mqtt.ts](../../src/domain/mqtt.ts#L1).
- App runtime and action dispatch: [src/runtime/appRuntime.ts](../../src/runtime/appRuntime.ts#L1).
- Keybinding runtime: [src/runtime/keybinding/keybindingRuntime.ts](../../src/runtime/keybinding/keybindingRuntime.ts#L1).
- Platform adapter and preload bridge: [src/platform/eypcPlatform.ts](../../src/platform/eypcPlatform.ts#L1), [preload/index.js](../../preload/index.js#L1).
- UI shell and search suggestions: [src/App.vue](../../src/App.vue#L1), [src/components/SearchSuggestBox.vue](../../src/components/SearchSuggestBox.vue#L1), [src/pages/PortsPage.vue](../../src/pages/PortsPage.vue#L1), [src/pages/FavoritesPage.vue](../../src/pages/FavoritesPage.vue#L1), [src/pages/QuickFavoritesPage.vue](../../src/pages/QuickFavoritesPage.vue#L1), [src/pages/MqttPage.vue](../../src/pages/MqttPage.vue#L1), [src/pages/SettingsPage.vue](../../src/pages/SettingsPage.vue#L1).
