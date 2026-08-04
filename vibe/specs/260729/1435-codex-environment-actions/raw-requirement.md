# RAW: Codex Environment Action 快捷槽

Tool: codex

Date: 2026-07-29

## Request

在 Codex 悬浮展开面板额度 Time 下方增加固定 5 个 Action 全局快捷键卡槽：读取项目 `.codex/environments/*.toml`，由 EyPc 在准确项目 cwd 等价执行命令（非 Codex App 顶栏原生 Action）。

## Confirmed scope

1. 目标：选中/聚焦任务或项目优先；可选配置 Action 默认项目；不配置则回退悬浮卡「项目」Tab 最近焦点；再否则以置顶/最近项目为候选。
2. 多 Environment：默认第一个，键盘可选；Setup 只展示不执行；Git Push 二次确认；Serve 管理长驻会话。
3. 项目 Tab 切换与候选层共存；路径/命令不进入 Renderer。

## Acceptance intent

- Time 下可见 5 槽；`Ctrl+Shift+1..5` 可触发。
- 置顶项目自动进入候选；无目标时键盘可选项目。
- 多 env 时弹出选择层；单 env 静默。
- Push 无确认被拒绝；Setup 不可执行；Serve 可启停状态可见。

## 2026-07-29 User Correction

- `superseded-by-Codex-RAW-114`: 展开 Codex 浮窗不再显示 Actions/Environment 五槽、项目/Environment 选择层或 Setup 提示；原“Time 下可见 5 槽”验收项失效。
- 五个 uTools 全局 Action 功能、Controller 统一目标选择、Host TOML 读取/等价执行、Setup 禁止、Serve 会话与 Git Push 二次确认继续有效。Float 若收到卡内 `Ctrl+Shift+1…5` 命令，只转发同一 Controller action，不维护独立执行状态。

## 2026-07-31 Action Runner User Facts

1. Environment Action 的执行过程必须留在 EyPc 插件内，并新增一个独立、可悬浮的 Action 执行子窗口；该窗口不是 Codex Float 的扩展区。
2. 子窗口可展示项目、Environment、Action、脚本实时执行过程和本地历史记录；左侧以项目为根，单 Environment 时省略 Environment 层，多 Environment 时显示 `项目 → Environment → Action`。
3. 右侧才是执行记录主区域：最新/当前执行展开，上一轮及更早记录压缩成一行折叠记录；记录带时间戳和完整项目/Environment/Action 归属。
4. 同一 Action 复用一个执行通道；长期脚本再次触发时先受控停止、等待真实退出、压缩旧记录，再重新校验并启动。
5. 已结束记录可逐条手动归档；归档是可恢复的本地组织行为，不等同于永久删除。
6. Runner 可通过 uTools 全局功能配置系统级快捷键并直接显示/展开；Action 槽 1–5 执行时也自动显示并定位到本次运行。
7. Runner 内沿用 EyPc 既有 Quick Jump：`F` 正向、`Shift+F` 反向，为当前可见、可执行控件悬浮字母标记；输入标记执行同一个按钮/Runtime Action，包括归档与恢复。
8. 交互必须延续 EyPc 已有品味：紧凑、高对比、键盘优先、状态和操作能力同源、可逆操作即时反馈、危险操作才确认。

## 2026-07-31 Target And Safety Decisions

1. 全局槽目标顺序：已配置默认项目 → EyPc 本地项目置顶顺序第一项 → Codex 原生置顶第一项 → Codex `selected-project` 当前/最近项目。
2. 命中高优先级目标后 fail-closed；该目标缺配置、Action、唯一项目根或有效引用时不得静默回退。
3. `.codex/environments` 与执行 cwd 都绑定包含该目录的唯一注册项目根；不得使用最近任务 worktree 代替项目根。
4. 每次执行/确认都重新读取 TOML 并绑定配置 revision；禁止复用旧 command vault。
5. 保持 `shell:false`，只允许校验后的绝对启动计划；路径、原命令、PID、凭据和原始 stderr 不得进入 Renderer。
6. Serve 停止只发送 SIGTERM，不自动升级 SIGKILL；Host 必须持续持有进程直到真实退出。

## 2026-07-31 NVM And Rework Corrections

1. 插件必须在 macOS 自动解析本机 NVM，并同时支持自动选择默认 Node 与用户手动选择；手动选择按项目保存，只能从 Host 已验证的 Node 候选中选择。
2. 自动模式优先项目 `.nvmrc` / `.node-version`，再使用 NVM `default`、其它已安装 NVM 版本和受控系统 Node。项目显式版本无效或未安装时拒绝执行；用户可用项目级手动选择明确覆盖。不得 source `nvm.sh`、依赖 GUI PATH、自动下载 Node 或接受任意路径。
3. 上一节第 3 项“执行 cwd 固定为项目根”被本项纠正：Environment 配置仍从唯一 `configRoot` 读取，但任务 Action 必须在别名保存的 exact task/worktree `executionCwd` 执行；managed worktree 不要求位于配置根内。
4. Action Runner 使用自绘标题栏；关闭按钮与 `Command/Ctrl+W` 只隐藏，拖动/缩放通过显式 child→Host 协议保存几何，不依赖 uTools 不提供的 BrowserWindow 实例事件。
5. 同一 Lane 新运行必须展开并压缩上一轮；短任务必须发布真实 running 状态。日志脱敏必须跨任意 stream chunk 生效，SQLite 启动时先完成 30 天/数量/容量清理再构造内存历史。
6. 本次“缺失优化”还包括日志 cursor 去重/缺口重同步和批量 flush，以及 Serve 延迟重启失败必须形成安全的失败记录。

## 2026-08-03 Acceptance-Blocker Correction

1. Command gate 不再按字符串前缀判定。只有完整 argv 为 `pnpm|npm|yarn|bun run build|serve`、`vite build|serve` 或 `git push` 才能进入 catalog；flag、额外 positional、`$()`、`&`、管道、换行和 Git ref/force 全部拒绝，启动计划只接收该结构化结果。
2. Environment TOML 的 `version` 原始 token 必须严格为裸整数 `1`；`"1"`、`1.0`、`1e0`、`01` 均无效。Host 与纯 Domain parser 必须同判。
3. Action Host 暴露独立 runtime revision；新 Controller 遇到缺失、旧版或不一致的 Preload 时显示“需重载”并拒绝 catalog/run，不能混用旧安全边界。
4. Host 生成并校验 `targetId`。项目目标继续等于 `projectKey`，保持既有 Lane/SQLite 身份；task 目标使用 `projectKey + canonical executionCwd` 的 Host 摘要。vault、session、confirmation、run/stop lane 全部按 `targetId + environmentId + actionId` 隔离。
5. Action catalog 提供 tasks-only preflight：功能启用时可绕过 Codex Tab/Float 可见性门禁，但不读取额度、不启动轮询。catalog 激活与每次运行前刷新短期 alias；`stale-alias` 最多重建并重试一次，随后 fail-closed。
6. Runner 必须在异步 preflight 前同步显示 loading/error。Action Runner 与五槽保持当前主窗口 Tab，并由 `plugin.json.mainHide` 管理入口可见性，不再安排 Renderer hide。
7. 五槽 Environment 权威为 Host 持久化的 `selectedLaneId`：无历史时才使用优先项目第一个 Environment；有效选择在优先项目内时使用该 Environment 的同序号 Action；跨项目、失效或缺槽均不回退，Runner 显示修复提示并拒绝执行。
8. `onPluginOut(false)` 只表示普通后台隐藏，不停止 Action；Runner 可见或 preflight/run 未结束时延后会清空 alias 的 server close。`onPluginOut(true)` 才执行进程结束收口：取消 pending restart、framing/flush、持久化 `interrupted`、清理 session/vault/confirm 后发送非强制终止。
9. POSIX 对进程组发送 `SIGTERM`；Windows 使用 `taskkill /PID … /T` 且不带 `/F`，失败只回退 direct-child `SIGTERM`。正常 stop 持续为 `stopping` 到真实 exit，全路径禁止自动 `SIGKILL`。
10. 本轮最高接纳状态为 `automated-verified / host-pending`；真实 uTools、Windows 进程树、真实 Build/Serve/Git Push 和长期 Serve 继续由宿主验收。

## 2026-08-03 Shortcut-Latency Correction

1. 用户指出各类快捷键反应过慢。普通 `mainHide/onPluginOut(false)` 不得关闭 App Server 或清空 project/task alias 与 latest-Turn cache；真实 kill、feature disable 和显式 Controller close 仍完整清理。
2. Runner/五槽只在首次没有 verified inventory 时执行 tasks-only preflight；已有项目 alias 先由 Host 精确校验，只有明确 `stale-alias` 才重建一次。每次 Action 执行仍重新读取 TOML、复核 target/config/command fingerprint，缓存不替代安全门禁。
3. 只执行影响项验证；真实连续快捷键时延仍由重载后的 uTools 宿主验收。

## 2026-08-03 Incremental Catalog Correction

1. 任务/项目物化库存必须在 Codex feature 启用期间持续更新；主窗口 Tab 或 Float 显隐只影响额度/config，不得清空 Runner 可复用的 verified inventory。
2. Runner catalog 以 project key + 当前 action alias 分片。冷启动可逐项目发布；新增项目只加载新增分片，alias 变化只失效该项目，删除项目清除对应分片，并发读取同一项目只能共享一个请求。热打开不得重读未变化项目。
3. 该 catalog 仅用于展示/选择/快捷定位；每次 Action run/stop 仍由 Host 重读并校验当前 TOML、target identity 与 command fingerprint，缓存不扩大执行授权。
