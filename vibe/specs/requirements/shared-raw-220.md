---
id: eypc-req-shared-raw-220
qualified_source: SPEC-260913-ORCA-COMPANION::RAW-220
status: active
domain: companion-shared
authority: user-stated
source_annotations: "implemented-local / focused-tests-passed / artifact-ready / installed-host-pending"
scoped_relations:
  - kind: refines
    target: eypc-req-shared-raw-219
    scope: "Orca 标签栏已完成未读应按窗格导出；未导出前 EyPc 中转：曾观测进行中的会话不得直接已完成已读，插件跳转/点击后才已读。不改变仍 working 不得被点卡片改成已完成"
---

# RAW-220 · companion-shared

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260913/orca-companion/raw-requirement.md#L1)。

Orca 标签栏已完成未读按窗格导出。旧 CLI 缺字段时，EyPc 用本地中转：读到进行中后再完成，停在已完成未读，直到插件跳转或点击查看。原生布尔出现后以它为准，跳转派发不再提前清原生未读。2026-09-15 本地实现与构建完成，真实宿主待验收。
