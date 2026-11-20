---
id: eypc-req-codex-quick-task-view-raw-167
qualified_source: SPEC-260813-1455-COMPANION-QUICK-TASK-VIEW::RAW-167
status: active
domain: companion-codex
authority: user-stated
scoped_relations:
  - kind: refined-by
    target: eypc-req-shortcut-management-raw-002
    scope: "完全无可用缓存时，快速任务查看快捷触发结束；已有可信快照时仍可独立于主窗进入浮窗动态筛选"
---

# RAW-167 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260813/1455-companion-quick-task-view/raw-requirement.md#L1)。

Codex 快速任务查看复用既有 Float 动态视图与搜索，统一修复快捷键分层、焦点、上下移动、Shift 预览和直接打开：`Ctrl+F` 聚焦搜索，`F / Shift+F` 保留 Quick Jump，筛选模式 `Ctrl+1…0`、常驻 `Alt+1…0`、`Alt+F` 与 Enter 都复用同一任务打开链；不新增 reducer、子窗口或 Provider 写入。

快捷入口的缓存条件见[本专题 RAW-002](shortcut-management-raw-002.md#L1)。
