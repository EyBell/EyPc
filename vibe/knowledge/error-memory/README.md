# EyPc Error Memory

<!-- adaptive-document-index: root-v1 -->

本目录只保存可复用的失败边界、正确检测顺序和已验证替代路线。产品当前语义由 [PRODUCT_REQUIREMENTS](../../specs/PRODUCT_REQUIREMENTS.md#L1)、当前 Controlled 任务与 [ARCHITECTURE](../ARCHITECTURE.md#L1) 决定；错误记录不能反向覆盖它们。

## 消解流程

| 状态 | 含义 | 可作为当前自动路线 |
| --- | --- | --- |
| `candidate` | 根因或替代路线仍待验收 | 否 |
| `verified` | 根因与替代路线均已通过适用边界内的验证 | 是，但过期后必须先复核 |
| `superseded` | 新合同或更准确记录已取代；仅保留回流门禁 | 否 |
| `retired` | 不再适用且没有当前替代价值；仅保留审计线索 | 否 |

同一根因只保留一个稳定 fingerprint；重复发生时更新该叶子的 `Occurrence History`。相似症状但证据边界不同的记录不强行合并。物理移动、删除或改名不是归档前提，Git 路径保持稳定。

## 模块路由

| 模块 | 唯一主责范围 |
| --- | --- |
| [Companion Task State](modules/companion-task-state.md#L1) | phase、Turn/Goal 因果、root/Side、unread、membership、Kernel package 与推送 |
| [Claude Companion](modules/claude-companion.md#L1) | Claude inventory、App phase、原生 unread、open 与 archive authority |
| [Companion Actions And Presentation](modules/companion-actions-and-presentation.md#L1) | task actions、archive guard、标签、选中、主题与外部写入 |
| [Window Jump And Native Host](modules/window-jump-and-native-host.md#L1) | 原生窗口身份、Space、root/member、槽位与激活 |
| [Interaction And Favorites](modules/interaction-and-favorites.md#L1) | command target、focus、keyboard、tooltip 与 favorites |
| [Runtime And Packaging](modules/runtime-and-packaging.md#L1) | GUI 环境、preload、runtime identity、打包、native addon 与宿主生命周期 |
| [Engineering Contracts](modules/engineering-contracts.md#L1) | 数据合同、测试、类型、文档权威、审计与安全写入 |

每个叶子必须恰好出现在一个模块的 `Primary Error Records`，最多在两个模块作为 Related；模块不复制事实正文。

## 冲突门禁

1. 先比较当前需求、架构和 Provider 实证，再读取历史错误；“较晚读取”不等于“因果更新”。
2. 若历史记录与当前合同冲突，先标注 `superseded` 或保持 candidate，不得把旧替代路线拼回生产判断。
3. 若两个仍可能成立的当前语义会导向不同用户行为，停止合并并提交明确的冲突选项给用户决断。
4. 若只是不同层级，保留单一最终裁决 owner：Provider 适配器产证据，Kernel 裁决，Renderer 只投影，ACK 只证明消费后置条件。

## 机器校验

运行 `pnpm run validate:error-memory` 检查 frontmatter、状态、日期、fingerprint、链接、模块容量、唯一 Primary 和 Related 上限。过期 candidate/verified 只告警，不会被校验器自动提升、续期或删除。

## Historical Or Migration Sources

- [Legacy project error-memory entry](../error-memory.md#L1) 仍是旧任务入口；其中未结构化事实只作迁移来源，不进入自动 recall。
- 任务目录中的历史判断由各自 verify/handoff 保存；当前索引只提供路线，不复制过程文档。
