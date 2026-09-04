# RAW-208：Claude / Cursor 行上时钟在 Turn 关闭后仍可读

Tool: cursor · Date: 2026-09-04 · Level: Standard（需求）

spec_id: SPEC-260904-COMPANION-DISPLAY-CLOCK

## 用户原话

> F1a, b
> F2a

上一轮裁决：F-1-a 修行上时钟；F-1-b 做匿名对账；F-2-a 维持 Cursor Cloud Agent 排除，只修本机 Composer / Cloud Code 时钟。

## 规范化需求

1. 任务行上的相对时间读公开 `lastQuestionAt`。Turn 仍开着时用 Turn 起点（Cursor `unfinishedRunAt` / hook `turnStartedAt`，Claude `turnStartedAt`）。Turn 关闭后回退到完成时间或最近活动时间，不得显示「时间缺失」。
2. Kernel 接受 metadata 时，入站 `lastQuestionAt = 0` 表示缺失，不得清掉已有时钟；正值仍前进。
3. 包层在 Kernel 与库存卡都缺时钟时，再回退 `lastTurnStartedAt` / 完成水位 / `updatedAt`。这不改变相位、未读或分组。
4. Cursor Cloud Agent（`createdFromBackgroundAgent` / `cloudAgentProjectMembership` / `agentLocation.type=cloud|background`）仍排除出库存。Cloud Code（Claude）走既有本机证据链，只修时钟。

## 需求变更评审

`scanned_owners`：RAW-206（Cursor 库存范围含 cloud 排除）、行上时间展示、Kernel metadata 覆盖。

| 操作 | 条款 | 处置 |
| --- | --- | --- |
| refined | 行上时间只信开着的 Turn | 关闭后回退完成/活动时间 |
| unchanged | Cursor Cloud Agent 排除 | F-2-a 维持 |
