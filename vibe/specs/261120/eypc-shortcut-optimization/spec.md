---
spec_id: SPEC-261120-EYPC-SHORTCUT-OPTIMIZATION
spec_revision: 5
status: confirmed
task_id: 261120-eypc-shortcut-optimization
decision_status: explicit-current-request
raw_sources: [RAW-001, RAW-002, RAW-003, RAW-004, RAW-005]
---

# 快捷键管理

关键词：快捷键管理、命令入口、跳转缓存、任务轮次、原始需求迁移

2026-11-20 确认两批实施。产品规则见 [PRD](../../PRODUCT_REQUIREMENTS.md#companion-多来源汇总)，条款与裁决见[需求登记](../../requirements/conflict-register.md#2026-11-20-快捷键管理与跳转缓存)。构建及宿主进度见[实施交付与验收状态](#实施交付与验收状态)。

## 现行入口

| 序号 | 场景 | 生效规则与入口 |
| --- | --- | --- |
| 1 | 绑定与接管 | 插件内键位可录制、改绑、恢复与禁用，保存后生效。冲突检查结合 Tab、层和 When，编辑与弹层先于页面命令。系统级绑定在 uTools 配置，EyPc 提供准确的绑定入口。[统一交互条款](../../requirements/interaction-raw-179-clause-004.md#L1) · [设置说明](../../../../src/help/guides/settings.md#快捷键) |
| 2 | 主窗和浮窗导航 | 主窗默认 `Ctrl+Shift+数字` 按启用顺序切功能。Float 展开卡片内 `Ctrl+Shift+1…5` 属于 Action 槽，交给独立 Runner。编辑、确认和抽屉按各自键盘层优先处理。`Ctrl+Alt+S` 打开设置，`Shift+Escape` 隐藏插件。[通用键盘约定](../../../../src/help/guides/settings.md#通用键盘与交互全插件) · [卡片键位](../../../../src/help/guides/codex.md#卡片内快捷键) |
| 3 | Companion 任务跳转 | 上一／下一承接当前最高非空层，待输入和已完成未读各有独立轮次，精确快开对准所选根任务。直接从已有可信来源快照选择，完全无可用缓存时结束本次。[跳转缓存组件](jump-cache-component.md#L1) |
| 4 | Quick Jump 与任务快开 | `F` / `Shift+F` 为非编辑区可见命令标记，`Alt+F` 在 Codex 卡片只标记可见会话并打开。快速任务查看的编号随可执行行重算，折叠组标题的编号执行展开。[共享交互](../../PRODUCT_REQUIREMENTS.md#shared-interaction-surfaces) · [快速任务查看](../../../../src/help/guides/codex.md#快速任务查看) |
| 5 | 窗口槽与收藏 | 窗口槽按原生根定位，文件槽按平台保存绑定，两个十槽均由 uTools 配置。收藏快开与抽屉按所在层解释数字键。[窗口跳转](../../PRODUCT_REQUIREMENTS.md#window-jump-workbench) · [文件收藏](../../PRODUCT_REQUIREMENTS.md#file-favorites) |
| 6 | 功能内命令 | 端口、MQTT、文件收藏、窗口跳转及 Action Runner 的局部操作由各自命令目录消费，默认键位见各帮助。按钮、菜单、详情和快捷键带同一目标进入命令。[功能帮助登记](../../../../src/help/guides/index.ts#L1) · [Action Runner](../../../../src/help/guides/codex.md#environment-action) |

## 两批实施

| 序号 | 批次 | 实施范围 | 验收 |
| --- | --- | --- | --- |
| 1 | 任务跳转 | 来源自己预热、增量补包和发布可信快照。把通用、专用和任务快看入口切到缓存读取，移除属于这些入口的库存预检。补列表重排、排队和应用就绪后的资格核对、同目标连按及旧回执隔离。Codex 原生任务按同一完成实例的原生证据清读。 | [第一批缓存与派发验收](jump-cache-component.md#第一批缓存与派发验收) |
| 2 | 键位与窗口交互 | 补设置维护的键盘入口、Quick Jump 的目标和激活合同、Float 操作提示。主窗切页和 Float Action 槽按窗口解析。Runner 跟随已保存的 Quick Jump 改绑，宿主全局 Runner 和槽位各走自己的绑定入口。 | [第二批窗口与键位验收](#第二批窗口与键位验收) |

## 源码基线与待核

工作树实施基线为 `981418b`，此前整理基线为 `81bf91b`。入口盘点、原生打开及旧宿主取样见[实施基线与旧缺口](jump-cache-component.md#实施基线与旧缺口)。缓存变更见[组件实现](jump-cache-component.md#本批实现)。

- 基线设置「维护 → Layer Commands」有右键动作入口和 `Ctrl+→` 提示，键盘处理当时只进入「快捷键」分区。[最初交互范围](../../260713/0834-cross-tab-responsive-command-panels/raw-requirement.md#L27) · [设置页键盘入口](../../../../src/pages/SettingsPage.vue#L524)
- 基线 Quick Jump 从当前窗口收集目标，普通标记激活控件，Float 的任务专项打开对应任务。窗口间应共享有效绑定、目标登记和落点核对。Float 的操作提示由其手动触发入口送给共享 Tooltip。[目标登记](../../../../src/ui/quickJumpRegistry.ts#L162) · [Float 激活](../../../../src/FloatApp.vue#L2519) · [提示触发](../../../../src/FloatApp.vue#L3266)
- 基线主窗切页和 Codex 槽位都声明 `Ctrl+Shift+数字`。Float 有独立槽位键路由。Runner 基线按命令默认键处理 Quick Jump，标题栏另有 uTools「去绑定」。[切页分配](../../../../src/runtime/feature/featureRegistry.ts#L54) · [槽位命令](../../../../src/runtime/feature/codex/commands.ts#L29) · [Runner 键盘处理](../../../../src/ActionApp.vue#L241)

## 第二批窗口与键位验收

使用 Root 确认已加载本批产物的 uTools。从设置「说明」打开 [设置帮助](../../../../src/help/guides/settings.md#L1)及[Codex 帮助](../../../../src/help/guides/codex.md#L1)，核对帮助、提示和实际按键结果。

| 序号 | 操作 | 预期 |
| --- | --- | --- |
| 1 | 设置的「快捷键」及「维护 → Layer Commands」各聚焦一条命令。试 `Ctrl/Cmd+←`、`Ctrl/Cmd+→`、右键及 `Escape`。 | 当前行打开相应面板，键盘与右键使用同一目标。关闭恢复触发行。录制和 When 编辑由各自控件接管，改动在保存后生效。 |
| 2 | 主窗、Float、Runner 分别按各自有效的 Quick Jump 键。试反向、编辑焦点、已隐藏或失效目标、标记层开启时列表变化。 | 标记居中并对应当前活动窗口的可达目标，选中动作沿登记目标派发一次。目标失格即取消该选择。Float 普通任务标记只移动高亮，`Alt+F` 打开对应会话。搜索或折叠重排后快开编号对应当前行。 |
| 3 | 在紧凑角标和展开卡片的操作上悬停或用键盘聚焦，再离开、失焦或进入 Quick Jump。 | Float 自己显示当前操作和有效绑定或禁用原因，鼠标和键盘可达。标记层开启或目标失效时收起普通提示。现有确认和动作结果仍在对应目标上可辨。 |
| 4 | 在主窗（含 Codex Tab）和展开的 Float 分别试 `Ctrl+Shift+1…5`，再试编辑/确认状态、自定义绑定及恢复默认。 | 主窗按功能顺序切页。Float 在当前层允许时调用同号 Action 槽一次，经独立 Runner 定位及校验后执行。uTools 系统槽位继续从桌面触发，展开卡无独立槽位面板。 |
| 5 | 在 EyPc「设置 → 快捷键」分别改绑、禁用、恢复 Quick Jump 两方向。保存后到已打开及重新打开的 Runner 试新旧键，再点标题栏「去绑定」。 | Runner 使用已保存的有效键和禁用状态，改绑后原默认键不再触发对应方向。标题栏打开 uTools 中「打开 Action 执行工作台」的配置，槽位在 Codex「快捷方式」逐项独立配置。直接打开 Runner 只定位窗口，槽位入口再执行目标。 |

### 合并后 F 项复验

| 序号 | 操作 | 预期 |
| --- | --- | --- |
| 1 | 在 Runner 给执行或停止操作打开标记，再改选另一条 Action 或刷新原位置。 | 旧标记只能作用于原 Action 和原操作。原目标失效时取消派发。 |
| 2 | 在设置录制 `Ctrl+Shift+数字`。另选一条已禁用且原有改绑的命令，只改 `When`，保存后重开设置。 | 录制期间留在设置页。保存后 `When` 已更新，原键位和禁用状态均保留。 |
| 3 | 在业务页选顶部设置标记。在 Float 长按槽位键，再对比 `Alt+F` 和 `Alt+数字` 的任务候选。 | 设置切页与点击一致。槽位长按只触发一次。任务在标记显示后失去打开资格时，本次不派发。 |
| 4 | 同版 uTools 做十组 Codex 开窗对照，并在准备期间使一个目标失格。 | 失格目标不派发、不占用对照试次。同一组核对实际可见会话和耗时。[配对步骤](../../261114/codex-state-sync/delivery.md#shortcut-read-reconciliation-261120) |

## 需求与历史

用户事实见[规范化需求](raw-requirement.md#2026-11-20-实施确认)。旧条款、局部取代与历史实现见[迁移索引](shortcut-requirement-migration-index.md#L1)。先前整理记录在 `81bf91b` 通过当时的需求登记、来源锚点、文档代码链接检查与自然 Stop 构建。该记录对应旧基线。

## 实施交付与验收状态

| 序号 | 项目 | 状态 |
| --- | --- | --- |
| 1 | 需求与历史 | 专题条款已登记，迁移索引保留旧原件和实现。生效和取代关系见[需求登记](../../requirements/README.md#L1)。 |
| 2 | 键位与派发 | 设置维护与快捷键页共享命令行详情和动作。主窗标记按稳定目标派发，并优先处理当前生效的隐藏键。Float 的编号和提示使用有效绑定。Runner 从现有快照接收两方向的改绑或禁用。[设置入口](../../../../src/pages/SettingsPage.vue#L795) · [主窗标记](../../../../src/App.vue#L244) · [浮窗编号和标记资格](../../../../src/FloatApp.vue#L752) · [Runner 快照](../../../../preload/index.js#L15653) |
| 3 | 构建与宿主 | 自然 Stop 在原生未读校验阶段发现夹具缺少逐来源缓存状态。夹具已覆盖整包就绪和仅 Codex 源就绪两种情况。2026-11-20 20:04:03 前置完整构建通过，产物为 `V7` / `host-a3230dfd4394e3fae4ae` / `renderer-53b55ff805c289fdffa1`。同版 uTools 加载、首个可用缓存、完整列表、派发和实际开窗仍待实测。[工作树产物记录](../../PROJECT_STATUS.md#shortcut-worktree-build-261120) |
| 4 | 工作树索引 | [专题控制记录](../../../../docs/worktree-control/261120-eypc-shortcut-optimization.md#L1)、[机器索引](../../../../docs/worktree-control/index.json#L1)与[工作树索引](../../../../WORKTREE_TASKS.md#L1)记录实施基线和接续入口。 |
| 5 | 本地核验 | 类型、合同、需求登记、71 份来源锚点和专题代码链接检查通过。18 个缓存入口回归、163 个导航与适配器用例和 251 个窗口与键位用例通过。扩展套件仍有基线失败，入口体量检查也在 `981418b` 已超限。 |
| 6 | 合并后 F 项 | 主检出 21:07:36 完整构建通过。回归用例随构建通过类型检查，UI 用例执行和新版 uTools 操作待验。[F 项产物](../../PROJECT_STATUS.md#shortcut-f-build-261120) · [复验步骤](#合并后-f-项复验) |

<a id="post-merge-requirement-review"></a>

## 11 月 20 日合并后需求复核

复核范围为原生状态续修 `95f7c0c`、读态和开窗接续 `647d24c`、快捷键缓存合入 `2424237` 及主检出的 F 项。起始源码为 `main` 的 `f2af047` 加本地 F 差异。初始产物见[F 项构建记录](../../PROJECT_STATUS.md#shortcut-f-build-261120)。来源以两个专题的原始需求、已确认的局部取代和 11 月 20 日追加决定为准。

| 序号 | 原始需求 | 第一性原理与设计 | 实施记录与同步入口 |
| --- | --- | --- | --- |
| 1 | Native 真实待继续、旧机器中断和同组缺证分别可辨。[状态原要求](../../261114/codex-state-sync/raw-requirement.md#raw-001--状态流结构兼容与功能保留) | 状态随实际成员、当前轮和证据来源建立。Host 先核身份、拓扑、活动和待办覆盖，V7 用同一组事实发给 Main、Float 与快捷键。已证实较早结束且当前覆盖完整的机器旧轮退出当前归约。 | B09 记录了主轮、Side 与机器成员的分批改造。精确关系、实际连接、任务包渲染和动作资格按[状态矩阵](../../261114/codex-state-sync/native-status-parity-plan.md#acceptance)核验。 |
| 2 | 已读误报、断线恢复和同任务新完成独立核对。[RAW-004](../../requirements/shortcut-management-raw-004.md#L1) | 读态由对应 Provider 的可信读证据建立。Codex 原生补读绑定账号、宿主、连接代次、成员和完成实例；派发回执单独记录访问轮次。 | [读态接续](../../261114/codex-state-sync/delivery.md#shortcut-read-reconciliation-261120)记录了断线补读及迟到回执。原生 Codex 的清读时点由 11 月 20 日裁决修订，其他来源沿各自合同。 |
| 3 | 任务快捷键用已有缓存、按轮次承接，映射缺失时仅补同一目标。[RAW-001 至 RAW-003](raw-requirement.md#2026-11-20-实施确认) | 选择、打开和状态同步各有边界。来源后台发布，按键只读取可信切片。排队、应用就绪及精确派发前使用原目标重核；冷态与目标失格均结束当次请求。 | [缓存设计和验收](jump-cache-component.md#第一批缓存与派发验收)记录了逐来源、重排、同目标连按及查询计数。现行裁决在[需求登记](../../requirements/conflict-register.md#2026-11-20-快捷键管理与跳转缓存)。 |
| 4 | 设置录制、When、窗内键位、Quick Jump 和 Runner 按实际可操作目标工作。[RAW-005](../../requirements/shortcut-management-raw-005.md#L1) | 录制、编辑和确认层优先消费输入。标记沿点击入口携带原目标。快捷键局部修改保存到对应字段，动作槽按一次按压处理。 | F 已落地并构建。交互与说明见[复验清单](#合并后-f-项复验)、[设置帮助](../../../../src/help/guides/settings.md#快捷键)和[Codex 帮助](../../../../src/help/guides/codex.md#卡片内快捷键)。 |
| 5 | 减少派发后的开窗迟到，并用十组热态配对评估。[配对要求](../../261114/codex-state-sync/delivery.md#shortcut-read-reconciliation-261120) | 用同一 `operationId` 对账选中、派发、前台、目标可见及原生清读。同版、同应用及同目标的实际可见耗时决定正式路线。 | 已具备配对入口。复核起点的同版加载未获证，实际窗口到达为 0/10。 |

原始需求、现行取代关系、产品真值、功能帮助和构建记录的责任见[项目文档入口](../../../rules/documentation.md#tiers)。

### 核验与修正

| 序号 | 核对结果 | 修正与验证入口 |
| --- | --- | --- |
| 1 | 机器中断的起止落在同秒时，旧判断把确切终止和开始时间回填混为一谈。当前请求覆盖补齐时也可能漏更新。 | 单独保存精确中断时间。按当前轮更新覆盖，用时间精度上界判断是否早于主轮。保留真实主轮待继续和子成员历史。[终止证据](../../../../preload/index.js#L9501) · [V7 归组](../../../../preload/companion/task-kernel.cjs#L1977) |
| 2 | 实时读通知先写入，再发现打开已跨完成轮。 | 将读态写入放在回执对账之后。观测窗内同账号、同连接、同线程的冲突读通知保留新轮未读，原操作只结算一次。连接换代及观测期结束后仍可接纳独立原生读态。[实时写入入口](../../../../preload/index.js#L7204) · [回执范围](../../../../preload/codex/desktop-open-observation.cjs#L167) |
| 3 | 快开精确映射缺失时缺少恢复入口，常规就绪检查仍先执行。 | 当次结束，后台在同一来源代次用私有反向索引恢复同一目标。下一次选择仍复核候选、操作轮次和精确映射。冷态和逐来源合同已同步到状态交付与缓存规格。[恢复入口](../../../../preload/index.js#L11930) · [状态交付](../../261114/codex-state-sync/delivery.md#shortcut-read-reconciliation-261120) |
| 4 | 设置录制优先、When 局部保存及主窗标记与点击入口对齐。帮助里专用未读排序、读态和机器中断描述有漂移。 | 帮助改为最近提问排序，说明各来源清读合同及机器历史的显示边界。界面交互按 F 项现场清单复核。[任务帮助](../../../../src/help/guides/codex.md#任务行为用户可见) · [F 项复验](#合并后-f-项复验) |
| 5 | 应用就绪的操作编号原来只在诊断详情内，按编号查询会漏掉该阶段。 | 将编号写入可查询字段，并记录配对应用验证。派发、前台、会话落点和原生已读各有单独证据。仍需同版宿主记录十组实际落点，再比较两条路线。[就绪诊断](../../../../preload/companion/open-readiness.cjs#L55) · [配对步骤](../../261114/codex-state-sync/delivery.md#shortcut-read-reconciliation-261120) |

### 构建与现场核验

1. 2026-11-20 21:33:26，主检出 `--closeout` 构建通过。源码及随包各通过 196 个生命周期检查点和 40 个原生读态检查点。新增断言覆盖同秒精确中断与起始时间回填、同轮覆盖补齐或丢失、同线程迟到实时读通知、映射恢复与旧代次、应用就绪日志关联。需求登记及产品真值已同步。F 项的浏览器交互用例随构建通过类型检查，执行待验。[当前构建](../../PROJECT_STATUS.md#shortcut-review-build-261120)
2. 本轮只读回查，uTools 最新可见握手仍是 11 月 20 日 18:33:00 的历史包 `host-76820ccd4e3888194fd9`。21:33:26 产物待实际加载。现场顺序为核对握手，同一任务对照 Main、Float 和快捷键候选，再核真实主停态、同目标读态及新轮，最后完成热态 10 组配对。已有可核的实际目标到达为 0/10 组。Magpie 换号或额度用尽仍缺故障窗口的因果证据。[同版测试入口](../../261114/codex-state-sync/delivery.md#shortcut-read-reconciliation-261120)
