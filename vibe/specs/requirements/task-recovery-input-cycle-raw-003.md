---
id: eypc-req-task-recovery-input-cycle-raw-003
qualified_source: SPEC-261106-TASK-STATE-RECOVERY::RAW-003
status: active
domain: companion-codex
authority: user-stated
scoped_relations:
  - kind: refines
    target: eypc-req-codex-raw-149
    scope: "仅待输入：角标与快捷键共用循环；新增真实请求或重新进入时重启整轮，替代插队后续旧轮；未读入口不变"
  - kind: refines
    target: eypc-req-shared-raw-188
    scope: "仅input进度：新增候选重置整轮，metadata-only刷新不重置，旧轮回执不消耗新轮；completedUnread稳定轮次及置顶兜底不变"
---

# RAW-003 · 待输入新增后重启整轮

2026-11-13用户确认待输入分类正确，要求角标点击与专用快捷键共用最新优先的循环进度，并明确新增待输入任务自动重启循环。同任务新的真实请求或重新进入也重启，普通元数据与无关成员变化不重启；只重置进度，不自动打开。成功派发推进、失败重试、旧轮回执隔离及手动验收见[任务记录](../261106/task-state-recovery/task-card.md#2026-11-13待输入点击与快捷键共用循环)。
