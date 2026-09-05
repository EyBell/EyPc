---
id: eypc-req-claude-raw-211
qualified_source: SPEC-260905-CLAUDE-NO-VERSION-WHITELIST::RAW-211
status: active
domain: companion-claude
authority: user-stated
source_annotations: "implementation-landed / focused-automated-verified / artifact-ready / host-reload-pending"
scoped_relations:
  - kind: refines
    target: eypc-req-claude-raw-013
    scope: "状态路线仍是私有日志 + Hooks + 元数据 + LevelDB；版本号不再作为日志车道准入"
  - kind: refines
    target: eypc-req-claude-raw-032
    scope: "未知 App 版本不得因版本号 fail closed；冷重放与归档复核不变"
---

# RAW-211 · companion-claude

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260905/claude-no-version-whitelist/raw-requirement.md#L15)。

Claude App 版本号不得作为热车道或能力准入白名单；行式匹配才决定事件是否成立。
