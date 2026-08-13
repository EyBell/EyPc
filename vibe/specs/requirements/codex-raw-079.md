---
id: eypc-req-codex-raw-079
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-079
status: active
domain: companion-codex
authority: user-stated
source_annotations: "refined-by-RAW-080 / refines-RAW-078-completion-window-and-water-reading-configuration"
relations:
  - refined-by-RAW-080
  - refines-RAW-078-completion-window-and-water-reading-configuration
---

# RAW-079 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

Codex 配置页必须将“已完成未读”的展示稳定窗作为持久化设置，默认 `1500ms`，可选 `0 / 500 / 1000 / 1500 / 2000 / 3000ms`（`0` 为不等待）；水球百分比读数另设独立配置组：显示位置、文字大小、文字样式（常规/加粗/斜体/粗斜体）和文字颜色；默认居中、`22px`、加粗、白色。该配置随水球外观持久化，内置/已保存主题、配置页预览与真实悬浮水球消费同一对象。不得为读数另建预览/运行时渲染路径。
