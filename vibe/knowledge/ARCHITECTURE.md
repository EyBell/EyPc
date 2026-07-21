# EyPc Architecture

Tool: codex

## Product Scope

EyPc is a keyboard-first uTools plugin for local PC capability calls. Current feature areas are port process management, file/folder favorites, MQTT over WebSocket, and a Codex quota/task companion.

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
- Persistent favorites pass through deterministic graph normalization before tree or ancestor traversal. Duplicate IDs are rebuilt, invalid parent chains return to root, and traversal keeps independent visited defenses in [src/domain/favorites.ts](../../src/domain/favorites.ts#L1).
- Display paths remain user/host values. A separate identity key makes Windows drive and UNC separator/case variants equivalent while preserving POSIX case and legal backslashes.
- Favorites open/reveal/copy stays behind [src/platform/eypcPlatform.ts](../../src/platform/eypcPlatform.ts#L1) and [preload/index.js](../../preload/index.js#L1). Outcomes distinguish confirmed success, host dispatch, reveal-as-open fallback, and failure; capability and inspection data are Runtime-only.
- Runtime owns `containers | items | directory`, explicit/drawer/focus/visible-selection target priority, request generations, batch constraints and removal confirmation in [src/runtime/appRuntime.ts](../../src/runtime/appRuntime.ts#L1). One-step metadata undo restores original node order and removed collapse state; it restores pane/focus/selection only while the user has not navigated away from the post-removal context.
- Quick favorite entry is search/open/reveal/copy only; it atomically clears management transients and focuses its first visible result. Management actions stay in the full favorites page.
- One-level directory reads do not recurse or navigate. Resolvable file/folder symbolic links retain target metadata, while sockets/devices/FIFOs and unresolved links are omitted instead of being misclassified as actionable files. No bridge method creates, moves, renames, or deletes a real file.
- Pane cycling produces an explicit DOM-focus request and keeps only the active pane's row focus. The narrow container layer becomes visible immediately on open and hides after its close animation so focus handoff never targets a hidden tree. Dialog restoration uses ordered visible fallbacks and a bounded render-frame retry when the original trigger disappears.

## Feature Shell And Shortcuts

- Feature visibility/order is normalized in app state and rendered by [src/components/TabShell.vue](../../src/components/TabShell.vue#L1).
- Runtime tab switching uses dynamic visible-feature order; Settings has a fixed shortcut entry.
- Shortcut resolution is layered by context in [src/runtime/keybinding/keybindingRuntime.ts](../../src/runtime/keybinding/keybindingRuntime.ts#L1).
- Input roles are extracted centrally in [src/runtime/keyboardEvent.ts](../../src/runtime/keyboardEvent.ts#L1), then used by keybinding/runtime ownership decisions.
- `Escape` is modeled as layered recovery; `Shift+Escape` hides the uTools window through the platform bridge.

## Shared Help And Command Panels

- [OperationTooltipLayer.vue](../../src/components/OperationTooltipLayer.vue#L1) is the single delegated product-help owner. It resolves the nearest button, actionable row/tree, draggable or form operation control, suppresses duplicate native titles, attaches `aria-describedby`, captures pointer movement for disabled controls and suspends itself while Quick Jump is active.
- Runtime panel actions resolve targets as `explicit args → open frozen target → current pane focus → visible selection`. An explicit but invalid ID fails; it never falls through to an unrelated frozen or focused target. Ports, Favorites and MQTT store panel target state in Runtime; Settings keeps command-row detail/action state locally because shortcut drafts are component-owned.
- `Ctrl/Cmd+ArrowLeft/Right`, row-local buttons and context-menu entries converge on the same detail/action action ids. Text editing roles retain native arrow ownership.
- Panel presentation is inside the active Tab: docked at wide widths, reduced-secondary-navigation from `721–1100px`, and exclusive content at `<=720px`. Only confirmation, destructive decisions and atomic editors remain modal.
- Each panel transition captures the trigger, focuses the newly rendered side even when the panel was already open, traps its local Tab cycle where applicable, and restores a stable owner on close.
- [quickJumpLayout.ts](../../src/domain/quickJumpLayout.ts#L1) is a pure target-center projection: each rendered badge keeps its target rectangle's exact center regardless of label width, nearby markers or viewport edges. The overlay owns only Z-axis presentation and never changes source layout or pointer ownership.

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
- The connection rail is a hierarchy surface with group rows, config rows, row-local actions, visible collapse state, Quick Jump row targets, `c-` shortcut hints, right-click/action drawers, and native drag/drop target feedback.
- The top command bar owns connection status, topic filter, record search, `全/收/发/藏`, and layout controls.
- Config editing is a right-side drawer with compact endpoint, subscription, publish-topic, and options sections.
- Send-area draft history is a recovery/reuse popover beside the publish editor, not an outgoing-history list.
- Preview surfaces are readonly overlays. Hover/Shift/`Ctrl+I` preview must not mutate records, steal list focus, or reflow rows.

## Codex Companion

- Codex domain and migration contracts live in [src/domain/codex.ts](../../src/domain/codex.ts#L1); polling, verified/stale cache behavior, local metadata and Renderer projection live in [src/runtime/codexController.ts](../../src/runtime/codexController.ts#L1).
- The Runtime depends only on `codex.inspectEnvironment/readSnapshot/openThread/archiveThread/archiveProject/close`, optional app/hotkey ports and `float.sync/close/onAction/diagnostics` in [src/platform/eypcPlatform.ts](../../src/platform/eypcPlatform.ts#L1). This is the provider/floating-host replacement seam for a future Easy Agent integration.
- [preload/index.js](../../preload/index.js#L1) owns the local App Server session and raw native state. It reads only allowlisted fields from `.codex-global-state.json` (falling back to `.bak` only when necessary), never writes that file, completes every `archived=false` page, resolves assignment → Chats → deepest valid cwd, reads every candidate latest Turn and compares a source fingerprint before publishing Host Snapshot V2.
- Host V2 fails closed on native-state, pagination, cursor or Turn-time ambiguity. A source change retries the whole scan once; Controller keeps only the previous verified snapshot as stale. Raw thread/Turn IDs, roots/paths, cursor and native state stay in preload memory; Renderer receives anonymous keys, short-lived aliases, anonymous project order and a source fingerprint.
- Conversation projection V3 applies the inclusive rolling 1–365 day window and exposes `全部 / 待输入 / 动态 / 已完成 / 已隐藏 / 项目`. Every task array sorts by latest Turn `startedAt` descending then anonymous key. The dynamic view groups waiting input, current activity and completed-unread in that priority order; the project projection mirrors native `Pinned / Projects / Chats`, preserves empty projects and prevents duplicate task placement.
- [src/FloatApp.vue](../../src/FloatApp.vue#L1) renders six tabs as the first expanded content, then unified search, actual quota text and the task/project list. It owns fixed short-character action rails, one mouse/keyboard-arbitrated highlight, selector/Space selection, same-position confirmation, the top/bottom avoiding batch toolbar, distinct single/batch action drawers, child-owned delayed hover cards and Quick Jump; [src/runtime/keybinding/keybindingRuntime.ts](../../src/runtime/keybinding/keybindingRuntime.ts#L1) owns the isolated Codex command layer. [preload/float.js](../../preload/float.js#L1) transports resolved actions plus narrow expansion/activation/drag/resize messages.
- [CodexWaterBall.vue](../../src/components/CodexWaterBall.vue#L1) expands directly on hover and centers the quota window whose reset is nearest. A Weekly window adds the clear full track plus remaining arc; an absent quota window is never fabricated. Existing appearance and reduced-motion infrastructure remains in [codexAppearance.ts](../../src/domain/codexAppearance.ts#L1).
- Persisted Codex state contains settings, last verified quota/config, scan time, position/sizes, validated appearance, last tab, project collapse, aliases, local pin order, local remove set and hashed hidden watermarks. Stable hashed task/project keys are the only identity storage; search, selection, focus, confirmation, action aliases and inventory rows remain memory-only.
- Disabling the feature stops polling and closes the child through the host path. The companion has no native close control; its explicit hide action updates persisted visibility first. App Server cleanup closes and detaches only the pipes owned by this bridge and does not introduce process-kill behavior.
- Feature enablement performs one read-only environment inspection on first launch even while the Codex Tab and float are inactive; full App Server polling remains active-surface-owned. The static `eypc-codex-toggle` feature and app-level shortcut route through `codex.float.toggle`; `eypc-codex-activate` routes through `codex.float.activate` to show, expand and focus the child. uTools owns system-global binding.
- The Renderer platform adapter tolerates additive preload version skew: if an older desktop preload exposes `codex.readSnapshot` but not `inspectEnvironment`, it infers only macOS/Windows from browser host metadata and keeps CLI readiness unverified until the App Server round-trip. Controller success then promotes runtime/process/config/connection state, while request generations reject results that outlive disable/re-enable or disposal. The no-host browser path remains unsupported.
- The expanded host defaults to content sizing and sends explicit unpinned targets rather than a blind toggle. Pointer leave/focus departure schedules automatic collapse; focus, archive confirmation and resize own temporary deferral. Any expanded surface accepts allowlisted resize start/move/end/cancel coordinates; resize keeps the snapped edge, clamps to work area, persists once on successful end, restores on cancel and never changes compact bounds.
- True single archive accepts only a short-lived alias plus expected version/Turn/fingerprint, rereads native fingerprint, identity, status, recency and latest Turn, rejects active/inProgress/change, calls `thread/archive`, then verifies false absence and true presence. Project archive rescans all project history independent of the display window, skips active rows and processes batches of 20 with concurrency 2 and per-row results. App Server has no conditional archive primitive, so post-validation activity remains an explicit TOCTOU residual.
- “从 EyPc 移除” is plugin-local suppression, never Codex deletion. Native absent→present clears stale suppression. Native order remains read-only; local pins append after native pins and can be reordered without mutating Codex state.
- The floating child is host-owned and auto-collapses about `100ms` after pointer/focus departure unless focus, resize or archive confirmation still owns interaction. It has no Pin or manual-collapse controls. It does not mount the main app's `OperationTooltipLayer` and never uses native `title`; the quota surface stays bubble-free, while rows and operations use an opaque child-owned 500ms/200ms information layer. On macOS the parent reapplies always-on-top and all ordinary/full-screen Space visibility after creation, display migration and geometry rebuild; only privacy-safe capability booleans cross to settings diagnostics.
- [FloatApp.vue](../../src/FloatApp.vue#L1) owns fixed 32px short-character action rails and same-slot confirmation. Two or more visible selections create an absolutely positioned batch toolbar inside the list stage; placement is recomputed against the focused or last-selected row and switches to the opposite top/bottom edge without reordering or translating task rows.
- [preload/index.js](../../preload/index.js#L1) also owns a privacy-safe activity inventory derived from the last verified snapshot. App Server status notifications emit anonymous deltas immediately; `readActivitySnapshot` performs only complete unarchived `thread/list` pagination. [codexController.ts](../../src/runtime/codexController.ts#L1) schedules the lane at 200ms single-flight, backs off to 1s after three failures, applies status-only deltas in memory and requests a full verified snapshot for structural inventory changes.
- The GUI/NVM launch failure, local-PAC timeout, cross-process task-state and additive-preload version-skew detection orders are preserved in [codex-gui-nvm-launcher-path.md](error-memory/codex-gui-nvm-launcher-path.md#L1), [codex-gui-pac-proxy-timeout.md](error-memory/codex-gui-pac-proxy-timeout.md#L1), [codex-cross-process-notloaded-is-not-completion.md](error-memory/codex-cross-process-notloaded-is-not-completion.md#L1) and [codex-preload-capability-version-skew.md](error-memory/codex-preload-capability-version-skew.md#L1).

## Verification

- Project gates are listed in [../specs/PROJECT_STATUS.md](../specs/PROJECT_STATUS.md#L1).
- MQTT verification evidence is indexed in [../specs/2606231645-eypc-mqtt-websocket-tab/06-sync-doc.md](../specs/2606231645-eypc-mqtt-websocket-tab/06-sync-doc.md#L1).
- Codex companion verification is recorded in [../specs/260718/1148-codex-quota-float/verify.md](../specs/260718/1148-codex-quota-float/verify.md#L1).
- Detailed maintenance facts and update triggers are in [technical-details.md](technical-details.md#L1).
