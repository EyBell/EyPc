# EyPc Project Status Hub

Tool: codex

## Purpose

This hub routes the current EyPc implementation line, active process documents, verification gates, and memory locations. Durable behavior belongs in [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md#L1), implementation mapping belongs in [2606231645-eypc-mqtt-websocket-tab/06-sync-doc.md](2606231645-eypc-mqtt-websocket-tab/06-sync-doc.md#L1), and stable project knowledge belongs under [../knowledge](../knowledge/ARCHITECTURE.md#L1).

## Current Snapshot

- Date: 2026-06-25.
- Product: keyboard-first uTools plugin for local PC capability calls.
- Current main line: port management redesign, quick file favorites, and MQTT over WebSocket workbench.
- Current focus: MQTT workbench documentation consolidation for the uncommitted MQTT changes. The active behavior covers record-list search/selection, publish template operation ordering, persisted MQTT view preferences, send-area draft history, Shift preview ownership, compact config editing, and managed editor row shortcuts.
- Current requirement authority: [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md#L1).
- Current implementation sync: [2606231645-eypc-mqtt-websocket-tab/06-sync-doc.md](2606231645-eypc-mqtt-websocket-tab/06-sync-doc.md#L1).
- Current memory authority: [../knowledge/technical-details.md](../knowledge/technical-details.md#L1), [../knowledge/ARCHITECTURE.md](../knowledge/ARCHITECTURE.md#L1), [../knowledge/error-memory.md](../knowledge/error-memory.md#L1), and [../knowledge/developer-soul.md](../knowledge/developer-soul.md#L1).

## Active MQTT Process Index

| Concern | Spec | Plan | Verification |
| --- | --- | --- | --- |
| MQTT base WebSocket feature and storage sync | [2606231645-eypc-mqtt-websocket-tab/01-spec.md](2606231645-eypc-mqtt-websocket-tab/01-spec.md#L1) | [2606231645-eypc-mqtt-websocket-tab/06-sync-doc.md](2606231645-eypc-mqtt-websocket-tab/06-sync-doc.md#L1) | [2606231645-eypc-mqtt-websocket-tab/04-verify.md](2606231645-eypc-mqtt-websocket-tab/04-verify.md#L1) |
| Record interaction polish | [260624-eypc-mqtt-record-interaction-polish/01-spec.md](260624-eypc-mqtt-record-interaction-polish/01-spec.md#L1) | [260624-eypc-mqtt-record-interaction-polish/02-plan.md](260624-eypc-mqtt-record-interaction-polish/02-plan.md#L1) | [260624-eypc-mqtt-record-interaction-polish/04-verify.md](260624-eypc-mqtt-record-interaction-polish/04-verify.md#L1) |
| Focus commands and topic/options popovers | [260625-eypc-mqtt-focus-command-refinement/01-spec.md](260625-eypc-mqtt-focus-command-refinement/01-spec.md#L1) | [260625-eypc-mqtt-focus-command-refinement/02-plan.md](260625-eypc-mqtt-focus-command-refinement/02-plan.md#L1) | [260625-eypc-mqtt-focus-command-refinement/04-verify.md](260625-eypc-mqtt-focus-command-refinement/04-verify.md#L1) |
| Persisted focus state and publish draft history | [260625-eypc-mqtt-focus-state-draft-history/01-spec.md](260625-eypc-mqtt-focus-state-draft-history/01-spec.md#L1) | [260625-eypc-mqtt-focus-state-draft-history/02-plan.md](260625-eypc-mqtt-focus-state-draft-history/02-plan.md#L1) | [260625-eypc-mqtt-focus-state-draft-history/04-verify.md](260625-eypc-mqtt-focus-state-draft-history/04-verify.md#L1) |
| Draft popover preview and direct send | [260625-eypc-mqtt-draft-popover-preview-send/01-spec.md](260625-eypc-mqtt-draft-popover-preview-send/01-spec.md#L1) | [260625-eypc-mqtt-draft-popover-preview-send/02-plan.md](260625-eypc-mqtt-draft-popover-preview-send/02-plan.md#L1) | [260625-eypc-mqtt-draft-popover-preview-send/04-verify.md](260625-eypc-mqtt-draft-popover-preview-send/04-verify.md#L1) |
| Shift hover preview ownership | [260625-eypc-mqtt-shift-hover-preview/01-spec.md](260625-eypc-mqtt-shift-hover-preview/01-spec.md#L1) | [260625-eypc-mqtt-shift-hover-preview/02-plan.md](260625-eypc-mqtt-shift-hover-preview/02-plan.md#L1) | [260625-eypc-mqtt-shift-hover-preview/04-verify.md](260625-eypc-mqtt-shift-hover-preview/04-verify.md#L1) |
| Record time ordering | [260625-eypc-mqtt-record-time-order/01-spec.md](260625-eypc-mqtt-record-time-order/01-spec.md#L1) | [260625-eypc-mqtt-record-time-order/02-plan.md](260625-eypc-mqtt-record-time-order/02-plan.md#L1) | [260625-eypc-mqtt-record-time-order/04-verify.md](260625-eypc-mqtt-record-time-order/04-verify.md#L1) |
| Config editor compact UI and publish topics | [260625-eypc-mqtt-config-editor-ui/01-spec.md](260625-eypc-mqtt-config-editor-ui/01-spec.md#L1) | [260625-eypc-mqtt-config-editor-ui/02-plan.md](260625-eypc-mqtt-config-editor-ui/02-plan.md#L1) | [260625-eypc-mqtt-config-editor-ui/04-verify.md](260625-eypc-mqtt-config-editor-ui/04-verify.md#L1) |
| Managed editor row shortcuts | [260625-eypc-mqtt-editor-row-shortcuts/01-spec.md](260625-eypc-mqtt-editor-row-shortcuts/01-spec.md#L1) | [260625-eypc-mqtt-editor-row-shortcuts/02-plan.md](260625-eypc-mqtt-editor-row-shortcuts/02-plan.md#L1) | [260625-eypc-mqtt-editor-row-shortcuts/04-verify.md](260625-eypc-mqtt-editor-row-shortcuts/04-verify.md#L1) |

Historical port, favorites, settings, and earlier MQTT process folders remain under `vibe/specs/`; this hub indexes only the current active MQTT closeout line.

## Current Contracts

- `MqttState.viewPrefs` persists the last `全/收/发/藏` information filter and valid topic filters per connection config.
- `MqttArchiveState.publishDraftHistory` stores overwritten/manual publish drafts only; real sends remain outgoing message records.
- `MqttPublishTemplate.operatedAt` is the publish-template operation-order timestamp with `updatedAt` / `createdAt` fallback.
- `MqttConnectionConfig.publishTopics` stores multiple default publish topics and mirrors the first normalized value to `publishTopic`.
- Current MQTT defaults are `Ctrl+1/2/3` for `全/收/发`, `Ctrl+M` for `藏`, `Ctrl+H` for draft history, and `Ctrl+Shift+H` for manual draft save. `Ctrl+L`, `Ctrl+Shift+L`, and `Ctrl+Shift+M` are intentionally unbound.
- MQTT input roles include `mqtt-publish-editor`, `mqtt-publish-draft`, `mqtt-publish-draft-editor`, `mqtt-topic-filter`, `mqtt-publish-options`, `mqtt-config-subscription-editor`, and `mqtt-config-publish-editor`.

## Verification Gates

- Project gates: `pnpm run test`, `pnpm run typecheck`, `pnpm run build`, and `pnpm run validate:utools`.
- Current documentation consolidation verification on 2026-06-25: code-link audit passed, AI-rule audit passed, `git diff --check` passed, `pnpm run test` passed with 30 files / 249 tests, `pnpm run typecheck` passed, `pnpm run build` passed, and `pnpm run validate:utools` passed.
- Current targeted evidence is recorded in the active MQTT verification documents listed above.
- Manual live-broker MQTT smoke remains tracked in [2606231645-eypc-mqtt-websocket-tab/04-verify.md](2606231645-eypc-mqtt-websocket-tab/04-verify.md#L1); no current documentation consolidation step attempts external broker traffic.
- Existing release gates for real process scan/kill on macOS, Windows, and Linux remain unchanged from earlier port-management records.

## Current Implementation Focus

- Domain contracts: [src/domain/types.ts](../../src/domain/types.ts#L1), [src/domain/mqtt.ts](../../src/domain/mqtt.ts#L1).
- Runtime and shortcuts: [src/runtime/appRuntime.ts](../../src/runtime/appRuntime.ts#L1), [src/runtime/keybinding/keybindingRuntime.ts](../../src/runtime/keybinding/keybindingRuntime.ts#L1), [src/runtime/keyboardEvent.ts](../../src/runtime/keyboardEvent.ts#L1).
- Platform storage bridge: [src/platform/eypcPlatform.ts](../../src/platform/eypcPlatform.ts#L1), [preload/index.js](../../preload/index.js#L1).
- MQTT UI: [src/pages/MqttPage.vue](../../src/pages/MqttPage.vue#L1), [src/components/MqttPublishRecordList.vue](../../src/components/MqttPublishRecordList.vue#L1), [src/styles/app.css](../../src/styles/app.css#L1).
- Current tests: [tests/domain/mqtt.test.ts](../../tests/domain/mqtt.test.ts#L1), [tests/runtime/action.test.ts](../../tests/runtime/action.test.ts#L1), [tests/runtime/keybinding.test.ts](../../tests/runtime/keybinding.test.ts#L1), [tests/runtime/keyboardEvent.test.ts](../../tests/runtime/keyboardEvent.test.ts#L1), [tests/ui/mqttPage.test.ts](../../tests/ui/mqttPage.test.ts#L1), [tests/platform/eypcPlatform.test.ts](../../tests/platform/eypcPlatform.test.ts#L1), and [tests/platform/mqttSqlitePreload.test.ts](../../tests/platform/mqttSqlitePreload.test.ts#L1).
