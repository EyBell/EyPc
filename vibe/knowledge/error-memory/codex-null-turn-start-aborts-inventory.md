---
id: eypc-codex-null-turn-start-aborts-inventory
status: verified
scope: project
fingerprint: completed-turn-null-start__required-start-validation__whole-inventory-protocol-error
first_seen: 2026-09-09
last_verified: 2026-09-09
review_after: 2027-03-09
evidence:
  - preload/index.js
  - preload/codex/inventory-turn-fields.cjs
  - tests/platform/codexAppServerBridge.test.ts
  - vibe/specs/260909/codex-null-turn-start/task-card.md
tags: [codex, inventory, nullable-timestamp, protocol-error]
---

# 可空回合时间不能中断整批库存

## Symptom

桌面实时桥已连接，但任务读取报协议不兼容。当前真实 CLI 返回 completed 回合，其开始时间为空，完成时间有效。

## Wrong Assumption

把开始时间当成每条回合的必填字段，并把单条校验失败传播为整批任务失败；把统一版本错误提示当成 CLI 过旧的证据。

## Verified Root Cause

读取器强制要求 startedAt，库存和 Domain 也各自过滤缺失该值的记录。只删除异常抛出仍不足以恢复任务展示。

## Correct Detection Order

1. 核对加载产物和连接层，区分桌面桥与 App Server 读取。
2. 仅采集状态枚举、字段类型和空值标记，定位失败分支。
3. 同时覆盖读取、合并、列表投影；保留真实完成时间，不用完成时间冒充开始时间。
4. 对单条非法状态隔离并诊断；不要放宽 RPC 或分页完整性校验。

## Prevention Rule / Latest Applicable Implementation

[读取器](../../../preload/index.js#L9625)、[库存合并](../../../preload/codex/inventory-turn-fields.cjs#L37) 与 [Domain](../../../src/domain/codex.ts#L1912) 必须允许完成时间独立支持已完成任务。预检依赖路径和 JSON 导入应使用生产模块自身语义。

## Alternative Route

- Status: verified，聚焦回归及真实 Provider 预检通过。
- Preconditions: 已完成回合缺少开始时间，具有真实完成时间。
- Steps: 保留状态/完成时间，省略未知开始时间，投影按实际回合活动时间筛选。
- Verification: 同批其他任务可读取；目标任务仍是已完成，没有合成开始时间或时长。
- Boundary: 读取兼容与产品投影；宿主安装状态见 [任务记录](../../specs/260909/codex-null-turn-start/task-card.md#L1)。
- Fallback: 若仍失败，定位具体 RPC/结构/投影分支；不要默认更新 CLI 或修 Host 发现。
