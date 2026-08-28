# RAW-184：水球球心的 Claude 读数改为普通周限额

Tool: claude · Date: 2026-08-28 · Level: Standard（需求）

## 用户原话

> 插件悬浮球中间的百分比数字, Cloud code的这个限额不要展示为5小时了 展示普通周限额

（「Cloud code」即 Claude Code；本轮只涉及球心那一个数字。）

## 核验证据（只读，来源为本仓源码）

1. 球心数字的唯一来源是 [companionPresentation.resolveCompanionWaterBallPresentation](../../../../src/domain/companionPresentation.ts#L67)，它把 `claudePrimaryQuotaWindow(slice.claudeQuota)` 取整钳制后作为 `percentOverride` 交给 [CodexWaterBall](../../../../src/components/CodexWaterBall.vue#L36) 的中心读数；液面与外环不受影响。
2. 改动前 [claudePrimaryQuotaWindow](../../../../src/domain/claude.ts#L354) 为 `quota.short || quota.weekly || quota.windows[0]`，即**优先 5 小时窗口**。这是实现顺序，不是任何已登记条款：来源任务 [claude-companion-provider RAW-002](../../260805/1150-claude-companion-provider/raw-requirement.md#L22) 只规定「球心百分比数字表示 Claude」，没有指定窗口。
3. `quota.short` / `quota.weekly` 都是 `plainWindow(...)` 派生的**无 scope** 窗口，按模型的 `seven_day_<model>` 不会冒充普通周限额（[claude.ts](../../../../src/domain/claude.ts#L169)），因此「普通周限额」在数据层已有现成且唯一的表达。
4. 该函数在生产代码中只有这一个消费者（球心），改它不会波及展开卡额度区——那里遍历 `windows` 逐窗口显示。

## 需求变更评审（Requirement Change Review）

`scanned_owners`：[PRODUCT_REQUIREMENTS.md#L268](../../PRODUCT_REQUIREMENTS.md#L268)（水球额度映射）、[claude-raw-007](../../requirements/claude-raw-007.md#L1)（全部上游窗口显示）、[claude-raw-019](../../requirements/claude-raw-019.md#L1)（`session / weekly_all / weekly_scoped` 动态解析）、[codex-raw-002](../../requirements/codex-raw-002.md#L1)（早期 Codex 球心 5 小时）、[claude-companion-provider RAW-002](../../260805/1150-claude-companion-provider/raw-requirement.md#L22)。

| 操作 | 条款 | 说明 |
| --- | --- | --- |
| added | 球心 Claude 读数的窗口口径 | 球心取无 scope 的普通周限额（`weekly_all`）。原先的 5 小时优先只是实现顺序，此前无条款约束 |
| unchanged | 球心的归属（RAW-002 / PRD L268） | 谁拥有球心、外环、液面与来源标注不变；兼容路径（仅 Codex、Claude 未接入、无读数回退 Codex 原样）逐字不变 |
| unchanged | 展开卡额度区（RAW-007） | 仍遍历全部上游窗口逐个显示，含按模型周限额；球心的选择不裁剪任何一行 |
| unchanged | scoped 不冒充 plain | 沿用既有 `plainWindow` 判据，按模型周限额不进入球心 |
| added | 回退次序 | 账号确实没有普通周窗口时依次回退 5 小时窗口 → `windows[0]`，只为不让球心空着；`windows[0]` 兜底保留给只有 scoped 窗口的账号 |

`decision`：`explicit-current-request`。

`residual_tradeoff`：周窗口在一周内变化远慢于 5 小时窗口，球心数字的日内变动会明显变少——这正是本条要的「常驻状态数字」，但用户若想看 5 小时余量，需要展开卡片的额度区。球心本身不标注窗口名（它只标来源 `Claude`），窗口名仍只在展开卡与悬停提示里出现。

## 实现

- [claude.ts](../../../../src/domain/claude.ts#L354)：`claudePrimaryQuotaWindow` 改为 `weekly → short → windows[0]`，并把「为什么是周窗口」写进函数注释，避免下一次有人按名字把它读成「上游第一个窗口」。
- 呈现层与组件零改动：`resolveCompanionWaterBallPresentation`、`percentOverride`、`percentProviderLabel`、`ariaSuffix` 的形状与兼容路径全部原样。
- 用户帮助 [codex.md](../../../../src/help/guides/codex.md#L30) 与 [PRODUCT_REQUIREMENTS.md#L268](../../PRODUCT_REQUIREMENTS.md#L268) 同轮写明窗口口径与回退次序。

## 验证

见收尾回复的核验状态。
