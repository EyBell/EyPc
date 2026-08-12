# RAW-160 → RAW-164 Companion V4 Host Handoff

Status: `increment-automated-verified / rebuilt-artifact-ready / dev-plugin-reload-pending`

## 安装边界

1. 用户已指定只用 uTools 开发模式回归，不再以离线包安装作为本轮门禁。重新加载开发插件并记录四端 Runtime Identity。
   当前源码/构建身份：`host-251a728efafbf4c7f7d6 / renderer-a671d108ff9d315b7ea4`。`host-2c01… / renderer-cc3f…` 是 RAW-163 基线，`host-c36f… / renderer-27b6…` 是 RAW-162 基线，`host-78205… / renderer-9c35…` 是 RAW-161 基线，`host-252d… / renderer-ff8…` 是 RAW-160 全量基线；1.5.4、1.5.5、`host-7d…` 与更早开发 Host 均不能用于接纳当前结果，也不得与当前 Renderer 混用。必须以匿名 `runtime-identity-handshake` 的 `host-loaded` 为准，不再从进程时间推断。
2. 不清空 EyPc 本地任务组织数据；需验证旧 hidden Plan 的一次幂等迁移。
3. 用只读诊断按 session/operation/哈希 taskRef 核验；不得记录或粘贴 Plan 正文、原始任务 ID/路径或执行提示。

## 状态、窗口与循环矩阵

1. 主任务 completed-read 或 completed-unread + Side running 时，父任务都显示进行中；任一珠子 running 都高于任一珠子的 completed-unread/completed。
2. 无活动珠子且任一 main/Side completed-unread 时父任务显示已完成未读；全部珠子 completed-read 后才显示已完成。活动期间潜在 unread 不得同时增加已完成未读分组/计数。
3. 新建 Plan 会话：Plan 尚未生成时保持进行中；生成完成且实施确认未决时变为待输入。
4. 继续修改已生成 Plan：运行期间保持进行中及同一 Plan 生命周期；新 Plan 替换时 revision 更新。
5. 未执行便中断：完成定向复核后稳定待继续；把活动时间移出动态窗口后仍在待继续分组。
6. 普通 interrupted：复核期间保持稳定态/核验中，不得抢在真实 active 前显示待继续。
7. waiting Plan 超出动态小时窗口：展开列表可不显示，但待输入角标和通用 Plan 循环仍能打开；普通问题/审批优先。
8. 检查上一个/下一个：普通 attention → Plan → active → local pin，且与同 revision 角标一致。

## 打开与角标回归矩阵

1. 保留一个待输入任务超过 alias 10 分钟有效期，再依次用卡片主体、标题、Enter、紧凑待输入角标和 uTools 全局待输入入口打开；五条路径必须命中同一任务。
2. 让该主任务拥有一个 active 或 completed-unread Side Chat；卡片、标题、Enter、紧凑角标、attention、previous/next 与全局入口仍必须只打开主任务 URL，不能先打开 Side Chat 或出现回退文案。
3. 重建 Renderer 生命周期后，用携带旧 alias/revision/phase 的卡片点击；只要 Host 仍持有同 key，必须直接采用 Host 当前 target，零库存读取、零 `stale-target`、零分类包发布。只有 Host target/私有映射确实缺失时才定向恢复；并发缺失请求共享一次解析并只重试同 key 一次。
4. 让目标从可信库存消失或制造预检失败；不得打开其它任务，不得推进待输入队列/已读。
5. 分别观察 1、10、`99+`：1 为 `20×20` 圆形，10/`99+` 只按内容自然扩宽；颜色、边框、位置和动作不变。设置预览与 Float 必须一致。
6. 清空真实 input/approval 后触发待输入入口，必须返回无候选，不得打开本地置顶或任何其它任务；普通前后切换仍可在前三层为空时进入本地置顶。
7. 点击/聚焦任意卡片后记录 package revision 与其它任务分组：焦点可以更新 Host 当前动作目标，但不得增加 revision、重发任务包、展开筛选或让无关任务重新归类。
8. 对一条待继续任务直接点击“归”或菜单归档：第一次只进入确认，第二次才提交；不要求先改成 completed。若任务已恢复运行，动作必须拒绝并保留卡片。

## 暂停与界面矩阵

1. 对 Plan-ready 点击“暂”，确认它从动态、角标和所有循环候选消失，并进入已隐藏页顶部“已暂停”。
2. 依次验证 Float/mainHide、Renderer 重挂、refollow 和完整 uTools 重启后仍暂停。
3. 点击“恢”恢复；对 paused Plan 发起 exact default 执行 Turn，确认 paused 与 planReady 自动清除。
4. 检查普通 `顶/隐/归/+`、Plan `顶/暂/归/执`、paused Plan `顶/恢/归/执`，以及抽屉新会话、批量暂停/恢复、键盘焦点和 ARIA。
5. 选择一个已完成 Plan 但 Codex 未显示专用 `Implement Plan` 请求的任务；“暂/执”仍须可用。第二击时如最新 Turn 已运行或存在普通输入/审批，Host 应拒绝执行而不是在菜单阶段永久禁用。

## Publication 与 Float ACK

1. 对同一状态执行重复 watcher/inventory/refollow，确认 package revision、publishedAt、角标、导航游标和 Execute 确认不变化。
2. 连续切换至少 100 次 Renderer 焦点，确认 Host 保存最后焦点，但 Main/Float package revision、发布次数和分组全部不变。
3. 观察 Float 正常 received→applied ACK；模拟首个 applied ACK 丢失时仅重发最新包一次。
4. 心跳健康且累计 1 秒未 applied 才允许受控重建；同 revision 不重复 Vue 投影。
5. 触发库存分页乱序、Side 运行事件先到而 Desktop 快照后到、桥重连与归档；公共任务包始终只有根任务，Side Chat 不得出现独立顶层行。匿名 `side-topology-decision` 与 `parent-state-decision` 仅在语义变化时出现，且不含 raw ID、标题、正文、路径或 Goal 内容。

## Cloud Goal 完成边界矩阵

1. 选择一条当前 Goal 为 active、会自动继续执行的安全 canary，至少跨两个 `turn/completed → next turn/started`。任务卡、计数、Host task-package 和 Float applied revision 全程只能保持进行中/待输入/待审批，不得出现任何中间 completed。
2. 当前 Goal 真正变为 complete 后，按最终 unread 只发布一次 completed-unread 或 completed；成功打开后转 completed。旧 unread true/false、重复 Goal 通知、迟到 `thread/goal/get`、旧完整快照和同 Turn 元数据补全都不得回滚。严格更新的新 Turn 必须开启新执行 epoch 并恢复进行中。
3. 分别观察 paused、blocked、usageLimited、budgetLimited：四者都进入现有“待继续”，不新增 Tab/角标。Goal cleared 或普通无 Goal 会话继续服从既有 Turn 完成语义。
4. 暂时断开/延迟 Goal 查询时，旧稳定非终态只能显示核验中，不得先完成再纠正；只在当前 App Server 明确不支持 Goal RPC 时执行兼容回退。
5. 诊断仅核对匿名 taskRef、phase、reason、revision 与 Float applied；不得采集 Goal objective、原始 task/Turn ID、额度、用量或任务输出。

## Claude 矩阵

1. 确认 Claude App 为已适配的 `1.28929.0`。让一个 Claude 任务从 running 正常终止，确认新 phase 不被旧 inventory cache 覆盖，卡片/角标与循环同 revision 收敛。
2. Main 隐藏、Float 保持时重复 running→completed，并观察成员加入/移除与 unread 变化：首个不同文件事件应即时收敛；诊断终点必须是 Float applied，不得只记录 watcher callback。自动化门禁已锁定正常 `≤250ms`、漏通知恢复 `≤1.25s`；开发 Host 不应再出现 45/93 秒 timer 延迟。部分会话 JSON 写入期间不得临时删卡，同值未读不得重复推送。
3. 已有授权的 D′ 结果只检查提示文案：“EyPc 已归档并移除。Claude 原生侧栏同步未确认，当前不受支持。”
4. 不把 Claude 侧栏自行刷新视为 EyPc 能力；不执行 AX/JXA、重启或 UI 自动化。

## Codex 未读与终态恢复矩阵

1. Main 隐藏且 Float 保持时，让一条 Codex 任务从 active 真实完成并进入原生未读；原生目录事件正常时应立即进入 Host，卡片与完成未读分类在同一 package revision 收敛。
2. 人为丢弃一次目录通知，确认已登记状态文件的 1 秒 StatWatcher 恢复；制造目录 watcher error 后确认自动重建，再以原子 rename 重写状态文件。三条路径都不得依赖 Renderer 可见或 `phaseOnly` interval。
3. 在旧 exact active/turn-started 残留时触发 persisted unread false→true；必须定向读取同 key 最新 Turn并完成终态。核验期间若出现更新 active/Turn，则迟到 terminal 必须被正向 sequence 拒绝。
4. 连续产生 1,000 个未读文件同值/mtime-only 恢复信号，确认 package revision、Float send/applied 和 Renderer 投影均不增长。
5. 对同一真实 Codex activity 核对 Branch Store 与公开任务包：只允许一个 Host semantic commit、一个 package revision；不得先发布私有分支决策、再为同一事件发布第二包。

## Codex Desktop 外部归档恢复矩阵

1. 在 Codex Desktop 原生侧手动归档一条 EyPc 当前可见、非本轮自动化创建的安全观察任务；不触发 EyPc 归档按钮，也不依赖 `thread-archived` 广播。目标应在 native 归档完成后从 EyPc 卡片、分组、计数、角标和循环候选同 revision 移除。
2. 诊断应出现脱敏 `codex-inventory-membership / archived-confirmed`，并记录未归档/归档计数和 `confirmedArchivedCount`，不得含 raw ID、路径或任务正文。
3. 人为丢弃一次 membership 目录事件时，1 秒 StatWatcher 应在总计 `≤1.25s` 内完成 `archived:false/true` 对照和移除；制造 watcher error 后应重建并强制一次 Codex tasks-only 对账。
4. 重新进入插件与 Desktop IPC 重连各执行一次 tasks-only 对账；库存相同不得增加任务包 revision。将已归档任务标为 dirty 的夹具不得调用该目标 `thread/read` 或把卡片补回。
5. EyPc 自己的归档仍单独验收双库存核验、连接 Desktop ACK、第二次核验与 Kernel commit；外部 membership watcher 不得让一次本地 indeterminate 归档乐观消失。

## 测试授权边界

- 用户已授权在本轮 `EyPc-Regression-<run-id>-*` 无副作用测试任务中执行安全 Plan/Turn，并在确认可恢复后清理；不得把该授权扩展到既有用户任务。
- 真实 Claude D′ 归档会写目标本地元数据，不属于本轮授权；Claude 测试只使用本轮新建的无副作用会话和可恢复清理。

## 完成条件

只有 [verification](verify.md#L1) 的当前自动化/构建证据与以上矩阵来自同一源码、同一开发模式 Runtime Identity，且握手先报告 `host-loaded`、20 秒稳定窗口后两次匿名快照一致，才可从 `dev-plugin-reload-pending` 变为完成。
