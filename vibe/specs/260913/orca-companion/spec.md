# Orca Companion Provider

spec_id: SPEC-260913-ORCA-COMPANION
status: implementing

## Goal

把本机 Orca Agents 接成 EyPc 第四个 Companion Provider：状态、跳转、跟踪。默认关闭。

## Contract

见 [raw-requirement.md](raw-requirement.md#L1) RAW-219。

实现要点：

- Manifest `orca`：opt-in，`open` / `archive` / `topology`，pin inbound-only。
- Preload `preload/orca/`：CLI 解析、inventory、switch、pane close。`terminal list --include-visual-layouts` 只取 **tab** 节点（`tabId` + `activeLeafId` + `title`）作抬头；同 `tabId` 的 pane OSC 标题（工作中常是 spinner）不是主题，但是进行中相位：Grok `Waiting for response` 会被 Orca 规范化成 `⠋ Grok`，EyPc 在 `agent.state` 仍为 `done`、尚无 toolName 时也要标进行中。失败则回退无布局的 `terminal list`。工作树 `unread` 是汇总，卡片未读只归因到该工作树最新结束的会话，禁止扇出到组内每一条。
- Kernel 经现有 V7 证据车道消费；Host 1 秒轮询 `watchInventory` 后 `queueCompanionHostReconciliation('orca')`。
- 设置页「接入 Orca」；Float 项目筛选增加「只显示 Orca」。

## Verification

Focused：`orcaCli` / `orcaInventory` / `orcaOpen` / `orcaArchive` / companionProvider / companionPresentation。

Real uTools / 浮窗对照需用户明确授权后再做。
