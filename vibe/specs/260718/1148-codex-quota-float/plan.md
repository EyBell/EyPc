# Codex 任务状态收敛计划

Tool: codex
Status: `implemented-unverified`

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

执行证据见 [verify.md](verify.md#L1)，当前交接见 [handoff.md](handoff.md#L1)。
