# 插件计划实施与任务继续通路核验

状态：用户加载桌面owner通路后，反馈任务已在执行，但Codex会话页报错。15:11:19的插件动作与桌面渲染异常已对时；缺失桌面文本字段的修复已进入源码和public镜像。15:11的Grok首轮构建随后被并行源码更新失效，当时重跑又被并行新增测试的类型错误阻断；该历史失败保留。当前可接受的新包构建结论见后文15:44：手动调用处理器完整构建成功，随后同输入复用，产物为EyPc V7 / `host-7ae69a4b6595322276fd` / `renderer-36f549c83cdd401d1829`。真实Stop自动触发、当前报错页面恢复、修后实机及安装包替换均未验。

## 15:11 已启动但会话页崩溃

1. 用户反馈：从插件的待继续Plan点击执行后，任务已进行中，但打开Codex会话显示通用出错页。截图只证明页面异常，任务运行状态来自用户观察，不能把侧栏转圈单独当作执行成功回执。
2. 定向只读诊断：15:11:19.033选中`desktop-owner`，15:11:19.528执行器返回`indeterminate/turn-start-indeterminate`；15:11:19.794桌面首次出现渲染异常，之后三次打开仍命中同一处。仅提取动作时间、固定错误分类和代码栈位置，不保存原始日志或会话正文。
3. 本机桌面静态实现确认：崩溃处遍历文本输入的`text_elements`数组，未做缺失兼容；桌面自己构造的普通文本会显式带空数组。[桌面adapter](../../../../preload/codex/desktop-task-turn.cjs#L68)此前直接传入通用App Server文本结构，只有`type/text`，因此原生发送能够到达后端，桌面读取同一输入却可能失败。插件回执仍为结果不明，不能回写为已确认成功。
4. 本轮修复只在桌面发送边界规范化克隆后的文本输入：缺失`text_elements`时补空数组，已有数组完整保留；非字符串文本或显式非数组字段在发送前拒绝。不修改调用者输入，不改变Plan显式default、普通继续继承模式、准确owner、线程防重或写后不重发。[现有产物校验](../../../../scripts/validate-utools-runtime.mjs#L264)同步增加该字段契约，public由原同步脚本生成。
5. 当前故障会话不通过补发实施、恢复其它任务或修改原生数据库处理。新包修复用于后续发送；已经报错的页面需另核重载后的状态，不能把源码修复当作现有窗口已恢复。
6. 独立只读复核确认外层请求及回包层级无新增缺陷；`clientUserMessageId`缺失时桌面会生成，`inheritThreadSettings`默认开启。错误页的Try again只触发页面恢复，不重发实施，用户可先尝试一次；能否清掉当前内存中的异常输入仍未验。历史重建自身不补该字段，是否持久化以及后端重读是否补齐均未证，不承诺重载必定恢复。源码中的Reload Window菜单仅非Prod构建加入，不能向正式版用户保证该入口存在。

### 本轮影响与核验边界

1. `VerificationImpactTrace`：通用Plan/continue文本 → 桌面adapter私有请求 → owner启动及本地Turn输入 → 会话渲染；受影响入口为实施计划和普通继续。直接App Server路径、Goal原生激活、额度、状态聚合及导航排序不改。
2. 行为保护：保留准确线程、模型与思考强度、Plan版本/活动门禁、普通继续模式、防重及UNKNOWN锁。此次补齐桌面已要求的输入结构，恢复原“执行后可查看原会话”结果，不改变产品接受条件。原未提交改动保留。
3. 分工：主控改adapter与既有产物校验；独立只读执行者核对桌面协议和页面恢复条件；Grok子Agent运行已授权完整构建与真值同步。`planned_child_count=2`；构建请求模型`group/grok`，实际模型以宿主可见证据为准，缺失则unknown。
4. 已完成：canonical/public CJS语法、校验脚本语法、同步镜像及diff空白检查；新增代码未引入同步IPC，文档代码链接检查通过。本轮未编写或运行独立自动化测试套件。Grok首轮完整build及真值同步退出0，但其后其它任务修改构建输入，结果失效；同一执行者重跑build退出2，停于vue-tsc。[并行新增测试](../../../../tests/scripts/codexBuildStop.test.ts#L5)导入脚本缺少类型声明，触发TS7016，第二轮真值同步未运行。该阻塞不属于本轮adapter修复，未修改该测试或移除门禁。
5. 仍待：当前报错页面的真实恢复；新包加载后同线程实施及普通继续的运行/打开联合验收。没有点击真实任务、启动开发服务器、替换包或重启Codex/uTools。

## 15:05 构建产物校验修复

1. 用户构建产物为2026-11-13T07:05:20.716Z，host=`host-008f74026bd7d3715db8`。`validate:utools`在RAW-160检查失败：校验脚本要求主入口包含直接调用`requestCodexRpc('thread/resume'`的旧写法；当前实现按owner选择`thread/read`或`thread/resume`，恢复分支仍然存在。根因是校验契约未同步，上一轮仅检查语法与镜像一致，遗漏该打包校验入口。
2. [校验脚本](../../../../scripts/validate-utools-runtime.mjs#L247)已改为检查现行双路径接线，补充桌面adapter资源、准确owner请求、版本、回包、防重锁及普通继续接线；保留App Server恢复、turn/start和显式default模式检查。未为通过校验改动产品执行器或删除恢复分支。
3. 直接重跑`pnpm validate:utools`成功：canonical/public/dist一致，源码与产物各40项core、60项lifecycle、23项native unread保全检查通过，产物身份与用户反馈一致。本轮未重新构建、换包或重启；该结果只证明现有产物通过校验，桌面真实发送、回包和default模式落地仍待用户加载后核验。

## 开发收尾自动构建

### 锁占用与触发边界方案

2026-11-13：瞬时锁冲突已核实，互斥生效；问题在于占锁立即阻断、只读或已有包分发任务也进入检查，以及分发证据缺少实际发送副本的包内身份关联，现有摘要校验仍保留。方案方向已认可，当前按要求仅细化文档和静态审查，未实施功能或修改生效规则。唯一后续指导为[构建锁与触发边界实施指导](build-hook-lock-scope-guide.md#构建锁与触发边界实施指导)，包含精确写集、范围失效、共享成功/失败、包身份保留边界、子Agent回报、主控比对和真实验收设计；其未决问题与执行状态以指导正文为准。历史构建、Hook信任和回执记录不替代新方案的运行验收。

### Stop 逐次回执补齐

增量：用户进一步要求核验其它相关Hooks的回执。已按原全局owner补齐Codex规则提醒1个、标题检查/恢复2个、演进监督6个入口，共享写入Home的 `hook-receipts/<owner>/<event>/`，逐次记录启动、完成、跳过、失败和固定错误类型；不改Hook定义或信任，原EyPc构建回执保持检出独立。全局维护与证据归CodeNote《Hooks能力与维护》的“逐次运行回执”节。复用一位只读执行者审计，Root唯一写入；planned_child_count=1，实际模型unknown。独立复核提出的清理锁等待、提醒吞错误分类和TTY输入问题已修正；48项定向检查通过。监督器扩展146项有46项错误，严格健康检查另有2项问题，不能称整组通过或监督器整体健康；真实回执发现并行迁移造成PreToolUse的known_by_file字段断档，回执如实记failed，未改动该迁移语义。第三方条件集成未纳入自有writer覆盖，不能外推全部Hooks已验。

1. 用户追问本轮是否自动重建后，选择补充轻量回执。原成功缓存只能证明输入与产物匹配，不能还原每次 Stop 是否触发；不补认此前自动事件。
2. [检查器](../../../../scripts/codex-build-stop.mjs#L68)现在为本项目每次检查建立独立回执，保留最近100份，路径为 `.codex/build-hook/receipts/`（已由原缓存忽略规则排除版本控制）。记录时间、匿名会话摘要、手动或命令入口、重建／复用／失败／锁占用；开始先写 running，异常写固定分类，不保存原始事件、异常消息或构建输出。并发调用独立文件，避免锁占用回执覆盖正在构建的回执。
3. [定向检查](../../../../tests/scripts/codexBuildStop.test.ts#L36)共9项通过，新增覆盖回执来源与时间、重建与复用、失败与抑制重试、隐私、100份上限、异常和并发锁记录。脚本语法与差异空白检查通过。
4. 本轮明确手动调用处理器执行完整构建，回执为 `source=manual / status=rebuilt / exitCode=0`；再次调用为 `source=manual / status=reused / buildAttempted=false`。产物时间2026/11/13 15:44:00，EyPc V7 / `host-7ae69a4b6595322276fd` / `renderer-36f549c83cdd401d1829`，当前输入匹配缓存。需求真值同步及登记校验通过，保留2条既有 proposed 警告。
5. 宿主真实 Stop 自动触发仍未验；命令入口的 hook 标签仅表明入口来源，不能单独证明宿主事件。未安装重载、重启或发送业务任务。本次仅修改开发收尾观测，不影响插件用户操作，用户帮助无更新。

### Hook 初始接入记录

1. 用户先要求 Grok 子 Agent 执行构建，随后明确构建就是 `npm run build`，并选择改由项目级同步 Hook 自动执行。现已更新项目规则唯一 owner、入口及验证政策，取消必须使用 Grok 的要求；普通构建与额外隔离 asar 构建分别路由，安装加载仍由用户处理。
2. 新增 [.codex/hooks.json](../../../../.codex/hooks.json#L1) 及 [Stop 检查器](../../../../scripts/codex-build-stop.mjs#L1)：检出级锁、输入与产物摘要复用、写后输入变化拒绝、失败定向续接及循环限制。状态只保存摘要与成功产物身份，原始构建输出仅在失败时有界回传，不落状态文件。意外终止若留下锁，保留阻断提示，不能据此判构建已通过。
3. [定向检查](../../../../tests/scripts/codexBuildStop.test.ts#L1) 六项通过，覆盖成功复用、文档跳过、源码与产物变化、共享脚本链接、失败不重跑、不保存输出、构建期间变化、缺失产物、锁冲突及项目/事件隔离。实际命令先发现输入摘要误拒项目已有的共享脚本链接，已修成跟踪目标文件内容；随后 build 的 typecheck 发现新增测试所导入 MJS 缺少类型声明，已补齐。这两次失败均保留为本轮实现问题，不归因于原插件执行器。
4. 修正后通过检查器实际执行 `npm run build`，完整构建链路退出成功；这属于手动调用处理器的命令级证据，不能称为宿主真实 Stop 已触发。Codex 原生 `hooks/list` 已发现一个 Stop 定义，无解析错误或警告，最初信任状态为 untrusted；最终同一定义哈希回读已为 trusted，无需重复审阅。助手未写入信任记录，信任变化不单独证明本聊天真实 Stop 已触发。
5. 首轮命令级成功产物的根 dist 构建时间为2026/11/13 15:29:27，EyPc V7 / `host-7ae69a4b6595322276fd` / `renderer-05d5887822d62ee53581`，包含当时检出已有的并行源码。紧接该构建的相同输入检查返回空结果，确认复用且未重跑命令；需求真值回写及登记校验通过，四份项目规则与本记录的代码链接、脚本语法和差异空白检查通过。未加载安装包、未重启宿主、未发送业务任务。
6. 最终检查期间并行任务修改了 `src/domain/magpieQuota.ts`，旧输入摘要失效；随后再次调用检查器已返回复用，成功缓存与当前输入一致。最新缓存及根 dist 身份为2026/11/13 15:34:00、EyPc V7 / `host-7ae69a4b6595322276fd` / `renderer-36f549c83cdd401d1829`。该缓存更新不是上述最后一次空结果调用所发起，未读取或推断其它聊天事件，不能凭缓存时间补认真实 Stop 的来源。

## 14:10 恢复失败与桌面原会话发送通路

1. 当前运行自14:04:37握手，进程24457，host=`host-870f3ff65612dc6c6375`，renderer=`renderer-63faf52e50e08166b369`。14:10:33单次实施返回`failed/resume-protocol-error`，耗时104ms；没有本次Plan预检拦截事件。该失败发生在原会话打开后、turn/start之前，与11:06的时间精度误拒不同。
2. 原传输层丢弃JSON-RPC错误正文和data，原日志只能证明resume阶段失败。本轮隔离加载当前canonical preload，定向thread/read、模式能力读取成功；thread/resume复现`-32600`，内存分类命中thread/already/active，data为空。未发送turn/start。原始错误不落日志；后续仅保存RPC数值和固定分类。隔离诊断首轮曾误取inventory值中的threadId，改为其Map键后取得准确样本；此诊断失误不是产品故障。探针已结束，未保留任务正文或凭据。
3. 旧执行器另起CLI App Server，然后恢复桌面原线程；并未向桌面输入框发送。因而用户提出的“向原对话发送实施说明”需要桌面owner通路，不能靠恢复失败后盲目补发。当前本机CLI为0.167.2，官方[App Server文档](https://developers.openai.com/codex/app-server)及其生成schema均确认：resume的excludeTurns参数有效；turn/start可以携带`collaborationMode={mode:default,settings:{model,reasoning_effort,developer_instructions:null}}`。仅自然语言“执行计划”不构成模式切换证据。
4. 对本机`/Applications/ChatGPT.app/Contents/Resources/app.asar`只读核对，找到准确桌面请求`thread-follower-start-turn`。无hostId的本机envelope版本为2；请求以targetClientId指向已观测owner，params携带conversationId及turnStart。桌面处理器先assertThreadFollowerOwner，再调用原会话startTurn。该能力属于当前本机私有协议，不能称为跨版本稳定公开API。EyPc原有sendBroadcast不能替代这种request/response。
5. 本轮新增[桌面发送adapter](../../../../preload/codex/desktop-task-turn.cjs)，优先向准确owner发送同线程消息。Plan实施显式default；普通继续继承模式。连接丢失、owner变化、错误回执和写后超时均不跨通路重发。无owner时才沿用既有App Server恢复路径；恢复拒绝向悬浮窗回传具体原因，不伪造启动。暂停或blocked Goal仍保留原生Goal激活路径，不用普通文本冒充Goal恢复。
6. 当前截图仅能证明Plan卡片及普通输入框可见；确认框消失不能证明任务已执行，也不能单独证明已经退出Plan。此次业务未实际启动。完整新包验收仍需用户加载后，由同目标新Turn和真实执行模式确认。
7. 指定样本的只读实测已确认桌面connected、准确owner存在、adapter.canStart=true。原生桌面快照两处协作设置均含模型和思考强度；[shadow投影](../../../../preload/codex/desktop-shadow.cjs)只保留这两个私有字段，相关设置patch立即使缓存失效并要求刷新。Plan写入前读取最新投影，不能取得原设置就拒绝，避免将High意外改为默认强度。此项只证实发送前条件，未发真实桌面实施请求。
8. Adapter按requestId、方法、owner、版本及回包层级确认结果；原TurnStartResponse位于`message.result.result.result`。写后超时或断线保留该线程防重锁；定向复读确认新Turn后只解除不确定锁，不解除真实在途请求。普通继续的相同确认回调也接入该锁的收敛。模块已加入预加载资源清单，打包时会携带该文件。
9. 独立复核发现revision断档、其它patch失败以及owner断开也可能留下旧设置，已统一在重订阅和owner失效入口清空投影；后续有效snapshot才能恢复。源码及public镜像语法、逐字节一致和diff空白检查通过；没有运行自动化测试套件。当前样本只读确认了发送前条件，实际新Turn、桌面回包和default落地仍未验。

本轮未构建、未换包、未重启；没有随机恢复其它业务任务。原独立后端执行者复用为本次桌面adapter唯一写者，主控负责接线、错误分类及文档；没有新建平行任务。

## 11:06 实机复核与追加修复

1. 用户新截图与实际悬浮窗一致：唯一根Plan等待实施，按钮可用；点击后明确返回“目标任务已有更新活动或其它待决请求”。11:06:15仅单击该Plan一次，诊断为`execute-plan-result=failed/state-changed`，耗时7ms；根仍waiting-input。失败发生在打开、恢复与turn/start之前，不能归因于Codex执行权限或真实存在其它待决请求。
2. 此次已加载版本不是08:21旧包：宿主进程12626，11:00:53握手，host=`host-a6355b93dc7dfba14415`，renderer=`renderer-b247f3da3332de00344f`，artifact-ready。原生窗口显示当前asar为`unsafe-a08b10a067bf4583d0fd549be90c9b77.asar`。修前定向读取其preload、desktop-shadow、inventory-turn-fields，三者与当时工作区SHA相同；preload SHA为`20fd3e8a02cecbd741f6961622f6ebbc5c3e82fc407d585f3f4251ee2ec3bcd6`。新增源码修改后不能再用该身份代表最新修复包。
3. 定向只读协议取得同一线程的事实：最新原生Turn为completed，开始时间`1794529718000`；桌面canonical Turn同为completed，开始时间`1794529718147`；对Turn ID作既有correlation后完全一致。完整请求集唯一请求为`item/plan/requestImplementation`，identityExact=true；唯一Side已完成，无活动Goal。Plan版本为`1794530007684`。因此样本没有证据支持“其它待决请求”。
4. 根因是[samePlanTurn](../../../../preload/index.js#L11010)此前同时要求准确Turn ID相等和跨来源开始时间全等。App Server返回整秒，desktop保留毫秒；同一轮相差147ms，被错误归入state-changed。现有[时间归一化](../../../../preload/index.js#L3684)只转换单位，不会恢复已经丢失的毫秒。
5. 修复后准确Turn引用匹配即可绑定同一轮；引用缺失时必须双方存在有效且全等的开始时间，引用和时标均缺失不放行。请求签名、Plan版本、任务revision、普通输入/审批、Side活动以及恢复后同来源两次RPC的轮次竞态检查继续保留。
6. [活动门禁](../../../../preload/index.js#L10999)逐项返回原因；[拒绝回执](../../../../preload/index.js#L11032)明确区分线程身份、Plan变化、任务revision、Side活动、确认轮次不一致、原生运行、其它请求和读取失败。诊断新增`plan-execution-gate`，只记录匿名任务引用、operationId、stage、gate；兼容保留errorCode=state-changed，不保存原始Turn ID或会话正文。
7. 悬浮窗最终回执已在这次真实点击中显示，首轮结果回传修复已被当前加载消费者采用。原生Computer Use允许uTools，但明确禁止操作`com.openai.codex`；此次未换其它UI技术绕过，Codex原生确认画面以用户截图为证。未从原生按钮另行启动，也未恢复其它业务任务。
8. 追加修复的canonical/public语法、镜像一致和diff空白检查通过，未新增同步IPC依赖。源码隔离诊断最初因无宿主运行身份而未取得Kernel任务；这不是已加载插件故障，也不算修后验收。只读诊断仅允许thread/read、thread/turns/list和collaborationMode/list，打开入口始终返回诊断截停，禁止恢复或启动；结果见下方验证补记。

### 本轮验证补记

1. 修后源执行器使用当前真实Provider状态与Kernel派生任务完成有界只读预检：根liveCount=1、attentionCount=1，唯一实施确认，准确Turn引用存在，desktop开始时间仍为`1794529718147`，RPC仍为`1794529718000`；已到达打开边界。仅发出thread/read、thread/turns/list、collaborationMode/list三类只读请求。
2. 打开函数在隔离诊断中被替换为明确失败的截停返回`diagnostic-stop-before-open`，因此诊断最终outcome为failed属于主动截停，不能记为业务执行失败或执行成功。未调用真实open/resume/start。隔离进程使用内存插件存储、内部只读Kernel派生，不伪造宿主运行身份，也不写用户插件存储。该结果证明147ms差异不再造成这道预检拒绝；不证明已加载插件的整条链已通过。
3. 独立执行者只读复核后确认原因返回链和恢复后同来源竞态检查未被反转；同时指出无引用且无时标的旧兜底，已一并收紧为必须有准确引用或有效全等时标。canonical/public镜像再次同步并检查。

最新源码未构建、未替换运行包；源执行器诊断不能替代用户加载后的实机实施。普通继续的模式记录修复没有在本轮获得真实继续样本，保持未验。此次用户纠正属于同一任务返工，未新建平行任务或补造历史编排采用记录。

## 修复范围与本轮待核清单

- 已接受范围：准确Plan确认的门禁冲突、悬浮窗最终结果回传、继续任务无依据记录default模式。
- 分工：主控负责Controller、Runtime Action、Float及本文；原后端复核执行者负责preload执行器。planned_child_count=1，继承当前模型设置，实际模型unknown；不新建平行任务。
- 影响链：Provider Plan/continue执行结果 → Kernel回执 → Controller操作结果 → Float基础快照 → 同operationId反馈；实施和继续共用的启动记录必须保留各自模式语义。
- 保留条件：同线程身份、Plan版本和任务revision、Side真实活动、普通输入与审批、恢复间竞态、超时不重发、已完成Plan实施、暂停/阻塞Goal原生激活；现有额度相关未提交改动保留。
- 选定检查：受改CJS语法；源码及镜像一致；变更涉及的TS/Vue语义；结果与operationId关联、快照更新及异常归并的静态复核；本文代码链接。
- 未选检查：用户默认手工验收，本轮不运行自动化测试套件，不构建、不启动宿主、不点击Plan或继续；这些真实行为均保留为未验，不用静态通过代替。
- 扩大检查：无。用户自行打包、加载后再验当前指定Plan；继续任务需明确样本，不能随机恢复其他业务任务。

## 修复结果与交付边界

1. [Plan确认判定](../../../../preload/index.js#L10939)只在同根、同Plan版本、完整请求集内唯一未决请求为实施确认时，豁免根自身的attentionCount=1/liveCount=1；普通输入、审批和Side活动仍拒绝。请求引用、观察序号、匿名请求集版本及根Turn身份作为前后校验依据。原本零计数的已完成Plan路径保留。
2. [活动门禁](../../../../preload/index.js#L10999)在原线程读取与恢复后两处使用同一确认依据；native Turn仍在进行中时，必须匹配原根Turn且native flags仅有等待输入，才能按实施确认放行。请求替换、版本或Turn变化、新活动继续阻断。首轮遗漏的跨来源时间精度问题与追加修复见上节；此前静态通过不代表该样本实机通过。
3. [Controller回执](../../../../src/runtime/codexController.ts#L3412)包含准确key、任务revision、动作、pending/executed/failed/indeterminate、消息和错误码；前置拒绝及异常也走回执。[Float基础快照](../../../../src/runtime/codexController.ts#L3985)携带回执，语义指纹变化会推进baseRevision；不要求任务状态先变化。
4. [Float请求与反馈](../../../../src/FloatApp.vue#L1710)发送准确操作编号，只展示自己等待的同编号结果；同任务处理中不重复发送。复用现有气泡层和读屏消息，气泡10秒后收起，不改变列表布局、不抢归档确认。90秒无最终回执只提示核对，不判定启动失败，不释放未知请求后自动重发。已结束回执保留最近20条，进行中回执保留至结束；后续仍可从同版本按钮提示查看结果。
5. [普通继续启动记录](../../../../preload/index.js#L10839)与计划实施分开；[继续注入入口](../../../../preload/index.js#L10912)不再直接写入default模式。原生Goal激活和普通继续的既有RPC语义保持，真实模式继承不由本地推断。
6. TypeScript/Vue静态语义检查限定本轮三个入口及导入依赖，已通过。临时检查配置最初放在/tmp时未能解析项目类型库，指定项目的Node类型库后通过；未改项目配置。Canonical/public入口语法、逐字节镜像一致和diff空白检查通过；未运行测试套件。
7. 已通过项目同步脚本更新public预加载镜像。尚未构建、加载或实机复验。历史安装包和08:47:36失败只属于修复前证据；本轮源码修复不能替代新包实机结果。版本身份与构建真值留待用户打包时生成和同步；标题Apply Gate已成功改名并清除上轮待办。

### 用户加载后的验收点

1. 当前指定Plan单击实施一次，确认同线程新Turn以及真实运行；失败时悬浮窗应显示原因。
2. 普通输入、审批、活跃或待输入Side仍拒绝；已完成Side不妨碍准确根Plan确认；恢复间新增请求或Turn仍拒绝。
3. 普通中断任务从原线程继续，paused/blocked Goal走同Goal激活；不修改预算，不把本地模式记录当成原生模式证据。
4. 后端拒绝回传已在11:06点击中实证；连接异常、未知结果、处理中防重及超时不重发仍未实机验证。构建时同步版本身份和构建真值，核对加载版本后再判断最新修复行为。

以下为修复前调查记录，保留失败事实和原始根因；源码链接指向当前实现入口，修后行为以本节最终交付与实际验收为准。

## 范围与结论

核对插件内「实施计划」「继续任务」从悬浮窗到原生执行的完整通路，使用当前唯一待实施计划作一次实验。没有恢复其他业务任务，没有更改预算、权限、凭据或部署，没有替换插件包或重启宿主。

两条通路均有实现并已进入当前安装包。当前 Plan 失败发生在 Provider 执行器的初始门禁，早于原生启动。继续任务按钮现场可见，独立执行器及接线存在；本轮没有点选其他中断任务，因此不能宣称其真实恢复已通过或普遍失效。

## 运行版本与证据范围

- 当前宿主握手为 `host-a66e26394ffdc0435e96` / `renderer-e21dabb71c9500b9ad33`，当前进程自北京时间 2026-11-13 08:21:01 加载。
- 原生 UI 确认窗口为 EyPc Codex Float，加载已安装的 asar；没有启动仓库开发服务器。
- 对该已安装包定向读取四个代码入口，分别与当前检出的源码比较，全部 SHA-256 相同：`preload/index.js`、`preload/companion/task-kernel.cjs`、`preload/companion/task-actions.cjs`、`preload/codex/continue-task.cjs`。因此下文关键后端逻辑适用于当前安装包，而非仅存在于工作区。
- [实机过程](../../../knowledge/computer-use/sessions/2026-11-13-task-actions.md)只保留操作净结果，不保存任务正文、原始界面或截图。

## 实际通路

### 共用入口

1. [Float 行按钮](../../../../src/FloatApp.vue#L3998)分别调用 [requestTaskContinue / requestPlanExecute](../../../../src/FloatApp.vue#L1689)，携带准确任务 key 与 revisionAt。
2. [Float action](../../../../src/FloatApp.vue#L1535)调用子窗口桥接。[preload/float.js](../../../../preload/float.js#L394)验证运行身份后发送父窗口 IPC；[float-bridge](../../../../preload/codex/float-bridge.cjs#L1328)转给主 Renderer。
3. [App.vue](../../../../src/App.vue#L428)接收动作并进入 Runtime Action；[动作注册](../../../../src/runtime/feature/codex/actions.ts#L149)调用 Controller。
4. [Controller](../../../../src/runtime/codexController.ts#L3400)重新匹配任务和版本；Plan 读取当前 planLifecycleRevision，继续使用 revisionAt。[dispatchCompanionCommand](../../../../src/runtime/codexController.ts#L2784)附当前 Snapshot / Topology 版本和 operationId。
5. [Kernel dispatch](../../../../preload/companion/task-kernel.cjs#L2929)检查状态、能力、版本，构造私有准确目标；[Task Actions](../../../../preload/companion/task-actions.cjs#L455)检查就绪状态并进行单目标防重。
6. [Host Registry](../../../../preload/index.js#L12432)绑定 Codex Provider 执行器。执行回执只有 `executed` 才使 Kernel 提交 running；失败不伪造运行，结果不明不盲重发。

### 实施计划

[executeCompanionCodexPlan](../../../../preload/index.js#L10913)按以下顺序运行：

1. 校验准确 key，重建或复用该任务 alias。
2. 用当前 Kernel Plan、生命周期版本、能力和家族状态进行初始门禁。
3. 并行探测 default 协作模式，同时读取同线程基本状态和最新 Turn；拒绝新活动或其他待决状态。
4. 打开原任务；准确桌面owner可用时优先交由其发送，不另恢复；无owner时沿用App Server恢复。两路均再次读取最新Turn、Kernel状态和活动，拒绝身份或状态竞态。
5. 向同线程发起带固定实施说明的新Turn，并显式使用default。桌面路径沿用已确认的模型及思考强度；不能确认模式能力或原设置时返回失败，不再降级成只发文字后声称实施。
6. 只在新 Turn 的 inProgress 回执或定向复读确认后报告执行成功；启动写入超时只复核，不再次发送。

注意：[launch-plan.cjs](../../../../preload/codex/launch-plan.cjs#L1)处理 CLI 可执行文件启动方案，不是产品 Plan 实施决策 owner。不能仅凭该文件名称判断任务实施是否接通。

### 继续任务

[continue-task.cjs](../../../../preload/codex/continue-task.cjs#L39)为独立执行器：

1. 只允许用户准确选中的 stopped 根任务，且继续能力、revisionAt 与最新状态一致。
2. 读取 thread、最新 Turn 与 Goal；普通任务要求最新 Turn 为 interrupted / failed。已暂停或 blocked Goal 可接受已完成 Turn。
3. 拒绝正在活动、普通输入、审批及额度或预算限制。普通任务有准确桌面owner时直接使用其发送；其它情况打开原线程并恢复。发送前再次校验任务、Turn和Goal。
4. Goal paused / blocked 优先发起同 Goal 原生激活；不会另发新 Turn 双启动，不调整预算。
5. 普通中断向同线程发起带固定继续指令的新 Turn。仅明确 method-not-found 才允许原生命令降级；写入超时走同目标复读。
6. [Kernel 能力投影](../../../../preload/companion/task-kernel.cjs#L739)与 [Host 证据](../../../../preload/index.js#L11575)限制 Provider 和根任务身份。外部 CodexHost 线程没有这条已验证的继续能力；Orca、Claude、Cursor 不因该 Codex 实现自动获得继续入口。

「恢复 Plan」对应插件本地 paused/hidden 状态恢复，[Kernel pause/resume](../../../../preload/companion/task-kernel.cjs#L2915)不会启动原生任务；它与「继续任务」不是同一动作。

## 实机实验与根因

### 样本与实际结果

1. 当前唯一待输入 Plan 为“261113-EYPC-核验视窗悬浮差异”。原生 UI 显示「实施计划」按钮可用，根下有一个 Side。
2. 本轮开始前，08:41:44、08:41:47、08:41:48、08:41:50已有四次同目标 `execute-plan-result=failed/state-changed`。
3. 本轮在 08:47:36 仅单击一次该按钮；同目标再次返回相同错误。UI 仍为等待输入，未进入运行，未重复点击。
4. 08:45:34的已接纳成员证据表明：根为 waiting-input、唯一 Side 为 completed。08:48后仍有根 waiting-input、Plan available、interactionCount=1、runningMembers=0的状态证据。实施确认交互计数为1，普通输入、审批与计划选择均为0。
5. 匿名动作引用与成员根引用相同；成员集合日志还把单次匿名引用与根聚合事件关联起来。没有读取该任务的会话正文。

### P1：实施确认把自己当成阻塞条件

**依据：** [planTaskAllowed](../../../../preload/index.js#L10930)要求 Plan ready、版本相同、能力可执行，同时要求 `topology.attentionCount` 和 `topology.liveCount` 均为0。

但 [成员集合](../../../../preload/companion/task-topology.cjs#L183)包含根自身；[Kernel 聚合](../../../../preload/companion/task-kernel.cjs#L1637)对全部成员计数。[相位词汇](../../../../preload/task-phase.cjs#L47)把 waiting-input 同时归入 live 与 attention。

因此本次样本得到：根等待输入 + Side已完成 → liveCount=1、attentionCount=1 → 初始门禁拒绝。这里的1来自用户正要确认的根计划自身，不来自仍在运行的子任务。

**实际诊断：** 从现行源码抽取原始门禁函数，在无外部副作用的本地环境输入已观测的成员相位，得到下表。此项是有界诊断，不是整库测试或修后验收。

| 序号 | 成员底层相位 | 最终界面相位 | liveCount | attentionCount | 初始门禁 |
| --- | --- | --- | --- | --- | --- |
| 1 | 根waiting-input，Side completed；当前样本 | waiting-input | 1 | 1 | 拒绝 |
| 2 | 根completed，Side completed；完成Plan投影 | waiting-input | 0 | 0 | 放行此门禁 |
| 3 | 根普通waiting-input | waiting-input | 1 | 1 | 拒绝 |
| 4 | 根completed，Side waiting-input | waiting-input | 1 | 1 | 拒绝 |

**影响：** 同样显示待输入、同样有可用实施按钮，底层完成Plan投影能过门禁，真实Plan实施等待却被拒绝。实际失败发生在原生启动前，不能归因于模型权限、CLI没有安装或执行指令发不出去。

**建议：** 只豁免同一根、同一Plan版本的实施确认；普通输入、审批、其他子任务活动继续阻断。不能直接删掉所有家族活动检查。

### P1：后续活动门禁仍需识别同一Plan确认

[activityBlocked](../../../../preload/index.js#L10940)拒绝任意 activeFlags、active状态和进行中的Turn。若真实实施确认在来源中表现为 waitingOnUserInput，该门禁也会拦截。

这项为源码可见的后继问题：当前样本已被初始门禁拒绝，本轮未运行到该分支，不能声称已实机复现第二次拦截。修复时须一起审视来源中的准确Plan交互，并保留真正活动/普通请求的拒绝。

### P1：悬浮窗没有收到动作结果

Float 的 [action](../../../../src/FloatApp.vue#L1535)只得到发送成功与否；[Runtime Action](../../../../src/runtime/feature/codex/actions.ts#L156)启动异步执行后立即返回。最终错误交给 [主窗口setMessage](../../../../src/runtime/codexController.ts#L3438)。

[Float Snapshot](../../../../src/runtime/codexController.ts#L147)没有计划执行/任务继续的结果字段；[生成快照](../../../../src/runtime/codexController.ts#L3941)也不带主窗口message。Float 只为投递失败、本地能力拦截等写本地 liveMessage。本次点击后只能见到实施计划提示与仍在等待的行，没有后端state-changed原因。

**影响：** 后端明确拒绝，悬浮窗却表现为点击没有结果，容易被理解为按钮尚未实现；继续任务也共用这一结果缺口。

**建议：** 复用现有悬浮窗气泡层，以operationId关联并显示已启动、失败原因、结果未确认；明确发送成功不等于任务启动。无需新增改变列表几何的状态行。

### P2：普通继续后的本地模式记录缺少原生依据

继续执行器成功后调用注入的markStarted；[Host注入](../../../../preload/index.js#L10906)复用计划实施的标记函数，而该函数[直接写入default模式](../../../../preload/index.js#L10848)。但普通继续的[turn/start请求](../../../../preload/codex/continue-task.cjs#L165)没有指定collaborationMode，成功判断也只确认新Turn正在运行。

因此可以确认本地模式记录缺少依据；不能用它证明原生已从Plan切到default。本轮没有运行真实继续，不能据此宣称续接失败。Plan模式中断后继续规划可能符合用户原意，是否继承原生模式仍需实机确认，不能把省略模式本身当成已证实的执行缺陷。

## 既有验证为什么未捕获

1. [Plan成功执行夹具](../../../../tests/platform/codexAppServerBridge.test.ts#L4196)从已完成Plan进入waiting-input投影，底层成员计数为0；Fake最新Turn也是completed。
2. [真实等待能力测试](../../../../tests/platform/companionTaskKernel.test.ts#L830)断言有executePlan能力，却没有继续调用真实Provider执行器。
3. [Actions单飞测试](../../../../tests/platform/companionTaskActionsBridge.test.ts#L295)mock了Provider执行，绕过现行初始门禁。
4. [继续任务测试](../../../../tests/platform/codexContinueTask.test.ts#L45)定义普通中断、Goal、竞态和不重发等场景；本轮仅读其定义，未重跑，不能把历史通过当成本次真实恢复证据。

缺少的关键交叉场景是：真实根Plan实施等待 + 当前交互 + 真实Provider执行器。状态、按钮能力和执行器分开通过，未覆盖这一组合。

## 首轮调查的未验范围与原修复建议

首轮授权范围为调查与指定样本尝试，当时未修改业务代码或构建，没有执行全量测试、类型检查或打包，没有替换运行版本。后续修复和最新未验范围见本文开头；现有其他未提交产品改动保留。

1. 先修准确Plan确认与根自身计数的冲突，再检查恢复前后两个活动门禁；保留身份、版本、其他待决请求及子任务活动保护。
2. 同步补充Float结果回执，确保失败和indeterminate都能直接看到，且不会自动重发。
3. 修后定向检查：根真实Plan实施等待成功；普通输入/审批拒绝；活跃/待输入Side拒绝；Side完成允许；恢复间新Turn/Plan变更拒绝；启动超时只复读；完成Plan投影仍成功；同目标并发只启动一次。
4. 加载修复候选后，仅对准确指定Plan执行一次并确认同线程新Turn和running状态。源码和合成通过不能替代这一步。
5. 继续任务须另选明确可恢复的样本，分别验普通中断与paused/blocked Goal；以原生模式和实际行为核验续接，不使用本地default标记代替原生证据。当前其他业务任务没有被授权为实验对象，本轮不随机启动它们。

## 其他边界

- 诊断链路存在单次与二次匿名化差异：[Kernel先匿名化](../../../../preload/companion/task-kernel.cjs#L1752)，[Host record再匿名化](../../../../preload/index.js#L11176)。导致直接用动作taskRef过滤root-state-resolution找不到同目标；本轮通过成员root ref完成关联。这不改变本次失败结果，但会降低排查效率。
- 首轮标题Apply Gate返回invalid-title-format，当时未完成自动改名；修复轮已通过正式Apply Gate改名，未绕过手设标题保护或直接修改宿主数据库。
- 帮助文档的继续/实施入口描述与预期行为一致；本轮没有改变用户行为或帮助内容。当前问题属于既有通路中的行为缺陷，不是新增需求。
