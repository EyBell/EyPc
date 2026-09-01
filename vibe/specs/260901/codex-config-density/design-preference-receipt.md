# 设计偏好查询回执

Tool: grok · Date: 2026-09-01
Gate: `design-preference-gate: accepted`（[vibe/rules/README.md](../../../rules/README.md#L5)）

RAW: [raw-requirement.md](raw-requirement.md#L1) · Spec: [spec.md](spec.md#L1)

本回执在改行为之前产出。工作性质：Codex 配置页信息密度、图标与单行排版，属于中型 UI/配置工作。沿用现有 Codex 页与主窗 Tooltip 语言，不另选外部 UI Skill。

## 命中权威

全部稳定命中 [developer-soul.md](../../../knowledge/developer-soul.md#L1) Codex Companion Taste：

| 条目 | 本轮用法 |
| --- | --- |
| `eypc-codex-content-information` | 当前状态常显；说明性文案与健康噪声进 i / 隐藏 |
| `eypc-codex-layout-responsive` | 能一行就一行；芯片换行，不回到挤压三列条 |
| `eypc-codex-interaction-input` | 例行刷新仍静默；路径输入与三个动作保留 |
| `eypc-codex-accessibility` | live region 只在 warning/error；详情始终可聚焦 |
| `eypc-codex-visual-taste` | 小图标、紧凑内边距、不透明提示层 |

## 选定 / 回避

- 选定：页眉单行、诊断头单行、路径单行、健康事实芯片、warning/error 才展开。
- 回避：十张两行卡片、连接位置重复标题、ready 态常显长说明、19px 状态图标。

## UI Skill

不另选外部 UI Skill。沿用现有 Codex 配置页与 [OperationTooltipLayer.vue](../../../../src/components/OperationTooltipLayer.vue#L1)。
