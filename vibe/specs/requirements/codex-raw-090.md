---
id: eypc-req-codex-raw-090
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-090
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-035-036-043-and-RAW-089"
relations:
  - refines-RAW-035-036-043-and-RAW-089
---

# RAW-090 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

异常状态传输或完整库存中的暂时缺行不等于任务真实消失，不得让任务数、分组、排序或操作能力在单次异常快照上突兀跳变。Controller 发现新的完整快照缺少已展示的匿名任务 key 时，必须拒绝发布该数量下降、保留上一份内存稳定清单并立即发起一次完整复核。只有同一缺失 key 集合被至少两份完整快照连续确认，且从首次缺失起已经过 `max(15s, taskRefreshSeconds)`，才能接纳真实删除；期间任务重现立即取消候选。latest Turn `startedAt`、明确 completed 结果与任务 `updatedAt` 必须单调，旧 Turn、同 Turn 的 completed→异常回退或完成时间倒退不得覆盖新证据。插件自身已经 Host 双向验证的单条/项目归档与经二次确认的项目移除是显式删除证据，可立即收敛且不进入缺失稳定窗。稳定清单与候选只留内存，不持久化任务列表或 raw identity。测试合同可更新但依项目规则不执行，仍由用户做真实传输抖动验收。
