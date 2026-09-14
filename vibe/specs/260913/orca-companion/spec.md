# Orca Companion Provider

spec_id: SPEC-260913-ORCA-COMPANION
status: implementing

## Goal

把本机 Orca Agents 接成 EyPc 第四个 Companion Provider：状态、跳转、跟踪。默认关闭。

## Contract

见 [raw-requirement.md](raw-requirement.md#L1) RAW-219、RAW-220。

实现要点：

- Manifest `orca`：opt-in，`open` / `archive` / `topology`，pin inbound+outbound。入站优先 `terminal.isPinned`，CLI 缺字段时直读 `orca-data.json` 会话库 tab 布尔。EyPc 置顶写回 `terminal pin --pinned/--no-pinned`。仅有 `agentIdentity`、没有对话的工具栏窗格不进清单。Orca 窗口里已关掉的窗格不进清单：`terminal list` 没有该 `paneKey` 时丢掉 `worktree ps` 残留行。
- Preload `preload/orca/`：CLI 解析、inventory、switch、pane close。成功的 `terminal list` 是还开着的窗格权威；关在 Orca 窗口里、list 已没有的 `paneKey` 不得再用 `worktree ps` 残留行合成卡片。`terminal list --include-visual-layouts` 只取 **tab** 节点（`tabId` + `activeLeafId` + `title`）作抬头；同 `tabId` 的 pane OSC 标题（工作中常是 spinner）不是主题，但是进行中相位：Grok `Waiting for response` 会被 Orca 规范化成 `⠋ Grok`，EyPc 在 `agent.state` 仍为 `done`、尚无 toolName 时也要标进行中。失败则回退无布局的 `terminal list`。Orca 三处状态不是一份：标签卡才有已完成未读和标签钉；左侧树只有 working/done/interrupted；Agent Session History（`aiVault.listSessions`）无 unread/pin/phase，禁止当未读或钉，也禁止读 preview。工作树 `unread` 是汇总；CLI agent 行带布尔 `unread` 时卡片跟该字段。没有按窗格字段时，仅当该工作树只有一条已完成会话才可吃汇总；多条已完成不得猜最右/最新。禁止扇出到组内每一条。
- 排序与行上时钟：`lastQuestionAt` 只取进入 `working` 的 `stateStartedAt`。`lastOutputAt`、中途 `updatedAt`、轮询 `acceptedAt` 不得进入提问钟。完成/中断发 `lastQuestionAt: 0`，Kernel `incoming || previous` 保留上一问。
- 快捷键、展开卡片或角标打开成功后记住当前任务；「上一个 / 下一个」从该任务所在动态组继续，列表高亮跟到这一条。
- Kernel 经现有 V7 证据车道消费；Host 1 秒轮询 `watchInventory` 后 `queueCompanionHostReconciliation('orca')`。
- RAW-220：标签栏已完成未读应在 Orca 按窗格导出。未导出前，EyPc `unread-bridge` 把「曾观测到进行中 → done」记成本地已完成未读；插件 `terminal switch` 派发成功后清这一轮。进行中点卡片仍不得改成已完成。CLI `agent.unread` 布尔优先。原生 `dispatched` 仍不确认 Orca 窗口已读。
- 设置页「接入 Orca」；Float 项目筛选增加「只显示 Orca」。

## Verification

Focused：`orcaCli` / `orcaInventory` / `orcaPin` / `orcaOpen` / `orcaArchive` / `orcaUnreadBridge` / companionProvider / companionPresentation。

Real uTools / 浮窗对照需用户明确授权后再做。
