# GPT 新版待输入兼容

## 2026-10-25 任务状态与订阅续修

- 过程更正：18:21版热态样本仍漏报；原生 A 快照头实测 251039011 字节、B 28375634、本任务约4861040、第四项4426230。旧 handleData 每片 Buffer.concat 的 2.38MB 回归产生348042076字节复制，已先红；增量改为原有256MiB上限内一次分配、线性分片写入，回归转绿。验证覆盖UTF-8/头部拆分、多帧、非法长度、重置释放和消费方拒绝，不改业务状态或协议上限；此前“并发协议问题”的猜测撤回，串行源读取也被大帧拖延。

- 当前状态：`implemented / automated-verified / host-loaded / limited-live-verified`；19:47:51 最终版已于20:01:51精确加载，完成本轮有限实机闭环；此前旧版加载与失败样本仅作为历史证据，详见核验记录。
- 用户范围：核验两项水肥机任务、排查短暂待继续，并处理本任务新问题漏显示待输入；不发送消息给源任务，不改其 Goal、归档或回答。
- BusinessChangeReview：沿用 [RAW-207](../../requirements/shared-raw-207.md#L1)、[RAW-162](../../requirements/shared-raw-162.md#L1) 与现有交互/Goal 合同。独立 App Server 把其他进程正在执行的任务报成 notLoaded/interrupted；恢复不能要求连接器 active，也不能以已有 pending 为前提。仅对已验证库存 root/Side 有界查询实际 owner，再按现有 snapshot/patch→Kernel 产生状态。
- 订阅实现：[库存 owner](../../../../preload/codex/desktop-request-projection.cjs#L142) 初次连接和原生轮次变化时查询一次；最多 8 在途、1000 排队、1000 去重项、单请求 5 秒超时，响应/超时释放队列；移除、断连和轮次变更拒绝迟到结果。既有精确异步等待另保留 20 秒宽限复核，失败或超时不清等待。无新增轮询器。
- Goal 实现：[当前 owner Goal](../../../../preload/codex/desktop-shadow.cjs#L238) 只接纳有限状态、updatedAt 与因果序号，补齐 RPC 缓存 none 后外部创建 Goal 的缺口；较新缓存时钟/同钟序号、未知/断连、Side 合同和唯一 Kernel 仲裁保留。
- VerificationImpactTrace：库存 notLoaded/interrupted＋无 shadow→定向 snapshot→新问题→接受回答；排队限流、迟到/移除/断连、失败保留；缓存无 Goal＋外部 active Goal＋有/无 Plan→单轮完成全程 running；既有 Goal/终态/Side/问题增量和隐私门禁。三条新缺口均已取得旧实现失败，聚焦通过；正常核心入口26项检查/463测试通过（执行时fresh=true，随后仅补现场/索引收据），不运行全库或 MQTT。
- 产物：EyPc V7 / host-df1d950f6de45e0c2b99 / renderer-d5a67b79e87844756e5d / 2026/10/25 19:47:51（北京时间）。源码、public、dist构建校验通过；20:02:00待输入出现、20:02:04接受回答后解除、20:02:08恢复4进行中/0待输入；20:11新增活动E后源/UI均5/0，原四项齐备。Git交付以本轮提交与origin/main版本回读为准。实机证据与历史限度见 [verify.md](verify.md#L3)。
- 帮助影响：本轮恢复既定状态合同，未改变操作步骤、默认值或入口；现有 [Codex 指南](../../../../src/help/guides/codex.md#L209) 已描述等待优先及活动成员聚合，无须增加操作说明。

2026-10-12 续修：已接受普通强制插入按同轮顺序结束旧问题，后续新问题与正式部分回答边界保留。真实快照投影零个旧请求、19/19 匿名回归和 3/3 Kernel 定向回归通过；10:05:38 产物已构建，宿主验收待确认。Git 交付以提交记录及远端回读为准。

## 2026-10-11 当前续修

- 已用开启的 EyPc 宿主日志确认 15:24:18 已加载，SSH 排查任务的待输入在完成事件后两秒被清，回答晚于状态清除。当前修复最新 completed 未答问题保留，并补连续读取/重订阅/下一轮精确回答的 Kernel 回归。现场新版本验收待完成。
- 日志事实与判断更正：[verify.md](verify.md#L5)。昨日同轮重复启动修复仍保留，不能替代本次完成后等待生命周期。

## 历史续修记录（2026-10-10，completed 判断已更正）

- 最新状态：用户再次报告指定任务漏识别；截图证明 15:09:53 产物已加载但仍漏识别。已复现并修复重复同轮启动通知清除等待的路径；撤回 completed 保留等待的尝试以对齐原生规则。Kernel 回归通过，现场等待态验收仍打开。详见 [verify.md](verify.md#L5)。

## 此前结案记录（2026-10-10）

- 状态：`implementation-landed / focused-automated-verified / user-reported-normal`。用户反馈当前应该正常，要求同步记录、防复发并提交推送；这不是逐项现场矩阵或精确宿主版本证明。
- 当前行为与验收：[verify.md](verify.md#L1)。以下首轮与续修段落保留为历史证据，其旧 host-pending / 调查中状态不作为当前状态。
- 防复发：[新版异步问题与运行证据](../../../knowledge/error-memory/codex-canonical-async-question-lifecycle.md#L1)、[序号量纲](../../../knowledge/error-memory/comparison-set-mixing-counter-and-timestamp-units.md#L1)、[普通增量不重订阅](../../../knowledge/error-memory/codex-unobserved-private-patch-must-not-resubscribe.md#L1)。
- Git 范围：用户随后将其余改动也纳入分批提交推送。状态修复、浮窗拖动、ChatGPT Projects 索引和文档收尾分别提交；原有 13:49 工作区产物仅为该时刻构建证据。


## BusinessChangeReview

- 基线： [RAW-207](../../requirements/shared-raw-207.md#L1)、[V7](../../260824/eypc-v7-global-refactor/spec.md#L1)。同轮未决交互高于 running；旧请求、审批、Plan、清除墓碑、匿名状态与唯一 Kernel 不变。
- 允许增量：兼容本机 GPT 26.1007.21159 (20052) 的异步 agentMessage.questions。当前安装包将未回答问题从进行中 Turn 的问题与已接受回复计算，不保证 requests/activeFlags 含等待标记。
- 影响：Desktop snapshot/patch → request projection → activity/interaction → Kernel → 主列表、浮窗、角标、快捷入口。
- 不改变：状态优先级、未读、置顶、任务范围、正文存储策略。无新增需求；修复 RAW-207 的来源兼容。
- 测试增量：新增异步请求生命周期回归，保留现有断言。
- 限制：安装包协议核验不等于现场宿主闭环验收；不自动重载 uTools。

## VerificationImpactTrace / 本轮待测试清单

- Changed surface：Desktop shadow 的匿名异步问题投影与 live patch；桥接活动判定。
- Selected checks：问题出现、多个问题部分/全部回答、非 accepted steering 不清除、终态关闭、新轮隔离、完整 snapshot 与增量 patch、匿名字段；现有 App Server bridge 与 Kernel 回归。
- Skipped：全仓测试、真实宿主 UI（现有计算机工具未选到 EyPc 窗口）。
- Build：Runtime Identity 输入变化，按本项目版本同步规则生成产物并回写真值。
- Outcome：实现和自动化验证完成，artifact-ready / host-reload-pending。

## 首轮核验结果（续修见下）

| 检查 | 结果 | 边界 |
| --- | --- | --- |
| 新版协议 | 已核验本机安装包版本 26.1007.21159 (20052) | 异步问题源于 agentMessage.questions；只接受 accepted steering 或 userMessage 的结构化回复 |
| 新增回归 | 10/10 通过 | 9 个匿名投影用例 + 1 个 Desktop→activity→Kernel 生命周期用例；旧实现无法通过新增桥接用例 |
| 聚焦回归 | 三文件批次 305/308；随后新增新轮隔离用例通过，叶子用例最终 9/9 | 三个既有失败在隔离的修复前副本同样复现：Plan cycleTier；allowlisted 调用次数；initialize 重试的 Orca 调用次数。未修改其断言 |
| 保持旧行为 | 普通正文 patch 不触发重订阅回归通过；原 Kernel 126/126 | 正文更新不产生等待；不改变既有审批、Plan 或未读规则 |
| 产物 | 类型检查、合同、生产构建、uTools 产物校验通过 | 不是宿主加载证明 |
| 静态门禁 | preload 入口预算通过，镜像同步校验通过，差异空白检查通过 | 已有项目索引文件仍未提交，原有工作区改动保留 |
| 需求真值 | 回写并校验通过 | 保留既有 2 个未确认 proposed 条款；本任务不新增需求 |
| 真实宿主 | 未运行 | 需重新加载 uTools 插件后验证新提问、部分回答、全部回答及轮次结束 |

## 当前产物与交付

- core：EyPc V7 (V7)
- host：host-67f346cebf8952a3cb9a
- renderer：renderer-5ffed82b3878ad0f49e1
- builtAt：2026-10-10 14:03:11（北京时间）
- 当前产物包含已分别核验的状态、浮窗与项目索引改动；提交与推送按当前授权分批进行，未重载宿主。浮窗与项目索引的真实宿主验收保持独立。
- 帮助已同步 [Codex 指南](../../../../src/help/guides/codex.md#L1)；架构已同步 [ARCHITECTURE](../../../knowledge/ARCHITECTURE.md#L1)。
- canonical history 的常规实体/消息/问题/回复变化现已支持匿名增量更新；只对缺失结构或无法还原的排序变更恢复快照，尚无真实宿主传播时延数据。
- 代码：[Desktop shadow](../../../../preload/codex/desktop-shadow.cjs#L124)、[请求投影](../../../../preload/codex/desktop-request-projection.cjs#L201)。
- 证据：[匿名投影测试](../../../../tests/platform/codexAsyncQuestions.test.ts#L1)、[桥接测试](../../../../tests/platform/codexAppServerBridge.test.ts#L6478)。

## 续修：进行中角标与数字跳变

- 用户补充：进行中角标反复跳动，数字同时变化。本轮允许增量是消除普通进度事件导致的错误状态恢复，不冻结真实状态、不掩盖真实计数变化。
- 影响与保持：Desktop canonical history / turn patch → interaction 与 activity → Kernel counters；保留异步问题的出现、回答、终态、新轮隔离和旧审批/Plan 合同。
- 本轮待测试清单：连续 reasoning/tool/元数据更新不重新订阅、不增加重复确认、进行中任务与计数不变；canonical 问题增量出现与回答清除；普通消息更新不泄漏；原异步问题回归与受影响 bridge/Kernel 检查。
- 原因已在回放中复现：普通 canonical 工具 status patch 让 waitingEdgeResubscribe 从 0 增至 1；恢复流程会清掉非等待态 shadow 并退回 connector，构成角标计数反复撤回/恢复的路径。该回归由首轮默认拒绝 canonical patch 引入。没有将回放当作现场视觉验收。


### 续修结果

| 检查 | 结果 |
| --- | --- |
| 连续进度回放 | 20 轮普通工具状态/输出/耗时更新：重订阅计数不增长、running 任务集合及公开 active 角标计数不变；随后真实问题立即进入 waiting-input，active 计数减少 1 |
| 定向回归 | 15/15：匿名问题 12 项、两项生命周期/连续进度桥接、一项普通正文退出回归 |
| 扩展保留检查 | bridge + async + Kernel 310/313；失败仍为首轮已隔离复现的三个基线问题，断言未改 |
| 测试期望变化 | questions/terminal 的可还原增量由“请求快照”改为“直接应用”，新增断言验证交互正确清除；未知下标、非法问题数组仍拒绝，非 accepted 回复仍不能清除 |
| 产物 | 类型检查、合同、生产构建和 uTools 产物校验通过；当前四元组见上方交付 |
| 文档 | 架构已同步匿名 canonical 索引及增量边界；交互语义未变，操作帮助仍适用 |
| 现场边界 | 常规 uTools 日志目录无可用日志；未重载插件、未完成现场视觉验收。需对当前产物验收持续运行时角标稳定及真实输入切换 |

本轮只消除错误恢复路径，没有用计数延迟、冻结或 CSS 隐藏来掩盖真实变化。既有浮窗/项目索引改动保留，未提交或推送。


## 续修：进行中误归待继续

- 当前目标：兼容新版 live turns 的运行生命周期，确保恢复运行事件能够撤回旧 interrupted 判定；不改变审批、等待、未读及真实中断规则。
- 现场对应：用户指出采购供应商带出任务；当前 Codex 只读目录返回该任务 active。插件日志目录为空，尚未取得同一时刻插件匿名状态或宿主载入版本，故未宣称现场根因已闭环。
- 代码缺口与复现：live turns.status 从 interrupted 变为 inProgress、threadRuntimeStatus 仍 idle 时，旧实现 Kernel 保持 stopped；新回归在改动前失败。turn 数据此前仅供异步问题使用，未触发 activity 发布。
- 修复范围：仅最后一个有身份的 live Turn 提供补充运行证据，canonical 历史与较早 overlay 不复活任务；Turn 运行边沿进入统一 activity/Kernel，真实完成撤回补充运行证据；保留 targeted suppression 与 current interaction 优先级。
- 待测：中断后运行恢复、真实完成计数退出、idle runtime 下当前 Turn snapshot、历史旧 running 隔离、targeted suppression、原 async/bridge/Kernel 回归与构建门禁。
- 自动化结果：旧实现新增桥接回归失败（stopped 而非 running）；修复后恢复运行、随后完成退出和 active 计数撤回均通过。最终定向 18/18；扩展 async/bridge/Kernel 311/314，失败为此前隔离复现的三个基线问题；新增两项 latest-Turn/suppression 边界测试随后随定向批次通过。
- 门禁：类型检查、合同、生产构建、uTools 校验、入口预算通过；匿名数据不含 Turn 身份原文或正文。
- 当前产物：见上方四元组，artifact-ready / host-reload-pending。未重载 uTools；实际插件加载版本、同一现场任务恢复运行及结束行为仍待验收。
- 核验入口：[桥接回归](../../../../tests/platform/codexAppServerBridge.test.ts#L6478)、[运行边界](../../../../tests/platform/codexAsyncQuestions.test.ts#L137)。


## 现场续修：canonical 运行证据与回答后残留等待

- 范围：用户重载后仍误归待继续，并补充提交决定/回复后残留待输入。两者继续作为状态兼容修复，不新增业务需求。
- 当前现场证据：私有 IPC 只读订阅三条任务，协议 v11 连接成功，runtime active、live turns 空、canonical history 持续进度；源码只读桥接当前可识别运行态，不能等同于现有 uTools 宿主像素验收。已找到安装 ASAR 中 12:20:27 产物，未把“已安装”作为“已加载”证明。
- 核验修正：计算机工具误选金价插件窗口，已停止据此推断 EyPc 未打开；当前工具没有 macOS 多窗口清单，用户确认 EyPc 工作台和浮窗一直打开。
- 待测试与定位：旧 interrupted 抑制 active snapshot 后，真实当前 canonical 进度应恢复活动；已接受回答撤回当前问题及同因果旧 runtime waiting flag；旧 unanswered Turn 不能跨新版最新终态复活；保留未知/非 accepted 回复、部分回答、新问题、旧快照墓碑和真实终态边界。
- 修复：最新 canonical Turn 的匿名进度可撤回旧 interrupted 抑制；只读取最新轮次的待回答问题。接受匹配回答后，精确撤回该问题与同因果旧 runtime waiting；初次问题与回答关闭都携带可比较的单调活动序号，避免初次等待的时间戳序号压住后续恢复。
- 验证：async + bridge + Kernel 316/319；失败仍为已独立复现的三个既有问题，断言未修改。新增桥接覆盖旧暂停恢复、runtime waiting 延迟、旧快照不复活已答问题、下一问题重新等待；新增纯函数覆盖同轮/旧轮 completed 不被恢复证据打开。类型检查、生产构建、uTools 产物通过。
- 现场边界：源码私有 IPC 连接已核验；当前产物在 public/dist 中，尚未取得真实已加载 EyPc 的版本及像素闭环，不能据此宣称用户现场已修复。未重启或重载 uTools。

- 最终定向回归：19/19（包含新的 completed 同轮边界）；镜像 95 对通过、入口预算 14804 / 279 / 163 通过、需求真值与来源锚点通过、diff 空白检查通过。
- 最新源码只读运行核验：当前任务 `desktop-live / active / inProgress`，旧 active 抑制为 false，待输入请求数 0；隔离临时目录运行，未改 uTools 配置，不是已加载宿主或像素验收。


## 提交收尾核验（2026-10-10）

- 状态独立暂存构建通过；扩展回归更新为 317/320，既有三个失败未新增或改断言。
- 浮窗回归 56/56、项目索引 5/5；原生几何夹具已隔离真实文件监听，测试干净退出。
- 完整工作区类型、合同、生产/uTools 构建通过：EyPc V7 / host-67f346cebf8952a3cb9a / renderer-5ffed82b3878ad0f49e1 / 2026-10-10 14:03:11（北京时间）。代码身份与 13:49 产物一致，构建时间更新。
- 防复发叶子、唯一模块归属及文档代码链接均按当前收尾核验；不把用户正常反馈扩写成所有平台或逐项现场验收。
