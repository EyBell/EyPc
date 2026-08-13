---
id: eypc-req-claude-raw-027
qualified_source: SPEC-260807-CLAUDE-CODE-COMPANION-AUTHORITY-RESET::RAW-027
status: active
domain: companion-claude
authority: user-stated
---

# RAW-027 · companion-claude

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260807/claude-code-companion-authority-reset/raw-requirement.md#L1)。

修复 Claude 从进行中到已完成未读被吞和延迟后已在 App 打开而消失：最终任务包对 Claude membership/phase/unread 使用独立 generation，任一 lane 不得推进或覆盖其它 lane；Host 与 Renderer 的 state/inventory/unread 订阅必须多播，不得以单 callback 覆盖；Host 早于首个 inventory 订阅时，首次冷 inventory 必须动态安装发现目录 watcher；并发 unread 读取加入同一 Promise，异步结果提交前在最新任务包上重放且拒绝旧 generation。正常可信推送不得触发 quota/environment/full inventory，只有冷启动、重连或明确 membership gap 才执行 Claude-only inventory。列表和循环层内按最近提问倒序，第一下前后任务立即打开，只有 in-flight 时才保留最终尾随目标。
