---
id: eypc-req-codex-raw-136
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-136
status: active
domain: companion-codex
authority: user-stated
source_annotations: "automated-verified-host-pending / refines-RAW-084-093-105-109-113-128-134 / exclusive-task-cycle-priority"
relations:
  - refines-RAW-084-093-105-109-113-128-134
---

# RAW-136 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户原文：“优化一下：如果同时存在已完成规划的 plan 和待确认、待输入的项，使用快捷键查看时，优先查看待输入的项。待输入的项解决之后，才能够去查看那些 plan 计划。如果只有 plan 计划，之后可以进行自动的循环。每一次通过这个快捷键的时候，可以触发下一个。” “上一个/下一个 Codex 任务”改为独占优先级队列：只要存在普通待输入或待审批任务，两条命令仅在该层按既有显示顺序循环，Plan 实施确认与普通进行中均不可达；普通等待清空后，若仍有精确 `item/plan/requestImplementation` 对应的 Plan 实施确认，则仅在 Plan 层循环并首尾回绕，每次命令前进或后退一项；Plan 层清空后才进入既有最近活跃任务层，所有普通层均为空时继续使用非停止 EyPc 本地置顶回退。Preload 只投影一个隐私安全、会话期且不持久化的“仅 Plan 实施确认”布尔语义，保留通用 `waitingOnUserInput`；不传递 request body、raw identity 或方法字符串。完成未读继续使用独立动作；命令仍只打开任务，不改未读、隐藏、Tab、绑定或 Codex 原生状态。新增语义以 `task-state-v4` 端到端传递，v3/旧来源 degraded 兼容；Bridge/Domain/Controller/平台四文件 `151/151`、全库 `697/697`、typecheck、production build、双 preload 镜像与 uTools runtime validation 已通过，真实 uTools 快捷键顺序由用户重载验收。
