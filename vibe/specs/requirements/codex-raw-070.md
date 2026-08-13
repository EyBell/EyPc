---
id: eypc-req-codex-raw-070
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-070
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-066-and-RAW-069"
relations:
  - refines-RAW-066-and-RAW-069
---

# RAW-070 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

针对手动关闭临时任务时上游状态在 `active` 与 `interrupted` 之间闪烁的问题，保留 Desktop live `active` 的最高优先级；当任务已明确为非 active 的 `interrupted` 且其最新 `updatedAt` 持续至少 60 秒未变化时，领域投影生成完成 revision，进入 `completed` 或 `completed-unread`，不再永久显示进行中。60 秒内仍保持 ongoing；`notLoaded`、`unknown`、connector-only active 和无明确 interrupted 证据不得通过时间完成。该宽限只收敛已有中断证据，不把时间、刷新或普通 `updatedAt` 变成完成证据；现有 Controller 统一 2 秒展示稳定窗继续有效，不新增 API、持久化字段或迁移。本轮不修改或运行测试，不运行 build、uTools、截图或真实 Codex 操作，静态编译与结构核验后交付用户验收。
