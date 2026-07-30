# Codex 任务状态验证记录

Tool: codex
Date: 2026-07-30

## Review Target

- Requirement: [RAW-116–126](raw-requirement.md#L1)
- Plan: [plan.md](plan.md#L1)
- Implementation: preload 晚到 unread 复核、Controller 单一 active-exit 转换器、Domain 原子投影。
- Sidecar: 主线程。

## Checked

| 验证 | 结果 |
| --- | --- |
| Bridge 完整文件 | `41 / 41` pass；晚到 persisted unread 会对非 active 的旧 interrupted 任务执行一次 targeted latest-Turn 复核，不依赖任务切换 |
| Controller 完整文件 | `33 / 33` pass；实时 idle 与随后相同旧 interrupted full snapshot 均保持 ongoing，定向 completed+unread 原子进入 completed-unread |
| Codex 状态矩阵 | `153 / 153` pass，`6 / 6` 文件通过；覆盖 Domain、Presentation、Bridge、Platform、Controller 与 Renderer |
| TypeScript | `pnpm run typecheck` pass |
| 正式构建 | `pnpm run build` pass；含 Vite build、uTools runtime preparation 与 `validate:utools` |
| Preload | canonical/public 两份 `node --check` pass，且字节一致；`git diff --check` pass |

## Full Matrix Findings

- 状态主矩阵当前 `153 / 153` pass；新增一条晚到 unread 主动复核回归，并把 stale interrupted inventory → completed-unread → fresh stop 串成 Controller 时序。
- 扩展到仓库内全部 10 个 Codex 命名测试文件时为 `186 / 191`：5 条既有失败不在本次状态变更文件中。3 条 `codexAppearance` 仍绑定 RAW-071 已废止的颜色校验；2 条 `codexNewThread` 暴露当前模型代码与 RAW-046/PRODUCT_REQUIREMENTS 的既有冲突。按本次“外观/模型非目标”未修改其产品行为或测试。

## Findings

- P0: none.
- P1: 已修复——已接受 completed 未清除 active-exit baseline，导致后续 full snapshot 可反判回 inProgress。
- P1: 已修复——真实 activity patch 与首次 snapshot 无来源区分，旧 completed 元数据可压住新活动。
- P1: 已修复——初始/refollow snapshot 的旧 unread false 永久压住稍后原生 unread true；现由证据优先级与只读原生状态 watcher 即时发布。
- P1: 已修复——完成前 stream patch false 在残留 waiting flag 分支中绕过 completion 清理；所有 exact completion 现统一走 completion publisher。
- P1: 已修复——App Server 精确 active 事件在已有 Desktop idle snapshot 权威时被忽略，导致恢复中的 interrupted 任务持续显示已停止；现以 `app-server-live` 保留正向事件直到明确终止。
- P1: 已修复——普通 completed shape、同 revision started/inProgress 与 completedAt 必填形成三层重复阻断；现只让三类已确认 completion provenance 关闭 live 周期，并允许精确同 revision 状态前进。
- P1: 已修复——Controller 的 delta 路径只保护旧 completed，而 full snapshot 可用相同旧 interrupted/failed 清除 baseline 并发布 stopped；现两条入口共用一个 active-exit 转换器，未确认 terminal 保持 ongoing。
- P1: 已修复——persisted unread=true 到达旧 interrupted 投影时只更新 unread，无法发现已经 completed 的最新 Turn；现只唤醒一次有界 targeted 复核，unread 本身仍不推断完成。
- P1: 未纳入——`codexNewThread` 的周额度耗尽判断与 RAW-046 当前文字存在既有冲突；需单独锁定模型策略后修复，不能借状态任务改写。
- P2: 未纳入——3 条历史外观测试仍要求已被 RAW-071 删除的本地颜色/对比度门禁。
- P2: 旧 runtime/float `conversations` 别名仍保留一版兼容，待 v2 退役后删除。

## Not Checked

- 未操作真实 Codex 任务、未归档/移除项目、未启停进程。
- 真实 uTools 宿主需正常重载后验收中断恢复 completed-unread、普通完成、任务切换和角标同步。

## Retained Minimal Guards

- 严格更旧 `startedAt`：防止乱序旧 started 反向覆盖，不影响同 revision 状态前进。
- 首次/refollow active 与 terminal 冲突的 `[0,300,1000]` 定向读取，以及 active-exit baseline：实时与全量入口共用同一转换器；精确 started/completed 可立即绕过。
- missing-key 隔离与 50/200ms 结构合并：只防清单误删/重复扫描，不参与单任务状态判定。
