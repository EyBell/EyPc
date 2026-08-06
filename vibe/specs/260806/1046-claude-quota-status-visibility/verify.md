# Verify：Claude 额度与状态可见性补全

## 2026-08-06 三轮追加：过期窗口分支补测

`companionResetDetailText` 的 `now >= resetAt` 分支（`额度窗口已重置 · 等待新读数`）此前只有实现没有用例，本轮补上（含边界 `now === resetAt`）。

计数说明（此前记录漂移）：本文件下方的 42/43 是当轮的**新增子集**计数，而 `tests/domain/companionPresentation.test.ts` 是与并发的桌面端 provider 轮共享的文件，其总数会随对方用例增长。以文件总数记账会互相打架，因此此后只记「本轮新增 N 项 + 文件当前总数」：本轮 +1，文件当前 **55/55** 全绿（其中含桌面端轮的用例与本次注册状态行的 7 项）。

## 2026-08-06 二轮追加：GMT+8

`companionResetDetailText` 改固定 UTC+8 渲染（含「今天/明天」日界）。聚焦套件 43/43（新增跨时区用例：UTC 与 America/New_York 两个运行时区下输出一致）；typecheck 仍为既有 4 错（favorites 在途），零新增。

Spec: [spec.md](spec.md#L1) · Date: 2026-08-06 · 环境：Cowork Linux 沙箱（/tmp 独立 `pnpm install --ignore-scripts --frozen-lockfile`，node 22 / pnpm 10）

## 结果

| 项 | 结果 |
| --- | --- |
| `tests/domain/companionPresentation.test.ts` | 42/42（新增 19 项：reset 分档、freshness 分档、stale 投影、三参回归、gap note） |
| `tests/domain` 全量 | 300/300 |
| claudeBridgeSafety / claudePreloadCore / claudeQuotaFallback / codexFloatWindowBridge / codexCompanion | 132/132 |
| claudeBridge + claudeCliDiscovery 环境探测 8 项 | 环境失败，非回归——沙箱自带 `/usr/local/bin/claude` 泄进「空机器」fixture。已归档 [error-memory](../../../knowledge/error-memory/sandbox-real-claude-binary-breaks-empty-machine-fixtures.md#L1) |
| `vue-tsc --noEmit` | 4 错，与 HEAD 基线（回退本轮 3 个 TS/Vue 文件后重跑）**逐条一致**：全部在并发会话的 favorites 在途工作（appRuntime.ts / favoritesBehavior.test.ts），本轮零新增 |
| `vite build` + `prepare-utools-runtime` + `validate-utools-runtime` | 全部通过（validate 含 facade 端口正向断言，铁律 14） |

## Codex-only 零差异论证

- hint/aria 第四参默认 `''`，三参调用输出逐字节不变（既有用例 L190-194 未改动、继续通过）。
- `stale` 字段仅 Claude chip 携带；Codex chip 对象字面量未动（新增用例断言 `'stale' in codexChip === false`）。
- 状态行 note 在 `providers.claude !== true` 时恒为空串（新增用例）。
- Codex chip 的 resetText 继续走 FloatApp 原 `formatReset`，未触碰。

## 宿主验收（归用户）

- 悬停 Claude 额度 chip：应见「Claude · 5 小时限额 · 今天 HH:mm 重置（约 N 小时后）· 读数更新于 X 前」；周限额显示「周X HH:mm」。
- 断开额度来源（如令读数变旧）：chip 变灰，提示句尾出现「可能已过期」。
- hooks 过期时浮窗底部状态行出现「Claude 钩子已过期，重新注册后恢复实时状态」；重新注册后消失、「正在进行中」恢复实时。
