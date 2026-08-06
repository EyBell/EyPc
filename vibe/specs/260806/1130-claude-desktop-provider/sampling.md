# P0-1 采样清单（脱敏，仅结构）

样本：本机一个运行中 Cowork 会话（用户执行 cp 拷入 `_to_delete/`，用后可删）。audit.jsonl 1248 行 / 5.3MB；元数据 json 121KB。

## local_<uuid>.json 关键字段（实测）

- `sessionId` = `local_<uuid>`；`cliSessionId` = 裸 uuid（被包装的 Claude Code CLI 会话）
- `createdAt` / `lastActivityAt` = epoch 毫秒；**运行中分钟级心跳更新**
- `cwd`、`userSelectedFolders[]`、`model`、`isArchived`、`title`、`scheduledTaskId`、`spaceId`、`permissionMode`
- 内容承载字段（**桥不得读取**）：`systemPrompt`、`initialMessage`、`accountName`、`emailAddress`、`slashCommands`、`coworkSyspromptMap` 等 40+ 键

## audit.jsonl 事件词表（type/subtype → 归一类别）

| 原始 | 频次 | 归一 |
| --- | --- | --- |
| system/thinking_tokens | 670 | activity |
| assistant / user | 278+171 | activity（message 字段含正文，**丢弃**） |
| system/status（status=requesting） | 101 | status（运行中心跳） |
| command_lifecycle（queued/started/completed） | 13 | command-started / command-completed |
| system/init | 4 | init |
| rate_limit_event | 4 | rate-limit：`rate_limit_info={status, resetsAt(epoch 秒), rateLimitType=five_hour, overageStatus…}`，**有精确重置时刻与限流状态，无百分比** |
| result/success | 3 | result（回合终态，= CLI 的 Stop） |
| system/permission_request / permission_response | 2+2 | permission-request / permission-response（tool_input 含正文，只取 granted） |

- 时间戳 = ISO 字符串；`_audit_hmac` / `_audit_timestamp` 为审计链字段（只读不验）。
- **`audit.session_id === metadata.cliSessionId`**（1244/1248 行；余 4 行为本地会话内 uuid）→ 跨 provider 去重键坐实。
- rate_limit_event 约每 30–45 分钟一发。

## 对设计的直接影响

1. 事件级状态机可行（P1-1 已按此实现），不再只靠增长脉冲；未知 type 容错归 activity（RAW-094 教训）。
2. 额度修正：桌面端可提供 5h 窗口 `resetsAt` 与限流事实，可在 Phase 3 作为 resetAt 校准/限流提示的**辅助**来源；百分比仍只能来自 statusline / usage API。
3. 隐私规则落地：归一化只保留 type/subtype/state/timestamp/granted/rate_limit_info 标量（tests 断言正文字段不存活）。
