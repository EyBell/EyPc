# Codex 已读状态实时联动修复

2026-11-06 续修：[整合修复与验收账](../../261106/task-state-recovery/task-card.md)。修正 recovery 结束/超时/clear 后同 owner 较旧 revision 快照误放行；三个失败夹具修后通过，同 revision read 变化仍接纳。静态 owner 哈希随此已复现缺陷显式更新；不表示真实宿主多任务已读因果已证明。

状态：Windows 安全查询参数及 PowerShell 枚举错误已修正，完整脚本和真实工厂在 Windows SSH 上下文通过，17:23:11 候选已生成；目标宿主连接、精确绑定和未读传播仍待手测。macOS 第二版实际加载与指定任务的已读传播已核，完整“已完成未读→已完成”起点未捕获，不能记为全场景验收；此前第一版虽已运行但实测无效的历史保留。

## 2026-11-10 Windows 安全查询参数纠正

- 用户随后回传目标 Windows 实测：管道存在且只读安全句柄可打开，GetSecurityInfo 对象类型 1 返回 87，类型 6 返回 0，owner 匹配且 DACL 存在；此前候选使用类型 1，是本轮实现缺陷。旧候选的静态/编译核对不能证明此参数有效，旧 Windows 桥接不因此视为通过。
- 本次改为 SE_KERNEL_OBJECT（6），保留 READ_CONTROL、owner/写权限保护、有界异步检查及资源释放。额外将查询参数错误、其它查询失败、启动失败、进程失败、超时和异常输出分为固定原因；不落原始输出、SID、账号或 context。
- SSH 实测独立复核了类型 1 → 87、类型 6 → 0，ownerMatchesCurrentUser 与 daclPresent 均为 true。但只改类型后完整脚本仍失败；阶段探针定位到 ACE 标志位的枚举 `-band` 触发 InvalidCastException。两侧显式转为整数，原权限判断不变后，17:20:57（北京时间）完整脚本返回 secure，耗时 1233ms。17:17:27 中间候选因仍含该类型转换错误，不作为交付；最终完整源脚本回读结果与候选身份另记。
- `BusinessChangeReview` / `VerificationImpactTrace` 沿用下节并追加用户当前实测：允许修正对象类型和诊断分类，不放宽所有者/ACL 或身份选桶。选定 JS 语法、镜像/包字节、产物身份、独立编译及授权 SSH 的内存只读安全探针；没有自动化行为测试，真实桥连接与未读传播仍需独立观察。
- 最终本地完整脚本于 17:22:28 在 Windows SSH 上下文原样返回 secure（1130ms），同一 CJS 原工厂与真实 execFile 返回 secure=true / reason=secure（414ms），保留 5000ms 超时。候选为 EyPc V7 / host-276406b71202a45e4674 / renderer-813f05d5c341803fcad0 / 2026-11-10 17:23:11 北京时间；未安装或连接桌面桥，不能外推未读联动通过。
- 同轮拖拽展开滚动条修复、SSH 入口、[最终候选及当前检查点](../../260915/float-edge-rail/windows-diagnostics-review.md#实现现场结果与当前候选)统一在窗口续查记录；下节 16:46:58 ZIP 保留为故障历史。

## 2026-11-10 Windows 未读通道续修

- 现场回传：北京时间 16:15—16:17，16:10:35 候选已加载；任务库存 6 条、运行切换与 Float applied 已确认。注册表缺省置顶字段阻断已解除，桌面未读仍为 `binding-unavailable / bindingKnown=false / readBridgeState=failed`。本轮不把接收 ACK 当作视觉验收，不覆盖原故障快照。
- Windows 对应 Codex 随后回传：当前原生状态存在两个身份桶。这是现场转述，Mac 本轮未独立读取 Windows 文件；双身份验收必须先由受信原生通道取得当前身份与执行宿主 context，再精确选桶并重放。不能选首桶、合并桶或把读取失败改成已读。最终手测须覆盖产生未读 → 在原生 Codex 打开并标记已读 → 插件清除，同时验证账号隔离及既有任务状态连续性。
- 用户已在明确上述 Windows 桌面通道与精确绑定缺口后授权继续修复。实现范围为补齐本地原生通道与可验证绑定来源，保留已修复的注册表兼容逻辑。
- `BusinessChangeReview`：基线为[当前产品要求](../../PRODUCT_REQUIREMENTS.md#L300)、[原生身份隔离记录](../../../knowledge/error-memory/codex-native-unread-schema-protocol-drift.md#L1)及本节现场回传。允许变化仅为 Windows 原生桌面连接与失败诊断；既有 macOS 端点保护、单身份/本地执行宿主选桶、unknown 语义、通知版本校验和绑定恢复保持。禁止从目录名、未读集合或跨身份并集猜测当前账号；不读取认证资料，不写原生状态。
- 消费者为 Desktop IPC → 原生通知/快照与持久未读 → Codex evidence → Kernel → Main/Float 分组、角标及原有归档通知。运行/完成、等待、Goal、成员与其它 Provider 的归约规则不变。没有测试预期变更；Windows 原生端点与信任依据在程序资源核实后才进入实现。
- `VerificationImpactTrace`：涉及端点、安全判定、连接/重连、绑定与通知接线、受管理镜像、产物身份及帮助。选择语法、静态差异/私有同步 IPC 搜索、镜像、类型、合同与独立 Vite 构建/runtime prepare；按用户既有偏好不编写或运行自动化测试，默认 build 内的语义测试不执行。真实 Windows 连接、未读到已读及任务结束回落由用户加载候选后手测。
- 分工：`planned_child_count=1`；原生子 agent 负责程序资源协议调查，核实后承接独占模块实现；Root 负责已有脏主入口的接线、整合、文档与最终静态/构建核对。请求/配置均继承当前模型，实际模型与用量未观测。派发 Hook 为 fail-open，未确认任务级预检关联，不将其提示视为派发治理已通过。
- 原生依据：本机 Codex 程序包 26.1103.60933 / build 25894、bundle com.openai.codex。ASAR 内端点成员 early-bootstrap-824-8c6252e0131a7fe3.js 的第 34 行、模块 92272、字符偏移 207562，明确 Windows 使用固定本地命名管道；成员 SHA-256 为 `135ba428856dcfa52b53be2cc714bef8ed4fe8cefdad6011e61c89f27069b36b`。同模块证明 4 字节小端长度 + UTF-8 JSON、256 MiB 上限，与既有读取器相同。本轮只读程序代码，没有执行原生认证调用。
- 原生握手只返回 clientId，不提供账号/执行宿主上下文；v3 read-state 通知在原生捕获当前身份与宿主后携带 context。端点名称和握手 UUID 均不单独证明可信来源。Windows 本地所有者/ACL 判定是 EyPc 新增的连接保护，不将其写成 Codex 原生认证机制。
- 实现：[原生端点与验证入口](../../../../preload/codex/desktop-ipc-endpoint.cjs#L1)、[Windows 所有者与写权限检查](../../../../preload/codex/desktop-ipc-windows-security.cjs#L1)、[独立连接生命周期](../../../../preload/codex/desktop-ipc-connection.cjs#L1)。安全检查使用固定、异步且 5 秒有界的本地 PowerShell，输出固定原因；不记录 SID、账号、路径、命令输出或上下文正文。拒绝访问、所有者不符、外部可写 ACL、管道忙和能力缺失均不放行。
- 已有 v3 通知接线继续负责精确绑定 → 重读持久未读 → 重新发布。Windows 断连撤回旧绑定、持久基线及旧桌面 read 字段，避免重连后沿用另一身份；macOS 原有重置行为保持。尚未收到合法 v3 context 时，两身份桶继续 unavailable，不能把连接成功写成绑定已恢复。
- 当前状态：源码修复与完整候选已生成；尚无目标 Windows 新运行证据。新增连接代码已从主入口拆出；入口缩减后同步收紧预算，没有放宽行数门槛。既有自动测试结果不外推到本轮新代码。

### 静态核对与候选

- 语法、类型、合同结构、Vite 生产编译、runtime prepare、需求真值/登记及来源锚点校验通过。主入口为 14782 行 / 278 个 Codex 函数 / 160 个可变绑定，较本轮基线分别减少 15 行和 1 个函数，预算同步收紧。
- 102 项受管理资源在 source/public/dist 三侧逐字节一致；13 个身份字段与当前源码计算值一致，Main/Float 编译入口内嵌同一 Host/Renderer。此为静态包完整性，不是行为测试或 Windows 运行验收。
- 增量静态搜索没有新增私有同步宿主 IPC、认证文件/Token 读取或原生状态文件写入。系统用户 SID 与 ACL 只用于本地连接保护，不作为 Codex 账号绑定来源；安全元数据使用只读句柄和 GetSecurityInfo，句柄与描述符均在 finally 释放。
- 最终产物：EyPc V7 / `host-fac102c28780051c814f` / `renderer-a28e5b966d5d77d75547` / 北京时间 `2026-11-10 16:46:58`（UTC `2026-11-10T08:46:58.741Z`），状态 `artifact-ready`。第一次 16:44:13 编译后，将安全元数据读取改为句柄接口，再重新编译；首版身份不作交付。候选 ZIP 文件名的 164641 是打包标签，交付时间以包内 runtime identity 为准；共享检出和 ZIP 的身份及时间已回读一致。
- [完整 dist 入口](../../../../dist/plugin.json#L1)与[Windows 候选 ZIP](../../../../output/EyPc-Windows-unread-20261110-164641.zip)已生成；ZIP SHA-256 为 `db5e8a64fbc7fa8395d0197ad3a70ca7032b0ba3c39f3b3a956455218f481efc`。ZIP 内为完整 dist，包含本次构建时检出的其它既有改动。原 16:10:35 产物已保留为[修复前备份](../../../../output/windows-unread-20261110-164402/previous-dist/plugin.json#L1)。
- 候选清单当前为 1.2.6，与 Windows 回传的 1.2.7 不同；本轮没有修改清单版本。加载核对以实际 Host、Renderer、构建时间和当前日志为依据，不能只比较清单版本。
- 按用户既有偏好，没有编写或运行自动化测试，也未执行默认 build 内的语义 canary。PowerShell/C# 片段尚未在 Windows 解析或执行；JS 语法、编译和字节一致性不能证明 Windows ACL API、管道权限或 v3 通知及时性。未安装/重载候选。
- 收尾发现原静态未读通路基线仍锁定旧 owner 摘要。本次 owner 的新增变化仅为 Windows 传输重置时撤回绑定及旧 read 证据；经差异审查，在同步架构与本记录后更新摘要，并把 Windows 重置接线加为必备项。保留原摘要核验、镜像核验及其余接线项。更新后未读静态基线与镜像检查通过（100 对已提交镜像及 2 对待提交新模块）；当前 102 项 source/public/dist/ZIP 字节和身份元数据一致。该静态检查不作为行为验收。

### Windows 手动验收入口

1. 解压候选，以 dist 的插件清单重新打包或接入，回读实际/预期 Host、Renderer 与上述产物一致。
2. 在调试日志查看 desktop-bridge-state：安全检查后应进入 connected。失败时保留固定 reason；owner-mismatch、permissions-untrusted、access-denied 或 security-unavailable 不能绕过。
3. 等待真实任务完成产生原生未读，在 Codex 原生界面打开并确认已读。核对本地 v3 desktop-read-notification received → desktop-read-binding recovered/rebound → desktop-unread-read ok 且 bindingKnown=true → Kernel 发布及 Float applied。握手只有 clientId，不能单独作为绑定恢复证据。
4. 双身份桶仍只读取当前合法 context 对应桶；没有 context 时保持 unknown。检查断连出现绑定 invalidated，重连须重新收到有效 context；不通过改写原生文件构造已读。
5. 分开观察本轮运行到完成回落，以及 Main/Float 实际绘制。日志/ACK、运行状态和未读同步分别验收；未覆盖的场景继续保留未验。

## 目标与现状

- 续修现场：已加载 host-e814aa45c3101f1183bd / renderer-1cf6682d9a26531497cb；本会话留存日志有 44 次定向 refollow、28 次恢复快照被 `newer-stream-revision` 拦截，没有接纳的 v3 已读通知。该旧诊断把“revision 较小”和“revision 相同但 read 值不同”合在一起，不能据此断言原生计数器重置。
- 恢复原有行为：Codex 原生点开已完成对话并确认已读后，EyPc 同一任务从已完成未读转为已完成。
- 现场核查已确认：原生先已读，插件后于完整库存恢复时补回；恢复包到浮窗 applied ACK 为 27ms。未记录点击时刻，不能把完成至补回的时长当作点击延迟。
- 无实时绑定且原生迁移已清理时，持久未读读取拒绝；现有实现缺少绑定恢复后的立即重放和通知拒收原因。

## BusinessChangeReview

- 基线：[当前产品要求](../../PRODUCT_REQUIREMENTS.md#L268)、[原生身份隔离记录](../../../knowledge/error-memory/codex-native-unread-schema-protocol-drift.md#L1)。
- 允许变化：恢复合法 v3 绑定后立即重读；绑定暂不可用时，由原生未读文件变化触发定向原生快照恢复；记录有限通知接收、拒收与恢复原因。
- 保留：不跨身份或远端桶合并，不把 unknown 当已读，不把打开分发当已读，不改原生状态；phase、成员聚合、等待、Goal、归档和其它来源语义不变。
- 消费者：原生通知/既有文件 watcher → Codex evidence → Kernel → Main/Float 分组、角标与任务入口。
- 预期变更：没有产品语义或测试 oracle 变更；只恢复已有未读契约。
- 待核：真实宿主重载及点击后的端到端延迟；未接纳的通知不能被写成已读证据。

## VerificationImpactTrace

- 选择：原生未读解析、v1/v2/v3 通知校验、身份/宿主隔离、同值抑制、绑定恢复、旧未读与新事件竞态、公开包与浮窗传播。
- 排除：其它 provider、导航优先级、配额、外观、MQTT、真实任务写操作。
- 验证：语法、镜像、类型与独立产物构建；按用户既有偏好不编写或运行自动化测试。构建内含语义测试的入口须拆开，不借构建绕过该偏好。
- 真实宿主：用户手动加载后验收，构建不能替代。

## 分工与执行记录

- 模式：native-agents；预算 M；一个 Grok 子 agent。
- 子 agent：只修改未读证据模块及 public 镜像，增加通知分类与固定失败原因；请求模型 group/grok，运行身份与结果由宿主回执核对。
- 主控：身份恢复方案、接线、并发边界、文档、构建和最终验收；不与子 agent 同时修改同一文件。
- 第一单通知分类补丁已审：保留 parser 与 `cleared` 保护，语法与镜像核对通过；未运行行为测试。
- 第二单（工作单版本 2）：同一 Grok 子 agent 实现有界的绑定恢复、文件变化指纹去重和原生快照补回；主控负责接线。
- 模型证据：宿主请求覆盖为 `group/grok`；当前返回不提供实际模型运行事件，observed model 与 usage 均 unavailable，不依据 agent 自述认定实际模型。
- 第二单已审并接纳；主控补齐接线和短期版本门禁：新通知或补丁使旧恢复失效，仍保留 5 秒请求标记以拒绝迟到旧版本快照；无版本旧协议不能覆盖更新的明确未读。
- 诊断路径：通知 received/rejected（固定 reason）、绑定 recovered/rebound、恢复 refollowed/dispatch-failed、快照 observed/superseded。只有 Kernel 与 Float 原有 accepted/applied 证据可证明最终应用，不把恢复器的 observed 当作最终验收。
- 续修工作单 3：同一 Grok 子 agent 的工具通道不可用，未取得安装包证据、未编辑文件；主控接回只读取证。工作单 4 将已核源码与最小代码片段交原 agent 提供补丁建议，由主控审阅执行；没有静默切换子 agent 模型。
- 工作单 4 已返回两段未执行的建议，主控接纳并落地：移除同 revision/read 冲突门禁；pending 期间把精确 read patch 保存在独立 live 对象。主控另补同任务单飞、合并尾随重查及只保留当前 read 字段的迟到回复处理；原 agent 已关闭。模型仍仅有 requested 覆盖回执，observed model/usage unavailable。

## 本轮原生源码核查

- 对象：本机 ChatGPT.app（Codex）26.1029.61003 / 24614，app.asar 内 `.vite/build/early-bootstrap-45-628adb74a9c47df1.js`；只读程序代码，不读认证或会话正文。
- `applySavedConversationReadState` 更新 `hasUnreadTurn` 时显式设置 `broadcastPatchesToFollowers: false`。因此已读变化不保证推进 stream revision，不能用 stream revision 相同判定 read 值必须相同。
- `handleThreadStreamFollowingChanged` 对已经存在的 follower 再次 `following=true` 时，直接以当前 revision 重发 `sendConversationSnapshot`。原生 snapshot 消费分支重建基线，只有 patches 分支要求 baseRevision 对齐；本轮没有证据证明 follow 会归零。
- 确认的插件缺陷：恢复器拒收“同 revision、read 改变”的快照，与上述原生行为冲突。它足以阻断当前恢复路径；28 条旧日志没有分别记录实际版本和 read 值，不能把全部记录逐条归为这一分支。
- 历史归因边界：已证明当前插件判断不兼容本机原生语义；尚无升级前安装包/差异证据，不能断言是哪次 Codex 升级引入。

## 实现入口

- [通知校验](../../../../preload/codex/desktop-unread-evidence.cjs#L114)：保留 v1/v2 兼容、本地 v3 context 与未知版本拒绝。
- [绑定恢复](../../../../preload/codex/desktop-unread-evidence.cjs#L368)：首次绑定清除旧持久基线，已有绑定更换时撤回旧身份的未读缓存；排除 external/machine。
- [文件变化恢复](../../../../preload/codex/desktop-unread-evidence.cjs#L391)：指纹只用于唤醒；原生快照才提供 read 证据；同一任务单飞，后续源边缘合并为回包后一次重查。
- [新 read 保护](../../../../preload/codex/desktop-unread-evidence.cjs#L425)：精确补丁保存在独立 live 证据中；后续旧完整快照不撤销它。
- [迟到快照保护](../../../../preload/codex/desktop-unread-evidence.cjs#L443)：同 owner 的较小 revision 仍拒收，同 revision/read 改变允许恢复；期间有新事件/源边缘则保留当前 read 字段，诊断区分原因与数值。
- [Host 接线](../../../../preload/index.js#L6632)：未知任务的有效 context 也立即恢复并重放；原生状态只读。
- [用户说明](../../../../src/help/guides/codex.md#L100)：已读联动入口已补充；完整运行时验收仍以下节为准。

## 上一版静态结果（未通过实机）

- 3 对 source/public 文件语法与字节镜像通过；增量 diff 格式检查通过。
- 类型、合同结构、入口预算通过；入口为 14754 行 / 279 个 Codex 函数 / 162 个模块可变绑定，新增 22 行只做桥接接线，恢复状态机留在原证据 owner。
- 增量静态搜索未发现私有同步 IPC、认证/Token 读取或原生文件写入；该项只证明本轮增量，不外推全项目。
- 独立候选目录完成 Vite 生产构建与 runtime prepare；97 个受管理资源与当前源码/镜像一致，Main/Float 编译包身份一致；需求真值已同步。
- 已生成 asar，包内 3 个本轮代码文件与当前源码逐字节一致；大小 6971740 字节，SHA-256 为 `51b2ad40cce59825a4d31ecb3d0123486f02f1a0a207e6aa5beba9772721c9bc`。原生模块仍随候选目录/asar.unpacked 配套，不把单独 asar 当作完整安装回执。
- 候选身份：EyPc V7 / host-e814aa45c3101f1183bd / renderer-1cf6682d9a26531497cb / 2026-11-05 09:42:17（北京时间）。检出 public 运行身份同步到该候选；检出 dist 与已安装 asar 保留旧产物，加载时以本候选为准。
- 未编写或运行自动化行为测试、构建内语义 canary、完整 uTools 验证或真实宿主交互；没有把静态与编译结果记作实时联动已验收。
- 候选包含构建时此检出的其它未提交源码；本任务没有提交或推送。

## 第二版产物与核对

- 身份：EyPc V7 / host-c36e730c7d356298f6e4 / renderer-d5d0bb8df1cb5430e783 / 2026-11-05 15:06:35（北京时间）。生成身份已在与当前源码计算值一致后同步到 public，未回写旧构建时间。
- 本地完整插件入口（output 产物未入 Git）；同目录上层提供 `eypc-unread-v2.asar` 及配套 `eypc-unread-v2.asar.unpacked`，原生文件必须配套保留。检出的原 dist 未覆盖，本轮未再次替换安装包或结束 uTools。
- 两份未读模块、主入口及 shadow 的语法检查通过；96 对已提交镜像与 1 对未提交新模块一致，入口预算仍为 14754 / 279 / 162。
- 隔离目录的 vue-tsc、合同 check、独立 Vite build、runtime prepare 通过；已拆开含语义 canary 的默认 build 路线，没有编写或运行行为测试。
- 97 项受管理资源在当前源码、public、独立 dist 和 asar 四侧逐字节一致；18 项解包原生文件与 dist 相同；Main/Float 编译入口均包含上述 Host/Renderer 身份。Action 子窗只作资产完整性核对，不声称其入口内嵌了该身份。
- asar 为 6974235 字节，SHA-256 `f8d57862f6ff196ea316e3624a332287964a57616680a9fe6b257b9490184647`；复制到持久候选目录后再次核对该摘要。
- 需求真值同步与登记静态验证通过；本轮没有改需求语义。代码链接审计通过，候选仍包含构建时此检出的其它未提交源码；未提交或推送。
- 构建交付时，实际加载与应用 ACK 尚未取得；下面的现场核查已补充第二版运行与 Float applied 证据。恢复期间较新 unread、连续源边缘尾随重查及指定任务的完整起点仍待覆盖。

## 第二版现场核查（2026-11-05）

- 指定对象：原截图的“261028-SRM-分润总体统筹”。当前“261105-EP-修复未读状态联动”是另一条正在运行的对话，两者没有混作同一任务。
- 加载身份：实时诊断进程 96387 持有当前安装包；包内 EyPc V7 / host-c36e730c7d356298f6e4 / renderer-d5d0bb8df1cb5430e783，用户重打包时间 15:13:00。97 项受管理代码与第二版候选逐字节一致，Main/Float 编译入口均包含这两个指纹；实际执行日志也出现第二版独有的同 revision 接纳字段。
- 当前安装包摘要为 `0217a536f4be967cbdd5bc0d0ffdfe6271df022359cfb865eb35761354225eb0`，大小 7137205 字节；与原候选包摘要不同，已通过代码与身份核对确认其内容，不以旧安装路径作判断。
- 诊断源为当前 session `mw37lfuh-22df-21x8k`；只摘取状态、时间、版本和匿名引用，未保存原始日志、会话正文或身份数据。
- 起点：原生列表中指定任务 `isUnread=false`，状态 notLoaded；15:13:36.708 的插件证据为 unknown，而非一条已捕获的 unread=true。因此本次不能声称复现了指定任务“已完成未读→已完成”的完整转换。
- 操作：15:16:23 通过 Codex 的原生聊天导航打开指定任务。未通过 EyPc open 流程制造已读，未手工切换原生 read/unread，未发送消息或启动任务执行。
- 指定任务结果：15:16:24.976 记录 `desktop-live` 的明确 read，主分支 snapshot false，Side 未读为 0；15:16:24.985 Kernel 发布 revision 77；15:16:24.998 Float 对 77 回 applied。证据到 ACK 为 22ms，发送到 ACK 的记录为 16ms；它们均不是用户点击到已读变化的端到端延迟。
- 15:16:36.072 库存复核仍为 read，原生列表仍 `isUnread=false / idle`；没有发现指定任务随后回到未读的证据。
- 关键修复现场命中：15:15:28.840 和 15:16:53.619，同 revision 13030、13151 的读态改变分别被恢复器 observed 接纳，随后 revision 63、84 都取得 Float applied；第二次全局未读计数由 1 变 0。其相邻根证据属于另一任务，不能替代指定对象的完整转换验收。
- 当前 session 未出现旧 `newer-stream-revision` 误拒；上述两条走定向快照恢复，没有收到 v3 read 通知或 binding 恢复事件，不能把恢复成功写成 v3 通知已修复并实测。
- 界面核查没有定位到 EyPc 的可见任务行，因此本轮显示应用以 Float applied 合同回执为据，不声称取得了浮窗行截图。
- 结论：第二版运行和关键同 revision 恢复路径已实证，指定任务的明确已读已被插件接纳并发布到浮窗；指定对象的完整未读起点、较新未读竞态及尾随重查行为仍待自然事件或用户指定的后续验证。

## 验收与待测

- 已完成实现/静态审查，行为待手测：v3 有效绑定恢复立即重放；未知任务 context 也能恢复。
- 已取得定向快照恢复及同 revision/read 改变接纳的现场证据；同指纹去重与连续源边缘合并仍只有静态审查。
- 已完成实现/静态审查，行为待手测：较新 unread 不被旧恢复快照抹掉；Side 未读继续按成员聚合。
- 增量诊断已审且已抽样：实际加载、恢复 observed、指定根 read、Kernel 发布和 Float applied 可定位；有效 v3 binding 恢复尚未命中。
- 待用户手测：点开已完成未读对话后，Main 与 Float 同时转已完成，后续新完成可再次未读。
- 无法取得有效绑定或原生 owner 快照时继续保留 unknown/旧证据并记诊断；文件不存在/损坏不会猜测为已读。

## 固定通路与提交范围

- 用户确认可以并授权提交推送，同时要求固定实现通路。既有现场验收限度保留，不将口头接受改写为未观测场景通过。
- [架构固定入口](../../../knowledge/ARCHITECTURE.md#codex-已读联动固定通路)声明唯一 owner 与不可回退约束；[静态基线门禁](../../../../scripts/check-codex-unread-route.mjs#L1)已纳入镜像校验，锁定证据 owner 内容及关键接线。更新必须附原因、影响与对应验证，显式更新基线；未新增或运行自动化行为测试。
- 本次只提交未读同步代码、配套镜像、静态保护及本任务文档段落；外观、导航、Cursor、冻结诊断等并发改动与混合工作树生成身份保留未提交。
