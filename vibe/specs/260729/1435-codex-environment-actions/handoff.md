# Handoff: Codex Environment Action Runner

Tool: codex

Date: 2026-08-03

## Current Objective

关闭 2026-08-03 接纳复核中的全部 P0/P1，并把严格 TOML version、worktree `targetId`、tasks-only preflight 与 uTools 插件退出生命周期纳入当前 Action Runner 权威。

## Review Status

当前为 `automated-verified / host-pending`。聚焦 Action/Controller/Host/Runner/routing 为 7 文件 `95/95`；最终 `pnpm run verify` 为 57 文件 `733/733`，随后 typecheck、production build、runtime prepare 与 uTools validation 全部通过。EyPc/CodeNote 文档链接与权威一致性已通过；真实 uTools、Windows 与真实 Action 仍未验收。

## Acceptance Owner

App Root 独占需求、架构、Host 风险边界、最终 diff/验证/文档接纳。本任务 main-only，未启用子 Agent。

## Reported Implementation

- 命令 gate 改为 exact structured argv；无 flag/额外 token，严格 TOML `version=1`，旧 Action Host revision fail-closed 并在 Runner 提示重载。
- 项目 `targetId` 保持 `projectKey`，task 使用 canonical worktree cwd 的 Host 摘要；vault/session/confirmation/run/stop 均按 target+Environment+Action 隔离。
- Controller 增加 tasks-only preflight、catalog/run 前 alias 刷新与一次性 stale-alias 重试；Runner 先同步显示 loading/error，五槽使用 Host 持久化 selected Environment，异常选择不回退。
- Action feature 保持主窗口当前 Tab，由 `mainHide` 管理可见性；Float 仍无 Action 状态。
- `onPluginOut(false)` 只隐藏并保留 live Action；`onPluginOut(true)` 才 interrupted flush/清理/非强制终止。POSIX 使用进程组 SIGTERM；Windows 使用 `/T` 且无 `/F`，失败只回退 direct-child SIGTERM。
- 快捷键性能增量让普通 hide 同时保留 App Server/alias/latest-Turn 热会话；Runner 首次无 verified inventory 或 Host 明确 stale alias 时才全量预检，执行安全复核不变。相关四文件 `149/149` 与定向静态门禁通过，真实体感 pending。
- 后续增量将任务物化与 Activity 订阅保持到 Codex feature disable，而不是 Tab/Float 隐藏；Runner catalog 以项目分片，库存新增/alias 变化只加载受影响项目，未变项目保持热态。执行时 Host 的 TOML/target/command 安全复核不变；相关影响面 `301/301`，type/preload 与 Vite/runtime/uTools packaging 聚焦门禁通过，真实体感 pending。

## Residual Gates

- 宿主：真实 uTools child/global hotkey/普通隐藏/进程退出、多显示器、真实 Windows 进程树和长期 Serve。
- 外部动作：不执行真实 Git Push、真实 Build/Serve 或其它外部写入。
- 工作树中并行/用户脏改保持原样，不纳入本任务接纳。

## Verification Source

最终自动化证据、历史证据边界与未执行项统一见 [verify.md](verify.md#L1)。
