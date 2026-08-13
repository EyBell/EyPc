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

## 尚未入册

| 来源 | 形态 | 条目 | 阻塞原因 |
| --- | --- | ---: | --- |
| install-runtime-diagnostics 的节内条款 | numbered | 82 | 无独立 id |
| 其余 12 个任务 | numbered | ~80 | 无独立 id |
| 其余 5 个任务 | 散文 | — | 无可抽取的条款边界 |

## 待用户裁决

约 80 条需求以**无编号的编号条款**承载（`1. …` `2. …`），它们没有 `RAW-nnn` 可作身份。为其分配编号是**需求撰写行为**，不是抽取行为——它会创造此前不存在的引用锚点，并可能与将来手写的编号冲突。因此这批在得到明确决定之前不入册。

可选路线：

1. 按任务分配 `SPEC-<任务>::CLAUSE-nn`，与 `RAW-nnn` 分开命名，明确其为登记侧派生身份。
2. 只入册当前仍约束代码的条款，其余留在来源文档。
3. 保持现状，登记只覆盖已有 id 的条款，这些任务通过 `coverage.md` 可见。
