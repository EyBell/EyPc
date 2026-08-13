---
id: eypc-req-codex-raw-149
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-149
status: active
domain: companion-codex
authority: user-stated
source_annotations: "automated-verified-host-pending / supersedes-RAW-146-attention-order / permission-attention-and-latest-first-progress"
---

# RAW-149 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户要求把 Codex 命令执行、文件修改、权限申请与 MCP elicitation 审批统一纳入 EyPc「待输入」，并让「待输入 / 已完成未读」严格按状态出现时间全局倒序，避免每次都只打开第一条而失去后续任务。现有 Desktop follower 私有 shadow 精确识别 Plan、普通输入、命令/文件/权限审批和 MCP elicitation；请求自带时间优先，缺失时只记录首次观测时间，进程随机盐关联仅用于私有内存中区分同方法无时间请求，原始标识和散列均不跨桥或持久化；请求移除后立即重算，Side Chat 取最新未决时间。公开匿名合同仅增加 `waitingSince / statusEnteredAt`，不携带请求正文、命令、路径、权限内容或原始请求 ID。`task-state-v6` 将 `waiting-input` 与 `waiting-approval` 同时归入待输入，审批不再重复计入进行中；待输入与完成未读跨 Provider 按 `statusEnteredAt DESC` 排序，置顶和 Provider 分组不得覆盖，普通项目页、置顶展示与通用前后任务循环不变。两类专用入口由 Controller 维护匿名持久化打开进度：每个状态实例只由 `task key + statusEnteredAt` 标识，成功 Host 打开（含列表手动打开）才记为已打开，新状态立即插队，随后继续尚未打开旧项；全部打开后在下一次成功触发时从最新项回绕。进度每组最多 200 条，任务离组或时间变化即清旧实例，失败不推进。紧凑提示改为“最新优先，连续触发依次打开”；没有真实待输入时继续使用 EyPc 本地置顶兜底。受影响 `8/8` 文件、`292/292` 测试、typecheck、production build、Preload 镜像/语法、runtime validation 与文档审计通过；真实只读预检已贯通 v6 Provider→Domain/Presentation。运行 uTools 仍为 v5，首次 UI 重接入观察因 Mac 锁屏安全中断，因此非 Full Access 请求的进入/打开/解除与重载遍历仍是 host-pending。EyPc 始终只提示并打开原任务，不批准、拒绝或提交请求。
