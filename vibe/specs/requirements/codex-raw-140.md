---
id: eypc-req-codex-raw-140
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-140
status: active
domain: companion-codex
authority: user-stated
source_annotations: "automated-verified-host-pending / refines-RAW-138-and-RAW-139 / mainhide-open-read-acknowledgement-continuity"
relations:
  - refines-RAW-138-and-RAW-139
---

# RAW-140 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户复验纠正：“插件内手动点击已读的暂时会展示为已读，但是一会又变成未读”，并补充该问题使用“查看已完成未读”的全局快捷键可稳定重现。时序回归确认快捷键成功打开后已经发布 `desktop-live=false`，但 `mainHide` 随后的普通 `onPluginOut(false)` 会关闭 Desktop/App Server 连接；旧实现把成功打开确认存在具体 Bridge 的 `liveUnread` 中，连接重置、重订或桥重建会清空它，随后 Codex 原生仍为 `true` 的集合重新成为权威，于是 UI 从已读反弹为未读。修复后成功 Deep Link 的 parent/已知 Side Chat 确认提升为当前 preload 进程内、最多 1000 条的完成 epoch 提示，跨普通 `mainHide` 隐藏、IPC reset、resubscribe、Bridge/App Server close/rebuild 和 refollow 保留；同一完成 epoch 的 snapshot、原生集合或晚到 unread true 不得反向覆盖。精确 active/Turn-started、完整库存发现新 Turn、更新 completion revision 或明确归档/删除时清理该提示，使新完成重新未读。提示不落盘、不进入 Renderer、不写 Codex 原生状态，进程结束自然失效，公开 `task-state-v4` 不变。新增 Bridge 时序合同覆盖 reset/refollow、mainHide close/rebuild、同 completion 晚到证据和新 Turn 释放；Bridge `70/70`、五文件聚焦 `144/144`、typecheck 与完整 `pnpm run verify` 的 `733/733`（`57/57` 文件）、production build、runtime preparation 和 uTools validation 均通过；真实快捷键重载验收保持后续门禁。该条“completed revision 变化即可释放”的历史口径已由 RAW-144 收紧：同一 Turn 的时间补全不释放，具体新 Turn/新 active epoch 才释放。
