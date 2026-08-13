---
id: eypc-req-codex-raw-112
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-112
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-089-094-096-104-110-111"
relations:
  - refines-RAW-089-094-096-104-110-111
---

# RAW-112 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户在重载当前源码后继续观察到浮窗仍有两条实际已结束的“进行中”，并指出开始本次任务可能再增加第三条。授权的只读 Computer Use 展开浮窗后确实观察到 3 条；当前源码匿名预检也把三条都投影为 `desktop-live active`，但它们各自最新 Turn 均明确为 `interrupted`，且三条 `desktopActiveSince` 在每次新订阅时于毫秒级同时重新生成。根因是 Desktop `thread-stream-following-changed` 后的首次 snapshot 会重放历史 `threadRuntimeStatus.active`，而 preload 把“订阅快照”误当成“刚观察到 active 转换”，从而给 terminal 任务重建 active interval；这不是 Renderer 计数或 Controller 展示筛选分叉。首次订阅 snapshot 只能作为待核验证据：当其为 active、没有 input/approval request，且已知最新 Turn 为 completed/failed/interrupted 时，沿用现有 3 秒 `[0,300,1000]` 单任务读取，在核验期间继续保守显示进行中。只有 snapshot 的 activity revision 与任务映射始终未变化、最后一次成功读取仍确认同一或更新 terminal Turn 时，才抑制这一次未获佐证的 snapshot active，并发布 `desktop-live idle` 与既有 `targeted-after-exit` terminal 证据，使 completed 或 stopped、角标、卡片和归档能力一次收敛。任何更新的 inProgress Turn、等待请求、runtime/request activity patch、activity revision/映射变化都会取消抑制并立即恢复 active；读取失败、bridge failed 或权威缺失仍保持 ongoing，不得以超时猜完成。真实 `turn/started` 恢复 active 时不得再发起多余 latest-Turn 核验。该语义将端到端合同提升为 `task-state-v2`；不新增 Renderer/Controller timer、通用 debounce、持久化或协议身份字段，不改变 50ms 合并、缺失隔离、完成展示窗、Projection V3、动作、存储或迁移。既有 bridge 测试文件只补合同不执行；状态保持 `reported / 未校验，待用户验收`。
