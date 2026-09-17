# RAW-219：接入 Orca 为第四个 Companion Provider

Tool: grok · Date: 2026-09-13 · Level: Standard（需求）

spec_id: SPEC-260913-ORCA-COMPANION

## 用户原话

> 按 F1 接 Orca provider

前置澄清（同会话）：

> F1 也就是说 EY PC 可以直接通过 Oracle 获取它相应的状态 以及它可以快速地跳转 是不是？ 而且状态的跟踪也是可以达到的

口误：Oracle 即 Orca。F1 不是「现在已经接上」，而是授权做成第四个来源。

## RAW-219

captured_at: 2026-09-13
state: active
text: >

  EyPc 增加独立的 Orca Provider：经本机 Orca CLI 读取 Agents 任务状态、一点跳到对应终端，并持续跟踪进行中/已完成。默认关闭。不读对话正文。

## 规范化需求

1. Orca 是第四个 first-class Companion Provider，默认关闭；开启后与 Codex / Claude / Cursor 共享同一任务清单、角标与循环，互不影响。
2. 库存只读 `orca worktree ps` 与 `orca terminal list` 的白名单字段。Prompt、lastAssistantMessage、toolInput、终端 preview、绝对路径不得进入证据、诊断或持久化。
3. 一张卡对应一个 Agent 终端（`tabId:leafId`）。没有 `agentIdentity` 的普通终端不进清单。只开启了 Agent 工具栏、还没有任何对话的窗格也不进清单；工作帧或 worktree.ps 里已有提问/回复/工具的会话仍进。在 Orca 窗口里关掉的窗格不进清单：`worktree ps` 残留 agent 行不算还开着；成功的 `terminal list` 没有该 `paneKey` 就必须拿掉。
4. 相位只映射 Orca 已公开的状态：`working` / `waiting` / `blocked` → 进行中；窗格 OSC 工作帧（含 Grok `Waiting for response` 规范化成 `⠋ Grok`、Claude `. ` / spinner）同样是进行中，不必等 toolName 或助手正文。Agents 仍为 `working` / `waiting` / `blocked` 时，`workingMode=monitoring` 或 `turnCompletedAt` 不得收成已完成（工具间隙也会 monitoring，插件会在已完成已读与进行中之间振荡）。主轮次结束以 Agents 离开上述活状态为准：`done` 且无工作帧 → 已完成；`unread=true` 仅在已非活状态时作为已完成未读；`interrupted` 或断开 → 待继续。不发明待输入/Plan。Orca 三处状态不是同一份：标签卡才有已完成未读（`unreadAgentCompletionPanes`）和标签钉；左侧树只有进行中/已完成/中断圆点；Agent Session History（`aiVault.listSessions`）只有标题/更新时间/条数，没有 unread/pin/phase，禁止当未读或钉来源，也禁止读 preview。工作树 `unread` 只是工作区汇总，不得扇出到组内每条对话。CLI agent 行若带布尔 `unread`，卡片未读以该字段为准，汇总为假不得把它打成已读。没有按窗格未读时，只有该工作树恰好一条已完成会话才可吃工作区汇总；多条已完成不得猜测最右/最新，宁可少标。
5. 打开走统一 Command：就绪层先保证 Orca 在跑（`orca status` / `orca open`），再 `terminal switch`。结果最多 `dispatched`，不确认已读。
6. 归档关闭该终端窗格（`terminal close --terminal`，不用 `--all`）。`working` 拒绝归档。
7. 状态跟踪用 Orca CLI 轮询（1 秒），因为没有 EyPc 自有 hook 文件。Orca 标签置顶与 Codex 线程置顶是同一粒度。入站优先 `terminal.isPinned`；CLI 缺字段时直读本机 `orca-data.json` 的 `workspaceSession.tabsByWorktree|unifiedTabs.isPinned`（只取 tabId 布尔，不读标题/正文），与 1 秒库存对齐。不把工作区 `worktree.isPinned` 扇到组内每条。EyPc 置顶/取消写回 `terminal pin --pinned/--no-pinned`（桌面开着时走渲染层 `pinTab`）。插件本地置顶只作写回失败时的回退。
8. 任务行来源缩写 `OR`，悬停「归属 Orca」。项目名用仓库显示名。
9. 排序、行上相对时间和活动时间窗都以最新提问时间为节点：Orca 进入 `working` 的 `stateStartedAt`。回复过程中的 `updatedAt`、终端 `lastOutputAt` 或 1 秒轮询时刻不得把卡片抬到上面或刷新相对时间。完成后库存发 0，Kernel 保留上一轮提问钟。

## RAW-220

captured_at: 2026-09-14
state: active
text: >

  你把“已完成未读”的状态登记到一个需求里，录到 Orca 我的本地主分支。
  当前先暂时处理一下：通过 EYRPC 作为“已完成/未读”的中转记录，先做临时处理。

  比如，我们读取到“进行中”后，它永远不会直接跳成“已完成”，只有通过插件跳转，或者点击插件，经过点击、查看这一部分操作之后，才会变成“已完成/已读”。这样的方式可以让我的交互更加成体系，防止遗漏一些重要的未读项。

## 规范化需求（RAW-220）

1. 把标签栏「已完成未读」登记为 Orca 产品需求：权威是渲染层 `unreadAgentCompletionPanes[paneKey]`，不是 Agent Session History，也不是左侧 Project Tree 圆点。Orca 应把该按窗格布尔导出到 `worktree ps` 的 `agents[].unread`（始终带布尔）；现网 1.4.202 未导出。
2. 在 Orca 导出之前，EyPc 做临时中转：只要库存曾经读到该窗格「进行中」，之后变成 `done` 时进入「已完成未读」，不得直接变成「已完成已读」。冷启动时已经是已完成、且从未观测到进行中的窗格，不为此中转凭空标未读。
3. 只有插件跳转或点击查看之后，这一轮才变成「已完成已读」。进行中点卡片不得改成已完成。Orca 窗口里点标签仍不作为 EyPc 已读（原生焦点仍不确认）。
4. CLI 已给出 `agent.unread` 布尔时仍以该字段为准。工作区汇总未读不得扇出。History / 左侧树仍禁止当未读来源。

## 2026-09-15 F1/F2 实施确认

capture_fidelity: normalized-material-requirement
source_kind: chat-requirement-summary
source_lineage: Codex task 01a0a3c0-f790-7680-a529-962a851aa3f1, selected F1/F2
privacy_boundary: no-verbatim-prompt-or-transcript

沿用 RAW-219/220 收敛文档并完成原生状态同步：原生逐窗格未读优先，打开仅派发时不提前清原生未读；标签钉写后须同一目标回读才确认。旧 CLI 保留临时账本和 tab pin 文件回退。共用既有 Kernel 快照与各功能 Tab；真实宿主 F3、提交和推送不在本轮范围。前述“插件查看后已读”仅属于缺原生字段时的临时账本。
