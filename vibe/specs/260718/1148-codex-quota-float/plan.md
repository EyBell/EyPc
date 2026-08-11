# Codex 任务状态收敛计划

Tool: codex
Status: `focused-automated-verified / host-pending`

1. 用序列测试复现“完成通过定向核验，后续完整快照反判回进行中”。
2. 完成通过 active-exit 门禁后立即关闭周期并清除 baseline。
3. 跨 preload 发布 Activity/Turn 来源，用真实 activity patch 区分初始 snapshot replay。
4. 提升到 `task-state-v3`，保留一版 degraded 兼容，移除完成展示延迟设置的当前运行形状。
5. 验证 Bridge、Controller、Domain、Renderer 同源包、类型和 preload 镜像。
6. 将实时 delta 与完整 snapshot 的 active-exit 判断合并到一个转换器，旧 interrupted/failed 不得在 inventory 重建时误入 stopped。
7. 原生 unread 晚到且完成尚未确认时，只唤醒一次 bounded latest-Turn 复核；完成与当前未读走同一发布路径。
8. 将当前合同收敛到 Spec/PRD/架构/技术记忆，历史细节仅保留在 raw 与错误记忆。
9. 清理残留 completedAt/terminal-shape/缺结果停止门禁，让 latest-Turn single-flight 在 active 与 exit 模式切换时可接管，并让可疑 active 的 unread 只唤醒证据复核。
10. 全链审计状态写入/仲裁/投影/消费：移除本地未读覆盖与批级拒绝，给 full snapshot 增加 Activity generation 屏障，收敛 inventory 证据合并、缺失行隔离、冷启动 unread 一次性唤醒和 delta/full snapshot confirmed-terminal 统一识别。
11. 清零整仓残留矩阵：修复任一普通窗口归零的 Spark 仲裁，撤销旧配色预览 Runtime 路径，将外观测试/文档统一到直存直渲，并把 MQTT/Quick Jump 静态断言限制到真实结构边界。
12. 给 Desktop activity patch 与 App Server active 建立同一进程内因果序列；旧 idle activity-event 经 read-state/inventory 重放不得撤销更新的 `app-server-live`，真正后到的非 active patch 仍可撤销。
13. 冻结场景式补丁，按 Activity/Turn/read-state/Side Chat/inventory/bridge-state 的写入、撤销、重放和消费点建立闭合转换矩阵；先记录全部 P1，再按“正向 epoch → terminal → inventory → presentation/action”顺序修复和验收。
14. 在不放宽 RAW-131 门禁的前提下，将父任务聚合收敛为纯解析器，增加 Side Chat 分支终态延后保护与匿名裁决计数，并用反向合同证明旧 Turn、旧 generation 和 stopped archive 不能回归。
15. 将匿名诊断的字段、规范化和比较收敛到 Domain；Controller 只做 generation 后原子接纳与变更通知；运行页压缩常驻文案、隔离 live region 并统一原生帮助按钮，再用生产纯解析器真值表和诊断通知合同封住回归。
16. 将动态页固定 6 小时窗口收敛为 `CodexSettings.dynamicTaskWindowHours`：默认 24 小时，任务配置页可编辑，Controller 原子包与既有时间边界调度器即时重投影，Renderer/Preload 不新增过滤或请求。
17. 将额度刷新与完整库存校对放宽为 `0–86400` 整数秒配置，并把无 Turn 载荷的精确 completed 事件从 stale-active/全量扫描退化路径拆为密集有界的单任务完成确认；更新 positive epoch 继续取消旧结果，失败才回退完整校对。
18. 为精确 Plan 实施确认增加隐私安全的 plan-only 会话语义并升级到 `task-state-v4`；Controller 将前后任务候选拆为普通输入/审批、Plan、最近活跃三个独占循环层，保留方向、回绕、去重和本地置顶兜底，并补齐 Bridge/Domain/Controller/平台、帮助与文档合同。
19. 闭合插件中断恢复：让当前原生 unread 集合的存在/不存在双向压过重连 snapshot，停用时清空 Controller 派生基线并以新运行代次立即 bootstrap，给零周期 missing-key 增加剩余隔离窗自唤醒，并用最多 1000 条 preload 内存拓扑提示重订已知 Side Chat；保持公开 v4 协议、本地用户状态与未知 ephemeral child 边界不变。
20. 复核真实宿主仍未收敛的已读：区分运行包、当前 IPC 协议、事件时间线和原生集合，允许当前 refollow `false` 清除遗漏事件留下的 persisted `true`；所有插件任务 Deep Link 成功后走同一会话期已读确认，失败不改状态，新 completion 清理旧 false，并补 main/Side、断桥和协议兼容合同。
21. 复核真实 uTools 的 ASAR/preload 身份与任务打开路径；把 Codex 全局入口统一为 `mainHide` 独占可见性，空库存指令经 tasks-only preflight 后执行，卡片失效 alias 只按同一 key 重建并至多重试一次；补 App route、Controller、Bridge 与真实点击证据。
22. 复现完成未读快捷键“先已读后反弹”的生命周期：把成功打开确认从单个 Bridge `liveUnread` 提升为有界 preload 会话 epoch，跨普通 mainHide/IPC reset/resubscribe/连接重建保留，并仅由新 Turn 或明确移除释放；补同 completion 重放与新 Turn 反向合同。
23. 用当前真实 `Needs input` 任务验证 owner 已消失后的证据缺口：对 `CODEX_HOME/sessions` 内有界 rollout 的未匹配 `request_user_input` 建立隐私安全 connector 回退；同时保留已观察的输入/审批/Plan sticky shadow、丢弃普通 active，并让非 kill pluginOut 保持 Desktop observer。补持久回退、owner loss/new evidence、Controller close 语义和真实预检合同。
24. 将 completed Plan 的精确 rollout/App Server item 作为“待实现”决定投影，优先于 unread/completed；同时让最近一次成功原生 unread 观测跨库存替换稳定较弱 snapshot true。只跑 Bridge/Domain、相关 Controller、typecheck、preload 语法/镜像与同步 IPC 定向门禁。
25. 将普通 `mainHide/onPluginOut(false)` 从 App Server teardown 改为热会话保留；给 Controller tasks preflight 增加发布成功感知的范围单飞，让 verified 空库存与 Runner catalog 可复用，并用 RPC 零新增/并发单扫合同验证，不运行完整门禁。
26. 将任务物化视图提升为 Codex feature-lifetime 热缓存，Tab/Float 只门控额度；把 Runner catalog 拆成按项目增量失效/单飞，并把成功打开确认绑定内部 Turn ID，覆盖 uTools fallback、同 Turn completedAt 补全和旧全量快照反压。
27. 先在当前本机以真实 Provider 数据贯通 Preload 与生产 Domain 投影，复现并清除“Preload 恢复 waiting、产品仍 ongoing”的跨层断点；用 `persisted-decision` 显式来源升级到 `task-state-v5`，保持普通 connector hint 拒绝与精确新 Turn 清理门禁，再验证聚焦状态机、类型、完整构建、镜像和真实只读预检。
28. 排除实际宿主更新后收口剩余消费者与文档偏差：抽取 Controller/Float 共用的置顶优先显示排序，让全局待输入与紧凑首条一致；补“后项置顶”的反向测试，修正角标帮助/ARIA与旧断言，并同步 v5 provenance、24 小时默认、最新测试基线和 8092 当前状态。
29. 修复正向 follower 公告回声：仅响应显式 following-status request，补定向公告反向合同；恢复真实预检的相对 TypeScript 依赖加载，执行聚焦 Bridge、类型、Preload 三向镜像/构建及有界真实 IPC 探针，真实 uTools 重载后再接纳状态转换。
30. 提交前同步 task/current/technical/error-memory 权威层：把 stream-follow 回声固定到单一主记录，为依赖记录补更新引入并清除双主表述；按 hunk 隔离并发 Claude 写集，验证暂存快照后仅创建本地提交。
31. 复核 Codex Tab 的环境与来源识别：把 Runtime 横幅/表格/帮助/兼容等待抽成一个 Domain 投影，任务/项目行归属各只解析一次，启动路径 mutation 复用 Host 返回快照并移除二次 inspect；以 RAW-022 裁定规则/PRD 冲突，更新既有 supersession 错误记忆并执行聚焦测试、typecheck 与文档审计。
32. 以 RAW-149 扩展 Desktop follower 的未决请求投影：把命令/文件/权限审批与 MCP elicitation 纳入待输入，升级 `task-state-v6` 和匿名状态时间；为待输入/完成未读建立跨 Provider 最新倒序与最多 200 条的持久化未打开进度，保持通用循环和本地置顶兜底不变；完成 Bridge/Domain/Presentation/Controller/UI 聚焦验证、文档审计与构建后，再进入真实非 Full Access 宿主验收。
33. 以 RAW-150 保留内部 `stopped` 而将全部可见语义统一为“待继续”，不新增 Tab/角标/入口；开放任务级 Codex stopped 归档前实时复核。更新引入：Claude 归档已由第 37 步 D′ 唯一目标静默元数据事务取代原 Deep Link+AX+三重证据方案，项目批量仍仅 Codex completed。
34. 以 RAW-151 抽取单一 waiting-edge reducer，建立与完整库存频率解耦的双向热通路；对 revision/owner/载荷缺口做 1.25 秒单任务有界重订，对已登记 rollout 候选做文件监听和 1 秒 phase-only watchdog，并以 100 轮 P95、两类掉通知、隐藏/跨 Tab/零与极大周期/阻塞 I/O 合同验收。该步曾升级到 `task-state-v7` 并记 host-pending；后续真实 v7 暴露 active-vs-active waiting 仲裁缺陷，现由第 36 步 RAW-153 supersede。
35. 以 RAW-152 将通用前后任务游标与跨 Provider 派发提升到 Preload 进程 owner：全部启用来源库存原子 ready、75ms 最终目标合并、手动/attention 优先、全局最大并发 1、热 `onPluginEnter` 单次消费与 Renderer detach 保留快照；旧 Host 通用循环 fail closed。执行定向竞态/生命周期/兼容测试、类型与 production/uTools 构建，真实 uTools 跨 Codex/Claude 连按保留 host-pending。
36. 以 RAW-153 修复当前 owner 的旧 waiting 被较新 active 清除后又由 snapshot/read-state/refollow 重放的问题：为请求实例与 runtime waiting flag 增加私有单调观测序列，统一 request remove、匹配 `serverRequest/resolved`、active/Turn-started、matching output、用户继续与新 `task_started` 的 waiting-clear 因果屏障；未匹配 resolved 仅有界重订。升级 `task-state-v8`，补当前 owner、旧重放、新 correlation、并发审批、runtime flag、Side Chat/Plan 与 rollout resume 反向测试，执行受影响测试、typecheck、production/uTools build 和镜像/语法门禁。最后正常重载真实 v8 宿主，要求解除最迟 1.25 秒、30 秒及两次 mainHide/refollow 不回跳、同任务新请求可重入；未通过保持 rework 且不提交。
37. 以 RAW-154 落地统一任务内核：扩展 Provider-neutral `CompanionProviderAdapter`，由 `companion-task-actions-v1` 统一分发 inspect/open/archive/close，保留 navigation 对 open 的 75ms 合并而让 archive 仅按 Provider+task single-flight；Controller 只保留一个 verified mutation reducer，归档期间保留卡片，成功精确移除，失败/不确定保留。把 Claude archive 改为版本门禁、唯一私有索引目标、stat/hash 防并发、同目录原子替换与安全回滚的 D′ `isArchived` 事务，日志降为增强证据，普通 open 写前拒绝已归档；精确文件 watcher 与 1 秒候选 watchdog 发布 membership delta。为 Codex 精确 interrupted 增加无 idle 依赖的 terminal watermark，升级 `task-state-v9`；接入进程级 5 秒双调用确认的 `mainHide` 归档入口。执行受影响测试、typecheck、Preload 镜像/语法、production/uTools build 与文档/规则审计；真实 v9 宿主及经用户另行确认的可丢弃 Claude canary 保持独立门禁。
38. 返工同一 RAW-154：把 task-actions/navigation 与 Renderer 分散缓存收敛为 Preload 唯一 `companion-task-kernel-v1`，以 `companion-task-package-v1` 原子发布任务、形式、分组、角标、循环与 capability；全部入口统一提交意图并从最新包重解目标。让 `onPluginEnter` 在 Renderer 未挂载时直接消费，冷状态只走全启用 Provider 的共享 tasks-only 预检，拒绝 partial jump 和 Alt+Tab 重放。新增确定性 Host/Renderer 资产身份与 Main/Float 四端握手，身份不一致 fail closed 为 `reload-required`，严格区分 `artifact-ready` 与 `host-loaded`。完成 Reducer/Kernel/Dispatcher/Bridge/身份聚焦回归、类型、production/uTools build、镜像/语法、文档与错误记忆；真实 uTools 重接入、旧后台进程由用户结束、Float 重开和四端握手继续保持 host gate。
39. 以 RAW-155 把 Kernel/Package 升级到 V2 Provider-lane 时钟，修复 exact interrupted 被 active 壳覆盖、Claude completed-unread 被订阅/异步整包吞并和同代次 phase/unread 互抢；正常 push 走零全量读取快路，完整盘点仅用于冷启动/重连/成员缺口。移除完整校对设置、手动全刷和 Ctrl+R，额度改为最小 1 秒/旧 0→300；所有状态组与循环层内按最近提问倒序。导航首键立即、in-flight 只保留最终尾随、全局并发 1；加入 Float heartbeat/受控重建、交互超时与 allowlist JSONL 诊断。执行影响选择的聚焦测试、typecheck、Preload 镜像/语法、production/uTools build、文档链接审计；真实状态转换、连按、Float 自愈和日志落盘继续作为 host gate。
40. 继续 RAW-155：把 Kernel canonical task 提升为卡片/Tab/项目/分组/角标/动作的单一最终投影；修正 Claude generic session-end 覆盖 completion、原生 unread 恢复 completed、冷 Codex exact interrupted provenance 与新 Codex key 元数据补读。移除所有任务消费者固定数量上限，把 unknown 稳定窗缩为 250ms；归档确认只绑定稳定语义身份并在第二次操作使用最新目标。Claude archive 对写前普通元数据 churn 安全 rebase/单次重试，成功精确移除并自动刷新插件。补状态判定脱敏字段、聚焦回归、typecheck、Canonical/Public mirror、1870-module build/runtime validator、文档和错误记忆；真实 uTools/Claude 状态保留 host gate，Claude 原生侧栏及时收敛已由 Claude RAW-029 判定为当前 `unsupported`，不再作为可执行 host gate。

执行证据见 [verify.md](verify.md#L1)，当前交接见 [handoff.md](handoff.md#L1)。
