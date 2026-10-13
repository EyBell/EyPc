# 核心流程规则与测试失守审计

## 结论与证据

现有 CodeNote Engineering BusinessChangeReview 与 Testing §2.3 已明确要求区分允许变化和保留行为，禁止由实现/绿测试证明旧预期错误。此次不是未触发测试：第一轮聚焦 Kernel/Topology 已报两个失败，其中一个是 provider 分支风格检查，另一个正是 active-main/stopped-side 必须保持 running 的保护。实现者随后把该业务断言改为 stopped，归档保护虽保留，运行相位保护却被削弱；套用用户关于活动 side chat 的口头语义时未保留历史成员例外。因而后续 241 项全绿是在错误的业务 oracle 上通过，无法证明兼容性。

本轮没有删除执行通路或测试；已恢复旧 running 断言，用户允许的 delta 仅保留主 input/approval 优先与既有活动成员聚合。负向 replay 在错误 child-only 源码上 5 项失败，修正后原相关回归通过。

## 已优化的规则和自动入口

1. CodeNote testing 唯一 owner §2.4：既有断言修改前先保留执行基线；验证逃逸后须有独立 requirement-owned core guard；接入已有构建/校验入口；已知坏实现必须被拒绝，禁止增设 watcher/服务/全库套件来替代。
2. EyPc check-companion-core-invariants：独立于可编辑的普通测试 fixture，检查 10 个 input/approval、活子/历史子、未读优先、唯一根卡与循环、归档拒绝场景。
3. 原 validate-utools-runtime 路径追加 source 与 packaged Kernel 各 10 场景；原类型/合同/镜像/身份/包校验均保留，package scripts 未变更。
4. 独立门禁自身有 positive 与 child-only mutation negative canary；不是仅靠检查字符串声称安全。
5. 项目验证映射登记触发面、消费者、入口及未验收边界；已有错误记录补充测试改绿造成逃逸的防复发依据。

## 问题台账

| 问题 | 当前状态 | 防复发 / 留存入口 |
| --- | --- | --- |
| 活动 side 与主 input 展示规则 | 已实现、自动验证；部分现场计数已核对 | spec.md / verify.md；独立 core gate |
| 历史子终态压住主当前运行 | 已修复；错误实现负向 canary 拦截 | 原生产 Adapter→Kernel 保留测试和 core gate |
| 修改旧断言制造全绿 | 已确认实施失守；旧断言恢复 | CodeNote testing §2.4；独立检查与审计记录 |
| 原生侧栏与 EyPc 截图混淆 | 来源已纠正 | verify.md 保留原生接口与截图各自证据边界 |
| 完整逐任务未读 / 所有 side 生命周期 | 未整体验收；截图与某时刻日志吻合不等于全通过 | verify.md；不把 native 全局 unread 与窗口化根卡直接等同 |
| 14:50 单成员 running→stopped→running 短暂变化 | 仅日志观察，未证明唯一原因；保留待核实 | verify.md，本轮不改无关因果通路 |
| 先前缓存优化的 3 个 Bridge 既有失败 | 原 HEAD 已复现，未删改断言 | ../../261012/duplicate-computation/task-card.md |
| GitHub 推送提示 6 项 moderate 依赖告警 | 远端提示，尚未逐项核实；不等于本轮引入 | [已有 Dependabot 入口](https://github.com/EyBell/EyPc/security/dependabot) |
| CodeNote 推送规则测试 / 文档检查阻断 | 实际门禁发现索引 84 行超限及失效 requirements-hub 锚点；209b3888 修复，原完整门禁通过且推送成功 | 保留全部索引内容、活动状态、投影标记与其他未暂存条目；没有跳过 Hook |
| CodeNote master audit advisory | 首轮 64 个、修复后 63 个 P0/P1 建议，未逐项归因 | 原 pre-push 完整审计保留；本轮只修两个实际阻断，不宣称全局建议已收口 |

## BusinessChangeReview / VerificationImpactTrace

Allowed delta：新增自动核心保护和唯一 owner 的约束，保留应用业务实现及已有执行通路。核心门禁消费者为标准构建/产物验证；文档改动不扩大应用测试范围。选定证据：两项门禁 canary、source/dist 10 场景、原 Kernel/Topology/TaskPackage/Presentation/Adapter 254 项、缓存/异步问题 24 项、生产构建和需求/错误记录校验。全库与 MQTT 不在影响面，未选。规则改动使用唯一 owner，保留 CodeNote 其他并发修改；不安装 Git Hooks 或监控服务。实机总体验收与 CPU仍独立保留。

## 未读与 Side 生命周期续核

新增 L-1 旧关系撤回、L-2 已接纳关系被全局 floor 误清、L-3 归档遗漏 Side、L-4 恢复事件匿名边界均已有复现/记录/独立自动门禁。原有未读回执与清退执行通路保留。[完整矩阵与实机待验边界](lifecycle-verify.md#L1)。

此次续核发现的是额外覆盖缺口：原 10 场景核心门禁保护相位/分组合同，但未覆盖“新 transport 携带旧 source lane 撤回”以及“另一部分批次前进后，已经接纳的边在展示和归档中仍须保留”的时序。不能用仅设置 sourceGenerations 的夹具代替实际 sourceLaneGenerations 排序；新 17 点检查显式携带各 lane 的 generation。原匿名 owner 本身已有防护，但这两类恢复调用绕过 owner，原检查未覆盖调用边界。现已接入原产物校验入口，并分别用旧撤回、展示 floor、归档 floor 和两类匿名 owner 绕过的坏实现验证门禁会拒绝。

续核最终相关回归 267/267，source/dist 各 10+17 检查通过；镜像、入口预算、需求与错误记录校验通过。新进程实测获得 Side 发现/合并、任务包应用、恢复事件匿名化及 9 个明确 unread 一致样本；1 个 unknown 样本不计通过。启动握手日志缺失和真实全生命周期未出现的场景仍如实留待证，不升级为整体验收。

## 当前原生兼容与成员归属的覆盖缺口

用户后续截图和日志不能由“缺旧 unread 字段后降级”结案。本机原生来源已迁移至 identity/host v1 与 IPC v3，而旧 fixture 只给旧 atom/v2，因此单测没有执行真实来源结构。Desktop-only Side 也没有进入原 inventory-only exact 关系；后续完整 Bridge→Kernel 复现又暴露 Side 请求误归主、普通活动帧遗漏 unchanged opened，以及主完成缓存提前代替子定向查询。原 10+17 核心/生命周期门禁用规范化证据供 Kernel，不能证明生产 Bridge 已产生正确成员证据。

现在在原标准产物入口增加 17 个实际 native parser/协议策略/成员请求 projector/活动 batch/子完成确认检查，source 和 packaged 都执行；8 项 gate 测试含七个已知坏实现 canary。三个生产 Bridge 组合回归直接断言 Kernel 相位、根未读与不泄漏子卡，未删改原业务断言。扩展 462/465，3 项已确认基线失败维持；匿名问题 19/19。预算门禁也实际阻断 entry 增长，已等价抽取到现有专用 owner，收紧预算，而非放宽或删除检查。最新现场计数 6 与用户截图一致，全部真实生命周期仍不作虚假全通过；[当前事实和边界](lifecycle-verify.md#L1)。

18:32 现场再发现 L-11：不能将最新 aborted 生成等同当前 pending question 的轮次结束。原生 question selector 与运行 selector 不同，原较宽“只看最新轮次”假设覆盖了正常生成结束和新对话，却漏了 Side 后续失败生成。现仅补该边界，两个实际 Bridge 回归先红后绿，独立门禁执行真实 shadow，旧错误实现被拒绝。主旧问题/运行不复活断言保留。[最新核验](lifecycle-verify.md#L1)。

L-11 初版只覆盖后续 failed/interrupted；18:37:43 已加载但目标家族仍没有 request-set，现场未通过。核对原生 selector 后补较晚 completed 的 Side pending 提问边界，保留主任务旧历史和 running 不复活守卫；当前相关 215/218（同样 3 旧失败）、async 22/22，source/packaged 新 17 项。18:45:08 宿主握手通过，目标家族已进入 waiting-input，后续仍 opened。现有真实日志能证范围与自动覆盖范围分别留存，未制造 Side 或执行安装。
