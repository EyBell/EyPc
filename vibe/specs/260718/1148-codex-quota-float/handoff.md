# Codex Companion 真实会话与交互交接

Tool: codex
Date: 2026-07-22
Status: `reported-unverified-awaiting-user-acceptance`
Requirement version: `2026-07-22.15`

## Result

- RAW-063 已将展开任务导航收敛为 `动态 / 已完成 / 已隐藏 / 项目`。`all/inputRequired` 仍是底层兼容投影，但 `all/input` 的旧页签持久化、旧快照和外部设置均直接回落到 `ongoing`，不会再短暂显示“全部”或“待输入”。
- RAW-064 将动态页固定为最近 6 小时有 latest Turn 开始/完成活动的非隐藏任务，顺序为待输入、正在进行中、宿主状态未知、已完成未读、已完成；失败与系统错误仍保留准确错误表达，未知仍独立。标题普通点击直达，Ctrl/Cmd 标题点击选择，元信息行只聚焦高亮以继承 `Ctrl+T` 的项目上下文。
- RAW-065 已恢复仅由 Weekly 数据驱动的 SVG 进度环及连续/20 段、粗细、颜色和光晕设置。用户跟进截图暴露的最外层完整圆来自宿主水球按钮 focus outline，并被根整圆背景与同尺寸外发光强化；当前连同 inset、border、inset outline 与 shell 一并删除，键盘焦点改为中央读数下划线。无 Weekly 时不显示任何外圈；历史 `shellOpacity` 只保留持久化兼容。
- RAW-066 保留上游 interrupted 原始证据，但领域卡片投影统一转换为 ongoing。角标、动态/项目/已隐藏卡、详情与 Shift 预览全部显示“进行中”、播放图标与 running 色；running/ongoing 计数包含转换项，attention 只保留 failed/system-error。其原先按 raw interrupted 单独保留归档能力的子条款已由 RAW-068 取代。
- RAW-067 将待输入与完成未读的紧凑角标统一为首条直开：待输入使用完整 `inputRequired`，完成未读使用 `all` 中完整的 `completed-unread` 集合，两者都按现有显示层置顶优先/稳定源顺序取第一条。一条与多条行为相同，不先展开、不切页、不清未读、不解除隐藏；进行中角标继续只展开。200ms 说明与 ARIA 明确“打开第一条”。
- RAW-068 让投影 ongoing 与 desktop-live active 共用稳定的 `blocked-active` 归档能力。固定 `归` 槽保持可见但持续禁用，抽屉、Shift 预览、确认和批量候选共用同一 capability；Controller 不发送 interrupted terminal 证据，Host 单条归档拒绝 interrupted，项目归档将其按进行中跳过。active/interrupted 来源切换因此不会再让归档按钮闪烁。
- RAW-069 将“进行中 → 已完成/已完成未读”收敛为 Controller 的按任务可中断 2 秒展示窗。完成证据首次出现后，卡片、动态/项目/已隐藏分组、详情、Shift 预览、角标和归档能力仍共同保持 `ongoing/running/blocked-active`；2 秒内恢复运行则取消，连续完成满 2 秒才从最新原始快照一次性发布完成。Renderer 原有独立进行中角标延迟已删除，避免状态与角标错位或累计 4 秒。
- 四个短字符动作保持 `24px`，间距收敛为 `2px`、轨宽 `102px`；注册提示只保留“最近 N 天的 M 条”。

- Easy Agent 完成前采用双通道临时适配：Codex App Server 继续提供额度、模型、库存、创建和持久化动作；macOS Codex Desktop 私有 IPC 伴随桥提供 `Input / 正在进行中 / 已完成未读` 实时权威及归档后桌面侧栏刷新通知。当前不能删除插件内 App Server 连接器。
- CLI 启动采用受控自动发现，配置页可选地保存一个经运行计划核验的本机手动 CLI 位置；完整路径不回显或跨 Renderer。未设置手动位置时保留现有 App Server 连接器并公开可能延迟。该降级不使用插件缓存猜测 Input、正在进行中或已完成未读；Windows 只提供 CLI 发现/连接器，Desktop IPC 实时桥仍为 macOS canary。
- Codex Companion 已从 recent-100 近似库存升级为真实原生项目库存：只读解析 Codex 项目注册状态，完整分页读取未归档任务，并用 assignment、Chats、最深 cwd 的固定优先级过滤已移除/未注册项目。
- Host Snapshot V2 只有在项目指纹、完整分页和每条 latest Turn `startedAt` 全部有效时才发布 `verified`；中途项目变化重试一次，失败保留上一份已验证 stale 快照或展示错误空态。
- 会话投影 V3 使用默认 30 天、可配置 1–365 天的滚动窗口，边界包含。底层任务数组均按最新提问时间严格倒序；显示层在每个任务页签及动态页各状态段内把置顶项稳定前置，置顶/非置顶分区内部仍保留原顺序，搜索只过滤不重排。
- 项目页按 Codex 原生 `Pinned / Projects / Chats` 结构展示，不重复任务并保留空项目；原生顺序只读，本地置顶进入 `Pinned` 并可排序。行尾不再追加“本地顶”；任务/项目的 `顶` 控件统一表达来源与按下状态，本地使用 warning 色，原生/Chats 可聚焦但由 `aria-disabled` 只读门禁阻止点击、Quick Jump 和快捷键动作。
- 任务和项目支持本地别名；列表有别名只显示别名、无别名显示原始名称，不再用缺失展示字段制造“未命名任务”。原名仍可搜索，并在存在别名时保留于详情和 Shift 预览。最后页签和项目折叠跨重启恢复，搜索词、选择、焦点和确认态不跨重启。
- 旧“从 EyPc 移除/恢复”本地抑制已删除。项目“隐/显”只控制项目页分组，任务仍在其他会话页签；旧 removed 集合升级时直接丢弃，不自动修改 Codex。
- 展开卡片的第一行就是四页签，其下依次为统一搜索、服务端真实额度文字和内容；旧水球/卡片切换、隐藏、刷新、设置、关闭工具栏已从展开面板删除。
- 水球不再先弹出迷你详情：上半区 hover 不展开，三个数字角标可直接点击，并在 hover/focus 200ms 后通过共享不透明层说明数量与点击作用；说明不会展开或切页。指针进入下半区才立即展开。球体显式点击/键盘激活仍有效，触屏不模拟 hover；键盘聚焦以中央读数下划线提示，不绘制外部整圆。额度按普通 5 小时正余额、普通周正余额、最高正余额 Spark 选择；两个普通窗口均无正余额时显示 Spark，百分比上方出现 `S`。存在 Weekly 读数时绘制同池剩余进度环，无 Weekly 时无外圈；根背景透明、表面无同尺寸外发光，普通装饰圆环永不显示。缺失窗口不伪造也不等于 0。
- 默认模型策略是 `quota-auto`：普通阶段使用配置的 `newThreadPreferredModel`，否则用目录默认/首个非 Spark；任一真实返回的普通窗口为 0 时切换最高可用 Spark，Spark 不可用则要求手选。本次手选不持久化。
- 点击项目 `＋`、`Ctrl+T` 或右键新建每次打开新会话编辑器，显示目标项目、模型名称/ID、选择原因和额度。原生 textarea 支持系统听写；Enter 换行、Ctrl/Cmd+Enter 提交、Tab 圈定、Escape 清稿并恢复触发点。冻结选择在额度/目录/项目变化后会刷新并要求再次确认。
- 左上待输入角标仍按统一快照更新；待输入与完成未读无论一条或多条均直接打开各自完整计数集合的展示首条，进行中角标保持展开行为并直接消费 Controller 的任务级 2 秒稳定投影，不再维护自己的延迟窗口。图片可由文件选择、拖放或提示词框粘贴进入临时编辑器预览。
- 专用瞬时桥接以精确项目 cwd/模型和 `allowProviderModelFallback=false` 创建线程，校验响应顶层实际模型/cwd 后才发送首轮并打开线程 Deep Link。首轮失败清理零轮线程，清理不确定时停重试；首轮成功但打开失败只保留短期重试打开。除用户触发的图片回退复制外，提示词不进入通用 action、快照、日志、存储、文档、错误记忆、Deep Link 或剪贴板。
- 当前 App Server 只声明文本输入；带图片时不建 App Server 线程，而是通过受限浮窗 IPC 复制首轮文字、打开 Codex 空白会话，由用户手动粘贴图片并选择模型。该用户触发的剪贴板回退是提示词唯一允许的复制路径。
- 任务行常显 `顶/隐显/归确/+`，项目行常显 `顶/移确/隐显/+`，每个动作缩为 `24px`、间距 `2px`、四槽区 `102px` 且禁用保位；任务/项目行最小高度 `40px`，展开态信息使用 `12/10/9px` 层级。右键/Ctrl+右完整抽屉继续提供完整单项/批量动作。
- Codex 悬浮子窗不挂载主应用 Tooltip，也不设置原生 `title`；水球保持无额度气泡。状态槽和短字符按钮使用子窗自有、完全不透明的 200ms 说明层；按住纯 Shift 继续显示白名单只读预览，正文、摘要、raw ID、cwd 或路径永不进入展示。
- 未进入选择模式时，会话中部左键打开 Codex，Ctrl/Cmd+中部只选择，左侧 38px 全高矩形选择区建立选择；已有任一选中项后，中部和左区均切换当前任务加入/移出，移出最后一项即退出。`选择模式 / 已选 N 项 / Esc 退出` 现在绝对悬浮在列表舞台底部，非普通流元素；滚动区预留底部安全空间，若批量栏置底则其上移避让，故提示的出现/消失不会改变列表顶部、可视高度或任务行坐标。未选行降权，选中行使用 accent/running/pending/surface 三色主题渐变及强化 hover/focus/active；左区始终显示任务状态图标并同步 `aria-pressed`。任务行、左区按钮和右动作按钮分别拥有 Space/Enter，不重复触发。
- 只有 Codex Desktop `desktop-live` snapshot/patch/request/read-state 才能产生待输入、等待审批或 active；上游 persisted interrupted 仅在领域产品投影中转换为 ongoing，不冒充 live authority，但与 active 共用不可归档 capability。桌面桥未运行、失败、连接中或协议不兼容时 live 状态立即显示“宿主状态未知”，App Server/V1 delta、本地缓存和五秒启发均不能伪造 active。普通 watchdog 为 5s，连续三次失败临时改为 1s；进行中角标统计 desktop-live active 与转换后的 ongoing。
- 同页只有一个高亮项，方向键和真实鼠标移动按所有权切换；Shift+↑/↓ 只更新高亮/预览，不改变多选。右键未选先单选、已选保留多选，项目右键清任务选择。`Ctrl+T` 是设置页可改键的 Codex profile 命令；浮窗本地解析 `when`/layer、维护 `codex-composer` 输入角色和 Escape LIFO。Quick Jump 过滤裁剪、遮挡、pointer-events、视口与命中栈，会话标记只聚焦。`codex.float.activate`/uTools 入口继续直接显示、展开并聚焦卡片。
- 完成未读由最新 Turn completed 与 Codex 自身 `hasUnreadTurn` 共同决定；live read-state 优先，桌面断线时可读取 Codex 持久化 unread 集合。EyPc 打开、隐藏或恢复任务都不会确认/清除未读；旧 receipt 只保留本地隐藏迁移。项目折叠乐观反馈，自动收起约 100ms。
- 置顶动作会立即重新投影：任务在当前页签/状态段内移动到非置顶项之前，项目进入 `Pinned`；若浮窗动作桥接未送达，会明确提示重新打开 EyPc，不再静默表现为无效。
- 单条原生归档重读身份、状态、版本、latest Turn 和项目指纹，拒绝 desktop-live active、inProgress、interrupted 与变化证据；写入后同时核验 false 缺席与 true 存在，再向已连接 Codex Desktop 派发 `thread-archived` v2，使侧栏可即时同步。通知失败不撤销已验证归档，结果会明确提示桌面端未确认即时刷新。项目归档忽略 30 天窗口，20 条一批、并发 2、跳过 active/inProgress/interrupted、逐项双向验证并逐项派发通知。
- 项目批量归档只做模拟集成测试。真实验收只使用专用临时任务完成 archive/unarchive 双向核验并最终归档清理；现有任务未被操作。
- Codex 配置页的卡片颜色使用一个配对模态：表面/文字图标前景两个饱和度/亮度二维取色板同时可见，不可选低对比色域以斜纹弱化；选择一侧会把另一侧移动到最近可读亮度。每组标题色块可点击并在原位置展开 12 个候选色卡，支持方向键与 Esc。HEX/色相/色板双向同步，整对通过 `4.5:1` 后一次提交。
- 每个有效配色草稿都会实时预览到真实桌面悬浮伴侣；保存为水球时预览阶段临时显示卡片。确认原子保存一次，取消、Esc、遮罩或离开页面恢复上次保存的样式和颜色。悬浮子窗没有水纹或颜色编辑控件，只显示结果；水纹设置保留在 Codex 配置页。
- 会话层现在按 `详情 → 更多操作 → 会话行` 回退。详情 Header 返回同一目标动作，更多操作 Header 关闭；确认态优先取消，Ctrl 左右不覆盖原触发点，批量抽屉保持单层。
- 项目 `移`现在是真实 Codex 侧栏移除：App Server 没有对应 RPC，Host 仅在 Codex Desktop 已退出、短期 alias/项目指纹/主状态结构全部一致时，修改 `local-projects/project-order/pinned-project-ids/selected-project`，同步原子替换主文件和 `.bak` 并双重核验；失败回滚。不会删除磁盘目录、assignments 或既有会话。成功后清理该项目的 EyPc 隐藏/折叠/本地置顶/别名元数据。
- Quick Jump 普通 F 标记为深色底、白色粗体和白描边；当前目标为黄色底、深色字和深描边，不再交替浅粉/浅紫。

## User Acceptance

- RAW-069 为 `未校验，待用户验收`：请让同一任务从进行中进入完成，确认前 2 秒卡片、动态/项目/已隐藏视图、详情、Shift 预览、进行中/完成未读角标和归档按钮全部仍是稳定“进行中且不可归档”，满 2 秒后只切换一次到“已完成/已完成未读”；再让任务在 2 秒内恢复运行，确认不会闪出完成态，也不会出现额外 2 秒角标滞后。
- RAW-068 为 `未校验，待用户验收`：请让同一任务经历原始 interrupted 与 desktop-live active 更新，确认角标、卡片和详情始终显示“进行中”，任务行固定归档按钮持续禁用且不闪烁；操作抽屉、Shift 预览、单项确认和批量归档也不应把它视为可归档对象。
- RAW-067 为 `未校验，待用户验收`：请分别以待输入/完成未读一条、多条和包含已隐藏条目的状态点击角标，确认都打开同一计数集合中置顶优先、其后稳定排序的第一条，浮窗不先展开或切页；完成未读仍保持未读，已隐藏任务仍保持隐藏，进行中角标继续展开。
- RAW-065/066 为 `未校验，待用户验收`：请先确认跟进截图中的最外层完整圆已经消失、Weekly 数据环仍在，键盘聚焦只在中央读数显示下划线；再确认原始 interrupted 进入“进行中”角标，动态、项目、已隐藏卡和详情均不显示状态“中断/已中断”，failed/system-error/unknown 显示不变。归档能力现由 RAW-068 统一为 ongoing 稳定不可归档。5 小时 + Weekly、Weekly-only、Spark + Weekly 和无 Weekly 四类状态都应只显示有数据含义的进度环。
- RAW-064 为 `未校验，待用户验收`：请确认失败/系统错误仍在“正在进行中”下保留准确状态，宿主未知仍独立且无“需关注”分段；进入/退出单选、多选时列表顶部和可视高度不因提示条重排，末行可滚到、底部批量栏不与提示重叠，Esc 和最后一项取消选择正常恢复。其 interrupted 可见表达子条款由 RAW-066 取代。
- RAW-063 为 `未校验，待用户验收`：请确认旧 `all/input` 持久化状态启动后立即进入动态、四页签无闪现、待输入角标与当前动态分段正常、6 小时内完成任务可见、标题/元信息行交互及 2px/102px 操作轨；其无 Weekly 外环条款由 RAW-065 取代。
- RAW-059 为 `未校验，待用户验收`：请在真实 macOS Codex Desktop 中确认手动/自动 CLI 位置切换、Desktop live authority 与归档后的侧栏刷新；Windows 只验证受控 CLI 发现与 connector fallback，不能验收实时桥。
- RAW-058 多选专项自动化 `3 / 3` 通过：覆盖触发状态机、最后一项退出、子按钮键盘归属及 38px/状态图标/三色渐变结构；真实视觉/Codex 跳转仍待验收。首次 Companion 整文件探测仍有 19 条更广失败，未宣称整体通过。
- RAW-057 为 `未校验，待用户验收`：显著选择模式条、未选降权、选中粗边/左轨和勾选徽标已同步，未运行开发门禁。
- RAW-056 为 `未校验，待用户验收`：桌面伴随桥、权威状态/未读、未知降级、归档刷新通知、诊断和测试契约已同步；未运行任何开发门禁或真实 Codex 操作。
- RAW-055 为 `未校验，待用户验收`：代码、测试契约和过程文档已同步，但按用户规则未运行测试、typecheck、build、uTools、截图或真实 Codex 操作。
- 整体结论仍为：`未校验，待用户验收`；首轮 RAW-065 静态核对未覆盖宿主 focus outline，已由用户截图证伪并进入同一 Work Unit 重修。修正后的静态 diff、`git diff --check`、测试文件零差异、可见状态字符串、Weekly ring/根背景/外发光/focus outline 结构检查均通过；RAW-067 的完整候选源、稳定排序与首条直开，以及 RAW-068 的 ongoing capability、Controller/Host 归档门禁均已静态核对；RAW-069 的固定 2000ms、raw/presented 快照、hold 建立/取消/释放/清理、全投影重建与旧 Renderer 计时器零命中也通过结构检查。偏好 JSON、`ready-for-ui-skill` 与 Markdown 代码链接审计通过；未修改或运行测试，未运行 typecheck、build、uTools、截图或真实 Codex 操作。
- RAW-054 配色增量为 `accepted-with-baseline`：聚焦 `5 / 5`、typecheck、生产 build/uTools 和 `1180/760/420px` 加短高度浏览器矩阵通过；全量 `486 / 496` 保留 10 个重叠脏树基线失败，RAW-054 新增用例全部通过。
- 用户可自行运行 `pnpm test && pnpm run typecheck && pnpm run build`，并在 uTools + Codex Desktop 中重点检查：Input/正在进行中随宿主实际状态即时变化；完成后按 Codex 自身未读显示；EyPc 打开/隐藏不消除未读；桌面退出后状态立即转未知；归档后 Codex 侧栏无需重启即消失。既有置顶、四槽、项目隐藏、200ms 说明和 F 标记仍需回归。
- 真实项目移除验收必须先完全退出 Codex，再对可恢复的临时项目执行；重新打开 Codex 后项目应从侧栏消失，目录和既有会话仍在。Codex 运行时点击应返回阻止提示且状态文件零变化。
- RAW-054 与历史证据均记录在 [verify.md](verify.md#L1)，但不构成 RAW-052–053 的通过证据。

## Privacy And Compatibility

- [preload/index.js](../../../../preload/index.js#L1) 是原始项目状态、Codex Desktop snapshot、thread/Turn ID、cwd 与 action alias 的唯一进程内边界；桌面 snapshot 的正文/摘要只为协议消费而瞬时存在，状态投影后立即丢弃。Renderer 和持久化层只接收匿名键、权威枚举、项目描述、顺序和短期动作别名。
- 不读取 Codex SQLite/LevelDB，不把正文、摘要、raw ID、cwd/路径写入 Renderer、存储、日志或文档，也不自动操作 Codex 桌面 UI。除经二次确认和完整门禁的项目移除事务外，不写 `.codex-global-state.json`；unread fallback 只读 Codex 自身持久化集合。
- Host V2 旧字段和 Activity Delta V1 保留一版兼容；V1 只能成为 connector authority。未来 Easy Agent 可替换 App Server + Desktop bridge provider/floating host，而不改变 Renderer 四个可见页签、兼容投影、匿名状态、本地元数据、`quota-auto` 或瞬时新会话合同。

## Residual Boundary

- 当前 macOS 已实现 Codex Desktop 私有 IPC live authority，但真实宿主消费尚未验收；私有协议版本漂移、socket 权限不满足、Codex 未运行/不兼容时必须维持未知，Windows 对应实时通道仍待后续 provider。
- `thread-archived` 只能确认 frame 已派发，不能证明桌面 UI 已消费；“归档后无需重启即可同步”需要用户在真实 Codex Desktop 中验收。
- `thread/read`/latest Turn 复核与 `thread/archive` 之间没有条件写原语，仍有 provider-level TOCTOU。
- 真实 Windows uTools 发现/系统热键、真实系统听写、真实 `turn/start`/deep link、多显示器/DPI、macOS 两个普通 Space 和一个全屏 Space 仍是宿主验收残余。
