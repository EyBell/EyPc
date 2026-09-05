---
id: eypc-req-claude-raw-032
qualified_source: SPEC-260807-CLAUDE-CODE-COMPANION-AUTHORITY-RESET::RAW-032
status: active
domain: companion-claude
authority: user-stated
scoped_relations:
  - kind: superseded-by
    target: eypc-req-claude-raw-211
    scope: "未知相邻版本因版本号 fail closed / 显式版本门禁适配日志"
---

# RAW-032 · companion-claude

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260807/claude-code-companion-authority-reset/raw-requirement.md#L1)。

Claude App 固定无内容日志语法与 D′ 元数据结构按行式匹配适配；未知版本不得因版本号 fail closed（RAW-211）。日志冷重放不得伪造 live running。可见 stopped/“待继续”任务允许从任务行直接发起归档，但不得移除五秒二次确认、同 key Dispatcher 或写前精确身份/phase/stat/hash 复核。
