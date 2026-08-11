# 额度任务悬浮球

额度任务悬浮球：在独立 Tab 配置外观与快捷方式，用桌面悬浮窗查看额度与近期任务状态，并通过统一任务动作内核打开或归档 Codex/Claude 会话。

**默认状态：** 启用。首次启用后会做隐私最小化的环境检测（即使当时未打开 Codex Tab）。

## 入口

- 主窗口 **Codex** Tab
- uTools：`eypc-codex` 及相关全局功能（显示/隐藏悬浮球、直接展开卡片、待输入、已完成未读、上一个/下一个任务、归档当前任务等）
- 插件内默认：`Ctrl+Alt+Q`（macOS 常为 `Command+Option+Q`）切换悬浮球；`Ctrl+Alt+Enter` 显示并展开卡片
- **Action Runner / Environment Action 槽 1–5**：都可在 Codex「快捷方式」里点「去设置」，到 uTools 全局功能绑定系统级快捷键；Runner 入口只展开工作台，槽位入口会展开、定位并执行

## 配置页分区

顶部导航（同一时间只渲染当前分区）：

1. **快捷方式** — 打开 uTools 绑定页或执行入口；**不读取、不回显**宿主当前快捷键绑定
2. **任务** — 任务列表展示相关选项（滚动窗口天数、动态小时数与默认 Action 项目等）
3. **水球** — 紧凑悬浮球外观与读数
4. **卡片** — 展开面板主题（与水球配色独立）
5. **运行** — 环境诊断、连接状态、额度自动刷新秒数、明文运行诊断日志，以及 **接入来源**（Claude Code 开关、事件钩子注册、Claude App 额度只读授权）

说明性细节多用可聚焦的「i」提示，避免整页永久展开大段说明。

## 悬浮球与展开卡片

- 紧凑水球：显示额度读数与角标计数（待输入 / 进行中相关 / 已完成未读等；为 0 的角标会隐藏，超过 99 显示 `99+`）
- 同时接入 Codex 与 Claude 时，水球外圈进度表示 Codex 周额度、球心百分比表示 Claude 剩余额度并在下方标注来源；只接入其中一方时，该方独占整个水球，读数含义与单接入时完全一致
- 上半可点计数区、下半拖动区等分区以当前界面为准；展开后进入任务卡片
- 展开卡片内任务 Tab：**动态 / 已完成 / 已隐藏 / 项目**
- 「项目」内还有会话级来源筛选：**全部 / 只显示 Codex / 只显示 Claude**，默认全部；筛选会同时过滤项目内任务并重算项目数与任务数
- 额度后直接进入来源状态与任务内容；展开卡**不显示** Actions/Environment 卡槽、选择层或 Setup 提示
- 额度区是**一行**（固定 `min-height: 30px`），无论接入几个来源都不增减行数：每个读数是一个短标 + 百分比的小块（`5h` / `周`，Spark 前缀 `S`），同时接入两个来源时中间有分隔线与 `Claude` 平台标
  - 悬停 200ms 才显示完整含义与重置时间（`Codex · 5 小时限额 · 3 小时后重置`；只有一个来源时省略平台前缀）；Claude 额度块也可用键盘聚焦并在 200ms 后显示同一提示，读屏会读出剩余百分比、绝对/相对重置时间与新鲜度
  - 每个来源的颜色是展开卡主题里可配置的 token（配置页「卡片」分区 → 额度读数），默认按主题自动取一个与健康色区分度足够、且对卡片底色对比度达标的色相
  - 浮窗很窄时先隐藏 `Claude` 平台标（颜色与分隔线保留），读数一个都不会丢；系统强制高对比度模式下平台色失效、平台标重新出现
  - Codex 额度块保持原有非聚焦行为；Claude 额度块因需要核对动态 scoped/Fable 窗口而进入键盘焦点顺序
- 点击其它位置、指针/焦点离开时约 220ms 自动收回水球；编辑器、详情/抽屉、Quick Jump、预览或调整尺寸期间会暂缓
- 外观：内置多套主题；水球与展开卡片可分别配置；对比度不合法的配色会被限制

## Environment Action

- **独立 Runner：** Environment Action 不出现在 Codex Float 内。打开 `Action 执行工作台` 后，左侧按项目组织 Action；单 Environment 省略中间层，多 Environment 显示 `项目 → Environment → Action`
- **执行记录：** 右侧显示所选 Action 的实时脱敏输出、时间戳及完整项目/Environment/Action 归属；新执行自动展开并把上一轮压成一行，结束记录可手动归档和恢复
- **窗口：** 自绘标题栏支持拖动、四角缩放、置顶与隐藏；关闭按钮或 `Command/Ctrl+W` 只隐藏，不停止正在运行的 Action。`F` / `Shift+F` 可跳转当前可见操作
- **目标：** Controller 先使用 Codex 配置里的 **Action 默认项目**，未配置时回退到当前置顶/最近项目候选；Float 不另存项目或 Environment 选择状态。Runner 会先显示加载/修复消息，再在后台完成一次 Action-only 目标校验
- **全局快捷键：** Codex「快捷方式」可分别为 Runner 和 1–5 槽「去设置」；绑定 uTools 全局功能 `打开 Action 执行工作台` / `Codex Action 槽 N`。卡内 `Ctrl+Shift+1…5` 也只派发同一 Controller 命令
- **多 Environment：** Runner 左树可精确选择 Environment/Action，并由 Host 记住选择。目标项目从未选择过时，五槽才默认第一个 Environment；已有选择跨项目、已失效或缺少同序号 Action 时会拒绝执行并提示修复，不会静默回退。展开 Float 不提供 picker
- **项目 Node（macOS）：** 默认自动读取项目 `.nvmrc` / `.node-version`，再尝试 NVM default、其它本地 NVM 和受控系统 Node；也可在 Runner 为项目手动选择已验证候选。显式版本未安装时会拒绝执行并提示，不会静默换版本、source shell 或自动下载安装
- **Setup：** 不进入可执行命令，不会执行
- **命令边界：** 只接受不带任何 flag/额外参数的 `pnpm/npm/yarn/bun run build|serve`、`vite build|serve` 或 `git push`；TOML 必须写裸整数 `version = 1`。若 Runner 提示 Action Host 版本过旧，请正常重载插件后再执行
- **Serve：** 由 Host 管理长驻会话；重新执行时先 SIGTERM、等待真实退出，再重新读取配置和运行时。停止不会自动升级 SIGKILL
- **Git Push：** 外部写入，需 30 秒内再次确认；确认只对当前项目/worktree、Environment、Action 与当前配置有效
- **隐藏与退出：** 普通隐藏插件或 Runner 不会停止正在运行的 Action；真正结束插件进程时，未结束记录会先保存为 interrupted，再使用非强制终止。Windows 会尝试停止该 PID 的进程树，但不会使用强制 `/F`
- 界面不展示路径、命令原文、PID、环境变量或未脱敏输出；执行历史只保存安全投影，保留上限为 30 天、200 次、100 MB
- 默认项目在主窗口 Codex → **任务** 中配置；选「不配置」时使用置顶/最近项目回退

## 任务行为（用户可见）

- **动态：** 展示近期（按最新 Turn 活动，默认 24 小时内）的非隐藏任务与状态分段；可在 Codex → **任务** → **动态时间筛选（小时）** 修改范围。先按「待输入 → 进行中 → 待继续 → 已完成未读 → 已完成」分组，每个分组内一律按最近提问时间倒序；时间相同时才用创建时间与匿名 key 稳定排序。置顶和 Codex/Claude 来源不改变组内顺序。
- **刷新机制：** 任务状态优先使用可信的原始推送直接进入独立的成员、phase、unread lane；正常推送不读取额度、环境或全量任务。完整任务盘点只在冷启动、重连或明确发现成员缺口时触发，并且只读取所需 Provider。任务库存、卡片、操作、导航、mutation 和 Claude 会话读取都不设固定总条数上限；Codex 每页 `100` 只是协议分页大小，必须读到 cursor 结束。页面不再提供手动全量刷新、完整校对周期或 `Ctrl+R`。环境检测与 Claude 单任务同步保留为各自的定向操作。额度自动刷新默认 300 秒、最小 1 秒；旧值 `0` 自动迁移为 300 秒。
- **待输入：** 含普通问题、需确认的 Plan，以及命令执行、文件修改、权限申请和 MCP 提问审批；标签仍区分“等待输入 / 等待审批”。全局入口按最新状态优先，连续触发会依次打开尚未成功打开的当前状态实例；处理中若有更新任务会先插队，随后继续旧队列。EyPc 只打开原任务，绝不会代你批准、拒绝或提交请求。实时 Desktop 请求优先；原请求 owner 已结束而 Desktop 无法重放时，只允许受限证据恢复未回答输入或待实施 Plan，普通连接器提示与 Access 配置不会伪造待输入。没有真实待输入时，仍回退 EyPc 本地置顶；该回退不计入角标或打开进度。
- **已完成未读：** 同样按完成状态出现时间从新到旧依次打开；成功打开（含列表手动打开）才推进，失败不推进。全部当前项都打开后，下次从最新项重新开始；进度跨 EyPc 重载保留，新 Turn 完成会成为新的未打开实例。成功 Deep Link 仍把当前任务标为本会话已读，但不写 Codex 原生状态
- **待继续：** 内部仍是 stopped，但卡片和动态分段统一显示“待继续”；不新增顶层 Tab、角标或待继续专属快捷入口。精确 `interrupted/user-stopped` 在没有更新 waiting/active 时立即进入待继续，不再要求 Desktop idle。冷启动或重连只为冲突任务 single-flight 精读一次最新 Turn；若仍无法确认，则保留该任务最后稳定分组并轻量显示“核验中”，不会强制改成进行中，也不会凭时间猜终态。新 active epoch 会立即恢复进行中。
- **待输入热同步：** 请求出现与移除、匹配的 `serverRequest/resolved`、回答后的 matching output、用户继续和新 Turn 都走同一个双向状态通路。新 active/Turn-started 会立即清除它之前的等待；旧快照、已读变化、重新订阅或 rollout 重放不能把已解除状态重新放回。解除后真正出现的新请求仍会立即进入待输入。未匹配的 resolved 只复核这一条任务，不会误清并发审批。正常事件目标为 Controller 发布 P95 不超过 250ms；漏一次 Activity 或 rollout 文件通知时由 1 秒 watchdog 在 1.25 秒内补回。revision/owner/载荷缺口只重订该任务，失败时保持现状并提示降级，不按超时猜测已解除。
- **状态时机：** 新 Codex membership 一到便用稳定 key 建立最小卡片，随后 Codex-only 补读标题和项目并原位更新；不再等待完整元数据或下一次全量刷新。唯一进程 Reducer 按因果水位处理 waiting、active、completed、interrupted、failed 和 unread；`phase` 与 `unread` 独立，同一 completion epoch 的未读会一直保留到明确已读回执或新 Turn。可信事件在同一事件循环合并、下一帧发布，目标 P95 不超过 100ms；只有 unknown 最多核验 250ms。等价 observation 是完整 no-op，不增加任务/包 revision、不发 Float/focus、不重算角标。普通 inventory 缺一行只进入缺失确认，不会让任务消失。
- **切换任务：** 在 Codex Desktop 中切换任务只会改变 Desktop 当前关注对象；EyPc 会继续续订仍在任务池中的上一任务，不会让待继续任务重新进入进行中角标。若切换恰好与上一任务完成同时发生，即使 Desktop 短暂回放旧 active，EyPc 也会对该任务做一次有界的最新 Turn 校对，用明确 completed 同步完成分段与角标；校对期间若收到更新的进行中证据，旧校对结果会失效。Side Chat 会校对实际子任务并把活动、待输入与未读聚合回父任务。仍在运行或读取失败时继续保守显示进行中。完全退出 Codex、归档或任务确实离库时，仍按对应权威边界清理
- **多分支与诊断：** 一个 Side Chat 结束时，如果主任务或另一个 Side Chat 仍在运行，父任务继续显示进行中，不会被单个分支的晚到终态改成待继续/已完成。「运行」与“设置 → 维护”共享 `eypc-runtime-diagnostics-v3` 的启停和 `error / info / debug`。当前未手动配置者默认开启 `debug`；显式选择永久保留。明文 JSONL 记录精确 operationId/taskRef、Provider 状态、水位、revision、缓存、路径、动作/归档阶段和耗时，8 MB/文件、64 MB 总量、保留 14 天；不记录提示词、对话正文、命令/工具参数、stdout/stderr、凭据、堆栈或隐藏推理。探针可按 session/operation/trace/provider/taskRef/scope/event/level/since/tail 查询，并聚合状态变化、no-op、快捷键、跳转、归档阶段和错误。
- **悬浮窗自恢复：** Main 每 2 秒检查 Float 心跳；连续超过 6 秒无响应时，只在 60 秒冷却外且确认旧窗口 10 秒恢复观察仍失败后受控重建。每次交互都有匿名 interaction id，10 秒无活动、失焦或生命周期结束会清理，避免拖动/展开锁长期卡死。
- **版本提示：** `task-state-v9` 只表示 Codex Provider 输入兼容；唯一最终权威是 `companion-task-kernel-v3`，Main/Float 共用 `companion-task-package-v3`。V3 分离 Provider observation generation 与用户可见 semantic revision，并原子派生卡片、Tab、项目、分组、角标、循环、焦点和归档能力。旧 V1/V2 包 fail closed；四端身份不一致时明确要求重新接入或重载并停止任务操作。
- **构建与实际加载：** 重新打包只生成新的 `dist`，状态是 `artifact-ready`；它不会自动替换 uTools 已加载的 ASAR。开发模式请在 uTools 开发工具重新接入 `dist/plugin.json`，手动结束旧插件后台进程后重新进入，再重开悬浮窗并确认四端身份一致；离线包需安装新的 UPXS。只有身份握手一致才是 `host-loaded`。
- **归档：** Codex 归档中卡片和按钮始终保留并显示“归档中”。一次 Provider RPC 成功、即时未归档列表缺行或 Desktop 消息发送成功都不会隐藏任务；只有一次写、两次服务器持久化确认，以及 Desktop 已连接时匹配任务的原生 `thread/archived` ACK 全部通过后，Kernel 才 commit 并原子移除所有消费者。sync 失败、ACK 超时或两次核验矛盾会保留卡片、恢复按钮、自动定向核验，并在主窗口、Float 和 uTools 提醒中附短 operationId。Claude completed/stopped 任务仍走 D′ 单目标元数据归档；成功只表示 EyPc 已归档并从 EyPc 列表移除，提示会同时说明 Claude 原生侧栏可能仍待刷新、当前尚未确认同步。EyPc 不强刷或伪造 Claude 原生侧栏收敛；项目级「归档已完成」仍只处理 Codex 已完成任务。
- **归档当前任务快捷调用：** `eypc-companion-archive` 保持 `mainHide`，不切换当前 Tab。第一次只展示目标并开启 5 秒确认；确认身份固定为 `Provider + task + terminalEpoch`，revision、unread、焦点或临时 alias 变化不会让第二次点击消失。第二次从最新包读取 capability 并使用同一个 operationId 贯穿十阶段归档日志；任务消失、terminal epoch 或能力变化才取消。
- **上一个 / 下一个 Codex 任务：** 按独占优先级循环：先普通待输入/待审批，再 Plan 实施确认，再近期非隐藏进行中，最后回退未停止的 EyPc 本地置顶任务；每一层都按最近提问时间倒序，Provider 与置顶不改序。第一下按键立即派发，不再固定等待；只有首个打开仍在执行时，后续连按才合并为一个最终尾随目标。手动卡片与 attention 打开会取消未派发尾随目标，所有 Provider 共享并发 1。热包直接使用最原始快速路径；仅冷启动、重连或明确缺口才执行一次 tasks-only 预检，600ms 提示进度、5 秒超时且禁止部分集合误跳。Renderer 从未挂载也能切换，之后 Alt+Tab 不会补触发。

列表不展示任务正文；预览与详情也只含隐私安全字段（名称、项目、状态与时间等），不含路径、原始 ID、正文。

## 数据与平台边界

- **额度、模型、任务清单：** 来自本机 Codex App Server 连接（只读库存为主）
- **实时待输入 / 进行中 / 完成未读细分：** 优先依赖 macOS 上 Codex Desktop 实时桥；桥无法重放旧请求时，只允许本机 Codex 会话中经过结构化、有界复核的未回答输入或待实施 Plan 恢复“待输入”。普通连接器状态、本地 UI 缓存、正文或时间推测都不能伪造 Input/进行中；无法确认的新证据保留任务最后稳定分组并显示“核验中”。
- **Windows：** 支持 CLI 发现与校验；Desktop 实时桥仍以 macOS 能力为准，Windows 上实时细分可能不可用
- 普通库存扫描对 Codex 全局状态文件保持只读；Codex 唯一写例外是你明确确认的原生项目移除事务。Claude 另有版本门禁、单目标、可回滚的 `isArchived` 静默归档例外，禁止扫改、LevelDB 和非目标会话
- Easy Agent 尚未实现；当前为 App Server +（macOS）Desktop 桥的过渡方案

## 常用配置步骤

1. 确认功能已启用；打开 Codex Tab 查看「运行」诊断。
2. 在「快捷方式」为常用全局动作到 uTools 里绑定系统快捷键。
3. 在「任务」按需修改动态时间筛选；在「运行」修改额度自动刷新秒数，并按需查看明文运行诊断。
4. 在「水球 / 卡片」调整外观，预览与桌面悬浮共用同一套渲染逻辑。
5. 显示悬浮球后，用角标或展开卡片处理待输入与未读；需要时用上一个/下一个任务循环。
6. 如需项目 Action，在「任务」配置默认项目或置顶常用项目，打开 Action Runner 检查项目 Node 并选择需要的 Environment，再通过 Runner 或五个全局功能执行（以该项目 TOML 为准）；若 Runner 提示目标或版本需修复，先处理提示。展开 Float 不显示 Action 卡槽。

“进行中离开稳定窗”已取消：普通快照、完整完成通知、缓存结果和 active 退出后的定向核验，只要通过同一 Turn revision/status 门禁都会立即同步。旧的 0.5–3 秒保存值已不进入当前运行设置，下次正常保存时会自然淘汰。已接受的完成同时关闭本次活动周期，后续相同快照不会将它反判回进行中。首次 active snapshot 冲突核验、完整清单校对和任务缺行保护仍保留。

插件内 Codex Tab 另有 `Ctrl+T`（默认）在当前高亮会话或项目中新建会话（受 Tab/输入层约束）。

## 风险与边界

- 普通界面和可同步存储不暴露原始会话 ID、路径、URL、Token、提示词、命令输出或正文；本机安装诊断 JSONL 可按当前调试合同保留精确 taskRef、运行路径、状态和水位，但仍禁止内容正文、凭据和隐藏推理。
- 破坏性操作（如归档、项目移除、Git Push）需要确认；失败不会乐观删行。
- Action 是 EyPc 等价执行，不会调用不存在的 Codex 原生 Action API。
- 动作后隐藏插件时，不会为了切 Tab 或 Renderer 重建而清掉通用循环的进程级位置与热目标；功能停用、来源变化和进程退出仍会清理。

## 与其它功能的关系

功能总开关在 **设置 → 功能开关**。通用快速跳转在 Codex 子窗有本地变体；主插件 `F` 跳转习惯见 **设置** 说明。

## 接入 Claude Code（可选）

Codex 与 Claude Code 是两个彼此独立的来源，可各自开关，也可同时开启共享同一个水球。**默认只开启 Codex**，此时插件完全不读取任何 Claude 数据。

> 2026-08-09 状态：额度权威、状态代际、旧任务 Stop→SubagentStop 终态纠正、单项真实同步、已读回跳、虚拟项目筛选、归属视觉和 Claude D′ 静默归档代码均已落地。D′ 自动化验证与最终构建结果以任务 verify 为准；真实可丢弃会话 canary 必须另行确认，permission / AskUserQuestion / 响应、旧任务点击同步、手动 App 归档快速移除、未读进出集合、标题/重启、混合项目筛选和 uTools 同屏视觉仍需验收。

### 已确认的 Code-mode 合同

- **只显示 App Code 会话**：库存来自 `claude-code-sessions`；CLI-only、Cowork 和其它桌面会话不显示。名称使用 App 标题，空标题显示 `General coding session`，不显示 UUID。
- **状态互斥且可恢复历史**：兼容版本的 App 精确日志优先，唯一 official Hook 次之，`completedTurns` 恢复无更新 active 证据的历史完成；证据歧义显示 unknown。一张卡只进「待输入 / 进行中 / 待继续 / 已完成未读 / 已完成」中的一个分组。
- **旧任务不会被子代理尾事件复活**：只有新 Prompt 开启父 Turn；Stop 后的 SubagentStop、工具或 SessionEnd 尾事件不能把已完成任务重新显示为进行中。App 明确完成优先同一轮 Hook 尾事件。
- **未读精确镜像 + 同轮次防回跳**：从 App Local Storage 私有 LevelDB 快照读取 exact tagged `epitaxy-unread-v1`，复制前后指纹一致才接纳。成功打开一个已完成任务后，EyPc 仅为同一次完成在本进程立即显示已读并做四次有界原生复读；迟到旧 unread 不会回跳，新一次运行/完成仍可重新未读。失败跳转不确认，不写 Claude App，也不持久化。
- **全局热缓存**：Claude 启用后，库存、状态、未读、额度和 App presence 跨页面/悬浮窗持续更新且相互隔离；状态事件即时读取并有 1 秒补漏，两轮连续失败会从进行中降为未知，旧 generation/revision 不会覆盖新状态。精确会话文件变化只重读已登记目标并直接发布 membership delta；额度或完整库存请求卡住不会拖慢任务状态/归档移除。插件重启重新读取真实来源，不恢复旧 live phase。
- **可单独同步真实状态**：Claude 任务的更多操作里可点“同步 Claude 状态”；成功打开任务后也会静默同步一次。它只重读真实 state/unread，可分别提示部分失败，不是人工“标完成/标已读”，也不会写 Claude App。Codex 任务不显示此操作。
- **只打开仍有效的原历史且连续按键收敛**：缓存已运行 App 的进程代次，上一个/下一个直接从全局缓存选取，连续操作只派发最终 Epitaxy 目标；打开前重新确认唯一目标仍存在且未归档，已归档/缺失/歧义时不会再 Deep Link；不使用 `resume/import`、CLI、标题点击、自动启动或未读写入。
- **重复行不擅自清理**：App 已有多少 Code 行就展示多少；共享 CLI id 且无法唯一关联时只把状态标为未知。
- **额度显示全部窗口**：在「运行」显式开启“允许读取 Claude App 额度”后，只读 App 加密缓存；5 小时、全模型周、Fable/Fable 5 或未来模型周限额按上游动态展示，两窗口补充样本不能抹掉 scoped/reset。401/403 等待凭据变化，429 遵循 Retry-After，其它失败按 1m/5m/15m/每小时退避；旧值保留但标为可能过期，200ms 提示展示绝对/相对 reset 和新鲜度。令牌不会进入界面、诊断或持久化。
- **虚拟项目与归属**：EyPc 不改 Codex/Claude 原生项目；相同路径优先合并，只有双方名称都唯一时才按名称合并，歧义重名分开。Claude-only 项目会进入项目区，共享项目在“全部”只出现一次。所有行显示“归属 Codex/Claude/共享”，并有轻量来源背景。Claude completed/stopped 的任务级静默归档仅在上述 App 版本与唯一文件门禁下可用；Claude 项目级归档、移除和移动仍禁用并说明。

详细选择、技术依据和本地验收顺序见 [Claude Code Companion 权威重置](../../../vibe/specs/260807/claude-code-companion-authority-reset/spec.md#L1) 与 [本地通信调研](../../../vibe/specs/260807/claude-code-companion-authority-reset/research.md#L1)。

### 当前验证边界

- Code-only 标题/历史、App log 版本门禁、Hook 唯一关联、LevelDB 精确键、authority lane 隔离、blocked quota 下状态发布、Epitaxy singleflight/no-clone 和动态 N-window 合并均已有确定性测试。
- D′ 已由定向文件事务测试覆盖：completed/stopped、幂等已归档、平台/版本/phase/身份拒绝、零 Deep Link/AX/exec、非目标与 LevelDB 不变、并发写保护、安全回滚、无 App 日志成功、精确 watcher 与一秒补漏。真实 canary 未经单独确认不会执行。
- 最新 RAW-024 本机探针观察到 27 条 Code 元数据，其中 0 running / 24 completed / 1 stopped / 2 unknown，25 条由 Claude App 日志直接确认；uTools unread reader 此前 30/30 成功。此前十次连续跳转只派发最终目标且没有新增元数据行。探针不输出会话身份、标题、正文或凭证。
- 当前 unread 样本稳定包含 1 条，已证明真实 membership 可读且无快照泄漏；仍需在 EyPc 点击该任务后核对原生小点移除、同轮不回跳和下一 completion 可再未读。真实 App quota 已以 HTTP 200 读到 5h、总周和 Fable scoped 三窗口及 reset，但最终 uTools 同屏仍需人工核对。
- 仍需在正常插件重载后核对真实 permission/input/response/completion/unread/title/restart、共享/单来源/歧义项目三筛选和高对比度视觉。实现与剩余门禁以任务 [verification](../../../vibe/specs/260807/claude-code-companion-authority-reset/verify.md#L1) 为准。
