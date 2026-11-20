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
  - kind: superseded-by
    target: eypc-req-shortcut-management-raw-004
    scope: "仅取代 Codex 原生任务成功派发即清 EyPc 本轮未读；以同任务同完成实例的原生已读确认为准。其他来源沿各自现行逻辑，保留选中任务及代际隔离。"
---

# RAW-221 · companion-shared

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260915/shortcut-immediate-read/raw-requirement.md#L1)。

原条款要求快捷打开实际选中的已完成未读项，在成功派发后立即给出 EyPc 本轮已读反馈，并隔离失败、新轮次、任务重建和成员动态。Codex 原生任务现行清读时点见[快捷键管理 RAW-004](shortcut-management-raw-004.md#L1)，按来源取证。
