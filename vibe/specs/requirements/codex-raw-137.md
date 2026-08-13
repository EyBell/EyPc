---
id: eypc-req-codex-raw-137
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-137
status: active
domain: companion-codex
authority: user-stated
source_annotations: "automated-verified-host-pending / refines-RAW-090-097-122-128-131-132-135 / closed-interruption-recovery"
relations:
  - refines-RAW-090-097-122-128-131-132-135
---

# RAW-137 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户先要求核验“插件关闭后，已完成未读能否恢复；关闭期间在 Codex 中读取后 App Server 是否补发已读”，继而明确授权修复并要求复核所有相似缓存错配。静态与当前 Desktop/App Server 合同核验确认 App Server 不拥有 read-state，插件关闭期间不会补发 `thread-read-state-changed`；重开只能读取 Codex 原生 unread 持久化集合。旧 resolver 让 initial/refollow snapshot `true` 永久压住当前集合中的缺席 `false`，同时 Controller 停用只清 Renderer 投影、不清 `lastThreads/projects`、source fingerprint、Activity generation、active-exit baseline 和循环游标，导致关闭期间归档/删除/项目离库在重开首个完整库存中再次进入 missing-key 隔离；`taskRefreshSeconds=0` 时第二次确认早于最短 3 秒窗口后又没有后续唤醒，旧行可无限保留。修复后 unread 权威固定为“当前连接的精确 read-state event → 当前可解析原生集合的成员/非成员 → 原生不可用时的 initial/refollow snapshot → 最后一次持久化兜底”，main 与 Side Chat 父聚合共用同一纯解析；Controller 停用/任务收件箱关闭时清空 Codex 派生易失基线并递增运行代次，重新启用立即并发读取额度/config 与完整库存/latest Turn，旧会话异步不得回写；缺行首次 200ms 复核，达到连续确认但未满隔离窗时按剩余时长自调度，即使周期为 0 也会闭合。Preload 仅在本进程内保留最多 1000 条已观察 Side Chat child→parent 拓扑提示，桥恢复或同 socket 下 App Server 库存从空重建后重订，并对恢复出的非活动 child 做一次既有 3 秒有界 latest-Turn 校对；不保存状态、不落盘、不进入 Renderer，父/child 确认归档或离库即清理，完全在中断期间创建并结束的未知临时 Side Chat 不伪造恢复。`task-state-v4`、公开字段、EyPc 别名/本地置顶/隐藏/折叠和 App Server 权责不变。Bridge/Controller 聚焦回归 `106/106`（含关闭期间保留任务归属与原生置顶变化）、最终统一全库 `704/704`、typecheck、production build、三类 preload 镜像与 uTools runtime validation 已通过；真实 uTools 关闭—变更—重开验收仍为用户门禁。
