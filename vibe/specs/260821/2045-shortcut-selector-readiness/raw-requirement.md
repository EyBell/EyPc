# RAW：快捷键上一/下一任务与快捷跳转打不开

Tool: claude
Date: 2026-08-21
Documentation level: `standard`

## 用户原始诉求（2026-08-21 晚）

> 当前，通过快捷键交互"上一个任务"、"下一个任务"以及其他快捷跳转打开的行为，会出现严重的问题。现在已经没法快速打开，甚至都已经没法打开了。但是在任务列表内，是可以正常点击打开的。
>
> 你去核验一下相关的日志记录，然后解决一下这个问题。

## 请求分类与授权边界

- 模式：`implement-validate`。用户明确要求「核验日志」并「解决问题」。
- 已授权：读取本机运行诊断日志、改代码、跑聚焦测试 / typecheck / production build 重建 `dist/`。
- 未授权因此未做：启动 uTools、驱动全局快捷键、浏览器/桌面自动化、提交 Git。真实宿主验收需用户重载插件后按键。
- 同日上一轮（[Cursor 接入导航权威](../../260818/1335-cursor-companion-feasibility/raw-requirement.md#L80)）已接受的证据复用，只做净增量。

## 日志核验事实（`~/Library/Application Support/uTools/eypc-diagnostics/runtime-*.jsonl`，UTC）

1. 19:44 本地（11:44Z）六次「上一个/下一个」全部派发成功，但始终落在同一张 Claude `running` 卡（`cycleCount: 1`）：attention/plan 层为空，active 层只有这一张，按首个非空层循环属合同行为，不是故障。
2. 20:14:56 进程重启（identity 握手 `host-7842de67220cef501299` / kernel v4，与当时 `dist/` 一致，排除旧构建）。20:22:10、20:22:13、20:27:03、20:27:05、20:27:07 五次 `plugin-enter kernel-consumed`，其后**零** `navigation` / `task-action open` / 错误记录；20:27:09 进程结束，20:27:16 再次启动。
3. 20:27:03.265 的入口恰好启动了一次两端冷读（`cold-preflight {codex,claude}` 635 ms），随后 `target-sync accepted` + `task-package-send`（即 `commitDraft` 发布），仍无导航轨迹。
4. 同进程内 Claude `state-proposal` 含 86 次 `unknown-evidence`（相位 unknown → `verifying`），包长期 `complete && verifying`；Codex 任务 `h:476c…` 被 Desktop 每 ~300ms 提议 `causal-waiting-input`（`waitingOnUserInput`），Kernel 持续保持 `completed` 并 `superseded`（`canonicalMismatchCount: 1`）。
5. 失配修复 `canonical-mismatch-repair` 以 `level: 'warn'` 记录，被诊断汇全部拒收（253 条 `diagnostics-level-missing`）；由它触发的 Codex 窄冷读 12 分钟 259 次（p50 1.2 s、p90 2.6 s、max 6.6 s）。两端冷读 p50 ≈ 2.7 s。
6. 日志单文件 8 MB / 8 分钟、目录上限 64 MB，实际仅保留约 1 小时历史。

## 结论

- 入口被 Kernel 消费后的三条退出不写诊断，只发系统通知：`dispatch` 中 `ensureReady` 拒绝（`preflight-timeout` / `preflight-incomplete` / Provider 读失败）、`open-attention` 空候选、`shortcutArchive` 无目标。用真实 Kernel 模块搭桩复现：`verifying` 包 + 预检挂起/抛错 → 只剩「正在读取最新任务状态…」「任务状态预检失败，请重试」两条通知 —— 与用户描述的「先变慢、后打不开」完全对应。
- 根因是 `ensureReady` 把整包 `freshness !== 'fresh'` 当作过期，选择器动作被迫进入全启用 Provider 冷读并受 5 秒超时约束；一条 unknown 的 Claude 会话就足以让每一次快捷键走慢路径，而修复风暴让慢路径经常超时。
- 列表点击走 `open` 精确目标路径（fresh 目标短路，Cursor 还走 Controller 直连），因此不受影响。

## Requirement Change Review

- Scan scope / owners：当前请求 → [PRODUCT_REQUIREMENTS §163](../../PRODUCT_REQUIREMENTS.md#L163) 与 §152 → [RAW-152/155 导航合同](../../260718/1148-codex-quota-float/spec.md#L1) → Kernel 测试合同。
- Visible changes：**changed** §163「冷/过期」改为「成员不完整」，明确 `verifying` 不阻塞选择器派发，并要求预检/空候选/入口 code 进诊断；**unchanged** §152 层级循环、5 秒超时、部分集合不跳转、变更动作的精确目标 fresh 要求。
- Conflict classification：`no-conflict`——§152 本就写明「热且可信时直接派发，只有冷启动、重连或明确成员缺口才等待盘点」，§163 的「过期」此前被实现为 `verifying`，属实现过严而非合同冲突。
- Decision status：`explicit-current-request`（用户要求解决「打不开」）。
- Post-sync rescan：`pass`。不入 RAW 登记、不改 `CompanionProviderId`。

## 待用户裁决（本轮未改）

1. Codex 任务 `h:476c…`：Desktop 说待输入、Kernel 判已完成。若该任务在 Codex Desktop 里确实在等你回复，这是 RAW-153 清除屏障/残留请求（同日 `49070b7` 一类）的判定问题，需要单独立项；若它已不再等待，则 Desktop 残留提议才是错的。请确认实际状态。
2. 是否按 Claude 会话长期 `unknown` 再开一轮：它不再阻塞快捷键，但会让「状态未知」分组常驻。
3. 失配修复触发判据（无法区分「被合法改判」与「真卡住」）是否需要更深的改造；本轮只加 30 秒冷却。

## 再核验（2026-08-22 17:06，用户要求「再核验下 Codex 功能 tab 内上一/下一个任务快捷键跳转失败」）

模式：`inspect-report`，只读日志与源码，未改产品代码。

1. **宿主仍是旧包。** 当前插件进程 2026-08-21 21:41 启动（`unsafe-96713bb6….asar`），身份握手 `host-2cb135f5562f2d8b9c67`；D-1 补转发后的产物 `host-90b803b87d0962728d5c` 只在 `dist/`（22:31 构建）里，从未装入 uTools。因此 Cursor 候选在宿主里仍不会进上一/下一循环；`dist/` 与 `public/`、`preload/` 镜像一致，聚焦套件 `311/311` 通过。
2. **今日唯一一次上一个（16:50:56）派发成功但只剩一位候选。** `shortcut-enter cycleCount: 1`（主包 42 条）→ `target-selected` → `claude-open dispatched`，无任何 warn/error。候选只有一张 `running` Claude 卡；Claude live-state 探针同时确认本机正有 2 个 Claude Code 会话在跑。按 PRD §152「attention → Plan → active → 置顶」取首个非空层，已完成任务不进循环，所以在 Codex tab 按上一/下一只会在正在运行的 Claude/Codex 会话间切，表现为「总跳到同一个 Claude 会话、跳不到 Codex 任务」。这是合同行为，不是派发故障；若期望的是沿 Codex tab 可见列表逐张跳转，属需求变更，需另立 RAW。
3. **上一轮待裁决 1 仍未解决且仍在影响候选集。** Codex 任务（本进程哈希 `h:ea7c1dc97a90e775`，`turnStartedAt` 2026-06-13；诊断哈希按进程随机加盐，与昨日 `h:476c…` 很可能同一任务）被 Desktop 以 `causal-waiting-input` 提议 702 次，Kernel 在进程启动 7 秒后判 `all-branches-completed` 并一直维持；`canonical-mismatch-repair` 冷却生效（63 次 queued）。若它在 Codex Desktop 里确实在等回复，它本该占据 attention 层并成为上一/下一的首选目标；若是 6 月残留的 `waitingOnUserInput` 标志，Kernel 判定正确。仍需用户在 Codex Desktop 内确认该任务实际状态。
4. **`eypc-codex-task-next` 在全部留存日志里从未出现**（previous 19 次、completed-unread 2 次）。若用户按过「下一个」，按键没有到达插件，属 uTools 全局快捷键绑定/冲突，插件内无默认键位（只有 `codex.task.next.hotkey.configure` 引导去 uTools 配置）；本轮无法从磁盘读出 uTools 绑定记录。

结论：代码侧无新缺陷；需用户①在 uTools 重载/重装 `dist/` 产物，②确认第 3 条任务的真实状态，③确认「下一个」的 uTools 绑定。
