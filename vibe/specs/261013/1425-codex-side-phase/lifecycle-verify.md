# 未读与 Side 生命周期续核

状态：源码/生产包自动验证通过；此前宿主精确握手通过；18:32 新发现的 Side 待输入缺口已修复，18:45:08 新宿主精确握手与真实 Side 待输入保持/回答解除已核验。限定只读现场样本已核验，未出现的完整生命周期保持待证。Git 交付以提交与远端回读为准。

## BusinessChangeReview 与核验范围

基线：当前 PRODUCT_REQUIREMENTS 的精确拓扑、generation 不倒退与严格源结构化撤回；RAW-181 恢复提示仅含身份、不产生相位；RAW-221 快捷打开只改变 EyPc 本轮已查看投影，不能伪造原生 read ACK。允许变化仅为补齐这些既有合同的缺口、匿名诊断与 Provider 关联字段、当前 native 未读格式/协议兼容和成员因果证据归属，未新增状态、轮询、服务、跟随路径或生命周期 TTL。

消费者：Codex/Claude/Cursor/Orca evidence → relationStore → 根卡相位/未读/分组/cycle；同一已接纳图也用于已验证归档后的全家清理。四 Provider 的旧 generation 撤回与当前撤回均有回归。Provider 实际 native archive/open 操作没有执行；测试使用内容为空的适配器。

## 已确认问题与最小修复

| 编号 | 问题 / 证据 | 修复与独立检测 |
| --- | --- | --- |
| L-1 | 新 transport 中的旧 generation 会被成员删除门禁拒绝，但关系删除原来没有同样门禁；旧源码回归失败，活动 side 脱离根卡 | 关系撤回复用现有 enabled/generation 入站门禁；当前有效撤回仍放行；四来源回归 |
| L-2 | 另一批次使全局 topology generation 前进后，用全局 floor 再过滤已接纳关系，会无撤回证据丢失旧成员；错误实现复制 canary 被拒绝 | 归约使用已通过 admission 的 relationStore；完整快照与精确有效撤回仍保留，未移除 generation 的入站检查 |
| L-3 | 归档清理也重复使用全局 floor，根归档后遗漏已接纳的 side，并留下卡片；修复前 17 点检查在该场景失败 | 展示与归档复用同一已接纳成员图；验证整家撤回和重复撤回 no-op，原活动成员禁止归档保留 |
| L-4 | 当前日志两类恢复事件有原始 taskRef；只保存计数，不复制标识 | 两个调用改用现有匿名记录 owner，重订/跟随行为和诊断事件保持；真实 owner 执行与绕过负向 canary 自动检查 |
| L-5 | 根相位 Provider 仅在 details 中，匿名 owner 读取顶层，导致 unknown/codex 指纹命名空间分裂，无法与同根 Side 合并关联 | 只补顶层 Provider；真实 Kernel 检查及移除该字段的负向 canary 拦截；当前宿主跨事件关联已实际取得 |
| L-6 | 旧 unread 集合缺失、live 缺字段边界 | 先补有限根/成员/来源诊断，确认明确 live true 应保留；缺集合不得当空集合，随后定位为 L-7，不能只用 unavailable 降级结案 |
| L-7 | 原生已迁移至 electron-thread-read-state-v1 的 identity/host 桶及 read-state v3，旧 atom 读取失败且 live v3 被拒绝 | 原文件读取/监听与 IPC 入口内兼容当前格式/协议；单身份单宿主选择，多身份不猜测、不跨桶并集；native/legacy 与 v3 Bridge 回归、独立 source/packaged 检测 |
| L-8 | Desktop-only 已验证 Side 关系没有 exact；接纳后 Side 请求仍落主 key/epoch，活动重放不携带 unchanged opened，真实组合回归 phase completed 先失败 | Desktop 关系 exact；成员请求 key/epoch/完整集独立；原 activity batch 重发仍 opened 的有限实例；完成/连续读取/refollow/匹配回答完整回归先红后绿 |
| L-9 | Side 完成查询被主完成缓存提前收口，或受主轮次 freshness 约束；组合用例根 phase unknown、Side unread 已知 | 主缓存只用于主查询；现有定向 Side 查询以该成员当前 Turn 确认终态，记录成员证据，不覆盖较新主轮次；跨成员较新轮次夹具及负向检测 |
| L-10 | 收尾预算发现 entry 超 38 行和新增 1 全局可变绑定 | 成员请求投影等价移入现有 desktop-request-projection owner；绑定放现有 Bridge 实例。entry 降为 14731（原 14804），mutable 163 不增；预算收紧，不放宽门禁 |

| L-11 | 18:32:26 真实 Side 家族 waiting-input→unknown，仍可见 Question；原生 selector 与投影区分提问轮次和最新生成，EyPc 只看最新 aborted 轮次 | 仅 Side 的较晚 completed/failed/interrupted 生成允许保留此前仍 inProgress 的待答轮次；不供应历史 running；接受匹配答复/普通 steering 仍解除；完整 Bridge 组合失败场景修复后通过，主旧问题不复活守卫不改 |

## 自动生命周期矩阵

现有产物校验入口分别对 source/dist 执行原 10 个核心场景和新增 17 个检查点：成员进入；不完整家族不撤回；迟到旧撤回；当前撤回；旧快照不复活；嵌套成员；完整家族撤回；归档全家清理；unknown 未读不冒充已读；side 完成未读只计根卡；成功快捷本轮已读；同轮来源未读不闪回；新 side Turn；新完成重新未读；迟到旧 unread；打开失败；打开过程中新完成与迟到回执隔离。两类恢复事件另有匿名边界检查。

自动门禁正向与四个已知坏实现的负向 canary 通过（旧撤回、展示 floor、归档 floor、缺 Provider），当前逻辑实际运行，而不是仅核对源文件指纹。未改变原测试预期以制造全绿。

## 已执行结果

- 8 个文件相关回归最终 268/268，包含四来源撤回扩展与 Provider 缺失负向检查。Bridge 恢复/回读/Side 重载与清退定向选择为 20 项通过（含相关门禁；其中 Bridge 13 项）；另一次更窄选择为 8/9，失败项为旧 Orca execFile 断言。
- 该 Orca 断言在复制 HEAD 的 preload/kernel、内容为空的独立临时夹具中也失败；没有改断言、跳过或改变 Orca 路径。临时夹具已清理。
- 类型、合同、生产构建和 uTools 校验通过；source/dist 各 10 + 17 检查通过。来源/需求真值及错误记录校验另执行收尾。
- 收尾镜像 96 对、原入口预算、需求/源锚点和错误记录校验通过。需求中 2 项 proposed 与错误记录旧复审提醒仍保留，未改为已验收。
- 本轮启动身份与 Side 恢复/清退相关定向 19 项通过；未读缺字段、瞬时失败保留、Side 未读权威/回读 4 项通过，包含新缺字段回归。仅更新测试后类型再核通过，产物身份未变化。

## 现场证据与限制

持续日志包含 side 合并、恢复提示、快捷本轮已读及打开回执。原生接口仅主状态不包含完整 Side 聚合；多个 Provider 也已出现，不能将总角标与某次 Codex-only 主状态清单直接比较。现有日志缺少每个成员的完整因果状态，不能把 L-1/L-2 当作所有短暂状态变化的唯一原因。

原生 unread 与 EyPc 本轮已查看独立；旧同轮 unread 回流不反弹、新 Turn/新完成重新未读均已自动验证。不以单测或 ACK 宣称整体验收。

2026-10-13 16:57–17:01（北京时间）重载后只读续核：

- 新进程持续接收并应用任务包；17:00:22 分组为 input=0、active=3、unread=5，随后 revision 86 的浮窗 applied ACK 为 113ms。Side 发现数由 17 增至 18，并有新关系 merged 事件。
- 原生侧栏接口抽取 10 个本地任务的状态/未读，与现有匿名 key 对应的最新根 unread 证据比较：9 个 known=true 样本的 unread 一致；1 个最新证据为 unknown，未当作已读一致性通过。样本并非原生 UI 像素、全部 Side 或最终卡片未读验收，原生 active 与 EyPc 聚合相位也不能仅用总数证明相同。
- 两次 desktop-resubscribe、两次 desktop-replacement-snapshot 已实际发生，4 次引用均为现有 salted 匿名格式；没有将“未触发”作为通过证据。root-unread-evidence 的引用是既有 32 位摘要，未误记为原始标识。
- 当前日志仅保留第二段，开始于 16:57:01，启动握手记录不在其中；独立 freeze recorder 也无该进程头记录。只能确认新进程与修复后的恢复事件行为，不能声称精确 hostAssetId 握手已取得。
- 没有操作真实任务归档/撤回或制造新 Side，未取得本轮真实归档、嵌套新成员、整家清退的完整因果样本；这些场景已通过 source/dist 自动时序检查，现场部分继续标记待证。

### 历史宿主现场核验（17:35–17:39）

- 用户已重载 17:33:30 新产物；17:35:07.698 日志实际握手为 host-loaded，actual/expected Host、Renderer 及 Kernel/Registry/Topology/Snapshot/Subscribe/ACK 全部匹配本节产物。此前 16:52:10 构建也由用户回读界面确认已加载，但以下证据属于该时段宿主。
- 17:35:08 恢复 3 条身份关系提示；17:35:09 完整 Side 拓扑合并为 16 个 Side、11 个父家族、2 个 orphan，nested=0。提示恢复不代表恢复相位；随后真实相位事件另行记录。
- 6 个带 Side 家族能用同进程匿名指纹关联到 running。一个双 Side 家族在 17:35:10–17:35:16 记录 stopped→running→waiting-input→running；另一个单 Side 家族在 17:39:12–17:39:13 记录 running→stopped→completed 且 unread=true，并有后续任务包 applied ACK。这证明真实成员家族的根状态变化与诊断关联；日志仍没有全部成员分别相位，不能声称一定由某一个 Side 引发。
- 11 次有引用的根相位事件全部携带 codex 顶层 Provider；一次重订事件实际发生且引用匿名。17:39:13/14 的 revision 160/162 应用回执分别为 15/197ms。
- 同期原生接口抽取 12 个本地任务，10 个最新根未读证据 known=true 且与原生一致，2 个 unknown 不计通过。观察到一次持久 unread 源失败；只检查精确许可字段形状，确认旧 unread-thread-ids-by-host-v1 不存在，未保存任何原始值。实时来源保留，缺字段回归及 unknown 自动门禁通过。
- 用户明确限定只核对现有日志，不创建测试 Side。本段没有真实 archive 或 desktop-side-reconciled 事件，也没有新 nested 成员；这些场景保留自动验证/现场未出现的区分。普通 inventory-dropout 事件不能替代严格 Side 清退证据。旧日志根相位 Provider 缺失的指纹不会被新版本追溯改写。

### 原生协议与现场续核（18:26–18:32）

- 用户重载 18:24:53 修复版；18:26:22.304 日志 Host/Renderer 与全部 revision 精确握手一致。新旧格式与协议兼容、成员交互/终态归属已经进入该产物。
- 18:26:23/27 原生持久 unread 读取均为 ok，有限集合大小 38/37；旧格式失败已消失。这里只记录有限结构结果，不保存状态文件原始值或身份。
- 18:28:10.505 发布 active=6、input=0；revision 85 于 18:28:10.589 applied，后续持续 applied。用户原生截图可见 6 个 spinner，与该时段计数一致。原生主任务接口同时为 4 个 active、CS/IM 主 idle；该接口不包含 Side 聚合，不能把它当完整侧栏/根卡状态。
- 数量一致不是逐成员因果验收；没有伪造测试 Side，也没有执行截图中 OneDev 安装授权。未出现的真实归档/嵌套/完整清退仍待证。
- 入口预算等价抽取后最后产物为下节 18:29:36，自动验证再次完成；18:30:52.968 精确握手已取得。18:31:00 带 Side 家族进入 waiting-input，但 18:32:26 误清为 unknown；不能把最终握手或旧 active=6 样本当作所有待输入都正确，已追加 L-11。

## 最新自动结果

- 11 个相关文件 462/465；余下 3 项为原先已确认的 Bridge 基线失败：Plan cycleTier、旧 Orca execFile allowlist、initialize retry 的 execFile 零调用断言。未改这些断言、未 skip。另执行匿名 async questions 19/19（L-11 后为 22/22）。
- source/packaged 各原 10 核心 + 17 生命周期 + 新 17 native unread/成员边界检查；匿名 owner 检查保留。新增 gate 8/8，含旧 v2 策略、多身份猜测、Desktop-only 关系遗漏、Side 请求归主、活动重放漏请求、主缓存代替子查询等坏实现，均被拒绝。
- 新 Bridge 三个组合场景：当前 native identity/host 冷读取；Desktop-only Side 未答问题经过 completed、持续读取、refollow 后保持 waiting，匹配答复解除；Side completed + v3 unread 提升唯一根卡，明确 read 清除，远端事件不混入，较新主轮次不被子查询覆盖。
- 原执行通路保留；无新增认证读取、轮询、服务或跟随路径。生产构建、类型/合同与入口预算通过；最终镜像 96 对、需求/来源锚点、错误记录、文档代码链接校验均通过；入口预算 14731/279/163 通过。

### L-11 当前验证

- 用户明确只核对待输入，不处理截图中的自动审批/安装。安装产物只读核对显示原生 pending question 从仍 inProgress 的提问轮次选取，与最新 aborted 生成/运行 witness 分开；未读取凭据、未保存原始对话。
- 两个 Side later completed/interrupted/failed 组合在修复前回归失败，修复后维持 waiting-input，持续读取/refollow 后仍维持，匹配回答解除；主任务取消及新 completed 历史不复活等原断言保持。
- 最新受影响三个文件 215/218，仍为同样 3 项既有 Bridge 失败；其中新增 gate 8/8、async 22/22。其余 Kernel/Topology 等已通过的相关文件未受 L-11 改动影响。标准 source/packaged 新门禁为 17 项；原 10+17 和匿名检查保留。

### 最终现场加载与待输入（18:45–18:47）

- 用户确认 Question 保持待答；18:45:52.562 最终 Host/Renderer 与全部 revision 精确握手一致。
- 带三个 Side 的目标家族 18:45:56.616 running→waiting-input；后续有限 user-input opened 证据持续接纳，18:46:05.858 仍 opened=1、resolved=0。浮窗 revision 27/29/30 均 applied。
- 另一个家族 waiting→running 有其自身 resolved 证据；没有把别的任务解除等待误作目标 Side 完成。18:28 的 active=6 仅对应此前截图时点，当前真实任务在变化，不冻结数量。
- 目标待输入从 18:45:56.616 保持至 18:46:54.877，约 58.3 秒；用户明确确认已回答该 Question。此后同家族请求为 resolved=1/opened=0，根任务进入 running，后续持续 resolved，没有无答复误清或旧问题反弹的证据。该真实样本补足待输入保持与回答解除，不替代全部 Side/未发生场景验收。
- 18:45:08 前的较窄失败回退没有在目标家族产生 request-set，未算现场通过；最后覆盖较晚 completed 轮次后已产生明确 pending input。真实维持与随后匹配答复的证据分别记录，不代替所有真实 Side 的整体验收。

## 新产物

- core：EyPc V7
- host：host-3ba5e7af0dfabdb2081f
- renderer：renderer-819145f74a7bd9ebf06e
- builtAt：2026/10/13 18:45:08（北京时间）

## VerificationImpactTrace

影响已接纳关系、归档全家清理、匿名诊断、原生 unread 来源兼容与成员交互/子查询终态归属；未读原归约/快捷回执/跟随与法定人数清退不改。已选择 Kernel/Topology/TaskPackage/Presentation/Adapter、Bridge 精确 Side/未读边界、独立 gate 与类型/生产包边界。全库、MQTT 和实际原生归档不在本轮执行面；无全库升级触发。精确握手通过，完整逐成员及未出现的真实清退/归档仍待证。
