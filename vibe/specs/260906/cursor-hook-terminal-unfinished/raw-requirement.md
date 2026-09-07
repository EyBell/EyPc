# RAW-214：Cursor 钩子终态后会话残留 unfinishedRunAt 不得保持进行中

Tool: cursor · Date: 2026-09-06 · Level: Standard（需求）

spec_id: SPEC-260906-CURSOR-HOOK-TERMINAL-UNFINISHED

## 用户原话

> Cursor那个进行中的任务是有问题的 当前已经结束 已完成 已读了
>
> F1a, b

上一轮裁决：F-1-a 计数-only 探针；F-1-b 按探针改适配器。

## 规范化需求

1. Cursor 钩子折叠为 `completed` 或 `stopped` 后，会话残留 `unfinishedRunAt` 不得单独把根任务保持进行中。
2. 活分叉 `unfinishedRunAt` 仍使父卡进行中。
3. 磁盘 `aborted` 且 Turn 仍开着时仍是进行中。磁盘 `completed` 且无活冷路径时，陈旧 `turnOpen` 仍不得单独定进行中。
4. 未读车道独立：`hasUnreadMessages=false` 不单独把相位打成完成。

## 需求变更评审

`scanned_owners`：PRD L238 Cursor 相位、RAW-206、09-05 磁盘 completed 与陈旧 turnOpen。

| 操作 | 条款 | 处置 |
| --- | --- | --- |
| added | 钩子终态压过会话残留 unfinishedRunAt | 对齐域函数已有顺序 |
| unchanged | aborted + 开 Turn 仍 running | 09-05 门禁保留 |
| unchanged | 活分叉使父卡 running | Codex side-chat 同类 |
