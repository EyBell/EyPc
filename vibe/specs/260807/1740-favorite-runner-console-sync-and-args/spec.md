# Standard Requirement Spec：收藏运行控制台、逐项同步与动态参数

Tool: claude
Date: 2026-08-07
Status: `requirement-approved / partially-implemented`（D3、D4 的 L1+L2、D5、D6 已落地并通过门禁；仅剩 D2 逐项同步与 D4 的 L3 推测发现未实现）
Documentation level: `standard requirement`

Raw source: [raw-requirement.md](raw-requirement.md#L1)
Predecessor increment: [260806/1120-favorite-quick-open-runners-slots/spec.md](../../260806/1120-favorite-quick-open-runners-slots/spec.md#L1)
Predecessor review: [260806/1120-favorite-quick-open-runners-slots/review.md](../../260806/1120-favorite-quick-open-runners-slots/review.md#L1)
Canonical target: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L37)

> **本文件多数条款为已批准但尚未实现的需求。** 只有标注 `implemented` 的小节才允许被用户说明与架构文档当作已交付行为；其余条款落地并通过门禁后才回填 [favorites.md](../../../../src/help/guides/favorites.md#L1) 与 [ARCHITECTURE.md](../../../knowledge/ARCHITECTURE.md#L1)。

## Task Documentation Sync Group

- Group key: `dsg:eypc:favorite-runner-console-sync-args-v1`
- Group owner: this `spec.md`
- Scope: 本任务目录、收藏 PRD/状态段落；用户说明与架构在实现阶段才纳入。
- Shared-file ownership: 只追加或改写 File Favorites 独立段落；并行 Claude Companion 脏改动不属于本任务。

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:favorite-runner-console-sync-args-v1",
  "group_owner": "vibe/specs/260807/1740-favorite-runner-console-sync-and-args/spec.md",
  "documents": [
    "vibe/specs/260807/1740-favorite-runner-console-sync-and-args/raw-requirement.md",
    "vibe/specs/260807/1740-favorite-runner-console-sync-and-args/spec.md",
    "vibe/specs/260806/1120-favorite-quick-open-runners-slots/spec.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md"
  ],
  "deferred_documents": [
    "vibe/knowledge/ARCHITECTURE.md",
    "src/help/guides/favorites.md"
  ],
  "dependencies": [
    "src/domain/types.ts",
    "src/domain/favoriteLaunch.ts",
    "src/domain/state.ts",
    "src/domain/codexActionRunner.ts",
    "src/runtime/appRuntime.ts",
    "src/platform/eypcPlatform.ts",
    "src/pages/FavoritesPage.vue",
    "src/ActionApp.vue",
    "preload/index.js",
    "public/preload.js"
  ],
  "git_scope_prefixes": [
    "vibe/specs/260807/1740-favorite-runner-console-sync-and-args",
    "vibe/specs/260806/1120-favorite-quick-open-runners-slots",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md"
  ]
}
```

## Requirement Change Review

针对既有权威的冲突扫描结果。被取代的条款在实现落地前仍然有效。

| 类型 | 条款 | owner | 处置 |
| --- | --- | --- | --- |
| unchanged | 文本层级 → 查询亲和 → 30 天半衰期 → 手工顺序的搜索排序与使用学习 | [1120 spec `Search and keyboard`](../../260806/1120-favorite-quick-open-runners-slots/spec.md#L90) | 用户明确确认无问题，本增量不改，复核阶段的相关质疑就此关闭 |
| unchanged | 每系统 10 槽、按当前平台自动加载、同平台互斥 | [1120 spec `Slots and routing`](../../260806/1120-favorite-quick-open-runners-slots/spec.md#L84) | 现状已满足「每个系统只加载 10 个」，无需改动 |
| added | 逐项同步开关 `syncScope` 与双通道存储分档 | 本文件 `D2` | 新增能力 |
| added | 运行记录、run log 重定向与自适应日志定位 | 本文件 `D4` | 新增能力。2026-08-07 用户裁决否掉了原「封装展示终端」方案，改为不建 UI 终端、只出记录并把日志交给系统打开 |
| added | 声明式动态参数 | 本文件 `D6` | 新增能力 |
| changed | 信任指纹的字段集合 | [1120 spec `Launch and trust`](../../260806/1120-favorite-quick-open-runners-slots/spec.md#L74) | 名称改为条件纳入，需带平滑迁移 |
| superseded | 「后台启动使用独立进程、`shell:false`、**忽略输出**」中的忽略输出部分 | [1120 spec `Launch and trust`](../../260806/1120-favorite-quick-open-runners-slots/spec.md#L80) | 改为管道采集；`shell:false`、detached 与 `windowsHide` 保持不变 |
| superseded | 系统终端为唯一的可见执行形态 | [1120 spec `Launch and trust`](../../260806/1120-favorite-quick-open-runners-slots/spec.md#L80) | 降级为需要真 TTY 时的逃生舱；主路径改为「后台运行 + 运行记录 + 日志定位」 |
| conflicting | 「运行器信任绑定平台、收藏身份/路径/名称和完整配置」 vs 「收藏可同步到其它机器」 | 1120 spec 与本文件 `D2` | **以本文件为准**：信任状态不参与同步，见 `D2-4` 的裁决理由 |

## Host Facts（已核验，决定设计边界）

- uTools 插件数据库的同步是**账号级、整库**行为，由用户在 uTools 侧开关；官方文档未提供文档级 local-only 前缀或按键排除同步的能力。单文档上限 1MB，多设备同改同一文档时由数据库整体择一版本为最终版本。来源见 [uTools 本地数据库文档](https://www.u-tools.cn/docs/developer/api-reference/db/local-db.html)、[dbStorage 文档](https://www.u-tools.cn/docs/developer/api-reference/db/db-storage.html)。
- 因此「逐项选择是否同步」**必须由插件自己分档实现**，不能指望宿主提供粒度。
- 仓库已有本机专用通道先例：MQTT 凭据走 `globalThis.localStorage` 的 `eypc/mqtt/secrets-local/v1`（[preload/index.js:14](../../../../preload/index.js#L14)、[preload/index.js:937](../../../../preload/index.js#L937)），从不进入 `utools.dbStorage`。应用状态本体则单键落在 `eypc/state/v1`（[preload/index.js:11](../../../../preload/index.js#L11)、[preload/index.js:443](../../../../preload/index.js#L443)）。
- 仓库已有成熟的「进程输出 → 受控展示端」实现：Action Runner 的运行记录与日志流模型 [codexActionRunner.ts:66-100](../../../../src/domain/codexActionRunner.ts#L66)、Preload 侧 `appendCodexActionRunLog` / `finalizeCodexActionRunLogs`（[preload/index.js:7711](../../../../preload/index.js#L7711)）与独立子窗口 [ActionApp.vue](../../../../src/ActionApp.vue#L1)。本增量复用该模型，不新造一套。
- uTools preload 环境**没有伪终端（PTY）**。管道可以拿到 stdout/stderr 与退出码，但拿不到 TTY 语义。

## Current Contract（本增量目标态）

### D1 搜索与使用学习：不变

维持 1120 已交付合同，包含 `Ctrl+1…0` 绑定的是结果位置这一事实。不新增开关、不改排序权重。

### D2 逐项同步

- 每个收藏（含分组）带一个同步标记：`synced`（默认）或 `local`。分组标记为 `local` 时，其下所有后代一并本机化，避免出现「父级不同步、子级同步」的悬空引用。
- 存储分双档：
  - **同步档** —— 继续走 `utools.dbStorage`，是否真正上云完全由用户的 uTools 账号同步开关决定，插件不声称、不控制、不显示云端状态。
  - **本机档** —— 走不进 uTools 数据库的本机通道（沿用 MQTT 凭据同款 `localStorage` 键规范），任何情况下不参与同步。
- 槽位表整体属于同步档：它按平台分键，机器之间互不覆盖。但槽位若指向一个 `local` 收藏，在其它机器上视为未分配，按现有「未分配」失败路径进入修复管理器，不报错为数据损坏。
- 读取端合并两档时以收藏 ID 为准去重；同一 ID 同时出现在两档（历史迁移或手工改档产生）时，以本机档为准并把同步档副本清掉，避免双写漂移。
- **D2-4 信任不同步（安全裁决）**：`trustedAt` / `trustedFingerprint` 永远落在本机档，即使收藏本身是 `synced`。理由：信任是用户在**具体机器**上对**具体可执行路径**做的人工确认；同步过去后，另一台机器上同一路径可能不存在、也可能指向完全不同的程序，而现有指纹只覆盖配置内容、不含机器身份，会让未经确认的机器直接获得执行信任。同步只搬运行器配置，落地机器首次执行前必须重新确认。
- 本增量**不解决**多机并发编辑的合并：同步档仍是整文档 last-writer-wins。只保证「本机档永不上云」。该限制必须在设置页明写。

### D3 重命名不掉信任 —— `implemented 2026-08-07`

- 指纹字段改为：平台、收藏 ID、`kind`、`path`、运行器完整配置；`name` **仅当**参数数组或自定义工作目录中实际出现 `{name}` 时纳入。判定见 [favoriteRunnerUsesName](../../../../src/domain/favoriteLaunch.ts#L41)。
- 迁移：加载既有配置时，若其 `trustedFingerprint` 与旧算法（无条件含 `name`）一致，则原地重算为新算法指纹并保留原 `trustedAt`（[upgradeFavoriteRunnerTrust](../../../../src/domain/favoriteLaunch.ts#L110)，在 [state.ts 的 normalizeFavorite](../../../../src/domain/state.ts#L241) 中调用）。指纹既不匹配新算法也不匹配旧算法时原样保留、不执行 —— 迁移只升级仍然有效的信任，绝不凭空造出信任。
- 未经归一化的记录仍按旧算法（更严格）判定为可信，作为兜底，不构成放宽。
- 其余漂移语义不变：改路径、改类型、改平台、改运行器任一字段仍然掉信任。
- 落地证据：[favoriteLaunch.test.ts](../../../../tests/domain/favoriteLaunch.test.ts#L62) 四例（含 `{name}` 时改名仍掉信任、不含时改名保信任、旧指纹原地升级、失配指纹不升级），[action.test.ts](../../../../tests/runtime/action.test.ts#L4030) 的 Runtime 端到端改名后仍可运行 + 存储信任漂移后阻断并进修复管理器。

### D4 运行记录与自适应日志定位（不做控制台窗口）—— `L1 / L2 implemented 2026-08-07；L3 未实现`

**2026-08-07 用户裁决：不要封装展示终端。** 收藏页保持启动器形态，不长出终端 UI。取而代之的是「一条运行记录 + 把相关日志找出来交给系统打开」。

- 每次运行产生一条**本机运行记录**：解析后的实际命令行（与传给进程的 argv 逐字一致、可复制）、工作目录、开始时间、耗时、`running / exited / failed / stopped` 状态、退出码。展示位置复用既有收藏详情抽屉与行内状态，不新开窗口、不新建子页面。
- 日志来源分三层，**按确定性从高到低**，UI 必须区分「确定」与「推测」：
  - **L1 自采集 run log（确定可得）**：后台模式把 `stdout`/`stderr` 重定向到插件数据目录下的按次日志文件，而不是驻留内存渲染。记录上提供「打开 / 定位 / 复制路径」，直接复用既有 [files.open / reveal / copyPath](../../../../src/platform/eypcPlatform.ts#L297) 能力，由系统默认程序查看。
  - **L2 声明式日志路径（确定可得）**：运行器可声明日志文件或通配路径，支持 `{path}` / `{dir}` / `{name}` 占位符。执行结束后直接指向解析后的路径；不存在就如实说不存在。
  - **L3 自适应发现（尽力而为，必须标注为推测）**：以工作目录、脚本所在目录以及用户声明的附加目录为根，在运行前后各做一次**有界**扫描，取修改时间落在本次运行窗口内的文件，按 `*.log` / `*.out` / `logs|log|output` 目录等启发式排序，列为候选。UI 明确写「推测，可能不完整」，不得与 L1/L2 混为同一置信度。
- 明确**不做**：macOS `log show` / Windows 事件日志等系统级日志检索；`fs_usage` / ETW / `strace` 之类需要权限的进程写入追踪；常驻文件监视。这些要么需要提权、要么噪声远大于信号。
- 后台模式的重定向保留 `shell:false`、`detached`、`windowsHide` 与全部既有校验。重定向失败只降级为「无日志但有退出码」，绝不降级为静默成功。
- 所有上界都必须有：单个 run log 文件大小上限、保留最近 N 个日志文件与 N 条记录、L3 扫描的深度/条目数/耗时上限。**实现修正**：子进程直接写文件描述符（这样插件重启不会掐断它的 stdout），因此单文件上限只能在运行结束时施加 —— 超限时保留末尾并写入截断标记，运行期间可短暂超出。
- 运行记录与 run log **全部属本机档**，不进同步、不落收藏元数据。

**L1 / L2 落地实现（2026-08-07）**

- Preload：[spawnFavoriteBackgroundRun](../../../../preload/index.js#L1464) 以 `['ignore', fd, fd]` 重定向到 `<userData>/favorite-runs/run-*.log`，保留 `shell:false`、`detached`、`windowsHide`；`spawn` 成功即返回 `started + runId + logPath`，退出码在 `exit` 事件里回填。日志目录打不开时降级为 `stdio:'ignore'` 且不返回 `logPath`，**只丢日志、不丢这次运行**。
- 上界：单文件 2MB（结束时保留末尾 + 截断标记）、日志文件保留 40 个、内存运行记录 60 条。
- L2：运行器新增选填 `logPath`，领域层做占位符展开与绝对路径校验（[resolveFavoriteRunner](../../../../src/domain/favoriteLaunch.ts#L259)）；相对或畸形值被丢弃而不是猜测，且**从不创建、从不执行**这个文件。为不让存量配置掉信任，`logPath` 只在有值时进入指纹载荷。
- 桥接：`files.listRuns` / `files.watchRuns` 提供最新在前的运行历史与变更通知；[normalizeFavoriteRunRecords](../../../../src/platform/eypcPlatform.ts#L490) 丢弃畸形行而不是渲染半条记录。
- Runtime：订阅运行变更并投影为 `favoriteRunSummaries`（每个收藏最新一条、措辞已定），新增 `favorites.run.openLog / revealLog / copyLogPath / openDeclaredLog / copyCommand` 五个动作，动作抽屉按日志是否存在动态出现。复制命令行按 argv 逐元素加引号，保证它是记录而不是可被重新分词的 shell 行。
- 三平台系统终端适配器保留，作为需要真 TTY（交互式提示、全屏 ANSI 程序）时的逃生舱；其退出码不可得，见 `D5`。[review R-4](../../260806/1120-favorite-quick-open-runners-slots/review.md#L102) 的 Linux 终端参数风险相应降为次要路径。

### D5 退出码的统一体现 —— `implemented 2026-08-07`

- 后台模式必须给出退出码。非 0 退出在收藏行与运行记录上都可见，不得复用「已启动」的成功文案。
- 系统终端模式因进程归属终端应用，明确标注「退出码不可得」，而不是伪造一个。
- 搜索学习的计数口径不变（宿主受理即计数），但运行记录里必须能看出「已启动」与「成功退出」不是一回事。
- 落地：`favoriteRunSummary` 对 `运行中 / 已成功退出（退出码 0） / 以非 0 退出码 N 结束 / 已被信号 X 终止 / 启动或执行失败 / 已结束，退出码不可得` 分别措辞；完整页与快速页行内以 `.favorite-run-state`（失败为红）呈现。**已知边界**：退出码只在插件进程存活期间可观测，插件退出后重启不会补回历史退出码 —— 这是换取「子进程不被插件重启掐断」的代价。

### D6 动态参数 —— `implemented 2026-08-08`

- 运行器参数项可声明为动态位，携带名称、可选默认值、是否必填。执行前弹出受控输入收集全部动态位；取消即取消执行。
- 硬约束：
  - 用户输入**整体作为一个 argv 元素**，不分词、不做 shell 解析。
  - 用户输入**不参与占位符展开**，输入里的 `{path}` 等字面量原样传递，杜绝二次展开注入。
  - 长度与数量沿用既有上界（单参数 4096、参数数 64）。
- 信任指纹覆盖参数**声明**（动态位的名称、位置、是否必填），不覆盖每次填写的值：改声明要重新确认，换填写内容不需要。
- 上次填写值可选记住，落本机档，不同步。
- 文件槽与快速页数字键触发含必填动态位的运行器时，必须弹输入而不是静默失败；此时「不显示主窗口」的静默承诺让位于可见输入框，需在合同与用户说明中写明。

**落地实现（2026-08-08）**

- 语法：参数模板里写 `{ask:名称}`（必填）或 `{ask:名称=默认值}`（选填）。名称去重，同名只问一次、同值代入所有出现处；上限 8 个动态位。
- **只允许出现在参数里**。可执行程序与工作目录保持静态 —— 一次输入不能改写「跑什么」和「在哪跑」，这是刻意收紧的边界（[favoriteRunnerParameters](../../../../src/domain/favoriteLaunch.ts#L263)）。
- 不二次展开的实现方式：先按模板切分出 `{ask:…}` 之间的字面段，**各段单独做 `{path}/{dir}/{name}` 展开，再把用户原值拼进去**（[applyFavoriteRunnerArgument](../../../../src/domain/favoriteLaunch.ts#L283)）。因此两个方向都堵死：输入里的 `{path}` 保持字面量，收藏路径里出现的 `{ask:…}` 也不会变成新的输入位。
- 必填缺值时 `resolveFavoriteRunner` 返回 `null` 而不是拼半截命令行；`\0` 与超长值同样拒绝。
- 信任：动态位声明本身就在参数模板里，已被指纹覆盖 —— 改声明要重新确认，换填写内容不需要，无需额外机制。
- Runtime：`favoriteRunPrompt` 层收集取值并实时给出解析预览；取消即不运行、不计入学习。上次取值记在进程内存（不落盘、不同步）。文件槽路径会先切到收藏页并 `show()` 再弹框。
- UI：全局挂载的 [FavoriteRunPromptLayer.vue](../../../../src/components/FavoriteRunPromptLayer.vue#L1)，完整页与快速页共用同一实现；`Ctrl+Enter` 运行、`Escape` 取消。
- 落地证据：[favoriteLaunch.test.ts](../../../../tests/domain/favoriteLaunch.test.ts#L123) 四例（声明只来自参数、取值不二次展开且 `{path} && rm -rf /` 保持字面量、收藏数据不产生新输入位、信任绑定声明不绑定取值），[action.test.ts](../../../../tests/runtime/action.test.ts#L4148) 端到端（缺必填不运行、预览逐字、提交后 argv 正确、记住上次取值、取消不运行、槽位触发弹框并 `show()`）。

## Phase Boundary

- 固定角独立窗口仍属第二阶段，本增量不实现。
- 不监测、不移动、不固定 uTools 主搜索窗。
- 多机并发编辑的字段级合并不在本增量。
- 真 PTY / 完整终端仿真不在本增量，且在没有可用原生模块前不承诺。
- 插件内终端或控制台 UI 已被明确否决，不作为后续待办保留。
- 系统级日志检索与进程写入追踪不在本增量，也不列为后续预期。

## Verification Plan

除 D3 外，其余门禁 `not run` —— 对应能力尚未实现。

**D3 + D4(L1/L2) + D5 + D6 已跑（2026-08-07/08）**：`tests/domain tests/ui tests/integration tests/platform tests/unit` 共 `66 files / 822 tests` 全绿；`tests/runtime/action.test.ts` `168/168`（`--testTimeout=30000`，规避与收藏无关的 MQTT 巨型用例阈值）；`pnpm run build` 通过全链（typecheck 0 error、production build、runtime prepare、uTools validation）；`node --check preload/index.js` 与 canonical↔public 镜像一致。宿主验收未跑。

| Check | Planned gate |
| --- | --- |
| 领域纯函数 | ~~指纹条件纳入 `name` 的新旧算法与一次性迁移~~（D3 已覆盖）；~~动态参数声明解析与值不展开~~（D6 已覆盖）；`syncScope` 归一化与分组级联 |
| 状态迁移 | 老状态升级后收藏默认 `synced`、信任落本机档且不丢失；双档同 ID 冲突按本机档收敛 |
| Runtime | ~~退出码传播、非 0 退出文案、动态位取消即取消执行、槽位触发必填输入~~（D5/D6 已覆盖） |
| Preload | ~~run log 重定向与大小/条数上限；重定向失败只降级为无日志~~（已跑：`favoriteFileBridge.test.ts` 3 例覆盖 fd 重定向 + 退出码回填 + 声明日志存在性、日志目录不可写时降级、相对声明路径被丢弃）；L3 扫描的深度/条目/耗时上界与越界即停；本机档从不写入 `utools.dbStorage` |
| UI | ~~运行记录在行内呈现；命令行与实际 argv 逐字一致~~（已跑：`action.test.ts` 覆盖三种措辞与五个日志动作）；L1/L2「确定」与 L3「推测」置信度可区分 |
| 构建 | `pnpm run build`（typecheck、production build、runtime prepare、uTools validation） |
| 宿主验收 | macOS / Windows / Linux 的后台退出码、run log 落盘与打开、L3 候选命中率；系统终端逃生舱；**两台机器**的同步与本机档隔离验证 |
| 回归 | 260806/1120 既有 8 个 validator 文件不得回归；MQTT 巨型用例阈值噪声仍不归属收藏侧 |

## Open Decision（可回退，非阻塞）

- 新收藏的同步默认值取 `synced`：与现状（全部数据已在 dbStorage）一致，避免升级后老用户在另一台机器上「收藏消失」。若更希望「默认本机、显式选择同步」，这是一处单点改动，说明即可翻转。

## Review and Documentation Impact

- P0: 无。
- P1: `D2-4`（信任不同步）与 `D6` 的输入不展开是安全性硬约束，实现阶段不得为省事绕过。
- P2: 「L3 是推测」这一置信度差异必须进用户说明，否则用户会把没找到的日志当成缺陷。系统终端不可得退出码同理。
- Documentation impact: `requirement-canonical`。本轮已同步 PRD 与 PROJECT_STATUS 的 File Favorites 段落，并在 1120 spec 标注被取代条款。
- **刻意未同步**：[favorites.md](../../../../src/help/guides/favorites.md#L1) 与 [ARCHITECTURE.md](../../../knowledge/ARCHITECTURE.md#L1) 保持描述当前已交付行为。按 [documentation.md](../../../rules/documentation.md#L30) 的写作约束，用户说明不得承载未验收承诺；架构文档记录的是已实现事实。两者在实现落地后同轮回填。
- Error memory: 本轮无新的可复用失败模式。
- Rules / DB memory: 无变化。
