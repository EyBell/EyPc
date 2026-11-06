# 任务快捷键失效复发排查

## 状态

- 当前：固定上一／下一入口的请求积压、热态重复强刷两处缺陷已修，触发链定向回放通过并完成生产构建。用户报告的整个 uTools 无响应是否已消除，仍待真实宿主验证；不宣称唯一根因已确认。
- 范围：固定全局功能入口 → Command Gateway → Navigation → Provider 打开，以及已有诊断文件与冻结追踪；不启动或操作真实宿主。
- 工作区：main，起点 bfc21a3；开始时无已有改动。

## 已核证据

1. 2026-10-26 16:49:50 普通插件诊断停止；原插件进程于 16:57:22 断开，随后一次初始化于 16:57:42 断开，16:58:21 新进程启动。
2. 三次进程均加载 `host-df1d950f6de45e0c2b99`，重启后的主界面握手为 `host-loaded`，Renderer 为 `renderer-d5a67b79e87844756e5d`，与仓内构建身份一致。
3. 最后两份重启前普通日志只记录到待输入／已完成未读入口；最后一次已记录打开为 16:48:10 Codex `dispatched`。不能把用户报告的上一／下一触发与某条已有日志直接等同。
4. 冻结记录中的后台停顿多呈约一分钟周期；现有存活检测由插件 Renderer 的 `setInterval` 发脉冲，不能区分定时器受延迟与事件循环完全阻塞。异步 span 未完成仅为候选边界，不证明该操作阻塞。
5. 安装的 uTools SDK 中 `shellOpenExternal` 使用异步消息发送；没有据此证实快捷键私有同步 IPC 回归。重启前的当前卡死位置尚缺准确堆栈和入口 span。

## BusinessChangeReview

- 基线：[当前 PRD 的 Companion 合同](../../PRODUCT_REQUIREMENTS.md#L255)、[四层循环规格](../../260915/companion-cycle-priority/spec.md#L1)、[架构](../../../knowledge/ARCHITECTURE.md#L31)、[原追踪任务](../../261020/0936-freeze-trace-sync-io/task-card.md#L1)。
- 允许增量：恢复原连续按键合并合同、让完整快照的固定上一／下一复用快照；修复追踪对 Renderer 定时器的依赖并增加无正文打开 span。这些是已接受行为的恢复，没有新的产品需求或待确认逻辑分支。
- 保留：最高非空层、环内顺序、每次方向推进、首击立即打开、全来源打开并发为 1、末次尾随、operationId 去重、普通同任务命令串行、失败语义、已读与 phase 权威；冷 preflight／普通入口／背景监听保留，追踪限流／文件上限／fail-open 不变。
- 消费者：Main Preload 固定事件回调、Kernel Gateway、Main／Float／全局及局部循环、普通卡片与任务修改、各 Provider 打开、public/dist 镜像与既有诊断／打包入口。
- 测试预期变化：在原固定入口用例增加“热态零强刷、普通入口保留强刷”断言；新增双向 50 次、混合方向、去重、首失败后尾随、普通同 key 串行及冷恢复回归；追踪三项新增断言与原业务预期全部保留，没有删除或放宽原断言。
- 未决：本次宿主失效根因、真实上一／下一在进行中任务上的现场回归，均不由诊断修复通过推定完成。

## VerificationImpactTrace／本轮待测试清单

- 变更面：`preload/index.js`、`preload/companion/task-kernel.cjs`、Navigation／追踪及生成镜像；对应三份匿名测试、入口预算实测值、机器映射、文档。
- 影响依据：固定事件回调在调用 Kernel 前原有强刷；Gateway 的 `@cycle` 队列阻断 Navigation 合并。共享主入口及验证映射按现有消费者选测；纯内存候选与打开副作用分开核验。
- 待测：Kernel／Navigation 全文件回归、Bridge 热冷入口两个精确用例；覆盖双向跨来源 50→2、方向推进／去重／失败尾随／非 cycle 串行、候选资格／状态权威、热态零强刷／普通入口及冷 preflight 保留；另保留追踪阻塞／定时器／限流／隐私及映射命中的消费者、类型、合同、镜像、严格入口预算、构建和版本同步。
- 排除：全库套件、MQTT、真实 uTools／Provider 启动及 UI 操作；前者与改动无直接依赖，后者本轮未获直接运行授权。
- 扩大验证：发现冻结追踪及其回归未登记，新增可复用的导航诊断映射；该机器映射的治理改动按现行选择器自动命中全部已登记核心（不等于全库）。完成此覆盖所需的消费点、类型、镜像和治理检查由该入口统一执行；不重复已通过的同输入定向结果，不加入 MQTT 或真实宿主操作。
- 执行与验收 owner：当前主代理；本轮代码／文档／构建冻结后，由正常入口生成[触发链最终验证报告](../../../../output/verification/261026-task-cycle-trigger-core-r2.json)，以 `passed / fresh=true` 确定本轮所选检查。前轮仅诊断修正的[27 项／498 测试报告](../../../../output/verification/261026-task-cycle-freeze-core.json) 保留原输入边界，不能覆盖本轮新实现。

## 接续

两处触发链缺陷已由原入口回放证明并修正；真实宿主重载、连续上一／下一以及全应用是否再次失去响应仍独立待验。增强追踪继续用于分辨入口、打开等待、事件循环阻塞与计时器延迟。

## 已实施与定向结果

1. 两个新增用例在旧实现上分别暴露 timer 停摆误报、导航缺失 span；修正后冻结追踪与导航两文件共 34 项通过。
2. 追踪时钟移至子进程，至多一个未答探测；业务事件发送队列满时，探测回应等下一 ACK 补发，仍保留 256 条上限。
3. `navigation.dispatch` 包住原共用打开路径，未修改候选集合、串行队列、已读、phase 或 Provider 副作用。
4. 新增导航诊断机器映射，避免追踪源与回归继续处于核心选测盲区；[防误报记录](../../../knowledge/error-memory/freeze-recorder-renderer-interval-false-stall.md#L1) 限匿名验证范围。
5. 无新增功能或操作步骤，功能帮助无需变更；不提交、不推送、不重启／重载真实宿主。

## 构建与门禁边界

- 生产构建、语义类型检查、合同及 uTools 包校验通过；源码与包内分别通过 40 项核心、58 项生命周期、23 项原生未读检查。
- 最新构建真值已同步：`EyPc V7 / host-75da8ededb2235654830 / renderer-3c79a9de1e6ee9d72820 / 2026/10/26 19:09:04`；17:14:07 为前轮仅诊断修正的历史构建。
- 错误记录校验通过，既有过期复核提醒保留；静态搜索未发现私有 `sendSync`／快捷键回读回归。此检查不证明既有全部 SDK 调用均为异步。
- 补充队列满时的探测回应回归；最终核心入口包含此用例，冻结后不再改消费输入。未执行全库／MQTT／真实宿主操作。
- 已确认失效范围为整个 uTools；直接触发与具体阻塞栈仍未证实，不能把重启恢复、定时器误报修正或离线通过写成崩溃已根治。

## 变更清单

| ID | 文件 | 本轮变化 |
| --- | --- | --- |
| 1 | `preload/freeze-trace.cjs`、`public/freeze-trace.cjs` | 独立探测与 IPC 回应，限流 ACK 补答 |
| 2 | `preload/companion/navigation.cjs`、`public/companion/navigation.cjs` | 原打开串行路径增加无正文 span |
| 3 | `tests/platform/freezeTrace.test.ts`、`tests/platform/companionTaskKernel.test.ts`、`tests/platform/codexAppServerBridge.test.ts` | 追踪三个场景、固定入口双向积压与保留行为、真实 Preload 回调的热冷恢复 |
| 4 | `vibe/knowledge/core-verification-map.json`、`vibe/knowledge/verification-map.md`、`tests/scripts/coreVerification.test.ts` | 导航诊断来源／消费者／回归选测绑定；共享入口的精确模块清单新增导航覆盖 |
| 5 | `vibe/knowledge/ARCHITECTURE.md`、错误记录的三份新叶子及 `README.md`、`modules/runtime-and-packaging.md`、`modules/companion-actions-and-presentation.md`、新 `modules/companion-navigation.md` | 当前实现、确定的积压／重复刷新／误报边界；导航域以链接分组，既有叶子正文未改 |
| 6 | `public/runtime-identity.cjs`、`vibe/specs/PRODUCT_REQUIREMENTS.md`、`vibe/specs/PROJECT_STATUS.md`、本文 | 生成身份、构建真值、当前状态与唯一任务证据 |
| 7 | `preload/companion/task-kernel.cjs`、`public/companion/task-kernel.cjs` | cycle 不等待外层前次打开；非 cycle 逐 key 串行及去重保留 |
| 8 | `preload/index.js`、`public/preload.js`、`scripts/validate-preload-entry-budget.mjs` | 完整快照的上一／下一跳过入口强刷；严格预算同步必要 2 行 |

## 宿主整体无响应续核（前轮只读）

1. 现象边界：用户已明确整个 uTools 都无响应；本次按宿主整体失效排查，不据此直接认定哪一条线程或 API 是根因。
2. 安装代码边界：uTools 7.8.0 的插件 SDK `shellOpenExternal` 经异步消息送到主进程；主进程处理路径包含隐藏宿主窗口及 Electron 外部链接打开。插件返回 `dispatched` 只表示派发，不能证明主进程后续完成；未发现 EyPc 私有同步快捷键回读回归。
3. 系统记录边界：只读查询 2026-10-26 16:47:00–16:57:30 的 uTools 主进程，取得 493 条结构化系统事件，进程号 13788；最后事件为 16:57:28。仅查看时间、类型、子系统、分类与固定格式模板，未保存原始系统日志。背景线程也能产生日志，不能把这些事件当作 UI 健康或主线程未阻塞的证明。
4. 崩溃证据：本次在用户与系统诊断目录未找到 uTools 对应崩溃报告；找到的 10 月 20 日旧报告为磁盘写入资源报告，不能用来解释本次故障。
5. 后续分流：直接沿插件固定 `eypc-codex-task-previous/next` 入口调查，不以宿主绑定的具体键位或 Provider 作为前提；若进入现场复现，须同时取得宿主主进程与 EyPc Renderer 的限时调用栈，并与入口时间关联。尚未执行真实快捷键、采样或宿主重启。
6. 当轮验证选择：仅修改现象与状态文字，保留原软件验证；后续固定入口代码修复已重新选测，当前结果以上方新报告为准。

## 固定快捷键触发链修复

- 用户澄清：排查插件自带全局入口触发后的调用链，具体键位不作前提；原先以键位与目标来源作为下一步条件的分流撤回。
- 新发现：Command Gateway 将所有 cycle 放入同一个 `@cycle` Promise 串行队列，前次打开结束前后续按键无法进入 Navigation；后者的逻辑游标前进和末次合并因此无法生效。进行中任务打开后保留资格，重复请求会继续逐个打开；这与现行连续切换合同冲突，尚不等于本次全宿主卡死的唯一因果证明。
- BusinessChangeReview 增量：按 [RAW-222](../../260915/companion-cycle-priority/spec.md#L19) 恢复连续按键合并及全局打开并发一；cycle 的候选、四层优先级、每次按键方向推进、根任务身份、operationId 去重、其他任务命令的逐 key 串行与已读／phase 权威保留。
- VerificationImpactTrace 增量：Kernel `handleEnter/dispatchCommand` → Navigation → Provider Adapter；新增阻塞首个打开时的固定上一／下一入口回放，以及混合方向、直接 Command 调用去重、失败后尾随与普通任务命令串行保留。先红后绿；选择 Kernel 与 Navigation 聚焦回归、机器映射命中的核心消费者、构建和版本真值同步；MQTT／真实宿主仍不运行。
- 另一已复现边界：主 Preload 在任务入口调用 Kernel 前无条件请求 Codex membership 强制预检；完整热态入口回归测得额外强刷 1 次（预期 0），与快照复用合同冲突。修复仅让完整快照的上一／下一跳过此动作；冷启动／缺口保持原恢复，普通入口保持原强刷，状态与来源后台监听照常。
- 修复后的初次结果：双向 50 次固定入口回放从 50 次打开降为首个＋最终 2 次，最大打开并发仍为 1；普通同任务两次打开仍顺序执行。新增混合方向／operationId 去重／首个失败后的末次保留及热冷入口回归，完整结果待本轮核心报告。
- 入口预算：必要条件保护增加 2 行，严格行数实测值同步为 14732；函数数、可变绑定数约束不变，不以压行或删除诊断绕过预算。
- 7 个触发链聚焦用例已通过；热态正反入口的额外强刷均为 0，普通主入口仍强刷，冷 Provider preflight 保留。新的 Kernel 全文件、Bridge 精确用例及其他核心消费者由最终报告承载。
- 已记录[cycle 排队缺陷](../../../knowledge/error-memory/cycle-command-queue-bypasses-coalescing.md#L1)与[热态入口重复刷新](../../../knowledge/error-memory/warm-cycle-entry-forces-inventory-refresh.md#L1)；来源专属分支、具体键位与用户任务正文均不参与回放。
- 最终门禁首轮：[28 项报告](../../../../output/verification/261026-task-cycle-trigger-core.json) 中 27 项通过，仅治理 canary 仍硬编码原共享入口的 7 个模块，新增导航域后实际为 8。修正精确预期以要求新增覆盖，没有删除、放宽业务断言或绕过失败；本轮实际业务回归含导航 178 项、Preload 入口 2 项均已通过。
- 验证失效边界：正常核心回执的摘要绑定全部测试／映射／文档输入，治理断言修正后原整体摘要不再对应当前输入；以现有正常入口重建最终冻结回执，不新建缓存或假装原失败已通过。源码及 19:09:04 产物保持不变，无需为测试清单修正重建应用。
