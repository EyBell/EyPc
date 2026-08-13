# EyPc Requirement Registry

<!-- adaptive-document-index: root-v1 -->

本目录是当前产品需求的**唯一可机检登记**。它不重写历史：每条叶子只引用其来源任务文档，正文仍由该任务的 `raw-requirement.md` 保存。产品当前语义仍由 [PRODUCT_REQUIREMENTS](../PRODUCT_REQUIREMENTS.md#L1) 与当前 Controlled 任务决定，登记提供的是路由、状态与取代关系。

## 为什么需要它

`RAW-nnn` 编号是**任务局部的**，不是全局唯一的：`RAW-001` 在三个任务里是三个互不相干的需求。因此登记以 `qualified_source`（`SPEC-<任务>::RAW-nnn`）作为身份，编号本身不具备身份意义。

取代关系此前只以散文写在各自文档里（「已由 RAW-164 取代」），无法机检，也无法回答「这条现在还作数吗」。

## 生命周期

| 状态 | 含义 | 可作为当前实现依据 |
| --- | --- | --- |
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

| 模块 | 唯一主责范围 |
| --- | --- |
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

运行 `pnpm run validate:requirements` 检查 frontmatter、状态、`qualified_source` 唯一性、取代边成对性、取代环、模块唯一归属与容量。

## 尚未入册

见 [覆盖账](coverage.md#L1)。12 个任务的需求以**无编号的编号条款**承载，没有 `RAW-nnn` 可作身份；为其分配编号属于需求撰写而非抽取，需用户决定后再入册。
