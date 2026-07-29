# Codex 任务状态验证记录

Tool: codex
Date: 2026-07-30

## Review Target

- Requirement: [RAW-116–121](raw-requirement.md#L1)
- Plan: [plan.md](plan.md#L1)
- Implementation: preload 证据边界、Controller 周期/baseline、Domain 状态优先级与原子投影。

## Checked

| 验证 | 结果 |
| --- | --- |
| Bridge 完整文件 | `34 / 34` pass |
| Controller 状态链序列 | `8 / 8` pass；含 targeted completed 后相同 full snapshot 不反弹 |
| Domain 状态语义 | `8 / 8` pass；activity-event 恢复 active，exact completed 立即关闭 |
| Platform/Presentation | 与 Bridge 合并 `59 / 59` pass；`task-state-v3` 透传通过 |
| Renderer 同源/兼容路径 | `3 / 3` pass |
| TypeScript | `pnpm exec vue-tsc --noEmit` pass |
| Preload | `node --check preload/index.js` pass；canonical/public 字节一致 |

## Full Matrix Findings

- Codex 矩阵当前 `138 / 164` pass。
- 剩余 26 条为已存合同债务：3 条旧配色规范、4 条环境/配色 Controller 断言、19 条历史六页签/旧编辑器 UI 断言。它们不覆盖本轮任务状态通路，未为凑全绿扩围修改产品行为。

## Findings

- P0: none.
- P1: 已修复——已接受 completed 未清除 active-exit baseline，导致后续 full snapshot 可反判回 inProgress。
- P1: 已修复——真实 activity patch 与首次 snapshot 无来源区分，旧 completed 元数据可压住新活动。
- P2: 旧 runtime/float `conversations` 别名仍保留一版兼容，待 v2 退役后删除。

## Not Checked

- 未操作真实 Codex 任务、未归档/移除项目、未启停进程。
- 真实 uTools 宿主需正常重载后验收中断恢复完成、任务切换和角标同步。
