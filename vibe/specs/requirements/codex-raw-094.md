---
id: eypc-req-codex-raw-094
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-094
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-089-092"
relations:
  - refines-RAW-089-092
---

# RAW-094 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

已经结束的任务不能因为 Desktop 整体会话 patch 中包含 EyPc 不读取的 Turn、工具或正文路径而长期停留在“进行中”。preload 只观察 `threadRuntimeStatus / requests / hasUnreadTurn / resumeState`；其它结构正确的私有 patch 必须静默忽略内容并正常推进同一 stream revision，不能退订重订、短暂丢失 live authority 或让旧 active snapshot 复活。只有上述受观察状态字段自身格式损坏、revision 不连续或 owner 不一致时才重订。该修正不得基于时间猜完成、不得改变任务数量，也不得放宽 RAW-090/091 的消失与异常门禁；active→idle/completed 的真实 patch 应在原实时链路继续被消费。当前三分钟本机采样复现 active 集合反复退出/复活，修正后 30 秒读取 59 个 patch、0 次重订、0 个替换 snapshot；真实完成转换和已运行 uTools preload 重载后视觉结果仍由用户验收。
