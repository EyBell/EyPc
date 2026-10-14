# Companion 验证影响映射

验证策略唯一 owner：[CodeNote testing rules](../../../../../czz/CzzProj/CodeNote/AiRef/VibePractice/Vibe_Rules/testing/rules.md#core-preservation-automatic-gates)。此文件只登记当前项目的消费者和执行入口。

| 变更选择器 | 已接受核心行为 | 自动入口 / 定向证据 | 消费者 | 验证边界 |
| --- | --- | --- | --- | --- |
| Companion Kernel phase / topology / interaction / unread / archive | 主 input 优先；活动子成员提升根卡；历史子终态不清主 running；当前输入优先潜在未读；根卡唯一；活动成员禁止归档 | validate-utools-runtime 自动调用 check-companion-core-invariants，source/dist 各自执行核心、生命周期及 native unread/成员独立检查；Kernel/Topology/TaskPackage/Presentation 与 provider Adapter 定向测试 | canonical snapshot → Main/Float 角标/分组/cycle/归档 | 包内语义已覆盖；宿主像素、跨时刻未读不由构建证明 |
| 核心自动门禁本身 / 原测试预期变更 | 独立 oracle 不随原 Vitest 断言改变；已知 child-only 错误仍必须拒绝 | tests/scripts/companionCoreInvariants.test.ts 正向与负向 canary；已有构建入口仍保留 | source → 生产包验证 | 不能自动裁决真实需求变更，仍须原有 review |
| Rollout decision cache | 文件不变只复用解析，强制探测仍应用原有状态归约；不降检测频率 | codexRolloutDecisionCache 与 codexAsyncQuestions 定向测试；Bridge 既有状态回归 | 文件监听/进程探测 → 归约 → Main/Float | 实际 CPU 与宿主时序独立验收；既有失败不改断言隐藏 |
| 原生 schema/IPC version、Desktop-only Side、成员交互与 Side 终态查询 | 单一 identity/host；主/子请求与 epoch 独立；未答问题维持；Side 新完成更新根未读；主缓存不能代替子查询 | 原 validate-utools-runtime 的 check-companion-native-unread；11 项 gate 正向/负向 canary；四成员较早终态/较新主轮次独立与实际 Bridge→Kernel 组合回归，含较晚 completed/aborted 生成保留 Side 问题；async questions | 原生持久与 IPC → member evidence → 唯一 root → Main/Float | source/packaged 可证解析与因果语义；原生像素、全部真实生命周期独立；未知身份形式保守 unavailable |

前序1425验证（历史）：2026-10-13；Side 关系撤回/已接纳图与归档清理、未读/打开竞态、匿名恢复日志及根相位 Provider 关联见 [续核](../specs/261013/1425-codex-side-phase/lifecycle-verify.md#L1)。触发规则和负向 canary 证据见[本轮审计](../specs/261013/1425-codex-side-phase/audit.md#L1)。


## 当前 Side 终态与主结束验证

- 成员终态/Goal/清退：`codexAsyncQuestions.test.ts` 覆盖 canonical 完整边界、能力和成员因果；`codexAppServerBridge.test.ts` 覆盖成员自身轮次、已读/未读、新活动/等待、IPC reset、普通 Side Goal 重试及同批节点/关系撤回。临时 Side 同类任务已做安装后对照；原归档目标不作为完成样本。
- 内部评审资格：`codexSubagentDiscovery` / `codexAsyncQuestions` 覆盖精确来源、未知保持和 snapshot/patch；Bridge覆盖库存/实时/恢复提示、更正后的原子撤回及迟到结果，保留普通子代理、用户 Side。独立 canary 必须拒绝完全不排除或过宽排除，通用 Kernel stopped 聚合不变。
- 主结束来源：Desktop main end-event ordering 17项逐次订阅每次Kernel发布，覆盖 idle/canonical/unread 顺序、held RPC、真实中断/失败、等待、新轮、Goal、普通 Side及AppServer-only子运行；来源纯判断10项覆盖冲突、同源起点、缺ID、库存与真实通知优先级。新增27/27；实际相关模块477/480，仅原Plan cycleTier、Orca allowlist、initialize retry三项失败。
- 构建历史：09:54产物的source/packaged各10核心+58生命周期+23原生/成员检查通过，含新增4个来源仲裁坏实现canary；镜像、类型和构建通过。提交范围剥离前序1425三项门禁及两项Bridge补测后，独立提交快照的源码/镜像两侧生命周期55/55与原生未读23/23均通过，脚本测试26/26、筛选Bridge51/51通过（测试合计77项）；入口预算14698行/279个函数/162个可变绑定通过。历史58项运行记录不改写为55项。
- 实际结束：11:23当前Host/Renderer已加载，11:30:30固定轮次running直接completed，未读包57获applied；20次原生样本在90.929秒内保持completed/idle/unread，未见stopped过渡或完成后反弹。探针与一次自动化已结束。结论限该窗口的原生/日志/ACK，匿名相位是时间/发布链关联，没有结束后截图，不外推长期或全部生命周期。

实现、各阶段历史验证和最终证据边界统一见[当前任务卡](../specs/261013/1946-side-terminal-reconcile/task-card.md)。工作树历史门禁与本次提交快照的范围差异及验证结果见[提交范围](../specs/261013/1946-side-terminal-reconcile/task-card.md#2026-10-14-文档收口与提交范围)。
