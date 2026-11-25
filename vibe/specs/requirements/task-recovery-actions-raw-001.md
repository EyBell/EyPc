---
id: eypc-req-task-recovery-actions-raw-001
qualified_source: SPEC-261106-TASK-STATE-RECOVERY::RAW-001
status: active
domain: companion-codex
authority: user-stated
scoped_relations:
  - kind: refines
    target: eypc-req-shared-raw-179-clause-001
    scope: "最新尚未实施Plan显示待输入；实施后按最新真实状态；保留独立artifact与interaction证据"
---

# RAW-001 · 任务继续与计划实施

2026-11-06用户明确决定：真实中断保留待继续；最新计划未实施显示待输入；已经实施的计划按后续最新状态。插件内为真实中断提供一次点击的继续操作，为未实施计划提供一次点击的实施操作；优先原生命令，无能力时向原任务发送固定后续指令。

实现解释与边界：仅用户点击的准确根任务可执行；根完成、仅子任务中断不代选子任务或重启父任务。原生Goal暂停/阻塞优先原生激活，不修改预算限制；普通中断通过同线程继续。Plan实施替代原五秒二次确认，不改变归档确认。重新核对最新状态与身份，单目标防重，写入超时只复核不盲重发，不主动操作现有AG业务任务。见[任务与验收](../261106/task-state-recovery/task-card.md#L1)。

<a id="codex-native-plan-request-261125"></a>

## 2026-11-25 Codex 原生 Plan 状态对齐

按用户对新版 Codex 的同步要求，Codex 主对话和 Side 以当前未解决的原生 Plan 选择或实施请求进入「待输入」。仅生成 Plan 时保留产物与可用的实施、暂停动作，任务按当前轮次、组内活动及原生读态归类。请求解除后按其余待办和轮次归组。取消或实施与 Plan 本身的生命周期仍分别确认。

本节替代 11 月 6 日决定中仅凭当前 Plan 产物进入「待输入」的条件。见[状态对齐与验收](../261114/codex-state-sync/delivery.md#native-plan-request-parity-261125)。

<a id="codex-native-question-card-261125"></a>

## 2026-11-25 Codex Question 卡

Codex 当前最新完成轮的最终回复包含有效的结构化 Question 卡时，同一成员进入「待输入」。根卡、角标和快捷入口采用 V7 的同一份交互证据，保留原生完成和读态。回答或继续讨论开启后继轮次时关闭原实例，按其余待办和最新轮次重新归组。只有桌面窗口本地的关闭动作时，脚本尚无可观测回执。普通问句、示例代码、较早轮次以及仅有方案产物均不构成此类待输入。[现场与回放](../261114/codex-state-sync/delivery.md#native-question-card-261125)
