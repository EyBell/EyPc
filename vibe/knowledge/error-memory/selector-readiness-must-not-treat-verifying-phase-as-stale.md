---
id: eypc-selector-readiness-must-not-treat-verifying-phase-as-stale
status: verified
scope: project
fingerprint: companion-shortcut-selector__complete-but-verifying-package-forced-cold-preflight__failure-exits-unlogged
first_seen: 2026-08-21
last_verified: 2026-08-21
review_after: 2026-11-21
evidence:
  - preload/companion/task-kernel.cjs
  - preload/companion/task-actions.cjs
  - preload/index.js
  - tests/platform/companionTaskKernel.test.ts
  - vibe/specs/260821/2045-shortcut-selector-readiness/spec.md
tags:
  - companion-provider
  - navigation
  - global-shortcut
  - diagnostics
  - readiness-gate
---

# 选择器就绪门禁不得把 `verifying` 相位当作过期包，失败退出不得只剩系统通知

## 症状

「上一个/下一个任务」「打开待输入」等静默 uTools 快捷入口先是变慢（600ms 后弹「正在读取最新任务状态…」），随后完全打不开；任务列表内点击同一张卡片一切正常。运行诊断里只有 `plugin-lifecycle/plugin-enter kernel-consumed`，之后没有任何 `navigation` / `task-action` 轨迹，也没有错误记录（2026-08-21 20:14–20:27，五次入口全部如此）。

## 错误假设

两个。① 把 Kernel 包的 `freshness === 'verifying'` 等同于 PRD 所说的「冷/过期」，于是选择器动作（cycle / open-attention）被送进一次全启用 Provider 的 tasks-only 冷读并受 5 秒超时约束。实际 `verifying` 是单任务相位限定词（中断边在确认、Claude 会话相位 unknown），成员关系并无缺口。② 以为「有 notify 就等于有诊断」：`dispatch` 的 `ensureReady` 拒绝、`open-attention` 空候选、`shortcutArchive` 无目标三个退出只发系统通知、不写运行诊断，日志读者看到的就是「被消费后消失」。

## 已验证根因

- 日志：同一进程里 Claude 有 86 次 `unknown-evidence` 提议（unknown → verifying），包长期 `complete && verifying`；两端冷读 p50 ≈ 2.7 s，而同时 RAW-166 失配修复每 ~2–3 秒触发一次 Codex 窄冷读（259 次/12 分钟，max 6.6 s），共享同一传输，5 秒超时被轻易击穿。
- 复现：直接以 `createCompanionTaskKernel` 搭桩（stub `record/notify/preflight`）：fresh 包→立即派发并记录；verifying 包 + preflight 抛错/挂起→只剩两条通知、零诊断；`eypc-codex-completed-unread` 无候选、`eypc-companion-archive` 无目标同样零诊断。
- 旧测试 `refuses to navigate from a degraded retained package` 把这条过严门禁固化成合同，与 PRD「热且可信直接派发，只有冷启动/重连/明确成员缺口才等待盘点」相悖。

## 检测顺序

1. 诊断里找 `plugin-enter kernel-consumed`（现带 `details.featureCode`），看其后 2 秒内有无 `task-kernel/shortcut-enter` → `navigation/target-selected` → `<provider>-open`。
2. 没有导航轨迹时，看 `task-kernel/ready-preflight`（started/accepted/failed + `code`）与 `open-attention no-task`、`task-action/archive-shortcut no-target`；它们现在覆盖了全部静默退出。
3. 怀疑就绪门禁时，用真实 Kernel 模块搭桩复现，不要只做日志考古：桩几秒钟就能穷举退出路径。
4. 看 `cold-preflight` 的 `details.providers` 与 `durationMs`：两端读 + 修复风暴叠加是超时的放大器。

## 预防规则

- 选择器动作的就绪判据是成员完整（`complete`），不是整包 `fresh`；变更动作（归档/暂停/执行）保留精确目标 fresh 要求。
- Kernel 内每一个会让用户看不到结果的退出都必须 `record`，用户通知不是诊断。
- 诊断 `level` 只能是 `error|info|debug`；`warn` 会被汇拒收并制造 `diagnostics-level-missing`。
- 持续性修复动作必须有冷却/退避，否则在权威分歧下会变成读风暴。

## 替代路线

- 状态：`verified`（自动化）；真实宿主待重载插件后验收。
- 前置条件：Kernel V4 `companion-task-kernel-v4`；`dist/` 已重建并完成四端 identity 握手。
- 有序步骤：`ensureReady(targetKey, { allowVerifying })` 对 `cycle`/`open-attention` 按完整包直接返回 → `navigation.cycle`/`open` → Provider open；不完整时仍只做一次共享预检并记录 started/accepted/failed。
- 验证：`pnpm exec vitest run tests/platform/companionTaskKernel.test.ts tests/platform/companionNavigationBridge.test.ts tests/platform/companionTaskActionsBridge.test.ts tests/platform/runtimeDiagnosticsLevelContract.test.ts`；宿主：按快捷键后日志应出现 `shortcut-enter → target-selected → <provider>-open`。
- 适用边界：经 preload 导航权威的所有静默入口与 Renderer/Float 的 cycle、attention 调用；不改变变更动作的门禁。
- 回退：如完整包直派在宿主暴露「按过期相位选错层」的问题，回退到 `allowVerifying=false` 并同时保留新诊断，而不是回到静默失败。

## 记录历史

| 日期 | 任务 | 触发 | 失败路线 | 恢复 | 结果 |
| --- | --- | --- | --- | --- | --- |
| 2026-08-21 | 快捷键跳转失效修复 | 用户报「没法快速打开，甚至打不开」，列表点击正常 | `verifying` 被当过期→5 秒两端冷读→超时/抛错静默；空候选与无目标退出同样静默 | 完整包直派 + 四处退出进诊断 + `warn` 修正 + 修复冷却；测试 `66/66`、bridge 套件与 production build 通过 | verified（宿主待重载验收） |
