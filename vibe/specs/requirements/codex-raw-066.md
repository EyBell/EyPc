---
id: eypc-req-codex-raw-066
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-066
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / supersedes-RAW-064-interrupted-visible-expression-only / archive-clause-superseded-by-RAW-068"
scoped_relations:
  - kind: superseded-by
    target: eypc-req-codex-raw-068
    scope: "archive-clause"
---

# RAW-066 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

保留上游 `CodexTurnStatus='interrupted'`，但在领域卡片投影层转换为可见 `activityState='ongoing'`，可见活动状态联合类型不再包含 `interrupted`。`runningCount/ongoingCount` 同时统计 desktop-live `active` 与转换后的 `ongoing`，`attentionCount` 只统计 `failed/system-error`；动态分组、角标、项目任务卡、已隐藏卡、图标、颜色、详情与 Shift 预览统一消费 `ongoing`，显示“进行中”、播放图标和 running 色，不再出现状态文案“中断/已中断”。本条原先“归档继续按原始 interrupted 区分”的子条款由 RAW-068 取代。标题中的用户原文及“不会中断当前 App Server”等非状态说明不做替换。
