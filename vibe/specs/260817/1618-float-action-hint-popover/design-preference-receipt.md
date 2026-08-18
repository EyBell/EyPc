# 设计偏好查询回执

Tool: cursor · Date: 2026-08-17
Gate: `design-preference-gate: accepted`（[vibe/rules/README.md](../../../rules/README.md#L5)）

RAW: [raw-requirement.md](raw-requirement.md#L1) · Spec: [spec.md](spec.md#L1)

本回执在改行为之前产出。查询：`--surface codex-companion`，类别 `interaction-input / content-information / layout-responsive / accessibility / typography / motion-feedback / product-context / visual-taste`，`user_choice=task-only`。`gate_status=ready-for-ui-skill`，`coverage_complete=true`，无缓存候选、无冲突。

## 命中权威

全部稳定命中 [developer-soul.md](../../../knowledge/developer-soul.md#L1) Codex Companion Taste：

| 条目 | 本轮用法 |
| --- | --- |
| `eypc-codex-content-information` | 状态/短按钮走同一不透明提示层；确认文案也进这一层 |
| `eypc-codex-layout-responsive` | `stable-top-controls`：确认不得再插入额度与列表之间的整行 |
| `eypc-codex-interaction-input` | 不增加常驻行高，不推动列表几何 |
| `eypc-codex-accessibility` | 按钮 `aria-label` + 隐藏 live region；气泡 `role=tooltip` |
| `eypc-codex-motion-feedback` | 悬停仍 200ms；确认立即出现，无新动画 |
| `eypc-codex-visual-taste` | 尖头对齐主窗语言对话框，深色底保持浮窗自有层 |

省略：`color-theme` / `design-system` / `platform-ui-architecture` / `performance-media`。

## UI Skill

不另选 ui-skills。`baseline-ui` 默认 Tailwind，与现有 `float.css` 冲突。视觉只对齐 [OperationTooltipLayer.vue](../../../../src/components/OperationTooltipLayer.vue#L1) 的尖头，不引入该层。

## 与现行偏好的对齐

- 悬停走浮窗自有 200ms 层，确认走同一层的立即粘性气泡。
- 不用原生 `title`，不挂主窗 Tooltip。
- 气泡按展开卡夹紧，上/下、居中或左右，尖头对准锚点。
