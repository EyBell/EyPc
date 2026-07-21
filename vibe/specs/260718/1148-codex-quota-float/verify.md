# Codex Companion 真实会话与交互验证记录

Tool: codex
Date: 2026-07-21
Status: `accepted-with-declared-host-residuals`

## Review Target

- Requirement: [raw-requirement.md](raw-requirement.md#L1) 的真实项目注册库存、完整未归档分页、严格最近提问时间、30 天窗口、六页签、200ms 待输入活动通道、项目分组、统一搜索、本地元数据、水球真实额度/三状态角标、常显短字符、延时不透明说明、Space 选中下移、单/批量抽屉、自避让批量栏与原生归档。
- Plan: [plan.md](plan.md#L1) 的 Host V2、Projection V3、Renderer、快捷键、归档、真实本机预检、视觉 QA 与文档闭环。
- Implementation: [preload/index.js](../../../../preload/index.js#L1)、[codex.ts](../../../../src/domain/codex.ts#L1)、[codexController.ts](../../../../src/runtime/codexController.ts#L1)、[appRuntime.ts](../../../../src/runtime/appRuntime.ts#L1)、[keybindingRuntime.ts](../../../../src/runtime/keybinding/keybindingRuntime.ts#L1)、[FloatApp.vue](../../../../src/FloatApp.vue#L1)、[CodexWaterBall.vue](../../../../src/components/CodexWaterBall.vue#L1) 与 [CodexPage.vue](../../../../src/pages/CodexPage.vue#L1)。

## Acceptance Results

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 原生状态与项目归属 | pass | 主文件 allowlist、无效主文件才回退 `.bak`、assignment > projectless > 最深 cwd > 排除、原生置顶/项目顺序和空项目均有回归；Renderer 不接收路径或原始身份。 |
| 完整库存与指纹 | pass | `archived=false` 完整翻页、重复 ID 去重、游标循环/无效/安全上限拒绝；扫描前后指纹变化重试一次，再变化拒绝；Controller 首次失败为空态、有已验证快照时 stale 保留。 |
| latest Turn / 30 天 | pass | 每个候选读取最新 Turn；存在 Turn 但缺 `startedAt` 整批失败；零 Turn 排除并统计。30 天边界包含，所有任务页签严格 `lastTurnStartedAt desc`，不以 `updatedAt` 回退。 |
| 六页签与项目结构 | pass | `全部 / 待输入 / 动态 / 已完成 / 已隐藏 / 项目`、动态页`待输入 → 当前动态 → 已完成未查看`优先级、Pinned/Projects/Chats 顺序、不重复任务、空项目和搜索过滤均覆盖。 |
| 本地元数据 | pass | 默认/最后页签、项目折叠、1–365 天窗口、别名、本地置顶顺序、本地移除和 absent→present 自动恢复完成迁移回归；存储不含原始 ID/路径/任务列表。 |
| 选择与确认 | pass | 整行直接打开，选择槽支持普通/Ctrl/Cmd/Shift，Space 新增选择后下移、取消原位；搜索/页签/刷新清理不可见项；同槽双击/双快捷键、5 秒超时、外部点击、Escape 和切页取消均通过。 |
| 快捷键域 | pass | 唯一高亮的鼠标/键盘所有权、抽屉上下键/Enter、右键/Ctrl+右、Ctrl+1…9、F/Shift+F Quick Jump、全局 `codex.float.activate` 和输入屏蔽有自动化覆盖。 |
| 单条归档 | pass | exact alias、source fingerprint、thread recency/version/latest Turn 重读，active/inProgress/变化/损坏形状拒绝；`thread/archive` 后同时验证 false 缺席与 true 存在，失败不乐观移除。 |
| 项目归档 | pass | 25 条模拟集成：20 条分批、并发 2；23 条双向归档成功、1 条 active 跳过、1 条验证失败保留，结果逐项返回。显示窗口不参与历史项目扫描。 |
| 额度与水球 | pass | Weekly-only、双额度、无额度均覆盖；中心只显示最近重置的实际额度，Weekly 才显示 5px 完整轨道/剩余圆弧，文字背景透明，不再出现 5h 假标签或悬浮迷你详情。 |
| 常显操作与说明 | pass | 任务 `开/名/顶/隐或显/归`、项目 `名/顶/归/移` 固定槽位且确认只把原槽改为`确`。无圆点、hover 展开、宽度动画、主 Tooltip 或原生 `title`；任务详情 500ms、状态/短字符 200ms 显示子窗自有不透明说明，ARIA/pressed/focus 保留。 |
| 浮动批量栏 | pass | 两项起显示 `已选 N/归/操/清`；下半区锚点置顶、上半区锚点置底，选择/焦点/滚动/ResizeObserver/窗口 resize 重算。不改变任务 DOM 顺序、行坐标或列表高度；不足两项关闭。 |
| 即时活动与角标 | pass | preload 状态通知立即发匿名 delta，200ms 单飞列表复核，连续三次失败退避 1s，结构变化转完整扫描；待输入/当前动态/完成未查看三角标、红色待输入文字、单待输入点击直开和完成任务成功打开后已查看均覆盖。 |
| 环境与隐私 | pass | 既有 GUI/NVM、PAC、mixed preload、macOS workspace、uTools 子窗和环境脱敏矩阵继续通过；本轮 Host V2 只增加匿名项目/完整性字段，没有正文、path、raw ID/cursor 泄漏。 |

## Automated Gates

- Focused live-input gate: [codexCompanion.test.ts](../../../../tests/ui/codexCompanion.test.ts#L1)、[codexAppServerBridge.test.ts](../../../../tests/platform/codexAppServerBridge.test.ts#L1)、[codexFloatWindowBridge.test.ts](../../../../tests/platform/codexFloatWindowBridge.test.ts#L1)、[codexController.test.ts](../../../../tests/runtime/codexController.test.ts#L1)、[keybinding.test.ts](../../../../tests/runtime/keybinding.test.ts#L1) 及两项 integration 共 `7` files / `103` tests passed。
- `pnpm test`: `47` files / `453` tests passed；覆盖活动通道、全局激活、会话投影、真实归档和全部既有功能回归。
- `pnpm run typecheck`: passed。
- `pnpm run build`: passed；Vite 双入口生产构建、canonical/public runtime 同步及 `validate:utools` passed。
- 本机 `codex app-server generate-ts --experimental` 生成协议确认 `thread/status/changed` 的参数为 `threadId: string` 与 `ThreadStatus`；后者正是 `notLoaded / idle / systemError / active(activeFlags)`，与实现解析完全一致。
- Browser fixture QA: 380px 与 330px 实际渲染均无横向溢出，六页签、三状态分段、固定短字符和标题省略清晰；330px 任务 500ms 详情卡与按钮 200ms 说明卡均为完全不透明表面。112px compact 显示 Weekly-only `23%` 与三个不重叠角标，待输入 computed color 为 `rgb(255, 91, 127)`、`[title]` 为 0、横向溢出为 0。既有批量栏上下避让/零行位移 fixture 继续由回归测试覆盖；本轮临时 Playwright 截图不作为源码依赖。

## Real Local Preflight

- 方案前只读基线：2026-07-21 10:03，`54` 条未归档原始任务 → `33` 条有效原生项目任务 → 近 30 天 `27` 条，其中已完成 `24`、进行中 `3`。
- 修订 3 最终生产桥接预检：`node scripts/codex-real-preflight.mjs 30` 返回 Host V2、`completeness=verified`、严格排序通过；动态值为 `54 → 33 → 27`，排除 `21` 条已移除/未注册项目任务，已完成 `25`、进行中 `2`。本机服务端只返回 Weekly `9%`，没有伪造 5 小时窗口。
- 动态数量会随本机任务状态和额度变化；验收固定的是完整分页、项目顺序/归属、严格 Turn 时间、窗口和完整性门禁，而不是某一瞬间数量。
- 原生 Pinned 项目顺序验证为：`km-srm-ref → EyPc → EzDesign → EzAgentPlatform → CodeNote → EzCodexGpt → EyTrade`；其余 Projects 和 Chats 继续按原生状态投影。

## Real Archive Lifecycle

- [codex-archive-lifecycle-check.mjs](../../../../scripts/codex-archive-lifecycle-check.mjs#L1) 具有显式 `--create-temp-task` 写入门禁。
- 首次零轮次探针证明 `thread/start` 后没有 Turn 的条目不会进入 `thread/list` 任一分区；该探针已调用归档清理，未操作现有任务。
- 正式专用临时任务创建一轮最小文本 Turn，等待 completed 后验证：初始只在 `archived=false`；归档后只在 `archived=true`；unarchive 后只在 `archived=false`；最终再次归档并确认只在 `archived=true`。
- 真实验收未归档、删除或重命名任何用户现有任务；项目批量归档只执行模拟集成测试。
- 修订 3 没有修改归档实现或接口，因此不重复创建写入型临时任务；沿用同一已通过生命周期证据，本轮只执行真实只读库存预检，用户现有任务保持未操作。

## Findings And Residuals

- P0/P1/P2 source finding: none after reconciliation。
- App Server 没有 conditional archive；重读与写入之间的新活动仍是 provider TOCTOU 残余。
- 另一 Codex 进程的 exact input/approval/running 仍受跨进程 live authority 限制；持久化 Turn 只说明最近结果。
- 真实 Windows uTools 运行时/系统热键、真实 deep link、多显示器/DPI 和 macOS 两个普通 Space + 一个全屏 Space 仍是宿主观察项。
- Project AI-rule audit 仍返回 6 条既有 adapter/governance baseline 缺口（模板传播、v3-route、W24/W28/W30）；这些问题在本轮前已存在且不指向 Codex Companion 实现或文档增量，本轮未扩围修改项目规则。
- Error memory: 无新记录。本轮协议核验复用了既有“不要递归搜索 `$CODEX_HOME` rollout/SQLite，改用生成协议 schema”的错误记忆，并以本机 `generate-ts` 收敛证据。
- 零轮次 list 行为已由预检统计、自动化和真实生命周期记录直接覆盖，不另建错误记忆；它是协议边界而非生产回归。

## Acceptance

- Root decision: requirement、implementation、真实本机数据、原生归档、自动化、视觉 fixture、两仓代码链接审计和项目/个人产品文档形成闭环，source/package accepted。
- Document impact: `requirement-canonical + project-current + controlled-task` synchronized。
- Sidecar: 只读探索结果已由 Root 复核并接纳；最终写集、真实任务门禁、diff、测试和文档由 Root 独占验收。
