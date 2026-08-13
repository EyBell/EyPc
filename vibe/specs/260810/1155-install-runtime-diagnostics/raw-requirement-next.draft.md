# RAW-167 draft — 单一判断点从状态裁决扩展到全部横切逻辑

Date: 2026-08-13
Status: `draft / pending-user-confirmation / current-canonical-unchanged`

> 本文件是 Claude Code 对用户真实原始需求的**理解重述**，不是已接纳的需求。当前 canonical 仍是 [raw-requirement.md](raw-requirement.md#L1)。用户确认转述忠实之前，本文件不参与任何实现或验收。

## 1. 我理解的核心理念

用户反复要求的不是「修好这一个状态 bug」，而是：

**同一个判断，全局只能有一个地方做出。**

RAW-159 已经把这句话写成「从分布式补丁收敛为单一 Kernel」。此后 RAW-160、162、163、164、165、166 每一轮都在报告同一类故障的新实例——某处判断与另一处判断不一致，导致展示自相矛盾。每轮都被当作行为缺陷修复（加一道门禁、加一条 lane、加一组回归），行为确实修对了，但**产生该类缺陷的结构没有变**：判断点仍在增加。

所以用户现在问的两个问题不是代码风格问题，是在问：**这一轮到底是又修了一个实例，还是终于修了机制。**

诚实的回答是：**修了机制的一半。** Kernel 内部的状态裁决确实收敛成了唯一路径；Kernel 之外的横切逻辑（校验、筛选、防抖、诊断）仍然是多点重复。

## 2. 证据：单一裁决点在 Kernel 之外并未成立

| 判断 | 声明的唯一权威 | 实际定义点 |
| --- | --- | --- |
| 「proposal 只有匹配 canonical 才算 accepted」（RAW-166 §78） | 一条 | [4 份复制](../../../../preload/index.js#L12346)：`codex-activity` / `claude-state` / `claude-unread` / `claude-inventory` 各写一遍三元判定 |
| 「待审批与待回答同属待输入」（PRD 产品规则） | 一条 | **62 处内联**，散布 12 个文件；无任何命名谓词 |
| 「1 秒 StatWatcher 只作漏通知恢复」（PRD/RAW-165 §74） | 一条 | 6 个常量、5 个文件：`CODEX_NATIVE_STATE_RECOVERY_INTERVAL_MS`、`CODEX_INVENTORY_MEMBERSHIP_RECOVERY_INTERVAL_MS`、`UNREAD_RECOVERY_POLL_MS`、`CODE_RECOVERY_POLL_MS`、`DEFAULT_RECOVERY_POLL_MS`、`LOG_RECOVERY_POLL_MS` |
| 「仅门禁已核验的 Claude App 版本，相邻未知版本 fail closed」 | 一条 | 2 个独立 `SUPPORTED_APP_VERSIONS`：[archive.cjs](../../../../preload/claude/archive.cjs#L15) 与 [app-state.cjs](../../../../preload/claude/app-state.cjs#L22)，当前取值巧合相等 |
| 事件合并窗口 | 一条 | 2 个 `DEFAULT_COALESCE_MS = 0`：`claude/events.cjs`、`companion/navigation.cjs` |

模块化标准在同一层内部分裂：`preload/claude/` 已拆成 10 个 200–841 行模块，而 Codex 侧 **189 个 `codex*` 顶层函数全部留在 14,969 行的 [preload/index.js](../../../../preload/index.js#L1) 里**，占 preload 全层 58%。同一个 preload 层，两套模块化标准。

## 3. 当前要求

83. 判断唯一性必须由结构保证，而不是由文档声明加测试覆盖保证。任何一条已写入 PRD 或 RAW 的判断规则，在代码中必须有且只有一个可执行定义点；其余位置只能引用该定义。文档声明与多点复制并存，视为未实现。

84. 上表五条重复判断按同一原则收敛：proposal→canonical 接纳判定抽取为单一出口；phase 集合判定抽取为命名谓词（如 `isAttentionPhase` / `isNonTerminalPhase`）并被 preload 与 renderer 共用；1 秒漏通知恢复收敛为单一恢复策略常量；`SUPPORTED_APP_VERSIONS` 与 coalesce 窗口各自单点定义并被引用。收敛不得改变任何现行外部行为。

85. Codex 侧按 `preload/claude/` 既有标准拆分。拆分以职责边界为准（inventory、activity、goal/turn、archive、action、desktop/app-server transport、environment），不以行数为准；每个模块保持与 Claude 侧同量级规模。拆分与行为修改不得在同一提交内混合。

86. 校验、筛选、防抖三类横切逻辑分别收口：校验层的 fail-closed 门禁单点定义并显式导出；筛选层不允许内联 phase 字符串集合；防抖层区分「原生回调快路」与「定时漏通知恢复」两个概念，各自单点表达，且恢复间隔的语义写在定义处而非调用处。

87. 本增量为纯结构收敛，不改变任何产品语义、可见状态、时序窗口或轮询频率。验收以「现行全部定向回归在零行为 diff 下继续通过」为准；任何行为变化都必须先回到需求层讨论。

88. 收敛完成后必须留下可执行的防回归手段：新增重复定义点应由校验器或测试拒绝，而不是依赖下一轮人工审计发现。

## 4. 与现行合同的关系

- 不取代 RAW-159→166 任何一条；RAW-166 §79 的「唯一 Primary 路由」是同一原则在错误记忆上的实例，本节把它推广到代码。
- 不重新打开已由用户决定的 RAW-164 all-bead 展示与 RAW-163 parent-only 打开。
- 不改变 `dev-plugin-reload-pending` 门禁；真机验收仍是独立前置。

## 5. 待用户确认项

1. 上述「单一判断点」是否确为你的核心理念，而非我从代码痕迹反推的过度概括。
2. 第 85 条的 Codex 侧拆分是否在本轮范围内——它是最大的一块，也可以单列一个增量。
3. 第 87 条「零行为 diff」是否是你要的验收口径。
