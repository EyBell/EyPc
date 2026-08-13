---
id: eypc-req-codex-raw-077
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-077
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-069-completion-presentation-duration"
relations:
  - refines-RAW-069-completion-presentation-duration
---

# RAW-077 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

完成证据已由 Codex 权威确认后，任务级、可中断的完成展示稳定窗固定为 `700ms`，覆盖 RAW-069 的 `2000ms` 时长。其建立条件、取消条件、初始已完成不延迟、重复完成不续期、共享快照与“不得以时间推断完成”的边界均不变；普通非输入活动的 `2000ms` 去抖不受本条影响。本轮不修改或运行测试、typecheck、build、uTools、截图或真实 Codex 操作，交付仍由用户验收。
