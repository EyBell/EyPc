---
id: eypc-req-invariants-raw-169
qualified_source: SPEC-260810-1155-INSTALL-RUNTIME-DIAGNOSTICS::RAW-169
status: proposed
domain: engineering-invariants
authority: agent-transcribed
---

# RAW-169 · engineering-invariants

> 正文由来源草案保存：[RAW-167 draft](../260810/1155-install-runtime-diagnostics/raw-requirement-next.draft.md#L1)。该草案标注 `pending-user-confirmation`，用户从未确认其转述忠实于原话，因此全部条款状态为 `proposed`。

Codex 侧按 preload/claude/ 既有标准拆分，以职责边界而非行数为准，每模块保持与 Claude 侧同量级规模。拆分与行为修改不得在同一提交内混合。

## 交付状态

未交付。用户已明确批准纳入范围，但 preload/index.js 仍为 15,046 行且 preload/codex/ 不存在。

## 2026-08-13 实测：原设计不可执行

方案里「11 个模块、每个 200–850 行、按 `preload/claude/` 既有标准拆分」的形状不存在。实测数据推翻了它。

**根本差异不是文件大小，是状态组织范式。** `preload/claude/` 的模块级 `let` 数量是 **0**——状态全部活在 `createXxx(dependencies)` 闭包里。`preload/index.js` 有 96 个模块级 `let/var` 加 33 个 Map/Set 容器，其中 **97 个是 codex 的**。

这 97 个状态里 60 个单域、**30 个跨域（33%）**，跨得最广的五个各横跨 5 个域，且正是核心缓存：`codexThreadActions`、`codexActivityInventory`、`codexDesktopBridge`、`codexThreadTurnStatusCache`、`codexThreadGoalCache`。

按域实测（函数数 / 行数 / 跨域状态依赖）：

| 域 | 函数 | 行数 | 跨域依赖 |
| --- | ---: | ---: | ---: |
| desktop | 34 | 833 | 6 |
| rollout | 19 | 722 | 4 |
| threads | 24 | 634 | 15 |
| actions | 24 | 441 | 1 |
| activity | 9 | 208 | 13 |
| inventory | 8 | 141 | 8 |
| float | 9 | 90 | 0 |
| environment | 6 | 45 | 0 |
| native | 5 | 41 | 0 |
| archive | 2 | 10 | 0 |

**规模可观的域全都耦合，零耦合的域全都很小。** 四个零依赖域合计仅 186 行，抽出去只能让入口从 15,046 降到 14,860——1.2%，纯粹是数字游戏。

方案原先引用的函数分布（Desktop 23、Action 22、Thread 8…）来自粗略的前缀计数，不是函数跨度分析，与实测（desktop 34、actions 24、threads 24）不符。

## 可执行的三条路线

1. **`actions` 域试点**：~~24 函数 / 441 行~~ → **实测 60 函数 / 1680 行 / 占入口 11.2%**。原数字由前缀口径得出，系统性漏掉了以动词开头的同域函数（`installCodexActionRunnerIpc` 343 行、`runCodexProjectEnvironmentAction` 253 行、`createCodexActionRunner` 57 行等 36 个）。修正后该域是**真正可观的一块**，但也包含 IPC 装配——落在 `EYPC-UTOOLS-HOST-001` 入口冻结管辖范围。测量方法缺陷见 [prefix-based-domain-analysis-undercounts](../../knowledge/error-memory/prefix-based-domain-analysis-undercounts.md#L1)。
2. **共享状态模块**：60 个单域状态随其域外迁，30 个跨域状态落在 `codex/state.cjs` 由各域共享。能达成体量目标，但耦合是被搬走而不是被消除。
3. **闭包化改写**：按 `preload/claude/` 的 `createXxx(dependencies)` 范式重写，让状态进入闭包。这是唯一真正消除耦合的路线，也是本条款原意，但它是插件入口的重写而非拆分——`preload/index.js` 刻意从不做无保护的本地 require，一次抛出会带走整个 bridge。

未选定路线前不动代码。选择 2 或 3 会改变本条款的验收口径，需用户明确。

## 2026-08-13 首块交付：node 运行时发现

`preload/codex/node-runtime.cjs`（254 行）承接 11 个函数与 1 个独占缓存。入口从 15,046 降到 **14,918**。

边界由三项实测确定，不靠猜：这些函数**零外部函数依赖**；它们共享的 `codexNodeRuntimeDiscoveryCache` 在入口的其它任何地方都没有引用；其余绑定全是 Node 内置。函数体做过**逐字比对，201 行零差异**。

按 `preload/claude/` 的 `createXxx(dependencies)` 范式，经与其它模块组相同的受保护 require 加载——入口从不做无保护的本地 require，加载失败降级为空结果而非抛出。

### 逐字迁移抓不到的一类问题

比对证明代码逐字相同，测试仍然失败：模块里的 `process` 引用的是**真实全局 process**，而原位置在 vm 沙箱里指向 `processMock`。**代码没变，运行环境变了。** `platform` / `arch` / `env` / `execPath` 共 18 处分支因此改变行为。修法是把 `process` 也作为显式依赖注入——这正是该范式存在的理由。

同时两处测试随代码调整：vm 沙箱的 `require` 假体需要学会按 `preload/` 解析相对路径（让假体更贴近真实模块系统）；一条钉住「启动计划只接受绝对路径」的安全源文本断言改为同时读取新模块（断言强度不变，跟着代码走）。

### 剩余

`actions` 域全量为 60 函数 / 1,680 行。本次交付其中的 11 个纯函数；余下 49 个涉及运行数据库、日志流、窗口生命周期与 343 行 IPC 装配，它们共享 `codexActionRunnerPreference` 等可变绑定，需按同一范式逐块注入后迁出。

## 2026-08-13 第二块：命令校验

`preload/codex/command-validation.cjs`（84 行）承接 Environment Action 的命令分词与允许清单。入口 14,918 → **14,896**。

这一块**零依赖**：无模块级绑定、无全局引用、无外部函数调用、连续 58 行。函数体逐字比对零差异。

单独成模块的价值不在体量而在边界：它是用户输入的配置字符串与宿主 spawn 之间的安全闸门，独立后可以直接施加输入，无需搭起整个 preload 沙箱。已验：`pnpm run build` / `vite serve` / `git push` 通过；`rm -rf /`、命令串联、未闭合引号、内嵌换行全部拒绝。加载失败时降级为 `null`，调用方读作「不得启动」。

## 2026-08-13 第五块：日志流（首次访问器注入）

`preload/codex/log-stream.cjs` 承接缓冲、解码与三条安全上限：批量刷写的时间/字节窗、保留 2MB 尾部、单行 64KB 上限后丢弃余下部分。入口 14,915 → **14,882**。

**这一块不是逐字迁移。** 前四块的共享绑定都是只读的内置模块，这一块碰到了第一个会被重新赋值的 `let`（`codexActionRunnerWindow`）。与其注入窗口，选择注入**效果**：`redact` / `persistRun` / `deliverLogDeltas`。模块因此完全不碰宿主——不见窗口、不见 IPC 通道名、不见数据库，只决定「投递什么」，由入口决定「怎么投递」。`deliverLogDeltas` 接整批而非单条，使存活检查留在循环之外，与原实现位置一致。

diff 核对确认只有 7 处预期改动：两个字面量提为具名常量（值不变）、三处依赖改为注入、两处刷写阈值改为参数（默认值不变）。

`preload/codex/` 现有五个模块。同轮把 runner bridge 的源文本断言改为读取整个 `preload/codex/` 目录——它已经因抽取移位两次，逐个补名字是在缺陷发生后才修补。

## 2026-08-14 第六块：运行数据库（首次迁移状态）

`preload/codex/run-database.cjs`（203 行）承接 SQLite schema、列迁移、留存策略与运行内存镜像。入口 14,882 → **14,802**。

**前五块搬的都是函数，这一块搬的是状态。** `codexActionRunDatabase`、它的 ready 标志与运行内存原本是入口的三个模块级 `let`，被七处直接写入。现在它们活在模块闭包里，入口只通过具名操作触达：`closeCodexActionRunDatabase` / `enforceRetentionIfOpen` / `rememberCodexActionRun` / `codexActionRunMemorySnapshot` / `findCodexActionRun`。每个操作是那七处**真正想做的整件事**，而非「把某个 `let` 改成某个值」。入口内这三个名字的出现次数已归零。

这正是路线 3（闭包化改写）与路线 2（共享状态模块）的分界：状态被搬进模块并封在闭包里，耦合被消除而非搬家。

`utools` 按 node-runtime 抽 `process` 的同一理由显式注入——从全局读取时源码逐字相同，沙箱下却解析到另一个对象。

### 状态迁移把测试夹具一并带走

`codexActionRuntime.test.ts` 的留存用例原先直接改写那三个绑定来重置。绑定迁走后，同样的赋值在 vm 沙箱里创建的是**新的沙箱全局**，模块状态纹丝不动，用例读到空数组。夹具改走 `closeCodexActionRunDatabase()` 与快照读取，与生产同路径——比原来更忠实于用例意图。

**迁移状态时，直接改写该状态的测试夹具属于同一次改动的一部分。** 只搜函数名找不到它们。

## 2026-08-14 第七块：Environment Action 授权边界

`preload/codex/action-authorization.cjs`（103 行）承接命令保险库与确认令牌。入口 14,802 → **14,797**。

**两个机制是同一条边界。** 渲染层只给 id 不给命令，宿主从自己读取环境文件建立的保险库里取；确认令牌把一次执行绑定到 `(target, environment, action, 环境文件指纹, 命令指纹)` 元组并限时 30 秒。合起来回答同一个问题：**这个动作现在是否被授权。** 分开看是两个 Map，合起来才是一条边界。

价值在边界不在体量，与 `command-validation.cjs` 同类：独立后可直接施加重放、过期、跨动作替换与确认后改文件，无需搭起整个 preload 沙箱。已独立验证 14 项全过。加载失败时 `findCodexEnvironmentCommand` 返回 `undefined` → `action-missing`，令牌签发返回空串 → 永远读作未确认，两条路径都 fail-closed。

### 抽取暴露了测试自身的一处静默塌陷

runner bridge 用例按 `indexOf(锚点)` 划出监管区再断言，而锚点常量本轮迁走。`indexOf` 返回 `-1` 使 `slice` 把整片区域塌成一个字符，**八条断言同时对着无关文本失败**——失败数量与真实缺陷数量脱钩。改为锚点失配直接抛出具名错误，并改锚到语义属于该区域的 `CODEX_ACTION_HOST_RUNTIME_REVISION`。耐久记录：[test-slice-anchor-collapses-instead-of-failing](../../knowledge/error-memory/test-slice-anchor-collapses-instead-of-failing.md#L1)。

同轮 runtime 夹具原先直接 `set` 那两个 Map，改为经边界播种并回答「该动作是否仍被授权」——比数 Map 大小更强。**这是第六块记录的同一条：迁移状态时，直接改写该状态的测试夹具属于同一次改动。**

## 2026-08-14 第八块：rollout 待处理证据读取

`preload/codex/rollout-evidence.cjs`（170 行）承接从 rollout JSONL 尾部判断「线程是否在等用户」与「是否持有就绪 Plan」。入口 14,797 → **14,737**。

两个读取器都把行流折成一个小状态，也都必须把无法解析或超长的行当作**没有证据**而非一条证据——rollout 行是另一个进程写的不可信输入，一个会抛的读取器会带走调用它的整趟扫描。合成一个模块正是为了让这条纪律只有一处。已独立验证 17 项全过。

### 热基元不迁

`codexRecord` 有 **211** 个调用点、`codexTimestampMs` 有 **122** 个。入口冻结的降级契约要求「加载失败降级而非抛出」，而这几百处调用无法降级——所以它们留在入口，由入口注入模块。**入口冻结不只约束抽什么，也约束抽多深**：调用密度本身构成边界。

加载失败时四个委托返回 `known: false` 的空结果，与「尾部确实读不出结论」走同一条路径，调用方照常加宽尾部后弃权。

## 2026-08-14 第九块：启动计划与代理发现

两个模块，因为是两件事。入口 14,737 → **14,628**。`preload/codex/` 现有十个模块。

**[launch-plan.cjs](../../../preload/codex/launch-plan.cjs#L1)（132 行）**：磁盘上的一条路径还不是一条命令。同一个 `codex` 可能是原生二进制、包着 JS 入口的 `.cmd`/`.bat`、或需要 node 的 JS 入口；自带的平台二进制存在时优先，因为它根本不需要运行时。与 [node-runtime.cjs](../../../preload/codex/node-runtime.cjs#L1) 互为对偶：那个找 node，这个判断到底需不需要 node。

**[proxy-discovery.cjs](../../../preload/codex/proxy-discovery.cjs#L1)（144 行）是拒绝边界而非便利函数。** 它调用 `scutil` 与 `curl`，解析别的程序写的 PAC，结果会成为子进程的 `HTTP_PROXY`——所以每一步都写成拒绝：仅 macOS、仅用户未自设代理、仅回环 PAC URL、仅「整段只有一条 `return`」且在字节上限内、指令必须是回环主机与合法端口。`curl` 自身带 `--noproxy '*' --proto '=http'` 与硬超时，取 PAC 这一步不会再被代理或协议重定向。**一个本模块无法完整解释的代理，就是不该把子进程指过去的代理。**

独立后这些拒绝可以直接施加，共验 24 项全过。加载失败时降级为「不做特殊处理」——原样候选交给 OS 查找、不注入代理——两者都是这两个模块查无结果时给的同一个答案，调用方不会多学一种情况。

## 2026-08-14 全域重测：原域表两个方向都错

前八块交付后按**函数跨度**重测全部十个域（前缀口径已在首块被证伪，但当时只更正了 `actions` 一行）：

| 域 | 函数 | 行数 | 调用的域外函数 | 高共享状态 |
| --- | ---: | ---: | ---: | ---: |
| threads | 34 | 1,049 | 43 | 31 |
| actions | 62 | 944 | 14 | 13 |
| float | 33 | 751 | 17 | 7 |
| rollout | 20 | 717 | 20 | 6 |
| desktop | 36 | 680 | 14 | 7 |
| inventory | 15 | 618 | 38 | 16 |
| activity | 14 | 567 | 17 | 13 |
| environment | 15 | 351 | 16 | 4 |
| native | 13 | 200 | 5 | 5 |
| archive | 7 | 92 | 5 | 4 |

**原表的两个结论都不成立。** 原表说 rollout 只有 4 个跨域依赖——实测它调用 20 个域外函数并触及三个高共享缓存（`codexActivityInventory` 域外 59 处引用、`codexProcess` 22 处、`codexThreadTurnStatusCache` 17 处）。原表说 float / environment / native / archive 是「四个零依赖域、合计 186 行」——实测这四个域合计 68 函数 / 1,394 行，且**没有一个是零依赖**。

低估与高估同源：前缀计数既漏掉以动词开头的同域函数，也看不见函数体内的跨域调用。

### 由此得出的可执行结论

**入口里没有任何一个 codex 域可以整域抽出。** 已交付的八块之所以成立，全都因为它们是**经实测确认低耦合的内聚簇**，而不是域。域是命名上的分类，簇才是依赖上的单位。

因此路线 1（「actions 域试点」）按其字面同样不可执行；实际在走的是它的修正版：**按传递闭包找零共享绑定的簇，逐簇抽出**。判据固定为三条——闭包内函数互调、闭包外引用点少、不触及高共享模块级绑定。

前九块合计使入口从 15,046 降到 **14,628**（-418 行，2.8%），并建立 `preload/codex/` 十个模块。按已识别的候选簇估算，该路线尚可再降约 800–1,200 行；要越过这条线必须动 `codexActivityInventory` 等跨域缓存，那是路线 2 或 3 的范围，需先明确验收口径。

### 剩余

`runCodexProjectEnvironmentAction`（252 行）与其两个协作簇构成真正的循环依赖（会话登记调用它做重启）；`installCodexActionRunnerIpc`（343 行）落在 `EYPC-UTOOLS-HOST-001` 入口冻结管辖范围。两者都不在「低耦合簇」判据内。

已识别的下批候选簇（均零共享绑定）：environment TOML 解析（2 函数 / 89 行）、`codexDesktopProjectedRequest` 闭包（7 函数 / 72 行）、`sanitizeCodexQuota` 闭包（6 函数 / 76 行）、`codexInventoryThreadTopology` 闭包（4 函数 / 60 行）、`codexMergedInventoryTurnFields` 闭包（3 函数 / 53 行）。

### 剩余（原文，已由上文取代）

`actions` 域尚余 `runCodexProjectEnvironmentAction`（252 行，27 处外部调用）与 `installCodexActionRunnerIpc`（343 行）。

前者实测**不可直接抽出**：注入 17 个协作者不是边界，是参数表。其协作者自然聚成两簇——运行生命周期（`createCodexActionRun` / `appendCodexActionRunLog` / `finishCodexActionRun` / `pushCodexActionRunnerSnapshot`，89 行 / 18 处外部调用）与会话登记（`codexEnvironmentSessionKey` / `sanitizeCodexEnvironmentSession` / `signalCodexEnvironmentSession` / `stopCodexEnvironmentActionSession` / `restartCodexEnvironmentActionAfterExit`，72 行 / 12 处外部调用）。两簇彼此互调，须一并考虑，且它们与该函数是**真正的循环依赖**：会话登记调用 `runCodexProjectEnvironmentAction` 做重启。

后者落在 `EYPC-UTOOLS-HOST-001` 入口冻结管辖范围，需先确认 IPC 装配可否离开入口。
