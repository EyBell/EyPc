---
id: eypc-req-codex-raw-127
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-127
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-091-125-126 / removes-residual-terminal-blockers"
relations:
  - refines-RAW-091-125-126
---

# RAW-127 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户要求继续全局核查并清理所有原始残留阻断线。审计确认四处仍可阻断真实终态：缓存已是 completed 的 unresolved live active 收到同 revision、无 `completedAt` 的精确完成时仍被完成时间门禁拒绝；首次 active snapshot 的定向佐证仍要求 completedAt；同一任务已有 stale-active 复核时，随后 active-exit 或 unread 触发的不同模式复核会被 single-flight 静默丢弃；缺失 latest-Turn outcome 仍可仅凭 idle/not-running 进入 stopped。精确完成在严格非旧 startedAt 且当前 live 周期尚未由 confirmed terminal 关闭时必须接受，不要求 completedAt；snapshot 佐证只要求合法 terminal + startedAt，并继续经过原有最终尝试/同 revision 核验。Turn 复核 single-flight 只合并兼容模式，不兼容模式必须取消旧周期并由新状态接管。unread=true 若遇到无 waiting flag、无精确 turn-started 的可疑 active，只触发 `verifyStaleActive` 读取，不从 unread 推断完成。`stopped` 必须同时拥有明确 failed/interrupted 与 exact idle/not-running；缺失 Turn outcome 永远保守 ongoing。所有 targeted/corroborated terminal provenance 必须写回会话期 inventory，避免后续 activity snapshot 丢失已确认来源。保留严格旧 revision、精确 started、waiting request、结构合并、missing-key 与协议/隐私门禁；不新增展示判断、时间延迟、持久化或 API。
