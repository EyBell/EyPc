# RAW-180：Codex 配置页静默刷新与运行区整合

Tool: grok · Date: 2026-08-25 · Level: Standard（需求）

## 用户原话

> 还有这个页面 每次刷新读取 为什么都要去展示一下状态的变更 它不应该是自动 静默的方式吗？
>
> Codex 的整个功能 tab 页要进行更高级的优化：
>
> 1. 页面整合：把冗余的页面形式进行简洁整合。
> 2. 弹窗提醒：考虑是否再使用透明的方式。
> 3. 元素展示：当页面或元素展示有重叠时，优先把提示信息更完整、清晰地加载出来。

截图为 Codex 配置「运行」分区：顶部药丸写「正在读取 Codex App Server」，诊断条写「Codex 数据已就绪，正在连接桌面实时状态」，十格诊断互相叠压，`i` 提示落在邻格上。

## 需求变更评审（Requirement Change Review）

`scanned_owners`: [RAW-087](../../requirements/codex-raw-087.md#L1) 五 Tab 与 i 提示收纳、[RAW-133](../../260718/1148-codex-quota-float/raw-requirement.md#L1) live region 只报有意义连接状态、[PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L135) 主窗 Tooltip、[developer-soul.md](../../../knowledge/developer-soul.md#L107) 配置密度。

`visible_changes`:

| 操作 | 条款 | 说明 |
| --- | --- | --- |
| added | 静默刷新 | 已有成功快照时，例行读取不把药丸/诊断改写成「正在读取 / 正在核查」 |
| changed | 运行区诊断形态 | 取消挤压三列条；标题+详情常显并换行 |
| changed | 主窗提示层 | 不透明；与格子重叠时优先完整提示 |
| unchanged | 五 Tab 分区 | 快捷方式 / 任务 / 水球 / 卡片 / 运行仍分面，不一次纵向铺开全部配置 |
| unchanged | 快捷键不回读 | RAW-087 宿主绑定回读删除仍有效 |

`conflict_candidates`: RAW-087「诊断详情收进 i、只保留当前值常显」。本轮把**主诊断标题与详情**视为当前状态而非说明性文案，常显；其余分区说明仍走 i。`decision_status=explicit-current-request`。

`decision_status`: `explicit-current-request`

## 规范化需求

- 自动额度/环境重读一旦已有成功快照，必须静默：顶部连接药丸和运行区诊断保持上次稳定文案；忙碌只表现在药丸/「重新检测」控件。冷启动、尚无成功快照、或 warning/error 仍立即改写。
- 运行区诊断改为单列叠层：标题与详情完整可见，格子值允许换行，不得用 nowrap+ellipsis 把邻格叠在一起。
- 主窗操作提示层用不透明底；Codex 配置页 `i` 走该层，不再依赖透明 CSS `::after`。重叠时优先完整提示，不裁切诊断正文。
- live region 只在 warning/error 时宣告；例行 checking/ready 切换不朗读。
- 不合并五个配置 Tab，不改浮窗自有提示层，不改 Desktop 桥真实 connecting/not-running 终态。

## 验收意图

- 已连接后触发刷新：药丸仍是「已连接」类文案，诊断不闪成「正在核查 Codex 环境」。
- 运行区格子文字完整换行；主诊断详情无需点 i。
- 悬停 `i` 出现不透明顶层气泡，不被邻格挡住。
