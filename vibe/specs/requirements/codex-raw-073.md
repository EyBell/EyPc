---
id: eypc-req-codex-raw-073
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-073
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-072-water-base-transparency"
relations:
  - refines-RAW-072-water-base-transparency
---

# RAW-073 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

水球区的“球体底色”必须有独立的 `0%–100%` 背景透明度；`0%` 时仅移除球体底色，液体、Weekly 环、百分比读数和角标继续按同一共享渲染显示。该透明度与底色一起持久化，配置页预览和真实浮窗同步；不得以颜色校验、自动补色或替换为不透明色来改变用户选择。本轮不新增依赖、API、数据库或外部写入，不修改或运行测试、typecheck、build、uTools、截图或真实 Codex 操作；交付仍由用户验收。
