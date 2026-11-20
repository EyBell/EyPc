# Codex 状态改造的规则提取与适用范围

八条风险归纳成六项可在设计、实施或验收时直接核对的判断。每项注明现有项目依据、本专题实现的边界，以及支持判断的证据。适用对象是 EyPc 的 Codex 状态链和它实际使用的共用 V7 能力。实施状态沿用交付台账。[按风险查批次与验收](delivery.md#risk-map) · [项目当前产品约定](../../PRODUCT_REQUIREMENTS.md#L259)

<a id="interaction"></a>

## 1. 问题按成员、轮次和请求实例开闭

已有项目规则允许同一轮生成已结束而用户仍待答。结构化答复、撤回和协议认可的取代事件必须能定位原请求。粗粒度运行恢复只足以清退粗粒度等待标记，其他成员完成也不能关闭这个请求。R1、R4 已处理同帧换问和多轮并存，将可识别的开、闭实例同时交给 V7。手测同时看成员、根任务与快捷入口。[既有异步问题规则](../../../knowledge/error-memory/codex-canonical-async-question-lifecycle.md#prevention-rule) · [R1](delivery.md#r1) · [R4](delivery.md#r4)

<a id="goal"></a>

## 2. Turn 终态和 Goal 结束分别判断

已有规则让活跃 Goal 跨多个 Turn。R2 记录 Goal 明确清除的序号与已知旧版本。缺少可比较身份时，按线程和当前来源发起定向读取。清除后到达的旧快照继续失效，新建事件或清除后针对当前代次的有效核验可重新约束任务。没有看到 Goal、查询失败与明确清除分开记录。长 Goal 跨轮和真实新建是两条需要保留的正例。[已有 Goal 规则](../../../knowledge/error-memory/codex-turn-completion-is-not-goal-completion.md#prevention-rule) · [R2](delivery.md#r2)

<a id="command"></a>

## 3. 旧操作回执只结算原操作

已有 V7 项目经验把 Plan 产物、交互和轮次分别比较。R3 将继续／实施回执绑定原操作和目标版本，执行前复核目标、Plan 及权限。真实新轮启动进入 V7 后即可推进状态。回执迟到时保留后来已接纳的完成、等待或新版 Plan。结果未知时复核原目标，防止再次发起同一原生写入。该细节仍待同操作迟到样本验证。[项目 Plan 因果规则](../../../knowledge/error-memory/companion-plan-lifecycle-and-interrupted-causality.md#prevention-rule) · [R3](delivery.md#r3)

<a id="recovery"></a>

## 4. 暂存由证据接纳解除，询证由证据到齐解除

R6 保留首包前的增量及连接代次。接纳、确认重复或被同源完整基线覆盖后才消耗该条增量。R7 保留在途合并与退避。单次超时结束此次尝试，目标仍缺证据时可在原预算内补查。匹配快照到达、更强终态覆盖或成员关系失效时，关闭相应需求。预算耗尽保留待核验。固定超时和退避参数由 Host 调度，业务相位由 V7 裁决。前序样本证明一次暂存重放和一次超时恢复，两个专项排列仍待采样。[已有定向确认经验](../../../knowledge/error-memory/codex-fixed-debounce-delays-terminal-confirmation.md#L69) · [成员关系退役依据](../../../knowledge/error-memory/companion-admitted-side-relations-generation-retirement.md#L29) · [R6](delivery.md#r6) · [R7](delivery.md#r7)

来源去重可以抑制已暂存的重复事件。只有内核接纳或有同成员、同通道的覆盖证据才能结算暂存。请求集版本按成员比较。根视图、快捷目标和持久收据在归约完成后提交一次。供应方完整清单只证明成员范围，确认未读、请求或 Plan 还要检查对应通道。[复核后的处理顺序](delivery.md#architecture-review)

<a id="render"></a>

## 5. 按窗口和包版本确认已显示

项目已有发布、收到、应用三阶段的明确定义。R5 已收紧歧义回执，拒收 N−1 仅证明窗口曾收到更新版本。当前窗口实际渲染 N 才登记 N 已应用。M > N 已实际渲染可以停止补发 N，并记录取代关系。换窗后重新确认。按同一包版本计算发布至应用时延，缺少一端时保留未知。[既有浮窗回执规则](../../../knowledge/error-memory/companion-consumer-cache-and-float-applied-ack.md#prevention-rule) · [R5](delivery.md#r5)

<a id="startup"></a>

## 6. 启动阻断范围取决于能否界定受影响任务

R8 已将可完整解读的旧暂停收据与未知格式分开处理。旧数据写入失败时暂缓涉事根组的展示、循环及操作。能证明某任务不依赖损坏记录时，才有依据为它提供可信状态。集合未知时继续执行全局阻断。恢复以兼容数据可读，或迁移写入并回读一致为准。实机验收仍需覆盖其他来源的 Plan、暂停可见性和快捷候选。[现有迁移失败用例](../../../../tests/platform/codexAppServerBridge.test.ts#L1491) · [R8](delivery.md#r8)

<a id="disposition"></a>

## 从项目经验提取通用规则

| 序号 | 可以复用的表述 | 已有主本与本次处置 |
| --- | --- | --- |
| 1 | 同一事件的发生、观察、登记各用原证据。缺同一对象或同一版本的端点时，相应时延保留未知。 | 沿用 CodeNote 的关键事件约定。EyPc 补充原生事件至浮窗应用的实例，用于分段核验。[关键事件记录](../../../../../../../czz/CzzProj/CodeNote/AiRef/VibePractice/Vibe_Rules/process/rules.md#task-event-records) · [真实事件顺序](v7-state-redesign-plan.md#L32) |
| 2 | 每种回执只证明自己观察到的阶段。一次发送、一次执行返回、一次实际渲染各有对应对象。 | 全局通信已有回执分层。命令回执与浮窗渲染是本项目的两种具体应用，适合向既有主本提供带条件的案例。[通信回执分层](../../../../../../../czz/CzzProj/CodeNote/AiRef/VibePractice/Skills/tools/codex/orchestrate-codex-agents/references/communication-contract.md#receipt-dimensions) · [R3](delivery.md#r3) · [R5](delivery.md#r5) |
| 3 | 阻断记录应写清它保护的对象、覆盖范围、解除证据以及来源变化后仍有效的部分。 | 全局已有局部失效与更正原则。首包接纳、询证退避和暂停存储的具体条件已进入 EyPc 源码，实机待验。若后续遇到跨项目相同问题，可把原证据和适用条件交原规则负责人评审。[局部失效与更正](../../../../../../../czz/CzzProj/CodeNote/AiRef/VibePractice/Vibe_Rules/process/structured-relations.md#version-validity) · [R6](delivery.md#r6) · [R7](delivery.md#r7) · [R8](delivery.md#r8) |

当前处置为复用现行原则、保留项目差异待验。后续如决定正式采纳，回填原项目规则或相应全局主本、决定来源与实际采用证据。实现参数与宿主版本继续由项目维护。 本专题 R1–R8 属于状态改造，既有思路 R01–R12 属于原规则统筹主题。跨项目提案可沿已登记的 EyPc 统筹入口追到原负责人。[EyPc 规则统筹与接受范围](../../261113/task-action-path/rule-optimization-index.md#L236)

<a id="native-parity-candidates"></a>

## 原生状态复核后的项目规则候选

1. 成员的原生轮次结果、整组待处理状态、读态和写操作资格各有证据。只读位发生变化时，成员的中断、失败和继续资格据原有事实处理。[R9](native-status-parity-plan.md#r9)
2. 「待继续」可保留为分组。组内应保留触发成员及原因，让使用量或预算受限、真实中断、失败和 Goal 暂停均有可理解的处理入口。[R10](native-status-parity-plan.md#r10) · [R13](native-status-parity-plan.md#r13)
3. 多个并发成员独立保留活动，只有命中该成员和因果范围的证据才解除它的旧标记。原生组活动和成员活动分别记录。[R11](native-status-parity-plan.md#r11) · [R15](native-status-parity-plan.md#r15)

候选的适用条件、实现和原生画面验收由 B04–B06 跟踪。[后续批次](delivery.md#parity-batches)


<a id="native-parity-implementation"></a>

## B04–B06 的项目验证结论

1. 成员活动保护绑定关系、来源与 Turn。App Server 的同时活动可按成员接纳。旧同秒终态需要匹配身份，精确新轮可推进对应成员。普通 Side 的独立恢复继续核定当前 owner 和持久依据。[B04 现场边界](delivery.md#b04-b06-review)
2. Goal、Turn、交互、Plan 与未读各保留各自事实。读态只决定未读入口。原生未加载、系统错误、未知及待发送确认由受信证据说明。继续按 V7 当前根资格和执行前原生复核决定。[B05 核验](status-read-investigation-261116.md#b04-b06-verification)
3. 同一事件取样复用。来源去重与公开包变更各自使用现有水位。浮窗仍在当前窗实际应用后回执。源码和随包回放已核，现场待新版握手。项目准则候选留在本专题，记录随实机证据更新。[B06 进度](delivery.md#b06)

回归复核补充两项可复用检查。第一，旧包若混有新鲜独立证据，按各自版本接纳。被拒的 Turn 同时失去附带标记的资格，较新的 Goal 仍按线程推进。第二，归组、快捷候选和执行权限共享 V7 投影。核验未读确认时，同时观察根组、未读角标和通用循环，核验旧 Plan 时同时观察保留版本和当前可执行入口。 [复核场景](delivery.md#parity-regression-review)

空的完整查询结果也可以供证。人工 Side 的完整空页须能绑定当前关系和来源，且与 Turn 及待办证据相容。V7 由此保留成员并决定它是否参与根相位归约。回放覆盖只有关系、查询失败、读取后出现待办和首轮启动。 [R22 根组裁决与验收边界](delivery.md#r22)

<a id="connection-and-evidence-validity"></a>

## 连接换代后的规则候选

1. 已建立的实时连接退出时，让该代事件、owner 权限和在途回执失效。已接纳的持久事实另按账号、成员、关系、轮次及持久记录核验后复用。空页说明已核验的历史范围，当前待办和新活动需要对应来源供证。[R24](delivery.md#r24) · [R22 现场](status-read-investigation-261116.md#post-codex-update-261120)
2. 归组缺证应能指出缺证成员。已确认的主轮中断或完成仍作为独立事实展示。继续资格由 V7 根据准确主轮和当前成员阻断计算，执行器复核当前原生资格。浮窗与快捷入口同版消费。[R25](delivery.md#r25) · [B09 验收](native-status-parity-plan.md#post-update-acceptance)
3. 子成员仍挂接、旧轮已结束、当前有活动各自取证。旧轮的终态何时退出根组相位，取决于准确关系、轮次顺序和当前活动覆盖。原结束结果在成员历史保留。[R26](delivery.md#r26)

以上是本专题候选。B07–B09 的实现和验收完成后再评估适用范围。[分批进度](delivery.md#post-update-batches)

<a id="reopen-evidence-rule-candidates"></a>

## 重开续修的规则候选

1. 区分尝试连接和取得实时权限。已建立连接退出才使该代在途实时证据失效。失败的重连尝试按连接诊断记账，桌面退出使用进程证据。已接纳的历史仍按原生身份、成员关系和记录版本校验。[B07](delivery.md#b07)
2. 同一份原生文件可以给出多个独立事实。读态绑定缺失时，置顶变化仍可触发分区回读。取不到确认结果时留在该通道核验，已有活动或读态继续有自己的来源。[R27](delivery.md#r27)
3. 持久记录和热事件都应更新同一产物生命周期。Plan 就绪只提交产物证据，真实待答和审批按当前请求实例独立开闭。已确认主轮停态可以和 Side 待核验并存，依赖整组覆盖的写动作继续受阻。[R28](delivery.md#r28) · [R25](delivery.md#r25)

这些约束当前用于 EyPc。候选包已构建，主子交叉和实时接替仍待验。
