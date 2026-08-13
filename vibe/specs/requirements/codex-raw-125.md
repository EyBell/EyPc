---
id: eypc-req-codex-raw-125
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-125
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-112-120-121-124 / removes-over-filtering"
relations:
  - refines-RAW-112-120-121-124
---

# RAW-125 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户授权全局核验状态阻断并移除不必要或过度的异常筛选，只保留能防止真实乱序、旧快照和清单误删的最小防抖。Live active 不再被普通 inventory completed shape 或本机/provider 时间关系压住，只有 `turn-completed / targeted-after-exit / snapshot-corroborated` 三类已确认 terminal 来源可在残留 active snapshot 排空前关闭当前周期。App Server 精确 `turn/started` 可把同秒、同 `startedAt` 的 completed/interrupted/failed 前进为 inProgress；定向 latest-Turn 读取到同 revision inProgress 也立即恢复 active，只有严格更旧的 `startedAt` 被拒绝。精确 `turn/completed` 只要求 completed + 有效 `startedAt`，`completedAt` 缺失时以 startedAt 作为 completion revision，不再等待完整清单。保留首次/refollow active 与 terminal 冲突的 `[0,300,1000]` 单任务复核、active-exit baseline 到定向结果、50/200ms 结构合并和 missing-key 隔离；它们不得阻断精确 started/completed/read-state 事件。
