---
id: eypc-req-codex-raw-121
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-121
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-112-113-116-120"
relations:
  - refines-RAW-112-113-116-120
---

# RAW-121 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

任务状态链进一步收敛为显式证据来源。Activity Delta 必须区分 connector、首次 follow snapshot 和真实 activity patch，Turn 证据必须区分 inventory、精确 started/completed、退出后定向复核和 snapshot 佐证。真实 activity patch 开启新活动周期时，上一轮残留 completed 元数据不得阻止立即进入 active；同轮精确/定向/佐证 completed 仍立即结束。Controller 的 active-exit baseline 只能屏蔽退出前已存在的旧 terminal；一旦 terminal 通过门禁发布，必须同时关闭该活动周期并清除 baseline，使后续相同完整快照不能将 completed 反判回 inProgress。状态语义修订提升为 `task-state-v3`；旧 v2 来源继续以 degraded 原子包读取，不清空任务。`desktopActiveSince` 只作 v2 输入兼容，不再参与语义；`completionPresentationDelayMs` 从当前运行时设置形状移除，旧持久化输入在正常规范化/保存后自然淘汰。角标、分组、卡片和归档能力继续只消费 Controller 同一原子包，Renderer 不增加状态判断或防抖。
