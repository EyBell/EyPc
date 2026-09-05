---
id: eypc-req-claude-raw-013
qualified_source: SPEC-260807-CLAUDE-CODE-COMPANION-AUTHORITY-RESET::RAW-013
status: active
domain: companion-claude
authority: user-stated
scoped_relations:
  - kind: superseded-by
    target: eypc-req-claude-raw-211
    scope: "「版本门禁」作为日志车道准入；路线本身仍是私有日志 + Hooks + 元数据 + LevelDB"
---

# RAW-013 · companion-claude

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260807/claude-code-companion-authority-reset/raw-requirement.md#L1)。

最终状态路线固定为“Claude App 私有日志 + 官方 Hooks + Code 元数据 + 原生 LevelDB 未读快照”；仅 Hooks 和私有 IPC 注入均被拒绝。App 版本号不再作为该日志车道的准入（RAW-211）。
