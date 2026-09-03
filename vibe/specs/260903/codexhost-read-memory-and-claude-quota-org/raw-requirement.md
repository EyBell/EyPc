# RAW-203 / RAW-204：额外进程已读记忆与 Claude App 额度组织仲裁

Tool: claude · Date: 2026-09-03 · Level: Standard（需求）

spec_id: SPEC-260903-CODEXHOST-READ-MEMORY-AND-CLAUDE-QUOTA-ORG

## 用户原话

> 1. 通过 codex host 交由 codex 接管的任务 在展示时我切换到那个页面并将其设为已读 有时候本插件还会弹回 重新展示为未读, 你核验一下整个codexhost相关代码的通路, 以及本插件通过快捷方式快速打开了这个插件的通路, 以及在什么情况下 插本插件会反复展示为未读？然后去找一个问题所在 去解决一下当前这个场景的问题
> 2. 参见图1, 为何Claude Code的这个额度展式 完全没有了, 你先核验一下 当前为什么展示的是94%, 而不是我需要的那种94/89 (普通模型周额度, fable周额度), 以及我点击悬浮球 展开卡片里的周额度提示信息 然后点击刷新时 我无法获知是否已刷新 有没有真正的更新, 从结果上看 周额度没有按照我刚才说明的那样去展示
> 3. 你再完整地把整个相关的执行代码核验一下 看是否出现重复判断定义 导致有冗余 相互冲突的代码 可能需要去梳理解决一下

（图1：水球球心只有 `94%` 与 `CLAUDE` 来源标注，没有并列的 Fable 读数。）

## 核验证据（只读，来源为本机与本仓）

### 问题 1 · 额外进程「已读弹回未读」

1. 额外进程的相位与未读只来自 Host `thread list`（无推送）；EyPc 跳转即已读由进程内 `codexDesktopOpenedReadAcknowledgements` 记住，绑定到该行的 `lastTurnStartedAt`（[codexRememberDesktopOpenedRead](../../../../preload/index.js#L4300)）。
2. 额外进程没有真实 Turn 时间：[projectHostTurn](../../../../preload/codex/codexhost-discovery.cjs#L138) 用 discovery 自己的 `statusChangedAt` 同时充当 `startedAt` / `completedAt`；而 `statusChangedAt` 只在 `externalThreads` 这张进程内 roster 里延续（[refreshExternalThreads](../../../../preload/codex/codexhost-discovery.cjs#L330)）。
3. roster 会在三处整体丢失：会合点解析失败（`ps`/`pgrep` 超时、Host 子进程瞬时缺席）时 `externalThreads = new Map()`；`resetCodexThreadSessionState` 调 `codexhostResetDiscovery()`（[index.js#L7154](../../../../preload/index.js#L7154)）；插件重载。下一次成功列表把每一行重新落座为 `firstSeenAt = statusChangedAt = now()`。
4. 于是同一条已完成的行以「更新的 Turn」重新出现：[codexReconcileDesktopOpenedReadWithTurn](../../../../preload/index.js#L4372) 判定 `currentStartedAt > ack.turnStartedAt` 清掉已读确认（诊断 `task-evidence/opened-read-cleared`），`updatedAt` 也跳到现在（「刚刚」）；此时若 Host 仍报 `hasUnreadTurn=true`（深链未被 Desktop 消费——例如 RAW-202 修的冷启动吞链，或 Desktop 尚未处理），行就弹回「已完成未读」。Host 端 `unread` 只在 Desktop 真正 resume/读取内容时清零（codex-host `app-server-host.ts` L3406 / L3477），EyPc 没有告知 Host「已读」的通道。
5. 本机诊断 06:07–06:21 一段里 `codexhost-discovery` 只有 `ok/cached/partial`，没有 `unavailable`，所以本轮没抓到现场；但通路推演与 260902 错误记忆（stale roster 复活已归档行）同源：**任何让行「消失再出现」的信号都会带来新的时间戳**。

### 问题 2 · 球心只有 `94%`

1. `94%` 是普通周剩余（plan-usage 样本 `sd: 6`），来源 `plan-history`；并列的 Fable 读数需要 usage API 的 `weekly_scoped` 窗口（[claudeScopedWeeklyQuotaWindow](../../../../src/domain/claude.ts#L367)）。
2. 本机诊断 59 条 `quota/claude-quota-read` 全部 `usageApi: skipped|failed`、`accessStatus: credential-unavailable`、`scopedCount: 0`——usage API 车道一次都没成功。
3. 根因在 [readClaudeAppAccessToken](../../../../preload/claude/quota.cjs#L147)：Claude App 现在的 `oauth:tokenCacheV2` 键形为 `acct:<accountUuid>|<profileUuid>:<orgUuid>:https://api.anthropic.com:<scopes>`，而代码把第 1 段（`<accountUuid>|<profileUuid>`）当组织 id。同一账号两个 profile 段不同 → 被判成「两个组织」→ 无 `activeOrganization` 提示 → fail-closed 返回空令牌。用本仓 `withAccessToken` 实测返回 `null`，改后返回令牌（只记长度，不记值）。
4. 手动刷新无反馈：`refreshQuotaFromChip` 只写了 `sr-only` 的 `liveMessage`（[FloatApp.vue#L3841](../../../../src/FloatApp.vue#L3841)），且 usage API 被挡时行里仍有 plan-history 两块，[buildClaudeQuotaSection](../../../../src/domain/companionPresentation.ts#L229) 的凭据原因只在「没有任何行」时才显示——用户看不到任何失败信息。
5. 用户原话里的「94/89（普通模型周额度，fable 周额度）」与 [RAW-186](../../260828/claude-ball-centre-dual-weekly/raw-requirement.md#L1) 已裁决的 `{scoped}/{plain}`（Fable 在前）顺序相反；本轮按 RAW-186 现行条款执行，不改顺序，见 D 提醒。

### 问题 3 · 重复判定

只读审计（Explore 子代理）列出 31 处；本轮收敛其中 6 处（见 spec「实现」），其余登记在 spec「未收敛的重复判定」供后续裁决。

## 输入规范化边界

线程记忆只存 id、Host 状态、attention 标志与时间戳；额度回执只存枚举、计数与等待毫秒。标题、cwd、令牌、会合点、百分比与 reset 时刻一律不进持久化、诊断或回执。

## 规范化需求

**RAW-203（companion-codex）· 额外进程状态记忆与跳转已读持久化**

1. discovery 为每个额外进程维护跨 roster 的记忆：`status` / `awaitingInput` / `awaitingApproval` / `firstSeenAt` / `statusChangedAt` / Host `hasUnreadTurn` / EyPc 跳转 `readAt` + `readStatusChangedAt`，存 uTools `dbStorage`（`eypc/codex/codexhost-thread-memory/v1`，上限 300 条按 `statusChangedAt` 淘汰）。
2. 重新落座时 `statusChangedAt` 只在 Host 状态或 attention 真变化时前进；会合点丢失、`codexhostResetDiscovery`、插件重载都不再把已完成行刷新成「刚刚」。
3. EyPc 跳转（点击 / Enter / 角标 / 快捷键 / 上一个下一个）把 `readStatusChangedAt` 绑定到当时的 `statusChangedAt`；只要 Host 状态未变，这条行在任何重载后仍读作已读（`desktop-live`），与 RAW-193「跳转即已读」一致。
4. 已读被两种证据取代：Host 状态/attention 变化（`statusChangedAt` 前进）；Host `hasUnreadTurn` 从 `false` 变回 `true`（两次扫描之间跑完的新 Turn）。归档（`codexhostForgetThread`）删除记忆。
5. `compareHostDesktopUnread` 接受 `openedRead`，与 Desktop 精确已读事件同权；`sanitizeCodexThreads` 与 `codexDesktopUnreadObservation` 的额外进程分支都查这条记忆。

**RAW-204（companion-claude）· Claude App 令牌组织仲裁、凭据状态可见与手动刷新回执**

1. `acct:<account>|<profile>:<org>:…` 键形：组织取第 2 段，账号取第 1 段 `|` 前；旧 `<client>:<org>:…` 键形不变。
2. 多个组织同时有效且缓存无显式 activeOrganization 时，用 Claude App `plan-usage-history.json` 最新样本的 `org` 做唯一平局裁决；提示命中不了任何候选仍 fail-closed。
3. 展开卡 Claude 额度组在「已授权且 usage API 被挡（凭据不可用 / Retry-After / 失败）」时，即使已有缓存行，也在行内显示「!」标记，原因放在 200ms 悬停提示与可访问名称（`note`）。
4. 手动刷新（读数块点击）等待 Claude 读取完成后发布有界回执 `companion.quotaRefreshReceipt`（`at`、Claude 车道 `changed / usageApi / accessStatus / blockedBy / retryInMs / windowCount / scopedCount`、Codex `requested`），浮窗在同一额度行上覆盖显示 8 秒并同步播报，额度区始终保持一行；回执不含读数。
5. usage API 成功后的下一次调用不早于 60 秒；「额度刷新（秒）」低于 60 只加快本地缓存车道，手动刷新仍绕过该下限。
6. 工程收敛：`withClaudeQuotaWindows` 取代两处手写 short/weekly 重算；诊断主读数改用 `claudePrimaryQuotaWindow`；`codexWeeklyReading` 取代三处「取周读数」；`claudeAppQuotaReadable` / `claudeQuotaReadingStale` 各一处定义；`normalizeOpenResult` / `normalizeOpenLaunch` 收进 `open-handoff.cjs`；官方未读原子写入连接器改为 `codexApplyNativeConnectorUnread` 一处。

## 需求变更评审

`scanned_owners`：[RAW-193](../../requirements/codex-raw-193.md#L1) 跳转即已读、[RAW-190](../../requirements/codex-raw-190.md#L1) Host 未读权威、[RAW-186](../../requirements/claude-raw-186.md#L1) 球心并列、[RAW-019](../../requirements/claude-raw-019.md#L1) 动态窗口与退避、[RAW-201](../../requirements/shared-raw-201.md#L1) 读数块点击刷新、[RAW-202](../../requirements/shared-raw-202.md#L1) 跳转前启动。

| 操作 | 条款 | 处置 |
| --- | --- | --- |
| added | RAW-203 线程记忆与跳转已读持久化 | refines RAW-193：已读不再只活在进程内存 |
| added | RAW-204 组织仲裁 / 凭据状态行 / 刷新回执 | refines RAW-019 与 RAW-201 |
| unchanged | 球心 `{scoped}/{plain}` 顺序（RAW-186） | 用户本轮举例顺序相反，未作为变更请求处理，待用户确认 |
| unchanged | 深链不构成已读（RAW-177#3）、Host 未读权威（RAW-190） | 原样 |

`conflict_candidates`：RAW-186 顺序（举例 vs 裁决）——用户 2026-09-03 裁决「保持当前顺序」，`{Fable}/{普通}` 不变，举例顺序不构成变更。`decision_status`：`explicit-current-request`。
