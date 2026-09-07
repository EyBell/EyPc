---
id: eypc-req-shared-raw-217
qualified_source: SPEC-260907-FLOAT-TASK-META-COMPACT::RAW-217
status: active
domain: companion-shared
authority: user-stated
source_annotations: "implementation-landed / focused-automated-verified / artifact-ready / host-verified-task-project-name / compact-task-meta-line / publish-real-project-name"
scoped_relations:
  - kind: refines
    target: eypc-req-claude-raw-022
    scope: "任务行可见来源改为 CC/CX/CS；tooltip、ARIA 与来源底色仍表达完整归属；项目行全文不变"
  - kind: refines
    target: eypc-req-shared-raw-176
    scope: "根卡第二行子任务摘要由 +N 子任务改为 sub+N；活动/注意/异常计数改悬停详情"
---
# RAW-217 · companion-shared

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260907/float-task-meta-compact/raw-requirement.md#L1)。

悬浮卡片任务行第二行压缩为 `CC CodeNote sub+3 已完成 2.5h`。默认 chats 容器名不占第二行；Claude cwd / Cursor workspace.json 必须进入 Kernel 项目名；悬停展示完整归属、项目、子任务计数与时间。
