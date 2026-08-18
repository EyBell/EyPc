# 设计偏好查询回执

Tool: cursor · Date: 2026-08-17
Gate: `design-preference-gate: accepted`（[vibe/rules/README.md](../../../rules/README.md#L5)）

RAW: [raw-requirement.md](raw-requirement.md#L1) · Spec: [spec.md](spec.md#L1)

本回执在改行为之前产出。查询：`--surface codex-companion`，类别 `interaction-input / content-information / layout-responsive / accessibility / typography / motion-feedback / product-context`，`user_choice=task-only`。`gate_status=ready-for-ui-skill`，`coverage_complete=true`，无缓存候选、无冲突。

## 命中权威

全部稳定命中 [developer-soul.md#codex-companion-taste](../../../knowledge/developer-soul.md#L1)：

| 条目 | 本轮用法 |
| --- | --- |
| `eypc-codex-content-information` | 状态/短按钮 200ms 不透明提示；过期句进同一层 |
| `eypc-codex-layout-responsive` | `stable-top-controls`：取消额度与列表之间的整行，避免列表顶边随状态跳动 |
| `eypc-codex-typography` | 计数 9px，搜索 12px |
| `eypc-codex-accessibility` | `!` 字符作非颜色线索；按钮 `aria-label` + 隐藏 live region；不靠颜色单独表达过期 |
| `eypc-codex-interaction-input` | 不增加常驻行高，不推动列表几何 |
| `eypc-codex-motion-feedback` | 沿用现有 200ms，无新动画 |
| `eypc-codex-product-context` | 近实时状态仍可见，只是改落点 |

省略：`visual-taste` / `color-theme`（复用现有 token）、`design-system`（不新建组件体系）、`platform-ui-architecture`（浮窗子窗口 owner 不变）、`performance-media`（无媒体资源）。

## UI Skill

不另选 ui-skills。`baseline-ui` 默认 Tailwind，与现有 `float.css` 冲突。实现复用浮窗搜索栏、`queueActionHint` 和 9px 辅助字。

## 与现行偏好的对齐

- 悬停走浮窗自有 200ms 层，不引入 `OperationTooltipLayer`，不用原生 `title`。
- `!` 只在异常时替换放大镜，常态不增加 Tab 停靠；异常/重叠时按钮可聚焦，与额度 Claude chip 的「需要时才进焦点序」同类。
- 配置页展开卡预览同步为「左占位 + 右计数」，避免预览与运行时漂移。
