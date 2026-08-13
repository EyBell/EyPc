---
id: eypc-req-claude-raw-031
qualified_source: SPEC-260807-CLAUDE-CODE-COMPANION-AUTHORITY-RESET::RAW-031
status: active
domain: companion-claude
authority: user-stated
---

# RAW-031 · companion-claude

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260807/claude-code-companion-authority-reset/raw-requirement.md#L1)。

Claude Hook 已写队列但隐藏 Host 未及时消费属于 P0。状态、任务成员关系与 unread authority 必须在进程生命周期 Host 中以原生文件回调立即 drain/read，首个真实变化不得进入可被 `background-hidden` 节流的 JavaScript timer；已登记目标通知丢失由 1 秒 Node StatWatcher 恢复。部分任务 JSON 保留最后可信成员关系，同值 unread 指纹零通知；语义不变时零 revision、零 Main/Float 推送，状态真实终点以 Float applied ACK 计时。
