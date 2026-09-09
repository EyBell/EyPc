---
id: eypc-req-shared-raw-218
qualified_source: SPEC-260908-CODEX-NATIVE-HOST-ORIGIN::RAW-218
status: active
domain: companion-shared
authority: user-stated
source_annotations: "implementation-landed / focused-automated-verified / artifact-ready / host-reload-pending"
scoped_relations:
  - kind: refines
    target: eypc-req-shared-raw-217
    scope: "Codex 任务行在仍属 Codex 来源时，Host 额外进程可见标记改为 XH / 归属 Codex Host；原生（含 Codex++）保持 CX"
  - kind: refines
    target: eypc-req-codex-raw-190
    scope: "Host 行继续走 Host 合成 Turn，不新增第四 Provider；原生额外模型空 turns 改信官方 connector active，不再依赖 Host 车道"
---

# RAW-218 · companion-shared

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260908/codex-native-host-origin/raw-requirement.md#L1)。

自动区分 Codex Host 额外进程与原生 Codex。Host 行标 `XH` 且仍走合成 Turn；原生（含 Codex++）官方 `active` 且 turns 为空时按进行中发布。
