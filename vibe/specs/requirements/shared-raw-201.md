---
id: eypc-req-shared-raw-201
qualified_source: SPEC-260902-QUOTA-CHIP-REFRESH-LANE-DIAGNOSTICS::RAW-201
status: active
domain: companion-shared
authority: user-stated
source_annotations: "implementation-landed / focused-automated-verified / artifact-ready / host-pending / quota-chip-manual-refresh / claude-quota-read-diagnostics"
scoped_relations:
  - kind: refines
    target: eypc-req-claude-raw-019
    scope: "手动刷新可提前一次 usage API 读取；429 Retry-After、401/403 凭据锁、退避序列与窗口映射不变"
---

# RAW-201 · companion-shared

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260902/quota-chip-refresh-and-lane-diagnostics/raw-requirement.md#L1)。

展开卡额度行的每个读数块点击即强制刷新 Codex 与 Claude 两个来源的额度（Claude 块含 Enter / Space）；Claude usage API 的手动读取只绕过 interval / backoff，不绕过 429 Retry-After 与凭据锁。每次 Claude 额度读取写一条有界 `quota / claude-quota-read` 诊断：触发原因、三车道读数年龄、usage API 结果与阻塞原因、计数与主读数来源，不含百分比、reset 时刻、身份或凭据。
