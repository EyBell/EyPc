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

### 剩余

`actions` 域尚余 `installCodexActionRunnerIpc`（343 行）、`runCodexProjectEnvironmentAction`（253 行）与窗口生命周期。前者落在 `EYPC-UTOOLS-HOST-001` 入口冻结管辖范围，需先确认 IPC 装配可否离开入口。
