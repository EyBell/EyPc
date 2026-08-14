---
id: eypc-req-invariants-raw-172
qualified_source: SPEC-260810-1155-INSTALL-RUNTIME-DIAGNOSTICS::RAW-172
status: proposed
domain: engineering-invariants
authority: agent-transcribed
---

# RAW-172 · engineering-invariants

> 正文由来源草案保存：[RAW-167 draft](../260810/1155-install-runtime-diagnostics/raw-requirement-next.draft.md#L1)。该草案标注 `pending-user-confirmation`，用户从未确认其转述忠实于原话，因此全部条款状态为 `proposed`。

收敛完成后必须留下可执行的防回归手段：新增重复定义点应由校验器或测试拒绝，而不是依赖下一轮人工审计发现。

## 交付状态

已交付。四条守卫：HEAD 镜像成对性、provider 内联条件、时序策略单一所有者、phase 集合与 lane 量纲。每条均反向验红。
