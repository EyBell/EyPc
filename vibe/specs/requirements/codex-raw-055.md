---
id: eypc-req-codex-raw-055
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-055
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-039-alias-and-RAW-052-row-interaction / density-refined-by-RAW-063"
relations:
  - refines-RAW-039-alias-and-RAW-052-row-interaction
---

# RAW-055 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

任务/项目列表主标题只显示一个名称：存在本地别名时显示别名，否则显示原始名称；原始名称仍参与搜索，并在存在别名时保留于详情和 Shift 预览。展开态主/次/微型文字采用 `12/10/9px` 层级，右侧四槽为 `24px`、间距 `2px`、操作区 `102px`，任务/项目行最小高度 `40px`。未进入选择模式时，任务标题点击打开 Codex 对应任务，左侧点击进入选择；一旦已有任一选中项，左侧和任务核心点击均切换该任务加入/移出，移出最后一项即退出选择模式。选中态必须有清晰渐变、强调边、光晕、hover/focus/active 组合反馈及 `aria-pressed`，键盘 Space/Escape/Delete/F/Shift 继续复用同一可见状态。开发验收继续由用户负责，本轮只更新测试契约，不运行测试、类型、构建、uTools、截图或真实 Codex 操作。
