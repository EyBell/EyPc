# Codex 任务状态交接

Tool: codex
Date: 2026-08-09
State: `automated-verified / host-pending`

## 当前结论

- RAW-154 本次返工已从 `implementation-rework / host-pending` 收敛回 `automated-verified / host-pending`。旧 20 文件 `550/550` 仍是 D′/v9 基线；新架构的直接证据为 12 个影响文件 `485/485`、typecheck、1870-module production/uTools build、RuntimeIdentity validator、Preload 镜像/语法与 diff gate，其中 Controller 组合用例使用真实 Kernel 验证 Main/Float 同包以及卡片/快捷键同目标，Preload 组合用例验证无 Renderer 时成员变化事件仍会触发 Host 专用重读，Kernel 反向合同禁止从 degraded 包误跳。最终产物身份为 `host-9d4cb1b3a288c5a8bc61 / renderer-30eb78df00c13c1e9eab`；Renderer ID 已纳入其内嵌 Host 契约；真实 uTools 未重接入，当前只能称 `artifact-ready`，不能称 `host-loaded`。
- Preload 现在只有一个 `companion-task-kernel-v1` 任务权威，[companionTaskPackage.ts](../../../../src/domain/companionTaskPackage.ts#L1) 以 `companion-task-package-v1` 同 revision 发布任务形式、状态、分组、三个角标、attention、通用 `cycleKeys` 和能力。`task-state-v9` 仅是 Provider 输入兼容版本；navigation/task-actions 是 Kernel 内部 Dispatcher，不再各自向 Renderer 维护缓存。
- 卡片、待输入/未读、上/下任务、聚焦和归档都提交统一 intent。Preload 的 `onPluginEnter` 可在 Renderer 从未挂载时消费静默入口；冷状态等待全部启用 Provider 的 tasks-only 预检，拒绝 partial jump，Alt+Tab 不会补执行。Main/Float 订阅同一个包，配额、环境、完整库存和非任务未读不阻塞状态包发布。
- 最终宿主门禁固定为：构建 → uTools 开发工具重新接入 `dist/plugin.json` → 用户结束旧插件后台进程并重新进入 → 重开 Float → 核对 Main UI/Main Preload/Float UI/Float Preload 的 Host/Renderer/Kernel/Package 身份完全一致。任何端不一致都会显示 `reload-required` 并停止任务动作；实现不自动结束进程，也不调用私有 uTools API。
- RAW-154 已将当前合同升级为 `task-state-v9` 与 `companion-task-actions-v1`。Renderer 只提交 Provider-neutral 意图，Domain 独占互斥状态/capability，进程 Dispatcher 按 action→Provider 选择 Adapter，Provider 独占副作用，Controller 只通过一个 mutation reducer 接纳已验证结果；旧 Claude AX 归档禁止回退。
- Codex 精确 `interrupted/user-stopped` 在没有未解决 input/approval、也没有因果上更新的新 Turn/active 时立即进入内部 stopped/可见“待继续”，不再等待额外 Desktop idle；待继续不进入进行中分段或三个紧凑角标，仍计入动态总数并允许任务级归档。普通 failed 继续使用保守 idle/not-running 门禁，更新的新 Turn 恢复进行中。
- Claude 归档已改为 D′ 静默事务：仅 macOS App `1.26832.0`、仅正常库存私有索引中的唯一 `local_*.json`、仅 `isArchived=true`，写前复核 phase/stat/hash，写同目录临时文件并原子替换，语义失败安全回滚、并发写不覆盖。成功只要求元数据与活动库存双确认，日志仅增强；不 Deep Link、不 AX/JXA、不写 LevelDB/其它会话。普通 open 会在 Deep Link 前拒绝已归档、缺失或歧义目标。
- 归档期间卡片保留并标记 archiving；archive 只按 Provider+task single-flight，不同任务/Provider 互不阻断。`archived` 精确移除并发布一次，`failed/indeterminate` 保留。Claude App 手动归档和 EyPc 静默归档都由精确文件 watcher 发送 membership delta；旧完整读取不能越过 tombstone 复活，丢 callback 由 1 秒私有索引候选 watchdog 恢复。
- 新 `eypc-companion-archive` 为 `mainHide:true`，外部 action id 仍为 `codex.task.archiveFocused`。优先当前有效聚焦任务，否则用非隐藏 attention 首项；第一次调用只提示并建立 5 秒进程级 identity 确认，第二次完全一致才执行，普通 Renderer remount 不丢确认，任何 key/revision/focus/phase/Provider 变化取消。
- RAW-152 已把通用前后任务的游标和跨来源打开仲裁提升到 Preload 进程级 `companion-navigation-v1`：Codex/Claude 库存全部 settled 后才原子 ready，连续按键每次推进游标但 75ms 只派发最终目标，手动/attention 优先，全部来源共享最大并发 1。热 `onPluginEnter` 直接消费且不再转交 Renderer；普通 mainHide/Renderer dispose 只 detach，显式停用、来源变化、kill/进程退出才失效。
- RAW-153 是 v9 继续保留的 waiting-clear 前置合同：main/Side Chat request 与 runtime waiting flag 都记录私有单调观测序列；request remove、匹配 `serverRequest/resolved`、较新 active/Turn-started、matching output、用户继续和新 `task_started` 共用因果屏障。旧 snapshot/read-state/refollow/sticky shadow/rollout resume 不能复活已解除等待，屏障后的新 correlation 仍立即重入。
- 单卡点击与待输入/未读直达仍按精确匿名 key 打开；Codex stale alias 只按同 key tasks-only 重建一次。旧 Host 没有精确 navigation revision 时，通用循环提示重载并 fail closed，单卡保持兼容。
- RAW-150/151 的待继续/独立热通路继续有效；RAW-154 取代 Claude Deep Link+AX 归档并细化 exact interrupted。项目批量仍只处理 Codex completed。
- 待输入现在是双向独立热通路：请求新增/移除、resolved、matching output、用户继续与新 Turn 共用 waiting-edge reducer；revision/owner/载荷缺口只按任务 `0/50/150/300/600/1000ms` 重订并在 1.25 秒截止，1 秒 phase-only watchdog 只复核登记 rollout 候选。它不受 Tab、悬浮窗可见性或 `taskRefreshSeconds=0/86400` 影响，只由功能+收件箱启用门控。
- 自动回归继续覆盖 100 轮双向切换 P95 <250ms、两类掉通知、阻塞完整读取、Codex stopped/新 Turn、统一 Dispatcher、Claude D′ 成功/幂等/零写门禁/回滚/并发与 membership delta。本轮受影响矩阵为 `20/20` files、`550/550` tests；typecheck、1868-module production/uTools build、runtime validation、canonical/public 镜像、JS/CJS 语法和 `git diff --check` 均通过。
- 真实运行 ASAR 的最近历史读回仍是 v7，它已证明旧 waiting 缺陷存在，但不证明 v9 已加载。真实 v9 状态验收和 Claude canary 尚未执行，故保持 host-pending。
- 完成证据通过后立即从进行中移出，同时清除 active-exit baseline；后续相同完整快照不再反弹。
- 实时增量与完整快照现共用同一个 active-exit 转换器；恢复运行前遗留的相同 interrupted/failed 只能保持 ongoing，不会在 inventory 重建时误入 stopped。
- 非 active 任务首次观测或收到晚到的 Codex 原生 unread=true 时会唤醒一次有界 latest-Turn 复核；相同 true 的后续轮询不重启。若最新 Turn 已完成，完成和未读在同一路径收敛，无需切换任务。
- 无 waiting flag、无精确 `turn-started` 的可疑 active 收到 unread=true 时也只做 `verifyStaleActive` 取证；unread 不直接改变状态。
- 精确或 snapshot 佐证的同 revision completed 不再要求 `completedAt`；confirmed provenance 会保留在会话期 inventory，后续只读快照不会丢失。
- latest-Turn single-flight 在 active/exit/佐证模式变化时由新模式接管；缺失 Turn outcome 即使 idle/not-running 也保持 ongoing，stopped 只接受明确 failed/interrupted。
- Activity Delta 每次发布递增 generation，完整 snapshot 带同一序列屏障；full inventory 保留精确 inProgress 与 confirmed terminal provenance，严格旧增量不能反压。
- mixed-key delta 的已知任务即时应用；missing-key 清单只隔离缺失行，同批现存任务的完成/未读不再被整批冻结。
- 重复相同 active snapshot 复用一个 `[0,300,1000]` 周期；首次/新到达 unread=true 可启动一次，只有任务切换歧义、Activity/映射或模式变化才替换兼容周期。
- Codex read-state 与已确认成功的插件 Host 打开共同构成当前会话未读权威；所有卡片/角标/快捷键仍只走共享打开动作，Electron 成功或 uTools 明确接受派发后立即发布会话期已读，失败/明确拒绝不改状态。旧 EyPc completion receipt 不再参与投影，也不写 Codex 原生状态。
- Activity 来源已区分 connector、initial snapshot 与真实 patch；Turn 来源已区分 inventory、exact、targeted 和 corroborated。active-exit 转换器自身在 delta/full snapshot 两条入口识别 confirmed provenance，同 revision 完成不再因入口差异回到 ongoing。
- 真实 activity patch 可以在旧 completed 元数据仍存在时立即开始新 active 周期；同轮精确 completed 仍立即完成。
- 任务状态语义是 `task-state-v9`；v8/v7/v6/v5/v4/v3/v2/旧 preload 仅标记 degraded，不清空任务。v4 Plan-only、v5 `persisted-decision` 与 v6 状态时间继续兼容，但旧来源缺失 v9 interrupted/统一收敛合同时会提示重载，且不会根据 Access 设置猜测审批。
- `completionPresentationDelayMs` 已从当前设置类型、默认值和规范化输出移除；展示层无独立延迟。
- 新会话 `quota-auto` 已按 RAW-046 收敛：任一实际返回的普通 5 小时/周窗口为 0 都切换最高可用 Spark；缺失窗口不等于 0，普通池读数优先正值 5 小时。
- RAW-071 的旧配色格式/对比度/配对色域/暂态预览/回滚路径已从现行 Runtime 撤掉；测试、PRD、架构、Soul 和错误记忆统一为独立 token 直存直渲。
- MQTT 响应式与 Quick Jump Escape 静态合同已限制在对应 media/function 边界，等价换行或后续无关函数不再制造假失败。
- RAW-130 给真实 Desktop activity patch 与精确 App Server active/Turn-started 分配同一进程内 evidence sequence。旧 idle activity-event 即使因 read-state-only、Side Chat 或 inventory 重放再次经过发布器，也不能撤销更晚的 `app-server-live`；只有真正后到的 Desktop 非 active patch，或精确 terminal/App Server non-active，才能关闭该水位。
- RAW-131 已完成 stale-active reader positive-epoch 屏障、synthetic idle 去除、任意 exact active patch（含 active→active waiting）开新 epoch、missing-row mapping/verified-archive 清理、Side Chat 初始与最终 active-exit 子 Turn/重放、整份 delta + full snapshot generation race 与当时的 stopped archive block 七项实现；状态矩阵继续有效，历史归档结论已由 RAW-150 的写前复核和 allowed capability 更新。
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
- RAW-141 用当前真实 `Needs input` 任务确认了 owner-loss 缺口：原 stream owner 消失后，新 follower 不会获得当前请求快照；App Server latest Turn 只显示 interrupted，只有 sessions rollout 中未匹配的精确 `request_user_input` 仍能证明等待。4 MiB 安全尾读与 sticky shadow 仍保留，但 RAW-145 已证明当时“源码预检 active=1”只覆盖 Preload，不能代表产品 Domain 已接纳。
- RAW-142 把 latest completed Turn 中精确完成的 Plan 视为“待实现”决定：rollout/App Server item 只投影匿名 Plan-only waiting，优先于 unread 与 completed-unread，下一 Turn 开始即解除。Unread 在原生 atom 瞬时不可用或库存对象替换时沿用本 Bridge 最近一次成功解析的原生结果，防止快捷键/刷新路径先闪出错误未读再纠正；精确事件和新原生集合仍可覆盖。
- RAW-143 证明快捷键慢不是项目列表本地判断，而是普通 mainHide 清空 App Server alias/latest-Turn cache 后反复全量重建。普通 `onPluginOut(false)` 现只隐藏窗口并保留热会话；RAW-152 又把 replaceable Renderer 的 Controller `dispose()` 收窄为本地 detach，只有 kill、feature disable、来源变化或真实进程退出才清理对应进程导航状态。Controller 并发 action preflight 只复用真正发布成功的 threads scan，Runner 首次/stale alias 才全量预检；热 task alias 打开新增库存 RPC 为 0。
- RAW-144 进一步把任务物化与 Activity 订阅固定到 Codex 功能启用生命周期，离开页面/隐藏 Float 不再清缓存，额度仍按 surface 门控；Runner catalog 改为每项目增量新增/失效/单飞。已读确认现覆盖 uTools fallback，并用 preload 内部 Turn ID 区分 completion epoch：同一 Turn 的完成时间补全和旧 full snapshot 不会让已读复现，新 Turn 仍会重新进入未读。
- RAW-145 在当前本机真实 Provider 数据上复现了跨层断点：Preload 恢复一条 connector waiting，但生产 Domain 投影为零条待输入；旧预检复制宽松算法而误报成功。v5 现用 `persisted-decision` 明确标记安全 rollout 输入/Plan 决定，贯通库存、Activity 与 Domain，并由精确新 Turn/active/completion 清除；普通 connector waiting 仍拒绝。首个修复后真实匿名预检收敛为 persisted waiting 1、产品 waiting 1；Provider 随后解除决定时最终复跑同步为 0、0，没有 sticky 反弹。
- RAW-146 的置顶优先首条合同保留为历史证据；RAW-149 已取代待输入/完成未读两个专用入口的排序和打开方式。普通列表与通用前后循环仍使用其既有稳定比较器。
- RAW-147 清除正向 follower 公告回声：`following=true` 只描述发送方 follower 状态并直接消费，只有显式 following-status request 才定向重报一次；`following=false` 的 owner 连续性规则保持不变。Bridge 新合同先 RED 后 GREEN且全文件 `81/81`，精确变更快照的 typecheck/production build、当前三份 Preload/运行时门禁与修复后的生产 Domain 真实预检通过；交付产物连接真实 broker 时出站 follow 保持有界。并发 Claude 改动后的当前整树 build 复跑被其测试夹具类型漂移阻断，未纳入本写集。当前运行 uTools 仍为 pre-RAW-147，必须重载后再验收 owner snapshot 与 active→waiting。
- RAW-148 将 Codex Runtime 横幅、诊断表、兼容等待和启动帮助收敛到 `codexEnvironmentPresentation`；任务归属解析移除无效 enablement 参数，任务/项目 marker 均在 Float 行构造时只执行一次；启动路径 set/clear 直接发布 Host 返回快照，不再二次 inspect。RAW-022 与旧 Codex-only 兼容文案的冲突已按“数据/状态/额度兼容、归属标记始终显示”裁定并同步规则、PRD、架构、技术细节与既有错误记忆。
- RAW-149 在私有 Desktop shadow 中精确识别命令执行、文件修改、权限申请、MCP elicitation、普通输入和 Plan 请求，使用请求时间或稳定首次观测时间，并在移除/resolved 后即时重算；公开边界只新增匿名 `waitingSince/statusEnteredAt`。审批与普通输入共同进入待输入，审批不再重复进入进行中。
- 待输入与完成未读现跨 Provider 按状态出现时间倒序；置顶与 Provider 分组不能覆盖。两个专用入口持久化每组最多 200 个匿名状态实例的打开进度，新实例插队、随后续开旧未访问项，全部访问后回绕。Host 成功（含列表手动打开）才推进，失败不推进；任务离组或状态时间变化会清除旧实例。通用循环、本地置顶兜底、会话已读确认与“不代答审批”边界保持不变。
- 提交收口把 stream-follow 回声固定到一个错误记忆主记录，并在 pending-request 依赖记录中加入更新引入；任务、项目状态、架构、技术细节、验证与错误索引已按同一协议语义同步。共享文件只允许暂存 RAW-147 hunks，并发 Claude 重构保持未提交。

## 验证

详细历史与 RAW-150–154 增量合同见 [verify.md](verify.md#L1)。RAW-152/153 历史矩阵继续保留；RAW-154 已完成 `20/20` files、`550/550` tests、typecheck、production/uTools build、Preload 镜像/语法与 runtime validation。真实 v7 只证明旧实现错误；v9 正常重接入和 Claude D′ canary 未执行，没有操作真实归档、审批、Access 或进程。历史脱敏记录见 [RAW-153 uTools 真机验收](../../../knowledge/computer-use/sessions/2026-08-09-raw-153-utools-v8-host.md#L1)。

## 真实宿主验收

以下步骤是剩余的真实宿主验收清单，不构成当前自动化接纳：

1. 正常重载 uTools 插件，确认运行中 preload 与 Renderer 同为 `task-state-v9`；v8 及更旧版本必须显示 degraded/reload 提示。
2. 验收普通 active→completed-unread，卡片、角标和归档能力同批更新。
3. 验收精确 interrupted 且无 pending request 时立即进入“待继续”，更新的新 Turn 再恢复运行并最终进入 completed-unread；普通 failed 继续保守等待 idle/not-running，二者都不依赖任务切换。
4. 在 completed、stopped 和 active 任务间切换，未选中任务的状态不得改变。
5. 让一条曾 interrupted 的后台任务以更新的新 Turn 恢复运行，触发其它任务切换/未读变化和两轮清单刷新，确认它始终保持进行中；随后精确 user-stopped，确认无需额外 Desktop idle 即显示“待继续”且不进入进行中角标。
6. 同时准备普通待输入/待审批、两个 Plan 实施确认和一个近期 active；确认前后任务快捷键只在普通层回绕，普通项解决后只在两个 Plan 间逐项回绕，Plan 全部解决后才进入近期 active。
7. 先制造一条已完成未读，关闭插件后在 Codex 中读取，再重新开启；确认该任务恢复为已完成且已读，不保留旧未读角标。
8. 插件关闭期间分别归档/删除任务、把项目移出库存并新增任务，再重新开启；确认新库存立即替换旧行，普通缺行不会因 `taskRefreshSeconds=0` 永久滞留。
9. 插件关闭期间新增或解除普通待输入、待审批、Plan 确认，并让一个已知 Side Chat 完成、已读或解除等待；重开后父任务与 Codex 当前态一致。完全在中断期创建并结束的未知临时 Side Chat 不应被伪造。
10. 重载新构建后，用一条已完成未读任务分别验证：插件卡片/完成未读角标打开成功后立即转为已读；模拟打开失败时保持未读；随后产生新 Turn 完成时重新进入未读。
11. 完全退出当前 EyPc 页面后，从 uTools 全局入口依次触发待输入、已完成未读、上一个和下一个任务；确认不显示/闪烁主窗口、首次冷启动也能打开正确任务。保留一张旧卡片跨一次插件显隐后再点击，确认只打开同一卡片任务且不会跳到列表首项。
12. 用“查看已完成未读”全局快捷键打开一条未读任务，确认即时转为已读后跨至少两轮 mainHide/refollow/完整校对仍保持已读；随后在同一任务产生并完成新 Turn，确认它重新进入已完成未读。
13. 重载 RAW-141 新构建后确认当前长期 `Needs input` 任务显示“需要输入”；另各准备一条普通输入和一个已规划未实现 Plan，执行普通显隐、全局前后任务快捷键和一次 owner/transport 重连，三者仍按普通输入优先、Plan 次级展示。回答普通输入或确认 Plan 后，状态应由新快照/Turn 自动解除，不保留 sticky 旧等待。
14. 准备一条完成规划但尚未开始实现的 Plan，确认无论是否已读都显示“需要输入”且不进入“已完成未读”；开始新 Turn 后立即解除。连续触发任务刷新和“查看已完成未读”快捷键，确认不存在先闪为未读再回到已读的中间帧。
15. 连续触发待输入、完成未读、上一个/下一个任务及 Runner 快捷键；首次冷启动可有一次预检，随后普通 mainHide 往返应直接打开且无明显全量扫描等待。真实退出/重载后允许重新冷启动一次。
16. 重载 v5 后复验用户截图中的同一 ownerless 任务：Codex 原生 `Needs input` 时 EyPc 必须为“需要输入”；回答后或开始精确新 Turn 时立即解除。再制造一条只有普通 connector waiting hint 的夹具/状态，确认仍保守“进行中”，不得因本修复扩大误报。
17. 准备多条跨 Codex/Claude 的待输入与完成未读任务，确认两个状态组严格按状态出现时间倒序，较旧置顶任务不得压过较新状态；连续入口按尚未打开实例遍历，提示读出“最新优先，连续触发依次打开”。
18. 重载 RAW-147 构建后观察 IPC：正向 follower 公告不得产生回发，控制消息必须保持有界，并至少收到当前 owner 的状态 snapshot；随后让任务从 active 进入普通输入/审批等待，卡片与角标应实时进入待输入而不等待 15 秒完整校对。
19. 在非 Full Access Codex 任务触发一个无落盘、最终拒绝的权限请求，确认命令/文件/权限/MCP 审批进入待输入、最新实例插队、入口打开原任务，拒绝/resolved 后同批从列表和角标消失；EyPc 全程不得代答。
20. 验证 `1→2→3，新 6 到达→6→4→5`、同任务新状态重新未打开、失败不推进、列表手动成功推进、全部访问后回绕，并在 EyPc 正常重载后继续未访问进度。
21. 正常重接入新构建并确认 Renderer/Preload 均报告 `task-state-v9`；分别把完整校对设为 `0` 与 `86400`，在非 Codex Tab 和悬浮窗隐藏时验收进行中→待输入→进行中，正常边不得有可感知库存周期等待，漏通知兜底不超过 1.25 秒。
22. 准备一条精确 interrupted 且无 pending request 的 Codex 任务，确认无需额外 Desktop idle 即只在卡片/动态段显示“待继续”、不进入进行中角标；再开始更新的新 Turn，确认立即恢复进行中。普通 failed 仍需 idle/not-running。经用户确认归档待继续任务时，写前恢复运行必须返回 `state-changed` 且零写入。
23. Claude D′ 真机只在用户另行确认一个可丢弃 completed 会话且实际 App 版本恰为 `1.26832.0` 时执行一次：EyPc 不打开 Claude、不需要辅助功能权限，只修改该唯一 `local_*.json` 的 `isArchived`；确认目标元数据为 true、活动库存和 EyPc 卡片即时移除，非目标文件/LevelDB 不变。Claude 侧栏是否即时刷新只记录观察；`failed/indeterminate` 必须保留卡片。
24. 重载 RAW-152 构建后，先单击一张 Codex 与一张 Claude 卡片确认精确打开；再在两来源均有候选时快速交替触发上一个/下一个，确认每次按键推进后的最终目标正确、只打开一次、无崩溃。至少跨两轮普通 mainHide 往返复测，最后完全退出/重启插件确认只在进程边界冷启动一次。
25. 在 v9 非 Full Access 任务中让真实请求先进入待输入，再由用户在 Codex 原生界面回答或拒绝；EyPc 必须在首个更新周期、最迟 1.25 秒进入进行中。随后触发无关 unread/refollow、浮窗收展和两次 mainHide，持续至少 30 秒不得回跳；同任务产生新请求后必须再次进入待输入。记录仅保留版本、匿名计数与相对时延，EyPc/Agent 不代答。
26. 为 `eypc-companion-archive` 绑定临时全局快捷键：第一次只显示目标和 5 秒确认，不切当前 Tab、不打开 Claude；同一 identity 第二次才执行。改变焦点、revision、phase 或 Provider 后第二次必须重新进入确认；普通 mainHide Renderer remount 不应丢失未过期确认。
