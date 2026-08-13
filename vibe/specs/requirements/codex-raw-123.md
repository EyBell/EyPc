---
id: eypc-req-codex-raw-123
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-123
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-104-122 / retires-obsolete-test-contracts"
relations:
  - refines-RAW-104-122
---

# RAW-123 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户进一步确认“已完成未读”缺失不是某一停止任务的个案，普通任务也无法及时转换。只读核验确认 Codex 原生 unread 集合当前存在且持续更新；失败回归证明完成前由 stream patch 写入的 `hasUnreadTurn=false` 在任务仍残留待输入/审批 flag 时绕过了 targeted completion 清理，并被误当成完成后的明确已读。所有精确 `turn/completed` 必须统一结束上一活动周期的 unread false 并走同一 completion publisher，不因旧 waiting flag 分叉；真正晚于完成的 read-state event 仍可立即重新声明 false。矩阵同步退休 19 条仅绑定旧六页签、旧 DOM、旧配置交互的 UI 测试，并将 7 条仍有价值的颜色直通与环境诊断测试改为当前合同；不得用 `skip` 隐藏债务，当前 Codex 矩阵必须全绿。
