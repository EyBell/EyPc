---
id: eypc-req-codex-raw-076
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-076
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-075-expanded-card-theme-depth"
relations:
  - refines-RAW-075-expanded-card-theme-depth
---

# RAW-076 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

展开后的大卡片必须公开完整而非两个颜色的主题配置。至少分别提供主面板底色、内层块底色、面板边框、主文字/图标、次文字、选中/进度强调、键盘焦点、进行中与完成未读的直接颜色令牌；每项在展开态预览中有清楚对应。该令牌集独立持久化，并随内置主题与已保存主题完整应用/保存。实际浮窗一旦展开，无论收起态选择水球或小卡片，均直接使用这套大卡片令牌；预览和真实展开态共用同一解析路径。颜色值直接保存和渲染，不恢复、不校验格式/对比度/色域，也不反向改写水球或状态信号。本轮不新增依赖、API、数据库或外部写入，不修改或运行测试、typecheck、build、uTools、截图或真实 Codex 操作；交付仍由用户验收。
