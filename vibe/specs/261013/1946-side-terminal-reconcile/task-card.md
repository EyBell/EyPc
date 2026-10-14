# 较早 Side 终态独立核验

状态：2026-10-14 新包固定轮次的真实结束窗口通过。11:30:30 插件 running 直接进入 completed，未读包获 applied ACK；11:30:31.047–11:32:01.976 的 20 次原生样本在 90.929 秒内保持 completed/idle/unread，结束链未见短暂 stopped 或完成后反弹。结论限该轮原生与日志/ACK证据，未取得结束后截图，不扩大为长期保证；探针已退出，一次自动化已停用。代码回归和打包结果见 V-32–V-38，现场结果见 V-39–V-45。

## BusinessChangeReview

2026-10-14 文档与 Git 收口：用户要求整理本次状态修复及实际验收记录、提交并推送，排除无关改动。当前验收以本页 11:33 固定窗口结果为准；以下按日期保留的待安装、待结束或未提交说明均描述当时阶段，不再作为当前状态。Git 交付以提交和远端回读结果为准。

2026-10-14 535 ms 瞬态续修授权：用户要求梳理完整结束事件链，定位并修复正常结束时先 stopped 再 completed 的误判、补回归并打包；不得用延迟掩盖。安装继续由用户完成，新包安装后再自行绑定固定轮次核验真实完成、未读和反弹。允许变化限正常结束事件顺序及确切终态准入；真实 interrupted/failed、待输入、新轮次、普通成员和 Goal 保护保持。

本次 VerificationImpactTrace：以现有 Bridge→Kernel harness 复现 runtime idle / canonical Turn / unread / targeted read 的真实先后顺序，逐次检查发布状态而非只断言最终值；至少覆盖完成顺序、明确停止/失败、较新运行、等待和成员未结束。模块回归、相关 Bridge/Kernel 回归及既有 source/packaged 生命周期与原生门禁按实际影响执行；不因续修扩大为全库。工作预算 M、最多两条既有只读探索子代理，Root 独占实现/回归/文档写入与验收；子代理只返回本次净增证据，不创建下级。文档影响为 task + project-current、现有产品真值澄清、架构 owner 与验证映射，无新增需求身份。

2026-10-14 本会话结束误判续修：仅排除原生权威来源精确标记 `guardian_review` 的内部评审线程；该线程不属于用户任务的 Side/子代理清单，不决定相位、未读或 sub 数。资格判定须覆盖库存、实时通知、Desktop 快照/patch 和旧关系恢复；已误纳成员的节点与关系同批撤回。普通 `subagent` / spawn、用户 Side、未知或缺失来源仍按原合同聚合，不以“早于主轮”“读取失败”或 TTL 作为排除依据，不改通用 Kernel 的 completed+stopped→stopped。验收包含冷启动、迟到来源确认、恢复提示和晚到事件不复活、真实子代理运行/失败保护，以及本会话原生完成未读→插件完成未读。

2026-10-13 21:39 续修授权：用户要求修复诊断中的代码缺陷，并在安装后自行对照原生与插件验收；随后明确安装由用户完成。允许变化补充为原进程临时 Side 自身终态/Goal 能力接入、已有 Goal reader 恢复重试、严格清退同批撤回 Kernel 成员节点。先核实原生 ephemeral Goal 合同；不从字段缺失/notFound 推断 none，不关闭 Goal 保护。保留新运行、未答请求、旧 owner/revision、较新成员轮次、读取失败及其他根保护。实现和自动门禁完成后交付产物，安装及新宿主真实验收保持待办；不替用户安装或重载。

续修验收：临时 Side canonical completed → 成员终态/根完成；新运行与未答问题压住旧完成；持久 Side Goal 失败后由现有事件/扫描节流重试；清退私有成员与 Kernel node 同批删除且无孤儿；已有 completed/unread 和父子独立轮次保护仍通过。用匿名成员来源/查询类别/接纳原因补诊断，不记录正文或原始 ID。

基线：[当前产品真值](../../PRODUCT_REQUIREMENTS.md#L239)、[既有 Side 聚合合同](../1425-codex-side-phase/spec.md#L5)、V7 Bridge 成员精确终态与 Kernel 聚合。现场主任务原生 idle/latest completed；匿名日志关联四个成员，日志未给出完整逐成员相位，不声明唯一现场根因。

允许变化：精确 Side latest-Turn 核验以该成员自身轮次和活动序列为边界，接纳比主轮次早的完成；成员终态只更新该成员，不改写较新的主轮次。未知 Side 起点保持 0，不借主起点；其他成员活动不取消本成员核验，当前成员新活动仍使旧结果失效。

保留：真实新运行/待输入仍优先；父完成不能证明所有成员完成；读取失败/缺失不证明结束；同一成员更新会作废旧核验；不增加轮询、TTL、状态回写或持久状态。消费者为私有成员证据 → Evidence Adapter → Kernel 根卡/分组/角标/cycle/归档保护。

测试变化：仅新增回归，不修改既有预期。较新主 completed 与较早子 completed 的定向回归在原源码上失败，子未接纳终态且错误使用主轮次时间。保留现有剩余活成员保护。未改需求语义，无新增需求身份。

## 首轮 VerificationImpactTrace（历史记录）

| 编号 | 验收点 | 检查 / 状态 |
| --- | --- | --- |
| V-1 | 四个较早子终态接纳，较新主轮次不改写，根 completed | Bridge 两个组合（snapshot/activity-event）通过；原源码单成员失败，四成员活动续核在未修取消逻辑时失败 |
| V-2 | 其他成员 running/waiting 不被完成清除 | 既有 Bridge defer/成员组合与 Kernel 回归通过 |
| V-3 | refollow/旧完成/新活动/读失败因果保护 | Bridge 完整模块回归 189/192；3 个既有失败保留 |
| V-4 | 产物包含源修复，原独立门禁保留 | 镜像、入口预算、类型、合同、生产构建/uTools 校验通过；source/packaged 各 10 核心 + 20 生命周期 + 20 原生/成员检查 |
| V-5 | 现场目标退出进行中且不反弹，并正确完成 | 20:12–20:14 三次实际界面采样均 unknown/sub+4；未观察到进行中反弹，但完成状态验收未通过 |

不跑全库：无共享协议/工具链变更；影响限 Codex 成员 latest-Turn 与同一根卡消费者。打包包含项目规定的 semantic typecheck。保留已有无关脏改动，不提交/推送，不操作真实任务。

## 修复与独立保护

1. 成员定向查询不再使用主任务的起点和其他成员的活动水线；同成员新活动、等待、revision 变化与读失败保护保留。
2. Side 快照终态只收口该成员；最终成员结束也不覆盖主任务较新的轮次。未知成员轮次不再继承主起点，避免 Kernel 拒绝正确的较早成员完成。
3. Side 活动更新保留其他成员的独立查询；当前成员的新活动由本成员水线拒绝旧结果。
4. 因果序列纯逻辑归现有 desktop-activity-resolution owner；入口缩至 14725 行，函数 279、全局可变绑定 163 不增加。预算收紧，没有放宽。
5. 原构建检查内增加三个成员 epoch 独立检查，并新增坏实现 canary。独立检查对原 HEAD 实际报错（主起点混入 Side），对 source/packaged 修复通过；没有只检查源指纹。

## 自动结果与产物

1. 四个相关文件合计 349/352；三个旧失败分别为 Plan cycleTier、Orca execFile allowlist 与 initialize retry 的 execFile 零调用预期。没有修改、跳过或放宽这些断言。当前主任务 refollow 回归通过。
2. 构建与原 source/packaged 核心门禁通过；未跑全库。帮助指南描述的既有状态语义恢复，无操作步骤、默认值或入口变化，因此未改帮助文案。
3. core：EyPc V7；host：host-122a454b8ca1679adc68；renderer：renderer-f154c3a85e79721bf2b0；builtAt：2026/10/13 19:56:36（北京时间）。产物就绪不证明已加载。
4. 主任务与可由精确原生父子元数据定位的一名 agent 均为 idle/latest completed；匿名根证据有四名 Side。未读取其他成员正文或凭据，未取得四成员当前逐一相位。现场是否完全消除需新宿主握手与目标根卡不反弹证据，不能以自动回归替代。

## 重载后现场核验（20:09–20:14）

1. 20:09:17.118 精确握手为 host-loaded；实际/期望 Host、Renderer 及 Kernel/Registry/Topology/Snapshot/Subscribe/ACK 全部一致，已加载本节 19:56:36 产物。
2. 原生主任务两次定向读取均为 idle/latest completed，完成时间不变；EyPc 可见目标根卡在超过一分钟的三次采样中均为状态未知/sub+4，归档按钮禁用，未观察到再次显示进行中。已恢复临时搜索与悬浮窗收起状态，没有打开会话、改已读或手动相位。
3. 根未读证据显示五名成员（主加四名 Side），read bridge connected；20:12:43 的任务包仍获得 applied ACK。未读 known 或成员计数不能证明所有成员已接纳终态；已有匿名日志不足以归属每个成员的相位。
4. 当前只能确认新产物加载、原生主完成与 sampled-no-running-rebound；无法确认整家完成。此前自动回归不能替代这项现场缺口。后续需要定向补齐或核对成员终态证据，不使用时间超时、手动完成或父完成推断子完成。

## 未读根卡与 idle Side 续修（20:16 起）

1. 用户补充已完成未读的对照。该根的来源 unread 与主分支 observation 均为 true，而实际 UI 为 unknown/sub+2；问题是完成相位未接纳，不能归因为已读回写或蓝点丢失。本轮仍不打开会话或改已读。
2. 修复前两项新 Bridge→Kernel 回归失败：4 个 idle Side/根已读、2 个 idle Side/根未读均没有 exact latest-Turn 查询。允许变化仅为在现有 bounded reader 中核验未确认的闲置成员，确认成员自身完成后保持根未读与正确分组；不存在/失败不推断完成，新成员活动仍优先。
3. 测试预期审查：旧恢复测试将已完成 Side 的 latest-Turn 写成主任务 completed，主任务实际仍 interrupted。这是 correct-wrong-expectation：既有成员独立合同要求 Side 不改主轮次，Kernel 既有 all-completed/terminal-stopped 合同也不能被子完成绕过。保留 idle/无等待/已读及实际定向查询断言，主摘要期望改为 interrupted，并增加主 interrupted/子 completed 私有证据断言；不是删除、跳过或放宽保护。其他既有测试预期不改。

## 续修验证与当前产物

| 编号 | 验收点 | 当前结果 |
| --- | --- | --- |
| V-6 | 重载发现 idle Side 时发成员自己的 metadata-only 定向查询 | 已实现；两项旧源码失败回归通过 |
| V-7 | 已读根正确 completed、未读根正确 completed/unread 分组，IPC reset 后保持 | 4 成员已读、2 成员未读 Bridge→Kernel 组合通过 |
| V-8 | 当前成员新运行或待输入不被迟到完成清除 | 两项 held-read 竞态通过，归档仍禁用 |
| V-9 | 读取失败/没有轮次不推断完成 | 两项新场景均保留 unknown，归档禁用 |
| V-10 | 独立构建保护会拦旧 idle 漏核验实现 | 实际执行旧产物 reader 后被拒绝；新增正向与两种坏实现 canary，通过 source/packaged 各 23 原生/成员检查 |

1. 本次四文件 357/360；仍为 Plan cycleTier、Orca allowlist、initialize retry 三项旧失败，未改它们。恢复旧 raw 摘要断言的校准理由和补充主/子独立证据见上节。
2. 类型、合同、生产/uTools 构建通过；source/packaged 各 10 核心 + 20 生命周期 + 23 原生/成员检查通过。入口再降至 14720 行，279 函数/163 全局可变绑定不增加，预算收紧。
3. 当前产物：EyPc V7；host-7092e4fdf97d79591071；renderer-fed4fc44c9dfe76c152c；2026/10/13 20:32:26（北京时间）。新产物必须重载后确认握手，并同时核对前一已读根和补充未读根；不能用自动回归声明现场已修好。
4. 帮助语义仍为已有 completed/unread 合同，无用户操作步骤或默认值变化。未新增计时完成推断、轮询、服务、未读写入或手动相位；没有提交/推送。

## 第二次重启后现场核验（20:48–20:54）

1. 20:48:03.309 精确 host-loaded：实际/期望 Host 为 host-7092e4fdf97d79591071、Renderer 为 renderer-fed4fc44c9dfe76c152c，Kernel/Registry/Topology/Snapshot/Subscribe/ACK 全部一致。20:32:26 产物已真实加载。
2. 发票笔记主任务原生仍 idle/latest completed，轮次起止不变；实际浮窗展开与定向搜索两次均显示 unknown/sub+4，归档禁用，未观察到进行中反弹。新的 idle Side 自动回归通过不能证明这个现场已修好；仍缺四成员逐一相位和核验结果的精确关联证据，现有匿名日志不足以定位唯一阻断成员。
3. 服务器统筹任务已在 20:49:06 开始新轮次：原生 active/latest inProgress 与实际插件进行中/sub+2 一致；当前不是此前截图的完成未读轮次，无法用本样本验收 completed/unread。重启后该根未读日志为 read，不将新轮状态与先前 unread=true 混为同一轮次。
4. 本轮仅只读核对与文档更新，不修改实现、不重跑自动测试，不打开目标会话或改已读；临时搜索清空并恢复浮窗收起。状态仍为现场未通过，未提交/推送。

## 原进程与代码联合排查（20:56–21:36）

1. 21:34:45 原进程 Desktop IPC 定向快照：主任务为 idle/latest canonical completed、Goal 明确 none；目标 Side 明确 ephemeral=true、idle、canonical latest completed、overlay 0、requests 0，原生父关系一致。独立 App Server 对该 Side 的 read/turns 返回 thread not loaded、Goal 返回 thread not found；桌面原进程接口进一步明确 ephemeral threads do not support thread/turns/list。不能把这些错误解释成线程已删除。
2. 现有 shadow 已解析 canonical completed，却没有将它交给成员终态账本，仍走不适用于该临时线程的独立 App Server 查询；同时未区分 ephemeral 的 Goal 来源能力，失败的 Goal 核验会优先产生 unknown。按现场形状的原源码合成复现确认这一链路，不再将问题仅归为较早轮次或 idle 查询遗漏。
3. 另有两个独立原源码复现：Desktop-only Side 的 Goal 首次失败后，cache.has 阻断正常重试；严格清退使 private branches 2→1，但实时 batch 没有删除成员节点，Kernel 仍为 2/running。后者当前不能用于解释现场 unknown，因为 UI sub+3 与私有 4 branch 对齐。
4. 旧持久关系通过原进程快照重新证明仍有效；存储的非 winning 冲突修订不含该目标关系，没有证据将本次故障归因于旧垃圾数据。完整路径、证据限制及修复顺序见 [diagnosis.md](diagnosis.md)。没有改实现、重建/重载插件、删除关系、改变任务相位或已读，未提交推送。

## 临时 Side / Goal / 清退修复交付（22:14）

1. 临时 Side 使用原进程 owner 的最新完整 canonical Turn；要求明确 ephemeral、当前 owner/revision、成员自身轮次、idle、无未答请求/待提交/较新 overlay 或运行证据。不再对明确临时 Side 发持久化 turns/Goal 查询；普通 Side 仍走原 bounded reader。原生当前程序明示 ephemeral 不支持 Goal，因此能力可投影 none；显式 active 或畸形 Goal 不被覆盖。
2. 普通 Side 的 Goal 失败在后续快照/现有库存扫描中按 reader 的 30 秒冷却和 in-flight 去重重试；成员精确终态会核验旧 active Goal。没有新增周期轮询。严格确认缺失的 Side 清退时，Kernel 成员节点与关系在同一批次撤回，避免孤儿或残留成员。
3. 新增 Bridge→Kernel 10 项全部通过：已读/未读完成、不完整历史、待输入、较新活动/旧 owner、显式 Goal、IPC reset、普通 Goal 重试与终态刷新。已有严格清退回归亦通过。完整相关四文件 **278/281**：剩余三个为原有 Plan cycleTier、Orca execFile allowlist、initialize retry 的 execFile 零调用预期；未跳过、放宽或修改这些断言。
4. 模块/入口提取保持原判断与失败保守路径；独立测试随真实 owner 移动，不减少原门禁。source / packaged 各 **10 核心 + 36 生命周期 + 23 原生/成员检查** 全部通过，新增坏实现 canary 可拦截边界/运行/Goal 保护缺失。类型、生产/uTools 构建、96 对镜像、差异检查通过；入口预算由 14720 收紧至 14716，279 个函数/163 个可变绑定未增加。
5. 22:12:12 原进程只读真实样本：目标 Side 父关系一致、ephemeral/idle、canonical completed 且完整、请求/overlay 为 0；新 source 判定 owner-canonical-terminal/completed、Goal none/fresh。订阅随后解除；原始帧/正文未记录，原生任务及插件未改读/归档/手动完成。此证据不替代安装后的实际 Host/Renderer 链路。

当前产物：`dist/plugin.json`；core **EyPc V7 (V7)**；Host **host-731cf38f40e7b2322742**；Renderer **renderer-2127954b91f6016dc7b5**；builtAt **2026/10/13 22:14:59（北京时间）**。已同步产品真值。用户安装后核对精确 host-loaded 身份、目标原生成员与插件根卡完成/未读/成员数量，再观察不反弹；安装与此现场闭环均待办。未安装/重载，未提交或推送。

## 2026-10-14 安装后真实核验（08:30–08:39）

| 编号 | 检查对象 | 直接证据与结果 |
| --- | --- | --- |
| V-9 | 新宿主身份 | 08:30:44.159 host-loaded；Host host-731cf38f40e7b2322742、Renderer renderer-2127954b91f6016dc7b5 与交付及期望一致，全部 revision 匹配 |
| V-10 | 原发票目标 | 原生只读 archived=1，归档时间 2026-10-13 21:35:09；插件未显示。未恢复归档，其消失不能当作修复通过 |
| V-11 | 可核验对照：261013-KM-小程序与SRM打通复核 | 原生 root idle/latest canonical completed/Goal none/已读；唯一当前 Desktop Side 的父关系一致、ephemeral=true、idle/canonical completed、exhausted、无请求/overlay、已读。08:34、08:35、08:37 定向原生取样保持一致 |
| V-12 | 插件实际根卡 | 多次 AX 与像素检查均为“已完成 / sub+1”，位于已完成分组，归档按钮可用；没有打开或归档该任务。清空搜索后动态页置顶仍保持完成 |
| V-13 | 终态与传输链 | 精确根 e876d46b047e1c3341df34fd9f13cb5a / 成员 644a5a90098906fcdf14372d94e2aa82：08:30:49.873 owner-canonical-terminal/completed；08:34:24.140 重新跟随后 existing-terminal/completed。包 16 于 08:30:50.063 applied，170 ms |
| V-14 | 新运行保护 | 本会话原生 active/latest inProgress，插件“任务状态修复核验”保持进行中；完成修复没有把真实运行一并改成完成 |
| V-15 | 自然发生的未读与新回合 | “261013-CN-只读会话核心核验”08:34:35 原生 unread 事件进入日志，插件随后显示已完成·未读/sub+2；08:36:44 原生已读来源变更，08:37:01 定向原生已 completed/read。随后插件回到进行中，08:37:42 原生确认新 inProgress 回合 startedAt=1791938226252，晚于前一 completed 回合1791937188042。属真实新轮，不是旧完成反弹 |
| V-16 | 连续观察 | 08:30:43.924–08:38:53.158 共 1675 条本 session 日志，0 条 error，最后 applied ACK 为 08:38:45.330。对照根对应同步发布链的相位只见 unknown→completed，未见后续回退 |

1. 相位诊断使用盐化 h: 标识；h:c8b5d2af9e4939f2 与对照根的关联依据源码及相邻同步发布链，属于明确的关联推断，不宣称直接反解。精确根/成员的 terminal 日志、原生父关系和实际 UI 独立吻合。
2. 结论：新宿主上的临时 Side 完成来源已现场收口，已读完成、真实运行、自然未读/新轮更新有当前运行证据；观察窗口约 8 分钟，未见错误反弹。原发票归档目标、长期跨重启稳定性、Goal 失败重试和严格成员清退未在本轮主动制造/触发，不扩大为所有场景永久保证。
3. 所有原生探针仅输出有限身份关联、相位、时间及计数，订阅结束均解除；未记录正文/原始帧/凭据，未手动完成、改已读、归档、重启或安装。临时搜索已清空，页签恢复动态，浮窗恢复收起。本轮只读现场核验及文档回填，未改运行代码、重建、提交或推送，也未重复自动测试。

## 2026-10-14 本会话结束遗漏（重新打开）

1. 用户指出本会话结束后未被识别。前一现场只核验本会话运行状态，未覆盖结束，因此不是该场景验收通过。原生上一轮 `completed`，起止为 1791937853–1791938463 秒；08:41:03.675 插件日志却为 running→stopped，08:41:03.725 根未读=true。08:42:38.996 的后续 running 对应用户新的提问，不能遮蔽前一轮误判。
2. 六成员形状为主线程、两条显式子代理和三条内部评审；显式子代理与两条评审此前正常完成，唯一中断评审的匿名分支为 `51a03f79bd630080dc557531e44f25fd`，原生精确父关系相同、来源 `guardian_review`，起止 1791897327–1791897329 秒，早于本轮。所有成员 Goal 为 none。
3. 实际源码合成回放已复现：root-only 为 completed/unread；加入这类精确父关系的内部评审 interrupted 或 failed 后为 stopped/unread。原因是发现器只按 parentThreadId 验证归属，后续将内部评审与用户 Side 一并投影为 side-thread；普通 Kernel 按既有合同聚合，因此未读完成角标不出现。机器线程未读过滤本身有效，相位资格缺口独立存在。
4. 本轮不将所有历史失败改为完成，也不按时间删除成员。仅以精确内部来源排除错误成员，保留普通子代理、用户 Side 和未知来源。用户继续自行安装；自动回归及真实元数据回放不代替安装后本会话结束核验。

## 内部评审资格修复交付（2026-10-14 09:04）

| 编号 | 检查 | 结果 |
| --- | --- | --- |
| V-17 | 原错误红灯 | 原源码按真实六成员形状得到 stopped/unread，误纳内部评审；新增最初三项回归亦在旧实现失败（成员 6 而非 3、生成额外根） |
| V-18 | 混合成员 | 主线程 + 两条普通子代理 + 三条内部评审，三条评审均被排除；中断/失败评审不再污染根 completed/unread，普通代理保留 |
| V-19 | 资格更正与竞态 | 已入成员节点与关系同批撤回；恢复提示、通知、快照、迟到 Turn/Goal、等待中的旧库存扫描均不复活已知评审；明确普通来源更正仍允许纳入 |
| V-20 | 真实活动保护 | 已活跃但随后确认内部评审的成员撤回后，根原始活动与 Kernel 同时按现存证据重算；真实主运行、其他 Side 运行/待输入保持。缺主证据不推断完成，不用 Kernel phase 回灌 |
| V-21 | 新增 Bridge 回归 | 16/16 通过；完整 Bridge + native unread 232/235，剩余仍为原 Plan cycleTier、Orca execFile allowlist、initialize retry 零调用预期三项失败，未修改其断言 |
| V-22 | 其他相关验证 | 来源分类/快照 62/62；Kernel/Topology 144/144；生命周期脚本含两个新坏实现 canary 12/12；共 450/453 |
| V-23 | 构建与打包 | 类型、合同、Vite/uTools 生产构建通过；source / packaged 各 10 核心 + 47 生命周期 + 23 原生/成员检查通过，96 镜像一致 |
| V-24 | 入口治理 | 拓扑诊断归既有 topology owner，去重与重置保持；撤回活动复用既有 aggregation owner。入口收紧为 14707 行 / 279 函数 / 162 可变绑定，未放宽预算 |

产物：`dist/plugin.json`，EyPc V7（V7），Host **host-2b9c5439823c29cffcd9**，Renderer **renderer-4c01c1cb5bef0db2a415**，构建时间 **2026/10/14 09:04:19**（北京时间；2026-10-14T01:04:19.606Z）。尚未代用户安装、重载或改真实任务状态，未提交/推送。

安装后必须先匹配新宿主身份，再绑定本会话当前 Turn 的起点/引用和新 Host session。待所有子代理结束后，用有截止时间的独立只读本地探针记录该固定 Turn 在根回复结束后的原生完成、插件发布/ACK及后续稳定样本；探针不能是活子代理，不能用下一用户消息产生的新 running 代替前一 Turn 的结束。新消息出现时切断旧验收窗口，后续仅回读旧窗口证据。真实 UI/已读维度与日志共同核验；证据不足继续标待验，不能再把运行时对照写成结束通过。

## 2026-10-14 新包安装后固定轮次观察（布置记录，结果见下节）

1. 09:07:44.606 host-loaded 实际及期望 Host/Renderer 与 09:04 产物一致，session `mv7euirk-1qtw-4gtq2`。09:07:46 精确根证据 branchCount=3 / sideKnownCount=2；实际浮窗本会话为 sub+2。
2. 上轮原生 completed，结束于 09:06:56；新包加载到本轮用户消息之间只有数秒且原生已经已读，不计作完成未读和稳定性通过。
3. 本轮绑定 startedAt=1791940070080、匿名 Turn ref=b7de09962ab80ee606f9be51；独立本地只读探针在回复结束后续取原生快照与当前宿主日志，确认完成后持续约90秒，遇新轮即切断，观察进程于回复结束前重启计时，最长截止09:23:05。只保存有限状态/时间/计数，无正文、原始帧或凭据。
4. 界面后台采样因工具执行上下文限制不能持续，已停止该采样，没有取得结束后截图。现有界面仅证明运行时 sub+2；后续只报告实际获得的原生、Kernel相位、未读、ACK证据，不将它夸大为截图验收。
5. 已建立一次收尾自动化 automation-2，在本回复结束后回读固定旧窗口并停用自身；不启动子代理、不发测试消息、不改已读、不安装重载。待回读后补结论。

## 2026-10-14 固定上一轮结束验收结果

| 编号 | 核验项 | 结果与边界 |
| --- | --- | --- |
| V-25 | 轮次与宿主隔离 | 只使用 startedAt=1791940070080、Turn ref=b7de09962ab80ee606f9be51、session mv7euirk-1qtw-4gtq2 的旧窗口。Host/Renderer 与 09:04 交付一致；本次自动唤醒发生在旧观察结束以后，不作为旧轮反弹证据 |
| V-26 | 原生结束与未读 | 09:19:06.711–09:20:40.674 共 20 次样本，跨度 93.963 秒，均为 idle、canonical completed、history exhausted、unread=true；requests=0、overlays=0、Goal none。固定 Turn 未变，无新轮截断 |
| V-27 | 精确根成员与未读 | 根 ref 015b0cacfed040b7debd13d012a8bc79 于 09:19:06.538 记录 observationUnread=true/known=true；09:19:06.907 快照再次吻合。branchCount=3、sideKnownCount=2，窗口内未见回退或内部评审重新加入 |
| V-28 | 插件终态与接收链 | 09:19:07.026 发布 completed/unread，packageRevision=253；09:19:07.045 收到该包 applied ACK（记录耗时 17 ms）。至旧窗口结束未见该相位再次变化，后续包 ACK 持续 applied |
| V-29 | 残留结束瞬态 | 09:19:06.491 的 packageRevision=251 先发布 running→stopped/read；09:19:06.538 收到根 unread 后包 252 发布并获 applied；09:19:07.026 才 stopped→completed/unread。stopped 持续 535 ms，因此不能宣称整个结束过程识别无误；不是 completed 后再次回退 |
| V-30 | 证据边界 | Kernel 相位 h:4b644fca1b82d8df 与本会话的对应仍是新轮时间和同步发布链关联推断；精确根未读/成员及原生固定 Turn 独立佐证。没有结束后截图，ACK 只证明渲染端接收应用，不能声明直接看到终态界面。探针错误及窗口日志 error 均为 0，不等于所有静默 RPC 都成功 |
| V-31 | 观察退出与收尾 | 探针结果 completed-window-captured，09:20:40.681 结束并解除订阅，进程已退出；automation-2 已更新且回读为 PAUSED。本次 CUA 看到浮窗已收起，未见临时搜索控件，未再展开或改变当前界面 |

1. 结论：新包已消除本轮长期停留 stopped 的现象；固定窗口内最终完成、未读、成员数量和后续稳定性有实际运行证据。结束瞬间短暂 stopped 仍需定位，故整体任务保留未完成；不把约 94 秒观察扩大为长期或所有场景保证。
2. 下一步针对已捕获的 running→stopped→completed 顺序，定位主轮终态来源到齐前的中间发布原因，补定向回归后再修；当前证据不足以把原因归为旧内部评审再次纳入。禁止用延迟、TTL 或强制完成掩盖中间状态。
3. 证据来自 `/private/tmp/eypc-own-end-1791940070080/summary.json` 的有限元数据及当前日志 `runtime-1791940064538-1.jsonl`：根未读行 3290/3296、相位行 3284/3300、ACK 行 3295/3306。原始会话正文、IPC 帧及凭据未保存。本次仅回读、停用自动化与更新两份记录，未改实现、安装重载、改已读、开启子代理或发送测试消息；没有重复自动测试，也未提交推送。

## 2026-10-14 09:54 结束事件链修复与新产物

### 来源与完整事件链

1. 本轮只读交叉检查取得同一当前 Turn 的冲突：独立 App Server `thread/turns/list` 返回 interrupted、秒精度起点；已连接 Desktop owner 同一匿名 Turn ref 返回 inProgress/active、毫秒精度起点（相差 526 ms）。两者均为当时实读，不保存正文、帧或原始 ID。这证明独立读取器可把其他进程尚未结束的轮次重建成 interrupted；09:19 的原始 IPC payload 未捕获，因此历史 535 ms 内具体 wire 顺序仍是日志与源码复现支持的解释，不能称已逐帧取证。
2. 原路径在 `publishShadow` 收到 runtime idle 后先 `emitParentActivity`，再安排 bounded latest-Turn 核验。主分支 fallback 取 connector 的 interrupted，却优先采用当前 canonical 起点，混成了不同来源的状态/轮次。主线程又没有使用 owner canonical 终态及时收口，因而这个独立 interrupted 暂时进入私有分支、Evidence Adapter 与 Kernel。
3. 已观察日志对应：09:19:06.491 包 251 running→stopped；06.538 原生根 unread=true，包 252 仍 stopped 并于 06.566 获 ACK；07.026 包 253 completed/unread，07.045 获 ACK。Kernel 正确聚合了错误上游终态，Renderer 也接收了中间包；本次不修改通用 Kernel 或 Renderer 相位规则。
4. 新路径先校验同一主 owner 的完整最新 canonical 终态，再发布。必须有有效 owner/revision、idle、exhausted 最新历史、确切 Turn 身份/起点、无待答请求/未确认提交/更新 overlay 或活动；真实 interrupted/failed 仍立即成立。接受后仅取消该主线程的旧查询并按已有规则刷新 Goal，不取消其他成员查询。
5. 独立 targeted read、库存投影及已有 targeted 私有终态均拒绝与当前 owner 冲突的状态；库存拒绝不删除根成员，不丢真实 `turn-completed`，冲突缓存被清除。fallback 的状态、起点和 ID 始终取自同一候选；Side 缺 ID 不借主 ID。主 idle 只与主分支 AppServer 序列比较，不清除其他成员独立活跃证据。没有增加延迟、TTL、轮询或原生状态写入。

### 验证与交付

| 编号 | 验收点 | 结果 |
| --- | --- | --- |
| V-32 | 正常结束每次发布均无 stopped | idle 先到（含 unread 插入）、canonical 先到、同批三种顺序通过；RPC 保持未返回、不推进等待时间时已 completed/unread，迟到独立结果也不反弹。最初 5 项在修复前全部失败 |
| V-33 | 真实活动和终态保护 | interrupted/failed、输入/审批、T2 新轮、普通 Side 运行/等待/失败、活跃 Goal、未完整历史边界通过；新 Bridge 17 项及来源纯判断 10 项共 27/27 |
| V-34 | 独立复核缺口 | 库存同精度 interrupted 绕过、Side 缺 ID、AppServer-only 子运行三项均先 RED 后 GREEN；最终限定只读复核未发现新的具体缺陷 |
| V-35 | 相关回归 | Bridge + async 模块 303/306；Kernel 138/138、Topology 6/6、inventory fields 3/3、lifecycle canary 16/16、native unread 11/11，合计 477/480。3 项仍为既有 Plan 执行断言、Orca execFile allowlist、initialize retry execFile 零调用预期；未放宽、跳过或修改既有业务断言 |
| V-36 | 独立门禁与构建 | source 与 packaged 各 10 核心 + 58 生命周期 + 23 原生/成员检查通过；含新增来源仲裁坏实现 canary。原生门禁随纯判断抽取加载真实 owner，原 Side epoch 坏实现仍被拒绝。合同、semantic typecheck、Vite/uTools 构建、96 对镜像与入口预算通过 |
| V-37 | 新产物身份 | EyPc V7 / package 0.1.0；builtAt 2026/10/14 09:54:18（2026-10-14T01:54:18.485Z）；host-310f2ab85e7cbb9723c2；renderer-7b0d8a6011b186a733f3；`dist/plugin.json` |
| V-38 | 安装后真实验收 | 已由用户安装；11:23:56 新宿主身份精确匹配，11:30:30 固定轮次直接 running→completed，未读包57获 applied，随后20次样本保持90.929秒。现场结果与无结束截图、匿名相位关联边界见 V-39–V-45 |

纯判断留在 `desktop-activity-resolution.cjs`；入口由本次开始的 14707 缩至 14698 行，279 个 Codex 函数、162 个可变绑定不增加。文档真值和源锚点随最终源重新生成并校验。09:54 交付时测试报告仅在本机临时目录，尚未安装/重载、提交/推送或修改原生已读；当时 automation-2 保持 PAUSED。后续安装、结束观察与最终停用结果见下文，不再保留待安装或待结束门槛。

## 2026-10-14 新包真实结束观察布置

1. 用户已确认安装。11:23:56.148 的 host-loaded 实际/期望均为 host-310f2ab85e7cbb9723c2 与 renderer-7b0d8a6011b186a733f3；session mv7jpnne-1i8i-7l7s3。精确根日志为 3 成员 / 2 Side，当前浮窗直接看到本会话「进行中 / sub+2」，仅作为开始基线。
2. 固定当前轮次 startedAt=1791948244073、Turn ref=c874d96c4a506f1d086be440、ownerRef=f045f2d2b7734d74098a1c94。原生当前 active/inProgress、exhausted、unread=false、requests=0、overlays=0、Goal none。11:24:04.124 唯一 completed→running 与起点相差 51 ms、同批节点数 3，对应匿名相位 h:a7aa73aaf8e57662；仍是时间/发布链关联，不冒充直接 ID 映射。
3. 独立本地只读观察进程已绑定该轮和宿主，结果在 `/private/tmp/eypc-own-end-1791948244073/summary.json`。记录有限 runtime/canonical/unread 边沿、5秒一次的完整终态摘要，以及该宿主各日志分片中的根终态、未读、相位及 ACK；不保存正文或原始帧。原生完成/idle/完整历史且无请求和 overlay 后持续约90秒，遇新轮、owner变化或终态回退即止，最长7分钟。
4. 复用 automation-2 进行约5分钟后的一次回读，然后停用；自动唤醒造成的新运行不能当成旧轮反弹。不启动子代理，不操作原生目标、已读或状态，不安装重载。当前动态面板曾临时展开，未搜索、打开会话或标已读；没有结束后截图，日志 ACK 不替代目视证据。
5. 本节仅保留观察布置。该固定窗口已完成，结果在下一节；11:32 观察退出、11:33 一次自动化停用，不再等待结束或继续循环观察。

## 2026-10-14 11:33 新包固定结束窗口验收结果

1. 只回读 startedAt=1791948244073、Turn ref=c874d96c4a506f1d086be440、ownerRef=f045f2d2b7734d74098a1c94 的旧轮。新宿主 session mv7jpnne-1i8i-7l7s3 与 Host/Renderer 310f2ab85e7cbb9723c2 / 7b0d8a6011b186a733f3 已实际匹配；11:33 自动唤醒晚于观察结束，不把新轮运行纳入旧轮反弹判断。

| 编号 | 核验项 | 实际结果 |
| --- | --- | --- |
| V-39 | 原生结束边沿 | 观察进程于 11:30:30.534 收到 runtime idle（rev 10383），30.546 收到当前 canonical completed（10384），30.558 收到 unread=true（10385）；未见 interrupted/failed 边沿 |
| V-40 | 主 owner 终态与插件相位 | 精确根日志 30.576 在 canonical 尚未到齐时拒绝终态，30.613 接纳 owner-canonical-terminal/completed；相位日志 30.638 由 running 直接 completed，package 56。固定窗口仅有 running→completed，无 stopped 中间状态 |
| V-41 | 未读与渲染接收 | 精确根 30.689 记录 observationUnread=true/known=true；package 57 于30.696发送、30.711获 applied ACK，记录发送至ACK耗时15ms；后续58也获 applied。完成与未读分两次证据到达，未出现 stopped；这些时间不等于目视渲染端到端耗时 |
| V-42 | 完成后稳定性 | 11:30:31.047–11:32:01.976 共20次快照，跨度90.929秒，同 owner/Turn、idle/completed/exhausted/unread=true、requests=0、overlays=0、Goal none；窗口内没有新轮、owner变化或原生终态回退，插件相位日志也无完成后反弹 |
| V-43 | 成员与精确根未读 | 根ref015b0cacfed040b7debd13d012a8bc79始终3成员/2 Side；30.689和31.378两次未读证据一致，没有内部评审重新纳入或成员数量变化 |
| V-44 | 证据边界 | 相位h:a7aa73aaf8e57662与本会话仍通过开始时51ms内唯一running切换、同批3成员及结束时精确根终态/未读链关联，非直接ID映射。没有结束后截图；ACK只证明接收应用。探针errors=0和窗口error日志=0不代表全部静默RPC都成功；不把90.929秒外推为永久稳定 |
| V-45 | 一次观察收尾 | summary状态completed-window-captured，11:32:01.980完成并解除订阅，PID91600已退出；automation-2已更新并回读PAUSED。CUA看到浮窗已自行收起，没有继续展开或改变用户界面。未开子代理、发消息、打开原生目标、改已读/状态或安装重载 |

2. 本次结论：本会话在新包中的真实结束、完成未读与固定窗口稳定性通过，旧包535ms stopped过渡未复现。依据是结束事件链和随后连续样本，不是当前运行态或自动测试推断。
3. 证据为 `/private/tmp/eypc-own-end-1791948244073/summary.json` 的有限元数据与 `runtime-1791948235674-1.jsonl`：主终态行1375/1381、相位1382、根未读1389/1402、发送1392、ACK1395/1400。原生边沿是独立观察进程接收时刻，宿主行是日志记录时刻；不将两者差值宣传成端到端时延。仅回填本任务卡与项目状态，未改源码或重跑测试，未提交推送。无后续循环观察。

## 2026-10-14 文档收口与提交范围

本次提交范围保留 Side 自身终态/Goal/原子清退、精确内部评审资格排除和 535 ms 来源仲裁三段修复及实际验收记录。前序 `1425-codex-side-phase/lifecycle-verify.md`、独立夹具错误记忆及索引、对应三项生命周期补测从本次提交快照剥离；工作树中的前序改动保留。上文实际运行的 58 项生命周期门禁和 477/480 相关回归是历史验证事实，不改写为新计数。独立导出的 HEAD 加本次选定改动快照已验证：源码 `preload` 与镜像 `public` 两侧生命周期55/55、原生未读23/23均通过，Companion生命周期/原生未读脚本测试26/26通过，Bridge中主结束、Side终态、内部评审、冷恢复与轮次边界筛选51/51通过，合计77项测试通过；入口预算14698行/279个函数/162个可变绑定通过。该快照排除前序1425的三项门禁与两项Bridge用例，历史完整工作树结果仍按上文保留。本段只确认选定快照验证，不提前宣称提交或推送完成。
