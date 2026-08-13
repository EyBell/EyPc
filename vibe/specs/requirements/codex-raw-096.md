---
id: eypc-req-codex-raw-096
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-096
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-089-RAW-092-and-RAW-094"
relations:
  - refines-RAW-089-RAW-092-and-RAW-094
---

# RAW-096 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

Desktop-live `active` 不是永久压过完成证据的无时间标记。preload 对每个当前 active interval 只记录匿名本机观察时刻，并随 V2 delta/完整快照发送；若同一任务的 latest Turn 明确 `completed` 且 `completedAt` 晚于该 active interval，完成是更晚的正向证据，Controller/领域投影必须停止使用旧 active shadow，并按既有普通完成展示窗收敛。没有该时刻、完成时间不晚于 active，或 latest Turn 不是明确 completed 时，desktop-live active 继续优先；不得用超时、recency、connector 状态或缺失 Turn 猜完成。active interval、匿名 key 和时间元数据之外的 raw thread ID、正文、cwd、路径与私有 patch 不得跨 preload。
