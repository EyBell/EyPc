---
id: eypc-req-codex-raw-110
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-110
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-089-092-104-108"
relations:
  - refines-RAW-089-092-104-108
---

# RAW-110 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户反馈新的进行中任务在长时间空闲后首次出现可能延迟约 2–3 秒，后续任务较快，并进一步确认“进行中 → 已完成”等待过长，明确授权优化。App Server `thread/started` 的 raw ID 位于 `params.thread.id`；preload 必须用它只标脏该新任务，使 50ms 事件库存校对复用其它任务的会话期 latest-Turn 缓存，而不是因 ID 漏取退化为全部任务重读。全新任务仍须经过原生项目归属、匿名 key 和 action alias 的完整库存登记，不得为加速制造占位卡。对已经进入稳定库存的任务，`turn/started` 若携带完整且更新的 `inProgress + startedAt`，必须立即更新同一匿名任务的进行中证据。`turn/completed` 若携带完整 Turn，preload 只提取 allowlist 内的 `status / startedAt / completedAt`；只有状态为 `completed`、开始/完成时间均有效，且相对当前任务证据和 Desktop active interval 单调更新时，才以 `targeted-after-exit` 匿名强证据立即发布并绕过普通完成展示窗，不得先丢弃该通知元数据再等待额外 latest-Turn RPC。缺失/畸形/旧修订、未知任务、`failed / interrupted`，以及只有 Desktop active→idle 而没有完整 Turn 通知时，继续走现有 50ms dirty-task 完整校对或 3 秒 `[0,300,1000]` 定向 latest-Turn 核验；待输入/审批继续优先，原始 thread/Turn ID、items、正文和错误内容不得跨 preload。`completionPresentationDelayMs` 的当前代码默认值保持 `0ms`，配置页必须正确标识“不等待（默认）”；现有用户持久化选择不自动迁移，`500–3000ms` 选项仍用于普通快照完成的可选平滑。Renderer 不增加 timer/debounce，Controller、协议、Projection V3、动作 ID、存储结构和迁移不变；只更新既有测试合同且不执行，状态保持 `reported / 未校验，待用户验收`。
