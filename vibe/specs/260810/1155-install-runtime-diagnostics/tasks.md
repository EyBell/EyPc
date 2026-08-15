# RAW-160 → RAW-166 Companion V4 Task Checklist

## Implementation

- [x] RAW-162 process-only Goal evidence cache、updated/cleared 通知与有界 get/retry/unsupported 门禁
- [x] RAW-162 Goal-aware Kernel 分支聚合、Goal-only 原子 package 与新 Turn epoch 取代
- [x] RAW-162 active/complete/四类待继续/无 Goal/失败与隐私回归
- [x] RAW-163 main/Side 私有角色与分支 unread evidence；main completed-read 后才开放 Side Chat 聚合
- [x] RAW-163 phase/unread 原子主任务优先归约；删除 Side Chat navigation target，全部入口固定打开 parent
- [x] RAW-164 `sessionId/forkedFromId` 库存 Side Chat 拓扑、嵌套归根、异常独立与公共根-only 库存
- [x] RAW-164 Desktop side 判定优先于 inventory membership；运行事件/快照/重连/归档不制造 child 顶层行
- [x] RAW-164 Kernel 全珠子聚合，删除 main completed-read 门槛；running > completed-unread > completed，active/unread 分组计数互斥
- [x] RAW-164 Goal/unread/read-ack 乱序稳定性与三类匿名语义诊断
- [x] RAW-165 库存读取与 terminal 因果解耦、稳定跨 transport 分支引用、逐分支 Turn epoch 合并
- [x] RAW-165 approval/input > running 注意力优先级、Side authority 隔离与最终 canonical push 判断
- [x] RAW-165 Claude completion/focus 热未读覆盖 LevelDB 落盘延迟；cold replay、同秒事件和持久快照迟到回滚门禁

- [x] `task-state-v10 / companion-task-kernel-v4 / companion-task-package-v4 / companion-task-actions-v2`
- [x] branch causality、main/Side Chat 聚合、active/terminal verifying、ordinary interrupted idle-confirmed
- [x] Plan ready/revision/pause 生命周期及 exact default Turn 清除
- [x] 动态窗口 Plan 例外、独立 input badge、通用 Plan cycle、local-pin fallback
- [x] 暂停收据、旧 hidden Plan 幂等迁移、已暂停分区、四槽、抽屉和批量动作
- [x] Plan 菜单能力不依赖专用 Implement Plan 请求；Execute 五秒两击、Host 精确预检、single-flight、open/resume/start、indeterminate 复读
- [x] Kernel Latest Cache 与全消费者 revision/selector fingerprint 去重
- [x] Float task lane、received/applied/rejected ACK、500ms 单次重发、1s 受控重建
- [x] Claude 新 phase 优先与归档提示拆分
- [x] Claude hidden-Host Hook/App-log/成员关系/unread 首事件即时 drain/read、已登记文件 Node StatWatcher 1 秒恢复、App `1.28929.0` 状态/归档白名单
- [x] Codex 原生未读首个目录事件即时读取、已登记文件 1 秒 StatWatcher 补漏、watcher 错误自愈与原子 rename
- [x] persisted unread true 对仍 active 的同 key 强制 latest-Turn 复核；旧 exact active 不抑制，更新正向序号拒绝迟到终态
- [x] 删除 Renderer `phaseOnly` 周期恢复权威；Codex rollout 文件改由进程 Host native+stat watcher
- [x] Branch Evidence deferred staging 与匹配 Host draft 单语义提交；一次事件最多一次 package revision
- [x] Codex/Claude 待继续任务直接归档，保留两次确认与写前精确复核
- [x] 哈希 taskRef、固定执行指令零公共包/日志/收据
- [x] Kernel 缺失/Runtime Identity 不一致 `reload-required`
- [x] canonical/public Preload 同步与 uTools validator V4 标记
- [x] Codex `sessions/archived_sessions` 精确 membership watcher 与 1 秒 StatWatcher 漏通知恢复
- [x] `archived:false/true` 全分页对照、精确匿名 `archivedKeys` 与普通缺行隔离旁路
- [x] dirty recovery 排除 archived inventory；插件进入、IPC 重连、watcher 重建强制 tasks-only 对账
- [x] EyPc 本地 archive suppression 保留既有双核验/Desktop ACK/Kernel commit 后置条件

## Automated Verification

- [x] 历史 V4 gate `13 files / 445 tests` 与全量 `83 files / 1282 tests` 已被真实宿主三项回归否定，仅保留为回归基础
- [x] 首次/修改 Plan、实施确认、普通/Plan interrupted、default execution 真值表
- [x] 分支聚合、Plan 时间窗口例外、循环优先级、暂停与迁移
- [x] Execute Plan 首击零 RPC、取消、能力禁用、阶段失败/成功/不确定、模型/effort、single-flight
- [x] 1,000 等价 observation 后全消费者新增同步为 0
- [x] Float applied ACK、同 revision 对象复用与恢复
- [x] Claude running→terminal、乱序 phase 与归档提示
- [x] 240 项、全分页、第 41/101/201、Codex 归档、Runtime Identity 回归
- [x] 状态所有权静态门禁
- [x] 初次 rework 聚焦矩阵 `23/23` files、`489/489` tests（最终复核后由下一行取代）
- [x] 复核追加：unknown/hydration-only active 不虚构 running、待输入入口不回退本地置顶；主任务新 Turn/active 清旧 idle
- [x] 1.5.5 宿主失败返工：同 key 时忽略 Renderer 旧 alias/revision/phase 并采用 Host 当前 target；打开前不重分类；100 次焦点变化零 package revision/公开发布
- [x] 当前 Kernel/Host/Domain/Float/Claude state-membership-unread 聚焦矩阵 `20/20` files、`547/547` tests
- [x] Codex 未读恢复核心矩阵 `3/3` files、`221/221` tests；扩展真实链 `15/15` files、`433/433` tests
- [x] 用户要求的仓库级升级门禁 `83/83` files、`1328/1328` tests
- [x] 当前 typecheck、1871-module production build、Preload mirror generation、Runtime Identity 与 uTools validator
- [x] RAW-161 focused recovery：`5/5`（4 new + existing local transaction guard），覆盖无广播、StatWatcher、dirty archived、local suppression release/retain
- [x] RAW-161 完整受影响 Codex Bridge：`131/131`；typecheck、1871-module build、mirror/语法与 uTools validator
- [x] RAW-162 Goal/Turn 增量：Bridge `138/138`、Kernel `39/39`，active 跨两个 Turn、Goal complete 单次完成、四类待继续、cleared/unsupported、暂时失败、真实 timeout、乱序/重复、main/Side 与隐私矩阵通过
- [x] RAW-162 Controller+Task Package `62/62`、Float Bridge+Presentation `89/89`、Runtime Identity `5/5`；合计受影响 7 文件、333 项
- [x] RAW-162 typecheck、1871-module production build、canonical/public/dist Preload、uTools validator；身份 `host-c36f104c3a4cd42e77c2 / renderer-27b635545542097fd7b1`
- [x] RAW-163 Bridge+Kernel `177/177`（Bridge `138/138`、Kernel `39/39`）；canonical/public syntax+mirror、typecheck、1871-module build、uTools validator
- [x] RAW-163 生成身份 `host-2c01a8beb95919a22af5 / renderer-cc3ff8f60b7179ed599f`
- [x] RAW-164 Bridge+Kernel+Runtime Diagnostics `189/189`；canonical/public syntax+mirror、typecheck、1871-module build、uTools validator
- [x] RAW-164 生成身份 `host-251a728efafbf4c7f7d6 / renderer-a671d108ff9d315b7ea4`
- [x] RAW-165 受影响 8 文件、`364/364`；sync/mirror/syntax、typecheck、1871-module build、Runtime Identity 与 uTools validator
- [ ] uTools 开发模式重新加载当前身份并回归；RAW-165 及更早身份均为旧基线，当前目标为 `host-6ac8de6597dcf0dd644c / renderer-6e677d084be49c8c7878`
- [x] 全仓升级触发：用户明确要求中央状态缺陷逃逸后执行 `pnpm run verify`
- [x] RAW-163 文档 code-link、规则一致性、50 documents / 26 dependencies / 25 validators sync group 合同、final receipt 与 diff 审计；项目 broad rule baseline 137 项，本轮关键词命中 0 项
- [x] RAW-164 文档 code-link、当前合同残留、`51 documents / 26 dependencies / 28 validators` sync group、规则/diff 与 final receipt 审计；项目 broad rule baseline 133 项，本轮关键词命中 0 项
- [x] RAW-166 全量盘点 99 条 error-memory leaf，建立七模块、唯一 Primary/有限 Related、生命周期逻辑归档与简化根索引
- [x] RAW-166 error-memory validator 覆盖 identity/fingerprint、状态/日期、断链、root→module 覆盖、Primary/Related、路由环与索引上限；overdue candidate 仅告警
- [x] RAW-166 Kernel 双向 phase admission 与 phase/unread/Goal 独立 lane merge；RED→GREEN 回归覆盖旧 live 反压和 lane 擦除
- [x] RAW-166 Codex/Claude Adapter proposal 与 canonical final outcome 诊断统一；current PRD 的 RAW-163/164 冲突残留已按用户既有决策消解
- [x] RAW-166 影响选择 11 文件 `457/457`、Preload 镜像/语法、typecheck、1871-module build、Runtime Identity/uTools validator；artifact `host-6ac8de6597dcf0dd644c / renderer-6e677d084be49c8c7878`
- [x] RAW-166 code-link、rule、diff 与 `66 documents / 28 dependencies / 29 validators` receipt 收口

## 2026-08-11 Regression Rework

- [x] 私有 Branch Evidence Store 与父/Side Chat 聚合优先级
- [x] 新 active/Turn/waiting 清旧 idle；active/terminal 冲突不进入 stopped
- [x] Host 已有同 key 时直接采用当前 target、忽略 Renderer 旧字段；Host 目标缺失时才合并 provider-scoped tasks-only 解析、最多一次同 key 重试、无跨任务回退
- [x] 卡片/标题/Enter/紧凑角标/uTools 全局入口统一打开链，失败不推进队列
- [x] 打开动作不先同步任务包；焦点是 Host 私有动作上下文，不增加 package revision、不触发筛选/分类/Float 重投影
- [x] 单数字 `20×20` 圆形、两位数/`99+` 自然扩宽、预览/Float 同合同
- [x] `unknown` 作为 abstain 保留可信库存语义；新 hydration-only active 不进入 active 组
- [x] 待输入直接入口只用真实 input/approval；local pin 仅为普通循环 fallback
- [x] canonical/public Preload 由同步脚本重生成
- [x] `onPluginOut(false)` 下真实 Hook queue→Host→Kernel→Float package→applied ACK：正常 `≤250ms`、漏目录通知恢复 `≤1.25s`
- [x] 1,000 个相同 Hook 尾事件不增加通知；不完整 JSONL 尾在换行到达前不丢失
- [x] Claude App `1.28929.0` 固定日志语法与单字段归档夹具；未知相邻版本拒绝
- [x] stopped 行内归档真实派发测试（两次确认后使用当前 revision）
- [x] 部分 Claude 元数据 JSON 保留最后可信任务；同值未读指纹零通知；丢成员/未读目录通知由原生一秒 watcher 恢复
- [x] Codex 丢目录通知、watcher error、原子重写和 mainHide→Float applied 真实链；1,000 个同值 state recovery 信号零 revision/零 Float 推送
- [x] Codex persisted unread false→true 触发 latest Turn，active→completed-unread 原子收敛；Branch Evidence+公开 draft 仅一次 revision

## Real Host Acceptance

- [ ] 长期 active Goal 至少跨两个自动 Turn；Host task-package 与 Float applied 链均不得出现中间 completed，Goal complete 后只完成一次
- [ ] Goal paused/blocked/usageLimited/budgetLimited 均显示待继续；Goal cleared/普通无 Goal 会话保持既有 Turn 语义
- [ ] 主任务已完成已读或未读 + Side running 均显示进行中；无活动珠子且任一珠子未读时显示已完成未读；全部已读后显示已完成
- [ ] `thread/list` 已含 Side Chat、分页乱序、运行事件先到/Desktop 快照后到、重连与归档时都只有根任务公共行
- [ ] `runtime-identity-handshake` 报告当前 identity 为 `host-loaded`；首个可信事件立即更新，后续匿名样本只核验无回弹，不作为 20/60 秒展示等待
- [ ] Cloud 实时 active/waiting/approval/terminal 与库存并发时，注意力状态不被 Side running 或旧 terminal 覆盖；最终诊断按 canonical package 标记 accepted/superseded
- [ ] Claude 聚焦任务完成立即已读、非聚焦任务完成立即未读、聚焦后立即清除，并在同 revision Float applied；不等待 LevelDB 的延迟写入
- [ ] 超过 10 分钟旧 alias、生命周期重建和两个并发过期请求仍打开同一待输入任务；失败不打开其它任务且不推进队列
- [ ] 卡片、标题、Enter、紧凑角标、attention、previous/next 和 uTools 全局入口都只打开 parent，不直达 Side Chat
- [ ] 单数字角标为圆形，两位数/`99+` 自然扩宽，设置预览与 Float 一致
- [ ] Plan 尚未生成时稳定进行中
- [ ] Plan 完成后待输入；未执行中断后稳定待继续并突破动态小时窗口
- [ ] 暂停跨刷新/重启/refollow，恢复与 default execution 清除正确
- [ ] 旧 waiting Plan 仍进入角标/快捷键，普通问题/审批保持更高优先级
- [ ] Claude running→terminal 实时收敛且归档提示不暗示原生侧栏已同步
- [ ] 待继续任务可直接归档；恢复运行时动作必须拒绝且卡片保留
- [ ] 上一个/下一个与同 revision 角标一致
- [ ] Float ACK 与漏 ACK 恢复
- [ ] 仅在本轮 `EyPc-Regression-*` 安全测试任务上验证 Plan 执行（已授权；不得触碰既有任务）
- [ ] 本轮前缀测试任务的可恢复清理；真实 Claude D′ 归档不在本轮授权范围
- [ ] RAW-166 最终 artifact 由开发插件报告 `host-loaded`，并通过无额外等待的 Cloud/Claude event→canonical→Float applied 矩阵

## 2026-08-15 State-source Reconciliation

- [x] Claude cold/lifecycle-only SessionEnd 不制造 stopped，且不能压过 `completedTurns > 0` 的历史 completed
- [x] Claude 已观察 open Turn 的无成功 SessionEnd 仍进入 stopped；同 Turn 已成功完成不被通用 teardown 覆盖
- [x] Claude App `1.30096.5` 进入固定隐私安全语法/归档门禁，相邻未登记版本继续 fail closed
- [x] Codex Desktop-only Side 只有在 complete inventory 排除 child + 三次 exact-empty latest-Turn 后退休
- [x] waiting/Plan、App Server live、新证据与 incomplete inventory 均阻止 Side 退休；无 TTL/按时长终态
- [x] 7 文件 `340/340`、Preload 语法/镜像、typecheck、1871-module build 与 uTools validator 通过
- [x] 项目规则新增 `EYPC-COMPANION-STATE-SOURCE-001`，同步 Claude 三个固定语法版本；evolution review 为 `versioned-change-review` eligible
- [x] Current PRD、Architecture、Technical Details、Project Status、Controlled 文档和既有错误记忆同步
- [ ] uTools 开发插件加载 `host-931a95f5973c8c7f08e2 / renderer-d238ab7d0c6a67a71a5c`，完成真实父任务/Side 与 Claude lifecycle sweep 验收
