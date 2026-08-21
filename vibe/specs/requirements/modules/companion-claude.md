# Companion Claude Requirements

## Scope

Claude Code 库存、App 相位、原生未读、打开与归档权威，以及 Claude 作为第二 Provider 的接入条款。

## Current Authorities And Routes

- 当前增量权威：[claude-code-companion-authority-reset/spec.md](../../260807/claude-code-companion-authority-reset/spec.md#L1)
- StopFailure 父 Turn 当前合同：[install-runtime-diagnostics/spec.md](../../260810/1155-install-runtime-diagnostics/spec.md#L168)
- 条款正文：[raw-requirement.md](../../260807/claude-code-companion-authority-reset/raw-requirement.md#L1) 与 [RAW-174](../../260810/1155-install-runtime-diagnostics/raw-requirement.md#L120)

## Primary Requirements

- [RAW-001](../claude-raw-001.md#L1) — `active`
- [RAW-002](../claude-raw-002.md#L1) — `active`
- [RAW-003](../claude-raw-003.md#L1) — `active`
- [RAW-004](../claude-raw-004.md#L1) — `active`
- [RAW-005](../claude-raw-005.md#L1) — `active`
- [RAW-006](../claude-raw-006.md#L1) — `active`
- [RAW-007](../claude-raw-007.md#L1) — `active`
- [RAW-008](../claude-raw-008.md#L1) — `active`
- [RAW-009](../claude-raw-009.md#L1) — `active`
- [RAW-010](../claude-raw-010.md#L1) — `active`
- [RAW-011](../claude-raw-011.md#L1) — `active`
- [RAW-012](../claude-raw-012.md#L1) — `active`
- [RAW-013](../claude-raw-013.md#L1) — `active`
- [RAW-014](../claude-raw-014.md#L1) — `active`
- [RAW-015](../claude-raw-015.md#L1) — `active`
- [RAW-016](../claude-raw-016.md#L1) — `active`
- [RAW-017](../claude-raw-017.md#L1) — `active`
- [RAW-018](../claude-raw-018.md#L1) — `active`
- [RAW-019](../claude-raw-019.md#L1) — `active`
- [RAW-020](../claude-raw-020.md#L1) — `active`
- [RAW-021](../claude-raw-021.md#L1) — `active`
- [RAW-022](../claude-raw-022.md#L1) — `active`
- [RAW-023](../claude-raw-023.md#L1) — `active`
- [RAW-024](../claude-raw-024.md#L1) — `active`
- [RAW-025](../claude-raw-025.md#L1) — `active`
- [RAW-026](../claude-raw-026.md#L1) — `active`
- [RAW-027](../claude-raw-027.md#L1) — `active`
- [RAW-028](../claude-raw-028.md#L1) — `active`
- [RAW-029](../claude-raw-029.md#L1) — `active`
- [RAW-030](../claude-raw-030.md#L1) — `active`
- [RAW-031](../claude-raw-031.md#L1) — `active`
- [RAW-032](../claude-raw-032.md#L1) — `active`
- [RAW-174](../claude-raw-174.md#L1) — `active`

### 编号条款

[install-runtime-diagnostics](../../260810/1155-install-runtime-diagnostics/raw-requirement.md#L120) 的 RAW-174 编号条款按 `RAW-174#n` 入册；序号沿用该文档全局序列 #89–#94。

- [RAW-174#89](../claude-raw-174-clause-089.md#L1) — Hook StopFailure 只记录 lastStopFailureAt 水位
- [RAW-174#90](../claude-raw-174-clause-090.md#L1) — 同 Turn 随后 prompt/tool/permission 必须重开父 Turn
- [RAW-174#91](../claude-raw-174-clause-091.md#L1) — App live-append 压过 Hook stopped
- [RAW-174#92](../claude-raw-174-clause-092.md#L1) — App failed/interrupted 与 SessionEnd 合同不变
- [RAW-174#93](../claude-raw-174-clause-093.md#L1) — 原生 unread 不得把 live/重开 Turn 提升为 completed
- [RAW-174#94](../claude-raw-174-clause-094.md#L1) — 自动化覆盖 StopFailure 恢复与既有 SessionEnd 合同

## Related Requirements

- 无。跨域引用在叶子的 `relations` 字段登记。

## Historical Or Migration Sources

- [来源任务](../../260807/claude-code-companion-authority-reset/raw-requirement.md#L1) 保留完整正文与过程证据。
