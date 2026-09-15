---
id: eypc-req-shared-raw-221
qualified_source: SPEC-260915-SHORTCUT-IMMEDIATE-READ::RAW-221
status: active
domain: companion-shared
authority: user-stated
scoped_relations:
  - kind: refines
    target: eypc-req-shared-raw-177
    scope: "快捷跳转成功派发后立即清 EyPc 本轮未读投影；原生 handoff 与 confirmsRead 仍只由原生确认决定"
  - kind: refines
    target: eypc-req-shared-raw-220
    scope: "Orca 与其他 Provider 统一支持快捷打开后本轮本地已查看；不改原生未读，旧同轮回流不闪回，新动态重新生效"
---

# RAW-221 · companion-shared

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260915/shortcut-immediate-read/raw-requirement.md#L1)。

快捷打开实际选中的已完成未读项，成功派发后立即在 EyPc 显示已读，无额外 I/O 或扫描等待；失败、新轮次、任务重建和成员动态均有隔离，不伪造原生已读。
