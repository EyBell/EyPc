# Claude Code Companion 权威重置 — Handoff

updated: `2026-08-08`
delivery_state: `implementation-landed / automated-verified / quota-host-verified / interactive-host-partial`

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
- Dynamic quota/Node HTTPS: [claude.ts](../../../../src/domain/claude.ts#L1) and [quota.cjs](../../../../preload/claude/quota.cjs#L1), with explicit Claude App encrypted-cache authorization and current dynamic limits shape.
- Independent materialized lanes: [codexController.ts](../../../../src/runtime/codexController.ts#L1).
- Per-task real sync: internal `codex.claude.task.sync` joins the existing state/unread lanes; the Claude-only drawer action and successful-open silent sync never create a manual receipt.
- Virtual projects/filter/ownership: [companionAggregate.ts](../../../../src/domain/companionAggregate.ts#L1), [FloatApp.vue](../../../../src/FloatApp.vue#L1) and [float.css](../../../../src/styles/float.css#L1).

Claude-focused automation (`16/16` files、`343/343` tests) remains green; the RAW-024 delta adds `4/4` files、`120/120` tests plus the fixed action `1/1`, scoped semantic typecheck, mirror/IPC, 1868-module production bundle and uTools runtime validation. A historical 74-file / 1061-test full ladder also passed, but RAW-018 supersedes it as an over-broad default and it must not be repeated without a new impact trigger. Latest sanitized host projection has 27 Code rows (0 running / 24 completed / 1 stopped / 2 unknown), with 25 exact App-log states; native unread reads previously passed 30/30 with one membership, and App quota HTTP 200 yielded 5h + weekly_all + Fable scoped windows with reset. These observations correct the old false-running sample but do not replace EyPc click removal/no-return and the remaining controlled UI matrix below.

## Do Not Restore

- CLI transcript、Cowork/mixed inventory 或 UUID 标题。
- Hooks-only 完成声明、latest-event reducer、宽松私有日志匹配或私有 IPC 注入。
- 任何 watcher callback 延迟作为最终 UI publish 延迟的替代指标。
- WAL/`.ldb` 字节扫描、上次未读集合或持久 EyPc 回执；仅允许成功精确跳转后、同 completion epoch、可撤销且带原生复读的进程内提示。
- `resume/import`、终端、AX-title、每次跳转全量窗口枚举或自动 App 启动。
- 全 authority 刷新、额度网络串联状态、固定两窗口、进程期三次额度尝试或过期 reset。
- 固定 `test → typecheck → build → verify` ladder，或把 Agent 自拟 plan 的后续批准当成 full-suite 授权。
- 把 `SubagentStop`/工具尾事件当父 Turn 新活动，或增加人工 completed/read 覆盖、第二条同步通道。
- 把 `[已归档]` 解释为物理迁移授权；五份历史文档当前只在原路径逻辑归档。

## Remaining Acceptance

- 在实际 uTools/Claude 中走完 permission、AskUserQuestion、响应、后台完成、EyPc 点击现有真实 unread 后原生移除/同轮不回跳/新 completion 再未读、标题 patch 与重启恢复；同一任务不得跨分组或产生副本。
- 在真实混合项目上核对共享、Codex-only、Claude-only、重名歧义及 `全部 / 只显示 Codex / 只显示 Claude`，并检查归属文字、8%/12% 背景、键盘/ARIA/高对比度。
- 在实际 uTools 展开卡同屏确认已由真实 App quota source 提供的 5h、全模型周、Fable、绝对/相对 reset 与 freshness。
- 任一失败更新同一个任务及 [research.md](research.md#L1)，不得把已废弃路线重新提升为当前权威。
