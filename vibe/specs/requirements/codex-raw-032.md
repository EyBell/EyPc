---
id: eypc-req-codex-raw-032
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-032
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refined-by-RAW-037-RAW-045"
scoped_relations:
  - kind: superseded-by
    target: eypc-req-tooltip-unification-raw-001
    scope: "浮窗不得复用主窗口提示组件的实现限制"
relations:
  - refined-by-RAW-037-RAW-045
supersedes:
  - eypc-req-codex-raw-006
  - eypc-req-codex-raw-020
  - eypc-req-codex-raw-024
---

# RAW-032 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

删除 Pin、确认已查看和手动收缩按钮；自动收缩、受限 resize、水纹和对比基础继续有效，展开顶部布局、水球额度与当前操作交互由 RAW-037–RAW-045 更新。RAW-045 重新引入 Codex 子窗内自有的不透明延时说明卡，但仍不挂载主应用 Tooltip 层，也不使用原生 `title`。

其中提示组件必须由子窗独立实现的限制，已由[统一提示需求](tooltip-unification-raw-001.md#L1)局部取代；不透明说明、原生 `title` 禁用及其余行为保留。
