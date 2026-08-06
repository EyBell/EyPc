# 设计偏好查询回执：额度全窗口 + App 同步节奏

Gate: `design-preference-gate: accepted` · Date: 2026-08-06

## 查询的权威

- [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L99)（合同优先于 soul，[EYPC-RULE](../../../rules/README.md#L35)）
- [developer-soul.md](../../../knowledge/developer-soul.md#L61) `Codex Companion Taste`
- 项目规则 `EYPC-FLOAT-QUOTA-ROW-001`（[rules/README.md](../../../rules/README.md#L31)）与其[前轮回执](../../260805/2051-float-quota-single-line/design-preference-receipt.md#L1)

## 命中的条款与落法

| 条款 | 约束 | 本轮的落法 |
| --- | --- | --- |
| `EYPC-FLOAT-QUOTA-ROW-001`：额度区是**一行**，每个启用来源都渲染在里面，完整窗口名与重置时刻只在 200ms 提示与读屏文本里 | 第三个窗口不能另起一行、不能在行内写全名 | 第三个读数是同一行里的第三个 chip，短标 `周·Opus`；完整标题「周限额 · Opus」只进悬停提示与 aria |
| 同规则：**窄宽先降级平台标** | 六个读数会更早触发拥挤 | `.float-quota-provider` 的隐藏阈值从 `≤320px` 提前到 `≤400px`，理由与原注释一致（平台色 + 分隔线仍能区分来源）；强制高对比下仍恢复标题 |
| soul 2026-07-19「missing quota buckets collapse cleanly instead of leaving empty gauges」 | 不得为不存在的窗口留空位 | 窗口按 payload 实际存在与否枚举，没有就没有那个 chip |
| soul 2026-07-22 密度合同（`12/10/9px`、稳定位置） | chip 顺序必须稳定，不能按数值重排 | 顺序固定为 `5h → 周 → 按模型的周`，与账号面板一致；不做「显示最紧张的那个」的动态择一 |
| RAW-087「避免常驻说明文案」 | 新来源不得带说明性文案 | 桌面端用量来源**没有任何新 UI**：不加开关、不加状态行，只在功能说明里解释 |
| 铁律 11 / 凭证边界（[1150 verify](../../260805/1150-claude-companion-provider/verify.md#L340)） | 周期性读凭证必须 opt-in | 新来源**不读凭证**，因此不需要开关；它恰好削弱了对 opt-in 兜底的依赖，而不是绕过它 |

## 明确的取舍

**没有**为「按模型的周限额」发明中文译名或图标：标签直接由 payload 键派生（`seven_day_opus` → `周限额 · Opus`）。一张模型名对照表会在下一个模型发布时重演本轮修的这个错误。

## 保留的风险（交宿主验收）

极窄浮窗下，六个读数仍可能被 `overflow: hidden` 裁掉最后一个。已把来源标题的降级提前一档缓解；是否需要进一步降级（例如百分比字号或短标缩写）留待用户实际视觉验收后决定，本轮不预先发明。
