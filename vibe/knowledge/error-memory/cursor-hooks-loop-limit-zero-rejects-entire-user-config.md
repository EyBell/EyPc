---
id: eypc-cursor-hooks-loop-limit-zero-rejects-entire-user-config
status: verified
scope: project
fingerprint: cursor-user-hooks-json-schema-rejects-loop-limit-zero__entire-file-dropped__coerce-nonpositive-loop-limit-on-write
first_seen: 2026-08-21
last_verified: 2026-08-21
review_after: 2026-11-21
evidence:
  - preload/cursor/settings.cjs
  - tests/platform/cursorHooks.test.ts
  - vibe/specs/260818/1335-cursor-companion-feasibility/spec.md
tags:
  - companion-provider
  - cursor-companion
  - external-config
  - hooks
---

# Cursor 用户级 hooks.json 任一 loop_limit:0 会拒收整份配置

## 症状

EyPc 已加法写入 11 条用户级 Cursor 钩子，设置页显示已注册，本机 Agent 提问后私有队列仍 0 字节，卡片不进「正在进行中」。Cursor 只执行 Claude 映射钩子，不执行 `~/.cursor/hooks.json` 里的 EyPc 脚本。

## 错误假设

假设 hooks.json 只要是合法 JSON、且 EyPc 自己的 handler 没有 `failClosed` / `loop_limit`，Cursor 就会加载整份 user config。保留用户原有 `stop` 钩子的 `loop_limit: 0` 被视为无害。

## 已验证根因

Cursor 3.17.8 hooks 日志：`Invalid user config: stop[0]: Hook script loop_limit must be a positive integer (use null for no limit)`，随后 `Failed to parse user hooks configuration`。同一文件里的 EyPc handler 全部不加载。本会话 hook stdin 已证实 `composer_mode=agent`，且含 `conversation_id` / `hook_event_name`；脚本本身对这种 payload 能入队。失败点在配置加载，不在脚本解析。

## 检测顺序

1. 看 Cursor `cursor.hooks.*.log` 是否出现 `Failed to parse user hooks configuration`，不要先怀疑脚本 sed。
2. 对照错误里的 handler 下标（本例 `stop[0]`）读用户自有字段，优先查 `loop_limit: 0`。
3. 确认执行源是 `claude-user` / `claude-project` 而不是 user `hooks.json`。
4. 用与日志同形的 stdin 探针脚本；能入队则排除解析器。

## 预防规则

写回 `~/.cursor/hooks.json` 时，对**全部** handler（含用户保留项）把非正数 / 非整数 `loop_limit` 收成 `1`；`null` 与正整数保持原值。Agent 仍不得直接改用户真实 hooks 文件。注册后必须看 hooks 日志不再报 Invalid user config，且队列在下一次本机 Agent 提问后增长。

## 替代路线

- 状态：`verified`。
- 前置条件：向用户级 Cursor `hooks.json` 做加法注册。
- 有序步骤：合并用户 handler → sanitize `loop_limit` → 用户在设置页确认写入 → 看 hooks 日志与队列。
- 验证：`pnpm exec vitest run tests/platform/cursorHooks.test.ts`；宿主重载插件后点重新注册，再发一条本机 Agent 消息。
- 适用边界：Cursor 原生 user hooks schema；Claude `settings.json` 不走这条校验。
- 回退：用户把 `loop_limit: 0` 手改成 `1` 后 Cursor 会热加载；不要由 Agent 写该文件。

## 记录历史

| 日期 | 任务 | 触发 | 失败路线 | 恢复 | 结果 |
| --- | --- | --- | --- | --- | --- |
| 2026-08-21 | Cursor companion 二期热路径 | 用户在本机 Cursor Agent 提问后卡片不进进行中 | 保留用户 `loop_limit: 0` 导致整份 user hooks 拒收 | 写入时收成 `1`；等待宿主重新注册 | candidate |
| 2026-08-21 | 同任务宿主续核 | 用户重打包插件后要求再读日志 | 无；`loop_limit=1` 后 `Loaded 13 user hook(s)`，队列从 0 增长 | 热路径点火，本会话 canary 入队 | verified |
