# Codex Companion 真实会话与交互验证记录

Tool: codex
Date: 2026-07-21
Status: `accepted-with-declared-host-residuals`

## Review Target

- Requirement: [raw-requirement.md](raw-requirement.md#L1) 的真实项目库存、六页签/200ms 活动通道、普通/Spark 额度 V2、水球上半区角标安全/下半区 hover 展开、`quota-auto`、瞬时新会话编辑器/桥接、选择优先会话行、右键完整抽屉、纯 Shift 白名单预览、浮窗本地暂态层、过滤后的 Quick Jump 与原生归档。
- Plan: [plan.md](plan.md#L1) 的 Host V2/Projection V3 保持、额度/模型/创建桥接增量、Renderer 状态机、快捷键、真实本机 schema/额度预检、视觉 QA 与文档闭环。
- Implementation: [preload/index.js](../../../../preload/index.js#L1)、[preload/float.js](../../../../preload/float.js#L1)、[codex.ts](../../../../src/domain/codex.ts#L1)、[codexNewThread.ts](../../../../src/domain/codexNewThread.ts#L1)、[codexPresentation.ts](../../../../src/domain/codexPresentation.ts#L1)、[codexController.ts](../../../../src/runtime/codexController.ts#L1)、[appRuntime.ts](../../../../src/runtime/appRuntime.ts#L1)、[keybindingRuntime.ts](../../../../src/runtime/keybinding/keybindingRuntime.ts#L1)、[FloatApp.vue](../../../../src/FloatApp.vue#L1)、[CodexWaterBall.vue](../../../../src/components/CodexWaterBall.vue#L1) 与 [CodexPage.vue](../../../../src/pages/CodexPage.vue#L1)。

## Acceptance Results

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
| 环境与隐私 | pass | 既有 GUI/NVM、PAC、mixed preload、macOS workspace、uTools 子窗和环境脱敏矩阵继续通过；新请求只跨散列项目键、短期 alias、指纹、模型 ID 与瞬时提示词。提示词不进入 action/快照/日志/存储/文档/错误记忆/Deep Link/剪贴板；raw ID/cwd/path 仍只在 preload。 |

## Automated Gates

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
- 另一 Codex 进程的 exact input/approval/running 仍受跨进程 live authority 限制；持久化 Turn 只说明最近结果。
- 真实 Windows uTools 运行时/系统热键、真实系统听写、真实 `turn/start`/Deep Link、多显示器/DPI 和 macOS 两个普通 Space + 一个全屏 Space 仍是宿主观察项；本轮按计划不创建真实任务。
- Project AI-rule audit 仍返回 6 条既有 adapter/governance baseline 缺口（模板传播、v3-route、W24/W28/W30）；这些问题在本轮前已存在且不指向 Codex Companion 实现或文档增量，本轮未扩围修改项目规则。
- Error memory: 无新记录。本轮协议核验复用了既有“不要递归搜索 `$CODEX_HOME` rollout/SQLite，改用生成协议 schema”的错误记忆，并以本机 `generate-json-schema` 收敛证据。浮窗依赖 allowlist 的构建失败已由去除非必要 `node:crypto` 与新增隔离 preload 回归直接封口，不形成跨项目重复模式。
- 零轮次 list 行为已由预检统计、自动化和真实生命周期记录直接覆盖，不另建错误记忆；它是协议边界而非生产回归。

## Acceptance

- Root decision: requirement、implementation、真实本机只读额度/schema、既有原生归档证据、自动化、视觉 fixture、项目代码链接审计和项目/个人产品文档形成闭环，source/package accepted。
- Document impact: `requirement-canonical + project-current + controlled-task` synchronized。
- Sidecar: 只读探索结果已由 Root 复核并接纳；最终写集、真实任务门禁、diff、测试和文档由 Root 独占验收。
