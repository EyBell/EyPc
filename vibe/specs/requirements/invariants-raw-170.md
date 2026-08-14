---
id: eypc-req-invariants-raw-170
qualified_source: SPEC-260810-1155-INSTALL-RUNTIME-DIAGNOSTICS::RAW-170
status: proposed
domain: engineering-invariants
authority: agent-transcribed
---

# RAW-170 · engineering-invariants

> 正文由来源草案保存：[RAW-167 draft](../260810/1155-install-runtime-diagnostics/raw-requirement-next.draft.md#L1)。该草案标注 `pending-user-confirmation`，用户从未确认其转述忠实于原话，因此全部条款状态为 `proposed`。

校验、筛选、防抖三类横切逻辑分别收口：校验层的 fail-closed 门禁单点定义并显式导出；筛选层不允许内联 phase 字符串集合；防抖层区分「原生回调快路」与「定时漏通知恢复」两个概念，各自单点表达，且恢复间隔的语义写在定义处而非调用处。

## 交付状态

部分交付。防抖层已收口且语义写在定义处；筛选层在 Kernel 内收口，渲染层未动；校验层的 SUPPORTED_APP_VERSIONS 仍有两处定义。
