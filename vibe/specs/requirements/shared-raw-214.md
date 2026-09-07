---
id: eypc-req-shared-raw-214
qualified_source: SPEC-260906-CURSOR-HOOK-TERMINAL-UNFINISHED::RAW-214
status: active
domain: companion-shared
authority: user-stated
source_annotations: "implementation-landed / focused-automated-verified / hook-terminal-beats-session-unfinished-runat / host-pending"
scoped_relations:
  - kind: refines
    target: eypc-req-shared-raw-206
    scope: "钩子终态后忽略会话残留 unfinishedRunAt；活分叉与 aborted 开 Turn 仍进行中"
---

# RAW-214 · companion-shared

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260906/cursor-hook-terminal-unfinished/raw-requirement.md#L1)。

Cursor 钩子折叠为 completed/stopped 后，会话残留 `unfinishedRunAt` 不得单独保持进行中。活分叉仍使父卡进行中。磁盘 aborted 且 Turn 仍开着时仍是进行中。
