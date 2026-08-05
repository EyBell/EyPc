# Claude 版悬浮水球可行性调研结论与立项方案

Tool: claude (Cowork)
Date: 2026-08-05
Status: `research-verified / implementation-pending`
Documentation level: `standard`

Raw source: [raw-requirement.md](raw-requirement.md#L1)

## 结论摘要

**路线 A（监控 Claude Code CLI）可行**，与现有 Codex Companion 的两个数据面（额度 + 任务状态）几乎 1:1 对应，且 EyPc 架构已预留 provider 替换缝（见 [ARCHITECTURE.md Codex Companion 节](../../../knowledge/ARCHITECTURE.md#L1)："This is the provider/floating-host replacement seam for a future Easy Agent integration"）。前置条件：本机安装并登录 Claude Code CLI。
**路线 B（监控 Claude Cowork 桌面任务）当前不可行**，标记待观察。

## 现有 Codex 水球机制（迁移基线）

- 浮窗宿主：[preload/index.js](../../../../preload/index.js#L6409) 通过 `utools.createBrowserWindow('float.html', {...})` 创建无边框、透明、`alwaysOnTop`、`skipTaskbar` 的子窗口；父→子经 `webContents.send` 推送快照，子→父经 `utools.sendToParent`（[preload/float.js](../../../../preload/float.js#L1)）。
- 额度面：preload 以 stdio JSON-RPC 拉起官方 `codex app-server`（[preload/index.js](../../../../preload/index.js#L4387)），调用 `account/rateLimits/read` 得 short(5h)/weekly 两窗（[preload/index.js](../../../../preload/index.js#L5939)），按 `quotaRefreshSeconds` 周期刷新。
- 任务面：Codex Desktop IPC（`~/.codex/ipc/ipc.sock`）+ app-server 事件 + rollout/会话文件构成 activity/unread/waiting 证据链；Controller（[codexController.ts](../../../../src/runtime/codexController.ts#L1)）聚合为原子包，经 float.sync 投影到水球。
- Runtime 仅依赖 `codex.inspectEnvironment/readSnapshot/openThread/...` + `float.*` 端口——**替换 provider 不动浮窗与 UI**。

## 路线 A：Claude Code CLI（立项方向）

### 数据面映射

| Codex 现状 | Claude 对应物 | 性质 |
| --- | --- | --- |
| `codex app-server` RPC `account/rateLimits/read`（short/weekly） | statusline stdin `rate_limits.five_hour/seven_day.used_percentage + resets_at`（Claude Code ≥2.1，Pro/Max，官方字段）；兜底：`GET https://api.anthropic.com/api/oauth/usage`（Bearer token，`anthropic-beta: oauth-2025-04-20`，社区发现、未文档化） | 额度 |
| Desktop IPC + rollout 文件的 activity/waiting/unread | 官方 hooks：`SessionStart/UserPromptSubmit/PreToolUse/PostToolUse/Stop/StopFailure/Notification/PermissionRequest/SubagentStart/SubagentStop/TaskCreated/TaskCompleted/SessionEnd`，stdin 携带 `session_id/transcript_path/cwd`，注册于 `~/.claude/settings.json` | 任务事件（推） |
| 会话/线程库存 | `~/.claude/projects/<project-slug>/<sessionId>.jsonl`（typed JSONL：user/assistant/usage/model...）+ `~/.claude/tasks/<sessionId>/N.json`（任务列表） | 任务库存（拉） |
| Deep Link 打开 Codex Desktop 线程 | 无官方 deep link；可 `claude --resume <sessionId>`（终端）或聚焦终端窗口 | 打开动作（弱） |
| 凭证 | macOS 默认存 Keychain（`Claude Code-credentials`），Linux 为 `~/.claude/.credentials.json` `claudeAiOauth.accessToken` | 只读 |

### 实操核验证据（2026-08-05）

- 云端沙箱（真实 Claude Code 2.1.222 会话）：PoC 解析器读取 `~/.claude/projects/*/​*.jsonl`，对活动会话正确导出 `status=running-tool`、`model=claude-fable-5`、`contextTokens≈131k`、turns/toolCalls 计数——任务面数据真实可读、可流式 tail。
- `~/.claude/tasks/<sessionId>/N.json` 任务列表文件真实存在、逐任务 JSON。
- statusline `rate_limits` 字段为官方文档字段（five_hour/seven_day 百分比 + 复位时间戳）。
- `api.anthropic.com/api/oauth/usage` 端点存在并响应（无凭证探测返回 429/限流），社区多个监控工具在用；属未文档化接口，需容错降级。
- 本机（kmmac）：`~/.claude` 不存在 → **前置条件：安装 Claude Code CLI 并登录**；`~/.codex` 存在（现 Codex 面正常）。
- 先例：claude-glance（macOS 原生悬浮 widget，hooks 驱动三态：忙/待输入/空闲）、claude-status（菜单栏）、多款 usage 监控——业务模式已被社区验证。

### 与 Codex 面的差距（实现时需消化）

1. 无常驻 app-server：额度无 RPC 可查，采用「statusline 脚本落盘 + 周期读」为主、oauth/usage 为兜底；两者都要按 `quotaRefreshSeconds` 语义接入现有刷新调度。
2. waiting-input 语义：以 `Notification`/`PermissionRequest` hook 为准（等价 Codex 的待输入/审批），`Stop` 视为回合完成；unread 需 EyPc 自管（无原生 read-state 集合）。
3. 打开动作降级：`openThread` 语义改为 resume 命令/聚焦终端，成功确认弱于 Codex Deep Link，read 确认策略需相应放宽。
4. 隐私与只读纪律沿用 Codex 规则：不读正文入诊断、不写 Claude 原生状态（hooks 注册写 `~/.claude/settings.json` 需用户确认，属一次性安装步骤）。

### 立项：后续实现任务（登记）

- 名称：`claude-companion-provider`（Claude Code CLI 版悬浮水球 provider）。
- 范围：在 `codex.*`/`float.*` 替换缝后新增 claude provider（环境探测、额度适配器、hooks 事件桥、JSONL 库存读取、resume 打开动作），复用现有水球/展开卡 UI 与外观持久化。
- 前置：用户在本机安装 Claude Code CLI 并登录；确认 hooks 注册方式。
- 验证：Domain/Controller 聚焦测试 + typecheck + 非运行 build；真实宿主验收归用户（与 `EYPC-VERIFY-001` 一致）。

## 路线 B：Claude Cowork 桌面任务（待观察）

- 本地状态位于 `~/Library/Application Support/Claude`，无公开文档与稳定格式承诺；云端任务的会话数据在云容器内，本地盘无完整镜像。
- 该目录属系统保护位置，常规读取即有权限与隐私门槛。
- 无 hooks/statusline 等官方外挂点。
- 结论：暂不立项；若官方后续开放本地状态或 API，再重评。

## 来源

- Claude Code hooks 官方文档（code.claude.com/docs/en/hooks）
- Claude Code statusline 官方文档（code.claude.com/docs/en/statusline，含 `rate_limits` schema）
- 社区先例：adrienlupo/claude-glance、gmr/claude-status、ohugonnot/claude-code-statusline、Maciek-roboblog/Claude-Code-Usage-Monitor
- 本仓证据：[preload/index.js](../../../../preload/index.js#L4387)、[codexController.ts](../../../../src/runtime/codexController.ts#L1)、[ARCHITECTURE.md](../../../knowledge/ARCHITECTURE.md#L1)
