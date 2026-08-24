# RAW-176：全局任务拓扑、状态缓存与统一命令

spec_id: `SPEC-260823-COMPANION-TASK-TOPOLOGY-V5`
source_format: `chat`
source_kind: `chat-requirement-summary / V6 corrective increment`
capture_fidelity: `normalized-material-requirement`
privacy_boundary: `no-verbatim-prompt-or-transcript`
updated: `2026-08-24`

> 只记录会改变范围、行为、选择或验收的用户事实；不保存原始提示、命令、工具输出、会话身份或推理过程。

## Material Requirements

| Raw ID | State | Normalized material requirement |
| --- | --- | --- |
| RAW-176-01 | active | “折叠”统一为 Provider-neutral 的任务拓扑聚合；Codex、Cursor、Claude 的精确父子关系进入同一图模型，普通 ChatGPT 与 Claude Agent Teams 暂不推测关系。 |
| RAW-176-02 | active | Provider Registry、Topology、Snapshot、Command、Subscribe、ACK 使用一套 V5 身份合同；V4 Host 必须返回 `reload-required`，不得静默降级。 |
| RAW-176-03 | active | Host/preload 进程是动态状态唯一权威；Main、Float、角标、注意力入口及前后任务只消费同一份不可变完整 Snapshot，并按 applied revision 确认。 |
| RAW-176-04 | active | Provider 以分通道、单调 generation 的实时事件推动状态，同时提供冷启动复核；关闭窗口不清缓存，进程重启从来源重建，只持久化 EyPc 本地偏好。 |
| RAW-176-05 | active | 只有精确、同 Provider、同 family、父存在、非自身、无环且 generation 不倒退的关系才聚合；无效关系独立显示或匿名隔离，禁止标题、路径、时间、模型或 UI 位置推断。 |
| RAW-176-06 | active | 根任务状态按成员因果归约，优先级为 approval、input、running、goal、terminal；任一精确成员活动时根任务不得结束，子任务不参与循环且不重复计入角标。 |
| RAW-176-07 | active | “待输入”必须绑定 interaction/turn 因果身份；明确消失、resolved、匹配输出、新用户继续或新 Turn 才能清除，清除屏障后的旧证据不得反弹。 |
| RAW-176-08 | active | 点击、Enter、角标、全局快捷键、上一个/下一个全部调用同一 Command Gateway；请求不携带 Provider，由 Kernel 在同一 Snapshot 上解析并交给 Adapter。 |
| RAW-176-09 | active | Command 以 `operationId` 去重、按任务串行；拓扑变化后只重校验原键，不替换邻近目标；Adapter 异常只降级对应 Provider，不得使插件崩溃。 |
| RAW-176-10 | active | V1 展示为一张根卡片、`+N 子任务` 和聚合活动/注意力数量；不展示子任务标题、正文或 transcript，不提供子任务操作。 |
| RAW-176-11 | active | EyPc 别名是 Main/Float 唯一显示名；来源标题只更新 `originalTitle`，清别名才恢复；V1 不重命名子任务，也不把本地别名同步到来源。 |
| RAW-176-12 | active | 实施同步 Registry、Kernel、Provider、Main/Float/角标/循环、需求、状态、架构、帮助和错误记忆；历史问题只标记被 V5 取代，不物理删除。 |
| RAW-176-13 | active | 自动化验证覆盖拓扑、状态、待输入、缓存、命令、隐私、镜像和文档；不运行 Safari、uTools、真实插件或真实宿主测试，源码/测试/构建不得表述为宿主验收。 |
| RAW-176-14 | active | 当前任务标题保持 `260823-Cursor任务统一架构`；只有检测到可度量的 Codex 标题 API 才按 session-title owner 重命名。 |
| RAW-176-15 | active | 当前统一身份链升级为 `task-state-v11 / registry-v1 / topology-v2 / kernel-v6 / snapshot-v6 / command-v1 / subscribe-v1 / ack-v2`；旧 V5 Snapshot 或旧 ACK 不得混用。 |
| RAW-176-16 | active | Provider 只提交 V6 evidence template/batch；Topology V2 只维护精确 root/member membership，phase、unread、Plan、根聚合、分组、数字角标、循环和能力全部只由 Kernel V6 裁决。 |
| RAW-176-17 | active | Main、Float、Codex 页面、数字角标、注意力快捷键及上一个/下一个只消费公开 Snapshot 与统一 Command/Jump；不得保留 Renderer/provider 专用 watcher、同步动作、状态 reducer、计数缓存或第二轮折叠。来源专用读取只允许产 evidence 或非任务语义 metadata/quota；Kernel `unknown` 只能投影为中立不可操作状态，不得从 inventory 复活旧 phase/unread/capability。 |
| RAW-176-18 | active | 热证据不经过产品级 debounce；一次有效语义变化同步形成一次完整 Snapshot revision 并立即通知消费者。自动化门限为 Kernel 发布小于 50ms、统一打开路径 P95 小于 200ms；真实宿主显示延迟仍需单独验收。 |
| RAW-176-19 | active | 已处于“待输入”的任务收到精确补充说明、新用户消息、新 Turn 或 thinking/generating 活动后，必须立即转为“进行中”，无需等待实际回复；旧 request/waiting 证据受清除屏障约束，不得反弹。 |
| RAW-176-20 | active | Plan 完成且未读时先显示“已完成未读”；读取后，只要 Plan 卡仍存在就显示“待输入”。只有精确取消/放弃使已读 Plan 变“已完成”，执行 Plan 则立即“进行中”；未读状态仍由 Provider/native read evidence 决定。 |
| RAW-176-21 | active | Plan lifecycle 是独立的单调三态 `unknown / ready / cleared`；`unknown` 保留上一个稳定 Plan，只有更新 sequence 的 `cancel / execution-start / archive / removal` 能清除。generic `resolved`、普通完成、补充说明、默认/中断 Turn 都不能单独清 Plan。 |
| RAW-176-22 | active | 普通不完整 evidence 保留上一份 complete Snapshot；feature/inbox/Provider 配置变化是权威 configuration barrier，必须立即清除被禁用范围，不得等下一轮 Provider 扫描。 |
| RAW-176-23 | active | Float ACK V2 区分 received/applied/rejected；500ms 只重发最新 Snapshot 一次，健康窗口未返回 applied ACK 时只记录诊断，不得在约 1 秒后强制重建窗口或制造上一个/下一个崩溃。 |
| RAW-176-24 | active | 多 Agent 状态先在同一 Kernel 成员账本逐成员因果归约，再聚合为一个根任务；任何来源缓存、Renderer 重挂载或 metadata refresh 都不得覆盖该根 revision。 |
| RAW-176-25 | active | 保留 RAW-177 与 `companion-open-handoff-v1`：Deep Link/shell 的 `dispatched` 不等于 native opened/read；无匹配 native receipt 时不得清 Provider unread。公开 Snapshot 不暴露私有 alias，统一跳转按匿名 key 由 Kernel 私下解析。 |

## Change Review

| Current authority | Decision | V6 treatment |
| --- | --- | --- |
| RAW-160/164/165/174 的单 Kernel、分 lane generation、状态优先级与 Claude Turn 因果合同 | retained | 作为 V6 通用协议的既有基础。 |
| V4 Kernel 仅正式拥有 Codex/Claude，Cursor 走 Auxiliary/Controller/投影后二次折叠 | superseded | Cursor 保持正式 Provider，由同一 Snapshot/Command 路径拥有。 |
| `companion-task-actions-v2` 的 Provider-neutral Renderer intent | changed | 升级为带 selector、expected revision、operation id 的 `CompanionTaskCommandV1`。 |
| V5 Kernel 仍接收预归约 task、Topology 同时聚合状态、Renderer/Controller 仍保留来源 watcher 与 cache、Float 缺 ACK 后强制 recreate | superseded | Provider 改交 evidence；Topology 只管 membership；Kernel V6 是唯一 reducer；消费者只收 Snapshot；健康 ACK 缺失不重建。 |
| RAW-177 `dispatched`/native receipt 与 Source Anchor Catalog | retained | V6 不改变其冲突边、来源身份或未读门禁，只在统一 Command 后继续消费 handoff receipt。 |
| 既有来源专用展示 | retained-until-audit | 根卡仍显示来源标记；来源影响展示 metadata，不拥有任务 phase/count/navigation 语义。 |

`decision_status=explicit-current-request`。本轮没有未决产品语义冲突。
