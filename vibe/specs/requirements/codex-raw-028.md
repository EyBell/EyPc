---
id: eypc-req-codex-raw-028
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-028
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / live-authority-refined-by-RAW-056 / visible-status-refined-by-RAW-089 / archive-capability-refined-by-RAW-089"
supersedes:
  - eypc-req-codex-raw-005
  - eypc-req-codex-raw-015
  - eypc-req-codex-raw-019
scoped_relations:
  - kind: refined-by
    target: eypc-req-codex-raw-056
    scope: "live-authority"
  - kind: refined-by
    target: eypc-req-codex-raw-089
    scope: "visible-status"
  - kind: refined-by
    target: eypc-req-codex-raw-089
    scope: "archive-capability"
---

# RAW-028 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

任务快照升级为三种业务桶 `ongoing / completed-unread / completed`。RAW-089 后 Renderer 只对 exact desktop-live active 保留 `waiting-input / waiting-approval / active` 子状态；除有明确最新 Turn `completed` 证据外，failed、interrupted、systemError、notLoaded、authority loss、inProgress 与证据缺失都统一投影为 `ongoing`，并共同阻断归档。原始 Host/Turn 状态只保留供诊断与 Host 重读。
