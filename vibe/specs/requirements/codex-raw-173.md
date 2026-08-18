---
id: eypc-req-codex-raw-173
qualified_source: SPEC-260817-0859-FLOAT-SEARCH-STATUS-COMPACT::RAW-173
status: active
domain: companion-codex
authority: user-stated
source_annotations: "focused-automated-verified / search-chrome-status-compact / confirm-row-superseded-by-RAW-175"
scoped_relations:
  - kind: superseded-by
    target: eypc-req-codex-raw-175
    scope: "confirm-status-row"
---

# RAW-173 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260817/0859-float-search-status-compact/raw-requirement.md#L1)。

展开卡不再用额度与列表之间的整行展示库存过期或「最近 N 天的 M 条」。过期、预检失败、兼容降级和 Claude 钩子缺口改为搜索栏最左侧 `!` 的 200ms 悬停；有库存时天数/条数右对齐进搜索框；普通占位精简为左对齐 `别名|任务|项目`，重叠时左侧让位并由图标悬停展示。
