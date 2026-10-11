# GPT 状态兼容验收记录

更新日期：2026-10-11。当前状态：`completion-wait-fix-automated-verified / host-acceptance-pending`。此前正常反馈后，用户再次报告漏识别，重新打开现场验收。

## 2026-10-11 宿主日志确认：完成时误清待输入

- 已加载版本确认：宿主诊断 handshake 的实际与预期一致，host-76c6e74e5efc0373bd5c / renderer-4a15620f21605ed7dcc5，对应 2026-10-10 15:24:18。
- 精确任务：261011-核验云机连接与管理。本次不连接其远端、不执行 SSH 命令，仅核对任务状态。
- 脱敏日志时间线（Asia/Shanghai）：16:06:16.697 running→waiting-input；16:06:18.754 waiting-input→completed；16:08:12.826 下一轮收到精确结构化回答。待输入只保持 2.057 秒，提前约 114 秒消失。
- 只读 IPC 对应三轮：首轮无问题；第二轮 completed 有一个问题且无答案；第三轮 completed 的 userMessage 精确回复第二轮的问题。日志与问题身份关联均支持完成事件误清，不是已答或旧版本。
- 更正之前判断：原生辅助函数仅描述生成期间即时标志，不能替代未答交互生命周期；上一轮撤回 completed 保留等待导致本次真实漏识别，现恢复最新 completed Turn 未答问题投影。
- 第二层已复现原因：完成发布与后续 activity 帧省略未变化的 opened 交互证据，Kernel 将该实例视为关闭并写墓碑。完成 publisher 现在携带当前交互，任意变化活动帧均携带仍 opened 的交互；保持身份和首次观察序号，不伪造新问题。
- 防复发回归：问题打开→轮次完成/runtime idle→连续读取仍 waiting-input→重订阅仍 waiting-input→下一轮精确接受回答解除；旧轮、不识别身份、failed/interrupted、回答墓碑不复活的原边界保留。

## 2026-10-10 历史续修（completed 判断已由上节更正）

用户截图确认 15:09:53 产物已加载，原生 SRM 任务有 Needs input。此前 completed 保留等待的解释不足；当前安装包原生判定只从 inProgress Turn 计算待答问题，故已撤回该尝试，保留正常终态关闭。

已自动化复现：Desktop 当前轮未答问题进入 Kernel waiting-input 后，重复同轮 turn/started 会清除等待墓碑并发布空交互，Kernel 被降成 completed。当前通过匿名轮次身份和时间确认重复启动，保留精确可见的未答问题；匹配回答仍正常解除，真正新轮次/终态/旧 Plan 重放边界不变。

新增回归先失败再通过；扩展 318/321，3 项已确认既有失败不变。截图中的两条任务在只读核对时已回答，因此未声称捕获它们真实等待期间的重复启动通知；此为可复现遗漏路径，真实新产物等待态仍待验收。

当前最终产物：2026-10-11 16:17:11；host-ffe4c0057ae65264f1f5 / renderer-5a403e7a7c3fea27a09b。类型、合同、构建和 uTools 产物检查通过。

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
| 定向生命周期 | 21/21 | 问题/部分回答/全部回答/新轮/终态、连续进度、旧暂停恢复、旧快照不复活、新问题重新等待、同轮 completed 防误恢复 |
| 扩展保留检查 | 319/322 | 3 项修复前已复现失败：Plan cycleTier、allowlisted Orca 调用次数、initialize 重试 Orca 调用次数；原断言保留 |
| 类型、合同、生产构建、uTools 产物 | 通过 | 当前 16:17:11 完整构建通过；当前暂存内容未另做隔离构建 |
| 源码只读 IPC / 宿主日志 | SSH 任务 completed 问题、下一轮精确回复与日志误清时间一致 | 有限匿名状态和宿主日志已核对；新构建现场验收仍待完成 |
| 用户现场反馈 | 15:09:53 已加载仍漏识别 | 截图证明旧修复产物加载；2026-10-11 16:17:11 新构建的等待态验收待完成 |
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
