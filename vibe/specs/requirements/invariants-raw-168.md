---
id: eypc-req-invariants-raw-168
qualified_source: SPEC-260810-1155-INSTALL-RUNTIME-DIAGNOSTICS::RAW-168
status: proposed
domain: engineering-invariants
authority: agent-transcribed
---

# RAW-168 · engineering-invariants

> 正文由来源草案保存：[RAW-167 draft](../260810/1155-install-runtime-diagnostics/raw-requirement-next.draft.md#L1)。该草案标注 `pending-user-confirmation`，用户从未确认其转述忠实于原话，因此全部条款状态为 `proposed`。

五处重复判断按同一原则收敛：proposal→canonical 接纳判定抽为单一出口；phase 集合抽为命名谓词并被 preload 与 renderer 共用；1 秒漏通知恢复收敛为单一策略常量；SUPPORTED_APP_VERSIONS 与 coalesce 窗口各自单点定义。收敛不得改变任何现行外部行为。

## 交付状态

部分交付。接纳判定 4→1、时序常量 8→2、phase 集合在 Kernel 内 13 处改为谓词；渲染层 62 处内联与 SUPPORTED_APP_VERSIONS 两处定义未收敛。
