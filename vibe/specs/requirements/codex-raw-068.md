---
id: eypc-req-codex-raw-068
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-068
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / supersedes-RAW-066-interrupted-archive-clause / archive-evidence-refined-by-RAW-089"
---

# RAW-068 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

原始 `interrupted` 只保留在 Host/Turn 协议中供诊断与计时；领域卡片一旦投影为 `activityState='ongoing'`，必须同时得到 `archiveCapability='blocked-active'` 与 `canArchive=false`。因此同一任务在 desktop-live `active` 与持久化 interrupted 之间切换时，任务行、操作抽屉、Shift 预览、单项确认和批量候选都保持同一“进行中且不可归档”合同，固定 `归` 槽只稳定禁用，不因来源更新闪烁。Controller 不为 interrupted 发送 terminal 证据；Host 单条归档重读到 interrupted 时返回 active-task，项目全部归档将 interrupted 计入进行中跳过集合。该条历史上保留 completed/failed 归档和 system-error/unknown 警告；RAW-089 已将其收紧为只有 completed 可归档，其余全部进行中且不可归档。
