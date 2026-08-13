---
id: eypc-req-codex-raw-128
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-128
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / supersedes-RAW-082-local-unread-acknowledgement / refines-RAW-090-108-121-127 / global-state-chain-audit"
relations:
  - refines-RAW-090-108-121-127
---

# RAW-128 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户要求不局限于当前个案，按全局代码复核全部状态写入、仲裁、投影和消费点；任何早期粗糙筛选若阻断当前直接通信证据都应移除，只保留防真实乱序、重复事件和库存抖动的最小防抖。审计确认并清理十类跨层残留：EyPc 本地 completion-revision 已读回执压住 Codex 原生 unread=true；同批 delta 含未知 key 时整批拒绝已知任务；完整 inventory 重建丢失精确 inProgress/confirmed terminal provenance；完整 snapshot 缺少 Activity generation 屏障；missing-key 隔离冻结整批而非只保留缺失行；相同 native unread=true 的轮询反复重启复核；冷启动时原生 unread 已为 true 却因“值未变化”漏掉首次 Turn 复核；重复相同 active snapshot 重置 `[0,300,1000]` 佐证周期；active 退出时旧 inventory completed 被无条件升级为 targeted completion；Controller 只在 delta 路径识别 confirmed terminal，完整 snapshot 的同 revision 佐证仍可能被压回 inProgress。当前合同以 Codex 原生 read-state 为唯一未读权威，完成未读角标/全局命令只打开第一条，不本地改写未读；Activity Delta 每次发布递增 generation，完整 snapshot 携带屏障；完整 inventory 保留更强会话期 Turn 证据；未知 key 只触发 urgent 结构复核，已知条目仍即时应用；missing-key 仅隔离缺失行，同批现存任务状态立即发布；兼容佐证复用同一有界周期，首次/新到达 unread=true、任务切换歧义、Activity epoch/映射变化或模式变化才启动或重启；active-exit 纯转换器在 delta/full snapshot 两条入口直接识别 confirmed provenance，普通完成只接受缓存确实前进或已有 confirmed provenance。保留严格旧 revision、source fingerprint、协议/隐私、waiting/exact-started、结构合并、缺失行隔离和归档核验；Renderer 不新增判断、timer、防抖、字段或 API。
