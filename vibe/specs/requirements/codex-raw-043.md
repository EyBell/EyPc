---
id: eypc-req-codex-raw-043
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-043
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / native-state-exception-refined-by-RAW-052"
---

# RAW-043 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

Host Snapshot 升级 V2、Renderer 会话投影升级 V3；归档接口只接受短期 action alias、预期版本和来源指纹。除 RAW-052 的显式项目移除事务外，Codex 原生状态文件始终只读；不扫描 SQLite/LevelDB/正文，不让 raw ID、路径或私有状态进入 Renderer。
