---
id: eypc-req-codex-raw-124
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-124
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-091-112-121-123"
relations:
  - refines-RAW-091-112-121-123
---

# RAW-124 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户确认真实进行中的“增加 MQTT 多选快速导出”被误显示为已停止。App Server 的精确 `thread/status/changed=active` 与完整 `turn/started=inProgress` 是当前进程的正向实时事件；它们必须建立 `app-server-live` active 权威并立即覆盖上一轮 `interrupted + Desktop initial/refollow idle snapshot`。该正向权威必须跨旧 Desktop snapshot 重放和周期 inventory 重建保留，只能由后续精确 `turn/completed`、定向 terminal Turn、App Server non-active 或 Desktop activity patch 的非 active 转换撤销。connector inventory active 仍不能单独建立 live 权威，初始 snapshot 也不能反压更新的正向事件；Controller 原子包、分组、角标和归档能力必须立即同步为进行中。
