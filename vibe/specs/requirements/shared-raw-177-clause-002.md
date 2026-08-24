---
id: eypc-req-shared-raw-177-clause-002
qualified_source: SPEC-260823-CODEX-TAB-BOUNDARY-OPTIMIZATION::RAW-177#2
status: active
domain: companion-shared
authority: user-stated
parent_requirement: eypc-req-shared-raw-177
scoped_relations:
  - kind: refines
    target: eypc-req-shared-raw-176
    scope: "companionKernel 是唯一平台任务状态与命令入口；V6 升级身份但不恢复已移除的 V4/V2 facade"
---

# RAW-177#2 · companion-shared

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260823/codex-tab-boundary-optimization/raw-requirement.md#L13)。父条款 [RAW-177](shared-raw-177.md#L1)。

移除 V4 `companionNavigation` 与 V2 `companionTasks` 平台 facade，保持当前 V6 `companionKernel` 为唯一任务状态与命令入口。
