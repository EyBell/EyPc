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
3. 一张卡对应一个 Agent 终端（`tabId:leafId`）。没有 `agentIdentity` 的普通终端不进清单。
4. 相位只映射 Orca 已公开的状态：`working` / `waiting` / `blocked` → 进行中；窗格 OSC 工作帧（含 Grok `Waiting for response` 规范化成 `⠋ Grok`、Claude `. ` / spinner）同样是进行中，不必等 toolName 或助手正文。`done` 且无工作帧 → 已完成，`interrupted` 或断开 → 待继续。不发明待输入/Plan。工作树 `unread` 只是工作区汇总，不得扇出到组内每条对话；卡片未读只归因到该工作树里最新结束的那一条（CLI 没有按会话未读字段）。
5. 打开走统一 Command：就绪层先保证 Orca 在跑（`orca status` / `orca open`），再 `terminal switch`。结果最多 `dispatched`，不确认已读。
6. 归档关闭该终端窗格（`terminal close --terminal`，不用 `--all`）。`working` 拒绝归档。
7. 状态跟踪用 Orca CLI 轮询（1 秒），因为没有 EyPc 自有 hook 文件。Orca 工作树置顶只入站，插件置顶本地，不写出站。
8. 任务行来源缩写 `OR`，悬停「归属 Orca」。项目名用仓库显示名。
