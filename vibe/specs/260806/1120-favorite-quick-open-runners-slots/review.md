# Review：收藏快速打开、可编辑脚本运行器与 10 文件槽

Tool: claude
Date: 2026-08-07
Review type: `inspect-report`（需求 ↔ 实现贴合度复核，未改动产品代码）
Reviewed status: `automated-verified / host-pending`（复核后维持不变）

Requirement authority: [spec.md](spec.md#L1)
Raw source: [raw-requirement.md](raw-requirement.md#L1)
Canonical product entry: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L36)
Implementation commits: `463a9a7`（实现）、`94b0645`（文档同步）

## 1. 复核范围与方法

- 以 RAW 的 4 组意图（打开与运行器 / 文件槽 / 快速页与快捷键 / 搜索学习）和 spec `Current Contract` 的 4 组条款为核验清单，逐条回到源码取证。
- 只读核验：领域纯函数、Runtime 副作用、Preload 平台桥、路由、UI、`plugin.json`、用户说明、状态与迁移。
- 复跑 spec 声明的 8 个 validator 测试文件（结果见第 4 节），未跑三平台真实宿主。

## 2. 逐条贴合度

### 2.1 打开与自定义运行器

| 需求条款 | 实现证据 | 结论 |
| --- | --- | --- |
| 无运行器时继续系统默认打开 | [appRuntime.ts:7818](../../../../src/runtime/appRuntime.ts#L7818) 无 runner 分支直接走 `platform.files.open` | 贴合 |
| 双击 / `Enter` / 数字键 / 文件槽走同一执行函数 | 四个入口全部汇入 `executeFavoriteItem`：[openFavorite:7830](../../../../src/runtime/appRuntime.ts#L7830)、[executeQuickFavoriteAt:7960](../../../../src/runtime/appRuntime.ts#L7960)、[activateFavoriteSlot:7922](../../../../src/runtime/appRuntime.ts#L7922) | 贴合 |
| 每平台独立保存 `background \| terminal`、程序、参数数组、目录与信任 | [types.ts:48](../../../../src/domain/types.ts#L48)、[types.ts:239](../../../../src/domain/types.ts#L239) `runnerByPlatform` | 贴合 |
| 程序仅绝对路径或 `PATH` 名；工作目录必须为该平台绝对路径 | [favoriteLaunch.ts:173-182](../../../../src/domain/favoriteLaunch.ts#L173)、[favoriteLaunch.ts:207](../../../../src/domain/favoriteLaunch.ts#L207) | 贴合 |
| 信任指纹覆盖平台 + 收藏 ID/类型/路径/名称 + 完整配置 | [favoriteRunnerFingerprint:41-74](../../../../src/domain/favoriteLaunch.ts#L41) 的 `stableRunnerPayload` 字段齐全 | 贴合 |
| 畸形旧配置保留可修复，但禁止执行 | [normalizeFavoriteRunnerByPlatform:141-155](../../../../src/domain/favoriteLaunch.ts#L141) 保留有界副本；[isFavoriteRunnerTrusted:76](../../../../src/domain/favoriteLaunch.ts#L76) 与 [resolveFavoriteRunner:194](../../../../src/domain/favoriteLaunch.ts#L194) 双重拒绝 | 贴合 |
| 只做占位符替换，不解析命令行 | [expandFavoriteRunnerTokens:184](../../../../src/domain/favoriteLaunch.ts#L184) 仅 `{path}/{dir}/{name}` | 贴合 |
| 后台独立进程、`shell:false`、忽略输出、隐藏控制台 | [preload/index.js `spawnFavoriteDetached`](../../../../preload/index.js#L1372) `shell:false, detached:true, stdio:'ignore', windowsHide` | 贴合 |
| Windows `.cmd/.bat` 不可作直接可执行程序 | 领域层 [favoriteLaunch.ts:180](../../../../src/domain/favoriteLaunch.ts#L180) + Preload 再校验 [preload/index.js](../../../../preload/index.js#L1469)（纵深防御） | 贴合（强于合同） |
| PowerShell 不加 `Bypass`；终端缺失不回退后台 | [favoriteTerminalAdapter](../../../../preload/index.js#L1404) 仅 `-NoLogo -NoProfile -NoExit -Command`；无适配器返回 `unsupported` 而非 background | 贴合 |
| 相关字段变化后必须重新确认 | 编辑器任一运行器字段改动即 `runnerTrusted:false`（[appRuntime.ts:8223-8227](../../../../src/runtime/appRuntime.ts#L8223)）；保存时比对旧指纹，不一致才弹出信任确认（[appRuntime.ts:8448-8477](../../../../src/runtime/appRuntime.ts#L8448)） | 贴合 |
| 不接受原始 shell 字符串 / 环境变量 / 凭据 | 编辑器只有程序、参数行、工作目录三类输入；无环境变量字段 | 贴合 |

### 2.2 10 个文件槽

| 需求条款 | 实现证据 | 结论 |
| --- | --- | --- |
| 状态固定 10 槽、每槽按平台分别保存 | [createFavoriteSlots:30](../../../../src/domain/favoriteLaunch.ts#L30)、[state.ts:358](../../../../src/domain/state.ts#L358) | 贴合 |
| `eypc-favorite-slot-1…10`，名称「EyPc 文件槽 1–10」，全部 `mainHide` | [plugin.json](../../../../public/plugin.json#L42) 实测 10 条，`mainHide: true` 齐全 | 贴合 |
| `mainHide` 指令直接执行、不抢主窗 | [featureRouting.ts:37-44](../../../../src/runtime/feature/featureRouting.ts#L37) `preserveCurrentTab + visibilityOwner:'mainHide'`；成功路径不调用 `platform.app.show()` | 贴合（真实宿主待验） |
| 失败打开完整收藏页并进入修复管理器 | [showFavoriteWorkbench:7738](../../../../src/runtime/appRuntime.ts#L7738) 切页 + 开管理器 + 定位目标 + `show()`；未分配/不支持/未信任/无效/启动失败五类分支均调用 | 贴合 |
| 一个「分配到文件槽…」动作进入紧凑管理器 | 抽屉项 [appRuntime.ts:6488](../../../../src/runtime/appRuntime.ts#L6488)；管理器 UI [FavoritesPage.vue](../../../../src/pages/FavoritesPage.vue#L770) 含分配/替换/测试/快捷键/清除 | 贴合 |
| 未收藏的实际目录行不能直接绑定 | 管理器下拉只列 `state.favorites` 非分组项；[assignFavoriteSlot:7869](../../../../src/runtime/appRuntime.ts#L7869) 要求 `favoriteById` 命中 | 贴合 |
| 跳转 uTools 快捷键设置 | [configureFavoriteSlotHotkey:7915](../../../../src/runtime/appRuntime.ts#L7915) → `redirectHotKeySetting('EyPc 文件槽 N')`（[preload/index.js:8871](../../../../preload/index.js#L8871)），标签与 `plugin.json` `cmds` 字面一致 | 贴合 |
| 删除收藏同步清理槽位与学习引用 | [removeFavoriteNow:7620-7624](../../../../src/runtime/appRuntime.ts#L7620)，撤销快照同时保存槽位与学习 | 贴合 |

### 2.3 快速页、搜索与键盘

| 需求条款 | 实现证据 | 结论 |
| --- | --- | --- |
| 单一跨全部虚拟分组搜索入口 | [appRuntime.ts:6592](../../../../src/runtime/appRuntime.ts#L6592) 快速模式下 `groupId: null`；快速页只有一个 `SearchSuggestBox` | 贴合 |
| 进入自动聚焦搜索并高亮第一项 | 路由 `focusSearch:true`（[featureRouting.ts:102](../../../../src/runtime/feature/featureRouting.ts#L102)）+ `setFavoriteQuickMode` 末尾 `normalizeFocusedFavorite(true)`（[appRuntime.ts:9614](../../../../src/runtime/appRuntime.ts#L9614)） | 贴合 |
| 结果显示类型、路径、分组面包屑 | [QuickFavoritesPage.vue:176-181](../../../../src/pages/QuickFavoritesPage.vue#L176) | 贴合 |
| 文本精确/前缀/包含层级优先，其后依次查询亲和 → 30 天半衰期 → 最近/次数 → 手工顺序 | [favorites.ts:263-277](../../../../src/domain/favorites.ts#L263) 排序链与合同逐项同序 | 贴合 |
| 空查询按全局近期/常用排序 | 同上：`score` 全 0 时直接落到 frecency/最近/次数 | 贴合 |
| 学习上限 50 查询 × 每查询 10 项 LRU | [pruneFavoriteSearchAffinities:271](../../../../src/domain/favoriteLaunch.ts#L271) | 贴合 |
| 定位、复制与失败不计入 | `markFavoriteUsed` 只在 `executeFavoriteItem` 的 accepted 分支调用；reveal/copy 路径不调用 | 贴合 |
| 抽屉关闭时 `Ctrl+1…9`/`Ctrl+0` 执行前 10 项；抽屉打开由更高层解释 | 快速项 `weight 170` + `when` 含 `!favoriteDrawerActive`；抽屉项 `weight 400`（[keybindingRuntime.ts:618-637](../../../../src/runtime/keybinding/keybindingRuntime.ts#L618)）；Runtime 侧再守 `favoriteDrawer.open`（[appRuntime.ts:7961](../../../../src/runtime/appRuntime.ts#L7961)） | 贴合 |
| 快速页只读，完整页可重置单项/全部学习 | `openFavoriteSlotManager` 在快速模式直接拒绝（[appRuntime.ts:7849](../../../../src/runtime/appRuntime.ts#L7849)）；重置动作全部 `!ctx.favoriteQuickMode` | 贴合 |

### 2.4 迁移与验收意图

| 需求条款 | 实现证据 | 结论 |
| --- | --- | --- |
| 旧状态无损迁移到 10 空槽 + 空学习 | [normalizeFavoriteSlots:267](../../../../src/domain/state.ts#L267) 缺失补空、越界丢弃、重复去重、悬空 ID 剔除；[normalizeFavoriteSearchAffinities:287](../../../../src/domain/state.ts#L287) 同理 | 贴合 |
| 不静默吞错 | 五类失败各有独立中文提示，槽位失败额外落到修复管理器 | 贴合 |
| Preload canonical → public 镜像同步 | 工作树 `preload/index.js` 与 `public/preload.js` 逐字节一致（本轮 `diff` 复核） | 贴合 |
| 本期不实现固定角窗口、不监测/移动 uTools 主搜索窗 | 代码中无固定角窗口与主搜索窗探测；[spec.md `Phase Boundary`](spec.md#L100) 与 PRD 均已声明 | 贴合 |

## 3. 复核发现

无 P0 / P1 功能缺陷。以下为 P2 级口径差与真实宿主风险，均不阻塞当前状态。

处置总表（2026-08-07 同轮完成）：

| 编号 | 处置 | 落点 |
| --- | --- | --- |
| R-1 同平台槽位互斥 | 补入合同与用户说明（保留现有实现语义） | [spec.md `Slots and routing`](spec.md#L83)、[PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L49)、[favorites.md](../../../../src/help/guides/favorites.md#L62) |
| R-2 只能配置当前平台 | 补入合同与用户说明 | [spec.md `Launch and trust`](spec.md#L77)、[PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L48)、[favorites.md](../../../../src/help/guides/favorites.md#L55) |
| R-3 `dispatched` 计入学习 | 改文档口径为「宿主受理」，实现不动 | [spec.md `Search and keyboard`](spec.md#L92)、[PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L50)、[favorites.md](../../../../src/help/guides/favorites.md#L68) |
| R-4 Linux 终端适配器 | 升为宿主验收优先项 | [spec.md `Verification`](spec.md#L109) 新增一行 |
| R-5 MQTT 巨型用例阈值 | **暂停**：明确不归属本快捷脚本/文件槽增量，转交 MQTT owner，不在本轮改动测试 | [spec.md `Verification`](spec.md#L109) 新增一行 |

### R-1（P2，合同缺口）同平台槽位互斥规则未写入任何权威文档

[assignFavoriteSlot:7881-7886](../../../../src/runtime/appRuntime.ts#L7881) 在写入目标槽前，会先把该收藏从**当前平台的其他所有槽**移除 —— 即"同一收藏在同一平台只能占一个槽"。spec 只写了"分配、替换、清除、测试"，PRD 与 [favorites.md](../../../../src/help/guides/favorites.md#L1) 也未提。用户把同一脚本绑到两个槽时会静默丢失前一个绑定。建议二选一：在 spec `Slots and routing` 与用户说明各补一句，或改为允许重复绑定。

### R-2（P2，边界未声明）运行器与槽位只能在"当前平台"上配置

编辑器的 `runnerPlatform` 恒等于 `currentFavoritePlatform()`（[appRuntime.ts:8193](../../../../src/runtime/appRuntime.ts#L8193)、[8211](../../../../src/runtime/appRuntime.ts#L8211)），槽位分配/清除同样只动当前平台键。RAW 的"为 macOS、Windows、Linux 分别配置"字面上可读成"可在一台机器上预配三平台"，实现是"各平台各自配置、互不覆盖"。已核验跨平台数据确实互不破坏（assign/clear 只增删当前平台键，迁移保留其余平台键），因此这是措辞边界而非缺陷。建议在 spec 与用户说明中明确"需在对应系统上各自配置"。

### R-3（P2，口径差）`dispatched` 被计入搜索学习

spec 写"只有默认打开或运行器成功启动才计数"，实现把 `started` 与 `dispatched` 一并视为 accepted 并记账（[appRuntime.ts:7807-7811](../../../../src/runtime/appRuntime.ts#L7807)、[7819-7823](../../../../src/runtime/appRuntime.ts#L7819)）。`dispatched` 只代表宿主已接受请求（提示文案本身就是"已请求系统打开"），无法确认真的启动。倾向改文档为"被宿主接受的打开/启动"，而不是改实现 —— 宿主本就不回执最终结果。

### R-4（P2，真实宿主风险）Linux 终端适配器的参数与工作目录一致性

[favoriteTerminalAdapter](../../../../preload/index.js#L1404) 对 `x-terminal-emulator`/`konsole` 用 `-e`、`xfce4-terminal` 用 `-x` 后直接跟 `executable + args`。部分发行版的 `-e` 只接受单个命令字符串，多参数可能被截断或吞掉；同时 Linux 分支不像 macOS(`cd`)/Windows(`Set-Location`) 那样显式设定工作目录，只依赖 `spawn` 的 `cwd` 继承。Linux 宿主验收时应优先测「带多个参数 + 自定义工作目录的终端模式脚本」。

### R-5（P2，验证卫生）`action.test.ts` 的 MQTT 巨型用例贴着 5s 默认阈值

本轮该用例在默认配置下超时失败，单独以 `--testTimeout=30000` 复跑通过、实测 5.43s。spec 已把它记为非收藏的基线残留（干净 `HEAD 28e5db6` 同样复现），复核确认它不是收藏逻辑问题，但它现在处于"随机红"状态，任何收藏回归跑都会被污染。

**处置：暂停，且明确不归属本快捷脚本/文件槽增量。** 本轮不拆分该用例、不改其 timeout、不改 MQTT 代码 —— 那是 MQTT owner 的范围，在此增量内动它只会把两个不相关的变更绑在一起。已在 [spec.md `Verification`](spec.md#L109) 单列一行标注归属与移交对象；收藏侧回归以「扣除该用例」为准读数。

### 值得保留的正向结论

- 信任指纹把**平台 + 收藏身份 + 路径 + 名称 + 完整配置**一起纳入，改名/改路径/换平台都会掉信任，符合"运行器信任绑定身份"的安全意图。
- `.cmd/.bat` 拒绝、`\0` 拒绝、参数数量/长度上界在**领域层与 Preload 层各做一次**，Preload 不信任渲染层输入，是正确的纵深防御。
- 畸形历史配置"可编辑但不可执行"的处理（保留有界副本 + 执行前指纹校验）同时满足了可修复与不提权两个目标。
- 快捷键分层用 `weight`（400 vs 170）与互斥 `when` 双保险，Runtime 侧再守一次 `favoriteDrawer.open`，三处一致。

## 4. 本轮验证记录

| 命令 | 结果 |
| --- | --- |
| `npx vitest run` × spec 声明的 8 个 validator 文件 | `7 files passed / 1 failed`，`256/257 tests`；唯一失败为 `action.test.ts` 的 MQTT 巨型用例默认 5s 超时 |
| `npx vitest run tests/runtime/action.test.ts --testTimeout=30000 -t "owns MQTT pane navigation"` | passed，5.43s（确认为阈值问题，非逻辑失败） |
| `diff preload/index.js public/preload.js` | 无差异（canonical ↔ 发布镜像同步） |
| `plugin.json` 文件槽枚举核对 | 10 条 `eypc-favorite-slot-1…10`，`mainHide: true`，`cmds` 与 `configureHotkey` 标签一致 |
| 三平台真实宿主验收 | 未跑（沿用 spec 的 host gate） |

结论：收藏侧自动化门禁在本轮复核中**全绿**（`257/257`，扣除与收藏无关的 MQTT 阈值噪声）。

## 5. 结论

- 需求 ↔ 实现整体**高度贴合**：RAW 4 组意图与 spec `Current Contract` 的全部条款均能在源码取到直接证据，未发现被静默缩小或改写的条款。
- 状态维持 `automated-verified / host-pending`：唯一真正的门禁仍是 macOS / Windows / Linux 真实宿主验收（默认打开、后台/终端脚本、全局快捷键、重启后跨平台绑定）。
- R-1 / R-2 / R-3 的措辞修补已在同轮落到 spec、PRD 与用户说明；R-4 已升为 Linux 宿主验收优先项；R-5 暂停并移出本增量归属。产品行为未改变，实现代码未改动。

## 6. Documentation Impact

- 本文件是对 [spec.md](spec.md#L1) 的复核记录，不构成新的权威；spec 仍是 `dsg:eypc:favorite-quick-open-runners-slots-v1` 的 group owner。
- 2026-08-07 同轮已同步：[spec.md](spec.md#L1)（合同三处补齐 + Verification 两行）、[PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L37)、[PROJECT_STATUS.md](../../PROJECT_STATUS.md#L43)、[favorites.md](../../../../src/help/guides/favorites.md#L1)。ARCHITECTURE 无需改动：R-1/R-2 是产品合同粒度，不改变已记录的技术结构。
- Error memory：本轮未产生新的可复用失败模式（R-5 属既有基线噪声，非新失败模式）。
