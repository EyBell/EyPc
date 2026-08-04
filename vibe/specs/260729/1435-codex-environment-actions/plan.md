# Plan: Codex Environment Action Runner

Tool: codex

Date: 2026-08-03

## Objective

把现有 Environment Action 五槽从一次性 Host 调用收敛为独立 Action Runner：Controller 统一选目标/派发，Host 统一监管进程、脱敏日志和 SQLite 历史，Runner 只显示安全快照并提交白名单 Runtime Action。

## Implementation

1. 新增 `action.html`、独立 Vue entry、最小 action preload 与 Host `createBrowserWindow` 生命周期。uTools feature “打开 Action 执行工作台”只显示/恢复窗口；五槽执行自动显示并选择本次 Action。
2. 左侧树只呈现项目/Environment/Action；右侧按 Action 通道呈现实时运行、折叠历史、归档/恢复和 Git Push 确认。最新记录展开，旧记录一行折叠。
3. 抽取 Runner 可复用的 Quick Jump 控制器；沿用既有标记域、可见性/遮挡/裁剪规则、`F`/`Shift+F`、Escape 分层和同一按钮点击路径。
4. Host 每次请求重新解析 TOML，生成不可变 target/config revision；Supervisor 以项目根+Environment+Action 为稳定通道，捕获/脱敏 stdout/stderr，Serve stop→exit→optional restart。
5. 本地 `codex-action-runs.sqlite` 保存运行/日志/归档状态，按 30 天、200 次、100 MB 中先到者淘汰；归档可恢复但仍计入容量。
6. 删除 Float 的 Environment list/run/session IPC 和失效的 Environment 选择记忆；RAW-114 保持不变。
7. 同步 Runtime/Platform 类型、uTools 资源打包/校验、帮助、架构、技术状态、项目状态和 CodeNote 当前需求理解。
8. macOS Host 本地解析 `$NVM_DIR`、XDG NVM 与 `~/.nvm`，按项目声明/NVM default/本地版本/受控系统 Node 生成安全候选；项目级 manual ID 每次执行重新验证。npm/pnpm/yarn/vite 统一为绝对 Node + JS entry，绝不把 Electron/uTools 当 Node。
9. `configRoot` 与 exact task/worktree `executionCwd` 分离；session 注册后再发布 running。stdout/stderr 先经 UTF-8 行 framing 和跨 chunk 脱敏，再按有界批次写库/发送 cursor delta；启动保留清理先于内存重建。
10. Runner 改为自绘无边框窗口并复用显式拖拽/缩放协议；项目 Node 选择、隐藏、运行、记录和归档进入同一 Quick Jump。新 run ID 强制展开一次，cursor 缺口请求完整快照。

## Boundaries

- 不调用 Codex 原生 Action API。
- 不回显路径、原命令、PID、确认令牌或未脱敏日志。
- Setup 不进可执行槽；不静默重跑。
- Runner 不直接 spawn；Runner 关闭/隐藏不停止 Action。
- 不执行真实 Git Push、发布、部署或外部写入验收。
- 不 source shell 配置、不安装 Node/Corepack 包、不接受 Renderer 提供的 Node 路径；运行时路径只留在 Host。

## Documentation Impact

- Owner: `vibe/specs/260729/1435-codex-environment-actions/`。
- Current/canonical: `PRODUCT_REQUIREMENTS`、`PROJECT_STATUS`、`ARCHITECTURE`、`technical-details`、Codex help。
- Personal product record: CodeNote EyPc `AI-Requirement-Understanding.md`；README/portfolio 仅在入口或状态摘要变化时更新。

## 2026-08-03 Reopened Acceptance Plan

1. 先写会在旧实现失败的回归：完整 argv 正/负例、严格 TOML version、runtime revision、tasks-only preflight、持久化 Environment 选择、worktree `targetId` 隔离、`onPluginOut` 双语义和 Windows 非强制树终止。
2. Host 改为结构化命令验证，启动计划只接收已验证结构；引入 runtime revision 与 Host `targetId`，统一 vault/session/confirm/run/stop 身份。
3. Controller 增加 tasks-only preflight、一次性 stale-alias 重建、Runner-first loading/message 与 selected-lane 五槽权威；feature route 保持当前 Tab 并交给 `mainHide`。
4. Host 生命周期按 `onPluginOut(isKill)` 分流；仅真实进程结束执行 interrupted flush/清理/非强制终止，普通隐藏保留 live Action。
5. 同步 Controlled task、产品需求、项目状态、架构、technical details、用户指南、项目 argv 错误记忆和 CodeNote uTools 生命周期权威。
6. 依次执行聚焦测试、preload syntax/mirror、typecheck、非 watch build、统一 verify、Markdown 链接与文档权威一致性检查；真实宿主和真实 Action 保持 pending。
7. 快捷键性能增量：普通非 kill 隐藏保留 App Server/alias cache，Runner 首次或 stale alias 才执行 tasks-only preflight；用热入口 task snapshot 零新增合同与相关四文件聚焦门禁验证，不重跑完整 verify/build。
8. 将 Controller 任务库存固定到 feature-lifetime，并把 Runner catalog 拆成 per-project cache/single-flight；库存新增/alias 更新只增量加载受影响项目，执行前 Host 安全读取保持不变。
