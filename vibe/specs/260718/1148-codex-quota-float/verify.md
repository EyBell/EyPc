# Codex Companion 真实会话与交互验证记录

Tool: codex
Date: 2026-07-22
Status: `reported-unverified-awaiting-user-acceptance`
Requirement version: `2026-07-24.17`

## 2026-07-24 可选完成修订与运行时视图的类型契约

- 实现：完成未读的显式确认动作先捕获 `completionRevision`，再以原始类型、有限数和正数守卫收窄；只有有效修订才写入本地 receipt，原有不可用提示和打开行为不变。
- 测试契约：任务切换候选的类型现在显式携带有效 `actionAlias`；历史 `taskHotkeys` readback 字段及对应 fixture 已由 RAW-087 删除。
- 静态核验：已完成差异空白检查和调用路径审阅；未运行 TypeScript 类型检查、测试、构建、uTools 或真实 Codex 操作，仍待用户验收。
- Error memory：保留 [typescript-number-isfinite-optional-narrowing.md](../../../knowledge/error-memory/typescript-number-isfinite-optional-narrowing.md#L1)；[codex-float-bridge-mock-contract-drift.md](../../../knowledge/error-memory/codex-float-bridge-mock-contract-drift.md#L1) 中的 task-hotkey fixture 事件已标记为被删除功能取代；新增已验证 [utools-private-sync-ipc-entry-freeze.md](../../../knowledge/error-memory/utools-private-sync-ipc-entry-freeze.md#L1)。

## 2026-07-24 uTools 安装路径代码复核

- Review target：本轮 [plugin.json](../../../../public/plugin.json#L1) feature 增量、[featureRouting.ts](../../../../src/runtime/feature/featureRouting.ts#L1) 路由、[preload/index.js](../../../../preload/index.js#L4284) 浮窗装载与 [prepare-utools-runtime.mjs](../../../../scripts/prepare-utools-runtime.mjs#L1) 产物准备。
- Checked：production `dist` 入口为本地静态 `float.html`；manifest/preload 与 canonical 源一致；24 个 feature code 和 52 条指令均唯一；窗口槽位与新增 Codex 指令均有对应路由；preload/float-preload 的静态语法检查通过。
- Findings：P0 无；P1 无。未发现会阻止 uTools 解析 manifest、加载入口或执行 preload 的当前源码缺陷。
- Not checked：未执行 uTools 实际导入/安装写入；若宿主仍拒绝安装，需要其具体错误信息以区分宿主缓存、安装包元数据或版本兼容性。

## RAW-087 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 入口恢复 | pass / user-confirmed | 用户在移除入口快捷键读取后确认 uTools 插件已恢复加载，定位到私有同步宿主 IPC 阻塞而非构建、自动结束或重启问题。 |
| 回读完整删除 | pass / static | [preload/index.js](../../../../preload/index.js#L1) 与 [public/preload.js](../../../../public/preload.js#L1) 不再包含 `getAllFeatureHotKey` 或读取桥；[eypcPlatform.ts](../../../../src/platform/eypcPlatform.ts#L1)、[codexController.ts](../../../../src/runtime/codexController.ts#L1) 与 [appRuntime.ts](../../../../src/runtime/appRuntime.ts#L1) 不再声明快照/动作。全仓目标源码和测试的 readback 符号搜索为空。 |
| 配置入口 | pass / static | [CodexPage.vue](../../../../src/pages/CodexPage.vue#L1) 与 [WindowsPage.vue](../../../../src/pages/WindowsPage.vue#L1) 不显示绑定、不提供刷新，只保留官方 uTools 配置跳转。 |
| 顶部分面 | implemented / visual-unverified | Codex 页默认“快捷方式”，六个入口宽屏双列；另有任务、水球、卡片、运行四页。只渲染当前面板，运行诊断不占据默认入口；Tab 支持左右方向键、Home/End，窄屏可横向滚动且快捷入口单列。 |
| 渐进披露 | implemented / visual-unverified | 诊断详情、CLI 连接/降级、外观映射、百分比和尺寸说明进入可聚焦 `i` 提示；关键当前值、状态与动作仍常显。UI 选择遵循本轮 `PreferenceLookupReceipt v2` 与 `distill` 渐进披露规则。 |
| 限定静态核验 | pass with fallback | `node --check` 通过两个 preload；镜像完全一致；Vue SFC parser/compiler 对 Codex/Windows 页通过；Vite middleware 内存转换通过 Codex/Windows 页、Controller、App Runtime、平台类型与 Codex CSS；`git diff --check` 与残余私有 IPC 搜索通过。既有 HTTP 开发端点未运行，改用不监听端口的等价转换；未运行测试、typecheck、build、真实 uTools、截图或 Codex 操作。 |
| 项目规则与错误共识 | pass / documentation | [项目规则](../../../rules/README.md#L1) 固定 `EYPC-UTOOLS-HOST-001`，禁止私有同步宿主 IPC 与任何入口/焦点/可见性/刷新回读，并要求 preload 镜像及静态阻断检查；[已验证错误记忆](../../../knowledge/error-memory/utools-private-sync-ipc-entry-freeze.md#L1) 固定症状识别、排查顺序、唯一已验证恢复路线和未来异步例外门槛。该项目本地规则按中央治理边界不写入 CodeNote Rule Task Index。 |

结论：入口卡死根因已经用户确认，RAW-087 的完整删除、配置分面、项目规则和错误共识已静态交付。当前状态为 `入口恢复与规则共识已确认；新布局未校验，待用户验收`。设置或修改任意 Codex/窗口槽 uTools 快捷键后，EyPc 页面都不应读取或回显当前绑定。

## RAW-084 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 全局功能与路由 | implemented / unverified | [plugin.json](../../../../public/plugin.json#L1) 新增两个 `mainHide` 功能；[featureRouting.ts](../../../../src/runtime/feature/featureRouting.ts#L1) 分别派发 `codex.task.previous` / `codex.task.next`，feature-disabled 时保持现有设置页回退。 |
| 循环合同 | implemented / unverified | [codexController.ts](../../../../src/runtime/codexController.ts#L1) 依次稳定排序待输入、完整完成未读与进行中任务，按匿名 key 去重并只保留可打开项；首次 next/previous 取首/末，后续按方向回绕。循环指针仅存在 Controller 内存。 |
| 状态边界 | implemented / unverified | 两个动作仅调用既有打开路径，不写完成 revision receipt、不确认 Codex 未读、不改隐藏、页签或任务投影；完成未读显式确认仍只属于原有专用动作。 |
| 可发现性 | implemented / unverified | [CodexPage.vue](../../../../src/pages/CodexPage.vue#L1) 为前/后任务各提供 uTools 系统级快捷键配置入口；未预设或占用系统组合键。 |
| 限定静态核验 | pass | 目标路径 `git diff --check`、`plugin.json` JSON 解析及 feature → action → Controller 字符串链均通过。未运行测试、typecheck、build、uTools、截图或真实 Codex 操作。 |

结论：RAW-084 已实现，当前保持 `未校验，待用户验收`。在 uTools 全局功能中分别绑定“上一个 Codex 任务”和“下一个 Codex 任务”后，下一项首次打开待输入首项、上一项首次打开进行中尾项；后续按待输入 → 已完成未读 → 进行中循环回绕。请确认完成未读不会被自动标记为已读，且没有候选时显示无可切换任务提示。

## RAW-083 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 角标位置 | implemented / unverified | [float.css](../../../../src/styles/float.css#L1) 将待输入放到左下、已完成未读放到最右下角、进行中固定在其上方 `23px`；两种紧凑皮肤共用定位。 |
| 主体命中区 | implemented / unverified | [FloatApp.vue](../../../../src/FloatApp.vue#L1) 用同一表面相对纵向比例限定上 `1/3` 展开、下 `1/2` 拖拽；中间 `1/6` 无动作。指针点击复用展开判定，拖动仍使用既有 `5px` 阈值抑制后续点击。 |
| 既有交互边界 | unchanged / unverified | 角标仍是独立原生按钮并保留点击、键盘、200ms 说明和触屏路径；键盘显式激活仍展开，触屏不模拟 hover，未改 Host 拖拽协议、任务投影或持久化。 |
| 静态核对 | pass | `git diff --check`、目标源码/样式定位、偏好索引 JSON 与 `codex-companion + full-ui + task-only` 回执均通过。偏好索引曾因交互标签超过 16 项而阻塞，已收敛为既有稳定标签；未运行测试、typecheck、build、uTools、截图或真实 Codex 操作。 |

结论：RAW-083 已实现，当前保持 `未校验，待用户验收`。请确认待输入位于左下、已完成未读位于最右下角、进行中紧邻其上；在主体上方三分之一悬停/点击应展开，在下半区拖动应只移动窗口而不展开，中间区域无动作。再用键盘激活主体与点击三个角标，确认既有动作保持。

## RAW-071 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| Requirement and plan gate | complete | RAW-071 reuses the existing Controlled parent and is scoped to the Codex configuration page plus direct color storage/render paths; no Host, preload, database, dependency or external write is included. |
| Preference and method | ready | Full-ui preference receipt has no candidate or authority conflict; project defaults explicitly cover the two unmatched structural categories. The selected external redesign guide is unavailable, so implementation uses the existing Vue/CSS design language. |
| Separated workbench | implemented / unverified | The configuration page now has explicit water-ball, card and status-signal zones. The water zone names and previews base, liquid A/B, Weekly progress/track and all three counters; card surface/foreground controls do not share that zone. |
| Direct color path | implemented / unverified | The settings normalizer retains non-empty stored color strings, the Controller no longer rejects or restores color/water patches, and the active page writes each control immediately to its labeled setting. Quota-mode Weekly progress remains status-derived by design; custom mode uses the dedicated progress color. |
| Static source checks | pass | `git diff --check` and active-path searches confirm no active page/controller reference to the card-color dialog or color/water validation gate. The local Vue SFC parser package is unavailable, so no parser compile was run. |
| Documentation link audit | pass | `audit_code_links.py` reports `Code link audit: OK` across the RAW-071–076 controlled documents, project status and current knowledge/error-memory updates. |
| Verification policy | not run | The user did not select tests. No test file was modified or run, and typecheck/build/uTools/screenshots/real Codex operations remain unexecuted. |

## RAW-072 / RAW-073 / RAW-074 / RAW-075 / RAW-076 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| Single water renderer | implemented / unverified | The configuration page and float both mount `CodexWaterBall`. The preview uses the same quota projection, water appearance, colors and visible-counter calculation as the float instead of a second hand-drawn ball. |
| Preserved water motion | implemented / unverified | The shared component keeps the existing three SVG wave layers, refraction, high-light and `static / slow / normal / fast` timing tokens. The preview changes only the component container; it does not replace the ball with a static liquid illustration. |
| Transparent ball base | implemented / unverified | `waterAppearance.inner.baseOpacity` persists `0–100`; at `0` the ball-base layer and its shadow disappear while liquid, ring, reading and counters remain. The water-zone slider changes the same value used by the float. |
| One-to-one controls | implemented / unverified | The water zone names ball base/opacity, liquid A/B, palette, opacity, amplitude, wave speed, Weekly ring/progress/track and all counters. Card surface/foreground remains in its own zone. |
| Expanded-card configuration target | implemented / unverified | The card zone explicitly previews the float after expansion—tabs, search, quota and task surface—not the compact horizontal card. It consumes the same derived card surface/foreground tokens as the expanded float and labels the exact covered regions. |
| Expanded-card theme depth | implemented / unverified | `expandedCardAppearance` persists nine direct tokens for main/raised panel, border, primary/secondary text, accent, focus, running and completed-unread. Built-in and saved themes carry the full object; legacy records receive a compatible default from their existing card values. |
| Actual expanded-card path | implemented / unverified | The Float snapshot carries the same expanded-card object used by the page preview. Once expanded, `FloatApp` selects that resolver regardless of compact water/card style; changing a token no longer depends on or changes water-ball rendering. |
| Static checks | pass | `git diff --check` plus direct-path searches confirm all nine page controls update `expandedCardAppearance`; built-in/saved themes and settings normalization retain it; Controller forwards it; preview and expanded float use `resolveCodexExpandedCardTheme`; no old card color control is active. |
| Verification policy | not run | The user did not select tests. No test file was modified or run, and typecheck/build/uTools/screenshots/real Codex operations remain unexecuted. |

结论：RAW-071–076 已实现，当前保持 `未校验，待用户验收`。请先确认真实水球与配置预览都保留三层波纹、折射和高光，且不再出现底部扁平矩形；再改底色、液体 A/B、波幅/速度、环/轨道，确认配置页与右侧真实水球同时呈现同一效果。展开大卡片后，分别改主面板、内层块、边框、主/次文字、选中、焦点、进行中和完成未读，确认每项只改变标注区域且与水球无关；切换内置主题或保存/重应用主题后，九项令牌应完整保留。将“球体底色透明度”调到 `0%` 时，真实浮窗只去掉底色而液体、Weekly 环、读数和角标保留。

## RAW-082 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 共享动作 | implemented / unverified | 完成未读角标、uTools 功能路由和系统级快捷键配置入口都使用 `codex.completed-unread.openFirst`；待输入继续走既有只打开的 action。 |
| 本地 revision 确认 | implemented / unverified | 首条按完整计数集合、置顶优先和稳定源顺序解析；当前完成 revision 写入 EyPc receipt 后立即重投影为 completed/read，新 revision 仍可重新进入 completed-unread。 |
| 权威边界 | implemented / unverified | 本地确认不写 Codex Desktop 原生 unread，不从 connector/时间生成状态；普通行打开、隐藏、恢复和待输入打开都不确认。 |
| 限定静态校验 | pass | `git diff --check`、`plugin.json` JSON 解析、共享 feature/action/Controller/receipt 字符串链与 Markdown 代码链接审计均通过；不运行用户保留的测试、typecheck、build、uTools、截图或真实 Codex 操作。 |

结论：RAW-082 已实现，当前保持 `未校验，待用户验收`。请准备多个完成未读任务（含一个已隐藏和一个置顶项），分别点击水球未读角标及调用“打开并标记第一个 Codex 已完成未读任务”的 uTools 全局功能/快捷键；两条路径都应打开相同首条，并立即让该 revision 在所有 EyPc 视图变为已完成/已读。随后产生更晚的完成 revision，应重新显示未读。待输入角标和待输入全局功能应只打开，不改变其状态。

## RAW-069 / RAW-077 / RAW-078 / RAW-079 / RAW-080 / RAW-081 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 回流优先发布 | implemented / unverified | 已完成且已读任务回流为 completed-unread 或 desktop-live active 时绕过普通 Activity Delta 防抖立即发布，并取消同任务尚未到期的终态 hold；completed-unread 保持其语义，不被归一为 ongoing。 |
| 任务级进行中离开稳定窗 | implemented / unverified | Controller 区分原始会话快照与展示快照；visible running 首次转 completed/completed-unread、failed 或 system-error 时按持久化 `completionPresentationDelayMs` 建立 hold，允许 `0/500/1000/1500/2000/3000ms`，默认 1500ms；`0` 不建立 hold，重复终态不续期，初次加载终态不延迟。 |
| 可中断与一次性释放 | implemented / unverified | 展示窗内原始任务恢复 active/ongoing 会立即取消 hold；连续终态达到当前配置值后以最新原始快照一次性释放完成桶、异常状态、完成时间、未读和归档能力。 |
| 全投影一致性 | implemented / unverified | hold 内任务统一为 `ongoing/running/blocked-active`，并重建 ongoing/completed/hidden/all、完成页、项目 section 与计数；卡片、详情、Shift 预览、角标及归档入口消费同一结果。 |
| 双重延迟移除 | implemented / unverified | Float renderer 删除独立进行中角标合并器，角标直接读取 Controller 稳定投影，避免卡片先完成、角标后完成或额外延迟。 |
| 权威与兼容边界 | implemented / unverified | 该设置只延迟已由 provider 权威成立的进行中离开展示，不从时间推断完成；其它非输入活动仍为 2 秒去抖。默认值与旧缺失配置归一为 1500ms，停用/关闭/dispose 会清理 hold。 |
| 百分比读数独立配置 | implemented / unverified | 位置、字号、常规/加粗/斜体/粗斜体和颜色属于 `waterAppearance.inner`，预览与真实水球共用 `CodexWaterBall`；默认居中、22px、加粗、白色，并随内置/已保存主题持久化。 |
| live 未读缺字段回退 | implemented / unverified | Desktop snapshot/patch 明确给出 `hasUnreadTurn` 时保持 desktop-live 优先；字段缺失时不再写入 `false/unavailable`，而是保留最近成功读取的 Codex persisted unread；持久化集合不可读才显式 unknown。 |
| 待输入请求名归一化 | implemented / unverified | 仅对既有 user-input / option-picker / setup / approval / elicitation / permission 已知词做分隔符删除后匹配，因此 `request_user_input` 与既有等价写法同样映射到 `waitingOnUserInput`；仍要求 `desktop-live active`，未放宽 connector、`notLoaded` 或时间推断。 |
| 限定静态校验 | pass | `git diff --check` 通过；默认值、离散延迟、Activity Delta 回流优先分流、共享终态 hold、其它非输入 2 秒防抖与配置页文案均已结构核对；设计偏好 JSON 可解析，Markdown code-link audit 为 `OK`。设计收口只生成无写入的 W29 候选；不修改或运行测试，不运行 typecheck、build、uTools、截图或真实 Codex 操作。 |

结论：RAW-079–081 已实现，当前保持 `未校验，待用户验收`。用户应确认默认“进行中离开稳定窗”为 1.5 秒、修改并重开后仍保留；随后以同一任务验证所选时长内卡片、角标和归档入口稳定为进行中且不可归档，窗口结束后仅切换一次。再让已完成且已读任务回流为完成未读或 desktop-live 进行中，确认立即发布且未读不被改写；特别验证 live snapshot/patch 缺少 unread 字段时，既有完成未读不丢失，而实际 read-state 改为已读时仍立即清除。再触发 `request_user_input` 形式的活跃请求，确认待输入角标立即出现。分别修改百分比读数位置、字号、字形和颜色，确认预览与真实悬浮球同步且主题/重开后仍保留。

## RAW-070 当前交付状态

- 已增加 60 秒中断宽限：仅当任务已明确为非 active 的 `interrupted`，且最新 `updatedAt` 连续达到阈值，领域层才生成完成 revision；Desktop live active 仍优先，`notLoaded`、`unknown` 和 connector-only active 不会因时间变成完成。
- 该规则只收敛已存在的 interrupted 证据，用于手动关闭临时任务的状态闪烁；普通完成仍由 Controller 单一、默认 1500ms 的可配置展示稳定器负责，未新增 Renderer 定时器。
- 当前仍为 `未校验，待用户验收`：需在本机 Codex Desktop 观察临时任务关闭后 60 秒内保持进行中，超过阈值只切换一次到完成/完成未读，并确认 active 恢复不会被错误完成标记覆盖。

静态校验：本轮仅执行 `git diff --check`、`pnpm run typecheck` 和 Markdown 代码链接审计；不执行自动化测试、build、截图、uTools 宿主验收或真实 Codex 操作。

- Error memory: 新增候选 [codex-completion-transition-hysteresis.md](../../../knowledge/error-memory/codex-completion-transition-hysteresis.md#L1)，记录“独立角标延迟无法稳定完整产品状态，完成过渡必须在统一投影层做可中断 hysteresis”；并明确该窗口不是完成证据，不能违反 verified [codex-cross-process-notloaded-is-not-completion.md](../../../knowledge/error-memory/codex-cross-process-notloaded-is-not-completion.md#L1)。

## RAW-068 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 领域归档能力稳定化 | implemented / unverified | 原始 interrupted 仍投影为 `activityState='ongoing'`，并与 desktop-live active 一样得到 `archiveCapability='blocked-active'`、`canArchive=false`；active/interrupted 来源切换不再改变卡片动作能力。 |
| 固定动作槽与衍生入口 | implemented / unverified | 任务行固定 `归` 槽继续保位但始终禁用；操作抽屉、Shift 预览、单项确认和批量候选消费同一 `canArchive`，不再出现可用性闪烁。 |
| Controller 与 Host 二次门禁 | implemented / unverified | Controller 在 blocked capability 处拒绝且不发送 interrupted terminal 证据；Host 单条归档重读到 interrupted 返回 active-task，项目全部归档把它加入进行中跳过集合，terminal 证据只接受 failed。 |
| 兼容边界 | unchanged / unverified | completed/failed 的既有可验证归档不变；system-error/unknown 继续保留警告与 fail-closed 重读；无新 API、Runtime action、持久化字段或迁移。 |
| 限定静态校验 | pass | `git diff --check`、测试文件零差异、preload/public 镜像一致、可见 interrupted 分支零命中、领域 ongoing capability、Controller 拒绝、Host 单条/项目 interrupted 门禁、版本/事件唯一性、偏好 JSON 与 Markdown 代码链接审计均通过；依用户规则不修改或运行测试，不运行 typecheck、build、uTools、截图或真实 Codex 操作。 |

结论：RAW-068 已实现，当前保持 `未校验，待用户验收`。用户应让同一会话经历原始 interrupted 与 desktop-live active 更新，确认页面始终显示“进行中”，固定归档按钮持续禁用且不闪烁，抽屉/Shift 预览/批量归档也不把它列为可归档对象。

- Error memory: 更新候选 [codex-provider-status-display-normalization.md](../../../knowledge/error-memory/codex-provider-status-display-normalization.md#L1)，补充“显示状态与动作 capability 必须在同一投影边界收敛”；同时在 verified [codex-archive-revalidation-fail-open.md](../../../knowledge/error-memory/codex-archive-revalidation-fail-open.md#L1) 记录当前产品对 interrupted 的更窄拒绝规则。新行为仍待用户验收，不提升候选状态，也不改写历史 verified 证据。

## RAW-067 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 候选集合与首条合同 | implemented / unverified | “待输入”读取完整 `inputRequired`；“已完成未读”从 `all` 过滤 `bucket === 'completed-unread'`，因此计数中的已隐藏会话仍可成为候选；两者均使用既有展示排序后只取第一条。 |
| 单条与多条直达 | implemented / unverified | 两类角标只要非零，单条和多条均走相同 `openTask → codex.task.open` 路径，不再因数量大于一而先展开浮窗；第一条不可打开时不跳到后续会话。 |
| 排序与状态边界 | implemented / unverified | 首条按现有 `displayOrderedTasks`：置顶优先，其后保持上游最新 Turn 与匿名 key 的稳定顺序；打开动作不清除未读、不解除隐藏、不切换页签。 |
| 进行中与无计数 | unchanged / unverified | “进行中”继续调用 `requestExpansion(true)`；三个原生按钮仍由各自非零计数控制渲染，零计数不显示。 |
| 提示与可访问性 | implemented / unverified | 保留原生按钮点击、Enter、Space、200ms hover/focus 提示和既有 ARIA 路径；待输入与未读提示分别明确为“待输入 N · 打开第一条”和“未读 N · 打开第一条”。 |
| 限定静态校验 | pass | `git diff --check`、测试目录零差异、偏好 JSON 解析、单条门禁移除、候选源/排序/首条打开/进行中展开/零计数渲染/提示与事件链字符串检查均通过；Markdown code-link audit 为 `OK`，设计偏好回执为 `ready-for-ui-skill`，closeout 只生成 eligible 的 no-write canary candidate。依用户规则未修改或运行测试，未运行 typecheck、build、uTools、截图或真实 Codex 操作。 |

结论：RAW-067 已实现，当前保持 `未校验，待用户验收`。用户应分别验证待输入/未读为 1 条、多条以及未读首条已隐藏时都打开排序第一条，同时确认未读、隐藏和当前页签不改变，进行中仍只展开浮窗。

- Error memory: 复用既有 verified [codex-task-count-list-projection-divergence.md](../../../knowledge/error-memory/codex-task-count-list-projection-divergence.md#L1)，确保点击候选与角标计数使用同一完整投影；本轮不新增错误记忆。

## RAW-065 / RAW-066 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| Weekly 数据进度环 | implemented / unverified | primary/secondary 存在 Weekly 时渲染同池剩余进度 SVG，支持连续圆环与固定 20 段；无 Weekly 时不渲染外圈。 |
| 普通装饰圈移除 | reworked / unverified | 用户跟进截图证明首轮修正后最外层完整圆仍存在。当前除 `2px inset`、静态 border、inset outline 与装饰 shell 外，已继续删除根容器整圆背景、表面同尺寸外发光及宿主水球按钮的圆形 focus outline；键盘焦点改由中央读数下划线提示，保留轨道仅属于数据进度环。 |
| 环设置与校验 | implemented / unverified | 恢复样式、粗细、颜色模式、进度色、轨道色、光晕设置及 `2–6px`/`3:1` 校验；不恢复轮廓透明度入口，`shellOpacity` 只保留持久化兼容。 |
| interrupted 领域投影 | implemented / unverified | 原始 `CodexTurnStatus='interrupted'` 保留，但卡片投影转换为 `activityState='ongoing'`；running/ongoing 计数包含转换项，attention 只包含 failed/system-error。 |
| 全页面可见语义 | implemented / unverified | 动态、项目、已隐藏卡、角标、详情与 Shift 预览统一显示“进行中”，使用播放图标/running 色；可见状态联合类型、Renderer 分支与 CSS 不再包含 interrupted。 |
| 归档安全 | superseded by RAW-068 | RAW-066 原先按原始 interrupted 保留归档能力的子条款已被 RAW-068 取代；当前投影 ongoing 与 desktop-live active 均稳定阻止归档，Host 单条/项目路径也拒绝或跳过原始 interrupted。 |
| 限定静态校验 | pass | 首轮静态核对未覆盖宿主按钮 focus-visible，已因用户截图失效；本次重新执行 `git diff --check`、测试文件零差异、可见 interrupted 分支/CSS 零命中、Weekly ring/根背景/外发光/focus outline 结构检查、偏好 ready 回执与 Markdown 代码链接审计并通过。未修改或运行测试，未运行 typecheck、build、uTools、截图或真实 Codex 操作。 |

结论：RAW-065 已按用户跟进截图再次修正、RAW-066 的可见状态投影保持实现，其旧归档子条款由 RAW-068 取代；当前仍为 `未校验，待用户验收`。用户应重点确认截图中的最外层完整圆已经消失、键盘聚焦只在中央读数出现下划线、Weekly 数据进度环仍存在；并确认原始 interrupted 进入“进行中”角标且所有任务表面不出现状态“中断/已中断”，其归档控件持续禁用且不闪烁，failed、system-error 与 unknown 显示语义不变。四类额度场景仍为 5 小时 + Weekly、Weekly-only、Spark + Weekly 和无 Weekly。

- Error memory: 新增候选 [codex-water-ring-layer-separation.md](../../../knowledge/error-memory/codex-water-ring-layer-separation.md#L1) 与 [codex-provider-status-display-normalization.md](../../../knowledge/error-memory/codex-provider-status-display-normalization.md#L1)，分别记录视觉层误删，以及 provider 原始状态/动作能力未经完整产品投影便泄漏 UI；未保存原始对话或截图，待用户验收后再决定是否提升为 verified。

## RAW-064 历史交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 异常状态分段收敛 | implemented / partly superseded | `failed`、`system-error` 不再渲染“需关注”分段且保留各自错误表达；interrupted 保留准确行内表达的子条款已由 RAW-066 取代。 |
| 未知与紧凑语义 | implemented / refined | `unknown` 仍独立为“宿主状态未知”；RAW-066 后 `attentionCount` 只保留 failed/system-error，投影后的 ongoing 进入进行中计数。 |
| 无重排选择提示 | implemented / unverified | `选择模式 / 已选 N 项 / Esc 退出` 移入列表舞台底部绝对覆盖层，保留 `role=status`/`aria-live=polite`；选择滚动区预留安全空间，底部批量栏上移避让，顶部批量栏逻辑未改。 |
| 保留交互合同 | implemented / unverified | 38px 左侧选择区、核心选择状态机、Esc/最后一项退出、行/子按钮 Space/Enter 所有权与既有批量动作不变；未新增 API、持久化、runtime action、共享组件或 preload/platform 改动。 |
| 开发与宿主验收 | not run | 依用户规则，未新增或运行测试、typecheck、build、uTools、截图或真实 Codex 操作；本记录不把静态源码复核视为用户验收。 |

结论：RAW-064 的无“需关注”分段与无重排选择提示继续有效；其 interrupted 可见表达仅由 RAW-066 取代。用户仍需验收 failed/system-error 与 unknown 分组，以及进入/退出单选或多选时列表不因提示条重排、末行可滚动访问、底部批量栏不与提示重叠，Esc/最后一项取消选择正常恢复。

- Error memory: 已更新既有候选 [codex-selection-state-needs-structural-contrast.md](../../../knowledge/error-memory/codex-selection-state-needs-structural-contrast.md#L1)，加入“瞬时选择提示不得以顶部普通流新增一行、导致密集列表重排”的防复发规则；仍待用户视觉验收，未提升为 verified。

## RAW-063 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 四页签与兼容回退 | implemented / unverified | Float renderer 仅显示 `动态 / 已完成 / 已隐藏 / 项目`；`all/input` 投影保留给角标与统计，旧持久化、旧快照和 `codex.tab.set` 均回退为 `ongoing`。 |
| 6 小时动态流 | implemented / unverified | 动态页和徽标都按最近 6 小时的 `max(lastTurnStartedAt,lastTurnCompletedAt)` 非隐藏集合取数；当前 RAW-064 顺序为待输入、进行中（含三种异常状态）、未知、完成未读、已完成，完成任务仍在窗口内显示。 |
| 行内交互与密度 | implemented / unverified | 标题普通点击直达、Ctrl/Cmd 只选择；元信息行聚焦并高亮以接收 `Ctrl+T`。四按钮固定为 `24px / 2px / 102px`，注册提示只显示“最近 N 天的 M 条”。 |
| 水球收敛 | superseded by RAW-065 | RAW-063 当时移除 Weekly SVG 外环；RAW-065 已恢复数据进度环及其设置，同时删除普通装饰圈。 |
| 状态角标与图片回退 | implemented / unverified | 左下待输入保持实时；右下最边角为完成未读、其上为进行中，并使用不重置的、默认 1500ms 可配置完成展示窗口。编辑器支持 PNG/JPEG/WebP 选择、拖放、粘贴与内存预览；当前文本-only App Server 下图片动作仅复制文字并打开 Codex 空白会话，不创建 App Server 空线程。 |
| 静态核对 | pass | `git diff --check` 通过；已复核可见 Tab 仅为四项、旧 all/input 回退路径、6 小时动态筛选、外环 CSS/SVG/设置入口移除和受控/权威文档同步。按用户要求未运行测试、typecheck、build、uTools、截图或真实宿主操作。 |

结论：RAW-063 已实现，状态为 `未校验，待用户验收`。用户验收应确认旧 `all/input` 启动后直接进入动态、四页签无闪现、待输入角标/当前动态分段正常，以及最近 6 小时内完成任务仍可见。

- Error memory: 继续复用 [codex-cross-process-notloaded-is-not-completion.md](../../../knowledge/error-memory/codex-cross-process-notloaded-is-not-completion.md#L1)：只采用 latest Turn 的已证据时间，不以 `updatedAt`、刷新频率或跨进程 `notLoaded` 推断状态；新增候选 [codex-float-bridge-mock-contract-drift.md](../../../knowledge/error-memory/codex-float-bridge-mock-contract-drift.md#L1)，记录必需 `copyText` bridge 能力与完整测试 mock 的同步规则。该 mock 已补齐，但 typecheck 仍由用户执行后才能提升记录状态。

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
| 紧凑角标说明 | implemented / refined by RAW-067 | 待输入单/多项、正在进行中、已完成未读角标共享移出展开分支的说明层；200ms 后显示作用，离开/失焦关闭，hover/focus 不展开或切页；待输入与未读点击合同现由 RAW-067 统一为打开完整计数投影中的排序首条。 |
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
| 选择模式提示 | implemented / unverified | 任一任务选中后常显“选择模式 / 已选 N 项 / Esc 退出”，数量实时变化，最后一项移出后消失；RAW-064 将其改为列表舞台底部绝对提示，避免顶部普通流重排。 |
| 层级区分 | implemented / unverified | 未选行降至 `.62` 不透明度并降低饱和度；选中行使用 `2px` 强调边、`5px` 左轨、强底色与双层焦点/阴影。 |
| 左侧徽标 | superseded by RAW-058 | RAW-057 的状态图标替换为 `✓` 已由 RAW-058 取代；当前 38px 左侧控件始终保留状态图标，并保留强调 selected/focus/active 边界。 |
| 自动化契约 | updated / not run | UI 测试增加模式条、实时数量、最后一项退出、勾选符号和未选降权断言；依用户规则未执行。 |

结论：RAW-057 为 `未校验，待用户验收`。未运行测试、typecheck、build、uTools/runtime、截图或真实 Codex 操作。

- Error memory: 新增候选 [codex-selection-state-needs-structural-contrast.md](../../../knowledge/error-memory/codex-selection-state-needs-structural-contrast.md#L1)，等待用户视觉验收后再决定是否提升为 verified。

## RAW-056 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| Codex Desktop 伴随桥 | implemented / unverified | Preload 已实现 macOS loopback Unix socket、长度帧、固定版本 initialize/snapshot/patch/follow/request/read-state、断线重连，以及 owner/mode 与协议不兼容 fail-closed；桌面全文快照仅在 preload 内瞬时投影。 |
| Input / 正在进行中 | implemented / unverified | `statusAuthority=desktop-live` 才能产生 waiting-input/waiting-approval/active；App Server/V1 delta 只标记 connector authority。失去 desktop live 后立即转“宿主状态未知”，不再使用五秒启发或本地缓存计数。 |
| 已完成未读 | implemented / unverified | 最新 Turn completed 与 Codex `hasUnreadTurn` 共同决定；live read-state 优先，断线时可用 Codex 自身持久化 unread 集合。EyPc open/hide/restore 与待输入打开均不确认；仅显式完成未读命令在 EyPc 本地确认当前 completion revision。 |
| 归档即时同步 | implemented / unverified | App Server `thread/archive` 及 false/true 双向验证保留；成功后向已连接桌面端派发 `thread-archived` v2。单条/项目结果区分已派发与桌面端未确认即时刷新，通知失败不回滚已验证归档。 |
| 活动与诊断 UI | implemented / unverified | 动态页显示正在进行中（含错误状态）、宿主状态未知和已完成未读等分段；角标仅统计桌面权威 Input/active/unread。设置页分别展示 App Server 数据连接器与桌面实时桥状态；普通 watchdog 改为 5s，三次失败后 1s。 |
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
- Project AI-rule audit 在补充 `EYPC-UTOOLS-HOST-001` 后仍只返回此前已记录的 6 条 adapter/governance baseline 缺口（文档模板合同、模板传播、v3-route、W24/W28/W30），没有新增指向本次宿主边界规则或错误共识的问题。`HEAD` 视图因 `git_view_materialization_failed` 未能生成，因此“未新增”以当前命名问题集合与本文件既有基线记录对照，不宣称完成独立 HEAD 重放。
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

## Revision 2026-07-23.1 Static Verification Pending

- 已核验本机 Codex Desktop 存在真实 Side Chat live stream；Side Chat 未进入普通 inventory，但 snapshot/patch/follow/read-state 可由 preload shadow 通路接收并聚合到主对话。
- 已实现 `waitingOnUserInput` 进入/退出即时发布；其他 activity、普通未读和 Side Chat 关系走单一 2 秒稳定窗口，并将完成转换交给既有默认 1500ms、可配置的完成稳定器，避免两个窗口叠加。
- 已实现主对话隐藏导航目标选择与 Deep Link 失败回退逻辑；本轮未执行真实打开动作，因此 Side Chat 直跳仍标记为“未验证”，不写入 publish log 能力承诺。
- 按用户要求仅执行 `git diff --check`、`pnpm run typecheck` 与静态结构核验；不执行自动化测试、build、截图、uTools 宿主验收或额外自动化测试。
