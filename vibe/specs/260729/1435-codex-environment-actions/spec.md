# Spec: Codex Environment Action Runner

Tool: codex

Date: 2026-08-03

## Architecture

- Main Renderer/Runtime Action → Codex Controller → Host Action Supervisor。
- Host Supervisor → sanitized snapshot/log delta → Action Runner child Renderer。
- Runner interaction → action preload whitelist → main Runtime Action；Runner 无直接进程、文件或数据库能力。
- Codex Float 只转发五槽命令，不读取 Environment、session、日志或归档。

## Stable Identities

- Target：项目目标的 `targetId` 等于既有 `projectKey`；task 目标的 `targetId` 为 Host 对 `projectKey + canonical executionCwd` 的摘要。Renderer 不接收 task alias 或 cwd。
- Lane：`targetId + environmentId + actionId`。
- Run：Host 生成 opaque `runId`；Renderer 不接收 cwd、原命令或 PID。
- Config revision：Environment 文件内容、允许 Action 投影和启动计划的 Host-only fingerprint。

## Runner Contract

- 左树：单 Environment 省略中间层；多 Environment 显式分层。
- 右侧：最新/运行中展开，旧记录一行折叠；历史按开始时间倒序。
- 完成态可归档/恢复；running/stopping/confirm-required 固定禁用并说明原因。
- `F`/`Shift+F` 仅在非编辑、无确认层时打开 Quick Jump；标记只覆盖当前视口真实可见且可执行目标。
- 窗口显隐、位置、尺寸、置顶、选择和面板宽度本地持久化；关闭只隐藏。
- 窗口为自绘无边框 child；标题栏关闭与 `Command/Ctrl+W` 只隐藏，四角 resize 和标题拖动通过 sender-validated 显式 IPC 驱动 Host `setBounds`，结束/隐藏时持久化。
- 所选项目显示 Node 运行时安全标签和项目级选择器；自动/manual 状态、版本和来源可见，绝对路径不可见。Git Push 明确不使用 Node。

## Process Contract

- 允许集合按完整 argv 判定：仅 `pnpm|npm|yarn|bun run build|serve`、`vite build|serve`、`git push`；任何 flag、额外 token、shell token 或 Git ref/force 均 fail-closed，且无效 Action 不进入 catalog。
- `shell:false`；启动前把首 token 解析成绝对可执行计划，Windows shim 必须展开为绝对 Node/脚本入口。
- 短任务超时只报告在真实 exit 后完成；Serve stop 只发 SIGTERM，并在 exit 前保持 stopping。
- 同一 Lane 只允许一个 live run；不同 Lane 可并行。
- Git Push 首次进入 confirm-required；确认绑定 target/lane/config revision 并短期有效。
- `configRoot` 只负责 `.codex/environments`；task target 的 `executionCwd` 必须取短期别名保存并复核的 exact worktree cwd，项目 target 才使用配置根。
- macOS 自动模式按 `.nvmrc` → `.node-version` → NVM default → 本地 NVM → 受控系统 Node 解析；显式项目版本不可用时 fail-closed，项目 manual 候选可明确覆盖。npm/pnpm/yarn/vite 只能以已验证绝对 Node + JS entry 启动，不 source shell、不安装依赖、不使用 Electron `process.execPath`。
- TOML `version` 的原始 token 必须严格为裸整数 `1`；Host 与 Domain parser 同步拒绝字符串、浮点、指数和前导零形式。
- Action Host runtime revision 是 catalog/run 的强制能力门禁；旧 Preload 只能得到可见的 reload 提示，不能执行。
- vault、session、confirmation、run/stop 都必须复核 `targetId`；Git Push confirmation 还绑定 Environment、Action、配置和命令 fingerprint，不同 worktree 不能互用。

## Controller And Entry Contract

- tasks-only preflight 可在功能启用时绕过 Codex Tab/Float 可见性门禁，只做 inventory/alias 校验与 Action 投影，不读取额度或启动轮询。
- Runner 在首次缺少 verified inventory 时于 preflight 前同步显示 loading；后续 catalog/运行先复用当前 alias 并交给 Host 精确校验。`stale-alias` 只允许一次 tasks-only 重建与一次重试，仍失败则显示安全 message 并拒绝；执行时仍重新读取并验证配置。
- Host 持久化的 `selectedLaneId` 是五槽 Environment 权威。无历史才默认优先项目第一个 Environment；选择跨项目、失效或缺少对应槽时不回退。
- Runner/五槽入口保持主窗口当前 Tab；`mainHide` 管理入口可见性，Renderer 不安排额外 hide。

## Host Lifecycle Contract

- `onPluginOut(false)` 是后台隐藏：不得停止 live Action，也不得请求会清除 action alias/latest-Turn cache 的 App Server close。显式 Controller close 若与 Runner/preflight/run 并发，仍延后到该所有权结束。
- `onPluginOut(true)` 是进程结束：取消 pending restart，完成日志 framing/flush，将 live run 持久化为 `interrupted`，清空 session/vault/confirmation，再发送非强制终止。
- POSIX 终止进程组只用 `SIGTERM`；Windows 首选无 `/F` 的 `taskkill /PID … /T`，失败仅回退 direct-child `SIGTERM`。正常 stop 保持 `stopping` 到真实 exit，不自动使用 `SIGKILL`。

## History Contract

- SQLite 只存安全投影：run identity、公共归属、状态/时间/退出摘要、archivedAt、按序日志文本。
- 日志入库前移除 ANSI/危险控制字符，投影 home/project 路径并脱敏常见凭据。
- 重启时遗留 running/stopping 记录转为 interrupted。
- 保留上限为 30 天、200 runs、100 MB；最旧记录优先清理。
- stdout/stderr 分 stream 使用 UTF-8 decoder 和完整行 framing；只有跨 chunk 脱敏后的文本可进入有界 flush 队列。delta cursor 严格递增，Renderer 重复忽略、缺口请求完整 snapshot。
- 数据库启动先中断遗留 live run、删除过期/超额记录，再从最终行集重建内存；run 记录可附安全的 Node mode/source/version/label，但不含路径。
