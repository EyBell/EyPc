# EyPc 文件收藏工作台实施计划

Tool: codex

## 阶段

1. 建立 Controlled 台账、复用旧基线并补 RED 回归。
2. 实现收藏图、路径比较键和结构化平台桥接。
3. 实现 Runtime 目标优先级、快捷键、撤销和目录交互。
4. 完成 Vue UI、响应式、ARIA、焦点与组件行为测试。
5. 完整门禁、页面 smoke、文档/记忆/Sidecar 收口。

## Execution Topology

| Work Unit | Owner | Surface | Agent/Profile | Mode | Dependencies | Allowed / Excluded Scope | Output Contract | Verification Owner | Fallback |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WU-ROOT-IMPLEMENT | App Root | main | Sol/Root | write-owner | none | 项目代码、测试、任务和权威文档；排除真实文件修改/DB/发布 | 可运行实现、测试、文档和最终接纳 | App Root | 缩小到失败边界并保留 gap |
| WU-SIDECAR-START | App Root | native-thread | Terra/read-only | explorer | 规则预检 | 只读规则、hub、历史、记忆；禁止写入 | Sidecar 六字段与重叠结论 | App Root | 主线程复核 |
| WU-PLATFORM-RUNTIME-AUDIT | App Root | native-thread | Terra/read-only | explorer | 现有代码 | 只读平台、Runtime、测试；禁止写入 | 修改图、RED 矩阵、兼容风险 | App Root | 主线程静态审计 |
| WU-UI-A11Y-AUDIT | App Root | native-thread | Terra/read-only | explorer | 现有 UI | 只读 Vue/CSS/测试；禁止写入 | P0/P1 差距与组件测试建议 | App Root | 主线程 UI Skills 审计 |

预期收益：三个只读单元并行降低规则、平台矩阵和无障碍清单对主实现上下文的干扰；只有其证据被主线程复核且减少返工时才视为有效，不能据模型名称推断 Token 节省。

### Optimization Continuation / Work-order Version 2

| Work Unit | Owner | Surface | Mode | Scope | Acceptance |
| --- | --- | --- | --- | --- | --- |
| OPT-RUNTIME-PLATFORM-01 | App Root | native-thread | read-only | 权限元数据、特殊目录项、条件式撤销上下文 | Root 复现、补测试并接纳 |
| OPT-UI-CSS-01 | App Root | native-thread | read-only | pane DOM focus、active descendant、确认层恢复、窄屏错误反馈 | Root 组件与真实浏览器重验后接纳 |
| CLOSEOUT-REVIEW-02 | App Root | native-thread | read-only | 最新 diff、验证和文档一致性 | Root 独立复核后决定最终 accepted |

`RAW-002` 只授权清理意外工作区文件并继续既有范围优化；不新增真实文件管理、DB、发布或宿主权限范围。收藏 CSS cascade anchors 因仍承担末端覆盖与独有规则，本轮保留，后续模块化需独立验证。

## 验证路由

- 主路由：`focused-automated`，先目标测试再全量门禁。
- UI 路由：`live-ui`，用本地页面验证四个视口、焦点恢复和状态；若宿主或浏览器工具不可用，明确标记未验证。
- 宿主路由：当前 macOS uTools 仅在安全可控时做打开/定位/复制 smoke；Windows/Linux 为 `user-owned` 实机待验。

## Documentation Realization

- 任务/机制设计：[spec.md](spec.md#L1)、本计划与 [tasks.md](tasks.md#L1)。
- 用户需求与权威合并：[raw-requirement.md](raw-requirement.md#L1) → [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L1) → [requirements-traceability.md](requirements-traceability.md#L1)。
- 错误闭环：确认坏图和快速入口旧目标后更新 [error-memory.md](../../../knowledge/error-memory.md#L1)，最终验证见 [verify.md](verify.md#L1)。

## Evolution Candidate

| Evidence | Candidate | Target | Promotion Condition | Risk | Decision |
| --- | --- | --- | --- | --- | --- |
| 当前方案已由项目既有规则覆盖 | 无新增全局流程规则 | none | 出现跨项目重复证据时再评估 | low | `none` |
| 项目 AI-rule 审计显示 adapter/hub 与当前母版存在既有漂移 | 项目规则适配补齐 | EyPc project rules/status hub | 独立治理任务确认范围并按母版传播门禁实施 | medium | `candidate-only / deferred`；不在本产品任务扩面 |
