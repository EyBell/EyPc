---
id: eypc-req-codex-raw-092
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-092
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-080-089-090-and-091"
relations:
  - refines-RAW-080-089-090-and-091
---

# RAW-092 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

状态反馈采用非对称时效策略：新增任务、已知任务进入待输入、刚创建任务首次出现即待输入，以及 active 退出后的定向 latest-Turn 强完成证据，都必须走快速通道；任务缺行、状态回退、无证据完成/停止等负向变化继续走稳定与保守门禁。App Server 的 `thread/started`、`turn/started`、`turn/completed`、未知任务状态及 Desktop 未登记主任务 snapshot 将 raw thread 仅在 preload 内标为 dirty，并发出 `inventoryRefreshPriority=urgent`；Controller 以 50ms 短合并窗触发结构读取，读取进行中再次到达的事件必须排队补读一次，不能丢到下一轮 15 秒周期。事件快读允许复用本进程已验证 latest-Turn 缓存，只读取 dirty 或无缓存任务；没有 dirty 事件的 15 秒周期校对仍完整重读全部 eligible Turn，因此这不是统一“两秒缓存”。未登记 Desktop 主任务 snapshot 暂存在 preload，只有完整库存建立匿名 key、项目和短期 action alias 后才发布，从而让新任务首次即为待输入但不泄漏 raw identity。带 `targeted-after-exit` 的 completed 强证据直接发布，不再额外等待 `completionPresentationDelayMs`；普通快照确认的完成仍保留用户配置展示窗。RAW-090 missing-key 隔离、RAW-091 stopped 证据和不确定→进行中保持不变。测试合同更新但依项目规则不执行测试、typecheck、build、uTools、截图或真实转换；实现与权威文档同步后由用户验收。
