# 设计偏好查询回执（补做）

Tool: claude (Cowork)
Date: 2026-08-05
Gate: `design-preference-gate: accepted`（[vibe/rules/README.md](../../../rules/README.md#L1)）

Spec: [spec.md](spec.md#L1) · Verify: [verify.md](verify.md#L1)

## 为什么是补做

Phase 4 是中型以上的交互/UI/配置工作（水球中心读数、任务行来源标记、展开卡额度分区、设置页新分区）。项目规则要求这类工作在改变行为**之前**应用 [developer-soul.md](../../../knowledge/developer-soul.md#L1)，且 `accepted` 状态的偏好门要求先产出查询回执。我当时直接按自己的判断写了样式与文案，两份权威文件一份都没打开。本文件是事后补的查询与复核结果，以及据此做出的修正。

## 查询范围

| 偏好条目 | 类别 | 命中原因 |
| --- | --- | --- |
| `eypc-codex-visual-taste` | visual-taste | 水球中心读数与来源标注 |
| `eypc-codex-typography` | typography | 行内标记字号与行高、40px 行 |
| `eypc-codex-interaction-input` | interaction-input | 任务行结构、pinned-first、紧凑循环 |
| `eypc-codex-color-theme` | color-theme | 水球外观 token 与「可见部分预览」 |
| `eypc-codex-content-information` | content-information | 提示时序、额度无气泡、隐私 |
| `eypc-codex-accessibility` | accessibility | 非颜色状态线索、focus 等价帮助 |

权威正文：`developer-soul.md#codex-companion-taste`。

## 复核结论与修正

### 1. 任务行来源标记：原实现会改变行高 —— 已修正

Soul 的密度合同是「`12/10/9px` 信息层级、`24px` 四槽动作、`40px` 行」，明确避免「52px 行」；`eypc-codex-interaction-input` 带 `nonreflow-bottom-selection-cue` 标签，2026-07-22 的选择布局修正进一步写死「瞬时交互线索不得插入常规流、不得改变密集列表的顶边、可见高度、行坐标或已习得的空间节奏」。

我原来的实现是在 `.task-copy` 里追加一个带 `margin-top` 与边框的 `inline-block`，实测会把 `.float-task-row` 的 46px 撑高。已改为让标记**骑在既有的底部元信息行上**：新增 `.task-meta-line` 弹性行，标记 `flex: none` 且行高与元信息行对齐，元信息按钮 `flex: 1 / min-width: 0` 保留原有省略号行为。行高与行坐标不变。

同一条 soul 还写明「避免把来源重复成行尾文本」（原文针对置顶来源）。你本轮明确要求「一个明显的底部标记位」——**当前用户请求优先于项目规则**，所以标记保留；但它现在位于既有底部行内、与元信息共用一行盒模型，而不是另起一个行尾文本块。

### 2. 来源标记的冗余 Tooltip —— 已移除

`eypc-codex-content-information` 的 `quota-bubble-free` 与「200ms 不透明帮助只给状态/动作控件」表明这个界面刻意控制悬浮气泡的数量。标记本身就是「Claude」两个字，再挂一个说「来源：Claude」的 tooltip 是纯噪音。已移除该属性（`EYPC-OPERATION-TIP-001` 要求的是**图标/动作控件**必须有产品提示；静态文本标记不在其列）。

### 3. 水球中心来源标注：预览与运行时漂移 —— 已修正

2026-07-24 的水球预览修正要求「配置预览与桌面浮窗复用同一个水球组件与真实数据投影」，明确避免「与运行时漂移的预览」；同日的百分比读数修正要求该读数的位置/字号/字型/颜色随外观持久化，避免「仅预览的读数」或「仅浮窗的 CSS 覆盖」。

我原来只给浮窗传了 `percentOverride`，设置页预览没传——于是浮窗会显示一个预览永远不显示的中心读数与来源小标。已让设置页用同一个 `resolveCompanionWaterBallPresentation` 计算并传入同样的 override 与来源标签，预览与浮窗重新一致。

**保留但记录为 soul 细化**：soul 原文是「中心是 5 小时读数、外环是 Weekly」。双来源同时启用时中心改读 Claude 是你本轮的明确决定（「外层圆环表示 Codex，里面的百分比表示 Claude 即可」）。仅 Codex 启用时行为与 soul 原文完全一致。

### 4. 设置项：常驻说明文案 —— 已移至提示层

RAW-087 的配置密度修正明确避免「常驻的说明性文案」，要求把解释放在可聚焦的信息控件之后（页面既有 `codex-tip` 的「i」按钮模式）。

我原来在「空闲时补充读取额度」下面挂了一行常驻 `<small>` 写钥匙串与未公开接口。已移除该行，把同样的信息并入该开关的 `data-operation-description`（走共享提示层，hover/focus 可得）。「接入 Claude Code」下面那行保留——它是**状态**（已连接的版本号 / 第一条阻塞原因），不是说明文案，与「运行」分区展示连接状态的既有做法一致。

### 5. 设置项归属分区 —— 已从「任务」移到「运行」

RAW-087 要求「分离 任务 / 水球 / 卡片 / 运行 配置」。「接入另一个来源」在性质上是连接与环境问题，与 Codex 自身的环境诊断、连接状态、额度刷新同类，不是任务展示选项。已把整个 Claude 块作为独立的「接入来源」面板移入「运行」分区，与 Codex 环境诊断相邻；三项（启用开关、钩子注册、空闲额度补读）保持在一起，避免用户在两个分区之间来回找。功能说明 guide 已同步。

## 未偏离的部分

- 字号 `9/10` 落在 `12/10/9` 层级内。
- 来源标记是文字而非仅颜色，符合 `non-color-state-cues`。
- 展开卡 Claude 额度分区是静态文本，无悬浮气泡，符合 `quota-bubble-free`。
- 文案是产品语汇（「来源：Claude」「已连接 Claude Code 2.1.220」「未检测到 Claude Code CLI」），未泄漏原始 provider 词汇，符合内容信息偏好。
- 水球组件根保持透明、未新增装饰性外圈或 inset，符合 `no-decorative-rim`。
- 合并列表按活跃度交错、层内 pinned-first 保持不变，符合 `pinned-first-within-status-section` 与 `compact-and-cyclic-task-navigation`。

## 验证

修正后 typecheck 0 错误；受影响套件 29 文件 426/426 通过；production build 与 uTools validation 通过。视觉本身仍属宿主验收（见 [verify.md](verify.md#L1) 的宿主验收门禁）。
