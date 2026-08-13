---
id: eypc-req-codex-raw-159
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-159
status: active
domain: companion-codex
authority: user-stated
source_annotations: "implementation-landed / automated-verification-in-progress / installed-host-pending / supersedes-RAW-155-v2-final-authority-and-provider-only-codex-archive"
scoped_relations:
  - kind: superseded-by
    target: eypc-req-shared-raw-160
    scope: "只在 Kernel no-op 即完成消费去重"
---

# RAW-159 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户要求把状态、语义版本、库存、缓存、快捷键、跳转、归档和全量诊断日志一次统一，不再局部补丁。最终权威升级为 `companion-task-kernel-v3 / companion-task-package-v3`：唯一 Process Reducer 接收带 membership、phase、exact authority、Turn/终态时间、三态 unread、observationGeneration 与 capabilityToken 的 Evidence V3；observation/source lane generation 只拒绝乱序，semanticRevision 只在可见语义变化时推进。等价 observation 完整 no-op，不增加任务/包 revision、不发 Float/focus、不重算角标。新 Codex membership 先建立最小卡片再定向补标题/项目；所有固定产品数量上限删除，`limit=100` 只作为 cursor 页大小。冷启动/重连 interrupted/failed 冲突仅定向精读一次；无法确认不再强制 running，而是保留最后稳定态并标记 verifying。Codex 归档由 operationId 串联 intent、confirmation、preflight、一次写、两次服务器库存、Desktop sync、运行中原生 ACK、Kernel commit 和 reconciliation；Provider RPC 成功、一次列表缺行或消息已发送均不能删卡片，失败/矛盾/超时保留 UI/cache/alias/shortcut 并提醒。`eypc-runtime-diagnostics-v3` 要求所有调用显式 level，当前未配置者默认 debug，精确 taskRef/path/state/watermark/action/archive stage 明文落盘；v2/v3 探针增加 operation/trace/provider/taskRef 筛选和状态/no-op/快捷键/导航/归档/错误聚合。Claude/Cloud 行为本轮不改。完整合同与验收见 [Controlled task](../../260810/1155-install-runtime-diagnostics/task-card.md#L1)。
