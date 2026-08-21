# Cursor Agent Companion 可行性调研结论与立项方案

Tool: cursor
Date: 2026-08-18
Status: `research-verified / phase-3-implemented`
Documentation level: `standard`

Raw source: [raw-requirement.md](raw-requirement.md#L1)

## 结论摘要

**取状态、取变更、跳转三件都已在本机打通。跳转由 `live-failed` 翻为 `live-verified`（Cursor 3.17.8）。**

- **取状态**：只读 SQLite `composerHeaders` 白名单 + `composerData.status` 的 `json_extract`。侧栏图标与同一套元数据对应，不是独立外部 API。
- **取变更**：官方用户级 `~/.cursor/hooks.json` + EyPc 自写观察脚本 + 私有队列主动读；冷轮询补未读 / 归档。
- **跳转**：官方 `/agent?id=<composerId>` deeplink 实测把 `cursor/glass.selectedAgent` 切到目标本地 composer（三正一负），已按 Claude 同形落地 `preload/cursor/open.cjs`，`dispatched` 不报已读。

相位投影到 Claude 已有枚举与 Float 分组，不另造第五套状态机。额度排查已删除。插件与 App 对话 **1:1**，`isArchived` 跟随 App；**不做 resume**。`conversation_id` 与 `composerId` 仍标 `join-key=unverified`。

## Requirement Change Review

- Scan scope / owners: 当前请求 → 本任务 raw/Spec → Companion 当前合同（Claude 相位、共享 Kernel）→ 产品 PRD 不改。
- Visible changes: **added** 侧栏图标状态、状态变更、跳进该对话、1:1 归档同步、本机跳转实测；**removed** 额度 / resume /「打开弱」作为可交付；**unchanged** Codex/Claude 当前产品条款。
- Conflict classification: `no-conflict`。不改 [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L1)、不入 RAW 登记、不改 `CompanionProviderId`。
- Decision status: `explicit-current-request`。
- Decision source: 2026-08-18 用户原话 + 同日变更（不做额度；只对照 Cloud Code 任务状态；三能力 + 1:1 归档 + 不做 resume + 跳转须实测通过）。
- User-facing review shown: 计划已确认后只写调研文档。
- Post-sync rescan: `pass`。Canonical 保持 Codex+Claude；本 Spec 不得 `integrated`。

## Prior Task Overlap

- Relationship: `reference-only`
- Document governance: [Claude 可行性](../../260805/1130-claude-companion-feasibility/spec.md#L1) 只供体例；[Claude 权威重置](../../260807/claude-code-companion-authority-reset/spec.md#L1) 是相位对照权威。
- Execution logic verification: 复用 Claude 的相位枚举、Turn reducer、hook 插入/队列/主动读合同；打开合同只对照 [open.cjs](../../../../preload/claude/open.cjs#L1) 的 `dispatched` 语义，**不得在 `live-failed` 期间实现**；`create-hook` 只借格式与排错。
- Traceability and decision: `new-task`

## 匹配度核验


| 需求条款 | 来源 | 调研覆盖 | 匹配 |
| --- | --- | --- | --- |
| 参照 Codex「任务」看 Cursor Agent 任务状态 | 原始 | Companion 任务面；库存走 `composerHeaders`，相位对照 Claude | 满足 |
| 参照 Cloud Code「任务 / 状态变更」 | 原始 + 变更 2 | Claude 六态 + Float 六分组 + hook 同构 | 满足 |
| 本机 Agent 模式能否加进 EyPc | 原始 | 可作第三 Provider；只纳 `unifiedMode=agent` | 满足 |
| 不做额度排查 | 变更 1 | spec 无额度对照 | 满足 |
| 侧栏图标对应的状态要能取到 | 三次修订 | header 白名单 + 磁盘 `status` 允许 extract；进行中靠 hook | 满足（冷库存滞后） |
| 获取状态变更 | 三次修订 | 用户级 hooks.json + header 轮询 | 满足（`join-key` 未实火） |
| 保证跳进该对话 | 三次修订 | 3.17.8 官方 `/agent?id` deeplink 实测切到目标本地 id（三正一负）；已落地 `open.cjs` | `live-verified` |
| 与 App 对话 1:1，归档跟随 | 三次修订 | 库存键 `cursor:<composerId>`；`isArchived` 不进库存 | 满足（规划） |
| 不做 resume | 三次修订 | 打开方案排除 `cursor-agent --resume` | 满足 |
| `create-hook` 能否借鉴 | 同日补充 | 格式/排错可借；project-hook 默认与直接写文件不可借 | 满足 |


**有意不覆盖：** 额度 / water-ball；Codex Plan/Goal；Chat/Plan/Cloud 库存；resume。

2026-08-20 只读复核（不改库存范围）：本机 `composerHeaders` 按一期启发式仍是 **0 条 Cloud 行**（`glass.cloudAgentProjectMembership` 不在 header 上；`agentLocation.type=cloud` 为 0）。Cursor Cloud 对话落在独立 ItemTable 缓存：`cloudAgentRepository.agents.*` 当日 **19** 条（`status` 为数字 `2|3`，未映射到 Claude 六态）、`glass.cloudAgentProjectMembership.v1` **27** 个 `bc-*` 键，**0** 个键出现在 `composerHeaders`。官方 Cloud Agents API 的执行态在 run（`CREATING|RUNNING|FINISHED|ERROR|CANCELLED|EXPIRED`），需 API key；conversation 接口会返回消息正文，禁止用作 Companion。用户级 `~/.cursor/hooks.json` 官方写明 **不进 Cloud Agent VM**；`sessionStart` / `sessionEnd` 对 Cloud Agent 不可用。未授权前不得把该缓存并进一期库存。

**能力缺口（不得当已交付）：**

- `waiting-approval`：无 `PermissionRequest`，不得发明审批。
- `join-key=unverified`。
- 跳转是 `dispatched` 合同：派发成功≠目标已展示≠已读；App 未运行时 `open` 会拉起 Cursor。
- 进行中图标是内存态；磁盘 `composerData.status` 可与正在跑的对话不一致。

## Cloud Code 对照基线（任务状态，不含额度）

事件通道不是 EyPc 发明的。EyPc 自写的是脚本、加法注册和私有队列：

1. 生成 [scripts.cjs](../../../../preload/claude/scripts.cjs#L60) `eypc-claude-companion-hook.sh`，放到 EyPc 数据目录。
2. 用户确认后加法写入 `~/.claude/settings.json`（[settings.cjs](../../../../preload/claude/settings.cjs#L21-L35)），标记 `eypc-claude-companion`，可干净卸载。
3. 脚本只抽 `session_id` / `hook_event_name` / 两个 reason，写入私有 JSONL。
4. [events.cjs](../../../../preload/claude/events.cjs#L132) `reduceQueueEntry` 主动读队列并还原 phase。
5. 失败开放：脚本恒 `exit 0`。

相位枚举 [claudeCode.ts](../../../../src/domain/claudeCode.ts#L9-L15)：`running` / `waiting-approval` / `waiting-input` / `completed` / `stopped` / `unknown`。展示分组 [FloatApp.vue](../../../../src/FloatApp.vue#L450-L456)：`待输入` / `正在进行中` / `状态未知` / `待继续` / `已完成未读` / `已完成`。投影 [resolveClaudeCodeState](../../../../src/domain/claudeCode.ts#L259-L290)。

## 取状态（本机证据）

App 侧栏图标由同一套 composer 元数据驱动（内部有 `composer.updateStatus`、DOM `data-composer-status`）。权威表是 globalStorage `state.vscdb` 的 `composerHeaders`（`composerId` + `value` JSON），不是 `cursorDiskKV` 的 `composerHeaders:*`。

白名单（禁止 `composerData` 正文 / `conversationMap` / transcript / `cli-config.json` 的 `authInfo`）：

- 身份：`composerId`、`unifiedMode=agent`、`!isSubagent`、`!isBestOfNSubcomposer`、`workspaceIdentifier`
- 1:1 归档：`isArchived`（双向：读取跟随 App；2026-08-21 起插件“归”对单行翻转同一 `isArchived` 对，写前重验无进行中证据，见 `preload/cursor/archive.cjs`）
- 图标：`hasUnreadMessages`、`isDraft`、`hasPendingPlan`、`hasBlockingPendingActions`、`unfinishedRunAt`、`subtitle`
- 磁盘相位：仅 `json_extract(composerData.status)` → `completed | none | aborted`
- Multitask fork 归并（2026-08-21 增补）：`subagentInfo.parentComposerId` / `subagentInfo.rootParentConversationId`（fork 行不成卡，只作父卡证据；嵌套 fork 由 root 指针直挂根会话）

本机 Cursor 3.16.17（2026-08-18）：

- `composerHeaders` 551 行。默认库存：`unifiedMode=agent` + `!isSubagent` + `!isArchived`（128）。`agentLocation.type=local` 仅 33；空 `agentLocation` 不得当非本机。云端用 `glass.cloudAgentProjectMembership` 排除。
- 同日后续快照：`hasUnreadMessages=true` **3 条**（早先 0 次计数作废，不得再标 `unsupported`）。`isDraft` 5；`hasPendingPlan` / `hasBlockingPendingActions` / `unfinishedRunAt` 均为 0。header 无 `status` 字段。
- 当时正在跑的对话磁盘 `composerData.status=aborted`、`generatingBubbleIds=0`。**进行中不能只信磁盘。**

## 取变更（官方通道）

官方文档：<https://cursor.com/docs/hooks>。用户级 `~/.cursor/hooks.json`（`version: 1`）。不要用项目级 `.cursor/hooks.json`（会进本仓并被 Cloud 捡走）。

本仓 `.cursor/hooks.json` 仍不写。用户级文件存在时，Cursor 3.17+ 对整份配置做 schema 校验：任一 handler 的 `loop_limit` 为 `0` 会拒收**整份** user hooks（含 EyPc 那 11 条），热路径因此零事件。注册/卸载写入时把非法 `loop_limit` 收成 `1`。

- Agent 事件：`sessionStart` / `sessionEnd` / `beforeSubmitPrompt` / `preToolUse` / `postToolUse` / `postToolUseFailure` / `subagentStart` / `subagentStop` / `stop`（`status`: completed | aborted | error）/ `afterAgentResponse` / `afterAgentThought`。
- **没有** Claude 的 `Notification`、`PermissionRequest`（<https://cursor.com/docs/reference/third-party-hooks.md> 映射为 `No`）。
- stdin 可抽：`conversation_id`、`generation_id`、`hook_event_name`、`session_id`（文档写明等同 `conversation_id`）、`composer_mode`（`agent` | `ask` | `edit`）、`stop.status`、`sessionEnd.reason`。
- stdin 禁止入队：`transcript_path`、`user_email`、`tool_input`、`agent_message`、prompt。
- 用户级 hooks 不进 Cloud Agent VM。

热路径：`beforeSubmitPrompt` 开 Turn；开 Turn 后的 tool 事件保持 `running`；`stop.completed|aborted|error` 收束；`sessionEnd` 只关已经开过的 Turn。冷补丁轮询 header 白名单；磁盘 `status` 不得覆盖开着的 Turn。写 `hooks.json` 必须当下确认。`join-key=unverified`。

## 跳转（`live-verified`，2026-08-21 Cursor 3.17.8）

**结论翻转**：官方 `/agent?id=<composerId>` deeplink 现在能把选中切到目标**本地** composer。旧 `live-failed` 是 3.16.17 上的结论，且当时只观察 `selectedComposerIds`。3.17.8 上 `/agent` 处理器改为经 `glass.handleDeeplink` 转发进 Agents 窗口，`handleAgentOpen` 读 `id` 调 `glass.openCloudAgentById`；对本地 id 也会解析 header 并 `selectAgentRequested`，持久化键 `cursor/glass.selectedAgent` 随之翻到目标 uuid。

本机实测（globalStorage `state.vscdb` 的 `ItemTable['cursor/glass.selectedAgent']`，只读观察）：

- 三次正向：`4cab4479…` → `9b09ae06…` → 还原 `3a269569…`，每次都精确切到目标（≤8s 落盘）。
- 一次负对照：伪 uuid `00000000-0000-4000-8000-000000000000` 不改变既有选中（`handleAgentOpen` 报 can't find，不写选中）。
- 命令：`open "cursor://anysphere.cursor-deeplink/agent?id=<composerId>"`。App 未运行时 `open` 会拉起 Cursor 再处理。

App **内部**打开命令仍在：`composer.openComposer({ type: "local", id })`、`glass.openAgentById`（本地，命中 header 即 `selectAgentRequested`）、`glass.openCloudAgentById`。deeplink 层无 `/command` 任意命令执行（`/command` 只 `deeplink.command.create` 存自定义命令）。

打开合同同 Claude：`dispatched`，不是 `opened`，从不报 `confirmsRead`（OS handler 立即返回，切没切成功、是否已读都无法从外部证明）。落地见 [open.cjs](../../../../preload/cursor/open.cjs#L1)。

仍禁止：直接写 `selectedComposerIds` / `cursor/glass.selectedAgent`、AX、`cursor-agent --resume`。跳转只经官方 deeplink。

## `create-hook` Skill 借鉴结论

本机 Cursor 宿主 Skill `create-hook`（`~/.cursor/skills-cursor/create-hook/SKILL.md`，仅这一份）已通读。它是官方 hook 写作备忘，不是 EyPc Companion 的安装或相位权威。

### 可借鉴（实现时采用）

- 用户级相对路径以 `~/.cursor/` 为 cwd。Cursor 监视 `hooks.json` 并热加载。
- 编辑已有 `hooks.json` 时保留无关条目——与 Claude [settings.cjs](../../../../preload/claude/settings.cjs#L74) 加法合并同形。
- 命令 hook + 失败开放：观察脚本必须 `exit 0`，且 **不设** `failClosed: true`。
- 确定性观察只用 `type: command`。禁止 `type: prompt`。
- Matcher 是 JavaScript 正则。`beforeSubmitPrompt` 的 matcher 值是 `UserPromptSubmit`。首版无 matcher，确认点火后再收紧。
- 脚本必须自带 shebang、可执行；**不得假定** hook 环境有 `jq` / `python3` / `node`。沿用 [scripts.cjs](../../../../preload/claude/scripts.cjs#L60) 的 POSIX `sed` 纪律。
- 调试看 Cursor Hooks 设置页，不把 hook 日志正文写入 EyPc 诊断。

### 不可借鉴（实现时拒绝）

- Skill 默认 project hooks。热路径仍是用户级 `~/.cursor/hooks.json`。
- Skill 默认把脚本放 `~/.cursor/hooks/`。EyPc 必须把脚本放 **插件数据目录** + 带引号的绝对路径。
- Skill 触发语是「直接写文件」。必须当下确认；本调研轮仍不写。
- 禁止 `permission` / `deny` / `ask` / `followup_message` / `loop_limit` / `updated_input` / `additional_context`。
- 禁止把 `create-hook` 当第三 Provider 执行器或相位 reducer。相位对照仍是 [claudeCode.ts](../../../../src/domain/claudeCode.ts#L9-L15) 与 [events.cjs](../../../../preload/claude/events.cjs#L132)。

## 插入与主动读取

可行，抄 Claude 合同，**不复用** `~/.claude/settings.json`：

- 目标：`~/.cursor/hooks.json`，加法合并，标记 `eypc-cursor-companion`，可逆卸载。
- 脚本放 EyPc 数据目录；命令用带引号的绝对路径。
- 写用户配置必须当下确认。
- 失败开放：`exit 0`，不设 `failClosed`。
- 队列：EyPc 私有 `eypc-cursor-events.jsonl`。Preload 监视并同步消费第一份增量。
- 冷库存：只读 `composerHeaders` 列 + `value` 白名单；`composerData.status` 仅 `json_extract`。
- `join-key=unverified`。

## Cloud Code 相位 → Cursor 映射

实现时不得另造第五套状态机。证据不足必须 `unknown` / abstain，遵守 `EYPC-COMPANION-STATE-SOURCE-001`，不用墙钟 TTL。


| Cloud Code 相位 / 展示 | Claude 证据 | Cursor 热路径 | Cursor 冷库存 | 判定 |
| --- | --- | --- | --- | --- |
| `running` / 正在进行中 | `UserPromptSubmit` 开 Turn；开 Turn 后的 tool 事件 | `beforeSubmitPrompt` 开 Turn；开 Turn 后的 `preToolUse` / `postToolUse` | `unfinishedRunAt` 仅作冷提示；磁盘 `status` 不得单独发明终态，也不得覆盖开着的 Turn | 对齐 |
| `waiting-input` / 待输入 | `PreToolUse` + `AskUserQuestion`；`Notification` idle | `preToolUse` 且工具为提问类（stdin 能稳定识别时） | `hasPendingPlan` 升为 waiting-input；**不**引入 Codex `planReady` | 部分；不能稳定识别则 abstain |
| `waiting-approval` / 待输入（审批） | `PermissionRequest` | 无对应 hook | `hasBlockingPendingActions` 不得标审批，只能 `waiting-input` 或 `unknown` | 不从 hook 发明 |
| `completed` / 已完成 | 成功 `Stop` | `stop.status=completed` | `status=completed` 仅在无更新热证据时保留 | 对齐 |
| `stopped` / 待继续 | `StopFailure`；已见 open Turn 的 `SessionEnd` | `stop.status=aborted\|error`；已见 open Turn 的 `sessionEnd` | 无 TTL 终态 | 对齐 Claude SessionEnd / RAW-174 |
| `unknown` / 状态未知 | 证据不足 | 入队字段不足或未开 Turn | 白名单字段不足以投影 | abstain |
| 已完成未读 | App LevelDB unread | 无 | `hasUnreadMessages` 本机已见 true | 可投影到 Float「已完成未读」 |
| 过滤 | Code-only 会话 | `sessionStart.composer_mode=agent` 才入队；ask/edit 丢弃 | `unifiedMode=agent` + `!isSubagent` + `!isArchived` | 本机 Agent only；归档跟随 App |


## 分阶段实现方案

独立 `cursor` Provider，opt-in 默认关，key `cursor:<composerId>`，与 App 行 1:1。不新开 Tab，不做额度，不做 resume。Easy Agent ≠ Cursor。

### 一期：取状态（实现授权后）

无 hook 也可先列出本机 Agent 卡。

- 扩展 [companionProvider.ts](../../../../src/domain/companionProvider.ts#L9) `CompanionProviderId` 为 `'codex' | 'claude' | 'cursor'`。
- 新建 `preload/cursor/inventory.cjs`：只读 `composerHeaders` 白名单 + `composerData.status` 的 `json_extract`。
- 新建 `src/domain/cursorAgent.ts`：投影到 Claude 六态与 Float 六分组。
- 汇总：[companionAggregate.ts](../../../../src/domain/companionAggregate.ts#L253) / Controller 按 Claude 开关同形接入。
- UI：[CodexPage.vue](../../../../src/pages/CodexPage.vue#L900) `runtime` 增加「接入 Cursor Agent」；帮助同步 `src/help/guides/codex.md`。

### 二期：取变更（另一次当下确认写 hook）

- 抄 Claude：[settings.cjs](../../../../preload/claude/settings.cjs#L74) / [scripts.cjs](../../../../preload/claude/scripts.cjs#L60) / [events.cjs](../../../../preload/claude/events.cjs#L132) → `preload/cursor/*`。
- 用户级 `~/.cursor/hooks.json`，标记 `eypc-cursor-companion`，脚本在 EyPc 数据目录，引号绝对路径，`exit 0`。
- 冷库存文件快路补 `hasUnreadMessages` / `isArchived`（`fs.watch` + 1s 补漏）；无 watch 时才退回 5s 顺带读。
- 实火 canary 通过后才升 `join-key`。

### 三期：跳转（`live-verified`，2026-08-21 已实现）

`glass.selectedAgent` 实测变成目标本地 uuid，遂按 [Claude open.cjs](../../../../preload/claude/open.cjs#L3-L16) 同形落地 [preload/cursor/open.cjs](../../../../preload/cursor/open.cjs#L1)：只认裸 composer uuid，派发 `cursor://anysphere.cursor-deeplink/agent?id=<composerId>`，单飞 latest-wins，`dispatched` 不报已读。Controller [openCursorTask](../../../../src/runtime/codexController.ts#L2841) 取代原「尚未验证」直返；桥 `openTask` 接 [index.cjs](../../../../preload/cursor/index.cjs#L218)，preload 传入 `execFile`。聚焦测试 [cursorOpen.test.ts](../../../../tests/platform/cursorOpen.test.ts#L1)。

## 明确不做

- 额度 / 额度状态变更 / water-ball / Claude quota 开关
- Codex Plan / Goal / Execute Plan 对照
- Agent 直接写入真实 `~/.cursor/hooks.json`（注册仍走设置页当下确认）
- 把跳转 `dispatched` 写成「已展示 / 已读」保证
- Cloud Agent、Chat、Plan、subagent 库存
- 读取或摘录对话正文
- resume / 写 `selectedComposerIds` 或 `cursor/glass.selectedAgent` / AX
- 把 Claude settings hooks 当 Cursor 热路径
- 本轮改 PRD、ARCHITECTURE 当前条款、需求登记

## Canonical Merge

- Base project version: `2026-08-13.2`（[PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L1)）
- Result project version: 不变
- Merge status: 调研不进入 canonical。实现授权前不 `integrated`。

## Verification

### Verification Decision

- Route: `frontend`（D-1 一期）
- Reason: 新增 Cursor 冷库存 Provider、Controller 折叠与设置开关；不改 Kernel V4 合同。
- Provisional trace completed before verification commands: `yes`
- Verification-command provenance: `impact-trace`
- Full-suite escalation: `none`
- Owner: 本 Spec
- Residual risk: `join-key` 单样本；跳转为 `dispatched` 合同且依赖 3.17.8 deeplink 行为（版本回退可能再失效）；冷库存进行中滞后；提问类 `preToolUse` 识别未在本机证明。

### Verification Impact Trace

| Changed surface / claim | Direct consumers | Material transitive or failure boundary | Selected evidence | Skipped suites / reason | Outcome / residual |
| --- | --- | --- | --- | --- | --- |
| `cursorAgent` / provider id | Controller 卡片、Float 分组、设置开关 | 水球仍只映射 Codex/Claude | `tests/domain/cursorAgent.test.ts`、`companionProvider`、`companionPresentation` | 仓库级 `pnpm test` / build：无 escalation | 见收尾 |
| `preload/cursor` 只读 inventory | `window.eypcPlatform.cursor` | 禁止读正文 / 写 DB | `tests/platform/cursorInventory.test.ts`；public 镜像已同步 | `validate:utools` 需 dist 重建，本轮不跑 | dist 待下次 prepare |
| Controller 折叠 / open unavailable | Float 动态分组、卡片点击 | Kernel 仍只拥有 Codex/Claude | 一期聚焦 Domain+inventory；open 合同由 preload 测 | 真实 uTools / 本机 Cursor DB 目视 | 宿主验收待用户 |
| `preload/cursor/open.cjs` deeplink 跳转 + Controller `openCursorTask` | Float 卡片点击 → `openThread` cursor 分支 → 桥 `openTask` | Kernel 不裁决 cursor open；伪 id 拒发不落 `open` | `tests/platform/cursorOpen.test.ts`（8 例：URL/平台派发/拒发/latest-wins）、`tests/runtime/codexController.test.ts` 59 例回归、`tsc --noEmit`（仅 1 条既有无关报错） | 仓库级 suite：无 escalation | 本机 deeplink 三正一负实测通过；uTools 重载后目视归用户 |
| 状态门禁归档：`preload/cursor/archive.cjs` + Claude 白名单拆除 + Controller `archiveCursorTask` | Float「归」→ `archive()` 状态门禁 → cursor 走桥 / codex+claude 走 Kernel dispatch | Cursor 唯一写例外单行化并在 UPDATE 内重复守卫；Claude 归档失去版本白名单后靠结构化重验兜底 | `tests/platform/cursorArchive.test.ts`（6 例：写对/拒活/幂等/注入拒绝/CLI 通道/桥 v5）、`claudeBridge` 74 例（新增非白名单版本归档正例）、`cursorAgent`/`claudeCode` 域测、`codexController` 61 例、`claudeCompanionController` 全绿、`vue-tsc`、`pnpm build` + `validate:mirrors` | 仓库级 `pnpm test` 已跑：仅 `action.test.ts` MQTT 用例超时，stash 基线复现证实与本轮无关 | 本机实归目视归用户 |
| `companion-navigation-v4`：Cursor 进 cycle 候选与 `openCursor` 派发 | 全局快捷键 → navigation `cycle` → kernel `mergedCycleKeys` → `openCursor` deeplink | Kernel canonical 集不吸收 Cursor（走辅助候选通道）；navigation「全来源 settle 才 ready」合同不被部分集破坏 | `companionNavigationBridge`、`companionTaskKernel`（辅助候选归一/合并/清理）、`codexController`（快捷键端到端触达 Cursor 卡）、`sync:preloads` 镜像 | 仓库级 suite：无 escalation | 实机快捷键循环目视归用户 |
| `quotaCursor` 主题 token + `float.css` cursor 样式 + 混合项目 `with-*` 渐变 | Float 任务行/项目行底色、归属标记、共享项目行 | forced-colors 回退不变（`:where()` 压平特异性）；Codex/Claude 8%/12% tint 合同不变 | `codexAppearance.test.ts` 11 例（12 主题三向色距 + 可读性）、`codexCompanion.test.ts` 58 例（新增 Cursor token/实心标记/混合渐变 CSS 合同） | — | 实机配色目视归用户 |

只读 DB 与外部 `open` / `--open-url` 已在调研轮执行，记入 raw/spec，不重复当应用测试。2026-08-21 跳转实测（`glass.selectedAgent` 观察法）记入 [raw-requirement.md](raw-requirement.md#L1)。

## Documentation Impact

- Classification: `project-current`
- Central Rule Task admission: `project-local / no central row`
- `doc_drift`: 无。PRD / ARCHITECTURE Companion 当前条款保持 Codex+Claude。
- Affected authoritative documents: 本 raw/spec；[PROJECT_STATUS.md](../../PROJECT_STATUS.md#L1) 一条检索指针。
- Root acceptance gate: 一期冷库存代码与聚焦测试就位；hook 与跳转另授权；真实 uTools 目视待用户。

## Execution Journal

| Event | Trigger / Evidence | State Change | Root Decision |
| --- | --- | --- | --- |
| 额度剔除 | 用户 2026-08-18 变更 1 | 调研范围去掉额度对照 | 遵守，不写缺口 |
| 对照改为 Cloud Code 相位 | 用户 2026-08-18 变更 2 | 映射表以 Claude 相位为权威 | 遵守 |
| Hook 通道更正 | 官方 hooks.json + 本机文件缺失 | 作废「无官方 Hook」 | 热路径改用户级 hooks.json |
| create-hook Skill 核查 | 用户要求借鉴宿主 Skill | 格式/排错可借；落点与阻断策略不借 | 补进本 Spec |
| 未读计数更正 | 同日后续 header 快照 3 条 true | 废除 `hasUnreadMessages` `unsupported` | 可投影「已完成未读」 |
| 三能力修订 | 用户要求取状态 / 变更 / 跳转；1:1 归档；不做 resume | 打开从弱目标升为 P0，但实测失败 | 跳转标 `live-failed` |
| 跳转实测 | 五条外部打开路径 | `selectedComposerIds` 未切到目标 id | 不写打开代码、不假装保证 |
| D-1 一期实现 | 用户 2026-08-18 选 D-1 | 冷库存 Provider 落地：opt-in 默认关、卡片折进 Float、open=`unavailable` | 不写 hook、不实现跳转；Kernel 仍只拥有 Codex/Claude |
| Cloud 对话复核 | 用户 2026-08-19/20 问状态读取与 Cloud 同类行为是否已满足 | 本机 Agent 冷读已落地；Cloud Code 热路径未接线；Cursor Cloud 是另一套 `bc-*` 缓存，0 条进 header | 维持一期排除 Cloud 库存；不调 Cloud API、不读对话正文 |
| D-1 二期 hook | 用户 2026-08-20 选 D-1 | 用户级 hooks 通道落地：脚本/加法注册/私有队列/Controller 叠加/设置页确认按钮 | Agent 不写真实 `~/.cursor/hooks.json`；跳转仍 `live-failed`；`join-key=unverified` |
| 宿主库存不可读 | 用户 2026-08-21 安装并注册后界面「状态库不可读」 | uTools 7.8.0 Electron 22 / Node **16.17.1**，无 `node:sqlite`；inventory `require` 抛错被吞成 `degraded`。本机 CLI Node 24 可读 129 条。钩子 11 条已注册、队列 0 字节 | 钩子通道本身成功；卡片不出现是库存读取器绑错了宿主 Node |
| D-1 库存改 sqlite3 | 用户 2026-08-21 选 D-1 | 库存优先 `/usr/bin/sqlite3 -readonly -json`，保留注入 `DatabaseSync` 与 builtin 兜底；设置页区分 not-installed / sqlite-unavailable / degraded | 不读正文；uTools 需重载插件后才生效 |
| 宿主续核验 | 用户 2026-08-21「continue the log」 | 插件同形 `sqlite3` 只读：`ready` / **129** 条 / 42ms / `inventory-v2`（未读 0、未完成 run 1）。钩子仍 11 条、`failClosed=0`。队列仍 **0 字节**（09:04 后无热事件）。`eypc-diagnostics` 两份 runtime jsonl 无 cursor 字段。public/dist 均为 v2 | 库存通道在本机已通；清单是否出现仍待 uTools 重载目视。热路径尚未点火 |
| 热路径未点火 | 用户 2026-08-21 在本机 Cursor Agent 提问后卡片仍非进行中 | Cursor hooks 日志：`Invalid user config: stop[0]: Hook script loop_limit must be a positive integer` → **整份** `~/.cursor/hooks.json` 拒收。本会话 stdin 已证实 `composer_mode=agent` 且含 `conversation_id`/`hook_event_name`；EyPc 脚本未执行。队列仍 0 字节 | 注册写入时把非法 `loop_limit` 收成 `1`；Agent 仍不直接改用户 hooks 文件 |
| 热路径宿主续核 | 用户 2026-08-21 重打包后要求再读日志 | `stop[0].loop_limit=1`。09:38 UTC+8 重载：`Loaded 13 user hook(s)`，其后执行源为 `user config`，脚本 `exit 0`。队列 09:39 起从 0 增至数十行：`beforeSubmitPrompt`(m=agent) 开 Turn，随后 thought/tool 事件。本会话 `composerId` 在 `composerHeaders`（`unifiedMode=agent`），与队列 `conversation_id` 同形 | 热通道已点火；`join-key` 本会话 canary 命中，产品标签仍单样本；卡片是否进「正在进行中」待用户目视插件 |
| 悬浮窗无 Cursor 卡 | 用户 2026-08-21 11:09 截图「没有效果」+ 再读日志 | 队列已 85 行（本会话 3 次 prompt、2 次 stop，11:09 仍在追加）；hooks 仍 `from user config`。Kernel 诊断 `providers` 只有 codex/claude、`taskCount=25`，与截图 9 动态且无「归属 Cursor」一致。Controller 在 Kernel 投影后 fold Cursor，但 Float 又对完整 package 跑 `applyCompanionTaskPackageViews`，只保留 Kernel 任务键，把 Cursor 卡剥掉 | 热通道有效；悬浮窗无效果是二次投影丢卡，不是钩子没点火 |
| D-1 二次投影保 Cursor | 用户 2026-08-21 选 D | `applyCompanionTaskPackageViews` 在完整 Kernel 投影后把源里的 Cursor 卡按 Controller 同形折回；fold 抽到领域层。Float 无需改 Vue | 宿主需重载插件后目视「归属 Cursor」 |
| D-1 过滤空壳 | 用户 2026-08-21 选 D-1 | 库存丢掉 `diskStatus=none` 且 `fullConversationHeadersOnly` 长度为 0 的行；本机 130→92。点卡片仍不跳转 | 只计会话头数量，不读正文；跳转仍 `live-failed`，不写 `open.cjs` |
| 跳转再核验 | 用户 2026-08-21 对照 Cloud Code / Codex 点击 | Float 点击已接线，Controller 对 `cursor:` 直接返回并提示；桥 `openTask` 恒 `unavailable`。Cursor.app 仍只注册 `cursor://`，无 `cursor.agent` | App 内部能开指定对话，插件/OS 外链切不到本地 `composerId`；不是漏接点击，是外跳未打通 |
| 跳转打通并落地 | 用户 2026-08-21 授权本机高级实验（含破坏性）；拆 `cursor-deeplink` 扩展与 `workbench.glass.main.js`，发现 `/agent` 经 `glass.handleDeeplink` 进 Agents 窗口 | 3.17.8 实测 `open "cursor://anysphere.cursor-deeplink/agent?id=<composerId>"` 三次正向精确切 `cursor/glass.selectedAgent`，伪 id 无操作；已还原用户原选中。落地 `preload/cursor/open.cjs`（同形 Claude `dispatched`）、`index.cjs` 接 `openTask`、preload 传 `execFile`、Controller `openCursorTask` 取代直返、assets 清单 + public 镜像同步、`cursorOpen.test.ts` 8 例 | 跳转 `live-failed`→`live-verified`；仍只走官方 deeplink，不写 DB、不 AX、不 resume；`dispatched` 不报已读 |
| Multitask 主卡随 fork 保活 | 用户 2026-08-21 反馈 multitask 主任务状态错；要求同形 Codex side chat | 本机证据：fork 行 `isSubagent=1` 带 `subagentInfo.parentComposerId` / `rootParentConversationId`（嵌套 fork 直指根）；85 条历史 fork 仅正在跑的 2 条带 `unfinishedRunAt`（结束即清）。库存 v4 把 fork 按根聚成父卡 `subagents` 证据（不成卡、不读正文）；域层任一 fork live → 父卡 `running`（父 `waiting-input` 仍优先）；Controller 按 fork 逐条用 hook 热证据压冷标记。实机端到端：本会话父行 `diskStatus=completed` + 两 fork 在跑 → 相位 `running` | 同形 Codex side chat 聚合合同：live 分支保聚合 live；证据不足仍 abstain |
| 已读与进行中延迟 | 用户 2026-08-21：已完成未读→已读不进插件；进行中约 500ms | 已读只靠 refresh 5s 顺带读库存；hook 脚本 `cat` 整份 stdin 再解析。补 `watchInventory`（库/WAL 快路 + 1s 补漏），hook 只读前 32KB，队列加文件 watch | 不把 1s StatWatcher 改成快路；不读正文 |
| 归档统一为状态门禁 | 用户 2026-08-21：Claude 提示「Provider 无法核验」（本机 Claude 已自动升到 1.34493.1，超出 `1.26832.0/1.28929.0/1.30096.5` 白名单）、Cursor 从未能归档；要求“只筛状态、不筛来源” | 门禁改为：进行中阻断、待继续/已完成放行、unknown 暂缓，对所有 Provider 一致。Claude 拆除版本白名单（capability 两处 + `archive.cjs` 两处），保留结构化重验（目标唯一/可解析/仍终态 + 写后回读 + 活动库存复核）。Cursor 新增 `preload/cursor/archive.cjs`：单行翻转 App 自己的 `isArchived` 对（写前重验 `unfinishedRunAt`/`hasPendingPlan`/live fork，UPDATE 内重复守卫，写后回读），桥 v5 暴露 `archiveTask`，Controller cursor 分支绕 Kernel（同形 `openCursorTask`） | 归档资格永远不按 provider/版本硬阻断；执行层保留真实校验并三态上报（archived/failed/indeterminate）；App 若从内存回写，watcher 让卡片如实回浮 |
| 快捷键循环接入 Cursor | 用户 2026-08-21：点击可开但上/下任务快捷键异常；要求查完整链路+日志、对照首接 Cloud 时的修复（RAW-152） | 根因：navigation `PROVIDERS=['codex','claude']`，Cursor 卡从不进 kernel `cycleKeys`，候选集退化（日志 `cycleCount=1`、07:11 `cycle_*` 落在未运行的 Claude 桌面端报 `unavailable`）；点击走绕 Kernel 直连分支掩盖了缺口。修复：`companion-navigation-v4`，`navigation.cjs`/`task-actions.cjs` 的 `PROVIDERS` + `openCursor` 派发注册 cursor，kernel 增 `publishAuxiliaryCycleTasks` 辅助候选并 `mergedCycleKeys` 合并，Controller 在 `publishTaskStatePackage` 发布 Cursor 候选，preload 挂 cursor 适配器 | 新来源接入清单必须含导航注册、与打开通路同轮交付；固化进错误记忆 |
| Cursor 另类配色 | 用户 2026-08-21：Codex Cloud / Code / Cursor 颜色需进一步区分，Cursor 另类优化 | 卡片来源实为三类（codex/claude/cursor）。主题层新增 `quotaCursor`（`providerQuotaTone` 紫蓝相；12 内置主题上与 codex/claude 两 tone 色距 >60° 且对卡面可读），CSS `--codex-quota-cursor` 接管 cursor 行底色 8%/12% 与标记；`task-provider-marker.provider-cursor` 改实心药丸、Codex/Claude 维持描边；清除失效的 provider-claude marker 规则。补遗：`provider-shared` 项目行渐变原写死 Codex→Claude，含 Cursor 的混合项目看不到 Cursor 色；Float 给共享项目行加 `with-{provider}` 修饰类，`:where()` 保持基准特异性下按实际组合取渐变（forced-colors 回退不受影响） | 归属色 token 收敛在 `codexAppearance` 单点派生；「另类」以填充 vs 描边的结构差表达，不只靠色相；混合行渐变只画真实在场的来源 |

## Closeout

- Requirement Manifest / project version: 未改
- Canonical merge: 不进入
- Verification: 文档链接核验（本轮）
- Documentation and memory/error routing: 状态枢纽指针；error-memory 新增 [provider-version-whitelist-must-not-gate-generic-capability](../../../knowledge/error-memory/provider-version-whitelist-must-not-gate-generic-capability.md#L1)、[new-companion-source-must-register-with-navigation-authority](../../../knowledge/error-memory/new-companion-source-must-register-with-navigation-authority.md#L1)
- Open gate / owner: uTools 重载插件后点卡片目视 Cursor 聚焦到该对话归用户；实归一条 Cursor/Claude 任务目视归用户；快捷键循环触达 Cursor 卡目视归用户；Cursor 配色目视归用户；hook 实火 canary 续测归用户；`join-key` 单样本；跳转 `live-verified`（`dispatched` 合同）
