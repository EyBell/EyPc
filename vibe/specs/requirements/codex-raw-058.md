---
id: eypc-req-codex-raw-058
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-058
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-050-RAW-053-and-RAW-057 / compact-counter-click-refined-by-RAW-067"
relations:
  - refines-RAW-050-RAW-053-and-RAW-057
scoped_relations:
  - kind: refined-by
    target: eypc-req-codex-raw-067
    scope: "compact-counter-click"
---

# RAW-058 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

多选入口改为任务行左侧 `38px`、贯穿 `40px` 行高的矩形状态区，始终显示状态图标；选中行使用现有 `accent/running/pending/surface` 三色主题渐变，hover/focus/active 逐级增强，未选行继续降权。普通态左区选择、中部打开，Ctrl/Cmd+中部只选择；选择态左区与中部都切换成员，最后一项移除即退出。任务行 Space 切换选择，左区按钮和右侧动作按钮保留原生 Space/Enter 所有权且只执行一次。行尾不再展示“本地顶”；`顶` 控件以 warning 色表示 EyPc 本地置顶，并用 200ms hover/focus 说明表达本地、Codex 原生、未置顶与 Chats 来源。原生/Chats 使用可聚焦 `aria-disabled=true`，点击、Enter、Quick Jump 和快捷键统一经过只读门禁。水球三个数字角标使用共享不透明说明层，200ms 后展示数量/点击作用；hover/focus 不展开、不切页、不触发延时展开，位置和计数来源不变，待输入/完成未读点击结果由 RAW-067 收敛。只更新测试契约和文档，不运行测试、类型、构建、uTools、截图或真实 Codex 操作。
