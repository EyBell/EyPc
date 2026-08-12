# Claude Code Companion 权威重置 — 规范化用户事实

spec_id: `SPEC-260807-CLAUDE-CODE-COMPANION-AUTHORITY-RESET`
source_format: `chat`
source_kind: `chat-requirement-summary`
capture_fidelity: `normalized-material-requirement`
privacy_boundary: `no-verbatim-prompt-or-transcript`
updated: `2026-08-12`

> 本文件只保留会改变范围、行为、选择或验收的语义；不保存原始提示词、截图文字转录、命令、工具输出、会话身份或推理过程。

## Material Requirements

| Raw ID | State | Normalized material requirement |
| --- | --- | --- |
| RAW-001 | active | Claude 来源只展示 Claude App **Code 模式**的本机会话；CLI-only、Cowork 和其它桌面会话族不得混入。 |
| RAW-002 | active | 卡片标题使用 Claude App 展示标题；空标题使用稳定的人类可读回退，不把 UUID/唯一编码暴露为标题。 |
| RAW-003 | active | 「进行中 / 待确认 / 已完成 / 未读」必须来自真实状态通信，互斥展示、快速更新，不能因多个证据源而重复出现在多个分组。 |
| RAW-004 | active | 点击卡片必须在已经运行的 Claude App 中打开**原有历史 Code 会话**；不得导入、复制或新建会话，不需要 CLI 兜底。 |
| RAW-005 | active | 已经由 App 产生的重复 Code 会话严格按 App 镜像保留；EyPc 不自动隐藏、合并、删除或修复用户的 Claude 数据。 |
| RAW-006 | active | 未读选择 Claude App 原生小点为权威；失败时显示未知而不是伪造已读/未读，也不把插件自身打开回执当成原生未读。 |
| RAW-007 | active | 额度显示全部上游窗口，包含账号实际存在的 Fable/Fable 5 或其它按模型周限额；较新的两窗口样本不得抹掉第三窗口或重置字段。 |
| RAW-008 | active | 更新既有计划并同步所有相关权威、派生理解、当前状态和错误记忆；错误路线只保留为明确标记的历史证据，不再作为当前需求或实现建议。 |
| RAW-009 | active | 固化全部已选选项、被比较的技术路线与最终选择，避免后续对话重复调研或回到已否决方案。 |
| RAW-010 | active | 形成一份可复用的本地通信状态谨慎调研和严格本地测试通路；实现须抽取清晰模块并通过真实宿主门禁后才可声称完成。 |
| RAW-011 | active | Claude 任务使用与 Codex 同构的插件进程级热缓存；功能启用期间跨页面、悬浮窗显隐和快捷键持续订阅，插件重启后从真实来源冷启动，不持久化旧 live phase。 |
| RAW-012 | active | 库存、phase、unread、quota、App presence 是独立增量权威；任一事件不得触发整轮全量刷新，额度网络失败或 8 秒阻塞不得阻塞任务状态发布。 |
| RAW-013 | active | 最终状态路线固定为“Claude App 版本门禁私有日志 + 官方 Hooks + Code 元数据 + 原生 LevelDB 未读快照”；仅 Hooks 和私有 IPC 注入均被拒绝。 |
| RAW-014 | active | 历史状态由 `completedTurns` 与更新证据恢复；App 本地 ID 精确事件优先，唯一 Hook 次之，冲突时保持 unknown，不基于进程或时间猜测。 |
| RAW-015 | active | 上一个/下一个只读取全局物化视图，缓存 Claude 主进程身份并用 latest-target-wins 单飞派发 Epitaxy deep link；连续操作不得乱序、自动启动 App、修改未读或产生会话副本。 |
| RAW-016 | active | 额度 transport 必须兼容 Node 16，动态保留全部窗口；过期 reset 不得继续显示，补充读取按立即、1 分钟、5 分钟、15 分钟、随后每小时重试，成功后恢复 5 分钟最小刷新间隔。 |
| RAW-017 | active | 只有实际 uTools/Claude 完整矩阵与 Fable 同屏核对通过后才恢复“完成”状态；新任务热路径成立不能替代历史、未读、变更和额度路径验收。 |
| RAW-018 | active | 规划阶段必须先按独立设计/代码改动建立 provisional `VerificationImpactTrace`，再选择 focused checks；不得预填完整 `test → typecheck → build → verify`，也不得把用户批准 Agent 自拟计划解释为独立全量测试授权。相关全局规则、规划/复核/编排 Skills、项目适配器和当前计划必须同步纠正。 |
| RAW-019 | active | Claude App 当前账号的加密 OAuth 缓存是额度与 reset 的主权威；必须显式授权、只读解密、动态解析 `session / weekly_all / weekly_scoped`，多账号无法唯一仲裁时失败关闭，令牌不得离开请求闭包或进入诊断。 |
| RAW-020 | active | inventory、live-state、unread、quota 使用独立时钟；App 日志事件即时 hot-read，1 秒恢复轮询兜底，source generation → Controller revision → Float applied revision 全链拒绝倒退，连续状态失败两轮后活动态降为 unknown。 |
| RAW-021 | active | Codex/Claude 原生项目不写入；EyPc 以规范路径完全相同优先、双方名称唯一次之生成虚拟项目，Claude 独有项目批量加入。项目页提供会话级 `全部 / 只显示 Codex / 只显示 Claude`，并同步过滤任务与重算计数。 |
| RAW-022 | active | 所有状态任务和项目必须以文字/图标/可访问名称明确显示“归属 Codex/Claude”，并用现有来源色做 8% 普通、12% 悬停/选中背景区分；状态颜色继续只表达进行中、待输入、完成等状态。 |
| RAW-023 | active | 原生 unread 仍是持久权威，但成功派发精确 Claude deep link 后允许创建仅进程内、仅同一 `sessionId + completionEpoch` 的可撤销已读提示并立即重读原生集合；同轮迟到 `true` 不得回跳，新运行/等待或更晚完成必须重新允许未读。 |
| RAW-024 | active | 修正旧 Claude 任务在 `Stop` 后因 `SubagentStop`/工具尾事件长期假 running：只有新 `UserPromptSubmit` 可开启父 Turn，App 明确终态优先同 Turn Hook 尾事件。增加 Claude-only“同步 Claude 状态”与成功打开后的单项静默 state/unread 同步；必须复用同一 singleflight/revision 发布链，不提供人工完成/已读覆盖，不新增公共 preload、持久化 schema 或 Claude App 写入。相关旧文档采用链接式逻辑归档并同步全局规则；当前不得物理迁移。 |
| RAW-025 | active | 更新引入（Codex Companion RAW-154）：Claude completed/stopped 任务级归档改为 macOS App `1.26832.0` 门禁下的 D′ 受控静默元数据事务。只允许使用普通库存建立的唯一私有 `sessionId → local_*.json` 索引，写前复核 phase、身份、stat/hash，只把单一目标的 `isArchived` 改为 true，经同目录临时文件核验后原子替换；禁止 Deep Link、AX/JXA、LevelDB、扫改目录和非目标会话。元数据 true + 私有活动库存移除即为成功，App 日志仅作增强证据；安全回滚失败或并发修改不确定时保留卡片。 |
| RAW-026 | active | Claude 文件 watcher 必须按已登记的精确文件发布 Provider-neutral membership mutation delta，正常变化至 Controller 原子任务包 P95 不超过 250ms；丢 callback 时一秒 watchdog 只检查私有索引并在 1.25 秒内恢复。该通路不等待 quota/state/unread/完整 inventory。普通打开在 Deep Link 前复核唯一目标仍存在且未归档；统一任务 Dispatcher 和五秒二次确认快捷调用不得把 archive 退化为 open。 |
| RAW-027 | active | 修复 Claude 从进行中到已完成未读被吞和延迟后已在 App 打开而消失：最终任务包对 Claude membership/phase/unread 使用独立 generation，任一 lane 不得推进或覆盖其它 lane；Host 与 Renderer 的 state/inventory/unread 订阅必须多播，不得以单 callback 覆盖；Host 早于首个 inventory 订阅时，首次冷 inventory 必须动态安装发现目录 watcher；并发 unread 读取加入同一 Promise，异步结果提交前在最新任务包上重放且拒绝旧 generation。正常可信推送不得触发 quota/environment/full inventory，只有冷启动、重连或明确 membership gap 才执行 Claude-only inventory。列表和循环层内按最近提问倒序，第一下前后任务立即打开，只有 in-flight 时才保留最终尾随目标。 |
| RAW-028 | active | 修复正常回复被通用 `Stopping session` 降为待继续、原生未读无法恢复完成态、Claude 库存固定数量截断、归档二次确认消失和普通元数据变化导致归档偶发失败。通用 session-end 不覆盖同 Turn 成功 Stop/Result；live 状态优先，否则原生 unread 将任何非 live 历史恢复为 completed-unread，清除 unread 只回 completed，新 Prompt 才恢复 running。最终 V3 任务包原子更新卡片/Tab/项目/分组/角标/动作；Claude inventory 不设固定总数上限。归档确认绑定 Provider+task+terminalEpoch，revision/unread/focus/alias churn 不取消；Claude D′ 行为在 RAW-159 中保持不变。 |
| RAW-029 | active | Claude D′ 成功提示必须明确分离两项事实：EyPc 归档已完成且任务已从 EyPc 列表移除；Claude 原生侧栏当前尚未确认同步、可能仍待刷新。继续核验真正的原生侧栏及时收敛，但只有受支持的原生动作入口、同一会话原生 ACK 与运行中侧栏在 1.25 秒内移除同时成立才可接纳；元数据/LevelDB 写入、私有 IPC、AX/JXA/UI 自动化、重启或事后视觉结果均不得冒充原生收敛。 |
| RAW-030 | active | 更新引入（Codex Companion RAW-160）：修复 Claude 实际终止但 EyPc 仍显示 running。当前 `session.phase` 的较新因果事件必须优先于 `previous.phase`，延迟的旧 inventory/cache generation 不得覆盖 watcher/打开后定向刷新；phase、phaseRevision、statusEnteredAt、unread 与 capabilities 原子更新，并仅在消费者 selector 变化时发布。D′ 成功文案进一步固定为“EyPc 已归档并移除。Claude 原生侧栏同步未确认，当前不受支持。” |
| RAW-031 | active | Claude Hook 已写队列但隐藏 Host 未及时消费属于 P0。状态、任务成员关系与 unread authority 必须在进程生命周期 Host 中以原生文件回调立即 drain/read，首个真实变化不得进入可被 `background-hidden` 节流的 JavaScript timer；已登记目标通知丢失由 1 秒 Node StatWatcher 恢复。部分任务 JSON 保留最后可信成员关系，同值 unread 指纹零通知；语义不变时零 revision、零 Main/Float 推送，状态真实终点以 Float applied ACK 计时。 |
| RAW-032 | active | 当前 Claude App `1.28929.0` 的固定无内容日志语法与 D′ 元数据结构必须经显式版本门禁适配；未知相邻版本继续 fail closed，日志冷重放不得伪造 live running。可见 stopped/“待继续”任务允许从任务行直接发起归档，但不得移除五秒二次确认、同 key Dispatcher 或写前精确身份/phase/stat/hash 复核。 |

## Source Lineage

- RAW-001–007：来自连续截图核验、行为纠正和明确选项选择。
- RAW-008–010：来自对计划、文档、选择账本、技术路线和严格测试通路的明确补充。
- RAW-011–017：来自最终批准的“Codex 同构状态与全局缓存改造”执行计划。
- RAW-018：来自对该计划验证范围与规则执行时点的明确纠正；修订的是规划门禁，不改变 Claude 产品行为合同。
- RAW-019–023：来自本轮对真实 Claude App 额度、状态刷新、项目归属、来源视觉及完成态已读回跳的明确修复计划。
- RAW-024：来自对 App 已完成/已读旧任务仍显示 running 的实测反馈及后续明确实现计划；同时固定单项真实同步、无人工覆盖、全局链接式归档和无物理迁移边界。
- RAW-025–026：来自 Codex Companion RAW-154 已锁定方案；取代 RAW-150 的 Claude Deep Link+AX 归档路线，并补齐外部 App 归档到 Controller 发布、归档后禁止旧导航重新打开及统一动作分发边界。
- RAW-027：来自真实 running→completed-unread 丢失、可能因延迟期间已在 Claude 打开而消失，以及前后任务明显慢于卡片点击的复现；由 Codex Companion RAW-155 统一收口。
- RAW-028：来自正常 Claude 回复被误判待继续、完成未读丢失、固定任务数量、归档确认和归档竞态的连续实测；由 Codex Companion RAW-155 增量统一收口。
- RAW-029：来自对 D′ 用户提示语与 Claude 原生侧栏及时收敛能力的明确拆分、核验和继续执行授权；D-1 直接实施，D-2 先做只读证据核验，不能在缺少受支持入口时越过安全边界。
- RAW-030：来自 RAW-160 对 Claude 终态角标滞后、旧 phase 反压和精确归档结果文案的统一修复；不扩大 Claude 原生写入范围。
- RAW-031–032：来自隐藏 Host 45/93 秒延迟的运行时定位、当前 Claude App `1.28929.0` 兼容性缺口，以及用户对“待继续可直接归档”的明确补充；不授权真实用户任务归档。
- 旧需求证据仍留在其原任务目录；当前取代关系由 [spec.md](spec.md#L1) 的 `DEC-* / ARCH-*` 记录管理。
