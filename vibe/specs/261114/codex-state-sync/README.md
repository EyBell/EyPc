# Codex 状态改造统筹入口

沿用 EyPc 的 `SPEC-261114-CODEX-STATE-SYNC`。查看当前状态和下一批工作，打开[分批计划与执行进度](delivery.md#current)。原八条风险见[首轮验收表](delivery.md#risk-map)。待继续及并行主子对话的复核见[原生状态一致性方案](native-status-parity-plan.md)。

本专题落实此前长任务约定中的三个决定。原任务根长期保留，后续工作追加批次，每批各自记录交付和验收。原需求、宿主恢复方案及现场调查继续在原文维护。项目入口可从当前构建记录回到本页。[原讨论的 R56 决定](../../../../../../../czz/CzzProj/CodeNote/vibe/specs/2611/261105/1332-orchestration-continuity/history.md#L48) · [批次单独关闭的决定](../../../../../../../czz/CzzProj/CodeNote/vibe/specs/2611/261105/1332-orchestration-continuity/history.md#decision-d59-03) · [长任务目录约定](../../../../../../../czz/CzzProj/CodeNote/AiRef/VibePractice/Vibe_Rules/process/rules.md#long-task-documentation) · [EyPc 项目状态](../../PROJECT_STATUS.md#L3)

<a id="catalog"></a>

## 文档目录

<!-- task-document-catalog:start -->

| ID | 标题 | 职责 | 类别 | 状态 | 说明 | 标签 |
| --- | --- | --- | --- | --- | --- | --- |
| V7-NAV | [Codex 状态改造统筹入口](README.md) | 导航 | 统筹 | 现行 | 从原需求进入设计、分批进度、规则和查询方法。 | 统筹、SQLite、文档索引 |
| V7-SPEC | [Codex 数据与状态同步需求](raw-requirement.md) | 需求 | 需求 | 混合 | 原需求、范围调整、S01–S10 验收及专题边界。 | 需求、验收、兼容 |
| V7-DESIGN | [V7 任务状态统一改造方案](v7-state-redesign-plan.md) | 交付 | 架构方案 | 现行 | 两次分发、一处业务裁决，以及 R1–R8 的触发顺序和失效条件。 | V7、状态判断、风险 |
| V7-DELIVERY | [分批计划与执行进度](delivery.md) | 交付 | 执行进度 | 现行 | 唯一当前进度。按批次和风险记录范围、依赖、验收差异、证据及下一步。 | 计划、执行进度、验收 |
| V7-FIELD | [状态调查与实机事件记录](status-read-investigation-261116.md) | 证据 | 现场证据 | 混合 | 保留调查、原生事件、成员证据、构建、握手、发布与应用的实际观察。 | 实机、握手、时延 |
| V7-RECOVERY | [宿主证据恢复与分段计时](host-evidence-recovery-plan.md) | 验证 | 宿主恢复 | 混合 | 前序恢复设计、已交付的局部改动、取证方法和当时的验收边界。 | 补读、时延、宿主 |
| V7-RULES | [规则提取与适用范围](rule-extraction.md) | 交付 | 规则提取 | 现行 | 项目判断、现行依据、连接换代后的候选和可供跨项目复用的表述。 | 规则、候选、适用范围 |
| V7-META | [文档身份与关系声明](documents.json#L1) | 元数据 | 索引声明 | 现行 | 任务内 SQLite 和导航的元数据来源，保存关系方向和原事件定位。 | 元数据、SQLite |
| V7-PARITY | [Codex 原生状态一致性复核与改造方案](native-status-parity-plan.md) | 交付 | 架构方案 | 现行 | 对照官方协议、现场与 V7 源码，登记待继续、主子并发、连接换代与状态证据恢复方案。 | 原生一致性、待继续、主子对话 |

<!-- task-document-catalog:end -->

原需求及历史范围调整见规格。架构方案说明各环节判断什么、何时失效。宿主恢复方案和现场记录保留前序修复与实机事实。交付台账是计划和进度的唯一更新位置。规则提取页说明哪些项目经验可引用，哪些差异还在评审。[产品现行约定](../../PRODUCT_REQUIREMENTS.md#L259) · [已登记需求](../../requirements/codex-state-sync-raw-001.md#L1)

<a id="lookup"></a>

## SQLite 查询与回源

从 EyPc 仓库根使用 CodeNote 的 query_structured_assets.py。固定参数为 `--asset task-documents`、`--root "$PWD"`、`--task-root vibe/specs/261114/codex-state-sync`。下表给出各查询的附加参数。项目入口已有完整工具路径，查询本专题时使用这里的任务根。[EyPc 本机查询入口](../../../rules/documentation.md#文档关联-sqlite-试点) · [查询参数与生成顺序](../../../../../../../czz/CzzProj/CodeNote/docs/architecture/STRUCTURED-QUERY.md#task-document-index)

| 序号 | 想查什么 | 附加参数 | 去哪里看正文 |
| --- | --- | --- | --- |
| 1 | 某条风险归哪一批，如何验收 | `--collection relations --id V7-R4` 或 `--collection relations --id V7-R15` | R1–R8 返回原交付验收行，R9–R15 返回原生复核风险条目。各条可回查批次、方案和依据。 |
| 2 | 查看某次架构复核的全部风险 | `--collection relations --related-to V7-DESIGN --direction in --relation-type depends-on` 或 `--collection relations --related-to V7-PARITY --direction out --relation-type related` | 分别返回初次架构复核的八条风险，以及原生一致性复核的七条风险。 |
| 3 | 哪份文档管进度，哪些文档记录现场 | `--collection documents --id V7-DELIVERY` 或 `--collection documents --role evidence` | 返回原文件的相对路径。查询批次 B02 时直接打开台账的 `#b02`。 |
| 4 | 哪些原事件影响了当前交付 | `--collection updates --related-to V7-DELIVERY` | 按事件的 `source_ref` 回到原记录。查现场沿用 `V7-FIELD`。 |
| 5 | Codex 更新后有哪些实机差异及后续批次 | `--collection updates --id V7-E21` 或 `V7-E22`。用 `--collection relations --id` 检索 `V7-R24` 至 `V7-R26`、`V7-B07` 至 `V7-B09`。 | [同轮对照](status-read-investigation-261116.md#post-codex-update-261120) · [分批台账](delivery.md#post-update-batches) |
| 6 | 重开后置顶与待输入如何变化，续修到了哪一步 | `--collection updates --id V7-E23` 或 `V7-E24`。用 `--collection relations --id` 检索 `V7-R27`、`V7-R28`。 | [新基线与时延](status-read-investigation-261116.md#reopen-parity-261120) · [续修设计](native-status-parity-plan.md#reopen-parity-plan-261120) · [交付回执](delivery.md#event-reopen-parity-build-261120) |

Markdown 正文持有需求、决定、实际进度和证据。`documents.json` 只维护文档身份、分类、声明关系及事件定位。SQLite 在当前工作树的 Git 私有目录按任务根生成，换检出后可从文档重建。新增材料先更新正文及目录声明，再依次使用 `--render-navigation`、`--build-index`、`--summary`。普通查询只读。`missing_index`、`stale_index` 或 `index_mismatch` 出现时，先读正文并核对本专题的数据源。仓外规则、项目知识和源码沿正文链接访问。[关系声明](documents.json#L1) · [结构化资料的主源约定](../../../../../../../czz/CzzProj/CodeNote/AiRef/VibePractice/Vibe_Rules/process/documentation-impact.md#structured-asset-projections)
