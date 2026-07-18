# EyPc 跨页面响应式命令面板实施计划

Tool: codex

## 阶段

1. 建立 Controlled 台账并补关键 RED 回归。
2. 实现共享 Tooltip 与 Quick Jump 尺寸/视觉合同。
3. 统一详情/动作目标、快捷键和焦点恢复，修复 MQTT 已确认缺陷。
4. 完成四个 Tab 与 Quick Favorites 响应式布局。
5. 自动化、真实浏览器矩阵、文档/记忆与 Sidecar 收口。

## Execution Topology

| Work Unit | Owner | Surface | Mode | Allowed / Excluded Scope | Output Contract | Verification Owner | Fallback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WU-ROOT-IMPLEMENT | App Root | main | write-owner | 代码、测试、任务/权威文档；排除高风险与外部写入 | 可运行实现、完整门禁和最终接纳 | App Root | 缩小到失败边界并保留 gap |
| WU-RUNTIME-AUDIT | App Root | native-thread | read-only | 目标模型、快捷键、输入 ownership；不得写文件 | 增量证据、测试缺口和 doc drift | App Root | Root 直接核验 |
| WU-UI-CLOSEOUT | App Root | native-thread | read-only | 最终响应式、Tooltip、ARIA、文档复核；不得写文件 | P0/P1 findings 与接纳建议 | App Root | Root 完整复核 |

Delegation benefit：只读审计隔离大文件与跨 Tab 影响面，Root 保持唯一写 owner；只有 Root 复现的净增量发现才接纳，usage 不可用时不估算收益。

## Authority Packet

- Authority: [spec.md](spec.md#L1)、[PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L1)、[ARCHITECTURE.md](../../../knowledge/ARCHITECTURE.md#L1)、[Developer Soul](../../../knowledge/developer-soul.md#L1)。
- Known constraints: Vue 3 + TypeScript + Vite、Runtime Action 唯一可见 mutation 边界、编辑输入优先、保留脏树、无高风险写入。
- Required evidence: Runtime/keybinding tests、组件行为、真实浏览器矩形/滚动/截图、Root diff 与文档审计。
- Documentation impact: `requirement-canonical + project-current + error-memory`。

## Verification Decision

- Route: `focused-automated + live-ui`。
- Reason: 共享交互合同需要 Runtime/组件测试，遮挡与滚动必须由真实浏览器暴露。
- Owner: Root。
- Skipped: 真实端口终止、文件系统变更、外部 MQTT、Windows/Linux 宿主。
- Residual risk: macOS uTools UI smoke 与 Windows/Linux 宿主仍需真实环境。

## Evolution Candidate

- `none`：本轮为 EyPc 项目级交互合同；未形成跨项目新规则。

