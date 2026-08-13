---
id: eypc-req-codex-raw-067
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-067
status: active
domain: companion-codex
authority: user-stated
source_annotations: "refined-by-RAW-082-and-RAW-160-rework / supersedes-RAW-058-and-RAW-063-compact-input-unread-click-only"
relations:
  - refined-by-RAW-082-and-RAW-160-rework
---

# RAW-067 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

收起态“待输入”和“已完成未读”数字角标只要非零，无论一条或多条，都从各自实际计数集合中选择展示排序第一的会话，不先展开浮窗或切换页签；“进行中”角标继续保持现有展开行为。待输入与完成未读继续沿用各自既有计数来源，首条选择保留显示层置顶优先和底层稳定顺序，并覆盖仍在计数集合中的已隐藏会话。RAW-082 前的“打开不确认未读”只保留历史行为：当前待输入仍只打开，完成未读则由明确角标/全局命令仅在 EyPc 本地确认该 completion revision。单数字角标固定 `20×20` 圆形，不使用等宽/tabular 数字；两位数与 `99+` 按内容自然扩宽。设置预览与真实 Float 使用相同高度、最小宽度、padding 和圆角；颜色、边框、位置、状态权威、点击动作及 200ms hover/focus 说明层不变，说明与 ARIA 明确“打开第一条”。
