# Requirement Registry Coverage

登记必须能回答「这条现在还作数吗」，所以也必须诚实回答「哪些还没进来」。一份看起来完整、实则只覆盖一部分的登记，比没有登记更危险。

Date: 2026-08-13

## 语料实测

23 个 `raw-requirement.md`，需求以**五种不同形态**承载：

| 形态 | 文件数 | 条目 | 可否按 `SPEC::RAW-nnn` 入册 |
| --- | ---: | ---: | --- |
| bullet `- \`RAW-nnn\` (…): 正文` | 2 | 157 | 可以 |
| table `\| RAW-nnn \| 状态 \| 正文 \|` | 1 | 32 | 可以 |
| heading `## RAW-nnn` | 3 | 10 | 可以 |
| numbered 无编号条款 `1. 正文` | 12 | ~80 | **不能，没有 id** |
| 纯散文 | 5 | — | 不能 |

同一个 bullet 文件内部还并存三种标注风格：ASCII 括号、全角括号加斜杠分隔的交付状态、以及裸散文限定语。`RAW-155` 之后的最新条款全部使用第二种——只认第一种的抽取器会**静默丢掉最新、最权威的那批**。

## 已入册

**所有带 id 的来源已全部入册**，共 196 条叶子。每个来源在生成时都断言「解析条数 == 源文件条数」，不足即拒绝注册——静默丢弃是批量抽取的常态失败，必须由结构拦住而不是靠事后核对。

| 域 | 来源 | 形态 | 叶子 | active | superseded |
| --- | --- | --- | ---: | ---: | ---: |
| `companion-codex` | [codex-quota-float](../260718/1148-codex-quota-float/raw-requirement.md#L1) | bullet | 152 | 134 | 18 |
| `companion-claude` | [claude-code-companion-authority-reset](../260807/claude-code-companion-authority-reset/raw-requirement.md#L1) | table | 32 | 32 | 0 |
| `companion-shared` | [install-runtime-diagnostics](../260810/1155-install-runtime-diagnostics/raw-requirement.md#L1) | heading | 6 | 6 | 0 |
| `interaction-shell` | [quick-jump-center-overlay](../260718/0947-quick-jump-center-overlay/raw-requirement.md#L1) | bullet | 4 | 4 | 0 |
| `file-favorites` | [file-favorites-workbench](../260711/1452-file-favorites-workbench/raw-requirement.md#L1) | heading | 2 | 2 | 0 |

两处需要单独说明：

- `RAW-131` 在 codex-quota-float 内出现两次，第二次明确标注为 implementation clarification，因此并入同一条叶子的 `Clarifications`。**重复的编号不代表重复的需求。**
- `RAW-165` 与 `RAW-166` 标为 `agent-transcribed`：本会话开头以 `git show HEAD:` 核实，当时 HEAD 的 raw-requirement.md 止于 RAW-164，这两节由实现者在同一次「宣布已达标」的未提交改动中写入。冲突时转述不得自动胜过用户原话。

`companion-shared` 的六条是**章节级**登记。每节下的编号条款（共 82 条）没有独立 id，与下述无 id 条款同属待裁决。

## 2026-08-15 裁决与重测：无 id 条款分两类，不是一类

原先「约 80 条无编号条款待裁决」把两种结构不同的东西并成了一类。按**是否存在已登记的父 id**重测，实为 **172 条，分两类**：

| 类 | 条数 | 身份来源 | 入册是否属撰写 |
| --- | ---: | --- | --- |
| A：编号条款位于**已登记 RAW 标题**之下 | **82** | 父 id 与序号**都是来源文档自己写的** | 否，是抽取 |
| B：无任何已登记父 id | **87** | 不存在 | 是，会创造新引用锚点 |
| （另 3 条）父 RAW 未入册 | 3 | 见下 | 同 B |

用户 2026-08-15 裁决：**A 类入册，每条一个叶子；B 类保持现状。**

### A 类：82 条已入册

全部来自 [install-runtime-diagnostics](../260810/1155-install-runtime-diagnostics/raw-requirement.md#L1)，落在六个已登记且 `active` 的父条款之下：

| 父条款 | 全局序号区间 | 条数 | authority |
| --- | --- | ---: | --- |
| [RAW-160](shared-raw-160.md#L1) | #1–#43 | 43 | `user-stated` |
| [RAW-162](shared-raw-162.md#L1) | #44–#49 | 6 | `user-stated` |
| [RAW-163](shared-raw-163.md#L1) | #50–#55 | 6 | `user-stated` |
| [RAW-164](shared-raw-164.md#L1) | #56–#64 | 9 | `user-stated` |
| [RAW-165](shared-raw-165.md#L1) | #65–#75 | 11 | `agent-transcribed` |
| [RAW-166](shared-raw-166.md#L1) | #76–#82 | 7 | `agent-transcribed` |

**序号是全文档全局连续的 1–82，不是每个 RAW 各自从 1 开始。** 这一点由交叉核对确证：[冲突登记](conflict-register.md#L1) 早已用「RAW-163 第 50–53 条」指称 main-first 展示门槛，而实测 #50–#53 恰好就是那四条。仓库既有散文用的就是这套寻址，本轮只是把它变成机器可读。

每条继承父条款的 `status` 与 `authority`——父条款是转述的，子条款同样是转述，冲突时不得压过原话。

登记总量 196 → **284** 条叶子。

### 由此可以做而此前做不到的事

覆盖账此前记录：局部取代（47）是整条取代（18）的 2.5 倍，而「这条里还有哪部分作数」恰恰是登记答不上来的。**那是因为登记无法寻址子条款。** 已于同日升级——但实测只有 6 条指向可寻址父条款，其余 41 条的 scope 是语义面而非条款子集，本就处在最精确形态。逐条回源还更正了一处：散文区间「第 50–53 条」多框了一条。详见 [冲突登记](conflict-register.md#L1)。

### B 类：87 条保持现状

散在 13 个任务，最大的两处是 [codex-environment-actions](../260729/1435-codex-environment-actions/raw-requirement.md#L1)（39 条）与 [window-jump-workbench](../260724/1527-window-jump-workbench/raw-requirement.md#L1)（8 条）。它们没有任何父 id，且序号在同一文件内**跨小节重启**（`Confirmed scope` 1–3 与 `Action Runner User Facts` 1–7 并存），扁平编号会撞号，按节限定又等于登记侧新造命名空间。这批继续通过本文件可见但不入册。

### 另 3 条：父 RAW 存在但未入册

[companion-quick-task-view](../260813/1455-companion-quick-task-view/raw-requirement.md#L1) 的 3 条编号条款挂在 H1 的 `RAW-167` 之下，但那个 `RAW-167` 与 install-runtime-diagnostics 的 `RAW-167` 是**不同任务的同号需求**——正是 `SPEC-<任务>::RAW-nnn` 这套身份要解决的碰撞。该任务的 RAW-167 本身尚未入册，因此其子条款按 B 类处理。

## 仍未入册

| 来源 | 形态 | 条目 | 阻塞原因 |
| --- | --- | ---: | --- |
| 13 个任务的编号条款 | numbered | 87 | 无已登记父 id；编号属撰写行为 |
| companion-quick-task-view | numbered | 3 | 父 `RAW-167` 未入册（与另一任务同号） |
| 其余 5 个任务 | 散文 | — | 无可抽取的条款边界 |
