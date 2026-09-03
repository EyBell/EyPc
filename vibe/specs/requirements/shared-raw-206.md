---
id: eypc-req-shared-raw-206
qualified_source: SPEC-260903-CURSOR-PLAN-MODE-SESSIONS::RAW-206
status: active
domain: companion-shared
authority: user-stated
source_annotations: "implementation-landed / focused-automated-verified / host-pending / worktree-260903-cursor-plan-mode / cursor-plan-mode / blocking-decision-as-user-input"
scoped_relations: []
---

# RAW-206 · companion-shared

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260903/cursor-plan-mode-sessions/raw-requirement.md#L1)。

Cursor 库存白名单从 `unifiedMode = agent` 扩为 `agent | plan`（chat / ask / edit / subagent / cloud 仍排除）；`hasBlockingPendingActions` 视为精确的 `user-input` 交互并展示为待输入、压过开着的 Turn、可一键深链跳转；仍不发明 `waiting-approval`。取代 [260818 可行性裁决](../260818/1335-cursor-companion-feasibility/raw-requirement.md#L14) 中「排除 Plan」的一句。
