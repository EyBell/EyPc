# RAW-207：同一 Turn 仍进行中的精确提问公开为待输入

Tool: cursor · Date: 2026-09-03 · Level: Standard（需求）

spec_id: SPEC-260903-SAME-TURN-WAITING-INPUT

## 用户原话

> F1a 并且还需要合照一下其他Agent平台类似的这个问题

上一轮裁决 F-1-a：Kernel 在 Turn 仍 running 时也要把打开的精确提问/审批投影为待输入或待确认，并补 running+interaction 回归。本条要求对照 Codex / Claude / Cursor / CodexHost 同源缺口一并修。

## 规范化需求

1. Kernel 对精确、当前、未解决的 `user-input` / `approval` / Plan 选择或实施 interaction，公开相位为待输入或待确认，即使 `activityPhase` 仍是 `running`。不得因此发布 completed-unread 中间帧。更新 running 且该实例已从 interaction 账本清除时，立即回到进行中。
2. 根任务成员聚合 live 优先级与 RAW-165 一致：`waiting-approval > waiting-input > running`。
3. Cursor 阻塞待决（`hasBlockingPendingActions` / AskQuestion）必须把 `interactionKind` 送进 Kernel interaction 车道，不能只停在适配器观察上。
4. Claude AskUserQuestion 已在会话 reducer 把 phase 写成 `waiting-input`，保持该路径；CodexHost `attention=input` 已打 `waitingOnUserInput` 旗标，保持该路径。不得为它们另造 Provider。

## 需求变更评审

`scanned_owners`：RAW-189（terminal 上 interaction 先于 unread）、RAW-206（Cursor 阻塞待决）、RAW-165（attention 优先于 running）、帮助「待输入热同步」。

| 操作 | 条款 | 处置 |
| --- | --- | --- |
| refined | RAW-189 仅覆盖已完成任务上的 interaction | 扩展到同一 Turn 仍 running 的精确当前 interaction |
| refined | RAW-206 适配器已标 user-input | 补上 Preload 把 kind 送进 Kernel 的缺口 |
| unchanged | 较旧 refollow waiting 不得否决更新 App Server running | 仍要求 interaction 账本先被新 running 清掉 |
