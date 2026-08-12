# RAW-160 → RAW-161 Companion V4 Task Checklist

## Implementation

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
- [ ] uTools 开发模式重新加载当前身份并回归；1.5.4/1.5.5 与 `host-252d…` 均为旧基线，当前目标为 `host-78205ae167fc7b27c653 / renderer-9c35abd09a8a390040c5`
- [x] 全仓升级触发：用户明确要求中央状态缺陷逃逸后执行 `pnpm run verify`
- [x] 文档 code-link、规则一致性、49 documents / 26 dependencies / 25 validators sync group 合同与 diff 审计

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

- [ ] 主任务运行+Side 终态、Side 运行+主 interrupted、旧 idle+新 active 均持续显示进行中
- [ ] 超过 10 分钟旧 alias、生命周期重建和两个并发过期请求仍打开同一待输入任务；失败不打开其它任务且不推进队列
- [ ] 卡片、标题、Enter、紧凑待输入角标和 uTools 全局待输入入口打开同一目标
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
