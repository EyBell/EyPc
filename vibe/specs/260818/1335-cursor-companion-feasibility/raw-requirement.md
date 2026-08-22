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

## 用户授权（2026-08-21）

详细调研「点击打开 Cursor 任务」并接入插件（参照 claude/codex）；允许直接在本机执行测试、允许更高级脚本形式与破坏性行为；走通之后再改实际代码。

## 本机跳转复测（2026-08-21，Cursor 3.17.8，`live-verified`）

观察键改为 globalStorage `ItemTable['cursor/glass.selectedAgent']`（只读 `sqlite3 -readonly`，WAL 可见）。源码依据：3.17.8 的 `/agent` deeplink 把完整 URL 经 `cursor.openOrFocusGlassWindow` → `cursorRunActionInWindow(glass.handleDeeplink)` 转发进 Agents 窗口，`handleAgentOpen` 读 `id` 后按 header 选中并持久化。

- 正向 1：`open "cursor://anysphere.cursor-deeplink/agent?id=4cab4479-…"` → 选中由 `3a269569-…` 切到目标（≤8s 落盘）。
- 正向 2：同形切到 `9b09ae06-…`。
- 负对照：伪 uuid `00000000-0000-4000-8000-000000000000` 不改变选中（App 报 can't find）。
- 正向 3（还原）：切回原选中 `3a269569-…`。

结论：外部按本地 `composerId` 跳转已打通，允许按 Claude 同形落地 `preload/cursor/open.cjs`（`dispatched`，不报已读）。仍不写 DB、不 AX、不 resume。deeplink 层无任意命令执行（`/command` 只是 `deeplink.command.create`）。

## 归档统一为状态门禁（2026-08-21）

用户反馈：归档提示「provider 无法核验」，Claude（曾可归档）与 Cursor（从未成功）都无法归档；要求严谨修复并说明，且规避此类问题。归档规则明确为：**除「进行中」外，其余状态（含「待继续」）都可直接归档——这是状态筛选，不是来源 Agent 筛选**，所有 Agent 共用同一状态判断，不得再按具体 provider 阻断。

核验结论：Claude 归档能力位被版本白名单（`1.26832.0/1.28929.0/1.30096.5`）硬门禁，本机 Claude 已自动升级到 `1.34493.1` 故被拒；Cursor 投影写死 `canArchive:false` 且无执行通道。修复：拆除 Claude 版本白名单（保留结构化重验兜底）；Cursor 新增单行 `isArchived` 对写入归档（写前重验、UPDATE 内守卫、写后回读），桥 v5 暴露 `archiveTask`。

## 快捷键上一/下一任务接入 Cursor（2026-08-21）

用户反馈：点击可以打开任务，但「上一个/下一个任务」快捷键出问题；要求排查完整链路与相关日志、对照之前的处理方式（首次加入 Cloud 时出现过同类错误并已修复，即 RAW-152）。

核验结论：导航权威 `PROVIDERS` 只有 codex/claude，Cursor 卡从不进 kernel `cycleKeys`，快捷键候选集退化成极小集合；日志 2026-08-21T07:11:28Z 的 `cycle_*` 事件落在桌面端未运行的 Claude 任务上报 `unavailable`，且此前 `cycleCount` 恒为 1。点击之所以正常，是因为 Controller 对 Cursor 走绕过 kernel 的直连 deeplink 分支，掩盖了导航侧从未注册。修复：`companion-navigation-v4`，`PROVIDERS`/open 派发注册 cursor，kernel 新增 `publishAuxiliaryCycleTasks` 辅助候选通道并合并进 cycleKeys，Controller 随任务包发布 Cursor 候选。

后续（同日晚间）：同一症状再次出现且更重（连打开都不行）。导航注册 v4 已在宿主生效；剩余根因不在注册，而是 Kernel 选择器就绪门禁把 `verifying` 当作过期推进 5 秒冷读并静默失败，见 [260821/2045-shortcut-selector-readiness](../../260821/2045-shortcut-selector-readiness/spec.md#L1)。

再后续（同日夜间）：崩溃与选择器就绪问题消失后，手点 Cursor 仍正常，但上一/下一只在 Codex/Claude 间循环。当前宿主身份一致；日志显示主包 40 条、导航目标也为 40 条，`cycleCount=2`，证明 Cursor 辅助候选未发布。源码核验定位到最后一跳：Kernel 返回值与 Controller 均已有 `publishAuxiliaryCycleTasks`，生产 `window.eypcPlatform.companionKernel` 却漏转发，Controller 的可选能力检查静默返回。用户选择 D-1：补 preload 转发，将该方法升级为平台必需能力并在缺失时 `reload-required`，新增从生产 preload bridge 发布候选并完成 Cursor cycle 派发的回归测试。

验收边界补充（同日夜间）：用户明确要求 EyPc 插件默认永远不做真实插件/宿主测试，只有用户在当前任务主动、直接提出时才执行；选择 D-1、批准方案或要求修复均不构成该授权。本轮以生产 preload bridge 自动化回归、类型检查、构建和镜像校验收口。

## 任务归属颜色区分（2026-08-21）

用户要求进一步区分「Codex Cloud / Code / Cursor」任务颜色，并把 Cursor 做另类优化。

核验：插件实际卡片来源为 codex / claude / cursor 三类（「Codex Cloud」不是独立卡类）；Cursor 此前复用 `--codex-accent`，与 Codex 难以区分。落地：主题层单点派生 `quotaCursor`（紫蓝相，12 个内置主题上与 codex/claude 两 tone 色距均 >60° 且对卡面可读），新增 CSS 变量 `--codex-quota-cursor` 接管 Cursor 行底色（8%/12%）与归属标记；Cursor 归属标记改为实心药丸（另类视觉），Codex/Claude 维持描边样式。

## 关联

- 调研结论与立项方案：[spec.md](spec.md#L1)
- Cloud Code 当前合同：[../../260807/claude-code-companion-authority-reset/spec.md](../../260807/claude-code-companion-authority-reset/spec.md#L1)
- Claude 可行性体例先例（历史检索，非当前合同）：[../../260805/1130-claude-companion-feasibility/spec.md](../../260805/1130-claude-companion-feasibility/spec.md#L1)
