# Claude Companion：Codex 同构状态与全局缓存改造

updated: `2026-08-11`
status: `implementation-landed / RAW-154-automated-verified / RAW-029-focused-verified / native-sidebar-unsupported / targeted-host-partial / interactive-host-acceptance-pending`

## Baseline And Corrected Conclusions

- 新建 Claude Code 任务的热路径成立：基线观察中库存从 24 增至 25，新增任务能进入卡片。
- 基线的历史恢复不成立：25 条会话中 17 条为 unknown、0 条恢复为 completed；额度只有两个通用窗口，没有 Fable/Fable 5。
- “Hooks 已完整满足状态同步”“100 次 watcher 回调延迟等于 UI 发布延迟”“实现已经完成”全部作废。旧实现把库存、状态、未读和额度串成整轮刷新，额度网络最多可阻塞 8 秒。
- 最终路线是用户选定的：**Claude App 版本门禁私有日志 + 官方 Hooks + Code 元数据 + 原生 LevelDB 未读快照**。Hooks-only 与私有 IPC 注入均为拒绝路线。

## Verification Plan Preflight

- Impact source: 本计划的五个独立变更面（inventory/title/history、state/unread、全局增量缓存、exact open、quota/UI）及其直接 Bridge/Controller/Renderer/packaging 消费者；不存在把整个应用影响集声明为无界的证据。
- Provisional affected set: 对应 Claude domain/platform/runtime/UI 的定向 tests、preload/public 镜像与 IPC/static validator，以及尚未通过的真实 uTools/Claude 状态/额度矩阵。
- Selected checks: 每个独立变更只运行能推翻其合同的 focused tests；只在被改动类型边界需要时运行 affected semantic typecheck，只在 bundle/output/config/entrypoint 发生变化时运行 affected build/package 检查；宿主实验按下文矩阵逐项执行。
- Skipped by default: repository-wide `pnpm run test`、完整 `typecheck`、完整 `build` 和 `pnpm run verify`。它们只有在新的独立用户请求、适用发布策略、无界依赖证据或 focused failure 触发时才升级。
- Command provenance: `impact-trace`; full-suite escalation: `none`。
- Correction: 旧计划先写入完整 ladder、后把用户批准计划解释为用户显式全量请求的逻辑已废止。任何后续计划补充都必须先更新本 trace，再写验证命令。

## Implemented Work

### 1. Codex 同构全局热缓存

- [codexController.ts](../../../../src/runtime/codexController.ts#L1) 按插件进程生命周期维护 Claude 物化视图；功能启用时持续订阅，切页、悬浮窗显隐和快捷键不会重建缓存。
- inventory、state、unread、quota、App presence 已拆为独立 lane。事件只刷新自己的 authority；quota promise 阻塞不会延迟 state publish，inventory 读取失败保留最后一次有效库存。state 事件即时 hot-read + 1 秒恢复轮询，连续两次失败后活动态降为 unknown；state/unread generation、Controller revision 与 Float applied revision 均拒绝倒退。
- 快捷键冷启动只做一次 tasks-only inventory prewarm，不读取额度；插件重启从真实来源冷启动，旧 live phase 不落盘。

### 2. 真实状态与历史恢复

- [code-sessions.cjs](../../../../preload/claude/code-sessions.cjs#L1) 的元数据白名单加入 `completedTurns`，标题、项目、归档、活动和完成计数按单行 patch 合并，不覆盖已有 phase/unread。
- 新增 [app-state.cjs](../../../../preload/claude/app-state.cjs#L1)：仅接受已门禁 Claude App `1.26832.0` 的固定无内容日志模板；发送、权限请求、AskUserQuestion、request-id 权限响应、完成、停止/失败均去重归并。版本或语法不匹配立即 fail closed，原始日志、工具参数和正文不跨 Bridge。
- 状态优先级固定为：App local id 精确事件 → 可唯一关联 Hook → 冷启动 `completedTurns` 历史证据 → unknown。更新的 live 证据优先；过时 active 证据不会覆盖更新的历史完成，歧义 Hook 不扇出。
- [unread.cjs](../../../../preload/claude/unread.cjs#L1) 用真实 LevelDB reader 精确读取包含 Chromium string tag 的 `epitaxy-unread-v1` 键，复制前后指纹一致才发布 V2 generation。成功精确打开完成态后，Controller 为同 `sessionId + completionEpoch` 建立仅进程内提示并在 0/100/300/1000ms 复读原生集合；同轮迟到 true 不回跳，新轮次可再次未读。失败跳转不提示、不写 App，`confirmsRead` 保持 false。

### 3. 快捷跳转性能

- [open.cjs](../../../../preload/claude/open.cjs#L1) 缓存 Claude 主进程 bundle/PID/启动代次，热路径只做低成本存活校验，缓存失效才完整复核。
- RAW-152 后，上一个/下一个的物化游标、75ms 最终目标与跨 Codex/Claude 并发 1 由 Preload 进程级 `companion-navigation-v1` 统一拥有；Claude provider-local opener 只执行现有 Epitaxy local deep link。所有启用来源库存 settled 前不接受通用循环，普通 Renderer remount 只 detach。
- 路径仍严格禁止 import/resume、CLI、标题点击、自动启动、未读写入或会话复制。

### 4. Fable 与重置距离

- [quota.cjs](../../../../preload/claude/quota.cjs#L1) 在 `claudeAppQuotaAccess` 显式授权后，只读 Claude App `oauth:tokenCacheV2`，用 Claude 专属 Safe Storage Keychain 项在内存解密并按组织/最小 scope 仲裁；跨账号歧义失败关闭。Node 16 使用 `node:https`，实际 `kind/percent/scope.model.display_name` limits 映射出 5h、总周与 Fable scoped 周额度，非额度 `spend` 被拒绝。
- [claude.ts](../../../../src/domain/claude.ts#L1) 保留每个窗口的 source/freshness/reset，较新的两窗口 history 不能删除 scoped/Fable 窗口；缺失、过期或缺少 scoped weekly 时触发单飞 supplement。
- 启动、启用、恢复可见、聚焦、网络恢复、普通 cadence 与最早 reset+1 秒独立唤醒。401/403 等凭据变化，429 遵循 Retry-After，其它失败为 1 分钟、5 分钟、15 分钟、随后每小时；最后成功值保留但标 stale，成功后回到 5 分钟最小刷新间隔。
- 每个周限额 chip 显示剩余百分比；200ms 悬停/聚焦展示绝对重置时间、相对距离和新鲜度；20%/10% 分别进入 warning/danger，不新增系统通知。

### 5. 接口与整理

- Bridge 已分离 inventory、`ClaudeCodeStateDeltaV2`、unread、quota、App presence；V2 带 `generation/source/freshness/compatibility`。
- `ClaudeCodeObservation` 增加 `completedTurns` 与证据字段，quota snapshot 增加窗口级 source/freshness；Renderer 不再猜测总快照。
- 删除“所有 watcher 调 `refreshClaude()`”、每次打开全量窗口枚举、进程期仅三次额度尝试及相应错误测试；保留 Code-only、App 标题、精确历史 deep link、LevelDB 只读合同。
- 项目投影新增只读虚拟合并：完全相同稳定 project key 优先、双方名称唯一时兜底，Claude-only 项目批量进入项目区，歧义重名保持分离。Projects 内建 `全部 / 只显示 Codex / 只显示 Claude` 会话级筛选并重算计数。更新引入（RAW-154，取代 RAW-150 的 Claude 执行路线）：completed/stopped 任务级归档只通过 Claude `1.26832.0` 门禁后的 D′ 单目标静默 `isArchived` 事务；归档不打开 Claude、不使用 AX，项目级归档、移除和移动继续禁用。
- 任务与项目固定显示文本化归属，使用现有来源 token 做 8%/12% 轻背景，并保留状态图标、原生 Tab/键盘/ARIA 语义与紧凑高度。

### 6. 旧任务父 Turn 与单项真实同步

- [events.cjs](../../../../preload/claude/events.cjs#L1) 抽取纯 Hook reducer：只有新 Prompt 开启父 Turn，Stop/StopFailure/SessionEnd 关闭后，SubagentStop、工具和 lifecycle 尾事件只能更新自己的水位，不能把父任务复活为 running。
- [code-sessions.cjs](../../../../preload/claude/code-sessions.cjs#L1) 集中选择 App/Hook/history：App 明确 terminal 压过同 Turn Hook 尾事件，只有严格更新的 Hook Turn 可重新激活；history 不能覆盖真实新 Turn。
- [claudeCode.ts](../../../../src/domain/claudeCode.ts#L1) 抽取 generation-first 的纯版本比较；[codexController.ts](../../../../src/runtime/codexController.ts#L1) 让 state/unread 使用可加入的 Promise singleflight 与单次 publish 去重。
- 内部动作 `codex.claude.task.sync` 固定接收当前 Claude local session 的 `{ key, actionAlias }`。更多菜单只对 Claude 显示“同步 Claude 状态”；成功打开也走同一条静默同步。同步读取真实 state/unread，允许部分失败提示，不允许人工指定完成或已读。
- 五份旧 Claude 任务文档在原路径使用 `document-archive-notice-v1` 逻辑归档并指向本 Spec；不移动、不重命名、不删除。归档处置算法由 CodeNote 全局 owner 持有，EyPc 只消费其格式。

### 7. RAW-154 统一动作与 D′ 静默归档

- [task-actions.cjs](../../../../preload/companion/task-actions.cjs#L1) 以 Provider registry 统一 `inspect/open/archive/close`；Renderer 只提交意图，Controller 只接纳已核验 mutation。相同 Provider+任务归档加入同一 Promise，不同任务/Provider 互不阻断；旧 Claude AX Bridge 不允许回退。
- [code-sessions.cjs](../../../../preload/claude/code-sessions.cjs#L1) 在正常库存读取时建立唯一私有文件索引。写前核验 phase、身份、stat/hash，事务保留原字节/权限，只改 `isArchived`，同目录 `wx` 临时文件核验后原子替换；安全回滚失败或检测到并发修改时返回 `indeterminate`，绝不覆盖更新的 Claude 字节。
- [archive.cjs](../../../../preload/claude/archive.cjs#L1) 提供 `claude-metadata-archive-v2`；元数据 true + 私有活动库存移除即 `archived`，App 日志为可选增强证据。归档路径不得调用 Deep Link、AX/JXA 或 exec，不写 LevelDB/其它会话。
- 精确文件 watcher 发布 `CompanionTaskMutationDelta`，一秒 watchdog 只核验索引候选，独立于 quota/state/unread/full inventory。普通 open 写前检查目标未归档；`eypc-companion-archive` 用同一 Dispatcher 的进程级五秒同身份二次确认。

### 9. RAW-029 D-1 提示语与 D-2 原生侧栏核验

- D-1 已修改 Claude 归档适配器的成功/幂等提示和 Controller 兜底：只声称 EyPc 归档完成及 EyPc 列表移除，同时明确 Claude 原生侧栏可能仍待刷新、当前尚未确认同步。
- D-2 先做只读能力核验。已安装 App 的原生归档会修改运行中 session manager、保存对象并发布 `archived` 事件；D′ 文件事务没有进入该链，官方公开 Deep Link/API 也没有面向 Desktop Code 本地会话的归档入口。因此本轮不新增原生写路径，状态固定为 `unsupported-currently`。
- 未来仅在“受支持原生入口 + 同一 session 原生 ACK + 同一运行中侧栏 1.25 秒内移除”同时可测时重开；私有 IPC、AX/JXA/UI 自动化、LevelDB/元数据写入、自动重启和事后视觉推断继续禁止。
- 当前影响验证覆盖 Claude archive Bridge、Provider-neutral action carry-through、Controller 提示兜底、canonical/public Preload 语法/镜像和变更文档链接。因 uTools 实际加载 `dist` 且 Host identity 哈希 canonical Preload，产物边界升级为 typecheck + 1870-module production build + runtime preparation/validator；仍不运行全仓测试，也不写真实 Claude 数据。

## Verification Plan And Current Gate

- 自动化必须覆盖历史 completed 恢复、未知/歧义、日志轮转/版本失配、权限响应关联、增量元数据、unread 历史提升、authority lane 隔离、库存/状态竞态、blocked quota 下的状态发布和快捷跳转单飞。
- 性能门禁：缓存选取 `<=10ms`；热派发 P95 `<=150ms`；冷校验 P95 `<=1s`；100 次状态转换在 quota 阻塞 8 秒时发布 P95 `<=250ms`；漏通知恢复 `<=1.25s`。
- 实机矩阵：新建→running、权限→待确认、AskUserQuestion→待输入、响应→running、后台完成→已完成未读、打开原任务→已完成已读、标题/活动变更→原卡片 patch、重启→历史恢复。
- LevelDB 必须同屏观察原生小点和集合进入/移除；额度必须同屏核对 5h、全模型周、Fable/Fable 5、绝对 reset 与相对距离。
- 当前代码和受影响自动化已落地；库存/历史、状态源、精确 unread reader、真实 Claude App 额度及构建/打包边界通过。真实额度已读到 5h、全模型周、Fable scoped 周额度及 reset；真实权限/问答、未读进出集合、标题/重启和项目筛选 UI 矩阵仍未完成，因此不得标记整体完成。
- RAW-024 只增加 Hook/Domain/Controller/Float/action 的 focused checks、临时语义 typecheck、Vite production bundle、runtime asset preparation 与 uTools validator；不触发额度、项目、收藏、MQTT 或全仓测试。

## Stop Conditions

- Claude App 版本或日志模板变化：state log lane fail closed，先更新 [research.md](research.md#L1) 与 fixtures，不宽松解析。
- LevelDB 精确键/reader 失效：unread 为 unknown，不恢复字节扫描、旧集合或打开回执。
- Epitaxy 路由产生副本或不能证明 App 已运行：open unavailable，不恢复 import/auto-launch。
- usage 源缺窗口、reset 或返回错误：保留已证明的窗口并标 freshness，不伪造 Fable 或 reset。

## Non-goals

- 历史非目标“不删除、归档、合并或修复 Claude App 会话”由 RAW-154 增加一个窄例外：只允许版本门禁后的单一已索引目标 `isArchived=true` 事务，并要求元数据+活动库存双确认；仍不删除、合并、修复、扫改或触碰非目标 Claude 数据。RAW-150 的 Deep Link+AX/三重日志门禁仅保留为已取代历史。
- 不接入 Cowork、CLI-only、云端索引或私有 IPC 注入。
- 不启动 daemon，不持久化 live phase，不写 Claude App unread/LevelDB/其它 session state，不在探针输出会话身份、标题、正文、路径或凭证。
