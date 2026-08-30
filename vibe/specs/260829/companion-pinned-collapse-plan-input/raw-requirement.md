# RAW-189：置顶折叠稳定顺序、当前交互切换与构建身份可见性

Tool: codex · Date: 2026-08-29 · Level: Standard（需求）

## 输入规范化边界

本记录只保存可执行产品语义与匿名核验结论，不保存原始提示词、截图中的任务名称、会话正文、原始任务身份或日志逐字转录。

## 规范化需求

- 动态页顶部「置顶」分组的公开顺序必须由 EyPc 持久化的本地任务置顶顺序唯一决定。任务已完成/已读后，`lastQuestionAt`、`updatedAt`、成员 revision、完成时间或其它后台 metadata 变化不得让置顶行跳位；只有用户显式调整本地置顶顺序才允许改变。
- 「置顶」分组可以折叠和展开。展开时标题不占快捷编号，编号按当前真正可见、可执行的任务行动态分配；折叠时隐藏全部置顶任务行，并在分组标题上只显示一个编号，含义固定为「展开置顶」。
- 折叠标题上的 `Alt+数字` 只执行展开，不打开任务；展开后必须立即按新可见顺序重算编号，后续 `Alt+数字` 打开对应任务。其后的非置顶可见任务在折叠时自然前移一个编号，不得为被隐藏的每条置顶任务保留空号。`Alt+F` 仍是 task-only，不把分组标题当成任务。
- 置顶分组折叠状态只属于当前 Float 会话，不新增持久配置；项目页既有项目折叠状态与此无关。
- 已完成任务若仍存在**当前、精确、未解决**的 interaction，普通问题与 Plan 选择/实施公开为「待输入」，审批公开为「待确认」，无论同一完成 Turn 当前是已读还是未读。未读证据在私有 lane 中保留；interaction 因果关闭后，若仍未读才回到「已完成未读」。因此「进行中 → 待输入/待确认」与反向恢复都必须直接切换，绝不能把「已完成未读」发布成中间帧。
- 已完成 Plan 之后若出现更新的 `default` Turn，只有该 Turn 出现结构化文件变更（`fileChange` / `patch_apply`）才构成旧 artifact 的精确 `execution-start` 消费证据；该 Turn 完成后必须按真实 unread 进入「已完成未读」或「已完成」，不得被旧 Plan 覆盖成「待继续」。只有 `task_started`、AgentMessage、reasoning 或普通补充问答时仍保留旧 Plan，避免把解释/追问误判为已实施。
- 因果更新的真实 running 仍高于旧 interaction：用户回答/批准后，更新 Turn / execution-start / 明确 plain-active runtime 必须立即把任务转为「进行中」，不得先闪成「已完成」。当 App Server running 已按统一 live-evidence sequence 胜出时，较旧 Desktop refollow/sticky shadow 的 waiting flag 不得再次否决它；只有更新的精确 interaction 才能重新进入等待。
- Desktop 只把请求数组暂时替换为空，不构成 Plan interaction 的因果关闭。Plan 请求必须由匹配的 resolved/cancelled/execution-started、新 Turn 或明确 plain-active runtime 关闭；关闭后旧空数组、旧快照或 refollow 不得把等待恢复。
- Codex「运行」配置页必须展示当前宿主产物自己的打包时间。时间、包版本与 `artifact-ready/missing` 必须直接读取当前 Preload 已加载的 `runtime-identity.cjs`，并随 Runtime Identity handshake 投影；不得从源码 mtime、当前进程启动时间或 Renderer 构建时间猜测。文案必须区分「当前宿主产物」与磁盘上可能更新的 `dist`，并明确 `pnpm run build` 只生成 `artifact-ready`，不会自动形成 `host-loaded`。
- Task Snapshot 与 Command 公开字段形状保持不变；Runtime Identity 只新增非私密的 `artifactState/builtAt/builtAtLocal/packageVersion` 产物凭据。Kernel 继续独占 phase、分组、候选顺序和计数，Float 只消费顺序与派发既有命令。

## 需求变更评审

`scanned_owners`：[RAW-167](../../requirements/codex-quick-task-view-raw-167.md#L1)、[RAW-178#3](../../requirements/invariants-raw-178-clause-003.md#L1)、[RAW-179#1](../../requirements/shared-raw-179-clause-001.md#L1)、[RAW-183](../../requirements/shared-raw-183.md#L1)、[RAW-188](../../requirements/shared-raw-188.md#L1)、[PRODUCT_REQUIREMENTS](../../PRODUCT_REQUIREMENTS.md#L250)、[ARCHITECTURE](../../../knowledge/ARCHITECTURE.md#L139)。

| 操作 | 条款 | 处置 |
| --- | --- | --- |
| refined | RAW-183 / RAW-188 置顶列表稳定顺序 | 置顶公开分组及其零未读兜底改用持久化本地置顶顺序；metadata-only 更新既不改变当前轮次，也不改变公开置顶顺序 |
| refined | RAW-167 常驻可见任务编号 | 折叠的置顶分组标题成为一个仅展开的可执行编号；展开后编号重新落到可见任务行，`Alt+F` 仍只标记任务 |
| refined | RAW-179#1 interaction 与 artifact 分离 | 仍只有当前 interaction 产生等待；精确当前普通输入、审批、Plan 选择/实施 interaction 均在 terminal 上先于 unread 展示，unread 作为潜在状态保留 |
| refined | RAW-179#1 artifact 消费边界 | 更新 default Turn 的结构化文件变更写入 `execution-start` clear；纯补充 Turn 不清旧 Plan，后续真实完成不再被旧 artifact 覆盖成待继续 |
| clarified | waiting clear causality | 请求数组消失不是 Plan 关闭证据；匹配终态、新 Turn、execution-start 或 plain-active runtime 才关闭 |
| refined | running / waiting 跨来源因果与公开合同 | 因果更新的 running 仍第一优先；已胜出的 App Server running 不接纳较旧 refollow waiting flag，精确更新 interaction 可直接进入等待；Task Snapshot/Command 无新增字段 |
| refined | RAW-178#3 构建、加载与运行验收分层 | Codex 运行页展示当前 Preload 产物自带的时间与包版本；Runtime Identity 增加非私密产物元数据，但继续把 build 的 `artifact-ready` 与真实宿主 `host-loaded` 分开 |

`decision`：`DEC-20260829-03 + DEC-20260829-04 + DEC-20260829-05 + DEC-20260829-06 + DEC-20260829-07 / explicit-current-request`。

## 验收意图

- 两条已完成已读置顶任务即使后台更新时间倒序变化，公开顺序与零未读兜底顺序仍不变；显式本地置顶重排后才变化。
- 展开时置顶任务拿到首批 `Alt+数字`；折叠后置顶标题只保留一个编号，后续可见任务从下一号连续编号；触发该编号只展开，展开后编号立即重算并可打开正确任务。
- 已完成（已读或未读）+ 当前普通输入、审批或 Plan 选择/实施请求，分别直接显示「待输入」或「待确认」；请求显式 resolved 后才回到对应的真实终态。
- bare empty request patch 不清 Plan 等待；新 Turn / plain-active runtime 立即清除旧等待并进入「进行中」，较旧 refollow waiting 不得回弹，也不经过「已完成未读」闪烁。
- 已完成 Plan 后的更新 default Turn 若包含结构化文件变更，Plan lifecycle 变为 `cleared/execution-start`，Turn 完成后归入真实完成组；仅有 AgentMessage 的补充 Turn 仍保留 Plan。
- 对普通输入、审批与 Plan 请求逐一验证「进行中 ↔ 等待」直接切换；任何一次语义发布都不得出现临时「已完成未读」。
- 每次 production build 都重写 `dist/runtime-identity.cjs` 的 ISO/本地时间与包版本；Codex 运行页显示的时间必须来自当前宿主实际加载的同一产物，并同时提示身份匹配或需重载。
