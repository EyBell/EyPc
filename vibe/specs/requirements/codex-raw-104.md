---
id: eypc-req-codex-raw-104
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-104
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-081-092-097"
relations:
  - refines-RAW-081-092-097
---

# RAW-104 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

「已完成未读」必须与 targeted 完成证据同路径尽快出现，不得依赖下一次完整库存才纠正。发布 `targeted-after-exit` completed 时，若仅存在完成前残留的 live `hasUnreadTurn=false`，必须清掉该 stale false 并立即读取 Codex 持久化未读；若仍未未读，在既有 3 秒 / `[0,300,1000]` Turn 核验时界内重试持久化未读，不得从缺字段发明未读，也不得清掉完成后的显式 live false（用户已读）。`verifyStaleActive` 在 active 且无 waiting flags 时可核验 latest Turn（含刚进入 active 与 App Server `turn/completed`），不再要求基线已是 completed。测试合同可更新但依项目规则不执行；需重载 uTools preload 后由用户验收。
