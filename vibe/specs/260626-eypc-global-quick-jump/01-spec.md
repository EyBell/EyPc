# Global Quick Jump Spec

Tool: codex

## Goal

在全局插件非编辑区增加 Vim 式筛选提示快捷跳转：按 `F` 打开当前页面可跳转目标提示，按 `Shift+F` 反向打开；输入标记或筛选文本后可快速激活目标。交互参考本机 EzTodo 项目的目标提示体验。

## Scope

- 全局非编辑区 `F` 触发正向 Quick Jump，`Shift+F` 触发反向 Quick Jump。
- 浮层只覆盖当前可见、可交互目标，包括按钮、`role="option"`、`role="treeitem"`、`data-mqtt-shortcut-hint` 和显式 `data-quick-jump-target`。
- 浮层也覆盖可聚焦文本目标和语义命令目标，包括 `input`、`textarea`、`select`、`role="textbox"`、`role="searchbox"`、链接、`role="button"` 和 `role="menuitem"`；但这些目标获得焦点后仍阻止全局 `F` 抢文本输入。
- 提示字符默认定位在目标矩形中心基础上略向上偏移；行级 item 若提供标题锚点，则标记贴近标题右侧一点显示。
- 图标按钮即使缺少可见文本，也应通过 `aria-label`、`title`、`data-mqtt-shortcut-hint`、`data-role` 或按钮兜底标签进入跳转目标。
- MQTT 记录行、订阅行、发布收藏/历史行和草稿历史行本身必须可作为 Quick Jump 目标，跳转后进入该记录的选中/聚焦状态，行为类似连接卡片。
- 被父级裁剪、透明、隐藏或不可交互的按钮不分配 Quick Jump 字母；隐藏动作按钮不应在浮层里出现。
- 浮层标记必须尽量保持完整可见：按视口边缘夹取位置，且标记文本自身不裁剪。
- 大型按钮、文本输入区和可选行内部有足够空间时，标记应优先放在目标内部空位并避让已有标记，避免多个字母挤在同一中心点。
- 标记集排除触发键 `f`，避免打开浮层后首键冲突。
- 输入标记前缀时按标记收窄，浮层自动消除已输入前缀并只显示剩余待输入字母；完整标记命中时直接激活目标；非标记输入按目标标签/搜索文本筛选。
- `Enter` 激活当前目标，`Escape` 关闭浮层，方向键和 `Ctrl+J/K` 移动焦点，`Backspace` 删除查询。
- 可编辑 DOM 不触发 Quick Jump；编辑容器内部的可见按钮和显式快捷目标仍可显示跳转提示。

## Contracts

- Quick Jump 领域逻辑位于 [../../../src/domain/quickJump.ts](../../../src/domain/quickJump.ts#L1)，负责标记生成、筛选、命中判断和焦点移动。
- 浮层渲染位于 [../../../src/components/QuickJumpLayer.vue](../../../src/components/QuickJumpLayer.vue#L1)，按目标中心点或标题锚点固定定位标记，再由 CSS 轻微上移并夹取到视口内。
- 应用入口位于 [../../../src/App.vue](../../../src/App.vue#L1)，负责扫描当前 DOM、过滤编辑/隐藏/禁用目标，并激活真实目标。
- 快捷键默认值和可见设置位于 [../../../src/runtime/keybinding/keybindingRuntime.ts](../../../src/runtime/keybinding/keybindingRuntime.ts#L1) 与 [../../../src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L1)。
- `role="textbox"` 必须被识别为编辑目标，防止全局 `F` 抢文本输入，来源位于 [../../../src/runtime/keyboardEvent.ts](../../../src/runtime/keyboardEvent.ts#L1)。

## Out Of Scope

- 不引入拼音筛选依赖；本次使用目标标签、显式搜索文本和 DOM 文本做本地筛选。
- 不改变已有业务动作语义；Quick Jump 只触发目标元素的原有点击/焦点入口。
- 标记视觉只使用透明红紫主题彩色字，不使用文本框背景、边框或阴影；普通标记用 rose/purple/fuchsia 交替区分，active 标记用更深紫色和轻下划线。
- 不增加数据库、外部服务或发布动作。
