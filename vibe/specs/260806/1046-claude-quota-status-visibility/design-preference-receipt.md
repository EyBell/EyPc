# 设计偏好查询回执

Tool: claude (Cowork) · Date: 2026-08-06
Gate: `design-preference-gate: accepted`

Spec: [spec.md](spec.md#L1)

## 查询范围

| 偏好条目 | 命中原因 |
| --- | --- |
| `eypc-codex-content-information` | 200ms 状态/动作提示、quota-bubble-free、隐私 |
| `eypc-codex-visual-taste` | chip 行密度、单行读数合同 |
| `eypc-codex-accessibility` | 非颜色状态线索、aria 等价文本 |
| RAW-087（no-readback / 配置密度） | 避免常驻说明文案 |

权威正文：`developer-soul.md#codex-companion-taste`（2026-07-21 live-input 行、RAW-087 行、2026-07-22 label/density 行）。

## 复核结论

1. **重置时刻进悬停层而非行内**。soul 的额度行合同是「单行读数」，quota 悬停已被现行实现细化为共享 200ms 子提示（FloatApp 模板注释明确记录）。行内加时刻会拉长行宽、窄浮窗换行，违反密度合同。用户经 AskUserQuestion 拍板「仅悬停提示」——与 soul 一致，无覆盖。
2. **刷新状态 = 悬停句 + 过期变灰，无常驻文案**。RAW-087 明确避免「永久可见的说明性文案」；「更新于 X 前」属说明而非状态行既有格式，故不常驻。stale 变灰为视觉线索，非颜色等价线索由悬停句与 sr-only aria 文本（「，可能已过期」）承担，符合 accessibility 条目。用户拍板一致，无覆盖。
3. **hooks 降级提示复用既有 `float-source-status` 状态行**，与「已连接 Claude Code 2.1.220」同类：是状态+补救指引，不是说明文案；不新增常驻元素、不改行高、不加气泡。readiness 自检 taste（2026-07-18 行）要求「精确补救文本」，本提示与之同向。
4. **Codex-only 逐字节一致**：hint/aria 第四参默认空串、`stale` 字段仅 Claude chip 携带、状态行 note 在 Claude 关闭时恒为空——三处均不触碰 Codex 路径输出。

## 追加决定（2026-08-06 二轮）

- **重置时刻固定 GMT+8**：用户明示「那个时间要选择GMT+8」。覆盖默认的「跟随系统时区」假设；实现为固定偏移常量 + UTC getter，帮助文档注明。soul 无相反条目，无冲突。

## 未偏离项

- chip 可见内容不变（shortLabel + 百分比），字号/行高不动。
- 悬停提示仍走共享 200ms 不透明提示层，无新气泡类型。
- 文案为产品语汇，不泄漏 provider 原始词汇与路径。
