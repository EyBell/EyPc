# Verify: Codex Environment Action Runner

Tool: codex

Date: 2026-08-03

## Status

`automated-verified / host-pending`：2026-08-03 接纳复核重新打开的 exact argv、Environment 选择、冷启动、Host 身份与插件退出生命周期已完成代码与自动化闭环。聚焦测试、preload syntax/mirror、typecheck、production build、统一 `pnpm run verify`、Markdown/权威一致性均通过；真实 uTools、Windows 进程树、真实 Action 与长期 Serve 未执行，因此不宣称 real-host accepted。

## Reopened Findings And Resolution

| Finding | Resolution | Current evidence |
| --- | --- | --- |
| P0：命令前缀正则允许额外 argv 到达启动计划 | Domain/Host 共用完整 argv 形状；只有 package manager `run build|serve`、`vite build|serve`、`git push` 进入 catalog，启动计划只接收结构化结果 | 正例与 `$()`、`&`、pipe、newline、`--`、`--config`、额外 positional、Git ref/force 负例 |
| P1：五槽固定选择第一个 Environment | Host `selectedLaneId` 成为优先项目内的五槽权威；只有无历史时默认第一个 Environment，跨项目/失效/缺槽均拒绝 | Env B、持久化恢复、跨项目、失效与缺槽 Controller 回归 |
| P1：冷启动受 Codex Tab/Float 可见性门禁 | 增加功能启用限定的 tasks-only preflight；Runner 先同步显示 loading/message；catalog/run 前刷新 alias，stale 只重建并重试一次 | 非 Codex/Float 关闭、Runner-first、一次性 stale list/run 回归 |
| P1：关闭连接未接管 Action 生命周期 | `onPluginOut(false)` 保留 live Action；`onPluginOut(true)` 取消 restart、flush/interrupted 持久化、清空 runtime authority 后非强制终止 | 生命周期行为测试与无 `SIGKILL` 源码合同 |
| P1：同项目不同 worktree 的 session/confirm 可串线 | 项目 `targetId=projectKey` 保持历史 Lane；task `targetId` 含 canonical cwd Host 摘要，run/stop/vault/session/confirm 全部复核 | 不同 worktree lane/session/confirmation 隔离和错误 targetId 拒绝 |
| P2：TOML version 可用等价值绕过 | Host/Domain 只接受原始裸 token `1` | `"1"`、`1.0`、`1e0`、`01` 负例 |
| P2：Windows 只终止 direct child | Windows 优先 `taskkill /PID … /T`，不带 `/F`，失败才 direct-child `SIGTERM` | bridge 源码合同；真实 Windows pending |

## Verification Snapshot

- [x] 回归先红：旧实现下聚焦 7 文件出现 `17` 个失败、`69` 个通过，覆盖本轮新增边界。
- [x] 修复后聚焦 Action/Controller/Host/Runner/routing：7 文件 `95/95`。
- [x] `node --check`：canonical/public 的 index/action/float preload 均通过。
- [x] `pnpm run sync:preloads`：canonical/public 镜像一致。
- [x] `pnpm run typecheck`：独立执行通过；production build 与最终 verify 内再次通过。
- [x] 完整非 watch `pnpm run build`：Vite production build、runtime prepare 与 `validate:utools` 通过。
- [x] 最终 `pnpm run verify`：57 文件 `733/733`，随后 typecheck、production build、runtime prepare 与 `validate:utools` 通过。
- [x] EyPc 与 CodeNote 变更文档的 Markdown code-link、relative-link、diff/authority consistency audit 通过。
- Documentation Sync Receipt 是本文件最终编辑后的本地 closeout 末步，不替代上述验证或宿主验收。
- [ ] 真实 uTools child/global hotkey/隐藏与退出、真实 Windows 进程树、真实 Build/Serve/Git Push、长期 Serve（宿主门禁）。

## Safety And Compatibility Assertions

- `shell:false` 与绝对 Node/native launch plan 保留；原始命令、cwd、PID、Node path、token 和未脱敏 stderr 不进入 Renderer。
- 项目目标 Lane 仍以既有 `projectKey` 为 `targetId`，没有 SQLite schema 或项目历史迁移。
- Serve 正常 stop 在真实 exit 前保持 `stopping`；POSIX/Windows 路径均不自动使用 `SIGKILL`。
- Runner/五槽不切换主窗口当前 Tab，也不安排 Renderer hide；入口可见性由 `plugin.json.mainHide` 管理。
- Float 仍只转发五槽 Runtime Action，不拥有 Environment/session/history/confirmation 状态。

## Historical Evidence Note

2026-07-31 的 `48/48`、`697/697`、typecheck/build/validate 只证明当时 NVM、日志 framing、SQLite retention、Runner 窗口与 Quick Jump 增量；本轮接纳使用 2026-08-03 重新执行的聚焦 `95/95` 与完整 `733/733`，未复用旧计数替代新门禁。

## Not Executed

- 未执行真实 Git Push、真实 Build/Serve、长期 Serve 或任何外部写入。
- 未启动真实 uTools Runner/hotkey/multi-display/插件退出流程。
- 未在真实 Windows 上执行进程树终止。

## 2026-08-03 Shortcut-Latency Increment

- 普通非 kill pluginOut 后 App Server 不退出，既有 task/project alias 继续有效；热任务打开新增 `thread/list/thread/turns/list` 为 0，kill 分支仍完整关闭。
- Action 槽首次冷 preflight 后，执行前/后 catalog 校验及再次打开 Runner 均复用 verified inventory；task snapshot 总数保持 1。并发 expired task alias 共享一次成功 threads preflight。
- 聚焦 `codexController`、`codexAppServerBridge`、`codexActionRuntime`、`codexActionRunnerBridge` 为 `149/149`；typecheck、main preload 语法/镜像与 diff 通过。未运行完整 verify/build 或真实 uTools。

## 2026-08-03 Incremental Catalog Increment

- Controller 离开 Codex Tab 后不 close/清库存，off-tab Activity Delta 仍更新同一任务物化视图；额度/config 保持 surface-only。
- Runner 冷加载项目后再次打开的 Environment catalog 读取为 0；下一份 verified inventory 保留未变项目、仅为新增项目和 alias 变化项目各读取一次，最终 catalog 顺序/选择仍来自当前 Controller 投影。
- Host run/stop 的当前 TOML、target 与 command 指纹校验未被缓存替代；旧 Action Host revision 与 stale alias 仍 fail-closed/单次重建。
- 15 个相关 Codex/Action/路由/UI 测试文件 `301/301`、typecheck、三类 preload syntax/mirror、Vite build、runtime preparation、uTools validation 与 diff 通过；未运行完整 Vitest/`pnpm run verify`，真实 uTools 连续 Runner/五槽时延 pending。

## Review Implementation — 2026-08-05

Tool: cursor-review-implementation

## Review Target
- Requirement: [raw-requirement.md](raw-requirement.md#L1) / [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L111)（Action Runner 独立子窗、exact argv、tasks-only preflight、selectedLaneId、`onPluginOut(isKill)`、Float 无 Action 状态）
- Plan: [plan.md](plan.md#L1) / [tasks.md](tasks.md#L1) T1–T16 均标记完成；同提交共载 WJ-22 native module 拆分见 [window verify](../../260724/1527-window-jump-workbench/verify.md#L1)
- Implementation: commit `18461bb`（`feat(codex): 落地 Action Runner 工作台并拆分窗口 preload`）。复核在干净 detached worktree 执行，排除主工作树未提交 Claude Companion 脏改。

## Checked
- Requirement alignment: 独立 `action.html`/ActionApp、白名单 action preload、五槽+Runner `mainHide` 路由、exact argv Domain/Host、runtime revision、selectedLaneId 五槽权威、`onPluginOut(false)` 保留 live Action / `(true)` interrupted flush、Float 无 Environment IPC、单 Environment 省略中间层、Quick Jump F/Shift+F、关闭仅隐藏 — 与 spec 对齐。
- Plan-to-implementation coverage: T1–T16 与计划条目在代码/测试/文档均有对应；真实宿主门禁仍按计划 pending。
- Risk and compatibility: Runner 无 spawn/fs/db；`shell:false`；Action stop 无自动 `SIGKILL`；Windows `taskkill /T` 无 `/F`；项目 `targetId=projectKey` 保持；WJ native 实现仅在 `preload/windows/*.cjs` 且 public/dist 镜像。
- Verification evidence（本轮重跑，干净 `18461bb` worktree）:
  - 聚焦 14 文件 `433/433`（Action Controller/Runtime/Bridge/UI/Environment/routing + Window preload/domain/platform）
  - preload `node --check` + `sync:preloads` + action/float/windows 镜像一致
  - `pnpm run typecheck` 通过
  - `pnpm run build`（含 Vite 产出 `action.html`/`action-preload.js`/`windows/*`、prepare、`validate:utools`）通过
  - 未在本轮重跑完整 Vitest / `pnpm run verify`（历史记录仍为 57 文件 `733/733`）

## Findings
- P0: 无
- P1: 无（自动化闭环成立；真实 uTools/Windows/真实 Action 按权威保持 host-pending，不构成未满足需求）
- P2:
  - Quick Jump 仅在 `catalog.confirmLaneId` 时禁用；Host 投影的 `action.state === 'confirm-required'` 本身不阻断 F。若“确认层”意图覆盖 Git Push 按钮确认态，可补同一门禁。
  - `tests/ui/actionRunner.test.ts` 以源码合同为主，交互/DOM 行为覆盖偏薄。
  - 主工作树另有未提交 Claude Companion 改动重叠 `codexController`/preload；合入前需防回归 Action 契约。

## Optimization Suggestions
- 宿主验收按 [Residual Gates](handoff.md#L29) 执行：Runner 显隐/hotkey、普通 hide vs kill、真实 Build/Serve（非外部写入强制）、Windows 进程树。
- 可选：确认态统一阻断 Quick Jump；为 Runner 左右栏补少量 Vue Test Utils 交互用例。

## Not Checked
- 真实 uTools child window / 全局快捷键 / 多显示器
- 真实 Git Push、Build/Serve、长期 Serve、外部写入
- 真实 Windows `taskkill` 进程树
- 本轮完整 Vitest 全量与 CodeNote 外部文档
- 主工作树未提交的 Claude Companion / `_to_delete/`
