# Codex Companion 真实会话与交互验证记录

Tool: codex
Date: 2026-07-21
Status: `accepted-with-declared-host-residuals`

## Review Target

- Requirement: [raw-requirement.md](raw-requirement.md#L1) 的真实项目注册库存、完整未归档分页、严格最近提问时间、30 天窗口、五页签、项目分组、统一搜索、本地元数据、水球真实额度、常显短字符、无 Codex Tooltip、Space 原位选择、自避让批量栏与原生归档。
- Plan: [plan.md](plan.md#L1) 的 Host V2、Projection V3、Renderer、快捷键、归档、真实本机预检、视觉 QA 与文档闭环。
- Implementation: [preload/index.js](../../../../preload/index.js#L1)、[codex.ts](../../../../src/domain/codex.ts#L1)、[codexController.ts](../../../../src/runtime/codexController.ts#L1)、[appRuntime.ts](../../../../src/runtime/appRuntime.ts#L1)、[keybindingRuntime.ts](../../../../src/runtime/keybinding/keybindingRuntime.ts#L1)、[FloatApp.vue](../../../../src/FloatApp.vue#L1)、[CodexWaterBall.vue](../../../../src/components/CodexWaterBall.vue#L1) 与 [CodexPage.vue](../../../../src/pages/CodexPage.vue#L1)。

## Acceptance Results

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 原生状态与项目归属 | pass | 主文件 allowlist、无效主文件才回退 `.bak`、assignment > projectless > 最深 cwd > 排除、原生置顶/项目顺序和空项目均有回归；Renderer 不接收路径或原始身份。 |
| 完整库存与指纹 | pass | `archived=false` 完整翻页、重复 ID 去重、游标循环/无效/安全上限拒绝；扫描前后指纹变化重试一次，再变化拒绝；Controller 首次失败为空态、有已验证快照时 stale 保留。 |
| latest Turn / 30 天 | pass | 每个候选读取最新 Turn；存在 Turn 但缺 `startedAt` 整批失败；零 Turn 排除并统计。30 天边界包含，所有任务页签严格 `lastTurnStartedAt desc`，不以 `updatedAt` 回退。 |
| 五页签与项目结构 | pass | `全部 / 进行中 / 已隐藏 / 已完成 / 项目`、Pinned/Projects/Chats 顺序、不重复任务、空项目、项目名命中显示全部子项、任务命中局部过滤均覆盖。 |
| 本地元数据 | pass | 默认/最后页签、项目折叠、1–365 天窗口、别名、本地置顶顺序、本地移除和 absent→present 自动恢复完成迁移回归；存储不含原始 ID/路径/任务列表。 |
| 选择与确认 | pass | 点击、Ctrl/Cmd、Shift 与 Space 原位选择；任务/项目 Space 均保持焦点和滚动，搜索/页签/刷新清理不可见项；Delete 无选择处理焦点项；同槽双击/双快捷键、5 秒超时、外部点击、Escape 和切页取消均通过。 |
| 快捷键域 | pass | Codex profile/layer、输入屏蔽、同域同层冲突、`↑/↓`、Space、Enter、Ctrl+左右、Delete、F2、Ctrl+P、Alt+上下、Ctrl+F/R、Ctrl+1…9、Escape 有自动化覆盖。 |
| 单条归档 | pass | exact alias、source fingerprint、thread recency/version/latest Turn 重读，active/inProgress/变化/损坏形状拒绝；`thread/archive` 后同时验证 false 缺席与 true 存在，失败不乐观移除。 |
| 项目归档 | pass | 25 条模拟集成：20 条分批、并发 2；23 条双向归档成功、1 条 active 跳过、1 条验证失败保留，结果逐项返回。显示窗口不参与历史项目扫描。 |
| 额度与水球 | pass | Weekly-only、双额度、无额度均覆盖；中心只显示最近重置的实际额度，Weekly 才显示 5px 完整轨道/剩余圆弧，文字背景透明，不再出现 5h 假标签或悬浮迷你详情。 |
| 常显操作与 Tooltip | pass | 任务 `开/名/顶/隐或显/归`、项目 `名/顶/归/移` 固定 32px 槽位；活动任务的 `归`、Chats 的 `顶/移` 等不可用动作以禁用槽保留，确认只把原槽字符改为 `确`。无圆点、图标、hover 展开、宽度动画、`OperationTooltipLayer`、Tooltip 数据或原生 `title`，ARIA/pressed/focus 保留。 |
| 浮动批量栏 | pass | 两项起显示 `已选 N/归/操/清`；下半区锚点置顶、上半区锚点置底，选择/焦点/滚动/ResizeObserver/窗口 resize 重算。不改变任务 DOM 顺序、行坐标或列表高度；不足两项关闭。 |
| 环境与隐私 | pass | 既有 GUI/NVM、PAC、mixed preload、macOS workspace、uTools 子窗和环境脱敏矩阵继续通过；本轮 Host V2 只增加匿名项目/完整性字段，没有正文、path、raw ID/cursor 泄漏。 |

## Automated Gates

- Focused interaction gate: [codexCompanion.test.ts](../../../../tests/ui/codexCompanion.test.ts#L1) + [keybinding.test.ts](../../../../tests/runtime/keybinding.test.ts#L1) 共 `2` files / `44` tests passed。
- `pnpm test`: `47` files / `444` tests passed；覆盖 [codexAppServerBridge.test.ts](../../../../tests/platform/codexAppServerBridge.test.ts#L1)、[codex.test.ts](../../../../tests/domain/codex.test.ts#L1)、[codexController.test.ts](../../../../tests/runtime/codexController.test.ts#L1)、[keybinding.test.ts](../../../../tests/runtime/keybinding.test.ts#L1) 和 [codexCompanion.test.ts](../../../../tests/ui/codexCompanion.test.ts#L1)。
- `pnpm run typecheck`: passed。
- `pnpm run build`: passed；Vite 双入口生产构建、canonical/public runtime 同步及 `validate:utools` passed。
- Browser fixture QA: 380px 与 330px 宽度均为 0 文档/行横向溢出，所有操作槽 `32×32px`；活动任务实测 `开/名/顶/隐/归` 五槽且归档禁用，Chats 实测 `名/顶/归/移` 四槽且顶/移禁用。标题正确省略，Tooltip 与 `[title]` 计数均为 0。批量栏上下两种 placement 均命中且为 absolute，出现前后任务行最大坐标差为 0；Space 前后焦点 key 与 `scrollTop` 不变。104×104 Weekly-only compact hover 400ms 后仍无深色气泡。证据位于 `output/playwright/codex-short-actions-380.png`、`codex-short-actions-330.png`、`codex-fixed-slots-330.png`、`codex-batch-toolbar-top-380.png`、`codex-batch-toolbar-bottom-380.png` 和 `codex-compact-hover-no-tooltip-104.png`，不作为源码运行依赖。

## Real Local Preflight

- 方案前只读基线：2026-07-21 10:03，`54` 条未归档原始任务 → `33` 条有效原生项目任务 → 近 30 天 `27` 条，其中已完成 `24`、进行中 `3`。
- 交互修订后生产桥接预检：`node scripts/codex-real-preflight.mjs 30` 返回 Host V2、`completeness=verified`、严格排序通过。最终门禁时动态值为 `55 → 34 → 28`，排除 `21` 条已移除/未注册项目任务，已完成 `26`、进行中 `2`；本机服务端只返回 Weekly `14%`，没有 5 小时窗口。
- 动态数量会随本机任务状态和额度变化；验收固定的是完整分页、项目顺序/归属、严格 Turn 时间、窗口和完整性门禁，而不是某一瞬间数量。
- 原生 Pinned 项目顺序验证为：`km-srm-ref → EyPc → EzDesign → EzAgentPlatform → CodeNote → EzCodexGpt → EyTrade`；其余 Projects 和 Chats 继续按原生状态投影。

## Real Archive Lifecycle

- [codex-archive-lifecycle-check.mjs](../../../../scripts/codex-archive-lifecycle-check.mjs#L1) 具有显式 `--create-temp-task` 写入门禁。
- 首次零轮次探针证明 `thread/start` 后没有 Turn 的条目不会进入 `thread/list` 任一分区；该探针已调用归档清理，未操作现有任务。
- 正式专用临时任务创建一轮最小文本 Turn，等待 completed 后验证：初始只在 `archived=false`；归档后只在 `archived=true`；unarchive 后只在 `archived=false`；最终再次归档并确认只在 `archived=true`。
- 真实验收未归档、删除或重命名任何用户现有任务；项目批量归档只执行模拟集成测试。

## Findings And Residuals

- P0/P1/P2 source finding: none after reconciliation。
- App Server 没有 conditional archive；重读与写入之间的新活动仍是 provider TOCTOU 残余。
- 另一 Codex 进程的 exact input/approval/running 仍受跨进程 live authority 限制；持久化 Turn 只说明最近结果。
- 真实 Windows uTools 运行时/系统热键、真实 deep link、多显示器/DPI 和 macOS 两个普通 Space + 一个全屏 Space 仍是宿主观察项。
- 零轮次 list 行为已由预检统计、自动化和真实生命周期记录直接覆盖，不另建错误记忆；它是协议边界而非生产回归。

## Acceptance

- Root decision: requirement、implementation、真实本机数据、原生归档、自动化、视觉 fixture、两仓代码链接审计和项目/个人产品文档形成闭环，source/package accepted。
- Document impact: `requirement-canonical + project-current + controlled-task` synchronized。
- Sidecar: 只读探索结果已由 Root 复核并接纳；最终写集、真实任务门禁、diff、测试和文档由 Root 独占验收。
