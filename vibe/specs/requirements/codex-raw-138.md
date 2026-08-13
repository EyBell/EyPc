---
id: eypc-req-codex-raw-138
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-138
status: active
domain: companion-codex
authority: user-stated
source_annotations: "automated-verified-host-pending / refines-RAW-067-122-128-137 / read-replay-and-successful-open-acknowledgement"
relations:
  - refines-RAW-067-122-128-137
---

# RAW-138 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户在最新插件中复验确认“已完成未读”仍未随 Codex 已读收敛，并明确要求插件卡片成功打开任务后自动转为已读，同时核查 Codex App 已读到插件的连接缺口。当前宿主只读证据确认运行包已含 RAW-137，当前 Codex IPC owner 使用预期的 revisioned stream/read 协议；两次精确 read-state 广播发生在插件新进程启动之前，App Server 不会补发，而原生 unread 集合仍保留旧 `true`，导致重连的当前 snapshot `false` 被 RAW-137 的 persisted-first 规则反压。修复后顺序细化为：当前会话精确 read-state event 或插件成功打开 Deep Link 后的会话期确认最高；initial/refollow 的明确 `false` 可清除遗漏事件留下的 persisted `true`；当前可解析原生集合的成员/非成员继续压过 snapshot `true`；原生不可用才回退 snapshot。完成发布统一清除任何完成前/open 产生的旧 `false`，使新 Turn 可重新未读。所有插件任务打开入口复用同一 Host open 路径，只有 `openExternal` 成功才把 parent 与已知 Side Chat 聚合标为已读；打开失败不改状态。该确认不落盘、不写 Codex 原生文件、不恢复 legacy receipt、不增加公开字段；当前 v11/v2 仍 fail-closed，另只兼容本机已核验的旧 v6/v1 同形 payload。Bridge `67/67`、Bridge+Controller `116/116`、最终 `pnpm run verify` 的 `722/722`（`57/57` 文件）、typecheck、production build、三类 preload 与 uTools runtime validation 均通过；新包尚未重载进真实 uTools，卡片打开与关闭期已读恢复保持 host-pending。
