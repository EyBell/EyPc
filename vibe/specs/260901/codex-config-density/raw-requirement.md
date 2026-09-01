# RAW-196：Codex 配置页信息密度收紧

Tool: grok · Date: 2026-09-01 · Level: Standard（需求）

spec_id: SPEC-260901-CODEX-CONFIG-DENSITY

## 用户原话

> Codex 功能 tab 的配置页信息密度过高，不需要展示这么多。建议进行以下优化：
> 1. 尽量收缩展示内容，包括提示信息。
> 2. 优化图标，做成小图标。
> 3. 去除没有必要的展示。
> 4. 优化排版，能收缩成一行的就不要用多行。

截图为 Codex 配置「运行」分区：顶部横幅、十格诊断卡片、连接位置标题+字段标签+候选条叠成多行。

## 需求变更评审（Requirement Change Review）

`scanned_owners`：[RAW-087](../../requirements/codex-raw-087.md#L1) 五 Tab 与 i 提示收纳、[RAW-016](../../requirements/codex-raw-016.md#L1) 失败分项原因、[RAW-180](../../requirements/codex-raw-180.md#L1) 主诊断标题与详情常显、[developer-soul.md](../../../knowledge/developer-soul.md#L107) 配置密度。

`visible_changes`:

| 操作 | 条款 | 说明 |
| --- | --- | --- |
| changed | 运行区常显密度 | ready/checking 只保留标题、可聚焦 i、必要事实芯片与一行连接控件；说明性段落不再常显 |
| changed | 诊断格子 | 健康噪声行（系统/自动发现/未设置手动位置/相关进程/已加载配置/实时桥重复来源/零裁决）隐藏；warning/error 仍展示全部分项 |
| changed | 图标与单行排版 | 配置页 Lucide 与 i 改为小图标；标题条、诊断头、CLI 路径、额度事实、产物时间能一行就一行 |
| unchanged | 静默刷新 | RAW-180 已有成功快照后不把药丸/诊断改写成「正在读取 / 正在核查」 |
| unchanged | 快捷键不回读 | RAW-087 宿主绑定回读删除仍有效 |
| unchanged | 失败分项 | RAW-016 加载不到时仍分项显示原因与可执行处理 |

`conflict_candidates`: RAW-180「运行区主诊断标题与详情常显并换行」。本轮把 ready/checking 的详情视为说明性文案，收进 i；warning/error 详情仍内联。`decision_status=explicit-current-request`。

`decision_status`: `explicit-current-request`

## 规范化需求

- Codex 配置页默认按紧凑工作台渲染：页眉标题与 eyebrow 同一行；分区图标用小图标；能单行完成的状态、路径与事实不得拆成卡片多行。
- 运行区 ready/checking：主诊断只常显标题；详情走可聚焦 `i`（不透明主窗 Tooltip）。warning/error 才内联详情，并展示全部分项行。
- 健康噪声诊断行默认隐藏：系统（受支持）、启动方式=自动发现、手动位置=未设置、相关进程、已加载/已发现配置、状态来源=桌面实时桥、状态裁决保护与周期均为 0。Codex CLI、App Server、桌面实时桥始终可见；手动路径或非自动启动时显示对应行。
- 连接位置不再单独成块标题+字段标签；路径输入、三个动作与帮助 `i` 同一行，占位即「手动指定 Codex CLI 路径（可选）」。完整路径仍不回显。
- 不合并五个配置 Tab，不改浮窗自有提示层，不改 Desktop 桥真实终态，不恢复宿主快捷键回读。

## 验收意图

- 已连接自动发现：运行区顶部一行标题+重新检测，下面少量芯片而不是十张卡片，路径控件一行。
- 桌面未运行/CLI 不可用：详情内联，分项行全部可见。
- 悬停 `i` 仍出现不透明顶层气泡。
