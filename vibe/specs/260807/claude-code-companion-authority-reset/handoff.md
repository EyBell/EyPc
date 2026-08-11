# Claude Code Companion 权威重置 — Handoff

updated: `2026-08-11`
delivery_state: `implementation-landed / RAW-154-automated-verified / RAW-029-focused-verified / native-sidebar-unsupported / quota-host-verified / interactive-host-partial`

## Start Here

1. [spec.md](spec.md#L1) — 当前合同、用户选择与已废弃路线。
2. [research.md](research.md#L1) — 本地证据边界、路线比较和严格实验通路。
3. [verify.md](verify.md#L1) — 自动化/实机聚合证据与未通过门禁。
4. [plan.md](plan.md#L1) / [tasks.md](tasks.md#L1) — 已落地工作与剩余验收。

## Current Production Route

- Inventory/title/history: [code-sessions.cjs](../../../../preload/claude/code-sessions.cjs#L1).
- Version-gated exact App state: [app-state.cjs](../../../../preload/claude/app-state.cjs#L1).
- Unique official Hook fallback: [events.cjs](../../../../preload/claude/events.cjs#L1).
- Parent Turn reconciliation: the Hook reducer accepts only a new Prompt as Turn-open; App terminal defeats same-Turn subagent/tool tails, with pure version comparison in [claudeCode.ts](../../../../src/domain/claudeCode.ts#L1).
- Native unread snapshot: [unread.cjs](../../../../preload/claude/unread.cjs#L1), using uTools' host-signed LevelDB module, exact tagged key and copy-before/after V2 fingerprint.
- Exact existing history + presence/singleflight: [open.cjs](../../../../preload/claude/open.cjs#L1).
- Provider-neutral task actions: [task-actions.cjs](../../../../preload/companion/task-actions.cjs#L1), with exhaustive Provider dispatch, per-task archive single-flight and process-owned five-second shortcut confirmation.
- D′ task archive and indexed membership: [archive.cjs](../../../../preload/claude/archive.cjs#L1) plus [code-sessions.cjs](../../../../preload/claude/code-sessions.cjs#L1). Only one unique indexed target may change `isArchived`; metadata+private active-inventory removal confirms EyPc success, and open preflight rejects archived/missing/ambiguous sessions before Deep Link. Success/idempotent copy explicitly says the EyPc row is removed while Claude's native sidebar remains unconfirmed and may still need refresh；D′ does not emit the App's native `archived` event.
- Dynamic quota/Node HTTPS: [claude.ts](../../../../src/domain/claude.ts#L1) and [quota.cjs](../../../../preload/claude/quota.cjs#L1), with explicit Claude App encrypted-cache authorization and current dynamic limits shape.
- Independent materialized lanes: [codexController.ts](../../../../src/runtime/codexController.ts#L1).
- Per-task real sync: internal `codex.claude.task.sync` joins the existing state/unread lanes; the Claude-only drawer action and successful-open silent sync never create a manual receipt.
- Virtual projects/filter/ownership: [companionAggregate.ts](../../../../src/domain/companionAggregate.ts#L1), [FloatApp.vue](../../../../src/FloatApp.vue#L1) and [float.css](../../../../src/styles/float.css#L1).

Claude-focused historical automation (`16/16` files、`343/343` tests) remains green；the RAW-024 delta adds `4/4` files、`120/120` tests plus the fixed action `1/1`。RAW-154 current affected matrix is `20/20` files、`550/550` tests；typecheck、1868-module production/uTools build、runtime validator、canonical/public mirror、JS/CJS syntax and diff checks pass。A historical 74-file / 1061-test full ladder passed，but RAW-018 supersedes it as an over-broad default。Latest sanitized host projection has 27 Code rows (0 running / 24 completed / 1 stopped / 2 unknown)，with 25 exact App-log states；native unread reads previously passed 30/30 with one membership，and App quota HTTP 200 yielded 5h + weekly_all + Fable scoped windows with reset。A user-authorized real D′ canary passed on 2026-08-10；RAW-029 D-1/D-2 focused verification passed on 2026-08-11, while native-sidebar convergence is `unsupported-currently`；the following host gates remain independent。

## Do Not Restore

- CLI transcript、Cowork/mixed inventory 或 UUID 标题。
- Hooks-only 完成声明、latest-event reducer、宽松私有日志匹配或私有 IPC 注入。
- 任何 watcher callback 延迟作为最终 UI publish 延迟的替代指标。
- WAL/`.ldb` 字节扫描、上次未读集合或持久 EyPc 回执；仅允许成功精确跳转后、同 completion epoch、可撤销且带原生复读的进程内提示。
- `resume/import`、终端、AX-title、每次跳转全量窗口枚举或自动 App 启动。
- 把 Claude archive 实现为 Deep Link 后 AX/JXA 点击、把 App 归档日志作为硬成功条件，或在旧 Bridge 上回退该路线。
- 扫描/批量改写 Claude 会话目录、写 LevelDB、修改非目标会话或在并发变化后用旧备份覆盖新字节。
- 全 authority 刷新、额度网络串联状态、固定两窗口、进程期三次额度尝试或过期 reset。
- 固定 `test → typecheck → build → verify` ladder，或把 Agent 自拟 plan 的后续批准当成 full-suite 授权。
- 把 `SubagentStop`/工具尾事件当父 Turn 新活动，或增加人工 completed/read 覆盖、第二条同步通道。
- 把 `[已归档]` 解释为物理迁移授权；五份历史文档当前只在原路径逻辑归档。
- 把 D′ 的 `isArchived=true`、EyPc 库存缺行、LevelDB、App 重启后视觉结果或任何私有 IPC/UI 自动化结果当作 Claude 原生侧栏 ACK。

## Remaining Acceptance

- D-2 当前不是待编码项：只有 Claude 后续提供受支持的本地 Code 原生归档入口，并能同时验证同一 session 原生 ACK 与同一运行中侧栏 1.25 秒内移除时才重开；否则保持 `unsupported-currently`。
- 在 Claude App 手动归档一个可丢弃会话，核对精确 watcher 在 250ms 目标内移除 EyPc 卡片；再以受控方式丢一次 callback，核对一秒 watchdog 在 1.25 秒内恢复且不触发全量库存。
- 在实际 uTools/Claude 中走完 permission、AskUserQuestion、响应、后台完成、EyPc 点击现有真实 unread 后原生移除/同轮不回跳/新 completion 再未读、标题 patch 与重启恢复；同一任务不得跨分组或产生副本。
- 在真实混合项目上核对共享、Codex-only、Claude-only、重名歧义及 `全部 / 只显示 Codex / 只显示 Claude`，并检查归属文字、8%/12% 背景、键盘/ARIA/高对比度。
- 在实际 uTools 展开卡同屏确认已由真实 App quota source 提供的 5h、全模型周、Fable、绝对/相对 reset 与 freshness。
- 任一失败更新同一个任务及 [research.md](research.md#L1)，不得把已废弃路线重新提升为当前权威。
