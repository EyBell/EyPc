---
id: eypc-req-codex-raw-036
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-036
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active"
---

# RAW-036 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

时间窗口位于 Codex 设置，默认 30 天、可填 1–365 天、滚动边界包含；最近提问时间严格取最新 Turn `startedAt`，不以 `updatedAt` 回退。存在 Turn 却缺时间、分页失败或项目状态不可解析时整批失败，保留上一份已验证 stale 快照或展示错误空态。
