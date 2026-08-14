---
id: eypc-req-invariants-raw-171
qualified_source: SPEC-260810-1155-INSTALL-RUNTIME-DIAGNOSTICS::RAW-171
status: proposed
domain: engineering-invariants
authority: agent-transcribed
---

# RAW-171 · engineering-invariants

> 正文由来源草案保存：[RAW-167 draft](../260810/1155-install-runtime-diagnostics/raw-requirement-next.draft.md#L1)。该草案标注 `pending-user-confirmation`，用户从未确认其转述忠实于原话，因此全部条款状态为 `proposed`。

结构收敛不得改变任何产品语义、可见状态、时序窗口或轮询频率。验收以「现行全部定向回归在零行为 diff 下继续通过」为准；任何行为变化都必须先回到需求层讨论。

## 交付状态

已遵守。C1、B2、C3+C4、E、F 均以既有用例原样通过为判据；A 与 C2 是刻意的行为修复，已单独标注并配独立回归。
