# EyPc Project Status Hub

Tool: codex
Date: 2026-07-31

## Purpose

This hub routes current implementation, verification gates and durable authorities. Product behavior belongs in [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md#L1); architecture and implementation facts belong in [ARCHITECTURE.md](../knowledge/ARCHITECTURE.md#L1) and [technical-details.md](../knowledge/technical-details.md#L1).

## Current Snapshot

- Product: keyboard-first uTools plugin for local PC capability calls.
- Active lines: port management, file favorites, cross-platform window jump, MQTT workbench, Quick Jump, Codex Companion and settings feature help.
- Development acceptance is user-owned. Automated/static evidence below does not claim real uTools, cross-platform or production acceptance unless explicitly stated.

## Codex Companion

- Authority: [current spec](260718/1148-codex-quota-float/spec.md#L1), [verification](260718/1148-codex-quota-float/verify.md#L1), [handoff](260718/1148-codex-quota-float/handoff.md#L1).
- Current requirement: RAW-116–134. RAW-131 implements all seven P1 found beyond RAW-130: stale-active readers now carry a positive-epoch barrier; conflicting terminal snapshots project unavailable/ongoing instead of synthetic idle; every exact active activity patch—including active→active waiting—opens a new epoch; missing-row mappings survive the Controller quarantine but verified archive removes them immediately; Side Chat initial/exit reads target child Turns and inventory replays all affected parents; generation orders the entire same-source delta plus subsequent V2 full snapshots; and stopped is `blocked-stopped` through Domain/Controller/Host/UI. RAW-132 keeps those gates frozen while centralizing parent aggregation, deferring one child's terminal when another branch remains exact active, and exposing only generation-guarded anonymous decision counters. RAW-133 makes Domain the sole diagnostic-shape owner, adds diagnostics-only single-notify semantics, compacts/focus-gates the Runtime details and isolates counters from the live region. RAW-134 makes the floating Dynamic-tab activity window user-configurable in the task settings, defaults it to 24 hours and keeps cards, active count, task cycling and the next boundary in the same Controller package. `task-state-v3` remains the base, but acceptance still requires the changed contracts to execute and real-host acceptance.
- State invariant: real activity patches open a new epoch; only a Desktop non-active activity patch whose private sequence is strictly later than the current App Server active event may revoke `app-server-live`. Delta and full snapshot share one active-exit reducer that reads confirmed provenance from the candidate itself. Unchanged pre-active terminal stays ongoing and cannot clear the baseline; accepted exact/targeted/corroborated terminal closes the epoch. Stopped additionally requires explicit failed/interrupted plus exact idle/not-running; missing outcome remains ongoing. Full inventory preserves stronger session evidence, the private live-event waterline and a bidirectional generation barrier; stale delta bridge-state fields and lower/generationless V2 snapshots cannot cross it. Known/present task updates are never batch-blocked by unknown/missing rows. Compatible Turn verification reuses one bounded cycle; initially/newly true unread or mode/epoch change may start or replace it, while unchanged polling does not. Side Chat initial and final-active-exit rereads target the causal child. Read-state changes unread only.
- Removed paths: completion presentation hold/timer/held-card rewrite, its visible setting and normalized `completionPresentationDelayMs`; provider/local cross-clock ordering; historical card-color preview/cancel/commit Runtime actions and Controller transient override. Initial-snapshot corroboration, 50/200ms structural coalescing, watchdog, 15s reconciliation and missing-key quarantine remain.
- Verification: RAW-129 基线保留 Bridge `51/51`、Controller `38/38`、RAW-128 状态链专项 `115/115`、Codex 状态矩阵 `168/168`、9 个 Codex 文件 `189/189`、完整仓库 `633/633`。RAW-131 已改写错误的 synthetic-idle/stopped-archive 期望并新增闭合矩阵合同；RAW-132 增加生产父解析器、Side Chat 多分支终态延后和旧代次诊断拒绝合同；RAW-133 再增加完整父聚合真值表、诊断规范化与 diagnostics-only 单通知、原生帮助按钮/live-region 源码合同；RAW-134 复用现有 Domain/Controller/UI 文件补默认/边界、配置筛选、即时重投影与配置页源码合同。2026-07-31 修复反向 generation 屏障测试夹具的异步 release TS2349 后，`pnpm run typecheck` 已通过；RAW-134 后未执行 Vitest、typecheck、build、preload 语法和真实宿主，当前运行状态仍为 `implemented-unverified`。
- Gate: RAW-131/132 闭合转换矩阵与回归安全合同执行，以及 normal uTools reload/真实 ordinary/recovered active→completed、stopped↔active、task-switch、Side Chat、多分支、badge/list/action atomicity 验收仍为 acceptance blocker。没有操作真实任务、归档、项目移除或进程。
- Reusable failure routing: [six task-state evidence boundaries](../knowledge/error-memory/README.md#L1); fixture contract: [float-bridge mock drift](../knowledge/error-memory/codex-float-bridge-mock-contract-drift.md#L1).

## Other Active Deliveries

- Window Jump: [spec](260724/1527-window-jump-workbench/spec.md#L1) / [verify](260724/1527-window-jump-workbench/verify.md#L1). WJ-19 through WJ-19.3 make native instance identity authoritative, remove title-based matching/rebind, keep replacement confirmation stable across empty/partial refreshes, and centralize its lifecycle/effects/action policy behind one session state machine. Implementation/contracts are updated; tests/typecheck/build/uTools/native acceptance remain pending.
- File Favorites: [traceability](260711/1452-file-favorites-workbench/requirements-traceability.md#L1). Automated acceptance remains `36 files / 332 tests`; real macOS uTools file-action and Windows/Linux checks remain pending.
- Cross-tab command panels: [spec](260713/0834-cross-tab-responsive-command-panels/spec.md#L1) / [verify](260713/0834-cross-tab-responsive-command-panels/verify.md#L1). Shared panels/tooltips and responsive browser matrix are accepted; real host file actions remain pending.
- Global operation tooltip: [spec](260730/2050-global-operation-tooltip-polish/spec.md#L1). All 271 current main-app native buttons have a static name source (including MQTT tooltip helpers); the shared layer now owns title-chord normalization, descriptions, disabled reasons, dynamic refresh and lifecycle cleanup, and suppresses the competing Codex main-page pseudo-tip. Float remains child-owned; development acceptance is user-owned.
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
| Global operation tooltip | [spec](260730/2050-global-operation-tooltip-polish/spec.md#L1) | User-owned acceptance |
| File favorites | [traceability](260711/1452-file-favorites-workbench/requirements-traceability.md#L1) | Task-owned |
| MQTT workbench | [sync](2606231645-eypc-mqtt-websocket-tab/06-sync-doc.md#L1) / [multi-export](260730/1016-mqtt-multi-export/spec.md#L1) / [tooltip polish](260730/1044-mqtt-tooltip-shortcut-polish/spec.md#L1) | User-owned acceptance |
