---
id: eypc-req-codex-raw-056
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-056
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / supersedes-RAW-030-unread-and-RAW-045-live-channel / visible-degradation-refined-by-RAW-089"
supersedes:
  - eypc-req-codex-raw-030
---

# RAW-056 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

Easy Agent 尚未实现时，EyPc 采用双通道临时适配：Codex App Server 继续负责额度、模型、库存、创建和可验证的持久化归档；macOS 本机 Codex Desktop 私有 IPC 伴随桥只负责实时 `Input / 正在进行中 / 已完成未读` 权威及归档后的侧栏刷新通知。只有桌面桥 `connected` 的 live snapshot/patch/request/read-state 才能产生 `waiting-input / waiting-approval / active`；桥未运行、连接失败或协议不兼容时不得猜测完成，RAW-089 后产品界面统一显示“进行中”，而非“宿主状态未知”。完成未读只由“最新 Turn 已完成 + Codex 自身 `hasUnreadTurn`”成立；桌面未连接时可读取 Codex Desktop 持久化 unread 集合作为 `desktop-persisted` 权威，但 EyPc 打开、隐藏或恢复任务均不得更改它。桌面全量会话快照可在 preload 内瞬时用于状态投影，但正文、摘要、raw ID、cwd/路径不得进入 Renderer、存储、日志或文档；socket 目录/文件 owner 与 mode 必须安全，协议版本不匹配 fail-closed。归档仍先走 App Server `thread/archive` 并完成 `archived=false/true` 双向验证，随后向已连接桌面端发送版本化 `thread-archived` 通知；通知失败不回滚已验证的持久化归档，但 UI 必须区分“已通知刷新”和“桌面端未确认即时刷新”。普通活动 watchdog 为 `5s`，连续三次失败时临时 `1s`；Easy Agent 后续可替换当前两条 provider 通道而不改 Renderer 匿名投影。开发验收仍由用户负责，本轮不运行测试、类型、构建、uTools、截图、真实预检、真实归档或项目移除。
