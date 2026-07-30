# Codex 任务状态收敛计划

Tool: codex
Status: `implemented`

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

执行证据见 [verify.md](verify.md#L1)，当前交接见 [handoff.md](handoff.md#L1)。
