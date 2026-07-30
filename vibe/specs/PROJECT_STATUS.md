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
- Current requirement: RAW-116–125. `task-state-v3` carries activity and Turn provenance, keeps v2/legacy sources as degraded atomic packages, and never clears tasks solely for revision skew. Exact App Server active/Turn-started events establish `app-server-live`; ordinary inventory completion cannot suppress them, same-revision exact started/inProgress may move forward, and exact completed may use startedAt when completedAt is absent. Unread remains evidence-separated and exact completion closes the pre-completion unread-false epoch.
- State invariant: real activity patches open a new epoch; exact/targeted/corroborated completion closes it immediately and clears the active-exit baseline. Identical later inventory cannot regress completed to inProgress. Read-state changes unread only.
- Removed paths: completion presentation hold/timer/held-card rewrite, its visible setting and normalized `completionPresentationDelayMs`; provider/local cross-clock ordering is retired. Initial-snapshot corroboration, 50/200ms structural coalescing, watchdog, 15s reconciliation and missing-key quarantine remain.
- Verification: Bridge `40/40`; ordinary/recovered completion unread, active-over-stale-idle, same-revision restart/targeted inProgress and completion without completedAt pass. The full Codex matrix is `152/152`; preload syntax and canonical/public mirror pass. Full `vue-tsc` is currently blocked by unrelated in-progress `tests/runtime/action.test.ts` platform-mock errors and is not claimed green.
- Gate: normal uTools reload plus real ordinary/recovered active→completed, stopped↔active, task-switch and badge/list atomicity acceptance remain user-owned. No real task, archive, project removal or process operation was performed.
- Reusable failure routing: [six task-state evidence boundaries](../knowledge/error-memory/README.md#L1).

## Other Active Deliveries

- Window Jump: [spec](260724/1527-window-jump-workbench/spec.md#L1) / [verify](260724/1527-window-jump-workbench/verify.md#L1). WJ-18 keeps same-API Core Graphics title verification and exact CG→AX focus; real unchanged-target retry and cross-platform host acceptance remain pending.
- File Favorites: [traceability](260711/1452-file-favorites-workbench/requirements-traceability.md#L1). Automated acceptance remains `36 files / 332 tests`; real macOS uTools file-action and Windows/Linux checks remain pending.
- Cross-tab command panels: [spec](260713/0834-cross-tab-responsive-command-panels/spec.md#L1) / [verify](260713/0834-cross-tab-responsive-command-panels/verify.md#L1). Shared panels/tooltips and responsive browser matrix are accepted; real host file actions remain pending.
- Quick Jump: [spec](260718/0947-quick-jump-center-overlay/spec.md#L1). Target-center overlay automated/browser acceptance is retained; real uTools visual smoke remains pending.
- MQTT: [current sync](2606231645-eypc-mqtt-websocket-tab/06-sync-doc.md#L1); multi-select merged JSON export: [spec](260730/1016-mqtt-multi-export/spec.md#L1); tooltip/shortcut identifiability polish: [spec](260730/1044-mqtt-tooltip-shortcut-polish/spec.md#L1), implementation/document sync complete, development acceptance user-owned.
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
