# 验证与交付

状态：automated-verified / artifact-ready / host-reload-pending。

1. 四个影响选定测试文件（Kernel、Topology、TaskPackage、Presentation）241/241 通过，原生 group-active Adapter 回归另 13/13 通过；包含 36 个父/子相位组合、Plan artifact 与未读、活动成员禁止归档及原有跨来源回归。
2. 续修的保留回归在错误产物上 5 项失败，修复后通过：主任务 running 不被历史 side stopped 覆盖，terminal/unknown 不凭子成员存在替换主状态，Plan fallback 保留。测试使用独立 Kernel 避免同时间戳事件的因果保留干扰。
3. 生产构建成功，语义类型、合同生成一致性、uTools 产物校验通过；规范 Kernel 与 public 镜像由构建同步。
4. 来源锚点同步，需求登记与真值校验通过；现有 2 项 proposed 提示不属于本轮。
5. 未运行全库/MQTT/真实 uTools/浏览器；Git 交付以提交记录及远端回读为准。截图中实际任务的 live 关系与现场表现仍待用户重载验收，不能以本轮单元测试确认该任务已经恢复。

## 产物

- core：EyPc V7 (V7)
- host：host-4df894349dd7a868879e
- renderer：renderer-b89cd53a03559e5ba4d5
- builtAt：2026/10/13 15:12:59（北京时间）；运行资产身份不变，用户已加载 14:41:14 产物的身份握手另已验证
- 重载后确认：主任务 input + side running 保持待输入；主任务 stopped/completed + side running 显示进行中；历史 stopped/completed/unknown side 不覆盖主任务 running/Goal；无子任务及其他来源保持原逻辑。

## VerificationDecision

工程修复；影响以 Kernel canonical package 为界，向分组/角标/cycle/presentation/归档门禁传播；定向证据全部通过；无全库升级触发；真实宿主验收由用户执行。需求、帮助说明和进程入口已同步，既有缓存优化改动保留。

## 更新后回归修复

- 已读取用户重启后的匿名日志；14:36–14:39 可见两个成员入站后根相位 waiting-input → stopped，以及 running → stopped → completed。日志不能直接将匿名根绑定截图标题；截图已由用户确认是 Codex 原生侧栏。
- 已确认上一轮自身引入的 child-only 聚合回归；恢复 active-main/stopped-side、unknown/terminal 保留和 Plan fallback 后，错误源码上 5 项失败，修复后 241/241 通过。原有成员归档阻断、分组与循环检查保留。
- 上一 14:29:20 产物存在该回归，新版为 14:41:14；类型、生产构建、合同和 uTools 校验通过。现场真实差异尚未宣称完全解决，仍需用户加载新产物对照。
- [已更新防复发记录](../../../knowledge/error-memory/codex-native-group-active-survives-parent-turn.md#L38)。

## 用户重载后只读核对（2026-10-13 14:50–14:52）

- 日志握手 actual/expected Host 与 Renderer 一致，确认实际加载本轮 14:41:14 产物。
- EyPc 14:51:31 为 input=0 / active=4；14:52:40 为 input=0 / active=5。两次任务包均有后续 Float applied ACK，但 ACK 不替代视觉验收。
- 同期 Codex 宿主接口的置顶主任务有三条 active；主线程状态没有提供 Side chat 聚合，也不覆盖 EyPc 全部根库存，不能拿 3 与 4/5 的差直接判定错误。
- Codex 原生窗口的计算机观察被工具安全策略禁止；uTools 观察返回其他插件窗口，未取得 EyPc 卡片逐行状态。没有绕过限制，也未操作任务、重启或修改代码。
- 结论：实际版本及任务包传递已确认；EyPc 与原生侧栏逐任务一致性仍为 insufficient-evidence，需要同一时刻两侧截图或受支持的匿名逐行状态接口。

## 原生接口与用户水球截图复核（14:54–14:57）

- 用户截图水球 active=3 / unread=6；EyPc 14:54:01.744 的 canonical counts 为 input=0 / active=3 / unread=6，截图与该日志读数一致。
- 随后 14:55:49.714 EyPc 为 input=1 / active=3 / unread=5。同期原生 thread 状态接口已逐条核实四个活动主任务：本任务、Shift 预览、服务器工具统筹为 active 且无等待 flag；发票服务为 active + waitingOnApproval。该组运行/等待计数吻合，不能将全部四条 active 都当进行中。
- 原生清单还含 remote/durable 和更早历史未读，EyPc 角标另受根任务聚合、时间窗、隐藏/暂停和可打开门禁影响；原生全局 isUnread 总数不能直接对比当前角标。截图未读 6 与历史对应日志已确认，完整逐任务未读一致性尚未取得。
- 本轮只读核验，无代码改动；不宣称所有任务、所有 Side 分支或未读/权限边界已整体验收。

## 规则与自动门禁优化验证

1. 原已有规则与实施失守原因见 [audit.md](audit.md#L1)，包含全部当前问题台账和未完成验收边界。
2. 新核心 gate 独立验证 10 个场景，已有构建校验自动对规范 source 和生产包分别执行，共 20 个场景检查。旧 child-only 错误实现被独立 canary 拒绝，正确实现通过。
3. 新 gate 正负 canary 2/2；缓存与异步问题 24/24，本轮共 26/26。原业务 254 项证据输入未变化，复用其通过结果；没有重写旧业务断言或删除执行路径。
4. 类型检查、完整已有生产构建、source/dist 自动 gate、uTools 校验通过；此前测试入口后缀与脚本类型声明缺口已修复，未放宽类型检查。构建为 EyPc V7，host-4df894349dd7a868879e / renderer-b89cd53a03559e5ba4d5，2026/10/13 15:12:59。仅新增开发校验，运行资产身份与用户已加载版本相同。
5. CodeNote testing owner §2.4 已优化；rule-state drift check 与相关文档代码链接审计通过。没有新服务、watcher、Git Hook 或全库测试门禁。

## 分批交付

- 缓存优化：4462e6d；状态修复：f92c7a7；自动门禁、错误记录、规则审计与当前真值作为独立批次。
- CodeNote 测试唯一 owner 优化：8a05dd9a（testing §2.4）；其余并发未提交修改不纳入本轮。
- 推送及最终范围以同轮 Git 远端精确 OID 回读为准，Git 交付不替代台账中的待验收项。
