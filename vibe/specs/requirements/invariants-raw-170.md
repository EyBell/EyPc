---
id: eypc-req-invariants-raw-170
qualified_source: SPEC-260810-1155-INSTALL-RUNTIME-DIAGNOSTICS::RAW-170
status: active
domain: engineering-invariants
authority: agent-transcribed
---

# RAW-170 · engineering-invariants

> 正文由来源草案保存：[RAW-167 draft](../260810/1155-install-runtime-diagnostics/raw-requirement-next.draft.md#L1)。用户于 2026-09-01 确认该草案对原话的转述忠实，五条条款随之转 `active`；`authority` 如实保留 `agent-transcribed`，因为正文仍是转述而非用户逐字原话。

校验、筛选、防抖三类横切逻辑分别收口：校验层的 fail-closed 门禁单点定义并显式导出；筛选层不允许内联 phase 字符串集合；防抖层区分「原生回调快路」与「定时漏通知恢复」两个概念，各自单点表达，且恢复间隔的语义写在定义处而非调用处。

## 交付状态

**已交付（2026-08-14）。** 三层各自收口，且各有拒绝回归的门禁。

- **校验层**：`SUPPORTED_APP_VERSIONS` 由 [app-state.cjs](../../../preload/claude/app-state.cjs#L1) 单点定义并显式导出，archive 引用；用例拒绝 archive 内重新定义。
- **筛选层**：preload 与渲染层均无内联 phase 字符串集合，由 [preload/task-phase.cjs](../../../preload/task-phase.cjs#L1) 与 [companionProvider.ts](../../../src/domain/companionProvider.ts#L121) 各自拥有；门禁拒绝重新引入，并钉住两侧成员集合一致。详见 [RAW-168](invariants-raw-168.md#L1)。
- **防抖层**：「原生回调快路」与「定时漏通知恢复」在 [timing-policy.cjs](../../../preload/timing-policy.cjs#L1) 各自单点表达，恢复间隔的语义写在定义处并明说提高频率不是加速手段。
