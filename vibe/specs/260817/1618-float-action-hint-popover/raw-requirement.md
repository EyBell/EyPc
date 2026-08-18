# RAW-175：展开卡动作提示改为带尖头悬浮气泡

Tool: cursor · Date: 2026-08-17 · Level: Standard（需求）

## 用户原话

> 因为把提示信息放到了搜索那一行，导致现在点击归档时，会产生新的一行压缩，这是十分不合理的。
>
> 你需要统一优化一下这种交互的提示，不要在卡片内部单独放置提示信息，导致布局的展开、收缩和挤压。具体优化要求如下：
> 1. 形式：将提示信息放到悬浮提示窗内部，类似于带有尖头的语言对话框效果。
> 2. 位置：点击归档时，提示信息可以在上方或下方展示。
> 3. 排版：居中对齐（也可以左右侧对齐），确保不要被遮挡，也不要超出卡片的范围。

## 需求变更评审（Requirement Change Review）

`scanned_owners`: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L232) 搜索栏收纳、[PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L238) 破坏性同位置确认、[0859 spec](../../260817/0859-float-search-status-compact/spec.md#L31) 确认整行例外、[developer-soul.md](../../../knowledge/developer-soul.md#L1) 浮窗 200ms 提示、[FloatApp.vue](../../../../src/FloatApp.vue#L1) `pendingConfirm` 状态行。

`visible_changes`:

| 操作 | 条款 | 说明 |
| --- | --- | --- |
| changed | RAW-173「有待确认时保留 `float-source-status`」 | 确认文案不再插入额度与列表之间的整行 |
| added | 带尖头悬浮气泡 | 复用浮窗自有提示层，立即展示、按展开卡夹紧、上/下、居中或左右 |
| unchanged | 5 秒同位置二次确认 | 只改落点，不改确认语义、operationId 或过期 |

`conflict_candidates`: RAW-173 明确保留确认整行。采用本轮会取消该行，但是当前请求已明确禁止卡片内单独占位，故 `decision_status=explicit-current-request`。

`decision_status`: `explicit-current-request`

## 规范化需求

- 展开卡不得再为待确认动作渲染 `float-source-status` 或任何会改变列表顶边/高度的提示行。
- 归档、项目归档、项目移除等二次确认文案立即出现在浮窗自有提示层，形态为带尖头的语言对话框；悬停/焦点短说明仍走同一层，延迟 200ms。
- 气泡相对触发控件可在上方或下方；水平居中，必要时左右平移；尖头对准锚点；视觉范围夹在展开卡内，不被遮挡、不超出卡片。
- 确认气泡在确认、取消或 5 秒过期前保持可见，不被其它悬停清掉。读屏仍走现有 `liveMessage`。
- 不引入主窗 `OperationTooltipLayer`，不使用原生 `title`。不改 stale 判定、搜索栏收纳、额度 chip 或二次确认时限。

## 验收意图

- 点击归档：列表不挤出新行；按钮旁出现「再次操作确认」气泡。
- 取消或过期：气泡消失，卡片几何不变。
- 悬停短说明仍 200ms 出现，且带同一尖头。
