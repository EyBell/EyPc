# EyPc Project Status Hub

Tool: codex
Date: 2026-07-30

## Purpose

This hub routes current implementation, verification gates and durable authorities. Product behavior belongs in [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md#L1); architecture and implementation facts belong in [ARCHITECTURE.md](../knowledge/ARCHITECTURE.md#L1) and [technical-details.md](../knowledge/technical-details.md#L1).

## Current Snapshot

- Product: keyboard-first uTools plugin for local PC capability calls.
- Active lines: port management, file favorites, cross-platform window jump, MQTT workbench, Quick Jump, Codex Companion and settings feature help.
- Development acceptance is user-owned. Automated/static evidence below does not claim real uTools, cross-platform or production acceptance unless explicitly stated.

## Codex Companion

- Authority: [current spec](260718/1148-codex-quota-float/spec.md#L1), [verification](260718/1148-codex-quota-float/verify.md#L1), [handoff](260718/1148-codex-quota-float/handoff.md#L1).
- Current requirement: RAW-116–129. `task-state-v3` carries activity/Turn provenance and a monotonic Activity generation, keeps v2/legacy sources as degraded atomic packages, and never clears tasks solely for revision skew. Exact App Server active/Turn-started events establish `app-server-live`; same-revision exact started/inProgress may move forward, and exact/corroborated completed may use startedAt when completedAt is absent. Codex native read-state is sole unread authority; late true may verify ambiguous inactive or stale-active rows without becoming Activity/Turn authority. Residual closeout aligns quota-auto with any returned ordinary zero window, retires the obsolete card-color preview path and keeps static source tests within real structure boundaries.
- State invariant: real activity patches open a new epoch; delta and full snapshot share one active-exit reducer that reads confirmed provenance from the candidate itself. Unchanged pre-active terminal stays ongoing and cannot clear the baseline; accepted exact/targeted/corroborated terminal closes the epoch. Stopped additionally requires explicit failed/interrupted plus exact idle/not-running; missing outcome remains ongoing. Full inventory preserves stronger session evidence and carries a generation barrier. Known/present task updates are never batch-blocked by unknown/missing rows. Compatible Turn verification reuses one bounded cycle; initially/newly true unread or mode/epoch change may start or replace it, while unchanged polling does not. Read-state changes unread only.
- Removed paths: completion presentation hold/timer/held-card rewrite, its visible setting and normalized `completionPresentationDelayMs`; provider/local cross-clock ordering; historical card-color preview/cancel/commit Runtime actions and Controller transient override. Initial-snapshot corroboration, 50/200ms structural coalescing, watchdog, 15s reconciliation and missing-key quarantine remain.
- Verification: Bridge `51/51`, Controller `38/38`, RAW-128 状态链专项 `115/115`, Codex 状态矩阵 `168/168`, 9 个 Codex 文件 `189/189`, 完整仓库 `633/633`；ordinary/recovered completion-unread、inventory/generation/mixed-key/missing-row 隔离、冷启动/晚到 unread 主动复核、same-revision restart、full-snapshot confirmed terminal、旧 completed 退出拒绝、真实 stop、任一普通窗口归零切 Spark、外观直存直渲和边界化静态断言均通过。类型、正式 build、uTools runtime、preload 语法、canonical/public 镜像与文档链接门禁见当前验证记录。
- Gate: normal uTools reload plus real ordinary/recovered active→completed, stopped↔active, task-switch and badge/list atomicity acceptance remain user-owned. No real task, archive, project removal or process operation was performed.
- Reusable failure routing: [six task-state evidence boundaries](../knowledge/error-memory/README.md#L1); fixture contract: [float-bridge mock drift](../knowledge/error-memory/codex-float-bridge-mock-contract-drift.md#L1).

## Other Active Deliveries

- Window Jump: [spec](260724/1527-window-jump-workbench/spec.md#L1) / [verify](260724/1527-window-jump-workbench/verify.md#L1). WJ-18 keeps same-API Core Graphics title verification and exact CG→AX focus; real unchanged-target retry and cross-platform host acceptance remain pending.
- File Favorites: [traceability](260711/1452-file-favorites-workbench/requirements-traceability.md#L1). Automated acceptance remains `36 files / 332 tests`; real macOS uTools file-action and Windows/Linux checks remain pending.
- Cross-tab command panels: [spec](260713/0834-cross-tab-responsive-command-panels/spec.md#L1) / [verify](260713/0834-cross-tab-responsive-command-panels/verify.md#L1). Shared panels/tooltips and responsive browser matrix are accepted; real host file actions remain pending.
- Quick Jump: [spec](260718/0947-quick-jump-center-overlay/spec.md#L1). Target-center overlay automated/browser acceptance is retained; real uTools visual smoke remains pending.
- MQTT: [current sync](2606231645-eypc-mqtt-websocket-tab/06-sync-doc.md#L1); multi-select merged JSON export: [spec](260730/1016-mqtt-multi-export/spec.md#L1); tooltip/shortcut identifiability polish: [spec](260730/1044-mqtt-tooltip-shortcut-polish/spec.md#L1) / [verify](260730/1044-mqtt-tooltip-shortcut-polish/verify.md#L1), now wired through product `data-operation-*` tips; development acceptance user-owned after reload hover check.
- Settings help: [raw requirement](260729/1135-settings-feature-help/raw-requirement.md#L1); `EYPC-FEATURE-HELP-001` coverage remains active.

## Active Process Index

| Concern | Authority | Verification |
| --- | --- | --- |
| Codex quota/task companion | [spec](260718/1148-codex-quota-float/spec.md#L1) | [verify](260718/1148-codex-quota-float/verify.md#L1) |
| Window jump and stable slots | [spec](260724/1527-window-jump-workbench/spec.md#L1) | [verify](260724/1527-window-jump-workbench/verify.md#L1) |
| Settings feature help | [raw](260729/1135-settings-feature-help/raw-requirement.md#L1) | [verify](260729/1135-settings-feature-help/verify.md#L1) |
| Quick Jump overlay | [spec](260718/0947-quick-jump-center-overlay/spec.md#L1) | Spec-owned |
| Cross-tab panels | [spec](260713/0834-cross-tab-responsive-command-panels/spec.md#L1) | [verify](260713/0834-cross-tab-responsive-command-panels/verify.md#L1) |
| File favorites | [traceability](260711/1452-file-favorites-workbench/requirements-traceability.md#L1) | Task-owned |
| MQTT workbench | [sync](2606231645-eypc-mqtt-websocket-tab/06-sync-doc.md#L1) / [multi-export](260730/1016-mqtt-multi-export/spec.md#L1) / [tooltip polish](260730/1044-mqtt-tooltip-shortcut-polish/spec.md#L1) | User-owned acceptance |
