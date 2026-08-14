---
id: eypc-req-invariants-raw-167
qualified_source: SPEC-260810-1155-INSTALL-RUNTIME-DIAGNOSTICS::RAW-167
status: proposed
domain: engineering-invariants
authority: agent-transcribed
---

# RAW-167 · engineering-invariants

> 正文由来源草案保存：[RAW-167 draft](../260810/1155-install-runtime-diagnostics/raw-requirement-next.draft.md#L1)。该草案标注 `pending-user-confirmation`，用户从未确认其转述忠实于原话，因此全部条款状态为 `proposed`。

判断唯一性必须由结构保证，而不是由文档声明加测试覆盖保证。任何已写入 PRD 或 RAW 的判断规则，在代码中必须有且只有一个可执行定义点；其余位置只能引用该定义。文档声明与多点复制并存，视为未实现。

## 交付状态

已交付。因果内核、provider 特征表、时序策略、phase 谓词、接纳判定各自收敛为单点，四条守卫逐条验红。
