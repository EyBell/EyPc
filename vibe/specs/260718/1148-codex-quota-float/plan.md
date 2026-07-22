# Codex Companion 真实会话与交互实施计划

Tool: codex
Date: 2026-07-22
Status: `reported-unverified-awaiting-user-acceptance`
Requirement version: `2026-07-22.10`

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
52. 调整 Controller 与浮窗：普通 watchdog 改为 5s、三次失败后 1s；动态页拆分待输入/正在进行中/需关注/宿主状态未知/已完成未读，角标只统计桌面权威状态；设置页区分 App Server 数据连接器和桌面实时桥。
53. 在 App Server 归档双向验证后发送 Codex Desktop `thread-archived` v2 通知；单条/项目结果区分通知已派发与桌面未确认即时刷新，通知失败不回滚已验证持久化归档。
54. 更新 domain/runtime/platform/UI/preload 测试契约及 Controlled、canonical、architecture、technical details、CodeNote 产品理解；遵守用户验收规则，不运行测试、typecheck、build、uTools/runtime、截图、真实预检、真实归档或项目移除。
55. 按 RAW-057 强化选择区分：增加常驻模式条和实时计数，未选行降权，选中行改为粗边/左轨/强底色，左控件以实底勾选替代状态图标；同步测试、设计偏好、错误记忆与交接，仍不执行用户独占开发门禁。
56. 按 RAW-058 融合修正多选、置顶和角标反馈：左区改为 38px 全高矩形并恢复状态图标，选中行使用主题三色渐变，补齐 Ctrl/Cmd 中部选择与子按钮键盘所有权；移除行尾“本地顶”，把来源/只读门禁集中到“顶”；将 200ms 共享说明层移出展开分支并接入三个紧凑角标；同步测试契约、设计偏好、错误记忆和交接，仍不执行用户独占开发门禁。
57. 按 RAW-059 在 preload/public preload 增加独立的本机手动 CLI 位置偏好；复用受控 launch plan 验证 native、Node wrapper 与 Windows shim，环境快照只回传脱敏的启动来源、候选标签与手动状态。
58. 扩展 domain/platform/controller/action 边界：手动设置、清除和自动发现走同一 Host port；成功 App Server 往返只更新连接证据，不覆盖 preload 的 runtime/process/Desktop 实时桥分类。
59. 在 Codex 配置页增加手动位置、自动发现结果、macOS/Windows 查找提示和连接器降级说明；使用原生 form/button，错误关联输入，明确 connector fallback 不推断 Input/进行中/完成未读。
60. 同步 RAW-059 Controlled、canonical、项目状态、架构与技术细节；按用户独占验收规则仅做静态差异/文档链接核对，不运行测试、typecheck、build、uTools、截图、真实预检或归档。

61. 按 RAW-063 将 `FloatApp` 的可见导航收敛为 `动态 / 已完成 / 已隐藏 / 项目`，移除 `all/input` 的渲染分支和点击映射；保留底层数组与单待输入直开，并把旧持久化、旧快照和外部动作的 `all/input` 规范化为 `ongoing`。
62. 用最新 Turn 的 `max(startedAt, completedAt)` 保持常规窗口资格，并在动态页固定筛选最近 6 小时的非隐藏任务；按待输入、正在进行中、需关注、宿主状态未知、已完成未读、已完成渲染且使动态徽标复用同一结果。
63. 将标题普通点击/ Ctrl-Cmd 选择与元信息行聚焦分开；把操作轨收敛为 `24px / 2px / 102px`，注册提示收敛为“最近 N 天的 M 条”，移除水球 Weekly SVG 外环和失效配置入口，同时保留历史外层持久化字段。
64. 同步 RAW-063 的 Controlled、产品、项目、技术细节、设计偏好和交接；仅做静态 diff/文档核对，不新增或修改测试，也不运行测试、typecheck、build、uTools、截图或真实宿主操作。

Completion: 1–49 保留既有历史状态。50–59 已实现；60–64 为 RAW-063 的实现、文档与静态核对。按用户独占验收规则未运行测试、类型、构建、uTools、截图或真实 Codex 操作，RAW-056–059 和 RAW-063 均为 `reported / 未校验，待用户验收`。精确交接见 [verify.md](verify.md#L1) 与 [handoff.md](handoff.md#L1)。
