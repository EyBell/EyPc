# GPT 状态兼容验收记录

## 2026-10-25 残留等待、新问题漏报与待继续跳变

最新追加：18:49:52 已加载18:21版，冷启动曾4进行中/0待输入，但热态新问题仍漏报；原生pending=1而宿主无shadow，不能结案。随后实测A单帧251039011字节，排除“并发协议缺陷”的过早推断，确认逐片Buffer.concat平方复制。2.38MB生产回归复制348042076字节先红；线性读取后转绿。真连接四项在4769ms收齐（A251220740、B28520242、本任务4936646、第四项5022652字节），复制总量289702106、残留0。第四项原生runtime当时idle，最终计数须以当前源状态为准，不强行维持旧4。新产物19:47:51，host-df1d950f6de45e0c2b99 / renderer-d5a67b79e87844756e5d，20:01:51已取得实际加载与有限实机闭环收据。

当前状态：`implemented / automated-verified / host-loaded / limited-live-verified`。最新产物为 EyPc V7 / host-df1d950f6de45e0c2b99 / renderer-d5a67b79e87844756e5d / 2026/10/25 19:47:51（北京时间）；此前18:49:52的已加载版本为e6948c8d，热态验收失败，不作为最终版通过。

| 编号 | 北京时间 | 已核事实 | 边界 |
|---|---|---|---|
| D01 | 15:08:23 / 15:17:39 | 目标旧异步问题已得到同 ID/下标的精确接受回答，15:50:31 EyPc 仍 waiting-input | 仅有限身份、计数和时序，未保存问题/答案正文 |
| D02 | 16:13:51 | 直接查询实际 owner 后定向 follow，生产解析当前 asyncPending=0，原生仍 active/inProgress | 单纯广播未取得当前快照；最早缺失帧未完整留存 |
| D03 | 16:02:32.381→16:02:33.228 | 旧宿主真实发布 running→stopped→running，间隔 847ms，附近为 owner canonical completed 判定 | 是 Host 上游状态发布；同窗口源 rollout 没有 task_complete/task_started/turn_aborted |
| D04 | 17:16:23.824 | host-bbe9fd094c914b2fc6f8 / renderer-77de88dcbc965e2305ed 实际/预期握手一致 | 首轮补丁已加载；不是最终库存订阅版 |
| D05 | 17:40 后 | 本任务真实新提问，独立生产投影 pending=1，浮窗仍进行中；17:46 再次核对仍进行中 | 已超宽限且两次观察失配；完整同源三层 canary 未取得 |
| D06 | 17:54:45.024 | 原首轮宿主才发布本任务 waiting-input，Float 包 60 有 applied ACK；用户后选择“本任务显示待输入” | 存在明显延迟，不能拿最终显示正常否定先前漏报 |
| D07 | 18:06:23.398 | 用户接受回答后本任务 waiting-input→running；原生浮窗也恢复进行中 | 旧包的真实解除样本，不是最终新提问验收 |
| D08 | 18:09 / 18:06 界面 | 两项水肥机当前 Goal RPC 都为 active；两次浮窗样本均在进行中 | A 显示核验中；源任务未改动 |
| D09 | 18:11:21.431 | host-7dc5ccaaf7a981055c04 / renderer-b00848e4adb78bef882a 精确加载，开始时三目标均无 shadow | 当前连接在线不等于已有状态订阅 |
| D10 | 18:14:17 / 18:15:57 | 与 EyPc 同一绝对 native binary 新建独立连接读取：三目标 thread/read 均 notLoaded，最新 Turn 均 interrupted；真实 owner 仍执行 | 证明以独立连接器 active 过滤 owner 查询会排除真实活动任务；不拿独立 interrupted 直接当终态 |
| D11 | 18:16:38 后 | 上一版依靠迟到的 owner 广播才陆续收到 shadow；没有执行 active 过滤下的 owner 查询 | 最终版移除该错误前提，订阅本身不推断状态 |

已复现根因一：广播订阅冷启动未及时取得实际 owner 快照；首轮恢复又要求连接器 active/已有 pending，因此既可能保留已答的旧问题，也可能完全看不到新问题。当前库存 owner 查询对 root 与已验证 Side 都不要求独立连接器 active，按原生轮次去重，并有 8 在途/1000 排队/5 秒超时的上限；旧 pending 复核仍只请求真实快照，不按时间清状态。

已复现根因二：独立 App Server 不共享另一个执行进程的 Goal 更新；root 只消费 RPC 缓存，缓存 none 后忽略 owner 的 active Goal，终态门禁也不复查 none。新组合回归精确复现：无 Plan 时误 completed，有 Plan 时误 stopped；随后 owner 新进度会恢复 running。现接纳当前 owner 的有限 Goal，并按时钟/因果序号拒绝旧值，active Goal 跨 canonical completed 保持 running。旧宿主从 10 月 22 日长驻至本轮重载，未留存当时 Goal 缓存值；该复现说明了匹配的错误路径，不宣称已逐帧还原每次历史跳变。

| 编号 | 检查 | 结果 |
|---|---|---|
| V01 | notLoaded/interrupted 冷启动→实际 owner→新问题→回答 | 旧实现未定位 owner 而失败，修复后 Kernel waiting-input→running |
| V02 | 缓存 none 后外部创建 Goal，有/无 Plan | 旧实现分别 stopped/completed，修后全程 running；保留所有中间包断言 |
| V03 | helper 与 Goal/主终态组合 | 最新聚焦 49 项通过；含队列、移除、Side 无 shadow、失败/迟到，以及现有 Goal 路径 |
| V04 | 正常核心选测入口 | [本地最终线性帧报告](../../../../output/verification/261025-linear-ipc-core.json#L1)：26项检查、463测试通过，执行时fresh=true；其后仅补现场/索引收据。包含13条Bridge组合及来源文件29条 |
| V05 | 构建与源码/包内门禁 | 类型、1935 模块构建、source/packaged 各 40 核心/58 生命周期/23 未读通过，镜像及预算另按正常入口核验 |
| V06 | 最终产物现场 | 19:47:51线性读取版20:01:51.028实际/预期Host与Renderer一致；待输入出现/回答解除及四项根任务在浮窗逐项核验通过，详见下表。旧版热态失败保留，不覆盖 |

### 最终宿主有限实机收据

| 编号 | 北京时间 | 证据 | 结论 |
|---|---|---|---|
| H01 | 20:01:51.028 | PID13801实际/预期均host-df1d950f6de45e0c2b99、renderer-d5a67b79e87844756e5d | 最终版已加载，前序旧包收据不混用 |
| H02 | 20:01:59.884 | 原生251430897字节帧解析/投影604ms，复制计数251433602；随后28.65MB帧178ms | 大包已被宿主消费，shadow不再一直缺失 |
| H03 | 20:02:00.071→00.077→00.096 | 本任务owner投影pending/visible=1；Kernel包12为waiting-input；Float包12 applied17ms | 真实待输入贯通来源、Kernel和Float |
| H04 | 20:02:04.781→04.789→04.983 | 同任务pending/visible=0，清除序号31715；Kernel包15恢复running；Float applied192ms | 用户接受回答后等待真实解除 |
| H05 | 20:02:08.733及20:07后复核 | Kernel包16为4进行中/0待输入；原生浮窗四项均在进行中 | 原两项水肥机、本任务、分润并行制度设计齐备；无强制改计数 |
| H06 | 20:08:15→20:08:28 | A的canonical completed→新轮，Goal始终active/fresh；该宿主stopped相位跳变总数0 | 实机自动轮次边界保持进行中 |
| H07 | 20:11收尾 | 原生列表与浮窗均新增一项活动E，合计5进行中/0待输入；原四项均保留 | 数量随真实新活动变化，不固定为4 |

原始宿主日志仅按精确匿名事件读取，没有复制到仓库。替换过程备份当前asar及18个原生依赖，保留[本地结构收据](../../../../output/recovery/261025-linear-host-replacement.json#L1)；本地报告、收据和备份不纳入Git交付，关键结果已记于本文。正式持续监控canary、全部现场生命周期和全库/MQTT未运行；有限闭环不冒作全部矩阵通过。历史847ms跳变对应的Goal缓存错误路径已先红后绿，但旧缓存值与全部原始帧未留存，无法逐帧归因每一次历史跳变。

修复归属：[库存订阅](../../../../preload/codex/desktop-request-projection.cjs#L142)、[精确旧请求复核](../../../../preload/codex/desktop-request-projection.cjs#L147)、[root Goal](../../../../preload/codex/desktop-shadow.cjs#L238)；[任务、设计与影响](task-card.md#L3)。Git交付以本轮提交与origin/main版本回读为准；全库/MQTT未运行，Bridge 全文件三个既有失败未重跑。不会把有限实机样本当成全部生命周期或持续监控 canary 已通过。

历史记录（2026-10-12）：当时状态为 `accepted-insertion-fix-automated-verified / host-acceptance-pending`。关闭问题卡片后强制插入普通消息的残留等待已补充处理。

## 2026-10-12 关闭卡片后强制插入继续对话

- 用户指出任务「261012-SRM-直发作废联动修复」。只读当前 IPC 快照确认 runtime idle，最新 canonical Turn completed；同轮先有一个 agentMessage 问题，随后有 accepted steeringUserMessage 普通文本，未含正式问题回复封装。没有输出或归档问题、输入正文。
- 根因：旧投影仅将匹配结构化回复作为回答；已接受普通插入不能结束同轮旧问题，因此已完成任务仍被合成为待输入。关闭卡片本身未取得单独协议撤回证据，不据此清除。
- 修复：已接受且非空的普通 steering 输入形成同轮顺序边界，只结束它之前的异步问题；后续新问题仍打开。pending/rejected、空输入、正式部分回答和损坏问题回复封装均不作为整体清除。
- 回归先失败后通过，匿名投影 19/19；桥接到 Kernel 的接受插入、正式回答和完成后保留等待 3/3。扩展检查 322/325，失败仍为下节已确认的三个既有失败（随后补充的普通插入 Kernel 场景单独通过）。
- 修复代码直接处理此任务当前真实快照：currentTurn completed / runtime idle / syntheticPendingQuestions 0。此为源码现场数据核验；原生 Codex 蓝色标签和 EyPc 新宿主像素未宣称修复验收。
- 产物：2026/10/12 10:05:38，host-7b61e2f0f4eba5f33798 / renderer-4ef59bdea35152a6bcbf。类型、合同、构建及 uTools 校验通过；宿主加载与现场显示仍待确认。Git 交付以提交记录及远端回读为准。

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

上一轮产物：2026-10-11 16:17:11；host-ffe4c0057ae65264f1f5 / renderer-5a403e7a7c3fea27a09b。类型、合同、构建和 uTools 产物检查通过。

## 行为与原因

| 症状 | 已验证原因 | 当前修复 |
| --- | --- | --- |
| 新版问题没有待输入 | 问题位于最新 Turn 的 agentMessage.questions，requests 与 runtime flags 不保证包含它 | 匿名问题投影；匹配结构化回复关闭对应问题，已接受普通插入只结束此前问题 |
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
