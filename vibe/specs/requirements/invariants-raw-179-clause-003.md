---
id: eypc-req-invariants-raw-179-clause-003
qualified_source: SPEC-260824-EYPC-V7-GLOBAL-REFACTOR::RAW-179#3
status: active
domain: engineering-invariants
authority: user-stated
parent_requirement: eypc-req-invariants-raw-179
---

# RAW-179#3 · engineering-invariants

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260824/eypc-v7-global-refactor/raw-requirement.md#L7)。父条款 [RAW-179](invariants-raw-179.md#L1)。

全部功能 Tab 通过 FeatureModule 与 RuntimeSlice 声明并消费窄切片，页面不得接收完整 AppRuntimeSnapshot 或保留第二套生命周期判断。
