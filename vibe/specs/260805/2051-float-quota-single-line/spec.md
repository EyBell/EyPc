# Spec — 展开卡额度区压成单行

Tool: claude (Cowork) · Date: 2026-08-05
RAW: [raw-requirement.md](raw-requirement.md#L1) · 偏好回执: [design-preference-receipt.md](design-preference-receipt.md#L1) · 验证: [verify.md](verify.md#L1)

## 目标状态

展开浮窗的额度区是**一个 section、一行**，`min-height: 30px` 固定，不随 Claude 是否接入而增减行数。

```
[5h 78%]  [周 23%]  │ Claude  [5h 70%]  [周 45%]
 ↑Codex 色                ↑Claude 色
```

- 可见：短标（`5h` / `周`，Spark 前缀 `S`）+ 百分比。
- 悬停 200ms：`Codex · 5 小时限额 · 3 小时后重置`（单来源时省略平台前缀）。
- 读屏：每块内有 `.sr-only`，内容为 `Codex 5 小时限额，剩余 78%，3 小时后重置`，不依赖悬停。
- 平台色：`--codex-quota-codex` / `--codex-quota-claude`，来自展开卡主题的两个新 token。

## 分层归属

| 层 | 归属 | 内容 |
| --- | --- | --- |
| `companionPresentation.ts` | 新增 | `buildCompanionQuotaStrip` / `companionQuotaChipHint` / `companionQuotaChipAriaLabel`。谁属于哪个平台、什么时候该显示平台标、短标怎么写 —— 三件都是策略，都在这里。以纯输入接收 Codex 窗口，因此**不 import `codex.ts`**。 |
| `codexAppearance.ts` | 新增 | `defaultCompanionQuotaTones` + 两个 CSS 变量 + `CodexSurfaceTheme` 两个字段。 |
| `codex.ts` | 修改 | `CodexExpandedCardAppearanceSettings` 两个新字段 + 默认值 + 归一化（旧配置自动补默认，无迁移脚本）。 |
| `FloatApp.vue` | 修改 | 只做渲染与 hover 接线，复用既有 `queueActionHint / clearActionHint`。 |
| `CodexPage.vue` | 修改 | 「卡片」分区新增「额度读数」控件组；预览同步成同一形态、吃同两个 token。 |

## 关键取舍

1. **短标而非纯数字** —— 用户在澄清里选定。纯数字在不悬停时无法区分 5 小时窗口和周窗口。
2. **平台色可配置而非写死** —— 用户在澄清里选定，也是 soul「每个可见部位可命名可配置」的要求。
3. **默认平台色 = 主题 healthy 色 +150° 色相旋转，再按 4.5:1 对卡片底色修正** —— 不用 `warning`/`critical` 配对，因为 `amber-mist` / `solar-crown` / `crimson-flare` / `rose-crystal` 四套主题里这些信号色与 `healthy` 只差几度，配对会在恰恰需要区分的地方塌成一个色；而且 `critical` 已经有「额度紧张」的含义。测试对 12 套主题逐一断言色相距离 > 60° 且对比度 ≥ 4.5。
4. **额度块不拿焦点** —— 见偏好回执第 7 条。
5. **窄宽降级顺序** —— `@container (max-width: 320px)` 先隐藏 `Claude` 平台标（颜色与分隔线仍在），读数一个都不丢；`forced-colors: active` 下平台色失效，平台标重新出现。

## 反向边界（本次明确不做）

- 不引入主窗口 `OperationTooltipLayer`（浮窗子窗口在该 owner 之外）。
- 不使用原生 `title`。
- 不改水球、不改任务行、不改任何 Codex/Claude 原生状态读写。
- 提示文案不含会话内容、路径、凭证。
