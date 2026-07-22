# Codex Companion 真实会话与交互验证记录

Tool: codex
Date: 2026-07-22
Status: `reported-unverified-awaiting-user-acceptance`
Requirement version: `2026-07-22.10`

## RAW-063 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 四页签与兼容回退 | implemented / unverified | Float renderer 仅显示 `动态 / 已完成 / 已隐藏 / 项目`；`all/input` 投影保留给角标与统计，旧持久化、旧快照和 `codex.tab.set` 均回退为 `ongoing`。 |
| 6 小时动态流 | implemented / unverified | 动态页和徽标都按最近 6 小时的 `max(lastTurnStartedAt,lastTurnCompletedAt)` 非隐藏集合取数，顺序为待输入、进行中、需关注、未知、完成未读、已完成；完成任务仍在窗口内显示。 |
| 行内交互与密度 | implemented / unverified | 标题普通点击直达、Ctrl/Cmd 只选择；元信息行聚焦并高亮以接收 `Ctrl+T`。四按钮固定为 `24px / 2px / 102px`，注册提示只显示“最近 N 天的 M 条”。 |
| 水球收敛 | implemented / unverified | Weekly SVG 外环和设置入口已移除；内部液面、百分比、角标、展开额度和旧 outer 持久化字段保持。 |
| 状态角标与图片回退 | implemented / unverified | 左上待输入保持实时；右上进行中使用不重置 2 秒展示窗口。编辑器支持 PNG/JPEG/WebP 选择、拖放、粘贴与内存预览；当前文本-only App Server 下图片动作仅复制文字并打开 Codex 空白会话，不创建 App Server 空线程。 |
| 静态核对 | pass | `git diff --check` 通过；已复核可见 Tab 仅为四项、旧 all/input 回退路径、6 小时动态筛选、外环 CSS/SVG/设置入口移除和受控/权威文档同步。按用户要求未运行测试、typecheck、build、uTools、截图或真实宿主操作。 |

结论：RAW-063 已实现，状态为 `未校验，待用户验收`。用户验收应确认旧 `all/input` 启动后直接进入动态、四页签无闪现、待输入角标/动态分段正常，以及最近 6 小时内完成任务仍可见。

- Error memory: 未新增。本轮复用 [codex-cross-process-notloaded-is-not-completion.md](../../../knowledge/error-memory/codex-cross-process-notloaded-is-not-completion.md#L1)：只采用 latest Turn 的已证据时间，不以 `updatedAt`、刷新频率或跨进程 `notLoaded` 推断状态。

## RAW-059 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 启动位置发现 | implemented / unverified | preload/public preload 自动枚举受控 macOS/Windows CLI 候选，并只向 Renderer 传递来源标签和可用性；无候选时保留现有连接器入口。 |
| 手动 CLI 位置 | implemented / unverified | 配置页可提交完整绝对路径；Host 使用现有 native/Node-wrapper/Windows shim 运行计划核验后，才写入独立本机插件 storage。页面、环境快照、日志和文档均不回显该路径。 |
| 状态权威保护 | implemented / unverified | App Server 成功往返只建立连接证据，不再覆盖 preload 的 runtime/process/Desktop bridge 分类。`desktop-live` 仍是 Input/进行中/完成未读唯一权威；connector fallback 只保留数据与动作，并公开未知/延迟边界。 |
| Windows 提示 | implemented / unverified | UI 说明 npm、Volta、NVM、本地和 PATH 自动发现；`.cmd` 入口仍需通过 Node/JS 或 bundled native 核验。当前实时 Desktop IPC 明确标注为 macOS canary。 |
| 静态核对 | pass | canonical/public preload 字节一致，`git diff --check` 无空白错误；未运行测试、typecheck、build、uTools/runtime、截图、真实预检或真实归档。 |

结论：RAW-059 已实现并保持 `未校验，待用户验收`。尤其需要用户在真实 macOS Codex Desktop 中确认 live status 与归档 UI 即时刷新；Windows 仅可确认 CLI 发现/连接器行为，不能宣称实时 Desktop IPC 已可用。

- Error memory: 未新增。本轮复用现有 [codex-gui-nvm-launcher-path.md](../../../knowledge/error-memory/codex-gui-nvm-launcher-path.md#L1) 的 GUI/NVM/Windows shim 受控启动替代路线，没有发现新的、已验证的失败模式。

## RAW-058 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 多选命中与状态机 | implemented / unverified | 左侧选择区改为 38px 全高矩形并保留状态图标；普通态左区选择、中部打开、Ctrl/Cmd+中部选择，选择态两区切换成员并在最后一项移除时退出。 |
| 选中视觉与键盘归属 | implemented / unverified | 选中行使用 accent/running/pending/surface 三色主题渐变，hover/focus/active 逐级增强；任务行、左按钮和右动作按钮分别拥有 Space/Enter，根行不重复执行子按钮事件。 |
| 置顶来源与门禁 | implemented / unverified | 行尾“本地顶”已移除；本地“顶”使用 warning 色，四类来源由 200ms hover/focus 说明表达。原生/Chats 使用可聚焦 `aria-disabled=true`，点击、Quick Jump 与快捷键复用只读门禁。排序和持久化未改。 |
| 紧凑角标说明 | implemented / unverified | 待输入单/多项、正在进行中、已完成未读角标共享移出展开分支的说明层；200ms 后显示作用，离开/失焦关闭，hover/focus 不展开或切页，点击合同保持。 |
| 自动化契约 | focused pass / full file red | 用户授权后运行多选专项：普通/Cmd 中部与左区状态机、最后一项退出、子按钮 Space/Enter 归属、38px 全高区/状态图标/三色渐变共 `3 / 3` 通过。首次整文件探测为 `21 / 40` 通过、19 失败；失败跨页签、搜索、项目、配置、角标等更广合同，不能宣称 Companion 全绿。 |
| 静态与类型核验 | pass | `git diff --check`、Markdown code-link audit、设计偏好 `ready-for-ui-skill` 复核和用户触发后的 `pnpm run typecheck` 通过；未运行 build、uTools/runtime、截图或真实 Codex 操作。 |

结论：RAW-058 的多选专项自动化为 `3 / 3 passed`，证明触发状态机、最后一项退出、子按钮键盘隔离和视觉结构契约有效；真实视觉与 Codex 跳转仍待用户验收，且 Companion 整文件仍有 19 条非多选专项失败，不能标记整体 accepted。

- Error memory: 更新 [codex-selection-state-needs-structural-contrast.md](../../../knowledge/error-memory/codex-selection-state-needs-structural-contrast.md#L1) 的第二次发生记录，并新增候选 [codex-control-owned-source-feedback.md](../../../knowledge/error-memory/codex-control-owned-source-feedback.md#L1)。两者均待用户验收后再决定是否提升为 verified。
- Typecheck correction: [FloatApp.vue](../../../../src/FloatApp.vue#L1) 的 composer `nextTick` 回调改为一次捕获并判空局部 state，消除两处 TS18047；已记录 verified memory [vue-nexttick-ref-null-narrowing.md](../../../knowledge/error-memory/vue-nexttick-ref-null-narrowing.md#L1)。

## Closeout Static Re-audit (2026-07-22)

- 对当前脏树重新做了源码/规范对照，并修正配色对比度与水球边界、联动取色板与无效色域、四页签/统一搜索、水球外壳透明度，以及桌面补丁未知路径的 fail-closed 分支；图片附件回退保持文本-only App Server 与受限浮窗复制边界。
- 可复现静态检查通过：preload/script `node --check`、`git diff --check`、canonical/public preload 字节一致性和 Markdown code-link audit。
- 依项目规则，本次未运行测试、typecheck、build、uTools/runtime、截图或真实 Codex 操作；整体仍为 `未校验，待用户验收`。

## RAW-057 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 选择模式提示 | implemented / unverified | 任一任务选中后常显“选择模式 / 已选 N 项 / Esc 退出”，数量实时变化，最后一项移出后消失。 |
| 层级区分 | implemented / unverified | 未选行降至 `.62` 不透明度并降低饱和度；选中行使用 `2px` 强调边、`5px` 左轨、强底色与双层焦点/阴影。 |
| 左侧徽标 | implemented / unverified | `aria-pressed=true` 时状态图标隐藏，左控件改为强调色实底与 `✓`，并保留 focus/active 边界。 |
| 自动化契约 | updated / not run | UI 测试增加模式条、实时数量、最后一项退出、勾选符号和未选降权断言；依用户规则未执行。 |

结论：RAW-057 为 `未校验，待用户验收`。未运行测试、typecheck、build、uTools/runtime、截图或真实 Codex 操作。

- Error memory: 新增候选 [codex-selection-state-needs-structural-contrast.md](../../../knowledge/error-memory/codex-selection-state-needs-structural-contrast.md#L1)，等待用户视觉验收后再决定是否提升为 verified。

## RAW-056 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| Codex Desktop 伴随桥 | implemented / unverified | Preload 已实现 macOS loopback Unix socket、长度帧、固定版本 initialize/snapshot/patch/follow/request/read-state、断线重连，以及 owner/mode 与协议不兼容 fail-closed；桌面全文快照仅在 preload 内瞬时投影。 |
| Input / 正在进行中 | implemented / unverified | `statusAuthority=desktop-live` 才能产生 waiting-input/waiting-approval/active；App Server/V1 delta 只标记 connector authority。失去 desktop live 后立即转“宿主状态未知”，不再使用五秒启发或本地缓存计数。 |
| 已完成未读 | implemented / unverified | 最新 Turn completed 与 Codex `hasUnreadTurn` 共同决定；live read-state 优先，断线时可用 Codex 自身持久化 unread 集合。EyPc open/hide/restore 均不确认未读。 |
| 归档即时同步 | implemented / unverified | App Server `thread/archive` 及 false/true 双向验证保留；成功后向已连接桌面端派发 `thread-archived` v2。单条/项目结果区分已派发与桌面端未确认即时刷新，通知失败不回滚已验证归档。 |
| 活动与诊断 UI | implemented / unverified | 动态页新增正在进行中、需关注、宿主状态未知和已完成未读分段；角标仅统计桌面权威 Input/active/unread。设置页分别展示 App Server 数据连接器与桌面实时桥状态；普通 watchdog 改为 5s，三次失败后 1s。 |
| 自动化契约 | updated / not run | Domain、Controller、UI、platform/preload 测试契约已更新，并增加私有桌面 socket snapshot/read/archive 通知边界用例；依用户规则未执行。 |
| 真实宿主与写入 | not run | 未运行测试、typecheck、build、uTools/runtime、截图、真实 IPC 预检、真实归档或项目移除；未修改本机 Codex 原生状态。 |

结论：RAW-056 为 `未校验，待用户验收`。实现和测试契约不能替代真实 Codex Desktop 消费与 UI 刷新的用户验收；RAW-054 及更早历史证据不替代本增量验收。

- Error memory: 未新增；现有 [codex-cross-process-notloaded-is-not-completion.md](../../../knowledge/error-memory/codex-cross-process-notloaded-is-not-completion.md#L1) 与 [codex-archive-revalidation-fail-open.md](../../../knowledge/error-memory/codex-archive-revalidation-fail-open.md#L1) 已覆盖本轮“无 live authority 不猜状态”和“归档先双向验证”的复用规则。

## RAW-055 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 名称回退 | implemented / unverified | 有别名时 `alias/displayName/name` 使用别名；无别名时回退原始名称。列表只显示一个主标题，原名仍参与搜索并保留于详情/Shift 预览。 |
| 密度与字号 | implemented / unverified | RAW-055 建立 `12/10/9px`、`24px` 四槽、`105px` 操作区和 `40px` 行；其 `26×30px` 左控件已由 RAW-058 的 38px 全高矩形取代。 |
| 鼠标选择 | implemented / unverified | 普通态中部打开、左槽进入选择；选择态中部与左槽均加入/移出，移出最后一项后集合清空并退出选择模式。独立操作按钮继续阻止冒泡。 |
| 状态反馈 | implemented / unverified | 行和左控件补齐 hover/focus/active/selected 组合、强调边、渐变与光晕；左控件同步 `aria-pressed`，Space/Escape/Delete/F/Shift 继续复用既有可见反馈。 |
| 自动化契约 | updated / not run | Domain/UI 用例已更新名称投影、原名搜索、两态点击、最后一项退出、尺寸和组合状态断言。依用户规则未运行。 |

结论：RAW-055 为 `未校验，待用户验收`。未运行测试、typecheck、build、uTools/runtime、截图或真实 Codex 操作；RAW-054 历史证据不替代本增量验收。

- Error memory: 新增候选 [codex-display-label-fallback-precedence.md](../../../knowledge/error-memory/codex-display-label-fallback-precedence.md#L1)，等待用户验收后再决定是否提升为 verified。

## Review Target

- Requirement: [raw-requirement.md](raw-requirement.md#L1) 的真实项目库存、四页签与旧 all/input 回退、6 小时动态流、Codex Desktop live/unread 权威、无权威未知降级、5s watchdog、归档后桌面通知、普通/Spark 额度 V2、任务/项目常显四槽、即时可见的置顶、项目隐藏/移除、高对比 Quick Jump、联动取色、图片回退与纯 Shift 隐私预览。
- Plan: [plan.md](plan.md#L1) 的 Host V2/Projection V3 匿名边界、App Server 数据/动作连接器、Desktop 伴随桥、Renderer 状态机、测试契约和文档闭环；真实宿主、视觉与开发门禁留给用户验收。
- Implementation: [preload/index.js](../../../../preload/index.js#L1)、[preload/float.js](../../../../preload/float.js#L1)、[codex.ts](../../../../src/domain/codex.ts#L1)、[codexAppearance.ts](../../../../src/domain/codexAppearance.ts#L1)、[CodexCardColorDialog.vue](../../../../src/components/CodexCardColorDialog.vue#L1)、[codexNewThread.ts](../../../../src/domain/codexNewThread.ts#L1)、[codexPresentation.ts](../../../../src/domain/codexPresentation.ts#L1)、[codexController.ts](../../../../src/runtime/codexController.ts#L1)、[appRuntime.ts](../../../../src/runtime/appRuntime.ts#L1)、[keybindingRuntime.ts](../../../../src/runtime/keybinding/keybindingRuntime.ts#L1)、[FloatApp.vue](../../../../src/FloatApp.vue#L1)、[CodexWaterBall.vue](../../../../src/components/CodexWaterBall.vue#L1) 与 [CodexPage.vue](../../../../src/pages/CodexPage.vue#L1)。

## RAW-054 增量验收

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 双取色板与色域 | pass | 表面/前景两个 canvas 同时存在；固定色相下显示饱和度/亮度，低对比区域斜纹弱化。选择任一侧会保持另一侧色相/饱和度并移动到最近满足 `4.5:1` 的亮度。 |
| 原位色卡入口 | pass | 标题当前色块可点击并在所属色板内展开 12 个命名色卡；方向键、Esc、外部点击和焦点恢复已实现。选择“薄荷”得到 `#B5E3B5 / #07161D` 与 `12.81:1`。 |
| 草稿与真实浮窗 | pass | 有效草稿只进入 Controller 暂态预览，真实桌面伴侣实时刷新；保存水球态在预览期间临时显示卡片。取消、Esc、遮罩和卸载清除预览并恢复保存样式/颜色；确认只持久化一次完整配对。 |
| 浮窗职责 | pass | [FloatApp.vue](../../../../src/FloatApp.vue#L1) 不含水纹主/辅色入口、编辑状态或对话框；悬浮子窗只显示效果，水纹设置仍在 Codex 配置页。 |
| 聚焦自动化 | pass | `npx vitest run ... -t "nearest contrast-safe|previews a paired card theme|edits card surface|keeps every color control|keeps invalid HEX"`：`3 files / 5 passed`，覆盖最近安全色、暂态预览/回滚/原子提交、双板/色卡、无原生 `type=color`、无效 HEX 与零浮窗水色控件。 |
| 类型与构建 | pass | `npm run typecheck` passed；`npm run build` passed，包含第二次 typecheck、Vite 双入口生产构建、runtime prepare 与 `validate:utools`。 |
| 浏览器矩阵 | pass | `1180×800`、`760×800`、`420×800` 与 `760×420` 均无页面横向溢出；窄屏单列、短高度可纵向滚动。420px 色卡层位于 `[32, 388]`，12 个选项全部在视口内。既有 8092 开发服务被复用，未停止或重启用户进程。 |
| 全量基线 | accepted-with-baseline | `npm test` 完整运行 `48 files / 496 tests`，结果 `45 files passed / 3 failed`、`486 passed / 10 failed`。RAW-054 新增用例全部通过；失败为重叠脏树中的 1 个 alias 投影、1 个归档 evidence、8 个既有 Codex UI 合同，不归因于本增量且未 reset/改断言。 |

结论：RAW-054 的实现、自动化、生产构建/uTools 与浏览器矩阵形成闭环，增量状态为 `accepted-with-baseline`。未执行真实 Codex 状态写入、归档、项目移除、发布或进程操作；RAW-052–053 的用户独占验收状态不被本节覆盖。

## RAW-052–053 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 常显操作区 | implemented / unverified | 任务 `顶/隐显/归确/+`、项目 `顶/移确/隐显/+` 已接入固定 `30px` 槽；状态与短字符说明层为自有 200ms 不透明浮层，无原生 `title`。 |
| 项目隐藏 | implemented / unverified | `hiddenProjectKeys/hiddenProjects` 只过滤项目页分组，任务数组和计数保留；旧 removed 字段在归一化时丢弃。 |
| 真实项目移除 | implemented / unverified | Host 接受短期 alias + 指纹，包含桌面进程阻止、主文件-only 校验、限定字段、主/备同步临时写入、原子替换、双重核验、回滚和五种结果码；未对真实状态执行。 |
| Quick Jump | implemented / unverified | 主窗口与悬浮子窗普通标记改为深色/白粗字/白描边，激活标记改为黄色/深色字/深描边，删除粉紫交替。 |
| 置顶反馈 | implemented / unverified | 所有任务/项目卡片统一投影 `native/local` 来源；任务在当前页签/状态段内置顶优先，项目进入 `Pinned`；RAW-058 已把本地来源从行尾文字迁到 warning 色 `顶` 控件及说明，动作桥接失败仍明确提示。 |
| 自动化契约 | updated / not run | Domain、Controller、UI、bridge 和 Quick Jump 测试契约已同步；依项目规则未运行任何测试。 |
| 本机与真实写入 | not run | 未运行 typecheck、build、uTools/runtime、截图、真实 Codex 预检、归档生命周期或项目移除；未修改本机 Codex 全局状态。 |

结论：`未校验，待用户验收`。RAW-054 的通过证据不得用于宣称 RAW-052–053 已 accepted；RAW-051 及更早的通过记录仅保留为历史基线。

## Historical Acceptance Results Through RAW-051

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 原生状态与项目归属 | pass | 主文件 allowlist、无效主文件才回退 `.bak`、assignment > projectless > 最深 cwd > 排除、原生置顶/项目顺序和空项目均有回归；Renderer 不接收路径或原始身份。 |
| 完整库存与指纹 | pass | `archived=false` 完整翻页、重复 ID 去重、游标循环/无效/安全上限拒绝；扫描前后指纹变化重试一次，再变化拒绝；Controller 首次失败为空态、有已验证快照时 stale 保留。 |
| latest Turn / 30 天 | pass | 每个候选读取最新 Turn；存在 Turn 但缺 `startedAt` 整批失败；零 Turn 排除并统计。30 天边界包含，所有任务页签严格 `lastTurnStartedAt desc`，不以 `updatedAt` 回退。 |
| 六页签与项目结构 | pass | `全部 / 待输入 / 动态 / 已完成 / 已隐藏 / 项目`、动态页`待输入 → 当前动态 → 已完成未查看`优先级、Pinned/Projects/Chats 顺序、不重复任务、空项目和搜索过滤均覆盖。 |
| 本地元数据 | pass | 默认/最后页签、项目折叠、1–365 天窗口、别名、本地置顶顺序、本地移除和 absent→present 自动恢复完成迁移回归；存储不含原始 ID/路径/任务列表。 |
| 选择与确认 | pass | 会话单击只聚焦/选择，双击或 Enter 打开；Ctrl/Cmd/Shift/Space 多选、Space 新增后下移、不可见项清理、右键未选先单选/已选保留多选、项目右键清任务选择与 5 秒二次确认均覆盖。 |
| 快捷键与暂态层 | pass | 设置页可见/可改键 `codex.thread.createFocused` 默认 `Ctrl+T`；Tab、输入角色、layer、`when` 可达冲突隔离，浮窗本地 LIFO、composer 抑制、焦点恢复、唯一高亮所有权和抽屉键盘操作有覆盖。 |
| 单条归档 | pass | exact alias、source fingerprint、thread recency/version/latest Turn 重读，active/inProgress/变化/损坏形状拒绝；`thread/archive` 后同时验证 false 缺席与 true 存在，失败不乐观移除。 |
| 项目归档 | pass | 25 条模拟集成：20 条分批、并发 2；23 条双向归档成功、1 条 active 跳过、1 条验证失败保留，结果逐项返回。显示窗口不参与历史项目扫描。 |
| 额度、Spark 与默认模型 | pass | 普通 5 小时→普通周→最高 Spark 展示优先级、Spark `S`/同池周环、缺失窗口不算 0、任一真实普通窗口为 0 的 `quota-auto` 切换、首选普通模型、最高 Spark 与本次手选均有覆盖。 |
| 新会话编辑器与桥接 | pass | 每次入口均开 editor；目标/模型名与 ID/原因/额度、自动焦点、composition、Ctrl/Cmd+Enter、焦点圈定、冻结后 stale 二次确认、精确模型/cwd/no-fallback、首轮失败清理、清理失败停重试和首轮成功后重试打开均覆盖。 |
| Shift 预览与完整操作 | pass | 项目行只常显 `＋`，任务无 hover/action rail；纯 Shift 目标接管、Alt/Ctrl/Meta 抑制、Shift+↑/↓、鼠标归还、失焦/Escape/切层关闭、翻转夹紧/内滚和隐私字段白名单有覆盖。完整动作集中在右键/Ctrl+右抽屉，禁用原因与危险动作顺序保留。 |
| Quick Jump | pass | composer/抽屉/预览/遮罩互斥，裁剪祖先、pointer-events、视口与命中栈过滤通过；任务目标只聚焦，不绕过双击/Enter 打开合同。 |
| 浮动批量栏 | pass | 两项起显示 `已选 N/归/操/清`；下半区锚点置顶、上半区锚点置底，选择/焦点/滚动/ResizeObserver/窗口 resize 重算。不改变任务 DOM 顺序、行坐标或列表高度；不足两项关闭。 |
| 即时活动与角标 | pass | preload 状态通知立即发匿名 delta，200ms 单飞列表复核，连续三次失败退避 1s，结构变化转完整扫描；待输入/当前动态/完成未查看三角标、红色待输入文字、单待输入点击直开和完成任务成功打开后已查看均覆盖。 |
| 收起水球命中 | pass | 根容器进入与上半区 pointer enter/move 均不展开，角标 hover 250ms 保持稳定且点击仍路由；真实矩形中线以下立即展开，触屏 hover 被抑制，显式点击/键盘路径保持原合同。 |
| 卡片配对颜色 | pass | 旧配置迁移、三个预设、深/浅有效配对、低对比/畸形拒绝、水球深色门禁、HEX/HSL 往返、模态本地草稿、一次完整提交、取消零写入、ARIA 错误关联、焦点圈定/恢复均有聚焦覆盖。 |
| 会话层回退 | pass | 右键抽屉→详情→Esc→同目标抽屉→Esc→原会话行、直接 Ctrl+左打开详情后的同栈回退、确认优先取消、Ctrl 左右保留原触发点与批量抽屉一次关闭均有组件回归。 |
| 环境与隐私 | pass | 既有 GUI/NVM、PAC、mixed preload、macOS workspace、uTools 子窗和环境脱敏矩阵继续通过；新请求只跨散列项目键、短期 alias、指纹、模型 ID 与瞬时提示词。提示词不进入 action/快照/日志/存储/文档/错误记忆/Deep Link/剪贴板；raw ID/cwd/path 仍只在 preload。 |

## Historical Automated Gates Through RAW-051

- Focused gates: [codexNewThread.test.ts](../../../../tests/domain/codexNewThread.test.ts#L1)、[codexAppServerBridge.test.ts](../../../../tests/platform/codexAppServerBridge.test.ts#L1)、[codexFloatWindowBridge.test.ts](../../../../tests/platform/codexFloatWindowBridge.test.ts#L1)、[action.test.ts](../../../../tests/runtime/action.test.ts#L1)、[keybinding.test.ts](../../../../tests/runtime/keybinding.test.ts#L1)、[codexCompanion.test.ts](../../../../tests/ui/codexCompanion.test.ts#L1) 与 [quickJump.test.ts](../../../../tests/ui/quickJump.test.ts#L1) passed；新增浮窗请求相关测试确认子 preload 不扩大 Node require allowlist。
- `pnpm test`: `48` files / `473` tests passed；覆盖水球上下半区命中/角标直点、额度/模型/创建/Shift/Quick Jump 增量、活动通道、会话投影、归档与全部既有功能回归。
- `pnpm typecheck`: passed。
- `pnpm build`: passed；Vite 双入口生产构建、canonical/public runtime 同步及 `validate:utools` passed。
- 本机 `codex app-server generate-json-schema --experimental` 确认 `ThreadStartParams` 支持 `model/cwd/allowProviderModelFallback/ephemeral`，`ThreadStartResponse` 顶层必含 `model/cwd/thread`，`TurnStartResponse` 必含 `turn`，`ModelListResponse.data` 与 `rateLimitsByLimitId` 形状均与实现一致。只读 `model/list` 同时确认当前目录含 `gpt-5.3-codex-spark`。
- Browser fixture QA: 380px 与 330px 展开态无横向溢出；330px composer 显示项目、`GPT-5.3-Codex-Spark` 名称/ID、自动原因与 97% Spark 额度，textarea 自动聚焦且按钮完整；330px 纯 Shift 预览和右键完整抽屉自动夹紧、内部可滚且不改变列表；104px compact 显示百分比上方 `S`、97% 与不重叠活动角标。普通 hover/action rail/native `title` 均不存在；既有批量栏避让/零行位移由回归覆盖。修订 5 不改 CSS 或几何尺寸，上下半区行为由注入真实 `94×94` 矩形的组件事件回归验证，未重复截图。

## Real Local Preflight

- 方案前只读基线：2026-07-21 10:03，`54` 条未归档原始任务 → `33` 条有效原生项目任务 → 近 30 天 `27` 条，其中已完成 `24`、进行中 `3`。
- 修订 3 最终生产桥接预检：`node scripts/codex-real-preflight.mjs 30` 返回 Host V2、`completeness=verified`、严格排序通过；动态值为 `54 → 33 → 27`，排除 `21` 条已移除/未注册项目任务，已完成 `25`、进行中 `2`。本机服务端只返回 Weekly `9%`，没有伪造 5 小时窗口。
- 动态数量会随本机任务状态和额度变化；验收固定的是完整分页、项目顺序/归属、严格 Turn 时间、窗口和完整性门禁，而不是某一瞬间数量。
- 原生 Pinned 项目顺序验证为：`km-srm-ref → EyPc → EzDesign → EzAgentPlatform → CodeNote → EzCodexGpt → EyTrade`；其余 Projects 和 Chats 继续按原生状态投影。
- 修订 4 只读额度探针返回两个独立池：普通 `codex` 仅周窗口、`usedPercent=94`；`codex_bengalfox / GPT-5.3-Codex-Spark` 仅周窗口、`usedPercent=2`。该动态值只证明本机可直接区分读取，产品验收固定的是池分类、窗口缺失语义与展示/模型策略，不固定瞬时百分比。

## Real Archive Lifecycle

- [codex-archive-lifecycle-check.mjs](../../../../scripts/codex-archive-lifecycle-check.mjs#L1) 具有显式 `--create-temp-task` 写入门禁。
- 首次零轮次探针证明 `thread/start` 后没有 Turn 的条目不会进入 `thread/list` 任一分区；该探针已调用归档清理，未操作现有任务。
- 正式专用临时任务创建一轮最小文本 Turn，等待 completed 后验证：初始只在 `archived=false`；归档后只在 `archived=true`；unarchive 后只在 `archived=false`；最终再次归档并确认只在 `archived=true`。
- 真实验收未归档、删除或重命名任何用户现有任务；项目批量归档只执行模拟集成测试。
- 修订 3 没有修改归档实现或接口，因此不重复创建写入型临时任务；沿用同一已通过生命周期证据，本轮只执行真实只读库存预检，用户现有任务保持未操作。

## Findings And Residuals

- P0/P1/P2 source finding: none after reconciliation。
- App Server 没有 conditional archive；重读与写入之间的新活动仍是 provider TOCTOU 残余。
- RAW-056 已接入当前 macOS Codex Desktop 私有 IPC live authority，但尚未做真实宿主验收；协议版本漂移、桌面未运行/不兼容时的未知降级和 Windows 对应通道仍是显式残余。
- 归档刷新通知只确认 frame 已派发，不能证明 Codex Desktop UI 已消费；真实“无需重启即可消失”仍待用户验收。
- 真实 Windows uTools 运行时/系统热键、真实系统听写、真实 `turn/start`/Deep Link、多显示器/DPI 和 macOS 两个普通 Space + 一个全屏 Space 仍是宿主观察项；本轮按计划不创建真实任务。
- Project AI-rule audit 仍返回 6 条既有 adapter/governance baseline 缺口（模板传播、v3-route、W24/W28/W30）；这些问题在本轮前已存在且不指向 Codex Companion 实现或文档增量，本轮未扩围修改项目规则。
- Error memory: RAW-051 新增 [codex-coupled-color-editor-atomicity.md](../../../knowledge/error-memory/codex-coupled-color-editor-atomicity.md#L1)，记录“两个独立原生单色选择器不能构成耦合颜色编辑器”的可复用事务规则；此前协议核验记录继续有效。
- 零轮次 list 行为已由预检统计、自动化和真实生命周期记录直接覆盖，不另建错误记忆；它是协议边界而非生产回归。

## Acceptance

- Root decision: RAW-051 requirement、implementation、聚焦自动化、真实浏览器矩阵、生产构建/uTools 与文档/错误记忆形成闭环，增量 accepted；实施前已存在的 9 个失败维持 declared baseline，不作为本增量失败，也未通过 reset 或改写断言掩盖。
- Document impact: `requirement-canonical + project-current + controlled-task + project-memory` synchronized。
- Sidecar: 只读探索结果已由 Root 复核并接纳；最终写集、真实任务门禁、diff、测试和文档由 Root 独占验收。

## Revision 2026-07-22.2 Pending User Validation

- 已实现项目 Tab 的四段置顶顺序、置顶会话去重与 Chats 标题下展开；紧凑角标提示收敛为三个短计数文本。
- 已将 Codex Tab 非编辑区域的 `Ctrl+F` 与 `F` 同步为 Quick Jump，并将会话搜索迁移至 `Ctrl+Shift+F`；多选状态不阻断该入口。
- 已修复配置页即时监听器早于 `activeThemeOption` 初始化造成的 TDZ 挂载异常。
- 未执行测试、类型检查、构建、uTools/runtime、截图或真实 Codex 操作，原因是项目规则将这些验收保留给用户；状态：`未校验，待用户验收`。

## Revision 2026-07-22.3 Pending User Validation

- 已增加 `Shift+Escape → return-focus` 子浮窗桥：只临时隐藏 BrowserWindow 并让宿主恢复之前的窗口焦点，不修改 Companion 开关或持久化状态。
- 已增加渲染与 preload 桥接测试契约；未执行测试、类型检查、构建、uTools/runtime、截图或真实 Codex 操作，状态：`未校验，待用户验收`。

## Revision 2026-07-22.1 Evidence

- Focused increment: `pnpm exec vitest run ... -t <RAW-051 cases>` 通过 `4 files / 11 tests`，覆盖迁移、预设、深浅配对、畸形/低对比拒绝、水球门禁、HEX/HSL、Controller 原子更新、模态事务以及 Esc/focus 栈。
- Full suite: `pnpm test` 运行 `48 files / 487 tests`，结果 `478 passed / 9 failed`。失败集合与实施前聚焦基线一致：8 个位于重叠 Codex UI（旧单击/多选/批量栏/title/quota-auto/Tooltip 文案合同），1 个为归档证据期望 `terminal` 而当前投影为 `unknown`；RAW-051 新增用例无失败。
- `pnpm run build` passed，并在同一命令中通过 `vue-tsc --noEmit`、Vite 双入口生产构建、canonical/public runtime 准备及 `validate:utools`。
- Browser QA: 配对颜色模态在 `1180×760`、`760×760`、`420×760`、`420×480` 均为 `scrollWidth === clientWidth`；宽屏两列、420px 单列，短高度 `clientHeight=462 / scrollHeight=980` 可纵向滚动。每个尺寸都存在两组颜色字段、零个 `type=color`，无文档横向溢出；Console 只有既有 favicon 404。
- Scope: 未增加依赖、未写数据库/权限/外部服务、未发布、未操作 Codex 任务或进程。浏览器开发服务受 120 秒边界控制并已正常结束。
