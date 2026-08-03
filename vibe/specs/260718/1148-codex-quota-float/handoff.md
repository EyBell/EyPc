# Codex 任务状态交接

Tool: codex
Date: 2026-08-03
State: `automated-verified / host-pending`

## 当前结论

- 完成证据通过后立即从进行中移出，同时清除 active-exit baseline；后续相同完整快照不再反弹。
- 实时增量与完整快照现共用同一个 active-exit 转换器；恢复运行前遗留的相同 interrupted/failed 只能保持 ongoing，不会在 inventory 重建时误入 stopped。
- 非 active 任务首次观测或收到晚到的 Codex 原生 unread=true 时会唤醒一次有界 latest-Turn 复核；相同 true 的后续轮询不重启。若最新 Turn 已完成，完成和未读在同一路径收敛，无需切换任务。
- 无 waiting flag、无精确 `turn-started` 的可疑 active 收到 unread=true 时也只做 `verifyStaleActive` 取证；unread 不直接改变状态。
- 精确或 snapshot 佐证的同 revision completed 不再要求 `completedAt`；confirmed provenance 会保留在会话期 inventory，后续只读快照不会丢失。
- latest-Turn single-flight 在 active/exit/佐证模式变化时由新模式接管；缺失 Turn outcome 即使 idle/not-running 也保持 ongoing，stopped 只接受明确 failed/interrupted。
- Activity Delta 每次发布递增 generation，完整 snapshot 带同一序列屏障；full inventory 保留精确 inProgress 与 confirmed terminal provenance，严格旧增量不能反压。
- mixed-key delta 的已知任务即时应用；missing-key 清单只隔离缺失行，同批现存任务的完成/未读不再被整批冻结。
- 重复相同 active snapshot 复用一个 `[0,300,1000]` 周期；首次/新到达 unread=true 可启动一次，只有任务切换歧义、Activity/映射或模式变化才替换兼容周期。
- Codex read-state 与已确认成功的插件 Host 打开共同构成当前会话未读权威；所有卡片/角标/快捷键仍只走共享打开动作，成功后立即发布会话期已读，失败或仅派发不改状态。旧 EyPc completion receipt 不再参与投影，也不写 Codex 原生状态。
- Activity 来源已区分 connector、initial snapshot 与真实 patch；Turn 来源已区分 inventory、exact、targeted 和 corroborated。active-exit 转换器自身在 delta/full snapshot 两条入口识别 confirmed provenance，同 revision 完成不再因入口差异回到 ongoing。
- 真实 activity patch 可以在旧 completed 元数据仍存在时立即开始新 active 周期；同轮精确 completed 仍立即完成。
- 任务状态语义是 `task-state-v4`；v3/v2/旧 preload 仅标记 degraded，不清空任务，缺失 Plan 分类时保守归入普通输入层。
- `completionPresentationDelayMs` 已从当前设置类型、默认值和规范化输出移除；展示层无独立延迟。
- 新会话 `quota-auto` 已按 RAW-046 收敛：任一实际返回的普通 5 小时/周窗口为 0 都切换最高可用 Spark；缺失窗口不等于 0，普通池读数优先正值 5 小时。
- RAW-071 的旧配色格式/对比度/配对色域/暂态预览/回滚路径已从现行 Runtime 撤掉；测试、PRD、架构、Soul 和错误记忆统一为独立 token 直存直渲。
- MQTT 响应式与 Quick Jump Escape 静态合同已限制在对应 media/function 边界，等价换行或后续无关函数不再制造假失败。
- RAW-130 给真实 Desktop activity patch 与精确 App Server active/Turn-started 分配同一进程内 evidence sequence。旧 idle activity-event 即使因 read-state-only、Side Chat 或 inventory 重放再次经过发布器，也不能撤销更晚的 `app-server-live`；只有真正后到的 Desktop 非 active patch，或精确 terminal/App Server non-active，才能关闭该水位。
- RAW-131 已完成 stale-active reader positive-epoch 屏障、synthetic idle 去除、任意 exact active patch（含 active→active waiting）开新 epoch、missing-row mapping/verified-archive 清理、Side Chat 初始与最终 active-exit 子 Turn/重放、整份 delta + full snapshot generation race 与 stopped archive 七项实现；闭合矩阵已自动化验证，真实宿主仍待验收。
- RAW-132 在不放宽上述七项门禁的前提下，把 main/Side Chat 父任务聚合收敛为纯解析器；单个 child 的 terminal 读回在其它分支仍 exact active 时只延后该分支并保持父任务 `active/inProgress`。五项会话期匿名裁决计数通过同一 generation 屏障进入设置页“状态裁决”，不含任务身份或内容；Domain/Bridge/Controller 反向合同已执行通过。
- RAW-133 把诊断 key、规范化和相等判断收敛到 Domain，Controller 在既有 source/generation 屏障后接纳整包且 diagnostics-only 变化只通知一次。运行页常驻值压缩为“保护合计 · 周期”，明细只在原生帮助按钮 hover/focus 时展示，内部计数不进入 `aria-live`；同页旧 `span role=button` 已统一清理。父聚合表直接执行生产纯解析器，避免测试复制状态算法；合同已执行通过。
- RAW-134 把悬浮卡 `动态` Tab 的固定 6 小时过滤改为任务配置页可编辑的 `dynamicTaskWindowHours`，默认 24 小时、范围 1–8760。Domain 原子包、进行中角标、前后任务循环与下一时间边界共用该值；Controller 在设置保存后立即重投影，不等待 Provider 校对。测试合同已执行通过。
- RAW-135 把额度刷新改为 `quotaRefreshSeconds`（默认 300、0–86400、0 仅手动），旧分钟字段按 ×60 迁移；把 `taskRefreshSeconds` 从固定枚举改为默认 15、0–86400 的自由整数秒。两条 Controller deadline 独立调度，设置保存后立即按新周期读一次。
- App Server `turn/completed` 只有 thread identity 时不再被 exact-positive 水位挡回全量库存；Preload 为 main/Side Chat 使用 completion-event 单飞，立即读取并按 25/75/150/300/600/1000ms 密集复核。任何更新的 active/Turn-started/等待 epoch 取消旧读，耗尽才 urgent 全量校对；四个相关测试文件 `165/165`、typecheck、production build 与 uTools runtime validation 已通过，真实宿主时延仍待验收。
- RAW-136 只把精确 Plan 实施确认降为 `planImplementationOnly` 布尔值；普通输入/审批与 Plan 混合时父任务标记为 false，请求清除显式发布 false，`readStateOnly` 不修改它。前后任务命令现在只循环第一个非空层：普通输入/近期审批、Plan、近期非审批 active；层切换后游标按方向从首/末项重新开始，三层为空才用非停止 EyPc 本地置顶回退。相关 Bridge/Domain/Controller/平台回归 `151/151`、typecheck、production build 与 uTools runtime validation 已通过；真实快捷键顺序仍待验收。
- RAW-137 关闭了插件中断后的库存与会话基线重建缺口；其最初的 unread 对称仲裁已由下一条 RAW-138 按真实宿主证据细化。Controller 停用时清空任务/项目库存、来源、Activity generation、退出基线和循环游标等 Codex 派生基线，启用后以新 runtime generation 立即执行额度、配置、库存和 latest-Turn bootstrap，旧会话异步结果不得回写。missing-key 首次缺行立即复核，达到连续确认但隔离窗未到时会按剩余时间自唤醒，即使 `taskRefreshSeconds=0` 也能闭合。已知 Side Chat 只在 preload 会话内保留最多 1,000 条 child/parent 关系提示，重连后重新 follow 并对非活动 child 做有界 latest-Turn 校对；状态不保存、不落盘、不进入 Renderer，完全在中断期创建并结束的未知临时 child 仍不可恢复。
- RAW-138 根据真实宿主复验细化了 unread 冲突：当前 Codex read-state 广播发生在插件重载前，App Server 不补发，而原生集合仍保留 stale true；因此 refollow 的当前 false 必须能清除它，同时 persisted false 仍压住 snapshot true。所有插件任务 Deep Link 只有成功打开后才写入会话期 false 并即时发匿名 `readStateOnly`，parent 与已知 Side Chat 同步收敛；失败不改状态，Desktop IPC 不可用时确认仍在本 preload 会话有效，新 completion 会清理该 false。没有 legacy receipt、公开字段或 Codex 原生写入。
- RAW-139 复核发现当前机器同时缓存多个 EyPc ASAR，悬浮窗最初仍运行 1.2.6，激活后才切到与源码/镜像一致的 1.2.33；正确实例的真实卡片点击已精确打开预期任务并把插件未读数 2→1。独立代码缺陷是 Codex `mainHide` 入口在同步 dispatch 后又由 Renderer 二次 hide，以及停用清空库存后快捷命令在 bootstrap 前读取空投影。现由 `mainHide` 独占可见性，空库存命令串行等待 tasks-only preflight；卡片 alias 跨生命周期时只按同一 task key 重建，Host 明确拒绝旧 alias 时至多重试一次，不会跳到其它任务。
- RAW-140 复现了完成未读快捷键成功打开后的状态反弹：普通 `mainHide → onPluginOut(false)` 会关闭并重建 Desktop/App Server Bridge，旧确认只在 Bridge `liveUnread` 内，因此 refollow 后被原生 stale true 回灌。确认现为 preload 进程内最多 1000 条的 completion-epoch 提示，跨普通 close/reset/resubscribe/refollow 保留；同 completion 重放不反压，新 Turn 或明确移除才释放。Bridge `70/70`、五文件聚焦 `144/144` 与 typecheck 已通过。
- RAW-141 用当前真实 `Needs input` 任务确认了新的 owner-loss 缺口：原 stream owner 消失后，新 follower 不会获得当前请求快照；App Server latest Turn 只显示 interrupted，只有 sessions rollout 中未匹配的精确 `request_user_input` 仍能证明等待。Preload 现以 4 MiB 安全尾读恢复该 input；已观察输入/审批/Plan 在软中断后保留 sticky shadow，普通 active 降级，新快照/Turn/库存 revision 清理；普通 pluginOut 保留 Desktop observer，kill/显式停用完全关闭。真实源码预检已显示 `active=1`，新构建 uTools 展示仍待重载。

## 验证

详细命令、七项修复、闭合矩阵与 RAW-132–141 增量合同见 [verify.md](verify.md#L1)。RAW-141 Bridge/Controller/Domain/Presentation 聚焦回归 `170/170`；当前完整工作树 `pnpm run verify` 通过 `737/737`（`57/57` 文件），排除其它未提交改动后的 Git index 独立副本通过 `711/711`（`54/54` 文件）、typecheck、production build、runtime preparation 与 uTools validation；preload 语法和真实源码预检也通过。真实宿主已确认源码能把当前 ownerless `Needs input` 恢复为待输入，但 RAW-139–141 新构建尚未重载，冷启动快捷键、跨 mainHide 持续已读、alias 恢复、普通输入/Plan 与 ownerless 等待展示仍为 host-pending。

## 真实宿主验收

以下步骤是剩余的真实宿主验收清单，不构成当前自动化接纳：

1. 正常重载 uTools 插件，确认运行中 preload 与 Renderer 同为 v4。
2. 验收普通 active→completed-unread，卡片、角标和归档能力同批更新。
3. 验收 interrupted/failed 后恢复运行再 completed-unread，不得经过 stopped，也不依赖任务切换。
4. 在 completed、stopped 和 active 任务间切换，未选中任务的状态不得改变。
5. 让一条曾 interrupted 的后台任务恢复运行，触发其它任务切换/未读变化和两轮清单刷新，确认它始终保持进行中；随后真实停止，确认后到 idle 才进入已停止。
6. 同时准备普通待输入/待审批、两个 Plan 实施确认和一个近期 active；确认前后任务快捷键只在普通层回绕，普通项解决后只在两个 Plan 间逐项回绕，Plan 全部解决后才进入近期 active。
7. 先制造一条已完成未读，关闭插件后在 Codex 中读取，再重新开启；确认该任务恢复为已完成且已读，不保留旧未读角标。
8. 插件关闭期间分别归档/删除任务、把项目移出库存并新增任务，再重新开启；确认新库存立即替换旧行，普通缺行不会因 `taskRefreshSeconds=0` 永久滞留。
9. 插件关闭期间新增或解除普通待输入、待审批、Plan 确认，并让一个已知 Side Chat 完成、已读或解除等待；重开后父任务与 Codex 当前态一致。完全在中断期创建并结束的未知临时 Side Chat 不应被伪造。
10. 重载新构建后，用一条已完成未读任务分别验证：插件卡片/完成未读角标打开成功后立即转为已读；模拟打开失败时保持未读；随后产生新 Turn 完成时重新进入未读。
11. 完全退出当前 EyPc 页面后，从 uTools 全局入口依次触发待输入、已完成未读、上一个和下一个任务；确认不显示/闪烁主窗口、首次冷启动也能打开正确任务。保留一张旧卡片跨一次插件显隐后再点击，确认只打开同一卡片任务且不会跳到列表首项。
12. 用“查看已完成未读”全局快捷键打开一条未读任务，确认即时转为已读后跨至少两轮 mainHide/refollow/完整校对仍保持已读；随后在同一任务产生并完成新 Turn，确认它重新进入已完成未读。
13. 重载 RAW-141 新构建后确认当前长期 `Needs input` 任务显示“需要输入”；另各准备一条普通输入和一个已规划未实现 Plan，执行普通显隐、全局前后任务快捷键和一次 owner/transport 重连，三者仍按普通输入优先、Plan 次级展示。回答普通输入或确认 Plan 后，状态应由新快照/Turn 自动解除，不保留 sticky 旧等待。
