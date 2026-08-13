---
id: eypc-req-codex-raw-069
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-069
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / supersedes-RAW-063-independent-active-counter-delay"
---

# RAW-069 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

“进行中 → 已完成/已完成未读”采用 Controller 级、按任务独立且可中断的固定 2 秒展示稳定窗。底层首次给出权威完成证据时，原始快照立即保留该证据，但所有 Renderer 投影在 2 秒内继续统一输出 `bucket='ongoing'`、`activityState='ongoing'`、`state='running'`、`archiveCapability='blocked-active'` 与 `canArchive=false`；卡片、动态/项目/已隐藏分组、详情、Shift 预览、进行中/未读/已完成角标和归档入口必须同步消费这一投影。若 2 秒内任务重新变为 active/ongoing，则立即取消完成切换；只有底层完成状态连续保持满 2 秒，才一次性发布真实 completed/completed-unread、完成时间与可归档能力。重复完成快照不得延长窗口，任务重新进行后再次完成则开始新的 2 秒窗口；新加载时已完成且没有本次进行中前态的任务不延迟。删除 Renderer 原有独立进行中角标 2 秒合并器，避免任务状态与角标错位或累计 4 秒。该窗口仅延迟展示已经权威成立的完成态，不得用经过时间推断完成，不新增 API、持久化字段或迁移。本轮不修改或运行测试，不运行 typecheck、build、uTools、截图或真实 Codex 操作，交付仍由用户验收。
