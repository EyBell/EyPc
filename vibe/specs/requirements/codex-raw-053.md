---
id: eypc-req-codex-raw-053
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-053
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / pin-feedback-refines-RAW-037-and-RAW-039"
---

# RAW-053 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户反馈“置顶没有效果”。置顶必须在动作后的下一份投影中产生即时、可辨识的反馈：所有任务/项目卡片都要一致投影 `native/local` 置顶来源，本地置顶显示“本地顶”且按钮维持 `aria-pressed=true`；项目置顶进入项目页 `Pinned`，任务置顶在每个任务页签及动态页各状态段内稳定排到非置顶项之前。置顶区与非置顶区内部继续保持既有本地置顶顺序/最近提问顺序，搜索只过滤不另行重排；底层 V3 任务数组仍按 latest Turn 时间排序。浮窗动作桥接未送达时必须给出明确错误，不能静默表现为无效。仍遵循用户独占验收规则，不运行任何开发门禁。
