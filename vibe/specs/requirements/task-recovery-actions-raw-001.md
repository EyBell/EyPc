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
