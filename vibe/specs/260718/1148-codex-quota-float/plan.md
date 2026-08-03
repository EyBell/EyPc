# Codex 任务状态收敛计划

Tool: codex
Status: `automated-verified / host-pending`

1. 用序列测试复现“完成通过定向核验，后续完整快照反判回进行中”。
2. 完成通过 active-exit 门禁后立即关闭周期并清除 baseline。
3. 跨 preload 发布 Activity/Turn 来源，用真实 activity patch 区分初始 snapshot replay。
4. 提升到 `task-state-v3`，保留一版 degraded 兼容，移除完成展示延迟设置的当前运行形状。
5. 验证 Bridge、Controller、Domain、Renderer 同源包、类型和 preload 镜像。
6. 将实时 delta 与完整 snapshot 的 active-exit 判断合并到一个转换器，旧 interrupted/failed 不得在 inventory 重建时误入 stopped。
7. 原生 unread 晚到且完成尚未确认时，只唤醒一次 bounded latest-Turn 复核；完成与当前未读走同一发布路径。
8. 将当前合同收敛到 Spec/PRD/架构/技术记忆，历史细节仅保留在 raw 与错误记忆。
9. 清理残留 completedAt/terminal-shape/缺结果停止门禁，让 latest-Turn single-flight 在 active 与 exit 模式切换时可接管，并让可疑 active 的 unread 只唤醒证据复核。
10. 全链审计状态写入/仲裁/投影/消费：移除本地未读覆盖与批级拒绝，给 full snapshot 增加 Activity generation 屏障，收敛 inventory 证据合并、缺失行隔离、冷启动 unread 一次性唤醒和 delta/full snapshot confirmed-terminal 统一识别。
11. 清零整仓残留矩阵：修复任一普通窗口归零的 Spark 仲裁，撤销旧配色预览 Runtime 路径，将外观测试/文档统一到直存直渲，并把 MQTT/Quick Jump 静态断言限制到真实结构边界。
12. 给 Desktop activity patch 与 App Server active 建立同一进程内因果序列；旧 idle activity-event 经 read-state/inventory 重放不得撤销更新的 `app-server-live`，真正后到的非 active patch 仍可撤销。
13. 冻结场景式补丁，按 Activity/Turn/read-state/Side Chat/inventory/bridge-state 的写入、撤销、重放和消费点建立闭合转换矩阵；先记录全部 P1，再按“正向 epoch → terminal → inventory → presentation/action”顺序修复和验收。
14. 在不放宽 RAW-131 门禁的前提下，将父任务聚合收敛为纯解析器，增加 Side Chat 分支终态延后保护与匿名裁决计数，并用反向合同证明旧 Turn、旧 generation 和 stopped archive 不能回归。
15. 将匿名诊断的字段、规范化和比较收敛到 Domain；Controller 只做 generation 后原子接纳与变更通知；运行页压缩常驻文案、隔离 live region 并统一原生帮助按钮，再用生产纯解析器真值表和诊断通知合同封住回归。
16. 将动态页固定 6 小时窗口收敛为 `CodexSettings.dynamicTaskWindowHours`：默认 24 小时，任务配置页可编辑，Controller 原子包与既有时间边界调度器即时重投影，Renderer/Preload 不新增过滤或请求。
17. 将额度刷新与完整库存校对放宽为 `0–86400` 整数秒配置，并把无 Turn 载荷的精确 completed 事件从 stale-active/全量扫描退化路径拆为密集有界的单任务完成确认；更新 positive epoch 继续取消旧结果，失败才回退完整校对。
18. 为精确 Plan 实施确认增加隐私安全的 plan-only 会话语义并升级到 `task-state-v4`；Controller 将前后任务候选拆为普通输入/审批、Plan、最近活跃三个独占循环层，保留方向、回绕、去重和本地置顶兜底，并补齐 Bridge/Domain/Controller/平台、帮助与文档合同。
19. 闭合插件中断恢复：让当前原生 unread 集合的存在/不存在双向压过重连 snapshot，停用时清空 Controller 派生基线并以新运行代次立即 bootstrap，给零周期 missing-key 增加剩余隔离窗自唤醒，并用最多 1000 条 preload 内存拓扑提示重订已知 Side Chat；保持公开 v4 协议、本地用户状态与未知 ephemeral child 边界不变。
20. 复核真实宿主仍未收敛的已读：区分运行包、当前 IPC 协议、事件时间线和原生集合，允许当前 refollow `false` 清除遗漏事件留下的 persisted `true`；所有插件任务 Deep Link 成功后走同一会话期已读确认，失败不改状态，新 completion 清理旧 false，并补 main/Side、断桥和协议兼容合同。
21. 复核真实 uTools 的 ASAR/preload 身份与任务打开路径；把 Codex 全局入口统一为 `mainHide` 独占可见性，空库存指令经 tasks-only preflight 后执行，卡片失效 alias 只按同一 key 重建并至多重试一次；补 App route、Controller、Bridge 与真实点击证据。
22. 复现完成未读快捷键“先已读后反弹”的生命周期：把成功打开确认从单个 Bridge `liveUnread` 提升为有界 preload 会话 epoch，跨普通 mainHide/IPC reset/resubscribe/连接重建保留，并仅由新 Turn 或明确移除释放；补同 completion 重放与新 Turn 反向合同。

执行证据见 [verify.md](verify.md#L1)，当前交接见 [handoff.md](handoff.md#L1)。
