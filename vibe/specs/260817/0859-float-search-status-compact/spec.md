# Spec：展开卡搜索栏收纳状态提示

RAW: [raw-requirement.md](raw-requirement.md#L1) · Receipt: [design-preference-receipt.md](design-preference-receipt.md#L1)

## 过期是如何产生的

展开卡那句「数据已过期 · 展示上一份已验证快照」只看会话库存 `conversations.status === 'stale'`，不是额度 chip 的过期。

Controller 在已有成功库存（`updatedAt > 0`）后，本次预检不能发布新的已验证快照时，把上一份快照标成 `stale` 继续展示：

- Host V2 不完整或协议失败，拒绝发布新快照，见 [codexController.ts](../../../../src/runtime/codexController.ts#L1940-L1948)
- 任务清单数量暂时不稳定，保留上一份稳定清单，见同文件 [L1993-L2012](../../../../src/runtime/codexController.ts#L1993-L2012)
- 线程预检本身失败，见 [L2024-L2030](../../../../src/runtime/codexController.ts#L2024-L2030)

架构句：[ARCHITECTURE.md](../../../knowledge/ARCHITECTURE.md#L164) — 源变化会整扫重试一次，Controller 只保留上一份已验证快照并显式标 stale。没有上一份快照时走 `error`，不是 stale。

## 变更点

### 1. 异常提醒进搜索栏左侧 `!`

[companionSearchAlertText](../../../../src/domain/companionPresentation.ts#L502) 优先级：兼容降级 → stale → error → Claude 钩子/状态栏缺口。有文案时搜索图标换成 `!`，200ms 走浮窗自有 `queueActionHint`，不使用原生 `title`、不引入主窗口 Tooltip。

### 2. 天数/条数进搜索框右侧

[companionSearchMetaText](../../../../src/domain/companionPresentation.ts#L489) 在 `completeness === 'verified'` 或 `status === 'stale'` 时输出 `最近 N 天的 M 条`，右对齐叠在输入框内。过期快照仍显示条数。

### 3. 占位精简与重叠让位

普通占位为 `别名|任务|项目`。左右宽度加间隙超过输入区时，[companionSearchHintOverlaps](../../../../src/domain/companionPresentation.ts#L515) 隐藏左侧占位，改由左侧图标悬停展示；若同时有异常，悬停句为 `过期句 · 占位`。

### 4. 状态整行

无二次确认时不渲染 `float-source-status`。**有待确认时保留该行的例外已被 [RAW-175](../../260817/1618-float-action-hint-popover/spec.md#L1) 取代**：确认文案改走带尖头的自有提示气泡，不再插入整行。

## 明确不做

- 不改 stale 判定、Preload、额度 chip 过期样式。
- 不新增第二种气泡，不改搜索过滤语义。

## 验收

- 聚焦测试：`tests/domain/companionPresentation.test.ts`、`tests/ui/codexCompanion.test.ts`
- 真实浮窗宽/窄和过期态仍由宿主目视确认
