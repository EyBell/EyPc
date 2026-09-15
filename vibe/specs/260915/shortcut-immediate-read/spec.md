# 快捷打开立即已读设计与冲突登记

spec_id: SPEC-260915-SHORTCUT-IMMEDIATE-READ

1. 以最新用户指示定义 EyPc 显示行为：成功 `dispatched/opened` 后同步提交本轮本地已查看投影。只针对真正打开的任务，不清空全部 Provider 的未读队列；普通卡片与自动恢复保持原合同。
2. 入口包括 global/local shortcut、attention shortcut、task-cycle、manual-quick-jump，经唯一 Kernel navigation openTarget 收口。内存投影不读写磁盘、不发起 Provider 扫描，不增加定时等待。
3. 不修改 Provider 原始节点、原生未读、handoff、nativeVisible、controlOwner 或 confirmsRead。原生窗口是否真正可见仍由原生回执确认；本地立即已读只表示本次快捷查看已派发。
4. 记录以当前初始化代际、任务实例和全部成员的轮次/状态指纹约束。比较成员身份、相位、未读、turnStartedAt、lastQuestionAt、terminalAt、statusEnteredAt、phaseRevision；普通 metadata/revisionAt/unreadRevision 轮询变化不让同一次完成重新闪回未读。
5. 原始 Provider 节点保留，投影只在 public root materialization 应用，因此后续真实 running、等待、完成、子成员变化可直接推翻旧记录；进程重启/Kernel invalidate 清空记录，不作永久已读凭据。

| 编号 | 冲突 | 决定 |
| --- | --- | --- |
| 1 | RAW-177 原生确认才算已读 | 保留原生交接真实性；新增 EyPc 快捷查看投影，不伪造原生确认。 |
| 2 | RAW-220 Orca native true 优先 | 原始 native true 保留；本次快捷查看只在 EyPc 暂时显示已读。同轮回流不闪烁，新动态恢复权威。 |
| 3 | 打开失败、超时、取消或不可用 | 不写本地记录，保留未读。 |
| 4 | 派发期间任务进入新轮次 | 发送前捕获指纹、返回后重核；不同就拒绝旧回执清新任务。 |
| 5 | 删除后同 key 重现/重新配置 | 任务实例或初始化代际不同就拒绝迟到回执。 |
| 6 | 同一父任务有子会话完成 | 按全部成员指纹比较，不让旧父任务回执压住新子任务动态。 |
| 7 | 原生 read 后再次 unread | 原生布尔变化使本地记录失效，后续 true 正常显示。 |
| 8 | 已完成 Plan、进行中、等待审批 | 只覆盖 completed 的 unread 字段；不改 Plan、交互、相位或能力。 |
| 9 | 卡顿排查与并行导航/Orca 工作 | 本次只增加无 I/O 的 Kernel 本地投影；保留独立日志与并行改动，未保证真实卡顿已解决。 |

实现：[shortcut-read.cjs](../../../../preload/companion/shortcut-read.cjs#L1)；验证与产物见 [任务卡](task-card.md#L1)。
