# RAW：Cursor Agent Companion 可行性调研

Tool: cursor
Date: 2026-08-18
Documentation level: `standard`

## 用户原始诉求（2026-08-18）

参照 Codex 功能 Tab 页里的「Codex 任务」与「额度状态变更」，以及 Cloud Code 里的「任务」与「状态变更」，去核查一下本机 Cursor 的 Agent 模式下的这些任务状态，看能否将一个新模块添加进 EYPC 插件内部。

## 用户决策（同日确认与变更）

- 本轮只写可行性调研文档，不改应用代码、不注册 hook、不跑实火 canary。
- 库存范围只纳本机 Agent 模式：`unifiedMode=agent`，排除 subagent、Chat、Plan、Cloud Agent。
- **需求变更（同日二次确认，`explicit-current-request`）**：
  1. 不需要进行额度相关的排查。额度条、额度状态变更、water-ball 读数不调查、不对照、不立项。
  2. 只需要进行任务状态的分类展示，并与 Cloud Code 的任务状态进行对比实现。对照权威是 Claude Companion 相位，不是 Codex Plan/Goal/额度。

## 本机前置事实（只读核验，2026-08-18）

- Cursor 3.16.17。`composerHeaders` 535 行；`unifiedMode=agent` 435；非 subagent 384；未归档 128。其中 `agentLocation.type=local` 仅 33，其余 95 条为空——空值不得当「非本机」。
- `~/.cursor/hooks.json` 与本仓 `.cursor/hooks.json` 均不存在。官方用户级 hook 通道在，尚未插入。
- `hasUnreadMessages=true` 本机计数为 0（同日后续快照改为 3，见下方三次修订；不得再写 `unsupported`）。
- 未读取会话正文、`composerData` 全文或 transcript JSONL 正文。
- 权威表是 SQLite `composerHeaders`（`composerId` + `value` JSON），不是 `cursorDiskKV` 的 `composerHeaders:*`。同日后续计数 551 行，未归档非 subagent Agent 仍约 128。

## 用户补充（同日）

先去核查一下 Cursor 的 `create-hook` Skill 是否可以借鉴，补充到相关调研文档。

## 用户决策（同日三次修订，覆盖「打开弱 / resume」）

对照 Cursor App 侧栏不同图标状态，核验并立项三件事：

1. 获取该状态。
2. 获取该状态的变更。
3. 保证能够直接快速跳转到**那一条**对话内部。

附加约束（同日确认）：

- 插件与 App 内部对话 **1:1**；Cursor 归档则插件随之不进库存。
- **暂时不要考虑 resume**；只考虑跳转。
- 可用本机做实际测试；**测试通过之后再写跳转方案**。未通过不得写成已保证。

本轮执行范围仍是调研文档，不改应用代码、不注册 hook、不写 `state.vscdb`。

## 本机跳转实测（2026-08-18，外部打开）

目标对话 `86e0370a-21b3-434d-a1a3-0ce83edc5ddd`，对照当时选中 `eaafef48-388a-403c-ab6b-8d51ad09acbd`。结果：

- `open cursor.agent://local/<id>`：OS 拒绝（无 handler）。
- `open -a Cursor cursor.agent://local/<id>`：rc 0，`selectedComposerIds` 不变。
- `open cursor://anysphere.cursor-deeplink/agent`：不切到目标对话。
- `open cursor://anysphere.cursor-deeplink/agent?id=<uuid>`：不切到该本地 id。
- `cursor --reuse-window --open-url cursor.agent://local/<id>`：rc 0，选中不变。

跳转标 `live-failed`。禁止写 `selectedComposerIds`、AX、`cursor-agent --resume`。

## 关联

- 调研结论与立项方案：[spec.md](spec.md#L1)
- Cloud Code 当前合同：[../../260807/claude-code-companion-authority-reset/spec.md](../../260807/claude-code-companion-authority-reset/spec.md#L1)
- Claude 可行性体例先例（历史检索，非当前合同）：[../../260805/1130-claude-companion-feasibility/spec.md](../../260805/1130-claude-companion-feasibility/spec.md#L1)
