# Codex 任务状态验证记录

Tool: codex
Date: 2026-07-30

## Review Target

- Requirement: [RAW-116–125](raw-requirement.md#L1)
- Plan: [plan.md](plan.md#L1)
- Implementation: preload 证据边界、Controller 周期/baseline、Domain 状态优先级与原子投影。

## Checked

| 验证 | 结果 |
| --- | --- |
| Bridge 完整文件 | `40 / 40` pass；新增同 revision completed→started、初始 active 后定向同 revision inProgress，以及缺 completedAt 的精确 completion |
| Controller 状态链序列 | `8 / 8` pass；含 targeted completed 后相同 full snapshot 不反弹 |
| Domain 状态语义 | `8 / 8` pass；activity-event 恢复 active，exact completed 立即关闭 |
| Platform/Presentation | 与 Bridge 合并 `62 / 62` pass；`task-state-v3` 透传通过 |
| Renderer 同源/兼容路径 | `3 / 3` pass |
| 完成未读专向链 | 五类时序均 pass；native file change → `readStateOnly` → completed-unread，不携带 activity |
| TypeScript | 当前被并行 MQTT/Action 测试桩修改阻断：`tests/runtime/action.test.ts` 存在平台 mock 类型与重复字段错误；本次状态链修改未产生矩阵编译/运行失败 |
| Preload | `node --check preload/index.js` pass；canonical/public 字节一致 |

## Full Matrix Findings

- Codex 矩阵当前 `152 / 152` pass，`6 / 6` 文件通过。
- 19 条仅绑定旧六页签、旧 DOM 与旧配置交互的 UI 测试已从活动套件移除，未使用 `skip`；7 条仍有当前价值的颜色直通和环境诊断断言已按现行合同更新。

## Findings

- P0: none.
- P1: 已修复——已接受 completed 未清除 active-exit baseline，导致后续 full snapshot 可反判回 inProgress。
- P1: 已修复——真实 activity patch 与首次 snapshot 无来源区分，旧 completed 元数据可压住新活动。
- P1: 已修复——初始/refollow snapshot 的旧 unread false 永久压住稍后原生 unread true；现由证据优先级与只读原生状态 watcher 即时发布。
- P1: 已修复——完成前 stream patch false 在残留 waiting flag 分支中绕过 completion 清理；所有 exact completion 现统一走 completion publisher。
- P1: 已修复——App Server 精确 active 事件在已有 Desktop idle snapshot 权威时被忽略，导致恢复中的 interrupted 任务持续显示已停止；现以 `app-server-live` 保留正向事件直到明确终止。
- P1: 已修复——普通 completed shape、同 revision started/inProgress 与 completedAt 必填形成三层重复阻断；现只让三类已确认 completion provenance 关闭 live 周期，并允许精确同 revision 状态前进。
- P2: 旧 runtime/float `conversations` 别名仍保留一版兼容，待 v2 退役后删除。

## Not Checked

- 未操作真实 Codex 任务、未归档/移除项目、未启停进程。
- 真实 uTools 宿主需正常重载后验收中断恢复完成、进行中恢复、任务切换和角标同步。

## Retained Minimal Guards

- 严格更旧 `startedAt`：防止乱序旧 started 反向覆盖，不影响同 revision 状态前进。
- 首次/refollow active 与 terminal 冲突的 `[0,300,1000]` 定向读取，以及 active-exit baseline：只覆盖初始快照和退出首帧歧义，精确 started/completed 可立即绕过。
- missing-key 隔离与 50/200ms 结构合并：只防清单误删/重复扫描，不参与单任务状态判定。
