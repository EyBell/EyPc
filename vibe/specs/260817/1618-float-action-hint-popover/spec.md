# Spec：展开卡动作提示改为带尖头悬浮气泡

RAW: [raw-requirement.md](raw-requirement.md#L1) · Receipt: [design-preference-receipt.md](design-preference-receipt.md#L1)

## 过期确认行为如何挤行

[RAW-173](../../260817/0859-float-search-status-compact/spec.md#L31) 取消了库存状态整行，但留下例外：`pendingConfirm` 仍渲染 [FloatApp.vue](../../../../src/FloatApp.vue#L1) 里的确认条。该条 `min-height: 23px`，插在额度与列表之间，点击归档就会再压一行。

## 变更点

### 1. 删除确认整行

有无待确认都不渲染 `float-source-status`。别名编辑器不是提示，保持原位。

### 2. 统一到带尖头的自有提示层

[placeFloatActionHint](../../../../src/domain/companionPresentation.ts#L553) 按展开卡矩形计算 `left/top/placement/arrowLeft`。算法对齐主窗 [OperationTooltipLayer.vue](../../../../src/components/OperationTooltipLayer.vue#L162)，但夹紧对象是 `.float-expanded-card`，不是 viewport。卡片矩形为 0 时回退旧的窗口猜测，供 jsdom 悬停测试使用。

[FloatApp.vue](../../../../src/FloatApp.vue#L2830) 的 `.float-action-hint` 增加尖头与 `--float-hint-arrow-left`。悬停/焦点仍 200ms；归档/移除确认立即、粘性展示 `` `${label} · 再次操作确认` ``，直到确认、取消或过期。

### 3. 锚点

优先点击 `currentTarget`；键盘/热键回退到焦点行 `.action-archive` 或当前确认控件。提示层是展开卡的兄弟、`position:fixed`，不被卡片 `overflow:hidden` 裁切，由 JS 把视觉范围夹在卡内。

## 明确不做

- 不改 5 秒确认语义、stale 判定、搜索栏收纳、额度 chip。
- 不把主窗 Tooltip 挂进浮窗，不用原生 `title`。
- Plan「执」二次确认本来就不占行；本轮不强制改它的粘性气泡。

## 验收

- 聚焦测试：`tests/domain/companionPresentation.test.ts`、`tests/ui/codexCompanion.test.ts`
- 真实浮窗上/下与窄卡夹紧仍由宿主目视确认
