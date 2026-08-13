---
id: eypc-req-codex-raw-039
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-039
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / project-removal-refined-by-RAW-052 / pin-feedback-refined-by-RAW-053"
scoped_relations:
  - kind: refined-by
    target: eypc-req-codex-raw-052
    scope: "project-removal"
  - kind: refined-by
    target: eypc-req-codex-raw-053
    scope: "pin-feedback"
---

# RAW-039 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

默认页签是进行中并持久化最后页签/项目折叠；任务和项目支持本地别名、搜索与 EyPc 置顶排序。旧“从 EyPc 移除/恢复”本地抑制语义由 RAW-052 取代；置顶的即时可见反馈由 RAW-053 补齐。只保存散列任务 key 和稳定项目指纹，不保存原始 ID、路径或任务列表；搜索词、选择、焦点和确认态不跨重启。
