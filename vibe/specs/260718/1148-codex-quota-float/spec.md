# Codex Companion 当前规范

Tool: codex
Date: 2026-08-09
Status: `automated-verified / host-pending`
Documentation level: `controlled`
Requirement version: `2026-08-09.1`

Raw source: [raw-requirement.md](raw-requirement.md#L1)

Canonical target: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L1)

Documentation sync group: `dsg:eypc:WU-CODEX-DESKTOP-LIVE-AUTHORITY`

## 第一性目标

Codex 任务的卡片、分组、角标和归档能力必须在同一份 Controller 原子包中反映真实状态。已接受的完成立即发布且不得反弹；真实新活动立即恢复 active；证据不足时才保守 ongoing。

## RAW-131 实现结果与接纳门禁

- RAW-131 已实现 stale-active 定向读取 positive-epoch 屏障、synthetic idle 去除、任意 exact active activity patch（含 active→active waiting）开启新 epoch、缺行会话映射、Side Chat 子 Turn/重放、双向 generation barrier 和当时的 stopped `blocked-stopped` 七项修复，并写入对应 Bridge/Controller/Domain/UI 合同；其中归档结论已由 RAW-150 更新。
- `initial-snapshot active + interrupted/failed` 是互相冲突的证据，只能保守 ongoing；不得通过内部 suppression 伪造 `desktop-live idle` 以满足 stopped。
- `verifyStaleActive` 只能处理未被后续真实 activity/精确 App Server positive evidence 更新的 initial snapshot；read-state、任务切换或定向读取不得撤销更新的 positive epoch。
- 任意 exact activity patch 只要结果仍为 active 就高于旧 completed presentation并开启新 epoch；waiting request 还必须立即进入待输入，即使 runtime 在 patch 前后都为 active。
- Controller 必须双向执行 Activity generation 屏障；Preload/Controller 的 missing-row 保留边界必须一致；Side Chat 必须按 child evidence 重放并拥有回归合同。
- 更新引入（RAW-150）：RAW-131 的 stopped 禁止归档只保留为历史防误写背景。当前显式 stopped 在 Presentation 显示“待继续”，任务级归档能力为 allowed，但 Host 必须写前重读并确认最新 Turn 仍为 failed/interrupted 且实时停止边界仍成立；状态恢复统一返回 `state-changed`。七项状态仲裁仍有效，归档能力由新边界取代。

## RAW-132 回归安全优化

- 父任务 Activity 聚合由一个纯解析器统一计算 main、Side Chat、等待标记、system error 与 App Server live 的优先级；发布器不得再维护第二套状态分支。
- child latest-Turn 是分支级证据。某个 child 返回 completed/failed/interrupted 时，只要 main、其它 child 或不可归属到该 child 的 exact App Server live 仍活跃，父任务必须重新保持 `active/inProgress`，不得被该 child 的异步终态读回改成 completed/stopped。
- 优化不得放宽 RAW-131 的状态反向合同：更新 positive epoch 拒绝旧 Turn 读回；冲突 active+terminal 保持 ongoing；missing row 保留匿名映射；旧 delta/full snapshot 不跨 generation。Stopped 归档改由 RAW-150 的写前复核单独约束，不再沿用旧禁止结论。
- Preload 只输出五个会话期匿名裁决计数，Controller 只在 source fingerprint 匹配且 generation 未回退时接纳，设置页“状态裁决”只显示聚合数字。诊断中不得出现 raw/anonymous task key、会话 ID、正文、路径或时间线内容。
- Domain 状态模型表、Bridge 多分支终态竞争合同、Controller 旧代次诊断回退合同均已执行通过；真实宿主仍待验收。

## RAW-133 统一诊断投影

- [codex.ts](../../../../src/domain/codex.ts#L1) 是五项诊断 key、非负安全整数规范化和等值比较的唯一权威；Controller 与 Renderer 不复制字段清单或边界规则。
- [codexController.ts](../../../../src/runtime/codexController.ts#L1) 只能在同源 fingerprint 与非回退 generation 通过后接纳整份诊断包。仅诊断变化时恰好通知一次；相同包、旧代次或不匹配来源均不刷新视图。
- [CodexPage.vue](../../../../src/pages/CodexPage.vue#L1) 常驻短摘要只显示保护合计与周期数，五项明细由原生信息按钮按 hover/focus 展示；`aria-live` 只包围连接诊断标题，不包围内部累计计数。所有同页信息提示统一为原生按钮，不保留 `span role=button` 分支。
- 父聚合优先级测试调用真实生产纯解析器，不复制另一份状态算法；Controller/UI 合同覆盖 diagnostics-only 通知、malformed 输入和可访问性结构，并已执行通过。

## RAW-134 动态时间筛选配置

- `CodexSettings.dynamicTaskWindowHours` 是悬浮卡片 `动态` Tab 的唯一持久化时间筛选，默认 `24`，旧存量缺字段自动迁移为默认值；输入按整小时规范化到 `1–8760`。完整任务库存仍由独立的 `timeWindowDays` 控制。
- [codexPresentation.ts](../../../../src/domain/codexPresentation.ts#L1) 使用该小时数一次生成动态五分组、进行中角标、前后任务 active 候选和 `nextTransitionAt`；Renderer 不再也不得拥有第二套时间过滤。
- [codexController.ts](../../../../src/runtime/codexController.ts#L1) 在任务快照发布与设置变更时都传入当前小时数。修改配置立即重建现有原子包并复用同一调度器，不等待完整任务校对、不请求 Provider、不新增 timer。
- [CodexPage.vue](../../../../src/pages/CodexPage.vue#L1) 的 `任务` 配置面板新增 `动态时间筛选（小时）` 数字输入，并区分完整库存天数与悬浮卡动态小时数。用户帮助同步默认值和前后任务循环的共享范围。
- 现有 Domain、Controller、UI 合同补充默认值/边界、可配置筛选/下一边界和设置即时重投影；测试、typecheck 与 production build 已通过，截图和真实 uTools 验收仍待执行。

## RAW-135 秒级刷新配置与完成事件快路

- `CodexSettings.quotaRefreshSeconds` 是唯一当前额度自动刷新周期，默认 `300`、整数范围 `0–86400`，`0` 表示仅手动。旧存量只含 `quotaRefreshMinutes` 时按分钟乘 60 迁移；新字段存在时优先并在正常保存后淘汰旧字段。
- `CodexSettings.taskRefreshSeconds` 从固定枚举放宽为默认 `15`、整数范围 `0–86400`，`0` 表示仅手动。它继续只调度完整库存校对、缺行确认和漏事件恢复；精确 started/completed、待输入和其它已知正向事件不得等待该周期。
- [CodexPage.vue](../../../../src/pages/CodexPage.vue#L1) 在“运行”页用数字输入编辑额度刷新秒数，在“任务”页用数字输入编辑完整校对秒数；两者沿用现有控件语言、整数 step 与明确的 `0=仅手动` 说明，不新增页面或提交层。
- [codexController.ts](../../../../src/runtime/codexController.ts#L1) 直接按秒换算两条独立 deadline；任一周期变化仍立即做一次当前读并从新水位重新调度。额度与任务 lanes 保持独立，设置变更不启动服务或写 Codex 原生状态。
- [preload/index.js](../../../../preload/index.js#L1) 对已知 main/Side Chat 的精确 `turn/completed` 无 Turn 载荷事件使用 completion-event 单飞模式：立即读取最新 Turn，再按 `25/75/150/300/600/1000ms` 密集复核，同一总 deadline 仍为 3 秒。确认 completed 后只发布匿名 revision 与 `turn-completed` evidence；更新的 active/Turn-started/等待 epoch 会取消旧结果，非 completed、超时或读取失败只触发 urgent 完整校对。
- [public/preload.js](../../../../public/preload.js#L1) 由 canonical preload 同步，不能维护第二套等待表。自动合同覆盖旧分钟迁移、两项自由秒数边界、2/3 秒独立调度、设置页输入、无载荷完成立即命中与首次 stale 后 25ms 再读；四个相关测试文件 `165/165`、typecheck、production build 与 uTools runtime validation 已通过，真实 uTools 中 1–2 秒体感是否消除仍是独立宿主验收门禁。

## RAW-136 快捷键独占优先级循环

- Desktop bridge 仅在未决请求中存在精确 `item/plan/requestImplementation`，且同一父任务不存在其它普通输入/审批请求时，投影 `planImplementationOnly=true`。该布尔值不携带 request 方法、正文或身份，不持久化；通用 `waitingOnUserInput` 继续承担原有状态与角标语义。
- 该字段随 Host Snapshot V2 与 Activity Delta V2 进入 Domain/Controller；read-state-only 增量不得修改它，请求移除或来源降级必须显式清零。父任务和 Side Chat 聚合只在全部可操作等待都属于 Plan 时保留 `true`。
- `task-state-v4` 标识新增的 Plan 等待分类。缺失、v3 或未来修订仍按既有 degraded 兼容发布可用任务状态；未知来源把等待任务保守归入普通输入层，不清空任务，也不自动重启 uTools。
- Controller 依次选择第一个非空独占层：普通 `waiting-input / waiting-approval`、Plan-only `waiting-input`、既有配置时间窗内最近活跃任务；前三层均空时才使用非停止 EyPc 本地置顶回退。层内继续沿用 pinned-first/稳定显示顺序、去重、方向与首尾回绕；当前游标不在新层时，“下一个”从首项开始，“上一个”从末项开始。
- 完成未读继续由专属动作打开；前后任务命令不确认未读、不改隐藏/Tab、不写原生状态、不读取宿主快捷键绑定。自动合同覆盖精确 Plan 标记/清除与隐私、Domain 传递、普通等待阻断 Plan、普通等待解决后 Plan 独占循环、Plan 清空后最近活跃回退及 v4 平台修订。

## RAW-137 中断恢复闭环

- App Server 不拥有 Codex read-state，也不补发插件关闭期间的已读事件。RAW-137 当时先把重连规则收敛为 exact → native set → snapshot；真实宿主复验随后证明这仍不足，现行精确顺序由下方 RAW-138 取代。main 与 Side Chat 父聚合始终调用同一 unread 解析器。
- Controller 离开运行态或关闭任务收件箱时，必须清空任务/项目库存、source fingerprint/计数、Activity generation、active-exit baseline、缺行候选、任务循环游标和读取水位；EyPc 设置、别名、本地置顶、隐藏、折叠与 receipts 保留。重新启用建立新运行代次并立即 bootstrap 额度/config 与完整库存/latest Turn；旧代次 quota/task/activity/readiness 异步结果不得回写或清理新代次。
- missing-key 首次观察仍走 200ms 结构复核；第二次确认若尚未满足 `max(3s, taskRefreshSeconds)` 隔离窗，必须按剩余时间自动再读一次。`taskRefreshSeconds=0` 只关闭普通周期，不得关闭正在进行的缺行确认。
- 已观察 Side Chat 的 child→parent 关系可在 preload 进程内保留最多 1000 条拓扑提示，桥恢复后仅对仍在完整库存中的父任务重订 child；恢复出的非活动 child 复用现有 3 秒有界 latest-Turn 读取。提示不保存 activity/unread/request、不得落盘或进入 Renderer；父任务/child 明确归档或父任务离库后删除。完全在中断期间创建并结束、从未观察过的 ephemeral child 没有持久化来源，保持不可恢复而不伪造状态。
- 不增加公开字段、Renderer 判断、持久化 schema 或 native 写入，`task-state-v4` 保持当前版本。自动合同覆盖 unread 双向权威、精确事件、原生不可用回退、Side 聚合、运行/request refollow、桥关闭重开与 Desktop socket 存活时的 App Server-only 库存重建、旧异步隔离、关闭期间库存增删/项目离库/保留任务归属与原生置顶变化，以及零周期缺行闭合。

## RAW-138 已读重放与成功打开确认

- 当前宿主只读核验确认运行插件已经包含 RAW-137，当前 Codex IPC 协议与插件的 v11/v2 合同一致；精确已读广播发生在插件新进程启动之前，App Server 不补发该事件，原生 unread 集合仍保留旧 `true`。因此当前 refollow snapshot 的 `false` 被 persisted-first 仲裁反压，而不是旧插件包或当前协议字段丢失。
- unread 冲突顺序细化为：当前会话精确 read-state event 与成功 Deep Link 打开产生的会话期确认最高；initial/refollow snapshot 的明确 `false` 可清除遗漏事件留下的 persisted `true`；当前可解析原生集合的成员和非成员继续覆盖 snapshot `true`；原生来源不可用时才回退 snapshot/上一持久化值。main 与 Side Chat 继续复用同一个解析器。
- 所有插件任务打开入口共享 [preload/index.js](../../../../preload/index.js#L1) 的 Host open 路径。仅 `openExternal` 成功后，parent 与已观察的 Side Chat 关系才写入会话期精确 `false` 并发布匿名 `readStateOnly`；打开失败或仅无法确认的派发不改 unread。Desktop IPC 不可用时，该成功打开确认在当前 preload 会话内仍有效。
- 精确/定向 completion 继续调用统一清理器删除完成前 snapshot/open false，因此较新的 Turn 完成后可由 exact/native true 重新进入 completed-unread。成功打开确认不落盘、不写 Codex 原生状态、不恢复 legacy completion receipt，也不增加 Renderer/API/schema 字段。
- 当前 revisioned v11/v2 协议保持主路径并继续拒绝其它未知版本；本机另有已核验的旧编辑器 v6/v1 同形 payload，Preload 只为这两个明确版本做有界适配。Bridge `67/67`、Bridge+Controller `116/116` 与完整 `pnpm run verify` 的 `722/722`（`57/57` 文件）已通过；新构建尚未重载进真实 uTools。

## RAW-139 冷启动任务入口与精确打开恢复

- `eypc-codex-toggle / activate / input / completed-unread / task-previous / task-next` 均已在 `plugin.json` 声明 `mainHide:true`。Feature route 必须保持当前 Tab、标记 `visibilityOwner=mainHide`，Renderer 不得在 dispatch 后再次调用 hide，也不得为已启用 toggle 反向 show 主窗口。
- Controller 停用清空派生库存是正确生命周期边界；由 uTools 全局入口触发的待输入、完成未读和前后任务动作若在该边界后看到空库存，必须把动作接纳并串行等待一次仅含 tasks 的 action preflight，然后从恢复后的同一权威投影执行原有候选排序。preflight 不读取额度/config，不开启第二套任务缓存。
- 卡片点击携带的 key/alias 若跨 Controller 生命周期已失配，Controller 先做同一 tasks-only preflight，只按匿名 task key 解析当前 alias；Host 明确返回 `expired-alias / invalid-alias / stale-alias` 时刷新并仅对同一 key 重试一次。缺少该 key、第二次失败或宿主不确认打开时保留失败，不得回退其它行。
- 最终 Host open 成功继续触发 RAW-138 的会话期已读确认；route/preflight/alias 恢复均不写 Codex 原生 unread、不持久化 task/alias、不新增 Renderer 协议字段。
- uTools 多 ASAR 缓存不等于当前窗口已切到新 preload；验收必须先核对悬浮窗实际 URL/运行版本。已观察到旧 `1.2.6` 窗口在插件激活后切到 `1.2.33`，正确实例的真实卡片点击精确打开目标且未读计数 2→1。聚焦 `141/141` 与完整 verify `730/730` 已通过；RAW-139 新 route/preflight 构建仍需重载后复验。

## RAW-140 mainHide 已读确认连续性

- `eypc-codex-completed-unread` 快捷键成功打开任务后产生的已读确认属于当前 preload 进程，而不是某一个 Desktop Bridge 连接。普通 `onPluginOut(false)` 热隐藏，以及显式连接关闭、IPC reset、revision resubscribe、App Server/Bridge 重建与 refollow 均不得丢失该确认。
- Preload 最多保留 1000 条 parent/child 关联的成功打开确认，只保存 raw identity 与当时 latest-Turn revision，用于同进程内仲裁；不落盘、不进入 Renderer、日志或公开协议。进程真正结束后自然消失。
- 对该已确认 completion，重放 snapshot、仍为成员的原生 unread 集合和晚到的同 epoch unread true 均不得把它恢复成未读。RAW-140 当时以 completed revision 变化作为释放线索；该口径已由 RAW-144 收紧为具体 Turn 身份：同一 Turn 仅补全 `completedAt` 不释放，只有新 Turn/新 active epoch 或明确归档删除才释放 parent/相关 child 确认。
- 卡片、完成未读角标和全局快捷键仍共享 RAW-138/139 的成功 Host open 边界；失败、仅 dispatched 或错误 alias 不创建确认。`task-state-v4`、Controller/Renderer 判断、Codex 原生文件和 legacy receipt 均不变化。

## RAW-141 owner 中断后的待输入连续性

- 精确 Desktop `conversationState.requests` 仍是普通输入、审批和 `item/plan/requestImplementation` 的最高权威；但当前 owner 已消失时，新 follower 不能假定 Desktop 会向它重放快照。`following=true` 只证明订阅已登记，不证明当前请求已恢复。
- 对 App Server latest Turn 为 `interrupted / failed / inProgress` 的库存行，Preload 可读取该行 `path` 指向的 rollout 作为唯一持久回退。路径必须经 realpath 验证位于 `CODEX_HOME/sessions`，只读普通文件，单次最多读取尾部 4 MiB；解析器只保留 `response_item` 类型、精确 `request_user_input` 名称、最长 200 字符 call ID、匹配的 `function_call_output` 与后续 user-message 边界，不解析或发布 prompt、答案、路径和 raw identity。
- rollout 中仍有未匹配的精确 `request_user_input` 时，RAW-141 先把库存投影为 connector-backed `active + waitingOnUserInput`；该来源缺口已由 RAW-145 收紧为 `persisted-decision`。匹配 output、后续 user message、新 exact Desktop snapshot、App Server active/new Turn/completion、库存 Turn/outcome/updated revision 或明确归档/移除均结束旧回退。普通 connector active 仍不得成为 input 权威，未知 function call 不得伪造等待。
- 已观察到的普通输入、审批和 Plan 请求 shadow 可在 owner/transport 丢失后保留于当前 preload 会话；普通无等待 active 必须降回 connector。自 RAW-143 起普通 `onPluginOut(false)` 同时保留 App Server 热会话与 Desktop observer；RAW-152 进一步规定 replaceable Renderer 的 Controller `dispose()` 只解除本地订阅与 Host lease，不关闭 Provider。feature disable、`onPluginOut(true)` 或进程结束才完全关闭。新快照/新 Turn 清除 sticky shadow；不新增持久化、公开字段、Renderer 判断或 Codex 原生写入，`task-state-v4` 不变。
- 当前真实宿主中唯一原生 `Needs input` 任务已由 `notLoaded + interrupted` 恢复为 `active + waitingOnUserInput`；只读预检计为一条权威 active。普通输入与 Plan 的既有精确映射继续由回归合同保护；聚焦 `170/170`、完整工作树 `737/737` 与独立暂存提交 `711/711`、typecheck、build/runtime validation 已通过，新构建实际卡片/快捷键展示仍需重载验收。

## RAW-142 已完成 Plan 待实现与未读稳定化

- latest Turn 为 `completed` 且对应 rollout 最新 Turn 包含精确 `event_msg.item_completed`、`item.type=Plan` 时，该任务仍是等待用户决定是否实施：必须投影为 `active + waitingOnUserInput + planImplementationOnly`，优先于 completed/completed-unread，完全不读取 unread 作为 Plan 判定条件。后续 `task_started`、精确 active/new Turn 或实现开始清除该等待。
- rollout 只允许 sessions realpath 内普通文件，按 `256 KiB / 1 MiB / 4 MiB` 渐进尾读；解析器只读取 Turn 边界和 Plan item 类型，不发布正文、路径或 raw identity。实时 App Server 精确 Plan item 与 completion 使用相同匿名投影；普通 connector active/普通 connector waiting 仍不扩权。
- 原生 unread 文件瞬时不可用时，当前 Desktop Bridge 必须沿用最近一次成功解析的成员/非成员，且该证据跨一次完整库存对象替换保留；精确 read-state、成功打开确认、refollow false 或下一次成功原生读取仍按既有权威顺序立即覆盖。不得先发布错误 completed-unread 帧再纠正，也不在 Renderer 增加时间 debounce。
- 本增量只执行影响项验证：Plan/unread Bridge 与 Domain 合同、两个 Controller 投影合同、preload 语法、typecheck、main preload 镜像和同步 IPC 静态检查。完整 verify/build 与真实 uTools 重载不属于本轮自动门禁。

## RAW-143 mainHide 快捷键热缓存连续性

- `onPluginOut(false)` 只是 uTools 后台隐藏，不得关闭 App Server 或清空 task/project alias、latest-Turn 与 Activity session cache；RAW-152 后 Renderer Controller `dispose()` 同样只 detach。feature disable、`onPluginOut(true)` 和真实进程退出仍是完整清理边界。
- 待输入、完成未读与前后任务命令在 Controller 已有任务扫描进行时，只能复用一次真正发布成功且覆盖 threads 的 single-flight；额度-only、被取消或未发布的读取不能冒充任务预检。已验证的空库存也是可复用缓存，不能因 `lastThreads.length === 0` 重复全扫。
- Action Runner/五槽首次无 verified inventory 时执行一次 tasks-only preflight；之后先用当前 project alias 读取 Environment，只有 Host 明确返回 stale alias 才重建一次库存。执行前 Host 仍按 source fingerprint、target identity 与文件指纹 fail-closed，不以缓存替代安全校验。
- 热任务 alias 打开不得新增 `thread/list` 或 `thread/turns/list`；并发过期 alias 最多共享一次全量任务预检。验证只覆盖相关 Controller/Bridge/Action lifecycle 文件、类型、preload 语法/镜像与 diff，不运行完整仓库门禁或真实宿主。

## RAW-144 功能生命周期增量缓存与 Turn 绑定已读确认

- Codex 功能启用期间，Controller 的任务/项目物化库存、Activity 订阅、source/generation 水位与任务 alias 必须持续保持并接纳增量；主窗口 Tab、Float 可见性和普通 `mainHide` 都不是清缓存边界。额度/config 仍只在 Codex 页面或 Float 活跃时轮询。feature/inbox disable、显式 dispose、kill 或进程结束仍完整清理并隔离旧异步结果。
- Action Runner catalog 按 project key + 当前 action alias 分片缓存并 per-project single-flight。已验证库存新增项目只读取新项目，alias 变化只失效/重载对应项目，移除项目立即删除缓存；热 Runner 打开不重复读取未变化项目。项目级缓存只加速展示与目标解析，Host 每次执行/停止仍重读并验证当前 TOML、target identity 与 command fingerprint。
- 成功打开确认必须绑定具体 Turn；没有有效 latest-Turn 身份时不得留下跨 Bridge 的长期 false。内部 Turn ID 可用于区分 epoch，但不得进入 Renderer、公开 snapshot、日志或持久化。同一 Turn 的 `completedAt` 迟到补全不释放确认；真正不同 Turn ID、新 active/inProgress epoch 或明确移除才释放。
- Electron `openExternal` 成功与 uTools `shellOpenExternal` 明确接受（返回值不是 `false`）属于同一个 Host-open 成功边界；失败/拒绝不确认。成功后的 `readStateOnly=false` 必须压住同 Turn 的原生 stale true、refollow true、晚到 exact true 与较旧 full snapshot；Controller 的 Activity generation 反向屏障禁止旧 completed-unread 库存覆盖更新的已读增量。
- 不新增 Renderer debounce、第二套快捷键缓存、公开字段或原生 unread 写入。自动验证只覆盖受影响的 Codex/Action/路由/UI 文件、类型、preload 语法/镜像、runtime packaging 与 diff；真实宿主仍单独验收。

## RAW-145 持久决定端到端来源

- [preload/index.js](../../../../preload/index.js#L1) 只把两类已结构化复核的有限决定标为 `statusAuthority='persisted-decision'`：未匹配的精确 `request_user_input`，以及最新 completed Turn 中尚无后续 Turn 的精确 Plan item。普通 App Server/connector `activeFlags` 继续使用 `connector`，不得借新来源扩成待输入。
- `persisted-decision` 必须穿过完整库存构建、Activity inventory、公开 sanitizer 和 owner/transport 恢复路径而不降回 connector；Desktop/App Server live 仍拥有更强实时权威。精确 `turn/started`、ordinary active 或 completion 先清除旧 persisted baseline；仅当该 completion 同时拥有精确 Plan item 时才重新建立新的 Plan 决定。
- [codex.ts](../../../../src/domain/codex.ts#L1) 只接受 `persisted-decision + waitingOnUserInput/waitingOnApproval` 为非 live 待处理状态，同时保留 v4 `planImplementationOnly` 的 degraded 兼容。未标记的普通 connector waiting 仍保持保守 ongoing，避免恢复历史误报。
- `task-state-v5` 是 RAW-145 当时引入 persisted-decision 的历史修订，现已由 RAW-149 的 v6 取代；v4 的精确 Plan-only 标记仍可兼容投影，普通输入恢复仍必须由 v5+ provenance 证明。
- [codex-real-preflight.mjs](../../../../scripts/codex-real-preflight.mjs#L1) 不再复制产品 active 算法；它以当前本机 Codex Provider 数据组装真实 Host snapshot，转译并调用生产 `projectConversations` 与 `projectCodexDynamicStatus`，同时核对 preload/domain revision、已证明 waiting 是否到达 `inputRequired`、审批是否与 active 互斥及普通 connector hint 是否被拒绝。修复前真实结果为 connector waiting 1、产品 waiting 0；首个修复后观测为 persisted waiting 1、产品 waiting 1，Provider 状态随后解除时最终复跑同步为 0、0。

## RAW-146 首条排序与合同漂移收口（历史；专用入口顺序已由 RAW-149 取代）

- [codex.ts](../../../../src/domain/codex.ts#L1) 提供唯一 `orderCodexTasksForDisplay`：任何带 `pinSource` 的任务先于非置顶任务，置顶内部优先使用 `projectSections.pinned` 的既有顺序，缺失显式序号时保持源顺序。Controller 与 Float 不得再维护不同比较器。
- 全局待输入命令、紧凑待输入角标和前后任务候选都从完整 `inputRequired` 集合应用该顺序后选择；隐藏计数任务仍可成为第一条，且不得跳过一个无可用 alias 的第一条去打开后项。
- 紧凑角标帮助和 ARIA 固定为 `待输入 N · 打开第一条 / 进行中 N / 未读 N · 打开第一条`。测试必须覆盖单项、多项、超过 99、鼠标/键盘提示及“源数组首项未置顶、后项置顶”的反向顺序，不得把旧文案或只有一个候选的夹具冒充排序合同。
- Canonical/过程文档统一 `persisted-decision`、可配置动态窗口默认 24 小时和当前服务事实；历史执行行可保留当时结果，但“最新”摘要不得继续引用过期计数或已结束的 8092 进程。本增量不启动/重载 uTools、不改 ASAR、不改 Provider/Preload 状态语义。

## RAW-147 follower 状态协议去回声

- `thread-stream-following-changed(following=true)` 是发送方自己的 follower 状态公告，不是接收方重报请求；Preload 必须消费后结束处理，禁止向 source 或广播回发同一正向公告。
- 只有 `thread-stream-following-status-requested` 可以触发一次定向 `following=true` 重报。测试必须同时证明显式请求增加恰好一次出站消息，而随后收到的 peer 正向公告不会增加出站数量。
- owner `following=false` 的 RAW-116/117 连续性规则保持不变：仅在 source 确实拥有当前 shadow/unread 且 main/Side parent 仍在 inventory 时定向续订；真实 client 断开、桥失败、归档和离库仍独立撤权。
- 真实预检必须从各 TypeScript 源文件自身位置解析相对依赖并执行生产 Domain，不得因 Domain 拆分退回复制投影或跳过消费者。Preload canonical/public/dist 仍由生成链保持逐字节一致。
- 真实宿主接纳必须在所有旧 EyPc follower 重载后确认控制消息有界、owner snapshot 恢复，并实测 active→waiting 不依赖 15 秒完整库存兜底；源码/构建探针不能冒充该宿主门禁。

## RAW-148 Codex 识别单一所有者与去重

- [codexEnvironmentPresentation.ts](../../../../src/domain/codexEnvironmentPresentation.ts#L1) 是 Codex Runtime 展示语义的唯一所有者：同一输入一次生成横幅、`alert/status` 角色、十行诊断、兼容宿主等待判断、启动候选与帮助说明。[CodexPage.vue](../../../../src/pages/CodexPage.vue#L1) 不得复制环境状态分支或标签表。
- [companionPresentation.ts](../../../../src/domain/companionPresentation.ts#L1) 的 `resolveCompanionRowMarker(task)` 只由任务身份决定，不接受 provider enablement；项目归属由同模块的 `resolveCompanionProjectMarker(project)` 统一生成。RAW-022 继续要求 Codex-only、Claude-only 和混合列表都显示一个文本化、可访问的归属标记；[FloatApp.vue](../../../../src/FloatApp.vue#L1) 在构造任务/项目行时各解析一次，文本、来源色与 ARIA 共用同一结果。
- `setLaunchPath` / `clearLaunchPath` 的 Host 方法返回一次完整且已规范化的最新环境快照；[codexController.ts](../../../../src/runtime/codexController.ts#L1) 必须直接发布，不得随后无条件调用 `inspectEnvironment` 造成第二次进程/配置扫描。失败与宿主不支持提示仍由同一 Controller helper 归一。
- Codex-only 兼容只约束数据、状态、额度、空态和角标语义；任务/项目归属标记是 RAW-022 明确引入的展示差异。任何“单来源隐藏标记”或“整个界面逐字一致”的当前表述均视为已取代，不得继续进入规则、PRD 或测试。
- 接纳要求：环境诊断分支表、兼容等待与状态裁决投影有纯 Domain 反向测试；启动路径变更证明 mutation 各一次、额外 inspect 为零；归属测试覆盖 Codex、Claude、legacy Codex 与缺失任务；UI 合同同时证明 Domain 持有语义、Page 只消费投影。若不触碰 Preload/构建入口，不升级到 build、镜像或真实宿主门禁。

## RAW-149 权限待输入、状态时间与最新优先进度

- Desktop follower 的私有 `conversationState.requests` shadow 精确识别 `item/commandExecution/requestApproval`、`item/fileChange/requestApproval`、`item/permissions/requestApproval`、`item/tool/requestUserInput`、`mcpServer/elicitation/request` 与 `item/plan/requestImplementation`；兼容别名仅限已核验的同义方法。请求自带 `startedAt / createdAt / timestamp` 优先，缺失时记录该私有实例首次观测时间；进程随机盐仅在私有内存中散列有限请求标识，以便完整快照中同方法、无时间的并发请求仍保持各自首次观测时间。原始标识及散列值都不跨桥、不持久化；重复快照不得刷新时间，请求移除、整包替换清空或 resolved 后立即重算。父任务聚合 main/Side Chat 的最新未决时间。
- 公开匿名合同只增加 `CodexHostThread.waitingSince?`、Activity Delta 同名字段与 `CodexTaskCard.statusEnteredAt?`。待输入/审批取当前未决请求最新时间；完成未读取当前 completion revision；Claude 分别复用 `waitingApprovalAt / waitingInputAt / phaseUpdatedAt / completedAt`。任何请求正文、命令、文件路径、权限内容、raw request/thread ID 均不得进入公开 snapshot、Renderer、持久化或日志。
- `waiting-input` 与 `waiting-approval` 同属 `inputRequired`、待输入角标和动态待输入段；审批不得再重复计入 ongoing。待输入与完成未读在 Codex、Claude 汇总后统一按 `statusEnteredAt DESC` 排序，同值以匿名稳定 key 排序。置顶、Provider 分组、源数组和普通 `orderCodexTasksForDisplay` 不得覆盖这两个状态组；普通项目页、置顶展示及通用前后任务独占层循环保持既有合同。
- 两个专用入口共用 Controller 持久化 `attentionOpenHistory`。一个状态实例由 `kind + anonymous task key + statusEnteredAt` 定义；每次选择倒序候选中第一条未成功打开实例，新任务或同任务新时间立即插队，打开后继续旧未访问项。全部访问后仅在下一次成功打开时清空该组旧进度并从最新项回绕。Host 的 Electron `opened` 与 uTools 明确接受 `dispatched` 都算成功；列表手动成功打开也计入，失败/拒绝不推进。
- 进度每组最多 200 条，只保存 kind、匿名 task key、状态时间和打开时间；任务离组或状态时间变化时清除旧实例，跨 EyPc Renderer 重载保留。没有真实待输入时继续按既有 EyPc 本地置顶兜底，兜底不计入待输入角标或进度。紧凑待输入必须调用 Controller 动作，不得由 Renderer 读取 `[0]`；提示为“最新优先，连续触发依次打开”。
- RAW-149 引入的 `task-state-v6` 继续定义匿名状态时间与注意力进度；RAW-151 推进到 v7，RAW-153 推进到 v8，RAW-154 以精确 interrupted 终态和统一 mutation 收敛把当前语义推进到 v9。v8/v7/v6/v5/v4/v3/v2/缺失或未来来源继续 degraded 投影并 fail closed，不根据 Access 设置自行推断等待。EyPc 只提示并打开原任务，不批准、拒绝、提交或清理任何请求。
- 接纳要求覆盖：所有请求类别的新增/共存/移除/无时间回退/Side Chat 聚合/白名单；审批角标原子更新与跨 Provider 最新倒序；`1→2→3，新 6 到达→6→4→5`、同任务新实例、回绕、重载、失败不推进、手动打开推进；普通排序与通用循环不受影响；v8/v7/v6/v5 降级。自动验证完成后才进入真实非 Full Access 宿主门禁。

## RAW-150 待继续展示与任务级归档

- Domain 内部继续使用 `stopped`；Presentation 将动态分段、卡片状态、说明和可访问文本统一显示为“待继续”。它不是新顶层 Tab，不产生角标或专用快捷入口；动态顺序固定为“待输入 → 进行中 → 待继续 → 已完成未读 → 已完成”。
- Codex 精确 `interrupted/user-stopped` 在无未解决 input/approval 且无因果上更新的新 Turn/active 时立即形成 terminal watermark；更旧 Desktop active/waiting shadow 不得继续把它归入进行中，也不得伪造 `desktop-live idle`。普通 failed 继续要求既有精确 idle/not-running 门禁。Stopped 卡片允许任务级归档；Host 在执行前重读身份、source fingerprint、revision、latest Turn 与当前请求/活动边界，任何 active/inProgress、新 Turn、请求变化或版本变化返回 `state-changed`。
- Claude completed/stopped 只经 `companion-task-actions-v1` 分发到 D′ Adapter。仅 macOS Claude `1.26832.0` 通过门禁；目标必须来自正常库存构建的 Preload 私有唯一 `sessionId → local_*.json` 索引。写前重读 compatible phase 与 `isArchived`，并确认文件身份、stat/hash 未变；事务只把解析对象的 `isArchived` 改为 `true`，写同目录唯一临时文件后原子替换，再证明除该字段外语义不变。验证失败且文件仍是本次写入时恢复原始字节；Claude 并发修改后返回 `indeterminate`，禁止旧备份覆盖。
- `isArchived=true` 与私有活动库存移除双确认即 `archived`；原生归档日志只作增强证据，已归档目标幂等成功。Archive 不 Deep Link、不 AX/JXA、不扫改、不写 LevelDB/非目标会话，路径不跨 Preload。普通 open 在 Deep Link 前重读同一唯一目标，已归档、缺失或歧义统一 `state-changed`。`failed/indeterminate` 保留卡片；任务多选按 Provider 逐项分发并去重，项目批量归档仍只调用 Codex completed 路径。

## RAW-151 双向待输入热通路

- 一个 waiting-edge reducer 统一处理主任务、Side Chat、Plan、普通输入和审批的进入/解除。Desktop/App Server request 新增立即进入等待；request 移除/resolved、matching output、用户继续、精确 active 或新 Turn 立即解除并回到进行中。
- revision 缺口、owner 切换、快照/patch 载荷不完整时，只为该任务执行 `0/50/150/300/600/1000ms` 重订/复核，总截止 1.25 秒；明确证据到达即取消。耗尽只增加匿名诊断并保留保守状态，不猜测解除、不触发全库存高频扫描。
- Ownerless 普通输入/Plan 仅对已由完整库存登记且路径通过会话目录实路径门禁的 rollout 候选安装内存文件监听。解析只保留有限 function-call 关联；matching output、user message 和 `task_started` 是反向边。文件通知丢失时，Controller 每 1 秒调用 `readActivitySnapshot({ phaseOnly: true })`，Preload 只按登记候选的 size/mtime 变化重读，不读取 unread、quota、完整 inventory 或全量 latest Turn。
- 热通路由“Codex 功能启用且任务收件箱启用”门控，和 Tab、悬浮窗可见性、`taskRefreshSeconds` 无关；功能/收件箱禁用、kill 或 dispose 停止。`taskRefreshSeconds` 继续只控制完整结构校对，允许 `0–86400`，不新增热通路频率设置。
- 正常权威事件接纳到 Controller 最终任务包发布 P95 不高于 250ms；掉一次 Activity callback 或 rollout watcher 时，1 秒 watchdog 必须在 1.25 秒内恢复，且不重复发布/分组、不新增完整库存读取。Bridge 失败或证据不完整时保持现状并退避，不紧密重试。

## RAW-152 进程级跨来源任务切换仲裁

- 单卡点击、待输入和完成未读继续从 Controller 的当前原子任务包解析精确匿名 key；通用前后循环的候选层级、顺序与本地置顶兜底不变。只有全部启用 Provider 的库存 lane 都 settled 后，当前集合才可作为一个 ready 快照发布给 Host；部分 Codex/Claude 集合不得提前接受循环。
- [navigation.cjs](../../../../preload/companion/navigation.cjs#L1) 是唯一进程级游标与派发 owner。每次 `previous/next` 都立即推进游标，75ms trailing coalescing 只保留最终目标；手动卡片/attention 打开取消尚未派发的通用目标并进入 FIFO。Codex Deep Link 与 Claude Epitaxy 跳转共同受一个最大并发为 1 的队列约束，不能并行触发两个桌面应用打开链。
- [preload/index.js](../../../../preload/index.js#L1) 在 ready 热快照上直接消费 uTools `onPluginEnter` 的前后任务 code，并把同一 enter payload 清空；冷态、未就绪或旧 Host 仍交给 Renderer 做 tasks-only 预热。Renderer Controller 的 `dispose()` 只注销自身监听并 detach lease，不再关闭进程级 Codex/Claude 会话；显式功能停用、Provider 配置变化、kill 与进程退出保留重置权威。
- Host 快照在普通 mainHide/Renderer 重建间保留；新 Controller 在本地两条库存 lane 未完成前不得用空 bootstrap 覆盖它，完成后以当前 Provider 集合原子替换并提取成功结果。Provider 配置变化立即清快照与游标。旧 Host 缺少精确 `companion-navigation-v1` 时，通用循环提示重载并 fail closed，单卡直开仍走既有兼容路径。
- 公开诊断只包含 revision、ready、目标/循环数量、队列深度、最大并发、替换次数与结果枚举；不包含标题、路径、原始 ID、action alias 或请求内容。真实 uTools 重载与跨来源连续切换仍是宿主门禁。

## RAW-153 待输入解除因果屏障

- Desktop 私有状态为每个 main/Side Chat 请求实例与 runtime waiting flag 记录单调观测序列。请求仍以进程随机盐关联有限私有标识；原始标识、散列值、序列、正文和权限内容都不跨 Host、不持久化。完整快照只可保留同一实例的首次观测序列，不得把同方法的后来请求错误并入旧实例。
- waiting-clear reducer 使用同一序列空间：request remove 与匹配 `serverRequest/resolved` 精确解除对应实例；`thread/status/changed active`、`turn/started`、matching output、用户继续和新 `task_started` 清除其之前观测到的 waiting 请求与 runtime flag。清除立即重算并发布，目标任务有界重订只负责结果复核，不是解除的前置条件。
- 清除序列是私有因果屏障。旧 full snapshot、read-state、无关 patch、refollow、sticky shadow 和 rollout resume 的观测序列若不晚于屏障，均不得重新投影 waiting；屏障后真正新出现、拥有更新观测序列的请求实例必须立即重新进入待输入。runtime waiting flag 从快照中消失同样建立对应屏障。
- `desktop-live + active` 只有在当前 shadow 不含可见 waiting flag 时才可作为普通 active 复用。当前 owner 若仍带旧 waiting，较新的 App Server active/Turn-started 必须先越过等待优先级并清除旧实例；后续旧 shadow 重放不能回跳。Side Chat、Plan、普通输入、权限审批与 rollout resume 使用同一规则。
- `serverRequest/resolved` 只按 `threadId + requestId` 的私有关联清匹配项；未匹配时仅启动既有目标任务 `0/50/150/300/600/1000ms` 有界重订，不清同任务其它并发审批。该通知补强 Desktop request remove，但不是所有请求的唯一解除来源。
- 公开字段不增加；RAW-153 当时以 `task-state-v8` 标识 waiting-clear 因果屏障，当前由 RAW-154 的 `task-state-v9` 原样承接并叠加精确 interrupted 终态。v8 及更旧 Host 保留可兼容任务投影但进入 degraded/reload 提示。RAW-149 的最新倒序/打开进度、角标、归档、Provider 聚合及通用导航不变，也不引入 `backgroundThrottling` 推断性调整。
- 接纳要求同时覆盖当前 owner waiting→较新 active、旧 snapshot/read-state/refollow/rollout replay 不回跳、新 correlation 重入、匹配 resolved 保留并发审批、runtime flag removal、Side Chat/Plan 与缺失关联保守重订。原 v8 宿主门禁未完成且已由 v9 接管；当前真实 v9 宿主必须在请求解除后首个更新周期、最迟 1.25 秒进入进行中，30 秒及两次 mainHide/refollow 后不回跳，并确认同任务新请求重新进入待输入。

## RAW-154 统一任务动作内核与 mutation 收敛

- [companionProvider.ts](../../../../src/domain/companionProvider.ts#L1) 定义 `CompanionTaskTarget` 与 open/archive 可辨识请求/结果；[task-actions.cjs](../../../../preload/companion/task-actions.cjs#L1) 是唯一 action→Provider Dispatcher。Renderer 只提交意图，Domain 只输出互斥 bucket/capability，Dispatcher 只选择 Adapter 与队列策略，Codex/Claude Adapter 独占 inspect/open/archive/close 副作用，Controller mutation reducer 只接纳已验证结果。未知 Provider、旧 Bridge、stale revision/phase/alias 和不支持动作全部 fail closed。
- Open 保留 `companion-navigation-v1` 的 75ms 尾随合并、旧目标替换及跨 Provider 最大并发 1；archive 永不合并或替换，只按 `Provider + task key` single-flight，相同任务重复请求 join，同一批不同任务和不同 Provider 并行。旧 Codex 安全 Host 归档可薄转发；旧 Claude AX/Deep Link 归档不得回退。
- Controller 删除 Provider 特定成功/失败分支和乐观删行。归档期间卡片保留并通过 `archivingTaskKeys` 标记；`archived` 立即精确移除、清同 key receipt/navigation 并只发布一次，`failed/indeterminate` 保留卡片，后者只启动目标级复核。混合多选逐项进入同一 Dispatcher；项目批量继续只调用 Codex completed 路径。
- Claude 文件 watcher 只对私有索引中已登记精确文件发布 `CompanionTaskMutationDelta`：Provider、匿名 key、`archived/upsert/remove`、单调 generation、接纳时间，以及 upsert 所需的白名单 observation。Controller 在 quota、state、unread 或完整 inventory Promise 阻塞时仍立即接纳；tombstone 阻止已启动的旧 inventory 恢复已移除卡片。掉 callback 时 1 秒 watchdog 只比较这些文件指纹，1.25 秒内恢复且不扫目录、不重复发布。Claude App 手动归档与 EyPc 静默归档进入同一个 mutation reducer。
- `eypc-companion-archive` 声明 `mainHide:true`，路由到外部稳定 action `codex.task.archiveFocused` 并内部委托 Dispatcher。目标先取仍有效的聚焦 `canArchive` 任务，否则取非隐藏 attention 顺序首项；无唯一候选不写。第一次调用只提示 Provider/目标并建立 5 秒进程级确认，第二次只有 key+revision+focus+phase+Provider identity 完全一致才归档；任何变化、超时、功能/Provider 禁用或 process close 都取消。普通 Renderer remount 不清确认，冷启动只做 tasks-only hydration，不切 Tab、不打开 Claude。
- `task-state-v9` 是当前状态合同；v8 及更旧来源保留可用任务并标记 degraded/reload。自动验收覆盖 100 轮 P95≤250ms、掉通知≤1.25s、Dispatcher 互斥/并发、Claude 事务/回滚/并发写、外部归档 delta、UI 文案与快捷确认。真实 v9 uTools 和经用户另行确认的可丢弃 Claude canary 仍是独立 host gate。

## 证据合同

- Activity 来源为 `connector / initial-snapshot / activity-event`，并携带会话期 revision；Preload 内真实 Desktop patch 与精确 App Server active 另共享一个不出 Host 的单调 evidence sequence，用于判断跨来源先后。
- Turn 来源为 `inventory / turn-started / turn-completed / targeted-after-exit / snapshot-corroborated`。
- 非 live 决定来源为 `persisted-decision`，只证明已结构化复核的有限待输入/待审批决定；它不是普通 connector 活动的别名。
- 未决请求时间只证明当前状态实例何时出现，不参与 Activity/Turn 因果仲裁；源时间缺失时的首次观测时间、会话随机盐关联、私有观测序列与 waiting-clear 屏障只保留在私有 shadow，公开层只得到匿名 `waitingSince`，不取得原始/散列请求身份或序列。
- `readStateOnly` 只能修改 unread；不得重放 Activity 或 Turn。
- Unread 区分初始 snapshot、明确 read-state event 与成功打开确认。成功打开确认对其 completion epoch 最强并跨普通 Bridge 重建保留；其余 exact true/false、refollow snapshot 与原生集合按当前证据仲裁。refollow snapshot `false` 可清除中断期遗漏事件留下的 persisted `true`；当前可解析原生集合的成员/非成员仍压过 snapshot `true`，原生 atom 瞬时不可用时先沿用当前 Bridge 最后一次成功原生观测，再回退其它 snapshot。新 Turn 证据先释放旧成功打开确认。
- 精确 `turn/completed` 统一关闭完成前 unread false 周期，即使旧待输入/审批 flag 尚未排空；完成后新到达的明确 read-state event 可重新声明已读。
- Preload 只读监听 Codex 原生状态文件变化，经短合并后仅发布匿名 `readStateOnly` 增量，不把文件路径或私有内容送入 Renderer。
- 原生 unread 首次观测或从非 true 变为 `true` 时，若 latest Turn 尚未确认 completed，非 active 任务启动一次普通有界复核；无 waiting flag、无精确 `turn-started` 的可疑 active 启动 `verifyStaleActive`。会话期观测水位防止相同 true 轮询重复重启；unread 只唤醒取证，不直接改变 Activity 或发明完成。
- Codex read-state 与成功打开任务的当前会话事实共同构成未读权威；后者只在 Host 确认 Deep Link 打开后生效且不持久化。旧 `completedUnreadAcknowledged*` 输入仍只作忽略式迁移，不能压住后续新 completion/unread。
- raw thread/Turn ID、正文、cwd、路径和私有 patch 值不跨越 preload。
- `desktopActiveSince` 只作 v2 兼容输入，不与 provider 时间比较；`completionPresentationDelayMs` 已退出当前设置形状。

## 唯一状态优先级

1. exact live 待输入/审批请求进入 `waiting-input / waiting-approval`，但仅限其私有观测序列严格晚于对应 waiting-clear 屏障；已被 request remove、匹配 resolved 或较新运行证据清除的旧实例不得因 snapshot/read-state/refollow/rollout 重放复活。owner 已消失时，会话期 sticky exact request 或标为 `persisted-decision` 的安全 rollout 尾部精确未匹配 `request_user_input` 可保留/恢复普通 waiting-input；latest completed Turn 中标为同一来源的精确 Plan item 则恢复 Plan-only waiting，直到更新 Turn，且不受 unread 影响。普通 connector waiting 不进入该层。
2. 真实 Desktop activity patch、精确 App Server `active` 或精确/new `inProgress` 建立 live active；`app-server-live` 覆盖旧 initial/refollow idle 和更早的 idle activity event，也必须覆盖当前 owner shadow 中观测更早的 waiting flag，并携带私有建立水位/clear 屏障跨 inventory 重建保留。Desktop 非 active 或新 waiting 只有其真实观测序列严格更晚时才可撤销；read-state-only、Side Chat 聚合或 inventory 重放旧 shadow 不能撤销。
3. 精确、定向或佐证 completed 立即进入 `completed`；但同一 latest Turn 的精确未实现 Plan 决定继续作为 waiting-input，直到下一 Turn。普通 inventory completed 只有在没有更强 live active/Plan 决定时成立。精确通知和 snapshot 佐证都允许缺失 `completedAt`，confirmed provenance 写回会话期 inventory。
4. 精确 `interrupted/user-stopped` 在没有未解决 input/approval 且没有因果上更新的新 Turn/active 时立即进入内部 `stopped` 并清更旧 live shadow；普通 `failed` 仍只有相对当前 active-exit baseline 前进并经退出后定向证据确认，或与 Desktop 明确 `not-running` 共同出现时进入 stopped。Presentation 固定显示“待继续”，缺失 Turn outcome 永不构成停止。
5. 不完整、乱序、断连或互相冲突的证据保持 `ongoing`。

真实 activity patch 开启新周期时，旧 terminal 元数据不能压住 active。实时 delta 与完整 snapshot 复用同一个 active-exit 转换器，转换器自身识别 confirmed provenance，不依赖入口额外传参；未前进的旧 completed/interrupted/failed 统一保持 ongoing 并保留 baseline。终态通过门禁后关闭该周期，相同后续快照不得把完成反判为 inProgress，也不得把旧中断误判为 stopped。

## 稳定性与兼容

- 首次 active snapshot 与 terminal Turn 冲突时，复用 `[0,300,1000]` 单任务佐证；真实 patch、等待请求或新 Turn 立即取消抑制。
- 同 revision 的精确 started/定向 inProgress 是状态前进，只有严格更旧的 `startedAt` 被拒绝；不再使用 completed shape、跨时钟或 completedAt 必填阻断 live 事件。
- 单任务 Turn 复核只合并兼容模式；相同 active snapshot 复用一个 `[0,300,1000]` 周期。新 unread 事件、任务切换歧义、Activity epoch/映射或复核模式变化才取消旧复核并由新周期接管，旧异步结果不得清除或回写新周期。
- Activity Delta 每次发布递增 generation，完整 snapshot 携带已组装库存的 generation 屏障；严格更旧增量不得覆盖 snapshot，严格更旧 snapshot 也不得覆盖已接纳 delta，Controller 水位只单调前进。
- 完整 inventory 重建保留更强的精确 inProgress、confirmed terminal 与同 revision provenance。未知 key 只触发 urgent 结构复核，已知条目仍即时应用。
- 完整 inventory 同时保留 `app-server-live` 私有 evidence sequence；该序号不进入 Activity Delta、Host Snapshot、Renderer、存储或日志。
- 50/200ms 结构合并、1 秒 phase-only Activity/rollout watchdog、默认 15 秒完整校对和 missing-key 隔离只保护各自证据/库存，不延迟已知等待边或已确认完成；missing-key 只保留缺失行，同批仍存在的任务状态立即发布。连续确认早于隔离窗时按剩余时间自调度，普通周期为 0 也会闭合。Preload 在 source fingerprint 未变化时把已发布缺行任务的匿名映射保留 120 秒，覆盖 Controller 最长配置隔离窗口；显式归档仍立即清除。
- `task-state-v9` 是当前语义。v8/v7/v6/v5/v4/v3/v2/旧来源仍读取并发布 degraded 原子包，不清空任务；旧源提示重载。v4 Plan-only、v5 persisted-decision、v6 状态时间与 v8 waiting-clear 因果屏障保持兼容；只有当前 v9 同时表示匹配 `serverRequest/resolved`、active-vs-active waiting-clear、精确 interrupted 终态和统一任务 action/mutation 合同已加载。
- 旧 runtime/float `conversations` 别名只作一版兼容；当前消费者以 `taskState` 为权威。

## RAW-154 返工：唯一任务内核、原子任务包与运行身份

- [companionTaskPackage.ts](../../../../src/domain/companionTaskPackage.ts#L1) 定义唯一公开任务包 `companion-task-package-v1`。一个 revision 内同时发布标准任务、`kind`、`phase`、`cycleTier`、capabilities、动态分组、输入/活跃/未读角标、attention keys 与通用 `cycleKeys`；Main、Float、卡片和快捷键不得混用不同 revision 的局部视图。
- [task-kernel.cjs](../../../../preload/companion/task-kernel.cjs#L1) 是唯一进程权威 `companion-task-kernel-v1`。Provider Adapter 只提交带 source generation 的原始证据；Kernel Reducer 负责状态优先级、freshness、去重、原子发布和按任务 `kind/provider` 路由。`companion-navigation-v1` 与 `companion-task-actions-v1` 仅是 Kernel 内部 Dispatcher 模块，不再作为 Renderer 可独立同步的缓存。
- 卡片点击、待输入/未读直达、上/下任务、聚焦和归档都只能提交 `dispatchCompanionTaskIntent(intent)`。Kernel 每次从最新包重新解析完整目标；不存在 `lastEnterPayload` 任务补执行、Renderer 启动后重放或独立 Navigation/Task Actions 同步。循环仍只选择首个非空层级：input/approval → Plan implementation → active → local pin，并在该层的统一 `cycleKeys` 内前后回绕。
- `onPluginEnter` 在 Preload 直接消费静默任务入口，`mainHide` 只隐藏 uTools 主搜索框。热且新鲜的进程包直接派发；冷进程、缺失或过期时加入同一个全 Provider tasks-only 预检。预检不读 quota、环境、非任务 unread 或完整非任务库存；等待全部启用 Provider，600ms 后仅提示一次进度，5 秒超时，任一 Provider 失败时保留旧包并拒绝从部分集合跳转。普通隐藏保留进程包；真实退出、Provider 配置变化或功能关闭清理，包不持久化。
- 明确且更新的状态事件立即归并，最多一次微任务/16ms 原子批处理；同 revision 语义重复不发布，低 revision/乱序拒绝。未解决输入/审批优先于较旧终态，更新一代 Turn/Activity 可从 completed/stopped 恢复 running。缺失或模糊证据只先降低 freshness；连续两次读取失败且超过 1.25 秒才转 unknown。`completed-unread` 是 completed 与 unread 的组合视图，不是另一状态机；1 秒恢复扫描只补漏。
- [utools-runtime-identity.mjs](../../../../scripts/utools-runtime-identity.mjs#L1) 从受管 `plugin.json`、Preload/CJS 与 Renderer 输入生成确定性的 `hostAssetId`、`rendererAssetId`，并携带 Kernel/Package revision。[preload/index.js](../../../../preload/index.js#L1)、[preload/float.js](../../../../preload/float.js#L1)、Main UI 与 Float UI 必须完成四端精确握手；缺失或不一致时进入 `reload-required`，停止任务操作并显示期望/实际身份。构建只允许报告 `artifact-ready`；真实 uTools 握手一致后才是 `host-loaded`。
- `task-state-v9` 仅标识现有 Provider 输入兼容语义；最终权威分别是 `companion-task-kernel-v1`、`companion-task-package-v1` 与 Runtime Identity。构建不会替换或激活 uTools 已加载的 ASAR，正式接纳固定为：构建 → 开发工具重新接入 `dist/plugin.json` → 用户结束旧插件后台进程并重新进入 → 重开 Float → 核对四端身份一致。离线包必须安装新 UPXS 后重新进入；实现不调用私有 uTools API，也不自动结束进程。

## 残留矩阵收口

- 新会话模型仲裁与 RAW-046 对齐：普通 5 小时或周窗口只要实际返回 0 就切最高可用 Spark；缺失窗口不等于 0。普通池说明/读数先取正值 5 小时，再取周额度，不再把“普通周额度”误写为唯一门槛。
- 外观遵循 RAW-071 的独立 token 直存直渲；旧格式、对比度、配对色域、自动调色、Controller 暂态预览/提交/回滚 Action 均不是现行路径，兼容校验函数只返回非阻断结果。
- MQTT/Quick Jump 静态合同只核验对应 media/function 边界，允许等价格式化；跨区块或跨函数正则不能作为行为失败。
- 全量失败必须按真实缺陷、过期契约或测试误报归因并清零，不再以“既有/已知失败”作为交付状态。

## 非目标与风险门禁

- 不重做外观展示形式、项目移除或整个 EyPc 架构；仅清除已确认的旧外观门禁和模型策略偏差。
- 未授权真实 Codex/uTools 部署或原生状态写操作；除已定义的项目移除事务外，Codex 原生状态保持只读。成功打开确认仅更新当前 preload 的匿名投影。
- 实现接受仍需用户重载真实 uTools 并验收 v9 active↔waiting-input 双向切换、解除后 30 秒不回跳、同任务新请求重入、精确 interrupted 的“待继续”展示与新 Turn 恢复、待继续角标边界及 Codex stopped 归档。Claude D′ 真实归档还必须由用户另行确认一个可丢弃 completed 会话后执行；两项真机门禁未完成前统一记为 `automated-verified / host-pending`。
