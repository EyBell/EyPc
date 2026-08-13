---
id: eypc-req-codex-raw-088
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-088
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-071-and-RAW-076-builtin-theme-catalog"
relations:
  - refines-RAW-071-and-RAW-076-builtin-theme-catalog
---

# RAW-088 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

Codex 内置外观主题固定为 12 套，并统一模仿默认「海盐」材质：液体 `gradient`、实体圆环（禁止分段钟表环）、球体底色 `baseOpacity=100`、软光晕、额度驱动环色。保留海盐/石墨/靛砂/极光夜/琥珀雾/霓虹潮/绯焰/翠璃/紫电/日曜/冰棱/玫璃十二个色相变体；每套仍完整携带水球液体/环轨/读数、状态信号与展开卡片九项令牌；配置页默认样式下拉、主题匹配、预览与真实浮窗共用同一 `CODEX_THEME_PRESETS`。不新增渲染路径、校验回滚或依赖。本轮不运行测试、typecheck、build、uTools、截图或真实 Codex 操作，交付仍由用户验收。
