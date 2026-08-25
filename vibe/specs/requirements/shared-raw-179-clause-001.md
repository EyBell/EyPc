---
id: eypc-req-shared-raw-179-clause-001
qualified_source: SPEC-260824-EYPC-V7-GLOBAL-REFACTOR::RAW-179#1
status: active
domain: companion-shared
authority: user-stated
parent_requirement: eypc-req-invariants-raw-179
scoped_relations:
  - kind: refines
    target: eypc-req-shared-raw-160-clause-005
    scope: "仅当前未决 interaction 产生 waiting；artifact-only 为 stopped/待继续"
  - kind: refines
    target: eypc-req-shared-raw-160-clause-007
    scope: "Plan artifact 与 Plan interaction 分离，完成产物不再自动建立 waiting"
  - kind: refines
    target: eypc-req-shared-raw-160-clause-010
    scope: "动态窗口外只有未决 interaction 进入待输入；artifact-only 进入待继续"
  - kind: refines
    target: eypc-req-codex-raw-142
    scope: "completed Plan 本身不再产生 waiting-input；保留未读优先与匿名 rollout evidence 边界"
---

# RAW-179#1 · companion-shared

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260824/eypc-v7-global-refactor/raw-requirement.md#L5)。父条款 [RAW-179](invariants-raw-179.md#L1)。

只有当前未决 interaction 产生等待；Plan artifact 独立投影为待继续，回复、取消和 execution-start 以原子 tombstone 阻止旧证据反弹。
