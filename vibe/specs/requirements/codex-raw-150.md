---
id: eypc-req-codex-raw-150
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-150
status: active
domain: companion-codex
authority: user-stated
source_annotations: "automated-verified-host-pending / supersedes-RAW-091-and-RAW-131-stopped-archive-presentation-and-native-AX-archive / waiting-to-continue-display-and-provider-archive"
scoped_relations:
  - kind: superseded-by
    target: eypc-req-shared-raw-160-clause-005
    scope: "Plan 完成后 exact interrupted 立即 stopped"
  - kind: superseded-by
    target: eypc-req-shared-raw-160-clause-006
    scope: "普通 interrupted 立即 stopped"
---

# RAW-150 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户确认内部 stopped 卡片不应继续显示为“已停止”，要求改为“待继续”，但不得新增顶层 Tab、角标或快捷入口；待继续任务允许任务级归档。Domain 继续使用 `stopped`，Presentation 在动态分段、卡片状态、说明和可访问文本统一映射为“待继续”，顺序固定为“待输入 → 进行中 → 待继续 → 已完成未读 → 已完成”。Codex 的精确 `interrupted/user-stopped` 是终态 watermark：仍有未解决 input/approval 时保持待输入，存在因果上更新的新 Turn/active 时恢复进行中，否则立即进入 stopped，不再额外等待 Desktop idle；普通 `failed` 继续使用既有保守门禁。Host 写入前重新读取同一任务/latest Turn 与活动边界，状态、版本或请求已变化统一返回 `state-changed`。Claude completed/stopped 仅在 macOS Claude `1.26832.0` 门禁下执行 D′ 受控静默元数据事务：只使用正常库存建立的私有 `sessionId → 唯一 local_*.json` 索引，写前复核 App-local 身份、phase、`isArchived` 与 stat/hash，写入同目录唯一临时文件后原子替换，只把目标对象的 `isArchived` 改为 `true`；语义核验失败且文件未并发变化时恢复原始字节，并发变化时禁止用旧备份覆盖。`isArchived=true` 与私有活动库存移除双确认即可 `archived`，`LocalSessions.archive` 日志只作增强证据；已归档精确目标幂等成功，`failed/indeterminate` 保留卡片。该动作不得 Deep Link、不得 AX/JXA、不得扫描式改写、不得写 LevelDB/其它会话，路径不跨 Preload；普通打开也在 Deep Link 前拒绝已归档、缺失或身份不唯一的目标。任务多选按 Provider 分发，项目批量归档仍只处理 Codex completed，不扩展到待继续或 Claude。
