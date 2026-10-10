# GPT 状态兼容验收记录

日期：2026-10-10。当前状态：`focused-automated-verified / user-reported-normal`。

## 行为与原因

| 症状 | 已验证原因 | 当前修复 |
| --- | --- | --- |
| 新版问题没有待输入 | 问题位于最新 Turn 的 agentMessage.questions，requests 与 runtime flags 不保证包含它 | 匿名问题投影，匹配结构化回复才关闭，未知回复不清除 |
| 运行角标与数量反复变化 | 可还原的 canonical 正文/工具增量被当成协议损坏，触发重订阅和旧状态回退 | 有限增量投影，普通进度保持订阅和语义包稳定 |
| 运行中误归待继续 | live Turn 已 inProgress 但 runtime 仍 idle，或旧 interrupted 抑制 active snapshot | live Turn 生命周期兼容；最新 canonical 新进度撤回旧暂停，同轮/旧轮 completed 不恢复 |
| 接受回答后仍卡住 | 旧 runtime waiting 残留；初次等待与恢复使用不同序域，内核底层完成态拒绝恢复 | 精确请求墓碑、无其他输入才关闭旧 flag、等待与解除使用单调序号 |

## 验证矩阵

| 检查 | 结果 | 证据边界 |
| --- | --- | --- |
| 定向生命周期 | 19/19 | 问题/部分回答/全部回答/新轮/终态、连续进度、旧暂停恢复、旧快照不复活、新问题重新等待、同轮 completed 防误恢复 |
| 扩展保留检查 | 317/320 | 3 项修复前已复现失败：Plan cycleTier、allowlisted Orca 调用次数、initialize 重试 Orca 调用次数；原断言保留 |
| 类型、合同、生产构建、uTools 产物 | 通过 | 最终完整工作区构建通过；状态修复独立暂存内容也通过生产构建 |
| 源码只读 IPC | 当前任务 active / inProgress，待输入请求 0，无旧暂停抑制 | 隔离运行最新源码，不修改 uTools 配置，不等同于已加载宿主 |
| 用户现场反馈 | 当前应该正常 | 用户反馈；未独立取得实际宿主四元组或逐项像素矩阵 |
| 全仓测试、其他设备/平台 | 未运行 | 本次只覆盖受影响桥接、匿名投影与 Kernel |

## 防复发门禁

1. 新版兼容先检查实际协议字段与匿名来源，不能从旧 requests 或 runtime flag 缺失推断无问题/无运行。
2. 普通正文、工具和元数据增量不得重订阅或改变真实计数；非法索引、revision gap 与 owner 变化仍走恢复。
3. 请求实例要有稳定匿名身份；只接受匹配的回答，旧快照不得打开墓碑，下一问题必须正常打开。
4. 活动因果序号只用同一单调计数器；时间戳只表达时间。不能以到达更晚替代因果更新。
5. 测试必须走 Desktop→活动/交互→Kernel，不能只验证 shadow 已移除请求；同轮 completed、其他待答问题和终态必须保留。
6. 安装、构建、已加载与用户正常反馈分别记录。窗口身份不符时不能据此推断 EyPc 未打开。

实现：[Desktop shadow](../../../../preload/codex/desktop-shadow.cjs#L126)、[请求投影](../../../../preload/codex/desktop-request-projection.cjs#L219)、[活动判定](../../../../preload/codex/desktop-activity-resolution.cjs#L130)。回归：[匿名生命周期](../../../../tests/platform/codexAsyncQuestions.test.ts#L1)、[桥接到 Kernel](../../../../tests/platform/codexAppServerBridge.test.ts#L6478)。

任务与历史证据：[task-card.md](task-card.md#L1)。用户现场正常反馈未替代上表的独立未验收项。
