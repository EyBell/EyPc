---
id: eypc-req-codex-raw-074
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-074
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-072-and-RAW-073-water-motion-preservation"
relations:
  - refines-RAW-072-and-RAW-073-water-motion-preservation
---

# RAW-074 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

恢复原有水球的分层水波、折射、高光和由 `motion` 控制的动画逻辑；配置页只复用真实组件实时预览，不得将其简化为静态/普通液体圆。移除简化后出现的底部矩形液体层，但不删除数据驱动的 Weekly 环、读数、角标或透明球体底色。水球配置控件必须按实际部位一一对应，清楚说明底色、底色透明度、液体 A/B、波幅/速度、Weekly 环/轨道和角标色。本轮不新增依赖、API、数据库或外部写入，不修改或运行测试、typecheck、build、uTools、截图或真实 Codex 操作；交付仍由用户验收。
