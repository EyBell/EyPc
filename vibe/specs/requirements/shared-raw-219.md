---
id: eypc-req-shared-raw-219
qualified_source: SPEC-260913-ORCA-COMPANION::RAW-219
status: active
domain: companion-shared
authority: user-stated
source_annotations: "implemented-local / focused-tests-passed / artifact-ready / installed-host-pending"
scoped_relations:
  - kind: refines
    target: eypc-req-shared-raw-217
    scope: "新增 Orca 来源缩写 OR / 归属 Orca；不改变 CC/CX/CS/XH"
---

# RAW-219 · companion-shared

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260913/orca-companion/raw-requirement.md#L1)。

EyPc 增加独立的 Orca Provider：经本机 Orca CLI 读取 Agents 任务状态、跳到对应终端并持续跟踪。默认关闭。不读对话正文。
