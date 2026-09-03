---
id: eypc-req-claude-raw-204
qualified_source: SPEC-260903-CODEXHOST-READ-MEMORY-AND-CLAUDE-QUOTA-ORG::RAW-204
status: active
domain: companion-claude
authority: user-stated
source_annotations: "implementation-landed / focused-automated-verified / artifact-ready / host-pending / acct-key-organization / usage-organization-tiebreak / access-note / refresh-receipt"
scoped_relations:
  - kind: refines
    target: eypc-req-claude-raw-019
    scope: "组织/账号仲裁认 acct:<account>|<profile>:<org> 键形，并以 App 计量组织裁决多组织平局；fail-closed 与退避序列不变"
  - kind: refines
    target: eypc-req-shared-raw-201
    scope: "读数块点击刷新之后发布有界回执并在浮窗可见；已授权但 usage API 被挡时在已有缓存行旁显示原因"
---

# RAW-204 · companion-claude

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260903/codexhost-read-memory-and-claude-quota-org/raw-requirement.md#L1)。

Claude App 令牌缓存 `acct:` 键形的组织取第 2 段；多组织有效时用 `plan-usage-history` 最新样本的 `org` 裁决，否则 fail-closed。展开卡 Claude 额度组在已授权但 usage API 被挡时在缓存行旁显示「!」标记（原因在悬停提示与可访问名称）；手动刷新等待 Claude 读取完成后发布有界回执 `companion.quotaRefreshReceipt` 并在同一额度行上覆盖 8 秒；usage API 成功后间隔下限 60 秒，手动刷新仍可提前。
