---
id: eypc-codex-running-side-child-invisible-after-reload
status: verified
scope: project
fingerprint: codex-parent-shows-completed-read-while-side-child-runs__reload-wiped-process-only-side-topology__no-recovery-lane-resupplies-desktop-only-child
first_seen: 2026-08-25
last_verified: 2026-08-25
review_after: 2026-11-25
evidence:
  - preload/index.js
  - preload/companion/task-kernel.cjs
  - preload/codex/inventory-thread-topology.cjs
tags:
  - codex-companion
  - side-topology
  - reload-recovery
  - evidence-loss
---

# 重载后运行中的 Desktop-only Side 子线程对 EyPc 不可见，父卡片退回已完成

## 症状

Codex 任务的子任务（Side 分支）仍在运行、主任务已完成且已读；契约要求卡片显示「进行中」（成员级归约 running 压过 completed-read），EyPc 却显示「已完成」。诊断日志 `task-topology | side-topology-decision` 自插件重载起恒为 `root-only sideCount:0`。

## 错误假设

以为是内核聚合规则错了。实测聚合数学正确（任一 live 成员即令根分组 running）；卡片显示已完成只因**子成员证据根本没进内核**。

## 已验证根因

所有 Side 拓扑状态都是 preload 进程内存（`sideShadows` / `codexDesktopSideRelations` / `codexInventorySideRelations` / `codexPrivateBranchTerminals` 等，均为普通 Map/Set，dbStorage 不携带分支状态）。插件重载全部丢弃后，三条冷恢复通道对 Desktop-only 运行中子线程全部失效：

- **Lane A（App Server 库存）**：`thread/list` 未返回该子线程（fork 拓扑仅认 `forkedFromId`+同 sessionId），sideCount 恒 0，子行从未进入库存。
- **Lane B（Desktop IPC 重连）**：`followAll` 只跟随已库存父线程 + 已知 side 关系（重载后关系表为空），无人重新 follow 子线程；恢复依赖 Desktop/其他客户端先广播该子线程，实测未发生。
- **Lane C（rollout/增量通知）**：子线程 turn 事件因关系未知退化为库存刷新（回 Lane A）；rollout 追踪器只对公开父行生效。

成员缺失 → 内核修剪关系、根独自聚合为 completed+read。契约本身允许（无法精确归属的子线程隔离，父按自身终态显示；动态状态不持久化是明文决定）；是否补救（如持久化关系提示、重连时枚举运行中线程）是产品决策。次级隐患（低置信）：即使子行进入库存，冷恢复只在行 status=active 且 latest turn inProgress（或 waiting 标志/Plan）时判 live，idle/notLoaded 行 + 实际仍在跑的 turn 会静默降级不产生任何候选。

对照：2026-08-15 严格法定人数规则（EYPC-COMPANION-STATE-SOURCE-001）针对**长活进程残留** shadow 的清理，与本例（新进程根本没有 shadow）是相反的失败方向，已排除。

## 检测顺序

1. 看诊断 `side-topology-decision` 的 sideCount 与进程启动时间：重载后恒 0 即证据丢失，不必查聚合。
2. 确认子线程是否 fork 型（`thread/list` 行带 `forkedFromId`）——fork 型缺席才怀疑 Lane A 分页/会话隔离，非 fork 型直接落本记录。
3. 聚合侧仅当 sideCount>0 仍显示已完成时才需要查（另一类问题）。

## 解除/恢复路径（当前代码下）

- 子线程产生新的可归属活动（新 turn/waiting 请求经 Desktop 广播）后可被临时 follow 恢复。
- 在 Codex Desktop 中切换/聚焦该子线程促使 Desktop 广播其流状态。
- 子线程结束后无需处理（父终态本就正确）。

## 预防规则

已实施（2026-08-25，[RAW-181](../../specs/260825/codex-side-reload-recovery/raw-requirement.md#L1)）：side→parent 关系提示有界持久化（仅 ID+observedAt，上限 200、TTL 48h，[side-relation-hints.cjs](../../../preload/codex/side-relation-hints.cjs#L1)），重载后恢复进提示表并由既有 followAll/sideRecoveryPending + 定向 latest-Turn 校验决定状态；提示不产生任何状态，遗忘/清退/归档同批删除持久化条目。C2 一并补齐：库存 Side 行 idle/notLoaded + inProgress turn 强制新鲜定向读，fresh inProgress 才判活并记 `recoveredLiveCount` 诊断。Desktop 会话枚举方向被否决：当前协议面无枚举请求方法证据，确认需真实协议探测（未授权）。法定人数清理边界未被削弱（恢复的提示走同一清退门）。

## 记录历史

| 日期 | 任务 | 触发 | 失败路线 | 恢复 | 结果 |
| --- | --- | --- | --- | --- | --- |
| 2026-08-25 | Codex 子任务活动聚合核验 | 用户报子任务进行中但父卡片显示已完成 | 怀疑聚合规则 | 9 代理对抗核验：聚合正确，C1 重载证据丢失 CONFIRMED、C2 潜在、C3 排除 | verified（根因）/ 补救待需求裁决 |
| 2026-08-25 | RAW-181 重载恢复实现 | 用户指派裁决+实现 | 方向 B 无协议枚举证据被否决 | 方向 A 有界持久化提示 + C2 补齐；重载往返/不虚构/TTL/判活 4 个新回归用例，platform 全量 627/627 | 预防规则已实施 / 真实宿主重载验收待用户 |
| 2026-08-31 | 子任务活动上浮主任务状态 | subagent 型子线程（非 fork）任何状态下都不在 `thread/list` | Lane A 对 subagent 恒缺席，与重载无关 | 拆出独立记录 [subagent 线程从不进清单](codex-subagent-thread-unlisted-parent-shows-stopped.md#L1)：rollout 文件发现 + `thread/read.parentThreadId` 链接 | 同族新类已单独收口 |
