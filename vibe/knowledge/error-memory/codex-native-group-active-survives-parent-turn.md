---
id: eypc-codex-native-group-active-survives-parent-turn
status: verified
scope: project
fingerprint: native-connector-still-active__parent-turn-completed-closes-live__codex-plus-split-child__keep-group-running
first_seen: 2026-09-16
last_verified: 2026-09-16
review_after: 2027-09-16
evidence:
  - preload/companion/evidence-adapter-v7.cjs
  - tests/platform/providerEvidenceAdapterV7.test.ts
  - tests/platform/companionTaskKernel.test.ts
  - vibe/specs/requirements/shared-raw-218.md
tags:
  - companion
  - codex
  - codex-plus
  - topology
  - phase
---

# 原生组仍 active 时，父 Turn 完成不得把根卡送进已完成

## Symptom

Codex++ / Cloud GPT 分屏里主窗已经 Worked 完一轮，子窗仍在 Working、侧栏仍转圈，EyPc 根卡却进了已完成组。

## Wrong Assumption

父线程最新 Turn 的 `completed` 等于整组结束。Goal `complete` 可以压过仍为 `active` 的官方 connector。Host 额外进程「完成优先于残留 Desktop live」同样适用于原生组。

## Verified Root Cause

官方 `thread/list` 在子窗还跑时仍把父行标 `active`。父 Turn 完成后 `terminalSequence` 大于 `activeSequence`，`codexBranchObservationV7` 用 `terminalNewer` 关掉 live；Goal `complete` 权威又高于 `live-turn`。Kernel 归约本身会让 live 子成员压过父终态，但这条路径上子窗还没成为成员，父节点单独被收成 completed。

## Detection Order

1. 原生侧栏转圈或分屏仍有停止键，EyPc 已在已完成组，就是本条。
2. 根卡没有 `sub+N` 时，不要先改 Kernel 聚合。
3. 对照父行 connector `active` 与 `lastTurnStatus=completed`。
4. Host 额外进程（`XH`）走另一条：Host 完成后不得被 Desktop 残留 live 钉住。

## Prevention Rule

原生（含 Codex++）connector 仍 `active` 且已有 live 形状时，保持进行中；父 Turn / Goal complete 不得单独发 terminal/goal 完成候选。Host 额外进程的精确完成后仍不得保持 running。

## Alternative Route

- 状态: `verified`
- 前置条件: 能读官方 connector `status.type` 与父 `lastTurn`。
- 有序步骤:
  1. `nativeGroupStillActive` 时忽略 `terminalNewer`。
  2. live 时 Goal 非 active 视为 superseded，且不发 exact terminal 候选。
  3. 测试：父 Turn completed + Goal complete + 组仍 active → Kernel `running`。
- 验证: `pnpm exec vitest run tests/platform/providerEvidenceAdapterV7.test.ts tests/platform/companionTaskKernel.test.ts`
- 适用边界: 原生 Codex / Codex++。不含 Host `XH` 完成后的 Desktop 残留。
- 回退: connector 已 idle 且无 live 子成员时按终态进入已完成。

## Occurrence History

| 日期 | 任务 | 触发 | 失败路线 | 证据 | 恢复 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-09-16 | Cloud/GPT 主子状态 | 用户 F2：已错误进入已完成组 | 父 Turn completed 关掉 live | Codex++ 侧栏转圈、子窗 Working | 组仍 active 时保持 running | verified |
