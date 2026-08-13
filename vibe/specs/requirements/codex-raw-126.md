---
id: eypc-req-codex-raw-126
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-126
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-104-121-122-125 / single-active-exit-arbiter"
relations:
  - refines-RAW-104-121-122-125
---

# RAW-126 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户核验确认“已停止 → 进行中”正常，但“进行中 → 已完成未读”会先消失并误入已停止，且曾中断后恢复的任务更易复现。根因是 Controller 只在实时路径保护旧 completed，完整 inventory 却可用相同 revision 的旧 interrupted/failed 清除 active-exit baseline 并发布 stopped；同时原生 unread 稍后变为 true 时只发 `readStateOnly`，不会唤醒 latest-Turn 复核。实时 delta 与完整 snapshot 必须复用同一个 active-exit 纯转换器：相同旧 terminal 在周期未确认时统一投影为 inProgress/ongoing 并保留 baseline；精确/定向/佐证 terminal 或明确 Desktop not-running 才关闭周期。非 active、尚未 completed 的任务收到 Codex 原生 unread=true 时，Preload 只启动一次既有 `[0,300,1000]` latest-Turn 复核；unread 本身不得推断完成。复核得到 completed 时与当前 unread 在同一匿名 delta 发布，写入稍晚则由后续 `readStateOnly` 升级，整个过程不得经过 stopped。状态修订继续为 `task-state-v3`，不新增 Renderer 判断、持久化字段、API 或展示延迟。
