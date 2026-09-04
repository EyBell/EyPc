# 额度任务悬浮球

额度任务悬浮球：在独立 Tab 配置外观与快捷方式，用桌面悬浮窗查看额度与 Codex/Claude/Cursor 根任务状态，并通过 V6 统一命令打开或归档任务。

**默认状态：** 启用。首次启用后会做隐私最小化的环境检测（即使当时未打开 Codex Tab）。

## 入口

- 主窗口 **Codex** Tab
- uTools：`eypc-codex` 及相关全局功能（显示/隐藏悬浮球、直接展开卡片、快速任务查看、待输入、已完成未读、上一个/下一个任务、归档当前任务等）
- 插件内默认：`Ctrl+Alt+Q`（macOS 常为 `Command+Option+Q`）切换悬浮球；`Ctrl+Alt+Enter` 显示并展开卡片；`Ctrl+Alt+K` 进入快速任务查看
- **配置入口：** Codex「快捷方式」为每一个全局功能各提供一行「去设置」——悬浮球开关、直接展开卡片、快速任务查看、待输入、已完成未读、上一个/下一个任务、归档当前任务、Action 执行工作台、Action 槽 1–5。每一行配置的都是它自己那条功能
- **Action Runner / Environment Action 槽 1–5**：Runner 入口只展开工作台，槽位入口会展开、定位并执行

## 配置页分区

顶部导航（同一时间只渲染当前分区）：

1. **快捷方式** — 打开 uTools 绑定页或执行入口；**不读取、不回显**宿主当前快捷键绑定
2. **任务** — 任务列表展示相关选项（滚动窗口天数、动态小时数与默认 Action 项目等）
3. **水球** — 紧凑悬浮球外观与读数
4. **卡片** — 展开面板主题（与水球配色独立）
5. **运行** — 环境诊断、连接状态、额度自动刷新秒数、明文运行诊断日志，以及 **接入来源**（跳转前确保目标应用已打开、通过 CodexHost 打开 Codex 与 codexhost 命令位置、Claude Code 开关、事件钩子注册、Claude App 额度只读授权、Cursor Agent 冷库存开关）。事件钩子注册一次即可，关掉或重开插件不会卸掉；配置页会在启动时回读，不必每次再点注册。

运行分区顶部在正常就绪时只显示一行诊断标题、可聚焦的「i」和「重新检测」；健康状态下的系统/进程等噪声项默认隐藏，CLI 路径与操作按钮同一行。自动刷新或重新检测若已有成功结果，顶部连接药丸和诊断文案保持上次稳定状态，只在按钮/药丸上表示忙碌，不会闪成「正在读取 / 正在核查」。异常（失败、超时、桌面未运行）仍会立即改写文案，并展开详情与全部分项。其余分区说明仍用可聚焦的「i」，提示走主窗口不透明顶层气泡。

## 悬浮球与展开卡片

- 紧凑水球：显示额度读数与角标计数（待输入 / 进行中相关 / 已完成未读等；为 0 的角标会隐藏，超过 99 显示 `99+`）
- 同时接入 Codex 与 Claude 时，水球外圈进度表示 Codex 周额度、球心读数表示 Claude 周限额剩余并在下方标注来源；只接入其中一方时，该方独占整个水球，读数含义与单接入时完全一致。账号读不到普通周限额时，球心才退回 5 小时限额（再退回其他已上报窗口），不会留空
- 账号同时有按模型周限额（如 Fable）时，球心并列显示 `Fable 剩余/普通周剩余`，例如 `79/45`：两个百分号在球里放不下，所以只留数字，字号会自动缩小以容下两个读数（你在「水球外观 → 文字大小」调大调小仍然有效，只是并列时不会撑出球体）。想看每个窗口的完整名称、剩余与重置时间，展开卡片的额度区仍逐条显示
- 任务行左侧状态图标：普通点击仍是切换选择。若该行显示「状态未知」，`Cmd/Ctrl+点击`会打开状态菜单，可手动标记为进行中／等待输入／等待审批／已完成／待继续（右键抽屉里也有同样的条目）。手动状态会保存并跨重启保留，但只在这一段未知期间有效：一旦读到真实状态即以真实状态为准，任务之后再次变成未知也不会套用旧的手动标记。已有真实状态的行不能手动改写
- 上半可点计数区、下半拖动区等分区以当前界面为准；展开后进入任务卡片
- 展开卡片内任务 Tab：**动态 / 已完成 / 已隐藏 / 项目**
- 「项目」内还有会话级来源筛选：**全部 / 只显示 Codex / 只显示 Claude**，接入 Cursor 后多一项 **只显示 Cursor**；默认全部；筛选会同时过滤项目内任务并重算项目数与任务数
- 搜索框左侧默认是放大镜。数据过期、预检失败、兼容降级或 Claude 钩子/状态栏缺口时换成 `!`，悬停约 200ms 显示原因；框内左侧提示是「别名|任务|项目」，右侧是「最近 N 天的 M 条」。窗口太窄两边会重叠时，左侧提示让给右侧，改由左侧图标悬停展示
- 额度后直接进入任务列表；展开卡**不显示** Actions/Environment 卡槽、选择层或 Setup 提示
- 额度区是**一行**（固定 `min-height: 30px`），无论接入几个来源都不增减行数：每个读数是一个短标 + 百分比的小块（`5h` / `周`，Spark 前缀 `S`），同时接入两个来源时中间有分隔线与 `Claude` 平台标
  - 悬停 200ms 才显示完整含义与重置时间（`Codex · 5 小时限额 · 3 小时后重置`；只有一个来源时省略平台前缀）；Claude 额度块也可用键盘聚焦并在 200ms 后显示同一提示，读屏会读出剩余百分比、绝对/相对重置时间与新鲜度
  - 每个来源的颜色是展开卡主题里可配置的 token（配置页「卡片」分区 → 额度读数），默认按主题自动取一个与健康色区分度足够、且对卡片底色对比度达标的色相
  - 浮窗很窄时先隐藏 `Claude` 平台标（颜色与分隔线保留），读数一个都不会丢；系统强制高对比度模式下平台色失效、平台标重新出现
  - Codex 额度块保持原有非聚焦行为；Claude 额度块因需要核对动态 scoped/Fable 窗口而进入键盘焦点顺序
  - 点击任一读数块立即强制刷新两个来源的额度（Claude 块也可用 Enter / Space），不必等「额度刷新（秒）」的自动周期；Claude 侧仍遵守 429 Retry-After 与凭据锁。提示末尾的「点击立即刷新」就是这个入口，刷新后额度行上会覆盖显示 8 秒的结果（例如「Claude 周额度已更新（含 1 个模型周窗口）」或「Claude App 读取失败：凭据不可用，15 分钟后可再试」），提示也会变成「读数刚刚更新」。已授权读取 Claude App 额度但读不到时，即使还显示着本地缓存的读数，Claude 那一组旁边会多一个「!」标记，悬停或读屏能看到原因。Claude App 额度接口每分钟最多问一次，「额度刷新（秒）」调得再低也只加快本地缓存车道
- 点击其它位置、指针/焦点离开时约 220ms 自动收回水球；编辑器、详情/抽屉、Quick Jump、预览或调整尺寸期间会暂缓
- 外观：内置多套主题；水球与展开卡片可分别配置；对比度不合法的配色会被限制
- 启动通路：CodexHost 只在用 `codexhost launch` 启动 Codex 时接管它（以专用环境打开 Desktop）；用 Dock 或深链冷启动的 Codex 不经 CodexHost，额外进程不出现，之后 `codexhost launch` 会拒绝接管。「运行」页的「通过 CodexHost 打开 Codex」为自动检测或开时，EyPc 先经 `codexhost launch` 启动，等 Host 描述符与桌面端 IPC 就绪，再打开任务；找不到 codexhost 命令时拦下不启动，可在同一页填写 codexhost 位置或从磁盘选择。自动检测看三件事：找得到 codexhost 命令、Host 正在运行、当前 Codex 已经 CodexHost 启动。Codex 已在运行时直接打开任务。
- 通过 CodexHost 拉起的额外进程（Pi、Claude Code、OMP、Cursor 等）会出现在同一张任务列表里，重载插件后也会重新读到已有会话，不必等新建或再次跑起来。正在跑或刚创建显示「进行中」；跑完后会进「已完成未读」，不会一直停在进行中。提问/提示显示「待输入」；权限/工具审批显示「待确认」；中断或失败显示「待继续」。这些会话的未读以 Host 为准；你在 Codex 里打开过，或用快捷键跳进 Codex，这里就记为已读，而且这份已读会记在本机：CodexHost 短暂联系不上、插件重载或会话重置都不会把它翻回「已完成未读 · 刚刚」，只有 Host 报出新的状态变化或新的未读才会。官方未读小点仍然管不到这些会话。对这些会话点「归档」会直接走 CodexHost 归档，Codex 侧栏同步收起；正在跑的会话仍然不能归档

## 快速任务查看

一个「打开就能筛、筛完直接开」的入口，形态类似剪贴板管理器的筛选面板。

- **怎么进：** uTools 全局功能绑定 `快速任务查看`（Codex「快捷方式」里可「去设置」）；插件窗口已激活时也可以按 `Ctrl+Alt+K`。全局键即使插件界面没打开也直接生效
- **进去之后：** 卡片展开到「动态」列表，清空搜索词并把光标放进搜索框，前 10 条任务行左上角出现编号
- **筛：** 直接打字过滤；编号跟着筛选结果实时重排，看到几号就按几号
- **开：** `Ctrl+1…9` 打开对应编号任务，`Ctrl+0` 是第 10 条。打开后自动退出筛选模式（`Alt+数字` 同样可用，且不限于筛选模式）
- **不用离开搜索框：** `↑` `↓` 移动当前项，`Enter` 打开当前项，按住 `Shift` 预览当前项 —— 这些在打字过程中同样可用
- **退出：** `Escape` 依次退——先关预览/浮层，再清多选，再清搜索词，再退出筛选模式，最后才收起卡片；`Shift+Escape` 直接把焦点交还给原来的窗口

## 卡片内快捷键

**记一条就够：`Alt` 是「直接打开」。**

- `Alt+1…9` / `Alt+0` 打开列表中对应编号的任务。编号常驻显示在行左上角，随筛选结果实时重排——不需要先进筛选模式
- `Alt+F` 是**专项快捷跳转**：标记只落在展示出来的会话行上，按下标记 = 点击那一行的标题，直接打开该会话
- `F` / `Shift+F` 是普通 Quick Jump 正向 / 反向：标记覆盖卡片里所有可操作控件，落在会话行上时只把高亮移过去
- `Ctrl+F` **聚焦会话搜索**（和端口、收藏、MQTT、窗口跳转一致；`Ctrl+Shift+F` 是同一命令的别名）
- `Ctrl+数字` 有两种互斥释义：**筛选模式下**是「打开第 N 条可见任务」，**操作抽屉打开时**是「执行抽屉第 N 项」。同一组快捷键在不同上下文里含义不同是有意设计，设置页会分别列出
- `↑` `↓` 移动列表焦点（列表非空时一定有一个当前项）；已在首/末项时不会绕回另一端
- `Alt+↑` `Alt+↓` 仍然是本地置顶排序，没有被数字族占用

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

- **动态：** 展示近期（按最新 Turn 活动，默认 24 小时内）的非隐藏、非暂停任务；可在 Codex → **任务** → **动态时间筛选（小时）** 修改范围。按「待输入 → 进行中 → 待继续 → 已完成未读 → 已完成」分组，并按最近提问、创建时间、匿名 key 稳定排序。普通待继续超时后退出；唯一例外是“Plan 已完成、未执行、已确认中断且未暂停”，它会稳定留在待继续分组，但仍受完整库存保留范围约束。
- **刷新机制：** Provider 的可信热事件按 membership、activity、interaction、unread、plan-artifact、metadata、topology 七条独立 lane 提交 V7 原始证据，由同一个进程级 Kernel V7 原子归约并发布 Snapshot；Provider、Controller、Main 和 Float 不再先行计算 phase、分组或计数。普通推送不读取额度、环境或全量任务。冷启动、重连或明确成员缺口时才读取所需 Provider 的冷快照，进程退出后从来源重建。Main 隐藏、Float 关闭或 Renderer 重建都不清任务缓存。任务库存、根卡、命令、导航和 Provider 读取不设产品级总条数上限；Codex 每页 `100` 只是协议分页大小。页面不提供手动全量刷新、完整校对周期或 `Ctrl+R`；额度刷新与任务状态独立。
- **待输入：** 只表示当前仍未解决的普通问题、Plan 选择/实施请求；命令执行、文件修改、权限申请和 MCP 提问审批显示为“待确认”。任何精确当前普通输入、审批或 Plan 请求即使挂在已完成未读任务上，也直接显示“待输入/待确认”，未读只在后台保留；请求关闭后仍未读才回到“已完成未读”，不会把它作为进行中与等待之间的中间画面。全局入口按最新当前 interaction 优先，连续触发会依次打开尚未成功打开的实例；处理中若有更新任务会先插队，随后继续旧队列。同一轮里的旧实例不会因后台更新时间变化而换位，全部成功派发后下一轮才采纳最新列表顺序。EyPc 只打开原任务，绝不会代你批准、拒绝或提交请求。回复、取消或 matching resolved 会在同一 Kernel 事务中关闭对应 interaction 并写入 clear/tombstone；旧快照、read-state 或 refollow 重放不能把它恢复。历史已完成 Plan artifact 本身只形成“待继续”，不会伪造“待输入”。没有真实待输入时直接提示不可用，不回退本地置顶；置顶的待输入任务本来就在这个入口里，置顶不改变它。
- **已完成未读：** 同样按完成状态出现时间从新到旧依次发送打开请求；Host 接受精确 Deep Link 派发后推进本地循环，失败不推进。一轮开始后，已有项不会因后台 `lastQuestionAt` 更新而跳位；新完成实例会插到下一跳之前，随后继续原轮次。全部当前项都派发后，下次才从当时最新项重新开始；循环进度仅在当前插件进程内保留，进程重启后从当前候选重新开始。派发只表示请求已交给系统，界面会提示等待 Codex 原生确认；它不会把当前任务或 Side Chat 标成已读。未读只随 Codex 原生 read-state/持久状态变化，当前始终请求打开主任务，不直达 Side Chat。**真实已完成未读与置顶兜底不会混在同一序列**：只要存在一条可打开的真实未读，连续触发就只在真实未读之间循环，置顶项不会进入缓存或被顺带打开；只有真实未读为零时，才开始循环「置顶」分组。新的真实未读出现会立即中断并清除旧的置顶进度，未读清空后置顶从首项重新开始。置顶任务自身若确属已完成未读，仍按真实未读处理；其他相位的置顶任务继续使用自身状态入口。
- **待继续：** 内部仍是 stopped，但不新增顶层 Tab、紧凑角标或专属快捷入口。普通 interrupted 必须确认主任务和 Side Chat 都已 idle；复核前保留最后稳定状态并显示“核验中”。未执行 Plan 的中断还会定向确认没有更新 Turn、真实活动或其它待决请求；确认后稳定待继续并可突破动态小时窗口。任何更新 active 都优先恢复进行中。待继续任务可直接从行内“归”发起任务级归档，仍需在 5 秒内二次确认；写入前会再次确认同一任务仍是 stopped，恢复运行则取消归档。
- **置顶＝暂存待查：** 任何相位的本地置顶任务都会进入「动态」页最顶部的「置顶」分组，并且只显示一次。这个分组严格按你本地调整的置顶顺序显示；后台更新时间、完成时间和子任务活动不会让置顶项跳位，只有显式 `Alt+↑/↓` 重排才会改变。图钉未置顶时直立，已置顶时斜钉 45°，不只靠颜色；本地置顶仍用警告色，应用置顶用强调色。**动态小时窗口对任何置顶任务都不生效**——不置顶的任务过窗就从动态页消失，置顶的一直留着。置顶只改变列表位置：待输入/进行中/待继续/已完成未读仍按真实状态计数并参与对应快捷入口。置顶标题可折叠：展开时可见任务按当前顺序取得 `Alt+数字`；折叠时任务行隐藏，标题只显示一个“展开”编号，触发它只展开，展开后编号立即重算，不为隐藏任务留空号。`Alt+F` 仍只跳任务。置顶对所有来源一视同仁。**应用里的原生置顶也会进来**：Codex Desktop 侧栏 Pinned、CodexHost 额外进程的置顶、Claude App 的星标、Cursor 侧栏的 Pin 都会自动落到这个分组（本地置顶在前，应用置顶按应用顺序在后）。点 `顶` 时，Codex / CodexHost 会写回对应应用；在 Codex Desktop 或 CodexHost 里置顶/取消也会实时进插件。Claude App 与 Cursor 只在插件里本地置顶，应用里自己置顶后会实时同步进插件，插件不会改它们的侧栏；对应用里已置顶的任务再点 `顶`，是在它上面叠加一层 EyPc 本地置顶（应用取消后它仍留在分组里），再点一次只取消这层本地置顶，应用内的置顶要回应用里取消。`Alt+↑/↓` 只调整本地置顶顺序。Codex 侧栏在 EyPc 置顶后要等窗口重新获得焦点才刷新。
- **隐藏、置顶、折叠与别名：** 除了 Codex / CodexHost 任务点 `顶` 会写回对应应用之外，这些都是 EyPc 本地状态，不修改任何 Provider 任务。Claude App 与 Cursor 的插件置顶也是本地状态。任务隐藏、置顶顺序、项目分组折叠与 alias 持久化；动态「置顶」状态分组的折叠只保留在当前 Float 会话，重开后恢复展开。任务 alias 是 Main/Float 的统一显示名称，Provider 改标题只更新 `originalTitle`，不会顶掉 alias；清空 alias 后恢复最新原始标题。本地 alias 不同步回 Provider，V1 不提供子任务重命名。动态 membership、phase、unread、Provider health 与循环位置不落盘；唯一例外是有界的子任务父子关系提示（仅内部会话标识与观察时间，不含标题、内容或状态，48 小时内最多 200 条），它让插件重载后仍能继续跟踪正在运行的 Side 子任务，关系失效或任务归档时即刻清除。
- **Plan 暂停与执行：** 已完成且可执行的 Plan 是独立 artifact，已读且没有当前 interaction 时显示“待继续”；没有当前 Plan interaction 时，原生未读显示“已完成未读”。若存在精确当前 Plan 选择/实施 interaction，则先显示“待输入”并保留未读；interaction 关闭后按剩余证据回到已完成未读或待继续。暂停后进入“已隐藏”页顶部“已暂停”，并从角标和所有快捷循环移除，刷新、重启或重新关注都不会自动恢复。回复 Plan 选项会关闭当前 interaction：若新 Turn 已开始则立即“进行中”，否则仍有 artifact 就“待继续”，artifact 已取消/移除则“已完成”。更新 default Turn 一旦出现结构化文件变更，就会把旧 Plan 标为已开始执行；该 Turn 完成后按真实未读显示“已完成未读”或“已完成”，不会再被旧 Plan 拉回“待继续”。纯解释、追问或没有文件变更的补充 Turn 仍保留 Plan。取消整个 Plan 必须同时有 interaction 关闭和 artifact `cancelled/removed` 两类证据；request 从数组消失本身不能推断 interaction 已关闭或 artifact 已取消。行级只显示上下文主操作、置顶和 More，暂停、归档与危险操作进入 More/右键菜单；所有入口调用同一个 Command。执行仍需 5 秒内二次确认，Host 会精确预检活动、当前 interaction、任务身份和 artifact revision；模型或原生能力未知只决定执行路线，不单独禁用动作。alias 过期只续签同一匿名 key，超时不自动重发。
- **待输入热同步：** 请求出现、匹配的 `serverRequest/resolved`、回答后的 matching output、用户继续和新 Turn 都走同一个双向状态通路。普通输入、审批与 Plan 请求都在当前 interaction 出现时直接从进行中/终态切到待输入或待确认，关闭时直接恢复进行中或真实终态，不发布临时“已完成未读”。Turn 还没结束时弹出的 Codex Questions、Cursor AskQuestion、Claude AskUserQuestion 同样进待输入，不会留在进行中。对当前 Plan 选择/实施请求，Desktop 只把 requests 数组暂时变成空不算解除；匹配 resolved/cancelled/execution-started、新 Turn 或明确 plain-active runtime 才是关闭证据。新用户补充、thinking/generating、active 或 Turn-started 会立即清除它之前的等待并显示进行中，不需要等到产生实际回复；当因果更新的 App Server running 已胜出时，较旧 Desktop refollow/sticky waiting 不能再次把它拉回待输入。首次出现的 `进行中 + 新请求` 仍是待输入。旧快照、已读变化、重新订阅或 rollout 重放不能把已解除状态重新放回。解除后真正出现的新请求仍会立即进入待输入。未匹配的 resolved 只复核这一条任务，不会误清并发审批。自动化锁定 Kernel 热发布小于 50ms；统一打开路径 P95 小于 200ms。漏一次 Activity 或 rollout 文件通知时才由 1 秒 watchdog 在 1.25 秒内补回。Float 是否真正显示以 applied ACK 为准；revision/owner/载荷缺口只重订该任务，失败时保持现状并提示降级，不按超时猜测已解除。
- **状态时机：** 新 membership 先建立最小成员，再由 V7 Kernel 在同一语义事务里更新根卡、Float、全局角标与循环队列。Topology V2 只提供 root/member 关系；Kernel 独占成员因果、activity、interaction、三态 unread、plan-artifact、能力、分组和计数。公开判定固定为：归档/移除排除 → 精确当前审批/普通输入/Plan 选择与实施 interaction → 因果当前真实运行 → 终止未读 → 仅 Plan artifact 的待继续 → 终止已读 → unknown。任一精确成员仍活动，根任务就不能结束；任何精确当前 interaction 都可在 terminal 或仍在跑的 Turn 上先显示待输入/待确认并保留潜在未读，关闭后才重新显露未读或进行中。旧 generation、旧 terminal、旧 running、旧 refollow waiting 或已越过 clear/tombstone 的 interaction 都不能覆盖更新证据；同 revision 冲突会隔离诊断，不按最后到达者覆盖。一次语义变化只增加一次 Snapshot revision，Main、Float、角标和前后切换都消费同一 revision。
- **切换任务：** 点击、Enter、紧凑角标、全局快捷键和上一个/下一个都提交同一种 `open` Command；Kernel 从当前 Snapshot 解析原根任务，再让对应 Provider Adapter 打开。切换只改变选择，不刷新或修改 phase；打开失败不清 unread。拓扑 revision 已变化时只重校验原任务键，绝不替换成邻近任务。Adapter 失败只降级对应 Provider，不会让其它来源或插件进程崩溃。打开前先经就绪层：目标应用未运行时先启动（Codex 按「通过 CodexHost 打开 Codex」决定经 codexhost launch 还是普通启动；Claude、Cursor 用 `open -b` 起应用），确认进程后再派发，最长等待 25 秒，超时不跳转也不清未读；「跳转前确保目标应用已打开」关闭时回到只发深链。
- **任务拓扑与诊断：** 只有 exact、同 Provider、同 family、父存在、非自身、无环且 generation 不倒退的关系才会聚合，嵌套子任务统一归到根。禁止按标题、路径、时间、模型或界面位置猜关系；无效关系独立显示或匿名隔离。V1 只显示一张根卡、`+N 子任务` 与活动/注意/异常数量，不展示子任务标题、正文或 transcript，也不提供子任务操作。匿名诊断只记录聚合计数、结果枚举、operationId 与会话期 taskRef，不记录原始父子身份或内容。
- **悬浮窗自恢复：** Main 每 2 秒检查 Float 心跳；连续超过 6 秒无响应时，只在 60 秒冷却外且确认旧窗口 10 秒恢复观察仍失败后受控重建。任务 Snapshot 的 applied ACK 超时只重发一次并记录诊断；健康心跳下缺 ACK 不再销毁或重建窗口，避免快速前后切换时把慢渲染表现成“崩溃”。每次交互都有匿名 interaction id，10 秒无活动、失焦或生命周期结束会清理，避免拖动/展开锁长期卡死。
- **版本提示：** 当前为 `task-state-v12 / companion-provider-registry-v1 / companion-task-topology-v2 / companion-task-kernel-v7 / companion-task-snapshot-v7 / companion-task-command-v1 / companion-task-subscribe-v1 / companion-task-ack-v2`。Runtime Identity 同时验证 Registry、Topology、Snapshot、Command、Subscribe 与 ACK；旧 Host、缺方法或任一身份不一致都返回 `reload-required`，不静默降级。
- **构建与实际加载：** 每次 `pnpm run build` 都会重写 `dist/runtime-identity.cjs` 的 `builtAt/builtAtLocal/packageVersion`，它是用于打包的最新 `dist` 凭据；Codex「运行」页同时展示当前宿主实际加载产物的时间与 `host-loaded/reload-required`。重新打包只生成新的 `dist`，状态是 `artifact-ready`，不会自动替换 uTools 已加载的 ASAR。开发模式请在 uTools 开发工具重新接入 `dist/plugin.json`，手动结束旧插件后台进程后重新进入，再重开悬浮窗并确认匿名 `runtime-identity-handshake` 明确报告 `host-loaded`；离线包需安装新的 UPXS。只有实际/期望 Host、Renderer、Kernel 和 Package 身份一致才是 `host-loaded`，不能从源码时间或进程启动时间推断。
- **归档：** 归档资格只看任务状态，不看来源 Agent：进行中（含待输入/待审批）阻止归档，待继续与已完成都可直接归档；仅“状态证据不足（unknown）”暂缓。Codex 归档中卡片和按钮始终保留；只有一次写、两次服务器持久化确认，以及 Desktop 已连接时匹配的原生 `thread/archived` ACK 全部通过后，Kernel 才原子移除。失败或不确定会保留任务并定向复核。Claude completed/stopped 走 D′ 单目标元数据归档，不再设版本白名单门禁——写入时按结构重新核验目标唯一、可解析且仍为终态，写后回读加活动库存复核兜底；成功提示明确为“EyPc 已归档并移除。Claude 原生侧栏同步未确认，当前不受支持。”EyPc 不强刷或伪造 Claude 原生侧栏收敛。Cursor 归档直接翻转 App 自己的 `isArchived` 对（单行、写前重验无进行中证据与活跃分叉、写后回读），归档后在 Cursor App 的归档列表同步可见。
- **归档当前任务快捷调用：** `eypc-companion-archive` 保持 `mainHide`，不切换当前 Tab。第一次只展示目标并开启 5 秒确认；确认身份固定为 `Provider + task + terminalEpoch`，revision、unread、焦点或临时 alias 变化不会让第二次点击消失。第二次从最新包读取 capability 并使用同一个 operationId 贯穿十阶段归档日志；任务消失、terminal epoch 或能力变化才取消。
- **上一个 / 下一个任务：** 只在 V7 Snapshot 的根任务中循环，层序为：当前待输入/审批 → 可执行 Plan artifact（待继续）→ 动态窗口内进行中 → 已完成未读 → 未停止的本地置顶。置顶只把任务行统一移到「置顶」分组，不改变真实状态挣得的入口：置顶的待输入、进行中、待继续与已完成未读仍照常进入循环；已完成且已读或状态未知的置顶项没有状态入口，改用「已完成未读」快捷键在真实未读为空时兜底。层序只决定先后，不再排他——各层全部进入循环，所以三个角标数得到的任务都能循环到；冷启动后第一下仍落在最紧急的一条。子任务、暂停、普通隐藏和已归档全部排除；每层按最近提问时间倒序。连续按键期间循环集合保持你开始时的那一份，停手约 4 秒后下一次按键才采纳最新集合，代价是中途新到的任务要等下一轮才入列。第一下立即派发；首个打开仍在执行时，后续连按仍然一次前进一格，只是合并成一次派发落在最终那一条——连按 3 下就走 3 格，不再原地重复。热 Snapshot 直接使用，冷启动/重连/缺口才执行 tasks-only 预检。循环位置由任意一次确认打开的根任务接管——卡片点击、快速跳转与待输入/已完成未读入口都会把位置移到你眼前那条，落在循环集合之外的打开（隐藏行、临时目标）则保持原位置不变。层变化让位置所指任务离开循环集合时，位置就近落到它在旧次序里的相邻任务，前后方向仍分别落在它原来的下一条与上一条，不会退回集合开头。

列表不展示任务正文；预览与详情也只含隐私安全字段（名称、项目、状态与时间等），不含路径、原始 ID、正文。

## 数据与平台边界

- **额度、模型、任务清单：** 来自本机 Codex App Server 连接（只读库存为主）
- **实时待输入 / 进行中 / 完成未读细分：** 优先依赖 macOS 上 Codex Desktop 实时桥；桥无法重放旧请求时，只允许本机 Codex 会话中经过结构化、有界复核且仍未解决的 interaction 恢复“待输入/待确认”。历史 Plan 结果只恢复 plan-artifact，并显示“待继续”。普通连接器状态、本地 UI 缓存、正文或时间推测都不能伪造 Input/进行中；无法确认的新证据保留任务最后稳定分组并显示“核验中”。
- **Windows：** 支持 CLI 发现与校验；Desktop 实时桥仍以 macOS 能力为准，Windows 上实时细分可能不可用
- 普通库存扫描对 Codex 全局状态文件保持只读；Codex 写例外是你明确确认的原生项目移除事务，以及置顶时的 `thread/section/move`（或 Host `thread pin|unpin`）。Claude 另有单目标、可回滚的 `isArchived` 静默归档例外（结构化重验，只翻目标键），禁止扫改、LevelDB、非目标会话和星标回写。Cursor 写例外是确认归档时对单条 `composerHeaders` 行翻转 App 自己的 `isArchived` 对；插件置顶不写 `cursor/pinnedComposers`。
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

- 普通界面、可同步存储和本机安装诊断都不暴露原始会话 ID、路径、URL、Token、提示词、Plan/执行指令、命令输出或正文；诊断只使用会话期 `h:<hex>` taskRef、状态水位和 operationId。
- 破坏性操作（如归档、项目移除、Git Push）需要在 5 秒内再次确认；确认提示出现在按钮旁的气泡里，不会挤出新的一行。失败不会乐观删行。
- Action 是 EyPc 等价执行，不会调用不存在的 Codex 原生 Action API。
- 动作后隐藏插件时，不会为了切 Tab 或 Renderer 重建而清掉通用循环的进程级位置与热目标；功能停用、来源变化和进程退出仍会清理。

## 与其它功能的关系

功能总开关在 **设置 → 功能开关**。通用快速跳转在 Codex 子窗有本地变体；主插件 `F` 跳转习惯见 **设置** 说明。

## 接入 Cursor Agent（可选）

Cursor Agent 是第三个独立来源，**默认关闭**。开启后插件只读本机 Cursor `composerHeaders` 白名单与磁盘 `status`，把本机 Agent 与 Plan 模式会话列进同一任务清单（Chat / Ask / Edit 不进）。Plan 或 Agent 在向你提问、等你批准终端命令时显示为「待输入」，点一下或用快捷键就能跳过去回答；磁盘 `status=none` 且没有会话头的空壳不进清单。归档双向跟随 App 的 `isArchived`：App 里归档的会话不进清单；在插件里对待继续/已完成会话点“归”，会在写前重验无进行中证据后翻转同一个 `isArchived` 对，App 归档列表同步可见。插件里点置顶只落 EyPc 本地；Cursor 侧栏 Pin 会读进插件置顶分组，但插件不会写 `cursor/pinnedComposers`。uTools 自带 Node 读不了这份库，插件改用本机 `sqlite3` 只跑白名单查询。进行中状态需要你在设置页确认后，才会把观察脚本加法写入用户级 `~/.cursor/hooks.json`（可随时移除，失败开放）。注册一次后关掉或重开插件仍保留，配置页会回读，不必每次再点注册。脚本只读 stdin 前 32KB 白名单字段；库存文件一变就补读未读/已读，不再等几秒轮询。若这份文件里已有钩子写了非法的 `loop_limit: 0`，Cursor 会拒收整份配置、热路径不会点火；重新注册会把该值收成 `1`。不做额度。点卡片会通过 Cursor 官方 deeplink（`agent?id=会话id`）唤起 Cursor 并切到该对话（Cursor 3.17.8 实测；Cursor Cursor 未运行时由就绪层先 `open -b` 启动并等到进程与窗口出现，再发送深链）。这只是「已派发」：插件不能确认对话真的展示成功，也不会把它标成已读。

Cursor 的 `conversation_id / subagent_id / parent_conversation_id` Hook 事件形成热拓扑，`composerHeaders` inventory 提供冷启动复核；两者都只提交白名单身份、有限状态与 generation。精确子任务进入同一 V6 根卡，不再通过 Auxiliary 候选、Controller Cursor 直调或包生成后的二次折叠。Hooks/库存不能建立精确关系时保持独立或隔离，不按标题、路径或时间猜父子。

## 接入 Claude Code（可选）

Claude Code 是独立 Provider，可与 Codex/Cursor 各自开关并共享同一个水球。**默认只开启 Codex**，此时插件完全不读取任何 Claude 数据。事件钩子同样是确认后写入 `~/.claude/settings.json`：注册一次即可，关掉或重开插件不会卸掉，配置页启动时回读。

> 2026-08-13 状态：额度权威、状态代际、旧任务 Stop→SubagentStop 终态纠正、完成/焦点热未读、单项真实同步、已读回跳、虚拟项目筛选、归属视觉和 Claude D′ 静默归档代码均已落地。隐藏 Main 时的状态消费由进程 Node 原生回调驱动，1 秒 StatWatcher 仅补漏；自动化验证与最终构建结果以任务 verify 为准。真实可丢弃会话归档仍须另行确认，当前开发插件身份与 uTools 同屏视觉仍需验收。

### 已确认的 Code-mode 合同

- **只显示 App Code 会话**：库存来自 `claude-code-sessions`；CLI-only、Cowork 和其它桌面会话不显示。名称使用 App 标题，空标题显示 `General coding session`，不显示 UUID。
- **状态互斥且可恢复历史**：兼容版本的 App 精确日志优先，唯一 official Hook 次之，`completedTurns` 恢复无更新 active 证据的历史完成；证据歧义显示 unknown。一张卡只进「待输入 / 进行中 / 待继续 / 已完成未读 / 已完成」中的一个分组。
- **按 Esc 打断也会立刻显示「待继续」**：Claude Code 的 Esc 打断不产生任何钩子事件，因此 EyPc 改看会话记录本身——读到那一轮被你打断的标记就直接归为「待继续」，不用等你下一次提问才纠正。工具还在跑、或你已经发出了新提问的会话不受影响。
- **由 CodexHost 拉起的 Claude Code 只出现一行**：这类会话同时属于 Claude 和 CodexHost 额外进程两条来源。列表里只保留 CodexHost 那一行并以它的状态为准，不再额外出现一条原生 Claude Code 会话；该会话离开 CodexHost 后，原生那行会自己回来。手工在终端起的 Claude Code 不受影响。
- **旧任务不会被子代理尾事件复活**：只有新 Prompt 开启父 Turn；Stop 后的 SubagentStop、工具或 SessionEnd 尾事件不能把已完成任务重新显示为进行中。App 明确完成优先同一轮 Hook 尾事件。
- **Subagent 拓扑与隐私**：官方 Hook 的 `session_id + agent_id` 形成子任务身份，受控 `agent_type` 只用于有限分类；`SubagentStart/Stop` 建立/关闭成员生命周期并聚合回父根任务。队列拒绝任务正文、summary 与 transcript，V1 不显示或打开子任务。Claude Agent Teams 是多独立会话，当前不建立折叠关系。
- **完成/焦点热未读 + 持久恢复**：已门禁 Claude App 的精确完成与当前聚焦会话事件会立即更新 EyPc：聚焦任务完成保持已读，非聚焦任务完成进入已完成未读，聚焦到该任务立即清除；新一轮运行可再次未读。App Local Storage 的 exact `epitaxy-unread-v1` LevelDB 快照继续用于冷启动与漏事件恢复，迟到持久值不会推翻更新的热事件。EyPc 不写 Claude App，也不持久化这层热提示。Claude 的全局聚焦事件无法判断“多窗格可见但未聚焦”是否已阅读，因此这个场景不承诺与原生小点完全同步。
- **全局热缓存**：Claude 启用后，库存、状态、未读、额度和 App presence 跨页面/悬浮窗持续更新且相互隔离；Hook/App-log、已登记会话文件与未读 LevelDB 的首事件都由进程 Node 原生回调即时读取，目录通知遗漏才由 1 秒 StatWatcher 补回，不依赖隐藏 Renderer 的 timer。部分会话 JSON 写入保留最后可信卡片，同值未读指纹不通知。两轮连续失败会从进行中降为未知，旧 generation/revision 不会覆盖新状态；语义不变不增加 revision 或重复推送。精确会话文件变化只重读已登记目标并直接发布 membership delta；额度或完整库存请求卡住不会拖慢任务状态/归档移除。插件重启重新读取真实来源，不恢复旧 live phase。
- **统一实时状态**：Claude 状态与未读只由 Host 适配器提交给 V7 Kernel；Renderer 不再注册 Claude 任务 watcher、提供来源专用“同步状态”动作或维护第二套计数。打开请求只走统一 Command，`dispatched` 不等于原生已打开/已读；没有匹配 native receipt 时 Provider unread 保持不变。
- **只打开仍有效的原历史且连续按键收敛**：缓存已运行 App 的进程代次，上一个/下一个直接从全局缓存选取，连续操作只派发最终 Epitaxy 目标；打开前重新确认唯一目标仍存在且未归档，已归档/缺失/歧义时不会再 Deep Link；不使用 `resume/import`、CLI、标题点击或未读写入；Claude 未运行时由就绪层先启动再派发，在运行判定以 `pgrep -x Claude` 为准，不再依赖辅助功能权限。
- **重复行不擅自清理**：App 已有多少 Code 行就展示多少；共享 CLI id 且无法唯一关联时只把状态标为未知。
- **额度显示全部窗口**：在「运行」显式开启“允许读取 Claude App 额度”后，只读 App 加密缓存；5 小时、全模型周、Fable/Fable 5 或未来模型周限额按上游动态展示，两窗口补充样本不能抹掉 scoped/reset。401/403 等待凭据变化，429 遵循 Retry-After，其它失败按 1m/5m/15m/每小时退避；旧值保留但标为可能过期，200ms 提示展示绝对/相对 reset 和新鲜度。令牌不会进入界面、诊断或持久化。Claude App 同一账号带多个 profile 或多个组织时，插件按 App 自己正在计量的组织取令牌；仍无法唯一确定时不读取，并在额度组旁写明「凭据不可用」。
- **虚拟项目与归属**：EyPc 不改 Codex/Claude 原生项目；相同路径优先合并，只有双方名称都唯一时才按名称合并，歧义重名分开。Claude-only 项目会进入项目区，共享项目在“全部”只出现一次。所有行显示“归属 Codex/Claude/共享”，并有轻量来源背景。Claude completed/stopped 的任务级静默归档仅在上述 App 版本与唯一文件门禁下可用；点 `顶` 只在插件本地置顶，App 里星标仍会同步进插件。Claude 项目级归档、移除和移动仍禁用并说明。

详细选择、技术依据和本地验收顺序见 [Claude Code Companion 权威重置](../../../vibe/specs/260807/claude-code-companion-authority-reset/spec.md#L1) 与 [本地通信调研](../../../vibe/specs/260807/claude-code-companion-authority-reset/research.md#L1)。

### 当前验证边界

- Code-only 标题/历史、App log 版本门禁、Hook 唯一关联、LevelDB 精确键、authority lane 隔离、blocked quota 下状态发布、Epitaxy singleflight/no-clone 和动态 N-window 合并均已有确定性测试。
- D′ 已由定向文件事务测试覆盖：completed/stopped、幂等已归档、平台/版本/phase/身份拒绝、零 Deep Link/AX/exec、非目标与 LevelDB 不变、并发写保护、安全回滚、无 App 日志成功、精确 watcher 与一秒补漏。真实 canary 未经单独确认不会执行。
- 最新 RAW-024 本机探针观察到 27 条 Code 元数据，其中 0 running / 24 completed / 1 stopped / 2 unknown，25 条由 Claude App 日志直接确认；uTools unread reader 此前 30/30 成功。此前十次连续跳转只派发最终目标且没有新增元数据行。探针不输出会话身份、标题、正文或凭证。
- 当前 unread 样本稳定包含 1 条，已证明真实 membership 可读且无快照泄漏；仍需在 EyPc 点击该任务后核对原生小点移除、同轮不回跳和下一 completion 可再未读。真实 App quota 已以 HTTP 200 读到 5h、总周和 Fable scoped 三窗口及 reset，但最终 uTools 同屏仍需人工核对。
- 仍需在正常插件重载后核对真实 permission/input/response/completion/unread/title/restart、共享/单来源/歧义项目三筛选和高对比度视觉。实现与剩余门禁以任务 [verification](../../../vibe/specs/260807/claude-code-companion-authority-reset/verify.md#L1) 为准。
