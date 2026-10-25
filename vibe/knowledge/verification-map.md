# 核心验证影响映射

验证策略唯一 owner：[CodeNote testing rules](../../../../../czz/CzzProj/CodeNote/AiRef/VibePractice/Vibe_Rules/testing/rules.md#core-preservation-automatic-gates)。此文件只登记当前项目的消费者和执行入口。

## 变更触发与执行入口

[机器映射](core-verification-map.json#L1)是需求→语义owner/消费者→检查的唯一可执行关系；本页解释边界。当前登记8组：Companion状态、来源证据、统一交互、收藏、窗口、端口、设置、验证治理。它不宣称全部现行需求已自动覆盖；端口/设置仍以产品章节作source-only，不伪造RAW身份。

- `pnpm run verify` / `verify:changed`：[选测器](../../scripts/verify-core-changes.mjs#L1)读取HEAD到工作树的已暂存/未暂存和未跟踪路径；`--staged`仅选择暂存差异，但执行当前工作树；`--base REF`选择REF到HEAD的提交差异。重命名两侧与删除均纳入。需要提交内容专属证明时，在对应干净checkout执行，不能拿混合工作树结果代替。
- `pnpm run verify:plan`只展示需求、原因、检查与未验边界，状态为planned-not-run；`verify:core`显式执行已登记核心清单。未知受保护代码路径直接失败，要求补映射，不自动跑全库。
- 映射、执行器、包/锁文件、测试配置、需求登记变化选择全部已登记核心；共享入口触发其全部已登记消费者。测试文件缺失、需求不再active、空用例、缺执行回执、失败、超时、执行中输入变化均不能通过。Node检查需正数回执；Vitest需每文件及每个指定名称实际通过。类型、工作树/HEAD镜像、runtime identity输入一致性和入口预算仍在选定链中，多个失败会完整列出。证据摘要覆盖执行源码、测试、配置、Git HEAD/index和需求authority，不含原始输出。
- MQTT不自动运行；混合文件使用明确的正向用例名清单，命名消失或多运行用例均失败。正常入口不启动真实供应方CLI、宿主或账号操作。[CI](../../.github/workflows/core-regression.yml#L1)在PR/push/manual调用同入口，权限仅contents:read。仓内配置完成不代表远端已执行或已设为required。
- 主/成员独立核心检查按manifest四来源共40场景；Codex独有root input优先保留[RAW-207的局部取代](../specs/requirements/shared-raw-207.md#L1)，其它来源input/approval仍按原优先级。每个来源有定向坏实现canary。

状态修复的固定 `provider-state-repair` 检查覆盖 Cursor 子事件时钟与动态窗口、Codex 反序嵌套/缓存/机器 parent 优先、Orca 明确等待及同 epoch 解除；生产 evidence builder 与真实 Kernel 一起断言分组，并保留 Orca 未读消费者。匿名 fixture 不读取真实任务正文。[修复台账](../specs/261018/task-state-repair/task-card.md#L1)。

`codex-side-recovery` 选取生产 Bridge 的 13 个恢复边界，新增大帧线性复制界限、库存 notLoaded/interrupted 下定向订阅、新问题及接受回答、缓存 none 后外部 Goal（有/无 Plan）和既有残留等待/Side 恢复。`provider-state-repair` 同时运行匿名异步问题/有限 Goal 投影文件；覆盖具体集合以 [机器映射](core-verification-map.json#L1) 为准。[本轮任务](../specs/261010/0937-gpt-input-compat/task-card.md#L3)。

上游更新使用[静态探测器](../../scripts/provider-contract-drift.mjs#L1)：`pnpm run probe:provider-contract --provider codex`读取标准Applications候选的安装元数据；`--app`指定或重复提供候选；`--schema`提供严格脱敏结构，`--baseline`比较已审核报告，`--output`只能写新文件。退出2表示unknown，不能解释为能力已移除；退出0也仅说明静态结构可比较，runtimeSupport始终unverified。程序版本/build/选定元数据或ASAR头摘要与契约结构分开；header摘要不是全部程序正文校验。没有契约时仍能报告artifact变化，但不猜测能力。不会自动更新baseline或启动后台监控。

显式schema最小例子（不是供应方实际完整schema）：

```json
{"version":1,"provider":"orca","contracts":{"inventory":{"type":"object","properties":{"worktrees":{"type":"array","items":{"type":"object"}}},"required":["worktrees"]}}}
```

探测报告仅保存结构哈希位置/类型/required与变化类型，拒绝description、examples、default、enum等任意值；方法/事件需显式提供。维护流程：保留已审核baseline → 探测变化 → 对照原始需求及实际声明定位对应结构 → 新增fixture和坏实现canary → 跑受影响入口 → 必要时单独做真实宿主验证 → 审核后将新报告用作下一baseline。版本变化只触发复核，不关闭能力。Windows/Linux可提供同一显式schema；本次安装包采集仅macOS布局，不冒充跨平台实测。

本轮落地结果与限制见[规格及执行记录](../specs/261014/core-regression-capability/spec.md#L1)。

| 变更选择器 | 已接受核心行为 | 自动入口 / 定向证据 | 消费者 | 验证边界 |
| --- | --- | --- | --- | --- |
| Companion Kernel phase / topology / interaction / unread / archive | Codex主 input 优先（其它来源遵循现行优先级）；活动子成员提升根卡；历史子终态不清主 running；当前输入优先潜在未读；根卡唯一；活动成员禁止归档 | validate-utools-runtime 自动调用 check-companion-core-invariants，source/dist 各自执行核心、生命周期及 native unread/成员独立检查；Kernel/Topology/TaskPackage/Presentation 与 provider Adapter 定向测试 | canonical snapshot → Main/Float 角标/分组/cycle/归档 | 包内语义已覆盖；宿主像素、跨时刻未读不由构建证明 |
| 核心自动门禁本身 / 原测试预期变更 | 独立 oracle 不随原 Vitest 断言改变；已知 child-only 错误仍必须拒绝 | tests/scripts/companionCoreInvariants.test.ts 正向与负向 canary；已有构建入口仍保留 | source → 生产包验证 | 不能自动裁决真实需求变更，仍须原有 review |
| Rollout decision cache | 文件不变只复用解析，强制探测仍应用原有状态归约；不降检测频率 | codexRolloutDecisionCache 与 codexAsyncQuestions 定向测试；Bridge 既有状态回归 | 文件监听/进程探测 → 归约 → Main/Float | 实际 CPU 与宿主时序独立验收；既有失败不改断言隐藏 |
| 原生 schema/IPC version、Desktop-only Side、成员交互与 Side 终态查询 | 单一 identity/host；主/子请求与 epoch 独立；未答问题维持；Side 新完成更新根未读；主缓存不能代替子查询 | 原 validate-utools-runtime 的 check-companion-native-unread；11 项 gate 正向/负向 canary；四成员较早终态/较新主轮次独立与实际 Bridge→Kernel 组合回归，含较晚 completed/aborted 生成保留 Side 问题；async questions | 原生持久与 IPC → member evidence → 唯一 root → Main/Float | source/packaged 可证解析与因果语义；原生像素、全部真实生命周期独立；未知身份形式保守 unavailable |

前序1425验证（历史）：2026-10-13；19:05 续核补充 Side 完成时剩余成员运行/等待的生产 Bridge→Kernel 断言与 20 点时序 gate，真实独立 Side 完成未读仍待证；Side 关系撤回/已接纳图与归档清理、未读/打开竞态、匿名恢复日志及根相位 Provider 关联见 [续核](../specs/261013/1425-codex-side-phase/lifecycle-verify.md#L1)。触发规则和负向 canary 证据见[本轮审计](../specs/261013/1425-codex-side-phase/audit.md#L1)。


## 当前 Side 终态与主结束验证

- 成员终态/Goal/清退：`codexAsyncQuestions.test.ts` 覆盖 canonical 完整边界、能力和成员因果；`codexAppServerBridge.test.ts` 覆盖成员自身轮次、已读/未读、新活动/等待、IPC reset、普通 Side Goal 重试及同批节点/关系撤回。临时 Side 同类任务已做安装后对照；原归档目标不作为完成样本。
- 内部评审资格：`codexSubagentDiscovery` / `codexAsyncQuestions` 覆盖精确来源、未知保持和 snapshot/patch；Bridge覆盖库存/实时/恢复提示、更正后的原子撤回及迟到结果，保留普通子代理、用户 Side。独立 canary 必须拒绝完全不排除或过宽排除，通用 Kernel stopped 聚合不变。
- 主结束来源：Desktop main end-event ordering 17项逐次订阅每次Kernel发布，覆盖 idle/canonical/unread 顺序、held RPC、真实中断/失败、等待、新轮、Goal、普通 Side及AppServer-only子运行；来源纯判断10项覆盖冲突、同源起点、缺ID、库存与真实通知优先级。新增27/27；实际相关模块477/480，仅原Plan cycleTier、Orca allowlist、initialize retry三项失败。
- 构建历史：09:54产物的source/packaged各10核心+58生命周期+23原生/成员检查通过，含新增4个来源仲裁坏实现canary；镜像、类型和构建通过。提交范围剥离前序1425三项门禁及两项Bridge补测后，独立提交快照的源码/镜像两侧生命周期55/55与原生未读23/23均通过，脚本测试26/26、筛选Bridge51/51通过（测试合计77项）；入口预算14698行/279个函数/162个可变绑定通过。历史58项运行记录不改写为55项。
- 实际结束：11:23当前Host/Renderer已加载，11:30:30固定轮次running直接completed，未读包57获applied；20次原生样本在90.929秒内保持completed/idle/unread，未见stopped过渡或完成后反弹。探针与一次自动化已结束。结论限该窗口的原生/日志/ACK，匿名相位是时间/发布链关联，没有结束后截图，不外推长期或全部生命周期。

实现、各阶段历史验证和最终证据边界统一见[当前任务卡](../specs/261013/1946-side-terminal-reconcile/task-card.md)。工作树历史门禁与本次提交快照的范围差异及验证结果见[提交范围](../specs/261013/1946-side-terminal-reconcile/task-card.md#2026-10-14-文档收口与提交范围)。
