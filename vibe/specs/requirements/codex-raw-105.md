---
id: eypc-req-codex-raw-105
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-105
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-084-task-cycle-fallback"
relations:
  - refines-RAW-084-task-cycle-fallback
---

# RAW-105 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

当前/上一任务循环的常规候选（待输入 → 已完成未读 → 进行中）为空时，改用现有任务投影中所有 `EyPc` 本地置顶任务作为循环序列。该回退只接受仍有当前 action alias 的任务，沿用既有本地置顶优先/稳定显示顺序并按匿名 key 去重；首次“下一个”打开该序列第一项，首次“上一个”打开末项，之后按原方向循环回绕。原生置顶不作为回退候选；不持久化循环游标，不确认完成未读，不改变隐藏/页签或 Codex Desktop 状态。没有当前可打开的本地置顶任务时保留明确提示。依项目规则不新增或运行测试、typecheck、build、uTools、截图或真实 Codex 操作，由用户验收。
