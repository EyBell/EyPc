---
id: eypc-req-shared-raw-202
qualified_source: SPEC-260903-COMPANION-OPEN-LAUNCH-FIRST::RAW-202
status: active
domain: companion-shared
authority: user-stated
source_annotations: "implementation-landed / focused-automated-verified / artifact-ready / host-pending / open-readiness / codexhost-launch-lane"
scoped_relations:
  - kind: refines
    target: eypc-req-shared-raw-177-clause-003
    scope: "启动只改派发前置条件；深链仍不构成已读，opened 仍需原生确认"
---

# RAW-202 · companion-shared

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260903/companion-open-launch-first/raw-requirement.md#L1)。

所有打开入口在 Provider 派发前先经统一就绪层：目标应用未运行时先启动（Codex 按「通过 CodexHost 打开 Codex」的有效模式经 `codexhost launch` 或 `open -b`；Claude / Cursor 用 `open -b`），有界轮询至进程出现并软等待就绪后才发深链，超时或启动失败 fail-closed；「跳转前确保目标应用已打开」默认开；CodexHost 有效但既无 codexhost 命令也无 shim 时拦下不启动；codexhost 命令位置可手动指定。
