# RAW-181：重载后运行中 Desktop-only Side 子线程的恢复通道

Tool: claude · Date: 2026-08-25 · Level: Standard（需求）

## 用户原话

> EyPc 仓库已核验的证据缺口待产品裁决+实现：Codex 任务的 Side 子线程仍在运行、主任务已完成已读时，插件重载后 EyPc 卡片显示「已完成」而非契约要求的「进行中」。根因与三条恢复通道失效的完整分析见 vibe/knowledge/error-memory/codex-running-side-child-invisible-after-reload.md（status verified，2026-08-25，9 代理对抗核验）……修复方向（记录的预防规则）：有界持久化 side→parent 关系提示（重载后重新 follow + 定向 latest-Turn 校验），或重连时向 Desktop 请求运行中会话枚举（先确认协议支持）；同时评估次级缺口 C2（thread/list 行 idle/notLoaded 但 latest turn inProgress 时冷恢复静默不产生候选，preload.js:7924 一带）。任何方案不得削弱 2026-08-15 严格法定人数规则（EYPC-COMPANION-STATE-SOURCE-001）的清理边界。走仓库标准需求流程（raw-requirement + spec），修改 canonical preload/ 后 pnpm run sync:preloads。

## 方案裁决（agent-transcribed，依据在场证据）

用户给出两个方向并要求裁决。本轮选定 **方向 A：有界持久化 side→parent 关系提示**；方向 B（重连时向 Desktop 请求运行中会话枚举）**本轮不采用**，理由：

- 当前代码认识的 Desktop IPC 协议面（[desktop-ipc-endpoint.cjs](../../../../preload/codex/desktop-ipc-endpoint.cjs#L1) + [preload/index.js](../../../../preload/index.js#L5501) `handleMessage`）只有 `initialize` 一个请求方法，其余全部是广播/跟随通告；不存在任何「枚举运行中会话」请求方法的证据。
- 项目规则（[vibe/rules/README.md](../../../rules/README.md#L42)）要求行为决策性事实主张必须有已执行的证据；确认协议是否支持枚举需要对真实 Desktop 做协议探测，而真实运行时证据依 `EYPC-VERIFY-001` 仅限用户在当前任务明确要求时进行，本任务未获该授权。
- 方向 A 完全复用已在产的恢复机器（`followAll` → `sideRecoveryPending` → 快照 hinted parent → 定向 latest-Turn 校验，[preload/index.js](../../../../preload/index.js#L6319) / [L5713-L5754](../../../../preload/index.js#L5713-L5754)）：唯一缺失的就是重载后关系提示表为空。

C2 评估结论（用户要求「评估」）：已在代码证实为真实缺口——[preload/index.js:7924](../../../../preload/index.js#L7924) `turnLive = connectorStatus === 'active' && turn?.status === 'inProgress'`，行状态 idle/notLoaded 时 fresh inProgress turn 被静默降级为非活，无诊断、无候选。按错误记忆预防规则记录的方向（「产生候选并走已有的定向核验」）在本轮一并补齐。

## 需求变更评审（Requirement Change Review）

`scanned_owners`: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L255)「动态任务状态不持久化」、[PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L259)「live phase、unread、topology 与 cycle 位置都只在进程内」、[EYPC-COMPANION-STATE-SOURCE-001](../../../rules/README.md#L67)（Desktop-only Side 清退严格法定人数）、[codex-raw-090](../../requirements/codex-raw-090.md#L1)（Controller 稳定清单不持久化）、[错误记忆](../../../knowledge/error-memory/codex-running-side-child-invisible-after-reload.md#L1)。

`visible_changes`:

| 操作 | 条款 | 说明 |
| --- | --- | --- |
| changed | 「topology 只在进程内」（PRD L259） | 收窄：Side→parent **恢复提示**（仅 threadId/parentThreadId/observedAt）成为可持久化的唯一拓扑例外；live phase、unread、cycle 位置维持进程内不变 |
| changed | 「动态任务状态不持久化」（PRD L255） | 同上收窄：恢复提示不是动态状态——它不携带任何相位/未读/等待事实，只驱动重连后的 re-follow 与定向核验 |
| added | RAW-181 恢复提示 + C2 候选 | 见下方规范化需求 |
| unchanged | 严格法定人数清退（EYPC-COMPANION-STATE-SOURCE-001） | 恢复的提示与实时观察的关系走完全相同的清退门：完整库存排除 + 三次精确空读；提示被清退/遗忘/归档时持久化条目同步删除 |
| unchanged | codex-raw-090 Controller 稳定清单/候选不持久化 | 证据边界不同：本条持久化只发生在 Host preload 侧，Renderer/Controller 永远看不到原始 ID |

`conflict_candidates`: PRD L255/L259 明文「不持久化」。采用本轮会收窄该边界，但当前用户请求即以错误记忆预防规则（有界持久化关系提示）为指定修复方向，故 `decision_status=explicit-current-request`。

`decision_status`: `explicit-current-request`

## 规范化需求

- **RAW-181#1（恢复提示持久化）**：Desktop 观察到的 Side→parent 关系以有界提示形式持久化到 uTools dbStorage（仅 `threadId` / `parentThreadId` / `observedAt` 三个字段）；插件重载后恢复进进程内提示表，由既有 `followAll` / `updateInventory` 通道对 inventory 内父任务的提示子线程重新 follow，并由既有 `sideRecoveryPending` + 定向 latest-Turn 校验决定活动状态。
- **RAW-181#2（有界与隐私）**：持久化上限 200 条、TTL 48 小时（写入与恢复两侧都过滤）；条目不携带标题、内容、相位、未读、等待或任何 Renderer 可见标识；存储读写失败静默降级为无提示（与今日重载后行为相同）。TTL 只限定提示的持久化寿命，不构成任何终态推断。
- **RAW-181#3（提示不是状态）**：恢复的提示只重建关系候选，不得直接产生 running/unread/waiting；公开状态仍只能由 Desktop 广播快照、App Server 定向读或既有 rollout 证据改变。严格法定人数清退规则对恢复的提示原样适用；关系被遗忘、清退、归档或父任务离开库存时，持久化条目在同一去抖批次内删除，不得在下次重载复活。
- **RAW-181#4（C2：库存 Side 行判活候选）**：库存内 Side 行 connector 状态为 idle/notLoaded 而 latest turn 为 inProgress 时不再静默降级：该行强制走**新鲜**定向 latest-Turn 读（缓存 inProgress 不作数），fresh 读仍为 inProgress 才按 `app-server-live` 判活；fresh 读返回终态则照旧记录终态。
- **RAW-181#5（诊断可见）**：提示恢复数量与 idle/notLoaded 判活恢复经 `task-topology` 诊断事件可见，按 fingerprint 去抖，不逐轮重复。

## 验收意图

- 重载模拟（新 preload 进程 + 相同 dbStorage）：已知 Desktop side 关系恢复；Desktop 连接后子线程被 follow；收到 active 快照后父卡片回到「进行中」。
- 子线程实际已终态：恢复的提示不虚构 running；完整库存排除 + 定向空读后照旧清退，且持久化条目同步消失。
- 库存 Side 行 idle/notLoaded + fresh inProgress turn：父任务判活；缓存 inProgress 不判活。
- 持久化内容仅含 threadId/parentThreadId/observedAt；Renderer 投影中不出现原始 ID。
