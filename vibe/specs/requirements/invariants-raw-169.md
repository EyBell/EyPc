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
