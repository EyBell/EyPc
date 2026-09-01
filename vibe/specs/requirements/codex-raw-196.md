---
id: eypc-req-codex-raw-196
qualified_source: SPEC-260901-CODEX-CONFIG-DENSITY::RAW-196
status: active
domain: companion-codex
authority: user-stated
source_annotations: "user-screenshot + config-density-compact"
scoped_relations:
  - kind: refines
    target: eypc-req-codex-raw-180
    scope: "保留静默刷新、不透明 i、warning/error 立即改写；收紧 ready/checking 常显详情与十格卡片"
  - kind: refines
    target: eypc-req-codex-raw-087
    scope: "说明性文案继续走 i；健康噪声诊断行默认不常显"
---

# RAW-196 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260901/codex-config-density/raw-requirement.md#L1)。

Codex 配置页必须按紧凑工作台渲染：收缩提示、使用小图标、去掉健康噪声展示，能一行完成的状态与控件不得拆成多行。运行区 ready/checking 只常显标题，详情进 i；warning/error 才内联详情并展示全部分项。
