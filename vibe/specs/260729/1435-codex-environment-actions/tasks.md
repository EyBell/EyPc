# Tasks: Codex Environment Action Runner

Tool: codex

Date: 2026-08-03

- [x] T1：收敛唯一配置根 + exact task/worktree cwd、每次 TOML 重读、macOS NVM/系统 Node/项目手动选择、绝对 Node+JS entry 启动计划与 Supervisor lane。
- [x] T2：实现跨 chunk UTF-8 脱敏、批量/cursor 日志、SQLite 历史、归档/恢复和先清理后载入的保留策略。
- [x] T3：新增 Action Runner child window、preload、Vue entry、左右工作台、自绘隐藏/拖拽/缩放、短任务状态和同 Lane 最新记录展开。
- [x] T4：复用 Quick Jump，接入归档/恢复、运行/停止、目录和视图控件。
- [x] T5：接入 Controller、Runtime Action、uTools feature/global hotkey 与五槽自动定位。
- [x] T6：移除 Float Environment IPC/死状态并完成平台、打包和兼容桥。
- [x] T7：补齐 domain/runtime/UI/Host 行为测试；聚焦 7 文件 `48/48`、全量 `697/697`、typecheck、production build 与 uTools validation 通过。
- [x] T8：同步项目权威、帮助、记忆、CodeNote AI 理解和最终自动化验收状态；真实 uTools 宿主观察继续单列 pending。
- [x] T9：新增旧实现失败的 exact argv、strict TOML version、runtime revision、tasks-only preflight、selected Environment、targetId 与 lifecycle 回归。
- [x] T10：Host 收紧结构化命令边界，接入 worktree-sensitive `targetId`，并统一 vault/session/confirmation/run/stop 隔离。
- [x] T11：Controller/Runner 接入 tasks-only preflight、一次性 stale-alias 重试、Runner-first message、持久化 Environment 槽位权威与 `mainHide` 路由语义。
- [x] T12：按 `onPluginOut(isKill)` 区分隐藏/进程退出，补 interrupted flush/清理、POSIX 进程组 SIGTERM 与 Windows `/T` 非强制停止。
- [x] T13：同步当前 Controlled task、项目权威、用户指南、项目错误记忆与 CodeNote uTools 生命周期权威。
- [x] T14：完成 production build、统一 verify、Markdown/权威一致性与 Documentation Sync Receipt；真实 uTools/Windows/Action 保持 host acceptance。
- [x] T15：普通 mainHide 保留 App Server/alias 热会话，Runner verified inventory 热复用；相关四文件 `149/149`、typecheck、preload 语法/镜像与 diff 通过，真实时延 pending。
- [x] T16：Controller feature-lifetime 任务/Activity 热缓存，Runner per-project catalog 增量新增/alias 失效/single-flight；受影响 15 文件 `301/301`、type/preload 与聚焦 packaging 门禁通过，真实时延 pending。
