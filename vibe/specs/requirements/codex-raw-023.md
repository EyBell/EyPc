---
id: eypc-req-codex-raw-023
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-023
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active"
---

# RAW-023 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

任务行增加任务创建时间、首次提问时间、最近一次提问开始、最近运行耗时和具体完成时间。只有权威 running 在展开态实时计时；后台首问分页只读取 `itemsView=notLoaded` 的时间/游标元数据，raw thread/turn ID、cursor、cwd 和正文不得进入 Renderer、存储、日志或文档。
