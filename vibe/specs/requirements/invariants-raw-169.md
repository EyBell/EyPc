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

已识别的下批候选簇（均零共享绑定）：~~environment TOML 解析（2 函数 / 89 行）~~、~~`codexDesktopProjectedRequest` 闭包（7 函数 / 72 行）~~、~~`sanitizeCodexQuota` 闭包（6 函数 / 76 行）~~——三者已在第十块交付；~~`codexInventoryThreadTopology` 闭包（4 函数 / 60 行）~~、~~`codexMergedInventoryTurnFields` 闭包（3 函数 / 53 行）~~——按闭包/函数跨度重新实测后已在第十一块交付，实测结果见该节：两者都是单函数，不是多函数闭包。

### 剩余（原文，已由上文取代）

`actions` 域尚余 `runCodexProjectEnvironmentAction`（252 行，27 处外部调用）与 `installCodexActionRunnerIpc`（343 行）。

前者实测**不可直接抽出**：注入 17 个协作者不是边界，是参数表。其协作者自然聚成两簇——运行生命周期（`createCodexActionRun` / `appendCodexActionRunLog` / `finishCodexActionRun` / `pushCodexActionRunnerSnapshot`，89 行 / 18 处外部调用）与会话登记（`codexEnvironmentSessionKey` / `sanitizeCodexEnvironmentSession` / `signalCodexEnvironmentSession` / `stopCodexEnvironmentActionSession` / `restartCodexEnvironmentActionAfterExit`，72 行 / 12 处外部调用）。两簇彼此互调，须一并考虑，且它们与该函数是**真正的循环依赖**：会话登记调用 `runCodexProjectEnvironmentAction` 做重启。

后者落在 `EYPC-UTOOLS-HOST-001` 入口冻结管辖范围，需先确认 IPC 装配可否离开入口。

## 2026-08-15 第十块：桌面请求投影、配额脱敏与 Environment TOML 解析

三个模块，因为是三件互不相干的事。入口 14,628 → **14,512**。`preload/codex/` 现有十三个模块。

**[environment-toml.cjs](../../../preload/codex/environment-toml.cjs#L1)（116 行）零依赖**：不是通用 TOML 解析器，只接受 Environment 文件用到的子集（`[setup]`、`[[actions]]`、带引号字符串），多行字符串、缺失或非 `1` 的 `version`、畸形 action 一律返回 `null`。与 `command-validation.cjs` 同一先例——无模块绑定、无全局、无 Node 内置，直接 `require` 而非构造。函数体逐字比对零差异。

**[desktop-request-projection.cjs](../../../preload/codex/desktop-request-projection.cjs#L1)（151 行 / 6 函数）**：桌面 Plan 桥如何给一条实时请求定性——稳定的关联身份、尽力而为的时间戳、是否正等着用户（输入或批准）。`codexDesktopProjectedRequest`/`codexDesktopProjectedRequests` 把新观察值与上一次「同一条」请求的记录对齐——有关联 id 就按 id 匹配，没有就按 `(type, method, startedAt)` 匹配——使 `observedSequence` 与 `startedAt` 在重复轮询间存活，而不是每次归零。`record`/`timestampMs`/`crypto` 按既有先例注入；`nextLiveEvidenceSequence` 闭包着入口的活跃证据计数器，同样只能注入不能带走。原来挂在入口顶层、只在这一簇内使用一次的 `CODEX_DESKTOP_REQUEST_CORRELATION_SALT` 随之移入模块闭包，入口内该名字出现次数已归零。

**[quota-sanitizer.cjs](../../../preload/codex/quota-sanitizer.cjs#L1)（100 行 / 2 函数）**：把 App Server 的限流与账户负载整理成状态 UI 读的形状——一个 `normal` 池与若干 `spark` 池，每池一个 `short`（≤24h）与 `weekly`（>24h）窗口。纯计算，`record`/`percent`/`number`/`timestampMs` 四个热基元全部注入，一个都不带走。

三者共同点：均由**实测确认零共享绑定**——`codexDesktopRequestTimestamp` 之外的五个桌面函数、两个 quota 函数、两个 TOML 函数彼此互调，闭包外没有第二个模块级状态与它们耦合，只有热基元（`codexRecord`/`codexTimestampMs`/`codexPercent`/`codexNumber`/`codexNextLiveEvidenceSequence`）作为跨越点，全部走注入。

加载失败时三者都退化为「不声称任何结论」而非抛出：桌面投影退化为空关联、空时间戳、`waitingOnUserInput`/`waitingOnApproval` 均不命中；配额退化为全空池（`plan: ''`, `short/weekly: null`）；Environment TOML 退化为 `null`（该文件读作不可解析）。三条路径都与「模块确实解析后得出同一个结论」走同一分支，调用方不会多学一种情况。

### 验证

[scripts/utools-preload-assets.mjs](../../../scripts/utools-preload-assets.mjs#L22) 管理清单同轮更新，缺一个模块 `validate:utools` 的模块集合检查即失败——本轮先漏改过一次，被 `pnpm run build` 现场拦下。已验：`tests/platform/codexAppServerBridge.test.ts`、`codexActionRuntime.test.ts`、`codexActionRunnerBridge.test.ts`、`codexFloatWindowBridge.test.ts` 共 185 项全过；`pnpm run sync:preloads` / `validate:mirrors` / `build`（含 `validate:utools`）全过；全量 `vitest run` 1405/1406 项通过，唯一失败项（MQTT 消息焦点用例超时）在本轮改动之前的基线提交上同样复现，与本次抽取无关。

## 2026-08-15 第十一块：线程分叉拓扑与库存 Turn 字段合并

两个模块，各自一个函数。入口 14,512 → **14,490**。`preload/codex/` 现有十五个模块。

**候选簇估算再次被推翻，方向与前几次相反。** 上一轮「已识别候选簇」把这两处记成 `codexInventoryThreadTopology` 闭包（4 函数/60 行）与 `codexMergedInventoryTurnFields` 闭包（3 函数/53 行）。逐函数重新实测：`codexInventoryThreadTopology` 与同一「拓扑」命名前缀下的另外两个函数——`codexRecordSideTopologyDecision`、`codexSyncInventorySideTopology`——同名不同质。后两者直接读写 `codexInventorySideRelations`/`codexInventorySideBranchEvidence`/`codexSideTopologyDiagnosticFingerprints`/`codexDesktopOpenedReadAcknowledgements` 四个模块级 Map/Set，这些容器在私有分支已读确认、Side Chat 遗忘等另外六处位置也被直接触达，是本条款反复强调的「高共享模块级绑定」，按判据不可抽出。真正零共享绑定的只有 `codexInventoryThreadTopology` 自身：一个纯函数，不是一个闭包簇。`codexMergedInventoryTurnFields` 同样是命名孤立的单函数，附近没有第二、第三个同族函数。**前缀相邻不等于依赖相邻**——这是继首块「前缀计数漏掉同域函数」、全域重测「域不是依赖单位」之后，同一类测量错误的第三次现身，这次错在高估簇的函数数而非低估域的函数数。

**[inventory-thread-topology.cjs](../../../preload/codex/inventory-thread-topology.cjs#L1)（87 行）**：把一份扁平的线程库存行重建成分叉/父子拓扑——谁是谁的直接分叉、链到哪个根、谁因为父项缺失/自引用/跨会话/成环而被判定孤立。纯图重建，只在自己的 `rows` 参数上运算。`record`/`validThreadId`/`nativeString` 按既有先例注入：`codexRecord` 在入口另有约 190 处调用，`validCodexThreadId` 另有约 85 处，都远超本簇，一次加载失败不能牵连它们。已用含环、跨 session、多代分叉的构造数据独立验证：环被判定孤立而非死循环，跨 session 分叉正确隔离，多代深度正确累计。

**[inventory-turn-fields.cjs](../../../preload/codex/inventory-turn-fields.cjs#L1)（84 行）**：把新读到的库存 Turn 投影与该线程既有的活动证据合并，防止低保真度的库存重读回退掉实时源已确立的证据。三条回归闸门按固定顺序判定——仍然存活的直接观测证据整体胜出；`startedAt` 比已知的更旧判为回归，丢弃；同一时刻从 `completed` 翻回其它状态视为库存重读与 Turn 边界赛跑而非新结果，同样丢弃——过此之后才保留新投影，且在结果未变时把旧的证据标签与 `completedAt` 带过来。纯计算，`timestampMs` 按既有先例注入。已用回归时间戳、同时刻状态翻转、实时证据优先三类场景独立验证。

两模块加载失败都退化为「不声称任何结论」：拓扑退化为全员孤立（下游合并找不到可合并对象，而非误判出错误的分叉关系）；Turn 字段合并退化为 `{}`（每个字段读作 `undefined`，调用方已经把它当作「本轮没有新证据」处理，不是新增的一种情况）。

### 验证

已验：`tests/platform/codexAppServerBridge.test.ts`、`codexActionRuntime.test.ts`、`codexActionRunnerBridge.test.ts`、`codexFloatWindowBridge.test.ts` 共 185 项全过；两模块各自独立冒烟（环检测、跨会话隔离、回归防护、live 优先）核对通过；`pnpm run sync:preloads` / `validate:mirrors` / `build`（含 `validate:utools`）一次性全过；全量 `vitest run` 1405/1406 项通过，唯一失败项与第十块记录的同一条 MQTT 用例超时，与本次抽取无关。

## 2026-08-15 第十二块：原生注册表校验

[native-registry.cjs](../../../preload/codex/native-registry.cjs#L1)（158 行 / 4 函数）承接 Codex 桌面端 global-state 注册表的严格校验与投影。入口 14,490 → **14,432**。`preload/codex/` 现有十六个模块。

**这是严格解析器，不是宽容读取器。** 文件属于另一个应用，而 EyPc 既读也回写——一个本模块没有完整理解的结构必须被**拒绝**而不是部分接受，因为部分读取会被当作完整结果写回去，静默丢掉它没能建模的部分。所以每种畸形都抛 `protocol-error`，没有 best-effort 路径。

拒绝本身就是内容：容器类型不对、id 与存储键不一致、根列表为空或超限、根无法归一化、两个项目解析到同一 key、线程 id 不是线程 id，以及项目数与分配数的上限。独立后每一种都能直接用敌意文档施加，在入口里这需要搭起整个 preload 沙箱。

纯函数：文本进、结构出。fs 读取与体积上限 `CODEX_NATIVE_STATE_MAX_BYTES`（另有三处写路径引用）留在入口，模块因此从不决定「要不要读」，只决定「读到的是否可采纳」。`codexError` / `codexRecord` / `codexNativeString` / `validCodexThreadId` / `codexNormalizeNativeRoot` 五个热基元与 `crypto` 全部注入。

### 差分核验：不只验行为，验逐字节结果

本块首次采用**差分核验**而非仅行为核验：把入口原实现逐字复制为对照实现，同 14 组输入（含畸形、边界、键序重排）逐一比对返回结构与指纹，**14/14 完全一致**。另有 29 项独立行为核验。

这条更强的核验抓住了一个行为核验抓不到的问题：`codexProjectKey` 的 NUL 分隔符。写模块时它一度被写成空格，而空格版本的所有拒绝行为、所有结构断言都照常通过——**只有派生值本身会变**。项目 key 决定同一目录是否被识别为同一个项目，这一处差异会把一个项目裂成两行。已按源码转义写法（`\0` 两字符）保留，与入口一致；写入过程中还出现过一次真实 0x00 字节落入源码，同样已改回转义——运行时等价，但裸 NUL 在源码里不可见，会被 grep、diff 与编辑器搞坏。

**凡是抽出「派生标识符」的代码，必须做差分核验。** 行为核验只证明拒绝路径没变，证明不了接受路径算出的值没变。

### 单一所有权断言取代具名文件断言

`projectIdentity` 原先钉住 `preload/index.js` 含该配方，本轮改为扫描入口加整个 `preload/codex/` 目录并要求**恰好一处**匹配：既跟着代码走，又同时把「Codex 侧只有一份配方定义」变成门禁。反向红测已验，植入第二份配方会被按数量拒绝。

加载失败时不读作空注册表——那会被当作完整结果写回——而是与畸形文档一样拒绝。

### 验证

`tests/platform` 532/532、typecheck 0、`build`（含 `validate:utools`）、`validate:mirrors`、16 个 CJS 语法、三处镜像一致。

### 剩余候选

按判据（闭包内互调、闭包外引用点少、不触及高共享绑定）重测后仍可抽的：`setCodexLaunchPath` / `clearCodexLaunchPath`（各 13 函数 / 220+ 行）触及 2–4 个高共享绑定，按判据不可抽。~~`codexDesktopShadowFromSnapshot`（9 函数 / 131 行）均触及高共享绑定、不可抽~~——此判定有误，见第十四块逐函数复核，已在该块交付。~~`codexRolloutRuntimeStateText`（2 函数 / 73 行，但共享 `codexRolloutEvidence`）~~、~~`resolveCodexLaunchPlan`（6 函数 / 121 行，共享两个启动路径常量）~~——均已在第十五块交付；前者实测是单函数而非二函数（`codexRolloutTimestampMs` 本身已是第八块委托桩，不是同簇成员）。`readCodexNativePrimaryState` 闭包剩余部分实测**不是候选**：它直接做 `fs.statSync`/`fs.readFileSync`，按第十二块自述的设计原则（fs 读取留在入口，模块只管校验已读内容是否可采纳）它本就该留在入口，不是尚未处理的候选，是已经在其设计边界上。

## 2026-08-15 第十三块：Waiting 证据可见性

[waiting-evidence.cjs](../../../preload/codex/waiting-evidence.cjs#L1)（54 行 / 2 函数，零依赖）承接一个 Desktop waiting 标记（`waitingOnUserInput`/`waitingOnApproval`）是否仍是活证据、还是已被更晚的观测清掉。入口 14,454（含第十二块后的并行改动）→ **同批净减 16 行**，`preload/codex/` 现有十七个模块。

**逐字迁移，但被一类新缺陷绊住：`instanceof Map` 跨 vm 沙箱 realm 恒假。** `waitingState.resolvedRequestSequences` 由入口（测试里跑在 vm 沙箱）用 `new Map()` 构造；模块经真实 `require()` 加载，跑在真实 Node realm。同一个对象在两个 realm 下都是真的 Map，但 `instanceof` 比较的是构造函数原型链恒等，跨 realm 恒假——已解析的请求因此被读作「不是 Map」，退化到无条件可见分支，与「已解析请求应隐藏」的预期相反。聚焦测试当场两项失败：一项 `resolveServerRequest` 清不掉匹配的 waiting 标记，一项 `desktopActiveSince` 在等价快照替换后丢失。

这与 node-runtime.cjs 记录的「vm 沙箱里 `process` 指向 `processMock`」是同一类缺陷的另一种表现——不是值变了，是运行环境（这次是 realm 而非 mock 替身）变了。修法同源：把 `Map` 构造函数本身注入（`const MapCtor = dependencies.Map || Map`），而不是把 `instanceof` 改写成鸭子类型判断——后者是逻辑改写，与「拆分与行为修改不得混在同一提交」冲突。注入后聚焦测试恢复 185/185。已记录：[preload-module-instanceof-crosses-vm-sandbox-realm](../../knowledge/error-memory/preload-module-instanceof-crosses-vm-sandbox-realm.md#L1)，同时标注 `rollout-evidence.cjs:55` 的 `initialCorrelations instanceof Set` 是同款隐患——现有调用路径尚未显性触发，但模式仍在。

加载失败时退化为「每次观测都可见」：`codexWaitingFlagClearSequence` 返回 `0`，`codexWaitingEvidenceVisible` 返回 `true`——调用方自身基于历史的边缘检测仍然生效，只是失去显式清除的快速路径，不会读出一个新的错误状态。

### 验证

已验：`tests/platform/codexAppServerBridge.test.ts`、`codexActionRuntime.test.ts`、`codexActionRunnerBridge.test.ts`、`codexFloatWindowBridge.test.ts`、`projectIdentity.test.ts` 共 189 项全过；`pnpm run sync:preloads` / `validate:mirrors` / `build`（含 `validate:utools`）全过；全量 `vitest run` 1405/1406 项通过，唯一失败项与前序几块记录的同一条 MQTT 用例超时，与本次抽取无关。

### 待复核（已在第十四块解决）

第十二块的「剩余候选」判定 `codexDesktopShadowFromSnapshot`（9 函数 / 131 行）触及高共享绑定、不可抽；本块独立扫描（传递闭包 + 全函数占用点分析）得到一个不同的分组结果，把该函数归入一个 7 函数 / 213 行的零共享绑定簇（`codexDesktopRuntimeWaitingSequences`/`codexDesktopRuntimeProjection`/`codexRememberDesktopRequestObservations`/`codexDesktopRequestObservationCandidates`/`codexDesktopShadowFromSnapshot`/`codexDesktopPatchIndex`/`codexApplyDesktopShadowPatch`，外部依赖全部是热基元或本条款已抽出的函数）。两个结论未经交叉核验，本轮未动这一簇的代码；下一块动手前须先重新逐函数核对，而不是采信任一方的现成结论。

## 2026-08-15 第十四块：Desktop 会话影子构建与补丁应用（复核并交付「待复核」簇）

[desktop-shadow.cjs](../../../preload/codex/desktop-shadow.cjs#L1)（286 行 / 7 函数）承接第十三块留下的分歧。入口 14,454 → **14,311**。`preload/codex/` 现有十八个模块。

**逐函数复核，两个结论都不完全对。** 用 TypeScript 编译器 API 对入口全部 463 个顶层函数建自由标识符依赖图，排除已抽出模块的委托桩，对每个候选簇的每一个外部引用直接查「这个 Map/Set 还被簇外哪些函数触达」——不是估算，是对每条边逐一核实。结果：`codexInventoryThreadTopology`（第十一块）式的教训在这里反过来——第十二块把 `codexDesktopShadowFromSnapshot` 判为「触高共享绑定」，实际是把它与同一文件区域里命名相邻但真正耦合的 `codexDesktopShadowActivity`（读 `codexWaitingEvidenceVisible`/`codexReduceWaitingEdge` 但不与本簇互调）混为一谈；本块的候选簇本身经七个函数逐行核对，没有一处触及模块级 Map/Set——`codexRememberDesktopRequestObservations` 写的 `waitingState.requestHistory`、`codexDesktopShadowFromSnapshot` 写的 `shadow`/`waitingState` 字段，都是调用方传入的参数，不是模块级绑定。**同一份代码，两次独立判断给出相反结论，都不是靠直觉定的——差别在查证颗粒度：函数级邻近 vs. 逐条边核实。**

七个函数因为是一件事：把 Desktop 的 `thread-stream-state-changed` 快照/补丁流，维护成 preload 自己的会话影子（runtime 状态、pending 请求、waiting 证据序列号）。`codexDesktopShadowFromSnapshot` 从整份快照重建；`codexApplyDesktopShadowPatch` 把一条 JSON-Patch 应用到既有影子上，识别不了的补丁形状一律拒绝（`false`）而不是部分应用——这是它已有的纪律，抽取不改变。

依赖注入：`record`/`timestampMs`/`validThreadId`/`nextLiveEvidenceSequence` 是热基元（入口内另有约 100–200 处调用）；`reduceWaitingEdge`（另 6 处调用）与 `activityStatus`（另 3 处调用）是比本簇小但仍跨簇共享的纯函数，同样只能注入；`projectedRequest`/`projectedRequests` 注入的是第十块已抽出模块的入口委托桩——组合已抽出模块而不是重新实现，与「热基元不迁」同一条纪律的另一种应用。只在本簇内使用一次的 `CODEX_DESKTOP_WAITING_REQUEST_HISTORY_LIMIT` 随之移入模块闭包，入口内该名字已归零。

加载失败时七个函数各自退化为自己已有的「无结论」哨兵，不新增一种状态：序列号函数返回 `{}`（下游合并成大表，空表贡献为零）；projection 与 candidates 分别返回 `null`/`[]`；`requestObservations` 是空操作；`patchIndex` 返回 `-1`（函数自身既有的「未命中」值）；`shadowFromSnapshot`/`applyDesktopShadowPatch` 返回 `null`/`false`（分别是「快照不可用」「补丁被拒绝」的既有值，调用方已经在正常路径上处理这两种结果）。

### 验证

已用构造快照+补丁场景独立冒烟：正常快照重建、`resumeState`/`threadRuntimeStatus`/`requests` 三类补丁应用、未识别字段放行（返回 `true`，推进 revision 但不改状态）、畸形操作拒绝（返回 `false`）全部核对通过。聚焦测试 `codexAppServerBridge`/`codexActionRuntime`/`codexActionRunnerBridge`/`codexFloatWindowBridge`/`projectIdentity` 共 189 项一次性全过（未再复现第十三块那类跨 realm 问题——本模块没有对内建类型做 `instanceof`）。`pnpm run sync:preloads` / `validate:mirrors` / `build`（含 `validate:utools`）全过；全量 `vitest run` 1405/1406 项通过，唯一失败项与历次记录的同一条 MQTT 用例超时，与本次抽取无关。

## 2026-08-15 第十五块：启动路径偏好与 rollout 运行时状态（两处失手，两条新错误记忆）

两个模块，因为是两件事。入口 14,311 → **14,290**。`preload/codex/` 现有二十个模块。

**[launch-path-preference.cjs](../../../preload/codex/launch-path-preference.cjs#L1)（6 函数 / 187 行）**：手动「Codex CLI 位置」偏好的读取与自动候选扫描——没有手动路径时按平台遍历 volta/nvm/homebrew/PATH，去重成一个启动计划与一份候选列表。`platformPath`/`launchPlan` 是第九块已抽出模块的入口委托桩；`fs`/`os`/`process` 按 node-runtime 先例注入；`utools` 按 run-database 先例注入；`storageKey` 注入而非复制字面量，因为未抽取的 `writeCodexLaunchPathPreference`（配对的写路径，与本簇不共享其它逻辑）必须用同一个键。

**[rollout-runtime-state.cjs](../../../preload/codex/rollout-runtime-state.cjs#L1)（1 函数 / 115 行）**：从 rollout 尾部判定线程的实时运行阶段（active/completed/interrupted），与已持久化的 Turn 状态是两个不同的问题。`record`/`rolloutTimestampMs` 注入，后者本身就是第八块已抽出模块的入口委托桩。

### 两处失手

**其一，标签文案凭记忆写错。** 模块内复制的 `CODEX_LAUNCH_SOURCE_LABELS` 三个值（`nvm`/`path`/`unknown`）与入口实际定义不一致——写模块时没有逐字重新读取该常量的当前定义，只凭早前一次探索时看到的片段推断补全。语法检查、聚焦测试的结构断言都不会抓这类问题，因为返回形状没变，只有具体字符串值变了——与第十二块记录的「行为核验证明不了派生值没变」同一条纪律，这是同一会话里的第二次命中。已按源码逐字重新核对修正。

**其二，工厂签名写了注入参数，入口调用处却漏传。** `createCodexLaunchPathPreference` 的函数体正确写了 `dependencies.process || process` 等四处兜底，但入口 `preload/index.js` 里实际调用时只传了 `platformPath`/`launchPlan`/`storageKey` 三项，`fs`/`os`/`process`/`utools` 四个全部漏传。兜底命中的是模块自己 `require` 时刻的真实 Node 全局，在生产环境（单一 realm）里凑巧正确，在聚焦测试的 vm 沙箱里是另一个 `process`——三条 Windows 平台候选扫描断言当场失败：`host.platform === 'win32'` 恒假，全部落进 macOS/Linux 分支。补齐四个注入后聚焦测试恢复。这与第十三块的 `instanceof Map` 跨 realm 问题同根同源（环境变了而非代码变了），但触发方式不同——那次是判据本身跨 realm，这次是设计了注入却没接线。两条分别记录：[preload-module-instanceof-crosses-vm-sandbox-realm](../../knowledge/error-memory/preload-module-instanceof-crosses-vm-sandbox-realm.md#L1)、[preload-module-forgets-injection-at-call-site](../../knowledge/error-memory/preload-module-forgets-injection-at-call-site.md#L1)。

加载失败时两模块退化为各自已有的「未检测/未知」哨兵：启动路径偏好退化为空偏好（等同「未设置手动路径」，调用方本就把这读作转向自动检测）与 `codexLaunchPlan('codex', 'unknown', false)` 包装的空结果；rollout 运行时状态退化为 `known: false, phase: 'unknown'`（调用方本就把「未知」读作需要继续加宽尾部）。

### 验证

聚焦测试 `codexAppServerBridge`/`codexActionRuntime`/`codexActionRunnerBridge`/`codexFloatWindowBridge`/`projectIdentity`/`claudeCliDiscovery` 共 198 项全过（首次运行时四项 Windows 平台断言失败，定位为漏注入后修复）；两模块各自独立冒烟（NUL 拒绝、路径归一化、手动/自动两条启动路径、rollout 全生命周期与畸形行容错）核对通过；`pnpm run sync:preloads` / `validate:mirrors` / `build`（含 `validate:utools`）全过；全量 `vitest run` 1409/1410 项通过，唯一失败项与历次记录的同一条 MQTT 用例超时，与本次抽取无关。

## 2026-08-15 第十六块：Desktop IPC 端点校验与父子活动聚合

两个模块，因为是两件事。`preload/codex/` 现有二十二个模块。**入口净增 11 行**——本块首次出现拆分不降反升：`codexResolveParentActivity` 的降级默认值是一个十一字段对象字面量，比原地内联的委托调用体量更大。行数从来不是判据（第九块起反复申明），这里正是代价现形的一次：换来的是「模块不可用时仍返回形状完整、语义正确的默认值」而不是让调用方自己应付一个更简陋的返回值。

**[desktop-ipc-endpoint.cjs](../../../preload/codex/desktop-ipc-endpoint.cjs#L1)（2 函数 / 62 行）**：定位 Desktop IPC socket 并校验是否可信——仅 macOS、仅 socket 与其目录都属于当前用户且无 group/other 权限位。`codexNativeStatePaths` 是第十二块已抽出模块的入口委托桩；`process`/`fs` 按 node-runtime 先例注入——本块起对新模块的 `process` 注入直接在写工厂签名的同一次编辑里改好入口调用处，不再分两步走，就是上一块错误记忆记录的那条预防规则的直接应用。

**[desktop-activity-aggregation.cjs](../../../preload/codex/desktop-activity-aggregation.cjs#L1)（3 函数 / 111 行）**：三个互不调用的独立聚合——`codexAppServerActiveDominates` 判定 App Server 实时证据是否按序列号压过 Desktop 活动事件；`codexResolveParentActivity` 把父线程自己的活动与 Side Chat 子线程的活动合并成一个父级状态；`codexDesktopAggregateUnread` 用同样的父子合并形状处理未读证据。三者是同一类问题（把 N 条证据合并成一条父级结论）的三个实例，不是彼此协作，归一个模块是因为形状相同而非逻辑相关。`codexDesktopUnreadObservation` 本身直接触达 `codexDesktopOpenedReadAcknowledgements`——一个在私有分支已读确认等六处位置被直接读写的高共享 Map——按判据留在入口，只作为函数引用注入，不随聚合逻辑一起搬。

加载失败时：端点解析退化为空字符串（等同「Desktop IPC 不可用」，连接尝试本就不会发起）；App Server 优先级判定退化为 `false`（不声称任何优先级，与原函数自身「未知归为不优先」的早退分支一致）；父级活动合并退化为父自己未合并的状态（无子证据、无 waiting 标记，与「没有 Side Chat 的父线程」产出同一形状）；未读合并退化为 `{ hasUnreadTurn: false, unreadAuthority: 'unavailable' }`（与「没有一条观测为正」的既有分支同一形状）。

### 验证

已用构造场景独立冒烟：macOS/Windows 平台端点解析分歧、uid/mode 校验通过与拒绝、App Server 序列号优先级、父子活动合并（含 waiting 标记与时间戳）、父子未读合并全部核对通过。聚焦测试 198 项**一次性全过**（本轮吸取上一块教训，写工厂签名与改入口调用处同一次编辑完成，未再漏注入）。`pnpm run sync:preloads` / `validate:mirrors` / `build`（含 `validate:utools`）全过；全量 `vitest run` 1409/1410 项通过，唯一失败项与历次记录的同一条 MQTT 用例超时，与本次抽取无关。
