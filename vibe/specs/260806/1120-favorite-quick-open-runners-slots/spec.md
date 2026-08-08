# Standard Requirement Spec：收藏快速打开、10 文件槽与自定义运行器

Tool: codex
Date: 2026-08-06
Status: `automated-verified / host-pending`
Documentation level: `standard requirement`

Raw source: [raw-requirement.md](raw-requirement.md#L1)
Canonical target: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L1)
Review: [review.md](review.md#L1)
Successor increment: [260807/1740-favorite-runner-console-sync-and-args/spec.md](../../260807/1740-favorite-runner-console-sync-and-args/spec.md#L1)（已批准未实现；其 `Requirement Change Review` 列出本合同被取代与被修改的条款。在那些条款落地前，本文件仍是生效合同。）

## Task Documentation Sync Group

- Group key: `dsg:eypc:favorite-quick-open-runners-slots-v1`
- Group owner: this `spec.md`
- Scope: 本任务目录、收藏 PRD/状态/架构和用户说明。
- Shared-file ownership: 只追加或改写 File Favorites 独立段落；其它并行脏改动不属于本任务。
- Sidecar: 主线程；本任务未启用只读 Sidecar。

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:favorite-quick-open-runners-slots-v1",
  "group_owner": "vibe/specs/260806/1120-favorite-quick-open-runners-slots/spec.md",
  "documents": [
    "vibe/specs/260806/1120-favorite-quick-open-runners-slots/raw-requirement.md",
    "vibe/specs/260806/1120-favorite-quick-open-runners-slots/spec.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "src/help/guides/favorites.md"
  ],
  "dependencies": [
    "src/domain/types.ts",
    "src/domain/favoriteLaunch.ts",
    "src/domain/favorites.ts",
    "src/domain/state.ts",
    "src/platform/eypcPlatform.ts",
    "src/runtime/appRuntime.ts",
    "src/runtime/keybinding/keybindingRuntime.ts",
    "src/runtime/feature/featureRouting.ts",
    "src/pages/FavoritesPage.vue",
    "src/pages/QuickFavoritesPage.vue",
    "src/styles/app.css",
    "src/App.vue",
    "preload/index.js",
    "public/preload.js",
    "public/plugin.json"
  ],
  "validators": [
    "tests/domain/favoriteLaunch.test.ts",
    "tests/platform/favoriteFileBridge.test.ts",
    "tests/runtime/action.test.ts",
    "tests/runtime/keybinding.test.ts",
    "tests/integration/featureRouting.test.ts",
    "tests/integration/appPluginEnter.test.ts",
    "tests/ui/favoritesBehavior.test.ts",
    "tests/ui/favoritesInitialization.test.ts",
    "scripts/validate-utools-runtime.mjs"
  ],
  "git_scope_prefixes": [
    "vibe/specs/260806/1120-favorite-quick-open-runners-slots",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "src/help/guides/favorites.md"
  ]
}
```

## Current Contract

### Launch and trust

- 文件/文件夹没有当前平台运行器时继续默认打开；存在配置时，双击、`Enter`、数字键和文件槽统一进入同一执行函数。
- 每个平台独立保存 `background | terminal`、可执行程序、参数数组、目标目录/自定义目录和信任信息。可执行程序只能是绝对路径或 `PATH` 名称，工作目录必须是当前平台绝对路径。
- 信任指纹覆盖平台、收藏 ID/类型/路径/名称及完整运行器配置。畸形旧配置保留用于修复，但解析失败或指纹不匹配时禁止执行。（`changed by successor D3`：名称将改为「仅当实际引用 `{name}` 时纳入」，并带一次性平滑迁移。）
- 运行器编辑器只读写**当前宿主平台**那一份配置，不能在一台机器上预配其它平台，也不会覆盖或清除其它平台已保存的条目。三平台配置意味着在各自系统上分别配置一次。（`constrained by successor D2-4`：收藏可选择同步到其它机器，但「已信任」状态永不同步；落地机器首次执行前必须重新确认。）
- 参数只做占位符替换，不解析命令行。后台启动使用独立进程、`shell:false`、忽略输出和隐藏控制台；Windows `.cmd/.bat` 禁止作为直接可执行程序，脚本建议改用显式 `cmd.exe` 参数。终端模式使用三平台受控适配器，PowerShell 不加 `Bypass`，终端缺失不回退。（`superseded by successor D4/D5`：「忽略输出」改为管道采集并汇入运行控制台，退出码必须可见；系统终端从主路径降为需要真 TTY 时的逃生舱。`shell:false`、detached、`windowsHide`、`.cmd/.bat` 拒绝与不回退语义均保持不变。`added by successor D6`：参数将支持声明式动态位，输入值作为单个 argv 元素且不参与占位符展开。）

### Slots and routing

- 状态固定包含 10 个 `FavoriteSlot`，每槽分别保存 macOS、Windows、Linux 收藏 ID；删除收藏会同步清除全部平台引用。
- 同一收藏在同一平台最多占用一个槽：分配到新槽会先释放它在该平台的旧槽，其它平台的绑定不受影响。分配与清除同样只作用于当前宿主平台。
- [plugin.json](../../../../public/plugin.json#L1) 注册 `eypc-favorite-slot-1` 至 `eypc-favorite-slot-10`，名称固定为“EyPc 文件槽 1–10”，全部 `mainHide: true`。
- 完整收藏页使用一个“分配到文件槽…”动作进入紧凑管理器，支持分配、替换、清除、测试和跳转 uTools 快捷键设置。未收藏的实际目录行不能直接绑定。
- 槽位失败会显示完整收藏页和管理器修复原因；成功只执行目标，不主动显示 uTools 主窗口。终端模式仍会显示系统终端。

### Search and keyboard

- 快速页只保留跨全部虚拟分组的搜索入口，进入时自动聚焦搜索并高亮第一条；结果显示类型、路径和分组面包屑。
- 文本精确、前缀、包含层级始终优先；同层级依次比较当前查询亲和、30 天半衰期全局使用分、最近/次数和手工顺序。空查询直接按全局近期/常用排序。
- 学习记录最多 50 个 LRU 查询、每查询 10 个收藏。只有**被宿主接受**的默认打开或运行器启动才计数 —— 即确认启动（`started`）或宿主已受理的派发（`dispatched`）；定位、复制与被拒绝/失败的启动不计入。宿主对 `dispatched` 不回执最终结果，因此计数以受理为准而非以落地为准。
- 抽屉关闭时 `Ctrl+1…Ctrl+9`、`Ctrl+0` 执行快速结果第 1–10 项；抽屉打开后同一快捷键由更高层级解释为抽屉动作。快速页不能改配置，完整页可重置单项或全部学习。

## Implementation Map

- 数据模型、迁移与纯规则：[types.ts](../../../../src/domain/types.ts#L1)、[favoriteLaunch.ts](../../../../src/domain/favoriteLaunch.ts#L1)、[favorites.ts](../../../../src/domain/favorites.ts#L1)、[state.ts](../../../../src/domain/state.ts#L1)。
- 统一副作用与键盘层级：[appRuntime.ts](../../../../src/runtime/appRuntime.ts#L1)、[keybindingRuntime.ts](../../../../src/runtime/keybinding/keybindingRuntime.ts#L1)、[featureRouting.ts](../../../../src/runtime/feature/featureRouting.ts#L1)。
- 管理/快速界面：[FavoritesPage.vue](../../../../src/pages/FavoritesPage.vue#L1)、[QuickFavoritesPage.vue](../../../../src/pages/QuickFavoritesPage.vue#L1)、[app.css](../../../../src/styles/app.css#L1)。
- 平台边界：[eypcPlatform.ts](../../../../src/platform/eypcPlatform.ts#L1) → [preload/index.js](../../../../preload/index.js#L1)，并同步发布镜像 [public/preload.js](../../../../public/preload.js#L1)。

## Phase Boundary

- 第二阶段可实现独立固定角窗口：主屏/鼠标屏/指定显示器、四角、边距、置顶、失焦隐藏与一个 `mainHide` 呼出入口。
- 不使用私有 API 监测、移动或固定 uTools 主搜索窗。文件匹配/超级面板的“选中文件后收藏或分配槽”也留待后续。

## Verification

| Check | Result | Remaining gate |
| --- | --- | --- |
| 收藏聚焦测试 | `7 files / 91 tests` passed | none |
| 新增 Runtime 路径 | 数字执行、信任漂移、平台槽位、删除清理、失败不学习均 passed | none |
| Preload mirror | canonical → public 同步；后台 `shell:false`、终端适配、权限/路径错误映射 passed | Windows/Linux real host |
| Type/build/package | `pnpm run build` passed，包含 typecheck、production build、runtime prepare、uTools validation | real uTools reload |
| 全量非 watch 测试 | 当前并行工作树 `1124/1127` passed；两项 Claude hook 监听失败，另一个 MQTT Runtime 用例在干净 `HEAD 28e5db6` 同样超过默认 5 秒 | 三项均非收藏回归，由对应 owner 修复/核验 |
| 2026-08-07 复核复跑 | 8 个 validator 文件 `256/257`；唯一失败的 MQTT 巨型用例以 `--testTimeout=30000` 单跑 passed（实测 5.43s，阈值问题非逻辑失败）。收藏侧等效全绿 | none |
| MQTT 巨型用例阈值 | **不归属本增量**：`tests/runtime/action.test.ts` 的 `owns MQTT pane navigation…` 用例贴着 5s 默认阈值，随机变红并污染收藏回归跑。已暂停在本增量内处理 | 由 MQTT owner 拆分或单独放宽 timeout |
| Host acceptance | not run | macOS、Windows、Linux 的文件/文件夹、后台/终端脚本、全局快捷键、重启与跨平台槽绑定 |
| Linux 终端适配器 | not run | `x-terminal-emulator`/`konsole` 的 `-e`、`xfce4-terminal` 的 `-x` 在部分发行版只接受单条命令字符串；验收需测「多参数 + 自定义工作目录」的终端模式脚本，确认参数未被截断且 cwd 正确（该分支不显式 `cd`，只继承 `spawn` 的 `cwd`）。2026-08-07 后继增量把系统终端降为逃生舱、控制台成为主路径，因此该项由「优先项」降为常规项 |

## Review and Documentation Impact

- P0: 无。
- P1: 真实三平台宿主验收未完成，因此状态不得升级为 fully accepted；当前并行工作树全量测试仍有两项 Claude hook 监听失败和一项基线 MQTT 超时。
- P2: 固定角独立窗口与文件匹配入口保留为后续产品增量，不阻塞本期。
- 2026-08-07 独立复核：[review.md](review.md#L1)。RAW 与本合同全部条款均取到源码证据，无 P0/P1 缺陷。复核发现的三处口径差已在本轮回填本合同与 PRD、用户说明：同平台槽位互斥（R-1）、运行器/槽位只在当前平台配置（R-2）、学习计数以宿主受理为准（R-3）；Linux 终端适配器风险（R-4）升为宿主验收优先项；MQTT 巨型用例阈值（R-5）明确不归属本增量，暂停处理并交 MQTT owner。
- Documentation impact: `requirement-canonical`；PRD、项目状态、架构、收藏用户说明与 CodeNote AI Requirement Understanding 已同步。
- Error memory: 无新的收藏功能可复用失败模式；没有写入本任务 error memory。
- Rules / developer soul / DB memory: 无规则、稳定审美偏好或数据库变化，不更新。
