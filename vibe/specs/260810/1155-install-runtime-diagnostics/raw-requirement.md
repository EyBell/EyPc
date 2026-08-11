# RAW-159 → RAW-160 — Plan 生命周期、状态收敛、暂停执行与按变化发布

Date: 2026-08-11
Status: `active / implementation-landed / full-automated-verified / artifact-ready / installed-host-pending`

## 历史基线

RAW-159 要求把状态、库存、缓存、快捷键、导航、归档和诊断从分布式补丁收敛为单一 Kernel，并已落地无固定任务上限、Codex cursor 全分页、语义 no-op、热缓存、Runtime Identity、十阶段 Codex 归档事务和运行诊断。这些是 RAW-160 的嵌套基础，不得遗漏或回退。

安装宿主随后复现：普通 interrupted 被过宽判为“待继续”；截图时仍运行且尚未生成 Plan 的任务没有稳定显示为进行中；Plan 完成/中断后的角标与循环候选不稳定；Claude 已终止仍可能沿用旧 running；EyPc 归档成功被误解为 Claude 原生侧栏同步；Kernel no-op 也没有阻止每个消费者重复发送/消费。

## RAW-160 当前要求

1. 唯一数据流为 `Provider 原始事件/库存 → Evidence Adapter → Branch Evidence Store → Canonical Task Reducer → View/Capability Projector → Latest Package Cache → 全部消费者`。
2. 升级 `task-state-v10 / companion-task-kernel-v4 / companion-task-package-v4 / companion-task-actions-v2`；V4 Kernel 缺失或四端 Runtime Identity 不一致时 `reload-required`，不回退旧裁决。
3. 分支先独立按因果顺序裁决，父任务再聚合。任一真实运行优先；否则审批、问题或 Plan 实施确认；只有全部分支终止且终态满足复核才 completed/stopped；冲突保留非终态并 `verifying`。
4. 首次 Plan 正在生成且尚无完成 Plan 时必须是 running、`planReady=false`；已有 Plan 后继续修改时仍 running 并保留 Plan 生命周期。
5. 完成 Plan 且实施确认未决时是 waiting-input、`planReady=true`；未执行便 exact interrupted 时，只有定向复读确认无更新 Turn/活动/等待才是 stopped。
6. 普通 interrupted 在 idle 复核前保留最后稳定态；确认全部分支 idle 后才是普通 stopped。任何 active/terminal 冲突不得先发布 stopped。
7. `planReady` 仅由 exact 实施请求或 exact 最新 completed Plan 建立；新 Plan 递增 `planLifecycleRevision`。刷新、重启、refollow、owner 切换或继续 Plan 对话不清除；确切 default/non-Plan 执行、明确放弃、完成、归档或移除才清除。
8. `paused` 是 EyPc 本地持久状态，只存哈希 taskRef、Plan revision、paused 和时间。暂停跨刷新、重启、refollow 和 Plan 继续保持；确切非 Plan 执行开始自动清除。
9. 动态列表保留 `dynamicTaskWindowHours`。普通 stopped 超时退出；唯一窗口例外是 `stopped + planReady + !paused`，但仍服从更大的库存保留范围。
10. waiting Plan 即使不在动态展开范围，也进入待输入角标、Plan/attention 快捷能力和通用 Plan 循环；不新增紧凑 stopped 角标或 stopped 专属快捷键。
11. 通用循环首个非空层保持：普通问题/审批 → waiting Plan 与 stopped Plan-ready → 动态窗口 active → local pin；层内按最近提问、创建时间、匿名 key 稳定排序。paused、普通 hidden 和 archived 全部排除。
12. Plan-ready 使用暂停而非普通隐藏。“已隐藏”页顶部增加“已暂停”；旧 hidden 且仍能证明 Plan-ready 的任务幂等迁移为 paused，无法证明的保持普通 hidden。批量隐藏遇到 Plan-ready 也必须转为 pause。
13. 行内四槽固定为：普通 `顶/隐/归/+`；Plan-ready `顶/暂/归/执`；已暂停 Plan `顶/恢/归/执`。Plan 新会话保留在完整操作抽屉；批量增加暂停/恢复；按钮要有禁用原因、ARIA 和焦点恢复。
14. Execute Plan 只对 Codex、planReady、无真实活动、无其它待决请求且 App Server 能提供 default collaboration mode 与当前模型的任务开放。
15. “执”首次点击只建立 5 秒原位“确”，第二击才执行；身份为 `provider + taskRef + planLifecycleRevision`，phase/revision/alias/activity/pending 变化立即取消；确认状态不增加 package revision。
16. 执行建立 Plan revision single-flight，定向复核后严格调用一次 open → `thread/resume({threadId, excludeTurns:true})` → `turn/start`。`collaborationMode` 是含当前 model、reasoning effort 的完整对象，固定指令只存在于 Preload 常量和本次 RPC。
17. 明确成功不乐观伪造状态，由 exact `turn/started`/响应 Turn 收敛 running 并清除 Plan；超时是 `indeterminate`，只做定向复读且禁止盲目重发。不得回退剪贴板、键盘模拟、UI 自动化或替代会话。
18. 状态可反复检查，但只有消费者可见语义变化才增加 revision/publishedAt 和发布。纯 observedAt/generation/ACK/因果水位变化为完整 no-op；动态时间只维护一个最近 `nextVisibilityTransitionAt` 计时器。
19. Kernel 提供 `getLatest()` 与 `subscribe(afterRevision)`；Main、Float、Navigation、Actions 各自缓存最后 revision 与 selector 指纹，旧/同 revision 忽略，Renderer detach/Float close/mainHide 不清热缓存。
20. Float 任务包与 quota/settings 分 lane，必须回 `received/applied/rejected` ACK。500ms 未 applied 只重发最新包一次；累计 1 秒且心跳健康才受控重建。相同 revision 保留任务缓存对象引用且不重投影。
21. Claude 新 `session.phase` 优先于旧 `previous.phase`；phase、phaseRevision、statusEnteredAt、unread、capabilities 原子更新，watcher、一秒补漏和打开后定向刷新进入同一 Store。
22. Claude D′ 归档成功只表示唯一元数据写入、EyPc 活动库存移除和事务复读通过。成功提示必须分别说明“EyPc 已归档并移除”和“Claude 原生侧栏同步未确认，当前不受支持”。
23. 诊断只公开会话期 `h:<hex>` taskRef 和 operationId；不记录原始任务 ID、路径、Plan 内容、执行提示、命令/工具参数、stdout/stderr、凭据或隐藏推理。
24. 静态所有权测试禁止生产模块在 Kernel 外重构 canonical phase、dynamicGroup、cycleTier、counts 或 cycleKeys。
25. 自动化覆盖完整真值表、Side Chat 聚合、暂停迁移/持久化、窗口例外、循环、四槽、Execute Plan、1,000 次 no-op、Float ACK、Claude 状态/归档、240 项分页与旧归档/身份/诊断回归。

## 冲突与非目标

- RAW-142 的“任意新 Turn 清除 Plan”、RAW-150/154 的“exact interrupted 立即 stopped”、RAW-159 的“只在 Kernel no-op 即完成消费去重”和旧 Actions/Package 版本被 RAW-160 对应条款取代。
- 强制 Claude 原生侧栏同步不是产品能力合同；过去偶发同步只作为 Claude 自身刷新观察。
- 本轮不真实启动 Codex Plan、不重复真实 Claude 归档；两类外部效果必须由用户分别选择安全任务并明确授权。

## 验收要求

- 受影响矩阵、全仓测试、typecheck、Preload 镜像/语法、production build、Runtime Identity、uTools validator、静态所有权、文档链接与规则一致性全部通过。
- 真实宿主必须验证 Plan 尚未生成、Plan 完成、Plan 中断跨窗口、暂停跨重启、Claude running→terminal、通用循环与 Float ACK 恢复；自动化不能替代该门禁。
