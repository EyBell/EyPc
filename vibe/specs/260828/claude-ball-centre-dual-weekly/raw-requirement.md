# RAW-186：水球球心并列展示 Fable 周限额与普通周限额

Tool: claude · Date: 2026-08-28 · Level: Standard（需求）

## 用户原话

> 悬浮球中间的这一个额度 如果在 cloud code 启用的时候 改为 fable和普通的周前额, `{fable-left}/{normal-left}`, 无需使用百分比号了 适当缩小一下字体 让它两个都能展示出来；然后字体可以优化一下 显示得更加优雅 可以用一些好用的这个变体

（「cloud code」即 Claude Code；本条紧接同日 [RAW-184](../claude-ball-centre-weekly/raw-requirement.md#L1)，只改球心那一个位置。）

## 核验证据（只读，来源为本仓源码）

1. 「cloud code 启用」在数据层已有现成判据：球心归属由 [resolveCompanionWaterBallMapping](../../../../src/domain/companionProvider.ts#L1) 得出的 `mapping.percent === 'claude'` 决定，它同时要求 Claude 已启用且真的连得上（`isClaudeAvailable` 或 App 额度可读）。不需要新增开关。
2. 「fable 周限额」在上游是一条 **scoped weekly** 窗口：`seven_day_fable` / `seven_day_fable_5`，`kind: 'weekly'` 且 `scope` 非空（[claude.ts describeQuotaKey](../../../../src/domain/claude.ts#L111)）；「普通周限额」是无 scope 的 `seven_day`，由 [plainWindow](../../../../src/domain/claude.ts#L169) 派生为 `quota.weekly`。两个数在缓存里一直都有，此前只是球心没有投影它们。
3. 球心文字此前唯一由 `percentOverride` 决定，组件渲染死写为 `` `${displayPercent}%` ``（[CodexWaterBall](../../../../src/components/CodexWaterBall.vue#L98) 改前）。要并列两个读数必须同时扩展呈现层结构与组件。
4. 字号 `percentSize` 是**用户可调**的 12–32px（[CodexPage 文字大小滑杆](../../../../src/pages/CodexPage.vue#L909)、[boundedInteger 钳制](../../../../src/domain/codex.ts#L1059)）。因此「适当缩小」不能是一个固定倍率：32px 下的 `100/100` 会直接穿出 94px 球体。

## 需求变更评审（Requirement Change Review）

`scanned_owners`：[PRODUCT_REQUIREMENTS.md#L268](../../PRODUCT_REQUIREMENTS.md#L268)（水球额度映射）、[claude-raw-184](../../requirements/claude-raw-184.md#L1)（球心取普通周限额）、[claude-raw-007](../../requirements/claude-raw-007.md#L1)（展开卡显示全部上游窗口）、[claude-raw-019](../../requirements/claude-raw-019.md#L1)（`session / weekly_all / weekly_scoped` 动态解析）、[claude-companion-provider RAW-002](../../260805/1150-claude-companion-provider/raw-requirement.md#L22)（球心归属 Claude）。

| 操作 | 条款 | 说明 |
| --- | --- | --- |
| added | 球心并列两个读数 | Claude 拥有球心且账号同时上报 scoped 周与普通周时，球心读作 `{scoped}/{plain}`，scoped 在前；不带 `%` |
| added | scoped 侧的选取 | 在全部 scoped 周窗口里优先取 scope/key 命中 Fable 的一条，否则取第一条；模型名仍是数据不是白名单（沿用 [claude-raw-019](../../requirements/claude-raw-019.md#L1)） |
| added | 并列的字号口径 | 并列时取 `percentSize * .7`，并再按球体尺寸 `--water-size * .165` 取 `min`；上限保证 32px 设置下最宽的 `100/100` 仍在圈内，下限保证 12px 设置仍被尊重 |
| added | 数字变体 | 球心读数改用 `tabular-nums lining-nums`；读数就地刷新，比例数字会让整块中心在每次新采样时左右跳动 |
| refines | [RAW-184](../../requirements/claude-raw-184.md#L1) | 普通周限额仍是球心的基准读数，只是让出并列的后位；账号没有 scoped 周窗口时逐字回到 RAW-184 的单值 `{plain}%` |
| unchanged | scoped 不冒充 plain | scoped 周限额仍不进入 `quota.weekly`，也不单独占据球心：只有普通周窗口存在时它才作为前位出现，否则不显示 |
| unchanged | 展开卡额度区（RAW-007） | 仍逐窗口显示全部窗口；球心的并列不裁剪也不合并任何一行 |
| unchanged | 兼容路径 | 仅 Codex、Claude 未接入、无读数三种情况仍逐字回退 Codex 原样，`scopedPercent` 恒为 `null` |

`decision`：`explicit-current-request`。

`residual_tradeoff`：球心去掉 `%` 后，`79/45` 本身不自带单位，两个数各自属于哪个窗口只能靠球心下方的 `CLAUDE` 来源标注加悬停/展开卡区分——这是用户明确要的取舍（两个百分号放不下）。无障碍名把两条读数连同窗口名一起念出（`Claude Fable周限额剩余 79%，普通周限额剩余 45%`），所以读屏用户不受这个取舍影响。scoped 侧对 Fable 的偏好是一个 `/fable/i` 匹配：它只在多条 scoped 周窗口之间排序，命不中时仍取第一条 scoped，因此不构成模型白名单。

## 实现

- [claude.ts](../../../../src/domain/claude.ts#L358)：新增 `claudeScopedWeeklyQuotaWindow`，在全部 scoped 周窗口里择一（Fable 优先）。
- [companionPresentation.ts](../../../../src/domain/companionPresentation.ts#L67)：`CompanionWaterBallPresentation` 增加 `scopedPercent` / `scopedLabel`；仅当 `quota.weekly` 存在时才配对，避免把 scoped 周和 5 小时回退塞进同一个斜杠。`ariaSuffix` 同轮改为念出两条读数与窗口名。
- [CodexWaterBall.vue](../../../../src/components/CodexWaterBall.vue#L28)：新增 `scopedPercent` prop 与 `.codex-water-ball__pair` 渲染分支；选择器写成 `.codex-water-ball__value strong.codex-water-ball__pair`，否则字号规则会输给既有的 `.codex-water-ball__value strong` 而整条上限失效。
- [FloatApp.vue](../../../../src/FloatApp.vue#L3183) 与 [CodexPage.vue](../../../../src/pages/CodexPage.vue#L881) 同轮接线，保持浮窗与设置页预览同源。
- 用户帮助 [codex.md](../../../../src/help/guides/codex.md#L30) 与 [PRODUCT_REQUIREMENTS.md#L268](../../PRODUCT_REQUIREMENTS.md#L268) 同轮写明并列口径。

## 验证

见收尾回复的核验状态。
