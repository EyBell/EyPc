# Codex Companion v3 Task Checklist

## Implementation

- [x] `companion-task-kernel-v3 / companion-task-package-v3`
- [x] phase/unread 独立 lane、exact causal reducer、unknown 250ms window
- [x] observationGeneration 与 semanticRevision 分离、等价 observation 完整 no-op
- [x] 新 membership 最小卡片和 Codex-only 元数据补读
- [x] cursor 全分页与全消费者无固定上限
- [x] Process Kernel 热缓存、focus key no-op、快捷键首发/最终尾随
- [x] operationId 跨 Runtime、Controller、Kernel、Navigation 和 Provider
- [x] Codex 十阶段归档事务、失败保留和原生 ACK 门禁
- [x] `eypc-runtime-diagnostics-v3`、显式 level、三档过滤和 userConfigured 迁移
- [x] 归档专项阶段日志、快捷键/手动跳转日志和 v2/v3 聚合探针
- [x] 稳定宽度/tabular badge，移除展示级状态防抖
- [x] 保留 Claude/Cloud 接口兼容且不扩展其行为范围

## Automated Verification

- [x] 状态真值表、乱序/重复、核验失败
- [x] 1,000 等价 observation 零 revision/Float/focus
- [x] 240 个任务及第 41/101/201 项全消费者存在
- [x] 新 membership 先展示后补元数据
- [x] 归档 sync 失败、verify-2 矛盾、ACK 超时、成功、重试、确认稳定、tombstone
- [x] operationId 串联动作、导航与归档日志
- [x] 日志等级、关闭、迁移、轮转、探针和显式 level 静态门禁
- [x] 最终全量测试、类型、构建、镜像、Runtime Identity、uTools validator
- [x] 文档链接、sync receipt、diff 审计

## Real Host Acceptance

- [ ] 新 Codex 任务立即进入进行中
- [ ] 进行中 ↔ 待输入快速切换
- [ ] 完成 → 完成未读 → 已读 → 新 Turn
- [ ] interrupted 重启后待继续，旧 interrupted + 新 active 恢复运行
- [ ] 40 条以上无截断
- [ ] 快捷键和手动跳转可按 operationId 还原时间轴
- [ ] Codex 归档与 Codex App 刷新一致
- [ ] sync/ACK 故障时保留卡片并提醒
- [ ] debug/info/error/off 符合等级合同
