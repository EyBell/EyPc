# RAW-169 现版核验与后续计划

Date: 2026-08-23
Type: `re-verification / plan`
Requirement owner: [invariants-raw-169](../../requirements/invariants-raw-169.md#L13)
Status: `plan / superseded-by-260825-delivery / D1 未裁决`
> **2026-08-25 更新**：本文 §3 的 D2（路线口径）与 D3（scope 是否扩到全 Provider）已由后续交付回答——route 1 耗尽后正式转 route 3 闭包化改写，共交付四个域；`preload/cursor/` 经实测在本文落笔时即已存在 7 个模块，§2.4「该目录不存在」的表述当时即不成立。§4 的 P1 入口预算门禁仍未实施。§2 的四项判据结论、§2.2 的入口轨迹与 §2.3 的绑定计数均已被 [需求叶子的 08-25 复核节](../../requirements/invariants-raw-169.md#L18) 取代，以后者为准。**仅 D1（判据 2 是否为硬门槛）仍待裁决。**

> 本文件是计划与核验证据，不是需求。RAW-169 条款正文与其 `proposed` 状态仍由需求叶子拥有。
> 与今日 [Codex 架构审计](../companion-task-topology-v5/assessment/260823-codex-architecture-audit.md#L1) 互补：那份审计覆盖 V5 需求谱系与渲染侧架构，完全没有触及 preload 入口的体量与拆分线，本文件补的正是这一段。

## 1. 核验口径

按 RAW-169 条款字面的三条判据逐条核验，不引入条款之外的验收项：

1. 拆分以职责边界为准，不以行数为准；
2. 每个模块保持与 `preload/claude/` 侧同量级规模；
3. 拆分与行为修改不得在同一提交内混合。

外加条款的隐含目标——Codex 侧应当离开入口单体——单列为第 4 项，因为前三条全部通过时它仍可能不成立，本轮实测正是这种情况。

测量方法按 [prefix-based-domain-analysis-undercounts](../../../knowledge/error-memory/prefix-based-domain-analysis-undercounts.md#L1) 的更正路线：域名在函数名任意位置匹配、按函数跨度计行、对总量做交叉校验（473 个顶层函数覆盖入口 71.0%，余下为常量、IPC 注册与顶层语句）。

## 2. 核验结果

| # | 判据 | 结果 | 实测 |
| --- | --- | --- | --- |
| 1 | 职责边界而非行数 | **达成** | 22 个模块均按「闭包内互调 / 闭包外引用少 / 不触高共享绑定」的簇判据抽出；方法论已在第九块从「域」更正为「簇」 |
| 2 | 与 Claude 侧同量级 | **未达成** | codex 22 模块 2,846 行，均值 129 / 中位 115；claude 13 模块 4,664 行，均值 359 / 中位 293。差 2.6–2.8 倍 |
| 3 | 不与行为修改混提交 | **达成** | 16 个 `refactor(codex):` 提交无一触及 `src/`，文件面一律是「模块 + 入口 + 镜像 + utools 资产表 + 该模块的测试」 |
| 4 | Codex 侧离开入口 | **净额倒退** | 15,046 → 14,304（16 块，-742 行）→ HEAD **15,186**（+882 行）。相对 RAW-169 提出时净 **+140 行** |

### 2.1 判据 2 的分歧不是失误，是未裁决的口径改动

第九块起文档反复申明「行数从来不是判据」，第十六块甚至接受入口净增 11 行以换取完整降级形状。这在工程上成立，但条款同时写了「每个模块保持与 Claude 侧同量级规模」——实施单方面保留了前半句、放弃了后半句，而该条款本身还停在 `proposed` / `agent-transcribed`，用户从未确认过转述忠实。**这是一处需要用户明确的口径改动，不应由实施方沉默择一。**

### 2.2 判据 4 的倒退有确切来源

入口在第十六块后被五个提交推回：

| 提交 | 入口 delta |
| --- | ---: |
| `0706e1d` feat(cursor) 冷库存与钩子通道 | +173 |
| `eb1a7ac` feat(cursor) 打开/归档接入导航权威 | +22 |
| `7cf9fc9` fix(companion) 选择器就绪 | +38 |
| `402d0ca` fix(companion) 生产 preload 转发 | +3 |
| `765f77c` add(companion) 三来源 V5 证据通道 | **+646** |

其中 `765f77c` 直接在入口新增了三个 codex 顶层函数（`codexDesktopRuntimeHasWaitingFlags` / `codexDesktopRuntimeIsPlainActive` / `codexDesktopRuntimeBecamePlainActive`），即 RAW-169 要消除的形态在被消除的同时继续生成。**没有任何门禁阻止这件事**——16 块拆分是纯人工推进，抵不过并发增量。

### 2.3 状态面基本没动

入口现有 155 个模块级可变绑定（123 `let/var` + 32 `Map/Set`），草案基线是 129。其中约 20 个是抽取自身引入的模块句柄，扣除后与基线基本持平：**闭包化搬走的状态，被并发增量等量补了回来。** 草案点名的五大跨域缓存全部仍在入口，且引用数未降：

`codexActivityInventory` 63 refs / 20 fns · `codexDesktopBridge` 29 / 18 · `codexThreadGoalCache` 20 / 14 · `codexThreadActions` 20 / 11 · `codexThreadTurnStatusCache` 19 / 10

并新增两个跨 Provider 的高共享绑定：`companionTaskKernel` 80 refs / 16 fns、`runtimeDiagnostics` 55 refs / 26 fns。

### 2.4 同一形态正在 cursor 侧重演

入口现有 118 处 `cursor` 引用、5 个 cursor/companion-cursor 顶层函数、4 个 cursor 模块级绑定，且 `preload/cursor/` 不存在。RAW-169 的条款只写了「Codex 侧」——按字面它管不到这里，而问题是同一个。

## 3. 阻塞决策（P0，需用户裁决，未定前不开工 P2/P3）

- **D1 · 「同量级规模」是否仍是验收判据。** 见 §2.1。选「是」则 22 个模块需要按职责重新归并到 Claude 侧量级；选「否」则条款正文应删去该半句并重新入册。**这一条直接决定 RAW-169 能否从 `proposed` 走到 `accepted`。**
- **D2 · 三条路线仍未选定。** 需求叶子写明「未选定路线前不动代码」「选择 2 或 3 会改变本条款的验收口径」，而实际十六块走的是路线 1 的修正版（低耦合簇）。请确认「按簇抽取」即为正式口径，或改选路线 3（闭包化改写，唯一能消除跨域缓存的路线，但那是入口重写）。
- **D3 · scope 是否扩到全 Provider。** 见 §2.4。

## 4. 不需决策即可执行（P1，建议先做）

**加一道入口预算门禁**，钉住 `preload/index.js` 的三个数只降不升：总行数、codex 顶层函数数、模块级可变绑定数。

- 依据：§2.2 已证明「人工抽取 + 无门禁」的净效果是零甚至为负；这也正是同源草案第 88 条已经要求的「收敛完成后必须留下可执行的防回归手段：新增重复定义点应由校验器或测试拒绝，而不是依赖下一轮人工审计发现」（[raw-requirement-next.draft.md#L44](../../260810/1155-install-runtime-diagnostics/raw-requirement-next.draft.md#L44)）。
- 形态：新增 `scripts/validate-preload-entry-budget.mjs`，基线值写在脚本内并随每次抽取下调；挂进 `verify` 与 `build` 之一（`package.json` 现有 `validate:mirrors` / `validate:utools` / `validate:requirements` 三个同类校验器可直接对齐形态）。
- 越过门禁需要显式改基线，使「入口又长了 646 行」成为一次可见的决定，而不是一次无人察觉的漂移。
- 影响边界：新增脚本 + `package.json` 脚本行 + 一条脚本自测；不触碰运行时代码，因此不与判据 3 冲突。

## 5. 决策后再执行（P2/P3）

- **P2 · 继续按簇抽取。** 需求叶子的「剩余候选」清单已被第十至十六块消化完，且 HEAD 之后新增的 882 行从未做过簇分析——**下一轮抽取前必须先重跑簇实测，不能沿用旧清单**。已知硬边界不变：`installCodexActionRunnerIpc`（落在 `EYPC-UTOOLS-HOST-001` 入口冻结管辖）、`runCodexProjectEnvironmentAction`（与会话登记簇构成真循环依赖）。
- **P3 · 跨域缓存（依赖 D2 选路线 3）。** 目标是 §2.3 的七个高共享绑定。这是入口重写而非拆分，须单列增量与独立验收口径。

## 6. 文档同步（随本轮或 P1 一并处理）

需求叶子的「交付状态」段仍写着「未交付。……preload/index.js 仍为 15,046 行且 preload/codex/ 不存在」（[invariants-raw-169.md#L15-L17](../../requirements/invariants-raw-169.md#L15)），与其下方十六段交付记录直接矛盾，是 08-13 写下后未更新的残留。应改写为当前实测：22 模块 / 入口 15,186 行 / 净额相对基线 +140。

## 7. 本轮验证状态

- 只读核验，未改动任何运行时代码，未运行 `test` / `build` / `typecheck`——按影响选择，本轮无代码影响面。
- 全部数字来自当前工作树 `HEAD`（`765f77c`）的实测：`wc -l`、顶层函数跨度扫描、模块级绑定引用计数、`git show <commit>:preload/index.js | wc -l` 轨迹、16 个提交的 `--name-only` 文件面。
- 未验：真实 uTools 宿主行为——本轮不涉及。
