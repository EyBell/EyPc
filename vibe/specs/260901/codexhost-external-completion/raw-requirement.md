# RAW-190：CodexHost 额外进程完成后应离开「进行中」

Tool: pi · Date: 2026-09-01 · Level: Standard（需求）

spec_id: SPEC-260901-CODEXHOST-EXTERNAL-COMPLETION

## 用户原话

> 修复一下通过 codex host 的额外进程：当任务变成「已完成」时 在 EY PC 里面展示的还是「进行中」 甚至「已完成未读」的状态都没有转化 这应该是需要优化一下的

## 附件（匿名）

两张用户截图：EyPc 动态列表一条 Codex 额外进程仍在「正在进行中」；同期 Codex Desktop 侧栏该会话已无进行中指示。

## 需求变更评审（Requirement Change Review）

`scanned_owners`：[PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L1) Codex Companion · [codexhost-external-threads-invisible-to-official-surfaces](../../../knowledge/error-memory/codexhost-external-threads-invisible-to-official-surfaces.md#L1) · [codex-cross-process-notloaded-is-not-completion](../../../knowledge/error-memory/codex-cross-process-notloaded-is-not-completion.md#L1) · [codex-stale-live-unread-false-blocks-completion-unread](../../../knowledge/error-memory/codex-stale-live-unread-false-blocks-completion-unread.md#L1)

| 操作 | 条款 | 说明 |
| --- | --- | --- |
| added | CLI `completed` 是外部会话的精确终态 | 官方 `thread/turns/list` 无法回答这些 id；Host `thread list` 的 `status` 是唯一 Turn 契约面 |
| added | 完成后进入已完成未读 | Host `hasUnreadTurn` 有则用；缺省且 completed 时不得宣称已读，按未读投影 |
| changed | 外部行未读一律未知 | 被本条收窄：有 Host 字段或新完成时不再 unknown；打开成功仍清未读 |
| unchanged | `notLoaded` 不是完成 | 禁止把官方 App Server `notLoaded` 当成完成；本条把 CLI completed 映射为 `idle` + 已确认 Turn，不走 notLoaded |
| unchanged | 禁止用 TTL/墙钟推断终态 | 运行中快照只缩短列表刷新，不单独制造 completed |

Conflict classification: `compatible-update`。Decision status: `explicit-current-request`。

## RAW-191

captured_at: 2026-09-01
state: active
text: >

  还有通过 Cloud Code 或 PI 等其他外置智能体发过来的请求和提示信息 在 插件内应该是待输入, 这个你解决了吗？

## RAW-192

captured_at: 2026-09-01
state: active
text: >

  再核验一下其他这种状态的映射是否合理 你应该已经理解了我原始需求的样式和分类 接下来根据 code host 里面的状态 一一进行区分和补充

## RAW-193

captured_at: 2026-09-01
state: active
text: >

  这个读取状态是不是应该根据codex里面的这个状态去比对一下？其他的应该是可以直接感知到了

clarification_at: 2026-09-01
clarification: >

  不是完全比对 我主要是想针对于那个已读未读
