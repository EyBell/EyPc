# EyPc Requirement Registry

<!-- adaptive-document-index: root-v1 -->

本目录是当前产品需求的**唯一可机检登记**。它不重写历史：每条叶子只引用其来源任务文档，正文仍由该任务的 `raw-requirement.md` 保存。

与 [PRODUCT_REQUIREMENTS](../PRODUCT_REQUIREMENTS.md#L1) 的分工：那里回答「这个功能现在应该怎样表现」，这里回答「某条条款现在还作数吗、还有哪部分作数、是谁说的」。两者不互相复制正文。

## 为什么需要它

`RAW-nnn` 编号是**任务局部的**，不是全局唯一的：`RAW-001` 在三个任务里是三个互不相干的需求。因此登记以 `qualified_source`（`SPEC-<任务>::RAW-nnn`）作为身份，编号本身不具备身份意义。

取代关系此前只以散文写在各自文档里（「已由 RAW-164 取代」），无法机检，也无法回答「这条现在还作数吗」。

## 生命周期

| 状态 | 含义 | 可作为当前实现依据 |
| --- | --- | --- |
| `proposed` | 已写成条款但用户从未确认 | 否 |
| `active` | 当前有效 | 是 |
| `superseded` | 已被更新条款取代；保留为需求变化证据 | 否 |
| `retired` | 不再适用且无当前替代 | 否 |
| `conflicted` | 与另一条现行条款冲突且尚未裁决 | 否，必须先上报用户 |

## 权威来源

| 字段 | 含义 |
| --- | --- |
| `user-stated` | 用户直接提出 |
| `agent-transcribed` | 由实现者转述后写入 |

区分二者是因为实现者可以在同一次改动里既写需求又宣布达标。转述条款与用户原话冲突时，**转述不得自动胜出**。

## 模块路由

`proposed` 是自审补上的：最新一批条款由实现者转述且用户从未确认，而原有四个状态里没有一个能表达这件事——`active` 会让未经确认的转述冒充生效条款。

| 模块 | 唯一主责范围 |
| --- | --- |
| [Engineering Invariants](modules/engineering-invariants.md#L1) | 跨域结构性约束：判断唯一性、单点定义、零行为 diff 口径与防回归 |
| [Companion Codex](modules/companion-codex.md#L1) | Codex 额度、任务收件箱、悬浮球、Action Runner 与配置页 |
| [Companion Claude](modules/companion-claude.md#L1) | Claude 库存、相位、未读、归档与接入 |
| [Companion Shared](modules/companion-shared.md#L1) | 跨 Provider 的状态内核、包合同、诊断与运行身份 |
| [Interaction Shell](modules/interaction-shell.md#L1) | Quick Jump、快捷键、命令面板与全局交互 |
| [File Favorites](modules/file-favorites.md#L1) | 文件收藏工作台、槽位与快速打开 |

每条叶子必须恰好出现在一个模块的 `Primary Requirements`。模块不复制条款正文。

## 冲突门禁

1. 后写入的条款优先，前者转 `superseded` 并登记依据。
2. 采用后者会改变用户可见行为时，**停止自动消解并上报用户**。
3. `agent-transcribed` 与 `user-stated` 冲突时同样上报，不得自动采用转述。
4. 文字相似但证据边界不同的条款不合并。

## 机器校验

运行 `pnpm run validate:requirements` 检查 frontmatter、状态、`qualified_source` 唯一性、取代边成对性、取代环、局部关系目标有效性、模块唯一归属与容量，并校验 [Source Anchor Catalog](../source-anchors/README.md#L1) 与全部来源文档一致。

冲突核验记录见 [conflict-register](conflict-register.md#L1)。

## 尚未入册

见 [覆盖账](coverage.md#L1)。当前已发现且能按来源现成 `RAW-nnn(#n)` 直接抽取的身份均已入册；这不等于全文需求都已机器化。机器复测识别出 102 条没有 RAW 父身份的围栏外有序来源条款，它们已有稳定 `SA-*` 来源锚点，但仍不是登记叶子；只有逐条确认语义与模块后才可升级为 active requirement。
