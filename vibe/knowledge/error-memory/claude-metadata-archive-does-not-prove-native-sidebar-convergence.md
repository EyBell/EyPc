---
id: eypc-claude-metadata-archive-does-not-prove-native-sidebar-convergence
status: verified
scope: project
fingerprint: claude-desktop-code__direct-isarchived-metadata-transaction-removes-eypc-row__running-session-manager-and-archived-event-bypassed__native-sidebar-convergence-incorrectly-implied
first_seen: 2026-08-11
last_verified: 2026-08-11
review_after: 2027-02-11
evidence:
  - vibe/specs/260807/claude-code-companion-authority-reset/research.md
  - vibe/specs/260807/claude-code-companion-authority-reset/verify.md
  - preload/claude/archive.cjs
  - src/runtime/codexController.ts
  - tests/platform/claudeBridge.test.ts
tags:
  - claude-companion
  - archive
  - native-sidebar
  - postcondition
  - authority-boundary
---

# Claude Metadata Archive Does Not Prove Native Sidebar Convergence

## Symptom

Claude D′ 单目标元数据事务已把 `isArchived` 改为 true，EyPc 私有活动库存和卡片也已移除，但成功提示“任务列表已自动更新”容易被理解为 Claude 原生侧栏也已经同步。进一步目标要求原生侧栏在运行中及时收敛。

## Wrong Assumption

把三个不同后置条件合并成了一个：

1. 目标元数据已经归档；
2. EyPc 自有任务包已移除该行；
3. Claude 运行中 session manager、原生事件和侧栏已接纳同一变更。

前两项成立不推出第三项。文件是持久化介质，但不是运行中原生事件 ACK。

## Verified Root Cause

对已安装 Claude App `1.26832.0` 的只读产物检查证明，原生归档在 App 进程内修改 session manager 持有的对象，随后保存并发布同一 session 的 `archived` 事件。EyPc 当前 [archive adapter](../../../preload/claude/archive.cjs#L1) 直接执行单字段文件事务，只验证元数据与 EyPc 私有活动库存；它既不进入原生 manager，也不产生该事件。

官方 Desktop Deep Link 没有本地 Code 归档/刷新入口；另一个 Managed Agents archive API 属于不同的 Beta `sessions` 资源。因此当前没有受支持的外部通道可以补齐第三项。脱敏运行期相关性检查也没有找到 D′ canary 对应的原生 archive 事件，而当前 App 进程晚于 canary 启动，不能用重载后的视觉状态反推即时收敛。

## Detection Order

1. 先分别命名 EyPc transaction、EyPc package commit、Claude native ACK 和 Claude sidebar projection，禁止用“任务列表”统称。
2. 检查写路径是否真正进入运行中原生状态 owner；只看到文件变化立即判定 native ACK 缺失。
3. 检查官方支持入口和资源身份；Managed/cloud session API 不得套用到 Desktop Code 本地 session。
4. 只有同一 App-local session 的原生 ACK 后，再在同一运行中进程测量侧栏移除时延；App 重启或重载后的状态不是即时证据。
5. 若入口、ACK 或同进程 UI 证据任一缺失，返回 `unsupported/pending`，同时保持 EyPc 归档结果自身可用。

## Prevention Rule

- Claude D′ 的 `archived` 只表示 EyPc 侧元数据和任务包后置条件通过；用户提示必须明确声明 Claude 原生侧栏尚未确认、可能仍待刷新。
- LevelDB/元数据写入、私有 IPC、AX/JXA/UI 自动化、自动重启和事后视觉结果都不能充当原生 ACK。
- 不为追求视觉一致性扩大现有单字段写边界。未来只有受支持的原生入口、同会话 ACK 与同一运行中侧栏在 1.25 秒内移除全部可验证时，才设计新的原生后置条件。
- 运行中 manager 后续整包保存可能覆盖直接文件状态是源码推导风险，未出现实际覆盖证据前必须标为 inference，不能写成事故事实。

## Alternative Route

Status: `candidate`

Preconditions:

- Claude 提供并承诺支持面向 Desktop Code 本地 session 的外部归档能力；
- 返回值可与唯一 App-local session 绑定，并能观察原生 `archived` ACK；
- 该能力无需私有 origin/channel 注入、UI 自动化、LevelDB 写入或 App 重启。

Ordered steps:

1. 在版本/能力探测中声明独立 `native-sidebar-archive` capability，缺失即 fail closed。
2. 对同一 session 调用受支持入口并等待精确原生 ACK；在 ACK 前不得把 native convergence 标为 confirmed。
3. 从 ACK 起用同一单调时钟测量运行中原生侧栏，在 1.25 秒内确认同一 session 移除。
4. 分别返回 EyPc archive 与 native-sidebar convergence 状态；后者失败不改写前者，也不执行隐式重启或其它旁路。

Verification:

- 自动化覆盖错误 session ACK、ACK 超时、UI 超时、App 代次变化和重复归档；真实宿主用可丢弃目标完成一次同进程端到端测量。

Applicability boundary:

- 仅适用于 EyPc 的 Claude Desktop Code task archive，不定义 Codex 归档或普通文件 watcher 的成功语义。

Fallback:

- 维持当前 D′ 与明确提示；能力保持 `unsupported-currently`。

## Occurrence History

| Date | Task | Trigger | Failed route | Evidence | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-08-11 | RAW-029 D-1/D-2 | 用户要求先纠正提示，再核验真正的原生侧栏及时收敛 | 把 D′ 文件/库存成功当成原生侧栏同步暗示 | 只读安装产物、官方接口范围、脱敏事件相关性与现有 Bridge 合同 | 改为双事实提示，冻结不受支持的 D-2，并定义未来原生后置条件 | D-1 focused-verified；D-2 unsupported-currently |
