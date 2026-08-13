---
id: eypc-req-codex-raw-026
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-026
status: superseded
domain: companion-codex
authority: user-stated
source_annotations: "superseded-by-RAW-031-and-RAW-155-no-fixed-count-window"
superseded_by: eypc-req-codex-raw-031
---

# RAW-026 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

已完成待查看 receipt 不得因读失败、旧的固定数量窗口、Codex 已归档或重启而丢失。固定任务数量窗口现已废止；EyPc 对完整未归档分页结果建立状态投影，只在内存中保留 raw ID/cursor/action alias。可定位且状态未变化的待查看任务提供真正 Codex 归档；归档前重读线程身份、允许状态、recency 与 newest completed turn，任一字段缺失/变化都拒绝。
