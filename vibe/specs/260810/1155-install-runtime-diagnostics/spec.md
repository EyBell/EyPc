# RAW-160 Companion V4 Unified Runtime Spec

Status: `implemented / full-automated-verified / artifact-ready / host-acceptance-pending`

本规范是当前权威。RAW-159 的 V3 规格作为历史实现基线保留在 Git 与长期任务文档中；与本规范冲突时以 V4 为准。

## 1. Authority Graph

```text
Codex / Claude events, inventory and watcher evidence
  -> Provider Evidence Adapter
  -> Branch Evidence Store
  -> Canonical Task Reducer
  -> View / Capability Projector
  -> Process Latest Package Cache
  -> Main / Float / badges / navigation / actions
```

[task-kernel.cjs](../../../../preload/companion/task-kernel.cjs#L1) 是 `companion-task-kernel-v4` 的唯一状态、父/Side Chat 聚合、Plan 生命周期、时间窗口、隐藏/暂停、排序、角标与动作能力 owner；[companionTaskPackage.ts](../../../../src/domain/companionTaskPackage.ts#L1) 定义 `companion-task-package-v4` 公共合同。Provider Adapter 只归一化证据；Renderer 只提交配置与操作意图。Controller、Main 和 Float 不得重新裁决 phase/group/tier/count。

V4 Kernel 缺失、Facade 不完整或 Main/Float/Renderer/Preload Runtime Identity 不一致时进入 `reload-required` 并停止任务动作；不得回退 V3/V1 业务路径。

## 2. Branch Causality And Plan Lifecycle

每个分支先按因果顺序裁决：更新的真实 active 清除旧 waiting；更新的 unresolved input/approval/Plan 建立 waiting；terminal 仅在无更新 active/waiting 时有效；active/terminal 冲突保留非终态并 `freshness=verifying`。父任务聚合优先级为任一运行 → 审批 → 普通输入/Plan 实施确认 → 全部分支 exact completed → 全部分支经复核 stopped → 保留稳定态。

| 证据 | Canonical 结果 |
| --- | --- |
| 首次 Plan Turn 正在生成，尚无完成 Plan | running；`planReady=false` |
| 已有 Plan 后继续修改且 Turn 运行 | running；保留 `planReady=true` |
| 普通问题或审批 | waiting-input / waiting-approval；高于 Plan 循环层 |
| completed Plan 且实施确认未决 | waiting-input；`planReady=true`；`planImplementation=true` |
| Plan 未执行、exact interrupted、定向复读确认无更新活动/等待 | stopped；保留 `planReady=true` |
| 普通 interrupted，尚未 idle-confirmed | 保留稳定态；`verifying` |
| 普通 interrupted，全部分支 idle-confirmed | ordinary stopped |
| exact default/non-Plan Turn 开始 | running；清除 `planReady/paused` |

`CompanionCanonicalTaskV4` 增加 `planReady`、`planLifecycleRevision`、`paused` 与 `open/archive/pause/resume/executePlan` 能力。新 exact Plan 替换旧 Plan 时 revision 单调增加；普通刷新、owner 切换、refollow 和 Plan 修改不清除。完成、归档、移除、明确放弃或 exact default 执行才清除。

## 3. Views, Windows, Cycles And Pause

- 动态列表仍受 `dynamicTaskWindowHours` 控制；普通 stopped 超时退出。
- 唯一窗口例外是 `phase=stopped && planReady && !paused`；它进入待继续分组及分组计数，但不新增紧凑 stopped 角标。
- waiting Plan 可退出动态展开列表，但仍进入待输入角标、Plan 能力和通用 Plan 循环。
- 通用循环取首个非空层：普通 input/approval；exact Plan implementation 或 stopped Plan-ready；动态窗口 active；local pin。每层按最近提问、创建时间、匿名 key 排序。
- paused、ordinary hidden、archived 从全部角标和快捷候选移除。

Plan pause receipt 只持久化哈希 taskRef、Plan revision、paused 和时间。已隐藏页先渲染“已暂停”，再渲染普通隐藏；旧 hidden Plan 执行幂等迁移，先成功写 pause receipt 后再清 hidden，清理失败时回滚 pause。普通/批量隐藏遇到 Plan-ready 统一转换为 pause。

任务四槽为普通 `顶/隐/归/+`、Plan-ready `顶/暂/归/执`、paused Plan `顶/恢/归/执`。新会话能力留在抽屉；批量提供暂停/恢复；[FloatApp.vue](../../../../src/FloatApp.vue#L1) 使用同一 package capability 并保留 ARIA、禁用原因和焦点恢复。

## 4. Actions V2 And Execute Plan

[task-actions.cjs](../../../../preload/companion/task-actions.cjs#L1) 是 `companion-task-actions-v2` 唯一 Dispatcher。pause/resume/execute 使用 Plan revision single-flight；Execute Plan 只有 Codex、actionable Plan、无 active/其它 pending、default collaboration mode 与当前 model 可得时启用。

首次点击“执”只建立 5 秒确认；第二击才执行。确认 identity 包含 provider、匿名 task key、Plan revision、action alias、phase 与 paused；任何相关 selector 变化取消。确认缓存独立于 package revision。

[preload/index.js](../../../../preload/index.js#L1) 在每个 App Server 连接只读缓存一次 `collaborationMode/list`，执行顺序固定为：

1. 建立 single-flight/operationId 并定向复核 task、alias、Plan revision、active/pending。
2. 打开原 Codex 任务；失败则停止。
3. `thread/resume({ threadId, excludeTurns: true })`，不覆盖 cwd/model/权限。
4. 从私有线程状态取当前 model 与 reasoning effort；model 未知则停止。
5. 仅调用一次 `turn/start`，传入完整 `{mode:'default', settings:{model, reasoning_effort, developer_instructions:null}}` 与 Preload 私有固定指令。
6. 明确响应或 exact Turn evidence 才收敛为 running 并清 Plan；不得乐观改包。

明确失败保留 Plan 并返回阶段原因；超时为 `indeterminate`，定向复读匹配新 Turn，禁止自动重发。无剪贴板、键盘模拟、UI 自动化或替代会话回退。

## 5. Semantic Publication And Latest-State Consumption

Kernel 的语义指纹覆盖 phase/freshness/unread、Plan fields、membership/visibility/capability/action token、groups/counts/cycle/attention/sort 和必要展示元数据。observedAt、acceptedAt、producer generation 与内部因果水位不参与包相等。

等价 evidence 不增加 task/package revision，不更新 publishedAt，不调用 listener，不推 Main/Float，不同步 Navigation/Actions，也不引发 badge/focus/open。动态时间只维护最近一个 `nextVisibilityTransitionAt` 单次计时器。

Kernel 暴露 `getLatest()` 和 `subscribe(afterRevision, listener)`；Main、Float、Navigation、Actions 分别缓存 package revision 与 selector fingerprint。remount 只补发一个最新包，同/旧 revision 忽略；mainHide、Float close 与 Renderer detach 不清缓存。相同 navigation targets 不重置游标；相同 action selector 不取消确认。

Float task lane 独立于 quota/settings，ACK 为 `received/applied/rejected`。Host 在 500ms 未 applied 时只重发最新包一次，累计 1 秒且心跳健康才受控重建；Float 对同 revision 不替换 task cache 引用、不重新执行 Vue 投影。

## 6. Claude State And Archive Result

[task-kernel.cjs](../../../../preload/companion/task-kernel.cjs#L1) 的 Claude evidence reducer 让本次 `session.phase` 在因果上新于旧 cache 时优先；延迟旧 inventory 不能覆盖更新事件。phase、phaseRevision、statusEnteredAt、unread 和 capabilities 作为同一 accepted snapshot 更新，watcher、一秒补漏和打开后刷新复用同一 Store。

[archive.cjs](../../../../preload/claude/archive.cjs#L1) 的 D′ 后置条件不变：唯一目标元数据 `isArchived=true`、活动库存移除、事务复读通过。成功结果明确为“EyPc 已归档并移除。Claude 原生侧栏同步未确认，当前不受支持。”；不以侧栏视觉作为合同，不增加 AX/JXA、私有 IPC、LevelDB 写、重启或 UI 自动化。

## 7. Privacy, Compatibility And Static Ownership

- task package、Renderer、pause receipt 与错误记忆不包含原始 task ID、路径、Plan 正文或执行提示。
- 诊断 taskRef 为进程会话期 `h:<hex>`；operationId 只关联阶段，不暴露内容。
- `scripts/validate-utools-runtime.mjs` 与测试锁定 V10/V4/Actions v2、Execute 协议、Float ACK、Claude 文案和四端 Runtime Identity。
- 静态架构测试禁止 Kernel 外生产代码重新构造 canonical phase、dynamicGroup、cycleTier、counts 或 cycleKeys。
