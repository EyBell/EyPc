# 任务进行中与完成未读误判排查方案

日期：2026-11-16，时间均为上海时间。归属 `SPEC-261114-CODEX-STATE-SYNC`，沿用[原规格与验收清单](raw-requirement.md)。用户已选择允许最小公共内核修正，并明确要求执行；当前进入实现，实际加载及行为验收仍待完成。

## 已授权实施与分工

- 接受方向：稳定匿名Turn身份替代时间构造身份；同身份且同事件域时按真实因果序列比较；未知及其他Provider保留既有判定。机器身份独立于近期发现缓存。旧错误节点仅按当前owner的完整目标证据受控恢复，不清全局缓存、不写原生已读。
- planned_child_count=2，模型继承当前宿主默认，后端实际模型未独立核验。Root负责Codex shadow/活动解析/入口、恢复证明、整合与文档。执行者一独占subagent-discovery模块，负责统一机器身份；执行者二独占branch-causality/task-kernel/evidence-adapter模块，负责身份比较、受限恢复与决策诊断。入口接线只由Root编辑。
- 两执行单元无相互依赖，均依赖本节字段约定；整体交付依赖两者及Root接线。禁止修改测试、生成镜像、安装态、原生数据、其他Provider业务语义；不得继续派发。
- 内部字段约定：`causalKey`为匿名Turn身份，新增`causalDomain`用于连接/来源证据域；`activityRebase`只经Host证据路径传递，绑定expectedCausalKey、expectedPhaseRevision、当前causalDomain及真实snapshotRevision，只有Root来源校验完成后创建。默认无该字段，无UI入口。
- 旧编排账本doctor只读检查发现Root仍为原聊天且无有效授权/宿主绑定；本聊天不冒领或改写原Root。原生派发按当前用户执行授权及上述明确写集开展，CLI治理绑定保持未核验，不宣称两段登记已通过。

### VerificationImpactTrace

- Changed surface：Codex轮次、机器身份、私有V7证据、公共因果比较与目标节点恢复。
- Affected set：Bridge→私有分支→V7成员→父子归并→Main/Float/计数/快捷循环；其他Provider无新身份字段时走原逻辑。
- Selected checks：源码语法/差异/接口与调用静态核对；本文件V01–V12为待手测清单，另核无新字段时其他Provider旧分支。构建仅自然Stop Hook。
- Skipped checks：不新增或运行自动化行为测试，不主动启动宿主、不安装重启、不手动构建；真实交互由用户受控触发。
- Escalation：发现公共快照需变版或真实其他Provider语义受影响时先说明具体差异；当前计划不包含这些变更。

## 1. 用户问题与范围

1. `261114-EP-完成任务状态同步排查` 已完成、已读，却仍在进行中，显示 `sub+3`。
2. 用户补充 `261114-EYPC-同步构建钩子规则` 的完成未读也有错误，显示 `sub+5`。本轮核查主分支已读及子分支未读传播，不把截图单独当作原生状态证据。
3. 读取现有本机诊断及指定任务的 SQLite 元数据，静态追踪 Bridge、私有分支证据、V7 Kernel 和展示映射。不读取会话正文、不修改原生状态；不运行自动化测试、主动宿主探针、构建、安装或重启。
4. Root负责现场证据、Kernel/展示、第二问题及方案；一名原生只读执行者负责 Desktop 结构与主分支投影，未改文件。请求模型继承宿主默认，实际后端模型未独立观测。派发治理 Hook 为 fail-open 且报告预检绑定未核验，不补造事前登记。

## 2. 当前结论

| 序号 | 问题 | 已证事实 | 尚待补证 |
| --- | --- | --- | --- |
| 1 | 完成已读仍运行 | Bridge 已认可主任务完成；已读已被识别；对应四成员组只有根节点持续 running，三个子节点最终全部 completed | 实际发出的根候选及 Kernel 拒绝原因；运行与完成两份起点是否对应同一个匿名 turnRef |
| 2 | 完成误标未读 | 指定主任务 observation 已读；五个子分支中一个仍贡献未读；六成员组最终 completed/unread；原生元数据中该父任务的五个直接子任务均为 subagent | 具体贡献未读的子节点与机器身份缓存失效入口。现有日志未逐子节点记录 unread/source 判别 |

这不是仅凭颜色作出的判断。第一处终态已到达，不能继续解释成“协议拒收完成”；第二处主分支已读已到达，不能继续解释成“本机未读绑定完全失效”。两者都在证据到最终组状态之间失真，但不是同一个缺陷。

## 3. 现场证据

证据源为既有 `runtime-1794793786853-1.jsonl` 诊断文件，位于本机 uTools 的 `eypc-diagnostics`；这里只保留结论、事件序号和时间，不复制原始日志。任务通过原生 ID 的生产摘要算法匹配 `root-unread-evidence` / `desktop-main-terminal`。Kernel事件采用进程随机盐，结合连续事件、成员数和稳定成员引用关联；不同诊断接口的摘要不能直接比较。

### 3.1 加载与连接

1. 09:49:46.934，事件3：实际与预期 Host/Renderer 一致：`host-94a52604d80652934760` / `renderer-b8e50f43a7ff42bc9146`，Kernel为V7，产物就绪。该二元身份也与本轮读取的 public runtime identity 相同。
2. 09:49:47.294，事件19：Desktop Bridge connected。
3. 上述是当前会话的加载身份与连接证据，不代表所有S01–S10通过；不能把 public 当前 builtAt 与较早加载时刻写成同一次构建。

### 3.2 完成已读仍运行

1. 09:49:51，该四成员组曾为 completed；09:50:01.987，事件318：主节点转 running，`phaseRevision=2411`，`turnStartedAt=1794793801803`。
2. 10:00:04.183，事件1225：精确命中所指任务，`desktop-main-terminal` 接纳 `owner-canonical-terminal`，完成起点为 `1794793801474`；随后既有终态被继续认可。
3. 10:00:04.209，事件1226：canonicalStatus completed、pendingCount=0、visibleCount=0；10:00:07.300，事件1249已有 `turn-completed` 终态依据。
4. 10:00:07.329，事件1250：对应四成员组的三个子节点均 completed，主节点仍 running，仍保留运行起点 `1794793801803`。不能归因于“还有一个子任务工作”。
5. 10:01:06.412，事件1443：组未读为已知 false，但phase仍running；10:10:53附近终态仍获认可，组仍running/已读。
6. 运行起点比终态起点晚329ms，是实际字段差值；目前未读取原生同轮引用以确认两者的身份关系，不能声称已经证明其中一个来自本地 `Date.now()`。

### 3.3 完成误标未读

1. 按原生 `name` 精确定位“同步构建钩子规则”，未从聊天正文推断身份。
2. 10:16:10.243，事件2848：主分支 `observationKnown=true`、`observationUnread=false`，`branchCount=6`、`sideKnownCount=5`、`sideUnreadCount=1`。10:16:25.646，事件2893仍如此。
3. 10:16:10.351，事件2860：对应六成员组phase completed、runningMembers=0，却仍归入unread。
4. 原生 SQLite 只读父子身份查询找到五个直接子任务，`thread_source`均为subagent。机器子任务不应贡献用户未读，是现有代码已声明的规则，不是本轮新加的产品语义。
5. 现有逐成员日志只有phase和时间，没有每个子成员的未读及身份来源，因此本轮不命名“具体哪一个孩子漏过滤”，也不把缓存淘汰、发现窗口或来源格式中的某一个分支说成已单独坐实。

## 4. 源码链与缺口

本节保留修复前的排查判断；代码链接定位当前对应实现，不表示缺口仍存在。已实现状态与最新构建证据见第7节，历史现场的精确拒绝路径仍待补证。

### 4.1 同轮证据使用不同起点

1. [shadow](../../../../preload/codex/desktop-shadow.cjs#L170)分别保存overlay与canonical的`turnStartedAtMs`；[分支Turn字段](../../../../preload/codex/desktop-activity-resolution.cjs#L457)修复前在运行时优先取最后overlay起点，终态优先取私有terminal起点，未按同一turnRef归一。
2. [canonical终态接纳](../../../../preload/codex/desktop-activity-resolution.cjs#L305)要求主shadow idle、没有运行overlay和待处理工作。因此现场接纳日志与“shadow一直active”不能同时作为同一时刻的解释。
3. [终态写入](../../../../preload/index.js#L5437)后，[私有分支投影](../../../../preload/index.js#L8693)可正常生成terminal；[V7适配器](../../../../preload/companion/evidence-adapter-v7.cjs#L152)通过candidates承载终态，外层unknown是容器占位，不能当作终态丢失证据。
4. [节点构造](../../../../preload/index.js#L12062)修复前用起点或sequence生成causalKey，同轮时间漂移也会改变身份摘要。[Kernel](../../../../preload/companion/task-kernel.cjs#L2025)在两个证据都具有可靠因果标记时做因果比较；[公共因果比较](../../../../preload/companion/branch-causality.cjs#L78)原先先比较非零起点，再比较事件序列。若本次terminal1474确实送到已有running1803节点，就会被视为较旧轮次而拒绝，即使完成事件较新。
5. 这是与现场吻合的高可信机制，但缺少本次入Kernel候选与拒绝原因日志，仍需一次精确补证，不能写成唯一根因完全闭合。

### 4.2 两个必须一起排除的入口

1. [nativeGroupStillActive](../../../../preload/companion/evidence-adapter-v7.cjs#L70)在active/live shape下绕过terminalNewer，且不要求独立组活动依据；这是可达风险。本次有canonical-idle接纳证据，不能直接判定现场仍走此分支。
2. [hydrationOnlyActive](../../../../preload/index.js#L11915)修复前可能用外层thread形态覆盖刚构造的私有候选为unknown；Goal verifying也可能提供高优先级unknown。未知进入Kernel会保留既有稳定状态。现场Goal记录为none，Goal分支优先级较低；需检查真正发送的候选，避免修错层。

### 4.3 机器身份与发现缓存耦合

1. [未读观察](../../../../preload/index.js#L4233)本来先排除机器子任务，再读原生未读；此规则正确，应保留。
2. [机器任务判断](../../../../preload/codex/subagent-discovery.cjs#L380)修复前仅依赖`verifiedRows`中`linked=true`且source匹配，不是对所有可信来源已识别线程的一致查询。
3. [一般来源观察](../../../../preload/codex/subagent-discovery.cjs#L152)修复前只维护内部review身份，普通subagent没有独立于近期发现结果的身份记录。近期发现还受48小时、最近日期目录、24候选及缓存上限约束；已恢复Desktop关系不等于已进入机器身份缓存。
4. 因此“拓扑已收下该孩子、未读判断却不认识它是机器任务”在当前代码中可达。现场一个side贡献未读，符合此缺口；具体漏登记分支待补证。
5. [Kernel未读归并](../../../../preload/companion/task-kernel.cjs#L1734)按任一有效成员未读即整组未读；[界面映射](../../../../src/domain/companionTaskPackage.ts#L340)消费Kernel结果。不能用UI强改颜色、忽略全部子节点或把已读直接当完成来修复。

## 5. 推荐方案及实施次序

已获授权：在Codex组件修正轮次与身份输入，并对公共Kernel增加显式身份域下的最小因果比较及受限恢复。V7继续唯一归并，其他Provider无身份域时走原比较分支。

| 序号 | 工作 | 范围与验收出口 |
| --- | --- | --- |
| P0 | 补齐两条目标的匿名诊断 | 记录实际branch状态、候选kind/authority、匿名turnRef、起点来源、active/terminal序列、是否被hydration替换、Kernel接纳/拒绝原因；每个side记录机器身份已知与否、身份来源及unread。只在语义变化时记录，不保存正文、请求内容或完整原生对象 |
| P1 | 同一Turn采用稳定身份与起点 | 复用现有匿名turnRef串联overlay/canonical/terminal。运行overlay仍提供实时状态，canonical提供同轮归一依据；不同Turn和不同owner代次不得因时间相近合并。缺失身份保持不确定，不猜同轮 |
| P2 | 让终态和旧运行证据正确交接 | P0若证实terminal被旧epoch拒绝，在Codex归一出口保持一致可比的轮次；若候选仍running或unknown，修对应组活动保护或hydration入口。保留真正更新的运行、正在运行的孩子、待输入/批准、Goal和Plan逻辑 |
| P3 | 机器身份脱离近期发现缓存 | 在现有发现组件中建立统一的可信来源身份记录，库存、定向元数据和已恢复关系均调用同一入口。普通subagent与guardian身份分开；缺source不清掉已证身份。新对象/owner/账号上下文或权威矛盾按既有边界重验，不能无限复用旧身份 |
| P4 | 恢复已有错误记录 | 对目标族执行既有有界只读重取与重新归并；明确如何淘汰已发布的错误epoch及子成员旧unread。只改后续新事件不足以验收。不得直接写原生read-state、清空全局任务缓存或制造完成事件 |
| P5 | 同一产物完成宿主验收 | 自然Hook构建后核对实际Host/Renderer；手工操作由用户触发，比较原生事实、Bridge、Kernel、主界面、浮窗、组计数和快捷循环。构建通过不替代功能验收 |

本轮修改activity-resolution、subagent-discovery、runtime-diagnostics及入口的Codex私有接线，同时修改branch-causality、evidence-adapter-v7和task-kernel。既有shadow已经提供匿名turnRef与来源kind，无需另改解析格式。UI和公开协议未变。

旧epoch恢复按已授权合同实施：旧节点仍有原causalKey与phaseRevision时，用当前owner完整canonical终态、空闲、无pending及无更新分支活动共同形成证明；Kernel按旧key/revision比较交换，并要求真实终态序列严格更新。不能确认来源、活动水位或旧节点时，保留前态，等既有有界恢复取得新证据；不按329ms猜同轮，不靠重启替代恢复验收。

## 6. 待执行验收清单

沿用手测及必要只读取证；本轮没有执行以下行为验收，也不新增自动化测试。

| 序号 | 场景 | 必须看到的结果 |
| --- | --- | --- |
| V01 | 本次完成同步任务原现场 | 根及三个孩子终态明确；已读后整组completed/read，运行组和计数移除，不反弹 |
| V02 | 本次钩子规则任务原现场 | 主已读，五个机器子任务不贡献用户未读；六成员组completed/read |
| V03 | 同Turn overlay/canonical时间不同 | 同一匿名身份仍能结束；不依赖时间容差、TTL或等待一段时间 |
| V04 | 旧完成晚于新一轮运行到达 | 新一轮继续running；旧终态不得把真运行清掉 |
| V05 | 父完成、一个真实孩子仍运行 | 整组继续running；最后一个孩子结束才退出运行组 |
| V06 | 真正人工可读Side仍未读 | 保留整组未读，不能把所有子任务一概排除 |
| V07 | 完成未读→原生已读→新一轮完成未读 | 三段切换正确；已读事件仅影响未读，不重放旧activity |
| V08 | 冷启动、断连重连、库存替换、来源字段缺失 | 已证机器身份不因近期发现窗口消失而变成人工任务；未知来源不冒充已确认人工 |
| V09 | owner/账号切换、迟到消息、重复快照 | 上一上下文身份和已读证据不能串用；重复输入不使状态反复 |
| V10 | 输入、批准、Plan、Goal及真实中断 | 原有动作和状态保留；不能通过“未读=false”强推完成 |
| V11 | 已有错误状态恢复 | 在已有错误node上恢复；只让新任务正确或重启后正确不算通过 |
| V12 | 所有消费者 | Main/Float/分组/计数/搜索/隐藏/暂停/快捷循环一致，动作资格由修正后的Kernel结果决定，真实写动作单独受控验收 |

macOS为本轮证据平台；Windows仍未实机验证。原S02/S04/S06相关现场失败保持未关闭，不能沿用前一轮“可以了”反馈把整体标为通过。

## 7. 本轮实现与验收边界

1. P0–P4源码已落地，13:00自然Hook构建成功；P5仍待当前生成包回执核验、实际加载及宿主手测。未读取更多会话正文，未修改原生数据库或已读集合，未安装、重启。用户已明确授权提交推送，由Root执行，Git结果另行回报。
2. [轮次来源与恢复证明](../../../../preload/codex/desktop-activity-resolution.cjs#L305)：canonical认可及私有terminal保留匿名turnRef；同身份的起点差异不再被当作另一轮；活动起点与实际选中来源配套。真实运行、pending、owner或版本冲突仍拒绝终态。旧节点恢复只接受current owner可证终态，snapshotRevision须为正，零版本或无证据暂不恢复。
3. [因果比较](../../../../preload/companion/branch-causality.cjs#L32)与[Kernel](../../../../preload/companion/task-kernel.cjs#L2025)：同身份、同域按真实序列；同序列不覆盖，跨域或身份不可比较保留；不同已知轮次继续保护更新起点。Goal使用自己的权威，不套Turn身份。恢复证明仅publishEvidence的Host路径可用，节点key/revision变化即拒绝；公开任务剥离私有字段。
4. [机器身份与来源恢复](../../../../preload/codex/subagent-discovery.cjs#L105)：机器/人工/未知/guardian独立记录；近期发现窗口消失不抹已证机器身份。当前库存、父子关系和shadow引用的身份保留，其余最多2000条。来源不明的Side走includeTurns=false元数据补查，最多4并发、持续retained的同目标每次reset之间最多3次；迟到响应受scope代次约束。普通连接重建保留身份并清尝试计数，真实账号/执行上下文释放后清全。
5. [入口](../../../../preload/index.js#L8693)：来源识别变化仅重发未读证据，Kernel保护原活动、Plan、交互、隐藏及置顶。修正hydration覆盖精确私有终态，以及泛化group-active绕过终态的问题；真实运行孩子仍通过各自成员证据归并。身份未知不推定已读，继续保留已有读取证据。
6. [来源诊断](../../../../preload/codex/runtime-diagnostics.cjs#L12)按语义变化记录匿名branch证据、起点来源、机器身份和未读资格；Kernel补接纳/拒绝原因与逐成员未读。只保留有界签名，不保存原生正文或请求对象。历史两例的具体漏失路径仍需新产物诊断关联，源码修复不补造现场因果证据。
7. 已做七个改动源码的node --check、差异空白及接口/隔离静态复核；未主动新增或运行自动化行为测试。11:14自然Hook中途回执`8a434ba7-3770-4a4c-a832-933b3509c92b`为build-failed/exit1；回执未保存具体错误，两名执行者均未收到末尾输出，原因未知。当时public镜像为中途版本且与最终入口源码不同，不能视为有效产物。后续失败、修复及成功回执见下文；安装加载及V01–V12未验。已有独立入口预算漂移不因本次静态检查变成通过。
8. 两个原生执行者按独立写集交付，Root完成接线与复核；旧CLI账本Root仍属原聊天，不冒充已完成其治理绑定。标题已通过当前宿主API落实，前轮标题失败不是本轮剩余阻断。

### 11:28 自然Hook失败续修

- 本次自然Stop回传了具体错误：Vite及产物生成完成，source核心保留40场景通过；随后生命周期校验在Side终态deepEqual处失败，因为新返回值增加匿名turnRef，既有期望仍只有status/startedAt。不能把此回执解释为整体验收通过，也不能据此断言11:14失败原因相同。
- 定向更新[scripts/check-companion-lifecycles.mjs](../../../../scripts/check-companion-lifecycles.mjs#L39)中Side和Main两处既有期望，要求返回turnRef等于输入canonical身份，保留完整对象严格比较。未删除字段检查、未回退产品身份贯通，也未新增自动化场景。
- VerificationImpactTrace增量：仅现有构建合同断言，影响source/产物生命周期校验；当时仅语法及差异静态检查，完整校验交自然Stop，不手动执行build、校验脚本或Hook处理器。后续构建结果见13:00成功记录；宿主未加载、V01–V12未验。

### 11:41 自然Hook失败续修

- 用户回传的下一次构建已通过source核心保留40场景及生命周期60检查点；随后原生未读校验的VM环境缺少`codexRetainReferencedThreadIdentities`，在执行抽取的生产`codexPrivateBranchEvidence`时抛ReferenceError。产物生成成功不等于validate:utools通过。
- 定向修正[scripts/check-companion-native-unread.mjs](../../../../scripts/check-companion-native-unread.mjs#L160)：VM加载生产身份保留、分支键和因果键三个依赖函数；提供真实来源登记组件及合成父/子身份、库存、轮次缓存、来源域和在途Map。只隔离诊断输出，不用空函数跳过身份保留，也不更改原23检查点的行为断言。
- VerificationImpactTrace增量：既有私有分支投影校验的依赖装配，影响source及产物同一校验；当时脚本语法和差异检查通过，未主动运行校验、测试、build或Hook处理器。后续构建结果见13:00成功记录；宿主未验。

### 13:00 自然Hook成功与当前产物边界

- 最新[自然Hook成功回执](../../../../.codex/build-hook/receipts/2026-11-16T05-00-04.837Z-6d850e62-3ce9-409c-a3a2-3db7f2479732.json#L1)为`source=hook / status=rebuilt / reason=build-passed / exitCode=0`；V7、`host-23b4139e435cd9886f47`、`renderer-78f369bbd19317b599e6`，builtAt `2026-11-16T05:00:15.452Z`（上海13:00:15.452）。此前11:58成功回执`43b31cd2-4c13-440e-846f-92d78eec0cb1`的Host/Renderer相同、builtAt为`2026-11-16T03:58:16.982Z`，不再将本轮源码记作待首次成功构建。
- Root已核对当前inputDigest与state.success.input一致，七个修改源码与public/dist镜像均一致。当前生成包时间晚于成功回执，尚缺对应回执，故当前包仍未核；不随生成时间浮动反复更新状态，也不以源码镜像一致替代该包构建证明。
- 原11:14未知失败、11:28严格期望缺turnRef及11:41 VM依赖缺失保留为历史证据；后续成功不补造11:14根因。未安装或加载新插件，V01–V12与Windows仍未验，S02/S04/S06保持未关闭。
