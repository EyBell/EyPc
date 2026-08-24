# Requirement Registry Coverage

登记必须能回答「这条现在还作数吗」，所以也必须诚实回答「哪些还没进来」。一份看起来完整、实则只覆盖一部分的登记，比没有登记更危险。

Date: 2026-08-24

## 语料实测

当前由 [Source Anchor Catalog](../source-anchors/README.md#L1) 确定性扫描 29 个 `raw-requirement.md`。扫描忽略 Markdown 围栏内的原始 Prompt、转录和实施计划，只给围栏外的来源结构建索引；同一文件可能同时包含父 RAW heading 与编号子条款，因此文件数不是互斥总和：

| 形态 | 文件数 | 条目 | 可否按 `SPEC::RAW-nnn` 入册 |
| --- | ---: | ---: | --- |
| bullet `- \`RAW-nnn\` (…): 正文` | 2 | 157 | 可以 |
| table `\| RAW-nnn \| 状态 \| 正文 \|` | 1 | 32 | 可以 |
| heading `# / ## RAW-nnn` | 6 | 13 个父身份 | 可以 |
| registered-parent numbered `RAW-nnn#n` | 3 | 98 | 可以，父 id 与序号均来自来源；当前全部入册 |
| numbered 无父 RAW `1. 正文` | 14 | 102 | 已有 `SA-*` 来源身份；不能自动升级为需求叶子 |
| 纯散文 | 5 | — | 不能 |

同一个 bullet 文件内部还并存三种标注风格：ASCII 括号、全角括号加斜杠分隔的交付状态、以及裸散文限定语。`RAW-155` 之后的最新条款全部使用第二种——只认第一种的抽取器会**静默丢掉最新、最权威的那批**。

## 已入册

**当前已发现且能按来源现成 `RAW-nnn(#n)` 直接抽取的身份均已入册**，共 307 条叶子。这个结论不把 102 条无父 RAW 的来源锚点冒充需求，也不包含无稳定边界的散文。`validate:requirements` 同时核验需求登记、来源锚点目录和唯一全局当前产品真值；任一来源、哈希、数量、关联或当前权威正文漂移都会失败。

| 域 | 来源 | 形态 | 叶子 | active | superseded |
| --- | --- | --- | ---: | ---: | ---: |
| `companion-codex` | [codex-quota-float](../260718/1148-codex-quota-float/raw-requirement.md#L1) | bullet | 152 | 134 | 18 |
| `companion-claude` | [claude-code-companion-authority-reset](../260807/claude-code-companion-authority-reset/raw-requirement.md#L1) | table | 32 | 32 | 0 |
| `companion-claude` | [install-runtime-diagnostics RAW-174](../260810/1155-install-runtime-diagnostics/raw-requirement.md#L120) | heading + numbered | 7 | 7 | 0 |
| `companion-shared` | [install-runtime-diagnostics](../260810/1155-install-runtime-diagnostics/raw-requirement.md#L1) | heading | 6 | 6 | 0 |
| `companion-shared` | [install-runtime-diagnostics numbered clauses](modules/companion-shared.md#L1) | registered-parent numbered | 82 | 82 | 0 |
| `companion-shared` | [companion-task-topology-v5](../260823/companion-task-topology-v5/raw-requirement.md#L1) | heading + normalized table | 1 | 1 | 0 |
| `companion-shared / engineering-invariants` | [codex-tab-boundary-optimization](../260823/codex-tab-boundary-optimization/raw-requirement.md#L1) | heading + numbered | 9 | 9 | 0 |
| `companion-codex` | [companion-quick-task-view](../260813/1455-companion-quick-task-view/raw-requirement.md#L1) | heading + numbered | 4 | 4 | 0 |
| `interaction-shell` | [quick-jump-center-overlay](../260718/0947-quick-jump-center-overlay/raw-requirement.md#L1) | bullet | 4 | 4 | 0 |
| `file-favorites` | [file-favorites-workbench](../260711/1452-file-favorites-workbench/raw-requirement.md#L1) | heading | 2 | 2 | 0 |
| `companion-codex` | [float-search-status-compact](../260817/0859-float-search-status-compact/raw-requirement.md#L1) | prose | 1 | 1 | 0 |
| `companion-codex` | [float-action-hint-popover](../260817/1618-float-action-hint-popover/raw-requirement.md#L1) | prose | 1 | 1 | 0 |
| `engineering-invariants` | [install-runtime-diagnostics draft](../260810/1155-install-runtime-diagnostics/raw-requirement-next.draft.md#L1) | heading | 6 | 0 | 0（全部 `proposed`） |

两处需要单独说明：

- `RAW-131` 在 codex-quota-float 内出现两次，第二次明确标注为 implementation clarification，因此并入同一条叶子的 `Clarifications`。**重复的编号不代表重复的需求。**
- `RAW-165` 与 `RAW-166` 标为 `agent-transcribed`：本会话开头以 `git show HEAD:` 核实，当时 HEAD 的 raw-requirement.md 止于 RAW-164，这两节由实现者在同一次「宣布已达标」的未提交改动中写入。冲突时转述不得自动胜过用户原话。

install-runtime-diagnostics 的 `companion-shared` 六条是**章节级**登记；RAW-176 以一个父条款登记，当前正文由同一 Controlled ledger 的 V6 corrective revision 承载。前六节下的编号条款（共 82 条）后续已按 2026-08-15 裁决入册，见下文。

## 2026-08-15 裁决与历史重测：无 id 条款分两类，不是一类

原先「约 80 条无编号条款待裁决」把两种结构不同的东西并成了一类。以下 172/87 是 2026-08-15 当时的人工快照，不再作为当前总数：

| 类 | 条数 | 身份来源 | 入册是否属撰写 |
| --- | ---: | --- | --- |
| A：编号条款位于**已登记 RAW 标题**之下 | **82** | 父 id 与序号**都是来源文档自己写的** | 否，是抽取 |
| B：无任何已登记父 id | **87** | 不存在 | 是，会创造新引用锚点 |
| （另 3 条）父 RAW 未入册 | 3 | 见下 | 同 B |

用户 2026-08-15 裁决：**A 类入册，每条一个叶子；B 类保持现状。**

### A 类：88 条已入册

全部来自 [install-runtime-diagnostics](../260810/1155-install-runtime-diagnostics/raw-requirement.md#L1)，落在七个已登记且 `active` 的父条款之下：

| 父条款 | 全局序号区间 | 条数 | authority | 域 |
| --- | --- | ---: | --- | --- |
| [RAW-160](shared-raw-160.md#L1) | #1–#43 | 43 | `user-stated` | companion-shared |
| [RAW-162](shared-raw-162.md#L1) | #44–#49 | 6 | `user-stated` | companion-shared |
| [RAW-163](shared-raw-163.md#L1) | #50–#55 | 6 | `user-stated` | companion-shared |
| [RAW-164](shared-raw-164.md#L1) | #56–#64 | 9 | `user-stated` | companion-shared |
| [RAW-165](shared-raw-165.md#L1) | #65–#75 | 11 | `agent-transcribed` | companion-shared |
| [RAW-166](shared-raw-166.md#L1) | #76–#82 | 7 | `agent-transcribed` | companion-shared |
| [RAW-174](claude-raw-174.md#L1) | #89–#94 | 6 | `user-stated` | companion-claude |

#83–#88 被 [raw-requirement-next.draft.md](../260810/1155-install-runtime-diagnostics/raw-requirement-next.draft.md#L1) 占用为 `proposed` 工程不变量，本增量跳过以免撞号。RAW-173 属于另一任务。

**序号是全文档全局连续的**，不是每个 RAW 各自从 1 开始。#89–#94 继续该文档序列。A 类 82 → **88** 条编号叶子。交叉核对仍以 [冲突登记](conflict-register.md#L1) 的「RAW-163 第 50–53 条」为据：#50–#53 恰好就是那四条。

每条继承父条款的 `status` 与 `authority`。RAW-174 父条款为 `user-stated`（2026-08-17 缺陷核验 + D2），子条款同样继承；与更早 `agent-transcribed` 父条款冲突时，转述不得压过原话。

登记总量 196 → 284 → 292 → 293 → 294 → 298 → 302 → **307** 条叶子：RAW-176 增加一个父叶子；此前补入 RAW-167 父叶子及 #1–#3、RAW-177 父叶子及 #1–#3；当前再登记 RAW-178 父叶子及 #1–#4。`RAW-176-01..14` 是该父条款内部的 Controlled 归一化寻址，不符合现有 `SPEC::RAW-nnn(#n)` 登记身份，因此不另造 14 个叶子。

### 由此可以做而此前做不到的事

覆盖账此前记录：局部取代（47）是整条取代（18）的 2.5 倍，而「这条里还有哪部分作数」恰恰是登记答不上来的。**那是因为登记无法寻址子条款。** 已于同日升级——但实测只有 6 条指向可寻址父条款，其余 41 条的 scope 是语义面而非条款子集，本就处在最精确形态。逐条回源还更正了一处：散文区间「第 50–53 条」多框了一条。详见 [冲突登记](conflict-register.md#L1)。

### B 类：历史 87 条保持现状

当时识别为散在 13 个任务；最大的两处是 [codex-environment-actions](../260729/1435-codex-environment-actions/raw-requirement.md#L1)（39 条）与 [window-jump-workbench](../260724/1527-window-jump-workbench/raw-requirement.md#L1)（8 条）。它们没有任何父 id，且序号会跨小节重启，不能用扁平序号冒充需求身份。

## 2026-08-23 当前机器复测：102 条来源锚点

当前目录扫描得到 200 条围栏外有序来源条款：98 条位于单一 RAW 父标题下且全部已登记；另外 **102 条分布在 14 个任务**，没有 RAW 父身份。历史 87/13 不是可复现真值，主要遗漏了后续 Cursor 与 selector-readiness 等来源。

这 102 条现在由 [catalog.json](../source-anchors/catalog.json#L1) 以 `source_path + heading_path + native marker + occurrence` 生成稳定 `SA-*` 身份，并保存条款哈希用于漂移检查。目录只解决「如何准确回到来源」，不替代「它是否是当前需求、属于哪个模块、与谁冲突」的语义裁决；当前统一标为 `source-addressable-not-registered`。

### RAW-167 漏项：本次已补齐

[companion-quick-task-view](../260813/1455-companion-quick-task-view/raw-requirement.md#L1) 的 H1 `RAW-167` 与 install-runtime-diagnostics 曾使用的同号需求属于**不同任务**。本次按既有 `SPEC-<任务>::RAW-nnn` qualified identity 补入父叶子，并按来源已经写下的 #1–#3 序号抽取三条同轮追加需求；没有创造新编号或新语义。其余未编号的规范化 bullets 继续由父叶子与来源正文承载，不伪造独立叶子。

## 仍未入册

| 来源 | 形态 | 条目 | 阻塞原因 |
| --- | --- | ---: | --- |
| 14 个任务的围栏外有序条款 | numbered | 102 | 已有 `SA-*` 来源锚点；无父 RAW，尚未逐条确认需求语义与模块 |
| 其余 5 个任务 | 散文 | — | 无可抽取的条款边界 |
