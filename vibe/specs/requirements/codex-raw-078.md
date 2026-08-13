---
id: eypc-req-codex-raw-078
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-078
status: active
domain: companion-codex
authority: user-stated
source_annotations: "refined-by-RAW-079 / refines-RAW-077-completion-presentation-duration"
relations:
  - refined-by-RAW-079
  - refines-RAW-077-completion-presentation-duration
---

# RAW-078 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

完成证据已由 Codex 权威确认后，任务级、可中断的完成展示稳定窗默认值为 `1500ms`，覆盖 RAW-077 的 `700ms` 时长。其建立条件、取消条件、初始已完成不延迟、重复完成不续期、共享快照与“不得以时间推断完成”的边界均不变；普通非输入活动的 `2000ms` 去抖不受本条影响。
