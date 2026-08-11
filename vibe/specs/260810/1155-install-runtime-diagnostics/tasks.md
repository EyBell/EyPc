# RAW-160 Companion V4 Task Checklist

## Implementation

- [x] `task-state-v10 / companion-task-kernel-v4 / companion-task-package-v4 / companion-task-actions-v2`
- [x] branch causality、main/Side Chat 聚合、active/terminal verifying、ordinary interrupted idle-confirmed
- [x] Plan ready/revision/pause 生命周期及 exact default Turn 清除
- [x] 动态窗口 Plan 例外、独立 input badge、通用 Plan cycle、local-pin fallback
- [x] 暂停收据、旧 hidden Plan 幂等迁移、已暂停分区、四槽、抽屉和批量动作
- [x] Execute Plan 能力探测、五秒两击、single-flight、open/resume/start、indeterminate 复读
- [x] Kernel Latest Cache 与全消费者 revision/selector fingerprint 去重
- [x] Float task lane、received/applied/rejected ACK、500ms 单次重发、1s 受控重建
- [x] Claude 新 phase 优先与归档提示拆分
- [x] 哈希 taskRef、固定执行指令零公共包/日志/收据
- [x] Kernel 缺失/Runtime Identity 不一致 `reload-required`
- [x] canonical/public Preload 同步与 uTools validator V4 标记

## Automated Verification

- [x] 13 个受影响文件矩阵 `445/445`
- [x] 首次/修改 Plan、实施确认、普通/Plan interrupted、default execution 真值表
- [x] 分支聚合、Plan 时间窗口例外、循环优先级、暂停与迁移
- [x] Execute Plan 首击零 RPC、取消、能力禁用、阶段失败/成功/不确定、模型/effort、single-flight
- [x] 1,000 等价 observation 后全消费者新增同步为 0
- [x] Float applied ACK、同 revision 对象复用与恢复
- [x] Claude running→terminal、乱序 phase 与归档提示
- [x] 240 项、全分页、第 41/101/201、Codex 归档、Runtime Identity 回归
- [x] 状态所有权静态门禁
- [x] 最终全仓 `83/83` files、`1282/1282` tests、typecheck、1870-module production build、镜像/语法、validator
- [x] 文档 code-link、规则一致性、44/14/12 sync group 合同与 diff 审计

## Real Host Acceptance

- [ ] Plan 尚未生成时稳定进行中
- [ ] Plan 完成后待输入；未执行中断后稳定待继续并突破动态小时窗口
- [ ] 暂停跨刷新/重启/refollow，恢复与 default execution 清除正确
- [ ] 旧 waiting Plan 仍进入角标/快捷键，普通问题/审批保持更高优先级
- [ ] Claude running→terminal 实时收敛且归档提示不暗示原生侧栏已同步
- [ ] 上一个/下一个与同 revision 角标一致
- [ ] Float ACK 与漏 ACK 恢复
- [ ] 真实 Execute Plan（另行授权）
- [ ] 真实 Claude D′ 归档（另行授权；非本轮默认步骤）
