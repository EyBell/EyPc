# Codex Companion 真实会话与交互实施计划

Tool: codex
Date: 2026-07-22
Status: `reported-unverified-awaiting-user-acceptance`
Requirement version: `2026-07-27.9`

Authority: [spec.md](spec.md#L1)

1. 用只读本机预检确认 Codex 原生项目注册、Pinned/Projects/Chats 顺序、未归档完整库存和最新 Turn 时间，锁定与截图差异的根因。
2. 将 [preload/index.js](../../../../preload/index.js#L1) 升级为 Host Snapshot V2：精确主文件/备份读取、完整分页、原生归属优先级、严格 latest Turn `startedAt`、扫描指纹重试与 fail-closed 完整性门禁。
3. 将 [codex.ts](../../../../src/domain/codex.ts#L1) 和 [codexController.ts](../../../../src/runtime/codexController.ts#L1) 升级为会话投影 V3：1–365 天滚动窗口、五页签、项目结构、统一倒序、stale 快照和隐私安全迁移。
4. 增加最后页签/折叠状态、别名、本地置顶顺序、本地移除项目集合；只保存散列身份和稳定项目指纹。
5. 重构 [FloatApp.vue](../../../../src/FloatApp.vue#L1)：页签置顶、统一搜索、真实额度文字、项目分组、第一版紧凑操作、多选、焦点、抽屉与原位二次确认。
6. 重构 [CodexWaterBall.vue](../../../../src/components/CodexWaterBall.vue#L1)：移除悬浮迷你详情/5h 假标签，中心只显示最近重置的真实额度，Weekly 存在时绘制 5px 完整轨道与剩余圆弧。
7. 将 Codex 命令接入独立快捷键域，并向悬浮子窗同步解析后命令；输入框保留原生编辑键，同层冲突才阻止配置。
8. 实现短期 action alias + 任务版本 + 项目指纹的真实单条归档；归档后完整核验 `archived=false/true` 两侧，失败不乐观删除。
9. 实现项目全历史归档：跳过 active、20 条一批、并发 2、逐项双向核验并返回部分失败；该阶段的“从 EyPc 移除”本地语义已由步骤 37–40 取代。
10. 扩充自动化：主文件/备份、分页/游标、指纹、归属、时间边界、五页签、搜索、别名/置顶/迁移、快捷键、确认、批量失败与归档验证。
11. 在 380px/330px 完成第一版浏览器视觉核验，覆盖 Weekly-only 23% fixture、双/无额度、圆环、项目顺序、无 Console error 和键盘路径。
12. 使用 [codex-real-preflight.mjs](../../../../scripts/codex-real-preflight.mjs#L1) 执行生产桥接真实只读预检；使用 [codex-archive-lifecycle-check.mjs](../../../../scripts/codex-archive-lifecycle-check.mjs#L1) 创建专用临时任务完成真实归档/恢复双向验收并最终归档清理。
13. 运行全量测试、类型检查、生产构建、uTools runtime、diff 和文档链接门禁，同步 Controlled 六件套及项目当前权威。
14. 按交互修订 2 将任务/项目操作改为固定 32px 槽位的常显短字符，保留同槽 `确`，移除圆点、图标、hover 展开与宽度动画。
15. 只从 Codex 悬浮子窗移除 `OperationTooltipLayer` 及原生 title 数据；步骤 37 恢复状态槽/短字符按钮自有 200ms 不透明说明，主程序其他页面的统一 Tooltip 不受影响。
16. 将 Space 改为原位切换；实现两项起自动显示的绝对浮动批量栏，并按焦点/末选项所在半区在顶部或底部重定位，保证列表行零位移。
17. 扩充组件/CSS/快捷键自动化并在 380px、330px 与 104px compact 完成无 Tooltip、无横溢、固定 32px 槽、批量栏上下避让及 Space 原位的浏览器验证。
18. 同步修订 2 的 Controlled/项目/个人产品文档，重跑全量门禁、真实只读预检与专用临时归档生命周期。
19. 按交互修订 3 增加 App Server 状态通知与 200ms 单飞轻量活动扫描；状态变化匿名增量投影，库存结构变化才触发完整 V2 扫描，连续失败退避到 1s。
20. 将任务区域扩为 `全部 / 待输入 / 动态 / 已完成 / 已隐藏 / 项目` 六页签；动态页按待输入、当前动态、已完成未查看分段，并在水球左上/右上展示三种非零计数。
21. 恢复子窗自有的不透明详情说明：任务 500ms，状态与短字符操作 200ms；保持无原生 `title`、无主应用 Tooltip 层和无额度气泡。
22. 将整行点击改为直接打开，选择限定在左侧槽与 Space；Space 新增选择后下移。实现唯一高亮的鼠标/键盘所有权、右键完整抽屉、单项/批量动作隔离、抽屉方向键/Enter/Ctrl+数字和全页 F Quick Jump。
23. 增加 `codex.float.activate` 与静态 uTools 入口，直接显示、展开并聚焦卡片；成功打开完成未查看任务推进本地查看水位，项目折叠采用乐观反馈，自动收起缩短到约 100ms。
24. 更新组件、桥接、Runtime、快捷键和集成自动化，重点覆盖 200ms 活动通道、六页签、三角标、说明延时、Space 下移、动作隔离、右键/Quick Jump 和全局激活。
25. 在完整测试、类型、构建、uTools、380/330px 视觉、真实只读预检和文档链接均通过后，将修订 3 记录为 accepted；不重复执行已通过的真实归档生命周期，不操作用户现有任务。
26. 在修订 3 的干净基线上复核用户列出的跨 Tab 能力，保留六页签、200ms 活动通道、批量栏和归档协议，只迁移状态机/右键/焦点/预览/Quick Jump 合同，明确拒绝 payload、草稿持久化、主窗口 Tooltip/ConfirmLayer 和主窗口焦点所有权。
27. 将额度升级为普通/Spark V2，读取 `rateLimitsByLimitId` 与动态 `model/list`；增加普通 5 小时→普通周→最高 Spark 的水球投影、Spark `S` 和 `quota-auto` 默认模型解析。
28. 增加专用瞬时新会话桥接与 editor：冻结/刷新确认模型，精确 `thread/start` 模型/cwd 且关闭 provider fallback，成功校验后才 `turn/start`/Deep Link；实现零轮清理、短期重试打开、提示词零持久化和 App Server 不可用的显式空白页路径。
29. 该阶段将会话行改为单击选择、双击/Enter 打开并让项目只常显 `＋`；其交互已由步骤 37 的 RAW-052 修订取代。右键/Ctrl+右完整抽屉、纯 Shift 白名单预览与 Quick Jump 过滤继续保留。
30. 注册可改键的 Codex profile `Ctrl+T`，让浮窗使用主窗口同一 `when`/layer 解析并独立维护 `codex-composer` 输入角色与暂态 LIFO；补齐额度、模型、composer、快捷键、Shift、Quick Jump、失败清理和重试打开测试。
31. 用本机生成的 App Server JSON schema 与只读 `model/list`/`account/rateLimits/read` 核对协议；完成 380/330/104px 浏览器视觉、全量测试/类型/构建/uTools、canonical/public preload 同步、Markdown code-link audit 和受控文档收口。真实系统听写与真实 `turn/start`/Deep Link 留作单独宿主验收，不在本轮创建真实任务。
32. 按交互修订 5 将收起水球改为上下半区命中：删除角标 hover 展开，上半区只保留数字角标直接点击，下半区 pointer enter/move 才立即展开；补充几何命中回归并重跑全量测试、类型、构建/uTools 与文档门禁。

33. 按 RAW-051 给 `CodexColorSettings`、默认值与三个预设补齐显式 `cardForeground`，迁移旧配置；卡片改为整对 `4.5:1` 校验并保留水球深色及派生态 `3:1` 门禁。
34. 在配置页用单一双色模态替换卡片原生单色输入：两组常显 HSL/HEX、本地最后有效预览、错误关联、焦点圈定、取消零写入和确认一次完整提交；Controller 同样拒绝单字段或非法补丁。
35. 删除浮窗误实现的水纹主/辅色编辑器，只保留既有透明度、水球视觉及其他增量；补齐单项 `详情 → 更多操作 → 关闭` 的 Esc/Ctrl 左右栈、稳定动作焦点、原会话行恢复、确认优先和批量单层关闭。
36. 增加迁移/预设/HSL/对比/原子更新/模态事务/ARIA/焦点/Esc 回退测试；完成 `1180/760/420px` 与短高度浏览器检查、全量测试、类型、构建/uTools、diff、文档链接、错误记忆和同步 receipt 收口。

37. 按 RAW-052 将任务/项目操作分别固定为 `顶/隐显/归/+` 与 `顶/移/隐显/+` 的四个 `30px` 常显槽；行单击直接打开，左状态槽/Space 才选择，Space 新增后下移。状态槽与短字符按钮使用子窗自有 200ms 不透明说明，Quick Jump 改为普通深色/激活黄色高对比标记。
38. 用 `hiddenProjectKeys/hiddenProjects` 取代旧本地移除路径：隐藏只影响项目页分组并提供恢复区，任务页签和计数不变；迁移丢弃旧 removed 集合。同步 Runtime actions、Renderer 投影和测试契约。
39. 在 preload 实现真实 Codex 项目移除：Codex Desktop 运行门禁、主文件-only 读取、短期 alias/来源指纹/结构核验、限定四字段变更、主/备临时同步和原子替换、双文件重读验证与失败回滚；成功后清理项目本地元数据并完整刷新。
40. 同步 Controlled/产品/项目/设计偏好/AI 理解文档及测试契约；遵守用户验收规则，不运行任何测试、类型、构建、uTools、截图、真实预检、真实归档或项目移除。状态保持 `reported / 未校验，待用户验收`。
41. 按 RAW-053 修复置顶的可见反馈：在投影阶段为所有任务/项目卡片统一写入原生/本地 `pinSource`，并在每个任务页签及动态页状态段内稳定前置置顶项；项目置顶继续进入 `Pinned`，本地项显示“本地顶”。
42. 补充置顶投影/当前页位置/ARIA 状态与桥接失败提示的测试契约，同步 Controlled、产品、项目、设计偏好和个人产品理解；仍不执行任何开发门禁。
43. 按 RAW-054 将双色编辑器升级为两个同时可见的饱和度/亮度二维取色板；斜纹弱化不可选对比色域，选择一侧时保留另一侧色相/饱和度并移动到最近满足 `4.5:1` 的亮度。
44. 将每组标题色块改为可点击色卡入口，在所属色板原位展开 12 个命名候选色卡；接入方向键、Esc、外部点击、焦点恢复，并让色卡选择复用联动草稿和最后有效 HEX 事务。
45. 在 Controller 增加内存暂态配色预览，Runtime 注册 preview/cancel/commit 三个动作；真实悬浮伴侣实时消费预览，水球保存态仅在预览期间临时显示卡片，取消/卸载恢复保存样式和颜色，确认只保存一次完整颜色对象。
46. 清除 [FloatApp.vue](../../../../src/FloatApp.vue#L1) 中误加的水纹配色编辑入口、状态和样式；悬浮子窗保持展示-only，水纹配置只留在 Codex 配置页。
47. 补充最近可读色、二维取色板/色卡键盘、真实浮窗预览/回滚/一次提交和无浮窗水纹控件回归；完成 `1180×800 / 760×800 / 420×800 / 760×420` 浏览器矩阵、聚焦测试、typecheck、build/uTools、全量基线、文档/错误记忆/链接/receipt 收口。
48. 按 RAW-055 修复任务显示名称投影与单一主标题；将展开态字体提升为 `12/10/9px`、四槽缩至 `24px`、行高压至 `40px`，保留原名搜索、详情和 Shift 预览。
49. 将任务点击改为两态状态机：普通态中部打开、左槽进入选择；选择态中部/左槽切换成员并在最后一项移出后退出。补齐渐变选中、组合 hover/focus/active、左槽 `aria-pressed` 与快捷键共用反馈，更新测试/文档但不执行用户独占开发门禁。
50. 按 RAW-056 在 preload 增加 macOS Codex Desktop 私有 IPC 伴随桥：安全校验 socket owner/mode、固定协议版本握手、snapshot/patch/follow/request/read-state 投影、断线重连与不兼容 fail-closed；会话正文和 raw identity 只在 preload 瞬时处理。
51. 扩展 Host/Projection/Activity Delta 合同，显式携带 `desktopBridgeState`、`statusAuthority`、`hasUnreadTurn` 与 `unreadAuthority`；删除五秒状态启发、App Server live 推断和本地 receipt 未读推断。旧 V1 delta 仅作 connector 兼容，不产生 Input/active。
52. 调整 Controller 与浮窗：普通 watchdog 改为 5s、三次失败后 1s；当时动态页拆分待输入/正在进行中/需关注/宿主状态未知/已完成未读，角标只统计桌面权威状态；RAW-064 后以“进行中含异常状态、未知独立”取代可见 attention 段，设置页区分 App Server 数据连接器和桌面实时桥。
53. 在 App Server 归档双向验证后发送 Codex Desktop `thread-archived` v2 通知；单条/项目结果区分通知已派发与桌面未确认即时刷新，通知失败不回滚已验证持久化归档。
54. 更新 domain/runtime/platform/UI/preload 测试契约及 Controlled、canonical、architecture、technical details、CodeNote 产品理解；遵守用户验收规则，不运行测试、typecheck、build、uTools/runtime、截图、真实预检、真实归档或项目移除。
55. 按 RAW-057 强化选择区分：增加常驻模式条和实时计数，未选行降权，选中行改为粗边/左轨/强底色，左控件以实底勾选替代状态图标；同步测试、设计偏好、错误记忆与交接，仍不执行用户独占开发门禁。
56. 按 RAW-058 融合修正多选、置顶和角标反馈：左区改为 38px 全高矩形并恢复状态图标，选中行使用主题三色渐变，补齐 Ctrl/Cmd 中部选择与子按钮键盘所有权；移除行尾“本地顶”，把来源/只读门禁集中到“顶”；将 200ms 共享说明层移出展开分支并接入三个紧凑角标；同步测试契约、设计偏好、错误记忆和交接，仍不执行用户独占开发门禁。
57. 按 RAW-059 在 preload/public preload 增加独立的本机手动 CLI 位置偏好；复用受控 launch plan 验证 native、Node wrapper 与 Windows shim，环境快照只回传脱敏的启动来源、候选标签与手动状态。
58. 扩展 domain/platform/controller/action 边界：手动设置、清除和自动发现走同一 Host port；成功 App Server 往返只更新连接证据，不覆盖 preload 的 runtime/process/Desktop 实时桥分类。
59. 在 Codex 配置页增加手动位置、自动发现结果、macOS/Windows 查找提示和连接器降级说明；使用原生 form/button，错误关联输入，明确 connector fallback 不推断 Input/进行中/完成未读。
60. 同步 RAW-059 Controlled、canonical、项目状态、架构与技术细节；按用户独占验收规则仅做静态差异/文档链接核对，不运行测试、typecheck、build、uTools、截图、真实预检或归档。

61. 按 RAW-063 将 `FloatApp` 的可见导航收敛为 `动态 / 已完成 / 已隐藏 / 项目`，移除 `all/input` 的渲染分支和点击映射；保留底层数组与单待输入直开，并把旧持久化、旧快照和外部动作的 `all/input` 规范化为 `ongoing`。
62. 用最新 Turn 的 `max(startedAt, completedAt)` 保持常规窗口资格，并在动态页固定筛选最近 6 小时的非隐藏任务；RAW-064 后的当前分段另行收敛，动态徽标仍复用同一结果。
63. 将标题普通点击/ Ctrl-Cmd 选择与元信息行聚焦分开；把操作轨收敛为 `24px / 2px / 102px`，注册提示收敛为“最近 N 天的 M 条”，移除水球 Weekly SVG 外环和失效配置入口，同时保留历史外层持久化字段。
64. 同步 RAW-063 的 Controlled、产品、项目、技术细节、设计偏好和交接；仅做静态源码/文档核对，不新增或修改测试，也不运行测试、typecheck、build、uTools、截图或真实宿主操作。

65. 按 RAW-064 在 [FloatApp.vue](../../../../src/FloatApp.vue#L1) 将 `failed / interrupted / system-error` 合并到“正在进行中”渲染分段，删除 Renderer 的“需关注”入口；保留错误行真实文案、图标/颜色、未知分段和领域兼容计数。
66. 在 [codexPresentation.ts](../../../../src/domain/codexPresentation.ts#L1) 移除紧凑 ARIA 的“需关注”措辞，同时合并其兼容数量到“进行中或等待操作”；不改真实 desktop-live 角标、归档门禁或状态权威。
67. 将选择模式提示移动到 [FloatApp.vue](../../../../src/FloatApp.vue#L1) 列表舞台底部，并在 [float.css](../../../../src/styles/float.css#L1) 以绝对定位、滚动安全区和底部批量栏上移实现无重排避让；保留顶部批量栏和既有选择/ARIA/键盘合同。
68. 同步 RAW-064 的 raw、spec、plan、tasks、verify、handoff、canonical、项目状态、架构、Soul、设计偏好和既有候选错误记忆；不新增或运行测试、typecheck、build、uTools、截图或真实 Codex 操作，交付保持用户验收权威。

69. 合并项目设计偏好索引中的两组同义交互标签，使单条稳定偏好恢复为 16 项；取得 `codex-companion + visual-polish + durable-project` ready 回执，沿用现有组件语言且不引入额外 UI Skill 或依赖。
70. 按 RAW-065 在 [CodexWaterBall.vue](../../../../src/components/CodexWaterBall.vue#L1) 恢复 Weekly 连续/20 段数据进度环，删除表面 inset、静态 border、inset outline、装饰 shell、根整圆背景与同尺寸外发光；在 [float.css](../../../../src/styles/float.css#L1) 删除水球按钮的外部圆形 focus outline，并以中央读数下划线保留键盘焦点提示；在 [codexAppearance.ts](../../../../src/domain/codexAppearance.ts#L1) 和 [CodexPage.vue](../../../../src/pages/CodexPage.vue#L1) 恢复环 tokens、对比校验与可见设置，不恢复轮廓透明度入口。
71. 按 RAW-066 在 [codex.ts](../../../../src/domain/codex.ts#L1) 将原始 interrupted 投影为可见 ongoing，调整 running/ongoing/attention 计数并继续从原始 `lastTurnStatus` 计算归档能力；同步 [codexController.ts](../../../../src/runtime/codexController.ts#L1)、[FloatApp.vue](../../../../src/FloatApp.vue#L1) 与 [float.css](../../../../src/styles/float.css#L1) 的证据、文案、图标和颜色。
72. 同步 RAW-065/066 的 Controlled、canonical、项目状态、架构、Soul 和长期偏好；新增“视觉层误删”和“provider 原始状态泄漏 UI”两个候选错误记忆，不保存原始对话或截图。
73. 仅执行静态 diff、`git diff --check`、用户可见字符串检查和 Markdown 代码链接审计；不修改或运行测试，不运行 typecheck、build、uTools、截图或真实 Codex 操作。

74. 复用 `codex-companion + interaction-flow` ready 偏好回执及现有 Vue Composition API 模式，在 [FloatApp.vue](../../../../src/FloatApp.vue#L1) 统一紧凑角标目标解析：待输入取 `inputRequired`，完成未读从 `all` 筛选完整 `completed-unread` 集合，两者均按既有显示层置顶/稳定顺序取第一条。
75. 将待输入和完成未读的一条/多条点击统一路由到首条 `openTask → codex.task.open`，保持进行中展开、未读/隐藏/页签/计数/样式不变，并让 200ms 说明与 ARIA 明确“打开第一条”；不新增 API、类型、持久化、依赖或测试改动。
76. 同步 RAW-067 的 Controlled、canonical、项目状态、架构、技术细节、Soul 和设计偏好；复用既有计数/列表投影错误记忆，仅执行静态差异、字符串、`git diff --check`、Markdown 链接与偏好收口，交付保持用户验收权威。

77. 按 UI 偏好门禁取得 `codex-companion + interaction-flow + durable-project` ready 回执，窄用既有 interaction-design 上下文保持固定动作槽和稳定禁用反馈，不引入新依赖或额外 UI 结构。
78. 按 RAW-068 在 [codex.ts](../../../../src/domain/codex.ts#L1) 让投影 ongoing 与 desktop-live active 共用 `blocked-active`；[codexController.ts](../../../../src/runtime/codexController.ts#L1) 不再为该状态发送 terminal 证据；[preload/index.js](../../../../preload/index.js#L1) 的单条归档拒绝 interrupted，项目归档将其加入进行中跳过集合并限定 terminal 只接受 failed。
79. 同步 RAW-068 的 Controlled、canonical、项目状态、架构、技术细节、Soul、设计偏好和两条相关错误记忆；仅执行静态差异、字符串、镜像一致性、`git diff --check`、测试文件零差异和 Markdown 链接审计，不修改或运行测试，不运行 typecheck、build、uTools、截图或真实 Codex 操作。

80. 复用 `codex-companion + interaction-flow + durable-project` ready 偏好回执与 interaction-design 的可中断连续性原则，在 [codexController.ts](../../../../src/runtime/codexController.ts#L1) 将 provider 原始投影和 Renderer 展示投影分离，并为 visible running → completed 建立按任务固定 2 秒、重复完成不续期、恢复运行即取消的临时 hold。
81. 在同一 Controller 投影中同步重建任务桶、项目 section、隐藏/完成页、计数和 `blocked-active` capability；2 秒后从最新原始快照一次性释放完成态。[FloatApp.vue](../../../../src/FloatApp.vue#L1) 删除独立进行中角标延迟，避免状态、角标和归档入口错位或累计 4 秒。
82. 同步 RAW-069 的 Controlled、canonical、项目状态、架构、技术细节、Soul、设计偏好与独立候选错误记忆；仅执行静态 diff、字符串/结构检查、`git diff --check`、测试文件零差异、偏好回执和 Markdown 链接审计，不修改或运行测试，不运行 typecheck、build、uTools、截图或真实 Codex 操作。
83. 复用父任务 `1148`，以 `RAW-071` 作为 requirement delta：范围仅限 Codex 配置页、颜色持久化/派生和 Controller 更新路径；不改额度、会话、归档、Host、preload、数据库、依赖或外部服务。当前目标文件已有无关脏树增量，只在其现状上追加本条逻辑，不回退任何既有修改。
84. 完成 `codex-companion + full-ui + task-only` 偏好查询：无候选/冲突，沿用当前项目组件与运行时架构；将 design-system 和 platform-ui-architecture 的缺失项显式按项目默认处理。外部 `redesign-existing-projects` 指引地址不可用，回退现有 Vue/CSS 语言，不引入依赖。
85. 在 [CodexPage.vue](../../../../src/pages/CodexPage.vue#L1) 重构外观区域为水球、卡片、状态信号三块，加入可读部位预览与直接更新；卡片不再打开配对颜色模态。保留已有预设/保存、显示、诊断、任务、刷新、模型和快捷键 action 路径。
86. 在 [codex.ts](../../../../src/domain/codex.ts#L1)、[codexAppearance.ts](../../../../src/domain/codexAppearance.ts#L1) 和 [codexController.ts](../../../../src/runtime/codexController.ts#L1) 移除颜色格式/对比度/联动/回滚门禁，令存储、派生 CSS vars 与 Renderer 使用同一直接颜色值；同步 [codex.css](../../../../src/styles/codex.css#L1) 的重构布局，不改浮窗的业务交互。
87. 更新 RAW-071 的 raw/spec/tasks/verify/handoff、PROJECT_STATUS、Developer Soul 和既有配色错误记忆（标记旧联动验证路线为 superseded）；执行静态源码/字符串检查、`git diff --check`、Markdown 代码链接审计和用户可见页面检查。用户未选择测试，故不新增/修改/运行测试，也不运行 typecheck、build、uTools、截图或真实 Codex 操作。
88. 以用户截图触发 RAW-072：撤回“预览复用旧真实水球”的方向，改为以配置页预览为视觉权威；真实浮窗与预览必须共用同一水球渲染，不保留两套会漂移的水面、环或角标 CSS。
89. 在 [CodexWaterBall.vue](../../../../src/components/CodexWaterBall.vue#L1) 收敛球体、液体、Weekly 环和角标承载样式，并让 [CodexPage.vue](../../../../src/pages/CodexPage.vue#L1) 使用该组件；保持现有颜色直通、数据环条件和角标动作。
90. 更新 RAW-072 的 Controlled 文档、项目状态与视觉偏好；执行静态结构/直接引用检查、`git diff --check` 和 Markdown 链接审计。用户未选择测试，故不新增/修改/运行测试，也不运行 typecheck、build、uTools、截图或真实 Codex 操作。
91. 以 RAW-073 为同一水球渲染增加持久化的 `0%–100%` 球体底色透明度，并在真实浮窗/配置页共同消费；透明底色不得带走液体、Weekly 环、读数或角标，也不得触发自动补色或回滚。同步 Controlled 文档后执行静态结构、`git diff --check` 与链接审计；不运行测试、typecheck、build、uTools、截图或真实 Codex 操作。
92. 以 RAW-074 回退水球的静态/普通液体简化，恢复原有分层水波和 motion 动画；保持共享实时预览与底色透明度，去除简化路径产生的底部矩形层，并将配置标签逐项贴近真实渲染层。
93. 以 RAW-075 将卡片区明确为悬浮展开卡片：使用与真实 card surface/foreground 相同 token 的页签、搜索、额度和任务预览，标签说明表面与文字/图标各自影响范围；不与收起态横卡或水球控件混淆。
94. 以 RAW-076 将大卡片从两个笼统颜色扩展为九项独立主题令牌；使内置/保存主题、设置归一化、Controller 浮窗快照、配置预览与真实展开态消费同一持久化对象，并保持收起态水球/小卡片皮肤独立。
95. 以 RAW-079 将任务级完成展示窗改为 `completionPresentationDelayMs` 持久化配置，默认 1500ms、仅允许离散延迟值；Controller 在创建新 hold 时读取它，普通非输入活动的 2 秒去抖不变。
96. 以 RAW-079 在水球外观区新增独立的百分比读数配置组，持久化位置、字号、字形和颜色；预览和实际浮球继续只使用共享 `CodexWaterBall`，内置和已保存主题覆盖完整对象。
97. 同步 RAW-079 Controlled、项目当前态、架构、技术细节、Soul、偏好与完成稳定窗错误记忆；执行静态结构、JSON、`git diff --check`、代码链接审计和设计偏好收口，不运行用户保留的测试、typecheck、build、uTools、截图或真实 Codex 操作。
98. 按 RAW-080 将 Activity Delta 的状态分流改为逐任务排队：已完成已读回流到未读或 desktop-live 进行中立即发布；进行中→completed/completed-unread 继续走共享 completion hold，进行中→failed/system-error 使用同一配置时长，其他非输入变化维持 2 秒。
99. 同步 RAW-080 Controlled、项目当前态、架构、技术细节、Soul 和完成转换错误记忆；只做允许的静态结构、`git diff --check`、JSON、链接审计与设计偏好收口，不运行用户保留的测试、typecheck、build、uTools、截图或真实 Codex 操作。
100. 按 RAW-081 在 Desktop bridge 中保留 live unread 缺失时的最近可信 persisted fallback，明确 live read-state 优先；对既有 user-input / approval request type/method 做受限分隔符归一化，不改变 `desktop-live active` 的唯一待输入权威。
101. 同步 RAW-081 Controlled、项目当前态、架构、技术细节和跨进程状态错误记忆；仅做 preload/public 镜像、字符串、`git diff --check` 和代码链接静态核对，不运行用户保留的测试、typecheck、build、uTools、截图或真实 Codex 操作。
102. 按 RAW-082 新增完成未读的共享 Runtime action：角标和 uTools 全局功能使用同一置顶优先首条解析；立即写入 EyPc 本地的完成 revision 已读确认并重新投影所有计数/列表/项目视图，待输入保持只打开。
103. 同步 RAW-082 Controlled、项目当前态、架构、技术细节、Soul、错误记忆与全局功能配置；只做允许的静态语法、JSON、字符串、`git diff --check` 和代码链接审计，不运行用户保留的测试、typecheck、build、uTools、截图或真实 Codex 操作。
104. 复用父任务 `1148`，以 RAW-083 作为紧凑悬浮窗交互增量：待输入角标置于左下，进行中和已完成未读组成右下纵列；主体仅上方三分之一可展开卡片，下半区仅作为拖拽起点，中间三分之一不触发展开或拖拽。保留角标点击、键盘显式激活、触屏不模拟 hover 与既有 5px 拖拽阈值；不改任务、额度、Host、持久化、依赖或测试。
105. 完成 `codex-companion + full-ui + task-only` 偏好查询，修复交互索引超过 16 个标签导致的门禁漂移；采用既有 `interaction-design` 的分区互不抢占原则。文档影响为 `requirement-canonical + project-current + controlled-task`，同步 spec/tasks/verify/handoff、项目状态、架构、技术细节与 Soul；用户未选择测试，故只进行静态源码、JSON、`git diff --check` 与代码链接审计。
108. 按用户更正细化 RAW-083 右下纵列：已完成未读占据最右下角，进行中上移一格；不改变左下待输入、主体命中区、计数动作、键盘/触屏路径或窗口拖拽协议。复用已通过的同任务偏好回执，仅做 CSS 定位和受控文档净增量，不新增或运行测试。
106. 以 RAW-084 增加前/后 Codex 任务两个 uTools 全局功能：FeatureRoute → Runtime Action → Controller 保持唯一动作链，候选按待输入→完成未读→进行中、置顶优先稳定排序并按匿名 key 去重；首次前/后分别取尾/首，之后循环回绕。只打开，不确认完成未读或改变任何任务状态；循环位置仅在 Controller 内存保存。
107. 在 Codex 配置页为两项功能分别提供 uTools 全局快捷键配置入口；同步 Controlled、canonical、项目当前态、架构、技术细节、Soul 与偏好索引。用户未选择测试，故不新增/修改/运行测试，也不运行 typecheck、build、uTools、截图或真实 Codex 操作；仅做静态源码、JSON、`git diff --check` 与 Markdown 代码链接审计。
109. 历史 RAW-085 曾在相同配置区域回显前/后任务的当前 uTools 绑定；该实现因私有同步宿主 IPC 导致 uTools 入口卡死，现由 RAW-087 删除。
110. RAW-086 先从启动、焦点和可见性路径移除读取、仅保留手动刷新；用户随后确认插件恢复加载，该中间态由 RAW-087 完全取代。
111. 以 RAW-087 删除 preload 私有同步快捷键 IPC、平台 readback 类型、Controller/Runtime 快照与刷新动作，以及 Codex/窗口槽的绑定回显；只保留官方 `redirectHotKeySetting` 单向配置入口。通过全仓残余搜索、preload 语法和镜像一致性验证删除完整性。
112. 将 Codex 配置页改为置顶五 Tab：默认双列“快捷方式”，其余为“任务 / 水球 / 卡片 / 运行”；仅渲染当前分面，把默认入口前的诊断移到运行页。提供方向键/Home/End Tab 导航，窄屏允许横向滚动并将快捷入口回落为单列。
113. 依 `distill` 的渐进披露原则，把诊断详情、CLI 降级、外观部位、百分比与窗口尺寸说明移入可聚焦 `i` 提示；同步 Controlled、canonical、项目当前态、架构、技术细节、Soul 和错误记忆。只做 Vue SFC 静态编译、preload 语法/镜像、差异与 Markdown 链接审计，不运行测试、typecheck、build、真实 uTools、截图或 Codex 操作。
114. 以 RAW-088 将 `CODEX_THEME_PRESETS` 扩展为 12 套，并统一为默认海盐材质：实体圆环、不透明球体底色、gradient 液体与软光晕；十二套仅以色相区分。同步 Controlled、canonical、项目当前态、架构、技术细节、Soul 与偏好索引。按用户独占验收规则不运行测试、typecheck、build、uTools、截图或真实 Codex 操作。
115. 以 RAW-089 复核本机实际配置与 3 分钟稳定态：确认当前 `taskRefreshSeconds=15`、`completionPresentationDelayMs=1500`，并将固定 2 秒活动防抖与完整库存轮询区分。设计为 Desktop push 驱动、active 退出后单任务 latest-Turn 核验、15 秒仅作结构校对。
116. 在两个 preload 镜像中实现 3 秒有界、单飞、可取消的定向 `thread/turns/list(limit=1)`；只通过 Activity Delta V2 放行脱敏 Turn 状态/时间，失败才触发完整库存刷新。Controller 立即消费 delta，删除固定 2 秒队列，让完成展示窗从真实 active 退出事件起算。
117. 在领域投影、浮窗分组/标签/图标、计数和归档门禁中，将 failed/interrupted/systemError/unknown/notLoaded/inProgress/权威缺失统一归为 `ongoing/running/blocked-active`；只有 latest Turn completed 进入完成与可归档。删除 interrupted 60 秒完成推断，并将任务设置文案改为“完整校对频率”。
118. 更新领域、Controller 与 preload 测试合同，但依项目规则不执行；同步 RAW-089 Controlled、canonical、项目状态、架构、技术细节、Soul、设计偏好和候选错误记忆。执行 preload 静态语法/镜像、字符串、JSON、diff whitespace 与 Markdown 链接审计；真实状态切换仍由用户验收。
119. 以 RAW-090 把“新快照缺少已展示任务”从立即删除改为内存候选：保留上一份稳定清单、立即完整复核，且只在同一 missing-key 集合跨 `max(15s, taskRefreshSeconds)` 连续成立后接纳数量下降。
120. 为 Activity Delta 与完整快照增加单调 latest-Turn 证据合并：拒绝更旧 `startedAt`、同 Turn completed→异常回退、`completedAt` 回退和 `updatedAt` 变小，但不延迟 exact desktop-live active 和更新 Turn。
121. 保留显式删除快路：已验证的单条/项目归档与原生项目移除立即从 Controller 清单移除目标，并清理消失候选，不进入传输抖动窗。
122. 更新 Controller 测试合同、RAW-090 Controlled/canonical/个人 APP 派生理解与独立候选错误记忆；仅执行项目允许的静态差异、语义搜索和 Markdown 链接审计，不运行测试、typecheck、build、uTools 或真实抖动。
123. 以 RAW-091 复核“4 个进行中但实际 2 个”的本机匿名聚合证据，区分两条 exact desktop-live active 与两条 exact live idle + latest Turn interrupted；把 GPT/进程崩溃、用户主动停止或关闭 Codex 纳入明确停止边界。
124. 在领域投影增加 `stopped/stopped/blocked-stopped`，限定为 failed/interrupted + live idle 或 bridge not-running；保持 desktop-live active 优先，所有 bridge failed、协议/传输异常与缺失证据继续 ongoing。动态页新增“已停止”段，不新增页签，停止态不进入进行中计数/角标/循环或完成归档。
125. 将 Controller active-exit 新鲜度门禁扩展到所有 terminal outcome，避免第一份 idle delta 携带旧 interrupted/failed 时突兀闪为停止；更新 preload 自适应高度与领域/Controller/UI/桥接测试合同。
126. 更新 RAW-091 Controlled、canonical、项目状态、架构、技术细节、Soul、设计偏好、个人 APP 派生理解与既有 provider-status 错误记忆；执行只读真实预检、静态差异/语义/JSON/镜像/Markdown 链接核验，不执行测试、typecheck、build、uTools 或截图。
127. 以 RAW-092 将新增任务、首次待输入、turn started/completed 和未知任务事件标记为 urgent：Controller 以 50ms 合并触发结构快读，若事件发生在读取中则在结束后补读一次，避免落入 15 秒周期。
128. 在 preload 建立会话期 latest-Turn 缓存与 raw-thread dirty generation；事件快读只重读 dirty/无缓存任务，无事件周期读仍全量，未登记 Desktop 主任务 shadow 只在完整库存建立匿名身份后发布。
129. 对 `targeted-after-exit` completed 强证据绕过完成展示窗；保留普通完成配置窗、RAW-090 missing-key 跨周期隔离、RAW-091 stopped 证据和所有不确定状态进行中。
130. 更新 RAW-092 代码合同、Controlled/canonical/个人 APP/错误记忆，执行静态 diff、preload 语法/镜像、JSON/语义与 Markdown 链接审计；不执行测试、typecheck、build、uTools、截图或真实转换。
131. 以 RAW-093 对照本机 Desktop 当前协议，确认计划 Turn 完成后以未决 `item/plan/requestImplementation` 等待用户确认，并把该有限方法归入 `waitingOnUserInput`。
132. 让未决明确请求覆盖同批 idle runtime，直接通过 Desktop live 匿名 delta 发布待输入；请求移除后恢复 runtime/Turn 投影，未登记任务继续走 RAW-092 匿名注册门禁。
133. 增加 idle + Plan request 零库存读取测试合同，同步 Controlled/canonical/个人 APP/错误记忆并执行静态语法、镜像、diff、语义与链接审计；不执行测试、typecheck、build、uTools 或真实计划确认。
134. 以 RAW-094 连续三分钟读取本机 Desktop live 与 latest Turn，确认进行中集合在非 active 与旧 active snapshot 之间反复切换，并追踪到未观察私有 patch 被误当作协议失败后触发退订重订。
135. 将 Desktop shadow patch 解析改为观察子集：结构正确的其它 root 只推进 revision，受观察状态字段格式损坏仍重订；扩展桥接合同覆盖深层私有 Turn patch + 同批 idle，确保不重订且完成定向核验仍执行。
136. 使用修正后的本机 bridge 做 30 秒只读复核并记录 `59 patch / 0 resubscribe / 0 replacement snapshot`；同步 RAW-094 Controlled/canonical/个人 APP/错误记忆/HMR 运行提示，执行静态语法、镜像、diff、语义和链接审计，不执行测试、typecheck、build、uTools 或真实完成操作。
137. 追踪外部 Codex 归档：确认 `thread-archived` 仅标记普通库存刷新，后续完整快照又受 RAW-090 missing-key 隔离，导致已归档任务仍可停留至少一个校对周期。
138. 仅在 preload 已有 raw ID → 匿名 key 映射时，把明确归档事件编码为 V2 `archivedKeys`；Controller 同步清除精确 key 的任务、短暂完成状态与本地 receipt，并安排 urgent 复核。未映射、unarchive/delete 与普通缺项不走该快路。
139. 同步 RAW-095 Controlled/canonical/current/memory 记录；仅执行镜像、入口同步依赖、diff 和文档链接等静态核验，不运行测试、typecheck、build、uTools 或真实归档。
140. 以 RAW-096 标记每段 Desktop-live active 的匿名本机观察时刻；完整库存重投影不得刷新旧 shadow 的时刻，失去 live authority/离开 active 时清除，Side Chat 聚合仅取仍 active 的最新时刻。
141. 在 domain/Controller 只让明确 latest Turn `completedAt` 晚于该时刻时压过 active；不以 timeout、recency、connector 或缺失 Turn 猜完成，并保留 RAW-089–095 的异常、停止、归档与库存边界。
142. 增加匿名 observation-time 的 bridge/domain/Controller 合同，同步 RAW-096 Controlled/canonical/current/error memory；仅执行镜像、同步 IPC 残余、diff 与链接静态核验，不运行测试、typecheck、build、uTools、截图或真实任务操作。
143. 追踪用户在 Codex 手动阅读后完成任务重回进行中的路径，确认 `thread-read-state-changed` 与仅 `hasUnreadTurn` patch 会把完整当前 shadow 重新发入 Activity Delta，而不是只更新未读。
144. 为 V2 entry 增加 `readStateOnly`；preload 对主/Side Chat read-state 及只读 patch 只发送匿名 key、unread 值/权威，Controller 只应用这些字段，完整 runtime/request 变化继续走 activity delta。
145. 增加 direct-read、unread-only patch 与 Controller 防重启合同，同步 RAW-097 Controlled/canonical/current/error memory；仅执行镜像、同步 IPC 残余、diff 和链接静态核验，不运行测试、typecheck、build、uTools、截图或真实阅读操作。
146. 以 RAW-105 收敛循环空候选的回退：不新增任务持久化或 Host 调用；仅在既有常规循环没有可打开任务时，从当前投影筛选 `pinSource='local'` 的 EyPc 本地置顶任务，继续使用显示排序、action alias/key 门禁与既有内存游标。原生置顶不作为回退；用户未选择测试，不新增或运行测试、typecheck、build、uTools、截图或真实 Codex 操作。
147. 以 RAW-106 将 `stopped` 从前/后任务循环的本地置顶回退中排除；常规候选序列已不含停止态。除该筛选外不变更显示、置顶、游标、打开路径或持久化；不新增或运行测试、typecheck、build、uTools、截图或真实 Codex 操作。

Completion: 1–114 保留既有历史与 RAW-088 状态；115–118 为 RAW-089 的实时完成确认与异常统一进行中；119–122 为 RAW-090 的库存消失稳定、证据单调与显式删除快路；123–126 为 RAW-091 的明确停止边界、退出防闪与文档/错误记忆收口；127–130 为 RAW-092 的正向事件快路、dirty-task 读取、强证据直发和完整同步；131–133 为 RAW-093 的计划待确认协议识别、即时待输入投影与权威同步；134–136 为 RAW-094 的私有 patch 忽略、重订抖动修复与真实只读复核；137–139 为 RAW-095 的明确归档匿名快路与复核；140–142 为 RAW-096 的 active observation 新鲜度边界；143–145 为 RAW-097 的 unread-only 状态隔离；146 为 RAW-105 的本地置顶循环回退；147 为 RAW-106 的停止态排除。按项目验收规则不运行测试、类型、构建、真实 uTools 或截图；RAW-089–097 与 RAW-105/106 均为 `reported / 未校验，待用户验收`。精确交接见 [verify.md](verify.md#L1) 与 [handoff.md](handoff.md#L1)。
