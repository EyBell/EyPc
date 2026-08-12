# RAW-160 → RAW-161 Companion V4 Implementation Plan

Status: `regression-rework-complete / increment-automated-verification-complete / dev-plugin-reload-pending`

1. `historical-complete` — V3→V4、Plan 生命周期、窗口/循环、Actions v2、Latest Cache、Float ACK 与 Claude phase 基线保留；其先前全量 gate 已被安装宿主回归否定，不再作为当前接纳。
2. `complete` — 在 Kernel 增加私有 Branch Evidence Store；Preload 只发布隐私化分支原始证据，按“运行→审批→输入/Plan→全完成→全终态且逐分支 idle→verifying”聚合。
3. `complete` — 新 active、新 Turn 和较新 waiting 清理分支旧 idle；Domain 只投影 Kernel 结果，不再把 active 二次改为 stopped。
4. `complete` — 将 Renderer 的 alias/revision/phase 降为版本提示；Host 已有同 key 时直接采用当前进程 target，只有 Host 目标/私有映射缺失或能力不可用时才执行 provider-scoped tasks-only 解析并只恢复/重试同一 key 一次。
5. `complete` — 卡片、标题、Enter、紧凑待输入角标和 uTools 全局待输入入口统一走同一打开函数；Controller 不在打开前同步/重分类任务包，失败不推进队列或已读。
6. `complete` — 单数字角标恢复 `20×20` 并移除等宽/tabular 数字，两位数及 `99+` 自然扩宽；设置预览与 Float 几何合同一致。
7. `complete` — `unknown`/hydration-only active 不再虚构 running，待输入直接入口不再回退本地置顶；普通循环仍以置顶为最后一级。
8. `complete` — 最终受影响状态、打开、UI、Feature Routing、Runtime Identity 与 Claude state/membership/unread 矩阵为 `20/20` files、`547/547` tests；包括旧 Renderer target 按同 key 打开 Host 当前目标、100 次焦点变化零公开任务包；typecheck、1871-module production build、镜像生成和 uTools validator 通过。
9. `superseded-by-user-escalation` — 影响图原可封闭于聚焦矩阵，但用户明确要求中央缺陷逃逸后执行全仓门禁，故不再采用跳过结论。
10. `complete` — 同步 Controlled owner、RAW-067/160、项目状态、架构和既有错误记忆；不创建重复记忆，不触碰 `_to_delete/`。
11. `complete` — 用户要求的仓库级升级门禁在 Codex 未读恢复返工后重新通过：`83/83` files、`1328/1328` tests、typecheck、1871-module production build 与 uTools validator。
12. `host-reproduced-failure` — 1.5.4（`host-fc14212e36723e3b4fbe / renderer-4dfbb00a631314bc45f5`）复现 active 被旧 idle 覆盖；1.5.5（`host-6a76cc45575078bc2ced / renderer-0fa112cd0697e912ea85`）复现卡片/待输入/全局入口 `stale-target` 及焦点导致 package revision 连续推进，两者均拒绝。
13. `pending-host-gate` — 在 uTools 开发模式重新加载当前身份 `host-78205ae167fc7b27c653 / renderer-9c35abd09a8a390040c5`，完成状态、打开、无变化零推送、窗口/暂停/Float ACK、Codex 外部归档与 Codex/Claude hidden-Host 矩阵。
14. `authorized-test-only` — 可在 `EyPc-Regression-<run-id>-*` 无副作用测试任务上执行安全 Turn/Plan 和可恢复清理；既有用户任务与真实 Claude D′ 归档不在授权范围。
15. `complete` — Claude Hook/App-log 首事件由进程 Node callback 即时 drain，目录通知漏失由 1 秒 StatWatcher 恢复；当前 `1.28929.0` 固定语法/归档结构门禁、stopped 直接归档、Main-hidden Float applied 正常 `≤250ms`/恢复 `≤1.25s` 已纳入最终 `20/20` files、`547/547` tests 影响矩阵。
16. `complete` — 最终同类计时器审计把 Claude 任务成员关系与未读监听一并收敛到首次 native callback 即时处理、已登记文件 1 秒 StatWatcher 恢复；部分 JSON 不误删、同值指纹不通知。Plan 菜单能力不再依赖专用 `Implement Plan` 请求，实际执行仍由 Host 精确预检。
17. `complete` — Codex 原生未读监听移入进程 Host：首个 `fs.watch` 回调即时读取，已登记状态文件由 1 秒 `fs.watchFile` 补漏，目录 watcher 错误后自动重建，并覆盖普通写入与原子 rename。
18. `complete` — persisted unread false→true 且当前仍 active 时强制同 key latest-Turn 复核；旧 exact active/turn-started 不再提前跳过，更新正向序号仍能拒绝迟到终态。
19. `complete` — 移除 Renderer `phaseOnly` 周期看门狗；Codex rollout decision 同样由 Host 原生 watcher + 1 秒 StatWatcher 恢复。私有 Branch Evidence 先暂存，再与匹配 Host draft 单事务发布，消除一次事件的双 revision。
20. `complete` — 最新增量聚焦为核心 `3/3` files、`221/221` tests，扩展真实链为 `15/15` files、`433/433` tests；完整 `pnpm run verify` 为 `83/83` files、`1328/1328` tests。
21. `complete` — RAW-161 增加 `sessions/archived_sessions` 精确 watcher、1 秒 StatWatcher、双清单全分页对照、精确 `archivedKeys`、插件进入/IPC 重连/watcher 重建 tasks-only 对账，以及 dirty archived 排除；本地严格归档事务不被旁路。
22. `complete` — 运行 focused recovery `5/5`（4 new + existing local transaction guard）、完整受影响 Bridge `131/131`、typecheck、1871-module production build、Preload mirror/语法、uTools validator 与 diff 检查；无当前 testing-owner 升级触发，因此不重复运行仓库全量套件。

结果统一记录在 [verification](verify.md#L1)，宿主步骤见 [handoff](handoff.md#L1)。
