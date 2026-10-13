---
id: eypc-req-codex-side-phase-raw-001
qualified_source: SPEC-261013-CODEX-SIDE-PHASE::RAW-001
status: active
domain: companion-codex
authority: user-stated
source_annotations: "implemented / host-reload-pending"
scoped_relations:
  - kind: refines
    target: eypc-req-shared-raw-207
    scope: "仅 Codex 有精确子成员时的根卡相位选择：主任务 input/approval 保留，活动子成员按既有规则影响根卡；历史终态/未知子成员不清除主任务当前运行；其他 Provider 和成员自身的 interaction 优先级不变"
---

# RAW-001 · Codex side chat 状态

[需求来源](../261013/1425-codex-side-phase/raw-requirement.md#L10) · [实现与保留合同](../261013/1425-codex-side-phase/spec.md#L1)。

有精确关联子成员时，主任务待输入（含审批）优先；其他状态由成员聚合，活动子成员提升根卡；历史终态或未知子成员不能抹掉主任务当前 running/Goal。无子成员保留原逻辑；未读、根任务打开与活动成员归档保护不变。
