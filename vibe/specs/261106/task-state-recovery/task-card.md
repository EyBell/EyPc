# 任务状态、未读跳转与悬浮窗整合修复

状态：12:26:19候选已安装并实机确认：点名的CN任务从待继续恢复到已完成未读，原生未读保持。另有Plan消费关联与物理快捷键/原生目标视觉验收缺口；未提交或推送。承接用户确认的 2026-11-05 规划，2026-11-06 授权实施；不新增需求。

## BusinessChangeReview

- 基线：`9e55a52`；[既有未读修复](../../261105/codex-unread-linkage/task-card.md)、[Plan 原始语义](../../260824/eypc-v7-global-refactor/raw-requirement.md)、[现行需求](../../PRODUCT_REQUIREMENTS.md)。
- 允许变化：修复当前 owner 运行证据恢复、过期快照覆盖、快捷键重复及水球收起生命周期缺口；诊断贯通同一操作身份。
- 保留：dispatched 不等于已读；真实来源确认才清未读；合法 Plan-only 待继续；独立正常按键继续走位；既有深链、配额整行选择、94×94 透明窗口；无新持久化、设置、协议。
- 消费者：Host/Kernel、Main/Float、专用未读入口、通用循环、数字打开、来源订阅/重载。
- 测试预期：不修改既有业务含义；新增缺陷回归。其他工作区改动保留，不整文件混入交付。
- 无业务裁决待定；真实环境限制及未确认因果必须保留。

## 归因账

| 编号 | 来源 | 结论 | 处理 |
|---|---|---|---|
| R1 | `c628440` 未读恢复 | 同 owner 小 revision 保护依赖 pending 存在；结束/超时/clear 后旧 snapshot 被放行，三个夹具修前失败 | 将原生 revision 顺序保护放在 pending 生命周期之外；允许同 revision 读态变化 |
| R2 | 历史运行快照接纳 | initial-snapshot 与独立 server 的 interrupted 冲突；原候选10行缺少充分因果保护 | 同 Turn/同 startedAt 的独立 inventory/targeted-after-exit 中断可纠正；owner 终态不可复活，父子库存分离，重复 snapshot 不增序号 |
| R3 | 历史 Plan 映射 | 8月已有合法 Plan-only → stopped 规则；不是11月5日新增 | 保留；截图每项缺完整Plan证据，不能批量改已完成 |
| R4 | 快捷键路径 | cycle 合并不涵盖 attention；原生入口未提供可验证的释放/重复身份；现场单次入口不能认定长按 | 本地repeat过滤；同operation去重与走位回归；全局入口贯通operation诊断，不猜冷却时间 |
| R5 | `f4007b6` 水球收起 | 两帧/定时回调需要生命周期归属保护 | 收起代次 + 取消 rAF/timer；迟到回调只影响本轮，卸载失效；18 项本地键盘/窗口回归通过 |
| R6 | `cd634b8` / `9e55a52` / `2346dec` | 分别修未确认读收据、外部来源漏口、额度选择 | 保留并定向回归 |

## VerificationImpactTrace

- 运行/Plan：当前完整owner、旧终态、缺边界、父子隔离、重复快照、Plan清除/当前交互。
- 未读：多个合成任务订阅不改未读、明确目标已读、缺字段、新事件覆盖旧响应、单飞尾随、结束/超时/clear后的迟到旧版本。
- 导航：同operation去重、不确认不清未读、完整轮回可重试、本地repeat、正常分次按。
- 窗口/额度：连续开合及卸载、94×94、额度整行选择；视觉像素和网关实时读数单列。
- 门禁：定向测试、生命周期、类型、合同、镜像、独立候选 `validate:utools`；不运行无关全库测试。
- 初次构建仅使用合成状态夹具；随后用户明确授权创建可丢弃会话并在本机加载，真实实验见下文。仅操作甲乙，不消费其他任务未读。

## 实际验证与交付

- 纯候选：`9e55a52` 导出后只叠加本任务源码、原方案相关 cycle 排队修复及测试；不带工作区外观/tooltip、freeze-trace、Plan 输入优先等其他未提交改动。
- 运行证据：同 Turn 的 interrupted/failed 两例修前失败、修后通过；工作区相邻回归29项通过。纯候选运行/Canonical 定向18项通过；不等于全Bridge文件通过。
- 未读：settled/expired/cleared 三种旧 revision 覆盖夹具修前失败、修后通过；合成多任务订阅、同revision显式读、缺字段、新owner及单飞尾随覆盖。合成原生集合不证明真实应用无副作用。
- UI：打开repeat及旧收起回调修前复现失败，修后18项通过；纯候选18项同样通过。
- 纯候选6文件262项 + 运行18项 + UI18项 = **298项定向测试通过**。没有运行整套测试。
- 纯候选合同、类型、生产构建、`validate:utools`通过；source/packaged各40核心场景、60生命周期检查点、23原生未读检查点。工作区同步97对镜像、entry budget、静态未读通路、diff检查通过。
- 扩展UI整文件不是全绿：工作区87过/11失败；重建起始基线69过/同名11失败。纯HEAD叠本任务的UI整文件90过/5失败，失败为未改动配置页的旧静态断言；未将这5项宣称已修复。范围选择器已加入本任务定向映射；整个混合工作区的验证映射仍有无关未登记路径，未宣称全仓门禁通过。
- 入口预算仅增加11行接线；决策保留在既有activity模块，没有新增顶层状态/函数。
- [构建归档（不直接作为安装包）](../../../../output/task-state-recovery-261106-082341/eypc.asar) · [插件目录入口](../../../../output/task-state-recovery-261106-082341/dist/plugin.json#L1) · [纯候选patch](../../../../output/task-state-recovery-261106-082341/candidate.patch) · [文件校验清单](../../../../output/task-state-recovery-261106-082341/manifest.json#L1)。
- 构建身份：EyPc V7 / 0.1.0 / 2026-11-06 08:23:41 北京时间 / `host-5fac8151bf6859443aea` / `renderer-b1114c422297b99ea193`。这是隔离候选身份，现已由官方离线包安装并在宿主界面核实加载；未覆盖混合工作区runtime identity。

## Review Implementation

- Tool：review-implementation；对照用户确认方案、实际diff、修前修后夹具及纯候选结果。
- 已核：修复不改合法Plan规则、不把分发当已读；额度/窗口尺寸回归；同operation去重、全轮未确认可重试；不修改打开协议或持久化。
- P1待验收：截图各待继续任务缺Plan生命周期完整证据，不能逐项定性。新增匿名root-state-resolution诊断记录状态、Plan修订、Turn时间及成员贡献；须候选加载后采样。未批量强改标签。
- P1待验收：重新订阅是否造成多个原生未读变化仍未证实；原生深链是否准确切换尚未真验。须可控测试宿主/可丢弃会话，不反复消耗重要未读。
- 限度：本地有event.repeat可过滤；全局宿主没有已验证的keyup/repeat身份，不声称一次物理按压只打开一次。专用attention仍按实际到达的不同操作处理，贯通operationId仅帮助归因；未增加固定冷却时间吞掉正常按键。
- 下一步：按manifest核对候选加载身份，再分开执行仅订阅、仅打开、两者交错实验；检查原生未读集合/Main/Float、目标身份、运行重载、Plan证据及透明像素。当时实时额度应按来源整行选择，不拿历史44/69/68当现值。
- 提交候选按R1未读顺序、R2运行证据、R4导航诊断、R5收起生命周期拆分，未整体回滚或混入其他成果；初次交付未提交、推送或替换；后续授权安装见下文。


## 2026-11-06 受控实机核验

### 安装与隔离

- 用户明确授权创建可丢弃会话并加载候选。测试甲、乙由 Codex 原生工具创建，仅向这两条会话追加测试消息；没有操作其他任务的内容、归档或打开。
- 先只结束 EyPc。原安装包仍被 uTools 主进程持有，`apply-local-utools` 正确拒绝替换；未绕过保护、未重启整个 uTools。
- 使用 uTools 官方开发者工具从隔离 dist 生成离线包，再由官方“安装插件应用”入口安装。打包后的工程绑定已恢复到原工作区 `dist/plugin.json`，未发布市场。
- 已安装包：`unsafe-aa9cf720c969019ab5ac0602598dd6d8.asar`；SHA-256 `870ec4ef1ed9250102a0f18aa3ac7489ff3d5d06bcd164f1b2f35390e256b7b2`。宿主配置页实际显示 08:23:41 构建；首次加载 PID 65194，运行中重载后 PID 69889。
- 包内263个文件与隔离dist核对，无缺失；仅官方打包添加身份元数据的 `plugin.json` 不同。见[包核对](../../../../output/task-state-recovery-261106-082341/installed-verification.json#L1)。旧包和原生模块备份保留于候选目录 `rollback/`。

### 行为结果

| 编号 | 操作与观察 | 结果与界限 |
|---|---|---|
| H1 | EyPc停止时，甲乙第二轮完成后原生unread均为true | 建立完整双未读起点；不是从已读终点倒推 |
| H2 | 独立白名单probe：连接但不follow；仅follow甲；repeat甲；follow乙；两条退订/重订阅；断开 | 甲乙始终true；原生可观测其他任务读态不变。probe不打开、不标读、不自动重连，不保存正文 |
| H3 | 加载完整候选并展开Float | 甲乙仍true，Float显示已完成未读2；其他任务读态不变。未复现订阅本身清读 |
| H4 | Float仅搜索甲乙，Alt+2打开甲 | 一次open；receipt为dispatched/confirmsRead=false；随后原生甲false、乙true，Float未读数1。无关读态不变 |
| H5 | 点击水球“未读1”专用入口打开乙 | 一次attention-shortcut open；随后原生乙false，Float未读角标消失。无关读态不变 |
| H6 | 甲运行180秒样本期间仅重载EyPc | 新进程显示甲进行中，原生同时active；没有降为待继续。较早45秒样本已在观察前结束，不计运行中重载通过 |
| H7 | Alt+2后的收起水球 | 可见收起窗口为94×94，圆外没有原先额外矩形边框。未做跨桌面/缩放全矩阵或透明像素仪器测量 |
| H8 | 查询真实绑定，模拟按住1.5秒，分别在主搜索开/关时尝试 | 当前绑定Command+Option+T；两次均无shortcut-enter，不能算物理长按通过，不能证明/排除宿主连发 |

- [结构化实机结果](../../../../output/task-state-recovery-261106-082341/host-verification.json#L1)记录各步布尔值与验收缺口；未保存原始stdout、会话正文或提示词。
- 单次打开的原生目标读态变化已证实，但工具禁止操控Codex原生窗口，未取得选中线程的视觉证明；不把dispatched当成聚焦确认。
- 本次现场未发现新的可复现源码缺陷，没有凭猜测改动状态规则或添加固定快捷键冷却。既有修复已随候选加载。
- 全局入口没有已验证repeat/keyup身份；当前工具的模拟未触达宿主入口。真实键盘长按与正常分次按仍待验收，不能以本地DOM repeat测试替代。

### 七项待继续的只读归因

只读取指定任务的SQLite路径定位与rollout结构事件；输出事件类型、时间、Turn关联及Plan边界，未输出会话正文。两份较大rollout仅读取末尾32MiB，报告明确标注非全文件。见[逐项元数据](../../../../output/task-state-recovery-261106-082341/stopped-metadata.json#L1)。

| 编号 | 任务 | 已取得证据 | 判断 |
|---|---|---|---|
| S1 | 261028-SRM-WT-分润目标持续推进 | 最新Turn于11月5日07:55:18Z turn_aborted | 存在真实中断，不能改成完成 |
| S2 | 261104-SRM-已开票脱离续做 | 尾部11月5日07:55:28Z turn_aborted | 存在真实中断；尾读未覆盖最早边界 |
| S3 | 261030-SRM-WT-财务汇报欠款审核排查 | 11月4日07:47:44Z started后07:48:48Z aborted | 真实中断，非今天新增映射 |
| S4 | 261030-SRM-发票报价交互优化 | 11月4日07:42:48Z started后07:56:57Z aborted | 真实中断，非今天新增映射 |
| S5 | 核验剪贴板相同内容去重 | Plan完成，后续普通default轮完成，没有结构执行/取消边界；运行诊断planReady=true | 前阶段曾判有效Plan；本轮纠正为消费关联未明：存在后续default工具执行，仅无FileChange不能证明未实施 |
| S6 | 261029-EZV-三词含义收成 | 多次Plan完成，之后普通default轮完成，无结构执行/取消边界；运行诊断planReady=true | 前阶段结论同样纠正：不能据无FileChange认定Plan有效，也不能仅凭普通命令清除 |
| S7 | 261105-CN-分层统筹与迁移 | 根rootPhase=completed、unread=true、planReady=false；18成员的最终phase=stopped | 未读未清；结果来自成员终态汇总。SQLite source关系找到20条直接子任务：19条最后为task_complete，1条为真实turn_aborted；尚未确认它与当前17/18成员聚合的对应，不声称完全验收 |

### 保留现场与下一步

- 甲乙最后一轮均已完成并重新保持原生未读，保留为物理快捷键与原生界面验证样本；未归档，避免销毁未完成验收的起点。
- 本轮加载后的各对照点，原生list_threads可观测的无关任务未读集合无变化；这是采样覆盖范围，不声称验证全部历史会话。
- 下一步只需补真实键盘入口计数/原生目标视觉确认，以及S7具体成员来源。不把未完成项写为“全部修复”；不重新定义合法待继续。

- S7补充：[子任务结构证据](../../../../output/task-state-recovery-261106-082341/cn-child-state-metadata.json#L1)仅保留匿名引用、事件边界和读取覆盖范围。匿名成员`c29f9bead8d0`在11月5日08:19:36Z开始，同Turn于08:23:38Z中断，之后无完成事件（完整文件读取）。SQLite声明关系不能替代当前Kernel成员清单，因此该证据是明确候选贡献者，不是已闭合的聚合归因。

## 12:26:19 聚合未读补漏与实机修复

### 用户样本与根因

- 当前标题为“261105-CN-主控迁移自动交接”。用户明确异常是Codex未读、插件待继续。11:28:33运行版的日志显示根completed/unread=true、无Plan、19成员，最终stopped；原生只读列表同时为idle/unread=true。
- `aggregateMemberPhase`把任一终态中断成员提升成整个根的stopped；最终相位裁决遗漏“已有真实完成未读成员”的覆盖规则，未读组只接纳completed，导致待继续误分类及快捷键不可达。
- 这是[现行需求](../../PRODUCT_REQUIREMENTS.md#L363)的漏实现，不是需求变更；无须先证明具体中断关系陈旧才能修。前阶段以“成员聚合”为由暂缓此项修复，判断不充分。简单无子任务甲乙实验未覆盖这一维度。

### 修复边界与回归

- 仅改[Kernel聚合](../../../../preload/companion/task-kernel.cjs#L1644)：在聚合确认为stopped（所有成员都是终态）、没有当前交互、存在completed且已知未读成员时，展示completed-unread，时间取该未读完成成员的进入时间。保留成员中断和原生读态证据；真实已读后仍按剩余状态归约，不删关系、不批量改完成、不放宽为任意unread。
- [现有Kernel测试](../../../../tests/platform/companionTaskKernel.test.ts#L2255)新增8例：中断/完成/运行/输入/审批/未知子成员；快捷键实际选择根；dispatched保留未读；原生清读后回落；新完成重现；单纯中断未读不得伪装完成。旧“Plan根+完成未读Side仍stopped”断言违反同一需求，修正为保持Plan产物但先展示完成未读。
- 同一复现修前1失败、6通过；修后Kernel全部158通过，Topology全部6通过。生命周期脚本源与包内均60检查点通过；core各40、native unread各23；类型、合同、隔离生产构建及validate:utools通过。
- 生命周期单测文件仍有2个既存失败：期待58而实际60；旧terminal-completeness变异不触发。已在隔离目录仅撤掉本次聚合修复后复测，两项原样失败；不宣称全套全绿。未跑全库。

### 实际交付

- 当前宿主此前已换成11:28:33版，不能再以08:23:41包作为替换基线。隔离源码撤掉本次聚合改动后，精确重现已加载的host-b17531c56e8d731a4c5e / renderer-ac7952076a7b166b46f6，确认新产品差异只有本次Kernel修复。
- 新构建：12:26:19，host-f6f96ec7854b6ea33a22 / renderer-4df6785b43e8ff89f437。通过官方开发者工具打包并由官方安装入口更新；仅结束EyPc，没有重启uTools及其他插件。
- 新进程58973实际加载握手一致；Float可见“已完成未读 · 1”，点名CN任务“sub+17 已完成 · 未读”，不再位于待继续。仅查看列表，没有打开该任务；原生复核仍unread=true，本轮前后可观测其他任务未读无变化。
- [官方离线包](../../../../output/task-state-recovery-261106-122619/EyPc-unread-122619.upxs)、[结构化核验与构建身份](../../../../output/task-state-recovery-261106-122619/verification.json#L1)。原dist已保存在该目录previous-dist，工程绑定仍为原工作区dist；preload→public通过sync脚本生成。
- 其余待继续未批量清空：真实中断保留；两项Plan样本存在后续default工具执行，但缺明确消费关联，前阶段“Plan仍有效”的确定结论撤回。额外查到Plan同时间精度清除版本可能被拒收的独立缺口，尚未纳入本次聚合包；不能拿它解释没有FileChange的两条样本。
- 未提交或推送。当前已加载本次修复，无须用户再重建才取得此修复。物理快捷键准确聚焦仍待后续样本验收，本次没有消耗点名任务未读。

## 13:10后 用户续修：球外永久透明与Plan残留

- 用户反馈点击待继续任务跳转后94×94矩形再次出现，明确要求球外画布永久透明、不允许外观设计改变；球内外观、展开卡和侧边条保持独立。继续按已有本机加载候选与受控验证授权实施。
- 独立只读复核确认点击与数字均经打开→失焦→220ms→两帧/200ms收起，没有发现绕过等待。Float仍继承全局color-scheme: light dark，未隔离UA画布；本轮先只覆盖Float根scheme及固定透明外壳，保持宿主缩窗逻辑不动，实机判别该分支。
- 定向CSS夹具修前得到light dark（失败），修后normal。窗口时序回归与实际截图分开验收，不以CSS通过代替宿主透明。
- 并行仅修明确Plan实施事件同时间精度清除失败；不因普通命令、已读、重载批量清空待继续。两条真实Plan消费关联不足仍作为待查边界。
- 写集：主控src/styles/float.css、tests/ui/codexCompanion.test.ts及本文/状态；Zeno只写preload/codex/rollout-evidence.cjs与既有bridge测试；主控统一sync镜像、隔离构建与宿主验收。

### 本轮验证与交付状态

- CSS回归已证明修前light dark、修后normal；透明外壳、两帧/200ms、重开/卸载/过期回调及失焦收起合计11项通过。Plan执行者定向11项通过，主控选择8项独立复核通过；不是全库测试。
- 源与镜像同步完成；合同、类型、隔离build、validate:utools通过，源/包各40 core、60 lifecycle、23 native unread，镜像门禁和diff检查通过。
- 隔离源码相对当前12:26基线只有两处产品变化：rollout-evidence.cjs与float.css；未夹带其他dirty。13:17:16候选为host-c82efff168b824de7764 / renderer-b58b1e670dd7f3f0f76d。
- [候选插件目录](../../../../output/task-state-recovery-261106-131716/dist/plugin.json#L1)、[纯产品补丁](../../../../output/task-state-recovery-261106-131716/candidate.patch)、[结构化验证](../../../../output/task-state-recovery-261106-131716/verification.json#L1)。工作区dist已准备为该候选，原12:26 dist完整保存在输出目录previous-dist，已安装包未改。
- **未安装、未实机验收**：原生UI工具能观测当前94px水球，但路径弹窗在读取后输入时连续失去有效元素；重新绑定窗口仍失败。未绕过UI边界、未重启uTools、未打开重要任务。不能据CSS回归判定截图矩形已消失；下一步仍需实际加载该候选，判别UA画布与宿主残留像素。
- 两条真实Plan样本仍无精确消费关联；同时间清除补丁不是它们已证明的共同根因。保持待查，不强制标完成。未提交、推送。

## 13:46:19 原生Plan实施触发补漏

用户已加载13:17版，宿主13:34:43握手已确认。继续逐项审计发现：两条Plan残留存在明确turn_attribution.turn_trigger=plan_implementation。此前仅按FileChange及命令类型判断“缺证据”不充分，本轮撤回该结论并修复字段漏读。四条SRM有真实中断、CN仍有子任务聚合待查、另一个截图任务核验期间已原生归档并被插件确认。详见[八项证据、处理边界与修复验证](stopped-evidence-audit.md)。

两真实结构记录修前均ready、修后均cleared；11项定向测试及隔离build/validate通过。13:46:19候选已准备工作区dist但未安装；host-a50d610cb71016c68622 / renderer-851129e67be063d101cc。不得继续把此前“缺精确消费关联”当作两条不能自动纠正的结论。未提交推送，实机分组待加载验证。

## 14:30后：以内部状态和近期日志为准

- 用户已更新；14:24:38宿主握手确认为13:46:19候选（PID19164，host-a50d610cb71016c68622 / renderer-851129e67be063d101cc）。用户要求停止界面操作，直接查内部状态判断；透明视觉验收暂不作为当前诊断步骤。
- 当前截图待继续从8降至5；原生Plan实施补漏已进入实际宿主。近期日志中三词任务Plan为executing、planReady=false、最终completed。CN仍为rootPhase=completed、planReady=false、18成员聚合stopped，继续核成员贡献与关系生命周期，不能用Plan修复覆盖该问题。
- 本轮用户明确规则：真实暂停/中断保留待继续；已实施Plan按后续最新状态；最后新产出且尚未实施Plan显示待输入。该明确决定限定替代旧artifact-only stopped展示，不授权批量强改完成或清未读。

### BusinessChangeReview / VerificationImpactTrace

- 基线：PRODUCT_REQUIREMENTS的Kernel/Plan独立车道（264、307、319、336）及codex-side-phase-raw-001。允许差异仅最新可执行Plan的展示；执行消费与原生最新终态按既有单调证据。
- 保留：真实中断、当前运行和精确交互、潜在未读、Plan生命周期/执行能力、普通子成员聚合及原生打开协议；不改样式、不写原生任务、不消耗其他未读。
- 消费者：Kernel公开phase、dynamicGroup、cycle/attention选择、Main/Float共用包、Plan暂停/恢复。不能仅改界面标签，也不能制造原生interaction。
- 待测：最新Plan已读/未读→待输入；实施后完成/运行/中断；历史Plan与较新普通轮次；Plan暂停/恢复；快捷键等待选择；成员运行/输入/未知及完成未读保护。优先扩既有Kernel测试，随后同步镜像、合同/生命周期与隔离产物验证；不跑全库。
- 写集：Zeno仅Kernel源与对应现有测试；Euclid只读CN关系；主控文档、镜像、隔离构建及当前日志核验。

### 14:39:56候选完成，CN待新诊断

最新未实施Plan待输入的Kernel规则已实现，171项回归通过；新增匿名成员因果诊断1项通过。候选、日志发现、原生归档纠正、当前未加载及CN尚未闭合边界见[审计记录](stopped-evidence-audit.md#143956内部状态候选与cn诊断缺口)。工作区dist已准备；未操作其他任务、未提交推送。

## 续接：AG可见性与用户触发的继续/实施按钮

- 14:45:17宿主PID37203确认加载14:39:56候选（host-414707ec3eccedb0a5e8 / renderer-52c294054e6b53d83272）。CN新成员日志19成员、无遗漏，18完成+1真实中断，唯一中断开始边界匹配既有中断子；未见新完成/撤销证据。
- 用户新增AG三项核验：水肥机/变频器原生Goal均blocked，插件stopped；双核心无Goal且最新轮次completed。最近轮次均10月29日，原生未读false、未归档、未置顶。动态组缺席待实测窗口/hidden，不能把默认48小时当作实测。仅只读，未恢复业务Goal。
- 用户明确新增按钮：真实中断可快捷继续；未实施Plan可快捷实施，优先原生命令，缺能力才发送固定后续指令。本轮实现按一次按钮点击发起，保留归档确认；只对点击的准确目标操作，禁止批量或自动恢复其他任务。

### 按钮改动影响与验证待办

- 新增独立continue-task命令与可选continueTask能力，不能复用现有resume（只是EyPc Plan解除隐藏）。仅根自身真实stopped且无活动/交互才允许，根完成仅子中断的CN不代选子执行。
- 已核本机Codex原生生成schema：thread/goal/set支持status=active、origin=user；普通thread/resume只是载入，需turn/start。Goal paused/blocked优先原生激活，不另发turn/start造成双启动；额度/预算限制不得改预算或越限。无原生能力仅在method-not-found后降级，超时不能盲目重发。
- 保留：精确身份、原生未读、模型/权限设置、状态因果和其他Provider行为；不改样式或窗口规则。公开结果不含提示词/原生身份。
- 预期验证：最新状态变更拒绝、同目标并发去重、超时结果不明不重复、根/子分离、Plan单击与继续分流、Goal原生命令仅一次、固定指令回退、native前置检查、UI按钮及类型/隔离构建。只运行受影响定向检查。
- 写集：主控preload Kernel/actions/index/manifest与对应平台测试；Lovelace仅Float/controller/runtime动作/指定domain类型与对应测试；Gibbs仅新增continue-task执行器及其测试；Ampere只读AG配置调查。public由主控统一sync生成。

### 单击动作整合复核

Tool: review-implementation。需求为用户本轮明确的继续/实施按钮；原五秒Plan确认已由单击发起取代，归档确认保留。真实中断与Plan分流，只有准确根任务满足能力门禁时才发起；外部Host线程无已验证继续通路，不展示继续能力。恢复会话后重新检查身份、轮次和活动；异常/超时只复核，不盲重发。

本轮UI独立补丁8文件已叠加14:39隔离基线；源代码6文件与工作区逐字节一致。继续执行逻辑独立在continue-task模块；preload入口新增53行接线和Plan恢复后复核、1个缓存执行器绑定，预算据实登记，不以压缩行数藏增长。帮助、需求登记、局部精化边与核心验证映射已更新。

AG可见性缺口与既有CN真实子中断均保留证据边界；新增日志只使用当前Kernel内存字段，不读取正文或新增订阅。当前仅完成合成测试，不代表已恢复任何真实任务；依照用户先前要求不再操作悬浮球，实际按钮与目标运行验收单列。

### 15:24:45候选：继续/实施动作已打包，尚未实机加载

- 隔离基线为已加载14:39版，仅叠加本轮14个产品/构建文件。隔离src/preload/contracts与当前工作区逐字节一致；其余脏文件未提交、未回滚。
- 整合后4文件定向49项通过（588跳过）；执行者UI11项、backend44项及未改执行器61项均有证据，包含重叠，不累加为总用例数。合同、类型、生产build与validate:utools通过，源/包各40核心、60生命周期、23原生未读。镜像96已跟踪对+2未提交对通过；入口预算14818/279/163通过；未跑全库。
- 复核未发现阻断源码交付的新问题；真实按钮点击后原生启动及AG动态可见性仍待加载后核验，不以合成RPC替代。CN根完成仅子中断不显示继续父任务按钮；外部Host线程继续能力关闭。
- 构建身份EyPc V7 / 0.1.0 / 2026-11-06 15:24:45北京时间 / host-7672017359787d10498c / renderer-36fd4d65ecf12307291e。
- [候选入口](../../../../output/task-state-recovery-261106-152445/dist/plugin.json#L1)、[纯产品/构建补丁](../../../../output/task-state-recovery-261106-152445/candidate.patch)、[验证记录](../../../../output/task-state-recovery-261106-152445/verification.json#L1)、[文件校验清单](../../../../output/task-state-recovery-261106-152445/manifest.json#L1)。工作区dist已准备，原dist保留在同目录previous-dist；未替换安装包，未提交推送。
- 本轮没有向真实任务发送或恢复操作，没有再次操作悬浮球。下次加载后直接读取新增匿名状态日志，核实AG实际window/hidden/anchor/group；实际任务执行由用户选择点击，不自动恢复业务Goal。

- 交付前再次只读核对最新日志：仍为14:45:17握手的14:39版host-414707ec3eccedb0a5e8 / renderer-52c294054e6b53d83272，新15:24候选尚无加载证据。需求/来源锚点、文档代码链接与diff检查均通过。

## 15:40后：待继续时间豁免、默认一周与搜索提示

用户已加载15:24候选，新日志证实AG水肥/变频均stopped但超过实测72小时而动态分组none。用户最初提出统一30天，随即明确纠正为待继续豁免动态窗口；之后要求动态默认一周并指出截图搜索右侧误显总体30天/82条。最终依RAW-002保留已有独立相邻配置，只改缺省为168小时、stopped豁免与当前页提示，不覆盖已有72小时。

BusinessChangeReview：允许变化为上述三项；保留隐藏/插件暂停、总体库存范围、其他状态及原生读态/任务内容。状态归因继续只读核对，不能将用户看到完成直接解释为状态源漏识别。VerificationImpactTrace：旧中断入动态且循环可达、隐藏暂停仍排除、完成仍受窗；搜索各Tab/筛选计数与范围、默认168但保留72；生产包/合同类型及镜像。仅受影响定向检查，不跑全库，不操作真实任务。

写集：Gibbs负责Kernel/Host与平台测试；Lovelace负责Presentation/Float/默认设置与前端定向测试；Ampere只读AG完成标签调查；主控需求/帮助/隔离构建。被撤回的统一30天改动只精确回退本轮delta，不回滚既有按钮成果或其他dirty。

### 完成标签调查收敛

只读核验本机新日志、canonical域投影、Controller/Float与15:24:45包内相同实现：水肥/变频stopped未被latestTurn.completed覆盖；全部/项目集合复用同一canonical卡片，Float对stopped输出待继续。dual本身completed。未复现AG完成错投影，不新增猜测性状态修复；Float applied仅证明包已应用，不当逐行视觉验收。当前确定修复为时间豁免与截图搜索提示。

### 15:55:46候选：搜索提示与待继续豁免

- 确切根因：Float searchMetaText统一取总体timeWindowDays与all.length，且Controller的Float快照没有动态小时字段。因此动态17条旁边误写总体30天82条；不是配置入口不存在。已补公开设置字段与即时快照更新，提示按Tab/搜索结果计数，折叠不减条数；保存72小时格式化为近期3天，tooltip说明待继续等状态豁免。
- Kernel与兼容域投影均让stopped豁免动态窗，隐藏/暂停仍排除，循环与显示一致。Host只投影dynamicEligible、不因旧日期丢库存节点，无需扩大Provider读取；普通completed仍受窗口。新缺省168小时，已有72保留；总体默认30天独立，原两个配置入口保留。
- 整合4文件17项通过；Controller新增快照变更夹具修前失败，修后通过，随后修正可选baseRevision的测试类型并单项重跑通过。执行者domain155、UI4、backend14项为重叠证据，不累加。合同、类型、隔离build/validate通过，源/包各40核心、60生命周期、23未读；镜像和入口预算通过，未跑全库。
- 相对已加载15:24基线仅9个产品文件变化。隔离src/preload/contracts与工作区逐字节一致；[补丁](../../../../output/task-state-recovery-261106-155546/candidate.patch)、[候选入口](../../../../output/task-state-recovery-261106-155546/dist/plugin.json#L1)、[验证记录](../../../../output/task-state-recovery-261106-155546/verification.json#L1)、[校验清单](../../../../output/task-state-recovery-261106-155546/manifest.json#L1)。工作区dist已准备，上一版保留previous-dist。
- EyPc V7 / 0.1.0 / 2026-11-06 15:55:46北京时间 / host-b6175cbd81243ace4b9e / renderer-cd33fd9d59935efe0aa6。尚未实机加载验收，不操作用户业务任务或UI。未提交推送。

Review Implementation：当前用户三项要求均有代码与定向证据；未发现阻断源码交付的问题。真实宿主搜索提示呈现、AG两条进入待继续组仍须新候选加载后确认；本轮没有把未复现的AG完成标签作为已修复缺陷。
