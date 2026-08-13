---
id: eypc-req-codex-raw-161
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-161
status: active
domain: companion-codex
authority: user-stated
source_annotations: "increment-automated-verified / rebuilt-artifact-ready / dev-plugin-reload-pending / external-codex-archive-authoritative-membership-recovery"
---

# RAW-161 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

真实 Codex 与 EyPc 日志共同确认 Desktop 手动归档成功且文件已进入 `archived_sessions`，但两个兼容 archive push 均未到达 EyPc，Kernel 仍保留旧卡片。当前合同不再把 push 当恢复权威：进程 Host 精确监听 `sessions/archived_sessions`，rename 后立即并行全分页读取 `thread/list archived:false/true`，掉通知由一秒 StatWatcher 在 `≤1.25s` 恢复，watcher error 后重建。当前匿名 key 只在 archived 清单时立即发送 urgent `archivedKeys` 并绕过普通缺行隔离；其它歧义只触发 Codex tasks-only。dirty recovery 在 `thread/read` 前排除 archived IDs；插件进入、Desktop IPC 重连与 watcher 重建强制一次 tasks-only 对账。EyPc 自己的 archive 继续受双库存、Desktop ACK 与 Kernel commit 保护；suppression 仅在本地写可能已持久化时保留，verify-1 明确仍 unarchived 时立即释放。Focused `5/5`（4 new）、Bridge `131/131`、typecheck、1871-module build、mirror/syntax、Runtime validator 通过；当前开发模式待加载身份为 `host-78205ae167fc7b27c653 / renderer-9c35abd09a8a390040c5`。
