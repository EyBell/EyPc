# RAW-173：展开卡搜索栏收纳状态提示

Tool: cursor · Date: 2026-08-17 · Level: Standard（需求）

## 用户原话

> 这个数据过期是如何产生的, 然后优化一下使用 `!` 图标悬浮展示提醒, 不用占一整行, 位置放到搜索输入区域的最左侧(可在异常时替换搜索的图标)

> 并且最近的数据天数和条目提示文字, 放到搜索框内, 右对齐, 并且精简原有提示信息为 `别名|任务|项目`并保持左对齐, 如果会重叠, 则隐藏左侧信息到 搜索图标悬浮进行展示

## 需求变更评审（Requirement Change Review）

`scanned_owners`: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L232) 登记句、[1046 spec](../../260806/1046-claude-quota-status-visibility/spec.md#L22) 状态行、[developer-soul.md](../../../knowledge/developer-soul.md#L1) 浮窗 200ms 提示、[FloatApp.vue](../../../../src/FloatApp.vue#L348) 搜索栏。

`visible_changes`:

| 操作 | 条款 | 说明 |
| --- | --- | --- |
| changed | 登记句「最近 N 天的 M 条」 | 从额度下方整行改为搜索框内右对齐 |
| added | 过期/异常 `!` 悬停 | 替换搜索图标，200ms 子提示，不占整行 |
| added | 占位 `别名\|任务\|项目` | 左对齐；与右侧重叠时隐藏并改由左侧图标悬停展示 |
| changed | 1046 hooks 降级提示落点 | 文案仍由 `claudeRealtimeGapNote` 生成，改为走搜索栏 `!` 悬停，不再追加到整行状态 |

`conflict_candidates`: 1046「hooks 降级提示复用既有 `float-source-status` 状态行」是未入册布局句。采用本轮会改变该行的用户可见位置，但是当前请求已明确取消整行，故 `decision_status=explicit-current-request`。

`decision_status`: `explicit-current-request`

## 规范化需求

- 会话库存 `status === 'stale'` 时，展开卡不得再占用额度与列表之间的整行来显示「数据已过期 · 展示上一份已验证快照」。
- 该提醒改由搜索栏最左侧 `!` 在 200ms 后以浮窗自有提示层展示；异常时 `!` 替换放大镜。同类异常还包括预检失败、兼容降级和 Claude 钩子/状态栏缺口。
- 已有库存时，「最近 N 天的 M 条」放进搜索框内并右对齐；过期仍展示该计数，因为它描述的是正在显示的上一份快照。
- 普通占位精简为左对齐 `别名|任务|项目`；快速筛选模式仍用 `筛选任务，c-1…0 直接打开`。
- 左右文案会重叠时，隐藏左侧占位，改由左侧图标悬停展示；右侧计数保留。
- 二次确认「再次操作确认」的整行例外已被 [RAW-175](../1618-float-action-hint-popover/raw-requirement.md#L1) 取代；无确认时本来就不渲染该行。
- 不改 Controller 何时把库存标为 stale，不改 Preload，不写原生状态。

## 验收意图

- 正常：搜索框左侧放大镜、左占位 `别名|任务|项目`、右计数；额度下方不再有状态整行。
- 过期：左侧 `!`，悬停可见过期句；右侧仍有天数/条数。
- 窄宽度重叠：左侧占位消失，图标悬停能读到占位原文。
